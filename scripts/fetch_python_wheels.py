"""Build an offline wheelhouse after unreliable package-index responses.
Downloads official PyPI wheels, verifies published SHA256, no install scripts.
"""
import urllib.request,json,concurrent.futures,hashlib,time,gzip
from pathlib import Path
from packaging.requirements import Requirement
from packaging.version import Version
from packaging.tags import cpython_tags,compatible_tags
from packaging.utils import parse_wheel_filename,canonicalize_name
from packaging.markers import default_environment
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.wheelhouse';OUT.mkdir(parents=True,exist_ok=True)
versions={'rasterio':None,'fastapi':'0.142.2','uvicorn':'0.54.0','psycopg':'3.3.6','psycopg-binary':'3.3.6','psycopg-pool':'3.3.3','argon2-cffi':'25.1.0','httpx':'0.28.1','scikit-learn':'1.9.1','numpy':'2.5.3','joblib':'1.6.0','pillow':'12.3.0','python-multipart':'0.0.32','pytest':'9.1.1','pyshp':'3.1.6','pydantic':'2.13.5','pydantic-core':'2.46.5'}
plats=[f'manylinux_2_{i}_x86_64' for i in range(41,16,-1)]+['manylinux2014_x86_64','manylinux2010_x86_64','manylinux1_x86_64','linux_x86_64']
tags=list(cpython_tags((3,12),platforms=plats))+list(compatible_tags((3,12),interpreter='cp312',platforms=plats));rank={t:i for i,t in enumerate(tags)}
env=default_environment();env.update(python_version='3.12',python_full_version='3.12.13',sys_platform='linux',platform_system='Linux',platform_machine='x86_64',extra='')

def metadata(name,version=None):
 path=ROOT/'.runtime'/f'pypi-{name}-{version or "latest"}.json'
 if path.exists():return json.loads(path.read_text())
 print('Metadata',name,version or 'latest',flush=True)
 url=f'https://pypi.org/pypi/{name}/'+(f'{version}/' if version else '')+'json'
 for attempt in range(7):
  try:
   with urllib.request.urlopen(urllib.request.Request(url,headers={'Accept-Encoding':'gzip'}),timeout=30) as r:
    b=r.read();x=json.loads(gzip.decompress(b) if r.headers.get('Content-Encoding')=='gzip' else b);path.write_text(json.dumps(x));return x
  except Exception:
   if attempt==6:raise
   time.sleep(1)

def resolve():
 resolved={};queue=dict(versions);constraints={}
 while queue:
  batch=list(queue.items());queue={}
  with concurrent.futures.ThreadPoolExecutor(10) as pool:loaded=list(pool.map(lambda p:metadata(*p),batch))
  for (name,_),d in zip(batch,loaded):
   v=d['info']['version'];resolved[name]=d
   for raw in d['info'].get('requires_dist') or []:
    r=Requirement(raw);dep=canonicalize_name(r.name)
    if r.marker and not r.marker.evaluate(env):continue
    constraints.setdefault(dep,[]).append(r.specifier)
    if dep in resolved:
     if Version(resolved[dep]['info']['version']) not in r.specifier:raise RuntimeError(f'Constraint mismatch {name} needs {r}')
     continue
    exact=next((s.version for s in r.specifier if s.operator=='==' and '*' not in s.version),None)
    queue[dep]=versions.get(dep,exact)
  # Respect upper bounds before downloading any artifact.
  for name,v in list(queue.items()):
   if v:continue
   d=metadata(name)
   if all(Version(d['info']['version']) in s for s in constraints.get(name,[])):continue
   candidates=sorted((Version(v) for v in d['releases'] if not Version(v).is_prerelease and all(Version(v) in s for s in constraints[name])),reverse=True)
   queue[name]=str(candidates[0])
 print('Resolved',len(resolved),'packages',flush=True)
 return resolved

def main():
 resolved=resolve();files=[]
 for name,d in resolved.items():
  options=[]
  for f in d['urls']:
   if not f['filename'].endswith('.whl'):continue
   _,_,_,ts=parse_wheel_filename(f['filename']);rs=[rank[t] for t in ts if t in rank]
   if rs:options.append((min(rs),f))
  if not options:raise RuntimeError('No Python 3.12 Linux wheel: '+name)
  f=min(options,key=lambda p:p[0])[1];files.append(f)
 jobs=[]
 for f in files:
  p=OUT/f['filename']
  if p.exists() and hashlib.sha256(p.read_bytes()).hexdigest()==f['digests']['sha256']:continue
  size=f['size'];chunk=512000
  for i,start in enumerate(range(0,size,chunk)):jobs.append((f,i,start,min(start+chunk-1,size-1)))
 def part(job):
  f,i,start,end=job;p=OUT/(f['filename']+f'.part{i}')
  for attempt in range(10):
   offset=p.stat().st_size if p.exists() else 0
   if offset==end-start+1:return
   try:
    with urllib.request.urlopen(urllib.request.Request(f['url'],headers={'Range':f'bytes={start+offset}-{end}'}),timeout=30) as r:
     if r.status!=206:
      if start==0 and end==f['size']-1:pass
      else:raise RuntimeError('Range unsupported')
     with p.open('ab') as out:
      while b:=r.read(16384):out.write(b)
   except Exception:
    if attempt==9:raise
    time.sleep(1)
 print('Downloading',len(jobs),'bounded chunks',flush=True)
 with concurrent.futures.ThreadPoolExecutor(18) as pool:list(pool.map(part,jobs))
 for f in files:
  p=OUT/f['filename']
  if p.exists() and hashlib.sha256(p.read_bytes()).hexdigest()==f['digests']['sha256']:continue
  with p.open('wb') as out:
   for i in range((f['size']+511999)//512000):out.write((OUT/(f['filename']+f'.part{i}')).read_bytes())
  if hashlib.sha256(p.read_bytes()).hexdigest()!=f['digests']['sha256']:raise RuntimeError('Hash mismatch '+f['filename'])
  for partfile in OUT.glob(f['filename']+'.part*'):partfile.unlink()
  print('Verified',f['filename'],flush=True)
 (ROOT/'apps/api/requirements.lock').write_text('\n'.join(sorted(f"{name}=={d['info']['version']}" for name,d in resolved.items()))+'\n')
 print('Offline wheelhouse ready',flush=True)
if __name__=='__main__':main()
