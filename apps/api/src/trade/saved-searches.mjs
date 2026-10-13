import { randomUUID } from 'node:crypto';
import { text, decimal, currency, crops, page, fail, id } from './validation.mjs';
import { scaled } from './decimal.mjs';
export function installSavedSearches(router, wrap, ctx) {
    const { transaction, org, feature, platform } = ctx;
    const dto = r => ({ id: r.id, organizationId: r.organization_id, name: r.name, filters: r.filters, createdAt: new Date(r.created_at).toISOString() });
    router.get('/saved-searches', wrap(async (req, res) => res.json(await transaction(async (c) => { await org(c, req.query.organizationId, req.user.id); return { items: (await c.query('SELECT * FROM trade_saved_searches WHERE organization_id=$1 AND user_id=$2 ORDER BY created_at DESC', [req.query.organizationId, req.user.id])).rows.map(dto) }; }))));
    router.post('/saved-searches', wrap(async (req, res) => res.status(201).json({ search: await transaction(async (c) => { const b = req.body; await org(c, b.organizationId, req.user.id, true); await feature(c, req.user.id, 'trade.buyer_offers', b.organizationId); if (!(await platform.entitlement(c, b.organizationId, 'savedSearches')).allowed)
            throw fail(403, 'Уведомления по сохранённым фильтрам доступны по тарифу'); await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`trade-saved-search:${req.user.id}`]); const count = Number((await c.query('SELECT count(*) n FROM trade_saved_searches WHERE user_id=$1', [req.user.id])).rows[0].n); if (count >= 20)
            throw fail(422, 'Можно сохранить не более 20 поисков'); const f = b.filters || {}, filters = { currency: currency(f.currency || 'KZT') }; if (f.crop) {
            if (!crops.some(v => v.id === f.crop))
                throw fail(422, 'Неизвестная культура');
            filters.crop = f.crop;
        } if (f.region)
            filters.region = text(f.region, 150); if (f.minQuantity)
            filters.minQuantity = decimal(f.minQuantity, 3); if (f.maxPrice)
            filters.maxPrice = decimal(f.maxPrice, 2); if (!Object.keys(filters).some(k => k !== 'currency'))
            throw fail(422, 'Укажите культуру, регион, объём или цену'); const name = text(b.name, 120, true), r = (await c.query('INSERT INTO trade_saved_searches(id,organization_id,user_id,name,filters) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,organization_id,filters) DO UPDATE SET name=excluded.name RETURNING *', [randomUUID(), b.organizationId, req.user.id, name, filters])).rows[0]; await platform.audit(c, req.user.id, 'search.saved', 'search', r.id); return dto(r); }) })));
    router.delete('/saved-searches/:id', wrap(async (req, res) => { await transaction(async (c) => { const r = (await c.query('SELECT * FROM trade_saved_searches WHERE id=$1 AND user_id=$2 FOR UPDATE', [req.params.id, req.user.id])).rows[0]; if (!r)
        throw fail(404, 'Поиск не найден'); await org(c, r.organization_id, req.user.id); await c.query('DELETE FROM trade_saved_searches WHERE id=$1', [r.id]); await platform.audit(c, req.user.id, 'search.deleted', 'search', r.id); }); res.json({ deleted: true }); }));
    ctx.notifySearches = async (c, listing) => { await c.query('INSERT INTO trade_search_jobs(listing_id) VALUES($1) ON CONFLICT(listing_id) DO UPDATE SET cursor_id=NULL,created_at=now()', [listing.id]); };
    ctx.processSearches = async (c) => { const jobs = (await c.query('SELECT * FROM trade_search_jobs ORDER BY created_at LIMIT 5 FOR UPDATE SKIP LOCKED')).rows; for (const job of jobs) {
        const listing = (await c.query("SELECT * FROM trade_listings WHERE id=$1 AND status IN ('active','offers_received','partially_reserved','partially_sold')", [job.listing_id])).rows[0];
        if (!listing) {
            await c.query('DELETE FROM trade_search_jobs WHERE listing_id=$1', [job.listing_id]);
            continue;
        }
        const lot = (await c.query('SELECT * FROM crop_lots WHERE id=$1', [listing.lot_id])).rows[0], rows = (await c.query('SELECT s.* FROM trade_saved_searches s JOIN business_members m ON m.organization_id=s.organization_id AND m.user_id=s.user_id WHERE s.organization_id<>$1 AND($2::uuid IS NULL OR s.id>$2) AND s.created_at<=$3 ORDER BY s.id LIMIT 100', [listing.organization_id, job.cursor_id, job.created_at])).rows;
        for (const s of rows) {
            const worlds=(await c.query('SELECT demo_owner_id FROM business_organizations WHERE id=ANY($1::uuid[])',[[s.organization_id,listing.organization_id]])).rows;if(worlds.some(o=>o.demo_owner_id)&&!worlds.every(o=>o.demo_owner_id===s.user_id))continue; const f = s.filters;
            if (f.currency !== listing.currency || f.crop && f.crop !== lot.crop || f.region && f.region !== listing.region || f.maxPrice && (!listing.price_per_ton || scaled(listing.price_per_ton) > scaled(f.maxPrice)) || f.minQuantity && scaled(lot.quantity_ton, 3) - scaled(lot.reserved_ton, 3) - scaled(lot.shipped_ton, 3) < scaled(f.minQuantity, 3))
                continue;
            if (!(await platform.entitlement(c, s.organization_id, 'savedSearches')).allowed)
                continue;
            const inserted = await c.query('INSERT INTO trade_search_matches(search_id,listing_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING search_id', [s.id, listing.id]);
            if (inserted.rowCount)
                await platform.emit(c, [s.user_id], 'listing.search_match', 'listing', listing.id, { searchId: s.id, searchName: s.name, title: listing.title, organizationId: s.organization_id });
        }
        if (rows.length < 100)
            await c.query('DELETE FROM trade_search_jobs WHERE listing_id=$1', [listing.id]);
        else
            await c.query('UPDATE trade_search_jobs SET cursor_id=$2 WHERE listing_id=$1', [listing.id, rows.at(-1).id]);
    } };
}
