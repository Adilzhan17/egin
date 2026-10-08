import type { CropId } from '../field/types.ts';
import type { ForecastDay, LiveWeatherReport, Reading, WeatherCondition, WeatherProvider } from './live-types.ts';

export const weatherLocations: Record<CropId, LiveWeatherReport['location']> = {
  wheat: { name: 'Астана', latitude: 51.1694, longitude: 71.4491, timezone: 'Asia/Almaty' },
  tomato: { name: 'Талгар', latitude: 43.338, longitude: 77.12, timezone: 'Asia/Almaty' },
  apple: { name: 'Алматы', latitude: 43.19, longitude: 76.97, timezone: 'Asia/Almaty' },
  sunflower: { name: 'Усть-Каменогорск', latitude: 49.92, longitude: 82.61, timezone: 'Asia/Almaty' },
};
// Kazakhstan uses UTC+5; pin the offset on devices with an older timezone database.
export const localTime = (time: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Etc/GMT-5', hour: '2-digit', minute: '2-digit' }).format(new Date(time));
export const localDate = (time: string, weekday = false) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Etc/GMT-5', day: 'numeric', month: 'short', ...(weekday ? { weekday: 'short' as const } : {}) }).format(new Date(time));
export const dateKey = (time: string) => new Date(Date.parse(time) + 5 * 3_600_000).toISOString().slice(0, 10);
export function weatherCode(code: number | null, day: boolean): { condition: WeatherCondition; description: string } {
  if (code === null) return { condition: 'cloud', description: 'Условия не определены' };
  if (code >= 95) return { condition: 'storm', description: 'Гроза' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { condition: 'snow', description: 'Снег' };
  if (code >= 51) return { condition: 'rain', description: code < 60 ? 'Морось' : 'Дождь' };
  if (code >= 45) return { condition: 'fog', description: 'Туман' };
  if (code >= 2) return { condition: 'cloud', description: code === 3 ? 'Пасмурно' : 'Переменная облачность' };
  return { condition: day ? 'sun' : 'night', description: code === 1 ? 'Малооблачно' : 'Ясно' };
}
const hourlyFields = ['temperature_2m', 'relative_humidity_2m', 'dew_point_2m', 'apparent_temperature', 'wet_bulb_temperature_2m', 'precipitation_probability', 'precipitation', 'weather_code', 'pressure_msl', 'cloud_cover', 'visibility', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'uv_index', 'is_day'];
const currentFields = ['temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day', 'precipitation', 'weather_code', 'cloud_cover', 'pressure_msl', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m'];
const dailyFields = ['temperature_2m_max', 'temperature_2m_min', 'sunrise', 'sunset', 'uv_index_max', 'precipitation_sum', 'precipitation_probability_max', 'wind_speed_10m_max', 'wind_gusts_10m_max', 'weather_code'];
type Series = Record<string, unknown>;
function record(value: unknown): Series { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Некорректный ответ погоды'); return value as Series; }
const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const at = (series: Series, key: string, i: number) => number(Array.isArray(series[key]) ? series[key][i] : null);
const required = (value: number | null): number => { if (value === null) throw new Error('Неполный ответ погоды'); return value; };
const iso = (value: number) => new Date(value * 1000).toISOString();
const sum = (values: (number | null)[]) => values.length && values.every(v => v !== null) ? Math.round(values.reduce<number>((a, b) => a + b!, 0) * 10) / 10 : null;
function reading(time: number, value: (key: string) => number | null): Reading {
  const day = value('is_day') === 1, direction = value('wind_direction_10m');
  return {
    time: iso(time), ...weatherCode(value('weather_code'), day), isDaytime: day,
    temperature: required(value('temperature_2m')), humidity: required(value('relative_humidity_2m')), wind: required(value('wind_speed_10m')),
    feelsLike: value('apparent_temperature'), dewPoint: value('dew_point_2m'), wetBulb: value('wet_bulb_temperature_2m'),
    // This provider has no separate heat-index / wind-chill / thunder-probability fields.
    heatIndex: null, windChill: null, thunderProbability: null,
    uvIndex: value('uv_index'), rain: value('precipitation'), rainProbability: value('precipitation_probability'),
    pressure: value('pressure_msl'), gust: value('wind_gusts_10m'), windDegrees: direction,
    windDirection: direction === null ? '—' : ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'][Math.round(direction / 45) % 8],
    visibility: value('visibility') === null ? null : value('visibility')! / 1000, cloudCover: value('cloud_cover'),
  };
}
export function normalizeWeather(payload: unknown, crop: CropId, fetchedAt = Date.now()): LiveWeatherReport {
  const data = record(payload), hourly = record(data.hourly), daily = record(data.daily), current = record(data.current);
  if (!Array.isArray(hourly.time) || !hourly.time.length || !Array.isArray(daily.time)) throw new Error('Прогноз не получен');
  const times = hourly.time.map(v => required(number(v))), now = required(number(current.time));
  // Instant current fields are supplemented by the current hour, never by tomorrow's value.
  let currentIndex = times.findIndex(t => t <= now && now < t + 3600);
  if (currentIndex < 0) throw new Error('Нет текущего часа');
  const currentReading = reading(now, key => key in current ? number(current[key]) : at(hourly, key, currentIndex));
  // Current precipitation is a 15-minute amount. Display the hourly sum consistently.
  currentReading.rain = at(hourly, 'precipitation', currentIndex);
  const all = times.map((time, i) => reading(time, key => at(hourly, key, i)));
  const today = dateKey(currentReading.time);
  const days: ForecastDay[] = daily.time.map((raw, i) => {
    const time = iso(required(number(raw))), sunrise = at(daily, 'sunrise', i), sunset = at(daily, 'sunset', i);
    return { date: time, label: dateKey(time) === today ? 'Сегодня' : localDate(time, true), min: required(at(daily, 'temperature_2m_min', i)), max: required(at(daily, 'temperature_2m_max', i)),
      condition: weatherCode(at(daily, 'weather_code', i), true).condition, rain: at(daily, 'precipitation_sum', i), rainProbability: at(daily, 'precipitation_probability_max', i),
      wind: at(daily, 'wind_speed_10m_max', i), gust: at(daily, 'wind_gusts_10m_max', i), sunrise: sunrise === null ? null : iso(sunrise), sunset: sunset === null ? null : iso(sunset), uvIndex: at(daily, 'uv_index_max', i) };
  }).filter(d => dateKey(d.date) >= today).slice(0, 10);
  if (!days.length) throw new Error('Нет суточного прогноза');
  const history = all.filter(h => Date.parse(h.time) < times[currentIndex] * 1000 && Date.parse(h.time) >= (times[currentIndex] - 86400) * 1000);
  return { source: 'open-meteo', crop, fetchedAt, location: weatherLocations[crop], current: currentReading, hourly: all.slice(currentIndex, currentIndex + 240), daily: days,
    history: { rain: history.length === 24 ? sum(history.map(h => h.rain)) : null, min: history.length === 24 ? Math.min(...history.map(h => h.temperature)) : null, max: history.length === 24 ? Math.max(...history.map(h => h.temperature)) : null } };
}
export const openMeteo: WeatherProvider = {
  async getReport(crop, signal, selectedLocation) {
    const location = selectedLocation ?? weatherLocations[crop];
    const params = new URLSearchParams({ latitude: String(location.latitude), longitude: String(location.longitude), timezone: location.timezone, timeformat: 'unixtime', forecast_days: '10', past_days: '1', temperature_unit: 'celsius', wind_speed_unit: 'kmh', precipitation_unit: 'mm', hourly: hourlyFields.join(','), current: currentFields.join(','), daily: dailyFields.join(',') });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal });
    if (!response.ok) throw new Error(`Погода недоступна (${response.status})`);
    return { ...normalizeWeather(await response.json(), crop), location };
  },
};
const cacheKey = (crop: CropId, location?: LiveWeatherReport['location']) => `egin.weather.open-meteo.v1.${crop}${location && (location.latitude !== weatherLocations[crop].latitude || location.longitude !== weatherLocations[crop].longitude) ? '.' + location.latitude + '.' + location.longitude : ''}`;
export function readWeatherCache(crop: CropId, location = weatherLocations[crop]): LiveWeatherReport | null {
  try {
    const report = JSON.parse(localStorage.getItem(cacheKey(crop, location)) || 'null') as LiveWeatherReport | null;
    if (!report || report.source !== 'open-meteo' || report.crop !== crop || !Number.isFinite(report.fetchedAt) || Date.now() - report.fetchedAt > 86400000 || report.fetchedAt > Date.now() + 60000) return null;
    if (!report.current || !Number.isFinite(report.current.temperature) || !Number.isFinite(Date.parse(report.current.time)) || !Array.isArray(report.hourly) || !report.hourly.length || !Array.isArray(report.daily) || !report.daily.length || report.location?.latitude !== location.latitude || report.location?.longitude !== location.longitude) return null;
    if (!report.daily.every(d => Number.isFinite(d.min) && Number.isFinite(d.max) && Number.isFinite(Date.parse(d.date))) || !report.hourly.every(h => Number.isFinite(h.temperature) && Number.isFinite(Date.parse(h.time)))) return null;
    return report;
  } catch { return null; }
}
export function saveWeatherCache(report: LiveWeatherReport) { try { localStorage.setItem(cacheKey(report.crop, report.location), JSON.stringify(report)); } catch { /* Weather still works without device storage. */ } }
