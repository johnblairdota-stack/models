#!/usr/bin/env node
/**
 * 🎬 **premiere-stage — the cold open's geometry, before anybody renders it.**
 *
 *   node harness/premiere-stage.mjs
 *
 * Everything about `views/premiere.js` that can be wrong in a way a screenshot answers slowly and
 * arithmetic answers instantly. The scene costs about seven minutes a frame on a machine with no
 * GPU, so a bug that only a render can catch costs seven minutes — and P3 below is the one that
 * cost twenty-one, because a camera parked inside a wall throws nothing and renders a beautifully
 * exposed picture of stone.
 *
 * ⚠️ IT ASSERTS THE STAGE, NOT THE PERFORMANCE. Whether the seated pose LOOKS right is a question
 * for a person and a picture; `progress/premiere/` is where those live.
 */

import { R, DOORS, CAM_KEYS, CAST, RING_RADIUS, DOOR, CORRIDOR, WALK_SPEED, STAGGER, PLATE_HOLD }
  from '../src/views/premiere.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };
const inside = (p) => p[0] > R.x0 && p[0] < R.x1 && p[2] > R.z0 && p[2] < R.z1 && p[1] > 0 && p[1] < R.h;

// ---------------------------------------------------------------- P1 · the ring fits
{
  const half = Math.min((R.x1 - R.x0) / 2, (R.z1 - R.z0) / 2);
  t('P1 arm · the stage is the ballroom the showcase and the playable room both build',
    R.x1 - R.x0 === 26 && R.z1 - R.z0 === 16, `${R.x1 - R.x0} × ${R.z1 - R.z0} × ${R.h}`);
  // A seated robot needs its chair clear of the wall, and a walker needs to get behind it.
  t('P1 · the chair ring leaves room to walk around the outside of it',
    RING_RADIUS + 2.0 < half, `ring ${RING_RADIUS}m + 2.0m clearance vs ${half}m to the nearest wall`);
  t('P1 control · a ring the width of the room would fail this',
    !(half - 0.2 + 2.0 < half));
}

// ---------------------------------------------------------------- P2 · the doors are in walls
{
  const off = DOORS.filter((d) => {
    const onX = Math.abs(d.x - R.x0) < 1e-6 || Math.abs(d.x - R.x1) < 1e-6;
    const onZ = Math.abs(d.z - R.z0) < 1e-6 || Math.abs(d.z - R.z1) < 1e-6;
    return !(onX || onZ);
  });
  t('P2 · every entrance sits on a wall of the room, not in mid-air', off.length === 0,
    off.map((d) => d.id).join(', ') || DOORS.map((d) => d.id).join(' · '));

  const bad = DOORS.filter((d) => {
    // the inward normal must point INTO the box from where the door is
    const px = d.x + d.inward[0] * 0.5, pz = d.z + d.inward[1] * 0.5;
    return !(px > R.x0 && px < R.x1 && pz > R.z0 && pz < R.z1);
  });
  t('P2b · and each one\'s "inward" really points into the room', bad.length === 0,
    bad.map((d) => d.id).join(', ') || 'four doors, four normals');

  t('P2c · a robot fits through the opening standing up',
    DOOR.w > 0.9 && DOOR.h > 1.9, `${DOOR.w}m × ${DOOR.h}m for a 1.7m robot`);
  t('P2d · and the corridor behind it is wider than the door',
    CORRIDOR.w >= DOOR.w && CORRIDOR.h >= DOOR.h, `${CORRIDOR.w}m × ${CORRIDOR.h}m`);
}

// ---------------------------------------------------------------- P3 · the camera is in the room
{
  /**
   * 🚨 THE ONE THAT PAID FOR THIS FILE. Three renders were spent on cameras at z 17, z 11.4 and
   * z 8.2 against a room that ends at z 8 — each a flawless close-up of the inside of a wall.
   */
  const keys = [['a', CAM_KEYS.a], ['b', CAM_KEYS.b], ['sweep', CAM_KEYS.sweep]];
  const out = keys.filter(([, p]) => !inside(p));
  t('P3 · every camera keyframe is inside the ballroom', out.length === 0,
    out.length ? out.map(([n, p]) => `${n} at (${p})`).join(', ')
      : keys.map(([n, p]) => `${n} (${p[0]}, ${p[1]}, ${p[2]})`).join(' · '));
  t('P3 control · the check catches the exact frame that shipped — z 11.4 with a wall at z 8',
    !inside([0, 4.4, 11.4]));

  const aims = [CAM_KEYS.aimA, CAM_KEYS.aimB];
  t('P3b · and both ends of the move look at the middle of the ring, not past it',
    aims.every((a) => Math.hypot(a[0], a[2]) < 0.5 && a[1] > 0 && a[1] < 2.5),
    aims.map((a) => `(${a[0]}, ${a[1]}, ${a[2]})`).join(' → '));
}

// ---------------------------------------------------------------- P4 · the cast
{
  t('P4 · eight contestants, all distinct', CAST.length === 8 && new Set(CAST).size === 8,
    CAST.join(' · '));
  // The plate canvas is 512px at 62px type with 10px tracking — past six characters it clips.
  const longest = CAST.reduce((a, b) => (b.length > a.length ? b : a));
  t('P4b · every name fits the nameplate without clipping', longest.length <= 6,
    `longest is "${longest}" at ${longest.length} characters`);
  t('P4b control · a longer one would not', !('CONSTANTINE'.length <= 6));
}

// ---------------------------------------------------------------- P5 · the running time
{
  // Last contestant starts, then walks the longest path: down the corridor, through the door,
  // around to the far side of the ring.
  const last = 0.6 + (CAST.length - 1) * STAGGER;
  const walk = (4.6 + DOOR.w + RING_RADIUS + 1.35 + Math.PI * RING_RADIUS) / WALK_SPEED;
  const total = last + walk;
  t('P5 · the cold open runs long enough to name eight people and short enough to sit through',
    total > 18 && total < 45, `${total.toFixed(1)}s — ${last.toFixed(1)}s of entrances + ${walk.toFixed(1)}s of walking`);
  t('P5b · each nameplate is up long enough to read and gone before the next two arrive',
    PLATE_HOLD > 2 && PLATE_HOLD < STAGGER * 3,
    `${PLATE_HOLD}s hold on a ${STAGGER}s stagger`);
  t('P5 control · the budget would reject a stagger nobody would sit through',
    !((0.6 + 7 * 9) + walk < 45), 'a 9s stagger is 66s of entrances');
}

console.log(`\npremiere-stage: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
