import type { CropId, WeatherId } from '../field/types';

export type WeatherReading = {
  time: string; localHour: number; condition: WeatherId; description: string;
  temperature: number; feelsLike: number; dewPoint: number; wetBulb: number;
  heatIndex: number; windChill: number; humidity: number; uvIndex: number;
  rain: number; rainProbability: number; thunderProbability: number;
  pressure: number; wind: number; gust: number; windDegrees: number; windDirection: string;
  visibility: number; cloudCover: number; isDaytime: boolean;
};
export type WeatherDay = {
  date: string; label: string; min: number; max: number; rain: number;
  rainProbability: number; wind: number; gust: number; humidity: number;
  condition: WeatherId; sunrise: string; sunset: string; uvIndex: number;
};
export type WeatherReport = {
  source: 'simulation'; sourceLabel: string; timezone: 'Asia/Almaty';
  current: WeatherReading; hourly: WeatherReading[]; daily: WeatherDay[];
  location: { latitude: number; longitude: number };
  history: { min: number; max: number; rain: number; temperatureChange: number };
};
export type WeatherSeed = { temperature: number; wind: number; rain: number; humidity: number };
export type WeatherSource = { getReport(crop: CropId, scenario: WeatherId, seed: WeatherSeed): WeatherReport };
