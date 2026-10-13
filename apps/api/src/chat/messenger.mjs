import { randomUUID } from 'node:crypto';
import { fail, fields, text, uuid, positive } from './validation.mjs';

export const defaultTheme = { preset: 'nature', accent: '', background: '', intensity: 0.5, wallpaperAttachmentId: null };
// A personal wallpaper is a private, unattached image owned by this member.
// Keep the same predicate in quota/GC/send checks so it cannot become a message.
export const activeWallpaperSql = `EXISTS(SELECT 1 FROM chat_conversation_members wallpaper_member JOIN chat_conversations wallpaper_conversation ON wallpaper_conversation.id=wallpaper_member.conversation_id AND wallpaper_conversation.deleted_at IS NULL WHERE wallpaper_member.conversation_id=a.conversation_id AND wallpaper_member.user_id=a.uploader_id AND wallpaper_member.theme->>'wallpaperAttachmentId'=a.id::text AND a.kind='image' AND a.message_id IS NULL)`;
export async function cleanupChatAttachments(pool, store) {
  const rows = (await pool.query(`DELETE FROM chat_attachments a WHERE ((a.message_id IS NULL AND a.created_at<now()-interval '24 hours') OR EXISTS(SELECT 1 FROM chat_messages m WHERE m.id=a.message_id AND m.deleted_at IS NOT NULL)) AND NOT EXISTS(SELECT 1 FROM chat_groups g WHERE g.avatar_id=a.id) AND NOT ${activeWallpaperSql} RETURNING storage_key`)).rows;
  await Promise.all(rows.map(row => store.remove(row.storage_key)));
}
const presets = ['nature', 'ocean', 'lavender', 'sunset', 'sand', 'midnight', 'forest', 'pearl'];
export const linksIn = value => [...new Set((value.match(/https?:\/\/[^\s<>"']+/gi) || []).map(s => s.replace(/[).,!?;]+$/, '')).filter(s => { try { const u = new URL(s); return !u.username && !u.password && ['http:', 'https:'].includes(u.protocol); } catch { return false; } }))].slice(0, 30);
export async function migrateMessenger(pool) {
  for (let attempt = 0; ; attempt++) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN'); await c.query("SELECT pg_advisory_xact_lock(hashtext('egin-chat-migrations'))");
      if ((await c.query('SELECT max(version) version FROM chat_migrations')).rows[0].version >= 7) { await c.query('COMMIT'); return; }
      await c.query('LOCK TABLE chat_conversations,chat_conversation_members,chat_messages,chat_attachments IN ACCESS EXCLUSIVE MODE NOWAIT');
      await c.query(`
        ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
        ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS system jsonb;
        ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_kind_check;
        ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_kind_check CHECK(kind IN('text','image','video','document','audio','listing_reference','location'));
        ALTER TABLE chat_attachments DROP CONSTRAINT IF EXISTS chat_attachments_kind_check;
        ALTER TABLE chat_attachments ADD CONSTRAINT chat_attachments_kind_check CHECK(kind IN('image','video','document','audio'));
        ALTER TABLE chat_conversation_members ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
        ALTER TABLE chat_conversation_members ADD COLUMN IF NOT EXISTS theme jsonb NOT NULL DEFAULT '{"preset":"nature","accent":"","background":"","intensity":0.5}';
        ALTER TABLE chat_conversation_members ADD COLUMN IF NOT EXISTS preferences_version bigint NOT NULL DEFAULT 0;
        ALTER TABLE chat_conversation_members ADD COLUMN IF NOT EXISTS draft varchar(4000) NOT NULL DEFAULT '';
        CREATE TABLE IF NOT EXISTS chat_privacy(user_id text PRIMARY KEY,share_presence boolean NOT NULL DEFAULT false,share_read_receipts boolean NOT NULL DEFAULT true,last_seen timestamptz,online_until timestamptz);
        CREATE TABLE IF NOT EXISTS chat_reactions(message_id uuid NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,user_id text NOT NULL,emoji varchar(32) NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(message_id,user_id));
        CREATE TABLE IF NOT EXISTS chat_message_personal(message_id uuid NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,user_id text NOT NULL,saved boolean NOT NULL DEFAULT false,hidden boolean NOT NULL DEFAULT false,PRIMARY KEY(message_id,user_id));
        CREATE TABLE IF NOT EXISTS chat_pins(message_id uuid PRIMARY KEY REFERENCES chat_messages(id) ON DELETE CASCADE,conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,user_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
        CREATE INDEX IF NOT EXISTS chat_pins_conversation ON chat_pins(conversation_id);
        CREATE INDEX IF NOT EXISTS chat_personal_user ON chat_message_personal(user_id,message_id);
        CREATE EXTENSION IF NOT EXISTS pg_trgm;
        CREATE INDEX IF NOT EXISTS chat_messages_substring ON chat_messages USING gin(text gin_trgm_ops) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS chat_attachment_filename ON chat_attachments USING gin(name gin_trgm_ops);
        CREATE OR REPLACE FUNCTION chat_keep_personal_wallpaper() RETURNS trigger LANGUAGE plpgsql AS $wallpaper_guard$
        BEGIN
          IF OLD.kind='image' AND OLD.message_id IS NULL AND EXISTS(
            SELECT 1 FROM chat_conversation_members m JOIN chat_conversations c ON c.id=m.conversation_id
            WHERE c.id=OLD.conversation_id AND c.deleted_at IS NULL AND m.user_id=OLD.uploader_id AND m.theme->>'wallpaperAttachmentId'=OLD.id::text
          ) THEN RETURN NULL; END IF;
          RETURN OLD;
        END;
        $wallpaper_guard$;
        DROP TRIGGER IF EXISTS chat_keep_personal_wallpaper ON chat_attachments;
        CREATE TRIGGER chat_keep_personal_wallpaper BEFORE DELETE ON chat_attachments FOR EACH ROW EXECUTE FUNCTION chat_keep_personal_wallpaper();
        INSERT INTO chat_migrations(version) VALUES(4),(5),(6),(7) ON CONFLICT DO NOTHING;
      `);
      await c.query('COMMIT'); return;
    } catch (e) { await c.query('ROLLBACK'); if (e.code !== '55P03' || attempt >= 99) throw e; }
    finally { c.release(); }
    await new Promise(r => setTimeout(r, 50));
  }
}

export function installMessenger({ router, wrap, pool, transaction, member, messages, conversation, notify, person, receiptStates, receiptFor, store, attachment, push }) {
  const stateOf = m => ({ theme: m.theme || defaultTheme, draft: m.draft || '', archived: !!m.archived, version:Number(m.preferences_version||0) });
  async function live(c, id, messageId, user, options = {}) {
    const cv = await member(c, id, user, options);
    const row = (await c.query('SELECT * FROM chat_messages WHERE id=$1 AND conversation_id=$2 AND deleted_at IS NULL', [messageId, id])).rows[0];
    if (!row) throw fail(404, 'Сообщение недоступно');
    return { row, cv };
  }
  const privacyOf = r => ({sharePresence:!!r?.share_presence,shareReadReceipts:r?.share_read_receipts!==false});
  router.get('/privacy',wrap(async(req,res)=>res.json({privacy:privacyOf((await pool.query('SELECT * FROM chat_privacy WHERE user_id=$1',[req.user.id])).rows[0])})));
  router.patch('/privacy',wrap(async(req,res)=>{
    fields(req.body,['sharePresence','shareReadReceipts']);for(const v of Object.values(req.body))if(typeof v!=='boolean')throw fail(422,'Проверьте настройки приватности');
    const privacy=await transaction(async c=>{const ids=(await c.query('SELECT conversation_id FROM chat_conversation_members WHERE user_id=$1 ORDER BY conversation_id',[req.user.id])).rows;
      // Same lock ordering as forward/send/ACK avoids concurrent cursor deadlocks.
      for(const r of ids)await c.query('SELECT id FROM chat_conversations WHERE id=$1 FOR UPDATE',[r.conversation_id]);
      const row=(await c.query('INSERT INTO chat_privacy(user_id,share_presence,share_read_receipts) VALUES($1,coalesce($2,false),coalesce($3,true)) ON CONFLICT(user_id) DO UPDATE SET share_presence=coalesce($2,chat_privacy.share_presence),share_read_receipts=coalesce($3,chat_privacy.share_read_receipts),online_until=CASE WHEN $2=false THEN NULL ELSE chat_privacy.online_until END RETURNING *',[req.user.id,req.body.sharePresence??null,req.body.shareReadReceipts??null])).rows[0];
      for(const r of ids){await c.query('UPDATE chat_conversations SET receipt_version=receipt_version+1 WHERE id=$1',[r.conversation_id]);await notify(c,r.conversation_id,'privacy');}return privacyOf(row);
    });res.json({privacy});
  }));
  router.post('/presence',wrap(async(req,res)=>{
    fields(req.body,['active']);if(typeof req.body.active!=='boolean')throw fail(422,'Проверьте состояние');
    const row=(await pool.query("UPDATE chat_privacy SET last_seen=now(),online_until=CASE WHEN $2 THEN now()+interval '40 seconds' ELSE NULL END WHERE user_id=$1 AND share_presence RETURNING user_id",[req.user.id,req.body.active])).rows[0];
    if(row){const ids=(await pool.query('SELECT conversation_id FROM chat_conversation_members WHERE user_id=$1 LIMIT 100',[req.user.id])).rows;for(const r of ids)await notify(pool,r.conversation_id,'presence');}res.json({ok:true});
  }));
  router.get('/conversations/:id/presence',wrap(async(req,res)=>{
    await member(pool,req.params.id,req.user.id);
    const rows=(await pool.query(`SELECT m.user_id,p.share_presence,p.last_seen,(p.online_until>now()) online,EXISTS(SELECT 1 FROM chat_user_blocks b WHERE (b.user_id=$2 AND b.blocked_user_id=m.user_id)OR(b.blocked_user_id=$2 AND b.user_id=m.user_id)) blocked FROM chat_conversation_members m LEFT JOIN chat_privacy p ON p.user_id=m.user_id WHERE m.conversation_id=$1 AND m.user_id<>$2 ORDER BY m.joined_at LIMIT 500`,[req.params.id,req.user.id])).rows;
    res.json({items:rows.map(r=>{const visible=!!r.share_presence&&!r.blocked;return{user:person(r.user_id),visible,online:visible&&!!r.online,lastSeen:visible&&r.last_seen?new Date(r.last_seen).toISOString():null};})});
  }));
  const activityRates = new Map();
  router.post('/conversations/:id/activity', wrap(async (req, res) => {
    fields(req.body, ['state']); const state = req.body.state;
    if (![null, 'typing', 'recording', 'uploading'].includes(state)) throw fail(422, 'Неизвестное действие');
    await member(pool, req.params.id, req.user.id, { write: state !== null });
    const key = req.user.id + ':' + req.params.id, now = Date.now(), previous = activityRates.get(key);
    if (state && previous?.state === state && now - previous.at < 2500) return res.json({ ok: true });
    activityRates.set(key, { state, at: now });
    if (activityRates.size > 10000) for (const [k,v] of activityRates) if (now-v.at>30000) activityRates.delete(k);
    await notify(pool, req.params.id, 'activity', null, { user: person(req.user.id), state, expiresAt: now + (state ? 6000 : 0) });
    res.json({ ok: true });
  }));
  router.put('/conversations/:id/messages/:messageId/reaction', wrap(async (req, res) => {
    fields(req.body, ['emoji']); const emoji = req.body.emoji;let changed=false,authorId=null;
    if (emoji !== null && (typeof emoji !== 'string' || emoji.length > 32 || !/^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji_Modifier}\uFE0F\u200D]*$/u.test(emoji))) throw fail(422, 'Выберите emoji');
    const result = await transaction(async c => {
      const { row } = await live(c, req.params.id, req.params.messageId, req.user.id, { lock: true, write: true });
      if (row.system) throw fail(422, 'Это служебное событие');
      const old=(await c.query('SELECT emoji FROM chat_reactions WHERE message_id=$1 AND user_id=$2',[row.id,req.user.id])).rows[0]?.emoji??null;changed=old!==emoji;authorId=row.sender_id;
      if(!changed)return (await messages(c,[row],req.user.id))[0];
      if (emoji === null) await c.query('DELETE FROM chat_reactions WHERE message_id=$1 AND user_id=$2', [row.id, req.user.id]);
      else await c.query('INSERT INTO chat_reactions(message_id,user_id,emoji) VALUES($1,$2,$3) ON CONFLICT(message_id,user_id) DO UPDATE SET emoji=excluded.emoji,created_at=now()', [row.id, req.user.id, emoji]);
      await notify(c, req.params.id, 'reaction', null, { messageId: row.id, authorId: row.sender_id, reactor: person(req.user.id), emoji });
      return (await messages(c, [row], req.user.id))[0];
    }); res.json({ message: result });
    if(changed&&emoji&&authorId!==req.user.id)void push(req.params.id,req.user.id,{recipientId:authorId,messageId:req.params.messageId,body:`${person(req.user.id).name} отреагировал(а) ${emoji} на ваше сообщение`});
  }));
  router.patch('/conversations/:id/messages/:messageId/state', wrap(async (req, res) => {
    fields(req.body, ['saved', 'hidden', 'pinned']); for (const v of Object.values(req.body)) if (typeof v !== 'boolean') throw fail(422, 'Проверьте настройку');
    const result = await transaction(async c => {
      const { row, cv } = await live(c, req.params.id, req.params.messageId, req.user.id, { lock: true });
      if (req.body.pinned !== undefined) {
        if (cv.kind === 'group' && !['owner', 'admin'].includes(cv.member.role)) throw fail(403, 'Закрепить сообщение может администратор');
        if (req.body.pinned) await c.query('INSERT INTO chat_pins(message_id,conversation_id,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [row.id, cv.id, req.user.id]);
        else await c.query('DELETE FROM chat_pins WHERE message_id=$1', [row.id]);
      }
      if (req.body.saved !== undefined || req.body.hidden !== undefined) await c.query('INSERT INTO chat_message_personal(message_id,user_id,saved,hidden) VALUES($1,$2,coalesce($3,false),coalesce($4,false)) ON CONFLICT(message_id,user_id) DO UPDATE SET saved=coalesce($3,chat_message_personal.saved),hidden=coalesce($4,chat_message_personal.hidden)', [row.id, req.user.id, req.body.saved ?? null, req.body.hidden ?? null]);
      await notify(c, cv.id, req.body.pinned === undefined ? 'personal' : 'pin', null, { ...(req.body.pinned === undefined ? { targetUser: req.user.id } : {}), messageId: row.id });
      return (await messages(c, [row], req.user.id))[0];
    }); res.json({ ok: true, message: result || null });
  }));
  router.get('/conversations/:id/preferences', wrap(async (req, res) => res.json({ preferences: stateOf((await member(pool, req.params.id, req.user.id)).member) })));
  router.patch('/conversations/:id/preferences', wrap(async (req, res) => {
    fields(req.body, ['theme', 'draft', 'archived','expectedVersion']); const b = req.body;
    if(b.expectedVersion!==undefined&&(!Number.isSafeInteger(b.expectedVersion)||b.expectedVersion<0))throw fail(422,'Проверьте версию');
    if (b.draft !== undefined) { text(b.draft); b.draft=b.draft.normalize('NFC'); }
    if (b.archived !== undefined && typeof b.archived !== 'boolean') throw fail(422, 'Проверьте настройку');
    if (b.theme !== undefined) {
      fields(b.theme, ['preset', 'accent', 'background', 'intensity', 'wallpaperAttachmentId']); b.theme = { ...defaultTheme, ...b.theme };
      if (!presets.includes(b.theme.preset) || !Number.isFinite(b.theme.intensity) || b.theme.intensity < 0 || b.theme.intensity > 1) throw fail(422, 'Проверьте тему');
      for (const k of ['accent', 'background']) if (typeof b.theme[k] !== 'string' || !/^(#[a-f\d]{6})?$/i.test(b.theme[k])) throw fail(422, 'Укажите цвет в формате HEX');
      if (b.theme.wallpaperAttachmentId !== null && !uuid(b.theme.wallpaperAttachmentId)) throw fail(422, 'Выберите загруженное изображение для фона');
    }
    const preferences = await transaction(async c => {
      const current=await member(c, req.params.id, req.user.id, { lock: true });
      if(b.expectedVersion!==undefined&&Number(current.member.preferences_version)!==b.expectedVersion)throw fail(409,'Черновик изменён на другом устройстве. Обновите беседу.');
      if (b.theme?.wallpaperAttachmentId) {
        const image = (await c.query(`SELECT a.id FROM chat_attachments a WHERE a.id=$1 AND a.conversation_id=$2 AND a.uploader_id=$3 AND a.kind='image' AND a.message_id IS NULL AND NOT EXISTS(SELECT 1 FROM chat_groups g WHERE g.avatar_id=a.id) FOR UPDATE`, [b.theme.wallpaperAttachmentId, req.params.id, req.user.id])).rows[0];
        if (!image) throw fail(422, 'Изображение фона недоступно. Загрузите его заново.');
        // Refresh the pending timestamp under row lock: a concurrent GC snapshot
        // must re-check the fresh row instead of deleting a newly selected image.
        await c.query('UPDATE chat_attachments SET created_at=now() WHERE id=$1', [image.id]);
      }
      const r = (await c.query('UPDATE chat_conversation_members SET preferences_version=preferences_version+1,theme=coalesce($3,theme),draft=coalesce($4,draft),archived=coalesce($5,archived) WHERE conversation_id=$1 AND user_id=$2 RETURNING *', [req.params.id, req.user.id, b.theme ? JSON.stringify(b.theme) : null, b.draft ?? null, b.archived ?? null])).rows[0];
      await notify(c, req.params.id, 'preferences', null, { targetUser: req.user.id,changedKeys:Object.keys(b).filter(k=>k!=='expectedVersion') }); return stateOf(r);
    }); res.json({ preferences });
  }));
  async function search(req, materials = false) {
    await member(pool, req.params.id, req.user.id);
    const q = text(req.query.q ?? '', 160), type = req.chatCollection || req.query.type || '', sender = text(req.query.sender ?? '', 100), before = positive(req.query.before);
    const kinds = { media: ['image','video'], documents: ['document'], links: [], voice: ['audio'], locations: ['location'], image:['image'], video:['video'], document:['document'], audio:['audio'], location:['location'], text:['text'] };
    if (type && !Object.hasOwn(kinds, type) && !['saved','pinned'].includes(type)) throw fail(422, 'Неизвестный тип');
    const date = (v,end=false) => { if (!v) return null; if (typeof v !== 'string' || !Number.isFinite(Date.parse(v))) throw fail(422, 'Проверьте дату'); return new Date(end&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v+'T23:59:59.999Z':v).toISOString(); };
    const rows = (await pool.query(`SELECT x.* FROM chat_messages x WHERE x.conversation_id=$1 AND x.deleted_at IS NULL AND x.system IS NULL
      AND NOT EXISTS(SELECT 1 FROM chat_message_personal p WHERE p.message_id=x.id AND p.user_id=$2 AND p.hidden)
      AND ($3='' OR to_tsvector('simple',x.text)@@plainto_tsquery('simple',$3) OR x.text ILIKE $4 OR EXISTS(SELECT 1 FROM chat_attachments a WHERE a.message_id=x.id AND a.name ILIKE $4))
      AND ($5='' OR x.sender_id=$5) AND ($6::bigint=0 OR x.sequence<$6)
      AND ($7::timestamptz IS NULL OR x.created_at>=$7) AND ($8::timestamptz IS NULL OR x.created_at<=$8)
      AND ($9='' OR ($9='links' AND x.text ~* 'https?://') OR ($9='saved' AND EXISTS(SELECT 1 FROM chat_message_personal p WHERE p.message_id=x.id AND p.user_id=$2 AND p.saved)) OR ($9='pinned' AND EXISTS(SELECT 1 FROM chat_pins p WHERE p.message_id=x.id)) OR x.kind=ANY($10::text[])) ORDER BY x.sequence DESC LIMIT 31`, [req.params.id, req.user.id, q, `%${q.replace(/[\\%_]/g,'\\$&')}%`, sender, before, date(req.query.from), date(req.query.to,true), type, kinds[type] || []])).rows;
    const hasMore = rows.length > 30; rows.splice(30); const items = await messages(pool, rows, req.user.id), nextBefore = hasMore ? Number(rows.at(-1).sequence) : null;
    return { items, messages: items, hasMore, nextBefore, nextCursor: nextBefore ? String(nextBefore) : null };
  }
  router.get('/conversations/:id/materials', wrap(async (req, res) => res.json(await search(req, true))));
  router.get('/conversations/:id/saved',wrap(async(req,res)=>{req.chatCollection='saved';res.json(await search(req));}));
  router.get('/conversations/:id/pins',wrap(async(req,res)=>{req.chatCollection='pinned';res.json(await search(req));}));
  router.get('/conversations/:id/search', wrap(async (req, res) => res.json(await search(req))));
  router.get('/conversations/:id/messages/:messageId/receipts', wrap(async (req, res) => {
    const { row } = await live(pool, req.params.id, req.params.messageId, req.user.id);
    if (row.sender_id !== req.user.id) throw fail(403, 'Статусы доступны автору');
    const states = await receiptStates(pool, [req.params.id]);
    res.json({ receipt: receiptFor(row, req.user.id, states), items: states.filter(s => s.user_id !== req.user.id).map(s => ({ user: person(s.user_id), delivered: Number(s.last_delivered_sequence) >= Number(row.sequence), read: s.share_read_receipts!==false&&Number(s.last_read_sequence) >= Number(row.sequence),readPrivate:s.share_read_receipts===false })) });
  }));
  router.delete('/groups/:id', wrap(async (req, res) => {
    await transaction(async c => {
      const cv = await member(c, req.params.id, req.user.id, { lock: true });
      if (cv.kind !== 'group' || cv.member.role !== 'owner') throw fail(403, 'Удалить группу может владелец');
      const users = (await c.query('SELECT user_id FROM chat_conversation_members WHERE conversation_id=$1', [cv.id])).rows;
      await c.query('UPDATE chat_conversations SET deleted_at=now() WHERE id=$1', [cv.id]);
      await c.query("UPDATE chat_groups SET access='private' WHERE conversation_id=$1", [cv.id]);
      await c.query('DELETE FROM chat_conversation_members WHERE conversation_id=$1', [cv.id]);
      for (const u of users) await notify(c, cv.id, 'members', u.user_id);
    }); res.json({ ok: true });
  }));
  router.post('/conversations/:id/forward', wrap(async (req, res) => {
    fields(req.body, ['messageIds', 'targetConversationId', 'clientIds']); const b = req.body;
    if (!uuid(b.targetConversationId) || !Array.isArray(b.messageIds) || !b.messageIds.length || b.messageIds.length > 10 || b.messageIds.some(x => !uuid(x)) || new Set(b.messageIds).size !== b.messageIds.length || !Array.isArray(b.clientIds) || b.clientIds.length !== b.messageIds.length || b.clientIds.some(x => !uuid(x)) || new Set(b.clientIds).size !== b.clientIds.length) throw fail(422, 'Выберите до 10 сообщений');
    const copied = [], keys = [];
    try {
      const result = await transaction(async c => {
        for (const id of [...new Set([req.params.id,b.targetConversationId])].sort()) await member(c, id, req.user.id, { lock: true, write: id === b.targetConversationId });
        for (const clientId of [...b.clientIds].sort())await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`chat-send:${req.user.id}:${clientId}`]);
        for (let i=0;i<b.messageIds.length;i++) {
          const {row} = await live(c,req.params.id,b.messageIds[i],req.user.id);
          if (row.system || (await c.query('SELECT 1 FROM chat_message_personal WHERE message_id=$1 AND user_id=$2 AND hidden',[row.id,req.user.id])).rowCount) throw fail(404,'Сообщение недоступно');
          const old=(await c.query('SELECT * FROM chat_messages WHERE sender_id=$1 AND client_id=$2',[req.user.id,b.clientIds[i]])).rows[0];
          if(old){if(old.conversation_id!==b.targetConversationId)throw fail(409,'Идентификатор отправки уже использован');copied.push(old);continue;}
          const next=(await c.query('INSERT INTO chat_messages(id,conversation_id,sender_id,client_id,kind,text,listing_id,location) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[randomUUID(),b.targetConversationId,req.user.id,b.clientIds[i],row.kind,row.text,row.listing_id,row.location])).rows[0];
          for(const a of (await c.query('SELECT * FROM chat_attachments WHERE message_id=$1 ORDER BY sort_order',[row.id])).rows){
            const saved=await store.copy(a.storage_key);keys.push(saved);
            await c.query('INSERT INTO chat_attachments(id,conversation_id,uploader_id,message_id,kind,name,mime_type,file_size,storage_key,width,height,duration,waveform,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[randomUUID(),b.targetConversationId,req.user.id,next.id,a.kind,a.name,a.mime_type,a.file_size,saved,a.width,a.height,a.duration,a.waveform?JSON.stringify(a.waveform):null,a.sort_order]);
          }copied.push(next);
        }
        await c.query('UPDATE chat_conversations SET updated_at=now() WHERE id=$1',[b.targetConversationId]);await notify(c,b.targetConversationId);return messages(c,copied,req.user.id);
      });res.json({items:result});void push(b.targetConversationId,req.user.id);
    }catch(e){await Promise.all(keys.map(k=>store.remove(k)));throw e;}
  }));
}
