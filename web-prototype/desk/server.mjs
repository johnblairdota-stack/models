/**
 * The Desk — intake board server. Zero dependencies, isolated from all
 * game surfaces. Serves the board UI and the verify API.
 *
 *   node desk/server.mjs        →  http://localhost:5199/
 *
 * API:
 *   GET  /api/cards                     list cards
 *   POST /api/cards/:id/move   {lane}   pitch|route|verify only — never done
 *   POST /api/cards/:id/route  {route, owner}
 *   POST /api/cards/:id/verify          runs the backend checks; the only
 *                                       path to Done
 */

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createStore, DeskError } from './store.mjs';
import { CHECKS } from './checks.mjs';

const DESK_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(DESK_DIR, '..'); // web-prototype/

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};
const STATIC = { '/': 'index.html', '/index.html': 'index.html', '/desk.css': 'desk.css', '/desk.js': 'desk.js' };

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 65536) req.destroy(); });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(new DeskError(400, 'body is not JSON')); }
    });
    req.on('error', reject);
  });
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body, null, 2));
}

export async function startDesk({ port = 5199, statePath = join(DESK_DIR, '.state.json') } = {}) {
  const store = await createStore({
    seedPath: join(DESK_DIR, 'cards.json'),
    statePath,
    checks: CHECKS,
    repoRoot: REPO_ROOT,
  });

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://desk');

      if (req.method === 'GET' && STATIC[url.pathname]) {
        const file = join(DESK_DIR, STATIC[url.pathname]);
        return send(res, 200, await readFile(file, 'utf8'), MIME[extname(file)]);
      }
      if (req.method === 'GET' && url.pathname === '/api/cards') {
        return send(res, 200, { cards: store.list() });
      }

      const m = url.pathname.match(/^\/api\/cards\/([\w-]+)\/(move|route|verify)$/);
      if (m && req.method === 'POST') {
        const [, id, action] = m;
        if (action === 'move') return send(res, 200, { card: await store.move(id, (await readBody(req)).lane) });
        if (action === 'route') return send(res, 200, { card: await store.setRoute(id, await readBody(req)) });
        if (action === 'verify') return send(res, 200, await store.verify(id));
      }

      send(res, 404, { error: 'not found' });
    } catch (err) {
      send(res, err.status || 500, { error: err.message });
    }
  });

  await new Promise((resolve) => server.listen(port, resolve));
  return { server, store, port: server.address().port };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { port } = await startDesk({ port: Number(process.env.DESK_PORT) || 5199 });
  console.log(`The Desk is open: http://localhost:${port}/`);
}
