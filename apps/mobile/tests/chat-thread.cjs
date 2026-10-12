// Deterministic UI regressions; API fixtures remain local to this browser context.
const { chromium, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const origin = process.env.EGIN_URL || 'http://localhost:4935';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Use an isolated local preview');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const id = '10000000-0000-4000-8000-000000000001';
    const user = { id: 'thread-test-user', name: 'Тестовый фермер', phone: '', farm: '', passkeys: [] };
    const peer = { id: 'thread-test-peer', name: 'Агроном' };
    const makeMessage = (sequence, sender = peer, text = `Сообщение ${sequence}. Проверка истории и положения прокрутки.`) => ({ id: `20000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`, conversationId: id, sender, clientId: crypto.randomUUID(), sequence, kind: 'text', text, createdAt: new Date(2026, 9, 12, 11, sequence).toISOString(), editedAt: null, deletedAt: null, attachments: [], replyTo: null, listing: null, location: null, readByCount: 0 });
    let rows = Array.from({ length: 500 }, (_, i) => makeMessage(i + 1, i === 499 ? user : peer));
    let loseNext = true, canWrite = true; let heldHistory = null, holdHistory = false; const sends = [], historyRequests = [], readRequests = [], receiptRequests = [], errors = [];
    let deliveredSequence = 500, readSequence = 0, receiptVersion = 1, listRequests = 0;
    rows.at(-1).receipt = { recipientCount: 1, deliveredCount: 0, readCount: 0, version: receiptVersion };
    const conversation = () => ({ id, kind: 'direct', title: peer.name, createdAt: rows[0].createdAt, updatedAt: rows.at(-1).createdAt, unreadCount: 0, muted: false, pinned: false, blocked: false, canWrite, role: 'member', peer, group: null, listing: null, lastMessage: rows.at(-1) });
    await context.addInitScript(() => {
      const streams = [];
      window.EventSource = class extends EventTarget { constructor() { super(); streams.push(this); setTimeout(() => this.dispatchEvent(new MessageEvent('ready', { data: '{}' })), 40); } close() { streams.splice(streams.indexOf(this), 1); } };
      window.chatFixtureEvent = data => streams.forEach(stream => stream.dispatchEvent(new MessageEvent(data.type === 'message.deleted' ? 'message.deleted' : 'change', { data: JSON.stringify(data) })));
      const viewport = new EventTarget(); Object.assign(viewport, { height: 844, width: 390, offsetTop: 0, offsetLeft: 0, scale: 1 });
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
      window.chatFixtureViewport = (height, offsetTop = 0, scale = 1) => { Object.assign(viewport, { height, offsetTop, scale }); viewport.dispatchEvent(new Event('resize')); viewport.dispatchEvent(new Event('scroll')); };
    });
    await context.route('**/api/**', async route => {
      const req = route.request(), url = new URL(req.url()), path = url.pathname, method = req.method(); const json = value => route.fulfill({ json: value });
      if (path === '/api/session') return json({ user });
      if (path === '/api/chat/conversations') { listRequests++; return json({ items: [conversation()], nextCursor: null }); }
      if (path === `/api/chat/conversations/${id}`) return json({ conversation: conversation() });
      if (path === `/api/chat/conversations/${id}/receipts`) { receiptRequests.push(url.search); return json({ conversationId: id, version: receiptVersion, items: rows.filter(row => row.sender.id === user.id && !row.deletedAt && row.receipt).map(row => ({ messageId: row.id, receipt: row.receipt })), self: { deliveredSequence, readSequence } }); }
      if (path === `/api/chat/conversations/${id}/delivered`) { deliveredSequence = Math.max(deliveredSequence, req.postDataJSON().sequence); return json({ ok: true, conversationId: id, deliveredSequence, readSequence, version: receiptVersion }); }
      if (path === `/api/chat/conversations/${id}/messages` && method === 'GET') {
        historyRequests.push(url.search); const before = Number(url.searchParams.get('before')), after = Number(url.searchParams.get('after'));
        const filtered = rows.filter(row => (!before || row.sequence < before) && (!after || row.sequence > after)); const selected = after ? filtered.slice(0, 50) : filtered.slice(-50);
        if (holdHistory) { holdHistory = false; const snapshot = JSON.parse(JSON.stringify({ items: selected, hasMore: filtered.length > 50 })); heldHistory = () => json(snapshot); return; }
        return json({ items: selected, hasMore: filtered.length > 50, deletedIds: (url.searchParams.get('reconcile') || '').split(',').filter(id => rows.some(row => row.id === id && row.deletedAt)) });
      }
      if (path === `/api/chat/conversations/${id}/messages` && method === 'POST') {
        const body = req.postDataJSON(); sends.push(body); let message = rows.find(row => row.clientId === body.clientId);
        if (!message) { message = { ...makeMessage(rows.at(-1).sequence + 1, user, body.text), clientId: body.clientId }; rows.push(message); }
        if (loseNext) { loseNext = false; return route.abort('internetdisconnected'); }
        return json({ message });
      }
      if (path.startsWith(`/api/chat/conversations/${id}/messages/`) && method === 'PATCH') { const message = rows.find(row => row.id === path.split('/').at(-1)); message.text = req.postDataJSON().text; message.editedAt = new Date().toISOString(); return json({ message }); }
      if (path.endsWith('/read')) { readRequests.push(req.postDataJSON().sequence); readSequence = Math.max(readSequence, req.postDataJSON().sequence); deliveredSequence = Math.max(deliveredSequence, readSequence); return json({ ok: true, conversationId: id, deliveredSequence, readSequence, version: receiptVersion }); }
      if (path.startsWith('/api/chat/')) return json({ items: [], preferences: { region: '', interests: [], excludedCategories: [] } });
      return json({ user, records: [], cursor: 0, more: false });
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/?chat=${id}#/chat`); const input = page.locator('.chat-composer textarea'); await expect(input).toBeVisible();
    await expect(page.locator('[data-message-id]')).toHaveCount(50);
    await expect.poll(() => readRequests.includes(500)).toBe(true);
    // A receipt-only SSE event updates status without re-fetching any message bodies.
    // A real self cursor also exercises list-driven delivery sync (Infinity targets used to amplify GETs).
    await page.waitForLoadState('networkidle'); historyRequests.length = 0; const receiptCountBefore = receiptRequests.length, listCountBefore = listRequests;
    receiptVersion++; rows.at(-1).receipt = { recipientCount: 1, deliveredCount: 1, readCount: 0, version: receiptVersion };
    await page.evaluate(data => window.chatFixtureEvent(data), { conversationId: id, userId: peer.id, sequence: 500, version: receiptVersion, type: 'message.delivered' });
    await expect(page.locator(`[data-message-id="${rows.at(-1).id}"] .chat-message-status`)).toHaveAttribute('data-message-status', 'delivered');
    await expect.poll(() => listRequests).toBeGreaterThan(listCountBefore);
    await page.waitForLoadState('networkidle');
    assert(receiptRequests.length > receiptCountBefore, 'receipt event must reconcile authoritative receipt status');
    assert.deepEqual(historyRequests, [], 'receipt-only SSE must not reload complete or incremental message history');
    // A normal unsent draft must survive a separate edit and a page reload.
    await input.fill('Несохранённый в отправленных сообщениях черновик');
    await page.locator('[data-message-id]').last().locator('.chat-message-actions').click();
    await page.getByRole('button', { name: 'Редактировать', exact: true }).click(); await input.fill('Исправленный текст отправленного сообщения');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(input).toHaveValue('Несохранённый в отправленных сообщениях черновик');
    await page.reload(); await expect(input).toHaveValue('Несохранённый в отправленных сообщениях черновик'); await page.waitForLoadState('networkidle');
    // First request commits but response is lost. Retry must use the identical client UUID.
    await page.getByRole('button', { name: 'Отправить', exact: true }).click();
    const failed = page.locator('.chat-local-message').filter({ hasText: 'Несохранённый в отправленных сообщениях черновик' });
    await expect(failed).toHaveAttribute('data-outbox-state', 'failed');
    await expect(failed.locator('.chat-message-status')).toHaveAttribute('data-message-status', 'failed');
    await expect(input).toHaveValue(''); // Only cleared after durable queue storage succeeds.
    const failedClientId = await failed.getAttribute('data-client-id');
    assert.equal(failedClientId, sends[0].clientId);
    const stored = await page.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open('egin-chat-outbox-v1', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { const db = request.result, transaction = db.transaction('messages', 'readonly'), get = transaction.objectStore('messages').getAll(); get.onsuccess = () => resolve(get.result); get.onerror = () => reject(get.error); transaction.oncomplete = () => db.close(); };
    }));
    assert.equal(stored.length, 1); assert.equal(stored[0].clientId, failedClientId);
    assert.equal(stored[0].draft.text, 'Несохранённый в отправленных сообщениях черновик');
    await failed.getByRole('button', { name: 'Повторить', exact: true }).click();
    await expect(failed).toHaveCount(0); await expect(input).toHaveValue('');
    await expect(page.locator(`[data-message-id="${rows.at(-1).id}"]`)).toHaveCount(1);
    assert.equal(sends.length, 2); assert.equal(sends[0].clientId, sends[1].clientId); assert.equal(rows.filter(row => row.clientId === sends[0].clientId).length, 1);
    // Prepending history and receiving new messages preserve the visible old message anchor.
    await page.locator('.chat-history').evaluate(element => { element.scrollTop = 0; element.dispatchEvent(new Event('scroll')); });
    const anchorId = await page.locator('[data-message-id]').first().getAttribute('data-message-id');
    const before = await page.locator(`[data-message-id="${anchorId}"]`).boundingBox();
    await page.getByRole('button', { name: 'Загрузить предыдущие сообщения', exact: true }).click();
    await expect(page.locator('[data-message-id]')).toHaveCount(101);
    await expect.poll(async () => Math.abs(before.y - (await page.locator(`[data-message-id="${anchorId}"]`).boundingBox()).y)).toBeLessThan(3);
    const after = await page.locator(`[data-message-id="${anchorId}"]`).boundingBox();
    historyRequests.length = 0; rows.push(makeMessage(502));
    await page.evaluate(id => window.chatFixtureEvent({ conversationId: id, type: 'messages' }), id);
    await expect(page.locator('[data-message-id]')).toHaveCount(102);
    const afterEvent = await page.locator(`[data-message-id="${anchorId}"]`).boundingBox(); assert(Math.abs(after.y - afterEvent.y) <= 3, 'new message must not jump to bottom');
    assert(historyRequests.some(search => search === '?after=501'), 'new-message SSE fetches incremental history');
    assert(!historyRequests.some(search => search.startsWith('?before=')), 'new-message SSE must not reload old pages');
    // A dedicated deletion removes content and loaded quotes immediately, even while an old history response is in flight.
    const target = rows.find(row => row.sequence === 490); const quote = makeMessage(503, peer, 'Ответ останется без удалённой цитаты');
    quote.replyTo = { id: target.id, text: target.text, kind: 'text', senderName: peer.name }; rows.push(quote);
    await page.evaluate(id => window.chatFixtureEvent({ conversationId: id, type: 'messages' }), id);
    await expect(page.locator(`[data-message-id="${quote.id}"] .chat-reply-quote`)).toHaveCount(1);
    holdHistory = true;
    await page.evaluate(id => window.chatFixtureEvent({ conversationId: id, type: 'edited' }), id);
    await expect.poll(() => !!heldHistory).toBe(true);
    target.deletedAt = new Date().toISOString(); target.text = ''; quote.replyTo = null;
    await page.evaluate(data => window.chatFixtureEvent(data), { conversationId: id, type: 'message.deleted', messageId: target.id, deletedAt: target.deletedAt });
    await expect(page.locator(`[data-message-id="${target.id}"]`)).toHaveCount(0);
    await expect(page.locator(`[data-message-id="${quote.id}"] .chat-reply-quote`)).toHaveCount(0);
    await heldHistory(); heldHistory = null;
    await expect.poll(() => historyRequests.filter(search => search.startsWith('?before=')).length).toBeGreaterThan(0);
    await expect(page.locator(`[data-message-id="${target.id}"]`)).toHaveCount(0);
    await expect(page.locator(`[data-message-id="${quote.id}"] .chat-reply-quote`)).toHaveCount(0);
    await expect(page.getByText('Сообщение удалено', { exact: true })).toHaveCount(0);
    // Simulate a missed SSE delete, then reconnect/reconcile through the compatibility event.
    const missed = rows.find(row => row.sequence === 491); missed.deletedAt = new Date().toISOString(); missed.text = '';
    await page.evaluate(id => window.chatFixtureEvent({ conversationId: id, type: 'ready' }), id);
    await expect(page.locator(`[data-message-id="${missed.id}"]`)).toHaveCount(0);
    // A loaded quote may point to a source older than the paginated interval.
    const oldSource = rows.find(row => row.sequence === 5); const oldQuote = makeMessage(504, peer, 'Ответ на старое сообщение');
    oldQuote.replyTo = { id: oldSource.id, text: oldSource.text, kind: 'text', senderName: peer.name }; rows.push(oldQuote);
    await page.evaluate(id => window.chatFixtureEvent({ conversationId: id, type: 'messages' }), id);
    await expect(page.locator(`[data-message-id="${oldQuote.id}"] .chat-reply-quote`)).toHaveCount(1);
    assert.equal(await page.locator(`[data-message-id="${oldSource.id}"]`).count(), 0);
    oldSource.deletedAt = new Date().toISOString(); oldSource.text = ''; oldQuote.replyTo = null; historyRequests.length = 0;
    await page.evaluate(id => window.chatFixtureEvent({ conversationId: id, type: 'ready' }), id);
    await expect(page.locator(`[data-message-id="${oldQuote.id}"] .chat-reply-quote`)).toHaveCount(0);
    assert(historyRequests.some(search => new URLSearchParams(search).get('reconcile')?.split(',').includes(oldSource.id)), 'reconcile must include quote sources outside the loaded interval');
    // Local keyboard variables move the whole thread above the keyboard; navbar remains untouched.
    const nav = await page.locator('.mobile-nav').boundingBox(); await page.evaluate(() => window.chatFixtureViewport(470, 14));
    await page.waitForFunction(() => document.querySelector('.chat-thread').style.getPropertyValue('--chat-keyboard-inset') === '360px');
    await expect.poll(async()=>{const box=await page.locator('.chat-composer').boundingBox();return box.y+box.height;}).toBeLessThanOrEqual(484.5); assert.deepEqual(await page.locator('.mobile-nav').boundingBox(), nav);
    assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--chat-keyboard-inset')), '');
    await page.evaluate(() => window.chatFixtureViewport(420, 0, 1.5)); await page.waitForFunction(() => document.querySelector('.chat-thread').style.getPropertyValue('--chat-keyboard-inset') === '0px');
    // A microphone permission prompt may resolve after write permission was revoked.
    await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { window.resolveChatMicrophone = () => resolve({ getTracks: () => [{ stop: () => { window.chatMicrophoneStopped = true; } }] }); }); });
    await page.getByRole('button', { name: 'Записать голосовое сообщение', exact: true }).click();
    await page.waitForFunction(() => typeof window.resolveChatMicrophone === 'function'); canWrite = false;
    await page.evaluate(id => window.chatFixtureEvent({ conversationId: id, type: 'blocked' }), id); await expect(page.locator('.chat-composer-readonly')).toBeVisible();
    await page.evaluate(() => window.resolveChatMicrophone()); await page.waitForFunction(() => window.chatMicrophoneStopped === true);
    assert.equal(await page.locator('.chat-recording').count(), 0);
    // Explicit membership revocation immediately removes private history and input.
    await page.evaluate(id => window.chatFixtureEvent({ conversationId: id, type: 'revoked' }), id);
    await expect(page.locator('[data-message-id]')).toHaveCount(0); await expect(input).toHaveCount(0);
    assert.deepEqual(errors, []); assert(readRequests.length > 0);
    console.log('PASS Chat thread draft/edit separation, reload, durable queued content and response-loss retry UUID, history anchor, incremental SSE and receipt-only SSE without history requests, keyboard isolation, remote deletion, stale response and quote protection, reconnect deletion, delayed microphone permission revocation, revoked history');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
