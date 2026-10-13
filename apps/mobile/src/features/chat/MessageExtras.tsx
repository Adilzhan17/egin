import { useEffect, useRef, useState } from 'react';
import { chatApi, chatError } from './api';
import { Avatar, ChatIcon, ChatSheet, ErrorNotice } from './components';
import { useChatEvents } from './hooks';
import { dayLabel, messageLabel } from './thread-copy';
import type { Conversation, Member, Message, Person, Reaction } from './types';
export const quickReactions=['❤️','👍','😂','😮','😢','🔥','👏','🎉','👎'];
const extraReactions=['🌱','🌾','💚','✅','🙏','💪','🤝','💯','😊','🤔','👀','🚜'];
export function ReactionBar({items,onReact,onWho}:{items?:Reaction[];onReact:(emoji:string|null)=>void;onWho:()=>void}) {
 return items?.length?<div className="chat-reactions">{items.map(item=><button key={item.emoji} aria-pressed={item.mine} aria-label={`${item.emoji} · ${item.count}${item.mine?' · ваша реакция':''}`} onClick={()=>onReact(item.mine?null:item.emoji)}><span>{item.emoji}</span><b>{item.count}</b></button>)}<button className="chat-reaction-who" aria-label="Кто отреагировал" onClick={onWho}><ChatIcon name="user" size={14}/></button></div>:null;
}
export function ReactionPicker({items,onReact}:{items?:Reaction[];onReact:(emoji:string|null)=>void}) {
 const [more,setMore]=useState(false);
 return <><div className="chat-quick-reactions">{quickReactions.map(emoji=><button key={emoji} aria-label={`Реакция ${emoji}`} aria-pressed={items?.some(item=>item.emoji===emoji&&item.mine)||false} onClick={()=>onReact(items?.some(item=>item.emoji===emoji&&item.mine)?null:emoji)}>{emoji}</button>)}<button aria-label="Другие emoji" onClick={()=>setMore(!more)}><ChatIcon name="plus" size={18}/></button></div>{more&&<div className="chat-quick-reactions">{extraReactions.map(emoji=><button key={emoji} aria-label={`Реакция ${emoji}`} onClick={()=>onReact(emoji)}>{emoji}</button>)}</div>}</>;
}
export function ReactionPeople({items,onClose}:{items:Reaction[];onClose:()=>void}) {return <ChatSheet title="Реакции" onClose={onClose}><div className="chat-reaction-people">{items.flatMap(reaction=>reaction.users.map(person=><div className="chat-person" key={reaction.emoji+person.id}><Avatar name={person.name}/><strong>{person.name}</strong><span>{reaction.emoji}</span></div>))}</div></ChatSheet>;}
export function ForwardPicker({id,messages,onClose,onDone}:{id:string;messages:Message[];onClose:()=>void;onDone:()=>void}) {
 const [items,setItems]=useState<Conversation[]>([]),[cursor,setCursor]=useState<string|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [clientIds]=useState(()=>messages.map(()=>crypto.randomUUID()));
 const active=useRef(true),mutation=useRef(false),paging=useRef(false);
 async function load(before?:string){if(paging.current)return;paging.current=true;setLoading(true);try{const result=await chatApi<{items:Conversation[];nextCursor:string|null}>('/conversations?filter=all'+(before?'&before='+encodeURIComponent(before):''));if(!active.current)return;setItems(old=>[...new Map((before?[...old,...result.items]:result.items).map(item=>[item.id,item])).values()]);setCursor(result.nextCursor);setError('');}catch(e){if(active.current)setError(chatError(e));}finally{paging.current=false;if(active.current)setLoading(false);}}
 useEffect(()=>{active.current=true;void load();return()=>{active.current=false;};},[]);
 async function forward(target:string){if(mutation.current)return;mutation.current=true;setBusy(true);setError('');try{await chatApi(`/conversations/${id}/forward`,{messageIds:messages.map(m=>m.id),targetConversationId:target,clientIds});if(active.current)onDone();}catch(e){if(active.current)setError(chatError(e));}finally{mutation.current=false;if(active.current)setBusy(false);}}
 return <ChatSheet title={`Переслать · ${messages.length}`} onClose={onClose} dismissDisabled={busy}><ErrorNotice message={error}/>{items.filter(item=>item.canWrite).map(item=><button className="chat-person" disabled={busy} key={item.id} onClick={()=>void forward(item.id)}><Avatar name={item.title} kind={item.kind} src={item.group?.avatarUrl}/><strong>{item.title}</strong><ChatIcon name="send" size={18}/></button>)}{cursor&&<button className="chat-button secondary" disabled={busy||loading} onClick={()=>void load(cursor)}>Показать ещё</button>}{loading&&!items.length&&!error&&<p className="chat-muted">Загружаем доступные беседы…</p>}{!loading&&!items.some(item=>item.canWrite)&&!error&&<p className="chat-muted">Нет бесед, в которые вы можете отправлять сообщения.</p>}</ChatSheet>;
}
export function ReceiptPeople({id,message,onClose}:{id:string;message:Message;onClose:()=>void}) {
 const [items,setItems]=useState<{user:Person;delivered:boolean;read:boolean;readPrivate?:boolean}[]>([]),[error,setError]=useState(''),[loaded,setLoaded]=useState(false),[revision,setRevision]=useState(0);
 const generation=useRef(0);
 useChatEvents(event=>{
   if(event.type!=='ready'&&event.conversationId!==id)return;
   if(event.type==='ready'||['message.read','message.delivered','read','delivered','members','privacy','revoked','message.deleted','deleted'].includes(event.type)){
     generation.current++;
     if(['privacy','revoked','message.deleted','deleted'].includes(event.type))setItems([]);
     setRevision(x=>x+1);
   }
 });
 useEffect(()=>{const request=++generation.current;setError('');chatApi<{items:typeof items}>(`/conversations/${id}/messages/${message.id}/receipts`).then(result=>{if(request===generation.current){setItems(result.items);setLoaded(true);}}).catch(e=>{if(request===generation.current){setItems([]);setLoaded(true);setError(chatError(e));}});return()=>{generation.current++;};},[id,message.id,revision]);
 return <ChatSheet title="Доставка и прочтение" onClose={onClose}><p className="chat-muted">По подтверждениям устройств. Прочтение не означает прослушивание голосового или открытие файла.</p><ErrorNotice message={error}/>{items.map(item=><div className="chat-person" key={item.user.id}><Avatar name={item.user.name}/><span><strong>{item.user.name}</strong><small>{item.read?'Прочитано':item.readPrivate?(item.delivered?'Доставлено · прочтение скрыто':'Прочтение скрыто'):item.delivered?'Доставлено':'Отправлено на сервер'}</small></span></div>)}{loaded&&!items.length&&<p className="chat-muted">Нет доступных подтверждений участников.</p>}</ChatSheet>;
}
export function MessageCollection({id,type,onSelect,onClose}:{id:string;type:'saved'|'pins';onSelect:(id:string)=>void;onClose:()=>void}) {
 const [items,setItems]=useState<Message[]>([]),[cursor,setCursor]=useState<string|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
 const generation=useRef(0),pending=useRef(false),current=useRef(items),scope=useRef(''),loadedScope=useRef('');
 const key=`${id}/${type}`;scope.current=key;current.current=items;
 useChatEvents(event=>{
   if(event.type!=='ready'&&event.conversationId!==id)return;
   if(event.type!=='ready'&&!['message.deleted','deleted','personal','pin','edited','members','revoked'].includes(event.type))return;
   generation.current++;
   if(event.type==='revoked'){setItems([]);current.current=[];setCursor(null);}
   else if(event.messageId&&['message.deleted','deleted','personal','pin'].includes(event.type)){setItems(old=>old.filter(m=>m.id!==event.messageId));current.current=current.current.filter(m=>m.id!==event.messageId);}
   setRevision(value=>value+1);
 });
 useEffect(()=>{
   const request=++generation.current,previous=loadedScope.current===key?current.current:[];loadedScope.current=key;pending.current=true;setLoading(true);setError('');
   if(!previous.length){setItems([]);setCursor(null);}
   void(async()=>{
     let before:string|null=null,next:string|null=null;const combined:Message[]=[];
     do{const data:{items:Message[];nextCursor:string|null}=await chatApi<{items:Message[];nextCursor:string|null}>(`/conversations/${id}/${type}${before?'?before='+encodeURIComponent(before):''}`);if(request!==generation.current||scope.current!==key)return;combined.push(...data.items.filter(m=>!m.deletedAt&&!m.hidden));next=data.nextCursor;if(!next||next===before)break;before=next;}while(previous.length&&combined.length&&combined.at(-1)!.sequence>previous.at(-1)!.sequence);
     if(request!==generation.current||scope.current!==key)return;setItems([...new Map(combined.map(m=>[m.id,m])).values()]);setCursor(next);
   })().catch(e=>{if(request===generation.current&&scope.current===key){if([401,403,404].includes(Number((e as {status?:number}).status))){setItems([]);setCursor(null);}setError(chatError(e));}}).finally(()=>{if(request===generation.current){pending.current=false;setLoading(false);}});
   return()=>{generation.current++;};
 },[id,type,key,revision]);
 async function more(){if(pending.current||!cursor)return;pending.current=true;setLoading(true);const request=generation.current,requestScope=key;try{const data=await chatApi<{items:Message[];nextCursor:string|null}>(`/conversations/${id}/${type}?before=${encodeURIComponent(cursor)}`);if(request!==generation.current||scope.current!==requestScope)return;setItems(old=>[...new Map([...old,...data.items].filter(m=>!m.deletedAt&&!m.hidden).map(m=>[m.id,m])).values()]);setCursor(data.nextCursor);setError('');}catch(e){if(request===generation.current&&scope.current===requestScope)setError(chatError(e));}finally{if(request===generation.current){pending.current=false;setLoading(false);}}}
 return <ChatSheet title={type==='saved'?'Избранные сообщения':'Закреплённые сообщения'} onClose={onClose}><ErrorNotice message={error}/><div className="chat-history-results">{items.map(message=><button key={message.id} onClick={()=>onSelect(message.id)}><strong>{message.sender.name}</strong><span>{messageLabel(message)}</span><small>{dayLabel(message.createdAt)}</small></button>)}</div>{!items.length&&!loading&&<p className="chat-muted">Здесь пока нет сообщений.</p>}{cursor&&<button className="chat-button secondary" disabled={loading} onClick={()=>void more()}>Показать ещё</button>}</ChatSheet>;
}
export function ConversationSearch({id,onClose,onSelect}:{id:string;onClose:()=>void;onSelect:(messageId:string)=>void}) {
 const [query,setQuery]=useState(''),[sender,setSender]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[type,setType]=useState('');
 const [members,setMembers]=useState<Member[]>([]),[items,setItems]=useState<Message[]>([]),[cursor,setCursor]=useState<string|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[revision,setRevision]=useState(0),[selected,setSelected]=useState(0);
 const generation=useRef(0),pending=useRef(false),scope=useRef('');
 useChatEvents(e=>{if(e.type==='ready'||e.conversationId===id&&!['activity','read','delivered','message.read','message.delivered','presence','preferences'].includes(e.type)){generation.current++;if(e.type==='revoked')setItems([]);else if(e.messageId&&['message.deleted','deleted','personal'].includes(e.type))setItems(old=>old.filter(m=>m.id!==e.messageId));setSelected(0);setRevision(x=>x+1);}});
 useEffect(()=>{let active=true;chatApi<{items:Member[]}>(`/conversations/${id}/members`).then(r=>{if(active)setMembers(r.items)}).catch(()=>{});return()=>{active=false};},[id]);
 const params=new URLSearchParams({q:query,sender,from,to:to?to+'T23:59:59.999Z':'',type}).toString();
 const searchKey=id+'?'+params;scope.current=searchKey;
 useEffect(()=>{const request=++generation.current;pending.current=true;setLoading(true);setSelected(0);setItems([]);setCursor(null);const timer=setTimeout(()=>{chatApi<{items:Message[];nextCursor:string|null}>(`/conversations/${id}/search?${params}`).then(data=>{if(request===generation.current&&scope.current===searchKey){setItems([...new Map(data.items.filter(m=>!m.deletedAt&&!m.hidden).map(m=>[m.id,m])).values()]);setCursor(data.nextCursor);setError('');}}).catch(e=>{if(request===generation.current&&scope.current===searchKey)setError(chatError(e));}).finally(()=>{if(request===generation.current){pending.current=false;setLoading(false);}});},300);return()=>{generation.current++;clearTimeout(timer);};},[id,params,searchKey,revision]);
 function highlight(text:string){if(!query.trim())return text;const index=text.toLocaleLowerCase().indexOf(query.trim().toLocaleLowerCase());return index<0?text:<>{text.slice(0,index)}<mark>{text.slice(index,index+query.trim().length)}</mark>{text.slice(index+query.trim().length)}</>}
 async function more(){if(pending.current||!cursor)return;pending.current=true;setLoading(true);const request=generation.current,requestScope=searchKey;try{const data=await chatApi<{items:Message[];nextCursor:string|null}>(`/conversations/${id}/search?${params}&before=${encodeURIComponent(cursor)}`);if(request!==generation.current||scope.current!==requestScope)return;setItems(old=>[...new Map([...old,...data.items].filter(m=>!m.deletedAt&&!m.hidden).map(m=>[m.id,m])).values()]);setCursor(data.nextCursor);setError('');}catch(e){if(request===generation.current&&scope.current===requestScope)setError(chatError(e));}finally{if(request===generation.current){pending.current=false;setLoading(false);}}}
 return <ChatSheet title="Поиск в переписке" onClose={onClose}><div className="chat-form"><input aria-label="Поиск в переписке" placeholder="Текст, файл или ссылка" value={query} maxLength={160} onChange={e=>setQuery(e.target.value)}/><details><summary>Фильтры поиска</summary><label>Отправитель<select value={sender} onChange={e=>setSender(e.target.value)}><option value="">Все участники</option>{members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label>С даты<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>По дату<input type="date" value={to} min={from||undefined} onChange={e=>setTo(e.target.value)}/></label><label>Тип<select value={type} onChange={e=>setType(e.target.value)}>{[['','Все'],['media','Медиа'],['video_note','Видеозаметки'],['documents','Документы'],['links','Ссылки'],['voice','Голосовые'],['locations','Геолокации']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></details></div><ErrorNotice message={error}/>{!!items.length&&<div className="chat-search-navigation"><button className="chat-icon-button" aria-label="Предыдущий результат" disabled={selected===0} onClick={()=>setSelected(x=>x-1)}>↑</button><span>{selected+1} / {items.length}</span><button className="chat-icon-button" aria-label="Следующий результат" disabled={selected===items.length-1} onClick={()=>setSelected(x=>x+1)}>↓</button><button className="chat-text-button" onClick={()=>{if(items[selected])onSelect(items[selected].id)}}>К сообщению</button></div>}<div className="chat-history-results">{items.map((m,index)=><button key={m.id} className={index===selected?'is-selected':''} onClick={()=>onSelect(m.id)}><strong>{m.sender.name}</strong><span>{highlight(messageLabel(m))}</span><small>{dayLabel(m.createdAt)}</small></button>)}</div>{!loading&&!items.length&&<p className="chat-muted">Сообщения не найдены.</p>}{cursor&&<button className="chat-button secondary" disabled={loading} onClick={()=>void more()}>Показать ещё</button>}</ChatSheet>;
}
