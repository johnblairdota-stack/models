#!/usr/bin/env node
/**
 * PNG decode + raw-pixel diff.
 *
 *   node harness/pxdiff.mjs a.png b.png [--json]
 *   import { decodePng, diff } from './pxdiff.mjs';
 *
 * WHY THIS EXISTS. Comparing two captures byte-for-byte on disk answers the wrong question:
 * PNG is a compressed container, so two files can differ while the pixels agree and (in
 * principle) agree while the encoder settings differ. Every "is this the same frame?"
 * argument on this project needs RAW pixels, and there is no pngjs or sharp in the tree.
 * This decodes the only thing Chromium's `page.screenshot()` ever emits — 8-bit RGB/RGBA,
 * non-interlaced — using node's own zlib, and unfilters the scanlines itself.
 *
 * Alpha is ignored: capture mode renders opaque, so a difference there is not a picture
 * difference. Statistics are reported two ways because they answer different questions:
 * per-BYTE ("how much of the image moved at all") and per-PIXEL-max ("how far did the
 * worst channel of this pixel move"). A uniform dither reads as a huge byte percentage and
 * a tiny mean; a real content change reads as a small percentage and a large max.
 */
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let off = 8, ihdr = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      ihdr = { width: data.readUInt32BE(0), height: data.readUInt32BE(4),
        depth: data[8], color: data[9], interlace: data[12] };
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (!ihdr) throw new Error('no IHDR');
  if (ihdr.depth !== 8) throw new Error('only 8-bit PNGs supported, got depth ' + ihdr.depth);
  if (ihdr.interlace) throw new Error('interlaced PNGs not supported');
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ihdr.color];
  if (!ch) throw new Error('unsupported PNG colour type ' + ihdr.color);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const { width: w, height: h } = ihdr;
  const stride = w * ch;
  const out = Buffer.alloc(stride * h);

  // undo the per-scanline filters (PNG spec 9.2); `cur`/`up` alias into `out` so each row
  // is unfiltered against the already-reconstructed row above it
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const line = raw.subarray(p, p + stride); p += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const up = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0;
      const b = up ? up[x] : 0;
      const c = (up && x >= ch) ? up[x - ch] : 0;
      let v = line[x];
      switch (filter) {
        case 0: break;
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: {
          const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
          v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          break;
        }
        default: throw new Error('bad PNG filter type ' + filter);
      }
      cur[x] = v & 0xff;
    }
  }
  return { width: w, height: h, channels: ch, data: out };
}

export function diff(a, b) {
  if (a.width !== b.width || a.height !== b.height || a.channels !== b.channels) {
    throw new Error(`size/format mismatch ${a.width}x${a.height}x${a.channels} vs ${b.width}x${b.height}x${b.channels}`);
  }
  const ch = a.channels, px = a.width * a.height;
  let diffBytes = 0, sum = 0, max = 0, diffPx = 0, sumPxMax = 0;
  const hist = new Uint32Array(256);
  for (let i = 0; i < px; i++) {
    let pmax = 0;
    for (let k = 0; k < ch; k++) {
      if (k === 3) continue;                          // alpha: opaque in capture mode
      const d = Math.abs(a.data[i * ch + k] - b.data[i * ch + k]);
      if (d) { diffBytes++; sum += d; if (d > max) max = d; }
      if (d > pmax) pmax = d;
    }
    hist[pmax]++;
    if (pmax) { diffPx++; sumPxMax += pmax; }
  }
  const rgbBytes = px * Math.min(ch, 3);
  const over = (n) => { let s = 0; for (let i = n + 1; i < 256; i++) s += hist[i]; return s; };
  return {
    width: a.width, height: a.height,
    identical: diffBytes === 0,
    diffBytes, rgbBytes, pctBytes: +(100 * diffBytes / rgbBytes).toFixed(3),
    diffPx, px, pctPx: +(100 * diffPx / px).toFixed(3),
    meanDeltaOverDiffering: diffBytes ? +(sum / diffBytes).toFixed(3) : 0,
    meanDeltaOverAll: +(sum / rgbBytes).toFixed(4),
    maxDelta: max,
    meanPxMax: diffPx ? +(sumPxMax / diffPx).toFixed(3) : 0,
    pxOver1: over(1), pxOver4: over(4), pxOver16: over(16),
  };
}

/** One-line summary, the form every caller in harness/ wants. */
export function summarise(d) {
  return d.identical ? 'IDENTICAL'
    : `${d.pctBytes}% bytes  ${d.pctPx}% px  mean ${d.meanDeltaOverDiffering}  max ${d.maxDelta}`
      + `  px>4 ${d.pxOver4}  px>16 ${d.pxOver16}`;
}

if (process.argv[1] && /pxdiff\.mjs$/.test(process.argv[1])) {
  const files = process.argv.slice(2).filter((s) => !s.startsWith('--'));
  if (files.length !== 2) {
    console.error('usage: node harness/pxdiff.mjs a.png b.png [--json]');
    process.exit(2);
  }
  const [ba, bb] = files.map((f) => readFileSync(f));
  const r = diff(decodePng(ba), decodePng(bb));
  r.fileIdentical = ba.equals(bb);
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`file bytes identical: ${r.fileIdentical}`);
    console.log(`pixels identical    : ${r.identical}`);
    console.log(`differing rgb bytes : ${r.diffBytes}/${r.rgbBytes}  (${r.pctBytes}%)`);
    console.log(`differing pixels    : ${r.diffPx}/${r.px}  (${r.pctPx}%)`);
    console.log(`mean|delta| (diff)  : ${r.meanDeltaOverDiffering}   over all bytes: ${r.meanDeltaOverAll}`);
    console.log(`max delta           : ${r.maxDelta}`);
    console.log(`px with maxch >1    : ${r.pxOver1}   >4: ${r.pxOver4}   >16: ${r.pxOver16}`);
  }
  process.exit(r.identical ? 0 : 1);
}
