import express from 'express';
import { randomUUID } from 'node:crypto';
import { createAttachmentStore } from '../chat/attachments.mjs';
import { fail, id } from './validation.mjs';
import { activeListings } from './context.mjs';
export function installFiles(router, wrap, ctx, dataDir) {
    const store = createAttachmentStore(dataDir + '/trade'), { transaction, org, deal, fileDto } = ctx;
    router.post('/files', express.raw({ type: () => true, limit: '15mb' }), wrap(async (req, res) => { const organizationId = req.query.organizationId, dealId = req.query.dealId || null, kind = req.query.kind; if (!['image', 'document'].includes(kind))
        throw fail(422, 'Поддерживаются фотографии и документы'); if (!Buffer.isBuffer(req.body) || req.body.length < 8)
        throw fail(422, 'Загрузите файл'); await transaction(async (c) => { await org(c, organizationId, req.user.id, true); if (dealId) {
        const d = await deal(c, dealId, req.user.id, true);
        if (![d.buyer_id, d.seller_id].includes(organizationId))
            throw fail(403, 'Другая организация');
    } }); const saved = await store.save(req.body, { kind, name: req.query.name }); try {
        const file = await transaction(async (c) => { await org(c, organizationId, req.user.id, true); if (dealId)
            await deal(c, dealId, req.user.id, true); await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`trade-upload:${organizationId}`]); const n = Number((await c.query("SELECT count(*) n FROM trade_files WHERE organization_id=$1 AND created_at>now()-interval '1 day'", [organizationId])).rows[0].n); if (n >= 200)
            throw fail(429, 'Достигнут дневной лимит загрузок'); const r = (await c.query('INSERT INTO trade_files(id,organization_id,deal_id,uploaded_by,kind,name,mime_type,file_size,path) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *', [randomUUID(), organizationId, dealId, req.user.id, kind, saved.name, saved.mimeType, saved.size, saved.storageKey])).rows[0]; return fileDto(r); });
        res.status(201).json({ file });
    }
    catch (e) {
        await store.remove(saved.storageKey);
        throw e;
    } }));
    router.get('/files/:id/file', wrap(async (req, res) => { const f = await transaction(async (c) => { const r = (await c.query('SELECT * FROM trade_files WHERE id=$1', [req.params.id])).rows[0]; if (!r)
        throw fail(404, 'Файл не найден'); await ctx.visible(c,r.organization_id,req.user.id); if (r.deal_id)
        await deal(c, r.deal_id, req.user.id);
    else {
        try {
            await org(c, r.organization_id, req.user.id);
        }
        catch {
            const visible = (await c.query("SELECT 1 FROM trade_offers o JOIN business_members m ON m.organization_id IN(o.buyer_id,o.seller_id) AND m.user_id=$2 WHERE $1::uuid=ANY(o.file_ids) AND o.status<>'draft' UNION ALL SELECT 1 FROM trade_offer_versions v JOIN trade_offers o ON o.id=v.offer_id JOIN business_members m ON m.organization_id IN(o.buyer_id,o.seller_id) AND m.user_id=$2 WHERE $1::uuid=ANY(v.file_ids) AND o.status<>'draft' LIMIT 1", [r.id, req.user.id])).rowCount;
            if (!visible)
                throw fail(404, 'Файл не найден');
        }
    } return r; }); res.set({ 'Content-Type': f.mime_type, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Content-Disposition': `${f.kind === 'image' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}` }); res.sendFile(store.path(f.path)); }));
    router.get('/listings/:id/images/:fileId', wrap(async (req, res) => { const r = (await ctx.pool.query('SELECT f.* FROM trade_listings l JOIN crop_lots lot ON lot.id=l.lot_id JOIN trade_files f ON f.id=ANY(lot.file_ids) AND f.organization_id=l.organization_id WHERE l.id=$1 AND f.id=$2 AND f.kind=$3 AND l.status=ANY($4::text[])', [req.params.id, req.params.fileId, 'image', activeListings])).rows[0]; if (!r)
        throw fail(404, 'Фото недоступно'); await ctx.visible(ctx.pool,r.organization_id,req.user.id); res.type(r.mime_type).set('X-Content-Type-Options', 'nosniff').sendFile(store.path(r.path)); }));
    ctx.cleanupFiles = async () => { const rows = await transaction(async (c) => (await c.query(`DELETE FROM trade_files f WHERE created_at<now()-interval '24 hours' AND NOT EXISTS(SELECT 1 FROM crop_lots l WHERE f.id=ANY(l.file_ids)) AND NOT EXISTS(SELECT 1 FROM trade_offers o WHERE f.id=ANY(o.file_ids)) AND NOT EXISTS(SELECT 1 FROM trade_offer_versions v WHERE f.id=ANY(v.file_ids)) AND NOT EXISTS(SELECT 1 FROM deal_documents d WHERE d.file_id=f.id) AND NOT EXISTS(SELECT 1 FROM deal_shipments s WHERE f.id=ANY(s.document_ids)) AND NOT EXISTS(SELECT 1 FROM deal_payments p WHERE f.id=ANY(p.document_ids)) RETURNING path`)).rows); await Promise.all(rows.map(r => store.remove(r.path))); };
    return store;
}
