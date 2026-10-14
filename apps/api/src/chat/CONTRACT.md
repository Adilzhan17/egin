# Chat implementation contract

Isolated module, existing session auth/SQLite users, namespaced PostgreSQL tables
in the existing PostgreSQL service. `CHAT_DATABASE_URL` falls back to
`MARKET_DATABASE_URL`. Market is read-only to Chat. No seed users/groups/messages.
Frontend types are in `apps/mobile/src/features/chat/types.ts` (camelCase).

All routes below are prefixed `/api/chat`, authenticated except `/health`.
Errors: `{error}` and appropriate status. UUID IDs except existing user IDs.
All list limits bounded server-side. Each mutation requires existing X-EGIN/origin protection.
An optional `X-EGIN-Outbox-User` header must equal the session user on mutations;
a mismatch returns 403 before processing media or saving anything. Persisted
outbox send/upload requests must use it to guard shared-cookie account switches.

- GET /health -> `{ok:true,storage:'postgresql'}`
- GET /conversations?filter=all|direct|market|group&q=&before= -> `{items:Conversation[],nextCursor:string|null}`
- POST /conversations `{kind:'direct',userId}` or `{kind:'market',listingId}` -> `{conversation}` (get/create idempotent pair, listing owner server-derived).
- GET /conversations/:id -> `{conversation}`
- PATCH /conversations/:id `{muted?,pinned?}` -> `{conversation}`
- GET /conversations/:id/messages?before=<sequence>&after=<sequence>&q=&reconcile=<comma-separated UUIDs> -> `{items:Message[],hasMore:boolean,deletedIds:string[]}` chronological server sequence. q searches only this conversation. Optional `reconcile` accepts at most 100 IDs, returns deleted IDs within the same conversation; include quote-source IDs during reconnect.
- POST /conversations/:id/messages MessageDraft -> `{message}`; unique sender/clientId, retry returns original; max4000 chars.
- PATCH /conversations/:id/messages/:messageId `{text}` -> `{message}`
- DELETE /conversations/:id/messages/:messageId -> `{message}` content-free tombstone, author or group admin. Clears text/media/quotes; files are denied immediately and removed after commit. Repeated authorized deletion is idempotent. UI must not render the tombstone.
- POST /conversations/:id/read `{sequence}` -> `ReceiptAck`; authenticated monotonic read-through cursor, only sent after the open, visible conversation shows a message in the viewport. It marks messages through that sequence as read, including earlier history; read also proves delivery.
- POST /conversations/:id/delivered `{sequence}` -> `ReceiptAck`; explicit recipient-application ACK after syncing messages through that sequence. A GET, send response, SSE invalidation or push-provider acceptance never advances delivery.
- GET /conversations/:id/receipts?messageIds=<comma-separated UUIDs> -> `{conversationId,version,items:[{messageId,receipt}],self:{deliveredSequence,readSequence}}`; at most 100 requested IDs, or latest 50 own live messages by default. Incoming, foreign-conversation and deleted messages are omitted. Membership required. No message content or per-reader list returned.
- POST /conversations/:id/attachments?name=<filename>&kind=image|document|audio (raw bytes; Content-Type application/octet-stream, X-EGIN) -> `{attachment}`; max10MiB/image,15MiB/document,10MiB/audio. Membership+write permission checked; pending attachment private to uploader until attached.
- GET /attachments/:id/file?size=thumb -> private binary; authorization checked each request, no-store; docs attachment disposition.
- GET /events -> named SSE `message.deleted` with `{conversationId,messageId,deletedAt}`; compatible `change` with `{conversationId,type:"deleted",messageId,deletedAt}` is also delivered. Other changes use SSE `event:change`, data `{conversationId?,type}`; event:ready on connect. Authenticated user scope, no message content. Frontend refetches incremental history, periodically reconciles edits/deletions; reconnect refetches. Membership/session must be revalidated and streams closed on revoke/logout. PG notifications work across app slots.
- GET /users?q= -> `{items:Person[]}`; authenticated bounded search, min2 chars or exact account UUID; names+ID only. Never expose phones/email.
- GET /search?q= -> `{conversations:Conversation[],messages:Message[],communities:Community[]}` membership-bound history, public community metadata only.
- GET /listings?q= -> `{items:ListingReference[]}` published Market listings only; read-only adapter. GET /listings/:id -> `{listing}` for published or existing conversation member contextual reference. Chat preserved if listing disappears; deleted snapshot is not copied sensitive seller info.
- GET /conversations/:id/members -> `{items:Member[]}`
- POST /groups `{name,description,category,region,access}` -> `{conversation}`
- PATCH /groups/:id `{name?,description?,category?,region?,access?}` -> `{conversation}` group owner/admin.
- POST /groups/:id/avatar raw image -> `{conversation}`
- POST /groups/:id/join `{}` -> `{conversation}` public only; banned users denied.
- POST /groups/:id/leave `{}` -> `{ok:true}` owner must transfer ownership if others remain.
- POST /groups/:id/members `{userId}` -> `{ok:true}` owner/admin adds to closed group (no shareable public bypass).
- PATCH /groups/:id/members/:userId `{role?:'admin'|'member'|'owner',canWrite?:boolean}` -> `{ok:true}`; owner-only role promotions/ownership transfer, admins restrict regular members only.
- DELETE /groups/:id/members/:userId -> `{ok:true}` owner/admin kick+ban; cannot modify superior/self through removal.
- GET /communities?q=&category=&region= -> `{items:Community[]}` public only, max50.
- GET /recommendations -> `{items:Community[]}` explain region/category/activity, no private-message mining.
- POST /recommendations/:id/hide `{}` -> `{ok:true}`
- GET /preferences -> `{preferences:ChatPreferences}`
- PATCH /preferences ChatPreferences -> `{preferences}`
- GET /blocks -> `{items:Person[]}`
- POST /blocks `{userId}` -> `{ok:true}`
- DELETE /blocks/:userId -> `{ok:true}`
- POST /reports `{targetType:'message'|'user'|'group',targetId,reason,description?}` -> `{ok:true}`

## Delivery/read contract

An outgoing, nondeleted `Message` includes
`receipt:{recipientCount,deliveredCount,readCount,version}`. Incoming or deleted
messages return `receipt:null`. Legacy `readByCount` remains the author's
aggregate `readCount`, or zero when the receipt is not exposed. Counts and their
revision use one PostgreSQL statement snapshot, including on history/last-message
DTOs. Receiving one's own message on another device does not count as a recipient.

`ReceiptAck` is `{ok:true,conversationId,sequence,deliveredSequence,readSequence,
version,serverAt}`. `sequence` is the resulting server cursor for that ACK type,
not necessarily the older requested sequence. `serverAt` is the server ACK time
in UTC, **not** an exact per-message viewed timestamp. Cursors are account-level
and combine confirmed progress from that account's devices. They never decrease.
The read-through policy is inclusive; entering a conversation without an actual
visible message is not a read. Receipt bodies cannot name a different recipient;
the authenticated user is the only account whose cursor is changed. Zero is an
idempotent no-op; a nonzero sequence must exist in this conversation.

The group denominator is **current members with history access, excluding the
author**, including read-only members. Joining provides access to earlier history
and increases its denominator. Leaving/kicking removes that member and their
receipt contribution. Rejoining starts with both cursors at zero; old legacy read
rows are removed at departure. No opt-out privacy setting is currently offered,
and no personal reader list is exposed. A denominator of zero must not render
“read by everyone”. The UI shows partial real counts until all current recipients
have acknowledged; one participant never stands for the group.

Migration 3 adds `last_delivered_sequence` to the existing membership table and
`receipt_version` to conversations. PostgreSQL triggers enforce monotonic cursors,
read-implies-delivery and revision increments for member insertion/deletion or
cursor advancement, including old-slot writes during blue/green deployment.
Existing real read cursors are migrated as evidence of delivery; pushes and
message sends are never used for backfill. Membership changes may decrease counts;
clients replace aggregate data only using its monotonic `version`, rather than
keeping the maximum count across different versions. Duplicate/stale ACKs do not
increment the revision.

New named SSE events `message.delivered` / `message.read` carry
`{conversationId,userId,sequence,version,serverAt}` plus a compatible `change`
event with `type:'delivered'|'read'`. A read event also implies delivery through
its sequence. New `change/members` events carry the conversation revision.
Events are membership-scoped hints; fetch bounded receipt snapshots to reconcile
actual aggregate counts. Replay/reordering must not downgrade newer versions.
There are no per-message receipt rows or fabricated listening/opening statuses.

Audio attachments include optional `waveform:number[40]`, actual normalized 0..1 peaks from server-decoded audio. Existing recordings can omit it; clients use a stable flat fallback. No peaks supplied by a client are trusted.

Frontend routing stays `#/chat`; the conversation query lives before the hash
(`?chat=<id>#/chat`). No changes to the global router or navbar are required.
Operational configuration, limits and test commands are in `docs/CHAT.md`.

## Messenger 2 additions (schema 4–6)

Existing message IDs, attachments, roles, outbox client IDs and cursor ACKs remain intact.
`messenger.mjs` extends the existing router, PostgreSQL pool, session authorization,
private attachment store and `egin_chat_change` LISTEN/NOTIFY channel.

Additive tables: `chat_reactions` (one emoji per message/user primary key),
`chat_message_personal` (hidden/saved per user), `chat_pins`, `chat_privacy`.
Existing conversations gain `deleted_at`; messages gain `system` JSON; memberships
carry `archived`, `theme`, `draft`, `preferences_version`. Message/attachment kind
constraints additionally accept `video`. `pg_trgm` indexes on message text and
attachment filenames supplement the existing Unicode `simple` full-text index.
No production messages or memberships are seeded or removed by migration.

Message DTO adds `system`, `hidden`, `saved`, `pinned`, `links:string[]`,
`reactions:[{emoji,count,mine,users:Person[]}]`. System membership events retain
`kind:'text'` for old clients, with a typed `system` object for modern rendering;
they do not increment unread badges. Hidden-for-self messages remain tombstones
in incremental history (`hidden:true`) and `deletedIds` reconciliation, and are
excluded from personal previews, search, material collections and quote snapshots.
Deleted-for-all messages still have no rendered placeholder and lose file access.

Conversation DTO additionally exposes the caller's `archived`, `theme`, `draft`,
`preferencesVersion`, `lastReadSequence`. `filter=archived` selects archived chats;
normal list filters exclude them. Other members cannot read someone's draft/theme.

- POST `/conversations/:id/activity` `{state:'typing'|'recording'|'uploading'|null}`
  -> `{ok:true}`. Requires current membership and write access when active.
  Throttled to one equal state per 2.5s. SSE named `activity` contains
  `{conversationId,user,state,expiresAt}`; expiry is milliseconds, 6s after server
  receipt. No activity is persisted as a message or replayed after reconnect.
- PUT `/conversations/:id/messages/:messageId/reaction` `{emoji:string|null}`
  -> `{message}`. Idempotent set/replacement; null removes own reaction. Unique
  database key and conversation transaction serialize simultaneous updates.
- PATCH `/conversations/:id/messages/:messageId/state`
  `{saved?:boolean,hidden?:boolean,pinned?:boolean}` -> `{ok:true,message}`.
  Personal fields are caller-only; hidden message bodies are scrubbed and their attachments return404 to that user. Group pins require owner/admin.
- GET/PATCH `/conversations/:id/preferences` -> `{preferences:{theme,draft,archived,version}}`.
  PATCH accepts any of `theme`, `draft`, `archived`, optional `expectedVersion`;
  stale expected version returns 409 without overwriting another device's draft.
  Draft retains intentional spaces/newlines. Theme shape is
  `{preset,accent:'',background:'',intensity:0.5}`; colors may be HEX6, intensity
  0..1, presets nature/ocean/lavender/sunset/sand/midnight/forest/pearl. No CSS or
  remote image URL injection. SSE `preferences` targets only the owner and carries
  `changedKeys`, allowing clients to avoid list reloads for draft-only updates.
- GET `/conversations/:id/materials?type=media|documents|links|voice|locations&before=<sequence>`.
- GET `/conversations/:id/search?q=&sender=&from=&to=&type=&before=<sequence>`.
- GET `/conversations/:id/saved`, `/conversations/:id/pins`.
  All four return `{items:Message[],messages:Message[],hasMore,nextBefore,nextCursor}`
  newest first, 30 per page. Search scans indexed server history, not loaded rows;
  filters compose with text, filename, sender and UTC dates. `to=YYYY-MM-DD`
  includes the entire UTC day. Private/hidden/deleted results never cross membership.
- POST `/conversations/:id/forward` `{messageIds:string[1..10],targetConversationId,clientIds}`
  -> `{items:Message[]}`. Target must allow writing. Stable client IDs deduplicate
  retry. Forwarded media is copied to a new private storage object: deleting the
  source cannot destroy a separately authorized forwarded file.
- GET `/conversations/:id/messages/:messageId/receipts`
  -> `{receipt,items:[{user,delivered,read,readPrivate}]}`; author only.
- POST `/groups/:id/leave` additionally accepts `{transferToUserId}`. An owner
  can atomically transfer and leave; without a successor when members remain the
  server returns 422. An empty abandoned group cannot be rejoined as ownerless.
- DELETE `/groups/:id` owner only -> `{ok:true}`. Soft delete plus membership
  revocation; no history is physically erased as a side effect of deleting a group.

## Privacy and presence

- GET/PATCH `/privacy` -> `{privacy:{sharePresence,shareReadReceipts}}`; defaults
  false/true. Fields are explicit booleans. Changes sync via membership-scoped SSE.
- POST `/presence` `{active:boolean}` -> `{ok:true}`. Only records presence after
  opt-in, expires after 40s without a foreground heartbeat. No background guarantee.
- GET `/conversations/:id/presence`
  -> `{items:[{user,visible,online,lastSeen}]}`. Requires membership; opt-out and
  either-direction blocks hide all timing. Only actual recent client heartbeats
  produce online status.

Read privacy supersedes the earlier no-opt-out note: private read cursors still
maintain the caller's unread count, but never count toward public read aggregates.
They can prove delivery; corresponding SSE uses `message.delivered`, not a leaked
`message.read`. Personal reader details mark `readPrivate:true`. Member-list
last-read cursors are now self-only. A privacy change increments receipt revisions
so devices can replace previously visible aggregate counts without max-merging.

## Media and realtime details

Documents support PDF, DOCX, XLSX, PPTX, UTF-8 TXT and ZIP; up to ten documents per
message, 15MiB per file, pending upload budget 100MiB/user. OOXML active-content
checks apply to PPTX; ZIP validation bounds entry counts/expanded bytes and rejects
traversal and encryption without extracting any paths. Documents always download
with attachment disposition, nosniff and sandbox CSP; arbitrary HTML is not rendered.
Videos are single-file messages, max15MiB input/output and 180s. Server ffprobe
validates container/dimensions; ffmpeg reencodes H.264 yuv420p/AAC MP4 for Safari,
strips metadata, limits allocations/threads/protocols and enforces a timeout.
Location adds optional nonnegative `accuracy` metres to lat/lng/label.
Link collections parse HTTP(S) URLs locally; there is **no server URL fetch**,
therefore no SSRF-prone metadata-preview endpoint.

New compatible SSE change types: `reaction`, `personal`, `pin`, `preferences`,
`presence`, `privacy`. A reaction includes messageId/authorId/reactor/emoji;
clients show notifications for their own messages from real events. Changed reactions also send a targeted Web Push to the author, honoring mute and excluding self; repeated identical PUTs do not notify again. Personal and
preferences hints go only to that account's streams. Each event rechecks session
and membership. Durable state is refetched on reconnect; PG NOTIFY is an
invalidation channel, not a durable event log. Existing sender/clientId uniqueness,
server sequence ordering and receipt revisions remain authoritative.

Personal image wallpapers use the existing private image upload with
`purpose=wallpaper` and `kind=image`, including members without message-write rights.
`theme.wallpaperAttachmentId` accepts only the current member's unattached image
from the same conversation; URLs, other users' uploads, message media and group
avatars are rejected. The active image cannot be attached to a message. Its
authenticated URL remains uploader-only. Changing a theme affects no other member.
Active references survive pending-file garbage collection; replacement, reset or
leaving the conversation releases the old image to the existing 24-hour orphan
cleanup. Re-selecting an image refreshes its timestamp under lock to avoid racing
garbage collection. A missing image falls back to the chosen theme colors.
Migration 7 also guards active personal images at the database delete boundary:
the previous blue/green API slot's legacy cleanup cannot delete them. The guard
releases assets when the membership/reference disappears or the conversation is
deleted, and does not prevent conversation-delete cascades.

Live geolocation, background location tracking and listened-to-audio receipts are
not exposed as complete features. Foreground static location and actual browser
playback provide the working supported alternatives.

## Video notes

Migration 8 widens existing message/attachment kinds with `video_note`; no parallel
storage or conversation tables are introduced. Existing attachment POST accepts
`kind=video_note` and one private upload ID is sent with `kind=video_note` through
the normal message endpoint. Upload/send/new forwarding require the server
`chat.video_notes` feature for the current account; historical reads remain
available when it is disabled. Idempotent retries of accepted sends still return
the existing message. The platform configuration supplies 10–180 seconds, default
60. New upload completion and send both revalidate the current duration limit.

Inputs are bounded to 15 MiB, MP4/MOV/WebM containers and 4096px dimensions.
Browser WebM without duration is decoded only up to limit+1 seconds; output is
probed and rejected when too long, never silently truncated. Existing bounded
ffmpeg processing produces 480×480 H.264/yuv420p + optional AAC, fast-start MP4,
metadata removal and a WebP poster. The same member/uploader authorization protects
video and `?size=thumb`; deleted or hidden originals are inaccessible. Forwarding
copies both files, so deleting the original does not break the authorized copy.
Orphans use the existing 24-hour cleanup and output/temporary files are removed
on processing failure. Materials `type=media` includes video notes; conversation
search also accepts `type=video_note`.

Playback rings use actual media timeupdate/duration. They do not create a separate
viewed receipt; the existing visible-message read and client-delivery ACK remain
unchanged. Push text identifies a new video note without exposing private content.

The existing chat SSE stream also forwards a named `platform` event containing
only `notificationId`, exclusively to its targeted account after validating the
session. It requires no chat membership; clients fetch authorized durable
notification details from the platform API and reconcile after reconnect.

### Presence / activity update (migration 9)

`GET /privacy` returns `{privacy:{presenceAudience,sharePresence,shareReadReceipts}}`.
`PATCH /privacy` accepts partial settings:
- `presenceAudience: 'all' | 'interlocutors' | 'nobody'` (default `nobody`).
- `all`: authorized members of shared conversations.
- `interlocutors`: people sharing an existing nondeleted direct/market conversation; group-only peers receive no exact timestamps.
- `nobody`: no exact online/last-seen data. A coarse `recently` state is allowed when activity occurred within72h; blocked peers get no coarse signal.
- Legacy boolean `sharePresence` remains compatible (`true`→all, `false`→nobody); conflicting audience+boolean payloads return422.
- Read receipt privacy remains separate, with unchanged actual delivery acknowledgements.

`POST /presence {active:boolean,clientId?:UUID}` is an authenticated visible-tab heartbeat.
The server stores hashed-session/tab leases in `chat_presence_leases` and expires activity after40s.
`active:false` stops only the current lease; other tabs/devices remain online.
`GET /events?clientId=UUID` binds SSE generation to the same lease. Merely opening SSE does not make the user online.
Disconnect closes only that generation: delayed cleanup of an old connection cannot close its replacement.
The last active tab disconnect also emits typing-stop; missed transport cleanup is bounded by the heartbeat lease and typing TTL.
Legacy clients without `clientId` remain supported with the bounded legacy lease.
Expired lease records are cleaned up; last activity is retained in existing `chat_privacy.last_seen`.

`GET /conversations/:id/presence` returns `{items:[{user,visible,online,lastSeen,onlineUntil,status}]}`.
`status` is `online|offline|recently|hidden`. Exact `lastSeen` and `onlineUntil` are null when not visible.
Only valid membership grants access, and bilateral blocks override audience sharing.
Presence notifications are sent only to eligible recipients: hidden heartbeats do not reveal activity through SSE timing.
The frontend expires displayed online at `onlineUntil`, formats relative/today/yesterday timestamps, and scrubs sensitive state before a privacy/block/reconnect refetch.
Benign heartbeat refetches preserve the previous valid snapshot to prevent header flicker.

Typing events remain ephemeral PG NOTIFY data, with six-second expiry, sender throttling and no message rows.
Delivery checks current sender and recipient membership, write permission and bilateral blocks (including within groups).
A committed real message broadcasts typing-stop independently of the client's stop request.
Reconnect clears client activity rather than replaying old transient states.

Ordinary `video` attachments also expose an authenticated `thumbnailUrl` (WebP, max480px). New uploads generate posters from normalized MP4; existing MP4 posters are generated lazily only after access checks, deduplicated per storage key and limited by the shared media-processing concurrency cap. Generation uses atomic file replacement; permissions are rechecked before delivery. Forwarded videos retain independent originals and posters.
