import { useEffect, useRef, useState } from 'react';
import { chatApi, chatError } from './api';
import { ChatIcon, ChatSheet, EmptyState, ErrorNotice } from './components';
import { useChatEvents } from './hooks';
import { LocationCard } from './LocationCard';
import { messageLinks } from './location-utils';
import { PhotoGallery } from './messages';
import { fileSize } from './thread-copy';
import type { Attachment, Message } from './types';
import { VoiceBubble } from './VoiceBubble';
import './materials.css';
import { ChatMotion, ChatPresence } from './motion';

const tabs = [{ id: 'media', title: 'Медиа', icon: 'image' }, { id: 'documents', title: 'Документы', icon: 'file' }, { id: 'links', title: 'Ссылки', icon: 'copy' }, { id: 'voice', title: 'Голосовые', icon: 'mic' }, { id: 'locations', title: 'Геолокации', icon: 'location' }] as const;
type MaterialTab = typeof tabs[number]['id'];
type MaterialResponse = { items: Message[]; hasMore: boolean; nextCursor?: string | null; nextBefore?: number | null };
const dateLabel = (date: string) => new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const isVideo = (file: Attachment) => file.kind === 'video' || !!file.mimeType?.startsWith('video/');
const isVisual = (file: Attachment) => file.kind === 'image' || isVideo(file);

export function ChatMaterials({ conversationId, onJump, onClose }: { conversationId: string; onJump: (messageId: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState<MaterialTab>('media'), [items, setItems] = useState<Message[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [next, setNext] = useState<string | null>(null), [hasMore, setHasMore] = useState(false), [refresh, setRefresh] = useState(0);
  const [gallery, setGallery] = useState<{ files: Attachment[]; index: number; messageId: string } | null>(null);
  const [contentScope,setContentScope]=useState(''),[panelPrivacyEpoch,setPanelPrivacyEpoch]=useState(0);
  const removedIds=useRef(new Set<string>());
  const scope=`${conversationId}/${tab}`;
  const [privacyEpoch, setPrivacyEpoch] = useState(0); const galleryRef = useRef(gallery); galleryRef.current = gallery;
  const generation = useRef(0), pending = useRef(false), reconcile = useRef<ReturnType<typeof setTimeout> | null>(null), currentItems = useRef(items), loadedScope = useRef('');
  currentItems.current = items;
  useChatEvents(event => {
    if (event.type !== 'ready' && event.conversationId !== conversationId) return;
    if (['message.delivered', 'message.read', 'delivered', 'read', 'typing', 'activity', 'disconnected'].includes(event.type)) return;
    if(event.type==='revoked'){
      generation.current++;if(reconcile.current)clearTimeout(reconcile.current);
      setPanelPrivacyEpoch(value=>value+1);setPrivacyEpoch(value=>value+1);setItems([]);setGallery(null);setNext(null);setHasMore(false);setLoading(false);setError('Доступ к материалам беседы закрыт.');return;
    }
    if (event.messageId && ['message.deleted','deleted','hidden','personal'].includes(event.type)) {
      generation.current++;removedIds.current.add(event.messageId);setPanelPrivacyEpoch(value=>value+1);
      setItems(value => value.filter(message => message.id !== event.messageId));
      if (galleryRef.current?.messageId === event.messageId) setPrivacyEpoch(value => value + 1);
      setGallery(value => value?.messageId === event.messageId ? null : value);
    }
    if (reconcile.current) clearTimeout(reconcile.current);
    reconcile.current = setTimeout(() => setRefresh(value => value + 1), 250);
  });
  useEffect(() => () => { generation.current++; if (reconcile.current) clearTimeout(reconcile.current); }, []);
  useEffect(() => {
    const request = ++generation.current;
    const previous = loadedScope.current === scope ? currentItems.current : [];
    loadedScope.current = scope;
    if (!previous.length) { setPrivacyEpoch(value => value + 1); setItems([]); setNext(null); setHasMore(false); setGallery(null); }
    setLoading(true); setError(''); pending.current = true;
    // Reconcile all already-loaded pages, preserving the user's scroll position and
    // keeping older material in place while new events arrive.
    void (async () => {
      const combined: Message[] = []; let cursor: string | null = null; let data: MaterialResponse;
      do {
        data = await chatApi<MaterialResponse>(`/conversations/${encodeURIComponent(conversationId)}/materials?type=${tab}&limit=30${cursor ? `&before=${encodeURIComponent(cursor)}` : ''}`);
        if (request !== generation.current) return;
        combined.push(...data.items.filter(message => !message.deletedAt&&!message.hidden&&!removedIds.current.has(message.id)));
        const nextCursor = data.nextCursor ?? (data.nextBefore ? String(data.nextBefore) : null);
        if (nextCursor === cursor) break;
        cursor = nextCursor;
      } while (data.hasMore && cursor && previous.length && combined.length && combined.at(-1)!.sequence > previous.at(-1)!.sequence);
      if(previous.some(message=>!combined.some(item=>item.id===message.id)))setPanelPrivacyEpoch(value=>value+1);
      setContentScope(scope);setItems([...new Map(combined.map(message => [message.id, message])).values()]); setHasMore(data.hasMore); setNext(cursor);
      if (galleryRef.current && !combined.some(message => message.id === galleryRef.current?.messageId)) setPrivacyEpoch(value => value + 1);
      setGallery(value => value && !combined.some(message => message.id === value.messageId) ? null : value);
    })().catch(cause => {
      if (request !== generation.current) return;
      if ([401, 403, 404].includes(Number((cause as { status?: number })?.status))) { setPanelPrivacyEpoch(value=>value+1);setPrivacyEpoch(value => value + 1); setItems([]); setGallery(null); setHasMore(false); }
      setContentScope(scope);setError(chatError(cause));
    }).finally(() => { if (request === generation.current) { pending.current = false; setLoading(false); } });
  }, [conversationId, tab, refresh, scope]);
  async function more() {
    if (pending.current || !hasMore || !next) return;
    const request = generation.current;
    pending.current = true; setLoading(true); setError('');
    try {
      const data = await chatApi<MaterialResponse>(`/conversations/${encodeURIComponent(conversationId)}/materials?type=${tab}&limit=30&before=${encodeURIComponent(next)}`);
      if (request !== generation.current) return;
      setItems(value => [...new Map([...value, ...data.items].filter(message => !message.deletedAt&&!message.hidden&&!removedIds.current.has(message.id)).map(message => [message.id, message])).values()]); setHasMore(data.hasMore); setNext(data.nextCursor ?? (data.nextBefore ? String(data.nextBefore) : null));
    } catch (cause) { if (request === generation.current) {if([401,403,404].includes(Number((cause as {status?:number}).status))){setPanelPrivacyEpoch(value=>value+1);setPrivacyEpoch(value=>value+1);setItems([]);setGallery(null);setHasMore(false);setNext(null);}setError(chatError(cause));} }
    finally { if (request === generation.current) { pending.current = false; setLoading(false); } }
  }
  const displayItems=contentScope===scope?items:[];
  const displayLoading=loading||(contentScope!==scope&&!error);
  const contentState=displayItems.length?'items':displayLoading?'loading':error?'error':'empty';
  const groups: { date: string; messages: Message[] }[] = [];
  for (const message of displayItems) {
    const date = dateLabel(message.createdAt);
    if (groups.at(-1)?.date !== date) groups.push({ date, messages: [] });
    groups.at(-1)!.messages.push(message);
  }
  return <ChatSheet title="Материалы чата" onClose={onClose}><div className="chat-materials">
    <div className="chat-material-tabs" role="tablist" aria-label="Тип материалов">{tabs.map(option => <button key={option.id} role="tab" aria-selected={tab === option.id} onClick={() => setTab(option.id)}><ChatIcon name={option.icon} size={18} /><span>{option.title}</span></button>)}</div>
    <ChatMotion key={`${conversationId}:${panelPrivacyEpoch}`} identity={`${tab}:${contentState}`} kind="collapse" className="chat-material-panel-motion"><div role="tabpanel" aria-label={tabs.find(option => option.id === tab)!.title} aria-busy={displayLoading}>
      {groups.map(group => <section className="chat-material-day" key={group.date}><h3>{group.date}</h3><div className={tab === 'media' ? 'chat-material-grid' : 'chat-material-list'}>{group.messages.map(message => <article key={message.id} className="chat-material-item">
        {tab === 'media' && <div className="chat-material-photos">{message.attachments.filter(isVisual).map((file, index, files) => <button className="chat-material-thumbnail" data-video-note={file.kind === 'video_note'} key={file.id} aria-label={`${file.kind === 'video_note' ? 'Видеозаметка' : isVideo(file) ? 'Видео' : 'Фото'}: ${file.name}`} onClick={() => setGallery({ files, index, messageId: message.id })}>{isVideo(file) ? <><video src={file.url} poster={file.thumbnailUrl} preload="metadata" muted playsInline /><span className="chat-material-play"><ChatIcon name="play" size={24} /></span></> : <img src={file.thumbnailUrl || file.url} alt={file.name} loading="lazy" />}</button>)}</div>}
        {tab === 'documents' && message.attachments.filter(file => file.kind === 'document' && !isVideo(file)).map(file => <a className="chat-material-document" href={file.url} key={file.id} download={file.name} target="_blank" rel="noopener noreferrer"><ChatIcon name="file" /><span><strong>{file.name}</strong><small>{file.name.split('.').pop()?.toUpperCase()} · {fileSize(file.size)}</small></span><ChatIcon name="download" size={18} /></a>)}
        {tab === 'links' && messageLinks(message.text).map(link => <a className="chat-material-link" href={link.url} key={link.url} target="_blank" rel="noopener noreferrer nofollow"><ChatIcon name="copy" size={20} /><span><strong>{link.domain}</strong><small>{link.url}</small></span><span aria-hidden="true">↗</span></a>)}
        {tab === 'voice' && message.attachments.filter(file => file.kind === 'audio').map(file => <VoiceBubble key={file.id} file={file} />)}
        {tab === 'locations' && message.location && <LocationCard location={message.location} />}
        {message.text && tab !== 'links' && <p className="chat-material-caption">{message.text}</p>}
        <footer><span>{message.sender.name} · {new Date(message.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span><button type="button" onClick={() => onJump(message.id)} aria-label={`Перейти к сообщению от ${message.sender.name}`}>К сообщению <ChatIcon name="chevron" size={14} /></button></footer>
      </article>)}</div></section>)}
      {displayLoading && !displayItems.length && <div className="chat-material-skeleton" role="status" aria-label="Загружаем материалы"><i /><i /><i /><i /></div>}
      {!displayLoading && !error && !displayItems.length && <EmptyState icon={tabs.find(option => option.id === tab)!.icon} title="Пока нет материалов" text="Отправленные в этой беседе материалы появятся здесь." />}
      <ErrorNotice message={error} onRetry={() => items.length ? void more() : setRefresh(value => value + 1)} />
      {hasMore && <button className="chat-material-more" type="button" disabled={loading} onClick={() => void more()}>{loading ? 'Загружаем…' : 'Загрузить ещё'}</button>}
    </div></ChatMotion>
    <ChatPresence key={privacyEpoch}>{gallery && <PhotoGallery images={gallery.files} initialIndex={gallery.index} onClose={() => setGallery(null)} onJump={() => onJump(gallery.messageId)} />}</ChatPresence>
  </div></ChatSheet>;
}
