// critic-ingame: find the player's on-screen bounding box by locating the bright white
// shell against the dark room, and report its pixel height + the frame height.
// usage: node harness/evidence/_ig4_bbox.mjs <png> [thresh]
import { readFileSync } from 'node:fs';
import { decodePng } from '../pxdiff.mjs';

const [inP, thr = '150'] = process.argv.slice(2);
const T = Number(thr);
const A = decodePng(readFileSync(inP));
const W = A.width, H = A.height, ch = A.channels ?? (A.data.length / (W * H));

// column/row histogram of "bright and desaturated" pixels = the white shell
let minX = W, maxX = 0, minY = H, maxY = 0, n = 0;
const colCount = new Int32Array(W);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * ch;
  const r = A.data[i], g = A.data[i + 1], b = A.data[i + 2];
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const sat = mx === 0 ? 0 : (mx - mn) / mx;
  if (mx > T && sat < 0.22) {
    colCount[x]++; n++;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
}
// the character is the densest contiguous run of such columns; report the global box too
let best = 0, bestX = 0;
for (let x = 0; x < W; x++) if (colCount[x] > best) { best = colCount[x]; bestX = x; }
console.log(JSON.stringify({
  file: inP.split(/[\\/]/).pop(), frame: [W, H], brightPx: n,
  globalBox: [minX, minY, maxX - minX, maxY - minY],
  densestColumn: bestX, densestCount: best,
}));
