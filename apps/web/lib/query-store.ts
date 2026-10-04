"use client";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api, ApiError } from "./transport";
import { deleteOffline, readOffline, writeOffline } from "./offline";
type Entry = { data: unknown; error: string; loading: boolean; updatedAt: number; expiresAt: number | null };
const EMPTY: Entry = { data: null, error: "", loading: false, updatedAt: 0, expiresAt: null };
const cache = new Map<string, Entry>(), listeners = new Map<string, Set<() => void>>();
const requests = new Map<string, Promise<void>>();
const dirty = new Set<string>(), expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
let generation = 0;
function emit(path: string) { listeners.get(path)?.forEach(fn => fn()); }
function retention(value: unknown): { persist: boolean; expiresAt: number | null } {
  let persist = true, expiresAt: number | null = null;
  const visit = (item: unknown) => {
    if (!item || typeof item !== "object") return;
    const record = item as Record<string, unknown>;
    const policy = record.cache_policy as { persist?: boolean; expires_at?: string; max_age_seconds?: number } | undefined;
    if (policy?.persist === false || record.offline_cache_allowed === false) {
      persist = false;
      const parsed = policy?.expires_at ? Date.parse(policy.expires_at) : NaN;
      const deadline = Number.isFinite(parsed) ? parsed : Date.now() + Math.min(policy?.max_age_seconds ?? 900, 3600) * 1000;
      expiresAt = expiresAt == null ? deadline : Math.min(expiresAt, deadline);
    }
    for (const child of Object.values(record)) visit(child);
  };
  visit(value);
  return { persist, expiresAt };
}
function expired(entry: Entry | undefined) { return entry?.expiresAt != null && entry.expiresAt <= Date.now(); }
function ephemeralPath(path: string) { return path.startsWith("/auth/") || path.startsWith("/integrations/") || path === "/assistant/provider"; }
function expireQuery(path: string) {
  const entry = cache.get(path);
  if (!expired(entry)) return;
  cache.set(path, { ...EMPTY, error: "Срок хранения этого прогноза истёк. Подключитесь к сети для обновления." });
  void deleteOffline("query:" + path); emit(path);
}
export function getQuery<T>(path: string): T | null {
  const entry = cache.get(path);
  return expired(entry) ? null : entry?.data as T ?? null;
}
export function seedQuery(path: string, data: unknown, persist = true) {
  const policy = retention(data);
  const previousTimer = expiryTimers.get(path);
  if (previousTimer) clearTimeout(previousTimer);
  expiryTimers.delete(path);
  if (policy.expiresAt != null && policy.expiresAt <= Date.now()) {
    cache.set(path, { ...EMPTY, updatedAt: Date.now(), error: "Источник вернул устаревший прогноз. Повторите позже." });
    void deleteOffline("query:" + path); emit(path); return;
  }
  cache.set(path, { data, error: "", loading: false, updatedAt: Date.now(), expiresAt: policy.expiresAt }); emit(path);
  // Inspect nested responses too: /location?details embeds a weather snapshot.
  if (persist && policy.persist && !ephemeralPath(path)) void writeOffline("query:" + path, data);
  else void deleteOffline("query:" + path);
  if (policy.expiresAt != null) {
    const deadline = policy.expiresAt;
    expiryTimers.set(path, setTimeout(() => {
      expiryTimers.delete(path);
      if (cache.get(path)?.expiresAt !== deadline) return;
      expireQuery(path);
      if (listeners.get(path)?.size && navigator.onLine) void refreshQuery(path, true);
    }, Math.min(Math.max(1, deadline - Date.now()), 2_147_483_647)));
  }
}
export function clearQueries() {
  generation++; cache.clear(); requests.clear(); dirty.clear();
  expiryTimers.forEach(timer => clearTimeout(timer)); expiryTimers.clear();
  listeners.forEach(set => set.forEach(fn => fn()));
}
export async function refreshQuery(path: string, force = false) {
  if (requests.has(path)) {
    if (force) dirty.add(path);
    return requests.get(path);
  }
  expireQuery(path);
  const old = cache.get(path);
  if (!force && old?.data != null && Date.now() - old.updatedAt < 60_000) return;
  const epoch = generation;
  const promise = (async () => {
    if (!old?.data) {
      const disk = await readOffline<unknown>("query:" + path);
      if (epoch !== generation) return;
      if (disk != null) {
        const policy = retention(disk);
        if (!policy.persist || ephemeralPath(path)) void deleteOffline("query:" + path);
        else cache.set(path, { data: disk, error: "", loading: false, updatedAt: 0, expiresAt: null });
      }
    }
    const current = cache.get(path) || EMPTY;
    cache.set(path, { ...current, loading: typeof navigator === "undefined" || navigator.onLine, error: "" }); emit(path);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      if (current.data == null) { cache.set(path, { ...EMPTY, error: "Нет сети. Эти данные ещё не сохранены на устройстве." }); emit(path); }
      return;
    }
    try {
      const data = await api(path);
      if (epoch === generation) seedQuery(path, data);
    } catch (error) {
      if (epoch !== generation) return;
      const previous = cache.get(path) || EMPTY;
      // Authorization failures must not leave an old private response visible.
      const denied = error instanceof ApiError && [401, 403, 404].includes(error.status);
      if (denied) await deleteOffline("query:" + path);
      if (epoch !== generation) return;
      if (error instanceof ApiError && error.status === 401) {
        // The app owns session reset/redirect; do not retain any old-account data.
        clearQueries();
        window.dispatchEvent(new Event("egin:unauthorized"));
        return;
      }
      const connectionLost = !(error instanceof ApiError) || error.status >= 500;
      if (connectionLost) window.dispatchEvent(new Event("egin:connection-lost"));
      cache.set(path, { ...previous, data: denied ? null : previous.data, loading: false, error: connectionLost && previous.data != null ? "" : (error as Error).message }); emit(path);
    }
  })();
  requests.set(path, promise);
  try { await promise; } finally {
    if (epoch === generation) {
      requests.delete(path);
      if (dirty.delete(path)) {
        const entry = cache.get(path);
        if (entry) cache.set(path, { ...entry, updatedAt: 0 });
        if (listeners.get(path)?.size) void refreshQuery(path, true);
      }
    }
  }
}
export function invalidateQueries(prefix: string) {
  for (const [path, value] of cache) if (path.startsWith(prefix)) {
    cache.set(path, { ...value, updatedAt: 0 });
    if (requests.has(path)) dirty.add(path);
    if (listeners.get(path)?.size) void refreshQuery(path, true);
  }
}
export function revalidateActiveQueries() {
  for (const [path, set] of listeners) if (set.size) void refreshQuery(path, true);
}
export function useQuery<T>(path: string | null) {
  const subscribe = useCallback((fn: () => void) => {
    if (!path) return () => {};
    const set = listeners.get(path) || new Set(); set.add(fn); listeners.set(path, set);
    return () => { set.delete(fn); };
  }, [path]);
  const snapshot = useCallback(() => path ? cache.get(path) || EMPTY : EMPTY, [path]);
  const entry = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  useEffect(() => { if (path) void refreshQuery(path); }, [path]);
  const reload = useCallback(() => { if (path) void refreshQuery(path, true); }, [path]);
  const setData = useCallback((value: T | null | ((old: T | null) => T | null)) => {
    if (path) seedQuery(path, typeof value === "function" ? (value as (old: T | null) => T | null)(getQuery<T>(path)) : value);
  }, [path]);
  return { data: entry.data as T | null, error: entry.error, loading: entry.loading || (!!path && entry === EMPTY), reload, setData };
}
