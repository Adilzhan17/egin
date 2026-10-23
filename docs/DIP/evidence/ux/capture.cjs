// Reproducible screenshots of the real UI with isolated, synthetic browser data.
// Serve web dist directories on 127.0.0.1:4947 and :4948 first.
// EGIN_UX_ROOT may point to an isolated build; EGIN_UX_BUILD_METADATA records its provenance.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const root = process.env.EGIN_UX_ROOT ? path.resolve(process.env.EGIN_UX_ROOT) : path.resolve(__dirname, '../../../..');
const buildMetadata = process.env.EGIN_UX_BUILD_METADATA
  ? JSON.parse(fs.readFileSync(process.env.EGIN_UX_BUILD_METADATA, 'utf8'))
  : null;
const appRequire = createRequire(path.join(root, 'apps/mobile/package.json'));
const { chromium, expect } = appRequire('@playwright/test');
const weather = appRequire('./tests/fixtures/open-meteo.json');
const news = appRequire('./tests/fixtures/news.json');
const origin = process.env.EGIN_UX_URL || 'http://127.0.0.1:4947';
const portal = process.env.EGIN_UX_PORTAL || 'http://127.0.0.1:4948';
for (const url of [origin, portal]) {
  if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
    throw new Error('Screenshot capture is restricted to isolated local origins.');
  }
}
const out = process.env.EGIN_UX_OUTPUT ? path.resolve(process.env.EGIN_UX_OUTPUT) : __dirname;
fs.mkdirSync(out, { recursive: true });
const shots = [];
const pageErrors = [];
const now = new Date().toISOString();
async function capture(page, file, description, fullPage = false) {
  await page.screenshot({ path: path.join(out, file), fullPage, animations: 'disabled' });
  shots.push({ file, description, url: page.url(), viewport: page.viewportSize() });
}
async function seed(page) {
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('egin-workspace-v1', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = [
      { id: 'dip-fixture-field', kind: 'field', data: {
        name: 'Учебный участок · DIP', latitude: 52.6, longitude: 70.4,
        area: 6.7, crop: 'wheat',
        boundary: { type: 'Polygon', coordinates: [[[70.4, 52.6], [70.404, 52.6], [70.404, 52.6022], [70.4, 52.6022], [70.4, 52.6]]] },
        cadastre: { source: 'demo', importedAt: new Date().toISOString() }
      } },
      { id: 'dip-fixture-sensor', kind: 'sensor', data: {
        name: 'Учебный датчик', serial: 'DIP-DEMO-001', type: 'moisture', fieldId: 'dip-fixture-field'
      } },
      { id: 'dip-fixture-history', kind: 'entry', data: {
        title: 'Учебная сохранённая запись', text: 'Пример исторической записи для демонстрации интерфейса. Не результат полевого наблюдения.',
        date: new Date().toISOString().slice(0, 10), fieldId: 'dip-fixture-field', assets: []
      } }
    ];
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['records', 'meta'], 'readwrite');
      for (const record of records) tx.objectStore('records').put({
        ...record, key: 'guest:' + record.id, owner: 'guest', version: 0,
        localRevision: 1, updated: new Date().toISOString(), dirty: false, deleted: false
      });
      tx.objectStore('meta').put({ key: 'selectedField', value: 'dip-fixture-field' });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    window.dispatchEvent(new Event('egin-data'));
  });
}
async function intercept(context) {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'api.open-meteo.com') return route.fulfill({ json: weather });
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/news') return route.fulfill({ json: news });
      if (url.pathname.startsWith('/api/cadastre/')) return route.fulfill({ status: 503, json: { error: 'Basemap disabled in isolated screenshot fixture' } });
      if (url.pathname === '/api/platform/features') return route.fulfill({ json: { features: {}, admin: false, videoNoteMaxSeconds: 60 } });
      if (url.pathname.endsWith('/categories')) return route.fulfill({ json: { categories: [] } });
      if (url.pathname.startsWith('/api/market/')) return route.fulfill({ json: { items: [], total: 0, page: 1, hasMore: false, counts: {} } });
      return route.fulfill({ json: { user: null, records: [], cursor: 0, more: false } });
    }
    return route.continue();
  });
}
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.addInitScript(() => localStorage.setItem('egin.plant-lab.view', '3d'));
    await intercept(context);
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(origin);
    await expect(page.locator('.crop-canvas[data-ready="true"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Пример растения', exact: true })).toBeVisible();
    await capture(page, '01-home.png', 'Anonymous home and actual 3D crop illustration; fixture weather/news.');
    await seed(page);
    await page.goto(origin + '/#/fields');
    await expect(page.getByRole('heading', { name: 'Учебный участок · DIP', exact: true })).toBeVisible();
    await capture(page, '02-fields.png', 'Synthetic local demo polygon; basemap disabled; no cadastral or ownership claim.', true);
    await page.goto(origin + '/#/weather');
    await expect(page.locator('.weather-report')).toBeVisible();
    await expect(page.locator('.forecast-hour')).toHaveCount(24);
    await capture(page, '03-weather.png', 'Selected synthetic plot and repository Open-Meteo fixture.');
    await page.goto(origin + '/#/events');
    await expect(page.getByRole('heading', { name: 'Учебная сохранённая запись', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Новая запись', exact: true })).toHaveCount(0);
    await capture(page, '04-events.png', 'Read-only synthetic history, filters and source status.', true);
    await page.goto(origin + '/#/settings/sensors');
    await expect(page.getByText('Ожидает подключения API', { exact: true })).toBeVisible();
    await capture(page, '05-sensors.png', 'Synthetic sensor registry entry; telemetry explicitly unavailable.');
    await page.goto(origin + '/#/settings/reports');
    await expect(page.getByRole('button', { name: 'Сформировать отчёт', exact: true })).toBeVisible();
    await capture(page, '06-reports.png', 'Export controls for synthetic local plot and preserved record.', true);
    await page.goto(origin + '/#/auth');
    await expect(page.getByRole('heading', { name: 'Вход в EGIN', exact: true })).toBeVisible();
    await expect(page.getByText('В разработке · пока недоступен', { exact: true })).toBeVisible();
    await capture(page, '07-auth.png', 'Real sign-in interface only; eGov unavailable; no passkey ceremony executed.', true);
    await page.goto(origin + '/#/market');
    await expect(page.getByRole('heading', { name: 'Рынок', exact: true })).toBeVisible();
    await expect(page.getByText('Будьте первым на рынке', { exact: true })).toBeVisible();
    await capture(page, '08-market.png', 'Real catalogue interface with intentionally empty fixture listings.');
    const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await intercept(desktop);
    const docs = await desktop.newPage();
    docs.on('pageerror', error => pageErrors.push(error.message));
    await docs.goto(portal);
    await expect(docs.locator('h1').first()).toBeVisible();
    await capture(docs, '09-developer-portal.png', 'Public API reference rendered from the developer web bundle.');
    if (pageErrors.length) throw new Error('Page errors: ' + JSON.stringify(pageErrors));
    const fingerprint = relative => ({ path: relative, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex') });
    const metadata = {
      capturedAt: now, browser: browser.version(), node: process.version,
      environment: 'Isolated local HTTP servers; ' + (buildMetadata ? 'fresh web builds from the recorded source commit' : 'pre-existing dist artifacts, not rebuilt for this capture') + '; synthetic browser data; all API calls intercepted; external requests blocked except fixture weather.',
      sourceAuditCommit: buildMetadata?.sourceCommit || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
      artifactCommit: buildMetadata?.sourceCommit || 'Unverified: dist is untracked and has no embedded source commit.',
      ...(buildMetadata ? { buildProvenance: buildMetadata } : {}),
      fingerprints: ['apps/mobile/dist/index.html', 'apps/mobile/dist/sw.js', 'apps/developers/dist/index.html'].map(fingerprint),
      serviceWorkers: 'blocked; these captures do not verify PWA installation or offline reload',
      assertions: 'Real screen rendering, 3D canvas readiness, 24 forecast hours, read-only event history, registry-only sensor status, empty market state; zero page errors.',
      screenshots: shots
    };
    fs.writeFileSync(path.join(out, 'capture-metadata.json'), JSON.stringify(metadata, null, 2) + '\n');
    console.log(JSON.stringify({ screenshots: shots.length, pageErrors, browser: browser.version() }));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
