import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseNews, sourceURL, createNewsFeed } from '../src/news.mjs';

const card = (id, date, extra = '') => `<a class="material_item" href="/novosti/zerno/${id}-test"><div class="material_item__title">Тест &amp; зерно ${id}</div><div datetime="${date}"></div><img src="/uploads/all/${id}.jpg">${extra}</a>`;
const html = `<section class="section-news">${card(1,'2026-10-07T12:00:00+0000')}${card(2,'2026-10-08T12:00:00+0000')}${card(1,'2026-10-07T12:00:00+0000')}${card(3,'invalid')}<a class="material_item" href="https://evil.test/novosti/zerno/5-test"><div class="material_item__title">Bad</div></a></section>${card(4,'2026-10-08T12:00:00Z')}`;
test('ElDala parser normalizes, deduplicates, orders dated news and rejects foreign URLs', () => {
  const items = parseNews(html);
  assert.deepEqual(items.map(item => item.id), ['2','1']);
  assert.equal(items[0].title, 'Тест & зерно 2');
  assert.equal(items[0].image, 'https://eldala.kz/uploads/all/2.jpg');
  assert.equal(items[0].category, 'Зерно');
  for (const url of ['javascript:alert(1)', 'https://eldala.kz.evil.test/novosti/zerno/1-test', 'http://eldala.kz/novosti/zerno/1-test','https://x@eldala.kz/novosti/zerno/1-test','/novosti/zerno']) assert.equal(sourceURL(url), null);
  assert.equal(sourceURL('/uploads/file.svg', true), null);
});
test('news cache shares requests, survives restart and upstream failures without inventing news', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'egin-news-'));
  let time = Date.parse('2026-10-08T14:00:00Z'), calls = 0, fail = false;
  const fetcher = async () => { calls++; if(fail) throw new Error('offline'); return new Response(html); };
  try {
    const get = createNewsFeed({dataDir, fetcher, now: () => time});
    const [first, concurrent] = await Promise.all([get(), get()]);
    assert.equal(calls,1); assert.deepEqual(first, concurrent); assert.equal(first.stale,false);
    await get(); assert.equal(calls,1);
    const restart = createNewsFeed({dataDir, fetcher, now: () => time});
    assert.deepEqual(await restart(),first); assert.equal(calls,1);
    fail=true; time+=16*60_000;
    const stale=await restart(); assert.equal(stale.stale,true); assert.deepEqual(stale.items,first.items);
    await restart(); assert.equal(calls,2,'failed sources use retry backoff');
    const empty=await mkdtemp(join(tmpdir(),'egin-news-empty-'));
    try { await assert.rejects(createNewsFeed({dataDir:empty,fetcher,now:()=>time})(), {status:503}); } finally {await rm(empty,{recursive:true,force:true});}
  } finally {await rm(dataDir,{recursive:true,force:true});}
});
test('changed source markup keeps a previously stored feed', async () => {
  const dataDir=await mkdtemp(join(tmpdir(),'egin-news-markup-'));
  let time=Date.parse('2026-10-08T14:00:00Z'), body=html;
  try {
    const get=createNewsFeed({dataDir,fetcher:async()=>new Response(body),now:()=>time});
    const first=await get();time+=16*60_000;body='<html>Maintenance</html>';
    assert.deepEqual((await get()).items,first.items);
  } finally {await rm(dataDir,{recursive:true,force:true});}
});
