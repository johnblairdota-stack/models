/*
 * builder-hubs2: IS THE INJECTED SHELL MATERIAL STILL DARKENING NON-SKINNED KIT PARTS?
 *
 * `_hubs1-ablate.mjs` established the defect by cloning the fixture's material (which drops
 * `onBeforeCompile`, so the RRW body injection goes with it) and reading the delivered pixel
 * back. This probe is the same measurement pointed at the QUESTION THAT REMAINS: with the
 * skinning varyings initialised in the vertex shader, does a plain THREE.Mesh wearing the
 * SHARED injected shell material still render dark?
 *
 * Three readings per part, in one page session, same pixel, same frame budget:
 *   own      the material the part ships with today
 *   clone    that material cloned  -> un-injected  -> the "after clone" column of _hubs1
 *   shared   the body's own shell material -> injected, and what we want to hand it back to
 *
 * If the upstream fix works, `shared` == `clone` to within a point or two. If it does not,
 * `shared` sits ~130 below on the shell bosses, which is the original defect.
 *
 * ⚠️ THE URL BELOW STILL CARRIES ?fixinject=1. That knob existed only while mesh-identity.js
 * was handing the fixtures an un-injected clone; it was deleted with the workaround on
 * 2026-08-17, so the flag is now inert and these probes read the SHIPPING path.
 *
 * usage: node harness/evidence/_hubs2-varying.mjs [port] [azim] [name,name,...] [extra&query]
 *
 * `?rseamfit=0` is the extra query that matters now: it restores the seam network's one-cell
 * clamp on parts smaller than a plate, i.e. it is the picture of the defect.
 */
import { chromium } from 'playwright';

const PORT = process.argv[2] ?? '5192';
const AZIM = process.argv[3] ?? '0';
const NAMES = (process.argv[4] ?? 'capFixtureFR,capFixtureFL,earDiscR,earDiscL,elbowActOL,elbowActOR')
  .split(',').filter(Boolean);
const EXTRA = process.argv[5] ? `&${process.argv[5]}` : '';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`http://localhost:${PORT}/?view=mesh.animated&capture=1&solo=1&clip=merged`
  + `&anim=Alert&label=0&azim=${AZIM}${EXTRA}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__rrr?.engine || window.__rrrError, null, { timeout: 180000 });
await page.evaluate(() => window.__rrr.settle(30));

const r = await page.evaluate(async (names) => {
  const e = window.__rrr.engine;
  const found = new Map();
  let body = null;
  e.scene.traverse((o) => {
    if (names.includes(o.name)) found.set(o.name, o);
    if (o.isSkinnedMesh && !body) body = o;
  });
  if (!body) return { err: 'no SkinnedMesh in the scene' };

  const cam = e.camera;
  const W = e.canvas.width, H = e.canvas.height;
  const c2 = document.createElement('canvas');
  c2.width = W; c2.height = H;
  const g2 = c2.getContext('2d', { willReadFrequently: true });

  const readAt = (cx, cy) => {
    window.__rrr.redraw();
    g2.clearRect(0, 0, W, H);
    g2.drawImage(e.canvas, 0, 0);
    const R = 4;
    const d = g2.getImageData(cx - R, cy - R, R * 2, R * 2).data;
    let a = 0, b = 0, c = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { a += d[i]; b += d[i + 1]; c += d[i + 2]; n++; }
    return [a / n, b / n, c / n].map(v => Math.round(v));
  };

  const out = { parts: {}, missing: names.filter(n => !found.has(n)) };
  for (const [name, o] of found) {
    const p = o.getWorldPosition(new (cam.position.constructor)());
    const s = p.clone().project(cam);
    const cx = Math.round((s.x * 0.5 + 0.5) * W), cy = Math.round((-s.y * 0.5 + 0.5) * H);
    if (cx < 8 || cy < 8 || cx > W - 8 || cy > H - 8) { out.parts[name] = { offscreen: [cx, cy] }; continue; }
    const own = o.material;
    const rec = { px: [cx, cy], mat: own.name || '(unnamed)', own: readAt(cx, cy) };
    // un-injected control: Material.copy does not carry onBeforeCompile
    const plain = own.clone();
    o.material = plain; rec.clone = readAt(cx, cy);
    // the shared, injected shell the body itself wears
    o.material = body.material; rec.shared = readAt(cx, cy);
    o.material = own; rec.back = readAt(cx, cy);
    rec.sharedMinusClone = rec.shared.map((v, i) => v - rec.clone[i]);
    out.parts[name] = rec;
  }
  out.bodyMat = body.material.name || '(unnamed)';
  return out;
}, NAMES);

await browser.close();
console.log(`azim=${AZIM}`);
console.log(JSON.stringify(r, null, 1));
