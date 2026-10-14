import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {Pool} from 'pg';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {installChat} from '../src/chat/index.mjs';
const databaseUrl=process.env.CHAT_TEST_DATABASE_URL;
test('Presence and typing: three users, two API slots, tab leases, audiences and private realtime',{skip:!databaseUrl},async t=>{
 const connection=new URL(databaseUrl),pool=new Pool({connectionString:connection.href});
 const db=new DatabaseSync(':memory:'),dataDir=await mkdtemp(tmpdir()+'/egin-presence-');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT);CREATE TABLE sessions(id TEXT PRIMARY KEY,user_id TEXT,expires INTEGER);CREATE TABLE subscriptions(user_id TEXT,endpoint TEXT,data TEXT);');
 const users=Array.from({length:4},randomUUID),sessions=new Map();users.forEach((u,i)=>{db.prepare('INSERT INTO users VALUES(?,?)').run(u,'Presence '+i);const sid=randomUUID();sessions.set(u,sid);db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(sid).digest('hex'),u,Date.now()+300000);});
 const slots=Array.from({length:2},()=>{const app=express();app.use(express.json());app.use((req,res,next)=>{const id=req.headers['x-user'];if(users.includes(id)){req.user={id};req.sid=sessions.get(id);}next();});const service=installChat({app,db,dataDir,databaseUrl:connection.href,required:(req,res,next)=>req.user?next():res.status(401).json({error:'Login'}),wrap:f=>(req,res,next)=>Promise.resolve(f(req,res)).catch(next)});app.use((e,req,res,next)=>{if(!e.status)console.error(e);res.status(e.status||500).json({error:e.message});});return{app,service};});
 await Promise.all(slots.map(async s=>assert.equal(await s.service.ready,true)));const servers=slots.map(s=>s.app.listen(0,'127.0.0.1'));await Promise.all(servers.map(s=>new Promise(r=>s.once('listening',r))));const origins=servers.map(s=>`http://127.0.0.1:${s.address().port}/api/chat`),controllers=[];
 async function api(path,{user=users[0],body,method=body===undefined?'GET':'POST',slot=0}={}){const r=await fetch(origins[slot]+path,{method,headers:{'x-user':user,...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,...await r.json()};}
 const good=(r,status=200)=>{assert.equal(r.status,status,r.error);return r;};
 async function until(check){for(let i=0;i<100;i++){if(await check())return;await new Promise(r=>setTimeout(r,20));}assert.fail('Realtime state did not converge within 2 seconds');}
 async function stream(user,clientId=randomUUID(),slot=1){const controller=new AbortController();controllers.push(controller);const res=await fetch(origins[slot]+'/events?clientId='+clientId,{headers:{'x-user':user},signal:controller.signal});assert.equal(res.status,200);const events=[];let text='';const reading=(async()=>{try{for await(const part of res.body){text+=new TextDecoder().decode(part);let at;while((at=text.indexOf('\n\n'))>=0){const packet=text.slice(0,at);text=text.slice(at+2);const type=packet.match(/^event: (.+)$/m)?.[1],body=packet.match(/^data: (.+)$/m)?.[1];if(type&&body)events.push({type,...JSON.parse(body)});}}}catch(e){if(e.name!=='AbortError')throw e;}})();await until(()=>events.some(e=>e.type==='ready'));return{clientId,events,close:async()=>{controller.abort();await reading;}};}
 const peer=async(viewer=users[1],id=group)=>good(await api(`/conversations/${id}/presence`,{user:viewer})).items.find(p=>p.user.id===users[0]);let group,direct;
 try{
  group=good(await api('/groups',{body:{name:'Presence group',category:'crops',access:'public'}}),201).conversation.id;for(const user of users.slice(1,3))good(await api(`/groups/${group}/join`,{user,body:{}}));direct=good(await api('/conversations',{body:{kind:'direct',userId:users[1]}}),201).conversation.id;
  await t.test('privacy audiences are backwards compatible and never expose exact hidden timestamps or unrelated presence',async()=>{
   assert.deepEqual(good(await api('/privacy')).privacy,{presenceAudience:'nobody',sharePresence:false,shareReadReceipts:true});assert.equal((await api('/privacy',{method:'PATCH',body:{presenceAudience:'invalid'}})).status,422);assert.equal((await api('/privacy',{method:'PATCH',body:{presenceAudience:'nobody',sharePresence:true}})).status,422);
   good(await api('/privacy',{method:'PATCH',body:{presenceAudience:'all'}}));good(await api('/presence',{body:{active:true}}));assert.equal((await peer()).online,true);assert.equal((await peer(users[2])).online,true);
   good(await api('/privacy',{method:'PATCH',body:{presenceAudience:'interlocutors'}}));assert.equal((await peer()).visible,true);const groupOnly=await peer(users[2]);assert.deepEqual([groupOnly.visible,groupOnly.online,groupOnly.lastSeen,groupOnly.onlineUntil],[false,false,null,null]);assert.equal(groupOnly.status,'recently');
   good(await api('/privacy',{method:'PATCH',body:{presenceAudience:'nobody'}}));const hidden=await peer();assert.deepEqual([hidden.visible,hidden.online,hidden.lastSeen,hidden.onlineUntil],[false,false,null,null]);assert.equal((await api(`/conversations/${group}/presence`,{user:users[3]})).status,404);
   good(await api('/privacy',{method:'PATCH',body:{sharePresence:true}}));assert.equal(good(await api('/privacy')).privacy.presenceAudience,'all');
   for(const path of ['/users?q=Presence','/search?q=Presence',`/conversations/${group}/members`]){const body=await api(path,{user:users[1]});assert.ok(!JSON.stringify(body).includes('lastSeen'));assert.ok(!JSON.stringify(body).includes('onlineUntil'));}
   good(await api('/presence',{body:{active:false}}));
  });
  await t.test('a socket alone is not online; individual tab closure and reconnect do not erase another live tab',async()=>{
   const a=await stream(users[0],randomUUID(),0),b=await stream(users[0]);assert.equal((await peer()).online,false,'Open SSE alone must not fake activity');
   good(await api('/presence',{body:{active:true,clientId:a.clientId}}));good(await api('/presence',{body:{active:true,clientId:b.clientId},slot:1}));assert.equal((await peer()).online,true);
   await a.close();await until(async()=>!(await pool.query('SELECT online_until>now() live FROM chat_presence_leases WHERE user_id=$1 AND client_id=$2',[users[0],a.clientId])).rows[0]?.live);assert.equal((await peer()).online,true,'Second tab remains active');
   const replacement=await stream(users[0],b.clientId,0);good(await api('/presence',{body:{active:true,clientId:b.clientId}}));await b.close();assert.equal((await peer()).online,true,'Old stream cleanup must not revoke replacement generation');
   await replacement.close();await until(async()=>!(await peer()).online);
  });
  await t.test('silent heartbeat expiry is authoritative and privacy-hidden heartbeats emit no presence timing signal',async()=>{
   good(await api('/presence',{body:{active:true}}));await pool.query("UPDATE chat_privacy SET online_until=now()-interval '1 second' WHERE user_id=$1",[users[0]]);await pool.query("UPDATE chat_presence_leases SET online_until=now()-interval '1 second' WHERE user_id=$1",[users[0]]);assert.equal((await peer()).online,false);
   const observer=await stream(users[1]);good(await api('/privacy',{method:'PATCH',body:{presenceAudience:'nobody'}}));await until(()=>observer.events.some(e=>e.type==='privacy'));observer.events.length=0;good(await api('/presence',{body:{active:true}}));
   // Marker travels over the same LISTEN/NOTIFY channel after the tested heartbeat.
   good(await api(`/conversations/${direct}/activity`,{body:{state:'typing'}}));await until(()=>observer.events.some(e=>e.type==='activity'&&e.state==='typing'));assert.equal(observer.events.filter(e=>e.type==='presence').length,0);await observer.close();
  });
  await t.test('typing crosses API slots, stops on send, hides blocked group peers and refuses former members',async()=>{
   const b=await stream(users[1]),c=await stream(users[2]);good(await api(`/conversations/${group}/activity`,{body:{state:'typing'}}));await until(()=>b.events.some(e=>e.type==='activity'&&e.state==='typing'));await until(()=>c.events.some(e=>e.type==='activity'&&e.state==='typing'));
   good(await api(`/conversations/${group}/messages`,{body:{clientId:randomUUID(),kind:'text',text:'Actual message clears typing'}}),201);await until(()=>b.events.some(e=>e.type==='activity'&&e.state===null));
   good(await api('/blocks',{user:users[2],body:{userId:users[0]}}));await until(()=>c.events.some(e=>e.type==='blocked'));c.events.length=0;good(await api(`/conversations/${group}/activity`,{body:{state:'recording'}}));await until(()=>b.events.some(e=>e.type==='activity'&&e.state==='recording'));
   good(await api(`/conversations/${group}/activity`,{user:users[1],body:{state:'uploading'}}));await until(()=>c.events.some(e=>e.type==='activity'&&e.user?.id===users[1]));assert.equal(c.events.filter(e=>e.type==='activity'&&e.user?.id===users[0]).length,0);
   good(await api(`/groups/${group}/leave`,{user:users[2],body:{}}));assert.equal((await api(`/conversations/${group}/activity`,{user:users[2],body:{state:'typing'}})).status,404);assert.equal((await api(`/conversations/${group}/presence`,{user:users[2]})).status,404);
   await b.close();await c.close();
  });
 }finally{for(const c of controllers)c.abort();await Promise.all(slots.map(s=>s.service.close()));await Promise.all(servers.map(s=>new Promise(r=>{s.closeAllConnections();s.close(r);})));await pool.query('DELETE FROM chat_conversations WHERE id=ANY($1::uuid[])',[[group,direct].filter(Boolean)]);await pool.query('DELETE FROM chat_presence_leases WHERE user_id=ANY($1::text[])',[users]);await pool.query('DELETE FROM chat_privacy WHERE user_id=ANY($1::text[])',[users]);await pool.query('DELETE FROM chat_user_blocks WHERE user_id=ANY($1::text[]) OR blocked_user_id=ANY($1::text[])',[users]);await pool.end();db.close();await rm(dataDir,{recursive:true,force:true});}
});
