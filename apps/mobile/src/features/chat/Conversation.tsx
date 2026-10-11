import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Attachment, Conversation as ConversationData, Message, MessageDraft, Person } from './types';
import { chatApi } from './api';
import { Avatar, ChatIcon, ChatSheet, ErrorNotice } from './components';
import { useChatEvents } from './hooks';
import Composer from './Composer';
import { ListingCard, mergeMessages, MessageBody, PhotoGallery } from './messages';
import { dayLabel, messageLabel, threadError, threadText as t } from './thread-copy';
import { useThreadViewport } from './use-thread-viewport';
import './thread.css';

type Props = { id: string; user: Person; onBack: () => void; onOpenGroup: (id: string) => void; onChanged: () => void };
type History = { items: Message[]; hasMore: boolean };
type Anchor = { id: string; offset: number } | 'bottom' | null;

export default function Conversation(props: Props) { return <Thread key={`${props.user.id}:${props.id}`} {...props} />; }

function Thread({ id, user, onBack, onOpenGroup, onChanged }: Props) {
  const [conversation, setConversation] = useState<ConversationData | null>(null); const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [hasMore, setHasMore] = useState(false); const [loadingOlder, setLoadingOlder] = useState(false);
  const [reply, setReply] = useState<Message | null>(null); const [edit, setEdit] = useState<Message | null>(null); const [actionMessage, setActionMessage] = useState<Message | null>(null);
  const [menu, setMenu] = useState(false); const [search, setSearch] = useState(false); const [report, setReport] = useState<{ targetType: 'message' | 'user' | 'group'; targetId: string } | null>(null);
  const [gallery, setGallery] = useState<{ images: Attachment[]; index: number } | null>(null); const [notice, setNotice] = useState('');
  const [nearBottom, setNearBottom] = useState(true); const [online, setOnline] = useState(navigator.onLine); const [ownBlock, setOwnBlock] = useState(false); const [acting, setActing] = useState(false);
  const scroller = useRef<HTMLDivElement>(null); const current = useRef<Message[]>([]); const more = useRef(false); const active = useRef(true); const refreshing = useRef(false); const refreshAgain = useRef(false); const queuedReconcile = useRef(false);
  const bottom = useRef(true); const anchor = useRef<Anchor>(null); const jump = useRef<string | null>(null); const lastRead = useRef(0); const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null); const olderPromise = useRef<Promise<History | null> | null>(null);
  const style = useThreadViewport(); const changedCallback = useRef(onChanged); changedCallback.current = onChanged;
  function captureAnchor(): Anchor {
    const element = scroller.current; if (!element) return null;
    if (bottom.current) return 'bottom';
    const top = element.getBoundingClientRect().top;
    const visible = [...element.querySelectorAll<HTMLElement>('[data-message-id]')].find(node => node.getBoundingClientRect().bottom > top + 1);
    return visible ? { id: visible.dataset.messageId!, offset: visible.getBoundingClientRect().top - top } : null;
  }
  function update(incoming: Message[], forceBottom = false) {
    if (!active.current) return;
    anchor.current = forceBottom ? 'bottom' : captureAnchor();
    current.current = mergeMessages(current.current, incoming); setMessages(current.current);
  }
  function clearPrivateView() { current.current = []; setMessages([]); setConversation(null); setGallery(null); setActionMessage(null); setReply(null); setEdit(null); setMenu(false); setSearch(false); setReport(null); }
  function markVisibleRead() {
    if (document.visibilityState !== 'visible' || !scroller.current || !active.current) return;
    const element = scroller.current; const bounds = element.getBoundingClientRect();
    const sequence = [...element.querySelectorAll<HTMLElement>('[data-message-id]')].reduce((max, node) => { const rect = node.getBoundingClientRect(); return rect.top < bounds.bottom && rect.bottom > bounds.top ? Math.max(max, Number(node.dataset.sequence)) : max; }, 0);
    if (sequence <= lastRead.current) return;
    lastRead.current = sequence;
    void chatApi(`/conversations/${id}/read`, { sequence }).then(() => { if (active.current) changedCallback.current(); }).catch(() => { if (active.current && lastRead.current === sequence) lastRead.current = 0; });
  }
  function scheduleRead() { if (readTimer.current) clearTimeout(readTimer.current); readTimer.current = setTimeout(markVisibleRead, 350); }
  function onScroll() { const element = scroller.current; if (!element) return; bottom.current = element.scrollHeight - element.clientHeight - element.scrollTop < 72; setNearBottom(bottom.current); scheduleRead(); }
  function scrollBottom(smooth = true) { const element = scroller.current; if (!element) return; bottom.current = true; setNearBottom(true); element.scrollTo({ top: element.scrollHeight, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant' }); scheduleRead(); }
  useLayoutEffect(() => {
    const element = scroller.current; if (!element) return;
    let correctionFrame = 0;
    if (jump.current) {
      const node = element.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(jump.current)}"]`);
      if (node) { node.scrollIntoView({ block: 'center' }); node.classList.add('chat-highlight'); setTimeout(() => node.classList.remove('chat-highlight'), 1600); jump.current = null; bottom.current = false; setNearBottom(false); }
    } else if (anchor.current === 'bottom') scrollBottom(false);
    else if (anchor.current) {
      const saved = anchor.current;
      const restore = () => {
        const node = element.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(saved.id)}"]`);
        if (node) element.scrollTop += node.getBoundingClientRect().top - element.getBoundingClientRect().top - saved.offset;
      };
      restore();
      // Recheck after the browser settles grouped-message margins and focus scrolling.
      correctionFrame = requestAnimationFrame(() => { restore(); correctionFrame = requestAnimationFrame(restore); });
    }
    anchor.current = null; scheduleRead();
    return () => cancelAnimationFrame(correctionFrame);
    // Scroll is deliberately driven by message reconciliation, not arbitrary renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);
  async function refresh(initial = false, reconcile = true) {
    if (!active.current) return;
    if (refreshing.current) { refreshAgain.current = true; queuedReconcile.current ||= reconcile; return; }
    refreshing.current = true;
    try {
      const meta = await chatApi<{ conversation: ConversationData }>(`/conversations/${id}`);
      if (!active.current) return;
      setConversation(meta.conversation);
      if (initial || !current.current.length) {
        const result = await chatApi<History>(`/conversations/${id}/messages`);
        if (!active.current) return; more.current = result.hasMore; setHasMore(result.hasMore); update(result.items, true);
      } else if (!reconcile) {
        let after = current.current[current.current.length - 1].sequence; let page: History;
        do {
          page = await chatApi<History>(`/conversations/${id}/messages?after=${after}`);
          if (!active.current) return;
          if (!page.items.length) break;
          update(page.items); after = page.items[page.items.length - 1].sequence;
        } while (page.hasMore && active.current);
      } else {
        // Reconcile the loaded interval after reconnect and edits, in bounded pages.
        // This also fetches every missed message instead of dropping a busy interval.
        const earliestLoaded = current.current[0].sequence;
        let before: number | null = null; let page: History;
        do {
          page = await chatApi<History>(`/conversations/${id}/messages${before ? `?before=${before}` : ''}`);
          if (!active.current) return;
          if (!page.items.length) break;
          update(page.items); before = page.items[0].sequence;
        } while (page.hasMore && before > earliestLoaded && active.current);
      }
      if (active.current) { setError(''); setLoading(false); scheduleRead(); }
    } catch (cause) {
      if (active.current) { setError(threadError(cause)); setLoading(false); if ([401, 403, 404].includes(Number((cause as { status?: number }).status))) clearPrivateView(); }
    } finally {
      refreshing.current = false;
      if (refreshAgain.current && active.current) { const full = queuedReconcile.current; refreshAgain.current = false; queuedReconcile.current = false; void refresh(false, full); }
    }
  }
  const refreshRef = useRef(refresh); refreshRef.current = refresh;
  const { connected } = useChatEvents(event => {
    if (event.type === 'revoked' && event.conversationId === id) { active.current = false; clearPrivateView(); setLoading(false); setError(t.revoked); return; }
    if (event.type === 'ready' || event.conversationId === id) void refreshRef.current(false, event.type !== 'messages');
  });
  useEffect(() => {
    active.current = true; void refreshRef.current(true);
    const visible = () => { if (document.visibilityState === 'visible') { void refreshRef.current(); scheduleRead(); } };
    const connection = () => { setOnline(navigator.onLine); if (navigator.onLine) void refreshRef.current(); };
    const reconcile = setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine) void refreshRef.current(); }, 30000);
    document.addEventListener('visibilitychange', visible); window.addEventListener('online', connection); window.addEventListener('offline', connection);
    return () => { active.current = false; clearInterval(reconcile); if (readTimer.current) clearTimeout(readTimer.current); document.removeEventListener('visibilitychange', visible); window.removeEventListener('online', connection); window.removeEventListener('offline', connection); };
    // Thread is keyed by user and conversation; session changes completely unmount it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const element = scroller.current; if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => { if (bottom.current) scrollBottom(false); }); observer.observe(element); return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);
  function loadOlder(): Promise<History | null> {
    if (olderPromise.current) return olderPromise.current;
    if (!more.current || !current.current.length) return Promise.resolve(null);
    setLoadingOlder(true);
    const request = chatApi<History>(`/conversations/${id}/messages?before=${current.current[0].sequence}`).then(result => {
      if (!active.current) return null; more.current = result.hasMore; setHasMore(result.hasMore); bottom.current = false; update(result.items); return result;
    }).catch(cause => { if (active.current) setError(threadError(cause)); return null; }).finally(() => { olderPromise.current = null; if (active.current) setLoadingOlder(false); });
    olderPromise.current = request; return request;
  }
  async function jumpTo(messageId: string) {
    setSearch(false); setNotice('');
    while (active.current && !current.current.some(message => message.id === messageId) && more.current) { const result = await loadOlder(); if (!result?.items.length) break; }
    if (!active.current) return;
    if (!current.current.some(message => message.id === messageId)) { setNotice(t.unavailableOriginal); return; }
    jump.current = messageId; setMessages([...current.current]);
  }
  async function send(draft: MessageDraft) { const result = await chatApi<{ message: Message }>(`/conversations/${id}/messages`, draft); if (active.current) { update([result.message], true); changedCallback.current(); } }
  async function editMessage(message: Message, text: string) { const result = await chatApi<{ message: Message }>(`/conversations/${id}/messages/${message.id}`, { text }, 'PATCH'); if (active.current) { update([result.message]); changedCallback.current(); } }
  async function removeMessage(message: Message) {
    if (!window.confirm(t.removeConfirm)) return;
    setActing(true);
    try { const result = await chatApi<{ message: Message }>(`/conversations/${id}/messages/${message.id}`, undefined, 'DELETE'); if (active.current) { update([result.message]); setActionMessage(null); if (reply?.id === message.id) setReply(null); if (edit?.id === message.id) setEdit(null); changedCallback.current(); } }
    catch (cause) { if (active.current) setError(threadError(cause)); } finally { if (active.current) setActing(false); }
  }
  async function preference(field: 'muted' | 'pinned') {
    if (!conversation) return; setActing(true);
    try { const result = await chatApi<{ conversation: ConversationData }>(`/conversations/${id}`, { [field]: !conversation[field] }, 'PATCH'); if (active.current) { setConversation(result.conversation); setMenu(false); changedCallback.current(); } }
    catch (cause) { if (active.current) setError(threadError(cause)); } finally { if (active.current) setActing(false); }
  }
  async function openMenu() {
    setMenu(true);
    try { const result = await chatApi<{ items: Person[] }>('/blocks'); if (active.current) setOwnBlock(result.items.some(person => person.id === conversation?.peer?.id)); }
    catch (cause) { if (active.current) setError(threadError(cause)); }
  }
  async function toggleBlock() {
    const peer = conversation?.peer; if (!peer || (!ownBlock && !window.confirm(t.blockConfirm))) return; setActing(true);
    try { if (ownBlock) await chatApi(`/blocks/${encodeURIComponent(peer.id)}`, undefined, 'DELETE'); else await chatApi('/blocks', { userId: peer.id }); if (active.current) { setOwnBlock(!ownBlock); setMenu(false); await refresh(); changedCallback.current(); } }
    catch (cause) { if (active.current) setError(threadError(cause)); } finally { if (active.current) setActing(false); }
  }
  return <section className="chat-thread" style={style} aria-label={conversation?.title || t.message}>
    <header className="chat-thread-header"><button className="chat-icon-button" onClick={onBack} aria-label={t.back}><ChatIcon name="back" /></button>
      {conversation && <Avatar name={conversation.title} kind={conversation.kind} src={conversation.group?.avatarUrl || conversation.listing?.imageUrl} size={40} />}
      <button className="chat-thread-title" disabled={conversation?.kind !== 'group'} onClick={() => onOpenGroup(id)}><strong>{conversation?.title || t.loading}</strong>{conversation?.group && <small>{t.members}: {conversation.group.memberCount}</small>}</button>
      {conversation && <button className="chat-icon-button" aria-label={t.menu} onClick={() => void openMenu()}><ChatIcon name="more" /></button>}
    </header>
    {conversation?.listing && <div className="chat-thread-listing"><ListingCard listing={conversation.listing} compact /></div>}
    {!online ? <div className="chat-connection" role="status">{t.offline}</div> : !connected && !loading ? <div className="chat-connection" role="status">{t.reconnect}</div> : null}
    {error && <ErrorNotice message={error} onRetry={active.current ? () => void refresh() : undefined} />}
    {notice && <div className="chat-thread-notice" role="status"><span>{notice}</span><button className="chat-icon-button" aria-label={t.close} onClick={() => setNotice('')}><ChatIcon name="close" size={17} /></button></div>}
    <div className="chat-history" ref={scroller} onScroll={onScroll} aria-label={t.message} aria-busy={loading}>
      {loading ? <div className="chat-thread-empty" role="status">{t.loading}</div> : <>
        {hasMore && <button className="chat-load-older" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? t.loading : t.older}</button>}
        {!messages.length && !error && <div className="chat-thread-empty"><ChatIcon name="chat" size={32} /><h2>{t.emptyTitle}</h2><p>{t.emptyDescription}</p></div>}
        {messages.map((message, index) => {
          const own = message.sender.id === user.id; const previous = messages[index - 1]; const newDay = !previous || new Date(previous.createdAt).toDateString() !== new Date(message.createdAt).toDateString(); const groupStart = newDay || previous.sender.id !== message.sender.id;
          return <Fragment key={message.id}>{newDay && <div className="chat-date-divider">{dayLabel(message.createdAt)}</div>}<article data-message-id={message.id} data-sequence={message.sequence} className={`chat-message-row${own ? ' own' : ''}${groupStart ? ' group-start' : ''}`}>
            <div className="chat-message-bubble">
              {!own && conversation?.kind === 'group' && groupStart && <strong className="chat-sender-name">{message.sender.name}</strong>}
              <MessageBody message={message} onReply={messageId => void jumpTo(messageId)} onGallery={(images, imageIndex) => setGallery({ images, index: imageIndex })} />
              <div className="chat-message-meta">{message.editedAt && !message.deletedAt && <span>{t.edited}</span>}<time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</time>{own && <span className="chat-read-receipt" title={message.readByCount > 0 ? `${t.read}: ${message.readByCount}` : t.sent} aria-label={message.readByCount > 0 ? `${t.read}: ${message.readByCount}` : t.sent}><ChatIcon name="check" size={14} />{message.readByCount > 0 && <ChatIcon name="check" size={14} />}</span>}</div>
            </div>
            {!message.deletedAt && <button className="chat-message-actions" aria-label={`${t.menu}: ${messageLabel(message).slice(0, 35)}`} onClick={() => setActionMessage(message)}><ChatIcon name="more" size={17} /></button>}
          </article></Fragment>;
        })}
      </>}
    </div>
    {!nearBottom && messages.length > 0 && <button className="chat-jump-latest" onClick={() => scrollBottom()}>{t.newMessages} ↓</button>}
    {conversation && <Composer key={`${user.id}:${id}`} conversationId={id} userId={user.id} disabled={!conversation.canWrite} reply={reply} edit={edit} onCancelContext={() => { setReply(null); setEdit(null); }} onSend={send} onEdit={editMessage} />}
    {gallery && <PhotoGallery images={gallery.images} initialIndex={gallery.index} onClose={() => setGallery(null)} />}
    {menu && conversation && <ChatSheet title={t.menu} onClose={() => setMenu(false)}><div className="chat-action-list">
      <button onClick={() => { setMenu(false); setSearch(true); }}><ChatIcon name="search" />{t.search}</button>
      {conversation.kind === 'group' && <button onClick={() => { setMenu(false); onOpenGroup(id); }}><ChatIcon name="group" />{t.groupInfo}</button>}
      <button disabled={acting} onClick={() => void preference('muted')}><ChatIcon name={conversation.muted ? 'bell' : 'mute'} />{conversation.muted ? t.unmute : t.mute}</button>
      <button disabled={acting} onClick={() => void preference('pinned')}><ChatIcon name="pin" />{conversation.pinned ? t.unpin : t.pin}</button>
      {conversation.peer && <button disabled={acting} onClick={() => void toggleBlock()}><ChatIcon name="block" />{ownBlock ? t.unblock : t.block}</button>}
      <button onClick={() => { setMenu(false); setReport({ targetType: conversation.kind === 'group' ? 'group' : 'user', targetId: conversation.kind === 'group' ? id : conversation.peer!.id }); }}><ChatIcon name="report" />{t.report}</button>
    </div><ErrorNotice message={error} /></ChatSheet>}
    {actionMessage && <ChatSheet title={t.message} onClose={() => setActionMessage(null)}><div className="chat-action-list">
      {conversation?.canWrite && <button onClick={() => { setReply(actionMessage); setEdit(null); setActionMessage(null); }}><ChatIcon name="reply" />{t.reply}</button>}
      {actionMessage.text && <button onClick={() => { void (async () => { try { await navigator.clipboard.writeText(actionMessage.text); setNotice(t.copied); } catch { setNotice(t.copyFailed); } })(); setActionMessage(null); }}><ChatIcon name="copy" />{t.copy}</button>}
      {actionMessage.sender.id === user.id && conversation?.canWrite && actionMessage.text && <button onClick={() => { setEdit(actionMessage); setReply(null); setActionMessage(null); }}><ChatIcon name="edit" />{t.edit}</button>}
      {(actionMessage.sender.id === user.id || (conversation?.kind === 'group' && ['owner', 'admin'].includes(conversation.role))) && <button disabled={acting} onClick={() => void removeMessage(actionMessage)}><ChatIcon name="trash" />{t.remove}</button>}
      <button onClick={() => { setReport({ targetType: 'message', targetId: actionMessage.id }); setActionMessage(null); }}><ChatIcon name="report" />{t.report}</button>
    </div><ErrorNotice message={error} /></ChatSheet>}
    {search && <HistorySearch id={id} onClose={() => setSearch(false)} onSelect={messageId => void jumpTo(messageId)} />}
    {report && <ReportSheet target={report} onClose={() => setReport(null)} onDone={() => { setReport(null); setNotice(t.reportSent); }} />}
  </section>;
}

function HistorySearch({ id, onClose, onSelect }: { id: string; onClose: () => void; onSelect: (messageId: string) => void }) {
  const [query, setQuery] = useState(''); const [items, setItems] = useState<Message[]>([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  useEffect(() => { let active = true; if (!query.trim()) { setItems([]); setLoading(false); return; } setLoading(true); const timer = setTimeout(() => { void chatApi<History>(`/conversations/${id}/messages?q=${encodeURIComponent(query)}`).then(result => { if (active) { setItems(result.items); setError(''); } }).catch(cause => { if (active) setError(threadError(cause)); }).finally(() => { if (active) setLoading(false); }); }, 300); return () => { active = false; clearTimeout(timer); }; }, [query, id]);
  return <ChatSheet title={t.search} onClose={onClose}><div className="chat-form"><input aria-label={t.search} placeholder={t.searchPlaceholder} value={query} maxLength={160} onChange={event => setQuery(event.target.value)} /></div>{error && <ErrorNotice message={error} />}{loading ? <p role="status">{t.loading}</p> : query.trim() && !items.length ? <p className="chat-muted">{t.searchEmpty}</p> : <div className="chat-history-results">{items.map(message => <button key={message.id} onClick={() => onSelect(message.id)}><strong>{message.sender.name}</strong><span>{messageLabel(message)}</span><small>{dayLabel(message.createdAt)}</small></button>)}</div>}</ChatSheet>;
}
function ReportSheet({ target, onClose, onDone }: { target: { targetType: string; targetId: string }; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('spam'); const [description, setDescription] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  return <ChatSheet title={t.report} onClose={onClose}><form className="chat-form" onSubmit={event => { event.preventDefault(); if (busy) return; setBusy(true); void chatApi('/reports', { ...target, reason, description }).then(onDone).catch(cause => setError(threadError(cause))).finally(() => setBusy(false)); }}><label>{t.reportReason}<select value={reason} onChange={event => setReason(event.target.value)}><option value="spam">{t.reportSpam}</option><option value="fraud">{t.reportFraud}</option><option value="abuse">{t.reportAbuse}</option><option value="other">{t.reportOther}</option></select></label><textarea aria-label={t.reportPlaceholder} placeholder={t.reportPlaceholder} maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} /><ErrorNotice message={error} /><button className="chat-button" disabled={busy}>{busy ? t.sending : t.send}</button></form></ChatSheet>;
}
