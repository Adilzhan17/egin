"use client";

// Private API data never enters the service-worker HTTP cache. IndexedDB entries
// are partitioned by the authenticated account and purged at logout/account switch.
const DB = "egin-offline-v1";
let account: string | null = null;
let database: Promise<IDBDatabase | null> | null = null;
function open() {
  if (!database) database = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("entries");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  return database;
}
export function offlineAccount() { return account; }
export function setOfflineAccount(id: string) {
  account = id;
  try { localStorage.setItem("egin-offline-account", id); } catch { /* private mode */ }
}
export function restoreOfflineAccount() {
  try { account = localStorage.getItem("egin-offline-account"); } catch { account = null; }
  return account;
}
export async function readOffline<T>(key: string): Promise<T | null> {
  const owner = account, db = await open();
  if (!owner || !db) return null;
  return new Promise((resolve) => {
    const request = db.transaction("entries").objectStore("entries").get(owner + ":" + key);
    request.onsuccess = () => resolve(account === owner ? request.result?.value ?? null : null);
    request.onerror = () => resolve(null);
  });
}
export async function writeOffline(key: string, value: unknown) {
  const owner = account, db = await open();
  if (!owner || !db || owner !== account) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction("entries", "readwrite");
    tx.objectStore("entries").put({ value, savedAt: Date.now() }, owner + ":" + key);
    tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); tx.onabort = () => resolve();
  });
}
export async function deleteOffline(key: string) {
  const owner = account, db = await open();
  if (!owner || !db || owner !== account) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction("entries", "readwrite");
    tx.objectStore("entries").delete(owner + ":" + key);
    tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); tx.onabort = () => resolve();
  });
}
// Read/modify/write in one IndexedDB transaction. Separate reads and writes can
// lose a newly queued note while another tab removes a just-synchronized note.
export async function updateOffline<T>(key: string, change: (old: T | null) => T): Promise<T | null> {
  const owner = account, db = await open();
  if (!owner || !db || owner !== account) return null;
  return new Promise((resolve) => {
    const tx = db.transaction("entries", "readwrite");
    const entries = tx.objectStore("entries");
    const request = entries.get(owner + ":" + key);
    let value: T | null = null;
    request.onsuccess = () => {
      if (owner !== account) { tx.abort(); return; }
      value = change(request.result?.value ?? null);
      entries.put({ value, savedAt: Date.now() }, owner + ":" + key);
    };
    tx.oncomplete = () => resolve(owner === account ? value : null);
    tx.onerror = () => resolve(null); tx.onabort = () => resolve(null);
  });
}
export async function clearOffline() {
  account = null;
  try { localStorage.removeItem("egin-offline-account"); localStorage.removeItem("egin-current-field"); } catch { /* storage unavailable */ }
  const db = await open();
  if (db) await new Promise<void>((resolve) => {
    const tx = db.transaction("entries", "readwrite"); tx.objectStore("entries").clear();
    tx.oncomplete = () => resolve(); tx.onerror = () => resolve();
  });
}
