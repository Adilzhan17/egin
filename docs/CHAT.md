# egin Chat

Chat is an isolated module in the existing React/Vite application and Express
API. It uses the current account/session system; it does not create a second
identity store. There are no seeded production users, conversations or groups.

## Structure and routing

- `apps/mobile/src/features/chat/`: conversation list, threaded history,
  composer, groups, community discovery, preferences and scoped styles.
- `apps/api/src/chat/`: routes, validation, additive migrations and private
  attachment storage.
- `apps/api/src/chat/CONTRACT.md`: request/response contract for all 35 routes
  under `/api/chat`; `catalog.json` also exposes their API reference.
- Existing `#/chat` navigation is reused. An open conversation is encoded as
  `?chat=<UUID>#/chat`; the global router and navigation are unchanged.
- Shared copy is centralized in `locale.ts` and `thread-copy.ts`. Russian is the
  current language; the lookup structure supports adding Kazakh translations.

Home, weather, maps, Market UI, settings and authentication are unchanged. The
Chat Market adapter reads existing published listings and derives the seller
server-side. It never edits an offer. Archived/deleted listings retain a neutral
conversation context without exposing private or removed offer details.

## Glass interface

The existing list and thread use scoped sage/mint glass surfaces, a static original
SVG field pattern, rounded message bubbles and separate floating header/composer
capsules. The bottom navigation and other modules retain their existing styles.
Blur has an opaque fallback and WebKit prefix; reduced-motion disables animated
entry, collapse and sheet transitions. Keyboard positioning uses the existing
VisualViewport integration without moving the global navbar.

Voice messages and previews use `VoiceBubble.tsx`: play/pause, keyboard/touch seek,
1×/1.5×/2× playback and one active recording at a time. Media streams, object URLs
and audio elements are released on cancel, navigation and removal. No native
audio controls are displayed. The header shows real group membership or dialogue
type, not simulated presence. A pinned-message strip is not fabricated: current
server pinning is a conversation-list preference, not a message-pin feature.

## PostgreSQL and storage

Set `CHAT_DATABASE_URL`, or reuse `MARKET_DATABASE_URL` (the default fallback).
Chat uses an independent connection pool and only creates `chat_*` objects. The
Market tables must be in that same database to enable the read-only listing
adapter; a separate Chat database otherwise works without the offer catalogue.
Without a database, Chat returns 503 while other application modules remain
available. `/api/chat/health` checks an actual PostgreSQL query.

Migration version **1** runs automatically on module initialization, inside a
transaction protected by an advisory lock. It creates:

- `chat_migrations`, `chat_conversations`, `chat_conversation_members`;
- `chat_messages`, `chat_attachments`, `chat_message_receipts`;
- `chat_groups`, `chat_group_bans`;
- `chat_user_preferences`, `chat_hidden_recommendations`;
- `chat_user_blocks`, `chat_reports`.

Migration **2** adds nullable `chat_attachments.waveform` JSONB. Existing
recordings remain playable; new uploads receive 40 normalized peaks computed
from the validated AAC signal through bounded ffmpeg PCM decoding. Existing
API slots tolerate the additive column during blue/green switching.

Group membership shares `chat_conversation_members`; there is no duplicate
group-member or user table. User IDs refer to the existing SQLite account store
and are checked by the application. History has a server sequence, indexed
conversation pagination and a PostgreSQL `simple` full-text index. A unique
`(sender_id, client_id)` constraint makes message retries idempotent.

Binary attachments live under `DATA_DIR/chat-attachments` (see the storage
helper for the canonical directory). The API image includes **ffmpeg/ffprobe**
and **qpdf**. Back up the PostgreSQL database together with the existing shared
API data volume. Staging and production must continue to use separate databases
and data volumes. Blue/green slots for one environment share its database and
attachment volume. No native build or sync is needed.

## Messages, media and limits

- Text: up to 4,000 characters; replies, edits, deletion for everyone and read
  cursors are server-validated. No HTML rendering is used for message content.
- Photos: up to ten per message, 10 MiB input each, bounded 40-megapixel decode.
  Server processing applies orientation, strips metadata and creates an
  1,800-pixel WebP plus a 480-pixel thumbnail.
- Documents: PDF, DOCX and XLSX, up to 15 MiB. qpdf inspects PDFs and rejects
  active content. Bounded OOXML inspection rejects unsafe packages, macros,
  traversal and external relationships; private downloads use attachment
  disposition.
- Voice: up to 10 MiB input and three minutes. Actual ffprobe inspection and
  ffmpeg decoding produce a mono AAC/M4A file; uploaded MIME claims alone are
  insufficient. Recording needs browser microphone support and permission.
- At most 20 pending attachments / 100 MiB per uploader, three concurrent media
  processing operations per API process and 30 owned groups per account.
- Mutation limit: 90 per minute/account, including at most 12 conversation/group
  creations. These counters are in-process, not a distributed anti-spam service.
- SSE connections: at most five per account and 500 per API process.

Current group avatars are retained. Unsent uploads older than **24 hours** and
attachments belonging to deleted messages are cleaned on startup and hourly;
message deletion also triggers cleanup immediately. The cleanup removes their
database entries and stored files. Deleted message
text, media references and quoted content are cleared. A content-free tombstone
remains in the API history for stable sequence pagination; the UI renders no
message, placeholder, date-only separator or permanent gap for it. Other delivered messages do
not yet have an automatic retention period. Backups may retain older data under
the operator's backup policy; file cleanup is not a backup-erasure guarantee.

## Realtime, recovery and notifications

`GET /api/chat/events` is an authenticated SSE stream of invalidation events,
not message contents. PostgreSQL LISTEN/NOTIFY distributes changes between
blue/green API slots. Session and membership checks apply before delivery;
removal revokes the affected conversation access. Streams reconnect and the UI
fetches missing server-sequenced history, reconciles changes, and deduplicates
messages. A dedicated `message.deleted` event immediately scrubs the visible
message, open actions, media and quotes. The compatible `change/deleted` event
also carries the ID, so current clients avoid duplicate reconciliation. Old
server events still trigger a refetch. Reconnect verifies loaded IDs and quote
source IDs in batches of at most 100 through `messages?reconcile=...`; retained
client deletion IDs prevent stale responses from resurrecting content. Search
also refreshes on reconnect and visibility changes. Read cursors advance monotonically.

The composer preserves unsent text locally per account/conversation when
storage is available. Failed sends can be retried with the same client ID. This
is not full offline messaging: binaries and successful delivery require the
server. Older-history scroll position is preserved, and incoming messages do
not force users away from the history they are reading.

Unread counters, muted conversations and in-Chat notifications are implemented.
Existing web-push subscriptions are reused with a generic notification; private
message text is not included. Push needs the existing VAPID/subscription setup,
browser support and notification permission. No external notification service
or new global settings screen is introduced.

## Security and product boundaries

Every non-health route requires the existing session. Mutations retain origin
and `X-EGIN` checks. Conversation membership, sender ownership, administrative
roles and attachment permissions are checked on the server. Private attachments
are served through authenticated routes with `no-store`, not permanent public
URLs. Discovery exposes only public community metadata, and search is bounded
to the requesting user's accessible conversations. Recommendations use selected
region/interests and community activity; they do not inspect private messages.

HTTPS transport and access controls are **not end-to-end encryption**. There is
no antivirus service or guarantee that every accepted document is malware-free.
Reports are stored for review; there is no moderator console, automated review
or response-time promise. Additional operational monitoring, moderation staffing,
distributed abuse controls and offsite backup procedures remain deployment work.

Kazakhstan personal-data requirements need separate qualified legal review,
including hosting/data locality, consent and notices, processor arrangements,
retention, user-access/deletion requests and cross-border transfers. This module
does not claim legal compliance solely from its technical controls.

## Running checks

Use **Node 22**, the pinned pnpm version, PostgreSQL 17 (the repository's
`pgvector/pgvector:pg17` service also supports the existing Market module),
ffmpeg/ffprobe and qpdf. Never point test variables at staging or production:
tests create and mutate disposable fixtures.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
CHAT_TEST_DATABASE_URL=postgresql://chat:local-test-password@localhost:5432/chat_test \
  CHAT_MEDIA_TESTS=1 node --test apps/api/tests/chat*.test.mjs
pnpm --filter @egin/mobile exec playwright install --with-deps chromium webkit
```

Create a second disposable database (`chat_browser`). Start preview from
`apps/api` after the web build:

```sh
cd apps/api
DATA_DIR=/tmp/egin-chat-preview \
  CHAT_DATABASE_URL=postgresql://chat:local-test-password@localhost:5432/chat_browser \
  MARKET_DATABASE_URL=postgresql://chat:local-test-password@localhost:5432/chat_browser \
  node tests/preview.mjs
```

In another terminal, from the repository root:

```sh
EGIN_URL=http://localhost:4935 node apps/mobile/tests/chat.cjs
EGIN_URL=http://localhost:4935 node apps/mobile/tests/chat-thread.cjs
EGIN_URL=http://localhost:4935 node apps/mobile/tests/chat-voice.cjs
EGIN_URL=http://localhost:4935 node apps/mobile/tests/chat-glass.cjs
```

`chat.cjs` covers real API/database browser workflows. `chat-thread.cjs` uses
browser-local fixtures for deterministic lost-response retry, reconnection,
history reconciliation, deleted quotes outside the loaded interval, stale-response
protection, scroll and keyboard regressions. `chat-voice.cjs` exercises actual
HTMLAudio playback in Chromium/WebKit and real MediaRecorder/preview/upload
where supported. Linux WebKit without MediaRecorder checks the unsupported
state; this does not claim physical iPhone microphone validation. `chat-glass.cjs` checks phone/desktop
widths, long Kazakh names, list filters, dialogs, focus restoration, reduced
motion and an opaque no-blur rendering. Backend tests cover
authorization, idempotence, roles, private attachments and cross-slot SSE;
`CHAT_MEDIA_TESTS=1` enables the actual codec/PDF process checks. Without the
database/media environment variables, the optional tests are skipped: a plain
unit-test pass is not evidence that those integration checks ran.

`.github/workflows/chat.yml` provisions isolated databases, installs the codecs,
runs these suites and publishes browser artifacts. It builds only the websites,
never APK/AAB/IPA packages. Passing CI is separate from a physical iPhone or
Android microphone/passkey review.
