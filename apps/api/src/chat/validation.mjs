export const fail=(status,message)=>Object.assign(new Error(message),{status});
export const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export const categories=['crops','livestock','agronomy','machinery','logistics','trade','jobs','other'];
export const object=v=>v&&typeof v==='object'&&!Array.isArray(v)&&!Buffer.isBuffer(v);
export function text(v,max=4000,required=false){if(typeof v!=='string'||v.length>max||(required&&!v.trim())||/\u0000/.test(v))throw fail(422,'Проверьте длину и содержимое текста');return v.normalize('NFC').trim();}
export function fields(body,allowed){if(!object(body)||Object.keys(body).some(k=>!allowed.includes(k)))throw fail(400,'Некорректные поля запроса');}
export function positive(v,fallback=0){if(v===undefined||v==='')return fallback;const n=Number(v);if(!Number.isSafeInteger(n)||n<0)throw fail(400,'Некорректный номер сообщения');return n;}
export function validateMessage(body){
  fields(body,['clientId','kind','text','attachmentIds','replyToMessageId','listingId','location']);
  if(!uuid(body.clientId)||!['text','image','document','audio','listing_reference','location'].includes(body.kind))throw fail(422,'Проверьте тип сообщения');
  const result={...body,text:text(body.text??''),attachmentIds:body.attachmentIds??[]};
  if(!Array.isArray(result.attachmentIds)||result.attachmentIds.length>10||!result.attachmentIds.every(uuid)||new Set(result.attachmentIds).size!==result.attachmentIds.length)throw fail(422,'Можно прикрепить до 10 фотографий');
  if(body.replyToMessageId&&!uuid(body.replyToMessageId))throw fail(422,'Некорректный ответ');
  if(body.kind==='text'&&!result.text)throw fail(422,'Введите сообщение');
  if(['image','audio','document'].includes(body.kind)){if(!result.attachmentIds.length||(body.kind!=='image'&&result.attachmentIds.length!==1))throw fail(422,'Прикрепите файл');}
  else if(result.attachmentIds.length)throw fail(422,'Тип вложения не соответствует сообщению');
  if(body.kind==='listing_reference'&&!uuid(body.listingId))throw fail(422,'Выберите объявление');
  if(body.kind!=='listing_reference'&&body.listingId)throw fail(422,'Неожиданное объявление');
  if(body.kind==='location'){
    const v=body.location;fields(v,['latitude','longitude','label']);
    if(!Number.isFinite(v.latitude)||Math.abs(v.latitude)>90||!Number.isFinite(v.longitude)||Math.abs(v.longitude)>180)throw fail(422,'Проверьте координаты');
    result.location={latitude:v.latitude,longitude:v.longitude,...(v.label?{label:text(v.label,160)}:{})};
  } else if(body.location)throw fail(422,'Неожиданные координаты');
  return result;
}
export function validateGroup(body,partial=false){
  fields(body,['name','description','category','region','access']);const value={};
  for(const [k,max]of [['name',100],['description',1000],['region',120]])if(body[k]!==undefined||!partial)value[k]=text(body[k]??'',max,k==='name');
  if(body.category!==undefined||!partial){if(!categories.includes(body.category))throw fail(422,'Выберите тему');value.category=body.category;}
  if(body.access!==undefined||!partial){if(!['public','private'].includes(body.access))throw fail(422,'Выберите доступ');value.access=body.access;}
  return value;
}
