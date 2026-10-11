import { API_BASE } from '../../entities/workspace/api';

export class MarketApiError extends Error {
  status:number; fields:Record<string,string>; details:unknown;
  constructor(message:string,status:number,data:Record<string,unknown>){super(message);this.name='MarketApiError';this.status=status;this.fields=(data.fields || {}) as Record<string,string>;this.details=data;}
}
export async function marketRequest<T>(path:string,body?:unknown,method=body===undefined?'GET':'POST',signal?:AbortSignal):Promise<T>{
  const form=typeof FormData!=='undefined'&&body instanceof FormData;
  const response=await fetch(`${API_BASE}/api/market${path}`,{method,credentials:'include',headers:{'X-EGIN':'1',...(!form&&body!==undefined?{'Content-Type':'application/json'}:{})},...(body===undefined?{}:{body:form?body:JSON.stringify(body)}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000)});
  const data=await response.json().catch(()=>({error:'Сервер временно недоступен. Попробуйте ещё раз.'}));
  if(!response.ok)throw new MarketApiError(typeof data.error==='string'?data.error:data.error?.message||data.message||'Не удалось выполнить запрос',response.status,data);
  return data as T;
}
export function marketError(error:unknown){return error instanceof Error?(error.message==='Failed to fetch'?'Нет связи с сервером. Проверьте подключение.':error.message):'Не удалось выполнить действие';}
export function marketRoute(view='catalog',params:Record<string,string|undefined>={}){const query=new URLSearchParams();if(view!=='catalog')query.set('view',view);for(const [key,value]of Object.entries(params))if(value)query.set(key,value);location.hash=`/market${query.size?'?'+query:''}`;}
export const dealLabels:Record<string,string>={sell:'Продажа',buy:'Куплю',rent_out:'Аренда',rent_in:'Возьму в аренду',service_offer:'Услуга',service_request:'Ищу услугу',vacancy:'Вакансия',job_seeking:'Ищу работу'};
export const unitLabels:Record<string,string>={ton:'т',tonne:'т',t:'т',kg:'кг',piece:'шт.',item:'шт.',ha:'га',hour:'час',day:'сутки',month:'мес.',all:'весь товар',total:'всё',unit:'шт.'};
export function formatPrice(listing:{priceMode:string;priceAmount:number|null;priceUnit:string}){if(listing.priceMode==='negotiable'||listing.priceAmount==null)return 'Договорная';return `${listing.priceMode==='from'?'от ':''}${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(listing.priceAmount)} ₸${listing.priceUnit&&!['total','all'].includes(listing.priceUnit)?'/'+(unitLabels[listing.priceUnit]||listing.priceUnit):''}`;}
