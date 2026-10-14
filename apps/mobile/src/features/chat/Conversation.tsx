import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { Attachment, Conversation as ConversationData, Message, Person } from './types';
import { chatApi } from './api';
import { Avatar, ChatIcon, ChatSheet, ChatWallpaper, ErrorNotice } from './components';
import { useChatEvents } from './hooks';
import Composer from './Composer';
import MessageStatus from './MessageStatus';
import type { OutboxInput, PendingOutboxEntry } from './useChatOutbox';
import { receiptRequest, type ReceiptSnapshot } from './receipt-sync';
import { ListingCard, mergeMessages, messageTombstone, MessageBody, PhotoGallery } from './messages';
import { dayLabel, messageLabel, threadError, threadText as t } from './thread-copy';
import { useThreadViewport } from './use-thread-viewport';
import { animateChat, ChatMotion, ChatPresence, motion, reducedMotion, useMotionPhase } from './motion';
import { useMessageMotion, messageMotionKey } from './thread-motion';
import './thread.css';
import './messenger.css';
import {TradeMessageCard} from './TradeMessageCard';
import { useChatActivity, ActivityLabel } from './activity';
import { ChatAppearance, themeStyle, darkTheme } from './ChatAppearance';
import { participantColor } from './participant-color';
import { usePeerPresence } from './ChatPrivacy';
import { presenceLabel } from './presence';
import { ChatMaterials } from './ChatMaterials';
import { GroupDetails } from './Groups';
import { ReactionBar, ReactionPicker, ReactionPeople, ForwardPicker, ReceiptPeople, MessageCollection, ConversationSearch } from './MessageExtras';

type Props = { id: string; user: Person; onBack: () => void; onOpenGroup: (id: string) => void; onChanged: () => void; accepted: Message | null; pending: PendingOutboxEntry[]; onEnqueue: (input: OutboxInput) => Promise<void>; onRetryPending: (clientId: string) => Promise<void>; onDiscardPending: (clientId: string) => Promise<void>; onScrubReply: (conversationId: string, messageId: string) => Promise<void>; onConfirmAccepted: (messages: Message[]) => Promise<void>; outboxError?: string };
type History = { items: Message[]; hasMore: boolean; deletedIds?: string[] };
type Anchor = { id: string; offset: number } | 'bottom' | null;

export default function Conversation(props: Props) { return <Thread key={`${props.user.id}:${props.id}`} {...props} />; }

function Thread({ id, user, onBack, onChanged, accepted, pending, onEnqueue, onRetryPending, onDiscardPending, onScrubReply, onConfirmAccepted, outboxError }: Props) {
  const phase = useMotionPhase(), phaseRef = useRef(phase); phaseRef.current = phase;
  const threadRoot = useRef<HTMLElement>(null);
  const [privacyEpoch, setPrivacyEpoch] = useState(0);
  useLayoutEffect(() => {
    const node=threadRoot.current;if(!node)return;
    const animation=animateChat(node,phase==='exit'?[{opacity:1},{opacity:0}]:[{opacity:0},{opacity:1}],{duration:motion.screen,fill:phase==='exit'?'forwards':'none'});
    return()=>animation?.cancel();
  },[phase]);
  const [materials, setMaterials] = useState(false);
  const [profile, setProfile] = useState(false), [appearance, setAppearance] = useState(false), [groupProfile, setGroupProfile] = useState(false);
  const [collection, setCollection] = useState<'saved'|'pins'|null>(null), [forward, setForward] = useState<Message[]|null>(null), [who, setWho] = useState<Message|null>(null), [receiptPeople, setReceiptPeople] = useState<Message|null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const presence=usePeerPresence(id);
  const activity = useChatActivity(user.id).filter(item => item.conversationId === id);
  const press = useRef<{timer:ReturnType<typeof setTimeout>;x:number;y:number}|null>(null);
  const initialUnread = useRef<number|null>(null);
  const localClients = useRef(new Set<string>()); pending.forEach(entry=>localClients.current.add(entry.clientId));
  const [conversation, setConversation] = useState<ConversationData | null>(() => {
    try { const cached = JSON.parse(sessionStorage.getItem(`egin.chat.meta.${user.id}.${id}`) || 'null'); return cached?.id === id ? cached : null; } catch { return null; }
  }); const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [hasMore, setHasMore] = useState(false); const [loadingOlder, setLoadingOlder] = useState(false);
  const [reply, setReply] = useState<Message | null>(null); const [edit, setEdit] = useState<Message | null>(null); const [actionMessage, setActionMessage] = useState<Message | null>(null);
  const [menu, setMenu] = useState(false); const [search, setSearch] = useState(false); const [report, setReport] = useState<{ targetType: 'message' | 'user' | 'group'; targetId: string } | null>(null);
  const [gallery, setGallery] = useState<{ images: Attachment[]; index: number } | null>(null); const [notice, setNotice] = useState('');
  const [nearBottom, setNearBottom] = useState(true); const [online, setOnline] = useState(navigator.onLine); const [ownBlock, setOwnBlock] = useState(false); const [acting, setActing] = useState(false);
  const scroller = useRef<HTMLDivElement>(null); const historyContent = useRef<HTMLDivElement>(null); const current = useRef<Message[]>([]); const more = useRef(false); const active = useRef(true); const refreshing = useRef(false); const refreshAgain = useRef(false); const queuedReconcile = useRef(false);
  const bottom = useRef(true); const anchor = useRef<Anchor>(null); const jump = useRef<string | null>(null); const lastRead = useRef(0); const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null); const olderPromise = useRef<Promise<History | null> | null>(null);
  const lastScrollTop = useRef(0);
  const readingAnchor = useRef<Anchor>(null);
  const deletedIds = useRef(new Map<string, string>());
  const collapseTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [collapsing, setCollapsing] = useState<Record<string, number>>({});
  const pendingRef = useRef(pending); pendingRef.current = pending;
  const receiptsBusy = useRef(false); const receiptsAgain = useRef(false); const receiptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const receiptController = useRef<AbortController | null>(null);
  const style = useThreadViewport(); const changedCallback = useRef(onChanged); changedCallback.current = onChanged;
  function captureAnchor(excluded = new Set<string>()): Anchor {
    const element = scroller.current; if (!element) return null;
    if (bottom.current) return 'bottom';
    const top = element.getBoundingClientRect().top;
    const visible = [...element.querySelectorAll<HTMLElement>('[data-message-id]')].find(node => !excluded.has(node.dataset.messageId!) && node.getBoundingClientRect().bottom > top + 1);
    return visible ? { id: visible.dataset.messageId!, offset: visible.getBoundingClientRect().top - top } : null;
  }
  function update(incoming: Message[], forceBottom = false) {
    if (!active.current) return;
    const removed = incoming.filter(message => (message.deletedAt && !deletedIds.current.has(message.id)) || (message.hidden && !current.current.find(item=>item.id===message.id)?.hidden));
    anchor.current = forceBottom ? 'bottom' : captureAnchor(new Set(removed.map(message=>message.id)));
    readingAnchor.current = anchor.current;
    for (const message of removed) { if(message.deletedAt)deletedIds.current.set(message.id, message.deletedAt); void onScrubReply(id, message.id).catch(() => {}); }
    if (removed.length) {
      // Private data is removed now. Only a measured, content-free gap may exit.
      setPrivacyEpoch(value=>value+1);
      const removedIds = new Set(removed.map(message => message.id));
      const removedFiles = new Set(current.current.filter(message => removedIds.has(message.id)).flatMap(message => message.attachments.map(file => file.id)));
      setReply(value => value && removedIds.has(value.id) ? null : value);
      setEdit(value => value && removedIds.has(value.id) ? null : value);
      setSelection(value=>value.filter(key=>!removedIds.has(key)));
      setForward(value=>value?.some(item=>removedIds.has(item.id))?null:value);
      setWho(value=>value&&removedIds.has(value.id)?null:value);
      setReceiptPeople(value=>value&&removedIds.has(value.id)?null:value);
      setActionMessage(value => value && removedIds.has(value.id) ? null : value);
      setGallery(value => value?.images.some(file => removedFiles.has(file.id)) ? null : value);
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const gaps: Record<string, number> = {};
        for (const message of removed) {
          const row = scroller.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(message.id)}"]`);
          if (!row || collapseTimers.current.has(message.id)) continue;
          gaps[message.id] = row.getBoundingClientRect().height + parseFloat(getComputedStyle(row).marginTop);
          collapseTimers.current.set(message.id, setTimeout(() => {
            collapseTimers.current.delete(message.id);
            if (active.current) setCollapsing(value => { const next = { ...value }; delete next[message.id]; return next; });
          }, motion.normal));
        }
        if (Object.keys(gaps).length) setCollapsing(value => ({ ...value, ...gaps }));
      }
    }
    const safeIncoming = incoming.map(message => deletedIds.current.has(message.id) ? messageTombstone(message, deletedIds.current.get(message.id)!) : message);
    // History/SSE reconciliation is also a committed ACK after a lost POST response.
    void onConfirmAccepted(safeIncoming).catch(() => {});
    setGallery(value => {
      if (!value?.images.some(file => file.url.startsWith('blob:'))) return value;
      const local = pendingRef.current.find(entry => entry.message.attachments.some(file => value.images.some(image => image.id === file.id)));
      const server = local && safeIncoming.find(message => message.clientId === local.clientId && message.sender.id === user.id);
      if (!server) return value;
      const images = server.attachments.filter(file => file.kind === 'image');
      return images.length ? { images, index: Math.min(value.index, images.length - 1) } : null;
    });
    current.current = mergeMessages(current.current, safeIncoming).map(message => message.replyTo && deletedIds.current.has(message.replyTo.id) ? { ...message, replyTo: null } : message);
    setMessages(current.current);
  }
  function removeFromEvent(messageId: string, deletedAt = new Date().toISOString()) {
    const message = current.current.find(item => item.id === messageId);
    if (message) update([messageTombstone(message, deletedAt)]);
    else {
      deletedIds.current.set(messageId, deletedAt); void onScrubReply(id, messageId).catch(() => {});
      update(current.current.filter(item => item.replyTo?.id === messageId).map(item => ({ ...item, replyTo: null })));
      setReply(value => value?.id === messageId ? null : value);
    }
  }
  function clearPrivateView() { active.current=false; setPrivacyEpoch(value=>value+1); for(const timer of collapseTimers.current.values())clearTimeout(timer);collapseTimers.current.clear();setCollapsing({});readingAnchor.current=null; try { sessionStorage.removeItem(`egin.chat.meta.${user.id}.${id}`); } catch { /* Optional metadata cache. */ } current.current = []; setMessages([]); setConversation(null); setGallery(null); setActionMessage(null); setReply(null); setEdit(null); setMenu(false); setSearch(false); setReport(null); setMaterials(false); setProfile(false); setAppearance(false); setGroupProfile(false); setCollection(null); setForward(null); setWho(null); setReceiptPeople(null); setSelection([]); }
  function markVisibleRead() {
    if (phaseRef.current === 'exit' || document.visibilityState !== 'visible' || !scroller.current || !active.current || document.querySelector('.chat-sheet[open],.chat-gallery[open]')) return;
    const element = scroller.current; const bounds = element.getBoundingClientRect();
    const sequence = [...element.querySelectorAll<HTMLElement>('[data-message-id]')].reduce((max, node) => { const rect = node.getBoundingClientRect(); const visibleHeight = Math.max(0, Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, bounds.top)); return visibleHeight >= Math.min(rect.height * .6, 80) ? Math.max(max, Number(node.dataset.sequence)) : max; }, 0);
    if (sequence <= lastRead.current) return;
    lastRead.current = sequence;
    void receiptRequest(`/conversations/${id}/read`, user.id, { sequence }, receiptController.current?.signal).then(() => { if (active.current) changedCallback.current(); }).catch(() => { if (active.current && lastRead.current === sequence) lastRead.current = 0; });
  }
  function scheduleRead() { if (readTimer.current) clearTimeout(readTimer.current); readTimer.current = setTimeout(markVisibleRead, 350); }
  function onScroll() {
    const element = scroller.current; if (!element) return;
    // Our layout correction also emits scroll. Do not replace the saved reader
    // anchor with a partially collapsing row on that synthetic notification.
    if (Math.abs(element.scrollTop-lastScrollTop.current)<1) { scheduleRead(); return; }
    const movedUp = element.scrollTop < lastScrollTop.current - 1;
    const atBottom = element.scrollHeight - element.clientHeight - element.scrollTop < 72;
    // WebKit can deliver a queued scroll event after media grows but before
    // ResizeObserver runs. Growth alone must not cancel following the bottom.
    bottom.current = atBottom || (bottom.current && !movedUp);
    lastScrollTop.current = element.scrollTop;
    readingAnchor.current = captureAnchor();
    setNearBottom(bottom.current); scheduleRead();
  }
  function scrollBottom(smooth = true) { const element = scroller.current; if (!element) return; bottom.current = true; setNearBottom(true); element.scrollTo({ top: element.scrollHeight, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant' }); lastScrollTop.current = element.scrollTop; scheduleRead(); }
  useLayoutEffect(() => {
    const element = scroller.current; if (!element) return;
    let correctionFrame = 0;
    if (jump.current) {
      const node = element.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(jump.current)}"]`);
      if (node) { node.scrollIntoView({ block: 'center' }); node.classList.add('chat-highlight'); setTimeout(() => node.classList.remove('chat-highlight'), 1600); jump.current = null; bottom.current = false; setNearBottom(false); lastScrollTop.current=element.scrollTop; readingAnchor.current=captureAnchor(); }
    } else if (anchor.current === 'bottom') {scrollBottom(false);readingAnchor.current='bottom';}
    else if (anchor.current) readingAnchor.current=anchor.current;
    // Safari can defer ResizeObserver delivery for CSS height animations. Keep
    // the reader's anchor during the entire bounded transition, not just two
    // frames. A genuine user scroll replaces this anchor immediately.
    const until=performance.now()+(reducedMotion()?0:motion.normal+64);
    const restore=()=>{
      if(bottom.current) scrollBottom(false);
      else {
        const saved=readingAnchor.current;
        if(saved&&saved!=='bottom'){
          const node=element.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(saved.id)}"]`);
          if(node){element.scrollTop+=node.getBoundingClientRect().top-element.getBoundingClientRect().top-saved.offset;lastScrollTop.current=element.scrollTop;}
        }
      }
      if(performance.now()<until)correctionFrame=requestAnimationFrame(restore);
    };
    restore();anchor.current=null;scheduleRead();
    return () => cancelAnimationFrame(correctionFrame);
    // Scroll is deliberately driven by message reconciliation, not arbitrary renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, collapsing]);
  async function refresh(initial = false, reconcile = true) {
    if (!active.current) return;
    if (refreshing.current) { refreshAgain.current = true; queuedReconcile.current ||= reconcile; return; }
    refreshing.current = true;
    try {
      if (initial || reconcile || !conversation) {
        const meta = await chatApi<{ conversation: ConversationData }>(`/conversations/${id}`);
        if (!active.current) return;
        setConversation(meta.conversation);
        if(initialUnread.current===null&&meta.conversation.lastReadSequence!==undefined)initialUnread.current=meta.conversation.lastReadSequence;
        try { sessionStorage.setItem(`egin.chat.meta.${user.id}.${id}`, JSON.stringify({ ...meta.conversation, lastMessage: null })); } catch { /* Offline metadata is optional. */ }
      }
      if (initial || !current.current.length) {
        const result = await chatApi<History>(`/conversations/${id}/messages`);
        if (!active.current) return; more.current = result.hasMore; setHasMore(result.hasMore); update(result.items, true);
        const quoteIds = [...new Set(pendingRef.current.flatMap(entry => entry.message.replyTo ? [entry.message.replyTo.id] : []))];
        if (quoteIds.length) {
          const check = await chatApi<History>(`/conversations/${id}/messages?after=${result.items.at(-1)?.sequence || 0}&reconcile=${quoteIds.join(',')}`);
          if (!active.current) return;
          for (const messageId of check.deletedIds || []) removeFromEvent(messageId);
          update(check.items);
        }
      } else if (!reconcile) {
        let after = current.current[current.current.length - 1].sequence; let page: History;
        do {
          page = await chatApi<History>(`/conversations/${id}/messages?after=${after}`);
          if (!active.current) return;
          if (!page.items.length) break;
          update(page.items); after = page.items[page.items.length - 1].sequence;
        } while (page.hasMore && active.current);
      } else {
        // Include quote sources outside the loaded interval: stale responses must
        // never restore their content after a missed deletion event.
        const reconcileIds = [...new Set([...current.current.flatMap(message => [message.id, ...(message.replyTo ? [message.replyTo.id] : [])]), ...pendingRef.current.flatMap(entry => entry.message.replyTo ? [entry.message.replyTo.id] : [])])];
        for (let offset = 0; offset < reconcileIds.length; offset += 100) {
          const after = current.current.at(-1)?.sequence || 0;
          const check = await chatApi<History>(`/conversations/${id}/messages?after=${after}&reconcile=${reconcileIds.slice(offset, offset + 100).join(',')}`);
          if (!active.current) return;
          for (const messageId of check.deletedIds || []) removeFromEvent(messageId);
          update(check.items);
        }
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
      if (active.current) { setError(threadError(cause)); setLoading(false); if ([401, 403, 404].includes(Number((cause as { status?: number }).status))) { active.current = false; clearPrivateView(); } }
    } finally {
      refreshing.current = false;
      if (refreshAgain.current && active.current) { const full = queuedReconcile.current; refreshAgain.current = false; queuedReconcile.current = false; void refresh(false, full); }
    }
  }
  async function refreshReceipts() {
    if (!active.current) return;
    if (receiptsBusy.current) { receiptsAgain.current = true; return; }
    receiptsBusy.current = true;
    try {
      const ids = current.current.filter(message => message.sender.id === user.id && !message.deletedAt).map(message => message.id);
      for (let offset = 0; offset < ids.length; offset += 100) {
        const snapshot = await receiptRequest<ReceiptSnapshot>(`/conversations/${id}/receipts?messageIds=${ids.slice(offset, offset + 100).join(',')}`, user.id, undefined, receiptController.current?.signal);
        if (!active.current) return;
        const byId = new Map((snapshot.items || []).map(item => [item.messageId, item.receipt]));
        update(current.current.filter(message => byId.has(message.id)).map(message => ({ ...message, receipt: byId.get(message.id), readByCount: byId.get(message.id)!.readCount })));
      }
    } catch (cause) {
      if (active.current && [401, 403, 404].includes(Number((cause as { status?: number }).status))) { active.current = false; clearPrivateView(); setError(t.revoked); }
    } finally { receiptsBusy.current = false; if (receiptsAgain.current && active.current) { receiptsAgain.current = false; void refreshReceipts(); } }
  }
  const refreshRef = useRef(refresh); refreshRef.current = refresh;
  const { connected } = useChatEvents(event => {
    if(event.type==='preferences'&&event.conversationId===id){if(event.changedKeys?.every(key=>key==='draft'))return;void chatApi<{conversation:ConversationData}>(`/conversations/${id}`).then(r=>{if(active.current)setConversation(r.conversation)}).catch(()=>{});return;}
    if (['activity','presence','preferences'].includes(event.type)) return;
    if (event.conversationId === id && ['message.delivered','message.read','delivered','read'].includes(event.type)) {
      // Own cursors cannot affect the receipt aggregates of our own messages.
      if (event.userId === user.id) return;
      if (receiptTimer.current) clearTimeout(receiptTimer.current);
      receiptTimer.current = setTimeout(() => void refreshReceipts(), 80); return;
    }
    if (event.type === 'deleted' && event.conversationId === id && event.messageId && deletedIds.current.has(event.messageId)) return;
    if (event.type === 'message.deleted' && event.conversationId === id && event.messageId) {
      removeFromEvent(event.messageId, event.deletedAt); changedCallback.current();
      void refreshRef.current(false, false); return;
    }
    if (event.type === 'revoked' && event.conversationId === id) { active.current = false; clearPrivateView(); setLoading(false); setError(t.revoked); return; }
    if (event.type === 'ready' || event.conversationId === id) void refreshRef.current(false, event.type !== 'messages');
  });
  useEffect(() => {
    active.current = true; receiptController.current = new AbortController(); void refreshRef.current(true);
    const visible = () => { if (document.visibilityState === 'visible') { void refreshRef.current(); scheduleRead(); } };
    const connection = () => { setOnline(navigator.onLine); if (navigator.onLine) void refreshRef.current(); };
    const reconcile = setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine) void refreshRef.current(); }, 30000);
    document.addEventListener('visibilitychange', visible); window.addEventListener('online', connection); window.addEventListener('offline', connection);
    return () => { active.current = false; receiptController.current?.abort(); if (receiptTimer.current) clearTimeout(receiptTimer.current); for (const timer of collapseTimers.current.values()) clearTimeout(timer); collapseTimers.current.clear(); clearInterval(reconcile); if (readTimer.current) clearTimeout(readTimer.current); document.removeEventListener('visibilitychange', visible); window.removeEventListener('online', connection); window.removeEventListener('offline', connection); };
    // Thread is keyed by user and conversation; session changes completely unmount it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const element = scroller.current; if (!element || typeof ResizeObserver === 'undefined') return;
    // Media/font layout can grow the content without resizing the fixed scroll
    // viewport. Keep the latest message visible only while already at the bottom.
    const observer = new ResizeObserver(() => {
      if (bottom.current) {scrollBottom(false); return;}
      const saved=readingAnchor.current;
      if(saved&&saved!=='bottom'){
        const row=element.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(saved.id)}"]`);
        if(row){element.scrollTop+=row.getBoundingClientRect().top-element.getBoundingClientRect().top-saved.offset;lastScrollTop.current=element.scrollTop;}
      }
    });
    observer.observe(element); if (historyContent.current) observer.observe(historyContent.current);
    return () => observer.disconnect();
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
    if (!current.current.some(message => message.id === messageId && !message.deletedAt)) { setNotice(t.unavailableOriginal); return; }
    jump.current = messageId; setMessages([...current.current]);
  }
  useLayoutEffect(() => {
    if (accepted?.conversationId === id && accepted.sender.id === user.id) update([accepted]);
    // A committed server copy replaces its local UUID row, including a response-loss retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accepted]);
  const pendingCount = pending.length;
  useLayoutEffect(() => { if (bottom.current) scrollBottom(false); }, [pendingCount]);
  useEffect(() => {
    // Another tab may retire/discard a queued photo while its local preview is
    // open. Do not leave a gallery pointing to an already-revoked object URL.
    if (gallery?.images.some(image => image.url.startsWith('blob:') && !pending.some(entry => entry.message.attachments.some(file => file.url === image.url)))) setGallery(null);
  }, [pending, gallery]);
  useEffect(() => { scheduleRead(); }, [menu, search, actionMessage, gallery, report]);
  const linked = useRef(false);
  useEffect(()=>{const target=new URLSearchParams(location.search).get('message');if(!loading&&!linked.current&&target){linked.current=true;void jumpTo(target);}},[loading]);
  useEffect(()=>()=>stopPress(),[]);
  async function enqueueMessage(input: OutboxInput) { await onEnqueue(input); if (active.current) scrollBottom(false); }
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
  const visibleMessages = messages.filter(message => !message.deletedAt && !message.hidden);
  const currentAction = messages.find(message=>message.id===actionMessage?.id) || actionMessage;
  async function react(message:Message,emoji:string|null) { try { await chatApi(`/conversations/${id}/messages/${message.id}/reaction`,{emoji},'PUT'); await refresh(); } catch(cause) {setError(threadError(cause));} }
  async function messageState(message:Message,values:{saved?:boolean;hidden?:boolean;pinned?:boolean}) {setActing(true);try{await chatApi(`/conversations/${id}/messages/${message.id}/state`,values,'PATCH');if(values.hidden)update([{...message,hidden:true}]);await refresh();setActionMessage(null);}catch(cause){setError(threadError(cause));}finally{setActing(false);}}
  function stopPress(){if(press.current)clearTimeout(press.current.timer);press.current=null;}
  async function archive(){try{await chatApi(`/conversations/${id}/preferences`,{archived:!conversation?.archived},'PATCH');onBack();}catch(cause){setError(threadError(cause));}}
  const pendingMessages = pending.filter(entry => !messages.some(message => message.sender.id === user.id && message.clientId === entry.clientId));
  const renderedMessages = messages.filter(message => (!message.hidden && !message.deletedAt) || collapsing[message.id]);
  const timeline: {message:Message;entry?:PendingOutboxEntry}[] = active.current ? [...renderedMessages.map(message=>({message})),...pendingMessages.map(entry=>({message:entry.message,entry}))] : [];
  useMessageMotion(historyContent, messages, pending, loading);
  return <section ref={threadRoot} inert={phase==='exit'} aria-hidden={phase==='exit'||undefined} data-motion-phase={phase} className="chat-thread" data-chat-theme={conversation?.theme?.preset || 'nature'} style={{...style,...themeStyle(conversation?.theme)}} aria-label={conversation?.title || t.message}>
    <ChatWallpaper />
    <header className="chat-thread-header">
      <button className="chat-icon-button chat-thread-back chat-glass" onClick={onBack} aria-label={t.back}><ChatIcon name="back" size={25} /></button>
      <button className="chat-thread-title chat-glass" onClick={() => conversation?.kind === 'group' ? setGroupProfile(true) : setProfile(true)}><strong>{conversation?.title || t.loading}</strong><small key={connected?'connected':'disconnected'} className={`chat-thread-subtitle${activity.length?' has-activity':''}`}><span className="chat-thread-presence" aria-hidden={Boolean(activity.length)}>{conversation?.group ? `${t.members}: ${conversation.group.memberCount}` : conversation?.kind === 'market' ? 'По объявлению' : presenceLabel(presence.find(peer=>peer.user.id===conversation?.peer?.id))}</span><ChatMotion show={Boolean(activity.length)} kind="collapse" as="span" className="chat-thread-typing"><ActivityLabel items={activity} group={conversation?.kind==='group'}/></ChatMotion></small></button>
      {conversation && <button className="chat-thread-avatar chat-glass" aria-label={t.menu} onClick={() => void openMenu()}><Avatar name={conversation.title} kind={conversation.kind} src={conversation.group?.avatarUrl || conversation.listing?.imageUrl} size={48} /><span className="chat-avatar-menu"><ChatIcon name="more" size={12} /></span></button>}
    </header>
    {conversation?.listing && <div className="chat-thread-listing"><ListingCard listing={conversation.listing} compact /></div>}
    <ChatMotion key={`pins-${privacyEpoch}`} show={messages.some(m=>m.pinned&&!m.deletedAt&&!m.hidden)} kind="collapse" className="chat-pin-motion"><button className="chat-thread-pins" onClick={()=>setCollection('pins')}><ChatIcon name="pin" size={16}/><span>{messages.find(m=>m.pinned&&!m.deletedAt&&!m.hidden) ? messageLabel(messages.find(m=>m.pinned&&!m.deletedAt&&!m.hidden)!) : ''}</span><ChatIcon name="chevron" size={14}/></button></ChatMotion>
    <ErrorNotice message={outboxError||''} />
    {!online ? <div className="chat-connection" role="status">{t.offline}</div> : !connected && !loading ? <div className="chat-connection" role="status">{t.reconnect}</div> : null}
    <ErrorNotice message={error} onRetry={active.current ? () => void refresh() : undefined} />
    {notice && <div className="chat-thread-notice" role="status"><span>{notice}</span><button className="chat-icon-button" aria-label={t.close} onClick={() => setNotice('')}><ChatIcon name="close" size={17} /></button></div>}
    <div className="chat-history" ref={scroller} onScroll={onScroll} aria-label={t.message} aria-busy={loading}>
      <div className="chat-history-content" ref={historyContent}>
      {loading ? <div className="chat-history-skeleton" role="status" aria-label={t.loading}>{[0,1,2,3].map(item=><i key={item}/>)}</div> : <>
        {hasMore && <button className="chat-load-older" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? t.loading : t.older}</button>}
        {!visibleMessages.length && !pendingMessages.length && !error && <div className="chat-thread-empty"><ChatIcon name="chat" size={32} /><h2>{t.emptyTitle}</h2><p>{t.emptyDescription}</p></div>}
        {timeline.map(({message: original,entry}) => {
          const message=original.replyTo&&deletedIds.current.has(original.replyTo.id)?{...original,replyTo:null}:original;
          const rowKey=messageMotionKey(message);
          if (message.deletedAt || message.hidden) return <div key={rowKey} className="chat-message-collapse" aria-hidden="true" style={{ height: collapsing[message.id] }} />;
          if (message.system?.type==='trade') return <TradeMessageCard key={rowKey} message={message} userId={user.id} onReply={()=>{setReply(message);setEdit(null);}}/>;
          if (message.system) return <div key={rowKey} data-motion-key={rowKey} data-motion-sequence={message.sequence} className="chat-system-event" data-message-id={message.id} data-sequence={message.sequence}>{message.text}</div>;
          const own = message.sender.id === user.id; const previous = entry ? visibleMessages.at(-1) : visibleMessages[visibleMessages.findIndex(item => item.id === message.id) - 1]; const newDay = !previous || new Date(previous.createdAt).toDateString() !== new Date(message.createdAt).toDateString(); const groupStart = newDay || previous.sender.id !== message.sender.id;
          return <Fragment key={rowKey}>{newDay && <div className="chat-date-divider">{dayLabel(message.createdAt)}</div>}{!own&&initialUnread.current!==null&&message.sequence>initialUnread.current&&(!previous||previous.sequence<=initialUnread.current)&&<div className="chat-unread-divider">Непрочитанные сообщения</div>}<article data-motion-key={rowKey} data-motion-sequence={entry?undefined:message.sequence} data-motion-local={entry?'true':undefined} data-layout-version={`${message.editedAt||''}:${Boolean(message.replyTo)}:${message.reactions?.map(item=>item.emoji).join(',')||''}`} data-client-id={entry?.clientId} data-outbox-state={entry?.state} data-message-id={entry?undefined:message.id} data-message-kind={message.kind} data-sequence={message.sequence} className={`chat-message-row${own ? ' own' : ''}${groupStart ? ' group-start' : ''}${entry ? ' chat-local-message' : localClients.current.has(message.clientId) ? ' chat-confirmed-local' : ''}${selection.includes(message.id) ? ' chat-selected-message' : ''}`} style={{'--participant-color':participantColor(message.sender.id,darkTheme(conversation?.theme))} as CSSProperties} onContextMenu={event=>{event.preventDefault();if(!entry)setActionMessage(message);}} onPointerDown={event=>{if(entry||event.pointerType==='mouse'||(event.target as HTMLElement).closest('button,a,input,audio,video'))return;stopPress();press.current={x:event.clientX,y:event.clientY,timer:setTimeout(()=>{setActionMessage(message);press.current=null;},500)};}} onPointerMove={event=>{if(press.current&&Math.hypot(event.clientX-press.current.x,event.clientY-press.current.y)>10)stopPress();}} onPointerUp={stopPress} onPointerCancel={stopPress}>
            <div className="chat-message-bubble">
              {!own && conversation?.kind === 'group' && groupStart && <strong className="chat-sender-name">{message.sender.name}</strong>}
              <MessageBody message={message} onReply={messageId => void jumpTo(messageId)} onGallery={(images, imageIndex) => setGallery({ images, index: imageIndex })} />
              <ReactionBar items={message.reactions} onReact={emoji=>void react(message,emoji)} onWho={()=>setWho(message)}/><div className="chat-message-meta">{message.pinned&&<ChatIcon name="pin" size={12}/>} {message.saved&&<span aria-label="В избранном">☆</span>}{message.editedAt && !message.deletedAt && <span>{t.edited}</span>}<time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</time>{own && <MessageStatus message={message} group={conversation?.kind === 'group'} localState={entry?.state} progress={entry?.files.length?entry.progress:undefined} error={entry?.error} onRetry={entry?()=>void onRetryPending(entry.clientId).catch(cause=>setError(threadError(cause))):undefined} onDiscard={entry?()=>void onDiscardPending(entry.clientId).catch(cause=>setError(threadError(cause))):undefined} />}</div>
            </div>
            {!entry && !message.deletedAt && <button className="chat-message-actions" aria-label={`${t.menu}: ${messageLabel(message).slice(0, 35)}`} onClick={() => setActionMessage(message)}><ChatIcon name="more" size={17} /></button>}
          </article></Fragment>;
        })}
      </>}

      </div>
    </div>
    <ChatMotion show={!nearBottom && visibleMessages.length > 0} kind="fade" className="chat-jump-motion"><button className="chat-jump-latest" onClick={() => scrollBottom()}>{t.newMessages} ↓</button></ChatMotion>
    {conversation && <Composer key={`${user.id}:${id}`} conversationId={id} userId={user.id} disabled={!conversation.canWrite||phase==='exit'} reply={reply} edit={edit} onCancelContext={() => { setReply(null); setEdit(null); }} onEnqueue={enqueueMessage} onEdit={editMessage} />}
    <Fragment key={privacyEpoch}>
    <ChatPresence>{gallery && <PhotoGallery images={gallery.images} initialIndex={gallery.index} onClose={() => setGallery(null)} />}</ChatPresence>
    <ChatPresence>{menu && conversation && <ChatSheet title={t.menu} onClose={() => setMenu(false)}><div className="chat-action-list">
      <button onClick={() => { setMenu(false); setSearch(true); }}><ChatIcon name="search" />{t.search}</button>
      {conversation.kind === 'group' && <button onClick={() => { setMenu(false); setGroupProfile(true); }}><ChatIcon name="group" />{t.groupInfo}</button>}
      <button onClick={()=>{setMenu(false);setMaterials(true);}}><ChatIcon name="image"/>Материалы чата</button>
      <button onClick={()=>{setMenu(false);setAppearance(true);}}><ChatIcon name="leaf"/>Оформление</button>
      <button onClick={()=>{setMenu(false);setCollection('saved');}}><ChatIcon name="pin"/>Избранные сообщения</button>
      <button onClick={()=>{setMenu(false);setCollection('pins');}}><ChatIcon name="pin"/>Закреплённые сообщения</button>
      <button onClick={()=>void archive()}><ChatIcon name="file"/>{conversation.archived?'Вернуть из архива':'В архив'}</button>
      <button disabled={acting} onClick={() => void preference('muted')}><ChatIcon name={conversation.muted ? 'bell' : 'mute'} />{conversation.muted ? t.unmute : t.mute}</button>
      <button disabled={acting} onClick={() => void preference('pinned')}><ChatIcon name="pin" />{conversation.pinned ? t.unpin : t.pin}</button>
      {conversation.peer && <button disabled={acting} onClick={() => void toggleBlock()}><ChatIcon name="block" />{ownBlock ? t.unblock : t.block}</button>}
      <button onClick={() => { setMenu(false); setReport({ targetType: conversation.kind === 'group' ? 'group' : 'user', targetId: conversation.kind === 'group' ? id : conversation.peer!.id }); }}><ChatIcon name="report" />{t.report}</button>
    </div><ErrorNotice message={error} /></ChatSheet>}</ChatPresence>
    <ChatPresence>{actionMessage && <ChatSheet title={t.message} onClose={() => setActionMessage(null)}><ReactionPicker items={currentAction?.reactions} onReact={emoji=>{void react(actionMessage,emoji);setActionMessage(null);}}/><div className="chat-action-list">
      <button onClick={()=>{setForward([actionMessage]);setActionMessage(null);}}><ChatIcon name="send"/>Переслать</button>
      <button onClick={()=>{setSelection(old=>old.includes(actionMessage.id)?old.filter(value=>value!==actionMessage.id):[...old,actionMessage.id].slice(0,10));setActionMessage(null);}}><ChatIcon name="check"/>Выбрать сообщение</button>
      <button onClick={()=>void messageState(actionMessage,{saved:!currentAction?.saved})}><ChatIcon name="pin"/>{currentAction?.saved?'Убрать из избранного':'Сохранить в избранное'}</button>
      {(conversation?.kind!=='group'||['owner','admin'].includes(conversation.role))&&<button onClick={()=>void messageState(actionMessage,{pinned:!currentAction?.pinned})}><ChatIcon name="pin"/>{currentAction?.pinned?'Открепить сообщение':'Закрепить сообщение'}</button>}
      <button onClick={()=>void messageState(actionMessage,{hidden:true})}><ChatIcon name="trash"/>Удалить у себя</button>
      {actionMessage.sender.id===user.id&&<button onClick={()=>{setReceiptPeople(actionMessage);setActionMessage(null);}}><ChatIcon name="check"/>Информация о доставке</button>}
      <button onClick={()=>{const url=new URL(location.href);url.searchParams.set('chat',id);url.searchParams.set('message',actionMessage.id);void navigator.clipboard.writeText(url.toString()).then(()=>setNotice('Ссылка скопирована')).catch(()=>setNotice(t.copyFailed));setActionMessage(null);}}><ChatIcon name="copy"/>Ссылка на сообщение</button>
      {conversation?.canWrite && <button onClick={() => { setReply(actionMessage); setEdit(null); setActionMessage(null); }}><ChatIcon name="reply" />{t.reply}</button>}
      {actionMessage.text && <button onClick={() => { void (async () => { try { await navigator.clipboard.writeText(actionMessage.text); setNotice(t.copied); } catch { setNotice(t.copyFailed); } })(); setActionMessage(null); }}><ChatIcon name="copy" />{t.copy}</button>}
      {actionMessage.sender.id === user.id && conversation?.canWrite && actionMessage.text && <button onClick={() => { setEdit(actionMessage); setReply(null); setActionMessage(null); }}><ChatIcon name="edit" />{t.edit}</button>}
      {(actionMessage.sender.id === user.id || (conversation?.kind === 'group' && ['owner', 'admin'].includes(conversation.role))) && <button disabled={acting} onClick={() => void removeMessage(actionMessage)}><ChatIcon name="trash" />{t.remove}</button>}
      <button onClick={() => { setReport({ targetType: 'message', targetId: actionMessage.id }); setActionMessage(null); }}><ChatIcon name="report" />{t.report}</button>
    </div><ErrorNotice message={error} /></ChatSheet>}</ChatPresence>
    <ChatPresence>{search && <ConversationSearch id={id} onClose={() => setSearch(false)} onSelect={messageId => void jumpTo(messageId)} />}</ChatPresence>
    <ChatMotion show={Boolean(selection.length)} kind="collapse"><div className="chat-selection-bar"><span>Выбрано: {selection.length}</span><button className="chat-text-button" onClick={()=>setForward(visibleMessages.filter(m=>selection.includes(m.id)))}>Переслать</button><button className="chat-icon-button" aria-label="Снять выбор" onClick={()=>setSelection([])}><ChatIcon name="close"/></button></div></ChatMotion>
    <ChatPresence>{who&&<ReactionPeople items={messages.find(m=>m.id===who.id)?.reactions||[]} onClose={()=>setWho(null)}/>}</ChatPresence>
    <ChatPresence>{forward&&<ForwardPicker id={id} messages={forward} onClose={()=>setForward(null)} onDone={()=>{setForward(null);setSelection([]);setNotice('Сообщения пересланы');}}/>}</ChatPresence>
    <ChatPresence>{receiptPeople&&<ReceiptPeople id={id} message={receiptPeople} onClose={()=>setReceiptPeople(null)}/>}</ChatPresence>
    <ChatPresence>{collection&&<MessageCollection id={id} type={collection} onClose={()=>setCollection(null)} onSelect={messageId=>{setCollection(null);void jumpTo(messageId);}}/>}</ChatPresence>
    <ChatPresence>{materials&&<ChatMaterials conversationId={id} onClose={()=>setMaterials(false)} onJump={messageId=>{setMaterials(false);void jumpTo(messageId);}}/>}</ChatPresence>
    <ChatPresence>{appearance&&<ChatAppearance id={id} initial={conversation?.theme} onClose={()=>setAppearance(false)} onSaved={theme=>{setConversation(old=>old?{...old,theme}:old);setAppearance(false);}}/>}</ChatPresence>
    <ChatPresence>{profile&&conversation&&<ChatSheet title={conversation.title} onClose={()=>setProfile(false)}><div className="chat-group-profile"><Avatar name={conversation.title} kind={conversation.kind} size={72}/><h2>{conversation.title}</h2></div><div className="chat-action-list"><button onClick={()=>{setProfile(false);setMaterials(true);}}><ChatIcon name="image"/>Материалы чата</button><button onClick={()=>{setProfile(false);setAppearance(true);}}><ChatIcon name="leaf"/>Оформление · Тема чата</button><button onClick={()=>{setProfile(false);setCollection('saved');}}><ChatIcon name="pin"/>Избранные сообщения</button></div></ChatSheet>}</ChatPresence>
    <ChatPresence>{groupProfile&&<GroupDetails id={id} user={user} onClose={()=>setGroupProfile(false)} onOpen={()=>setGroupProfile(false)} onChanged={()=>{void refresh();changedCallback.current();}} onLeft={()=>{setGroupProfile(false);clearPrivateView();onBack();}} onAppearance={()=>{setGroupProfile(false);setAppearance(true);}} onMaterials={()=>{setGroupProfile(false);setMaterials(true);}}/>}</ChatPresence>
    <ChatPresence>{report && <ReportSheet target={report} onClose={() => setReport(null)} onDone={() => { setReport(null); setNotice(t.reportSent); }} />}</ChatPresence>
    </Fragment>
  </section>;
}

function ReportSheet({ target, onClose, onDone }: { target: { targetType: string; targetId: string }; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('spam'); const [description, setDescription] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  return <ChatSheet title={t.report} onClose={onClose}><form className="chat-form" onSubmit={event => { event.preventDefault(); if (busy) return; setBusy(true); void chatApi('/reports', { ...target, reason, description }).then(onDone).catch(cause => setError(threadError(cause))).finally(() => setBusy(false)); }}><label>{t.reportReason}<select value={reason} onChange={event => setReason(event.target.value)}><option value="spam">{t.reportSpam}</option><option value="fraud">{t.reportFraud}</option><option value="abuse">{t.reportAbuse}</option><option value="other">{t.reportOther}</option></select></label><textarea aria-label={t.reportPlaceholder} placeholder={t.reportPlaceholder} maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} /><ErrorNotice message={error} /><button className="chat-button" disabled={busy}>{busy ? t.sending : t.send}</button></form></ChatSheet>;
}
