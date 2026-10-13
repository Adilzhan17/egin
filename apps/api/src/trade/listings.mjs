import { randomUUID } from 'node:crypto';
import { text, date, decimal, scaled, version, clientId, page, point, currency, quality, fail, id } from './validation.mjs';
import { activeListings } from './context.mjs';
export function installListings(router, wrap, ctx) {
    const { transaction, org, feature, lot, listingDto, changed, quota } = ctx;
    async function access(c, listingId, user, write = false, lock = false) { const r = (await c.query(`SELECT * FROM trade_listings WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [listingId])).rows[0]; if (!r)
        throw fail(404, 'Публикация не найдена'); let own = !!(await c.query('SELECT 1 FROM business_members WHERE organization_id=$1 AND user_id=$2', [r.organization_id, user])).rowCount; if (write)
        await org(c, r.organization_id, user, true); if (!own && !activeListings.includes(r.status))
        throw fail(404, 'Публикация недоступна'); return { ...r, own }; }
    function input(b, o = {}) { const r = (k, d) => b[k] === undefined ? (o[k] ?? d) : b[k]; const step = Number(r('wizardStep', 1)); if (!Number.isInteger(step) || step < 1 || step > 6)
        throw fail(422, 'Некорректный шаг'); return { title: text(r('title'), 180), quantityTon: r('quantityTon') ? decimal(r('quantityTon'), 3, { positive: true }) : null, pricePerTon: r('pricePerTon') ? decimal(r('pricePerTon'), 2, { positive: true }) : null, currency: currency(r('currency', 'KZT')), region: text(r('region'), 150), deliveryTerms: text(r('deliveryTerms', 'negotiable'), 100), handover: point(r('handover')), paymentTerms: text(r('paymentTerms'), 2000), notes: text(r('notes'), 4000), wizardStep: step }; }
    router.get('/listings', wrap(async (req, res) => res.json(await transaction(async (c) => { const { limit, before } = page(req), values = [req.user.id, before, limit + 1], filters = ['$1::text IS NOT NULL', '($2::uuid IS NULL OR l.id<$2)']; if (req.query.organizationId) {
        await org(c, req.query.organizationId, req.user.id);
        values.push(req.query.organizationId);
        filters.push(`l.organization_id=$${values.length}`);
    }
    else
        filters.push("l.status IN ('active','offers_received','partially_reserved','partially_sold')"); if (req.query.currency) {
        values.push(currency(req.query.currency));
        filters.push(`l.currency=$${values.length}`);
    } for (const [key, column] of [['crop', 'lot.crop'], ['region', 'l.region']])
        if (req.query[key]) {
            values.push(text(req.query[key], 150));
            filters.push(`${column}=$${values.length}`);
        } for (const [key, column, op, scale] of [['minQuantity', 'lot.quantity_ton-lot.reserved_ton-lot.shipped_ton', '>=', 3], ['maxPrice', 'l.price_per_ton', '<=', 2]])
        if (req.query[key]) {
            values.push(decimal(req.query[key], scale));
            filters.push(`(${column})${op}$${values.length}::numeric`);
        } for (const [key, value] of Object.entries(req.query)) {
        const m = key.match(/^(min|max)Quality_(\w+)$/);
        if (m) {
            if (!['moisture', 'impurity', 'protein', 'gluten', 'testWeight', 'fallingNumber', 'oilContent', 'starch'].includes(m[2]))
                throw fail(422, 'Неизвестное качество');
            values.push(decimal(value));
            filters.push(`(lot.quality->>'${m[2]}')::numeric ${m[1] === 'min' ? '>=' : '<='} $${values.length}::numeric`);
        }
    } if (req.query.saved === 'true')
        filters.push('EXISTS(SELECT 1 FROM trade_saved_listings s WHERE s.listing_id=l.id AND s.user_id=$1)'); const rows = (await c.query(`SELECT l.* FROM trade_listings l JOIN crop_lots lot ON lot.id=l.lot_id WHERE ${filters.join(' AND ')} ORDER BY l.id DESC LIMIT $3`, values)).rows; return { items: await Promise.all(rows.slice(0, limit).map(r => listingDto(c, r, req.user.id, !!req.query.organizationId))), nextCursor: rows.length > limit ? rows[limit - 1].id : null }; }))));
    router.get('/listings/:id', wrap(async (req, res) => res.json({ listing: await transaction(async (c) => { const r = await access(c, req.params.id, req.user.id); return listingDto(c, r, req.user.id, r.own); }) })));
    router.post('/listings', wrap(async (req, res) => res.status(201).json({ listing: await transaction(async (c) => { const b = req.body; await org(c, b.organizationId, req.user.id, true); await feature(c, req.user.id, 'trade.crop_listings', b.organizationId); await c.query('SELECT id FROM business_organizations WHERE id=$1 FOR UPDATE', [b.organizationId]); const key = clientId(b); const existing = (await c.query('SELECT * FROM trade_listings WHERE organization_id=$1 AND client_id=$2', [b.organizationId, key])).rows[0]; if (existing)
            return listingDto(c, existing, req.user.id, true); const l = await lot(c, b.lotId, req.user.id, true); if (l.organization_id !== b.organizationId)
            throw fail(422, 'Партия другого хозяйства'); const v = input(b); const r = (await c.query('INSERT INTO trade_listings(id,organization_id,lot_id,client_id,title,quantity_ton,price_per_ton,currency,region,delivery_terms,handover,payment_terms,notes,wizard_step) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *', [randomUUID(), b.organizationId, l.id, key, v.title, v.quantityTon, v.pricePerTon, v.currency, v.region, v.deliveryTerms, v.handover, v.paymentTerms, v.notes, v.wizardStep])).rows[0]; await changed(c, req.user.id, 'listing.created', 'listing', r.id, [r.organization_id]); return listingDto(c, r, req.user.id, true); }) })));
    router.patch('/listings/:id', wrap(async (req, res) => res.json({ listing: await transaction(async (c) => { const r = await access(c, req.params.id, req.user.id, true, true); version(r, req.body.version); if (!['draft', 'withdrawn', 'rejected'].includes(r.status))
            throw fail(409, 'Снимите публикацию перед редактированием'); const v = input(req.body, await listingDto(c, r, req.user.id, true)); const updated = (await c.query('UPDATE trade_listings SET title=$2,quantity_ton=$3,price_per_ton=$4,currency=$5,region=$6,delivery_terms=$7,handover=$8,payment_terms=$9,notes=$10,wizard_step=$11,version=version+1,updated_at=now() WHERE id=$1 RETURNING *', [r.id, v.title, v.quantityTon, v.pricePerTon, v.currency, v.region, v.deliveryTerms, v.handover, v.paymentTerms, v.notes, v.wizardStep])).rows[0]; await changed(c, req.user.id, 'listing.updated', 'listing', r.id, [r.organization_id]); return listingDto(c, updated, req.user.id, true); }) })));
    router.post('/listings/:id/actions', wrap(async (req, res) => res.json({ listing: await transaction(async (c) => { const r = await access(c, req.params.id, req.user.id, true, true); version(r, req.body.version); const action = req.body.action; let status; if (action === 'publish') {
            await feature(c, req.user.id, 'trade.crop_listings', r.organization_id);
            if (!['draft', 'withdrawn', 'rejected'].includes(r.status))
                throw fail(409, 'Публикация уже активна');
            if (!r.title || !r.quantity_ton || !r.region || !r.handover || !r.payment_terms)
                throw fail(422, 'Заполните название, объём, регион, место передачи и условия оплаты');
            const l = await lot(c, r.lot_id, req.user.id, true, true);
            if ((await c.query('SELECT $1::numeric>$2::numeric-$3::numeric-$4::numeric insufficient', [r.quantity_ton, l.quantity_ton, l.reserved_ton, l.shipped_ton])).rows[0].insufficient)
                throw fail(409, 'Для публикации недостаточно доступного урожая');
            if ((await c.query('SELECT 1 FROM trade_listings WHERE lot_id=$1 AND id<>$2 AND status=ANY($3::text[])', [l.id, r.id, activeListings])).rowCount)
                throw fail(409, 'Эта партия уже опубликована');
            status = 'active';
        }
        else if (action === 'withdraw' && activeListings.includes(r.status))
            status = 'withdrawn';
        else if (action === 'archive' && ['draft', 'withdrawn', 'sold', 'rejected'].includes(r.status))
            status = 'archived';
        else if (action === 'complete') {
            const l = await lot(c, r.lot_id, req.user.id);
            if (scaled(l.quantity_ton, 3) !== scaled(l.shipped_ton, 3) || scaled(l.reserved_ton, 3) !== 0n)
                throw fail(409, 'Продажа ещё не исполнена');
            status = 'sold';
        }
        else
            throw fail(409, 'Недопустимый переход публикации'); const u = (await c.query('UPDATE trade_listings SET status=$2,version=version+1,updated_at=now() WHERE id=$1 RETURNING *', [r.id, status])).rows[0]; await changed(c, req.user.id, 'listing.' + action, 'listing', r.id, [r.organization_id]); if (action === 'publish')
            await ctx.notifySearches(c, u); return listingDto(c, u, req.user.id, true); }) })));
    router.put('/listings/:id/saved', wrap(async (req, res) => { await transaction(async (c) => { await access(c, req.params.id, req.user.id); if (typeof req.body.saved !== 'boolean')
        throw fail(422, 'Укажите saved'); if (req.body.saved)
        await c.query('INSERT INTO trade_saved_listings VALUES($1,$2) ON CONFLICT DO NOTHING', [req.user.id, req.params.id]);
    else
        await c.query('DELETE FROM trade_saved_listings WHERE user_id=$1 AND listing_id=$2', [req.user.id, req.params.id]); }); res.json({ saved: req.body.saved }); }));
    const requestDto = r => ({ id: r.id, organizationId: r.organization_id, title: r.title, crop: r.crop, quantityTon: r.quantity_ton, maxPrice: r.max_price, currency: r.currency, region: r.region, quality: r.quality, notes: r.notes, expiresAt: new Date(r.expires_at).toISOString(), status: r.status, version: r.version });
    router.get('/purchase-requests', wrap(async (req, res) => res.json(await transaction(async (c) => { const { limit, before } = page(req); if (req.query.organizationId)
        await org(c, req.query.organizationId, req.user.id); const rows = (await c.query("SELECT * FROM purchase_requests WHERE ($1::uuid IS NULL AND status='active' AND expires_at>now() OR organization_id=$1) AND($2::uuid IS NULL OR id<$2) ORDER BY id DESC LIMIT $3", [req.query.organizationId || null, before, limit + 1])).rows; return { items: rows.slice(0, limit).map(requestDto), nextCursor: rows.length > limit ? rows[limit - 1].id : null }; }))));
    router.get('/purchase-requests/:id', wrap(async (req, res) => res.json({ request: await transaction(async (c) => { const r = (await c.query('SELECT * FROM purchase_requests WHERE id=$1', [req.params.id])).rows[0]; if (!r)
            throw fail(404, 'Запрос не найден'); if (r.status !== 'active' || new Date(r.expires_at) < new Date())
            await org(c, r.organization_id, req.user.id); return requestDto(r); }) })));
    async function saveRequest(req, create) { return transaction(async (c) => { const b = req.body; let old; if (!create) {
        old = (await c.query('SELECT * FROM purchase_requests WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
        if (!old)
            throw fail(404, 'Запрос не найден');
        version(old, b.version);
    } const organizationId = old?.organization_id || b.organizationId; await org(c, organizationId, req.user.id, true); await feature(c, req.user.id, 'trade.buyer_offers', organizationId); if (create) {
        await c.query('SELECT id FROM business_organizations WHERE id=$1 FOR UPDATE', [organizationId]);
        const key = clientId(b), r = (await c.query('SELECT * FROM purchase_requests WHERE organization_id=$1 AND client_id=$2', [organizationId, key])).rows[0];
        if (r)
            return requestDto(r);
    } const v = { ...(old ? requestDto(old) : {}), ...b }; if (!['draft', 'active', 'withdrawn', 'completed'].includes(v.status || 'draft'))
        throw fail(422, 'Недопустимый статус'); if (v.status === 'active' && old?.status !== 'active') {
        await c.query('SELECT id FROM business_organizations WHERE id=$1 FOR UPDATE', [organizationId]);
        const n = Number((await c.query("SELECT count(*) n FROM purchase_requests WHERE organization_id=$1 AND status='active' AND expires_at>now()", [organizationId])).rows[0].n);
        await quota(c, organizationId, 'activeRequests', n);
    } const expiry = date(v.expiresAt, true); if (v.status === 'active' && new Date(expiry) <= new Date())
        throw fail(422, 'Срок закупки уже истёк'); const params = [text(v.title, 180, true), v.crop, decimal(v.quantityTon, 3, { positive: true }), v.maxPrice ? decimal(v.maxPrice, 2, { positive: true }) : null, currency(v.currency || 'KZT'), text(v.region, 150), quality(v.crop, v.quality || {}), text(v.notes, 4000), expiry, v.status || 'draft']; const row = create ? (await c.query('INSERT INTO purchase_requests(id,organization_id,client_id,title,crop,quantity_ton,max_price,currency,region,quality,notes,expires_at,status) VALUES($11,$12,$13,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *', [...params, randomUUID(), organizationId, b.clientId])).rows[0] : (await c.query('UPDATE purchase_requests SET title=$1,crop=$2,quantity_ton=$3,max_price=$4,currency=$5,region=$6,quality=$7,notes=$8,expires_at=$9,status=$10,version=version+1 WHERE id=$11 RETURNING *', [...params, old.id])).rows[0]; await changed(c, req.user.id, 'purchase_request.updated', 'purchase_request', row.id, [organizationId]); return requestDto(row); }); }
    router.post('/purchase-requests', wrap(async (req, res) => res.status(201).json({ request: await saveRequest(req, true) })));
    router.patch('/purchase-requests/:id', wrap(async (req, res) => res.json({ request: await saveRequest(req, false) })));
}
