# EGIN AI

CORE orchestrates Gemini, Ollama or an OpenAI-compatible endpoint. The UI uses `POST /api/assistant/stream` (SSE), displaying actual token events, tool results, stop, retry and PostgreSQL history. Community messaging separately uses WebSocket.

## Configuration

Gemini is the preferred hosted provider: set `GEMINI_API_KEY`, `LLM_PROVIDER=gemini`, leave `LLM_MODEL` empty for automatic Flash discovery. The provider queries Google's `/v1beta/models`, checks `generateContent` support and validates explicit model choices. Account quota/free-tier access is decided by Google; a listed model does not guarantee a free quota. No Gemini key was supplied for local verification.

Without a key, the default local configuration runs CPU Ollama as a child process **inside CORE**, bound to `127.0.0.1:11434`. Model files persist under `artifacts/ollama`. First model download can take time; the application remains available and `/assistant/provider` shows whether the requested model is installed. No fourth container. Set `OLLAMA_URL` to use an existing external server. The verified local default is `qwen3:1.7b`. The small local model is for development, with lower language/reasoning quality than a hosted Flash model.

CPU binary: Ollama 0.10.1, Arch package signed by Sven-Hendrik Haase; exact SHA-256 pinned in `scripts/install-ollama.py`. This package runs on the Debian CORE image; current Arch binaries require a newer glibc. Set build argument `WITH_OLLAMA=0` to omit the local runtime on non-amd64 machines and use a remote provider.

## Tool boundaries

`assistant/tools.py` supplies 14 tools: current user, accessible farms and fields, selected field, weather, climate, soil, saved/new analysis, market, machinery, jobs, notifications and news. Every field call checks database membership. The model cannot run SQL, execute arbitrary code, or access another farmer's field.

Selected-field context is tagged `origin=context`; function calls requested by the model are separately tagged `origin=model`. The UI and tests distinguish them. Weather context contains provider facts, dates and units; text generation is always an actual model response. Weather questions require a model-origin weather call before any narrative is emitted, with one bounded retry if the model skips it. Four model rounds bound tool recursion. Errors produce an explicit event, not fabricated advice. Histories preserve provider, model and completion/cancellation state.

Gemini reference: https://ai.google.dev/gemini-api/docs/function-calling
Ollama reference: https://docs.ollama.com/capabilities/tool-calling
Model: https://ollama.com/library/qwen3:1.7b (Apache-2.0).

## Local testing

`tests/test_rescue.py` tests protocol orchestration and authorization deterministically with a test provider. Live model/tool/stream verification is a separate check; passing mocked provider tests alone is not proof that an external model works.
