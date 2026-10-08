import test from 'node:test';
import assert from 'node:assert/strict';
import { demoSource } from '../src/entities/field/demo-source.ts';
import { simulatedWeather, weatherFormat } from '../src/entities/weather/simulation.ts';
import type { WeatherId } from '../src/entities/field/types.ts';

test('scene values and current simulated weather remain consistent in every scenario', () => {
  for (const scenario of ['sun', 'rain', 'wind', 'night'] as WeatherId[]) {
    const snapshot = demoSource.getSnapshot('wheat', scenario, 2);
    const report = simulatedWeather.getReport('wheat', scenario, snapshot);
    assert.equal(report.source, 'simulation');
    assert.equal(report.current.temperature, snapshot.temperature);
    assert.equal(report.current.wind, snapshot.wind);
    assert.equal(report.current.rain, snapshot.rain);
    assert.equal(report.current.humidity, snapshot.humidity);
    assert.equal(report.current.condition, scenario);
    assert.equal(weatherFormat.format(new Date(report.current.time)), scenario === 'night' ? '22:00' : '10:00');
    assert.equal(report.hourly.length, 240);
    assert.equal(report.daily.length, 10);
  }
});

test('hourly intervals cross midnight correctly and moisture variables stay within physical bounds', () => {
  const snapshot = demoSource.getSnapshot('apple', 'night', 3);
  const report = simulatedWeather.getReport('apple', 'night', snapshot);
  assert.deepEqual(report.hourly.slice(0, 4).map(h => h.localHour), [22, 23, 0, 1]);
  report.hourly.forEach((h, i) => {
    if (i) assert.equal(Date.parse(h.time) - Date.parse(report.hourly[i - 1].time), 3_600_000);
    assert.ok(h.dewPoint <= h.temperature);
    assert.ok(h.wetBulb >= h.dewPoint && h.wetBulb <= h.temperature);
    assert.ok(h.humidity >= 0 && h.humidity <= 100);
    assert.ok(h.rainProbability >= 0 && h.rainProbability <= 100);
    assert.ok(h.gust >= h.wind);
    assert.ok(h.rain >= 0);
    if (!h.isDaytime) assert.equal(h.uvIndex, 0);
  });
});

test('full-day totals and extremes are derived from the same hourly series shown on screen', () => {
  const snapshot = demoSource.getSnapshot('tomato', 'rain', 3);
  const report = simulatedWeather.getReport('tomato', 'rain', snapshot);
  // Tomorrow is a complete local day inside the hourly forecast (starts at 10:00 today).
  const tomorrow = report.hourly.slice(14, 38);
  assert.equal(tomorrow[0].localHour, 0);
  assert.equal(tomorrow[23].localHour, 23);
  assert.equal(report.daily[1].rain, Math.round(tomorrow.reduce((sum, h) => sum + h.rain, 0) * 10) / 10);
  assert.equal(report.daily[1].min, Math.min(...tomorrow.map(h => h.temperature)));
  assert.equal(report.daily[1].max, Math.max(...tomorrow.map(h => h.temperature)));
  assert.equal(report.daily[1].gust, Math.max(...tomorrow.map(h => h.gust)));
});
