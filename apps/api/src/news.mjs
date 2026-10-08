import { load } from 'cheerio';
import { readFile, writeFile, rename } from 'node:fs/promises';

const SOURCE = 'https://eldala.kz/';
const TTL = 15 * 60_000;
const categories = { zhivotnovodstvo: 'Животноводство', kazahstan: 'Казахстан', zerno: 'Зерно', ehlevatory: 'Элеваторы', maslichnye: 'Масличные', selhoztehnika: 'Сельхозтехника', mir: 'Мир' };
export function sourceURL(value, image = false) {
  try {
    const url = new URL(value, SOURCE);
    if (url.origin !== SOURCE.slice(0, -1) || url.username || url.password) return null;
    if (!(image ? /^\/uploads\/.+\.(jpg|jpeg|png|webp)$/i : /^\/novosti\/[^/]+\/\d+-[^/]+$/).test(url.pathname)) return null;
    url.search = ''; url.hash = '';
    return url.href;
  } catch { return null; }
}
export function parseNews(html) {
  const $ = load(html), items = new Map();
  $('.section-news .material_item').each((_, element) => {
    const card = $(element);
    const url = sourceURL(card.is('a') ? card.attr('href') : card.find('.material_item__link').attr('href'));
    const title = card.find('.material_item__title').text().replace(/\s+/g, ' ').trim().slice(0, 240);
    if (!url || !title) return;
    const previous = items.get(url);
    const stamp = card.find('[datetime]').attr('datetime');
    const date = stamp && Number.isFinite(Date.parse(stamp)) ? new Date(stamp).toISOString() : previous?.date;
    const category = card.find('.material_item__category').text().trim().slice(0, 60) || previous?.category || categories[new URL(url).pathname.split('/')[2]] || 'Агробизнес';
    items.set(url, { id: new URL(url).pathname.split('/').pop().split('-')[0], title, url, date, category, image: sourceURL(card.find('img').attr('src'), true) || previous?.image || null, source: 'ElDala.kz' });
  });
  return [...items.values()].filter(item => item.date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
}
export function createNewsFeed({ dataDir, fetcher = fetch, now = Date.now }) {
  let cache = null, pending = null, retryAt = 0;
  const path = `${dataDir}/news-cache.json`;
  const loaded = readFile(path, 'utf8').then(raw => {
    const saved = JSON.parse(raw);
    if (Array.isArray(saved.items) && saved.items.length && Number.isFinite(Date.parse(saved.updatedAt)) && saved.items.every(item => sourceURL(item.url) && (!item.image || sourceURL(item.image, true)) && Number.isFinite(Date.parse(item.date)))) cache = saved;
  }).catch(() => {});
  async function refresh() {
    try {
      const response = await fetcher(SOURCE, { signal: AbortSignal.timeout(12_000), redirect: 'error', headers: { 'User-Agent': 'EGIN/0.3 (+https://egin.perricheno.com)', Accept: 'text/html' } });
      if (!response.ok) throw new Error(`ElDala HTTP ${response.status}`);
      const reader = response.body.getReader(), chunks = []; let size = 0;
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 2_000_000) { await reader.cancel(); throw new Error('ElDala response too large'); } chunks.push(Buffer.from(value)); }
      const items = parseNews(Buffer.concat(chunks).toString('utf8'));
      if (!items.length) throw new Error('ElDala news markup unavailable');
      cache = { items, updatedAt: new Date(now()).toISOString(), source: SOURCE };
      await writeFile(`${path}.tmp`, JSON.stringify(cache), { mode: 0o600 }).then(() => rename(`${path}.tmp`, path)).catch(() => {});
    } catch (error) { console.warn('News update failed:', error.message); }
    finally { retryAt = now() + 60_000; }
  }
  return async () => {
    await loaded;
    if ((!cache || now() - Date.parse(cache.updatedAt) >= TTL) && now() >= retryAt) {
      if (!pending) pending = refresh().finally(() => { pending = null; });
      await pending;
    }
    if (!cache) throw Object.assign(new Error('Новости временно недоступны. Попробуйте позже.'), { status: 503 });
    return { ...cache, stale: now() - Date.parse(cache.updatedAt) >= TTL };
  };
}
