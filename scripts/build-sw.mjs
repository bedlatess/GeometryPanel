import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

async function list(folder, prefix = '') {
  const files = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await list(join(folder, entry.name), relative + '/'));
    else if (entry.name !== 'sw.js') files.push(relative);
  }
  return files;
}
const files = (await list('dist')).sort();
const hash = createHash('sha256');
for (const file of files) hash.update(await readFile(join('dist', file)));
const cache = `zeeho-shell-${hash.digest('hex').slice(0, 12)}`;
await writeFile('dist/sw.js', `
const PREFIX = 'zeeho-shell:' + self.registration.scope + ':';
const CACHE = PREFIX + ${JSON.stringify(cache)};
const FILES = ${JSON.stringify(files)}.map(path => new URL(path, self.registration.scope).href);
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(url => new Request(url, { cache: 'reload' }))))));
self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('message', event => {
  if (!['CACHE_STATUS', 'CLEAR_UNUSED_CACHES'].includes(event.data?.type) || !event.ports[0]) return;
  event.waitUntil((async () => {
    try {
      let removed = 0;
      if (event.data.type === 'CLEAR_UNUSED_CACHES') {
        if (self.registration.installing || self.registration.waiting) { event.ports[0].postMessage({ busy: true }); return; }
        const names = (await caches.keys()).filter(key => key.startsWith(PREFIX) && key !== CACHE);
        for (const name of names) { if (self.registration.installing || self.registration.waiting) break; if (await caches.delete(name)) removed++; }
      }
      const cache = await caches.open(CACHE), requests = await cache.keys();
      event.ports[0].postMessage({ ready: FILES.every(url => requests.some(request => request.url === url)), files: requests.length, removed });
    } catch { event.ports[0].postMessage({ failed: true }); }
  })());
});
self.addEventListener('activate', event => event.waitUntil((async () => {
  await Promise.all((await caches.keys()).filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const target = event.request.mode === 'navigate' && url.href.startsWith(self.registration.scope)
    ? new URL('index.html', self.registration.scope).href : event.request.url;
  if (!FILES.includes(target)) return;
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(target)) || fetch(event.request)));
});
`);
console.log(`PWA shell: ${files.length} local files; account and vehicle API responses are never cached.`);
