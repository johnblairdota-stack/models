// mat-owner-1: read the BAKED tiles straight off the render target and write them out.
// The only honest way to ask "is the ornament actually in the texture, or is the render
// hiding it?" — HANDOFF's dominant defect class is "present and suppressed".
// Usage: node _mat1_dumpbake.mjs <view> <outDir> [keySubstring]
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const PORT = 5178;
const VIEW = process.argv[2] || 'mat.brass';
const OUT = process.argv[3];
const FILTER = process.argv[4] || '';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-frame-rate-limit',
    '--force-device-scale-factor=1', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
await page.goto(`http://127.0.0.1:${PORT}/?view=${VIEW}&capture=1`, { waitUntil: 'load', timeout: 45000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 240000 });

const dumps = await page.evaluate((filter) => {
  const e = window.__rrr.engine;
  const seen = new Map();
  e.scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m?.userData?.bake && !seen.has(m.name)) seen.set(m.name, m.userData.bake);
    }
  });
  const r = e.renderer;
  const out = [];
  for (const [name, bake] of seen) {
    if (filter && !name.includes(filter)) continue;
    const size = bake.size;
    const cv = document.createElement('canvas');
    cv.width = size * 3; cv.height = size;
    const ctx = cv.getContext('2d');
    const buf = new Uint8Array(size * size * 4);
    for (let i = 0; i < 3; i++) {
      // ⚠️ arg 7 is activeCubeFaceIndex, arg 8 is textureIndex. Passing the MRT attachment
      // as arg 7 silently returns attachment 0 three times — it looked like "the ORM and the
      // normal map are copies of the albedo", which is not a thing that can happen.
      r.readRenderTargetPixels(bake._rt, 0, 0, size, size, buf, undefined, i);
      const img = ctx.createImageData(size, size);
      // readRenderTargetPixels is bottom-up; flip so the tile reads the right way up
      for (let y = 0; y < size; y++) {
        const src = (size - 1 - y) * size * 4;
        img.data.set(buf.subarray(src, src + size * 4), y * size * 4);
      }
      for (let p = 3; p < img.data.length; p += 4) img.data[p] = 255;
      ctx.putImageData(img, i * size, 0);
    }
    out.push({ name, size, dataUrl: cv.toDataURL('image/png') });
  }
  return out;
}, FILTER);

for (const [i, d] of dumps.entries()) {
  // names differ only past 60 chars (three giltBronze instances) — index or they clobber
  const file = path.join(OUT, String(i).padStart(2, '0') + '_' + d.name.replace(/[^a-z0-9]+/gi, '_').slice(0, 56) + '.png');
  await writeFile(file, Buffer.from(d.dataUrl.split(',')[1], 'base64'));
  console.log('wrote', file, `(albedo | ORM | normal+h, ${d.size}px each)`);
}
await browser.close();
