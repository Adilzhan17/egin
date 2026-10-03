import { BadRequestException, Injectable } from '@nestjs/common';

export type GardenConditions = {
  provider: 'open-meteo';
  kind: 'model';
  calculatedAt: string | null;
  soilMoisturePercent: number | null;
  soilTemperatureC: number | null;
  airHumidityPercent: number | null;
  soilMoistureDepthCm: [number, number];
  soilTemperatureDepthCm: number;
};

type HourlyResponse = {
  hourly?: Record<string, unknown[]>;
  hourly_units?: Record<string, string>;
};

// Unix timestamps avoid treating the provider's local time as the server's time.
export function parseGardenConditions(
  data: HourlyResponse,
  now = Date.now(),
): GardenConditions {
  const hourly = data.hourly;
  const times = hourly?.time ?? [];
  let index = -1;
  times.forEach((time, i) => {
    if (
      typeof time === 'number' &&
      time * 1000 <= now &&
      now - time * 1000 < 7200000 &&
      (index < 0 || time > Number(times[index]))
    )
      index = i;
  });
  const metric = (name: string, unit: string, min: number, max: number) => {
    const value = hourly?.[name]?.[index];
    return data.hourly_units?.[name] === unit &&
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= min &&
      value <= max
      ? value
      : null;
  };
  const moisture = metric('soil_moisture_3_to_9cm', 'm³/m³', 0, 1);
  return {
    provider: 'open-meteo',
    kind: 'model',
    calculatedAt:
      index < 0 ? null : new Date(Number(times[index]) * 1000).toISOString(),
    soilMoisturePercent:
      moisture === null ? null : Math.round(moisture * 1000) / 10,
    soilTemperatureC: metric('soil_temperature_6cm', '°C', -80, 80),
    airHumidityPercent: metric('relative_humidity_2m', '%', 0, 100),
    soilMoistureDepthCm: [3, 9],
    soilTemperatureDepthCm: 6,
  };
}

@Injectable()
export class GardenConditionsService {
  private readonly cache = new Map<
    string,
    { expires: number; data: GardenConditions }
  >();
  private readonly pending = new Map<string, Promise<GardenConditions>>();

  async getConditions(lat: number, lng: number): Promise<GardenConditions> {
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      throw new BadRequestException('Invalid coordinates');
    }
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.data;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const request = this.fetchConditions(lat, lng)
      .then((data) => {
        if (this.cache.size >= 500)
          this.cache.delete([...this.cache.keys()][0]);
        this.cache.set(key, { data, expires: Date.now() + 600000 });
        return data;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }

  private async fetchConditions(lat: number, lng: number) {
    const url = new URL(
      process.env.WEATHER_API_BASE_URL ||
        'https://api.open-meteo.com/v1/forecast',
    );
    url.search = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lng),
      hourly:
        'relative_humidity_2m,soil_temperature_6cm,soil_moisture_3_to_9cm',
      timeformat: 'unixtime',
      timezone: 'GMT',
      forecast_days: '1',
    }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok)
      throw new Error(`Garden weather provider: ${response.status}`);
    return parseGardenConditions((await response.json()) as HourlyResponse);
  }
}
