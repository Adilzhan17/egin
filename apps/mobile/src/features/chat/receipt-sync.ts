import { useEffect, useRef } from 'react';
import { API_BASE } from '../../entities/workspace/api';
import { useChatEvents } from './hooks';
import type { Conversation, Message, MessageReceipt } from './types';

export type ReceiptSnapshot = { conversationId: string; version: number; items: { messageId: string; receipt: MessageReceipt }[]; self: { deliveredSequence: number; readSequence: number } };
export async function receiptRequest<T>(path: string, userId: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort(); else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 20000);
  try {
    const response = await fetch(`${API_BASE}/api/chat${path}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'include', signal: controller.signal, headers: { 'Content-Type': 'application/json', 'X-EGIN': '1', 'X-EGIN-Outbox-User': userId }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const value = await response.json();
    if (!response.ok) throw Object.assign(new Error(value.error || 'Не удалось обновить статус'), { status: response.status });
    return value as T;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

/** Delivery means a complete page of message DTOs reached this signed-in Chat.
 * List previews and SSE/push notifications alone never acknowledge delivery.
 * Cursor ACKs are account-scoped (any of the recipient's devices), not read receipts.
 */
export function useDeliverySync(userId: string, conversations: Conversation[], activeId: string, onConfirmed: (messages: Message[]) => Promise<void>) {
  const confirm = useRef(onConfirmed); confirm.current = onConfirmed;
  const enqueue = useRef<(id: string, target?: number, reset?: boolean) => void>(() => {});
  const discover = useRef<() => void>(() => {});
  useChatEvents(event => {
    if (event.type === 'ready') discover.current();
    else if (event.conversationId && ['messages', 'message.created', 'members'].includes(event.type)) enqueue.current(event.conversationId, undefined, event.type === 'members');
  });
  useEffect(() => {
    const controller = new AbortController(); let stopped = false, running = false, discovering = false;
    const pending = new Map<string, number>(), completed = new Map<string, number>();
    const denied = new Set<string>(); let retry: ReturnType<typeof setTimeout> | undefined;
    const request = <T,>(path: string, body?: unknown) => receiptRequest<T>(path, userId, body, controller.signal);
    async function drain() {
      if (running || stopped || !navigator.onLine) return;
      running = true;
      try {
        while (pending.size && !stopped && navigator.onLine) {
          const [id, target] = pending.entries().next().value!; pending.delete(id);
          if (denied.has(id) || (completed.get(id) ?? -1) >= target) continue;
          try {
            const snapshot = await request<ReceiptSnapshot>(`/conversations/${id}/receipts`);
            if (stopped) break;
            // Missing fields indicate an old blue/green slot, not proof of delivery.
            if (!snapshot.self || !Number.isSafeInteger(snapshot.self.deliveredSequence)) continue;
            let after = snapshot.self.deliveredSequence;
            if (after >= target) { completed.set(id, after); continue; }
            let hasMore = false;
            for (let pageIndex = 0; pageIndex < 8 && !stopped; pageIndex++) {
              const page = await request<{ items: Message[]; hasMore: boolean }>(`/conversations/${id}/messages?after=${after}`);
              if (stopped) break;
              const valid = page.items.filter(message => message.conversationId === id && Number.isSafeInteger(message.sequence) && message.sequence > after);
              if (!valid.length) { hasMore = false; completed.set(id, after); break; }
              void confirm.current(valid).catch(() => {});
              const latest = Math.max(...valid.map(message => message.sequence));
              await request(`/conversations/${id}/delivered`, { sequence: latest });
              after = latest; completed.set(id, latest); hasMore = page.hasMore;
              if (!hasMore) break;
            }
            if (hasMore) pending.set(id, target);
          } catch (error) {
            if (stopped) break;
            const status = Number((error as { status?: number }).status);
            if (status === 401) { pending.clear(); break; }
            if ([403, 404].includes(status)) { denied.add(id); continue; }
            pending.set(id, target);
            clearTimeout(retry); retry = setTimeout(() => void drain(), 5000);
            break;
          }
        }
      } finally { running = false; }
    }
    enqueue.current = (id, target = Number.POSITIVE_INFINITY, reset = false) => {
      if (!id || stopped) return;
      if (reset) { completed.delete(id); denied.delete(id); }
      if (denied.has(id) || (completed.get(id) ?? -1) >= target) return;
      pending.set(id, Math.max(pending.get(id) || 0, target)); void drain();
    };
    // Also discover conversations outside the currently selected list filter/page.
    async function discoverAll() {
      if (stopped || discovering || !navigator.onLine) return;
      discovering = true;
      try {
        let cursor: string | null = null;
        do {
          const page: { items: Conversation[]; nextCursor: string | null } = await request(`/conversations?filter=all${cursor ? `&before=${encodeURIComponent(cursor)}` : ''}`);
          if (stopped) return;
          for (const conversation of page.items) if (conversation.lastMessage) enqueue.current(conversation.id, conversation.lastMessage.sequence);
          cursor = page.nextCursor;
        } while (cursor && !stopped);
      } catch { /* Reconnect/visibility retries without claiming a device ACK. */ }
      finally { discovering = false; }
    }
    discover.current = () => { completed.clear(); denied.clear(); void discoverAll(); };
    const reconnect = () => { completed.clear(); denied.clear(); void drain(); void discoverAll(); };
    const visible = () => { if (document.visibilityState === 'visible') reconnect(); };
    const interval = setInterval(() => { if (document.visibilityState === 'visible') { void drain(); void discoverAll(); } }, 30000);
    window.addEventListener('online', reconnect); document.addEventListener('visibilitychange', visible);
    void discoverAll();
    return () => { stopped = true; controller.abort(); clearInterval(interval); clearTimeout(retry); pending.clear(); enqueue.current = () => {}; discover.current = () => {}; window.removeEventListener('online', reconnect); document.removeEventListener('visibilitychange', visible); };
  }, [userId]);
  useEffect(() => { for (const conversation of conversations) if (conversation.lastMessage) enqueue.current(conversation.id, conversation.lastMessage.sequence); }, [conversations]);
  // Opening a thread asks once for its latest body page. A receipt-only list
  // refresh must not turn the same active ID into another infinite-target sync.
  useEffect(() => { if (activeId) enqueue.current(activeId); }, [activeId]);
}
