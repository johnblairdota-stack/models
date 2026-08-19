#!/usr/bin/env node
/**
 * SERVE — a plain static server for the built game in `dist/`.
 *
 * WHY NOT `npm run dev` OR `vite preview`:
 *
 *  - `npm run dev` is pinned to :5178 with `--strictPort`, which is the port `shoot.mjs`
 *    spawns vite on. Running it while any agent is capturing breaks their round. It also
 *    hot-reloads: while a builder is editing `unit4h.js` every few seconds, vite pushes a
 *    full page reload each save, so the scene never survives the ~10 s it needs to bake and
 *    the tab looks permanently broken. That is not a hypothetical — it happened.
 *  - `vite preview` fixes the reload problem but **rejects unknown Host headers with 403**,
 *    so it cannot be put behind a tunnel without editing the project's vite config.
 *
 * This does neither. It serves the built files, nothing else, and does not care what Host
 * header arrives — which is what makes `cloudflared tunnel --url http://localhost:5192` work.
 *
 *   node harness/serve.mjs                 # :5192, serves dist/
 *   node harness/serve.mjs --port 8080
 *   node harness/serve.mjs --dir progress  # serve the progress board instead
 *
 * Run `npx vite build` first, or after any source change — this serves what is on disk and
 * has no idea your source moved on.
 */

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const PORT = +(opt('port', 5192));
const DIR = path.resolve(ROOT, opt('dir', 'dist'));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.hdr': 'application/octet-stream',
};

try { await stat(path.join(DIR, 'index.html')); }
catch { console.error(`  no index.html in ${DIR}\n  run:  npx vite build`); process.exit(1); }

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    let file = path.join(DIR, decodeURIComponent(url.pathname));
    // Directory -> index.html. Everything unknown also falls back to index.html so the
    // ?view= query keeps working on a deep link.
    try { if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html'); }
    catch { file = path.join(DIR, 'index.html'); }
    // Never serve outside the served directory.
    if (!file.startsWith(DIR)) { res.writeHead(403); return res.end('forbidden'); }

    const body = await readFile(file);
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'content-type': TYPES[ext] ?? 'application/octet-stream',
      // Hashed assets are immutable; index.html must never be cached or a rebuild is
      // invisible to anyone with the tab already open.
      'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable',
    });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(PORT, () => {
  console.log(`  serving ${path.relative(ROOT, DIR) || '.'} on http://localhost:${PORT}`);
  console.log(`  game:   http://localhost:${PORT}/?view=game.play`);
});
