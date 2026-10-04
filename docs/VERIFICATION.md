# Rescue verification — 4 October 2026, Asia/Almaty

This document records the earlier rescue checkpoint at commit `4644067`. Its WebSocket implementation and test counts have since been superseded by Fast Core. Current evidence and limitations are in [FAST_CORE_VERIFICATION.md](FAST_CORE_VERIFICATION.md), with design details in [FAST_CORE.md](FAST_CORE.md); original checkpoint measurements below remain historical, not claims about the current build.

Verified the actual local three-container product at http://localhost:3000, API http://localhost:8000. Source branch: `astra/rescue-egin`. Original Git ancestry and database backup are preserved.

## Executed checks

| Check | Result |
| --- | --- |
| Strict frontend typecheck | PASS |
| Frontend ESLint | PASS, no warnings |
| Production Next build inside Node 22 container | PASS |
| CORE isolated PostgreSQL/PostGIS tests | **24 passed** |
| Actual browser E2E against Compose | **6 passed**, 3.5 minutes, no network mocks |
| Responsive route checks | **24 checks passed**: six routes × 390×844, 430×932, 820×1180, 1440×1000; no horizontal overflow or page exceptions |
| Mobile map dialog and focused chat/AI inputs | PASS, including a 390×520 reduced viewport |
| `docker compose down` → `docker compose up --build -d --wait` | PASS |
| Database persistence across complete restart | Exact ID sets unchanged for users (18), farms (16), fields (12), analyses (10), listings (26), messages (18), AI history (15), tasks (5), notes (2) at that checkpoint |

Subsequent browser checks deliberately created additional E2E records; the checkpoint counts above are not claims about the final live counts.

The six browser cases cover desktop login/dashboard/map/field ML/assistant/market creation-refresh/chat persistence/news; mobile registration/onboarding/drawing/saving/reloading; vertex editing/undo/revision history; two independent signed-in browsers receiving durable WebSocket messages; selected-field weather/tasks/notes and jobs/rental categories; real LLM token streaming, model-origin weather tool calling, completion and PostgreSQL history after reload.

The stream test observes the real browser response using `response.clone()` because Chromium does not reliably retain SSE bodies for the debugging protocol. No response is substituted. A provider-protocol unit test separately uses an explicitly labelled test provider; that test alone is not counted as live LLM verification.

## Weather and soil evidence

`artifacts/weather-verification.json`: field `926d4289-11bf-52f3-8a36-978895667ef4`, centroid **52.40377568134171, 69.4056498951782**, timezone **Asia/Almaty**. Checked 2026-10-04 **01:22:22 local**; provider forecast time **01:15**. Normalized, retained raw and independent direct Open-Meteo responses all agree: temperature **8.6 °C**, wind **10.1 km/h**, precipitation **0.3 mm**, WMO code **55**. These are timestamped verification values, not a promise that later forecasts stay unchanged.

Actual SoilGrids WCS layer samples are retained in `artifacts/soil-verification.json` for two further field centroids. All three depth layers were obtained for pH/SOC/clay, with thickness-weighted conversion. Together with existing real cached data, **three distinct fields have saved ExtraTrees inference with three candidate crops**. WCS availability was intermittent: partial properties and missing layers occurred. VRT/OpenLandMap fallback successful complete sampling is not claimed; bounded timeout handling is verified. Partial cache refresh, property provenance, units and invalid-value handling have deterministic tests.

## ML and LLM

ML: `ExtraTreesClassifier`, artifact `artifacts/crop-suitability.joblib`, model `egin-suitability-demo-v2`. Features: pH, May–August historical temperature/precipitation, clay and SOC. Reproducible synthetic dataset, 2925 training / 975 validation examples. Compared with RandomForest and HistGradientBoosting; selected synthetic validation balanced accuracy **0.4911**, macro-F1 **0.4633**. These metrics do not establish agronomic accuracy. Risks use explicitly identified rules, separately from trained crop inference.

LLM: actual CPU Ollama **0.10.1**, **qwen3:1.7b**, inside CORE; official model blob SHA-256 verified. The browser test observed `origin=model`, `get_field_weather`, token events and `done`, then verified saved text. The ordinary “Погода на неделю” action also produced the model weather-tool card. A missing model/provider is reported explicitly. Gemini and OpenAI-compatible protocols are implemented, but no live Gemini key or remote-compatible endpoint was supplied, so their live service availability is **not verified**.

## Cleanup and limits

Three running EGIN containers: `egin-local-mvp-web-1`, `egin-local-mvp-core-1`, `egin-local-mvp-db-1`. API and DB are healthy; web responds and passes actual browser checks. Original `egin-postgres` and `egin-redis` are stopped; their volumes remain. Replaced API/build containers and unused local 0.6B model were removed. Inactive Nest/Go/duplicate frontend, alternate Compose/deployment scripts, unused Google Maps and Terra Draw implementations were removed after replacement checks. Unrelated messenger containers were untouched.

Known limits: experimental synthetic ML; global-model soil, intermittent external rasters/imagery; small CPU LLM can be slow and make wording/reasoning mistakes, so source cards and professional review remain important. Live LLM E2E took about two minutes on this workstation. Physical iOS/Android keyboard and device testing is not claimed: mobile QA used Chrome touch emulation and reduced viewports. Single-instance WebSocket wakeups are in memory, with durable PostgreSQL replay. No public deployment was performed.

The backend suite emits one Starlette TestClient deprecation notice; Playwright emits a NO_COLOR/FORCE_COLOR notice. Neither is an application failure. Local logs and screenshots are under ignored `.runtime/`.
