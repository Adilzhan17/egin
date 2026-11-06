// Derive required platform sizes from the unchanged owner-supplied symbol.
const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const root = path.resolve(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'public/brand/symbol.png')).toString('base64');
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const outputs = [
    [32, 'public/icons/favicon-32.png', 1, false],
    [180, 'public/icons/apple-touch-icon.png', 1, true],
    [192, 'public/icons/icon-192.png', 1, false],
    [512, 'public/icons/icon-512.png', 1, false],
    [512, 'public/icons/icon-maskable-512.png', 2/3, true],
    [1024, 'assets/native-icon.png', 1, true],
    [1024, 'assets/native-foreground.png', 2/3, false],
  ];
  for (const [size, file, safeScale, opaque] of outputs) {
    const png = await page.evaluate(async ({ source, size, safeScale, opaque }) => {
      const image = new Image(); image.src = `data:image/png;base64,${source}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
      const context = canvas.getContext('2d');
      if (opaque) { context.fillStyle = '#ffffff'; context.fillRect(0, 0, size, size); }
      const scale = Math.min(size / image.width, size / image.height) * safeScale;
      const width = image.width * scale, height = image.height * scale;
      context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
      return canvas.toDataURL('image/png').split(',')[1];
    }, { source, size, safeScale, opaque });
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), Buffer.from(png, 'base64'));
  }
  fs.copyFileSync(path.join(root, 'public/icons/favicon-32.png'), path.resolve(root, '../developers/public/favicon-32.png'));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
