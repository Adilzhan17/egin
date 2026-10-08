"""Protocol/normalization mocks only: these do NOT verify live Google account access."""
import asyncio
from datetime import datetime, timezone
import json

import httpx
import pytest

from app import google_providers as google


def fixture_conditions():
    return {
        'currentTime': '2026-10-03T20:00:00Z', 'timeZone': {'id': 'Asia/Almaty'}, 'isDaytime': False,
        'temperature': {'degrees': 50, 'unit': 'FAHRENHEIT'},
        'feelsLikeTemperature': {'degrees': 8, 'unit': 'CELSIUS'},
        'relativeHumidity': 80, 'weatherCondition': {'type': 'RAIN', 'description': {'text': 'Дождь'}},
        'wind': {'speed': {'value': 5, 'unit': 'METERS_PER_SECOND'}, 'direction': {'degrees': 240}},
        'precipitation': {'qpf': {'quantity': 0.1, 'unit': 'INCHES'}, 'probability': {'percent': 70}},
    }


def test_google_weather_documented_protocol_and_unit_normalization():
    seen = []

    def handler(request):
        seen.append(request)
        assert request.headers['X-Goog-Api-Key'] == 'mock-secret'
        assert 'mock-secret' not in str(request.url)
        assert request.url.params['location.latitude'] == '52.4'
        assert request.url.params['location.longitude'] == '69.4'
        assert request.url.params['unitsSystem'] == 'METRIC'
        if request.url.path.endswith('currentConditions:lookup'):
            return httpx.Response(200, json=fixture_conditions())
        if request.url.path.endswith('forecast/hours:lookup'):
            assert request.url.params['hours'] == '24'
            return httpx.Response(200, json={'forecastHours': [{**fixture_conditions(), 'interval': {'startTime': '2026-10-03T21:00:00Z'}}]})
        assert request.url.path.endswith('forecast/days:lookup')
        assert request.url.params['days'] == '7'
        return httpx.Response(200, json={'forecastDays': [{
            'displayDate': {'year': 2026, 'month': 10, 'day': 4},
            'maxTemperature': {'degrees': 17, 'unit': 'CELSIUS'}, 'minTemperature': {'degrees': 5, 'unit': 'CELSIUS'},
            'daytimeForecast': fixture_conditions(), 'nighttimeForecast': fixture_conditions(),
        }]})

    result = asyncio.run(google.GoogleWeatherProvider('mock-secret', httpx.MockTransport(handler)).fetch(52.4, 69.4))
    assert len(seen) == 3
    assert result['current']['temperature_2m'] == 10
    assert result['current']['wind_speed_10m'] == 18
    assert result['current']['precipitation'] == 2.54
    assert result['current']['time'] == '2026-10-04T01:00:00+05:00'
    assert result['days'][0]['precipitation_sum'] == 5.08
    assert result['cache_policy']['persist'] is False
    assert result['cache_policy']['max_age_seconds'] < 3600
    assert result['attribution'] == 'Google Maps'
    assert 'mock-secret' not in json.dumps(result)


def test_missing_weather_measurements_remain_missing():
    day = {'displayDate': {'year': 2026, 'month': 10, 'day': 4}, 'daytimeForecast': fixture_conditions()}
    result = google.normalize_google_weather(fixture_conditions(), {}, {'forecastDays': [day]}, 52, 69)
    assert result['days'][0]['precipitation_sum'] is None
    assert result['days'][0]['temperature_2m_max'] is None
    assert result['days'][0]['et0_fao_evapotranspiration'] is None
    assert result['hourly']['time'] == []


def test_google_weather_history_is_actual_documented_endpoint():
    def handler(request):
        assert request.url.path == '/v1/history/hours:lookup'
        assert request.url.params['hours'] == '6'
        return httpx.Response(200, json={'historyHours': [fixture_conditions()], 'timeZone': {'id': 'Asia/Almaty'}})

    provider = google.GoogleWeatherProvider('mock', httpx.MockTransport(handler))
    result = asyncio.run(provider.history(52, 69, 6))
    assert result['hours'][0]['precipitation'] == 2.54
    with pytest.raises(ValueError):
        asyncio.run(provider.history(52, 69, 25))


def test_upstream_errors_do_not_expose_key_or_response_body():
    def handler(request):
        return httpx.Response(403, json={'error': {'message': 'private-project-secret'}})

    with pytest.raises(google.GoogleUnavailable) as info:
        asyncio.run(google.GoogleWeatherProvider('mock-secret', httpx.MockTransport(handler)).fetch(52, 69))
    assert info.value.code == 'access_denied'
    assert 'secret' not in str(info.value)


def test_disabled_google_and_missing_key_never_call_google(monkeypatch):
    monkeypatch.delenv('FEATURE_GOOGLE_WEATHER', raising=False)
    monkeypatch.delenv('GOOGLE_WEATHER_API_KEY', raising=False)

    async def fallback():
        return {'source': 'test-open-meteo'}

    async def forbidden(*args):
        pytest.fail('disabled Google must not make network requests')

    monkeypatch.setattr(google.GoogleWeatherProvider, 'fetch', forbidden)
    assert asyncio.run(google.weather_with_fallback(52, 69, fallback))['source'] == 'test-open-meteo'
    monkeypatch.setenv('FEATURE_GOOGLE_WEATHER', 'true')
    assert asyncio.run(google.weather_with_fallback(52, 69, fallback))['source'] == 'test-open-meteo'


def test_google_quota_falls_back_and_cooldown_avoids_repeated_billing(monkeypatch):
    monkeypatch.setenv('FEATURE_GOOGLE_WEATHER', 'true')
    monkeypatch.setenv('GOOGLE_WEATHER_API_KEY', 'mock')
    monkeypatch.setattr(google, '_google_retry_after', 0)
    google._weather_cache.clear()
    calls = []

    async def fail(*args):
        calls.append(1)
        raise google.GoogleUnavailable('quota', 'Google quota')

    async def fallback():
        return {'source': 'Open-Meteo', 'status': 'cached'}

    monkeypatch.setattr(google.GoogleWeatherProvider, 'fetch', fail)
    assert asyncio.run(google.weather_with_fallback(52, 69, fallback))['source'] == 'Open-Meteo'
    assert asyncio.run(google.weather_with_fallback(53, 70, fallback))['fallback_from'] == 'Google Maps Weather API'
    assert len(calls) == 1


def test_concurrent_google_requests_share_memory_cache(monkeypatch):
    monkeypatch.setenv('FEATURE_GOOGLE_WEATHER', 'true')
    monkeypatch.setenv('GOOGLE_WEATHER_API_KEY', 'mock')
    monkeypatch.setattr(google, '_google_retry_after', 0)
    google._weather_cache.clear()
    calls = []

    async def fetch(*args):
        calls.append(1)
        await asyncio.sleep(0.01)
        return {'source': 'Google Maps Weather API', 'current': {'temperature_2m': 10}}

    async def fallback():
        pytest.fail('successful Google should not call fallback')

    async def run():
        return await asyncio.gather(*(google.weather_with_fallback(52, 69, fallback) for _ in range(5)))

    monkeypatch.setattr(google.GoogleWeatherProvider, 'fetch', fetch)
    results = asyncio.run(run())
    assert len(calls) == 1
    results[0]['current']['temperature_2m'] = 99
    assert results[1]['current']['temperature_2m'] == 10
    assert not google._weather_locks
    google._weather_cache.clear()


def test_weather_next_queries_one_partition_and_centroid_with_cost_limit(monkeypatch):
    monkeypatch.setenv('GOOGLE_WEATHERNEXT_BQ_TABLE', 'sample-project.weather.weathernext_3_0_0_0p1deg')
    body = google.GoogleWeatherNextProvider.query_body(52.4, 69.4, datetime(2026, 10, 4, tzinfo=timezone.utc), 72)
    assert 'init_time = @init_time' in body['query']
    assert 'ST_GEOGPOINT(@lon, @lat)' in body['query']
    assert 'LIMIT 168' in body['query']
    assert '* 1000 AS precipitation_mm' in body['query']
    assert body['maximumBytesBilled'] == '100000000'
    assert body['useLegacySql'] is False
    values = {p['name']: p['parameterValue']['value'] for p in body['queryParameters']}
    assert values['lat'] == '52.4' and values['lon'] == '69.4'
    with pytest.raises(ValueError):
        google.GoogleWeatherNextProvider.query_body(52, 69, datetime.now(timezone.utc), 361)
    monkeypatch.setenv('GOOGLE_WEATHERNEXT_BQ_TABLE', 'anything`; DROP TABLE users; --')
    with pytest.raises(google.GoogleUnavailable):
        google.GoogleWeatherNextProvider.query_body(52, 69, datetime.now(timezone.utc))


def test_weather_next_real_rest_shape_with_mock_transport(monkeypatch):
    monkeypatch.setenv('FEATURE_GOOGLE_WEATHERNEXT', 'true')
    monkeypatch.setenv('GOOGLE_CLOUD_PROJECT', 'sample-project')
    monkeypatch.setenv('GOOGLE_CLOUD_ACCESS_TOKEN', 'mock-bearer')
    monkeypatch.delenv('GOOGLE_CLOUD_ACCESS_TOKEN_FILE', raising=False)
    monkeypatch.setenv('GOOGLE_WEATHERNEXT_BQ_TABLE', 'sample-project.weather.weathernext_3_0_0_0p1deg')

    def handler(request):
        assert request.method == 'POST'
        assert request.url.path == '/bigquery/v2/projects/sample-project/queries'
        assert request.headers['Authorization'] == 'Bearer mock-bearer'
        assert 'mock-bearer' not in request.content.decode()
        return httpx.Response(200, json={'jobComplete': True, 'schema': {'fields': [{'name': 'time'}, {'name': 'temperature_c'}, {'name': 'precipitation_mm'}]},
                                        'rows': [{'f': [{'v': '2026-10-04 01:00:00+00'}, {'v': '12.5'}, {'v': '0.3'}]}]})

    result = asyncio.run(google.GoogleWeatherNextProvider(httpx.MockTransport(handler)).fetch(52, 69, init_time=datetime.now(timezone.utc)))
    assert result['points'][0]['temperature_c'] == 12.5
    assert result['points'][0]['precipitation_mm'] == 0.3
    assert result['resolution_degrees'] == 0.1


def test_kazakhstan_agriculture_is_blocked_even_if_flag_and_key_exist(monkeypatch):
    monkeypatch.setenv('FEATURE_GOOGLE_AGRICULTURE', 'true')
    monkeypatch.setenv('GOOGLE_AGRICULTURE_API_KEY', 'mock')

    def forbidden(request):
        pytest.fail('Kazakhstan has no confirmed Google ALU coverage; no request allowed')

    with pytest.raises(google.GoogleUnavailable) as info:
        asyncio.run(google.GoogleAgricultureProvider(httpx.MockTransport(forbidden)).fetch(52, 69, country='KZ'))
    assert info.value.code == 'unsupported_region'
    assert google.google_status()['agriculture']['enabled'] is False


@pytest.mark.parametrize('monitoring,method,key', [(False, 'lookupLandscape', 'landscape'), (True, 'monitorLandscape', 'monitoredLandscape')])
def test_agriculture_documented_india_protocol_only_mocked(monkeypatch, monitoring, method, key):
    monkeypatch.setenv('FEATURE_GOOGLE_AGRICULTURE', 'true')
    monkeypatch.setenv('GOOGLE_AGRICULTURE_API_KEY', 'mock')

    def handler(request):
        assert request.url.path == '/v1:' + method
        assert json.loads(request.content)['locationSpecifier']['coordinates'] == {'latitude': 18.624, 'longitude': 73.076}
        return httpx.Response(200, json={key: {'geojson': json.dumps({'type': 'FeatureCollection', 'features': []})}})

    result = asyncio.run(google.GoogleAgricultureProvider(httpx.MockTransport(handler)).fetch(18.624, 73.076, country='IN', monitoring=monitoring))
    assert result['geojson']['type'] == 'FeatureCollection'


def test_earth_engine_explicitly_disabled_no_fake_indices(monkeypatch):
    monkeypatch.delenv('FEATURE_GOOGLE_EARTH_ENGINE', raising=False)
    with pytest.raises(google.GoogleUnavailable) as info:
        asyncio.run(google.GoogleEarthEngineProvider().fetch({}, start=datetime.now(timezone.utc), end=datetime.now(timezone.utc)))
    assert info.value.code == 'disabled'


def test_status_never_claims_live_access_or_returns_credentials(monkeypatch):
    monkeypatch.setenv('FEATURE_GOOGLE_WEATHER', 'true')
    monkeypatch.setenv('GOOGLE_WEATHER_API_KEY', 'sensitive-test-key')
    status = google.google_status()
    assert status['weather']['configured'] is True
    assert status['live_access_verified'] is False
    assert status['weather']['status'] == 'configured_unverified'
    assert 'sensitive-test-key' not in json.dumps(status)


def test_google_routes_enforce_field_membership_and_report_disabled(demo, monkeypatch):
    monkeypatch.delenv('FEATURE_GOOGLE_WEATHER', raising=False)
    monkeypatch.delenv('FEATURE_GOOGLE_WEATHERNEXT', raising=False)
    monkeypatch.delenv('FEATURE_GOOGLE_EARTH_ENGINE', raising=False)
    field_id = demo.get('/fields').json()[0]['id']
    assert demo.get('/integrations/google').status_code == 200
    for endpoint in ['weather/history', 'weather-next?init_time=2026-10-04T00:00:00Z', 'satellite-indices', 'agriculture']:
        result = demo.get(f'/fields/{field_id}/{endpoint}')
        assert result.status_code == 200
        assert result.json()['status'] == 'unavailable'
    demo.post('/auth/logout')
    demo.post('/auth/login', json={'email': 'aliya@egin.local', 'password': 'EginDemo2026!'})
    for endpoint in ['weather/history', 'weather-next?init_time=2026-10-04T00:00:00Z', 'satellite-indices', 'agriculture']:
        assert demo.get(f'/fields/{field_id}/{endpoint}').status_code == 403
