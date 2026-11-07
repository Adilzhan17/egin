import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const publicRoot = new URL('../public/', import.meta.url);
const sourceRoot = new URL('../src/', import.meta.url);
const digest = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const originals = [
  ['shared/brand/emblem.png', '01c170da45881d1be2c7cfaeba4812f1b63ae11e8a2e61e84b07cafc580bf7ab'],
  ['shared/brand/symbol.png', 'f509bfa944ba0fed55cabcae513effa6d555cfb8d048096873e9b48029b52c99'],
  ['shared/brand/wordmark.png', '8a578c7b13f28eef0d55c0786d862a879284cd0ecc39040d4a45986756d0742d'],
  ['app/media/egin-v2.mp4', 'd275b3d2acf0aa72df551cbf60484428b3a13362323d4b08396d678a167297d9'],
];

test('owner artwork and replacement video remain byte-for-byte originals', () => {
  for (const [file, expected] of originals) assert.equal(digest(readFileSync(new URL(file, sourceRoot))), expected, file);
});

test('platform icons use required square PNG sizes and a separate maskable asset', () => {
  for (const [file, size] of [['icons/favicon-32.png', 32], ['icons/apple-touch-icon.png', 180], ['icons/icon-192.png', 192], ['icons/icon-512.png', 512], ['icons/icon-maskable-512.png', 512], ['../assets/native-icon.png', 1024], ['../assets/native-foreground.png', 1024]] as const) {
    const png = readFileSync(new URL(file, publicRoot));
    assert.equal(png.subarray(1, 4).toString(), 'PNG', file);
    assert.equal(png.readUInt32BE(16), size, file);
    assert.equal(png.readUInt32BE(20), size, file);
  }
  const manifest = JSON.parse(readFileSync(new URL('manifest.webmanifest', publicRoot), 'utf8'));
  assert.ok(manifest.icons.some((icon: { src: string; purpose: string }) => icon.purpose === 'maskable' && icon.src === '/icons/icon-maskable-512.png'));
});

test('retired video clips and generated placeholder favicon are not shipped', () => {
  for (const file of ['splash/flow-v1.mp4', 'splash/bars-v1.mp4', 'splash/pulse-v1.mp4', 'icon.svg']) {
    assert.equal(existsSync(new URL(file, publicRoot)), false, file);
  }
});
