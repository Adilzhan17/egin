import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {DatabaseSync} from 'node:sqlite';
import express from 'express';
import {createApp} from '../src/server.mjs';
import {checkOData,endpointURL,publicIPv4,serviceCollections,installIntegrations} from '../src/integrations.mjs';
const config={account:'Test farm',endpoint:'https://erp.example.com/base/odata/standard.odata/',datasets:['fields','operations'],version:0};
const hash=s=>createHash('sha256').update(s).digest('hex');

test('integration drafts require app sessions, isolate owners, reject secrets and detect stale writes',async t=>{
 const dir=mkdtempSync(tmpdir()+'/egin-integrations-');
 const {app,db}=createApp({dataDir:dir,origins:['http://localhost'],portalOrigin:'http://portal.test'});
 const server=app.listen(0);await new Promise(r=>server.once('listening',r));
 t.after(async()=>{await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});});
 for(const id of ['alice','bob']){db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id,id,null,Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(id),id,Date.now()+60000);}
 const call=(method,path='',body,user='alice',headers={})=>fetch('http://127.0.0.1:'+server.address().port+'/api/integrations'+path,{method,headers:{'Content-Type':'application/json','X-EGIN':'1',Origin:'http://localhost',Cookie:'egin_session='+user,...headers},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await call('GET','',null,'guest')).status,401);
 assert.equal((await call('GET','',null,'alice',{Origin:'http://portal.test'})).status,403);
 assert.equal((await call('PUT','/one-c',config,'alice',{'X-EGIN':'0'})).status,403);
 assert.equal((await call('PUT','/unknown',config)).status,404);
 assert.equal((await call('PUT','/one-c',{...config,password:'secret'})).status,400);
 assert.equal((await call('PUT','/one-c',{...config,endpoint:'https://example.com/?key=secret'})).status,400);
 assert.equal((await call('PUT','/one-c',{...config,datasets:['credentials']})).status,400);
 for(const p of ['one-c','agrosignal','agrostream']){
   const r=await call('PUT','/'+p,config);assert.equal(r.status,200);
   const saved=await r.json();assert.equal(saved.version,1);assert.equal(saved.syncEnabled,false);assert.equal(saved.status,'draft');
 }
 assert.equal((await (await call('GET')).json()).connections.length,3);
 assert.equal((await (await call('GET','',null,'bob')).json()).connections.length,0);
 assert.equal((await call('PUT','/one-c',config)).status,409);
 assert.equal((await call('POST','/agrosignal/check',{version:1,username:'test',password:'secret'})).status,409);
 assert.equal((await call('DELETE','/one-c',{version:1},'bob')).status,200);
 assert.equal((await (await call('GET')).json()).connections.length,3);
 assert.equal((await call('DELETE','/one-c',{version:0})).status,409);
 assert.equal((await call('DELETE','/one-c',{version:1})).status,200);
 assert.equal((await (await call('GET')).json()).connections.length,2);
});

test('OData checks block private targets, URL credentials, redirects, malformed and oversized responses',async()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','172.16.2.1','192.168.1.1','169.254.169.254','100.100.100.200','198.18.0.1','0.0.0.0','224.0.0.1','::1','::ffff:127.0.0.1'])assert.equal(publicIPv4(ip),false,ip);
 for(const url of ['http://example.com','https://u:p@example.com/','https://example.com/?token=s','https://example.com/#key','https://example.com:8443/','https://127.1/','https://2130706433/','https://[::1]/','https://localhost/','https://a.local/'])assert.throws(()=>endpointURL(url),undefined,url);
 assert.equal(publicIPv4('8.8.8.8'),true);
 const auth={endpoint:config.endpoint,username:'readonly',password:'not-stored'};
 let contacted=false;
 await assert.rejects(checkOData(auth,{resolve:async()=>[{address:'8.8.8.8'},{address:'127.0.0.1'}],request:()=>{contacted=true;}}),/публичному/);
 assert.equal(contacted,false);
 const fake=(status,body)=>({resolve:async()=>[{address:'8.8.8.8'}],request:(url,options,callback)=>{
   assert.equal(url.searchParams.get('$format'),'json');assert.equal(options.agent,false);
   assert.equal(options.headers.Authorization,'Basic '+Buffer.from('readonly:not-stored').toString('base64'));
   options.lookup('erp.example.com',{},(err,address,family)=>{assert.equal(err,null);assert.equal(address,'8.8.8.8');assert.equal(family,4);});
   const req=new EventEmitter();queueMicrotask(()=>{const response=Readable.from([Buffer.from(body)]);response.statusCode=status;callback(response);});return req;
 }});
 assert.deepEqual(await checkOData(auth,fake(200,JSON.stringify({value:[{name:'Catalog_Fields',url:'Catalog_Fields'}]}))),['Catalog_Fields']);
 assert.deepEqual(serviceCollections('{"d":{"EntitySets":["Catalog_Fields"]}}'),['Catalog_Fields']);
 await assert.rejects(checkOData(auth,fake(302,'')),/перенаправляет/);
 await assert.rejects(checkOData(auth,fake(401,'secret echoed')),/отклонила/);
 await assert.rejects(checkOData(auth,fake(200,'<html>login</html>')),/не JSON/);
 await assert.rejects(checkOData(auth,fake(200,'{"ok":true}')),/не похож/);
 await assert.rejects(checkOData(auth,fake(200,'x'.repeat(1024*1024+1))),/слишком большой/);
});

test('successful check stores metadata only; failed checks clear status; concurrent edits and rate limits are respected',async t=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY);INSERT INTO users VALUES("alice")'.replace('"alice"',"'alice'"));
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={id:'alice'};next();});
 let rejectProbe=false, deferred;
 installIntegrations({app,db,required:(_req,_res,next)=>next(),wrap:fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next),probe:async args=>{
   assert.equal(args.password,'temporary-secret');
   if(deferred)await deferred;
   if(rejectProbe)throw Object.assign(new Error('Probe failed'),{status:502});
   return ['Catalog_Fields'];
 }});
 app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));
 const server=app.listen(0);await new Promise(r=>server.once('listening',r));t.after(async()=>{await new Promise(r=>server.close(r));db.close();});
 const call=(method,path,body)=>fetch('http://127.0.0.1:'+server.address().port+'/api/integrations'+path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 await call('PUT','/one-c',config);
 const auth={version:1,username:'readonly',password:'temporary-secret'};
 const checked=await(await call('POST','/one-c/check',auth)).json();assert.equal(checked.status,'access_checked');assert.equal(checked.syncEnabled,false);assert.equal(checked.version,2);
 assert.ok(!JSON.stringify(db.prepare('SELECT * FROM integrations').all()).includes('temporary-secret'));
 rejectProbe=true;assert.equal((await call('POST','/one-c/check',{...auth,version:2})).status,502);
 assert.equal((await(await call('GET','')).json()).connections[0].checkedAt,null);
 rejectProbe=false;let release;deferred=new Promise(r=>{release=r;});
 const pending=call('POST','/one-c/check',{...auth,version:2});
 await new Promise(r=>setTimeout(r,30));
 assert.equal((await call('PUT','/one-c',{...config,account:'Changed farm',version:2})).status,200);
 release();assert.equal((await pending).status,409);
 db.prepare('UPDATE integration_limits SET count=10').run();
 assert.equal((await call('POST','/one-c/check',{...auth,version:3})).status,429);
});
