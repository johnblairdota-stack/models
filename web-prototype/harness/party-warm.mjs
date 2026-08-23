#!/usr/bin/env node
/**
 * party-warm — the night-long mansion slot, the cue channel, the seeded plan, and the intel split.
 *
 *   node harness/party-warm.mjs
 *
 * `docs/slices/task-prime-time-lobby-warm-night.md` §7. This slice does three things that widen a
 * surface `party-follow` already guards, and this gate is the price of each:
 *
 *   1. The mansion iframe now lives for a whole NIGHT rather than an episode, so its URL has to be
 *      constant across every cast change — W1. A URL that drifted would reload the house, which is
 *      the exact defect the slice exists to delete.
 *   2. A renderer that had ONE input (a URL) now has TWO (a URL and a postMessage cue), so the cue
 *      needs the same closed schema and the same forbidden words — W2, W3.
 *   3. Good and evil are told different things about the same two bodies, and the difference has
 *      to be a property of the DATA rather than of the client that draws it — W6.
 *
 * 🚨 W3 AND W6b ARE THE CONTROL ARMS. `party-isolation` and `party-follow` both carry deliberately
 * leaky inputs because a gate whose controls stop failing has gone blind. Seven leaky cues and one
 * good-player oracle are built here and every one must be caught.
 *
 * ⚠️ NO BROWSER, NO THREE, NO DEPENDENCY. `.github/workflows/gates.yml` runs the party gates with
 * no `npm install`. Every module this imports is pure by construction, and W7 asserts that rather
 * than trusting it.
 */

import {
  CUE_CAST_KEYS, CUE_KEYS, CUE_KINDS, FOLLOW_FORBIDDEN, FOLLOW_KEYS, FOLLOW_VIEW,
  IDENTITY_SECRETS, MISSION_PHASES, MOVE_KEYS, SPATIAL_WORDS, WARM_KEYS, WARM_STAGES, WORLD_KEYS,
  cueViolations, followParams, followUrl, moveViolations, warmLabel, warmPct, warmUrl,
  warmViolations, worldViolations,
} from '../src/party/follow.js';
import {
  HOME_ROOM, MISSION_ROOM, PLAN_OPTS, PLAN_TRIES,
  coverageRoomOf, homeIsCorner, pickPlanSeed, planFor, planOptsFor, planPasses, planRegions,
  roomLabel, spaceLabel,
} from '../src/party/mansion.js';
import { lockedSeatCount } from '../src/game/chair-seats.js';
import { LAYOUT_CATALOG_IDS, catalogPlacements } from '../src/game/furn-layout.js';
import { FURN_SMASH_ASSETS } from '../src/game/furn-catalog.js';
import { ROOMS, hunterVisibleToGuide } from '../src/party/coverage.js';
import { buildPlan } from './genspike.mjs';
import { DROP_RATE, GRADES, STALE_MAX, gradeFor, intelFor, intelLine } from '../src/party/intel.js';
import { GUIDE_MAP_CSS, guideMapSvg } from '../src/party/guidemap.js';
import { ACCENTS, SHELLS, cleanLook } from '../src/party/look.js';
import { COMPOSITION, dealCast } from '../src/party/cast.js';
import { isNightToken } from '../src/party/palette.js';
import { MATRIX } from '../net/party/entitle.js';
import { FANOUT_KEYS, fanoutViolations } from '../net/party/local.mjs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const t = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); }
  return c;
};

const ORIGIN = 'http://localhost:5178';

console.log('\nparty-warm — the lobby-warm night');

// ---- W1 · the slot is mounted once and its URL never moves ----------------------------------
//
// The whole design rests on this one property. `party-host.js` assigns `iframe.src` from this
// string; the HTML spec discards a nested browsing context when its iframe's `src` is reassigned,
// so a URL that varied with the cast would cost a fresh WebGL context, a fresh 9.0 MB GLB fetch
// and a fresh mansion bake — in the middle of the show, several times.
{
  const a = warmUrl({ room: 'q7kd', worldSeed: 3, origin: ORIGIN });
  const b = warmUrl({ room: 'Q7KD', worldSeed: 3, origin: ORIGIN });
  t('W1 · the warm url is pure, and the room code normalises the same way the run slot does',
    a === b, a);
  t('W1b · it names the follow view, and carries the seed and the warm flag',
    new URL(a).searchParams.get('view') === FOLLOW_VIEW
    && new URL(a).searchParams.get('seed') === '3'
    && new URL(a).searchParams.get('warm') === '1');
  t('W1c · it carries NO runner, name or look — those are what change during a night',
    ['runner', 'name', 'shell', 'accent', 'throttle'].every((k) => !new URL(a).searchParams.has(k)));
  // A seed that arrives late or unparseable must not produce a DIFFERENT url later.
  t('W1d · a missing or junk seed is 0, never absent — an absent seed would move the url later',
    new URL(warmUrl({ room: 'q7kd', origin: ORIGIN })).searchParams.get('seed') === '0'
    && new URL(warmUrl({ room: 'q7kd', worldSeed: 'castSeed', origin: ORIGIN })).searchParams.get('seed') === '0');
  t('W1e · the origin is the page\'s own — the night can never be pointed off-site',
    a.startsWith(`${ORIGIN}/?`));
  t('W1f · and the warm slot satisfies its own closed schema',
    warmViolations(a).length === 0, warmViolations(a).join(',') || 'clean');
}

// ---- W2 · the two slots stay separate, and the run slot is untouched -------------------------
//
// The tempting shortcut was to widen `FOLLOW_BEATS` so `followUrl` starts returning a string at
// lobby. That turns `party-follow` F0c red AND gives the lobby slot a runner field it has no
// business carrying. Asserted here so a later tidy-up cannot quietly merge them.
{
  t('W2 · `warm` is an allowed follow key, so the shared door does not reject the night slot',
    FOLLOW_KEYS.includes('warm'));
  t('W2b · but the RUN slot never emits it — F2c still means what it says',
    followParams({ beat: 'expedition', runnerId: 'p3' }).warm === undefined
    && !followUrl({ beat: 'expedition', runnerId: 'p3', origin: ORIGIN }).includes('warm='));
  t('W2c · a run param on a warm url is a violation — the night slot is the STRICTER of the two',
    warmViolations({ view: FOLLOW_VIEW, warm: '1', seed: '3', runner: 'p3' }).length > 0);
  t('W2d · and the warm key list is a strict subset of the follow key list',
    WARM_KEYS.every((k) => FOLLOW_KEYS.includes(k)) && WARM_KEYS.length < FOLLOW_KEYS.length);
}

// ---- W3 · THE CUE CHANNEL, AND THE SEVEN CONTROL LEAKS ---------------------------------------
//
// A renderer that used to have one input now has two. `party-loop.md`'s "Do not" list is expressed
// here as cue keys: each leak below is a picture that would be on the shared screen if the channel
// were open, and each must be refused BY THE SCHEMA rather than by the view remembering to ignore
// it.
{
  const CAST = [
    { id: 'p1', seat: 0, name: 'Hai', shell: SHELLS[0], accent: ACCENTS[0] },
    { id: 'p2', seat: 1, name: 'Ell', shell: SHELLS[3], accent: ACCENTS[2] },
  ];
  const GOOD = [
    { kind: 'intros', cast: CAST },
    { kind: 'run', runner: 'p1', name: 'Hai', shell: SHELLS[0], accent: ACCENTS[0] },
    { kind: 'move', x: 0.4, y: -1, run: true, swing: false, act: 0 },
    { kind: 'shot', shot: 'lead' },
    { kind: 'idle' },
  ];
  let clean = 0;
  for (const cue of GOOD) {
    if (t(`W3 · a real ${cue.kind} cue has no violations`,
      cueViolations(cue).length === 0, cueViolations(cue).join(',') || 'clean')) clean++;
  }
  t('W3a · every kind the channel declares has a real allow-list and a passing example',
    clean === CUE_KINDS.length && CUE_KINDS.every((k) => Array.isArray(CUE_KEYS[k])),
    CUE_KINDS.join(','));

  const LEAKS = [
    ['L1 flyover on a run cue', { kind: 'run', runner: 'p1', flyover: 1 }],
    ['L2 marks on an intros cue', { kind: 'intros', cast: [], marks: '1,2' }],
    ['L3 hunter on a move cue', { kind: 'move', x: 0, y: 0, hunter: 'east' }],
    ['L4 lid on an idle cue', { kind: 'idle', lid: 0 }],
    ['L5 role smuggled into the cast', { kind: 'intros', cast: [{ ...CAST[0], role: 'PLANT' }] }],
    ['L6 alignment smuggled into the cast', { kind: 'intros', cast: [{ ...CAST[0], alignment: 'evil' }] }],
    ['L7 an unknown kind entirely', { kind: 'godview' }],
  ];
  let caught = 0;
  for (const [label, cue] of LEAKS) {
    const bad = cueViolations(cue);
    if (t(`W3 control ${label} · must be a violation`, bad.length > 0, bad.join(','))) caught++;
  }
  t('W3b · all seven controls red — the cue gate can still see a leak', caught === 7, `${caught}/7`);
  t('W3c · an unknown key is a violation too — deny by default on every kind',
    CUE_KINDS.every((kind) => cueViolations({ kind, cast: [], debug: 1 }).length > 0));
  t('W3d · a shot the operator does not have is refused, not silently ignored',
    cueViolations({ kind: 'shot', shot: 'leed' }).length === 1);

  /*
   * 🚨 THE STRUCTURAL ARGUMENT, ASSERTED RATHER THAN CLAIMED. The cue channel is a second way
   * into the same renderer, so it must refuse exactly the words the URL refuses. If a name were
   * ever removed from one list and not the other, the iframe would be a hole cut around the
   * other channel's schema — which is `party-follow` F5's reasoning, one channel over.
   */
  for (const k of FOLLOW_FORBIDDEN) {
    const kinds = CUE_KINDS.filter((kind) => cueViolations({ kind, cast: [], [k]: 'x' }).length === 0);
    if (!t(`W3e · \`${k}\` is refused on every cue kind`, kinds.length === 0, kinds.join(','))) break;
  }
  t('W3f · no cue key is also a forbidden word',
    Object.values(CUE_KEYS).flat().every((k) => !FOLLOW_FORBIDDEN.includes(k)));

  /*
   * The cast is the widest-looking payload on the channel and is in fact the narrowest kind of
   * data on the wire: it is `FANOUT_KEYS.lobbySeat`'s public subset, already fanned out to every
   * socket in the room by a decision that predates this slice. Asserted against that list rather
   * than restated, so the two cannot drift.
   */
  const extra = CUE_CAST_KEYS.filter((k) => !FANOUT_KEYS.lobbySeat.includes(k));
  t('W3g · the intro cast carries nothing the public lobby snapshot does not already carry',
    extra.length === 0, extra.join(',') || CUE_CAST_KEYS.join(','));
}

// ---- W4 · the pad and the world report -------------------------------------------------------
{
  t('W4 · a real pad message is clean',
    moveViolations({ t: 'move', x: 0.5, y: -0.5, run: false, swing: true }).length === 0);
  t('W4b · the stick is CLAMPED at the door — a phone cannot post a 40 m/s thumb',
    moveViolations({ t: 'move', x: 9, y: 0 }).length === 1
    && moveViolations({ t: 'move', x: 0, y: NaN }).length === 1);
  t('W4c · the pad cannot smuggle a position — there is no x/z, only a stick',
    moveViolations({ t: 'move', x: 0, y: 0, z: 4.2 }).length > 0
    && !MOVE_KEYS.includes('z'));

  const world = {
    t: 'world', seq: 4,
    runner: { room: 'r0.gallery', x: 1.5, z: -2.0 },
    hunter: { room: 'r1.ballroom', x: 9.0, z: 4.2 },
    mission: { phase: 'seek', room: 'r0.gallery' },
  };
  t('W4d · a real world report is clean', worldViolations(world).length === 0,
    worldViolations(world).join(',') || 'clean');
  t('W4e · a world report cannot carry a role, an alignment or a cover',
    ['role', 'alignment', 'cover', 'deal'].every((k) =>
      worldViolations({ ...world, [k]: 'x' }).length > 0));
  t('W4f · nor can one of its spots',
    worldViolations({ ...world, hunter: { ...world.hunter, role: 'HUNTER' } }).length > 0);
  t('W4g · a mission phase off the list is refused',
    worldViolations({ ...world, mission: { phase: 'winning' } }).length === 1
    && MISSION_PHASES.length === 4);
  /*
   * 🚨 THE DIRECTION OF THE ARROW, ASSERTED. `hunter` is a forbidden word on every channel that
   * points INTO the renderer and is the PAYLOAD on the one that points out of it — the TV cannot
   * leak to itself a position it computed. That asymmetry is a real hole if it is left to a
   * comment, so `FOLLOW_FORBIDDEN` is partitioned into spatial words and identity secrets, and
   * both halves are checked: the partition must be exhaustive, and only the spatial half may
   * appear on this channel.
   */
  t('W4h · the forbidden list partitions exactly into spatial words and identity secrets',
    SPATIAL_WORDS.every((k) => FOLLOW_FORBIDDEN.includes(k))
    && IDENTITY_SECRETS.every((k) => FOLLOW_FORBIDDEN.includes(k))
    && SPATIAL_WORDS.length + IDENTITY_SECRETS.length === FOLLOW_FORBIDDEN.length,
    `${SPATIAL_WORDS.length} spatial + ${IDENTITY_SECRETS.length} identity = ${FOLLOW_FORBIDDEN.length}`);
  t('W4i · no world key is an identity secret — the report is about the house, never a person',
    WORLD_KEYS.every((k) => !IDENTITY_SECRETS.includes(k)), WORLD_KEYS.join(','));
  t('W4j control · and the identity half is STILL refused into the renderer, both channels',
    IDENTITY_SECRETS.every((k) => cueViolations({ kind: 'idle', [k]: 'x' }).length > 0
      && worldViolations({ t: 'world', [k]: 'x' }).length > 0));
  t('W4k control · a spatial word is refused into the renderer and allowed out of it',
    cueViolations({ kind: 'idle', hunter: 'x' }).length > 0
    && worldViolations({ t: 'world', hunter: { room: 'r0.gallery', x: 1, z: 1 } }).length === 0);
}

// ---- W5 · the warm ladder is honest ----------------------------------------------------------
//
// A bar that eases on a timer is a lie that gets found out on a slow TV, which is the only machine
// where the bar matters at all. Five real milestones, monotonic, ending at exactly 100.
{
  const pcts = WARM_STAGES.map(warmPct);
  t('W5 · five named stages', WARM_STAGES.length === 5, WARM_STAGES.join(' < '));
  t('W5b · the ladder only ever goes up',
    pcts.every((p, i) => i === 0 || p > pcts[i - 1]), pcts.join(' < '));
  t('W5c · it starts above zero (something IS happening) and ends at exactly 100',
    pcts[0] > 0 && pcts[pcts.length - 1] === 100);
  t('W5d · a stage nobody declared reads 0 rather than throwing on the TV',
    warmPct('sideways') === 0 && warmPct(undefined) === 0);
  t('W5e · the copy says ready only when it is ready',
    warmLabel('ready') !== warmLabel('house') && /ready/.test(warmLabel('ready'))
    && !/ready/.test(warmLabel('boot')));
}

// ---- W6 · THE PLAN, AND THE ROOM THE NIGHT CANNOT DO WITHOUT ----------------------------------
//
// `genplan.js`'s own header: "5 OF 16 SEEDS (0..15) LEAVE PART OF THE HOUSE UNREACHABLE". The
// mission is "break a painting in the gallery, then return to the ballroom", so a night whose
// gallery cannot be walked to is a night that cannot end, in front of eight people.
{
  t('W6 · the night asks for six rooms, because below six the mandatory list is SUBSET',
    PLAN_OPTS.rooms === 6, JSON.stringify(PLAN_OPTS));
  t('W6a · and it asks for open doors — the first mission is a walk, not a dig test',
    PLAN_OPTS.doors === 'open');
  t('W6b · the seed is stringified identically on both sides',
    planOptsFor(7).seed === '7' && planOptsFor('7').seed === '7' && planOptsFor(null).seed === '0');

  let allOk = true, worst = 0, sameSeed = 0;
  for (let ws = 0; ws < 24; ws++) {
    const picked = pickPlanSeed(ws);
    if (!picked.ok) { allOk = false; break; }
    worst = Math.max(worst, picked.tries);
    if (picked.tries === 1) sameSeed++;
    const plan = planFor(picked.seed);
    const types = plan.regions.filter((R) => R.kind === 'room').map((R) => R.type);
    if (!types.includes(MISSION_ROOM) || !types.includes(HOME_ROOM)) { allOk = false; break; }
  }
  t('W6c · every world seed 0..23 resolves to a house with a gallery AND a ballroom in it',
    allOk, `worst case ${worst}/${PLAN_TRIES} candidates`);
  /*
   * 🚨 THE CONTROL, AND IT IS NOT THE OBVIOUS ONE. The obvious assertion — "some seed took more
   * than one candidate" — is FALSE and would be a broken gate: measured, every world seed 0..23
   * passes first time, because at `rooms: 6` `selectRooms` takes the mandatory list whole so the
   * gallery cannot be absent. That does not make the check pointless, it makes the loop the wrong
   * place to prove it works. So the PREDICATE is exercised directly, against the house the game's
   * own `?planrooms=3` default would build — which really can come back with no gallery in it,
   * and which is the failure `PLAN_OPTS.rooms` exists to prevent.
   */
  let rejected = 0;
  for (let s = 0; s < 24; s++) {
    const thin = buildPlan(String(s), { ...PLAN_OPTS, rooms: 3 });
    if (!planPasses(thin)) rejected++;
  }
  t('W6d control · the check really does reject a house without the mission rooms in it',
    rejected > 0, `${rejected}/24 three-room plans refused — this is why PLAN_OPTS.rooms is 6`);
  t('W6d2 · and the six-room plans it accepts are accepted on their merits, not by fallback',
    pickPlanSeed(0).ok && sameSeed === 24, `${sameSeed}/24 clean on the first candidate`);
  t('W6e · the pick is deterministic — the TV and the phone derive the same house',
    pickPlanSeed(11).seed === pickPlanSeed(11).seed && pickPlanSeed(11).seed === pickPlanSeed('11').seed);

  const regions = planRegions(pickPlanSeed(5).seed);
  t('W6f · the plan flattens to drawable rects with no zero-area decomposition slivers',
    regions.rooms.length >= 6 && [...regions.rooms, ...regions.corridors]
      .every((r) => r.x1 > r.x0 && r.z1 > r.z0), `${regions.rooms.length} rooms, ${regions.corridors.length} halls`);
  t('W6g · and it has doors to draw', regions.doors.length > 0, `${regions.doors.length} doors`);
}

// ---- W7 · THE INTEL SPLIT, AND THE ORACLE CONTROL ---------------------------------------------
//
// John: "Good players get sporadic/vague information about hunter location. Evil can see exactly
// where the runner and the hunter are at the same time." The load-bearing word is `exactly` on one
// side and `vague` on the other, and the difference has to be a property of the DATA — a good
// player's frame must not CONTAIN a coordinate that a client then rounds off.
{
  const world = {
    runner: { room: 'r0.gallery', x: 0, z: 0 },
    hunter: { room: 'r1.ballroom', x: 30, z: 0 },
  };
  const lit = { unlocked: 1, needed: 3 };

  const evil = intelFor({ alignment: 'evil', world, cameras: { unlocked: 0 }, roll: 0 });
  t('W7 · evil sees BOTH bodies, exactly, at the same time',
    !!evil?.hunter?.at && !!evil?.runner?.at && evil.grade === 'exact', JSON.stringify(evil));
  t('W7a · and is never gated on a camera — the ladder is the GOOD team\'s economy',
    intelFor({ alignment: 'evil', world, cameras: null, roll: 0 }) !== null);

  const good = intelFor({ alignment: 'good', world, cameras: lit, roll: 1 });
  t('W7b · a good read names a room and NOTHING that could be a coordinate',
    !!good?.hunter?.room && good.hunter.at === undefined && good.runner === undefined,
    JSON.stringify(good));
  t('W7c · and it is a relative grade, not a distance',
    GRADES.includes(good.grade) && good.grade === 'far from', good.grade);
  t('W7d · the grade bands read the way a person would say them',
    gradeFor(2) === GRADES[0] && gradeFor(14) === GRADES[1] && gradeFor(40) === GRADES[2]);

  t('W7e · a good read is dark until a camera is lit',
    intelFor({ alignment: 'good', world, cameras: { unlocked: 0 }, roll: 1 }) === null);
  t('W7f · a good read is SPORADIC — one in three is dropped outright',
    intelFor({ alignment: 'good', world, cameras: lit, roll: 0 }) === null
    && Math.abs(DROP_RATE - 1 / 3) < 1e-9);
  t('W7g · a good read is STALE, and says how stale',
    intelFor({ alignment: 'good', world, cameras: lit, roll: 1,
      stale: { room: 'r2.chapel', x: 4, z: 4, age: 9 } }).age === 9);
  t('W7h · and staleness is capped rather than growing without bound',
    intelFor({ alignment: 'good', world, cameras: lit, roll: 1,
      stale: { room: 'r2.chapel', x: 4, z: 4, age: 400 } }).age === STALE_MAX);

  /*
   * 🚨 THE ORACLE CONTROL. `guide-coverage` C4 runs an ungated flyover to prove its own error
   * metric can see a leak; this is the same arm. If a good player's read ever became exact, this
   * assertion is the one that says so — and it is written as a POSITIVE difference between the two
   * alignments rather than as "good has no `at`", so deleting the `at` field would not silently
   * satisfy it.
   */
  const goodPaths = Object.keys(good.hunter ?? {});
  const evilPaths = Object.keys(evil.hunter ?? {});
  t('W7i control · the two alignments are told DIFFERENT things about the same hunter',
    evilPaths.length > goodPaths.length && evilPaths.includes('at') && !goodPaths.includes('at'),
    `good {${goodPaths}} vs evil {${evilPaths}}`);

  t('W7j · the copy never implies more precision than the data has',
    !/\d+\.\d/.test(intelLine(good)) && /Hunter/.test(intelLine(evil)),
    intelLine(good));

  /*
   * 🗣️ THE FIRST BROWSER PASS PHOTOGRAPHED THIS LINE READING *"Something somewhere near them,
   * c0.3."* — a raw corridor rect id, on the one screen whose entire job is a person saying a room
   * name to the room. Room NAMING is the guide's job (`party-loop.md` line 20); a name nobody can
   * pronounce hands them nothing. Asserted on the rendered copy rather than on `spaceLabel` alone,
   * because the defect was that the line never called it.
   */
  t('W7m · a room reaches the copy as something a person can say out loud',
    spaceLabel('r1.gallery') === 'the Gallery' && spaceLabel('r0.ballroom') === 'the Ballroom');
  t('W7n · and a corridor stays vague — there are nine of them and none has a name',
    spaceLabel('c0.3') === 'a passage' && spaceLabel('c12.0') === 'a passage'
    && spaceLabel(null) === 'somewhere');
  const spoken = [
    intelLine(intelFor({ alignment: 'good', world, cameras: lit, roll: 1 })),
    intelLine(intelFor({ alignment: 'evil', world, cameras: lit, roll: 1 })),
    intelLine(intelFor({
      alignment: 'good', cameras: lit, roll: 1,
      world: { runner: { room: 'c0.3', x: 0, z: 0 }, hunter: { room: 'c0.3', x: 1, z: 1 } },
    })),
  ];
  const raw = spoken.filter((l) => /\b[rc]\d+\./.test(l));
  t('W7o · no intel line anywhere prints a raw space id',
    raw.length === 0, raw.join(' | ') || spoken[1]);

  /*
   * Every field intel emits has to have a row in the entitlement matrix, or `project()` drops it
   * and reports it unrowed — which `party-isolation` I1 fails on. Checked against the table rather
   * than assumed, because the failure is silent from the phone's side: the field just never shows.
   */
  const rows = new Set(MATRIX.map(([g]) => g));
  const needed = ['you.intel.hunter.room', 'you.intel.hunter.at', 'you.intel.runner.room',
    'you.intel.runner.at', 'you.intel.grade', 'you.intel.age'];
  const missing = needed.filter((p) => !rows.has(p));
  t('W7k · every intel field has a `self` row in the entitlement matrix',
    missing.length === 0, missing.join(',') || `${needed.length} rows`);
  const notSelf = needed.filter((p) => MATRIX.find(([g]) => g === p)?.[1] !== 'self');
  t('W7l · and every one of them is `self` — never `phones`, which would hand it to the room',
    notSelf.length === 0, notSelf.join(','));
}

// ---- W8 · the guide's map is the guide's, and it is on the night's palette --------------------
{
  const seed = pickPlanSeed(3).seed;
  const svg = guideMapSvg({ seed, goal: MISSION_ROOM, runner: { x: 2, z: 2 } });
  t('W8 · the map draws the house', /^<svg /.test(svg) && /gm-room/.test(svg) && /gm-door/.test(svg),
    `${svg.length} chars`);
  t('W8b · it rings the objective so the guide can call it',
    svg.includes('gm-goal'));
  t('W8c · a blind guide gets a floor plan, not an invented mark',
    !guideMapSvg({ seed }).includes('gm-hunter'));
  t('W8d · and a sighted one gets the mark that arrived',
    guideMapSvg({ seed, flyover: { hunter: { x: 1, z: 1 } } }).includes('gm-hunter'));
  t('W8e · it names rooms — which is the guide\'s job and never the TV\'s',
    svg.includes(roomLabel('gallery')));

  const hex = GUIDE_MAP_CSS.match(/#[0-9a-f]{3,8}\b/gi) || [];
  t('W8f · the map CSS holds no hex of its own', hex.length === 0, hex.join(',') || 'no literals');
  const used = [...new Set([...GUIDE_MAP_CSS.matchAll(/var\((--[a-z-]+)/g)].map((m) => m[1]))];
  const orphans = used.filter((n) => !isNightToken(n));
  t('W8g · every variable it reaches for is a palette name',
    used.length >= 5 && orphans.length === 0, orphans.join(',') || `${used.length} tokens`);
}

// ---- W9 · the widened colour palette did not break anybody's saved face ----------------------
//
// `cleanLook()` validates by VALUE against these arrays, so a returning player's stored look is
// only still valid if the original six are still in the list. Appending is safe; reordering or
// replacing silently resets every phone in the room to the default.
{
  const ORIGINAL_SHELLS = ['#2a2420', '#c4b4a0', '#6b3a2a', '#1e3330', '#3d2a38', '#2f3320'];
  const ORIGINAL_ACCENTS = ['#f5a14a', '#e8d5a3', '#ff7a59', '#f0ebe3', '#c47a4a', '#9ad7c2'];
  t('W9 · there are more colours than there were', SHELLS.length > 6 && ACCENTS.length > 6,
    `${SHELLS.length} shells, ${ACCENTS.length} accents`);
  t('W9b · and every colour that shipped before is still valid, at its original index',
    ORIGINAL_SHELLS.every((h, i) => SHELLS[i] === h)
    && ORIGINAL_ACCENTS.every((h, i) => ACCENTS[i] === h));
  t('W9c · so a saved look still cleans', !!cleanLook({ shell: ORIGINAL_SHELLS[3], accent: ORIGINAL_ACCENTS[5] }));
  const dupes = [...SHELLS, ...ACCENTS].filter((h, i, a) => a.indexOf(h) !== i && SHELLS.includes(h) === SHELLS.includes(h));
  t('W9d · no shell is duplicated and no accent is duplicated',
    new Set(SHELLS).size === SHELLS.length && new Set(ACCENTS).size === ACCENTS.length, dupes.join(','));
  t('W9e · every entry is a full 6-digit hex — the swatch CSS interpolates it raw',
    [...SHELLS, ...ACCENTS].every((h) => /^#[0-9a-f]{6}$/.test(h)));
}

// ---- W10 · the new fanout kind exists on BOTH halves ------------------------------------------
//
// `fanoutViolations()` pushes `t:<type>` for any kind it does not know, and `fanout()` THROWS on a
// violation — so a `warm` message added to the dispatch but not to `FANOUT_KEYS` (or the reverse)
// takes the room's sockets down rather than degrading. Both halves, asserted together.
{
  t('W10 · `warm` has a key list', Array.isArray(FANOUT_KEYS.warm), (FANOUT_KEYS.warm || []).join(','));
  t('W10b · and a real warm message passes the public side-channel schema',
    fanoutViolations({ t: 'warm', pct: 55, stage: 'house' }).length === 0,
    fanoutViolations({ t: 'warm', pct: 55, stage: 'house' }).join(','));
  t('W10c control · an extra key on it is still a violation',
    fanoutViolations({ t: 'warm', pct: 55, stage: 'house', role: 'PLANT' }).length > 0);
  t('W10d · the warm message carries no secret — it is a percentage and a word',
    (FANOUT_KEYS.warm || []).every((k) => ['t', 'pct', 'stage'].includes(k)));
}

// ---- W11 · THE DEAL IS FOR WHO TURNED UP -----------------------------------------------------
//
// 🚨 John, playing this branch with two phones: *"the role cards are only giving me continuity."*
// Three faults compounded and this asserts all three are gone:
//
//   1. `createRoom` is built at CAPACITY (8) so the transport can bind a token per seat, and
//      `dealRoles()` took that literally — a two-phone table was handed cards 0 and 1 of an
//      EIGHT-player bag, and `GUARANTEED[8]` leads with `continuity`.
//   2. `startServer` defaulted `castSeed = 1`, so `dealCast` was asked the identical question
//      every night this server has ever run and produced the identical shuffle.
//   3. `COMPOSITION` had no row below 4 at all, so a small table could not be dealt honestly even
//      once someone thought to try.
{
  const seatsOf = (n, seed) => dealCast({
    count: n, castSeed: seed, playerIds: Array.from({ length: n }, (_, i) => `p${i + 1}`),
  }).seats;

  t('W11 · a two- and three-phone table has a composition at all',
    !!COMPOSITION[2] && !!COMPOSITION[3], `2:${JSON.stringify(COMPOSITION[2])}`);
  for (const n of [2, 3]) {
    const c = COMPOSITION[n];
    const total = c.informed + c.contestant + c.outsider + c.minion + c.producer;
    t(`W11a · the ${n}-player bag fills exactly ${n} seats`, total === n, `${total}`);
    t(`W11b · and puts exactly one Production seat at the table`, c.producer + c.minion === 1);
  }

  /*
   * THE ACTUAL COMPLAINT, ASSERTED. Over 200 cast seeds a two-player table must not keep dealing
   * the same card — and the control is the SPREAD, not merely "not always continuity", because a
   * bag that alternated between two roles would satisfy the weaker test and still feel broken.
   */
  for (const n of [2, 3, 4]) {
    const seen = new Map();
    for (let s = 1; s <= 200; s++) {
      for (const seat of seatsOf(n, s)) seen.set(seat.role, (seen.get(seat.role) ?? 0) + 1);
    }
    const roles = [...seen.keys()];
    const top = Math.max(...seen.values()) / (200 * n);
    t(`W11c · at ${n} players the deal spreads across the bag rather than stamping one card`,
      roles.length >= 3 && top < 0.62,
      `${roles.length} distinct roles, commonest ${(top * 100).toFixed(0)}% — ${roles.join(',')}`);
    t(`W11d control · and every ${n}-player deal still has exactly one evil`,
      Array.from({ length: 40 }, (_, i) => seatsOf(n, i + 1)
        .filter((x) => x.alignment === 'evil').length).every((k) => k === 1));
  }

  t('W11e · the seated ids are what the deal is keyed to, so seat 0 is not always the same card',
    new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => seatsOf(2, s)[0].role)).size > 1,
    [1, 2, 3, 4].map((s) => seatsOf(2, s)[0].role).join(','));

  /*
   * ⚠️ The four-player row is UNTOUCHED and this pins it, because `role-deal` R1 measures the
   * bible's counts and a slice that quietly moved one would be caught here first with a clearer
   * message than a composition mismatch 10k seeds deep.
   */
  t('W11f · the bible\'s own rows are unchanged',
    COMPOSITION[4].informed === 2 && COMPOSITION[8].informed === 4 && COMPOSITION[8].outsider === 2);
}

// ---- W12 · ONE HOUSE PER NIGHT, AND THE RACE THAT BUILT TWO ----------------------------------
//
// 🚨 THE TV WAS WARMING A DIFFERENT MANSION FROM THE ONE THE PHONES' MAPS DREW, AND NOTHING SAID
// SO. `PartyNightClient.connect()` resolves on `welcome`; `views/party-host.js` paints on every
// message; so the first paint ran with `client.frame` still null and mounted the night-long slot
// with `frame?.worldSeed ?? 0`. That `src` is assigned exactly once per night — deliberately,
// because reassigning it is a reload and a 9 MB refetch — so seed 0 was the whole night, while the
// server's default `worldSeed` is 1 and every phone derived its guide map from that.
//
// `src/party/mansion.js`'s header is explicit that the two ends must not be able to disagree. The
// fix is `worldSeed` on the welcome plus a mount that refuses a guess; this asserts BOTH halves
// over a real socket, because the bug was one of ordering and no pure test can see ordering.
{
  const { startServer } = await import('../net/party/local.mjs');
  const { PartyNightClient } = await import('../src/party/night-client.js');
  const PORT = 5188;
  const WORLD = 7;
  const srv = startServer({ port: PORT, count: 8, castSeed: 5, worldSeed: WORLD, code: 'warm' });
  const url = (q = '') => `ws://localhost:${PORT}/?room=warm${q}`;

  /*
   * ⚠️ **SAMPLED INSIDE `onMessage`, ON THE WELCOME, WHICH IS EXACTLY WHERE THE HOST PAINTS.**
   *
   * Reading after `await connect()` would prove nothing: the server writes welcome and state in
   * one burst and node hands both to the socket before the connect promise's microtask runs, so
   * `frame` is already populated by then. The browser is not so kind — `views/party-host.js`
   * calls `paint()` synchronously from this very callback, on this very message, and that paint
   * mounts the mansion for the whole night. This hook IS the host's first paint.
   */
  const atFirstPaint = [];
  const tv = new PartyNightClient({
    url: url('&host=1'),
    onMessage(m) { atFirstPaint.push({ t: m.t, frame: tv.frame, seed: tv.worldSeed }); },
  });
  await tv.connect();

  const first = atFirstPaint[0];
  t('W12 · the welcome carries the world seed, so the FIRST paint can build the right house',
    tv.welcome?.worldSeed === WORLD, `welcome.worldSeed=${tv.welcome?.worldSeed}`);
  t('W12a · and at the very first message — before any state frame — the seed is already right',
    first?.t === 'welcome' && first?.frame === null && first?.seed === WORLD,
    `first message ${first?.t} · frame ${first?.frame} · seed ${first?.seed}`);

  const earlyUrl = warmUrl({ room: 'warm', worldSeed: first.seed, origin: ORIGIN });
  const earlySeed = new URL(earlyUrl).searchParams.get('seed');
  t('W12b · so the slot the TV mounts is seeded with the room\'s real world, not a default',
    earlySeed === String(WORLD), earlyUrl);

  const phone = new PartyNightClient({ url: url() });
  await phone.connect();
  await new Promise((r) => setTimeout(r, 200));

  t('W12c · the phone agrees, from the frame as well as the welcome',
    phone.worldSeed === WORLD && phone.frame?.worldSeed === WORLD);

  /*
   * THE ASSERTION THE PLAYTEST NEEDED: the TV's slot and the guide's map must resolve to the SAME
   * generated plan. Compared as the plan SEED rather than as the world seed, because that is the
   * value the two renderers actually build from — `pickPlanSeed` may walk past a candidate, and an
   * off-by-one there would be just as night-breaking as an off-by-one here.
   */
  const tvPlan = pickPlanSeed(Number(earlySeed)).seed;
  const phonePlan = pickPlanSeed(phone.worldSeed).seed;
  t('W12d · THE TV\'S HOUSE AND THE GUIDE\'S MAP ARE THE SAME HOUSE',
    tvPlan === phonePlan, `tv plan ${tvPlan} · phone plan ${phonePlan}`);

  /*
   * The control. The bug produced `seed=0` against a world of 7, and it has to be the case that
   * such a slip really does build a different house — otherwise W12d passes for free and this
   * whole section is decoration.
   */
  t('W12e control · a defaulted seed really would have been a different house',
    pickPlanSeed(0).seed !== phonePlan,
    `default plan ${pickPlanSeed(0).seed} vs real ${phonePlan}`);

  t('W12f · and a socket that knows nothing yet says so, rather than guessing 0',
    new PartyNightClient({ url: url() }).worldSeed === null);

  srv.close();
  for (const c of [tv, phone]) c.ws?.close?.();
}

// ---- W13 · the guide's sight is gated on the room the hunter is IN ---------------------------
//
// `coverage.js`'s roster holds six BARE room names. The mark the guide sees is built from
// `state.world.hunter`, whose `room` is a generated space id — so the visibility test and the mark
// were talking about two different rooms, and the test was talking about a stub that only
// `playEpisode` ever wrote.
{
  t('W13 · a generated room id maps onto the camera roster',
    coverageRoomOf('r2.study') === 'study' && coverageRoomOf('r0.ballroom') === 'ballroom'
    && coverageRoomOf('r1.gallery') === 'gallery');
  t('W13a · a passage is honestly uncovered — there is no camera in a corridor',
    coverageRoomOf('c0.3') === null && coverageRoomOf('c12.0') === null
    && coverageRoomOf(null) === null);
  t('W13b · and every mapped name is one the roster can actually answer about',
    ['r0.ballroom', 'r1.gallery', 'r2.study', 'r5.chapel']
      .every((id) => ROOMS.includes(coverageRoomOf(id))), ROOMS.join(','));
  /*
   * The control, and it is the shape of the bug: handing the raw id in makes the guide blind in
   * every room, forever, and the map draws that as a legitimate "no camera has the hunter".
   */
  const cams = { worldSeed: 3, unlocked: 3 };
  const anyRaw = ['r0.ballroom', 'r1.gallery', 'r2.study', 'r5.chapel']
    .some((id) => hunterVisibleToGuide({ ...cams, hunterRoom: id }));
  const anyMapped = ['r0.ballroom', 'r1.gallery', 'r2.study', 'r5.chapel']
    .some((id) => hunterVisibleToGuide({ ...cams, hunterRoom: coverageRoomOf(id) }));
  t('W13c control · the raw id is invisible at FULL coverage; the mapped one is not',
    !anyRaw && anyMapped, `raw ${anyRaw} · mapped ${anyMapped}`);
}

// ---- W14 · PR A mansion layout: corner ballroom, deferred seats, catalog ids only ------------
//
// John 2026-08-23. Cyan map-edge is a follow-up (slice §4) and is not asserted here.
{
  t('W14 · the night asks the packer for a corner ballroom',
    PLAN_OPTS.homeCorner === true, JSON.stringify(PLAN_OPTS));

  let corners = 0, firstTry = 0;
  for (let ws = 0; ws < 24; ws++) {
    const picked = pickPlanSeed(ws);
    const plan = planFor(picked.seed);
    if (homeIsCorner(plan)) corners++;
    if (picked.tries === 1 && picked.ok) firstTry++;
  }
  t('W14b · every world seed 0..23 puts the ballroom in an env corner',
    corners === 24, `${corners}/24`);
  t('W14c · and homeCorner does that on the first candidate, not by retry luck',
    firstTry === 24, `${firstTry}/24 first-try`);

  let rejectedCorner = 0;
  for (let s = 0; s < 48; s++) {
    const loose = buildPlan(String(s), { ...PLAN_OPTS, homeCorner: false });
    const hasRooms = loose.regions.some((R) => R.kind === 'room' && R.type === MISSION_ROOM)
      && loose.regions.some((R) => R.kind === 'room' && R.type === HOME_ROOM);
    if (hasRooms && !homeIsCorner(loose) && !planPasses(loose)) rejectedCorner++;
  }
  t('W14d control · planPasses refuses a playable house whose ballroom is not in a corner',
    rejectedCorner > 0, `${rejectedCorner}/48 unconstrained plans caught`);

  t('W14e · locked seats follow joined players, not an eight-chair bake',
    lockedSeatCount({ players: 4 }) === 4
    && lockedSeatCount({ players: 1 }) === 1
    && lockedSeatCount({ players: 0 }) === 1);
  t('W14f · `?chairs=` is the seating lock a developer typed',
    lockedSeatCount({ players: 1, chairsQuery: '8' }) === 8
    && lockedSeatCount({ players: 4, chairsQuery: '2' }) === 2);

  const catalogIds = new Set(FURN_SMASH_ASSETS.map((a) => a.id));
  const unknown = LAYOUT_CATALOG_IDS.filter((id) => !catalogIds.has(id));
  t('W14g · layout ids are all real furn-catalog rows',
    unknown.length === 0 && LAYOUT_CATALOG_IDS.length === 6, unknown.join(',') || LAYOUT_CATALOG_IDS.join(','));

  const fake = catalogPlacements([
    { id: 'r0.ballroom', roomType: 'ballroom', x0: 0, x1: 27.2, z0: 0, z1: 15.3 },
    { id: 'r1.study', roomType: 'study', x0: 28, x1: 39.6, z0: 0, z1: 15.4 },
    { id: 'c0.0', x0: 13, x1: 16, z0: 16, z1: 22 },
  ]);
  const used = [...new Set(fake.map((p) => p.catalogId))];
  t('W14h · placements only emit catalog ids this slice named',
    used.every((id) => LAYOUT_CATALOG_IDS.includes(id))
    && used.includes('armor') && used.includes('grand-piano') && used.includes('chandelier')
    && used.includes('wingback'), used.join(','));

  /*
   * The live hook is `dressLooseFurniture`. Callers must not import `dressCatalogFurniture`
   * themselves — that was the second dresser this slice deleted. Read source, do not import
   * `furn-dress.js` (it pulls THREE).
   */
  const here = dirname(fileURLToPath(import.meta.url));
  const src = (rel) => readFileSync(join(here, '..', rel), 'utf8');
  const dress = src('src/game/furn-dress.js');
  const follow = src('src/game/follow-bed.js');
  const game = src('src/views/game.js');
  t('W14i · dressLooseFurniture is the catalog placer hook',
    /export async function dressLooseFurniture/.test(dress)
    && /dressCatalogFurniture/.test(dress));
  t('W14j · follow-bed and game.js go through that hook, not furn-layout',
    follow.includes("import('./furn-dress.js')")
    && !follow.includes('furn-layout.js')
    && game.includes("import('../game/furn-dress.js')")
    && !game.includes('furn-layout.js'));
}

console.log(`\nparty-warm: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
