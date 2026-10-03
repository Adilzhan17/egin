# EGIN.KZ

Agricultural workspace for Kazakhstan, evolved inside the original [Egin-KZ repository](https://github.com/yedilius/Egin-KZ). The retained GIS engine is integrated with field weather, soil, experimental crop ML, a tool-using LLM assistant, marketplace, tasks, notes and community.

```sh
docker compose up --build
```

Open **http://localhost:3000**. Demo: `demo@egin.local` / `EginDemo2026!`. Offers, community seed and demo editorial content are labelled; current weather comes from a provider.

Three services: **web + core + db (PostgreSQL/PostGIS)**. WEB proxies `/api` and `/ws`. CORE handles all product modules and can run a CPU Ollama subprocess; no separate AI/weather/soil/ML/chat containers. First startup downloads boundary data, trains a missing ML artifact and downloads a local language model if needed. Internet access is required for these downloads and live providers. The UI reports model availability while the download runs.

## Configuration

Copy `.env.example` to `.env` to customize settings. For hosted AI, set `GEMINI_API_KEY` and `LLM_PROVIDER=gemini`; leave `LLM_MODEL` empty to discover an available Flash model. Without a key, local Ollama is the default. Small local models have lower language/reasoning quality; use a hosted model for stronger assistance. `OLLAMA_URL` can target an existing server. The bundled CPU runtime supports linux/amd64; for another architecture use `WITH_OLLAMA=0` and a remote provider.

DB and API ports bind to localhost; the web port is 3000. For a public deployment configure secrets, secure cookies and an HTTPS reverse proxy. Do not overwrite an existing database password. Real secrets are ignored by Git. A blank session secret is generated and persisted with mode 0600.

## Data and restart

PostgreSQL data lives in the existing `egin_data` named volume. Images, model artifacts and downloaded source data persist in `uploads/`, `artifacts/` and `data/`. `docker compose down` followed by `docker compose up --build` preserves them. **Do not add `-v` when restarting.** Migrations and seed are idempotent.

The original repository history is retained on `astra/rescue-egin`. Original accounts can be imported by `scripts/import-legacy-users.py`; phone-only accounts keep their original passwords and upgrade bcrypt to Argon2id after login. The original database is preserved separately and was backed up before import.

## Development and checks

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm build
docker compose exec core pytest -q
pnpm test:e2e
docker compose exec core python /workspace/scripts/train_models.py
```

Browser tests require Chromium; set `CHROME_PATH` if it is not `/opt/google/chrome/chrome`. Backend integration tests create and drop their own temporary database, never the application database. Live external-provider checks are separate from deterministic unit tests.

- [Architecture](docs/ARCHITECTURE.md)
- [AI providers, tools and streaming](docs/AI_ASSISTANT.md)
- [ML provenance, validation and replacing the dataset](docs/ML.md)
- [Weather, soil, climate, maps and attribution](docs/DATA_SOURCES.md)
- [Rescue audit](docs/RESCUE_AUDIT.md)
- [Verification](docs/VERIFICATION.md)

Soil is a global model estimate, not a laboratory result. ML is explicitly experimental and currently trained on a reproducible synthetic dataset. Missing required provider values are shown as insufficient data instead of fabricated recommendations.
