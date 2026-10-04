"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import type {
  Analysis,
  Conversation,
  Farm,
  Field,
  Listing,
  User,
  Weather,
} from "./types";
import { api, ApiError } from "./transport";
import {
  clearOffline,
  offlineAccount,
  readOffline,
  restoreOfflineAccount,
  setOfflineAccount,
  updateOffline,
  writeOffline,
} from "./offline";
import {
  clearQueries,
  invalidateQueries,
  revalidateActiveQueries,
  seedQuery,
} from "./query-store";

export type FieldSummary = Omit<
  Field,
  "geometry" | "boundary_version" | "created_at"
> & { geometry?: Field["geometry"]; preview_geometry?: Field["geometry"] | null };
export type AssistantJob = {
  id: string;
  question: string;
  field_id?: string;
  status: string;
  answer?: string;
  model?: string;
  provider?: string;
  error?: string;
  tools?: unknown[];
  message?: string;
};
export type Bootstrap = {
  user: User;
  farms: Farm[];
  fields: FieldSummary[];
  selected_field_id: string | null;
  weather:
    | (Weather & {
        field_id: string;
        stale?: boolean;
        offline_cache_allowed?: boolean;
        cache_policy?: { persist?: boolean };
      })
    | null;
  analyses: {
    id: string;
    field_id: string;
    created_at: string;
    recommendation: Analysis["recommendation"];
    risk: Analysis["risk"];
  }[];
  conversations: Conversation[];
  market: Partial<Listing>[];
  tasks: {
    id: string;
    field_id?: string;
    title: string;
    due_date: string;
    completed_at: string | null;
    field_name?: string;
  }[];
  notifications: unknown[];
  unread_count: number;
  feature_flags: Record<string, boolean>;
  assistant_jobs?: AssistantJob[];
  server_timestamp: string;
  snapshot_version: string;
  event_cursor: string;
};
export type RealtimeEvent = {
  id: string;
  type: string;
  timestamp: string;
  entityId: string;
  version: string;
  payload: Record<string, unknown>;
};
type State = {
  snapshot: Bootstrap | null;
  error: string;
  loading: boolean;
  connection: "connecting" | "live" | "offline" | "reconnecting";
  receivedAt: number | null;
};
const INITIAL: State = {
  snapshot: null,
  error: "",
  loading: true,
  connection: "connecting",
  receivedAt: null,
};
let state: State = INITIAL,
  stream: EventSource | null = null,
  loading: Promise<void> | null = null;
let cursor = "0",
  epoch = 0,
  onlineBound = false,
  refreshTimer: ReturnType<typeof setTimeout> | null = null;
const subscribers = new Set<() => void>(),
  eventSubscribers = new Set<(e: RealtimeEvent) => void>();
const versions = new Map<string, bigint>();
const entities = {
  fields: new Map<string, FieldSummary>(),
  farms: new Map<string, Farm>(),
  conversations: new Map<string, Conversation>(),
};
function publish(patch: Partial<State>) {
  state = { ...state, ...patch };
  subscribers.forEach((fn) => fn());
}
function subscribe(fn: () => void) {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}
export function useAppState() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => INITIAL,
  );
}
export function selectField(id: string) {
  if (!state.snapshot || !state.snapshot.fields.some(field => field.id === id)) return;
  localStorage.setItem("egin-current-field", id);
  if (state.snapshot.selected_field_id !== id) publish({ snapshot: { ...state.snapshot, selected_field_id: id } });
}
export function useRealtimeStatus() {
  return useAppState().connection;
}
export function rememberAssistantJob(job: AssistantJob) {
  if (!state.snapshot) return;
  const jobs = state.snapshot.assistant_jobs || [];
  const previous = jobs.find((item) => item.id === job.id);
  publish({
    snapshot: {
      ...state.snapshot,
      assistant_jobs: [
        { ...previous, ...job },
        ...jobs.filter((item) => item.id !== job.id),
      ].slice(0, 10),
    },
  });
}
export function useEventSubscription(listener: (event: RealtimeEvent) => void) {
  const ref = useRef(listener);
  useEffect(() => {
    ref.current = listener;
  });
  useEffect(() => {
    const fn = (event: RealtimeEvent) => ref.current(event);
    eventSubscribers.add(fn);
    return () => {
      eventSubscribers.delete(fn);
    };
  }, []);
}
function seed(snapshot: Bootstrap) {
  seedQuery("/auth/me", snapshot.user, false);
  seedQuery("/farms", snapshot.farms);
  seedQuery("/conversations", snapshot.conversations);
  seedQuery("/tasks", snapshot.tasks);
  for (const field of snapshot.fields)
    seedQuery(
      "/tasks?field_id=" + field.id,
      snapshot.tasks.filter((t) => t.field_id === field.id),
    );
  if (snapshot.weather)
    seedQuery(
      "/fields/" + snapshot.weather.field_id + "/weather",
      snapshot.weather,
    );
  entities.fields.clear();
  snapshot.fields.forEach((f) => entities.fields.set(f.id, f));
  entities.farms.clear();
  snapshot.farms.forEach((f) => entities.farms.set(f.id, f));
  entities.conversations.clear();
  snapshot.conversations.forEach((c) => entities.conversations.set(c.id, c));
}
function scheduleSnapshotRefresh() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void loadBootstrap(false);
  }, 300);
}
function receive(event: RealtimeEvent) {
  let id: bigint;
  try {
    id = BigInt(event.id);
  } catch {
    return;
  }
  if (event.type === "resync.required") {
    stream?.close();
    stream = null;
    void loadBootstrap(true);
    return;
  }
  if (id <= BigInt(cursor)) return;
  cursor = event.id;
  const key = event.type + ":" + event.entityId;
  const version = BigInt(event.version || event.id);
  if (version <= (versions.get(key) ?? -1n)) return;
  versions.set(key, version);
  if (versions.size > 2000) versions.delete(versions.keys().next().value!);
  const receivedAt = performance.now();
  if (event.type.startsWith("assistant.") && state.snapshot) {
    const payload = event.payload;
    const jobId = String(payload.job_id || event.entityId);
    const job: AssistantJob = state.snapshot.assistant_jobs?.find(
      (item) => item.id === jobId,
    ) || {
      id: jobId,
      question: String(payload.question || ""),
      status: "running",
      answer: "",
      tools: [],
    };
    const next = { ...job };
    if (event.type === "assistant.started") {
      next.status = String(payload.status || "running");
      if (payload.question) next.question = String(payload.question);
      if (payload.field_id) next.field_id = String(payload.field_id);
    }
    if (payload.model) next.model = String(payload.model);
    if (payload.provider) next.provider = String(payload.provider);
    if (payload.message) next.message = String(payload.message);
    if (event.type === "assistant.token")
      next.answer = (next.answer || "") + String(payload.text || "");
    if (event.type === "assistant.tool")
      next.tools = [...(next.tools || []), payload];
    if (event.type === "assistant.completed") {
      next.status = String(payload.status || "completed");
      next.answer = String(payload.text ?? next.answer ?? "");
      if (Array.isArray(payload.tools)) next.tools = payload.tools;
      invalidateQueries("/assistant/history");
    }
    if (event.type === "assistant.error") {
      next.status = "failed";
      next.error = String(payload.message || "AI временно недоступен");
      invalidateQueries("/assistant/history");
    }
    rememberAssistantJob(next);
  }
  performance.mark("egin:event:received", {
    detail: {
      id: event.id,
      type: event.type,
      serverTimestamp: event.timestamp,
    },
  });
  eventSubscribers.forEach((fn) => fn(event));
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      performance.mark("egin:event:rendered", {
        detail: {
          id: event.id,
          receiveToPaintMs: performance.now() - receivedAt,
        },
      });
      // Bound diagnostics; PerformanceObserver can collect measurements for a test.
      if (performance.getEntriesByName("egin:event:received").length > 100) {
        performance.clearMarks("egin:event:received");
        performance.clearMarks("egin:event:rendered");
      }
    }),
  );
  const type = event.type;
  // A background snapshot can be ahead of this stream's delivery cursor. Keep
  // dispatching its queued events (especially AI tokens), but do not overwrite
  // entities already represented by that newer transactional snapshot.
  const includedInSnapshot = state.snapshot && id <= BigInt(state.snapshot.snapshot_version);
  if (type === "field.analysis.updated" || type === "ml.completed") {
    if (state.snapshot && event.payload.recommendation &&
      !(includedInSnapshot && state.snapshot.analyses.some(a => a.field_id === event.payload.field_id))) {
      const analysis = event.payload as Bootstrap["analyses"][number];
      publish({
        snapshot: {
          ...state.snapshot,
          analyses: [
            ...state.snapshot.analyses.filter(
              (a) => a.field_id !== analysis.field_id,
            ),
            analysis,
          ],
        },
      });
    }
    invalidateQueries("/fields/" + event.entityId + "/analysis");
  } else if (type.startsWith("field.")) {
    const old = entities.fields.get(event.entityId);
    if (type === "field.deleted" && !includedInSnapshot) entities.fields.delete(event.entityId);
    else if (old && !includedInSnapshot)
      entities.fields.set(event.entityId, { ...old, ...event.payload });
    if (state.snapshot)
      publish({
        snapshot: { ...state.snapshot, fields: [...entities.fields.values()] },
      });
    invalidateQueries("/fields");
    scheduleSnapshotRefresh();
  } else if (type === "weather.updated" || type === "soil.updated") {
    const fieldId = String(event.payload.field_id || event.entityId);
    if (event.payload.source && event.payload.status)
      seedQuery(
        "/fields/" +
          fieldId +
          (type === "weather.updated" ? "/weather" : "/soil"),
        event.payload,
      );
    else
      invalidateQueries(
        "/fields/" +
          fieldId +
          (type === "weather.updated" ? "/weather" : "/soil"),
      );
  } else if (type.startsWith("market.")) {
    invalidateQueries("/listings");
    scheduleSnapshotRefresh();
  } else if (type.startsWith("farm.")) {
    invalidateQueries("/farms");
    scheduleSnapshotRefresh();
  } else if (type.startsWith("task.")) {
    invalidateQueries("/tasks");
    scheduleSnapshotRefresh();
  } else if (type.startsWith("note."))
    invalidateQueries("/fields/" + event.payload.field_id + "/notes");
  else if (
    type === "conversation.updated" ||
    type === "message.created" ||
    type === "message.read" ||
    type === "message.deleted"
  )
    invalidateQueries("/conversations");
  else if (type.startsWith("notification."))
    invalidateQueries("/notifications");
  performance.mark("egin:event:processed", {
    detail: { id: event.id, processingMs: performance.now() - receivedAt },
  });
  if (performance.getEntriesByName("egin:event:processed").length > 100)
    performance.clearMarks("egin:event:processed");
}
function connect() {
  if (stream || !state.snapshot || !navigator.onLine) return;
  const recovering = state.connection === "offline" || state.connection === "reconnecting";
  if (!recovering) publish({ connection: "connecting" });
  const source = new EventSource("/api/events?after=" + encodeURIComponent(cursor));
  stream = source;
  source.onopen = () => {
    if (stream !== source) return;
    const restored = recovering || state.connection === "offline" || state.connection === "reconnecting";
    publish({ connection: "live" });
    if (restored) { revalidateActiveQueries(); void flushOfflineNotes(); }
  };
  source.onerror = () => {
    if (stream !== source) return;
    publish({ connection: state.connection === "offline" || !navigator.onLine ? "offline" : "reconnecting" });
  };
  source.onmessage = (message) => {
    if (stream !== source) return;
    try {
      receive(JSON.parse(message.data));
    } catch {
      /* a malformed frame cannot break reconnection */
    }
  };
}
export async function loadBootstrap(reconnect = true) {
  if (loading) return loading;
  const generation = epoch;
  const task = (async () => {
    try {
      if (localStorage.getItem("egin-pending-logout")) {
        if (navigator.onLine) {
          await api("/auth/logout", {
            method: "POST",
            signal: AbortSignal.timeout(5000),
          });
          localStorage.removeItem("egin-pending-logout");
        }
        throw new ApiError("Войдите в аккаунт", 401);
      }
      if (!state.snapshot) {
        restoreOfflineAccount();
        const saved = await readOffline<Bootstrap>("bootstrap");
        if (generation !== epoch) return;
        if (saved) {
          cursor = saved.event_cursor;
          seed(saved);
          publish({
            snapshot: saved,
            loading: false,
            connection: navigator.onLine ? "connecting" : "offline",
            error: "",
          });
        }
      }
      if (!navigator.onLine) {
        restoreOfflineAccount();
        const saved = await readOffline<Bootstrap>("bootstrap");
        if (generation !== epoch) return;
        if (saved) {
          cursor = saved.event_cursor;
          seed(saved);
          publish({
            snapshot: saved,
            loading: false,
            connection: "offline",
            error: "",
          });
        } else
          publish({
            loading: false,
            connection: "offline",
            error:
              "Нет сети. Войдите в аккаунт при подключении, чтобы сохранить рабочие данные.",
          });
        return;
      }
      const selected = localStorage.getItem("egin-current-field");
      let snapshot: Bootstrap;
      try {
        snapshot = await api<Bootstrap>(
          "/bootstrap" +
            (selected ? "?field_id=" + encodeURIComponent(selected) : ""),
        );
      } catch (e) {
        if (selected && e instanceof ApiError && e.status === 403) {
          localStorage.removeItem("egin-current-field");
          snapshot = await api<Bootstrap>("/bootstrap");
        } else throw e;
      }
      if (generation !== epoch) return;
      if (offlineAccount() && offlineAccount() !== snapshot.user.id) {
        // Close the old account's authenticated channel before publishing the
        // new snapshot. Already queued callbacks are ignored by source identity.
        stream?.close();
        stream = null;
        versions.clear();
        clearQueries();
        await clearOffline();
      }
      if (!reconnect && stream && state.snapshot && BigInt(snapshot.event_cursor) < BigInt(cursor)) {
        // A newer delta arrived while this MVCC snapshot was in flight. Applying
        // the older snapshot would erase it without replay (cursor already moved).
        scheduleSnapshotRefresh();
        return;
      }
      setOfflineAccount(snapshot.user.id);
      if (!reconnect && stream && state.snapshot?.assistant_jobs)
        snapshot = {
          ...snapshot,
          assistant_jobs: state.snapshot.assistant_jobs,
        };
      seed(snapshot);
      publish({ snapshot, error: "", loading: false });
      const retained =
        snapshot.weather?.offline_cache_allowed === false ||
        snapshot.weather?.cache_policy?.persist === false
          ? { ...snapshot, weather: null }
          : snapshot;
      void writeOffline("bootstrap", retained);
      if (reconnect || !stream) {
        stream?.close();
        stream = null;
        cursor = snapshot.event_cursor;
        versions.clear();
        connect();
        eventSubscribers.forEach(fn => fn({ id: cursor, type: "snapshot.refreshed", timestamp: snapshot.server_timestamp, entityId: "bootstrap", version: cursor, payload: {} }));
      }
      void flushOfflineNotes();
    } catch (e) {
      if (generation !== epoch) return;
      if (e instanceof ApiError && e.status === 401) {
        await resetAppSession();
        publish({ error: "Войдите в аккаунт", loading: false });
      } else if (state.snapshot) {
        publish({ error: "", loading: false, connection: "offline" });
        // navigator.onLine can remain true behind a broken router or after a
        // service-worker navigation. EventSource's own retry restores this case.
        connect();
      }
      else publish({ error: (e as Error).message, loading: false });
    }
  })();
  loading = task;
  try {
    await task;
  } finally {
    if (generation === epoch) loading = null;
  }
}
// A mutation can finish while an older bootstrap is still in flight. Wait for
// that request, then fetch the committed profile before leaving onboarding.
export async function refreshOnboarding() {
  if (loading) await loading;
  await loadBootstrap();
  if (!state.snapshot?.user.onboarded)
    throw new Error("Хозяйство сохранено. Не удалось обновить профиль. Проверьте подключение и повторите переход.");
}
export function reconnectApp() {
  if (!state.snapshot) { void loadBootstrap(); return; }
  stream?.close(); stream = null;
  connect();
  revalidateActiveQueries();
  void flushOfflineNotes();
}
export function startApp() {
  if (!onlineBound) {
    onlineBound = true;
    window.addEventListener("offline", () => {
      stream?.close();
      stream = null;
      publish({ connection: "offline" });
    });
    window.addEventListener("online", () => {
      reconnectApp();
    });
    window.addEventListener("pagehide", () => {
      stream?.close();
      stream = null;
    });
    window.addEventListener("pageshow", () => {
      if (state.snapshot) connect();
    });
    window.addEventListener("egin:connection-lost", () => {
      publish({ connection: "offline" });
    });
    window.addEventListener("egin:unauthorized", () => {
      void resetAppSession().then(() =>
        publish({ error: "Войдите в аккаунт", loading: false }),
      );
    });
  }
  if (!state.snapshot) void loadBootstrap();
  else connect();
  if ("serviceWorker" in navigator)
    void navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        registration.active?.postMessage({
          type: "CACHE_ASSETS",
          urls: performance
            .getEntriesByType("resource")
            .map((entry) => entry.name),
        });
      })
      .catch(() => {});
}
export async function resetAppSession() {
  epoch++;
  loading = null;
  stream?.close();
  stream = null;
  cursor = "0";
  versions.clear();
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  clearQueries();
  Object.values(entities).forEach((map) => map.clear());
  state = INITIAL;
  subscribers.forEach((fn) => fn());
  await clearOffline();
}
type PendingNote = {
  id: string;
  fieldId: string;
  body: string;
  createdAt: string;
  error?: string;
};
export async function queueOfflineNote(fieldId: string, body: string) {
  const note = {
    id: crypto.randomUUID(),
    fieldId,
    body,
    createdAt: new Date().toISOString(),
  };
  const saved = await updateOffline<PendingNote[]>("pending-notes", notes => [...(notes || []), note]);
  if (!saved) throw new Error("Не удалось сохранить заметку на устройстве. Проверьте доступное место и повторите.");
  return note;
}
let flushing = false;
export async function flushOfflineNotes() {
  if (flushing || !navigator.onLine || !offlineAccount()) return;
  flushing = true;
  const owner = offlineAccount();
  try {
    const pending = (await readOffline<PendingNote[]>("pending-notes")) || [];
    for (const note of pending) {
      if (owner !== offlineAccount()) break;
      try {
        await api("/fields/" + note.fieldId + "/notes", {
          method: "POST",
          body: JSON.stringify({ body: note.body, client_id: note.id }),
        });
        await updateOffline<PendingNote[]>(
          "pending-notes",
          latest => (latest || []).filter((n) => n.id !== note.id),
        );
        invalidateQueries("/fields/" + note.fieldId + "/notes");
        window.dispatchEvent(new Event("egin:notes-synced"));
      } catch {
        break;
      } // Keep retryable drafts and permission failures visible; never discard observations.
    }
  } finally {
    flushing = false;
  }
}
