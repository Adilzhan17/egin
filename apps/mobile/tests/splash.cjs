const { chromium, webkit, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');

const root = path.resolve(__dirname, '../dist');
const out = process.env.EGIN_SCREENSHOTS || path.resolve(__dirname, '../../../test-results/splash');
const key = 'egin.splash.next.v1';
const mediaRequests = [];
const types = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/splash/')) mediaRequests.push(url.pathname);
  if (url.pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(url.pathname === '/api/session' ? { user: null } : url.pathname === '/api/news' ? require('./fixtures/news.json') : { records: [], cursor: 0, more: false }));
  }
  const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; return res.end(); }
  const size = fs.statSync(file).size;
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache');
  if (file.endsWith('.mp4')) res.setHeader('Accept-Ranges', 'bytes');
  const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
  if (range && file.endsWith('.mp4')) {
    const start = Number(range[1]), end = Math.min(range[2] ? Number(range[2]) : size - 1, size - 1);
    if (start >= size || end < start) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
    res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.setHeader('Content-Length', size);
  fs.createReadStream(file).pipe(res);
});

const options = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'no-preference', serviceWorkers: 'block' };
const target = origin => origin + '/#/settings/app';
async function fixtures(context) {
  await context.route('https://api.open-meteo.com/**', route => route.fulfill({ json: require('./fixtures/open-meteo.json') }));
  await context.addInitScript(() => {
    window.splashMediaEvents = [];
    for (const name of ['loadstart', 'loadedmetadata', 'playing', 'waiting', 'stalled', 'ended', 'error', 'emptied']) {
      document.addEventListener(name, event => {
        const video = event.target;
        if (video instanceof HTMLVideoElement) window.splashMediaEvents.push({ name, time: video.currentTime, ready: video.readyState, error: video.error?.message });
      }, true);
    }
  });
}
async function assertPlayback(page, variant, screenshot) {
  await expect(page.locator('.launch-screen')).toHaveAttribute('data-variant', variant);
  await expect(page.locator('.launch-app')).toHaveAttribute('inert', '');
  await page.waitForFunction(() => {
    const video = document.querySelector('.launch-frame video');
    return video && !video.paused && video.currentTime > 0.15 && video.videoWidth > 0;
  }).catch(async error => { console.error('Media lifecycle:', await page.evaluate(() => window.splashMediaEvents)); throw error; });
  const media = await page.locator('.launch-frame video').evaluate(video => {
    window.splashEnded = false;
    video.addEventListener('ended', () => { window.splashEnded = true; }, { once: true });
    return { src: video.currentSrc, duration: video.duration, muted: video.muted, loop: video.loop, inline: video.playsInline, width: video.videoWidth, height: video.videoHeight };
  });
  assert.ok(media.src.endsWith(`/splash/${variant}-v1.mp4`));
  assert.ok(Math.abs(media.duration - 2.2) < 0.05, JSON.stringify(media));
  assert.deepEqual([media.muted, media.loop, media.inline], [true, false, true]);
  // WebKit's Windows decoder reports a downscaled presentation size.
  assert.ok(media.width > 0 && media.height > 0 && Math.abs(media.width / media.height - 720 / 1152) < 0.01);
  if (screenshot) {
    await page.waitForFunction(() => document.querySelector('.launch-frame video')?.currentTime >= 1);
    await page.screenshot({ path: screenshot });
  }
  await expect(page.locator('.launch-screen')).toHaveCount(0, { timeout: 8000 });
  assert.equal(await page.evaluate(() => window.splashEnded), true, 'real ended event, not the fail-open timer');
  await expect(page.locator('.launch-app')).not.toHaveAttribute('inert');
  await expect(page.getByRole('heading', { name: 'Приложение', exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
}

async function engineChecks(engine, name, origin) {
  const browser = await engine.launch();
  try {
    const context = await browser.newContext(options); await fixtures(context);
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const [index, variant] of ['flow', 'bars', 'pulse', 'flow'].entries()) {
      mediaRequests.length = 0;
      if (index === 0) await page.goto(target(origin), { waitUntil: 'domcontentloaded' });
      else await page.reload({ waitUntil: 'domcontentloaded' });
      await assertPlayback(page, variant, path.join(out, `${name}-${index}-${variant}.png`));
      assert.deepEqual([...new Set(mediaRequests)], [`/splash/${variant}-v1.mp4`], 'only selected video is played/downloaded by the screen');
      assert.equal(await page.evaluate(key => localStorage.getItem(key), key), String((index + 1) % 3));
      console.log(`PASS ${name}: launch ${index + 1} played ${variant} to ended`);
    }
    // Navigation and background/foreground changes are not new launches.
    await page.getByRole('link', { name: 'Настройки', exact: true }).click();
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.locator('.launch-screen')).toHaveCount(0);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), '1');
    await page.close();
    const reopened = await context.newPage(); await reopened.goto(target(origin));
    await assertPlayback(reopened, 'bars');
    assert.deepEqual(errors, []);
    await context.close();

    if (name === 'chromium') {
      const sizes = await browser.newContext(options); await fixtures(sizes);
      const sizedPage = await sizes.newPage();
      for (const [index, viewport] of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 1440, height: 900 }].entries()) {
        await sizedPage.setViewportSize(viewport);
        if (!index) await sizedPage.goto(target(origin)); else await sizedPage.reload();
        await assertPlayback(sizedPage, ['flow', 'bars', 'pulse'][index], path.join(out, `viewport-${viewport.width}x${viewport.height}.png`));
      }
      await sizes.close();
    }

    // Skip is keyboard accessible and releases focus, scroll and decoder.
    const skipContext = await browser.newContext(options); await fixtures(skipContext);
    const skipPage = await skipContext.newPage(); await skipPage.goto(target(origin));
    await expect(skipPage.locator('.launch-screen')).toHaveAttribute('data-variant', 'flow');
    await expect(skipPage.getByRole('button', { name: 'Пропустить заставку' })).toBeFocused();
    await skipPage.keyboard.press('Tab');
    await expect(skipPage.getByRole('button', { name: 'Пропустить заставку' })).toBeFocused();
    await skipPage.keyboard.press('Escape');
    await expect(skipPage.locator('.launch-screen')).toHaveCount(0);
    await expect(skipPage.locator('#main')).toBeFocused();
    assert.equal(await skipPage.evaluate(() => document.body.style.overflow), '');
    await skipContext.close();

    const reduced = await browser.newContext({ ...options, reducedMotion: 'reduce' }); await fixtures(reduced);
    const reducedPage = await reduced.newPage(); mediaRequests.length = 0;
    await reducedPage.goto(target(origin));
    await expect(reducedPage.locator('.launch-screen')).toHaveCount(0);
    assert.equal(await reducedPage.evaluate(key => localStorage.getItem(key), key), null);
    assert.equal(mediaRequests.length, 0);
    await reduced.close();

    const lifecycle = await browser.newContext(options); await fixtures(lifecycle);
    const lifecyclePage = await lifecycle.newPage();
    await lifecyclePage.goto(target(origin));
    await lifecyclePage.waitForFunction(() => document.querySelector('.launch-frame video')?.currentTime > 0.1);
    await lifecyclePage.emulateMedia({ reducedMotion: 'reduce' });
    await expect(lifecyclePage.locator('.launch-screen')).toHaveCount(0);
    await lifecyclePage.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(lifecyclePage.locator('.launch-screen')).toHaveCount(0);
    await lifecyclePage.reload();
    await lifecyclePage.waitForFunction(() => document.querySelector('.launch-frame video')?.currentTime > 0.1);
    await lifecyclePage.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(lifecyclePage.locator('.launch-screen')).toHaveCount(0);
    await lifecyclePage.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(lifecyclePage.locator('.launch-screen')).toHaveCount(0);
    assert.equal(await lifecyclePage.evaluate(key => localStorage.getItem(key), key), '2');
    await lifecycle.close();

    for (const failure of ['network', 'autoplay', 'stall', 'storage']) {
      const ctx = await browser.newContext(options); await fixtures(ctx);
      if (failure === 'network') await ctx.route('**/splash/**', r => r.abort());
      if (failure === 'autoplay') await ctx.addInitScript(() => { HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Blocked', 'NotAllowedError')); });
      if (failure === 'stall') await ctx.addInitScript(() => { HTMLMediaElement.prototype.play = () => new Promise(() => {}); });
      if (failure === 'storage') await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } }); });
      const p = await ctx.newPage(); const failures = []; p.on('pageerror', e => failures.push(e.message));
      await p.goto(target(origin));
      if (failure === 'storage') await assertPlayback(p, 'flow');
      else {
        await expect(p.locator('.launch-screen')).toHaveCount(0, { timeout: 7000 });
        await expect(p.getByRole('heading', { name: 'Приложение', exact: true })).toBeVisible();
        assert.equal(await p.evaluate(key => localStorage.getItem(key), key), '1');
      }
      assert.deepEqual(failures, [], failure);
      await ctx.close();
    }
    console.log(`PASS ${name}: actual video playback, 1→2→3→1 across loads and reopen, navigation, skip/focus, reduced motion, network/autoplay/stall/storage failures`);

    // Use the generated production worker, actual cache and real offline media.
    const offline = await browser.newContext({ ...options, serviceWorkers: 'allow' }); await fixtures(offline);
    const offlinePage = await offline.newPage(); offlinePage.setDefaultTimeout(20000);
    await offlinePage.goto(target(origin)); await assertPlayback(offlinePage, 'flow');
    await offlinePage.waitForFunction(() => !!navigator.serviceWorker.controller);
    const range = await offlinePage.evaluate(async () => {
      const response = await fetch('/splash/pulse-v1.mp4', { headers: { Range: 'bytes=0-15' } });
      return { status: response.status, length: (await response.arrayBuffer()).byteLength, range: response.headers.get('Content-Range') };
    });
    assert.equal(range.status, 206); assert.equal(range.length, 16); assert.match(range.range, /^bytes 0-15\//);
    await offline.setOffline(true);
    for (const variant of ['bars', 'pulse', 'flow']) {
      await offlinePage.reload({ waitUntil: 'domcontentloaded' }); await assertPlayback(offlinePage, variant);
    }
    await offline.close();
    console.log(`PASS ${name}: precached range responses and all three videos play to ended offline`);
  } finally { await browser.close(); }
}

async function concurrencyAndRestart(origin) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'egin-splash-'));
  let context = await chromium.launchPersistentContext(profile, options);
  try {
    await fixtures(context);
    const page = context.pages()[0]; await page.goto(target(origin)); await assertPlayback(page, 'flow');
    await context.close();
    context = await chromium.launchPersistentContext(profile, options); await fixtures(context);
    const restarted = context.pages()[0]; await restarted.goto(target(origin)); await assertPlayback(restarted, 'bars');
    await restarted.evaluate(key => localStorage.setItem(key, '0'), key);
    const pages = await Promise.all([context.newPage(), context.newPage(), context.newPage()]);
    await Promise.all(pages.map(p => p.goto(target(origin), { waitUntil: 'domcontentloaded' })));
    const variants = await Promise.all(pages.map(async p => {
      await expect(p.locator('.launch-screen')).not.toHaveAttribute('data-variant', 'pending');
      return p.locator('.launch-screen').getAttribute('data-variant');
    }));
    assert.deepEqual(variants.sort(), ['bars', 'flow', 'pulse']);
    assert.equal(await restarted.evaluate(key => localStorage.getItem(key), key), '0');
    // A hung lock cannot block launch or consume an unreserved sequence step.
    await restarted.evaluate(key => { navigator.locks.request(key, () => new Promise(() => {})); }, key);
    await restarted.waitForFunction(async key => (await navigator.locks.query()).held.some(lock => lock.name === key), key);
    const blocked = await context.newPage(); await blocked.goto(target(origin));
    await expect(blocked.locator('.launch-screen')).toHaveCount(0);
    assert.equal(await blocked.evaluate(key => localStorage.getItem(key), key), '0');
    console.log('PASS persistent browser restart, simultaneous tab reservations and lock timeout');
  } finally {
    await context.close();
    const resolved = path.resolve(profile), temp = path.resolve(os.tmpdir());
    assert.equal(path.dirname(resolved), temp);
    assert.ok(path.basename(resolved).startsWith('egin-splash-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const selected = process.env.EGIN_SPLASH_ENGINE;
    if (selected && !['chromium', 'webkit'].includes(selected)) throw new Error('Unknown EGIN_SPLASH_ENGINE');
    if (!selected || selected === 'chromium') await engineChecks(chromium, 'chromium', origin);
    if (!selected || selected === 'webkit') await engineChecks(webkit, 'webkit', origin);
    if (!selected || selected === 'chromium') await concurrencyAndRestart(origin);
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
