# EGIN 3.0 implementation record

Source specification: user attachment 876f158c-8708-44c2-ad9b-3371d7ea3ae4, 2026-10-14.

## Architecture and ownership

Existing React/Vite mobile web, Express, SQLite identity/workspace, PostgreSQL marketplace/chat, private attachments, ffmpeg and PostgreSQL-notify/SSE remain authoritative. No new backend or database. Existing navbar, marketplace data, chat history and 3D remain.

- Video notes: extend Chat messages/attachments, recorder, private processing, circular playback, existing outbox/receipts. Additive Chat migration 8.
- Platform: organization membership referencing existing users and workspace fields; server feature flags; scoped notifications/audit; administrative review; plan/invoice/manual bank confirmation/subscriptions; qualified leads and partner services.
- Trade: lots/quality/private documents, draft listings, buyer requests, versioned offers, exact financial comparison, transactional stock reservations, deals/shipments/acceptance/two-party payment, cost accounting and reports.
- UI: existing Market entry points; farm/trade flows; organization/billing/admin panels. Chat keeps its current design and infrastructure.

## Plan and state

1. Architecture review and migration boundaries — complete.
2. Video notes with real PostgreSQL/browser tests — complete.
3. Organizations, linked fields, lots — complete.
4. Buyer profiles, requests and crop publications — complete.
5. Versioned offers and chat negotiation references — complete.
6. Exact net proceeds and comparability — complete.
7. Deal lifecycle, private documents, shipments, payment — complete.
8. Farm expenses and analytics — complete.
9. Feature flags, billing, qualified leads and services — complete.
10. Security and multi-account tests — complete. Website build and deployment verification are recorded in EGIN3-REPORT.md.

## External boundaries

No banking provider, EDS, automatic registry verification, road-routing provider or carrier integration is configured. Use audited human verification and explicit document/payment claims. Never claim EDS signatures, automatic bank payments, registry-verified ownership or road distances. Physical Safari/Android camera behavior requires hardware testing in addition to synthetic browser camera tests.

Admin access requires an explicit verified account ID; it is not granted to the first public registrant.
