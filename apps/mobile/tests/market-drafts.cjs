// Browser contract regressions against deterministic API fixtures; no production writes.
const { chromium, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const origin = process.env.EGIN_URL || 'http://localhost:4935';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Use an isolated local preview');

(async () => {
  const { categorySeed } = await import('../../api/src/market/categories.mjs');
  const { validatePatch } = await import('../../api/src/market/validation.mjs');
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const user = { id: 'market-draft-browser-user', name: 'Тестовый фермер', phone: '', farm: '', passkeys: [] };
    const listingId = '11111111-1111-4111-8111-111111111111';
    let listing = { id: listingId, ownerId: user.id, categoryId: null, dealType: null, status: 'draft', title: '', description: '', attributes: {}, attributesSchemaVersion: 1, priceMode: 'negotiable', priceAmount: null, currencyCode: 'KZT', priceUnit: 'all', quantity: null, quantityUnit: '', countryCode: 'KZ', regionCode: '', districtCode: '', localityCode: '', localityName: '', regionName: '', districtName: '', currentStep: 1, version: 1, images: [], seller: { id: user.id, name: user.name }, isOwner: true, allowPhone: false, contactPhone: '', delivery: '', isFavorite: false, publishedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    let creates = 0, patchCalls = 0, activePatches = 0, maxActive = 0, holdNext = false, release, offline = false, conflictNext = false;
    const writes = [], errors = [];
    await context.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname, method = request.method();
      const json = data => route.fulfill({ json: data });
      if (path === '/api/session') return json({ user });
      if (path === '/api/market/categories') return json({ categories: categorySeed });
      if (path === '/api/market/listings' && method === 'POST') { creates++; validatePatch(request.postDataJSON()); return json({ listing }); }
      if (path === `/api/market/listings/${listingId}` && method === 'GET') return json({ listing });
      if (path === `/api/market/listings/${listingId}` && method === 'PATCH') {
        patchCalls++; if (offline) return route.abort('internetdisconnected');
        const patch = request.postDataJSON();
        try { validatePatch(patch); } catch (error) { return route.fulfill({ status: error.status || 400, json: { error: error.message } }); }
        activePatches++; maxActive = Math.max(maxActive, activePatches);
        try {
          if (holdNext) { holdNext = false; await new Promise(resolve => { release = resolve; }); }
          if (conflictNext) { conflictNext = false; listing = { ...listing, title: 'Версия из другой вкладки', version: listing.version + 1 }; return route.fulfill({ status: 409, json: { error: 'Версия изменилась' } }); }
          assert.equal(patch.version, listing.version, 'Each serialized save uses the latest acknowledged server version');
          listing = { ...listing, ...patch, version: listing.version + 1 }; writes.push(structuredClone(listing));
          return json({ listing });
        } finally { activePatches--; }
      }
      if (path.startsWith('/api/market/')) return json({ items: [], total: 0, page: 1, hasMore: false, suggestions: [] });
      return json({ user, records: [], cursor: 0, more: false });
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/#/market?view=new`);
    await expect(page.getByRole('heading', { name: 'Создать объявление', exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`view=edit&id=${listingId}$`));
    assert.equal(creates, 1, 'Opening a new wizard creates one persistent draft');
    await page.locator('.market-wizard-body > label select').nth(0).selectOption('machinery');
    const tractor = categorySeed.find(item => item.parentId === 'machinery' && /Трактор/.test(item.nameRu));
    await page.locator('.market-wizard-body > label select').nth(1).selectOption(tractor.id);
    await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
    const title = page.getByLabel('Название', { exact: true }), status = page.locator('.market-wizard-meta [role=status]');
    await expect(title).toBeVisible();
    await title.fill('Трактор для хозяйства');
    await page.getByLabel('Описание', { exact: true }).fill('Описание состояния трактора для проверки сохранения.');
    await expect(status).toHaveText('Сохранено ✓');
    assert.equal(listing.currentStep, 2);
    await page.reload();
    await expect(title).toHaveValue('Трактор для хозяйства');
    await expect(page.getByText('Шаг 2 из 5', { exact: true })).toBeVisible();
    assert.equal(creates, 1, 'Reload reuses the existing draft ID');

    // A slow response for edit A must never replace edit B or trigger parallel saves.
    holdNext = true; const baseline = patchCalls;
    await title.fill('Первое изменение трактора');
    await expect.poll(() => patchCalls).toBe(baseline + 1);
    await title.fill('Последнее изменение трактора');
    await page.waitForTimeout(1400); // Exceed debounce while first request remains in flight.
    assert.equal(patchCalls, baseline + 1, 'Later save must wait for the in-flight save');
    release();
    await expect.poll(() => listing.title).toBe('Последнее изменение трактора');
    await expect(status).toHaveText('Сохранено ✓');
    await expect(title).toHaveValue('Последнее изменение трактора');
    assert.equal(maxActive, 1, 'Only one draft PATCH may be in flight');
    assert.ok(writes.at(-1).version > writes.at(-2).version);

    conflictNext = true;
    await title.fill('Не перезаписывать другую вкладку');
    await expect(page.getByRole('alert')).toContainText('Объявление изменилось в другой вкладке');
    await expect(title).toHaveValue('Не перезаписывать другую вкладку');
    await expect(title).toBeDisabled();
    assert.equal(listing.title, 'Версия из другой вкладки');
    const conflictCalls = patchCalls;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForTimeout(200);
    assert.equal(patchCalls, conflictCalls, 'An online event must not overwrite an unresolved conflict');
    await page.getByRole('button', { name: 'Загрузить версию сервера', exact: true }).click();
    await expect(title).toHaveValue('Версия из другой вкладки');
    await expect(title).toBeEnabled();

    offline = true; await context.setOffline(true);
    await title.fill('Изменение после возвращения сети');
    await expect(status).toHaveText('Не сохранено');
    assert.equal(listing.title, 'Версия из другой вкладки');
    offline = false; await context.setOffline(false);
    await expect.poll(() => listing.title).toBe('Изменение после возвращения сети');
    await expect(status).toHaveText('Сохранено ✓');
    await page.reload();
    await expect(title).toHaveValue('Изменение после возвращения сети');
    assert.equal(creates, 1);
    assert.deepEqual(errors, []);
    console.log('PASS Market draft browser: one creation, stable URL/reload/current step, delayed serialized optimistic saves, no stale overwrite, visible 409 with explicit resolution, offline→online retry');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
