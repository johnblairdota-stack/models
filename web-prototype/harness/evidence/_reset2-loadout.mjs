#!/usr/bin/env node
/**
 * WHAT SURVIVES A RESPAWN? — the loadout census `mechanics`' reset check cannot see.
 *
 * John, 2026-08-10: *"I escaped with the skates on and respawned with them. we were supposed
 * to have fixed the reset not working on load out and all the items."* `mechanics` reads 12/12
 * with that bug live, so the check is blind to something. This probe enumerates EVERY way a
 * round can leave an item on the body, stages all of them at once, presses R, and reports
 * which ones came back.
 *
 *   node harness/evidence/_reset2-loadout.mjs [--port 5199]
 *
 * One navigation, one uninterrupted session — the `@vite/client` stub is copied from
 * `mechanics.mjs` for the same reason it exists there.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const flag = (n) => argv.includes(`--${n}`);
const PORT = +opt('port', 5199);

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
export const updateStyle = (id, content) => {
  let e = document.querySelector('style[data-vite-dev-id="' + id + '"]');
  if (!e) { e = document.createElement('style'); e.setAttribute('data-vite-dev-id', id);
    document.head.appendChild(e); }
  e.textContent = content;
};
export const removeStyle = (id) => {
  document.querySelector('style[data-vite-dev-id="' + id + '"]')?.remove();
};
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

/**
 * THE LOADOUT CENSUS. Everything a round can leave attached to, held by, or owed to the body.
 * Deliberately reads the rig's own accessors rather than re-deriving them out here.
 */
const loadout = () => page.evaluate(() => {
  const e = window.__rrr.engine, p = e.player, rig = p.rig;
  const S = ['shoulderL', 'shoulderR', 'hipL', 'hipR'];
  const LIMB_OF = { shoulderL: 'armL', shoulderR: 'armR', hipL: 'legL', hipR: 'legR' };
  return {
    skates: !!rig.skates,
    gadgetSockets: S.filter((s) => rig.occupant(s) === 'gadget')
      .map((s) => `${s}=${rig.sockets[s].item?.gadget}`).join(','),
    gadgetsFitted: Object.keys(rig.gadgetsFitted ?? {}).join(','),
    // A socket holding SOMEONE ELSE'S limb, or the body's own limb in the wrong socket:
    // occupant() says 'limb' either way, which is why the existing check cannot see it.
    foreign: S.filter((s) => rig.occupant(s) === 'limb'
      && rig.sockets[s].item?.root !== p.unit.limbs[LIMB_OF[s]]).join(','),
    sockets: S.map((s) => `${s}:${rig.occupant(s)}`).join(' '),
    held: rig.held?.label ?? null,
    sledgeOwned: !!p.sledge?.owned,
    sledgeEquipped: !!p.sledge?.equipped,
    sledgeDrawn: !!p.sledge?.root?.parent,
    loose: e.limbField.items.filter((i) => i.inWorld).length,
    looseKinds: e.limbField.items.filter((i) => i.inWorld)
      .map((i) => i.gadget ?? i.type).sort().join(','),
    arms: rig.caps.arms, legs: rig.caps.legs, gait: rig.caps.gait ?? null,
    fires: e.weapons?.fires?.length ?? null,
  };
});

// ---- 1. a canonical spawn through the production path
await page.evaluate(() => window.__rrr.engine.resetRound());
await page.waitForTimeout(800);
const base = await loadout();
console.log('  SPAWN     ', JSON.stringify(base));

// ---- 2. kit the body out with everything a round can leave on it
const staged = await page.evaluate(() => {
  const e = window.__rrr.engine, p = e.player, rig = p.rig, field = e.limbField;
  const out = {};
  // ⚠️ ORDER MATTERS AND IT IS THE GAME'S RULE, NOT THE PROBE'S: `detach()` on a LEG calls
  // `removeSkates()`, because they are bolted to both ankles. Cross the legs FIRST or the
  // skates this whole probe exists for are taken off again by the staging itself.
  //
  // (a) the body's own legs, crossed — occupant() reads 'limb' on both, but they are each
  //     other's, which is a real state (scavenge a part, fit it to the wrong hip)
  const l = rig.detach('hipL', { voluntary: true });
  const r = rig.detach('hipR', { voluntary: true });
  out.crossed = !!(l && r && rig.attach('hipL', r) && rig.attach('hipR', l));
  // (b) rocket skates — `fitSkates()`, the same call `Player.interact()` makes
  out.skates = rig.fitSkates();
  // (c) a gadget bolted into a socket — the arm pops off and lands on the floor
  out.nailgun = rig.fitGadget('shoulderR', 'nailgun').ok;
  // (d) a limb carried in a fist — the arm the nail gun just displaced
  const loose = field.items.find((i) => i.inWorld && i.type === 'limb');
  out.held = loose ? rig.pickUp(loose) : 'no loose limb';
  // (e) the hammer, found and drawn
  p.sledge.owned = true; out.sledge = !!p.sledge.equip?.();
  return out;
});
await page.waitForTimeout(700);
const wrecked = await loadout();
console.log('  STAGED    ', JSON.stringify(staged));
console.log('  WRECKED   ', JSON.stringify(wrecked));

// ---- 3. retry the advertised way: R, no keyup
await page.evaluate(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', key: 'r', bubbles: true }));
});
await page.waitForTimeout(1100);
const after = await loadout();
console.log('  AFTER R   ', JSON.stringify(after));

// ---- 4. what came back
console.log('\n  ---- SURVIVED THE RESPAWN ----');
const leaks = [];
const cmp = (k, want) => {
  const got = after[k];
  const ok = typeof want === 'function' ? want(got) : got === want;
  if (!ok) leaks.push(`${k}: ${JSON.stringify(got)} (spawn had ${JSON.stringify(base[k])})`);
  console.log(`   ${ok ? 'ok  ' : 'LEAK'}  ${k.padEnd(16)} ${JSON.stringify(got)}`);
};
cmp('skates', false);
cmp('gadgetSockets', '');
cmp('gadgetsFitted', '');
cmp('foreign', '');
cmp('sockets', base.sockets);
cmp('held', null);
cmp('sledgeOwned', false);
cmp('sledgeEquipped', false);
cmp('sledgeDrawn', false);
cmp('loose', base.loose);
cmp('looseKinds', base.looseKinds);
cmp('arms', base.arms);
cmp('legs', base.legs);

console.log(`\n  ${leaks.length} leak(s)`);
for (const l of leaks) console.log(`   · ${l}`);
console.log(`\n  navigations: ${navs} (expect 1) · page errors: ${pageErrors.length}`);
for (const e of pageErrors.slice(0, 3)) console.log(`   ! ${e.slice(0, 200)}`);

if (!flag('keep')) { await browser.close(); if (child) child.kill(); }
process.exit(0);
