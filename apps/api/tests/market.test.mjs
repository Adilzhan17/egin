import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import express from 'express';
import sharp from 'sharp';
import {Pool} from 'pg';
import {installMarket} from '../src/market/index.mjs';
import {validatePatch,validateAttributes} from '../src/market/validation.mjs';
import {startMarketSearch,searchPlan} from '../src/market/search.mjs';

test('Market input rejects owner injection, dangerous attributes and invalid dates',()=>{
  assert.throws(()=>validatePatch({ownerId:'another-user'}));
  assert.throws(()=>validatePatch({priceAmount:Infinity}));
  assert.throws(()=>validatePatch({attributes:[]}));
  assert.throws(()=>validateAttributes({when:'2026-99-99'},{fields:[{key:'when',type:'date',label:'Дата'}]},'sell'),{status:422});
  assert.throws(()=>validateAttributes({when:'2026-02-31'},{fields:[{key:'when',type:'date',label:'Дата'}]},'sell'),{status:422});
  assert.throws(()=>validateAttributes({unknown:1},{fields:[]},'sell'),{status:422});
  assert.throws(()=>validateAttributes({model:'   '},{fields:[{key:'model',label:'Модель',type:'text',required:true}]},'sell',true),{status:422});
  assert.deepEqual(validatePatch({title:' Незавершённый черновик ',priceAmount:null}),{title:'Незавершённый черновик',priceAmount:null});
});

test('Market without PostgreSQL fails locally, preserving unrelated routes',async()=>{
  const app=express();app.get('/other',(req,res)=>res.json({ok:true}));
  const market=installMarket({app,db:null,required:(req,res)=>res.sendStatus(401),wrap:fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next),dataDir:tmpdir(),databaseUrl:''});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  try{const base=`http://127.0.0.1:${server.address().port}`;assert.equal((await fetch(base+'/api/market/listings')).status,503);assert.equal((await fetch(base+'/other')).status,200);}finally{await new Promise(resolve=>server.close(resolve));await market.close();}
});

test('Market PostgreSQL lifecycle, auth, concurrent drafts, filters and storage',{skip:!process.env.MARKET_TEST_DATABASE_URL},async t=>{
  const databaseUrl=process.env.MARKET_TEST_DATABASE_URL,pool=new Pool({connectionString:databaseUrl});
  const dataDir=await mkdtemp(tmpdir()+'/egin-market-test-'),owner=`market-test-${randomUUID()}`,other=`market-test-${randomUUID()}`;
  const app=express();app.use(express.json());app.use((req,res,next)=>{const user=req.headers['x-test-user'];if([owner,other].includes(user))req.user={id:user,name:'Test'};next();});
  const market=installMarket({app,db:{prepare:()=>({all:(...ids)=>ids.map(id=>({id,name:'Хозяйство теста'}))})},required:(req,res,next)=>req.user?next():res.status(401).json({error:'Войдите'}),wrap:fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next),dataDir,databaseUrl,geographyClient:{regions:async()=>({regions:[{code:'test01',name:'Тестовая область',districts:[{code:'001',name:'Тестовый район'}]}]})}});
  assert.equal(await market.ready,true);
  // Isolated test catalog uses reserved codes and never replaces official geography.
  await pool.query("INSERT INTO market_geography(code,name,level) VALUES('test01','Тестовая область','region') ON CONFLICT DO NOTHING");
  await pool.query("INSERT INTO market_geography(code,parent_code,name,level) VALUES('test01-001','test01','Тестовый район','district') ON CONFLICT DO NOTHING");
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}/api/market`;
  async function call(path,{method='GET',body,user=owner,headers={}}={}){const response=await fetch(base+path,{method,headers:{...(user?{'x-test-user':user}:{}),...(body&&!Buffer.isBuffer(body)?{'Content-Type':'application/json'}:{}),...headers},body:body?(Buffer.isBuffer(body)?body:JSON.stringify(body)):undefined});const result=await response.json();return {status:response.status,...result};}
  let listing;
  try{
    await t.test('public taxonomy and unpublished ownership',async()=>{
      const categories=await call('/categories',{user:null});assert.equal(categories.status,200);assert.equal(categories.categories.filter(c=>!c.parentId).length,8);assert.ok(categories.categories.find(c=>c.id==='harvest-wheat').attributeSchema.fields.length>5);
      assert.equal((await call('/listings',{method:'POST',body:{},user:null})).status,401);
      const clientId=randomUUID(),created=await call('/listings',{method:'POST',body:{clientId,title:'Мой черновик'}});assert.equal(created.status,201);listing=created.listing;assert.equal(listing.status,'draft');assert.equal(listing.isOwner,true);
      const retry=await call('/listings',{method:'POST',body:{clientId,title:'Не перезаписывать'}});assert.equal(retry.listing.id,listing.id);assert.equal(retry.listing.title,'Мой черновик');
      assert.equal((await call(`/listings/${listing.id}`,{user:other})).status,404);assert.equal((await call(`/listings/${listing.id}`,{user:null})).status,404);
      assert.equal((await call(`/listings/${listing.id}`,{method:'PATCH',body:{version:listing.version,title:'Чужой'},user:other})).status,404);
      assert.equal((await call(`/listings/${listing.id}`,{method:'PATCH',body:{version:listing.version,ownerId:other}})).status,400);
    });
    await t.test('optimistic concurrency and partial draft restore',async()=>{
      const updates=await Promise.all(['Первая версия','Вторая версия'].map(title=>call(`/listings/${listing.id}`,{method:'PATCH',body:{version:listing.version,title,currentStep:2}})));
      assert.deepEqual(updates.map(r=>r.status).sort(),[200,409]);listing=(await call(`/listings/${listing.id}`)).listing;assert.equal(listing.currentStep,2);assert.ok(['Первая версия','Вторая версия'].includes(listing.title));
      assert.equal((await call(`/listings/${listing.id}/publish`,{method:'POST',body:{version:listing.version}})).status,422);
      const updated=await call(`/listings/${listing.id}`,{method:'PATCH',body:{version:listing.version,categoryId:'harvest-wheat',dealType:'sell',title:'Пшеница 3 класса урожай 2026',description:'Пшеница третьего класса со склада хозяйства. Самовывоз или доставка.',attributes:{crop:'Пшеница',grade:'3',harvestYear:2026,volume:100},priceMode:'fixed',priceAmount:95000,priceUnit:'ton',regionCode:'test01',districtCode:'test01-001',localityName:'Тестовый аул',contactPhone:'+77001112233',allowPhone:false,currentStep:4}});assert.equal(updated.status,200,updated.error);listing=updated.listing;assert.equal(listing.regionName,'Тестовая область');
      assert.equal((await call(`/listings/${listing.id}/publish`,{method:'POST',body:{version:listing.version}})).status,422);
    });
    await t.test('decoded image upload, private draft images and cover ordering',async()=>{
      const body=await sharp({create:{width:2400,height:1200,channels:3,background:'#24513c'}}).jpeg().withMetadata({exif:{IFD0:{Artist:'PRIVATE DATA'}}}).toBuffer();
      assert.equal((await call(`/listings/${listing.id}/images`,{method:'POST',body,user:other,headers:{'Content-Type':'image/jpeg','If-Match':String(listing.version)}})).status,404);
      assert.equal((await call(`/listings/${listing.id}/images`,{method:'POST',body:Buffer.from('not an image'),headers:{'Content-Type':'image/jpeg','If-Match':String(listing.version)}})).status,422);
      assert.equal((await call(`/listings/${listing.id}/images`,{method:'POST',body:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20"/></svg>'),headers:{'Content-Type':'image/png','If-Match':String(listing.version)}})).status,422);
      const upload=await call(`/listings/${listing.id}/images`,{method:'POST',body,headers:{'Content-Type':'image/jpeg','If-Match':String(listing.version)}});assert.equal(upload.status,201,upload.error);listing=upload.listing;assert.equal(listing.images.length,1);assert.equal(listing.images[0].width,1800);assert.equal(listing.images[0].isCover,true);
      const url=new URL(listing.images[0].url,base).href;assert.equal((await fetch(url)).status,404);const photo=await fetch(url,{headers:{'x-test-user':owner}});assert.equal(photo.status,200);const metadata=await sharp(Buffer.from(await photo.arrayBuffer())).metadata();assert.equal(metadata.exif,undefined);assert.equal(metadata.format,'webp');
      const thumbnail=await fetch(new URL(listing.images[0].thumbnailUrl,base),{headers:{'x-test-user':owner}});const thumbInfo=await sharp(Buffer.from(await thumbnail.arrayBuffer())).metadata();assert.equal(thumbInfo.width,480);assert.equal(thumbInfo.exif,undefined);
      const stored=(await pool.query('SELECT storage_key FROM market_listing_images WHERE id=$1',[listing.images[0].id])).rows[0].storage_key,path=`${dataDir}/market-images/${stored}`;await rename(path,path+'.test-backup');try{const missing=await fetch(url,{headers:{'x-test-user':owner}});assert.equal(missing.status,404);assert.ok(!(await missing.text()).includes(dataDir));}finally{await rename(path+'.test-backup',path);}
      const second=await call(`/listings/${listing.id}/images`,{method:'POST',body,headers:{'Content-Type':'image/jpeg','If-Match':String(listing.version)}});assert.equal(second.status,201);listing=second.listing;
      const ids=listing.images.map(image=>image.id).reverse();const order=await call(`/listings/${listing.id}/images/order`,{method:'PATCH',body:{version:listing.version,imageIds:ids}});assert.equal(order.status,200,order.error);listing=order.listing;assert.equal(listing.images[0].id,ids[0]);assert.equal(listing.images[0].isCover,true);
    });
    await t.test('publish is idempotent and contact consent is enforced',async()=>{
      const body={version:listing.version},published=await call(`/listings/${listing.id}/publish`,{method:'POST',body});assert.equal(published.status,200,published.error);listing=published.listing;assert.equal(listing.status,'published');assert.equal((await call(`/listings/${listing.id}/publish`,{method:'POST',body})).listing.version,listing.version);
      const publicListing=(await call(`/listings/${listing.id}`,{user:null})).listing;assert.equal(publicListing.contactPhone,'');assert.equal(publicListing.isOwner,false);assert.equal(publicListing.seller.name,'Хозяйство теста');assert.equal((await fetch(new URL(listing.images[0].url,base))).status,200);
      const contact=await call(`/listings/${listing.id}/contact`,{method:'POST',body:{},user:other});assert.equal(contact.chatAvailable,false);assert.equal(contact.phone,null);
      const updated=await call(`/listings/${listing.id}`,{method:'PATCH',body:{version:listing.version,allowPhone:true}});assert.equal(updated.status,200);listing=updated.listing;assert.equal((await call(`/listings/${listing.id}/contact`,{method:'POST',body:{},user:other})).phone,'+77001112233');
      assert.equal((await call(`/listings/${listing.id}`,{method:'PATCH',body:{version:listing.version,title:''}})).status,422);
    });
    await t.test('public server search and hard filters',async()=>{
      for(const q of ['Пшеница','Пшеница 3 класс','3 класс пшеница','Бидай','gitybwf','пшениц']){const result=await call('/listings?'+new URLSearchParams({q,regionCode:'test01'}),{user:null});assert.equal(result.status,200,result.error);assert.ok(result.items.some(item=>item.id===listing.id),q);}
      const laterPage=await call('/listings?'+new URLSearchParams({q:'Пшеница',regionCode:'test01',page:'100'}));assert.equal(laterPage.total,1);assert.equal(laterPage.items.length,0);
      for(const params of [{q:'Пшеница',regionCode:'wrong'},{q:'Пшеница',categoryId:'machinery'},{priceMin:'100000',priceUnit:'ton'},{attributes:JSON.stringify({grade:'4'})}])assert.equal((await call('/listings?'+new URLSearchParams(params))).total,0);
      const filtered=await call('/listings?'+new URLSearchParams({categoryId:'harvest',priceMax:'96000',priceUnit:'ton',attributes:JSON.stringify({volume:{min:90,max:101}})}));assert.ok(filtered.items.some(item=>item.id===listing.id));
      assert.equal((await call('/listings?priceMax=96000')).status,400);assert.equal((await call('/listings?sort=price_asc')).status,400);
      assert.equal((await call('/listings?priceMin=NaN')).status,400);assert.equal((await call('/listings?attributes=%7Bbad')).status,400);
      const similar=await call(`/listings/${listing.id}/similar`);assert.equal(similar.status,200,similar.error);assert.ok(similar.items.every(item=>item.id!==listing.id));
    });
    await t.test('favorites reports my counts and archive access',async()=>{
      for(let i=0;i<2;i++)assert.equal((await call('/favorites',{method:'POST',body:{listingId:listing.id},user:other})).status,200);
      const favorites=await call('/favorites',{user:other});assert.equal(favorites.items.filter(item=>item.id===listing.id).length,1);assert.equal(favorites.items[0].isFavorite,true);
      assert.equal((await call(`/listings/${listing.id}/report`,{method:'POST',body:{reason:'fraud',description:'Тестовая жалоба'},user:other})).status,201);
      assert.equal((await call('/my/listings')).counts.published,1);
      assert.equal((await call(`/listings/${listing.id}/archive`,{method:'POST',body:{version:listing.version},user:other})).status,404);
      const archived=await call(`/listings/${listing.id}/archive`,{method:'POST',body:{version:listing.version}});assert.equal(archived.status,200);listing=archived.listing;
      assert.equal((await call(`/listings/${listing.id}`,{user:null})).status,404);assert.equal((await call('/favorites',{user:other})).items.length,0);assert.equal((await call(`/listings/${listing.id}`)).listing.status,'archived');
      assert.equal((await call(`/listings/${listing.id}?version=${listing.version}`,{method:'DELETE'})).status,422);
      const draft=(await call('/listings',{method:'POST',body:{}})).listing;assert.equal((await call(`/listings/${draft.id}?version=${draft.version}`,{method:'DELETE'})).status,200);
    });
    await t.test('real PostgreSQL multilingual search quality matrix',async()=>{
      const fixtures=[
        ['wheat','harvest-wheat','sell','Пшеница 3 класса','Урожай пшеницы третьего класса. Продажа зерна из хозяйства.',{crop:'Пшеница',grade:'3',harvestYear:2026,volume:100}],
        ['tractor','machinery-tractors','rent_out','Трактор John Deere в аренду','Аренда трактора Джон Дир для посева и обработки земли с оператором.',{manufacturer:'John Deere',model:'8R',year:2022,power:370,condition:'С пробегом'}],
        ['combine','machinery-combines','sell','Комбайн','Зерноуборочный комбайн для сбора урожая зерна с поля.',{manufacturer:'Claas',model:'Lexion',year:2021,condition:'С пробегом'}],
        ['harvest','services-harvesting','service_offer','Уборка урожая','Услуги уборки урожая зерновых бригадой со своей техникой.',{workType:'Уборка урожая',territory:'Тестовая область'}],
        ['seed','seeds-grain','sell','Семена','Сертифицированные семена для посева зерновых культур.',{crop:'Ячмень',variety:'Арна'}],
      ];
      const ids={};
      for(const[key,category,deal,title,description,attributes] of fixtures){const id=randomUUID();ids[key]=id;await pool.query(`INSERT INTO market_listings(id,owner_id,category_id,deal_type,status,title,description,attributes,price_unit,region_code,district_code,locality_name,search_text,search_vector,published_at) VALUES($1,$2,$3,$4,'published',$5::text,$6::text,$7::jsonb,'all','test01','test01-001','Тестовый аул',lower($5::text||' '||$6::text||' '||($7::jsonb)::text),setweight(to_tsvector('simple',$5::text),'A')||setweight(to_tsvector('russian',$5::text),'A')||setweight(to_tsvector('russian',$6::text),'B')||to_tsvector('simple',($7::jsonb)::text),now())`,[id,owner,category,deal,title,description,attributes]);}
      const queries=[['Пшеница','wheat'],['Пшеница 3 класс','wheat'],['3 класс пшеница','wheat'],['Джон Дир','tractor'],['John Deere','tractor'],['Трактор в аренду','tractor'],['Комбайн','combine'],['Уборка урожая','harvest'],['Бидай','wheat'],['Тұқым','seed'],['Трактор жалға алу','tractor'],['жон дир','tractor'],['пшенциа','wheat']];
      for(const[q,key] of queries){const result=await call('/listings?'+new URLSearchParams({q,regionCode:'test01'}),{user:null});assert.equal(result.status,200,result.error);assert.equal(result.items[0]?.id,ids[key],`${q}: ${result.items.map(item=>item.title).join(', ')}`);}
      const suggestions=await call('/suggestions?q='+encodeURIComponent('Пшеница'));assert.ok(suggestions.suggestions.includes('Пшеница 3 класса'));assert.ok(!suggestions.suggestions.includes('Мой черновик'));
      if(process.env.MARKET_INFERENCE_URL){
        const search=await startMarketSearch(pool);
        try{
          const until=Date.now()+35000;
          while(Date.now()<until){await search.tick();const indexed=await pool.query('SELECT count(*)::int n FROM market_search_embeddings WHERE listing_id=ANY($1::uuid[])',[Object.values(ids)]);if(indexed.rows[0].n===fixtures.length)break;await new Promise(resolve=>setTimeout(resolve,200));}
          const indexed=await pool.query('SELECT listing_id,source_version,vector_dims(embedding) dimensions FROM market_search_embeddings WHERE listing_id=ANY($1::uuid[])',[Object.values(ids)]);assert.equal(indexed.rowCount,fixtures.length,'Every published fixture indexed by real inference');assert.ok(indexed.rows.every(row=>row.dimensions===384));
          const plan=await searchPlan({pool,query:'машина для сбора зерна с поля'});assert.equal(plan.mode,'hybrid');assert.ok(plan.semanticIds.includes(ids.combine),'Real multilingual embedding finds harvesting machine');
          for(const[q,key] of queries.slice(0,11)){const result=await call('/listings?'+new URLSearchParams({q,regionCode:'test01'}),{user:null});assert.equal(result.items[0]?.id,ids[key],`Hybrid ${q}: ${result.items.map(item=>item.title).join(', ')}`);}
          const hard=await call('/listings?'+new URLSearchParams({q:'машина для сбора зерна с поля',categoryId:'harvest',regionCode:'test01',dealType:'sell'}));assert.ok(hard.items.every(item=>item.categoryId==='harvest-wheat'&&item.regionCode==='test01'&&item.dealType==='sell'));
          assert.equal((await call('/listings?'+new URLSearchParams({q:'Трактор',regionCode:'another-region'}))).total,0);
          await pool.query("UPDATE market_listings SET title='Комбайн после обновления',version=version+1,updated_at=now() WHERE id=$1",[ids.combine]);
          await search.tick();const changed=(await pool.query('SELECT source_version FROM market_search_embeddings WHERE listing_id=$1',[ids.combine])).rows[0];assert.equal(changed.source_version,2,'Changed publication reindexed');
          await pool.query("UPDATE market_listings SET status='archived',version=version+1 WHERE id=$1",[ids.combine]);await search.tick();assert.equal((await pool.query('SELECT listing_id FROM market_search_embeddings WHERE listing_id=$1',[ids.combine])).rowCount,0,'Archived embedding removed');
          const after=await searchPlan({pool,query:'машина для сбора зерна с поля'});assert.ok(!after.semanticIds.includes(ids.combine));
          const inference=process.env.MARKET_INFERENCE_URL;process.env.MARKET_INFERENCE_URL='http://127.0.0.1:1';try{const fallback=await call('/listings?'+new URLSearchParams({q:'Семена для посева',regionCode:'test01'}));assert.equal(fallback.status,200);assert.ok(fallback.items.some(item=>item.id===ids.seed));}finally{process.env.MARKET_INFERENCE_URL=inference;}
        }finally{search.close();}
      }
    });
    await t.test('concurrent different draft IDs cannot bypass per-owner quota',async()=>{
      for(let i=0;i<49;i++)await pool.query('INSERT INTO market_listings(id,owner_id) VALUES($1,$2)',[randomUUID(),other]);
      const created=await Promise.all([1,2].map(()=>call('/listings',{method:'POST',body:{clientId:randomUUID()},user:other})));
      assert.deepEqual(created.map(result=>result.status).sort(),[201,422]);assert.equal((await pool.query("SELECT count(*)::int n FROM market_listings WHERE owner_id=$1 AND status='draft'",[other])).rows[0].n,50);
    });
  }finally{await new Promise(resolve=>server.close(resolve));await market.close();await pool.query('DELETE FROM market_listings WHERE owner_id=ANY($1::text[])',[[owner,other]]);await pool.end();await rm(dataDir,{recursive:true,force:true});}
});
