# 5. Technology Comparison

Six decisions were compared against offline use, implementation reuse, team capacity and operational complexity. The stack supports the website and future mobile packaging; Capacitor configuration does not establish accepted Android/iOS builds.

| Decision | Selected approach and rationale | Main alternative or limitation |
|---|---|---|
| Client platform | React/TypeScript, PWA and Capacitor reuse the interface, mapping and Three.js scene. | Kotlin/Swift clients increase maintenance; Flutter/React Native requires adapting the web core. |
| Core server/store | Node.js/Express with SQLite WAL simplifies single-host transactions and backup. | SQLite has a single-writer ceiling. PostgreSQL supports additional modules outside the core diploma datastore. |
| Offline synchronisation | IndexedDB, sequence cursors, versions, tombstones and explicit conflict resolution make retries and conflicts inspectable. | Last-write-wins risks silent overwrites; CRDTs introduce complexity for structured records. Data-preservation acceptance still requires testing. |
| Authentication | Passkeys, rotating recovery codes and separate-device QR login avoid password handling. | Native iOS configuration remains pending; official eGov integration is unavailable. |
| Plot mapping | Leaflet and the public EGKN adapter provide cadastral lookup; GeoJSON and geolocation provide fallbacks. | The upstream public interface may change; contractual LandCoordinates access remains pending. |
| Weather | Open-Meteo supplies coordinate-based forecasts without adding a separate sensor system. | Forecasts are model output, not field measurements; commercial-use terms must be checked before commercial release. |

These are architectural trade-offs, not measured product superiority. The [detailed comparison](../../PART-5-TECHNOLOGY-COMPARISON.md) records alternatives; Sections 6 and 9 specify acceptance and verification.
