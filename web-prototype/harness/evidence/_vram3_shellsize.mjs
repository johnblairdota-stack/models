#!/usr/bin/env node
/**
 * WHAT DOES `shellsize` 512 -> 1024 ACTUALLY COST? — the texture census, per view, in bytes.
 *
 * `shellWhite()` raised its default bake `size` from 512 to 1024 so the panel-seam groove has a
 * two-texel core instead of a sub-texel smear. The comment at robot.js:1292 states the cost as
 * ARITHMETIC and says so: 3 x 1024^2 x 4 B x mips = 16.8 MB per shell variant against 4.2 MB,
 * "and `unit4hMaterials` is called once per grime level, so a scene holding the player plus three
 * hunter stages pays it four times". That last clause is a GUESS ABOUT CALLERS, and this probe
 * exists because a guess about callers is the kind of thing that is wrong.
 *
 *   node harness/evidence/_vram3_shellsize.mjs [--views game.play,hunter.1,...] [--port 5193] [--skip-build]
 *
 * WHY NOT `_vram1_reset.mjs`. That probe is the right instrument for a DIFFERENT question. It
 * reads `renderer.info.memory.{geometries,textures}`, which are COUNTS OF OBJECTS — a 512 tile
 * and a 1024 tile both count as exactly 1. Run it against both configurations and it prints the
 * same number twice, which would read as "no cost" rather than as "wrong instrument". Bytes are
 * not observable through `renderer.info` at all, so they have to be counted off the textures.
 *
 * WHY THE BUILT GAME AND NOT `npm run dev`. The first version of this probe drove the dev server
 * and got `SyntaxError: Unexpected identifier 'facet'` on one view, then `Unexpected token ';'`
 * on a view that had booted CLEANLY minutes earlier on a fresh server. An error whose text
 * changes between runs of unchanged source is a server serving garbled modules, not a source
 * bug — vite's transform state degrades across many module-graph loads in one session. So this
 * builds once and serves `dist/` through `harness/serve.mjs`, which is also what the .bat
 * launchers open. `shellKnob()` reads `location.search`, so the flag works identically there.
 *
 * WHAT IS MEASURED AND WHAT IS ARITHMETIC. Measured: every material actually hanging off a scene
 * that was handed to `renderer.render()`, and for each one the DELIVERED texture width read off
 * the live texture (`tex.image.width`) — not the `size` that was requested, because `shellWhite()`
 * merges `...opts` AFTER its own default and a caller can silently win. Arithmetic, and only
 * after the measurement: width x height x 4 B x 3 targets, x 4/3 for a full mip chain. No browser
 * API reports real VRAM, so the texel count is the honest end of the road — but the texel count
 * was never the unknown. HOW MANY SHELL VARIANTS REACH THE SCENE, AND AT WHAT SIZE, was.
 *
 * THE CONTROL THAT MUST FAIL. `hunter.js:393` passes `size: 512` explicitly for shell, chrome and
 * mint, so a hunter's own materials CANNOT move with this flag. Every hunter view therefore has a
 * built-in control: its hunter shells must read 512 in both runs, while the scale-reference player
 * standing beside it must move 1024 -> 512. A run in which everything moves means the probe is
 * reading the request instead of the delivery; a run in which nothing moves means the flag never
 * reached the page. Both are printed as CONTROL lines and both void the verdict.
 */

import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const flag = (n) => argv.includes(`--${n}`);
const PORT = +opt('port', 5193);
const VIEWS = opt('views', 'game.play,hunter.1,hunter.2,hunter.3,hunter.sheet').split(',');

if (!flag('skip-build')) {
  console.log('  building dist/ ...');
  const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'build'],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32' });
  if (r.status !== 0) { console.error('  build failed'); process.exit(3); }
}

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
});

let child = null;
if (!(await portOpen(PORT))) {
  child = spawn(process.execPath, [path.join(ROOT, 'harness', 'serve.mjs'), '--port', String(PORT)],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
  child.stdout.on('data', () => {});
  const t0 = Date.now();
  while (!(await portOpen(PORT))) {
    if (Date.now() - t0 > 30000) { console.error('server failed to start'); process.exit(3); }
    await new Promise((r) => setTimeout(r, 200));
  }
}

const browser = await chromium.launch({
  headless: !flag('headed'),
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-frame-rate-limit',
    '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio', '--disable-dev-shm-usage'],
});

const MIP = 4 / 3;
const MB = (b) => (b / 1048576).toFixed(2);

/** Boot one view at one configuration and census every texture its scenes actually reference. */
async function census(viewId, query) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${PORT}/?view=${encodeURIComponent(viewId)}${query}`,
    { waitUntil: 'load', timeout: 45000 });
  await page.waitForFunction(
    () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
    null, { timeout: 600000 });
  if (await page.evaluate(() => document.body.dataset.rrrError === '1')) {
    const why = await page.evaluate(() => window.__rrrError ?? 'unknown');
    await page.close();
    return { ok: false, why: String(why).slice(0, 300) };
  }
  const gate = await page.$('#rrr-play-gate');
  if (gate) { await page.click('#rrr-play-btn').catch(() => page.click('#rrr-play-gate')); await page.waitForTimeout(700); }

  // Watch `render()` for a beat, so the traversal walks graphs that were really drawn rather
  // than whatever `engine.scene` happens to point at.
  await page.evaluate(() => {
    const r = window.__rrr.engine.renderer;
    window.__vramScenes = new Set([window.__rrr.engine.scene]);
    const orig = r.render.bind(r);
    r.render = (scene, cam) => { window.__vramScenes.add(scene); return orig(scene, cam); };
  });
  await page.evaluate(() => window.__rrr.redraw?.()).catch(() => {});
  await page.waitForTimeout(1500);

  const data = await page.evaluate(() => {
    const SLOTS = ['map', 'normalMap', 'aoMap', 'roughnessMap', 'metalnessMap', 'alphaMap',
      'emissiveMap', 'bumpMap', 'displacementMap', 'envMap', 'lightMap', 'clearcoatMap',
      'clearcoatNormalMap', 'clearcoatRoughnessMap', 'sheenColorMap', 'specularMap',
      'iridescenceMap', 'transmissionMap', 'thicknessMap'];

    const tex = new Map();     // uuid -> {w,h,mips}
    const bakes = new Map();   // albedo uuid -> {key, w, h}
    const addTex = (t) => {
      if (!t?.uuid || tex.has(t.uuid)) return;
      const w = t.image?.width ?? 0, h = t.image?.height ?? 0;
      if (!w || !h) return;
      tex.set(t.uuid, { w, h, mips: t.generateMipmaps !== false });
    };
    const addMat = (m) => {
      if (!m) return;
      for (const s of SLOTS) addTex(m[s]);
      // `MaterialBaker.standard()` stamps the bake set here and names the material with the
      // cache key. This is the delivered set — what is in the graph, not what was requested.
      const b = m.userData?.bake;
      if (b?.map?.uuid && !bakes.has(b.map.uuid)) {
        bakes.set(b.map.uuid, {
          key: m.name || '(unnamed)',
          requested: b.size ?? null,
          w: b.map.image?.width ?? 0,
          h: b.map.image?.height ?? 0,
        });
      }
    };
    for (const scene of window.__vramScenes ?? []) {
      if (!scene?.traverse) continue;
      addTex(scene.environment);
      if (scene.background?.isTexture) addTex(scene.background);
      scene.traverse((o) => {
        const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of ms) addMat(m);
      });
    }
    const info = window.__rrr.engine.renderer.info.memory;
    return {
      bakes: [...bakes.values()],
      tex: [...tex.values()],
      scenes: (window.__vramScenes ?? new Set()).size,
      info: { textures: info.textures, geometries: info.geometries },
    };
  });

  await page.close();
  return { ok: true, boot: (Date.now() - t0) / 1000, errs, ...data };
}

const bakeBytes = (b) => b.w * b.h * 4 * 3 * MIP;                 // 3 MRT targets per set
const texBytes = (t) => t.w * t.h * 4 * (t.mips ? MIP : 1);
const shells = (bakes) => bakes.filter((b) => b.key.startsWith('rrshell:'));

function report(label, c) {
  if (!c.ok) { console.log(`   ${label}: BOOT FAILED — ${c.why}`); return null; }
  const sh = shells(c.bakes);
  const shellB = sh.reduce((a, b) => a + bakeBytes(b), 0);
  const bakeB = c.bakes.reduce((a, b) => a + bakeBytes(b), 0);
  const allB = c.tex.reduce((a, t) => a + texBytes(t), 0);
  console.log(`   ${label}   (boot ${c.boot.toFixed(0)} s)`);
  console.log(`     baked sets in scene ${c.bakes.length} = ${MB(bakeB)} MB` +
    `  ·  all unique textures ${c.tex.length} = ${MB(allB)} MB` +
    `  ·  renderer.info.textures ${c.info.textures}`);
  console.log(`     SHELL sets ${sh.length} = ${MB(shellB)} MB`);
  for (const b of sh) {
    const g = /"grime":([\d.]+)/.exec(b.key)?.[1] ?? '?';
    console.log(`       - ${String(b.w).padStart(4)}px (req ${b.requested})  grime ${g}  ${MB(bakeBytes(b))} MB`);
  }
  if (c.errs.length) console.log(`     ! ${c.errs.length} page error(s): ${c.errs[0].slice(0, 140)}`);
  return { shellB, bakeB, allB, sh, bakeCount: c.bakes.length, errs: c.errs.length };
}

console.log(`\n  serving dist/ on :${PORT} · views: ${VIEWS.join(', ')}\n`);
const verdicts = [];

for (const v of VIEWS) {
  console.log(`  ================ ${v} ================`);
  const hi = report('DEFAULT (shellsize 1024)', await census(v, ''));
  const lo = report('?shellsize=512', await census(v, '&shellsize=512'));
  if (!hi || !lo) { verdicts.push({ v, void: true }); console.log(''); continue; }

  const moved = hi.sh.filter((b) => b.w === 1024).length;
  const pinned = hi.sh.filter((b) => b.w === 512).length;
  const stuck = lo.sh.filter((b) => b.w === 1024).length;
  console.log(`     CONTROL  shell sets at 1024 by default ${moved} · pinned at 512 by the caller ${pinned}` +
    ` · still 1024 under the flag ${stuck}${stuck ? '   <-- flag did not reach these' : ''}`);
  console.log(`     DELTA    shell +${MB(hi.shellB - lo.shellB)} MB`);

  /*
   * THE SCENE TOTAL IS ONLY QUOTABLE IF BOTH PAGES LOADED THE SAME AMOUNT OF GAME.
   *
   * `harness/serve.mjs` answers anything it cannot read with `index.html`, so a transient read
   * failure arrives as a chunk whose module never evaluates — the view still boots, just with
   * fewer materials in it. On `game.play` that has been seen as 44 baked sets in one run and 61
   * in the next, and differencing the two printed a DELTA OF -320 MB: a number with the right
   * shape, the wrong sign, and no relationship to the flag. The shell census is immune (the
   * player robot is always present, and its five sets read identically in every run), so the
   * shell figure is reported unconditionally and the total is withheld unless both pages agree
   * on how much of the game they got.
   */
  const sameLoad = hi.bakeCount === lo.bakeCount && !hi.errs && !lo.errs;
  if (sameLoad) {
    console.log(`     TOTALS   all texture 1024: ${MB(hi.allB)} MB  ·  512: ${MB(lo.allB)} MB` +
      `  ·  delta +${MB(hi.allB - lo.allB)} MB`);
  } else {
    console.log(`     TOTALS   WITHHELD — the two pages did not load the same scene ` +
      `(${hi.bakeCount} vs ${lo.bakeCount} baked sets` +
      `${hi.errs || lo.errs ? `, page errors ${hi.errs}/${lo.errs}` : ''}). ` +
      `Shell delta above is unaffected.`);
  }
  console.log('');
  verdicts.push({ v, d: hi.shellB - lo.shellB, moved, pinned, stuck, hi, lo, sameLoad });
}

console.log('  ================ VERDICT ================');
for (const r of verdicts) {
  if (r.void) { console.log(`   ${r.v.padEnd(14)} VOID — a configuration failed to boot`); continue; }
  console.log(`   ${r.v.padEnd(14)} shell +${MB(r.d).padStart(6)} MB   ` +
    `${r.moved} shell set${r.moved === 1 ? '' : 's'} at 1024, ${r.pinned} pinned at 512 by the caller` +
    `${r.sameLoad ? ` · scene total ${MB(r.hi.allB)} -> ${MB(r.lo.allB)} MB` : ' · scene total withheld'}`);
}
const live = verdicts.filter((r) => !r.void);
const anyMoved = live.some((r) => r.moved > 0);
const anyPinned = live.some((r) => r.pinned > 0);
const anyStuck = live.some((r) => r.stuck > 0);
console.log(`\n   CONTROLS  flag moved a set: ${anyMoved ? 'yes' : '⚠️ NO — verdict void, the flag never reached the page'}` +
  ` · caller-pinned 512 sets stayed put: ${anyPinned ? 'yes' : '⚠️ none seen — probe may be reading the request, not the delivery'}` +
  `${anyStuck ? ' · ⚠️ some sets stayed 1024 under the flag' : ''}`);
console.log(`   arithmetic: bytes = width x height x 4 B x (3 targets for a bake set) x 4/3 mip chain.` +
  ` Widths MEASURED off live textures; no browser API reports real VRAM.\n`);

await browser.close();
if (child) child.kill();
process.exit(0);
