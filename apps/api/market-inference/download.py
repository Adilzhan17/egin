"""Pin the official multilingual MiniLM checkpoint; never execute model code."""
from huggingface_hub import hf_hub_download
from pathlib import Path
import shutil

MODEL = 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'
REVISION = 'e8f8c211226b894fcb81acc59f3b34ba3efd5f42'
Path('/service/model').mkdir(exist_ok=True)
for remote, local in [('onnx/model_quint8_avx2.onnx', 'model.onnx'), ('tokenizer.json', 'tokenizer.json')]:
    path = hf_hub_download(MODEL, remote, revision=REVISION)
    shutil.copyfile(path, '/service/model/' + local)
shutil.rmtree(Path.home() / '.cache/huggingface', ignore_errors=True)
