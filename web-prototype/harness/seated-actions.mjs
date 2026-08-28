#!/usr/bin/env node
/**
 * 🎬 **seated-actions — THE CIRCLE CAN PERFORM, AND THE CLIPS WERE ALWAYS IN THE BOX.**
 *
 *   node harness/seated-actions.mjs
 *
 * The Reckoning announces a nomination with a red `!` sprite over a head. It reads as
 * "something is up" and never as WHAT. `public/models/anim/friendly_all38.glb` — the body every
 * seated twin already loads — carries 38 clips, 13 of them seated performances, and
 * `mesh-avatar.js` has kept ALL of them in `byName` since it was written while giving exactly
 * one (`Chair_Sit_Idle_M`) a `clipAction`. The fix was a `mixer.clipAction()` call. This gate is
 * what stops it silently coming apart again.
 *
 * THE THREE THINGS THAT WERE ACTUALLY WRONG WITH THE UNUSED CLIPS, all measured here:
 *
 *  1. **Ten of the eleven are authored on a different chair.** Their opening hips sit up to
 *     0.34 m INWARD of Idle_M's and 8 cm lower. Local +Z is inward, so played raw the robot
 *     slides 0.15 m past the front edge of a 0.55 m cushion and sinks into the seat — the exact
 *     sunk / slid-off class the sit attach (`SIT_IN` 0.34) was tuned to kill. A4/A5/A6.
 *  2. **Three of them do not stay in the chair.** Both `Sit_to_Stand_Transition_*` are honest
 *     stand-ups that END standing, and `Angry_To_Tantrum_Sit` STARTS standing and throws itself
 *     on the floor (0.67 m of hips travel). They are on the allow-list because they are real
 *     clips John listed; A7 is the record that two of them leave the seat on purpose and the
 *     third cannot be played in the circle at all.
 *  3. **Three of them do not close their own loop** (up to 106.8° between first and last
 *     keyframe), so `hold: true` has to clamp the final frame for those and may only loop the
 *     other eight. A3.
 *
 * THREE-free / browser-free so it can live on `gates:party` (CI has no `npm install`): it reads
 * the GLB's JSON + BIN chunks directly and asserts the maths from `src/game/chair-seats.js`.
 * `mesh-avatar.js` imports THREE, so the parts of the contract that live in the rig are checked
 * against its SOURCE — the same way `_sit_in_chair.mjs` S11/S12 guard the sit.
 *
 * ⚠️ NOT WIRED INTO `gates:party` BY THIS BRANCH — `package.json` belongs to another agent this
 * round. Add `&& node harness/seated-actions.mjs` to the chain when merging.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SEATED_REACTION_CLIPS, SEATED_CLIPS_LEAVE_CHAIR, seatedReactionAllowed,
  SEATED_ANCHOR_TOL, seatedAnchorDelta, seatedClipLoops, SEATED_LOOP_DEG, SEATED_LOOP_DRIFT,
  seatedPelvisFromHips, assertSeatedPose, SIT_CLIP_ALLOW, SIT_IDLE_SHIP, ARMATURE_M,
  SEAT_MAX, seatCircleRadius,
} from '../src/game/chair-seats.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const BODY = join(ROOT, '..', 'public', 'models', 'anim', 'friendly_all38.glb');
const AVATAR = join(ROOT, '..', 'src', 'characters', 'mesh-avatar.js');

let pass = 0, fail = 0;
const t = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); }
  return c;
};

/* ── the GLB, read by hand: JSON chunk, BIN chunk, one accessor at a time ─────────────── */

function glb(path) {
  if (!existsSync(path)) return { error: `${path} is not on disk` };
  const buf = readFileSync(path);
  if (buf.length < 20 || buf.toString('ascii', 0, 4) !== 'glTF') return { error: 'not a GLB' };
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen;
  const binLen = buf.readUInt32LE(binStart);
  return { json, bin: buf.subarray(binStart + 8, binStart + 8 + binLen) };
}

function readAccessor(g, i) {
  const acc = g.json.accessors[i];
  const view = g.json.bufferViews[acc.bufferView];
  const start = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const comp = acc.type === 'VEC3' ? 3 : acc.type === 'VEC4' ? 4 : 1;
  const n = acc.count * comp;
  const slice = g.bin.subarray(start, start + n * 4);
  return { comp, count: acc.count, v: new Float32Array(slice.buffer, slice.byteOffset, n) };
}

const nodeIndex = (g, name) => (g.json.nodes || []).findIndex((n) => n.name === name);
const clipOf = (g, name) => (g.json.animations || []).find((a) => a.name === name) || null;

/** Every Hips.translation keyframe of a clip, METRES (armature scale 0.01). */
function hipsFrames(g, name) {
  const anim = clipOf(g, name);
  const hip = nodeIndex(g, 'Hips');
  if (!anim || hip < 0) return null;
  const ch = anim.channels.find((c) => c.target.node === hip && c.target.path === 'translation');
  if (!ch) return null;
  const o = readAccessor(g, anim.samplers[ch.sampler].output);
  const out = [];
  for (let k = 0; k < o.count; k++) {
    out.push({ x: o.v[k * 3] * ARMATURE_M, y: o.v[k * 3 + 1] * ARMATURE_M, z: o.v[k * 3 + 2] * ARMATURE_M });
  }
  return out;
}

/** Largest first-vs-last keyframe angle over every rotation channel, degrees. */
function loopSpread(g, name) {
  const anim = clipOf(g, name);
  if (!anim) return null;
  let deg = 0, worst = '';
  for (const ch of anim.channels) {
    if (ch.target.path !== 'rotation') continue;
    const o = readAccessor(g, anim.samplers[ch.sampler].output);
    if (o.count < 2) continue;
    const i = (o.count - 1) * 4;
    let dot = 0;
    for (let k = 0; k < 4; k++) dot += o.v[k] * o.v[i + k];
    const d = 2 * Math.acos(Math.min(1, Math.abs(dot))) * 180 / Math.PI;
    if (d > deg) { deg = d; worst = (g.json.nodes[ch.target.node] || {}).name || '?'; }
  }
  return { deg, worst };
}

/** One chair on the live circle, so the pelvis question is asked about a real seat. */
function seatAt(index, count, shortAxis = 15.3) {
  const n = Math.min(SEAT_MAX, Math.max(1, count));
  const radius = seatCircleRadius(n, shortAxis);
  const ang = (index / n) * Math.PI * 2;
  return {
    chair: {
      x: Math.sin(ang) * radius, y: 0, z: Math.cos(ang) * radius,
      boxW: 0.50, boxD: 0.55, boxH: 1.55,
    },
    cx: 0, cz: 0,
  };
}

console.log('\nseated-actions — the circle performs with clips that already shipped\n');

const g = glb(BODY);
const clipNames = g.error ? [] : (g.json.animations || []).map((a) => a.name);

t('A0 · friendly_all38.glb is on disk and still carries its 38 clips',
  !g.error && clipNames.length >= 38, g.error || `${clipNames.length} clips`);

/* ── A1/A2 · the allow-list is a closed set, and it is the only door ──────────────────── */
{
  const uniq = new Set(SEATED_REACTION_CLIPS);
  t('A1 · SEATED_REACTION_CLIPS is a frozen list of 11 unique names',
    Object.isFrozen(SEATED_REACTION_CLIPS) && SEATED_REACTION_CLIPS.length === 11
    && uniq.size === 11,
    `${SEATED_REACTION_CLIPS.length} names, ${uniq.size} unique`);

  const absent = SEATED_REACTION_CLIPS.filter((n) => !clipNames.includes(n));
  t('A1a · every listed clip is really in the shipped body',
    !g.error && absent.length === 0, absent.join(', ') || 'all 11 present');

  const overlap = SEATED_REACTION_CLIPS.filter((n) => SIT_CLIP_ALLOW.includes(n));
  t('A1b · a performance is never one of the seat RESTING clips',
    overlap.length === 0, overlap.join(', ') || `disjoint from ${SIT_CLIP_ALLOW.length} sit clips`);

  t('A2 · every listed name is allowed',
    SEATED_REACTION_CLIPS.every(seatedReactionAllowed));
  /*
   * The reaction a phone asks for comes off the wire, so the refusal path is the product rule,
   * not a nicety: an unlisted name must return false and leave the seat exactly as it was.
   * Same closed-set shape as `react-pad` R5 ("an invented reaction is refused").
   */
  const smuggled = ['', ' ', null, undefined, 0, 'LAUGH', 'sit_cross_legged', 'Sit_and_Drink',
    'Sit_Thumbs_Up_Right', 'Walking', SIT_IDLE_SHIP, 'Stand_to_Sit_Transition_M'];
  const leaked = smuggled.filter((n) => seatedReactionAllowed(n));
  t('A2a · an invented, mis-cased or merely-adjacent clip name is refused',
    leaked.length === 0, leaked.map(String).join(', ') || `${smuggled.length} refused, none threw`);
}

/* ── A3 · loop or clamp, decided on measurement ───────────────────────────────────────── */
if (!g.error) {
  const rows = SEATED_REACTION_CLIPS.map((name) => {
    const spread = loopSpread(g, name);
    const f = hipsFrames(g, name);
    const drift = f && f.length > 1
      ? Math.hypot(f[f.length - 1].x - f[0].x, f[f.length - 1].y - f[0].y, f[f.length - 1].z - f[0].z)
      : 0;
    return { name, deg: spread?.deg ?? 0, worst: spread?.worst, drift, loops: seatedClipLoops({ endQuatDeg: spread?.deg ?? 0, endDrift: drift }) };
  });
  const CLAMP = ['Sit_on_Chair_Arms_Crossed', 'Sit_to_Stand_Transition_M', 'Sit_to_Stand_Transition_F'];
  const wrong = rows.filter((r) => r.loops === CLAMP.includes(r.name));
  t('A3 · eight clips close their own loop; the three that do not must clamp their last frame',
    wrong.length === 0,
    wrong.map((r) => `${r.name} ${r.deg.toFixed(1)}deg`).join(', ')
      || rows.filter((r) => !r.loops).map((r) => `${r.name} ${r.deg.toFixed(1)}deg@${r.worst}`).join(' · '));

  const gap = Math.min(...rows.filter((r) => !r.loops).map((r) => r.deg))
    - Math.max(...rows.filter((r) => r.loops).map((r) => r.deg));
  t('A3a · the thresholds sit in an empty gap, not on top of a clip',
    gap > 30 && SEATED_LOOP_DEG > Math.max(...rows.filter((r) => r.loops).map((r) => r.deg))
    && SEATED_LOOP_DRIFT > 0,
    `${gap.toFixed(1)} deg of daylight around the ${SEATED_LOOP_DEG} deg line`);
}

/* ── A4/A5/A6 · the different-chair anchor, and the pelvis it puts off the cushion ────── */
if (!g.error) {
  const idle = hipsFrames(g, SIT_IDLE_SHIP);
  t('A4 · Idle_M still opens where the sit attach thinks it does',
    !!idle && Math.abs(idle[0].z + 0.248) < 0.01 && Math.abs(idle[0].y - 0.535) < 0.01,
    idle ? `hips(${idle[0].x.toFixed(3)}, ${idle[0].y.toFixed(3)}, ${idle[0].z.toFixed(3)})` : 'no hips track');

  const rows = SEATED_REACTION_CLIPS.map((name) => {
    const f = hipsFrames(g, name);
    const delta = seatedAnchorDelta(idle[0], f[0]);
    return { name, frames: f, delta, off: Math.hypot(delta.y, delta.z) };
  });
  const needFix = rows.filter((r) => r.off >= SEATED_ANCHOR_TOL);
  t('A4a · ten of the eleven are authored on a different chair and need the anchor fix',
    needFix.length === 10 && !needFix.some((r) => r.name === 'Sitting_Answering_Questions'),
    `worst Δ ${Math.max(...rows.map((r) => r.off)).toFixed(3)} m · the one that agrees is `
      + rows.filter((r) => r.off < SEATED_ANCHOR_TOL).map((r) => r.name).join(', '));

  /*
   * THE BAD POSE IS AN EXPLICIT FIXTURE. `_sit_in_chair.mjs` learned this the hard way: a
   * harness that only feeds `expectedPelvis` back to `assertSeatedPose` passes with a wrong
   * attach. So: the RAW clip must fail, and only then does the corrected one prove anything.
   */
  const seat = seatAt(0, 8);
  const raw = needFix.filter((r) => {
    const p = seatedPelvisFromHips(seat.chair, seat.cx, seat.cz, r.frames[0]);
    return !assertSeatedPose({
      seated: true, seatIndex: 0, pelvis: p, chair: seat.chair, clip: r.name,
      cx: seat.cx, cz: seat.cz, allowReactions: true,
    }).ok;
  });
  t('A5 · played raw, every one of those ten fails the seated-pose check (fixture: must fail)',
    raw.length === needFix.length,
    `${raw.length}/${needFix.length} rejected off the cushion`);

  for (const count of [4, 8]) {
    const s = seatAt(count - 1, count);
    const bad = rows.filter((r) => {
      const fixed = { x: 0, y: r.frames[0].y + r.delta.y, z: r.frames[0].z + r.delta.z };
      const p = seatedPelvisFromHips(s.chair, s.cx, s.cz, fixed);
      return !assertSeatedPose({
        seated: true, seatIndex: count - 1, pelvis: p, chair: s.chair, clip: r.name,
        cx: s.cx, cz: s.cz, allowReactions: true,
      }).ok;
    });
    t(`A6 · with the anchor fix all 11 open on the cushion · N=${count}`,
      bad.length === 0, bad.map((r) => r.name).join(', ') || 'every opening frame seated');
  }

  /* ── A7 · the whole clip, not just its opening frame ──────────────────────────────── */
  const s8 = seatAt(3, 8);
  /*
   * `towardCentreMin` 0.04 rather than the resting attach's 0.05, and this is the one place
   * that lowers it. A LEAN-BACK MOVES THE HIPS BACK — that is what leaning back is — and
   * `Sit_Hands_on_Head_Lean_Back` (5 frames of 116) and `Sit_Dodge` (2 of 214) land 7 mm short
   * of a proxy tuned on a robot sitting still, with 0.23 m of clear air still between the
   * pelvis and the splat. A7a pins that measurement so a clip that genuinely slides into the
   * backrest — 0.3 m past this line — still fails.
   */
  const LEAN_MIN = 0.04;
  const badFrames = (r, towardCentreMin) => {
    let bad = 0;
    for (const f of r.frames) {
      const fixed = { x: 0, y: f.y + r.delta.y, z: f.z + r.delta.z };
      const p = seatedPelvisFromHips(s8.chair, s8.cx, s8.cz, fixed);
      if (!assertSeatedPose({
        seated: true, seatIndex: 3, pelvis: p, chair: s8.chair, clip: r.name,
        cx: s8.cx, cz: s8.cz, allowReactions: true, towardCentreMin,
      }).ok) bad++;
    }
    return bad;
  };
  const stays = rows.filter((r) => !SEATED_CLIPS_LEAVE_CHAIR.includes(r.name));
  const leaves = rows.filter((r) => SEATED_CLIPS_LEAVE_CHAIR.includes(r.name));
  const drifted = stays.filter((r) => badFrames(r, LEAN_MIN) > 0);
  t('A7 · the eight chair-safe performances keep the pelvis on the cushion for their whole length',
    drifted.length === 0 && stays.length === 8,
    drifted.map((r) => `${r.name} ${badFrames(r, LEAN_MIN)} frames`).join(', ')
      || `${stays.length} clips, every frame, ${stays.reduce((n, r) => n + r.frames.length, 0)} in all`);

  const leaners = stays.filter((r) => badFrames(r, 0.05) > 0).map((r) => r.name).sort();
  t('A7a · exactly two of them lean back far enough to touch the RESTING attach\'s 0.05 m proxy',
    leaners.join(' ') === 'Sit_Dodge Sit_Hands_on_Head_Lean_Back',
    leaners.join(', ') || 'none — a clip stopped leaning, or the anchor moved');

  const parked = leaves.filter((r) => badFrames(r, LEAN_MIN) === 0);
  t('A7b · the three that LEAVE the chair are recorded as leaving it, not quietly shipped',
    parked.length === 0 && leaves.length === 3,
    leaves.map((r) => `${r.name} ${badFrames(r, LEAN_MIN)}/${r.frames.length} frames off-seat`).join(' · '));

  const tantrum = rows.find((r) => r.name === 'Angry_To_Tantrum_Sit');
  const lowest = Math.min(...tantrum.frames.map((f) => f.y + tantrum.delta.y));
  t('A7c · Angry_To_Tantrum_Sit is not a seated clip at all — it ends up on the FLOOR',
    lowest < 0.0,
    `anchored pelvis reaches y ${lowest.toFixed(3)} m · do not put it in the circle`);
}

/* ── A8 · the rig side of the contract, read off the source (THREE cannot load here) ──── */
{
  const src = readFileSync(AVATAR, 'utf8');
  t('A8 · playSeated(clipName, { hold = false, fade = 0.25 }) is on the sit-capable rig',
    /playSeated\(clipName, \{ hold = false, fade = 0\.25 \} = \{\}\) \{/.test(src));
  t('A8a · it is a no-op returning false when the avatar is not seated',
    /playSeated[\s\S]{0,220}?if \(pose !== 'sit' \|\| !sitIdle\) return false;/.test(src));
  t('A8b · nothing unlisted reaches mixer.clipAction',
    /if \(!seatedReactionAllowed\(name\)\) return false;/.test(src)
    && /seatedReactionAllowed/.test(src) && !/SEATED_REACTION_CLIPS = \[/.test(src));
  t('A8c · a body without the clip (the Lumi fallback) returns false instead of throwing',
    /const entry = reactionEntry\(name\);\s*\n\s*if \(!entry\) return false;/.test(src)
    && /clipNamed\(name\) \{ return byName\.get/.test(src));
  t('A8d · hold picks LoopRepeat only when the clip closes its own loop, else clamps',
    /clampWhenFinished = true/.test(src)
    && /const looping = reactHold && entry\.loops;/.test(src)
    && /setLoop\(looping \? THREE\.LoopRepeat : THREE\.LoopOnce/.test(src));
  t('A8e · a once-through performance blends home to the seated idle over `fade`',
    /reactAmt = reactOut \? Math\.max\(0, reactAmt - step\) : Math\.min\(1, reactAmt \+ step\);/.test(src)
    && /const step = dt \/ reactFade;/.test(src));
  t('A8f · the different-chair anchor is applied, scaled by the crossfade',
    /hips\.position\.y \+= reactAnchor\.y \* reactAmt;/.test(src)
    && /hips\.position\.z \+= reactAnchor\.z \* reactAmt;/.test(src)
    && /seatedAnchorDelta\(idleOpen, entry\.open\)/.test(src));
  /*
   * The upright freeze is why `Chair_Sit_Idle_M` does not fold forward every 10.7 s. It is also
   * why a performance would be invisible from the waist up if it stayed on — `Sit_Hands_on_Head_
   * Lean_Back` is entirely spine. It has to be handed back over the same fade, not switched.
   */
  t('A8g · the torso freeze lets go for the performance and is slerped back, not snapped',
    /applyLean\(strength = 1\)/.test(src) && /applyLean\(1 - reactAmt\)/.test(src)
    && /row\.bone\.quaternion\.slerp\(row\.q, strength\)/.test(src));
  t('A8h · a new performance and a new sit both cancel the old one',
    /function clearReaction\(\)/.test(src)
    && /clearReaction\(\);\s*\n\s*sitIdle\.setEffectiveWeight\(1\);\s*\n\s*sitIdle\.time = SIT_UPRIGHT_T;/.test(src));

  /* Regression net for the two sit findings this change ran straight through the middle of. */
  t('A8i · playSit still skips the stand-to-sit transition (legs through the chair)',
    /sitIdle = sitIdleM \|\| sitIdleF/.test(src) && /Always skip the stand-to-sit/.test(src)
    && !/seatIndex % 2/.test(src));
  t('A8j · SIT_UPRIGHT_T is still captured off the idle, not off a reaction pose',
    /SIT_UPRIGHT_T = 0/.test(src)
    && /clearReaction\(\);[\s\S]{0,200}?mixer\.update\(0\);\s*\n\s*captureLean\(\);/.test(src));
  t('A8k · the seat RESTING clip and the performance stay separate questions',
    /get seatedAction\(\) \{ return reactName; \}/.test(src)
    && /if \(pose === 'sit'\) return sitClipName \|\| \(sitIdle\?\.getClip\?\.\(\)\.name \?\? 'sit'\);/.test(src));
}

console.log(`\nseated-actions: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
