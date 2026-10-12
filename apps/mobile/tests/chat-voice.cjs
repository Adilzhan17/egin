// Local browser fixtures; actual HTMLAudio playback, MediaRecorder and audio decoding.
// The microphone signal is generated in Web Audio, not a mocked recording file.
const { chromium, webkit, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const origin = process.env.EGIN_URL || 'http://localhost:4935';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Use an isolated local preview');
function wav() {
  const rate = 24000, samples = rate * 12, output = Buffer.alloc(44 + samples * 2);
  output.write('RIFF'); output.writeUInt32LE(output.length - 8, 4); output.write('WAVEfmt ', 8); output.writeUInt32LE(16, 16); output.writeUInt16LE(1, 20); output.writeUInt16LE(1, 22); output.writeUInt32LE(rate, 24); output.writeUInt32LE(rate * 2, 28); output.writeUInt16LE(2, 32); output.writeUInt16LE(16, 34); output.write('data', 36); output.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) output.writeInt16LE(Math.round(Math.sin(i / rate * Math.PI * 440) * (0.2 + 0.15 * Math.sin(i / rate * 3)) * 32767), 44 + i * 2);
  return output;
}
async function suite(engine) {
  const browser = await engine.launch({ ...(engine === chromium ? { args: ['--no-sandbox'] } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const id = '10000000-0000-4000-8000-000000000031', user = { id: 'voice-user', name: 'Фермер', phone: '', farm: '', passkeys: [] }, peer = { id: 'voice-peer', name: 'Агроном' };
    const media = wav(); let failMedia = false, failUpload = true, uploads = [], sent = [];
    const file = n => ({ id: `voice-${n}`, kind: 'audio', name: `voice-${n}.wav`, mimeType: 'audio/wav', size: media.length, url: `/api/chat/test-audio/${n}`, duration: 12, ...(n === 1 ? { waveform: Array.from({ length: 40 }, (_, i) => (i % 8 + 1) / 8) } : {}) });
    let rows = [1, 2].map(n => ({ id: `20000000-0000-4000-8000-00000000003${n}`, conversationId: id, sender: n === 1 ? peer : user, sequence: n, clientId: crypto.randomUUID(), kind: 'audio', text: '', createdAt: new Date().toISOString(), editedAt: null, deletedAt: null, attachments: [file(n)], replyTo: null, listing: null, location: null, readByCount: 0 }));
    const conversation = () => ({ id, kind: 'direct', title: peer.name, peer, group: null, listing: null, createdAt: rows[0].createdAt, updatedAt: rows.at(-1).createdAt, unreadCount: 0, muted: false, pinned: false, blocked: false, canWrite: true, role: 'member', lastMessage: rows.at(-1) });
    await context.addInitScript(() => {
      window.EventSource = class extends EventTarget { constructor() { super(); setTimeout(() => this.dispatchEvent(new MessageEvent('ready', { data: '{}' })), 20); } close() {} };
      window.voiceStreams = [];
      window.voiceContexts = [];
      window.denyVoiceMicrophone = true;
      navigator.mediaDevices.getUserMedia = async () => {
        if (window.denyVoiceMicrophone) throw new DOMException('Denied by test', 'NotAllowedError');
        const ctx = new AudioContext(), oscillator = ctx.createOscillator(), gain = ctx.createGain(), destination = ctx.createMediaStreamDestination();
        gain.gain.value = .2; oscillator.frequency.value = 220; oscillator.connect(gain); gain.connect(destination); oscillator.start(); await ctx.resume();
        window.voiceContexts.push(ctx); window.voiceStreams.push(destination.stream); return destination.stream;
      };
      const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL); window.voiceBlobUrls = new Set();
      URL.createObjectURL = blob => { const url = create(blob); window.voiceBlobUrls.add(url); return url; };
      URL.revokeObjectURL = url => { window.voiceBlobUrls.delete(url); revoke(url); };
    });
    await context.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname, json = value => route.fulfill({ json: value });
      if (path.startsWith('/api/chat/test-audio/')) {
        if (failMedia) return route.fulfill({ status: 503, body: 'Temporarily unavailable' });
        const range = request.headers().range?.match(/bytes=(\d+)-(\d*)/);
        if (range) { const start = Number(range[1]), end = range[2] ? Math.min(Number(range[2]), media.length - 1) : media.length - 1; return route.fulfill({ status: 206, headers: { 'content-type': 'audio/wav', 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${media.length}` }, body: media.subarray(start, end + 1) }); }
        return route.fulfill({ contentType: 'audio/wav', headers: { 'accept-ranges': 'bytes' }, body: media });
      }
      if (path === '/api/session') return json({ user });
      if (path === '/api/chat/conversations') return json({ items: [conversation()], nextCursor: null });
      if (path === `/api/chat/conversations/${id}`) return json({ conversation: conversation() });
      if (path.endsWith('/attachments') && request.method() === 'POST') { uploads.push({ bytes: request.postDataBuffer()?.length || 0, kind: url.searchParams.get('kind'), name: url.searchParams.get('name') }); if (failUpload) { failUpload = false; return route.fulfill({ status: 503, json: { error: 'Тестовая ошибка загрузки. Повторите.' } }); } return json({ attachment: { ...file(1), id: 'recorded-voice' } }); }
      if (path.endsWith('/messages') && request.method() === 'POST') { const body = request.postDataJSON(); sent.push(body); const message = { ...rows[1], id: crypto.randomUUID(), sequence: rows.length + 1, clientId: body.clientId, text: body.text || '', attachments: body.attachmentIds ? [{ ...file(1), id: 'recorded-voice' }] : [] }; rows.push(message); return json({ message }); }
      if (path.endsWith('/messages')) return json({ items: rows, hasMore: false });
      if (path.endsWith('/read')) return json({ ok: true });
      if (path.startsWith('/api/chat/')) return json({ items: [], preferences: { region: '', interests: [], excludedCategories: [] } });
      return json({ user, records: [], cursor: 0, more: false });
    });
    const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(15000);
    await page.goto(`${origin}/?chat=${id}#/chat`);
    const first = page.locator('.chat-voice[data-voice-id="voice-1"]'), second = page.locator('.chat-voice[data-voice-id="voice-2"]');
    await expect(first).toBeVisible(); await expect(page.locator('audio[controls]')).toHaveCount(0);
    await expect(first).toHaveAttribute('data-waveform', 'signal'); await expect(second).toHaveAttribute('data-waveform', 'fallback');
    assert.equal(await second.locator('.chat-voice-bars i').evaluateAll(bars => new Set(bars.map(bar => bar.style.height)).size), 1, 'Legacy recordings have honest stable flat waveform');
    await first.getByRole('button', { name: 'Воспроизвести голосовое', exact: true }).click();
    await expect(first).toHaveAttribute('data-playing', 'true'); await expect.poll(() => first.locator('audio').evaluate(audio => audio.currentTime)).toBeGreaterThan(.1);
    await first.getByRole('button', { name: 'Скорость воспроизведения 1×', exact: true }).click(); assert.equal(await first.locator('audio').evaluate(audio => audio.playbackRate), 1.5);
    await first.getByRole('button', { name: 'Скорость воспроизведения 1.5×', exact: true }).click(); assert.equal(await first.locator('audio').evaluate(audio => audio.playbackRate), 2);
    await first.getByRole('button', { name: 'Скорость воспроизведения 2×', exact: true }).click();
    await first.getByRole('button', { name: 'Приостановить голосовое', exact: true }).click(); await expect(first).toHaveAttribute('data-playing', 'false');
    await first.getByRole('slider').focus(); await page.keyboard.press('End'); await expect.poll(() => first.locator('audio').evaluate(audio => audio.currentTime)).toBeGreaterThan(11);
    await page.keyboard.press('Home'); await expect.poll(() => first.locator('audio').evaluate(audio => audio.currentTime)).toBeLessThan(.2);
    const seek = await first.getByRole('slider').boundingBox(); await page.touchscreen.tap(seek.x + seek.width * .45, seek.y + seek.height / 2); await expect.poll(() => first.locator('audio').evaluate(audio => audio.currentTime)).toBeGreaterThan(3);
    await first.getByRole('button', { name: 'Воспроизвести голосовое', exact: true }).click(); await second.getByRole('button', { name: 'Воспроизвести голосовое', exact: true }).click();
    await expect(second).toHaveAttribute('data-playing', 'true'); await expect(first).toHaveAttribute('data-playing', 'false');
    assert.equal(await page.locator('audio').evaluateAll(elements => elements.filter(audio => !audio.paused).length), 1);
    await page.evaluate(() => { window.previousVoiceAudio = document.querySelector('.chat-voice[data-voice-id="voice-2"] audio'); });
    await page.getByRole('button', { name: 'Назад к чатам', exact: true }).click();
    await expect(page.locator('.chat-voice')).toHaveCount(0); assert(await page.evaluate(() => window.previousVoiceAudio.paused && !window.previousVoiceAudio.getAttribute('src')));
    failMedia = true; await page.goto(`${origin}/?chat=${id}#/chat`); await expect(first.getByRole('button', { name: 'Повторить воспроизведение', exact: true })).toBeVisible();
    failMedia = false; await first.getByRole('button', { name: 'Повторить воспроизведение', exact: true }).click(); await expect(first).toHaveAttribute('data-playing', 'true');
    // Linux WebKit may omit MediaRecorder: verify the honest unsupported path, never fake it.
    if (!(await page.evaluate(() => typeof MediaRecorder !== 'undefined'))) {
      await page.getByRole('button', { name: 'Записать голосовое сообщение', exact: true }).click();
      await expect(page.getByRole('alert').filter({ hasText: 'Этот браузер не поддерживает запись голоса' })).toBeVisible();
      assert.deepEqual(errors, []);
      console.log(`PASS ${engine.name()}: real audio play/pause/seek/speed/retry, exclusive playback, fallback; recording unsupported state (MediaRecorder unavailable in this runtime)`);
      return;
    }
    // Permission denial is retryable; capture uses the browser's real recorder and codecs.
    await page.getByRole('button', { name: 'Записать голосовое сообщение', exact: true }).click(); await expect(page.getByRole('alert').filter({ hasText: 'Микрофон недоступен' })).toBeVisible();
    await page.evaluate(() => { window.denyVoiceMicrophone = false; }); await page.getByRole('button', { name: 'Записать голосовое сообщение', exact: true }).click();
    await expect(page.locator('.chat-recording')).toBeVisible(); await expect(first).toHaveAttribute('data-playing', 'false');
    await page.waitForTimeout(1100); await page.getByRole('button', { name: 'Завершить запись', exact: true }).click();
    const preview = page.locator('.chat-pending-file.audio .chat-voice'); await expect(preview).toBeVisible(); await expect(preview).toHaveAttribute('data-waveform', 'signal');
    assert(await page.evaluate(() => window.voiceStreams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'))));
    await preview.getByRole('button', { name: 'Воспроизвести голосовое', exact: true }).click(); await expect(preview).toHaveAttribute('data-playing', 'true');
    await page.getByRole('button', { name: 'Отправить', exact: true }).click(); await expect(preview).toHaveCount(0); await page.locator('[data-outbox-state="failed"]').getByRole('button', { name: 'Повторить', exact: true }).click(); await expect(page.locator('[data-outbox-state]')).toHaveCount(0); assert.equal(uploads.length, 2); assert.equal(uploads[0].bytes, uploads[1].bytes); assert(uploads[0].bytes > 100); assert.equal(uploads[0].kind, 'audio'); assert.match(uploads[0].name, /\.(webm|m4a|ogg)$/); assert.equal(sent.at(-1).kind, 'audio'); assert.deepEqual(sent.at(-1).attachmentIds, ['recorded-voice']);
    await expect.poll(() => page.evaluate(() => window.voiceBlobUrls.size)).toBe(0);
    // Cancel and leaving a recording release every microphone track and URL.
    await page.getByRole('button', { name: 'Записать голосовое сообщение', exact: true }).click(); await expect(page.locator('.chat-recording')).toBeVisible(); await page.getByRole('button', { name: 'Отмена', exact: true }).click(); await expect(page.locator('.chat-recording')).toHaveCount(0); await expect(preview).toHaveCount(0);
    await page.getByRole('button', { name: 'Записать голосовое сообщение', exact: true }).click(); await expect(page.locator('.chat-recording')).toBeVisible(); await page.getByRole('button', { name: 'Назад к чатам', exact: true }).click();
    assert(await page.evaluate(() => window.voiceStreams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'))));
    await page.evaluate(async () => { await Promise.all(window.voiceContexts.map(ctx => ctx.close())); });
    assert.deepEqual(errors, []);
    console.log(`PASS ${engine.name()}: real audio play/pause/seek/speed/retry, exclusive playback, fallback, real MediaRecorder preview/upload/cancel/unmount cleanup`);
  } finally { await browser.close(); }
}
(async () => { await suite(chromium); await suite(webkit); })().catch(error => { console.error(error); process.exitCode = 1; });
