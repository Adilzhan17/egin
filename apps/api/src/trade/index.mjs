import express from 'express';
import { migrateTrade } from './migrations.mjs';
import { createContext } from './context.mjs';
import { installLots } from './lots.mjs';
import { installListings } from './listings.mjs';
import { installOffers } from './offers.mjs';
import { installDeals } from './deals.mjs';
import { installFiles } from './files.mjs';
import { installSavedSearches } from './saved-searches.mjs';
import {installHistory} from './history.mjs';
import { installFarm } from './farm.mjs';
import { fail, id, point, decimal, text } from './validation.mjs';
export function installTrade({ app, db, required, wrap, dataDir, platform, chat }) {
    const router = express.Router();
    router.apiPrefix = '/api/trade';
    app.use('/api/trade', router);
    let available = false, closed = false, timer;
    const ctx = createContext({ platform, db, chat });
    const ready = (async () => { if (!await platform.ready)
        return false; if (chat?.ready && !await chat.ready)
        return false; await migrateTrade(platform.pool); available = true; timer = setInterval(() => { void sweep().catch(e => console.error('Trade maintenance:', e.message)); }, 60000); timer.unref(); return true; })().catch(e => { console.error('Trade initialization:', e.message); return false; });
    router.use((req, res, next) => { ready.then(ok => ok ? next() : res.status(503).json({ error: 'Торговый сервис временно недоступен' })).catch(next); });
    router.use(required);
    router.use((req,res,next)=>{if(!['GET','HEAD'].includes(req.method)&&req.path!=='/files'){if(req.body===undefined)req.body={};if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Buffer.isBuffer(req.body))return res.status(422).json({error:'Ожидается JSON-объект'});}next();});
    router.use((req, res, next) => { const owner = req.get('X-EGIN-Outbox-User'); if (!['GET', 'HEAD'].includes(req.method) && owner !== undefined && owner !== req.user.id)
        return res.status(403).json({ error: 'Профиль изменился. Обновите страницу.' }); next(); });
    router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
    const rates = new Map();
    router.use((req, res, next) => { if (['GET', 'HEAD'].includes(req.method))
        return next(); const now = Date.now(), v = rates.get(req.user.id) || { until: now + 60000, count: 0 }; if (v.until < now) {
        v.until = now + 60000;
        v.count = 0;
    } v.count++; rates.set(req.user.id, v); if (rates.size > 10000)
        for (const [k, r] of rates)
            if (r.until < now)
                rates.delete(k); if (v.count > 120)
        return res.status(429).set('Retry-After', '60').json({ error: 'Слишком много торговых операций' }); next(); });
    for (const key of ['id', 'fileId', 'shipmentId', 'paymentId', 'documentId'])
        router.param(key, (req, res, next, value) => id(value) ? next() : res.status(422).json({ error: 'Некорректный идентификатор' }));
    installSavedSearches(router, wrap, ctx);
    installLots(router, wrap, ctx);
    installListings(router, wrap, ctx);
    installDeals(router, wrap, ctx);
    installOffers(router, wrap, ctx);
    installFiles(router, wrap, ctx, dataDir);
    installFarm(router, wrap, ctx);installHistory(router,wrap,ctx);
    router.post('/logistics', wrap(async (req, res) => { await ctx.org(platform.pool, req.body.organizationId, req.user.id); await ctx.feature(platform.pool, req.user.id, 'trade.logistics', req.body.organizationId); const origin = point(req.body.origin), destination = point(req.body.destination); if (origin?.latitude === undefined || destination?.latitude === undefined)
        throw fail(422, 'Выберите обе точки на карте'); const estimate = req.body.cost === undefined ? null : { amount: decimal(req.body.cost), source: text(req.body.source, 200, true), confirmed: false }; res.json({ route: { origin, destination, roadDistanceKm: null, status: 'routing_not_configured', externalUrl: `https://www.google.com/maps/dir/?api=1&origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}` }, estimate }); }));
    async function sweep() { if (!available || closed)
        return; await ctx.transaction(async (c) => { const rows = (await c.query("SELECT * FROM trade_offers WHERE status IN ('sent','received','reviewing','countered') AND(terms->>'expiresAt')::timestamptz<=now() ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED")).rows; for (const r of rows) {
        await c.query("UPDATE trade_offers SET status='expired',version=version+1 WHERE id=$1", [r.id]);
        await ctx.changed(c, r.created_by, 'offer.expired', 'offer', r.id, [r.seller_id, r.buyer_id]);
    } const overdue = (await c.query("SELECT * FROM trade_deals d WHERE NOT overdue_notified AND status NOT IN ('cancelled','completed') AND (terms->>'finalPaymentDueAt')::timestamptz<now() AND gross>(SELECT coalesce(sum(amount),0) FROM deal_payments WHERE deal_id=d.id AND status='confirmed') ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED")).rows; for (const d of overdue) {
        await c.query('UPDATE trade_deals SET overdue_notified=true WHERE id=$1', [d.id]);
        await ctx.event(c, d, 'system', 'payment.overdue', { dueAt: d.terms.finalPaymentDueAt });
    } await ctx.processSearches(c); }); if (new Date().getUTCMinutes() === 0)
        await ctx.cleanupFiles(); }
    return { ready, status: () => ({ available }), sweep, close: async () => { closed = true; clearInterval(timer); } };
}
