// gilt-dust-44: SWEEP THE GILT'S OWN DESATURATION IN ONE BOOT, AND MEASURE THE LADDER'S SLOPE.
//
// Round 18 closed with one complaint that no global term can touch: *"the chroma ladder is a
// RAMP where the bar's is FLAT … every global term ROTATES the ladder, because a global term
// cannot change a slope. The two instruments that could are the tonemapper and per-material
// work."* Deciles 2-3 measure 0.90 / 0.57 against the bar's 0.41 / 0.38, and `GILT_SURFACE` has
// two lines that make dark saturated pixels by construction — the tarnish (`uGold * 0.42`,
// luminance 0.234, chroma 0.76) and the bole showing through the rub (chroma 0.76).
//
// ⚠ ONE BOOT, NOT N. A cold boot of this view costs ~10 minutes on this box's software
// rasteriser, so a four-value sweep run the obvious way is most of an hour and the four bakes
// are not even the expensive part. `giltMat` is re-called IN THE PAGE and its maps swapped onto
// the meshes already in the scene: same house, same lights, same camera, one variable.
//
//   node harness/_giltdust44.mjs <v1> <v2> ...        (e.g. 0 0.35 0.6 0.85)
import { chromium } from 'playwright';
import fs from 'node:fs';
import net from 'node:net';
const PORT = 5178;
const VALUES = process.argv.slice(2).map(Number);
if (!VALUES.length) { console.error('usage: _giltdust44.mjs <v1> <v2> ...'); process.exit(2); }
const portOpen = (p) => new Promise((r) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false));
});
if (!(await portOpen(PORT))) { console.error('vite not running on 5178'); process.exit(3); }
const b = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.log('[E]', String(e).slice(0, 240)));
await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1`, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
  null, { timeout: 900000 });
await page.evaluate(() => window.__rrr.settle(8));
fs.mkdirSync('out', { recursive: true });
for (const v of VALUES) {
  const info = await page.evaluate(async (v) => {
    const m = await import('/src/world/materials-local.js');
    // the SAME cached objects the view took its table from — `estateMaterials()` is a
    // process-wide cache, so this is identity, not a lookalike.
    const mats = await m.estateMaterials();
    const olds = [mats.gilt, mats.giltFrieze];
    const news = [
      m.giltMat({ bakeDust: v }),
      m.giltMat({ ornament: 1, wear: 0.42, seed: 9.0, leaf: 9, bakeDust: v }),
    ];
    /**
     * ⚠ **FIND THE SLOTS ONCE AND REMEMBER THEM.** Matching on the map is right — `room-ballroom.js`
     * `.clone()`s the gilt for its `?cap=` and `?bead=` ablations, so an identity test alone
     * leaves those meshes on the old bake — but it only works on the FIRST pass: once a slot has
     * been repointed its `map` is the new one and the old-map test never matches again. The first
     * run of this sweep reported "swapped 3 / 2 / 0 / 0" and its last two variants were pictures
     * of the second value, which is the class of silent wrong number this project keeps paying
     * for. The slot list is captured once and reused.
     */
    const e = window.__rrr.engine;
    if (!window.__gilt44) {
      const slots = [];
      e.scene.traverse((o) => {
        if (!(o.isMesh || o.isInstancedMesh)) return;
        const list = Array.isArray(o.material) ? o.material : [o.material];
        for (const mat of list) {
          if (!mat) continue;
          const k = olds.findIndex((old) => old === mat || (old.map && old.map === mat.map));
          if (k >= 0) slots.push({ mat, k });
        }
      });
      window.__gilt44 = slots;
    }
    let swapped = 0;
    for (const { mat, k } of window.__gilt44) {
      const src = news[k];
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) {
        if (src[key]) mat[key] = src[key];
      }
      mat.needsUpdate = true;
      swapped++;
    }
    window.__rrr.redraw();
    return { swapped };
  }, v);
  const buf = await page.locator('canvas').first().screenshot();
  const out = `out/_gilt44-${String(v).replace('.', 'p')}.png`;
  fs.writeFileSync(out, buf);
  console.log(`  bakeDust ${v}: swapped ${info.swapped} material slots -> ${out}`);
}
await b.close();
