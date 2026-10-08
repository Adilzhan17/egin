// Run with Playwright Chromium installed: node scripts/render-icons.cjs.
const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const root = path.resolve(__dirname, '..');
  const svg = fs.readFileSync(path.join(root, 'public/icon.svg'), 'utf8').replace('rx="114"', 'rx="0"');
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [size, file] of [[180, 'public/icons/apple-touch-icon.png'], [192, 'public/icons/icon-192.png'], [512, 'public/icons/icon-512.png'], [1024, 'assets/native-icon.png']]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>body{margin:0}svg{width:100vw;height:100vh;display:block}</style>${svg}`);
    await page.screenshot({ path: path.join(root, file) });
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
