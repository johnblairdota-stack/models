#!/usr/bin/env node
/**
 * The Hunter in the Door — design board server. `npm run hunter-door`, then open
 * http://localhost:5207
 *
 * Port 5207 ON PURPOSE: 5199 is The Desk, 5205 is The Night — this board must never
 * collide with either. Serves only this folder; no game code, no party server.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = 5207;
const TYPES = { '.html': 'text/html', '.md': 'text/plain; charset=utf-8', '.json': 'application/json', '.png': 'image/png' };

http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = rel === '/' ? 'the-hunter-in-the-door.html' : rel.slice(1);
  const full = path.join(DIR, file);
  if (!full.startsWith(DIR) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    res.writeHead(404); res.end('not here — the board is at /'); return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(full)] ?? 'application/octet-stream' });
  res.end(fs.readFileSync(full));
}).listen(PORT, () => {
  console.log(`The Hunter in the Door — http://localhost:${PORT}`);
});
