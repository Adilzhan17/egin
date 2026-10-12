// Presentation regression: isolated preview only; no server records are changed.
const { chromium, webkit, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const origin = process.env.EGIN_URL || 'http://localhost:4935';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Use a local preview');
const out = '/workspace/test-results/nature-glass';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ args: engine === chromium ? ['--no-sandbox', '--enable-unsafe-swiftshader'] : [] });
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block' });
      await context.addInitScript(() => localStorage.setItem('egin.plant-lab.view', '3d'));
      await context.route('https://api.open-meteo.com/**', r => r.fulfill({ json: require('./fixtures/open-meteo.json') }));
      await context.route('**/api/**', r => {
        const p = new URL(r.request().url()).pathname;
        if (p.startsWith('/api/market/') && r.request().method() === 'GET') return r.continue();
        return r.fulfill({ json: p === '/api/news' ? require('./fixtures/news.json') : { user: null, records: [], items: [], cursor: 0, more: false } });
      });
      await context.route('https://eldala.kz/uploads/**', r => r.fulfill({ status: 404 }));
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(origin);
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('.crop-canvas[data-ready="true"]')).toBeVisible();
      const navStyle = () => page.locator('.mobile-nav').evaluate(e => {
        const s = getComputedStyle(e), b = e.getBoundingClientRect();
        return { height: b.height, width: b.width, background: s.background, blur: s.backdropFilter, padding: s.padding, border: s.borderTop };
      });
      const nav = await navStyle();
      await page.getByRole('button', { name: 'Приблизить модель', exact: true }).click();
      await expect(page.locator('.crop-canvas')).toHaveAttribute('data-zoom', '1.1');
      await page.getByRole('button', { name: 'Сбросить ракурс', exact: true }).click();
      assert.equal(await page.locator('.plant-hero').evaluate(e => getComputedStyle(e).backdropFilter), 'none');
      assert.equal(await page.locator('.crop-canvas canvas').evaluate(e => getComputedStyle(e).filter), 'none');
      await page.getByRole('button', { name: 'Слои модели', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('button', { name: 'Применить', exact: true }).click();
      for (const [label, period] of [['Ночь', 'night'], ['День', 'day']]) {
        await page.getByRole('button', { name: 'Условия 3D-просмотра', exact: true }).click();
        await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).click();
        await page.getByRole('button', { name: 'Вернуться к модели', exact: true }).click();
        await expect(page.locator('.crop-canvas')).toHaveAttribute('data-period', period);
        await page.screenshot({ path: `${out}/home-${period}-${engine.name()}.png`, animations: 'disabled' });
      }
      const pages = [
        ['Главная', '.home-page', 'home'], ['Погода', '.weather-page', 'weather'],
        ['Рынок', '.market-page', 'market'], ['Настройки', '.nature-settings', 'settings'],
        ['Чат', '.chat-page', 'chat'],
      ];
      for (const [label, selector, name] of pages) {
        await page.getByRole('navigation').getByRole('link', { name: label, exact: true }).click();
        await expect(page.locator(selector)).toBeVisible();
        if (name === 'weather') await expect(page.locator('.forecast-card')).toBeVisible();
        if (name === 'market') await expect(page.locator('.market-grid, .market-empty').first()).toBeVisible();
        assert.deepEqual(await navStyle(), nav, `${name}: navbar unchanged`);
        assert.equal(await page.locator('.nav-item.active .nav-icon').evaluate(e => getComputedStyle(e).backgroundColor), 'rgba(0, 0, 0, 0)');
        for (const width of [320, 390, 768, 1280]) {
          await page.setViewportSize({ width, height: 844 });
          await expect(page.locator('.mobile-nav')).toBeInViewport();
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: overflow ${width}`);
          if ([390, 1280].includes(width)) await page.screenshot({ path: `${out}/${name}-${engine.name()}-${width}.png`, animations: 'disabled' });
        }
        await page.setViewportSize({ width: 390, height: 844 });
      }
      // Lazy-loaded themes must not leak back into Home or change navigation.
      await page.getByRole('navigation').getByRole('link', { name: 'Главная', exact: true }).click();
      await expect(page.locator('.crop-canvas[data-ready="true"]')).toBeVisible();
      assert.deepEqual(await navStyle(), nav);
      await page.evaluate(() => {
        document.documentElement.style.setProperty('--safe-area-inset-top', '47px');
        document.documentElement.style.setProperty('--safe-area-inset-bottom', '34px');
      });
      assert((await page.locator('.plant-hero').boundingBox()).y >= 47);
      await expect(page.getByRole('button', { name: 'Слои модели', exact: true })).toBeInViewport();
      assert.deepEqual(errors, []);
      console.log(`PASS ${engine.name()}: five themes, 320/390/768/1280, navbar isolation, sharp 3D, camera/layers, safe areas, lazy CSS navigation`);
    } finally { await browser.close(); }
  }
})().catch(e => { console.error(e); process.exit(1); });
