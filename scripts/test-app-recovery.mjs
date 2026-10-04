// Real app-store, mocked browser transport/storage: recovery and watermark races.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const ts = require("typescript");
const code = ts.transpileModule(fs.readFileSync(new URL("../apps/web/lib/app-store.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function snapshot(version, fieldName = "Original", user = "A") {
  return { user: { id: user }, fields: [{ id: "field", name: fieldName }], farms: [], tasks: [], conversations: [], analyses: [], market: [], notifications: [], assistant_jobs: [],
    weather: null, selected_field_id: "field", event_cursor: String(version), snapshot_version: String(version), server_timestamp: "2026-10-04T00:00:00Z", feature_flags: {} };
}
function runtime(saved = null) {
  const apiCalls = [], sources = [], seeds = new Map(), disk = new Map(), timers = new Set(), handlers = new Map();
  let owner = saved?.user.id ?? null, revalidations = 0, clears = 0;
  if (saved) disk.set("bootstrap", saved);
  const local = new Map(owner ? [["egin-offline-account", owner]] : []);
  class Source {
    constructor(url) { this.url = url; this.closed = false; sources.push(this); }
    close() { this.closed = true; }
    open() { this.onopen?.(); }
    message(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
  }
  const exports = {};
  vm.runInNewContext(code, {
    exports, Map, Set, Date, BigInt, Error, JSON, Event, AbortSignal, encodeURIComponent,
    EventSource: Source, navigator: { onLine: true },
    localStorage: { getItem: key => local.get(key) ?? null, setItem: (key, value) => local.set(key, value), removeItem: key => local.delete(key) },
    window: { addEventListener: (name, fn) => handlers.set(name, fn), dispatchEvent: event => handlers.get(event.type)?.(event) },
    performance: { now: () => 10, mark: () => {}, getEntriesByName: () => [], clearMarks: () => {} }, requestAnimationFrame: fn => fn(),
    setTimeout: fn => { timers.add(fn); return fn; }, clearTimeout: fn => timers.delete(fn),
    require: name => {
      if (name === "react") return { useSyncExternalStore: (_subscribe, get) => get(), useEffect: fn => fn(), useRef: value => ({ current: value }) };
      if (name === "./transport") return { ApiError, api: (path, options) => { const pending = deferred(); apiCalls.push({ path, options, ...pending }); return pending.promise; } };
      if (name === "./offline") return {
        offlineAccount: () => owner, setOfflineAccount: id => { owner = id; local.set("egin-offline-account", id); },
        restoreOfflineAccount: () => owner = local.get("egin-offline-account") ?? null,
        readOffline: async key => disk.get(key) ?? null, writeOffline: async (key, value) => disk.set(key, value),
        updateOffline: async (key, change) => { const next = change(disk.get(key) ?? null); disk.set(key, next); return next; },
        clearOffline: async () => { owner = null; disk.clear(); local.delete("egin-offline-account"); },
      };
      if (name === "./query-store") return { seedQuery: (path, data) => seeds.set(path, data), invalidateQueries: () => {}, revalidateActiveQueries: () => revalidations++, clearQueries: () => { seeds.clear(); clears++; } };
      throw new Error(name);
    },
  });
  return { store: exports, apiCalls, sources, seeds, disk, timers, get revalidations() { return revalidations; }, get clears() { return clears; } };
}
{
  const run = runtime(snapshot(10));
  run.disk.set("pending-notes", [{ id: "note-client-id", fieldId: "field", body: "Offline observation" }]);
  const loading = run.store.loadBootstrap();
  await tick();
  assert.equal(run.store.useAppState().snapshot.user.id, "A", "cache renders before network validation");
  run.apiCalls[0].reject(new TypeError("Failed to fetch")); // Browser still claims navigator.onLine=true.
  await loading;
  assert.equal(run.sources.length, 1, "SSE retry must exist even when bootstrap failed");
  assert.match(run.sources[0].url, /after=10$/);
  assert.equal(run.store.useAppState().connection, "offline");
  run.sources[0].open(); // Transport recovers without an online browser event.
  await tick();
  assert.equal(run.store.useAppState().connection, "live");
  assert.equal(run.revalidations, 1);
  assert.equal(run.apiCalls[1].path, "/fields/field/notes");
  assert.equal(JSON.parse(run.apiCalls[1].options.body).client_id, "note-client-id");
  run.apiCalls[1].resolve({ id: "server-note" });
  await tick();
  assert.equal(run.disk.get("pending-notes").length, 0);
}
{
  const run = runtime();
  const initial = run.store.loadBootstrap(); await tick();
  run.apiCalls[0].resolve(snapshot(10)); await initial;
  const refresh = run.store.loadBootstrap(false); await tick();
  run.sources[0].message({ id: "11", version: "11", type: "field.updated", entityId: "field", timestamp: "now", payload: { name: "After delta" } });
  run.apiCalls[1].resolve(snapshot(10, "Stale response")); await refresh;
  assert.equal(run.store.useAppState().snapshot.fields[0].name, "After delta", "older in-flight bootstrap must not erase newer delta");
  assert.equal(run.sources.length, 1, "background refresh must not open a second SSE");
  assert.equal(run.disk.get("bootstrap").event_cursor, "10", "disk watermark stays with its matching snapshot");
  assert.equal(run.timers.size, 1, "one follow-up snapshot reconciles discarded stale response");
  const callback = [...run.timers][0]; run.timers.clear(); callback(); await tick();
  run.apiCalls[2].resolve(snapshot(11, "After delta")); await tick();
  assert.equal(run.disk.get("bootstrap").event_cursor, "11");
  assert.equal(run.disk.get("bootstrap").fields[0].name, "After delta");
}
{
  const run = runtime();
  const initial = run.store.loadBootstrap(); await tick(); run.apiCalls[0].resolve(snapshot(10)); await initial;
  const oldSource = run.sources[0];
  const changed = run.store.loadBootstrap(false); await tick(); run.apiCalls[1].resolve(snapshot(11, "B field", "B")); await changed;
  assert.equal(oldSource.closed, true);
  oldSource.message({ id: "99", version: "99", type: "field.updated", entityId: "field", timestamp: "now", payload: { name: "Private account A" } });
  assert.equal(run.store.useAppState().snapshot.user.id, "B");
  assert.equal(run.store.useAppState().snapshot.fields[0].name, "B field", "late old-account SSE frames must be ignored");
  assert.equal(run.sources.length, 2);
  assert.equal(run.clears, 1);
}
{
  const run = runtime();
  const initial = run.store.loadBootstrap(); await tick();
  run.apiCalls[0].resolve(snapshot(10)); await initial;
  run.store.rememberAssistantJob({ id: "job", question: "Weather?", answer: "Before ", status: "running" });
  const refresh = run.store.loadBootstrap(false); await tick();
  run.apiCalls[1].resolve(snapshot(20, "Newest snapshot")); await refresh;
  run.sources[0].message({ id: "11", version: "11", type: "field.updated", entityId: "field", timestamp: "now", payload: { name: "Old queued event" } });
  assert.equal(run.store.useAppState().snapshot.fields[0].name, "Newest snapshot", "queued older delta must not overwrite a newer snapshot");
  run.sources[0].message({ id: "12", version: "12", type: "assistant.token", entityId: "job", timestamp: "now", payload: { job_id: "job", text: "after" } });
  assert.equal(run.store.useAppState().snapshot.assistant_jobs[0].answer, "Before after", "snapshot guard must not skip queued AI tokens");
}
{
  const run = runtime();
  const initial = run.store.loadBootstrap(); await tick();
  run.apiCalls[0].resolve(snapshot(10)); await initial;
  const oldRefresh = run.store.loadBootstrap(false); await tick();
  let completed = false;
  const onboarding = run.store.refreshOnboarding().then(() => { completed = true; });
  run.apiCalls[1].resolve(snapshot(10)); await oldRefresh; await tick();
  assert.equal(completed, false, "onboarding must not navigate using a pre-mutation bootstrap");
  assert.equal(run.apiCalls.length, 3, "a new bootstrap must follow the pending pre-mutation request");
  const confirmed = snapshot(11); confirmed.user.onboarded = true;
  run.apiCalls[2].resolve(confirmed); await onboarding;
  assert.equal(run.store.useAppState().snapshot.user.onboarded, true);
  assert.equal(completed, true, "navigation may continue only with the committed profile");
}
{
  const run = runtime();
  const initial = run.store.loadBootstrap(); await tick();
  run.apiCalls[0].resolve(snapshot(10)); await initial;
  const retry = assert.rejects(run.store.refreshOnboarding(), /Хозяйство сохранено/);
  await tick(); run.apiCalls[1].reject(new TypeError("Failed to fetch"));
  await retry;
  assert.notEqual(run.store.useAppState().snapshot.user.onboarded, true, "failed profile refresh must block navigation");
}
console.log("PASS: 6 app recovery/watermark/session/onboarding regressions (real store, mocked transport and storage)");
