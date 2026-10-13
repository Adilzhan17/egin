# egin Chat

Chat is an isolated module in the existing React/Vite application and Express
API. It uses the current account/session system; it does not create a second
identity store. There are no seeded production users, conversations or groups.

## Structure and routing

- `apps/mobile/src/features/chat/`: conversation list, threaded history,
  composer, groups, community discovery, preferences and scoped styles.
- `apps/api/src/chat/`: routes, validation, additive migrations and private
  attachment storage.
- `apps/api/src/chat/CONTRACT.md`: request/response contract for the routes
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

The conversation list retains its scoped sage/mint glass surfaces. Threads use
per-user themes, original SVG nature patterns, rounded message bubbles and
separate floating header/composer capsules. The bottom navigation and other modules retain their existing styles.
Blur has an opaque fallback and WebKit prefix; reduced-motion disables animated
entry, collapse and sheet transitions. Keyboard positioning uses the existing
VisualViewport integration without moving the global navbar. Existing offline/staging
banners are measured so they cannot cover the Chat header. History observes its
content height as well as its viewport: delayed image layout stays at the latest
message while readers of older history keep their scroll position.

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

Migration **3** adds `last_delivered_sequence` to existing membership and
`receipt_version` to conversations. Existing real reads imply delivery, but sends
and pushes do not. Database triggers preserve monotonic cursors and increment
the version on acknowledgements and membership changes, including writes from
the previous API slot. Completed migrations return without reacquiring DDL locks;
an upgrade retries unavailable table locks rather than deadlocking a live send.

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
- Documents: PDF, DOCX, XLSX, PPTX, UTF-8 TXT and ZIP, up to 15 MiB. qpdf inspects PDFs and rejects
  active content. Bounded OOXML inspection rejects unsafe packages, macros,
  traversal and external relationships; private downloads use attachment
  disposition. ZIP archives are parsed with bounded entry/expanded sizes and
  reject encrypted or malformed entries; this is not an antivirus guarantee.
- Video: MP4, MOV and WebM, up to 15 MiB input and three minutes. The backend
  probes dimensions/duration, strips metadata and transcodes to H.264/AAC MP4
  with a maximum 1,280-pixel output dimension; output must remain below 15 MiB.
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

The composer preserves its draft separately from the durable IndexedDB outbox.
Pressing Send saves text, reply/listing/location context and original binary files
before clearing the composer. Bytes plus file metadata are stored in IndexedDB
and rehydrated as File objects for WebKit compatibility; existing File entries
remain readable without clearing the database. Each entry retains its client UUID across retries
and reloads. The queue permits 50 messages / 100 MiB of binary content per account;
quota/storage failures leave the draft and attachments in the composer. Pending
bubbles show a clock, upload progress or an explicit failure with Retry. Queued
or failed items may be removed from the local queue; an in-flight worker must
finish first. Removing a local retry does not delete an accepted server message.

One account-scoped worker runs while the Chat section is mounted, including its
list. Offline work resumes when the connection returns and Chat is open; this is
not an OS background-send guarantee while the website is closed. Navigation to
another conversation does not abort the worker. Leaving Chat/account aborts it;
atomic IndexedDB leases and BroadcastChannel coordinate tabs and recover an
abandoned upload. Raw files survive reload; accepted attachment IDs are reused
within their 24-hour retention. Session checks and the server-validated
`X-EGIN-Outbox-User` header prevent replay under another signed-in account.

A 20-second message-POST deadline creates a retryable failure; offline interruption
returns it to the queue. The same UUID makes ambiguous response-loss retries
idempotent. A matching committed server-history copy also retires the local entry.
Deleted quote sources are removed from pending messages. Older-history scroll
position is preserved, and incoming messages do not force users to the bottom.

## Server-confirmed message lifecycle

`Message.receipt` is an author-only aggregate with `recipientCount`,
`deliveredCount`, `readCount` and monotonically increasing conversation `version`.
There are no private reader-name lists. Its counters and version come from one
PostgreSQL statement/snapshot. `readByCount` remains a compatibility field.

| UI state | Required fact |
| --- | --- |
| Clock: queued/sending | Local IndexedDB entry; no accepted server sequence yet |
| One check: sent | Accepted message ID and positive server sequence after commit |
| Two neutral checks: delivered | All current recipients acknowledged full message synchronization |
| Two green checks: read | All current recipients have a confirmed read-through cursor |
| Neutral eye N/M: partially read group | Confirmed read count greater than zero and below recipient count |
| Red error and Retry | Upload/send rejected or timed out; durable entry retained |

The list and thread derive icons from the same function. Tapping an icon opens
read-only factual details; the HTML reference's manual status selector is absent.
A zero-recipient group stays sent. Received message bodies are synchronized in
bounded pages before `POST /conversations/:id/delivered`; a list preview, an SSE
event, push delivery or opening the website alone is not a delivery ACK.

Read policy is cumulative: while the conversation and document are visible,
no Chat sheet/gallery is covering it, and a message row is sufficiently inside
the history viewport (60% of its height, capped at 80px), the client acknowledges
through the newest such sequence after a 350ms debounce. Opening just the list
never sends read. Older messages before that cursor are considered read-through;
this is not eye tracking or proof a user opened every attachment. Read also
implies delivery. Background tabs cannot advance read. Failed requests retry
without claiming a successful read locally.

The group denominator is **current members except the author**, including
members with read-only access. New members can read history and join historical
message denominators; leaving removes their contribution, and rejoining starts
cursors at zero. Consequently a newer server version may legitimately reduce
N/M or change all-read to partial. Older versions never overwrite newer ones.

`GET /conversations/:id/receipts?messageIds=...` fetches up to 100 own-message
aggregates without reloading bodies. Named `message.delivered`/`message.read`
SSE events invalidate these aggregates, alongside compatible `change` events.
Reconnect reconciles server facts; duplicated/out-of-order events cannot invent
receipt progress. No notification is emitted merely because a receipt changed.

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
EGIN_URL=http://localhost:4935 node apps/mobile/tests/chat-receipts.cjs
EGIN_URL=http://localhost:4935 node apps/mobile/tests/chat-outbox.cjs
EGIN_URL=http://localhost:4935 node apps/mobile/tests/chat-media-scroll.cjs
EGIN_URL=http://localhost:4935 node apps/mobile/tests/chat-groups.cjs
EGIN_URL=http://localhost:4935 node apps/mobile/tests/chat-drafts.cjs
```

`chat.cjs` covers real API/database browser workflows. `chat-thread.cjs` uses
browser-local fixtures for deterministic lost-response retry, reconnection,
history reconciliation, deleted quotes outside the loaded interval, stale-response
protection, scroll and keyboard regressions. `chat-voice.cjs` exercises actual
HTMLAudio playback in Chromium/WebKit and real MediaRecorder/preview/upload
where supported. Linux WebKit without MediaRecorder checks the unsupported
state; this does not claim physical iPhone microphone validation. `chat-glass.cjs` checks phone/desktop
widths, long Kazakh names, list filters, dialogs, focus restoration, reduced
motion and an opaque no-blur rendering. `chat-receipts.cjs` uses real passkey
sessions and PostgreSQL to verify two accounts/devices, sent versus delivered
versus read, group partial/all-read, read-only membership and leave/rejoin.
`chat-outbox.cjs` uses local API fixtures with real IndexedDB, files and recorded
audio to verify persistence, delayed/lost ACK, failed retry, multiple tabs,
account changes, quota and deletion of obsolete reply context. Run the real-API
browser suites sequentially to respect the existing per-IP request limit.
The outbox suite also checks WebKit text/PDF persistence and recovery. The thread
regression asserts that receipt-only updates never reload message bodies.
`chat-media-scroll.cjs` checks delayed ten-photo layout in Chromium/WebKit with
normal animations: the last message must remain visible after media expands.
Pure unit tests cover status semantics and receipt-version ordering. Backend tests cover
authorization, idempotence, roles, private attachments and cross-slot SSE;
`CHAT_MEDIA_TESTS=1` enables the actual codec/PDF process checks. Without the
database/media environment variables, the optional tests are skipped: a plain
unit-test pass is not evidence that those integration checks ran.

`.github/workflows/chat.yml` provisions isolated databases, installs the codecs,
runs these suites and publishes browser artifacts. It builds only the websites,
never APK/AAB/IPA packages. Passing CI is separate from a physical iPhone or
Android microphone/passkey review.

## Chat 2.0 implementation

The new functionality extends the existing HTTP/SSE/PostgreSQL module. No new
identity system, external chat service, second database, or global navigation is
introduced. Existing conversations, members, listings and attachment data remain
in place. Migration revisions 4–6 add conversation deletion state, message system
metadata, video kinds, per-member archive/theme/draft/version fields and:

- `chat_reactions`: one reaction per `(message_id, user_id)`; replacing and
  removing a reaction are explicit, repeatable server mutations.
- `chat_message_personal`: per-user saved/hidden message state.
- `chat_pins`: shared pinned messages with server role checks.
- `chat_privacy`: presence/read-sharing choices and short-lived presence times.
- PostgreSQL `pg_trgm` indexes for message substrings and attachment names, in
  addition to the existing `simple` full-text index. The deployment database
  role must be allowed to create the extension; schema failures must not be
  mistaken for a successful rollout.

Migration **7** adds a database delete guard for active personal wallpapers.
The retained previous blue/green API slot can run its legacy attachment cleanup
without deleting a referenced wallpaper: skipped rows never appear in its
`DELETE … RETURNING storage_key` result. Resetting/replacing the theme, leaving
the conversation or deleting it releases the reference; conversation-delete
cascades remain supported.

The current route contract and developer catalog remain the canonical API
inventory. Additions include activity, reactions, personal message state,
preferences, materials, conversation search, saved/pinned collections,
per-recipient receipts, forwarding, privacy/presence and owner group deletion.
All conversation endpoints retain membership checks. Forwarding requires source
access and destination write permission; it uses client UUIDs and copied private
attachment records rather than making source URLs public.

### Groups and access

A group profile subscribes to membership/profile changes and refreshes after
reconnect. Participant actions and confirmations use separate focused sheets;
a long member list cannot hide the exit confirmation. Busy confirmations disable
backdrop/Escape/close dismissal, so a failed operation leaves a visible retryable
sheet. A successful leave closes both the profile and active thread without
requesting the removed membership again.

An owner with other members chooses a successor. `POST /groups/:id/leave` accepts
`transferToUserId` and transfers ownership plus removal in one transaction.
An ordinary leave retains the empty request body. Members, admins and owners
retain distinct server-enforced capabilities for inviting, removing, assigning
roles, restricting writing, editing the group and updating its avatar.
`DELETE /groups/:id` is owner-only: it revokes memberships and soft-deletes the
group conversation; this is not a claim that backups/history have been physically
erased. Group lifecycle operations append distinguishable system events. Former
members lose access to history, search, new realtime data and authenticated media.

### Activity, reactions and receipts

Typing, recording and actual file uploads send throttled HTTP activity changes;
SSE distributes short-lived activity, not stored chat messages. Clients clear
activity on disconnect/reconnect, exit, blur/idle and expiry. Typing does not imply
presence or message delivery. Names use a deterministic ID-derived palette; hash
collisions are possible, so color never replaces the visible sender identity.

Reactions use PostgreSQL uniqueness and show the real participants/counts. The
server publishes reaction invalidations, including author information for reaction
feedback. Existing sent/delivered/read semantics remain server-confirmed; detailed
receipt lists are author-only and respect recipient privacy. Read privacy never
changes a delivery acknowledgement into a read acknowledgement. Separate listened,
photo-opened and document-opened receipts remain unimplemented.

Presence sharing defaults off. Explicitly enabling it records short-lived active
heartbeats while Chat is visible; inactivity expires the online state. The last
seen value is only returned where privacy and access permit. This is browser
activity, not a guarantee that a person is available or continuously connected.

### Materials, location and search

Chat profiles expose paginated Media, Documents, Links, Voice and Locations.
Results come from server-scoped history, including messages outside the loaded
window. Existing audio playback keeps its waveform, seek, pause and 1×/1.5×/2×
controls. Photos support gallery navigation/download and videos play through
private attachment routes. Uploaded files remain pending until validated and
stored. Progress, durable outbox retries and removal of queued/failed entries
remain real stages; removing an in-flight entry still waits for its worker to stop.

Locations use the existing Leaflet stack: choose a map point or request the
browser's current position by an explicit button. A coordinate fallback remains
available if public map tiles fail. Messages retain latitude, longitude, optional
accuracy and label, with map preview, opening and routing actions. Address search,
reverse geocoding and live tracking are not implemented; no hidden geolocation
permission prompt or background tracking is introduced.

Server search supports text/filename/link lookup with sender, date and attachment
filters. Links are extracted as safe HTTP(S) URLs and displayed with their domain.
The server does not fetch arbitrary link metadata, avoiding a new SSRF surface;
rich remote webpage previews are not claimed. Message links and quotes can load
and highlight an older original message.

### Themes and drafts

Eight per-user, per-conversation presets are available: Nature, Ocean, Lavender,
Sunset, Sand, Midnight, Forest and Pearl. Accent/background overrides and pattern
intensity are stored on the existing membership record. Themes never modify
another participant's appearance or a non-Chat page. A custom photo uses the existing
validated image upload with a dedicated wallpaper purpose, available even to
read-only members. The stored reference must belong to the same user/conversation
and remain unattached to a message. Other users cannot fetch it, and an active
wallpaper cannot be sent as a shared message. Upload progress, cancellation,
replacement, removal and palette reset are available. Missing images fall back
to the chosen color theme. Referenced files survive pending-upload garbage
collection; replacement/reset/leaving releases the old file for cleanup.

Drafts synchronize to PostgreSQL with a 650 ms debounce, personal preference
SSE notifications and reconnect reconciliation. `expectedVersion` makes concurrent
updates fail with 409 rather than silently replacing text. The composer preserves
active unsynced input and offers explicit local/remote conflict resolution. A
separate versioned, account-scoped local recovery marker also stores empty drafts:
leaving immediately after sending cannot restore an already-sent server draft.
Clears are flushed immediately; leaving a thread attempts a bounded keepalive
update. If the request fails or the browser terminates, the recovery marker is
reconciled on next opening. The server remains the synchronized authority; local
storage is recovery, not a replacement database. Draft writes carry the same
account-binding header as the outbox. No closed-browser background sync guarantee
is made, and recovery depends on browser storage remaining available.

### Verification and remaining boundaries

`chat-groups.cjs` covers Chromium/WebKit member-list scrolling, busy dismissal,
failed leave/retry, parent-thread closure, persistent membership, atomic successor
selection, SSE member refresh, owner deletion and unchanged navbar placement.
`chat-drafts.cjs` uses two independent browser contexts to test server sync,
whitespace, optimistic version conflicts, explicit resolution, reload, pending
empty drafts, immediate navigation and account binding. These are isolated UI/API
fixtures. Real PostgreSQL integration tests separately exercise access control,
reactions, forwarding, search, themes/drafts, group lifecycle and private media.
Existing outbox, receipt, audio, layout and real-API suites remain regressions.
`chat2.cjs` additionally uses two real authenticated users and PostgreSQL to verify
realtime typing/reactions, concurrent sends, personal theme isolation, older-history
search, self-deletion, location materials and group exit/ownership transfer.
`chat-wallpaper.cjs` covers Chromium/WebKit upload, progress/cancel, personal
persistence, replacement/reset, image fallback and mobile layout. PostgreSQL
coverage verifies image ownership, read-only access and garbage-collection lifecycle.
`chat-extras.cjs` checks open collection deletion/reconnect, stale pagination after
filter changes, receipt privacy updates and protected in-flight forwarding in
Chromium/WebKit.

Implemented context actions include reply, copy, forwarding (up to ten selected
messages), emoji reactions, editing, delete for self, delete for everyone,
favorites, pins and receipts. Deleted-for-everyone messages continue to disappear
without a visible tombstone. Conversation archive/mute and persistent drafts are
server-backed. Reduced motion and opaque glass fallbacks remain supported.

Physical iPhone/Android testing is still needed; automated Chromium/WebKit is not
a device microphone/passkey certification. Browser push requires an actual VAPID
subscription and permission. Moderation staffing/tools, malware scanning, external
object storage, retention/backup policy and distributed abuse controls remain
operational work. No end-to-end encryption or guaranteed mobile background work
is claimed. No native app build is part of this website update.
