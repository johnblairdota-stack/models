#!/usr/bin/env node
/**
 * MEASURE THE VISOR AND THE SHOULDER CAPS ON THE ART, then on our render.
 *
 *   node harness/_kit7_artratio.mjs <render.png>
 *
 * WHY, AND WHY THE PREVIOUS NUMBER WAS WRONG. The visor was scaled to 0.7835 of head width, taken
 * from the procedural build. John's read is that the result is comedically small, and he is right
 * — the ratio was measured with MISMATCHED DENOMINATORS, the exact trap the handoff warns about:
 *
 *     donor head width  = a side raycast AT THE VISOR'S OWN HEIGHT
 *     mesh head width   = the skull's WIDEST point, anywhere
 *
 * Those are not the same quantity. The donor's skull is widest above the visor, so its "head
 * width" came out too small, which made the ratio too small, which was then applied to the mesh's
 * genuinely-widest measurement. Two errors compounding in the same direction.
 *
 * So stop borrowing the ratio and measure the AUTHORITY: `assets/mv/player/baseline_front.png`.
 * Both numerator and denominator come off one image, by colour, in one pass.
 *
 * ⚠️ SWEEP THE THRESHOLD. A single colour cut prints a complete, plausible, wrong table. Every
 * quantity below is reported at three cuts and only agreement across them is quoted.
 */
import path from 'node:path';
import { toDataURL, openCanvasPage, ROOT } from './imglib.mjs';

const renderArg = process.argv[2];
const ART = 'assets/mv/player/baseline_front.png';

const { browser, page } = await openCanvasPage();

const measure = async (file, label) => {
  const url = await toDataURL(file);
  const r = await page.evaluate(async ({ url }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const at = (x, y) => {
      const i = (y * c.width + x) * 4;
      return [d[i], d[i + 1], d[i + 2], d[i + 3]];
    };

    /** Bounding box of every pixel passing `fn`, plus a per-row width profile. */
    const boxOf = (fn) => {
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, n = 0;
      const rows = new Map();
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          const p = at(x, y);
          if (!fn(p, x, y)) continue;
          n++;
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
          const e = rows.get(y) ?? [1e9, -1e9, 0];
          e[0] = Math.min(e[0], x); e[1] = Math.max(e[1], x); e[2]++;
          rows.set(y, e);
        }
      }
      if (!n) return null;
      return { n, x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1,
        rows: [...rows.entries()].map(([y, e]) => ({ y, x0: e[0], x1: e[1], w: e[1] - e[0] + 1 })) };
    };

    /*
     * FIGURE MASK. The art is on white/transparent, so alpha plus a departure from paper works.
     * A RENDER must be shot on a flat chroma (`?bg=ff00ff`) — the studio's default background is
     * a pale grey SWEEP, and a "not background" test against one corner pixel then selects the
     * whole frame. That is not hypothetical: the first run of this probe reported the render's
     * figure as 1920 px wide, and every ratio computed from it was meaningless.
     */
    const bg = at(2, 2);
    const isChroma = (p) => p[0] > 150 && p[2] > 150 && p[1] < 110;
    const chromaShot = isChroma(bg);
    const isFig = chromaShot
      ? (p) => p[3] > 40 && !isChroma(p)
      : (p) => p[3] > 40 && (Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > 24);
    const fig = boxOf(isFig);

    // VISOR — blue. Blue clearly exceeds red, and it is the only such region on the figure.
    // MINT CAPS — green exceeds both red and blue.
    const out = { fig, visor: {}, mint: {} };
    /*
     * ⚠️ SWEEP THE CUT UNTIL IT PLATEAUS, ON BOTH IMAGES SEPARATELY. The art is a photo-real
     * render on white and its body is faintly blue; OUR render is lit by a cool studio and its
     * WHITE SHELL is blue-tinted too. At b-r > 26 the render's "visor" measured 290 px tall on a
     * 937 px figure — a third of the character — because it had swallowed the torso. Neither
     * image has one correct threshold known in advance; what is trustworthy is the range over
     * which the measurement STOPS MOVING, and that range is different for each image.
     */
    /*
     * ⚠️ AND RESTRICT IT TO THE HEAD. The CHEST WORDMARK is navy — far bluer than the visor — so
     * an unrestricted blue mask returns one box enclosing BOTH, and its height (247 px of a 937 px
     * figure) is the distance from the eyes to the sternum. Above b-r > 80 only the wordmark
     * survives and the "visor" is 95 px wide: a clean, stable, completely wrong plateau.
     *
     * 0.24 of figure height below the crown clears the head on both images and reaches neither
     * chest mark. It is a band, not a threshold, so it does not need its own sweep.
     */
    const headCut = fig.y0 + fig.h * 0.24;
    out.sweep = {};
    for (const cut of [20, 30, 40, 50, 60, 70, 80, 90, 100, 120]) {
      const v = boxOf((p, x, y) => isFig(p) && y < headCut && p[2] - p[0] > cut && p[2] - p[1] > cut * 0.25);
      out.sweep[cut] = v ? { w: v.w, h: v.h, y0: v.y0, y1: v.y1, x0: v.x0, x1: v.x1 } : null;
    }

    const mid = (fig.x0 + fig.x1) / 2;
    for (const cut of [16, 26, 36]) {
      out.visor[cut] = boxOf((p) => isFig(p) && p[2] - p[0] > cut);
      const isMint = (p) => isFig(p) && p[1] - p[0] > cut * 0.5 && p[1] - p[2] > cut * 0.2;
      out.mint[cut] = boxOf(isMint);
      // Each cap on its own. Together they only give the outer span, which cannot say where a
      // cap STARTS — and "starts too low, ends too far out" is exactly the complaint.
      out[`mintL${cut}`] = boxOf((p) => isMint(p)) && null;
    }
    // Split by side using a per-pixel x test, which boxOf cannot express on its own.
    out.sides = {};
    for (const cut of [26, 36]) {
      const isMint = (p) => isFig(p) && p[1] - p[0] > cut * 0.5 && p[1] - p[2] > cut * 0.2;
      for (const [name, keep] of [['L', (x) => x < mid], ['R', (x) => x >= mid]]) {
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, n = 0;
        for (let y = 0; y < c.height; y++) {
          for (let x = 0; x < c.width; x++) {
            if (!keep(x) || !isMint(at(x, y))) continue;
            n++;
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
        }
        out.sides[`${name}${cut}`] = n ? { x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, n } : null;
      }
    }
    out.mid = mid;
    return out;
  }, { url });

  const F = r.fig;
  console.log(`\n  ===== ${label} =====  ${path.basename(file)}`);
  console.log(`  figure  x ${F.x0}..${F.x1} (${F.w})   y ${F.y0}..${F.y1} (${F.h})`);

  /*
   * HEAD WIDTH, measured the SAME WAY for both images and swept: the widest row of the figure
   * within the head's own vertical band. The band is taken from the visor, so it cannot drift
   * onto the shoulders — which is what would happen with a fixed fraction of figure height.
   */
  for (const cut of [16, 26, 36]) {
    const v = r.visor[cut];
    const m = r.mint[cut];
    if (!v) { console.log(`  cut ${cut}: no visor found`); continue; }
    const band = F.rows.filter((row) => row.y >= v.y0 - v.h * 0.35 && row.y <= v.y1 + v.h * 0.15);
    const headW = Math.max(...band.map((row) => row.w));
    console.log(`  cut ${cut}  visor ${String(v.w).padStart(4)} x ${String(v.h).padStart(4)} px  ` +
      `head ${String(headW).padStart(4)} px  ->  VISOR/HEAD ${(v.w / headW).toFixed(4)}  ` +
      `visorH/headBand ${(v.h / (v.y1 - v.y0 + 1)).toFixed(3)}`);
    if (m) {
      // Cap height as a fraction of figure height, measured from the CROWN downward — the only
      // landmark both images share that does not depend on the pose of the legs.
      const capTop = (m.y0 - F.y0) / F.h;
      const capBot = (m.y1 - F.y0) / F.h;
      console.log(`          mint caps y ${m.y0}..${m.y1}  = ${capTop.toFixed(4)}..${capBot.toFixed(4)} ` +
        `of figure height below crown   width ${m.w} px  (${(m.w / F.w).toFixed(3)} of span)`);
    } else {
      console.log('          mint caps: none found');
    }
  }
  /*
   * PER-CAP GEOMETRY, expressed in the two units that transfer to a 3D character: fractions of
   * FIGURE HEIGHT below the crown (vertical), and fractions of the figure's HALF-SPAN measured
   * from the centre line (horizontal). Both are pose-independent for a symmetric standing figure.
   */
  /*
   * THE PLATEAU TABLE. Read down the `w` column: where consecutive rows agree to a few px, the
   * measurement has stopped depending on the threshold and that value is the visor. Where it is
   * still falling fast, the mask is still shedding body pixels.
   */
  console.log('  visor by colour cut — look for where w and h stop moving:');
  for (const [cut, s] of Object.entries(r.sweep ?? {})) {
    if (!s) { console.log(`    b-r>${String(cut).padStart(3)}   (nothing)`); continue; }
    const band = F.rows.filter((row) => row.y >= s.y0 - s.h * 0.35 && row.y <= s.y1 + s.h * 0.15);
    const headW = band.length ? Math.max(...band.map((row) => row.w)) : 0;
    console.log(`    b-r>${String(cut).padStart(3)}   w ${String(s.w).padStart(4)}  h ${String(s.h).padStart(4)}` +
      `  y ${String(s.y0).padStart(4)}..${String(s.y1).padStart(4)}   head ${String(headW).padStart(4)}` +
      `   visor/head ${headW ? (s.w / headW).toFixed(4) : '----'}`);
  }

  /*
   * THE HEAD'S OWN WIDTH PROFILE. "Head width" is the denominator of the visor ratio, and on THIS
   * character it is not the skull — the ear discs stand proud of it, and a disc that protrudes
   * further than the art's inflates the denominator and makes a correctly-sized visor read small.
   * Printing the profile shows the skull and the ear bumps as separate features instead of one
   * number that silently mixes them.
   */
  console.log('  head width profile (row width, every 4th row from the crown):');
  const headRows = F.rows.filter((row) => row.y < F.y0 + F.h * 0.24);
  const strip = headRows.filter((_, i) => i % 4 === 0);
  const wMax = Math.max(...headRows.map((row) => row.w));
  for (const row of strip) {
    const bar = '#'.repeat(Math.round((row.w / wMax) * 46));
    console.log(`    y ${String(row.y).padStart(4)}  ${String(row.w).padStart(4)} px  ${bar}`);
  }
  console.log(`    head max ${wMax} px = ${(wMax / F.h).toFixed(4)} of figure height\n`);

  console.log('  per-cap, as fractions of figure height below crown and of half-span from centre:');
  for (const [k, s] of Object.entries(r.sides ?? {})) {
    if (!s) { console.log(`    ${k}: none`); continue; }
    const halfSpan = F.w / 2;
    const inner = Math.min(Math.abs(s.x0 - r.mid), Math.abs(s.x1 - r.mid)) / halfSpan;
    const outer = Math.max(Math.abs(s.x0 - r.mid), Math.abs(s.x1 - r.mid)) / halfSpan;
    console.log(`    ${k}  yTop ${((s.y0 - F.y0) / F.h).toFixed(4)}  yBot ${((s.y1 - F.y0) / F.h).toFixed(4)}` +
      `  height ${(s.h / F.h).toFixed(4)} H   x inner ${inner.toFixed(4)} outer ${outer.toFixed(4)} of half-span` +
      `   w ${s.w}px h ${s.h}px`);
  }
  return r;
};

await measure(ART, 'ART — baseline_front');
if (renderArg) await measure(renderArg, 'OUR RENDER');

await browser.close();
console.log('');
