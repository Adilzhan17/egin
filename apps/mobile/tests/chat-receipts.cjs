// Real receipt acceptance against isolated PostgreSQL and passkey sessions only.
// No Chat/auth responses are mocked and no delivery/read ACK is synthesized by the test.
const { chromium, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const origin = process.env.EGIN_URL || 'http://localhost:4935';
const parsedOrigin = new URL(origin);
if (parsedOrigin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(parsedOrigin.hostname) || !parsedOrigin.port) throw Error('Isolated localhost preview required');
const out = path.resolve(__dirname, '../../../test-results/chat-receipts');
const weather = require('./fixtures/open-meteo.json');
const errors = [], requestCounts = new Map();
let browser, lastPage;

async function request(page, route, body, method, prefix = '/api/chat') {
  return page.evaluate(async ({ route, body, method, prefix }) => {
    const result = await fetch(prefix + route, { method: method || (body === undefined ? 'GET' : 'POST'), headers: { 'X-EGIN': '1', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: result.status, data: await result.json() };
  }, { route, body, method, prefix });
}
async function api(...args) { const result = await request(...args); assert.ok(result.status < 300, JSON.stringify(result)); return result.data; }
async function configure(context) {
  await context.route('https://api.open-meteo.com/**', route => route.fulfill({ json: weather }));
  const page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { const url = new URL(request.url()); if (url.pathname.startsWith('/api/')) { const key = request.method() + ' ' + url.pathname.replace(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi, ':id'); requestCounts.set(key, (requestCounts.get(key) || 0) + 1); } }); lastPage = page; return page;
}
async function account(name) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const page = await configure(context), cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(origin + '/#/settings/profile');
  await page.getByLabel('Имя', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Создать профиль с passkey', exact: true }).click();
  await page.getByRole('heading', { name: 'Сохраните код восстановления', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Код сохранён', exact: true }).click();
  const { user } = await api(page, '/session', undefined, undefined, '/api');
  // Stay outside Chat until a scenario explicitly opens it: no accidental client ACK.
  return { page, context, user };
}
async function open(page, id, readonly = false) {
  lastPage = page; await page.goto(origin + '/?chat=' + id + '#/chat');
  await expect(page.locator('.chat-thread')).toBeVisible();
  if (!readonly) await expect(page.getByRole('textbox', { name: 'Сообщение', exact: true })).toBeVisible();
}
async function openList(page) { lastPage = page; await page.goto(origin + '/#/chat'); await expect(page.locator('.chat-tabs')).toBeVisible(); }
async function park(page) { await page.goto(origin + '/#/settings/profile'); await expect(page.locator('.chat-thread')).toHaveCount(0); }
async function send(page, id, text) {
  lastPage = page; await page.getByRole('textbox', { name: 'Сообщение', exact: true }).fill(text);
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  let message;
  await expect.poll(async () => { message = (await api(page, '/conversations/' + id + '/messages')).items.find(item => item.text === text); return !!message; }, { timeout: 20000 }).toBe(true);
  return message;
}
function statusMark(page, message) { lastPage = page; return page.locator(`[data-message-id="${message.id}"] .chat-message-status`); }
async function receipt(page, conversationId, messageId) {
  const result = await api(page, `/conversations/${conversationId}/receipts?messageIds=${messageId}`);
  const value = result.items.find(item => item.messageId === messageId)?.receipt;
  assert.ok(value, 'The author must receive a server aggregate for the accepted message');
  return value;
}
async function counts(page, conversationId, messageId, recipientCount, deliveredCount, readCount) {
  await expect.poll(async () => { const value = await receipt(page, conversationId, messageId); return [value.recipientCount, value.deliveredCount, value.readCount]; }, { timeout: 20000 }).toEqual([recipientCount, deliveredCount, readCount]);
  return receipt(page, conversationId, messageId);
}
async function detailCounts(page, message, delivered, read) {
  await statusMark(page, message).click();
  const sheet = page.getByRole('dialog', { name: 'Статус сообщения', exact: true }); await expect(sheet).toBeVisible();
  const facts = sheet.locator('.chat-status-facts>div');
  await expect(facts.filter({ has: page.locator('dt').filter({ hasText: /^Доставлено$/ }) }).locator('dd')).toHaveText(delivered);
  await expect(facts.filter({ has: page.locator('dt').filter({ hasText: /^(Прочитано|Просмотрели участники)$/ }) }).locator('dd')).toHaveText(read);
  assert.equal(await sheet.locator('select,input,[role=radio]').count(), 0, 'Production status details must not contain the reference demo status switcher');
  await sheet.getByRole('button', { name: 'Закрыть', exact: true }).click(); await expect(sheet).toHaveCount(0);
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  browser = await chromium.launch({ args: ['--no-sandbox'] });
  const stamp = Date.now(), a = await account('Доставка Айдар ' + stamp), b = await account('Доставка Жанна ' + stamp), c = await account('Доставка Руслан ' + stamp);
  // A saved message is SENT until the offline recipient actually synchronizes it.
  await b.context.setOffline(true);
  const direct = (await api(a.page, '/conversations', { kind: 'direct', userId: b.user.id })).conversation;
  await open(a.page, direct.id);
  const first = await send(a.page, direct.id, 'Подтверждение доставки ' + stamp);
  await counts(a.page, direct.id, first.id, 1, 0, 0);
  await expect(statusMark(a.page, first)).toHaveAttribute('data-message-status', 'sent');
  await expect(statusMark(a.page, first)).toHaveAttribute('aria-label', 'Отправлено');
  await a.page.screenshot({ path: path.join(out, 'direct-sent.png'), animations: 'disabled' });
  // Merely obtaining a server-side list, or its push metadata, cannot mark delivery.
  await api(a.page, '/conversations');
  assert.deepEqual((({ recipientCount, deliveredCount, readCount }) => [recipientCount, deliveredCount, readCount])(await receipt(a.page, direct.id, first.id)), [1, 0, 0]);

  await b.context.setOffline(false); await openList(b.page);
  await expect(b.page.locator('.chat-row').filter({ hasText: a.user.name })).toBeVisible();
  await counts(a.page, direct.id, first.id, 1, 1, 0);
  await expect(statusMark(a.page, first)).toHaveAttribute('data-message-status', 'delivered');
  await expect(statusMark(a.page, first)).toHaveAttribute('aria-label', 'Доставлено');
  await detailCounts(a.page, first, '1 из 1', '0 из 1');
  await a.page.screenshot({ path: path.join(out, 'direct-delivered.png'), animations: 'disabled' });
  assert.equal((await api(b.page, '/conversations/' + direct.id)).conversation.unreadCount, 1, 'Chat list synchronization is delivery, not reading');

  await open(b.page, direct.id); await expect(b.page.locator('.chat-message-text').getByText(first.text, { exact: true })).toBeVisible();
  await counts(a.page, direct.id, first.id, 1, 1, 1);
  await expect(statusMark(a.page, first)).toHaveAttribute('data-message-status', 'read');
  await expect(statusMark(a.page, first)).toHaveAttribute('aria-label', 'Прочитано');
  await expect.poll(async () => (await api(b.page, '/conversations/' + direct.id)).conversation.unreadCount).toBe(0);
  const readColor = await statusMark(a.page, first).evaluate(element => getComputedStyle(element).color);
  assert.equal(readColor, 'rgb(36, 81, 60)', 'Only confirmed reads use the brand green');
  await a.page.screenshot({ path: path.join(out, 'direct-read.png'), animations: 'disabled' });

  // Independent sender browser context receives persisted receipt facts, including after reload.
  const secondContext = await browser.newContext({ storageState: await a.context.storageState(), viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const second = await configure(secondContext); await openList(second);
  await expect(second.locator('.chat-row').filter({ hasText: b.user.name }).locator('.chat-message-status-summary')).toHaveAttribute('data-message-status', 'read');
  await open(second, direct.id); await expect(statusMark(second, first)).toHaveAttribute('data-message-status', 'read');
  await second.reload(); await expect(statusMark(second, first)).toHaveAttribute('data-message-status', 'read');
  await secondContext.close();

  // Three real users: one participant receiving/reading cannot produce "everyone read".
  await park(b.page); await park(c.page);
  const group = (await api(a.page, '/groups', { name: 'Подтверждения группы ' + stamp, description: 'Изолированная проверка реальных подтверждений', category: 'agronomy', region: 'Акмолинская область', access: 'public' })).conversation;
  await api(a.page, '/groups/' + group.id + '/members', { userId: b.user.id });
  await api(a.page, '/groups/' + group.id + '/members', { userId: c.user.id });
  await b.context.setOffline(true); await c.context.setOffline(true);
  await open(a.page, group.id);
  const grouped = await send(a.page, group.id, 'Групповые подтверждения ' + stamp);
  await counts(a.page, group.id, grouped.id, 2, 0, 0);
  await expect(statusMark(a.page, grouped)).toHaveAttribute('data-message-status', 'sent');

  await b.context.setOffline(false); await openList(b.page);
  await counts(a.page, group.id, grouped.id, 2, 1, 0);
  await expect(statusMark(a.page, grouped)).toHaveAttribute('data-message-status', 'sent');
  await detailCounts(a.page, grouped, '1 из 2', '0 из 2');
  await open(b.page, group.id);
  await counts(a.page, group.id, grouped.id, 2, 1, 1);
  await expect(statusMark(a.page, grouped)).toHaveAttribute('data-message-status', 'partial-read');
  await expect(statusMark(a.page, grouped)).toHaveAttribute('aria-label', 'Просмотрели 1 из 2 участников');
  await expect(statusMark(a.page, grouped).locator('.chat-status-counter')).toHaveText('1/2');
  assert.notEqual(await statusMark(a.page, grouped).evaluate(element => getComputedStyle(element).color), readColor, 'Partial group read is neutral');
  await a.page.screenshot({ path: path.join(out, 'group-partial-read.png'), animations: 'disabled' });

  await c.context.setOffline(false); await openList(c.page);
  await counts(a.page, group.id, grouped.id, 2, 2, 1);
  await expect(statusMark(a.page, grouped)).toHaveAttribute('data-message-status', 'partial-read');
  await detailCounts(a.page, grouped, '2 из 2', '1 из 2');
  await open(c.page, group.id);
  const allRead = await counts(a.page, group.id, grouped.id, 2, 2, 2);
  await expect(statusMark(a.page, grouped)).toHaveAttribute('data-message-status', 'read');
  await expect(statusMark(a.page, grouped)).toHaveAttribute('aria-label', 'Прочитано всеми: 2 из 2');
  assert.equal(await statusMark(a.page, grouped).evaluate(element => getComputedStyle(element).color), readColor);
  await a.page.screenshot({ path: path.join(out, 'group-all-read.png'), animations: 'disabled' });

  // Membership is authoritative: leaving removes receipts, rejoining starts at zero.
  await park(c.page); await api(c.page, '/groups/' + group.id + '/leave', {});
  const left = await counts(a.page, group.id, grouped.id, 1, 1, 1); assert(left.version > allRead.version);
  await expect(statusMark(a.page, grouped)).toHaveAttribute('data-message-status', 'read');
  await api(c.page, '/groups/' + group.id + '/join', {});
  const rejoined = await counts(a.page, group.id, grouped.id, 2, 1, 1); assert(rejoined.version > left.version);
  await expect(statusMark(a.page, grouped)).toHaveAttribute('data-message-status', 'partial-read');
  await detailCounts(a.page, grouped, '1 из 2', '1 из 2');
  // Read-only recipients remain counted and may legitimately read history.
  await api(a.page, '/groups/' + group.id + '/members/' + c.user.id, { canWrite: false }, 'PATCH');
  await open(c.page, group.id, true); await expect(c.page.locator('.chat-composer-readonly')).toBeVisible();
  await counts(a.page, group.id, grouped.id, 2, 2, 2);
  await expect(statusMark(a.page, grouped)).toHaveAttribute('data-message-status', 'read');
  await a.page.reload(); await expect(statusMark(a.page, grouped)).toHaveAttribute('data-message-status', 'read');

  // The empty recipient set must never render vacuous "everyone read".
  await park(c.page); await api(c.page, '/groups/' + group.id + '/leave', {});
  await park(b.page); await api(b.page, '/groups/' + group.id + '/leave', {});
  await counts(a.page, group.id, grouped.id, 0, 0, 0);
  await expect(statusMark(a.page, grouped)).toHaveAttribute('data-message-status', 'sent');
  await a.page.reload(); await expect(statusMark(a.page, grouped)).toHaveAttribute('data-message-status', 'sent');
  await detailCounts(a.page, grouped, 'Нет получателей', 'Нет получателей');
  assert.deepEqual(errors, []); console.log('API requests', JSON.stringify([...requestCounts].sort((a,b) => b[1]-a[1])));
  console.log('PASS real PostgreSQL receipts: offline SENT, list-sync DELIVERED without read, viewport READ, sender second device/reload, group partial delivery/read N/M, all-read color, read-only recipient, leave/rejoin/version, zero recipients, read-only status details');
}
main().catch(async error => {
  console.error(error); console.error('API request counts', JSON.stringify([...requestCounts].sort((a,b) => b[1]-a[1])));
  if (lastPage && !lastPage.isClosed()) { await lastPage.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {}); console.error((await lastPage.locator('body').innerText().catch(() => '')).slice(-4500)); }
  process.exitCode = 1;
}).finally(async () => { await browser?.close(); });
