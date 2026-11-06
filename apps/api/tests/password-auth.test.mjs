import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createApp } from '../src/server.mjs';

test('email registration, authentication, recovery and session isolation', {timeout:30000}, async()=>{
  const dir=mkdtempSync(join(tmpdir(),'egin-password-')),service=createApp({dataDir:dir,origins:['http://localhost']});
  const server=service.app.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}/api`;
  const call=(path,body,cookie)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','X-EGIN':'1',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
  try{
    const password='Длинная надёжная фраза 123',email='Farmer@example.com';
    assert.equal((await call('/auth/password/register',{email,name:'Айдар',password:'short'})).status,400);
    const registered=await call('/auth/password/register',{email,name:'Айдар',password});assert.equal(registered.status,201);
    const data=await registered.json(),cookie=registered.headers.get('set-cookie').split(';')[0];assert.equal(data.email_verified,false);assert.ok(data.recovery);
    const stored=service.db.prepare('SELECT * FROM password_accounts').get();assert.equal(stored.email,'farmer@example.com');assert.ok(!Buffer.from(stored.digest).includes(Buffer.from(password)));
    assert.equal((await call('/auth/password/register',{email:email.toLowerCase(),name:'Другой',password})).status,409);
    assert.equal((await call('/auth/password/login',{email,password:'неверная фраза'})).status,401);
    assert.equal((await call('/auth/password/login',{email:'nobody@example.com',password})).status,401);
    const login=await call('/auth/password/login',{email:'farmer@EXAMPLE.com',password});assert.equal(login.status,200);assert.equal((await login.json()).user.id,data.user.id);
    assert.equal((await call('/auth/password/reset',{email,code:'wrong',password:'Новая длинная фраза 456'})).status,400);
    const reset=await call('/auth/password/reset',{email,code:data.recovery,password:'Новая длинная фраза 456'});assert.equal(reset.status,200);const changed=await reset.json();assert.notEqual(changed.recovery,data.recovery);
    assert.equal((await fetch(base+'/session',{headers:{Cookie:cookie}}).then(r=>r.json())).user,null);
    assert.equal((await call('/auth/password/login',{email,password})).status,401);
    assert.equal((await call('/auth/password/login',{email,password:'Новая длинная фраза 456'})).status,200);
    assert.equal((await call('/auth/password/reset',{email,code:data.recovery,password:'Другая длинная фраза 789'})).status,400);
    const h=value=>createHash('sha256').update(value).digest('hex');
    service.db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('passkey-owner','Старый профиль',h('old-recovery-code'),Date.now());
    service.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(h('passkey-session'),'passkey-owner',Date.now()+60000);
    const attached=await call('/auth/password/attach',{email:'linked@example.com',password,code:'old-recovery-code'},'egin_session=passkey-session');assert.equal(attached.status,201);const linked=await attached.json();assert.ok(linked.recovery);
    const linkedLogin=await call('/auth/password/login',{email:'linked@example.com',password});assert.equal((await linkedLogin.json()).user.id,'passkey-owner');
    assert.equal((await call('/auth/password/attach',{email:'other@example.com',password,code:'old-recovery-code'},'egin_session=passkey-session')).status,400);
    for(let i=0;i<8;i++)assert.equal((await call('/auth/password/login',{email:'unknown-lock@example.com',password:'wrong'})).status,401);
    assert.equal((await call('/auth/password/login',{email:'unknown-lock@example.com',password:'wrong'})).status,429);
  }finally{service.close();await new Promise(resolve=>server.close(resolve));service.db.close();rmSync(dir,{recursive:true,force:true});}
});
