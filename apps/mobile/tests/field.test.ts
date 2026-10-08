import test from 'node:test';
import assert from 'node:assert/strict';
import { demoSource } from '../src/entities/field/demo-source.ts';
import { parsePreferences } from '../src/shared/lib/preferences.ts';
import { cropIds } from '../src/entities/field/catalog.ts';

test('all four crops expose sixteen explicitly illustrative, independent factors', () => {
  for (const id of cropIds) {
    const snapshot = demoSource.getSnapshot(id, 'sun', 2);
    assert.equal(snapshot.crop.id, id);
    assert.equal(snapshot.source, 'demo');
    assert.equal(new Set(snapshot.factors.map(f => f.id)).size, 16);
    assert.equal(snapshot.factors.find(f => f.id === 'pests')!.value, null);
    assert.equal(snapshot.factors.find(f => f.id === 'disease')!.value, null);
  }
});
test('weather scene and metrics share one snapshot, without inventing a health score', () => {
  const sunny = demoSource.getSnapshot('wheat', 'sun', 2);
  const rainy = demoSource.getSnapshot('wheat', 'rain', 2);
  assert.equal(sunny.rain, 0);
  assert.ok(rainy.rain > 0);
  assert.equal(rainy.factors.find(f => f.id === 'rain')!.value, rainy.rain);
  assert.equal(rainy.factors.find(f => f.id === 'soilMoisture')!.value, rainy.soilMoisture);
  assert.ok(demoSource.getSnapshot('wheat', 'wind', 2).wind > sunny.wind);
  assert.equal(demoSource.getSnapshot('wheat', 'night', 2).factors.find(f => f.id === 'light')!.value, 0);
  assert.equal(sunny.weather, 'sun');
});
test('corrupt or older persisted settings cannot select missing crops or invalid growth stages', () => {
  const p = parsePreferences({ crop: 'missing', weather: 'hurricane', stages: { wheat: 200, tomato: -1, apple: 1.4, sunflower: 1 }, completed: [null, 'wheat:soil', 5], motion: 'true' });
  assert.equal(p.crop, 'wheat'); assert.equal(p.weather, 'sun');
  assert.deepEqual(p.stages, { wheat: 2, tomato: 3, apple: 3, sunflower: 1 });
  assert.deepEqual(p.completed, ['wheat:soil']);
  assert.equal(parsePreferences(null).crop, 'wheat');
});
