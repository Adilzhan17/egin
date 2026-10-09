import type { Reading } from '../../entities/weather/live-types.ts';
import { dateKey, localDate } from '../../entities/weather/open-meteo.ts';

export function forecastChart(hours: Reading[], metric: 'temperature' | 'rain' | 'wind') {
  const values = hours.map(hour => hour[metric]).filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  const min = metric === 'temperature' && values.length ? Math.min(...values) - 2 : 0;
  const max = Math.max(min + 1, ...values);
  let drawing = false;
  const path = hours.map((hour, index) => {
    const n = hour[metric];
    // Missing readings break the line; connecting them would imply measurements.
    if (n == null || !Number.isFinite(n)) { drawing = false; return ''; }
    const command = drawing ? 'L' : 'M';
    drawing = true;
    return `${command}${index * 62 + 31} ${92 - (n - min) / (max - min) * 70}`;
  }).filter(Boolean).join(' ');
  return { min, max, path, hasValues: values.length > 0 };
}

export function forecastDayLabel(date: string, now = Date.now()) {
  const today = dateKey(new Date(now).toISOString());
  if (dateKey(date) === today) return 'Сегодня';
  if (dateKey(date) === dateKey(new Date(now + 86_400_000).toISOString())) return 'Завтра';
  return localDate(date, true);
}
