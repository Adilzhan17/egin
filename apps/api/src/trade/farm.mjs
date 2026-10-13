import { randomUUID } from 'node:crypto';
import { text, date, decimal, currency, version, clientId, page, fail, id, crops } from './validation.mjs';
import { scaled, format, divide } from './decimal.mjs';
export function installFarm(router, wrap, ctx) {
    const { transaction, org, feature, field, lot, changed } = ctx;
    const categories = ['seeds', 'fertilizer', 'protection', 'fuel', 'equipment', 'labor', 'maintenance', 'storage', 'other'];
    const dto = r => ({ id: r.id, organizationId: r.organization_id, fieldId: r.field_id, lotId: r.lot_id, crop: r.crop, harvestYear: r.harvest_year, category: r.category, amount: r.amount, currency: r.currency, date: String(r.expense_date instanceof Date ? r.expense_date.toISOString() : r.expense_date).slice(0, 10), planned: r.planned, notes: r.notes, version: r.version });
    async function input(c, b, user, organizationId) { if (!categories.includes(b.category))
        throw fail(422, 'Выберите категорию расхода'); const harvestYear = Number(b.harvestYear); if (!Number.isInteger(harvestYear) || harvestYear < 1900 || harvestYear > 2200)
        throw fail(422, 'Укажите год урожая'); if (b.crop && !crops.some(x => x.id === b.crop))
        throw fail(422, 'Неизвестная культура'); if (typeof b.planned !== 'boolean')
        throw fail(422, 'Отделите плановый расход от фактического'); await field(c, organizationId, user, b.fieldId); if (b.lotId) {
        const l = await lot(c, b.lotId, user);
        if (l.organization_id !== organizationId)
            throw fail(422, 'Партия другого хозяйства');
        if (b.crop && l.crop !== b.crop)
            throw fail(422, 'Культура расхода отличается от партии');
    } return { ...b, harvestYear, amount: decimal(b.amount), currency: currency(b.currency), date: date(b.date, true).slice(0, 10), notes: text(b.notes, 2000), fieldId: b.fieldId || null, lotId: b.lotId || null, crop: b.crop || null }; }
    async function insert(c, b, user, organizationId) { const key = clientId(b), old = (await c.query('SELECT * FROM farm_expenses WHERE organization_id=$1 AND client_id=$2', [organizationId, key])).rows[0]; if (old)
        return dto(old); const v = await input(c, b, user, organizationId), r = (await c.query('INSERT INTO farm_expenses(id,organization_id,client_id,field_id,lot_id,crop,harvest_year,category,amount,currency,expense_date,planned,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *', [randomUUID(), organizationId, key, v.fieldId, v.lotId, v.crop, v.harvestYear, v.category, v.amount, v.currency, v.date, v.planned, v.notes])).rows[0]; await changed(c, user, 'expense.created', 'expense', r.id, [organizationId]); return dto(r); }
    router.get('/expenses', wrap(async (req, res) => res.json(await transaction(async (c) => { await org(c, req.query.organizationId, req.user.id); const { limit, before } = page(req); const year = req.query.harvestYear ? Number(req.query.harvestYear) : null; if (year !== null && (!Number.isInteger(year) || year < 1900 || year > 2200))
        throw fail(422, 'Некорректный год'); const cur = req.query.currency ? currency(req.query.currency) : null; const rows = (await c.query('SELECT * FROM farm_expenses WHERE organization_id=$1 AND($2::uuid IS NULL OR id<$2) AND($4::integer IS NULL OR harvest_year=$4) AND($5::text IS NULL OR currency=$5) ORDER BY id DESC LIMIT $3', [req.query.organizationId, before, limit + 1, year, cur])).rows; return { items: rows.slice(0, limit).map(dto), nextCursor: rows.length > limit ? rows[limit - 1].id : null }; }))));
    router.post('/expenses', wrap(async (req, res) => res.status(201).json({ expense: await transaction(async (c) => { await org(c, req.body.organizationId, req.user.id, true); await feature(c, req.user.id, 'farm.cost_accounting', req.body.organizationId); await c.query('SELECT id FROM business_organizations WHERE id=$1 FOR UPDATE', [req.body.organizationId]); return insert(c, req.body, req.user.id, req.body.organizationId); }) })));
    router.patch('/expenses/:id', wrap(async (req, res) => res.json({ expense: await transaction(async (c) => { const r = (await c.query('SELECT * FROM farm_expenses WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0]; if (!r)
            throw fail(404, 'Расход не найден'); await org(c, r.organization_id, req.user.id, true); version(r, req.body.version); const v = await input(c, { ...dto(r), ...req.body }, req.user.id, r.organization_id), u = (await c.query('UPDATE farm_expenses SET field_id=$2,lot_id=$3,crop=$4,harvest_year=$5,category=$6,amount=$7,currency=$8,expense_date=$9,planned=$10,notes=$11,version=version+1 WHERE id=$1 RETURNING *', [r.id, v.fieldId, v.lotId, v.crop, v.harvestYear, v.category, v.amount, v.currency, v.date, v.planned, v.notes])).rows[0]; await changed(c, req.user.id, 'expense.updated', 'expense', r.id, [r.organization_id], { previous: dto(r), current: dto(u) }); return dto(u); }) })));
    router.delete('/expenses/:id', wrap(async (req, res) => { await transaction(async (c) => { const r = (await c.query('SELECT * FROM farm_expenses WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0]; if (!r)
        throw fail(404, 'Расход не найден'); await org(c, r.organization_id, req.user.id, true); version(r, req.body.version); await changed(c, req.user.id, 'expense.deleted', 'expense', r.id, [r.organization_id], { previous: dto(r) }); await c.query('DELETE FROM farm_expenses WHERE id=$1', [r.id]); }); res.json({ deleted: true }); }));
    router.post('/expenses/import', wrap(async (req, res) => res.status(201).json(await transaction(async (c) => { const b = req.body; await org(c, b.organizationId, req.user.id, true); await feature(c, req.user.id, 'farm.cost_accounting', b.organizationId); await c.query('SELECT id FROM business_organizations WHERE id=$1 FOR UPDATE', [b.organizationId]); const key = clientId(b), existing = (await c.query('SELECT expense_ids FROM farm_imports WHERE organization_id=$1 AND client_id=$2', [b.organizationId, key])).rows[0]; if (existing)
        return { items: (await c.query('SELECT * FROM farm_expenses WHERE id=ANY($1::uuid[])', [existing.expense_ids])).rows.map(dto), importId: key }; if (!Array.isArray(b.rows) || b.rows.length < 1 || b.rows.length > 500)
        throw fail(422, 'Импорт принимает от 1 до 500 строк'); const items = []; const seen = new Set(); for (const row of b.rows) {
        if (seen.has(row.clientId))
            throw fail(422, 'Повторяющиеся строки импорта');
        seen.add(row.clientId);
        items.push(await insert(c, row, req.user.id, b.organizationId));
    } await c.query('INSERT INTO farm_imports VALUES($1,$2,$3)', [b.organizationId, key, items.map(v => v.id)]); return { items, importId: key }; }))));
    async function analytics(c, organizationId, user, year, cur) {
        const organization = await org(c, organizationId, user);
        await feature(c, user, 'farm.profit_analytics', organizationId);
        cur = currency(cur || 'KZT');
        year = year ? Number(year) : null;
        if (year !== null && (!Number.isInteger(year) || year < 1900 || year > 2200))
            throw fail(422, 'Некорректный год');
        const lots = (await c.query('SELECT * FROM crop_lots WHERE organization_id=$1 AND($2::integer IS NULL OR harvest_year=$2)', [organizationId, year])).rows;
        const expenses = (await c.query('SELECT * FROM farm_expenses WHERE organization_id=$1 AND($2::integer IS NULL OR harvest_year=$2) AND currency=$3', [organizationId, year, cur])).rows;
        const deals = (await c.query("SELECT d.*,l.crop,l.field_id FROM trade_deals d JOIN crop_lots l ON l.id=d.lot_id WHERE d.seller_id=$1 AND($2::integer IS NULL OR l.harvest_year=$2) AND d.currency=$3 AND d.status<>'cancelled'", [organizationId, year, cur])).rows;
        const payments = deals.length ? (await c.query("SELECT deal_id,coalesce(sum(amount),0)::numeric(24,2)::text amount FROM deal_payments WHERE deal_id=ANY($1::uuid[]) AND status='confirmed' GROUP BY deal_id", [deals.map(d => d.id)])).rows : [];
        const listings = (await c.query("SELECT l.* FROM trade_listings l JOIN crop_lots lot ON lot.id=l.lot_id WHERE l.organization_id=$1 AND($2::integer IS NULL OR lot.harvest_year=$2) AND l.status IN ('active','offers_received','partially_reserved','partially_sold')", [organizationId, year])).rows;
        const aggregate = (ls, es, ds) => { const actual = es.filter(e => !e.planned).reduce((s, e) => s + scaled(e.amount), 0n), planned = es.filter(e => e.planned).reduce((s, e) => s + scaled(e.amount), 0n), revenue = payments.filter(p => ds.some(d => d.id === p.deal_id)).reduce((s, p) => s + scaled(p.amount), 0n), gross = ds.reduce((s, d) => s + scaled(d.gross), 0n), harvest = ls.reduce((s, l) => s + scaled(l.quantity_ton, 3), 0n), reserved = ls.reduce((s, l) => s + scaled(l.reserved_ton, 3), 0n), shipped = ls.reduce((s, l) => s + scaled(l.shipped_ton, 3), 0n); return { actualExpenses: format(actual), plannedExpenses: format(planned), confirmedRevenue: format(revenue), expectedRevenue: format(gross - revenue), financialResult: format(revenue - actual), actualHarvestTon: format(harvest, 3), availableTon: format(harvest - reserved - shipped, 3), reservedTon: format(reserved, 3), shippedTon: format(shipped, 3), costsPerTon: harvest > 0n ? format(divide(actual * 1000n, harvest)) : null, averageSalePrice: ds.reduce((s, d) => s + scaled(d.quantity_ton, 3), 0n) > 0n ? format(divide(gross * 1000n, ds.reduce((s, d) => s + scaled(d.quantity_ton, 3), 0n))) : null }; };
        const result = aggregate(lots, expenses, deals), byCrop = [];
        for (const crop of new Set([...lots.map(l => l.crop), ...expenses.map(e => e.crop)].filter(Boolean))) {
            byCrop.push({ crop, ...aggregate(lots.filter(l => l.crop === crop), expenses.filter(e => e.crop === crop || e.lot_id && lots.some(l => l.id === e.lot_id && l.crop === crop)), deals.filter(d => d.crop === crop)) });
        }
        const byField = [];
        for (const fieldId of new Set([...lots.map(l => l.field_id), ...expenses.map(e => e.field_id)].filter(Boolean))) {
            let data;
            try {
                data = await field(c, organizationId, user, fieldId);
            }
            catch { }
            const a = aggregate(lots.filter(l => l.field_id === fieldId), expenses.filter(e => e.field_id === fieldId || e.lot_id && lots.some(l => l.id === e.lot_id && l.field_id === fieldId)), deals.filter(d => d.field_id === fieldId));
            const area = data?.areaHa ?? data?.area ?? null;
            byField.push({ fieldId, name: data?.name || fieldId, areaHa: area, ...a, costPerHectare: area && Number(area) > 0 ? format(divide(scaled(a.actualExpenses) * 1000n, scaled(String(Number(area).toFixed(3)), 3))) : null });
        }
        let value = 0n, unpricedLots = 0;
        for (const l of lots) {
            const available = scaled(l.quantity_ton, 3) - scaled(l.reserved_ton, 3) - scaled(l.shipped_ton, 3);
            if (available <= 0n)
                continue;
            const listing = listings.find(x => x.lot_id === l.id && x.currency === cur && x.price_per_ton);
            if (listing)
                value += divide(scaled(listing.price_per_ton) * available, 1000n);
            else
                unpricedLots++;
        }
        const activeOffers = Number((await c.query("SELECT count(*) n FROM trade_offers o JOIN crop_lots l ON l.id=o.lot_id WHERE o.seller_id=$1 AND($2::integer IS NULL OR l.harvest_year=$2) AND o.status IN ('sent','received','reviewing','countered') AND(o.terms->>'expiresAt')::timestamptz>now()", [organizationId, year])).rows[0].n);
        return { ...result, currency: cur, harvestYear: year, availableHarvestValue: unpricedLots ? null : format(value), knownHarvestValue: format(value), unpricedLots, activeListings: listings.length, activeOffers, activeDeals: deals.filter(d => !['completed', 'cancelled'].includes(d.status)).length, byCrop, byField, warnings: ['Результат по подтверждённым поступлениям и введённым расходам — не бухгалтерская чистая прибыль.', ...(unpricedLots ? ['У части доступного урожая нет сохранённой цены.'] : []), ...(expenses.length ? [] : ['Расходы пока не внесены; себестоимость неполная.'])] };
    }
    router.get('/analytics', wrap(async (req, res) => res.json({ analytics: await transaction(c => analytics(c, req.query.organizationId, req.user.id, req.query.harvestYear, req.query.currency)) })));
    router.get('/analytics/export', wrap(async (req, res) => { const value = await transaction(async (c) => { await org(c, req.query.organizationId, req.user.id); const e = await ctx.platform.entitlement(c, req.query.organizationId, 'exports'); if (!e.allowed)
        throw fail(403, 'Экспорт доступен по тарифу'); return analytics(c, req.query.organizationId, req.user.id, req.query.harvestYear, req.query.currency); }); const cell = v => '"' + String(v ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"'; res.type('text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="egin-finances.csv"').send('\uFEFF' + [['Культура', 'Расходы', 'План', 'Подтверждённая выручка', 'Финансовый результат', 'Урожай, т'], ...value.byCrop.map(r => [r.crop, r.actualExpenses, r.plannedExpenses, r.confirmedRevenue, r.financialResult, r.actualHarvestTon])].map(row => row.map(cell).join(';')).join('\r\n')); }));
}
