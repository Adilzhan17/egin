/* Simulated iOS visual viewport: this checks layout reactions, not a physical keyboard. */
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript(() => {
      const viewport = new EventTarget();
      Object.assign(viewport, { height: 844, width: 390, offsetTop: 0, offsetLeft: 0, scale: 1 });
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
      window.resizeMarketViewport = (height, offsetTop = 0, scale = 1) => {
        Object.assign(viewport, { height, offsetTop, scale });
        viewport.dispatchEvent(new Event('resize'));
        viewport.dispatchEvent(new Event('scroll'));
      };
    });
    await page.goto(`${process.env.EGIN_URL || 'http://localhost:4935'}/#/market`);
    await page.locator('.market-publish').waitFor();
    const navBefore = await page.locator('.mobile-nav').boundingBox();
    await page.getByRole('button', { name: 'Открыть фильтры', exact: true }).click();
    await page.locator('dialog.market-sheet').waitFor();
    await page.evaluate(() => window.resizeMarketViewport(470, 14));
    await page.waitForFunction(() => document.querySelector('.market-page').style.getPropertyValue('--market-keyboard-inset') === '360px');
    assert.equal(await page.locator('.market-publish').count(), 0);
    const sheet = await page.locator('dialog.market-sheet').boundingBox();
    assert(sheet.y >= 14 && sheet.y + sheet.height <= 484.5, 'Sheet stays within the visible viewport');
    await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
    // Probe the actual CSS rules shared by real detail and wizard footers, without creating records.
    await page.evaluate(() => {
      for (const name of ['market-contact-bar', 'market-wizard-footer']) {
        const footer = document.createElement('div');
        footer.className = name;
        document.querySelector('.market-page').append(footer);
      }
    });
    const bottoms = await page.locator('.market-contact-bar,.market-wizard-footer').evaluateAll(elements => elements.map(el => getComputedStyle(el).bottom));
    assert.deepEqual(bottoms, ['360px', '360px']);
    assert.deepEqual(await page.locator('.mobile-nav').boundingBox(), navBefore, 'Navbar geometry is untouched');
    assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--market-keyboard-inset')), '', 'No global CSS variables');
    await page.evaluate(() => window.resizeMarketViewport(420, 0, 1.5));
    await page.locator('.market-publish').waitFor();
    assert.equal(await page.locator('.market-page').evaluate(el => el.style.getPropertyValue('--market-keyboard-inset')), '0px', 'Pinch zoom is not classified as a keyboard');
    await page.evaluate(() => window.resizeMarketViewport(780));
    await page.waitForFunction(() => document.querySelector('.market-page').style.getPropertyValue('--market-viewport-height') === '780px');
    assert.equal(await page.locator('.market-page').evaluate(el => el.style.getPropertyValue('--market-keyboard-inset')), '0px', 'Browser chrome changes do not move the footer');
    await page.evaluate(() => window.resizeMarketViewport(844));
    await page.locator('.market-publish').waitFor();
    console.log('PASS Market visualViewport keyboard geometry, pinch-zoom guard, threshold, navbar isolation');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
