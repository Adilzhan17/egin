import { chatLabel } from './locale';
import { useEffect, useRef, useState } from 'react';
import { chatApi, chatError, uploadChatBinary } from './api';
import { Avatar, ChatIcon, ChatSheet, EmptyState, ErrorNotice } from './components';
import { useChatEvents, useDebounced } from './hooks';
import { participantColor } from './participant-color';
import './groups.css';
import { chatText } from './locale';
import { groupCategories, type ChatPreferences, type Community, type Conversation, type Member, type Person } from './types';

export function PersonPicker({onSelect}:{onSelect:(person:Person)=>Promise<void>}){const [query,setQuery]=useState(''),q=useDebounced(query),[items,setItems]=useState<Person[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false);useEffect(()=>{let current=true;setError('');setItems([]);if(q.trim().length<2)return;setLoading(true);chatApi<{items:Person[]}>('/users?q='+encodeURIComponent(q)).then(data=>{if(current)setItems(data.items);}).catch(e=>{if(current)setError(chatError(e));}).finally(()=>{if(current)setLoading(false);});return()=>{current=false;};},[q]);return <div className="chat-picker"><label className="chat-search"><ChatIcon name="search"/><input aria-label={chatText.nameSearch} placeholder={chatText.nameSearch} value={query} onChange={e=>setQuery(e.target.value)}/></label><p className="chat-muted">{q.length<2?chatText.noUsers:loading?chatText.loading:!items.length?chatText.none:chatLabel("Выберите собеседника")}</p><ErrorNotice message={error}/>{items.map(person=><button disabled={busy} className="chat-person" key={person.id} onClick={()=>{setBusy(true);setError('');void onSelect(person).catch(e=>setError(chatError(e))).finally(()=>setBusy(false));}}><Avatar name={person.name}/><span><strong>{person.name}</strong><small>ID: {person.id}</small></span><ChatIcon name="chevron"/></button>)}</div>;}

export function GroupEditor({conversation,onClose,onSaved}:{conversation?:Conversation;onClose:()=>void;onSaved:(conversation:Conversation)=>void}){const group=conversation?.group;const [name,setName]=useState(group?.name||''),[description,setDescription]=useState(group?.description||''),[category,setCategory]=useState(group?.category||'crops'),[region,setRegion]=useState(group?.region||''),[access,setAccess]=useState<'public'|'private'>(group?.access||'public'),[avatar,setAvatar]=useState<File|null>(null),[preview,setPreview]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0);const saved=useRef<Conversation|undefined>(conversation);useEffect(()=>{if(!avatar)return;const url=URL.createObjectURL(avatar);setPreview(url);return()=>URL.revokeObjectURL(url);},[avatar]);async function submit(){setBusy(true);setError('');try{const result=await chatApi<{conversation:Conversation}>(saved.current?'/groups/'+saved.current.id:'/groups',{name:name.trim(),description:description.trim(),category,region:region.trim(),access},saved.current?'PATCH':'POST');saved.current=result.conversation;if(avatar){const uploaded=await uploadChatBinary<{conversation:Conversation}>('/groups/'+result.conversation.id+'/avatar',avatar,setProgress);onSaved(uploaded.conversation);}else onSaved(result.conversation);}catch(e){setError(chatError(e)+(saved.current&&!conversation?chatLabel(" Группа уже создана. Можно повторить сохранение изображения."):''));}finally{setBusy(false);}}return <ChatSheet title={conversation?chatLabel("Редактировать группу"):chatText.newGroup} onClose={onClose} dismissDisabled={busy}><form className="chat-form" onSubmit={e=>{e.preventDefault();void submit();}}><label className="chat-avatar-upload"><Avatar name={name||chatLabel("Группа")} kind="group" src={preview||group?.avatarUrl} size={72}/><span>{chatLabel("Изображение группы")}<small>{chatLabel("JPEG, PNG или WebP · до 10 МБ")}</small></span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file&&file.size>10*1024*1024){setError(chatLabel("Изображение должно быть не больше 10 МБ"));return;}setAvatar(file||null);}}/></label><label>{chatLabel("Название")}<input aria-label={chatLabel("Название")} required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)} placeholder={chatLabel("Например, агрономы Акмолинской области")}/></label><label>{chatLabel("Описание")}<textarea aria-label={chatLabel("Описание")} maxLength={1000} rows={3} value={description} onChange={e=>setDescription(e.target.value)} placeholder={chatLabel("Для кого эта группа и что здесь обсуждают")}/></label><label>{chatLabel("Тематика")}<select aria-label={chatLabel("Тематика")} value={category} onChange={e=>setCategory(e.target.value)}>{groupCategories.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{chatLabel("Регион")}<input aria-label={chatLabel("Регион")} maxLength={120} value={region} onChange={e=>setRegion(e.target.value)} placeholder={chatLabel("Например, Акмолинская область")}/></label><fieldset><legend>{chatLabel("Доступ к группе")}</legend><label className="chat-choice"><input type="radio" aria-label={chatLabel("Открытая")} name="access" value="public" checked={access==='public'} onChange={()=>setAccess('public')}/><span>{chatLabel("Открытая")}<small>{chatLabel("Видна в поиске, любой пользователь может вступить")}</small></span></label><label className="chat-choice"><input type="radio" aria-label={chatLabel("Закрытая")} name="access" value="private" checked={access==='private'} onChange={()=>setAccess('private')}/><span>{chatLabel("Закрытая")}<small>{chatLabel("Участников добавляет администратор")}</small></span></label></fieldset><ErrorNotice message={error}/><button className="chat-button" disabled={busy||name.trim().length<2}>{busy?progress?`Загрузка ${progress}%`:chatLabel("Сохраняем…"):conversation?chatText.save:chatText.newGroup}</button></form></ChatSheet>;}

type GroupConfirmation = { title: string; description: string; label: string; danger?: boolean; action: () => Promise<void>; exits?: boolean };
type GroupDetailsProps = {
  id: string; user: Person; onClose: () => void; onOpen: (id: string) => void; onChanged: () => void;
  onLeft?: (id: string) => void; onMaterials?: () => void; onAppearance?: () => void;
};

export function GroupDetails({ id, user, onClose, onOpen, onChanged, onLeft, onMaterials, onAppearance }: GroupDetailsProps) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [view, setView] = useState<'profile' | 'edit' | 'add' | 'report' | 'transfer'>('profile');
  const [selected, setSelected] = useState<Member | null>(null);
  const [confirm, setConfirm] = useState<GroupConfirmation | null>(null);
  const active = useRef(true), leaving = useRef(false), requestVersion = useRef(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mutation = useRef(false);

  function finishLeaving() {
    leaving.current = true;
    // Parent onLeft closes the thread and refreshes the list; its normal onChanged also reloads this now-forbidden thread.
    if (onLeft) onLeft(id);
    else { onClose(); onChanged(); }
  }
  async function load() {
    const version = ++requestVersion.current;
    try {
      const [chat, people] = await Promise.all([
        chatApi<{ conversation: Conversation }>('/conversations/' + id),
        chatApi<{ items: Member[] }>('/conversations/' + id + '/members'),
      ]);
      if (active.current && !leaving.current && version === requestVersion.current) {
        setConversation(chat.conversation); setMembers(people.items); setError('');
        setSelected(current => current ? people.items.find(member => member.id === current.id) || null : null);
      }
    } catch (e) {
      if (!active.current || leaving.current || version !== requestVersion.current) return;
      const status = (e as { status?: number })?.status;
      if (status === 403 || status === 404) finishLeaving();
      else setError(chatError(e));
    }
  }
  useEffect(() => {
    active.current = true; leaving.current = false; setConversation(null); setMembers([]); void load();
    return () => { active.current = false; ++requestVersion.current; clearTimeout(refreshTimer.current); };
  }, [id]);
  useChatEvents(event => {
    if (leaving.current || mutation.current) return;
    if (event.type === 'ready' || (event.conversationId === id && ['members', 'group', 'conversation', 'group.deleted'].includes(event.type))) {
      clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => { if (active.current) void load(); }, 120);
    }
  });
  async function act(action: () => Promise<unknown>, exits = false) {
    if (mutation.current) return;
    mutation.current = true; setBusy(true); setError('');
    try {
      await action();
      // Membership is gone now. A reload here returns 403 and used to leave the open thread behind.
      if (exits) { finishLeaving(); return; }
      await load(); onChanged(); setSelected(null); setConfirm(null); setView('profile');
    } catch (e) { if (active.current) setError(chatError(e)); }
    finally { mutation.current = false; if (active.current) setBusy(false); }
  }
  function askLeave() {
    setError('');
    if (conversation?.role === 'owner' && members.some(member => member.id !== user.id)) { setView('transfer'); return; }
    setConfirm({ title: chatLabel('Выйти из группы?'), description: chatLabel('Группа исчезнет из ваших чатов. Новые сообщения и материалы будут недоступны.'), label: chatLabel('Выйти из группы'), danger: true, exits: true, action: async () => { await chatApi('/groups/' + id + '/leave', {}); } });
  }
  const group = conversation?.group;
  const owner = conversation?.role === 'owner';
  const admin = owner || conversation?.role === 'admin';
  const dismissAction = () => { if (!busy) { setConfirm(null); setSelected(null); setView('profile'); setError(''); } };

  if (confirm) return <ChatSheet key="confirm" title={confirm.title} onClose={dismissAction} dismissDisabled={busy}>
    <div className="chat-group-confirm"><span className="chat-group-action-icon"><ChatIcon name={confirm.exits ? 'back' : 'group'} size={28}/></span>
      <p>{confirm.description}</p><ErrorNotice message={error}/>
      <button className={'chat-button' + (confirm.danger ? ' chat-group-destructive' : '')} disabled={busy} onClick={() => void act(confirm.action, confirm.exits)}>{busy ? chatLabel('Сохраняем…') : confirm.label}</button>
      <button className="chat-button secondary" disabled={busy} onClick={dismissAction}>{chatText.cancel}</button>
    </div>
  </ChatSheet>;
  if (view === 'transfer') return <ChatSheet key="transfer" title={chatLabel('Передать владение и выйти')} onClose={dismissAction} dismissDisabled={busy}>
    <p className="chat-muted">{chatLabel('Выберите нового владельца. Он сможет управлять участниками и настройками группы.')}</p>
    <ErrorNotice message={error}/>
    {members.filter(member => member.id !== user.id).map(member => <button key={member.id} className="chat-person" disabled={busy} onClick={() => setConfirm({
      title: chatLabel('Передать владение и выйти?'),
      description: `${member.name} ${chatLabel('станет владельцем группы. Вы выйдете из переписки и потеряете доступ к её материалам.')}`,
      label: chatLabel('Передать и выйти'), exits: true,
      action: async () => { await chatApi('/groups/' + id + '/leave', { transferToUserId: member.id }); },
    })}><Avatar name={member.name}/><span><strong style={{ color: participantColor(member.id) }}>{member.name}</strong><small>{member.role === 'admin' ? chatLabel('Администратор') : chatLabel('Участник')}</small></span><ChatIcon name="chevron"/></button>)}
    <button className="chat-button secondary" disabled={busy} onClick={dismissAction}>{chatText.cancel}</button>
  </ChatSheet>;
  if (view === 'edit' && conversation) return <GroupEditor conversation={conversation} onClose={dismissAction} onSaved={value => { setConversation(value); setView('profile'); onChanged(); }}/>;
  if (view === 'add') return <ChatSheet key="add" title={chatLabel('Добавить участника')} onClose={dismissAction}><PersonPicker onSelect={async person => {
    await chatApi('/groups/' + id + '/members', { userId: person.id }); setView('profile'); await load(); onChanged();
  }}/></ChatSheet>;
  if (view === 'report') return <ReportSheet targetType="group" targetId={id} onClose={dismissAction}/>;
  if (selected && conversation) return <ChatSheet key={'member-' + selected.id} title={selected.name} onClose={dismissAction} dismissDisabled={busy}>
    <div className="chat-group-member-profile"><Avatar name={selected.name} size={64}/><p>{selected.role === 'owner' ? chatLabel('Владелец') : selected.role === 'admin' ? chatLabel('Администратор') : chatLabel('Участник')}</p></div>
    <ErrorNotice message={error}/><div className="chat-group-actions">
    <button className="chat-button secondary" disabled={busy || selected.role === 'owner'} onClick={() => void act(() => chatApi('/groups/' + id + '/members/' + encodeURIComponent(selected.id), { canWrite: !selected.canWrite }, 'PATCH'))}>{selected.canWrite ? chatLabel('Ограничить отправку сообщений') : chatLabel('Разрешить сообщения')}</button>
    {owner && <><button className="chat-button secondary" disabled={busy} onClick={() => void act(() => chatApi('/groups/' + id + '/members/' + encodeURIComponent(selected.id), { role: selected.role === 'admin' ? 'member' : 'admin' }, 'PATCH'))}>{selected.role === 'admin' ? chatLabel('Снять права администратора') : chatLabel('Назначить администратором')}</button>
      <button className="chat-button secondary" disabled={busy} onClick={() => setConfirm({ title: chatLabel('Передать владение?'), description: `${selected.name} ${chatLabel('станет владельцем. Вы останетесь администратором группы.')}`, label: chatLabel('Передать владение'), action: async () => { await chatApi('/groups/' + id + '/members/' + encodeURIComponent(selected.id), { role: 'owner' }, 'PATCH'); } })}>{chatLabel('Передать владение')}</button></>}
    <button className="chat-button secondary chat-danger" disabled={busy} onClick={() => setConfirm({ title: chatLabel('Удалить участника?'), description: `${selected.name} ${chatLabel('потеряет доступ к переписке и её материалам. Повторное вступление будет запрещено.')}`, label: chatLabel('Удалить участника'), danger: true, action: async () => { await chatApi('/groups/' + id + '/members/' + encodeURIComponent(selected.id), undefined, 'DELETE'); } })}>{chatLabel('Удалить участника')}</button>
    </div>
  </ChatSheet>;
  return <ChatSheet key="profile" title={chatText.groupInfo} onClose={onClose}>
    <div className="chat-group-details"><ErrorNotice message={error} onRetry={() => void load()}/>
    {!conversation ? <div className="chat-group-skeleton" role="status" aria-label={chatText.loading}><span/><i/><i/></div> : <>
      <div className="chat-group-profile"><Avatar name={conversation.title} src={group?.avatarUrl} kind="group" size={80}/><h2>{conversation.title}</h2>
        <p>{members.length} {chatLabel('участников')} · {group?.access === 'public' ? chatLabel('Открытая') : chatLabel('Закрытая')} {chatLabel('группа')}</p>
        {group?.description && <p className="chat-group-description">{group.description}</p>}
        <div className="chat-tags"><span>{groupCategories.find(item => item.id === group?.category)?.name || group?.category}</span>{group?.region && <span>{group.region}</span>}</div>
      </div>
      <button className="chat-button" onClick={() => onOpen(id)}>{chatLabel('Открыть переписку')}</button>
      <div className="chat-settings-list">
        {onMaterials && <button onClick={onMaterials}><ChatIcon name="image"/><span>{chatLabel('Материалы чата')}<small>{chatLabel('Медиа, документы, ссылки и геопозиции')}</small></span><ChatIcon name="chevron"/></button>}
        {onAppearance && <button onClick={onAppearance}><ChatIcon name="leaf"/><span>{chatLabel('Оформление')}<small>{chatLabel('Персональная тема этой беседы')}</small></span><ChatIcon name="chevron"/></button>}
        <button disabled={busy} onClick={() => void act(() => chatApi('/conversations/' + id, { muted: !conversation.muted }, 'PATCH'))}><ChatIcon name={conversation.muted ? 'mute' : 'bell'}/><span>{chatLabel('Уведомления')}<small>{conversation.muted ? chatLabel('Отключены') : chatLabel('Включены')}</small></span><span>{conversation.muted ? chatLabel('Вкл.') : chatLabel('Выкл.')}</span></button>
        {admin && <button onClick={() => setView('edit')}><ChatIcon name="edit"/><span>{chatLabel('Редактировать группу')}</span><ChatIcon name="chevron"/></button>}
      </div>
      <div className="chat-section-heading"><h3>{chatText.members} <span>{members.length}</span></h3>{admin && <button className="chat-icon-button" aria-label={chatLabel('Добавить участника')} onClick={() => setView('add')}><ChatIcon name="plus"/></button>}</div>
      <div className="chat-group-member-list">{members.map(member => {
        const canManage = admin && member.id !== user.id && (owner || member.role === 'member');
        return <button key={member.id} className="chat-person" disabled={!canManage || busy} onClick={() => setSelected(member)}><span className="chat-group-member-avatar" style={{ color: participantColor(member.id) }}><Avatar name={member.name} size={40}/></span><span><strong style={{ color: participantColor(member.id) }}>{member.name}{member.id === user.id ? chatLabel(' · вы') : ''}</strong><small>{member.role === 'owner' ? chatLabel('Владелец') : member.role === 'admin' ? chatLabel('Администратор') : !member.canWrite ? chatLabel('Только чтение') : chatLabel('Участник')}</small></span>{canManage && <ChatIcon name="more"/>}</button>;
      })}</div>
      <div className="chat-settings-list chat-group-exit-actions">
        <button onClick={() => setView('report')}><ChatIcon name="report"/><span>{chatLabel('Пожаловаться на группу')}</span></button>
        <button className="chat-danger" disabled={busy} onClick={askLeave}><ChatIcon name="back"/><span>{chatLabel('Выйти из группы')}</span></button>
        {owner && <button className="chat-danger" disabled={busy} onClick={() => setConfirm({ title: chatLabel('Удалить группу для всех?'), description: chatLabel('Участники потеряют доступ к группе, сообщениям и материалам. Это действие нельзя отменить.'), label: chatLabel('Удалить группу'), danger: true, exits: true, action: async () => { await chatApi('/groups/' + id, undefined, 'DELETE'); } })}><ChatIcon name="trash"/><span>{chatLabel('Удалить группу')}</span></button>}
      </div>
    </>}
    </div>
  </ChatSheet>;
}

export function ReportSheet({targetType,targetId,onClose}:{targetType:'message'|'group'|'user';targetId:string;onClose:()=>void}){const [reason,setReason]=useState('spam'),[description,setDescription]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[sent,setSent]=useState(false);return <ChatSheet title={chatLabel("Пожаловаться")} onClose={onClose}>{sent?<EmptyState icon="check" title={chatLabel("Жалоба сохранена")} text={chatLabel("Она будет доступна команде для рассмотрения. Срок ответа пока не установлен.")}><button className="chat-button" onClick={onClose}>{chatLabel("Готово")}</button></EmptyState>:<form className="chat-form" onSubmit={e=>{e.preventDefault();setBusy(true);void chatApi('/reports',{targetType,targetId,reason,description}).then(()=>setSent(true)).catch(error=>setError(chatError(error))).finally(()=>setBusy(false));}}><label>{chatLabel("Причина")}<select aria-label={chatLabel("Причина")} value={reason} onChange={e=>setReason(e.target.value)}><option value="spam">{chatLabel("Спам")}</option><option value="fraud">{chatLabel("Мошенничество")}</option><option value="abuse">{chatLabel("Оскорбления и угрозы")}</option><option value="illegal">{chatLabel("Запрещённый контент")}</option><option value="other">{chatLabel("Другое")}</option></select></label><label>{chatLabel("Подробности")}<textarea aria-label={chatLabel("Подробности")} maxLength={1000} rows={4} value={description} onChange={e=>setDescription(e.target.value)}/></label><ErrorNotice message={error}/><button disabled={busy} className="chat-button">{busy?chatLabel("Отправляем…"):chatLabel("Отправить жалобу")}</button></form>}</ChatSheet>;}

export function Communities({onOpen,onPreferences,mode='recommended',revision=0}:{onOpen:(id:string)=>void;onPreferences:()=>void;mode?:'recommended'|'browse';revision?:number}){const [items,setItems]=useState<Community[]>([]),[query,setQuery]=useState(''),[category,setCategory]=useState(''),[region,setRegion]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[tick,setTick]=useState(0);const q=useDebounced(query),r=useDebounced(region);useEffect(()=>{let current=true;setLoading(true);const params=new URLSearchParams({q,category,region:r});chatApi<{items:Community[]}>(mode==='recommended'?'/recommendations':'/communities?'+params).then(data=>{if(current){setItems(data.items);setError('');}}).catch(e=>{if(current)setError(chatError(e));}).finally(()=>{if(current)setLoading(false);});return()=>{current=false;};},[mode,q,r,category,tick,revision]);async function join(item:Community){setBusy(item.id);setError('');try{if(!item.joined)await chatApi('/groups/'+item.id+'/join',{});onOpen(item.id);}catch(e){setError(chatError(e));}finally{setBusy('');}}return <section className="chat-communities" aria-busy={loading}>{mode==='recommended'?<div className="chat-discovery-intro"><div><span className="chat-eyebrow">{chatLabel("СООБЩЕСТВА egin")}</span><h2>{chatLabel("Люди вашего дела")}</h2><p>{chatLabel("Знакомьтесь, делитесь опытом и находите партнёров.")}</p></div><button className="chat-icon-button" aria-label={chatText.preferences} onClick={onPreferences}><ChatIcon name="settings"/></button></div>:<div className="chat-form"><label className="chat-search"><ChatIcon name="search"/><input aria-label={chatLabel("Поиск сообществ")} placeholder={chatLabel("Название сообщества")} value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="chat-two-fields"><label>{chatLabel("Тематика")}<select aria-label={chatLabel("Тематика")} value={category} onChange={e=>setCategory(e.target.value)}><option value="">{chatLabel("Все темы")}</option>{groupCategories.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{chatLabel("Регион")}<input aria-label={chatLabel("Регион")} value={region} maxLength={120} placeholder={chatLabel("Все регионы")} onChange={e=>setRegion(e.target.value)}/></label></div></div>}<ErrorNotice message={error} onRetry={()=>setTick(value=>value+1)}/>{loading&&!items.length?<p className="chat-muted" role="status">{chatText.loading}</p>:!items.length&&!error?<EmptyState title={chatText.emptyCommunities} text={chatText.emptyCommunitiesText} icon="group"><button className="chat-button secondary" onClick={onPreferences}>{chatText.preferences}</button></EmptyState>:items.map(item=><article className="chat-community-card" key={item.id}><div className="chat-community-top"><Avatar name={item.name} src={item.avatarUrl} kind="group"/><div><h3>{item.name}</h3><small>{item.memberCount}{' '}{chatLabel("участников")}</small></div>{mode==='recommended'&&<button className="chat-icon-button" disabled={!!busy} aria-label={`${chatText.hide}: ${item.name}`} onClick={()=>{setBusy(item.id);void chatApi('/recommendations/'+item.id+'/hide',{}).then(()=>setItems(current=>current.filter(entry=>entry.id!==item.id))).catch(e=>setError(chatError(e))).finally(()=>setBusy(''));}}><ChatIcon name="close" size={18}/></button>}</div>{item.description&&<p>{item.description}</p>}<div className="chat-tags">{item.region&&<span><ChatIcon name="location" size={13}/>{item.region}</span>}<span>{groupCategories.find(category=>category.id===item.category)?.name||item.category}</span></div><div className="chat-community-bottom"><small>{item.reason||chatLabel("Открытое сообщество")}</small><button className="chat-button" disabled={!!busy} onClick={()=>void join(item)}>{busy===item.id?'…':item.joined?chatText.open:chatText.join}</button></div></article>)}</section>;}

export function Preferences({onClose}:{onClose:()=>void}){const [data,setData]=useState<ChatPreferences|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);useEffect(()=>{let active=true;chatApi<{preferences:ChatPreferences}>('/preferences').then(result=>{if(active)setData(result.preferences);}).catch(e=>{if(active)setError(chatError(e));});return()=>{active=false;};},[]);const toggle=(key:'interests'|'excludedCategories',id:string)=>setData(current=>current?{...current,[key]:current[key].includes(id)?current[key].filter(value=>value!==id):[...current[key],id],...(key==='interests'?{excludedCategories:current.excludedCategories.filter(value=>value!==id)}:{interests:current.interests.filter(value=>value!==id)})}:current);return <ChatSheet title={chatText.preferences} onClose={onClose}><ErrorNotice message={error}/>{data?<form className="chat-form" onSubmit={e=>{e.preventDefault();setBusy(true);void chatApi('/preferences',data,'PATCH').then(onClose).catch(e=>setError(chatError(e))).finally(()=>setBusy(false));}}><p className="chat-muted">{chatLabel("Подборка учитывает указанные вами темы, регион и активность открытых групп. Содержание переписок не используется.")}</p><label>{chatLabel("Ваш регион")}<input aria-label={chatLabel("Ваш регион")} maxLength={120} value={data.region} onChange={e=>setData({...data,region:e.target.value})} placeholder={chatLabel("Например, Костанайская область")}/></label><fieldset><legend>{chatLabel("Интересные темы")}</legend><div className="chat-interest-grid">{groupCategories.map(item=><label className="chat-choice" key={item.id}><input type="checkbox" checked={data.interests.includes(item.id)} onChange={()=>toggle('interests',item.id)}/><span>{item.name}</span></label>)}</div></fieldset><details><summary>{chatLabel("Не рекомендовать тематики")}</summary>{groupCategories.map(item=><label className="chat-choice" key={item.id}><input type="checkbox" checked={data.excludedCategories.includes(item.id)} onChange={()=>toggle('excludedCategories',item.id)}/><span>{item.name}</span></label>)}</details><button className="chat-button" disabled={busy}>{busy?chatLabel("Сохраняем…"):chatText.save}</button></form>:!error&&<p className="chat-muted">{chatText.loading}</p>}</ChatSheet>;}

export function Blocks({onClose}:{onClose:()=>void}){const [items,setItems]=useState<Person[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState('');useEffect(()=>{let active=true;chatApi<{items:Person[]}>('/blocks').then(result=>{if(active)setItems(result.items);}).catch(e=>{if(active)setError(chatError(e));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);return <ChatSheet title={chatText.blocked} onClose={onClose}><ErrorNotice message={error}/>{loading?<p>{chatText.loading}</p>:!items.length?<EmptyState title={chatLabel("Список пуст")} text={chatLabel("Заблокировать собеседника можно в меню переписки.")} icon="block"/>:items.map(person=><div className="chat-person" key={person.id}><Avatar name={person.name}/><span><strong>{person.name}</strong></span><button className="chat-text-button" disabled={!!busy} onClick={()=>{setBusy(person.id);void chatApi('/blocks/'+encodeURIComponent(person.id),undefined,'DELETE').then(()=>setItems(current=>current.filter(item=>item.id!==person.id))).catch(e=>setError(chatError(e))).finally(()=>setBusy(''));}}>{chatLabel("Разблокировать")}</button></div>)}</ChatSheet>;}
