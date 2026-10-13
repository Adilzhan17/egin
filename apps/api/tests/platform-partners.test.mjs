import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {Pool} from 'pg';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {installPlatform} from '../src/platform/index.mjs';
import {installTrade} from '../src/trade/index.mjs';

const databaseUrl=process.env.MARKET_TEST_DATABASE_URL||process.env.CHAT_TEST_DATABASE_URL;
test('Partner services: real trade deal, private negotiation, quote lifecycle and revocation',{skip:!databaseUrl},async t=>{
 const basePool=new Pool({connectionString:databaseUrl}),schema='partners_'+randomUUID().replaceAll('-','');
 await basePool.query(`CREATE SCHEMA ${schema}`);
 const url=new URL(databaseUrl);url.searchParams.set('options',`-c search_path=${schema},public`);
 const dataDir=await mkdtemp(tmpdir()+'/egin-partners-'),db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT);CREATE TABLE records(user_id TEXT,id TEXT,kind TEXT,data TEXT,deleted INTEGER);');
 const users=Array.from({length:6},randomUUID);users.forEach((id,i)=>db.prepare('INSERT INTO users VALUES(?,?)').run(id,['Продавец','Покупатель','Перевозчик','Другая компания','Наблюдатель','Сотрудник перевозчика'][i]));
 const app=express();app.use(express.json());app.use((req,res,next)=>{if(users.includes(req.headers['x-test-user']))req.user={id:req.headers['x-test-user']};next();});
 const required=(req,res,next)=>req.user?next():res.status(401).json({error:'Войдите'}),wrap=f=>(req,res,next)=>Promise.resolve(f(req,res)).catch(next);
 const platform=installPlatform({app,db,dataDir,databaseUrl:url.href,adminIds:[],required,wrap}),trade=installTrade({app,db,dataDir,required,wrap,platform});
 app.use((e,req,res,next)=>{if(!e.status)console.error(e);res.status(e.status||500).json({error:e.message});});
 assert.equal(await trade.ready,true);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin=`http://127.0.0.1:${server.address().port}`;
 async function call(path,{user=users[0],body,method=body===undefined?'GET':'POST'}={}){const response=await fetch(origin+path,{method,headers:{'x-test-user':user,...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});return{status:response.status,...await response.json()};}
 const api=(path,options)=>call('/api/platform'+path,options),tradeApi=(path,options)=>call('/api/trade'+path,options);
 const good=(result,status=200)=>{assert.equal(result.status,status,result.error);return result;};
 const orgs=[];let deal,service,foreignService,invitation,accepted;
 const tomorrow=()=>new Date(Date.now()+86400000).toISOString();
 const quoteInput=(extra={})=>({organizationId:orgs[2].id,clientId:randomUUID(),serviceId:service.id,price:'420000.25',terms:'Частная ставка перевозчика: доставка с весовым контролем',expiresAt:tomorrow(),...extra});
 const createQuote=async(extra={},user=users[2])=>good(await api(`/service-invitations/${invitation.id}/offers`,{user,body:quoteInput(extra)}),201).offer;
 try{
  for(let i=0;i<4;i++)orgs.push(good(await api('/organizations',{user:users[i],body:{name:['Хозяйство','Закупщик','Перевозчик','Другой перевозчик'][i],kind:['farmer','buyer','partner','partner'][i]}}),201).organization);
  for(const[organization,user,role,owner]of [[orgs[0],users[4],'viewer',users[0]],[orgs[2],users[4],'viewer',users[2]],[orgs[2],users[5],'trader',users[2]]]){const invite=good(await api(`/organizations/${organization.id}/invitations`,{user:owner,body:{userId:user,role}}),201).invitation;good(await api(`/invitations/${invite.id}/respond`,{user,body:{accept:true}}));}
  const lot=good(await tradeApi('/lots',{body:{clientId:randomUUID(),organizationId:orgs[0].id,name:'Пшеница для настоящего тестового контракта',crop:'wheat',harvestYear:2026,quantityTon:'20.000',quality:{protein:14},storage:{label:'Склад продавца'}}}),201).lot;
  let listing=good(await tradeApi('/listings',{body:{clientId:randomUUID(),organizationId:orgs[0].id,lotId:lot.id,title:'Пшеница',quantityTon:'20.000',pricePerTon:'90000.00',currency:'KZT',region:'Акмола',handover:{label:'Склад'},paymentTerms:'После приёмки',wizardStep:6}}),201).listing;
  listing=good(await tradeApi(`/listings/${listing.id}/actions`,{body:{version:listing.version,action:'publish'}})).listing;
  const offer=good(await tradeApi('/offers',{user:users[1],body:{clientId:randomUUID(),organizationId:orgs[1].id,listingId:listing.id,status:'sent',terms:{quantityTon:'20.000',pricePerTon:'90000.00',currency:'KZT',deliveryTerms:'pickup',handover:{label:'Склад'},logisticsPayer:'buyer',loadingPayer:'buyer',paymentTerms:'После приёмки',expiresAt:tomorrow()},costs:[]}}),201).offer;
  deal=good(await tradeApi(`/offers/${offer.id}/actions`,{body:{version:offer.version,action:'accept'}})).deal;

  await t.test('real providers publish services; organization type and viewer write permissions are enforced',async()=>{
   const value={kind:'logistics',title:'Перевозка зерна',description:'Транспорт реальной тестовой организации',region:'Акмола'};
   assert.equal((await api('/partner-services',{body:{...value,organizationId:orgs[0].id}})).status,422);
   assert.equal((await api('/partner-services',{user:users[4],body:{...value,organizationId:orgs[2].id}})).status,403);
   service=good(await api('/partner-services',{user:users[2],body:{...value,organizationId:orgs[2].id}}),201).service;
   foreignService=good(await api('/partner-services',{user:users[3],body:{...value,organizationId:orgs[3].id}}),201).service;
   assert.ok(good(await api('/partner-services?q='+encodeURIComponent('Перевозка'))).items.some(item=>item.id===service.id));
  });
  await t.test('a real deal party invites a provider; outsiders, own deal parties and viewers cannot create invitations',async()=>{
   const value={organizationId:orgs[0].id,partnerId:orgs[2].id,dealId:deal.id,description:'Закрытые условия доставки: склад 3, ворота 2'};
   assert.equal((await api('/service-invitations',{user:users[4],body:value})).status,403);
   assert.equal((await api('/service-invitations',{user:users[3],body:{...value,organizationId:orgs[3].id}})).status,404);
   assert.equal((await api('/service-invitations',{body:{...value,partnerId:orgs[1].id}})).status,422);
   invitation=good(await api('/service-invitations',{body:value}),201).invitation;
   const retry=good(await api('/service-invitations',{body:value}),201).invitation;assert.equal(retry.id,invitation.id);
   assert.equal(good(await api('/service-invitations?organizationId='+orgs[2].id,{user:users[2]})).items[0].description,value.description);
   assert.ok(good(await api('/notifications',{user:users[2]})).items.some(n=>n.entityId===invitation.id&&n.type==='service.invited'));
  });
  await t.test('private invitations and quote terms are visible only to requesting organization and invited provider',async()=>{
   accepted=await createQuote();
   const path=`/service-invitations/${invitation.id}/offers?organizationId=`;
   assert.equal(good(await api(path+orgs[0].id)).items[0].terms,accepted.terms);
   assert.equal(good(await api(path+orgs[2].id,{user:users[2]})).items[0].price,'420000.25');
   assert.equal((await api(path+orgs[3].id,{user:users[3]})).status,404);
   assert.equal((await api(path+orgs[1].id,{user:users[1]})).status,404,'Other party to the crop deal is not automatically party to this service negotiation');
   assert.equal((await api(path+orgs[2].id,{user:users[0]})).status,404);
   assert.equal(good(await api('/service-invitations?organizationId='+orgs[3].id,{user:users[3]})).items.length,0);
  });
  await t.test('quotes use provider-owned active services, real versions, idempotent client ids and requester acceptance',async()=>{
   assert.equal((await api(`/service-invitations/${invitation.id}/offers`,{user:users[2],body:quoteInput({serviceId:foreignService.id})})).status,404);
   assert.equal((await api(`/service-invitations/${invitation.id}/offers`,{user:users[4],body:quoteInput()})).status,403);
   const value=quoteInput(),pair=await Promise.all([1,2].map(()=>api(`/service-invitations/${invitation.id}/offers`,{user:users[2],body:value})));pair.forEach(r=>good(r,201));assert.equal(pair[0].offer.id,pair[1].offer.id);
   assert.equal((await api(`/service-offers/${accepted.id}/actions`,{user:users[2],body:{organizationId:orgs[2].id,version:accepted.version,action:'accept'}})).status,404);
   assert.equal((await api(`/service-offers/${accepted.id}/actions`,{user:users[4],body:{organizationId:orgs[0].id,version:accepted.version,action:'accept'}})).status,403);
   good(await api(`/service-offers/${accepted.id}/actions`,{body:{organizationId:orgs[0].id,version:accepted.version,action:'accept'}}));
   let snapshot=good(await api(`/service-invitations/${invitation.id}/offers?organizationId=${orgs[2].id}`,{user:users[2]})).items.find(q=>q.id===accepted.id);assert.equal(snapshot.status,'accepted');assert.equal(snapshot.version,accepted.version+1);
   assert.equal((await api(`/service-offers/${accepted.id}/actions`,{body:{organizationId:orgs[0].id,version:accepted.version,action:'reject'}})).status,409);
   const notice=good(await api('/notifications',{user:users[2]})).items.find(n=>n.type==='service.offer_updated'&&n.entityId===deal.id);assert.ok(notice);
   assert.deepEqual(good(await api(`/notifications/${notice.id}/destination`,{user:users[2]})).destination,{view:'business',tab:'services',organizationId:orgs[2].id,id:invitation.id});
   assert.equal((await api(`/notifications/${notice.id}/destination`,{user:users[3]})).status,404,'A notification id never grants another user its destination');
  });
  await t.test('rejection, provider withdrawal and expired acceptance are server transitions that persist',async()=>{
   const rejected=await createQuote(),withdrawn=await createQuote(),expired=await createQuote();
   good(await api(`/service-offers/${rejected.id}/actions`,{body:{organizationId:orgs[0].id,version:rejected.version,action:'reject'}}));
   good(await api(`/service-offers/${withdrawn.id}/actions`,{user:users[2],body:{organizationId:orgs[2].id,version:withdrawn.version,action:'withdraw'}}));
   await platform.pool.query("UPDATE business_service_offers SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.id]);
   assert.equal((await api(`/service-offers/${expired.id}/actions`,{body:{organizationId:orgs[0].id,version:expired.version,action:'accept'}})).status,409);
   const items=good(await api(`/service-invitations/${invitation.id}/offers?organizationId=${orgs[0].id}`)).items;assert.equal(items.find(q=>q.id===rejected.id).status,'rejected');assert.equal(items.find(q=>q.id===withdrawn.id).status,'withdrawn');assert.equal(items.find(q=>q.id===expired.id).status,'sent');
  });
  await t.test('removing provider staff revokes private reads and new quote writes regardless of their prior participation',async()=>{
   const sent=await createQuote({},users[5]);assert.ok(sent.id);
   const notice=good(await api('/notifications',{user:users[5]})).items.find(n=>n.type==='service.invited'&&n.entityId===invitation.id);assert.ok(notice);
   assert.deepEqual(good(await api(`/notifications/${notice.id}/destination`,{user:users[5]})).destination,{view:'business',tab:'services',organizationId:orgs[2].id,id:invitation.id});
   good(await api(`/organizations/${orgs[2].id}/members/${users[5]}`,{method:'DELETE',user:users[2]}));
   assert.equal((await api(`/service-invitations/${invitation.id}/offers?organizationId=${orgs[2].id}`,{user:users[5]})).status,404);
   assert.equal((await api('/service-invitations?organizationId='+orgs[2].id,{user:users[5]})).status,404);
   assert.equal((await api(`/notifications/${notice.id}/destination`,{user:users[5]})).status,404,'A retained notification must not reopen data after membership removal');
   assert.equal((await api(`/service-invitations/${invitation.id}/offers`,{user:users[5],body:quoteInput()})).status,404);
   assert.equal((await api(`/service-offers/${sent.id}/actions`,{user:users[5],body:{organizationId:orgs[2].id,version:sent.version,action:'withdraw'}})).status,404);
  });
  await t.test('a closed real deal rejects new invitations, provider quotes and acceptance while preserving historical documents',async()=>{
   const replayValue=quoteInput(),pending=await createQuote(replayValue);deal=good(await tradeApi('/deals/'+deal.id)).deal;
   deal=good(await tradeApi(`/deals/${deal.id}/actions`,{body:{version:deal.version,action:'cancel'}})).deal;
   deal=good(await tradeApi(`/deals/${deal.id}/actions`,{user:users[1],body:{version:deal.version,action:'cancel'}})).deal;assert.equal(deal.status,'cancelled');
   assert.equal((await api('/service-invitations',{body:{organizationId:orgs[0].id,partnerId:orgs[3].id,dealId:deal.id,description:'Слишком поздно'}})).status,409);
   assert.equal((await api(`/service-invitations/${invitation.id}/offers`,{user:users[2],body:quoteInput()})).status,409,'Provider must not quote a cancelled deal');
   assert.equal(good(await api(`/service-invitations/${invitation.id}/offers`,{user:users[2],body:replayValue}),201).offer.id,pending.id,'Retry of an existing quote remains idempotent after deal closure');
   assert.equal((await api(`/service-offers/${pending.id}/actions`,{body:{organizationId:orgs[0].id,version:pending.version,action:'accept'}})).status,409);
   const history=good(await api(`/service-invitations/${invitation.id}/offers?organizationId=${orgs[0].id}`));assert.ok(history.items.some(q=>q.id===accepted.id&&q.status==='accepted'));
  });
 }finally{await trade.close();await new Promise(r=>{server.closeAllConnections();server.close(r);});await platform.close();db.close();await basePool.query(`DROP SCHEMA ${schema} CASCADE`);await basePool.end();await rm(dataDir,{recursive:true,force:true});}
});
