// Focused cache regressions. Uses real query-store code with mocked browser IO.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const ts = require("typescript");
const source = fs.readFileSync(new URL("../apps/web/lib/query-store.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function runtime() {
  const disk = new Map(), calls = [], events = [], timers = new Set();
  const navigator = { onLine: true };
  const exports = {};
  vm.runInNewContext(javascript, {
    exports, Date, Object, Map, Set, Event, navigator,
    window: { dispatchEvent: (event) => events.push(event.type) },
    setTimeout: (fn) => { timers.add(fn); return fn; }, clearTimeout: (fn) => timers.delete(fn),
    require: (name) => {
      if (name === "react") return {
        useCallback: (fn) => fn, useEffect: (fn) => fn(),
        useSyncExternalStore: (subscribe, get) => { subscribe(() => {}); return get(); },
      };
      if (name === "./transport") return { ApiError, api: (path) => { const request = deferred(); calls.push({ path, ...request }); return request.promise; } };
      if (name === "./offline") return {
        readOffline: async (key) => disk.get(key) ?? null,
        writeOffline: async (key, value) => { disk.set(key, value); },
        deleteOffline: async (key) => { disk.delete(key); },
      };
      throw new Error(name);
    },
  });
  return { store: exports, disk, calls, events, timers, navigator };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

{
  const { store, calls } = runtime();
  store.seedQuery("/fields", ["initial"]);
  store.useQuery("/fields"); // Mount an active subscriber.
  const first = store.refreshQuery("/fields", true);
  store.invalidateQueries("/fields"); // A delta arrives while the older GET is in flight.
  assert.equal(calls.length, 1);
  calls[0].resolve(["before-delta"]);
  await first;
  assert.equal(calls.length, 2, "in-flight invalidation must cause one follow-up GET");
  calls[1].resolve(["after-delta"]);
  await tick();
  assert.deepEqual(store.getQuery("/fields"), ["after-delta"]);
}
{
  const { store, disk, calls, navigator } = runtime();
  store.seedQuery("/fields/revoked", { private: true });
  const request = store.refreshQuery("/fields/revoked", true);
  calls[0].reject(new ApiError("Нет доступа", 403));
  await request;
  assert.equal(store.getQuery("/fields/revoked"), null);
  assert.equal(disk.has("query:/fields/revoked"), false, "revoked records must leave disk too");
  navigator.onLine = false;
  await store.refreshQuery("/fields/revoked", true);
  assert.equal(store.getQuery("/fields/revoked"), null);
}
{
  const { store, calls, events } = runtime();
  store.seedQuery("/fields", ["private"]);
  const request = store.refreshQuery("/fields", true);
  calls[0].reject(new ApiError("Войдите в аккаунт", 401));
  await request;
  assert.equal(store.getQuery("/fields"), null);
  assert.deepEqual(events, ["egin:unauthorized"]);
}
{
  const { store, disk } = runtime();
  store.seedQuery("/location?details=true", { weather: { current: { temperature: 10 }, cache_policy: { persist: false, expires_at: new Date(Date.now() + 60_000).toISOString() } } });
  assert.equal(disk.has("query:/location?details=true"), false, "nested Google data must not be stored");
  store.seedQuery("/weather", { cache_policy: { persist: false, expires_at: new Date(Date.now() - 1).toISOString() } });
  assert.equal(store.getQuery("/weather"), null, "expired restricted data must not be rendered");
  store.seedQuery("/integrations/google", { configured: true });
  store.seedQuery("/auth/me", { id: "private" });
  assert.equal(disk.has("query:/integrations/google"), false);
  assert.equal(disk.has("query:/auth/me"), false);
}
{
  const { store, calls } = runtime();
  const request = store.refreshQuery("/fields", true);
  await tick();
  store.clearQueries();
  calls[0].resolve(["old-account"]);
  await request;
  assert.equal(store.getQuery("/fields"), null, "late old-session response must not repopulate memory");
}
console.log("PASS: 5 query-cache regressions (mocked network/IndexedDB, real cache implementation)");
