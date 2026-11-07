// Loopback-only test host. Nothing in this file is included in the production build.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve('dist');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const revisions = new Map();
const isolatedScope = /^\/isolated\/[a-z0-9-]{1,100}\/$/;
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname === '/__test/update' && request.method === 'POST') {
    const requested = url.searchParams.get('scope');
    const scope = requested === 'other' ? '/other/' : requested && isolatedScope.test(requested) ? requested : '/panel/';
    revisions.set(scope, (revisions.get(scope) ?? 0) + 1); response.writeHead(204).end(); return;
  }
  // Two repositories on one origin exercise scope isolation and relative assets.
  const uniqueBase = url.pathname.match(/^\/isolated\/[a-z0-9-]{1,100}\//)?.[0];
  const base = uniqueBase ?? ['/panel/', '/other/'].find(prefix => url.pathname.startsWith(prefix));
  if (!base) { response.writeHead(404).end(); return; }
  const file = resolve(root, decodeURIComponent(url.pathname.slice(base.length) || 'index.html'));
  if (file !== root && !file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  try {
    let data = await readFile(file);
    if (file.endsWith(`${sep}sw.js`)) {
      // Real builds change the cache identity along with shell content. Updating
      // only a trailing comment leaves both workers writing the same cache and
      // does not model a release. Keep each synthetic revision separate too.
      const worker = data.toString();
      if (!worker.includes('const CACHE = PREFIX + ')) throw new Error('Unexpected test worker');
      data = Buffer.from(worker.replace('const CACHE = PREFIX + ', `const CACHE = PREFIX + "test-${revisions.get(base) ?? 0}:" + `));
    }
    // Even if browser routing regresses, the test document/worker cannot connect to upstream.
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Security-Policy': "connect-src 'self'" });
    response.end(data);
  } catch { response.writeHead(404).end(); }
});
server.listen(4174, '127.0.0.1');
