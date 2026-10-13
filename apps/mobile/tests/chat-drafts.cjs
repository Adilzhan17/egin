// Cross-device draft synchronization and concurrent edit recovery, using an isolated API fixture.
const { chromium, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const origin = process.env.EGIN_URL || 'http://localhost:4935';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Use an isolated local preview');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const id = '10000000-0000-4000-8000-000000000030';
    const user = { id: 'draft-owner', name: 'Агроном', phone: '', farm: '', passkeys: [] };
    const peer = { id: 'draft-peer', name: 'Ерлан' };
    let preferences = { version: 1, draft: 'Черновик с другого устройства', theme: { preset: 'nature', intensity: .3 }, archived: false };
    let conflictNext = false, failDraft = false;
    const writes = [], pages = [], errors = [];
    for (let n = 0; n < 2; n++) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
      await context.addInitScript(() => {
        const streams = [];
        window.EventSource = class extends EventTarget { constructor() { super(); streams.push(this); } close() { streams.splice(streams.indexOf(this), 1); } };
        window.draftEvent = data => streams.forEach(stream => stream.dispatchEvent(new MessageEvent('change', { data: JSON.stringify(data) })));
      });
      const conversation = { id, title: peer.name, kind: 'direct', createdAt: '2026-10-13T08:00:00Z', updatedAt: '2026-10-13T08:00:00Z', unreadCount: 0, muted: false, pinned: false, blocked: false, canWrite: true, role: 'member', peer, group: null, listing: null, lastMessage: null };
      await context.route('**/api/**', route => {
        const req = route.request(), p = new URL(req.url()).pathname;
        const json = value => route.fulfill({ json: value });
        if (p === '/api/session') return json({ user });
        if (p === '/api/chat/conversations') return json({ items: [conversation], nextCursor: null });
        if (p === `/api/chat/conversations/${id}`) return json({ conversation });
        if (p.endsWith('/messages')) return json({ items: [], hasMore: false, deletedIds: [] });
        if (p.endsWith('/receipts')) return json({ conversationId: id, version: 1, items: [], self: { deliveredSequence: 0, readSequence: 0 } });
        if (p === `/api/chat/conversations/${id}/preferences`) {
          if (req.method() === 'PATCH') {
            const b = req.postDataJSON(); writes.push(b);
            assert.equal(req.headers()['x-egin-outbox-user'], user.id, 'Background draft updates must be account-bound');
            if (failDraft) return route.abort('internetdisconnected');
            if (conflictNext) { conflictNext = false; preferences = { ...preferences, draft: 'Параллельное изменение', version: preferences.version + 1 }; }
            if (b.expectedVersion !== preferences.version) return route.fulfill({ status: 409, json: { error: 'Черновик изменён' } });
            preferences = { ...preferences, draft: b.draft, version: preferences.version + 1 };
          }
          return json({ preferences });
        }
        return json({ user, records: [], items: [], cursor: 0, more: false });
      });
      await context.routeWebSocket('**', socket => socket.close());
      const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${origin}/?chat=${id}#/chat`);
      await expect(page.locator('.chat-composer textarea')).toHaveValue(preferences.draft);
      pages.push(page);
    }
    const [a, b] = pages, inputA = a.locator('.chat-composer textarea'), inputB = b.locator('.chat-composer textarea');
    await inputA.fill('Точный текст \n');
    await expect.poll(() => preferences.draft).toBe('Точный текст \n');
    await b.evaluate(data => window.draftEvent(data), { type: 'preferences', conversationId: id });
    await expect(inputB).toHaveValue('Точный текст \n');
    conflictNext = true;
    await inputA.fill('Мой новый текст');
    await expect(a.locator('.chat-draft-conflict')).toBeVisible();
    await expect(inputA).toHaveValue('Мой новый текст');
    await a.getByRole('button', { name: 'Оставить этот', exact: true }).click();
    await expect.poll(() => preferences.draft).toBe('Мой новый текст');
    await expect(a.locator('.chat-draft-conflict')).toHaveCount(0);
    conflictNext = true;
    await inputA.fill('Несохранённый текст');
    await expect(a.locator('.chat-draft-conflict')).toBeVisible();
    await a.reload();
    await expect(a.locator('.chat-composer textarea')).toHaveValue('Несохранённый текст');
    await expect(a.locator('.chat-draft-conflict')).toBeVisible();
    assert.equal(preferences.draft, 'Параллельное изменение', 'Reload must preserve unresolved conflict rather than silently overwrite the remote draft');
    await a.getByRole('button', { name: 'Взять с другого устройства', exact: true }).click();
    await expect(inputA).toHaveValue('Параллельное изменение');
    await a.reload(); await expect(a.locator('.chat-composer textarea')).toHaveValue('Параллельное изменение');
    // A cleared draft must survive leaving before its server acknowledgement. Empty is a real pending value.
    failDraft = true;
    await a.locator('.chat-composer textarea').fill('');
    await expect.poll(() => a.evaluate(() => JSON.parse(localStorage.getItem('egin.chat.draft-sync.v1.draft-owner.10000000-0000-4000-8000-000000000030') || 'null')?.draft)).toBe('');
    await a.locator('.chat-thread-back').click();
    await expect(a.locator('.chat-thread')).toHaveCount(0);
    failDraft = false;
    await a.goto(`${origin}/?chat=${id}#/chat`);
    await expect(a.locator('.chat-composer textarea')).toHaveValue('');
    await expect.poll(() => preferences.draft).toBe('');
    // Unsynced typing flushes when leaving, rather than waiting for the debounce after an unmount.
    await a.locator('.chat-composer textarea').fill('Сохранить при выходе');
    await a.locator('.chat-thread-back').click();
    await expect.poll(() => preferences.draft).toBe('Сохранить при выходе');
    assert(writes.length >= 4); assert.deepEqual(errors, []);
    console.log('PASS drafts: two device sync, whitespace, 409 conflict, preserve local, explicit remote/local choice, reload, durable empty clear, unmount flush, account binding');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
