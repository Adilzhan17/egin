const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');

const appOrigin = process.env.EGIN_URL || 'http://localhost:4935';
const portalOrigin = process.env.EGIN_PORTAL_URL || 'http://localhost:4938';

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  try {
    for (const audience of ['app', 'developer']) for (const terminalStatus of [403, 410]) {
      const origin = audience === 'app' ? appOrigin : portalOrigin;
      const prefix = audience === 'app' ? '/api/auth/qr' : '/api/developer/qr';
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
      const page = await context.newPage();
      await page.clock.install();
      let starts = 0, polls = 0;
      await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: require('./fixtures/open-meteo.json') }));
      await page.route('**/api/news', route => route.fulfill({ json: require('./fixtures/news.json') }));
      await page.route('https://eldala.kz/**', route => route.abort());
      await page.route('**' + prefix + '/start', async route => {
        starts++;
        const id = String(starts).padStart(43, 'a');
        const now = await page.evaluate(() => Date.now());
        await route.fulfill({ json: { id, code: '123456', expires: now + 120000, device: 'Test browser', url: appOrigin + '/#/auth/confirm/' + id } });
      });
      await page.route('**' + prefix + '/poll', route => {
        polls++;
        if (polls === 1) return route.fulfill({ status: 500, json: { error: 'Временная ошибка связи' } });
        if (starts === 1) return route.fulfill({ status: terminalStatus, json: { error: terminalStatus === 410 ? 'QR истёк. Создайте новый код на устройстве входа.' : 'Этот QR создан в другом браузере.' } });
        return route.fulfill({ json: { status: 'pending' } });
      });
      await page.route('**' + prefix + '/cancel', route => route.fulfill({ json: { ok: true } }));
      await page.goto(origin + (audience === 'app' ? '/#/auth' : '/#/keys'));
      await page.getByRole('button', { name: audience === 'app' ? 'Войти по QR с телефона' : 'Войти через EGIN', exact: true }).click();
      const image = page.getByAltText(audience === 'app' ? 'QR для входа в EGIN' : 'QR входа в кабинет разработчика');
      await image.waitFor();
      const pixels = await image.evaluate(async element => {
        await element.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = element.naturalWidth;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(element, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const colours = new Set();
        for (let i = 0; i < data.length; i += 4) colours.add([data[i], data[i + 1], data[i + 2], data[i + 3]].join(','));
        return { size: canvas.width, colours: [...colours].sort(), quiet: [...ctx.getImageData(0, 0, 32, 32).data].every(value => value === 255) };
      });
      assert.equal(pixels.size % 8, 0, 'QR uses whole 8-pixel modules');
      assert.deepEqual(pixels.colours, ['0,0,0,255', '255,255,255,255']);
      assert.equal(pixels.quiet, true, 'four-module white quiet zone');
      await page.clock.fastForward(5000);
      await page.getByText('Временная ошибка связи', { exact: true }).waitFor();
      assert.equal(await image.count(), 1, 'transient failures keep the valid QR available');
      await page.clock.fastForward(5000);
      await page.getByRole('button', { name: 'Создать новый QR', exact: true }).waitFor();
      assert.equal(await image.count(), 0, 'invalid QR is removed immediately');
      const endedAt = polls;
      await page.clock.fastForward(15000);
      assert.equal(polls, endedAt, 'terminal failures stop polling');
      await page.getByRole('button', { name: 'Создать новый QR', exact: true }).click();
      await image.waitFor();
      assert.equal(starts, 2);
      await page.clock.fastForward(5000);
      await page.waitForFunction(() => !document.body.textContent.includes('Временная ошибка связи'));
      assert.equal(await image.count(), 1, 'new QR remains usable');
      await context.close();
    }
    console.log('PASS: app and developer QR stop on 403/410, recover after regeneration, retry transient errors, and render crisp black/white codes.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
