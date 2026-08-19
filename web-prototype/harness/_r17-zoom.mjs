import { readFileSync, writeFileSync } from 'node:fs';
import { decodePng } from './pxdiff.mjs';
import zlib from 'node:zlib';

const luma = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const chroma = (c) => Math.max(...c) / 255 - Math.min(...c) / 255;
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');

function writePng(outPath, w, h, ch, data) {
  const raw = Buffer.alloc((w * ch + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * ch + 1)] = 0;
    data.copy(raw, y * (w * ch + 1) + 1, y * w * ch, (y + 1) * w * ch);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = ch === 4 ? 6 : 2;
  writeFileSync(outPath, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

const img = decodePng(readFileSync('harness/out/furn-smash-critic/s-fireplace-leave.png'));
const { width: W, channels: CH, data: px } = img;
const at = (x, y) => {
  const i = (y * W + x) * CH;
  return [px[i], px[i + 1], px[i + 2]];
};

// scan rows for a mid-chroma brown island that's not facing-black
console.log('row scans (x=560..720) looking for L 0.14-0.28 C>0.10');
for (const y of [260, 280, 300, 320, 340, 360, 380, 400]) {
  const hits = [];
  for (let x = 540; x < 760; x++) {
    const c = at(x, y);
    const L = luma(c), C = chroma(c);
    if (L >= 0.14 && L < 0.28 && C > 0.10) hits.push(x);
  }
  if (!hits.length) {
    console.log(`y=${y} none`);
    continue;
  }
  console.log(`y=${y} n=${hits.length} x=${hits[0]}..${hits[hits.length - 1]} sample ${hex(at(hits[0], y))} L=${luma(at(hits[0], y)).toFixed(3)}`);
}

// 4x nearest zoom of likely hole: try 580,270, 140x140
function zoom(x0, y0, w, h, scale, tag) {
  const ow = w * scale, oh = h * scale;
  const crop = Buffer.alloc(ow * oh * CH);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const sx = x0 + Math.floor(x / scale);
      const sy = y0 + Math.floor(y / scale);
      const i = (sy * W + sx) * CH;
      crop.set(px.subarray(i, i + CH), (y * ow + x) * CH);
    }
  }
  writePng(`harness/out/furn-smash-critic/_r17-zoom-${tag}.png`, ow, oh, CH, crop);
  console.log('wrote', tag, `${ow}x${oh} from ${x0},${y0} ${w}x${h}`);
}

zoom(580, 250, 160, 160, 4, 'fireplace-hole');
zoom(600, 270, 100, 100, 5, 'fireplace-hole-tight');

const desk = decodePng(readFileSync('harness/out/furn-smash-critic/s-desk-leave.png'));
function zoomDesk(x0, y0, w, h, scale, tag) {
  const ow = w * scale, oh = h * scale;
  const crop = Buffer.alloc(ow * oh * desk.channels);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const sx = x0 + Math.floor(x / scale);
      const sy = y0 + Math.floor(y / scale);
      const i = (sy * desk.width + sx) * desk.channels;
      crop.set(desk.data.subarray(i, i + desk.channels), (y * ow + x) * desk.channels);
    }
  }
  writePng(`harness/out/furn-smash-critic/_r17-zoom-${tag}.png`, ow, oh, desk.channels, crop);
}
zoomDesk(520, 250, 160, 150, 4, 'desk-hole');
console.log('desk hole zoomed');
