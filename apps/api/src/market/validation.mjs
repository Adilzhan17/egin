export const fail=(status,message,fields)=>Object.assign(new Error(message),{status,...(fields?{fields}:{})});
export const uuid=value=>typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const allowed=new Set(['clientId','version','categoryId','dealType','title','description','attributes','attributesSchemaVersion','priceMode','priceAmount','currencyCode','priceUnit','quantity','quantityUnit','countryCode','regionCode','districtCode','localityCode','localityName','currentStep','contactPhone','allowPhone','delivery']);
const strings={title:120,description:5000,quantityUnit:20,localityName:120,contactPhone:40,delivery:1000,regionCode:24,districtCode:40,localityCode:60};
const enums={dealType:['sell','buy','rent_out','rent_in','service_offer','service_request','vacancy','job_seeking'],priceMode:['fixed','from','negotiable'],currencyCode:['KZT'],countryCode:['KZ'],priceUnit:['ton','kg','piece','ha','hour','day','month','all']};
export function validatePatch(input){
  if(!object(input)) throw fail(400,'Ожидается объект объявления');
  if(Object.keys(input).some(key=>!allowed.has(key))) throw fail(400,'В объявлении есть неизвестные поля');
  const result={...input};
  for(const [key,max] of Object.entries(strings)) if(key in input){if(typeof input[key]!=='string'||input[key].length>max) throw fail(400,`Некорректное поле: ${key}`);result[key]=input[key].trim();}
  for(const [key,values] of Object.entries(enums)) if(key in input && !values.includes(input[key])) throw fail(400,`Некорректное поле: ${key}`);
  for(const key of ['priceAmount','quantity']) if(key in input && input[key]!==null && (!Number.isFinite(input[key])||input[key]<0||input[key]>999999999999)) throw fail(400,'Цена и количество должны быть положительными числами');
  if('categoryId' in input && (typeof input.categoryId!=='string'||!/^[-a-z0-9]{1,80}$/.test(input.categoryId))) throw fail(400,'Выберите категорию');
  if('attributes' in input && (!object(input.attributes)||JSON.stringify(input.attributes).length>16000)) throw fail(400,'Проверьте характеристики');
  for(const key of ['version','attributesSchemaVersion']) if(key in input && (!Number.isInteger(input[key])||input[key]<1)) throw fail(400,'Некорректная версия');
  if('currentStep' in input && (!Number.isInteger(input.currentStep)||input.currentStep<1||input.currentStep>5)) throw fail(400,'Некорректный шаг');
  if('allowPhone' in input && typeof input.allowPhone!=='boolean') throw fail(400,'Проверьте разрешение на публикацию телефона');
  if('clientId' in input && !uuid(input.clientId)) throw fail(400,'Некорректный идентификатор черновика');
  return result;
}
export function validateAttributes(attributes,schema,dealType,strict=false){
  const errors=[],fields={};
  for(const key of Object.keys(attributes)) if(!schema.fields.some(field=>field.key===key)) errors.push(`Неизвестная характеристика ${key}`);
  for(const field of schema.fields){
    if(field.dealTypes && !field.dealTypes.includes(dealType)) continue;
    if(field.showWhen && attributes[field.showWhen.key]!==field.showWhen.value) continue;
    const value=attributes[field.key],empty=value===undefined||value===null||(typeof value==='string'&&!value.trim())||(Array.isArray(value)&&value.length===0);
    if(empty){if(strict && field.required){const message=`Укажите: ${field.label}`;errors.push(message);fields[field.key]=message;}continue;}
    let valid=true;
    if(field.type==='text') valid=typeof value==='string'&&value.length<=(field.maxLength||500);
    if(field.type==='number') valid=Number.isFinite(value)&&(field.min===undefined||value>=field.min)&&(field.max===undefined||value<=field.max);
    if(field.type==='boolean') valid=typeof value==='boolean';
    if(field.type==='select') valid=field.options.some(option=>option.value===value);
    if(field.type==='multiselect') valid=Array.isArray(value)&&value.length<=field.options.length&&new Set(value).size===value.length&&value.every(v=>field.options.some(option=>option.value===v));
    if(field.type==='date'){const parsed=new Date(`${value}T00:00:00Z`);valid=typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;}
    if(!valid){const message=`Проверьте: ${field.label}`;errors.push(message);fields[field.key]=message;}
  }
  if(errors.length) throw fail(422,errors.join('. '),fields);
}
export function validatePublish(listing,category,imageCount){
  const reject=(key,message)=>{throw fail(422,message,{[key]:message});};
  if(!category?.parentId) reject('categoryId','Выберите подкатегорию');
  if(!category.dealTypes.includes(listing.dealType)) reject('dealType','Выберите подходящий тип сделки');
  if(listing.title.trim().length<5) reject('title','Название должно содержать хотя бы 5 символов');
  if(listing.description.trim().length<20) reject('description','Добавьте описание хотя бы из 20 символов');
  if(!category.priceUnits.includes(listing.priceUnit)) reject('priceUnit','Выберите подходящую единицу цены');
  if(listing.priceMode!=='negotiable' && !(listing.priceAmount>0)) reject('priceAmount','Укажите цену больше нуля');
  if(!listing.regionCode) reject('regionCode','Укажите область');
  if(!listing.districtCode) reject('districtCode','Укажите район');
  if(!listing.localityName.trim()) reject('localityName','Укажите населённый пункт');
  if(category.requiresPhoto && ['sell','rent_out'].includes(listing.dealType) && imageCount<1) reject('images','Добавьте хотя бы одну фотографию');
  if(listing.allowPhone && !/^\+?[\d ()-]{7,40}$/.test(listing.contactPhone)) reject('contactPhone','Проверьте контактный телефон');
  validateAttributes(listing.attributes,category.attributeSchema,listing.dealType,true);
}
