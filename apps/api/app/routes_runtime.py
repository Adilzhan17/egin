import asyncio
from datetime import datetime, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from . import db, eventbus
from .auth import current_user, field_access
from fastapi.encoders import jsonable_encoder

router=APIRouter()

def publish_field_snapshot(field_id,kind,payload):
    """Cache hits do not rebroadcast the same provider snapshot on every GET."""
    payload=jsonable_encoder({**(payload or {}),'field_id':str(field_id)})
    if kind=='weather.updated' and ('Google' in str(payload.get('source','')) or payload.get('provider')=='google'):
        payload={'field_id':str(field_id),'refresh':True,'source':'Google Weather'}
    with db.connection() as c:
        c.execute('SELECT pg_advisory_xact_lock(614882029154)')
        scope=c.execute('SELECT fa.organization_id FROM fields f JOIN farms fa ON fa.id=f.farm_id WHERE f.id=%s',(field_id,)).fetchone()
        if not scope:return
        previous=c.execute('SELECT payload FROM realtime_events WHERE type=%s AND entity_id=%s ORDER BY id DESC LIMIT 1',(kind,str(field_id))).fetchone()
        # status/cache age can change while provider values remain identical.
        compare=lambda p:{k:v for k,v in p.items() if k not in ('cached','age_seconds','stale')}
        if not previous or compare(previous['payload'])!=compare(payload):
            eventbus.publish(kind,field_id,payload,organization_id=scope['organization_id'],conn=c)

def compact_weather(value,summary=False):
    """Only normalized values for presentation; no duplicate raw provider payload."""
    if not value:return None
    result={key:value[key] for key in ('status','source','provider','attribution','fetched_at','cached','stale','timezone','latitude','longitude','lat','lon','current','current_units','days','hourly','warning','warnings','field_id') if key in value}
    if summary and isinstance(result.get('hourly'),dict):
        hourly=result['hourly'];times=hourly.get('time',[]);current=str((result.get('current') or {}).get('time',''))
        start=next((i for i,t in enumerate(times) if t>=current),0)
        result['hourly']={k:v[start:start+48] for k,v in hourly.items() if isinstance(v,list) and k in ('time','temperature_2m','precipitation','wind_speed_10m','relative_humidity_2m')}
        result['hourly_limit']=48
    return result

@router.get('/bootstrap')
def bootstrap(field_id:UUID|None=None,user=Depends(current_user)):
    # A consistent MVCC snapshot and cursor: no gap between hydration and replay.
    with db.connection() as c:
        c.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
        version=eventbus.cursor(c)
        farms=c.execute('''SELECT f.*,om.role FROM farms f JOIN organization_members om ON om.organization_id=f.organization_id WHERE om.user_id=%s ORDER BY f.created_at LIMIT 100''',(user['id'],)).fetchall()
        fields=c.execute('''SELECT f.id,f.farm_id,f.name,f.crop_id,cc.name_ru crop_name,f.area_ha,f.revision,f.updated_at,
          ST_Y(f.centroid) lat,ST_X(f.centroid) lon,r.name_ru region,d.name_ru district,fa.name farm_name,
          CASE WHEN ST_NPoints(preview.geom)<=128 THEN ST_AsGeoJSON(preview.geom)::json ELSE NULL END preview_geometry
          FROM fields f JOIN farms fa ON fa.id=f.farm_id LEFT JOIN crop_catalog cc ON cc.id=f.crop_id
          CROSS JOIN LATERAL(SELECT ST_SimplifyPreserveTopology(f.geometry,0.0001) geom) preview
          LEFT JOIN admin_boundaries r ON r.id=f.region_id LEFT JOIN admin_boundaries d ON d.id=f.district_id
          WHERE EXISTS(SELECT 1 FROM organization_members om WHERE om.organization_id=fa.organization_id AND om.user_id=%s)
          ORDER BY f.created_at DESC LIMIT 200''',(user['id'],)).fetchall()
        selected=next((f for f in fields if str(f['id'])==str(field_id)),None) if field_id else (fields[0] if fields else None)
        if field_id and not selected:raise HTTPException(403,'Нет доступа к выбранному полю')
        weather=None
        if selected:
            key=f"v2:{selected['lat']:.4f}:{selected['lon']:.4f}"
            cached=c.execute('SELECT payload,fetched_at,expires_at FROM weather_cache WHERE cache_key=%s',(key,)).fetchone()
            if cached:
                stale=cached['expires_at']<datetime.now(timezone.utc)
                weather={**compact_weather(cached['payload'],summary=True),'field_id':str(selected['id']),'cached':True,'stale':stale,'status':'stale' if stale else 'cached','fetched_at':cached['fetched_at']}
        analyses=c.execute('''SELECT DISTINCT ON (m.field_id) m.id,m.field_id,m.field_revision,m.model_version,m.created_at,
          m.result->'recommendation' recommendation,m.result->'risk' risk
          FROM ml_runs m JOIN fields f ON f.id=m.field_id JOIN farms fa ON fa.id=f.farm_id
          WHERE EXISTS(SELECT 1 FROM organization_members om WHERE om.organization_id=fa.organization_id AND om.user_id=%s)
          ORDER BY m.field_id,m.created_at DESC LIMIT 200''',(user['id'],)).fetchall()
        for analysis in analyses:
            if isinstance(analysis['recommendation'],dict):
                analysis['recommendation']={k:v for k,v in analysis['recommendation'].items() if k not in ('features','feature_importance','reasons')}
        conversations=c.execute('''SELECT c.id,c.title,c.kind,c.created_at,last.body last_message,last.created_at last_message_at,last.id last_message_id,
          COALESCE(mr.last_read_id,0) last_read_id,(SELECT count(*) FROM messages m WHERE m.conversation_id=c.id AND m.user_id<>%s AND m.deleted_at IS NULL AND m.id>COALESCE(mr.last_read_id,0)) unread_count
          FROM conversations c JOIN conversation_members cm ON cm.conversation_id=c.id AND cm.user_id=%s
          LEFT JOIN message_reads mr ON mr.conversation_id=c.id AND mr.user_id=%s
          LEFT JOIN LATERAL(SELECT id,body,created_at FROM messages WHERE conversation_id=c.id AND deleted_at IS NULL ORDER BY id DESC LIMIT 1) last ON true
          ORDER BY COALESCE(last.created_at,c.created_at) DESC LIMIT 100''',(user['id'],user['id'],user['id'])).fetchall()
        notifications=c.execute('SELECT * FROM notifications WHERE user_id=%s ORDER BY created_at DESC LIMIT 30',(user['id'],)).fetchall()
        market=c.execute("SELECT id,type,title,price,unit,region,is_demo,created_at FROM listings WHERE status='active' ORDER BY created_at DESC LIMIT 12").fetchall()
        tasks=c.execute('SELECT t.*,f.name field_name FROM field_tasks t LEFT JOIN fields f ON f.id=t.field_id WHERE t.user_id=%s ORDER BY t.completed_at NULLS FIRST,t.due_date LIMIT 30',(user['id'],)).fetchall()
        jobs=c.execute("SELECT id,field_id,question,status,answer,tools,provider,model,error,created_at FROM assistant_jobs WHERE user_id=%s AND status IN ('queued','running') ORDER BY created_at DESC LIMIT 3",(user['id'],)).fetchall()
    return {'user':user,'farms':farms,'fields':fields,'selected_field_id':str(selected['id']) if selected else None,'weather':weather,
            'analyses':analyses,'notifications':notifications,'conversations':conversations,'market':market,'tasks':tasks,'assistant_jobs':jobs,
            'unread_count':sum(int(c['unread_count']) for c in conversations),'feature_flags':{'events':True,'assistant_jobs':True,'chat_extended':True},
            'server_timestamp':datetime.now(timezone.utc).isoformat(),'snapshot_version':str(version),'event_cursor':str(version),'schema_version':1}

@router.get('/events')
async def events(request:Request,after:str|None=Query(None,max_length=24),user=Depends(current_user)):
    raw=request.headers.get('last-event-id') or after
    try:position=int(raw) if raw is not None else eventbus.cursor()
    except ValueError:raise HTTPException(422,'Некорректный Last-Event-ID')
    if position<0 or position>9223372036854775807:raise HTTPException(422,'Некорректный Last-Event-ID')
    async def stream():
        nonlocal position
        yield 'retry: 2000\n: connected\n\n'
        while not await request.is_disconnected():
            try:await asyncio.to_thread(current_user,request)
            except HTTPException:return
            wake=eventbus.wake_event()
            floor=await asyncio.to_thread(db.one,'SELECT floor_id FROM realtime_retention WHERE singleton')
            high=await asyncio.to_thread(eventbus.cursor)
            if position<floor['floor_id'] or position>high:
                yield eventbus.encode({'id':str(high),'type':'resync.required','timestamp':datetime.now(timezone.utc).isoformat(),'entityId':'bootstrap','version':str(high),'payload':{'reason':'replay_gap','url':'/api/bootstrap'}})
                return
            rows=await asyncio.to_thread(eventbus.replay,user['id'],position)
            for row in rows:
                position=row['id'];yield eventbus.encode(eventbus.envelope(row))
            if len(rows)==100:continue
            position=max(position,high)
            try:await asyncio.wait_for(wake.wait(),timeout=15)
            except asyncio.TimeoutError:
                yield ': heartbeat '+datetime.now(timezone.utc).isoformat()+'\n\n'
    return StreamingResponse(stream(),media_type='text/event-stream',headers={'Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'})
