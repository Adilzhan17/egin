import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createApp } from '../src/server.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');

test('SoilCore isolates sessions, validates device telemetry, deduplicates and streams updates', {timeout:30000}, async()=>{
 const dir=mkdtempSync(tmpdir()+'/egin-soilcore-'); const service=createApp({dataDir:dir,origins:['http://localhost']}); const server=service.app.listen(0,'127.0.0.1'); service.attachUpgrade(server); await once(server,'listening'); const base='http://127.0.0.1:'+server.address().port;
 for(const user of ['alice','bob']) {service.db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(user,user,null,Date.now());service.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(user),user,Date.now()+60000);}
 const req=(path,body,user='alice',extra={})=>fetch(base+'/api/soilcore'+path,{method:body?'POST':'GET',headers:{'X-EGIN':'1','Content-Type':'application/json',Origin:'http://localhost',Cookie:'egin_session='+user,...extra},...(body?{body:JSON.stringify(body)}:{})});
 let ws;
 try {
  assert.equal((await req('/snapshot',null,'none')).status,401);
  assert.equal((await (await req('/snapshot?mode=hardware')).json()).snapshot,null);
  const device=await(await req('/devices',{})).json(); assert.ok(device.token);
  const reading={seq:1,timestamp:'2026-11-05T12:00:00Z',readings:{soil_moisture_pct:65.8,soil_temperature_c:-10.1,ec_us_cm:1000,soil_ph:5.6},source:'simulation'};
  assert.equal((await req('/ingest',reading,'none')).status,401);
  const headers={Authorization:'Bearer '+device.token};
  assert.equal((await req('/ingest',{...reading,seq:2,readings:{...reading.readings,soil_ph:200}},'none',headers)).status,400);
  ws=new WebSocket(base.replace('http','ws')+'/api/soilcore/ws?mode=hardware',{headers:{Origin:'http://localhost',Cookie:'egin_session=alice'}});const first=once(ws,'message');await once(ws,'open');
  const initial=JSON.parse((await first)[0]);assert.equal(initial.snapshot,null);
  const event=once(ws,'message');const sent=await req('/ingest',reading,'none',headers);assert.equal(sent.status,200); const pushed=JSON.parse((await event)[0]); assert.equal(pushed.snapshot.source,'hardware');assert.equal(pushed.snapshot.readings.soil_temperature_c,-10.1);
  assert.equal((await(await req('/ingest',reading,'none',headers)).json()).duplicate,true);
  assert.equal((await req('/ingest',{...reading,readings:{...reading.readings,soil_ph:6}},'none',headers)).status,409);
  assert.equal((await(await req('/history?mode=hardware')).json()).items.length,1);
  assert.equal((await(await req('/history?mode=hardware','', 'bob')).json()).items.length,0);
  assert.equal((await(await req('/snapshot?mode=hardware',null,'bob')).json()).snapshot,null);
  const seed=service.db.prepare('INSERT INTO soilcore_readings VALUES(?,?,?,?,?,?)');
  for(let seq=1;seq<=510;seq++) seed.run('bob','simulation','demo',seq,seq,JSON.stringify({seq}));
  const recent=await(await req('/history?mode=simulation',null,'bob')).json();assert.equal(recent.items.length,500);assert.equal(recent.items[0].seq,11);assert.equal(recent.items.at(-1).seq,510);
  const backfill=await(await req('/history?mode=simulation&after=8',null,'bob')).json();assert.equal(backfill.items[0].seq,9);assert.equal(backfill.items.at(-1).seq,508);assert.equal(backfill.more,true);
  assert.equal((await req('/control',{action:'scenario',value:'bogus'})).status,400);
  assert.equal((await req('/control',{action:'scenario',value:'rain'})).status,200);
 } finally {if(ws)ws.terminate();service.close();await new Promise(r=>server.close(r));service.db.close();rmSync(dir,{recursive:true,force:true});}
});
