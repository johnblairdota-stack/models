#!/usr/bin/env node
/**
 * 🧭 **intel-pads — GUIDE E AND RUNNER D, EXECUTED RATHER THAN EYEBALLED.**
 *
 *   node harness/intel-pads.mjs
 *
 * John locked the two boards on 2026-09-01:
 * `docs/design/refs-runner-intel/canvas/GuidePadE.dc.html` (Neighbours Only) and
 * `RunnerPadD.dc.html` (Frame Bezel). The lock they answer to is `docs/design/runner-intel.md`
 * — a job plus local senses, a bearing PIN and never a polyline.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THIS GATE IS FOR, AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------------------------
 * `docs/slices/task-runner-intel.md` §9 names a gate `harness/runner-intel.mjs` with checks R1–R9.
 * **That is the BRAIN's gate and it is still unwritten** — R1/R2/R3 are about `mission.js` growing
 * a kind and a resolver, R4/R6/R7/R8 are about the steering that replaces `RunnerRoute`, and none
 * of that is this slice. This file is the PADS, its ids are IP*, and it leaves that name free so
 * the brain slice can take it without a merge fight.
 *
 * Two of the R-list ARE pad properties, and they are honoured here under their own numbers so
 * they are not lost: R5 (*a pin replaces; two taps never produce two live pins*) is IP6, and R9
 * (*the TV carries no pin, no bearing, no route*) is IP9 with the `leak:` control R9 asks for.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 WHY THE ASSERTIONS RUN THE SHIPPED FUNCTIONS AND NOT A COPY
 * ---------------------------------------------------------------------------------------------
 * Rung 3's lesson, applied one screen over. `link-merge` L10–L14 proved the whisper's privacy on
 * the wire and every check was about bytes; the chrome was a template literal inside a browser
 * view, so *"the partner pad shows the words and a third does not"* had only ever been checked by
 * opening six tabs. `whisperLines`/`pairShape` moved into `link.js` so a node gate could execute
 * them. `intel-pad.js` exists for the same reason and this file imports it directly — a leak has
 * to get past the same function on both machines.
 *
 * Pure node. No browser, no port, no `npm install`.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { guideMapSvg } from '../src/party/guidemap.js';
import { PLAN_YAW } from '../src/party/follow.js';
import { pickPlanSeed, planRegions } from '../src/party/mansion.js';
import { AUDIENCE, MATRIX, audienceFor } from '../net/party/entitle.js';
import {
  BEZEL, COMPASS_4, COMPASS_8, GUIDE_PAD_KEYS, PAD_FORBIDDEN, PIN_KEYS, RUNNER_PAD_KEYS,
  SCREEN_RIGHT, SCREEN_UP,
  bezelOf, bezelWords, centreOf, compassOf, guidePad, neighbourScope, padLeaks, pinDoor, pinShape,
  regionAt, roomGraph, runnerPad, sayThis,
} from '../src/party/intel-pad.js';

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, '..', rel), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const t = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); }
  return c;
};

const phoneSrc = src('src/views/party-phone.js');
const hostSrc = src('src/views/party-host.js');
const followSrc = src('src/party/follow.js');
const mapSrc = src('src/party/guidemap.js');

/** Eight generated houses, and a place to stand in each. Nothing hand-authored anywhere below. */
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const houses = SEEDS.map((s) => {
  const seed = pickPlanSeed(s).seed;
  const plan = planRegions(seed);
  const g = roomGraph(plan);
  /*
   * ⚠️ STAND INSIDE A RECT, NEVER AT A REGION'S AVERAGED CENTRE. A region is a UNION of
   * rectangles, so an L-shaped corridor's mean point can land in the notch — off the floor
   * entirely. `regionAt` correctly answers `null` there (it never nearest-guesses), and a probe
   * that used the mean would report "0 doors" for a perfectly ordinary corridor and look like a
   * graph bug. Seed 3's `c1` is exactly that shape; it is why this line reads as it does.
   */
  const spots = [...new Set(g.rects.map((r) => r.id))].map((id) => {
    const r = g.rects.find((k) => k.id === id);
    return { id, at: { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 } };
  });
  return { s, seed, plan, g, spots };
});

console.log('\nintel-pads — Guide E neighbours only, Runner D frame bezel');

/* =================================================================================================
 * IP1–IP3 · THE COMPASS AND THE HOUSE GRAPH
 * ============================================================================================== */

console.log('\n  the compass, and the house as it is now');

/*
 * The compass is DERIVED from `PLAN_YAW`, which is the same constant the plan-locked camera and
 * the absolute stick are nailed to (`follow.js` L145-156: *"screen-up is world −Z, screen-right is
 * +X… the absolute top-down stick is this constant and nothing else"*). A hand-typed `north = -z`
 * would point the player the wrong way the day that constant moved, with a green test beside it —
 * so the check is that the derivation AGREES with the shipped promise, not that it equals a
 * number somebody typed twice.
 */
{
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  /*
   * ⚠️ **THE PATTERN CROSSES A LINE BREAK, SO IT IS WRITTEN TO.** `CLAUDE.md` banked this the day
   * `host-desync` H8 was red locally and green in CI against byte-identical content: a source-
   * reading gate whose regex spans a wrap misses by one invisible character, and the tempting
   * "fix" edits the product. `src()` already normalises CRLF → LF; this also absorbs the comment
   * gutter (`\n * `) that JSDoc reflow puts in the middle of the sentence.
   */
  const promise = /screen-up is world −Z, screen-right\s*(?:\n\s*\*)?\s*is \+X/.test(followSrc);
  t('IP1 · the compass is derived from `PLAN_YAW`, and it agrees with what `follow.js` promises',
    promise
    && near(SCREEN_UP.x, 0) && near(SCREEN_UP.z, -1)
    && near(SCREEN_RIGHT.x, 1) && near(SCREEN_RIGHT.z, 0)
    && compassOf(0, -5, 4) === 'north' && compassOf(5, 0, 4) === 'east'
    && compassOf(0, 5, 4) === 'south' && compassOf(-5, 0, 4) === 'west'
    && compassOf(5, -5, 8) === 'up-right' && compassOf(-5, 5, 8) === 'down-left',
    `PLAN_YAW ${PLAN_YAW.toFixed(4)} · up (${SCREEN_UP.x.toFixed(0)},${SCREEN_UP.z.toFixed(0)})`
    + ` · right (${SCREEN_RIGHT.x.toFixed(0)},${SCREEN_RIGHT.z.toFixed(0)})`
    + ` · the follow.js sentence is ${promise ? 'still there' : 'GONE'}`);
}

/*
 * The graph is geometry, every time. `procedural-map.md`'s whole argument is that the moment the
 * generator moves a wall a memorised anything is a cheat that fails — so the assertion is over
 * eight generated houses and it never names a room.
 */
{
  const rows = houses.map((h) => {
    const ids = new Set(h.g.rects.map((r) => r.id));
    const idsOk = h.g.edges.every((e) => ids.has(e.a) && ids.has(e.b) && e.a !== e.b);
    // Every region reachable from every other: a house with an island is a house that cannot be
    // played, and it would also make "neighbours only" a trap rather than a scope.
    const adj = new Map([...ids].map((id) => [id, new Set()]));
    for (const e of h.g.edges) { adj.get(e.a).add(e.b); adj.get(e.b).add(e.a); }
    const seen = new Set([[...ids][0]]);
    const q = [[...ids][0]];
    while (q.length) for (const n of adj.get(q.pop())) if (!seen.has(n)) { seen.add(n); q.push(n); }
    return { s: h.s, ids: ids.size, edges: h.g.edges.length, idsOk, whole: seen.size === ids.size };
  });
  t('IP2 · the portal graph is derived from `planRegions` on 8 generated houses, and each is whole',
    rows.length === 8 && rows.every((r) => r.idsOk && r.whole && r.edges >= r.ids - 1),
    rows.map((r) => `s${r.s}:${r.ids}r/${r.edges}e${r.whole ? '' : ' SPLIT'}`).join(' '));
}

{
  // `regionAt` never nearest-guesses. A point outside the envelope is `null`, not the closest room.
  const h = houses[0];
  const far = regionAt(h.g.rects, { x: -999, z: -999 });
  const nan = regionAt(h.g.rects, { x: NaN, z: 0 });
  const none = regionAt(h.g.rects, null);
  const inside = h.spots.every((sp) => regionAt(h.g.rects, sp.at) === sp.id);
  t('IP3 control · a point off the floor is `null`, never the nearest room',
    far === null && nan === null && none === null && inside,
    `${h.spots.length} interior points each resolve to their own region`);
}

/* =================================================================================================
 * IP4–IP6 · GUIDE E · NEIGHBOURS ONLY
 * ============================================================================================== */

console.log('\n  Guide E — neighbours only');

/*
 * 🚨 **THE HEADLINE. The scope is ONE DOOR DEEP, measured against the graph rather than trusted.**
 *
 * The board's argument is that a pin can then only ever be one doorway ahead, so *"the pad cannot
 * hold a route even in principle — there is no second step on it to draw."* This is that claim
 * turned into arithmetic: for every place to stand in eight generated houses, every lit region is
 * either where she is or a direct neighbour of it, and every gate leads to a lit region. A
 * two-hop room appearing in `lit` is the failure this is here to catch.
 */
{
  const bad = [];
  let stands = 0, litTotal = 0;
  for (const h of houses) {
    const adj = new Map();
    for (const e of h.g.edges) {
      if (!adj.has(e.a)) adj.set(e.a, new Set());
      if (!adj.has(e.b)) adj.set(e.b, new Set());
      adj.get(e.a).add(e.b); adj.get(e.b).add(e.a);
    }
    for (const sp of h.spots) {
      const sc = neighbourScope(h.plan, sp.at);
      stands++; litTotal += sc.lit.length;
      if (sc.hereId !== sp.id) { bad.push(`s${h.s} ${sp.id}: hereId ${sc.hereId}`); continue; }
      for (const id of sc.lit) {
        if (id === sp.id) continue;
        if (!adj.get(sp.id)?.has(id)) bad.push(`s${h.s} ${sp.id}: ${id} is NOT a neighbour`);
      }
      for (const g of sc.gates) {
        if (!sc.lit.includes(g.toId)) bad.push(`s${h.s} ${sp.id}: gate to unlit ${g.toId}`);
        if (!COMPASS_4.includes(g.dir)) bad.push(`s${h.s} ${sp.id}: dir "${g.dir}"`);
      }
      // Fog and lit partition the house — no region is in both and none is in neither.
      const all = new Set(h.g.rects.map((r) => r.id));
      if (sc.lit.length + sc.fog.length !== all.size) bad.push(`s${h.s} ${sp.id}: ${sc.lit.length}+${sc.fog.length} != ${all.size}`);
      if (sc.lit.some((id) => sc.fog.includes(id))) bad.push(`s${h.s} ${sp.id}: overlap`);
    }
  }
  t('IP4 · every lit region is her own or ONE door from it, over every stand in 8 houses',
    bad.length === 0 && stands >= 60,
    `${stands} places to stand · ${(litTotal / stands).toFixed(1)} regions lit on average`
    + (bad.length ? ` · ${bad.slice(0, 3).join(' | ')}` : ' · no two-hop room reached the pad'));
}

{
  // At most four chips, one per direction, and never two chips saying the same word — two NORTH
  // buttons is not a control. The nearer door is the one a person in the room would mean.
  const bad = [];
  let four = 0;
  for (const h of houses) {
    for (const sp of h.spots) {
      const sc = neighbourScope(h.plan, sp.at);
      const dirs = sc.gates.map((g) => g.dir);
      if (dirs.length !== new Set(dirs).size) bad.push(`s${h.s} ${sp.id}: ${dirs.join('/')}`);
      if (dirs.length > 4) bad.push(`s${h.s} ${sp.id}: ${dirs.length} chips`);
      if (dirs.length === 4) four++;
      // The chips come out in compass order so they do not reshuffle under the thumb on a repaint.
      const order = dirs.map((d) => COMPASS_4.indexOf(d));
      if (order.some((v, i) => i && v < order[i - 1])) bad.push(`s${h.s} ${sp.id}: out of order`);
    }
  }
  t('IP5 · one chip per direction, at most four, always in compass order',
    bad.length === 0, bad.length ? bad.slice(0, 3).join(' | ') : `${four} rooms with all four exits`);
}

/*
 * IP6 · **D2, and it is `task-runner-intel.md` R5 arriving here rather than in the brain's gate.**
 * *"A second tap replaces the pin; it does not append to it. There is no pin list, no ordering, no
 * undo stack."* The control matters as much as the arm: a `pinDoor` that took the previous pin as
 * an argument would be one refactor from an array.
 */
{
  const h = houses.find((k) => k.spots.some((sp) => neighbourScope(k.plan, sp.at).gates.length >= 2));
  const sp = h.spots.find((k) => neighbourScope(h.plan, k.at).gates.length >= 2);
  const sc = neighbourScope(h.plan, sp.at);
  const a = pinDoor(sc, sc.gates[0].dir);
  const b = pinDoor(sc, sc.gates[1].dir);
  const wall = pinDoor(sc, COMPASS_4.find((d) => !sc.gates.some((g) => g.dir === d)) ?? 'nowhere');
  const shape = pinShape(a);
  t('IP6 · a pin REPLACES — two taps make two separate objects and neither is a list (D2 / R5)',
    a && b && a.roomId !== b.roomId
    && !Array.isArray(a) && !Array.isArray(b)
    && Object.keys(shape).sort().join(',') === [...PIN_KEYS].sort().join(',')
    && PIN_KEYS.length === 4
    // `pinDoor` takes no previous pin, so there is nothing for a second tap to append TO.
    && pinDoor.length === 2
    && wall === null && pinShape(null) === null,
    `${a.roomId} then ${b.roomId} · keys ${PIN_KEYS.join('/')} · a wall pins nothing`);

  t('IP6b · the guide is handed one sentence to SAY, and it names the door she pinned',
    sayThis(sc, a) === `Take the ${sc.gates[0].dir} door.`
    && sayThis(sc, b) === `Take the ${sc.gates[1].dir} door.`
    && /^Pin a door/.test(sayThis(sc, null)),
    `"${sayThis(sc, a)}" · unpinned: "${sayThis(sc, null)}"`);
}

/* =================================================================================================
 * IP7–IP8 · THE MAP, SCOPED — and the regression net it must not break
 * ============================================================================================== */

console.log('\n  the map, scoped');

/*
 * 🚨 **ADDITIVE, PROVEN BY BYTES.** `party-warm` W8–W8i and `party-isolation` I10b are the
 * regression net for this renderer and they all call it unscoped. If `scope` changed the default
 * output at all, that net would be measuring something else from now on — so the first assertion
 * is that an unscoped call is byte-identical with the parameter absent, present-and-null, and
 * present-and-empty.
 */
{
  const seed = pickPlanSeed(3).seed;
  const a = guideMapSvg({ seed, goal: 'gallery', runner: { x: 2, z: 2 } });
  const b = guideMapSvg({ seed, goal: 'gallery', runner: { x: 2, z: 2 }, scope: null });
  const c = guideMapSvg({ seed, goal: 'gallery', runner: { x: 2, z: 2 }, scope: { lit: [] } });
  t('IP7 · an unscoped map is byte-identical to the shipped one — `scope` is purely additive',
    a === b && b === c && !/gm-fog/.test(a) && /gm-room/.test(a) && /gm-goal/.test(a)
    // W8c/W8d, re-run here so this file fails too if the scope work ever reaches them.
    && !guideMapSvg({ seed }).includes('gm-hunter')
    && guideMapSvg({ seed, flyover: { hunter: { x: 1, z: 1 } } }).includes('gm-hunter'),
    `${a.length} chars, three ways of asking for no scope · W8c/W8d still hold`);
}

/*
 * 🚫 **FOG HIDES — ONE RULE, INCLUDING MARKS, AND THAT IS THE HUNTER ANSWER.**
 *
 * Rung 5 is a door and it is shut: *do not build a hunter, do not add hunter fields to pads.* So
 * Guide E's warmth strip is NOT implemented, and *"hunter as warmth not a map"* is satisfied here
 * by removal instead — outside her lit rooms the hunter has no position on the pad at all. The
 * control is the other half: the same mark inside a lit neighbour still draws, and the same mark
 * with no scope still draws, so this is a scope rule and not a deletion.
 */
{
  const bad = [];
  for (const h of houses) {
    const sp = h.spots[0];
    const pad = guidePad(h.seed, sp.at, null);
    if (!pad.fog.length) continue;
    const fogRect = h.g.rects.find((r) => pad.fog.includes(r.id));
    const fogPt = { x: (fogRect.x0 + fogRect.x1) / 2, z: (fogRect.z0 + fogRect.z1) / 2 };
    const scoped = guideMapSvg({ seed: h.seed, scope: pad, flyover: { hunter: fogPt, marks: [fogPt] } });
    if (/gm-hunter/.test(scoped)) bad.push(`s${h.s}: hunter drawn in fog`);
    if (/gm-mark/.test(scoped)) bad.push(`s${h.s}: mark drawn in fog`);
    if (!/gm-fog/.test(scoped)) bad.push(`s${h.s}: nothing fogged`);
    if (!/gm-here/.test(scoped)) bad.push(`s${h.s}: her own room not marked`);
    // controls
    if (!/gm-hunter/.test(guideMapSvg({ seed: h.seed, flyover: { hunter: fogPt } }))) {
      bad.push(`s${h.s}: UNSCOPED hunter vanished — that is a deletion, not a scope`);
    }
    const litRect = h.g.rects.find((r) => pad.lit.includes(r.id));
    const litPt = { x: (litRect.x0 + litRect.x1) / 2, z: (litRect.z0 + litRect.z1) / 2 };
    if (!/gm-hunter/.test(guideMapSvg({ seed: h.seed, scope: pad, flyover: { hunter: litPt } }))) {
      bad.push(`s${h.s}: a mark in a LIT room vanished too`);
    }
  }
  t('IP8 · fog hides rooms, names AND marks — with both controls: unscoped and in-a-lit-room draw',
    bad.length === 0, bad.length ? bad.slice(0, 3).join(' | ') : '8 houses · one rule, no hunter special case');
}

{
  // The room names go with the rooms. A label floating over fog would hand back by text exactly
  // the picture the fog removes.
  const h = houses[2];
  const pad = guidePad(h.seed, h.spots[0].at, null);
  const scoped = guideMapSvg({ seed: h.seed, scope: pad });
  const plain = guideMapSvg({ seed: h.seed });
  const nLabels = (s) => (s.match(/gm-label/g) || []).length;
  const nDoors = (s) => (s.match(/gm-door/g) || []).length;
  t('IP8b · a fogged room keeps its name to itself, and only her own exits are drawn as gates',
    nLabels(scoped) < nLabels(plain) && nLabels(scoped) >= 0
    && nDoors(scoped) === pad.gates.length
    && (scoped.match(/gm-gate/g) || []).length === pad.gates.length,
    `labels ${nLabels(scoped)} of ${nLabels(plain)} · doors ${nDoors(scoped)} of ${nDoors(plain)}`);
}

/* =================================================================================================
 * IP9 · RUNNER D · THE BEZEL — pixels on an edge, and no coordinate anywhere in it
 * ============================================================================================== */

console.log('\n  Runner D — the frame bezel');

/*
 * 🚨 **THE INVARIANT THAT MAKES THIS SAFE IN A RUNNER'S HAND.** `bezelOf` returns pixels on a
 * phone edge, a screen word and a range BAND. You cannot reconstruct a map from
 * `{edge:'top', from:236, to:354}`. It is a heading and a rough distance, which is what a person
 * shouting across a couch conveys, and nothing more. `padLeaks('runner', …)` closes it.
 */
{
  const at = { x: 0, z: 0 };
  const cases = [
    { pin: { x: 0, z: -9 }, want: 'up', edge: 'top' },
    { pin: { x: 9, z: 0 }, want: 'right', edge: 'right' },
    { pin: { x: 0, z: 9 }, want: 'down', edge: 'bottom' },
    { pin: { x: -9, z: 0 }, want: 'left', edge: 'left' },
    { pin: { x: 9, z: -9 }, want: 'up-right', edge: 'right' },
  ];
  const rows = cases.map((k) => ({ ...k, b: bezelOf({ pin: k.pin, at }) }));
  const spanOf = (b) => b.runs.reduce((n, r) => n + (r.to - r.from), 0);
  t('IP9 · the bearing is a run of BEZEL PIXELS at the pin\'s angle, on the edge it points at',
    rows.every((r) => r.b.word === r.want)
    && rows.every((r) => r.b.runs.some((k) => k.edge === r.edge))
    && rows.every((r) => Math.abs(spanOf(r.b) - BEZEL.span) < 0.5)
    && rows.every((r) => r.b.runs.every((k) => k.to > k.from))
    && COMPASS_8.length === 8,
    rows.map((r) => `${r.want}:${r.b.runs.map((k) => k.edge).join('+')}`).join(' '));
}

{
  // A corner. The run has to wrap onto the next edge rather than clip, or the glow silently
  // shrinks exactly where the bearing is most diagonal.
  const at = { x: 0, z: 0 };
  const { w, h, span } = BEZEL;
  // Aim at the top-right corner of the viewport: dx/dz in the ratio (w/2):(h/2).
  const b = bezelOf({ pin: { x: w / 2, z: -h / 2 }, at });
  const total = b.runs.reduce((n, r) => n + (r.to - r.from), 0);
  t('IP9b · a bearing into a corner WRAPS across two edges and keeps its full length',
    b.runs.length === 2
    && new Set(b.runs.map((r) => r.edge)).size === 2
    && Math.abs(total - span) < 0.5,
    b.runs.map((r) => `${r.edge} ${r.from}→${r.to}`).join(' + ') + ` = ${total.toFixed(1)}px of ${span}`);
}

{
  const at = { x: 0, z: 0 };
  const lit = bezelOf({ pin: { x: 3, z: -3 }, at });
  const armed = bezelOf({ pin: { x: 3, z: -3 }, at, ready: true });
  const blank = bezelOf({});
  t('IP9c · smash-ready takes the WHOLE bezel and ERASES the bearing — a hammer state, not a hint',
    armed.whole === true && armed.runs.length === 0 && armed.word === '' && armed.range === ''
    && lit.whole === false && lit.runs.length > 0
    && bezelWords(armed) === 'swing now'
    && blank.whole === false && blank.runs.length === 0 && blank.pinned === false
    && bezelWords(blank) === 'no pin yet',
    'armed outranks the segment · unpinned says so rather than pointing somewhere');
}

{
  // Range is a WORD, never a number: a metre count is a measurement the guide never gave her.
  const at = { x: 0, z: 0 };
  const words = [2, 10, 30].map((d) => bezelOf({ pin: { x: 0, z: -d }, at }).range);
  const shape = runnerPad(at, { x: 1, z: -1 }, false);
  const flat = JSON.stringify(shape);
  t('IP9d · the runner\'s whole shape holds NO world coordinate — pixels, a word and a band',
    new Set(words).size === 3
    && padLeaks('runner', shape).length === 0
    && !/"x"|"z"|"roomId"/.test(flat)
    && Object.keys(shape).every((k) => RUNNER_PAD_KEYS.includes(k)),
    `${words.join(' → ')} · ${flat.length} chars, none of them a metre`);
}

/* =================================================================================================
 * IP10 · THE SEAL — deny-by-default, with the controls that make it mean something
 * ============================================================================================== */

console.log('\n  the seal');

{
  const h = houses[3];
  const sp = h.spots.find((k) => neighbourScope(h.plan, k.at).gates.length >= 1);
  const sc = neighbourScope(h.plan, sp.at);
  const gp = guidePad(h.seed, sp.at, pinDoor(sc, sc.gates[0].dir));
  const rp = runnerPad(sp.at, pinDoor(sc, sc.gates[0].dir), false);
  t('IP10 · both live pad shapes pass their own closed schema',
    padLeaks('guide', gp).length === 0 && padLeaks('runner', rp).length === 0
    && GUIDE_PAD_KEYS.length > 0 && RUNNER_PAD_KEYS.length > 0,
    `guide ${Object.keys(gp).length} keys · runner ${Object.keys(rp).length} keys`);

  /*
   * 🚨 THE CONTROLS. D4's forbidden shapes, each planted for real. A checker that says yes to
   * everything is not a checker, and the FIRST of these is the exact thing the whole lock exists
   * to refuse: *"if you can print the runner's whole future at spawn time, you built the wrong
   * thing."*
   */
  const withRoute = { ...gp, path: [{ x: 1, z: 1 }, { x: 2, z: 2 }] };
  const withNext = { ...gp, gates: gp.gates.map((g) => ({ ...g, next: 'r5.chapel' })) };
  const withHunter = { ...gp, hunter: { x: 4, z: 4 } };
  const runnerWithXZ = { ...rp, x: 3, z: 4 };
  const bad = [
    ['a polyline', padLeaks('guide', withRoute)],
    ['a second hop on a gate', padLeaks('guide', withNext)],
    ['a hunter position', padLeaks('guide', withHunter)],
    ['a coordinate on the RUNNER pad', padLeaks('runner', runnerWithXZ)],
    ['not a shape at all', padLeaks('guide', null)],
  ];
  t('IP10b control · a polyline, a second hop, a hunter and a stray coordinate are each a RED LINE',
    bad.every(([, v]) => v.length > 0)
    && PAD_FORBIDDEN.includes('path') && PAD_FORBIDDEN.includes('next')
    && PAD_FORBIDDEN.includes('hunter') && PAD_FORBIDDEN.includes('route'),
    bad.map(([n, v]) => `${n}: ${v[0]}`).join(' · '));
}

/* =================================================================================================
 * IP11 · D9 — THE TV CARRIES NONE OF IT, AND THE WIRE DOES NOT EITHER YET
 * ============================================================================================== */

console.log('\n  the television, and the wire');

/*
 * D9 is absolute and predates this slice (`party-loop.md` "Do not" #1, `CLAUDE.md`): no pin, no
 * bearing, no route line, no whole-house fit on the television. *"If you feel the need to show
 * intel on the TV, you have failed the brief."* This is `task-runner-intel.md` R9 with the
 * `leak:` control R9 asks for — a sweep that finds nothing proves nothing until a planted needle
 * proves the sweep can see.
 */
{
  const NEEDLE = /intel-pad|guidePinPad|bezelHtml|pinDoor|neighbourScope|guideMapSvg|GUIDE_MAP/;
  const tvHits = NEEDLE.test(hostSrc);
  const planted = ["import { pinDoor } from '../party/intel-pad.js';", '${bezelHtml(bez)}',
    'guidePinPad(scope)'].filter((s) => NEEDLE.test(s));
  t('IP11 · the TV imports no pad intel — no pin, no bearing, no map (D9 / R9)',
    !tvHits && planted.length === 3,
    `party-host.js: ${tvHits ? 'HIT' : 'clean'} · control: ${planted.length}/3 planted lines caught`);
}

/*
 * 🚨 **A FAIL-CLOSED GUARD PLACED BEFORE THE FEATURE — the `room-ghosts` RG5b shape.**
 *
 * The pin has NO WIRE. `MATRIX` is deny-by-default and carries no pin row and no smash-ready row,
 * so `bezelOf` renders the unpinned state on a live night and the guide's pin travels the way the
 * locked rule says the calls travel: **out loud, in the room.** That is Stage 3 of
 * `task-runner-intel.md` and it is budgeted its own review.
 *
 * Stating the zero-of-zero rather than letting it read as coverage is the point. The day somebody
 * adds a pin field, this goes RED and they have to decide the audience DELIBERATELY — and the
 * answer is already written down: `crew`, which is runner-or-guide and exists in `AUDIENCE`
 * today. Never `all`; a seated phone must not learn where the target is.
 */
{
  const rows = MATRIX.map(([k]) => k);
  const pinRows = rows.filter((k) => /(^|\.)pin|bearing|smashReady|ready$/i.test(k));
  const phoneSends = /send\(\s*\{\s*t:\s*'pin'/.test(phoneSrc);
  t('IP11b guard · there is no pin on the wire yet, and `crew` is the audience waiting for it',
    pinRows.length === 0 && !phoneSends
    && AUDIENCE.includes('crew') && audienceFor('you.here') === 'runner'
    && audienceFor('flyover.marks[].x') === 'guide',
    `${rows.length} matrix rows, ${pinRows.length} of them a pin · Stage 3 · goes RED the day one lands`);
}

/*
 * IP12 · and the phone really renders both boards. A model nothing calls is a model, not a pad —
 * `phone-accusation`'s lesson (a gate that served the build read a stale `dist/` for two full
 * runs) is that the source is what to bind to when the assertion is "the shipped screen does it".
 */
{
  const guideWired = /guidePad\(seed, meMark, state\.pin\)/.test(phoneSrc)
    && /\$\{guidePinPad\(scope\)\}/.test(phoneSrc)
    && /scope,\n\s*\}\)/.test(phoneSrc);
  const runnerWired = /const bez = runnerPad\(/.test(phoneSrc)
    && /\$\{bezelHtml\(bez\)\}/.test(phoneSrc);
  const stillTheMap = /guideMapSvg\(/.test(phoneSrc) && /The map is yours/.test(phoneSrc);
  const assigns = (phoneSrc.match(/state\.pin = /g) || []).length;
  t('IP12 · the phone renders both boards, and the pin is a SLOT that is assigned, never pushed',
    guideWired && runnerWired && stillTheMap
    && assigns === 1 && !/state\.pin\.push|pins\s*[:=]\s*\[/.test(phoneSrc)
    // D13: still no 3D and no chase embed on this phone. The bezel is chrome on black.
    && !/warmUrl\(/.test(phoneSrc) && !/runner-chase-layer/.test(phoneSrc),
    `guide ${guideWired ? 'wired' : 'MISSING'} · runner ${runnerWired ? 'wired' : 'MISSING'}`
    + ` · ${assigns} assignment to state.pin, no array anywhere`);
}

{
  // NO HEX in the map's own CSS — `guidemap.js` says so in capitals and the new classes are held
  // to it, for `party-follow` F8's reason: a reskin that misses one surface leaves one stale one.
  const css = (mapSrc.match(/export const GUIDE_MAP_CSS = `([\s\S]*?)`;/) || [])[1] || '';
  const newOnes = ['gm-fog', 'gm-here', 'gm-gate', 'gm-pin'];
  const hex = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
  t('IP12b · the four new map classes exist and the map\'s CSS still holds no colour of its own',
    newOnes.every((c) => css.includes(`.${c}`)) && hex.length === 0,
    `${newOnes.join(' ')} · ${hex.length ? hex.join(' ') : 'no hex, all --night-* names'}`);
}

console.log(`\n  reading · ${houses.length} generated houses`
  + ` · ${houses.reduce((n, h) => n + h.spots.length, 0)} places to stand`
  + ` · bezel ${BEZEL.w}×${BEZEL.h}, ${BEZEL.span}px of glow`);
console.log(`  reading · sample scope: ${(() => {
  const h = houses[2];
  const p = guidePad(h.seed, h.spots[1].at, null);
  return `${p.hereId} → ${p.gates.map((g) => `${g.dir}/${g.toLabel}`).join(', ') || 'no exits'}`
    + ` · ${p.lit.length} lit, ${p.fog.length} fogged`;
})()}`);
console.log(`\n  ${pass} ok · ${fail} fail\n`);
process.exit(fail ? 1 : 0);
