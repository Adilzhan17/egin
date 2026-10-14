// Run against a local Vite server: EGIN_URL=http://localhost:4947 node tests/chat-materials.cjs
const { chromium, webkit, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
fs.mkdirSync('test-results/chat-materials', { recursive: true });
const origin = process.env.EGIN_URL || 'http://localhost:4947';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Local component fixture only');
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#cedecc"/><path d="M0 120h256M120 0v256" stroke="#fff" stroke-width="15"/></svg>';
const file = { id: 'photo-1', kind: 'image', url: '/fixture-image.svg', name: 'Участок.jpg', mimeType: 'image/jpeg', size: 12345 };
const message = (sequence, extras = {}) => ({ id: `message-${sequence}`, sequence, conversationId: 'test-conversation', sender: { id: 'peer', name: 'Азамат' }, kind: 'text', text: '', attachments: [], deletedAt: null, editedAt: null, createdAt: '2026-10-13T10:00:00Z', replyTo: null, location: null, listing: null, ...extras });
(async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ args: engine === chromium ? ['--no-sandbox'] : [] });
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' });
      await context.routeWebSocket('**', socket => { const server=socket.connectToServer();server.onMessage(message=>{try{if(['update','full-reload'].includes(JSON.parse(String(message)).type))return;}catch{}socket.send(message);}); });
      const errors = [], requests = []; let deleted = false;
      await context.addInitScript(() => {
        const streams = []; window.geoCalls = 0;
        window.EventSource = class extends EventTarget { constructor() { super(); streams.push(this); } close() {} };
        window.fixtureEvent = data => streams.forEach(stream => stream.dispatchEvent(new MessageEvent('change', { data: JSON.stringify(data) })));
        Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition(resolve) { window.geoCalls++; resolve({ coords: { latitude: 51.1694, longitude: 71.4491, accuracy: 7 } }); } } });
      });
      await context.route('https://tile.openstreetmap.org/**', route => route.fulfill({ body: svg, contentType: 'image/svg+xml' }));
      await context.route('**/fixture-image.svg', route => route.fulfill({ body: svg, contentType: 'image/svg+xml' }));
      await context.route('**/api/chat/**', route => {
        const url = new URL(route.request().url()); requests.push(url);
        const type = url.searchParams.get('type'), before = url.searchParams.get('before');
        let items = [], hasMore = false;
        if (type === 'media' && !deleted) { items = [message(before ? 5 : 10, { kind: 'image', attachments: [{ ...file, id: before ? 'photo-2' : file.id }] })]; hasMore = !before; }
        if (type === 'documents') items = [message(9, { kind: 'document', attachments: [{ ...file, id: 'doc', kind: 'document', name: 'Отчёт.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }] })];
        if (type === 'links') items = [message(8, { text: 'https://egin.perricheno.com/test' })];
        if (type === 'locations') items = [message(7, { kind: 'location', location: { latitude: 51.1694, longitude: 71.4491, label: 'Поле № 7', accuracy: 7 } })];
        return route.fulfill({ json: { items, hasMore, nextCursor: hasMore ? '10' : null } });
      });
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${origin}/tests/fixtures/chat-materials.html`);
      await page.getByRole('button', { name: 'Выбрать геопозицию', exact: true }).click();
      assert.equal(await page.evaluate(() => window.geoCalls), 0, 'opening picker must not request location permission');
      await expect(page.getByRole('button', { name: 'Прикрепить геопозицию' })).toBeDisabled();
      await page.locator('.chat-location-map').click({ position: { x: 100, y: 90 } });
      await expect(page.getByRole('button', { name: 'Прикрепить геопозицию' })).toBeEnabled();
      assert.equal(await page.evaluate(() => window.geoCalls), 0);
      await page.getByRole('button', { name: 'Моё текущее местоположение' }).click();
      assert.equal(await page.evaluate(() => window.geoCalls), 1);
      await page.getByLabel('Название места').fill('Въезд на поле');
      await page.screenshot({ path: `test-results/chat-materials/${engine.name()}-location-picker.png` });
      await page.getByRole('button', { name: 'Прикрепить геопозицию' }).click();
      const point = JSON.parse(await page.getByTestId('selected').textContent()); assert.equal(point.accuracy, 7); assert.equal(point.label, 'Въезд на поле');
      await expect(page.getByRole('link', { name: 'Маршрут ↗' })).toHaveAttribute('href', /destination=51.1694%2C71.4491/);
      await page.locator('main').evaluate(element => { element.style.setProperty('--chat-incoming', '#293d52'); element.style.setProperty('--chat-ink', '#edf5fb'); element.style.color = '#172c25'; });
      assert.equal(await page.locator('.chat-location-preview').evaluate(element => getComputedStyle(element).color), 'rgb(237, 245, 251)', 'location card must retain its own contrast even in custom outgoing bubble');
      await page.screenshot({ path: `test-results/chat-materials/${engine.name()}-location-dark.png` });
      await page.getByRole('button', { name: 'Материалы', exact: true }).click();
      await expect(page.locator('.chat-material-thumbnail')).toHaveCount(1);
      await page.getByRole('button', { name: 'Загрузить ещё' }).click();
      await expect(page.locator('.chat-material-thumbnail')).toHaveCount(2);
      await page.screenshot({ path: `test-results/chat-materials/${engine.name()}-materials.png` });
      assert(requests.some(url => url.searchParams.get('before') === '10'));
      await page.locator('.chat-material-thumbnail').first().click();
      await expect(page.locator('.chat-gallery')).toBeVisible();
      await expect(page.locator('.chat-gallery-download')).toHaveAttribute('download', 'Участок.jpg');
      await page.locator('.chat-gallery').getByRole('button', { name: 'Закрыть', exact: true }).click();
      await page.getByRole('tab', { name: 'Документы', exact: true }).click();
      await expect(page.locator('.chat-material-document')).toContainText('Отчёт.xlsx');
      await page.getByRole('tab', { name: 'Ссылки', exact: true }).click();
      await expect(page.locator('.chat-material-link')).toHaveAttribute('href', 'https://egin.perricheno.com/test');
      await page.getByRole('tab', { name: 'Геолокации', exact: true }).click();
      await expect(page.getByRole('tabpanel',{name:'Геолокации'}).locator('.chat-material-item')).toContainText('Поле № 7');
      await page.getByRole('tab', { name: 'Медиа', exact: true }).click();
      await expect(page.locator('.chat-material-thumbnail')).toHaveCount(1);
      await page.locator('.chat-material-thumbnail').first().click(); await expect(page.locator('.chat-gallery')).toBeVisible();
      deleted = true; const retained = await page.evaluate(() => { window.fixtureEvent({ type: 'deleted', messageId: 'message-10', conversationId: 'test-conversation' }); return new Promise(resolve => requestAnimationFrame(() => resolve(document.querySelectorAll('.chat-gallery').length))); }); assert.equal(retained, 0, 'Deleted private media disappears immediately, without exit retention');
      await expect(page.locator('.chat-material-thumbnail')).toHaveCount(0);
      await expect(page.getByText('Пока нет материалов')).toBeVisible();
      for (const width of [360, 390, 430, 1024]) {
        await page.setViewportSize({ width, height: 844 });
        assert(await page.evaluate(() => [...document.querySelectorAll('.chat-sheet-body,.chat-materials')].every(element => element.scrollWidth <= element.clientWidth + 1)), `overflow at ${width}`);
      }
      await page.getByRole('tab', { name: 'Ссылки', exact: true }).click();
      await page.getByRole('button', { name: 'Перейти к сообщению от Азамат' }).click();
      await expect(page.getByTestId('jump')).toHaveText('message-8');
      assert.deepEqual(errors, []); console.log(`${engine.name()}: location consent/manual selection, real coordinates, materials pagination, links, download, deletion, jump and mobile widths PASS`);
      await context.close();
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exit(1); });
