#!/usr/bin/env node
/**
 * sit-in-chair — each cast robot logically sits, pelvis on the cushion, seated clip playing.
 *
 *   node harness/_sit_in_chair.mjs
 *
 * THREE-free / browser-free so it can live on `gates:party` (CI has no `npm install`).
 * It reads clip names AND Hips.translation means out of the GLB JSON chunk, then asserts
 * sit-attach maths from `src/game/chair-seats.js` for N = 4 and N = 8.
 *
 * John's live shot (one twin sunk into the cushion, one standing on the floor in front)
 * is a fixture that MUST fail. The old harness fed `expectedPelvis` to `assertSeatedPose`,
 * so a wrong attach still passed. Bad poses are now explicit; a correct Idle_M attach
 * still has to pass.
 *
 * Fail notes are one line per seat so a red CI log is a punch list, not a stack.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SEAT_MAX, seatCircleRadius, sitIdleClip, sitPhase, sitRootXZ, expectedPelvis,
  seatPoint, assertSeatedPose, SIT_IDLE_CLIPS, SIT_DOWN_CLIPS, SIT_CLIP_ALLOW,
  SIT_IDLE_SHIP, SIT_IN, SIT_HIPS_BACK, SIT_F_HIPS_BACK, SIT_PELVIS_ABOVE,
  SIT_IN_THROUGH_BACK,
  rugSpanForSeats, RUG_CATALOG_SPAN, RUG_OVER_CHAIR,
} from '../src/game/chair-seats.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const ANIM = join(ROOT, '..', 'public', 'models', 'anim');
const BODY = join(ANIM, 'friendly_all38.glb');
const SEATED = join(ANIM, 'friendly_seated20.glb');
const ARMATURE_SCALE = 0.01;

let pass = 0, fail = 0;
const t = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); }
  return c;
};

function glbJson(path) {
  if (!existsSync(path)) return null;
  const buf = readFileSync(path);
  if (buf.length < 20 || buf.toString('ascii', 0, 4) !== 'glTF') {
    return { error: `${path} is not a GLB` };
  }
  const chunkLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + chunkLen).toString('utf8'));
  const binStart = 20 + chunkLen;
  const chunk2Len = buf.readUInt32LE(binStart);
  const bin = buf.subarray(binStart + 8, binStart + 8 + chunk2Len);
  return { json, bin };
}

function glbClipNames(path) {
  const g = glbJson(path);
  if (!g) return null;
  if (g.error) return { error: g.error };
  return (g.json.animations || []).map((a) => a.name);
}

function readAccessor(g, i) {
  const acc = g.json.accessors[i];
  const view = g.json.bufferViews[acc.bufferView];
  const start = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const n = acc.count * (acc.type === 'VEC3' ? 3 : acc.type === 'VEC4' ? 4 : 1);
  const slice = g.bin.subarray(start, start + n * 4);
  return Array.from(new Float32Array(slice.buffer, slice.byteOffset, n));
}

/** Mean Hips.translation for one clip, in metres (armature scale 0.01). */
function hipsMeanM(g, clipName) {
  const nodes = g.json.nodes || [];
  const hipIdx = nodes.findIndex((n) => n.name === 'Hips');
  const anim = (g.json.animations || []).find((a) => a.name === clipName);
  if (hipIdx < 0 || !anim) return null;
  const ch = anim.channels.find((c) => c.target.node === hipIdx && c.target.path === 'translation');
  if (!ch) return null;
  const vals = readAccessor(g, anim.samplers[ch.sampler].output);
  let sx = 0, sy = 0, sz = 0, n = 0;
  for (let k = 0; k + 2 < vals.length; k += 3) {
    sx += vals[k]; sy += vals[k + 1]; sz += vals[k + 2]; n++;
  }
  if (!n) return null;
  return { x: (sx / n) * ARMATURE_SCALE, y: (sy / n) * ARMATURE_SCALE, z: (sz / n) * ARMATURE_SCALE };
}

function seatsFor(n, shortAxis = 15.3) {
  const count = Math.min(SEAT_MAX, Math.max(1, n));
  const radius = seatCircleRadius(count, shortAxis);
  const cx = 0, cz = 0;
  const seats = [];
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    const x = cx + Math.sin(ang) * radius;
    const z = cz + Math.cos(ang) * radius;
    seats.push({
      index: i, x, y: 0, z,
      rotY: Math.atan2(cx - x, cz - z),
      boxW: 0.50, boxD: 0.55, boxH: 1.55,
    });
  }
  return { count, radius, cx, cz, seats };
}

function radialOf(chair, cx, cz) {
  const ox = chair.x - cx, oz = chair.z - cz;
  const len = Math.hypot(ox, oz) || 1;
  return { ux: ox / len, uz: oz / len };
}

console.log('\nsit-in-chair — robots lock onto chairs and SIT\n');

const bodyClips = glbClipNames(BODY);
t('S0 · friendly_all38.glb is on disk with clips',
  Array.isArray(bodyClips) && bodyClips.length >= 30, bodyClips?.error || `${bodyClips?.length ?? 0} clips`);

if (Array.isArray(bodyClips)) {
  const missingIdle = SIT_IDLE_CLIPS.filter((n) => !bodyClips.includes(n));
  const missingDown = SIT_DOWN_CLIPS.filter((n) => !bodyClips.includes(n));
  t('S1 · Chair Sit Idle M/F are in the shipped body',
    missingIdle.length === 0, missingIdle.join(',') || SIT_IDLE_CLIPS.join(', '));
  t('S2 · a sit-down transition is in the shipped body',
    missingDown.length < SIT_DOWN_CLIPS.length,
    missingDown.length ? `missing ${missingDown.join(', ')}` : SIT_DOWN_CLIPS[0]);
}

const seatedClips = existsSync(SEATED) ? glbClipNames(SEATED) : null;
t('S3 · friendly_seated20.glb is present as the seated shopping-list file',
  Array.isArray(seatedClips) && seatedClips.length >= 10,
  seatedClips?.error || `${seatedClips?.length ?? 0} clips`);

const phases = new Set();
for (const n of [4, 6, 8]) {
  const { count, radius, cx, cz, seats } = seatsFor(n);
  const notes = [];
  for (const chair of seats) {
    const clip = sitIdleClip(chair.index);
    const pelvis = expectedPelvis(chair, cx, cz);
    const r = assertSeatedPose({
      seated: true,
      seatIndex: chair.index,
      pelvis,
      chair,
      clip,
      cx, cz,
    });
    if (!r.ok) notes.push(...r.notes);
    phases.add(sitPhase(chair.index));
    const root = sitRootXZ(chair, cx, cz);
    const seat = seatPoint(chair);
    const horiz = Math.hypot(pelvis.x - seat.x, pelvis.z - seat.z);
    if (horiz > 0.16) notes.push(`seat ${chair.index}: pelvis ${horiz.toFixed(3)} m from seat point`);
    const rootIn = Math.hypot(root.x - chair.x, root.z - chair.z);
    if (Math.abs(rootIn - SIT_IN) > 0.02) {
      notes.push(`seat ${chair.index}: sit root ${rootIn.toFixed(3)} m from chair (want SIT_IN ${SIT_IN})`);
    }
    if (clip !== SIT_IDLE_SHIP) {
      notes.push(`seat ${chair.index}: shipped sit is ${SIT_IDLE_SHIP}, got ${clip}`);
    }
  }
  t(`S4 · N=${count} every robot is marked seated with pelvis on the cushion`,
    notes.length === 0 && count === n,
    notes[0] || `r=${radius.toFixed(2)} m · ${count} seats`);
  if (notes.length) {
    for (const line of notes) console.log(`       ${line}`);
  }
  const span = rugSpanForSeats(radius);
  const want = 2 * radius * RUG_OVER_CHAIR;
  t(`S5 · N=${count} rug radius is 1.40 × chair circle radius`,
    span > RUG_CATALOG_SPAN
    && Math.abs(span - want) < 1e-6
    && span === 2 * radius * 1.40,
    `rug ${span.toFixed(2)} m · ring ${radius.toFixed(2)} m · want ${want.toFixed(2)} m`);
}

t('S6 · per-seat idle phases are not all identical',
  phases.size >= 4, `${phases.size} distinct offsets`);
t('S7 · the allow-list only names real Meshy sit clips',
  SIT_CLIP_ALLOW.every((n) => /Sit|sit/.test(n)),
  SIT_CLIP_ALLOW.join(', '));

{
  // `intro-bed` `driveOne` sets sitLock then keeps calling `Player.update`. Facing always
  // reads mv/mlen; they must be declared before the sitLock branch (PR #42 TDZ crash).
  const playerSrc = readFileSync(join(ROOT, '..', 'src', 'game', 'player.js'), 'utf8');
  const updStart = playerSrc.indexOf('update(dt, t, input');
  const facingAt = playerSrc.indexOf('this._targetFacing(mv, mlen, caps)', updStart);
  const upd = facingAt > updStart ? playerSrc.slice(updStart, facingAt) : '';
  const mvAt = upd.indexOf('const mv = input.move');
  const mlenAt = upd.indexOf('let mlen = Math.hypot');
  const sitAt = upd.indexOf('if (this.sitLock)');
  t('S8 · Player.update defines mv/mlen before sitLock so seated facing cannot TDZ',
    updStart >= 0 && facingAt > updStart
    && mvAt >= 0 && mlenAt >= 0 && sitAt > mlenAt && mvAt < sitAt);
  t('S8a · sitLock zeroes gait model offset so a walk-plant cannot shove the sit',
    /if \(this\.sitLock\) \{[\s\S]*?this\.model\.position\.set\(0, 0, 0\)/.test(playerSrc));
}

{
  const { cx, cz, seats } = seatsFor(4);
  const chair = seats[0];
  const { ux, uz } = radialOf(chair, cx, cz);
  const seat = seatPoint(chair);
  const good = assertSeatedPose({
    seated: true, seatIndex: 0, pelvis: expectedPelvis(chair, cx, cz),
    chair, clip: SIT_IDLE_SHIP, cx, cz,
  });
  t('S9 · the measured Idle_M attach passes',
    good.ok, good.notes[0] || `SIT_IN=${SIT_IN} hips-back=${SIT_HIPS_BACK} pelvis-above=${SIT_PELVIS_ABOVE}`);

  // Standing / crouching ON THE FLOOR in front of the chair (walk-in stand-mark, clip not applied).
  const front = {
    x: chair.x - ux * 0.78,
    y: 0.90,
    z: chair.z - uz * 0.78,
  };
  const standing = assertSeatedPose({
    seated: true, seatIndex: 0, pelvis: front, chair, clip: SIT_IDLE_SHIP, cx, cz,
  });
  t('S9a · standing-in-front (John shot) fails the sit pose check',
    !standing.ok, standing.notes[0] || 'did not reject standing-in-front');

  // Sunk / clipped deep into the cushion (hips at floor-ish Y on the chair origin).
  const sunk = assertSeatedPose({
    seated: true, seatIndex: 0,
    pelvis: { x: chair.x, y: 0.12, z: chair.z },
    chair, clip: SIT_IDLE_SHIP, cx, cz,
  });
  t('S9b · sunk-into-cushion (John shot) fails the sit pose check',
    !sunk.ok, sunk.notes[0] || 'did not reject sunk pelvis');

  // Idle_F hip-back on the M attach: pelvis 0.56-0.34 = 0.22 m through the splat.
  const through = {
    x: chair.x + ux * (SIT_F_HIPS_BACK - SIT_IN),
    y: seat.y + SIT_PELVIS_ABOVE,
    z: chair.z + uz * (SIT_F_HIPS_BACK - SIT_IN),
  };
  const fPose = assertSeatedPose({
    seated: true, seatIndex: 1, pelvis: through, chair, clip: 'Chair_Sit_Idle_F', cx, cz,
  });
  t('S9c · Idle_F through-the-back on the M attach fails',
    !fPose.ok, fPose.notes[0] || 'did not reject F-clip hip-back');

  // Pre-nudge attach: SIT_IN === hip-back parked the pelvis on the chair origin
  // and the back panel in the splat cutouts.
  const throughBack = {
    x: chair.x + ux * (SIT_HIPS_BACK - SIT_IN_THROUGH_BACK),
    y: seat.y + SIT_PELVIS_ABOVE,
    z: chair.z + uz * (SIT_HIPS_BACK - SIT_IN_THROUGH_BACK),
  };
  const oldBack = assertSeatedPose({
    seated: true, seatIndex: 0, pelvis: throughBack, chair, clip: SIT_IDLE_SHIP, cx, cz,
  });
  t('S9d · the old through-backrest attach (SIT_IN 0.24) fails',
    !oldBack.ok && SIT_IN > SIT_IN_THROUGH_BACK && SIT_IN > SIT_HIPS_BACK,
    oldBack.notes[0] || `SIT_IN=${SIT_IN} still equals hip-back`);
}

{
  const g = glbJson(BODY);
  const m = g && !g.error ? hipsMeanM(g, 'Chair_Sit_Idle_M') : null;
  const f = g && !g.error ? hipsMeanM(g, 'Chair_Sit_Idle_F') : null;
  t('S10 · Idle_M hips.z matches SIT_HIPS_BACK (measured, not guessed)',
    !!m && Math.abs(Math.abs(m.z) - SIT_HIPS_BACK) < 0.03,
    m ? `z=${m.z.toFixed(3)} y=${m.y.toFixed(3)}` : 'no hips track');
  t('S10a · Idle_F hips.z is the 0.56 m through-back class we must not ship',
    !!f && Math.abs(Math.abs(f.z) - SIT_F_HIPS_BACK) < 0.04 && Math.abs(f.z) > Math.abs(m?.z || 0) * 1.6,
    f ? `F z=${f.z.toFixed(3)} vs M z=${m?.z.toFixed(3)}` : 'no F hips track');
  t('S10b · every seat ships Idle_M, never F',
    sitIdleClip(0) === SIT_IDLE_SHIP && sitIdleClip(1) === SIT_IDLE_SHIP
    && SIT_IDLE_SHIP === 'Chair_Sit_Idle_M');
}

{
  const avatarSrc = readFileSync(join(ROOT, '..', 'src', 'characters', 'mesh-avatar.js'), 'utf8');
  t('S11 · playSit does not play a stand-to-sit transition at the sit attach',
    /sitIdle = sitIdleM \|\| sitIdleF/.test(avatarSrc)
    && /Always skip the stand-to-sit/.test(avatarSrc)
    && !/seatIndex % 2/.test(avatarSrc));
  t('S12 · shipped Idle_M freezes torso lean at the sit-back frame',
    /SIT_UPRIGHT_T = 0/.test(avatarSrc)
    && /SIT_LEAN_BONES/.test(avatarSrc)
    && /captureLean/.test(avatarSrc)
    && /applyLean/.test(avatarSrc)
    && /Spine02/.test(avatarSrc));
}

console.log(`\nsit-in-chair: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
