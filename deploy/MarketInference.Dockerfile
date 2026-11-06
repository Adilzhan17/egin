FROM python:3.12-slim
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*
WORKDIR /service
COPY apps/api/market-inference/requirements.lock ./requirements.lock
RUN pip install --no-cache-dir -r requirements.lock
COPY apps/api/market-inference/download.py ./download.py
RUN python download.py
COPY apps/api/market-inference/server.py ./server.py
COPY apps/api/market-inference/limits.py ./limits.py
ENV OMP_NUM_THREADS=2
USER 65534:65534
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
