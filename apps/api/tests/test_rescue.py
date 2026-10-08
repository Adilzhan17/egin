import asyncio,json
from uuid import uuid4

def test_activity_persistence_and_access(demo):
    f=demo.get('/fields').json()[0]['id']
    task=demo.post('/tasks',json={'title':'Осмотреть посевы','field_id':f,'due_date':'2026-10-04'});assert task.status_code==201
    id=task.json()['id'];assert demo.patch('/tasks/'+id,json={'done':True}).json()['completed_at']
    note=demo.post('/fields/'+f+'/notes',json={'body':'Проверка сохранения заметки'});assert note.status_code==201
    assert any(n['id']==note.json()['id'] for n in demo.get('/fields/'+f+'/notes').json())
    demo.post('/auth/logout');demo.post('/auth/login',json={'email':'aliya@egin.local','password':'EginDemo2026!'})
    assert demo.patch('/tasks/'+id,json={'done':False}).status_code==404
    assert demo.get('/fields/'+f+'/notes').status_code==403

def test_weather_uses_centroid_and_raw_units(demo,monkeypatch):
    from app import providers,db
    field=demo.get('/fields').json()[0]
    seen={}
    async def fetch(url,params,**kwargs):
        seen.update(params)
        return {'latitude':field['lat']+.01,'longitude':field['lon']+.01,'timezone':'Asia/Almaty','utc_offset_seconds':18000,'current':{'temperature_2m':12.5,'wind_speed_10m':18,'time':'2026-10-03T15:00'},'current_units':{'wind_speed_10m':'km/h'},'daily':{'time':['2026-10-03'],'temperature_2m_max':[15.0],'temperature_2m_min':[3.0]},'daily_units':{},'hourly':{}}
    monkeypatch.setattr(providers,'request_json',fetch)
    db.execute('DELETE FROM weather_cache')
    r=demo.get('/fields/'+field['id']+'/weather');assert r.status_code==200
    w=r.json();assert seen['latitude']==field['lat'];assert seen['longitude']==field['lon'];assert seen['timezone']=='auto';assert seen['wind_speed_unit']=='kmh'
    assert w['current']==w['raw_provider']['current'];assert w['days'][0]['temperature_2m_max']==w['raw_provider']['daily']['temperature_2m_max'][0]
    assert w['requested_coordinates']=={'lat':field['lat'],'lon':field['lon']}
    assert demo.get('/weather/debug',params={'fieldId':field['id']}).status_code==200

def test_llm_stream_calls_authorized_tools_and_stores_history(demo,monkeypatch):
    from app.assistant import service
    class TestProvider:
        name='test_protocol'
        async def stream(self,messages,tools,model):
            if messages[-1]['role']!='tool':
                yield {'call':{'function':{'name':'get_fields','arguments':{}}}}
            else:
                fields=json.loads(messages[-1]['content']);assert fields and 'lat' in fields[0]
                yield {'text':'Поля: '};yield {'text':fields[0]['name']}
    monkeypatch.setattr(service,'get_provider',lambda:(TestProvider(),'test-model'))
    r=demo.post('/assistant/stream',json={'question':'Покажи мои поля'})
    events=[json.loads(line[6:]) for line in r.text.splitlines() if line.startswith('data: ')]
    assert any(e.get('origin')=='model' and e.get('name')=='get_fields' for e in events)
    assert len([e for e in events if e['type']=='token'])==2
    assert events[-1]['type']=='done'
    history=demo.get('/assistant/history').json();assert history[-1]['status']=='completed';assert history[-1]['provider']=='test_protocol'
    from app.assistant.tools import execute
    from app.auth import current_user
    user=demo.get('/auth/me').json()
    foreign=demo.get('/fields').json()[0]['id']
    demo.post('/auth/logout');demo.post('/auth/login',json={'email':'aliya@egin.local','password':'EginDemo2026!'})
    other=demo.get('/auth/me').json()
    import pytest
    from fastapi import HTTPException
    with pytest.raises(HTTPException):asyncio.run(execute('get_field',{'field_id':foreign},other,None))

def test_llm_missing_provider_is_explicit(demo,monkeypatch):
    monkeypatch.setenv('LLM_PROVIDER','');monkeypatch.delenv('GEMINI_API_KEY',raising=False);monkeypatch.delenv('OLLAMA_URL',raising=False)
    assert demo.get('/assistant/provider').json()['configured'] is False
    r=demo.post('/assistant/stream',json={'question':'Покажи мои поля'})
    assert 'AI provider не настроен' in r.text;assert '"type": "error"' in r.text

def test_demo_catalog_and_channels(demo):
    listings=demo.get('/listings').json();assert len([l for l in listings if l['is_demo']])>=20
    assert len(demo.get('/listings?type=job').json())>=4
    assert len(demo.get('/listings?type=machinery_rental').json())>=5
    assert len(demo.get('/conversations').json())>=5

def test_legacy_phone_login_upgrades_bcrypt(client):
    from app import db
    id=uuid4();password='LegacyTest2026!'
    h=db.one("SELECT crypt(%s,gen_salt('bf',4)) h",(password,))['h']
    db.execute('INSERT INTO users(id,phone,password_hash) VALUES(%s,%s,%s)',(id,'+77000001234','$2b$'+h[4:]))
    db.execute('INSERT INTO profiles(user_id,name) VALUES(%s,%s)',(id,'Legacy test'))
    client.cookies.clear()
    assert client.post('/auth/login',json={'email':'+7 700 000 12 34','password':password}).status_code==200
    assert db.one('SELECT password_hash FROM users WHERE id=%s',(id,))['password_hash'].startswith('$argon2id$')

def test_partial_soil_cache_is_refreshed_and_keeps_property_provenance(client,monkeypatch):
    from app import db,providers
    from psycopg.types.json import Jsonb
    old={'source':'ISRIC SoilGrids v2 WCS','depth':'0–30 cm','resolution_m':250,'topsoil':{'phh2o':6.5,'soc':25,'clay':30},'units':{}}
    db.execute("INSERT INTO soil_cache(cache_key,payload,fetched_at,expires_at) VALUES(%s,%s,now()-interval '10 minutes',now()+interval '30 days')",('50.123:70.123',Jsonb(old)))
    calls=[]
    async def sample(self,lat,lon):
        calls.append(self.mode)
        return {**old,'topsoil':{'sand':40,'silt':30,'bdod':1.2,'cec':25}}
    monkeypatch.setattr(providers.SoilGridsProvider,'fetch',sample)
    result=asyncio.run(providers.soil(50.123,70.123))
    assert calls==['wcs'];assert len(result['topsoil'])==7
    assert result['status']=='fresh';assert result['property_sources']['phh2o']['cached']
    assert not result['property_sources']['sand'].get('cached')
    async def unavailable(*args):raise RuntimeError('upstream unavailable')
    monkeypatch.setattr(providers.SoilGridsProvider,'fetch',unavailable)
    monkeypatch.setattr(providers.OpenLandMapProvider,'fetch',unavailable)
    db.execute("UPDATE soil_cache SET expires_at=now()-interval '1 minute' WHERE cache_key=%s",('50.123:70.123',))
    stale=asyncio.run(providers.soil(50.123,70.123))
    assert stale['status']=='stale';assert stale['topsoil']==result['topsoil']
