import asyncio
from uuid import UUID
from fastapi import APIRouter,WebSocket,WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from .auth import current_user,conversation_access
from .realtime import broker
from . import db
import os
router=APIRouter()
@router.websocket('/ws/conversations/{id}')
async def conversation_socket(websocket:WebSocket,id:UUID):
    try:
        origin=websocket.headers.get('origin')
        if origin and origin not in {os.getenv('WEB_ORIGIN','http://localhost:3000'),os.getenv('API_ORIGIN','http://localhost:8000')}:raise ValueError('origin')
        user=current_user(websocket);conversation_access(user['id'],id)
        after=max(0,int(websocket.query_params.get('after','0')))
    except Exception:await websocket.close(code=1008);return
    await websocket.accept();await websocket.send_json({'type':'ready'})
    try:
        while True:
            current_user(websocket);conversation_access(user['id'],id)
            event=broker.events[str(id)]
            messages=db.rows('SELECT m.*,p.name FROM messages m JOIN profiles p ON p.user_id=m.user_id WHERE conversation_id=%s AND m.id>%s ORDER BY m.id LIMIT 100',(id,after))
            for message in messages:
                await websocket.send_json({'type':'message','message':jsonable_encoder(message)});after=message['id']
            if len(messages)==100:continue
            try:await asyncio.wait_for(event.wait(),timeout=10)
            except asyncio.TimeoutError:await websocket.send_json({'type':'heartbeat'})
    except (WebSocketDisconnect,RuntimeError):pass
    except Exception:
        try:await websocket.close(code=1008)
        except Exception:pass
