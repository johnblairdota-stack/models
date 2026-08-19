/**
 * TEMP PROBE — measure the ACTUAL PIXELS of a strobe A/B sheet.
 *
 * Answers, per panel, in pixels: where is the drawn floor line, and where is the lowest
 * pixel of the figure? A planted foot at z = 0.55 projects ~15 px BELOW the drawn back-edge
 * line (the view's own comment says so); a floating foot rises toward it and crosses it.
 *
 *   node harness/_tmp_strobe_px.mjs progress/shots/loco-ab3/limp-variantA.png [--dump]
 */
import { toDataURL, openCanvasPage } from './imglib.mjs';

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const dump = process.argv.includes('--dump');

const { browser, page } = await openCanvasPage();

async function load(file) {
  const url = await toDataURL(file);
  return page.evaluate(async (u) => {
    const im = new Image();
    im.src = u;
    await im.decode();
    const c = new OffscreenCanvas(im.width, im.height);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, im.width, im.height).data;
    return { w: im.width, h: im.height, data: Array.from(d) };
  }, url);
}

// panel centres, from the view: stand.x = (i - 2.5) * 1.28, camera (0,1.36,12.4), fov 26,
// target (0,0.80,0.55). Computed rather than eyeballed.
function panelCentres(w, h) {
  const camY = 1.36, camZ = 12.4, tgtY = 0.80, tgtZ = 0.55;
  const fov = 26 * Math.PI / 180;
  const aspect = w / h;
  // camera basis: forward from cam to target
  const fy = tgtY - camY, fz = tgtZ - camZ;
  const fl = Math.hypot(fy, fz);
  const F = [0, fy / fl, fz / fl];
  const U = [0, -F[2], F[1]];        // right-handed up in the YZ plane
  const R = [1, 0, 0];
  const tanH = Math.tan(fov / 2);
  return { proj(px, py, pz) {
    const d = [px - 0, py - camY, pz - camZ];
    const zc = d[0] * F[0] + d[1] * F[1] + d[2] * F[2];      // depth (positive in front)
    const xc = d[0] * R[0] + d[1] * R[1] + d[2] * R[2];
    const yc = d[0] * U[0] + d[1] * U[1] + d[2] * U[2];
    const ndcX = (xc / zc) / (tanH * aspect);
    const ndcY = (yc / zc) / tanH;
    return [(ndcX * 0.5 + 0.5) * w, (0.5 - ndcY * 0.5) * h];
  } };
}

for (const file of files) {
  const img = await load(file);
  const { w, h, data } = img;
  const at = (x, y) => { const i = (y * w + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  const luma = (x, y) => { const c = at(x, y); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const P = panelCentres(w, h);

  // --- geometric predictions
  const yLine = P.proj(0, 0.0015, -0.11)[1];       // the drawn back edge
  const yPlant = P.proj(0, 0, 0.55)[1];            // sole ON the floor at the stand's z
  const mmPerPx = (() => {
    const a = P.proj(0, 0, 0.55)[1], b = P.proj(0, 0.100, 0.55)[1];
    return 100 / (a - b);                          // mm of world height per pixel
  })();

  if (dump) {
    // calibrate: a vertical strip in the gap between panels 3 and 4 (image centre)
    console.log(`# ${file}  ${w}x${h}`);
    console.log(`# predicted: back-edge line y=${yLine.toFixed(1)}  planted sole y=${yPlant.toFixed(1)}  ${mmPerPx.toFixed(2)} mm/px`);
    for (let y = Math.round(yLine) + 6; y < Math.round(yLine) + 30; y += 1) {
      console.log(`   y=${y}  ${at(960, y).join(',')}   ${at(200, y).join(',')}`);
    }
    continue;
  }

  // --- find the drawn floor line empirically: the darkest row in a gap column band
  const gapX = [];
  for (let i = 0; i < 5; i++) {
    const a = P.proj((i - 2.5) * 1.28, 0, 0.55)[0], b = P.proj((i - 1.5) * 1.28, 0, 0.55)[0];
    gapX.push(Math.round((a + b) / 2));
  }
  let bestY = 0, bestL = 1e9;
  for (let y = Math.round(yLine) - 25; y < Math.round(yLine) + 25; y++) {
    let s = 0;
    for (const x of gapX) s += luma(x, y);
    if (s < bestL) { bestL = s; bestY = y; }
  }

  console.log(`\n# ${file}`);
  console.log(`#   drawn floor line: predicted y=${yLine.toFixed(1)}  measured y=${bestY}` +
    `   planted-sole y=${yPlant.toFixed(1)} (${(yPlant - bestY).toFixed(1)} px below the line)   ${mmPerPx.toFixed(2)} mm/px`);
  console.log('   panel   lowestFigurePx   vs planted-sole   implied sole height');
  const out = [];
  for (let i = 0; i < 6; i++) {
    const cx = P.proj((i - 2.5) * 1.28, 0, 0.55)[0];
    const x0 = Math.max(0, Math.round(cx - 118)), x1 = Math.min(w - 1, Math.round(cx + 118));
    /*
     * BACKGROUND-RELATIVE, not a fixed threshold. Above the floor line the background is
     * near-white cyc and the figure is also near-white, so a brightness threshold finds the
     * cyc and reports the line itself as the foot. The background is a smooth vertical
     * gradient that is constant across a row, so the row MEDIAN inside the band is the
     * background and anything that departs from it is the figure — which works identically
     * on both sides of the line. Validated by breaking it: see --selftest.
     */
    let low = null;
    const row = new Float64Array(x1 - x0 + 1);
    for (let y = h - 1; y > 60; y--) {
      for (let x = x0; x <= x1; x++) row[x - x0] = luma(x, y);
      const sorted = Array.from(row).sort((a, b) => a - b);
      const med = sorted[sorted.length >> 1];
      let n = 0;
      for (let x = x0; x <= x1; x++) if (Math.abs(luma(x, y) - med) > 18) n++;
      if (n >= 3) { low = y; break; }
    }
    if (low === null) { console.log(`   ${i + 1}(i=${i})   none found`); continue; }
    const dy = low - yPlant;                     // +ve = below the planted line = sunk
    out.push(-dy * mmPerPx);
    console.log(`   ${i + 1}(i=${i})   y=${String(low).padStart(4)}` +
      `        ${(dy >= 0 ? '+' : '') + dy.toFixed(1).padStart(6)} px` +
      `      ${(-dy * mmPerPx).toFixed(1).padStart(7)} mm   ` +
      `${low < bestY ? 'ABOVE THE DRAWN FLOOR LINE' : ''}`);
  }
}

await browser.close();
