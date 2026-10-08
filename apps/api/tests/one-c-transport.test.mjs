import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {createOneCClient,parseMetadata,parseRows,readOneC,normalizeOneCEndpoint} from '../src/one-c-transport.mjs';

const endpoint='https://erp.example.com/base/odata/standard.odata/';
const metadata=`<?xml version="1.0"?><edmx:Edmx xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx"><edmx:DataServices><Schema xmlns="http://schemas.microsoft.com/ado/2009/11/edm" Namespace="StandardODATA" Alias="S"><EntityType Name="Base"><Property Name="Ref_Key" Type="Edm.Guid"/></EntityType><EntityType Name="Field" BaseType="S.Base"><Property Name="Наименование" Type="Edm.String"/><Property Name="Area" Type="Edm.Decimal"/><NavigationProperty Name="SecretLink" Type="Collection(S.X)"/></EntityType><EntityContainer Name="C"><EntitySet Name="Catalog_Поля" EntityType="StandardODATA.Field"/></EntityContainer></Schema></edmx:DataServices></edmx:Edmx>`;
const auth={endpoint,username:'readonly',password:'temporary-secret'};

test('1C XML metadata supports namespaces, unicode names, primitive properties and inheritance',()=>{
 assert.deepEqual(parseMetadata(metadata),[{name:'Catalog_Поля',properties:[{name:'Ref_Key',type:'Edm.Guid'},{name:'Наименование',type:'Edm.String'},{name:'Area',type:'Edm.Decimal'}]}]);
 assert.throws(()=>parseMetadata('<!DOCTYPE x SYSTEM "file:///etc/passwd">'+metadata),/Недопустимый/);
 assert.throws(()=>parseMetadata('<html>Login</html>'),/метаданные/);
 assert.throws(()=>normalizeOneCEndpoint('https://erp.example.com/login'),/standard/);
 assert.deepEqual(parseRows('{"d":{"results":[{"Ref_Key":"1"}],"__next":"?next=1"}}'),{rows:[{Ref_Key:'1'}],next:'?next=1'});
});

test('1C transport consumes server paging then probes offsets without importing a truncated collection',async()=>{
 const calls=[];
 const client=createOneCClient(auth,{read:async url=>{
  calls.push(url.href);
  if(url.pathname.endsWith('$metadata'))return metadata;
  if(url.searchParams.has('$skiptoken'))return JSON.stringify({value:[{Ref_Key:'2',Area:20}]});
  if(url.searchParams.get('$skip')==='2')return JSON.stringify({value:[]});
  return JSON.stringify({value:[{Ref_Key:'1',Area:10}],'odata.nextLink':'?$skiptoken=1&$format=json'});
 }});
 assert.equal((await client.rows('Catalog_Поля')).length,2);
 assert.equal(calls.filter(x=>x.includes('$metadata')).length,1);
 assert.ok(calls.some(x=>x.includes('%24skip=2')));
 await assert.rejects(client.rows('../private'),/имя/);
 await assert.rejects(client.rows('Catalog_Missing'),/отсутствует/);
});

test('1C paging cannot redirect credentials, loop forever or silently pass more than 1000 rows',async()=>{
 for(const next of ['https://evil.example.com/steal','/base/odata/standard.odata/Other','https://u:p@erp.example.com/base/odata/standard.odata/Catalog_%D0%9F%D0%BE%D0%BB%D1%8F']){
  const c=createOneCClient(auth,{read:async url=>url.pathname.endsWith('$metadata')?metadata:JSON.stringify({value:[{Ref_Key:'1'}],'odata.nextLink':next})});
  await assert.rejects(c.rows('Catalog_Поля'),/ссылка/);
 }
 const tooMany=createOneCClient(auth,{read:async url=>url.pathname.endsWith('$metadata')?metadata:JSON.stringify({value:Array.from({length:1001},(_,i)=>({Ref_Key:String(i)}))})});
 await assert.rejects(tooMany.rows('Catalog_Поля'),/1000/);
 const loop=createOneCClient(auth,{read:async url=>url.pathname.endsWith('$metadata')?metadata:JSON.stringify({value:[{Ref_Key:'1'}],'odata.nextLink':'?loop=1'})});
 await assert.rejects(loop.rows('Catalog_Поля'),/пагинация/);
 const sample=createOneCClient(auth,{read:async url=>url.pathname.endsWith('$metadata')?metadata:JSON.stringify({value:Array.from({length:100},(_,i)=>({Ref_Key:String(i)}))})});
 assert.equal((await sample.sample('Catalog_Поля')).length,5);
});

test('HTTPS reads pin public DNS, refuse private results and never follow redirects or expose error bodies',async()=>{
 const url=new URL('$metadata',endpoint);let requests=0;
 await assert.rejects(readOneC(url,auth,{resolve:async()=>[{address:'8.8.8.8'},{address:'169.254.169.254'}],request:()=>{requests++;}}),/публичному/);
 assert.equal(requests,0);
 function transport(status,body){return {resolve:async()=>[{address:'8.8.8.8'}],request:(url,options,callback)=>{
   assert.equal(options.agent,false);assert.ok(options.signal);assert.ok(options.headers.Authorization.startsWith('Basic '));
   options.lookup('erp.example.com',{all:true},(error,addresses)=>{assert.equal(error,null);assert.deepEqual(addresses,[{address:'8.8.8.8',family:4}]);});
   const req=new EventEmitter();queueMicrotask(()=>{const res=Readable.from([Buffer.from(body)]);res.statusCode=status;callback(res);});return req;
  }};}
 assert.equal(await readOneC(url,auth,transport(200,metadata)),metadata);
 await assert.rejects(readOneC(url,auth,transport(302,'temporary-secret')),e=>/перенаправляет/.test(e.message)&&!e.message.includes('temporary-secret'));
 await assert.rejects(readOneC(url,auth,transport(403,'temporary-secret')),e=>e.status===422&&!e.message.includes('temporary-secret'));
 await assert.rejects(readOneC(url,auth,transport(200,'a'.repeat(8*1024*1024+1))),/8 МБ/);
});
