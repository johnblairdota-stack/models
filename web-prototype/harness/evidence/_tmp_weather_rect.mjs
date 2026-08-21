// Count differing pixels inside a rect — used to prove the weathering change is confined
// to the character and does not touch the backdrop or the floor.
import { readFileSync } from 'node:fs';
import { decodePng } from '../pxdiff.mjs';
const [, , a, b, xs, ys, ws, hs] = process.argv;
const A = decodePng(readFileSync(a)), B = decodePng(readFileSync(b));
const x = +xs, y = +ys, w = +ws, h = +hs;
const ch = A.data.length / (A.width * A.height);
let n = 0, max = 0;
for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
  const o = (j * A.width + i) * ch;
  let d = 0;
  for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A.data[o + c] - B.data[o + c]));
  if (d) n++;
  if (d > max) max = d;
}
console.log(`rect ${x},${y} ${w}x${h}: ${n}/${w * h} differing px, max ch delta ${max}`);
