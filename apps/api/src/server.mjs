import express from 'express';
import { installIntegrations } from './integrations.mjs';
import { installDeveloperAPI } from './developer.mjs';
import { installQRAuth } from './qr-auth.mjs';
import { createNewsFeed } from './news.mjs';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import webpush from 'web-push';
import { pathToFileURL } from 'node:url';

const hash = value => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const fail = (status, message) => Object.assign(new Error(message), { status });
const text = (v, max = 200) => typeof v === 'string' && v.length <= max;
const idOK = v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
export function validateRecord(r) {
  if (!r || !idOK(r.id) || !['entry','field','sensor','profile'].includes(r.kind) || !Number.isInteger(r.version) || r.version < 0 || typeof r.deleted !== 'boolean') throw fail(400, 'Некорректная запись');
  const d = r.data;
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw fail(400, 'Нет содержимого записи');
  if (!r.deleted) {
    if (r.kind === 'entry' && (!text(d.title,120) || !d.title.trim() || !text(d.text,10000) || !text(d.date,10) || !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !Array.isArray(d.assets) || d.assets.length > 8 || !d.assets.every(idOK) || !text(d.fieldId,100))) throw fail(400,'Проверьте запись дневника');
    if (r.kind === 'field' && (!text(d.name,80) || !d.name.trim() || !['wheat','tomato','apple','sunflower'].includes(d.crop) || !Number.isFinite(d.latitude) || Math.abs(d.latitude)>90 || !Number.isFinite(d.longitude) || Math.abs(d.longitude)>180 || !Number.isFinite(d.area) || d.area<0 || d.area>1000000)) throw fail(400,'Проверьте координаты участка');
    if (r.kind === 'sensor' && (!text(d.name,80) || !/^[A-Za-z0-9_-]{3,64}$/.test(d.serial) || !text(d.fieldId,100) || !['moisture','temperature','weather'].includes(d.type))) throw fail(400,'Проверьте данные датчика');
    if (r.kind === 'profile' && (!text(d.name,80) || !text(d.farm,120) || !text(d.phone,40))) throw fail(400,'Проверьте профиль');
  }
  return r;
}
export function createApp({ dataDir = process.env.DATA_DIR || './data', origins = (process.env.APP_ORIGINS || 'http://localhost:4934,http://127.0.0.1:4934').split(','), rpID = process.env.RP_ID || 'localhost', portalOrigin = process.env.PORTAL_ORIGIN || 'https://api-egin.perricheno.com' } = {}) {
  mkdirSync(dataDir,{recursive:true,mode:0o700});
  const db = new DatabaseSync(`${dataDir}/egin.sqlite`);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, name TEXT NOT NULL, recovery TEXT, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS credentials(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, public_key BLOB NOT NULL, counter INTEGER NOT NULL, transports TEXT, name TEXT, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY, type TEXT, challenge TEXT, user_id TEXT, name TEXT, expires INTEGER);
    CREATE TABLE IF NOT EXISTS records(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,id TEXT NOT NULL,kind TEXT NOT NULL,data TEXT NOT NULL,deleted INTEGER NOT NULL,version INTEGER NOT NULL,seq INTEGER NOT NULL,PRIMARY KEY(user_id,id));
    CREATE TABLE IF NOT EXISTS sequence(n INTEGER); INSERT INTO sequence SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM sequence);
    CREATE TABLE IF NOT EXISTS assets(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,id TEXT NOT NULL,mime TEXT NOT NULL,data BLOB NOT NULL,PRIMARY KEY(user_id,id));
    CREATE TABLE IF NOT EXISTS subscriptions(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,endpoint TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(user_id,endpoint));
  `);
  const vapidPath = `${dataDir}/vapid.json`;
  if (!existsSync(vapidPath)) writeFileSync(vapidPath,JSON.stringify(webpush.generateVAPIDKeys()),{mode:0o600});
  const vapid = JSON.parse(readFileSync(vapidPath,'utf8'));
  webpush.setVapidDetails('mailto:admin@perricheno.com',vapid.publicKey,vapid.privateKey);
  const nativeOrigins=JSON.parse(readFileSync(new URL('./native-origins.json', import.meta.url),'utf8'));
  const expectedOrigins=[...origins,...nativeOrigins];
  const corsOrigins=[...origins,portalOrigin,'https://localhost','http://localhost','capacitor://localhost'];
  const app=express(); app.disable('x-powered-by');
  const rate = new Map();
  app.use((req,res,next)=>{
    res.set('Cache-Control','no-store'); res.set('X-Content-Type-Options','nosniff');
    const origin=req.headers.origin;
    if(req.path.startsWith('/v1/')){req.requestId=randomUUID();res.set('X-Request-ID',req.requestId);}
    const reject=(status,message,code)=>res.status(status).json(req.requestId?{success:false,errors:[{code,message}],request_id:req.requestId}:{error:message});
    if(origin === portalOrigin && !req.path.startsWith('/api/developer/') && !req.path.startsWith('/v1/') && req.path !== '/openapi.json') return res.status(403).json({error:'Этот метод доступен только в приложении EGIN'});
    if(origin && !corsOrigins.includes(origin)) return reject(403,'Недопустимый источник запроса','invalid_origin');
    if(origin) {res.set('Access-Control-Allow-Origin',origin);res.set('Vary','Origin');res.set('Access-Control-Allow-Credentials','true');}
    if(req.method==='OPTIONS') return res.set('Access-Control-Allow-Headers','Content-Type,X-EGIN,Authorization,X-EGIN-Key,If-Match').set('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS').sendStatus(204);
    if(!req.path.startsWith('/v1/') && !['GET','HEAD'].includes(req.method) && req.headers['x-egin']!=='1') return res.status(403).json({error:'Запрос отклонён'});
    const sid=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('egin_session='))?.slice(13);
    if(sid) req.user=db.prepare('SELECT users.* FROM users JOIN sessions ON sessions.user_id=users.id WHERE sessions.id=? AND expires>?').get(hash(sid),Date.now());
    req.sid=sid;
    // The reverse proxy replaces X-Real-IP; this server is not exposed directly.
    const key=(req.headers['x-real-ip']||req.socket.remoteAddress)+ (req.path.startsWith('/api/auth')||req.path.startsWith('/api/developer/qr')?'auth':'api');
    const now=Date.now(); if(rate.size>10000) for(const [k,v] of rate) if(v.until<now) rate.delete(k);
    const bucket=rate.get(key)||{n:0,until:now+60000}; if(bucket.until<now){bucket.n=0;bucket.until=now+60000;} bucket.n++;rate.set(key,bucket);
    if(bucket.n>(req.path.startsWith('/api/auth')||req.path.startsWith('/api/developer/qr')?40:500)) {res.set('Retry-After',String(Math.max(1,Math.ceil((bucket.until-now)/1000))));return reject(429,'Слишком много запросов. Повторите через минуту.','rate_limit');}
    next();
  });
  app.use(express.json({limit:'1mb'}));
  const required=(req,res,next)=>req.user?next():res.status(401).json({error:'Войдите в профиль для синхронизации'});
  const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
  const secure=origins.some(o=>o.startsWith('https:'));
  function session(res,user) { const s=token(); db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(s),user,Date.now()+30*86400000);res.setHeader('Set-Cookie',`egin_session=${s}; HttpOnly; Path=/api; SameSite=Lax; Max-Age=2592000${secure?'; Secure':''}`); }
  const publicUser=u=>u?{id:u.id,name:u.name}:null;
  function challenge(type,options,user,name) { const id=token();db.prepare('DELETE FROM challenges WHERE expires<?').run(Date.now());db.prepare('INSERT INTO challenges VALUES(?,?,?,?,?,?)').run(hash(id),type,options.challenge,user||null,name||null,Date.now()+300000);return {flow:id,options}; }
  function consume(id,type) {if(typeof id!=='string') throw fail(400,'Нет запроса входа');const c=db.prepare('DELETE FROM challenges WHERE id=? RETURNING *').get(hash(id)); if(!c||c.type!==type||c.expires<Date.now()) throw fail(400,'Запрос истёк. Попробуйте ещё раз.');return c;}
  const getNews = createNewsFeed({ dataDir });
  installIntegrations({ app, db, required, wrap });
  app.get('/api/news', wrap(async (req, res) => res.json(await getNews())));
  const { portalSession } = installDeveloperAPI({ app, db, portalOrigin, appOrigin: origins[0], validateRecord, getNews });
  installQRAuth({ app, db, required, wrap, rpID, expectedOrigins, session, challenge, consume, hash, token, secure, origin: origins[0], portalOrigin, portalSession });
  app.get('/api/health',(req,res)=>res.json({ok:true}));
  app.get('/api/session',(req,res)=>res.json({user:publicUser(req.user),rpID,origin:origins.find(o=>o.startsWith('https:'))||origins[0]}));
  app.post('/api/auth/register/options',wrap(async(req,res)=>{
    if(!req.user && (!text(req.body.name,80)||!req.body.name.trim())) throw fail(400,'Введите имя');
    const user=req.user?.id||randomUUID(), name=req.user?.name||req.body.name.trim();
    const credentials=db.prepare('SELECT id,transports FROM credentials WHERE user_id=?').all(user);
    const options=await generateRegistrationOptions({rpName:'EGIN',rpID,userID:new TextEncoder().encode(user),userName:name,userDisplayName:name,attestationType:'none',preferredAuthenticatorType:req.body.authenticator==='securityKey'?'securityKey':'localDevice',authenticatorSelection:{residentKey:'required',userVerification:'required'},excludeCredentials:credentials.map(c=>({id:c.id,transports:JSON.parse(c.transports)}))});
    res.json(challenge(req.user?'add':'register',options,user,name));
  }));
  app.post('/api/auth/register/verify',wrap(async(req,res)=>{
    const c=consume(req.body.flow,req.user?'add':'register');
    if(req.user && req.user.id!==c.user_id) throw fail(403,'Профиль изменился');
    const check=await verifyRegistrationResponse({response:req.body.response,expectedChallenge:c.challenge,expectedOrigin:expectedOrigins,expectedRPID:rpID,requireUserVerification:true});
    if(!check.verified||!check.registrationInfo) throw fail(400,'Ключ не подтверждён');
    const k=check.registrationInfo.credential;const recovery=req.user?null:token();
    db.exec('BEGIN IMMEDIATE');
    try {
      if(!req.user) db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(c.user_id,c.name,hash(recovery),Date.now());
      db.prepare('INSERT INTO credentials VALUES(?,?,?,?,?,?,?)').run(k.id,c.user_id,Buffer.from(k.publicKey),k.counter,JSON.stringify(k.transports||[]),'Ключ доступа',Date.now());
      db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
    session(res,c.user_id);res.json({user:{id:c.user_id,name:c.name},recovery});
  }));
  app.post('/api/auth/login/options',wrap(async(req,res)=>{const options=await generateAuthenticationOptions({rpID,userVerification:'required'});options.hints=['client-device'];res.json(challenge('login',options));}));
  app.post('/api/auth/login/verify',wrap(async(req,res)=>{
    const c=consume(req.body.flow,'login'), k=db.prepare('SELECT * FROM credentials WHERE id=?').get(req.body.response?.id||'');if(!k) throw fail(400,'Ключ не найден');
    const check=await verifyAuthenticationResponse({response:req.body.response,expectedChallenge:c.challenge,expectedOrigin:expectedOrigins,expectedRPID:rpID,requireUserVerification:true,credential:{id:k.id,publicKey:new Uint8Array(k.public_key),counter:k.counter,transports:JSON.parse(k.transports)}});
    if(!check.verified) throw fail(400,'Вход не подтверждён');
    db.prepare('UPDATE credentials SET counter=? WHERE id=?').run(check.authenticationInfo.newCounter,k.id);session(res,k.user_id);res.json({user:publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(k.user_id))});
  }));
  app.post('/api/auth/recover',(req,res)=>{
    const code=req.body.code;if(!text(code,100)) return res.status(400).json({error:'Введите код восстановления'});
    const user=db.prepare('SELECT * FROM users WHERE recovery=?').get(hash(code.trim()));if(!user) return res.status(400).json({error:'Код не найден или уже использован'});
    const recovery=token();db.prepare('UPDATE users SET recovery=? WHERE id=?').run(hash(recovery),user.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);session(res,user.id);res.json({user:publicUser(user),recovery});
  });
  app.post('/api/logout',(req,res)=>{if(req.sid)db.prepare('DELETE FROM sessions WHERE id=?').run(hash(req.sid));res.set('Set-Cookie',`egin_session=; HttpOnly; Path=/api; SameSite=Lax; Max-Age=0${secure?'; Secure':''}`).json({ok:true});});
  app.get('/api/passkeys',required,(req,res)=>res.json(db.prepare('SELECT id,name,created FROM credentials WHERE user_id=?').all(req.user.id)));
  app.delete('/api/passkeys/:id',required,(req,res)=>{if(db.prepare('SELECT count(*) n FROM credentials WHERE user_id=?').get(req.user.id).n<=1)return res.status(409).json({error:'Сначала добавьте другой ключ'});db.prepare('DELETE FROM credentials WHERE user_id=? AND id=?').run(req.user.id,req.params.id);res.json({ok:true});});
  app.post('/api/recovery',required,(req,res)=>{const recovery=token();db.prepare('UPDATE users SET recovery=? WHERE id=?').run(hash(recovery),req.user.id);res.json({recovery});});
  app.get('/api/sync',required,(req,res)=>{
    const cursor=Number(req.query.cursor||0);if(!Number.isSafeInteger(cursor)||cursor<0)return res.status(400).json({error:'Некорректный курсор'});
    const rows=db.prepare('SELECT * FROM records WHERE user_id=? AND seq>? ORDER BY seq LIMIT 100').all(req.user.id,cursor);
    res.json({records:rows.map(r=>({id:r.id,kind:r.kind,data:JSON.parse(r.data),deleted:!!r.deleted,version:r.version})),cursor:rows.at(-1)?.seq||cursor,more:rows.length===100});
  });
  app.post('/api/sync',required,(req,res)=>{
    if(!Array.isArray(req.body.records)||req.body.records.length>100)throw fail(400,'Слишком много записей');
    req.body.records.forEach(validateRecord);const results=[];db.exec('BEGIN IMMEDIATE');
    try{ for(const r of req.body.records){
      const old=db.prepare('SELECT * FROM records WHERE user_id=? AND id=?').get(req.user.id,r.id);
      if(old && old.kind===r.kind && old.data===JSON.stringify(r.data) && !!old.deleted===r.deleted){results.push({id:r.id,version:old.version});continue;}
      if((old?.version||0)!==r.version){results.push({id:r.id,conflict:true,remote:old?{id:old.id,kind:old.kind,data:JSON.parse(old.data),version:old.version,deleted:!!old.deleted}:null});continue;}
      if(old && old.kind!==r.kind)throw fail(400,'Тип записи нельзя изменить');
      if(r.kind==='entry'&&!r.deleted)for(const id of r.data.assets)if(!db.prepare('SELECT id FROM assets WHERE user_id=? AND id=?').get(req.user.id,id))throw fail(400,'Сначала отправьте вложения');
      if(!old && db.prepare('SELECT count(*) n FROM records WHERE user_id=?').get(req.user.id).n>=10000)throw fail(413,'Достигнут лимит записей');
      const seq=db.prepare('UPDATE sequence SET n=n+1 RETURNING n').get().n;
      const version=r.version+1;
      db.prepare('INSERT INTO records VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET data=excluded.data,deleted=excluded.deleted,version=excluded.version,seq=excluded.seq').run(req.user.id,r.id,r.kind,JSON.stringify(r.data),+r.deleted,version,seq);
      results.push({id:r.id,version});
    }db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}res.json({results});
  });
  const mimeOK=m=>/^image\/(jpeg|png|webp)$/.test(m)||/^audio\/(webm|ogg|mp4|mpeg|wav)$/.test(m);
  app.put('/api/assets/:id',required,express.raw({type:()=>true,limit:'8mb'}),(req,res)=>{
    const mime=(req.headers['content-type']||'').split(';')[0];if(!idOK(req.params.id)||!mimeOK(mime)||!Buffer.isBuffer(req.body)||!req.body.length)throw fail(400,'Неподдерживаемое вложение');
    if(db.prepare('SELECT id FROM assets WHERE user_id=? AND id=?').get(req.user.id,req.params.id))return res.json({ok:true});
    const total=db.prepare('SELECT coalesce(sum(length(data)),0) n FROM assets WHERE user_id=?').get(req.user.id).n;if(total+req.body.length>128*1024*1024)throw fail(413,'Лимит вложений профиля: 128 МБ');
    db.prepare('INSERT INTO assets VALUES(?,?,?,?)').run(req.user.id,req.params.id,mime,req.body);res.json({ok:true});
  });
  app.get('/api/assets/:id',required,(req,res)=>{const a=db.prepare('SELECT * FROM assets WHERE user_id=? AND id=?').get(req.user.id,req.params.id);if(!a)return res.sendStatus(404);res.set('Content-Type',a.mime).set('Content-Disposition','inline').send(Buffer.from(a.data));});
  app.get('/api/push/key',required,(req,res)=>res.json({key:vapid.publicKey}));
  const pushAllowed=url=>{try{const u=new URL(url);return u.protocol==='https:'&&u.port===''&&['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h));}catch{return false;}};
  app.post('/api/push/subscribe',required,(req,res)=>{const s=req.body;if(!text(s.endpoint,2048)||!pushAllowed(s.endpoint)||!text(s.keys?.p256dh,256)||!text(s.keys?.auth,100))throw fail(400,'Неизвестный push-сервис');if(db.prepare('SELECT count(*) n FROM subscriptions WHERE user_id=?').get(req.user.id).n>=20&&!db.prepare('SELECT endpoint FROM subscriptions WHERE user_id=? AND endpoint=?').get(req.user.id,s.endpoint))throw fail(413,'Достигнут лимит устройств');db.prepare('INSERT OR REPLACE INTO subscriptions VALUES(?,?,?)').run(req.user.id,s.endpoint,JSON.stringify(s));res.json({ok:true});});
  app.post('/api/push/unsubscribe',required,(req,res)=>{db.prepare('DELETE FROM subscriptions WHERE user_id=? AND endpoint=?').run(req.user.id,req.body.endpoint||'');res.json({ok:true});});
  app.post('/api/push/test',required,wrap(async(req,res)=>{const rows=db.prepare('SELECT * FROM subscriptions WHERE user_id=?').all(req.user.id);if(!rows.length)throw fail(400,'Сначала включите уведомления');let sent=0;for(const row of rows)try{await webpush.sendNotification(JSON.parse(row.data),JSON.stringify({title:'EGIN',body:'Уведомления подключены. Ваш дневник всегда под рукой.'}),{TTL:60,timeout:5000});sent++;}catch(e){if([404,410].includes(e.statusCode))db.prepare('DELETE FROM subscriptions WHERE user_id=? AND endpoint=?').run(req.user.id,row.endpoint);}if(!sent)throw fail(502,'Push-сервис не принял уведомление');res.json({sent});}));
  app.use((err,req,res,next)=>{const status=err.status||400;if(req.path.startsWith('/v1/'))return res.status(status).json({success:false,errors:[{code:status===413?'payload_too_large':'invalid_request',message:status===413?'Превышен допустимый размер данных':'Проверьте формат запроса.'}],request_id:req.requestId||randomUUID()});res.status(status>=400&&status<600?status:500).json({error:status===413?'Превышен допустимый размер данных':err.status?err.message:'Не удалось выполнить запрос. Проверьте данные и повторите.'});});
  return {app,db};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const {app}=createApp();const server=app.listen(Number(process.env.PORT||4936),'0.0.0.0',()=>console.log('EGIN API ready'));process.on('SIGTERM',()=>server.close(()=>process.exit(0)));}
