import os,logging
from contextlib import asynccontextmanager
from fastapi import FastAPI,Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from psycopg.errors import ForeignKeyViolation,UniqueViolation,CheckViolation
from . import db,ml
from .storage import ROOT

@asynccontextmanager
async def lifespan(app):
    db.pool.open();db.pool.wait();ml.load();ROOT.mkdir(parents=True,exist_ok=True)
    yield
    db.pool.close()

app=FastAPI(title='EGIN.KZ Local API',version='0.1.0',lifespan=lifespan)
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
    if not request.url.path.startswith('/uploads'):response.headers['Cache-Control']='no-store'
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
from .routes_ws import router as websocket
from .assistant.routes import router as assistant
app.include_router(activity)
app.include_router(websocket)
app.include_router(assistant)
app.mount('/uploads',StaticFiles(directory=ROOT,check_dir=False),name='uploads')
