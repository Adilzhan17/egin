# Trade & Farm API

Base `/api/trade`, authenticated existing session. All money/quantity fields are decimal **strings** (money 2dp, tonnes 3dp). IDs UUID. Mutations on existing entities require `version` (409 on stale). Creation accepts `clientId` UUID for retry idempotency. GET collections `{items,nextCursor}` limit30, `before` UUID. Detail/mutations return `{lot}`, `{listing}`, `{offer}`, `{deal}`, `{expense}`, `{request}`, `{file}`. ISO UTC dates.

Organization APIs live in `/api/platform/organizations` (root implementation). Pass organizationId on creates and collection ownership filter. Organization trader/admin/owner can transact; viewer can read.

## Lots
GET `/crops` -> `{items:[{id,name,quality:[{key,label,unit,min,max}]}]}`
GET `/lots?organizationId=`; POST `/lots`; GET/PATCH `/lots/:id`.
Lot input `{clientId,organizationId,name,crop,productType,grade,harvestYear,quantityTon,quality:{moisture,impurity,...cropSpecific},storage:{label,latitude?,longitude?,road?,rail?},fieldId?,readyAt?,notes?,fileIds?:[]}`. Patch adds version. Quantity cannot go below reserved+shipped. DTO adds availableTon,reservedTon,shippedTon,version,files,createdAt. Field must belong to organization's linked workspace.

## Listings and purchase requests
GET `/listings?crop=&region=&minQuantity=&maxPrice=&minQuality_KEY=&maxQuality_KEY=&organizationId=&saved=true`; POST `/listings`; GET/PATCH `/listings/:id`; POST `/listings/:id/actions` `{version,action:'publish'|'withdraw'|'archive'|'complete'}`; PUT `/listings/:id/saved` `{saved:boolean}`.
Create draft input `{clientId,organizationId,lotId,title?,quantityTon,pricePerTon?,currency:'KZT'|'USD'|'EUR',region,deliveryTerms:'pickup'|'delivered'|'negotiable',handover:{label,latitude?,longitude?},paymentTerms?,notes?,wizardStep:1..6}`. Draft can be incomplete. Publish validates required fields and available stock. One live listing per lot. DTO adds lot(public summary),seller(public organization),status,version,saved. Owner filter returns all statuses; other users only published. Status active/offers_received/partially_reserved/partially_sold/sold/draft/withdrawn/archived.
GET/POST `/purchase-requests`; GET/PATCH `/purchase-requests/:id`; input organizationId,clientId,title,crop,quantityTon,maxPrice?,currency,region,quality,notes,expiresAt,status:draft|active|withdrawn|completed.

## Offers and financial comparison
GET `/offers?organizationId=&lotId=&listingId=`; POST `/offers`; GET `/offers/:id`; POST `/offers/:id/revisions`; POST `/offers/:id/actions` `{version,action:'send'|'receive'|'review'|'accept'|'reject'|'withdraw'}`. Accept atomically creates deal + reserve; response `{offer,deal}`.
Create `{clientId,organizationId:BUYER_ORG,listingId,status:'draft'|'sent',terms:{pricePerTon,quantityTon,currency,deliveryTerms,handover:{label,latitude?,longitude?},destination:{label,latitude?,longitude?},logisticsPayer:'seller'|'buyer',loadingPayer:'seller'|'buyer',qualityRequirements:{},qualityDiscounts?,expiresAt,paymentTerms,prepaymentPercent?,finalPaymentDueAt?,notes?},costs:[],fileIds:[]}`.
Revision `{version,terms,costs,fileIds}` by either side; last proposer cannot accept own version. Seller revision sets countered. Full immutable versions exposed on detail. Expired offers cannot accept. DTO includes buyer,seller,terms,costs,calculation,versions,conversationId,dealId,version,status.
Cost `{id:string,category:'logistics'|'loading'|'unloading'|'storage'|'drying'|'cleaning'|'laboratory'|'commission'|'quality_discount'|'other'|'tax',amount:string|null,currency,method:'fixed'|'per_ton'|'percent_gross',payer:'seller'|'buyer',confirmed:boolean,source,asOf,incurred:boolean,taxModel?:'manual_explicit'}`. Null amount is unknown. Seller logistics/loading must be explicitly supplied even when 0. Already incurred costs excluded; no duplicate IDs. Tax requires explicit model, no automatic VAT assumption.
POST `/calculate` `{terms,costs,costBasisPerTon?}` -> `{calculation:{gross,sellerCosts,net,netPerTon,margin?,preliminary,warnings,breakdown,currency}}`.
POST `/offers/compare` `{organizationId,offerIds:[2..10],quantityTon?}` -> `{items:[offer+calculation],comparable,warnings,bestOfferId?,difference?}`; comparisons only rank complete estimates with same quantity/currency/delivery/payers/paymentTerms.

## Deals
GET `/deals?organizationId=`; GET `/deals/:id` -> `{deal}` includes immutable terms, shipments,payments,documents,events,financial:{gross,confirmedPaid,outstanding},version,status,confirmation fields.
POST `/deals/:id/actions` `{version,action:'agree_terms'|'request_documents'|'confirm_contract'|'ready_to_ship'|'cancel'|'dispute'|'resolve_dispute'|'complete',note?}`.
Both parties agree terms; contract confirmation requires uploaded contract and both-side confirmation, explicitly NOT EDS signature. Cancel before shipping releases reservation; after shipping use dispute. Completion requires shipment/acceptance/full bilateral payments and agreement both sides.
POST `/deals/:id/shipments` `{clientId,quantityTon,plannedAt?,shippedAt?,carrier?,documentIds?:[],notes?}` (seller; reserved -> shipped atomically).
POST `/deals/:id/shipments/:shipmentId/accept` `{version,acceptedTon,quality:{},discrepancy?,deliveredAt?}` (buyer). accepted<=shipped; discrepancy remains visible and puts deal in discrepancy. POST `/deals/:id/shipments/:shipmentId/resolve` `{version,note}` requires both parties.
POST `/deals/:id/payments` `{clientId,amount,currency,paidAt,reference,documentIds?:[]}` (buyer report; pending).
POST `/deals/:id/payments/:paymentId/confirm` `{version}` seller confirms actual receipt; duplicate retry cannot double count; max total <=gross.
POST `/deals/:id/documents` `{clientId,fileId,kind:'contract'|'specification'|'quality'|'shipping'|'invoice'|'payment'|'act'|'other',title,replacesId?}`; POST `/deals/:id/documents/:documentId/confirm` `{version}` counterpart confirms uploaded copy; prior revisions preserved.

## Private files
POST `/files?organizationId=&kind=image|document&name=` raw binary Content-Type application/octet-stream; optional `dealId` scopes both parties access. Limit15MB, existing safe file validator. Response `{file:{id,name,mimeType,size,url,kind}}`. GET `/files/:id/file` checks current organization/deal membership. Lot public images only via `/listings/:id/images/:fileId` if published and attached image. Documents never public.

## Farm costs, analytics, logistics
GET/POST `/expenses?organizationId=`; PATCH/DELETE `/expenses/:id` version required. Input `{clientId,organizationId,fieldId?,lotId?,crop?,harvestYear,category:'seeds'|'fertilizer'|'protection'|'fuel'|'equipment'|'labor'|'maintenance'|'storage'|'other',amount,currency,date,planned:boolean,notes}`.
POST `/expenses/import` `{organizationId,clientId,rows:[same expense input max500]}` atomic; duplicates reject perclientID; frontend parses supported CSV to rows. GET `/analytics?organizationId=&harvestYear=&currency=KZT` -> `{analytics:{currency,actualExpenses,plannedExpenses,confirmedRevenue,expectedRevenue,financialResult,availableTon,reservedTon,shippedTon,actualHarvestTon,availableHarvestValue,unpricedLots,activeListings,activeOffers,activeDeals,byCrop:[],byField:[],warnings:[]}}`. Actual revenue only seller-confirmed payments. No invented yield/costs. Group entries include costsPerTon, costPerHectare only if area known.
GET `/analytics/export` same query -> CSV attachment (formula-safe).
POST `/logistics` `{organizationId,origin:{label,latitude,longitude},destination:{label,latitude,longitude},cost?,source?}` -> `{route:{origin,destination,roadDistanceKm:null,status:'routing_not_configured',externalUrl},estimate}`. Coordinates are points, no fabricated road distance.

Existing-deal reads/files/payments/shipments remain available when feature flags/plans change. New lots/listings/offers and analytics respect flags. Trade writes emit platform notifications+SSE and audit within same transaction.

Additional payment correction: POST `/deals/:id/payments/:paymentId/reject` `{version,note}` seller-only, only reported payments. Preserves audit; rejected claims no longer consume payment ceiling and can never be confirmed. Buyer reports a corrected claim with a new clientId. Payment DTO status reported|confirmed|rejected. Deals include immutable `lotSnapshot` (name,crop,productType,grade,harvestYear,quality,storage) from acceptance. Overdue payment notifications are persisted once per deal by maintenance sweep.

Saved buyer searches: GET `/saved-searches?organizationId=` -> `{items:[{id,organizationId,name,filters,createdAt}]}`; POST `/saved-searches` `{organizationId,name,filters:{crop?,region?,minQuantity?,maxPrice?,currency:'KZT'}}` -> `{search}`; DELETE `/saved-searches/:id` -> `{deleted:true}`. Creating requires paid `savedSearches` entitlement; existing configurations remain viewable/removable. Listing publish triggers persisted platform notification `listing.search_match` once per search/listing (unique constraint); missing/expired subscription suspends matching. No fictional matches or automatic purchases.

Egin Pro financial history: GET `/analytics/history?organizationId=&currency=KZT&fromYear=2017&toYear=2026`. At most ten consecutive harvest years; defaults to latest ten. Requires `advancedAnalytics` entitlement and farm.profit_analytics flag. Returns `{items:[{harvestYear,currency,actualExpenses,plannedExpenses,confirmedRevenue,expectedRevenue,financialResult,actualHarvestTon,availableTon,reservedTon,shippedTon,costsPerTon}],fromYear,toYear,currency,model:'cash_received_minus_recorded_costs',warnings}`. Three grouped SQL queries, no per-year queries. Years with no source records are omitted. Basic accounting, single-period analytics and historical source documents remain accessible independently.
