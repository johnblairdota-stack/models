#!/usr/bin/env node
/**
 * 📹 **guide-coverage — THE GUIDE IS NOT AN ORACLE, AND THE ERROR RATE IS A NUMBER.**
 *
 *   node harness/guide-coverage.mjs
 *
 * Showstopper **S3**, and the headless half of `guide-lie`'s **T3** band. `views/game.js` L2559
 * ships `hunterMark.visible = hs.inScene && !!hp` — the Hunter is on the guide's map because it
 * EXISTS. A guide holding that is never wrong, so T3's honest error rate is exactly zero, and a
 * guide who is never honestly wrong is a lie detector rather than a player.
 *
 * ---------------------------------------------------------------------------------------------
 * WHERE THE BAND COMES FROM, ARITHMETICALLY
 * ---------------------------------------------------------------------------------------------
 * The guide is asked *"is it safe to move"*. With coverage `c` they have a definite answer with
 * probability `c` and must guess otherwise, and a guess is right about half the time:
 *
 *     honest error ~= (1 - c) / 2
 *
 * T3 wants **15-25%**, so coverage wants **0.50-0.70**. C2 measures the curve empirically
 * against a simulated guide rather than trusting the algebra.
 *
 * ⚠️ **C2 REPORTS THE CURVE AND ASSERTS ONE POINT ON IT** (`dig-band.mjs` L15-18 — some numbers
 * are bands, not directions). Asserting the band at EVERY camera count would be asserting that
 * progression does not happen: episode one is meant to sit above the band with a nearly blind
 * guide, and the last episode below it with a guide who has earned their sight.
 */

import { coverageFraction, hunterVisibleToGuide, expectedHonestError, cameraRoster, ROOMS, T3_BAND } from '../src/party/coverage.js';
import { createRoom } from '../src/party/room.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

const SEEDS = 400, TRIALS = 60;

/**
 * A simulated honest guide. Sees the Hunter where a camera covers it, guesses otherwise, and is
 * never deliberately wrong. Its error rate IS the honest error rate — the floor of noise that
 * makes a lying guide indistinguishable from a mistaken one.
 */
function honestErrorAt(unlocked, gated = true) {
  let wrong = 0, n = 0;
  for (let s = 0; s < SEEDS; s++) {
    let a = (s * 2654435761) >>> 0;
    const rand = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
    for (let k = 0; k < TRIALS; k++) {
      const hunterRoom = ROOMS[Math.floor(rand() * ROOMS.length)];
      const runnerRoom = ROOMS[Math.floor(rand() * ROOMS.length)];
      const trulySafe = hunterRoom !== runnerRoom;
      const seen = gated ? hunterVisibleToGuide({ worldSeed: s, unlocked, hunterRoom }) : true;
      const called = seen ? trulySafe : rand() < 0.5;   // blind -> a coin
      if (called !== trulySafe) wrong++;
      n++;
    }
  }
  return wrong / n;
}

// ---------------------------------------------------------------- C0 · the arm
{
  const cams = cameraRoster(7);
  const covered = new Set(cams.flatMap((c) => c.rooms));
  t('C0 arm · the roster covers every room across all cameras, and no room twice',
    covered.size === ROOMS.length && cams.flatMap((c) => c.rooms).length === ROOMS.length,
    `${cams.length} cameras x ${cams[0].rooms.length} rooms = ${ROOMS.length}`);
}

// ---------------------------------------------------------------- C1 · coverage is monotonic
{
  let mono = true;
  for (let s = 0; s < 200; s++) {
    let prev = -1;
    for (let u = 0; u <= 3; u++) { const c = coverageFraction(s, u); if (c < prev) mono = false; prev = c; }
  }
  t('C1 · coverage rises with every unlock, never falls', mono,
    [0, 1, 2, 3].map((u) => `${u}cam:${(coverageFraction(7, u) * 100).toFixed(0)}%`).join(' '));
}

// ---------------------------------------------------------------- C2 · the curve, and the band
{
  const rows = [0, 1, 2, 3].map((u) => {
    const c = coverageFraction(7, u);
    return { u, c, measured: honestErrorAt(u), predicted: expectedHonestError(c) };
  });
  for (const r of rows) {
    console.log(`       ${r.u} cam · coverage ${(r.c * 100).toFixed(0)}% · honest error ${(r.measured * 100).toFixed(1)}% (algebra says ${(r.predicted * 100).toFixed(1)}%)`);
  }
  const agree = rows.every((r) => Math.abs(r.measured - r.predicted) < 0.03);
  t('C2 · the measured curve matches (1-c)/2 within 3 points', agree);

  const mid = rows[2];   // two cameras — the middle of a game
  t('C2b · the mid-game guide sits inside T3\'s 15-25% band',
    mid.measured >= T3_BAND.lo && mid.measured <= T3_BAND.hi,
    `2 cameras -> ${(mid.measured * 100).toFixed(1)}%`);

  t('C2c · episode one is deliberately harder than the band', rows[1].measured > T3_BAND.hi,
    `1 camera -> ${(rows[1].measured * 100).toFixed(1)}%, above ${T3_BAND.hi * 100}% on purpose`);
}

// ---------------------------------------------------------------- C3 · the oracle is gone
{
  const tape = {};
  const r = createRoom({ count: 8, castSeed: 4, worldSeed: 7, send: (id, f) => { (tape[id] = tape[id] || []).push(f); } });
  r.start();
  r.playEpisode({ hunterRoom: ROOMS[5] });   // cam1 covers it
  r.playEpisode({ hunterRoom: 'gallery' });  // cam3 does, but only once unlocked
  // ⚠️ THE GUIDE IS WHOEVER THE BALLOT CAST, NOT phone-1. An earlier draft hard-coded the seat
  // and went green only for as long as the pair was picked by seat index; the moment casting
  // became a real ballot it measured an empty set and reported it as blind. Find the flyover.
  const fly = Object.values(tape).flat().filter((f) => f.flyover);
  const seen = fly.filter((f) => f.flyover.hunter).length;
  t('C3 · the guide is sometimes blind and sometimes not, in a real room',
    seen > 0 && seen < fly.length, `${seen} of ${fly.length} flyover frames show the Hunter`);
  t('C3b · a blind frame omits the hunter mark entirely, rather than nulling it',
    fly.filter((f) => !f.flyover.hunter).every((f) => f.flyover.marks.every((m) => m.kind !== 'hunter')),
    'absence, not a placeholder — a null mark is still an answer');
}

// ---------------------------------------------------------------- C4 · the control
{
  const ungated = honestErrorAt(3, false);
  t('C4 control · the shipped ungated flyover turns T3 red', ungated === 0,
    `hs.inScene && !!hp -> ${(ungated * 100).toFixed(1)}% honest error — a guide who is never wrong`);
}

console.log(`\nguide-coverage: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
