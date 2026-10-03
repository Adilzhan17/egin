import { BadRequestException, Injectable } from '@nestjs/common';

type OpenMeteoResponse = {
  current?: {
    temperature_2m?: number;
    wind_speed_10m?: number;
    weather_code?: number;
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
    precipitation_sum?: number[];
    wind_speed_10m_max?: number[];
  };
};

@Injectable()
export class WeatherService {
  private readonly providerBaseUrl =
    process.env.WEATHER_API_BASE_URL?.replace(/\/$/, '') ||
    'https://api.open-meteo.com/v1/forecast';

  private readonly regionCoordinates: Record<
    string,
    { lat: number; lng: number }
  > = {
    'Алматинская': { lat: 43.8, lng: 77.1 },
    'Алматинская область': { lat: 43.8, lng: 77.1 },
    'Алматы облысы': { lat: 43.8, lng: 77.1 },
    'Туркестанская': { lat: 43.3, lng: 68.3 },
    'Туркестанская область': { lat: 43.3, lng: 68.3 },
    'Туркестан обл.': { lat: 43.3, lng: 68.3 },
    'Жамбылская': { lat: 44.85, lng: 72.95 },
    'Жамбылская область': { lat: 44.85, lng: 72.95 },
    'Жетысу': { lat: 45.02, lng: 78.37 },
    'Кызылординская': { lat: 44.85, lng: 65.5 },
    'Кызылординская область': { lat: 44.85, lng: 65.5 },
    'Костанайская': { lat: 53.2, lng: 63.62 },
    'Костанайская область': { lat: 53.2, lng: 63.62 },
    'Северо-Казахстанская': { lat: 54.87, lng: 69.15 },
    'Северо-Казахстанская область': { lat: 54.87, lng: 69.15 },
    'Акмолинская': { lat: 51.16, lng: 71.47 },
    'Акмолинская область': { lat: 51.16, lng: 71.47 },
    'Карагандинская': { lat: 49.8, lng: 73.1 },
    'Карагандинская область': { lat: 49.8, lng: 73.1 },
    'Павлодарская': { lat: 52.3, lng: 76.95 },
    'Павлодарская область': { lat: 52.3, lng: 76.95 },
    'Восточно-Казахстанская': { lat: 49.95, lng: 82.61 },
    'Восточно-Казахстанская область': { lat: 49.95, lng: 82.61 },
    'Западно-Казахстанская': { lat: 51.23, lng: 51.37 },
    'Западно-Казахстанская область': { lat: 51.23, lng: 51.37 },
    'Актюбинская': { lat: 50.28, lng: 57.17 },
    'Актюбинская область': { lat: 50.28, lng: 57.17 },
    'Атырауская': { lat: 47.12, lng: 51.92 },
    'Атырауская область': { lat: 47.12, lng: 51.92 },
    'Мангистауская': { lat: 43.65, lng: 51.16 },
    'Мангистауская область': { lat: 43.65, lng: 51.16 },
  };

  private normalizeRegionKey(region: string) {
    return region
      .toLowerCase()
      .replace(/область/g, '')
      .replace(/облысы/g, '')
      .replace(/обл\./g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private isValidCoordinatePair(lng: number, lat: number) {
    return (
      Number.isFinite(lng) &&
      Number.isFinite(lat) &&
      lng >= -180 &&
      lng <= 180 &&
      lat >= -90 &&
      lat <= 90
    );
  }

  private parsePolygonGeometry(rawGeometry: unknown) {
    try {
      const geometry =
        typeof rawGeometry === 'string' ? JSON.parse(rawGeometry) : rawGeometry;

      if (!geometry || typeof geometry !== 'object') {
        return null;
      }

      const polygon = geometry as { type?: string; coordinates?: unknown };
      if (polygon.type !== 'Polygon' || !Array.isArray(polygon.coordinates)) {
        return null;
      }

      return polygon as {
        type: 'Polygon';
        coordinates: number[][][];
      };
    } catch {
      return null;
    }
  }

  private calculateAveragePoint(ring: number[][]) {
    const uniquePoints = ring.slice(0, Math.max(ring.length - 1, 1)).filter((point) => {
      return (
        Array.isArray(point) &&
        point.length >= 2 &&
        typeof point[0] === 'number' &&
        typeof point[1] === 'number'
      );
    });

    if (uniquePoints.length === 0) {
      return null;
    }

    const totals = uniquePoints.reduce(
      (sum, point) => ({
        lng: sum.lng + point[0],
        lat: sum.lat + point[1],
      }),
      { lng: 0, lat: 0 },
    );

    const center = {
      lng: totals.lng / uniquePoints.length,
      lat: totals.lat / uniquePoints.length,
    };

    return this.isValidCoordinatePair(center.lng, center.lat) ? center : null;
  }

  private calculatePolygonCentroid(ring: number[][]) {
    if (!Array.isArray(ring) || ring.length < 4) {
      return null;
    }

    const lastIndex = ring.length - 1;
    let twiceArea = 0;
    let centroidLng = 0;
    let centroidLat = 0;

    for (let index = 0; index < lastIndex; index += 1) {
      const current = ring[index];
      const next = ring[index + 1];

      if (
        !Array.isArray(current) ||
        !Array.isArray(next) ||
        current.length < 2 ||
        next.length < 2
      ) {
        return this.calculateAveragePoint(ring);
      }

      const currentLng = Number(current[0]);
      const currentLat = Number(current[1]);
      const nextLng = Number(next[0]);
      const nextLat = Number(next[1]);
      const cross = currentLng * nextLat - nextLng * currentLat;

      twiceArea += cross;
      centroidLng += (currentLng + nextLng) * cross;
      centroidLat += (currentLat + nextLat) * cross;
    }

    if (Math.abs(twiceArea) < 1e-9) {
      return this.calculateAveragePoint(ring);
    }

    const center = {
      lng: centroidLng / (3 * twiceArea),
      lat: centroidLat / (3 * twiceArea),
    };

    return this.isValidCoordinatePair(center.lng, center.lat)
      ? center
      : this.calculateAveragePoint(ring);
  }

  private normalizeCoordinate(value: number | undefined, field: 'lat' | 'lng') {
    if (value === undefined || value === null || Number.isNaN(Number(value))) {
      throw new BadRequestException(`${field} is required`);
    }

    return Number(value);
  }

  getRegionCoordinates(region?: string | null) {
    if (!region) {
      return null;
    }

    const normalizedRegion = this.normalizeRegionKey(region);

    for (const [name, coords] of Object.entries(this.regionCoordinates)) {
      if (this.normalizeRegionKey(name) === normalizedRegion) {
        return coords;
      }
    }

    return null;
  }

  getPlotCoordinates(rawGeometry: unknown) {
    const polygon = this.parsePolygonGeometry(rawGeometry);
    const outerRing = polygon?.coordinates?.[0];

    if (!outerRing) {
      return null;
    }

    return this.calculatePolygonCentroid(outerRing);
  }

  private getWeatherLabel(code?: number) {
    const weatherCode = Number(code ?? -1);

    if ([0].includes(weatherCode)) return 'Ясно';
    if ([1, 2, 3].includes(weatherCode)) return 'Переменная облачность';
    if ([45, 48].includes(weatherCode)) return 'Туман';
    if ([51, 53, 55, 56, 57].includes(weatherCode)) return 'Морось';
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) return 'Дождь';
    if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) return 'Снег';
    if ([95, 96, 99].includes(weatherCode)) return 'Гроза';
    return 'Без уточнения';
  }

  private async fetchOpenMeteo(lat: number, lng: number, days: number) {
    const url = new URL(this.providerBaseUrl);
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lng));
    url.searchParams.set('current', 'temperature_2m,wind_speed_10m,weather_code');
    url.searchParams.set(
      'daily',
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max',
    );
    url.searchParams.set('forecast_days', String(days));
    url.searchParams.set('timezone', 'auto');
    // Agricultural wind thresholds below are in metres per second.
    url.searchParams.set('wind_speed_unit', 'ms');

    const response = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      throw new Error(`Weather provider error: ${response.status}`);
    }

    return (await response.json()) as OpenMeteoResponse;
  }

  private buildAlertMessages(forecast: Array<{
    day: string;
    summary: string;
    tempMin: number | null;
    tempMax: number | null;
    precipitationProbability: number | null;
    precipitationMm: number | null;
    windSpeed: number | null;
  }>) {
    const alerts: Array<{
      type: string;
      severity: 'info' | 'warning' | 'critical';
      day: string;
      message: string;
    }> = [];

    for (const day of forecast) {
      if ((day.windSpeed ?? 0) >= 12) {
        alerts.push({
          type: 'wind',
          severity: 'warning',
          day: day.day,
          message: `Ожидается сильный ветер. Проверьте орошение и открытые конструкции.`,
        });
      }

      if ((day.tempMax ?? 0) >= 33) {
        alerts.push({
          type: 'heat',
          severity: 'warning',
          day: day.day,
          message: `Ожидается высокая жара. Есть риск пересыхания и потери качества.`,
        });
      }

      if ((day.tempMin ?? 100) <= 1) {
        alerts.push({
          type: 'frost',
          severity: 'critical',
          day: day.day,
          message: `Есть риск заморозков. Защитите чувствительные культуры.`,
        });
      }

      if ((day.precipitationProbability ?? 0) >= 60) {
        alerts.push({
          type: 'rain',
          severity: 'info',
          day: day.day,
          message: `Ожидаются осадки. Можно пересмотреть график полива.`,
        });
      }
    }

    return alerts;
  }

  async getCurrent(lat?: number, lng?: number) {
    const safeLat = this.normalizeCoordinate(lat, 'lat');
    const safeLng = this.normalizeCoordinate(lng, 'lng');
    const weather = await this.fetchOpenMeteo(safeLat, safeLng, 1);

    return {
      provider: 'open-meteo',
      location: {
        lat: safeLat,
        lng: safeLng,
      },
      current: {
        temperature: weather.current?.temperature_2m ?? null,
        windSpeed: weather.current?.wind_speed_10m ?? null,
        weatherCode: weather.current?.weather_code ?? null,
        summary: this.getWeatherLabel(weather.current?.weather_code),
      },
      status: {
        ready: true,
      },
    };
  }

  async getForecast(lat?: number, lng?: number, days = 7) {
    const safeLat = this.normalizeCoordinate(lat, 'lat');
    const safeLng = this.normalizeCoordinate(lng, 'lng');
    const normalizedDays = Math.min(Math.max(Number(days || 7), 1), 14);
    const weather = await this.fetchOpenMeteo(safeLat, safeLng, normalizedDays);

    const forecast = (weather.daily?.time ?? []).map((day, index) => ({
      day,
      summary: this.getWeatherLabel(weather.daily?.weather_code?.[index]),
      tempMin: weather.daily?.temperature_2m_min?.[index] ?? null,
      tempMax: weather.daily?.temperature_2m_max?.[index] ?? null,
      precipitationProbability:
        weather.daily?.precipitation_probability_max?.[index] ?? null,
      precipitationMm: weather.daily?.precipitation_sum?.[index] ?? null,
      windSpeed: weather.daily?.wind_speed_10m_max?.[index] ?? null,
    }));

    const alerts = this.buildAlertMessages(forecast);

    return {
      provider: 'open-meteo',
      location: {
        lat: safeLat,
        lng: safeLng,
      },
      forecastDays: normalizedDays,
      forecast,
      agriSignals: {
        frostRisk: alerts.some((item) => item.type === 'frost'),
        droughtRisk: forecast.some((item) => (item.tempMax ?? 0) >= 33),
        irrigationWindow: forecast.some(
          (item) => (item.precipitationProbability ?? 0) < 30,
        )
          ? 'next_3_days'
          : null,
        plantingWindow: forecast.some(
          (item) => (item.tempMin ?? 0) > 5 && (item.windSpeed ?? 0) < 10,
        )
          ? 'open'
          : 'caution',
      },
      alerts,
      status: {
        ready: true,
      },
    };
  }

  async getAlerts(region?: string, district?: string) {
    const coords = this.getRegionCoordinates(region ?? null);

    if (!coords) {
      return {
        provider: 'open-meteo',
        region: region ?? null,
        district: district ?? null,
        alerts: [],
        status: {
          ready: false,
          reason:
            'Для этого региона пока не настроены координаты. Добавьте региональные координаты или используйте координаты поля.',
        },
      };
    }

    const forecast = await this.getForecast(coords.lat, coords.lng, 7);

    return {
      provider: 'open-meteo',
      region: region ?? null,
      district: district ?? null,
      alerts: forecast.alerts,
      status: {
        ready: true,
      },
    };
  }
}
