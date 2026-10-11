import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMarketQuery, searchPlan } from '../src/market/search.mjs';

test('Market search normalizes Cyrillic, Kazakh, keyboard layout and brand names',()=>{
  assert.ok(normalizeMarketQuery('Жон Дир').includes('john deere'));
  assert.ok(normalizeMarketQuery('Джон Дир').includes('john deere'));
  assert.ok(normalizeMarketQuery('gitybwf').includes('пшеница'));
  assert.ok(normalizeMarketQuery('Бидай').includes('пшеница'));
  assert.ok(normalizeMarketQuery('Тұқым').includes('семена'));
  assert.ok(normalizeMarketQuery('Трактор жалға алу').includes('трактор аренда'));
  assert.deepEqual(normalizeMarketQuery('   '),[]);
  assert.ok(normalizeMarketQuery('а'.repeat(500))[0].length<=160);
});

test('Market inference failure preserves lexical candidates',async()=>{
  const before=process.env.MARKET_INFERENCE_URL;
  process.env.MARKET_INFERENCE_URL='http://127.0.0.1:1';
  try {
    const result=await searchPlan({pool:{query(){throw Error('Should not reach DB');}},query:'Джон Дир'});
    assert.equal(result.mode,'lexical-fuzzy');
    assert.ok(result.variants.includes('john deere'));
    assert.deepEqual(result.semanticIds,[]);
  } finally {if(before)process.env.MARKET_INFERENCE_URL=before;else delete process.env.MARKET_INFERENCE_URL;}
});

test('Real multilingual ONNX inference: 384 finite dimensions and cross-language relevance', {skip:!process.env.MARKET_TEST_INFERENCE_URL},async()=>{
  const texts=['Пшеница 3 класса','Бидай','Семена подсолнечника','Тұқым','Трактор John Deere в аренду','Трактор жалға алу','Уборка урожая','Егін жинау'];
  const response=await fetch(process.env.MARKET_TEST_INFERENCE_URL+'/embed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({texts})});
  assert.equal(response.status,200);
  const {vectors}=await response.json();
  for(const vector of vectors){assert.equal(vector.length,384);assert.ok(vector.every(Number.isFinite));assert.ok(Math.abs(vector.reduce((s,n)=>s+n*n,0)-1)<.0001);}
  const cosine=(a,b)=>vectors[a].reduce((s,n,i)=>s+n*vectors[b][i],0);
  assert.ok(cosine(0,1)>cosine(0,4));assert.ok(cosine(2,3)>cosine(2,4));
  assert.ok(cosine(4,5)>.6);assert.ok(cosine(6,7)>.6);
});
