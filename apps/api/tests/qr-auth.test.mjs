import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createApp } from '../src/server.mjs';
const hash = s => createHash('sha256').update(s).digest('hex');
test('QR is browser-bound, expiring, single-use and requires authenticated passkey approval', async () => {
 const dir=mkdtempSync(tmpdir()+'/egin-qr-');const {app,db}=createApp({dataDir:dir,origins:['http://localhost'],rpID:'localhost'});const server=app.listen(0);await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const req=(path,body,cookie='',method='POST')=>fetch(base+'/api/auth/qr'+path,{method,headers:{'Content-Type':'application/json','X-EGIN':'1',Cookie:cookie,Origin:'http://localhost'},...(method==='GET'?{}:{body:JSON.stringify(body||{})})});
 const start=async()=>{const response=await req('/start');const body=await response.json();return {body,cookie:response.headers.getSetCookie()[0].split(';')[0]};};
 try {
  db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('alice','Alice',null,Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash('phone'),'alice',Date.now()+60000);
  const a=await start();assert.match(a.body.url,/http:\/\/localhost\/#\/auth\/confirm\//);assert.equal(a.body.code.length,6);
  assert.equal((await req('/poll',{id:a.body.id})).status,403);
  assert.equal((await req('/'+a.body.id,null,'','GET')).status,401);
  assert.equal((await req('/'+a.body.id+'/options',{},'egin_session=phone')).status,409,'no approval without passkeys');
  assert.equal((await(await req('/poll',{id:a.body.id},a.cookie)).json()).status,'pending');
  assert.equal((await req('/'+a.body.id+'/verify',{flow:'forged',response:{}},'egin_session=phone')).status,400);
  db.prepare("UPDATE qr_logins SET status='approved',user_id='alice' WHERE id=?").run(hash(a.body.id));
  const stolen=await start();assert.equal((await req('/poll',{id:a.body.id},stolen.cookie)).status,403);
  const results=await Promise.all([req('/poll',{id:a.body.id},a.cookie),req('/poll',{id:a.body.id},a.cookie)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,410]);
  const success=results.find(r=>r.ok);assert.equal((await success.json()).user.id,'alice');assert.ok(success.headers.getSetCookie().some(c=>c.startsWith('egin_session=')&&c.includes('HttpOnly')));
  const b=await start();db.prepare('UPDATE qr_logins SET expires=? WHERE id=?').run(Date.now()-1,hash(b.body.id));assert.equal((await req('/poll',{id:b.body.id},b.cookie)).status,410);
  const c=await start();assert.equal((await req('/'+c.body.id+'/reject',{},'egin_session=phone')).status,200);assert.equal((await(await req('/poll',{id:c.body.id},c.cookie)).json()).status,'denied');
  const d=await start();assert.equal((await req('/cancel',{id:d.body.id},d.cookie)).status,200);assert.equal((await req('/poll',{id:d.body.id},d.cookie)).status,410);
  const csrf=await fetch(base+'/api/auth/qr/start',{method:'POST',headers:{Origin:'https://other.test','X-EGIN':'1'}});assert.equal(csrf.status,403);
 } finally {await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});}
});
