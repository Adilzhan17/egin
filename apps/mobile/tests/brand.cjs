const { chromium, expect: baseExpect } = require('@playwright/test');
const expect = baseExpect.configure({ timeout: 30000 });
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const origin = process.env.EGIN_URL || 'http://127.0.0.1:4951';
const portal = process.env.EGIN_PORTAL_URL || 'http://127.0.0.1:4952';
const out = process.env.EGIN_SCREENSHOTS || path.resolve(__dirname, '../../../test-results/brand');

async function originalImage(locator, variant) {
  await expect(locator).toBeVisible();
  const image = await locator.evaluate(async element => {
    await element.decode(); const style = getComputedStyle(element), rect = element.getBoundingClientRect();
    return { src: new URL(element.currentSrc).pathname, width: element.naturalWidth, height: element.naturalHeight,
      ratio: rect.width / rect.height, filter: style.filter, opacity: style.opacity, left: rect.left, right: rect.right, viewport: innerWidth };
  });
  assert.match(image.src, new RegExp(`^/(assets|developer-assets)/${variant}-[A-Za-z0-9_-]+\\.png$`));
  assert.deepEqual([image.width, image.height], variant === 'wordmark' ? [2172, 724] : [1536, 1024]);
  assert.ok(Math.abs(image.ratio - image.width / image.height) < .02, 'artwork proportions preserved');
  assert.equal(image.filter, 'none'); assert.equal(image.opacity, '1');
  assert.ok(image.left >= -1 && image.right <= image.viewport + 1, 'logo fits viewport');
}

async function fitsViewport(page, label) {
  // Measure the painted layout after font loading and ResizeObserver callbacks.
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const layout = await page.evaluate(() => ({
    viewport: innerWidth, width: document.documentElement.scrollWidth,
    outside: [...document.querySelectorAll('body *')].filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width && rect.right > innerWidth + 1 && !element.closest('nav');
    }).map(element => ({ tag: element.tagName, className: element.getAttribute('class'),
      text: element.textContent.slice(0, 80), right: element.getBoundingClientRect().right })).slice(0, 25),
  }));
  if (layout.width > layout.viewport) await page.screenshot({ path: path.join(out, 'overflow.png') });
  assert.ok(layout.width <= layout.viewport, `${label}: ${JSON.stringify(layout)}`);
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.route('https://api.open-meteo.com/**', r => r.fulfill({ json: require('./fixtures/open-meteo.json') }));
    await context.route('**/api/session', r => r.fulfill({ json: { user: null } }));
    await context.route('**/api/developer/session', r => r.fulfill({ json: { user: null } }));
    await context.route('**/api/news', r => r.fulfill({ json: require('./fixtures/news.json') }));
    await context.route('https://eldala.kz/uploads/**', r => r.fulfill({ status: 404 }));
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    // This suite runs against nginx in CI with public/ initially mode 0600/0700.
    // Checking real HTTP bytes catches permission errors hidden by Vite preview.
    for (const file of ['favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
      const response = await context.request.get(origin + '/icons/' + file);
      assert.equal(response.status(), 200, `nginx can read ${file}`);
      assert.match(response.headers()['content-type'], /^image\/png/);
      assert.deepEqual(await response.body(), fs.readFileSync(path.resolve(__dirname, '../public/icons', file)));
    }
    const assets = path.resolve(__dirname, '../dist/assets');
    const movie = fs.readdirSync(assets).find(file => /^egin-v2-.*\.mp4$/.test(file));
    assert.ok(movie, 'built splash exists');
    const movieResponse = await context.request.get(origin + '/assets/' + movie, { headers: { Range: 'bytes=0-15' } });
    assert.equal(movieResponse.status(), 206, 'nginx serves Safari video range requests');
    assert.match(movieResponse.headers()['content-type'], /^video\/mp4/);
    assert.deepEqual(await movieResponse.body(), fs.readFileSync(path.join(assets, movie)).subarray(0, 16));
    for (const [route, selector, variant] of [
      ['/', '.wordmark img', 'wordmark'], ['/weather', '.weather-page-brand img', 'wordmark'],
      ['/chat', '.chat-brand img', 'wordmark'], ['/auth', '.auth-brand-image', 'symbol'],
      ['/egin-one', '.one-brand img', 'wordmark'],
    ]) {
      await page.goto(origin + '/#' + route);
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        await originalImage(page.locator(selector).first(), variant);
        await fitsViewport(page, `${route} at ${width}`);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      if (route === '/egin-one') await expect(page.locator('canvas[data-brand-ready="true"]')).toBeVisible();
      await page.screenshot({ path: path.join(out, `${route.replaceAll('/', '') || 'home'}-390.png`) });
      await expect(page.locator('.brand-symbol, .brand-mark, .one-brand-mark')).toHaveCount(0);
    }
    await page.goto(origin + '/#/');
    await originalImage(page.locator('.footer-brand img'), 'wordmark');
    await page.locator('.install-banner').click();
    await originalImage(page.locator('.install-brand img'), 'emblem');
    await page.screenshot({ path: path.join(out, 'install-emblem.png') });
    await page.goto(portal);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        await originalImage(page.locator('.brand-wordmark'), 'wordmark');
        await fitsViewport(page, `portal ${theme} at ${width}`);
      }
      await page.screenshot({ path: path.join(out, `portal-${theme}.png`) });
    }
    assert.deepEqual(errors, []);
    console.log('PASS original brand artwork across home, weather, chat, auth, installation, 3D product and API portal at 320/390/1440px');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
