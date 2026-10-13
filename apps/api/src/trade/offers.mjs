import { randomUUID } from 'node:crypto';
import { terms, text, date, version, clientId, page, fileIds, fail, id } from './validation.mjs';
import { calculate, scaled, format } from './decimal.mjs';
import { activeListings, liveOffers } from './context.mjs';
export function installOffers(router, wrap, ctx) {
    const { transaction, org, feature, offer, offerDto, files, changed, tradeCard, quota } = ctx;
    router.post('/calculate', wrap(async (req, res) => { await feature(ctx.pool, req.user.id, 'trade.profit_comparison', req.body.organizationId); res.json({ calculation: calculate(terms(req.body.terms), req.body.costs || [], req.body.costBasisPerTon) }); }));
    router.post('/offers/compare', wrap(async (req, res) => res.json(await transaction(async (c) => { const b = req.body; await org(c, b.organizationId, req.user.id); await feature(c, req.user.id, 'trade.profit_comparison', b.organizationId); if (!Array.isArray(b.offerIds) || b.offerIds.length < 2 || b.offerIds.length > 10 || b.offerIds.some(x => !id(x)) || new Set(b.offerIds).size < 2)
        throw fail(422, 'Выберите от 2 до 10 предложений'); const items = []; for (const offerId of [...new Set(b.offerIds)]) {
        const r = await offer(c, offerId, req.user.id);
        if (r.seller_id !== b.organizationId && r.buyer_id !== b.organizationId)
            throw fail(403, 'Предложение другой организации');
        const v = await offerDto(c, r, false);
        if (b.quantityTon) {
            const q = scaled(b.quantityTon, 3, { positive: true });
            if (q > scaled(r.terms.quantityTon, 3))
                throw fail(422, 'Объём сравнения превышает предложение');
            v.calculation = calculate({ ...r.terms, quantityTon: format(q, 3) }, r.costs);
            v.comparisonQuantityTon = format(q, 3);
        }
        else
            v.comparisonQuantityTon = r.terms.quantityTon;
        items.push(v);
    } const warnings = []; const first = items[0], keys = ['currency', 'deliveryTerms', 'logisticsPayer', 'loadingPayer', 'paymentTerms', 'prepaymentPercent', 'finalPaymentDueAt']; if (items.some(v => v.calculation.preliminary))
        warnings.push('Есть неподтверждённые или неизвестные расходы'); if (items.some(v => v.comparisonQuantityTon !== first.comparisonQuantityTon))
        warnings.push('Разный объём предложений'); if (items.some(v => keys.some(k => v.terms[k] !== first.terms[k]) || JSON.stringify(v.terms.destination) !== JSON.stringify(first.terms.destination) || JSON.stringify(v.terms.handover) !== JSON.stringify(first.terms.handover) || JSON.stringify(v.terms.qualityRequirements) !== JSON.stringify(first.terms.qualityRequirements)))
        warnings.push('Условия поставки, оплаты или валюта различаются'); if (items.some(v => ['expired', 'withdrawn', 'rejected'].includes(v.status)))
        warnings.push('Часть предложений уже недоступна'); const comparable = !warnings.length; let bestOfferId = null, difference = null; if (comparable) {
        const ranked = [...items].sort((a, b) => { const x = BigInt(a.calculation.net.replace('.', '')), y = BigInt(b.calculation.net.replace('.', '')); return x > y ? -1 : x < y ? 1 : 0; });
        bestOfferId = ranked[0].id;
        difference = format(BigInt(ranked[0].calculation.net.replace('.', '')) - BigInt(ranked[1].calculation.net.replace('.', '')));
    } return { items, comparable, warnings, bestOfferId, difference }; }))));
    router.get('/offers', wrap(async (req, res) => res.json(await transaction(async (c) => { const { limit, before } = page(req); await org(c, req.query.organizationId, req.user.id); const values = [req.query.organizationId, before, limit + 1], filters = ["(buyer_id=$1 OR seller_id=$1 AND status<>'draft')", '($2::uuid IS NULL OR id<$2)']; for (const [key, column] of [['lotId', 'lot_id'], ['listingId', 'listing_id']])
        if (req.query[key]) {
            if (!id(req.query[key]))
                throw fail(422, 'Некорректный идентификатор');
            values.push(req.query[key]);
            filters.push(`${column}=$${values.length}`);
        } const rows = (await c.query(`SELECT * FROM trade_offers WHERE ${filters.join(' AND ')} ORDER BY id DESC LIMIT $3`, values)).rows; return { items: await Promise.all(rows.slice(0, limit).map(r => offerDto(c, r, false))), nextCursor: rows.length > limit ? rows[limit - 1].id : null }; }))));
    router.get('/offers/:id', wrap(async (req, res) => res.json({ offer: await transaction(async (c) => offerDto(c, await offer(c, req.params.id, req.user.id))) })));
    async function saveVersion(c, r, user) { await c.query('INSERT INTO trade_offer_versions(offer_id,version,proposer_id,terms,costs,file_ids,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)', [r.id, r.version, r.last_proposer_id, r.terms, JSON.stringify(r.costs), r.file_ids, user]); }
    async function announce(c, r, user, type) { await changed(c, user, type, 'offer', r.id, r.status === 'draft' ? [r.buyer_id] : [r.seller_id, r.buyer_id], { version: r.version, listingId: r.listing_id }); if (r.status !== 'draft') {
        const conversationId = await tradeCard(c, r, user, 'offer', r.id, 'Предложение по урожаю', `${r.terms.quantityTon} т · ${r.terms.pricePerTon} ${r.terms.currency}/т`);
        if (conversationId) {
            r.conversation_id = typeof conversationId === 'string' ? conversationId : conversationId.conversationId;
            await c.query('UPDATE trade_offers SET conversation_id=$2 WHERE id=$1', [r.id, r.conversation_id]);
        }
    } }
    async function offerLimit(c, organizationId) { await c.query('SELECT id FROM business_organizations WHERE id=$1 FOR UPDATE', [organizationId]); const count = Number((await c.query("SELECT count(*) n FROM trade_offers WHERE buyer_id=$1 AND status<>'draft' AND created_at>=date_trunc('month',now())", [organizationId])).rows[0].n); await quota(c, organizationId, 'offersPerMonth', count); }
    router.post('/offers', wrap(async (req, res) => res.status(201).json({ offer: await transaction(async (c) => { const b = req.body; await org(c, b.organizationId, req.user.id, true); await feature(c, req.user.id, 'trade.buyer_offers', b.organizationId); const key = clientId(b); await c.query('SELECT id FROM business_organizations WHERE id=$1 FOR UPDATE', [b.organizationId]); const old = (await c.query('SELECT * FROM trade_offers WHERE buyer_id=$1 AND client_id=$2', [b.organizationId, key])).rows[0]; if (old)
            return offerDto(c, old); if (!id(b.listingId))
            throw fail(422, 'Выберите публикацию'); if (b.status && !['draft', 'sent'].includes(b.status))
            throw fail(422, 'Недопустимый статус предложения'); const l = (await c.query('SELECT * FROM trade_listings WHERE id=$1 FOR UPDATE', [b.listingId])).rows[0]; if (!l || !activeListings.includes(l.status))
            throw fail(404, 'Публикация недоступна'); const demo=await ctx.platform.assertSameWorld(c,b.organizationId,l.organization_id,req.user.id); if (l.organization_id === b.organizationId)
            throw fail(422, 'Нельзя купить собственную партию'); if (!demo && (await c.query('SELECT 1 FROM business_members WHERE organization_id=$1 AND user_id=$2', [l.organization_id, req.user.id])).rowCount)
            throw fail(403, 'Сотрудник продавца не может выступать покупателем этой партии'); const t = terms(b.terms), costs = b.costs || [], ids = fileIds(b.fileIds); calculate(t, costs); if (new Date(t.expiresAt) <= new Date())
            throw fail(422, 'Срок предложения уже истёк'); if (scaled(t.quantityTon, 3) > scaled(l.quantity_ton, 3))
            throw fail(422, 'Предложение превышает опубликованный объём'); const status = b.status === 'draft' ? 'draft' : 'sent'; if (status === 'sent')
            await offerLimit(c, b.organizationId); await files(c, ids, b.organizationId); const r = (await c.query('INSERT INTO trade_offers(id,listing_id,lot_id,buyer_id,seller_id,created_by,client_id,status,last_proposer_id,terms,costs,file_ids) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$4,$9,$10,$11) RETURNING *', [randomUUID(), l.id, l.lot_id, b.organizationId, l.organization_id, req.user.id, key, status, t, JSON.stringify(costs), ids])).rows[0]; await saveVersion(c, r, req.user.id); if (status === 'sent')
            await c.query("UPDATE trade_listings SET status=CASE WHEN status='active' THEN 'offers_received' ELSE status END,version=version+1 WHERE id=$1", [l.id]); await announce(c, r, req.user.id, 'offer.created'); return offerDto(c, r); }) })));
    router.post('/offers/:id/revisions', wrap(async (req, res) => res.json({ offer: await transaction(async (c) => { const r = await offer(c, req.params.id, req.user.id, true, true); version(r, req.body.version); if (['converted', 'accepted', 'rejected', 'withdrawn'].includes(r.status))
            throw fail(409, 'Это предложение больше нельзя изменять'); await feature(c, req.user.id, 'trade.buyer_offers', r.side); const t = terms(req.body.terms), costs = req.body.costs || [], ids = fileIds(req.body.fileIds); calculate(t, costs); if (new Date(t.expiresAt) <= new Date())
            throw fail(422, 'Укажите новый срок действия'); await files(c, ids.filter(fileId => !r.file_ids.includes(fileId)), r.side); const l = (await c.query('SELECT * FROM trade_listings WHERE id=$1', [r.listing_id])).rows[0]; if (!activeListings.includes(l.status) || scaled(t.quantityTon, 3) > scaled(l.quantity_ton, 3))
            throw fail(409, 'Публикация недоступна для этих условий'); const updated = (await c.query('UPDATE trade_offers SET terms=$2,costs=$3,file_ids=$4,last_proposer_id=$5,status=$6,version=version+1,updated_at=now() WHERE id=$1 RETURNING *', [r.id, t, JSON.stringify(costs), ids, r.side, r.status === 'draft' ? 'draft' : r.side === r.seller_id ? 'countered' : 'sent'])).rows[0]; await saveVersion(c, updated, req.user.id); await announce(c, updated, req.user.id, 'offer.revised'); return offerDto(c, updated); }) })));
    router.post('/offers/:id/actions', wrap(async (req, res) => res.json(await transaction(async (c) => { let r = await offer(c, req.params.id, req.user.id, true, true); const action = req.body.action; if (action === 'accept' && r.deal_id)
        return { offer: await offerDto(c, r), deal: await ctx.dealDto(c, await ctx.deal(c, r.deal_id, req.user.id)) }; version(r, req.body.version); let status; if (action === 'send') {
        if (r.status !== 'draft' || r.side !== r.buyer_id)
            throw fail(409, 'Черновик может отправить покупатель');
        await feature(c, req.user.id, 'trade.buyer_offers', r.side);
        await offerLimit(c, r.buyer_id);
        status = 'sent';
    }
    else if (action === 'receive' || action === 'review') {
        if (r.side === r.last_proposer_id || !liveOffers.includes(r.status))
            throw fail(409, 'Нет нового предложения другой стороны');
        status = action === 'receive' ? 'received' : 'reviewing';
    }
    else if (action === 'reject') {
        if (r.side === r.last_proposer_id || !liveOffers.includes(r.status))
            throw fail(409, 'Нельзя отклонить собственное предложение');
        status = 'rejected';
    }
    else if (action === 'withdraw') {
        if (r.side !== r.last_proposer_id || !['draft', ...liveOffers].includes(r.status))
            throw fail(409, 'Предложение нельзя отозвать');
        status = 'withdrawn';
    }
    else if (action === 'accept') {
        if (!liveOffers.includes(r.status) || r.side === r.last_proposer_id)
            throw fail(409, 'Принять может только другая сторона');
        await feature(c, req.user.id, 'trade.deal_management', r.side);
        if (new Date(r.terms.expiresAt) <= new Date())
            throw fail(409, 'Срок предложения истёк. Запросите новую версию.');
        const l = (await c.query('SELECT * FROM trade_listings WHERE id=$1 FOR UPDATE', [r.listing_id])).rows[0];
        if (!activeListings.includes(l.status))
            throw fail(409, 'Публикация уже снята');
        const stock = (await c.query('SELECT * FROM crop_lots WHERE id=$1 FOR UPDATE', [r.lot_id])).rows[0];
        const quantity = scaled(r.terms.quantityTon, 3), available = scaled(stock.quantity_ton, 3) - scaled(stock.reserved_ton, 3) - scaled(stock.shipped_ton, 3);
        if (quantity > available)
            throw fail(409, 'Недостаточно свободного остатка для резервирования');
        const used = (await c.query("SELECT coalesce(sum(quantity_ton),0)::numeric(20,3)::text n FROM trade_deals WHERE listing_id=$1 AND status<>'cancelled'", [l.id])).rows[0].n;
        if (quantity + scaled(used, 3) > scaled(l.quantity_ton, 3))
            throw fail(409, 'Опубликованный объём уже зарезервирован');
        const calculation = calculate(r.terms, r.costs);
        const d = (await c.query('INSERT INTO trade_deals(id,offer_id,offer_version,lot_id,listing_id,seller_id,buyer_id,terms,costs,quantity_ton,price_per_ton,currency,gross) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *', [randomUUID(), r.id, r.version, r.lot_id, l.id, r.seller_id, r.buyer_id, r.terms, JSON.stringify(r.costs), r.terms.quantityTon, r.terms.pricePerTon, r.terms.currency, calculation.gross])).rows[0];
        d.lot_snapshot = { name: stock.name, crop: stock.crop, productType: stock.product_type, grade: stock.grade, harvestYear: stock.harvest_year, quality: stock.quality, storage: stock.storage };
        await c.query('UPDATE trade_deals SET lot_snapshot=$2 WHERE id=$1', [d.id, d.lot_snapshot]);
        await c.query('UPDATE crop_lots SET reserved_ton=reserved_ton+$2::numeric,version=version+1 WHERE id=$1', [r.lot_id, r.terms.quantityTon]);
        await c.query("UPDATE trade_listings SET status='partially_reserved',version=version+1 WHERE id=$1", [l.id]);
        r = (await c.query("UPDATE trade_offers SET status='converted',deal_id=$2,version=version+1,updated_at=now() WHERE id=$1 RETURNING *", [r.id, d.id])).rows[0];
        await ctx.event(c, d, req.user.id, 'deal.created', { offerId: r.id, offerVersion: d.offer_version });
        await announce(c, r, req.user.id, 'offer.accepted');
        await tradeCard(c, r, req.user.id, 'deal', d.id, 'Сделка создана', `${d.quantity_ton} т · ${d.gross} ${d.currency}`);
        return { offer: await offerDto(c, r), deal: await ctx.dealDto(c, { ...d, side: r.side }) };
    }
    else
        throw fail(422, 'Неизвестное действие'); if (['send', 'receive', 'review'].includes(action) && new Date(r.terms.expiresAt) <= new Date())
        throw fail(409, 'Срок предложения истёк'); r = (await c.query('UPDATE trade_offers SET status=$2,version=version+1,updated_at=now() WHERE id=$1 RETURNING *', [r.id, status])).rows[0]; await saveVersion(c, r, req.user.id); await announce(c, r, req.user.id, 'offer.' + action); return { offer: await offerDto(c, r) }; }))));
}
