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
 * 🎯 **2026-09-02 (~8:07am Brisbane) — THE GUIDE PINS THE JOB, AND THE THUMB STOPPED PICKING IT.**
 * ---------------------------------------------------------------------------------------------
 * *"guides need to also be able to pin objectives like the paintings or the camera install
 * position."*
 *
 * RI19 is the chips, their privacy and the pin's new kinds; RI20 is the walk itself, driven. The
 * ADDITION is easy to see and the REMOVAL is not, so it is stated here as well as at RI19g: the
 * overnight `jobGoal` read `perf.stick.x` and a nudge picked a twin. With the thumb choosing the
 * face a guide who says *"left wall"* is decoration, and the twin smash stops being a thing two
 * people do together. RI19g restates that rule as an executed negative rather than describing it,
 * which is `expedition-jobs` J7's shape.
 *
 * ⚠️ **RI20 EXISTS BECAUSE EVERYTHING ELSE HERE CHECKS ONE LINK.** RI19d proves the resolver reads
 * a name, RI2 proves the legs come from a live portal answer, RI6 proves the heading lags — and
 * none of them proves she ARRIVES, which is the whole feature. That gap is `whisper-split`'s shape:
 * a chain of individually-correct links whose end-to-end behaviour had only been seen in a browser.
 * RI20 is not a physics test and must not become one — there is no collider in it and none of its
 * numbers are about a chair being in the way. That is `target-sight`'s job, and it is green.
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
 * ⚠️ **AND EVERY SUCH READ GOES THROUGH `codeOf`, BECAUSE THIS PROJECT'S COMMENTS ARE
 * LOAD-BEARING.** They are full of the exact words the code is forbidden to contain, and three
 * checks in this file have already caught prose rather than behaviour: RI8e caught `hideTick`'s
 * header saying it does not pause the clock; RI3c caught `objectives.js`'s header saying it does
 * not import `realFaceFor`; RI12b caught `bindPinPad`'s comment explaining the pin slot. A ban is
 * the right gate for *"this does not exist"* and the wrong one for *"this must not be REACHED"* —
 * `party-warm` W47c learned the same thing about the feed count.
 *
 * Pure node. No browser, no port, no `npm install`.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AUTOWALK, COVER, DODGE, RED, REPLAN_TRIGGERS, SABOTAGE, TELL, TELL_FORBIDDEN,
  clampToRoom, consumeLegs, coverNear, dodgeLateral, headingTo, hideTick, holdTell,
  lagHeading, legKey, legsFor, pinKey, pinClocksRecap, redPassAt, replanReason, unstickLegs,
} from '../src/game/runner-intel.js';
import { CUE_KEYS, CUE_KINDS, MOVE_KEYS, PIN_KINDS, PIN_WIRE_KEYS, WORLD_MISSION_KEYS, cueViolations, moveViolations, pinViolations, pinWireShape } from '../src/party/follow.js';
import {
  OBJECTIVE_KINDS, SAY_FORBIDDEN, mountFor, objectiveGoal, objectiveSay, objectiveSpots, unionRect,
} from '../src/party/objectives.js';
import { JOB, camHang } from '../src/party/jobs.js';
import { camKeepOuts } from '../src/game/furn-layout.js';
import { planRegions } from '../src/party/mansion.js';
/*
 * ⚠️ **ALIASED, BECAUSE THE LIVE BLOCK BELOW NAMES TWO SOCKETS `runnerPad` AND `guidePad`.** Those
 * are block-scoped and would not actually shadow these, but a reader hitting `guidePad(...)` twice
 * in one file with two different meanings is exactly the confusion that makes a green gate hard to
 * trust. The pad MODELS keep the `-Shape` suffix here; the sockets keep the plain name.
 */
import {
  RUNNER_PAD_KEYS, guidePad as guidePadShape, padLeaks, runnerPad as runnerPadShape,
} from '../src/party/intel-pad.js';
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
const objSrc = src('src/party/objectives.js');
/*
 * ⚠️ **`codeOf` EARNED ITS KEEP TWICE MORE ON 2026-09-02.** RI3c's first draft banned
 * `realFaceFor` from `objectives.js` and caught that module's own header saying *"Nothing in this
 * file imports `realFaceFor`"* — the sentence a reader most needs. RI12b's count of
 * `state.pin = ` caught `bindPinPad`'s comment explaining the slot. Same lesson as RI8e above and
 * as `party-warm` W47c: a whole-file ban is the right gate for *"this does not exist"* and the
 * wrong one for *"this must not be REACHED"*.
 */
const objCode = codeOf(objSrc);
const phoneCode = codeOf(src('src/views/party-phone.js'));
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
    && /perf\.legs = \[\];\n\s*const goal = walkGoal\(\);\n\s*if \(!goal\) return;/.test(bedSrc)
    && /function walkGoal/.test(bedSrc)
    && /function pinGoal/.test(bedSrc)
    && /legsFor\(portals, goal\)/.test(bedSrc),
    'replanToPin clears, then re-asks');
  t('RI3b control · no authored waypoint list re-appeared (D4)',
    !/PATROL_ROUTE|WAYPOINTS|const ROUTE = \[/.test(bedSrc)
    && !/\bnavmesh\b/i.test(bedSrc)
    && !/'gallery'|"gallery"/.test(intelSrc) && !/chapel/i.test(intelSrc),
    'the brain has never heard of a room name');
  /*
   * ⚠️ **THE WINDOW MOVED TO `resolveObjective` ON 2026-09-02 AND THE SECOND CLAUSE IS NEW.** The
   * old check watched the prose above `jobGoal`, which was where the target used to be chosen; the
   * target is now chosen by the guide's pin and resolved in `resolveObjective`, so that is where
   * the "they are identical" argument has to be readable. The clause that actually got stronger is
   * the third one: `objectives.js` is the module that turns a chip into a target and it must not be
   * able to import the two functions that know which target is real, because a chip that could sort
   * them would put the guide's private card on a board she taps in front of the room.
   */
  t('RI3c · neither the brain nor the chips learn which twin is real — the lie survives the walk',
    !/realFaceFor|emptyNail|twins/.test(intelSrc)
    && !/realFaceFor|drillShotFor/.test(objCode)
    && /identical/i.test(bedSrc.slice(Math.max(0, bedSrc.indexOf('function resolveObjective') - 2600),
      bedSrc.indexOf('function resolveObjective'))),
    'no import of the real face in runner-intel.js or objectives.js');
}

/* =================================================================================================
 * RI23 · UNSTICK — a stall replan must not re-issue the blocked first leg
 *
 * CAST 8-bot: the runner wedges on a doorframe, stall fires, pathPortals from the same room
 * returns the same doorway, she walks into it again. RI1 is green (stall is a trigger). The
 * body still sits. Furniture / doorframe snags are a replan from HERE; the new first leg is
 * not the (x, z, roomId) that just failed. HOLD-to-hide is untouched. No new CUE_KIND.
 * ============================================================================================== */

console.log('\n  unstick');

{
  const blocked = { x: 2, z: 2, roomId: 'r0.hall>r0.gallery' };
  const portals = [
    { centre: { x: 2, z: 2 }, a: 'r0.hall', b: 'r0.gallery' },
    { centre: { x: 8, z: 2 }, a: 'r0.gallery', b: 'r0.chapel' },
  ];
  const goal = { x: 11, z: 2, roomId: 'r0.chapel' };
  const from = { x: 1.15, z: 2, roomId: 'r0.hall' };
  const raw = legsFor(portals, goal);
  const next = unstickLegs(portals, goal, blocked, from);
  t('RI23 · stall replan drops the blocked first leg — it does not walk the same portal',
    raw.length === 3 && legKey(raw[0]) === legKey(blocked)
    && next.length > 0 && legKey(next[0]) !== legKey(blocked)
    && next[0].x === 8 && next[next.length - 1].x === 11,
    `raw ${raw.map((l) => `${l.x}`).join('>')} · unstuck ${next.map((l) => `${l.x}`).join('>')}`);

  const sameRoom = unstickLegs([], { x: 4.6, z: 0.22, roomId: 'r0.gallery' },
    { x: 4.6, z: 0.22, roomId: 'r0.gallery' }, { x: 4.0, z: 2.4, roomId: 'r0.gallery' });
  t('RI23b · a snag on the pin itself sidesteps — the new first leg is not the painting',
    sameRoom.length >= 1
    && legKey(sameRoom[0]) !== legKey({ x: 4.6, z: 0.22, roomId: 'r0.gallery' })
    && sameRoom.some((l) => l.x === 4.6 && l.z === 0.22),
    `first ${sameRoom[0]?.x?.toFixed?.(2)},${sameRoom[0]?.z?.toFixed?.(2)} · ${sameRoom.length} legs`);

  t('RI23c · the bed asks from where she stands, then unsticks only on stall',
    /room\.pathPortals\?\.\(runner\.pos, _goal, ROUTE_MIN_W, ROUTE_MIN_H\)/.test(bedSrc)
    && /unstickLegs\(portals, goal, blocked/.test(bedSrc)
    && /why === 'stall'/.test(bedSrc)
    && /perf\.legs = blocked/.test(bedSrc),
    'replan from HERE · skip only the failed identity');

  t('RI23d · no new CUE_KIND — unstick is a walk, not a camera',
    CUE_KINDS.join(',') === 'intros,run,move,shot,idle,noms,pair,execute,pin'
    && !/CUE_KINDS/.test(intelSrc),
    CUE_KINDS.join(','));
}

{
  /*
   * Driven: she sits on a blocked doorway for stallSec (gained 0), stall fires, the new
   * first leg is not that doorway, and over stallSec*3 she gains stallGain toward the pin.
   * No collider — the "wall" is refusing to step toward the blocked identity until stall.
   */
  const DT = 1 / 60;
  const SPEED = 2.6;
  const PIN = { x: 11, z: 2, roomId: 'r0.chapel', kind: 'room' };
  const BLOCKED = { x: 2, z: 2, roomId: 'r0.hall>r0.gallery' };
  const PORTALS = [
    { centre: { x: 2, z: 2 }, a: 'r0.hall', b: 'r0.gallery' },
    { centre: { x: 8, z: 2 }, a: 'r0.gallery', b: 'r0.chapel' },
  ];
  let at = { x: 0.4, z: 2 };
  const start = { ...at };
  let heading = 0, legs = legsFor(PORTALS, PIN), clock = 0, stalled = false;
  let nav = { pinKey: pinKey(PIN), phase: 'seek', legs: legs.length, since: 0, gained: 0, lastAt: { ...at } };
  for (let i = 0; i < 60 * 12; i++) {
    clock += DT;
    const gained = Math.hypot(nav.lastAt.x - at.x, nav.lastAt.z - at.z);
    const since = nav.since + DT;
    const why = replanReason(nav, {
      pinKey: pinKey(PIN), phase: 'seek', legs: legs.length, since, gained,
    });
    if (why === 'stall') {
      legs = unstickLegs(PORTALS, PIN, BLOCKED, { ...at, roomId: 'r0.hall' });
      nav = { pinKey: pinKey(PIN), phase: 'seek', legs: legs.length, since: 0, gained: 0, lastAt: { ...at } };
      stalled = true;
    } else {
      nav = { ...nav, since, gained };
      if (since >= AUTOWALK.stallSec) {
        nav.since = 0;
        nav.lastAt = { ...at };
      }
    }
    consumeLegs(legs, at);
    const leg = legs[0] ?? PIN;
    heading = lagHeading(heading, headingTo(at, leg), DT);
    const d = Math.hypot(leg.x - at.x, leg.z - at.z);
    const drive = d < AUTOWALK.square ? 0 : 1;
    if (!stalled && legKey(leg) === legKey(BLOCKED)) continue;
    at = {
      x: at.x + Math.sin(heading) * drive * SPEED * DT,
      z: at.z + Math.cos(heading) * drive * SPEED * DT,
    };
    if (clock >= AUTOWALK.stallSec * 3) break;
  }
  const toward = Math.hypot(start.x - PIN.x, start.z - PIN.z) - Math.hypot(at.x - PIN.x, at.z - PIN.z);
  t('RI23e · wedged stallSec*3, she still gains stallGain toward the pin after unstick',
    stalled && toward >= AUTOWALK.stallGain
    && AUTOWALK.stallGain === 0.75 && AUTOWALK.stallSec === 2.0,
    `stalled=${stalled} · gained ${toward.toFixed(2)} m toward pin in ${clock.toFixed(1)}s`);
}

{
  /*
   * CAST8 H358/H378: every expedition froze ~100s then host ]. Auto-walk waited
   * for a move cue. The run cue is the walk. Host ] is not a product walk.
   * SECONDS[EXPEDITION] is a ceiling, not the designed end of a stuck body.
   */
  const bedCode = codeOf(bedSrc);
  const hostSrc = src('src/views/party-host.js');
  const hostCode = codeOf(hostSrc);
  const runCue = bedSrc.slice(bedSrc.indexOf("if (c.kind === 'run')"), bedSrc.indexOf("if (c.kind === 'pin')"));
  const pinCue = bedSrc.slice(bedSrc.indexOf("if (c.kind === 'pin')"), bedSrc.indexOf("if (c.kind === 'shot'"));
  const skip = /DEV_SKIP[\s\S]*expedition:\s*'recap'/.test(hostSrc)
    && /e\.key !== '\]'/.test(hostSrc)
    && /DEV_SKIP/.test(hostSrc);
  t('RI24 · run cue hands the body to auto-walk — a stick is not required',
    /perf\.driven = true/.test(runCue)
    && /perf\.driven = true/.test(pinCue)
    && /mode === 'run'/.test(pinCue),
    'sendoff starts the walk; a pin on a live run does too');
  t('RI24b · CAST8-class 100s freeze plus host ] is not the product walk',
    skip
    && /mission\.phase = 'done'/.test(bedCode)
    && /function homeGoal/.test(bedSrc)
    && /perf\.homing/.test(bedSrc)
    && CUE_KINDS.join(',') === 'intros,run,move,shot,idle,noms,pair,execute,pin',
    'recap clocks on done / home; ] is DEV only; no new CUE_KIND');
  t('RI24c · stall replan cannot return the blocked identity even across a retry pile',
    (() => {
      const blocked = [
        { x: 2, z: 2, roomId: 'r0.hall>r0.gallery' },
        { x: 8, z: 2, roomId: 'r0.gallery>r0.chapel' },
      ];
      const next = unstickLegs([
        { centre: { x: 2, z: 2 }, a: 'r0.hall', b: 'r0.gallery' },
        { centre: { x: 8, z: 2 }, a: 'r0.gallery', b: 'r0.chapel' },
      ], { x: 11, z: 2, roomId: 'r0.chapel' }, blocked, { x: 1.1, z: 2, roomId: 'r0.hall' });
      return next.length > 0 && !blocked.some((b) => legKey(next[0]) === legKey(b));
    })(),
    'new first leg is not a failed (x,z,roomId)');
  const freezeMs = 100_000;
  t('RI24d · a wedged body that never gains stallGain is a defect, not a 100s sit',
    AUTOWALK.stallSec * 3 * 1000 < freezeMs
    && AUTOWALK.stallGain === 0.75
    && /unstickLegs\(portals, goal, blocked/.test(bedSrc)
    && !/licensedSkip|skipHall|forceRecap/.test(bedCode),
    'unstick on stall · no licensed skip');
}

{
  /*
   * CAST9 H382 pinClocksRecap FAIL: expedition at ~100s then TV ]. skip true.
   * Quote: PRIME TIME ON AIR EPISODE 5 · EXPEDITION Hal is running Hal walks.
   * 76's unstickLegs plus recap-clock comments are not a pass. Job finish
   * clocks recap. Host ] is DEV only. No licensed skip.
   */
  const bedCode = codeOf(bedSrc);
  const hostSrc = src('src/views/party-host.js');
  const freezeMs = 100_000;
  let walkClock = 0;
  const DT = 1 / 60;
  const SPEED = 2.6;
  const PIN = { x: 6, z: 2, roomId: 'r0.gallery', kind: 'face-left' };
  let at = { x: 0.4, z: 2 };
  let heading = 0;
  let legs = legsFor([{ centre: { x: 3, z: 2 }, a: 'r0.hall', b: 'r0.gallery' }], PIN);
  let phase = 'seek';
  let recapAt = null;
  for (let i = 0; i < 60 * 40; i++) {
    walkClock += DT;
    consumeLegs(legs, at);
    const leg = legs[0] ?? PIN;
    heading = lagHeading(heading, headingTo(at, leg), DT);
    const d = Math.hypot(leg.x - at.x, leg.z - at.z);
    const drive = d < AUTOWALK.square ? 0 : 1;
    at = {
      x: at.x + Math.sin(heading) * drive * SPEED * DT,
      z: at.z + Math.cos(heading) * drive * SPEED * DT,
    };
    if (drive === 0 && phase === 'seek') phase = 'return';
    const recap = pinClocksRecap({
      phase, walking: legs.length > 0, hidden: false,
    });
    if (recap.clock && recapAt == null) recapAt = walkClock;
    if (recapAt != null) break;
  }
  t('RI25 · pin walk / job finish clocks recap inside 100s — no host ]',
    recapAt != null && recapAt * 1000 < freezeMs
    && pinClocksRecap({ phase: 'return' }).clock === true
    && pinClocksRecap({ phase: 'done' }).clock === true
    && pinClocksRecap({ phase: 'return' }).skip === false
    && pinClocksRecap({ phase: 'seek', walking: true }).clock === false
    && pinClocksRecap({ phase: 'seek', hidden: true }).clock === false
    && /pinClocksRecap\(/.test(bedSrc)
    && /mission\.phase = 'done'/.test(bedCode),
    `clocked at ${recapAt?.toFixed?.(2)}s · freeze ${freezeMs / 1000}s`);
  t('RI25b · CAST9-class pinClocksRecap FAIL (skip true, 100s sit, ] BEAT) is red',
    pinClocksRecap({ phase: 'seek', walking: false, hidden: false }).skip === false
    && pinClocksRecap({ phase: 'seek' }).clock === false
    && !/licensedSkip|skipHall|forceRecap/.test(bedCode)
    && /DEV_SKIP[\s\S]*expedition:\s*'recap'/.test(hostSrc)
    && /e\.key !== '\]'/.test(hostSrc)
    && !/\] BEAT/.test(bedCode)
    && /badge\.textContent = 'DEV · \] BEAT · P CAMERA'/.test(hostSrc)
    && CUE_KINDS.join(',') === 'intros,run,move,shot,idle,noms,pair,execute,pin',
    'skip stays false · ] is DEV chrome · no new CUE_KIND');
  t('RI25c · stall numbers stay 2.0 / 0.75 unless a measured fact moved them',
    AUTOWALK.stallSec === 2.0 && AUTOWALK.stallGain === 0.75
    && !/CUE_KINDS/.test(intelSrc),
    `stallSec ${AUTOWALK.stallSec} · stallGain ${AUTOWALK.stallGain}`);
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
    // Counted in the code — `bindPinPad`'s comment writes the assignment out. See `intel-pads` IP12.
    && (phoneCode.match(/state\.pin = /g) || []).length === 1
    && !/state\.pin\.push|pins\s*[:=]\s*\[/.test(phoneCode)
    // 🎯 ONE send, TWO chip rows. A door chip and an objective chip go through the same `tap`.
    && /\[data-pin\]/.test(phoneSrc) && /\[data-spot\]/.test(phoneSrc)
    && (phoneCode.match(/state\.client\?\.send\(\{ t: 'pin'/g) || []).length === 1,
    'one slot, one send, two chip rows');
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
    && /missionLine\(frame, scope\?\.hereId \?\? null, 'scope'\)/.test(phoneSrc),
    'you.here for the runner, scope.hereId for the guide');

  /*
   * 🚨 **RI15d · AND RI15 ABOVE HAS BEEN GREEN ON A SCREEN THAT NEVER MOVED.** The lock is
   * *"advance the seek line once she is in the mission room"*; `seekLine` does it, RI15 executes
   * `seekLine`, and both were correct. But the line advances on `here`, `here` changes when a body
   * walks through a doorway, and **that changes no term of the runner's structural stamp and was
   * written by no branch of `patchLive`** — so the pad kept saying FIND THE GALLERY at somebody
   * standing in the gallery for the whole run. The PHASE half worked (`missionPhase` IS in the
   * stamp), which is exactly why it read as working.
   *
   * Third instance of one bug in one afternoon — the guide's chips (RI21), the runner's bearing
   * (RI22), and this. **A gate on the FUNCTION is not a gate on the SCREEN**, and the three of them
   * together are why RI21/RI22/RI15d all ask *"can this element change when the runner moves?"*
   * rather than *"is the right value computed?"*.
   */
  const patchBody15 = codeOf(phoneSrc).slice(
    codeOf(phoneSrc).indexOf('function patchLive'), codeOf(phoneSrc).indexOf('function mapNote'));
  t('RI15d · ...and the SCREEN advances too — the line is re-read on the frames that move her',
    /data-goal="\$\{from\}"/.test(phoneSrc)
    && /\[data-goal\]/.test(patchBody15)
    && /goalText\(frame, here\)/.test(patchBody15)
    && /dataset\.goal === 'scope'/.test(patchBody15),
    'one patch, two seats, each re-reading the room from the source its own element names');
  t('RI15e control · the shipped `patchLive` never wrote it — the bug, run through the predicate',
    !/\[data-goal\]/.test(`function patchLive(frame) {
      const hereEl = root.querySelector('[data-here]');
      if (hereEl) hereEl.textContent = hereLabel(frame?.you?.here);
      return true; }`),
    'FIND THE GALLERY, at somebody standing in the gallery, all run');
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
    && /guidePad\(seed, meMark, state\.pin, \{ missionRoom, job \}\)/.test(phoneSrc)
    && !/whole-house|fullPlan|flyoverAll/.test(phoneSrc)
    /*
     * 🎯 **AND THE OBJECTIVE CHIPS DID NOT BUY A FLYOVER.** John, 2026-09-02: *"Guide E
     * neighbours-only still for doors in the halls… Do not restore a whole-house flyover. Map stays
     * the primary surface."* The chips are two targets INSIDE the room the runner is standing in,
     * they are gated on `hereId === missionRoom`, and `neighbourScope` is untouched — `lit` is still
     * built from `here`'s own edges and there is still no field on it that could hold a second hop.
     */
    && /String\(scope\.hereId\) === String\(missionRoom\)/.test(src('src/party/intel-pad.js'))
    && !/spots/.test(src('src/party/intel-pad.js').slice(
      src('src/party/intel-pad.js').indexOf('export function neighbourScope'),
      src('src/party/intel-pad.js').indexOf('function labelFor'))),
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
 * RI19 · JOHN'S 2026-09-02 CALL — the guide may pin the JOB, and the thumb no longer picks it
 *
 * *"guides need to also be able to pin objectives like the paintings or the camera install
 * position."*
 *
 * 🚨 **THE HALF THAT IS EASY TO MISS IS A REMOVAL.** Adding chips is additive and visible. What
 * this pass also had to do is take the target choice OFF the stick: overnight, `jobGoal` read
 * `perf.stick.x` and a nudge picked a twin, which made the guide's sentence decoration — the
 * runner could ignore her, lean either way, and the twin smash stopped being a thing two people
 * do together. RI19g is that removal, executed. Every check below is a function this repo ships;
 * `objectiveGoal` in particular exists as a pure function precisely so this file can run it,
 * because the rule it carries (*a pin names a THING, not a place*) is the one standing between a
 * lying phone and a body walking somewhere nobody asked for.
 * ============================================================================================== */

console.log('\n  the guide pins the job');

{
  const GAL = { id: 'r0.gallery', x0: 0, x1: 12, z0: 0, z1: 5 };
  const smashChips = objectiveSpots(JOB.SMASH, GAL);
  const drillChips = objectiveSpots(JOB.DRILL, GAL);

  t('RI19 · six pin kinds now, and the wire SHAPE is still the same four fields',
    PIN_KINDS.length === 6 && PIN_KINDS[0] === 'room' && PIN_KINDS[1] === 'edge'
    && OBJECTIVE_KINDS.every((k) => PIN_KINDS.includes(k))
    && PIN_WIRE_KEYS.join(',') === 't,x,z,roomId,kind'
    && OBJECTIVE_KINDS.every((k) => pinViolations({ t: 'pin', x: 1, z: 2, roomId: 'r0.gallery', kind: k }).length === 0),
    `${PIN_KINDS.length} kinds on ${PIN_WIRE_KEYS.length - 1} fields · ${OBJECTIVE_KINDS.join(' ')}`);
  t('RI19b control · a kind nobody declared is still refused at the door',
    pinViolations({ t: 'pin', x: 1, z: 2, roomId: 'r0.gallery', kind: 'face-middle' }).length > 0
    && pinViolations({ t: 'pin', x: 1, z: 2, roomId: 'r0.gallery', kind: 'mount-ceiling' }).length > 0
    && pinWireShape({ x: 1, z: 2, roomId: 'r0.gallery', kind: 'hunter' }) === null
    && pinWireShape({ x: 1, z: 2, roomId: 'r0.gallery' })?.kind === 'room',
    'a bad kind is a null shape; a missing one is a plain room pin');

  t('RI19c · each job offers exactly its own two targets, and they are two different places',
    smashChips.length === 2 && drillChips.length === 2
    && smashChips.map((s) => s.kind).join(',') === 'face-left,face-right'
    && drillChips.map((s) => s.kind).join(',') === 'mount-hall,mount-floor'
    && Math.hypot(smashChips[0].x - smashChips[1].x, smashChips[0].z - smashChips[1].z) > 1
    && Math.hypot(drillChips[0].x - drillChips[1].x, drillChips[0].z - drillChips[1].z) > 1
    && objectiveSpots('reunion', GAL).length === 0,
    `${smashChips.map((s) => s.label).join(' / ')} · ${drillChips.map((s) => s.label).join(' / ')}`);

  /*
   * 🚨 **RI19d IS THE ONE THAT MATTERS.** `objectives.js`'s header: the phone computes its chip
   * coordinates from `planRegions`, whose rooms are a UNION of rectangles, and the body picks ONE
   * rect out of `room.tables.spaces`. They agree for a plain gallery and are free to disagree for
   * anything else — so the coordinates ride as a BEARING HINT for the bezel and the NAME is the
   * instruction. Here the hint is a deliberate lie, 40 m away in another room, and the answer is
   * still the real painting because `objectiveGoal` never reads `pin.x`.
   */
  const SCENE = {
    left: { x: 4.6, z: 0.22, live: true }, right: { x: 7.4, z: 0.22, live: true },
    hall: { x: 6.0, z: 4.78, live: true }, floor: { x: 11.78, z: 2.5, live: true },
  };
  const inRoom = { here: 'r0.gallery', missionRoom: 'r0.gallery', targets: SCENE };
  const liar = { x: -40, z: -40, roomId: 'r0.gallery', kind: 'face-left' };
  t('RI19d · the body resolves the NAME — a pin lying about where the target is still walks to it',
    JSON.stringify(objectiveGoal(liar, inRoom)) === JSON.stringify({ x: 4.6, z: 0.22 })
    && JSON.stringify(objectiveGoal({ ...liar, kind: 'mount-floor' }, inRoom))
      === JSON.stringify({ x: 11.78, z: 2.5 })
    && !/pin\.x|pin\.z/.test(objCode.slice(objCode.indexOf('export function objectiveGoal'))),
    'pin.x is never read in the resolver — the hint is for the bezel and nothing else');

  t('RI19e · an objective pin from OUTSIDE the mission room resolves to nothing (D4 held twice)',
    objectiveGoal({ kind: 'face-left' }, { ...inRoom, here: 'r0.hall' }) === null
    && objectiveGoal({ kind: 'face-left' }, { ...inRoom, here: null }) === null
    && objectiveGoal({ kind: 'face-left' }, { ...inRoom, missionRoom: null }) === null
    && objectiveGoal({ kind: 'room' }, inRoom) === null,
    'no four-door route to a painting three rooms away, and a DOOR pin is not an objective');
  t('RI19e2 · a face somebody already smashed is not a destination',
    objectiveGoal({ kind: 'face-left' },
      { ...inRoom, targets: { ...SCENE, left: { ...SCENE.left, live: false } } }) === null
    && objectiveGoal({ kind: 'face-left' }, { ...inRoom, targets: {} }) === null,
    'a pin at an empty nail is refused, not walked to');

  /*
   * ⚠️ **RI19f IS WHY `mount-floor` MAY BE CALLED `mount-floor` ON THE WIRE.** The name says which
   * bracket the guide picked, and on a drill night which bracket is worth mounting is her private
   * card (`drillShotFor`). If the runner's pad printed the kind, an evil guide pinning the junk
   * bracket would be announcing it. It does not: `bezelOf` returns a bearing, a word and a band,
   * and `RUNNER_PAD_KEYS` has no row for a kind — so a HALL pin and a FLOOR pin are the same
   * screen with the segment in a different place, which is exactly what a shout across a couch is.
   */
  const HER = { x: 1.5, z: 1.25 };
  const AT = { x: 6.0, z: 4.78, roomId: 'r0.gallery' };
  const pinnedHall = runnerPadShape(HER, { ...AT, kind: 'mount-hall' });
  const pinnedFloor = runnerPadShape(HER, { ...AT, kind: 'mount-floor' });
  t('RI19f · the runner is shown a BEARING and never the kind — the two brackets read the same',
    !RUNNER_PAD_KEYS.includes('kind')
    && !JSON.stringify(pinnedHall).includes('mount')
    && pinnedHall.word.length > 0 && pinnedHall.runs.length > 0
    && JSON.stringify(pinnedHall) === JSON.stringify(pinnedFloor)
    && padLeaks('runner', pinnedFloor).length === 0,
    `${Object.keys(pinnedFloor).join(',')} — no kind in it · "${pinnedFloor.words}" either way`);

  /*
   * 🚨 **RI19g · THE REMOVAL.** John: *"Thumb dodge/hide stays lateral only. It is NOT how you pick
   * which painting."* The old rule is restated here as an executed negative rather than described,
   * for `expedition-jobs` J7's reason — a rule somebody reversed is only really gone when a check
   * would go red if it came back.
   */
  const jobGoalBody = codeOf(bedSrc).slice(codeOf(bedSrc).indexOf('function jobGoal'),
    codeOf(bedSrc).indexOf('function replanToPin'));
  t('RI19g · the thumb no longer picks the target — the pin does, and the midpoint is gone',
    /return resolveObjective\(perf\.pin\);/.test(jobGoalBody)
    && !/perf\.stick/.test(jobGoalBody)
    && !/midpoint|lean/.test(jobGoalBody)
    && !/\(L\.pos\.x \+ R\.pos\.x\) \/ 2/.test(codeOf(bedSrc))
    && /const want = dodgeLateral\(perf\.stick\.x/.test(bedSrc),
    'the stick reaches `dodgeLateral` and nothing else');

  t('RI19h · the say-line names the PICK and never the truth',
    OBJECTIVE_KINDS.every((k) => objectiveSay(k).length > 0)
    && OBJECTIVE_KINDS.every((k) => !SAY_FORBIDDEN.some((w) => objectiveSay(k).toLowerCase().includes(w)))
    && objectiveSay('room') === '' && objectiveSay(null) === '',
    OBJECTIVE_KINDS.map((k) => `"${objectiveSay(k)}"`).join(' '));
  t('RI19h2 control · the sweep can see — a line that named the real face is caught',
    SAY_FORBIDDEN.some((w) => 'Hit the real one.'.toLowerCase().includes(w))
    && SAY_FORBIDDEN.some((w) => 'That one is a decoy.'.toLowerCase().includes(w)),
    'a planted give-away reddens the same test');

  /*
   * RI19i · the two brackets have to be TWO. A second `camHang` that quietly returned the first
   * one's coordinates would leave the drill night with one place to stand and a chip row that lies.
   */
  const hall = camHang(GAL, 0, 'hall'), floor = camHang(GAL, 0, 'floor');
  const keeps = camKeepOuts(GAL);
  t('RI19i · two brackets, the same fixture, on different walls — and the placer holds both clear',
    Math.hypot(hall.x - floor.x, hall.z - floor.z) > 2
    && hall.alongX !== floor.alongX && hall.y === floor.y
    && JSON.stringify(camHang(GAL, 0)) === JSON.stringify(hall)
    && keeps.length === 2
    && keeps.some((k) => hall.x >= k.x0 && hall.x <= k.x1 && hall.z >= k.z0 && hall.z <= k.z1)
    && keeps.some((k) => floor.x >= k.x0 && floor.x <= k.x1 && floor.z >= k.z0 && floor.z <= k.z1),
    `hall ${hall.x.toFixed(2)},${hall.z.toFixed(2)} · floor ${floor.x.toFixed(2)},${floor.z.toFixed(2)}`
    + ` · ${keeps.length} keep-outs · default is still the hall bracket`);

  t('RI19j · a re-pin at the SAME point with a different name is a new pin, not a no-op',
    pinKey({ x: 1, z: 2, roomId: 'r0.gallery', kind: 'face-left' })
      !== pinKey({ x: 1, z: 2, roomId: 'r0.gallery', kind: 'face-right' })
    && replanReason(
      { pinKey: pinKey({ x: 1, z: 2, roomId: 'g', kind: 'face-left' }), phase: 'seek', legs: 2, since: 0, gained: 9 },
      { pinKey: pinKey({ x: 1, z: 2, roomId: 'g', kind: 'face-right' }), phase: 'seek', legs: 2, since: 0, gained: 9 },
    ) === 'pin',
    'the kind is part of the identity, so the walk re-plans');

  /*
   * RI19k · the chips are gated on ONE room id against ONE room id, live on a generated house, and
   * the shape they arrive in still passes the guide pad's own closed schema.
   */
  const seedPlan = planRegions(7);
  const galleryRect = [...seedPlan.rooms].find((r) => String(r.id).endsWith('.gallery'));
  const galUnion = galleryRect
    ? unionRect([...seedPlan.rooms, ...seedPlan.corridors], galleryRect.id) : null;
  const standIn = galleryRect
    ? { x: (galleryRect.x0 + galleryRect.x1) / 2, z: (galleryRect.z0 + galleryRect.z1) / 2 }
    : null;
  const inside = standIn ? guidePadShape(7, standIn, null, { missionRoom: galleryRect.id, job: JOB.SMASH }) : null;
  const elsewhere = standIn ? guidePadShape(7, standIn, null, { missionRoom: 'r9.nowhere', job: JOB.SMASH }) : null;
  const unarmed = standIn ? guidePadShape(7, standIn, null) : null;
  t('RI19k · chips appear in the mission room and NOWHERE else, on a real generated house',
    !!inside && inside.spots.length === 2
    && inside.spots.every((s) => s.x >= galUnion.x0 - 0.5 && s.x <= galUnion.x1 + 0.5
      && s.z >= galUnion.z0 - 0.5 && s.z <= galUnion.z1 + 0.5)
    && elsewhere.spots.length === 0 && unarmed.spots.length === 0
    && inside.lit.length === elsewhere.lit.length,
    `${inside?.spots.length ?? 0} chips in ${galleryRect?.id} · 0 outside it · the scope itself is unchanged`);
  /*
   * ⚠️ **RI19q · `mission.shot` IS DELIBERATELY LOCAL AND MUST STAY THAT WAY.** The body records
   * which bracket the camera actually went on, because it is the only difference a drill night
   * ever had. It may not travel: the locked rule is *"blind still counts as `camera_lit`"* and the
   * guide's own pad already says *"Recap will say seated either way"*, so a `shot` on the world
   * report would let a screenshot of the Verdict answer a question the Verdict is built not to.
   * A dead field drifts; a field a gate holds down does not.
   */
  t('RI19q · which bracket the camera went on is recorded and never put on the wire',
    /mission\.shot = wallCam\.at;/.test(codeOf(bedSrc))
    && !WORLD_MISSION_KEYS.includes('shot')
    && !/shot: mission\.shot|shot: wallCam/.test(codeOf(bedSrc)),
    'blind still counts as camera_lit — the recap says seated either way');

  t('RI19k2 · and the widened pad shape is still closed — a route on a chip is a red line',
    padLeaks('guide', inside).length === 0
    && padLeaks('guide', { ...inside, spots: [{ kind: 'face-left', label: 'L', x: 1, z: 2, path: [1, 2] }] }).length > 0
    && padLeaks('guide', { ...inside, spots: [{ kind: 'face-left', label: 'L', x: 1, z: 2, hunter: 'x' }] }).length > 0,
    `${padLeaks('guide', inside).length} leaks · a smuggled path and a smuggled hunter both caught`);
}

/* =================================================================================================
 * RI20 · THE LAST FOUR METRES, WALKED — the whole chain, driven, in node
 *
 * 🚨 **EVERY CHECK ABOVE THIS ONE IS ABOUT ONE LINK.** RI19d proves the resolver reads a name;
 * RI2 proves legs are built from a live portal answer; RI6 proves the heading lags. None of them
 * proves the runner ARRIVES — and "the guide pins a face and the body walks to it" is the whole
 * feature. That gap is exactly the shape `whisper-split` was written to close: a chain of
 * individually-correct links whose end-to-end behaviour had only ever been seen in a browser.
 *
 * So this drives the shipped functions in a loop at 60 Hz over a fake gallery: `objectiveGoal` →
 * `legsFor` → `consumeLegs` → `headingTo` → `lagHeading`, with the same `AUTOWALK.square` stop and
 * the same `dodgeLateral` thumb, and measures how long the body takes and where it stops.
 *
 * ⚠️ **IT IS NOT A PHYSICS TEST AND MUST NOT BECOME ONE.** There is no collider here and no
 * `Player.update`; the step below is *"walk `drive` metres per second along the heading"*, which is
 * what the real body does when nothing is in the way. What it can therefore prove is that the
 * BRAIN converges — that the legs are consumed, the heading points at the target, and the stop
 * condition fires — and what it deliberately cannot prove is that a chair was in the way. That is
 * `target-sight`'s job and `target-sight` is green.
 * ============================================================================================== */

console.log('\n  she gets there');

{
  const GAL = { id: 'r0.gallery', x0: 0, x1: 12, z0: 0, z1: 5 };
  const SCENE = {
    left: { x: 4.6, z: 0.22, live: true }, right: { x: 7.4, z: 0.22, live: true },
    hall: { x: 6.0, z: 4.78, live: true }, floor: { x: 11.78, z: 2.5, live: true },
  };
  const SPEED = 2.6;                        // `player.js` walk speed, near enough for a convergence test
  const DT = 1 / 60;

  /**
   * One walk. Returns where she stopped, how long it took, and whether she ever left the room.
   *
   * `portals` is the live `pathPortals` answer the bed would have got — empty inside one room,
   * which is the case that matters here, and one doorway centre for the "pinned from the doorway"
   * arm. The pin may CHANGE mid-walk (`repin`), because D2's *a second tap replaces* is the thing
   * most likely to strand a body half way.
   */
  /*
   * 🚨 **THE ROOM ORACLE IS A REAL ONE, AND THE FIRST DRAFT'S WAS NOT — IT COST A FALSE RED.**
   * `clampToRoom` asks a caller-supplied `roomIdAt` whether a step SIDEWAYS would leave the room,
   * and a stand-in that answers `'r0.gallery'` for every point in the universe is a clamp that can
   * never fire. Driven that way, a thumb held hard walked the body straight out through the wall
   * behind the paintings and RI20b went red on the harness rather than on the product. The bed
   * passes `room.spaceAt(p)?.id`; this passes the gallery rectangle, which is the same answer.
   */
  const inGallery = (p) => (p.x >= GAL.x0 && p.x <= GAL.x1 && p.z >= GAL.z0 && p.z <= GAL.z1
    ? 'r0.gallery' : 'r0.hall');

  function walk({ from, pin, portals = [], stick = 0, repin = null, repinAt = 2.0, room = 'r0.gallery' }) {
    let at = { ...from };
    let heading = 0, lateral = 0, legs = [], plannedKey = '', t = 0, left = false;
    let held = pin;
    for (let i = 0; i < 60 * 25; i++) {
      t += DT;
      if (repin && t >= repinAt && held !== repin) { held = repin; plannedKey = ''; }
      const goal = objectiveGoal(held, { here: room, missionRoom: 'r0.gallery', targets: SCENE });
      const key = pinKey(held);
      if (!goal) return { at, t, arrived: false, left, why: 'no goal' };
      if (key !== plannedKey) { legs = legsFor(portals, goal); plannedKey = key; }
      consumeLegs(legs, at);
      const leg = legs[0] ?? goal;
      heading = lagHeading(heading, headingTo(at, leg), DT);
      lateral = clampToRoom(dodgeLateral(stick, lateral, DT), at, heading, inGallery);
      const d = Math.hypot(leg.x - at.x, leg.z - at.z);
      const drive = d < AUTOWALK.square ? 0 : 1;
      // The body's forward is (sin h, cos h) and its RIGHT is (-cos h, sin h) — `_solve`'s own basis.
      at = {
        x: at.x + (Math.sin(heading) * drive + -Math.cos(heading) * lateral) * SPEED * DT,
        z: at.z + (Math.cos(heading) * drive + Math.sin(heading) * lateral) * SPEED * DT,
      };
      if (at.x < GAL.x0 - 0.5 || at.x > GAL.x1 + 0.5 || at.z < GAL.z0 - 0.5 || at.z > GAL.z1 + 0.5) left = true;
      /*
       * ⚠️ **ARRIVAL IS `drive === 0`, AND WAITING FOR THE LATERAL TO SETTLE TOO WOULD BE WRONG.**
       * The stop the bed actually performs is *"inside `AUTOWALK.square`, stop driving forward"*.
       * The thumb is a live control and a player holding it against a wall keeps shuffling, so a
       * condition that also required the dodge to be still would never fire on the arm that most
       * needs measuring — the one where somebody is shoving the stick.
       */
      if (drive === 0) return { at, t, arrived: true, left, d: Math.hypot(goal.x - at.x, goal.z - at.z), goal };
    }
    return { at, t, arrived: false, left, why: 'ran out of clock' };
  }

  const DOOR = { x: 1.0, z: 2.5 };
  const toLeft = walk({ from: DOOR, pin: { x: -40, z: -40, roomId: 'r0.gallery', kind: 'face-left' } });
  const toRight = walk({ from: DOOR, pin: { x: -40, z: -40, roomId: 'r0.gallery', kind: 'face-right' } });
  t('RI20 · pinned, she crosses the room and stops square in front of the face the guide named',
    toLeft.arrived && toRight.arrived
    && toLeft.d < AUTOWALK.square && toRight.d < AUTOWALK.square
    && Math.hypot(toLeft.at.x - SCENE.left.x, toLeft.at.z - SCENE.left.z) < 1.0
    && Math.hypot(toRight.at.x - SCENE.right.x, toRight.at.z - SCENE.right.z) < 1.0
    && Math.hypot(toLeft.at.x - toRight.at.x, toLeft.at.z - toRight.at.z) > 2.0,
    /*
     * ⚠️ **`?? -1` IS NOT DEFENSIVE PADDING — A CRASHING GATE REPORTS NOTHING.** `d` is undefined
     * on a walk that never arrived, and the first draft of this line read `toLeft.d.toFixed(2)`.
     * Injecting a broken `AUTOWALK.square` therefore threw a TypeError partway through the file and
     * killed the run: no red line, no summary, no exit code anybody could read as a failure of THIS
     * check. A gate has to survive the fault it exists to catch for long enough to name it.
     */
    `left in ${toLeft.t.toFixed(1)}s at ${(toLeft.d ?? -1).toFixed(2)} m`
    + ` · right in ${toRight.t.toFixed(1)}s at ${(toRight.d ?? -1).toFixed(2)} m`
    + ` · ${Math.hypot(toLeft.at.x - toRight.at.x, toLeft.at.z - toRight.at.z).toFixed(2)} m apart`
    + `${toLeft.arrived && toRight.arrived ? '' : ` · NEVER ARRIVED (${toLeft.why ?? toRight.why})`}`);

  /*
   * 🚨 **RI20b IS LOCK 3, MEASURED IN METRES.** *"Thumb dodge/hide stays lateral only. It is NOT
   * how you pick which painting."* The same pin, walked three times with the thumb hard left, hard
   * right and neutral, has to end at the SAME target — otherwise the stick is still voting.
   */
  const held = { x: 0, z: 0, roomId: 'r0.gallery', kind: 'face-left' };
  const neutral = walk({ from: DOOR, pin: held, stick: 0 });
  const shoved = walk({ from: DOOR, pin: held, stick: -1 });
  const shovedOther = walk({ from: DOOR, pin: held, stick: 1 });
  const spread = Math.max(
    Math.hypot(shoved.at.x - neutral.at.x, shoved.at.z - neutral.at.z),
    Math.hypot(shovedOther.at.x - neutral.at.x, shovedOther.at.z - neutral.at.z));
  t('RI20b · a thumb pushed hard either way does NOT change which face she ends up at',
    neutral.arrived && shoved.arrived && shovedOther.arrived
    && [neutral, shoved, shovedOther].every((w) =>
      Math.hypot(w.at.x - SCENE.left.x, w.at.z - SCENE.left.z)
      < Math.hypot(w.at.x - SCENE.right.x, w.at.z - SCENE.right.z))
    && spread < 1.6
    && [neutral, shoved, shovedOther].every((w) => !w.left),
    `all three end at the LEFT face · thumb moves the stop by ${spread.toFixed(2)} m and never leaves the room`);

  t('RI20c · a second tap mid-walk turns her around — no leg survives a re-pin (D2)',
    (() => {
      const swung = walk({
        from: DOOR,
        pin: { x: 0, z: 0, roomId: 'r0.gallery', kind: 'face-left' },
        repin: { x: 0, z: 0, roomId: 'r0.gallery', kind: 'mount-floor' },
        repinAt: 1.2,
      });
      return swung.arrived
        && Math.hypot(swung.at.x - SCENE.floor.x, swung.at.z - SCENE.floor.z) < 1.0
        && Math.hypot(swung.at.x - SCENE.left.x, swung.at.z - SCENE.left.z) > 3.0;
    })(),
    'pinned at a painting, re-pinned at the junk bracket 1.2s in, ends at the bracket');

  t('RI20d · with the pin taken away mid-walk she stops rather than finishing the old errand',
    (() => {
      const dropped = walk({
        from: DOOR,
        pin: { x: 0, z: 0, roomId: 'r0.gallery', kind: 'face-left' },
        repin: { x: 0, z: 0, roomId: 'r0.gallery', kind: 'room' },
        repinAt: 0.8,
      });
      return !dropped.arrived && dropped.why === 'no goal'
        && Math.hypot(dropped.at.x - SCENE.left.x, dropped.at.z - SCENE.left.z) > 2.0;
    })(),
    'a door pin is not an objective, so the job goal goes and the body waits to be told again');

  t('RI20e control · walked from a room she is not in, the same call goes NOWHERE',
    (() => {
      const outside = walk({
        from: DOOR, pin: { x: 0, z: 0, roomId: 'r0.gallery', kind: 'face-left' }, room: 'r0.hall',
      });
      return !outside.arrived && outside.why === 'no goal'
        && outside.at.x === DOOR.x && outside.at.z === DOOR.z;
    })(),
    'the body does not take one step — D4 is enforced before the first leg, not after it');

  /*
   * RI20f · the drill's bracket choice, executed. `mountFor` is pure for this reason: the rule
   * *"the pin picks it, and only with no pin does proximity"* is the difference between a guide
   * who matters and a runner who drills whatever she happens to be beside.
   */
  const MOUNTS = { hall: SCENE.hall, floor: SCENE.floor };
  t('RI20f · the pin picks the bracket even when she is standing at the other one',
    mountFor('mount-hall', SCENE.floor, MOUNTS) === 'hall'
    && mountFor('mount-floor', SCENE.hall, MOUNTS) === 'floor'
    && mountFor(null, SCENE.hall, MOUNTS) === 'hall'
    && mountFor(null, SCENE.floor, MOUNTS) === 'floor'
    && mountFor('face-left', SCENE.hall, MOUNTS) === 'hall'
    && mountFor('face-left', SCENE.floor, MOUNTS) === 'floor'
    && mountFor('mount-hall', SCENE.hall, { floor: SCENE.floor }) === null,
    'a pin overrides proximity; no pin — or the OTHER job\'s pin — falls back to it');
  t('RI20g · the bed asks that rule rather than keeping a second copy of it, and a walk-off resets',
    /const spot = mountFor\(perf\.pin\?\.kind, runner\.pos, \{/.test(codeOf(bedSrc))
    && /if \(wallCam\.at !== at\.shot\) \{ wallCam\.mount = 0; wallCam\.at = at\.shot; \}/.test(codeOf(bedSrc))
    && /perf\.act > 0\.5 && nearWallCam\(\)/.test(codeOf(bedSrc)),
    'one camera, one wall — half a mount does not carry across the room');
}

/* =================================================================================================
 * RI21 · THE GUIDE'S CHIP ROW CANNOT BE A PHOTOGRAPH
 *
 * 🚨 **THE BUG THIS EXISTS FOR SHIPPED ON 2026-09-01 AND WAS FOUND ON 2026-09-02 BY WALKING THE
 * LOOP, NOT BY A CHECK.** `party-phone.js`'s structural stamp is *"everything that changes the
 * SHAPE of the screen"* and the guide's half of it read
 * `expedition:guide:{missionPhase}:{job}:{card}` — **not one term of which changes when the runner
 * walks through a door.** `patchLive` writes the here-label, the intel strip, the two map marks and
 * the sentence under them, and has never touched the pin pad. So `guidePinPad(scope)` rendered ONCE,
 * on the first expedition frame, with the runner still in the ballroom, and every chip stayed the
 * ballroom's for the whole run.
 *
 * That is Guide E's premise inverted — the board's argument is *"her rect plus the rects a door
 * joins to it, RIGHT NOW"* — and under auto-walk it is worse than cosmetic: she taps NORTH, pins a
 * doorway out of a room the runner left two rooms ago, and the body walks to it. Tapping was
 * equally stuck, because `bindPinPad` calls `paint()`, which matched the same stamp and patched.
 *
 * ⚠️ **THE CHECK IS A DISJUNCTION ON PURPOSE, AND PINNING THE IMPLEMENTATION WOULD BE WORSE.**
 * There are two honest ways to keep the row live — put the scope in the STAMP so the sheet rebuilds,
 * or teach `patchLive` to rewrite the chips — and this repo has already chosen each of them for a
 * different element (the camera is a stamp term; the map marks are patched). A gate that demanded
 * the stamp would redden the day somebody does the other one correctly. So it asks the question the
 * bug actually asks: **when the runner changes room, can the chips change?**
 * ============================================================================================== */

console.log('\n  and her chips are not a photograph');

{
  const phone = codeOf(src('src/views/party-phone.js'));
  const stampExpr = phone.slice(phone.indexOf('const camStamp'), phone.indexOf('if (liveStamp &&'));
  const patchBody = phone.slice(phone.indexOf('function patchLive'), phone.indexOf('function mapNote'));

  /** Can the chip row change when the runner walks through a door? Two legal answers. */
  const staleProof = (stamp, patch) => {
    const inStamp = /guideStamp/.test(stamp) && /hereId/.test(stamp) && /\$\{guideStamp\}/.test(stamp);
    const inPatch = /data-pin-pad|pin-chip|data-spot/.test(patch);
    return { inStamp, inPatch, live: inStamp || inPatch };
  };
  const now = staleProof(stampExpr, patchBody);

  t('RI21 · the chips can follow the runner through a door — by the stamp, or by the patch',
    now.live,
    `stamp carries the room: ${now.inStamp} · patchLive rewrites the chips: ${now.inPatch}`);

  /*
   * 🚨 **THE CONTROL IS THE SHIPPED BUG, EXECUTED.** This is the exact stamp expression that was on
   * `main` before this fix, run through the same predicate. It has to come out RED, or the check
   * above is asserting something that was always true and proves nothing.
   */
  const OLD_STAMP = `const camStamp = iAmRunner ? \`:\${frame?.you?.view || 'chase'}\` : '';
    const liveStamp = beat === 'expedition' && !state.stage
      ? \`\${beat}:\${iAmRunner ? 'run' : iAmGuide ? 'guide' : 'watch'}:\${missionPhase}:\${missionFor(frame?.airingEpisode ?? 1).job}\`
        + \`:\${hasCard() ? 'card' : 'nocard'}\${camStamp}\`
      : null;`;
  const old = staleProof(OLD_STAMP, patchBody);
  t('RI21b control · the stamp that SHIPPED fails this, which is why the check is worth having',
    !old.live && !old.inStamp,
    'ballroom chips for the whole run — the bug, run through the same predicate');

  /*
   * And the pin, for the same reason one step smaller: `bindPinPad` repaints after a tap, so if the
   * pin is not part of the sheet's identity the `on` highlight and `sayThis`'s line never move and
   * the guide has no way to tell whether her tap was heard.
   */
  t('RI21c · a TAP changes the sheet too — the highlight and the say-line are not write-only',
    /state\.pin \? `\$\{state\.pin\.kind\}@\$\{state\.pin\.roomId\}`/.test(stampExpr)
    || /data-pin-say/.test(patchBody),
    'the pin is part of the sheet identity, so a tap redraws the row that carries it');

  /*
   * RI21d · and the fix must not have bought a rebuild with a double plan build. The memo's key has
   * to name EVERY input `guidePad` reads — miss one and the memo is a lie that hands the stamp a
   * stale `hereId`, which is the original bug with an extra step.
   */
  const memo = phone.slice(phone.indexOf('function guideScopeFor'), phone.indexOf('function guidePinPad'));
  t('RI21d · the scope is built at most once per paint, and the memo key names every input',
    /scopeMemo\.key === key/.test(memo)
    && ['seed', 'meMark.x', 'meMark.z', 'state.pin', 'missionRoom', 'job'].every((k) => memo.includes(k))
    && (phone.match(/guidePad\(seed, meMark, state\.pin/g) || []).length === 1,
    'one call site, and a key that cannot go stale behind the stamp');
}

/* =================================================================================================
 * RI22 · THE RUNNER'S BEARING IS LIVE, AND NOTHING `patchLive` CALLS IS IN A DEAD ZONE
 *
 * 🚨 **THE SAME BUG AS RI21, ON THE OTHER PAD, WITH THE OPPOSITE FIX.** `bezelHtml` was rendered
 * once per sheet rebuild and the runner's stamp carries no term that changes when she moves — so
 * `runnerPad` was called on every paint and its answer thrown away, and Runner D's entire reason to
 * exist (*"the bearing is the EDGE OF THE PHONE"*) was frozen at whatever it read on the first
 * expedition frame. Before a pin exists that is *"no map here"*, for the whole run.
 *
 * ⚠️ **AND IT COULD NOT TAKE RI21's FIX.** The guide's sheet has no stick, so a rebuild per doorway
 * costs nothing; **the runner's sheet is the one sheet the structural stamp exists to protect**,
 * because rebuilding it destroys `#stick` and its `setPointerCapture` under a moving thumb. A
 * bearing that updated by rebuild at 2 Hz would drop every drag in the game. So the two pads take
 * opposite fixes for one bug and the reason is that only one of them is holding a control — which
 * is why RI21 and RI22 are written as the same DISJUNCTION and each is allowed its own answer.
 *
 * 🚨 **RI22c IS THE ONE THAT WOULD HAVE SAVED TWO HOURS.** Both halves of this fix shipped a
 * TEMPORAL DEAD ZONE first — `let scopeMemo`, then `const bezelCap` — because `patchLive` and the
 * stamp run off a socket message while a `const` beside its helper is still uninitialised. The
 * bundle threw *"Cannot access 'ne' before initialization"* and then *"'ze'"*, minified, and only
 * `phone-accusation` PA8 could see either: no node gate executes `paint()`. So this asks the
 * mechanical question directly — **is everything `patchLive` calls a HOISTED declaration?**
 * ============================================================================================== */

console.log('\n  and his bearing is not a photograph either');

{
  const phone = codeOf(src('src/views/party-phone.js'));
  const stampExpr = phone.slice(phone.indexOf('const camStamp'), phone.indexOf('if (liveStamp &&'));
  const patchBody = phone.slice(phone.indexOf('function patchLive'), phone.indexOf('function mapNote'));

  /** Can the bearing change when the runner takes a step? Two legal answers, same as RI21. */
  const liveBearing = (stamp, patch) => ({
    inStamp: /you\?\.at|bearing|bezel/.test(stamp),
    inPatch: /data-bezel/.test(patch) && /runnerPad\(/.test(patch),
  });
  const now = liveBearing(stampExpr, patchBody);
  t('RI22 · the bearing follows the runner — by the stamp, or by the patch',
    now.inStamp || now.inPatch,
    `stamp: ${now.inStamp} · patchLive rewrites the bezel: ${now.inPatch}`);

  const OLD_PATCH = `function patchLive(frame) {
    const slot = root.querySelector('[data-intel]');
    const map = root.querySelector('.guide-map');
    if (!slot && !map && !root.querySelector('#stick')) return false;
    const hereEl = root.querySelector('[data-here]');
    if (hereEl) hereEl.textContent = hereLabel(frame?.you?.here);
    return true;`;
  const old = liveBearing(stampExpr, OLD_PATCH);
  t('RI22b control · the `patchLive` that SHIPPED never touched it — the bug, run through the predicate',
    !old.inPatch && !old.inStamp,
    'a bearing drawn once and never again');

  /*
   * ⚠️ **AND THE FIX MUST NOT HAVE BOUGHT IT WITH A REBUILD.** The runner's half of the stamp may
   * not grow a term that changes as she walks, or every drag dies with the stick it was captured
   * on — which is the failure the stamp was introduced to stop in the first place.
   */
  t('RI22c · the runner\'s sheet still does not rebuild when she moves — the stick survives',
    !/camStamp[^\n]*you\?\.at/.test(stampExpr)
    && /const camStamp = iAmRunner \? `:\$\{frame\?\.you\?\.view \|\| 'chase'\}` : '';/.test(stampExpr)
    && /guideStamp = iAmGuide/.test(stampExpr),
    'the bearing is patched, the chips are stamped, and only the guide seat pays a rebuild');

  /*
   * 🚨 **THE DEAD-ZONE GUARD.** Everything `patchLive` calls that this file also declares must be a
   * HOISTED `function`. A `const`/`let` arrow is uninitialised until execution walks past its line,
   * and `patchLive` runs off a socket message — which is how two separate helpers in this one fix
   * shipped as *"Cannot access X before initialization"* inside the minified bundle.
   */
  /*
   * ⚠️ **THE PATCH'S OWN LOCALS ARE NOT A DEAD ZONE, AND THE FIRST DRAFT FLAGGED ONE.** `put` is a
   * `const` arrow declared inside `patchLive`, four lines above its first call — it is initialised
   * by the time anything reaches it, every time, because control entered the function at the top.
   * The hazard is only ever a helper declared ELSEWHERE in the closure and called from here, so the
   * body is cut out of the haystack rather than the finding being waved through.
   */
  const outside = phone.replace(patchBody, '');
  const arrowDecls = new Set([...outside.matchAll(
    /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/gm,
  )].map((m) => m[1]));
  const called = [...new Set([...patchBody.matchAll(/(?:^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]))];
  const dead = called.filter((n) => arrowDecls.has(n));
  t('RI22d · nothing `patchLive` calls is a `const` arrow — no temporal dead zone off a socket frame',
    dead.length === 0,
    `${called.length} calls checked against ${arrowDecls.size} arrow declarations in the file`
    + (dead.length ? ` · DEAD ZONE: ${dead.join(', ')}` : ' · none'));
  t('RI22e control · the sweep can see one — a planted `const` arrow helper is caught',
    (() => {
      const planted = new Set([...arrowDecls, 'bezelCap']);
      return ['bezelCap'].filter((n) => planted.has(n)).length === 1
        && called.includes('bezelCap');
    })(),
    'the predicate finds the exact shape that shipped twice today');
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

  /* -----------------------------------------------------------------------------------------
   * 🎯 **AND THE SAME JOURNEY FOR AN OBJECTIVE PIN, WHICH IS THE 2026-09-02 HALF.**
   *
   * The four checks above proved a DOOR pin reaches exactly two people and moves a body. A job pin
   * rides the same verb, the same four fields and the same two guards, so the only honest way to
   * know it is not a special case somewhere is to send one down nine real sockets and photograph
   * the result. RI19n is the one that would have caught a widened row: `mount-floor` is the guide
   * choosing the junk bracket, and a seated phone that could read that word would be watching the
   * sabotage happen.
   * -------------------------------------------------------------------------------------------- */
  const seenObj = { runner: runnerPad.frames.length, seated: seatedPad.frames.length };
  guidePad.send({ t: 'pin', x: 5.75, z: 0.22, roomId: 'r0.gallery', kind: 'face-right' });
  await sleep(220);
  const objPin = runnerPad.last('state')?.frame?.you?.pin ?? null;
  t('RI19l · a JOB pin travels the same wire as a door pin, kind intact, four fields still',
    objPin?.kind === 'face-right' && objPin?.x === 5.75 && objPin?.roomId === 'r0.gallery'
    && Object.keys(objPin).sort().join(',') === 'kind,roomId,x,z'
    && guidePad.last('state')?.frame?.you?.pin?.kind === 'face-right'
    && room.game.state.pin?.kind === 'face-right',
    JSON.stringify(objPin));
  t('RI19m · the television is told which target, as a directed control input',
    tv.last('pin')?.kind === 'face-right' && tv.of('pin').length === 3,
    `${tv.of('pin').length} pushes · ${JSON.stringify(tv.last('pin'))}`);
  /*
   * 🚨 **MEASURED: BOTH GUARDS HAVE TO FALL, AND THE SAME PAIR STANDS ON A JOB PIN.** RI18e's
   * header records that widening the four `you.pin.*` rows to `all` reddens RI10c and leaves the
   * live sweep GREEN, because `room.js` also gates the field on the socket's seat role. Repeated
   * for an objective pin on 2026-09-02 and it behaves identically: table alone → RI10c only; table
   * AND the frame builder → RI10c, RI18e, RI19n and RI19p together. Recorded rather than left as a
   * coincidence, because the day somebody "simplifies" one of the two guards, this is the note
   * that says the other one was never redundant.
   */
  t('RI19n · and no seated phone learns which one the guide picked — swept over the raw bytes',
    seatedPad.last('state')?.frame?.you?.pin === undefined
    && !/face-right/.test(seatedPad.since(seenObj.seated))
    && !/5\.75/.test(seatedPad.since(seenObj.seated)),
    `${seatedPad.frames.length - seenObj.seated} frames since the tap, none carrying it`);
  t('RI19o control · the sweep can see — the same sweep over the RUNNER frames finds the word',
    /face-right/.test(runnerPad.since(seenObj.runner)),
    'a needle where the needle provably is');
  /*
   * ⚠️ **AND THE DRILL'S JUNK BRACKET IS THE SAME SHAPE, WHICH IS WHY IT IS SENT TOO.** `mount-floor`
   * is the only pin in the game whose NAME is the sabotage; if any of the three surfaces above were
   * to treat the two mount kinds differently from the two face kinds, this is where it would show.
   */
  guidePad.send({ t: 'pin', x: 11.78, z: 2.5, roomId: 'r0.gallery', kind: 'mount-floor' });
  await sleep(200);
  t('RI19p · the junk bracket is pinnable and private on exactly the same terms',
    room.game.state.pin?.kind === 'mount-floor'
    && runnerPad.last('state')?.frame?.you?.pin?.kind === 'mount-floor'
    && seatedPad.last('state')?.frame?.you?.pin === undefined
    && tv.of('pin').length === 4,
    'an evil guide gets no special handling, and neither does a good one');

  /* -----------------------------------------------------------------------------------------
   * 📍 **RI19r · AND IT DIES WITH THE JOB, WHICH IS A BUG THIS PASS FOUND BY WALKING THE LOOP.**
   *
   * Pinned at a face, the smash lands, `armMission` moves `mission.room` to the ballroom, and
   * `objectiveGoal` correctly refuses the pin — the body stands, which is the design. What was
   * wrong is that the pin was still on the runner's BEZEL, pointing at a canvas she had already
   * broken. `setWorld` now drops an objective pin when the mission leaves `seek`, and RI19r2 is
   * the half that stops the fix from being too big: a DOOR pin is how the guide walks her home
   * and must survive the same transition untouched.
   * -------------------------------------------------------------------------------------------- */
  const stale = { t: 'world', runner: { room: 'r0.gallery', x: 4.25, z: -1.5 }, view: 'top' };
  guidePad.send({ t: 'pin', x: 5.75, z: 0.22, roomId: 'r0.gallery', kind: 'face-right' });
  await sleep(160);
  tv.send({ ...stale, mission: { phase: 'return', room: 'r0.ballroom', job: 'smash' } });
  await sleep(200);
  t('RI19r · the smash lands and the objective pin goes with it — no bearing at a broken canvas',
    room.game.state.pin === null
    && runnerPad.last('state')?.frame?.you?.pin === undefined,
    'the pin named a target, and the target stopped being one');

  tv.send({ ...stale, mission: { phase: 'seek', room: 'r0.gallery', job: 'smash' } });
  await sleep(160);
  guidePad.send({ t: 'pin', x: 1.25, z: 3.5, roomId: 'r0.hall', kind: 'room' });
  await sleep(160);
  tv.send({ ...stale, mission: { phase: 'return', room: 'r0.ballroom', job: 'smash' } });
  await sleep(200);
  t('RI19r2 · a DOOR pin survives the same transition — it is how she gets home',
    room.game.state.pin?.kind === 'room' && room.game.state.pin?.x === 1.25
    && runnerPad.last('state')?.frame?.you?.pin?.x === 1.25,
    'the fix clears the pins that stopped meaning something, and only those');

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
