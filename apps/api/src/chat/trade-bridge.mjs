import { randomUUID } from 'node:crypto';
/** Only domain services call this helper. No user-submitted card fields are accepted by Chat HTTP APIs. */
export function createTradeBridge({ userExists, notify }) { return async function postTradeCard(c, { buyerUserId, sellerUserId, actorUserId, entityType, entityId, title, summary }) { if (!['offer', 'deal', 'document'].includes(entityType) || !buyerUserId || !sellerUserId || buyerUserId === sellerUserId || !await userExists(buyerUserId) || !await userExists(sellerUserId))
    return null; if ((await c.query('SELECT 1 FROM chat_user_blocks WHERE(user_id=$1 AND blocked_user_id=$2)OR(user_id=$2 AND blocked_user_id=$1)', [buyerUserId, sellerUserId])).rowCount)
    return null; const pair = `${[buyerUserId, sellerUserId].sort().join(':')}:direct:`; await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['chat-pair:' + pair]); let conv = (await c.query('SELECT id,deleted_at FROM chat_conversations WHERE pair_key=$1 FOR UPDATE', [pair])).rows[0]; if (conv?.deleted_at)
    return null; if (!conv) {
    conv = { id: randomUUID() };
    await c.query("INSERT INTO chat_conversations(id,kind,pair_key) VALUES($1,'direct',$2)", [conv.id, pair]);
    for (const user of [buyerUserId, sellerUserId])
        await c.query('INSERT INTO chat_conversation_members(conversation_id,user_id) VALUES($1,$2)', [conv.id, user]);
} const participants = (await c.query('SELECT user_id,can_write FROM chat_conversation_members WHERE conversation_id=$1', [conv.id])).rows; if (participants.length !== 2 || participants.some(p => !p.can_write))
    return null; const sender = participants.some(p => p.user_id === actorUserId) ? actorUserId : sellerUserId; const metadata = { type: 'trade', entityType, entityId, title: String(title).slice(0, 180), summary: String(summary).slice(0, 500) }; await c.query("INSERT INTO chat_messages(id,conversation_id,sender_id,client_id,kind,text,system) VALUES($1,$2,$3,$4,'text',$5,$6)", [randomUUID(), conv.id, sender, randomUUID(), metadata.title + ' · ' + metadata.summary, metadata]); await c.query('UPDATE chat_conversations SET updated_at=now() WHERE id=$1', [conv.id]); await notify(c, conv.id, 'messages'); return conv.id; }; }
