import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {Pool} from 'pg';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {installChat} from '../src/chat/index.mjs';
const run=promisify(execFile);
test('Video notes: real PostgreSQL, ffmpeg, private thumbnails, flags, two users and slots', {skip:!process.env.CHAT_TEST_DATABASE_URL||!process.env.CHAT_MEDIA_TESTS},async t=>{
 const pool=new Pool({connectionString:process.env.CHAT_TEST_DATABASE_URL}),db=new DatabaseSync(':memory:'),dataDir=await mkdtemp(tmpdir()+'/egin-video-notes-');
 db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT);CREATE TABLE sessions(id TEXT PRIMARY KEY,user_id TEXT,expires INTEGER);CREATE TABLE subscriptions(user_id TEXT,endpoint TEXT,data TEXT);');
 const users=Array.from({length:3},randomUUID),sessions=new Map(),ids=[];let enabled=true,limit=60;
 const platform={ready:Promise.resolve(true),getVideoNoteMaxSeconds:async()=>limit,requireFeature:async(c,user,key)=>{assert.equal(key,'chat.video_notes');if(!enabled)throw Object.assign(new Error('Видеозаметки отключены'),{status:403});}};
 users.forEach((id,i)=>{const sid=randomUUID();sessions.set(id,sid);db.prepare('INSERT INTO users VALUES(?,?)').run(id,['Камера','Получатель','Посторонний'][i]);db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(sid).digest('hex'),id,Date.now()+300000);});
 const slots=Array.from({length:2},()=>{const app=express();app.use(express.json());app.use((req,res,next)=>{const id=req.headers['x-user'];if(users.includes(id)){req.user={id};req.sid=sessions.get(id);}next();});const service=installChat({app,db,dataDir,platform,databaseUrl:process.env.CHAT_TEST_DATABASE_URL,required:(req,res,next)=>req.user?next():res.sendStatus(401),wrap:fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next)});app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));return{app,service};});
 await Promise.all(slots.map(async s=>assert.equal(await s.service.ready,true)));
 const servers=slots.map(s=>s.app.listen(0,'127.0.0.1'));await Promise.all(servers.map(s=>new Promise(r=>s.once('listening',r))));const origins=servers.map(s=>`http://127.0.0.1:${s.address().port}`);
 async function call(path,{user=users[0],method='GET',body,slot=0}={}){const r=await fetch(origins[slot]+'/api/chat'+path,{method,headers:{'x-user':user,...(body?{'Content-Type':Buffer.isBuffer(body)?'application/octet-stream':'application/json'}:{})},body:body?(Buffer.isBuffer(body)?body:JSON.stringify(body)):undefined});return{status:r.status,...await r.json()};}
 async function asset(url,user=users[1]){return fetch(origins[1]+url,{headers:{'x-user':user}});}
 async function makeVideo(name,duration,live=false){const path=dataDir+'/'+name;await run('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','testsrc2=size=320x240:rate=12','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t',String(duration),'-c:v',live?'libvpx':'libx264','-threads','1','-c:a',live?'libopus':'aac',...(live?['-live','1']:[]),path],{timeout:20000,maxBuffer:1024*1024});return readFile(path);}
 const raw=await makeVideo('note.webm',1,true);let group,direct,attachment,message;
 try{
 group=(await call('/groups',{method:'POST',body:{name:'Видеозаметки тест',category:'crops',access:'private'}})).conversation.id;ids.push(group);
 // Existing private groups explicitly invite a user after creation.
 if((await call(`/conversations/${group}`,{user:users[1]})).status!==200)await call(`/groups/${group}/members`,{method:'POST',body:{userId:users[1]}});
 direct=(await call('/conversations',{method:'POST',body:{kind:'direct',userId:users[1]}})).conversation.id;ids.push(direct);
 await t.test('normalizes real duration-less WebM into bounded square H264/AAC and private thumbnail',async()=>{
   const response=await call(`/conversations/${group}/attachments?kind=video_note&name=note.webm`,{method:'POST',body:raw});assert.equal(response.status,201,response.error);attachment=response.attachment;
   assert.equal(attachment.kind,'video_note');assert.equal(attachment.mimeType,'video/mp4');assert.equal(attachment.width,480);assert.equal(attachment.height,480);assert.ok(attachment.duration>0&&attachment.duration<2);assert.ok(attachment.thumbnailUrl);
   assert.equal((await asset(attachment.url,users[0])).status,200);assert.equal((await asset(attachment.url)).status,404);assert.equal((await asset(attachment.thumbnailUrl)).status,404);
   const thumb=await asset(attachment.thumbnailUrl,users[0]);assert.match(thumb.headers.get('content-type'),/image\/webp/);assert.ok((await thumb.arrayBuffer()).byteLength>100);
 });
 await t.test('group send crosses slots once, persists, retains real receipts and searchable media',async()=>{
   const abort=new AbortController(),r=await fetch(origins[1]+'/api/chat/events',{headers:{'x-user':users[1]},signal:abort.signal}),reader=r.body.getReader();await reader.read();const timeout=setTimeout(()=>abort.abort(),5000);
   try{const body={clientId:randomUUID(),kind:'video_note',text:'Видео поля',attachmentIds:[attachment.id]};const result=await call(`/conversations/${group}/messages`,{method:'POST',body});assert.equal(result.status,201,result.error);message=result.message;
     let output='';while(!output.includes(group))output+=new TextDecoder().decode((await reader.read()).value);
     assert.equal((await call(`/conversations/${group}/messages`,{method:'POST',body,slot:1})).message.id,message.id);
     const persisted=(await call(`/conversations/${group}/messages`,{slot:1,user:users[1]})).items.find(m=>m.id===message.id);assert.equal(persisted.kind,'video_note');assert.equal((await asset(persisted.attachments[0].url)).status,200);assert.equal((await asset(persisted.attachments[0].thumbnailUrl,users[2])).status,404);
     assert.equal((await call(`/conversations/${group}/materials?type=media`,{user:users[1]})).items.some(m=>m.id===message.id),true);
     assert.equal((await call(`/conversations/${group}/search?type=video_note`,{user:users[1]})).items.some(m=>m.id===message.id),true);
     assert.equal(message.receipt.deliveredCount,0);await call(`/conversations/${group}/delivered`,{method:'POST',user:users[1],body:{sequence:message.sequence}});
     const current=(await call(`/conversations/${group}/messages`)).items.find(m=>m.id===message.id);assert.equal(current.receipt.deliveredCount,1);assert.equal(current.receipt.readCount,0);
   }finally{clearTimeout(timeout);abort.abort();}
 });
 await t.test('reactions, replies, saved and forwarding preserve video note and copied thumbnail',async()=>{
   assert.equal((await call(`/conversations/${group}/messages/${message.id}/reaction`,{method:'PUT',user:users[1],body:{emoji:'🌱'}})).message.reactions[0].count,1);
   const reply=await call(`/conversations/${group}/messages`,{method:'POST',user:users[1],body:{clientId:randomUUID(),kind:'text',text:'Вижу поле',replyToMessageId:message.id}});assert.equal(reply.message.replyTo.kind,'video_note');
   const personal=await call(`/conversations/${group}/messages/${message.id}/state`,{method:'PATCH',user:users[1],body:{saved:true}});assert.equal(personal.status,200,personal.error);
   const forwarded=await call(`/conversations/${group}/forward`,{method:'POST',user:users[1],body:{messageIds:[message.id],targetConversationId:direct,clientIds:[randomUUID()]}});assert.equal(forwarded.status,200,forwarded.error);assert.equal(forwarded.items[0].kind,'video_note');assert.equal((await asset(forwarded.items[0].attachments[0].thumbnailUrl)).status,200);
 });
 await t.test('flag blocks upload/send/forward while old reads and idempotent acknowledgements survive',async()=>{
   enabled=false;
   assert.equal((await call(`/conversations/${group}/attachments?kind=video_note`,{method:'POST',body:raw})).status,403);
   assert.equal((await call(`/conversations/${group}/messages`,{method:'POST',body:{clientId:randomUUID(),kind:'video_note',attachmentIds:[attachment.id]}})).status,403);
   assert.equal((await call(`/conversations/${group}/forward`,{method:'POST',body:{messageIds:[message.id],targetConversationId:direct,clientIds:[randomUUID()]}})).status,403);
   assert.equal((await call(`/conversations/${group}/messages`,{user:users[1]})).items.some(m=>m.id===message.id),true);assert.equal((await asset(attachment.url)).status,200);enabled=true;
 });
 await t.test('server rejects invalid, oversized, wrong-owner and over-duration inputs',async()=>{
   assert.equal((await call(`/conversations/${group}/attachments?kind=video_note`,{method:'POST',body:Buffer.from('not a video')})).status,422);
   assert.equal((await call(`/conversations/${group}/attachments?kind=video_note`,{method:'POST',body:Buffer.alloc(15*1024*1024+1)})).status,413);
   assert.equal((await call(`/conversations/${group}/attachments?kind=video_note`,{method:'POST',body:raw,user:users[2]})).status,404);
   limit=10;const long=await makeVideo('long.webm',11,true);const rejected=await call(`/conversations/${group}/attachments?kind=video_note`,{method:'POST',body:long});assert.equal(rejected.status,422,rejected.error);limit=60;
 });
 await t.test('platform notifications cross slots only to intended session without conversation membership',async()=>{
   const abort=new AbortController(),response=await fetch(origins[1]+'/api/chat/events',{headers:{'x-user':users[2]},signal:abort.signal}),reader=response.body.getReader();await reader.read();const timer=setTimeout(()=>abort.abort(),4000);const notificationId=randomUUID();
   try{await pool.query("SELECT pg_notify('egin_chat_change',$1)",[JSON.stringify({type:'platform',targetUser:users[2],notificationId})]);let output='';while(!output.includes('event: platform'))output+=new TextDecoder().decode((await reader.read()).value);assert.equal(JSON.parse(output.split('event: platform\ndata: ')[1].split('\n')[0]).notificationId,notificationId);}finally{clearTimeout(timer);abort.abort();}
 });
 await t.test('delete revokes private original and thumbnail without damaging forwarded copy',async()=>{
   assert.equal((await call(`/conversations/${group}/messages/${message.id}`,{method:'DELETE'})).status,200);
   assert.equal((await asset(attachment.url)).status,404);assert.equal((await asset(attachment.thumbnailUrl)).status,404);
   const forwarded=(await call(`/conversations/${direct}/messages`,{user:users[1]})).items.find(m=>m.kind==='video_note');assert.equal((await asset(forwarded.attachments[0].url)).status,200);
 });
 }finally{await Promise.all(servers.map(s=>new Promise(r=>{s.closeAllConnections();s.close(r);})));await Promise.all(slots.map(s=>s.service.close()));await pool.query('DELETE FROM chat_conversations WHERE id=ANY($1::uuid[])',[ids.filter(Boolean)]);await pool.query('DELETE FROM chat_privacy WHERE user_id=ANY($1::text[])',[users]);await pool.end();db.close();await rm(dataDir,{recursive:true,force:true});}
});
