"""Authenticated access to optional Google capabilities; no arbitrary cloud queries."""
import asyncio
from collections import OrderedDict
from datetime import datetime, timedelta, timezone
import time
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from . import gis
from .auth import current_user, field_access, rate_limit
from .google_providers import (
    GoogleAgricultureProvider, GoogleEarthEngineProvider, GoogleUnavailable,
    GoogleWeatherNextProvider, GoogleWeatherProvider, enabled, google_status,
)

router = APIRouter()
_subsets = OrderedDict()
_subset_lock = asyncio.Lock()


def _unavailable(exc):
    return {'status': 'unavailable', 'reason': exc.code, 'message': str(exc)}


@router.get('/integrations/google')
def status(user=Depends(current_user)):
    return google_status()


@router.get('/fields/{field_id}/weather/history')
async def weather_history(field_id: UUID, hours: int = Query(24, ge=1, le=24), user=Depends(current_user)):
    field_access(user['id'], field_id)
    if not enabled('FEATURE_GOOGLE_WEATHER'):
        return {'status': 'unavailable', 'reason': 'disabled', 'message': 'История Google Weather не включена. Обычный прогноз доступен.'}
    rate_limit('google-history:' + str(user['id']), 6, 60)
    field = gis.get_field(field_id)
    try:
        return await GoogleWeatherProvider().history(field['lat'], field['lon'], hours)
    except GoogleUnavailable as exc:
        return _unavailable(exc)


@router.get('/fields/{field_id}/weather-next')
async def weather_next(field_id: UUID, init_time: datetime, hours: int = Query(72, ge=1, le=168), user=Depends(current_user)):
    field_access(user['id'], field_id)
    if init_time.tzinfo is None:
        return {'status': 'unavailable', 'reason': 'invalid_time', 'message': 'Укажите часовой пояс цикла WeatherNext.'}
    if not enabled('FEATURE_GOOGLE_WEATHERNEXT'):
        return {'status': 'unavailable', 'reason': 'disabled', 'message': 'WeatherNext требует настроенного Google Cloud доступа. Обычный прогноз доступен.'}
    # Keep billable queries explicit, per-user limited and cache by authoritative revision.
    rate_limit('weather-next:' + str(user['id']), 4, 3600)
    field = gis.get_field(field_id)
    key = ('weather-next', str(field_id), field['revision'], init_time.isoformat(), hours)
    async with _subset_lock:
        if key in _subsets and _subsets[key][0] > time.monotonic():
            return {**_subsets[key][1], 'status': 'cached'}
        try:
            result = await GoogleWeatherNextProvider().fetch(field['lat'], field['lon'], init_time=init_time, hours=hours)
        except GoogleUnavailable as exc:
            return _unavailable(exc)
        _subsets[key] = (time.monotonic() + 3600, result)
        while len(_subsets) > 128:
            _subsets.popitem(last=False)
        return result


@router.get('/fields/{field_id}/agriculture')
async def agriculture(field_id: UUID, user=Depends(current_user)):
    field_access(user['id'], field_id)
    field = gis.get_field(field_id)
    try:
        return await GoogleAgricultureProvider().fetch(field['lat'], field['lon'], country='KZ')
    except GoogleUnavailable as exc:
        return {**_unavailable(exc), 'fallback': 'own_field_polygon', 'field_id': str(field_id)}


@router.get('/fields/{field_id}/satellite-indices')
async def satellite_indices(field_id: UUID, user=Depends(current_user)):
    field_access(user['id'], field_id)
    if not enabled('FEATURE_GOOGLE_EARTH_ENGINE'):
        return {'status': 'unavailable', 'reason': 'disabled', 'message': 'Спутниковые индексы требуют настроенного Earth Engine.'}
    field = gis.get_field(field_id)
    end = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    key = ('satellite', str(field_id), field['revision'], end.isoformat())
    async with _subset_lock:
        if key in _subsets and _subsets[key][0] > time.monotonic():
            return {**_subsets[key][1], 'status': 'cached'}
        rate_limit('satellite:' + str(user['id']), 2, 3600)
        try:
            result = await GoogleEarthEngineProvider().fetch(field['geometry'], start=end - timedelta(days=30), end=end)
        except GoogleUnavailable as exc:
            return _unavailable(exc)
        _subsets[key] = (time.monotonic() + 86400, result)
        while len(_subsets) > 128:
            _subsets.popitem(last=False)
        return result
