import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {createApp,validateRecord} from '../src/server.mjs';
const base={id:'crop-field-1',kind:'field',version:0,deleted:false,data:{name:'Поле',latitude:51.17,longitude:71.45,area:1,crop:'wheat'}};
test('growth metadata is optional and rejects impossible dates, stages and mixed schemas',()=>{
  assert.doesNotThrow(()=>validateRecord(base));
  assert.doesNotThrow(()=>validateRecord({...base,data:{...base.data,cultivation:{seasonId:'season-1'}}}));
  for(const cultivation of [null,{}, {seasonId:'a',stage:'ripe'},{seasonId:'a',plantedOn:'2026-02-30'},{seasonId:'a',plantedOn:'2026-1-1'},{seasonId:'a',crop:'apple'}])assert.throws(()=>validateRecord({...base,data:{...base.data,cultivation}}));
});
test('the existing authenticated field store persists all crops, edits and optional periods across restart without a sensor',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'egin-crops-'));let service,server,url;
  async function start(){service=createApp({dataDir:dir,origins:['http://localhost']});server=service.app.listen(0,'127.0.0.1');await once(server,'listening');url='http://127.0.0.1:'+server.address().port;}
  async function stop(){service.close();await new Promise(r=>server.close(r));service.db.close();}
  const request=(path,body,token='crop-owner-token')=>fetch(url+'/api'+path,{method:body?'POST':'GET',headers:{'X-EGIN':'1','Content-Type':'application/json',Cookie:'egin_session='+token,Origin:'http://localhost'},...(body?{body:JSON.stringify(body)}:{})});
  try{await start();service.db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('crop-owner','Crop owner',null,Date.now());service.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update('crop-owner-token').digest('hex'),'crop-owner',Date.now()+600000);
    const crops=['wheat','apple','tomato','sunflower'];const records=crops.map((crop,i)=>({...base,id:'crop-field-'+i,data:{...base.data,crop,...(i%2?{cultivation:{seasonId:'season-'+i,stage:'mature',plantedOn:'2026-03-20'}}:{})}}));
    assert.equal((await request('/sync',{records},'invalid')).status,401);
    const saved=await request('/sync',{records});assert.equal(saved.status,200);assert.equal((await saved.json()).results.length,4);
    const first=(await(await request('/sync')).json()).records;assert.deepEqual(first.map(r=>r.data.crop),crops);assert.ok(first.every(r=>!r.data.sensorId));
    const updated={...first[0],data:{...first[0].data,crop:'sunflower',cultivation:{seasonId:'new-season',stage:'vegetative'}}};assert.equal((await request('/sync',{records:[updated]})).status,200);
    const conflict=await(await request('/sync',{records:[{...first[0],data:{...first[0].data,name:'Stale edit'}}]})).json();assert.equal(conflict.results[0].conflict,true);
    await stop();await start();const restored=(await(await request('/sync')).json()).records;const changed=restored.find(r=>r.id===updated.id);assert.equal(changed.data.crop,'sunflower');assert.equal(changed.data.cultivation.stage,'vegetative');assert.equal(changed.data.cultivation.plantedOn,undefined);assert.equal(restored.length,4);
  }finally{await stop();rmSync(dir,{recursive:true,force:true});}
});
