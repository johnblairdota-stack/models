// gilt-18: HOW MUCH OF THE FRAME IS GOLD, measured the same way in both pictures.
//
// Round 18 filed "this room is more gilded than the bar" as an architectural taste call and
// therefore not actionable. That was a dodge: "more" is a number, and the same classifier run
// over both images answers it without either picture getting a different rule.
//
// ⚠ THE CLASSIFIER IS DELIBERATELY CRUDE AND IDENTICAL FOR BOTH. Gold is bright, warm, and
// ordered r > g > b with a real gap between r and b. Warm sunlit oak passes it too — but it
// passes it in BOTH pictures, and both pictures have a sunlit oak-ish floor, so the false
// positives are common-mode and the RATIO is still the answer. Reported alongside a second,
// stricter band so a reader can see whether the conclusion depends on where the line is put.
//   node harness/_gilt18.mjs <imgA> <imgB> ...
import { openCanvasPage, toDataURL } from './imglib.mjs';

const imgs = process.argv.slice(2);
const { browser, page } = await openCanvasPage();
for (const img of imgs) {
  const durl = await toDataURL(img);
  const r = await page.evaluate(async (durl) => {
    const im = new Image(); im.src = durl; await im.decode();
    const cv = document.createElement('canvas');
    cv.width = im.naturalWidth; cv.height = im.naturalHeight;
    const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0);
    const d = cx.getImageData(0, 0, cv.width, cv.height).data;
    let loose = 0, strict = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const R = d[i], G = d[i + 1], B = d[i + 2];
      n++;
      const L = 0.2126 * R + 0.7152 * G + 0.0722 * B;
      if (L < 60) continue;                         // gold in shadow is not what reads as gold
      if (!(R > G && G > B)) continue;              // the ordering
      const rb = R - B;
      if (rb > 0.22 * L && rb < 0.85 * L) loose++;  // warm but not red — an upper bound keeps
      if (rb > 0.32 * L && rb < 0.75 * L) strict++; // the red drapes out of it
    }
    // ---- AND THE SHAPE OF IT, WHICH IS THE PART THE AREA NUMBER MISSES ------------------
    // Two frames can carry the same amount of gold and not look remotely alike: the bar's is
    // broad soft sunlit stone, and a suspicion worth testing is that this room's is thin hard
    // LINES — cornice, coffer ribs, beads, frames. Perimeter over area separates those. A
    // large blob has a low ratio; a one-pixel line has a ratio near 2, because almost every
    // pixel in it is on its own edge.
    const W = cv.width, H = cv.height;
    const isGold = new Uint8Array(W * H);
    for (let p = 0; p < W * H; p++) {
      const i = p * 4, R = d[i], G = d[i + 1], B = d[i + 2];
      const L = 0.2126 * R + 0.7152 * G + 0.0722 * B;
      const rb = R - B;
      isGold[p] = (L >= 60 && R > G && G > B && rb > 0.32 * L && rb < 0.75 * L) ? 1 : 0;
    }
    let edge = 0;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const p = y * W + x;
        if (!isGold[p]) continue;
        if (!isGold[p - 1] || !isGold[p + 1] || !isGold[p - W] || !isGold[p + W]) edge++;
      }
    }
    return { loose: +(100 * loose / n).toFixed(2), strict: +(100 * strict / n).toFixed(2),
      edgeRatio: strict ? +(edge / strict).toFixed(3) : 0, n };
  }, durl);
  console.log(`${img.split('/').pop().padEnd(26)} gold-ish ${String(r.loose).padStart(6)}%   strict ${String(r.strict).padStart(6)}%   perim/area ${String(r.edgeRatio).padStart(6)}`);
}
await browser.close();
