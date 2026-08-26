// eye-sweep-17: which mesh paints these pixels? A live raycast through the capture camera.
//   node harness/_eye17_pick.mjs --cam eye.arch --px 368,300 --px 585,300
// `_tmp_geoprobe.mjs --pick` answers the same question but serves dist/, so it needs a build
// first; this one goes through the running dev server the rest of this round's tools use.
import { chromium } from 'playwright';
import net from 'node:net';
const PORT = 5178;
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const CAM = opt('cam', 'eye.arch');
const PX = argv.reduce((a, v, i) => (v === '--px' ? [...a, argv[i + 1].split(',').map(Number)] : a), []);
const portOpen = (p) => new Promise((res) => { const s = net.connect(p, '127.0.0.1'); s.on('connect', () => { s.destroy(); res(true); }); s.on('error', () => res(false)); });
if (!(await portOpen(PORT))) { console.error('vite not running on 5178'); process.exit(3); }
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--force-device-scale-factor=1', '--hide-scrollbars'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
// `--keysplit` boots the view with every gilt sub-key in its own bin bucket, so the answer to
// "which gilt is that" is a name rather than the word "gilt" — see the note at `?keysplit=` in
// the view. Costs three draw calls and is a diagnostic only.
const KS = argv.includes('--keysplit') ? '&keysplit=1' : '';
await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1&cam=${CAM}${KS}`, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 600000 });
await page.evaluate((n) => window.__rrr.settle(n), 12);
const out = await page.evaluate(async (pts) => {
  const T = await import('/node_modules/three/build/three.module.js');
  const e = window.__rrr.engine;
  const rc = new T.Raycaster();
  // ⚠ THRESHOLDS, OR THIN PRIMITIVES ARE INVISIBLE TO THIS TOOL AND IT LIES CONFIDENTLY.
  // A Raycaster tests Points and Line geometry against a DISTANCE THRESHOLD that defaults to 1
  // for Points and 1 for Lines in world units — which sounds generous but is applied in the
  // ray's own space, and a hair-thin crystal string or a chain link routinely falls outside it.
  // The tool then reports the WALL BEHIND, which is exactly how round 18 spent four probes
  // hiding the grime, the crystal, the chandeliers, the dust and the shafts looking for
  // something the raycast had already told it was "the wall".
  rc.params.Points.threshold = 0.05;
  rc.params.Line.threshold = 0.05;
  rc.params.Line2 = { threshold: 0.05 };
  rc.params.Sprite = {};
  const v = new T.Vector2();
  return pts.map(([px, py]) => {
    v.set((px / 1920) * 2 - 1, -((py / 1080) * 2 - 1));
    rc.setFromCamera(v, e.camera);
    // Points have a raycast THRESHOLD, so the dust motes report a hit at distance 0 for any
    // ray that passes near one — which is every ray in a room with 900 of them. Additive decals
    // are not what painted the pixel either. Both are skipped so the answer is the SOLID.
    const hits = rc.intersectObject(e.scene, true).filter((h) => h.object.visible
      && !h.object.isPoints && !/^(dust|glow|light-shaft|light-pool)$/.test(h.object.name || ''));
    // ⚠ THE WORLD POINT AND THE FACE, NOT JUST THE BUCKET NAME. Round 18 spent five probes
    // asking "which gilt is that" and getting the answer "gilt", because `GeoBin` merges by
    // MATERIAL and the name of the mesh is therefore the name of the material — it cannot
    // distinguish a cornice from a window architrave from a drapery pole. A world coordinate
    // can: it is looked up against the source, and there is exactly one thing at any given
    // (x, y, z). The face normal says which way the surface points, which separates a
    // horizontal member from a vertical one at the same height.
    const f = (v) => [v.x, v.y, v.z].map((n) => +n.toFixed(2));
    return {
      px, py,
      hits: hits.slice(0, 3).map((h) => ({
        name: h.object.name || h.object.type,
        d: +h.distance.toFixed(2),
        at: f(h.point),
        n: h.face ? f(h.face.normal.clone().transformDirection(h.object.matrixWorld)) : null,
        tris: h.object.geometry?.index
          ? h.object.geometry.index.count / 3
          : (h.object.geometry?.attributes?.position?.count ?? 0) / 3,
      })),
    };
  });
}, PX);
for (const r of out) {
  console.log(`(${r.px},${r.py})`);
  for (const h of r.hits) {
    console.log(`    ${h.name.padEnd(12)} d ${String(h.d).padStart(6)}  at ${JSON.stringify(h.at).padEnd(24)} normal ${JSON.stringify(h.n)}  (${h.tris} tris in bucket)`);
  }
}
await browser.close();
