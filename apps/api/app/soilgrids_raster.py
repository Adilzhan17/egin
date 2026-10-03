"""ISRIC WCS point subset, then WebDAV VRT window reads (no REST dependency)."""
import concurrent.futures,json,sys
import httpx,rasterio
from rasterio.io import MemoryFile
from rasterio.warp import transform
from rasterio.windows import Window

PROPERTIES={'phh2o':(10,'pH'),'soc':(10,'g/kg'),'clay':(10,'%'),'sand':(10,'%'),'silt':(10,'%'),'bdod':(100,'kg/dm³'),'cec':(10,'cmol(c)/kg'),'nitrogen':(100,'g/kg')}
DEPTHS=[('0-5cm',5),('5-15cm',10),('15-30cm',15)]
IGH='+proj=igh +lat_0=0 +lon_0=0 +datum=WGS84 +units=m +no_defs'

def normalized(key,values):
    if len(values)!=3 or any(v is None for v in values):return None
    if any(v<0 for v in values) or (key in ('phh2o','bdod') and any(v==0 for v in values)):return None
    return round(sum(v*w for v,(_,w) in zip(values,DEPTHS))/30/PROPERTIES[key][0],3)

def pixel(ds,lat,lon):
    x,y=transform('EPSG:4326',ds.crs or IGH,[lon],[lat]);row,col=ds.index(x[0],y[0])
    if not(0<=row<ds.height and 0<=col<ds.width):return None
    data=ds.read(1,window=Window(col,row,1,1),masked=True)
    return None if data.mask.any() else float(data[0,0])

def sample(mode,key,depth,lat,lon,client=None):
    ident=f'{key}_{depth}_mean'
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',GDAL_HTTP_CONNECTTIMEOUT='4',GDAL_HTTP_TIMEOUT='7',GDAL_HTTP_MAX_RETRY='0',GDAL_CACHEMAX=8,CPL_VSIL_CURL_CACHE_SIZE='1048576'):
        if mode=='wcs':
            x,y=transform('EPSG:4326',IGH,[lon],[lat]);x=x[0];y=y[0]
            params=[('map',f'/map/{key}.map'),('SERVICE','WCS'),('VERSION','2.0.1'),('REQUEST','GetCoverage'),('COVERAGEID',ident),('FORMAT','GEOTIFF_INT16'),('SUBSET',f'X({x-250},{x+250})'),('SUBSET',f'Y({y-250},{y+250})')]
            r=client.get('https://maps.isric.org/mapserv',params=params);r.raise_for_status()
            if len(r.content)>1000000:raise ValueError('Unexpected large WCS response')
            with MemoryFile(r.content) as mem:
                with mem.open() as ds:return pixel(ds,lat,lon)
        url=f'https://files.isric.org/soilgrids/latest/data/{key}/{ident}.vrt'
        with rasterio.open('/vsicurl/'+url) as ds:return pixel(ds,lat,lon)

def collect(mode,lat,lon,client):
    # Probe one property before launching the bounded set; fail quickly during outages.
    first=sample(mode,'phh2o','0-5cm',lat,lon,client)
    values={'phh2o':[first,None,None]};errors=[]
    jobs=[(key,i,d) for key in PROPERTIES for i,(d,_) in enumerate(DEPTHS) if (key,i)!=('phh2o',0)]
    with concurrent.futures.ThreadPoolExecutor(8) as pool:
        futures={pool.submit(sample,mode,k,d,lat,lon,client):(k,i) for k,i,d in jobs}
        for f in concurrent.futures.as_completed(futures):
            k,i=futures[f]
            try:values.setdefault(k,[None]*3)[i]=f.result()
            except Exception:errors.append(k)
    top={k:v for k,vals in values.items() if (v:=normalized(k,vals)) is not None}
    if not top:raise RuntimeError('No complete 0–30 cm property')
    print(json.dumps({'source':'ISRIC SoilGrids v2 '+('WCS' if mode=='wcs' else 'WebDAV/VRT'),'source_url':'https://soilgrids.org/','license':'CC BY 4.0','dataset_version':'SoilGrids 2.0 / latest','depth':'0–30 cm','resolution_m':250,'topsoil':top,'units':{k:PROPERTIES[k][1] for k in top},'requested_coordinates':{'lat':lat,'lon':lon},'missing_properties':[k for k in PROPERTIES if k not in top],'uncertainty_note':'Среднее трёх слоёв, взвешенное по толщине. Квантили не загружались.','warning':'Расчётная характеристика почвы по глобальной модели; не лабораторный анализ поля.'}))
def main(mode,lat,lon):
    with httpx.Client(timeout=httpx.Timeout(6,connect=4),follow_redirects=True) as client:
        collect(mode,lat,lon,client)

if __name__=='__main__':main(sys.argv[1],float(sys.argv[2]),float(sys.argv[3]))
