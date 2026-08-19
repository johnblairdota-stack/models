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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const flag = (n) => argv.includes(`--${n}`);
const ONLY = opt('only', null);
const SHOTDIR = path.join(ROOT, 'progress/mechanics');
// ⚠️ NOT 5178 (shoot), NOT 5191 (playtest), AND SOMETIMES NOT 5193 EITHER — HANDOFF's own
// warning: :5193 has been left hosting a FROZEN snapshot build for John's tablet, and a tool
// that reuses whatever answers there silently grades stale code. `--port <n>` overrides the
// default so a caller who knows the shared port is occupied can point this at its own.
const PORT = +opt('port', 5193);

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

/**
 * 🚨 `routeWebSocket` ALONE IS NOT ENOUGH, AND THIS TOOL HAS BEEN TIMING OUT BECAUSE OF IT.
 *
 * A vite dev server watches the WHOLE PROJECT, not the directory it serves — so a concurrent
 * agent's save reloads this page mid-boot even on a private port. Silencing the socket stops the
 * reload *message*, but every transformed module still imports `createHotContext` from
 * `/@vite/client`, so the client is fetched and the connection is still attempted.
 *
 * `ball1` hit this three times in a row: `mechanics.mjs` timed out at its 180 s ready wait against
 * its own vite server while `exterior-1` was saving `exterior.js`, then passed 11/11 unchanged
 * against a static server. **The suite was reporting a red tree that was green.** HANDOFF already
 * records `routeWebSocket` as insufficient; `playtest.mjs` has carried the full stub for a while
 * and does not suffer this. Same stub, copied deliberately rather than imported, because these two
 * tools boot differently and a shared helper would couple them.
 */
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

console.log('\n  MECHANICS  game.play\n');
await page.goto(`http://127.0.0.1:${PORT}/?view=game.play`, { waitUntil: 'load', timeout: 45000 });
/**
 * ⚠️ 420 s — HISTORICALLY A STOPGAP, NOW MERELY GENEROUS. THE REGRESSION IT MASKED IS FIXED.
 *
 * The history, kept because the failure mode is the reusable part: `boot-1` measured cold boot at
 * 82 s on 2026-08-08; the gallery, both studies and a 9.6 m ballroom were then ported in and it
 * reached ~168–200 s. At a 180 s wait **this suite began timing out against its OWN vite server**
 * whenever another agent was saving, three times running, then passed 11/11 unchanged against a
 * static server. **A gate that reports a red tree that is actually green is worse than no gate** —
 * so the wait was raised, with a note saying plainly that a raised timeout is not a fix.
 *
 * ✅ **FIXED 2026-08-09 by `progkey-1`**: `wall.js` pinned `customProgramCacheKey` per panel per
 * layer, multiplying one shader into 22–36 identical compiles. Collapsed to per-arm constants,
 * **programs 1077 → 213, cold boot 199.7 s → 98.9 / 121.5 s, warm boot 39 s → 4.5 / 13.1 s.**
 *
 * ⚠️ **SO THIS NUMBER CAN COME DOWN — BUT LOWER IT ON A MEASUREMENT OF YOUR OWN, TAKEN ON A QUIET
 * MACHINE, NOT ON THIS PARAGRAPH.** It was deliberately not lowered when the fix landed, because
 * three agents were running and any boot timed under that load would have been inflated — which
 * is precisely the reasoning error that would set the wait too high all over again. 420 s costs
 * nothing on a healthy run; it only delays the report of a genuine hang.
 *
 * ⚠️ And note what the original incident really taught, which is not about shaders at all:
 * **a vite dev server watches the whole project, so another agent's save reloads your page
 * mid-compile even on your own private port.** The `@vite/client` stub below is the guard.
 */
await page.waitForFunction(
  () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
  null, { timeout: 420000 });
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
    // ⚠️ PREFER A PLAIN LIMB over whatever is first in array order — since `sledge-2` the world is
    // seeded with four gadgets, the nailgun and the sledgehammer, so "the first loose thing" is
    // usually not a limb. This is a robustness fix, NOT the cause of the `Q drops what is held`
    // skip below; see that probe's own note for the real reason.
    const it = e.limbField.items.find((i) => i.inWorld && i.type !== 'sledge' && !i.gadget)
            ?? e.limbField.items.find((i) => i.inWorld);
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

  // ---- Q: drop what is genuinely HELD ----------------------------------------------------
  //
  // 🔧 FIXED (this round; was an honest skip since `sledge-2`, 2026-08-08). The player now
  // spawns with all four sockets full (task-sledge-pickup.md removed the spawn
  // `fitGadget('shoulderL', 'nailgun')`), and `LimbRig.detach()`/`attach()` (src/game/limbs.js)
  // are exactly conservative: every `detach()` on the player's own body creates ONE empty
  // socket for ONE loose item of the SAME kind, and every `attach()` from a loose item removes
  // both again. So no sequence of detach/attach confined to the player's own four sockets can
  // ever reach "zero empty sockets, one matching item loose" — and that is exactly the state
  // `Player.interact()`'s "an empty socket that fits takes priority over carrying it" rule
  // needs broken before `E` will put something in the FIST instead of refitting it. The E probe
  // just above demonstrates the refit path; this one needs the other path, and reaching it
  // needs a mutator that is NOT conservative.
  //
  // `LimbRig.fitGadget()` is that mutator: it detaches the current occupant AND fits a
  // different item into the same socket in one call, so the displaced original arm becomes
  // genuinely loose while the socket it left stays occupied throughout — the count of empty
  // sockets never moves. Fit it onto `shoulderL` specifically, not `shoulderR`: `targetsFor()`
  // (src/views/game.js) always orders arm targets `[shoulderR, shoulderL]`, so the cursor's
  // default target for the displaced arm resolves to `shoulderR` — untouched, still holding a
  // `limb`, the SAME CLASS as the displaced item — so `interact()`'s swap guard
  // (`occ !== itemClass`) never fires, no socket anywhere is empty, and the item falls all the
  // way through to `LimbRig.pickUp()`, exactly as a genuine floor pickup would.
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    p.rig.fitGadget('shoulderL', 'nailgun');
    const it = e.limbField.items.find((i) => i.inWorld && i.root === p.unit.limbs.armL);
    if (it) it.root.position.set(p.pos.x, e.room.floorY + 0.1, p.pos.z);
  });
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(500);
  const preQ = await state();
  note(`pre-Q: held=${preQ.held} sockets=${preQ.sockets}`);
  if (!preQ.held) {
    // Setup did not reach a held state — report what actually happened rather than asserting
    // blind against a premise that did not hold. An honest SKIP beats a probe that passes for
    // the wrong reason.
    skip('Q drops what is held', `setup did not reach a held state (sockets ${preQ.sockets}, held ${preQ.held})`);
  } else {
    await page.keyboard.press('KeyQ');
    await page.waitForTimeout(500);
    const postQ = await state();
    (postQ.held !== preQ.held)
      ? pass('Q drops what is held', `${preQ.held} -> ${postQ.held}`)
      : fail('Q drops what is held', `still held (${postQ.held})`);
  }

  // ---- undo this probe's own setup ---------------------------------------------------------
  //
  // `fitGadget` above leaves `shoulderL` wearing the nailgun and the original arm loose on the
  // floor (or, if the drop above failed, still in the fist). Put it back BY IDENTITY, not via
  // `rig.refit()`: `refit()` builds a BRAND-NEW `LimbItem` around `unit.limbs.armL` and hands
  // it to `attach()`, whose `field.take()` looks for THAT new instance inside
  // `limbField.items` — the arm this probe actually detached is a DIFFERENT `LimbItem`
  // wrapping the same root, so the lookup misses, the stale entry is never removed, and
  // `limbField.items` gains a ghost whose `.root` is quietly re-parented onto the body while
  // `.inWorld` still reads `true`. Left uncleaned, `animation`'s own gadget-strip below would
  // hit the identical mismatch. Re-attaching the SAME tracked item avoids it, and leaves the
  // rig exactly as `resetBody()` expects to find it for every group after this one.
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    if (p.rig.occupant('shoulderL') === 'gadget') p.rig.detach('shoulderL');
    const original = p.unit.limbs.armL;
    const tracked = (p.rig.held?.root === original) ? p.rig.held
      : e.limbField.items.find((i) => i.root === original);
    if (tracked) p.rig.attach('shoulderL', tracked);
    else p.rig.refit?.('shoulderL');   // best-effort fallback; should not be reachable
  });
  await page.waitForTimeout(300);
  const cleaned = await state();
  note(`post-cleanup: sockets=${cleaned.sockets} loose=${cleaned.loose}`);

  await shot('inputs');
};

// ---------------------------------------------------------------- 1b. reach agreement
/**
 * 🚨 THE PROMPT AND THE PRESS MUST AGREE ABOUT WHAT IS IN REACH.
 *
 * `inputs` above proves E acts on an item under the player's feet, and nothing proves what
 * happens at the EDGE — which is where this game has already shipped the defect twice, in two
 * different axes of the same question "is the HUD describing the action that will actually run":
 *
 *   ITEM   `_liveInput` prompted off `nearest(pos, 1.3)` while `interact()` re-queried at 1.25.
 *          An item 1.25–1.30 m away read `[E] FIT ARM`, and E found nothing and fell through to
 *          the sledgehammer toggle — the advertised control doing something unrelated.
 *   SOCKET the prompt read `[E] FIT` whenever any wound was open, without checking THIS item
 *          fits THAT socket. An arm 0.1 m away with only a leg socket free advertised, then
 *          refused. Fixed by asking the rig what it would do (`promptFor`).
 *
 * Both are invisible to every other probe here: they need an item at a SPECIFIC distance, and
 * both leave the game running perfectly. So this stages one limb at a measured distance either
 * side of the boundary and asserts the only invariant that matters to a player —
 * **the screen advertises the item if and only if the press acts on it.**
 *
 * ⚠️ THE BOUNDARY COMES FROM THE GAME (`engine.eReach`), NEVER FROM A COPY HERE. A probe with
 * its own hardcoded 1.25 has already picked a side of the disagreement it exists to detect: if
 * the prompt drifted back to 1.3, a fixed-1.25 probe would stage "outside" at 1.28, watch the
 * press correctly refuse, and see the prompt's lie as its own staging error. Ask, then probe
 * ±0.03 m — deliberately tighter than the 0.05 m the two constants once differed by, so a
 * re-divergence of that size cannot slip between the two samples.
 */
groups.reach = async () => {
  const reach = await page.evaluate(() => window.__rrr.engine.eReach ?? null);
  if (!reach) { skip('the prompt and the press agree about reach', 'engine.eReach is not published'); return; }

  // Same identity discipline as `slowframes`: KEEP the item `detach()` returned. "The first
  // loose limb in array order" can be a ghost left by an earlier group's refit, and this check
  // asserts on a specific item's fate.
  const opened = await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    for (const s of ['shoulderL', 'shoulderR', 'hipL', 'hipR']) {
      if (p.rig.occupant(s) === 'limb') {
        const it = p.rig.detach(s);
        return { socket: s, id: it ? String(it.id) : null, label: it?.label ?? null };
      }
    }
    return { socket: null, id: null, label: null };
  });
  await page.waitForTimeout(600);

  /**
   * Stage the item at a TRUE 3-D distance `d` from `player.pos`, read what the game advertises,
   * press E, and report whether the item was acted on.
   *
   * ⚠️ `nearest()` measures `root.position.distanceToSquared(p.pos)` — FULL 3-D, and `p.pos` sits
   * ~0.68 m above the floor the item rests on. Placing it `d` metres away horizontally therefore
   * stages it at `hypot(d, 0.68)`, which for d=1.25 is 1.42 m — outside every radius in play, and
   * the probe would "prove" agreement by testing two points that are both out of reach. Solve for
   * the horizontal leg instead, and freeze the item (`asleep`) so settling cannot walk it across
   * the very boundary being measured.
   */
  const probe = async (d, wantId) => {
    const staged = await page.evaluate(({ wantId, d }) => {
      const e = window.__rrr.engine, p = e.player, f = e.limbField;
      const pick = (wantId && f.items.find((i) => i.inWorld && String(i.id) === wantId))
                ?? f.items.find((i) => i.inWorld && i.type === 'limb');
      if (!pick) return null;
      // Every other loose thing well outside both radii, or the press may act on a rolled
      // gadget and the check would grade the wrong item. Same clearing `slowframes` needs.
      for (const i of f.items) {
        if (i === pick || !i.inWorld) continue;
        if (i.root.position.distanceToSquared(p.pos) > 4 * 4) continue;
        i.root.position.set(p.pos.x + 6, e.room.floorY + 0.1, p.pos.z);
        i.vel.set(0, 0, 0); i.spin.set(0, 0, 0); i.asleep = true;
      }
      const y = e.room.floorY + 0.1;
      const dy = p.pos.y - y;
      if (d <= Math.abs(dy)) return null;         // unreachable on the floor at this distance
      const h = Math.sqrt(d * d - dy * dy);
      pick.root.position.set(p.pos.x + h, y, p.pos.z);
      pick.vel.set(0, 0, 0); pick.spin.set(0, 0, 0); pick.asleep = true;
      return { id: String(pick.id), label: pick.label, kind: pick.socketKind };
    }, { wantId, d });
    if (!staged) return { staged: null };
    await page.waitForTimeout(350);

    // What the game sees and says, measured rather than assumed — including the distance it
    // actually ended up at, so the verdict is attached to a real number in the report.
    const before = await page.evaluate(({ id, reach }) => {
      const e = window.__rrr.engine, p = e.player;
      const it = e.limbField.items.find((i) => String(i.id) === id);
      const n = e.limbField.nearest(p.pos, reach);
      return {
        d: it ? +Math.sqrt(it.root.position.distanceToSquared(p.pos)).toFixed(3) : null,
        inReach: !!n && String(n.id) === id,
        prompt: document.getElementById('rrr-prompt')?.textContent ?? null,
        // The pointer-lock line and the barrier toast are written AFTER `_liveInput` in the same
        // frame and would overwrite the item prompt. Report it so an override becomes a skip
        // with a reason, not a mystery failure.
        lock: e.input?.lockPrompt || '',
      };
    }, { id: staged.id, reach });

    await page.keyboard.press('KeyE');
    await page.waitForTimeout(500);

    // "Acted on THIS item" — not "anything changed". E with nothing in reach draws or stows an
    // owned sledgehammer, and that can drop a held limb, so socket/held/loose counts all move
    // for reasons that have nothing to do with the staged item. Its own fate cannot.
    const after = await page.evaluate(({ id }) => {
      const e = window.__rrr.engine, p = e.player;
      const it = e.limbField.items.find((i) => String(i.id) === id);
      return { gone: !it || !it.inWorld, held: p.rig.held ? String(p.rig.held.id) === id : false };
    }, { id: staged.id });

    return {
      staged,
      d: before.d,
      inReach: before.inReach,
      lock: before.lock,
      prompt: before.prompt,
      // EXACT strings, built from the item's OWN label, because the sledge prompts also begin
      // "[E] " and one of them even contains the word FIT ("SLEDGEHAMMER NEEDS BOTH ARMS —
      // [E] FIT ONE"). A loose /\[E\]/ regex would read that as the item being advertised.
      advertised: before.prompt === `[E] FIT ${staged.label}` || before.prompt === `[E] TAKE ${staged.label}`,
      acted: after.gone || after.held,
    };
  };

  const inside = await probe(reach - 0.03, opened.id);
  // Put the item back in the world before the second sample: the inside press should have
  // consumed it (fitted or carried), and a probe cannot stage what the rig is wearing.
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    if (p.rig.held) p.rig.dropHeld();
    for (const s of ['shoulderL', 'shoulderR', 'hipL', 'hipR']) {
      if (p.rig.occupant(s) === 'limb') { p.rig.detach(s); break; }
    }
  });
  await page.waitForTimeout(500);
  const outside = await probe(reach + 0.03, null);

  const bad = [];
  if (!inside.staged || !outside.staged) {
    skip('the prompt and the press agree about reach', 'no loose limb to stage');
  } else if (inside.lock || outside.lock) {
    // An honest skip: the HUD is showing the pointer-lock line, so nothing on screen could have
    // been the item prompt and `advertised` is unmeasurable rather than false.
    skip('the prompt and the press agree about reach', `HUD is showing the pointer-lock line ("${inside.lock || outside.lock}")`);
  } else {
    note(`reach=${reach} · inside d=${inside.d} prompt="${inside.prompt}" acted=${inside.acted}`);
    note(`reach=${reach} · outside d=${outside.d} prompt="${outside.prompt}" acted=${outside.acted}`);
    // Premise first, and it is the game's own `nearest()` answering, not arithmetic out here.
    if (!inside.inReach) bad.push(`staging failed: inside sample at ${inside.d} m is not in reach`);
    if (outside.inReach) bad.push(`staging failed: outside sample at ${outside.d} m is in reach`);
    // The invariant. Stated per sample so the failure text names which side lied and how.
    if (!bad.length && inside.advertised !== inside.acted) {
      bad.push(inside.advertised
        ? `at ${inside.d} m (IN reach) the HUD said "${inside.prompt}" and E did not act on the ${inside.staged.label}`
        : `at ${inside.d} m (IN reach) E acted on the ${inside.staged.label} with the HUD saying "${inside.prompt}"`);
    }
    if (!bad.length && outside.advertised !== outside.acted) {
      bad.push(outside.advertised
        ? `at ${outside.d} m (OUT of reach) the HUD advertised "${outside.prompt}" and E did not act — the prompt reaches further than the press`
        : `at ${outside.d} m (OUT of reach) E acted on the ${outside.staged.label} with nothing advertised — the press reaches further than the prompt`);
    }
    // An "agreement" where nothing is ever advertised agrees vacuously. The inside sample has to
    // actually advertise and act, or this check passes on a game where E does nothing at all.
    if (!bad.length && !inside.advertised) bad.push(`nothing was advertised at ${inside.d} m, well inside ${reach} m — E may be dead entirely`);

    bad.length === 0
      ? pass('the prompt and the press agree about reach',
        `${reach} m: advertised+acted at ${inside.d} m, silent+inert at ${outside.d} m`)
      : fail('the prompt and the press agree about reach', bad.join(' · ').slice(0, 400));
  }

  // ---- UNFREEZE. `resetBody()` puts the BODY back and knows nothing about `asleep`, so a
  // frozen item would stay frozen for every group after this one — the precise cross-group
  // contamination `resetBody` exists to prevent, just in a field it does not reach.
  await page.evaluate(() => {
    for (const i of window.__rrr.engine.limbField.items) i.asleep = false;
  });
  await shot('reach');
};

// ---------------------------------------------------------------- 2. slow frames
/**
 * THE E/Q BUG ONLY EXISTED HERE. At 60 fps a keypress spans several frames and any
 * implementation looks correct; starve the loop and a press must still not be lost.
 *
 * 🚨 **THIS CHECK SPENT A DAY REPORTING A DROPPED KEYPRESS FOR A PRESS THAT LANDED — AND THE
 * TREE WAS GREEN THE WHOLE TIME** (`inputfix-1`, 2026-08-09). Two defects, both in the probe,
 * both fixed below. **Measured, not reasoned:**
 *
 *   · `harness/_inputfix1-diag.mjs` drove this exact sub-frame dispatch with `Input.once`
 *     instrumented and printed the latch's own timeline — `add KeyE` on keydown,
 *     `consume->true` on the next frame, `interact -> attach`. Four ways: bare, under a 140 ms
 *     CPU hog, with a latch parked 1.5 s under load, and through `keyboard.press()`. **All
 *     four PASS. `Input.once` was never the problem.**
 *   · `harness/_inputfix1-order.mjs` replayed the suite's GROUP ORDER and caught the real
 *     thing: `interact()` returned **`{ kind: 'swap', socket: 'shoulderR' }`**. The suite's own
 *     trace says the same out loud — `slowframes` opened at `arms=2 weapon=fist` and
 *     `animation` opened at `arms=1 weapon=nailgun`, so between them this "dropped" keypress
 *     tore an arm off and bolted a nailgun on.
 *
 * **1. THE STAGED ITEM WAS NOT THE ITEM `E` ACTED ON.** This block moves one item to the
 * player's feet, but `interact()` acts on `field.nearest()`, and since the `inputs` group
 * started ejecting a nailgun stub in its cleanup there is a LOOSE GADGET lying where the
 * player stands. Measured distances at the press: nailgun **0.512 m**, staged leg **0.741 m**
 * — the confounder won. Which of the two settles closer is drop physics, i.e. **a race**, and
 * a race is exactly what this check's own dispatch note two paragraphs down condemns. It
 * passed for `unblock-1` because the nailgun happened to settle further away that run.
 *
 * **2. THE PREDICATE COULD NOT SEE THE ANSWER.** Fitting a gadget over a limb is a SWAP: one
 * item leaves the loose pool, the displaced arm joins it, `loose` nets to **zero** and nothing
 * ends up `held`. The twin check in `inputs` compares `sockets` for precisely this reason;
 * this one did not, so a body that visibly changed read as "nothing happened".
 *
 * ⚠️ **THE FIX IS TO MAKE THE PREMISE TRUE, NOT TO WIDEN THE NET UNTIL SOMETHING PASSES.** The
 * reach zone is CLEARED, the staged limb is the one `detach()` just handed back (so it matches
 * the socket that was emptied and pins the outcome to `interact()`'s attach path — the path
 * John's report was against: *"an item 0.1 m away, the HUD reading [E] FIT ARM"*), and the
 * probe asks the game's own `nearest()` to agree before it presses anything. `sockets` joins
 * the predicate as belt-and-braces, not as the fix: with the zone cleared, `loose` moves on
 * its own again.
 */
groups.slowframes = async () => {
  // ---- 1. open a socket, and KEEP THE ITEM IT PRODUCED. `detach()` returns the `LimbItem`,
  // which is the only identification that cannot be confused by a stale entry: "the first
  // loose limb in array order" can be a ghost left by an earlier group's `refit()`.
  const opened = await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    for (const s of ['hipL', 'hipR', 'shoulderL', 'shoulderR']) {
      if (p.rig.occupant(s) === 'limb') {
        const it = p.rig.detach(s);
        return { socket: s, id: it ? String(it.id) : null, label: it?.label ?? null };
      }
    }
    return { socket: null, id: null, label: null };
  });
  await page.waitForTimeout(600);

  // ---- 2. CLEAR THE REACH ZONE, then put the limb under the player's feet.
  const staged = await page.evaluate((wantId) => {
    const e = window.__rrr.engine, p = e.player, f = e.limbField;
    // ⚠️ PREFER A PLAIN LIMB over whatever is first in array order — since `sledge-2` the world
    // is seeded with four gadgets, the nailgun and the sledgehammer, so "the first loose thing"
    // is usually not a limb. The `detach()` identity above is better still; this is the fallback.
    const pick = (wantId && f.items.find((i) => i.inWorld && String(i.id) === wantId))
              ?? f.items.find((i) => i.inWorld && i.type === 'limb')
              ?? f.items.find((i) => i.inWorld && i.type !== 'sledge' && !i.gadget)
              ?? f.items.find((i) => i.inWorld);
    if (!pick) return null;
    // 🚨 ANY other loose thing near the player can be the item the press acts on: `_liveInput`
    // and `interact()` each run their own `nearest(pos, E_REACH)`, and they only agree about
    // WHICH item when one candidate is unambiguously closest. Push every
    // other candidate well outside both radii — 6 m is far outside and still inside the room —
    // so the item this check stages is the item the game will choose. Without this the probe
    // is measuring where a dropped gadget happened to roll.
    let cleared = 0;
    for (const i of f.items) {
      if (i === pick || !i.inWorld) continue;
      if (i.root.position.distanceToSquared(p.pos) > 3 * 3) continue;
      i.root.position.set(p.pos.x + 6, e.room.floorY + 0.1, p.pos.z);
      i.vel.set(0, 0, 0); i.spin.set(0, 0, 0);
      cleared++;
    }
    pick.root.position.set(p.pos.x, e.room.floorY + 0.1, p.pos.z);
    pick.vel.set(0, 0, 0); pick.spin.set(0, 0, 0);
    return { id: String(pick.id), label: pick.label, kind: pick.socketKind, cleared };
  }, opened.id);
  await page.waitForTimeout(400);

  // ---- 3. THE PREMISE, ASKED OF THE GAME RATHER THAN ASSUMED. `interact()`'s own radius and
  // the field's own `nearest()`, not a re-derivation out here — this project's standing rule
  // after five instruments were caught testing their own copy of a rule instead of the game's.
  const premise = await page.evaluate((wantId) => {
    const e = window.__rrr.engine, p = e.player;
    const n = e.limbField.nearest(p.pos, 1.25);
    return {
      id: n ? String(n.id) : null, label: n?.label ?? null,
      d: n ? +Math.sqrt(n.root.position.distanceToSquared(p.pos)).toFixed(3) : null,
      ok: !!n && !!wantId && String(n.id) === wantId,
    };
  }, staged?.id ?? null);
  if (!staged || !premise.ok) {
    // A probe that cannot observe must SKIP, never PASS — and never FAIL the game for its own
    // staging either. Say exactly which item the game would have acted on instead.
    skip('a keypress survives a starved frame rate',
      `staging did not put "${staged?.label ?? 'nothing'}" in reach — nearest is ${premise.label ?? 'nothing'} at ${premise.d} m`);
    await shot('slowframes');
    return;
  }
  note(`staged ${staged.label} (${staged.kind}) into ${opened.socket}, ${staged.cleared} confounder(s) cleared, nearest=${premise.label} d=${premise.d}`);

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
  // ⚠️ `sockets` IS IN HERE BECAUSE A SWAP NETS `loose` TO ZERO — see this group's header. The
  // `inputs` group's twin check has always compared all three; this one had two and reported a
  // press that rebuilt the player's body as a press that never arrived.
  (b.held !== a.held || b.loose !== a.loose || b.sockets !== a.sockets)
    ? pass('a keypress survives a starved frame rate',
      `loose ${a.loose}->${b.loose}, held ${a.held}->${b.held}, sockets ${a.sockets === b.sockets ? 'same' : 'changed'}`)
    : fail('a keypress survives a starved frame rate', `press was dropped between frames (${a.sockets})`);
  await shot('slowframes');
};

// ---------------------------------------------------------------- 2b. refit socket choice
/**
 * 🦾 **A REFIT GOES IN THE EMPTY SOCKET, NOT OVER THE GADGET — JOHN'S LOOP, REPRODUCED.**
 *
 * His report, playing with an arm knocked off by falling debris:
 *
 *   > *"when replacing an arm that fell off from debris I kept replacing the arm with the nail
 *   > gun and vise versa instead of putting it in the open arm slot."*
 *
 * The state is one wound plus one gadget — an EMPTY shoulder, a nail gun in the other one, the
 * arm on the floor — and `Player.interact()` used to run its swap block before its empty-socket
 * scan, so `E` bolted the arm over the gun, ejected the gun, and left the empty shoulder empty.
 * `E` on the gun swapped it straight back. **Both presses did something; neither did the right
 * thing, and the wound never closed.**
 *
 * ⚠️ **`LimbRig.attach()` IS NOT AND WAS NEVER THE DEFECT** — it takes an explicit socket and
 * does what it is told. Everything here is about WHICH socket the caller picks, so nothing below
 * calls `attach()` directly: the presses are real `E` keystrokes through `_liveInput`, and the
 * verdicts are read back off the rig.
 *
 * 🚨 **THE RIG IS ASKED, NEVER RE-DERIVED.** This project has sixteen recorded instruments that
 * agreed with the code because they recomputed it. `LimbRig.emptyFits()` exists and is exactly
 * the preference this group is testing — **so it is never called here.** The verdict is
 * `rig.occupant(s)` plus the IDENTITY of `sockets[s].item.root` against `unit.limbs.armL`, which
 * is the one fact a wrong-socket fit cannot fake: a type map reads `limb` either way.
 *
 * 🚨 **R2 IS THE CONTROL THAT MUST FAIL AND IT RUNS ON EVERY RUN.** "It chose the empty one" and
 * "there was only one socket it could have chosen" are indistinguishable from R1 alone. R2 is
 * the identical press with the empty socket REMOVED, and it demands the OTHER branch — a swap
 * that takes the gun off. If R1 and R2 ever pass together for a trivial reason (a press that
 * does nothing, a body that never changes), one of them is red by construction.
 *
 * ⚠️ **THE CURSOR IS READ, NOT SET.** `views/game.js`'s socket cursor (`_target` → `validTarget`)
 * is sticky: it is `shoulderR` from frame one and stays there whether or not that socket is
 * empty. That stickiness is what parks it on the gadget, so this group puts the nail gun on
 * **whichever socket the cursor already names** and wounds the other — John's situation exactly,
 * with nothing about the input layer staged or overridden. If the cursor is NOT on the occupied
 * socket at press time the reproduction is not his, and R1/R3 SKIP rather than pass.
 */
groups.refit = async () => {
  const LIMB_OF = { shoulderL: 'armL', shoulderR: 'armR', hipL: 'legL', hipR: 'legR' };
  const SOX = ['shoulderL', 'shoulderR', 'hipL', 'hipR'];

  /**
   * What is in each socket AND WHICH OBJECT is in it. A swap and a correct fit produce the same
   * `type` map — `limb` either way — so the object identity is the only thing that separates
   * them, and it is resolved against `unit.limbs` inside the page rather than by id parsing.
   */
  const body = () => page.evaluate((S) => {
    const e = window.__rrr.engine, p = e.player;
    const who = (s) => {
      const it = p.rig.sockets[s].item;
      if (!it) return '-';
      for (const [id, root] of Object.entries(p.unit.limbs)) if (root === it.root) return id;
      return it.gadget ?? 'other';
    };
    return {
      map: S.map((s) => `${s}:${p.rig.occupant(s)}(${who(s)})`).join(' '),
      occ: Object.fromEntries(S.map((s) => [s, p.rig.occupant(s)])),
      who: Object.fromEntries(S.map((s) => [s, who(s)])),
      wounds: p.rig.caps.wounds,
      gadgets: p.rig.caps.armGadgets.join(',') || '-',
      cursor: e.gameHud?.targetSocket?.() ?? null,
      loose: e.limbField.items.filter((i) => i.inWorld).length,
    };
  }, SOX);

  /**
   * Four limbs back on, gadgets off, BY IDENTITY where possible. `rig.refit()` builds a brand-new
   * `LimbItem` around the same root, so the stale one is never removed from `limbField.items` and
   * the field gains a ghost that reads `inWorld` while its root is on the body — the exact hazard
   * the `inputs` group's cleanup documents. Re-attaching the tracked item routes through
   * `field.take()` and leaves no ghost.
   *
   * 🚨 **A LIMB IN THE WRONG SOCKET IS TAKEN OFF FIRST, AND THAT LINE IS THERE BECAUSE THE
   * REINTRODUCTION RUN NEEDED IT.** Every arm reads `limb` wherever it is bolted, so a body left
   * with `armL` in the right shoulder looks restored to any type-map check — and `refit('shoulderL')`
   * then hauls that SAME root back out of the right shoulder while the right shoulder's own
   * socket entry keeps pointing at it, i.e. two sockets claiming one object. That is exactly what
   * happened when the defect was reintroduced to prove these checks bite, and it would have made
   * every group after this one read a corrupt body. `userData.limb.socket` is where each limb
   * belongs, stamped by `unit4h.js` at build time.
   */
  const restoreBody = async () => {
    await page.evaluate((L) => {
      const e = window.__rrr.engine, p = e.player, f = e.limbField;
      p.rig.dropHeld?.();
      for (const s of Object.keys(L)) {
        if (p.rig.occupant(s) === 'gadget') { p.rig.detach(s); continue; }
        const home = p.rig.sockets[s].item?.root?.userData?.limb?.socket ?? null;
        if (home && home !== s) p.rig.detach(s);      // put it back where it belongs, not here
      }
      for (const [s, id] of Object.entries(L)) {
        if (p.rig.occupant(s) !== 'empty') continue;
        const tracked = f.items.find((i) => i.root === p.unit.limbs[id]);
        if (tracked) p.rig.attach(s, tracked); else p.rig.refit?.(s);
      }
      p.vel.set(0, 0, 0);
    }, LIMB_OF);
    await page.waitForTimeout(400);
  };

  /**
   * Put ONE named item under the player's feet and shove every other loose thing 6 m away.
   * Without the clearing pass the press acts on whatever gadget happened to roll closest —
   * the confounder that cost `slowframes` a day (see its header).
   */
  const stage = async (wantId) => {
    const r = await page.evaluate((id) => {
      const e = window.__rrr.engine, p = e.player, f = e.limbField;
      const pick = f.items.find((i) => i.inWorld && String(i.id) === id);
      if (!pick) return null;
      let cleared = 0;
      for (const i of f.items) {
        if (i === pick || !i.inWorld) continue;
        if (i.root.position.distanceToSquared(p.pos) > 3 * 3) continue;
        i.root.position.set(p.pos.x + 6, e.room.floorY + 0.1, p.pos.z);
        i.vel.set(0, 0, 0); i.spin.set(0, 0, 0); cleared++;
      }
      pick.root.position.set(p.pos.x, e.room.floorY + 0.1, p.pos.z);
      pick.vel.set(0, 0, 0); pick.spin.set(0, 0, 0);
      return { id: String(pick.id), label: pick.label, cleared };
    }, wantId);
    await page.waitForTimeout(350);
    return r;
  };

  /** Does the game itself agree that `id` is the thing `E` will act on? Its radius, its search. */
  const inReach = (wantId) => page.evaluate((id) => {
    const e = window.__rrr.engine, p = e.player;
    const n = e.limbField.nearest(p.pos, e.eReach ?? 1.25);
    return { id: n ? String(n.id) : null, label: n?.label ?? null, ok: !!n && String(n.id) === id };
  }, wantId);

  /**
   * JOHN'S STATE. The nail gun goes on **whichever socket the cursor already names**, and the
   * other shoulder is the wound — so the cursor is parked on an occupied socket without this
   * probe touching the input layer at all.
   */
  const woundedWithGadget = async () => {
    const cursor = await page.evaluate(() => window.__rrr.engine.gameHud?.targetSocket?.() ?? null);
    const gadgetSocket = (cursor === 'shoulderL' || cursor === 'shoulderR') ? cursor : 'shoulderR';
    const emptySocket = gadgetSocket === 'shoulderR' ? 'shoulderL' : 'shoulderR';
    const ids = await page.evaluate(({ g, w }) => {
      const e = window.__rrr.engine, p = e.player;
      // the nail gun goes on: this is "he picked the gadget up", and it ejects that arm.
      const fit = p.rig.fitGadget(g, 'nailgun');
      // ...and the debris takes the other one.
      const lost = p.rig.occupant(w) === 'limb' ? p.rig.detach(w) : null;
      return {
        displaced: fit?.displaced ? String(fit.displaced.id) : null,
        lost: lost ? String(lost.id) : null,
      };
    }, { g: gadgetSocket, w: emptySocket });
    await page.waitForTimeout(700);
    return { cursor, gadgetSocket, emptySocket, ...ids };
  };

  // ================================================================ R1 — the defect
  await restoreBody();
  const s1 = await woundedWithGadget();
  const staged1 = s1.lost ? await stage(s1.lost) : null;
  const reach1 = staged1 ? await inReach(staged1.id) : { ok: false, label: null };
  const pre1 = await body();
  note(`R1 setup: ${pre1.map} · cursor=${pre1.cursor} · wounds=${pre1.wounds} · nearest=${reach1.label}`);

  if (!staged1 || !reach1.ok || pre1.occ[s1.emptySocket] !== 'empty' || pre1.occ[s1.gadgetSocket] !== 'gadget') {
    skip('a refit fills the EMPTY socket, not the gadget\'s',
      `staging did not reach one-wound-one-gadget (${pre1.map}, nearest ${reach1.label})`);
  } else {
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(700);
    const post1 = await body();
    note(`R1 after E: ${post1.map} · wounds=${post1.wounds} · gadgets=${post1.gadgets}`);
    const wantLimb = LIMB_OF[s1.emptySocket];
    /**
     * 🚨 **THE CURSOR HALF IS ASSERTED HERE, AND IT IS WHAT MAKES THIS THE HUD'S GATE.** The gun
     * went on **whichever socket the cursor named**, then the other shoulder was wounded — the
     * pre-fix `validTarget` left the cursor sitting on the gun (`if (cur && opts.includes(cur))
     * return cur`, unconditional), so the ring pointed at a socket the press would not touch.
     * It must now have re-homed onto the wound. ⚠️ **This check's original skip guard demanded
     * the OPPOSITE** — it refused to grade unless the cursor was still on the gadget, i.e. it
     * was written against the broken cursor and went to SKIP the moment the cursor was fixed.
     * Inverted deliberately rather than deleted: revert `views/game.js` and this line goes red.
     */
    const cursorHomed = pre1.cursor === s1.emptySocket;
    const ok = post1.occ[s1.emptySocket] === 'limb'      // the wound closed...
      && post1.who[s1.emptySocket] === wantLimb          // ...with the arm that came off
      && post1.occ[s1.gadgetSocket] === 'gadget'         // and the gun never moved
      && post1.wounds === pre1.wounds - 1;
    (ok && cursorHomed)
      ? pass('a refit fills the EMPTY socket, not the gadget\'s',
        `cursor re-homed to ${pre1.cursor}; ${s1.emptySocket}=${post1.who[s1.emptySocket]}, ${s1.gadgetSocket} still ${post1.gadgets}, wounds ${pre1.wounds}->${post1.wounds}`)
      : fail('a refit fills the EMPTY socket, not the gadget\'s',
        `cursor ${pre1.cursor} (wanted the empty ${s1.emptySocket}) · ${post1.map} · wounds ${pre1.wounds}->${post1.wounds} — wanted ${s1.emptySocket}=${wantLimb} with ${s1.gadgetSocket} untouched`);

    /**
     * 🚨 **AND THE BRANCH ORDER ON ITS OWN, WITH THE CURSOR TAKEN OUT OF IT — THIS IS THE ARM
     * THAT BITES IF `player.js` IS REVERTED.** Now that `validTarget` re-homes the cursor, the
     * live press above lands correctly even with `interact()`'s old swap-first order, because the
     * cursor never offers it an occupied socket any more. **The two fixes are independently
     * sufficient for the live path**, so each needs its own gate or a revert of either hides
     * behind the other. `interact()` is called with an explicit target by a dozen harness
     * scenarios and by anything that is not `_liveInput`; here it is handed the OCCUPIED socket
     * outright and must still choose the empty one.
     */
    await restoreBody();
    const s1b = await woundedWithGadget();
    const staged1b = s1b.lost ? await stage(s1b.lost) : null;
    const pre1b = await body();
    if (!staged1b || pre1b.occ[s1b.emptySocket] !== 'empty' || pre1b.occ[s1b.gadgetSocket] !== 'gadget') {
      skip('an explicitly targeted OCCUPIED socket still loses to an empty one', `staging failed (${pre1b.map})`);
    } else {
      const r1b = await page.evaluate((t) => {
        const e = window.__rrr.engine, p = e.player;
        const r = p.interact(e.limbField, e.eReach ?? 1.25, t);
        return { kind: r?.kind ?? null, socket: r?.socket ?? null };
      }, s1b.gadgetSocket);
      await page.waitForTimeout(500);
      const post1b = await body();
      note(`R1b: interact(target=${s1b.gadgetSocket}) -> ${r1b.kind} on ${r1b.socket} · ${post1b.map}`);
      (r1b.socket === s1b.emptySocket && r1b.kind === 'attach'
        && post1b.who[s1b.emptySocket] === LIMB_OF[s1b.emptySocket]
        && post1b.occ[s1b.gadgetSocket] === 'gadget')
        ? pass('an explicitly targeted OCCUPIED socket still loses to an empty one',
          `named ${s1b.gadgetSocket} (holding ${pre1b.gadgets}), got ${r1b.kind} on ${r1b.socket}`)
        : fail('an explicitly targeted OCCUPIED socket still loses to an empty one',
          `named ${s1b.gadgetSocket}, got ${r1b.kind} on ${r1b.socket} · ${post1b.map}`);
    }
  }
  await shot('refit-empty');

  // ================================================================ R3 — the loop itself
  //
  // John did not report one bad press, he reported a LOOP: "I kept replacing the arm with the
  // nail gun and vise versa". Three presses over the same pile.
  //
  // ⚠️ **ONLY THE PILE AT HIS FEET IS EVER RESTAGED, AND THE FIRST DRAFT OF THIS CHECK GOT IT
  // WRONG.** It restaged the closest loose arm-kind item ANYWHERE, which after the wound closes
  // is the *other* arm — and pressing `E` on a second part with both shoulders full is a
  // perfectly correct swap, so the check reported the game oscillating when the game was obeying
  // the rule. The pile is what the wound produced plus whatever a press EJECTS into it, i.e.
  // loose arm-kind things within 3 m; everything else was shoved away by `stage()` at setup and
  // stays away. A body that settles reaches its answer once and then has nothing left to reach
  // for; a body that loops keeps trading the same two parts and never closes the wound.
  await restoreBody();
  const s3 = await woundedWithGadget();
  const staged3 = s3.lost ? await stage(s3.lost) : null;
  const reach3 = staged3 ? await inReach(staged3.id) : { ok: false, label: null };
  const seen = [];
  const offered = [];
  if (!staged3 || !reach3.ok) {
    skip('repeated [E] over the part settles instead of looping',
      `staging did not put the lost arm in reach (nearest ${reach3.label})`);
  } else {
    seen.push(await body());
    for (let i = 0; i < 3; i++) {
      // Re-centre the local pile only — the closest loose arm-kind item ALREADY within 3 m.
      // Nothing is imported from outside it, so every press acts on what the loop itself made.
      const next = await page.evaluate(() => {
        const e = window.__rrr.engine, p = e.player;
        const near = e.limbField.items.filter((i) => i.inWorld && i.socketKind === 'arm'
          && i.root.position.distanceToSquared(p.pos) <= 3 * 3);
        if (!near.length) return null;
        near.sort((a, b) => a.root.position.distanceToSquared(p.pos) - b.root.position.distanceToSquared(p.pos));
        return String(near[0].id);
      });
      if (next) await stage(next);
      offered.push(await page.evaluate(() => {
        const e = window.__rrr.engine, p = e.player;
        return e.limbField.nearest(p.pos, e.eReach ?? 1.25)?.label ?? '-';
      }));
      await page.keyboard.press('KeyE');
      await page.waitForTimeout(700);
      seen.push(await body());
    }
    note(`R3 presses: ${seen.map((b) => `w${b.wounds}/${b.who[s3.gadgetSocket]}`).join(' -> ')} · offered ${offered.join(',')}`);
    const monotone = seen.every((b, i) => i === 0 || b.wounds <= seen[i - 1].wounds);
    const gadgetHeld = seen.every((b) => b.occ[s3.gadgetSocket] === 'gadget');
    const settled = seen[seen.length - 1].map === seen[seen.length - 2].map;
    // `offered[0]` guards the whole check: if the first press had nothing in reach then
    // "it settled" is a statement about an empty floor, not about the rule.
    (monotone && gadgetHeld && settled && seen[seen.length - 1].wounds === 0 && offered[0] === 'arm')
      ? pass('repeated [E] over the part settles instead of looping',
        `wounds ${seen.map((b) => b.wounds).join('->')}, ${s3.gadgetSocket} held ${seen[seen.length - 1].gadgets} throughout, offered ${offered.join(',')}`)
      : fail('repeated [E] over the part settles instead of looping',
        `wounds ${seen.map((b) => b.wounds).join('->')} · ${s3.gadgetSocket} ${seen.map((b) => b.who[s3.gadgetSocket]).join('->')} · offered ${offered.join(',')} · last ${seen[seen.length - 1].map}`);
  }
  await shot('refit-loop');

  // ================================================================ R2 — THE CONTROL THAT MUST FAIL
  //
  // 🚨 Same press, same cursor, same item class — with the empty socket REMOVED. If the rule were
  // "always fit, never swap", or if `E` had quietly stopped doing anything at all, R1 would still
  // be green and this is the arm that goes red. A swap is the ONLY thing this press can correctly
  // do here, and it must take the gun off to do it.
  await restoreBody();
  const s2 = await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const cursor = e.gameHud?.targetSocket?.() ?? 'shoulderR';
    const g = (cursor === 'shoulderL' || cursor === 'shoulderR') ? cursor : 'shoulderR';
    // Gun on the cursor's socket; its displaced arm is the loose item. BOTH shoulders stay
    // occupied — that is the whole difference from R1.
    const fit = p.rig.fitGadget(g, 'nailgun');
    return { gadgetSocket: g, loose: fit?.displaced ? String(fit.displaced.id) : null };
  });
  await page.waitForTimeout(700);
  const staged2 = s2.loose ? await stage(s2.loose) : null;
  const reach2 = staged2 ? await inReach(staged2.id) : { ok: false, label: null };
  const pre2 = await body();
  note(`R2 setup: ${pre2.map} · cursor=${pre2.cursor} · wounds=${pre2.wounds} · nearest=${reach2.label}`);

  if (!staged2 || !reach2.ok || pre2.wounds !== 0 || pre2.occ[s2.gadgetSocket] !== 'gadget') {
    skip('CONTROL: with no empty socket the same press SWAPS',
      `staging did not reach zero-wound-one-gadget (${pre2.map}, nearest ${reach2.label})`);
  } else {
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(700);
    const post2 = await body();
    note(`R2 after E: ${post2.map} · wounds=${post2.wounds} · gadgets=${post2.gadgets}`);
    const ok = post2.occ[s2.gadgetSocket] === 'limb'    // the arm went on the OCCUPIED socket...
      && post2.gadgets === '-'                          // ...because the gun came off
      && pre2.gadgets !== '-';                          // and it really was on beforehand
    ok
      ? pass('CONTROL: with no empty socket the same press SWAPS',
        `${s2.gadgetSocket} ${pre2.who[s2.gadgetSocket]} -> ${post2.who[s2.gadgetSocket]}, gadgets ${pre2.gadgets} -> ${post2.gadgets}`)
      : fail('CONTROL: with no empty socket the same press SWAPS',
        `${post2.map} · gadgets ${pre2.gadgets} -> ${post2.gadgets} — the swap branch is unreachable`);
  }
  await shot('refit-control');

  // ================================================================ R4 — which empty one
  //
  // 🎯 **WHEN SEVERAL SOCKETS ARE EMPTY, THE PART'S OWN SIDE WINS.** Reachable whenever the
  // caller passes no cursor — `interact(field, r, null)`, which is what a dozen harness
  // scenarios and every non-`_liveInput` caller do. `LimbRig.emptyFits()` reads the home socket
  // off `root.userData.limb.socket`, stamped by `unit4h.js` at build time.
  //
  // 🚨 **THE SIDELESS ARM IS THE CONTROL AND IT IS WHY THE FIRST HALF MEANS ANYTHING.** A gadget's
  // root is a stub group with no such stamp, so it must fall back to the fixed `SOCKETS` order —
  // `shoulderL`. Since `shoulderL` is ALSO what a broken preference (or no preference at all)
  // would give the right arm, a check that only ever staged `armR` could not tell "it preferred
  // the right side" from "it always takes the first free socket". Run together the two demand
  // opposite sockets from the same call.
  await restoreBody();
  const s4 = await page.evaluate(async () => {
    const e = window.__rrr.engine, p = e.player;
    const gone = [];
    for (const s of ['shoulderL', 'shoulderR']) {
      if (p.rig.occupant(s) === 'limb') { const it = p.rig.detach(s); if (it) gone.push(String(it.id)); }
    }
    return { armR: gone.find((id) => id.endsWith('armR')) ?? null, armL: gone.find((id) => id.endsWith('armL')) ?? null };
  });
  await page.waitForTimeout(700);
  const staged4 = s4.armR ? await stage(s4.armR) : null;
  const pre4 = await body();
  if (!staged4 || pre4.occ.shoulderL !== 'empty' || pre4.occ.shoulderR !== 'empty') {
    skip('among equals a part goes to its OWN side', `both shoulders were not opened (${pre4.map})`);
  } else {
    // No cursor: this is the branch the socket preference actually decides.
    const sided = await page.evaluate(() => {
      const e = window.__rrr.engine, p = e.player;
      const r = p.interact(e.limbField, e.eReach ?? 1.25, null);
      return { kind: r?.kind ?? null, socket: r?.socket ?? null };
    });
    await page.waitForTimeout(500);
    const mid4 = await body();

    // CONTROL: a sideless part, same call, same two empty shoulders.
    const ctrl4 = await page.evaluate(async () => {
      const e = window.__rrr.engine, p = e.player;
      for (const s of ['shoulderL', 'shoulderR']) if (p.rig.occupant(s) !== 'empty') p.rig.detach(s);
      await new Promise((r) => setTimeout(r, 500));
      const g = e.limbField.items.find((i) => i.inWorld && i.type === 'gadget' && i.socketKind === 'arm');
      if (!g) return { ok: false };
      for (const i of e.limbField.items) {
        if (i === g || !i.inWorld) continue;
        if (i.root.position.distanceToSquared(p.pos) > 3 * 3) continue;
        i.root.position.set(p.pos.x + 6, e.room.floorY + 0.1, p.pos.z);
        i.vel.set(0, 0, 0); i.spin.set(0, 0, 0);
      }
      g.root.position.set(p.pos.x, e.room.floorY + 0.1, p.pos.z);
      g.vel.set(0, 0, 0); g.spin.set(0, 0, 0);
      await new Promise((r) => setTimeout(r, 800));
      const stamped = !!g.root.userData?.limb;
      const r = p.interact(e.limbField, e.eReach ?? 1.25, null);
      return { ok: true, stamped, gadget: g.gadget, kind: r?.kind ?? null, socket: r?.socket ?? null };
    });
    await page.waitForTimeout(400);
    note(`R4: armR -> ${sided.socket} (${sided.kind}) · sideless ${ctrl4.gadget} (stamped ${ctrl4.stamped}) -> ${ctrl4.socket} (${ctrl4.kind})`);
    (sided.socket === 'shoulderR' && mid4.who.shoulderR === 'armR'
      && ctrl4.ok && ctrl4.stamped === false && ctrl4.socket === 'shoulderL')
      ? pass('among equals a part goes to its OWN side',
        `armR -> shoulderR with both shoulders open; the sideless ${ctrl4.gadget} took the fixed-order shoulderL from the identical call`)
      : fail('among equals a part goes to its OWN side',
        `armR -> ${sided.socket} (body ${mid4.map}) · sideless ${ctrl4.gadget ?? '-'} -> ${ctrl4.socket} (stamped ${ctrl4.stamped}) — wanted shoulderR and shoulderL`);
  }
  await shot('refit-side');

  // ================================================================ R5 — the cursor still wins
  //
  // 🎯 **AMONG EMPTY SOCKETS THE PLAYER'S CHOICE BEATS THE SIDE PREFERENCE, AND HOLD-`E` IS HOW
  // THEY MAKE IT.** `validTarget` (views/game.js) now re-homes the cursor off an occupied socket
  // when something of the right kind is open — the fix that stops the HUD ring pointing at a
  // socket the press will not touch. Its `free.includes(cur)` clause is what keeps `cycleTarget`
  // meaningful, and this is the check that goes red if that clause is ever dropped.
  //
  // 🚨 **THE LIMB IS DEMANDED IN THE SOCKET THAT IS *NOT* ITS OWN SIDE**, so the pass cannot be
  // R4's preference firing by luck: `armR` landing in `shoulderL` is reachable only by the
  // cursor. And the cursor is required to have MOVED first — if hold-`E` did nothing, the check
  // skips instead of grading a default.
  await restoreBody();
  const s5 = await page.evaluate(async () => {
    const e = window.__rrr.engine, p = e.player;
    const gone = [];
    for (const s of ['shoulderL', 'shoulderR']) {
      if (p.rig.occupant(s) === 'limb') { const it = p.rig.detach(s); if (it) gone.push(String(it.id)); }
    }
    return { armR: gone.find((id) => id.endsWith('armR')) ?? null };
  });
  await page.waitForTimeout(700);
  const staged5 = s5.armR ? await stage(s5.armR) : null;
  const readCursor = () => page.evaluate(() => window.__rrr.engine.gameHud?.targetSocket?.() ?? null);
  const cur0 = await readCursor();
  /**
   * ⚠️ **CYCLE UNTIL THE CURSOR IS ON THE SOCKET THAT IS NOT `armR`'s HOME — DO NOT ASSUME A
   * STARTING SIDE.** The first draft held `E` exactly once and demanded `shoulderL`, which is
   * only right when the cursor happens to start on `shoulderR`; it inherits whatever the previous
   * check left, so half the time one hold lands it back on the home socket and the check skipped
   * on a working build. Two holds is also a stronger statement — it proves the cycle goes both
   * ways rather than latching.
   *
   * Holding past `_eHeld > 0.25` cycles once per hold and the RELEASE deliberately does not act
   * (`_eHeld` is parked at -1e9 by the cycle), so this moves the cursor without fitting anything.
   */
  let cur1 = cur0, holds = 0;
  for (let i = 0; i < 3 && !(cur1 === 'shoulderL' && holds > 0); i++) {
    await page.keyboard.down('KeyE'); await page.waitForTimeout(700); await page.keyboard.up('KeyE');
    await page.waitForTimeout(400);
    cur1 = await readCursor(); holds++;
  }
  const pre5 = await body();
  if (!staged5 || pre5.occ.shoulderL !== 'empty' || pre5.occ.shoulderR !== 'empty') {
    skip('hold-E still chooses between two empty sockets', `both shoulders were not opened (${pre5.map})`);
  } else if (cur1 !== 'shoulderL' || holds === 0) {
    skip('hold-E still chooses between two empty sockets',
      `${holds} hold(s) did not land the cursor on shoulderL (${cur0} -> ${cur1})`);
  } else {
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(700);
    const post5 = await body();
    note(`R5: cursor ${cur0} -> ${cur1} in ${holds} hold(s), armR landed in ${post5.who.shoulderL === 'armR' ? 'shoulderL' : post5.who.shoulderR === 'armR' ? 'shoulderR' : '-'}`);
    (post5.who.shoulderL === 'armR')
      ? pass('hold-E still chooses between two empty sockets',
        `cursor ${cur0} -> ${cur1} in ${holds} hold(s) and armR went there, against its own side — the cursor beats the preference`)
      : fail('hold-E still chooses between two empty sockets',
        `cursor ${cur0} -> ${cur1} but ${post5.map} — the press ignored it`);
  }
  await shot('refit-cursor');

  // ================================================================ R6 — one pickup, one item
  //
  // 🐞 **A WORLD GADGET USED TO SURVIVE BEING WORN.** `LimbRig.attach()`'s gadget branch returned
  // `fitGadget(...).ok` one line above its own `field.take()`, so the prop stayed registered and
  // parented: loose **8 → 9**, `nearest()` offering it again, and a second press past the 0.35 s
  // `_interactCd` giving **`nailgun,nailgun` from one pickup** (`_refit1-fitsettle-why.mjs`).
  //
  // 🚨 **THE CONTROL IS THE SECOND HALF OF THE SAME CHECK AND IT RUNS EVERY RUN.** "One pickup
  // makes one item" is trivially satisfiable by refusing to fit gadgets at all, or by refusing a
  // second one — so a REAL second gadget is staged into the other shoulder and the body must end
  // up wearing **two different** names. Duplication and capability are asserted together, and no
  // single wrong behaviour can satisfy both.
  await restoreBody();
  const dup = await page.evaluate(async () => {
    const e = window.__rrr.engine, p = e.player, f = e.limbField;
    const shove = (keep) => {
      for (const i of f.items) {
        if (i === keep || !i.inWorld) continue;
        if (i.root.position.distanceToSquared(p.pos) > 3 * 3) continue;
        i.root.position.set(p.pos.x + 6, e.room.floorY + 0.1, p.pos.z);
        i.vel.set(0, 0, 0); i.spin.set(0, 0, 0);
      }
    };
    const put = async (it) => {
      shove(it);
      it.root.position.set(p.pos.x, e.room.floorY + 0.1, p.pos.z);
      it.vel.set(0, 0, 0); it.spin.set(0, 0, 0);
      await new Promise((r) => setTimeout(r, 700));
    };
    for (const s of ['shoulderL', 'shoulderR']) if (p.rig.occupant(s) !== 'empty') p.rig.detach(s);
    await new Promise((r) => setTimeout(r, 600));

    const gun = f.items.find((i) => i.inWorld && i.type === 'gadget' && i.gadget === 'nailgun');
    if (!gun) return { ok: false, why: 'no world nailgun' };
    await put(gun);
    const loose0 = f.items.filter((i) => i.inWorld).length;
    const r1 = p.interact(f, e.eReach ?? 1.25, 'shoulderR');
    // ⚠️ **WAIT ON `_interactCd` ITSELF, NOT ON A WALL-CLOCK GUESS.** `interact()` refuses for
    // 0.35 s of SIM time and the counter only moves when `Player.update` runs — a fixed 800 ms
    // sleep cleared it in one tool and not in another, and a refusal reads as `null`, i.e.
    // exactly like "no duplicate was produced". That would have let the duplication clause below
    // pass for the wrong reason on the very build it exists to catch.
    for (let i = 0; i < 60 && p._interactCd > 0; i++) await new Promise((r) => setTimeout(r, 50));
    const cdClear = p._interactCd <= 0;
    const consumed = { inField: !!f.items.find((i) => i === gun && i.inWorld), parented: !!gun.root.parent };
    // press again on the same spot — if the prop survived, this is where the duplicate appears
    const offeredAgain = f.items.filter((i) => i.inWorld
      && i.root.position.distanceToSquared(p.pos) <= (e.eReach ?? 1.25) ** 2).length;
    const r2 = p.interact(f, e.eReach ?? 1.25, 'shoulderL');
    await new Promise((r) => setTimeout(r, 800));
    const afterDup = p.rig.caps.armGadgets.slice();
    // ⚠️ READ THE FIELD COUNT **HERE**, BEFORE THE CONTROL RUNS. The first draft read it at the
    // end of the whole block and the control's own pickup had by then consumed a second item, so
    // a correct −1 was measured as −2 and the check failed the game for its own bookkeeping.
    const looseAfterGun = f.items.filter((i) => i.inWorld).length;

    // ---- CONTROL: a genuinely different pickup must still go on the other arm.
    const ball = f.items.find((i) => i.inWorld && i.type === 'gadget' && i.gadget === 'ball');
    let two = null;
    if (ball) {
      if (p.rig.occupant('shoulderL') !== 'empty') p.rig.detach('shoulderL');
      await new Promise((r) => setTimeout(r, 600));
      await put(ball);
      p.interact(f, e.eReach ?? 1.25, 'shoulderL');
      await new Promise((r) => setTimeout(r, 800));
      two = p.rig.caps.armGadgets.slice();
    }
    return {
      ok: true, loose0, looseAfterGun, looseEnd: f.items.filter((i) => i.inWorld).length,
      first: r1?.kind ?? null, second: r2?.kind ?? null, cdClear,
      consumed, offeredAgain, afterDup, two,
    };
  });
  note(`R6: ${JSON.stringify(dup)}`);
  if (!dup.ok) {
    skip('one gadget pickup makes exactly one worn gadget', dup.why);
  } else {
    const noDup = dup.consumed.inField === false && dup.consumed.parented === false
      && dup.looseAfterGun === dup.loose0 - 1
      && dup.offeredAgain === 0
      && dup.cdClear === true          // the second press was ALLOWED to happen — see above
      && dup.afterDup.filter((g) => g === 'nailgun').length === 1;
    const stillTwo = Array.isArray(dup.two) && dup.two.length === 2 && new Set(dup.two).size === 2;
    (noDup && stillTwo)
      ? pass('one gadget pickup makes exactly one worn gadget',
        `loose ${dup.loose0}->${dup.looseAfterGun}, prop gone from field and scene, nothing left in reach, wearing [${dup.afterDup}]; CONTROL: a real second pickup still fits — [${dup.two}]`)
      : fail('one gadget pickup makes exactly one worn gadget',
        `dup-free ${noDup} (inField ${dup.consumed.inField}, parented ${dup.consumed.parented}, loose ${dup.loose0}->${dup.looseAfterGun}, offeredAgain ${dup.offeredAgain}, wearing [${dup.afterDup}]) · CONTROL two-gadgets ${stillTwo} ([${dup.two}])`);
  }
  await shot('refit-pickup');

  // Leave the body as `resetBody()` expects to find it for every group after this one.
  await restoreBody();
  const cleaned = await body();
  note(`post-cleanup: ${cleaned.map} loose=${cleaned.loose}`);
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

// ---------------------------------------------------------------- 5. round reset
/**
 * ♻️ **DOES A ROUND ACTUALLY GO BACK TO THE START?** — the gap that let three bugs reach a
 * playtest at once, and the fifth assertion family this suite has needed.
 *
 * **THE SUITE HAD NEVER ONCE RESET A ROUND.** `inputs`, `slowframes`, `animation` and `world`
 * all run forward from boot inside one life, so every one of them is blind to state that
 * survives a death it never causes. On 2026-08-09 John reported three defects in one session
 * and all three lived exactly here:
 *
 *   *"movement input continue permanently after an escape"*        `Input.keys` is a HELD-key
 *     set whose only eraser is `keyup`, and the transition into a modal eats it. The robot
 *     walks into a wall for the rest of the round.
 *   *"the sledge will appear floating in front of me but I need to pick up a new one"*
 *     `unequip()` STOWS the prop — reparented to the chest and still drawn — while `owned`
 *     went false. Two states came apart: a hammer on his back that the game said he had never
 *     found, and a second one lying at the spawn anchor.
 *   *"everything needs to be reset properly"*                      the general case, and the
 *     reason this check compares a WORLD rather than the two symptoms above.
 *
 * 🎯 **THE SHAPE THAT CATCHES ALL THREE IS: RESET, SNAPSHOT, WRECK THE WORLD, RETRY, COMPARE.**
 * The baseline is taken from a reset rather than from boot, so the two states are produced by
 * the same code path and any difference is a leak rather than a difference between "fresh page"
 * and "fresh round" — which are not the same thing and were being conflated.
 *
 * ⚠️ **THE RETRY IS THE ADVERTISED KEY, NOT `engine.resetRound()`.** R is on the game's own
 * control card, and `buildDeathWatch` binds it to `restart()` → `liveRestart()` → `resetRound()`
 * — three hops, any of which can be the broken one. Calling the innermost function directly
 * would have passed on a build where R was unbound, which is the exact class of hole the
 * contract family exists to close.
 *
 * ⚠️ **AND THE KEY IS DISPATCHED WITH NO `keyup`, DELIBERATELY.** That is not laziness, it is
 * the reproduction: a real retry destroys the modal and moves focus while the player still has
 * keys down, so the `keyup` lands nowhere. Sending a clean press would test a case that cannot
 * happen and would pass against the bug.
 *
 * ⚠️ **THREE FACTS ARE READ INSIDE THE SAME SYNCHRONOUS `evaluate` AS THE KEYPRESS**, because
 * they are true only until the next frame: `cam._first` is consumed by the first
 * `ThirdPersonCamera.update` after the reset, and the held-key set is refilled by nothing but
 * would be indistinguishable from "never cleared" if a stray event arrived. `Input`'s own
 * `keydown` listener is registered at view construction and `buildDeathWatch`'s at the end of
 * it, so within this one dispatch the key is added to `keys` FIRST and the reset must then take
 * it away — i.e. the assertion runs against a set that genuinely had something in it.
 *
 * 🚨 **AND IT READ 12/12 WHILE THE LOADOUT LEAKED — WIDENED 2026-08-10, `reset-2`.**
 *
 * John, playing the build this check was supposed to be guarding: *"I escaped with the skates
 * on and respawned with them. we were supposed to have fixed the reset not working on load out
 * and all the items."* He was right, and this check was green the whole time. **A gate that
 * passes while the defect it was written for is present is worse than no gate**, so the reason
 * it could not see the bug is worth stating exactly — it is a property of the WRECK step, not
 * of the comparison:
 *
 *   **the perturbation only ever TOOK THINGS OFF the body.** It detached two limbs and left
 *   them off. Nothing in it ever fitted a gadget, fitted the skates, or put a part back in the
 *   wrong socket — so `sockets` compared `'limb'` to `'limb'` and agreed, every time. The
 *   comparison was fine. It was being asked about a body that had never been dressed.
 *
 * That is the same shape as this file's first slow-frame check (passed with the fix reverted)
 * and as the probe that accepted "closed" unconditionally: **the assertion was never exercised
 * against the state it claims to reject.** The fix in the game is `resetRound`'s
 * `stripToLoadout()`; the fix here is that the wreck now DRESSES the body — skates on, a nail
 * gun bolted into a shoulder, both legs swapped onto the wrong hips — and three new fields say
 * so. Validated by reintroduction: with `stripToLoadout()` neutered this check FAILS naming all
 * three; restored, it passes.
 *
 * ⚠️ **SEED-INDEPENDENT PREDICATES ONLY.** An unpinned run draws a NEW seed on retry
 * (`liveRestart` — matching what the win screen's page reload used to buy), so the interconnect
 * region moves and the exact barrier-cell count is not comparable across the retry. The check
 * asserts the barrier is ARMED rather than identical, and asserts dig damage is ZERO, which is
 * true on every seed. A count-equality test here would flake roughly with the seed lottery and
 * would be blamed on the game.
 */
groups.reset = async () => {
  /**
   * What a round owns, read off the live objects. Uses the field's own `passable()` rather than
   * re-deriving `depth >= OPEN_AT && !barrier` out here — this project's standing rule, after
   * five instruments were caught testing their own copy of a rule instead of the game's.
   */
  const world = () => page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player, r = e.room;
    const digs = (r.panels ?? []).filter((x) => x.spec?.dig && x.field);
    let open = 0, barrier = 0, facesArmed = 0;
    for (const d of digs) {
      const f = d.field;
      let b = 0;
      for (let i = 0; i < f.depth.length; i++) {
        if (f.passable(i)) open++;
        if (f.barrier[i]) b++;
      }
      barrier += b;
      if (b > 0) facesArmed++;
    }
    let debrisLive = 0;
    for (const k in (e.debris?.pools ?? {})) debrisLive += e.debris.pools[k].liveCount ?? 0;
    const hudEl = document.querySelector('.rrr-hud');
    return {
      owned: !!p.sledge?.owned,
      equipped: !!p.sledge?.equipped,
      // THE GHOST. `owned`/`equipped` false while the prop is still parented and drawn is
      // precisely the state John photographed, so the parent is the fact worth reading.
      parented: !!p.sledge?.root?.parent,
      /**
       * 🔨 **HOW MANY SLEDGEHAMMERS ARE LYING IN THE WORLD, ADDED 2026-08-10 BECAUSE THE
       * PERTURBATION BELOW CHANGED SHAPE UNDER THIS CHECK'S FEET.** `views/game.js`'s
       * `dropSledge()` now puts the hammer on the FLOOR when a wound disarms you (John: *"the
       * sledge also needs to drop on the floor instead of just floating in front of the
       * player"*), and `SledgeRig.forget()` sets `owned = false` as it goes. The staging below
       * draws the hammer and then empties a shoulder, so by the next frame **`owned` is false
       * again** — the field this check used as its "the hammer perturbation landed" guard had
       * become unreachable, and the check went red on a correct build. The honest replacement
       * is the consequence rather than the flag: there are two hammers in the room instead of
       * one, and a retry has to sweep the extra one.
       */
      sledges: e.limbField.items.filter((i) => i.inWorld && i.type === 'sledge').length,
      loose: e.limbField.items.filter((i) => i.inWorld).length,
      sockets: ['hipL', 'hipR', 'shoulderL', 'shoulderR'].map((s) => `${s}:${p.rig.occupant(s)}`).join(' '),
      // ---- THE LOADOUT. Three facts `occupant()` alone cannot state, and all three were
      // surviving a respawn on 2026-08-10 while this check read 12/12. See the group header.
      //
      // ⚠️ `skates` IS NOT A SOCKET. `fitSkates()` mounts `shinBoth` OVER both legs and sets
      // `rig.skates`; `occupant('hipL')` still says `'limb'`. The socket string above can
      // never see them, which is exactly why John played a round on last life's skates
      // against a green suite.
      skates: !!p.rig.skates,
      // Which socket holds WHICH gadget, not merely that one does — `sockets` above already
      // reads `'gadget'`, but nothing ever put a gadget on the body before the retry, so that
      // field was comparing `'limb'` to `'limb'` and agreeing.
      gadgetSockets: ['shoulderL', 'shoulderR', 'hipL', 'hipR']
        .filter((s) => p.rig.occupant(s) === 'gadget')
        .map((s) => `${s}=${p.rig.sockets[s].item?.gadget}`).join(','),
      // A limb fitted to the WRONG SIDE reads `'limb'` forever. Identity is the only tell, so
      // this is the rig's own part table (`rules.js` SOCKET_LIMB) compared by object, which is
      // the same predicate `resetRound`'s `stripToLoadout()` uses to decide what to take off.
      foreignLimbs: Object.entries(
        { shoulderL: 'armL', shoulderR: 'armR', hipL: 'legL', hipR: 'legR' },
      ).filter(([s, limb]) => p.rig.occupant(s) === 'limb'
        && p.rig.sockets[s].item?.root !== p.unit.limbs[limb]).map(([s]) => s).join(','),
      gait: p.rig.caps?.gait ?? null,
      arms: p.rig.caps?.arms ?? null,
      digOpen: open, barrier, digFaces: digs.length, facesArmed,
      debrisLive,
      hudHidden: hudEl ? hudEl.style.opacity === '0' : null,
      pos: [+p.pos.x.toFixed(2), +p.pos.z.toFixed(2)],
      hunter: e.hunter?.state ?? null,
      awareness: +(e.hunter?.awareness ?? 0).toFixed(3),
      runT: +(e.run?.t ?? 0).toFixed(1),
    };
  });

  // ---- 1. a canonical spawn, produced by the same path the retry will take
  await page.evaluate(() => window.__rrr.engine.resetRound());
  await page.waitForTimeout(700);
  const spawn = await world();
  note(`spawn: loose=${spawn.loose} digOpen=${spawn.digOpen} armed=${spawn.facesArmed}/${spawn.digFaces} sledge(owned=${spawn.owned},drawn=${spawn.parented})`);

  // ---- 2. WRECK IT. One perturbation per thing a round owns, each mirroring a real event.
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player, r = e.room;
    // the hammer, found and in both hands — the state a retry has to undo
    p.sledge.owned = true;
    p.sledge.equip?.();
    // a real dig: 40 blows at one spot on the first free face, through the panel's own path
    const face = (r.panels ?? []).find((x) => x.spec?.dig && x.field);
    if (face) for (let i = 0; i < 40; i++) face.applyHit(face.pointAt(0.5, 0.45), 1);
    // ...and the cyan down, which is what [B] does
    for (const x of r.panels ?? []) if (x.spec?.dig) x.setBarrier(false);

    // ---- THE LOADOUT, ALL THREE WAYS A ROUND CAN LEAVE KIT ON THE BODY.
    //
    // ⚠️ **THE ORDER IS THE GAME'S RULE, NOT A PREFERENCE, AND GETTING IT WRONG SILENTLY
    // UNSTAGES THE HEADLINE CASE.** `LimbRig.detach()` calls `removeSkates()` whenever the
    // socket is a LEG — they are bolted to both ankles — and `fitSkates()` refuses unless
    // BOTH legs are present. So every leg move has to happen before the skates go on, and no
    // leg may be left empty. Fitting them first, or emptying a hip, takes them straight back
    // off and the check then "passes" against a body that never wore any.
    //
    // (a) the body's own legs, crossed. Both hips still read `'limb'` — this is the case the
    //     socket string cannot express, and it is reachable by scavenging a part and fitting
    //     it to the other side.
    const lLeg = p.rig.detach('hipL', { voluntary: true });
    const rLeg = p.rig.detach('hipR', { voluntary: true });
    if (lLeg && rLeg) { p.rig.attach('hipL', rLeg); p.rig.attach('hipR', lLeg); }
    // (b) rocket skates — `rig.skates`, invisible to every socket predicate, and they change
    //     the movement model outright (`caps.gait` goes to `'skate'`).
    p.rig.fitSkates();
    // (c) a gadget bolted into a socket. This is the one with teeth beyond cosmetics: a fitted
    //     gadget makes that socket's type `'gadget'`, so `caps.arms` drops to 1 and
    //     `_toggleSledge`'s `caps.arms === 2` gate means the next round's player can pick the
    //     hammer up and never draw it. It also displaces the real arm onto the floor, so the
    //     `loose` comparison below doubles as "the ejected arm was swept, not left lying".
    p.rig.fitGadget('shoulderR', 'nailgun');
    // (d) and a limb torn off outright, so a socket is genuinely EMPTY at retry time and the
    //     refit half of the reset is still under test — the no-op reclaim block that started
    //     this whole family. shoulderL only: the hips are spoken for by (a) above.
    if (p.rig.occupant('shoulderL') === 'limb') p.rig.detach('shoulderL');
    // the modal's side effect that nothing ever undid
    e.gameHud?.setHidden?.(true);
    // moved somewhere that is not the spawn
    const a = r.anchor?.('ballroom.centre'); if (a) p.pos.copy(a);
    // and the hunter mid-hunt
    if (e.hunter) { e.hunter.awareness = 1; e.hunter.state = 'PURSUE'; }
  });
  await page.waitForTimeout(900);
  const wrecked = await world();
  note(`wrecked: loose=${wrecked.loose} digOpen=${wrecked.digOpen} armed=${wrecked.facesArmed}/${wrecked.digFaces} debris=${wrecked.debrisLive} hudHidden=${wrecked.hudHidden}`);
  note(`wrecked loadout: skates=${wrecked.skates} gadget=${wrecked.gadgetSockets || '-'} wrongSide=${wrecked.foreignLimbs || '-'} gait=${wrecked.gait} arms=${wrecked.arms}`);

  // ⚠️ THE PERTURBATION MUST HAVE LANDED, OR THE COMPARISON BELOW IS VACUOUS. A check that
  // "resets" a world it never disturbed passes against every build including a `resetRound()`
  // whose body is empty — the same failure mode as this suite's first slow-frame check, which
  // passed with the fix reverted. Assert the damage exists before asserting it is gone.
  //
  // ⚠️ **AND THE LOADOUT HALF NEEDS ITS OWN THREE CLAUSES, FOR A REASON THAT ALMOST BIT THIS
  // EDIT.** Every one of the three staging calls above can decline silently — `fitSkates()`
  // returns false with fewer than two legs, `fitGadget()` returns `{ok:false}` for a non-arm
  // socket or an unknown name, and the leg cross is a no-op if either `detach` returns null.
  // A widened comparison sitting behind an unwidened guard would then assert "the skates came
  // off" about a body that never had any, and report green for the exact defect it was
  // written for — this suite's own founding failure, twice over.
  //
  // ⚠️ **THE HAMMER CLAUSE READS `sledges`, NOT `owned`, SINCE 2026-08-10 — see the field's own
  // note.** A drawn hammer on a body with an empty shoulder is no longer a reachable state: the
  // two-handed gate drops the tool on the floor and un-owns it within a frame, so `wrecked.owned`
  // is false on a correct build and this guard was refusing to run the comparison at all. What
  // the perturbation now leaves behind is a SECOND hammer in the room, which is a strictly
  // stronger thing for a retry to have to clean up than a flag on the player.
  const staged = wrecked.digOpen > spawn.digOpen && wrecked.sledges > spawn.sledges && wrecked.hudHidden === true
    && wrecked.skates === true && wrecked.gadgetSockets !== '' && wrecked.foreignLimbs !== '';
  if (!staged) {
    fail('a round reset puts the world back', `perturbation did not land (digOpen ${spawn.digOpen}->${wrecked.digOpen}, sledges ${spawn.sledges}->${wrecked.sledges}, hudHidden ${wrecked.hudHidden}, skates ${wrecked.skates}, gadget "${wrecked.gadgetSockets}", wrongSide "${wrecked.foreignLimbs}") — the check cannot see anything`);
    await shot('reset');
    return;
  }

  // ---- 3. RETRY THE WAY A PLAYER DOES: R, with the key never released.
  const immediate = await page.evaluate(() => {
    const e = window.__rrr.engine;
    for (const code of ['KeyW', 'KeyD']) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code === 'KeyW' ? 'w' : 'd', bubbles: true }));
    }
    // ...and R, in the same task, with no keyup for any of the three.
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', key: 'r', bubbles: true }));
    return { keys: e.input?.keys?.size ?? -1, once: e.input?.once?.size ?? -1, camFirst: e.cam?._first === true };
  });
  await page.waitForTimeout(900);
  const after = await world();

  // ---- 4. compare, field by field, with the predicate each field actually deserves
  const bad = [];
  if (after.owned || after.equipped || after.parented) {
    bad.push(`sledge ghost (owned=${after.owned} equipped=${after.equipped} stillDrawn=${after.parented})`);
  }
  if (immediate.keys !== 0) bad.push(`${immediate.keys} keys still held`);
  if (immediate.once !== 0) bad.push(`${immediate.once} key latches still set`);
  if (!immediate.camFirst) bad.push('camera did not snap (cam._first false)');
  if (after.digOpen !== 0) bad.push(`${after.digOpen} dug cells survived`);
  if (after.facesArmed !== after.digFaces) bad.push(`barriers not re-armed (${after.facesArmed}/${after.digFaces} faces)`);
  if (after.loose !== spawn.loose) bad.push(`loose pickups ${spawn.loose} -> ${after.loose}`);
  // ...and the dropped hammer specifically, named rather than folded into the count above: a
  // retry that leaves two sledgehammers in the house is the 2026-08-09 defect wearing a new hat.
  if (after.sledges !== spawn.sledges) bad.push(`sledgehammers in the world ${spawn.sledges} -> ${after.sledges}`);
  if (after.sockets !== spawn.sockets) bad.push(`sockets "${after.sockets}" != "${spawn.sockets}"`);
  // ---- the loadout. Compared against the SPAWN, like everything else here, so the bar is
  // "what a round starts with" rather than a restated list that can drift from the game.
  if (after.skates !== spawn.skates) bad.push(`rocket skates survived the respawn (gait ${after.gait})`);
  if (after.gadgetSockets !== spawn.gadgetSockets) {
    bad.push(`socket gadgets survived ("${after.gadgetSockets}" != "${spawn.gadgetSockets}", arms ${after.arms})`);
  }
  if (after.foreignLimbs !== spawn.foreignLimbs) {
    bad.push(`limb in the wrong socket survived (${after.foreignLimbs || '-'})`);
  }
  if (after.hudHidden !== false) bad.push('HUD still hidden');
  if (after.debrisLive !== 0) bad.push(`${after.debrisLive} debris pieces survived`);
  if (Math.hypot(after.pos[0] - spawn.pos[0], after.pos[1] - spawn.pos[1]) > 0.35) {
    bad.push(`spawn moved ${spawn.pos} -> ${after.pos}`);
  }
  if (after.hunter !== spawn.hunter || after.awareness !== 0) {
    bad.push(`hunter ${after.hunter}/aw ${after.awareness} != ${spawn.hunter}/aw 0`);
  }
  if (after.runT > spawn.runT + 3) bad.push(`run clock did not restart (${after.runT}s)`);

  bad.length === 0
    ? pass('a round reset puts the world back', `17 properties (14 world + 3 loadout), R from a wrecked world (dug ${wrecked.digOpen} cells, ${wrecked.debrisLive} debris, skates + ${wrecked.gadgetSockets} + legs crossed)`)
    : fail('a round reset puts the world back', bad.join(' · ').slice(0, 400));
  await shot('reset');
};

// ---------------------------------------------------------------- run
const order = ['inputs', 'reach', 'slowframes', 'refit', 'animation', 'world', 'reset'];
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
