import asyncio
import io
import mimetypes
import secrets
from datetime import datetime, timezone, timedelta
from pathlib import Path
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from fastapi.encoders import jsonable_encoder
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from psycopg.types.json import Jsonb
from PIL import Image, UnidentifiedImageError
from . import db, eventbus, gis
from .auth import current_user, conversation_access, field_access, rate_limit
from .schemas import MessageInput, ReadInput
from .storage import ROOT

router=APIRouter()
CHAT_ROOT=ROOT/'.private-chat'
MESSAGE_SELECT='''SELECT m.*,p.name,
 CASE WHEN reply.id IS NOT NULL THEN jsonb_build_object('id',reply.id,'user_id',reply.user_id,'name',rp.name,'body',CASE WHEN reply.deleted_at IS NULL THEN reply.body ELSE '' END,'deleted_at',reply.deleted_at) END reply_preview,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'filename',a.filename,'mime_type',a.mime_type,'size',a.size,'url','/api/chat/attachments/'||a.id,'kind',CASE WHEN a.mime_type LIKE 'image/%%' THEN 'image' ELSE 'document' END)) FROM chat_attachments a WHERE a.message_id=m.id),'[]'::jsonb) attachments,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('emoji',r.emoji,'count',r.n,'user_ids',r.users)) FROM (SELECT emoji,count(*) n,jsonb_agg(user_id) users FROM message_reactions WHERE message_id=m.id GROUP BY emoji) r),'[]'::jsonb) reactions
 FROM messages m JOIN profiles p ON p.user_id=m.user_id LEFT JOIN messages reply ON reply.id=m.reply_to_id LEFT JOIN profiles rp ON rp.user_id=reply.user_id'''

def message_record(id,conn=None):
    sql=MESSAGE_SELECT+' WHERE m.id=%s'
    row=conn.execute(sql,(id,)).fetchone() if conn else db.one(sql,(id,))
    if row and row['deleted_at']:
        row.update(body='',attachments=[],field_card=None,reactions=[],reply_preview=None)
    return row

def emit_message(conn,row,kind):
    eventbus.publish(kind,row['id'],{'conversation_id':str(row['conversation_id']),'message':row},conversation_id=row['conversation_id'],conn=conn)

@router.get('/conversations/{id}/messages')
def messages(id:UUID,before:int=Query(9223372036854775807,ge=1),limit:int=Query(50,ge=1,le=100),user=Depends(current_user)):
    conversation_access(user['id'],id)
    rows=db.rows(MESSAGE_SELECT+' WHERE m.conversation_id=%s AND m.id<%s ORDER BY m.id DESC LIMIT %s',(id,before,limit))
    for row in rows:
        if row['deleted_at']:row.update(body='',attachments=[],field_card=None,reactions=[],reply_preview=None)
    return list(reversed(rows))

@router.post('/conversations/{id}/messages',status_code=201)
async def send_message(id:UUID,data:MessageInput,user=Depends(current_user)):
    conversation_access(user['id'],id);rate_limit('message:'+str(user['id']),60)
    field_card=None;body=data.body;forward=None
    if data.field_id:
        field_access(user['id'],data.field_id);f=gis.get_field(data.field_id)
        field_card={k:f[k] for k in ('name','area_ha','region','lat','lon')};field_card['field_id']=str(f['id'])
        preview=db.one('''SELECT CASE WHEN ST_NPoints(g)<=128 THEN ST_AsGeoJSON(g)::json ELSE NULL END geometry
          FROM (SELECT ST_SimplifyPreserveTopology(geometry,0.0001) g FROM fields WHERE id=%s) preview''',(data.field_id,))
        if preview and preview['geometry']:field_card['geometry']=preview['geometry']
    if data.forward_message_id:
        forward=db.one('SELECT * FROM messages WHERE id=%s',(data.forward_message_id,))
        if not forward or forward['deleted_at']:raise HTTPException(404,'Исходное сообщение недоступно')
        conversation_access(user['id'],forward['conversation_id'])
        body=forward['body'];field_card=forward['field_card']
    with db.connection() as c:
        existing=c.execute('SELECT id,conversation_id FROM messages WHERE user_id=%s AND client_id=%s',(user['id'],data.client_id)).fetchone()
        if existing:
            if existing['conversation_id']!=id:raise HTTPException(409,'Идентификатор сообщения уже использован')
            return message_record(existing['id'],c)
        if data.reply_to_id and not c.execute('SELECT 1 FROM messages WHERE id=%s AND conversation_id=%s AND deleted_at IS NULL',(data.reply_to_id,id)).fetchone():raise HTTPException(422,'Ответ должен ссылаться на сообщение этого чата')
        uploads=[]
        for upload_id in set(data.attachments):
            attachment=c.execute('SELECT * FROM chat_attachments WHERE id=%s AND user_id=%s AND conversation_id=%s AND message_id IS NULL FOR UPDATE',(upload_id,user['id'],id)).fetchone()
            if not attachment:raise HTTPException(403,'Нет доступа к вложению')
            uploads.append(attachment)
        r=c.execute('INSERT INTO messages(conversation_id,user_id,body,client_id,reply_to_id,forwarded_from,field_card) VALUES(%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(user_id,client_id) DO NOTHING RETURNING id',(id,user['id'],body,data.client_id,data.reply_to_id,data.forward_message_id,Jsonb(field_card) if field_card else None)).fetchone()
        if not r:
            r=c.execute('SELECT id FROM messages WHERE user_id=%s AND client_id=%s AND conversation_id=%s',(user['id'],data.client_id,id)).fetchone()
            if not r:raise HTTPException(409,'Идентификатор сообщения уже использован')
            return message_record(r['id'],c)
        for attachment in uploads:c.execute('UPDATE chat_attachments SET message_id=%s WHERE id=%s',(r['id'],attachment['id']))
        if forward:
            c.execute('''INSERT INTO chat_attachments(conversation_id,user_id,message_id,filename,mime_type,size,storage_name)
              SELECT %s,%s,%s,filename,mime_type,size,storage_name FROM chat_attachments WHERE message_id=%s''',(id,user['id'],r['id'],forward['id']))
        row=message_record(r['id'],c);emit_message(c,row,'message.created')
    return row

class MessageEdit(BaseModel):
    body:str=Field(min_length=1,max_length=6000)
    version:int=Field(ge=1)
class Reaction(BaseModel):
    emoji:str=Field(min_length=1,max_length=20)
class Typing(BaseModel):
    typing:bool=True

def owned_message(c,id,message_id,user):
    if not c.execute('SELECT 1 FROM conversation_members WHERE conversation_id=%s AND user_id=%s',(id,user['id'])).fetchone():
        raise HTTPException(403,'Нет доступа к переписке')
    row=c.execute('SELECT * FROM messages WHERE id=%s AND conversation_id=%s FOR UPDATE',(message_id,id)).fetchone()
    if not row:raise HTTPException(404,'Сообщение не найдено')
    if row['user_id']!=user['id']:raise HTTPException(403,'Изменять сообщение может только автор')
    return row

@router.patch('/conversations/{id}/messages/{message_id}')
def edit_message(id:UUID,message_id:int,data:MessageEdit,user=Depends(current_user)):
    if not data.body.strip():raise HTTPException(422,'Пустое сообщение')
    with db.connection() as c:
        old=owned_message(c,id,message_id,user)
        if old['deleted_at']:raise HTTPException(409,'Сообщение удалено')
        if old['body']==data.body.strip():return message_record(message_id,c)
        if old['version']!=data.version:raise HTTPException(409,'Сообщение изменено. Обновите чат.')
        c.execute('UPDATE messages SET body=%s,edited_at=now(),version=version+1 WHERE id=%s',(data.body.strip(),message_id))
        row=message_record(message_id,c);emit_message(c,row,'message.edited')
    return row

@router.delete('/conversations/{id}/messages/{message_id}')
def delete_message(id:UUID,message_id:int,version:int|None=Query(None,ge=1),user=Depends(current_user)):
    with db.connection() as c:
        old=owned_message(c,id,message_id,user)
        if old['deleted_at']:return message_record(message_id,c)
        if version is not None and version!=old['version']:raise HTTPException(409,'Сообщение изменено. Обновите чат.')
        c.execute("UPDATE messages SET body='Сообщение удалено',field_card=NULL,deleted_at=now(),version=version+1 WHERE id=%s",(message_id,))
        c.execute('DELETE FROM message_reactions WHERE message_id=%s',(message_id,))
        row=message_record(message_id,c)
        eventbus.redact_message(c,id,message_id,row['deleted_at'],row['version'])
        emit_message(c,row,'message.deleted')
    return row

def change_reaction(id,message_id,data,user,remove=False):
    conversation_access(user['id'],id);rate_limit('reaction:'+str(user['id']),60)
    if data.emoji not in {'👍','❤️','🔥','👏','🙏','👎','✅','🌱','😂','😮','😢'}:raise HTTPException(422,'Выберите поддерживаемую реакцию')
    with db.connection() as c:
        row=c.execute('SELECT * FROM messages WHERE id=%s AND conversation_id=%s AND deleted_at IS NULL FOR UPDATE',(message_id,id)).fetchone()
        if not row:raise HTTPException(404,'Сообщение не найдено')
        if remove:changed=c.execute('DELETE FROM message_reactions WHERE message_id=%s AND user_id=%s AND emoji=%s RETURNING message_id',(message_id,user['id'],data.emoji)).fetchone()
        else:changed=c.execute('INSERT INTO message_reactions VALUES(%s,%s,%s) ON CONFLICT DO NOTHING RETURNING message_id',(message_id,user['id'],data.emoji)).fetchone()
        if changed:c.execute('UPDATE messages SET version=version+1 WHERE id=%s',(message_id,))
        row=message_record(message_id,c)
        if changed:emit_message(c,row,'message.reaction')
    return row
@router.put('/conversations/{id}/messages/{message_id}/reactions')
def react(id:UUID,message_id:int,data:Reaction,user=Depends(current_user)):return change_reaction(id,message_id,data,user)
@router.delete('/conversations/{id}/messages/{message_id}/reactions')
def unreact(id:UUID,message_id:int,data:Reaction,user=Depends(current_user)):return change_reaction(id,message_id,data,user,True)

@router.post('/conversations/{id}/read')
def mark_read(id:UUID,data:ReadInput,user=Depends(current_user)):
    conversation_access(user['id'],id)
    with db.connection() as c:
        top=c.execute('SELECT COALESCE(max(id),0) n FROM messages WHERE conversation_id=%s',(id,)).fetchone()['n']
        row=c.execute('''INSERT INTO message_reads(conversation_id,user_id,last_read_id) VALUES(%s,%s,%s)
          ON CONFLICT(conversation_id,user_id) DO UPDATE SET last_read_id=EXCLUDED.last_read_id,updated_at=now()
          WHERE message_reads.last_read_id<EXCLUDED.last_read_id RETURNING last_read_id''',(id,user['id'],min(data.last_read_id,top))).fetchone()
        if row:eventbus.publish('message.read',id,{'conversation_id':str(id),'user_id':str(user['id']),'last_read_id':row['last_read_id']},conversation_id=id,conn=c)
    return {'ok':True}

@router.get('/conversations/{id}/members')
def members(id:UUID,user=Depends(current_user)):
    conversation_access(user['id'],id)
    return db.rows('''SELECT p.user_id id,p.name,up.last_seen,COALESCE(up.last_seen>now()-interval '70 seconds',false) online,
      COALESCE(mr.last_read_id,0) last_read_id,CASE WHEN ct.expires_at>now() THEN ct.expires_at END typing_until
      FROM conversation_members cm JOIN profiles p ON p.user_id=cm.user_id LEFT JOIN user_presence up ON up.user_id=p.user_id
      LEFT JOIN message_reads mr ON mr.user_id=p.user_id AND mr.conversation_id=cm.conversation_id
      LEFT JOIN conversation_typing ct ON ct.user_id=p.user_id AND ct.conversation_id=cm.conversation_id
      WHERE cm.conversation_id=%s ORDER BY p.name''',(id,))

@router.post('/presence')
def presence(user=Depends(current_user)):
    rate_limit('presence:'+str(user['id']),6,60)
    with db.connection() as c:
        row=c.execute('INSERT INTO user_presence(user_id) VALUES(%s) ON CONFLICT(user_id) DO UPDATE SET last_seen=now() RETURNING last_seen',(user['id'],)).fetchone()
        payload={'user_id':str(user['id']),'last_seen':row['last_seen'],'online':True}
        for room in c.execute('SELECT conversation_id FROM conversation_members WHERE user_id=%s',(user['id'],)).fetchall():eventbus.publish('presence.updated',user['id'],payload,conversation_id=room['conversation_id'],conn=c)
    return payload

@router.post('/conversations/{id}/typing')
def typing(id:UUID,data:Typing,user=Depends(current_user)):
    conversation_access(user['id'],id);rate_limit('typing:'+str(user['id']),40,60)
    expires=datetime.now(timezone.utc)+timedelta(seconds=6 if data.typing else 0)
    payload={'conversation_id':str(id),'user_id':str(user['id']),'name':user['name'],'typing':data.typing,'expires_at':expires}
    with db.connection() as c:
        c.execute('INSERT INTO conversation_typing VALUES(%s,%s,%s) ON CONFLICT(conversation_id,user_id) DO UPDATE SET expires_at=EXCLUDED.expires_at',(id,user['id'],expires))
        eventbus.publish('chat.typing',id,payload,conversation_id=id,conn=c)
    return {'ok':True}

def save_attachment(raw,filename):
    if not raw or len(raw)>5*1024*1024:raise HTTPException(413,'Вложение должно быть от 1 байта до 5 МБ')
    name=Path(filename or 'document').name.replace('\x00','')[:150]
    suffix=Path(name).suffix.lower()
    mime=None
    if raw.startswith(b'%PDF-') and suffix=='.pdf':mime='application/pdf'
    elif suffix=='.txt':
        try:raw.decode('utf-8')
        except UnicodeDecodeError:raise HTTPException(415,'Текстовый файл должен быть UTF-8')
        mime='text/plain'
    else:
        try:
            im=Image.open(io.BytesIO(raw))
            if im.format not in ('JPEG','PNG','WEBP') or im.width*im.height>20000000:raise HTTPException(415,'Поддерживаются фото JPEG/PNG/WebP, PDF и TXT')
            im.load();im=im.convert('RGB');im.thumbnail((1600,1600));buffer=io.BytesIO();im.save(buffer,'JPEG',quality=85,optimize=True)
            raw=buffer.getvalue();name=Path(name).stem+'.jpg';suffix='.jpg';mime='image/jpeg'
        except (UnidentifiedImageError,OSError,Image.DecompressionBombError):raise HTTPException(415,'Поддерживаются фото JPEG/PNG/WebP, PDF и TXT')
    CHAT_ROOT.mkdir(parents=True,exist_ok=True);storage_name=secrets.token_hex(24)+suffix
    (CHAT_ROOT/storage_name).write_bytes(raw)
    return name,mime,len(raw),storage_name

@router.post('/conversations/{id}/attachments',status_code=201)
async def upload_attachment(id:UUID,file:UploadFile,user=Depends(current_user)):
    conversation_access(user['id'],id);rate_limit('chat-upload:'+str(user['id']),20,300)
    raw=await file.read(5*1024*1024+1)
    name,mime,size,storage_name=await asyncio.to_thread(save_attachment,raw,file.filename)
    row=db.one('INSERT INTO chat_attachments(conversation_id,user_id,filename,mime_type,size,storage_name) VALUES(%s,%s,%s,%s,%s,%s) RETURNING id,filename,mime_type,size',(id,user['id'],name,mime,size,storage_name))
    return {**row,'url':'/api/chat/attachments/'+str(row['id']),'kind':'image' if mime.startswith('image/') else 'document'}

@router.get('/chat/attachments/{id}')
def download_attachment(id:UUID,user=Depends(current_user)):
    row=db.one('SELECT a.*,m.deleted_at FROM chat_attachments a LEFT JOIN messages m ON m.id=a.message_id WHERE a.id=%s',(id,))
    if not row or row['deleted_at']:raise HTTPException(404,'Вложение недоступно')
    conversation_access(user['id'],row['conversation_id'])
    if row['message_id'] is None and row['user_id']!=user['id']:raise HTTPException(403,'Вложение еще не отправлено')
    path=CHAT_ROOT/row['storage_name']
    if not path.is_file():raise HTTPException(404,'Файл недоступен')
    image=row['mime_type'].startswith('image/')
    return FileResponse(path,media_type=row['mime_type'] if image else 'application/octet-stream',filename=row['filename'],content_disposition_type='inline' if image else 'attachment',headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'})
