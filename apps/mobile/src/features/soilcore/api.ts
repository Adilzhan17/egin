import {API_BASE} from '../../entities/workspace/api';
export async function stationApi<T>(path:string,body?:unknown,signal?:AbortSignal,method?:string):Promise<T>{
  const response=await fetch(`${API_BASE}/api/soilcore${path}`,{method:method||(body===undefined?'GET':'POST'),credentials:'include',headers:{'Content-Type':'application/json','X-EGIN':'1'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:signal||AbortSignal.timeout(15000)});
  const result=await response.json().catch(()=>({error:'Сервер EGIN недоступен'}));if(!response.ok)throw Object.assign(new Error(result.error||'Запрос не выполнен'),{status:response.status});return result as T;
}
