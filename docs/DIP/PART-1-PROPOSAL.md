# 1. Project Proposal

| Parameter | Value |
|---|---|
| **Project title** | EGIN — A cross-platform mobile and web application (Capacitor & PWA) for managing a land plot |
| **Team and roles** | **Rustam Seitzhan** — Full-Stack Developer *(Offline Synchronisation Engine, WebAuthn & Capacitor Passkeys, Cross-Device QR Sign-in, Security, CI/CD & Blue/Green Deployment)*<br>**Adilzhan Amangeldi** — Full-Stack Developer *(EGKN Cadastral GIS Adapter & Reprojection, 3D Crop Scene & Weather Module, 1C OData Connector, External API & Developer Portal)* |
| **Supervisor** | Shuteyeva Gulnur Serikovna |
| **Repository** | `https://github.com/Adilzhan17/egin` |

## 1.1 Problem statement

Owners and managers of small farms in Kazakhstan have to assemble a picture of their plot from scattered sources: boundaries from the public EGKN cadastral map, weather from separate services, and field records kept apart from the accounting system. Cloud-only systems require a stable connection, which is often weak or unavailable in rural areas.

Published studies support this context: Kazakh research names weak and unstable mobile coverage in rural areas, a shortage of skills and local specialists, and the absence of a single digital ecosystem among the main obstacles to agricultural digitalisation [2]; an FAO report notes low awareness of digital technologies among medium and small farmers [3]; and a systematic review focused on smallholders identifies infrastructure, cost and digital literacy as the primary adoption barriers [1].

## 1.2 Target users

- **Primary:** owners and managers of small crop farms and peasant farms (KH), and agronomists or field workers who keep plot-level records in the field on Android and iOS smartphones.
- **Secondary:** farm accountants who maintain records in 1C; developers of external integrations using the public `/v1` API and the developer portal.

## 1.3 Aim

To develop a cross-platform mobile and web application (built on a single codebase using Capacitor for Android and iOS alongside an installable PWA) that brings together on one screen the plot boundaries (by cadastral number), a local weather forecast, field records with photos and audio, a sensor registry and reports, while continuing to work offline and synchronising data between devices safely.

## 1.4 Objectives

1. Study user needs, existing farm management systems and technology alternatives for cross-platform mobile delivery.
2. Formulate functional and non-functional requirements with measurable acceptance criteria.
3. Design the system architecture: system context diagram, use case diagram, component diagram (including the Capacitor cross-platform bridge), deployment diagram and key sequence diagrams.
4. Implement the offline store and synchronisation engine with monotonic sequence cursors, record versions, tombstones for deletions and explicit conflict resolution.
5. Implement passwordless sign-in and registration via WebAuthn and Capacitor passkey plugins (`@capgo/capacitor-passkey`) with a one-time recovery code and cross-device QR authentication.
6. Implement plot creation: search by cadastral number via the public EGKN map with UTM-to-WGS84 reprojection, GeoJSON import and export, and geolocation as a fallback.
7. Implement a weather module based on the coordinates of the selected plot, an event centre and report export (HTML, CSV, JSON) using Web Share and Capacitor Filesystem/Share APIs.
8. Implement a sensor registry (QR, manual entry) and prepare the contract for telemetry integration.
9. Implement read-only import from 1C via standard OData and an external `/v1` API with scoped keys and a developer portal.
10. Develop and carry out a verification plan (automated server and browser tests in Chromium and WebKit, plus checks on Android and iOS devices).

## 1.5 Expected outcomes

- A cross-platform application built from a single TypeScript/React codebase (`apps/mobile`): deployed on the web as an installable PWA (production at `https://egin.perricheno.com` and staging at `https://dev-egin.perricheno.com`) and packaged via **Capacitor** for **Android and iOS** (using `CapacitorHttp`, `Filesystem`, `Share` and `@capgo/capacitor-passkey`).
- A complete documentation package: proposal, literature review, system and technology comparisons, requirements specification, architectural decisions and diagrams, and verification plan.
- An automated test suite (Node.js server tests and Playwright browser scenarios in Chromium and WebKit) integrated into GitHub Actions CI.

## 1.6 Project scope

**In scope (core v0.3 implemented; cross-platform Capacitor delivery configured):**

- Cross-platform mobile shell (Capacitor for Android and iOS) and installable PWA sharing one UI and offline engine.
- 3D crop scene on the home screen, a dedicated weather tab (Open-Meteo), agricultural news (ElDala.kz feed) and an event centre.
- Cadastral map of plots: search by 11–12-digit cadastral number, selection by tap, Polygon contours with inner rings, GeoJSON import and export, and offline storage of boundaries and public parcel snapshots.
- Offline-first storage and synchronisation between devices, explicit conflict resolution, and background sending via Background Sync where supported.
- User profile, WebAuthn / Capacitor passkey registration and login, QR sign-in on a second device, one-time recovery code rotation, and push notifications.
- Sensor registry and QR format; offline report export (HTML, CSV, JSON); read-only import from 1C over HTTPS OData; external `/v1` API with hashed scoped keys and a developer portal (`https://api-egin.perricheno.com`).
- Zero-downtime blue/green deployment behind a persistent Nginx gateway (`deploy/manage.py`), with automated online SQLite backups.

**Out of scope for the current stage:**

- Separate platform-specific codebases written in pure Kotlin or Swift (all mobile targets are delivered cross-platform through Capacitor).
- Receiving live sensor telemetry and automatic alerts based on it.
- Growth-phase analytics and soil measurements (the 3D scene is explicitly labelled as an example until analytics is connected).
- eGov sign-in and contractual Smart Bridge `LandCoordinates` integration (explicitly marked "В разработке").
- Live data exchange with AgroSignal and AgroStream (only owner-scoped configuration preparation is included).
- Multiple disjoint polygons within a single plot record.
- Automatic Capacitor APK/AAB/IPA packaging on every CI push (mobile packaging is triggered only on an explicit release command).

## 1.7 Engineering complexity

| Component | Source of engineering complexity |
|---|---|
| **Offline synchronisation** | Monotonic sequence cursor (`seq`), per-record `version`, tombstones (`deleted=1`), payload-equality idempotent retries, explicit conflict resolution, and a single engine (`sync-engine.js`) shared by the UI and the service worker |
| **Passkey & Cross-Platform Auth** | Server-side verification of challenge, RP ID, origin, cryptographic signature and user verification (`@simplewebauthn/server`); cross-platform passkey bridge (`@capgo/capacitor-passkey`) with Android Digital Asset Links and iOS Associated Domains; browser-bound QR login; SHA-256 hashed one-time recovery code rotation |
| **Cadastral map adapter** | Reprojection from regional UTM zones (`EPSG:32639`–`32645`) to `WGS84` via `proj4`, inner ring area subtraction, rate limits (24/60/240 req/min), TLS verification with a bundled Sectigo intermediate CA, and strict stripping of personal data (names, IIN/BIN, contacts) |
| **1C connector** | Parsing of OData XML `$metadata` and namespace aliases, bounded paged reading (≤ 1,000 rows, ≤ 8 MiB, ≤ 90 s), SSRF protection (public IPv4 over HTTPS/443 only, pinned DNS, no redirects), AES-256-GCM password encryption, and idempotent owner-scoped import that preserves manual edits |
| **External API and portal** | Keys with granular read/write scopes and 7/30/90/365-day expiry, only SHA-256 secret hashes stored, 60 req/min shared rate limits, version-aware updates via `If-Match`, and separate portal origin/session isolation |
| **Deployment and tests** | Blue/green container switching behind a permanent Nginx gateway, instant rollback, online SQLite backups; browser tests using a virtual WebAuthn authenticator across Chromium and WebKit |

## 1.8 Realism of the scope and main risks

- **Core readiness:** the core application, server modules and Capacitor cross-platform configuration are already implemented in version 0.3, while full store-ready Android/iOS packaging is scheduled only for explicit release milestones.
- **Public cadastral interface:** the EGKN adapter uses the public map endpoints rather than a contractual Smart Bridge integration, so the upstream interface may change. *Mitigation:* GeoJSON import/export and device geolocation are implemented as full fallback paths, and contractual access to `LandCoordinates` is defined as the target commercial state.
- **Weather API licensing:** Open-Meteo is free for non-commercial use under CC BY 4.0; commercial operation requires transitioning to a paid plan.
- **iOS Capacitor passkeys:** iOS Associated Domains for the Capacitor passkey plugin require an Apple Developer Team ID (`apple-app-site-association`), whereas web passkeys in Safari/PWA work immediately on the domain without it.
