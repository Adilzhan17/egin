// Local-only deterministic regression: Market → seller chat and login return, no real messages.
const { chromium, webkit, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const origin = process.env.EGIN_URL || 'http://localhost:4935';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Use an isolated local preview');
const listingId = '11111111-1111-4111-8111-111111111111';
const conversationId = '22222222-2222-4222-8222-222222222222';
const user = { id: 'test-buyer', name: 'Покупатель', passkeys: [] };
const seller = { id: 'test-seller', name: 'Продавец пшеницы' };
const listing = { id: listingId, ownerId: seller.id, categoryId: 'harvest-wheat', dealType: 'sell', status: 'published', title: 'Пшеница третьего класса', description: 'Урожай для проверки диалога', attributes: {}, priceMode: 'fixed', priceAmount: 95000, priceUnit: 'ton', currencyCode: 'KZT', regionName: 'Акмолинская область', seller, allowPhone: true, contactPhone: '+7 700 111 22 33', images: [], isOwner: false, createdAt: '2026-10-01T10:00:00Z', publishedAt: '2026-10-01T10:00:00Z' };
const conversation = { id: conversationId, title: seller.name, kind: 'market', peer: seller, listing: { ...listing, url: `/#/market?view=listing&id=${listingId}` }, group: null, blocked: false, canWrite: true, role: 'member', muted: false, pinned: false, unreadCount: 0, lastMessage: null, updatedAt: listing.createdAt, createdAt: listing.createdAt };
(async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch();
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'reduce' });
      let signedIn = false, failNext = 0, creates = 0, messages = 0, own = false, phoneVisible = true, demo = false;
      const errors = [];
      await context.route('**/api/**', async route => {
        const request = route.request(), path = new URL(request.url()).pathname, method = request.method();
        const json = value => route.fulfill({ json: value });
        if (path === '/api/session') return json({ user: signedIn ? user : null });
        if (path === '/api/auth/recover') { signedIn = true; return json({ user }); }
        if (path === '/api/market/categories') return json({ categories: [] });
        if (path === `/api/market/listings/${listingId}`) return json({ listing: { ...listing, isOwner: own, allowPhone: phoneVisible, contactPhone: phoneVisible ? listing.contactPhone : '', isDemo: demo } });
        if (path === '/api/chat/conversations' && method === 'POST') {
          creates++; assert.deepEqual(request.postDataJSON(), { kind: 'market', listingId });
          if (failNext) { const status = failNext; failNext = 0; return route.fulfill({ status, json: { error: status === 401 ? 'Войдите снова' : 'Нет связи с чатом. Повторите.' } }); }
          return json({ conversation });
        }
        if (path.endsWith('/messages') && method === 'POST') { messages++; throw Error('Opening a listing must never send a message'); }
        if (path === `/api/chat/conversations/${conversationId}`) return json({ conversation });
        if (path === '/api/chat/events') return route.fulfill({ contentType: 'text/event-stream', body: ': test\n\n' });
        if (path.startsWith('/api/chat/')) return json({ items: [], hasMore: false, nextCursor: null });
        if (path.startsWith('/api/market/')) return json({ items: [], total: 0, page: 1, hasMore: false });
        return json({ user: signedIn ? user : null, records: [], cursor: 0, more: false });
      });
      await context.route('https://api.open-meteo.com/**', route => route.fulfill({ json: require('./fixtures/open-meteo.json') }));
      const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message));
      let opened = false;
      const openListing = async () => { if (!opened) { opened = true; await page.goto(`${origin}/#/market?view=listing&id=${listingId}`); } else await page.evaluate(id => { location.hash = `/market?view=listing&id=${id}`; }, listingId); await expect(page.locator('.market-contact-bar')).toBeVisible(); }; 
      const login = async () => {
        await page.getByRole('link', { name: 'Войти с ключом доступа', exact: true }).click();
        await page.getByRole('button', { name: 'Войти по коду восстановления', exact: true }).click();
        await page.getByLabel('Код восстановления', { exact: true }).fill('fixture-recovery');
        await page.getByRole('button', { name: 'Восстановить доступ', exact: true }).click();
        await expect(page.locator('.chat-thread')).toBeVisible();
      };
      await openListing();
      await expect(page.getByRole('link', { name: 'Позвонить', exact: true })).toHaveAttribute('href', 'tel:+77001112233');
      await page.getByRole('button', { name: 'Написать', exact: true }).click();
      assert.equal(creates, 0, 'Guest does not create a conversation before login');
      await login();
      assert.equal(creates, 1, 'Login resumes the intended contact once');
      assert.equal(new URL(page.url()).searchParams.get('chat'), conversationId);
      await expect(page.locator('.chat-listing-card').first()).toContainText(listing.title);
      await expect(page.getByRole('textbox', { name: 'Сообщение', exact: true })).toBeVisible();
      assert.equal(await page.evaluate(() => sessionStorage.getItem('egin-market-return')), null);
      await openListing();
      failNext = 503;
      await page.getByRole('button', { name: 'Написать', exact: true }).click();
      await expect(page.getByText('Нет связи с чатом. Повторите.', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Написать', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: 'Написать', exact: true }).click();
      await expect(page.locator('.chat-thread')).toBeVisible();
      assert.equal(new URL(page.url()).searchParams.get('chat'), conversationId, 'Repeated contact opens the same server-provided thread');
      await openListing(); failNext = 401;
      await page.getByRole('button', { name: 'Написать', exact: true }).click();
      await login();
      phoneVisible = false; demo = true; await openListing();
      await expect(page.getByRole('link', { name: 'Позвонить', exact: true })).toHaveCount(0);
      await expect(page.getByText(/Демо-продавец не отвечает/)).toBeVisible();
      await page.getByRole('button', { name: 'Написать', exact: true }).click();
      await expect(page.locator('.chat-thread')).toBeVisible();
      own = true; await openListing();
      await expect(page.getByRole('button', { name: 'Редактировать', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Написать', exact: true })).toHaveCount(0);
      assert.equal(messages, 0); assert.deepEqual(errors, []);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      console.log(`PASS ${engine.name()}: Market contact, phone consent/demo notice, guest login return, listing context, retry/expired session, self-contact hidden, no auto-send`);
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exit(1); });
