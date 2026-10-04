# EGIN AI

CORE orchestrates Gemini, Ollama or an OpenAI-compatible endpoint. The UI creates durable jobs with `POST /api/assistant/messages`; the application-wide `GET /api/events` SSE carries tokens, tools, completion and community events. Stop uses the job cancel endpoint. PostgreSQL stores answers and history before completion is published. The old `/assistant/stream` remains for diagnostic protocol tests; the unused WebSocket implementation has been removed.

## Configuration

Gemini is the preferred hosted provider: set `GEMINI_API_KEY`, `LLM_PROVIDER=gemini`, leave `LLM_MODEL` empty for automatic Flash discovery. The provider queries Google's `/v1beta/models`, checks `generateContent` support and validates explicit model choices. Account quota/free-tier access is decided by Google; a listed model does not guarantee a free quota. No Gemini key was supplied for local verification.

Without a key, the default local configuration runs CPU Ollama as a child process **inside CORE**, bound to `127.0.0.1:11434`. Model files persist under `artifacts/ollama`. First model download can take time; the application remains available and `/assistant/provider` shows whether the requested model is installed. No fourth container. Set `OLLAMA_URL` to use an existing external server. The verified local default is `qwen3:1.7b`. The small local model is for development, with lower language/reasoning quality than a hosted Flash model.

CPU binary: Ollama 0.10.1, Arch package signed by Sven-Hendrik Haase; exact SHA-256 pinned in `scripts/install-ollama.py`. This package runs on the Debian CORE image; current Arch binaries require a newer glibc. Set build argument `WITH_OLLAMA=0` to omit the local runtime on non-amd64 machines and use a remote provider.

## Tool boundaries

`assistant/tools.py` supplies 18 tools: current user, accessible farms and fields, selected field, weather, climate, soil, saved/new analysis, market, machinery, jobs, notifications, news, permitted community messages and configured satellite/WeatherNext/sensor capabilities. Missing Google access or real sensors returns an explicit unavailable result. Every field call checks database membership. The model cannot run SQL, execute arbitrary code, or access another farmer's field.

Selected-field context is tagged `origin=context`, required server grounding `origin=policy`, and additional model calls `origin=model`. Weather, planting and nearby-search questions obtain authoritative tool data before generation. Compact Russian fact context identifies forecast dates, units, compass directions and experimental-model limitations; the visible answer still comes from the actual LLM. Conversation memory is limited to same-user/same-field follow-ups, preventing old weather values from contaminating a new forecast. Four model rounds bound tool recursion. Histories preserve provider, model and completion/cancellation state.

The initial rephrased-query benchmark is preserved in `artifacts/assistant-fast-benchmark.json`. The six exact requested questions are recorded separately in `artifacts/assistant-requested-questions.json`, with a factual review in `assistant-requested-questions-review.json`. Runtime completion is not answer-quality PASS: Qwen added an unsupported rain end date, gave incomplete planting advice and omitted demo disclosure in machinery prose. Verified source cards retain the actual values and warnings. A missed mandatory field-list intent was fixed and rechecked separately in `assistant-requested-fields-recheck.json`. Forecast input now preserves future days and request-time timezone; follow-up memory budgets each tool separately so weather cannot erase soil/experimental-model facts. It must not be presented as validated agronomic advice. Any alternative provider needs its own factual evaluation; no Gemini live verification has been performed.

Gemini reference: https://ai.google.dev/gemini-api/docs/function-calling
Ollama reference: https://docs.ollama.com/capabilities/tool-calling
Model: https://ollama.com/library/qwen3:1.7b (Apache-2.0).

## Local testing

`tests/test_rescue.py` tests protocol orchestration and authorization deterministically with a test provider. Live model/tool/stream verification is a separate check; passing mocked provider tests alone is not proof that an external model works.
