"""External provider boundaries: timeouts, bounded retries, DB cache, deduplication."""
import asyncio,calendar,time,logging
from datetime import datetime,timezone,timedelta
from collections import defaultdict,deque
from typing import Protocol
import httpx
from psycopg import sql
from psycopg.types.json import Jsonb
from . import db

log=logging.getLogger(__name__)
_locks=defaultdict(asyncio.Lock)
_soil_slots=deque()
_nominatim_lock=asyncio.Lock()
_nominatim_last=0.
_negative={}

class WeatherProvider(Protocol):
    async def fetch(self,lat:float,lon:float)->dict: ...
class SoilProvider(Protocol):
    async def fetch(self,lat:float,lon:float)->dict: ...
class GeocodingProvider(Protocol):
    async def search(self,query:str)->dict: ...

async def request_json(url,params=None,timeout=18,retries=1):
    async with httpx.AsyncClient(timeout=httpx.Timeout(timeout,connect=6),headers={'User-Agent':'EGIN-local-MVP/0.1 (Kazakhstan agricultural research)'},follow_redirects=True) as client:
        for attempt in range(retries+1):
            try:
                r=await client.get(url,params=params)
                if r.status_code in (429,502,503,504) and attempt<retries:
                    await asyncio.sleep(1+attempt);continue
                r.raise_for_status()
                return r.json()
            except (httpx.TimeoutException,httpx.ConnectError):
                if attempt==retries:raise
                await asyncio.sleep(1)
    raise RuntimeError('Provider unavailable')

async def cached(table,key,ttl,fetch,source,max_stale=None):
    if table not in {'weather_cache','soil_cache','climate_cache','geocode_cache'}:raise ValueError('Invalid cache')
    async with _locks[table+key]:
        rec=db.one(sql.SQL('SELECT * FROM {} WHERE cache_key=%s').format(sql.Identifier(table)),(key,))
        now=datetime.now(timezone.utc)
        if rec and max_stale is not None and (now-rec['fetched_at']).total_seconds()>max_stale:rec=None
        effective_ttl=ttl(rec['payload']) if rec and callable(ttl) else ttl
        if rec and rec['expires_at']>now and (not callable(ttl) or (now-rec['fetched_at']).total_seconds()<effective_ttl):
            return {**rec['payload'],'status':'cached','fetched_at':rec['fetched_at'].isoformat()}
        if _negative.get(table+key,0)>time.monotonic():
            return {**rec['payload'],'status':'stale','fetched_at':rec['fetched_at'].isoformat()} if rec else {'status':'unavailable','source':source,'fetched_at':None,'message':'Источник временно недоступен; повторная попытка через минуту.'}
        try:
            payload=await fetch()
            stamp=datetime.now(timezone.utc)
            expires=stamp+timedelta(seconds=ttl(payload) if callable(ttl) else ttl)
            db.execute(sql.SQL('INSERT INTO {}(cache_key,payload,fetched_at,expires_at) VALUES(%s,%s,%s,%s) ON CONFLICT(cache_key) DO UPDATE SET payload=EXCLUDED.payload,fetched_at=EXCLUDED.fetched_at,expires_at=EXCLUDED.expires_at').format(sql.Identifier(table)),(key,Jsonb(payload),stamp,expires))
            return {**payload,'status':'fresh','fetched_at':stamp.isoformat()}
        except Exception as e:
            log.warning('%s unavailable: %s',source,type(e).__name__)
            _negative[table+key]=time.monotonic()+60
            if rec:return {**rec['payload'],'status':'stale','fetched_at':rec['fetched_at'].isoformat(),'message':'Последняя сохранённая оценка. Источник временно недоступен.'}
            return {'status':'unavailable','source':source,'fetched_at':None,'message':'Источник временно недоступен. Данных в кэше пока нет.'}

class OpenMeteoWeatherProvider:
    def params(self,lat,lon):
        return {'latitude':lat,'longitude':lon,'timezone':'auto','forecast_days':7,'wind_speed_unit':'kmh',
          'current':'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m,wind_direction_10m,is_day',
          'daily':'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,weather_code,et0_fao_evapotranspiration,shortwave_radiation_sum,sunrise,sunset',
          'hourly':'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,soil_temperature_0cm,soil_moisture_0_to_1cm,et0_fao_evapotranspiration'}
    async def fetch(self,lat,lon):
        params=self.params(lat,lon)
        d=await request_json('https://api.open-meteo.com/v1/forecast',params)
        daily=d['daily'];days=[{'date':t,**{k:v[i] for k,v in daily.items() if k!='time'}} for i,t in enumerate(daily['time'])]
        return {'source':'Open-Meteo','source_url':'https://open-meteo.com/','license':'CC BY 4.0','current':d.get('current',{}),'days':days,'units':d.get('daily_units',{}),'current_units':d.get('current_units',{}),'hourly':d.get('hourly',{}),'timezone':d['timezone'],'utc_offset_seconds':d.get('utc_offset_seconds'),'requested_coordinates':{'lat':lat,'lon':lon},'coordinates':{'lat':d['latitude'],'lon':d['longitude']},'raw_provider':d,'request_params':params}

class SoilGridsProvider:
    def __init__(self,mode='wcs'):self.mode=mode
    async def fetch(self,lat,lon):
        import sys,json
        proc=await asyncio.create_subprocess_exec(sys.executable,'-m','app.soilgrids_raster',self.mode,str(lat),str(lon),stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.DEVNULL)
        try:
            out,_=await asyncio.wait_for(proc.communicate(),timeout=32 if self.mode=='wcs' else 20)
            if proc.returncode:raise RuntimeError('SoilGrids '+self.mode+' unavailable')
            return json.loads(out)
        except BaseException:
            if proc.returncode is None:proc.kill();await proc.wait()
            raise

class OpenLandMapProvider:
    async def fetch(self,lat,lon):
        import sys,json
        proc=await asyncio.create_subprocess_exec(sys.executable,'-m','app.soil_raster',str(lat),str(lon),stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.DEVNULL)
        try:
            out,_=await asyncio.wait_for(proc.communicate(),timeout=28)
            if proc.returncode!=0:raise RuntimeError('OpenLandMap COG unavailable')
            return json.loads(out)
        except BaseException:
            if proc.returncode is None:
                proc.kill();await proc.wait()
            raise

class NASAPowerProvider:
    async def fetch(self,lat,lon):
        year=datetime.now(timezone.utc).year-1
        raw=await request_json('https://power.larc.nasa.gov/api/temporal/monthly/point',{'latitude':lat,'longitude':lon,'start':year-2,'end':year,'community':'AG','parameters':'T2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN,WS2M','format':'JSON'},timeout=25)
        p=raw['properties']['parameter'];months=[]
        for key,temp in p['T2M'].items():
            if len(key)!=6 or not 1<=int(key[4:])<=12 or temp<=-990:continue
            y=int(key[:4]);m=int(key[4:]);rain=p['PRECTOTCORR'].get(key,-999)
            months.append({'month':key,'temperature':temp,'precipitation':round(rain*calendar.monthrange(y,m)[1],2) if rain>-990 else None,'solar_radiation':p.get('ALLSKY_SFC_SW_DWN',{}).get(key),'wind':p.get('WS2M',{}).get(key)})
        growing=[m for m in months if 5<=int(m['month'][4:])<=8 and m['precipitation'] is not None]
        if len(growing)!=12:raise RuntimeError('Incomplete NASA POWER growing seasons')
        return {'source':'NASA POWER','source_url':'https://power.larc.nasa.gov/','period':f'{year-2}–{year}','months':months,'growing_temperature':round(sum(m['temperature'] for m in growing)/len(growing),2),'growing_precipitation':round(sum(m['precipitation'] for m in growing)/3,2),'definition':'Среднее за май–август трёх полных лет; осадки — средняя сезонная сумма. Это не климатическая норма за 30 лет.'}

class NominatimProvider:
    async def search(self,query):
        global _nominatim_last
        async with _nominatim_lock:
            wait=1.1-(time.monotonic()-_nominatim_last)
            if wait>0:await asyncio.sleep(wait)
            _nominatim_last=time.monotonic()
            raw=await request_json('https://nominatim.openstreetmap.org/search',{'q':query,'format':'jsonv2','countrycodes':'kz','limit':5,'accept-language':'ru'},timeout=10,retries=0)
        return {'source':'Nominatim / © OpenStreetMap contributors','results':[{'name':r['display_name'],'lat':float(r['lat']),'lon':float(r['lon'])} for r in raw]}

async def weather_open_meteo(lat,lon):
    return await cached('weather_cache',f'v2:{lat:.4f}:{lon:.4f}',1800,lambda:OpenMeteoWeatherProvider().fetch(lat,lon),'Open-Meteo',max_stale=10800)
async def weather(lat,lon,*,persistent=False):
    # Persisted analyses/chat history use the provider with compatible retention.
    if persistent:return await weather_open_meteo(lat,lon)
    from .google_providers import weather_with_fallback
    return await weather_with_fallback(lat,lon,lambda:weather_open_meteo(lat,lon))
async def soil(lat,lon):
    key=f'{lat:.3f}:{lon:.3f}'
    async def fetch():
        partial=None;property_sources={};received=False
        previous=db.one('SELECT payload,fetched_at FROM soil_cache WHERE cache_key=%s AND fetched_at>now()-interval \'30 days\'',(key,))
        if previous:
            old=previous['payload']
            partial={**old,'topsoil':dict(old.get('topsoil',{})),'units':dict(old.get('units',{}))}
            property_sources={k:{'fetched_at':previous['fetched_at'].isoformat(),**old.get('property_sources',{}).get(k,{'source':old['source'],'depth':old.get('depth'),'resolution_m':old.get('resolution_m')}),'cached':True} for k in partial['topsoil']}
        for provider in [SoilGridsProvider('wcs'),SoilGridsProvider('vrt'),OpenLandMapProvider()]:
            try:
                value=await provider.fetch(lat,lon)
                received=bool(value.get('topsoil')) or received
                if partial is None:partial={**value,'topsoil':{},'units':{}}
                for prop,v in value.get('topsoil',{}).items():
                    if prop not in partial['topsoil'] or property_sources.get(prop,{}).get('cached'):
                        partial['topsoil'][prop]=v;partial['units'][prop]=value.get('units',{}).get(prop)
                        property_sources[prop]={'source':value['source'],'depth':value.get('depth'),'resolution_m':value.get('resolution_m')}
                if len(partial['topsoil'])>=7:break
            except Exception as e:log.warning('Soil fallback %s: %s',type(provider).__name__,type(e).__name__)
        if partial and received:
            partial['property_sources']=property_sources
            partial['source']=' + '.join(dict.fromkeys(x['source'] for x in property_sources.values()))
            partial['missing_properties']=[k for k in ['phh2o','soc','clay','sand','silt','bdod','cec','nitrogen'] if k not in partial['topsoil']]
            return partial
        raise RuntimeError('All soil raster providers unavailable')
    return await cached('soil_cache',key,lambda value:300 if len(value.get('topsoil',{}))<7 else 30*86400,fetch,'SoilGrids / OpenLandMap')
async def climate(lat,lon):
    return await cached('climate_cache',f'{lat:.2f}:{lon:.2f}:{datetime.now().year}',30*86400,lambda:NASAPowerProvider().fetch(lat,lon),'NASA POWER')
async def geocode(query):
    return await cached('geocode_cache',query.lower().strip(),7*86400,lambda:NominatimProvider().search(query),'Nominatim')
