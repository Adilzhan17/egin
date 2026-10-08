# Rescue audit of yedilius/Egin-KZ

Source: original `origin/main` at `846f6f730b2413e7a4d89aa5e422a1e78fac39ac`, full Git ancestry fetched. Branch: `astra/rescue-egin`. Prior local work was committed before integrating the original history. The original README is retained as `ORIGINAL_README.md`; previous product releases and native wrappers remain in Git (sparse checkout omits their generated binary assets).

## What is preserved

Original `frontend/src/components/map/Map.tsx` orchestrates MapLibre 5.20.1, Mapbox GL Draw 1.5.1, snapping modes, Turf geoprocessing, field hit testing, touch selection, measurement labels and map controls. These files move to `apps/web/components/gis/`; their engine is retained and connected to the common API. Original RU/KK dictionaries and Turf tools move with them. The previous local Terra Draw adapter is replaced only after regression checks of the original engine.

## Findings

- Original deployment contains frontend, Nest backend, Go Overpass proxy, Redis and PostGIS, with multiple compose variants. Go is a bounded HTTP/cache proxy, not an indispensable spatial database. The retained map wand already requests Overpass directly and applies Turf in the browser; the separate Go container is unnecessary. Redis is not necessary for one application process.
- Original assistant calls OpenAI Responses for JSON advice, without tools or chat streaming. Missing key silently chooses generic garden advice. There is no trained model artifact in the original repository.
- Original weather provider already uses `timezone=auto`, polygon-derived coordinates and explicitly `wind_speed_unit=ms`. Therefore latitude reversal must not be asserted without evidence. Dashboard chooses the largest plot, not the user's current field, and can fall back to regional coordinates. This selection can disagree with the field shown elsewhere. Preserve provenance, make selection explicit, verify normalization against raw provider data and units.
- The prior local weather presentation reused one weather icon, named the first forecast row “Today” regardless of stale date and omitted some requested variables. These presentation/integration defects require corrections too.
- Original marketplace, services, chats, farm activities and migrations contain useful functional code; they are not all empty stubs. Existing UI is an extensive state-driven page. New navigation must use one source of truth and expose working routes.
- The currently running original database contains one user and zero fields, chat messages or marketplace listings. Its data/volume is preserved. Existing local MVP fields, caches, messages and listings are also preserved.
- No original root AGENTS.md or 00–12 product documents were found. `.agents/rules/1.md` prefers server-only dependency installs; the user's explicit localhost/Compose build and verification request takes precedence for this task.

Replacement core is a modular FastAPI application with auth, farm/GIS, environmental providers, trained sklearn inference, tool-using LLM service, marketplace, realtime chat, news and activities. This extends the verified local components while retaining the original GIS and Git history; no second project directory is created.

## Verified replacement cleanup

After GIS draw/edit and marketplace/community/LLM browser checks passed, removed inactive Nest backend, Go GIS service, duplicate frontend/dashboard, unused Google Maps implementation, Terra Draw dependencies, old native-build/deployment scripts and alternate Compose files. Original source/native wrappers remain in Git ancestry (`846f6f7`). Original PostgreSQL/Redis containers are stopped; the database volume and pre-import dump remain intact. The replaced local API container was removed. Unrelated messenger services were untouched. CI now builds/checks the three-service product without automatic deployment.
