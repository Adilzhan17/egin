import json
from datetime import datetime, timezone
from uuid import UUID
from fastapi.encoders import jsonable_encoder
from .. import db,gis,providers
from ..auth import field_access,conversation_access
from ..routes_core import analyze,latest_analysis

FIELD_TOOLS={'get_field','get_field_weather','get_field_climate','get_field_soil','get_field_analysis','run_field_analysis','get_satellite_ndvi','get_weathernext_forecast','get_sensor_data'}
DESCRIPTIONS={
 'get_current_user':'Current signed-in farmer, not other users.',
 'get_user_farms':'Farms accessible to the current farmer.',
 'get_fields':'List available field identifiers, names, areas and coordinates.',
 'get_field':'Get selected field geometry-derived facts.',
 'get_field_weather':'Actual current and 7-day weather for a field centroid. Always call for weather or rain questions.',
 'get_field_climate':'Historical NASA POWER season summary, not forecast.',
 'get_field_soil':'Estimated global-model soil characteristics, not laboratory results.',
 'get_field_analysis':'Read saved experimental crop suitability and risk analysis.',
 'run_field_analysis':'Recompute analysis when the user requests analysis or recalculation.',
 'search_marketplace':'Search products and services.',
 'search_machinery':'Search local machinery rental listings.',
 'search_jobs':'Search agricultural jobs.',
 'get_notifications':'Read current user notifications and pending tasks.',
 'get_region_news':'Read attributed agriculture news and clearly labelled demo content.',
 'get_community_messages':'Read recent messages only from conversations the current farmer belongs to.',
 'get_satellite_ndvi':'Get cached Sentinel vegetation indices through configured Earth Engine; honestly unavailable without access.',
 'get_weathernext_forecast':'Get a bounded WeatherNext subset for an explicitly provided forecast initialization time.',
 'get_sensor_data':'Check whether authoritative sensor readings are connected for the selected field.'}

def definitions():
    items=[]
    for name,description in DESCRIPTIONS.items():
        properties={'field_id':{'type':'string','description':'Field UUID; omit for current selected field'}} if name in FIELD_TOOLS else {}
        if name.startswith('search_'):properties.update(query={'type':'string','description':'Short optional listing words'},nearby={'type':'boolean','description':'Only geocoded offers near selected field'},radius_km={'type':'number','minimum':1,'maximum':300},field_id={'type':'string'})
        if name=='get_community_messages':properties['conversation_id']={'type':'string','description':'Optional accessible conversation UUID'}
        if name=='get_weathernext_forecast':properties['init_time']={'type':'string','description':'Explicit ISO8601 forecast cycle with timezone; never invent a cycle'}
        items.append({'type':'function','function':{'name':name,'description':description,'parameters':{'type':'object','properties':properties,'additionalProperties':False}}})
    return items

def field_summary(f):return {k:jsonable_encoder(f.get(k)) for k in ['id','name','farm_name','area_ha','lat','lon','region','district','crop_name']}

async def execute(name,args,user,selected):
    if name not in DESCRIPTIONS:raise ValueError('Неизвестный инструмент')
    f=None
    if name in FIELD_TOOLS:
        fid=UUID(str(args.get('field_id') or selected))
        field_access(user['id'],fid)
        f=gis.get_field(fid)
    if name=='get_current_user':return {'name':user['name'],'language':user['language'],'region':user['region']}
    if name=='get_user_farms':return db.rows('SELECT f.id,f.name,f.region FROM farms f JOIN organization_members m ON m.organization_id=f.organization_id WHERE m.user_id=%s',(user['id'],))
    if name=='get_fields':return [field_summary(f) for f in gis.get_fields(user['id'])]
    if name=='get_field':return field_summary(f)
    if name=='get_field_weather':
        w=await providers.weather(f['lat'],f['lon'],persistent=True)
        current={**(w.get('current') or {})}
        direction=current.get('wind_direction_10m')
        if isinstance(direction,(float,int)):
            current['wind_direction_text']=['северный','северо-восточный','восточный','юго-восточный','южный','юго-западный','западный','северо-западный'][int((direction+22.5)//45)%8]
        return {'field':field_summary(f),'source':w['source'],'status':w['status'],'fetched_at':w.get('fetched_at'),'timezone':w.get('timezone'),'current':current,'units':{'temperature':'°C','wind_speed':'km/h','precipitation':'mm'},'days':[{k:d.get(k) for k in ['date','temperature_2m_min','temperature_2m_max','precipitation_sum','precipitation_probability_max','wind_speed_10m_max']} for d in w.get('days',[])]}
    if name=='get_field_climate':
        c=await providers.climate(f['lat'],f['lon']);return {k:v for k,v in c.items() if k!='months'}
    if name=='get_field_soil':
        s=await providers.soil(f['lat'],f['lon'])
        return {k:s[k] for k in ('source','status','fetched_at','topsoil','units','depth','resolution_m','warning','message','property_sources') if k in s}
    if name in ['get_field_analysis','run_field_analysis']:
        a=await analyze(f['id'],user) if name=='run_field_analysis' else latest_analysis(f['id'],user)
        return {k:a[k] for k in ['field','recommendation','risk','created_at'] if k in a} if a else {'status':'not_computed','message':'Анализ ещё не выполнен'}
    if name.startswith('search_'):
        kind={'search_machinery':'machinery_rental','search_jobs':'job'}.get(name)
        query=str(args.get('query',''))[:100]
        if args.get('nearby'):
            if not (args.get('field_id') or selected):return {'status':'needs_field','message':'Выберите поле, чтобы измерить расстояние до техники.'}
            fid=UUID(str(args.get('field_id') or selected));field_access(user['id'],fid);field=gis.get_field(fid)
            radius=max(1,min(300,float(args.get('radius_km') or 50)))
            items=db.rows("""SELECT id,title,type,price,unit,region,is_demo,ST_Distance(location::geography,ST_SetSRID(ST_MakePoint(%s,%s),4326)::geography)/1000 distance_km
              FROM listings WHERE status='active' AND (%s::text IS NULL OR type=%s) AND title ILIKE %s
              AND ST_DWithin(location::geography,ST_SetSRID(ST_MakePoint(%s,%s),4326)::geography,%s)
              ORDER BY distance_km LIMIT 5""",(field['lon'],field['lat'],kind,kind,'%'+query+'%',field['lon'],field['lat'],radius*1000))
            return {'items':items,'radius_km':radius,'field':field_summary(field),'scope':'Объявления с координатами; расстояние по прямой от центра выбранного поля. Демо-предложения не реальные.'}
        return db.rows("SELECT id,title,type,price,unit,region,is_demo FROM listings WHERE status='active' AND (%s::text IS NULL OR type=%s) AND title ILIKE %s ORDER BY created_at DESC LIMIT 5",(kind,kind,'%'+query+'%'))
    if name=='get_notifications':return {'tasks':db.rows('SELECT title,due_date FROM field_tasks WHERE user_id=%s AND completed_at IS NULL LIMIT 10',(user['id'],)),'notifications':db.rows('SELECT title,created_at FROM notifications WHERE user_id=%s ORDER BY created_at DESC LIMIT 5',(user['id'],))}
    if name=='get_region_news':return db.rows('SELECT title,source,external_url,published_at,is_demo FROM news_items ORDER BY published_at DESC NULLS LAST LIMIT 5')
    if name=='get_community_messages':
        conversation=args.get('conversation_id')
        if conversation:conversation=UUID(str(conversation));conversation_access(user['id'],conversation)
        return db.rows('''SELECT m.id,m.conversation_id,c.title,p.name,m.body,m.created_at FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN profiles p ON p.user_id=m.user_id
          WHERE m.deleted_at IS NULL AND EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id=m.conversation_id AND cm.user_id=%s)
          AND (%s::uuid IS NULL OR m.conversation_id=%s) ORDER BY m.id DESC LIMIT 10''',(user['id'],conversation,conversation))
    if name=='get_sensor_data':return {'status':'unavailable','field_id':str(f['id']),'message':'К этому полю не подключены физические датчики. Телеметрия не выдумывается.'}
    if name=='get_satellite_ndvi':
        from ..routes_google import satellite_indices
        return await satellite_indices(f['id'],user)
    if name=='get_weathernext_forecast':
        from ..routes_google import weather_next
        if not args.get('init_time'):return {'status':'needs_forecast_cycle','message':'Для WeatherNext требуется точное время доступного цикла прогноза; обычный прогноз доступен через get_field_weather.'}
        try:init_time=datetime.fromisoformat(str(args['init_time']).replace('Z','+00:00'))
        except ValueError:return {'status':'invalid_time','message':'Неверное время цикла прогноза'}
        return await weather_next(f['id'],init_time,72,user)
