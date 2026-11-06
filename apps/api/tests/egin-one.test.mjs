import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {createApp} from '../src/server.mjs';
import {createSimulation} from '../src/soilcore/simulation.mjs';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(read){for(let n=0;n<80;n++){const value=await read();if(value)return value;await delay(250);}throw new Error('EGIN One condition did not become true');}
test('simulation restores deterministically and normal conditions clear faults',()=>{
  const first=createSimulation(),second=createSimulation();first.command({action:'scenario',value:'rain'});first.tick(4);second.restore(first.exportState());first.tick(3);second.tick(3);assert.deepEqual(first.exportState(),second.exportState());
  first.command({action:'scenario',value:'offline'});first.command({action:'scenario',value:'sensor_offline'});first.command({action:'scenario',value:'low_battery'});first.command({action:'scenario',value:'normal'});assert.equal(first.snapshot().radio.status,'connected');assert.equal(first.snapshot().simulation.sensor_online,true);assert.ok(first.snapshot().power.battery_soc_est_pct>=35);
  assert.throws(()=>first.restore({version:2}));
});

test('isolated guest demo persists checkpoints, events and undelivered decoded samples across server restart',{timeout:60000},async()=>{
  const dir=mkdtempSync(join(tmpdir(),'egin-one-test-'));let service,server,base;
  async function start(){service=createApp({dataDir:dir,origins:['http://localhost']});server=service.app.listen(0,'127.0.0.1');service.attachUpgrade(server);await once(server,'listening');base='http://127.0.0.1:'+server.address().port;}
  async function stop(){service.close();await new Promise(resolve=>server.close(resolve));service.db.close();}
  const request=(path,token='',body)=>fetch(base+'/api/soilcore'+path,{method:body===undefined?'GET':'POST',headers:{Origin:'http://localhost',Cookie:token,'X-EGIN':'1','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const get=async(path,token)=>{const r=await request(path,token);assert.equal(r.status,200);return r.json();};
  const control=async(token,action,value)=>{const r=await request('/control',token,{action,value});assert.equal(r.status,200);return r.json();};
  let stopped=false;
  try{
    await start();const demo1=await request('/demo','',{}),demo2=await request('/demo','',{});const a=demo1.headers.get('set-cookie').split(';')[0],b=demo2.headers.get('set-cookie').split(';')[0];assert.notEqual(a,b);
    assert.equal((await request('/snapshot')).status,401);assert.equal((await request('/snapshot?mode=hardware',a)).status,401);
    const first=await waitFor(async()=>{const s=(await get('/snapshot',a)).snapshot;return s?.readings&&s;});assert.equal(first.source,'simulation');
    await control(a,'pause');const checkpoint=await control(a,'checkpoint');await control(a,'scenario','rain');const other=(await get('/snapshot',b)).snapshot;assert.equal(other.simulation.scenario,'normal');
    await control(a,'play');const beforeRestore=await waitFor(async()=>{const s=(await get('/snapshot',a)).snapshot;return s.seq>first.seq&&s;});await control(a,'pause');
    await control(a,'restore_checkpoint');const restoredState=(await get('/snapshot',a)).snapshot;assert.equal(restoredState.simulation.virtual_time,checkpoint.snapshot.simulation.virtual_time);assert.notEqual(restoredState.run_id,beforeRestore.run_id);
    await control(a,'play');await control(a,'scenario','offline');const offline=await waitFor(async()=>{const s=(await get('/snapshot',a)).snapshot;return s.radio.buffered_packets>0&&s;});const oldSeq=offline.seq;
    assert.ok((await get('/events',a)).items.some(x=>x.code==='checkpoint'));
    await stop();stopped=true;await start();stopped=false;
    const recovered=(await get('/snapshot',a)).snapshot;assert.ok(recovered.radio.buffered_packets>0);assert.equal(recovered.readings.soil_moisture_pct,offline.readings.soil_moisture_pct);
    await control(a,'scenario','restore');await waitFor(async()=>{const s=(await get('/snapshot',a)).snapshot;return s.seq>oldSeq&&s.radio.buffered_packets===0;});
    const history=await get('/history?after='+beforeRestore.seq,a);assert.ok(history.items.length>=2);assert.ok(history.items.every(x=>x.source==='simulation'&&x.seq>beforeRestore.seq));
    assert.equal((await get('/history?mode=simulation',b)).items.every(x=>x.source==='simulation'),true);
    assert.ok((await get('/events',a)).items.some(x=>x.code==='no_link_resolved'));
  }finally{if(!stopped)await stop();rmSync(dir,{recursive:true,force:true});}
});

test('hardware diagnostics accept only supplied valid power/radio and expose token-owned device data',{timeout:10000},async()=>{
  const dir=mkdtempSync(join(tmpdir(),'egin-one-hardware-')),service=createApp({dataDir:dir,origins:['http://localhost']}),server=service.app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
  service.db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('one-user','One user',null,Date.now());service.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update('one-session').digest('hex'),'one-user',Date.now()+60000);
  const request=(path,body,headers={})=>fetch(base+'/api/soilcore'+path,{method:body===undefined?'GET':'POST',headers:{Origin:'http://localhost','X-EGIN':'1','Content-Type':'application/json',Cookie:'egin_session=one-session',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  try{const device=await(await request('/devices',{name:'Поле A'})).json(),payload={seq:1,timestamp:new Date().toISOString(),sensor_error:'timeout',readings:null,power:{battery_mv:3210,battery_soc_est_pct:null,solar_input_mw:null},radio:{status:'connected',buffered_packets:0,rssi_dbm:-94}};
    assert.equal((await request('/ingest',payload,{Authorization:'Bearer '+device.token})).status,200);const snapshot=(await(await request('/snapshot?mode=hardware&device_id='+device.device_id)).json()).snapshot;assert.equal(snapshot.source,'hardware');assert.equal(snapshot.readings,null);assert.equal(snapshot.power.solar_input_mw,null);assert.equal(snapshot.sensor_error,'timeout');
    assert.equal((await request('/ingest',{...payload,seq:2,power:{...payload.power,battery_mv:99999}},{Authorization:'Bearer '+device.token})).status,400);
    assert.equal((await(await request('/devices')).json()).items[0].name,'Поле A');
  }finally{service.close();await new Promise(resolve=>server.close(resolve));service.db.close();rmSync(dir,{recursive:true,force:true});}
});
