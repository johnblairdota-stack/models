#!/usr/bin/env node
/**
 * accusation-beat — does the Reckoning's accusation reach the TELEVISION, on real bodies?
 *
 *   node harness/accusation-beat.mjs            # writes progress/accusation/
 *   node harness/accusation-beat.mjs --keep     # leave vite up
 *
 * ⚠️ **WRITTEN BEFORE THE BEAT EXISTED AND DESIGNED TO FAIL WITHOUT IT.** A gate that cannot fail
 * before the fix proves nothing about the fix. Every threshold here was chosen against runs of a
 * build where the performance was absent or half-built, and the numbers are in the run log at the
 * foot of the file. If you are reading this because it went red, the printed table is the whole
 * diagnosis — nothing in this file reports an adjective.
 *
 * WHY THIS FILE EXISTS. The Reckoning used to announce a nomination by making one sprite visible:
 * `nomBang`, a red `!` over the name tag. Eight seated bodies kept breathing through the biggest
 * beat of the night while one of them acquired a punctuation mark. The replacement is a staged
 * performance — the NOMINATOR stands up out of their chair, the ACCUSED flinches and then HOLDS a
 * posture, three other chairs gasp, and the accused's plate turns the accusation ink.
 *
 * ---------------------------------------------------------------------------------------------
 * 🧩 WHERE THIS SITS AMONG ITS SIBLINGS — three gates, three different lies to catch
 * ---------------------------------------------------------------------------------------------
 *   `seated-actions.mjs`    the CLIPS: reads `friendly_all38.glb`'s chunks in bare node and proves
 *                           the eleven seated performances exist, where their hips open, and which
 *                           three leave the chair. Cannot see a night.
 *   `accusation-stage.mjs`  the MACHINE: pure node, drives `createAccusationStage` with a recording
 *                           circle and proves it fires once per nomination, restores without being
 *                           told, and leaks no role. Cannot see a robot.
 *   **this file**           the PICTURE: boots the real view, seats a real circle, accuses a real
 *                           chair, and reads BONES AND PIXELS out of the live scene. The only one
 *                           of the three that can tell you nothing happened on screen — and the
 *                           only one that could have caught AB2d below.
 *
 * All three can be green while the beat is invisible: a clip that exists, a machine that schedules
 * it, and an avatar that never plays it is exactly that shape.
 *
 * ⚠️ CHECKS ARE PREFIXED `AB` because `accusation-stage.mjs` already uses bare `A1`–`A6` and both
 * run in the same chain. AB1–AB5 are the five things this file was asked to prove; AB6 arrived
 * from a photographed finding (see its own block).
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ IT DRIVES THE FOLLOW VIEW DIRECTLY — inherited, not invented here.
 * ---------------------------------------------------------------------------------------------
 * `nametag-legibility.mjs` documents the four failed attempts at length: booting a room server,
 * phones and a whole night to reach a talk beat is a race against a mansion bake whose time swings
 * by minutes under swiftshader, `#go` is disabled while it bakes, `.click()` on a disabled button
 * is a silent no-op, and a cue that lands early is dropped and never retried. None of that is what
 * is being measured and all of it can fake the result. `circle-staging.mjs` reached the same
 * conclusion independently. So: one page, `?view=party.follow&warm=1`, one `intros` cue to seat
 * eight, one `noms` cue to accuse one of them. No server, no phones, no beats, no night.
 *
 * Both cues go through `cueViolations` in bare node HERE before they are posted (AB0c) and through
 * the same function again at the iframe's door, so a cue this file gets wrong is a named failure
 * rather than a message that lands and does nothing.
 *
 * No screenshots. A sibling bench died on a 30s `page.screenshot` timeout under swiftshader;
 * everything below is geometry and pixels read out of the live scene inside one evaluate.
 *
 * ---------------------------------------------------------------------------------------------
 * ⏱️ **SAMPLE ON THE SIM CLOCK, NEVER ON A `sleep()`. THIS FILE'S FIRST RUN GOT IT WRONG.**
 * ---------------------------------------------------------------------------------------------
 * `core/engine.js:337` clamps the frame step: `dt = Math.min(dt, 0.1)`. Under swiftshader the
 * ballroom renders at well under one frame a second, so **show time advances at a small fraction
 * of wall-clock time** — measured across three runs of this file, between 0.03x and 0.06x. Twelve
 * seconds of `sleep()` buys under a second of animation. `ACCUSE.SETTLE` is at 2.00 s, so the
 * first run of this file slept twelve seconds, called it "ten seconds later", and was sampling the
 * beat before its second act had started; it reported the accused "reacting on a ramp" that was
 * really the flinch still crossfading in.
 *
 * Every sample below waits on `engine.elapsed` reaching an offset from the cue, and AB0d fails
 * loudly if the wall-clock cap ran out first — a sample taken at the wrong moment on the show's
 * clock must never be quietly reported as if it were on time. The sim/wall ratio is printed on
 * every run, because the day it reaches 1.0 is the day somebody gave this a real GPU.
 *
 * **Any browser probe in this repo that reasons about a beat's timing on `sleep()` is measuring
 * the frame rate, not the beat.**
 *
 * ---------------------------------------------------------------------------------------------
 * 🦴 TWO BONE CHANNELS, BECAUSE ONE OF THEM IS ALL NOISE — AND THE DATA THAT SETTLED IT
 * ---------------------------------------------------------------------------------------------
 * Eight seated robots are not still. They all loop `Chair_Sit_Idle_M` (10.7 s) at a per-seat phase
 * offset (`chair-seats.js` `sitPhase` = `seatIndex * 1.37`). Measured, per bone, against each
 * robot's own pre-cue baseline, on robots in no part of the staging:
 *
 *   RightHand   0.187 → 0.437 → 0.013 m   across the three samples, on ONE idle robot
 *   RightToe    0.126 → 0.258 → 0.028 m
 *   Spine       0.002 → 0.015 → 0.004 m
 *   Hips        0.002 → 0.015 → 0.004 m
 *
 * **A max-over-all-bones metric is therefore useless here and the first two runs of this file
 * proved it twice**: the idle band came out at 0.44 m, the bar at 1.31 m, and a real 0.75 m flinch
 * failed against it. The hands and feet swing through half a metre for free.
 *
 * The spine does not, and it does not BY CONSTRUCTION: `mesh-avatar.js` freezes `SIT_LEAN_BONES`
 * (Hips, Spine, Spine01, Spine02) at `SIT_UPRIGHT_T` and re-applies them after the mixer for the
 * whole seated idle — John's "periodic lean forward that reads as odd" fix. Anything hanging
 * rigidly off that chain (the shoulders, the neck, the upper legs) inherits the stillness. So:
 *
 *   `spine`  max displacement over the frozen chain — idle 0.002–0.015 m, and a performance
 *            cannot start without breaking the freeze. **This is the discriminating channel.**
 *   `limb`   max over everything else — idle up to 0.44 m and phase-dependent, so its bar is
 *            recomputed live at every sample and it is only ever allowed to CONFIRM.
 *
 * ⚠️ `Head`, `head_end` and `headfront` are NOT on the spine channel even though they sit on top
 * of it. The head carries its own animated track through the idle (0.036 m) and putting it in
 * inflated the quiet band by 9x, which is how the second run of this file mislaid a real hold.
 *
 * ⚠️ Bone offsets are taken RELATIVE TO EACH ROBOT'S OWN ROOT, so a body that travels does not read
 * as a body that moved its limbs; the root's own displacement is measured separately.
 *
 * ---------------------------------------------------------------------------------------------
 * 🎨 THE PLATE IS COMPARED INSIDE ONE FRAME, ON THE AXIS THE TWO INKS ACTUALLY DIFFER ON
 * ---------------------------------------------------------------------------------------------
 * Inherited from `nametag-legibility.mjs` N6, which cost two false failures to learn: the talk
 * camera walks the ring continuously, so a plate's measured colour drifts with angle and distance,
 * and a baseline captured seconds earlier made FOUR tags "change" when two had. So AB4b measures
 * the accused against the other seven **in the same readPixels**.
 *
 * That file also records the other half of the lesson: do not compare `p05`, which is the BLACK
 * GLYPH OUTLINE and black on every skin there has ever been. Mean RGB is what moves.
 *
 * ⚠️ **AND DO NOT COMPARE MEAN RGB AS A DISTANCE, WHICH IS WHAT THIS FILE TRIED FIRST.** Measured
 * over eight plates at 4.6–13.8 m in one frame, the unaccused plates were spread 24–27 units apart
 * from each other in RGB — almost entirely in BRIGHTNESS, because the far ones are hazed. The
 * accused's gap over the room mean was 53–68. A bar built from that spread left about 10% of
 * headroom and passed by luck on one of two runs.
 *
 * The fix is to measure on the axis the inks differ on. `NOM_INK` (#7A0B12) minus `INK` (#054E84)
 * IS that axis; both are imported rather than restated, so a reskin moves the instrument with the
 * product. Ranking is the assertion, not distance: haze moves every plate along the brightness
 * axis together and moves none of them past the one wearing the other ink. The margin is taken
 * against the MEDIAN of the field rather than the next plate — see the block at AB4b for the run
 * where one near-white seat tab made that difference 13 instead of 34.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚦 AB5 IS THE CONTROL, AND IT IS SUPPOSED TO BE GREEN EVEN ON A BROKEN BUILD
 * ---------------------------------------------------------------------------------------------
 * A beat that stood ALL EIGHT robots up would satisfy AB2 and AB3 perfectly, and "everybody
 * reacted" is not a staged accusation. AB5 holds a robot who is in no part of the staging to the
 * seated idle. A run where AB5 goes red while AB2/AB3 go green has proved nothing at all.
 *
 * ⚠️ **THE CONTROL HAS TO DODGE `reactorSeats()`, AND THE FIRST RUN PROVES WHY.** The circle
 * deliberately gives THREE other chairs a staggered gasp, so five of the eight are in the scene; a
 * control picked by eye lands on one of them and fails for being right. Worse, before this file
 * knew that, the "uninvolved" band it measured had a gasping reactor inside it — a noise floor
 * made of signal, which is the quietest way an instrument like this goes wrong. `intro-bed.js`
 * derives the reactors from PUBLIC seat indices (its own header explains why that is a leak
 * surface, not a style choice); this file recomputes them and excludes all five involved chairs
 * from both the band and the control.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { cueViolations, CUE_NOM_KEYS } from '../src/party/follow.js';
import { SIT_IDLE_SHIP, SEATED_REACTION_CLIPS } from '../src/game/chair-seats.js';
import {
  INK, NOM_INK, TAG_REF_DIST, TAG_NEAR_K, TAG_FAR_K, BANG_SIZE,
} from '../src/characters/chest-nameplate.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const KEEP = argv.includes('--keep');
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };

/** 5193 — 5194 is `circle-staging`, 5197 `nametag-legibility`, 5192 the plain serve. */
const WEB = +arg('--port', 5193);
const SEED = +arg('--seed', 3);
const WAIT = +arg('--wait', 240000);
const SHOTDIR = path.join(ROOT, 'progress', 'accusation');

/*
 * ---- SAMPLE POINTS, IN SIM SECONDS AFTER THE `noms` CUE ---------------------------------------
 * Against `intro-bed.js` `ACCUSE`: STAND 0.00, FLINCH 0.40, GASP 0.80 (+0.22 stagger),
 * SETTLE 2.00, FADE 0.25.
 */
/** Past FLINCH and its crossfade, before SETTLE — the recoil, while it is still the recoil. */
const AT_FLINCH = 1.2;
/** Past SETTLE and its crossfade — the held posture, newly arrived. */
const AT_SETTLE = 3.0;
/**
 * A full `Chair_Sit_Idle_M` loop (10.7 s) past `ACCUSE.SETTLE`. A one-shot that quietly crossfaded
 * home has had every opportunity to be caught doing it by now, which is the whole of AB3b.
 */
const AT_HELD = 12.0;
/**
 * Wall-clock ceiling on reaching a sample, counted from the cue and shared by all three. At the
 * 0.027–0.06x sim/wall ratios measured here, twelve seconds of show costs 200–450 s, so this is
 * roughly 35% headroom on the worst run seen. A 420 s cap ran out twice at +11.7 and +9.5 s.
 * AB0d reports honestly rather than letting an early sample masquerade as an on-time one.
 */
const SIM_CAP_MS = 600000;

/**
 * ---- THRESHOLDS, ALL DERIVED FROM MEASUREMENT — see the run log --------------------------------
 * How much louder than the frozen seated spine a performance has to be. The idle spine measured
 * 0.002–0.015 m over three samples and three uninvolved robots; performers broke it at 0.05–0.41.
 */
const BAND_K = 3;
/** The floor under `band × BAND_K`, at ~3.3x the loudest idle spine ever measured here. */
const SPINE_FLOOR_M = 0.05;
/** The control's ceiling on the spine channel. Idle max measured 0.015; performers reach 0.05+. */
const STILL_SPINE_M = 0.04;
/**
 * The stand, on the pelvis. `chair-seats.js` `SEATED_CLIPS_LEAVE_CHAIR` measures
 * `Sit_to_Stand_Transition_M` off the GLB at hips 0.531 → 0.782 — **+0.251 m**. The bar is well
 * under half of that so the crossfade, the `reactAnchor` correction and a sample taken mid-rise
 * all have room, and still an order of magnitude above the ±0.015 m a seated pelvis measures.
 */
const STAND_RISE_M = 0.10;
/**
 * …and the ceiling on how far that pelvis may travel. The same GLB measurement gives the stand
 * 0.44 m of end-to-end travel, ending 0.35 m inward of the seated hips, and `body.sitLock` pins
 * the ROOT, so 1.0 m is already twice the room the clip needs. See AB2d.
 */
const STAND_TRAVEL_MAX_M = 1.0;
/**
 * The accusation ink must out-rank the MEDIAN unaccused plate in the same frame by this much,
 * projected onto the `NOM_INK - INK` axis, and rank first outright. Measured 34 and 64 on two
 * runs in which the accused was the furthest and haziest plate of the eight, with the seven
 * others spread 24–38 among themselves along the same axis. See the block at AB4b.
 */
const INK_RANK_MARGIN = 15;

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
 * Eight, because eight is the table the Reckoning is designed around and the cap `intro-bed` slices
 * to. Names are distinct on purpose: duplicates are a locked product rule and this file maps a
 * scene object back to a cast member by the ROOT'S NAME (`player.intro-<id>`, `player.js:198`),
 * never by the label — but the printed rows are read by a human and two `SAM`s help nobody.
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
 * One accusation. `CUE_NOM_KEYS = ['nominator', 'target']` (`party/follow.js:521`) — the same pair
 * `FANOUT_KEYS.nomRow` already fans to every socket, so nothing new crosses any wire to make this
 * picture possible.
 *
 * ⚠️ **THE NOMINATOR AND THE ACCUSED SIT ON OPPOSITE SIDES OF THE RING** (seats 1 and 5).
 * Neighbouring chairs would let a camera that happens to frame one frame both, and a bug that
 * animated "whoever is nearest the lens" would pass. They are also the two the sweeping talk camera
 * cannot hold in one shot, which is exactly why AB2/AB3 read bones — no camera needed — and only
 * AB4b and AB6 wait for anybody to be on screen.
 */
const NOMINATOR = 'p2';
const ACCUSED = 'p6';

/**
 * `reactorSeats()` from `intro-bed.js`, RESTATED rather than imported. **Deliberate.** Importing it
 * would make this gate agree with the bed by construction: change the stride and the control would
 * silently move to whatever the new answer was and keep passing. Restating it means a change to who
 * gasps trips AB5 here and has to be looked at by a human. The rule is public by design (the bed's
 * header: picks derive from SEAT INDICES so watching who reacts cannot leak a role), and this copy
 * was verified against the real one over all 56 (accused, nominator) pairs at N=8.
 */
function reactorSeatsHere(seatCount, accusedSeat, nominatorSeat) {
  const n = Math.max(0, seatCount | 0);
  if (!n) return [];
  const skip = new Set([accusedSeat | 0, nominatorSeat | 0]);
  const want = Math.min(3, Math.max(0, n - skip.size));
  const out = [];
  const start = (accusedSeat | 0) + (nominatorSeat | 0) + 3;
  for (let i = 0; i < n && out.length < want; i++) {
    const s = (((start + i * 3) % n) + n) % n;
    if (skip.has(s) || out.includes(s)) continue;
    out.push(s);
  }
  for (let s = 0; s < n && out.length < want; s++) {
    if (skip.has(s) || out.includes(s)) continue;
    out.push(s);
  }
  return out;
}

const seatOf = (id) => CAST.find((c) => c.id === id).seat;
const REACTORS = new Set(reactorSeatsHere(CAST.length, seatOf(ACCUSED), seatOf(NOMINATOR)));
/** Chairs in no part of the staging — the live noise floor and the control. */
const IDLE_IDS = CAST
  .filter((c) => c.id !== NOMINATOR && c.id !== ACCUSED && !REACTORS.has(c.seat))
  .map((c) => c.id);
const BYSTANDER = IDLE_IDS[0] ?? 'p1';

const INTROS_CUE = { kind: 'intros', cast: CAST, talk: true };
const NOMS_CUE = { kind: 'noms', standing: [{ nominator: NOMINATOR, target: ACCUSED }] };
/**
 * AB6's cue: every chair a nominee at once. A ratio over ONE lit `!` is 1.0 and always green, so
 * the sweep must not be able to leave this measurement with a single element — and with all eight
 * lit the near/far spread is captured whole, in one frame, wherever the camera happens to be.
 */
const ALL_NOMS_CUE = {
  kind: 'noms',
  standing: CAST.map((c, i) => ({ nominator: CAST[(i + 1) % CAST.length].id, target: c.id })),
};

/** Undo, so the bed is left as it was found and a rerun in `--keep` is comparable. */
const CLEAR_NOMS_CUE = { kind: 'noms', standing: [] };

/** sRGB hex -> [r,g,b] 0-255, for the ink axis. */
const hexRgb = (h) => {
  const s = String(h).replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
};
/**
 * The unit vector from the show plate's ink toward the accusation ink. Every plate's measured mean
 * RGB is projected onto it, so "more accused-looking than any other plate in this frame" is one
 * number and a reskin of either constant moves the instrument with the product.
 */
const INK_AXIS = (() => {
  const a = hexRgb(INK); const b = hexRgb(NOM_INK);
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...d) || 1;
  return d.map((x) => x / len);
})();
const inkProj = (rgb) => (rgb ? rgb[0] * INK_AXIS[0] + rgb[1] * INK_AXIS[1] + rgb[2] * INK_AXIS[2] : null);

/* ==============================================================================================
 * WHAT IS MEASURED, per robot, in ONE evaluate:
 *
 *   root      world position of `player.intro-<id>` — where the body IS
 *   bones     every bone under that root, world position MINUS the root's, so the numbers describe
 *             the POSE and not the placement. Keyed by name so two snapshots can be differenced
 *             bone by bone regardless of traverse order.
 *   action    the seated PERFORMANCE name, via the chain below (NOT `clip`, which is the resting
 *             pose and stays `Chair_Sit_Idle_M` throughout by design)
 *   tag       the `headName` sprite: label, skin, screen rect, mean RGB from the GL buffer
 *   bang      the `nomBang` sprite: lit or not, and its projected height in CSS pixels (AB6)
 *   sim       `engine.elapsed`, so every sample can be placed on the SHOW's clock
 *
 * `redraw()` and `readPixels()` sit in the same task with no await between them: the drawing buffer
 * is only guaranteed intact inside the same task as the render. The redraw also matters for the
 * SPRITES — both plate and bang set their own `scale` from `tagDistK` inside `onBeforeRender`, so
 * a scale read without a render in front of it is one frame stale and, on the first sample, wrong.
 *
 * ---- HOW A PERFORMANCE IS NAMED, AND THE ONE LINE STILL MISSING ----
 * `mesh-avatar.js` deliberately keeps two questions apart, and says why: `get clip()` stays
 * `Chair_Sit_Idle_M` for the whole performance (it answers *what is this seat's resting pose*,
 * which `assertSeatedPose` needs stable) while `get seatedAction()` is the performance on top of
 * it. **A probe that asserts on `clip` will never see the accusation.** The name is looked for in
 * this order:
 *
 *   1. `window.__rrrFollow.accusation()` — `intro-bed.js` `accusationReport()`, which already
 *      returns `{ keys, pending, performing, skinned }`. **It exists and is NOT REACHABLE FROM A
 *      BROWSER.** `follow-bed.js` forwards `streamReport` and `camReport` onto the bed's public
 *      face and `party-follow.js` republishes them on `window.__rrrFollow`; `accusationReport` and
 *      `sitReport` are on neither. Two one-line forwards, in the files those two already live in.
 *   2. `window.__rrrFollow.sit()` — `sitReport()`, same two forwards. Note its rows carry `clip`
 *      and NOT `seatedAction`, so if that is the route somebody wires, the row needs the action on
 *      it too or this gate still cannot name the pose.
 *   3. `userData.seatedAction` / `userData.clip` stamped on anything under the robot's root.
 *   4. nothing — and then AB2c/AB3c fail saying exactly that.
 *
 * ⚠️ **A NAME IS NOT EVIDENCE, WHICH IS WHY EVERY NAMED CHECK IS PAIRED WITH A MEASURED ONE.**
 * Whichever route gets wired it is a string, and a string can be stamped by code that animates
 * nothing. AB2/AB2b/AB3/AB3b read BONES, which no label can fake; AB2c/AB3c read the label. When
 * one half fails, its message says which half — so "the animation is missing" and "the animation
 * plays and no instrument can name it" can never again be mistaken for each other.
 * ============================================================================================ */
const SNAP = () => {
  const eng = window.__rrr?.engine;
  if (!eng) return { error: 'no engine', hasRrr: !!window.__rrr };
  const cam = eng.camera;
  const scene = eng.scene;

  /*
   * ⚠️ **THERE IS NO `THREE` ON THE PAGE HANDLE.** `core/engine.js:208` publishes engine / settle /
   * ready / frames / perf / setGrade / freeRun / simState / silhouette / redraw and nothing else.
   * Importing the module here would put a SECOND copy of THREE in the page, which is its own class
   * of bug. `circle-staging.mjs` solved this and the solution is inherited: take a real `Vector3`
   * off an object that already has one — every Object3D's `.position` is one, with every method
   * needed — and clone it.
   */
  const V = () => cam.position.clone();

  /** Routes 1 and 2 of the chain above; both are per-room and read once. */
  const named = (() => {
    const out = { rows: null, performing: null, via: null };
    try {
      const acc = window.__rrrFollow?.accusation?.() ?? window.__rrr?.accusationReport?.();
      if (acc && Array.isArray(acc.performing)) {
        out.performing = acc.performing.map(String);
        out.via = 'accusationReport';
      }
    } catch { /* not wired — that is what AB2c says */ }
    try {
      const rep = window.__rrrFollow?.sit?.() ?? window.__rrr?.sitReport?.();
      if (Array.isArray(rep)) {
        const m = {};
        for (const r of rep) {
          if (!r || r.id == null) continue;
          m[String(r.id)] = r.seatedAction ?? r.action ?? null;
        }
        out.rows = m;
        if (out.via == null) out.via = 'sitReport';
      }
    } catch { /* ditto */ }
    return out;
  })();

  const roots = [];
  scene.traverse((o) => {
    if (typeof o.name === 'string' && o.name.startsWith('player.intro-')) roots.push(o);
  });

  cam.updateMatrixWorld(true);
  const canvas = eng.renderer.domElement;
  const CW = canvas.width; const CH = canvas.height;              // drawing buffer, for readPixels
  const SW = canvas.clientWidth || CW; const SH = canvas.clientHeight || CH;   // CSS, for AB6

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
  /*
   * ⚠️ **A SPRITE IS NOT SIZED ALONG WORLD +Y AND NOT SIZED BY EUCLIDEAN DISTANCE, AND MEASURING
   * IT AS IF IT WERE PUT 22% OF FAKE SPREAD INTO AB6's FIRST RUN.** Under `sizeAttenuation` three
   * .js offsets the quad's corners in VIEW space, so its height runs along the CAMERA's up axis
   * and its apparent size falls off with view-space DEPTH. Offsetting along world +Y (which
   * `nametag-legibility` does, harmlessly, because it only needs a sampling rectangle) tilts the
   * measurement by the camera's pitch, and using `distanceTo` as the denominator overstates the
   * near sprites' falloff, because for an off-axis sprite the depth is shorter than the distance.
   * Both errors grow toward the frame edge, which is exactly where the near chairs are.
   *
   * So: the height is measured along the camera's own up column (`circle-staging.mjs` does the
   * same for the tag rectangles) and the depth is kept alongside the distance — `tagDistK` reads
   * DISTANCE, the projection divides by DEPTH, and AB6's prediction needs both to be right.
   */
  const camUp = V().setFromMatrixColumn(cam.matrixWorld, 1).normalize();
  const camFwd = V().setFromMatrixColumn(cam.matrixWorld, 2).normalize().multiplyScalar(-1);

  /**
   * A sprite's on-screen box. Both of these sprites use `center = (0.5, 0)`, so the quad runs UP
   * from the anchor by its own world `scale.y` — which `onBeforeRender` has just written from
   * `tagDistK`. Projecting the anchor and the top gives the height a viewer actually sees, in
   * whichever pixel space the two dimensions passed in are.
   */
  function spriteBox(o, W, H) {
    o.updateWorldMatrix(true, false);
    o.getWorldPosition(v);
    const top = v.clone().addScaledVector(camUp, o.scale.y);
    const a = v.clone().project(cam);
    const b = top.clone().project(cam);
    const px = (p) => [(p.x * 0.5 + 0.5) * W, (-p.y * 0.5 + 0.5) * H];
    const [ax, ay] = px(a);
    const [, by] = px(b);
    const hPx = Math.abs(ay - by);
    const wPx = hPx * (o.scale.x / Math.max(1e-6, o.scale.y));
    return {
      ax, ay, by, hPx, wPx,
      /** What `tagDistK` reads. */
      dist: cam.position.distanceTo(v),
      /** What the projection divides by. */
      depth: v.clone().sub(cam.position).dot(camFwd),
      onScreen: a.z > -1 && a.z < 1 && ax >= 0 && ax <= W && ay >= 0 && ay <= H && hPx >= 4,
    };
  }

  const out = [];
  for (const r of roots) {
    r.updateWorldMatrix(true, true);
    r.getWorldPosition(rootV);
    const id = r.name.slice('player.intro-'.length);

    const bones = {};
    let boneCount = 0;
    let stamp = null;
    r.traverse((o) => {
      if (o.userData && stamp == null) {
        const c = o.userData.seatedAction ?? o.userData.clip ?? o.userData.avatarClip;
        if (typeof c === 'string' && c) stamp = c;
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

    let tag = null; let bang = null;
    r.traverse((o) => {
      if (o.name === 'nomBang') {
        // Measured in CSS pixels — AB6 is about what a viewer sees, not about the buffer size.
        const b = o.visible ? spriteBox(o, SW, SH) : null;
        bang = {
          lit: !!o.visible,
          onScreen: b ? b.onScreen : false,
          dist: b ? +b.dist.toFixed(2) : null,
          depth: b ? +b.depth.toFixed(2) : null,
          hPx: b ? +b.hPx.toFixed(1) : null,
          scaleY: +o.scale.y.toFixed(4),
        };
        return;
      }
      if (o.name !== 'headName') return;
      const b = spriteBox(o, CW, CH);   // drawing-buffer space, because it samples pixels
      const ins = 0.15;
      const rgb = b.onScreen
        ? sampleRect(b.ax - b.wPx * (0.5 - ins), b.by + b.hPx * ins,
          b.ax + b.wPx * (0.5 - ins), b.ay - b.hPx * ins)
        : null;
      tag = {
        label: o.userData?.tagLabel ?? null,
        /** '' until `setNameTagLabel` paints a skin. The exact, camera-free colour record. */
        skin: o.userData?.tagSkin ?? '',
        onScreen: b.onScreen,
        dist: +b.dist.toFixed(2),
        tagPx: [Math.round(b.wPx), Math.round(b.hPx)],
        rgb: rgb ? rgb.map((c) => +c.toFixed(1)) : null,
      };
    });

    const fromRows = named.rows ? named.rows[id] ?? null : null;
    out.push({
      id,
      root: [+rootV.x.toFixed(4), +rootV.y.toFixed(4), +rootV.z.toFixed(4)],
      boneCount,
      bones,
      hips: bones.Hips ?? null,
      /** The PERFORMANCE, not the resting pose. See the block above on `seatedAction` vs `clip`. */
      action: fromRows ?? stamp ?? null,
      actionVia: fromRows != null ? 'sitReport' : (stamp != null ? 'userData' : null),
      /** Route 1 can only say WHETHER a chair is performing, not what it plays. Both help. */
      performing: named.performing ? named.performing.includes(id) : null,
      tag,
      bang,
    });
  }

  return {
    sim: +(eng.elapsed ?? 0).toFixed(3),
    frame: eng.frame,
    buffer: [CW, CH],
    css: [SW, SH],
    cam: [+cam.position.x.toFixed(2), +cam.position.y.toFixed(2), +cam.position.z.toFixed(2)],
    nameChannel: named.via,
    robots: out,
  };
};

/** `engine.elapsed` only — a cheap poll, so waiting on the sim clock costs no readPixels. */
const SIMCLOCK = () => (window.__rrr?.engine?.elapsed ?? null);

/**
 * The quiet channel: the bones `mesh-avatar.js` freezes through the seated idle, plus the ones
 * hanging rigidly off them. Idle 0.002–0.015 m; a performance cannot begin without breaking it.
 * `Head`/`head_end`/`headfront` are deliberately absent — see the header.
 */
const SPINE = ['Hips', 'Spine', 'Spine01', 'Spine02', 'Spine03',
  'LeftUpLeg', 'RightUpLeg', 'LeftShoulder', 'RightShoulder', 'neck', 'Neck'];

/** Per-bone displacement between two snapshots of one robot, split into the two channels. */
function motionOf(a, b) {
  if (!a || !b) return null;
  let spine = 0; let limb = 0; let worstSpine = null; let worstLimb = null;
  for (const [name, pa] of Object.entries(a.bones)) {
    const pb = b.bones[name];
    if (!pb) continue;
    const d = Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]);
    if (SPINE.includes(name)) { if (d > spine) { spine = d; worstSpine = name; } }
    else if (d > limb) { limb = d; worstLimb = name; }
  }
  const rootMove = Math.hypot(b.root[0] - a.root[0], b.root[1] - a.root[1], b.root[2] - a.root[2]);
  const hipsMove = (a.hips && b.hips)
    ? Math.hypot(b.hips[0] - a.hips[0], b.hips[1] - a.hips[1], b.hips[2] - a.hips[2]) : null;
  return {
    spine: +spine.toFixed(4),
    limb: +limb.toFixed(4),
    worstSpine,
    worstLimb,
    root: +rootMove.toFixed(4),
    /** Pelvis travel, all three axes — the ceiling AB2d enforces. */
    hipsMove: hipsMove == null ? null : +hipsMove.toFixed(4),
    /** …and its vertical component alone, which is the one that says "stood up". */
    hipsRise: (a.hips && b.hips) ? +(b.hips[1] - a.hips[1]).toFixed(4) : null,
  };
}

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
   * `warm=1` bakes the mansion and parks the camera in the ballroom with no runner and no name — a
   * warm slot carrying either is a `warmViolations` failure. The cast arrives by cue.
   */
  const url = `${base}/?view=party.follow&warm=1&seed=${SEED}`;
  console.log(`  loading ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // The bake is the slow part (50–140 s under swiftshader, and it swings). Wait on the engine's own
  // ready flag, never a stopwatch.
  const tw = Date.now();
  let ready = false;
  while (Date.now() - tw < WAIT) {
    ready = await page.evaluate(() => !!window.__rrr?.ready).catch(() => false);
    if (ready) break;
    await sleep(2000);
  }
  console.log(`  mansion ${ready ? 'warm' : 'NOT warm'} after ${((Date.now() - tw) / 1000).toFixed(0)}s`);
  t('AB0 · the ballroom warmed', ready);

  /*
   * AB0c · every cue is legal BEFORE any of them is posted. `cueViolations` is the same closed
   * allow-list the iframe enforces at its own door, imported here in bare node — so a typo in this
   * file is a named failure at this line instead of a cue that lands and does nothing.
   */
  const badCues = [INTROS_CUE, NOMS_CUE, ALL_NOMS_CUE, CLEAR_NOMS_CUE].flatMap(cueViolations);
  t('AB0c · every cue this file posts passes cueViolations first',
    badCues.length === 0,
    badCues.join(', ')
      || `noms keys: ${CUE_NOM_KEYS.join(', ')} · ${NOMINATOR} accuses ${ACCUSED};`
        + ` reactors seat ${[...REACTORS].join(',')}; control ${BYSTANDER}`);

  await page.evaluate((cue) => { window.postMessage({ t: 'cue', cue }, '*'); }, INTROS_CUE);

  // The circle builds on its own clock. Poll for it rather than guessing how long it takes.
  let seated = null;
  const tc = Date.now();
  while (Date.now() - tc < 120000) {
    seated = await page.evaluate(SNAP);
    if (seated?.robots?.length === CAST.length && seated.robots.every((r) => r.tag)) break;
    await sleep(2000);
  }
  console.log(`  circle: ${seated?.robots?.length ?? 0} robots after ${((Date.now() - tc) / 1000).toFixed(0)}s\n`);
  if (errs.length) {
    console.log('  ⚠️ errors thrown:');
    for (const e of [...new Set(errs)].slice(0, 8)) console.log(`     ${e}`);
    console.log('');
  }
  if (seated?.error) throw new Error(`no scene to measure: ${seated.error}`);

  /* ---- AB1 · the precondition. Without it nothing below proves anything. ------------------- */
  const tags = (seated?.robots ?? []).filter((r) => r.tag);
  t('AB1 · the circle seats eight and all eight wear a name tag',
    seated?.robots?.length === CAST.length && tags.length === CAST.length,
    `${seated?.robots?.length ?? 0} robots · ${tags.length} tags`);

  /*
   * AB1a · the bodies are the Meshy clones with a real skeleton. The whole beat is baked clips on
   * that rig; on the `unit4h` fallback (a failed GLB fetch — `follow-bed.js:858` catches it and the
   * night runs anyway) there are no bones and no clips, and AB2/AB3 would be measuring a body that
   * CANNOT animate. That is a different failure and it must not wear AB2's name.
   */
  const boned = (seated?.robots ?? []).filter((r) => r.boneCount > 0);
  t('AB1a · the seated bodies carry a skeleton (Meshy clones, not the unit4h fallback)',
    boned.length === CAST.length,
    `${boned.length}/${seated?.robots?.length ?? 0} rigged · ${boned[0]?.boneCount ?? 0} bones each`);

  const before = seated;
  const simCue = before.sim;
  const wallCue = Date.now();
  const byId = (s, id) => s?.robots?.find((r) => r.id === id) ?? null;

  /** Wait until the SHOW's clock has advanced `secs` past the cue. See the header on dt clamping. */
  const late = [];
  async function atSim(secs, label) {
    const target = simCue + secs;
    while (Date.now() - wallCue < SIM_CAP_MS) {
      const now = await page.evaluate(SIMCLOCK);
      if (now != null && now >= target) break;
      await sleep(1000);
    }
    const snap = await page.evaluate(SNAP);
    const got = snap.sim - simCue;
    if (got < secs - 0.25) late.push(`${label} reached only +${got.toFixed(2)}s of +${secs}s`);
    console.log(`  sample ${label}: sim +${got.toFixed(2)}s`
      + ` · wall +${((Date.now() - wallCue) / 1000).toFixed(0)}s · frame ${snap.frame}`);
    return snap;
  }

  /* ---- the accusation --------------------------------------------------------------------- */
  await page.evaluate((cue) => { window.postMessage({ t: 'cue', cue }, '*'); }, NOMS_CUE);

  const flinch = await atSim(AT_FLINCH, `flinch (+${AT_FLINCH}s)`);
  const settle = await atSim(AT_SETTLE, `settle (+${AT_SETTLE}s)`);
  let held = await atSim(AT_HELD, `held   (+${AT_HELD}s)`);

  /*
   * AB4b needs the accused's plate ON SCREEN, and the talk camera sweeps the ring continuously, so
   * at any instant it may not be. Wait for the sweep to bring it round rather than failing a colour
   * check for a reason that has nothing to do with colour. `held` only moves forward in sim time,
   * which AB3b is happy with — later is a stronger claim, not a weaker one.
   */
  const ts = Date.now();
  while (Date.now() - ts < 60000 && !byId(held, ACCUSED)?.tag?.onScreen) {
    await sleep(2500);
    held = await page.evaluate(SNAP);
  }
  const simRatio = (held.sim - simCue) / Math.max(0.001, (Date.now() - wallCue) / 1000);

  /*
   * AB0d · every sample landed where it was aimed. A gate that silently measures the flinch and
   * calls it the hold is worse than one that gives up: the whole of AB3b is the DISTANCE between
   * two moments on the show's clock, and if the machine could not get there, the honest report is
   * that it could not get there.
   */
  t('AB0d · every sample reached its point on the show clock',
    late.length === 0,
    late.length ? late.join(' · ') : `sim/wall ${simRatio.toFixed(3)}x`);

  /* ---- AB1b · did the cue even arrive? ----------------------------------------------------- */
  /*
   * Two independent receipts, either will do: the old red `!` (`nomBang`, still lit by
   * `setNominees`) and the accusation ink on the plate. Both are set from the SAME
   * `standing[].target` id, so if one of them landed on exactly the accused then the cue crossed
   * the channel, reached `follow-bed.cue()`, reached `intro.setNominees()` and matched the seat id
   * — which means every red line below is a missing performance, not a dropped message.
   *
   * ⚠️ **WHEN THE `!` IS FINALLY DELETED, REPOINT THIS, DO NOT DELETE IT.** Something has to keep
   * proving the cue landed, or AB2–AB4 become untrustworthy on the day they go green.
   */
  const marked = (held?.robots ?? []).filter((r) => r.bang?.lit || r.tag?.skin).map((r) => r.id);
  t('AB1b · the noms cue reached the circle — the nominee mark landed on exactly the accused',
    marked.length === 1 && marked[0] === ACCUSED,
    marked.length ? `marked: ${marked.join(', ')}` : 'nothing marked — the cue did not land');

  /* ---- the bands, measured live from the chairs in no part of the staging ------------------ */
  const mFl = {}; const mSe = {}; const mHe = {};
  for (const c of CAST) {
    mFl[c.id] = motionOf(byId(before, c.id), byId(flinch, c.id));
    mSe[c.id] = motionOf(byId(before, c.id), byId(settle, c.id));
    mHe[c.id] = motionOf(byId(before, c.id), byId(held, c.id));
  }
  const bandOf = (m, ch) => Math.max(0, ...IDLE_IDS.map((id) => m[id]?.[ch] ?? 0));
  const spineBar = (m) => Math.max(bandOf(m, 'spine') * BAND_K, SPINE_FLOOR_M);
  const limbBar = (m) => Math.max(bandOf(m, 'limb') * BAND_K, SPINE_FLOOR_M);
  /** Loud on EITHER channel, each against its own live floor. See the header. */
  const loud = (m, id) => (m[id] ? (m[id].spine > spineBar(m) || m[id].limb > limbBar(m)) : false);

  console.log(`\n  name channel:  ${held?.nameChannel ?? 'NONE — no instrument can name the pose (see header)'}`);
  console.log(`  sim/wall:      ${simRatio.toFixed(3)}x  (dt is clamped at 0.1s — see the header)`);
  console.log(`  idle spine:    ${bandOf(mFl, 'spine').toFixed(4)} / ${bandOf(mSe, 'spine').toFixed(4)}`
    + ` / ${bandOf(mHe, 'spine').toFixed(4)} m  -> bar ${spineBar(mFl).toFixed(4)}`
    + ` / ${spineBar(mSe).toFixed(4)} / ${spineBar(mHe).toFixed(4)}`);
  console.log(`  idle limb:     ${bandOf(mFl, 'limb').toFixed(4)} / ${bandOf(mSe, 'limb').toFixed(4)}`
    + ` / ${bandOf(mHe, 'limb').toFixed(4)} m  -> bar ${limbBar(mFl).toFixed(4)}`
    + ` / ${limbBar(mSe).toFixed(4)} / ${limbBar(mHe).toFixed(4)}`);
  console.log(`  (over ${IDLE_IDS.length} chairs in no part of the staging: ${IDLE_IDS.join(', ')})\n`);

  const role = (c) => (c.id === NOMINATOR ? 'NOMINATOR'
    : c.id === ACCUSED ? 'ACCUSED'
      : c.id === BYSTANDER ? 'control'
        : REACTORS.has(c.seat) ? 'reactor' : 'idle');
  const trio = (k) => (id) => [mFl[id], mSe[id], mHe[id]]
    .map((m) => (m?.[k] ?? 0).toFixed(3)).join('/');
  console.log('   id  name    role       performance         spine fl/set/held   limb fl/set/held    hips↑   drift   skin');
  for (const c of CAST) {
    const r = byId(held, c.id);
    console.log(`   ${c.id} ${String(c.name).padEnd(7)} ${role(c).padEnd(10)}`
      + ` ${String(r?.action ?? (r?.performing ? '(performing)' : '—')).padEnd(19)}`
      + ` ${trio('spine')(c.id).padStart(17)}   ${trio('limb')(c.id).padStart(17)}`
      + ` ${String((mSe[c.id]?.hipsRise ?? 0).toFixed(2)).padStart(6)}`
      + ` ${String((mHe[c.id]?.hipsMove ?? 0).toFixed(2)).padStart(7)}   ${r?.tag?.skin || '—'}`);
  }
  console.log('');

  /* ---- AB2 · the nominator stands up -------------------------------------------------------- */
  t('AB2 · the NOMINATOR broke the frozen seated pose when the accusation landed',
    loud(mFl, NOMINATOR) || loud(mSe, NOMINATOR) || loud(mHe, NOMINATOR),
    `spine ${trio('spine')(NOMINATOR)} m against bars`
      + ` ${spineBar(mFl).toFixed(3)}/${spineBar(mSe).toFixed(3)}/${spineBar(mHe).toFixed(3)}`
      + ` · worst ${mSe[NOMINATOR]?.worstSpine ?? '—'}`);

  /*
   * ⚠️ **AB2b IS THE HALF A WAVE PASSES AND SHOULD NOT.** "Stood up" is not "moved" — the pelvis
   * has to leave the cushion, and a seated pelvis measures ±0.015 m so this channel is silent
   * until it does. `Sit_to_Stand_Transition_M` is measured off the GLB at +0.251 m of hips rise
   * (`chair-seats.js` `SEATED_CLIPS_LEAVE_CHAIR`); the bar is 0.10.
   */
  const nomRise = Math.max(mFl[NOMINATOR]?.hipsRise ?? 0, mSe[NOMINATOR]?.hipsRise ?? 0,
    mHe[NOMINATOR]?.hipsRise ?? 0);
  t('AB2b · …and actually STOOD — the pelvis came up off the cushion',
    nomRise >= STAND_RISE_M,
    `hips rose ${nomRise >= 0 ? '+' : ''}${nomRise.toFixed(3)} m, bar ${STAND_RISE_M} m`
      + ` (the stand clip measures +0.251 m)`);

  /*
   * AB2c · …and the show can NAME what it is playing. Split from the measured checks on purpose: a
   * red AB2 with a green AB2c means the label lies; a green AB2 with a red AB2c means the animation
   * is real and no instrument can see which one it is. Different bugs, different owners.
   */
  const nomAct = byId(settle, NOMINATOR)?.action ?? byId(held, NOMINATOR)?.action ?? null;
  const nomPerf = byId(settle, NOMINATOR)?.performing ?? byId(held, NOMINATOR)?.performing;
  t('AB2c · …under a named performance the allow-list knows',
    !!nomAct && nomAct !== SIT_IDLE_SHIP && SEATED_REACTION_CLIPS.includes(nomAct),
    nomAct
      ? `"${nomAct}" via ${byId(held, NOMINATOR)?.actionVia}`
      : (nomPerf
        ? 'the bed says this chair is performing but will not say WHAT — sitReport() rows carry '
          + '`clip` (the resting pose) and no `seatedAction`'
        : 'no performance name readable from the page — forward intro-bed\'s accusationReport() '
          + 'and sitReport() through follow-bed onto window.__rrrFollow (see header)'));

  /*
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * 🚨 **AB2d · …AND IS STILL IN THE BALLROOM. THIS IS THE ONE ONLY A LIVE-SCENE GATE COULD FIND.**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * Measured on the build this file was written against: at sim +14 s the accuser's pelvis was
   * **28.4 metres** from where it had been sitting, and on a slower rerun 12.2 m at +9.7 s — it
   * grows with elapsed time, which is the signature of a per-frame accumulation rather than a
   * clip. The whole upper body goes with it (`head_end` tracked hips to within 0.1 m), so this is
   * not a broken pose, it is the accuser leaving the building at a constant rate while the other
   * seven sit and watch.
   *
   * The suspect is `mesh-avatar.js` `update()`: under `hold: true` the reaction never sets
   * `reactOut`, so `reactAmt` stays 1 and every frame runs
   *
   *     hips.position.y += reactAnchor.y * reactAmt;
   *     hips.position.z += reactAnchor.z * reactAmt;
   *
   * That is a CORRECTION, written as an increment, and it is only self-limiting while the mixer
   * keeps overwriting `hips.position` from the clip each frame. `Sit_to_Stand_Transition_M` is
   * played `LoopOnce` with `clampWhenFinished`, and a clamped action stops writing — from that
   * frame on the `+=` has nothing undoing it and integrates forever. Note `hips.position.x` is
   * separately PINNED to `hipsRest.x` one line above and does not drift, which is consistent:
   * the two axes that drift are exactly the two that are incremented.
   *
   * ⚠️ That is a reading of the code that fits the numbers, not a proven diagnosis — the fix is
   * `mesh-avatar.js`'s owner's call. What is not in doubt is the measurement: a robot 12–28 m
   * from its chair, on air, in the middle of the Reckoning. The ceiling here is 1.0 m against a
   * clip that travels 0.44 m end to end.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  const nomDrift = Math.max(mFl[NOMINATOR]?.hipsMove ?? 0, mSe[NOMINATOR]?.hipsMove ?? 0,
    mHe[NOMINATOR]?.hipsMove ?? 0);
  t('AB2d · …and is STILL IN THE BALLROOM — the stand does not walk the accuser out of the world',
    nomDrift <= STAND_TRAVEL_MAX_M,
    `pelvis travelled ${nomDrift.toFixed(2)} m from its chair, ceiling ${STAND_TRAVEL_MAX_M} m`
      + ` (the stand clip travels 0.44 m); at +${AT_FLINCH}/${AT_SETTLE}/${AT_HELD}s:`
      + ` ${trio('hipsMove')(NOMINATOR)}`);

  /* ---- AB3 · the accused reacts, and HOLDS -------------------------------------------------- */
  t('AB3 · the ACCUSED reacted inside the flinch window',
    loud(mFl, ACCUSED),
    `spine ${(mFl[ACCUSED]?.spine ?? 0).toFixed(3)} m (bar ${spineBar(mFl).toFixed(3)}),`
      + ` limb ${(mFl[ACCUSED]?.limb ?? 0).toFixed(3)} m (bar ${limbBar(mFl).toFixed(3)})`
      + ` by sim +${AT_FLINCH}s — FLINCH fires at 0.40s`);

  /*
   * ⚠️ **AB3b IS THE HALF A ONE-SHOT PASSES AND SHOULD NOT.** A flinch that plays once and
   * crossfades straight home satisfies AB3 and is not what was designed: the accused SETTLES into a
   * posture and keeps it. The sample is a full `Chair_Sit_Idle_M` loop past `ACCUSE.SETTLE`, so a
   * pose that has quietly let go has had every opportunity to be caught doing it — and AB0d is what
   * stops this being claimed on a sample that never got that far.
   */
  t('AB3b · …and is STILL out of the seated idle a full sit-loop later — the posture is HELD',
    loud(mHe, ACCUSED) && late.length === 0,
    `spine ${trio('spine')(ACCUSED)} · limb ${trio('limb')(ACCUSED)} m`
      + ` at sim +${AT_FLINCH}/${AT_SETTLE}/${AT_HELD}s`
      + ` against bars ${spineBar(mHe).toFixed(3)} / ${limbBar(mHe).toFixed(3)}`
      + ` — at the hold the spine is`
      + ` ${((mHe[ACCUSED]?.spine ?? 0) / Math.max(1e-6, bandOf(mHe, 'spine'))).toFixed(1)}x the`
      + ` idle spine and the limbs`
      + ` ${((mHe[ACCUSED]?.limb ?? 0) / Math.max(1e-6, bandOf(mHe, 'limb'))).toFixed(1)}x the idle`
      + ` limbs, so this is a WEAK pose rather than an absent one${late.length ? '; and ' + late.join(', ') : ''}`);

  const accActSe = byId(settle, ACCUSED)?.action ?? null;
  const accActHe = byId(held, ACCUSED)?.action ?? null;
  t('AB3c · …under a named performance, the same one at both samples',
    !!accActHe && accActHe !== SIT_IDLE_SHIP && accActSe === accActHe
      && SEATED_REACTION_CLIPS.includes(accActHe),
    accActHe ? `+${AT_SETTLE}s "${accActSe}" → +${AT_HELD}s "${accActHe}"`
      : 'no performance name readable — see AB2c');

  /* ---- AB4 · the accused's plate is a different colour -------------------------------------- */
  const accTag = byId(held, ACCUSED)?.tag ?? null;
  const otherTags = (held?.robots ?? []).filter((r) => r.id !== ACCUSED && r.tag);
  const skins = new Set(otherTags.map((r) => r.tag.skin || ''));
  t('AB4 · the accused\'s plate carries a skin none of the other seven carry',
    !!accTag && !!accTag.skin && !skins.has(accTag.skin),
    accTag
      ? `accused skin "${accTag.skin || '(none)'}" · the other seven: `
        + `${[...skins].map((s) => s || '(none)').join(', ')}`
      : 'the accused has no name tag');

  /*
   * AB4b · …and it reaches the television. Projected onto the `NOM_INK - INK` axis and compared
   * INSIDE ONE FRAME — see the header for both halves of why (the camera drift that killed the
   * cross-frame version, and the brightness spread that killed the RGB-distance version). The
   * assertion is a RANK, not a distance: the accused must be further toward the accusation ink
   * than every unaccused plate on screen, by a margin.
   */
  /*
   * ⚠️ **RANK ALONE IS TOO WEAK AND MARGIN-OVER-THE-NEXT-PLATE IS TOO BRITTLE. IT TAKES BOTH, AND
   * THE SECOND RUN OF THIS CHECK IS WHY.** Margin over the single next plate read 55.6 on one run
   * and 13.3 on the next, on a build where the mechanic worked perfectly both times. Two things
   * move it: the haze, which drags the far plates along the axis (the accused was the FURTHEST of
   * the eight in both runs, at 12.9 m and 13.8 m), and the SEAT TAB, which is painted in each
   * player's own accent — one near-white accent (`#f0ebe3`, seat 3) lifted that plate's mean RGB
   * to within 13 of the accused's while every other plate sat 30–50 away.
   *
   * So the comparison is against the MEDIAN of the field, which one odd accent cannot move, AND
   * the accused must still rank strictly first. Median margin measured 34 and 64 on the two runs
   * that gave 13.3 and 55.6 against the next plate — the same evidence, read robustly.
   */
  const shownOthers = otherTags.filter((r) => r.tag.onScreen && r.tag.rgb);
  const accProj = inkProj(accTag?.rgb);
  const projs = shownOthers.map((r) => ({ id: r.id, p: inkProj(r.tag.rgb) }))
    .sort((a, b) => b.p - a.p);
  const median = projs.length ? projs[Math.floor(projs.length / 2)].p : null;
  const topOther = projs.length ? projs[0] : null;
  const first = accProj != null && topOther != null && accProj > topOther.p;
  t('AB4b · …and that ink reaches the television — the reddest plate in the frame, by a margin',
    accProj != null && median != null && shownOthers.length >= 4
      && first && (accProj - median) > INK_RANK_MARGIN,
    accProj == null
      ? (accTag && !accTag.onScreen
        ? 'the accused\'s plate never came round into shot — the sweep, not the colour'
        : 'no plate pixels')
      : `accused ${accProj.toFixed(1)} · ${first ? 'ranks first' : `RANKS BEHIND ${topOther?.id}`}`
        + ` (next ${topOther?.p.toFixed(1)}) · median of the field ${median.toFixed(1)}`
        + ` — margin ${(accProj - median).toFixed(1)}, bar ${INK_RANK_MARGIN};`
        + ` ${shownOthers.length} unaccused plates spanning`
        + ` ${(projs.length ? projs[0].p - projs[projs.length - 1].p : 0).toFixed(1)}`
        + ` · accused at ${accTag.dist} m, the others`
        + ` ${Math.min(...shownOthers.map((r) => r.tag.dist)).toFixed(1)}–`
        + `${Math.max(...shownOthers.map((r) => r.tag.dist)).toFixed(1)} m`);

  /* ---- AB5 · the control -------------------------------------------------------------------- */
  /*
   * ⚠️ **THE ONE THAT IS SUPPOSED TO BE GREEN EVEN ON A BROKEN BUILD.** Without it a beat that
   * stood all eight robots up would sail through AB2 and AB3, and "everybody reacted" is not a
   * staged accusation. It is also the calibration: `STILL_SPINE_M` is what a robot doing nothing
   * measures. It asserts on the SPINE only — the control's hands swing through 0.44 m of seated
   * idle like everybody else's, and convicting it for that would be convicting the animation.
   */
  const byWorst = Math.max(mFl[BYSTANDER]?.spine ?? 0, mSe[BYSTANDER]?.spine ?? 0,
    mHe[BYSTANDER]?.spine ?? 0);
  const byAct = byId(held, BYSTANDER)?.action ?? null;
  t('AB5 control · a chair in no part of the staging never left the seated idle',
    byWorst < STILL_SPINE_M && (byAct == null || byAct === SIT_IDLE_SHIP),
    `${BYSTANDER} (seat ${seatOf(BYSTANDER)}) spine ${trio('spine')(BYSTANDER)} m,`
      + ` ceiling ${STILL_SPINE_M} · limb ${trio('limb')(BYSTANDER)} m (not asserted on)`
      + ` · performance ${byAct ?? 'none'}`);

  /* ═════════════════════════════════════════════════════════════════════════════════════════════
   * 📐 AB6 · HOW BIG IS THE RED `!` ON SCREEN, AND IS THE SPREAD THE CLAMP OR SOMETHING ELSE?
   * ═════════════════════════════════════════════════════════════════════════════════════════════
   * Filed from a photograph of `progress/r5/08-tv-reckoning-named.png`: two nominees in one frame,
   * the near one's `!` about 90 px tall and the far one's about 20 px — an eyeball estimate off a
   * PNG with no decoder to hand, and explicitly filed as "measure it, and withdraw it if it comes
   * back near 1.0", the way F13 was withdrawn in `circle-staging.mjs`.
   *
   * So this measures it. **And it measures the PREDICTION too**, because the interesting question
   * is not the ratio, it is whether the ratio is what the constants specify:
   *
   *   `attachNomineeBang` scales by `tagDistK` = `clamp(d / TAG_REF_DIST, TAG_NEAR_K, TAG_FAR_K)`
   *   under `sizeAttenuation: true`, so apparent height ∝ `k(dist) / depth`. Inside the band
   *   (1.36–8.0 m) that is `dist / (TAG_REF_DIST × depth)` — constant for a sprite near the
   *   optical axis, which is what the clamp buys, and slightly larger off-axis where depth runs
   *   shorter than distance. Beyond 8.0 m `k` pins at `TAG_FAR_K` and the height falls off as
   *   `2/depth` like any other sprite.
   *
   * ⚠️ **DISTANCE AND DEPTH ARE DIFFERENT NUMBERS HERE AND THE FIRST VERSION OF AB6 CONFLATED
   * THEM**, predicting `k(d)/d` and measuring a world-+Y offset. It reported the measured spread
   * as 22% wider than the clamp allows — a finding that was entirely the instrument. See the
   * note on `spriteBox`.
   *
   * The ring reaches ~4.6 m and the camera stands ~9.2 m out (`circle-staging.mjs` C3), so the far
   * chairs sit past the ceiling and the near ones inside the band. `predicted` below is computed
   * from the MEASURED distances and the IMPORTED constants, so it follows `TAG_REF_DIST`,
   * `TAG_NEAR_K` and `TAG_FAR_K` if any of them move, and today's number is baked nowhere.
   *
   *   AB6  · measured ratio agrees with the ratio the clamp specifies → the spread is the DESIGN,
   *          and how much spread is acceptable is John's call, not a bug. A disagreement means
   *          something other than `tagDistK` is scaling these sprites, which IS a bug.
   *   AB6b · the smallest lit `!` still reads. `circle-staging` C6 fixed 28 px as the floor for a
   *          whole NAME after a shrink made the far side unreadable; a single glyph carrying "this
   *          robot is accused" gets 24.
   *
   * ⚠️ ALL EIGHT ARE NOMINATED FOR THIS MEASUREMENT ONLY. A ratio over one element is 1.0 and
   * always green — the note that came with the finding, and it is right. Eight also captures the
   * whole near/far spread in a single frame wherever the sweep happens to be. It runs LAST and the
   * bed is cleared afterwards so nothing above can be contaminated by it.
   * ═════════════════════════════════════════════════════════════════════════════════════════════ */
  await page.evaluate((cue) => { window.postMessage({ t: 'cue', cue }, '*'); }, ALL_NOMS_CUE);
  /*
   * `setNominees` lights every bang synchronously, and `onBeforeRender` writes the scale — which
   * `SNAP`'s own `redraw()` supplies. One frame is enough, so this waits on the FRAME counter and
   * not on `atSim`: the sim-clock budget is spent by now, and a `late` entry logged here would
   * retroactively muddy AB0d, which is about the three samples that carry an assertion.
   */
  const startFrame = held.frame;
  const tf = Date.now();
  while (Date.now() - tf < 60000) {
    const fr = await page.evaluate(() => window.__rrr?.engine?.frame ?? 0);
    if (fr > startFrame + 1) break;
    await sleep(1000);
  }
  let bangs = await page.evaluate(SNAP);
  const litRows = () => (bangs?.robots ?? [])
    .filter((r) => r.bang?.lit && r.bang.onScreen && r.bang.hPx > 0)
    .map((r) => ({ id: r.id, d: r.bang.dist, z: r.bang.depth, h: r.bang.hPx }))
    .sort((a, b) => a.d - b.d);
  // The sweep may have half the ring behind the camera; give it a chance to bring more into shot.
  const tb = Date.now();
  while (Date.now() - tb < 60000 && litRows().length < 4) {
    await sleep(2500);
    bangs = await page.evaluate(SNAP);
  }
  const lit = litRows();

  /**
   * The whole model in one line: `onBeforeRender` sets the world size to `BANG_SIZE × k(dist)`,
   * and `sizeAttenuation` puts that on screen divided by view-space DEPTH. Ratios of this are
   * unit-free, so the projection constants and the canvas size cancel and only the shape of the
   * clamp is being tested.
   */
  const kOf = (d) => Math.min(TAG_FAR_K, Math.max(TAG_NEAR_K, d / TAG_REF_DIST));
  const apparent = (d, z) => kOf(d) / Math.max(1e-6, z);

  if (lit.length >= 2) {
    const hs = lit.map((r) => r.h);
    const measured = Math.max(...hs) / Math.max(1e-6, Math.min(...hs));
    const aps = lit.map((r) => apparent(r.d, r.z));
    const predicted = Math.max(...aps) / Math.max(1e-9, Math.min(...aps));
    const top = Math.max(...aps);
    console.log(`\n   lit "!"      dist   depth      height     k(d)   predicted   measured (relative)`);
    for (const r of lit) {
      console.log(`   ${r.id.padEnd(12)}${r.d.toFixed(2).padStart(6)}m${r.z.toFixed(2).padStart(7)}m`
        + `${r.h.toFixed(1).padStart(11)}px${kOf(r.d).toFixed(2).padStart(9)}`
        + `${(apparent(r.d, r.z) / top).toFixed(3).padStart(12)}`
        + `${(r.h / Math.max(...hs)).toFixed(3).padStart(11)}`);
    }
    console.log(`   BANG_SIZE ${BANG_SIZE} m · band ${(TAG_NEAR_K * TAG_REF_DIST).toFixed(2)}`
      + `–${(TAG_FAR_K * TAG_REF_DIST).toFixed(2)} m (k pinned outside it)\n`);

    t('AB6 · the "!" sizes across one frame are exactly what tagDistK specifies — no more, no less',
      Math.abs(measured / predicted - 1) <= 0.12,
      `measured ${measured.toFixed(2)}x over ${lit.length} lit marks`
        + ` (${Math.min(...hs).toFixed(0)}–${Math.max(...hs).toFixed(0)} px at`
        + ` ${lit[0].d.toFixed(1)}–${lit[lit.length - 1].d.toFixed(1)} m),`
        + ` the clamp predicts ${predicted.toFixed(2)}x —`
        + ` ${((measured / predicted - 1) * 100).toFixed(1)}% off`);

    t('AB6b · …and the smallest one still reads at 24 px',
      Math.min(...hs) >= 24,
      `smallest ${Math.min(...hs).toFixed(1)} px at ${lit[lit.length - 1].d.toFixed(1)} m`
        + ` · largest ${Math.max(...hs).toFixed(1)} px at ${lit[0].d.toFixed(1)} m`);
  } else {
    t('AB6 · the "!" sizes across one frame are exactly what tagDistK specifies', false,
      `only ${lit.length} lit mark(s) on screen — a ratio over one element is 1.0 and would be`
        + ' green for free, so this reports the sweep instead of pretending to measure');
  }

  await page.evaluate((cue) => { window.postMessage({ t: 'cue', cue }, '*'); }, CLEAR_NOMS_CUE);

  await writeFile(path.join(SHOTDIR, 'accusation.json'), JSON.stringify({
    nominator: NOMINATOR, accused: ACCUSED, bystander: BYSTANDER,
    reactorSeats: [...REACTORS], idleIds: IDLE_IDS,
    nameChannel: held?.nameChannel ?? null,
    sim: { cue: simCue, flinch: flinch.sim, settle: settle.sim, held: held.sim, ratio: simRatio, late },
    motion: { flinch: mFl, settle: mSe, held: mHe },
    tags: (held?.robots ?? []).map((r) => ({ id: r.id, action: r.action, proj: inkProj(r.tag?.rgb), ...r.tag })),
    bangs: (bangs?.robots ?? []).map((r) => ({ id: r.id, ...r.bang })),
    inkAxis: { from: INK, to: NOM_INK, unit: INK_AXIS },
    raw: { before, flinch, settle, held },
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
 * 📋 RUN LOG — 2026-08-28, `claude/casting-screen-layout-crgctg`, while the beat was being built.
 *
 * RUN 1 — slept 2.5 / 6.5 / 12.5 s of WALL time and called the last one "ten seconds later". The
 *   accused measured 0.008 → 0.268 → 0.771 m on a smooth ramp, which reads as a settle arriving
 *   late; it was really the flinch still crossfading in, because 12.5 s of wall bought ~1.2 s of
 *   show. `core/engine.js:337` clamps dt to 0.1 s and swiftshader renders the ballroom at under a
 *   frame a second. Everything now waits on `engine.elapsed`, and AB0d fails if it could not get
 *   there. The same run's "uninvolved" band had a GASPING REACTOR in it and read 0.133 m — a noise
 *   floor made of signal. `reactorSeats` is now recomputed and its three chairs excluded.
 *
 * RUN 2 — max-over-all-bones as the metric. Idle band 0.44 m (one seated robot's RightHand), bar
 *   1.31 m, and the accused's real 0.75 m flinch FAILED against it. The seated idle's hands and
 *   feet swing through half a metre for free. Split into the spine and limb channels.
 *
 * RUN 3 — per-bone dump, which settled the channels for good. Idle, three chairs, three samples:
 *   Spine/Hips/shoulders/neck 0.002–0.015 m; RightHand 0.187/0.437/0.013; RightToe 0.126/0.258/
 *   0.028. Accused: spine 0.324 at the flinch, 0.078 at the hold; limbs 0.80 and 0.36. Nominator:
 *   spine 0.161/0.408/12.2. `Head` carries its own track through the idle (0.036 m) and is off the
 *   spine channel because of it.
 *
 * RUN 4 — AB6's first outing said the `!` spread was 22% wider than `tagDistK` allows. It was the
 *   instrument: world-+Y offsets and Euclidean distance where a sprite uses the camera's up axis
 *   and view-space depth. Corrected, all eight marks agree with the clamp to within 0.1%.
 *
 * RUN 5 — AB4b's margin-over-the-next-plate swung 55.6 → 13.3 on a working mechanic (see its
 *   block); moved to a median. AB0d fired twice for the right reason — a 420 s budget could not
 *   buy 12 s of show at 0.024x — so the cap is 600 s. Final state: 13 ok, 4 fail, and all four
 *   failures are the product.
 *
 * WHAT WAS RED, AND WHY — the honest state of the beat as this file left it:
 *   AB0/AB0c/AB0d/AB1/AB1a/AB1b · GREEN. The room warms, eight rigged robots sit, and the noms
 *           cue lands on exactly the accused — so every red line below is the thing itself.
 *   AB2, AB2b · GREEN. The accuser breaks the frozen seated spine (0.17 → 0.41 m against a
 *           0.05 m bar) and the pelvis rises 0.37–0.45 m. The stand is real.
 *   AB2d  · **RED, and it is a bug, not a threshold.** The accuser's pelvis measured 12.6, 20.8
 *           and 28.4 m from its chair on three runs, always ~0.38 m at sim +3 s and enormous by
 *           +12 s. It grows with elapsed time, the whole upper body goes with it, and `hips.x`
 *           — the one axis that is PINNED rather than incremented — never drifts. See AB2d's
 *           block for the reading of `mesh-avatar.js` `update()` that fits all of that.
 *   AB3   · GREEN. The flinch is loud: spine 0.333 m at sim +1.2 s against a 0.05 m bar.
 *   AB3b  · **RED, and the interesting one.** The hold is not absent, it is WEAK. Across five
 *           runs the accused's spine goes 0.333 → 0.026 → 0.022 m and its limbs 0.747 → 0.296 →
 *           0.269 m: at the hold that is **1.9x the idle spine and 0.8x the idle limbs**, i.e.
 *           inside the envelope eight robots doing nothing produce for free. The flinch is
 *           unmistakable and the posture it settles into is not. Two candidate causes, and this
 *           gate cannot tell them apart: the settle is being released, or
 *           `Sitting_Answering_Questions` (which `settleClip` picks for seat 5) is simply too
 *           close to `Chair_Sit_Idle_M` to read — a casting problem in `ACCUSE_CLIPS.settle`
 *           rather than a wiring one. `seated-actions.mjs` reads both clips out of the GLB and
 *           can measure them against each other; that is where the answer is.
 *           ⚠️ `SPINE_FLOOR_M` was fixed at 0.05 (3.3x the loudest idle spine ever measured)
 *           BEFORE the hold was measured, and it stays there. Lowering it to 0.02 so a signal
 *           this close to the noise floor goes green would be moving the gate to fit the build.
 *   AB2c, AB3c · RED, and cheap. `intro-bed.js` already computes `accusationReport()` and
 *           `sitReport()` and neither reaches `window.__rrrFollow`; `sitReport`'s rows carry
 *           `clip` (the resting pose, which stays `Chair_Sit_Idle_M` by design) and not
 *           `seatedAction`. Two one-line forwards and one extra field, in files this gate does
 *           not own.
 *   AB4, AB4b · GREEN. The accusation ink is on exactly one plate and it is the reddest in the
 *           frame while being the furthest and haziest of the eight.
 *   AB5   · GREEN, which is the point of a control.
 *   AB6, AB6b · GREEN, and they are an ANSWER rather than a defect — see below.
 *
 * 📐 THE `!` SIZE FINDING, ANSWERED. Filed off a photograph as "near ~90 px, far ~20 px, roughly
 *   4x". Measured, eight marks in one frame at 4.60–13.81 m: **139.9 px down to 70.5 px, a 1.98x
 *   spread, and the clamp predicts 1.99x.** Every individual mark matches its prediction to
 *   within 0.1%, so nothing other than `tagDistK` is scaling these sprites and the mechanism is
 *   understood: inside the 1.36–8.00 m band the apparent size is flat by construction, and past
 *   8.00 m `k` pins at `TAG_FAR_K` and the mark falls off like any other sprite. The 4x in the
 *   photograph was an eyeball estimate and the real number is half of it. **Whether 1.98x is
 *   acceptable is a design question for John, not a bug** — the smallest mark is 70 px tall and
 *   nowhere near the 24 px floor, so nothing here is illegible; the far side of the ring is
 *   simply half the size of the near side, by the same clamp that keeps the name tags readable.
 *   The lever, if he wants it flatter, is `TAG_FAR_K` — and AB6 will follow it.
 *
 * ⚠️ NOT WIRED INTO `gates:party` BY THIS BRANCH — `package.json` belongs to another agent this
 * round, and `seated-actions.mjs` carries the same note. Add all three accusation gates to the
 * chain when merging. This one costs a mansion bake plus ~12 s of show time; at the swiftshader
 * ratios measured here (0.03x) that is 8–11 minutes of wall clock.
 * ============================================================================================ */
