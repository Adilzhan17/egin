# Code review — Egin-KZ

Scope: `backend` (NestJS), `gis-service` (Go/Fiber), `frontend` (Next.js static export), Docker/CI. Date: 2026-09-21.
"Verified" states how a finding was confirmed: **live** (reproduced against the deployed stack), **test** (automated test in the repo, `it.failing` = defect still present), **read** (code reading only, not executed).

## Summary

The codebase is structured well: consistent module layout, global validation with `whitelist`/`forbidNonWhitelisted`, bcrypt hashing, JWT + httpOnly cookies, parameterised SQL, ownership checks on plots/listings/services/chats, helmet, migrations. The serious problems are in **authentication hardening** (no rate limiting, weak OTP, hard-coded admin), a few **unauthenticated mutating routes**, **mass assignment** on two endpoints and one **always-failing endpoint**.

| Severity | Count | Fixed | Open |
|---|---|---|---|
| Critical | 1 | 1 | 0 |
| High | 6 | 6 | 0 |
| Medium | 8 | 7 | 1 (SEC-11) |
| Low | 6 | 5 | 1 (SEC-14, partly) |

**Status: 19 of 21 findings fixed** (see the *Status* column). Regression tests for every fix live in the suites listed in [TESTING.md](TESTING.md); the former `it.failing` markers are now plain assertions.

## Findings

### Critical

| ID | Finding | Where | Verified | Status |
|---|---|---|---|---|
| **SEC-01** | `main.ts` re-created an admin **`+77777777777` / `password123`** on every start. Anyone could log in as admin on the public site. | `backend/src/main.ts` | **live** (HTTP 200 before, 401 after) | **Fixed.** Seed removed; admin now comes from `ADMIN_PHONE`/`ADMIN_PASSWORD` (existing `AdminBootstrapService`); prod password rotated (`/opt/egin/.env`). Guard: `security.static.spec.ts` |

### High

| ID | Finding | Where | Verified | Recommendation |
|---|---|---|---|---|
| SEC-02 | **OTP brute force → account takeover.** 4-digit code from `Math.random()`, unlimited verify attempts, so `/auth/password/reset` for any phone can be brute-forced in ≤10⁴ requests. Code is only `console.log`ged (no SMS), stored in process memory (lost on restart, breaks with >1 instance). | `auth/auth.service.ts` | test (`it.failing`) | `crypto.randomInt`, 6 digits, max 5 attempts then lock, store in Redis with TTL, real SMS provider, do not log codes **Status:** **Fixed.** `crypto.randomInt`, 5 attempts then the code is burnt, 30 s re-send cooldown, identical response for unknown phones. Still open by design: codes are stored in process memory and delivered via the server log until an SMS provider is connected. |
| SEC-09 | **No rate limiting anywhere** (login, register, OTP). Credential stuffing and OTP guessing are unrestricted. | `app.module.ts` | test (`it.failing`) | `@nestjs/throttler` globally + stricter limits on `/auth/*`; also rate-limit at Cloudflare **Status:** **Fixed.** `@nestjs/throttler` globally (120/min/client) and 10/min on `/auth/*`; client = `CF-Connecting-IP`. GIS service has its own limiter (60/min). |
| SEC-08 | JWT secret silently defaults to `'super-secret-key-for-dev'` when `JWT_SECRET` is missing → forgeable tokens (incl. `role: admin`). | `auth.module.ts`, `jwt.strategy.ts` | test (`it.failing`) | Fail fast at startup if unset in production **Status:** **Fixed.** `requireJwtSecret()` — the API refuses to start without `JWT_SECRET`. |
| SEC-04 | `POST /crops` and `PATCH /crops/:id` are **unauthenticated**; PATCH takes `Partial<CreateCropDto>` which the ValidationPipe cannot validate (Partial is not a class) so arbitrary columns reach `repository.update`. | `crops/crops.controller.ts` | test (`it.failing`, contract + e2e) | `@UseGuards(JwtAuthGuard)` + admin role, use `PartialType(CreateCropDto)` **Status:** **Fixed.** `JwtAuthGuard + RolesGuard(admin)`; validated `UpdateCropDto`; `ParseUUIDPipe`. |
| SEC-05 | `PATCH /farm-plots/:id` takes `@Body() any` and spreads it into `update()` → owner can overwrite `userId` (transfer/hijack), `id`, raw `geometry`, any column. | `farm-plots.controller.ts`, `farm-plots.service.ts:431` | test (`it.failing`) | `UpdateFarmPlotDto` (whitelist) — never spread raw bodies **Status:** **Fixed.** `UpdateFarmPlotDto` (no `userId`/`id`/`geometry`) plus a field allow-list in the service. |
| SEC-06 | **Orders trust client prices.** `priceAtPurchase` is client-supplied, may be negative or 0; `listingId` is never checked; empty cart allowed → forged totals. | `orders/*` | test (`it.failing`) | Load listing server-side, use its price/owner, `@Min(0)`, `@ArrayNotEmpty()` **Status:** **Fixed.** The client sends only `listingId` + `quantity`; price/title/unit come from the listing; checks for status, availability, own listing, empty cart, max 50 lines. |

### Medium

| ID | Finding | Where | Verified | Recommendation |
|---|---|---|---|---|
| SEC-03 | `POST /auth/password/reset` body is `any`: no `newPassword` length rule (1-char passwords accepted); missing password → unhandled bcrypt error (500). | `auth.controller.ts:76` | test (`it.failing`) | Reset DTO with `@MinLength(6)`; DTO for OTP endpoints too **Status:** **Fixed.** `SendOtpDto`, `VerifyOtpDto`, `ResetPasswordDto` (6–72 chars) + service-level guard. |
| SEC-10 | `GET /metrics` (Prometheus) is public on the API host — leaks runtime/process info. | `app.module.ts` (`PrometheusModule.register()`) | **live** (HTTP 200) | Block at Cloudflare/nginx or require a token **Status:** **Fixed.** Default controller disabled; `/metrics` is 404 unless `METRICS_TOKEN` is set, then requires `Authorization: Bearer <token>`. |
| SEC-11 | Frontend stores the JWT in `localStorage` (`agro_token`) although an httpOnly cookie exists → token theft via XSS. | `frontend/src/components/ui/*` | read | Rely on the httpOnly cookie only (`credentials: 'include'`) **Status:** **Open.** Removing the `localStorage` token touches ~28 call sites and login-state logic and needs browser QA; plan: rely on the httpOnly cookie + `is_logged_in` flag with `credentials: 'include'` everywhere. |
| SEC-12 | GIS service passes `s,w,n,e` **unvalidated** into the Overpass QL string (query injection), no bbox size cap, and the cache key is attacker-controlled with no size limit → memory growth / upstream abuse. | `gis-service/main.go` | read | Parse as floats, clamp bbox area, bounded LRU cache **Status:** **Fixed.** Strict float parsing (`s<n`, `w<e`, ranges, ≤1° per side); query rendered from numbers only; bounded TTL cache (256 entries); response size cap. |
| BUG-03 | GIS handler dereferences `resp.StatusCode` in the error log when `resp` is `nil` (network error) → **panic**; no `recover` middleware, so one Overpass outage can crash the service. | `gis-service/main.go` | read | Check `err` first; add `recover.New()` **Status:** **Fixed.** No nil dereference; `recover` middleware; upstream failures return 503. |
| BUG-05 | `frontend/src/middleware.ts` (auth redirect) is **inert**: the app uses `output: "export"`, and Next.js does not run middleware for static exports. Route protection is client-side only. | `next.config.ts`, `middleware.ts` | read (Next.js docs) | Guard in the client `AuthProvider` (already partially done) or serve via `next start` **Status:** **Fixed.** Dead `middleware.ts` removed; the client `AuthProvider` guard is the real protection. |
| BUG-02 | `GET /analytics/crop-density` **always returns 500**: `.orderBy('totalHectares')` is unquoted, Postgres looks for `totalhectares`. | `analytics.service.ts` | **test** (`it.failing`, e2e on PostGIS) + reproduced in psql | `.orderBy('"totalHectares"', 'DESC')` **Status:** **Fixed.** `.orderBy('"totalHectares"')`; e2e on PostGIS covers it. |
| BUG-01 | `ConfigModule` lists `.env.example` as a fallback env file: its placeholder `DATABASE_URL` is loaded into `process.env` and breaks/redirects the DB connection when a real `.env` is missing (hit while writing e2e). Not present in the prod image. | `app.module.ts:35` | test (`it.failing`) + observed | Remove `.env.example` from `envFilePath` **Status:** **Fixed.** `envFilePath: ['.env']`; `JWT_SECRET` placeholder added to `.env.example`. |

### Low

| ID | Finding | Where | Verified | Recommendation |
|---|---|---|---|---|
| BUG-04 | `!lat`/`!lng` treats coordinate `0` as missing. | `analytics.service.ts` | test (`it.failing`) | Check `== null` / `Number.isFinite` **Status:** **Fixed.** Coordinates validated with `Number.isFinite` and range checks (0 is valid); radius 0–1000 km. |
| SEC-07 | `POST /api-usage/increment/:provider` is unauthenticated → anyone can burn the Google Maps quota counter. | `api-usage.controller.ts` | test (`it.failing`) | Guard it, or count server-side **Status:** **Fixed.** `JwtAuthGuard`; the frontend now sends its token. |
| SEC-13 | Public `weather` and `analytics` routes proxy/compute per request without limits. | – | read | Throttle + cache **Status:** **Fixed** through the global throttle (weather/analytics stay public). |
| SEC-14 | Logout only clears cookies; JWTs stay valid 7 days (cookie lives 30 days — mismatch). No refresh/revocation. | `auth.controller.ts` | read | Align lifetimes; short access token + refresh token **Status:** **Partly fixed.** Cookie lifetime now equals the JWT lifetime (7 d). Still open: no server-side revocation/refresh tokens. |
| QUAL-02 | `/api/health` fails (503) when heap or RSS exceeds a hard-coded 300 MB — normal memory growth (or a busy test runner) marks a healthy service down. Docker's `HEALTHCHECK` uses `/health`, so containers are unaffected, but any monitor on `/api/health` will flap. | `health/health.controller.ts` | **CI** (503 in the e2e runner) | Make the limits configurable/higher, or keep memory out of the readiness check **Status:** **Fixed.** `HEALTH_MAX_HEAP_MB` (768) / `HEALTH_MAX_RSS_MB` (1024). |
| QUAL-01 | Repo hygiene: 23 MB APK ×2, web tarball, zips, a compiled Go binary (`gis-service/egin-gis-service`), `typescript-errors.txt` committed (`.git` ≈ 49 MB). `docker-compose.simple.yml` commits DB/JWT passwords and publishes Postgres on `0.0.0.0:5432`. | repo root | read | Move artifacts to Releases, add to `.gitignore`, drop the simple compose or use env vars **Status:** **Fixed.** APK duplicate, Go binary and error dumps removed and ignored; `docker-compose.simple.yml` uses env secrets and binds to localhost. |

### CI/CD (legacy `deploy` job — hardened)

* ~~Secrets interpolated into shell~~ → now passed through `env:`/`envs:` and written with `printf`; ~~`StrictHostKeyChecking=no`~~ → `yes` with a scanned `known_hosts`.
* Still present: `rsync --delete` and a hard-coded Supabase IPv6 address in the workflow.
* Its SSH credentials are currently rejected by the server, so it is disabled by default (`LEGACY_SSH_DEPLOY`).

## Positive observations

Parameterised queries everywhere (SQL-injection tests pass); passwords hashed with bcrypt and never returned; same error for unknown phone and wrong password; admin cannot be self-registered; ownership enforced on plots, journal, listings, services and chats (verified cross-user in e2e); DTOs whitelist unknown fields; security headers via helmet; cookie flags correct; every container has a healthcheck.

## Test coverage of the review

Every finding marked *test* is encoded as an `it.failing` case — the suite is green today and will flag the moment a fix lands. Run instructions: [TESTING.md](TESTING.md). API surface: [API.md](API.md).
