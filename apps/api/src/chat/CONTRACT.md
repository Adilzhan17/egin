# Chat implementation contract

Isolated module, existing session auth/SQLite users, namespaced PostgreSQL tables
in the existing PostgreSQL service. `CHAT_DATABASE_URL` falls back to
`MARKET_DATABASE_URL`. Market is read-only to Chat. No seed users/groups/messages.
Frontend types are in `apps/mobile/src/features/chat/types.ts` (camelCase).

All routes below are prefixed `/api/chat`, authenticated except `/health`.
Errors: `{error}` and appropriate status. UUID IDs except existing user IDs.
All list limits bounded server-side. Each mutation requires existing X-EGIN/origin protection.

- GET /health -> `{ok:true,storage:'postgresql'}`
- GET /conversations?filter=all|direct|market|group&q=&before= -> `{items:Conversation[],nextCursor:string|null}`
- POST /conversations `{kind:'direct',userId}` or `{kind:'market',listingId}` -> `{conversation}` (get/create idempotent pair, listing owner server-derived).
- GET /conversations/:id -> `{conversation}`
- PATCH /conversations/:id `{muted?,pinned?}` -> `{conversation}`
- GET /conversations/:id/messages?before=<sequence>&after=<sequence>&q= -> `{items:Message[],hasMore:boolean}` chronological server sequence. q searches only this conversation.
- POST /conversations/:id/messages MessageDraft -> `{message}`; unique sender/clientId, retry returns original; max4000 chars.
- PATCH /conversations/:id/messages/:messageId `{text}` -> `{message}`
- DELETE /conversations/:id/messages/:messageId -> `{message}` tombstone, author or group admin.
- POST /conversations/:id/read `{sequence}` -> `{ok:true}`; advance monotonic read cursor; receipt counts reflect actual read.
- POST /conversations/:id/attachments?name=<filename>&kind=image|document|audio (raw bytes; Content-Type application/octet-stream, X-EGIN) -> `{attachment}`; max10MiB/image,15MiB/document,10MiB/audio. Membership+write permission checked; pending attachment private to uploader until attached.
- GET /attachments/:id/file?size=thumb -> private binary; authorization checked each request, no-store; docs attachment disposition.
- GET /events -> SSE `event:change`, data `{conversationId?,type}`; event:ready on connect. Authenticated user scope, no message content. Frontend refetches incremental history, periodically reconciles edits/deletions; reconnect refetches. Membership/session must be revalidated and streams closed on revoke/logout. PG notifications work across app slots.
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

Frontend routing stays `#/chat`; the conversation query lives before the hash
(`?chat=<id>#/chat`). No changes to the global router or navbar are required.
Operational configuration, limits and test commands are in `docs/CHAT.md`.
