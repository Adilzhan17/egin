import { useEffect, useRef, useState } from 'react';
import { api, API_BASE } from '../../entities/workspace/api';
import { useChatEvents } from '../chat/hooks';

export type Organization = { id:string; name:string; kind:string; role:string; verificationStatus:string; version:number; isDemo?:boolean };
export type TradeFile = {id:string;name:string;mimeType:string;size:number;url:string;kind:string};
export type TradeRecord = {id:string;version:number;[key:string]:any};
export type Collection = {items:TradeRecord[];nextCursor?:string|null};
// Capture the selected company per request; never share mutable role state between requests.
export function organizationHeaders(path='',body?:unknown):Record<string,string> {
 const explicit=body&&typeof body==='object'&&'organizationId' in body?(body as {organizationId?:unknown}).organizationId:undefined;
 const id=typeof explicit==='string'?explicit:new URLSearchParams(path.split('?')[1]).get('organizationId')||new URLSearchParams(location.hash.split('?')[1]).get('organizationId');
 return id&&/^[0-9a-f-]{36}$/i.test(id)?{'X-EGIN-Organization':id}:{};
}
export const request = <T=any>(path:string,body?:unknown,method?:string) => api<T>('/trade'+path,body,method,20000,organizationHeaders(path,body));
export const errorText = (error:unknown) => error instanceof Error ? error.message : 'Не удалось выполнить операцию. Попробуйте ещё раз.';
export function navigate(screen='overview',params:Record<string,string>={}) { location.hash='#/market?'+new URLSearchParams({view:'trade',screen,...params}); }
export const money=(value:unknown,currency='KZT')=> value===null||value===undefined||value===''?'Не рассчитано':new Intl.NumberFormat('ru-RU',{style:'currency',currency,currencyDisplay:'narrowSymbol',maximumFractionDigits:2}).format(Number(value));
export const cropNames:Record<string,string>={wheat:'Пшеница',barley:'Ячмень',corn:'Кукуруза',sunflower:'Подсолнечник',rapeseed:'Рапс',soy:'Соя',potato:'Картофель',other:'Другая культура'};
export const quantity=(value:unknown)=>value===null||value===undefined?'—':new Intl.NumberFormat('ru-RU',{maximumFractionDigits:3}).format(Number(value))+' т';
export const date=(value?:string)=>value?new Date(value).toLocaleDateString('ru-RU'):'Не указана';
export const statusLabels:Record<string,string>={converted:'Создана сделка',reviewing:'На рассмотрении',contract_pending:'Договор ожидает второй стороны',confirmed_copy:'Копия подтверждена',awaiting_counterparty:'Ожидает другую сторону',partially_shipped:'Частично отгружено',at_acceptance:'На приёмке',partially_paid:'Частично оплачено',discrepancy:'Расхождения',reported:'Заявлено',draft:'Черновик',active:'Опубликовано',sent:'Отправлено',received:'Получено',review:'На рассмотрении',countered:'Встречное предложение',accepted:'Принято',rejected:'Отклонено',withdrawn:'Отозвано',expired:'Срок истёк',archived:'В архиве',offers_received:'Есть предложения',partially_reserved:'Частично зарезервировано',partially_sold:'Частично продано',sold:'Продано',created:'Сделка создана',negotiating:'Согласование',terms_agreed:'Условия согласованы',awaiting_documents:'Ожидаем документы',contract_preparing:'Подготовка договора',contract_confirmed:'Договор подтверждён',awaiting_shipment:'Ожидаем отгрузку',partial_shipped:'Частично отгружено',shipped:'Отгружено',receiving:'Приёмка',discrepancies:'Расхождения',awaiting_payment:'Ожидаем оплату',partial_paid:'Частично оплачено',paid:'Оплачено',completed:'Завершено',cancelled:'Отменено',dispute:'Спор',pending:'Ожидает подтверждения',confirmed:'Подтверждено',unverified:'Не проверено',verified:'Проверено'};
export const status=(value:string)=>statusLabels[value]||value;
export function useResource<T>(path:string|null,platform=false) {
 const [data,setData]=useState<T|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0),previousPath=useRef<string|null>(null),refreshTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 useChatEvents(event=>{if(path&&path!=='/crops'&&(event.type==='platform'||event.type==='ready')){clearTimeout(refreshTimer.current);refreshTimer.current=setTimeout(()=>setRevision(n=>n+1),450);}});
 useEffect(()=>{const refresh=()=>{if(!document.hidden&&path)setRevision(n=>n+1);};window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);return()=>{clearTimeout(refreshTimer.current);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh);};},[path]);
 useEffect(()=>{let live=true;const changed=previousPath.current!==path;previousPath.current=path;if(changed){setLoading(true);setData(null);}setError('');if(!path){setLoading(false);return;}void (platform?api<T>('/platform'+path):request<T>(path)).then(r=>{if(live)setData(r);}).catch(e=>{if(live)setError(errorText(e));}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[path,revision,platform]);
 return {data,loading,error,reload:()=>setRevision(n=>n+1),setData};
}
export async function upload(file:File,organizationId:string,dealId?:string):Promise<TradeFile> {
 if(file.size>15*1024*1024)throw new Error('Файл должен быть меньше 15 МБ.');
 const query=new URLSearchParams({organizationId,kind:file.type.startsWith('image/')?'image':'document',name:file.name});if(dealId)query.set('dealId',dealId);
 const response=await fetch(API_BASE+'/api/trade/files?'+query,{method:'POST',credentials:'include',headers:{'Content-Type':'application/octet-stream','X-EGIN':'1','X-EGIN-Organization':organizationId},body:file,signal:AbortSignal.timeout(120000)});
 const result=await response.json();if(!response.ok)throw new Error(result.error?.message||result.error||'Файл не загружен');return result.file;
}
export const fileUrl=(url:string)=>url.startsWith('/api/')?API_BASE+url:url;
