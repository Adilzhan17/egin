// Deterministic mobile regressions: forecast timestamps, missing readings and field changes.
const { chromium, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const origin = process.env.EGIN_URL || 'http://localhost:4941';
if (!['localhost', '127.0.0.1', 'dev-egin.perricheno.com'].includes(new URL(origin).hostname)) throw Error('Use an isolated preview or staging');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block' });
    let missing = false;
    await context.route('https://api.open-meteo.com/**', route => {
      const fixture = structuredClone(require('./fixtures/open-meteo.json'));
      if (missing) {
        fixture.hourly.precipitation.fill(null);
        fixture.hourly.uv_index.fill(null);
        fixture.hourly.pressure_msl.fill(null);
        fixture.current.pressure_msl = null;
      }
      return route.fulfill({ json: fixture });
    });
    await context.route('**/api/**', route => route.fulfill({ json: route.request().url().includes('/news') ? require('./fixtures/news.json') : { user: null, records: [], cursor: 0, more: false } }));
    await context.route('https://eldala.kz/uploads/**', route => route.fulfill({ status: 404 }));
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await expect(page.getByRole('heading', { name: 'Пример растения', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /Добавить участок/ })).toBeVisible();
    await expect(page.locator('.plant-hero')).toHaveClass(/scene-static/);
    await page.getByRole('navigation').getByRole('link', { name: 'Погода', exact: true }).click();
    await expect(page.locator('.forecast-hour')).toHaveCount(24);
    await expect(page.locator('.forecast-hour').first()).not.toContainText('Сейчас');
    await expect(page.locator('.forecast-hour-date').first()).not.toHaveText('');
    const hoursTab = page.getByRole('tab', { name: 'По часам' });
    await hoursTab.focus(); await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'На 10 дней' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.forecast-day-condition small')).toHaveCount(10);
    await page.locator('.forecast-day').first().click();
    await expect(page.getByRole('dialog')).toContainText('Осадки за сутки');
    await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
    // Replace the active field while a reading is open; another field must never inherit its sheet.
    await hoursTab.click(); await page.locator('.forecast-hour').first().click();
    const longName = 'Участок-' + 'ОченьДлинноеНазвание'.repeat(7);
    await page.evaluate(name => new Promise((resolve, reject) => {
      const open = indexedDB.open('egin-workspace-v1', 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result, tx = db.transaction(['records', 'meta'], 'readwrite');
        tx.objectStore('records').put({ key: 'guest:weather-field', id: 'weather-field', owner: 'guest', kind: 'field', data: { name, latitude: 52.6, longitude: 70.4, area: 6.7, crop: 'wheat' }, version: 0, localRevision: 1, dirty: false, deleted: false, updated: new Date().toISOString() });
        tx.objectStore('meta').put({ key: 'selectedField', value: 'weather-field' });
        tx.oncomplete = () => { db.close(); window.dispatchEvent(new Event('egin-data')); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    }), longName);
    await expect(page.locator('.weather-field-link')).toHaveText(longName);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `weather overflow ${width}`);
    }
    missing = true;
    await page.getByRole('button', { name: 'Обновить погоду', exact: true }).click();
    await page.getByRole('button', { name: 'Осадки', exact: true }).click();
    await expect(page.locator('.weather-chart-empty')).toBeVisible();
    await expect(page.locator('.forecast-plot rect')).toHaveCount(0);
    await expect(page.locator('.metric-pressure .pressure-scale')).toHaveCount(0);
    await expect(page.locator('.metric-uvIndex .uv-scale i')).toHaveCount(0);
    assert.equal(await page.locator('.forecast-plot').evaluate(el => /NaN|Infinity/.test(el.innerHTML)), false);
    await page.getByRole('navigation').getByRole('link', { name: 'Главная', exact: true }).click();
    await expect(page.locator('.scene-field-link')).toHaveText(longName);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `home overflow ${width}`);
    }
    assert.deepEqual(errors, []);
    console.log('Home/weather: mobile widths, honest dates, keyboard tabs, missing readings and field changes passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
