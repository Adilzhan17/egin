# 1. Project Proposal

**EGIN** is a cross-platform web and mobile application for managing agricultural land plots in Kazakhstan. Group **SE-2414** comprises **Adilzhan Amangeldi** and **Rustam Seitzhan**, both Full-Stack Developers. The supervisor is **Shuteyeva Gulnur Serikovna**.

Small farms obtain boundaries, weather and accounting information from separate systems, while unreliable rural connectivity restricts cloud-only workflows [1–3]. Primary users are farm owners, managers, agronomists and field workers; secondary users include accountants and integration developers.

**Aim.** Bring plot boundaries, coordinate-based forecasts, available field information, sensor registration and reports into one interface, retaining supported local data offline and synchronising changes safely.

The implementation includes cadastral lookup through Kazakhstan’s public EGKN map, GeoJSON import/export, IndexedDB storage, explicit synchronisation conflicts, passkey authentication and recovery, cross-device QR sign-in, read-only 1C OData import and a scoped external API. The web/PWA version is available; Capacitor configuration supports the intended mobile delivery path. A completed native release is not claimed.

Adilzhan’s documented responsibilities cover cadastral GIS, the crop scene and weather, 1C, and the developer API/portal. Rustam’s cover synchronisation, authentication, security, CI/CD and blue/green deployment.

**Current boundaries.** Sensor telemetry, validated crop-growth analytics, eGov authentication and contractual cadastral integration remain pending or excluded. The 3D crop scene is illustrative. The event centre preserves existing records but has no active manual diary composer. Chat, marketplace and business extensions exist beyond the core diploma scope.

The next objectives are to substantiate user needs, close outstanding verification evidence and prepare tested mobile delivery. Expected outputs are the application, traceable requirements, editable architectural diagrams and a reproducible evaluation record.
