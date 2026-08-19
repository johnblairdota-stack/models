#!/usr/bin/env node
/**
 * DOES PICKING SOMETHING UP FREE THE PROP YOU PICKED UP? — the two pickups that leave the field.
 *
 * Sibling of `_vram1_reset.mjs`, one path over. That probe measures the `resetRound()` sweep,
 * which frees every item still lying in the `LimbField`. THESE TWO NEVER REACH THAT SWEEP:
 *
 *   sledge   `Player.interact()` calls `field.take(item)` and unparents the holder, then
 *            `SledgeRig.equip()` mounts the rig's OWN prop (built in its constructor). The
 *            world prop from `spawnWorldSledge()` is now off the scene graph AND off the
 *            field — unreachable, so no sweep will ever see it again.
 *   skates   same shape: `rig.fitSkates()` calls `buildGadget('skates', …)` itself, so the
 *            pickup's prop from `LimbField.spawnGadget()` is orphaned by the same two lines.
 *
 * Unparenting frees nothing on the GPU. So before the fix, every pickup cost one prop's worth
 * of geometries and materials, permanently — and a pickup is not a rare event: the sledge is
 * the opening beat of every round, and capture resets the round every 28 s.
 *
 * The gadget-socket path is deliberately NOT tested here, because it does not have the bug:
 * `LimbRig.attach()` routes a world gadget to `fitGadget()` and returns WITHOUT `take()`, so
 * those items stay in the field and `resetRound()` already frees them (that is `_vram1`'s job).
 *
 *   node harness/_vram2_pickup.mjs [--port 5202] [--n 10] [--headed]
 *
 * A/B IN ONE SESSION, WITHOUT A SECOND CHECKOUT — the same trick `_vram1_reset.mjs` uses, for
 * the same reason. Phase A nulls `item.ownedBuild` on the target item in the same evaluate that
 * presses E, immediately before `interact()` runs, which makes the fix's optional-chained
 * `dispose()` no-op: byte-for-byte the behaviour of the code before the fix. Phase B leaves the
 * handle alone. Same page, same seed, same route, same camera — the only variable is whether
 * the pickup is allowed to free the prop it orphans.
 *
 * READING THE NUMBER. `renderer.info.memory.geometries` counts geometries three.js has
 * UPLOADED: `WebGLGeometries.get()` increments on first render use, `onGeometryDispose`
 * decrements. A prop that never came on screen is never counted either way — so this probe
 * TELEPORTS THE PLAYER ONTO EACH PICKUP AND WAITS FOR FRAMES BEFORE PRESSING E. That is not
 * decoration: it is what makes the leak observable at all, since the skates sit in the ballroom
 * and are never drawn from the study spawn. The slope of the counter across cycles is the leak.
 *
 * ⚠️ AND IT ASSERTS THE PICKUP ACTUALLY HAPPENED. An `interact()` that quietly returns null —
 * out of reach, on cooldown, a leg missing — leaks nothing and would print a beautifully flat
 * line that means the probe stopped testing, not that the bug is fixed. Every cycle checks the
 * returned `kind`, the field census, and the resulting body state; `picked` in the output is
 * the count that made it, and the verdict is void unless it equals 2 per cycle.
 *
 * One navigation, one uninterrupted session — the `@vite/client` stub is copied from
 * `_vram1_reset.mjs` for the same reason it exists there.
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
const PORT = +opt('port', 5202);
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
    loose: loose.length,
    kinds: loose.map((i) => i.gadget ?? i.type).sort().join(','),
  };
});

/**
 * Stand on a pickup so the camera is looking at it, and report how big its prop is.
 *
 * The size is counted off the item's own subtree — the geometries `ownedBuild.dispose()` is
 * responsible for — so the expected leak is MEASURED from the scene rather than guessed at,
 * and the counter's movement below can be checked against it.
 */
const walkTo = (which) => page.evaluate((w) => {
  const e = window.__rrr.engine;
  const item = e.limbField.items.find(
    (i) => (w === 'sledge' ? i.type === 'sledge' : i.socketKind === 'skates') && i.inWorld);
  if (!item) return { ok: false, why: `no ${w} in field` };
  const geos = new Set(), mats = new Set();
  item.root.traverse((o) => { if (o.geometry) geos.add(o.geometry); if (o.material) mats.add(o.material); });
  // The holder is added straight to the scene by `spawnGadget`/`spawnWorldSledge`, so its local
  // position IS world space. Keep the player's own Y — teleporting across one floor, not through it.
  e.player.pos.x = item.root.position.x;
  e.player.pos.z = item.root.position.z;
  e.player.vel.set(0, 0, 0);
  return { ok: true, geos: geos.size, mats: mats.size };
}, which);

/**
 * Press E on the pickup under our feet, and report what the game did about it.
 *
 * `_interactCd` is zeroed because `interact()` sets a 0.35 s lockout on every call and this
 * probe takes both pickups inside one cycle — without it the second press is refused and the
 * cycle silently tests half of what it claims to.
 */
const pressE = (which, leak) => page.evaluate(({ w, leakMode }) => {
  const e = window.__rrr.engine;
  const before = e.limbField.items.length;
  const item = e.limbField.items.find(
    (i) => (w === 'sledge' ? i.type === 'sledge' : i.socketKind === 'skates') && i.inWorld);
  if (!item) return { ok: false, why: `no ${w} in field` };
  // PHASE A: strip the ownership record so the fix's `dispose()` no-ops. Exactly what the
  // pre-fix pickup did — take, unparent, free nothing.
  if (leakMode) item.ownedBuild = null;
  e.player._interactCd = 0;
  const res = e.player.interact(e.limbField, e.eReach ?? 1.3, null);
  return {
    ok: !!res && (w === 'sledge' ? res.kind === 'sledgePickup' : res.kind === 'skates'),
    kind: res?.kind ?? null,
    took: before - e.limbField.items.length,          // expect 1: it left the field
    owned: !!e.player.sledge?.owned,
    onFeet: !!e.player.rig.skates,
    held: !!item.ownedBuild,                          // expect false after the fix
  };
}, { w: which, leakMode: leak });

/**
 * One cycle: fresh world, walk to the hammer and take it, walk to the skates and put them on.
 *
 * The waits are frames, not politeness. The counter only moves for geometries that have been
 * UPLOADED, so each prop has to be on screen for a few frames before it is taken — otherwise
 * both phases read zero and the probe proves nothing.
 */
const cycle = async (leak) => {
  await page.evaluate(() => window.__rrr.engine.resetRound());
  await page.waitForTimeout(400);
  const notes = [];
  for (const which of ['sledge', 'skates']) {
    const w = await walkTo(which);
    if (!w.ok) { notes.push({ which, ...w }); continue; }
    await page.waitForTimeout(500);            // let it be drawn, i.e. uploaded
    const p = await pressE(which, leak);
    notes.push({ which, ...w, ...p });
    await page.waitForTimeout(250);
  }
  return notes;
};

const run = async (label, leak, n) => {
  const rows = [], props = {};
  let picked = 0, want = 0, fails = [];
  for (let i = 0; i < n; i++) {
    const notes = await cycle(leak);
    for (const nt of notes) {
      want++;
      if (nt.ok) picked++; else fails.push(`${nt.which}: ${nt.why ?? `kind=${nt.kind}`}`);
      if (nt.geos) props[nt.which] = nt.geos;
    }
    rows.push(await sample());
  }
  const first = rows[0], last = rows[rows.length - 1];
  const slope = (last.geometries - first.geometries) / (n - 1);
  console.log(`  ---- ${label} · ${n} cycles ----`);
  console.log(`   geometries ${rows.map((r) => r.geometries).join(' ')}`);
  console.log(`   textures   ${rows.map((r) => r.textures).join(' ')}`);
  console.log(`   pickups    ${picked}/${want} succeeded${fails.length ? `  ! ${[...new Set(fails)].join(' | ')}` : ''}`);
  console.log(`   world      loose=${last.loose} kinds=${last.kinds}`);
  console.log(`   NET ${last.geometries - first.geometries >= 0 ? '+' : ''}${last.geometries - first.geometries}`
    + ` geometries over ${n - 1} cycles  ·  ${slope.toFixed(2)} per cycle\n`);
  return { rows, slope, first, last, picked, want, props };
};

// Settle first: the opening cycles bring the props on screen for the first time, and a first
// upload is not a leak. Measure from a world whose pickups have already been drawn once.
await cycle(false);
await cycle(false);
console.log(`  warm: ${JSON.stringify(await sample())}\n`);

const A = await run('PHASE A — pickup frees nothing (pre-fix behaviour)', true, N);
const B = await run('PHASE B — pickup disposes ownedBuild (fixed)', false, N);

const props = { ...A.props, ...B.props };
console.log('  ---- VERDICT ----');
console.log(`   prop size: sledge=${props.sledge ?? '?'} skates=${props.skates ?? '?'} geometries`
  + `  (expected leak ${(props.sledge ?? 0) + (props.skates ?? 0)}/cycle, minus any never drawn)`);
console.log(`   pre-fix   ${A.slope.toFixed(2)} geometries leaked per pickup cycle`);
console.log(`   fixed     ${B.slope.toFixed(2)} geometries per pickup cycle`);
console.log(`   pickups actually taken: A ${A.picked}/${A.want} · B ${B.picked}/${B.want}`
  + `${A.picked === A.want && B.picked === B.want ? '' : '   ⚠️ VERDICT VOID — the probe stopped testing'}`);
console.log(`   world intact: loose=${B.last.loose} kinds=${B.last.kinds}`);
console.log(`\n  navigations: ${navs} (expect 1) · page errors: ${pageErrors.length}`);
for (const e of pageErrors.slice(0, 5)) console.log(`   ! ${e.slice(0, 200)}`);

if (!flag('keep')) { await browser.close(); if (child) child.kill(); }
process.exit(0);
