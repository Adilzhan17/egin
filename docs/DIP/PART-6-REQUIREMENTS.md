# 6. Requirements Specification

## 6.1 Conventions

**Identifiers.** `FR-<area>-<n>` for functional requirements and `NFR-<area>-<n>` for non-functional requirements. IDs are stable. A requirement is never renumbered, only marked *Deprecated*.

**Priority (MoSCoW).**

| Priority | Meaning for the diploma |
|---|---|
| **M — Must** | Mandatory for the final defence. The project aim is not met without it. |
| **S — Should** | Important, planned for the final version. It can be descoped only with a written justification. |
| **C — Could** | Desirable if time allows. It does not affect achievement of the aim. |
| **W — Won't (this stage)** | Explicitly out of scope (see 1.6). It is listed so that the boundary can be verified. |

**Verification method.**

| Code | Method |
|---|---|
| **T** | Automated test, run in CI by `pnpm test` (server, unit) or by a Playwright scenario in Chromium and WebKit. |
| **D** | Demonstration on a smartphone (Capacitor Android/iOS build or mobile browser / installed PWA) on the staging environment `dev-egin.perricheno.com`. |
| **I** | Inspection of code (`server.mjs`, `prepare-native.mjs`, etc.), configuration or database schema. |
| **A** | Analysis or measurement (Lighthouse, timing, log review). |

**Status** describes implementation identified in the source, not automatic acceptance of every criterion: *Implemented*, *Partial*, *Planned*, or *Out of scope*. The documentation review uses commit `8cc0ca3f73052b030dcddb990b8a5460be9ddcdf` (23 October 2026). No submission tag existed at that historical inspection. The later `prob-period-1` tag packages this report and preserves the original review baseline. Executed checks, environment limitations and unmeasured targets are recorded separately in [Part 9](PART-9-VERIFICATION-EVALUATION.md). Capacitor configuration does not by itself establish a tested Android/iOS release.

**Traceability.** The *Source* column links each requirement to literature (3.x, reference `[n]`), owner-defined project constraints (Section 2.2, E2-05), a hypothesis (Section 2.3) or a technology decision (5.x). Owner constraints are not a signed external client agreement; the team-reported discussions are distinguished from feature-level findings in [Part 2](PART-2-EVIDENCE-OF-RELEVANCE.md).

**Rule for "Must".** Every **M** requirement has at least one acceptance criterion that is binary (pass/fail) and a concrete verification method (`T`, `D`, `A` or `I` on exact code lines). This satisfies the committee criterion *"whether the fulfilment of each mandatory requirement can be verified"*.

---

## 6.2 Actors

| Actor | Description |
|---|---|
| **Farmer** | Owner or manager of a small farm. Main user of plots, weather, records and reports across Android, iOS (Capacitor) and Web PWA. |
| **Field worker** | Agronomist or brigadier. Creates records with photo and audio in the field, often without a network. |
| **Accountant** | Maintains the farm's 1C infobase and provides read-only OData access. |
| **External developer** | Integrates with EGIN through the `/v1` API and the developer portal. |
| **Operator** | Project team. Deploys, monitors and restores the service. |
| **External systems** | EGKN public cadastral map, Open-Meteo, ElDala.kz, 1C OData, Web Push services, device authenticator (WebAuthn / Capacitor Passkey). |

---

## 6.3 Functional requirements

### 6.3.1 Authentication and account (AUTH)

**Platform qualification.** Web passkey support is implemented. The checked-in [`native-config.json`](../../apps/mobile/src/shared/native-config.json) has `iosPasskeyReady: false`; the native iOS passkey path therefore remains unavailable until the required association/configuration is supplied. A web test result does not accept the full native requirement.

| ID | Requirement | Pri. | Acceptance criteria | Verif. | Source | Status |
|---|---|---|---|---|---|---|
| FR-AUTH-1 | The system shall let a user register and sign in with a passkey (WebAuthn in browsers and `@capgo/capacitor-passkey` in Capacitor Android/iOS shells), without a password. | M | (1) Registration creates a profile and one passkey. (2) The server rejects an assertion with a wrong challenge, RP ID, origin or signature, or without user verification (each case returns 4xx and creates no session). (3) Biometric data is never sent to the server. | T (`api.test.mjs`, `auth.cjs` with a virtual authenticator), D | 5.4, [10], 2.2 E2-05 | Partial — web implemented; native iOS passkey configuration pending |
| FR-AUTH-2 | At registration the system shall issue a one-time recovery code and let the user restore access with it. | M | (1) The code is shown once, and only its SHA-256 hash is stored. (2) Successful recovery invalidates the old code and issues a new one. (3) Reusing a code is rejected. | T (`api.test.mjs`, `auth.cjs`) | [10] (recovery problem), H3 (2.3) | Implemented |
| FR-AUTH-3 | A signed-in user shall be able to add a second passkey and delete passkeys, except the last one. | M | Deleting the last passkey is refused with 409 and an explanatory message. After deletion, the removed key cannot sign in. | T (`auth.cjs`) | [10], [11] | Implemented |
| FR-AUTH-4 | The system shall support sign-in on another device by QR: the new device shows a QR, and the signed-in phone confirms it with a 6-digit code match and a passkey. | S | (1) The QR expires after 2 minutes. (2) The session is issued once, only to the browser that created the QR. (3) Approval without a fresh passkey assertion is impossible. (4) A foreign-origin QR is rejected. | T (`qr-auth.test.mjs`, `auth.cjs`, `qr-scanner.cjs`) | 5.4 | Implemented |
| FR-AUTH-5 | The system shall show eGov sign-in as "В разработке" and shall never present the EGIN QR as an eGov QR. | M | The UI contains no active eGov login control, and no EGIN QR screen mentions eGov as its issuer. | I, D | 2.2 E2-05, 5.4 | Implemented |
| FR-AUTH-6 | The home screen, weather and news shall be available without signing in. A guest may keep local plot data and view locally available records; server synchronisation and private server data require authentication. | S | An anonymous user opens `/` and can save a plot locally. `/api/sync` without a session returns 401. Private `/v1` resources require a valid scoped API key rather than a browser session. | T (`browser.cjs`, `api.test.mjs`, `developer.test.mjs`), I (`App.tsx`, `FieldsPage.tsx`) | [1] (low entry barrier) | Implemented |

### 6.3.2 Plots and cadastre (FLD)

| ID | Requirement | Pri. | Acceptance criteria | Verif. | Source | Status |
|---|---|---|---|---|---|---|
| FR-FLD-1 | The user shall be able to find a plot by its 11–12-digit cadastral number and see its boundary before saving. | M | (1) Spaces, hyphens and colons in the number are normalised. (2) For a valid existing number the contour is shown on the map in WGS84, reprojected from district UTM EPSG:32639–32645. (3) Nothing is saved until the user confirms "Add". (4) An invalid or unknown number gives a clear error, not an empty plot. | T (`cadastre.test.mjs`, `land.test.mjs`, `map-picker.cjs`) | 1.7, H2 (2.3) | Implemented |
| FR-FLD-2 | The user shall be able to select a plot by tapping the map at zoom ≥ 17. | S | A tap inside a contour selects it, and a tap inside an inner ring (hole) does not. Several exact matches are offered for choice. | T (`cadastre.test.mjs`, `map-picker.cjs`) | 1.7 | Implemented |
| FR-FLD-3 | The system shall store a public snapshot of plot details (address, purpose, category, registered area, cadastral value, source URL and fetch time) and shall not store personal data. | M | (1) Personal names, IIN/BIN of individuals and contacts are absent from the API response and the database. (2) Unknown fields are rejected before the transaction. (3) Missing data is shown as "not provided", never as zero or "no owner". | T (`cadastre-details.test.mjs`), I | Legal/ethical constraint, 1.8 | Implemented |
| FR-FLD-4 | The user shall be able to import and export plot boundaries as GeoJSON. | M | Import accepts files ≤ 2 MiB, ≤ 200 features and ≤ 2,000 vertices in total. It rejects self-intersecting or touching rings with a message. Export, then re-import, gives the same geometry, including holes. | T (`land.test.ts`, `workspace.cjs`) | 1.8 (fallback if EGKN changes) | Implemented |
| FR-FLD-5 | If no boundary is available, the user shall be able to create a plot from current geolocation as a point. | S | The point plot is saved offline and used for weather. The UI marks it as "without boundaries". | T (`browser.cjs`) | 1.8 | Implemented |
| FR-FLD-6 | Saved plot boundaries shall be available offline. | M | After a successful load, switching the device to airplane mode and reloading still shows the list of plots and their contours (the basemap may be missing). | T (`browser.cjs`, offline reload), D | [2], [8] | Implemented |
| FR-FLD-7 | The system shall show both the computed geometric area and the registered area, labelled separately. | C | Both values are visible on the plot passport and are never merged. | T (`parcel-passport.cjs`) | Data honesty | Implemented |
| FR-FLD-8 | A plot consisting of several separate polygons. | W | — | — | 1.6 | Out of scope |

### 6.3.3 Offline storage and synchronisation (SYNC)

| ID | Requirement | Pri. | Acceptance criteria | Verif. | Source | Status |
|---|---|---|---|---|---|---|
| FR-SYNC-1 | All create, edit and delete operations shall work without a network and shall be queued locally (IndexedDB). | M | In offline mode the user creates a plot and a record with a photo, edits it and deletes another record. After reload, all changes are still present and shown as "waiting for sync". | T (`workspace.cjs`, `sync-ui.cjs`) | [2], [8], 5.3 | Partial |
| FR-SYNC-2 | The queue shall be sent automatically when the network returns, when the app opens and every 60 s, and manually on request. | M | After the connection is restored, the queue empties without user action. The pending counter reaches 0 and the server holds the records. | T (`workspace.cjs`, `sync-batches.test.ts`) | 5.3 | Implemented |
| FR-SYNC-3 | Each record shall carry a version. A concurrent change on two devices shall produce an explicit conflict that the user resolves. Silent overwriting is not allowed. | M | Two browser contexts edit the same record offline and then sync. The second sync shows a conflict with both versions. After the user's choice, both devices converge to the chosen version. | T (`workspace.cjs`, two browsers; `api.test.mjs`; `conflict-summary.test.ts`) | [8], [9], 5.3 | Implemented |
| FR-SYNC-4 | Deletions shall be synchronised as tombstones, so a deleted record does not reappear. | M | A record deleted on device A disappears on device B after sync, and does not come back after B syncs its older copy. | T (`api.test.mjs`, `workspace.cjs`) | 5.3 | Implemented |
| FR-SYNC-5 | Repeating a sync request with the same payload shall be idempotent. | M | Sending the same batch twice creates no duplicates and does not increase versions. | T (`api.test.mjs`) | 1.7 | Implemented |
| FR-SYNC-6 | Background sending shall use Background Sync where the browser supports it. Elsewhere (including WebKit and Capacitor shells), sending continues when the app is opened. | S | In Chromium a queued change is sent by the service worker after the tab is closed. In WebKit/Capacitor it is sent on the next opening. | T (`sync-ui.cjs`), D | 5.3 | Implemented |
| FR-SYNC-7 | Attachments (photo, audio) shall be downloaded on a second device after sync. | S | A photo attached on device A opens on device B after sync, and is still available offline after that. | T (`workspace.cjs`) | — | Implemented |
| FR-SYNC-8 | Data of different profiles on one device shall be isolated. | M | After switching profiles, no records, queue entries or cached attachments of the previous profile are visible or sent. | T (`api.test.mjs` isolation, `workspace.test.ts`) | Security | Implemented |

### 6.3.4 Weather (WTH)

| ID | Requirement | Pri. | Acceptance criteria | Verif. | Source | Status |
|---|---|---|---|---|---|---|
| FR-WTH-1 | The system shall show current weather, an hourly forecast and a 10-day forecast for the coordinates of the selected plot. | M | Changing the selected plot changes the request coordinates. Data of another point is never shown for the plot. | T (`open-meteo.test.ts`, `home-weather.cjs`, `weather.test.ts`) | H5 (2.3), 5.6 | Implemented |
| FR-WTH-2 | The last forecast shall be cached per coordinates for up to 24 h and marked as stale when it is outdated or shown offline. | M | Offline, the cached forecast is shown with its timestamp and a "stale" label. It is never presented as a current warning. | T (`home-weather.cjs`, `weather-presentation.test.ts`) | [2] | Implemented |
| FR-WTH-3 | Missing indicators (for example heat index or thunderstorm probability) shall be shown as "no data", never as invented values. | S | With a fixture that lacks a field, the card shows "no data". | T (`weather-presentation.test.ts`) | Data honesty | Implemented |

### 6.3.5 Field records, events and reports (REC, EVT, RPT)

**Current UI boundary.** `App.tsx` routes both `/events` and `/journal` to `EventsPage`, which displays existing records without a manual diary composer. The underlying record/attachment store and sync mechanisms remain, and `workspace.cjs` seeds legacy records directly for its tests. FR-REC-1 and the manual-record portion of FR-SYNC-1 are therefore **Partial** as end-user requirements. Seeded tests of FR-SYNC-3/7 establish data mechanics, not a current user-facing diary editor. Restoring an editor or revising that acceptance scope requires an explicit product decision; see [Part 8](PART-8-UX-PROTOTYPE.md).

| ID | Requirement | Pri. | Acceptance criteria | Verif. | Source | Status |
|---|---|---|---|---|---|---|
| FR-REC-1 | The user shall be able to attach photos and audio to a plot record, offline as well. | M | A photo (`image/jpeg\|png\|webp`) or audio clip (`audio/webm\|ogg\|mp4\|mpeg\|wav`) is saved offline and uploaded via `PUT /api/assets/:id`. Unsupported MIME types are rejected with 400 (`api.test.mjs`), and payloads > 8 MB are rejected by `express.raw({limit:'8mb'})` in `server.mjs:163`. | T (`api.test.mjs`, `browser.cjs`, `workspace.cjs`), I (`server.mjs:162-168`) | [2] | Partial |
| FR-EVT-1 | The event centre shall show the weather state of the selected plot, boundary imports, sync conflicts, 1C exchange history and sensor registry state, with filters by source, plot and severity. | S | Each event type appears after its trigger. Filters reduce the list correctly. The action button opens the related screen (forecast, conflict, connection). | T (`events.cjs`, `events.test.ts`) | Single screen, [2] | Implemented |
| FR-RPT-1 | The user shall be able to export a report for a selected plot and period as HTML (with photos and audio), CSV and JSON. | M | (1) All three formats are produced offline from the local copy. (2) CSV cells that start with `= + - @` are neutralised. (3) HTML escapes user text. (4) The files are shared through Web Share / Capacitor Filesystem & Share, or downloaded where sharing is unsupported. | T (`reports.cjs`, `reports.test.ts`) | 1.4 | Implemented |

### 6.3.6 Sensors (SNS)

| ID | Requirement | Pri. | Acceptance criteria | Verif. | Source | Status |
|---|---|---|---|---|---|---|
| FR-SNS-1 | The user shall be able to register a sensor by scanning a QR code (camera or image) or by typing its ID, and link it to a plot. | S | Only the `egin://sensor?...` and `{"kind":"egin-sensor"}` formats are accepted. An ID outside `[A-Za-z0-9_-]{3,64}` is rejected. URLs in the QR are never opened automatically. | T (`qr-scanner.cjs`, `qr-recognition.cjs`, `workspace.cjs`) | 1.6 | Implemented |
| FR-SNS-2 | The UI shall not present a registered sensor as connected or as delivering data. | M | No sensor screen shows readings or an "online" state while there is no telemetry. | I, T (`readiness.cjs`) | [5]–[7] | Implemented |
| FR-SNS-3 | Receiving sensor telemetry and automatic alerts. | W | — | — | 1.6 | Out of scope |

### 6.3.7 Home screen and 3D (HOME)

| ID | Requirement | Pri. | Acceptance criteria | Verif. | Source | Status |
|---|---|---|---|---|---|---|
| FR-HOME-1 | The home screen shall open with a 3D crop scene, followed by a summary of the selected plot (boundaries and EGKN snapshot, forecast freshness, linked sensors, next step). | M | At 360×800 and 390×844 the 3D canvas is the first element and is fully visible above the fold. The summary reflects the selected plot. | T (`browser.cjs`, `home-weather.cjs`) | 2.2 E2-05 | Implemented |
| FR-HOME-2 | The 3D scene shall reflect the real weather of the plot (time of day, rain, snow, clouds, wind). Manual preview shall not change the real forecast or the crop phase. | S | With a weather fixture of "rain, night", the scene shows rain and a night palette. | T (`home-weather.cjs`) | — | Implemented |
| FR-HOME-3 | The 3D scene shall not be presented as a digital twin and shall not show a crop phase computed from invented data. | M | The UI labels the scene as an example until analytics is connected. | I, D | [5]–[7] | Implemented |
| FR-HOME-4 | The home screen shall show an auto-updated agricultural news feed (ElDala.kz) and keep the last feed offline. | C | If the source fails, the last feed is returned with `stale=true`. Without a cache the server returns 503 and the UI shows an error state. | T (`news.test.mjs`, `news.cjs`) | — | Implemented |

### 6.3.8 Integrations and external API (INT, API)

| ID | Requirement | Pri. | Acceptance criteria | Verif. | Source | Status |
|---|---|---|---|---|---|---|
| FR-INT-1 | The user shall be able to connect a 1C infobase by its standard OData URL and credentials. The connection is checked by reading `$metadata` before it is saved. | S | Wrong credentials or an invalid URL are rejected before saving. The password is never returned by any API. | T (`one-c.test.mjs`, `one-c-transport.test.mjs`, `services.cjs`) | 2.2 E2-05, H4 | Implemented |
| FR-INT-2 | 1C import shall be read-only and idempotent, and shall preserve manual EGIN edits. | S | (1) Repeating an import creates no duplicates. (2) A record edited in EGIN is skipped and logged as a conflict. (3) A row deleted in 1C does not delete EGIN data. (4) No write requests are sent to 1C. | T (`one-c-flow.test.mjs`) | 2.2 E2-05 | Implemented |
| FR-API-1 | External developers shall access profile, fields, journal, sensor registry, attachments, weather and news through the `/v1` API with an open key and a secret key. | S | (1) A request without a key, with a revoked key or with an expired key returns 401. (2) A key without the required scope returns 403. (3) Updates without a correct `If-Match` return 412. | T (`developer.test.mjs`, `developers.cjs`) | 2.2 E2-05 | Implemented |
| FR-API-2 | The developer portal shall issue, rotate and revoke keys with chosen scopes and an expiry of 7, 30, 90 or 365 days. The secret is shown only once. | S | After rotation, the old pair is rejected immediately. The secret is not retrievable after the creation dialog is closed. | T (`developers.cjs`) | 2.2 E2-05 | Implemented |
| FR-API-3 | The public API reference (`/openapi.json`) shall match the installed routes. | S | The route-inventory test fails if a route is missing from `catalog.json`, or listed there but not installed. | T (`developer.test.mjs`) | [Archived owner constraints](https://github.com/Adilzhan17/egin/blob/614ca675a78aef0900e7dd375fb85f398e1d7ee4/AGENTS.md) | Implemented |
| FR-INT-3 | Contractual cadastral access via LandCoordinates (Smart Bridge), eGov sign-in, AgroSignal and AgroStream data exchange. | W | Shown as "В разработке". | I | 1.6 | Out of scope |

### 6.3.9 Notifications (PUSH)

| ID | Requirement | Pri. | Acceptance criteria | Verif. | Source | Status |
|---|---|---|---|---|---|---|
| FR-PUSH-1 | The user shall be able to subscribe the current device to Web Push (`/api/push/subscribe`), send a test notification (`/api/push/test`) and unsubscribe (`/api/push/unsubscribe`). | C | Only HTTPS endpoints on allowlisted push domains (`fcm.googleapis.com`, `web.push.apple.com`, `updates.push.services.mozilla.com`) are accepted (≤ 20 subscriptions per user, `server.mjs:171-174`). Test push arrives on Android and installed iPhone PWA. | I (`server.mjs:170-174`), D | — | Implemented |

---

## 6.4 Non-functional requirements

### 6.4.1 Usability and accessibility (USE)

| ID | Requirement | Pri. | Acceptance criteria / metric | Verif. | Source |
|---|---|---|---|---|---|
| NFR-USE-1 | Phone-first layout for 320–480 px with safe-area insets across Web PWA and Capacitor shells. | M | At 320, 360, 390 and 430 px widths there is no horizontal scrolling. Content does not go under the notch or the home indicator (`env(safe-area-inset-*)`). | T (Playwright viewport checks in `browser.cjs`), D | [1], 2.2 E2-05 |
| NFR-USE-2 | White and dark green palette. The active bottom-navigation tab changes icon and text colour, with no filled tab background. | M | Visual check on Chromium and WebKit screenshots. Text contrast ≥ 4.5:1 (WCAG 2.1 AA). | A (Lighthouse/axe), I | 2.2 E2-05 |
| NFR-USE-3 | Touch targets of at least 44×44 CSS px. | S | An axe/Lighthouse "tap targets" audit passes on the main screens. | A | [1] (digital literacy) |
| NFR-USE-4 | Adding a plot by cadastral number shall take less time than drawing its contour manually. | S | In a usability session (n ≥ 3), the median time by number is lower than the median time by drawing. Target: ≤ 60 s from opening "Plots" to a saved plot. | A (Section 9) | H2 (2.3) |
| NFR-USE-5 | The interface language is Russian, and every user-facing error states what to do next. | S | No raw error codes or stack traces appear in the UI (checked on fixture failures). | T, I | [3] |

### 6.4.2 Performance (PERF)

| ID | Requirement | Pri. | Acceptance criteria / metric | Verif. | Source |
|---|---|---|---|---|---|
| NFR-PERF-1 | Fast first load on a mobile network. | S | Lighthouse mobile profile (Slow 4G, 4× CPU) on the staging site: LCP ≤ 4.0 s, Performance score ≥ 70. | A (Section 9) | [2] |
| NFR-PERF-2 | Repeat load from the service worker cache or local Capacitor bundle works offline. | M | A second load in airplane mode renders the shell and the saved plots. | T (`app-update.cjs`, `browser.cjs`) | [2], [12] |
| NFR-PERF-3 | The 3D scene shall not drain the battery while idle. | S | With no interaction, or with the tab hidden or scrolled off-screen, the render loop stops (0 frames requested for 5 s). | T (`scene-performance.cjs`) | — |
| NFR-PERF-4 | Server responses for cadastral search are bounded. | M | Time limit 20 s, response ≤ 5 MiB, ≤ 2,000 points. If a limit is exceeded, the server returns a controlled error. | T (`cadastre.test.mjs`) | 1.7 |

### 6.4.3 Reliability and availability (REL)

| ID | Requirement | Pri. | Acceptance criteria / metric | Verif. | Source |
|---|---|---|---|---|---|
| NFR-REL-1 | No data loss in the offline-to-online transition. | M | In the sync test suite, 100% of queued operations reach the server or end in an explicit conflict, with 0 silent losses. | T (`workspace.cjs`, `api.test.mjs`) | [8] |
| NFR-REL-2 | Zero-downtime deployment and fast rollback. | M | During `deploy/manage.py deploy production`, `/api/health` keeps answering 200. `rollback production` restores the previous slot in ≤ 60 s. | D, A (deploy log) | 5.1 |
| NFR-REL-3 | Consistent backups. | M | Every deploy creates an online SQLite copy in `/data/backups/`, plus the 1C key. A restore drill on staging opens the copy without integrity errors (`PRAGMA integrity_check` = ok). | D, A | 5.2 |
| NFR-REL-4 | Degradation when external sources fail. | S | If EGKN, Open-Meteo or ElDala is unavailable, the app stays usable. It shows cached data with a label and offers GeoJSON or geolocation as the plot fallback. | T (news/weather fixtures), D | 1.8 |
| NFR-REL-5 | Only backward-compatible database migrations. | M | Each migration is reviewed. The previous release runs against the migrated schema in staging before the production switch. | I, D | [Archived owner constraints](https://github.com/Adilzhan17/egin/blob/614ca675a78aef0900e7dd375fb85f398e1d7ee4/AGENTS.md) |

### 6.4.4 Security and privacy (SEC)

| ID | Requirement | Pri. | Acceptance criteria / metric | Verif. | Source |
|---|---|---|---|---|---|
| NFR-SEC-1 | Session cookies are HttpOnly, Secure and SameSite=Lax (Strict for QR). Sessions expire after 30 days. | M | `HttpOnly` and `SameSite=Lax` verified in `api.test.mjs:27`; 30-day TTL (`30 * 86400000` ms, `Max-Age=2592000`) and expiration filter (`expires > Date.now()`) verified in `server.mjs:73,86`. | T (`api.test.mjs`), I (`server.mjs:73,86`) | [10], [11] |
| NFR-SEC-2 | Data ownership is enforced on every record and attachment. | M | A request for another user's record or attachment returns 403/404 in all `/api/*` and `/v1` routes. | T (`api.test.mjs`, `developer.test.mjs`) | OWASP API1 |
| NFR-SEC-3 | Secrets are never stored in plaintext or in Git. | M | API keys are stored only as SHA-256 hashes. 1C passwords are encrypted with AES-256-GCM. Recovery codes are hashed. A repository scan (`git grep`, gitleaks) finds no secrets. | T, I, A | 5.4 |
| NFR-SEC-4 | Rate limits. | M | Cadastral search: 24 requests/min per profile. `/v1`: 60 requests/min per key. 1C: 12 calls/min per owner. Exceeding a limit returns 429. | T (`cadastre.test.mjs`, `developer.test.mjs`, `one-c.test.mjs`) | 1.7 |
| NFR-SEC-5 | Outbound connections (1C, EGKN) are restricted. | M | 1C: public IPv4 over HTTPS/443 only, TLS verified, no redirects. Requests to private or loopback addresses are refused. | T (`one-c-transport.test.mjs`) | SSRF protection |
| NFR-SEC-6 | Separate environments. | M | Production and staging have separate data volumes and passkey RP origins. A production passkey cannot sign in to staging. | D, I | [Archived owner constraints](https://github.com/Adilzhan17/egin/blob/614ca675a78aef0900e7dd375fb85f398e1d7ee4/AGENTS.md) |
| NFR-SEC-7 | Personal data minimisation. | M | Cadastral snapshots contain no personal names or IINs of individuals. Request logs exclude headers, body and query strings. | T (`cadastre-details.test.mjs`), I | Law of the RK "On Personal Data" |

### 6.4.5 Compatibility, maintainability and deployability (CMP, MNT)

| ID | Requirement | Pri. | Acceptance criteria / metric | Verif. | Source |
|---|---|---|---|---|---|
| NFR-CMP-1 | Cross-platform client support: Capacitor Android (API 24+) and iOS shells, Chrome/Edge on Android 10+, and Safari on iOS 16.4+ (browser and installed PWA). | M | All Playwright scenarios pass in Chromium and WebKit. Capacitor configuration (`prepare-native.mjs`, `native-origins.json`) packages the local `dist` bundle reproducibly. | T, I, D | 5.1 |
| NFR-CMP-2 | The web app is installable as a PWA and offers updates without data loss. | S | The "Update now" prompt appears for a new version. After the update, the queue and saved records are intact. | T (`app-update.cjs`) | [12] |
| NFR-MNT-1 | Every change passes CI: typecheck, server tests and browser tests. | M | `main` is protected. A PR cannot be merged with failing checks. | I (`.github/workflows/checks.yml`), A (CI history) | Git requirements |
| NFR-MNT-2 | One synchronisation engine is shared by the app and the service worker across Web and Capacitor. | S | `entities/workspace/sync-engine.js` is the only sync implementation (inspection). | I | 5.3 |
| NFR-MNT-3 | Capacitor mobile package builds (APK/AAB/IPA) run only on an explicit release request and never automatically on push or PR. | M | Inspection of `.github/workflows/checks.yml`: the mobile packaging job requires `github.event_name == 'workflow_dispatch' && inputs.build_native`. | I (`.github/workflows/checks.yml`) | 2.2 E2-05 |

### 6.4.6 Capacity limits (CAP)

| ID | Requirement | Pri. | Acceptance criteria | Verif. | Source |
|---|---|---|---|---|---|
| NFR-CAP-1 | Per-profile storage quotas. | S | Up to 10,000 records (`server.mjs:155`) and 128 MB of binary assets (`server.mjs:166`) per profile, ≤ 8 MB per asset (`server.mjs:163`). Exceeding a quota returns HTTP 413 inside the transaction without partial writes. | I (`server.mjs:155,163,166`), T (`api.test.mjs`) | 5.2 |

---

## 6.5 Traceability summary

| Need / evidence | Requirements |
|---|---|
| Unstable rural connectivity [2], local-first [8] | FR-SYNC-1…8, FR-FLD-6, FR-WTH-2, NFR-REL-1, NFR-PERF-2 |
| Cross-platform mobile & web delivery from one codebase [1], [12] | FR-AUTH-1, FR-RPT-1, NFR-CMP-1, NFR-CMP-2, NFR-MNT-2, NFR-MNT-3 |
| Low digital literacy and entry barrier [1], [3] | FR-AUTH-1, FR-AUTH-6, NFR-USE-1…5 |
| Reuse existing data (cadastre, 1C) instead of manual entry | FR-FLD-1…4, FR-INT-1…2 |
| Passkey recovery and lockout protection [10], [11] | FR-AUTH-2, FR-AUTH-3, FR-AUTH-4 |
| Do not imitate a digital twin without measurements [5]–[7] | FR-HOME-3, FR-SNS-2 |
| Owner-defined project constraints (2.2, E2-05) | FR-AUTH-5, FR-HOME-1, FR-API-1…3, NFR-USE-1…2, NFR-SEC-6, NFR-MNT-3 |
| Hypotheses H2 and H5 (2.3) | NFR-USE-4, FR-WTH-1 (evaluation planned in Section 9) |

## 6.6 Summary by priority

| Priority | FR | NFR | Total |
|---|---|---|---|
| Must | 21 | 18 | 39 |
| Should | 15 | 9 | 24 |
| Could | 3 | 0 | 3 |
| Won't (this stage) | 3 | 0 | 3 |

The counts above classify requirements by priority; they are not a pass-rate summary. Not every **Must** requirement is accepted: manual diary creation is not exposed by the current UI, physical-device/native compatibility and operational measurements still need evidence, and `main` was not protected at review time (NFR-MNT-1). [Part 9](PART-9-VERIFICATION-EVALUATION.md) records actual check outcomes and planned measurements; [Part 10](PART-10-PROJECT-MANAGEMENT-RISKS.md) records the corresponding work and risks. The `prob-period-1` submission tag does not establish a completed native release or field evaluation.
