import test from 'node:test';
import assert from 'node:assert/strict';
import { forecastChart, forecastDayLabel } from '../src/features/weather/presentation.ts';
import type { Reading } from '../src/entities/weather/live-types.ts';

const hours = (values: (number | null)[]) => values.map(rain => ({ rain }) as Reading);

test('missing hourly measurements break the chart and retain the actual hour position', () => {
  const chart = forecastChart(hours([2, 1, null, 3]), 'rain');
  assert.equal(chart.hasValues, true);
  assert.equal(chart.max, 3);
  assert.match(chart.path, /^M31 .+ L93 .+ M217 /);
  assert.doesNotMatch(chart.path, /155/);
});

test('unavailable chart values do not create invalid SVG or fabricate zero readings', () => {
  for (const readings of [[], hours([null, null]), hours([NaN, Infinity])]) {
    const chart = forecastChart(readings, 'rain');
    assert.equal(chart.hasValues, false);
    assert.equal(chart.path, '');
    assert.ok(Number.isFinite(chart.min));
    assert.ok(Number.isFinite(chart.max));
  }
  const zero = forecastChart(hours([0, 0]), 'rain');
  assert.equal(zero.hasValues, true);
  assert.equal(zero.path, 'M31 92 L93 92');
});

test('forecast day labels follow Kazakhstan midnight rather than cached labels or device timezone', () => {
  const now = Date.parse('2026-10-09T19:15:00Z'); // October 10 in Kazakhstan.
  assert.equal(forecastDayLabel('2026-10-09T19:00:00Z', now), 'Сегодня');
  assert.equal(forecastDayLabel('2026-10-10T19:00:00Z', now), 'Завтра');
  assert.notEqual(forecastDayLabel('2026-10-08T19:00:00Z', now), 'Сегодня');
});
