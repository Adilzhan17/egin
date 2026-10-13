// UI regression fixtures are isolated to the browser; the backend suite verifies real membership ACLs.
const { chromium, webkit, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
fs.mkdirSync('test-results/chat-groups', { recursive: true });
const origin = process.env.EGIN_URL || 'http://localhost:4935';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Use an isolated local preview');

(async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ args: engine === chromium ? ['--no-sandbox'] : [] });
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'reduce' });
      const id = '10000000-0000-4000-8000-000000000020';
      const user = { id: 'group-ui-user', name: 'Владелец', phone: '', farm: '', passkeys: [] };
      const joinedAt = '2026-10-13T08:00:00Z';
      let role = 'member', departed = false, failLeave = false, callsAfterLeave = 0;
      let releaseFailedLeave;
      let members = [user, ...Array.from({ length: 35 }, (_, i) => ({ id: `group-ui-${i}`, name: `Участник ${String(i).padStart(2, '0')}` }))].map((p, i) => ({ ...p, role: i === 1 ? 'owner' : 'member', canWrite: true, joinedAt, lastReadSequence: 0 }));
      const calls = [], errors = [];
      const conversation = () => ({ id, title: 'Группа для проверки', kind: 'group', createdAt: joinedAt, updatedAt: joinedAt, unreadCount: 0, muted: false, pinned: false, blocked: false, canWrite: true, role, peer: null, listing: null, lastMessage: null, group: { name: 'Группа для проверки', description: 'Проверка длинного списка участников', category: 'agronomy', access: 'private', region: '', memberCount: members.length } });
      await context.addInitScript(() => {
        const realFetch = window.fetch.bind(window);
        window.fetch = (input, options) => new URL(typeof input === 'string' ? input : input.url, location.href).pathname === '/api/chat/presence' ? Promise.resolve(new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })) : realFetch(input, options);
        const streams = [];
        window.EventSource = class extends EventTarget { constructor() { super(); streams.push(this); } close() { const i = streams.indexOf(this); if (i >= 0) streams.splice(i, 1); } };
        window.groupFixtureEvent = data => streams.forEach(stream => stream.dispatchEvent(new MessageEvent('change', { data: JSON.stringify(data) })));
      });
      await context.route('**/api/**', async route => {
        const req = route.request(), url = new URL(req.url()), p = url.pathname, method = req.method();
        const json = value => route.fulfill({ json: value });
        if (p === '/api/session') return json({ user });
        if (p === '/api/chat/conversations') return json({ items: departed ? [] : [conversation()], nextCursor: null });
        if (p === `/api/chat/groups/${id}/leave`) {
          calls.push({ method, path: p, body: req.postDataJSON() });
          if (failLeave) { failLeave = false; await new Promise(resolve => { releaseFailedLeave = resolve; }); return route.fulfill({ status: 503, json: { error: 'Сервер временно недоступен' } }); }
          departed = true; return json({ ok: true });
        }
        if (p === `/api/chat/groups/${id}` && method === 'DELETE') { calls.push({ method, path: p }); departed = true; return json({ ok: true }); }
        if (p === `/api/chat/conversations/${id}` || p === `/api/chat/conversations/${id}/members`) {
          if (departed) { callsAfterLeave++; return route.fulfill({ status: 403, json: { error: 'Нет доступа к группе' } }); }
          return json(p.endsWith('/members') ? { items: members } : { conversation: conversation() });
        }
        if (p.endsWith('/messages')) return json({ items: [], hasMore: false, deletedIds: [] });
        if (p.endsWith('/receipts')) return json({ conversationId: id, version: 1, items: [], self: { deliveredSequence: 0, readSequence: 0 } });
        return json({ user, records: [], items: [], cursor: 0, more: false, preferences: { region: '', interests: [], excludedCategories: [] } });
      });
      await context.routeWebSocket('**', socket => socket.close());
      const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', e => errors.push(e.message));
      async function profile() {
        if (page.url() !== 'about:blank') await page.waitForLoadState('networkidle');
        await page.goto(`${origin}/?chat=${id}#/chat`);
        await expect(page.locator('.chat-thread')).toBeVisible();
        await page.locator('.chat-thread-title').click();
        await expect(page.locator('.chat-group-member-list .chat-person')).toHaveCount(members.length);
        assert(await page.locator('.chat-sheet').evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Group sheet must not overflow horizontally');
      }
      // A long member list previously placed confirmation out of view, below the leaving button.
      await profile(); failLeave = true;
      await page.getByRole('button', { name: 'Выйти из группы', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Выйти из группы?', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Выйти из группы', exact: true })).toBeInViewport();
      await page.screenshot({ path: `test-results/chat-groups/leave-${engine.name()}.png`, animations: 'disabled' });
      await page.getByRole('button', { name: 'Выйти из группы', exact: true }).click();
      await expect.poll(() => typeof releaseFailedLeave).toBe('function');
      await expect(page.locator('.chat-sheet').getByRole('button', { name: 'Закрыть', exact: true })).toBeDisabled();
      await page.keyboard.press('Escape');
      await expect(page.locator('.chat-sheet')).toBeVisible();
      await expect(page.locator('.chat-sheet')).not.toHaveClass(/is-closing/);
      releaseFailedLeave();
      await expect(page.getByRole('alert')).toContainText('Сервер временно недоступен');
      await expect(page.locator('.chat-sheet').getByRole('button', { name: 'Закрыть', exact: true })).toBeEnabled();
      assert.equal(departed, false);
      await page.getByRole('button', { name: 'Выйти из группы', exact: true }).click();
      await expect(page.locator('.chat-sheet')).toHaveCount(0);
      await expect(page.locator('.chat-thread')).toHaveCount(0);
      await expect(page.locator('.chat-row')).toHaveCount(0);
      assert.equal(callsAfterLeave, 0, 'Leaving must not refetch deleted membership');
      await page.waitForLoadState('networkidle'); await page.reload(); await page.waitForLoadState('networkidle'); await expect(page.locator('.chat-row')).toHaveCount(0);
      // Owners explicitly select a successor; transfer+leave is a single atomic server operation.
      departed = false; role = 'owner'; members[0].role = 'owner'; members[1].role = 'member';
      await profile();
      await page.getByRole('button', { name: 'Выйти из группы', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Передать владение и выйти', exact: true })).toBeVisible();
      await page.getByRole('button', { name: /Участник 00/ }).click();
      await expect(page.getByRole('button', { name: 'Передать и выйти', exact: true })).toBeInViewport();
      await page.getByRole('button', { name: 'Передать и выйти', exact: true }).click();
      await expect(page.locator('.chat-thread')).toHaveCount(0);
      assert.deepEqual(calls.at(-1).body, { transferToUserId: 'group-ui-0' });
      // Membership changes arriving from another user update an open profile.
      departed = false; await profile(); members.pop();
      await page.evaluate(data => window.groupFixtureEvent(data), { conversationId: id, type: 'members' });
      await expect(page.locator('.chat-group-member-list .chat-person')).toHaveCount(members.length);
      await page.getByRole('button', { name: 'Удалить группу', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Удалить группу для всех?', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Удалить группу', exact: true }).click();
      await expect(page.locator('.chat-thread')).toHaveCount(0);
      assert.equal(calls.at(-1).method, 'DELETE');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await expect(page.locator('.mobile-nav')).toBeInViewport();
      assert.deepEqual(errors, []);
      console.log(`PASS ${engine.name()}: visible leave confirmation, retry, close thread, persistent membership, atomic ownership transfer, SSE members, owner delete, navbar`);
    } finally { await browser.close(); }
  }
})().catch(e => { console.error(e); process.exit(1); });
