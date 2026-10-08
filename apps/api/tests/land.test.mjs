import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createApp, validateRecord } from '../src/server.mjs';
const hash = s => createHash('sha256').update(s).digest('hex');
const ring = [[71.1,51.1],[71.11,51.1],[71.11,51.11],[71.1,51.11],[71.1,51.1]];
const field = () => ({ id:'land-1', kind:'field', version:0, deleted:false, data:{ name:'Участок', crop:'unknown', latitude:51.105, longitude:71.105, area:77.5, boundary:{type:'Polygon',coordinates:[structuredClone(ring)]}, cadastre:{source:'geojson',number:'01:002:003:004',importedAt:'2026-10-09T00:00:00.000Z'} } });
test('field geometry rejects malformed, intersecting and falsely verified provenance while allowing legacy points', () => {
  assert.doesNotThrow(() => validateRecord(field()));
  const old = field(); delete old.data.boundary; delete old.data.cadastre; old.data.crop='wheat';
  assert.doesNotThrow(() => validateRecord(old));
  for (const bad of [
    {type:'Point',coordinates:[71,51]},
    {type:'Polygon',coordinates:[ring.slice(0,-1)]},
    {type:'Polygon',coordinates:[[[71.1,51.1],[71.11,51.11],[71.1,51.11],[71.11,51.1],[71.1,51.1]]]},
    {type:'Polygon',coordinates:[ring,ring]},
    {type:'Polygon',coordinates:[[[710000,510000],[710001,510000],[710001,510001],[710000,510000]]]},
    {type:'Polygon',coordinates:[[...ring.slice(0,2),ring[1],...ring.slice(2)]]},
    {type:'Polygon',coordinates:[[[71,51],[71.01,51],[71.02,51],[71,51]]]},
    {type:'Polygon',coordinates:[Array.from({length:2001},()=>[71,51])]}
  ]) { const row=field();row.data.boundary=bad;assert.throws(()=>validateRecord(row),e=>e.status===400); }
  for(const bad of [{source:'official',importedAt:'2026-10-09T00:00:00Z'}, {source:'demo',number:'real',importedAt:'2026-10-09T00:00:00Z'}, {source:'user',verified:true,importedAt:'2026-10-09T00:00:00Z'}, {source:'geojson',importedAt:'invalid'}]) {
    const row=field();row.data.cadastre=bad;assert.throws(()=>validateRecord(row),e=>e.status===400);
  }
});
test('boundary and source survive sync, stay private and invalid geometry does not partially write', async t => {
  const dir=mkdtempSync(tmpdir()+'/egin-land-');
  let lookups=0;
  const {app,db,close}=createApp({dataDir:dir,origins:['http://localhost'],rpID:'localhost',cadastreClientFactory:()=>({search:async number=>{lookups++;return {candidates:[{cadastralNumber:number,boundary:field().data.boundary}],ownershipVerified:false};}})});
  const server=app.listen(0);await new Promise(r=>server.once('listening',r));
  t.after(async()=>{close();await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});});
  for(const id of ['alice','bob']){db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id,id,null,Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(id),id,Date.now()+60000);}
  const request=(body,user='alice')=>fetch('http://127.0.0.1:'+server.address().port+'/api/sync',{method:body?'POST':'GET',headers:{Origin:'http://localhost','X-EGIN':'1',Cookie:'egin_session='+user,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const lookup='http://127.0.0.1:'+server.address().port+'/api/cadastre/search?number=05071008125';
  assert.equal((await fetch(lookup)).status,401);
  assert.equal((await fetch(lookup,{headers:{Origin:'https://api-egin.perricheno.com',Cookie:'egin_session=alice'}})).status,403);
  assert.equal(lookups,0);
  const preview=await fetch(lookup,{headers:{Origin:'http://localhost',Cookie:'egin_session=alice'}});
  assert.equal(preview.status,200);assert.equal((await preview.json()).ownershipVerified,false);
  assert.equal(lookups,1);assert.equal((await(await request()).json()).records.length,0);
  assert.equal((await request({records:[field()]})).status,200);
  const saved=await(await request()).json();assert.deepEqual(saved.records[0].data,field().data);
  assert.equal((await(await request(null,'bob')).json()).records.length,0);
  const valid={...field(),id:'next'},invalid={...field(),id:'invalid'};invalid.data.boundary.coordinates[0][1][0]=999;
  assert.equal((await request({records:[valid,invalid]})).status,400);
  assert.equal((await(await request()).json()).records.length,1);
});
