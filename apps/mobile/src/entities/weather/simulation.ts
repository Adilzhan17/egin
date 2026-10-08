import type { WeatherReading, WeatherSource } from './types.ts';
import type { CropId, WeatherId } from '../field/types.ts';

const locations: Record<CropId, { latitude: number; longitude: number }> = {
  wheat: { latitude: 52.4038, longitude: 69.4056 },
  tomato: { latitude: 43.338, longitude: 77.12 },
  apple: { latitude: 43.19, longitude: 76.97 },
  sunflower: { latitude: 49.92, longitude: 82.61 },
};
const round = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const anchor = Date.parse('2026-06-18T00:00:00+05:00');
const hourMs = 3_600_000;
// Pin this demo's UTC+5 offset: older browser timezone databases still use UTC+6 for Almaty.
const displayTimeZone = 'Etc/GMT-5';
export const weatherFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: displayTimeZone, hour: '2-digit', minute: '2-digit' });

/** Deterministic UI simulation, NOT Google responses, WeatherNext inference or observed weather.
 * Field names/units follow documented Google Weather concepts; all values are generated locally.
 * A single hourly series supplies both plots and daily aggregates, avoiding contradictory cards.
 */
export const simulatedWeather: WeatherSource = {
  getReport(crop, scenario, seed) {
    const startHour = scenario === 'night' ? 22 : 10;
    function reading(index: number): WeatherReading {
      const hour = ((index % 24) + 24) % 24, day = Math.floor(index / 24);
      const isDaytime = hour >= 4 && hour < 22;
      const wave = Math.sin((hour - 8) * Math.PI / 12), reference = Math.sin((startHour - 8) * Math.PI / 12);
      const temperature = round(seed.temperature + 4.2 * (wave - reference) + Math.sin(day * .8) * 1.7);
      const rainyWindow = scenario === 'rain' ? (hour >= 8 && hour <= 17) : (day % 3 === 1 && hour >= 13 && hour <= 16);
      const rain = rainyWindow ? round((scenario === 'rain' ? seed.rain : .8) * (.8 + .2 * Math.cos((hour - startHour) / 2))) : 0;
      const humidity = Math.round(clamp(seed.humidity - (temperature - seed.temperature) * 2 + (rain > 0 && scenario !== 'rain' ? 17 : 0), 20, 99));
      // The dew point is derived solely to keep synthetic humidity/temperature internally consistent.
      const gamma = Math.log(humidity / 100) + 17.625 * temperature / (243.04 + temperature);
      const dewPoint = round(243.04 * gamma / (17.625 - gamma));
      const wind = Math.round(Math.max(1, seed.wind + 3 * (Math.cos((hour - startHour) / 3) - 1) + Math.sin(day) * 3));
      const gust = wind + (scenario === 'wind' ? 16 : 7);
      const condition: WeatherId = rain > 0 ? 'rain' : scenario === 'wind' && isDaytime ? 'wind' : isDaytime ? 'sun' : 'night';
      const windDegrees = Math.round((scenario === 'wind' ? 290 : scenario === 'rain' ? 245 : 225) + Math.sin(index / 5) * 12);
      const directions = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
      const feelsLike = round(temperature - wind / 18 + (humidity > 70 && temperature > 25 ? 1.5 : 0));
      return {
        time: new Date(anchor + index * hourMs).toISOString(), localHour: hour, condition,
        description: condition === 'rain' ? 'Дождь' : condition === 'wind' ? 'Ветрено' : condition === 'night' ? 'Ясная ночь' : 'Ясно',
        temperature, feelsLike, dewPoint, wetBulb: round((dewPoint + temperature) / 2),
        heatIndex: temperature, windChill: feelsLike, humidity,
        uvIndex: isDaytime ? Math.round(Math.max(0, Math.sin((hour - 5) / 16 * Math.PI)) * (rain > 0 ? 2 : 6)) : 0,
        rain, rainProbability: rain > 0 ? Math.min(95, 75 + Math.round(rain * 5)) : rainyWindow ? 50 : 5,
        thunderProbability: rain > 0 ? 15 : 0,
        pressure: round((scenario === 'rain' ? 1006 : scenario === 'wind' ? 1010 : 1017) + Math.sin(index / 9) * 1.5),
        wind, gust, windDegrees, windDirection: directions[Math.round(windDegrees / 45) % 8],
        visibility: rain > 0 ? 6 : 20, cloudCover: rain > 0 ? 94 : scenario === 'wind' ? 42 : 12, isDaytime,
      };
    }
    const hours = Array.from({ length: 264 }, (_, i) => reading(i));
    const history = Array.from({ length: 24 }, (_, i) => reading(startHour - 24 + i));
    const current = hours[startHour];
    return {
      source: 'simulation', sourceLabel: 'Демонстрационный прогноз · не данные Google', timezone: 'Asia/Almaty',
      location: locations[crop], current, hourly: hours.slice(startHour, startHour + 240),
      daily: Array.from({ length: 10 }, (_, day) => {
        const values = hours.slice(day * 24, (day + 1) * 24);
        const wet = values.some(h => h.rain > 0);
        return {
          date: values[12].time,
          label: new Intl.DateTimeFormat('ru-RU', { timeZone: displayTimeZone, day: 'numeric', month: 'short' }).format(new Date(values[12].time)),
          min: Math.min(...values.map(h => h.temperature)), max: Math.max(...values.map(h => h.temperature)),
          rain: round(values.reduce((n, h) => n + h.rain, 0)), rainProbability: Math.max(...values.map(h => h.rainProbability)),
          wind: Math.max(...values.map(h => h.wind)), gust: Math.max(...values.map(h => h.gust)),
          humidity: Math.round(values.reduce((n, h) => n + h.humidity, 0) / 24),
          condition: wet ? 'rain' : scenario === 'wind' ? 'wind' : 'sun',
          sunrise: '04:58', sunset: '21:37', uvIndex: Math.max(...values.map(h => h.uvIndex)),
        };
      }),
      history: {
        min: Math.min(...history.map(h => h.temperature)), max: Math.max(...history.map(h => h.temperature)),
        rain: round(history.reduce((n, h) => n + h.rain, 0)), temperatureChange: round(current.temperature - reading(startHour - 24).temperature),
      },
    };
  },
};
