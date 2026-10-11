# Market semantic inference

The private CPU service uses the official
[paraphrase-multilingual-MiniLM-L12-v2 checkpoint](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2/tree/e8f8c211226b894fcb81acc59f3b34ba3efd5f42),
pinned to that revision, with its quantized AVX2 ONNX export and tokenizer.
It produces 384-dimensional, normalized mean-pooled vectors. No Python model code
is downloaded or executed. No Torch, model or tokenizer enters the browser or
the main API runtime.

`docker build -f deploy/MarketInference.Dockerfile -t egin-market-inference:1 .`
builds the image. `/health` describes the loaded model; `POST /embed` takes
`{"texts":["Пшеница 3 класса"]}`. Network access is private to Market containers.
The service accepts at most 16 strings of 8,000 characters, truncates to 128 tokens
(the checkpoint's sentence length), and limits CPU inference to two threads.

Market stores vectors in PostgreSQL/pgvector, with a listing version next to
each vector. A periodic worker indexes only published listings; new publications
remain immediately available to lexical search while inference is pending.
Changed versions cannot serve stale vectors. Archived rows are excluded at query
time and removed from the vector table on the next worker pass. If inference
fails, lexical/fuzzy retrieval remains available.

Useful references:

- [Sentence Transformers ONNX inference](https://www.sbert.net/docs/sentence_transformer/usage/efficiency.html)
- [pgvector cosine distance](https://github.com/pgvector/pgvector)
- [PostgreSQL trigram indexes](https://www.postgresql.org/docs/17/pgtrgm.html)

The multilingual inference test is opt-in for environments without the model:
set `MARKET_TEST_INFERENCE_URL` before running `apps/api/tests/market-search.test.mjs`.
