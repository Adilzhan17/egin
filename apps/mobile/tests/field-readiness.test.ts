import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fieldReadiness } from '../src/features/home/field-readiness.ts';
import type { Row, Field, Sensor } from '../src/entities/workspace/types.ts';
import type { LiveWeatherReport } from '../src/entities/weather/live-types.ts';
const now = Date.parse('2026-10-09T10:00:00Z');
const field = { id: 'field', owner: 'alice', data: { name: 'Поле', latitude: 51, longitude: 71, area: 3, crop: 'unknown', boundary: { type: 'Polygon', coordinates: [[[71,51],[72,51],[72,52],[71,51]]] } } } as Row<Field>;
const report = { fetchedAt: now, current: { time: new Date(now).toISOString() }, location: { latitude: 51, longitude: 71 } } as LiveWeatherReport;
test('readiness never uses weather from another field or presents saved/future data as current', () => {
  assert.equal(fieldReadiness(field, [], report, false, now).weather, 'current');
  assert.equal(fieldReadiness(field, [], report, true, now).weather, 'saved');
  assert.equal(fieldReadiness(field, [], { ...report, location: { ...report.location, latitude: 52 } }, false, now).weather, 'missing');
  assert.equal(fieldReadiness(field, [], { ...report, current: { ...report.current, time: '2026-10-09T16:00:00Z' } }, false, now).weather, 'saved');
  assert.equal(fieldReadiness(field, [], report, false, now + 4 * 3600000).weather, 'saved');
});
test('next steps prioritise conflicts, real land and missing boundaries; registered sensors are owner-scoped', () => {
  const sensors = [{ owner: 'alice', data: { fieldId: 'field' } }, { owner: 'bob', data: { fieldId: 'field' } }, { owner: 'alice', deleted: true, data: { fieldId: 'field' } }] as Row<Sensor>[];
  assert.equal(fieldReadiness(field, sensors, report, false, now).sensorCount, 1);
  assert.equal(fieldReadiness(undefined, sensors, report, false, now).next.href, '/fields');
  assert.equal(fieldReadiness({ ...field, conflict: {} as Row['conflict'] }, [], report, false, now).next.href, '/settings/sync');
  assert.match(fieldReadiness({ ...field, data: { ...field.data, boundary: undefined } }, [], report, false, now).next.title, /границы/);
  assert.match(fieldReadiness({ ...field, data: { ...field.data, cadastre: { source: 'demo', importedAt: new Date(now).toISOString() } } }, [], report, false, now).next.title, /собственный/);
  assert.match(fieldReadiness(field, [], report, false, now).next.description, /Приём показаний ещё в разработке/);
});
