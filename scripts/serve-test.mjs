// Loopback-only test host. Nothing in this file is included in the production build.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve('dist');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
let revision = 0;
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname === '/__test/update' && request.method === 'POST') {
    revision++; response.writeHead(204).end(); return;
  }
  // Two repositories on one origin exercise scope isolation and relative assets.
  const base = ['/panel/', '/other/'].find(prefix => url.pathname.startsWith(prefix));
  if (!base) { response.writeHead(404).end(); return; }
  const file = resolve(root, decodeURIComponent(url.pathname.slice(base.length) || 'index.html'));
  if (file !== root && !file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  try {
    let data = await readFile(file);
    if (file.endsWith(`${sep}sw.js`)) data = Buffer.concat([data, Buffer.from(`\n// test revision ${revision}\n`)]);
    // Even if browser routing regresses, the test document/worker cannot connect to upstream.
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Security-Policy': "connect-src 'self'" });
    response.end(data);
  } catch { response.writeHead(404).end(); }
});
server.listen(4174, '127.0.0.1');
