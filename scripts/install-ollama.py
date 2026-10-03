"""Pinned, signature-audited CPU package; no GPU runtimes in CORE."""
import concurrent.futures,hashlib,os,platform,subprocess,time,urllib.request
from pathlib import Path
SHA='96e21f5d4932d7a576943193e1fb2fbc60c1ba9fb13d9c43ccdb5b16f30a34b1'
URL='https://archive.archlinux.org/packages/o/ollama/ollama-0.10.1-1-x86_64.pkg.tar.zst'
if os.getenv('WITH_OLLAMA','1')=='0':raise SystemExit(0)
if platform.machine()!='x86_64':raise RuntimeError('Set WITH_OLLAMA=0 and use Gemini or an external Ollama URL on non-amd64 hosts.')
p=Path('/vendor/ollama-0.10.1.pkg.tar.zst')
if not p.exists() or hashlib.sha256(p.read_bytes()).hexdigest()!=SHA:
    def fetch(a,b):
        for attempt in range(4):
            try:
                with urllib.request.urlopen(urllib.request.Request(URL,headers={'Range':f'bytes={a}-{b}'}),timeout=45) as r:
                    data=r.read()
                    if r.status!=206 or len(data)!=b-a+1:raise RuntimeError('Invalid package range')
                    return data,r.headers['Content-Range']
            except Exception:
                if attempt==3:raise
                time.sleep(1)
    _,header=fetch(0,0);size=int(header.split('/')[-1]);step=262144
    with concurrent.futures.ThreadPoolExecutor(8) as pool:
        chunks=pool.map(lambda a:fetch(a,min(a+step-1,size-1))[0],range(0,size,step))
        with p.open('wb') as f:
            for chunk in chunks:f.write(chunk)
if hashlib.sha256(p.read_bytes()).hexdigest()!=SHA:raise RuntimeError('Ollama package checksum mismatch')
Path('/opt/ollama').mkdir(exist_ok=True)
subprocess.run(['tar','--zstd','-xf',str(p),'-C','/opt/ollama','usr/bin/ollama','usr/lib/ollama','usr/share/licenses/ollama'],check=True)
p.unlink()
