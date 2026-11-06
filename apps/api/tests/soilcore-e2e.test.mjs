import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { createApp } from '../src/server.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const binaries=['../../../firmware/soilcore/build/soilcore_cli','../../../firmware/soilcore/build/soilcore_cli.exe','../../../firmware/soilcore/build/Debug/soilcore_cli.exe'].map(path=>fileURLToPath(new URL(path,import.meta.url)));
const available=process.env.SOILCORE_CLI || binaries.find(existsSync);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(fn) {for(let n=0;n<80;n++){const value=await fn();if(value)return value;await pause(250);}throw new Error('Timed out waiting for SoilCore native telemetry');}

test('native firmware Modbus decoder drives API, websocket, offline buffering and history', {timeout:40000,skip:!available}, async()=>{
 const dir=mkdtempSync(tmpdir()+'/egin-soilcore-e2e-');const service=createApp({dataDir:dir,origins:['http://localhost']});const server=service.app.listen(0,'127.0.0.1');service.attachUpgrade(server);await once(server,'listening');
 service.db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('alice','Alice',null,Date.now());service.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash('alice'),'alice',Date.now()+60000);
 const base='http://127.0.0.1:'+server.address().port,headers={Origin:'http://localhost',Cookie:'egin_session=alice','X-EGIN':'1','Content-Type':'application/json'};
 const get=async(path)=>await(await fetch(base+'/api/soilcore'+path,{headers})).json();
 const command=async(body)=>{const response=await fetch(base+'/api/soilcore/control',{method:'POST',headers,body:JSON.stringify(body)});assert.equal(response.status,200);return response.json();};
 const ws=new WebSocket(base.replace('http','ws')+'/api/soilcore/ws?mode=simulation',{headers:{Origin:'http://localhost',Cookie:'egin_session=alice'}});const events=[];ws.on('message',data=>events.push(JSON.parse(data)));await once(ws,'open');
 try {
  const first=await waitFor(async()=>{const {snapshot}=await get('/snapshot');return snapshot?.firmware_status==='decoded'&&snapshot.readings&&snapshot;});
  assert.equal(first.source,'simulation');assert.ok(first.readings.soil_moisture_pct>0);
  await command({action:'scenario',value:'rain'});
  const rainy=await waitFor(async()=>{const {snapshot}=await get('/snapshot');return snapshot.readings?.soil_moisture_pct>first.readings.soil_moisture_pct&&snapshot;});
  await waitFor(async()=>events.some(e=>e.snapshot?.seq===rainy.seq));
  await command({action:'scenario',value:'offline'});
  const offline=await waitFor(async()=>{const {snapshot}=await get('/snapshot');return snapshot.radio.buffered_packets>0&&snapshot;});
  assert.ok(offline.seq>=rainy.seq);assert.ok(offline.radio.firmware_queue_packets>0);
  await command({action:'scenario',value:'restore'});
  const restored=await waitFor(async()=>{const {snapshot}=await get('/snapshot');return snapshot.radio.status==='connected'&&snapshot.radio.buffered_packets===0&&snapshot.seq>rainy.seq&&snapshot;});
  const history=await get('/history?after='+rainy.seq);assert.ok(history.items.length>=2);assert.equal(history.items.at(-1).seq,restored.seq);
 } finally {ws.terminate();service.close();await new Promise(resolve=>server.close(resolve));service.db.close();rmSync(dir,{recursive:true,force:true});}
});
