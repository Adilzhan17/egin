/** Explicit, idempotent demo import. Never runs during server startup or migration. */
import { readFile, mkdir, writeFile, rename, unlink, access } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { Pool } from 'pg';
import sharp from 'sharp';
import { categorySeed } from './categories.mjs';
import { validatePatch, validatePublish } from './validation.mjs';

export const DEMO_SELLER = 'egin-demo-market-seller';
const here = fileURLToPath(new URL('.', import.meta.url));
export function demoId(key) {
  const bytes = createHash('sha256').update(`egin-market-demo-v1:${key}`).digest();
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const s = bytes.subarray(0, 16).toString('hex');
  return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
}
export function assertDemoTarget(environment, rpID) {
  const hosts = {staging:'dev-egin.perricheno.com', local:'localhost'};
  if (!hosts[environment] || rpID !== hosts[environment]) throw new Error('Demo import requires an explicit staging/local environment with matching RP_ID.');
}
export async function loadDemoCatalog(directory = here) {
  const catalog = JSON.parse(await readFile(resolve(directory, 'demo-catalog.json'), 'utf8'));
  const photos = new Map(), keys = new Set();
  for (const photo of catalog.photos) {
    if (!photo.key || photos.has(photo.key) || !photo.file || basename(photo.file)!==photo.file || !photo.sourceUrl?.startsWith('https://') || !photo.author || !photo.license) throw new Error('Invalid demo photograph or missing credit');
    const input = await readFile(resolve(directory, 'demo-photos', photo.file));
    const full = await sharp(input, {limitInputPixels: 20000000}).rotate().resize({width:1000,height:1000,fit:'inside',withoutEnlargement:true}).webp({quality:84}).toBuffer({resolveWithObject:true});
    const thumb = await sharp(full.data).resize({width:480,height:480,fit:'inside',withoutEnlargement:true}).webp({quality:78}).toBuffer();
    photos.set(photo.key, {...photo,full,thumb});
  }
  const listings = catalog.listings.map(item => {
    if (!item.key || keys.has(item.key)) throw new Error('Duplicate demo listing key');
    keys.add(item.key);
    if (!item.photos?.length || item.photos.length>8 || new Set(item.photos).size!==item.photos.length || item.photos.some(key=>!photos.has(key))) throw new Error(`Missing photos: ${item.key}`);
    const credits = item.photos.map(key=>photos.get(key)).map(p=>`${p.author} · ${p.license}\n${p.sourceUrl}${p.licenseUrl ? "\n" + p.licenseUrl : ""}`).join('\n');
    const data = validatePatch({title:item.title,categoryId:item.categoryId,dealType:item.dealType,
      description:`${item.description}\n\nДемонстрационное объявление EGIN: товар, наличие и цена приведены для примера. Демо-продавец не отвечает на сообщения.\n\nФотографии (уменьшены и преобразованы в WebP):\n${credits}`,
      attributes:item.attributes,priceMode:item.priceAmount==null?'negotiable':'fixed',priceAmount:item.priceAmount??null,priceUnit:item.priceUnit,
      quantity:item.quantity??null,quantityUnit:item.quantityUnit||'',currencyCode:'KZT',countryCode:'KZ',
      regionCode:item.regionCode||'',districtCode:item.districtCode||'',localityCode:'',localityName:item.localityName,
      contactPhone:'',allowPhone:false,currentStep:5});
    validatePublish(data, categorySeed.find(c=>c.id===item.categoryId),item.photos.length);
    return {...data,key:item.key,photos:item.photos,regionName:item.regionName,districtName:item.districtName||''};
  });
  return {listings,photos};
}

export async function seedDemo({environment, rpID=process.env.RP_ID, dataDir=process.env.DATA_DIR, databaseUrl=process.env.MARKET_DATABASE_URL, dryRun=false}) {
  assertDemoTarget(environment,rpID);
  if (!dataDir || !databaseUrl) throw new Error('DATA_DIR and MARKET_DATABASE_URL are required');
  const {listings,photos} = await loadDemoCatalog();
  if(dryRun) return {listings:listings.length,photos:photos.size,dryRun:true};
  const storage=resolve(dataDir,'market-images'), pool=new Pool({connectionString:databaseUrl,max:1});
  let db,client,inserted=0;
  try {
    // Open an initialized app store; never create a second/empty auth database by mistake.
    await access(resolve(dataDir,'egin.sqlite'));
    db=new DatabaseSync(resolve(dataDir,'egin.sqlite'));
    db.exec('PRAGMA busy_timeout=5000;');
    db.prepare('SELECT id FROM users LIMIT 1').get();
    client=await pool.connect();
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('egin-demo-catalog-v1'))");
    for(const item of listings) {
      const location=(await client.query("SELECT r.name region_name,d.name district_name FROM market_geography r JOIN market_geography d ON d.parent_code=r.code WHERE r.code=$1 AND d.code=$2 AND r.level='region' AND d.level='district'",[item.regionCode,item.districtCode])).rows[0];
      if(!location) throw new Error(`Load official Market geography before importing ${item.key}`);
      item.regionName=location.region_name; item.districtName=location.district_name;
    }
    const existingUser=db.prepare('SELECT name,recovery FROM users WHERE id=?').get(DEMO_SELLER);
    if(existingUser && (existingUser.name!=='EGIN · демо-продавец' || existingUser.recovery!==null)) throw new Error('Demo seller ID is already in use');
    db.prepare('INSERT OR IGNORE INTO users(id,name,recovery,created) VALUES(?,?,NULL,?)').run(DEMO_SELLER,'EGIN · демо-продавец',Date.now());
    await mkdir(storage,{recursive:true,mode:0o700});
    for(const [index,item] of listings.entries()) {
      const id=demoId(item.key);
      const existing=(await client.query('SELECT owner_id FROM market_listings WHERE id=$1',[id])).rows[0];
      if(existing && existing.owner_id!==DEMO_SELLER) throw new Error('Listing ID collision');
      if(existing) continue; // Do not restore archived examples or overwrite subsequent edits.
      await client.query(`INSERT INTO market_listings(id,owner_id,category_id,deal_type,status,title,description,attributes,price_mode,price_amount,price_unit,quantity,quantity_unit,region_code,district_code,region_name,district_name,locality_name,current_step,published_at)
        VALUES($1,$2,$3,$4,'published',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,5,now()-($18::int*interval '1 minute'))`,
        [id,DEMO_SELLER,item.categoryId,item.dealType,item.title,item.description,item.attributes,item.priceMode,item.priceAmount,item.priceUnit,item.quantity,item.quantityUnit,item.regionCode,item.districtCode,item.regionName,item.districtName,item.localityName,index]);
      for(const [order,key] of item.photos.entries()) {
        const photo=photos.get(key),imageId=demoId(`image:${item.key}:${key}`),storageKey=`${imageId}.webp`;
        for(const [suffix,buffer] of [['',photo.full.data],['.thumb.webp',photo.thumb]]) {
          const target=resolve(storage,storageKey+suffix),temp=`${target}.seed-${process.pid}`;
          try {await writeFile(temp,buffer,{mode:0o600,flag:'wx'});await rename(temp,target);}finally{await unlink(temp).catch(()=>{});}
        }
        await client.query(`INSERT INTO market_listing_images(id,listing_id,storage_key,mime_type,file_size,width,height,sort_order,is_cover) VALUES($1,$2,$3,'image/webp',$4,$5,$6,$7,$8)`,[imageId,id,storageKey,photo.full.data.length,photo.full.info.width,photo.full.info.height,order,order===0]);
      }
      await client.query(`UPDATE market_listings l SET search_text=lower(concat_ws(' ',l.title,l.description,l.attributes::text,c.name_ru,c.name_kk)),search_vector=setweight(to_tsvector('simple',l.title),'A')||setweight(to_tsvector('russian',l.title),'A')||setweight(to_tsvector('simple',coalesce(c.name_ru,'')||' '||l.attributes::text),'B')||setweight(to_tsvector('russian',l.description),'C') FROM market_categories c WHERE l.id=$1 AND c.id=l.category_id`,[id]);
      await client.query('INSERT INTO market_listing_events(id,listing_id,actor_id,event_type,event_payload) VALUES($1,$2,$3,$4,$5)',[demoId(`event:${item.key}`),id,DEMO_SELLER,'demo_imported',{catalog:'v1'}]);
      inserted++;
    }
    await client.query('COMMIT');
    return {inserted,skipped:listings.length-inserted,photos:photos.size,environment};
  } catch(error) {if(client) await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally {client?.release();await pool.end();db?.close();}
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  seedDemo({environment:process.argv.find(arg=>arg.startsWith('--environment='))?.split('=')[1],dryRun:process.argv.includes('--dry-run')}).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
