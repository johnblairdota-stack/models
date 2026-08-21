/*
 * builder-hubs: WHICH INPUT IS DARKENING THE SHOULDER FIXTURE. One page session, one material
 * channel disabled at a time, the delivered pixel read back after each.
 *
 * WHY ABLATION AND NOT ANOTHER GUESS. Four explanations have been measured and killed:
 *   shape      rewritten twice (cylinder -> dome), no change
 *   burial     `?fixboss` 8/14/19 mm — the dark circle GROWS and stays flat, so it is exposed
 *   shadowing  `?fixcast=0&fixrecv=0` renders pixel-identical
 *   albedo/ORM `_hubs1-shellmap.mjs` — luma 237 across the whole map, ORM identical to the plate
 * The part is fully exposed, correctly placed (`_hubs1-where.mjs` projects it onto the dark
 * circle), and made of the same measured material as the white plate beside it. So the remaining
 * suspect is a channel that behaves differently on THIS geometry than on the body — and the way
 * to find it is to switch each one off and look, not to reason about it.
 *
 * `material.clone()` is what makes this possible without importing THREE into the page.
 *
 * usage: node harness/evidence/_hubs1-ablate.mjs [port]
 */
import { chromium } from 'playwright';

const PORT = process.argv[2] ?? '5192';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`http://localhost:${PORT}/?view=mesh.animated&capture=1&solo=1&clip=merged&anim=Alert&label=0&azim=0`,
  { waitUntil: 'load' });
await page.waitForFunction(() => window.__rrr?.engine || window.__rrrError, null, { timeout: 180000 });
await page.evaluate(() => window.__rrr.settle(30));

const r = await page.evaluate(async () => {
  const e = window.__rrr.engine;
  let fix = null, body = null, mint = null;
  e.scene.traverse((o) => {
    if (o.name === 'capFixtureFR') fix = o;
    if (o.name === 'mintCapR') mint = o;
    if (o.isSkinnedMesh && !body) body = o;
  });
  if (!fix) return { err: 'capFixtureFR missing' };

  const cam = e.camera;
  const W = e.canvas.width, H = e.canvas.height;
  const p = fix.getWorldPosition(new (cam.position.constructor)());
  const s = p.clone().project(cam);
  const cx = Math.round((s.x * 0.5 + 0.5) * W), cy = Math.round((-s.y * 0.5 + 0.5) * H);

  const c2 = document.createElement('canvas');
  c2.width = W; c2.height = H;
  const g2 = c2.getContext('2d', { willReadFrequently: true });

  const readPatch = () => {
    window.__rrr.redraw();
    g2.clearRect(0, 0, W, H);
    g2.drawImage(e.canvas, 0, 0);
    const R = 5;
    const d = g2.getImageData(cx - R, cy - R, R * 2, R * 2).data;
    let a = 0, b = 0, c = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { a += d[i]; b += d[i + 1]; c += d[i + 2]; n++; }
    return [a / n, b / n, c / n].map(v => Math.round(v));
  };

  const base = fix.material;
  const out = { px: [cx, cy], variants: {} };
  out.variants.baseline = readPatch();

  const tryIt = (label, mutate) => {
    const m = base.clone();
    try { mutate(m); } catch (err) { out.variants[label] = 'mutate failed: ' + err; return; }
    fix.material = m;
    out.variants[label] = readPatch();
    fix.material = base;
  };

  tryIt('no normalMap', (m) => { m.normalMap = null; });
  tryIt('flat normalScale', (m) => { m.normalScale.set(0, 0); });
  tryIt('no aoMap', (m) => { m.aoMap = null; });
  tryIt('no roughMap+metalMap', (m) => { m.roughnessMap = null; m.metalnessMap = null; m.metalness = 0; m.roughness = 0.35; });
  tryIt('no map (flat white albedo)', (m) => { m.map = null; m.color.setRGB(1, 1, 1); });
  tryIt('no clearcoat', (m) => { m.clearcoat = 0; });
  tryIt('env x4', (m) => { m.envMapIntensity = 4; });
  tryIt('EVERYTHING off', (m) => {
    m.normalMap = null; m.aoMap = null; m.roughnessMap = null; m.metalnessMap = null;
    m.map = null; m.color.setRGB(1, 1, 1); m.metalness = 0; m.roughness = 0.35; m.clearcoat = 0;
  });

  // the two controls: a material known to render bright, on this same object
  if (mint) { fix.material = mint.material; out.variants['mintCap material'] = readPatch(); fix.material = base; }
  // and the object's own geometry replaced by the mint cap's, keeping the shell material
  out.variants.final = readPatch();
  out.mintPixel = (() => {
    const mp = mint ? mint.getWorldPosition(new (cam.position.constructor)()).project(cam) : null;
    if (!mp) return null;
    const mx = Math.round((mp.x * 0.5 + 0.5) * W), my = Math.round((-mp.y * 0.5 + 0.5) * H);
    const d = g2.getImageData(mx - 4, my - 4, 8, 8).data;
    let a = 0, b = 0, c = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { a += d[i]; b += d[i + 1]; c += d[i + 2]; n++; }
    return { px: [mx, my], rgb: [a / n, b / n, c / n].map(v => Math.round(v)) };
  })();
  return out;
});

await browser.close();
console.log(JSON.stringify(r, null, 1));
