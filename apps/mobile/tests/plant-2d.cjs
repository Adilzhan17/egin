const { chromium, webkit, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const weather = require('./fixtures/open-meteo.json');
const news = require('./fixtures/news.json');

const origin = process.env.EGIN_URL || 'http://127.0.0.1:4935';
const out = process.env.EGIN_SCREENSHOTS || '/workspace/test-results/plant-2d';
const scene = page => page.locator('.plant-2d-scene');
const button = (page, name) => page.getByRole('button', { name, exact: true });

async function fixtures(context, { production = false } = {}) {
  const errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  // The production-host check uses only the local preview. Never contact or mutate production.
  if (production) await context.route('https://egin.perricheno.com/**', async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${origin}${url.pathname}${url.search}`, maxRedirects: 0 });
    await route.fulfill({ response });
  });
  await context.route('**/api/**', async route => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) {
      await route.fulfill({ status: 403, json: { error: 'Read-only visual test' } });
      return;
    }
    await route.fallback();
  });
  await context.route('https://api.open-meteo.com/**', route => route.fulfill({ json: weather }));
  await context.route('**/api/news', route => route.fulfill({ json: news }));
  await context.route('https://eldala.kz/uploads/**', route => route.fulfill({ status: 404 }));
  return errors;
}

async function environment(page, period, condition) {
  await button(page, 'Окружение растения').click();
  const dialog = page.getByRole('dialog');
  if (period) await button(dialog, period).click();
  if (condition) await button(dialog, condition).click();
  await button(dialog, 'Вернуться к модели').click();
}

async function layout(page, widths, prefix) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${prefix}: no overflow at ${width}`);
    await expect(page.locator('.mobile-nav')).toBeVisible();
    assert.equal(await page.locator('.nav-item').count(), 5);
    const nav = await page.locator('.mobile-nav').boundingBox();
    assert.ok(nav && nav.x >= 0 && nav.x + nav.width <= width + 1 && nav.y + nav.height <= 845, `${prefix}: navigation fits at ${width}`);
    const box = await scene(page).boundingBox();
    assert.ok(box && box.width > 200 && box.height > 150, `${prefix}: illustration visible at ${width}`);
    await page.screenshot({ path: `${out}/${prefix}-${width}.png` });
  }
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const errors = await fixtures(context);
    const page = await context.newPage();
    await page.goto(origin);
    await expect(scene(page)).toBeVisible();
    await expect(button(page, '2D')).toHaveAttribute('aria-pressed', 'true');
    await expect(scene(page)).toHaveAttribute('data-phase', '1');
    await expect(page.locator('.plant-2d-roots')).toHaveCount(0);
    assert.equal(await page.locator('.crop-canvas').count(), 0, '2D default does not mount the WebGL renderer');
    await environment(page, 'День', 'Ясно');
    await layout(page, [360, 390, 430, 1280], 'home');
    await page.setViewportSize({ width: 390, height: 844 });

    for (const [label, period] of [['Утро', 'dawn'], ['День', 'day'], ['Закат', 'dusk'], ['Ночь', 'night']]) {
      await environment(page, label, 'Ясно');
      await expect(scene(page)).toHaveAttribute('data-period', period);
      await page.locator('.plant-hero').screenshot({ path: `${out}/period-${period}.png` });
    }
    for (const [label, condition] of [['Облачно', 'cloud'], ['Дождь', 'rain'], ['Снег', 'snow'], ['Гроза', 'storm'], ['Ветер', 'wind']]) {
      await environment(page, 'День', label);
      await expect(scene(page)).toHaveAttribute('data-condition', condition);
      await page.locator('.plant-hero').screenshot({ path: `${out}/weather-${condition}.png` });
    }

    await environment(page, 'Ночь', 'Снег');
    await expect(scene(page)).toHaveAttribute('data-period', 'night');
    await expect(scene(page)).toHaveAttribute('data-condition', 'snow');
    await page.locator('.plant-hero').screenshot({ path: `${out}/night-snow.png` });
    await button(page, '3D').click();
    await expect(page.locator('.crop-canvas[data-ready="true"]')).toBeVisible({ timeout: 30000 });
    await expect(button(page, '3D')).toHaveAttribute('aria-pressed', 'true');
    assert.equal(await scene(page).count(), 0);
    await button(page, 'Слои модели').click();
    await page.getByRole('dialog').getByRole('button', { name: /Корневая система/ }).click();
    await button(page, 'Применить').click();
    await expect(page.locator('.crop-canvas')).toHaveAttribute('data-roots', 'true');
    await button(page, '2D').click();
    await expect(scene(page)).toHaveAttribute('data-period', 'night');
    await expect(scene(page)).toHaveAttribute('data-condition', 'snow');
    assert.equal(await page.locator('.crop-canvas, canvas').count(), 0, 'switching back disposes the WebGL canvas');
    await expect(page.locator('.plant-2d-roots')).toHaveCount(0);

    for (const [phase, label] of ['Семя', 'Росток', 'Рост', 'Зрелость'].entries()) {
      await button(page, 'Фазы роста').click();
      await button(page.getByRole('dialog'), label).click();
      await button(page.getByRole('dialog'), 'Вернуться к модели').click();
      await expect(scene(page)).toHaveAttribute('data-phase', String(phase));
      await page.locator('.plant-hero').screenshot({ path: `${out}/phase-${phase}.png` });
    }

    await button(page, 'Слои модели').click();
    await expect(page.getByRole('dialog').getByRole('button', { name: /Корневая система/ })).toHaveCount(0);
    await page.getByRole('dialog').getByRole('button', { name: /Показатели участка/ }).click();
    await button(page, 'Применить').click();
    await expect(page.locator('.scene-data-overlay')).toBeVisible();
    await button(page, 'Слои модели').click();
    await expect(page.getByRole('dialog').getByRole('button', { name: /Корневая система/ })).toHaveCount(0);
    await page.getByRole('dialog').getByRole('button', { name: /Показатели участка/ }).click();
    await button(page, 'Применить').click();
    await expect(page.locator('.scene-data-overlay')).toHaveCount(0);

    await button(page, 'Развернуть 2D').click();
    await expect(page.locator('.sheet-large .plant-2d-scene')).toBeVisible();
    assert.equal(await scene(page).count(), 1, 'fullscreen mounts a single illustration');
    await expect(page.locator('.plant-2d-roots')).toHaveCount(0);
    await expect(button(page.getByRole('dialog'), 'Корни')).toHaveCount(0);
    await page.screenshot({ path: `${out}/fullscreen.png` });
    await button(page.getByRole('dialog'), 'Закрыть').click();
    await expect(button(page, 'Развернуть 2D')).toBeFocused();
    await expect(scene(page)).toBeVisible();
    const moving = await scene(page).evaluate(el => el.getAnimations({ subtree: true }).filter(animation => {
      const timing = animation.effect?.getComputedTiming();
      return animation.playState === 'running' && Number(timing?.duration || 0) > 20;
    }).length);
    assert.equal(moving, 0, 'reduced-motion pauses decorative animation');

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(scene(page)).toHaveAttribute('data-running', 'true');
    assert.ok(await scene(page).evaluate(el => el.getAnimations({ subtree: true }).some(animation => animation.playState === 'running')), 'weather and plant animate when motion is enabled');
    await button(page, 'Окружение растения').click();
    await expect(scene(page)).toHaveAttribute('data-running', 'false');
    await page.getByRole('dialog').getByRole('switch', { name: /Анимация/ }).click();
    await button(page, 'Вернуться к модели').click();
    await expect(scene(page)).toHaveAttribute('data-running', 'false');
    await button(page, 'Окружение растения').click();
    await page.getByRole('dialog').getByRole('switch', { name: /Анимация/ }).click();
    await button(page, 'Вернуться к модели').click();
    await expect(scene(page)).toHaveAttribute('data-running', 'true');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(scene(page)).toHaveAttribute('data-running', 'false');
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(scene(page)).toHaveAttribute('data-running', 'true');
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await button(page, 'Окружение растения').click();
    await page.getByRole('dialog').getByRole('button', { name: /По погоде участка/ }).click();
    await button(page, 'Вернуться к модели').click();
    await expect(scene(page)).toHaveAttribute('data-condition', /sun|cloud|rain|snow|storm|wind|night|fog/);
    await page.getByRole('link', { name: 'Погода', exact: true }).click();
    await expect(scene(page), 'navigation unmounts the illustration').toHaveCount(0);
    assert.deepEqual(errors, [], 'no browser exceptions');
    await context.close();

    const production = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const productionErrors = await fixtures(production, { production: true });
    const productionPage = await production.newPage();
    await productionPage.goto('https://egin.perricheno.com/');
    await expect(productionPage.locator('.crop-canvas[data-ready="true"]')).toBeVisible({ timeout: 30000 });
    assert.equal(await scene(productionPage).count(), 0, 'production keeps existing 3D');
    assert.equal(await button(productionPage, '2D').count(), 0, 'production cannot select the staging experiment');
    assert.deepEqual(productionErrors, []);
    await production.close();
  } finally { await browser.close(); }

  const safari = await webkit.launch();
  try {
    const context = await safari.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const errors = await fixtures(context);
    const page = await context.newPage();
    await page.goto(origin);
    await expect(scene(page)).toBeVisible();
    await environment(page, 'Ночь', 'Дождь');
    await expect(scene(page)).toHaveAttribute('data-period', 'night');
    await expect(scene(page)).toHaveAttribute('data-condition', 'rain');
    await layout(page, [360, 390, 430], 'webkit');
    await button(page, 'Развернуть 2D').click();
    assert.equal(await scene(page).count(), 1);
    await button(page.getByRole('dialog'), 'Закрыть').click();
    await expect(button(page, 'Развернуть 2D')).toBeFocused();
    assert.deepEqual(errors, []);
  } finally { await safari.close(); }
  console.log('PASS: minimal root-free 2D, preserved 3D roots, telemetry, 2D/3D lifecycle, staging gate, four periods, six weather states, four growth phases, fullscreen focus, reduced motion, responsive Chromium/WebKit.');
})().catch(error => { console.error(error); process.exitCode = 1; });
