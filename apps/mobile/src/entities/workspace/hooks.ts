import { useEffect,useState } from 'react';
import { all, meta, notify, owner, records, setMeta } from './db';
import { runSync } from './sync-engine.js';
import { api, API_BASE } from './api';
import type { Data, Kind, Row, SessionUser } from './types';
export function useRows<T=Data>(kind?:Kind){const [rows,setRows]=useState<Row<T>[]>([]),[error,setError]=useState('');useEffect(()=>{let active=true;const load=()=>records<T>(kind).then(r=>{if(active)setRows(r);}).catch(e=>{if(active)setError(e.message);});void load();window.addEventListener('egin-data',load);return()=>{active=false;window.removeEventListener('egin-data',load);};},[kind]);return {rows,error};}
export function useMeta<T>(key:string,fallback:T){const [value,setValue]=useState(fallback);useEffect(()=>{let active=true;const load=()=>meta(key,fallback).then(v=>{if(active)setValue(v);}).catch(()=>{});void load();window.addEventListener('egin-data',load);return()=>{active=false;window.removeEventListener('egin-data',load);};},[key]);return value;}
let running:Promise<void>|null=null;
export async function syncNow(){if(running)return running;running=(async()=>{await setMeta('syncStatus',{state:'syncing',message:'Синхронизация…'});const result=await runSync();await setMeta('syncStatus',result);notify();})().finally(()=>{running=null;});return running;}
export function useSync(){useEffect(()=>{let timer:number|undefined;let stopped=false;
  const queue=()=>{clearTimeout(timer);timer=window.setTimeout(async()=>{if(!stopped&&await meta('autoSync',true)){const who=await owner();if(who==='guest')return;const pending=(await all<Row>('records')).some(r=>r.owner===who&&r.dirty&&!r.conflict);if(pending){if(navigator.onLine)void syncNow();void navigator.serviceWorker?.ready.then(r=>(r as ServiceWorkerRegistration & {sync?:{register:(s:string)=>Promise<void>}}).sync?.register('egin-sync')).catch(()=>{});}}},1800);};
  const reconnect=()=>{if(!document.hidden)void meta('autoSync',true).then(on=>{if(on)void syncNow();});};
  void setMeta('apiBase',API_BASE);
  void api<{user:SessionUser|null}>('/session').then(async result=>{if(result.user&&result.user.id===await owner())await setMeta('user',result.user);else if(!result.user&&await owner()!=='guest')await setMeta('syncStatus',{state:'auth',message:'Подтвердите вход для синхронизации'});}).catch(()=>{});
  window.addEventListener('online',reconnect);window.addEventListener('egin-write',queue);document.addEventListener('visibilitychange',reconnect);
  const sw=()=>{notify();};navigator.serviceWorker?.addEventListener('message',sw);
  const interval=setInterval(reconnect,60000);reconnect();
  return()=>{stopped=true;clearTimeout(timer);clearInterval(interval);window.removeEventListener('online',reconnect);window.removeEventListener('egin-write',queue);document.removeEventListener('visibilitychange',reconnect);navigator.serviceWorker?.removeEventListener('message',sw);};},[]);}
