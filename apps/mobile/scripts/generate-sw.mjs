import { readdir, readFile, writeFile } from 'node:fs/promises';
import { runSync } from '../src/entities/workspace/sync-engine.js';
import { createHash } from 'node:crypto';
const root = new URL('../dist/', import.meta.url);
async function walk(path = '') {
  const entries = await readdir(new URL(path, root), { withFileTypes: true });
  const nested = await Promise.all(entries.map(e => e.isDirectory() ? walk(path + e.name + '/') : path + e.name));
  return nested.flat().filter(p => p !== 'sw.js' && !p.startsWith('.well-known/'));
}
const files = (await walk()).sort();
const hash = createHash('sha256');
for (const file of files) hash.update(await readFile(new URL(file, root)));
const version = hash.digest('hex').slice(0, 12);
const assets = files.map(f => '/' + f);
await writeFile(new URL('sw.js', root), `
const CACHE = 'egin-mobile-${version}';
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('egin-mobile-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
const runSync = ${runSync.toString()};
self.addEventListener('sync', event => {
  if (event.tag === 'egin-sync') event.waitUntil(runSync(true).then(async result => {
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(client => client.postMessage({ type: 'egin-sync', result }));
    if (result.state === 'error') throw new Error('Retry sync');
  }));
});
self.addEventListener('push', event => {
  let data = {}; try { data = event.data?.json() || {}; } catch {}
  event.waitUntil(self.registration.showNotification(typeof data.title === 'string' ? data.title.slice(0, 100) : 'EGIN', { body: typeof data.body === 'string' ? data.body.slice(0, 400) : 'Откройте приложение', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: 'egin-update' }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    const existing = clients.find(c => new URL(c.url).origin === self.location.origin);
    if (existing) { await existing.navigate('/#/journal'); return existing.focus(); }
    return self.clients.openWindow('/#/journal');
  }));
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
  } else if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(request)) || fetch(request)));
  }
});
`);
console.log('Offline shell:', version, assets.length, 'assets');
