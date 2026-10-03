import json,os,re
import httpx

class ProviderUnavailable(RuntimeError):pass

def configuration():
    provider=os.getenv('LLM_PROVIDER','gemini' if os.getenv('GEMINI_API_KEY') else 'ollama' if os.getenv('OLLAMA_URL') else '')
    model=os.getenv('LLM_MODEL','')
    if provider=='ollama' and not model:model=os.getenv('OLLAMA_MODEL','qwen3:0.6b')
    return provider,model

class OllamaProvider:
    name='ollama'
    def __init__(self):self.url=os.getenv('OLLAMA_URL','').rstrip('/')
    async def stream(self,messages,tools,model):
        if not self.url:raise ProviderUnavailable('AI provider не настроен. Откройте настройки AI.')
        async with httpx.AsyncClient(timeout=httpx.Timeout(90,connect=5)) as client:
            async with client.stream('POST',self.url+'/api/chat',json={'model':model,'messages':messages,'tools':tools,'think':False,'stream':True,'keep_alive':'5m','options':{'temperature':0.15,'num_predict':700,'num_ctx':4096}}) as response:
                if response.status_code!=200:raise ProviderUnavailable(f'Ollama недоступен (HTTP {response.status_code}). Проверьте установленную модель.')
                async for line in response.aiter_lines():
                    if not line:continue
                    item=json.loads(line)
                    if item.get('error'):raise ProviderUnavailable('Ollama не смог загрузить модель.')
                    msg=item.get('message',{})
                    if msg.get('content'):yield {'text':msg['content']}
                    for call in msg.get('tool_calls',[]):yield {'call':call}

class GeminiProvider:
    name='gemini'
    def __init__(self):self.key=os.getenv('GEMINI_API_KEY','');self.url='https://generativelanguage.googleapis.com/v1beta'
    async def select_model(self,configured):
        if not self.key:raise ProviderUnavailable('GEMINI_API_KEY не настроен. Откройте настройки AI.')
        async with httpx.AsyncClient(timeout=15) as client:
            r=await client.get(self.url+'/models',headers={'x-goog-api-key':self.key})
            if r.status_code!=200:raise ProviderUnavailable(f'Gemini: список моделей недоступен (HTTP {r.status_code}).')
            available=[m['name'].removeprefix('models/') for m in r.json().get('models',[]) if 'generateContent' in m.get('supportedGenerationMethods',[])]
        if configured:
            if configured not in available:raise ProviderUnavailable('LLM_MODEL отсутствует в доступном списке Gemini.')
            return configured
        choices=[m for m in available if 'flash' in m and not any(x in m for x in ['image','audio','live','preview','exp','latest'])]
        if not choices:raise ProviderUnavailable('В аккаунте не найдена доступная Flash-модель.')
        return sorted(choices,key=lambda m:tuple(int(n) for n in re.findall(r'\d+',m)),reverse=True)[0]
    async def stream(self,messages,tools,model):
        contents=[];system=[]
        for m in messages:
            if m['role']=='system':system.append(m['content']);continue
            if m.get('_gemini_parts'):parts=m['_gemini_parts']
            elif m['role']=='tool':parts=[{'functionResponse':{'name':m['tool_name'],'response':{'result':json.loads(m['content'])}}}]
            elif m.get('tool_calls'):parts=[{'functionCall':c['function']} for c in m['tool_calls']]
            else:parts=[{'text':m.get('content') or ' '}]
            contents.append({'role':'model' if m['role']=='assistant' else 'user','parts':parts})
        declarations=[{'name':t['function']['name'],'description':t['function']['description'],'parameters':{k:v for k,v in t['function']['parameters'].items() if k!='additionalProperties'}} for t in tools]
        body={'systemInstruction':{'parts':[{'text':'\n'.join(system)}]},'contents':contents,'generationConfig':{'temperature':0.15,'maxOutputTokens':1500}}
        if declarations:body['tools']=[{'functionDeclarations':declarations}]
        async with httpx.AsyncClient(timeout=httpx.Timeout(90,connect=8)) as client:
            async with client.stream('POST',f'{self.url}/models/{model}:streamGenerateContent',params={'alt':'sse'},headers={'x-goog-api-key':self.key},json=body) as r:
                if r.status_code!=200:raise ProviderUnavailable(f'Gemini недоступен (HTTP {r.status_code}). Проверьте ключ и квоту.')
                async for line in r.aiter_lines():
                    if not line.startswith('data:'):continue
                    for c in json.loads(line[5:]).get('candidates',[]):
                        for p in c.get('content',{}).get('parts',[]):
                            if p.get('thought'):continue
                            if 'text' in p:yield {'text':p['text']}
                            if 'functionCall' in p:yield {'call':{'function':{'name':p['functionCall']['name'],'arguments':p['functionCall'].get('args',{})}},'gemini_part':p}

class OpenAICompatibleProvider:
    name='openai_compatible'
    async def stream(self,messages,tools,model):
        url=os.getenv('LLM_BASE_URL','').rstrip('/');key=os.getenv('LLM_API_KEY','')
        if not url or not model:raise ProviderUnavailable('Укажите LLM_BASE_URL и LLM_MODEL в настройках сервера.')
        body={'model':model,'messages':[{k:v for k,v in m.items() if not k.startswith('_') and k!='tool_name'} for m in messages],'stream':True,'temperature':0.15}
        if tools:body['tools']=tools
        calls={}
        async with httpx.AsyncClient(timeout=httpx.Timeout(90,connect=8)) as client:
            async with client.stream('POST',url+'/chat/completions',headers={'Authorization':'Bearer '+key},json=body) as r:
                if r.status_code!=200:raise ProviderUnavailable(f'LLM endpoint недоступен (HTTP {r.status_code}).')
                async for line in r.aiter_lines():
                    if not line.startswith('data:') or line[5:].strip()=='[DONE]':continue
                    for choice in json.loads(line[5:]).get('choices',[]):
                        delta=choice.get('delta',{})
                        if delta.get('content'):yield {'text':delta['content']}
                        for call in delta.get('tool_calls',[]):
                            item=calls.setdefault(call['index'],{'id':'','type':'function','function':{'name':'','arguments':''}})
                            if call.get('id'):item['id']=call['id']
                            for key,value in call.get('function',{}).items():item['function'][key]+=value
        for call in calls.values():yield {'call':call}

def get_provider():
    provider,model=configuration()
    cls={'gemini':GeminiProvider,'ollama':OllamaProvider,'openai_compatible':OpenAICompatibleProvider}.get(provider)
    if not cls:raise ProviderUnavailable('AI provider не настроен. Откройте настройки AI.')
    return cls(),model
