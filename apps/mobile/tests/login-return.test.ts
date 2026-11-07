import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consumeLoginReturn, rememberLoginReturn } from '../src/shared/lib/login-return.ts';

function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

test('login returns to the latest field or marketplace action once and preserves pre-deploy market logins', () => {
  const store = storage(), now = Date.now();
  store.setItem('egin-market-return', '#/market?view=favorites');
  assert.equal(rememberLoginReturn('#/fields/new', store, now), true);
  assert.equal(store.getItem('egin-market-return'), null);
  assert.equal(consumeLoginReturn(store, now), '#/fields/new');
  assert.equal(consumeLoginReturn(store, now), '#/');
  rememberLoginReturn('#/fields/new', store, now);
  rememberLoginReturn('#/market?view=listing&id=123', store, now);
  assert.equal(consumeLoginReturn(store, now), '#/market?view=listing&id=123');
  store.setItem('egin-market-return', '#/market?view=favorites');
  assert.equal(consumeLoginReturn(store, now), '#/market?view=favorites');
});

test('external, malformed, expired and future login destinations cannot redirect the user', () => {
  const store = storage(), now = Date.now();
  for (const destination of ['https://example.com', '//example.com', '#/auth/confirm/token', '#/fields/other-owner/edit', '#/market#external', '#/market\n']) {
    assert.equal(rememberLoginReturn(destination, store, now), false);
  }
  rememberLoginReturn('#/fields/new', store, now);
  assert.equal(consumeLoginReturn(store, now + 31 * 60000), '#/');
  rememberLoginReturn('#/fields/new', store, now + 120000);
  assert.equal(consumeLoginReturn(store, now), '#/');
  for (const value of ['{', 'null', '{"destination":"https://example.com","createdAt":0}']) {
    store.setItem('egin-login-return', value);
    assert.equal(consumeLoginReturn(store, now), '#/');
    assert.equal(store.getItem('egin-login-return'), null);
  }
  const blocked = { ...store, setItem() { throw Error('Storage disabled'); } };
  assert.equal(rememberLoginReturn('#/fields/new', blocked, now), false);
});
