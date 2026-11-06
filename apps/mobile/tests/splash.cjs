const { chromium, webkit, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');

const root = path.resolve(__dirname, '../dist');
const out = process.env.EGIN_SCREENSHOTS || path.resolve(__dirname, '../../../test-results/splash');
const mediaRequests = [];
let unavailableMedia = false;
const types = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/splash/')) mediaRequests.push(url.pathname);
  if (url.pathname.startsWith('/splash/') && unavailableMedia) { res.statusCode = 503; return res.end(); }
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
        if (video instanceof HTMLVideoElement) window.splashMediaEvents.push({ name, time: video.currentTime, ready: video.readyState, error: video.error?.message,
          src: video.currentSrc, duration: video.duration, muted: video.muted, loop: video.loop, inline: video.playsInline, width: video.videoWidth, height: video.videoHeight });
      }, true);
    }
  });
}
async function assertPlayback(page) {
  // Observe lifecycle events from before bootstrap. A 2.3s animation can finish
  // between automation round-trips; polling a removed video loses that evidence.
  await page.waitForFunction(() => window.splashMediaEvents.some(event => event.name === 'ended'), null, { polling: 50 })
    .catch(async error => { console.error('Media lifecycle:', await page.evaluate(() => window.splashMediaEvents)); throw error; });
  const events = await page.evaluate(() => window.splashMediaEvents);
  const media = events.find(event => event.name === 'ended');
  assert.ok(events.some(event => event.name === 'playing'));
  assert.equal(events.filter(event => event.name === 'ended').length, 1);
  assert.ok(media.time >= 2.29, 'actual playback reached the final frame');
  assert.ok(media.src.endsWith('/splash/egin-v2.mp4'));
  assert.ok(Math.abs(media.duration - 2.3) < 0.05, JSON.stringify(media));
  assert.deepEqual([media.muted, media.loop, media.inline], [true, false, true]);
  // WebKit's Windows decoder reports a downscaled presentation size.
  assert.ok(media.width > 0 && media.height > 0 && Math.abs(media.width / media.height - 1080 / 1920) < 0.01);
  await expect(page.locator('.launch-screen')).toHaveCount(0, { timeout: 8000 });
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
    for (const index of [0, 1, 2]) {
      mediaRequests.length = 0;
      if (index === 0) await page.goto(target(origin), { waitUntil: 'domcontentloaded' });
      else await page.reload({ waitUntil: 'domcontentloaded' });
      await assertPlayback(page);
      assert.deepEqual([...new Set(mediaRequests)], ['/splash/egin-v2.mp4'], 'only the replacement video is played/downloaded');
      console.log(`PASS ${name}: launch ${index + 1} played the new splash to ended`);
    }
    // Navigation and background/foreground changes are not new launches.
    await page.getByRole('link', { name: 'Настройки', exact: true }).click();
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.locator('.launch-screen')).toHaveCount(0);
    await page.close();
    const reopened = await context.newPage(); await reopened.goto(target(origin));
    await assertPlayback(reopened);
    assert.deepEqual(errors, []);
    await context.close();

    // Forms must not accept/falsely lose an automation or autofill input while
    // the launch overlay owns focus. Exercise the real profile component.
    const formContext = await browser.newContext(options); await fixtures(formContext);
    const formPage = await formContext.newPage();
    await formPage.goto(origin + '/#/settings/profile');
    await formPage.getByLabel('Имя', { exact: true }).fill('Splash regression');
    await expect(formPage.getByLabel('Имя', { exact: true })).toHaveValue('Splash regression');
    await expect(formPage.getByRole('button', { name: 'Сохранить профиль', exact: true })).toBeEnabled();
    await expect(formPage.locator('.launch-screen')).toHaveCount(0);
    await formContext.close();

    if (name === 'chromium') {
      const sizes = await browser.newContext(options); await fixtures(sizes);
      await sizes.addInitScript(() => {
        document.addEventListener('playing', event => {
          const video = event.target;
          if (video instanceof HTMLVideoElement && !video.dataset.captured) {
            video.dataset.captured = 'true';
            setTimeout(() => { video.pause(); video.currentTime = 1; }, 0);
          }
        }, true);
      });
      const sizedPage = await sizes.newPage();
      for (const [index, viewport] of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 1440, height: 900 }].entries()) {
        await sizedPage.setViewportSize(viewport);
        if (!index) await sizedPage.goto(target(origin)); else await sizedPage.reload();
        await sizedPage.waitForFunction(() => {
          const video = document.querySelector('.launch-frame video');
          return video?.paused && !video.seeking && video.currentTime === 1 && video.readyState >= 2;
        }, null, { polling: 50 });
        await expect(sizedPage.locator('.launch-app')).toHaveAttribute('inert', '');
        await sizedPage.screenshot({ path: path.join(out, `viewport-${viewport.width}x${viewport.height}.png`) });
        assert.equal(await sizedPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await sizedPage.getByRole('button', { name: 'Пропустить заставку' }).click();
        await expect(sizedPage.locator('.launch-screen')).toHaveCount(0);
      }
      await sizes.close();
    }

    // Skip is keyboard accessible and releases focus, scroll and decoder.
    const skipContext = await browser.newContext(options); await fixtures(skipContext);
    const skipPage = await skipContext.newPage(); await skipPage.goto(target(origin));
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
    assert.equal(mediaRequests.length, 0);
    await reduced.close();

    const lifecycle = await browser.newContext(options); await fixtures(lifecycle);
    await lifecycle.addInitScript(() => document.addEventListener('playing', event => {
      const video = event.target;
      if (video instanceof HTMLVideoElement) setTimeout(() => video.pause(), 0);
    }, true));
    const lifecyclePage = await lifecycle.newPage();
    await lifecyclePage.goto(target(origin));
    await lifecyclePage.waitForFunction(() => window.splashMediaEvents.some(event => event.name === 'playing'), null, { polling: 50 });
    await lifecyclePage.emulateMedia({ reducedMotion: 'reduce' });
    await expect(lifecyclePage.locator('.launch-screen')).toHaveCount(0);
    await lifecyclePage.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(lifecyclePage.locator('.launch-screen')).toHaveCount(0);
    await lifecyclePage.reload();
    await lifecyclePage.waitForFunction(() => window.splashMediaEvents.some(event => event.name === 'playing'), null, { polling: 50 });
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
    await lifecycle.close();

    for (const failure of ['network', 'autoplay', 'stall', 'decoder-stall', 'storage']) {
      console.log(`CHECK ${name}: ${failure}`);
      const ctx = await browser.newContext(options); await fixtures(ctx);
      unavailableMedia = failure === 'network';
      if (failure === 'network') await ctx.route('**/splash/**', r => r.abort());
      if (failure === 'autoplay') await ctx.addInitScript(() => { HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Blocked', 'NotAllowedError')); });
      if (failure === 'stall') await ctx.addInitScript(() => { HTMLMediaElement.prototype.play = () => new Promise(() => {}); });
      if (failure === 'decoder-stall') await ctx.addInitScript(() => document.addEventListener('playing', event => {
        const video = event.target;
        if (video instanceof HTMLVideoElement) setTimeout(() => video.pause(), 0);
      }, true));
      if (failure === 'storage') await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } }); });
      const p = await ctx.newPage(); const failures = []; p.on('pageerror', e => failures.push(e.message));
      if (['stall', 'decoder-stall'].includes(failure)) await p.clock.install();
      await p.goto(target(origin));
      if (failure === 'stall') {
        await p.waitForFunction(() => window.splashMediaEvents.some(event => event.name === 'loadstart'), null, { polling: 50 });
        await p.clock.fastForward(2001);
        await p.clock.fastForward(200);
      }
      if (failure === 'decoder-stall') {
        await p.waitForFunction(() => window.splashMediaEvents.some(event => event.name === 'playing'), null, { polling: 50 });
        await p.clock.fastForward(6001);
      }
      if (failure === 'storage') await assertPlayback(p);
      else {
        await expect(p.locator('.launch-screen')).toHaveCount(0, { timeout: 7000 });
        await expect(p.getByRole('heading', { name: 'Приложение', exact: true })).toBeVisible();
        if (failure === 'decoder-stall') {
          assert.equal(await p.evaluate(() => window.splashMediaEvents.some(event => event.name === 'playing')), true);
          await expect(p.locator('#main')).toBeFocused();
        }
        assert.equal(await p.evaluate(() => window.splashMediaEvents.some(event => event.name === 'ended')), false, `${failure} actually interrupted playback`);
      }
      assert.deepEqual(failures, [], failure);
      await ctx.close();
      unavailableMedia = false;
    }
    console.log(`PASS ${name}: exact v2 playback across launches, profile input, navigation, skip/focus, reduced motion and failure recovery`);

    // Use the generated production worker, actual cache and real offline media.
    const offline = await browser.newContext({ ...options, serviceWorkers: 'allow' }); await fixtures(offline);
    const offlinePage = await offline.newPage(); offlinePage.setDefaultTimeout(20000);
    await offlinePage.goto(target(origin)); await assertPlayback(offlinePage);
    await offlinePage.waitForFunction(() => !!navigator.serviceWorker.controller);
    const range = await offlinePage.evaluate(async () => {
      const response = await fetch('/splash/egin-v2.mp4', { headers: { Range: 'bytes=0-15' } });
      return { status: response.status, length: (await response.arrayBuffer()).byteLength, range: response.headers.get('Content-Range') };
    });
    assert.equal(range.status, 206); assert.equal(range.length, 16); assert.match(range.range, /^bytes 0-15\//);
    // Playwright 1.63 WebKit kills SW navigation before worker dispatch when
    // setOffline(true) is used: https://github.com/microsoft/playwright/issues/42775
    // Stop the real origin instead, with a no-worker negative control.
    const port = server.address().port;
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    try {
      const control = await browser.newContext({ ...options, serviceWorkers: 'block' });
      const controlPage = await control.newPage();
      await assert.rejects(controlPage.goto(target(origin), { timeout: 5000 }));
      await control.close();
      const response = await offlinePage.reload({ waitUntil: 'domcontentloaded' });
      assert.equal(response.fromServiceWorker(), true);
      await assertPlayback(offlinePage);
    } finally { await new Promise(resolve => server.listen(port, '127.0.0.1', resolve)); }
    await offline.close();
    console.log(`PASS ${name}: precached range responses and the exact v2 video plays to ended with the origin stopped`);
  } finally { await browser.close(); }
}

async function browserRestart(origin) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'egin-splash-'));
  let context;
  try {
    for (let launch = 0; launch < 2; launch++) {
      context = await chromium.launchPersistentContext(profile, options); await fixtures(context);
      const page = context.pages()[0]; await page.goto(target(origin)); await assertPlayback(page);
      await context.close(); context = null;
    }
    console.log('PASS replacement splash after a full persistent-browser restart');
  } finally {
    if (context) await context.close();
    const resolved = path.resolve(profile), temp = path.resolve(os.tmpdir());
    assert.equal(path.dirname(resolved), temp); assert.ok(path.basename(resolved).startsWith('egin-splash-'));
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
    if (!selected || selected === 'chromium') await browserRestart(origin);
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
