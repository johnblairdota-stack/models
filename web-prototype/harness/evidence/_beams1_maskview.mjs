#!/usr/bin/env node
/**
 * BEAMS-1 — LOOK AT THE MASK. A mesh-ownership mask that is wrong produces a table of
 * beautifully consistent numbers about the wrong pixels, which is this project's most
 * expensive failure mode. So: paint the mask over the frame it was taken from and open it.
 *
 *   node harness/evidence/_beams1_maskview.mjs progress/beams1-study_w_south.json \
 *        progress/beams1-study_w_south-base.png out.png
 *
 * Mask pixels are tinted red, everything else is left alone but halved, so a mask that has
 * crept onto the panelling or the floor is obvious at a glance.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { decodePng } from '../pxdiff.mjs';
import zlib from 'node:zlib';

const [maskB64File, srcPng, outPng] = process.argv.slice(2);
const packed = Buffer.from(readFileSync(maskB64File, 'utf8').trim(), 'base64');
const img = decodePng(readFileSync(srcPng));
const { width: W, height: H, channels: ch, data } = img;

const rgb = Buffer.alloc(W * H * 3);
let n = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * ch, o = (y * W + x) * 3;
    const bit = y * W + x;
    const on = (packed[bit >> 3] >> (bit & 7)) & 1;
    if (on) { n++; rgb[o] = 255; rgb[o + 1] = data[i + 1] >> 2; rgb[o + 2] = data[i + 2] >> 2; }
    else { rgb[o] = data[i] >> 1; rgb[o + 1] = data[i + 1] >> 1; rgb[o + 2] = data[i + 2] >> 1; }
  }
}
// minimal PNG writer
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; rgb.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
const crcT = (() => { const t = []; for (let n2 = 0; n2 < 256; n2++) { let c = n2; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n2] = c >>> 0; } return t; })();
const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, body) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
  const t = Buffer.from(type), c = Buffer.alloc(4);
  c.writeUInt32BE(crc(Buffer.concat([t, body])));
  return Buffer.concat([len, t, body, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(outPng, Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
]));
console.log(`wrote ${outPng}  mask pixels ${n} (${(n / (W * H) * 100).toFixed(2)}%)`);
