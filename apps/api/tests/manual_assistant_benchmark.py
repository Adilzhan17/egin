"""Live local-provider smoke benchmark. Not part of deterministic pytest tests.

Run inside core: python tests/manual_assistant_benchmark.py
Exact user questions: python tests/manual_assistant_benchmark.py --requested-questions
Only the exact field-list recheck: add --case fields
Uses the labelled demo account and records actual jobs, SSE events and timings.
"""
import argparse
import json
import os
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
import httpx

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--requested-questions',action='store_true',help='Run the six exact user questions and preserve the original benchmark artifact.')
parser.add_argument('--case',choices=['fields'],help='Recheck only the exact field-list question in a separate artifact; requires --requested-questions.')
args=parser.parse_args()
if args.case and not args.requested_questions:parser.error('--case requires --requested-questions')

def save_report(target,report):
    target.parent.mkdir(parents=True,exist_ok=True)
    temporary=None
    try:
        with tempfile.NamedTemporaryFile(mode='w',encoding='utf-8',dir=target.parent,prefix=target.name+'.',suffix='.tmp',delete=False) as file:
            temporary=Path(file.name)
            json.dump(report,file,ensure_ascii=False,indent=2)
            file.flush();os.fsync(file.fileno())
        temporary.chmod(0o644)
        os.replace(temporary,target)
    finally:
        if temporary is not None:temporary.unlink(missing_ok=True)

client=httpx.Client(base_url='http://127.0.0.1:8000',timeout=210)
client.post('/auth/login',json={'email':'demo@egin.local','password':'EginDemo2026!'}).raise_for_status()
fields=client.get('/fields').json()
field=next(f for f in fields if f['name']=='Северное' and abs(f['lon']-69.4)<.1)
questions=[('weather','Какая погода сегодня на выбранном поле? Ответь кратко по-русски.'),
           ('rain','Будет ли дождь завтра на этом поле? Ответь кратко по-русски.'),
           ('planting','Что посадить на этом поле? Используй погоду, почву и сохранённый анализ. Ответь кратко.'),
           ('followup','Почему ты рекомендуешь именно это? Объясни кратко по данным поля.'),
           ('machinery','Найди трактор рядом с выбранным полем. Укажи расстояние и пометь демо.'),
           ('fields','Покажи мои поля и их площади кратко по-русски.')]
if args.requested_questions:
    questions=[('weather','Какая завтра погода на поле Северное?'),
               ('rain','Когда будет дождь?'),
               ('planting','Что лучше посадить?'),
               ('followup','Почему?'),
               ('machinery','Найди трактор рядом'),
               ('fields','Какие у меня поля?')]
if args.case:questions=[item for item in questions if item[0]==args.case]
report={'at':datetime.now(timezone.utc).isoformat(),'mode':'requested_fields_recheck' if args.case else 'requested_questions' if args.requested_questions else 'original','provider':client.get('/assistant/provider').json(),'field_id':field['id'],'field_name':field['name'],'results':[]}
target=Path('/workspace/artifacts')/('assistant-requested-fields-recheck.json' if args.case else 'assistant-requested-questions.json' if args.requested_questions else 'assistant-fast-benchmark.json')
for key,question in questions:
    cursor=client.get('/bootstrap').json()['event_cursor'];started=time.perf_counter()
    response=client.post('/assistant/messages',json={'question':question,'field_id':field['id'],'client_id':str(uuid4())})
    response.raise_for_status();job=response.json()['id']
    result={'case':key,'question':question,'job_id':job,'accepted_ms':round((time.perf_counter()-started)*1000,2),'events':[],'tools':[],'first_token_ms':None}
    try:
        with client.stream('GET','/events',params={'after':cursor}) as stream:
            stream.raise_for_status()
            for line in stream.iter_lines():
                if not line.startswith('data: '):continue
                event=json.loads(line[6:]);payload=event.get('payload',{})
                if payload.get('job_id')!=job:continue
                elapsed=round((time.perf_counter()-started)*1000,2)
                result['events'].append({'type':event['type'],'ms':elapsed})
                if event['type']=='assistant.token' and result['first_token_ms'] is None:result['first_token_ms']=elapsed
                if event['type']=='assistant.tool' and payload.get('result') is not None:result['tools'].append({'name':payload.get('name'),'origin':payload.get('origin'),'result':payload['result']})
                if event['type'] in ('assistant.completed','assistant.error'):
                    result['terminal_event']=event['type'];result['duration_ms']=elapsed;break
        state=client.get('/assistant/messages/'+job).json()
        result.update(status=state['status'],answer=state['answer'],error=state.get('error'))
    except Exception as exc:
        result.update(status='benchmark_error',error=type(exc).__name__)
        client.post('/assistant/messages/'+job+'/cancel')
    report['results'].append(result)
    save_report(target,report)
    print(json.dumps({k:v for k,v in result.items() if k not in ('events','tools','question')},ensure_ascii=False),flush=True)
client.close()
