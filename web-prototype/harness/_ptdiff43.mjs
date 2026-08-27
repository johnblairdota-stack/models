// pt-diff-43: two frames of the SAME camera in the SAME room, compared as numbers.
//   node harness/_ptdiff43.mjs a.png b.png
import { readFileSync } from 'node:fs';
import { decodePng } from './pxdiff.mjs';
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function read(p) {
  const im = decodePng(readFileSync(p));
  const { width: W, height: H, channels: CH, data: px } = im;
  const L = new Float64Array(W * H); const RGB = [];
  for (let i = 0, j = 0; j < W * H; j++, i += CH) {
    L[j] = luma(px[i], px[i + 1], px[i + 2]);
    RGB.push([px[i], px[i + 1], px[i + 2]]);
  }
  return { W, H, L, RGB };
}
const [A, B] = process.argv.slice(2).map(read);
if (A.W !== B.W || A.H !== B.H) { console.error('size mismatch'); process.exit(2); }
const ladder = (L) => {
  const s = Float64Array.from(L).sort();
  return Array.from({ length: 9 }, (_, i) => +s[Math.floor(s.length * (i + 1) / 10)].toFixed(1));
};
const med = (L) => { const s = Float64Array.from(L).sort(); return +s[s.length >> 1].toFixed(1); };
const mean = (L) => +(L.reduce((a, b) => a + b, 0) / L.length).toFixed(1);
console.log(`  A ladder ${ladder(A.L).join(' ')}   median ${med(A.L)}  mean ${mean(A.L)}`);
console.log(`  B ladder ${ladder(B.L).join(' ')}   median ${med(B.L)}  mean ${mean(B.L)}`);
let sum = 0, max = 0, over8 = 0, over24 = 0, sumSigned = 0;
const chan = [0, 0, 0];
for (let i = 0; i < A.L.length; i++) {
  const d = Math.abs(A.L[i] - B.L[i]);
  sum += d; sumSigned += A.L[i] - B.L[i]; if (d > max) max = d;
  if (d > 8) over8++; if (d > 24) over24++;
  for (let c = 0; c < 3; c++) chan[c] += Math.abs(A.RGB[i][c] - B.RGB[i][c]);
}
const n = A.L.length;
console.log(`  mean |dL| ${(sum / n).toFixed(2)}   signed ${(sumSigned / n).toFixed(2)}   max ${max.toFixed(0)}`);
console.log(`  pixels >8 apart ${(100 * over8 / n).toFixed(2)}%   >24 apart ${(100 * over24 / n).toFixed(2)}%`);
console.log(`  mean |dR| ${(chan[0] / n).toFixed(2)}  |dG| ${(chan[1] / n).toFixed(2)}  |dB| ${(chan[2] / n).toFixed(2)}`);
console.log(`  VERDICT: ${sum / n < 1.5 && over8 / n < 0.01 ? 'SAME FRAME' : sum / n < 6 ? 'CLOSE — differs somewhere' : 'DIFFERENT'}`);
