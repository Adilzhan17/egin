import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {nativeCommand} from '../src/soilcore/native.mjs';

test('a replaced decoder cannot settle a command belonging to its successor', {skip:process.platform==='win32'}, async()=>{
  const dir=mkdtempSync(join(tmpdir(),'soilcore-process-race-'));
  const executable=join(dir,'decoder');
  writeFileSync(executable,`#!${process.execPath}\nconst r=require('node:readline').createInterface({input:process.stdin});r.on('line',s=>setTimeout(()=>console.log(JSON.stringify({ok:true,command:s})),100));\n`);
  chmodSync(executable,0o700);
  const previous=process.env.SOILCORE_CLI;process.env.SOILCORE_CLI=executable;
  const item={};
  try {
    assert.deepEqual(await nativeCommand(item,'FIRST'),{ok:true,command:'FIRST'});
    const old=item.process;old.kill();item.process=null;
    const second=await Promise.race([nativeCommand(item,'SECOND'),new Promise((_,reject)=>setTimeout(()=>reject(Error('new decoder command stalled')),1500))]);
    assert.deepEqual(second,{ok:true,command:'SECOND'});
  } finally {
    item.process?.kill();
    if(previous===undefined)delete process.env.SOILCORE_CLI;else process.env.SOILCORE_CLI=previous;
    rmSync(dir,{recursive:true,force:true});
  }
});
