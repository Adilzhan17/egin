import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { API_BASE } from '../../entities/workspace/api';
import { chatApi, chatError } from './api';
import { useChatEvents } from './hooks';

type DraftPreferences = { draft: string; version: number };
type PendingDraft = { token: string; draft: string; base: DraftPreferences | null; conflict?: boolean };
function readPending(key: string): PendingDraft | null {
  try { const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value && typeof value.token === 'string' && typeof value.draft === 'string' && value.draft.length <= 4000 &&
      (value.base === null || (typeof value.base?.draft === 'string' && Number.isSafeInteger(value.base.version))) ? value : null;
  } catch { return null; }
}
function storePending(key: string, value: PendingDraft) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* The composer's existing local draft remains an independent fallback. */ } }
function removePending(key: string, token: string) { try { if (readPending(key)?.token === token) localStorage.removeItem(key); } catch { /* Storage is optional in private mode. */ } }
async function patchDraft(path: string, userId: string, value: string, expectedVersion: number) {
  const response = await fetch(API_BASE + '/api/chat' + path, { method: 'PATCH', credentials: 'include', keepalive: true,
    headers: { 'Content-Type': 'application/json', 'X-EGIN': '1', 'X-EGIN-Outbox-User': userId },
    body: JSON.stringify({ draft: value, expectedVersion }), signal: AbortSignal.timeout(20000) });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || 'Не удалось синхронизировать черновик'), { status: response.status });
  return result as { preferences: DraftPreferences };
}
function acknowledgePending(key: string, sent: PendingDraft, remote: DraftPreferences) {
  const current = readPending(key);
  if (!current) return;
  if (current.token === sent.token && current.draft === remote.draft) removePending(key, current.token);
  else if (current.base?.version === sent.base?.version) storePending(key, { ...current, base: remote });
}
/** Best effort while leaving the screen; the persisted marker handles termination/offline/conflict. */
async function flushDetached(key: string, path: string, userId: string) {
  const pending = readPending(key);
  if (!pending?.base || pending.conflict || !navigator.onLine) return;
  try { const result = await patchDraft(path, userId, pending.draft, pending.base.version); acknowledgePending(key, pending, result.preferences); }
  catch { /* Never discard a pending empty draft or bypass a version/account conflict. */ }
}
type Options = { conversationId: string; userId: string; text: string; setText: (text: string) => void };

/** The composer keeps its offline local copy; PostgreSQL is the cross-device draft authority. */
export function useServerDraft({ conversationId, userId, text, setText }: Options) {
  const [remoteConflict, setRemoteConflict] = useState<string | null>(null);
  const [error, setError] = useState(''), [syncing, setSyncing] = useState(false);
  const local = useRef(text), apply = useRef(setText), base = useRef<DraftPreferences | null>(null);
  const conflict = useRef(false), active = useRef(false), writing = useRef(false), refreshAgain = useRef(false);
  const request = useRef(0), generation = useRef(0), initialText = useRef(text);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fetchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  local.current = text.normalize('NFC'); apply.current = setText;
  const path = '/conversations/' + encodeURIComponent(conversationId) + '/preferences';
  const storageKey = `egin.chat.draft-sync.v1.${userId}.${conversationId}`;
  const observed = useRef(text);
  function persist(value = local.current) {
    const previous = readPending(storageKey);
    const pending: PendingDraft = { token: crypto.randomUUID(), draft: value.normalize('NFC'), base: base.current || previous?.base || null, conflict: conflict.current };
    storePending(storageKey, pending); return pending;
  }

  function scheduleSave() {
    clearTimeout(saveTimer.current);
    if (active.current && !conflict.current) saveTimer.current = setTimeout(() => { void save(); }, 650);
  }
  async function refresh() {
    if (!active.current) return;
    if (writing.current) { refreshAgain.current = true; return; }
    const version = ++request.current, life = generation.current;
    try {
      const result = await chatApi<{ preferences: DraftPreferences }>(path);
      if (!active.current || generation.current !== life || request.current !== version || writing.current) { refreshAgain.current = true; return; }
      const remote = result.preferences;
      if (!remote || typeof remote.draft !== 'string' || !Number.isSafeInteger(remote.version)) return;
      if (base.current && remote.version < base.current.version) return;
      const previous = base.current, current = local.current;
      const dirty = previous ? current !== previous.draft : current !== '' || current !== initialText.current;
      const remoteChanged = previous ? remote.draft !== previous.draft : remote.draft !== '';
      base.current = remote; setError('');
      if (current === remote.draft) { conflict.current = false; setRemoteConflict(null); const pending = readPending(storageKey); if (pending?.draft === current) removePending(storageKey, pending.token); return; }
      if (conflict.current || (dirty && remoteChanged)) {
        conflict.current = true; setRemoteConflict(remote.draft); clearTimeout(saveTimer.current); persist(); return;
      }
      if (!dirty) { local.current = remote.draft; apply.current(remote.draft); }
      else { persist(); scheduleSave(); } // A theme/archive version change must not lose unsaved typing.
    } catch (e) { if (active.current && generation.current === life) setError(chatError(e)); }
  }
  async function save() {
    if (!active.current || writing.current || conflict.current || !navigator.onLine) return;
    if (!base.current) { await refresh(); return; }
    const value = local.current;
    if (value === base.current.draft) return;
    const life = generation.current, expectedVersion = base.current.version;
    const sent = persist(value);
    writing.current = true; ++request.current; setSyncing(true); setError('');
    let needsRefresh = false;
    try {
      const result = await patchDraft(path, userId, value, expectedVersion);
      if (result.preferences) acknowledgePending(storageKey, sent, result.preferences);
      if (!active.current || generation.current !== life) { void flushDetached(storageKey, path, userId); return; }
      if (result.preferences && typeof result.preferences.draft === 'string' && Number.isSafeInteger(result.preferences.version)) base.current = result.preferences;
      else needsRefresh = true;
    } catch (e) {
      if (!active.current || generation.current !== life) return;
      if ((e as { status?: number }).status === 409) needsRefresh = true;
      else setError(chatError(e));
    } finally {
      if (generation.current === life) {
        writing.current = false;
        if (active.current) {
          setSyncing(false);
          if (needsRefresh || refreshAgain.current) { refreshAgain.current = false; void refresh(); }
          else if (local.current !== value) scheduleSave();
        }
      }
    }
  }
  function requestRefresh() {
    clearTimeout(fetchTimer.current);
    fetchTimer.current = setTimeout(() => { void refresh(); }, 120);
  }
  useChatEvents(event => {
    if (event.type === 'ready' || (event.type === 'preferences' && event.conversationId === conversationId)) requestRefresh();
  });
  useEffect(() => {
    active.current = true; ++generation.current; const recovered = readPending(storageKey); base.current = recovered?.base || null; writing.current = false; conflict.current = !!recovered?.conflict;
    if (recovered) { local.current = recovered.draft; observed.current = recovered.draft; apply.current(recovered.draft); }
    refreshAgain.current = false; initialText.current = local.current; setRemoteConflict(null); setError(''); setSyncing(false);
    void refresh();
    const online = () => requestRefresh();
    window.addEventListener('online', online);
    return () => { const canFlush = !writing.current && !conflict.current; if (base.current && local.current !== base.current.draft) persist(); active.current = false; ++generation.current; ++request.current; clearTimeout(saveTimer.current); clearTimeout(fetchTimer.current); window.removeEventListener('online', online); if (canFlush) void flushDetached(storageKey, path, userId); };
  }, [conversationId, userId]);
  useLayoutEffect(() => {
    if (observed.current !== text) { observed.current = text; persist(text); }
  }, [text, conversationId, userId]);
  useEffect(() => {
    if (text === '' && base.current?.draft && !conflict.current) void save();
    else scheduleSave();
  }, [text, conversationId, userId]);

  function useRemote() {
    if (!base.current) return;
    clearTimeout(saveTimer.current); conflict.current = false; setRemoteConflict(null);
    const pending = readPending(storageKey); if (pending) removePending(storageKey, pending.token);
    local.current = base.current.draft; observed.current = base.current.draft; apply.current(base.current.draft); setError('');
  }
  function keepLocal() { conflict.current = false; setRemoteConflict(null); persist(); void save(); }
  return { remoteConflict, useRemote, keepLocal, error, syncing, retry: () => { void refresh(); } };
}
