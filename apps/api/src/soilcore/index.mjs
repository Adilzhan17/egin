import { randomBytes,randomUUID,createHash } from 'node:crypto';
import { WebSocketServer,WebSocket } from 'ws';
import { createSimulation } from './simulation.mjs';
import { nativeCommand,nativeExecutable } from './native.mjs';
import { hardwarePayload,error } from './schemas.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const cookie=(req,name)=>(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);
const commandNames={play:'Симуляция запущена',pause:'Симуляция приостановлена',reset:'Новый запуск симуляции',speed:'Изменена скорость времени',scenario:'Изменён сценарий',rainfall:'Изменена интенсивность дождя',checkpoint:'Состояние сохранено',restore_checkpoint:'Состояние восстановлено'};
const scenarioNames={normal:'Нормальные условия',rain:'Дождь',drought:'Засуха',salinity:'Засоление',offline:'Потеря связи',low_battery:'Низкий заряд',restore:'Восстановление связи',sensor_offline:'Ошибка сенсора'};

export function installSoilCore({app,db,required,wrap,origins,hashSession}){
  // Additive, versioned migration: existing IDs, routes and readings remain valid.
  db.exec(`CREATE TABLE IF NOT EXISTS soilcore_devices(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,token_hash TEXT NOT NULL UNIQUE,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS soilcore_readings(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,mode TEXT NOT NULL,device_id TEXT NOT NULL,seq INTEGER NOT NULL,received INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(user_id,mode,device_id,seq));
    CREATE INDEX IF NOT EXISTS soilcore_readings_history ON soilcore_readings(user_id,mode,received);
    CREATE TABLE IF NOT EXISTS soilcore_migrations(version INTEGER PRIMARY KEY,applied INTEGER NOT NULL);`);
  if(!db.prepare('SELECT 1 FROM soilcore_migrations WHERE version=2').get()){
    db.exec('BEGIN IMMEDIATE');
    try{
      if(!db.prepare('PRAGMA table_info(soilcore_devices)').all().some(c=>c.name==='name'))db.exec("ALTER TABLE soilcore_devices ADD COLUMN name TEXT NOT NULL DEFAULT 'EGIN One'");
      db.exec(`CREATE TABLE IF NOT EXISTS soilcore_demo_sessions(token_hash TEXT PRIMARY KEY,expires INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS soilcore_demo_readings(user_id TEXT NOT NULL,mode TEXT NOT NULL,device_id TEXT NOT NULL,seq INTEGER NOT NULL,received INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(user_id,mode,device_id,seq));
        CREATE TABLE IF NOT EXISTS soilcore_simulations(owner TEXT PRIMARY KEY,state TEXT NOT NULL,checkpoint TEXT,updated INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS soilcore_events(id INTEGER PRIMARY KEY AUTOINCREMENT,owner TEXT NOT NULL,mode TEXT NOT NULL,device_id TEXT,timestamp TEXT NOT NULL,virtual_time TEXT,code TEXT NOT NULL,severity TEXT NOT NULL,title TEXT NOT NULL,detail TEXT);
        CREATE INDEX IF NOT EXISTS soilcore_events_owner ON soilcore_events(owner,mode,id);`);
      db.prepare('INSERT INTO soilcore_migrations VALUES(2,?)').run(Date.now());db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
  }
  const simulations=new Map(),sockets=new Set();let closed=false;
  const isDemo=owner=>owner.startsWith('demo:');
  const table=owner=>isDemo(owner)?'soilcore_demo_readings':'soilcore_readings';
  function demoOwner(req){const token=cookie(req,'egin_one_demo');if(!token||!/^[-\w]{43}$/.test(token))return null;const digest=hash(token);return db.prepare('SELECT 1 FROM soilcore_demo_sessions WHERE token_hash=? AND expires>?').get(digest,Date.now())?'demo:'+digest:null;}
  function ownerOf(req,mode){if(req.user)return req.user.id;if(mode==='simulation'){const owner=demoOwner(req);if(owner)return owner;}throw error(401,mode==='hardware'?'Войдите в EGIN для подключения станции':'Запустите демонстрацию EGIN One');}
  const modeOf=req=>{const mode=req.query.mode||'simulation';if(!['simulation','hardware'].includes(mode))throw error(400,'Некорректный режим');return mode;};
  function event(owner,mode,code,title,severity='info',detail=null,deviceId=null,virtualTime=null){
    db.prepare('INSERT INTO soilcore_events(owner,mode,device_id,timestamp,virtual_time,code,severity,title,detail) VALUES(?,?,?,?,?,?,?,?,?)').run(owner,mode,deviceId,new Date().toISOString(),virtualTime,code,severity,title,detail);
    db.prepare('DELETE FROM soilcore_events WHERE id IN (SELECT id FROM soilcore_events WHERE owner=? ORDER BY id DESC LIMIT -1 OFFSET 1000)').run(owner);
  }
  function latest(owner,mode,deviceId=null){return db.prepare(`SELECT data,received FROM ${table(owner)} WHERE user_id=? AND mode=? AND (? IS NULL OR device_id=?) ORDER BY received DESC,seq DESC LIMIT 1`).get(owner,mode,deviceId,deviceId);}
  function save(owner,mode,snapshot){
    db.prepare(`INSERT OR IGNORE INTO ${table(owner)} VALUES(?,?,?,?,?,?)`).run(owner,mode,snapshot.device_id,snapshot.seq,Date.now(),JSON.stringify(snapshot));
    db.prepare(`DELETE FROM ${table(owner)} WHERE rowid IN (SELECT rowid FROM ${table(owner)} WHERE user_id=? AND mode=? ORDER BY received DESC,seq DESC LIMIT -1 OFFSET 5000)`).run(owner,mode);
  }
  function serialized(item){return JSON.stringify({version:1,engine:item.engine.exportState(),seq:item.seq,lastDelivered:item.lastDelivered,queue:item.queue,runId:item.runId,alerts:item.alerts,lostPackets:item.lostPackets||0});}
  function persist(owner,item){db.prepare('INSERT INTO soilcore_simulations(owner,state,updated) VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET state=excluded.state,updated=excluded.updated').run(owner,serialized(item),Date.now());}
  function restoreItem(item,saved){const state=JSON.parse(saved);if(state.version!==1)throw new Error('Unsupported saved simulation');item.engine.restore(state.engine);item.seq=state.seq;item.lastDelivered=state.lastDelivered;item.queue=(state.queue||[]).map(q=>({...q,recovered:true}));item.runId=state.runId;item.alerts=state.alerts||[];item.lostPackets=state.lostPackets||0;}
  function getSim(owner){
    let item=simulations.get(owner);
    if(!item){
      if(simulations.size>=64)throw error(503,'Симулятор занят. Повторите позже.');
      const previous=latest(owner,'simulation');item={engine:createSimulation({deviceId:'EGIN-ONE-DEMO'}),seq:previous?JSON.parse(previous.data).seq:0,lastDelivered:previous?JSON.parse(previous.data):null,queue:[],busy:false,last:Date.now(),runId:randomUUID(),alerts:[],lostPackets:0};
      const saved=db.prepare('SELECT state,checkpoint FROM soilcore_simulations WHERE owner=?').get(owner);
      if(saved){try{restoreItem(item,saved.state);}catch{event(owner,'simulation','state_error','Сохранённое состояние повреждено','warning');}item.hasCheckpoint=!!saved.checkpoint;}
      simulations.set(owner,item);persist(owner,item);void advance(owner,item,0);
    }
    item.touched=Date.now();return item;
  }
  function simulationView(item){const state=item.engine.snapshot(),delivered=item.lastDelivered;return {...state,run_id:item.runId,seq:delivered?.seq||0,readings:delivered?.readings||null,timestamp:delivered?.timestamp||null,has_checkpoint:!!item.hasCheckpoint,alerts:item.alerts,radio:{...state.radio,buffered_packets:item.queue.length,firmware_queue_packets:item.firmwareQueue??null,lost_packets:item.lostPackets||0}};}
  function hardwareSnapshot(owner,deviceId=null){
    if(isDemo(owner))return null;
    const device=deviceId?db.prepare('SELECT id FROM soilcore_devices WHERE user_id=? AND id=?').get(owner,deviceId):null;if(deviceId&&!device)throw error(404,'Станция не найдена');
    const row=db.prepare("SELECT r.data,r.received FROM soilcore_readings r JOIN soilcore_devices d ON d.id=r.device_id AND d.user_id=r.user_id WHERE r.user_id=? AND r.mode='hardware' AND (? IS NULL OR d.id=?) ORDER BY r.received DESC,r.seq DESC LIMIT 1").get(owner,deviceId,deviceId);
    if(!row)return null;const value=JSON.parse(row.data);const age=Math.max(Date.now()-row.received,Date.now()-Date.parse(value.timestamp));return {...value,received_at:new Date(row.received).toISOString(),stale:age>5*60*60*1000};
  }
  const snapshot=(owner,mode,deviceId=null)=>mode==='simulation'?simulationView(getSim(owner)):hardwareSnapshot(owner,deviceId);
  function notify(owner,mode){for(const s of sockets)if(s.owner===owner&&s.mode===mode&&s.ws.readyState===WebSocket.OPEN&&s.ws.bufferedAmount<1024*1024)s.ws.send(JSON.stringify({type:'snapshot',snapshot:snapshot(owner,mode,s.deviceId)}));}
  function detectAlerts(owner,item){
    const s=item.engine.snapshot(),alerts=[];
    if(s.radio.status==='offline')alerts.push('no_link');
    if(s.power.battery_soc_est_pct<15)alerts.push('low_battery');
    if(s.firmware_status==='sensor_error')alerts.push('sensor_error');
    if(s.firmware_status==='unavailable')alerts.push('decoder_unavailable');
    if(s.readings?.soil_moisture_pct<18)alerts.push('dry_soil');
    if(s.readings?.ec_us_cm>2000)alerts.push('ec_high');
    const names={no_link:'Связь потеряна: показания сохраняются в очереди',low_battery:'Низкий модельный заряд: энергосбережение',sensor_error:'Зонд не отвечает',decoder_unavailable:'Нативный декодер недоступен',dry_soil:'Влажность ниже демонстрационного порога 18%',ec_high:'EC выше демонстрационного порога 2000 µS/cm'};
    for(const code of alerts)if(!item.alerts.includes(code))event(owner,'simulation',code,names[code],'warning',null,s.device_id,s.simulation.virtual_time);
    for(const code of item.alerts)if(!alerts.includes(code))event(owner,'simulation',code+'_resolved','Состояние восстановлено','info',names[code],s.device_id,s.simulation.virtual_time);
    item.alerts=alerts;
  }
  async function advance(owner,item,delta){
    if(item.busy||closed||item.dead)return;item.busy=true;
    const before=serialized(item);
    try{
      item.engine.tick(Math.min(delta,3600));
      if(!item.engine.snapshot().simulation.playing){persist(owner,item);notify(owner,'simulation');return;}
      const online=item.engine.snapshot().radio.status==='connected';
      if(item.process&&item.nativeOnline!==online){const response=await nativeCommand(item,online?'ONLINE':'OFFLINE');if(closed||item.dead)return;if(response?.ok){item.nativeOnline=online;item.firmwareQueue=response.queue_count;}}
      if(!item.process&&!online&&nativeExecutable()){const response=await nativeCommand(item,'OFFLINE');if(closed||item.dead)return;if(response?.ok){item.nativeOnline=false;item.firmwareQueue=response.queue_count;}}
      const frame=item.engine.modbusFrame(),result=await nativeCommand(item,frame?`READ ${frame}`:'TIMEOUT');if(closed||item.dead)return;
      if(result&&Number.isInteger(result.queue_count))item.firmwareQueue=result.queue_count;
      item.engine.recordFirmwareResult(result);const state=item.engine.snapshot();
      db.exec('BEGIN IMMEDIATE');
      try{
        // Every queued value has already passed the native decoder. Durable outbox
        // and delivered history commit together; a CLI restart cannot discard it.
        if(online&&item.queue.length){for(const queued of item.queue){save(owner,'simulation',queued.snapshot);item.lastDelivered=queued.snapshot;}item.queue=[];}
        if(result?.ok){const reading={...state,run_id:item.runId,seq:++item.seq};if(!online){if(item.queue.length<1000)item.queue.push({snapshot:reading});else item.lostPackets++;}else{save(owner,'simulation',reading);item.lastDelivered=reading;}}
        detectAlerts(owner,item);persist(owner,item);db.exec('COMMIT');
      }catch(e){db.exec('ROLLBACK');restoreItem(item,before);item.process?.kill();item.process=null;throw e;}
      notify(owner,'simulation');
    }catch(e){if(!closed)console.error('EGIN One simulation:',e.message);}finally{item.busy=false;}
  }
  const timer=setInterval(()=>{const now=Date.now();for(const [owner,item] of simulations){if(now-item.touched>600000&&![...sockets].some(s=>s.owner===owner)){persist(owner,item);item.dead=true;item.process?.kill();simulations.delete(owner);continue;}const delta=Math.max(0,(now-item.last)/1000);item.last=now;void advance(owner,item,delta);}},2000);timer.unref();

  app.post('/api/soilcore/demo',wrap(async(req,res)=>{
    if(req.user)return res.json({authenticated:true});
    if(demoOwner(req))return res.json({authenticated:false});
    const active=db.prepare('SELECT count(*) n FROM soilcore_demo_sessions WHERE expires>?').get(Date.now()).n;if(active>=1000)throw error(503,'Лимит демонстрационных сессий');
    const token=randomBytes(32).toString('base64url');db.prepare('INSERT INTO soilcore_demo_sessions VALUES(?,?)').run(hash(token),Date.now()+86400000);
    res.cookie('egin_one_demo',token,{httpOnly:true,sameSite:'lax',secure:origins.some(x=>x.startsWith('https:')&&!x.includes('localhost')),path:'/api/soilcore',maxAge:86400000});res.json({authenticated:false});
  }));
  app.get('/api/soilcore/snapshot',wrap(async(req,res)=>{const mode=modeOf(req);res.json({snapshot:snapshot(ownerOf(req,mode),mode,req.query.device_id||null)});}));
  app.get('/api/soilcore/history',wrap(async(req,res)=>{
    const mode=modeOf(req),owner=ownerOf(req,mode),after=Number(req.query.after||0),device=req.query.device_id;
    if(!Number.isSafeInteger(after)||after<0)throw error(400,'Некорректный курсор');if(device!==undefined&&(mode!=='hardware'||typeof device!=='string'||!/^[-a-f0-9]{36}$/.test(device)))throw error(400,'Некорректное устройство');
    const initial=req.query.after===undefined;
    const rows=db.prepare(`SELECT data FROM ${table(owner)} WHERE user_id=? AND mode=? AND (? IS NULL OR device_id=?) ${initial?'':'AND seq>?'} ORDER BY ${initial?'received DESC,seq DESC':'seq ASC'} LIMIT 501`).all(...[owner,mode,device||null,device||null,...(initial?[]:[after])]);
    const page=rows.slice(0,500);if(initial)page.reverse();res.json({items:page.map(r=>JSON.parse(r.data)),more:rows.length>500});
  }));
  app.get('/api/soilcore/events',wrap(async(req,res)=>{const mode=modeOf(req),owner=ownerOf(req,mode);res.json({items:db.prepare('SELECT * FROM soilcore_events WHERE owner=? AND mode=? ORDER BY id DESC LIMIT 100').all(owner,mode)});}));
  app.post('/api/soilcore/control',wrap(async(req,res)=>{
    const owner=ownerOf(req,'simulation'),item=getSim(owner);for(let i=0;item.busy&&i<100;i++)await new Promise(r=>setTimeout(r,60));if(item.busy)throw error(503,'Симулятор занят');
    const action=req.body?.action;if(!Object.hasOwn(commandNames,action))throw error(400,'Некорректная команда симуляции');
    if(action==='checkpoint'){persist(owner,item);db.prepare('UPDATE soilcore_simulations SET checkpoint=state WHERE owner=?').run(owner);item.hasCheckpoint=true;}
    else if(action==='restore_checkpoint'){const row=db.prepare('SELECT checkpoint FROM soilcore_simulations WHERE owner=?').get(owner);if(!row?.checkpoint)throw error(404,'Сохранённого состояния нет');const saved=JSON.parse(row.checkpoint);item.process?.kill();item.process=null;item.engine.restore(saved.engine);item.runId=randomUUID();item.queue=[];item.lastDelivered=saved.lastDelivered;item.alerts=[];}
    else{try{item.engine.command(req.body);}catch{throw error(400,'Некорректная команда симуляции');}if(action==='reset'){item.runId=randomUUID();item.queue=[];item.lastDelivered=null;item.process?.kill();item.process=null;}}
    const state=item.engine.snapshot();event(owner,'simulation',action,commandNames[action],'info',action==='scenario'?scenarioNames[req.body.value]:req.body.value==null?null:String(req.body.value),state.device_id,state.simulation.virtual_time);detectAlerts(owner,item);persist(owner,item);notify(owner,'simulation');res.json({snapshot:simulationView(item)});
  }));
  app.get('/api/soilcore/devices',required,wrap(async(req,res)=>{const rows=db.prepare('SELECT id AS device_id,name,created FROM soilcore_devices WHERE user_id=? ORDER BY created').all(req.user.id);res.json({items:rows.map(device=>{const s=hardwareSnapshot(req.user.id,device.device_id);return {...device,last_seen:s?.received_at||null,stale:s?.stale??true,sensor_error:s?.sensor_error||null};})});}));
  app.post('/api/soilcore/devices',required,wrap(async(req,res)=>{if(db.prepare('SELECT count(*) n FROM soilcore_devices WHERE user_id=?').get(req.user.id).n>=20)throw error(413,'Лимит устройств');const name=req.body?.name??'EGIN One';if(typeof name!=='string'||!name.trim()||name.length>80)throw error(400,'Укажите название станции');const id=randomUUID(),token=randomBytes(32).toString('base64url');db.prepare('INSERT INTO soilcore_devices(id,user_id,token_hash,created,name) VALUES(?,?,?,?,?)').run(id,req.user.id,hash(token),Date.now(),name.trim());event(req.user.id,'hardware','device_registered','Станция зарегистрирована','info',name.trim(),id);res.status(201).json({device_id:id,token});}));
  app.delete('/api/soilcore/devices/:id',required,wrap(async(req,res)=>{const result=db.prepare('DELETE FROM soilcore_devices WHERE id=? AND user_id=?').run(req.params.id,req.user.id);if(!result.changes)throw error(404,'Станция не найдена');event(req.user.id,'hardware','device_revoked','Токен станции отозван','info',null,req.params.id);notify(req.user.id,'hardware');res.json({ok:true});}));
  app.post('/api/soilcore/ingest',wrap(async(req,res)=>{
    const match=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization||''),device=match&&db.prepare('SELECT * FROM soilcore_devices WHERE token_hash=?').get(hash(match[1]));if(!device)throw error(401,'Недействительный токен устройства');
    const value=hardwarePayload(req.body,device.id),json=JSON.stringify(value),old=db.prepare("SELECT data FROM soilcore_readings WHERE user_id=? AND mode='hardware' AND device_id=? AND seq=?").get(device.user_id,device.id,value.seq);
    if(old&&old.data!==json)throw error(409,'Номер пакета уже использован');
    if(!old){const previous=hardwareSnapshot(device.user_id,device.id);save(device.user_id,'hardware',value);if(!previous||previous.stale)event(device.user_id,'hardware','device_online','Телеметрия получена','info',null,device.id);if(value.sensor_error||previous?.sensor_error)if(value.sensor_error!==previous?.sensor_error)event(device.user_id,'hardware',value.sensor_error?'sensor_error':'sensor_restored',value.sensor_error?'Ошибка сенсора':'Работа сенсора восстановлена',value.sensor_error?'warning':'info',value.sensor_error,device.id);notify(device.user_id,'hardware');}
    res.json({ok:true,duplicate:!!old,seq:value.seq});
  }));
  const wss=new WebSocketServer({noServer:true,maxPayload:1024});
  function attachUpgrade(server){server.on('upgrade',(req,socket,head)=>{
    const url=new URL(req.url,'http://localhost');if(url.pathname!=='/api/soilcore/ws')return;
    const sid=cookie(req,'egin_session'),session=sid&&db.prepare('SELECT user_id FROM sessions WHERE id=? AND expires>?').get(hashSession(sid),Date.now()),mode=url.searchParams.get('mode')||'simulation',owner=session?.user_id||(mode==='simulation'?demoOwner(req):null),deviceId=url.searchParams.get('device_id');
    if(!owner||!origins.includes(req.headers.origin)||!['simulation','hardware'].includes(mode)||sockets.size>=500||[...sockets].filter(s=>s.owner===owner).length>=5||(deviceId&&!db.prepare('SELECT 1 FROM soilcore_devices WHERE user_id=? AND id=?').get(owner,deviceId))){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
    wss.handleUpgrade(req,socket,head,ws=>{const entry={ws,owner,mode,deviceId,sid,alive:true};sockets.add(entry);ws.on('error',()=>{});ws.on('pong',()=>{entry.alive=true;});ws.on('message',()=>ws.close(1008,'read only'));ws.on('close',()=>sockets.delete(entry));ws.send(JSON.stringify({type:'snapshot',snapshot:snapshot(owner,mode,deviceId)}));});
  });}
  const heartbeat=setInterval(()=>{for(const s of sockets){const valid=isDemo(s.owner)?db.prepare('SELECT 1 FROM soilcore_demo_sessions WHERE token_hash=? AND expires>?').get(s.owner.slice(5),Date.now()):db.prepare('SELECT 1 FROM sessions WHERE id=? AND user_id=? AND expires>?').get(hashSession(s.sid),s.owner,Date.now());if(!s.alive||!valid)s.ws.terminate();else if(s.ws.readyState===WebSocket.OPEN){s.alive=false;s.ws.ping();}}
    for(const expired of db.prepare('SELECT token_hash FROM soilcore_demo_sessions WHERE expires<?').all(Date.now())){const owner='demo:'+expired.token_hash,item=simulations.get(owner);if(item){item.dead=true;item.process?.kill();}simulations.delete(owner);db.prepare('DELETE FROM soilcore_demo_readings WHERE user_id=?').run(owner);db.prepare('DELETE FROM soilcore_simulations WHERE owner=?').run(owner);db.prepare('DELETE FROM soilcore_events WHERE owner=?').run(owner);db.prepare('DELETE FROM soilcore_demo_sessions WHERE token_hash=?').run(expired.token_hash);}
  },15000);heartbeat.unref();
  return {attachUpgrade,close(){closed=true;clearInterval(timer);clearInterval(heartbeat);for(const [owner,item] of simulations){persist(owner,item);item.process?.kill();}for(const s of sockets)s.ws.terminate();wss.close();}};
}
