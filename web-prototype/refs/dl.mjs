// Downloader: reads a JSON job list from argv[0], validates image magic numbers,
// extracts pixel dimensions, writes files, appends to _index.tsv
import { writeFile, mkdir, readFile, appendFile } from 'node:fs/promises';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function dims(b) {
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { fmt: 'png', w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  }
  // JPEG
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let i = 2;
    while (i < b.length - 9) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const len = b.readUInt16BE(i + 2);
      if ((m >= 0xc0 && m <= 0xcf) && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { fmt: 'jpg', h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
    return { fmt: 'jpg', w: 0, h: 0 };
  }
  // WEBP
  if (b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP') {
    const c = b.slice(12, 16).toString('latin1');
    if (c === 'VP8X') return { fmt: 'webp', w: (b.readUIntLE(24, 3) & 0xffffff) + 1, h: (b.readUIntLE(27, 3) & 0xffffff) + 1 };
    if (c === 'VP8 ') return { fmt: 'webp', w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    return { fmt: 'webp', w: 0, h: 0 };
  }
  return null;
}

// Wikimedia's policy requires a descriptive UA; generic browser UAs get 429'd.
const WM_UA = 'RunRobotRun-RefGather/1.0 (https://example.invalid; johnblairdota@gmail.com) node-fetch';
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function get(j) {
  const isWM = /wikimedia\.org|wikipedia\.org/.test(j.url);
  const headers = {
    'user-agent': isWM ? WM_UA : UA,
    'accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  };
  if (!isWM) headers['referer'] = j.ref || 'https://www.google.com/';
  let last = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await fetch(j.url, { headers, redirect: 'follow' });
      if (r.ok) return r;
      last = r;
      if (r.status === 429 || r.status >= 500) { await sleep(4000 * (attempt + 1)); continue; }
      return r;
    } catch (e) {
      // network-level failure (connection reset / DNS) — back off and retry
      last = null;
      await sleep(4000 * (attempt + 1));
    }
  }
  return last;
}

const jobs = JSON.parse(await readFile(process.argv[2], 'utf8'));
let ok = 0, bad = 0;
for (const j of jobs) {
  try {
    if (/wikimedia\.org|wikipedia\.org/.test(j.url)) await sleep(1200);
    const r = await get(j);
    if (!r || !r.ok) { console.log('SKIP http' + (r ? r.status : '???'), j.out); bad++; continue; }
    const b = Buffer.from(await r.arrayBuffer());
    const d = dims(b);
    if (!d) { console.log('NOT-AN-IMAGE', b.length, j.out, b.slice(0, 12).toString('latin1').replace(/[^\x20-\x7e]/g, '.')); bad++; continue; }
    const minBytes = j.minBytes ?? 40000;
    const minW = j.minW ?? 900;
    if (b.length < minBytes) { console.log('TOO-SMALL', b.length, `${d.w}x${d.h}`, j.out); bad++; continue; }
    if (d.w && d.w < minW) { console.log('LOW-RES', `${d.w}x${d.h}`, j.out); bad++; continue; }
    const dir = j.out.split('/')[0];
    await mkdir(new URL('./' + dir + '/', import.meta.url), { recursive: true });
    await writeFile(new URL('./' + j.out, import.meta.url), b);
    console.log('OK', `${d.w}x${d.h}`, Math.round(b.length / 1024) + 'KB', j.out);
    await appendFile(new URL('./_index.tsv', import.meta.url), `${j.out}\t${d.w}x${d.h}\t${Math.round(b.length / 1024)}KB\t${j.url}\n`);
    ok++;
  } catch (e) { console.log('ERR', j.out, String(e.message)); bad++; }
}
console.log(`\n-- ok=${ok} bad=${bad} --`);
