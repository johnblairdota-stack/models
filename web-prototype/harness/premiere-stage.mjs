#!/usr/bin/env node
/**
 * 🎬 **premiere-stage — the cold open's geometry, held against the house.**
 *
 *   node harness/premiere-stage.mjs
 *
 * Everything about `views/premiere.js` that can be wrong in a way a screenshot answers slowly and
 * arithmetic answers instantly. The scene costs minutes a frame on a machine with no GPU, so a
 * bug only a render can catch costs minutes — and P3 below is the one that cost three renders,
 * because a camera parked inside a wall throws nothing and produces a beautifully exposed
 * photograph of stone.
 *
 * 🚨 IT READS `spaces.js`, WHICH IS THE FILE THE BUILT ROOM COMES FROM. The view was rewritten
 * once already because it staged the cold open in the SHOWCASE ballroom — a standalone 26 x 16
 * copy with invented corridors — while the house's is 27.2 x 15.3 with a colonnade through the
 * middle and all three doorways on one wall. Everything below is checked against the level.
 *
 * ⚠️ IT ASSERTS THE STAGE, NOT THE PERFORMANCE. Whether the seated pose LOOKS right is a question
 * for a person and a picture; `progress/premiere/` is where those live.
 */

import { SPACES, PORTALS } from '../src/game/spaces.js';
import { RING, CAST, CAM_KEYS, WALK_SPEED, STAGGER, PLATE_HOLD, DOOR_CLEAR, BALLROOM_ID }
  from '../src/views/premiere.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

const B = SPACES.find((s) => s.id === BALLROOM_ID);
const inside = (p) => p[0] > B.x0 && p[0] < B.x1 && p[2] > B.z0 && p[2] < B.z1 && p[1] > 0 && p[1] < B.storey;

// ---------------------------------------------------------------- P0 · the right room
{
  t('P0 arm · the stage is the house\'s ballroom, read from spaces.js', !!B,
    `${(B.x1 - B.x0).toFixed(1)} × ${(B.z1 - B.z0).toFixed(1)} × ${B.storey} · x ${B.x0}..${B.x1} · z ${B.z0}..${B.z1}`);
  // The showcase room is 26 x 16 on a different origin. If those numbers ever come back, the view
  // has been re-pointed at the copy and every coordinate below is about a room nobody plays in.
  t('P0 · and it is NOT the showcase copy the first version staged in',
    !(B.x0 === -13 && B.x1 === 13 && B.z0 === -8 && B.z1 === 8),
    'the showcase is 26 × 16 at z -8..8; the house is not');
}

// ---------------------------------------------------------------- P1 · the ring fits, and clears the columns
{
  const r = RING.radius;
  const clear = Math.min(RING.cx - r - B.x0, B.x1 - (RING.cx + r), RING.cz - r - B.z0, B.z1 - (RING.cz + r));
  t('P1 · the chair ring is inside the room with room to walk behind it',
    clear > 0.8, `${clear.toFixed(2)} m from the ring to the nearest wall`);

  /**
   * 🏛️ THE COLONNADE IS THE REASON THE RING IS NOT ON THE ROOM'S CENTRE. `spaces.js` puts six
   * columns across the ballroom at z -0.65; a ring on the centre puts two chairs inside two
   * piers and seats a robot in a column. This is the assertion that would have caught it.
   */
  const cols = B.columns;
  t('P1 arm · the ballroom really does have a colonnade to avoid', !!cols && cols.xs.length === 6,
    cols ? `${cols.xs.length} columns at z ${cols.z}, ${cols.w} m wide` : 'none');
  if (cols) {
    const half = cols.w / 2 + 0.45;                       // pier half-width plus a seated robot
    const hits = cols.xs.filter((cxx) => {
      const dx = cxx - RING.cx, dz = cols.z - RING.cz;
      const d = Math.hypot(dx, dz);
      return d < r + half && d > r - half;                // the ring's band passes through the pier
    });
    t('P1b · no chair in the ring lands on a column', hits.length === 0,
      hits.length ? `columns at x ${hits.join(', ')}` : `ring at z ${RING.cz} clears the colonnade at z ${cols.z}`);
    t('P1b control · a ring on the room\'s centre WOULD hit one — which is why it is not there',
      cols.xs.some((cxx) => {
        const cz0 = (B.z0 + B.z1) / 2;
        const d = Math.hypot(cxx - 0, cols.z - cz0);
        return d < r + half && d > r - half;
      }), 'the centre of the ballroom is a bad place for a circle of chairs');
  }
}

// ---------------------------------------------------------------- P2 · the doorways are the house's
{
  const mine = PORTALS.filter((p) => p.a === BALLROOM_ID || p.b === BALLROOM_ID);
  t('P2 · the ballroom has doorways to walk in through, and they are the level\'s',
    mine.length >= 3, mine.map((p) => `${p.id}(${p.a}→${p.b})`).join(' · '));
  t('P2b · every one is wide and tall enough for a 1.7 m robot to walk through',
    mine.every((p) => p.w >= 1.0 && p.h >= 1.9),
    mine.map((p) => `${p.id} ${p.w}×${p.h}`).join(' · '));
  t('P2c · and all of them are open, so nothing has to be broken to start the show',
    mine.every((p) => p.state === 'open'), mine.map((p) => p.state).join(', '));

  // Walking `DOOR_CLEAR` in from a doorway must land inside the room, not in the wall band.
  const stuck = mine.filter((p) => {
    const inZ = B.z0 > p.z ? 1 : -1;
    const z = p.z + inZ * DOOR_CLEAR;
    return !(z > B.z0 && z < B.z1);
  });
  t('P2d · the first waypoint inside the door is inside the ROOM, not in the wall',
    stuck.length === 0, stuck.map((p) => p.id).join(', ') || `${DOOR_CLEAR} m clear of a ${Math.abs(B.z0 - mine[0].z).toFixed(2)} m wall band`);
}

// ---------------------------------------------------------------- P3 · the camera is in the room
{
  const keys = [['a', CAM_KEYS.a], ['b', CAM_KEYS.b], ['sweep', CAM_KEYS.sweep]];
  const out = keys.filter(([, p]) => !inside(p));
  t('P3 · every camera keyframe is inside the ballroom', out.length === 0,
    out.length ? out.map(([n, p]) => `${n} at (${p})`).join(', ')
      : keys.map(([n, p]) => `${n} (${p[0]}, ${p[1]}, ${p[2]})`).join(' · '));
  t('P3 control · the check catches the exact frame that shipped — z 11.4 against a wall at z 7',
    !inside([0, 4.4, 11.4]));
  t('P3b · and both ends of the move look at the ring rather than past it',
    [CAM_KEYS.aimA, CAM_KEYS.aimB].every((a) =>
      Math.hypot(a[0] - RING.cx, a[2] - RING.cz) < RING.radius && a[1] > 0 && a[1] < 2.5),
    [CAM_KEYS.aimA, CAM_KEYS.aimB].map((a) => `(${a[0]}, ${a[1]}, ${a[2]})`).join(' → '));
}

// ---------------------------------------------------------------- P4 · the cast
{
  t('P4 · eight contestants, all distinct', CAST.length === 8 && new Set(CAST).size === 8, CAST.join(' · '));
  const longest = CAST.reduce((a, b) => (b.length > a.length ? b : a));
  t('P4b · every name fits the 512px nameplate without clipping', longest.length <= 6,
    `longest is "${longest}" at ${longest.length} characters`);
  t('P4b control · a longer one would not', !('CONSTANTINE'.length <= 6));
}

// ---------------------------------------------------------------- P5 · the running time
{
  const last = 0.6 + (CAST.length - 1) * STAGGER;
  const walk = (3.4 + DOOR_CLEAR + Math.abs(B.z0 - RING.cz) + Math.PI * RING.radius) / WALK_SPEED;
  const total = last + walk;
  t('P5 · long enough to name eight people, short enough to sit through',
    total > 18 && total < 50, `${total.toFixed(1)}s — ${last.toFixed(1)}s of entrances + ${walk.toFixed(1)}s of walking`);
  t('P5b · each plate is up long enough to read and gone before the next two arrive',
    PLATE_HOLD > 2 && PLATE_HOLD < STAGGER * 3, `${PLATE_HOLD}s hold on a ${STAGGER}s stagger`);
  t('P5 control · the budget would reject a stagger nobody would sit through',
    !((0.6 + 7 * 9) + walk < 50), 'a 9s stagger is 66s of entrances alone');
}

console.log(`\npremiere-stage: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
