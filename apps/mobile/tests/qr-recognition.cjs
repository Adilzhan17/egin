const { chromium, webkit } = require('@playwright/test');
const QRCode = require('qrcode');
const assert = require('node:assert/strict');
const origin = process.env.EGIN_URL || 'http://localhost:4935';
const link = origin + '/#/auth/confirm/' + 'a'.repeat(43);

(async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
      // Force the JS fallback, including browsers exposing an unusable detector.
      await page.addInitScript(() => { window.BarcodeDetector = class { detect() { return new Promise(() => {}); } }; });
      await page.goto(origin + '/#/auth/scan');
      const qr = await QRCode.toDataURL(link, { margin: 4, scale: 8 });
      const photo = await page.evaluate(async src => {
        const image = new Image(); image.src = src; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = 4032; canvas.height = 3024;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#e4e4e4'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false; ctx.drawImage(image, 1952, 1448, 128, 128);
        return canvas.toDataURL('image/png').split(',')[1];
      }, qr);
      await page.getByLabel('Изображение QR-кода').setInputFiles({ name: 'laptop-photo.png', mimeType: 'image/png', buffer: Buffer.from(photo, 'base64') });
      await page.waitForURL('**/auth/confirm/*', { timeout: 10000 });
      assert.equal(page.url(), link);
      console.log('PASS small QR within 12MP camera photo:', engine.name());
      await page.goto(origin + '/#/auth/scan');
      const cornerPhoto = await page.evaluate(async src => {
        const image = new Image(); image.src = src; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = 4032; canvas.height = 3024;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#eee'; ctx.fillRect(0, 0, 4032, 3024);
        ctx.imageSmoothingEnabled = false; ctx.drawImage(image, 180, 260, 160, 160);
        return canvas.toDataURL('image/png').split(',')[1];
      }, qr);
      await page.getByLabel('Изображение QR-кода').setInputFiles({ name: 'corner-photo.png', mimeType: 'image/png', buffer: Buffer.from(cornerPhoto, 'base64') });
      await page.waitForURL('**/auth/confirm/*', { timeout: 15000 });
      assert.equal(page.url(), link);
      console.log('PASS off-centre QR and native detector failure fallback:', engine.name());
      if (engine === chromium) {
        await page.goto(origin + '/#/auth/scan');
        await page.evaluate(async src => {
          const image = new Image(); image.src = src; await image.decode();
          window.testTracks = []; window.testConstraints = [];
          navigator.mediaDevices.enumerateDevices = async () => ['wide', 'main'].map(deviceId => ({ kind: 'videoinput', deviceId, label: deviceId }));
          navigator.mediaDevices.getUserMedia = async constraints => {
            window.testConstraints.push(constraints);
            const id = constraints.video.deviceId?.exact || 'wide';
            const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
            const ctx = canvas.getContext('2d');
            const draw = () => { ctx.fillStyle = '#eee'; ctx.fillRect(0, 0, 1280, 720); if (id === 'main') ctx.drawImage(image, 420, 140, 440, 440); };
            draw(); const stream = canvas.captureStream(10); const timer = setInterval(draw, 100);
            for (const track of stream.getTracks()) {
              window.testTracks.push(track); track.getSettings = () => ({ deviceId: id });
              const stop = track.stop.bind(track); track.stop = () => { clearInterval(timer); stop(); };
            }
            return stream;
          };
        }, qr);
        await page.getByRole('button', { name: 'Сканировать QR', exact: true }).click();
        await page.getByLabel('Камера сканера', { exact: true }).selectOption('main');
        await page.waitForURL('**/auth/confirm/*', { timeout: 10000 });
        assert.equal(await page.evaluate(() => window.testConstraints[1].video.deviceId.exact), 'main');
        assert.ok(await page.evaluate(() => window.testTracks.every(track => track.readyState === 'ended')));
        console.log('PASS camera switching, previous stream cleanup, recognition and final stream cleanup');
      }
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
