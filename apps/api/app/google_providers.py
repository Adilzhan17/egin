"""Optional Google integrations. Secrets, cloud queries and access gates stay server-side.

Protocol tests are not evidence that a Cloud account has billing/access enabled.
See docs/GOOGLE_ACCESS.md for the verified upstream contracts and limitations.
"""
from __future__ import annotations

import asyncio
from collections import OrderedDict
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import time
from typing import Awaitable, Callable, Protocol
from zoneinfo import ZoneInfo

import httpx


class GoogleUnavailable(RuntimeError):
    """Safe public reason; never includes upstream bodies, keys or request headers."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class FieldSubsetProvider(Protocol):
    async def fetch(self, lat: float, lon: float, **kwargs) -> dict: ...


def enabled(name: str) -> bool:
    return os.getenv(name, '').lower() in {'1', 'true', 'yes'}


def _point(lat: float, lon: float):
    if not (math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError('Invalid WGS84 coordinates')


def _number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) else None


def _temperature(value):
    number = _number((value or {}).get('degrees'))
    if number is None:
        return None
    unit = value.get('unit')
    if unit == 'CELSIUS':
        return number
    if unit == 'FAHRENHEIT':
        return round((number - 32) * 5 / 9, 3)
    return None


def _speed(value):
    number = _number((value or {}).get('value'))
    factor = {'KILOMETERS_PER_HOUR': 1, 'METERS_PER_SECOND': 3.6, 'MILES_PER_HOUR': 1.609344}.get((value or {}).get('unit'))
    return round(number * factor, 3) if number is not None and factor is not None else None


def _rain(value):
    number = _number((value or {}).get('quantity'))
    factor = {'MILLIMETERS': 1, 'INCHES': 25.4}.get((value or {}).get('unit'))
    return round(number * factor, 3) if number is not None and factor is not None else None


# Display-only approximation: Google's categorical condition is NOT a WMO code.
_WMO = {
    'CLEAR': 0, 'MOSTLY_CLEAR': 1, 'PARTLY_CLOUDY': 2, 'MOSTLY_CLOUDY': 3, 'CLOUDY': 3,
    'FOG': 45, 'LIGHT_RAIN': 61, 'RAIN': 63, 'HEAVY_RAIN': 65,
    'LIGHT_RAIN_SHOWERS': 80, 'RAIN_SHOWERS': 81, 'HEAVY_RAIN_SHOWERS': 82,
    'SCATTERED_SHOWERS': 80, 'LIGHT_SNOW': 71, 'SNOW': 73, 'HEAVY_SNOW': 75,
    'SNOW_SHOWERS': 85, 'RAIN_AND_SNOW': 68, 'THUNDERSTORM': 95,
}


def _weather_row(row: dict, zone: str) -> dict:
    instant = row.get('currentTime') or row.get('interval', {}).get('startTime')
    local_time = datetime.fromisoformat(instant.replace('Z', '+00:00')).astimezone(ZoneInfo(zone)).isoformat() if instant else None
    condition = row.get('weatherCondition') or {}
    wind = row.get('wind') or {}
    return {
        'time': local_time,
        'temperature_2m': _temperature(row.get('temperature')),
        'apparent_temperature': _temperature(row.get('feelsLikeTemperature')),
        'relative_humidity_2m': _number(row.get('relativeHumidity')),
        'precipitation': _rain((row.get('precipitation') or {}).get('qpf')),
        'precipitation_probability': _number((row.get('precipitation') or {}).get('probability', {}).get('percent')),
        'wind_speed_10m': _speed(wind.get('speed')),
        'wind_direction_10m': _number(wind.get('direction', {}).get('degrees')),
        'is_day': int(row['isDaytime']) if isinstance(row.get('isDaytime'), bool) else None,
        'weather_code': _WMO.get(condition.get('type')),
        'condition_type': condition.get('type'),
        'condition_text': (condition.get('description') or {}).get('text'),
    }


def normalize_google_weather(current: dict, hourly: dict, daily: dict, lat: float, lon: float) -> dict:
    zone = (current.get('timeZone') or hourly.get('timeZone') or daily.get('timeZone') or {}).get('id')
    if not zone or not current.get('currentTime') or _temperature(current.get('temperature')) is None:
        raise GoogleUnavailable('invalid_response', 'Google Weather вернул неполные текущие условия.')
    current_row = _weather_row(current, zone)
    hours = [_weather_row(row, zone) for row in hourly.get('forecastHours', [])]
    days = []
    for row in daily.get('forecastDays', []):
        date = row.get('displayDate', {})
        date_text = f"{int(date['year']):04d}-{int(date['month']):02d}-{int(date['day']):02d}"
        parts = [row.get('daytimeForecast') or {}, row.get('nighttimeForecast') or {}]
        rainfall = [_rain(p.get('precipitation', {}).get('qpf')) for p in parts]
        wind = [_speed(p.get('wind', {}).get('speed')) for p in parts]
        probability = [_number(p.get('precipitation', {}).get('probability', {}).get('percent')) for p in parts]
        days.append({
            'date': date_text,
            'temperature_2m_max': _temperature(row.get('maxTemperature')),
            'temperature_2m_min': _temperature(row.get('minTemperature')),
            'precipitation_sum': sum(rainfall) if all(v is not None for v in rainfall) else None,
            'precipitation_probability_max': max((v for v in probability if v is not None), default=None),
            'wind_speed_10m_max': max((v for v in wind if v is not None), default=None),
            'weather_code': _WMO.get(parts[0].get('weatherCondition', {}).get('type')),
            'sunrise': row.get('sunEvents', {}).get('sunriseTime'),
            'sunset': row.get('sunEvents', {}).get('sunsetTime'),
            'et0_fao_evapotranspiration': None,
        })
    stamp = datetime.now(timezone.utc)
    return {
        'source': 'Google Maps Weather API',
        'source_url': 'https://developers.google.com/maps/documentation/weather',
        'attribution': 'Google Maps', 'license': 'Google Maps Platform Terms',
        'current': current_row, 'days': days,
        'hourly': {key: [row.get(key) for row in hours] for key in ['time', 'temperature_2m', 'relative_humidity_2m', 'precipitation', 'precipitation_probability', 'wind_speed_10m']},
        'timezone': zone, 'utc_offset_seconds': int(datetime.fromisoformat(current_row['time']).utcoffset().total_seconds()),
        'requested_coordinates': {'lat': lat, 'lon': lon}, 'coordinates': {'lat': lat, 'lon': lon},
        'current_units': {'temperature_2m': '°C', 'apparent_temperature': '°C', 'relative_humidity_2m': '%', 'precipitation': 'mm', 'wind_speed_10m': 'km/h'},
        'units': {'temperature_2m_max': '°C', 'temperature_2m_min': '°C', 'precipitation_sum': 'mm', 'wind_speed_10m_max': 'km/h'},
        'normalization_notes': {'weather_code': 'Display approximation of Google condition; not an upstream WMO code.', 'wind_speed_10m_max': 'Maximum of daytime/nighttime forecast wind values, not an observed gust maximum.', 'coordinates': 'Requested point; provider grid center is not supplied.'},
        'fetched_at': stamp.isoformat(), 'status': 'fresh',
        # Do not persist in bootstrap IndexedDB, ML runs, assistant traces or weather_cache.
        'cache_policy': {'persist': False, 'max_age_seconds': 900, 'expires_at': (stamp + timedelta(minutes=15)).isoformat()},
    }


async def _json(client: httpx.AsyncClient, method: str, url: str, **kwargs) -> dict:
    try:
        response = await client.request(method, url, **kwargs)
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError('object expected')
        return payload
    except httpx.HTTPStatusError as exc:
        code = 'access_denied' if exc.response.status_code in {401, 403} else 'quota' if exc.response.status_code == 429 else 'upstream_error'
        raise GoogleUnavailable(code, 'Google API временно недоступен; проверьте доступ и квоту.') from None
    except (httpx.HTTPError, ValueError):
        raise GoogleUnavailable('upstream_error', 'Google API временно недоступен.') from None


class GoogleWeatherProvider:
    """Documented four Maps Weather endpoints; at most 24 hourly + 7 daily rows."""

    def __init__(self, api_key: str | None = None, transport=None):
        self.api_key = api_key if api_key is not None else os.getenv('GOOGLE_WEATHER_API_KEY', '')
        self.transport = transport

    async def _lookup(self, client, path, lat, lon, **params):
        return await _json(client, 'GET', 'https://weather.googleapis.com/v1/' + path + ':lookup',
                           headers={'X-Goog-Api-Key': self.api_key},
                           params={'location.latitude': lat, 'location.longitude': lon, 'unitsSystem': 'METRIC', 'languageCode': 'ru', **params})

    async def fetch(self, lat: float, lon: float) -> dict:
        _point(lat, lon)
        if not self.api_key:
            raise GoogleUnavailable('missing_key', 'Google Weather API key не настроен.')
        async with httpx.AsyncClient(timeout=httpx.Timeout(7, connect=3), transport=self.transport) as client:
            results = await asyncio.gather(
                self._lookup(client, 'currentConditions', lat, lon),
                self._lookup(client, 'forecast/hours', lat, lon, hours=24, pageSize=24),
                self._lookup(client, 'forecast/days', lat, lon, days=7, pageSize=10),
                return_exceptions=True,
            )
        for result in results:
            if isinstance(result, BaseException):
                raise result
        return normalize_google_weather(*results, lat, lon)

    async def history(self, lat: float, lon: float, hours: int = 24) -> dict:
        _point(lat, lon)
        if not 1 <= hours <= 24:
            raise ValueError('Google history supports only the preceding 1–24 hours')
        if not self.api_key:
            raise GoogleUnavailable('missing_key', 'Google Weather API key не настроен.')
        async with httpx.AsyncClient(timeout=7, transport=self.transport) as client:
            raw = await self._lookup(client, 'history/hours', lat, lon, hours=hours, pageSize=24)
        zone = raw.get('timeZone', {}).get('id', 'UTC')
        return {'source': 'Google Maps Weather API', 'attribution': 'Google Maps', 'timezone': zone,
                'hours': [_weather_row(row, zone) for row in raw.get('historyHours', [])],
                'requested_coordinates': {'lat': lat, 'lon': lon}, 'cache_policy': {'persist': False}}


_weather_cache: OrderedDict[tuple, tuple[float, dict]] = OrderedDict()
_weather_locks: dict[tuple, tuple[asyncio.Lock, int]] = {}
_google_retry_after = 0.0


def _evict_weather(key, expiry):
    if key in _weather_cache and _weather_cache[key][0] == expiry:
        del _weather_cache[key]


async def weather_with_fallback(lat: float, lon: float, fallback: Callable[[], Awaitable[dict]]) -> dict:
    """Presentation only. Persistent ML/assistant contexts must use the fallback source."""
    global _google_retry_after
    if not enabled('FEATURE_GOOGLE_WEATHER') or not os.getenv('GOOGLE_WEATHER_API_KEY'):
        return await fallback()
    key = (round(lat, 5), round(lon, 5))
    lock, users = _weather_locks.get(key, (asyncio.Lock(), 0))
    _weather_locks[key] = (lock, users + 1)
    try:
        async with lock:
            now = time.monotonic()
            for old_key, (expiry, _) in list(_weather_cache.items()):
                if expiry <= now:
                    del _weather_cache[old_key]
            if key in _weather_cache:
                return {**deepcopy(_weather_cache[key][1]), 'status': 'cached'}
            if now >= _google_retry_after:
                try:
                    value = await asyncio.wait_for(GoogleWeatherProvider().fetch(lat, lon), 8)
                    expiry = time.monotonic() + 900
                    _weather_cache[key] = (expiry, deepcopy(value))
                    asyncio.get_running_loop().call_later(900, _evict_weather, key, expiry)
                    while len(_weather_cache) > 256:
                        _weather_cache.popitem(last=False)
                    return value
                except (GoogleUnavailable, TimeoutError, KeyError, ValueError):
                    _google_retry_after = time.monotonic() + 60
    finally:
        _, users = _weather_locks[key]
        if users == 1:
            _weather_locks.pop(key, None)
        else:
            _weather_locks[key] = (lock, users - 1)
    return {**await fallback(), 'fallback_from': 'Google Maps Weather API'}


def _cloud_config():
    project = os.getenv('GOOGLE_CLOUD_PROJECT', '')
    if not re.fullmatch(r'[a-z][a-z0-9-]{4,61}[a-z0-9]', project):
        raise GoogleUnavailable('missing_project', 'Google Cloud project не настроен.')
    token = os.getenv('GOOGLE_CLOUD_ACCESS_TOKEN', '')
    token_file = os.getenv('GOOGLE_CLOUD_ACCESS_TOKEN_FILE', '')
    if token_file:
        try:
            with Path(token_file).open() as stream:
                token = stream.read(8193).strip()
        except OSError:
            raise GoogleUnavailable('missing_credentials', 'Google Cloud credential file недоступен.') from None
    if not token or len(token) > 8192 or any(c.isspace() for c in token):
        raise GoogleUnavailable('missing_credentials', 'Google Cloud access token не настроен.')
    return project, token


class GoogleWeatherNextProvider:
    """WeatherNext 3 BigQuery centroid subset; fixed schema, partition, 168-hour cap.

    It queries an ALREADY subscribed Analytics Hub dataset. It creates no resources.
    Only operators enable this optional billable path after approving its access.
    """

    def __init__(self, transport=None):
        self.transport = transport

    @staticmethod
    def query_body(lat: float, lon: float, init_time: datetime, hours: int = 72) -> dict:
        _point(lat, lon)
        if not 1 <= hours <= 168 or init_time.tzinfo is None:
            raise ValueError('A timezone-aware initialization and 1–168 hours are required')
        table = os.getenv('GOOGLE_WEATHERNEXT_BQ_TABLE', '')
        if not re.fullmatch(r'[a-z][a-z0-9-]{4,61}[a-z0-9]\.[A-Za-z_][A-Za-z0-9_]*\.weathernext_3_0_0_0p1deg', table):
            raise GoogleUnavailable('missing_dataset', 'Подписка BigQuery WeatherNext 3 не настроена.')
        try:
            budget = int(os.getenv('GOOGLE_WEATHERNEXT_MAX_BYTES_BILLED', '100000000'))
        except ValueError:
            raise GoogleUnavailable('invalid_budget', 'Некорректный лимит BigQuery.') from None
        if not 1_000_000 <= budget <= 1_000_000_000:
            raise GoogleUnavailable('invalid_budget', 'Лимит BigQuery должен быть от 1 MB до 1 GB.')
        # Partition equality is intentional; no unbounded MAX(init_time) scan.
        query = f'''WITH cell AS (
          SELECT init_time, forecast FROM `{table}`
          WHERE init_time = @init_time
            AND ST_INTERSECTS(geography_polygon, ST_GEOGPOINT(@lon, @lat))
          ORDER BY ST_DISTANCE(geography, ST_GEOGPOINT(@lon, @lat)) LIMIT 1
        )
        SELECT CAST(f.time AS STRING) AS time, f.hours AS lead_hours,
          f.temperature_2m_mean - 273.15 AS temperature_c,
          f.temperature_2m_p10 - 273.15 AS temperature_p10_c,
          f.temperature_2m_p90 - 273.15 AS temperature_p90_c,
          f.wind_speed_10m_mean * 3.6 AS wind_kmh,
          f.total_precipitation_1hr_mean * 1000 AS precipitation_mm,
          f.total_precipitation_1hr_p10 * 1000 AS precipitation_p10_mm,
          f.total_precipitation_1hr_p90 * 1000 AS precipitation_p90_mm
        FROM cell, UNNEST(cell.forecast) AS f
        WHERE f.hours BETWEEN 1 AND @hours ORDER BY f.time LIMIT 168'''
        values = [('lat', 'FLOAT64', lat), ('lon', 'FLOAT64', lon), ('init_time', 'TIMESTAMP', init_time.isoformat()), ('hours', 'INT64', hours)]
        return {'query': query, 'useLegacySql': False, 'parameterMode': 'NAMED',
                'queryParameters': [{'name': name, 'parameterType': {'type': kind}, 'parameterValue': {'value': str(value)}} for name, kind, value in values],
                'maximumBytesBilled': str(budget), 'timeoutMs': 10000, 'jobTimeoutMs': '15000', 'maxResults': 168,
                'location': os.getenv('GOOGLE_WEATHERNEXT_BQ_LOCATION', 'US')}

    async def fetch(self, lat: float, lon: float, *, init_time: datetime, hours: int = 72) -> dict:
        if not enabled('FEATURE_GOOGLE_WEATHERNEXT'):
            raise GoogleUnavailable('disabled', 'WeatherNext 3 не включён; используется обычный прогноз.')
        project, token = _cloud_config()
        body = self.query_body(lat, lon, init_time, hours)
        async with httpx.AsyncClient(timeout=17, transport=self.transport) as client:
            raw = await _json(client, 'POST', f'https://bigquery.googleapis.com/bigquery/v2/projects/{project}/queries',
                              headers={'Authorization': 'Bearer ' + token}, json=body)
        if not raw.get('jobComplete'):
            raise GoogleUnavailable('query_timeout', 'WeatherNext subset не рассчитан в допустимое время.')
        if raw.get('errors'):
            raise GoogleUnavailable('query_failed', 'WeatherNext subset недоступен.')
        columns = [field['name'] for field in raw.get('schema', {}).get('fields', [])]
        points = []
        for row in raw.get('rows', [])[:168]:
            point = {}
            for name, cell in zip(columns, row['f']):
                value = cell.get('v')
                point[name] = value if name == 'time' or value is None else float(value)
            points.append(point)
        if not points:
            raise GoogleUnavailable('no_data', 'Для выбранного цикла WeatherNext данных пока нет.')
        return {'source': 'Google WeatherNext 3 / BigQuery', 'status': 'fresh', 'init_time': init_time.isoformat(),
                'resolution_degrees': 0.1, 'sampling': 'Grid cell containing field centroid, not parcel observations',
                'ensemble_members': 64, 'points': points, 'requested_coordinates': {'lat': lat, 'lon': lon},
                'units': {'temperature': '°C', 'wind': 'km/h', 'precipitation': 'mm/hour'},
                'source_url': 'https://developers.google.com/weathernext/guides/bigquery'}


class GoogleAgricultureProvider:
    """Real ALU/AMED contract, explicitly unavailable for Kazakhstan."""

    def __init__(self, transport=None):
        self.transport = transport

    async def fetch(self, lat: float, lon: float, *, country: str = 'KZ', monitoring: bool = False) -> dict:
        _point(lat, lon)
        if country.upper() != 'IN':
            raise GoogleUnavailable('unsupported_region', 'ALU/AMED: официально подтверждено покрытие Индии; Казахстан не поддерживается.')
        if not enabled('FEATURE_GOOGLE_AGRICULTURE'):
            raise GoogleUnavailable('disabled', 'Google Agriculture не включён.')
        key = os.getenv('GOOGLE_AGRICULTURE_API_KEY', '')
        if not key:
            raise GoogleUnavailable('missing_key', 'Google Agriculture API key не настроен.')
        method = 'monitorLandscape' if monitoring else 'lookupLandscape'
        async with httpx.AsyncClient(timeout=10, transport=self.transport) as client:
            raw = await _json(client, 'POST', 'https://agriculturalunderstanding.googleapis.com/v1:' + method,
                              headers={'X-Goog-Api-Key': key}, json={'locationSpecifier': {'coordinates': {'latitude': lat, 'longitude': lon}}})
        result = raw.get('monitoredLandscape' if monitoring else 'landscape', {})
        try:
            geometry = json.loads(result['geojson'])
            if geometry.get('type') != 'FeatureCollection':
                raise ValueError()
        except (KeyError, TypeError, ValueError):
            raise GoogleUnavailable('invalid_response', 'Google Agriculture вернул некорректный GeoJSON.') from None
        return {'source': 'Google AMED' if monitoring else 'Google ALU', 'status': 'fresh', 'data_version': result.get('dataVersion'), 'geojson': geometry}


class GoogleEarthEngineProvider:
    """Bounded Sentinel-2 parcel time series; optional official SDK, server-only.

    No raster downloads. Uses existing field geometry and cloud-masked reflectance.
    Missing SDK/access is an explicit blocker, never synthetic vegetation values.
    """

    async def fetch(self, geometry: dict, *, start: datetime, end: datetime) -> dict:
        if not enabled('FEATURE_GOOGLE_EARTH_ENGINE'):
            raise GoogleUnavailable('disabled', 'Спутниковые индексы Earth Engine не включены.')
        if not 0 < (end - start).total_seconds() <= 31 * 86400:
            raise ValueError('Satellite subset is limited to 31 days')
        if geometry.get('type') not in {'Polygon', 'MultiPolygon'} or len(json.dumps(geometry)) > 100000:
            raise ValueError('Bounded field polygon required')
        if importlib.util.find_spec('ee') is None:
            raise GoogleUnavailable('missing_sdk', 'Для Earth Engine требуется официальный Python SDK earthengine-api.')
        project = os.getenv('GOOGLE_CLOUD_PROJECT', '')
        if not project or not os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
            raise GoogleUnavailable('missing_credentials', 'Earth Engine project и server credentials не настроены.')
        try:
            return await asyncio.to_thread(self._compute, geometry, start, end, project)
        except GoogleUnavailable:
            raise
        except Exception:
            raise GoogleUnavailable('upstream_error', 'Earth Engine не вернул спутниковые наблюдения; проверьте регистрацию и доступ.') from None

    @staticmethod
    def _compute(geometry, start, end, project):
        import ee
        import google.auth
        credentials, _ = google.auth.default(scopes=['https://www.googleapis.com/auth/earthengine'])
        ee.Initialize(credentials=credentials, project=project)
        ee.data.setDeadline(20000)
        polygon = ee.Geometry(geometry)
        scenes = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(polygon)
                  .filterDate(start.isoformat(), end.isoformat()).filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 70))
                  .sort('system:time_start', False).limit(12))

        def sample(value):
            image = ee.Image(value)
            scl = image.select('SCL')
            mask = scl.eq(4).Or(scl.eq(5)).Or(scl.eq(6))
            sr = image.updateMask(mask).select(['B2', 'B4', 'B8', 'B11']).multiply(0.0001)
            ndvi = sr.normalizedDifference(['B8', 'B4']).rename('ndvi')
            ndmi = sr.normalizedDifference(['B8', 'B11']).rename('ndmi')
            evi = sr.expression('2.5 * (nir - red) / (nir + 6 * red - 7.5 * blue + 1)',
                                {'nir': sr.select('B8'), 'red': sr.select('B4'), 'blue': sr.select('B2')}).rename('evi')
            summary = ndvi.addBands(ndmi).addBands(evi).reduceRegion(
                reducer=ee.Reducer.mean(), geometry=polygon, scale=20, maxPixels=1_000_000, bestEffort=False)
            return ee.Feature(None, summary).set('observed_at', image.date().format('YYYY-MM-dd')).set('scene_id', image.id())

        result = ee.FeatureCollection(scenes.toList(12).map(sample)).getInfo()
        points = [feature['properties'] for feature in result.get('features', [])]
        return {'source': 'Copernicus Sentinel-2 / Google Earth Engine', 'status': 'fresh' if points else 'no_data',
                'resolution_m': 20, 'points': sorted(points, key=lambda p: p['observed_at']),
                'period': {'start': start.isoformat(), 'end': end.isoformat()},
                'quality': 'SCL classes 4/5/6 only; missing/cloud-covered observations remain absent.',
                'source_url': 'https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED'}


def google_status() -> dict:
    """Configuration evidence only; neither validates keys nor initiates billable calls."""
    weather_on = enabled('FEATURE_GOOGLE_WEATHER')
    weather_key = bool(os.getenv('GOOGLE_WEATHER_API_KEY'))
    cloud_token = bool(os.getenv('GOOGLE_CLOUD_ACCESS_TOKEN') or os.getenv('GOOGLE_CLOUD_ACCESS_TOKEN_FILE'))
    project = bool(os.getenv('GOOGLE_CLOUD_PROJECT'))
    return {
        'checked_documentation_at': '2026-10-04', 'live_access_verified': False,
        'weather': {'enabled': weather_on, 'configured': weather_on and weather_key,
                    'status': 'configured_unverified' if weather_on and weather_key else 'blocked_missing_key' if weather_on else 'disabled',
                    'fallback': 'Open-Meteo', 'requires': ['Weather API enabled', 'restricted server API key', 'production billing'],
                    'source_url': 'https://developers.google.com/maps/documentation/weather/get-api-key'},
        'weathernext': {'enabled': enabled('FEATURE_GOOGLE_WEATHERNEXT'),
                        'configured': enabled('FEATURE_GOOGLE_WEATHERNEXT') and project and cloud_token and bool(os.getenv('GOOGLE_WEATHERNEXT_BQ_TABLE')),
                        'live_access_verified': False, 'model': 'WeatherNext 3', 'requires': ['allowlist', 'Analytics Hub linked dataset', 'server OAuth credentials', 'query budget'],
                        'source_url': 'https://developers.google.com/weathernext/guides/access-forecast'},
        'agriculture': {'enabled': False, 'requested': enabled('FEATURE_GOOGLE_AGRICULTURE'), 'configured': False,
                        'status': 'unsupported_region', 'country': 'KZ', 'confirmed_countries': ['IN'],
                        'fallback': 'Existing field polygons; Sentinel-2 through separately configured Earth Engine',
                        'requires': ['India coverage', 'Workspace customer ID allowlist', 'Cloud project', 'billing', 'API key'],
                        'source_url': 'https://agri.withgoogle.com/faq/'},
        'earth_engine': {'enabled': enabled('FEATURE_GOOGLE_EARTH_ENGINE'),
                         'configured': enabled('FEATURE_GOOGLE_EARTH_ENGINE') and project and bool(os.getenv('GOOGLE_APPLICATION_CREDENTIALS')) and importlib.util.find_spec('ee') is not None,
                         'requires': ['registered Cloud project', 'Earth Engine API enabled', 'server service-account credentials', 'earthengine-api SDK'],
                         'source_url': 'https://developers.google.com/earth-engine/guides/access'},
    }
