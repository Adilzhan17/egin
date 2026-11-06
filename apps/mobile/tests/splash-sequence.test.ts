import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reserveSplash, SPLASH_KEY } from '../src/app/splash-sequence.ts';

test('launches persist exactly one step and wrap flow → bars → pulse → flow', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.deepEqual(Array.from({ length: 7 }, () => reserveSplash(storage)), ['flow', 'bars', 'pulse', 'flow', 'bars', 'pulse', 'flow']);
  assert.equal(values.get(SPLASH_KEY), '1');
  assert.equal(values.size, 1);
});

test('invalid, obsolete or corrupted counters restart safely', () => {
  for (const saved of [null, '', '-1', '3', 'NaN', 'Infinity', '1.1', '01', '1e0', '{}', '99999999999999999999']) {
    let next = '';
    assert.equal(reserveSplash({ getItem: () => saved, setItem: (_, value) => { next = value; } }), 'flow');
    assert.equal(next, '1');
  }
});

test('missing, blocked and quota-exhausted storage never blocks entry', () => {
  assert.equal(reserveSplash(), 'flow');
  assert.equal(reserveSplash({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } }), 'flow');
  assert.equal(reserveSplash({ getItem: () => '2', setItem: () => { throw new Error('quota'); } }), 'pulse');
});
