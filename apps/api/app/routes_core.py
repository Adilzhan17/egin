import asyncio,json
from uuid import UUID
from datetime import datetime,timezone
from fastapi import APIRouter,Depends,HTTPException,Request,Response,Query
from psycopg.types.json import Jsonb
from . import db,gis,ml,providers,eventbus
from .auth import current_user,hasher,verify_password,issue_session,rate_limit,digest,COOKIE,DUMMY_HASH,farm_access,field_access
from .schemas import Register,Login,Onboarding,FieldCreate,FieldUpdate,MLInput,RiskInput,AssistantInput,InterestsInput
from .bootstrap import uid

router=APIRouter()

@router.post('/auth/register',status_code=201)
def register(data:Register,request:Request,response:Response):
    rate_limit('register:'+request.client.host,8,300)
    if db.one('SELECT 1 FROM users WHERE email=%s',(data.email,)):raise HTTPException(409,'Email уже зарегистрирован')
    with db.connection() as c:
        u=c.execute('INSERT INTO users(email,password_hash) VALUES(%s,%s) RETURNING id',(data.email,hasher.hash(data.password))).fetchone()
        c.execute('INSERT INTO profiles(user_id,name) VALUES(%s,%s)',(u['id'],data.name))
        for room in [uid('community')]+[uid('channel'+str(i)) for i in range(5)]:
            c.execute('INSERT INTO conversation_members(conversation_id,user_id) SELECT id,%s FROM conversations WHERE id=%s ON CONFLICT DO NOTHING',(u['id'],room))
    issue_session(response,u['id']);return {'id':u['id'],'onboarded':False}

@router.post('/auth/login')
def login(data:Login,request:Request,response:Response):
    rate_limit('login:'+request.client.host,20,60)
    identifier=data.email.lower().strip()
    phone=''.join(c for c in identifier if c.isdigit())
    u=db.one("SELECT id,password_hash FROM users WHERE email=%s OR regexp_replace(phone,'[^0-9]','','g')=%s",(identifier,phone or None))
    valid=verify_password(data.password,u['password_hash'] if u else DUMMY_HASH)
    if not u or not valid:raise HTTPException(401,'Неверный email, телефон или пароль')
    if u['password_hash'].startswith(('$2a$','$2b$','$2y$')):db.execute('UPDATE users SET password_hash=%s WHERE id=%s',(hasher.hash(data.password),u['id']))
    issue_session(response,u['id']);return {'ok':True}

@router.post('/auth/logout')
def logout(request:Request,response:Response):
    db.execute('DELETE FROM sessions WHERE token_hash=%s',(digest(request.cookies.get(COOKIE,'')),));response.delete_cookie(COOKIE,path='/');return {'ok':True}

@router.get('/auth/me')
def me(user=Depends(current_user)):return user

@router.post('/onboarding')
def onboarding(data:Onboarding,user=Depends(current_user)):
    with db.connection() as c:
        c.execute('SELECT id FROM users WHERE id=%s FOR UPDATE',(user['id'],))
        existing=c.execute('SELECT onboarded FROM profiles WHERE user_id=%s',(user['id'],)).fetchone()
        if existing['onboarded']:raise HTTPException(409,'Настройка уже завершена')
        org=c.execute('INSERT INTO organizations(name) VALUES(%s) RETURNING id',(data.farm_name,)).fetchone()
        c.execute("INSERT INTO organization_members VALUES(%s,%s,'owner')",(org['id'],user['id']))
        farm=c.execute('INSERT INTO farms(organization_id,name,region) VALUES(%s,%s,%s) RETURNING id',(org['id'],data.farm_name,data.region)).fetchone()
        c.execute('UPDATE profiles SET name=%s,language=%s,region=%s,onboarded=true WHERE user_id=%s',(data.name,data.language,data.region,user['id']))
        if data.region:c.execute("INSERT INTO user_interests VALUES(%s,'region',%s) ON CONFLICT DO NOTHING",(user['id'],data.region))
    return {'farm_id':farm['id']}

@router.get('/farms')
def farms(user=Depends(current_user)):
    return db.rows('''SELECT f.*,om.role FROM farms f JOIN organization_members om ON om.organization_id=f.organization_id WHERE om.user_id=%s ORDER BY f.created_at''',(user['id'],))

@router.post('/farms',status_code=201)
def create_farm(data:Onboarding,user=Depends(current_user)):
    with db.connection() as c:
        org=c.execute('INSERT INTO organizations(name) VALUES(%s) RETURNING id',(data.farm_name,)).fetchone()
        c.execute("INSERT INTO organization_members VALUES(%s,%s,'owner')",(org['id'],user['id']))
        farm=c.execute('INSERT INTO farms(organization_id,name,region) VALUES(%s,%s,%s) RETURNING *',(org['id'],data.farm_name,data.region)).fetchone()
    return farm

@router.get('/crops')
def crops(user=Depends(current_user)):return db.rows('SELECT * FROM crop_catalog ORDER BY name_ru')

@router.get('/fields')
def fields(user=Depends(current_user)):return gis.get_fields(user['id'])

@router.post('/fields',status_code=201)
def create_field(data:FieldCreate,user=Depends(current_user)):
    farm_access(user['id'],data.farm_id,True);raw=gis.validate_geometry(data.geometry)
    f=db.one('''INSERT INTO fields(farm_id,name,crop_id,geometry,created_by) VALUES(%s,%s,%s,ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s),4326)),%s) RETURNING id''',(data.farm_id,data.name,data.crop_id,raw,user['id']))
    return gis.get_field(f['id'])

@router.get('/fields/{field_id}')
def get_field(field_id:UUID,user=Depends(current_user)):
    field_access(user['id'],field_id);return gis.get_field(field_id)

@router.put('/fields/{field_id}')
def update_field(field_id:UUID,data:FieldUpdate,user=Depends(current_user)):
    field_access(user['id'],field_id,True);raw=gis.validate_geometry(data.geometry)
    f=db.one('''UPDATE fields SET name=%s,crop_id=%s,geometry=ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s),4326)),revision=revision+1,created_by=%s WHERE id=%s AND revision=%s RETURNING id''',(data.name,data.crop_id,raw,user['id'],field_id,data.revision))
    if not f:raise HTTPException(409,'Поле изменено в другой вкладке. Обновите данные перед сохранением.')
    return gis.get_field(field_id)

@router.delete('/fields/{field_id}')
def delete_field(field_id:UUID,user=Depends(current_user)):
    field_access(user['id'],field_id,True);db.execute('DELETE FROM fields WHERE id=%s',(field_id,));return {'ok':True}

@router.get('/fields/{field_id}/versions')
def field_versions(field_id:UUID,user=Depends(current_user)):
    field_access(user['id'],field_id)
    return db.rows('SELECT revision,area_ha,created_at,ST_AsGeoJSON(geometry)::json AS geometry FROM field_geometry_versions WHERE field_id=%s ORDER BY revision DESC',(field_id,))

@router.get('/admin/regions')
def regions():return db.rows('SELECT id,name_ru,name_kk,name_en,source_version FROM admin_boundaries WHERE level=1 ORDER BY name_ru')

@router.get('/admin/boundaries')
def boundaries(level:int=Query(1,ge=0,le=2),west:float=45,south:float=40,east:float=88,north:float=56,user=Depends(current_user)):
    if not (-180<=west<east<=180 and -90<=south<north<=90):raise HTTPException(422,'Некорректный bbox')
    tol=.015 if east-west>10 else .002 if east-west>2 else .0002
    data=db.rows('''SELECT id,name_ru,source_version,ST_AsGeoJSON(ST_SimplifyPreserveTopology(geometry,%s))::json AS geometry FROM admin_boundaries WHERE level=%s AND geometry && ST_MakeEnvelope(%s,%s,%s,%s,4326) LIMIT 300''',(tol,level,west,south,east,north))
    return {'type':'FeatureCollection','features':[{'type':'Feature','id':r['id'],'properties':{'name':r['name_ru'],'version':r['source_version']},'geometry':r['geometry']} for r in data]}

@router.get('/location')
async def location(lat:float=Query(ge=40,le=56),lon:float=Query(ge=45,le=88),details:bool=False,user=Depends(current_user)):
    result=gis.location(lat,lon)
    if details:
        w,s=await asyncio.gather(providers.weather(lat,lon),providers.soil(lat,lon));result.update(weather=w,soil=s)
    return result

@router.get('/geocode')
async def geocode(q:str=Query(min_length=3,max_length=150),user=Depends(current_user)):
    rate_limit('geo:'+str(user['id']),15,60);return await providers.geocode(q)

@router.get('/spatial/search')
def spatial(lat:float=Query(ge=40,le=56),lon:float=Query(ge=45,le=88),radius_km:float=Query(20,ge=.1,le=1000),user=Depends(current_user)):
    data=db.rows('''SELECT f.id,f.name,f.area_ha,ST_Distance(f.centroid::geography,ST_SetSRID(ST_MakePoint(%s,%s),4326)::geography)/1000 AS distance_km FROM fields f JOIN farms fa ON fa.id=f.farm_id JOIN organization_members om ON om.organization_id=fa.organization_id AND om.user_id=%s WHERE ST_DWithin(f.geometry::geography,ST_SetSRID(ST_MakePoint(%s,%s),4326)::geography,%s) ORDER BY distance_km LIMIT 200''',(lon,lat,user['id'],lon,lat,radius_km*1000))
    listings=db.rows('''SELECT id,title,type,price,unit,region FROM listings WHERE status='active' AND ST_DWithin(location::geography,ST_SetSRID(ST_MakePoint(%s,%s),4326)::geography,%s) LIMIT 100''',(lon,lat,radius_km*1000))
    return {'fields':data,'listings':listings,'area_ha':sum(f['area_ha'] for f in data),'radius_km':radius_km,'scope':'Только доступные вам поля и объявления EGIN; лимит 200 полей/100 объявлений.'}

@router.get('/weather')
async def weather(lat:float=Query(ge=40,le=56),lon:float=Query(ge=45,le=88),user=Depends(current_user)):
    rate_limit('weather:'+str(user['id']),30);return await providers.weather(lat,lon)
@router.get('/soil')
async def soil(lat:float=Query(ge=40,le=56),lon:float=Query(ge=45,le=88),user=Depends(current_user)):
    rate_limit('soil:'+str(user['id']),10);return await providers.soil(lat,lon)
@router.get('/climate')
async def climate(lat:float=Query(ge=40,le=56),lon:float=Query(ge=45,le=88),user=Depends(current_user)):return await providers.climate(lat,lon)

@router.get('/ml/model')
def model(user=Depends(current_user)):return ml.metadata()
@router.post('/ml/crop-suitability')
def suitability(data:MLInput,user=Depends(current_user)):return ml.infer(data.model_dump())
@router.post('/ml/field-risk')
def risk(data:RiskInput,user=Depends(current_user)):return ml.risk(data.model_dump())

async def analyze(field_id,user):
    field_access(user['id'],field_id);f=gis.get_field(field_id)
    w,s,c=await asyncio.gather(providers.weather(f['lat'],f['lon'],persistent=True),providers.soil(f['lat'],f['lon']),providers.climate(f['lat'],f['lon']))
    from .ml.features import build
    observed=build(f,w,s,c)
    features={k:observed.get(k) for k in ml.metadata()['features']}
    missing=[k for k,v in features.items() if v is None]
    recommendation=ml.infer(features) if not missing else {'status':'insufficient_data','missing_features':missing,'warning':'Нет достаточных реальных данных для ML. Повторите запрос после восстановления источников.'}
    days=w.get('days',[])
    risks=ml.risk({'min_temperature':min(d['temperature_2m_min'] for d in days),'max_temperature':max(d['temperature_2m_max'] for d in days),'precipitation':sum(d['precipitation_sum'] for d in days),'max_wind':max(d['wind_speed_10m_max'] for d in days)}) if days else {'level':'unknown','flags':[],'method':'Прогноз недоступен'}
    result={'field':{'id':str(f['id']),'name':f['name'],'area_ha':f['area_ha'],'region':f['region'],'district':f['district'],'revision':f['revision']},'weather':w,'soil':s,'climate':c,'observed_features':observed,'recommendation':recommendation,'risk':risks,'created_at':datetime.now(timezone.utc).isoformat()}
    run=db.one('INSERT INTO ml_runs(field_id,user_id,field_revision,model_version,features,result) VALUES(%s,%s,%s,%s,%s,%s) RETURNING id',(field_id,user['id'],f['revision'],ml.metadata()['model_version'],Jsonb(features),Jsonb(result)))
    from .routes_runtime import publish_field_snapshot,compact_weather
    publish_field_snapshot(field_id,'weather.updated',compact_weather(w))
    publish_field_snapshot(field_id,'soil.updated',{k:v for k,v in s.items() if k not in ('raw_provider','raw')})
    return {**result,'id':str(run['id'])}

@router.post('/fields/{field_id}/analyze')
async def analyze_field(field_id:UUID,user=Depends(current_user)):
    rate_limit('analysis:'+str(user['id']),10,60);return await analyze(field_id,user)
@router.get('/fields/{field_id}/analysis')
def latest_analysis(field_id:UUID,user=Depends(current_user)):
    field_access(user['id'],field_id)
    r=db.one('SELECT id,result,field_revision FROM ml_runs WHERE field_id=%s ORDER BY created_at DESC LIMIT 1',(field_id,))
    if not r:return None
    revision=db.one('SELECT revision FROM fields WHERE id=%s',(field_id,))['revision']
    return {**r['result'],'id':str(r['id']),'geometry_changed':revision!=r['field_revision']}

@router.get('/dashboard')
def dashboard(region:str=Query('',max_length=120),user=Depends(current_user)):
    fs=gis.get_fields(user['id']);fs=[f for f in fs if not region or f['region']==region]
    crops={}
    for f in fs:
        k=f['crop_name'] or 'Не указана';crops[k]=round(crops.get(k,0)+f['area_ha'],2)
    runs=db.rows('''SELECT DISTINCT ON (m.field_id) m.field_id,m.result,m.created_at FROM ml_runs m JOIN fields f ON f.id=m.field_id JOIN farms fa ON fa.id=f.farm_id JOIN organization_members om ON om.organization_id=fa.organization_id WHERE om.user_id=%s ORDER BY m.field_id,m.created_at DESC''',(user['id'],))
    ids={f['id'] for f in fs};runs=[r for r in runs if r['field_id'] in ids]
    unread=db.one('''SELECT count(*) AS n FROM messages m JOIN conversation_members cm ON cm.conversation_id=m.conversation_id AND cm.user_id=%s LEFT JOIN message_reads mr ON mr.conversation_id=m.conversation_id AND mr.user_id=%s WHERE m.user_id<>%s AND m.id>COALESCE(mr.last_read_id,0)''',(user['id'],user['id'],user['id']))['n']
    return {'fields_count':len(fs),'area_ha':sum(f['area_ha'] for f in fs),'crops':crops,'fields':fs,'active_listings':db.one("SELECT count(*) AS n FROM listings WHERE user_id=%s AND status='active'",(user['id'],))['n'],'unread_messages':unread,'analyses':runs,'scope':'Только ваши доступные хозяйства; не статистика Казахстана'}

@router.get('/organizations/{org_id}/members')
def organization_members(org_id:UUID,user=Depends(current_user)):
    if not db.one('SELECT 1 FROM organization_members WHERE organization_id=%s AND user_id=%s',(org_id,user['id'])):raise HTTPException(403,'Нет доступа к организации')
    return db.rows('SELECT om.user_id,om.role,p.name FROM organization_members om JOIN profiles p ON p.user_id=om.user_id WHERE om.organization_id=%s ORDER BY p.name',(org_id,))

from .schemas import MemberInput
@router.put('/organizations/{org_id}/members')
def add_member(org_id:UUID,data:MemberInput,user=Depends(current_user)):
    own=db.one('SELECT role FROM organization_members WHERE organization_id=%s AND user_id=%s',(org_id,user['id']))
    if not own or own['role'] not in ('owner','admin'):raise HTTPException(403,'Требуется роль владельца или администратора')
    existing=db.one('SELECT role FROM organization_members WHERE organization_id=%s AND user_id=%s',(org_id,data.user_id))
    if data.user_id==user['id'] or (existing and existing['role']=='owner'):raise HTTPException(403,'Владельца и собственную роль здесь менять нельзя')
    if own['role']=='admin' and (data.role=='admin' or (existing and existing['role']=='admin')):raise HTTPException(403,'Назначать администраторов может только владелец')
    with db.connection() as c:
        c.execute('INSERT INTO organization_members(organization_id,user_id,role) VALUES(%s,%s,%s) ON CONFLICT(organization_id,user_id) DO UPDATE SET role=EXCLUDED.role',(org_id,data.user_id,data.role))
        for farm in c.execute('SELECT id,name,region FROM farms WHERE organization_id=%s',(org_id,)).fetchall():
            eventbus.publish('farm.updated',farm['id'],{**farm,'membership_changed':True},organization_id=org_id,conn=c)
    return {'ok':True}

@router.get('/weather/debug')
async def weather_debug(fieldId:UUID,user=Depends(current_user)):
    field_access(user['id'],fieldId)
    f=gis.get_field(fieldId)
    value=await providers.weather(f['lat'],f['lon'])
    return {'field_id':str(fieldId),'centroid':{'latitude':f['lat'],'longitude':f['lon']},'checked_at':datetime.now(timezone.utc).isoformat(),'request':value.get('request_params'),'raw':value.get('raw_provider'),'normalized':{k:v for k,v in value.items() if k!='raw_provider'}}

@router.get('/fields/{field_id}/weather')
async def field_weather(field_id:UUID,user=Depends(current_user)):
    field_access(user['id'],field_id)
    f=gis.get_field(field_id)
    result={**await providers.weather(f['lat'],f['lon']),'field_id':str(field_id)}
    return result

@router.post('/fields/{field_id}/weather/refresh')
async def refresh_field_weather(field_id:UUID,user=Depends(current_user)):
    rate_limit('weather-refresh:'+str(user['id']),5,60)
    result=await field_weather(field_id,user)
    from .routes_runtime import publish_field_snapshot,compact_weather
    publish_field_snapshot(field_id,'weather.updated',compact_weather(result))
    return result
