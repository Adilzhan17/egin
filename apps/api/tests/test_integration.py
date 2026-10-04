from uuid import uuid4
import asyncio,json
from datetime import datetime,timezone,timedelta

GEOM={'type':'Polygon','coordinates':[[[69.405,52.405],[69.413,52.405],[69.413,52.411],[69.405,52.411],[69.405,52.405]]]}

def test_migration_health_and_boundaries(client):
    r=client.get('/health');assert r.status_code==200;assert r.json()['boundaries']>200;assert r.json()['model_loaded']
    from app import db
    from app.bootstrap import ROOT
    expected={path.name for path in (ROOT/'packages/db/migrations').glob('*.sql')}
    assert {row['version'] for row in db.rows('SELECT version FROM schema_migrations')}==expected
    assert db.one("SELECT count(*) n FROM pg_indexes WHERE indexdef LIKE '%%gist%%'")['n']>=4
    assert len(client.get('/admin/regions').json())>=17

def test_auth_registration_onboarding_and_sessions(client):
    email=uuid4().hex+'@example.test'
    r=client.post('/auth/register',json={'name':'Тестовый фермер','email':email,'password':'TestPassword2026!'});assert r.status_code==201
    assert 'HttpOnly' in r.headers['set-cookie'];assert 'SameSite=lax' in r.headers['set-cookie']
    assert client.get('/auth/me').json()['onboarded'] is False
    r=client.post('/onboarding',json={'name':'Тестовый фермер','language':'kk','farm_name':'Новое хозяйство','region':'Акмолинская область'});assert r.status_code==200
    assert len(client.get('/farms').json())==1
    assert client.get('/auth/me').json()['language']=='kk'
    assert client.post('/onboarding',json={'name':'Тестовый фермер','farm_name':'Дубликат'}).status_code==409
    assert client.post('/auth/logout').status_code==200
    assert client.get('/auth/me').status_code==401
    assert client.post('/auth/login',json={'email':email,'password':'wrong'}).status_code==401
    assert client.post('/auth/login',json={'email':email,'password':'TestPassword2026!'}).status_code==200

def test_csrf_origin_rejected(demo):
    assert demo.post('/auth/logout',headers={'origin':'https://evil.example'}).status_code==403

def test_fields_geography_versions_and_access(demo):
    farms=demo.get('/farms').json();assert len(farms)==2
    r=demo.post('/fields',json={'name':'Integration field','farm_id':farms[0]['id'],'crop_id':'barley','geometry':GEOM});assert r.status_code==201,r.text
    field=r.json();assert 20<field['area_ha']<70;assert field['region'] and field['district'];assert field['geometry']['type']=='MultiPolygon'
    f_id=field['id'];before=demo.get(f'/fields/{f_id}/versions').json();assert len(before)==1
    update={'name':'Changed field','crop_id':'wheat','geometry':GEOM,'revision':1}
    assert demo.put(f'/fields/{f_id}',json=update).status_code==200
    assert demo.put(f'/fields/{f_id}',json=update).status_code==409
    versions=demo.get(f'/fields/{f_id}/versions').json();assert len(versions)==2;assert versions[-1]['geometry']==before[0]['geometry']
    around=demo.get('/spatial/search',params={'lat':52.406,'lon':69.406,'radius_km':5}).json();assert any(x['id']==f_id for x in around['fields'])
    from app import db
    row=db.one('SELECT ST_SRID(ST_Transform(geometry,3857)) srid FROM fields WHERE id=%s',(f_id,));assert row['srid']==3857
    demo.post('/auth/logout');demo.post('/auth/login',json={'email':'aliya@egin.local','password':'EginDemo2026!'})
    assert demo.get(f'/fields/{f_id}').status_code==403
    assert demo.put(f'/fields/{f_id}',json={**update,'revision':2}).status_code==403
    assert demo.get(f'/fields/{f_id}/analysis').status_code==403
    assert demo.delete(f'/fields/{f_id}').status_code==403

def test_invalid_polygon(demo):
    farm=demo.get('/farms').json()[0]['id']
    bow={'type':'Polygon','coordinates':[[[69.4,52.4],[69.42,52.42],[69.42,52.4],[69.4,52.42],[69.4,52.4]]]}
    r=demo.post('/fields',json={'name':'Invalid','farm_id':farm,'geometry':bow});assert r.status_code==422
    outside={'type':'Polygon','coordinates':[[[2,48],[2.01,48],[2.01,48.01],[2,48]]]}
    assert demo.post('/fields',json={'name':'Outside','farm_id':farm,'geometry':outside}).status_code==422

def test_listing_crud_uploads_favorites(demo):
    payload={'type':'service','title':"Test '); DROP TABLE users; --",'description':'Integration test listing, safe parameters.','price':9000,'unit':'₸ / час','region':'Акмолинская область','lat':52.4,'lon':69.4}
    r=demo.post('/listings',json=payload);assert r.status_code==201,r.text;id=r.json()['id']
    assert float(demo.put('/listings/'+id,json={**payload,'price':12000}).json()['price'])==12000
    assert demo.post('/listings/'+id+'/favorite').status_code==200
    assert any(l['id']==id for l in demo.get('/listings?favorites=true').json())
    assert demo.post('/listings/'+id+'/images',files={'file':('fake.jpg',b'<script>alert(1)</script>','image/jpeg')}).status_code==415
    from PIL import Image
    import io
    out=io.BytesIO();Image.new('RGB',(30,30),'green').save(out,'PNG')
    image=demo.post('/listings/'+id+'/images',files={'file':('../../unsafe.png',out.getvalue(),'image/png')});assert image.status_code==201
    path=image.json()['path'];assert '..' not in path;assert path.endswith('.webp')
    full=demo.get(path);assert full.headers['content-type']=='image/webp'
    assert Image.open(io.BytesIO(full.content)).format=='WEBP'
    thumb_path=path.removesuffix('.webp')+'.thumb.webp'
    thumb=demo.get(thumb_path);assert thumb.headers['content-type']=='image/webp'
    assert Image.open(io.BytesIO(thumb.content)).size==(30,30)
    assert demo.delete('/listings/'+id+'/images/'+image.json()['id']).status_code==200
    assert demo.get(path).status_code==404;assert demo.get(thumb_path).status_code==404
    assert demo.delete('/listings/'+id).status_code==200
    assert all(l['id']!=id for l in demo.get('/listings').json())
    assert demo.get('/auth/me').status_code==200

def test_chat_durable_idempotency_unread_and_auth(demo):
    rooms=demo.get('/conversations').json();room=rooms[0]['id'];key=str(uuid4());body={'body':'Persisted integration message','client_id':key}
    r=demo.post(f'/conversations/{room}/messages',json=body);assert r.status_code==201
    assert demo.post(f'/conversations/{room}/messages',json=body).json()['id']==r.json()['id']
    history=demo.get(f'/conversations/{room}/messages').json();assert sum(m['client_id']==key for m in history)==1
    assert demo.post(f'/conversations/{room}/read',json={'last_read_id':r.json()['id']}).status_code==200
    uid=demo.get('/users/search?q=Алия').json()[0]['id']
    direct=demo.post('/conversations',json={'title':'Test direct','member_ids':[uid]});assert direct.status_code==201;direct_id=direct.json()['id']
    demo.post('/auth/logout');demo.post('/auth/login',json={'email':'serik@egin.local','password':'EginDemo2026!'})
    assert demo.get(f'/conversations/{direct_id}/messages').status_code==403

def test_ml_inference_and_no_claims_of_real_accuracy(demo):
    model=demo.get('/ml/model').json();assert model['dataset_kind']=='DEMO_SYNTHETIC';assert model['sample_size']>=3000
    r=demo.post('/ml/crop-suitability',json={'ph':6.7,'growing_temperature':18,'growing_precipitation':350,'clay':25,'soc':20});assert r.status_code==200
    assert len(r.json()['candidates'])==3;assert 'синтетической' in r.json()['warning']
    assert demo.post('/ml/crop-suitability',json={'ph':20,'growing_temperature':18,'growing_precipitation':350,'clay':25,'soc':20}).status_code==422

def test_cache_fresh_stale_and_unavailable(demo):
    from app import providers,db
    from psycopg.types.json import Jsonb
    key='test-cache-'+uuid4().hex
    async def success():return {'source':'TEST_ONLY','value':42}
    async def failure():raise RuntimeError('simulated provider outage')
    r=asyncio.run(providers.cached('soil_cache',key,3600,success,'TEST_ONLY'));assert r['status']=='fresh'
    r=asyncio.run(providers.cached('soil_cache',key,3600,failure,'TEST_ONLY'));assert r['status']=='cached'
    db.execute("UPDATE soil_cache SET expires_at=now()-interval '1 day' WHERE cache_key=%s",(key,))
    r=asyncio.run(providers.cached('soil_cache',key,3600,failure,'TEST_ONLY'));assert r['status']=='stale';assert r['value']==42
    r=asyncio.run(providers.cached('soil_cache','missing-'+key,3600,failure,'TEST_ONLY'));assert r['status']=='unavailable';assert 'value' not in r

def test_news_personalization_and_assistant(demo):
    assert demo.put('/interests',json={'interests':[{'kind':'topic','value':'soil'}]}).status_code==200
    news=demo.get('/news').json();assert news[0]['relevance']>=1
    assert demo.get('/assistant/provider').status_code==200
