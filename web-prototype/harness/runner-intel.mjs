#!/usr/bin/env node
/**
 * 🚶 **runner-intel — AUTO-WALK, THE LATERAL DODGE, AND THE HIDE, EXECUTED RATHER THAN EYEBALLED.**
 *
 *   node harness/runner-intel.mjs
 *
 * John unlocked this on the sofa, 2026-09-01 (~10:20pm Brisbane), and the eight locks are quoted
 * against the checks that hold them. The design they answer to is `docs/design/runner-intel.md`
 * and `docs/slices/task-runner-intel.md`; the pads that shipped first are `harness/intel-pads.mjs`.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THIS GATE IS, AND WHAT IT LEAVES TO ITS NEIGHBOURS
 * ---------------------------------------------------------------------------------------------
 * `task-runner-intel.md` §9 reserved this filename for the BRAIN's gate with checks R1–R9. Two of
 * those turned out to be pad properties and were honoured early under `intel-pads.mjs`'s own
 * numbers — R5 (*a pin replaces*) is IP6 and R9's schema half is IP11 — so they are not repeated
 * here except where the BODY is the thing being asserted. What is here is the steering, the thumb,
 * the hide, and the wire the pin now travels on.
 *
 * ⚠️ **R1/R2/R3 — `missionFor` returning a KIND and a live resolver replacing
 * `spaceOfType(room.spaces, MISSION_ROOM)` — ARE NOT IMPLEMENTED AND ARE NOT ASSERTED.** That is
 * Stage 1 of the slice and this pass did not do it: `armMission` still sets `mission.room` from
 * the built gallery. RI13 states that out loud rather than letting the silence read as coverage,
 * which is `room-ghosts` RG5b's shape. A skip is never a pass.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 WHY THE ASSERTIONS RUN THE SHIPPED FUNCTIONS
 * ---------------------------------------------------------------------------------------------
 * `src/game/runner-intel.js` is pure — no THREE, no DOM — precisely so this file can execute the
 * real decisions instead of a copy of them. Where a rule can only be seen in the browser view,
 * this reads the SOURCE, and every such read normalises CRLF: `host-desync` H8 was red on one
 * machine and green in CI against byte-identical content because a multi-line pattern missed a
 * `\r`, and the machine that reddens was not the machine anyone was looking at.
 *
 * Pure node. No browser, no port, no `npm install`.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AUTOWALK, COVER, DODGE, RED, REPLAN_TRIGGERS, SABOTAGE, TELL, TELL_FORBIDDEN,
  clampToRoom, consumeLegs, coverNear, dodgeLateral, headingTo, hideTick, holdTell,
  lagHeading, legsFor, pinKey, redPassAt, replanReason,
} from '../src/game/runner-intel.js';
import { CUE_KEYS, CUE_KINDS, MOVE_KEYS, PIN_WIRE_KEYS, cueViolations, moveViolations, pinViolations, pinWireShape } from '../src/party/follow.js';
import { MISSION_DRILL, MISSION_PAINTING, missionFor, seekLine } from '../src/party/mission.js';
import { audienceFor } from '../net/party/entitle.js';
import { createRoom } from '../src/party/room.js';

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, '..', rel), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const t = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); }
  return c;
};

/**
 * Source with every comment removed.
 *
 * ⚠️ **NEEDED, AND THE REASON IS A CHECK THAT FAILED ON ITS OWN PROSE.** RI8e asserts that nothing
 * in the brain can reach the show's clock, by refusing the words `pause` / `freeze` / `stopClock`.
 * The header of `hideTick` explains at length that *"nothing here PAUSES anything"* — so the file
 * failed a scan of itself for saying, correctly, that it does not do the thing. A rule about CODE
 * has to be asked of code; this project's comments are load-bearing and are full of the words the
 * code is forbidden to contain.
 */
const codeOf = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const bedSrc = src('src/game/follow-bed.js');
const intelSrc = src('src/game/runner-intel.js');
const phoneSrc = src('src/views/party-phone.js');
const hostSrc = src('src/views/party-host.js');
const localSrc = src('net/party/local.mjs');

/* =================================================================================================
 * RI1 · LOCK 1 — the body walks the PIN, one door at a time, and never the true target
 * ============================================================================================== */

console.log('\n  auto-walk');

{
  /*
   * D3's four triggers and NO others. The order is the priority and `pin` is first: if `stall`
   * were tested first, a guide who re-pinned while her runner was wedged on a chair would get a
   * replan recorded as a stall, and *"no leg survives a pin change"* would hold by accident.
   */
  const base = { pinKey: 'a', phase: 'seek', legs: 3, since: 0, gained: 5 };
  const cases = [
    ['pin', { ...base, pinKey: 'b' }],
    ['phase', { ...base, phase: 'return' }],
    ['legs', { ...base, legs: 0 }],
    ['stall', { ...base, since: AUTOWALK.stallSec, gained: 0 }],
  ];
  t('RI1 · the four replan triggers are the four, and each one fires on its own',
    REPLAN_TRIGGERS.length === 4
    && cases.every(([why, now]) => replanReason(base, now) === why)
    && replanReason(base, base) === null,
    cases.map(([w]) => w).join(' · '));
  t('RI1b · `pin` outranks `stall` — a re-pin on a wedged body is a re-pin, not a stall',
    replanReason(base, { ...base, pinKey: 'b', since: 99, gained: 0 }) === 'pin',
    'D2: a second tap REPLACES');
  t('RI1d · two taps are two different pins, and a moved pin is a new one to two decimal places',
    pinKey({ x: 1, z: 2, roomId: 'a' }) !== pinKey({ x: 1, z: 2, roomId: 'b' })
    && pinKey({ x: 1, z: 2, roomId: 'a' }) === pinKey({ x: 1.001, z: 2, roomId: 'a' })
    && pinKey(null) === '' && pinKey({ x: NaN, z: 0 }) === '',
    'no pin and a broken pin are the same key, so neither replans forever');
  t('RI1c control · a body that is gaining ground is never replanned out from under itself',
    replanReason(base, { ...base, since: AUTOWALK.stallSec * 3, gained: AUTOWALK.stallGain }) === null
    && AUTOWALK.stallGain === 0.75 && AUTOWALK.stallSec === 2.0,
    `${AUTOWALK.stallGain} m in ${AUTOWALK.stallSec} s`);
}

{
  /*
   * 🚨 **R4 — every leg came from a `pathPortals` call made THIS replan.** `legsFor` takes the
   * answer and returns a fresh array, and the bed throws the old one away before calling it, so
   * there is no object identity that can survive a pin change. Asserted by identity, not by value.
   */
  const portals = [{ centre: { x: 1, z: 2 } }, { centre: { x: 3, z: 4 } }];
  const a = legsFor(portals, { x: 9, z: 9 });
  const b = legsFor(portals, { x: 5, z: 5 });
  t('RI2 · legs are built fresh from a live portal answer, goal last, nothing shared',
    a.length === 3 && a[2].x === 9 && b[2].x === 5
    && a.every((leg, i) => leg !== b[i]) && a[0] !== portals[0].centre,
    `${a.length} legs, ${a.map((l) => `${l.x},${l.z}`).join(' > ')}`);
  t('RI2b · a garbage portal answer produces legs, not NaNs walking into a wall',
    legsFor([{ centre: { x: NaN, z: 0 } }, null, { x: 2, z: 2 }], null).length === 1
    && legsFor(null, null).length === 0,
    'finite-or-dropped');
  const legs = legsFor(portals, { x: 9, z: 9 });
  consumeLegs(legs, { x: 1.1, z: 2.1 });
  t('RI2c · a reached leg is consumed and the next one becomes the target',
    legs.length === 2 && legs[0].x === 3 && AUTOWALK.arrive === 0.85,
    `arrive ${AUTOWALK.arrive} m — a doorway CENTRE, not a point to touch`);
}

{
  /*
   * The bed is where the live query lives, because `pathPortals` needs the scene. What this
   * asserts is that it is asked FROM THE RUNNER'S CURRENT POSITION on every replan — a cached
   * `from` would be the memorised route D4 forbids, wearing a live call as a costume.
   */
  t('RI3 · the bed asks the house live, from where she is standing, on every replan',
    /room\.pathPortals\?\.\(runner\.pos, _goal, ROUTE_MIN_W, ROUTE_MIN_H\)/.test(bedSrc)
    && /perf\.legs = \[\];\n\s*if \(!pin\) return;/.test(bedSrc)
    && /perf\.legs = legsFor\(portals/.test(bedSrc),
    'replanToPin clears, then re-asks');
  t('RI3b control · no authored waypoint list re-appeared (D4)',
    !/PATROL_ROUTE|WAYPOINTS|const ROUTE = \[/.test(bedSrc)
    && !/\bnavmesh\b/i.test(bedSrc)
    && !/'gallery'|"gallery"/.test(intelSrc) && !/chapel/i.test(intelSrc),
    'the brain has never heard of a room name');
  t('RI3c · the brain never learns which twin is real — the lie survives the walk',
    !/realFaceFor|emptyNail|twins/.test(intelSrc)
    && /identical/i.test(bedSrc.slice(bedSrc.indexOf('function jobGoal') - 2200, bedSrc.indexOf('function jobGoal'))),
    'no import of the real face anywhere in runner-intel.js');
}

/* =================================================================================================
 * RI4 · LOCK 2 — the stick is a LATERAL DODGE and cannot steer into another room
 * ============================================================================================== */

console.log('\n  the thumb');

{
  /*
   * 🚨 **`y` IS DROPPED IN ONE PLACE, IN THE BRAIN.** `dodgeLateral` takes a single axis and there
   * is no second parameter for a forward one, so a pad written by somebody else cannot restore
   * forward drive by sending a `y` again — the wire still carries it and the body still ignores it.
   */
  t('RI4 · the dodge takes ONE axis; there is nowhere to put a forward one',
    dodgeLateral.length === 3 && !/stickY/.test(intelSrc)
    && /export function dodgeLateral\(stickX, cur, dt\)/.test(intelSrc),
    'dodgeLateral(stickX, cur, dt)');
  const full = dodgeLateral(1, 0, 10);
  const back = dodgeLateral(-1, 0, 10);
  t('RI4b · full thumb reaches DODGE.reach and no further, either way',
    Math.abs(full - DODGE.reach) < 1e-3 && Math.abs(back + DODGE.reach) < 1e-3
    && DODGE.reach < 1,
    `${DODGE.reach} of a full stick`);
  t('RI4c · inside the deadzone the lateral decays to nothing',
    dodgeLateral(DODGE.dead - 0.001, 0, 1) === 0
    && Math.abs(dodgeLateral(0, DODGE.reach, 10)) < 1e-3,
    `dead ${DODGE.dead}`);
  t('RI4d · and it SMOOTHS — one frame of thumb is not one frame of teleport',
    dodgeLateral(1, 0, 1 / 60) > 0 && dodgeLateral(1, 0, 1 / 60) < DODGE.reach * 0.2,
    `${DODGE.rate}/s`);
}

{
  /*
   * *"Cannot steer into another room."* The probe is a point one `DODGE.probe` to the body's side
   * and the test is asked about THAT point only — the forward drive walks through doorways all
   * night, and a clamp that refused every room change would pin her where she started.
   */
  const at = { x: 0, z: 0 };
  const inside = () => 'r0.hall';
  const wall = (p) => (p.x === 0 && p.z === 0 ? 'r0.hall' : 'r0.study');
  t('RI5 · a sideways step that would leave the room is refused, and staying is allowed',
    clampToRoom(0.5, at, 0, inside) === 0.5
    && clampToRoom(0.5, at, 0, wall) === 0
    && clampToRoom(-0.5, at, 0, wall) === 0,
    `probe ${DODGE.probe} m to the side`);
  t('RI5b control · with no room oracle at all the dodge is passed through, not silently zeroed',
    clampToRoom(0.4, at, 0, null) === 0.4 && clampToRoom(0, at, 0, wall) === 0,
    'a missing test is not a refusal');
  t('RI5c · the bed really calls it, on the lateral only, every driven frame',
    /perf\.lateral = clampToRoom\(want, _probe, perf\.heading, \(p\) => roomIdAt\(p\)\)/.test(bedSrc)
    && /const want = dodgeLateral\(perf\.stick\.x, perf\.lateral, dt\)/.test(bedSrc)
    && !/dodgeLateral\(perf\.stick\.y/.test(bedSrc),
    'stick.x only');
}

{
  t('RI6 · the walk owns the heading and it LAGS — a body that snaps reads as a cursor',
    Math.abs(headingTo({ x: 0, z: 0 }, { x: 0, z: 1 })) < 1e-9
    && Math.abs(headingTo({ x: 0, z: 0 }, { x: 1, z: 0 }) - Math.PI / 2) < 1e-9
    && lagHeading(0, 1, 1 / 60) > 0 && lagHeading(0, 1, 1 / 60) < 0.12
    && AUTOWALK.lag === 5.5,
    `lag constant ${AUTOWALK.lag}, kept from the shipped performance terms`);
  t('RI6b · the bed hands the body a YAW and never a PITCH — the swing stays one shallow fan',
    /aimYaw: perf\.heading,/.test(bedSrc) && !/aimPitch:/.test(bedSrc),
    'target-sight G5 clause 4, from this end');
}

/* =================================================================================================
 * RI7 · LOCK 3 + 4 — hide is armour, armour needs furniture, and the clock keeps running
 * ============================================================================================== */

console.log('\n  hide, and the reason to');

{
  const props = [{ x: 1, z: 0, h: 1.1 }, { x: 40, z: 40, h: 2 }, { x: 0.2, z: 0.2, h: 0.2 }];
  const at = { x: 0, z: 0 };
  t('RI7 · cover is a real piece of furniture within reach, and a rug is not cover',
    coverNear(props, at)?.x === 1
    && coverNear([props[2]], at) === null
    && coverNear(props, { x: 20, z: 20 }) === null
    && coverNear([], at) === null,
    `radius ${COVER.radius} m, min height ${COVER.minHeight} m`);
  /*
   * 🚨 **THE LOCK: *"No stop-in-open-hall without cover."*** This is the single rule that keeps
   * the evil runner's sabotage surface closed to `SABOTAGE`'s four entries — a body that could
   * simply stand still in a corridor would burn the whole expedition clock with no button and no
   * tell, which is a sabotage the room can neither see nor argue about.
   */
  const held0 = { hiding: false, heldS: 0, quietS: 0, redS: 0, longestS: 0 };
  const openHall = hideTick(held0, { want: true, cover: null, red: false, dt: 5 });
  const behindIt = hideTick(held0, { want: true, cover: props[0], red: false, dt: 5 });
  t('RI7b · HOLD in an open hall does nothing; HOLD behind furniture hides',
    openHall.hiding === false && openHall.heldS === 0
    && behindIt.hiding === true && behindIt.heldS === 5,
    'hide is armour, and armour needs a wall');
  t('RI7c · releasing resumes the walk and zeroes the hold, keeping the longest',
    hideTick(behindIt, { want: false, cover: props[0], red: false, dt: 1 }).hiding === false
    && hideTick(behindIt, { want: false, cover: props[0], red: false, dt: 1 }).longestS === 5,
    'release resumes pathfinding to the pin');
  t('RI7d · the bed refuses the request in the same place, and the pad is never told',
    /const cover = perf\.hide \? coverNear\(coverPoints\(\), runner\.pos\) : null;/.test(bedSrc)
    && /perf\.hold = hideTick\(perf\.hold/.test(bedSrc)
    && !/coverNear\(|hideTick\(|cover: /.test(codeOf(phoneSrc)),
    'no cover detector in her hand');
}

{
  /*
   * 🔴 **THE RED PASS IS A CLOCK.** Not the hunter — that door is shut — so it takes a time and a
   * seed and nothing else. It cannot be read as intel because it carries none: no position, no
   * target, no argument about anybody. It is stage lighting, on the television, in front of eight
   * people, and that is the whole deniability mechanism.
   */
  t('RI8 · the red pass is a function of TIME and a SEED — no body, no room, no target',
    /export function redPassAt\(t, seed = 0\)/.test(intelSrc)
    && !/hunter|runner|\.pos|roomId/i.test(String(redPassAt))
    && redPassAt(0).on === true && redPassAt(RED.span + 0.1).on === false
    && Math.abs(redPassAt(RED.period).k - redPassAt(0).k) < 1e-9,
    `period ${RED.period}s, span ${RED.span}s · args: t, seed`);
  t('RI8b · it ramps in and back out rather than snapping a red frame on',
    redPassAt(RED.span / 2).k > 0.99 && redPassAt(0.01).k < 0.05
    && redPassAt(RED.span - 0.01).k < 0.05,
    'sin ramp across the sweep');
  t('RI8c · two seeds do not sweep in lockstep',
    redPassAt(0, 0).on === true && redPassAt(0, RED.span + 3).on === false
    && redPassAt(0, 1).k !== redPassAt(0, 0).k,
    'phase shifted by seed');
  t('RI8d · the TV draws it as a MESH, so the four-light rig did not grow (party-warm W23g)',
    /staged-red-pass/.test(bedSrc)
    && /redPass\.material\.opacity/.test(bedSrc)
    && (bedSrc.match(/new THREE\.PointLight/g) || []).length === 4,
    `${(bedSrc.match(/new THREE\.PointLight/g) || []).length} point lights, unchanged`);
  /*
   * Quiet and red accumulate on SEPARATE counters. That split is the tell John named — *"good
   * runner hides when it is red, evil runner hides when it is quiet"* — and it has to exist as
   * two numbers or the recap has nothing to be honest about.
   */
  let h = { hiding: false, heldS: 0, quietS: 0, redS: 0, longestS: 0 };
  const cover = { x: 0, z: 0, d: 0 };
  for (let i = 0; i < 60; i++) h = hideTick(h, { want: true, cover, red: i < 20, dt: 0.1 });
  t('RI8e · quiet time and red time are counted apart, and the clock never stops',
    Math.abs(h.redS - 2) < 1e-6 && Math.abs(h.quietS - 4) < 1e-6
    && Math.abs(h.heldS - 6) < 1e-6
    // 🚨 The strongest available form of *"the clock still runs"*: the brain IMPORTS NOTHING, so
    // there is no path from it to `show.js`'s timer at all. (`Object.freeze` is why this is not a
    // word scan — the module is full of frozen constants, and a scan for "freeze" hits every one.)
    && !/^\s*import /m.test(codeOf(intelSrc))
    && !/stopClock|remainingMs|holdMsFor|SECONDS/.test(codeOf(intelSrc)),
    `${h.redS.toFixed(1)}s red · ${h.quietS.toFixed(1)}s quiet · nothing here can reach the show clock`);
}

/* =================================================================================================
 * RI9 · THE TELL — and it names nobody
 * ============================================================================================== */

console.log('\n  the tell');

{
  t('RI9 · a long quiet hold is said out loud; a short one is not said at all',
    holdTell({ quietS: TELL.quietFloor, longestS: TELL.longFloor }).length > 0
    && holdTell({ quietS: TELL.quietFloor - 0.1, redS: 0, longestS: 0 }) === ''
    && holdTell({}) === '' && holdTell() === '',
    `floors ${TELL.quietFloor}s / ${TELL.longFloor}s`);
  t('RI9b · a hold during a red pass reads differently from a hold in the quiet',
    holdTell({ redS: 6 }) !== holdTell({ quietS: 6 })
    && holdTell({ redS: 6 }).length > 0 && holdTell({ quietS: 6 }).length > 0,
    `red: "${holdTell({ redS: 6 })}" · quiet: "${holdTell({ quietS: 6 })}"`);
  /*
   * 🚨 **"Recap does not name whose thumb."** Swept rather than spot-checked: every reachable
   * sentence, against every forbidden word. The runner's seat is PUBLIC (`pair.runner` is
   * audience `all`), so a line that attributed the hold would be an accusation the SHOW made
   * rather than one a player made, and the whole night is the room arguing about what it saw.
   */
  const said = new Set();
  for (const q of [0, 3, 5, 12]) for (const r of [0, 3, 5, 12]) for (const L of [0, 5, 12, 30]) {
    said.add(holdTell({ quietS: q, redS: r, longestS: L }));
  }
  const lines = [...said].filter(Boolean);
  const named = lines.filter((s) => TELL_FORBIDDEN.some((w) => s.toLowerCase().includes(w)));
  t('RI9c · no reachable hold line names a person, a seat or a motive',
    lines.length > 0 && named.length === 0 && TELL_FORBIDDEN.includes('sabotage'),
    `${lines.length} distinct lines over 64 states, ${named.length} naming anybody`);
  t('RI9d control · the sweep can see — a planted line with a seat name in it is caught',
    ['The runner hid.', 'Evil stopped in the hall.']
      .every((s) => TELL_FORBIDDEN.some((w) => s.toLowerCase().includes(w))),
    'the needle proves the magnet');
  t('RI9e · the durations reach the recap as three numbers on the world report, never a list',
    /holdQuiet: \+perf\.hold\.quietS\.toFixed\(1\)/.test(bedSrc)
    && /holdRed: \+perf\.hold\.redS\.toFixed\(1\)/.test(bedSrc)
    && /holdLongest: \+perf\.hold\.longestS\.toFixed\(1\)/.test(bedSrc)
    && !/holdAt|holdRooms|holdList/.test(bedSrc),
    'a count invites "which four?", and the answer would be a route');
}

/* =================================================================================================
 * RI10 · THE PIN, ON THE WIRE — and the television is told and still draws nothing
 * ============================================================================================== */

console.log('\n  the wire');

{
  t('RI10 · the pin message is a CLOSED four-field schema, and a route cannot ride it',
    pinViolations({ t: 'pin', x: 1.5, z: -2, roomId: 'r0.hall', kind: 'room' }).length === 0
    && pinViolations({ t: 'pin', x: 1, z: 2, path: [1, 2] }).length === 1
    && pinViolations({ t: 'pin', x: 1, z: 2, kind: 'route' }).length === 1
    && pinViolations({ t: 'pin', x: NaN, z: 2 }).length === 1
    && pinViolations(null).length === 1
    && PIN_WIRE_KEYS.length === 5,
    PIN_WIRE_KEYS.join(','));
  t('RI10b · and a shape that fails validation becomes null, never a half-built pin',
    pinWireShape({ x: 'nope', z: 2 }) === null
    && pinWireShape(null) === null
    && JSON.stringify(pinWireShape({ x: '3.5', z: -2, roomId: 'r1', kind: 'edge' }))
      === '{"x":3.5,"z":-2,"roomId":"r1","kind":"edge"}');
  t('RI10c · four `you.pin.*` rows, all at `crew` — the seated phones and the TV are not told',
    ['x', 'z', 'roomId', 'kind'].every((k) => audienceFor(`you.pin.${k}`) === 'crew')
    && audienceFor('you.at.x') === 'runner' && audienceFor('you.at.z') === 'runner',
    'intel-pads IP11b–IP11d hold the projection end');
}

{
  /*
   * A LIVE room, so *"the guide pins and nobody else can"* is executed rather than read. The
   * sender check lives in `room.setPin` because `playEpisode` clears every `seatRole` before the
   * run is over — see `setWorld`'s header — so the durable answer to "who is the guide" is
   * `state.pair`, and asking the socket would let a stale seat write the store.
   */
  const r = createRoom({ count: 8, castSeed: 11, worldSeed: 3, send: () => {}, emit: () => {} });
  r.start();
  const ids = r.state.players.map((p) => p.id);
  r.state.pair = { runner: ids[0], guide: ids[1] };
  const one = r.setPin(ids[1], { x: 1, z: 2, roomId: 'r0.hall', kind: 'room' });
  const two = r.setPin(ids[1], { x: 8, z: 9, roomId: 'r0.study', kind: 'room' });
  const byRunner = r.setPin(ids[0], { x: 0, z: 0, roomId: 'r0.void', kind: 'room' });
  const bySeated = r.setPin(ids[4], { x: 0, z: 0, roomId: 'r0.void', kind: 'room' });
  t('RI11 · only the guide may pin — the runner and a seated phone are refused',
    one?.x === 1 && byRunner === null && bySeated === null
    && r.state.pin.x === 8,
    `guide ok · runner ${byRunner} · seated ${bySeated}`);
  t('RI11b · a second pin REPLACES; there is one slot and no list (D2)',
    two?.x === 8 && r.state.pin.roomId === 'r0.study'
    && !Array.isArray(r.state.pin)
    && Object.keys(r.state.pin).join(',') === 'x,z,roomId,kind',
    JSON.stringify(r.state.pin));
  t('RI11c · a malformed pin clears rather than storing half of one',
    r.setPin(ids[1], { x: 'over there', z: 2 }) === null && r.state.pin === null);
  r.setPin(ids[1], { x: 4, z: 4, roomId: 'r0.hall', kind: 'room' });
  r.beginCasting();
  t('RI11d · a new Casting drops the pin — it belonged to the pair that made it',
    r.state.pin === null,
    'else the NEXT runner walks at a door the LAST guide picked');
}

{
  t('RI12 · the transport refuses a bad shape at the door and pushes only to the TV',
    /if \(msg\.t === 'pin' && self && !isTV && self\.playerId\)/.test(localSrc)
    && /if \(pinViolations\(msg\)\.length\) return;/.test(localSrc)
    && /const stored = room\.game\.setPin\(self\.playerId, msg\);/.test(localSrc)
    && /for \(const s of room\.game\.sockets\) if \(s\.isTV\) push\(room, s\.id, out\);/
      .test(localSrc.slice(localSrc.indexOf("msg.t === 'pin'"))),
    'directed like t:move, never fanned');
  t('RI12b · the phone really sends it, once per tap, as an assignment',
    /state\.client\?\.send\(\{ t: 'pin', x: wire\.x, z: wire\.z, roomId: wire\.roomId, kind: wire\.kind \}\)/
      .test(phoneSrc)
    && (phoneSrc.match(/state\.pin = /g) || []).length === 1
    && !/state\.pin\.push|pins\s*[:=]\s*\[/.test(phoneSrc),
    'one slot, one send');
  /*
   * 🚨 **RI13 IS D9's CONTROL AND IT IS THE POINT OF THE WHOLE SPLIT.** The television is TOLD the
   * pin — it owns the body, so it must be — and it may not DRAW it. `party-loop.md`'s "Do not" #1
   * is a rule about the picture, not about what the renderer knows; it already knows where every
   * body in the house is, because it is the one moving them.
   */
  const hostPaints = /guideMapSvg|guidePinPad|bezelHtml|gm-pin|pin-chip|pin-say/.test(hostSrc);
  const hostForwards = /sendCue\(\{ kind: 'pin'/.test(hostSrc);
  const planted = ['<div class="gm-pin">', '${guidePinPad(scope)}', 'guideMapSvg({ seed })']
    .filter((s) => /guideMapSvg|guidePinPad|bezelHtml|gm-pin|pin-chip|pin-say/.test(s));
  t('RI13 · the TV forwards the pin and paints none of it — no map, no bearing, no route (D9)',
    hostForwards && !hostPaints && planted.length === 3
    && !/pin/i.test(String(CUE_KEYS.run ?? '')),
    `forward ${hostForwards ? 'yes' : 'MISSING'} · paint ${hostPaints ? 'HIT' : 'clean'}`
    + ` · control ${planted.length}/3 planted lines caught`);
  t('RI13b · `pin` is a declared cue kind with a closed allow-list of its own',
    CUE_KINDS.includes('pin')
    && cueViolations({ kind: 'pin', x: 1, z: 2, roomId: 'r0', pinKind: 'room' }).length === 0
    && cueViolations({ kind: 'pin', x: 1, z: 2, route: [1] }).length === 1,
    CUE_KEYS.pin.join(','));
}

/* =================================================================================================
 * RI14 · LOCK 4 — the sabotage surface is closed, and there is no button on it
 * ============================================================================================== */

console.log('\n  sabotage, and what is not on the pad');

{
  t('RI14 · the sabotage surface is four ordinary controls used at the wrong moment',
    SABOTAGE.length === 4
    && SABOTAGE.every((s) => ['aim', 'act', 'voice'].includes(s.via))
    && SABOTAGE.filter((s) => s.at === 'job').length === 3,
    SABOTAGE.map((s) => s.id).join(' · '));
  t('RI14b · and there is no sabotage VERB anywhere on the wire',
    !/t: 'sabotage'|t: 'betray'|t: 'fail'|sabotageViolations/.test(localSrc)
    && !/t: 'sabotage'|data-sabotage|sabotage-btn/.test(phoneSrc)
    && !/sabotage/i.test(src('net/party/entitle.js')),
    'no verb, no row, no button');
  /*
   * 🗣️ **LOCK 5 — the six fake buttons are gone.** They printed *"buttons send nothing"* over a
   * row of buttons, which is exactly what was wrong with them, and one had grown teeth: the DRILL
   * hold refused to start until a decorative word had been tapped. `expedition-jobs` J7/J7b hold
   * the copy end; this is the pad-shape end.
   */
  t('RI14c · CLOSE / LATE / GOING and GO / HOLD are copy now, not controls',
    !/data-voice|voice-btn/.test(phoneSrc)
    && /say-line/.test(phoneSrc) && /FOOTSTEPS/.test(phoneSrc)
    && !/voice-row/.test(phoneSrc),
    'one SAY line, one FOOTSTEPS line, nothing to press');
  t('RI14d · HIDE is the one control that was ADDED, and it is a hold like RUN and DRILL',
    /id="hide-btn"/.test(phoneSrc)
    && /state\.pad\.hide = true/.test(phoneSrc)
    && MOVE_KEYS.includes('hide')
    && moveViolations({ t: 'move', x: 0, y: 0, hide: true }).length === 0
    && CUE_KEYS.move.includes('hide'),
    MOVE_KEYS.join(','));
  /*
   * 🛠️ **AND THE HOLD THAT WAS ALREADY THERE FINALLY ARRIVES.** `act` was validated by the wire,
   * relayed by the server and read by the bed, and `party-host.js` `flushMove` dropped it — so on
   * every DRILL night the mount could not fill and the run could only end on the backstop clock,
   * dark, with nothing red anywhere. Found 2026-09-01 while wiring auto-walk.
   */
  t('RI14e · the TV forwards `act` and `hide` to the body — the drill hold reaches the mount',
    /act: \+m\.act \|\| 0,/.test(hostSrc) && /hide: !!m\.hide,/.test(hostSrc)
    && /perf\.act = \+c\.act \|\| 0;/.test(bedSrc) && /perf\.hide = !!c\.hide;/.test(bedSrc)
    && /act: \+p\.act \|\| 0,/.test(phoneSrc) && /hide: !!p\.hide,/.test(phoneSrc),
    'phone -> server -> TV -> bed, all four hops');
}

/* =================================================================================================
 * RI15 · LOCK 7 — the seek line advances, and LOCK 8's two absences hold
 * ============================================================================================== */

console.log('\n  the copy, and the two screens');

{
  const smash = missionFor(1);
  const drill = missionFor(3);
  t('RI15 · standing in the mission room changes the line; standing elsewhere does not',
    seekLine(smash, { here: 'r0.gallery', missionRoom: 'r0.gallery' }) !== smash.seek
    && seekLine(smash, { here: 'r0.hall', missionRoom: 'r0.gallery' }) === smash.seek
    && seekLine(smash, { here: null, missionRoom: null }) === smash.seek
    && !/Find the/.test(seekLine(drill, { here: 'g', missionRoom: 'g' })),
    `"${seekLine(smash, { here: 'g', missionRoom: 'g' })}"`);
  t('RI15b · and the phases still win over the room — no fourth phase was invented (D1)',
    seekLine(smash, { here: 'g', missionRoom: 'g', phase: 'return' }) === smash.home
    && seekLine(smash, { here: 'g', missionRoom: 'g', phase: 'done' }) === 'Home. That is the run.'
    && smash === MISSION_PAINTING && drill === MISSION_DRILL,
    'seek -> return -> done, unchanged');
  t('RI15c · the pad passes its own room in, and the two seats read different sources',
    /missionLine\(frame, frame\?\.you\?\.here \?\? null\)/.test(phoneSrc)
    && /missionLine\(frame, scope\?\.hereId \?\? null\)/.test(phoneSrc),
    'you.here for the runner, scope.hereId for the guide');
}

{
  /*
   * LOCK 8, both halves, as absences. The runner's phone has no map and no 3D (D13); the
   * television has neither and never had. The guide keeps her one-door-ahead scope.
   */
  t('RI16 · the runner pad is still a pad — no map, no 3D, and the bezel is the bearing',
    !/warmUrl\(/.test(phoneSrc) && !/runner-chase-layer/.test(phoneSrc)
    && /const bez = runnerPad\(frame\?\.you\?\.at \?\? null, frame\?\.you\?\.pin \?\? null/.test(phoneSrc)
    && /Eyes on the TV/.test(phoneSrc),
    'Runner D Frame Bezel, fed by the wire');
  t('RI16b · the guide map is the primary surface and is still one door deep',
    /class="guide-sheet"/.test(phoneSrc)
    && /\.guide-sheet \.guide-map \{ max-height:58vh/.test(src('src/party/night-skin.js'))
    && /guidePad\(seed, meMark, state\.pin\)/.test(phoneSrc)
    && !/whole-house|fullPlan|flyoverAll/.test(phoneSrc),
    'map first, chips under it, no flyover restored');
}

/* =================================================================================================
 * RI17 · WHAT THIS PASS DID NOT DO — said out loud, because a silence reads as coverage
 * ============================================================================================== */

{
  /*
   * 🚨 **`room-ghosts` RG5b's SHAPE: a zero stated is not a zero hidden.** Stage 1 of
   * `task-runner-intel.md` — `missionFor` returning a KIND and a live resolver replacing the two
   * hard-coded `spaceOfType` lookups — was NOT done in this pass. `armMission` still sets
   * `mission.room` from the built gallery, and `MISSION_PAINTING.room` is still the string
   * `gallery`. This assertion records that as the current state so the next pass finds a red line
   * rather than an assumption, and it goes RED the day the kind lands, which is when somebody has
   * to come back and write R1–R3 properly.
   */
  const stillRoomed = MISSION_PAINTING.room === 'gallery' && MISSION_DRILL.room === 'gallery';
  const stillLookedUp = /spaceOfType\(room\.spaces, MISSION_ROOM\)/.test(bedSrc);
  t('RI17 guard · Stage 1 (mission KIND + live resolver) is NOT in this pass, and says so',
    stillRoomed && stillLookedUp,
    'R1/R2/R3 unwritten · goes RED the day `missionFor` returns a kind · then write them');
}

/* =================================================================================================
 * RI18 · THE LIVE ROOM — the pin's journey, photographed on real frames
 *
 * 🚨 **EVERYTHING ABOVE THIS LINE IS ABOUT BYTES AND TABLES, AND THAT IS THE `whisper-split`
 * LESSON EXACTLY.** `link-merge` L10–L14 proved the whisper's privacy on the wire and every check
 * was about structure; the chromes were template literals in a browser view, so *"the partner pad
 * shows the words and a third does not"* had only ever been checked by opening six tabs. RI10c
 * asks the entitlement TABLE what `you.pin.x` is for. This asks NINE ACTUAL SOCKETS what they
 * were sent.
 *
 * One server, one television, eight handsets, a real casting, a real pair, one tap of a pin chip.
 * Then every frame every socket received is swept for the word — including the RAW BYTES, because
 * a parse that silently dropped a field would hide a leak from the first question and not the
 * second.
 * ============================================================================================== */

console.log('\n  a live room');

{
  const { startServer, castingBackstop } = await import('../net/party/local.mjs');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const PORT = 5352;                 // not 5178 / 5181 / 5184, and not another gate's port

  const open = (url) => new Promise((resolve) => {
    const ws = new WebSocket(url);
    const frames = [];
    const box = {
      ws, frames, welcome: null,
      send: (o) => { try { ws.send(JSON.stringify(o)); } catch { /* a closed pad cannot send */ } },
      close: () => { try { ws.close(); } catch { /* already gone */ } },
      of: (type) => frames.map((f) => f.msg).filter((m) => m?.t === type),
      last: (type) => box.of(type).at(-1) ?? null,
      since: (n) => frames.slice(n).map((f) => f.raw).join('\n'),
    };
    ws.onmessage = (e) => {
      const raw = String(e.data);
      let msg = null; try { msg = JSON.parse(raw); } catch { /* keep the bytes anyway */ }
      frames.push({ raw, msg });
      if (msg && (msg.t === 'welcome' || msg.t === 'full')) { box.welcome = msg; resolve(box); }
    };
    ws.onerror = () => resolve(box);
    setTimeout(() => resolve(box), 1500);
  });

  const srv = startServer({ port: PORT, count: 8, castSeed: 31, worldSeed: 9, code: 'pin' });
  await sleep(140);
  const base = `ws://localhost:${PORT}/?room=pin`;
  const tv = await open(`${base}&host=1`);
  const phones = [];
  for (let i = 0; i < 8; i++) phones.push(await open(base));
  await sleep(120);

  const NAMES = ['John', 'Ellie', 'Ada', 'Ben', 'Cy', 'Dee', 'Eli', 'Fox'];
  phones.forEach((p, i) => p.send({ t: 'name', name: NAMES[i] }));
  await sleep(110);
  tv.send({ t: 'start' });
  await sleep(90);
  tv.send({ t: 'casting' });
  await sleep(140);

  const room = srv.rooms.get('pin');
  const idOf = (n) => room.game.state.players.find((p) => p.name === n)?.id ?? null;
  const RUNNER = idOf('Ada'), GUIDE = idOf('Ben');
  phones.forEach((p) => p.send({ t: 'ballot', runner: RUNNER, guide: GUIDE }));
  await sleep(200);
  castingBackstop(room);              // its own header invites the direct call; no 45s wait
  await sleep(200);

  /*
   * ⚠️ **THE WORLD REPORT FIRST, AND NOT ONLY TO EXERCISE `you.at`.** `setWorld` is what
   * re-asserts the seat roles from `state.pair` — `playEpisode` clears every `seatRole` before the
   * live run is over, which its own header explains — so a pin sent before the TV has reported
   * once would be refused for the least interesting possible reason.
   */
  tv.send({
    t: 'world',
    runner: { room: 'r0.gallery', x: 4.25, z: -1.5 },
    hunter: { room: 'r0.cellar', x: 12, z: 8 },
    mission: {
      phase: 'seek', room: 'r0.gallery', job: 'smash',
      holdQuiet: 5.5, holdRed: 1.2, holdLongest: 9.4,
    },
    view: 'top',
  });
  await sleep(180);

  const byId = new Map(phones.map((p) => [p.welcome?.playerId, p]));
  const runnerPad = byId.get(RUNNER);
  const guidePad = byId.get(GUIDE);
  const seatedPad = phones.find((p) => ![RUNNER, GUIDE].includes(p.welcome?.playerId));

  t('RI18 arm · a real pair is cast on nine live sockets, and the TV has reported a world',
    room.game.state.pair?.runner === RUNNER && room.game.state.pair?.guide === GUIDE
    && !!runnerPad && !!guidePad && !!seatedPad
    && runnerPad.last('state')?.frame?.you?.here === 'r0.gallery',
    `pair ${room.game.state.pair?.runner === RUNNER ? 'Ada' : 'MISSING'}`
    + ` / ${room.game.state.pair?.guide === GUIDE ? 'Ben' : 'MISSING'}`
    + ` · here=${runnerPad?.last('state')?.frame?.you?.here}`);
  t('RI18b · the widened world report is ACCEPTED — three hold durations reach room state',
    room.game.state.world?.mission?.holdQuiet === 5.5
    && room.game.state.world?.mission?.holdLongest === 9.4,
    `quiet ${room.game.state.world?.mission?.holdQuiet}s`
    + ` · longest ${room.game.state.world?.mission?.holdLongest}s`);
  t('RI18c · the runner is told where she is standing; nobody else is',
    runnerPad.last('state')?.frame?.you?.at?.x === 4.25
    && guidePad.last('state')?.frame?.you?.at === undefined
    && seatedPad.last('state')?.frame?.you?.at === undefined,
    'you.at is `runner` audience — proprioception, not the map');

  // ---- the tap
  const seenBefore = { runner: runnerPad.frames.length, seated: seatedPad.frames.length };
  guidePad.send({ t: 'pin', x: 6.5, z: -2.25, roomId: 'r0.gallery', kind: 'room' });
  await sleep(220);

  const runnerPin = runnerPad.last('state')?.frame?.you?.pin ?? null;
  const guidePin = guidePad.last('state')?.frame?.you?.pin ?? null;
  const seatedPin = seatedPad.last('state')?.frame?.you?.pin ?? null;
  const tvPin = tv.last('pin');
  t('RI18d · one tap reaches BOTH crew phones, with the same four fields',
    runnerPin?.x === 6.5 && runnerPin?.roomId === 'r0.gallery'
    && guidePin?.x === 6.5 && guidePin?.kind === 'room'
    && Object.keys(runnerPin).sort().join(',') === 'kind,roomId,x,z',
    JSON.stringify(runnerPin));
  /*
   * 🚨 **TWO GUARDS STAND HERE AND BOTH HAD TO BE DEFEATED TO MAKE THIS RED**, which was measured
   * rather than assumed. Widening the four `you.pin.*` rows to `all` on its own reddens RI10c and
   * leaves this GREEN — because `room.js` only OFFERS the field to a socket whose seat role is
   * runner or guide, the same belt-and-braces `you.here` has had since it shipped. The leak only
   * reaches a seated handset when the table AND the frame builder are both wrong, and that is
   * exactly why both ends are checked: RI10c is the table, this is nine real sockets.
   */
  t('RI18e · and it reaches NO seated phone — swept over the raw bytes, not the parse',
    seatedPin === null
    && !/"pin"/.test(seatedPad.since(seenBefore.seated))
    && !/6\.5/.test(seatedPad.since(seenBefore.seated)),
    `${seatedPad.frames.length - seenBefore.seated} frames since the tap, none carrying it`);
  t('RI18f control · the sweep can see — the same sweep over the RUNNER frames finds it',
    /"pin"/.test(runnerPad.since(seenBefore.runner))
    && /6\.5/.test(runnerPad.since(seenBefore.runner)),
    'a needle where the needle provably is');
  t('RI18g · the TELEVISION is told, as a directed control input',
    tvPin?.x === 6.5 && tvPin?.z === -2.25 && tvPin?.roomId === 'r0.gallery'
    && tv.of('pin').length === 1,
    `${tv.of('pin').length} pin push to the TV · ${JSON.stringify(tvPin)}`);

  // ---- the fail-CLOSED direction, live: anybody who is not the guide reaches nobody
  const before = JSON.stringify(room.game.state.pin);
  seatedPad.send({ t: 'pin', x: 99, z: 99, roomId: 'r0.void', kind: 'room' });
  runnerPad.send({ t: 'pin', x: 77, z: 77, roomId: 'r0.void', kind: 'room' });
  await sleep(200);
  t('RI18h · a seated phone and the RUNNER herself are both refused, live',
    JSON.stringify(room.game.state.pin) === before
    && room.game.state.pin.x === 6.5
    && tv.of('pin').length === 1
    && !/"x":s*99|"x":s*77|r0.void/.test(runnerPad.since(0)),
    'the ballot grants the map, not the willingness to send');

  // ---- and a second tap REPLACES, on the wire and not only in the store
  guidePad.send({ t: 'pin', x: 1.25, z: 3.5, roomId: 'r0.hall', kind: 'room' });
  await sleep(200);
  t('RI18i · a second tap replaces the first everywhere — one pin, never two (D2)',
    room.game.state.pin.x === 1.25
    && runnerPad.last('state')?.frame?.you?.pin?.x === 1.25
    && tv.of('pin').length === 2
    && !Array.isArray(room.game.state.pin),
    `${tv.of('pin').length} taps pushed · store holds ${JSON.stringify(room.game.state.pin)}`);

  tv.close();
  for (const p of phones) p.close();
  await sleep(80);
  srv.close?.();
  await sleep(60);
}

console.log(`\n  reading · auto-walk arrives at ${AUTOWALK.arrive} m`
  + ` · dodge reaches ${DODGE.reach} of a stick, ${DODGE.probe} m of probe`
  + ` · cover within ${COVER.radius} m`
  + ` · a red pass every ${RED.period}s for ${RED.span}s`);
console.log(`  reading · ${SABOTAGE.length} ways to sabotage, ${SABOTAGE.filter((s) => s.at === 'job').length} of them at the job, 0 buttons`);
console.log(`\n  ${pass} ok · ${fail} fail\n`);
process.exit(fail ? 1 : 0);
