import asyncio
import io
import json
import time
from uuid import UUID,uuid4
import pytest
from fastapi import HTTPException, Response

def as_user(client,email):
    from app import db
    from app.auth import issue_session,COOKIE
    user=db.one('SELECT id FROM users WHERE email=%s',(email,))
    response=Response();issue_session(response,user['id'])
    value=response.headers['set-cookie'].split(';',1)[0].split('=',1)[1]
    client.cookies.clear();client.cookies.set(COOKIE,value)
    return user['id']

@pytest.fixture
def demo(client):
    # Login/rate limiting have their own integration tests. Each extra feature test
    # gets a real DB-backed session without consuming the shared IP login budget.
    as_user(client,'demo@egin.local')
    return client

def test_bootstrap_is_compact_private_and_consistent(demo):
    from app import db,eventbus
    response=demo.get('/bootstrap');assert response.status_code==200
    assert response.headers.get('content-encoding')=='gzip'
    assert int(response.headers['content-length'])<len(response.content)
    snapshot=response.json()
    assert snapshot['schema_version']==1 and snapshot['fields'] and snapshot['conversations']
    assert int(snapshot['event_cursor'])<=eventbus.cursor()
    assert all('geometry' not in row for row in snapshot['fields'])
    assert not any(key in response.text for key in ('password_hash','token_hash','raw_provider','SESSION_SECRET'))
    own_ids={row['id'] for row in snapshot['fields']}
    as_user(demo,'aliya@egin.local')
    assert not own_ids.intersection(row['id'] for row in demo.get('/bootstrap').json()['fields'])
    assert demo.get('/bootstrap',params={'field_id':next(iter(own_ids))}).status_code==403

def test_events_are_transactional_ordered_and_reauthorize(demo):
    from app import db,eventbus
    user=demo.get('/auth/me').json();start=eventbus.cursor()
    foreign=db.one("SELECT id FROM users WHERE email='aliya@egin.local'")['id']
    private=eventbus.publish('notification.created',uuid4(),{'title':'private'},user_id=foreign)
    own=eventbus.publish('notification.created',uuid4(),{'title':'own'},user_id=user['id'])
    assert private<own
    visible=eventbus.replay(user['id'],start)
    assert [r['payload']['title'] for r in visible]==['own']
    with pytest.raises(RuntimeError):
        with db.connection() as c:
            eventbus.publish('notification.created',uuid4(),{'title':'rolledback'},user_id=user['id'],conn=c)
            raise RuntimeError('rollback')
    assert all(r['payload'].get('title')!='rolledback' for r in eventbus.replay(user['id'],start))
    room=demo.post('/conversations',json={'title':'Event ACL','kind':'group','member_ids':[str(foreign)]}).json()['id']
    protected=eventbus.publish('message.created','123',{'conversation_id':room},conversation_id=room)
    assert any(r['id']==protected for r in eventbus.replay(foreign,start))
    db.execute('DELETE FROM conversation_members WHERE conversation_id=%s AND user_id=%s',(room,foreign))
    assert not any(r['id']==protected for r in eventbus.replay(foreign,start))

def test_event_stream_gap_and_last_event_id(demo):
    from app import db,eventbus
    from app.routes_runtime import events
    user=demo.get('/auth/me').json()
    class Request:
        headers={'last-event-id':'0'}
        cookies=dict(demo.cookies)
        async def is_disconnected(self):return False
    floor=db.one('SELECT floor_id FROM realtime_retention')['floor_id']
    db.execute('UPDATE realtime_retention SET floor_id=1')
    async def consume():
        response=await events(Request(),after=str(eventbus.cursor()),user=user)
        assert response.headers['x-accel-buffering']=='no'
        result=[]
        async for chunk in response.body_iterator:result.append(chunk)
        return ''.join(result)
    try:
        body=asyncio.run(consume());assert 'resync.required' in body and 'replay_gap' in body
    finally:db.execute('UPDATE realtime_retention SET floor_id=%s',(floor,))
    assert demo.get('/events?after=-1').status_code==422
    assert demo.get('/events?after=bad').status_code==422

def test_event_cursor_remains_monotonic_after_all_events_expire(demo):
    from app import db,eventbus
    # Transaction-local removal leaves other test data and events unchanged.
    with db.connection() as c:
        c.execute('SAVEPOINT retention_test')
        high=eventbus.cursor(c)
        c.execute('DELETE FROM realtime_events')
        c.execute('UPDATE realtime_retention SET floor_id=%s',(high,))
        assert eventbus.cursor(c)==high
        c.execute('ROLLBACK TO SAVEPOINT retention_test')

def test_offline_notes_retry_does_not_duplicate(demo):
    f=demo.get('/fields').json()[0]['id'];client_id=str(uuid4())
    body={'body':'Offline observation','client_id':client_id}
    one=demo.post('/fields/'+f+'/notes',json=body)
    two=demo.post('/fields/'+f+'/notes',json=body)
    assert one.status_code==two.status_code==201 and one.json()['id']==two.json()['id']
    assert demo.post('/fields/'+f+'/notes',json={**body,'body':'Different note'}).status_code==409

def test_chat_reply_edit_reactions_delete_and_permissions(demo):
    from app import db,eventbus
    alice=demo.get('/auth/me').json()['id'];bob=db.one("SELECT id FROM users WHERE email='aliya@egin.local'")['id']
    room=demo.post('/conversations',json={'title':'Chat features','kind':'group','member_ids':[str(bob)]}).json()['id']
    path='/conversations/'+room+'/messages';cursor=eventbus.cursor()
    body={'body':'First message','client_id':str(uuid4())}
    first=demo.post(path,json=body);assert first.status_code==201
    m=first.json();assert demo.post(path,json=body).json()['id']==m['id']
    reply=demo.post(path,json={'body':'Reply','client_id':str(uuid4()),'reply_to_id':m['id']}).json()
    assert reply['reply_preview']['body']=='First message'
    edited=demo.patch(path+'/'+str(m['id']),json={'body':'Edited','version':m['version']});assert edited.status_code==200
    assert demo.patch(path+'/'+str(m['id']),json={'body':'Race','version':m['version']}).status_code==409
    as_user(demo,'aliya@egin.local')
    assert demo.patch(path+'/'+str(m['id']),json={'body':'Not yours','version':2}).status_code==403
    reaction=demo.put(path+'/'+str(m['id'])+'/reactions',json={'emoji':'👍'});assert reaction.status_code==200
    assert reaction.json()['reactions'][0]['count']==1
    assert demo.put(path+'/'+str(m['id'])+'/reactions',json={'emoji':'👍'}).json()['reactions'][0]['count']==1
    assert demo.post('/conversations/'+room+'/read',json={'last_read_id':reply['id']}).status_code==200
    assert demo.post('/conversations/'+room+'/typing',json={'typing':True}).status_code==200
    assert demo.post('/presence').status_code==200
    member=next(p for p in demo.get('/conversations/'+room+'/members').json() if p['id']==str(bob))
    assert member['online'] and member['last_read_id']==reply['id'] and member['typing_until']
    as_user(demo,'serik@egin.local');assert demo.get(path).status_code==403
    as_user(demo,'demo@egin.local')
    deleted=demo.delete(path+'/'+str(m['id']));assert deleted.status_code==200 and deleted.json()['body']==''
    rows=demo.get(path).json();assert next(x for x in rows if x['id']==reply['id'])['reply_preview']['body']==''
    events=eventbus.replay(alice,cursor,100)
    assert {'message.created','message.edited','message.reaction','message.read','message.deleted','chat.typing','presence.updated'} <= {e['type'] for e in events}
    assert len([e for e in events if e['type']=='message.created' and e['entity_id']==str(m['id'])])==1

def test_chat_private_media_share_forward(demo):
    from app import db
    from PIL import Image
    bob=db.one("SELECT id FROM users WHERE email='aliya@egin.local'")['id']
    room=demo.post('/conversations',json={'title':'Media','kind':'group','member_ids':[str(bob)]}).json()['id']
    path='/conversations/'+room
    buffer=io.BytesIO();Image.new('RGB',(20,20),'green').save(buffer,'PNG')
    upload=demo.post(path+'/attachments',files={'file':('field.png',buffer.getvalue(),'image/png')})
    assert upload.status_code==201;attachment=upload.json();assert attachment['kind']=='image'
    assert demo.get(attachment['url'].removeprefix('/api')).status_code==200
    row=db.one('SELECT storage_name FROM chat_attachments WHERE id=%s',(attachment['id'],))
    assert demo.get('/uploads/.private-chat/'+row['storage_name']).status_code==404
    field=demo.get('/fields').json()[0]
    message=demo.post(path+'/messages',json={'body':'Посмотрите поле','client_id':str(uuid4()),'attachments':[attachment['id']],'field_id':field['id']})
    assert message.status_code==201 and message.json()['field_card']['name']==field['name']
    assert message.json()['attachments'][0]['id']==attachment['id']
    another=demo.post('/conversations',json={'title':'Forward','kind':'group','member_ids':[str(bob)]}).json()['id']
    forwarded=demo.post('/conversations/'+another+'/messages',json={'body':'Forward','client_id':str(uuid4()),'forward_message_id':message.json()['id']})
    assert forwarded.status_code==201 and forwarded.json()['forwarded_from']==message.json()['id']
    as_user(demo,'serik@egin.local');assert demo.get(attachment['url'].removeprefix('/api')).status_code==403
    as_user(demo,'demo@egin.local')
    assert demo.post(path+'/attachments',files={'file':('evil.html',b'<script>alert(1)</script>','text/html')}).status_code==415

def test_deleted_chat_content_is_erased_from_replay_and_live_tombstone(demo):
    from app import db,eventbus
    from app.routes_runtime import events
    user=demo.get('/auth/me').json();foreign=db.one("SELECT id FROM users WHERE email='serik@egin.local'")['id']
    room=demo.post('/conversations',json={'title':'Deletion privacy','kind':'group','member_ids':[user['id']]}).json()['id']
    path='/conversations/'+room+'/messages';start=eventbus.cursor()
    field=demo.get('/fields').json()[0]
    upload=demo.post('/conversations/'+room+'/attachments',files={'file':('private.txt',b'private attachment','text/plain')}).json()
    original=demo.post(path,json={'body':'PRIVATE_ORIGINAL','client_id':str(uuid4()),'field_id':field['id'],'attachments':[upload['id']]}).json()
    reply=demo.post(path,json={'body':'Visible reply','client_id':str(uuid4()),'reply_to_id':original['id']}).json()
    demo.patch(path+'/'+str(original['id']),json={'body':'PRIVATE_EDIT','version':original['version']})
    before_delete=eventbus.cursor()
    class Request:
        headers={}
        cookies=dict(demo.cookies)
        async def is_disconnected(self):return False
    async def consume_live_delete():
        response=await events(Request(),after=str(before_delete),user=user)
        stream=response.body_iterator
        assert ': connected' in await anext(stream)
        deleted=await asyncio.to_thread(demo.delete,path+'/'+str(original['id']))
        assert deleted.status_code==200
        try:
            frame=await asyncio.wait_for(anext(stream),2)
            payload=json.loads(next(line[6:] for line in frame.splitlines() if line.startswith('data: ')))
            assert payload['type']=='message.deleted' and payload['payload']['message']['body']==''
        finally:await stream.aclose()
    asyncio.run(consume_live_delete())
    # Old creation/edit snapshots and quoted previews cannot disclose deleted data.
    replay=eventbus.replay(user['id'],start)
    retained=db.rows('SELECT * FROM realtime_events WHERE id>%s AND scope_id=%s ORDER BY id',(start,room))
    for rows in (replay,retained):
        assert not any(value in json.dumps([r['payload'] for r in rows],default=str) for value in ('PRIVATE_ORIGINAL','PRIVATE_EDIT'))
        for event in rows:
            message=event['payload'].get('message',{})
            if message.get('id')==original['id']:
                assert message['body']=='' and message['field_card'] is None and message['attachments']==[] and message['deleted_at']
            if message.get('id')==reply['id']:
                assert message['reply_preview']['body']=='' and message['reply_preview']['deleted_at']
    assert demo.get(upload['url'].removeprefix('/api')).status_code==404
    assert not any(r['scope_id']==UUID(room) for r in eventbus.replay(foreign,start))
    # Legacy or concurrently captured stale payloads are redacted on read as well.
    eventbus.publish('message.created',original['id'],{'conversation_id':room,'message':original},conversation_id=room)
    eventbus.publish('message.created',reply['id'],{'conversation_id':room,'message':reply},conversation_id=room)
    assert not any(value in json.dumps([r['payload'] for r in eventbus.replay(user['id'],start)],default=str) for value in ('PRIVATE_ORIGINAL','PRIVATE_EDIT'))

def test_chat_delete_redaction_and_tombstone_roll_back_together(demo,monkeypatch):
    from app import db,eventbus
    room=demo.post('/conversations',json={'title':'Atomic deletion','kind':'group','member_ids':[demo.get('/auth/me').json()['id']]}).json()['id']
    path='/conversations/'+room+'/messages'
    original=demo.post(path,json={'body':'Preserved on failure','client_id':str(uuid4())}).json()
    publish=eventbus.publish
    def fail_tombstone(kind,*args,**kwargs):
        if kind=='message.deleted':raise RuntimeError('simulated event failure')
        return publish(kind,*args,**kwargs)
    monkeypatch.setattr(eventbus,'publish',fail_tombstone)
    with pytest.raises(RuntimeError,match='simulated event failure'):demo.delete(path+'/'+str(original['id']))
    message=next(m for m in demo.get(path).json() if m['id']==original['id'])
    assert message['body']=='Preserved on failure' and message['deleted_at'] is None
    rows=db.rows('SELECT payload,type FROM realtime_events WHERE scope_id=%s AND entity_id=%s',(room,str(original['id'])))
    assert len(rows)==1 and rows[0]['type']=='message.created' and rows[0]['payload']['message']['body']=='Preserved on failure'

def test_assistant_job_survives_request_and_emits_private_tokens(demo,monkeypatch):
    from app import db,eventbus
    from app.assistant import service
    class Provider:
        name='protocol_test'
        async def stream(self,messages,tools,model):
            yield {'text':'Первый '};await asyncio.sleep(.05);yield {'text':'ответ'}
    monkeypatch.setattr(service,'get_provider',lambda:(Provider(),'test-model'))
    user=demo.get('/auth/me').json();cursor=eventbus.cursor();body={'question':'Привет','client_id':str(uuid4())}
    response=demo.post('/assistant/messages',json=body);assert response.status_code==202
    job=response.json()['id'];assert demo.post('/assistant/messages',json=body).json()['id']==job
    for _ in range(100):
        row=demo.get('/assistant/messages/'+job).json()
        if row['status'] in ('completed','failed'):break
        time.sleep(.03)
    assert row['status']=='completed' and row['answer']=='Первый ответ'
    events=eventbus.replay(user['id'],cursor,100)
    assert {'assistant.started','assistant.token','assistant.completed'} <= {event['type'] for event in events}
    completed=next(event for event in events if event['type']=='assistant.completed' and event['entity_id']==job)
    history=db.one('SELECT created_at FROM assistant_history WHERE user_id=%s AND question=%s ORDER BY id DESC LIMIT 1',(user['id'],body['question']))
    assert history['created_at']<=completed['created_at'], 'Completion must not race the history refresh'
    foreign=as_user(demo,'aliya@egin.local')
    assert demo.get('/assistant/messages/'+job).status_code==404
    assert demo.post('/assistant/messages/'+job+'/cancel').status_code==404
    assert not any(event['entity_id']==job for event in eventbus.replay(foreign,cursor,100))

def test_assistant_rain_grounding_planting_and_memory(demo,monkeypatch):
    from app.assistant import service
    field=demo.get('/fields').json()[0]['id'];calls=[];seen=[]
    class Provider:
        name='protocol_test'
        async def stream(self,messages,tools,model):
            seen.append(messages.copy())
            yield {'text':'Объяснение по проверенным данным.'}
    async def execute(name,args,user,selected):
        calls.append(name)
        if name=='get_field':return {'id':selected,'name':'Северное'}
        return {'source':'TEST_ONLY','value':42,'status':'fresh'}
    monkeypatch.setattr(service,'get_provider',lambda:(Provider(),'test-model'))
    monkeypatch.setattr(service,'execute',execute)
    result=demo.post('/assistant/stream',json={'question':'Будет ли дождь?','field_id':field})
    events=[json.loads(line[6:]) for line in result.text.splitlines() if line.startswith('data: ')]
    weather_index=next(i for i,e in enumerate(events) if e['type']=='tool' and e.get('name')=='get_field_weather' and e.get('status')=='completed')
    assert all(e['type']!='token' for e in events[:weather_index])
    assert events[-1]['type']=='done' and 'get_field_weather' in calls
    calls.clear()
    planted=demo.post('/assistant/stream',json={'question':'Что посадить?','field_id':field})
    assert '"type": "done"' in planted.text
    assert {'get_field_weather','get_field_soil','get_field_analysis'}<=set(calls)
    demo.post('/assistant/stream',json={'question':'Почему?','field_id':field})
    assert any(m['role']=='user' and m['content']=='Что посадить?' for m in seen[-1])
    assert any('TEST_ONLY' in m.get('content','') for m in seen[-1])

def test_assistant_spatial_and_new_tools_enforce_access(demo):
    from app.assistant.tools import execute
    from app import db
    user=demo.get('/auth/me').json();field=next(f for f in demo.get('/fields').json() if abs(f['lon']-69.4)<.1)
    result=asyncio.run(execute('search_machinery',{'nearby':True,'radius_km':20},user,field['id']))
    assert result['items'] and all(0<=float(item['distance_km'])<=20 for item in result['items'])
    sensor=asyncio.run(execute('get_sensor_data',{},user,field['id']));assert sensor['status']=='unavailable'
    rows=asyncio.run(execute('get_community_messages',{},user,None));assert rows and all(row['body'] for row in rows)
    foreign=db.one("SELECT f.id FROM fields f JOIN farms fa ON fa.id=f.farm_id JOIN organization_members om ON om.organization_id=fa.organization_id JOIN users u ON u.id=om.user_id WHERE u.email='aliya@egin.local' LIMIT 1")['id']
    with pytest.raises(HTTPException):asyncio.run(execute('search_machinery',{'nearby':True,'field_id':str(foreign)},user,field['id']))

def test_exact_user_field_question_forces_real_authorized_tool_before_tokens(demo,monkeypatch):
    from app.assistant import service
    fields=demo.get('/fields').json();seen=[]
    class Provider:
        name='protocol_test'
        async def stream(self,messages,tools,model):
            seen.append((messages,tools))
            # No model tool call: the user intent must already fetch the list.
            yield {'text':'Получен список полей.'}
    monkeypatch.setattr(service,'get_provider',lambda:(Provider(),'test-model'))
    response=demo.post('/assistant/stream',json={'question':'Какие у меня поля?','field_id':fields[0]['id']})
    events=[json.loads(line[6:]) for line in response.text.splitlines() if line.startswith('data: ')]
    index,tool=next((index,event) for index,event in enumerate(events) if event['type']=='tool' and event.get('name')=='get_fields' and event.get('status')=='completed')
    assert tool['origin']=='policy' and {row['id'] for row in tool['result']}=={row['id'] for row in fields}
    assert all(event['type']!='token' for event in events[:index])
    assert any('get_fields' in message['content'] for message in seen[0][0])
    assert seen[0][1]==[] and events[-1]['type']=='done'

def test_assistant_job_cancel_stops_provider(demo,monkeypatch):
    from app.assistant import service
    stopped=[];started=[]
    class Provider:
        name='protocol_test'
        async def stream(self,messages,tools,model):
            started.append(True)
            try:
                yield {'text':'Начало'}
                await asyncio.sleep(30)
                yield {'text':'НЕ ДОЛЖНО ПОЯВИТЬСЯ'}
            finally:stopped.append(True)
    monkeypatch.setattr(service,'get_provider',lambda:(Provider(),'test-model'))
    job=demo.post('/assistant/messages',json={'question':'Cancel this','client_id':str(uuid4())}).json()['id']
    for _ in range(100):
        if started:break
        time.sleep(.02)
    assert started
    assert demo.post('/assistant/messages/'+job+'/cancel').json()['status']=='cancelled'
    for _ in range(100):
        if stopped:break
        time.sleep(.02)
    assert stopped
    row=demo.get('/assistant/messages/'+job).json()
    assert row['status']=='cancelled' and 'НЕ ДОЛЖНО' not in row['answer']

def test_assistant_worker_recovers_after_transient_database_failure(demo,monkeypatch):
    from app.assistant import jobs,service
    original=jobs.claim_job;attempts=[]
    def intermittent_claim():
        attempts.append(True)
        if len(attempts)==1:raise RuntimeError('simulated transient database failure')
        return original()
    class Provider:
        name='protocol_test'
        async def stream(self,messages,tools,model):yield {'text':'Восстановлено'}
    monkeypatch.setattr(jobs,'claim_job',intermittent_claim)
    monkeypatch.setattr(service,'get_provider',lambda:(Provider(),'test-model'))
    job=demo.post('/assistant/messages',json={'question':'Recover worker','client_id':str(uuid4())}).json()['id']
    for _ in range(150):
        state=demo.get('/assistant/messages/'+job).json()
        if state['status']=='completed':break
        time.sleep(.03)
    assert len(attempts)>1 and state['status']=='completed' and state['answer']=='Восстановлено'

def test_concurrent_message_edits_do_not_exhaust_connection_pool(demo,monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from app import routes_chat
    room=demo.get('/conversations').json()[0]['id'];path='/conversations/'+room+'/messages'
    messages=[demo.post(path,json={'body':'Concurrent original','client_id':str(uuid4())}).json() for _ in range(6)]
    barrier=Barrier(6);original=routes_chat.owned_message
    def simultaneous(c,id,message_id,user):
        # All six pooled connections are held here. Authorization must use c,
        # not attempt to borrow a seventh connection and deadlock the pool.
        barrier.wait(timeout=10)
        return original(c,id,message_id,user)
    monkeypatch.setattr(routes_chat,'owned_message',simultaneous)
    def edit(message):return demo.patch(path+'/'+str(message['id']),json={'body':'Concurrent edited','version':message['version']})
    with ThreadPoolExecutor(max_workers=6) as executor:responses=list(executor.map(edit,messages))
    assert all(response.status_code==200 and response.json()['body']=='Concurrent edited' for response in responses)
