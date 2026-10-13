import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {Pool} from 'pg';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import sharp from 'sharp';
import {installPlatform} from '../src/platform/index.mjs';

test('Platform security: in-flight ACL revocation, deferred invitations, private proof and account isolation',{skip:!process.env.MARKET_TEST_DATABASE_URL},async t=>{
 const basePool=new Pool({connectionString:process.env.MARKET_TEST_DATABASE_URL}),schema='platform_security_'+randomUUID().replaceAll('-','');await basePool.query(`CREATE SCHEMA ${schema}`);const url=new URL(process.env.MARKET_TEST_DATABASE_URL);url.searchParams.set('options',`-c search_path=${schema},public`);
 const dataDir=await mkdtemp(tmpdir()+'/egin-platform-security-'),db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT);CREATE TABLE records(user_id TEXT,id TEXT,kind TEXT,data TEXT,deleted INTEGER);');const users=Array.from({length:5},randomUUID);users.forEach(id=>db.prepare('INSERT INTO users VALUES(?,?)').run(id,'Проверка прав'));
 const app=express();app.use(express.json());app.use((req,res,next)=>{if(users.includes(req.headers['x-test-user']))req.user={id:req.headers['x-test-user']};next();});const service=installPlatform({app,db,dataDir,databaseUrl:url.href,adminIds:[users[4]],required:(req,res,next)=>req.user?next():res.status(401).json({error:'Войдите'}),wrap:f=>(req,res,next)=>Promise.resolve(f(req,res)).catch(next)});app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));assert.equal(await service.ready,true);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin=`http://127.0.0.1:${server.address().port}`,base=origin+'/api/platform';
 async function call(path,{user=users[0],body,method=body===undefined?'GET':'POST'}={}){const r=await fetch(base+path,{method,headers:{'x-test-user':user,...(body!==undefined?{'Content-Type':Buffer.isBuffer(body)?'application/octet-stream':'application/json'}:{})},body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body)});return{status:r.status,...await r.json()};}
 let org,proof,pending;
 try{
 org=(await call('/organizations',{body:{name:'Проверка отзыва доступа',kind:'buyer'}})).organization;
 const invitation=(await call(`/organizations/${org.id}/invitations`,{body:{userId:users[1],role:'admin'}})).invitation;assert.equal((await call(`/invitations/${invitation.id}/respond`,{user:users[1],body:{accept:true}})).status,200);
 pending=(await call(`/organizations/${org.id}/invitations`,{user:users[1],body:{userId:users[2],role:'admin'}})).invitation;
 const bytes=await sharp({create:{width:20,height:20,channels:3,background:'white'}}).png().toBuffer();proof=(await call(`/billing/proofs?organizationId=${org.id}&name=receipt.png`,{user:users[1],body:bytes})).proof;
 await t.test('private payment files require current authorized membership, not uploader ownership alone',async()=>{
   assert.equal((await fetch(origin+proof.url,{headers:{'x-test-user':users[1]}})).status,200);
   assert.equal((await fetch(origin+proof.url,{headers:{'x-test-user':users[2]}})).status,404);
   assert.equal((await fetch(origin+proof.url,{headers:{'x-test-user':users[4]}})).status,200);
   const viewer=(await call(`/organizations/${org.id}/invitations`,{body:{userId:users[3],role:'viewer'}})).invitation;
   assert.equal((await call(`/invitations/${viewer.id}/respond`,{user:users[3],body:{accept:true}})).status,200);
   assert.equal((await fetch(origin+proof.url,{headers:{'x-test-user':users[3]}})).status,403);
   assert.equal((await call(`/billing/proofs/${proof.id}`,{method:'DELETE',user:users[3]})).status,403);
   await call(`/organizations/${org.id}/members/${users[3]}`,{method:'DELETE'});
 });
 await t.test('owner revocation waits for authorized mutation without a membership/organization deadlock',async()=>{
   const c=await service.pool.connect();let revocation;
   try{await c.query('BEGIN');await service.requireMember(c,org.id,users[1],['admin']);
     let finished=false;revocation=call(`/organizations/${org.id}/members/${users[1]}`,{method:'DELETE'}).then(r=>{finished=true;return r;});await new Promise(r=>setTimeout(r,120));assert.equal(finished,false,'Revocation must wait for the in-flight ACL lock');
     // The old revocation code took this row before waiting on the member: cycle.
     await c.query("SET LOCAL lock_timeout='1500ms'");await c.query('SELECT id FROM business_organizations WHERE id=$1 FOR UPDATE',[org.id]);await c.query('UPDATE business_organizations SET name=$2 WHERE id=$1',[org.id,'Завершённая операция']);await c.query('COMMIT');assert.equal((await revocation).status,200);
   }finally{await c.query('ROLLBACK').catch(()=>{});c.release();if(revocation)await revocation;}
   assert.equal((await call('/organizations/'+org.id,{user:users[1]})).status,404);
   assert.equal((await fetch(origin+proof.url,{headers:{'x-test-user':users[1]}})).status,404);
 });
 await t.test('removing an administrator revokes deferred invitations issued by that administrator',async()=>{
   const result=await call(`/invitations/${pending.id}/respond`,{user:users[2],body:{accept:true}});assert.ok([403,404,409].includes(result.status),JSON.stringify(result));
   assert.equal((await service.pool.query('SELECT 1 FROM business_members WHERE organization_id=$1 AND user_id=$2',[org.id,users[2]])).rowCount,0);
 });
 await t.test('an authorized owner can reissue a deferred invitation after its former inviter is removed',async()=>{
   const renewed=await call(`/organizations/${org.id}/invitations`,{body:{userId:users[2],role:'viewer'}});assert.equal(renewed.status,201,renewed.error);assert.equal(renewed.invitation.inviter_id,users[0]);
   assert.equal((await call(`/invitations/${renewed.invitation.id}/respond`,{user:users[2],body:{accept:true}})).status,200);
   assert.equal((await call('/organizations/'+org.id,{user:users[2]})).organization.role,'viewer');
 });
 await t.test('admin organization pagination does not skip equal timestamps',async()=>{
   const sameTime=Array.from({length:53},randomUUID);await service.pool.query("INSERT INTO business_organizations(id,name,kind,owner_id,created_at) SELECT id,'Pagination fixture','farmer',$2,'2030-01-01T00:00:00Z'::timestamptz FROM unnest($1::uuid[]) id",[sameTime,users[0]]);
   const first=await call('/admin/organizations',{user:users[4]});assert.equal(first.items.length,50);assert.ok(first.nextCursor);
   const second=await call('/admin/organizations?before='+encodeURIComponent(first.nextCursor),{user:users[4]});const collected=new Set([...first.items,...second.items].map(item=>item.id));assert.ok(sameTime.every(id=>collected.has(id)));assert.equal(first.items.some(a=>second.items.some(b=>a.id===b.id)),false);
 });
 await t.test('finance/admin mutations cannot be performed by ordinary owners, viewers or wrong-account queued requests',async()=>{
   assert.equal((await call('/admin/billing')).status,403);assert.equal((await call('/admin/leads')).status,403);assert.equal((await call('/admin/audit')).status,403);
   const response=await fetch(base+'/organizations/'+org.id,{method:'PATCH',headers:{'x-test-user':users[0],'X-EGIN-Outbox-User':users[1],'Content-Type':'application/json'},body:JSON.stringify({version:org.version,name:'Cross account'})});assert.equal(response.status,403);
   assert.equal((await call('/admin/billing/trials',{body:{organizationId:org.id,planId:randomUUID(),days:30,note:'Не администратор'}})).status,403);
 });
 }finally{await new Promise(r=>{server.closeAllConnections();server.close(r);});await service.close();db.close();await basePool.query(`DROP SCHEMA ${schema} CASCADE`);await basePool.end();await rm(dataDir,{recursive:true,force:true});}
});
