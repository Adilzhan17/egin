import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {Pool} from 'pg';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import sharp from 'sharp';
import {installChat} from '../src/chat/index.mjs';
import {validateMessage,validateGroup} from '../src/chat/validation.mjs';
import {migrateMarket} from '../src/market/migrations.mjs';

test('Chat validates message shape, location, limits and group permissions input',()=>{
  assert.throws(()=>validateMessage({clientId:randomUUID(),kind:'text',text:' '.repeat(3)}));
  assert.throws(()=>validateMessage({clientId:randomUUID(),kind:'text',text:'x'.repeat(4001)}));
  assert.throws(()=>validateMessage({clientId:randomUUID(),kind:'image',attachmentIds:Array.from({length:11},randomUUID)}));
  assert.throws(()=>validateMessage({clientId:randomUUID(),kind:'location',location:{latitude:100,longitude:20}}));
  assert.throws(()=>validateGroup({name:'',category:'crops',access:'public'}));
  assert.throws(()=>validateGroup({name:'Группа',category:'invented',access:'public'}));
  assert.equal(validateMessage({clientId:randomUUID(),kind:'text',text:' Бидай\nПшеница '}).text,'Бидай\nПшеница');
});

test('Chat unavailable storage preserves unrelated endpoints',async()=>{
  const app=express();app.get('/other',(_,res)=>res.json({ok:true}));const service=installChat({app,db:null,required:(_,res)=>res.sendStatus(401),wrap:f=>(req,res,next)=>Promise.resolve(f(req,res)).catch(next),dataDir:tmpdir(),databaseUrl:''});const server=app.listen(0);await new Promise(r=>server.once('listening',r));try{assert.equal((await fetch(`http://localhost:${server.address().port}/api/chat/health`)).status,503);assert.equal((await fetch(`http://localhost:${server.address().port}/other`)).status,200);}finally{await new Promise(r=>server.close(r));await service.close();}
});

test('Chat real PostgreSQL delivery, privacy, membership, groups and cross-slot realtime',{skip:!process.env.CHAT_TEST_DATABASE_URL},async t=>{
  const databaseUrl=process.env.CHAT_TEST_DATABASE_URL,pool=new Pool({connectionString:databaseUrl}),dataDir=await mkdtemp(tmpdir()+'/egin-chat-'),db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT);CREATE TABLE sessions(id TEXT PRIMARY KEY,user_id TEXT,expires INTEGER);CREATE TABLE subscriptions(user_id TEXT,endpoint TEXT,data TEXT);');
  const users=[randomUUID(),randomUUID(),randomUUID()],sessions=new Map();
  for(let i=0;i<users.length;i++){db.prepare('INSERT INTO users VALUES(?,?)').run(users[i],['Айдар','Алия','Серик'][i]);const sid=randomUUID();sessions.set(users[i],sid);db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(sid).digest('hex'),users[i],Date.now()+60000);}
  function make(){const app=express();app.use(express.json());app.use((req,res,next)=>{const id=req.headers['x-test-user'];if(users.includes(id)){req.user={id};req.sid=sessions.get(id);}next();});const service=installChat({app,db,dataDir,databaseUrl,required:(req,res,next)=>req.user?next():res.status(401).json({error:'Войдите'}),wrap:f=>(req,res,next)=>Promise.resolve(f(req,res)).catch(next)});app.use((err,req,res,next)=>{if(!err.status)console.error(err);res.status(err.status||500).json({error:err.message});});return{app,service};}
  const first=make(),second=make();assert.equal(await first.service.ready,true);assert.equal(await second.service.ready,true);const a=first.app.listen(0,'127.0.0.1'),b=second.app.listen(0,'127.0.0.1');await Promise.all([a,b].map(s=>new Promise(r=>s.once('listening',r))));const base=`http://127.0.0.1:${a.address().port}/api/chat`,other=`http://127.0.0.1:${b.address().port}/api/chat`;
  async function call(path,{method='GET',body,user=users[0],origin=base}={}){const r=await fetch(origin+path,{method,headers:{...(user?{'x-test-user':user}:{}),...(body?{'Content-Type':Buffer.isBuffer(body)?'application/octet-stream':'application/json'}:{})},body:body?(Buffer.isBuffer(body)?body:JSON.stringify(body)):undefined});return{status:r.status,...await r.json()};}
  let direct,group,privateGroup,msg,photo;
  try{
    await t.test('authentication, exact users and idempotent direct creation',async()=>{
      assert.equal((await call('/conversations',{user:null})).status,401);assert.equal((await call('/health',{user:null})).status,200);
      const found=await call('/users?q='+encodeURIComponent('Алия'));assert.deepEqual(found.items,[{id:users[1],name:'Алия'}]);assert.equal((await call('/users?q=А')).items.length,0);
      assert.deepEqual((await call('/users?q='+encodeURIComponent('алия'))).items,found.items);
      const results=await Promise.all(Array.from({length:3},()=>call('/conversations',{method:'POST',body:{kind:'direct',userId:users[1]}})));assert.ok(results.every(r=>r.status===201));assert.equal(new Set(results.map(r=>r.conversation.id)).size,1);direct=results[0].conversation.id;
      assert.equal((await call(`/conversations/${direct}`,{user:users[2]})).status,404);
      assert.equal((await call(`/conversations/${direct}/messages`,{user:users[2]})).status,404);
      assert.equal((await call('/conversations',{method:'POST',body:{kind:'market',listingId:randomUUID()}})).status,404);
    });
    await t.test('concurrent send deduplication, reply scope, receipts, edit/delete',async()=>{
      const body={clientId:randomUUID(),kind:'text',text:'Пшеница Бидай <script>alert(1)</script>'};const values=await Promise.all(Array.from({length:4},()=>call(`/conversations/${direct}/messages`,{method:'POST',body})));assert.deepEqual(values.map(v=>v.status).sort(),[200,200,200,201]);assert.equal(new Set(values.map(v=>v.message.id)).size,1);msg=values[0].message;
      assert.equal((await call(`/conversations/${direct}`,{user:users[1]})).conversation.unreadCount,1);
      assert.equal((await call(`/conversations/${direct}/read`,{method:'POST',body:{sequence:msg.sequence},user:users[1]})).status,200);
      assert.equal((await call(`/conversations/${direct}`,{user:users[1]})).conversation.unreadCount,0);
      const history=(await call(`/conversations/${direct}/messages`)).items;assert.equal(history.length,1);assert.equal(history[0].readByCount,1);assert.equal(history[0].text,body.text);
      assert.equal((await call(`/conversations/${direct}/read`,{method:'POST',body:{sequence:999999999}})).status,422);
      const reply=await call(`/conversations/${direct}/messages`,{method:'POST',body:{clientId:randomUUID(),kind:'text',text:'Цена?',replyToMessageId:msg.id},user:users[1]});assert.equal(reply.message.replyTo.id,msg.id);
      assert.equal((await call(`/conversations/${direct}/messages/${msg.id}`,{method:'PATCH',body:{text:'Чужое'},user:users[1]})).status,403);
      assert.equal((await call(`/conversations/${direct}/messages/${msg.id}`,{method:'PATCH',body:{text:'Пшеница обновлена'}})).message.text,'Пшеница обновлена');
      assert.equal((await call('/search?q='+encodeURIComponent('Пшеница'),{user:users[2]})).messages.length,0);
      assert.equal((await call('/search?q='+encodeURIComponent('Пшеница'),{user:users[1]})).messages.length,1);
    });
    await t.test('pending image private, safe optimization, attach ownership and tombstone denial',async()=>{
      const bytes=await sharp({create:{width:2400,height:1200,channels:3,background:'#24513c'}}).jpeg().withMetadata({exif:{IFD0:{Artist:'PRIVATE'}}}).toBuffer();
      const uploaded=await call(`/conversations/${direct}/attachments?kind=image&name=photo.jpg`,{method:'POST',body:bytes});assert.equal(uploaded.status,201,uploaded.error);photo=uploaded.attachment;
      const fetchPhoto=user=>fetch(new URL(photo.url,base),{headers:{'x-test-user':user}});
      assert.equal((await fetchPhoto(users[1])).status,404);assert.equal((await fetchPhoto(users[2])).status,404);
      assert.equal((await call(`/conversations/${direct}/messages`,{method:'POST',body:{clientId:randomUUID(),kind:'image',attachmentIds:[photo.id]},user:users[1]})).status,422);
      const sent=await call(`/conversations/${direct}/messages`,{method:'POST',body:{clientId:randomUUID(),kind:'image',attachmentIds:[photo.id]}});assert.equal(sent.status,201,sent.error);
      const file=await fetchPhoto(users[1]);assert.equal(file.status,200);assert.equal(file.headers.get('cache-control'),'private, no-store');const metadata=await sharp(Buffer.from(await file.arrayBuffer())).metadata();assert.equal(metadata.format,'webp');assert.equal(metadata.exif,undefined);assert.ok(metadata.width<=1800);
      const stored=(await pool.query('SELECT storage_key FROM chat_attachments WHERE id=$1',[photo.id])).rows[0];
      assert.equal((await call(`/conversations/${direct}/messages/${sent.message.id}`,{method:'DELETE'})).message.attachments.length,0);assert.equal((await fetchPhoto(users[1])).status,404);
      assert.equal((await pool.query('SELECT 1 FROM chat_attachments WHERE id=$1',[photo.id])).rowCount,0);
      await assert.rejects(access(`${dataDir}/chat-attachments/${stored.storage_key}`));
      assert.equal((await call(`/conversations/${direct}/attachments?kind=image&name=bad.png`,{method:'POST',body:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')})).status,422);
    });
    await t.test('groups public/private, join, admin boundaries and bans',async()=>{
      group=(await call('/groups',{method:'POST',body:{name:'Агрономы теста',description:'Тестовая группа',category:'agronomy',region:'Костанай',access:'public'}})).conversation.id;
      privateGroup=(await call('/groups',{method:'POST',body:{name:'Закрытые агрономы',category:'agronomy',access:'private'}})).conversation.id;
      assert.equal((await call(`/groups/${privateGroup}/join`,{method:'POST',body:{},user:users[1]})).status,403);
      assert.equal((await call('/communities',{user:users[1]})).items.some(v=>v.id===privateGroup),false);
      assert.equal((await call(`/groups/${group}/join`,{method:'POST',body:{},user:users[1]})).conversation.group.memberCount,2);
      assert.equal((await call(`/groups/${group}`,{method:'PATCH',body:{name:'Захват'},user:users[1]})).status,403);
      assert.equal((await call(`/groups/${group}/members/${users[1]}`,{method:'PATCH',body:{canWrite:false}})).status,200);
      assert.equal((await call(`/conversations/${group}/messages`,{method:'POST',body:{clientId:randomUUID(),kind:'text',text:'Запрещено'},user:users[1]})).status,403);
      assert.equal((await call(`/groups/${group}/members/${users[1]}`,{method:'PATCH',body:{role:'admin',canWrite:true}})).status,200);
      assert.equal((await call(`/groups/${group}/members/${users[0]}`,{method:'PATCH',body:{canWrite:false},user:users[1]})).status,403);
      assert.equal((await call(`/groups/${group}/members`,{method:'POST',body:{userId:users[2]},user:users[1]})).status,200);
      assert.equal((await call(`/groups/${group}/members/${users[2]}`,{method:'PATCH',body:{role:'admin'},user:users[1]})).status,403);
      assert.equal((await call(`/groups/${group}/members/${users[2]}`,{method:'DELETE',user:users[1]})).status,200);
      assert.equal((await call(`/groups/${group}/join`,{method:'POST',body:{},user:users[2]})).status,403);
      assert.equal((await call(`/conversations/${group}/messages`,{user:users[2]})).status,404);
      assert.equal((await call(`/groups/${group}/leave`,{method:'POST',body:{}})).status,422);
      assert.equal((await call(`/conversations/${group}/messages`,{method:'POST',body:{clientId:randomUUID(),kind:'text',text:'Ответ',replyToMessageId:msg.id}})).status,422);
    });
    await t.test('delete for all is authorized, idempotent and reconciles missed cross-slot events without leaked quotes',async()=>{
      const send=(text,extra={},user=users[0])=>call(`/conversations/${group}/messages`,{method:'POST',body:{clientId:randomUUID(),kind:'text',text,...extra},user});
      const anchor=(await send('Предыдущее сообщение')).message;
      const target=(await send('PRIVATE-DELETED-CONTENT')).message;
      const reply=(await send('Ответ остаётся',{replyToMessageId:target.id},users[1])).message;
      assert.equal(reply.replyTo.text,'PRIVATE-DELETED-CONTENT');
      await call(`/groups/${group}/members/${users[1]}`,{method:'PATCH',body:{role:'member'}});
      assert.equal((await call(`/conversations/${group}/messages/${target.id}`,{method:'DELETE',user:users[1]})).status,403);
      assert.equal((await call(`/conversations/${group}/messages/${target.id}`,{method:'DELETE',user:users[2]})).status,404);
      await call(`/groups/${group}/members/${users[1]}`,{method:'PATCH',body:{role:'admin'}});
      const unread=(await call(`/conversations/${group}`,{user:users[1]})).conversation.unreadCount;
      const abort=new AbortController(),response=await fetch(other+'/events',{headers:{'x-test-user':users[0]},signal:abort.signal}),reader=response.body.getReader();
      let eventText=new TextDecoder().decode((await reader.read()).value);
      const timer=setTimeout(()=>abort.abort(),5000);
      let removed;
      try{
        removed=await call(`/conversations/${group}/messages/${target.id}`,{method:'DELETE',user:users[1]});
        assert.equal(removed.status,200,removed.error);
        while(!/event: message\.deleted\ndata: [^\n]+\n\nevent: change\ndata: [^\n]+\n\n/.test(eventText))eventText+=new TextDecoder().decode((await reader.read()).value);
        const event=JSON.parse(eventText.split('event: message.deleted\ndata: ')[1].split('\n')[0]);
        assert.deepEqual(event,{conversationId:group,messageId:target.id,deletedAt:removed.message.deletedAt});
        const compatible=JSON.parse(eventText.split('event: message.deleted\ndata: ')[1].split('event: change\ndata: ')[1].split('\n')[0]);
        assert.deepEqual(compatible,{...event,type:'deleted'});
        assert.ok(!eventText.includes('PRIVATE-DELETED-CONTENT'));
      }finally{clearTimeout(timer);abort.abort();}
      const repeated=await call(`/conversations/${group}/messages/${target.id}`,{method:'DELETE',user:users[1]});
      assert.equal(repeated.message.deletedAt,removed.message.deletedAt);
      for(const user of users.slice(0,2)){
        const history=await call(`/conversations/${group}/messages`,{user});
        const tombstone=history.items.find(row=>row.id===target.id);
        assert.equal(tombstone.text,'');assert.deepEqual(tombstone.attachments,[]);assert.equal(tombstone.replyTo,null);
        assert.equal(history.items.find(row=>row.id===reply.id).replyTo,null);
        assert.ok(!JSON.stringify(history).includes('PRIVATE-DELETED-CONTENT'));
      }
      assert.equal((await call(`/conversations/${group}`,{user:users[1]})).conversation.unreadCount,unread-1);
      const reconciliation=await call(`/conversations/${group}/messages?after=${reply.sequence}&reconcile=${target.id},${reply.id},${msg.id}`,{user:users[1],origin:other});
      assert.deepEqual(reconciliation.items,[]);assert.deepEqual(reconciliation.deletedIds,[target.id]);
      assert.equal((await call(`/conversations/${group}/messages?reconcile=invalid`)).status,400);
      assert.equal((await call(`/conversations/${group}/messages?reconcile=${Array(101).fill(target.id).join(',')}`)).status,400);
      assert.equal((await send('Новый ответ недоступен',{replyToMessageId:target.id})).status,422);
      assert.equal((await call(`/conversations/${group}/messages/${reply.id}`,{method:'DELETE',user:users[1]})).status,200);
      assert.equal((await call(`/conversations/${group}`)).conversation.lastMessage.id,anchor.id);
      await call(`/conversations/${group}/messages/${anchor.id}`,{method:'DELETE'});
      const empty=(await call(`/conversations/${group}`,{user:users[1]})).conversation;
      assert.ok(empty.lastMessage?.system,'Membership service events survive deletion of user messages');assert.equal(empty.unreadCount,0);
      assert.equal((await call('/search?q=PRIVATE-DELETED-CONTENT')).messages.length,0);
      assert.equal((await pool.query('SELECT text,reply_to_message_id FROM chat_messages WHERE id=$1',[target.id])).rows[0].text,'');
    });
    await t.test('real audio upload persists signal-derived peaks and old audio remains compatible',{skip:!process.env.CHAT_MEDIA_TESTS},async()=>{
      // First second is silent, the second contains a real sine wave.
      const rate=8000,count=rate*2,wav=Buffer.alloc(44+count*2);
      wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(count*2,40);
      for(let i=rate;i<count;i++)wav.writeInt16LE(Math.round(12000*Math.sin(i/rate*440*Math.PI*2)),44+i*2);
      const uploaded=await call(`/conversations/${direct}/attachments?kind=audio&name=voice.wav`,{method:'POST',body:wav});
      assert.equal(uploaded.status,201,uploaded.error);const audio=uploaded.attachment;
      assert.equal(audio.mimeType,'audio/mp4');assert.equal(audio.waveform.length,40);
      assert.ok(audio.waveform.every(value=>Number.isFinite(value)&&value>=0&&value<=1));
      assert.ok(audio.waveform.slice(0,15).every(value=>value<0.02));assert.ok(audio.waveform.slice(25).every(value=>value>0.8));
      assert.deepEqual((await pool.query('SELECT waveform FROM chat_attachments WHERE id=$1',[audio.id])).rows[0].waveform,audio.waveform);
      const sent=await call(`/conversations/${direct}/messages`,{method:'POST',body:{clientId:randomUUID(),kind:'audio',attachmentIds:[audio.id]}});
      assert.equal(sent.status,201,sent.error);assert.deepEqual(sent.message.attachments[0].waveform,audio.waveform);
      await pool.query('UPDATE chat_attachments SET waveform=NULL WHERE id=$1',[audio.id]);
      const old=(await call(`/conversations/${direct}/messages`)).items.find(row=>row.id===sent.message.id).attachments[0];
      assert.equal(old.waveform,undefined);assert.ok(old.duration>0);
      await call(`/conversations/${direct}/messages/${sent.message.id}`,{method:'DELETE'});
    });
    await t.test('recommendations preference reasons and hidden/excluded topics',async()=>{
      assert.equal((await call('/preferences',{method:'PATCH',body:{region:'Костанай',interests:['agronomy'],excludedCategories:[]},user:users[2]})).status,200);
      const extra=(await call('/groups',{method:'POST',body:{name:'Новая агрономия',category:'agronomy',region:'Костанай',access:'public'}})).conversation;
      const found=(await call('/recommendations',{user:users[2]})).items.find(r=>r.id===extra.id);assert.equal(found.reason,'По вашему региону');
      assert.equal((await call(`/recommendations/${extra.id}/hide`,{method:'POST',body:{},user:users[2]})).status,200);
      assert.equal((await call('/recommendations',{user:users[2]})).items.some(r=>r.id===extra.id),false);
      assert.equal((await call('/preferences',{method:'PATCH',body:{excludedCategories:['agronomy']},user:users[2]})).status,200);
      assert.ok((await call('/recommendations',{user:users[2]})).items.every(r=>r.category!=='agronomy'));
    });
    await t.test('block prevents both directions, reports are membership scoped',async()=>{
      assert.equal((await call('/blocks',{method:'POST',body:{userId:users[1]}})).status,200);
      for(const user of users.slice(0,2))assert.equal((await call(`/conversations/${direct}/messages`,{method:'POST',body:{clientId:randomUUID(),kind:'text',text:'Нет'},user})).status,403);
      assert.equal((await call('/blocks')).items[0].id,users[1]);assert.equal((await call(`/conversations/${direct}`)).conversation.blocked,true);
      assert.equal((await call('/reports',{method:'POST',body:{targetType:'message',targetId:msg.id,reason:'spam'},user:users[2]})).status,404);
      assert.equal((await call('/reports',{method:'POST',body:{targetType:'message',targetId:msg.id,reason:'spam'},user:users[1]})).status,201);
      await call(`/blocks/${users[1]}`,{method:'DELETE'});
    });
    await t.test('cross-slot SSE scoped hints contain no private content',async()=>{
      const abort=new AbortController(),response=await fetch(other+'/events',{headers:{'x-test-user':users[1]},signal:abort.signal}),reader=response.body.getReader();let data=new TextDecoder().decode((await reader.read()).value);assert.match(data,/event: ready/);
      const result=await call(`/conversations/${direct}/messages`,{method:'POST',body:{clientId:randomUUID(),kind:'text',text:'SECRET-PRIVATE-MESSAGE'}});assert.equal(result.status,201,result.error);
      const timeout=setTimeout(()=>abort.abort(),5000);try{while(!data.includes('event: change')){data+=new TextDecoder().decode((await reader.read()).value);}assert.match(data,new RegExp(direct));assert.ok(!data.includes('SECRET-PRIVATE-MESSAGE'));}finally{clearTimeout(timeout);abort.abort();}
    });
    await t.test('history keyset pagination, monotonic reads and cross-conversation idempotency',async()=>{
      for(let i=0;i<60;i++)await pool.query("INSERT INTO chat_messages(id,conversation_id,sender_id,client_id,kind,text) VALUES($1,$2,$3,$4,'text',$5)",[randomUUID(),direct,users[1],randomUUID(),`История ${i}`]);
      const page=(await call(`/conversations/${direct}/messages`));assert.equal(page.items.length,50);assert.equal(page.hasMore,true);assert.ok(page.items.every((v,i,a)=>i===0||v.sequence>a[i-1].sequence));
      const previous=await call(`/conversations/${direct}/messages?before=${page.items[0].sequence}`);assert.ok(previous.items.length>0);assert.ok(previous.items.every(v=>v.sequence<page.items[0].sequence));
      const after=await call(`/conversations/${direct}/messages?after=${previous.items.at(-1).sequence}`);assert.equal(after.items[0].id,page.items[0].id);
      for(const sequence of [page.items.at(-1).sequence,page.items[0].sequence])assert.equal((await call(`/conversations/${direct}/read`,{method:'POST',body:{sequence}})).status,200);
      assert.equal((await call(`/conversations/${direct}`)).conversation.unreadCount,0);
      const clientId=randomUUID(),results=await Promise.all([direct,group].map(id=>call(`/conversations/${id}/messages`,{method:'POST',body:{clientId,kind:'text',text:'Однократная отправка'}})));assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
    });
    await t.test('Market adapter never exposes drafts or archived content',async()=>{
      await migrateMarket(pool);const id=randomUUID();await pool.query("INSERT INTO market_listings(id,owner_id,title,status) VALUES($1,$2,'PRIVATE DRAFT','draft')",[id,users[1]]);
      try{
        assert.equal((await call(`/listings/${id}`)).status,404);assert.equal((await call('/conversations',{method:'POST',body:{kind:'market',listingId:id}})).status,404);
        await pool.query("UPDATE market_listings SET title='Пшеница',status='published',published_at=now() WHERE id=$1",[id]);const created=await call('/conversations',{method:'POST',body:{kind:'market',listingId:id}});assert.equal(created.status,201,created.error);assert.equal(created.conversation.listing.title,'Пшеница');
        await pool.query("UPDATE market_listings SET title='PRIVATE ARCHIVED CHANGE',status='archived' WHERE id=$1",[id]);const archived=await call(`/conversations/${created.conversation.id}`);assert.equal(archived.conversation.listing.status,'archived');assert.ok(!JSON.stringify(archived).includes('PRIVATE'));
        assert.equal((await call(`/listings/${id}`,{user:users[2]})).status,404);
        await pool.query('DELETE FROM market_listings WHERE id=$1',[id]);assert.equal((await call(`/conversations/${created.conversation.id}`)).conversation.listing.status,'deleted');
      }finally{await pool.query('DELETE FROM market_listings WHERE id=$1',[id]);}
    });
    await t.test('revoked membership closes stream across slots; removed users lose files and history',async()=>{
      const response=await fetch(other+'/events',{headers:{'x-test-user':users[1]}}),reader=response.body.getReader();await reader.read();
      assert.equal((await call(`/groups/${group}/members/${users[1]}`,{method:'DELETE'})).status,200);
      let data='',ended=false;const timer=setTimeout(()=>void reader.cancel(),5000);try{while(!ended){const next=await reader.read();ended=next.done;if(next.value)data+=new TextDecoder().decode(next.value);}assert.match(data,/revoked/);assert.match(data,new RegExp(group));}finally{clearTimeout(timer);}
      assert.equal((await call(`/conversations/${group}/messages`,{user:users[1]})).status,404);
    });
    await t.test('ownership transfer is atomic and previous owner can leave',async()=>{
      assert.equal((await call(`/groups/${privateGroup}/members`,{method:'POST',body:{userId:users[2]}})).status,200);
      assert.equal((await call(`/groups/${privateGroup}/members/${users[2]}`,{method:'PATCH',body:{role:'owner'}})).status,200);
      const members=(await call(`/conversations/${privateGroup}/members`)).items;assert.equal(members.filter(m=>m.role==='owner').length,1);assert.equal(members.find(m=>m.id===users[2]).role,'owner');
      assert.equal((await call(`/groups/${privateGroup}/leave`,{method:'POST',body:{}})).status,200);
      assert.equal((await call(`/conversations/${privateGroup}`)).status,404);
    });
    await t.test('session revocation closes existing SSE before any further private hint',async()=>{
      const response=await fetch(other+'/events',{headers:{'x-test-user':users[1]}}),reader=response.body.getReader();await reader.read();
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(users[1]);
      assert.equal((await call(`/conversations/${direct}/messages`,{method:'POST',body:{clientId:randomUUID(),kind:'text',text:'После выхода'}})).status,201);
      let data='',ended=false;const timer=setTimeout(()=>void reader.cancel(),5000);try{while(!ended){const next=await reader.read();ended=next.done;if(next.value)data+=new TextDecoder().decode(next.value);}assert.ok(!data.includes(direct));}finally{clearTimeout(timer);}
    });
  }finally{
    await Promise.all([first.service.close(),second.service.close()]);await Promise.all([a,b].map(s=>new Promise(r=>s.close(r))));await pool.query('DELETE FROM chat_conversations WHERE id IN(SELECT conversation_id FROM chat_conversation_members WHERE user_id=ANY($1::text[]))',[users]);for(const table of ['chat_user_preferences','chat_user_blocks','chat_hidden_recommendations'])await pool.query(`DELETE FROM ${table} WHERE user_id=ANY($1::text[])`,[users]);await pool.query('DELETE FROM chat_reports WHERE reporter_id=ANY($1::text[])',[users]);await pool.end();db.close();await rm(dataDir,{recursive:true,force:true});
  }
});
