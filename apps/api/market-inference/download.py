"""Download pinned ONNX weights/tokenizer. No remote code or user cache deletion."""
import argparse
import hashlib
import json
import os
from pathlib import Path
from urllib.request import urlopen, Request

MODEL = 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'
REVISION = 'e8f8c211226b894fcb81acc59f3b34ba3efd5f42'
parser = argparse.ArgumentParser()
parser.add_argument('--model-dir', default=os.environ.get('EGIN_MODEL_DIR', '/service/model'))
directory = Path(parser.parse_args().model_dir).resolve()
directory.mkdir(parents=True, exist_ok=True)
manifest = {'model': MODEL, 'revision': REVISION, 'license': 'Apache-2.0', 'files': []}
for remote, local in [('onnx/model_quint8_avx2.onnx', 'model.onnx'), ('tokenizer.json', 'tokenizer.json')]:
    target = directory / local
    url = f'https://huggingface.co/{MODEL}/resolve/{REVISION}/{remote}'
    if not target.exists():
        temporary = target.with_suffix(target.suffix + '.part')
        print(f'Downloading {remote}', flush=True)
        with urlopen(Request(url, headers={'User-Agent': 'EGIN-local-search-setup'}), timeout=180) as response, temporary.open('wb') as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
        temporary.replace(target)
    with target.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    manifest['files'].append({'name': local, 'bytes': target.stat().st_size, 'sha256': digest, 'url': url})
    print(f'{local}: {target.stat().st_size} bytes, sha256 {digest}', flush=True)
(directory / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
