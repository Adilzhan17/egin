import express from 'express';
import { Pool } from 'pg';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { mkdir,writeFile,unlink,access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { migrateMarket } from './migrations.mjs';
import { fail,uuid,object,validatePatch,validateAttributes,validatePublish } from './validation.mjs';
import { createCadastreClient } from '../cadastre.mjs';
import { searchPlan,startMarketSearch,normalizeMarketQuery } from './search.mjs';

const mapColumns={categoryId:'category_id',dealType:'deal_type',title:'title',description:'description',attributes:'attributes',attributesSchemaVersion:'attributes_schema_version',priceMode:'price_mode',priceAmount:'price_amount',currencyCode:'currency_code',priceUnit:'price_unit',quantity:'quantity',quantityUnit:'quantity_unit',countryCode:'country_code',regionCode:'region_code',districtCode:'district_code',localityCode:'locality_code',localityName:'locality_name',currentStep:'current_step',contactPhone:'contact_phone',allowPhone:'allow_phone',delivery:'delivery'};
const date=value=>value?new Date(value).toISOString():null;
const integer=(value,fallback,min,max)=>{if(value===undefined||value==='') return fallback;const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw fail(400,'Некорректные параметры страницы');return n;};
const numeric=value=>{if(value===undefined||value==='')return null;const n=Number(value);if(!Number.isFinite(n)||n<0||n>999999999999)throw fail(400,'Некорректная цена');return n;};
function rowListing(row){
  const listing={id:row.id,ownerId:row.owner_id,status:row.status,regionName:row.region_name,districtName:row.district_name,version:row.version,publishedAt:date(row.published_at),createdAt:date(row.created_at),updatedAt:date(row.updated_at),archivedAt:date(row.archived_at)};
  for(const [key,column] of Object.entries(mapColumns)) listing[key]=['priceAmount','quantity'].includes(key)?row[column]===null?null:Number(row[column]):row[column];
  return listing;
}

export function installMarket({app,db,required,wrap,dataDir,databaseUrl=process.env.MARKET_DATABASE_URL,geographyClient=createCadastreClient()}){
  const pool=databaseUrl?new Pool({connectionString:databaseUrl,max:8,connectionTimeoutMillis:4000,idleTimeoutMillis:30000,statement_timeout:10000,application_name:'egin-market',options:'-c pg_trgm.word_similarity_threshold=0.35'}):null;
  const storage=resolve(dataDir,'market-images');
  const removeStored=key=>Promise.all([key,`${key}.thumb.webp`].map(file=>unlink(resolve(storage,file)).catch(()=>{})));
  let available=false,startupError=null,searchService=null,closed=false;
  // A missing/unreachable Market store never breaks auth, maps, weather or workspace boot.
  const ready=pool?(async()=>{try {await mkdir(storage,{recursive:true,mode:0o700});await migrateMarket(pool);try{searchService=await startMarketSearch(pool);}catch(error){console.error('Market semantic search unavailable; lexical search active:',error.message);}available=true;return true;}catch(error){startupError=error;console.error('Market initialization failed:',error.message);return false;}})():Promise.resolve(false);
  pool?.on('error',error=>console.error('Market database connection:',error.message));
  const router=express.Router();
  router.marketRouter=true;
  app.use('/api/market',router);
  router.use((req,res,next)=>{ready.then(()=>available?next():res.status(503).json({error:'Рынок временно недоступен. Попробуйте позже.',code:'market_unavailable'})).catch(next);});
  const rates=new Map();
  router.use((req,res,next)=>{
    if(['GET','HEAD'].includes(req.method)) return next();
    const now=Date.now(),key=req.user?.id||String(req.socket.remoteAddress),bucket=rates.get(key)||{until:now+60000,count:0};
    if(bucket.until<now){bucket.until=now+60000;bucket.count=0;}bucket.count++;rates.set(key,bucket);
    if(rates.size>5000)for(const [k,v] of rates)if(v.until<now)rates.delete(k);
    if(bucket.count>90)return res.set('Retry-After','60').status(429).json({error:'Слишком много действий. Повторите через минуту.'});next();
  });
  router.param('id',(req,res,next,id)=>uuid(id)?next():res.status(400).json({error:'Некорректный номер объявления'}));
  router.param('imageId',(req,res,next,id)=>uuid(id)?next():res.status(400).json({error:'Некорректный номер фотографии'}));
  async function transaction(fn){const client=await pool.connect();try{await client.query('BEGIN');const value=await fn(client);await client.query('COMMIT');return value;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}
  const category=async(client,id)=>id?(await client.query('SELECT config FROM market_categories WHERE id=$1 AND is_active',[id])).rows[0]?.config:null;
  async function locked(client,id,user,version,checkVersion=true){
    const row=(await client.query('SELECT * FROM market_listings WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!row||row.owner_id!==user)throw fail(404,'Объявление не найдено');
    if(checkVersion && (!Number.isInteger(version)||version!==row.version))throw fail(409,'Объявление изменилось в другой вкладке. Обновите данные.');
    return row;
  }
  const event=(client,id,user,type,payload={})=>client.query('INSERT INTO market_listing_events(id,listing_id,actor_id,event_type,event_payload) VALUES($1,$2,$3,$4,$5)',[randomUUID(),id,user,type,payload]);
  async function present(rows,user,client=pool){
    if(!rows.length)return [];
    const ids=rows.map(row=>row.id);
    const images=(await client.query('SELECT * FROM market_listing_images WHERE listing_id=ANY($1::uuid[]) ORDER BY sort_order',[ids])).rows;
    const favorites=user?(await client.query('SELECT listing_id FROM market_favorites WHERE user_id=$1 AND listing_id=ANY($2::uuid[])',[user,ids])).rows.map(row=>row.listing_id):[];
    const ownerIds=[...new Set(rows.map(row=>row.owner_id))],names=new Map();
    try{for(const owner of db.prepare(`SELECT id,name FROM users WHERE id IN (${ownerIds.map(()=>'?').join(',')})`).all(...ownerIds))names.set(owner.id,owner.name);}catch{}
    return rows.map(row=>{
      const listing=rowListing(row),isOwner=row.owner_id===user;
      const name=names.get(row.owner_id)||'Пользователь egin';
      return {...listing,isDemo:row.owner_id==='egin-demo-market-seller',...(!listing.allowPhone&&!isOwner?{contactPhone:''}:{}),isOwner,isFavorite:favorites.includes(row.id),seller:{id:row.owner_id,name},images:images.filter(image=>image.listing_id===row.id).map(image=>({id:image.id,url:`/api/market/listings/${row.id}/images/${image.id}/file`,thumbnailUrl:`/api/market/listings/${row.id}/images/${image.id}/file?size=thumb`,width:image.width,height:image.height,sortOrder:image.sort_order,isCover:image.is_cover}))};
    });
  }
  // Capture both the row and image list before releasing the mutation's row lock.
  // Returning a later SELECT could give an older editor another writer's version.
  async function listingEnvelope(client,id,user){const row=(await client.query('SELECT * FROM market_listings WHERE id=$1',[id])).rows[0];return {listing:(await present([row],user,client))[0]};}
  async function refreshSearch(client,id){
    await client.query(`UPDATE market_listings l SET search_text=lower(concat_ws(' ',l.title,l.description,l.attributes::text,c.name_ru,c.name_kk)),
      search_vector=setweight(to_tsvector('simple',l.title),'A')||setweight(to_tsvector('russian',l.title),'A')||setweight(to_tsvector('simple',coalesce(c.name_ru,'')||' '||l.attributes::text),'B')||setweight(to_tsvector('russian',l.description),'C') FROM market_categories c WHERE l.id=$1 AND c.id=l.category_id`,[id]);
  }
  async function normalizedLocation(client,value){
    const result={regionName:'',districtName:''};
    if(!value.regionCode)return result;
    await ensureGeography();
    const region=(await client.query("SELECT * FROM market_geography WHERE code=$1 AND level='region'",[value.regionCode])).rows[0];
    if(!region)throw fail(422,'Выберите область из справочника');result.regionName=region.name;
    if(value.districtCode){const district=(await client.query("SELECT * FROM market_geography WHERE code=$1 AND parent_code=$2 AND level='district'",[value.districtCode,value.regionCode])).rows[0];if(!district)throw fail(422,'Выберите район выбранной области');result.districtName=district.name;}
    if(value.localityCode) {const locality=(await client.query("SELECT code FROM market_geography WHERE code=$1 AND parent_code=$2 AND level='locality'",[value.localityCode,value.districtCode])).rows[0];if(!locality)throw fail(422,'Населённый пункт не найден в справочнике');}
    return result;
  }
  let geographyPromise=null,geographyUntil=0;
  async function ensureGeography(){
    if(Date.now()<geographyUntil)return;
    if(geographyPromise)return geographyPromise;
    geographyPromise=(async()=>{
      const existing=await pool.query('SELECT max(updated_at) as updated,count(*)::int as count FROM market_geography');
      if(existing.rows[0].count && Date.now()-new Date(existing.rows[0].updated).getTime()<86400000){geographyUntil=Date.now()+3600000;return;}
      try {
        const {regions}=await geographyClient.regions();
        await transaction(async client=>{for(const region of regions){
          await client.query("INSERT INTO market_geography(code,name,level) VALUES($1,$2,'region') ON CONFLICT(code) DO UPDATE SET name=excluded.name,updated_at=now()",[region.code,region.name]);
          for(const district of region.districts)await client.query("INSERT INTO market_geography(code,parent_code,name,level) VALUES($1,$2,$3,'district') ON CONFLICT(code) DO UPDATE SET name=excluded.name,updated_at=now()",[`${region.code}-${district.code}`,region.code,district.name]);
        }});geographyUntil=Date.now()+3600000;
      }catch(error){if(!existing.rows[0].count)throw fail(503,'Справочник регионов временно недоступен. Повторите позже.');geographyUntil=Date.now()+60000;}
    })().finally(()=>{geographyPromise=null;});return geographyPromise;
  }
  router.get('/health',wrap(async(req,res)=>{await pool.query('SELECT 1');res.json({ok:true,storage:'postgresql'});}));
  router.get('/categories',wrap(async(req,res)=>res.json({categories:(await pool.query('SELECT config FROM market_categories WHERE is_active ORDER BY parent_id NULLS FIRST,sort_order')).rows.map(row=>row.config)})));
  router.get('/suggestions',wrap(async(req,res)=>{
    const query=req.query.q||'';if(typeof query!=='string'||query.length>160)throw fail(400,'Некорректный поисковый запрос');
    const variants=normalizeMarketQuery(query);if(query.trim().length<2||!variants.length)return res.json({suggestions:[]});
    const rows=(await pool.query(`SELECT title,max(score) score FROM (SELECT l.title,(SELECT max(word_similarity(v,lower(l.title))) FROM unnest($1::text[]) v) score FROM market_listings l WHERE l.status='published' AND EXISTS(SELECT 1 FROM unnest($1::text[]) v WHERE l.search_vector @@ websearch_to_tsquery('simple',v) OR l.search_vector @@ websearch_to_tsquery('russian',v) OR v <% l.search_text)) hits GROUP BY title ORDER BY score DESC,title LIMIT 6`,[variants])).rows;
    res.json({suggestions:rows.map(row=>row.title)});
  }));
  router.get('/geography',wrap(async(req,res)=>{if(req.query.parentCode!==undefined&&(typeof req.query.parentCode!=='string'||req.query.parentCode.length>40))throw fail(400,'Проверьте регион');await ensureGeography();const rows=(await pool.query('SELECT code,parent_code as "parentCode",name,level FROM market_geography WHERE parent_code IS NOT DISTINCT FROM $1 ORDER BY name',[req.query.parentCode||null])).rows;res.json({items:rows,source:'ЕГКН, открытый справочник областей и районов',localityInput:'text'});}));

  async function catalog(req,{mine=false,favorite=false,similar=null}={}){
    const q=req.query;
    const page=integer(q.page,1,1,10000),pageSize=integer(q.pageSize,20,1,40),values=[];
    const parameter=value=>{values.push(value);return `$${values.length}`;};
    const clauses=[];
    if(mine){clauses.push(`l.owner_id=${parameter(req.user.id)}`);if(q.status){if(!['draft','published','archived'].includes(q.status))throw fail(400,'Неизвестный статус');clauses.push(`l.status=${parameter(q.status)}`);}}
    else clauses.push("l.status='published'");
    if(favorite)clauses.push(`EXISTS(SELECT 1 FROM market_favorites f WHERE f.listing_id=l.id AND f.user_id=${parameter(req.user.id)})`);
    for(const [input,column] of [['dealType','deal_type'],['regionCode','region_code'],['districtCode','district_code'],['localityCode','locality_code'],['priceUnit','price_unit']])if(q[input]){if(typeof q[input]!=='string'||q[input].length>80)throw fail(400,'Некорректный фильтр');clauses.push(`l.${column}=${parameter(q[input])}`);}
    if(q.localityName){if(typeof q.localityName!=='string'||q.localityName.length>120)throw fail(400,'Некорректное название населённого пункта');clauses.push(`lower(l.locality_name)=lower(${parameter(q.localityName.trim())})`);}
    if(q.categoryId){if(typeof q.categoryId!=='string'||q.categoryId.length>80)throw fail(400,'Некорректная категория');const p=parameter(q.categoryId);clauses.push(`(l.category_id=${p} OR l.category_id IN(SELECT id FROM market_categories WHERE parent_id=${p}))`);}
    const low=numeric(q.priceMin),high=numeric(q.priceMax);if((low!==null||high!==null||['price_asc','price_desc'].includes(q.sort))&&!q.priceUnit)throw fail(400,'Выберите единицу цены для сравнения объявлений');if(low!==null)clauses.push(`l.price_amount>=${parameter(low)}`);if(high!==null)clauses.push(`l.price_amount<=${parameter(high)}`);if(low!==null&&high!==null&&low>high)throw fail(400,'Минимальная цена больше максимальной');
    if(q.attributes){let attributes;try{attributes=JSON.parse(q.attributes);}catch{throw fail(400,'Некорректные фильтры характеристик');}if(!object(attributes)||JSON.stringify(attributes).length>8000)throw fail(400,'Некорректные характеристики');for(const [key,value]of Object.entries(attributes)){if(!/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(key))throw fail(400,'Некорректный фильтр');if(object(value)){if(Object.keys(value).some(k=>!['min','max'].includes(k)))throw fail(400,'Некорректный диапазон');const kp=parameter(key);for(const bound of ['min','max'])if(value[bound]!==undefined){const n=numeric(value[bound]);clauses.push(`(CASE WHEN jsonb_typeof(l.attributes->${kp})='number' THEN (l.attributes->>${kp})::numeric END)${bound==='min'?'>=':'<='}${parameter(n)}`);}}else{if(!['string','number','boolean'].includes(typeof value)&&!Array.isArray(value))throw fail(400,'Некорректный фильтр');clauses.push(`l.attributes @> ${parameter(JSON.stringify({[key]:value}))}::jsonb`);}}}
    if(similar){clauses.push(`l.id<>${parameter(similar.id)}`);const p=parameter(similar.category_id);clauses.push(`(l.category_id=${p} OR l.category_id IN(SELECT id FROM market_categories WHERE parent_id=(SELECT parent_id FROM market_categories WHERE id=${p})))`);}
    const query=q.q===undefined?'':q.q;if(typeof query!=='string'||query.length>160)throw fail(400,'Поисковый запрос слишком длинный');
    const sort=q.sort|| (query.trim()?'relevance':'newest');if(!['newest','relevance','price_asc','price_desc'].includes(sort))throw fail(400,'Неизвестный порядок сортировки');
    let score='0::real',semantic=false;
    if(query.trim()){
      const plan=await searchPlan({pool,query:query.trim()}),variants=plan.variants.slice(0,8),vp=parameter(variants),sp=parameter((plan.semanticIds||[]).filter(uuid));semantic=!!plan.semanticIds?.length;
      const lexical=`EXISTS(SELECT 1 FROM unnest(${vp}::text[]) v WHERE l.search_vector @@ websearch_to_tsquery('simple',v) OR l.search_vector @@ websearch_to_tsquery('russian',v) OR v <% l.search_text)`;
      clauses.push(`(${lexical} OR l.id=ANY(${sp}::uuid[]))`);
      score=`(SELECT max(ts_rank_cd(l.search_vector,websearch_to_tsquery('simple',v))+ts_rank_cd(l.search_vector,websearch_to_tsquery('russian',v))) FROM unnest(${vp}::text[]) v)`;
      // Rank fusion keeps lexical, fuzzy and semantic scores on comparable rank scales.
      const sql=`WITH candidates AS(SELECT l.*,${score} lexical_score,(SELECT max(word_similarity(v,l.search_text)) FROM unnest(${vp}::text[]) v) fuzzy_score,array_position(${sp}::uuid[],l.id) semantic_rank,(lower(l.title)=ANY(${vp}::text[])) exact_title FROM market_listings l WHERE ${clauses.join(' AND ')}),ranked AS(SELECT *,CASE WHEN lexical_score>0 THEN 1.0/(60+row_number()OVER(ORDER BY lexical_score DESC,id)) ELSE 0 END+CASE WHEN fuzzy_score>=0.35 THEN 1.0/(60+row_number()OVER(ORDER BY fuzzy_score DESC,id)) ELSE 0 END+coalesce(1.0/(60+semantic_rank),0)+CASE WHEN exact_title THEN 1 ELSE 0 END relevance FROM candidates) SELECT *,count(*) OVER()::int total FROM ranked ORDER BY ${sort==='price_asc'?'price_amount ASC NULLS LAST':sort==='price_desc'?'price_amount DESC NULLS LAST':sort==='newest'?'published_at DESC NULLS LAST':'relevance DESC'},id LIMIT ${parameter(pageSize)} OFFSET ${parameter((page-1)*pageSize)}`;
      const rows=(await pool.query(sql,values)).rows;
      const total=rows[0]?.total??(await pool.query(`SELECT count(*)::int total FROM market_listings l WHERE ${clauses.join(' AND ')}`,values.slice(0,-2))).rows[0].total;
      return {items:await present(rows,req.user?.id),total,page,hasMore:page*pageSize<total,searchMode:semantic?'hybrid':'lexical_fuzzy'};
    }
    let order=sort==='price_asc'?'l.price_amount ASC NULLS LAST':sort==='price_desc'?'l.price_amount DESC NULLS LAST':mine?'l.updated_at DESC':'l.published_at DESC NULLS LAST';
    if(similar)order=`(l.category_id=${parameter(similar.category_id)}) DESC,(l.region_code=${parameter(similar.region_code)}) DESC,${order}`;
    const where=clauses.join(' AND '),countValues=[...values];
    const total=(await pool.query(`SELECT count(*)::int total FROM market_listings l WHERE ${where}`,countValues.slice(0,similar?countValues.length-2:countValues.length))).rows[0].total;
    const rows=(await pool.query(`SELECT l.* FROM market_listings l WHERE ${where} ORDER BY ${order},l.id LIMIT ${parameter(pageSize)} OFFSET ${parameter((page-1)*pageSize)}`,values)).rows;
    const counts=mine?Object.fromEntries((await pool.query('SELECT status,count(*)::int count FROM market_listings WHERE owner_id=$1 GROUP BY status',[req.user.id])).rows.map(row=>[row.status,row.count])):undefined;
    return {items:await present(rows,req.user?.id),total,page,hasMore:page*pageSize<total,...(counts?{counts:{draft:0,published:0,archived:0,...counts}}:{})};
  }
  router.get('/listings',wrap(async(req,res)=>res.json(await catalog(req))));
  router.get('/my/listings',required,wrap(async(req,res)=>res.json(await catalog(req,{mine:true}))));
  router.get('/favorites',required,wrap(async(req,res)=>res.json(await catalog(req,{favorite:true}))));
  router.get('/listings/:id',wrap(async(req,res)=>{const row=(await pool.query('SELECT * FROM market_listings WHERE id=$1',[req.params.id])).rows[0];if(!row||(row.status!=='published'&&row.owner_id!==req.user?.id))throw fail(404,'Объявление не найдено');res.json({listing:(await present([row],req.user?.id))[0]});}));
  router.get('/listings/:id/similar',wrap(async(req,res)=>{const row=(await pool.query("SELECT * FROM market_listings WHERE id=$1 AND (status='published' OR owner_id=$2)",[req.params.id,req.user?.id||''])).rows[0];if(!row)throw fail(404,'Объявление не найдено');res.json(await catalog(req,{similar:row}));}));

  router.post('/listings',required,wrap(async(req,res)=>{
    const patch=validatePatch(req.body),id=randomUUID();
    if(patch.regionCode)await ensureGeography();
    const result=await transaction(async client=>{
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`market-owner:${req.user.id}`]);
      if(patch.clientId){const existing=(await client.query('SELECT id FROM market_listings WHERE owner_id=$1 AND client_id=$2 FOR UPDATE',[req.user.id,patch.clientId])).rows[0];if(existing)return listingEnvelope(client,existing.id,req.user.id);}
      if((await client.query("SELECT count(*)::int count FROM market_listings WHERE owner_id=$1 AND status='draft'",[req.user.id])).rows[0].count>=50)throw fail(422,'Можно сохранить не более 50 черновиков');
      await client.query('INSERT INTO market_listings(id,owner_id,client_id) VALUES($1,$2,$3)',[id,req.user.id,patch.clientId||null]);
      await update(client,id,req.user.id,patch,false);await event(client,id,req.user.id,'created');return listingEnvelope(client,id,req.user.id);
    });return res.status(201).json(result);
  }));
  async function update(client,id,user,patch,checkVersion=true){
    const row=await locked(client,id,user,patch.version,checkVersion),existing=rowListing(row),value={...existing,...patch};
    if(value.priceMode==='negotiable')value.priceAmount=null;
    if(patch.categoryId&&patch.categoryId!==existing.categoryId&&!('attributes' in patch))value.attributes={};
    const cat=await category(client,value.categoryId);
    if(value.categoryId&&!cat)throw fail(422,'Категория недоступна');
    if(cat){value.attributesSchemaVersion=cat.attributeSchema.version;validateAttributes(value.attributes,cat.attributeSchema,value.dealType);if(value.dealType&&!cat.dealTypes.includes(value.dealType))throw fail(422,'Тип сделки не подходит категории');}
    const location=await normalizedLocation(client,value);
    if(row.status==='published'){const imageCount=(await client.query('SELECT count(*)::int count FROM market_listing_images WHERE listing_id=$1',[id])).rows[0].count;validatePublish(value,cat,imageCount);}
    const values=[id],assignments=[];
    for(const[key,column]of Object.entries(mapColumns)){values.push(key==='attributes'?JSON.stringify(value[key]):value[key]);assignments.push(`${column}=$${values.length}`);}
    values.push(location.regionName,location.districtName);assignments.push(`region_name=$${values.length-1}`,`district_name=$${values.length}`);
    await client.query(`UPDATE market_listings SET ${assignments.join(',')},version=version+1,updated_at=now() WHERE id=$1`,values);await refreshSearch(client,id);
  }
  router.patch('/listings/:id',required,wrap(async(req,res)=>{const patch=validatePatch(req.body);if(patch.regionCode)await ensureGeography();const result=await transaction(async client=>{await update(client,req.params.id,req.user.id,patch);await event(client,req.params.id,req.user.id,'updated');return listingEnvelope(client,req.params.id,req.user.id);});return res.json(result);}));
  router.post('/listings/:id/publish',required,wrap(async(req,res)=>{
    const result=await transaction(async client=>{const row=await locked(client,req.params.id,req.user.id,req.body?.version,false);if(row.status==='published')return listingEnvelope(client,row.id,req.user.id);if(req.body?.version!==row.version)throw fail(409,'Черновик изменился. Обновите данные.');const cat=await category(client,row.category_id);const imageCount=(await client.query('SELECT count(*)::int count FROM market_listing_images WHERE listing_id=$1',[row.id])).rows[0].count;validatePublish(rowListing(row),cat,imageCount);await client.query("UPDATE market_listings SET status='published',published_at=coalesce(published_at,now()),archived_at=NULL,current_step=5,version=version+1,updated_at=now() WHERE id=$1",[row.id]);await refreshSearch(client,row.id);await event(client,row.id,req.user.id,'published');return listingEnvelope(client,row.id,req.user.id);});return res.json(result);
  }));
  router.post('/listings/:id/archive',required,wrap(async(req,res)=>{const result=await transaction(async client=>{const row=await locked(client,req.params.id,req.user.id,req.body?.version);if(row.status==='draft')throw fail(422,'Удалите черновик или опубликуйте его');await client.query("UPDATE market_listings SET status='archived',archived_at=now(),updated_at=now(),version=version+1 WHERE id=$1",[row.id]);await event(client,row.id,req.user.id,'archived');return listingEnvelope(client,row.id,req.user.id);});return res.json(result);}));
  router.delete('/listings/:id',required,wrap(async(req,res)=>{const keys=await transaction(async client=>{const row=await locked(client,req.params.id,req.user.id,integer(req.query.version,null,1,2147483647));if(row.status!=='draft')throw fail(422,'Удалить можно только черновик');const images=(await client.query('SELECT storage_key FROM market_listing_images WHERE listing_id=$1',[row.id])).rows;await client.query('DELETE FROM market_listings WHERE id=$1',[row.id]);return images.map(image=>image.storage_key);});await Promise.all(keys.map(removeStored));res.json({ok:true});}));

  router.post('/favorites',required,wrap(async(req,res)=>{if(!uuid(req.body?.listingId))throw fail(400,'Выберите объявление');await transaction(async client=>{const row=(await client.query("SELECT id FROM market_listings WHERE id=$1 AND status='published' FOR SHARE",[req.body.listingId])).rows[0];if(!row)throw fail(404,'Объявление недоступно');await client.query('INSERT INTO market_favorites(id,listing_id,user_id) VALUES($1,$2,$3) ON CONFLICT(user_id,listing_id) DO NOTHING',[randomUUID(),row.id,req.user.id]);});res.json({ok:true});}));
  router.delete('/favorites/:id',required,wrap(async(req,res)=>{await pool.query('DELETE FROM market_favorites WHERE user_id=$1 AND listing_id=$2',[req.user.id,req.params.id]);res.json({ok:true});}));
  router.post('/listings/:id/report',required,wrap(async(req,res)=>{const {reason,description=''}=req.body||{};if(!['spam','fraud','prohibited','wrong_category','other'].includes(reason)||typeof description!=='string'||description.length>2000)throw fail(400,'Выберите причину жалобы');const result=await pool.query("INSERT INTO market_listing_reports(id,listing_id,reporter_id,reason,description) SELECT $1,id,$3,$4,$5 FROM market_listings WHERE id=$2 AND status='published' ON CONFLICT(listing_id,reporter_id) DO UPDATE SET reason=excluded.reason,description=excluded.description,status='open' RETURNING id",[randomUUID(),req.params.id,req.user.id,reason,description]);if(!result.rowCount)throw fail(404,'Объявление недоступно');res.status(201).json({ok:true,reportId:result.rows[0].id,message:'Жалоба сохранена. Автоматическая модерация пока не выполняется.'});}));
  router.post('/listings/:id/contact',required,wrap(async(req,res)=>{const row=(await pool.query("SELECT * FROM market_listings WHERE id=$1 AND status='published'",[req.params.id])).rows[0];if(!row)throw fail(404,'Объявление недоступно');res.json({chatAvailable:row.owner_id!==req.user.id,listingId:row.id,sellerId:row.owner_id,phone:row.allow_phone?row.contact_phone:null,message:row.owner_id===req.user.id?'Это ваше объявление.':'Напишите продавцу в чате EGIN. Диалог создаётся через POST /api/chat/conversations с kind: market и listingId.'});}));

  const imageVersion=req=>integer(req.headers['if-match']?.replaceAll('"','')??req.query.version,null,1,2147483647);
  router.post('/listings/:id/images',required,express.raw({type:['image/jpeg','image/png','image/webp'],limit:'10mb'}),wrap(async(req,res)=>{
    if(!Buffer.isBuffer(req.body)||!req.body.length)throw fail(415,'Загрузите JPEG, PNG или WebP');
    // Verify owner/version before expensive decoding. The transaction checks again after decoding.
    const precheck=(await pool.query('SELECT owner_id,version FROM market_listings WHERE id=$1',[req.params.id])).rows[0];
    if(!precheck||precheck.owner_id!==req.user.id)throw fail(404,'Объявление не найдено');const version=imageVersion(req);if(precheck.version!==version)throw fail(409,'Объявление изменилось. Обновите данные.');
    let processed;try{const decoder=sharp(req.body,{limitInputPixels:40000000,animated:false,failOn:'error'}),metadata=await decoder.metadata();if(!['jpeg','png','webp'].includes(metadata.format))throw new Error('Unsupported image encoding');processed=await decoder.rotate().resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).webp({quality:84,effort:3}).toBuffer({resolveWithObject:true});}catch{throw fail(422,'Не удалось прочитать изображение. Выберите JPEG, PNG или WebP.');}
    const id=randomUUID(),key=`${id}.webp`,path=resolve(storage,key),thumbnail=await sharp(processed.data).resize({width:480,height:480,fit:'inside',withoutEnlargement:true}).webp({quality:76}).toBuffer();await writeFile(path,processed.data,{mode:0o600,flag:'wx'});try{await writeFile(`${path}.thumb.webp`,thumbnail,{mode:0o600,flag:'wx'});}catch(error){await unlink(path).catch(()=>{});throw error;}
    let result;
    try{result=await transaction(async client=>{const row=await locked(client,req.params.id,req.user.id,version);const count=(await client.query('SELECT count(*)::int count FROM market_listing_images WHERE listing_id=$1',[row.id])).rows[0].count;if(count>=8)throw fail(422,'Можно добавить не более 8 фотографий');await client.query("INSERT INTO market_listing_images(id,listing_id,storage_key,mime_type,file_size,width,height,sort_order,is_cover) VALUES($1,$2,$3,'image/webp',$4,$5,$6,$7,$8)",[id,row.id,key,processed.data.length,processed.info.width,processed.info.height,count,count===0]);await client.query('UPDATE market_listings SET version=version+1,updated_at=now() WHERE id=$1',[row.id]);await event(client,row.id,req.user.id,'image_added',{imageId:id});return listingEnvelope(client,row.id,req.user.id);});}catch(error){await Promise.all([path,`${path}.thumb.webp`].map(file=>unlink(file).catch(()=>{})));throw error;}
    return res.status(201).json(result);
  }));
  router.get('/listings/:id/images/:imageId/file',wrap(async(req,res)=>{const image=(await pool.query("SELECT i.* FROM market_listing_images i JOIN market_listings l ON l.id=i.listing_id WHERE i.id=$1 AND l.id=$2 AND (l.status='published' OR l.owner_id=$3)",[req.params.imageId,req.params.id,req.user?.id||''])).rows[0];if(!image)throw fail(404,'Фотография недоступна');let path=resolve(storage,image.storage_key);if(req.query.size==='thumb'){try{await access(`${path}.thumb.webp`);path+= '.thumb.webp';}catch{}}res.set('Cache-Control','private, no-store').type('image/webp').sendFile(path);}));
  router.delete('/listings/:id/images/:imageId',required,wrap(async(req,res)=>{
    const {key,result}=await transaction(async client=>{
      const row=await locked(client,req.params.id,req.user.id,imageVersion(req));
      const images=(await client.query('SELECT * FROM market_listing_images WHERE listing_id=$1 ORDER BY sort_order',[row.id])).rows;
      const image=images.find(i=>i.id===req.params.imageId);if(!image)throw fail(404,'Фотография не найдена');
      const cat=await category(client,row.category_id);if(row.status==='published'&&cat.requiresPhoto&&['sell','rent_out'].includes(row.deal_type)&&images.length===1)throw fail(422,'У опубликованного объявления должна остаться фотография');
      await client.query('DELETE FROM market_listing_images WHERE id=$1',[image.id]);
      for(const [index,item]of images.filter(i=>i.id!==image.id).entries())await client.query('UPDATE market_listing_images SET sort_order=$2,is_cover=$3 WHERE id=$1',[item.id,index,index===0]);
      await client.query('UPDATE market_listings SET version=version+1,updated_at=now() WHERE id=$1',[row.id]);await event(client,row.id,req.user.id,'image_deleted',{imageId:image.id});
      return {key:image.storage_key,result:await listingEnvelope(client,row.id,req.user.id)};
    });await removeStored(key);return res.json(result);
  }));
  router.patch('/listings/:id/images/order',required,wrap(async(req,res)=>{
    const ids=req.body?.imageIds;if(!Array.isArray(ids)||ids.length>8||!ids.every(uuid)||new Set(ids).size!==ids.length)throw fail(400,'Некорректный порядок фотографий');
    const result=await transaction(async client=>{
      const row=await locked(client,req.params.id,req.user.id,req.body.version),images=(await client.query('SELECT id FROM market_listing_images WHERE listing_id=$1',[row.id])).rows;
      if(images.length!==ids.length||images.some(image=>!ids.includes(image.id)))throw fail(422,'Список фотографий изменился');
      for(const [index,id]of ids.entries())await client.query('UPDATE market_listing_images SET sort_order=$2,is_cover=$3 WHERE id=$1',[id,index,index===0]);
      await client.query('UPDATE market_listings SET version=version+1,updated_at=now() WHERE id=$1',[row.id]);await event(client,row.id,req.user.id,'images_reordered');return listingEnvelope(client,row.id,req.user.id);
    });return res.json(result);
  }));
  // Keep database internals and decoder messages out of the shared API error middleware.
  router.use((error,req,res,next)=>{if(res.headersSent)return next(error);const status=error.code==='ENOENT'?404:error.status||(['23503','23514','22P02','22003'].includes(error.code)?422:503);if(status===503)console.error('Market request failed:',error.message);res.status(status).json({error:error.code==='ENOENT'?'Фотография временно недоступна':status===503?'Рынок временно недоступен. Повторите позже.':error.status?error.message:'Проверьте данные объявления',...(error.fields?{fields:error.fields}:{})});});
  return {ready,async close(){if(closed)return;closed=true;await ready;await searchService?.close?.();await pool?.end();},get status(){return {available,error:startupError?.message};}};
}
