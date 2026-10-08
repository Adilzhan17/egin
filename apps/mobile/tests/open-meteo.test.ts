import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dateKey, normalizeWeather, openMeteo, readWeatherCache, saveWeatherCache, weatherCode } from '../src/entities/weather/open-meteo.ts';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/open-meteo.json', import.meta.url), 'utf8'));
const clone = () => structuredClone(fixture);

test('real provider preserves units, local dates, hourly precipitation and missing indicators', () => {
  const report = normalizeWeather(fixture, 'wheat');
  const i = fixture.hourly.time.findIndex((t: number) => t <= fixture.current.time && fixture.current.time < t + 3600);
  assert.equal(report.current.temperature, fixture.current.temperature_2m);
  assert.equal(report.current.visibility, fixture.hourly.visibility[i] / 1000);
  assert.equal(report.current.rain, fixture.hourly.precipitation[i]);
  assert.equal(report.current.windDegrees, fixture.current.wind_direction_10m);
  assert.equal(report.current.heatIndex, null);
  assert.equal(report.current.windChill, null);
  assert.equal(report.current.thunderProbability, null);
  assert.equal(report.daily.length, 10);
  assert.equal(dateKey(report.daily[0].date), dateKey(report.current.time));
  assert.ok(report.hourly.length >= 24);
  assert.equal(report.hourly[0].time, new Date(fixture.hourly.time[i] * 1000).toISOString());
  assert.equal(report.history.rain, Math.round(fixture.hourly.precipitation.slice(i - 24, i).reduce((a: number, b: number) => a + b, 0) * 10) / 10);
});
test('night rain, storms, snow, fog and overcast are mapped without claiming clear skies', () => {
  assert.equal(weatherCode(63, false).condition, 'rain');
  assert.equal(weatherCode(0, false).condition, 'night');
  assert.equal(weatherCode(3, true).condition, 'cloud');
  assert.equal(weatherCode(73, true).condition, 'snow');
  assert.equal(weatherCode(95, false).condition, 'storm');
  assert.equal(weatherCode(45, true).condition, 'fog');
});
test('missing optional readings stay absent, invalid core data fails instead of becoming zero', () => {
  const payload = clone();
  payload.hourly.wet_bulb_temperature_2m.fill(null);
  payload.hourly.visibility.fill(null);
  const report = normalizeWeather(payload, 'tomato');
  assert.equal(report.current.wetBulb, null);
  assert.equal(report.current.visibility, null);
  assert.equal(report.hourly[0].visibility, null);
  payload.current.temperature_2m = null;
  assert.throws(() => normalizeWeather(payload, 'tomato'), /Неполный/);
  assert.throws(() => normalizeWeather({}, 'wheat'));
});
test('provider sends fixed units and a cancellable request and reports HTTP failures', async t => {
  const controller = new AbortController();
  const mock = t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    const query = new URL(url).searchParams;
    assert.equal(query.get('timeformat'), 'unixtime');
    assert.equal(query.get('wind_speed_unit'), 'kmh');
    assert.equal(query.get('forecast_days'), '10');
    assert.equal(init.signal, controller.signal);
    return new Response(JSON.stringify(fixture), { status: 200 });
  });
  assert.equal((await openMeteo.getReport('apple', controller.signal)).crop, 'apple');
  mock.mock.mockImplementation(async () => new Response('', { status: 429 }));
  await assert.rejects(openMeteo.getReport('apple'), /429/);
});
test('offline cache is scoped by crop, expires, and survives corrupt or unavailable storage', t => {
  const data = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'localStorage', previous) : Reflect.deleteProperty(globalThis, 'localStorage'));
  const report = normalizeWeather(fixture, 'wheat');
  saveWeatherCache(report);
  assert.equal(readWeatherCache('wheat')?.current.temperature, report.current.temperature);
  assert.equal(readWeatherCache('apple'), null);
  saveWeatherCache({ ...report, fetchedAt: Date.now() - 86_400_001 });
  assert.equal(readWeatherCache('wheat'), null);
  data.set('egin.weather.open-meteo.v1.wheat', '{invalid');
  assert.equal(readWeatherCache('wheat'), null);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  assert.equal(readWeatherCache('wheat'), null);
  assert.doesNotThrow(() => saveWeatherCache(report));
});
