# 10. Project Management and Risks

The repository contains the implemented web core, deployment tooling and additional chat, marketplace and business modules. Fresh web builds and nine fixture screenshots are recorded. User-research documentation, complete acceptance evidence and native release remain unfinished. Historical API/CI failures are retained as failures; successful rendering does not close those work items.

**Documented responsibilities:** Rustam Seitzhan owns synchronisation, authentication, security and deployment; Adilzhan Amangeldi owns cadastral GIS, weather/3D, 1C and the developer API. Research coordination, final evaluation and extension ownership still need agreement. The supervisor is Shuteyeva Gulnur Serikovna.

GitHub history and the report’s local work register provide management evidence. No actual YouTrack board is evidenced. Local `PM-` identifiers are proposed references, not historical tracker issues. No approved calendar deadlines were supplied. Remaining tasks should receive a named owner, priority, deadline, dependency and acceptance evidence before being marked Done.

**Completed implementation example — PM-02: cadastral parcel passports.** Commit [`79468ce`](https://github.com/Adilzhan17/egin/commit/79468ce) adds public EGKN details and offline snapshots. Adilzhan is the documented responsible developer. Expected outcome: users can inspect a saved parcel’s public information with its source and capture time. Proposed acceptance, derived from FR-FLD-3/6/7: exclude personal identifiers; explicitly mark missing data; retain saved contours offline; label registered and calculated areas separately. Implementation is present; full device/offline acceptance remains separate evidence. Task deadline and original priority were not recorded.

| Risk / current limitation | Required next action |
|---|---|
| User discussions lack traceable records | Collect 3–5 consented records and link findings to requirements. |
| Failed checks or lost/conflicting data | Repair isolated test dependencies; rerun security, synchronisation and affected CI checks. |
| Public data providers change or fail | Verify bounded failures, GeoJSON fallbacks and clearly labelled cached data. |
| Scope expands beyond evaluated core | Confirm core acceptance scope and assign extension ownership separately. |
| Device/native readiness is overstated | Run physical-device checks; prepare Capacitor release only after required configuration and validation. |

The next stage proceeds through evidence completion, verification, user/device evaluation and release readiness. Each decision should retain the chain **requirement → work item → commit → check result → acceptance**, with unresolved conditions visible.
