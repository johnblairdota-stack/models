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

import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { SPACES, ANCHORS } from '../src/game/spaces.js';
import { ROOMS, coveredRooms } from '../src/party/coverage.js';
import { HOUSE, EXTENT, roomAt } from '../src/party/houseplan.js';
import { ROOM_LABEL } from '../src/party/captions.js';
import { TERMINAL_AT, TERMINAL_REACH, EXPEDITION_SECONDS, TELL_FOR_STATE, tellFor, readBrief } from '../src/views/expedition.js';
import { startShow } from '../net/party/show.mjs';
import { camerasLive } from '../src/party/coverage.js';
import { KIND } from '../src/party/director.js';
import { mapRooms, createRig } from '../src/game/director-rig.js';
import { bugFor } from '../src/party/shots.js';
import { DETENT, noiseFor, audibleRange, SILENT_SPEED } from '../src/party/darkrun.js';
import { MOVE, HUNTER_SENSE } from '../src/game/rules.js';
import { createSession, CALL, MOVE_CHOICE } from '../src/party/session.js';
import { PHASE, SECONDS } from '../src/party/phases.js';
import { audienceFor } from '../net/party/entitle.js';

let pass = 0, fail = 0, skip = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };
const skipped = (n, why) => { skip++; console.log(`  SKIP ${n} · ${why} — SKIP is not a PASS`); };

/**
 * The Hunter states this file has decided say nothing on the bus, and WHY, so that a new state in
 * the AI arrives here as a red line rather than as an unannounced silence:
 *
 *   PATROL   nothing is happening
 *   SEARCH   it is giving up — see E8b
 *   PURSUE · HUNT   the commitment is announced by the `onCommit` LATCH, not by a state test.
 *                   `_commitStep` exists because PURSUE is entered and left on hysteresis inside a
 *                   single chase, and re-announcing it is "how a warning becomes wallpaper"
 *   BANG · BREACH · GROW   authored moments with their own hooks (`onBang`, `onDoor`, `onStage`),
 *                          which carry the room and the progress a state name does not
 */
const SILENT_STATES = ['PATROL', 'SEARCH', 'BANG', 'BREACH', 'GROW', 'PURSUE', 'HUNT'];

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

// ---------------------------------------------------------------- E8 · what the Hunter's states say
/**
 * 🚨 **THE TELEVISION WAS ANNOUNCING THE OPPOSITE OF WHAT HAD HAPPENED, ABOUT THE WRONG PERSON.**
 *
 * The view mapped `ALERT || SEARCH → hunter_alert` and `PURSUE || HUNT || STALK → hunter_commit`,
 * and fed both with `subjectId: 'hunter'`. Three things were wrong at once, and each is asserted
 * here rather than remembered:
 *
 *   · **SEARCH is the give-up state.** `hunter-ai.js:711` enters it when awareness has fallen
 *     BELOW `alertAt` and it is sweeping a last known point. It was captioned "SOMETHING HEARD
 *     THAT" — and, being rank 3, it pinned the camera for the sweep.
 *   · **STALK is not a commitment.** The commitment is the `onCommit` latch, which the AI builds
 *     precisely so the moment is announced once and cannot flicker.
 *   · **the subject is the runner.** 82% of a 90 s expedition was a shoulder camera on the
 *     monster at 2.22 m.
 *
 * The state names are read out of `hunter-ai.js` itself, so a state added to the AI with no
 * decision taken about it here fails this gate rather than airing whatever it happens to hit.
 */
{
  const src = readFileSync(new URL('../src/game/hunter-ai.js', import.meta.url), 'utf8');
  const states = [...new Set([...src.matchAll(/this\.state\s*=\s*'([A-Z_]+)'/g)].map((m) => m[1]))].sort();
  t('E8 arm · the Hunter\'s states were read out of the AI, not listed here', states.length >= 6, states.join(' '));

  const undecided = states.filter((s) => !(s in TELL_FOR_STATE) && !SILENT_STATES.includes(s));
  t('E8 · every state the AI can enter has a decision — a tell, or deliberate silence',
    undecided.length === 0, undecided.length ? `no decision for ${undecided.join(', ')}` : `${states.length} states, all accounted for`);

  t('E8b · SEARCH says nothing, because SEARCH is the Hunter giving up',
    tellFor('SEARCH', 1) === null && tellFor('PATROL', 1) === null,
    'it was "SOMETHING HEARD THAT" at rank 3, which is a lie that also held the camera');

  t('E8c · and every tell that IS emitted is an event about the runner',
    states.every((s) => { const e = tellFor(s, 1); return !e || e.subjectId === 'runner'; })
    && tellFor('ATTACK', 1).subjectId === 'runner',
    'the Hunter is what happened; the runner is who it happened to');

  t('E8 control · the mapping really does distinguish states, so E8b is not a function that always returns null',
    tellFor('ALERT', 1)?.kind === 'hunter_alert' && tellFor('ATTACK', 1)?.kind === 'grab',
    `ALERT → ${tellFor('ALERT', 1).kind} · ATTACK → ${tellFor('ATTACK', 1).kind}`);

  const strayKind = Object.values(TELL_FOR_STATE).filter((k) => !KIND.includes(k));
  t('E8d · and every kind it emits is one of §1.2\'s twelve, which has no room for a new one',
    strayKind.length === 0, strayKind.join(', ') || Object.values(TELL_FOR_STATE).join(' '));
}

// ---------------------------------------------------------------- E11 · the brief is read
/**
 * 🚨 **THE SERVER HAS BEEN BRIEFING THE HOUSE SINCE THE SOCKET EXISTED, AND THE HOUSE HAD NO
 * BRANCH FOR IT.** `show.mjs` sends `{t:'brief', wing, cameras, worldSeed, episode}` on connect
 * and at the top of every expedition. The view's handler accepted `drive` and `cams` and dropped
 * the brief: `wing` was bound once from a query string and never reassigned, so the runner drove
 * to the wrong room's terminal, the lower third named the wrong room, and `session.js`'s
 * `simReport` reads only `msg.outcome` — so the mismatch was discarded in silence.
 *
 * This takes a brief off a REAL show, through a real `role=sim` socket, and holds what the view
 * recovers from it against what the session put in.
 */
{
  const PORT = 5243;
  const show = startShow({ port: PORT, code: 'brief', stamp: 1700000000000 });
  const opened = [];
  const open = (q = '') => new Promise((res) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/${q}`);
    const msgs = [];
    ws.onmessage = (e) => { const m = JSON.parse(e.data); msgs.push(m); if (m.t === 'ping') ws.send(JSON.stringify({ t: 'pong', at: m.at })); };
    ws.onopen = () => res({ ws, msgs });
    ws.onerror = () => res({ ws, msgs });
  });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  await wait(120);
  for (let i = 0; i < 5; i++) {
    const p = await open();
    p.ws.send(JSON.stringify({ t: 'join', name: `R${i + 1}`, token: null, boot: 500 }));
    opened.push(p);
  }
  await wait(200);
  const sim = await open('?role=sim');
  opened.push(sim);
  show.begin(Date.now());
  const sess = show.sessionNow();
  for (let i = 0; i < 8 && sess.state.phase !== PHASE.EXPEDITION; i++) { sess.skip(Date.now()); await wait(80); }
  await wait(250);

  const brief = [...sim.msgs].reverse().find((m) => m.t === 'brief');
  t('E11 arm · a real show briefed a real simulator socket', !!brief, JSON.stringify(brief));

  const got = readBrief(brief || {});
  const want = {
    wing: sess.state.expedition.room,
    cameras: camerasLive(sess.state.cameras.unlocked),
    episode: sess.state.episode,
    worldSeed: sess.state.worldSeed,
  };
  t('E11 · the view recovers the wing, the camera count, the episode and the seed the server sent',
    JSON.stringify(got) === JSON.stringify({ wing: want.wing, cameras: want.cameras, episode: want.episode, worldSeed: want.worldSeed }),
    `${JSON.stringify(got)} vs ${JSON.stringify(want)}`);

  t('E11b · and the wing it recovers is a real room with a real terminal in it',
    ROOMS.includes(got.wing) && !!TERMINAL_AT[got.wing],
    `${got.wing} → ${TERMINAL_AT[got.wing]}`);

  t('E11 control · a brief that carries nonsense moves nothing, rather than moving half of it',
    JSON.stringify(readBrief({ t: 'brief', wing: 'kitchen', cameras: '3', episode: null })) === '{}',
    'half a brief is worse than none');

  /**
   * The other half of the seam, and the one `wire-parity` is being built to hold from both ends:
   * every `t` this process sends the simulator has a branch, and every branch has a sender.
   */
  const showSrc = readFileSync(new URL('../net/party/show.mjs', import.meta.url), 'utf8');
  const viewSrc = readFileSync(new URL('../src/views/expedition.js', import.meta.url), 'utf8');
  const emitted = new Set([...showSrc.matchAll(/send\(simSock,\s*\{\s*t:\s*'(\w+)'/g)].map((m) => m[1]));
  if (/send\(simSock, briefFor/.test(showSrc) || /briefFor\(/.test(showSrc)) emitted.add('brief');
  const consumed = new Set([...viewSrc.matchAll(/m\.t === '(\w+)'/g)].map((m) => m[1]));
  const deaf = [...emitted].filter((k) => !consumed.has(k));
  const dead = [...consumed].filter((k) => !emitted.has(k));
  t('E11c · every message the server sends the house has a branch in the house',
    deaf.length === 0, deaf.length ? `no branch for ${deaf.join(', ')}` : `emitted {${[...emitted].join(', ')}}`);
  t('E11d · and every branch in the house has something that sends it',
    dead.length === 0, dead.length ? `nothing sends ${dead.join(', ')}` : `consumed {${[...consumed].join(', ')}}`);
  t('E11 control · the two sets are read from the two files rather than declared here',
    emitted.size >= 2 && consumed.size >= 2 && emitted.size === consumed.size,
    `${emitted.size} emitted · ${consumed.size} consumed`);

  for (const o of opened) { try { o.ws.close(); } catch { /* gone */ } }
  await wait(150);
  await show.close();
}

// ---------------------------------------------------------------- E10 · the cameras are in the rooms
/**
 * 🚨 **`mapRooms` KEYED ON `s.name`, AND `name` IS THE DISPLAY NAME. FOUR OF SIX ROOMS WERE WRONG.**
 *
 * `spaces.js` gives a space an `id` — `gallery` — and a `name` for the audience — `THE LONG
 * GALLERY`. So `byName.get('gallery')` missed every time and every party room fell through to the
 * index-ordered spare list: **ballroom → gallery, gallery → study_w, study_w → service, service →
 * ballroom**. Nothing threw, because the fallback is deterministic and produces a complete map.
 *
 * The cost is not cosmetic. `siteFor` bolts each camera into the mapped space's corner and `sees()`
 * refuses any point outside `site.bounds`, so the camera watching the room the runner is in was
 * physically in a different room and could never see them — and the moment a STATIC does air,
 * `bugFor` prints the room the roster asked for over a picture of somewhere else, on television,
 * to a room that is about to argue about rooms.
 */
{
  const mapped = mapRooms(SPACES);
  const wrong = ROOMS.filter((r) => mapped[r]?.id !== r);
  t('E10 · every party room maps to the engine space of the same name',
    wrong.length === 0,
    wrong.length ? wrong.map((r) => `${r} → ${mapped[r]?.id}`).join(', ')
      : ROOMS.map((r) => `${r}→${mapped[r].id}`).join(' '));

  t('E10 control · the display name really is not the id, which is what the old key read',
    SPACES.every((s) => String(s.name).toLowerCase() !== String(s.id).toLowerCase()),
    SPACES.slice(0, 2).map((s) => `${s.id} != "${s.name}"`).join(' · '));

  // The half that shows on television: a camera in the wrong room prints the wrong room name.
  const bugs = ROOMS.map((r) => bugFor('STATIC', { index: 0, room: r }, { label: (x) => ROOM_LABEL[x] }));
  t('E10b · and the shot bug names the room the camera is actually standing in',
    bugs.every((b, i) => b.includes(ROOM_LABEL[ROOMS[i]])),
    bugs[0]);

  // Every camera site must sit inside the bounds of the room it claims — the property `sees()`
  // relies on and the one the old mapping silently broke.
  const rig = createRig({
    camera: { position: { set() {} }, lookAt() {}, fov: 0, updateProjectionMatrix() {} },
    room: null, worldSeed: 7, subjects: () => ({}), unlocked: () => 99,
  });
  const stray = rig.sites().filter((s) => {
    const sp = SPACES.find((x) => x.id === s.room);
    return !sp || s.x < sp.x0 || s.x > sp.x1 || s.z < sp.z0 || s.z > sp.z1;
  });
  t('E10c · every camera on the roster is bracketed inside the room it watches',
    stray.length === 0 && rig.sites().length > 0,
    stray.length ? stray.map((s) => `cam ${s.index} claims ${s.room} at (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`).join(', ')
      : `${rig.sites().length} sites, each inside its own room`);
}

// ---------------------------------------------------------------- E9 · the tells have subscribers
/**
 * 🚨 **EVERY AUTHORED HUNTER TELL WAS WIRED IN `game.js` AND UNWIRED HERE — AND THIS IS THE VIEW
 * WHOSE ENTIRE AUDIENCE IS A TELEVISION.** `hunter-ai.js` declares five hooks for the view to hang
 * sound and signal off — `onKill`, `onCommit`, `onDoor`, `onBang`, `onStage` — and documents them
 * as exactly that: *"ONE blow. Audio hangs off this."* One of the five was subscribed.
 *
 * The hook names are read out of the AI, so a sixth arriving there is a red line here rather than
 * a tell nobody hears.
 */
{
  const ai = readFileSync(new URL('../src/game/hunter-ai.js', import.meta.url), 'utf8');
  const hooks = [...new Set([...ai.matchAll(/this\.(on[A-Z]\w*)\s*=\s*null/g)].map((m) => m[1]))].sort();
  const view = readFileSync(new URL('../src/views/expedition.js', import.meta.url), 'utf8');
  const wired = (src) => hooks.filter((h) => new RegExp(`hunter\\.${h}\\s*=`).test(src));

  t('E9 arm · the AI\'s hooks were read out of the AI', hooks.length >= 5, hooks.join(' '));
  const unwired = hooks.filter((h) => !wired(view).includes(h));
  t('E9 · every tell the Hunter authors reaches the television',
    unwired.length === 0, unwired.length ? `no subscriber for ${unwired.join(', ')}` : hooks.join(' · '));

  // The same scanner on the survival view, which subscribes to four of the five. If it reported
  // five there, it would be matching mentions rather than subscriptions.
  const game = readFileSync(new URL('../src/views/game.js', import.meta.url), 'utf8');
  t('E9 control · the same scan finds an unsubscribed hook elsewhere, so it reads subscriptions',
    wired(game).length < hooks.length,
    `game.js subscribes ${wired(game).join('/')} — not ${hooks.filter((h) => !wired(game).includes(h)).join('/')}`);

  t('E9b · and the television is not silent: it imports the ear and drives it every frame',
    /from '\.\.\/audio\/audio\.js'/.test(view) && /setHunterThreat\(hunter\.threat/.test(view)
    && /playDoorBang\(/.test(view) && /initAudio\(/.test(view),
    'initAudio · setHunterThreat(threat, committed) · playDoorBang · playWallStage');
  t('E9b control · the scan can tell an absent cue from a present one',
    !/playGunshot\(/.test(view) && /playFurnBreak\(/.test(view),
    'no gunshot in a house with no guns; the growth cue is there');
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
