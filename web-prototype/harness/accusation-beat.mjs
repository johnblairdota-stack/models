#!/usr/bin/env node
/**
 * accusation-beat — when the Reckoning names somebody, does ANYTHING happen on screen?
 *
 *   node harness/accusation-beat.mjs            # writes progress/accusation/
 *   node harness/accusation-beat.mjs --keep     # leave vite up
 *
 * ⚠️ **THIS GATE IS WRITTEN BEFORE THE FEATURE AND IT FAILS TODAY. THAT IS THE POINT.**
 *
 * A gate that could not fail before the fix proves nothing about the fix. This file was landed
 * red, deliberately, so that the three agents wiring the accusation beat have something that
 * goes green *because the beat reached the television* rather than because a unit test of a
 * state machine agreed with itself. Read the run at the bottom of this header for exactly which
 * lines were red on the day it was written and what each of them was reading when it said so.
 *
 * WHY THIS FILE EXISTS. Today the Reckoning marks a nominee by making one sprite visible —
 * `nomBang`, a red `!` over the name tag (`chest-nameplate.js:453`, `intro-bed.js:663`). Eight
 * robots sit motionless in a circle and one of them acquires a punctuation mark. The replacement
 * is a staged performance: the NOMINATOR stands up out of their chair, the ACCUSED flinches and
 * then HOLDS a posture, and the accused's name tag changes colour. Three things that are all
 * animation and all invisible to every existing gate — `party-night` can prove the ballot rows
 * fanned out, `episode-order` can prove the beat ran, and neither of them can see a robot.
 *
 * ---------------------------------------------------------------------------------------
 * ⚠️ IT DRIVES THE FOLLOW VIEW DIRECTLY — the design is inherited, not invented here.
 * ---------------------------------------------------------------------------------------
 * `nametag-legibility.mjs` documents the four failed attempts at length: booting a room server,
 * phones and a whole night to reach a talk beat is a race against a mansion bake whose time
 * swings by minutes under swiftshader, `#go` is disabled while it bakes, `.click()` on a disabled
 * button is a silent no-op, and a cue that lands early is dropped and never retried. None of that
 * is what is being measured and all of it can fake the result. `circle-staging.mjs` reached the
 * same conclusion independently.
 *
 * So: one page, `?view=party.follow&warm=1`, one `intros` cue to seat eight, one `noms` cue to
 * accuse one of them. No server, no phones, no beats, no night. Both cues go through
 * `cueViolations` in bare node here BEFORE they are posted (A0c) and through the same function
 * again at the iframe's door, so a cue this file gets wrong is a thrown error and not a silent
 * nothing.
 *
 * No screenshots. A sibling bench died on a 30s `page.screenshot` timeout under swiftshader;
 * everything below is geometry and pixels read out of the live scene inside one evaluate.
 *
 * ---------------------------------------------------------------------------------------
 * 🦴 HOW A CLIP IS READ, AND THE ONE LINE SOMEBODY HAS TO WIRE
 * ---------------------------------------------------------------------------------------
 * `mesh-avatar.js` exposes `get clip()` on the avatar (line 1447 on the clone path: it returns
 * the seated clip's real name, `Chair_Sit_Idle_M`, while `pose === 'sit'`). `intro-bed.js`
 * `sitReport()` (line 708) already collects that per robot, keyed by seat id, alongside the sit
 * flag and the pelvis. **Neither is reachable from the page.** `window.__rrr` is
 * engine/settle/ready/frames/perf/redraw and nothing else (`core/engine.js:208`), and
 * `window.__rrrFollow` publishes room / runner / readout / mode / world / stream / cam / hunter
 * (`views/party-follow.js:200`) — `sitReport` is not on it and `follow-bed.js` does not forward
 * it the way it forwards `streamReport`.
 *
 * So the clip is read through a chain, tried in this order, and the gate PRINTS which route
 * answered so nobody has to guess:
 *
 *   1. `window.__rrrFollow.sit()` — the existing `intro.sitReport()`, forwarded. **This is the
 *      preferred wiring and it is one line in `follow-bed.js` next to `streamReport` plus one
 *      in `party-follow.js` next to `stream`.** The data already exists and already carries the
 *      clip name; nothing new has to be computed.
 *   2. `userData.clip` (or `userData.avatarClip`) stamped on any object under the robot's root.
 *   3. nothing — and then A2b/A3b fail saying the show cannot name what it is playing.
 *
 * ⚠️ **A CLIP NAME ALONE IS NOT EVIDENCE, WHICH IS WHY EVERY CLIP CHECK IS PAIRED WITH A POSE
 * CHECK.** Whichever route above gets wired, it is a string, and a string can be stamped by code
 * that animates nothing. A2/A3 read BONES — real world positions of real bones in the live
 * scene, which no label can fake — and A2b/A3b read the label. Both halves have to be true, and
 * when one fails its message says which half, so "the animation is missing" and "the animation
 * plays but no instrument can name it" never get confused for each other again.
 *
 * ---------------------------------------------------------------------------------------
 * 📏 THE BAND IS MEASURED FROM THE CONTROL, NOT PICKED
 * ---------------------------------------------------------------------------------------
 * Eight seated robots are not still. They all loop `Chair_Sit_Idle_M` (10.7 s) at a per-seat
 * phase offset (`chair-seats.js` `sitPhase` — `seatIndex * 1.37`), torso frozen at
 * `SIT_UPRIGHT_T` but arms looping, so every bone in the circle is drifting all the time. A
 * fixed "moved by more than X" threshold would either miss a real stand or convict the idle.
 *
 * Instead each robot is compared to ITS OWN pre-cue baseline, and the six uninvolved robots'
 * deltas ARE the band: whatever the sit loop does to a bystander over the same wall-clock
 * interval is the noise floor, measured in the same run, on the same build, at the same frame
 * rate. The nominator and the accused have to clear `max(band * BAND_K, MOTION_FLOOR_M)`.
 *
 * ⚠️ Bone offsets are taken RELATIVE TO THE ROBOT'S OWN ROOT, so a body that walks does not read
 * as a body that moved its limbs — and the root's own displacement is measured separately and
 * folded in, because "stood up and stepped forward" must count as standing up. `motion` below is
 * the larger of the two.
 *
 * ---------------------------------------------------------------------------------------
 * 🎨 THE TAG COLOUR IS COMPARED INSIDE ONE FRAME. NEVER AGAINST AN EARLIER FRAME.
 * ---------------------------------------------------------------------------------------
 * Inherited from `nametag-legibility.mjs` N6, which cost two false failures to learn: the talk
 * camera walks the ring continuously, so a tag's measured colour drifts with angle and distance,
 * and a baseline captured seconds earlier made FOUR tags "change" when two had. A4b therefore
 * measures the accused's plate against the other seven **in the same readPixels**, and A4 reads
 * `userData.tagSkin` — the exact, camera-free record of which skin `setNameTagLabel` painted.
 *
 * The same file also records the other half of that lesson: do not compare `p05`. It is the
 * BLACK GLYPH OUTLINE, black on every skin there has ever been, and it sat still through a
 * working mechanic. Mean RGB is what moves when the plate is repainted.
 *
 * ---------------------------------------------------------------------------------------
 * 🚦 THE CONTROL IS THE CHECK THAT PASSES TODAY
 * ---------------------------------------------------------------------------------------
 * A5 asserts a robot who is NEITHER nominator NOR accused is still sitting there doing nothing.
 * Without it, a beat that made all eight robots stand up would satisfy A2 and A3 perfectly, and
 * "everyone reacted" is not a staged accusation, it is a bug that looks like a feature. A5 is
 * expected to pass on day one and to keep passing — it is the only line here that is allowed to
 * be green before the fix, and a run in which A5 goes red while A2/A3 go green is a run that has
 * proved nothing at all.
 *
 * ---------------------------------------------------------------------------------------
 * 📋 WHAT IT REPORTED ON THE DAY IT WAS WRITTEN (2026-08-28, before the beat existed)
 * ---------------------------------------------------------------------------------------
 * See `RUN_LOG` at the foot of this file. The short version: A0/A0b/A0c/A1/A1b green — the
 * ballroom warms, eight robots sit, eight tags exist, and the `noms` cue reaches the circle and
 * lights the old red `!` on exactly the accused, so the cue path is proved good and every
 * failure below is the missing beat and not a dropped message. A2, A2b, A3, A3b, A4, A4b red.
 * A5 green.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { cueViolations, CUE_NOM_KEYS } from '../src/party/follow.js';
import { SIT_IDLE_SHIP } from '../src/game/chair-seats.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const KEEP = argv.includes('--keep');
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };

/** 5193 — 5194 is `circle-staging`, 5197 `nametag-legibility`, 5192 the plain serve. */
const WEB = +arg('--port', 5193);
const SEED = +arg('--seed', 3);
const WAIT = +arg('--wait', 240000);
const SHOTDIR = path.join(ROOT, 'progress', 'accusation');

/**
 * How much louder than the sit loop a reaction has to be. A stand lifts the hips ~0.35 m and a
 * held flinch reshapes the whole torso; the idle's own drift is a couple of centimetres. 3x is
 * deliberately not tight — the gate is here to catch NOTHING HAPPENING, and a beat that only
 * just clears the idle it is meant to break out of is a beat nobody in the room will notice.
 */
const BAND_K = 3;
/** …and an absolute floor, so a freakishly still control frame cannot make a twitch qualify. */
const MOTION_FLOOR_M = 0.06;
/** The control's ceiling: a robot doing nothing must stay inside this against its own baseline. */
const STILL_M = 0.05;
/**
 * Plate colour. `nametag-legibility` N6b uses a 12-point gap on one channel pair for the pair
 * green; this is the same order of magnitude as a Euclidean RGB distance, and it must also beat
 * the spread the seven unaccused plates show among THEMSELVES in the same frame (angle and
 * distance move a plate's measured colour), so the live band is folded in below.
 */
const PLATE_GAP = 14;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0; let fail = 0;
const t = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}${d ? ` · ${d}` : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? ` · ${d}` : ''}`); }
  return !!c;
};

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 700);
});

/**
 * Eight, because eight is the table the Reckoning is designed around and the cap `intro-bed`
 * slices to. Names are distinct on purpose — duplicates are a locked product rule and this file
 * maps a scene object back to a cast member by the ROOT'S NAME (`player.intro-<id>`,
 * `player.js:198`), but the printed rows are read by a human and two `SAM`s in a failure message
 * help nobody.
 */
const CAST = [
  { id: 'p1', seat: 0, name: 'JOHN', shell: '#d8dade', accent: '#f5a14a' },
  { id: 'p2', seat: 1, name: 'ELLIE', shell: '#d8dade', accent: '#e8d5a3' },
  { id: 'p3', seat: 2, name: 'SAM', shell: '#d8dade', accent: '#ff7a59' },
  { id: 'p4', seat: 3, name: 'BEX', shell: '#d8dade', accent: '#f0ebe3' },
  { id: 'p5', seat: 4, name: 'BO', shell: '#d8dade', accent: '#c47a4a' },
  { id: 'p6', seat: 5, name: 'MARA', shell: '#d8dade', accent: '#9ad7c2' },
  { id: 'p7', seat: 6, name: 'OZZ', shell: '#d8dade', accent: '#7fb3e8' },
  { id: 'p8', seat: 7, name: 'JELL', shell: '#d8dade', accent: '#e5c04a' },
];

/**
 * One accusation. `CUE_NOM_KEYS = ['nominator', 'target']` (`party/follow.js:521`) — the same
 * pair `FANOUT_KEYS.nomRow` already fans to every socket, so nothing new crosses the wire.
 *
 * ⚠️ **THE NOMINATOR AND THE ACCUSED SIT ON OPPOSITE SIDES OF THE CIRCLE** (seat 1 and seat 5).
 * Adjacent seats would let a camera that happens to frame one of them frame both, and a bug that
 * animated "the robot nearest the lens" would pass. They are also the two the sweeping talk
 * camera cannot hold in one shot, which is why A2/A3 read bones (no camera needed) and only A4b
 * needs anybody on screen.
 */
const NOMINATOR = 'p2';
const ACCUSED = 'p6';
/** Neither of the above and not their neighbours — the control. */
const BYSTANDER = 'p4';

const NOMS_CUE = { kind: 'noms', standing: [{ nominator: NOMINATOR, target: ACCUSED }] };
const INTROS_CUE = { kind: 'intros', cast: CAST, talk: true };

/* ==============================================================================================
 * WHAT IS MEASURED, per robot, in ONE evaluate:
 *
 *   root        world position of `player.intro-<id>` — where the body IS
 *   bones       every bone under that root, world position MINUS the root's, so the numbers
 *               describe the POSE and not the placement. Keyed by bone name, sorted, so two
 *               snapshots can be differenced key by key even if the traverse order changes.
 *   hipsY/headY the two that make "stood up" legible in a printed row rather than a norm
 *   clip        whatever the chain in the header could find, plus WHICH route found it
 *   tag         the `headName` sprite: its label, its skin, its screen rect, and the mean RGB of
 *               its pixels straight out of the GL buffer
 *   bang        is the old red `!` lit — the proof the noms cue actually arrived
 *
 * `redraw()` and `readPixels()` sit in the same task with no await between them: the drawing
 * buffer is only guaranteed intact inside the same task as the render.
 * ============================================================================================ */
const SNAP = () => {
  const eng = window.__rrr?.engine;
  if (!eng) return { error: 'no engine', hasRrr: !!window.__rrr };
  const cam = eng.camera;
  const scene = eng.scene;

  /*
   * ⚠️ **THERE IS NO `THREE` ON THE PAGE HANDLE.** `core/engine.js` publishes engine / settle /
   * ready / frames / perf / setGrade / freeRun / simState / silhouette / redraw, and nothing
   * else. Importing the module here would put a SECOND copy of THREE in the page, which is its
   * own class of bug. `circle-staging.mjs` solved it and this is the same solution: take a real
   * `Vector3` off an object that already has one — every Object3D's `.position` is one, with
   * every method needed — and clone it.
   */
  const V = () => cam.position.clone();

  /** The clip chain from the header. Route 1 is per-room and read once. */
  const sitRows = (() => {
    try {
      const rep = window.__rrrFollow?.sit?.() ?? window.__rrr?.sitReport?.();
      if (Array.isArray(rep)) {
        const m = {};
        for (const r of rep) if (r && r.id != null) m[String(r.id)] = r.clip ?? null;
        return m;
      }
    } catch { /* not wired — that is what A2b says */ }
    return null;
  })();

  const roots = [];
  scene.traverse((o) => { if (typeof o.name === 'string' && o.name.startsWith('player.intro-')) roots.push(o); });

  cam.updateMatrixWorld(true);
  const canvas = eng.renderer.domElement;
  const CW = canvas.width; const CH = canvas.height;

  window.__rrr.redraw?.();
  const gl = eng.renderer.getContext();
  const buf = new Uint8Array(CW * CH * 4);
  gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, buf);

  function sampleRect(x0, y0, x1, y1) {
    const ax = Math.max(0, Math.floor(Math.min(x0, x1)));
    const bx = Math.min(CW - 1, Math.ceil(Math.max(x0, x1)));
    const ay = Math.max(0, Math.floor(Math.min(y0, y1)));
    const by = Math.min(CH - 1, Math.ceil(Math.max(y0, y1)));
    let rs = 0; let gs = 0; let bs = 0; let n = 0;
    for (let y = ay; y <= by; y++) {
      const gy = CH - 1 - y;                    // readPixels is bottom-left, screen is top-left
      for (let x = ax; x <= bx; x++) {
        const i = (gy * CW + x) * 4;
        rs += buf[i]; gs += buf[i + 1]; bs += buf[i + 2]; n++;
      }
    }
    return n ? [rs / n, gs / n, bs / n] : null;
  }

  const v = V();
  const rootV = V();
  const out = [];
  for (const r of roots) {
    r.updateWorldMatrix(true, true);
    r.getWorldPosition(rootV);
    const id = r.name.slice('player.intro-'.length);

    const bones = {};
    let boneCount = 0;
    let clipStamp = null;
    r.traverse((o) => {
      if (o.userData && clipStamp == null) {
        const c = o.userData.clip ?? o.userData.avatarClip;
        if (typeof c === 'string' && c) clipStamp = c;
      }
      if (!o.isBone) return;
      boneCount++;
      o.getWorldPosition(v);
      bones[o.name] = [
        +(v.x - rootV.x).toFixed(4),
        +(v.y - rootV.y).toFixed(4),
        +(v.z - rootV.z).toFixed(4),
      ];
    });

    let tag = null; let bang = false;
    r.traverse((o) => {
      if (o.name === 'nomBang' && o.visible) bang = true;
      if (o.name !== 'headName') return;
      o.updateWorldMatrix(true, false);
      o.getWorldPosition(v);
      // Sprite anchor is bottom-centre (`center.set(0.5, 0)`), so the plate runs UP from here.
      const top = v.clone(); top.y += o.scale.y;
      const a = v.clone().project(cam);
      const b = top.clone().project(cam);
      const px = (p) => [(p.x * 0.5 + 0.5) * CW, (-p.y * 0.5 + 0.5) * CH];
      const [ax, ay] = px(a);
      const [, by] = px(b);
      const hPx = Math.abs(ay - by);
      const wPx = hPx * (o.scale.x / Math.max(1e-6, o.scale.y));
      const onScreen = a.z > -1 && a.z < 1 && ax >= 0 && ax <= CW && ay >= 0 && ay <= CH && hPx >= 6;
      const ins = 0.15;
      const rgb = onScreen
        ? sampleRect(ax - wPx * (0.5 - ins), by + hPx * ins, ax + wPx * (0.5 - ins), ay - hPx * ins)
        : null;
      tag = {
        label: o.userData?.tagLabel ?? null,
        /** '' until `setNameTagLabel` paints a skin. The exact, camera-free colour record. */
        skin: o.userData?.tagSkin ?? '',
        onScreen,
        dist: +cam.position.distanceTo(v).toFixed(2),
        tagPx: [Math.round(wPx), Math.round(hPx)],
        rgb: rgb ? rgb.map((c) => +c.toFixed(1)) : null,
      };
    });

    out.push({
      id,
      root: [+rootV.x.toFixed(4), +rootV.y.toFixed(4), +rootV.z.toFixed(4)],
      boneCount,
      bones,
      hipsY: bones.Hips ? bones.Hips[1] : null,
      headY: bones.Head ? bones.Head[1] : null,
      clip: sitRows?.[id] ?? clipStamp ?? null,
      clipVia: sitRows?.[id] != null ? 'sitReport' : (clipStamp != null ? 'userData' : null),
      tag,
      bang,
    });
  }

  return {
    frame: eng.frame,
    canvas: [CW, CH],
    cam: [+cam.position.x.toFixed(2), +cam.position.y.toFixed(2), +cam.position.z.toFixed(2)],
    clipChannel: sitRows ? 'sitReport' : (out.some((r) => r.clipVia === 'userData') ? 'userData' : null),
    robots: out,
  };
};

/** Largest bone displacement between two snapshots of the same robot, plus the root's own move. */
function motionOf(a, b) {
  if (!a || !b) return null;
  let boneMax = 0; let worst = null;
  for (const [name, pa] of Object.entries(a.bones)) {
    const pb = b.bones[name];
    if (!pb) continue;
    const d = Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]);
    if (d > boneMax) { boneMax = d; worst = name; }
  }
  const rootMove = Math.hypot(b.root[0] - a.root[0], b.root[1] - a.root[1], b.root[2] - a.root[2]);
  return {
    bone: +boneMax.toFixed(4),
    worstBone: worst,
    root: +rootMove.toFixed(4),
    /* "Stood up and stepped forward" must count as standing up, so the placement move counts. */
    motion: +Math.max(boneMax, rootMove).toFixed(4),
    hipsRise: (a.hipsY != null && b.hipsY != null) ? +(b.hipsY - a.hipsY).toFixed(4) : null,
  };
}

const dist3 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const meanRgb = (rows) => {
  const ok = rows.filter((r) => r?.tag?.rgb);
  if (!ok.length) return null;
  return [0, 1, 2].map((i) => ok.reduce((s, r) => s + r.tag.rgb[i], 0) / ok.length);
};

const kids = [];
console.log('\naccusation-beat — does the Reckoning STAGE the accusation, or just print a "!"?\n');

if (await portOpen(WEB)) console.log(`  reusing vite on :${WEB}`);
else {
  console.log(`  starting vite on :${WEB} …`);
  const p = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'),
    '--port', String(WEB), '--strictPort', '--host', '127.0.0.1'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => { err += d.toString(); });
  kids.push(p);
  const t0 = Date.now();
  while (!(await portOpen(WEB))) {
    if (Date.now() - t0 > 30000) throw new Error(`vite never opened :${WEB}\n${err}`);
    await sleep(250);
  }
}

const base = `http://127.0.0.1:${WEB}`;
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

let exitCode = 1;
try {
  await mkdir(SHOTDIR, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`console: ${m.text()}`); });

  /*
   * `warm=1` bakes the mansion and parks the camera in the ballroom with no runner and no name —
   * a warm slot carrying either is a `warmViolations` failure. The cast arrives by cue.
   */
  const url = `${base}/?view=party.follow&warm=1&seed=${SEED}`;
  console.log(`  loading ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // The bake is the slow part (70-110s under swiftshader, and it swings). Wait on the engine's
  // own ready flag, never a stopwatch.
  const t0 = Date.now();
  let ready = false;
  while (Date.now() - t0 < WAIT) {
    ready = await page.evaluate(() => !!window.__rrr?.ready).catch(() => false);
    if (ready) break;
    await sleep(2000);
  }
  console.log(`  mansion ${ready ? 'warm' : 'NOT warm'} after ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  t('A0 · the ballroom warmed', ready);

  /*
   * A0c · both cues are legal BEFORE either is posted. `cueViolations` is the same closed
   * allow-list the iframe enforces at its own door, imported in bare node — so a typo in this
   * file is a named failure here instead of a cue that lands and does nothing.
   */
  const badIntros = cueViolations(INTROS_CUE);
  const badNoms = cueViolations(NOMS_CUE);
  t('A0c · both cues pass cueViolations before they are posted',
    badIntros.length === 0 && badNoms.length === 0,
    [...badIntros, ...badNoms].join(', ') || `noms keys: ${CUE_NOM_KEYS.join(', ')}`);

  await page.evaluate((cue) => { window.postMessage({ t: 'cue', cue }, '*'); }, INTROS_CUE);

  // The circle builds on its own clock. Poll for it rather than guessing how long it takes.
  let seated = null;
  const t1 = Date.now();
  while (Date.now() - t1 < 120000) {
    seated = await page.evaluate(SNAP);
    if (seated?.robots?.length === CAST.length && seated.robots.every((r) => r.tag)) break;
    await sleep(2000);
  }
  console.log(`  circle: ${seated?.robots?.length ?? 0} robots after ${((Date.now() - t1) / 1000).toFixed(0)}s\n`);
  if (errs.length) {
    console.log('  ⚠️ errors thrown:');
    for (const e of [...new Set(errs)].slice(0, 8)) console.log(`     ${e}`);
    console.log('');
  }
  if (seated?.error) throw new Error(`no scene to measure: ${seated.error}`);

  /* ---- A1 · the precondition. Without it nothing below proves anything. ------------------- */
  const tags = (seated?.robots ?? []).filter((r) => r.tag);
  t('A1 · the circle seats eight and all eight wear a name tag',
    seated?.robots?.length === CAST.length && tags.length === CAST.length,
    `${seated?.robots?.length ?? 0} robots · ${tags.length} tags`);

  /*
   * A1a · the bodies are the Meshy clones with a real skeleton. The whole beat is baked clips
   * on that rig; on the `unit4h` fallback (a failed GLB fetch — `follow-bed.js:858` catches it
   * and the night runs anyway) there are no bones, no clips, and A2/A3 would be measuring a
   * body that cannot animate. That is a different failure and it must not wear A2's name.
   */
  const boned = (seated?.robots ?? []).filter((r) => r.boneCount > 0);
  t('A1a · the seated bodies carry a skeleton (Meshy clones, not the unit4h fallback)',
    boned.length === CAST.length,
    `${boned.length}/${seated?.robots?.length ?? 0} rigged · ${boned[0]?.boneCount ?? 0} bones each`);

  const before = seated;
  const byId = (s, id) => s?.robots?.find((r) => r.id === id) ?? null;

  /* ---- the accusation --------------------------------------------------------------------- */
  await page.evaluate((cue) => { window.postMessage({ t: 'cue', cue }, '*'); }, NOMS_CUE);

  /*
   * Two samples after the cue, and the gap between them is what A3 is about:
   *   flinch  ~2.5s  — early enough to catch a one-shot recoil while it is still playing
   *   held   ~12.5s  — a full `Chair_Sit_Idle_M` loop (10.7 s) later, so a posture that has
   *                    quietly fallen back to the seated idle has had every chance to do so
   */
  await sleep(2500);
  const flinch = await page.evaluate(SNAP);
  await sleep(4000);
  const mid = await page.evaluate(SNAP);
  await sleep(6000);
  let held = await page.evaluate(SNAP);

  /*
   * A4b needs the accused's plate ON SCREEN, and the talk camera sweeps the ring continuously,
   * so at any given instant it may not be. Wait for the sweep to bring it round rather than
   * failing a colour check for a reason that has nothing to do with colour.
   */
  const t2 = Date.now();
  while (Date.now() - t2 < 45000 && !byId(held, ACCUSED)?.tag?.onScreen) {
    await sleep(2000);
    held = await page.evaluate(SNAP);
  }

  /* ---- A1b · did the cue even arrive? ------------------------------------------------------ */
  /*
   * The old red `!` (`nomBang`) is the mechanism being REPLACED, and until it is it is the best
   * receipt in the building: it goes visible in `setNominees` on exactly the ids in
   * `standing[].target`. If it lit on the accused and nobody else, the cue crossed the channel,
   * reached `follow-bed.cue()`, reached `intro.setNominees()`, and matched the seat id — so
   * every red line below is the missing performance and not a dropped message.
   *
   * ⚠️ **WHEN THE `!` IS DELETED, THIS CHECK MUST BE REPOINTED, NOT DELETED.** Something has to
   * stay that proves the cue landed, or A2-A4 become untrustworthy the day they go green.
   */
  const banged = (held?.robots ?? []).filter((r) => r.bang).map((r) => r.id);
  t('A1b · the noms cue reached the circle — the nominee mark lit on exactly the accused',
    banged.length === 1 && banged[0] === ACCUSED,
    banged.length ? `marked: ${banged.join(', ')}` : 'nothing marked — the cue did not land');

  /* ---- the band, measured from the six who are not in the scene ---------------------------- */
  const others = CAST.map((c) => c.id).filter((id) => id !== NOMINATOR && id !== ACCUSED);
  const mFlinch = {}; const mHeld = {};
  for (const c of CAST) {
    mFlinch[c.id] = motionOf(byId(before, c.id), byId(flinch, c.id));
    mHeld[c.id] = motionOf(byId(before, c.id), byId(held, c.id));
  }
  const bandFlinch = Math.max(...others.map((id) => mFlinch[id]?.motion ?? 0));
  const bandHeld = Math.max(...others.map((id) => mHeld[id]?.motion ?? 0));
  const barFlinch = Math.max(bandFlinch * BAND_K, MOTION_FLOOR_M);
  const barHeld = Math.max(bandHeld * BAND_K, MOTION_FLOOR_M);

  console.log(`\n  clip channel: ${held?.clipChannel ?? 'NONE — no instrument can name a clip (see header)'}`);
  console.log(`  sit-loop band: ${bandFlinch.toFixed(4)} m at +2.5s · ${bandHeld.toFixed(4)} m at +12.5s`
    + ` (six uninvolved robots)`);
  console.log(`  bar to clear:  ${barFlinch.toFixed(4)} m / ${barHeld.toFixed(4)} m`
    + `  (max of band x${BAND_K} and the ${MOTION_FLOOR_M} m floor)\n`);

  const role = (id) => (id === NOMINATOR ? 'NOMINATOR' : id === ACCUSED ? 'ACCUSED' : id === BYSTANDER ? 'control' : '');
  console.log('   id   name    role         clip                  move@2.5s  move@12.5s  hips rise  tag skin');
  for (const c of CAST) {
    const r = byId(held, c.id);
    console.log(`   ${c.id}   ${String(c.name).padEnd(7)} ${role(c.id).padEnd(12)}`
      + ` ${String(r?.clip ?? '—').padEnd(21)}`
      + ` ${String((mFlinch[c.id]?.motion ?? 0).toFixed(4)).padStart(9)}`
      + ` ${String((mHeld[c.id]?.motion ?? 0).toFixed(4)).padStart(11)}`
      + ` ${String((mHeld[c.id]?.hipsRise ?? 0).toFixed(4)).padStart(10)}`
      + `  ${r?.tag?.skin || '(none)'}`);
  }
  console.log('');

  /* ---- A2 · the nominator stands up ------------------------------------------------------- */
  const nomM = mHeld[NOMINATOR];
  const nomEarly = mFlinch[NOMINATOR];
  t('A2 · the NOMINATOR left the seated pose — somebody visibly stood up',
    !!nomM && Math.max(nomM.motion, nomEarly?.motion ?? 0) > barHeld,
    nomM
      ? `moved ${Math.max(nomM.motion, nomEarly?.motion ?? 0).toFixed(4)} m vs a ${barHeld.toFixed(4)} m bar`
        + ` · hips ${nomM.hipsRise >= 0 ? '+' : ''}${(nomM.hipsRise ?? 0).toFixed(3)} m`
        + ` · worst bone ${nomM.worstBone ?? '—'}`
      : 'the nominator is not in the circle');

  /*
   * A2b · …and the show can NAME what it is playing. Separate from A2 on purpose: a red A2 with
   * a green A2b means the label lies, a green A2 with a red A2b means the animation is real and
   * no instrument can see which one it is. Those are different bugs with different owners.
   */
  const nomClip = byId(held, NOMINATOR)?.clip ?? null;
  t('A2b · …and it is a NAMED clip, not the seated idle',
    !!nomClip && nomClip !== SIT_IDLE_SHIP,
    nomClip
      ? `clip="${nomClip}" via ${byId(held, NOMINATOR)?.clipVia}`
      : `no clip readable — wire intro.sitReport() onto window.__rrrFollow.sit, or stamp `
        + `userData.clip on the rig root (see header)`);

  /* ---- A3 · the accused reacts, and HOLDS -------------------------------------------------- */
  const accEarly = mFlinch[ACCUSED];
  const accLate = mHeld[ACCUSED];
  const accMid = mid ? motionOf(byId(before, ACCUSED), byId(mid, ACCUSED)) : null;
  t('A3 · the ACCUSED reacted within 2.5s of the accusation',
    !!accEarly && accEarly.motion > barFlinch,
    accEarly ? `moved ${accEarly.motion.toFixed(4)} m vs a ${barFlinch.toFixed(4)} m bar` : 'not in the circle');

  /*
   * ⚠️ **THE HOLD IS THE HALF THAT A ONE-SHOT PASSES AND SHOULD NOT.** A flinch that plays once
   * and drops straight back into `Chair_Sit_Idle_M` satisfies A3 and is not what was designed:
   * the accused holds the posture. 12.5 s is a full sit-idle loop past the cue, so a posture that
   * has fallen back has had every opportunity to be caught doing it.
   */
  t('A3b · …and is STILL out of the seated pose ten seconds later — the posture is HELD',
    !!accLate && accLate.motion > barHeld,
    accLate
      ? `${(accEarly?.motion ?? 0).toFixed(4)} m at +2.5s → ${(accMid?.motion ?? 0).toFixed(4)} m at +6.5s`
        + ` → ${accLate.motion.toFixed(4)} m at +12.5s, bar ${barHeld.toFixed(4)} m`
      : 'not in the circle');

  const accClipEarly = byId(flinch, ACCUSED)?.clip ?? null;
  const accClipLate = byId(held, ACCUSED)?.clip ?? null;
  t('A3c · …under a named clip that is the same one at both samples',
    !!accClipLate && accClipLate !== SIT_IDLE_SHIP && accClipEarly === accClipLate,
    accClipLate
      ? `+2.5s "${accClipEarly}" → +12.5s "${accClipLate}"`
      : 'no clip readable — see A2b');

  /* ---- A4 · the accused's tag is a different colour ---------------------------------------- */
  const accTag = byId(held, ACCUSED)?.tag ?? null;
  const otherTags = (held?.robots ?? []).filter((r) => r.id !== ACCUSED && r.tag);
  const skins = new Set(otherTags.map((r) => r.tag.skin || ''));
  t('A4 · the accused\'s plate carries a skin none of the other seven carry',
    !!accTag && !!accTag.skin && !skins.has(accTag.skin),
    accTag
      ? `accused skin "${accTag.skin || '(none)'}" · the other seven: ${[...skins].map((s) => s || '(none)').join(', ')}`
      : 'the accused has no name tag');

  /*
   * A4b · …and it reaches the television. Compared INSIDE ONE FRAME against the seven others —
   * see the header; a baseline captured seconds earlier drifts with the sweeping camera and
   * makes tags "change" that did not. The seven others' own spread is the live band.
   */
  const shownOthers = otherTags.filter((r) => r.tag.onScreen && r.tag.rgb);
  const ref = meanRgb(shownOthers);
  const spread = ref ? Math.max(0, ...shownOthers.map((r) => dist3(r.tag.rgb, ref))) : 0;
  const gap = (accTag?.rgb && ref) ? dist3(accTag.rgb, ref) : null;
  t('A4b · …and that colour reaches the television, next to seven that are not',
    gap != null && gap > Math.max(PLATE_GAP, spread * 2),
    gap != null
      ? `accused rgb ${accTag.rgb.map((c) => c.toFixed(0)).join(',')} vs room mean `
        + `${ref.map((c) => c.toFixed(0)).join(',')} — gap ${gap.toFixed(1)}, `
        + `bar ${Math.max(PLATE_GAP, spread * 2).toFixed(1)} (room spread ${spread.toFixed(1)}, `
        + `${shownOthers.length} plates in frame)`
      : (accTag?.onScreen === false
        ? 'the accused\'s plate never came round into shot — the sweep, not the colour'
        : 'no plate pixels'));

  /* ---- A5 · the control -------------------------------------------------------------------- */
  /*
   * ⚠️ **THIS IS THE ONE THAT IS SUPPOSED TO BE GREEN TODAY.** Without it, a beat that stood all
   * eight robots up would sail through A2 and A3, and "everybody reacted" is not a staged
   * accusation. It is also the calibration: `STILL_M` is what a robot doing nothing measures.
   */
  const byM = mHeld[BYSTANDER];
  const byClip = byId(held, BYSTANDER)?.clip ?? null;
  t('A5 control · a robot who is neither nominator nor accused never left the seated idle',
    !!byM && byM.motion < STILL_M && (byClip == null || byClip === SIT_IDLE_SHIP),
    byM
      ? `${BYSTANDER} moved ${byM.motion.toFixed(4)} m (ceiling ${STILL_M}) · clip ${byClip ?? 'unreadable'}`
      : 'the control is not in the circle');

  await writeFile(path.join(SHOTDIR, 'accusation.json'), JSON.stringify({
    cast: CAST, nominator: NOMINATOR, accused: ACCUSED, bystander: BYSTANDER,
    clipChannel: held?.clipChannel ?? null,
    band: { flinch: bandFlinch, held: bandHeld, barFlinch, barHeld },
    motion: { flinch: mFlinch, held: mHeld },
    tags: (held?.robots ?? []).map((r) => ({ id: r.id, ...r.tag })),
    errs: [...new Set(errs)],
  }, null, 2));

  console.log('\n  accusation.json in progress/accusation/');
  console.log(`\n  ${pass} ok · ${fail} fail\n`);
  exitCode = fail ? 1 : 0;
} catch (e) {
  console.error(`\n  accusation-beat died: ${e?.stack || e}\n`);
} finally {
  if (!KEEP) {
    await browser.close().catch(() => {});
    for (const k of kids) k.kill();
  }
  process.exit(exitCode);
}

/* ==============================================================================================
 * 📋 RUN_LOG — 2026-08-28, on `claude/casting-screen-layout-crgctg`, before the beat existed.
 *
 * (filled in from the first honest run — see the report in the PR body)
 * ============================================================================================ */
