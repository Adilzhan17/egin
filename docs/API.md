# CORE API

Interactive schema: http://localhost:8000/docs. OpenAPI JSON: `/openapi.json`.
The web application proxies `/api/*` to CORE (without the `/api` prefix) and `/ws/*` to its WebSocket endpoint. Only localhost ports are published by default.

Authentication uses an opaque, database-backed, HttpOnly session cookie. State-changing browser requests enforce the configured origin. Registration uses email; login also accepts imported legacy phone accounts, upgrading bcrypt hashes to Argon2 after successful verification. Authorization follows organization membership, field access and conversation membership.

| Domain | CORE routes |
| --- | --- |
| Auth | `POST /auth/register`, `/auth/login`, `/auth/logout`; `GET /auth/me` |
| Farms | `GET/POST /farms`, `POST /onboarding`, organization members |
| GIS | `GET/POST /fields`; `GET/PUT/DELETE /fields/{id}`; `/fields/{id}/versions`; `/location`, `/geocode`, `/spatial/search`, `/admin/boundaries`, `/admin/regions` |
| Environment | `/fields/{id}/weather`, `/weather/debug?fieldId=…`, `/weather`, `/soil`, `/climate` |
| Analysis | `POST /fields/{id}/analyze`; `GET /fields/{id}/analysis`, `/ml/model`; `POST /ml/crop-suitability`, `/ml/field-risk` |
| AI | `GET /assistant/provider`, `/assistant/history`; `POST /assistant/stream` with `{question, field_id?}`; SSE meta/tool/token/done/error |
| Marketplace | `GET/POST /listings`; `GET/PUT/DELETE /listings/{id}`; favorites and image upload/delete |
| Community | conversations, messages, read watermarks; `WS /ws/conversations/{id}` with session cookie and optional replay watermark |
| Activity | tasks create/list/complete, field notes, notifications, dashboard |
| News | news feed, interests get/update |

Field geometry is GeoJSON Polygon; revisions reject conflicting updates. Area and centroid are computed in PostGIS. Listings use `product`, `machinery_rental`, `service`, `job`; owner-only edits/deletes are enforced. Message UUIDs make retries idempotent. WebSocket delivery supplements durable PostgreSQL messages and supports reconnect replay.

The previous Nest/Go contracts remain in Git history at original revision `846f6f7`; they are not active endpoints of this modular monolith.
