import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';

test('private ONNX service bounds bodies, validates strict inputs and exposes no debug/OpenAPI routes',{skip:!process.env.MARKET_TEST_INFERENCE_URL},async()=>{
  const base=process.env.MARKET_TEST_INFERENCE_URL;
  const post=(body,headers={})=>fetch(base+'/embed',{method:'POST',headers:{'Content-Type':'application/json',...headers},body,signal:AbortSignal.timeout(15000)});
  for(const path of ['/docs','/redoc','/openapi.json'])assert.equal((await fetch(base+path)).status,404);
  assert.equal((await post('x'.repeat(512*1024+1))).status,413);
  assert.equal((await post(gzipSync('{"texts":["hello"]}'),{'Content-Encoding':'gzip'})).status,415);
  for(const value of [{texts:[1]},{texts:['x'.repeat(8001)]},{texts:['hello'],model:'/tmp/other.onnx'},{texts:Array(17).fill('hello')}])assert.equal((await post(JSON.stringify(value))).status,422);
  const accepted=await post(JSON.stringify({texts:['пшеница wheat бидай']}));assert.equal(accepted.status,200);
  const result=await accepted.json();assert.equal(result.vectors.length,1);assert.equal(result.vectors[0].length,384);assert.ok(result.vectors[0].every(Number.isFinite));
  assert.equal((await fetch(base+'/health')).status,200);
});
