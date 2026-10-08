import { chromium } from '../apps/web/node_modules/@playwright/test/index.mjs';
import { mkdir, readFile, writeFile as writeFileDirect, rename } from 'node:fs/promises';
import { cpus, totalmem } from 'node:os';
import { execFileSync } from 'node:child_process';

async function writeFile(path, contents) {
  await writeFileDirect(path + '.tmp', contents);
  await rename(path + '.tmp', path);
}

// Authenticated lab profiling. Uses existing Chrome/Playwright; never downloads dependencies.
// Credentials are restricted to loopback unless explicit EGIN_PROFILE_ALLOW_REMOTE=1 is set.
const baseURL = process.env.EGIN_WEB_URL || 'http://localhost:3000';
const host = new URL(baseURL).hostname;
if (!['localhost', '127.0.0.1', '[::1]'].includes(host) && process.env.EGIN_PROFILE_ALLOW_REMOTE !== '1') {
  throw new Error('Remote profiling requires an explicit target and EGIN_PROFILE_ALLOW_REMOTE=1.');
}
const label = process.env.PROFILE_LABEL || 'before';
const warmCache = process.env.PROFILE_CACHE === 'warm';
// CDP page throttling/byte counters do not cover fetches made by a Service Worker.
// Cold navigation comparisons therefore bypass SW; warm-cache runs retain the real SW.
const serviceWorkers = process.env.PROFILE_SW || (warmCache ? 'allow' : 'block');
const networkShapingNote = 'Profiles describe configured CDP bandwidth/latency/CPU settings. Recorded NavigationTiming TTFB on loopback does not confirm the configured 150/400 ms effective RTT. SW-network throttling is not guaranteed when SW is allowed.';
const profileDefinitions = [
  { name: 'normal', latency: 0, downloadThroughput: -1, uploadThroughput: -1, cpu: 1 },
  { name: 'fast4g-cpu4', latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8, cpu: 4 },
  { name: 'slow4g-cpu4', latency: 400, downloadThroughput: 500 * 1024 / 8, uploadThroughput: 500 * 1024 / 8, cpu: 4 },
];
const profiles = profileDefinitions.filter(p => !process.env.PROFILE_MODES || process.env.PROFILE_MODES.split(',').includes(p.name));
const routes = (process.env.PROFILE_ROUTES || '/,/map,/assistant,/community,/market').split(',');
const mapRoutes = (process.env.PROFILE_MAP_ROUTES || '/,/map').split(',');
const results = process.env.PROFILE_RESUME === '1'
  ? JSON.parse(await readFile(`artifacts/performance-${label}.json`, 'utf8')).results.filter(r => !profiles.some(p => p.name === r.profile) || !routes.includes(r.route))
  : [];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const login = await browser.newContext();
const auth = await login.request.post(baseURL + '/api/auth/login', { data: { email: process.env.EGIN_PROFILE_EMAIL || 'demo@egin.local', password: process.env.EGIN_PROFILE_PASSWORD || 'EginDemo2026!' } });
if (!auth.ok()) throw new Error('Profile login failed: ' + auth.status());
const state = await login.storageState();
await login.close();
await mkdir('artifacts', { recursive: true });

async function observePage(page) {
  await page.addInitScript(() => {
    performance.setResourceTimingBufferSize(3000);
    window.__profile = { lcp: null, fcp: null, longTasks: [], eventTimings: [], canvasCreatedMs: null, webglFirstDrawMs: null };
    for (const name of ['paint', 'largest-contentful-paint', 'longtask', 'event']) {
      try {
        new PerformanceObserver(list => {
          for (const e of list.getEntries()) {
            if (e.name === 'first-contentful-paint') window.__profile.fcp = e.startTime;
            if (e.entryType === 'largest-contentful-paint') window.__profile.lcp = { timeMs: e.startTime, size: e.size, tag: e.element?.tagName, text: e.element?.textContent?.slice(0, 100) };
            if (e.entryType === 'longtask') window.__profile.longTasks.push({ startMs: e.startTime, durationMs: e.duration });
            if (e.entryType === 'event' && e.interactionId) window.__profile.eventTimings.push({ name: e.name, interactionId: e.interactionId, startMs: e.startTime, durationMs: e.duration, inputDelayMs: e.processingStart - e.startTime, processingMs: e.processingEnd - e.processingStart });
          }
        }).observe({ type: name, buffered: true, ...(name === 'event' ? { durationThreshold: 16 } : {}) });
      } catch { /* Unsupported timing API is recorded as unavailable. */ }
    }
    const observer = new MutationObserver(() => {
      if (window.__profile.canvasCreatedMs === null && document.querySelector('.maplibregl-canvas')) window.__profile.canvasCreatedMs = performance.now();
    });
    observer.observe(document, { childList: true, subtree: true });
    // Observe first WebGL draw without changing drawing behavior. This is not tile completeness.
    for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!C) continue;
      for (const method of ['drawArrays', 'drawElements']) {
        const original = C.prototype[method];
        C.prototype[method] = function (...args) {
          if (window.__profile.webglFirstDrawMs === null) window.__profile.webglFirstDrawMs = performance.now();
          return original.apply(this, args);
        };
      }
    }
  });
}

try {
  for (const profile of profiles) for (const route of routes) {
    const context = await browser.newContext({ storageState: state, serviceWorkers, viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await observePage(page);
    if (warmCache) {
      await page.goto(baseURL + route, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.locator('.app-shell').waitFor({ state: 'visible', timeout: 60000 });
      await page.waitForTimeout(5000);
      for (const worker of context.serviceWorkers()) await worker.evaluate(() => performance.clearResourceTimings());
    }
    const session = await context.newCDPSession(page);
    await session.send('Network.enable');
    await session.send('Network.setCacheDisabled', { cacheDisabled: !warmCache });
    await session.send('Network.emulateNetworkConditions', { offline: false, latency: profile.latency, downloadThroughput: profile.downloadThroughput, uploadThroughput: profile.uploadThroughput, connectionType: profile.name === 'normal' ? 'ethernet' : 'cellular4g' });
    await session.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
    await session.send('Performance.enable');
    const countersBefore = Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
    const requests = new Map();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    session.on('Network.requestWillBeSent', e => requests.set(e.requestId, { path: e.request.url.startsWith(baseURL) ? e.request.url.slice(baseURL.length) : new URL(e.request.url).hostname + new URL(e.request.url).pathname, url: e.request.url, type: e.type, start: e.timestamp, method: e.request.method }));
    session.on('Network.responseReceived', e => { const r = requests.get(e.requestId); if (r) Object.assign(r, { status: e.response.status, mime: e.response.mimeType, response: e.timestamp, contentEncoding: e.response.headers['content-encoding'] || e.response.headers['Content-Encoding'] || null }); });
    session.on('Network.loadingFinished', e => { const r = requests.get(e.requestId); if (r) Object.assign(r, { bytes: e.encodedDataLength, end: e.timestamp }); });
    session.on('Network.loadingFailed', e => { const r = requests.get(e.requestId); if (r) r.failed = e.errorText; });
    let readinessError = null;
    await page.goto(baseURL + route, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const readySelector = { '/': '#current-field', '/map': '.maplibregl-canvas', '/assistant': 'textarea', '/community': '.conversation', '/market': '.listing-card' }[route];
    try { await page.locator(readySelector).first().waitFor({ state: 'visible', timeout: 120000 }); } catch (e) { readinessError = e.message.split('\n')[0]; }
    const readyMs = await page.evaluate(() => performance.now());
    if (mapRoutes.includes(route)) {
      try {
        await page.waitForFunction(() => window.__profile.webglFirstDrawMs !== null, undefined, { timeout: 120000 });
      } catch (e) { readinessError = 'Map WebGL draw: ' + e.message.split('\n')[0]; }
    }
    // Fixed post-ready observation window includes async assets/provider requests without networkidle on realtime pages.
    await page.waitForTimeout(Number(process.env.PROFILE_SETTLE_MS || 5000));
    const beforeInteraction = await page.evaluate(() => ({ ...window.__profile, nav: performance.getEntriesByType('navigation')[0]?.toJSON(), resources: performance.getEntriesByType('resource').map(r => ({ name: r.name, transferSize: r.transferSize, encodedBodySize: r.encodedBodySize, decodedBodySize: r.decodedBodySize, duration: r.duration, initiatorType: r.initiatorType })), sampleEndMs: performance.now(), width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth }));
    // Read-only UI interaction: menu open. Two RAFs measure observed click→render completion, not field INP.
    const button = page.getByRole('button', { name: 'Открыть меню', exact: true });
    let clickToPaintMs = null;
    if (await button.isVisible().catch(() => false)) {
      await page.evaluate(() => {
        window.__profileClick = new Promise(resolve => {
          document.querySelector('[aria-label="Открыть меню"]').addEventListener('click', () => {
            const start = performance.now(); requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - start)));
          }, { once: true });
        });
      });
      await button.click();
      clickToPaintMs = await page.evaluate(() => window.__profileClick);
    }
    await page.waitForTimeout(50); // Allow PerformanceEventTiming observer delivery after the trusted menu click.
    const observedEventTimings = await page.evaluate(() => window.__profile.eventTimings);
    const cdpMetrics = Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
    const serviceWorkerResources = (await Promise.all(context.serviceWorkers().map(worker => worker.evaluate(() => performance.getEntriesByType('resource').map(entry => ({ name: entry.name, transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize, decodedBodySize: entry.decodedBodySize, duration: entry.duration }))).catch(() => [])))).flat().map(entry => ({ ...entry, name: entry.name.startsWith(baseURL) ? entry.name.slice(baseURL.length) : entry.name }));
    const req = [...requests.values()].map(r => ({ path: r.path, method: r.method, type: r.type, status: r.status ?? null, bytes: r.bytes ?? null, durationMs: r.end ? (r.end - r.start) * 1000 : null, ttfbMs: r.response ? (r.response - r.start) * 1000 : null, contentEncoding: r.contentEncoding, failed: r.failed ?? null }));
    const js = req.filter(r => r.type === 'Script'), api = req.filter(r => r.path.startsWith('/api/'));
    const sum = (arr, key) => arr.reduce((total, x) => total + (x[key] || 0), 0);
    const result = { profile: profile.name, route, viewport: '390x844', cache: warmCache ? 'warm browser/SW/IndexedDB cache after unthrottled warmup; server/provider cache retained' : 'cold browser cache; server/provider cache retained', ttfbMs: beforeInteraction.nav.responseStart - beforeInteraction.nav.requestStart, fcpMs: beforeInteraction.fcp, lcp: beforeInteraction.lcp, readyMs, sampleEndMs: beforeInteraction.sampleEndMs, readinessError, jsTransferBytes: sum(js, 'bytes'), jsDecodedBytes: sum(beforeInteraction.resources.filter(r => r.initiatorType === 'script'), 'decodedBodySize'), jsRequests: js.length, pendingJsRequests: js.filter(r => r.bytes === null && !r.failed).length, apiRequests: api.length, apiTransferBytes: sum(api, 'bytes'), apiFailures: api.filter(r => r.status >= 400 || r.failed), longTaskCount: beforeInteraction.longTasks.length, longTaskTotalMs: sum(beforeInteraction.longTasks, 'durationMs'), longTaskMaxMs: Math.max(0, ...beforeInteraction.longTasks.map(x => x.durationMs)), mainThreadTaskMs: cdpMetrics.TaskDuration * 1000, scriptDurationMs: cdpMetrics.ScriptDuration * 1000, observedMenuClickToPaintMs: clickToPaintMs, mapCanvasCreatedMs: beforeInteraction.canvasCreatedMs, mapWebglFirstDrawMs: beforeInteraction.webglFirstDrawMs, overflow: beforeInteraction.overflow, errors, requests: req, longTasks: beforeInteraction.longTasks };
    results.push(result);
    result.serviceWorkerMode = serviceWorkers;
    result.serviceWorkerResources = serviceWorkerResources;
    result.serviceWorkerJsTransferBytes = serviceWorkerResources.filter(entry => entry.name.endsWith('.js')).reduce((sum, entry) => sum + entry.transferSize, 0);
    result.jsTransferBytes += result.serviceWorkerJsTransferBytes;
    result.observedMenuEventTimingMs = observedEventTimings.length ? Math.max(...observedEventTimings.map(entry => entry.durationMs)) : null;
    result.observedMenuEventTimings = observedEventTimings;
    result.fieldINP = null;
    result.fieldINPNote = 'Unavailable: this synthetic menu interaction is not field INP.';
    result.performanceMetricCounters = { before: { TaskDuration: countersBefore.TaskDuration, ScriptDuration: countersBefore.ScriptDuration }, after: { TaskDuration: cdpMetrics.TaskDuration, ScriptDuration: cdpMetrics.ScriptDuration }, units: 'seconds' };
    // CDP counters can include a warmup document. Exclude its already accrued work.
    result.mainThreadTaskMs = cdpMetrics.TaskDuration >= countersBefore.TaskDuration ? (cdpMetrics.TaskDuration - countersBefore.TaskDuration) * 1000 : null;
    result.scriptDurationMs = cdpMetrics.ScriptDuration >= countersBefore.ScriptDuration ? (cdpMetrics.ScriptDuration - countersBefore.ScriptDuration) * 1000 : null;
    await writeFile(`artifacts/performance-${label}.json`, JSON.stringify({ measuredAt: new Date().toISOString(), environment: { baseURL, browser: await browser.version(), revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), workingTreeDirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()), hostCpu: cpus()[0]?.model, hostMemoryBytes: totalmem(), profiles: profileDefinitions, serviceWorkerMode: serviceWorkers, networkShapingNote, sampleCountPerCase: 1, rendering: 'headless Chrome; software WebGL (SwiftShader), not physical phone', notes: 'Navigation lab samples, not field Core Web Vitals. LCP observed for a bounded window. Menu duration is not INP. Server caches are retained; remote tile/provider timing varies. No assistant request or data mutation.' }, results }, null, 2) + '\n');
    console.log(JSON.stringify({ profile: result.profile, route, ttfbMs: Math.round(result.ttfbMs), fcpMs: Math.round(result.fcpMs || 0), lcpMs: Math.round(result.lcp?.timeMs || 0), readyMs: Math.round(readyMs), jsBytes: result.jsTransferBytes, apiCount: api.length, apiBytes: result.apiTransferBytes, longTaskMs: Math.round(result.longTaskTotalMs), mapDrawMs: Math.round(result.mapWebglFirstDrawMs || 0), errors }));
    await context.close();
  }
} finally { await browser.close(); }
