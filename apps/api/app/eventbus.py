"""PostgreSQL is the replay log; LISTEN/NOTIFY only wakes connected readers."""
import asyncio
import json
import os
import logging
import psycopg
from fastapi.encoders import jsonable_encoder
from psycopg.types.json import Jsonb
from . import db

_wake = asyncio.Event()
VISIBLE = """(e.scope_kind='public' OR (e.scope_kind='user' AND e.scope_id=%s)
 OR (e.scope_kind='organization' AND EXISTS(SELECT 1 FROM organization_members om WHERE om.organization_id=e.scope_id AND om.user_id=%s))
 OR (e.scope_kind='conversation' AND EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id=e.scope_id AND cm.user_id=%s)))"""

def publish(kind, entity_id, payload, *, user_id=None, organization_id=None, conversation_id=None, conn=None):
    scope, owner = ('user', user_id) if user_id else ('organization', organization_id) if organization_id else ('conversation', conversation_id) if conversation_id else ('public', None)
    params = (kind, str(entity_id), scope, owner, Jsonb(jsonable_encoder(payload)))
    if conn:
        return conn.execute('SELECT egin_event(%s,%s,%s,%s,%s) AS id', params).fetchone()['id']
    return db.one('SELECT egin_event(%s,%s,%s,%s,%s) AS id', params)['id']

def cursor(conn=None):
    sql = 'SELECT GREATEST(COALESCE((SELECT max(id) FROM realtime_events),0),(SELECT floor_id FROM realtime_retention WHERE singleton)) AS id'
    return (conn.execute(sql).fetchone() if conn else db.one(sql))['id']

def replay(user_id, after, limit=100):
    # Revalidate deletion against the same committed snapshot as replay. This also
    # protects old events and a reply snapshot captured concurrently with deletion.
    rows=db.rows('''WITH visible AS (SELECT e.* FROM realtime_events e WHERE e.id>%s AND '''+VISIBLE+''' ORDER BY e.id LIMIT %s)
      SELECT e.*,m.deleted_at AS _message_deleted_at,m.version AS _message_version,reply.deleted_at AS _reply_deleted_at
      FROM visible e
      LEFT JOIN messages m ON m.id=CASE WHEN jsonb_typeof(e.payload#>'{message,id}')='number' THEN (e.payload#>>'{message,id}')::bigint END
      LEFT JOIN messages reply ON reply.id=CASE WHEN jsonb_typeof(e.payload#>'{message,reply_preview,id}')='number' THEN (e.payload#>>'{message,reply_preview,id}')::bigint END
      ORDER BY e.id''',(after,user_id,user_id,user_id,limit))
    for row in rows:
        deleted=row.pop('_message_deleted_at');version=row.pop('_message_version');reply_deleted=row.pop('_reply_deleted_at')
        message=row['payload'].get('message')
        if not isinstance(message,dict):continue
        if deleted:message.update(body='',attachments=[],field_card=None,reactions=[],reply_preview=None,deleted_at=deleted.isoformat(),version=version)
        elif reply_deleted and isinstance(message.get('reply_preview'),dict):
            message['reply_preview'].update(body='',deleted_at=reply_deleted.isoformat())
    return rows

def redact_message(conn,conversation_id,message_id,deleted_at,version):
    """Erase retained content atomically with the tombstone, preserving event ids."""
    conn.execute('SELECT pg_advisory_xact_lock(614882029154)')
    tombstone=Jsonb(jsonable_encoder({'body':'','attachments':[],'field_card':None,'reactions':[],'reply_preview':None,'deleted_at':deleted_at,'version':version}))
    conn.execute('''UPDATE realtime_events SET payload=jsonb_set(payload,'{message}',(payload->'message')||%s)
      WHERE scope_kind='conversation' AND scope_id=%s AND entity_id=%s AND jsonb_typeof(payload->'message')='object' ''',(tombstone,conversation_id,str(message_id)))
    quote=Jsonb(jsonable_encoder({'body':'','deleted_at':deleted_at}))
    conn.execute('''UPDATE realtime_events SET payload=jsonb_set(payload,'{message,reply_preview}',(payload#>'{message,reply_preview}')||%s)
      WHERE scope_kind='conversation' AND scope_id=%s AND payload#>>'{message,reply_preview,id}'=%s''',(quote,conversation_id,str(message_id)))

def envelope(row):
    return {'id':str(row['id']), 'type':row['type'], 'timestamp':row['created_at'].isoformat(),
            'entityId':row['entity_id'], 'version':str(row['id']), 'payload':row['payload']}

def encode(event):
    return 'id: '+str(event['id'])+'\ndata: '+json.dumps(jsonable_encoder(event), ensure_ascii=False, separators=(',', ':'))+'\n\n'

def signal():
    global _wake
    _wake.set()
    _wake = asyncio.Event()

def wake_event():
    return _wake

async def listen():
    """One dedicated lightweight DB connection, shared by all SSE clients."""
    while True:
        try:
            async with await psycopg.AsyncConnection.connect(os.environ['DATABASE_URL'], autocommit=True) as conn:
                await conn.execute('LISTEN egin_events')
                signal()
                async for _ in conn.notifies():
                    signal()
        except asyncio.CancelledError:
            raise
        except Exception:
            signal()
            await asyncio.sleep(1)

def prune():
    """Retention is explicit, so old cursors request a fresh authorized snapshot."""
    with db.connection() as conn:
        conn.execute('SELECT pg_advisory_xact_lock(614882029154)')
        row=conn.execute("DELETE FROM realtime_events WHERE created_at<now()-interval '7 days' RETURNING id").fetchall()
        if row:
            conn.execute('UPDATE realtime_retention SET floor_id=GREATEST(floor_id,%s)',(max(r['id'] for r in row),))

async def housekeeping():
    while True:
        try:
            await asyncio.to_thread(prune)
            await asyncio.sleep(3600)
        except asyncio.CancelledError:raise
        except Exception:
            logging.exception('Event retention temporarily unavailable')
            await asyncio.sleep(30)
