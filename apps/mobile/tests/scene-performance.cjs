// Browser-side instrumentation only: no debug state or counters in the application.
const { chromium, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const origin = process.env.EGIN_URL || 'http://localhost:4941';
if (!['localhost', '127.0.0.1', 'dev-egin.perricheno.com'].includes(new URL(origin).hostname)) throw Error('Use an isolated preview or staging');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.addInitScript(() => {
      const pending = new Set(), request = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
      window.__sceneProbe = { draws: 0, pending };
      window.requestAnimationFrame = callback => { let id; id = request(time => { pending.delete(id); callback(time); }); pending.add(id); return id; };
      window.cancelAnimationFrame = id => { pending.delete(id); cancel(id); };
      for (const name of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
        const prototype = window[name]?.prototype;
        if (!prototype) continue;
        for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
          const original = prototype[method];
          if (!original) continue;
          prototype[method] = function (...args) { if (this.canvas?.closest('.crop-canvas')) window.__sceneProbe.draws++; return original.apply(this, args); };
        }
      }
    });
    await context.route('https://api.open-meteo.com/**', route => route.fulfill({ json: require('./fixtures/open-meteo.json') }));
    await context.route('**/api/**', route => route.fulfill({ json: route.request().url().includes('/news') ? require('./fixtures/news.json') : { user: null, records: [], cursor: 0, more: false } }));
    await context.route('https://eldala.kz/uploads/**', route => route.fulfill({ status: 404 }));
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await expect(page.locator('.crop-canvas[data-ready="true"]')).toBeVisible();
    const draws = () => page.evaluate(() => window.__sceneProbe.draws);
    const pending = () => page.evaluate(() => window.__sceneProbe.pending.size);
    async function sleeps(label) {
      // Media/resize observer callbacks can enqueue their final redraw after React commits.
      await expect.poll(async () => {
        if (await pending() !== 0) return false;
        const before = await draws();
        await page.waitForTimeout(250);
        return await pending() === 0 && await draws() === before;
      }, { timeout: 12000, message: `${label}: zero pending RAF and no static redraws` }).toBe(true);
    }
    await expect.poll(draws).toBeGreaterThan(0);
    await sleeps('initial reduced-motion scene');
    async function wakes(action, label) {
      const before = await draws(); await action();
      await expect.poll(draws, { timeout: 12000, message: label }).toBeGreaterThan(before);
      await sleeps(label);
    }
    await wakes(() => page.getByRole('button', { name: 'Приблизить модель', exact: true }).click(), 'zoom');
    await expect(page.locator('.crop-canvas')).toHaveAttribute('data-zoom', '1.1');
    const box = await page.locator('.crop-canvas').boundingBox();
    await wakes(async () => { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 65, box.y + box.height / 2, { steps: 5 }); await page.mouse.up(); }, 'pointer rotation and inertia');
    await wakes(() => page.getByRole('button', { name: 'Сбросить ракурс', exact: true }).click(), 'restore view');
    await expect(page.locator('.crop-canvas')).toHaveAttribute('data-zoom', '1.0');
    await wakes(() => page.setViewportSize({ width: 360, height: 780 }), 'resize');
    // An options change must wake the paused scene, including when closing its modal.
    await page.getByRole('button', { name: 'Условия 3D-просмотра', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Снег', exact: true }).click();
    await wakes(() => page.getByRole('button', { name: 'Вернуться к модели', exact: true }).click(), 'weather update');
    await expect(page.locator('.crop-canvas')).toHaveAttribute('data-condition', 'snow');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    let before = await draws(); await expect.poll(draws).toBeGreaterThan(before);
    before = await draws(); await page.waitForTimeout(150); assert.ok(await draws() > before, 'animated scene continues rendering');
    await page.getByRole('button', { name: 'О данных', exact: true }).click();
    await sleeps('inactive behind modal');
    before = await draws(); await page.getByRole('button', { name: 'Понятно', exact: true }).click();
    await expect.poll(draws).toBeGreaterThan(before);
    await page.locator('.home-footer').scrollIntoViewIfNeeded();
    await sleeps('offscreen animated scene');
    before = await draws(); await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(draws).toBeGreaterThan(before);
    // Synthesize the visibility lifecycle deterministically; Chromium headless tabs vary by version.
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleeps('hidden document');
    before = await draws();
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await expect.poll(draws).toBeGreaterThan(before);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('.plant-hero')).toHaveClass(/scene-static/);
    await sleeps('return to reduced motion');
    await page.getByRole('navigation').getByRole('link', { name: 'Погода', exact: true }).click();
    await expect(page.locator('canvas')).toHaveCount(0);
    await sleeps('disposed scene');
    assert.deepEqual(errors, []);
    console.log('3D scheduler: idle has zero draws/RAF; rotation, zoom, reset, resize and options wake it; hidden, offscreen, modal and disposed scenes sleep');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
