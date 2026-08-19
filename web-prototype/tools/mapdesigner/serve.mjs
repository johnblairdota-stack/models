#!/usr/bin/env node
/**
 * serve.mjs — the smallest possible static server, so the map designer can import the REAL
 * generator instead of a copy of it.
 *
 * WHY THIS EXISTS AT ALL, since a single .html file would have been less to explain:
 *
 * The one architectural rule of this tool is that there must be exactly ONE packing algorithm in
 * the project. `tools/mapdesigner/app.js` therefore does `import ... from '/harness/genspike.mjs'`
 * — the same file `node harness/genspike.mjs --sweep 512` runs. A browser will not resolve an ES
 * module import off a `file://` page (and Chrome blocks it outright), so the page has to come off
 * http. That is the entire job of this file: hand the project directory to localhost so the tool
 * and the harness read the same bytes. Nothing is bundled, nothing is copied, nothing can drift.
 *
 * It deliberately does NOT touch `dist/` and does NOT run vite. John is playing off a live tunnel
 * served from `dist/` on port 5179; this is port 5181 and it is read-only.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');          // the web-prototype directory
const PORT = Number(process.env.MAPS_PORT || 5181);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/**
 * 🚨 THE LABELS FILE — the highest-value thing this server does, and it is nine lines.
 *
 * `critic-corridor-1`: "the flat-plan fix is a scoring term and nobody has John's labels." The
 * generator cannot be taught what a good house looks like until the taste authority has said so
 * about some actual houses, and no amount of geometry substitutes for that. So the good/bad
 * buttons in the designer POST here and this appends one line to a file in the repo.
 *
 * JSON LINES, deliberately. Append-only means two clicks in quick succession cannot lose each
 * other to a read-modify-write race, and reading it back is one line of anything:
 *     node -e "require('fs').readFileSync('tools/mapdesigner/labels.jsonl','utf8').trim().split('\n').map(JSON.parse)"
 * A verdict is never overwritten or deleted — a later line for the same seed supersedes an
 * earlier one, so John changing his mind is data too.
 */
const LABELS = path.join(HERE, 'labels.jsonl');

function readLabels() {
  try {
    return fs.readFileSync(LABELS, 'utf8').trim().split('\n').filter(Boolean).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent((req.url || '/').split('?')[0]);

  // ---- the labels API --------------------------------------------------------------------
  if (rel === '/labels') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(readLabels()));
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
      req.on('end', () => {
        try {
          const rec = JSON.parse(body);
          rec.at = new Date().toISOString();
          fs.appendFileSync(LABELS, JSON.stringify(rec) + '\n', 'utf8');
          const all = readLabels();
          console.log(`  label: seed ${rec.seed} -> ${rec.verdict}   (${all.length} total)`);
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: true, total: all.length }));
        } catch (e) {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: String(e && e.message) }));
        }
      });
      return;
    }
  }

  if (rel === '/' || rel === '') rel = '/tools/mapdesigner/index.html';
  if (rel.endsWith('/')) rel += 'index.html';

  // stay inside the project directory, whatever the request says
  const abs = path.resolve(ROOT, '.' + rel);
  if (!abs.startsWith(ROOT)) { res.writeHead(403).end('outside the project'); return; }

  fs.readFile(abs, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`404  ${rel}\n\nLooked in: ${abs}\n\nIf this is the map designer, the file that should be here is\ntools/mapdesigner/index.html — tell Claude it is missing.`);
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
      // always fresh: the whole point of this tool is looking at code that just changed
      'cache-control': 'no-store',
    });
    res.end(buf);
  });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is already serving the map designer — reusing it.`);
    console.log(`Open  http://localhost:${PORT}/tools/mapdesigner/`);
    process.exit(0);
  }
  console.error(e);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log('');
  console.log('  Run Robot Run — MAP DESIGNER');
  console.log('  ============================');
  console.log(`  Serving ${ROOT}`);
  console.log(`  Open    http://localhost:${PORT}/tools/mapdesigner/`);
  console.log('');
  console.log('  Leave this window open while you use the tool. Close it when you are done.');
  console.log('');
});
