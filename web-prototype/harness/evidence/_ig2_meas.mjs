// critic-ingame: per-region mean luma A/B between two full frames + a diff map.
// usage: node harness/evidence/_ig2_meas.mjs <onPng> <offPng> [diffOutPng]
import { readFileSync, writeFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { decodePng } from '../pxdiff.mjs';

let TBL = null;
const [onP, offP, diffOut] = process.argv.slice(2);
const A = decodePng(readFileSync(onP));
const B = decodePng(readFileSync(offP));
if (A.width !== B.width || A.height !== B.height) throw new Error('size mismatch');
const W = A.width, H = A.height;
const ch = A.channels ?? (A.data.length / (W * H));
const chB = B.channels ?? (B.data.length / (W * H));

const lum = (d, c, i) => 0.2126 * d[i * c] + 0.7152 * d[i * c + 1] + 0.0722 * d[i * c + 2];

// boxes are given in FULL-FRAME px: name,x,y,w,h
const boxes = process.env.IG_BOXES ? JSON.parse(process.env.IG_BOXES) : [];
const rows = [];
for (const [name, x, y, w, h] of boxes) {
  let sa = 0, sb = 0, n = 0, dmax = 0, dsum = 0;
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    const i = yy * W + xx;
    const la = lum(A.data, ch, i), lb = lum(B.data, chB, i);
    sa += la; sb += lb; n++;
    const d = Math.abs(la - lb); dsum += d; if (d > dmax) dmax = d;
  }
  let hot = 0;
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    const i = yy * W + xx;
    if (Math.abs(lum(A.data, ch, i) - lum(B.data, chB, i)) > 12) hot++;
  }
  rows.push({ name, on: +(sa / n).toFixed(1), off: +(sb / n).toFixed(1),
              dLuma: +((sa - sb) / n).toFixed(1), meanAbs: +(dsum / n).toFixed(1), max: Math.round(dmax),
              pxChanged: `${hot}/${n}`, pctChanged: +(100 * hot / n).toFixed(1) });
}
console.table(rows);

if (diffOut) {
  // amplified absolute-difference map, greyscale, x4 gain
  const out = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    out[y * (1 + W * 3)] = 0;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let d = 0;
      for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A.data[i * ch + c] - B.data[i * chB + c]));
      const v = Math.min(255, Math.round(d * 4));
      const o = y * (1 + W * 3) + 1 + x * 3;
      out[o] = v; out[o + 1] = v; out[o + 2] = v;
    }
  }
  const idat = zlib.deflateSync(out);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  writeFileSync(diffOut, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
  ]));
  console.log('diff map ->', diffOut);
}

function crc32(buf) {
  if (!TBL) { TBL = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; TBL[n] = c; } }
  let c = -1; for (let i = 0; i < buf.length; i++) c = TBL[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}
