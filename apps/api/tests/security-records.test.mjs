import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRecord } from '../src/server.mjs';

test('workspace writes reject role/owner injection and unknown nested data fields, including tombstones', () => {
  const record = { id: 'profile', kind: 'profile', version: 0, deleted: false, data: { name: 'User', farm: '', phone: '' } };
  assert.equal(validateRecord(record), record);
  for (const key of ['role', 'owner', 'user_id', 'admin', '__proto__', 'constructor']) {
    assert.throws(() => validateRecord({ ...record, [key]: 'administrator' }), { status: 400 });
    assert.throws(() => validateRecord({ ...record, data: { ...record.data, [key]: 'administrator' } }), { status: 400 });
    assert.throws(() => validateRecord({ ...record, deleted: true, data: { [key]: 'administrator' } }), { status: 400 });
  }
  assert.equal({}.admin, undefined);
});
