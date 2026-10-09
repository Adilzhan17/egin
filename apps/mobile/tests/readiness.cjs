const { chromium, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const origin = process.env.EGIN_URL || 'http://localhost:4935';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Use an isolated preview');
const fixture = require('./fixtures/open-meteo.json');
const fieldData = { name: 'Моё-поле-' + 'ДлинноеНазвание'.repeat(6), latitude: 52.6, longitude: 70.4, area: 6.7, crop: 'wheat' };
const boundary = { type: 'Polygon', coordinates: [[[70.4,52.6],[70.41,52.6],[70.41,52.61],[70.4,52.61],[70.4,52.6]]] };
const details = { sourceUrl: 'https://map.gov4c.kz/egkn/', fetchedAt: new Date(fixture.current.time * 1000).toISOString(), cadastralNumber: '010170041505', address: 'Тестовый адрес', registeredAreaHa: 6.7, status: 'unknown', owners: { availability: 'not_provided', items: [] }, encumbrances: { availability: 'not_provided', items: [] } };
const field = data => ({ key: 'guest:land', id: 'land', owner: 'guest', kind: 'field', data });
async function write(page, records, select) {
 await page.evaluate(async ({ records, select }) => {
  const db = await new Promise((resolve, reject) => { const r = indexedDB.open('egin-workspace-v1', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  await new Promise((resolve, reject) => {
   const tx = db.transaction(['records','meta'], 'readwrite');
   for (const record of records) tx.objectStore('records').put({ version: 0, localRevision: Date.now(), updated: new Date().toISOString(), dirty: false, deleted: false, ...record });
   if (select) tx.objectStore('meta').put({ key: 'selectedField', value: select });
   tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
  db.close(); window.dispatchEvent(new Event('egin-data'));
 }, { records, select });
}
(async () => {
 const browser = await chromium.launch({ args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
 try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block' });
  let hold = false; const pending = [];
  await context.route('https://api.open-meteo.com/**', async route => { if (hold) await new Promise(resolve => pending.push(resolve)); await route.fulfill({ json: fixture }).catch(() => {}); });
  await context.route('**/api/**', r => r.fulfill({ json: r.request().url().includes('/news') ? require('./fixtures/news.json') : { user: null, records: [], cursor: 0, more: false } }));
  await context.route('https://eldala.kz/uploads/**', r => r.fulfill({ status: 404 }));
  const page = await context.newPage(); page.setDefaultTimeout(15000); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.clock.setFixedTime(new Date(fixture.current.time * 1000));
  await page.goto(origin);
  const readiness = page.locator('.field-readiness'), next = readiness.locator('.readiness-next');
  await expect(readiness.getByRole('heading', { name: 'Начните со своей земли', exact: true })).toBeVisible();
  await expect(next).toHaveAttribute('href', '#/fields'); await expect(next).toContainText('Найти мой участок');
  await next.click(); await expect(page).toHaveURL(/#\/fields$/);
  await page.getByRole('navigation').getByRole('link', { name: 'Главная', exact: true }).click();
  // Keep the new coordinate request pending while the previous location report exists.
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('egin.weather.open-meteo')))).toBe(true);
  hold = true;
  await write(page, [field(fieldData)], 'land');
  await expect(readiness.locator('.readiness-field strong')).toHaveText(fieldData.name);
  await expect(next).toContainText('Добавить границы участка');
  await expect(readiness.locator('.readiness-sources')).toContainText('Сохранена точка · границ пока нет');
  await expect.poll(() => pending.length).toBeGreaterThan(0);
  await expect(readiness.locator('.readiness-sources a[href="#/weather"]')).not.toContainText('Прогноз получен');
  await expect(readiness.locator('.readiness-sources a[href="#/weather"]')).toContainText('Загружаем для этого участка');
  hold = false; pending.splice(0).forEach(resolve => resolve());
  await expect(readiness.locator('.readiness-sources a[href="#/weather"]')).toContainText('Прогноз получен');
  const parcel = { ...fieldData, boundary, cadastre: { number: details.cadastralNumber, source: 'public-map', importedAt: details.fetchedAt } };
  await write(page, [field(parcel)]);
  await expect(next).toContainText('Загрузить сведения ЕГКН');
  await expect(next).toHaveAttribute('href', '#/fields');
  parcel.cadastre.details = details;
  await write(page, [field(parcel)]);
  await expect(readiness.locator('.readiness-sources')).toContainText('ЕГКН · получено');
  await expect(next).toContainText('Подготовить подключение датчика');
  await expect(next).toHaveAttribute('href', '#/settings/sensors');
  await expect(next).toContainText('Приём показаний ещё в разработке');
  const sensor = (id, owner, fieldId, deleted = false) => ({ key: owner + ':' + id, id, owner, kind: 'sensor', deleted, data: { name: id, serial: id, type: 'moisture', fieldId } });
  await write(page, [sensor('mine','guest','land'), sensor('foreign','another-user','land'), sensor('other-land','guest','other-land'), sensor('deleted','guest','land',true)]);
  await expect(readiness.locator('.readiness-sources')).toContainText('Датчики · привязано 1');
  await expect(next).toContainText('Открыть события участка'); await expect(next).toHaveAttribute('href', '#/events');
  for (const width of [320, 360, 390, 430]) {
   await page.setViewportSize({ width, height: 844 });
   assert.ok(await page.evaluate(() => document.documentElement.scrollWidth) <= width + 1, `Home readiness fits ${width}px`);
   assert.equal(await readiness.evaluate(e => e.scrollWidth > e.clientWidth + 1), false, `Readiness card fits ${width}px`);
  }
  const out=path.resolve(__dirname,'../../../test-results/polish');fs.mkdirSync(out,{recursive:true});
  await page.setViewportSize({width:390,height:844});await readiness.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'field-readiness.png')});
  for (const href of ['#/fields', '#/weather', '#/settings/sensors']) {
   await readiness.locator(`.readiness-sources a[href="${href}"]`).click();
   await expect(page).toHaveURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
   await page.getByRole('navigation').getByRole('link', { name: 'Главная', exact: true }).click();
  }
  await next.click(); await expect(page).toHaveURL(/#\/events$/); await expect(page.getByRole('heading', { name: 'Центр событий', exact: true })).toBeVisible();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth)<=390,'long parcel names must not expand Events viewport or break navigation');
  try { await page.getByRole('navigation').getByRole('link', { name: 'Главная', exact: true }).click(); } catch (e) {
    await page.screenshot({path:path.join(out,'readiness-nav-failure.png')});
    console.log(await page.evaluate(()=>{const n=document.querySelector('.mobile-nav'),m=document.querySelector('.mobile-main'),r=n.getBoundingClientRect();return{width:innerWidth,scrollWidth:document.documentElement.scrollWidth,nav:{x:r.x,y:r.y,width:r.width,height:r.height,z:getComputedStyle(n).zIndex},main:{z:getComputedStyle(m).zIndex,transform:getComputedStyle(m).transform},hit:document.elementFromPoint(r.x+40,r.y+30)?.outerHTML.slice(0,200)};}));throw e;
  }
  // A conflict takes priority over monitoring and sends the user to a real resolution screen.
  await write(page, [{ ...field(parcel), conflict: { id: 'land', kind: 'field', data: parcel, version: 2, deleted: false } }]);
  await expect(next).toContainText('Сравнить изменения участка'); await expect(next).toHaveAttribute('href', '#/settings/sync');
  assert.deepEqual(errors, []);
  console.log('PASS readiness: no field → point → contour → EGKN snapshot, wrong-location pending forecast, owner/deleted/field-scoped sensor count, useful links, conflict priority and 320–430px widths');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
