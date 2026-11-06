import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

test('local training OData stand supports connect, preview, import and repeat', {timeout:120000}, async()=>{
 const dir=mkdtempSync(join(tmpdir(),'egin-one-c-sandbox-test-')),port=4956,base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['scripts/one-c-demo.mjs'],{cwd:process.cwd(),env:{...process.env,EGIN_DEMO_DATA_DIR:dir,EGIN_DEMO_PORT:String(port)},stdio:'ignore',windowsHide:true});
 try {
  let ready=false;for(let i=0;i<250;i++){try{ready=(await fetch(base+'/api/health')).ok;if(ready)break;}catch{}await delay(200);}assert.ok(ready,'training server did not start');
  const request=(method,path,body,cookie)=>fetch(base+'/api'+path,{method,headers:{'X-EGIN':'1','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const reg=await request('POST','/auth/password/register',{email:'demo-test@example.com',name:'Тест',password:'Длинная учебная фраза 123'});assert.equal(reg.status,201);const cookie=reg.headers.get('set-cookie').split(';')[0];
  const connect=await request('POST','/one-c/connect',{endpoint:'https://demo-1c.example.com/odata/standard.odata/',username:'demo',password:'egin-demo-only',version:0},cookie);assert.equal(connect.status,200);const connected=await connect.json();
  const config=await request('PUT','/one-c/mapping',{version:connected.connection.version,scheduleMinutes:0,mapping:{kind:'field',collection:'Catalog_Fields',id:'Ref_Key',fields:{name:'Description',area:'Area',latitude:'Lat',longitude:'Lon'},cropDefault:'wheat',areaUnit:'ha'}},cookie);assert.equal(config.status,200);const version=(await config.json()).connection.version;
  const preview=await (await request('POST','/one-c/preview',{version},cookie)).json();assert.equal(preview.summary.created,2);
  const imported=await(await request('POST','/one-c/import',{previewId:preview.previewId},cookie)).json();assert.equal(imported.run.createdCount,2);
  const repeat=await(await request('POST','/one-c/sync',{version},cookie)).json();assert.equal(repeat.run.unchangedCount,2);assert.equal(repeat.run.createdCount,0);
  assert.match(await(await fetch(base+'/')).text(),/УЧЕБНЫЙ СТЕНД/);
 }finally{child.kill();await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(3000)]);rmSync(dir,{recursive:true,force:true});}
});
