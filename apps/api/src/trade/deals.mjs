import { randomUUID } from 'node:crypto';
import { text, date, decimal, version, clientId, page, fileIds, iso, fail, id } from './validation.mjs';
import { scaled, format } from './decimal.mjs';
export function installDeals(router, wrap, ctx) {
    const { transaction, org, deal, event, files, tradeCard } = ctx;
    const shipmentDto = r => ({ id: r.id, dealId: r.deal_id, quantityTon: r.quantity_ton, acceptedTon: r.accepted_ton, plannedAt: iso(r.planned_at), shippedAt: iso(r.shipped_at), deliveredAt: iso(r.delivered_at), carrier: r.carrier, notes: r.notes, documentIds: r.document_ids, quality: r.quality, status: r.status, discrepancy: r.discrepancy, resolveSeller: r.resolve_seller, resolveBuyer: r.resolve_buyer, version: r.version });
    const paymentDto = r => ({ id: r.id, dealId: r.deal_id, amount: r.amount, currency: r.currency, paidAt: iso(r.paid_at), reference: r.reference, documentIds: r.document_ids, status: r.status, reportedBy: r.reported_by, confirmedBy: r.confirmed_by, confirmedAt: iso(r.confirmed_at), version: r.version });
    const documentDto = r => ({ id: r.id, dealId: r.deal_id, fileId: r.file_id, kind: r.kind, title: r.title, replacesId: r.replaces_id, organizationId: r.organization_id, status: r.confirmed_at ? 'confirmed_copy' : 'awaiting_counterparty', uploadedBy: r.uploaded_by, confirmedBy: r.confirmed_by, confirmedAt: iso(r.confirmed_at), version: r.version, createdAt: iso(r.created_at), url: `/api/trade/files/${r.file_id}/file` });
    async function totals(c, r) { const shipments = (await c.query("SELECT coalesce(sum(quantity_ton),0)::numeric(20,3)::text shipped,coalesce(sum(accepted_ton),0)::numeric(20,3)::text accepted,count(*) FILTER(WHERE status='discrepancy')::int discrepancies,count(*) FILTER(WHERE accepted_ton IS NULL)::int pending FROM deal_shipments WHERE deal_id=$1", [r.id])).rows[0]; const payments = (await c.query("SELECT coalesce(sum(amount) FILTER(WHERE status='confirmed'),0)::numeric(24,2)::text confirmed,coalesce(sum(amount) FILTER(WHERE status<>'rejected'),0)::numeric(24,2)::text reported FROM deal_payments WHERE deal_id=$1", [r.id])).rows[0]; return { ...shipments, ...payments }; }
    async function refresh(c, r) { if (['cancelled', 'completed', 'dispute'].includes(r.status))
        return r; const t = await totals(c, r); let status = r.status; if (t.discrepancies)
        status = 'discrepancy';
    else if (scaled(t.shipped, 3) > 0n) {
        if (scaled(t.shipped, 3) < scaled(r.quantity_ton, 3))
            status = 'partially_shipped';
        else if (t.pending)
            status = 'at_acceptance';
        else
            status = scaled(t.confirmed) >= scaled(r.gross) ? 'paid' : scaled(t.confirmed) > 0n ? 'partially_paid' : 'awaiting_payment';
    }
    else if (scaled(t.confirmed) > 0n)
        status = r.status; return (await c.query('UPDATE trade_deals SET status=$2,version=version+1,updated_at=now() WHERE id=$1 RETURNING *', [r.id, status])).rows[0]; }
    ctx.dealDto = async (c, r) => { const t = await totals(c, r); return { id: r.id, isDemo:!!(await ctx.publicOrg(c,r.seller_id))?.isDemo, offerId: r.offer_id, offerVersion: r.offer_version, lotId: r.lot_id, lotSnapshot: r.lot_snapshot, listingId: r.listing_id, sellerOrganizationId: r.seller_id, buyerOrganizationId: r.buyer_id, yourOrganizationId: r.side, seller: await ctx.publicOrg(c, r.seller_id), buyer: await ctx.publicOrg(c, r.buyer_id), terms: r.terms, costs: r.costs, quantityTon: r.quantity_ton, pricePerTon: r.price_per_ton, currency: r.currency, status: r.status, version: r.version, confirmations: { sellerTerms: r.seller_terms, buyerTerms: r.buyer_terms, sellerContract: r.seller_contract, buyerContract: r.buyer_contract, sellerComplete: r.seller_complete, buyerComplete: r.buyer_complete, cancelRequestedBy: r.cancel_requested_by, disputeResolvedBy: r.dispute_resolved_by }, financial: { gross: r.gross, confirmedPaid: t.confirmed, paymentReported: t.reported, outstanding: format(scaled(r.gross) - scaled(t.confirmed)), overdue: !!r.terms.finalPaymentDueAt && new Date(r.terms.finalPaymentDueAt) < new Date() && scaled(t.confirmed) < scaled(r.gross) }, shippedTon: t.shipped, acceptedTon: t.accepted, shipments: (await c.query('SELECT * FROM deal_shipments WHERE deal_id=$1 ORDER BY created_at,id', [r.id])).rows.map(shipmentDto), payments: (await c.query('SELECT * FROM deal_payments WHERE deal_id=$1 ORDER BY paid_at,id', [r.id])).rows.map(paymentDto), documents: (await c.query('SELECT * FROM deal_documents WHERE deal_id=$1 ORDER BY created_at,id', [r.id])).rows.map(documentDto), events: (await c.query('SELECT * FROM trade_deal_events WHERE deal_id=$1 ORDER BY id DESC LIMIT 200', [r.id])).rows.map(e => ({ id: String(e.id), actorId: e.actor_id, type: e.event, payload: e.payload, createdAt: iso(e.created_at) })), createdAt: iso(r.created_at) }; };
    const open = r => { if (['cancelled', 'completed'].includes(r.status))
        throw fail(409, 'Сделка уже закрыта'); };
    router.get('/deals', wrap(async (req, res) => res.json(await transaction(async (c) => { await org(c, req.query.organizationId, req.user.id); const { limit, before } = page(req); const rows = (await c.query('SELECT * FROM trade_deals WHERE (seller_id=$1 OR buyer_id=$1) AND($2::uuid IS NULL OR id<$2) ORDER BY id DESC LIMIT $3', [req.query.organizationId, before, limit + 1])).rows; return { items: await Promise.all(rows.slice(0, limit).map(r => ctx.dealDto(c, { ...r, side: req.query.organizationId }))), nextCursor: rows.length > limit ? rows[limit - 1].id : null }; }))));
    router.get('/deals/:id', wrap(async (req, res) => res.json({ deal: await transaction(async (c) => ctx.dealDto(c, await deal(c, req.params.id, req.user.id))) })));
    router.post('/deals/:id/actions', wrap(async (req, res) => res.json({ deal: await transaction(async (c) => { let r = await deal(c, req.params.id, req.user.id, true, true); version(r, req.body.version); open(r); const seller = r.side === r.seller_id, side = seller ? 'seller' : 'buyer', action = req.body.action, note = text(req.body.note, 2000); let status = r.status; const updates = {}; if (action === 'agree_terms') {
            if (!['created', 'negotiating', 'terms_agreed'].includes(status))
                throw fail(409, 'Согласование условий уже завершено');
            updates[side + '_terms'] = true;
            status = (seller ? r.buyer_terms : r.seller_terms) ? 'terms_agreed' : 'negotiating';
        }
        else if (action === 'request_documents') {
            if (status !== 'terms_agreed')
                throw fail(409, 'Сначала согласуйте условия');
            status = 'awaiting_documents';
        }
        else if (action === 'confirm_contract') {
            if (!['terms_agreed', 'awaiting_documents', 'contract_pending', 'contract_confirmed'].includes(status))
                throw fail(409, 'Сейчас нельзя подтвердить договор');
            const doc = (await c.query("SELECT 1 FROM deal_documents d WHERE deal_id=$1 AND kind='contract' AND confirmed_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM deal_documents newer WHERE newer.replaces_id=d.id)", [r.id])).rowCount;
            if (!doc)
                throw fail(409, 'Загрузите договор и дождитесь подтверждения копии другой стороной');
            updates[side + '_contract'] = true;
            status = (seller ? r.buyer_contract : r.seller_contract) ? 'contract_confirmed' : 'contract_pending';
        }
        else if (action === 'ready_to_ship') {
            if (!r.seller_contract || !r.buyer_contract)
                throw fail(409, 'Обе стороны должны подтвердить договор');
            if (status !== 'contract_confirmed')
                throw fail(409, 'Нельзя изменить этап отгрузки');
            status = 'awaiting_shipment';
        }
        else if (action === 'cancel') {
            const t = await totals(c, r);
            if (scaled(t.shipped, 3) > 0n || scaled(t.reported) > 0n)
                throw fail(409, 'После отгрузки или заявления оплаты требуется урегулирование спора');
            if (!r.cancel_requested_by) {
                updates.cancel_requested_by = r.side;
            }
            else if (r.cancel_requested_by === r.side)
                throw fail(409, 'Ожидается подтверждение отмены другой стороной');
            else {
                status = 'cancelled';
                await c.query('SELECT id FROM trade_listings WHERE id=$1 FOR UPDATE', [r.listing_id]);
                await c.query('SELECT id FROM crop_lots WHERE id=$1 FOR UPDATE', [r.lot_id]);
                await c.query('UPDATE crop_lots SET reserved_ton=reserved_ton-$2::numeric,version=version+1 WHERE id=$1', [r.lot_id, r.quantity_ton]);
                await c.query("UPDATE trade_listings SET status=CASE WHEN status='partially_reserved' THEN 'offers_received' ELSE status END,version=version+1 WHERE id=$1", [r.listing_id]);
            }
        }
        else if (action === 'dispute') {
            if (!note)
                throw fail(422, 'Опишите причину спора');
            status = 'dispute';
            updates.dispute_resolved_by = null;
        }
        else if (action === 'resolve_dispute') {
            if (status !== 'dispute' || !note)
                throw fail(409, 'Укажите решение существующего спора');
            if (!r.dispute_resolved_by)
                updates.dispute_resolved_by = r.side;
            else if (r.dispute_resolved_by !== r.side) {
                status = 'awaiting_shipment';
                updates.dispute_resolved_by = null;
            }
            else
                throw fail(409, 'Ожидается другая сторона');
        }
        else if (action === 'complete') {
            const t = await totals(c, r);
            if (scaled(t.shipped, 3) !== scaled(r.quantity_ton, 3) || t.pending || t.discrepancies || scaled(t.confirmed) !== scaled(r.gross) || status === 'dispute')
                throw fail(409, 'Завершите отгрузки, приёмку, урегулирование и оплату');
            updates[side + '_complete'] = true;
            status = (seller ? r.buyer_complete : r.seller_complete) ? 'completed' : r.status;
        }
        else
            throw fail(422, 'Неизвестное действие'); const cols = ['status=$2'], values = [r.id, status]; for (const [k, v] of Object.entries(updates)) {
            values.push(v);
            cols.push(`${k}=$${values.length}`);
        } r = (await c.query(`UPDATE trade_deals SET ${cols.join(',')},version=version+1,updated_at=now() WHERE id=$1 RETURNING *`, values)).rows[0]; if (action === 'resolve_dispute' && status !== 'dispute')
            r = await refresh(c, r); await event(c, r, req.user.id, 'deal.' + action, { note, status }); return ctx.dealDto(c, { ...r, side: seller ? r.seller_id : r.buyer_id }); }) })));
    router.post('/deals/:id/shipments', wrap(async (req, res) => res.status(201).json({ deal: await transaction(async (c) => { let r = await deal(c, req.params.id, req.user.id, true, true); open(r); if (r.side !== r.seller_id)
            throw fail(403, 'Отгрузку оформляет продавец'); const key = clientId(req.body), old = (await c.query('SELECT id FROM deal_shipments WHERE deal_id=$1 AND client_id=$2', [r.id, key])).rows[0]; if (old)
            return ctx.dealDto(c, r); if (!['awaiting_shipment', 'partially_shipped'].includes(r.status) || !r.seller_contract || !r.buyer_contract)
            throw fail(409, 'Сначала подтвердите договор и готовность к отгрузке'); const quantity = decimal(req.body.quantityTon, 3, { positive: true }), t = await totals(c, r); if (scaled(quantity, 3) + scaled(t.shipped, 3) > scaled(r.quantity_ton, 3))
            throw fail(409, 'Отгрузка превышает согласованный объём'); const ids = fileIds(req.body.documentIds); await files(c, ids, r.side, r.id); await c.query('SELECT id FROM trade_listings WHERE id=$1 FOR UPDATE', [r.listing_id]); await c.query('SELECT id FROM crop_lots WHERE id=$1 FOR UPDATE', [r.lot_id]); await c.query('UPDATE crop_lots SET reserved_ton=reserved_ton-$2::numeric,shipped_ton=shipped_ton+$2::numeric,version=version+1 WHERE id=$1', [r.lot_id, quantity]); const shipmentId = randomUUID(); await c.query('INSERT INTO deal_shipments(id,deal_id,client_id,quantity_ton,planned_at,shipped_at,carrier,notes,document_ids) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [shipmentId, r.id, key, quantity, date(req.body.plannedAt), date(req.body.shippedAt) || new Date().toISOString(), text(req.body.carrier, 250), text(req.body.notes, 2000), ids]); r = await refresh(c, r); await c.query("UPDATE trade_listings SET status=CASE WHEN status IN ('active','offers_received','partially_reserved','partially_sold') THEN CASE WHEN (SELECT shipped_ton=quantity_ton FROM crop_lots WHERE id=lot_id) THEN 'sold' ELSE 'partially_sold' END ELSE status END,version=version+1 WHERE id=$1", [r.listing_id]); await event(c, r, req.user.id, 'shipment.created', { shipmentId, quantityTon: quantity }); return ctx.dealDto(c, { ...r, side: r.seller_id }); }) })));
    router.post('/deals/:id/shipments/:shipmentId/accept', wrap(async (req, res) => res.json({ deal: await transaction(async (c) => { let r = await deal(c, req.params.id, req.user.id, true, true); open(r); if (r.side !== r.buyer_id)
            throw fail(403, 'Приёмку подтверждает покупатель'); const s = (await c.query('SELECT * FROM deal_shipments WHERE id=$1 AND deal_id=$2 FOR UPDATE', [req.params.shipmentId, r.id])).rows[0]; if (!s)
            throw fail(404, 'Отгрузка не найдена'); version(s, req.body.version); if (s.accepted_ton !== null)
            throw fail(409, 'Приёмка уже зарегистрирована'); const accepted = decimal(req.body.acceptedTon, 3), discrepancy = text(req.body.discrepancy, 2000); if (scaled(accepted, 3) > scaled(s.quantity_ton, 3))
            throw fail(422, 'Принято больше отправленного'); if (accepted !== s.quantity_ton && !discrepancy)
            throw fail(422, 'Опишите расхождение по количеству'); const q = req.body.quality || {}; if (typeof q !== 'object' || JSON.stringify(q).length > 5000)
            throw fail(422, 'Некорректные показатели приёмки'); await c.query('UPDATE deal_shipments SET accepted_ton=$2,quality=$3,discrepancy=$4,status=$5,delivered_at=$6,version=version+1 WHERE id=$1', [s.id, accepted, q, discrepancy || null, discrepancy ? 'discrepancy' : 'accepted', date(req.body.deliveredAt) || new Date().toISOString()]); r = await refresh(c, r); await event(c, r, req.user.id, 'shipment.accepted', { shipmentId: s.id, acceptedTon: accepted, discrepancy }); return ctx.dealDto(c, { ...r, side: r.buyer_id }); }) })));
    router.post('/deals/:id/shipments/:shipmentId/resolve', wrap(async (req, res) => res.json({ deal: await transaction(async (c) => { let r = await deal(c, req.params.id, req.user.id, true, true); open(r); const side = r.side, s = (await c.query('SELECT * FROM deal_shipments WHERE id=$1 AND deal_id=$2 FOR UPDATE', [req.params.shipmentId, r.id])).rows[0]; if (!s)
            throw fail(404, 'Отгрузка не найдена'); version(s, req.body.version); if (s.status !== 'discrepancy')
            throw fail(409, 'Нет открытого расхождения'); const note = text(req.body.note, 2000, true), seller = side === r.seller_id; await c.query(`UPDATE deal_shipments SET ${seller ? 'resolve_seller' : 'resolve_buyer'}=true,status=$2,version=version+1 WHERE id=$1`, [s.id, (seller ? s.resolve_buyer : s.resolve_seller) ? 'accepted' : 'discrepancy']); r = await refresh(c, r); await event(c, r, req.user.id, 'shipment.discrepancy_resolved', { shipmentId: s.id, note, byOrganizationId: side }); return ctx.dealDto(c, { ...r, side }); }) })));
    router.post('/deals/:id/payments', wrap(async (req, res) => res.status(201).json({ deal: await transaction(async (c) => { const r = await deal(c, req.params.id, req.user.id, true, true); open(r); if (r.side !== r.buyer_id)
            throw fail(403, 'Оплату заявляет покупатель'); const b = req.body, key = clientId(b); if ((await c.query('SELECT 1 FROM deal_payments WHERE deal_id=$1 AND client_id=$2', [r.id, key])).rowCount)
            return ctx.dealDto(c, r); const amount = decimal(b.amount, 2, { positive: true }); if (b.currency !== r.currency)
            throw fail(422, 'Валюта должна совпадать со сделкой'); const t = await totals(c, r); if (scaled(amount) + scaled(t.reported) > scaled(r.gross))
            throw fail(409, 'Сумма превышает неоплаченный остаток сделки'); const ids = fileIds(b.documentIds); await files(c, ids, r.side, r.id); const paymentId = randomUUID(); await c.query('INSERT INTO deal_payments(id,deal_id,client_id,amount,currency,paid_at,reference,document_ids,reported_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [paymentId, r.id, key, amount, r.currency, date(b.paidAt, true), text(b.reference, 250, true), ids, req.user.id]); await c.query('UPDATE trade_deals SET version=version+1 WHERE id=$1', [r.id]); await event(c, r, req.user.id, 'payment.reported', { paymentId, amount }); return ctx.dealDto(c, await deal(c, r.id, req.user.id)); }) })));
    router.post('/deals/:id/payments/:paymentId/confirm', wrap(async (req, res) => res.json({ deal: await transaction(async (c) => { let r = await deal(c, req.params.id, req.user.id, true, true); open(r); if (r.side !== r.seller_id)
            throw fail(403, 'Поступление денег подтверждает продавец'); const p = (await c.query('SELECT * FROM deal_payments WHERE id=$1 AND deal_id=$2 FOR UPDATE', [req.params.paymentId, r.id])).rows[0]; if (!p)
            throw fail(404, 'Платёж не найден'); if (p.status === 'confirmed')
            return ctx.dealDto(c, r); if (p.status !== 'reported')
            throw fail(409, 'Заявление об оплате отклонено'); version(p, req.body.version); await c.query("UPDATE deal_payments SET status='confirmed',confirmed_by=$2,confirmed_at=now(),version=version+1 WHERE id=$1", [p.id, req.user.id]); r = await refresh(c, r); await event(c, r, req.user.id, 'payment.confirmed', { paymentId: p.id, amount: p.amount }); return ctx.dealDto(c, { ...r, side: r.seller_id }); }) })));
    router.post('/deals/:id/payments/:paymentId/reject', wrap(async (req, res) => res.json({ deal: await transaction(async (c) => { const r = await deal(c, req.params.id, req.user.id, true, true); open(r); if (r.side !== r.seller_id)
            throw fail(403, 'Заявление об оплате проверяет продавец'); const p = (await c.query('SELECT * FROM deal_payments WHERE id=$1 AND deal_id=$2 FOR UPDATE', [req.params.paymentId, r.id])).rows[0]; if (!p)
            throw fail(404, 'Платёж не найден'); version(p, req.body.version); if (p.status !== 'reported')
            throw fail(409, 'Платёж уже обработан'); const note = text(req.body.note, 2000, true); await c.query("UPDATE deal_payments SET status='rejected',version=version+1 WHERE id=$1", [p.id]); await c.query('UPDATE trade_deals SET version=version+1 WHERE id=$1', [r.id]); await event(c, r, req.user.id, 'payment.rejected', { paymentId: p.id, note }); return ctx.dealDto(c, await deal(c, r.id, req.user.id)); }) })));
    router.post('/deals/:id/documents', wrap(async (req, res) => res.status(201).json({ deal: await transaction(async (c) => { const r = await deal(c, req.params.id, req.user.id, true, true); open(r); const b = req.body, key = clientId(b); if ((await c.query('SELECT 1 FROM deal_documents WHERE deal_id=$1 AND client_id=$2', [r.id, key])).rowCount)
            return ctx.dealDto(c, r); if (!['contract', 'specification', 'quality', 'shipping', 'invoice', 'payment', 'act', 'other'].includes(b.kind))
            throw fail(422, 'Выберите тип документа'); if (!id(b.fileId))
            throw fail(422, 'Загрузите файл'); await files(c, [b.fileId], r.side, r.id); const file = (await c.query('SELECT * FROM trade_files WHERE id=$1 FOR UPDATE', [b.fileId])).rows[0]; if (file.organization_id !== r.side)
            throw fail(403, 'Можно прикрепить только собственную загрузку'); if (file.deal_id && file.deal_id !== r.id)
            throw fail(422, 'Документ другой сделки'); if (b.replacesId) {
            const previous = (await c.query('SELECT * FROM deal_documents WHERE id=$1 AND deal_id=$2', [b.replacesId, r.id])).rows[0];
            if (!previous || previous.organization_id !== r.side || previous.kind !== b.kind)
                throw fail(422, 'Нельзя заменить этот документ');
            if ((await c.query('SELECT 1 FROM deal_documents WHERE replaces_id=$1', [previous.id])).rowCount)
                throw fail(409, 'У документа уже есть новая версия');
        } if (b.kind === 'contract' && (r.seller_contract || r.buyer_contract))
            throw fail(409, 'Подтверждённый договор нельзя подменить. Согласуйте изменение через спор.'); await c.query('UPDATE trade_files SET deal_id=$2 WHERE id=$1', [b.fileId, r.id]); const documentId = randomUUID(); await c.query('INSERT INTO deal_documents(id,deal_id,client_id,file_id,kind,title,replaces_id,uploaded_by,organization_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [documentId, r.id, key, b.fileId, b.kind, text(b.title, 200, true), b.replacesId || null, req.user.id, r.side]); await c.query('UPDATE trade_deals SET version=version+1 WHERE id=$1', [r.id]); await event(c, r, req.user.id, 'document.uploaded', { documentId, kind: b.kind }); await tradeCard(c, r, req.user.id, 'document', r.id, 'Документ сделки', text(b.title, 200)); return ctx.dealDto(c, await deal(c, r.id, req.user.id)); }) })));
    router.post('/deals/:id/documents/:documentId/confirm', wrap(async (req, res) => res.json({ deal: await transaction(async (c) => { const r = await deal(c, req.params.id, req.user.id, true, true); open(r); const d = (await c.query('SELECT * FROM deal_documents WHERE id=$1 AND deal_id=$2 FOR UPDATE', [req.params.documentId, r.id])).rows[0]; if (!d)
            throw fail(404, 'Документ не найден'); if (d.organization_id === r.side)
            throw fail(403, 'Копию документа подтверждает другая сторона'); if (d.confirmed_at)
            return ctx.dealDto(c, r); version(d, req.body.version); if ((await c.query('SELECT 1 FROM deal_documents WHERE replaces_id=$1', [d.id])).rowCount)
            throw fail(409, 'Документ заменён новой версией'); await c.query('UPDATE deal_documents SET confirmed_by=$2,confirmed_at=now(),version=version+1 WHERE id=$1', [d.id, req.user.id]); await c.query('UPDATE trade_deals SET version=version+1 WHERE id=$1', [r.id]); await event(c, r, req.user.id, 'document.confirmed', { documentId: d.id, method: 'uploaded_copy_acknowledged', electronicSignature: false }); return ctx.dealDto(c, await deal(c, r.id, req.user.id)); }) })));
}
