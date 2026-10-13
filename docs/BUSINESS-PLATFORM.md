# EGIN 3.0: business platform and acceptance guide

## Runtime and data

The website retains its existing React/Vite, Express, identity/session SQLite, PostgreSQL marketplace/chat, Leaflet, ffmpeg/qpdf/Sharp, private disk storage, and blue/green deployment. There is no separate identity store or third-party chat/payment backend. Existing marketplace rows, group memberships, messages, fields and 3D scenes are preserved.

`apps/api/src/platform/` implements organizations, operator permissions, flags, invoices, subscriptions, consenting qualified leads and partner quotations. `apps/api/src/trade/` implements actual harvest trading and farm costs. `apps/mobile/src/features/business/` and `trade/` are reached through the existing Market tab. The Home screen has one compact entry below the 3D section. The bottom navbar is unchanged.

Identity remains the existing `users.id`. Organization fields reference the current owner's SQLite workspace records; they are not copied into another farm database. Public seller descriptions are separate from identifier, phone, email, address and internal notes. Private organization details and billing are owner/admin only. Members accept invitations; removed/demoted inviters cannot leave redeemable grants. Existing members' roles and access are checked again server-side.

## Schema and concurrency

Platform migration 1 introduces `business_organizations`, `business_members`, `business_invitations`, `platform_admins`, `platform_features`, `platform_config`, `platform_audit`, `platform_notifications`, `platform_notification_preferences`, `billing_plans`, `billing_invoices`, `billing_proofs`, `billing_payments`, `organization_subscriptions`, `business_leads`, `lead_charges`, `business_partner_services`. Migration 2 adds `billing_adjustments`, `business_service_invitations`, `business_service_offers`.

Trade migrations introduce `crop_lots`, `trade_listings`, `trade_saved_listings`, `purchase_requests`, `trade_offers`, immutable `trade_offer_versions`, `trade_deals`, `trade_deal_events`, `deal_shipments`, `deal_payments`, `deal_documents`, `trade_files`, `farm_expenses`, and the saved-search/matching queue tables. Quality, costs and immutable agreed conditions use validated JSONB; quantities/money are NUMERIC. See `apps/api/src/trade/CONTRACT.md` for DTOs and the full route contract.

Chat migration 8 extends existing message/attachment kinds with `video_note`. No history is recreated. Trade migrations are versions 1–4. All migrations are additive and serialized by PostgreSQL advisory migration locks.

Durable operations use UUID request IDs, unique constraints, row locks and expected versions. Lot reservation and deal creation commit together. Partial shipments move reserved stock to shipped stock. Repeated payment review cannot issue a second subscription. Existing obligations can still be read and fulfilled after disabling new trade operations or after a plan expires.

## Financial meaning

Money and tonnes cross Trade APIs as decimal strings. Integer-scaled BigInt arithmetic and PostgreSQL NUMERIC avoid binary calculation errors. Gross, seller expenses, net proceeds and optionally margin are distinct. Incurred costs and buyer-paid costs are not subtracted as new seller expenses. Unknown logistics/loading stays unknown; estimated or incomplete proposals do not get a definitive winner. Taxes require the explicit `manual_explicit` model, without assumptions about VAT or a person's tax regime. Currencies are compared separately; there is no automatic FX conversion.

Farm revenue means seller-confirmed receipts, not promised offers. Plan and actual expenses are separate. Areas/yields are sourced from stored fields and lots. Missing costs, area, yields or valuations remain missing. CSV exports escape spreadsheet formulas. Advanced multi-year history, exports and saved searches use the configured plan entitlements; basic farming/trade data remains available.

## Realtime, durable notifications and files

Writes commit audit records and per-user notification rows in the same transaction as the business change. `pg_notify('egin_chat_change', …)` carries only a recipient and notification ID. The existing Chat SSE connection emits the targeted `platform` event after validating the session. Clients refresh permitted resources; the notification API supplies durable history, unread counts, and replay after reconnect. Delivery is acknowledged only for visible rows in an active browser tab. A persisted preference can hide unread counters/highlights without discarding history or stopping synchronization. Destination resolution rechecks notification ownership and current organization access when clicked, including partner-only service events. No offer payload is broadcast globally. Offer expiry, overdue payments and saved-search matches run with database locking/deduplication across both deployment slots.

Negotiation cards are created by the server in the existing direct conversation between company owners. Their prices/versions are loaded from authorized Trade APIs. Accept/reject is an explicit operation with confirmation, not an ordinary message. If a participant blocks the other, a new chat is not forced; the trade workspace still contains the authoritative record.

Files use the existing safe image/document/video validators. Trade documents require current organization or deal membership. Published listing images are separate from private quality/contract files. Contracts keep revisions and counterpart acknowledgments. Billing proof images/PDFs are restricted to current owner/admin or platform operator. Unbound billing uploads age out after 24 hours; referenced proof remains retained for audit. Unreferenced Trade and Chat uploads have their own cleanup. Private documents are never exposed through public permanent URLs; the separate listing-image endpoint serves only images belonging to publicly visible listings.

## Administrative access

No first-registrant administrator shortcut exists. Administrators are explicit `platform_admins` records, independently per environment. The operator can configure `EGIN_ADMIN_USER_IDS` or use the CLI shipped inside the API image:

```sh
node scripts/platform-admin.mjs grant USER_ID
node scripts/platform-admin.mjs list
node scripts/platform-admin.mjs revoke USER_ID
```

Run this inside the active environment's API container with its existing DATA_DIR and database connection. The command checks that the account exists, and audits grants/revocations. Never copy production sessions or volumes to staging.

After a grant: **Рынок → Урожай / сделки → Организация и тарифы → Управление egin**. Direct link: `/#/market?view=business&tab=admin`. Administrators can review organizations and leads, set plan terms/bank instructions, verify bank receipts, grant an explicit trial, record an actually completed refund, inspect audit and toggle modules.

## Feature flags

Public effective-state endpoint: `GET /api/platform/features?organizationId=…`. An organization context requires membership. Response includes `features`, `admin` and `videoNoteMaxSeconds`. Clients refresh on focus/reconnect; all new sensitive operations check server state independently.

Supported flags:

- `chat.video_notes`
- `trade.enabled`, `trade.crop_listings`, `trade.buyer_offers`, `trade.profit_comparison`, `trade.deal_management`, `trade.logistics`, `trade.partner_services`
- `farm.cost_accounting`, `farm.profit_analytics`
- `billing.buyer_subscriptions`, `billing.farmer_pro`, `billing.qualified_leads`

Each rule has enabled, mode (`all`, `users`, `roles`, `organizations`), explicit targets, and an optimistic version. Role scopes are organization owner/admin/trader/viewer, not an unrestricted platform-admin flag. All modules initially allow testing; no paid plans/prices, bank accounts, commercial offers or verified organizations are invented. Turning a switch off does not delete data. Existing deals and documents remain reachable from Market even when new Trade is disabled.

Video-note duration is configured in the same panel, 10–180 seconds, default 60. The server independently checks the actual decoded duration.

## Billing and integrations

Plans and amounts live in PostgreSQL, not React constants. Free baseline limits are 3 employees, 3 active buyer requests and 10 buyer offers per calendar month. Farmers can receive proposals and service their deals for free. Paid plan snapshots preserve terms on issued invoices even if an operator later changes the catalogue.

There is no configured payment provider. An operator must enter actual EGIN bank instructions before invoices can be issued. A user uploads evidence and reports a transfer. This creates `claimed`, without premium access. An authorized operator compares it with actual bank records and confirms or rejects it. Only full confirmed invoice payment activates the snapshot subscription. Explicit administrator-granted trials are separate. Cancellation keeps already paid access to its expiry; no automatic debit or auto-renew exists. Refund controls record a real external return with its bank reference; EGIN does not initiate a transfer.

Qualified lead owners explicitly consent to share only the supplied contacts for the stated commercial purpose; buyers agree before requesting access. An operator verifies the lead and sets a price. Contact access begins after confirmed payment, stops on withdrawal/refund, and never exposes the owner's unrelated profile data. Duplicate active submissions/access charges are prevented.

Real partner companies publish services and receive an invitation scoped to a deal and its stated task. They can issue actual expiring quotations, and the inviting party can accept/reject them. Partners do not gain access to private deal documents. Agreement is not a signed contract or payment.

No EDS, bank webhook/provider, registry verification service, route engine, carrier quote API or automatic tax filing is configured. Organization verification is an operator decision with a recorded basis. Document states describe uploaded copies and bilateral acknowledgment; they never claim an EDS signature. Logistics shows supplied points and an external route link, with no invented road distance. Costs retain their actual/manual/estimated source.

## Manual acceptance: seller and buyer

Use separate browser profiles/accounts. Test data belongs in staging/local, not production.

1. Sign in with the existing passkey/QR flow. Open Market → harvest/trade → organization settings. Create a **Хозяйство**, optionally link existing plots, enter storage/crops and private details.
2. In a separate account create **Покупатель**. Invite an employee by existing profile, accept from their account, and check viewer versus trader rights. Removing them must revoke API/document access immediately.
3. Seller: create a lot with crop-specific quality, actual quantity, storage, field and private quality files. Publish with the six-step wizard; save/reload a draft before publication.
4. Buyer: find the lot, create a structured offer with volume/price/expiry/payment and delivery conditions. Supply seller expenses with their source, or leave explicitly unknown.
5. Add a second independent buyer offer. Seller selects both to compare net proceeds. Different currencies, delivery/payment terms, volumes or missing costs must prevent a definitive best-offer label.
6. Open the negotiation in Chat; reply normally, inspect current conditions, counter, accept or reject explicitly. Offer revisions remain in history. Acceptance creates one deal and reserves stock. Competing excess acceptance fails.
7. Both parties agree conditions. Upload a contract copy/specification, confirm the copy from the other account and acknowledge contract conditions from both sides. This does not claim EDS signing.
8. Seller records a partial shipment. Buyer enters actual accepted quantity/quality. A discrepancy remains open until both sides resolve it. Repeat within reserved quantity.
9. Buyer reports a payment with bank reference/documents. Confirmed revenue stays unchanged. Seller checks actual receipt, then confirms (or rejects with reason). Finish all shipments/acceptances/payments and confirm completion from both parties.
10. Add actual and planned farm costs or import the supported CSV template. Check per-crop/per-field figures, confirmed proceeds and missing-data warnings. Compare years/export only with the appropriate enabled entitlement.
11. Operator creates a real plan and bank instructions or grants an explicitly authorized trial. User requests an invoice, uploads proof and reports an actual transfer. Before operator confirmation no paid features unlock. Confirm twice to verify idempotency, then test expiry/cancellation while retaining old deals/documents.
12. Paid saved search: save crop/region/price/volume filters. Another seller publishes matching stock; one durable notification appears, including after reconnect. Re-publication does not duplicate the match.
13. Partner: publish a service. A deal party requests it. Partner quotes price/conditions/expiry. The requester explicitly accepts/rejects; a closed deal must reject new acceptance.
14. Test feature scopes with two accounts/organizations. Disable new trading and video recording; old messages, videos and existing deal servicing remain available.

For camera gestures, native Safari/Android permissions and playback, use `docs/VIDEO-NOTES.md`.

## Verification commands

Use Docker tooling in this workspace. The isolated PostgreSQL suites are `tests/platform.test.mjs`, `platform-security.test.mjs`, `platform-partners.test.mjs`, `trade.test.mjs` and existing/new Chat suites. They need MARKET_TEST_DATABASE_URL / CHAT_TEST_DATABASE_URL pointing to a disposable **test** database, with ffmpeg/qpdf for media.

Mobile browser suites: `trade.cjs` (real passkeys, three accounts, actual API/DB), `business-admin.cjs`, `business-panel.cjs`, `business-notifications.cjs`, `chat-trade-card.cjs`, `chat-video-note.cjs` (Chromium fake physical devices + actual MediaRecorder), `chat-video-outbox.cjs` (IndexedDB/network failure), plus existing Chat regressions. Fixture suites use Vite4947. The CI workflow generates the local MP4 fixture used by WebKit/outbox tests. Physical iPhone/Android camera testing is still required; WebKit automation is not a physical iPhone test.

`pnpm typecheck`, `pnpm test`, `pnpm build` cover both webapps. No lint script is configured. Website-only deployment uses staging first, then production reuse-images; do not build native packages without «релиз».
