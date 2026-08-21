#!/usr/bin/env node
/**
 * `inputfix-1` DIAGNOSTIC — WHO WIPES `Input.once`, AND WHEN.
 *
 * `mechanics.mjs`'s `slowframes` check regressed to FAIL ("press was dropped between frames").
 * The leading hypothesis was `unblock-1`'s focus/lock clearing eating the one-shot latch. This
 * boots ONCE and instruments every path that can touch the latch, so the attribution is a
 * measurement rather than a reading of the source.
 *
 * Instrumented WITHOUT a source change: `Input` is not on `window.__rrr`, but the live update
 * loop calls `input.consume('KeyB')` every frame, so patching `Input.prototype.consume` hands us
 * the live instance on the next frame. The module object is the same one `views/game.js` imported
 * (vite's ESM cache), so a dynamic `import('/src/game/player.js')` reaches the real class.
 *
 *   node harness/evidence/_inputfix1-diag.mjs [--port 5197]
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
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

// same @vite/client stub mechanics.mjs carries — another agent's save must not reload this page
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

let navs = 0;
page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs++; });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });

console.log('\n  INPUTFIX DIAG  game.play\n');
await page.goto(`http://127.0.0.1:${PORT}/?view=game.play`, { waitUntil: 'load', timeout: 45000 });
await page.waitForFunction(
  () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
  null, { timeout: 420000 });
const gate = await page.$('#rrr-play-gate');
if (gate) { await page.click('#rrr-play-btn').catch(() => page.click('#rrr-play-gate')); await page.waitForTimeout(700); }
console.log(`  booted · navigations so far: ${navs}`);

// ---------------------------------------------------------------- install the probe
await page.evaluate(async () => {
  const mod = await import('/src/game/player.js');
  const P = mod.Input.prototype;
  const D = window.__diag = { events: [], calls: [], onceLog: [], interacts: [], input: null, frames: 0 };
  const now = () => +performance.now().toFixed(1);

  const wrapOnce = (inst) => {
    const w = new Set(inst.once);
    w.add = function (k) { D.onceLog.push(['add', k, now()]); return Set.prototype.add.call(this, k); };
    w.delete = function (k) {
      if (this.has(k)) D.onceLog.push(['delete', k, now()]);
      return Set.prototype.delete.call(this, k);
    };
    w.clear = function () {
      D.onceLog.push(['CLEAR', [...this].join(',') || '(empty)', now(),
        (new Error().stack || '').split('\n').slice(2, 6).map((s) => s.trim()).join(' <- ')]);
      return Set.prototype.clear.call(this);
    };
    inst.once = w;
  };

  const origConsume = P.consume;
  P.consume = function (code) {
    if (!D.input) { D.input = this; wrapOnce(this); }
    const r = origConsume.call(this, code);
    if (r) D.calls.push(['consume->true', code, now()]);
    return r;
  };
  const origClear = P.clearInput;
  P.clearInput = function (latches = true) {
    D.calls.push(['clearInput', `latches=${latches}`, now(),
      (new Error().stack || '').split('\n').slice(2, 6).map((s) => s.trim()).join(' <- ')]);
    return origClear.call(this, latches);
  };

  const pl = window.__rrr.engine.player;
  const origInteract = Object.getPrototypeOf(pl).interact;
  Object.getPrototypeOf(pl).interact = function (...a) {
    const r = origInteract.apply(this, a);
    D.interacts.push([String(r && (r.kind ?? r.action ?? JSON.stringify(r))).slice(0, 60), now()]);
    return r;
  };

  for (const [t, tgt] of [['blur', window], ['focus', window],
    ['visibilitychange', document], ['pointerlockchange', document]]) {
    tgt.addEventListener(t, () => D.events.push([t, now(),
      `vis=${document.visibilityState} focus=${document.hasFocus?.()} lock=${!!document.pointerLockElement}`]), true);
  }
});
await page.waitForTimeout(400);

const seen = await page.evaluate(() => ({
  gotInput: !!window.__diag.input,
  focused: window.__diag.input?.focused, hasLock: window.__diag.input?.hasLock,
  hadLock: window.__diag.input?.hadLock,
  vis: document.visibilityState, docFocus: document.hasFocus?.(),
  webdriver: navigator.webdriver,
  paused: window.__rrr.pausedFrames?.(),
}));
console.log('  probe:', JSON.stringify(seen));

// ---------------------------------------------------------------- stage exactly like mechanics
async function stage() {
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    p.rig.dropHeld?.();
    for (const s of ['shoulderL', 'shoulderR', 'hipL', 'hipR']) {
      if (p.rig.occupant(s) === 'empty') p.rig.refit?.(s);
    }
    p.vel.set(0, 0, 0);
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    for (const s of ['hipL', 'hipR', 'shoulderL', 'shoulderR']) {
      if (p.rig.occupant(s) === 'limb') { p.rig.detach(s); break; }
    }
  });
  await page.waitForTimeout(600);
  const placed = await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const it = e.limbField.items.find((i) => i.inWorld && i.type !== 'sledge' && !i.gadget)
            ?? e.limbField.items.find((i) => i.inWorld);
    if (it) it.root.position.set(p.pos.x, e.room.floorY + 0.1, p.pos.z);
    return it ? { type: it.type, label: it.label, kind: it.socketKind, gadget: !!it.gadget } : null;
  });
  await page.waitForTimeout(400);
  return placed;
}

const st = () => page.evaluate(() => {
  const e = window.__rrr.engine, p = e.player;
  return {
    held: p.rig.held?.label ?? null,
    loose: e.limbField.items.filter((i) => i.inWorld).length,
    sockets: ['hipL', 'hipR', 'shoulderL', 'shoulderR'].map((s) => `${s}:${p.rig.occupant(s)}`).join(' '),
    nearest: (() => { const n = e.limbField.nearest(p.pos, 1.3); return n ? `${n.label}/${n.socketKind}` : null; })(),
    frames: window.__rrr.frames(),
    paused: window.__rrr.pausedFrames?.(),
  };
});

async function clearLog() {
  await page.evaluate(() => { const D = window.__diag; D.events.length = 0; D.calls.length = 0; D.onceLog.length = 0; D.interacts.length = 0; });
}
async function dumpLog(tag) {
  const D = await page.evaluate(() => ({
    events: window.__diag.events, calls: window.__diag.calls,
    onceLog: window.__diag.onceLog, interacts: window.__diag.interacts,
  }));
  console.log(`  -- ${tag} --`);
  for (const e of D.events) console.log('     event   ', JSON.stringify(e));
  for (const c of D.calls) console.log('     call    ', JSON.stringify(c));
  for (const o of D.onceLog) console.log('     once    ', JSON.stringify(o));
  for (const i of D.interacts) console.log('     interact', JSON.stringify(i));
  if (!D.events.length && !D.calls.length && !D.onceLog.length && !D.interacts.length) console.log('     (nothing)');
}

const subFramePress = () => page.evaluate(() => {
  const opts = { code: 'KeyE', key: 'e', bubbles: true };
  window.dispatchEvent(new KeyboardEvent('keydown', opts));
  window.dispatchEvent(new KeyboardEvent('keyup', opts));
});

async function underLoad(fn, hogMs = 140) {
  await page.evaluate((ms) => {
    window.__hog = setInterval(() => { const t = performance.now(); while (performance.now() - t < ms); }, 16);
  }, hogMs);
  try { return await fn(); } finally { await page.evaluate(() => { clearInterval(window.__hog); window.__hog = null; }); }
}

// ============================================================ A: sub-frame press, NO hog
let placed = await stage();
console.log(`\n  A · sub-frame press, no CPU hog · staged item ${JSON.stringify(placed)}`);
let a = await st(); await clearLog();
await subFramePress();
await page.waitForTimeout(900);
let b = await st();
console.log(`     before ${JSON.stringify(a)}`);
console.log(`     after  ${JSON.stringify(b)}`);
console.log(`     VERDICT ${(b.held !== a.held || b.loose !== a.loose) ? 'PASS' : 'FAIL'}`);
await dumpLog('A');

// ============================================================ B: sub-frame press, WITH hog (the real check)
placed = await stage();
console.log(`\n  B · sub-frame press UNDER 140 ms hog (mechanics' own check) · staged ${JSON.stringify(placed)}`);
a = await st(); await clearLog();
await underLoad(async () => { await subFramePress(); await page.waitForTimeout(900); });
b = await st();
console.log(`     before ${JSON.stringify(a)}`);
console.log(`     after  ${JSON.stringify(b)}`);
console.log(`     VERDICT ${(b.held !== a.held || b.loose !== a.loose) ? 'PASS' : 'FAIL'}`);
await dumpLog('B');

// ============================================================ C: does the latch itself survive?
// Set the latch by hand, wait under load WITHOUT any consumer running, and see who deletes it.
console.log('\n  C · latch survival: set once=KeyZ (nothing consumes KeyZ) and watch it under load');
await clearLog();
await page.evaluate(() => { window.__diag.input.once.add('KeyZ'); });
await underLoad(async () => { await page.waitForTimeout(1500); });
const zAlive = await page.evaluate(() => window.__diag.input.once.has('KeyZ'));
console.log(`     KeyZ still latched after 1.5 s under load: ${zAlive}`);
await dumpLog('C');

// ============================================================ D: real keyboard press for comparison
placed = await stage();
console.log(`\n  D · page.keyboard.press('KeyE') (two CDP messages), no hog · staged ${JSON.stringify(placed)}`);
a = await st(); await clearLog();
await page.keyboard.press('KeyE');
await page.waitForTimeout(700);
b = await st();
console.log(`     before ${JSON.stringify(a)}`);
console.log(`     after  ${JSON.stringify(b)}`);
console.log(`     VERDICT ${(b.held !== a.held || b.loose !== a.loose || b.sockets !== a.sockets) ? 'PASS' : 'FAIL'}`);
await dumpLog('D');

console.log(`\n  navigations: ${navs} · page errors: ${pageErrors.length}`);
if (pageErrors.length) console.log('  ', pageErrors.slice(0, 3).join(' | ').slice(0, 400));
await browser.close(); if (child) child.kill();
