"""Download the small public HDX archive with resumable HTTP range requests."""
from pathlib import Path
from urllib.request import Request,urlopen
import concurrent.futures,time,zipfile
URL='https://data.humdata.org/dataset/afb05759-c3da-44f4-93a1-6bd2d8bcd431/resource/86cce6ba-4b79-4b4e-8961-3e6e04308395/download/kaz_adm_unhcr_2023_shp.zip'
root=Path(__file__).resolve().parents[1]/'data/downloads';root.mkdir(parents=True,exist_ok=True)
def main():
 target=root/'kaz-boundaries.zip'
 if target.exists() and zipfile.is_zipfile(target):return
 with urlopen(Request(URL,method='HEAD'),timeout=30) as r:size=int(r.headers['Content-Length']);resolved=r.url
 def get(i):
  start=i*350000;end=min(start+349999,size-1);p=root/f'kaz-part-{i}'
  for attempt in range(12):
   offset=p.stat().st_size if p.exists() else 0
   if start+offset>end:return p
   try:
    with urlopen(Request(URL,headers={'Range':f'bytes={start+offset}-{end}'}),timeout=25) as r:
     if r.status!=206:raise RuntimeError('Range requests unsupported')
     with p.open('ab') as f:
      while b:=r.read(16384):f.write(b)
   except Exception as e:
    print('Retry part',i,type(e).__name__,flush=True);time.sleep(1)
  if not p.exists() or p.stat().st_size!=end-start+1:raise RuntimeError('Incomplete boundary part')
  return p
 with concurrent.futures.ThreadPoolExecutor(12) as pool:parts=list(pool.map(get,range((size+349999)//350000)))
 temp=target.with_suffix('.complete')
 with temp.open('wb') as f:
  for p in parts:f.write(p.read_bytes())
 if not zipfile.is_zipfile(temp):raise RuntimeError('Invalid HDX archive')
 temp.replace(target)
 for p in parts:p.unlink()
 print('HDX archive verified:',size,'bytes')
if __name__=='__main__':main()
