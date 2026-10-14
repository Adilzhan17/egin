import {createHash,randomUUID} from 'node:crypto';
import {fail,fields,uuid} from './validation.mjs';
const audiences=['all','interlocutors','nobody'];
const sidHash=req=>createHash('sha256').update(req.sid||`legacy:${req.user.id}`).digest('hex');
const audienceOf=r=>!r?.share_presence?'nobody':r?.presence_audience==='interlocutors'?'interlocutors':'all';
const privacyOf=r=>({presenceAudience:audienceOf(r),sharePresence:audienceOf(r)!=='nobody',shareReadReceipts:r?.share_read_receipts!==false});
export async function migratePresence(pool){
 const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(hashtext('egin-chat-migrations'))");
 const done=(await c.query('SELECT 1 FROM chat_migrations WHERE version=9')).rowCount;
 const exists=(await c.query("SELECT to_regclass('chat_presence_leases') relation")).rows[0].relation;
 if(!done||!exists){await c.query(`ALTER TABLE chat_privacy ADD COLUMN IF NOT EXISTS presence_audience text NOT NULL DEFAULT 'nobody' CHECK(presence_audience IN('all','interlocutors','nobody'));
 CREATE TABLE IF NOT EXISTS chat_presence_leases(user_id text NOT NULL,session_hash text NOT NULL,client_id text NOT NULL,stream_id uuid,last_seen timestamptz,online_until timestamptz,PRIMARY KEY(user_id,session_hash,client_id));
 CREATE INDEX IF NOT EXISTS chat_presence_expiry ON chat_presence_leases(online_until);`);
 if(!done)await c.query("UPDATE chat_privacy SET presence_audience=CASE WHEN share_presence THEN 'all' ELSE 'nobody' END");
 await c.query('INSERT INTO chat_migrations(version) VALUES(9) ON CONFLICT DO NOTHING');}
 await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export function installPresence({router,wrap,pool,transaction,member,notify,person}){
 const client=req=>{const v=req.body?.clientId??req.query?.clientId;if(v!==undefined&&!uuid(v))throw fail(422,'Некорректный идентификатор вкладки');return v||'legacy';};
 async function changed(c,user){
  const p=(await c.query('SELECT * FROM chat_privacy WHERE user_id=$1',[user])).rows[0],audience=audienceOf(p);if(audience==='nobody')return;
  const peers=(await c.query(`SELECT DISTINCT me.conversation_id,other.user_id FROM chat_conversation_members me JOIN chat_conversations cv ON cv.id=me.conversation_id AND cv.deleted_at IS NULL JOIN chat_conversation_members other ON other.conversation_id=me.conversation_id AND other.user_id<>$1 WHERE me.user_id=$1 AND NOT EXISTS(SELECT 1 FROM chat_user_blocks b WHERE(b.user_id=$1 AND b.blocked_user_id=other.user_id)OR(b.user_id=other.user_id AND b.blocked_user_id=$1)) AND($2='all' OR EXISTS(SELECT 1 FROM chat_conversation_members a JOIN chat_conversation_members z ON z.conversation_id=a.conversation_id JOIN chat_conversations direct ON direct.id=a.conversation_id WHERE a.user_id=$1 AND z.user_id=other.user_id AND direct.kind IN('direct','market') AND direct.deleted_at IS NULL)) LIMIT 1000`,[user,audience])).rows;
  for(const r of peers)await notify(c,r.conversation_id,'presence',null,{targetUser:r.user_id});
 }
 async function refresh(c,user){await c.query(`UPDATE chat_privacy SET online_until=(SELECT max(online_until) FROM chat_presence_leases WHERE user_id=$1 AND online_until>now()),last_seen=greatest(last_seen,(SELECT max(last_seen) FROM chat_presence_leases WHERE user_id=$1)) WHERE user_id=$1`,[user]);}
 router.get('/privacy',wrap(async(req,res)=>res.json({privacy:privacyOf((await pool.query('SELECT * FROM chat_privacy WHERE user_id=$1',[req.user.id])).rows[0])})));
 router.patch('/privacy',wrap(async(req,res)=>{
  fields(req.body,['sharePresence','shareReadReceipts','presenceAudience']);const b=req.body;
  if(b.presenceAudience!==undefined&&!audiences.includes(b.presenceAudience)||b.sharePresence!==undefined&&typeof b.sharePresence!=='boolean'||b.shareReadReceipts!==undefined&&typeof b.shareReadReceipts!=='boolean')throw fail(422,'Проверьте настройки приватности');
  if(b.presenceAudience!==undefined&&b.sharePresence!==undefined&&b.sharePresence!==(b.presenceAudience!=='nobody'))throw fail(422,'Настройки видимости противоречат друг другу');
  const audience=b.presenceAudience??(b.sharePresence===undefined?null:b.sharePresence?'all':'nobody');
  const privacy=await transaction(async c=>{const ids=(await c.query('SELECT conversation_id FROM chat_conversation_members WHERE user_id=$1 ORDER BY conversation_id',[req.user.id])).rows;for(const r of ids)await c.query('SELECT id FROM chat_conversations WHERE id=$1 FOR UPDATE',[r.conversation_id]);
   const row=(await c.query(`INSERT INTO chat_privacy(user_id,share_presence,presence_audience,share_read_receipts) VALUES($1,coalesce($2<>'nobody',false),coalesce($2,'nobody'),coalesce($3,true)) ON CONFLICT(user_id) DO UPDATE SET share_presence=coalesce($2<>'nobody',chat_privacy.share_presence),presence_audience=coalesce($2,chat_privacy.presence_audience),share_read_receipts=coalesce($3,chat_privacy.share_read_receipts) RETURNING *`,[req.user.id,audience,b.shareReadReceipts??null])).rows[0];
   for(const r of ids){await c.query('UPDATE chat_conversations SET receipt_version=receipt_version+1 WHERE id=$1',[r.conversation_id]);await notify(c,r.conversation_id,'privacy');}return privacyOf(row);
  });res.json({privacy});
 }));
 router.post('/presence',wrap(async(req,res)=>{
  fields(req.body,['active','clientId']);if(typeof req.body.active!=='boolean')throw fail(422,'Проверьте состояние');const clientId=client(req);
  await transaction(async c=>{await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['chat-presence:'+req.user.id]);await c.query('INSERT INTO chat_privacy(user_id) VALUES($1) ON CONFLICT DO NOTHING',[req.user.id]);
   await c.query(`INSERT INTO chat_presence_leases(user_id,session_hash,client_id,last_seen,online_until) VALUES($1,$2,$3,now(),CASE WHEN $4 THEN now()+interval '40 seconds' ELSE NULL END) ON CONFLICT(user_id,session_hash,client_id) DO UPDATE SET last_seen=CASE WHEN $4 OR chat_presence_leases.online_until>now() THEN now() ELSE chat_presence_leases.last_seen END,online_until=CASE WHEN $4 THEN now()+interval '40 seconds' ELSE NULL END`,[req.user.id,sidHash(req),clientId,req.body.active]);await refresh(c,req.user.id);await changed(c,req.user.id);
   await c.query("DELETE FROM chat_presence_leases WHERE user_id=$1 AND coalesce(last_seen,'epoch')<now()-interval '1 day' AND coalesce(online_until,'epoch')<=now() AND client_id<>$2",[req.user.id,clientId]);
  });res.json({ok:true});
 }));
 router.get('/conversations/:id/presence',wrap(async(req,res)=>{
  await member(pool,req.params.id,req.user.id);
  const rows=(await pool.query(`SELECT m.user_id,p.share_presence,p.presence_audience,p.last_seen,p.online_until,(p.online_until>now()) online,EXISTS(SELECT 1 FROM chat_user_blocks b WHERE(b.user_id=$2 AND b.blocked_user_id=m.user_id)OR(b.blocked_user_id=$2 AND b.user_id=m.user_id)) blocked,EXISTS(SELECT 1 FROM chat_conversation_members a JOIN chat_conversation_members z ON z.conversation_id=a.conversation_id JOIN chat_conversations cv ON cv.id=a.conversation_id WHERE a.user_id=$2 AND z.user_id=m.user_id AND cv.kind IN('direct','market') AND cv.deleted_at IS NULL) interlocutor FROM chat_conversation_members m LEFT JOIN chat_privacy p ON p.user_id=m.user_id WHERE m.conversation_id=$1 AND m.user_id<>$2 ORDER BY m.joined_at LIMIT 500`,[req.params.id,req.user.id])).rows;
  res.json({items:rows.map(r=>{const audience=audienceOf(r),visible=!r.blocked&&(audience==='all'||audience==='interlocutors'&&r.interlocutor),recent=!r.blocked&&r.last_seen&&Date.now()-new Date(r.last_seen)<72*3600000;return{user:person(r.user_id),visible,online:visible&&!!r.online,lastSeen:visible&&r.last_seen?new Date(r.last_seen).toISOString():null,onlineUntil:visible&&r.online?new Date(r.online_until).toISOString():null,status:visible?(r.online?'online':'offline'):recent?'recently':'hidden'};})});
 }));
 return{
  async openStream(req){const clientId=client(req);if(clientId==='legacy')return null;const streamId=randomUUID();await pool.query('INSERT INTO chat_presence_leases(user_id,session_hash,client_id,stream_id) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,session_hash,client_id) DO UPDATE SET stream_id=excluded.stream_id',[req.user.id,sidHash(req),clientId,streamId]);return{user:req.user.id,sessionHash:sidHash(req),clientId,streamId};},
  async closeStream(token){if(!token)return;await transaction(async c=>{await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['chat-presence:'+token.user]);const r=await c.query('UPDATE chat_presence_leases SET online_until=NULL WHERE user_id=$1 AND session_hash=$2 AND client_id=$3 AND stream_id=$4 RETURNING user_id',[token.user,token.sessionHash,token.clientId,token.streamId]);if(r.rowCount){await refresh(c,token.user);await changed(c,token.user);if(!(await c.query('SELECT 1 FROM chat_presence_leases WHERE user_id=$1 AND online_until>now() LIMIT 1',[token.user])).rowCount){for(const v of (await c.query('SELECT conversation_id FROM chat_conversation_members WHERE user_id=$1 LIMIT 1000',[token.user])).rows)await notify(c,v.conversation_id,'activity',null,{user:person(token.user),state:null,expiresAt:Date.now()});}}});}
 };
}
