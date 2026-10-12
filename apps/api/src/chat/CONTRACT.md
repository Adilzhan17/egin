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
