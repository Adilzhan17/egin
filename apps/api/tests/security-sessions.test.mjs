import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID,createHash } from 'node:crypto';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import express from 'express';
import { Pool } from 'pg';
import { createSessionManager,SESSION_IDLE_MS,MFA_MAX_MS } from '../src/security/sessions.mjs';
import { createAuthorization } from '../src/security/authorization.mjs';
import { createApp } from '../src/server.mjs';
import { installPlatform } from '../src/platform/index.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
function identities(){
  const db=new DatabaseSync(':memory:');
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,recovery TEXT,created INTEGER);
    CREATE TABLE sessions(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires INTEGER);
    CREATE TABLE developer_sessions(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires INTEGER);
    CREATE TABLE records(user_id TEXT,id TEXT,kind TEXT,data TEXT,deleted INTEGER);`);
  const users=Array.from({length:3},()=>randomUUID());
  for(const id of users)db.prepare('INSERT INTO users VALUES(?,?,NULL,?)').run(id,'Security fixture',Date.now());
  return {db,users};
}
async function listen(t,app){const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));return `http://127.0.0.1:${server.address().port}`;}

test('session rotation, bounded concurrent sessions, idle/absolute expiry and legacy assurance',t=>{
  const {db,users}=identities();t.after(()=>db.close());const manager=createSessionManager(db),user=users[0];
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash('legacy'),user,Date.now()+600000);
  assert.equal(manager.read('legacy').security.assurance,'legacy');
  assert.equal(manager.read('legacy').security.authenticatedAt,0);
  const first=manager.issue(user,'password'),second=manager.issue(user,'passkey',first);
  assert.equal(manager.read(first),null);assert.equal(manager.read(second).security.assurance,'passkey');
  for(let n=0;n<15;n++)manager.issue(user,'password');
  assert.equal(db.prepare('SELECT count(*) n FROM sessions WHERE user_id=?').get(user).n,10);
  const idle=manager.issue(user,'passkey');db.prepare('UPDATE session_security SET last_seen=? WHERE session_id=?').run(Date.now()-SESSION_IDLE_MS-1,hash(idle));
  assert.equal(manager.read(idle,{touch:true}),null,'expired session cannot extend itself');
  assert.equal(db.prepare('SELECT 1 FROM session_security WHERE session_id=?').get(hash(idle)),undefined,'cascade cleans metadata');
  const expired=manager.issue(user,'password');db.prepare('UPDATE sessions SET expires=? WHERE id=?').run(Date.now()-1,hash(expired));assert.equal(manager.read(expired),null);
  const portal=createSessionManager(db,{portal:true}),p=portal.issue(user,'passkey');
  db.prepare('UPDATE developer_session_security SET last_seen=? WHERE session_id=?').run(Date.now()-31*60000,hash(p));assert.equal(portal.read(p),null);
});

test('MFA guard reads current server state and isolates concurrent request contexts',async t=>{
  const {db,users}=identities();const manager=createSessionManager(db),auth=createAuthorization(manager.read),app=express();
  t.after(()=>db.close());app.use((req,res,next)=>{req.sid=req.headers.authorization;next();});app.use(auth.middleware);
  let enter,release;const entered=new Promise(r=>enter=r),held=new Promise(r=>release=r);
  app.get('/privileged',async(req,res,next)=>{try{if(req.query.hold){enter();await held;}else await new Promise(r=>setTimeout(r,10));auth.requireMfa(users[0]);res.json({ok:true});}catch(e){next(e);}});
  app.use((e,req,res,next)=>res.status(e.status||500).json({code:e.code}));const base=await listen(t,app);
  const password=manager.issue(users[0],'password'),recovery=manager.issue(users[0],'recovery'),other=manager.issue(users[1],'passkey'),valid=manager.issue(users[0],'passkey');
  const call=(sid,path='')=>fetch(base+'/privileged'+path,{headers:{authorization:sid,'x-mfa-verified':'true'}});
  const results=await Promise.all([password,recovery,other,valid].map(sid=>call(sid)));
  assert.deepEqual(results.map(r=>r.status),[403,403,401,200]);
  assert.equal((await results[0].json()).code,'mfa_required');
  db.prepare('UPDATE session_security SET authenticated_at=? WHERE session_id=?').run(Date.now()-MFA_MAX_MS-1,hash(valid));assert.equal((await call(valid)).status,403);
  const revoked=manager.issue(users[0],'passkey'),pending=call(revoked,'?hold=1');await entered;db.prepare('DELETE FROM sessions WHERE id=?').run(hash(revoked));release();assert.equal((await pending).status,401);
});

test('HTTP reauthentication rotates cookie, stale sessions cannot manage credentials, logout invalidates access',async t=>{
  const dataDir=mkdtempSync(join(tmpdir(),'egin-session-http-')),service=createApp({dataDir,origins:['http://localhost']});
  t.after(()=>{service.close();service.db.close();rmSync(dataDir,{recursive:true,force:true});});const base=await listen(t,service.app);
  const post=(path,body,cookie)=>fetch(base+path,{method:'POST',headers:{'X-EGIN':'1','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
  const password='long password only used in this test';
  const reg=await post('/api/auth/password/register',{name:'Owner',email:'session@example.com',password});assert.equal(reg.status,201);
  const first=reg.headers.get('set-cookie').split(';')[0],user=(await reg.json()).user;
  assert.match(reg.headers.get('set-cookie'),/HttpOnly/);assert.match(reg.headers.get('set-cookie'),/SameSite=Lax/);
  service.db.prepare('UPDATE session_security SET authenticated_at=?').run(Date.now()-11*60000);
  const stale=await post('/api/recovery',{},first);assert.equal(stale.status,403);assert.equal((await stale.json()).code,'reauth_required');
  assert.equal((await post('/api/auth/password/reauth',{password:'wrong'},first)).status,401);
  const renewed=await post('/api/auth/password/reauth',{password},first);assert.equal(renewed.status,200);const second=renewed.headers.get('set-cookie').split(';')[0];assert.notEqual(first,second);
  assert.equal((await fetch(base+'/api/passkeys',{headers:{Cookie:first}})).status,401);
  assert.equal((await post('/api/recovery',{},second)).status,200);
  // Having a valid password must not bypass an already configured passkey.
  service.db.prepare('INSERT INTO credentials VALUES(?,?,?,?,?,?,?)').run('existing-key',user.id,Buffer.from([1]),0,'[]','Existing',Date.now());
  assert.equal((await post('/api/auth/register/options',{},second)).status,403);
  assert.equal((await post('/api/recovery',{},second)).status,403);
  await post('/api/logout',{},second);assert.equal((await fetch(base+'/api/passkeys',{headers:{Cookie:second}})).status,401);
  const portal=createSessionManager(service.db,{portal:true}),portalSecret=portal.issue(user.id,'passkey'),portalCookie='egin_developer='+portalSecret;
  service.db.prepare('UPDATE developer_session_security SET authenticated_at=? WHERE session_id=?').run(Date.now()-11*60000,hash(portalSecret));
  assert.equal((await post('/api/developer/keys',{name:'Stale key',scopes:['profile:read']},portalCookie)).status,403);
  assert.equal(service.db.prepare('SELECT count(*) n FROM api_keys').get().n,0);
  service.db.prepare('UPDATE developer_session_security SET authenticated_at=? WHERE session_id=?').run(Date.now(),hash(portalSecret));
  assert.equal((await post('/api/developer/keys',{name:'Fresh key',scopes:['profile:read']},portalCookie)).status,201);
});

test('revoked sessions and API keys cannot commit an upload while the decoder is running',async t=>{
  const dataDir=mkdtempSync(join(tmpdir(),'egin-revoke-upload-'));let release,entered;
  const service=createApp({dataDir,origins:['http://localhost'],assetValidatorFactory:()=>async()=>{entered();await new Promise(r=>release=r);return {mime:'image/webp',data:Buffer.from('decoder-result')};}});
  t.after(()=>{service.close();service.db.close();rmSync(dataDir,{recursive:true,force:true});});
  const base=await listen(t,service.app),db=service.db;
  db.prepare('INSERT INTO users VALUES(?,?,NULL,?)').run('upload-owner','Owner',Date.now());
  const sid=createSessionManager(db).issue('upload-owner','password');
  const secret='egin_sk_'+'x'.repeat(43);
  db.prepare('INSERT INTO api_keys(id,user_id,name,open_key,secret_hash,hint,scopes,created,expires) VALUES(?,?,?,?,?,?,?,?,?)').run('upload-key','upload-owner','Test key','egin_pk_upload',hash(secret),'xxxx','["assets:write"]',Date.now(),Date.now()+60000);
  for(const external of [false,true]){
    const started=new Promise(r=>entered=r);
    const pending=fetch(base+(external?'/v1/assets':'/api/assets/inflight'),{method:external?'POST':'PUT',headers:{'X-EGIN':'1','Content-Type':'image/jpeg',...(external?{'X-EGIN-Key':'egin_pk_upload',Authorization:'Bearer '+secret}:{Cookie:'egin_session='+sid})},body:Buffer.from('source-image')});
    await started;
    if(external)db.prepare('UPDATE api_keys SET revoked=? WHERE id=?').run(Date.now(),'upload-key');
    else db.prepare('DELETE FROM sessions WHERE id=?').run(hash(sid));
    release();assert.equal((await pending).status,401);
    assert.equal(db.prepare('SELECT count(*) n FROM assets').get().n,0);
  }
});

test('real platform routes require MFA for admin and organization ownership, without weakening role checks',{skip:!process.env.MARKET_TEST_DATABASE_URL},async t=>{
  const root=new Pool({connectionString:process.env.MARKET_TEST_DATABASE_URL}),schema='security_mfa_'+randomUUID().replaceAll('-','');await root.query(`CREATE SCHEMA ${schema}`);
  const url=new URL(process.env.MARKET_TEST_DATABASE_URL);url.searchParams.set('options',`-c search_path=${schema},public`);
  const {db,users}=identities(),manager=createSessionManager(db),auth=createAuthorization(manager.read),app=express(),dataDir=mkdtempSync(join(tmpdir(),'egin-mfa-platform-'));
  app.use(express.json());app.use((req,res,next)=>{req.sid=req.headers.authorization;req.user=manager.read(req.sid)?.user;next();});app.use(auth.middleware);
  const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
  const platform=installPlatform({app,db,dataDir,databaseUrl:url.href,adminIds:[users[0]],wrap,required:(req,res,next)=>req.user?next():res.sendStatus(401),requireMfa:auth.requireMfa});
  t.after(async()=>{await platform.close();db.close();await root.query(`DROP SCHEMA ${schema} CASCADE`);await root.end();rmSync(dataDir,{recursive:true,force:true});});assert.equal(await platform.ready,true);
  app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message,code:e.code}));const base=await listen(t,app);
  const call=(sid,path,body)=>fetch(base+'/api/platform'+path,{method:body?'POST':'GET',headers:{authorization:sid,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const adminPassword=manager.issue(users[0],'password'),adminMfa=manager.issue(users[0],'passkey'),ownerPassword=manager.issue(users[1],'password'),ownerMfa=manager.issue(users[1],'passkey');
  assert.equal((await call(adminPassword,'/admin/audit')).status,403);
  assert.equal((await call(adminMfa,'/admin/audit')).status,200);
  assert.equal((await call(ownerMfa,'/admin/audit')).status,403,'MFA alone never grants an admin role');
  assert.equal((await call(ownerPassword,'/organizations',{name:'Farm',kind:'farmer'})).status,403);
  const created=await call(ownerMfa,'/organizations',{name:'Farm',kind:'farmer'});assert.equal(created.status,201);const {organization}=await created.json();
  assert.equal((await call(ownerPassword,'/organizations/'+organization.id)).status,403);
  assert.equal((await call(ownerMfa,'/organizations/'+organization.id)).status,200);
});
