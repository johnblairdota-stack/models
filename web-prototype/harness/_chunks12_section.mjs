/**
 * 🔬 **THE SECTION, BINNED BY WHICH WAY IT FACES — the instrument round 9 and `critic-dig-6`
 * each half-built.**
 *
 * Round 9 sampled COLUMNS (above the topmost teal / below the bottom-most teal); `critic-dig-6`
 * sampled ROWS (left of the leftmost teal, high in the hole and low in it). Round 9's axis can
 * only see the soffit and the sill; the critic's axis can only see the LEFT JAMB, twice — and a
 * jamb's cut face is vertical, so `uSecLift`'s `_secUp` is ~0 on it by construction and the two
 * bands must read the same. Neither tool is wrong; neither measures the whole annulus.
 *
 * This one walks the teal boundary itself. For every boundary texel it takes the OUTWARD
 * direction (the gradient of a blurred teal mask, pointing away from the teal), steps out along
 * it, keeps only pixels that classify as CUT FACE — neutral, mid-luma, not the bright lip, not
 * the warm boiserie, not the floor — and bins them by the direction's vertical component:
 *
 *     dir.y < -0.45   SOFFIT   material above the hole, its cut face turned DOWN
 *     dir.y > +0.45   SILL     material below the hole, its cut face turned UP
 *     otherwise       JAMB     the sides
 *
 * That is exactly the quantity `uSecLift` drives (`_secShade = 1 + uSecLift * _secUp`), it is
 * independent of where in the frame the hole happens to sit, and it reports its own sample
 * counts so a bin with nothing in it cannot masquerade as a measurement.
 *
 * Usage: node harness/_chunks12_section.mjs <png> [png...]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const srcs = process.argv.slice(2);
/**
 * The cut-face classifier's window, as knobs, because the answer moves with it and a reader is
 * entitled to see that. `LMAX` 130 keeps the bright white LIP out of the section — walking
 * outward from the teal you cross section, then lip, then boiserie/floor, and a window that
 * admits the lip measures the lip. `STEPS` 7 px is about the widest the section ever gets at
 * these stations.
 */
const LMIN = +(process.env.RRR_LMIN ?? 16);
const LMAX = +(process.env.RRR_LMAX ?? 130);
const STEPS = +(process.env.RRR_STEPS ?? 7);
const br = await chromium.launch();
const pg = await br.newPage();
const rows = [];
for (const src of srcs) {
  const b = fs.readFileSync(src).toString('base64');
  const r = await pg.evaluate(async ([b64, LMIN, LMAX, STEPS]) => {
    const bin = atob(b64); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([arr], { type: 'image/png' }));
    const W = bmp.width, H = bmp.height;
    const c = new OffscreenCanvas(W, H);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, W, H).data;
    const at = (x, y) => { const o = (y * W + x) * 4; return [d[o], d[o + 1], d[o + 2]]; };
    const lum = (p) => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
    const isTeal = (p) => p[2] >= 34 && p[2] > p[0] * 1.55 && p[1] > p[0] * 1.20;
    /**
     * THE CUT FACE, as a classifier. Neutral (blue within 45% of red, so the warm boiserie and
     * the parquet are out), mid luma (so the bright lip and the black cavity are out), and not
     * teal. Same family as `_chunks11-secab.mjs`'s `isCut`, widened at the top by 10 units
     * because the sill genuinely does get bright.
     */
    const isCut = (p) => {
      const L = lum(p);
      return L > LMIN && L < LMAX && p[2] <= p[0] * 1.45 && p[2] >= p[0] * 0.55;
    };

    const teal = new Uint8Array(W * H);
    let tn = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isTeal(at(x, y))) { teal[y * W + x] = 1; tn++; }
    if (tn < 200) return { tn, bins: null };

    // blurred mask -> a stable outward direction even on a 1 px ragged boundary
    const R = 3;
    const dirAt = (x, y) => {
      let gx = 0, gy = 0;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (!teal[yy * W + xx]) continue;
        gx -= dx; gy -= dy;                     // point AWAY from teal
      }
      const L = Math.hypot(gx, gy);
      return L > 1e-6 ? [gx / L, gy / L] : null;
    };

    const bins = { soffit: [], sill: [], jamb: [] };
    for (let y = R + 1; y < H - R - 1; y++) {
      for (let x = R + 1; x < W - R - 1; x++) {
        if (!teal[y * W + x]) continue;
        // boundary texel only
        if (teal[y * W + x - 1] && teal[y * W + x + 1] && teal[(y - 1) * W + x] && teal[(y + 1) * W + x]) continue;
        const dir = dirAt(x, y);
        if (!dir) continue;
        // note: image y grows DOWNWARD, so a direction with dir[1] < 0 points UP the screen
        const up = -dir[1];
        const band = up > 0.45 ? 'soffit' : (up < -0.45 ? 'sill' : 'jamb');
        for (let k = 1; k <= STEPS; k++) {
          const xx = Math.round(x + dir[0] * k), yy = Math.round(y + dir[1] * k);
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) break;
          const p = at(xx, yy);
          if (isTeal(p)) break;
          if (!isCut(p)) continue;
          bins[band].push(lum(p));
        }
      }
    }
    const stat = (a) => {
      if (a.length < 30) return { n: a.length, mean: -1, med: -1 };
      const s = [...a].sort((p, q) => p - q);
      return { n: a.length, mean: +(a.reduce((t, v) => t + v, 0) / a.length).toFixed(1), med: +s[s.length >> 1].toFixed(1) };
    };
    return { tn, bins: { soffit: stat(bins.soffit), sill: stat(bins.sill), jamb: stat(bins.jamb) } };
  }, [b, LMIN, LMAX, STEPS]);
  rows.push({ src: src.replace(/.*[\\/]/, ''), ...r });
}
await br.close();
console.log('frame                                        teal |  soffit(n)      jamb(n)       sill(n)   | sill/soffit');
for (const o of rows) {
  if (!o.bins) { console.log(`${o.src.padEnd(44)} ${String(o.tn).padStart(6)}  (too little teal)`); continue; }
  const { soffit, jamb, sill } = o.bins;
  const ratio = (soffit.mean > 1 && sill.mean > 0) ? (sill.mean / soffit.mean).toFixed(2) : 'n/a';
  console.log(`${o.src.padEnd(44)} ${String(o.tn).padStart(6)} | `
    + `${String(soffit.mean).padStart(6)}(${String(soffit.n).padStart(5)}) `
    + `${String(jamb.mean).padStart(6)}(${String(jamb.n).padStart(5)}) `
    + `${String(sill.mean).padStart(6)}(${String(sill.n).padStart(5)}) | ${String(ratio).padStart(6)}`);
}
