const { chromium, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const origin = process.env.EGIN_URL || 'http://localhost:4935';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Use an isolated preview');
const data = {
 name: 'Участок без дневника', latitude: 52, longitude: 70, area: 6.6989, crop: 'unknown',
 boundary: { type: 'Polygon', coordinates: [[[70,52],[70.01,52],[70.01,52.01],[70,52.01],[70,52]],[[70.002,52.002],[70.003,52.002],[70.003,52.003],[70.002,52.003],[70.002,52.002]]] },
 cadastre: { source: 'public-map', number: '010170041505', importedAt: '2026-10-09T00:00:00Z', details: { sourceUrl: 'https://map.gov4c.kz/egkn/', fetchedAt: '2026-10-09T00:00:00Z', cadastralNumber: '010170041505', address: 'Тестовый адрес', category: 'Земли промышленности', purpose: 'Для размещения зданий', registeredAreaHa: 6.7218, costKzt: 2459064, status: 'unknown', owners: { availability: 'not_provided', items: [] }, encumbrances: { availability: 'not_provided', items: [] } } },
};
async function seed(page, kind, id, value) {
 await page.evaluate(async ({ kind, id, value }) => {
  const db = await new Promise((resolve, reject) => { const r = indexedDB.open('egin-workspace-v1', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  await new Promise((resolve, reject) => { const tx = db.transaction('records', 'readwrite'); tx.objectStore('records').put({ key: 'guest:' + id, owner: 'guest', id, kind, data: value, deleted: false, dirty: true, version: 0, localRevision: Date.now(), updated: new Date().toISOString() }); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  db.close(); window.dispatchEvent(new Event('egin-data'));
 }, { kind, id, value });
}
async function download(page) {
 const pending = page.waitForEvent('download');
 await page.getByRole('button', { name: 'Скачать файл', exact: true }).click();
 return fs.readFile(await (await pending).path(), 'utf8');
}
(async () => {
 const browser = await chromium.launch({ args: ['--no-sandbox'] });
 try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', acceptDownloads: true });
  await context.route('https://api.open-meteo.com/**', r => r.fulfill({ json: require('./fixtures/open-meteo.json') }));
  await context.route('**/api/**', r => r.fulfill({ json: new URL(r.request().url()).pathname === '/api/session' ? { user: null, origin, rpID: 'localhost' } : {} }));
  const page = await context.newPage(); page.setDefaultTimeout(10000); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/#/settings/reports');
  const build = page.getByRole('button', { name: 'Сформировать отчёт', exact: true });
  await expect(build).toBeDisabled();
  await seed(page, 'field', 'parcel', data);
  await expect(build).toBeEnabled();
  for (const width of [320, 360, 390, 430]) { await page.setViewportSize({ width, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Report controls fit ${width}px`); }
  await build.click();
  const html = await download(page);
  for (const value of ['Участок без дневника', '010170041505', '6,7218', '6,6989', 'Не указан в публичном ответе', 'внутренних вырезов: 1', 'fill-rule="evenodd"']) assert.ok(html.includes(value), value);
  await page.getByLabel('Формат', { exact: true }).selectOption('json');
  await expect(page.getByRole('button', { name: 'Скачать файл', exact: true })).toHaveCount(0);
  await build.click();
  const json = JSON.parse(await download(page)); assert.equal(json.entries.length, 0); assert.deepEqual(json.fields[0].boundary, data.boundary); assert.equal(json.fields[0].cadastre.details.costKzt, 2459064);
  await page.getByLabel('Формат', { exact: true }).selectOption('csv-fields'); await build.click(); const csv = await download(page); assert.ok(csv.includes('010170041505')); assert.ok(csv.includes('Площадь ЕГКН'));
  await page.getByLabel('Формат', { exact: true }).selectOption('csv'); await expect(build).toBeDisabled();
  await seed(page, 'entry', 'history', { title: 'История за октябрь', text: 'Сохранённая запись', date: '2026-10-08', fieldId: 'parcel', assets: [] });
  await expect(build).toBeEnabled(); await build.click(); assert.ok((await download(page)).includes('История за октябрь'));
  await page.getByLabel('С даты', { exact: true }).fill('2026-10-09'); await expect(build).toBeDisabled();
  await page.getByLabel('Формат', { exact: true }).selectOption('html'); await expect(build).toBeEnabled();
  await build.click(); const filtered = await download(page); assert.ok(filtered.includes('Участок без дневника')); assert.ok(!filtered.includes('История за октябрь'));
  await seed(page, 'field', 'parcel', { ...data, name: 'Участок переименован' });
  await expect(page.getByRole('button', { name: 'Скачать файл', exact: true })).toHaveCount(0);
  await context.setOffline(true); await build.click(); assert.ok((await download(page)).includes('Участок переименован'));
  await context.setOffline(false);
  // A pending attachment conversion must not produce a report for a newly selected profile.
  await page.getByLabel('С даты', { exact: true }).fill('');
  await page.evaluate(async () => {
   const db = await new Promise(resolve => { const r = indexedDB.open('egin-workspace-v1', 1); r.onsuccess = () => resolve(r.result); });
   await new Promise(resolve => { const tx = db.transaction(['records', 'assets'], 'readwrite'); const request = tx.objectStore('records').get('guest:history'); request.onsuccess = () => { const row = request.result; row.data.assets = ['photo']; row.localRevision++; tx.objectStore('records').put(row); }; tx.objectStore('assets').put({ key: 'guest:photo', owner: 'guest', id: 'photo', name: 'Photo', uploaded: false, blob: new Blob(['a'], { type: 'image/jpeg' }) }); tx.oncomplete = resolve; });
   db.close(); window.dispatchEvent(new Event('egin-data'));
   const native = FileReader.prototype.readAsDataURL; FileReader.prototype.readAsDataURL = function(blob) { window.reportReadStarted = true; setTimeout(() => native.call(this, blob), 400); };
  });
  await expect(build).toBeEnabled(); await build.click(); await page.waitForFunction(() => window.reportReadStarted);
  await expect(page.getByLabel('Формат', { exact: true })).toBeDisabled();
  await page.evaluate(async () => { const db = await new Promise(resolve => { const r = indexedDB.open('egin-workspace-v1', 1); r.onsuccess = () => resolve(r.result); }); await new Promise(resolve => { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put({ key: 'owner', value: 'other-profile' }); tx.oncomplete = resolve; }); db.close(); window.dispatchEvent(new Event('egin-data')); });
  await expect(page.getByRole('button', { name: 'Сформировать отчёт', exact: true })).toBeDisabled();
  await page.waitForTimeout(600); await expect(page.getByRole('button', { name: 'Скачать файл', exact: true })).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log('PASS reports: field-only HTML/JSON/CSV, holes, 4 mobile widths, legacy history CSV, period filtering, stale export invalidation, offline generation and profile-switch cancellation');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
