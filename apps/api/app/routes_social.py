import json,asyncio,os
from uuid import UUID
from fastapi import APIRouter,Depends,HTTPException,Query,UploadFile,Request
from fastapi.responses import StreamingResponse
from psycopg.types.json import Jsonb
from . import db,gis,providers,eventbus
from .auth import current_user,conversation_access,rate_limit,field_access
from .schemas import ListingInput,ConversationInput,MessageInput,ReadInput,AssistantInput,InterestsInput
from .storage import storage

router=APIRouter()
LISTING_SELECT='''SELECT l.*,ST_X(l.location) AS lon,ST_Y(l.location) AS lat,p.name AS seller_name,
 COALESCE((SELECT json_agg(json_build_object('id',i.id,'path',i.path) ORDER BY i.position) FROM listing_images i WHERE i.listing_id=l.id),'[]'::json) AS images,
 EXISTS(SELECT 1 FROM favorites fav WHERE fav.listing_id=l.id AND fav.user_id=%s) AS is_favorite
 FROM listings l JOIN profiles p ON p.user_id=l.user_id'''

def listing(id,user):
    r=db.one(LISTING_SELECT+' WHERE l.id=%s',(user['id'],id))
    if not r:raise HTTPException(404,'Объявление не найдено')
    r.pop('location',None);return r

def listing_owner(id,user):
    r=listing(id,user)
    if r['user_id']!=user['id']:raise HTTPException(403,'Редактировать может только автор')
    return r

@router.get('/listings')
def listings(type:str=Query('',max_length=30),q:str=Query('',max_length=100),region:str=Query('',max_length=120),favorites:bool=False,mine:bool=False,lat:float|None=Query(None,ge=40,le=56),lon:float|None=Query(None,ge=45,le=88),radius_km:float=Query(50,ge=.1,le=1000),user=Depends(current_user)):
    query=LISTING_SELECT+" WHERE (l.status='active' OR (l.user_id=%s AND %s))";args=[user['id'],user['id'],mine]
    for val,fragment in [(type,'l.type=%s'),(q,"l.title ILIKE %s"),(region,'l.region=%s')]:
        if val:query+=' AND '+fragment;args.append('%'+val+'%' if val==q and fragment.startswith('l.title') else val)
    if favorites:query+=' AND EXISTS(SELECT 1 FROM favorites fv WHERE fv.listing_id=l.id AND fv.user_id=%s)';args.append(user['id'])
    if mine:query+=' AND l.user_id=%s';args.append(user['id'])
    if lat is not None and lon is not None:query+=' AND ST_DWithin(l.location::geography,ST_SetSRID(ST_MakePoint(%s,%s),4326)::geography,%s)';args.extend([lon,lat,radius_km*1000])
    result=db.rows(query+' ORDER BY l.created_at DESC LIMIT 100',args)
    for r in result:r.pop('location',None)
    return result

@router.post('/listings',status_code=201)
def create_listing(data:ListingInput,user=Depends(current_user)):
    rate_limit('listing:'+str(user['id']),20,300)
    r=db.one('''INSERT INTO listings(user_id,type,title,description,price,unit,region,location) VALUES(%s,%s,%s,%s,%s,%s,%s,CASE WHEN %s::float IS NOT NULL AND %s::float IS NOT NULL THEN ST_SetSRID(ST_MakePoint(%s,%s),4326) END) RETURNING id''',(user['id'],data.type,data.title,data.description,data.price,data.unit,data.region,data.lon,data.lat,data.lon,data.lat))
    return listing(r['id'],user)

@router.get('/listings/{id}')
def get_listing(id:UUID,user=Depends(current_user)):return listing(id,user)
@router.put('/listings/{id}')
def update_listing(id:UUID,data:ListingInput,user=Depends(current_user)):
    listing_owner(id,user)
    db.execute('''UPDATE listings SET type=%s,title=%s,description=%s,price=%s,unit=%s,region=%s,location=CASE WHEN %s::float IS NOT NULL AND %s::float IS NOT NULL THEN ST_SetSRID(ST_MakePoint(%s,%s),4326) END,updated_at=now() WHERE id=%s''',(data.type,data.title,data.description,data.price,data.unit,data.region,data.lon,data.lat,data.lon,data.lat,id))
    return listing(id,user)
@router.delete('/listings/{id}')
def archive_listing(id:UUID,user=Depends(current_user)):
    listing_owner(id,user);db.execute("UPDATE listings SET status='archived',updated_at=now() WHERE id=%s",(id,));return {'ok':True}
@router.post('/listings/{id}/favorite')
def favorite(id:UUID,user=Depends(current_user)):
    listing(id,user)
    with db.connection() as c:
        changed=c.execute('INSERT INTO favorites VALUES(%s,%s) ON CONFLICT DO NOTHING RETURNING listing_id',(user['id'],id)).fetchone()
        if changed:eventbus.publish('market.updated',id,{'id':str(id),'is_favorite':True},user_id=user['id'],conn=c)
    return {'ok':True}
@router.delete('/listings/{id}/favorite')
def unfavorite(id:UUID,user=Depends(current_user)):
    with db.connection() as c:
        changed=c.execute('DELETE FROM favorites WHERE user_id=%s AND listing_id=%s RETURNING listing_id',(user['id'],id)).fetchone()
        if changed:eventbus.publish('market.updated',id,{'id':str(id),'is_favorite':False},user_id=user['id'],conn=c)
    return {'ok':True}
@router.post('/listings/{id}/images',status_code=201)
async def upload(id:UUID,file:UploadFile,user=Depends(current_user)):
    listing_owner(id,user)
    if db.one('SELECT count(*) AS n FROM listing_images WHERE listing_id=%s',(id,))['n']>=6:raise HTTPException(422,'Не больше 6 фото')
    data=await file.read(5*1024*1024+1);path=await asyncio.to_thread(storage.save_image,data)
    with db.connection() as c:
        row=c.execute('INSERT INTO listing_images(listing_id,path,position) VALUES(%s,%s,(SELECT count(*) FROM listing_images WHERE listing_id=%s)) RETURNING id,path',(id,path,id)).fetchone()
        eventbus.publish('market.updated',id,{'id':str(id),'images_changed':True},conn=c)
    return row
@router.delete('/listings/{id}/images/{image_id}')
def delete_image(id:UUID,image_id:UUID,user=Depends(current_user)):
    listing_owner(id,user)
    with db.connection() as c:
        changed=c.execute('DELETE FROM listing_images WHERE id=%s AND listing_id=%s RETURNING id,path',(image_id,id)).fetchone()
        if changed:eventbus.publish('market.updated',id,{'id':str(id),'images_changed':True},conn=c)
    if changed and not db.one('SELECT 1 FROM listing_images WHERE path=%s',(changed['path'],)):
        storage.delete_image(changed['path'])
    return {'ok':True}

@router.get('/users/search')
def users_search(q:str=Query(min_length=2,max_length=100),user=Depends(current_user)):
    return db.rows('SELECT p.user_id AS id,p.name FROM profiles p JOIN users u ON u.id=p.user_id WHERE p.user_id<>%s AND (p.name ILIKE %s OR u.email=%s) LIMIT 15',(user['id'],'%'+q+'%',q.lower()))

@router.get('/conversations')
def conversations(user=Depends(current_user)):
    return db.rows('''SELECT c.*,last.body AS last_message,last.created_at AS last_message_at,
    COALESCE(mr.last_read_id,0) last_read_id,
    (SELECT count(*) FROM messages m WHERE m.conversation_id=c.id AND m.user_id<>%s AND m.deleted_at IS NULL AND m.id>COALESCE(mr.last_read_id,0)) AS unread_count
    FROM conversations c JOIN conversation_members cm ON cm.conversation_id=c.id AND cm.user_id=%s
    LEFT JOIN message_reads mr ON mr.conversation_id=c.id AND mr.user_id=%s
    LEFT JOIN LATERAL (SELECT body,created_at FROM messages WHERE conversation_id=c.id AND deleted_at IS NULL ORDER BY id DESC LIMIT 1) last ON true
    ORDER BY COALESCE(last.created_at,c.created_at) DESC''',(user['id'],user['id'],user['id']))

@router.post('/conversations',status_code=201)
def create_conversation(data:ConversationInput,user=Depends(current_user)):
    ids=set(data.member_ids)|{user['id']}
    if data.kind=='direct' and len(ids)!=2:raise HTTPException(422,'Для личного чата выберите одного собеседника')
    key=':'.join(sorted(str(i) for i in ids)) if data.kind=='direct' else None
    if key:
        existing=db.one('SELECT * FROM conversations WHERE direct_key=%s',(key,))
        if existing:return existing
    with db.connection() as c:
        r=c.execute('INSERT INTO conversations(title,kind,created_by,direct_key) VALUES(%s,%s,%s,%s) RETURNING *',(data.title,data.kind,user['id'],key)).fetchone()
        for id in ids:c.execute('INSERT INTO conversation_members(conversation_id,user_id) VALUES(%s,%s)',(r['id'],id))
        eventbus.publish('conversation.updated',r['id'],r,conversation_id=r['id'],conn=c)
    return r

@router.get('/interests')
def interests(user=Depends(current_user)):return db.rows('SELECT kind,value FROM user_interests WHERE user_id=%s',(user['id'],))
@router.put('/interests')
def update_interests(data:InterestsInput,user=Depends(current_user)):
    with db.connection() as c:
        c.execute('DELETE FROM user_interests WHERE user_id=%s',(user['id'],))
        for i in data.interests:c.execute('INSERT INTO user_interests VALUES(%s,%s,%s) ON CONFLICT DO NOTHING',(user['id'],i.kind,i.value))
    return {'ok':True}
@router.get('/news')
def news(user=Depends(current_user)):
    return db.rows('''SELECT n.*,(SELECT count(*) FROM user_interests i WHERE i.user_id=%s AND ((i.kind='region' AND i.value=ANY(n.regions)) OR (i.kind='crop' AND i.value=ANY(n.crop_tags)) OR (i.kind='topic' AND i.value=ANY(n.tags)))) AS relevance FROM news_items n ORDER BY relevance DESC,published_at DESC NULLS LAST LIMIT 50''',(user['id'],))

@router.get('/assistant/history')
def assistant_history(user=Depends(current_user)):
    return list(reversed(db.rows('SELECT * FROM assistant_history WHERE user_id=%s AND provider IS NOT NULL ORDER BY id DESC LIMIT 30',(user['id'],))))
