import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createApp} from '../src/server.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
test('authenticated sync isolates owners, detects conflicts, retries idempotently and protects assets',async()=>{
 const dir=mkdtempSync(tmpdir()+'/egin-test-');const {app,db}=createApp({dataDir:dir,origins:['http://localhost'],rpID:'localhost'});const server=app.listen(0);await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  for(const id of ['alice','bob']){db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id,id,hash('recovery-'+id),Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(id),id,Date.now()+60000);}
  const req=(path,body,user='alice',method=body?'POST':'GET',headers={})=>fetch(base+'/api'+path,{method,headers:{'X-EGIN':'1',Origin:'http://localhost',Cookie:'egin_session='+user,'Content-Type':'application/json',...headers},...(body?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
  assert.equal((await req('/sync',null,'none')).status,401);
  assert.equal((await req('/sync',null,'alice','GET',{Origin:'https://evil.example'})).status,403);
  const record={id:'entry1',kind:'entry',data:{title:'Initial',text:'one',date:'2026-10-08',fieldId:'',assets:[]},version:0,deleted:false};
  const result=await(await req('/sync',{records:[record]})).json();assert.equal(result.results[0].version,1);
  const retry=await(await req('/sync',{records:[record]})).json();assert.equal(retry.results[0].version,1);assert.equal(retry.results[0].conflict,undefined);
  assert.equal((await(await req('/sync',null,'bob')).json()).records.length,0);
  const stale=await(await req('/sync',{records:[{...record,data:{...record.data,title:'stale'}}]})).json();assert.equal(stale.results[0].conflict,true);
  const malicious={...record,id:'other',kind:'field',data:{name:'x',latitude:999,longitude:0,area:1,crop:'wheat'}};assert.equal((await req('/sync',{records:[malicious]})).status,400);
  const upload=await req('/assets/photo','jpeg','alice','PUT',{'Content-Type':'image/jpeg'});assert.equal(upload.status,200);
  assert.equal((await req('/assets/photo',null,'bob')).status,404);
  assert.equal((await req('/assets/evil','<svg/>','alice','PUT',{'Content-Type':'image/svg+xml'})).status,400);
  assert.equal((await req('/sync',{records:[{...record,id:'attachment',data:{...record.data,assets:['missing']}}]})).status,400);
  const del=await(await req('/sync',{records:[{...record,version:1,deleted:true}]})).json();assert.equal(del.results[0].version,2);
  const rows=await(await req('/sync?cursor=0')).json();assert.equal(rows.records[0].deleted,true);
  const recover=await req('/auth/recover',{code:'recovery-alice'},'none');assert.equal(recover.status,200);assert.ok(recover.headers.get('set-cookie').includes('HttpOnly'));assert.equal((await req('/sync',null,'alice')).status,401);
  assert.equal((await req('/auth/recover',{code:'recovery-alice'},'none')).status,400);
  const options=await(await req('/auth/register/options',{name:'Test'},'none')).json();assert.equal(options.options.rp.id,'localhost');assert.equal(options.options.authenticatorSelection.userVerification,'required');
  assert.equal((await req('/auth/register/verify',{flow:options.flow,response:{id:'forged'}},'none')).status,400);
  assert.equal((await req('/auth/register/verify',{flow:options.flow,response:{id:'forged'}},'none')).status,400);
 }finally{await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});}
});
