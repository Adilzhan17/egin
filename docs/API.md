# Egin API reference

Base URLs: `https://egin-api.perricheno.com` (prod) · `http://localhost:3284` (docker) · `http://localhost:3000` (dev).
Frontend: `https://egin.perricheno.com`.

**Auth.** JWT (7 days) sent as `Authorization: Bearer <token>` **or** the httpOnly cookie `agro_token` (set by `/auth/login` and `/auth/register`).
**Validation.** Global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`): unknown fields → `400`.
**Errors.** Standard Nest shape `{ statusCode, message, error }`. Success envelopes are `{ success: true, data }` for most modules; `auth`, `marketplace`, `services`, `crops`, `analytics`, `api-usage` return raw payloads.
**Rate limits.** 120 requests/min per client on every route, **10/min on `/auth/*`** (`429`). Client identity is `CF-Connecting-IP`. Health endpoints are exempt.
Legend — 🔓 public · 🔐 JWT required · 👑 admin role required.

Legend addition — 🔑 static bearer token.

Every route below is asserted by `backend/src/routes.contract.spec.ts` (auth wiring, 401 matrix, validation) and, with a real database, by `backend/test/api.e2e-spec.ts`. The live stack is checked by `scripts/smoke.sh`.

## Platform

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | 🔓 | API metadata (`name`, `status`, `healthPath`) |
| GET | `/health` | 🔓 | Liveness (`status`, `uptimeSeconds`, `environment`) — used by Docker `HEALTHCHECK` |
| GET | `/api/health` | 🔓 | Terminus check: database ping + heap/RSS < 300 MB |
| GET | `/metrics` | 🔑 | Prometheus metrics. `404` unless `METRICS_TOKEN` is set, then `Authorization: Bearer <METRICS_TOKEN>` (`401` otherwise) |
| GET | `/api/docs` | — | Swagger UI, only when `API_DOCS_ENABLED=true` (off in prod) |

## Auth — `/auth`

| Method | Path | Auth | Body | Result |
|---|---|---|---|---|
| POST | `/auth/register` | 🔓 | `fullName, phone, password(≥6), region, district, email?, role?` (`farmer`\|`seller`\|`buyer`) | `201 {access_token, user}` + cookies. `409` duplicate phone, `403` role `admin` |
| POST | `/auth/login` | 🔓 | `phone, password` | `200 {access_token, user}` + cookies. `401` bad credentials (same message for unknown phone) |
| POST | `/auth/otp/send` | 🔓 | `phone` | `201 {message, expiresAt}`; 4-digit code valid 5 min; `429` if re-requested within 30 s (delivered via server log until an SMS provider is connected) |
| POST | `/auth/otp/verify` | 🔓 | `phone, code` | `200 {valid:true}` / `401`. `code` must be 4 digits; 5 wrong attempts burn the code |
| POST | `/auth/password/reset` | 🔓 | `phone, code, newPassword(6–72)` | `200`; code is single-use. `401` invalid code/unknown user, `400` weak password |
| POST | `/auth/logout` | 🔓 | – | `200 {success:true}`, clears cookies |

## Users — `/users`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users/me` | 🔐 | Current profile (no password hash) |
| PATCH | `/users/me` | 🔐 | Update `fullName, phone, email, region, district`. `409` phone taken; `role` etc. → `400` |

## Farm plots — `/farm-plots`

Owner-only (admins may access all). Non-owner → `403`, missing → `404`.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/farm-plots` | 🔐 | Create plot (`title, region, district, areaSizeHectares, geometry(Polygon GeoJSON), cropType, seasonYear, village?, fillColor?, plantingDate?, plantingStatus?`). Returns risk/competition analysis |
| GET | `/farm-plots` | 🔐 | Plots visible to the caller |
| GET | `/farm-plots/mine` | 🔐 | Own plots |
| PATCH | `/farm-plots/:id` | 🔐 | Update `title, region, district, village, areaSizeHectares, cropType, fillColor, seasonYear, plantingDate, plantingStatus`. Any other field (`userId`, `geometry`, …) → `400` |
| DELETE | `/farm-plots/:id` | 🔐 | Delete |
| GET | `/farm-plots/:id/competition?radiusKm=5` | 🔐 | Competition score / marketplace visibility |
| GET | `/farm-plots/:id/season-summary` | 🔐 | Seasonal finance summary |
| GET | `/farm-plots/:plotId/ai-advice` | 🔐 | AI advice (OpenAI when `OPENAI_API_KEY` set, otherwise a rule-based fallback) |
| POST | `/farm-plots/:plotId/activities` | 🔐 | Journal entry: `type`(`watering,fertilizer,pesticide,planting,harvest,inspection,expense`), `activityDate`, `description?`(≤1000), `photoUrl?`, `costKzt?`(≥0), `materials?[]` |
| GET | `/farm-plots/:plotId/activities` | 🔐 | List journal entries |
| DELETE | `/farm-activities/:id` | 🔐 | Delete an entry (owner) |

## Marketplace — `/marketplace/listings`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/marketplace/listings` | 🔓 | Active + visible listings. Query: `category`, `search`, `sortBy`, `sortOrder` (`ASC`\|`DESC`) |
| GET | `/marketplace/listings/my` | 🔐 | Own listings incl. hidden |
| GET | `/marketplace/listings/:id` | 🔓 | One listing with seller trust data. `404` |
| POST | `/marketplace/listings` | 🔐 | Create (`cropId, title, category, quantity≥0, unit, price≥0, currency, availableFrom, location, …`) |
| PATCH | `/marketplace/listings/:id` | 🔐 | Update own listing (`404` if not yours) |
| DELETE | `/marketplace/listings/:id` | 🔐 | Delete own listing |

## Orders — `/orders`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/orders` | 🔐 | `items[{listingId(uuid), quantity>0}]` (1–50 lines). Price, title and unit are taken from the listing. `404` unknown listing, `400` inactive / own listing / quantity above stock / client-supplied price |
| GET | `/orders/my` | 🔐 | Own orders, newest first |

## Chats — `/chats`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/chats/direct` | 🔐 | `participantUserId(uuid), listingId?` — creates or reuses a direct chat |
| GET | `/chats` | 🔐 | Own chats |
| GET | `/chats/channels` | 🔐 | Community channels (auto-join) |
| GET | `/chats/:id/messages` | 🔐 | Chat with messages (members only) |
| POST | `/chats/:id/messages` | 🔐 | `body(≤1000), type?, attachmentUrl?, metadata?` (members only) |

## Services — `/services`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/services/categories` | 🔓 | Category list |
| GET | `/services` | 🔓 | Public catalogue (filters) |
| GET | `/services/:id` | 🔓 | One service |
| GET | `/services/mine` | 🔐 | Own services |
| GET | `/services/providers/me` | 🔐 | Own provider profile |
| POST | `/services` | 🔐 | Create (`category, title, description, priceFrom, country, region, district, locality, …`) |
| PATCH | `/services/:id` | 🔐 | Update (owner) |
| DELETE | `/services/:id` | 🔐 | Delete (owner) |

## Crops catalogue — `/crops`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/crops` | 🔓 | All crops |
| POST | `/crops` | 🔐👑 | Create crop `{name, category, color?, icon?}`; `403` for non-admins |
| PATCH | `/crops/:id` | 🔐👑 | Update crop (validated partial DTO, `:id` must be a UUID) |

## Analytics — `/analytics` (public, PostGIS)

Coordinates must be finite numbers (`lat` −90…90, `lng` −180…180, `0` is valid), `radiusKm` 0–1000; otherwise `400`.

| Method | Path | Description |
|---|---|---|
| GET | `/analytics/region/:region` | Hectares and plot count per crop in a region |
| GET | `/analytics/overproduction-risk?lat&lng&cropType&radiusKm=50` | `{cropType, radiusKm, totalHectaresPlanted, riskLevel: LOW≤200<MEDIUM≤500<HIGH}` |
| GET | `/analytics/crop-density?lat&lng&radiusKm=50` | Hectares per crop around a point |

## Weather — `/weather` (public, Open-Meteo)

| Method | Path | Description |
|---|---|---|
| GET | `/weather?lat&lng\|lon` | Current weather (default route). Missing longitude → `{success:false}` |
| GET | `/weather/current?lat&lng` | Current weather. `400` if a coordinate is missing |
| GET | `/weather/forecast?lat&lng&days=7` | 1–14 day forecast (`days` is clamped) |
| GET | `/weather/alerts?region&district` | Agro alerts |

## Dashboard & info centre (🔐)

| Method | Path | Description |
|---|---|---|
| GET | `/dashboard`, `/dashboard/home` | Home dashboard (alias) |
| GET | `/dashboard/notifications` | Notifications |
| GET | `/dashboard/insights` | Insights |
| GET | `/info-center/categories` | Categories |
| GET | `/info-center/feed?category&featured` | Feed |
| GET | `/info-center/articles?category&featured` | Alias of `feed` |

## API usage — `/api-usage`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api-usage/increment/:provider` | 🔐 | Increment a quota counter |
| GET | `/api-usage/stats` | 🔐 | Counters (`google_maps` limit 28 500/month) |

## GIS service (Go/Fiber, port 8080 → host 3286)

| Method | Path | Description |
|---|---|---|
| GET | `/health` | `{status:"ok"}` |
| GET | `/api/overpass?s&w&n&e` | Farmland polygons for a bbox via Overpass API. `400` for missing/non-numeric/out-of-range/inverted bbox or a side above 1°; `503` when Overpass is unavailable; cached 10 min (max 256 entries); 60 req/min per client |
