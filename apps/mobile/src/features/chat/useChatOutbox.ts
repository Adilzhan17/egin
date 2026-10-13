import { useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE } from '../../entities/workspace/api';
import { chatApi, uploadChatAttachment } from './api';
import { optimizeChatImage } from './image-upload';
import type { Attachment, Message } from './types';
import { changeOutbox, claimOutbox, listOutbox, putNewOutbox, type OutboxEntry, type OutboxInput } from './outbox-store';
export type { OutboxInput, OutboxEntry } from './outbox-store';

export type PendingOutboxEntry = OutboxEntry & { message: Message };
type Options = { onAccepted: (message: Message) => void; enabled?: boolean; senderName?: string };
const localChanges = new EventTarget();
const errorText = (error: unknown) => error instanceof DOMException && error.name === 'EncodingError' ? 'Не удалось прочитать вложение. Файл сохранён в очереди.' : error instanceof Error ? error.message === 'Failed to fetch' ? 'Нет ответа от сервера. Сообщение сохранено: повторите отправку.' : error.message : 'Не удалось отправить сообщение. Повторите попытку.';
async function jsonRequest<T>(path: string, userId: string, signal: AbortSignal, body?: unknown): Promise<T> {
  const controller = new AbortController(); const abort = () => controller.abort(); signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) controller.abort();
  const timeout = setTimeout(() => controller.abort(new DOMException('Время ожидания истекло', 'TimeoutError')), 20_000);
  try {
    const response = await fetch(API_BASE + '/api' + path, { method: body === undefined ? 'GET' : 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-EGIN': '1', 'X-EGIN-Outbox-User': userId }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal });
    const data = await response.json().catch(() => { throw new Error('Сервер не ответил. Сообщение сохранено для повторной отправки.'); });
    if (!response.ok) throw Object.assign(new Error(data.error || 'Сервер отклонил сообщение. Повторите попытку.'), { status: response.status });
    return data as T;
  } catch (error) {
    if (!signal.aborted && controller.signal.aborted) throw new Error('Сервер не подтвердил отправку вовремя. Повторите: дубликат сообщения не появится.');
    throw error;
  } finally { clearTimeout(timeout); signal.removeEventListener('abort', abort); }
}

/** One user-wide worker stays mounted in ChatWorkspace, including its chat list. */
export function useChatOutbox(userId: string, conversationId: string, options: Options) {
  const [entries, setEntries] = useState<OutboxEntry[]>([]), [error, setError] = useState('');
  const callback = useRef(options.onAccepted); callback.current = options.onAccepted;
  const wake = useRef<() => void>(() => {}), refreshRef = useRef<() => Promise<void>>(async () => {});
  const cancelUpload = useRef<{key:string;abort:()=>void}|null>(null);
  const optionsEnabled = options.enabled !== false;
  useEffect(() => {
    if (!userId || !optionsEnabled) { setEntries([]); return; }
    let active = true, running = false, request: AbortController | null = null;
    const owner = crypto.randomUUID(), channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('egin-chat-outbox') : null;
    const announce = () => { localChanges.dispatchEvent(new Event('change')); if (active) channel?.postMessage({ userId }); };
    async function refresh() {
      try { const current = await listOutbox(userId); if (active) { setEntries(current); setError(''); } }
      catch (cause) { if (active) setError(errorText(cause)); }
    }
    refreshRef.current = refresh;
    async function pump() {
      if (running || !active || !navigator.onLine) return; running = true;
      try {
        while (active && navigator.onLine) {
          const entry = await claimOutbox(userId, owner); if (!entry) break;
          request = new AbortController(); const signal = request.signal; cancelUpload.current={key:entry.key,abort:()=>request?.abort()}; announce();
          let activityTimer:ReturnType<typeof setInterval>|undefined;
          const publishUpload=(state:'uploading'|null)=>{void chatApi(`/conversations/${entry.conversationId}/activity`,{state}).catch(()=>{});};
          const lease = setInterval(() => { void changeOutbox(entry.key, userId, current => current.leaseOwner === owner ? { ...current, leaseUntil: Date.now() + 120_000 } : undefined).catch(() => {}); }, 30_000);
          try {
            const session = await jsonRequest<{ user: { id: string } | null }>('/session', userId, signal);
            if (session.user?.id !== userId) throw new Error('Аккаунт изменился. Вернитесь в исходный профиль и повторите отправку.');
            const attachmentIds: string[] = [];
            if(entry.files.length){publishUpload('uploading');activityTimer=setInterval(()=>publishUpload('uploading'),4000);}
            for (let index = 0; index < entry.files.length; index++) {
              if (signal.aborted) throw new DOMException('Операция отменена', 'AbortError');
              const pending = entry.files[index]; let uploaded = Date.now() - (pending.uploadedAt || 0) < 24 * 60 * 60 * 1000 ? pending.uploaded : undefined;
              if (!uploaded) {
                const file = pending.kind === 'image' ? await optimizeChatImage(pending.file) : pending.file;
                if (signal.aborted) throw new DOMException('Операция отменена', 'AbortError');
                uploaded = await uploadChatAttachment(entry.conversationId, file, pending.kind, percent => {
                  if (active) setEntries(current => current.map(item => item.key === entry.key ? { ...item, progress: Math.round((index + percent / 100) / entry.files.length * 90) } : item));
                }, signal, userId);
                pending.uploaded = uploaded;
                await changeOutbox(entry.key, userId, current => current.leaseOwner === owner ? { ...current, files: current.files.map(item => item.key === pending.key ? { ...item, uploaded, uploadedAt: Date.now() } : item), progress: Math.round((index + 1) / entry.files.length * 90) } : undefined);
              }
              attachmentIds.push(uploaded.id);
            }
            // Re-read after upload: a deletion event may have removed an obsolete quote.
            const latest = await changeOutbox(entry.key, userId, current => current.leaseOwner === owner ? {...current,progress:95} : undefined);
            if (!latest) throw new Error('Отправка уже обрабатывается в другой вкладке.');
            const result = await jsonRequest<{ message: Message }>(`/chat/conversations/${encodeURIComponent(entry.conversationId)}/messages`, userId, signal, { ...latest.draft, ...(attachmentIds.length ? { attachmentIds } : {}) });
            if (!result?.message?.id || !Number.isSafeInteger(result.message.sequence) || result.message.sequence <= 0 || result.message.clientId !== entry.clientId || result.message.sender?.id !== userId || result.message.conversationId !== entry.conversationId) throw new Error('Сервер не подтвердил это сообщение. Повторите отправку.');
            await changeOutbox(entry.key, userId, current => current.leaseOwner === owner ? null : undefined);
            if (active) callback.current(result.message); announce();
          } catch (cause) {
            const interrupted = !active || !navigator.onLine || signal.aborted;
            await changeOutbox(entry.key, userId, current => current.leaseOwner === owner ? { ...current, state: interrupted ? 'queued' : 'failed', progress: 0, error: interrupted ? undefined : errorText(cause), leaseOwner: undefined, leaseUntil: undefined } : undefined);
            announce();
          } finally { clearInterval(lease);clearInterval(activityTimer);if(entry.files.length)publishUpload(null);cancelUpload.current=null; request = null; }
        }
      } catch (cause) { if (active) setError(errorText(cause)); }
      finally { running = false; if (active) await refresh(); }
    }
    const changed = () => { void refresh(); void pump(); };
    const offline = () => { request?.abort(); };
    const remoteChanged = (event: MessageEvent) => { if (event.data?.userId === userId) changed(); };
    wake.current = announce;
    localChanges.addEventListener('change', changed); channel?.addEventListener('message', remoteChanged);
    window.addEventListener('online', changed); window.addEventListener('offline', offline);
    // Recover an abandoned lease after a tab closes mid-upload; no timer changes receipts.
    const recovery = setInterval(changed, 30_000); changed();
    return () => { active = false; request?.abort(); clearInterval(recovery); channel?.removeEventListener('message', remoteChanged); channel?.close(); localChanges.removeEventListener('change', changed); window.removeEventListener('online', changed); window.removeEventListener('offline', offline); wake.current = () => {}; refreshRef.current = async () => {}; };
  }, [userId, optionsEnabled]);

  const previews = useRef(new Map<string, string>());
  const visible = useMemo(() => entries.filter(entry => entry.userId === userId && entry.conversationId === conversationId), [entries, userId, conversationId]);
  const pending = useMemo<PendingOutboxEntry[]>(() => visible.map(entry => {
    const attachments = entry.files.map(file => {
      const key = `${entry.key}:${file.key}`;
      if (!previews.current.has(key)) previews.current.set(key, URL.createObjectURL(file.file));
      return { id: file.key, kind: file.kind, name: file.file.name, size: file.file.size, mimeType: file.file.type, url: previews.current.get(key)!, duration: file.duration, waveform: file.waveform } satisfies Attachment;
    });
    const message: Message = { id: `local:${entry.clientId}`, clientId: entry.clientId, conversationId: entry.conversationId, sender: { id: userId, name: options.senderName || '' }, sequence: 0, kind: entry.draft.kind, text: entry.draft.text || '', createdAt: entry.createdAt, editedAt: null, deletedAt: null, attachments, replyTo: entry.replyTo, listing: entry.listing, location: entry.draft.location || null, readByCount: 0 };
    return { ...entry, message };
  }), [visible, userId, options.senderName]);
  useEffect(() => { const keep = new Set(visible.flatMap(entry => entry.files.map(file => `${entry.key}:${file.key}`))); for (const [key, url] of previews.current) { if (!keep.has(key)) { URL.revokeObjectURL(url); previews.current.delete(key); } } }, [visible]);
  useEffect(() => () => { previews.current.forEach(url => URL.revokeObjectURL(url)); previews.current.clear(); }, []);

  async function enqueue(input: OutboxInput) {
    if (!userId || !conversationId || !optionsEnabled) throw new Error('Откройте переписку и войдите в аккаунт.');
    const entry: OutboxEntry = { key: `${userId}:${conversationId}:${input.draft.clientId}`, userId, conversationId, clientId: input.draft.clientId, createdAt: new Date().toISOString(), state: 'queued', progress: 0, attempts: 0, draft: input.draft, files: input.files || [], replyTo: input.replyTo || null, listing: input.listing || null };
    await putNewOutbox(entry); await refreshRef.current(); wake.current();
  }
  async function retry(clientId: string) {
    await changeOutbox(`${userId}:${conversationId}:${clientId}`, userId, entry => entry.state === 'failed' ? { ...entry, state: 'queued', error: undefined, progress: 0, leaseOwner: undefined, leaseUntil: undefined } : undefined);
    await refreshRef.current(); wake.current();
  }
  async function scrubReply(deletedConversationId: string, messageId: string) {
    const current = await listOutbox(userId);
    await Promise.all(current.filter(entry => entry.conversationId === deletedConversationId && (entry.replyTo?.id === messageId || entry.draft.replyToMessageId === messageId)).map(entry => changeOutbox(entry.key, userId, item => {
      const { replyToMessageId: _, ...draft } = item.draft;
      return { ...item, replyTo: null, draft };
    })));
    await refreshRef.current(); wake.current();
  }
  async function confirmAccepted(messages: Message[]) {
    const confirmed = messages.filter(message => message.id && !message.id.startsWith('local:') && Number.isSafeInteger(message.sequence) && message.sequence > 0 && message.sender?.id === userId && message.clientId && message.conversationId);
    if (!confirmed.length) return;
    const existing = new Set((await listOutbox(userId)).map(entry => entry.key));
    const keys = confirmed.map(message => `${userId}:${message.conversationId}:${message.clientId}`).filter(key => existing.has(key));
    if (!keys.length) return;
    await Promise.all(keys.map(key => changeOutbox(key, userId, () => null)));
    await refreshRef.current(); wake.current();
  }
  async function discard(clientId: string) {
    let sending = false,cancelled=false;
    await changeOutbox(`${userId}:${conversationId}:${clientId}`, userId, entry => { if (entry.state === 'sending') { if(entry.files.length&&entry.progress<95){cancelled=true;return null;}sending = true; return undefined; } return null; });
    if(cancelled&&cancelUpload.current?.key===`${userId}:${conversationId}:${clientId}`)cancelUpload.current.abort();
    if (sending) throw new Error('Сообщение сейчас отправляется. Дождитесь результата, затем уберите его из очереди.');
    await refreshRef.current(); wake.current();
  }
  return { pending, enqueue, retry, error, scrubReply, confirmAccepted, discard };
}
