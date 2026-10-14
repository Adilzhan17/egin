import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { Pool } from 'pg';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID,createHash } from 'node:crypto';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import webpush from 'web-push';
import { installChat } from '../src/chat/index.mjs';
import { linksIn, cleanupChatAttachments } from '../src/chat/messenger.mjs';

test('links never fetch remote metadata or allow credentials/non-HTTP protocols',()=>{
  assert.deepEqual(linksIn('https://example.com/a, http://test.kz/x https://user:pw@example.org javascript:alert(1)'),['https://example.com/a','http://test.kz/x']);
});
test('Messenger2 real PostgreSQL: persistent personal state, two-slot ephemeral/reactions, group revocation, search and forwards', {skip:!process.env.CHAT_TEST_DATABASE_URL},async t=>{
 const pool=new Pool({connectionString:process.env.CHAT_TEST_DATABASE_URL}),db=new DatabaseSync(':memory:'),dataDir=await mkdtemp(tmpdir()+'/egin-messenger2-');
 db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT);CREATE TABLE sessions(id TEXT PRIMARY KEY,user_id TEXT,expires INTEGER);CREATE TABLE subscriptions(user_id TEXT,endpoint TEXT,data TEXT);');
 const users=Array.from({length:4},randomUUID),sessions=new Map(),ids=[];
 users.forEach((id,i)=>{const sid=randomUUID();sessions.set(id,sid);db.prepare('INSERT INTO users VALUES(?,?)').run(id,['Айгерим','Азамат','Данияр','Бөгде'][i]);db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(sid).digest('hex'),id,Date.now()+300000);});
 const slots=Array.from({length:2},()=>{const app=express();app.use(express.json());app.use((req,res,next)=>{const id=req.headers['x-user'];if(users.includes(id)){req.user={id};req.sid=sessions.get(id);}next();});const service=installChat({app,db,dataDir,databaseUrl:process.env.CHAT_TEST_DATABASE_URL,required:(req,res,next)=>req.user?next():res.sendStatus(401),wrap:fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next)});app.use((e,req,res,next)=>{if(!e.status)console.error(e);res.status(e.status||500).json({error:e.message});});return{app,service};});
 await Promise.all(slots.map(async s=>assert.equal(await s.service.ready,true)));
 const servers=slots.map(s=>s.app.listen(0,'127.0.0.1'));await Promise.all(servers.map(s=>new Promise(r=>s.once('listening',r))));const origins=servers.map(s=>`http://127.0.0.1:${s.address().port}/api/chat`);
 async function call(path,{user=users[0],method='GET',body,slot=0}={}){const r=await fetch(origins[slot]+path,{method,headers:{'x-user':user,...(body?{'Content-Type':Buffer.isBuffer(body)?'application/octet-stream':'application/json'}:{})},body:body?(Buffer.isBuffer(body)?body:JSON.stringify(body)):undefined});return{status:r.status,...await r.json()};}
 const send=async(id,body={},user=users[0])=>{const r=await call(`/conversations/${id}/messages`,{user,method:'POST',body:{clientId:randomUUID(),kind:'text',text:'Рабочее сообщение',...body}});assert.equal(r.status,201,r.error);return r.message;};
 let group,direct,first,photo;
 try{
 group=(await call('/groups',{method:'POST',body:{name:'Chat 2 проверка',category:'crops',access:'public'}})).conversation.id;ids.push(group);
 for(const user of users.slice(1,3))assert.equal((await call(`/groups/${group}/join`,{method:'POST',body:{},user})).status,200);
 direct=(await call('/conversations',{method:'POST',body:{kind:'direct',userId:users[1]}})).conversation.id;ids.push(direct);
 first=await send(group,{text:'Пшеница wheat бидай https://example.org/seed'});
 await t.test('typing is ephemeral, crosses API slots, scopes members and expires without database messages',async()=>{
   const before=(await pool.query('SELECT count(*) n FROM chat_messages WHERE conversation_id=$1',[group])).rows[0].n;
   const abort=new AbortController(),r=await fetch(origins[1]+'/events',{headers:{'x-user':users[1]},signal:abort.signal}),reader=r.body.getReader();await reader.read();const timer=setTimeout(()=>abort.abort(),4000);
   try{assert.equal((await call(`/conversations/${group}/activity`,{method:'POST',body:{state:'typing'}})).status,200);let output='';while(!output.includes('event: activity'))output+=new TextDecoder().decode((await reader.read()).value);const event=JSON.parse(output.split('event: activity\ndata: ')[1].split('\n')[0]);assert.equal(event.user.id,users[0]);assert.equal(event.state,'typing');assert.ok(event.expiresAt>Date.now()&&event.expiresAt<=Date.now()+6000);assert.equal((await call(`/conversations/${group}/activity`,{method:'POST',body:{state:'typing'},user:users[3]})).status,404);assert.equal((await call(`/conversations/${group}/activity`,{method:'POST',body:{state:null}})).status,200);}finally{clearTimeout(timer);abort.abort();}
   assert.equal((await pool.query('SELECT count(*) n FROM chat_messages WHERE conversation_id=$1',[group])).rows[0].n,before);
 });
 await t.test('reaction uniqueness, replacement/removal and realtime shared state survive refetch',async()=>{
   const path=`/conversations/${group}/messages/${first.id}/reaction`;
   const sentPush=[],originalPush=webpush.sendNotification;webpush.sendNotification=async(sub,payload)=>{sentPush.push(JSON.parse(payload));};
   db.prepare('INSERT INTO subscriptions VALUES(?,?,?)').run(users[0],'https://example.invalid/reaction-test',JSON.stringify({endpoint:'https://example.invalid/reaction-test'}));
   try{
   const result=await Promise.all(Array.from({length:3},()=>call(path,{method:'PUT',body:{emoji:'🌱'},user:users[1]})));assert.ok(result.every(v=>v.status===200));
   let m=(await call(`/conversations/${group}/messages`,{slot:1})).items.find(m=>m.id===first.id);assert.deepEqual(m.reactions.map(r=>[r.emoji,r.count,r.mine]),[['🌱',1,false]]);assert.equal(m.reactions[0].users[0].id,users[1]);
   await new Promise(r=>setTimeout(r,30));assert.equal(sentPush.length,1,'Identical concurrent PUT retries send one reaction push');assert.equal(sentPush[0].type,'chat.reaction');
   await call(`/conversations/${group}`,{method:'PATCH',body:{muted:true}});
   assert.equal((await call(path,{method:'PUT',body:{emoji:'✅'},user:users[1]})).message.reactions[0].emoji,'✅');
   await new Promise(r=>setTimeout(r,30));assert.equal(sentPush.length,1,'Muted author receives no reaction push');
   await call(`/conversations/${group}`,{method:'PATCH',body:{muted:false}});
   await call(path,{method:'PUT',body:{emoji:null},user:users[1]});assert.equal((await call(`/conversations/${group}/messages`)).items.find(m=>m.id===first.id).reactions.length,0);
   assert.equal((await call(path,{method:'PUT',body:{emoji:'<script>'}})).status,422);
   assert.equal((await call(path,{method:'PUT',body:{emoji:'👍'},user:users[3]})).status,404);
   }finally{webpush.sendNotification=originalPush;db.prepare('DELETE FROM subscriptions WHERE user_id=?').run(users[0]);}
 });
 await t.test('personal themes/drafts archive have server versions, user isolation and conflict protection',async()=>{
   const path=`/conversations/${group}/preferences`,initial=(await call(path)).preferences;
   const saved=await call(path,{method:'PATCH',body:{theme:{preset:'midnight',accent:'#ABCDEF',background:'#102030',intensity:.3},draft:'Черновик',archived:true,expectedVersion:initial.version}});assert.equal(saved.status,200,saved.error);assert.equal(saved.preferences.version,initial.version+1);
   assert.equal((await call(path,{slot:1})).preferences.draft,'Черновик');assert.equal((await call(path,{user:users[1]})).preferences.theme.preset,'nature');assert.equal((await call(path,{method:'PATCH',body:{draft:'Старая копия',expectedVersion:initial.version}})).status,409);
   assert.equal((await call('/conversations')).items.some(c=>c.id===group),false);assert.equal((await call('/conversations?filter=archived')).items.some(c=>c.id===group),true);
   assert.equal((await call(path,{method:'PATCH',body:{theme:{preset:'nature',background:'url(https://evil.test)'}}})).status,422);
 });
 await t.test('saved/pinned/deleted-for-self persist and do not hide from other members',async()=>{
   const path=`/conversations/${group}/messages/${first.id}/state`;
   assert.equal((await call(path,{method:'PATCH',body:{pinned:true},user:users[1]})).status,403);
   assert.equal((await call(path,{method:'PATCH',body:{pinned:true,saved:true}})).status,200);
   assert.equal((await call(`/conversations/${group}/pins`,{user:users[1]})).items[0].id,first.id);assert.equal((await call(`/conversations/${group}/saved`)).items[0].id,first.id);assert.equal((await call(`/conversations/${group}/saved`,{user:users[1]})).items.length,0);
   assert.equal((await call(path,{method:'PATCH',body:{hidden:true}})).status,200);
   const mine=await call(`/conversations/${group}/messages?reconcile=${first.id}`);assert.ok(mine.deletedIds.includes(first.id));assert.equal(mine.items.find(m=>m.id===first.id).hidden,true);assert.equal(mine.items.find(m=>m.id===first.id).text,'');assert.deepEqual(mine.items.find(m=>m.id===first.id).links,[]);
   assert.equal((await call(`/conversations/${group}/messages`,{user:users[1]})).items.find(m=>m.id===first.id).hidden,false);assert.equal((await call(`/conversations/${group}/materials?type=links`)).items.length,0);
   await call(path,{method:'PATCH',body:{hidden:false}});
 });
 await t.test('private wallpapers persist per member, reject borrowed/cross-chat assets and follow replacement GC',async()=>{
   const bytes=await sharp({create:{width:8,height:8,channels:3,background:'#789567'}}).png().toBuffer();
   const path=`/conversations/${group}/preferences`, upload=(conversationId=group,user=users[0])=>call(`/conversations/${conversationId}/attachments?kind=image&purpose=wallpaper&name=wallpaper.png`,{method:'POST',body:bytes,user});
   const one=await upload();assert.equal(one.status,201,one.error);const image=one.attachment;
   const assigned=await call(path,{method:'PATCH',body:{theme:{preset:'nature',wallpaperAttachmentId:image.id}}});assert.equal(assigned.status,200,assigned.error);
   assert.equal((await call(path,{slot:1})).preferences.theme.wallpaperAttachmentId,image.id);
   assert.equal((await call(path,{user:users[1]})).preferences.theme.wallpaperAttachmentId||null,null);
   assert.equal((await fetch(origins[0]+image.url.replace('/api/chat',''),{headers:{'x-user':users[0]}})).status,200);
   assert.equal((await fetch(origins[0]+image.url.replace('/api/chat',''),{headers:{'x-user':users[1]}})).status,404,'Other group members cannot read a personal wallpaper');
   assert.equal((await call(path,{method:'PATCH',user:users[1],body:{theme:{preset:'nature',wallpaperAttachmentId:image.id}}})).status,422,'A member cannot borrow another uploader image');
   const cross=(await upload(direct)).attachment;
   assert.equal((await call(path,{method:'PATCH',body:{theme:{preset:'nature',wallpaperAttachmentId:cross.id}}})).status,422,'Wallpaper is scoped to its conversation');
   assert.equal((await call(`/conversations/${direct}/preferences`,{method:'PATCH',body:{theme:{preset:'nature',wallpaperAttachmentId:cross.id}}})).status,200);
   assert.equal((await call(path,{method:'PATCH',body:{theme:{preset:'nature',wallpaperAttachmentId:'https://example.org/background.jpg'}}})).status,422);
   assert.equal((await call(`/conversations/${group}/messages`,{method:'POST',body:{clientId:randomUUID(),kind:'image',attachmentIds:[image.id]}})).status,422,'A referenced private wallpaper cannot become a shared message');
   // No stale pending-file cleanup or quota may remove a currently selected background.
   await pool.query("UPDATE chat_attachments SET created_at=now()-interval '48 hours' WHERE id=$1",[image.id]);
   // Blue/green keeps the previous API slot alive. Its old GC must not erase the new asset.
   const legacyGc=await pool.query("DELETE FROM chat_attachments a WHERE a.id=$1 AND a.message_id IS NULL AND a.created_at<now()-interval '24 hours' AND NOT EXISTS(SELECT 1 FROM chat_groups g WHERE g.avatar_id=a.id) RETURNING storage_key",[image.id]);
   assert.equal(legacyGc.rowCount,0,'Database guard protects references from an old slot GC');
   const removed=[];await cleanupChatAttachments(pool,{remove:async key=>removed.push(key)});
   assert.equal((await pool.query('SELECT count(*)::int n FROM chat_attachments WHERE id=$1',[image.id])).rows[0].n,1);
   const two=(await upload()).attachment;
   assert.equal((await call(path,{method:'PATCH',body:{theme:{preset:'ocean',wallpaperAttachmentId:two.id}}})).status,200);
   await cleanupChatAttachments(pool,{remove:async key=>removed.push(key)});
   assert.equal((await pool.query('SELECT count(*)::int n FROM chat_attachments WHERE id=$1',[image.id])).rows[0].n,0,'Replacing a background releases an aged orphan to GC');
   assert.equal(removed.length,1);
   await pool.query("UPDATE chat_attachments SET created_at=now()-interval '48 hours' WHERE id=$1",[two.id]);
   assert.equal((await call(path,{method:'PATCH',body:{theme:{preset:'nature',wallpaperAttachmentId:null}}})).status,200);
   await cleanupChatAttachments(pool,{remove:async key=>removed.push(key)});
   assert.equal((await pool.query('SELECT count(*)::int n FROM chat_attachments WHERE id=$1',[two.id])).rows[0].n,0,'Reset releases the previous wallpaper');
   // Personal appearance does not require permission to send group messages.
   await pool.query('UPDATE chat_conversation_members SET can_write=false WHERE conversation_id=$1 AND user_id=$2',[group,users[1]]);
   const readonly=await upload(group,users[1]);assert.equal(readonly.status,201,readonly.error);
   assert.equal((await call(path,{method:'PATCH',user:users[1],body:{theme:{preset:'forest',wallpaperAttachmentId:readonly.attachment.id}}})).status,200);
   assert.equal((await call(`/conversations/${group}/attachments?kind=document&purpose=wallpaper&name=file.txt`,{method:'POST',body:Buffer.from('x'),user:users[1]})).status,422);
   assert.equal((await call(`/conversations/${group}/attachments?kind=image&name=field.png`,{method:'POST',body:bytes,user:users[1]})).status,403);
   await call(path,{method:'PATCH',user:users[1],body:{theme:{preset:'nature'}}});
   await pool.query('UPDATE chat_conversation_members SET can_write=true WHERE conversation_id=$1 AND user_id=$2',[group,users[1]]);
 });
 await t.test('location metadata, private media, materials and server-side history search work',async()=>{
   const location=await send(group,{kind:'location',text:'',location:{latitude:51.16,longitude:71.45,label:'Астана',accuracy:12}});assert.equal(location.location.accuracy,12);assert.equal((await call(`/conversations/${group}/materials?type=locations`)).items[0].id,location.id);
   const bytes=await sharp({create:{width:4,height:4,channels:3,background:'#123456'}}).png().toBuffer();photo=(await call(`/conversations/${group}/attachments?kind=image&name=field.png`,{method:'POST',body:bytes})).attachment;
   const image=await send(group,{kind:'image',text:'Растение',attachmentIds:[photo.id]});assert.equal((await call(`/conversations/${group}/materials?type=media`)).items[0].id,image.id);
   await call(`/conversations/${group}/messages/${image.id}/state`,{method:'PATCH',body:{hidden:true}});
   assert.equal((await fetch(origins[0]+photo.url.replace('/api/chat',''),{headers:{'x-user':users[0]}})).status,404);
   assert.equal((await fetch(origins[0]+photo.url.replace('/api/chat',''),{headers:{'x-user':users[1]}})).status,200);
   await call(`/conversations/${group}/messages/${image.id}/state`,{method:'PATCH',body:{hidden:false}});
   // Older than the first page: seed through the same schema, independently of browser state.
   await pool.query("INSERT INTO chat_messages(id,conversation_id,sender_id,client_id,kind,text) SELECT gen_random_uuid(),$1,$2,gen_random_uuid(),'text','Новое сообщение '||n FROM generate_series(1,60) n",[group,users[0]]);
   assert.ok(!(await call(`/conversations/${group}/messages`)).items.some(m=>m.id===first.id));
   assert.equal((await call(`/conversations/${group}/search?q=бидай&sender=${users[0]}`)).items[0].id,first.id);assert.equal((await call(`/conversations/${group}/search?q=бидай`,{user:users[3]})).status,404);
   assert.equal((await call(`/conversations/${group}/materials?type=links`)).items[0].links[0],'https://example.org/seed');
 });
 await t.test('forward retries do not duplicate and attachments get separate private ownership',async()=>{
   const message=(await call(`/conversations/${group}/materials?type=media`)).items[0];const body={messageIds:[message.id],targetConversationId:direct,clientIds:[randomUUID()]};
   const one=await call(`/conversations/${group}/forward`,{method:'POST',body});assert.equal(one.status,200,one.error);const two=await call(`/conversations/${group}/forward`,{method:'POST',body});assert.equal(one.items[0].id,two.items[0].id);assert.notEqual(one.items[0].attachments[0].id,photo.id);
   await call(`/conversations/${group}/messages/${message.id}`,{method:'DELETE'});
   const response=await fetch(origins[0]+one.items[0].attachments[0].url.replace('/api/chat',''),{headers:{'x-user':users[1]}});assert.equal(response.status,200);assert.ok((await response.arrayBuffer()).byteLength>0);
 });
 await t.test('presence privacy opt-in is scoped and hidden read receipts remain real delivery',async()=>{
   assert.deepEqual((await call('/privacy',{user:users[1]})).privacy,{presenceAudience:'nobody',sharePresence:false,shareReadReceipts:true});
   assert.equal((await call('/privacy',{method:'PATCH',user:users[1],body:{sharePresence:true,shareReadReceipts:false}})).status,200);
   assert.equal((await call('/presence',{method:'POST',user:users[1],body:{active:true}})).status,200);
   const presence=await call(`/conversations/${group}/presence`);assert.equal(presence.items.find(p=>p.user.id===users[1]).online,true);assert.equal((await call(`/conversations/${group}/presence`,{user:users[3]})).status,404);
   const sent=await send(direct,{text:'Личная проверка статусов'});await call(`/conversations/${direct}/read`,{method:'POST',user:users[1],body:{sequence:sent.sequence}});
   const receipt=(await call(`/conversations/${direct}/receipts?messageIds=${sent.id}`)).items[0].receipt;assert.equal(receipt.deliveredCount,1);assert.equal(receipt.readCount,0);
   const details=(await call(`/conversations/${direct}/messages/${sent.id}/receipts`)).items[0];assert.equal(details.delivered,true);assert.equal(details.read,false);assert.equal(details.readPrivate,true);
   await call('/privacy',{method:'PATCH',user:users[1],body:{sharePresence:false}});const hidden=(await call(`/conversations/${group}/presence`)).items.find(p=>p.user.id===users[1]);assert.deepEqual([hidden.visible,hidden.online,hidden.lastSeen],[false,false,null]);
   assert.equal((await call(`/conversations/${direct}/messages/${sent.id}/receipts`,{user:users[1]})).status,403);
 });
 await t.test('owner leave offers atomic transfer, removes all API/media access and updates others',async()=>{
   assert.equal((await call(`/groups/${group}/leave`,{method:'POST',body:{}})).status,422);
   assert.equal((await call(`/groups/${group}/leave`,{method:'POST',body:{transferToUserId:users[1]}})).status,200);
   assert.equal((await call(`/conversations/${group}`)).status,404);assert.equal((await call(`/conversations/${group}/search?q=бидай`)).status,404);assert.equal((await call(`/conversations/${group}/messages`,{method:'POST',body:{kind:'text',clientId:randomUUID(),text:'Бывший участник'}})).status,404);
   const other=await call(`/conversations/${group}`,{user:users[1]});assert.equal(other.conversation.role,'owner');assert.equal(other.conversation.group.memberCount,2);assert.equal(other.conversation.lastMessage.system.type,'left');
   const avatarBytes=await sharp({create:{width:4,height:4,channels:3,background:'#567845'}}).png().toBuffer();
   const avatar=await call(`/groups/${group}/avatar`,{method:'POST',body:avatarBytes,user:users[1]});assert.equal(avatar.status,200,avatar.error);
   const avatarPath=avatar.conversation.group.avatarUrl.replace('/api/chat','');
   assert.equal((await fetch(origins[0]+avatarPath,{headers:{'x-user':users[3]}})).status,200,'Public active group avatar is visible');
   assert.equal((await call(`/groups/${group}`,{method:'DELETE',user:users[2]})).status,403);assert.equal((await call(`/groups/${group}`,{method:'DELETE',user:users[1]})).status,200);assert.equal((await call(`/conversations/${group}`,{user:users[1]})).status,404);assert.equal((await call(`/groups/${group}/join`,{method:'POST',body:{},user:users[2]})).status,404);
   // Even legacy deleted rows retaining public access cannot bypass membership.
   await pool.query("UPDATE chat_groups SET access='public' WHERE conversation_id=$1",[group]);
   assert.equal((await fetch(origins[0]+avatarPath,{headers:{'x-user':users[3]}})).status,404,'Deleted group avatar URL is revoked');
 });
 }finally{await Promise.all(slots.map(s=>s.service.close()));await Promise.all(servers.map(s=>new Promise(r=>s.close(r))));await pool.query('DELETE FROM chat_conversations WHERE id=ANY($1::uuid[])',[ids]);await pool.query('DELETE FROM chat_presence_leases WHERE user_id=ANY($1::text[])',[users]);await pool.query('DELETE FROM chat_privacy WHERE user_id=ANY($1::text[])',[users]);await pool.end();db.close();await rm(dataDir,{recursive:true,force:true});}
});
