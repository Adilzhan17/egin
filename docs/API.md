# Egin API reference

Base URLs: `https://egin-api.perricheno.com` (prod) · `http://localhost:3284` (docker) · `http://localhost:3000` (dev).
Frontend: `https://egin.perricheno.com`.

**Auth.** JWT (7 days) sent as `Authorization: Bearer <token>` **or** the httpOnly cookie `agro_token` (set by `/auth/login` and `/auth/register`).
**Validation.** Global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`): unknown fields → `400`.
**Errors.** Standard Nest shape `{ statusCode, message, error }`. Success envelopes are `{ success: true, data }` for most modules; `auth`, `marketplace`, `services`, `crops`, `analytics`, `api-usage` return raw payloads.
Legend — 🔓 public · 🔐 JWT required · ⚠️ should be protected, see [CODE_REVIEW.md](CODE_REVIEW.md).

Every route below is asserted by `backend/src/routes.contract.spec.ts` (auth wiring, 401 matrix, validation) and, with a real database, by `backend/test/api.e2e-spec.ts`. The live stack is checked by `scripts/smoke.sh`.

## Platform

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | 🔓 | API metadata (`name`, `status`, `healthPath`) |
| GET | `/health` | 🔓 | Liveness (`status`, `uptimeSeconds`, `environment`) — used by Docker `HEALTHCHECK` |
| GET | `/api/health` | 🔓 | Terminus check: database ping + heap/RSS < 300 MB |
| GET | `/metrics` | 🔓 ⚠️ | Prometheus metrics (SEC-10) |
| GET | `/api/docs` | — | Swagger UI, only when `API_DOCS_ENABLED=true` (off in prod) |

## Auth — `/auth`

| Method | Path | Auth | Body | Result |
|---|---|---|---|---|
| POST | `/auth/register` | 🔓 | `fullName, phone, password(≥6), region, district, email?, role?` (`farmer`\|`seller`\|`buyer`) | `201 {access_token, user}` + cookies. `409` duplicate phone, `403` role `admin` |
| POST | `/auth/login` | 🔓 | `phone, password` | `200 {access_token, user}` + cookies. `401` bad credentials (same message for unknown phone) |
| POST | `/auth/otp/send` | 🔓 | `phone` | `201 {message, expiresAt}`; 4-digit code valid 5 min (currently only written to server log) |
| POST | `/auth/otp/verify` | 🔓 | `phone, code` | `200 {valid:true}` / `401` |
| POST | `/auth/password/reset` | 🔓 | `phone, code, newPassword` | `200`; code is single-use. `401` invalid code/unknown user |
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
| PATCH | `/farm-plots/:id` | 🔐 | Update (body is unvalidated — SEC-05) |
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
| POST | `/orders` | 🔐 | `items[{listingId,title,quantity>0,unit,priceAtPurchase}]` → order with computed `totalPrice` (client-supplied prices — SEC-06) |
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
| POST | `/crops` | 🔓 ⚠️ | Create crop `{name, category, color?, icon?}` (SEC-04) |
| PATCH | `/crops/:id` | 🔓 ⚠️ | Update crop (SEC-04) |

## Analytics — `/analytics` (public, PostGIS)

| Method | Path | Description |
|---|---|---|
| GET | `/analytics/region/:region` | Hectares and plot count per crop in a region |
| GET | `/analytics/overproduction-risk?lat&lng&cropType&radiusKm=50` | `{cropType, radiusKm, totalHectaresPlanted, riskLevel: LOW≤200<MEDIUM≤500<HIGH}` |
| GET | `/analytics/crop-density?lat&lng&radiusKm=50` | Hectares per crop around a point (**currently returns 500 — BUG-02**) |

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
| POST | `/api-usage/increment/:provider` | 🔓 ⚠️ | Increment a quota counter (SEC-07) |
| GET | `/api-usage/stats` | 🔐 | Counters (`google_maps` limit 28 500/month) |

## GIS service (Go/Fiber, port 8080 → host 3286)

| Method | Path | Description |
|---|---|---|
| GET | `/health` | `{status:"ok"}` |
| GET | `/api/overpass?s&w&n&e` | Farmland polygons for a bbox via Overpass API (cached). `400` when any bbox param is missing |
