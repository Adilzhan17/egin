import {
  BadRequestException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

type Place = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  zoom: number;
};
type ProviderPlace = {
  place_id?: number;
  display_name?: string;
  lat?: string;
  lon?: string;
  place_rank?: number;
};

@Injectable()
export class PlaceSearchService {
  private nextRequestAt = 0;
  private readonly cache = new Map<
    string,
    { expires: number; places: Place[] }
  >();

  async search(query: string, language: string) {
    if (
      typeof query !== 'string' ||
      query.trim().length < 3 ||
      query.length > 200
    ) {
      throw new BadRequestException('Enter 3–200 characters');
    }
    const q = query.trim().replace(/\s+/g, ' ');
    const lang = language === 'kk' ? 'kk,ru' : 'ru';
    const key = `${lang}:${q.toLowerCase()}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.places;
    // App-wide upstream limit for the single backend instance, not just per user.
    if (Date.now() < this.nextRequestAt)
      throw new HttpException('Please retry in a moment', 429);
    this.nextRequestAt = Date.now() + 1100;
    const url = new URL(
      process.env.GEOCODING_SEARCH_URL ||
        'https://nominatim.openstreetmap.org/search',
    );
    url.search = new URLSearchParams({
      q,
      format: 'jsonv2',
      countrycodes: 'kz',
      limit: '5',
      'accept-language': lang,
    }).toString();
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Egin-KZ/1.0 (https://egin.perricheno.com)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('Geocoding provider unavailable');
      const raw = (await response.json()) as ProviderPlace[];
      if (!Array.isArray(raw)) throw new Error('Invalid geocoding response');
      const places = raw.flatMap((item): Place[] => {
        const lat = Number(item.lat),
          lng = Number(item.lon);
        if (
          !item.display_name ||
          !item.lat ||
          !item.lon ||
          !Number.isFinite(lat) ||
          !Number.isFinite(lng) ||
          Math.abs(lat) > 90 ||
          Math.abs(lng) > 180
        )
          return [];
        return [
          {
            id: String(item.place_id),
            label: item.display_name,
            lat,
            lng,
            zoom:
              (item.place_rank ?? 0) >= 26
                ? 17
                : (item.place_rank ?? 0) >= 16
                  ? 13
                  : 10,
          },
        ];
      });
      if (this.cache.size >= 500) this.cache.delete([...this.cache.keys()][0]);
      this.cache.set(key, { places, expires: Date.now() + 86400000 });
      return places;
    } catch {
      throw new ServiceUnavailableException(
        'Address search is temporarily unavailable',
      );
    }
  }
}
