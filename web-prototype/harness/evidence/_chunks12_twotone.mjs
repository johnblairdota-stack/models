/**
 * 🧱 **"IS THE CYAN MORE THAN ONE FLAT VALUE?" — as a number, on a delivered png.**
 *
 * 'critic-dig-6': *"the cyan is a flat single RGB value in every frame sampled."* That is a
 * measurable claim and this measures it. Every pixel in the teal FAMILY (blue clearly above red,
 * blue at least 40) is quantised to a 6-unit RGB bucket; the buckets are ranked by area and the
 * top ones reported. A slab with a lit top face and a shaded side face has at least two buckets
 * with real area and a real separation between them; a painted fill has one.
 *
 * Reported per mode: sRGB, pixel count, share of the teal family, and the mean SCREEN-Y of the
 * mode's pixels relative to the teal field's own bounding box (0 = the top of the hole, 1 = the
 * bottom). That last column is what says whether the second value is where a top face would be.
 *
 * Usage: node harness/evidence/_chunks12_twotone.mjs <png> [png...]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const srcs = process.argv.slice(2);
const QUANT = +(process.env.RRR_QUANT ?? 6);
const br = await chromium.launch();
const pg = await br.newPage();
const rows = [];
for (const src of srcs) {
  const b = fs.readFileSync(src).toString('base64');
  const r = await pg.evaluate(async ([b64, Q]) => {
    const bin = atob(b64); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([arr], { type: 'image/png' }));
    const W = bmp.width, H = bmp.height;
    const c = new OffscreenCanvas(W, H);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, W, H).data;
    // the teal FAMILY, deliberately looser than the fill test so a darker core face still counts
    const isFam = (r0, g0, b0) => b0 >= 40 && b0 > r0 * 1.30 && g0 > r0 * 1.05;
    const buckets = new Map();
    let n = 0, y0 = H, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const R = d[o], G = d[o + 1], B = d[o + 2];
      if (!isFam(R, G, B)) continue;
      n++; if (y < y0) y0 = y; if (y > y1) y1 = y;
      const k = `${(R / Q) | 0}|${(G / Q) | 0}|${(B / Q) | 0}`;
      const e = buckets.get(k) || { n: 0, r: 0, g: 0, b: 0, ys: 0 };
      e.n++; e.r += R; e.g += G; e.b += B; e.ys += y;
      buckets.set(k, e);
    }
    if (n < 200) return { n, modes: [] };
    const modes = [...buckets.values()].sort((p, q) => q.n - p.n).slice(0, 6).map((e) => ({
      rgb: [Math.round(e.r / e.n), Math.round(e.g / e.n), Math.round(e.b / e.n)],
      n: e.n, pct: +(e.n / n * 100).toFixed(1),
      relY: y1 > y0 ? +((e.ys / e.n - y0) / (y1 - y0)).toFixed(2) : -1,
    }));
    /**
     * 🧱 **THE RIM AGAINST THE FILL, WHICH IS THE ONLY SPLIT THAT CAN SEE A SECTION.** A
     * histogram over the whole family is dominated by the slab's front face — the fill is two
     * orders of magnitude more pixels than the section — so the section is split off by DISTANCE
     * FROM THE BOUNDARY and binned by which way that boundary faces. "A lit top face and a
     * darker shaded side face" is a claim about orientation; one value all the way round is a
     * painted band whatever its value is.
     */
    const fam = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      if (isFam(d[o], d[o + 1], d[o + 2])) fam[y * W + x] = 1;
    }
    const near = (x, y, r) => {
      for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) return true;
        if (!fam[yy * W + xx]) return true;
      }
      return false;
    };
    const acc = () => ({ n: 0, r: 0, g: 0, b: 0 });
    const add = (a, o) => { a.n++; a.r += d[o]; a.g += d[o + 1]; a.b += d[o + 2]; };
    const fin = (a) => (a.n ? { n: a.n, rgb: [Math.round(a.r / a.n), Math.round(a.g / a.n), Math.round(a.b / a.n)] } : { n: 0, rgb: null });
    const fill = acc(), up = acc(), side = acc(), down = acc();
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
      if (!fam[y * W + x]) continue;
      const o = (y * W + x) * 4;
      if (!near(x, y, 6)) { if (!near(x, y, 26)) add(fill, o); continue; }
      let gx = 0, gy = 0;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (fam[yy * W + xx]) { gx -= dx; gy -= dy; }
      }
      const L = Math.hypot(gx, gy) || 1;
      const u = -gy / L;
      add(u > 0.45 ? down : (u < -0.45 ? up : side), o);
    }
    return { n, bbox: [y0, y1], modes, fill: fin(fill), up: fin(up), side: fin(side), down: fin(down) };
  }, [b, QUANT]);
  rows.push({ src: src.replace(/.*[\\/]/, ''), ...r });
}
await br.close();
for (const o of rows) {
  console.log(`\n${o.src}   teal-family ${o.n} px`);
  for (const m of o.modes) {
    console.log(`   (${String(m.rgb[0]).padStart(3)},${String(m.rgb[1]).padStart(3)},${String(m.rgb[2]).padStart(3)})`
      + `  ${String(m.n).padStart(7)} px  ${String(m.pct).padStart(5)}%  relY ${m.relY}`);
  }
  if (o.modes.length >= 2) {
    const [a, b2] = o.modes;
    const sep = Math.max(Math.abs(a.rgb[0] - b2.rgb[0]), Math.abs(a.rgb[1] - b2.rgb[1]), Math.abs(a.rgb[2] - b2.rgb[2]));
    console.log(`   top-2 separation: ${sep} sRGB units · second mode is ${o.modes[1].pct}% of the teal`);
  }
  if (o.fill) {
    const dl = (m) => (m.rgb && o.fill.rgb
      ? (0.299 * m.rgb[0] + 0.587 * m.rgb[1] + 0.114 * m.rgb[2]) - (0.299 * o.fill.rgb[0] + 0.587 * o.fill.rgb[1] + 0.114 * o.fill.rgb[2])
      : 0).toFixed(1);
    console.log(`   FILL   (${o.fill.rgb}) x${o.fill.n}`);
    console.log(`   rim UP-facing / sill  (${o.up.rgb}) x${o.up.n}   dLuma ${dl(o.up)}`);
    console.log(`   rim SIDE / jamb       (${o.side.rgb}) x${o.side.n}   dLuma ${dl(o.side)}`);
    console.log(`   rim DOWN-facing/soffit(${o.down.rgb}) x${o.down.n}   dLuma ${dl(o.down)}`);
  }
}
