# EGIN architecture

```
Browser → WEB :3000 (Next.js)
             /api → CORE :8000 (FastAPI)
             /api/events → CORE SSE
                      ↓
                PostgreSQL 16 / PostGIS
```

Three Compose services: `web`, `core`, `db`. Auth, farms, fields, GIS, weather, soil, climate, ML, assistant, market/jobs/rental, tasks, notes, community and news are modules of CORE. No Redis, separate worker container, MinIO or per-domain service. A durable PostgreSQL event log and LISTEN/NOTIFY serve one shared SSE connection per browser tab. Current deployment uses one API process; multiple API replicas have not been load-tested.

One compact `/bootstrap` reads authorized summaries and its event cursor in a consistent database snapshot. Client stores deduplicate requests, apply versioned changes, retain drafts and cache permitted data in per-account IndexedDB. Offline notes use idempotent UUIDs. The service worker caches the public shell and static code, excluding API responses and private uploads. MapLibre loads on GIS routes; the home page uses small SVG field previews. The server retains secrets, authorization, authoritative geometry and business logic, external integrations, ML and LLM. See [FAST_CORE.md](FAST_CORE.md) for measured choices and limitations.

The root Git ancestry contains the original `yedilius/Egin-KZ` repository and the local snapshot. Work is on `astra/rescue-egin`. The original MapLibre 5 / Mapbox Draw / Snap / Turf engine is under `apps/web/components/gis`; its API adapter uses the current authenticated field endpoints. Draw initializes before raster requests so slow imagery does not disable editing. First-vertex closure and touch handling wrap the existing snap mode.

CORE starts migrations, HDX boundaries, idempotent labelled demo seed, and trains a missing ML artifact. Optional CPU Ollama is a subprocess inside CORE; the HTTP API remains up while a model downloads. Gemini uses dynamic model discovery. Durable assistant jobs run in CORE and publish tool/progress/token events through the same SSE connection. Providers are replaceable modules, not separate deployables.

PostGIS validates geometry, stores revisions, computes area/centroid and administrative intersection in EPSG:4326. HDX source CRS is explicitly transformed from EPSG:3857. Weather receives this same centroid; persistent analysis uses Open-Meteo. Optional Google Weather has a separate expiring memory-only cache and never enters durable event or analysis payloads. Soil samples raster windows at this point. Climate is historical NASA POWER, not forecast. Feature builder → trained artifact → analysis snapshot → PostgreSQL → dashboard / AI tools.

Session cookies are HttpOnly/SameSite=Lax with opaque tokens; only HMAC digests are stored. New passwords use Argon2id. Imported phone-only accounts retain their identifiers and bcrypt hashes; a successful login upgrades the hash to Argon2id. Every field/tool operation checks organization membership. Uploads are size-bounded and re-encoded through the storage adapter. API and DB host ports bind only to loopback.

Persistence: named `egin_data` volume; `uploads/`, `artifacts/`, `data/` bind mounts. Do not use `docker compose down -v` to restart. Original database backups and volumes remain preserved; the migration never overwrites original accounts.
