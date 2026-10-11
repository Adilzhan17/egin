"""CPU ONNX embeddings, mean pooling and L2 normalization (384 dimensions).

Private Docker network only. No uploads, arbitrary model paths or remote code.
"""
import threading
import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer
from fastapi import FastAPI
from pydantic import BaseModel, Field

options = ort.SessionOptions()
options.intra_op_num_threads = 2
options.inter_op_num_threads = 1
session = ort.InferenceSession('/service/model/model.onnx', sess_options=options, providers=['CPUExecutionProvider'])
tokenizer = Tokenizer.from_file('/service/model/tokenizer.json')
tokenizer.enable_truncation(max_length=128)
tokenizer.enable_padding(pad_id=tokenizer.token_to_id('<pad>'), pad_token='<pad>')
lock = threading.Lock()
app = FastAPI(docs_url=None, redoc_url=None)


class Request(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=16)


@app.get('/health')
def health():
    return {'ok': True, 'model': 'paraphrase-multilingual-MiniLM-L12-v2', 'dimensions': 384}


@app.post('/embed')
def embed(body: Request):
    from fastapi import HTTPException
    if any(len(text) > 8000 for text in body.texts):
        raise HTTPException(413, 'Text too long')
    with lock:
        encoded = tokenizer.encode_batch(body.texts)
        arrays = {'input_ids': np.array([item.ids for item in encoded], dtype=np.int64),
                  'attention_mask': np.array([item.attention_mask for item in encoded], dtype=np.int64),
                  'token_type_ids': np.array([item.type_ids for item in encoded], dtype=np.int64)}
        inputs = {item.name: arrays[item.name] for item in session.get_inputs()}
        output = session.run(None, inputs)[0]
        mask = arrays['attention_mask'][..., None]
        mean = (output * mask).sum(axis=1) / np.maximum(mask.sum(axis=1), 1)
        vectors = mean / np.maximum(np.linalg.norm(mean, axis=1, keepdims=True), 1e-12)
    return {'vectors': vectors.tolist(), 'dimensions': 384}
