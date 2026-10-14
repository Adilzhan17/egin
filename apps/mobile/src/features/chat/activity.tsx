import { useEffect, useRef, useState } from 'react';
import { chatApi } from './api';
import { useChatEvents } from './hooks';
import type { Person } from './types';
export type ActivityState = 'typing' | 'recording' | 'uploading';
type Activity = { user: Person; state: ActivityState; expiresAt: number; conversationId: string };
export function useChatActivity(userId: string) {
  const [items, setItems] = useState<Activity[]>([]);
  useChatEvents(event => {
    if (['disconnected', 'ready'].includes(event.type)) { setItems([]); return; }
    if (['revoked','members','blocked'].includes(event.type)) { setItems(current => current.filter(item => item.conversationId !== event.conversationId)); return; }
    if (event.type !== 'activity' || !event.user || event.user.id === userId || !event.conversationId) return;
    const user = event.user, conversationId = event.conversationId;
    const expiry = typeof event.expiresAt === 'number' ? event.expiresAt : Date.parse(event.expiresAt || '');
    setItems(current => {
      const next = current.filter(item => item.user.id !== user.id || item.conversationId !== conversationId);
      if (event.state && expiry > Date.now() && ['typing','recording','uploading'].includes(event.state)) next.push({ user, conversationId, state: event.state, expiresAt: Math.min(expiry, Date.now() + 12000) });
      return next;
    });
  });
  useEffect(() => { const offline=()=>setItems([]);window.addEventListener('offline',offline);const timer = setInterval(() => setItems(current => current.some(item => item.expiresAt <= Date.now()) ? current.filter(item => item.expiresAt > Date.now()) : current), 1000); return () => {clearInterval(timer);window.removeEventListener('offline',offline);}; }, []);
  return items;
}
export function ActivityLabel({ items, group = false }: { items: Activity[]; group?: boolean }) {
  if (!items.length) return null;
  const state = items.some(item => item.state === 'recording') ? 'recording' : items.some(item => item.state === 'uploading') ? 'uploading' : 'typing';
  const people = items.filter(item => item.state === state);
  const names = people.length > 2 ? 'Несколько участников' : people.map(item => item.user.name.split(' ')[0]).join(' и ');
  const verb = state === 'recording' ? (people.length > 1 ? 'записывают голосовое' : 'записывает голосовое') : state === 'uploading' ? (people.length > 1 ? 'отправляют файлы' : 'отправляет файл') : people.length > 1 ? 'печатают' : 'печатает';
  const label = group ? `${names} ${verb}` : state === 'recording' ? 'Записывает голосовое' : state === 'uploading' ? 'Отправляет файл' : 'Печатает';
  return <span className="chat-activity" role="status">{label}<span className="chat-typing-dots" aria-label="…"><i/><i/><i/></span></span>;
}
// One request every four seconds while active, plus a stop after idle/blur/unmount.
export function useActivityPublisher(id: string, enabled: boolean) {
  const state = useRef<ActivityState | null>(null), last = useRef(0), idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queue=useRef(Promise.resolve());
  const enqueue=(conversationId:string,value:ActivityState|null)=>{queue.current=queue.current.catch(()=>{}).then(()=>chatApi(`/conversations/${conversationId}/activity`,{state:value}).then(()=>{})).catch(()=>{if(state.current===value){state.current=null;last.current=0;}});};
  const enabledRef = useRef(enabled); enabledRef.current = enabled;
  const send = (value: ActivityState | null) => {
    if (!navigator.onLine || (value && document.hidden) || (!enabledRef.current && value)) return;
    if (value === state.current && value && Date.now() - last.current < 4000) return;
    if (!value && !state.current) return;
    state.current = value; last.current = Date.now();
    enqueue(id,value);
  };
  const latest = useRef(send); latest.current = send;
  const stop = () => { clearTimeout(idle.current); latest.current(null); };
  useEffect(() => {
    const hidden = () => { if (document.hidden) stop(); };
    const offline = () => { state.current = null; clearTimeout(idle.current); };
    document.addEventListener('visibilitychange', hidden); window.addEventListener('blur', stop); window.addEventListener('offline', offline);
    return () => { clearTimeout(idle.current);if(state.current&&navigator.onLine)enqueue(id,null);state.current=null; document.removeEventListener('visibilitychange', hidden); window.removeEventListener('blur', stop); window.removeEventListener('offline', offline); };
  }, [id]);
  useEffect(() => { if (!enabled) stop(); }, [enabled]);
  return { publish(value: ActivityState) { latest.current(value); clearTimeout(idle.current); idle.current = setTimeout(stop, 5000); }, stop };
}
