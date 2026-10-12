import type { Attachment, ListingReference, Message, MessageDraft } from './types';

export type OutboxFile = { key: string; file: File; kind: Attachment['kind']; duration?: number; waveform?: number[]; uploaded?: Attachment; uploadedAt?: number };
export type OutboxInput = { draft: MessageDraft; files?: OutboxFile[]; replyTo?: Message['replyTo']; listing?: ListingReference | null };
export type OutboxState = 'queued' | 'sending' | 'failed';
export type OutboxEntry = { key: string; userId: string; conversationId: string; clientId: string; createdAt: string; state: OutboxState; progress: number; error?: string; attempts: number; draft: MessageDraft; files: OutboxFile[]; replyTo: Message['replyTo']; listing: ListingReference | null; leaseOwner?: string; leaseUntil?: number };
type StoredBinary = { encoding: 'array-buffer-v1'; data: ArrayBuffer; name: string; type: string; lastModified: number };
type StoredEntry = Omit<OutboxEntry, 'files'> & { files: (Omit<OutboxFile, 'file'> & { file: File | StoredBinary })[] };
const binaryCache = new WeakMap<Blob, ArrayBuffer>();
const isStoredBinary = (file: File | StoredBinary): file is StoredBinary => 'encoding' in file && file.encoding === 'array-buffer-v1';
function restore(entry: StoredEntry): OutboxEntry {
  return { ...entry, files: entry.files.map(item => {
    if (!isStoredBinary(item.file)) return { ...item, file: item.file }; // Existing File-based queues remain readable.
    const file = new File([item.file.data], item.file.name, { type: item.file.type, lastModified: item.file.lastModified });
    binaryCache.set(file, item.file.data); return { ...item, file };
  }) };
}
function serialize(entry: OutboxEntry): StoredEntry {
  return { ...entry, files: entry.files.map(item => {
    const data = binaryCache.get(item.file);
    return { ...item, file: data ? { encoding: 'array-buffer-v1' as const, data, name: item.file.name, type: item.file.type, lastModified: item.file.lastModified } : item.file };
  }) };
}
// Never silently evict unsent content. If storage is full, Composer retains its draft.
export const OUTBOX_LIMIT = 50;
export const OUTBOX_BYTES = 100 * 1024 * 1024;
const DATABASE = 'egin-chat-outbox-v1';
let databasePromise: Promise<IDBDatabase> | undefined;
function database() {
  return databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => { const store = request.result.createObjectStore('messages', { keyPath: 'key' }); store.createIndex('userId', 'userId'); };
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); databasePromise = undefined; }; resolve(db); };
    request.onerror = () => { databasePromise = undefined; reject(new Error('Не удалось открыть очередь на устройстве. Сообщение осталось в поле ввода.')); };
    request.onblocked = () => { databasePromise = undefined; reject(new Error('Закройте старые вкладки egin и повторите отправку.')); };
  });
}
function failure(error: DOMException | null) { return new Error(error?.name === 'QuotaExceededError' ? 'На устройстве недостаточно места. Освободите память и повторите: текст и вложения остались в поле ввода.' : 'Не удалось сохранить очередь на устройстве. Повторите попытку.'); }
export async function listOutbox(userId: string): Promise<OutboxEntry[]> {
  const db = await database(); return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readonly'), request = tx.objectStore('messages').index('userId').getAll(userId);
    request.onsuccess = () => resolve((request.result as StoredEntry[]).map(restore).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.key.localeCompare(b.key)));
    request.onerror = () => reject(failure(request.error));
  });
}
export async function putNewOutbox(entry: OutboxEntry): Promise<void> {
  // WebKit can reject File/Blob values in IndexedDB. Store portable bytes and metadata;
  // do asynchronous reads BEFORE opening a transaction, then atomically save the row.
  try { await Promise.all(entry.files.map(async item => { if (!binaryCache.has(item.file)) binaryCache.set(item.file, await item.file.arrayBuffer()); })); }
  catch { throw new Error('Не удалось прочитать вложение. Файл остался в поле ввода: выберите его ещё раз.'); }
  const stored = serialize(entry);
  const db = await database(); return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readwrite'), store = tx.objectStore('messages'); let reason: Error | undefined;
    const request = store.index('userId').getAll(entry.userId);
    request.onsuccess = () => {
      const entries = request.result as StoredEntry[];
      if (entries.some(existing => existing.key === entry.key)) return;
      const bytes = [...entries, stored].reduce((sum, item) => sum + item.files.reduce((size, item) => size + (isStoredBinary(item.file) ? item.file.data.byteLength : item.file.size), 0), 0);
      if (entries.length >= OUTBOX_LIMIT || bytes > OUTBOX_BYTES) { reason = new Error('В очереди уже 50 сообщений или 100 МБ вложений. Дождитесь отправки или повторите сообщения с ошибкой. Текущий черновик сохранён.'); tx.abort(); return; }
      store.put(stored);
    };
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(reason || failure(tx.error)); tx.onabort = () => reject(reason || failure(tx.error));
  });
}
/** Atomic read-modify-write keeps two tabs from owning the same upload. */
export async function changeOutbox(key: string, userId: string, change: (entry: OutboxEntry) => OutboxEntry | null | undefined): Promise<OutboxEntry | null> {
  const db = await database(); return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readwrite'), store = tx.objectStore('messages'), request = store.get(key); let result: OutboxEntry | null = null;
    request.onsuccess = () => {
      const current = request.result as StoredEntry | undefined; if (!current || current.userId !== userId) return;
      const next = change(restore(current)); if (next === undefined) return;
      result = next; if (next === null) store.delete(key); else store.put(serialize(next));
    };
    tx.oncomplete = () => resolve(result); tx.onerror = () => reject(failure(tx.error)); tx.onabort = () => reject(failure(tx.error));
  });
}
export async function claimOutbox(userId: string, owner: string): Promise<OutboxEntry | null> {
  const db = await database(); return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readwrite'), store = tx.objectStore('messages'), request = store.index('userId').getAll(userId); let claimed: OutboxEntry | null = null;
    request.onsuccess = () => {
      const items = (request.result as StoredEntry[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const next = items.find(entry => entry.state === 'queued' || (entry.state === 'sending' && (entry.leaseUntil || 0) < Date.now()));
      if (!next) return;
      claimed = { ...restore(next), state: 'sending', error: undefined, attempts: next.attempts + 1, leaseOwner: owner, leaseUntil: Date.now() + 120_000 };
      store.put(serialize(claimed));
    };
    tx.oncomplete = () => resolve(claimed); tx.onerror = () => reject(failure(tx.error)); tx.onabort = () => reject(failure(tx.error));
  });
}
