# Testing & CI/CD

## Layers

| Layer | Where | What it proves | Needs DB |
|---|---|---|---|
| Unit | `backend/src/**/*.spec.ts` | Services, DTO validation, config, cache, env helpers | no |
| **Route contract** | `backend/src/routes.contract.spec.ts` | **All 62 routes**: registered set equals the documented set, 401 matrix (no token / garbage / wrong secret / expired / `alg=none`), cookie auth, validation, 404 | no |
| Static guards | `backend/src/security.static.spec.ts` | Config-level security findings (hard-coded secrets, default JWT secret, cookies, CORS) | no |
| **API e2e** | `backend/test/api.e2e-spec.ts` | Real `AppModule` + PostGIS: full user journeys, cross-user access control, SQL-injection-as-data, PostGIS analytics, cookies/helmet, OTP reset | yes |
| GIS | `gis-service/main_test.go` | `/health`, bbox validation, CORS allow-list | no |
| Live smoke | `scripts/smoke.sh` | Deployed stack: web, public routes 200, protected routes 401, validation, health payload. Read-only | – |

`it.failing(...)` marks a **known, documented defect** (IDs from [CODE_REVIEW.md](CODE_REVIEW.md)): the test passes while the bug exists and turns red once it is fixed — then change it to a normal `it`.

## Running

Per repository rules nothing is installed on the workstation — run inside containers (or rely on CI):

```bash
# unit + contract (≈10 s)
docker run --rm -v "$PWD/backend":/src:ro -w /work node:22-alpine sh -c \
  'cp -r /src/. . && rm -rf node_modules && npm ci && npx jest --ci'

# API e2e against a throwaway PostGIS
docker network create egin-e2e
docker run -d --name egin-e2e-db --network egin-e2e -e POSTGRES_PASSWORD=e2e -e POSTGRES_DB=e2e postgis/postgis:16-3.4-alpine
docker run --rm --network egin-e2e -v "$PWD/backend":/src:ro -w /work \
  -e DATABASE_URL= -e DB_HOST=egin-e2e-db -e DB_USERNAME=postgres -e DB_PASSWORD=e2e -e DB_NAME=e2e \
  -e DB_SSL=false -e DB_MIGRATIONS_RUN=true -e JWT_SECRET=x -e NODE_ENV=test node:22-alpine sh -c \
  'cp -r /src/. . && rm -rf node_modules && npm ci && npx jest --config test/jest-e2e.json --runInBand --forceExit'
docker rm -f egin-e2e-db && docker network rm egin-e2e

# GIS service
docker run --rm -v "$PWD/gis-service":/src:ro -w /work golang:1.23-alpine sh -c 'cp -r /src/. . && go vet ./... && go test ./...'

# live stack
scripts/smoke.sh https://egin-api.perricheno.com https://egin.perricheno.com
```

`DATABASE_URL=` (empty) is required in tests because `app.module.ts` currently falls back to `.env.example` (BUG-01).

## Pipelines (`.github/workflows`)

**`ci-cd.yml`** — every push and PR: `backend` (lint*, build, unit+contract) · `backend-e2e` (PostGIS service container) · `frontend` (lint*, static export build) · `gis-service` (vet, test, build) · `docker` (image builds). *Lint is non-blocking until existing findings are cleaned up.
On `main` the legacy SSH `deploy` + `smoke` jobs run only if the repository variable `LEGACY_SSH_DEPLOY=true` (the SSH secrets are currently rejected by the server).

**`healthcheck.yml`** — every 30 min and on demand: `scripts/smoke.sh` against production.

Repository variables (optional): `APP_URL` (default `https://egin.perricheno.com`), `API_URL` (default `https://egin-api.perricheno.com`).

## Self-hosted production (this server)

`docker-compose.selfhost.yml` — postgres (PostGIS), redis, backend :3284, gis-service :3286, frontend :3285, all bound to `127.0.0.1` and exposed through the Cloudflare Tunnel (`egin.perricheno.com` → 3285, `egin-api.perricheno.com` → 3284). Every service has a Docker `HEALTHCHECK`.

```bash
cd Egin-KZ && docker compose --env-file /opt/egin/.env -f docker-compose.selfhost.yml up -d --build
docker ps --filter name=egin-          # all must be (healthy)
```
Secrets live in `/opt/egin/.env` (mode 600, not in git); template: `.env.selfhost.example`.
