// Local training fixture. It is not 1C and cannot reach customer systems.
import express from 'express';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/server.mjs';
import { createOneCClient } from '../src/one-c-transport.mjs';

const root=fileURLToPath(new URL('../../..',import.meta.url)),dataDir=resolve(process.env.EGIN_DEMO_DATA_DIR||resolve(tmpdir(),'egin-one-c-demo')),port=Number(process.env.EGIN_DEMO_PORT||4955);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid demo port');mkdirSync(dataDir,{recursive:true});
const endpoint='https://demo-1c.example.com/odata/standard.odata/';
const metadata=`<?xml version="1.0" encoding="utf-8"?><edmx:Edmx xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx" Version="1.0"><edmx:DataServices><Schema Namespace="StandardODATA" xmlns="http://schemas.microsoft.com/ado/2009/11/edm"><EntityType Name="Catalog_Fields"><Key><PropertyRef Name="Ref_Key"/></Key><Property Name="Ref_Key" Type="Edm.Guid" Nullable="false"/><Property Name="Description" Type="Edm.String"/><Property Name="Area" Type="Edm.Decimal"/><Property Name="Lat" Type="Edm.Double"/><Property Name="Lon" Type="Edm.Double"/></EntityType><EntityContainer Name="StandardODATA"><EntitySet Name="Catalog_Fields" EntityType="StandardODATA.Catalog_Fields"/></EntityContainer></Schema></edmx:DataServices></edmx:Edmx>`;
const rows=[{Ref_Key:'00000000-0000-4000-8000-000000000001',Description:'Учебный участок Север',Area:'24.5',Lat:44.85,Lon:65.5},{Ref_Key:'00000000-0000-4000-8000-000000000002',Description:'Учебный участок Юг',Area:'17.8',Lat:44.87,Lon:65.52}];
const fixture=createServer((req,res)=>{
  if(req.method!=='GET'||req.headers.authorization!=='Basic '+Buffer.from('demo:egin-demo-only').toString('base64'))return res.writeHead(401).end();
  const url=new URL(req.url,endpoint);
  if(url.pathname==='/odata/standard.odata/$metadata')return res.writeHead(200,{'Content-Type':'application/xml'}).end(metadata);
  if(url.pathname==='/odata/standard.odata/Catalog_Fields'){const skip=Number(url.searchParams.get('$skip')||0),items=rows.slice(skip,skip+1),result={value:items};if(skip+items.length<rows.length){const next=new URL(url);next.searchParams.set('$skip',String(skip+items.length));result['odata.nextLink']=next.href;}return res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(result));}
  res.writeHead(404).end();
});
await new Promise(resolve=>fixture.listen(0,'127.0.0.1',resolve));
const service=createApp({dataDir,origins:[`http://localhost:${port}`],rpID:'localhost',oneCClientFactory:credentials=>createOneCClient(credentials,{read:async(url,{username,password,signal})=>{
  if(url.origin!==new URL(endpoint).origin||!url.pathname.startsWith('/odata/standard.odata/'))throw Object.assign(new Error('Только учебный источник'),{status:422});
  const response=await fetch(`http://127.0.0.1:${fixture.address().port}${url.pathname}${url.search}`,{signal,headers:{Authorization:'Basic '+Buffer.from(username+':'+password).toString('base64')}});
  if(!response.ok)throw Object.assign(new Error('Учебный источник отклонил доступ'),{status:422});return response.text();
}})});
const web=express();web.use((req,res,next)=>req.path.startsWith('/api/')?service.app(req,res,next):next());
const dist=resolve(root,'apps/mobile/dist'),html=readFileSync(resolve(dist,'index.html'),'utf8').replace('<body>','<body><div style="padding:10px;background:#fff0c2;color:#493500;text-align:center;font:600 14px sans-serif">УЧЕБНЫЙ СТЕНД 1С · синтетические данные · отдельный профиль</div>');
web.get('/',(_req,res)=>res.type('html').send(html));web.use(express.static(dist));
const server=web.listen(port,'127.0.0.1',()=>console.log(`Учебный стенд: http://localhost:${port} · адрес ${endpoint} · логин demo · пароль egin-demo-only`));service.attachUpgrade(server);
process.on('SIGTERM',()=>{service.close();server.close();fixture.close();});
