# egin Market

Market is an isolated module of the existing React/Vite website and Express API.
The application still owns authentication and its SQLite workspace database.
Market uses PostgreSQL because the marketplace specification requires it; no
existing account, cadastral, weather, workspace or integration table is migrated.
`owner_id` contains the existing authenticated user ID, resolved by the existing
session middleware. A cross-database foreign key to SQLite is not possible;
all Market writes instead obtain the owner from `req.user`, never the request body.

## Storage and deployment

`MARKET_DATABASE_URL` enables the store; without it only Market returns 503.
`migrations.mjs` creates additive `market_*` tables under an advisory lock:
categories, versioned attribute schemas, listings, images, favorites, reports,
listing events, geography and migration history. `search.mjs` adds embeddings.
Only taxonomy is seeded. Production never receives sample listings or sellers.

`deploy/market.yml` runs persistent PostgreSQL/pgvector and a private ONNX service.
Each environment has its own network, PostgreSQL volume, password and application
image storage. API blue/green slots share the same environment's Market store.
Passwords are generated into ignored `deploy/state/market-<environment>.password`
with mode 0600. The database has no published network port. Consistent compressed
`pg_dump` backups are made in ignored `deploy/state/market-backups` before release
migrations; preserve these together with the application's `/data/market-images`.
Backups are local to this host: off-site retention must be configured separately.

Deploy using the existing `python3 deploy/manage.py deploy staging`, validate,
then `python3 deploy/manage.py deploy production --reuse-images <release>`.
The deployment builds the inference image at the same release tag. Rollback
switches application slots without removing either database or image storage.
No native packaging is involved.

## API and lifecycle

The route inventory in `../catalog.json` documents `/api/market/*` alongside the
existing API. Reads expose only published listings, except that the owner can
read their own drafts/archives. Authenticated mutations reuse the existing
`X-EGIN: 1` / origin / session protection and apply object ownership checks.
Developer API keys do not grant access to these session-only mutation endpoints.

Listing responses use `{listing}`, catalog/favorites/my responses use
`{items,total,page,hasMore}`. Categories are flat with `parentId` and an attribute
schema. Publication uses strict validation; draft PATCH allows incomplete data.
Every mutation requires the current integer `version` (JSON, or `If-Match` for
image upload; DELETE uses `?version=`). Stale versions return 409. Mutation
responses capture their row and images while holding the transaction lock.
Creation accepts `clientId` for retry deduplication; publishing is idempotent.

Photos accept JPEG/PNG/WebP up to 10 MiB, decoded pixel limits and eight images
per listing. Sharp decodes and re-encodes WebP, strips EXIF/GPS and creates a
thumbnail; blobs are stored on disk, metadata in PostgreSQL. Both original-sized
and thumbnail access check listing visibility. User-controlled paths are never
accepted. Price is numeric with independent currency/unit/mode; negotiable prices
are NULL. Price comparisons require one unit to avoid comparing tonnes and days.

Draft, published and archived are the implemented lifecycle. Reports are stored
but there is no moderator console or automated moderation yet. No verification
badge, reputation or sales numbers are fabricated. Public phone contact requires
seller opt-in. A Market contact endpoint exposes the future chat context and
truthfully reports `chatAvailable:false`; the existing Chat module is unchanged.

## Geography and search

Regions/districts are imported from the public EGKN catalog and cached in
PostgreSQL. Their codes are cadastral directory codes, not presented as KATO.
The source does not supply a complete settlement hierarchy: `localityName` is
explicitly entered text and supports exact case-insensitive filtering. No exact
home address is inferred or published.

Search combines indexed PostgreSQL full-text search (simple + Russian), trigram
word similarity, Unicode normalization, keyboard-layout correction, agricultural
Russian/Kazakh aliases and multilingual semantic retrieval. Reciprocal rank fusion
combines lexical, fuzzy and semantic ranks. Strict category, geography, deal and
price filters are applied to the resulting candidates on the server. The CPU
model produces 384-dimensional vectors in PostgreSQL; inference failure retains
lexical/fuzzy search. Published versions are indexed asynchronously, with stale
and archived vectors excluded at query time. See `../../market-inference/README.md`.

## Checks

Run repository typecheck, tests and build. PostgreSQL integration tests are
enabled explicitly with `MARKET_TEST_DATABASE_URL`; use a disposable test DB.
`MARKET_TEST_INFERENCE_URL` enables the real model test; set
`MARKET_INFERENCE_URL` as well for end-to-end hybrid index tests.

Browser tests:

- `apps/mobile/tests/market.cjs`: real local API/PostgreSQL, existing passkey login,
  publication with photos, restored draft, catalog/favorites/filters/edit/archive,
  360/375/390/430/768/1280 widths and WebKit.
- `apps/mobile/tests/market-drafts.cjs`: controlled delayed saves, conflicts and
  offline retry against explicit mocked Market responses.
- `apps/mobile/tests/market-viewport.cjs`: simulated visual viewport keyboard,
  footer/sheet bounds, pinch zoom and unchanged global navigation.

Run browser tests against an isolated preview whose DB is separate from unit
fixtures. They never target production. Test listing images and users are fixtures,
not real offers. The host currently uses Node 18, so run Node 22+ in the repository's
Docker environment. Use the Playwright container for WebKit dependencies.

The existing broad `browser.cjs` currently fails its injected safe-area assertion
(`0px` versus `47px`) in the available Playwright container. The same failure was
reproduced against the previously deployed production release before Market was
deployed. This is recorded separately from the passing Market acceptance suites;
the unrelated shell, tokens and navbar were not changed to work around that test.

## Operational boundaries

Mutation rate limits are bounded in-process and therefore per API slot, not a
distributed anti-abuse service. Marketplace payments, order management, private
messages, seller verification, moderator workflows and complete KATO settlement
selection are not implemented. Backups currently remain on the same host.
