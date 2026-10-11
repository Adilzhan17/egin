FROM python:3.12-slim
WORKDIR /service
RUN pip install --no-cache-dir fastapi==0.135.1 uvicorn==0.42.0 onnxruntime==1.24.4 tokenizers==0.22.2 huggingface-hub==1.6.0 numpy==2.4.3
COPY apps/api/market-inference/download.py ./download.py
RUN python download.py
COPY apps/api/market-inference/server.py ./server.py
ENV OMP_NUM_THREADS=2
USER 65534:65534
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
