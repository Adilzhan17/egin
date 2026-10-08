import type { CropId } from '../field/types';

export type WeatherCondition = 'sun' | 'night' | 'cloud' | 'rain' | 'snow' | 'fog' | 'storm' | 'wind';
export type Reading = {
  time: string; condition: WeatherCondition; description: string; isDaytime: boolean;
  temperature: number; humidity: number; wind: number;
  feelsLike: number | null; dewPoint: number | null; wetBulb: number | null;
  heatIndex: number | null; windChill: number | null; thunderProbability: number | null;
  uvIndex: number | null; rain: number | null; rainProbability: number | null;
  pressure: number | null; gust: number | null; windDegrees: number | null;
  windDirection: string; visibility: number | null; cloudCover: number | null;
};
export type ForecastDay = {
  date: string; label: string; min: number; max: number; condition: WeatherCondition;
  rain: number | null; rainProbability: number | null; wind: number | null; gust: number | null;
  sunrise: string | null; sunset: string | null; uvIndex: number | null;
};
export type LiveWeatherReport = {
  source: 'open-meteo'; fetchedAt: number; crop: CropId;
  location: { name: string; latitude: number; longitude: number; timezone: string };
  current: Reading; hourly: Reading[]; daily: ForecastDay[];
  history: { rain: number | null; min: number | null; max: number | null };
};
/** Provider boundary: a future Google adapter supplies the same normalized report. */
export interface WeatherProvider { getReport(crop: CropId, signal?: AbortSignal, location?: LiveWeatherReport['location']): Promise<LiveWeatherReport> }
