# Code review — Egin-KZ

Scope: `backend` (NestJS), `gis-service` (Go/Fiber), `frontend` (Next.js static export), Docker/CI. Date: 2026-09-21.
"Verified" states how a finding was confirmed: **live** (reproduced against the deployed stack), **test** (automated test in the repo, `it.failing` = defect still present), **read** (code reading only, not executed).

## Summary

The codebase is structured well: consistent module layout, global validation with `whitelist`/`forbidNonWhitelisted`, bcrypt hashing, JWT + httpOnly cookies, parameterised SQL, ownership checks on plots/listings/services/chats, helmet, migrations. The serious problems are in **authentication hardening** (no rate limiting, weak OTP, hard-coded admin), a few **unauthenticated mutating routes**, **mass assignment** on two endpoints and one **always-failing endpoint**.

| Severity | Count | Fixed in this change |
|---|---|---|
| Critical | 1 | 1 (SEC-01) |
| High | 6 | – |
| Medium | 8 | – |
| Low | 5 | – |

## Findings

### Critical

| ID | Finding | Where | Verified | Status |
|---|---|---|---|---|
| **SEC-01** | `main.ts` re-created an admin **`+77777777777` / `password123`** on every start. Anyone could log in as admin on the public site. | `backend/src/main.ts` | **live** (HTTP 200 before, 401 after) | **Fixed.** Seed removed; admin now comes from `ADMIN_PHONE`/`ADMIN_PASSWORD` (existing `AdminBootstrapService`); prod password rotated (`/opt/egin/.env`). Guard: `security.static.spec.ts` |

### High

| ID | Finding | Where | Verified | Recommendation |
|---|---|---|---|---|
| SEC-02 | **OTP brute force → account takeover.** 4-digit code from `Math.random()`, unlimited verify attempts, so `/auth/password/reset` for any phone can be brute-forced in ≤10⁴ requests. Code is only `console.log`ged (no SMS), stored in process memory (lost on restart, breaks with >1 instance). | `auth/auth.service.ts` | test (`it.failing`) | `crypto.randomInt`, 6 digits, max 5 attempts then lock, store in Redis with TTL, real SMS provider, do not log codes |
| SEC-09 | **No rate limiting anywhere** (login, register, OTP). Credential stuffing and OTP guessing are unrestricted. | `app.module.ts` | test (`it.failing`) | `@nestjs/throttler` globally + stricter limits on `/auth/*`; also rate-limit at Cloudflare |
| SEC-08 | JWT secret silently defaults to `'super-secret-key-for-dev'` when `JWT_SECRET` is missing → forgeable tokens (incl. `role: admin`). | `auth.module.ts`, `jwt.strategy.ts` | test (`it.failing`) | Fail fast at startup if unset in production |
| SEC-04 | `POST /crops` and `PATCH /crops/:id` are **unauthenticated**; PATCH takes `Partial<CreateCropDto>` which the ValidationPipe cannot validate (Partial is not a class) so arbitrary columns reach `repository.update`. | `crops/crops.controller.ts` | test (`it.failing`, contract + e2e) | `@UseGuards(JwtAuthGuard)` + admin role, use `PartialType(CreateCropDto)` |
| SEC-05 | `PATCH /farm-plots/:id` takes `@Body() any` and spreads it into `update()` → owner can overwrite `userId` (transfer/hijack), `id`, raw `geometry`, any column. | `farm-plots.controller.ts`, `farm-plots.service.ts:431` | test (`it.failing`) | `UpdateFarmPlotDto` (whitelist) — never spread raw bodies |
| SEC-06 | **Orders trust client prices.** `priceAtPurchase` is client-supplied, may be negative or 0; `listingId` is never checked; empty cart allowed → forged totals. | `orders/*` | test (`it.failing`) | Load listing server-side, use its price/owner, `@Min(0)`, `@ArrayNotEmpty()` |

### Medium

| ID | Finding | Where | Verified | Recommendation |
|---|---|---|---|---|
| SEC-03 | `POST /auth/password/reset` body is `any`: no `newPassword` length rule (1-char passwords accepted); missing password → unhandled bcrypt error (500). | `auth.controller.ts:76` | test (`it.failing`) | Reset DTO with `@MinLength(6)`; DTO for OTP endpoints too |
| SEC-10 | `GET /metrics` (Prometheus) is public on the API host — leaks runtime/process info. | `app.module.ts` (`PrometheusModule.register()`) | **live** (HTTP 200) | Block at Cloudflare/nginx or require a token |
| SEC-11 | Frontend stores the JWT in `localStorage` (`agro_token`) although an httpOnly cookie exists → token theft via XSS. | `frontend/src/components/ui/*` | read | Rely on the httpOnly cookie only (`credentials: 'include'`) |
| SEC-12 | GIS service passes `s,w,n,e` **unvalidated** into the Overpass QL string (query injection), no bbox size cap, and the cache key is attacker-controlled with no size limit → memory growth / upstream abuse. | `gis-service/main.go` | read | Parse as floats, clamp bbox area, bounded LRU cache |
| BUG-03 | GIS handler dereferences `resp.StatusCode` in the error log when `resp` is `nil` (network error) → **panic**; no `recover` middleware, so one Overpass outage can crash the service. | `gis-service/main.go` | read | Check `err` first; add `recover.New()` |
| BUG-05 | `frontend/src/middleware.ts` (auth redirect) is **inert**: the app uses `output: "export"`, and Next.js does not run middleware for static exports. Route protection is client-side only. | `next.config.ts`, `middleware.ts` | read (Next.js docs) | Guard in the client `AuthProvider` (already partially done) or serve via `next start` |
| BUG-02 | `GET /analytics/crop-density` **always returns 500**: `.orderBy('totalHectares')` is unquoted, Postgres looks for `totalhectares`. | `analytics.service.ts` | **test** (`it.failing`, e2e on PostGIS) + reproduced in psql | `.orderBy('"totalHectares"', 'DESC')` |
| BUG-01 | `ConfigModule` lists `.env.example` as a fallback env file: its placeholder `DATABASE_URL` is loaded into `process.env` and breaks/redirects the DB connection when a real `.env` is missing (hit while writing e2e). Not present in the prod image. | `app.module.ts:35` | test (`it.failing`) + observed | Remove `.env.example` from `envFilePath` |

### Low

| ID | Finding | Where | Verified | Recommendation |
|---|---|---|---|---|
| BUG-04 | `!lat`/`!lng` treats coordinate `0` as missing. | `analytics.service.ts` | test (`it.failing`) | Check `== null` / `Number.isFinite` |
| SEC-07 | `POST /api-usage/increment/:provider` is unauthenticated → anyone can burn the Google Maps quota counter. | `api-usage.controller.ts` | test (`it.failing`) | Guard it, or count server-side |
| SEC-13 | Public `weather` and `analytics` routes proxy/compute per request without limits. | – | read | Throttle + cache |
| SEC-14 | Logout only clears cookies; JWTs stay valid 7 days (cookie lives 30 days — mismatch). No refresh/revocation. | `auth.controller.ts` | read | Align lifetimes; short access token + refresh token |
| QUAL-01 | Repo hygiene: 23 MB APK ×2, web tarball, zips, a compiled Go binary (`gis-service/egin-gis-service`), `typescript-errors.txt` committed (`.git` ≈ 49 MB). `docker-compose.simple.yml` commits DB/JWT passwords and publishes Postgres on `0.0.0.0:5432`. | repo root | read | Move artifacts to Releases, add to `.gitignore`, drop the simple compose or use env vars |

### CI/CD (legacy `deploy` job)

* Secrets are interpolated straight into shell (`echo '${{ secrets.PROD_ENV_FILE }}'`) → breaks on quotes and is an injection risk; use `env:` + files.
* `StrictHostKeyChecking=no`, `rsync --delete`, and a hard-coded Supabase IPv6 address baked into the workflow.
* Its SSH credentials are currently rejected by the server, so it is disabled by default (`LEGACY_SSH_DEPLOY`).

## Positive observations

Parameterised queries everywhere (SQL-injection tests pass); passwords hashed with bcrypt and never returned; same error for unknown phone and wrong password; admin cannot be self-registered; ownership enforced on plots, journal, listings, services and chats (verified cross-user in e2e); DTOs whitelist unknown fields; security headers via helmet; cookie flags correct; every container has a healthcheck.

## Test coverage of the review

Every finding marked *test* is encoded as an `it.failing` case — the suite is green today and will flag the moment a fix lands. Run instructions: [TESTING.md](TESTING.md). API surface: [API.md](API.md).
