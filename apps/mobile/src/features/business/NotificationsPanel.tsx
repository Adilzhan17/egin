import {useEffect,useMemo,useRef,useState,type RefObject} from 'react';
import {businessRequest,businessError} from './api';
import {Section,Empty,ErrorNotice,Loading,useBusinessResource,Hint} from './ui';

type Notification={id:string;sequence:number;type:string;entityType:string;entityId:string;payload:Record<string,unknown>;readAt:string|null;deliveredAt?:string|null;createdAt:string};
type Destination={organizationId:string;view:'trade'|'business';screen?:string;tab?:string;id?:string;invoiceId?:string};
type Page={items:Notification[];nextCursor:number|null;unread:number;enabled:boolean};
const names:Record<string,string>={
 'offer.created':'Новое предложение покупателя','offer.sent':'Предложение отправлено','offer.revised':'Условия предложения изменены','offer.accepted':'Предложение принято','offer.reject':'Предложение отклонено','offer.withdraw':'Предложение отозвано','offer.expired':'Срок предложения истёк',
 'deal.created':'Новая сделка','deal.updated':'Сделка обновлена','deal.agree_terms':'Условия сделки подтверждены','deal.request_documents':'Запрошены документы сделки','deal.confirm_contract':'Копия договора подтверждена','deal.ready_to_ship':'Подтверждена готовность к отгрузке','deal.cancel':'Сделка отменена','deal.dispute':'Открыт спор по сделке','deal.resolve_dispute':'Спор по сделке урегулирован','deal.complete':'Сделка завершена',
 'shipment.created':'Новая отгрузка','shipment.accepted':'Приёмка обновлена','shipment.discrepancy_resolved':'Расхождение при приёмке урегулировано','document.uploaded':'Добавлен документ сделки','document.confirmed':'Документ сделки подтверждён',
 'payment.reported':'Заявлена оплата','payment.confirmed':'Оплата подтверждена','payment.rejected':'Заявление об оплате отклонено','payment.overdue':'Наступил срок оплаты',
 'lot.created':'Добавлена партия урожая','lot.updated':'Партия урожая обновлена','listing.created':'Публикация создана','listing.updated':'Публикация обновлена','listing.search_match':'Новая публикация по сохранённому поиску','expense.created':'Добавлен расход','expense.updated':'Расход обновлён','expense.deleted':'Расход удалён',
 'organization.invitation':'Приглашение в организацию','organization.updated':'Профиль организации обновлён','verification.reviewed':'Результат проверки организации','subscription.trial':'Предоставлен пробный доступ',
 'invoice.issued':'Выставлен счёт','payment.claimed':'Банковская оплата заявлена','payment.reviewed':'Банковская оплата проверена','invoice.refunded':'Возврат подтверждён','lead.reviewed':'Проверка заявки завершена','lead.withdrawn':'Заявка отозвана','service.invited':'Запрос партнёрской услуги','service.offer':'Новое предложение услуги','service.offer_updated':'Предложение услуги изменено',
};
function destinationHash(value:Destination){
 if(!value||!['trade','business'].includes(value.view)||!value.organizationId)throw Error('Связанный раздел недоступен');
 const params=new URLSearchParams({view:value.view,organizationId:value.organizationId});
 for(const key of ['screen','tab','id','invoiceId'] as const)if(typeof value[key]==='string')params.set(key,value[key]);
 return '#/market?'+params;
}
/** Delivery acknowledges a visible row, not merely a history download. */
function useVisibleDelivery(root:RefObject<HTMLDivElement|null>,items:Notification[]){
 const acknowledged=useRef(new Set<string>()),pending=useRef(new Set<string>());
 const rows=useMemo(()=>items.map(n=>({id:n.id,deliveredAt:n.deliveredAt})),[items]);
 useEffect(()=>{
  const visible=new Set<string>();let timer:ReturnType<typeof setTimeout>|null=null,active=true;
  for(const n of rows)if(n.deliveredAt)acknowledged.current.add(n.id);
  const flush=()=>{timer=null;if(!active||document.visibilityState!=='visible')return;
   const ids=[...visible].filter(id=>!acknowledged.current.has(id)&&!pending.current.has(id)).slice(0,100);
   if(!ids.length)return;ids.forEach(id=>pending.current.add(id));
   void businessRequest('/notifications/acknowledge',{ids,read:false}).then(()=>ids.forEach(id=>acknowledged.current.add(id))).catch(()=>{/* Retry on visibility, online or next intersection. */}).finally(()=>ids.forEach(id=>pending.current.delete(id)));
  };
  const schedule=()=>{if(timer)clearTimeout(timer);if(document.visibilityState==='visible')timer=setTimeout(flush,120);};
  const observer=new IntersectionObserver(entries=>{for(const entry of entries){const id=(entry.target as HTMLElement).dataset.notificationId;if(!id)continue;if(entry.isIntersecting&&entry.intersectionRatio>=.5)visible.add(id);else visible.delete(id);}schedule();},{threshold:[0,.5]});
  root.current?.querySelectorAll('[data-notification-id]').forEach(el=>observer.observe(el));
  document.addEventListener('visibilitychange',schedule);window.addEventListener('online',schedule);
  return()=>{active=false;if(timer)clearTimeout(timer);observer.disconnect();document.removeEventListener('visibilitychange',schedule);window.removeEventListener('online',schedule);};
 },[root,rows]);
}
export function NotificationsPanel(_props:{organizationId:string}){
 const resource=useBusinessResource<Page>('/notifications'),[older,setOlder]=useState<Notification[]>([]),[cursor,setCursor]=useState<number|null|undefined>(),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[enabled,setEnabled]=useState(true),[read,setRead]=useState<Set<string>>(()=>new Set()),[error,setError]=useState('');
 const root=useRef<HTMLDivElement>(null),mutation=useRef(false),preferenceMutation=useRef(false);
 useEffect(()=>{if(resource.data)setEnabled(resource.data.enabled);},[resource.data?.enabled]);
 const items=useMemo(()=>[...(resource.data?.items||[]),...older.filter(n=>!resource.data?.items.some(v=>v.id===n.id))],[resource.data?.items,older]);
 useVisibleDelivery(root,items);
 async function preference(){if(preferenceMutation.current||!resource.data)return;preferenceMutation.current=true;setSaving(true);setError('');const next=!enabled;
  try{await businessRequest('/notifications/preferences',{enabled:next},'PATCH');setEnabled(next);resource.reload();}catch(e){setError(businessError(e));}finally{preferenceMutation.current=false;setSaving(false);}
 }
 async function open(n:Notification){if(mutation.current)return;mutation.current=true;setBusy(true);setError('');try{
  const result=await businessRequest<{destination:Destination}>('/notifications/'+encodeURIComponent(n.id)+'/destination');const hash=destinationHash(result.destination);
  await businessRequest('/notifications/acknowledge',{ids:[n.id],read:true});setRead(old=>new Set(old).add(n.id));resource.reload();
  location.hash=hash;window.dispatchEvent(new HashChangeEvent('hashchange'));
 }catch(e){setError(businessError(e));}finally{mutation.current=false;setBusy(false);}}
 async function more(){const next=cursor??resource.data?.nextCursor;if(mutation.current||!next)return;mutation.current=true;setBusy(true);setError('');try{const r=await businessRequest<Page>('/notifications?before='+next);setOlder(old=>[...old,...r.items.filter(n=>!old.some(v=>v.id===n.id))]);setCursor(r.nextCursor);}catch(e){setError(businessError(e));}finally{mutation.current=false;setBusy(false);}}
 const unread=resource.data?.unread||0;
 return <div ref={root}><Section title={'Деловые события'+(enabled&&unread?' · '+unread:'')}>
  <label className="business-check"><input type="checkbox" checked={enabled} disabled={!resource.data||saving} onChange={()=>void preference()}/><span>Счётчик новых событий</span></label>
  <Hint>Счётчик и выделение непрочитанных можно отключить. История и новые события сохраняются; системные уведомления телефона эта настройка не включает.</Hint>
  <ErrorNotice error={resource.error||error} onRetry={resource.reload}/>
  {resource.loading?<Loading/>:!items.length?<Empty title="Событий пока нет">Предложения, сделки и подтверждения появятся здесь.</Empty>:items.map(n=><button key={n.id} data-notification-id={n.id} disabled={busy} className="business-notification" data-unread={enabled&&!n.readAt&&!read.has(n.id)} onClick={()=>void open(n)}>{names[n.type]||'Обновление '+({deal:'сделки',offer:'предложения',organization:'организации',lot:'партии',listing:'публикации'}[n.entityType]||'в вашем кабинете')}<small>{new Date(n.createdAt).toLocaleString('ru-RU')}</small></button>)}
  {(cursor===undefined?resource.data?.nextCursor:cursor)&&<button className="trade-secondary" disabled={busy} onClick={()=>void more()}>Более ранние события</button>}
  <Hint>События сохраняются на сервере и восстанавливаются после подключения.</Hint>
 </Section></div>;
}
