from datetime import date
from uuid import UUID
from fastapi import APIRouter,Depends,HTTPException
from pydantic import BaseModel,Field
from . import db
from .auth import current_user,field_access

router=APIRouter()
class TaskInput(BaseModel):
    title:str=Field(min_length=2,max_length=240)
    field_id:UUID|None=None
    due_date:date=Field(default_factory=date.today)
class NoteInput(BaseModel):
    body:str=Field(min_length=2,max_length=6000)
    client_id:UUID|None=None
class TaskUpdate(BaseModel):
    done:bool
@router.get('/tasks')
def tasks(field_id:UUID|None=None,user=Depends(current_user)):
    return db.rows('SELECT t.*,f.name field_name FROM field_tasks t LEFT JOIN fields f ON f.id=t.field_id WHERE t.user_id=%s AND (%s::uuid IS NULL OR t.field_id=%s) ORDER BY t.completed_at NULLS FIRST,t.due_date,t.created_at LIMIT 100',(user['id'],field_id,field_id))
@router.post('/tasks',status_code=201)
def add_task(data:TaskInput,user=Depends(current_user)):
    if data.field_id:field_access(user['id'],data.field_id,write=True)
    return db.one('INSERT INTO field_tasks(user_id,field_id,title,due_date) VALUES(%s,%s,%s,%s) RETURNING *',(user['id'],data.field_id,data.title,data.due_date))
@router.patch('/tasks/{id}')
def complete_task(id:UUID,data:TaskUpdate,user=Depends(current_user)):
    r=db.one('UPDATE field_tasks SET completed_at=CASE WHEN %s THEN now() ELSE NULL END WHERE id=%s AND user_id=%s RETURNING *',(data.done,id,user['id']))
    if not r:raise HTTPException(404,'Задача не найдена')
    return r
@router.get('/fields/{id}/notes')
def notes(id:UUID,user=Depends(current_user)):
    field_access(user['id'],id)
    return db.rows('SELECT n.*,p.name author FROM field_notes n JOIN profiles p ON p.user_id=n.user_id WHERE field_id=%s ORDER BY created_at DESC LIMIT 50',(id,))
@router.post('/fields/{id}/notes',status_code=201)
def add_note(id:UUID,data:NoteInput,user=Depends(current_user)):
    field_access(user['id'],id,write=True)
    with db.connection() as c:
        row=c.execute('INSERT INTO field_notes(field_id,user_id,body,client_id) VALUES(%s,%s,%s,%s) ON CONFLICT(user_id,client_id) WHERE client_id IS NOT NULL DO NOTHING RETURNING *',(id,user['id'],data.body,data.client_id)).fetchone()
        if not row:
            row=c.execute('SELECT * FROM field_notes WHERE user_id=%s AND client_id=%s',(user['id'],data.client_id)).fetchone()
            if not row or row['field_id']!=id or row['body']!=data.body:raise HTTPException(409,'client_id уже использован для другой заметки')
    return row
@router.get('/notifications')
def notifications(user=Depends(current_user)):
    return db.rows('SELECT * FROM notifications WHERE user_id=%s ORDER BY created_at DESC LIMIT 50',(user['id'],))
