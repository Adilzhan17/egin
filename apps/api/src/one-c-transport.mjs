import {lookup} from 'node:dns/promises';
import {get} from 'node:https';
import {load} from 'cheerio';
import {endpointURL, publicIPv4} from './integrations.mjs';

const fail=(status,message)=>Object.assign(new Error(message),{status});
const identifier=value=>typeof value==='string'&&/^[\p{L}_][\p{L}\p{N}_]{0,199}$/u.test(value);
const localName=node=>node.name?.split(':').at(-1);

export function normalizeOneCEndpoint(value){
  const url=endpointURL(value);
  if(!/\/odata\/standard\.odata\/?$/i.test(url.pathname))throw fail(400,'Укажите адрес публикации 1С, заканчивающийся на /odata/standard.odata/');
  url.pathname=url.pathname.replace(/\/?$/,'/');
  return url.href;
}

export function parseMetadata(xml){
  if(typeof xml!=='string'||/<!DOCTYPE|<!ENTITY/i.test(xml))throw fail(422,'Недопустимый документ метаданных 1С');
  const $=load(xml,{xmlMode:true});
  const schemas=$('*').filter((_,el)=>localName(el)==='Schema').toArray();
  if(!schemas.length)throw fail(422,'Сервер не вернул метаданные OData. Проверьте публикацию 1С');
  const types=new Map(),sets=[];
  for(const schema of schemas){
    const namespace=$(schema).attr('Namespace'),alias=$(schema).attr('Alias');
    $(schema).children().each((_,el)=>{
      if(localName(el)==='EntityType'){
        const name=$(el).attr('Name'),properties=[];
        $(el).children().each((_,child)=>{
          if(localName(child)!=='Property')return;
          const n=$(child).attr('Name'),type=$(child).attr('Type');
          if(identifier(n)&&typeof type==='string'&&/^Edm\.(String|Boolean|Byte|SByte|Int16|Int32|Int64|Single|Double|Decimal|Guid|DateTime|DateTimeOffset|Date|Time|Binary)$/.test(type))properties.push({name:n,type});
        });
        if(properties.length>1000)throw fail(422,'В объекте 1С слишком много реквизитов');
        const value={properties,base:$(el).attr('BaseType')};
        types.set(namespace+'.'+name,value);if(alias)types.set(alias+'.'+name,value);
      }
      if(localName(el)==='EntityContainer')$(el).children().each((_,child)=>{
        if(localName(child)!=='EntitySet')return;
        const name=$(child).attr('Name'),type=$(child).attr('EntityType');
        if(identifier(name)&&type)sets.push({name,type});
      });
    });
  }
  if(!sets.length||sets.length>5000)throw fail(422,'Метаданные не содержат доступных коллекций или превышают лимит');
  const propertiesFor=(name,seen=new Set())=>{
    if(seen.has(name)||seen.size>10)throw fail(422,'Некорректное наследование метаданных OData');
    seen.add(name);const t=types.get(name);if(!t)return [];
    return [...(t.base?propertiesFor(t.base,seen):[]),...t.properties];
  };
  return sets.map(s=>({name:s.name,properties:[...new Map(propertiesFor(s.type).map(p=>[p.name,p])).values()]}));
}

// Every request validates DNS and pins the TLS socket to its public address.
// No redirects, alternate ports, supplied headers or arbitrary OData paths.
export async function readOneC(url,{username,password,signal}, {resolve=lookup,request=get}={}){
  endpointURL(url.origin+url.pathname);
  const abort=AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(20000)]);
  let timer;
  try{
    const addresses=await Promise.race([resolve(url.hostname,{all:true,family:4}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(fail(504,'Не удалось разрешить адрес 1С вовремя')),4000);})]);
    clearTimeout(timer);
    if(!addresses.length||addresses.some(a=>!publicIPv4(a.address)))throw fail(400,'1С должна быть доступна по публичному HTTPS-адресу');
    const address=addresses[0].address;
    return await new Promise((resolve,reject)=>{
      const req=request(url,{agent:false,signal:abort,lookup:(_host,options,cb)=>options.all?cb(null,[{address,family:4}]):cb(null,address,4),headers:{Accept:'application/json, application/xml;q=0.9','Accept-Encoding':'identity',Authorization:'Basic '+Buffer.from(username+':'+password).toString('base64')}},res=>{
        if(res.statusCode!==200){res.destroy();return reject(fail(res.statusCode===401||res.statusCode===403?422:502,
          res.statusCode===401||res.statusCode===403?'1С отклонила доступ. Проверьте пользователя, пароль и права чтения':
          res.statusCode>=300&&res.statusCode<400?'Публикация перенаправляет запрос. Укажите конечный HTTPS-адрес':'1С не вернула данные. Проверьте публикацию и права на объект'));}
        let size=0;const chunks=[];
        res.on('data',chunk=>{size+=chunk.length;if(size>8*1024*1024){res.destroy();reject(fail(422,'Ответ 1С больше 8 МБ. Сократите опубликованный набор данных'));}else chunks.push(chunk);});
        res.on('error',reject);res.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));
      });req.on('error',reject);
    });
  }catch(e){if(e.status)throw e;throw fail(502,'Нет ответа от 1С. Проверьте соединение и HTTPS-сертификат');}finally{clearTimeout(timer);}
}

export function parseRows(text){
  let json;try{json=JSON.parse(text);}catch{throw fail(422,'1С вернула некорректный JSON');}
  const rows=json?.value??json?.d?.results??(Array.isArray(json?.d)?json.d:null);
  if(!Array.isArray(rows)||rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)))throw fail(422,'Ответ 1С не содержит список записей OData');
  return {rows,next:json['odata.nextLink']??json['@odata.nextLink']??json?.d?.__next??null};
}

export function createOneCClient({endpoint,username,password},{read=readOneC}={}){
  const base=new URL(normalizeOneCEndpoint(endpoint));
  let metadata;
  const request=(url,signal)=>read(url,{username,password,signal});
  const discover=async()=>metadata??(metadata=parseMetadata(await request(new URL('$metadata',base),AbortSignal.timeout(25000))));
  const loadRows=async(collection,limit,complete)=>{
    if(!identifier(collection))throw fail(400,'Некорректное имя коллекции');
    const known=(await discover()).find(c=>c.name===collection);
    if(!known)throw fail(400,'Коллекция отсутствует в публикации 1С');
    const url=new URL(encodeURIComponent(collection),base);
    url.searchParams.set('$format','json');url.searchParams.set('$top',String(limit));
    // Stable ordering is essential when the server divides results into pages.
    if(known.properties.some(p=>p.name==='Ref_Key'))url.searchParams.set('$orderby','Ref_Key');
    const signal=AbortSignal.timeout(90000),result=[],seen=new Set();let next=url;
    for(let page=0;next;page++){
      if(page>=100||seen.has(next.href))throw fail(422,'Некорректная пагинация 1С: импорт отменён');
      seen.add(next.href);
      const response=parseRows(await request(next,signal));result.push(...response.rows);
      if(!complete&&result.length>=limit)return result.slice(0,limit);
      if(result.length>1000)throw fail(422,'В коллекции больше 1000 записей. Ограничьте состав публикации; частичный импорт не выполняется');
      if(response.next){
        let target;try{target=new URL(response.next,next);}catch{throw fail(422,'Некорректная ссылка следующей страницы 1С');}
        // Follow paging only within this exact collection, never to another host/path.
        if(target.origin!==base.origin||target.pathname!==url.pathname||target.username||target.password||target.hash)throw fail(422,'Небезопасная ссылка следующей страницы 1С');
        next=target;
      }else if(complete&&response.rows.length){
        // $top may terminate without nextLink. Probe the next offset; never
        // mistake a full page for the entire collection.
        next=new URL(url);next.searchParams.set('$skip',String(result.length));
        next.searchParams.set('$top',String(Math.min(100,1001-result.length)));
      }else next=null;
    }
    // Some servers ignore $skip: repeated IDs would otherwise silently duplicate rows.
    if(known.properties.some(p=>p.name==='Ref_Key')){
      const keys=result.map(r=>r.Ref_Key).filter(k=>k!==undefined&&k!==null);
      if(new Set(keys.map(String)).size!==keys.length)throw fail(422,'1С вернула повторяющиеся идентификаторы. Проверьте пагинацию');
    }
    return result;
  };
  return {discover,sample:collection=>loadRows(collection,5,false),rows:collection=>loadRows(collection,100,true)};
}
