#!/usr/bin/env node
/**
 * DOES A ROUND RESET FREE WHAT IT THROWS AWAY? — the six world pickups, measured.
 *
 * `resetRound()` sweeps every field item, then `spawnWorldGadgets()` + `spawnWorldSledge()`
 * build six replacements (five `buildGadget()`s and a `buildSledgeProp()`). Unparenting frees
 * nothing on the GPU, so before the `ownedBuild` fix each reset orphaned six props' worth of
 * geometries and allocated six more — every 28 s in capture, and on every retry/death/win.
 *
 *   node harness/_vram1_reset.mjs [--port 5201] [--n 10] [--headed]
 *
 * A/B IN ONE SESSION, WITHOUT A SECOND CHECKOUT. Phase A nulls `ownedBuild`/`gadgetObj` on
 * every field item immediately before the reset, which makes the sweep's two optional-chained
 * `dispose()` calls no-op — byte-for-byte the behaviour of the code before the fix. Phase B
 * leaves the handles alone. Same page, same seed, same camera: the only variable is whether
 * the sweep is allowed to free anything.
 *
 * READING THE NUMBER. `renderer.info.memory.geometries` counts geometries three.js has
 * UPLOADED — `WebGLGeometries.get()` increments on first render use and `onGeometryDispose`
 * decrements, so a prop that never comes on screen is never counted either way. That is why
 * this probe measures at the spawn, where the sledge lies dead ahead on the first frame: the
 * slope of the counter across resets is the leak, not the absolute value.
 *
 * One navigation, one uninterrupted session — the `@vite/client` stub is copied from
 * `mechanics.mjs`/`_reset2-loadout.mjs` for the same reason it exists there.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const flag = (n) => argv.includes(`--${n}`);
const PORT = +opt('port', 5201);
const N = +opt('n', 10);

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
});

let child = null;
if (!(await portOpen(PORT))) {
  child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  child.stdout.on('data', () => {});
  child.stderr.on('data', (d) => process.stderr.write(String(d)));
  const t0 = Date.now();
  while (!(await portOpen(PORT))) {
    if (Date.now() - t0 > 60000) { console.error('vite failed to start'); process.exit(3); }
    await new Promise((r) => setTimeout(r, 250));
  }
}

const browser = await chromium.launch({
  headless: !flag('headed'),
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-frame-rate-limit',
    '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let navs = 0;
page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs++; });
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
await page.route('**/@vite/client', (route) => route.fulfill({
  status: 200,
  contentType: 'application/javascript',
  body: `const noop = () => {};
export const createHotContext = () => ({ accept: noop, acceptExports: noop, dispose: noop,
  prune: noop, decline: noop, invalidate: noop, on: noop, off: noop, send: noop, data: {} });
export const updateStyle = () => {};
export const removeStyle = () => {};
export const injectQuery = (url) => url;
export const ErrorOverlay = class {};
`,
}));

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });

const t0 = Date.now();
await page.goto(`http://127.0.0.1:${PORT}/?view=game.play&seed=s4`, { waitUntil: 'load', timeout: 45000 });
await page.waitForFunction(
  () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
  null, { timeout: 420000 });
const gate = await page.$('#rrr-play-gate');
if (gate) { await page.click('#rrr-play-btn').catch(() => page.click('#rrr-play-gate')); await page.waitForTimeout(700); }
console.log(`\n  booted in ${((Date.now() - t0) / 1000).toFixed(1)} s · navigations ${navs}\n`);

/** renderer.info + the world census, so a "saving" that quietly stopped respawning is visible. */
const sample = () => page.evaluate(() => {
  const e = window.__rrr.engine;
  const m = e.renderer.info.memory;
  const loose = e.limbField.items.filter((i) => i.inWorld);
  return {
    geometries: m.geometries,
    textures: m.textures,
    programs: e.renderer.info.programs?.length ?? -1,
    loose: loose.length,
    kinds: loose.map((i) => i.gadget ?? i.type).sort().join(','),
  };
});

/**
 * One reset, then let the renderer actually draw — the counter only moves for geometries that
 * have been uploaded, so sampling on the same frame as the reset would read the old world.
 */
const cycle = async (leak) => {
  await page.evaluate((leakMode) => {
    const e = window.__rrr.engine;
    // PHASE A: strip the ownership records so the sweep's `dispose()` calls no-op. This is
    // exactly what the pre-fix sweep did — unparent, de-list, free nothing.
    if (leakMode) {
      for (const it of e.limbField.items) { it.ownedBuild = null; it.gadgetObj = null; }
    }
    e.resetRound();
  }, leak);
  await page.waitForTimeout(450);
};

const run = async (label, leak, n) => {
  const rows = [];
  for (let i = 0; i < n; i++) { await cycle(leak); rows.push(await sample()); }
  const first = rows[0], last = rows[rows.length - 1];
  const slope = (last.geometries - first.geometries) / (n - 1);
  console.log(`  ---- ${label} · ${n} resets ----`);
  console.log(`   geometries ${rows.map((r) => r.geometries).join(' ')}`);
  console.log(`   textures   ${rows.map((r) => r.textures).join(' ')}`);
  console.log(`   world      loose=${last.loose} kinds=${last.kinds}`);
  console.log(`   NET ${last.geometries - first.geometries >= 0 ? '+' : ''}${last.geometries - first.geometries}`
    + ` geometries over ${n - 1} resets  ·  ${slope.toFixed(2)} per reset\n`);
  return { rows, slope, first, last };
};

// Settle first: the opening rounds still bring things on screen for the first time, and that
// is an upload, not a leak. Measure from a world that has already been drawn once.
await cycle(false);
await cycle(false);
console.log(`  warm: ${JSON.stringify(await sample())}\n`);

const A = await run('PHASE A — sweep frees nothing (pre-fix behaviour)', true, N);
const B = await run('PHASE B — sweep disposes ownedBuild + gadgetObj (fixed)', false, N);

console.log('  ---- VERDICT ----');
console.log(`   pre-fix   ${A.slope.toFixed(2)} geometries leaked per reset`);
console.log(`   fixed     ${B.slope.toFixed(2)} geometries per reset`);
console.log(`   world intact: loose=${B.last.loose} (expect 6+ incl. the six pickups)`);
console.log(`   kinds: ${B.last.kinds}`);
console.log(`\n  navigations: ${navs} (expect 1) · page errors: ${pageErrors.length}`);
for (const e of pageErrors.slice(0, 5)) console.log(`   ! ${e.slice(0, 200)}`);

if (!flag('keep')) { await browser.close(); if (child) child.kill(); }
process.exit(0);
