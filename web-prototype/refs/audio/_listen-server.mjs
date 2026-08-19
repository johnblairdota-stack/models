// Tiny static server for LISTEN.html — started by LISTEN.bat, nothing else uses it.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const TYPES = { '.html': 'text/html', '.wav': 'audio/wav', '.mjs': 'text/javascript' };
http.createServer((req, res) => {
  const name = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(DIR, name === '/' ? 'LISTEN.html' : name.replace(/^\//, ''));
  if (!file.startsWith(DIR) || !fs.existsSync(file)) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(5231, () => console.log('Listening page: http://127.0.0.1:5231/  (close this window when done)'));
