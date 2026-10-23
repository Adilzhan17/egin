# 5. Technology Comparison

Six key architectural decisions were evaluated against the project requirements, with three alternatives considered for each decision.

## 5.1 Client platform (Cross-platform strategy)

| Alternative | Advantages for EGIN | Limitations and risks | Verdict |
|---|---|---|---|
| **A. Cross-platform Web & Mobile via Capacitor + PWA** *(chosen)* | Single TypeScript/React codebase (`apps/mobile`) for **Android, iOS and Web**; Capacitor packages the local `dist` bundle into Android/iOS apps and bridges device APIs (`CapacitorHttp`, `Filesystem`, `Share`, `@capgo/capacitor-passkey`, camera, microphone, geolocation); simultaneous zero-install web access as a PWA with Service Worker offline caching | Background Sync API is supported in Chromium (on WebKit/Safari, queued changes sync when the app is opened); Web Push on iOS requires Home Screen PWA installation (iOS 16.4+); iOS Associated Domains for the Capacitor passkey plugin require an Apple Developer Team ID | **Chosen:** delivers cross-platform Android, iOS and Web apps from one codebase |
| **B. Platform-specific native development (Kotlin for Android + Swift for iOS)** | Direct low-level OS API access without a bridge layer | Requires writing and maintaining two separate mobile codebases plus a third web application for browser access; triples development and testing effort for a two-person team | **Rejected:** EGIN is designed as a cross-platform project rather than separate native apps |
| **C. Widget-based cross-platform frameworks (Flutter / React Native)** | Single codebase for Android and iOS stores | Weak fit for a web-first offline PWA with heavy WebGL (Three.js 3D crop scene) and DOM/canvas mapping (Leaflet); would require separate web maintenance or rewriting the existing v0.3 core | **Rejected:** Capacitor provides superior web/mobile code reuse for EGIN's stack |

## 5.2 Server platform and data store

| Alternative | Advantages for EGIN | Limitations and risks | Verdict |
|---|---|---|---|
| **A. Node.js 22 (Express) + SQLite in WAL mode** *(chosen)* | Zero-dependency single-node operation (`node:sqlite`); atomic `BEGIN IMMEDIATE` transactions; fast local reads; simple online file backups (`/data/backups/`) shared safely across blue/green slots | Single-writer concurrency ceiling; per-profile quotas enforced (10,000 records and 128 MB of binary assets, ≤ 8 MB per asset) | **Chosen** for the core diploma scope |
| **B. Node.js + PostgreSQL** | High write concurrency, horizontal scaling, rich relational indexing | Requires operating and backing up a separate DBMS container; higher memory footprint on a single host (used only in out-of-scope platform/trade modules) | **Deferred:** candidate for future multi-tenant scaling |
| **C. Backend-as-a-Service (Firebase / Firestore)** | Built-in client offline cache and rapid initial prototyping [8] | Vendor lock-in; risk of violating Kazakhstan's data residency requirements when hosted in foreign cloud regions; unpredictable per-read/write costs | **Rejected** |

## 5.3 Offline storage and synchronisation model

| Alternative | Advantages for EGIN | Limitations and risks | Verdict |
|---|---|---|---|
| **A. IndexedDB + monotonic `seq` cursor, integer `version`, tombstones, and explicit user conflict resolution** *(chosen)* | Guarantees zero silent data loss (`NFR-REL-1`); deterministic server validation; deletions propagate reliably as `deleted=1` tombstones; payload-equality checks make retries idempotent; one engine (`sync-engine.js`) serves both UI and Service Worker across Web and Capacitor | Requires the user to choose a version when a concurrent offline edit occurs on two devices | **Chosen:** optimal for small-farm plots edited by 1–3 users |
| **B. CRDTs (Automerge / Yjs)** | Automatic conflict-free replica convergence without central coordination [8], [9] | High metadata and memory overhead; complex schema migrations; unresolved UX ambiguity when automatic merges alter structured field records [8] | **Rejected** for current scope; candidate only if real-time multi-user editing is needed |
| **C. Last-Write-Wins (server timestamp priority)** | Trivial server implementation | Silently overwrites and loses field observations recorded offline when two devices sync out of order | **Rejected:** violates data-integrity requirements |

## 5.4 Authentication

| Alternative | Advantages for EGIN | Limitations and risks | Verdict |
|---|---|---|---|
| **A. Passkeys (WebAuthn + `@capgo/capacitor-passkey`) + one-time recovery code rotation + cross-device QR login** *(chosen)* | Phishing-resistant public-key cryptography across web browsers and Capacitor mobile shells; biometric data never leaves the device; QR flow allows signing in on a second device; forbidding last-key deletion prevents self-lockout | Account recovery and user unfamiliarity noted in literature [10], [11] — mitigated by issuing a rotating one-time recovery code at registration | **Chosen** |
| **B. Email / phone + password** | Familiar mental model for traditional web users | Vulnerable to phishing and password reuse; requires external SMTP/SMS delivery infrastructure and secret storage | **Rejected** |
| **C. eGov QR / EDS or SMS OTP** | High familiarity in Kazakhstan | Official eGov integration requires Smart Bridge approval (currently shown as "В разработке"); commercial SMS gateways incur per-login operational costs | **Deferred** until official eGov integration is approved |

## 5.5 Plot boundaries and map engine

| Alternative | Advantages for EGIN | Limitations and risks | Verdict |
|---|---|---|---|
| **A. Leaflet + OpenStreetMap / KZ aerial basemaps + server-side adapter for the public EGKN map** *(chosen)* | Works without proprietary map API keys in both browser and Capacitor WebView; retrieves exact parcel contours by 11–12-digit cadastral number; reprojects UTM (`EPSG:32639`–`32645`) to `WGS84`; strips PII; saves boundaries offline | Relies on the public EGKN web map interface, which may change; requires bundling the Sectigo intermediate CA certificate and enforcing strict rate limits | **Chosen** (with GeoJSON and geolocation fallbacks) |
| **B. Contractual Smart Bridge `LandCoordinates` service** | Official government SLA and legally fixed API contract | Requires formal legal onboarding and approval (not yet arranged) | **Target commercial state** |
| **C. Manual polygon drawing and GeoJSON upload only** | Zero external service dependencies | Drawing boundaries on a small phone screen is slow and error-prone; farmers rarely have ready-made GeoJSON files | **Retained as fallback** alongside Alternative A |

## 5.6 Weather data source

| Alternative | Advantages for EGIN | Limitations and risks | Verdict |
|---|---|---|---|
| **A. Open-Meteo API** *(chosen)* | Free for non-commercial use under CC BY 4.0 [13]; no API key required for development; coordinate-level resolution with current, hourly and 10-day metrics | Commercial deployment requires purchasing a commercial API plan; gridded forecasts do not replace in-field weather stations | **Chosen** |
| **B. Commercial global weather APIs (OpenWeather / Tomorrow.io / Google Weather)** | Contractual SLA for commercial workloads | Paid tiers required for full 10-day hourly resolution; API key management overhead | **Backup option** for commercial scaling |
| **C. National meteorological service (Kazhydromet)** | Official observations from domestic synoptic stations | Lacks an open, self-service REST API offering free coordinate-interpolated 10-day hourly JSON forecasts | **Rejected** |
