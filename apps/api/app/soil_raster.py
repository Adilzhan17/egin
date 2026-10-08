"""Bounded COG point reads. Invoked in a subprocess so deadline kills GDAL too."""
import sys,json,concurrent.futures
from pathlib import Path
import rasterio
from rasterio.windows import Window
from rasterio.warp import transform

PROPERTIES={'phh2o':('ph.h2o_iso.10390.2021.index',.1,'pH'),'soc':('oc_iso.10694.1995.wpml',.1,'g/kg'),'clay':('clay.tot_iso.11277.2020.wpct',1.,'%')}

def sample(job):
    key,stat,url,scale,lat,lon=job
    # No directory scanning, retries or full download; at most one pixel window per asset.
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif',GDAL_HTTP_CONNECTTIMEOUT='5',GDAL_HTTP_TIMEOUT='8',GDAL_HTTP_MAX_RETRY='0',GDAL_CACHEMAX=8,CPL_VSIL_CURL_CACHE_SIZE='1048576'):
        with rasterio.open('/vsicurl/'+url) as ds:
            xs,ys=transform('EPSG:4326',ds.crs,[lon],[lat]);row,col=ds.index(xs[0],ys[0])
            if not (0<=row<ds.height and 0<=col<ds.width):return key,stat,None
            data=ds.read(1,window=Window(col,row,1,1),masked=True)
            if data.mask.any():return key,stat,None
            factor=ds.scales[0] if ds.scales[0]!=1 else scale
            return key,stat,round(float(data[0,0])*factor+ds.offsets[0],3)

def main(lat,lon):
    jobs=[];assets=[]
    for key,(ident,scale,unit) in PROPERTIES.items():
        item=json.loads((Path('/workspace/data')/(ident+'-item.json')).read_text())
        for stat in ('m','p16','p84'):
            asset=item['assets'].get(f'{ident}_{stat}_120m_b0cm..30cm')
            if asset:jobs.append((key,stat,asset['href'],scale,lat,lon));assets.append(asset['href'])
    top={};uncertainty={}
    with concurrent.futures.ThreadPoolExecutor(3) as executor:
        for future in [executor.submit(sample,j) for j in jobs]:
            try:
                key,stat,value=future.result()
                if value is None:continue
                if stat=='m':top[key]=value
                else:uncertainty.setdefault(key,{})[stat.upper()]=value
            except Exception:pass
    if not top:raise RuntimeError('No OpenLandMap COG values available')
    print(json.dumps({'source':'OpenLandMap-soildb','source_url':'https://stac.openlandmap.org/','license':'CC BY 4.0','depth':'0–30 cm','period':'2020–2022','resolution_m':120,'topsoil':top,'units':{k:v[2] for k,v in PROPERTIES.items()},'uncertainty':uncertainty,'raw_assets':assets,'warning':'Глобальные прогнозы 2020–2022, не лабораторный анализ. Доступны только прочитанные свойства.'}))
if __name__=='__main__':main(float(sys.argv[1]),float(sys.argv[2]))
