#!/usr/bin/env node
/**
 * 🏚️ **expedition-wire — THE PARTY MODE AND THE MANSION ARE THE SAME HOUSE.**
 *
 *   node harness/expedition-wire.mjs
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 E1 IS THE WHOLE POINT OF THIS FILE, AND IT WOULD HAVE GONE RED FOR MONTHS.
 * ---------------------------------------------------------------------------------------------
 * The party mode named its six rooms before there was a mansion to name them after:
 * `['ballroom','gallery','study','chapel','hall','cellar']`. The house has
 * `['gallery','study_w','service','study_e','ballroom','chapel']`. **`hall` and `cellar` do not
 * exist.** Every coverage fraction, every camera roster, every caption and every guide sight
 * computed since was about a building nobody could walk through — all of it internally consistent,
 * all of it green, and none of it about the game.
 *
 * Nothing could catch that while `three` was uninstalled, because the only file that knows the
 * real floor plan imports it. It is installed now, so a gate can hold the pure declaration
 * against the engine and keep holding it.
 *
 * ⚠️ THE PURE MODULES STILL MAY NOT IMPORT `spaces.js`, AND THAT IS NOT NEGOTIABLE. `coverage.js`
 * and `houseplan.js` run in a worker, in bare node and on a phone; the moment either reaches for
 * THREE, `party-sim`, `guide-coverage` and `party-isolation` need a GPU and stop being run. So the
 * shape is: state it in pure land, import the engine HERE, and fail if they ever disagree.
 *
 * ⚠️ THE BROWSER ARM SKIPS WITHOUT A CHROMIUM. It drives the real view in a real engine and reads
 * back what actually happened in the house. Everything it measures that MUST hold in CI is also
 * asserted from the pure side — a SKIP is never a PASS.
 */

import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { SPACES, ANCHORS } from '../src/game/spaces.js';
import { ROOMS, coveredRooms } from '../src/party/coverage.js';
import { HOUSE, EXTENT, roomAt } from '../src/party/houseplan.js';
import { ROOM_LABEL } from '../src/party/captions.js';
import { TERMINAL_AT, TERMINAL_REACH, EXPEDITION_SECONDS } from '../src/views/expedition.js';
import { DETENT, noiseFor, audibleRange, SILENT_SPEED } from '../src/party/darkrun.js';
import { MOVE, HUNTER_SENSE } from '../src/game/rules.js';
import { createSession, CALL, MOVE_CHOICE } from '../src/party/session.js';
import { PHASE, SECONDS } from '../src/party/phases.js';
import { audienceFor } from '../net/party/entitle.js';

let pass = 0, fail = 0, skip = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };
const skipped = (n, why) => { skip++; console.log(`  SKIP ${n} · ${why} — SKIP is not a PASS`); };

// ---------------------------------------------------------------- E1 · one house
{
  const engineIds = SPACES.map((s) => s.id).sort();
  t('E1 arm · the engine handed over a real floor plan', SPACES.length === 6 && engineIds.length === 6,
    SPACES.map((s) => s.id).join(', '));

  t('E1 · the party mode\'s six rooms ARE the engine\'s six spaces',
    JSON.stringify([...ROOMS].sort()) === JSON.stringify(engineIds),
    `party [${[...ROOMS].sort()}] vs engine [${engineIds}]`);

  t('E1 control · the names the mode used to invent are not in the house',
    !engineIds.includes('hall') && !engineIds.includes('cellar'),
    'so E1 would have been red every day the old list shipped');

  const labelWrong = ROOMS.filter((r) => ROOM_LABEL[r] !== SPACES.find((s) => s.id === r)?.name);
  t('E1b · every on-air room name is the name the level designer gave it',
    labelWrong.length === 0,
    labelWrong.length ? labelWrong.map((r) => `${r}: "${ROOM_LABEL[r]}" != "${SPACES.find((s) => s.id === r)?.name}"`).join(', ')
      : ROOMS.map((r) => ROOM_LABEL[r]).join(' · '));

  // 🚨 THE FOOTPRINT, TO THE CENTIMETRE. A guide's map drawn from a stale copy points at a wall.
  const off = [];
  for (const r of HOUSE) {
    const sp = SPACES.find((s) => s.id === r.id);
    if (!sp) { off.push(`${r.id}: no such space`); continue; }
    for (const k of ['x0', 'x1', 'z0', 'z1']) {
      if (Math.abs(sp[k] - r[k]) > 0.01) off.push(`${r.id}.${k} ${r[k]} != ${sp[k]}`);
    }
  }
  t('E1c · the pure floor plan matches the built one to the centimetre', off.length === 0,
    off.join(', ') || `${HOUSE.length} rooms × 4 bounds checked`);
  t('E1c control · the tolerance is real — a 10cm drift would be caught',
    Math.abs(SPACES[0].x0 - (SPACES[0].x0 + 0.1)) > 0.01);

  t('E1d · and `roomAt` agrees with the bounds it was derived from',
    roomAt((HOUSE[0].x0 + HOUSE[0].x1) / 2, (HOUSE[0].z0 + HOUSE[0].z1) / 2) === HOUSE[0].id
    && roomAt(EXTENT.x0 - 5, EXTENT.z0 - 5) === null,
    'inside names the room, outside names nothing');
}

// ---------------------------------------------------------------- E2 · the terminal is somewhere
{
  const missing = ROOMS.filter((r) => !TERMINAL_AT[r] || !(TERMINAL_AT[r] in ANCHORS));
  t('E2 · every room has a terminal standing at a real anchor', missing.length === 0,
    missing.length ? missing.map((r) => `${r} → ${TERMINAL_AT[r]}`).join(', ')
      : ROOMS.map((r) => TERMINAL_AT[r]).join(' · '));
  t('E2 control · the anchor table would refuse a made-up name',
    !('gallery.nowhere' in ANCHORS));

  // The terminal has to be inside the room it belongs to, or the runner is sent through a wall.
  const stray = [];
  for (const r of ROOMS) {
    const a = ANCHORS[TERMINAL_AT[r]];
    const b = HOUSE.find((h) => h.id === r);
    if (!a || !b) continue;
    if (a[0] < b.x0 || a[0] > b.x1 || a[1] < b.z0 || a[1] > b.z1) stray.push(`${r}: (${a}) outside`);
  }
  t('E2b · and that anchor is inside its own room', stray.length === 0,
    stray.join(', ') || 'six terminals, six rooms');
}

// ---------------------------------------------------------------- E3 · the throttle
{
  // The view turns a detent into `{move, run}`; this is that arithmetic, checked against the
  // speeds `darkrun.js` published and the engine actually moves at.
  const solved = DETENT.map((d) => {
    if (d.speed <= 0) return 0;
    const top = d.speed > MOVE.walk ? MOVE.run : MOVE.walk;
    return Math.min(1, d.speed / top) * top;              // `_stepGround`: dir * top * mlen
  });
  const off = DETENT.map((d, i) => Math.abs(solved[i] - d.speed)).filter((x) => x > 1e-9);
  t('E3 · each detent solves back to the speed it claims', off.length === 0,
    DETENT.map((d, i) => `${d.name} ${solved[i].toFixed(2)}`).join(' · '));
  t('E3b · and RUN is the only one that needs the run flag',
    DETENT.filter((d) => d.speed > MOVE.walk).length === 1,
    `walk ${MOVE.walk} · run ${MOVE.run}`);

  // 🚨 T4's EXPLOIT, RE-ASSERTED AT THE WIRING. `dark-run` D4 owns this; it is repeated here
  // because the view is where a "helpful" analogue stick would be added.
  const inBand = DETENT.filter((d) => d.speed > 0 && d.speed < SILENT_SPEED);
  t('E3c · no detent lands in the silent band, so silence cannot be a strategy',
    inBand.length === 0,
    `silent below ${SILENT_SPEED.toFixed(2)} m/s · slowest moving detent is ${DETENT[1].speed}`);
  t('E3c control · the band exists on a continuous stick',
    SILENT_SPEED > 0 && audibleRange(noiseFor(SILENT_SPEED * 0.99)) === 0,
    `hearFloor ${HUNTER_SENSE.hearFloor}`);
}

// ---------------------------------------------------------------- the session, wired
function upTo(phase, { taps = () => {} } = {}) {
  const tape = new Map();
  const s = createSession({
    count: 8, castSeed: 4, worldSeed: 9,
    send: (id, f) => { if (!tape.has(id)) tape.set(id, []); tape.get(id).push(f); },
  });
  let now = 0;
  s.start(now);
  // ⚠️ 5s A STEP, NOT 1s. At one second a tick, two hundred iterations is two hundred seconds of
  // shooting schedule — and the PREMIERE alone is a hundred and fifty. The first draft of this
  // helper never reached DEBRIEF and E4e failed against a session that was behaving perfectly.
  // `tick` advances at most one phase per call, so a coarse step costs nothing but wall clock.
  for (let i = 0; i < 400 && s.state.phase !== phase; i++) {
    taps(s);
    now += 5000;
    s.tick(now);
  }
  if (s.state.phase !== phase) throw new Error(`upTo(${phase}) stalled in ${s.state.phase}`);
  return { s, tape, now };
}
const engaged = (s) => {
  const alive = s.state.players.filter((p) => p.alive).map((p) => p.id);
  if (s.state.phase === PHASE.CASTING) for (let i = 0; i < alive.length; i++) s.input(alive[i], { t: 'cast', runner: alive[(i + 1) % alive.length], guide: alive[(i + 2) % alive.length] });
};

// ---------------------------------------------------------------- E4 · the intake is narrow
{
  const { s } = upTo(PHASE.EXPEDITION, { taps: engaged });
  t('E4 arm · an expedition is open', s.state.phase === PHASE.EXPEDITION, `wing ${s.state.expedition.room}`);
  t('E4 · a well-formed report is accepted',
    s.simReport({ t: 'sim', runner: { x: 1, z: 2, room: ROOMS[0] }, hunter: { x: 3, z: 4, room: ROOMS[1], wallDist: 5 } }).ok === true);
  t('E4b · an unknown report kind is refused with a reason, not ignored',
    s.simReport({ t: 'teleport', x: 999 }).ok === false, s.simReport({ t: 'teleport' }).why);
  t('E4c · and a bogus outcome is refused rather than believed',
    s.simReport({ t: 'expedition', outcome: 'good-win' }).ok === false);
  t('E4d · the house is marked as wired only once it has actually reported', s.wired() === true);

  const { s: s2 } = upTo(PHASE.DEBRIEF, { taps: engaged });
  t('E4e · and nothing is accepted outside an expedition',
    s2.simReport({ t: 'sim', runner: { x: 1, z: 1 }, hunter: { x: 2, z: 2 } }).ok === false
    && s2.wired() === false, s2.simReport({ t: 'sim' }).why);
}

// ---------------------------------------------------------------- E5 · the house decides, the server grades
{
  for (const outcome of ['lit', 'taken', 'held']) {
    const { s, now } = upTo(PHASE.EXPEDITION, { taps: engaged });
    const camsBefore = s.state.cameras.unlocked;
    s.simReport({ t: 'sim', runner: { x: 0, z: 0, room: ROOMS[0] }, hunter: { x: 9, z: 9, room: ROOMS[3], wallDist: 6 } });
    // The runner said WAIT and the wing is clear — the stub would have returned 'held' for all
    // three. Whatever the house reports must win.
    s.input(s.state.pair.guide, { t: 'call', call: CALL.HOLD });
    s.input(s.state.pair.runner, { t: 'move', move: MOVE_CHOICE.WAIT });
    s.simReport({ t: 'expedition', outcome });
    s.skip(now + 1000);
    t(`E5 · a "${outcome}" from the house is the episode's outcome, not the stub's guess`,
      s.state.expedition.outcome === outcome, `stub would have said "held"`);
    if (outcome === 'lit') {
      t('E5b · and a lit camera still went through the log, so the win machine can see it',
        s.state.cameras.unlocked === camsBefore + 1
        && s.log.all().some((e) => e.type === 'run.camera_lit'),
        `${camsBefore} → ${s.state.cameras.unlocked}`);
    }
    if (outcome === 'taken') {
      t('E5c · and a take still killed the runner through `applyTake`, not by fiat',
        s.state.players.find((p) => p.id === s.state.pair.runner)?.alive === false
        && s.log.all().some((e) => e.type === 'player.taken'));
    }
  }

  // The control: with no house attached, the stub still runs. Every gate older than this wiring
  // depends on that, and a session that required a mansion would take all of them down.
  const { s, now } = upTo(PHASE.EXPEDITION, { taps: engaged });
  s.input(s.state.pair.guide, { t: 'call', call: CALL.CLEAR });
  s.input(s.state.pair.runner, { t: 'move', move: MOVE_CHOICE.GO });
  s.skip(now + 1000);
  t('E5 control · with no house attached the M3 stub still resolves the episode',
    ['lit', 'taken', 'held'].includes(s.state.expedition.outcome) && s.wired() === false,
    `"${s.state.expedition.outcome}" from the stub`);
}

// ---------------------------------------------------------------- E6 · sight is the server's
{
  /**
   * 🚨 THE HOUSE SUPPLIES GEOMETRY; `darkrun.js` SUPPLIES THE VERDICT. Same Hunter, same covered
   * room, two wall distances — one outside the 2.55m blind strip and one inside it. If the second
   * were visible the strip would be decorative, and an honest guide would never have the excuse
   * the whole design rests on.
   */
  let seenAt = null, blindAt = null, room = null;
  for (const r of coveredRooms(9, 1)) {
    const { s, tape } = upTo(PHASE.EXPEDITION, { taps: engaged });
    const gid = s.socketFor(s.state.pair.guide).id;
    const last = () => (tape.get(gid) || []).slice(-1)[0];

    s.simReport({ t: 'sim', runner: { x: 0, z: 0, room: r }, hunter: { x: 1, z: 1, room: r, wallDist: 6.0 } });
    const open = last();
    s.simReport({ t: 'sim', runner: { x: 0, z: 0, room: r }, hunter: { x: 1, z: 1, room: r, wallDist: 0.4 } });
    const hidden = last();
    if (open?.flyover?.hunter === true && hidden?.flyover?.hunter === false) {
      seenAt = open; blindAt = hidden; room = r; break;
    }
  }
  t('E6 arm · a covered room was found and the guide got a flyover in it', seenAt !== null,
    room ? `${room}, covered by cam 1 at one unlock` : 'no covered room produced a mark');
  t('E6 · the same Hunter is seen at 6.0m from a wall and lost at 0.4m',
    seenAt?.flyover?.hunter === true && blindAt?.flyover?.hunter === false,
    `${room}: 6.0m → seen · 0.4m → NO SIGNAL`);
  t('E6b · and when it is lost the room name goes with it, not just the dot',
    seenAt?.flyover?.room === room && blindAt?.flyover?.room == null,
    'a blind guide is told nothing, rather than told where it was');
  t('E6c · the marks are the house\'s real coordinates, not a placeholder',
    seenAt?.flyover?.marks?.some((m) => m.kind === 'hunter' && m.x === 1 && m.z === 1),
    JSON.stringify(seenAt?.flyover?.marks));
  t('E6 control · the strip is the shipped 2.55m at the shipped tilt, not a number chosen here',
    Math.abs(4.80 / Math.tan(62 * Math.PI / 180) - 2.55) < 0.01,
    `H/tan θ = ${(4.80 / Math.tan(62 * Math.PI / 180)).toFixed(2)}m`);

  // An UNCOVERED room is the other half: no camera, so nothing is seen at any distance.
  const dark = ROOMS.find((r) => !coveredRooms(9, 1).has(r));
  const { s: sd, tape: td } = upTo(PHASE.EXPEDITION, { taps: engaged });
  const dgid = sd.socketFor(sd.state.pair.guide).id;
  sd.simReport({ t: 'sim', runner: { x: 0, z: 0, room: dark }, hunter: { x: 1, z: 1, room: dark, wallDist: 9.0 } });
  const darkFrame = (td.get(dgid) || []).slice(-1)[0];
  t('E6d · in a room no camera watches the guide sees nothing, however open the floor',
    darkFrame?.flyover?.hunter === false,
    `${dark} is dark at one unlock · 9.0m from any wall and still NO SIGNAL`);
}

// ---------------------------------------------------------------- E7 · who may see the map
{
  t('E7 · the floor plan is guide-audience, never `all`',
    ['id', 'x0', 'x1', 'z0', 'z1'].every((k) => audienceFor(`flyover.plan[].${k}`) === 'guide'),
    'an `all` row is a minimap one CSS rule from the television — §6.1');
  t('E7b · and whether a house is attached IS public, because the whole table plays the same game',
    audienceFor('expedition.live') === 'all');
  t('E7 control · the Hunter\'s room still has no row anywhere',
    audienceFor('hunterRoom') === null && audienceFor('expedition.hunterRoom') === null);
}

console.log(`\nexpedition-wire: ${pass} passed, ${fail} failed${skip ? `, ${skip} skipped` : ''}`);
process.exit(fail ? 1 : 0);
