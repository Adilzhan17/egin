import os,logging,asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI,Request,HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from psycopg.errors import ForeignKeyViolation,UniqueViolation,CheckViolation
from . import db,ml
from .storage import ROOT

@asynccontextmanager
async def lifespan(app):
    db.pool.open();db.pool.wait();ml.load();ROOT.mkdir(parents=True,exist_ok=True)
    from . import eventbus
    from .assistant.jobs import worker
    background=[asyncio.create_task(eventbus.listen()),asyncio.create_task(eventbus.housekeeping()),asyncio.create_task(worker())]
    yield
    for task in background:task.cancel()
    await asyncio.gather(*background,return_exceptions=True)
    db.pool.close()

app=FastAPI(title='EGIN.KZ Local API',version='0.1.0',lifespan=lifespan)
app.add_middleware(GZipMiddleware,minimum_size=1000,compresslevel=4)
origins=[os.getenv('WEB_ORIGIN','http://localhost:3000'),os.getenv('API_ORIGIN','http://localhost:8000')]
app.add_middleware(CORSMiddleware,allow_origins=origins,allow_credentials=True,allow_methods=['GET','POST','PUT','PATCH','DELETE'],allow_headers=['Content-Type','Last-Event-ID'])

@app.middleware('http')
async def security(request:Request,call_next):
    if request.method not in ('GET','HEAD','OPTIONS'):
        origin=request.headers.get('origin')
        if origin and origin not in origins:
            return JSONResponse({'detail':'Недопустимый Origin'},status_code=403)
        if request.headers.get('sec-fetch-site')=='cross-site':
            return JSONResponse({'detail':'Cross-site request rejected'},status_code=403)
        if int(request.headers.get('content-length','0'))>6*1024*1024:
            return JSONResponse({'detail':'Слишком большой запрос'},status_code=413)
    response=await call_next(request)
    response.headers['X-Content-Type-Options']='nosniff'
    response.headers['Referrer-Policy']='strict-origin-when-cross-origin'
    if not request.url.path.startswith('/uploads') and request.url.path!='/events':response.headers['Cache-Control']='no-store'
    return response

@app.exception_handler(ForeignKeyViolation)
async def foreign_key_error(request,exc):return JSONResponse({'detail':'Связанная запись не найдена'},status_code=422)
@app.exception_handler(UniqueViolation)
async def unique_error(request,exc):return JSONResponse({'detail':'Такая запись уже существует'},status_code=409)
@app.exception_handler(CheckViolation)
async def check_error(request,exc):return JSONResponse({'detail':'Данные не соответствуют ограничениям'},status_code=422)

@app.get('/health')
def health():
    d=db.one('SELECT PostGIS_Version() AS postgis,(SELECT count(*) FROM admin_boundaries) AS boundaries')
    return {'status':'ok','database':'PostgreSQL + PostGIS','postgis':d['postgis'],'boundaries':d['boundaries'],'model':ml.metadata()['model_version'],'model_loaded':True}

from .routes_core import router as core
from .routes_social import router as social
app.include_router(core)
app.include_router(social)
from .routes_activity import router as activity
from .assistant.routes import router as assistant
from .assistant.jobs import router as assistant_jobs
from .routes_runtime import router as runtime
from .routes_chat import router as chat
app.include_router(activity)
app.include_router(assistant)
app.include_router(assistant_jobs)
app.include_router(runtime)
app.include_router(chat)
from .routes_google import router as google
app.include_router(google)
class PublicUploads(StaticFiles):
    async def get_response(self,path,scope):
        # Private chat files share the persistent volume, never the public URL space.
        if '.private-chat' in path.split('/'):
            raise HTTPException(404,'Not found')
        return await super().get_response(path,scope)
app.mount('/uploads',PublicUploads(directory=ROOT,check_dir=False),name='uploads')
