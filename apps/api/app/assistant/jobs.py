"""Persistent assistant jobs decouple generation from a phone's HTTP connection."""
import asyncio
import time
import logging
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from .. import db, eventbus
from ..auth import current_user, field_access, rate_limit
from ..schemas import AssistantInput
from .service import stream_answer

router=APIRouter()
_pending=asyncio.Event()

class JobInput(AssistantInput):
    client_id:UUID=Field(default_factory=uuid4)

class JobRequest:
    def __init__(self,id):self.id=id
    async def is_disconnected(self):
        job=await asyncio.to_thread(db.one,'SELECT cancel_requested FROM assistant_jobs WHERE id=%s',(self.id,))
        return not job or job['cancel_requested']

@router.post('/assistant/messages',status_code=202)
def create_job(data:JobInput,user=Depends(current_user)):
    if data.field_id:field_access(user['id'],data.field_id)
    existing=db.one('SELECT * FROM assistant_jobs WHERE user_id=%s AND client_id=%s',(user['id'],data.client_id))
    if existing:
        if existing['question']!=data.question or existing['field_id']!=data.field_id:raise HTTPException(409,'client_id уже использован для другого вопроса')
        return {'id':existing['id'],'job_id':existing['id'],'status':existing['status'],'event_cursor':str(eventbus.cursor())}
    rate_limit('llm-job:'+str(user['id']),8,60)
    with db.connection() as c:
        c.execute('SELECT id FROM users WHERE id=%s FOR UPDATE',(user['id'],))
        # Recheck after serialization: a concurrent retry can arrive before the
        # first request commits, including when it fills the second active slot.
        duplicate=c.execute('SELECT * FROM assistant_jobs WHERE user_id=%s AND client_id=%s',(user['id'],data.client_id)).fetchone()
        if duplicate:
            if duplicate['question']!=data.question or duplicate['field_id']!=data.field_id:raise HTTPException(409,'client_id уже использован для другого вопроса')
            return {'id':duplicate['id'],'job_id':duplicate['id'],'status':duplicate['status'],'event_cursor':str(eventbus.cursor(c))}
        if c.execute("SELECT count(*) n FROM assistant_jobs WHERE user_id=%s AND status IN ('queued','running')",(user['id'],)).fetchone()['n']>=2:
            raise HTTPException(429,'Дождитесь ответа или остановите текущий запрос')
        row=c.execute('INSERT INTO assistant_jobs(user_id,client_id,field_id,question) VALUES(%s,%s,%s,%s) ON CONFLICT(user_id,client_id) DO NOTHING RETURNING *',(user['id'],data.client_id,data.field_id,data.question)).fetchone()
        if row:
            eventbus.publish('assistant.started',row['id'],{'job_id':str(row['id']),'question':data.question,'field_id':data.field_id,'status':'queued','message':'Запрос принят. Подключаю AI…'},user_id=user['id'],conn=c)
        else:row=c.execute('SELECT * FROM assistant_jobs WHERE user_id=%s AND client_id=%s',(user['id'],data.client_id)).fetchone()
        if row['question']!=data.question or row['field_id']!=data.field_id:raise HTTPException(409,'client_id уже использован для другого вопроса')
        position=eventbus.cursor(c)
    return {'id':row['id'],'job_id':row['id'],'status':row['status'],'event_cursor':str(position)}

@router.get('/assistant/messages/{id}')
def get_job(id:UUID,user=Depends(current_user)):
    row=db.one('SELECT id,client_id,field_id,question,status,answer,tools,provider,model,error,created_at,updated_at FROM assistant_jobs WHERE id=%s AND user_id=%s',(id,user['id']))
    if not row:raise HTTPException(404,'Запрос не найден')
    return row

@router.post('/assistant/messages/{id}/cancel')
def cancel_job(id:UUID,user=Depends(current_user)):
    with db.connection() as c:
        row=c.execute('SELECT * FROM assistant_jobs WHERE id=%s AND user_id=%s FOR UPDATE',(id,user['id'])).fetchone()
        if not row:raise HTTPException(404,'Запрос не найден')
        if row['status'] in ('queued','running'):
            c.execute("UPDATE assistant_jobs SET cancel_requested=true,status='cancelled',updated_at=now() WHERE id=%s",(id,))
            eventbus.publish('assistant.completed',id,{'job_id':str(id),'status':'cancelled','text':row['answer']},user_id=user['id'],conn=c)
            row['status']='cancelled'
    return {'id':id,'status':row['status']}

def update_event(job,kind,payload,*,text=None,status=None,error=None,provider=None,model=None):
    with db.connection() as c:
        row=c.execute('SELECT status FROM assistant_jobs WHERE id=%s FOR UPDATE',(job['id'],)).fetchone()
        if not row or row['status']=='cancelled':return
        c.execute('''UPDATE assistant_jobs SET answer=COALESCE(%s,answer),status=COALESCE(%s,status),error=COALESCE(%s,error),
                     provider=COALESCE(%s,provider),model=COALESCE(%s,model),updated_at=now() WHERE id=%s''',(text,status,error,provider,model,job['id']))
        if kind=='assistant.tool' and payload.get('status')!='running':
            from psycopg.types.json import Jsonb
            from fastapi.encoders import jsonable_encoder
            c.execute('UPDATE assistant_jobs SET tools=tools||%s::jsonb WHERE id=%s',(Jsonb([jsonable_encoder(payload)]),job['id']))
        eventbus.publish(kind,job['id'],{'job_id':str(job['id']),**payload},user_id=job['user_id'],conn=c)

async def generate(job):
    user=await asyncio.to_thread(db.one,'SELECT u.id,u.email,p.name,p.language,p.region,p.onboarded FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.id=%s',(job['user_id'],))
    if job['field_id']:await asyncio.to_thread(field_access,user['id'],job['field_id'])
    answer='';pending='';last=time.monotonic();request=JobRequest(job['id'])
    async for event in stream_answer(user,job['question'],job['field_id'],request):
        kind=event['type']
        if kind=='token':
            chunk=event['text'];answer+=chunk;pending+=chunk
            if len(pending)<48 and time.monotonic()-last<.08 and answer!=chunk:continue
            await asyncio.to_thread(update_event,job,'assistant.token',{'text':pending},text=answer)
            pending='';last=time.monotonic()
        else:
            if pending:
                await asyncio.to_thread(update_event,job,'assistant.token',{'text':pending},text=answer);pending=''
            if kind=='meta':await asyncio.to_thread(update_event,job,'assistant.started',{'status':'running','provider':event['provider'],'model':event['model'],'message':'Модель готовит ответ…'},provider=event['provider'],model=event['model'])
            elif kind=='tool':await asyncio.to_thread(update_event,job,'assistant.tool',event)
            elif kind=='done':await asyncio.to_thread(update_event,job,'assistant.completed',{**event,'status':'completed'},text=answer,status='completed')
            elif kind=='error':await asyncio.to_thread(update_event,job,'assistant.error',event,error=event['message'],status='failed')

async def run_job(job):
    task=asyncio.create_task(generate(job))
    started=time.monotonic()
    try:
        while not task.done():
            await asyncio.sleep(.3)
            cancelled=await JobRequest(job['id']).is_disconnected()
            if cancelled:task.cancel();break
            if time.monotonic()-started>180:
                task.cancel()
                await asyncio.to_thread(update_event,job,'assistant.error',{'message':'AI отвечает слишком долго. Повторите запрос.'},status='failed',error='generation_timeout')
                break
        await task
    except asyncio.CancelledError:
        task.cancel()
        await asyncio.gather(task,return_exceptions=True)
        if asyncio.current_task().cancelling():raise
    except Exception:
        await asyncio.to_thread(update_event,job,'assistant.error',{'message':'AI временно недоступен. Данные поля и прогноз продолжают работать.'},status='failed',error='generation_failed')

def claim_job():
    with db.connection() as c:
        job=c.execute("SELECT * FROM assistant_jobs WHERE status='queued' AND NOT cancel_requested ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1").fetchone()
        if job:c.execute("UPDATE assistant_jobs SET status='running',updated_at=now() WHERE id=%s",(job['id'],))
        return job

async def worker():
    # Single API worker deployment. Interrupted generations are visible and retryable;
    # never silently replay a tool operation after process restart.
    recover=True
    while True:
        try:
            if recover:
                stale=await asyncio.to_thread(db.rows,"SELECT * FROM assistant_jobs WHERE status='running'")
                for job in stale:
                    await asyncio.to_thread(update_event,job,'assistant.error',{'message':'Обработка была прервана. Повторите запрос.'},status='failed',error='worker_interrupted')
                recover=False
            job=await asyncio.to_thread(claim_job)
            if job:await run_job(job)
            else:await asyncio.sleep(.3)
        except asyncio.CancelledError:raise
        except Exception:
            logging.exception('Assistant worker temporarily unavailable')
            recover=True
            await asyncio.sleep(2)
