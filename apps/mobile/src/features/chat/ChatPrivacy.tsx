import { useEffect, useState } from 'react';
import { chatApi, chatError } from './api';
import { ChatSheet, ErrorNotice } from './components';
import { useChatEvents } from './hooks';
import type { Person } from './types';
type Privacy={sharePresence:boolean;shareReadReceipts:boolean};
export function useChatPresence(){
 useEffect(()=>{
  let stopped=false,leaving=false;
  const update=()=>{if(!stopped&&!leaving&&navigator.onLine&&document.visibilityState==='visible')void chatApi('/presence',{active:true}).catch(()=>{});};
  const pagehide=()=>{leaving=true;},pageshow=()=>{leaving=false;update();};
  update();const timer=setInterval(update,25000);
  document.addEventListener('visibilitychange',update);window.addEventListener('online',update);window.addEventListener('pagehide',pagehide);window.addEventListener('pageshow',pageshow);
  return()=>{stopped=true;clearInterval(timer);document.removeEventListener('visibilitychange',update);window.removeEventListener('online',update);window.removeEventListener('pagehide',pagehide);window.removeEventListener('pageshow',pageshow);
   // Safari forbids starting fetch from a disappearing document. Background/closed
   // pages expire on the server after 40 seconds; an in-app exit can stop now.
   if(!leaving&&!document.hidden&&navigator.onLine)void chatApi('/presence',{active:false}).catch(()=>{});
  };
 },[]);
}
export function usePeerPresence(id:string){
 const [items,setItems]=useState<{user:Person;online:boolean;lastSeen:string|null;visible:boolean}[]>([]),[revision,setRevision]=useState(0);
 useChatEvents(e=>{if(e.type==='disconnected')setItems([]);if(e.type==='ready'||e.conversationId===id&&['presence','privacy','members'].includes(e.type))setRevision(x=>x+1);});
 useEffect(()=>{let active=true;const load=()=>{if(document.hidden)return;void chatApi<{items:typeof items}>(`/conversations/${id}/presence`).then(r=>{if(active)setItems(r.items)}).catch(()=>{if(active)setItems([])});};load();const timer=setInterval(load,30000);return()=>{active=false;clearInterval(timer)};},[id,revision]);
 return items;
}
export function ChatPrivacy({onClose}:{onClose:()=>void}){
 const [value,setValue]=useState<Privacy|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;chatApi<{privacy:Privacy}>('/privacy').then(r=>{if(active)setValue(r.privacy)}).catch(e=>{if(active)setError(chatError(e))});return()=>{active=false};},[]);
 async function save(){setBusy(true);try{await chatApi('/privacy',value,'PATCH');onClose();}catch(e){setError(chatError(e))}finally{setBusy(false)}}
 return <ChatSheet title="Приватность чата" onClose={onClose} dismissDisabled={busy}><ErrorNotice message={error}/>{value?<div className="chat-form"><label className="chat-choice"><input type="checkbox" checked={value.sharePresence} onChange={e=>setValue({...value,sharePresence:e.target.checked})}/><span>Показывать «В сети»<small>Собеседники видят активность и время последнего посещения Чата. По умолчанию выключено.</small></span></label><label className="chat-choice"><input type="checkbox" checked={value.shareReadReceipts} onChange={e=>setValue({...value,shareReadReceipts:e.target.checked})}/><span>Подтверждения прочтения<small>Передавать собеседникам факт просмотра сообщения. Доставка продолжает подтверждаться независимо.</small></span></label><button className="chat-button" disabled={busy} onClick={()=>void save()}>{busy?'Сохраняем…':'Сохранить'}</button></div>:!error&&<p className="chat-muted">Загружаем настройки…</p>}</ChatSheet>;
}
