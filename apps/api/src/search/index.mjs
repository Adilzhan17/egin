import {readFileSync} from 'node:fs';
import {normalize,variants,distance} from './matching.mjs';
import {terms} from './terms.mjs';
import {rerank} from './local-model.mjs';

const dataset=JSON.parse(readFileSync(new URL('./places-kz.json',import.meta.url),'utf8'));
const prepare=item=>({...item,canonical:normalize(item.name),searchNames:[...new Set([item.name,...item.aliases].flatMap(n=>{const full=normalize(n);return [full,...full.split(/[\s-]+/)];}))].filter(n=>n.length>=2)});
const places=dataset.places.map(prepare),placesById=new Map(places.map(p=>[p.id,p])),vocabulary=terms.map(prepare),cache=new Map();
export function suggestLocal(query,scope='all',limit=8){
 const qs=variants(query);if(!qs.length||qs[0].length<2)return [];
 const key=scope+':'+qs.join('|')+':'+limit;if(cache.has(key))return cache.get(key).map(item=>({...item}));
 const ranked=[];
 for(const item of scope==='terms'?vocabulary:scope==='places'?places:[...vocabulary,...places]){
  let score=0;
  for(const q of qs)for(const name of item.searchNames){
   const primary=name===item.canonical,bonus=primary?.06:-.025;
   if(name===q){score=Math.max(score,1+bonus);continue;}
   if(name.startsWith(q)){score=Math.max(score,.93+Math.min(.045,q.length/name.length*.045)+bonus);continue;}
   if(score>=.9||q.length<4||q.length>64||name.length>80)continue;
   const bound=Math.min(3,Math.floor(q.length*.4));
   // Narrow fuzzy candidates before the dynamic-programming distance pass.
   if(Math.abs(q.length-name.length)>bound||!(name[0]===q[0]||name[0]===q[1]||name[1]===q[0]))continue;
   const d=distance(q,name,bound),similarity=1-d/Math.max(q.length,name.length);
   if(d<=bound&&similarity>=.58)score=Math.max(score,.5+similarity*.33+bonus);
  }
  if(score<.69)continue;
  score+=(item.kind==='city'?.018:0)+Math.min(.025,Math.log10(1+(item.population||0))*.003);
  const {searchNames,canonical,aliases,population,...publicItem}=item;
  ranked.push({...publicItem,score,source:item.kind==='term'?'vocabulary':'GeoNames',...(item.kind==='term'?{}:{zoom:item.kind==='region'?7:item.kind==='district'?10:13})});
 }
 let results=ranked.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'ru'));
 if(results[0]?.score>=.9)results=results.filter(item=>item.score>=.88);
 results=results.slice(0,limit);if(cache.size>=500)cache.delete(cache.keys().next().value);cache.set(key,results);return results.map(item=>({...item}));
}
export function correctedTerm(query){const normalized=normalize(query);if(normalized.length<4||normalized.includes(' '))return;const best=suggestLocal(normalized,'terms',1)[0];return best&&best.score>=.75&&normalize(best.name)!==normalized&&!normalize(best.name).startsWith(normalized)?normalize(best.name):undefined;}

export function addressContext(query){
 const words=normalize(query).split(' ');
 for(let count=Math.min(3,words.length-1);count>=1;count--){const prefix=words.slice(0,count).join(' '),candidate=suggestLocal(prefix,'places',3).find(p=>p.kind==='city'&&p.score>=.8);if(candidate&&prefix.length>=4)return {city:candidate,remainder:words.slice(count).join(' ')};}
 return undefined;
}

export function createPlaceSearch({fetcher=fetch,photonOrigin=process.env.PLACE_SEARCH_URL||'https://photon.komoot.io'}={}){
 const cache=new Map();let inFlight=0,lastRemote=0;
 async function remote(query){
  const key=normalize(query),old=cache.get(key);if(old&&Date.now()-old.time<86400000)return old.items;
  if(inFlight>=2||Date.now()-lastRemote<1000)throw Error('Поиск занят. Повторите через секунду.');
  inFlight++;lastRemote=Date.now();
  try{
   const context=addressContext(query),city=context?.city,cityNames=city?placesById.get(city.id)?.searchNames:undefined;
   const bbox=city?[city.longitude-.4,city.latitude-.25,city.longitude+.4,city.latitude+.25].join(','):'46.4,40.4,87.4,55.5';
   const url=new URL('/api/',photonOrigin);url.search=new URLSearchParams({q:context?`${city.name} ${context.remainder}`:query,limit:'8',bbox,countrycode:'KZ'}).toString();
   const response=await fetcher(url,{headers:{'User-Agent':'EGIN local address lookup','Accept':'application/json'},signal:AbortSignal.timeout(9000)});if(!response.ok)throw Error('Карта временно не отвечает. Можно выбрать город из локальных подсказок.');
   const body=await response.json();if(!Array.isArray(body.features))throw Error('Карта вернула неподдерживаемый ответ.');
   const items=body.features.slice(0,8).flatMap(feature=>{const p=feature.properties||{},point=feature.geometry?.coordinates;if(cityNames&&p.city&&!cityNames.includes(normalize(p.city)))return [];if(!Array.isArray(point)||point.length<2||!point.every(Number.isFinite)||Math.abs(point[0])>180||Math.abs(point[1])>90||p.countrycode&&p.countrycode!=='KZ')return [];const name=[p.housenumber?(p.street||p.name):(p.name||p.street),p.housenumber].filter(Boolean).join(', ');if(!name)return [];return [{id:`osm:${p.osm_type}:${p.osm_id}`,name,latitude:point[1],longitude:point[0],kind:p.housenumber?'address':p.type==='street'||p.osm_key==='highway'?'street':p.type==='city'?'city':'place',region:[p.city,p.district,p.state].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(', '),source:'OpenStreetMap / Photon',zoom:p.housenumber?18:p.type==='street'?16:13}];});
   if(cache.size>=250)cache.delete(cache.keys().next().value);cache.set(key,{time:Date.now(),items});return items;
  }finally{inFlight--;}
 }
 return async(query,{online=false}={})=>{
  const local=suggestLocal(query,'places',8),context=addressContext(query);if(context&&!local.some(p=>p.id===context.city.id))local.unshift(context.city);
  const ranked=await rerank(query,local);let onlineItems=[],warning;
  const exactPlace=local.some(p=>placesById.get(p.id)?.searchNames.includes(normalize(query)));
  if(online&&!exactPlace)try{onlineItems=await remote(query);}catch(e){warning=e.message;}
  const items=onlineItems.length?[...onlineItems,...ranked.items.filter(a=>!onlineItems.some(b=>Math.abs(a.latitude-b.latitude)<.01&&Math.abs(a.longitude-b.longitude)<.01))].slice(0,10):ranked.items;
  return {items,mode:ranked.mode,online:onlineItems.length>0,...(warning?{warning}:{})};
 };
}
export function installSearch({app,wrap}){
 const searchPlaces=createPlaceSearch(),rates=new Map();
 app.get('/api/search/suggest',wrap(async(req,res)=>{
  const q=req.query.q,scope=req.query.scope||'all';if(typeof q!=='string'||q.length>160||!['all','terms','places'].includes(scope))return res.status(400).json({error:'Введите запрос до 160 символов.'});
  const key=String(req.socket.remoteAddress),now=Date.now(),bucket=rates.get(key);if(bucket&&now-bucket.at<60000&&bucket.count>=120)return res.status(429).json({error:'Слишком много запросов. Подождите немного.'});if(!bucket||now-bucket.at>=60000){if(rates.size>=1000)rates.delete(rates.keys().next().value);rates.set(key,{at:now,count:1});}else bucket.count++;
  res.set('Cache-Control','private, no-store');if(normalize(q).length<2)return res.json({items:[],mode:'local-prefix'});
  if(scope==='places')return res.json(await searchPlaces(q,{online:req.query.online==='1'}));
  const result=await rerank(q,suggestLocal(q,scope));res.json(result);
 }));
}
