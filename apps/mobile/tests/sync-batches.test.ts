import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSyncBatches } from '../src/entities/workspace/sync-engine.js';
const row=(id:string,data:unknown={name:'Участок'})=>({id,kind:'field',data,version:3,deleted:false,key:`owner:${id}`,owner:'owner',localRevision:5,dirty:true});
const bytes=(value:string)=>new TextEncoder().encode(value).byteLength;
const limit=750*1024;

test('large polygon batches stay below the UTF-8 request budget without dropping or reordering rows',()=>{
 const ring=Array.from({length:1999},(_,i)=>[71+Math.cos(i/1999*Math.PI*2)*.1,51+Math.sin(i/1999*Math.PI*2)*.1]);ring.push(ring[0]);
 const records=Array.from({length:53},(_,i)=>row(`field-${i}`,{name:'Участок '+i,boundary:{type:'Polygon',coordinates:[ring]}}));
 assert.ok(bytes(JSON.stringify({records:records.slice(0,50)}))>1024*1024);
 const batches=buildSyncBatches(records);
 assert.ok(batches.length>2);
 assert.deepEqual(batches.flatMap(b=>b.records),records);
 assert.deepEqual(batches.flatMap(b=>JSON.parse(b.body).records.map((r:{id:string})=>r.id)),records.map(r=>r.id));
 for(const batch of batches){assert.ok(bytes(batch.body)<=limit);assert.ok(batch.records.length<=50);assert.equal(batch.records[0],records.find(r=>r.id===batch.records[0].id));assert.equal(batch.records[0].localRevision,5);assert.equal('localRevision' in JSON.parse(batch.body).records[0],false);}
});
test('record count remains capped at 50 and empty sync has no empty request',()=>{
 assert.deepEqual(buildSyncBatches([]),[]);
 assert.deepEqual(buildSyncBatches(Array.from({length:101},(_,i)=>row(String(i)))).map(b=>b.records.length),[50,50,1]);
});
test('byte calculation includes wrapper, commas and multibyte Cyrillic/emoji',()=>{
 const records=[row('one',{text:'Поле 🌾'}),row('two',{text:'Земля 🌱'})];
 const single=buildSyncBatches([records[0]])[0].body;
 assert.ok(bytes(single)>single.length);
 assert.equal(buildSyncBatches([records[0]],bytes(single)).length,1);
 assert.throws(()=>buildSyncBatches([records[0]],bytes(single)-1),/слишком большая/);
 const two=buildSyncBatches(records)[0].body;
 assert.equal(buildSyncBatches(records,bytes(two)).length,1);
 assert.equal(buildSyncBatches(records,bytes(two)-1).length,2);
});
test('oversized individual records report a clear failure rather than disappearing',()=>{
 const records=[row('first'),row('too-big',{text:'🌾'.repeat(200000)}),row('last')];
 assert.throws(()=>buildSyncBatches(records),/too-big.*слишком большая.*сохранена/);
 assert.equal(records.length,3);assert.ok(records.every(r=>r.dirty));assert.ok(records.every(r=>r.localRevision===5));
});
test('batch helper can be embedded in the generated service worker without module imports',()=>{
 const embedded=new Function(`return (${buildSyncBatches.toString()})`)();
 const records=[row('a',{name:'Қазақша 🌾'}),row('b')];
 assert.deepEqual(embedded(records),buildSyncBatches(records));
});
