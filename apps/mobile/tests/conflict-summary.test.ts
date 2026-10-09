import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changedRecordFields, conflictFacts } from '../src/features/settings/conflict-summary.ts';
import type { Field, Entry } from '../src/entities/workspace/types.ts';

test('conflicts identify geometry changes even when area and vertex counts are the same', () => {
  const field: Field = { name: 'Поле', crop: 'unknown', latitude: 51, longitude: 71, area: 5, boundary: { type: 'Polygon', coordinates: [[[71,51],[72,51],[72,52],[71,51]]] } };
  const other = structuredClone(field); other.boundary!.coordinates[0][1][0] = 72.1;
  assert.deepEqual(changedRecordFields(field, other, false, false), ['границы']);
  assert.match(conflictFacts('field', field, false).find(f => f.label === 'Границы')!.value, /3 вершин/);
  assert.deepEqual(conflictFacts('field', field, true), [{ label: 'Состояние', value: 'Удалена' }]);
});
test('conflicts surface deletion, changed attachment identity and field binding without raw IDs in summaries', () => {
  const entry: Entry = { title: 'Осмотр', text: 'Сухо', date: '2026-10-09', fieldId: 'a', assets: ['photo-a'] };
  const other = { ...entry, assets: ['photo-b'], fieldId: 'b' };
  assert.deepEqual(changedRecordFields(entry, other, false, true), ['удаление записи', 'вложения', 'привязка к участку']);
  assert.ok(!JSON.stringify(conflictFacts('entry', entry, false)).includes('photo-a'));
});
