#!/usr/bin/env node
/**
 * accusation-beat — does the Reckoning's accusation reach the TELEVISION, on real bodies?
 *
 *   node harness/accusation-beat.mjs            # writes progress/accusation/
 *   node harness/accusation-beat.mjs --keep     # leave vite up
 *
 * ⚠️ **WRITTEN BEFORE THE BEAT EXISTED, AND LANDED RED ON PURPOSE.** A gate that cannot fail
 * before the fix proves nothing about the fix. Every threshold in this file was chosen against a
 * run in which the performance was missing, and the run log at the foot of the file records what
 * each line said on that day. If you are reading this because it went red, the numbers it prints
 * are the whole diagnosis — nothing here reports an adjective.
 *
 * WHY THIS FILE EXISTS. The Reckoning used to announce a nomination by making one sprite visible:
 * `nomBang`, a red `!` over the name tag. Eight seated bodies kept breathing through the biggest
 * beat of the night while one of them acquired a punctuation mark. The replacement is a staged
 * performance — the NOMINATOR stands up out of their chair, the ACCUSED flinches and then HOLDS a
 * posture, and the accused's plate turns the accusation ink.
 *
 * ---------------------------------------------------------------------------------------------
 * 🧩 WHERE THIS SITS AMONG ITS SIBLINGS — three gates, three different lies to catch
 * ---------------------------------------------------------------------------------------------
 *   `seated-actions.mjs`    the CLIPS: reads `friendly_all38.glb`'s chunks in bare node and
 *                           proves the eleven seated performances exist, where their hips open,
 *                           and which three leave the chair. Cannot see a night.
 *   `accusation-stage.mjs`  the MACHINE: pure node, drives `createAccusationStage` with a
 *                           recording circle and proves it fires once per nomination, restores
 *                           without being told, and leaks no role. Cannot see a robot.
 *   **this file**           the PICTURE: boots the real view, seats a real circle, accuses a real
 *                           chair, and reads BONES AND PIXELS out of the live scene. It is the
 *                           only one of the three that can tell you nothing happened on screen.
 *
 * All three can be green while the beat is invisible — a clip that exists, a machine that
 * schedules it, and an avatar that never plays it is exactly that shape. This is the one that
 * closes it.
 *
 * ⚠️ CHECKS ARE PREFIXED `AB` because `accusation-stage.mjs` already uses bare `A1`–`A6` and both
 * run in the same chain. `AB1`–`AB5` are the five things this file was asked to prove; the `b`/`c`
 * suffixes split a claim from the evidence for it (see the note on AB2b/AB2c).
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
 * ballroom renders at roughly 2–5 fps, so **show time advances at a fraction of wall-clock time**
 * — measured on the first run of this file, 12.5 s of `sleep()` bought about 1.2 s of animation.
 * `ACCUSE.SETTLE` is at 2.00 s, so a probe that slept twelve seconds and called it "ten seconds
 * later" was sampling the beat before its second act had started, and reported the accused
 * "reacting" on a ramp that was really the flinch still crossfading in.
 *
 * Every sample below therefore waits on `engine.elapsed` reaching a target offset from the cue.
 * The wall/sim ratio is printed on every run, because the day it goes to 1.0 is the day somebody
 * gave this a real GPU and the timings mean something different.
 *
 * ---------------------------------------------------------------------------------------------
 * 🦴 WHAT "PLAYING A DIFFERENT CLIP" IS READ FROM, AND THE ONE LINE STILL MISSING
 * ---------------------------------------------------------------------------------------------
 * `mesh-avatar.js` deliberately keeps two questions apart, and its header says why: `get clip()`
 * stays `Chair_Sit_Idle_M` for the whole performance (it answers *what is this seat's resting
 * pose*, which `assertSeatedPose` needs to stay stable), while `get seatedAction()` is the
 * performance on top of it. **A probe that asserts on `clip` will never see the accusation.** So
 * the name this file wants is `seatedAction`, and it is looked for in this order:
 *
 *   1. `window.__rrrFollow.accusation()` — `intro-bed.js` `accusationReport()`, which already
 *      returns `{ keys, pending, performing, skinned }`. **It exists and is NOT REACHABLE FROM A
 *      BROWSER.** `follow-bed.js` forwards `streamReport` and `camReport` to the bed's public
 *      face and `party-follow.js` republishes them on `window.__rrrFollow`; `accusationReport`
 *      and `sitReport` are on neither. Two one-line forwards fix it, in the files those two
 *      already live in.
 *   2. `window.__rrrFollow.sit()` — `intro-bed.js` `sitReport()`, same two forwards. Note that
 *      today its rows carry `clip` and NOT `seatedAction`, so if that is the route somebody
 *      wires, the row needs the action on it too or this gate still cannot name the pose.
 *   3. `userData.clip` / `userData.seatedAction` stamped on anything under the robot's root.
 *   4. nothing — and then AB2c/AB3c fail saying so, in those words.
 *
 * ⚠️ **A NAME IS NOT EVIDENCE, WHICH IS WHY EVERY NAMED CHECK IS PAIRED WITH A MEASURED ONE.**
 * Whichever route gets wired it is a string, and a string can be stamped by code that animates
 * nothing. AB2/AB2b/AB3/AB3b read BONES — world positions of real bones in the live scene, which
 * no label can fake. AB2c/AB3c read the label. When one half fails its message says which half,
 * so "the animation is missing" and "the animation plays and no instrument can name it" can never
 * again be mistaken for each other.
 *
 * ---------------------------------------------------------------------------------------------
 * 📏 THE NOISE FLOOR IS MEASURED FROM THE CONTROL, NOT PICKED — AND THE ARMS ARE THE NOISE
 * ---------------------------------------------------------------------------------------------
 * Eight seated robots are not still. All of them loop `Chair_Sit_Idle_M` (10.7 s) at a per-seat
 * phase offset (`chair-seats.js` `sitPhase` = `seatIndex * 1.37`), so every hand and foot in the
 * circle is drifting all the time. First run, six uninvolved robots, no accusation anywhere near
 * them: **up to 0.133 m of hand travel.** A fixed "moved more than X" threshold would either miss
 * a real stand or convict the idle.
 *
 * Two answers, both used:
 *
 *   · **The band is live.** Each robot is compared to its own pre-cue baseline, and the deltas of
 *     the robots who are in NO part of the staging — not accused, not accuser, not one of the
 *     three reactors — over the SAME sim interval on the SAME build ARE the noise floor. The
 *     nominator and the accused must clear `max(band × BAND_K, MOTION_FLOOR_M)`.
 *   · **The torso is the quiet channel.** `mesh-avatar.js` freezes `SIT_LEAN_BONES` (Hips, Spine,
 *     Spine01, Spine02) at `SIT_UPRIGHT_T` through the whole seated idle and re-applies them
 *     after the mixer, so in the idle the torso is *held still by construction* while the arms
 *     swing. First run: control hips moved ±0.005 m against hands at 0.133 m — a 25:1 quieter
 *     channel, and the one a stand-up cannot avoid using.
 *
 * ⚠️ Bone offsets are taken RELATIVE TO EACH ROBOT'S OWN ROOT, so a body that travels does not
 * read as a body that moved its limbs; the root's own displacement is measured separately and
 * folded in, because "stood up and stepped forward" must still count as standing up.
 *
 * ---------------------------------------------------------------------------------------------
 * 🎨 THE PLATE IS COMPARED INSIDE ONE FRAME. NEVER AGAINST AN EARLIER FRAME.
 * ---------------------------------------------------------------------------------------------
 * Inherited from `nametag-legibility.mjs` N6, which cost two false failures to learn: the talk
 * camera walks the ring continuously, so a tag's measured colour drifts with angle and distance,
 * and a baseline captured seconds earlier made FOUR tags "change" when two had. AB4b therefore
 * measures the accused's plate against the other seven **in the same readPixels**, with the seven
 * others' own spread folded into the bar. AB4 reads `userData.tagSkin`, the exact camera-free
 * record of which ink `setNameTagLabel` painted.
 *
 * The same file records the other half of that lesson: do not compare `p05`. It is the BLACK
 * GLYPH OUTLINE, black on every skin there has ever been, and it sat still through a working
 * mechanic. Mean RGB is what moves when a plate is repainted.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚦 AB5 IS THE CONTROL, AND IT IS THE ONE THAT IS SUPPOSED TO BE GREEN EVEN ON A BROKEN BUILD
 * ---------------------------------------------------------------------------------------------
 * A beat that stood ALL EIGHT robots up would satisfy AB2 and AB3 perfectly, and "everybody
 * reacted" is not a staged accusation. AB5 holds a robot who is neither nominator nor accused nor
 * a designated reactor to the seated idle. A run where AB5 goes red while AB2/AB3 go green has
 * proved nothing at all.
 *
 * ⚠️ **THE BYSTANDER HAS TO DODGE `reactorSeats()`, AND THE FIRST RUN OF THIS FILE PROVES WHY.**
 * The circle deliberately gives THREE other chairs a staggered gasp, so five of the eight are in
 * the scene and a control picked by eye lands on one of them and fails for being right. Worse:
 * before this file knew that, the "uninvolved" band it measured had a gasping reactor in it and
 * was inflated to 0.133 m — a noise floor made of signal, which is the quietest way an instrument
 * like this goes wrong. `intro-bed.js` derives the reactors from PUBLIC seat indices (its own
 * header explains why that is a leak surface and not a style choice); this file recomputes them
 * and excludes all five involved chairs from both the band and the control.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { cueViolations, CUE_NOM_KEYS } from '../src/party/follow.js';
import { SIT_IDLE_SHIP, SEATED_REACTION_CLIPS } from '../src/game/chair-seats.js';

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
 * Read against `intro-bed.js` `ACCUSE`: STAND 0.00, FLINCH 0.40, GASP 0.80 (+0.22 stagger),
 * SETTLE 2.00, FADE 0.25.
 */
/** Past FLINCH + its crossfade, before SETTLE — the recoil, while it is still the recoil. */
const AT_FLINCH = 1.2;
/** Past SETTLE + its crossfade — the held posture, newly arrived. */
const AT_SETTLE = 3.0;
/**
 * A full `Chair_Sit_Idle_M` loop (10.7 s) past the settle. A one-shot that quietly crossfaded
 * home has had every opportunity to be caught doing it by now, which is the whole of AB3b.
 */
const AT_HELD = 14.0;
/** Wall-clock ceiling on reaching AT_HELD. At the measured ~10:1 ratio this is generous. */
const SIM_CAP_MS = 300000;

/**
 * How much louder than the sit loop a reaction has to be, on the noisy all-bones channel. 3× is
 * deliberately not tight: the gate exists to catch NOTHING HAPPENING, and a beat that only just
 * clears the idle it is meant to interrupt is a beat nobody in the room will notice.
 */
const BAND_K = 3;
/** …and an absolute floor, so a freakishly still control interval cannot promote a twitch. */
const MOTION_FLOOR_M = 0.06;
/**
 * The stand, on the quiet channel. `chair-seats.js` `SEATED_CLIPS_LEAVE_CHAIR` measures
 * `Sit_to_Stand_Transition_M` off the GLB at hips 0.531 → 0.782 — **+0.251 m**. The bar is set at
 * well under half of that so the crossfade, the `reactAnchor` correction and a sample taken
 * mid-rise all have room, and still an order of magnitude above the ±0.005 m the frozen seated
 * torso measures.
 */
const STAND_RISE_M = 0.10;
/** The control's ceiling on the all-bones channel — first run, five idle robots: 0.003–0.029 m. */
const STILL_M = 0.06;
/**
 * Plate colour, as a Euclidean RGB distance. `nametag-legibility` N6b uses a 12-point gap on one
 * channel pair for the pair green and this is the same order of magnitude; the seven unaccused
 * plates' own spread in the same frame is folded into the bar on top, because angle and distance
 * move a plate's measured colour on their own.
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
 * slices to. Names are distinct on purpose: duplicates are a locked product rule and this file
 * maps a scene object back to a cast member by the ROOT'S NAME (`player.intro-<id>`,
 * `player.js:198`), never by the label — but the printed rows are read by a human and two `SAM`s
 * in a failure message help nobody.
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
 * animated "whoever is nearest the lens" would pass. They are also the two the sweeping talk
 * camera cannot hold in one shot, which is exactly why AB2/AB3 read bones — no camera needed —
 * and only AB4b waits for anybody to be on screen.
 */
const NOMINATOR = 'p2';
const ACCUSED = 'p6';

/**
 * `reactorSeats()` from `intro-bed.js`, restated rather than imported. **Deliberate.** Importing
 * it would make this gate agree with the bed by construction: if the stride changed, the control
 * would silently move to whatever the new answer was and would keep passing. Restating it means a
 * change to who gasps trips AB5 here and has to be looked at. The rule is public by design (the
 * bed's own header: picks derive from SEAT INDICES so watching who reacts cannot leak a role).
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

/** A chair that is neither accused, nor accuser, nor asked to gasp. Resolved below against CAST. */
const BYSTANDER = (() => {
  const seatOf = (id) => CAST.find((c) => c.id === id).seat;
  const react = new Set(reactorSeatsHere(CAST.length, seatOf(ACCUSED), seatOf(NOMINATOR)));
  const busy = new Set([seatOf(ACCUSED), seatOf(NOMINATOR), ...react]);
  const c = CAST.find((x) => !busy.has(x.seat));
  return c ? c.id : 'p1';
})();

const NOMS_CUE = { kind: 'noms', standing: [{ nominator: NOMINATOR, target: ACCUSED }] };
const INTROS_CUE = { kind: 'intros', cast: CAST, talk: true };

/* ==============================================================================================
 * WHAT IS MEASURED, per robot, in ONE evaluate:
 *
 *   root        world position of `player.intro-<id>` — where the body IS
 *   bones       every bone under that root, world position MINUS the root's, so the numbers
 *               describe the POSE and not the placement. Keyed by name so two snapshots can be
 *               differenced bone by bone regardless of traverse order.
 *   action      the seated PERFORMANCE name, via the chain in the header (not `clip`, which is
 *               the resting pose and stays `Chair_Sit_Idle_M` throughout by design)
 *   tag         the `headName` sprite: label, skin, screen rect, and the mean RGB of its pixels
 *               straight out of the GL buffer
 *   bang        is the old red `!` lit — the receipt that the noms cue actually arrived
 *   sim         `engine.elapsed`, so every sample can be placed on the SHOW's clock
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
   * ⚠️ **THERE IS NO `THREE` ON THE PAGE HANDLE.** `core/engine.js:208` publishes engine /
   * settle / ready / frames / perf / setGrade / freeRun / simState / silhouette / redraw and
   * nothing else. Importing the module here would put a SECOND copy of THREE in the page, which
   * is its own class of bug. `circle-staging.mjs` solved this and the solution is inherited: take
   * a real `Vector3` off an object that already has one — every Object3D's `.position` is one,
   * with every method needed — and clone it.
   */
  const V = () => cam.position.clone();

  /** Routes 1 and 2 of the header's chain; both are per-room and read once. */
  const named = (() => {
    const out = { rows: null, performing: null, via: null };
    try {
      const acc = window.__rrrFollow?.accusation?.() ?? window.__rrr?.accusationReport?.();
      if (acc && Array.isArray(acc.performing)) { out.performing = acc.performing.map(String); out.via = 'accusationReport'; }
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

    const fromRows = named.rows ? named.rows[id] ?? null : null;
    out.push({
      id,
      root: [+rootV.x.toFixed(4), +rootV.y.toFixed(4), +rootV.z.toFixed(4)],
      boneCount,
      bones,
      hipsY: bones.Hips ? bones.Hips[1] : null,
      headY: bones.Head ? bones.Head[1] : null,
      /** The PERFORMANCE, not the resting pose. See the header on `seatedAction` vs `clip`. */
      action: fromRows ?? stamp ?? null,
      actionVia: fromRows != null ? 'sitReport' : (stamp != null ? 'userData' : null),
      /** Route 1 can only say WHETHER a chair is performing, not what it is playing. Both help. */
      performing: named.performing ? named.performing.includes(id) : null,
      tag,
      bang,
    });
  }

  return {
    sim: +(eng.elapsed ?? 0).toFixed(3),
    frame: eng.frame,
    canvas: [CW, CH],
    cam: [+cam.position.x.toFixed(2), +cam.position.y.toFixed(2), +cam.position.z.toFixed(2)],
    nameChannel: named.via,
    robots: out,
  };
};

/** `engine.elapsed` only — a cheap poll, so waiting on the sim clock costs no readPixels. */
const SIMCLOCK = () => (window.__rrr?.engine?.elapsed ?? null);

/**
 * The quiet channel. `mesh-avatar.js` freezes these four through the seated idle and re-applies
 * them after the mixer, so in the idle they do not move at all; Neck/Head ride them. A stand-up
 * cannot happen without this set moving, and nothing else in the circle moves it.
 */
const TORSO = ['Hips', 'Spine', 'Spine01', 'Spine02', 'Spine03', 'Neck', 'Head'];

/** Largest bone displacement between two snapshots of one robot — all bones, and torso only. */
function motionOf(a, b) {
  if (!a || !b) return null;
  let boneMax = 0; let worst = null; let torsoMax = 0;
  for (const [name, pa] of Object.entries(a.bones)) {
    const pb = b.bones[name];
    if (!pb) continue;
    const d = Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]);
    if (d > boneMax) { boneMax = d; worst = name; }
    if (TORSO.includes(name) && d > torsoMax) torsoMax = d;
  }
  const rootMove = Math.hypot(b.root[0] - a.root[0], b.root[1] - a.root[1], b.root[2] - a.root[2]);
  return {
    bone: +boneMax.toFixed(4),
    worstBone: worst,
    torso: +torsoMax.toFixed(4),
    root: +rootMove.toFixed(4),
    /* "Stood up and stepped forward" must count as standing up, so placement counts too. */
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

  // The bake is the slow part (70–140 s under swiftshader, and it swings). Wait on the engine's
  // own ready flag, never a stopwatch.
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
   * AB0c · both cues are legal BEFORE either is posted. `cueViolations` is the same closed
   * allow-list the iframe enforces at its own door, imported here in bare node — so a typo in
   * this file is a named failure at this line instead of a cue that lands and does nothing.
   */
  const badIntros = cueViolations(INTROS_CUE);
  const badNoms = cueViolations(NOMS_CUE);
  t('AB0c · both cues pass cueViolations before they are posted',
    badIntros.length === 0 && badNoms.length === 0,
    [...badIntros, ...badNoms].join(', ')
      || `noms keys: ${CUE_NOM_KEYS.join(', ')} · ${NOMINATOR} accuses ${ACCUSED}, control ${BYSTANDER}`);

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
   * that rig; on the `unit4h` fallback (a failed GLB fetch — `follow-bed.js:858` catches it and
   * the night runs anyway) there are no bones and no clips, and AB2/AB3 would be measuring a body
   * that CANNOT animate. That is a different failure and it must not wear AB2's name.
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
  async function atSim(secs, label) {
    const target = simCue + secs;
    while (Date.now() - wallCue < SIM_CAP_MS) {
      const now = await page.evaluate(SIMCLOCK);
      if (now != null && now >= target) break;
      await sleep(1000);
    }
    const snap = await page.evaluate(SNAP);
    console.log(`  sample ${label}: sim +${(snap.sim - simCue).toFixed(2)}s`
      + ` · wall +${((Date.now() - wallCue) / 1000).toFixed(0)}s`
      + ` · frame ${snap.frame}`);
    return snap;
  }

  /* ---- the accusation --------------------------------------------------------------------- */
  await page.evaluate((cue) => { window.postMessage({ t: 'cue', cue }, '*'); }, NOMS_CUE);

  const flinch = await atSim(AT_FLINCH, `flinch  (+${AT_FLINCH}s)`);
  const settle = await atSim(AT_SETTLE, `settle  (+${AT_SETTLE}s)`);
  let held = await atSim(AT_HELD, `held    (+${AT_HELD}s)`);

  /*
   * AB4b needs the accused's plate ON SCREEN, and the talk camera sweeps the ring continuously, so
   * at any given instant it may not be. Wait for the sweep to bring it round rather than failing a
   * colour check for a reason that has nothing to do with colour. (`held` only moves forward in
   * sim time here, which AB3b is happy with — later is stronger.)
   */
  const ts = Date.now();
  while (Date.now() - ts < 60000 && !byId(held, ACCUSED)?.tag?.onScreen) {
    await sleep(2500);
    held = await page.evaluate(SNAP);
  }
  const simRatio = (held.sim - simCue) / Math.max(0.001, (Date.now() - wallCue) / 1000);

  /* ---- AB1b · did the cue even arrive? ----------------------------------------------------- */
  /*
   * Two independent receipts, and either will do: the old red `!` (`nomBang`, still lit by
   * `setNominees`) and the accusation ink on the plate. Both are set from the SAME `standing[].
   * target` id, so if one of them is on exactly the accused then the cue crossed the channel,
   * reached `follow-bed.cue()`, reached `intro.setNominees()`, and matched the seat id — which
   * means every red line below is a missing performance and not a dropped message.
   *
   * ⚠️ **WHEN THE `!` IS FINALLY DELETED, REPOINT THIS, DO NOT DELETE IT.** Something must keep
   * proving the cue landed, or AB2–AB4 become untrustworthy on the day they go green.
   */
  const marked = (held?.robots ?? []).filter((r) => r.bang || r.tag?.skin).map((r) => r.id);
  t('AB1b · the noms cue reached the circle — the nominee mark landed on exactly the accused',
    marked.length === 1 && marked[0] === ACCUSED,
    marked.length ? `marked: ${marked.join(', ')}` : 'nothing marked — the cue did not land');

  /* ---- the band, measured live from the robots who are not in the scene -------------------- */
  const seatOf = (id) => CAST.find((c) => c.id === id).seat;
  const reactors = new Set(reactorSeatsHere(CAST.length, seatOf(ACCUSED), seatOf(NOMINATOR)));
  const idle = CAST.filter((c) => c.id !== NOMINATOR && c.id !== ACCUSED && !reactors.has(c.seat))
    .map((c) => c.id);
  const mFl = {}; const mSe = {}; const mHe = {};
  for (const c of CAST) {
    mFl[c.id] = motionOf(byId(before, c.id), byId(flinch, c.id));
    mSe[c.id] = motionOf(byId(before, c.id), byId(settle, c.id));
    mHe[c.id] = motionOf(byId(before, c.id), byId(held, c.id));
  }
  const bandOf = (m) => Math.max(...idle.map((id) => m[id]?.motion ?? 0));
  const bandFl = bandOf(mFl); const bandHe = bandOf(mHe);
  const barFl = Math.max(bandFl * BAND_K, MOTION_FLOOR_M);
  const barHe = Math.max(bandHe * BAND_K, MOTION_FLOOR_M);
  const torsoBand = Math.max(...idle.map((id) => mHe[id]?.torso ?? 0));

  console.log(`\n  name channel:  ${held?.nameChannel ?? 'NONE — no instrument can name the pose (see header)'}`);
  console.log(`  sim/wall:      ${simRatio.toFixed(2)}x  (dt is clamped at 0.1s — see the header)`);
  console.log(`  idle band:     ${bandFl.toFixed(4)} m at +${AT_FLINCH}s · ${bandHe.toFixed(4)} m at`
    + ` +${AT_HELD}s, over ${idle.length} uninvolved robots (${idle.join(', ')})`);
  console.log(`  bar to clear:  ${barFl.toFixed(4)} m / ${barHe.toFixed(4)} m`
    + `   (max of band x${BAND_K} and the ${MOTION_FLOOR_M} m floor)`);
  console.log(`  torso band:    ${torsoBand.toFixed(4)} m — the frozen seated torso, for contrast\n`);

  const role = (c) => (c.id === NOMINATOR ? 'NOMINATOR'
    : c.id === ACCUSED ? 'ACCUSED'
      : c.id === BYSTANDER ? 'control'
        : reactors.has(c.seat) ? 'reactor' : '');
  console.log('   id  name    role       performance              move@fl  move@set  move@held   torso   hips   skin');
  for (const c of CAST) {
    const r = byId(held, c.id);
    const n = (x) => String((x ?? 0).toFixed(4)).padStart(8);
    console.log(`   ${c.id} ${String(c.name).padEnd(7)} ${role(c).padEnd(10)}`
      + ` ${String(r?.action ?? (r?.performing ? '(performing)' : '—')).padEnd(24)}`
      + `${n(mFl[c.id]?.motion)}${n(mSe[c.id]?.motion)}${n(mHe[c.id]?.motion)}${n(mHe[c.id]?.torso)}`
      + `${String((mHe[c.id]?.hipsRise ?? 0).toFixed(3)).padStart(7)}   ${r?.tag?.skin || '—'}`);
  }
  console.log('');

  /* ---- AB2 · the nominator stands up -------------------------------------------------------- */
  const nomBest = Math.max(mFl[NOMINATOR]?.motion ?? 0, mSe[NOMINATOR]?.motion ?? 0, mHe[NOMINATOR]?.motion ?? 0);
  t('AB2 · the NOMINATOR left the seated pose — somebody moved when the accusation landed',
    nomBest > barHe,
    `moved ${nomBest.toFixed(4)} m against a ${barHe.toFixed(4)} m bar`
      + ` · worst bone ${mHe[NOMINATOR]?.worstBone ?? '—'}`);

  /*
   * ⚠️ **AB2b IS THE HALF THAT A WAVE PASSES AND SHOULD NOT.** "Stood up" is not "moved" — the
   * pelvis has to leave the cushion, and the seated torso is frozen by construction so this
   * channel is silent until it does. `Sit_to_Stand_Transition_M` is measured off the GLB at
   * +0.251 m of hips rise (`chair-seats.js` `SEATED_CLIPS_LEAVE_CHAIR`); the bar is 0.10.
   */
  const nomRise = Math.max(mFl[NOMINATOR]?.hipsRise ?? 0, mSe[NOMINATOR]?.hipsRise ?? 0, mHe[NOMINATOR]?.hipsRise ?? 0);
  t('AB2b · …and actually STOOD — the pelvis came up off the cushion',
    nomRise >= STAND_RISE_M,
    `hips rose ${nomRise >= 0 ? '+' : ''}${nomRise.toFixed(3)} m, bar ${STAND_RISE_M} m`
      + ` (the stand clip measures +0.251 m); torso moved ${(mHe[NOMINATOR]?.torso ?? 0).toFixed(4)} m`
      + ` against an idle torso band of ${torsoBand.toFixed(4)} m`);

  /*
   * AB2c · …and the show can NAME what it is playing. Split from AB2/AB2b on purpose: a red AB2
   * with a green AB2c means the label lies; a green AB2 with a red AB2c means the animation is
   * real and no instrument can see which one it is. Different bugs, different owners.
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
        : 'no performance name readable from the page — forward intro-bed\'s accusationReport()/'
          + 'sitReport() through follow-bed to window.__rrrFollow (see header)'));

  /* ---- AB3 · the accused reacts, and HOLDS -------------------------------------------------- */
  const accFl = mFl[ACCUSED]; const accSe = mSe[ACCUSED]; const accHe = mHe[ACCUSED];
  t('AB3 · the ACCUSED reacted inside the flinch window',
    (accFl?.motion ?? 0) > barFl,
    `moved ${(accFl?.motion ?? 0).toFixed(4)} m by sim +${AT_FLINCH}s`
      + ` (FLINCH fires at ${0.4}s) against a ${barFl.toFixed(4)} m bar`);

  /*
   * ⚠️ **AB3b IS THE HALF A ONE-SHOT PASSES AND SHOULD NOT.** A flinch that plays once and
   * crossfades straight home satisfies AB3 and is not what was designed: the accused SETTLES into
   * a posture and keeps it. The sample is a full `Chair_Sit_Idle_M` loop past `ACCUSE.SETTLE`, so
   * a pose that has quietly let go has had every opportunity to be caught doing it.
   */
  t('AB3b · …and is STILL out of the seated idle a full sit-loop later — the posture is HELD',
    (accHe?.motion ?? 0) > barHe,
    `${(accFl?.motion ?? 0).toFixed(4)} → ${(accSe?.motion ?? 0).toFixed(4)}`
      + ` → ${(accHe?.motion ?? 0).toFixed(4)} m at sim +${AT_FLINCH}/${AT_SETTLE}/${AT_HELD}s,`
      + ` bar ${barHe.toFixed(4)} m`);

  const accActSe = byId(settle, ACCUSED)?.action ?? null;
  const accActHe = byId(held, ACCUSED)?.action ?? null;
  t('AB3c · …under a named performance, the same one at both samples',
    !!accActHe && accActHe !== SIT_IDLE_SHIP && accActSe === accActHe
      && SEATED_REACTION_CLIPS.includes(accActHe),
    accActHe ? `+${AT_SETTLE}s "${accActSe}" → +${AT_HELD}s "${accActHe}"` : 'no performance name readable — see AB2c');

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
   * AB4b · …and it reaches the television. Compared INSIDE ONE FRAME against the seven others —
   * see the header; a baseline captured seconds earlier drifts with the sweeping camera and makes
   * plates "change" that did not. The seven others' own spread in that frame is folded into the
   * bar, so a run where the lighting is odd raises its own threshold.
   */
  const shownOthers = otherTags.filter((r) => r.tag.onScreen && r.tag.rgb);
  const ref = meanRgb(shownOthers);
  const spread = ref ? Math.max(0, ...shownOthers.map((r) => dist3(r.tag.rgb, ref))) : 0;
  const gap = (accTag?.rgb && ref) ? dist3(accTag.rgb, ref) : null;
  t('AB4b · …and that colour reaches the television, next to seven that are not',
    gap != null && gap > Math.max(PLATE_GAP, spread * 2),
    gap != null
      ? `accused rgb ${accTag.rgb.map((c) => c.toFixed(0)).join(',')} vs room mean `
        + `${ref.map((c) => c.toFixed(0)).join(',')} — gap ${gap.toFixed(1)}, bar `
        + `${Math.max(PLATE_GAP, spread * 2).toFixed(1)} (room spread ${spread.toFixed(1)}, `
        + `${shownOthers.length} plates in frame)`
      : (accTag && !accTag.onScreen
        ? 'the accused\'s plate never came round into shot — the sweep, not the colour'
        : 'no plate pixels'));

  /* ---- AB5 · the control -------------------------------------------------------------------- */
  /*
   * ⚠️ **THE ONE THAT IS SUPPOSED TO BE GREEN EVEN ON A BROKEN BUILD.** Without it a beat that
   * stood all eight robots up would sail through AB2 and AB3, and "everybody reacted" is not a
   * staged accusation. It is also the calibration: `STILL_M` is what a robot doing nothing
   * measures. The chair is chosen above to be none of accused / accuser / the two reactors.
   */
  const byM = mHe[BYSTANDER];
  const byAct = byId(held, BYSTANDER)?.action ?? null;
  t('AB5 control · a robot who is neither accuser, accused nor reactor never left the seated idle',
    !!byM && byM.motion < STILL_M && byM.torso < STAND_RISE_M
      && (byAct == null || byAct === SIT_IDLE_SHIP),
    byM
      ? `${BYSTANDER} (seat ${seatOf(BYSTANDER)}) moved ${byM.motion.toFixed(4)} m`
        + ` (ceiling ${STILL_M}), torso ${byM.torso.toFixed(4)} m · performance ${byAct ?? 'none'}`
      : 'the control is not in the circle');

  await writeFile(path.join(SHOTDIR, 'accusation.json'), JSON.stringify({
    nominator: NOMINATOR, accused: ACCUSED, bystander: BYSTANDER, reactors: [...reactors],
    nameChannel: held?.nameChannel ?? null,
    sim: { cue: simCue, flinch: flinch.sim, settle: settle.sim, held: held.sim, ratio: simRatio },
    band: { flinch: bandFl, held: bandHe, barFl, barHe, torsoBand },
    motion: { flinch: mFl, settle: mSe, held: mHe },
    raw: { before, flinch, settle, held },
    tags: (held?.robots ?? []).map((r) => ({ id: r.id, action: r.action, ...r.tag })),
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
 * FIRST RUN (before this file sampled on the sim clock — the run that found the dt clamp):
 *   slept 2.5 / 6.5 / 12.5 s of WALL time and called the last one "ten seconds later". The
 *   accused measured 0.008 → 0.268 → 0.771 m on a smooth ramp, which reads as a settle arriving
 *   late; it was really the flinch still crossfading in, because 12.5 s of wall bought ~1.2 s of
 *   show. `core/engine.js:337` clamps dt to 0.1 s and swiftshader renders the ballroom at a few
 *   frames a second. Everything now waits on `engine.elapsed`. **Any browser probe in this repo
 *   that reasons about a beat's timing on `sleep()` is measuring the frame rate, not the beat.**
 *
 * The same run measured the numbers the thresholds are built on, with no accusation anywhere near
 * the six uninvolved robots:
 *   · idle hands/feet drift up to 0.133 m over the interval — hence the LIVE band, not a constant
 *   · idle hips move ±0.005 m and idle heads 0.007 m — the frozen torso, 25x quieter, hence AB2b
 *   · the accused's plate read 116,79,81 against a room mean of 60,93,117: gap 67.8 on a bar of
 *     26.9, with the seven unaccused plates spread 13.4 among themselves
 *
 * ⚠️ NOT WIRED INTO `gates:party` BY THIS BRANCH — `package.json` belongs to another agent this
 * round, and `seated-actions.mjs` carries the same note. Add all three accusation gates to the
 * chain when merging.
 * ============================================================================================ */
