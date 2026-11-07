// Runs in CI against a disposable server/database, with real account and sync APIs.
const { chromium, webkit, expect: baseExpect } = require('@playwright/test');
const expect = baseExpect.configure({ timeout: 30000 });
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { mkdtempSync, mkdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const express = require('../../api/node_modules/express');

(async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'egin-onboarding-'));
  const web = express(), server = createServer(web);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://localhost:${server.address().port}`;
  const { createApp } = await import('../../api/src/server.mjs');
  const service = createApp({ dataDir: dir, origins: [origin], rpID: 'localhost' });
  web.use((req, res, next) => req.path.startsWith('/api/') ? service.app(req, res, next) : next());
  web.use(express.static(path.resolve(__dirname, '../dist')));
  service.attachUpgrade(server);
  const out = path.resolve(__dirname, '../../../test-results/field-onboarding');
  mkdirSync(out, { recursive: true });
  let browser, page;
  try {
    for (const engine of [chromium, webkit]) {
      browser = await engine.launch({ ...(engine === chromium ? { args: ['--no-sandbox', '--enable-unsafe-swiftshader'] } : {}) });
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block' });
      const weatherRequests = [];
      await context.route('https://api.open-meteo.com/**', route => {
        weatherRequests.push(new URL(route.request().url()));
        return route.fulfill({ json: require('./fixtures/open-meteo.json') });
      });
      await context.route(/(?:tile\.openstreetmap\.org|\/api\/cadastre\/basemap\/)/, route => route.abort());
      await context.route('**/api/news', route => route.fulfill({ json: require('./fixtures/news.json') }));
      await context.route('https://eldala.kz/**', route => route.abort());
      page = await context.newPage();
      page.setDefaultTimeout(30000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin);
      await page.locator('.field-readiness').getByRole('link', { name: 'Добавить участок', exact: true }).click();
      await expect(page).toHaveURL(/#\/fields\/new$/);
      const wizard = page.locator('.field-wizard');
      await expect(wizard).toContainText('Можно начать без профиля');
      const geometry = { type: 'Polygon', coordinates: [[[71.45, 51.17], [71.453, 51.17], [71.453, 51.172], [71.45, 51.172], [71.45, 51.17]]] };
      await wizard.locator('input[type=file]').setInputFiles({ name: 'my-field.geojson', mimeType: 'application/geo+json', buffer: Buffer.from(JSON.stringify(geometry)) });
      await expect(wizard.locator('.boundary-area')).toBeVisible();
      await wizard.getByRole('button', { name: 'Продолжить', exact: true }).click();
      await wizard.getByRole('button', { name: /Подсолнечник/ }).click();
      await wizard.getByRole('button', { name: 'Продолжить', exact: true }).click();
      const name = 'Северное поле · ' + 'Длинное название '.repeat(3);
      await wizard.getByLabel('Название участка').fill(name);
      await wizard.getByRole('button', { name: 'Продолжить', exact: true }).click();
      await page.reload();
      await expect(wizard.getByRole('heading', { name, exact: true })).toBeVisible();
      await wizard.getByRole('button', { name: 'Войти и продолжить', exact: true }).click();
      await expect(page).toHaveURL(/#\/auth$/);
      assert.equal((await (await context.request.get(origin + '/api/session')).json()).user, null);
      await page.getByRole('button', { name: 'Создать профиль', exact: true }).first().click();
      await page.getByLabel('Ваше имя').fill('Фермер');
      await page.getByLabel('Email', { exact: true }).fill(`onboarding-${engine.name()}@example.com`);
      await page.getByLabel('Пароль', { exact: true }).fill('Моя длинная учебная фраза 123');
      await page.getByLabel('Повторите пароль', { exact: true }).fill('Моя длинная учебная фраза 123');
      await page.getByRole('button', { name: 'Создать профиль', exact: true }).last().click();
      await expect(page.getByRole('heading', { name: 'Сохраните код восстановления', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Код сохранён', exact: true }).click();
      await expect(page).toHaveURL(/#\/fields\/new$/);
      // The wizard draft requires an explicit restore after authentication.
      const before = await (await context.request.get(origin + '/api/sync')).json();
      assert.equal(before.records.filter(row => row.kind === 'field' && !row.deleted).length, 0);
      await wizard.getByRole('button', { name: 'Восстановить черновик', exact: true }).click();
      await expect(wizard.getByRole('heading', { name, exact: true })).toBeVisible();
      let rejectWrites = true;
      await page.route('**/api/sync', route => rejectWrites && route.request().method() === 'POST' ? route.abort() : route.continue());
      await wizard.getByRole('button', { name: 'Сохранить участок', exact: true }).click();
      await expect(wizard.locator('[role=alert]')).toBeVisible();
      await expect(page.locator('.field-first-result')).toHaveCount(0);
      const failed = await (await context.request.get(origin + '/api/sync')).json();
      assert.equal(failed.records.filter(row => row.kind === 'field' && !row.deleted).length, 0);
      rejectWrites = false;
      await wizard.getByRole('button', { name: 'Сохранить участок', exact: true }).click();
      await expect(wizard).toHaveCount(0);
      await expect(page).toHaveURL(/#\/fields\/[A-Za-z0-9_-]+\/ready$/);
      await expect(page.locator('.field-first-result')).toContainText('Участок сохранён');
      const saved = await (await context.request.get(origin + '/api/sync')).json();
      const fields = saved.records.filter(row => row.kind === 'field' && !row.deleted);
      assert.equal(fields.length, 1);
      assert.equal(fields[0].data.name, name);
      assert.equal(fields[0].data.crop, 'sunflower');
      assert.deepEqual(fields[0].data.boundary, geometry);
      assert.ok(fields[0].version > 0);
      for (const width of [320, 390, 430]) {
        await page.setViewportSize({ width, height: 844 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Onboarding result fits ${width}px`);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('.field-first-result').screenshot({ path: path.join(out, `${engine.name()}-saved.png`) });
      await page.getByRole('link', { name: 'Посмотреть погоду участка', exact: true }).click();
      await expect(page).toHaveURL(/#\/weather$/);
      await expect(page.locator('.weather-report')).toBeVisible();
      await expect(page.locator('.weather-report')).toContainText(name);
      assert.ok(weatherRequests.some(url => Math.abs(Number(url.searchParams.get('latitude')) - fields[0].data.latitude) < .0001 && Math.abs(Number(url.searchParams.get('longitude')) - fields[0].data.longitude) < .0001));
      assert.equal(await page.evaluate(() => sessionStorage.getItem('egin-login-return')), null);
      assert.deepEqual(errors, []);
      await browser.close(); browser = undefined;
      console.log(`PASS ${engine.name()}: guest draft, registration return, explicit restore, failed-save retry, real server confirmation, field forecast and mobile widths`);
    }
  } catch (error) {
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    await browser?.close();
    service.close();
    await new Promise(resolve => server.close(resolve));
    service.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
