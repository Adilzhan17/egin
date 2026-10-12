// Delayed image layout must keep an opened conversation at its latest message.
// All API/media responses are local fixtures; no real account or database writes.
const { chromium, webkit, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const origin = process.env.EGIN_URL || 'http://localhost:4935';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Isolated localhost preview required');
const out = path.resolve(__dirname, '../../../test-results/chat-media-scroll');
const id = '10000000-0000-4000-8000-000000000001';
const user = { id: 'media-scroll-user', name: 'Айдар', phone: '', farm: '', passkeys: [] };
const peer = { id: 'media-scroll-peer', name: 'Жанна' };
const rows = Array.from({ length: 7 }, (_, index) => ({
  id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, conversationId: id,
  clientId: crypto.randomUUID(), sequence: index + 1, sender: index ? user : peer,
  kind: 'text', text: `Пример сообщения ${index + 1}`, createdAt: '2026-10-12T09:00:00Z',
  editedAt: null, deletedAt: null, attachments: [], replyTo: null, listing: null, location: null,
  readByCount: 0, receipt: index ? { recipientCount: 1, deliveredCount: 1, readCount: 0, version: 1 } : null,
}));
rows[2].kind = 'image'; rows[2].text = '';
rows[2].attachments = Array.from({ length: 10 }, (_, index) => ({
  id: `image-${index}`, kind: 'image', name: 'field.png', size: 1000, mime: 'image/png',
  url: '/chat-fixture-image.svg', thumbnailUrl: '/chat-fixture-image.svg', width: 800, height: 600,
}));
rows[4].kind = 'location'; rows[4].text = '';
rows[4].location = { latitude: 51.16, longitude: 71.44, label: 'Геолокация' };
const conversation = { id, kind: 'direct', title: peer.name, createdAt: rows[0].createdAt, updatedAt: rows.at(-1).createdAt, unreadCount: 0, muted: false, pinned: false, blocked: false, canWrite: true, role: 'member', peer, group: null, listing: null, lastMessage: rows.at(-1) };

async function check(name, engine) {
  const browser = await engine.launch();
  let page;
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference', serviceWorkers: 'block' });
    await context.addInitScript(() => {
      window.EventSource = class extends EventTarget { constructor() { super(); setTimeout(() => this.dispatchEvent(new MessageEvent('ready', { data: '{}' })), 40); } close() {} };
    });
    await context.route('**/chat-fixture-image.svg', async route => {
      await new Promise(resolve => setTimeout(resolve, 150));
      await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#24513c"/><text x="100" y="300" fill="#eff5e7" font-size="48">Северное поле</text></svg>' });
    });
    await context.route('**/api/**', route => {
      const url = new URL(route.request().url()), path = url.pathname;
      const json = data => route.fulfill({ json: data });
      if (path === '/api/session') return json({ user });
      if (path === '/api/chat/conversations') return json({ items: [conversation], nextCursor: null });
      if (path === `/api/chat/conversations/${id}`) return json({ conversation });
      if (path === `/api/chat/conversations/${id}/messages`) return json({ items: rows.filter(row => row.sequence > Number(url.searchParams.get('after') || 0)), hasMore: false, deletedIds: [] });
      if (path.endsWith('/receipts')) return json({ conversationId: id, version: 1, items: rows.filter(row => row.receipt).map(row => ({ messageId: row.id, receipt: row.receipt })), self: { deliveredSequence: 7, readSequence: 7 } });
      if (path.endsWith('/read') || path.endsWith('/delivered')) return json({ ok: true, conversationId: id, version: 1, deliveredSequence: 7, readSequence: 7 });
      return json({ user, items: [], records: [], cursor: 0, more: false, preferences: { interests: [], excludedCategories: [], region: '' } });
    });
    page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/?chat=${id}#/chat`);
    await expect(page.locator('[data-message-id]')).toHaveCount(7);
    await expect(page.locator('.chat-message-images img')).toHaveCount(10);
    await expect.poll(() => page.locator('.chat-message-images img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
    const latest = page.locator('[data-message-id]').last();
    await expect(latest).toBeInViewport();
    await expect.poll(() => latest.evaluate(element => getComputedStyle(element).opacity)).toBe('1');
    await expect.poll(() => page.locator('.chat-history').evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThan(4);
    // Reproduce WebKit delivering a queued scroll event after content growth,
    // before ResizeObserver has had a chance to restore the bottom position.
    await page.locator('.chat-history').evaluate(element => {
      element.querySelector('.chat-message-images').style.paddingBottom = '240px';
      element.dispatchEvent(new Event('scroll'));
    });
    await expect.poll(() => page.locator('.chat-history').evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThan(4);
    await expect(latest).toBeInViewport();
    // An actual upward scroll must still let the reader stay in older history.
    await page.locator('.chat-history').evaluate(element => { element.scrollTop = 0; element.dispatchEvent(new Event('scroll')); });
    await page.locator('.chat-history').evaluate(element => { element.querySelector('.chat-message-images').style.paddingBottom = '480px'; });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.locator('.chat-history').evaluate(element => element.scrollTop), 0);
    await page.locator('.chat-history').evaluate(element => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event('scroll')); });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: path.join(out, name + '.png'), animations: 'disabled' });
    assert.deepEqual(errors, []);
    console.log(`PASS ${name}: delayed 10-photo layout preserves the latest visible message and bottom scroll position`);
  } catch (error) {
    if (page) {
      console.error(name, await page.evaluate(() => ({ history: [...document.querySelectorAll('.chat-history')].map(element => ({ rect: element.getBoundingClientRect().toJSON(), scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight })), last: [...document.querySelectorAll('[data-message-id]')].slice(-1).map(element => ({ rect: element.getBoundingClientRect().toJSON(), opacity: getComputedStyle(element).opacity })) })));
      await page.screenshot({ path: path.join(out, name + '-failure.png'), animations: 'disabled' });
    }
    throw error;
  } finally { await browser.close(); }
}
(async () => { fs.mkdirSync(out, { recursive: true }); await check('chromium', chromium); await check('webkit', webkit); })().catch(error => { console.error(error); process.exitCode = 1; });
