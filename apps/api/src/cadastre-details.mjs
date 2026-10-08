// Public-map information is descriptive; it is not evidence of title or a legal extract.
export const CADASTRE_SOURCE_URL = 'https://map.gov4c.kz/egkn/';
const fail = message => Object.assign(new Error(message), { status: 400 });
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const CONTROL = /[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/;
const text = (value, max) => typeof value === 'string' ? value.replace(/<[^>]*>/g,' ').replace(/[<>\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/g,' ').trim().slice(0,max) || undefined : undefined;
const number = (value, max) => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d{1,16}(?:\.\d{1,12})?$/.test(value.trim()) ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= max ? n : undefined;
};
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T[\d:.+-]+Z?)?$/.test(value) && value.length <= 35 && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined;
const LEGAL_NAME = /^(?:ТОО|АО|НАО|КГУ|ГУ|КГП|ГКП|РГП|РГУ|КГКП|ОЮЛ|ОО|ПК|СПК|ПТ|КТ|ТДО|ЖШС|АҚ|КММ|КМК|РМК|ҚБ|LLP|JSC|LLC|Товарищество с ограниченной ответственностью|Акционерное общество|Государственное учреждение|Республиканское государственное предприятие|Коммунальное государственное учреждение)(?=[\s"«(]|$)/iu;
const rows = source => object(source) && Array.isArray(source.items) ? source.items.slice(0,100) : [];
function ownerItems(source) {
  return rows(source).filter(object).slice(0,20).map(item => {
    // The official owner's tab displays nameUl (legal entity name) and BIN.
    // Require both that documented shape and a legal form; never use generic
    // name/fio/chargeOwnerRu fields that may contain a private person's name.
    const legalName = text(item.nameUl,250);
    if (legalName && LEGAL_NAME.test(legalName) && typeof item.bin === 'string' && /^\d{12}$/.test(item.bin) && !item.iin) return {type:'organization',name:legalName};
    if (item.iin || item.nameFl || item.fio || item.personType === 'physical' || item.personType === 'individual') return {type:'individual',name:'Физическое лицо'};
    return {type:'unknown'};
  });
}
function chargeItems(source, kind) {
  return rows(source).filter(object).slice(0,25).map(item => {
    const type=text(item.chargeTypeRu,200),registeredAt=date(item.regDate),closedAt=date(item.regDateClose);
    return {kind,...(type?{type}:{}),...(registeredAt?{registeredAt}:{}),...(closedAt?{closedAt}:{})};
  });
}
export function createCadastreDetails(properties, {cadastralNumber,fetchedAt,region,district} = {}) {
  const p=object(properties)?properties:{};
  const details={sourceUrl:CADASTRE_SOURCE_URL,fetchedAt,cadastralNumber,status:'unknown'};
  const fields={address:['address_ru',600],addressKz:['address_kz',600],addressCode:['rka',80],category:['category_ru',400],purpose:['tsn_ru',1200],purposeKz:['tsn_kz',1200],rightType:['pravo_ru',300],statusLabel:['status_name',150]};
  for(const [target,[source,max]] of Object.entries(fields)){const value=text(p[source],max);if(value!==undefined)details[target]=value;}
  for(const [key,value] of Object.entries({region,district})){const name=text(value,150);if(name)details[key]=name;}
  const registeredArea=number(p.squ,10_000_000_000),perimeter=number(p.shape_length,100_000_000),cost=number(p.cost,1_000_000_000_000_000);
  if(registeredArea!==undefined)details.registeredAreaHa=registeredArea/10000;
  if(perimeter!==undefined)details.perimeterM=perimeter;
  // Confirmed official map formatter: cost -> cost_kzt_2 -> value.toFixed(2) + тг.
  if(cost!==undefined)details.costKzt=cost;
  if(date(p.date_end)||/архив|прекращ[её]н|жойылған|күші жойылған/iu.test(details.statusLabel||''))details.status='archived';
  else if(/^(?:действующ(?:ий|ая|ее)|актуальн(?:ый|ая|ое)|қолданыста)$/iu.test(details.statusLabel||''))details.status='active';
  const owners=ownerItems(p.owners),encumbrances=[...chargeItems(p.arrests,'arrest'),...chargeItems(p.obrems,'encumbrance')];
  details.owners={availability:owners.length?'available':'not_provided',items:owners};
  details.encumbrances={availability:encumbrances.length?'available':'not_provided',items:encumbrances};
  validateCadastreDetails(details);
  return details;
}
const TEXT_LIMITS={region:150,district:150,address:600,addressKz:600,addressCode:80,category:400,purpose:1200,purposeKz:1200,rightType:300,statusLabel:150};
const NUM_LIMITS={registeredAreaHa:1_000_000,perimeterM:100_000_000,costKzt:1_000_000_000_000_000};
function plain(value,max){return typeof value==='string'&&value.length>0&&value.length<=max&&value===value.trim()&&!CONTROL.test(value)&&!/[<>]/.test(value);}
function exactKeys(value,keys){return object(value)&&Object.keys(value).every(key=>keys.includes(key));}
function iso(value){return typeof value==='string'&&value.length<=30&&date(value)===value;}
export function validateCadastreDetails(details) {
  const keys=['sourceUrl','fetchedAt','cadastralNumber','status','owners','encumbrances',...Object.keys(TEXT_LIMITS),...Object.keys(NUM_LIMITS)];
  if(!exactKeys(details,keys)||details.sourceUrl!==CADASTRE_SOURCE_URL||!iso(details.fetchedAt)||typeof details.cadastralNumber!=='string'||!/^\d{11,12}$/.test(details.cadastralNumber)||!['active','archived','unknown'].includes(details.status))throw fail('Некорректные сведения публичной кадастровой карты');
  for(const [key,max] of Object.entries(TEXT_LIMITS))if(details[key]!==undefined&&!plain(details[key],max))throw fail('Некорректный текст в сведениях кадастра');
  for(const [key,max] of Object.entries(NUM_LIMITS))if(details[key]!==undefined&&(typeof details[key]!=='number'||!Number.isFinite(details[key])||details[key]<0||details[key]>max))throw fail('Некорректное числовое значение в сведениях кадастра');
  for(const [key,max] of [['owners',20],['encumbrances',50]]){
    const group=details[key];
    if(!exactKeys(group,['availability','items'])||!['available','not_provided'].includes(group.availability)||!Array.isArray(group.items)||group.items.length>max||(group.availability==='available')!==(group.items.length>0))throw fail('Некорректный список сведений кадастра');
    for(const item of group.items){
      if(key==='owners'){
        if(!exactKeys(item,['type','name'])||!['organization','individual','unknown'].includes(item.type))throw fail('Некорректные сведения о правообладателе');
        if(item.type==='organization'&&(!plain(item.name,250)||!LEGAL_NAME.test(item.name)))throw fail('Допускается только наименование юридического лица');
        if(item.type==='individual'&&item.name!=='Физическое лицо'||item.type==='unknown'&&item.name!==undefined)throw fail('Персональные данные правообладателей не сохраняются');
      }else{
        if(!exactKeys(item,['kind','type','registeredAt','closedAt'])||!['arrest','encumbrance'].includes(item.kind)||item.type!==undefined&&!plain(item.type,200)||item.registeredAt!==undefined&&!iso(item.registeredAt)||item.closedAt!==undefined&&!iso(item.closedAt))throw fail('Некорректные сведения об ограничениях');
      }
    }
  }
}
