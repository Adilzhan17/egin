import json,os
import httpx
from fastapi import APIRouter,Depends,Request
from fastapi.responses import StreamingResponse
from fastapi.encoders import jsonable_encoder
from ..auth import current_user,field_access,rate_limit
from ..schemas import AssistantInput
from .providers import configuration
from .service import stream_answer
router=APIRouter()
@router.get('/assistant/provider')
async def status(user=Depends(current_user)):
    provider,model=configuration();configured=bool(os.getenv('GEMINI_API_KEY')) if provider=='gemini' else bool(os.getenv('OLLAMA_URL')) if provider=='ollama' else bool(os.getenv('LLM_BASE_URL')) if provider=='openai_compatible' else False
    available=False
    if configured and provider=='ollama':
        try:
            async with httpx.AsyncClient(timeout=3) as client:
                r=await client.get(os.getenv('OLLAMA_URL').rstrip('/')+'/api/tags');available=any(m['name']==model for m in r.json().get('models',[]))
        except Exception:pass
    return {'provider':provider or None,'model':model or 'auto Flash','configured':configured,'available':available if provider=='ollama' else configured,'message':'Провайдер настроен' if configured else 'AI provider не настроен','settings_url':'/settings'}
@router.post('/assistant/stream')
async def assistant(data:AssistantInput,request:Request,user=Depends(current_user)):
    if data.field_id:field_access(user['id'],data.field_id)
    rate_limit('llm:'+str(user['id']),8,60)
    async def events():
        async for event in stream_answer(user,data.question,data.field_id,request):
            yield 'data: '+json.dumps(jsonable_encoder(event),ensure_ascii=False)+'\n\n'
    return StreamingResponse(events(),media_type='text/event-stream',headers={'Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'})
