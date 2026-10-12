// Isolated API fixtures + real IndexedDB, File persistence, browser MediaRecorder and uploads.
const { chromium, webkit, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const screenshots = process.env.EGIN_SCREENSHOTS || path.resolve(__dirname, '../../../test-results/chat-outbox');
fs.mkdirSync(screenshots, { recursive: true });
const origin = process.env.EGIN_URL || 'http://localhost:4935';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Use an isolated local preview');
const conversationId = '10000000-0000-4000-8000-000000000061';
const userA = { id: 'outbox-user-a', name: 'Фермер А', phone: '', farm: '', passkeys: [] }, userB = { ...userA, id: 'outbox-user-b', name: 'Фермер Б' };
const peer = { id: 'outbox-peer', name: 'Агроном' };
const document = { name: 'Отчёт.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\nLocal outbox fixture') };
async function saved(page) { return page.evaluate(() => new Promise((resolve, reject) => { const open = indexedDB.open('egin-chat-outbox-v1', 1); open.onsuccess = () => { const db = open.result, request = db.transaction('messages').objectStore('messages').getAll(); request.onsuccess = () => { resolve(request.result.map(entry => ({ ...entry, files: entry.files.map(item => { const file = item.file.encoding === 'array-buffer-v1' ? new File([item.file.data], item.file.name, { type: item.file.type, lastModified: item.file.lastModified }) : item.file; return { ...item, file: { name: file.name, size: file.size, type: file.type, isBlob: file instanceof Blob } }; }) }))); db.close(); }; request.onerror = () => reject(request.error); }; open.onerror = () => reject(open.error); })); }
async function network(page, online) { await page.evaluate(value => { window.outboxOnline = value; localStorage.setItem('test.outbox.offline', value ? '0' : '1'); window.dispatchEvent(new Event(value ? 'online' : 'offline')); }, online); }
async function sendText(page, text) { await page.getByRole('textbox', { name: 'Сообщение', exact: true }).fill(text); await page.getByRole('button', { name: 'Отправить', exact: true }).click(); await expect(page.getByRole('textbox', { name: 'Сообщение', exact: true })).toHaveValue(''); }
async function attachDocument(page) { await page.getByRole('button', { name: 'Прикрепить', exact: true }).click(); await page.getByRole('button', { name: 'Документ', exact: true }).click(); await page.locator('.chat-composer input[type="file"][accept=".pdf,.docx,.xlsx"]').setInputFiles(document); }

async function webkitBinaryOutbox() {
  // WebKit's interception protocol omits bodies sent as File. A loopback receiver
  // verifies the actual binary request instead of trusting postDataBuffer().
  const uploadBodies = [], uploads = [], uploadNames = [];
  const receiver = http.createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', new URL(origin).origin); response.setHeader('Access-Control-Allow-Credentials', 'true'); response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-EGIN, X-EGIN-Outbox-User');
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    const chunks = []; request.on('data', chunk => chunks.push(chunk)); request.on('end', () => {
      const bytes = Buffer.concat(chunks), url = new URL(request.url, 'http://localhost'); uploadBodies.push(bytes); uploadNames.push(url.searchParams.get('name'));
      const attachment = { id: 'webkit-pdf', kind: 'document', name: document.name, mimeType: document.mimeType, size: bytes.length, url: '/api/chat/test-pdf' }; uploads.push(attachment); response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ attachment }));
    });
  });
  await new Promise(resolve => receiver.listen(0, '127.0.0.1', resolve));
  const receiverPort = receiver.address().port; let browser;
  try {
    browser = await webkit.launch();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const rows = [], posts = []; let releaseAck = null;
    const conversation = () => ({ id: conversationId, kind: 'direct', title: peer.name, peer, group: null, listing: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), unreadCount: 0, muted: false, pinned: false, blocked: false, canWrite: true, role: 'member', lastMessage: rows.at(-1) || null });
    await context.addInitScript(() => {
      window.outboxOnline = localStorage.getItem('test.outbox.offline') !== '1'; Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => window.outboxOnline });
      window.EventSource = class extends EventTarget { constructor() { super(); setTimeout(() => this.dispatchEvent(new MessageEvent('ready', { data: '{}' })), 20); } close() {} };
    });
    await context.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method(), json = value => route.fulfill({ json: value });
      if (path === '/api/session') return json({ user: userA });
      if (path === '/api/chat/conversations') return json({ items: [conversation()], nextCursor: null });
      if (path === `/api/chat/conversations/${conversationId}`) return json({ conversation: conversation() });
      if (path.endsWith('/attachments') && method === 'POST') {
        assert.equal(request.headers()['x-egin-outbox-user'], userA.id);
        return route.continue({ url: `http://127.0.0.1:${receiverPort}${url.pathname}${url.search}` });
      }
      if (path.endsWith('/messages') && method === 'POST') {
        const draft = request.postDataJSON(); posts.push(draft);
        const message = { id: crypto.randomUUID(), clientId: draft.clientId, conversationId, sender: userA, sequence: rows.length + 1, kind: draft.kind, text: draft.text || '', createdAt: new Date().toISOString(), editedAt: null, deletedAt: null, attachments: draft.attachmentIds ? uploads : [], replyTo: null, listing: null, location: null, readByCount: 0 };
        if (posts.length === 1) await new Promise(resolve => { releaseAck = resolve; }); rows.push(message); return json({ message });
      }
      if (path.endsWith('/messages')) return json({ items: rows, hasMore: false });
      if (path.endsWith('/read') || path.endsWith('/delivered')) return json({ ok: true });
      if (path.startsWith('/api/chat/')) return json({ items: [], preferences: { region: '', interests: [], excludedCategories: [] } });
      return json({ user: userA, records: [], cursor: 0, more: false });
    });
    const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(15000);
    await page.goto(`${origin}/?chat=${conversationId}#/chat`); await expect(page.getByRole('textbox', { name: 'Сообщение', exact: true })).toBeVisible();
    await network(page, false); await sendText(page, 'Safari сохраняет очередь'); await attachDocument(page); await page.getByRole('button', { name: 'Отправить', exact: true }).click();
    await expect(page.locator('[data-outbox-state="queued"]')).toHaveCount(2).catch(async error => { console.log('WebKit queue diagnostics', await saved(page), await page.locator('.chat-composer').innerText(), errors); throw error; }); const before = await saved(page); assert.equal(posts.length, 0); assert.equal(uploads.length, 0);
    await page.reload(); await expect(page.locator('[data-outbox-state="queued"]')).toHaveCount(2);
    await expect(page.locator('.mobile-shell > .connection-note').filter({ hasText: 'Без сети' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      const bannerBottom = Math.max(...Array.from(document.querySelectorAll('.mobile-shell > .connection-note'), node => node.getBoundingClientRect().bottom));
      return bannerBottom - document.querySelector('.chat-thread-header').getBoundingClientRect().top;
    }), { message: 'Offline banners stay above the chat header after a WebKit reload' }).toBeLessThanOrEqual(0.5);
    await page.screenshot({ path: path.join(screenshots, 'webkit-queued-390.png'), fullPage: true });
    const restored = await saved(page); assert.deepEqual(restored.map(entry => entry.clientId).sort(), before.map(entry => entry.clientId).sort());
    assert.deepEqual(restored.find(entry => entry.draft.kind === 'document').files[0].file, { name: document.name, size: document.buffer.length, type: document.mimeType, isBlob: true });
    await network(page, true); await expect.poll(() => Boolean(releaseAck)).toBe(true); await expect(page.locator('[data-outbox-state="sending"]')).toHaveCount(1);
    assert.equal((await saved(page)).length, 2, 'A held server ACK cannot clear durable rows'); releaseAck();
    await expect.poll(async () => (await saved(page)).length, { timeout: 15000 }).toBe(0); await expect(page.locator('[data-outbox-state]')).toHaveCount(0);
    assert.equal(posts.length, 2); assert.equal(uploads.length, 1); assert.deepEqual(uploadBodies[0], document.buffer, 'WebKit uploads exactly the persisted PDF bytes'); assert.equal(uploadNames[0], document.name); assert.deepEqual(posts.find(post => post.kind === 'document').attachmentIds, ['webkit-pdf']); assert.deepEqual(errors, []);
    console.log('PASS WebKit durable outbox: offline text + PDF, reload retains UUID/File name/type/exact bytes, unobscured offline header, server ACK and online drain');
  } finally { await browser?.close(); receiver.closeAllConnections(); await new Promise(resolve => receiver.close(resolve)); }
}

(async () => {
  if (process.env.EGIN_OUTBOX_WEBKIT_ONLY === '1') { await webkitBinaryOutbox(); return; }
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block' });
    let currentUser = userA, rows = [], uploads = [], posts = [], loseResponse = false, rejectSend = false, holdNext = false, releaseAck = null;
    const listing = { id: 'market-outbox', title: 'Пшеница', status: 'published', priceAmount: 90000, priceMode: 'fixed', priceUnit: 'ton', regionName: 'Акмола', url: '#/market' };
    const conversation = () => ({ id: conversationId, kind: 'direct', title: peer.name, peer, group: null, listing: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), unreadCount: 0, muted: false, pinned: false, blocked: false, canWrite: true, role: 'member', lastMessage: rows.at(-1) || null });
    await context.addInitScript(() => {
      window.outboxOnline = localStorage.getItem('test.outbox.offline') !== '1'; Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => window.outboxOnline });
      window.outboxStreams = []; window.EventSource = class extends EventTarget { constructor() { super(); window.outboxStreams.push(this); setTimeout(() => this.dispatchEvent(new MessageEvent('ready', { data: '{}' })), 20); } close() { window.outboxStreams = window.outboxStreams.filter(stream => stream !== this); } };
      window.outboxEvent = (type, data) => window.outboxStreams.forEach(stream => stream.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) })));
      window.outboxAudioContexts = [];
      navigator.mediaDevices.getUserMedia = async () => { const ctx = new AudioContext(), oscillator = ctx.createOscillator(), destination = ctx.createMediaStreamDestination(); oscillator.connect(destination); oscillator.start(); await ctx.resume(); window.outboxAudioContexts.push(ctx); return destination.stream; };
    });
    await context.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method(), json = value => route.fulfill({ json: value });
      if (path === '/api/session') return json({ user: currentUser });
      if (path === '/api/chat/conversations') return json({ items: [conversation()], nextCursor: null });
      if (path === `/api/chat/conversations/${conversationId}`) return json({ conversation: conversation() });
      if (path === '/api/chat/listings') return json({ items: [listing] });
      if (method !== 'GET' && request.headers()['x-egin-outbox-user'] && request.headers()['x-egin-outbox-user'] !== currentUser.id) return route.fulfill({ status: 403, json: { error: 'Аккаунт изменился' } });
      if (path.endsWith('/attachments') && method === 'POST') {
        const attachment = { id: `attachment-${uploads.length}`, kind: url.searchParams.get('kind'), name: url.searchParams.get('name'), mimeType: 'application/octet-stream', size: request.postDataBuffer().length, url: '/api/chat/fixture-file', ...(url.searchParams.get('kind') === 'audio' ? { duration: 1, waveform: Array.from({ length: 40 }, () => .5) } : {}) }; uploads.push(attachment); return json({ attachment });
      }
      if (path.endsWith('/messages') && method === 'POST') {
        const body = request.postDataJSON(); posts.push(body); if (rejectSend) { rejectSend = false; return route.fulfill({ status: 503, json: { error: 'Попробуйте отправить ещё раз' } }); }
        let message = rows.find(item => item.clientId === body.clientId);
        if (!message) { message = { id: crypto.randomUUID(), clientId: body.clientId, conversationId, sender: currentUser, sequence: rows.length + 1, kind: body.kind, text: body.text || '', createdAt: new Date().toISOString(), editedAt: null, deletedAt: null, attachments: uploads.filter(file => body.attachmentIds?.includes(file.id)), replyTo: null, listing: body.listingId ? listing : null, location: body.location || null, readByCount: 0 }; rows.push(message); }
        if (holdNext) { holdNext = false; await new Promise(resolve => { releaseAck = resolve; }); }
        if (loseResponse) { loseResponse = false; return route.abort('connectionclosed'); }
        return json({ message });
      }
      if (path.endsWith('/messages')) return json({ items: rows, hasMore: false });
      if (path === '/api/chat/fixture-file') return route.fulfill({ status: 404 });
      if (path.endsWith('/read') || path.endsWith('/delivered')) return json({ ok: true });
      if (path.startsWith('/api/chat/')) return json({ items: [], preferences: { region: '', interests: [], excludedCategories: [] } });
      return json({ user: currentUser, records: [], cursor: 0, more: false });
    });
    const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(15000);
    await page.goto(`${origin}/?chat=${conversationId}#/chat`); await expect(page.getByRole('textbox', { name: 'Сообщение', exact: true })).toBeVisible();
    const png = Buffer.from(await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 20; canvas.height = 20; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#24513c'; ctx.fillRect(0, 0, 20, 20); return canvas.toDataURL('image/png').split(',')[1]; }), 'base64');
    await network(page, false); await sendText(page, 'Офлайн текст не теряется');
    await attachDocument(page); await page.getByRole('button', { name: 'Отправить', exact: true }).click(); await expect(page.locator('.chat-pending-file.document')).toHaveCount(0);
    await page.getByRole('button', { name: 'Прикрепить', exact: true }).click(); await page.getByRole('button', { name: 'Фото', exact: true }).click(); await page.locator('.chat-composer input[type="file"][multiple]').setInputFiles([{ name: 'Поле-1.png', mimeType: 'image/png', buffer: png }, { name: 'Поле-2.png', mimeType: 'image/png', buffer: png }]); await page.getByRole('button', { name: 'Отправить', exact: true }).click();
    await page.getByRole('button', { name: 'Записать голосовое сообщение', exact: true }).click(); await expect(page.locator('.chat-recording')).toBeVisible(); await page.waitForTimeout(650); await page.getByRole('button', { name: 'Завершить запись', exact: true }).click(); await expect(page.locator('.chat-pending-file.audio')).toBeVisible(); await page.getByRole('button', { name: 'Отправить', exact: true }).click();
    await page.getByRole('button', { name: 'Прикрепить', exact: true }).click(); await page.getByRole('button', { name: 'Объявление', exact: true }).click(); await page.locator('.chat-listing-picker button').filter({ hasText: 'Пшеница' }).click(); await page.getByRole('button', { name: 'Отправить', exact: true }).click();
    await expect.poll(async () => (await saved(page)).length).toBe(5);
    const before = await saved(page); assert.deepEqual(before.map(entry => entry.draft.kind).sort(), ['audio', 'document', 'image', 'listing_reference', 'text']); assert(before.every(entry => entry.state === 'queued')); assert.equal(posts.length, 0); assert.equal(uploads.length, 0);
    assert(before.flatMap(entry => entry.files).every(file => file.file.isBlob && file.file.size > 0));
    await page.reload(); await expect.poll(async () => (await saved(page)).length).toBe(5); assert.deepEqual((await saved(page)).map(entry => entry.clientId).sort(), before.map(entry => entry.clientId).sort());
    await expect(page.locator('[data-outbox-state="queued"]')).toHaveCount(5);
    await page.screenshot({ path: path.join(screenshots, 'queued-390.png'), fullPage: true });
    // Discarding a queued photo in another tab closes its local gallery before URL revocation can leave a broken image.
    await page.getByRole('button', { name: 'Прикрепить', exact: true }).click(); await page.getByRole('button', { name: 'Фото', exact: true }).click(); await page.locator('.chat-composer input[type="file"][multiple]').setInputFiles([{ name: 'Временное-фото.png', mimeType: 'image/png', buffer: png }]); await page.getByRole('button', { name: 'Отправить', exact: true }).click();
    await expect.poll(async () => (await saved(page)).length).toBe(6); const galleryId = (await saved(page)).find(entry => !before.some(previous => previous.clientId === entry.clientId)).clientId;
    await page.locator(`[data-client-id="${galleryId}"]`).getByRole('button', { name: 'Фото 1', exact: true }).click(); await expect(page.getByRole('dialog', { name: 'Фотографии', exact: true })).toBeVisible();
    const discardTab = await context.newPage(); await discardTab.goto(`${origin}/?chat=${conversationId}#/chat`); await discardTab.locator(`[data-client-id="${galleryId}"]`).getByRole('button', { name: 'Ожидает сети', exact: true }).click(); discardTab.once('dialog', dialog => dialog.accept()); await discardTab.getByRole('button', { name: 'Убрать из очереди', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Фотографии', exact: true })).toHaveCount(0); await expect.poll(async () => (await saved(page)).length).toBe(5); await discardTab.close();
    // HTTP response is the ACK: a locally queued row stays sending until it arrives.
    holdNext = true; await network(page, true); await expect.poll(() => Boolean(releaseAck)).toBe(true); await expect(page.locator('[data-outbox-state="sending"]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Назад к чатам', exact: true }).click(); releaseAck();
    await expect.poll(async () => (await saved(page)).length, { timeout: 20000 }).toBe(0).catch(async error => { console.log((await saved(page)).map(entry => ({ state: entry.state, error: entry.error, kind: entry.draft.kind }))); throw error; }); assert.equal(rows.length, 5); assert.equal(posts.length, 5); assert.equal(uploads.length, 4);
    // Lost ACK keeps the same UUID and previously uploaded attachment after a reload.
    await page.goto(`${origin}/?chat=${conversationId}#/chat`); rejectSend = true; await attachDocument(page); await page.getByRole('button', { name: 'Отправить', exact: true }).click();
    await expect(page.locator('[data-outbox-state="failed"]')).toHaveCount(1); const failed = (await saved(page))[0], uploadCount = uploads.length; assert(failed.files[0].uploaded?.id);
    await page.reload(); await expect(page.locator('[data-outbox-state="failed"]')).toHaveCount(1);
    await page.screenshot({ path: path.join(screenshots, 'failed-390.png'), fullPage: true });
    await page.locator('[data-outbox-state="failed"]').getByRole('button', { name: /Повторить/ }).click(); await expect.poll(async () => (await saved(page)).length).toBe(0);
    assert.equal(uploads.length, uploadCount, 'A valid uploaded attachment is reused'); assert.equal(rows.filter(row => row.clientId === failed.clientId).length, 1); assert.equal(posts.filter(post => post.clientId === failed.clientId).length, 2);
    loseResponse = true; await sendText(page, 'Ответ потерялся после commit'); await expect(page.locator('[data-outbox-state="failed"]')).toHaveCount(1); const lostId = (await saved(page))[0].clientId; await page.locator('[data-outbox-state="failed"]').getByRole('button', { name: /Повторить/ }).click(); await expect.poll(async () => (await saved(page)).length).toBe(0); assert.equal(rows.filter(row => row.clientId === lostId).length, 1); assert.equal(posts.filter(post => post.clientId === lostId).length, 2);
    // Switching accounts never reveals or sends another user's persisted queue.
    await network(page, false); await sendText(page, 'Личное сообщение аккаунта А'); const privateId = (await saved(page))[0].clientId; currentUser = userB; await page.reload(); await network(page, true);
    await expect(page.locator('[data-outbox-state]')).toHaveCount(0); await page.waitForTimeout(500); assert(!posts.some(post => post.clientId === privateId));
    currentUser = userA; await page.reload(); await expect.poll(async () => (await saved(page)).length).toBe(0); assert.equal(rows.filter(row => row.clientId === privateId).length, 1);
    // Two tabs racing to resume a queue claim the message atomically.
    await network(page, false); await sendText(page, 'Две вкладки — одно сообщение'); const raceId = (await saved(page))[0].clientId;
    const other = await context.newPage(); await other.goto(`${origin}/?chat=${conversationId}#/chat`); await expect(other.locator('[data-outbox-state="queued"]')).toHaveCount(1);
    await Promise.all([network(page, true), network(other, true)]); await expect.poll(async () => (await saved(page)).length).toBe(0); assert.equal(posts.filter(post => post.clientId === raceId).length, 1); await other.close();
    // A deleted source must also disappear from a durable offline quote after reload.
    await network(page, false); const quoted = rows.find(row => row.kind === 'text');
    await page.locator(`[data-message-id="${quoted.id}"] .chat-message-actions`).click(); await page.getByRole('button', { name: 'Ответить', exact: true }).click(); await sendText(page, 'Ответ в офлайн очереди');
    await expect.poll(async () => (await saved(page))[0]?.replyTo?.id).toBe(quoted.id);
    quoted.deletedAt = new Date().toISOString(); quoted.text = ''; quoted.attachments = [];
    await page.evaluate(({ conversationId, messageId, deletedAt }) => window.outboxEvent('message.deleted', { conversationId, messageId, deletedAt }), { conversationId, messageId: quoted.id, deletedAt: quoted.deletedAt });
    await expect.poll(async () => (await saved(page))[0]?.replyTo).toBe(null); assert.equal((await saved(page))[0].draft.replyToMessageId, undefined);
    await page.reload(); await expect(page.locator('[data-outbox-state="queued"] .chat-reply-quote')).toHaveCount(0);
    // Backwards-compatible adapter also accepts a queue created with the old File format.
    const legacyId = await page.evaluate(async ({ userId, conversationId, bytes, name, type }) => {
      const clientId = crypto.randomUUID(), open = indexedDB.open('egin-chat-outbox-v1', 1), db = await new Promise((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
      await new Promise((resolve, reject) => { const tx = db.transaction('messages', 'readwrite'); tx.objectStore('messages').put({ key: `${userId}:${conversationId}:${clientId}`, userId, conversationId, clientId, createdAt: new Date().toISOString(), state: 'queued', progress: 0, attempts: 0, draft: { clientId, kind: 'document', text: '' }, files: [{ key: 'legacy-file', kind: 'document', file: new File([new Uint8Array(bytes)], name, { type }) }], replyTo: null, listing: null }); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close(); return clientId;
    }, { userId: userA.id, conversationId, bytes: [...document.buffer], name: document.name, type: document.mimeType });
    await page.reload(); await expect(page.locator(`[data-client-id="${legacyId}"] .chat-document`)).toContainText(document.name); await network(page, true); await expect.poll(async () => (await saved(page)).length).toBe(0); assert(rows.some(row => row.clientId === legacyId)); await network(page, false);
    // Quota is explicit and never discards a new draft or an existing queued item.
    await page.evaluate(async ({ userId, conversationId }) => {
      const open = indexedDB.open('egin-chat-outbox-v1', 1), db = await new Promise((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
      await new Promise((resolve, reject) => { const tx = db.transaction('messages', 'readwrite'), store = tx.objectStore('messages'); store.clear(); for (let i = 0; i < 50; i++) { const clientId = crypto.randomUUID(); store.put({ key: `${userId}:${conversationId}:${clientId}`, userId, conversationId, clientId, createdAt: new Date().toISOString(), state: 'queued', progress: 0, attempts: 0, draft: { clientId, kind: 'text', text: `Quota fixture ${i}` }, files: [], replyTo: null, listing: null }); } tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close();
    }, { userId: userA.id, conversationId });
    await page.getByRole('textbox', { name: 'Сообщение', exact: true }).fill('Черновик сверх лимита остаётся здесь'); await page.getByRole('button', { name: 'Отправить', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'В очереди уже 50 сообщений' })).toBeVisible(); await expect(page.getByRole('textbox', { name: 'Сообщение', exact: true })).toHaveValue('Черновик сверх лимита остаётся здесь'); assert.equal((await saved(page)).length, 50);
    const quotaEntries = await saved(page), removeId = quotaEntries[0].clientId, keepId = quotaEntries[1].clientId;
    await page.evaluate(key => new Promise((resolve, reject) => { const open = indexedDB.open('egin-chat-outbox-v1', 1); open.onsuccess = () => { const db = open.result, tx = db.transaction('messages', 'readwrite'), store = tx.objectStore('messages'), get = store.get(key); get.onsuccess = () => store.put({ ...get.result, state: 'failed', error: 'Нет права на отправку' }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; }), quotaEntries[0].key);
    await page.reload(); await page.locator(`[data-client-id="${removeId}"]`).getByRole('button', { name: 'Не доставлено', exact: true }).click(); page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Убрать из очереди', exact: true }).click();
    await expect.poll(async () => (await saved(page)).length).toBe(49); assert(!(await saved(page)).some(entry => entry.clientId === removeId)); assert((await saved(page)).some(entry => entry.clientId === keepId));
    assert.deepEqual(errors, []);
    await page.evaluate(async () => { await Promise.all(window.outboxAudioContexts.map(ctx => ctx.close())); });
    console.log('PASS Chat durable outbox: all media + multiple photos, real recording, offline/reload, server ACK, list-view background drain, lost-response stable UUID/reused upload, cross-user isolation, two-tab lease, deleted-quote scrub, quota retains draft, targeted failed-entry discard, legacy File compatibility, cross-tab gallery discard');
  } finally { await browser.close(); }
  await webkitBinaryOutbox();
})().catch(error => { console.error(error); process.exitCode = 1; });
