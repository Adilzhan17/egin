"""One CORE container: migrations, seed, ML artifact and optional local LLM."""
import os,secrets,subprocess,signal,sys,time
from pathlib import Path
root=Path('/workspace');children=[]
if not os.getenv('SESSION_SECRET'):
    secret=root/'artifacts/session-secret';secret.parent.mkdir(parents=True,exist_ok=True)
    if not secret.exists():
        fd=os.open(secret,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w') as f:f.write(secrets.token_hex(32))
    os.environ['SESSION_SECRET']=secret.read_text().strip()
subprocess.run([sys.executable,'-m','app.bootstrap','init'],check=True)

def stop(signum,frame):
    for child in children:
        if child.poll() is None:child.terminate()
for sig in (signal.SIGTERM,signal.SIGINT):signal.signal(sig,stop)
provider=os.getenv('LLM_PROVIDER') or ('gemini' if os.getenv('GEMINI_API_KEY') else 'ollama')
os.environ['LLM_PROVIDER']=provider
if provider=='ollama' and os.getenv('OLLAMA_URL','') in ('','http://127.0.0.1:11434'):
    os.environ['OLLAMA_URL']='http://127.0.0.1:11434'
    os.environ['OLLAMA_HOST']='127.0.0.1:11434'
    os.environ['OLLAMA_MODELS']=str(root/'artifacts/ollama')
    os.environ['OLLAMA_NUM_PARALLEL']='1';os.environ['OLLAMA_MAX_LOADED_MODELS']='1'
    os.environ['OLLAMA_CONTEXT_LENGTH']='4096'
    model=os.getenv('LLM_MODEL') or os.getenv('OLLAMA_MODEL') or 'qwen3:1.7b'
    os.environ['LLM_MODEL']=model
    binary='/opt/ollama/usr/bin/ollama'
    if Path(binary).exists():
        children.append(subprocess.Popen([binary,'serve']))
        # Pull in the background; health and the explicit provider status remain available.
        children.append(subprocess.Popen([sys.executable,'-c',
          "import subprocess,time; time.sleep(2); subprocess.run(["+repr(binary)+",'pull',"+repr(model)+"],check=True)"]))
    else:print('Local Ollama binary absent; configure Gemini or OLLAMA_URL.',flush=True)
api=subprocess.Popen(['uvicorn','app.main:app','--host','0.0.0.0','--port','8000']);children.append(api)
code=api.wait();stop(None,None)
for child in children:
    try:child.wait(timeout=10)
    except subprocess.TimeoutExpired:child.kill()
sys.exit(code)
