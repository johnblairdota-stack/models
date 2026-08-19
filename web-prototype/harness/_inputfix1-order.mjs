#!/usr/bin/env node
/**
 * `inputfix-1` DIAGNOSTIC #2 — IS THE SLOW-FRAME FAILURE ORDER-DEPENDENT?
 *
 * `_inputfix1-diag.mjs` proved the LATCH IS NOT THE PROBLEM: the exact sub-frame keydown+keyup
 * `mechanics.mjs` dispatches lands, `once` holds it, `consume()` reads it and `interact()`
 * returns `attach` — with and without a CPU hog. So the suite's FAIL must depend on the state
 * the `inputs` group leaves behind, which is the hazard `resetBody()`'s own header warns about.
 *
 * This replays `mechanics.mjs`'s group ORDER (resetBody -> inputs -> resetBody -> slowframes)
 * and dumps, at the press, everything the check cannot see: which item was staged, what
 * `nearest()` actually returns, what the target socket is, and what `interact()` returned.
 *
 *   node harness/_inputfix1-order.mjs [--port 5197]
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PORT = +opt('port', 5197);

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
  headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-frame-rate-limit',
    '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.route('**/@vite/client', (route) => route.fulfill({
  status: 200, contentType: 'application/javascript',
  body: `const noop = () => {};
export const createHotContext = () => ({ accept: noop, acceptExports: noop, dispose: noop,
  prune: noop, decline: noop, invalidate: noop, on: noop, off: noop, send: noop, data: {} });
export const updateStyle = () => {}; export const removeStyle = () => {};
export const injectQuery = (url) => url; export const ErrorOverlay = class {};
`,
}));
let navs = 0;
page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs++; });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });

console.log('\n  INPUTFIX ORDER DIAG  game.play\n');
await page.goto(`http://127.0.0.1:${PORT}/?view=game.play`, { waitUntil: 'load', timeout: 45000 });
await page.waitForFunction(
  () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
  null, { timeout: 420000 });
const gate = await page.$('#rrr-play-gate');
if (gate) { await page.click('#rrr-play-btn').catch(() => page.click('#rrr-play-gate')); await page.waitForTimeout(700); }
console.log(`  booted · navigations: ${navs}`);

// ---- the whole loose pool, with the two facts `nearest()` actually uses
const pool = () => page.evaluate(() => {
  const e = window.__rrr.engine, p = e.player;
  return e.limbField.items.map((i, ix) => ({
    ix, id: String(i.id).slice(-28), type: i.type, gadget: i.gadget ?? null,
    kind: i.socketKind, label: i.label, inWorld: i.inWorld,
    parent: i.root.parent?.name || i.root.parent?.type || null,
    d: +Math.sqrt(i.root.position.distanceToSquared(p.pos)).toFixed(3),
  }));
});
const st = () => page.evaluate(() => {
  const e = window.__rrr.engine, p = e.player;
  const n = e.limbField.nearest(p.pos, 1.3);
  return {
    held: p.rig.held?.label ?? null,
    loose: e.limbField.items.filter((i) => i.inWorld).length,
    sockets: ['hipL', 'hipR', 'shoulderL', 'shoulderR'].map((s) => `${s}:${p.rig.occupant(s)}`).join(' '),
    nearest: n ? `${n.label}/${n.socketKind}/${n.type} d=${Math.sqrt(n.root.position.distanceToSquared(p.pos)).toFixed(3)}` : null,
    interactCd: +(p._interactCd ?? 0).toFixed(3),
    sledgeOwned: !!p.sledge?.owned,
  };
});

// ---- instrument interact() so the press's real outcome is visible
await page.evaluate(() => {
  const pl = window.__rrr.engine.player;
  const proto = Object.getPrototypeOf(pl);
  const orig = proto.interact;
  window.__ints = [];
  proto.interact = function (...a) {
    const r = orig.apply(this, a);
    window.__ints.push({ target: a[2] ?? null, kind: r?.kind ?? (r === null ? 'null' : String(r)), socket: r?.socket ?? null });
    return r;
  };
});
const ints = async (tag) => {
  const v = await page.evaluate(() => { const v = window.__ints; window.__ints = []; return v; });
  console.log(`     interact(${tag}): ${JSON.stringify(v)}`);
};

async function resetBody(tag) {
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    p.rig.dropHeld?.();
    for (const s of ['shoulderL', 'shoulderR', 'hipL', 'hipR']) {
      if (p.rig.occupant(s) === 'empty') p.rig.refit?.(s);
    }
    p.vel.set(0, 0, 0);
  });
  await page.waitForTimeout(500);
  console.log(`  resetBody(${tag}): ${JSON.stringify(await st())}`);
}

// ============================================================ replay `inputs` verbatim
await resetBody('pre-inputs');
console.log('\n  === inputs group (verbatim) ===');
await page.keyboard.down('KeyW'); await page.waitForTimeout(600); await page.keyboard.up('KeyW');
await page.mouse.move(640, 360);
await page.mouse.move(900, 360);
await page.waitForTimeout(300);
await page.evaluate(() => {
  const e = window.__rrr.engine, p = e.player;
  if (p.rig.occupant('hipR') === 'limb') p.rig.detach('hipR');
});
await page.waitForTimeout(600);
await page.evaluate(() => {
  const e = window.__rrr.engine, p = e.player;
  const it = e.limbField.items.find((i) => i.inWorld && i.type !== 'sledge' && !i.gadget)
          ?? e.limbField.items.find((i) => i.inWorld);
  if (it) it.root.position.set(p.pos.x, e.room.floorY + 0.1, p.pos.z);
});
await page.waitForTimeout(400);
await page.keyboard.press('KeyE');
await page.waitForTimeout(500);
await ints('inputs-E1');
await page.evaluate(() => {
  const e = window.__rrr.engine, p = e.player;
  p.rig.fitGadget('shoulderL', 'nailgun');
  const it = e.limbField.items.find((i) => i.inWorld && i.root === p.unit.limbs.armL);
  if (it) it.root.position.set(p.pos.x, e.room.floorY + 0.1, p.pos.z);
});
await page.waitForTimeout(400);
await page.keyboard.press('KeyE');
await page.waitForTimeout(500);
await ints('inputs-E2');
const preQ = await st();
console.log(`  pre-Q: ${JSON.stringify(preQ)}`);
if (preQ.held) { await page.keyboard.press('KeyQ'); await page.waitForTimeout(500); }
await page.evaluate(() => {
  const e = window.__rrr.engine, p = e.player;
  if (p.rig.occupant('shoulderL') === 'gadget') p.rig.detach('shoulderL');
  const original = p.unit.limbs.armL;
  const tracked = (p.rig.held?.root === original) ? p.rig.held
    : e.limbField.items.find((i) => i.root === original);
  if (tracked) p.rig.attach('shoulderL', tracked);
  else p.rig.refit?.('shoulderL');
});
await page.waitForTimeout(300);
console.log(`  post-inputs: ${JSON.stringify(await st())}`);

// ============================================================ resetBody + slowframes
await resetBody('pre-slowframes');
console.log('\n  === slowframes group (verbatim) ===');
console.log('  POOL before staging:');
for (const r of await pool()) console.log(`     ${JSON.stringify(r)}`);

await page.evaluate(() => {
  const e = window.__rrr.engine, p = e.player;
  for (const s of ['hipL', 'hipR', 'shoulderL', 'shoulderR']) {
    if (p.rig.occupant(s) === 'limb') { p.rig.detach(s); break; }
  }
});
await page.waitForTimeout(600);
const staged = await page.evaluate(() => {
  const e = window.__rrr.engine, p = e.player;
  const it = e.limbField.items.find((i) => i.inWorld && i.type !== 'sledge' && !i.gadget)
          ?? e.limbField.items.find((i) => i.inWorld);
  if (it) it.root.position.set(p.pos.x, e.room.floorY + 0.1, p.pos.z);
  return it ? { id: String(it.id).slice(-28), type: it.type, kind: it.socketKind, label: it.label,
    gadget: it.gadget ?? null, parent: it.root.parent?.name || it.root.parent?.type || null } : null;
});
await page.waitForTimeout(400);
console.log(`  staged: ${JSON.stringify(staged)}`);
console.log('  POOL after staging:');
for (const r of await pool()) console.log(`     ${JSON.stringify(r)}`);

const a = await st();
await page.evaluate(() => { window.__ints = []; });
await page.evaluate(() => {
  const opts = { code: 'KeyE', key: 'e', bubbles: true };
  window.dispatchEvent(new KeyboardEvent('keydown', opts));
  window.dispatchEvent(new KeyboardEvent('keyup', opts));
});
await page.waitForTimeout(900);
const b = await st();
console.log(`\n  before ${JSON.stringify(a)}`);
console.log(`  after  ${JSON.stringify(b)}`);
await ints('slowframes-E');
const verdict = (b.held !== a.held || b.loose !== a.loose);
console.log(`  MECHANICS' PREDICATE (held||loose): ${verdict ? 'PASS' : 'FAIL'}`);
console.log(`  sockets changed: ${a.sockets !== b.sockets}  ("${a.sockets}" -> "${b.sockets}")`);
console.log('  POOL after press:');
for (const r of await pool()) console.log(`     ${JSON.stringify(r)}`);

console.log(`\n  navigations: ${navs} · page errors: ${pageErrors.length}`);
if (pageErrors.length) console.log('  ', pageErrors.slice(0, 3).join(' | ').slice(0, 400));
await browser.close();
if (child) child.kill();
process.exit(0);
