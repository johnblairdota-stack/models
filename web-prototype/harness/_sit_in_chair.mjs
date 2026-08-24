#!/usr/bin/env node
/**
 * sit-in-chair — each cast robot logically sits, pelvis on the cushion, seated clip playing.
 *
 *   node harness/_sit_in_chair.mjs
 *
 * THREE-free / browser-free so it can live on `gates:party` (CI has no `npm install`).
 * It reads clip names out of the GLB JSON chunk, then asserts sit-attach maths from
 * `src/game/chair-seats.js` for N = 4 and N = 8.
 *
 * Fail notes are one line per seat so a red CI log is a punch list, not a stack.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SEAT_MAX, seatCircleRadius, sitIdleClip, sitPhase, sitRootXZ, expectedPelvis,
  seatPoint, assertSeatedPose, SIT_IDLE_CLIPS, SIT_DOWN_CLIPS, SIT_CLIP_ALLOW,
  rugSpanForSeats, RUG_CATALOG_SPAN,
} from '../src/game/chair-seats.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const ANIM = join(ROOT, '..', 'public', 'models', 'anim');
const BODY = join(ANIM, 'friendly_all38.glb');
const SEATED = join(ANIM, 'friendly_seated20.glb');

let pass = 0, fail = 0;
const t = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); }
  return c;
};

function glbClipNames(path) {
  if (!existsSync(path)) return null;
  const buf = readFileSync(path);
  if (buf.length < 20 || buf.toString('ascii', 0, 4) !== 'glTF') {
    return { error: `${path} is not a GLB` };
  }
  const chunkLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + chunkLen).toString('utf8'));
  return (json.animations || []).map((a) => a.name);
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
    if (horiz > 0.22) notes.push(`seat ${chair.index}: pelvis ${horiz.toFixed(3)} m from seat point`);
    if (Math.hypot(root.x - chair.x, root.z - chair.z) > 0.20) {
      notes.push(`seat ${chair.index}: sit root drifted from chair origin`);
    }
  }
  t(`S4 · N=${count} every robot is marked seated with pelvis on the cushion`,
    notes.length === 0 && count === n,
    notes[0] || `r=${radius.toFixed(2)} m · ${count} seats`);
  if (notes.length) {
    for (const line of notes) console.log(`       ${line}`);
  }
  t(`S5 · N=${count} rug span sits just inside the chair ring (not the 2.80 toy disc)`,
    rugSpanForSeats(radius) > RUG_CATALOG_SPAN
    && rugSpanForSeats(radius) <= radius * 2
    && rugSpanForSeats(radius) >= 2 * (radius - 0.5),
    `rug ${rugSpanForSeats(radius).toFixed(2)} m · ring ${radius.toFixed(2)} m`);
}

t('S6 · per-seat idle phases are not all identical',
  phases.size >= 4, `${phases.size} distinct offsets`);
t('S7 · the allow-list only names real Meshy sit clips',
  SIT_CLIP_ALLOW.every((n) => /Sit|sit/.test(n)),
  SIT_CLIP_ALLOW.join(', '));

console.log(`\nsit-in-chair: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
