import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../../entities/workspace/api';
export type ChatEvent={conversationId?:string;messageId?:string;deletedAt?:string;type:string};
type Listener=(event:ChatEvent)=>void;
const listeners=new Set<Listener>();
let source:EventSource|null=null;
function subscribe(listener:Listener){listeners.add(listener);if(!source){source=new EventSource(API_BASE+'/api/chat/events',{withCredentials:true});source.addEventListener('change',event=>{try{const data=JSON.parse((event as MessageEvent).data) as ChatEvent;for(const fn of listeners)fn(data);}catch{/* Reconnect reconciles malformed or dropped events. */}});source.addEventListener('message.deleted',event=>{try{const data=JSON.parse((event as MessageEvent).data);if(typeof data.messageId!=='string'||typeof data.conversationId!=='string')return;for(const fn of listeners)fn({...data,type:'message.deleted'});}catch{/* History reconciliation handles missed events. */}});source.addEventListener('ready',()=>{for(const fn of listeners)fn({type:'ready'});});source.onerror=()=>{for(const fn of listeners)fn({type:'disconnected'});};}return()=>{listeners.delete(listener);if(!listeners.size){source?.close();source=null;}};}
export function useChatEvents(callback:Listener){const latest=useRef(callback);latest.current=callback;const [connected,setConnected]=useState(false);useEffect(()=>subscribe(event=>{setConnected(event.type!=='disconnected');latest.current(event);}),[]);return {connected};}
export function useDebounced<T>(value:T,delay=300){const [debounced,setDebounced]=useState(value);useEffect(()=>{const timer=setTimeout(()=>setDebounced(value),delay);return()=>clearTimeout(timer);},[value,delay]);return debounced;}
