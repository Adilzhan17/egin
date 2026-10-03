> Historical record, superseded by [rescue audit](RESCUE_AUDIT.md) and [current verification](VERIFICATION.md).

# Repository audit — 2026-10-03

The supplied workspace `/home/perricheno/Desktop/Egin.kz` was empty, including hidden files. No git history, AGENTS.md, product documents 00–12, package manifests, routes, components, migrations or environment files existed. Parent AGENTS.md files were also absent. No implementation was removed or overwritten.

Docker contains an older `egin-postgres` (PostGIS 16/3.4) and `egin-redis`. Their Compose labels reference `/home/perricheno/Documents/Egin-KZ`, which no longer exists. Read-only inspection found: api_usage, chat_messages, chat_participants, chats, crops, farm_activities, farm_plots, info_center_items, marketplace_listings, migrations, order_items, orders, service_listings, users, spatial_ref_sys. No rows or credentials were copied. These containers and their volumes remain untouched.

A separate Compose project `egin-local-mvp` uses a separate named database volume and loopback ports. New development is on `astra/egin-local-mvp`. This is a new implementation of the supplied requirements, not a migration of unavailable source code or legacy data.

Machine: Node 22, Python 3.14, Docker available; pnpm initially absent; ~1.5 GiB available RAM. Python 3.12 container avoids native dependency incompatibility. One API worker; no Redis needed for local PostgreSQL-backed SSE.
