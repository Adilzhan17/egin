import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cachedMediaRange } from '../src/app/cached-media-range.js';

const request = (range?: string, ifRange?: string) => new Request('https://egin.test/splash/flow-v1.mp4', { headers: { ...(range ? { Range: range } : {}), ...(ifRange ? { 'If-Range': ifRange } : {}) } });
const video = () => new Response('0123456789', { headers: { 'Content-Type': 'video/mp4', 'ETag': '"v1"', 'Content-Length': '10' } });

test('cached video supports bounded, open-ended, suffix and clipped byte ranges', async () => {
  for (const [range, body, contentRange] of [['bytes=0-1', '01', 'bytes 0-1/10'], ['bytes=4-', '456789', 'bytes 4-9/10'], ['bytes=-3', '789', 'bytes 7-9/10'], ['bytes=8-100', '89', 'bytes 8-9/10'], ['bytes=-100', '0123456789', 'bytes 0-9/10']]) {
    const response = await cachedMediaRange(request(range), video());
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), contentRange);
    assert.equal(response.headers.get('content-type'), 'video/mp4');
    assert.equal(response.headers.get('content-length'), String(body.length));
    assert.equal(await response.text(), body);
  }
});

test('unsatisfiable ranges return 416 and malformed/multiple ranges return full video', async () => {
  for (const range of ['bytes=10-', 'bytes=8-3', 'bytes=-0', 'bytes=999999999999999999999-']) {
    const response = await cachedMediaRange(request(range), video());
    assert.equal(response.status, 416);
    assert.equal(response.headers.get('content-range'), 'bytes */10');
  }
  for (const range of [undefined, 'bytes=-', 'bytes=a-b', 'bytes=0-1,5-6']) {
    const response = await cachedMediaRange(request(range), video());
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '0123456789');
  }
});

test('If-Range mismatch returns full representation; matching validator permits a range', async () => {
  assert.equal((await cachedMediaRange(request('bytes=0-1', '"v0"'), video())).status, 200);
  assert.equal((await cachedMediaRange(request('bytes=0-1', '"v1"'), video())).status, 206);
});
