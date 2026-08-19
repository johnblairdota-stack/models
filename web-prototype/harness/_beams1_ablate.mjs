#!/usr/bin/env node
/**
 * BEAMS-1 — WHY THE STUDY BEAMS WILL NOT LIGHT. ABLATION, NOT REASONING.
 *
 * `ceiling-1` left three named suspects (the screen-space AO multiply, the grade's `toeCrush`,
 * the `dark` albedo) and one fact none of them obviously explains: **an additive decal drawn IN
 * FRONT of the beams does not lift them.** This turns each suspect off AT RUNTIME, in ONE page,
 * with no reload between arms, and measures the same pixels every time.
 *
 * Two things make the numbers mean something:
 *
 *  1. **THE PIXELS ARE IDENTIFIED BY MESH, NOT BY A BAND.** `_ceil1_band.mjs` measures the top
 *     fifth of the frame, which at this station is beams AND pans AND cornice AND the top of a
 *     window. A mask render (every opaque material swapped to flat black, every transparent one
 *     hidden because it cannot occlude, `kit:dark` swapped to flat white) says exactly which
 *     pixels the beams own. Pans (`kit:ceiling`) and panelling (`kit:wall`) are masked the same
 *     way and carried as controls: whatever is done to the beams must leave a mark on them.
 *
 *  2. **BOTH ENDS OF THE PIPE ARE READ.** `pipeline.sceneRT` is an RGBA16F, `NoColorSpace`
 *     target — it holds LINEAR radiance before exposure, tonemap and grade. Reading it says
 *     whether the beams are dark because nothing lights them or dark because something later
 *     erases them, and the PNG says what the player sees. A term that moves the linear number
 *     and not the PNG is being eaten by the grade; one that moves neither is not a light.
 *
 *   node harness/_beams1_ablate.mjs --port 5471 --station study_w.south@180
 *   node harness/_beams1_ablate.mjs --arms base,grain0,toe0,contrast1,flat --shots
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from './pxdiff.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PORT = +opt('port', 5471);
const OUT = opt('out', path.join(ROOT, 'progress'));
const TAG = opt('tag', 'beams1');
const STATION = opt('station', 'study_w.south@180');
const QS = opt('q', '');
const SHOTS = argv.includes('--shots');
const PROFILE = opt('profile', path.join(process.env.TEMP || '/tmp', 'rrr-beams1-profile'));

/**
 * THE ARMS. Every one is a runtime patch and every one has an explicit undo, because the
 * control that matters most is `base2` — the shipped arm re-measured at the END. If `base` and
 * `base2` do not agree inside the grain floor then nothing between them is a measurement.
 */
const ARM_LIST = opt('arms', [
  'base',            // as shipped
  'grain0',          // grain 0 only. Is "mean L 1" a signal or is it noise clamped at zero?
  'toe0',            // + toeCrush 0            -- ceiling-1's candidate 2
  'contrast1',       // + contrast 1.0          -- the OTHER black point, which nobody listed
  'toe0c1',          // + both
  'lift0',           // grade lift removed, to price what the lift alone is worth
  'ao_off',          // screen-space AO off     -- ceiling-1's candidate 1
  'albedo_mid',      // `dark` albedo -> 0x808080 -- ceiling-1's candidate 3
  'flat',            // grade fully neutral, exposure 1
  'exp4',            // exposure x4, everything else shipped
  'ceil15',          // every hemisphere/rig term x1.5 is not reachable here; env x1.5 instead
  'emis',            // emissive SWEEP is run separately; this is one mid step
  'base2',           // the control pair
].join(',')).split(',');

const EMIS_SWEEP = (opt('emis', '0.001,0.002,0.004,0.008,0.016,0.032,0.064') || '')
  .split(',').filter(Boolean).map(Number);

// ---------------------------------------------------------------- dev server
const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); }); s.on('error', () => res(false));
});
let child = null;
if (!(await portOpen(PORT))) {
  child = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'),
    '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  const t0 = Date.now();
  while (!(await portOpen(PORT))) {
    if (Date.now() - t0 > 60000) { console.error('vite did not come up'); process.exit(3); }
    await new Promise((r) => setTimeout(r, 250));
  }
}
await mkdir(OUT, { recursive: true });

// ⚠️ PERSISTENT PROFILE. `boot-1` measured warm boots at ~15 s against a ~168 s cold boot, and
// the whole cost is 1,054 shader-program compiles that Chrome will cache across runs if it is
// given somewhere to put them.
const ctx = await chromium.launchPersistentContext(PROFILE, {
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'],
  viewport: { width: 1920, height: 1080 },
});
const page = ctx.pages()[0] ?? await ctx.newPage();
await page.route('**/@vite/client', (r) => r.fulfill({
  status: 200, contentType: 'text/javascript',
  body: 'export function createHotContext(){return {on(){},send(){},accept(){},dispose(){},prune(){},invalidate(){}}}\nexport function injectQuery(u){return u}\nexport function removeStyle(){}\nexport function updateStyle(){}\n',
}));
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).split('\n')[0].slice(0, 200)));
let navs = 0;
page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs++; });

const t0 = Date.now();
await page.goto(`http://127.0.0.1:${PORT}/?view=game.play&capture=1&quality=medium${QS ? '&' + QS : ''}`,
  { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(
  () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
  null, { timeout: 420000 });
console.log(`ready in ${((Date.now() - t0) / 1000).toFixed(1)} s   (navigations so far: ${navs})`);

// ---------------------------------------------------------------- park
const [anchor, degS] = STATION.split('@');
await page.evaluate(async ({ anchor, deg }) => {
  const e = window.__rrr.engine, room = e.room;
  if (e.director && !e.director.__parked) {
    e.director.__parked = true;
    e.director.step = () => ({ move: { x: 0, y: 0 }, look: null, run: false, fire: false,
      aimYaw: e.cam?.yaw ?? 0, aimPitch: e.cam?.pitch ?? 0 });
  }
  const a = room.anchor(anchor), yaw = deg * Math.PI / 180;
  const snap = () => {
    e.player.pos.copy(a); e.player.vel.set(0, 0, 0);
    e.player.facing = yaw; e.player.aimYaw = yaw;
    if (e.cam) { e.cam.yaw = yaw; e.cam.pitch = 0; e.cam._first = true; }
    if (e.hunter) {
      e.hunter.root.position.set(a.x + 300, 0, a.z + 300);
      e.hunter.state = 'PATROL'; e.hunter.awareness = 0; e.hunter.target = null;
    }
  };
  snap();
  for (let k = 0; k < 5; k++) { await new Promise((r) => setTimeout(r, 120)); snap(); }
  await window.__rrr.settle(6);
}, { anchor, deg: +degS });

// ---------------------------------------------------------------- the instrument
await page.evaluate(() => {
  const e = window.__rrr.engine;
  const P = e.pipeline;
  const B = (window.__beams = {});
  B.shipped = { ...P.grade, ao: P.aoEnabled };

  const h2f = (h) => {
    const s = (h & 0x8000) ? -1 : 1, ex = (h & 0x7C00) >> 10, f = h & 0x03FF;
    if (ex === 0) return s * 6.103515625e-5 * (f / 1024);
    if (ex === 31) return f ? NaN : s * Infinity;
    return s * Math.pow(2, ex - 15) * (1 + f / 1024);
  };

  // ---- collect the meshes we care about, by bin key -------------------------
  const byKey = new Map();
  e.scene.traverse((o) => {
    if (!o.isMesh || !o.name) return;
    const m = o.name.match(/^kit:(.+)$/);
    if (!m) return;
    if (!byKey.has(m[1])) byKey.set(m[1], []);
    byKey.get(m[1]).push(o);
  });
  B.keys = [...byKey.keys()].sort();
  B.byKey = byKey;

  /**
   * THE MASK. Not a raycast and not a band: a real render in which only the target bucket
   * writes white.
   *   · every OPAQUE material  -> flat black, fog off, depth as before  (still occludes)
   *   · every TRANSPARENT one  -> hidden. It never wrote depth, so it never occluded anything;
   *     leaving it in as an opaque black would invent an occluder that does not exist, and
   *     leaving it additive would paint the glow decals into the mask.
   *   · the target bucket      -> flat white
   */
  B.maskFor = async (key) => {
    const THREEC = e.scene.constructor;                 // not used; kept for clarity
    void THREEC;
    const saved = [];
    const one = (mesh) => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]);
    const Basic = (() => {
      // Build a MeshBasicMaterial without importing three: clone an existing basic-ish material
      // is unreliable, so go through the constructor already in the scene graph.
      let ctor = null;
      e.scene.traverse((o) => { if (!ctor && o.isMesh && o.material?.isMeshBasicMaterial) ctor = o.material.constructor; });
      return ctor;
    })();
    if (!Basic) return { err: 'no MeshBasicMaterial in scene to borrow a constructor from' };
    const black = new Basic({ color: 0x000000, fog: false });
    const white = new Basic({ color: 0xffffff, fog: false });
    e.scene.traverse((o) => {
      if (!o.isMesh) return;
      const mats = one(o);
      const isTarget = o.name === `kit:${key}`;
      const transparent = mats.some((m) => m && (m.transparent || m.depthWrite === false));
      saved.push({ o, mat: o.material, vis: o.visible });
      if (transparent && !isTarget) { o.visible = false; return; }
      o.material = isTarget ? white : black;
    });
    await window.__rrr.settle(2);
    const rt = e.pipeline.sceneRT;
    const W = rt.width, H = rt.height;
    const buf = new Uint16Array(W * H * 4);
    e.renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
    // GL origin is bottom-left; flip to image order so the mask indexes like a PNG.
    const mask = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      const src = (H - 1 - y) * W;
      for (let x = 0; x < W; x++) mask[y * W + x] = h2f(buf[(src + x) * 4]) > 0.5 ? 1 : 0;
    }
    for (const s of saved) { s.o.material = s.mat; s.o.visible = s.vis; }
    black.dispose(); white.dispose();
    await window.__rrr.settle(2);
    return { mask, W, H, n: mask.reduce((a, b) => a + b, 0) };
  };

  /** One RGBA16F readback per arm, shared by every mask — 16 MB a shot is not free. */
  B.readLinear = () => {
    const rt = e.pipeline.sceneRT;
    if (!B._buf || B._buf.length !== rt.width * rt.height * 4) B._buf = new Uint16Array(rt.width * rt.height * 4);
    try { e.renderer.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, B._buf); B._ok = true; }
    catch (err) { B._ok = false; B._err = String(err).slice(0, 120); }
    return B._ok;
  };

  /** Linear-radiance stats over a mask, straight out of the RGBA16F scene target. */
  B.linearStats = (mask, W, H, yFrac) => {
    if (!B._ok) return { n: 0, err: B._err };
    const buf = B._buf;
    const yMax = yFrac ? Math.round(H * yFrac) : H;
    const L = [];
    for (let y = 0; y < yMax; y++) {
      const src = (H - 1 - y) * W;
      for (let x = 0; x < W; x += 2) {
        if (!mask[y * W + x]) continue;
        const i = (src + x) * 4;
        L.push(0.2126 * h2f(buf[i]) + 0.7152 * h2f(buf[i + 1]) + 0.0722 * h2f(buf[i + 2]));
      }
    }
    if (!L.length) return { n: 0 };
    L.sort((a, b) => a - b);
    const mean = L.reduce((a, b) => a + b, 0) / L.length;
    return { n: L.length, mean, p05: L[(L.length * 0.05) | 0], med: L[L.length >> 1],
      p95: L[(L.length * 0.95) | 0], max: L[L.length - 1] };
  };

  /** Display stats read back off the CANVAS, so it is what a screenshot would be. */
  B.displayStats = (mask, W, H, yFrac) => {
    const cv = e.renderer.domElement;
    const c2 = document.createElement('canvas');
    c2.width = cv.width; c2.height = cv.height;
    c2.getContext('2d').drawImage(cv, 0, 0);
    const d = c2.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    const yMax = yFrac ? Math.round(H * yFrac) : H;
    const L = [];
    let zero = 0;
    for (let y = 0; y < yMax; y++) {
      for (let x = 0; x < W; x += 2) {
        if (!mask[y * W + x]) continue;
        const i = (y * cv.width + x) * 4;
        const v = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        L.push(v); if (v < 0.05) zero++;
      }
    }
    if (!L.length) return { n: 0 };
    L.sort((a, b) => a - b);
    return { n: L.length, mean: L.reduce((a, b) => a + b, 0) / L.length,
      med: L[L.length >> 1], p95: L[(L.length * 0.95) | 0], max: L[L.length - 1],
      zeroShare: zero / L.length };
  };
});

// ---- build the masks -------------------------------------------------------
const maskInfo = await page.evaluate(async () => {
  const B = window.__beams, out = {};
  B.masks = {};
  for (const key of ['dark', 'ceiling', 'wall']) {
    if (!B.byKey.has(key)) { out[key] = { n: 0, missing: true }; continue; }
    const r = await B.maskFor(key);
    if (r.err) { out[key] = r; continue; }
    B.masks[key] = r;
    // bounding box of the mask, and how much of it is in the top 30% of the frame
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, top = 0;
    for (let y = 0; y < r.H; y++) for (let x = 0; x < r.W; x++) {
      if (!r.mask[y * r.W + x]) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (y < r.H * 0.30) top++;
    }
    out[key] = { n: r.n, share: +(r.n / (r.W * r.H) * 100).toFixed(2), box: [x0, y0, x1, y1],
      topShare: +(top / Math.max(1, r.n) * 100).toFixed(1), W: r.W, H: r.H };
  }
  out.keys = B.keys;
  /**
   * ⚠️ SHIP THE BEAM MASK BACK TO NODE, BIT-PACKED. The in-page canvas readback and the PNG on
   * disk must agree, and they can only be compared if the SAME pixels are used for both. This
   * project has been burned by instruments that "ran"; a node-side re-measurement of the file
   * that was actually written is the only check that catches a canvas that quietly went stale.
   */
  if (B.masks.dark) {
    const m = B.masks.dark, bytes = new Uint8Array(Math.ceil(m.W * m.H / 8));
    for (let i = 0; i < m.W * m.H; i++) if (m.mask[i]) bytes[i >> 3] |= 1 << (i & 7);
    let s = '';
    for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
    out.darkPacked = btoa(s);
  }
  return out;
});
const DARK = maskInfo.darkPacked ? Buffer.from(maskInfo.darkPacked, 'base64') : null;
if (maskInfo.darkPacked) {
  await writeFile(path.join(OUT, `${TAG}-${anchor.replace('.', '_')}-darkmask.b64`), maskInfo.darkPacked);
}
delete maskInfo.darkPacked;
console.log('\nMASKS  (mesh-ownership, not a band)');
console.log('  bin keys in scene:', (maskInfo.keys || []).join(' '));
for (const k of ['dark', 'ceiling', 'wall']) {
  const m = maskInfo[k];
  console.log(`  kit:${k.padEnd(8)} ${m.missing ? 'ABSENT' : m.err ? m.err
    : `${String(m.n).padStart(8)} px (${m.share}% of frame)  bbox ${JSON.stringify(m.box)}  ${m.topShare}% of it in the top 30%`}`);
}

// ---------------------------------------------------------------- the arms
const ARMS = {
  base: 'B.set({})',
  grain0: 'B.set({ grain: 0 })',
  toe0: 'B.set({ grain: 0, toeCrush: 0 })',
  contrast1: 'B.set({ grain: 0, contrast: 1.0 })',
  toe0c1: 'B.set({ grain: 0, toeCrush: 0, contrast: 1.0 })',
  lift0: 'B.set({ grain: 0, lift: [0, 0, 0] })',
  ao_off: 'B.set({ grain: 0 }); e.pipeline.aoEnabled = false',
  albedo_mid: 'B.set({ grain: 0 }); B.albedo(0.216)',
  flat: 'B.set({ grain: 0, toeCrush: 0, contrast: 1, lift: [0,0,0], gamma: [1,1,1], gain: [1,1,1], vignette: 0, haze: 0, exposure: 1, splitBalance: 0, saturation: 1, ca: 0, bloomStrength: 0, halation: 0 })',
  exp4: 'B.set({ grain: 0, exposure: 7.4 })',
  ceil15: 'B.set({ grain: 0 }); B.hemi(1.5)',
  haze0: 'B.set({ grain: 0, haze: 0 })',
  emis: 'B.set({ grain: 0 }); B.emissive(0.02)',
  base2: 'B.set({})',
};

await page.evaluate(() => {
  const e = window.__rrr.engine, B = window.__beams;
  B.set = (g) => e.pipeline.setGrade({ ...B.shipped, ...g });
  B.reset = () => {
    e.pipeline.setGrade({ ...B.shipped });
    e.pipeline.aoEnabled = B.shipped.ao;
    for (const o of B.byKey.get('dark') ?? []) {
      if (B.savedDark) { o.material.color.setRGB(...B.savedDark); }
      o.material.emissive?.setRGB(0, 0, 0);
    }
    if (B.savedHemi != null) {
      e.scene.traverse((l) => { if (l.isHemisphereLight) l.intensity = B.savedHemi; });
    }
  };
  const dark0 = (B.byKey.get('dark') ?? [])[0];
  if (dark0) B.savedDark = dark0.material.color.toArray();
  e.scene.traverse((l) => { if (l.isHemisphereLight && B.savedHemi == null) B.savedHemi = l.intensity; });
  // `setRGB` with no colour-space argument writes the WORKING space, which is Linear-sRGB —
  // so these numbers are linear reflectance/radiance, not sRGB bytes.
  B.albedo = (v) => { for (const o of B.byKey.get('dark') ?? []) o.material.color.setRGB(v, v, v); };
  B.emissive = (v) => {
    for (const o of B.byKey.get('dark') ?? []) {
      o.material.emissive?.setRGB(v, v, v);
      if ('emissiveIntensity' in o.material) o.material.emissiveIntensity = 1;
    }
  };
  B.hemi = (k) => { e.scene.traverse((l) => { if (l.isHemisphereLight) l.intensity = B.savedHemi * k; }); };
});

/**
 * 🚨 **THE DEAD CELL IS A SUBSET OF THE BEAMS AND MEASURING ALL THE BEAMS HIDES IT.**
 *
 * `ceiling-1` reports "a beam cell reads mean L 1". The whole `kit:dark` bucket at this station
 * does not — a fifth of it is at exactly zero and the rest is ordinary dark timber, and averaged
 * together they read L 5.5, which is a number that describes neither. So a fourth mask is built
 * here from the SHIPPED FRAME ITSELF: every beam pixel that the shipped grade outputs as a
 * literal 0. That is the population the finding is about, and everything after this reports it
 * separately. Grain is off while it is measured, or the mask would be a picture of the noise.
 */
const deadInfo = await page.evaluate(async () => {
  const e = window.__rrr.engine, B = window.__beams;
  B.set({ grain: 0 });
  await window.__rrr.settle(6);
  const m = B.masks.dark;
  const cv = e.renderer.domElement;
  const c2 = document.createElement('canvas');
  c2.width = cv.width; c2.height = cv.height;
  c2.getContext('2d').drawImage(cv, 0, 0);
  const d = c2.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  const dead = new Uint8Array(m.W * m.H);
  let n = 0;
  // ⚠️ CEILING ONLY. The firebox is in the same `dark` bucket and it is SUPPOSED to be a hole —
  // "the art's reliable black" is the argument for the bucket existing. Letting it into the dead
  // population would be measuring the one surface whose blackness is the design.
  for (let y = 0; y < Math.round(m.H * 0.30); y++) for (let x = 0; x < m.W; x++) {
    if (!m.mask[y * m.W + x]) continue;
    const i = (y * cv.width + x) * 4;
    if (d[i] === 0 && d[i + 1] === 0 && d[i + 2] === 0) { dead[y * m.W + x] = 1; n++; }
  }
  B.masks.dead = { mask: dead, W: m.W, H: m.H, n };
  B.set({});
  await window.__rrr.settle(4);
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) {
    if (!dead[y * m.W + x]) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { n, shareOfBeams: +(n / m.n * 100).toFixed(1), box: [x0, y0, x1, y1] };
});
console.log(`  DEAD SUBSET  ${deadInfo.n} px = ${deadInfo.shareOfBeams}% of the beam pixels ` +
  `output as a literal 0 by the shipped grade   bbox ${JSON.stringify(deadInfo.box)}`);

const rows = [];
async function runArm(name, code) {
  await page.evaluate(async (src) => {
    const e = window.__rrr.engine, B = window.__beams;
    B.reset();
    // eslint-disable-next-line no-new-func
    new Function('e', 'B', src)(e, B);
    await window.__rrr.settle(8);
  }, code);
  const r = await page.evaluate(() => {
    const B = window.__beams, out = {};
    B.readLinear();
    for (const k of Object.keys(B.masks)) {
      const m = B.masks[k];
      out[k] = { lin: B.linearStats(m.mask, m.W, m.H, 0.30),
        disp: B.displayStats(m.mask, m.W, m.H, 0.30) };
    }
    return out;
  });
  const file = path.join(OUT, `${TAG}-${anchor.replace('.', '_')}-${name}.png`);
  await page.screenshot({ path: file });
  rows.push({ arm: name, ...r, file });
  const f = (v, d = 4) => (v == null ? '  --  ' : v.toFixed(d));
  console.log(`  ${name.padEnd(11)}` +
    ` DEAD lin ${f(r.dead?.lin.mean).padStart(7)} disp ${f(r.dead?.disp.mean, 2).padStart(6)}` +
    ` zero ${((r.dead?.disp.zeroShare ?? 0) * 100).toFixed(1).padStart(5)}%` +
    ` | beams lin ${f(r.dark?.lin.mean)} disp ${f(r.dark?.disp.mean, 2).padStart(6)}` +
    ` zero ${((r.dark?.disp.zeroShare ?? 0) * 100).toFixed(1).padStart(5)}%` +
    ` | pans ${f(r.ceiling?.disp.mean, 2).padStart(6)}` +
    ` wall ${f(r.wall?.disp.mean, 2).padStart(6)}`);
}

console.log(`\nARMS  (one page, no reload; "lin" = linear radiance out of sceneRT, "disp" = 8-bit canvas)`);
for (const a of ARM_LIST) {
  if (!ARMS[a]) { console.log(`  ${a}: unknown arm`); continue; }
  await runArm(a, ARMS[a]);
}

// ---------------------------------------------------------------- emissive sweep
if (EMIS_SWEEP.length) {
  console.log(`\nEMISSIVE SWEEP on kit:dark — a KNOWN additive term, at the beams' own pixels.`);
  console.log(`  This is the additive-decal question with the decal's own delivery removed from`);
  console.log(`  the experiment: if a small add produces EXACTLY no change and a larger one`);
  console.log(`  produces a large change, the chain has a hard black point, not a multiply.`);
  for (const v of EMIS_SWEEP) await runArm(`emis${v}`, `B.set({ grain: 0 }); B.emissive(${v})`);
}
await page.evaluate(() => window.__beams.reset());

// ---- verify the OUTPUT: re-measure the PNGs node-side, over the SAME mask --
console.log('\nPNG CHECK — the file on disk, masked by the same beam pixels');
console.log('  arm          size     beams(top30%) mean   med  zero%   |  whole top-24% band');
for (const r of rows) {
  if (!r.file) continue;
  const s = await stat(r.file);
  const img = decodePng(await readFile(r.file));
  const W = img.width, ch = img.channels, d = img.data;
  const lum = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  let bandSum = 0, bandN = 0;
  for (let y = 0; y < Math.round(img.height * 0.24); y += 2)
    for (let x = 0; x < W; x += 2) { bandSum += lum((y * W + x) * ch); bandN++; }
  let mSum = 0, mN = 0, mZero = 0; const mL = [];
  if (DARK) {
    for (let y = 0; y < Math.round(img.height * 0.30); y++)
      for (let x = 0; x < W; x += 2) {
        const bit = y * W + x;
        if (!(DARK[bit >> 3] & (1 << (bit & 7)))) continue;
        const v = lum((y * W + x) * ch);
        mSum += v; mN++; mL.push(v); if (v < 0.05) mZero++;
      }
    mL.sort((a, b) => a - b);
  }
  r.png = { kb: (s.size / 1024) | 0, beamMean: mN ? mSum / mN : null,
    beamMed: mN ? mL[mL.length >> 1] : null, beamZero: mN ? mZero / mN : null,
    bandMean: bandSum / bandN };
  console.log(`  ${r.arm.padEnd(11)} ${String((s.size / 1024) | 0).padStart(5)} KB  ` +
    `${(mN ? mSum / mN : NaN).toFixed(2).padStart(10)} ${(mN ? mL[mL.length >> 1] : NaN).toFixed(1).padStart(6)}` +
    ` ${((mZero / Math.max(1, mN)) * 100).toFixed(1).padStart(6)}%  |  ${(bandSum / bandN).toFixed(2).padStart(7)}`);
}

await writeFile(path.join(OUT, `${TAG}-${anchor.replace('.', '_')}.json`),
  JSON.stringify({ station: STATION, qs: QS, masks: maskInfo, rows }, null, 2));

console.log(`\nnavigations: ${navs} (expect 1 — more means a reload happened between arms)`);
if (errs.length) console.log('page errors:', [...new Set(errs)].slice(0, 6));
await ctx.close();
if (child) child.kill();
process.exit(0);
