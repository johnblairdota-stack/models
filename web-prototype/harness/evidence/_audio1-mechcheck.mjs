#!/usr/bin/env node
/**
 * MECHANICS CONFORMANCE — does every advertised mechanic still DO what it claims?
 *
 * WHY THIS EXISTS, and it is four measured failures, not a hypothesis. In one evening a human
 * playing the game found four bugs that the entire existing harness passed clean:
 *
 *   E and Q did nothing          `playtest.mjs`'s probes never pressed them
 *   rooms vanished while walking every capture looked correct; the Director never walked there
 *   refitted limbs never moved   a frozen limb is PERFECT in any single frame
 *   punching had no animation    nothing ever attacked while holding plain limbs
 *
 * None threw. None changed a pixel the capture tools were pointed at. `shoot.mjs` answers
 * "does it look right", `playtest.mjs` answers "does it respond once". Neither answers **"does
 * this mechanic still do the thing it says it does, over time, under real input"** — and that
 * is where every one of these lived.
 *
 * The four assertion families below are derived directly from those four bugs:
 *
 *   travel()      motion over TIME, not a pose in one frame. A frozen joint is invisible to a
 *                 screenshot and obvious to a range-of-motion measurement.
 *   worldPresent() the architecture is actually rendering. Two lit robots in a void is a
 *                 plausible-looking frame; "0 visible spaces" is not.
 *   contract()    every key on the game's own control card must produce observable change.
 *                 An advertised control that does nothing is the worst bug class we ship.
 *   underLoad()   re-run an input contract with the frame rate deliberately starved. The E/Q
 *                 bug ONLY appeared when frames were slow, which is exactly when a player is
 *                 loading in — so a test at 60 fps could never have caught it.
 *
 *   node harness/mechanics.mjs                 run everything
 *   node harness/mechanics.mjs --only inputs   one group
 *   node harness/mechanics.mjs --shots         write a picture per check
 *   node harness/mechanics.mjs --keep          leave the browser open
 *
 * Exits non-zero on any failure so a loop can gate on it.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const flag = (n) => argv.includes(`--${n}`);
const ONLY = opt('only', null);
const SHOTDIR = path.join(ROOT, 'progress/mechanics');
const PORT = 5209;                      // audio-1's own server — 5193 hosts a frozen snapshot, do not touch

const results = [];
const pass = (name, detail = '') => { results.push({ ok: true, name, detail }); console.log(`   ok   ${name.padEnd(46)} ${detail}`); };
const fail = (name, detail = '') => { results.push({ ok: false, name, detail }); console.log(`  FAIL  ${name.padEnd(46)} ${detail}`); };
const skip = (name, why) => { results.push({ skip: true, name, why }); console.log(`  skip  ${name.padEnd(46)} ${why}`); };
const note = (s) => console.log(`   ·    ${s}`);

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
});

// ---------------------------------------------------------------- boot
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

await mkdir(SHOTDIR, { recursive: true });
const browser = await chromium.launch({
  headless: !flag('headed'),
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-frame-rate-limit',
    '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
// Own HMR socket only — a concurrent agent's save otherwise reloads the tab mid-run and the
// numbers describe two different documents. Same guard shoot.mjs needed.
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });

console.log('\n  MECHANICS  game.play\n');
await page.goto(`http://127.0.0.1:${PORT}/?view=game.play`, { waitUntil: 'load', timeout: 45000 });
await page.waitForFunction(
  () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
  null, { timeout: 180000 });
const gate = await page.$('#rrr-play-gate');
if (gate) { await page.click('#rrr-play-btn').catch(() => page.click('#rrr-play-gate')); await page.waitForTimeout(700); }

const shot = async (n) => { if (flag('shots')) await page.screenshot({ path: path.join(SHOTDIR, `${n}.png`) }); };

// ---------------------------------------------------------------- primitives
const state = () => page.evaluate(() => {
  const e = window.__rrr?.engine, p = e?.player, r = e?.room;
  if (!p) return null;
  const j = (n) => { const x = p.unit.joints[n]; return x ? [+x.rotation.x.toFixed(4), +x.rotation.y.toFixed(4), +x.rotation.z.toFixed(4)] : null; };
  return {
    pos: [+p.pos.x.toFixed(3), +p.pos.z.toFixed(3)],
    yaw: +(e.cam?.yaw ?? 0).toFixed(4),
    frames: window.__rrr.frames?.() ?? null,
    held: p.rig.held?.label ?? null,
    weapon: p.rig.activeWeapon,
    arms: p.rig.caps.arms, legs: p.rig.caps.legs,
    loose: e.limbField.items.filter((i) => i.inWorld).length,
    // The socket MAP, not just counts. A swap ejects one part and fits another, so every
    // count stays identical while the body genuinely changed — an assertion that watches
    // only totals reports a working swap as "nothing happened".
    sockets: ['hipL', 'hipR', 'shoulderL', 'shoulderR'].map((s) => `${s}:${p.rig.occupant(s)}`).join(' '),
    visibleSpaces: r?.visibleSpaces ? r.visibleSpaces() : null,
    playerSpaceVisible: r ? !!(r.spaceAt(p.pos)?.visible) : null,
    joints: {
      shoulderL: j('shoulderL'), shoulderR: j('shoulderR'),
      elbowL: j('elbowL'), elbowR: j('elbowR'),
      hipL: j('hipL'), hipR: j('hipR'), kneeL: j('kneeL'), kneeR: j('kneeR'),
    },
  };
});

/**
 * RANGE OF MOTION over a window, per joint axis. The assertion a still frame cannot make:
 * a limb welded in its rest pose photographs perfectly and travels zero.
 */
async function travel(during, ms = 1300, step = 60) {
  const seen = {};
  const t0 = Date.now();
  const stop = await during();
  while (Date.now() - t0 < ms) {
    const s = await state();
    for (const [k, v] of Object.entries(s?.joints ?? {})) {
      if (!v) continue;
      seen[k] ??= v.map((a) => ({ min: a, max: a }));
      v.forEach((a, i) => { seen[k][i].min = Math.min(seen[k][i].min, a); seen[k][i].max = Math.max(seen[k][i].max, a); });
    }
    await page.waitForTimeout(step);
  }
  if (typeof stop === 'function') await stop();
  return Object.fromEntries(Object.entries(seen).map(([k, ax]) =>
    [k, +Math.max(...ax.map((a) => a.max - a.min)).toFixed(4)]));
}

/** Starve the frame rate, so input contracts are tested where they actually broke. */
async function underLoad(fn, hogMs = 140) {
  await page.evaluate((ms) => {
    window.__hog = setInterval(() => { const t = performance.now(); while (performance.now() - t < ms); }, 16);
  }, hogMs);
  try { return await fn(); }
  finally { await page.evaluate(() => { clearInterval(window.__hog); window.__hog = null; }); }
}

/**
 * PUT THE BODY BACK BEFORE EVERY GROUP.
 *
 * ⚠️ The first version of this suite did not, and it reported two FALSE FAILURES the moment
 * an unrelated change altered which socket ends up empty: `animation` ran on whatever
 * `inputs` had left dismembered, measured a missing left leg as "0 travel", and called it a
 * frozen limb. A suite whose result depends on the order and side-effects of earlier groups
 * is measuring its own history, not the game — and it can just as easily report a false PASS.
 *
 * Uses `rig.refit()`, which rebuilds from `unit.limbs`; the obvious `sockets[s].item` route
 * reads null because `detach()` clears it (that bug cost the game its round-reset once).
 */
async function resetBody() {
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    p.rig.dropHeld?.();
    for (const s of ['shoulderL', 'shoulderR', 'hipL', 'hipR']) {
      if (p.rig.occupant(s) === 'empty') p.rig.refit?.(s);
    }
    p.vel.set(0, 0, 0);
  });
  await page.waitForTimeout(500);
  const s = await state();
  note(`reset: arms=${s.arms} legs=${s.legs} loose=${s.loose} weapon=${s.weapon}`);
  return s;
}

const groups = {};

// ---------------------------------------------------------------- 1. inputs
groups.inputs = async () => {
  // Every key the game's own control card advertises is a CONTRACT.
  const before = await state();
  await page.keyboard.down('KeyW'); await page.waitForTimeout(600); await page.keyboard.up('KeyW');
  const moved = await state();
  const d = Math.hypot(moved.pos[0] - before.pos[0], moved.pos[1] - before.pos[1]);
  d > 0.4 ? pass('W moves the player', `${d.toFixed(2)} m`) : fail('W moves the player', `${d.toFixed(2)} m`);

  await page.mouse.move(640, 360);
  const y0 = (await state()).yaw;
  await page.mouse.move(900, 360);
  await page.waitForTimeout(300);
  const y1 = (await state()).yaw;
  Math.abs(y1 - y0) > 0.01 ? pass('mouse turns the camera', `${(y1 - y0).toFixed(3)} rad`)
    : fail('mouse turns the camera', 'yaw unchanged');

  // E and Q, the two that silently did nothing for the whole project.
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    if (p.rig.occupant('hipR') === 'limb') p.rig.detach('hipR');
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const it = e.limbField.items.find((i) => i.inWorld);
    if (it) it.root.position.set(p.pos.x, e.room.floorY + 0.1, p.pos.z);
  });
  await page.waitForTimeout(400);
  const preE = await state();
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(500);
  const postE = await state();
  (postE.held !== preE.held || postE.loose !== preE.loose || postE.sockets !== preE.sockets)
    ? pass('E acts on a limb in reach', `held ${preE.held}->${postE.held}, loose ${preE.loose}->${postE.loose}, sockets ${preE.sockets === postE.sockets ? 'same' : 'changed'}`)
    : fail('E acts on a limb in reach', `nothing changed (${preE.sockets})`);

  const preQ = await state();
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(500);
  const postQ = await state();
  (preQ.held && postQ.held !== preQ.held)
    ? pass('Q drops what is held', `${preQ.held} -> ${postQ.held}`)
    : (preQ.held ? fail('Q drops what is held', 'still held') : skip('Q drops what is held', 'nothing was held'));
  await shot('inputs');
};

// ---------------------------------------------------------------- 2. slow frames
groups.slowframes = async () => {
  // THE E/Q BUG ONLY EXISTED HERE. At 60 fps a keypress spans several frames and any
  // implementation looks correct; starve the loop and a press must still not be lost.
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    for (const s of ['hipL', 'hipR', 'shoulderL', 'shoulderR']) {
      if (p.rig.occupant(s) === 'limb') { p.rig.detach(s); break; }
    }
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const it = e.limbField.items.find((i) => i.inWorld);
    if (it) it.root.position.set(p.pos.x, e.room.floorY + 0.1, p.pos.z);
  });
  await page.waitForTimeout(400);

  // ⚠️ DISPATCHED SYNCHRONOUSLY, AND THAT IS THE WHOLE POINT — DO NOT "SIMPLIFY" THIS TO
  // `page.keyboard.press()`.
  //
  // The first version of this check used `keyboard.press()` under a CPU hog and it PASSED
  // WITH THE BUG DELIBERATELY REVERTED — i.e. it could not detect the defect it exists for.
  // `press()` sends keydown and keyup as two separate CDP messages with real time between
  // them, so whether a frame lands in the gap is luck, and on a fast machine the key is
  // usually still held when rAF runs. A test whose result depends on a race is not a test.
  //
  // Firing both events inside ONE synchronous evaluate makes it deterministic: no rAF can
  // possibly run between them, which is exactly the condition a starved frame rate creates
  // for a real player. Anything reading the HELD-key set is then guaranteed to miss it, and
  // only a latch survives.
  const a = await state();
  await page.evaluate(() => {
    const opts = { code: 'KeyE', key: 'e', bubbles: true };
    window.dispatchEvent(new KeyboardEvent('keydown', opts));
    window.dispatchEvent(new KeyboardEvent('keyup', opts));   // same task — no frame between
  });
  await page.waitForTimeout(900);
  const b = await state();
  (b.held !== a.held || b.loose !== a.loose)
    ? pass('a keypress survives a starved frame rate', `loose ${a.loose}->${b.loose}`)
    : fail('a keypress survives a starved frame rate', 'press was dropped between frames');
  await shot('slowframes');
};

// ---------------------------------------------------------------- 3. animation
groups.animation = async () => {
  const walk = () => travel(async () => {
    await page.keyboard.down('KeyW');
    return async () => page.keyboard.up('KeyW');
  });

  const orig = await walk();
  note(`original limbs walking: ${JSON.stringify(orig)}`);
  // Judge only the legs that are actually ON the body — a missing limb travels 0 and that is
  // correct, not a defect. Conflating "absent" with "frozen" is what made this fail falsely.
  const legs = await page.evaluate(() => {
    const p = window.__rrr.engine.player;
    return ['hipL', 'hipR'].filter((s) => p.rig.occupant(s) === 'limb');
  });
  const present = legs.map((s) => s === 'hipL' ? ['hipL', 'kneeL'] : ['hipR', 'kneeR']).flat();
  const moving = present.filter((k) => (orig[k] ?? 0) > 0.05);
  (present.length && moving.length === present.length)
    ? pass('original limbs animate while walking', present.map((k) => `${k} ${orig[k]}`).join(' '))
    : fail('original limbs animate while walking', `attached ${present} but only ${moving} moved`);

  // Refit a limb, then demand the SAME range of motion. This is the assertion that a
  // screenshot can never make, and the one that would have caught the frozen refit.
  const refit = await page.evaluate(async () => {
    const e = window.__rrr.engine, p = e.player;
    if (p.rig.occupant('hipR') === 'limb') p.rig.detach('hipR');
    await new Promise((r) => setTimeout(r, 400));
    const it = e.limbField.items.find((i) => i.inWorld && i.socketKind === 'leg' && i.type === 'limb');
    if (it) it.root.position.set(p.pos.x, e.room.floorY + 0.1, p.pos.z);
    await new Promise((r) => setTimeout(r, 250));
    const near = e.limbField.nearest(p.pos, 1.25);
    if (near) p.interact(e.limbField);
    return p.rig.occupant('hipR');
  });
  if (refit !== 'limb') skip('a refitted limb animates like an original', `could not refit (hipR=${refit})`);
  else {
    const after = await walk();
    note(`refitted limb walking: ${JSON.stringify(after)}`);
    (after.hipR > orig.hipR * 0.4 && after.kneeR > orig.kneeR * 0.4)
      ? pass('a refitted limb animates like an original', `hipR ${after.hipR} vs ${orig.hipR}`)
      : fail('a refitted limb animates like an original', `hipR ${after.hipR} kneeR ${after.kneeR} vs original ${orig.hipR}/${orig.kneeR} — frozen`);
  }

  // Every weapon the body can hold must produce visible motion when fired.
  const w = await page.evaluate(() => {
    const p = window.__rrr.engine.player;
    for (const s of ['shoulderL', 'shoulderR']) if (p.rig.occupant(s) === 'gadget') p.rig.detach(s);
    // ⚠️ AND PUT REAL ARMS BACK. Stripping the gadgets leaves the sockets EMPTY, so the body
    // has no hands, `activeWeapon` is correctly `null`, and the check then fails a working
    // punch because there is nothing to punch with. The point of this assertion is "plain
    // limbs animate", which requires plain limbs.
    for (const s of ['shoulderL', 'shoulderR']) if (p.rig.occupant(s) === 'empty') p.rig.refit?.(s);
    return p.rig.activeWeapon;
  });
  await page.waitForTimeout(500);
  const atk = await travel(async () => {
    await page.mouse.down(); await page.waitForTimeout(50); await page.mouse.up();
  }, 700, 50);
  note(`attack with ${w}: ${JSON.stringify(atk)}`);
  const armMoved = Math.max(atk.shoulderL ?? 0, atk.shoulderR ?? 0, atk.elbowL ?? 0, atk.elbowR ?? 0);
  armMoved > 0.05
    ? pass(`attacking with "${w}" animates`, `${armMoved.toFixed(3)} rad`)
    : fail(`attacking with "${w}" animates`, `arm moved ${armMoved.toFixed(4)} rad — no attack animation`);
  await shot('animation');
};

// ---------------------------------------------------------------- 4. world
groups.world = async () => {
  // "Two lit robots in a void" is a plausible frame. Assert the house is actually there,
  // from several places, because the fault followed the CAMERA and not the player.
  const anchors = ['study_w.north', 'gallery.mid', 'gallery.west', 'ballroom.centre', 'chapel.centre', 'service.mid'];
  let bad = 0;
  for (const a of anchors) {
    const ok = await page.evaluate((anchor) => {
      const e = window.__rrr.engine, p = e.player, room = e.room;
      const v = room.anchor(anchor);
      if (!v) return null;
      p.pos.copy(v); p.vel.set(0, 0, 0);
      return true;
    }, a);
    if (!ok) { note(`no anchor ${a}`); continue; }
    await page.waitForTimeout(650);
    const s = await state();
    if (s.playerSpaceVisible === false || s.visibleSpaces === 0) {
      bad++; note(`${a}: playerSpaceVisible=${s.playerSpaceVisible} visibleSpaces=${s.visibleSpaces}`);
    }
  }
  bad === 0
    ? pass("the player's own room is always rendered", `${anchors.length} positions`)
    : fail("the player's own room is always rendered", `${bad}/${anchors.length} positions hid it`);

  // And while MOVING, because the camera lags the player through doorways.
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const v = e.room.anchor('study_w.north'); if (v) p.pos.copy(v);
  });
  await page.waitForTimeout(500);
  let worstVisible = 99;
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 22; i++) {
    const s = await state();
    if (s.visibleSpaces != null) worstVisible = Math.min(worstVisible, s.visibleSpaces);
    if (s.playerSpaceVisible === false) worstVisible = 0;
    await page.waitForTimeout(90);
  }
  await page.keyboard.up('KeyW');
  worstVisible > 0
    ? pass('the world never empties while walking', `min visible spaces ${worstVisible}`)
    : fail('the world never empties while walking', 'the room the player is in went invisible mid-walk');
  await shot('world');
};

// ---------------------------------------------------------------- run
const order = ['inputs', 'slowframes', 'animation', 'world'];
for (const g of order) {
  if (ONLY && ONLY !== g) continue;
  console.log(`\n  — ${g} —`);
  try { await resetBody(); await groups[g](); }
  catch (e) { fail(`${g} group ran`, String(e).slice(0, 200)); }
}

if (pageErrors.length) fail('no runtime errors', pageErrors.slice(0, 2).join(' | ').slice(0, 220));
else pass('no runtime errors');

const ok = results.filter((r) => r.ok).length;
const bad = results.filter((r) => r.ok === false).length;
const sk = results.filter((r) => r.skip).length;
console.log(`\n  ${ok} passed · ${bad} failed · ${sk} skipped`);
if (flag('shots')) console.log(`  shots -> progress/mechanics/`);

if (!flag('keep')) { await browser.close(); if (child) child.kill(); }
process.exit(bad ? 1 : 0);
