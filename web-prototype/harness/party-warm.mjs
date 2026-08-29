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

import { readFile } from 'node:fs/promises';
import {
  CUE_CAST_KEYS, CUE_KEYS, CUE_KINDS, CUE_NOM_KEYS, CUE_EXECUTE_KEYS, FOLLOW_FORBIDDEN, FOLLOW_INSTRUMENTS,
  FOLLOW_KEYS, FOLLOW_VIEW,
  IDENTITY_SECRETS, INTRO_FOV, INTRO_FRAME_PCT, MISSION_PHASES, MOVE_KEYS, RING_OUT, SPATIAL_WORDS,
  STICK_DEADZONE, STICK_RELEASE, STICK_TURN, TALK_FOV, TV_FRAME_PCT,
  WARM_KEYS, WARM_STAGES, WORLD_KEYS, chaseOrbitOffset, cueViolations, followParams, followUrl,
  followViolations,
  liveRunShot, runPerspective, LOOK_PITCH_MAX, LOOK_PITCH_MIN, lookYaw, moveViolations, stepLookOrbit,
  stickCamMove, stickHeading, stickMag, stickRef, warmLabel, warmPct,
  warmUrl, warmViolations, worldViolations,
} from '../src/party/follow.js';
import {
  BLEED_CONE, BLEED_PAST, bleedCoolPos, bleedKeyAngle, facingPortal, isPastSpace,
} from '../src/lighting/door-bleed.js';
import {
  FEED_CYCLE_SECONDS, FEED_PHASES, JAM_SECONDS, PEEK_SECONDS, mapFeed,
} from '../src/party/mapfeed.js';
import {
  HOME_ROOM, MISSION_ROOM, PLAN_OPTS, PLAN_TRIES,
  coverageRoomOf, homeIsCorner, pickPlanSeed, planFor, planOptsFor, planPasses, planRegions,
  planRoomLabels, planSeedString, roomLabel, spaceLabel, tablesPass,
} from '../src/party/mansion.js';
import { lockedSeatCount, seatCircleRadius, rugSpanForSeats, SIT_IDLE_CLIPS, SIT_CLIP_ALLOW } from '../src/game/chair-seats.js';
import {
  LAYOUT_CATALOG_IDS, CATALOG_ROOM_ASSIGN, catalogPlacements, catalogUrl,
  CATALOG_URL_PREFIX, spaceKind, placementsClearOfOpenings, walkHalf,
} from '../src/game/furn-layout.js';
import { FURN_SMASH_ASSETS, FURN_FIT_BOOST } from '../src/game/furn-catalog.js';
import {
  PORTAL_SIDE_PAD, blockedBy, blockedByOpenings, clearOfPortals,
  footprintRect, openingFootprint, overlapsOpening, portalKeepout, portalKeepouts,
  portalFacesPlayable, uHitsAnyOpening, MIN_LANDING_SPAN,
} from '../src/game/portal-clearance.js';
import { generatedTables } from '../src/world/genplan.js';

function skippedForCause(ws) {
  const base = Number(planSeedString(ws)) | 0;
  const picked = pickPlanSeed(ws);
  if (!picked.ok) return { ok: false, why: `ws${ws}: no candidate passed at all` };
  for (let i = 0; i < (picked.tries - 1); i++) {
    const tables = generatedTables(String(base + i), PLAN_OPTS);
    if (planPasses(tables.plan) && tablesPass(tables)) {
      return { ok: false, why: `ws${ws}: skipped candidate ${base + i}, which PASSES — that is luck, not cause` };
    }
  }
  return { ok: true, why: `ws${ws}: ${picked.tries - 1} skipped, all refused for cause` };
}

import {
  AFTER_RUN_BEATS, DEBRIEF_HOLD_MS, RECAP_BACKSTOP_MS, RECAP_HOLD_MS, SHOW_BEATS,
  RUNDOWN_BEATS, holdMsFor, missionEndsRun, nextShowBeat, railDrainPct, recapAfterMs,
  remainingMs, rundownRibbon, RUN_END, isTalkBeat,
  REUNION_PLAN, reunionBeatAt, rollCallRevealed,
} from '../src/party/show.js';
import { missionFor, MISSION_TABLE } from '../src/party/mission.js';
import { ROOMS, hunterVisibleToGuide } from '../src/party/coverage.js';
import { buildPlan } from './genspike.mjs';
import { DROP_RATE, GRADES, STALE_MAX, gradeFor, intelFor, intelLine } from '../src/party/intel.js';
import { GUIDE_MAP_CSS, guideMapSvg } from '../src/party/guidemap.js';
import {
  ACCENTS, SHELLS, SHOW_CAM, SHOW_CHROME_CSS, SHOW_LINE, SHOW_TITLE,
  cleanLook, codeBugHtml, nameplateHtml, recBugHtml, robotFaceSvg, rundownRailHtml,
  shellTones, showCam, titlePlateHtml, verdictPlateHtml,
} from '../src/party/look.js';
import { COMPOSITION, dealCast } from '../src/party/cast.js';
import { isNightToken } from '../src/party/palette.js';
import { leftoverRuns, barrierFillForEdge } from '../src/game/dig-policy.js';
import { MATRIX } from '../net/party/entitle.js';
import { FANOUT_FORBIDDEN, FANOUT_KEYS, fanoutViolations } from '../net/party/local.mjs';
import { OUTCOME, outcomeLine } from '../src/party/win.js';
import { PHASE, SECONDS } from '../src/party/phases.js';
import { existsSync, openSync, readSync, closeSync, readFileSync, statSync } from 'node:fs';
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
    { kind: 'noms', standing: [{ nominator: 'p1', target: 'p2' }] },
    // 🍮 The merged pair. Name only — the words are pushed to two sockets and are not a cue.
    { kind: 'pair', pairs: [{ a: 'p1', b: 'p2', name: 'JELLIE' }] },
    // 🔨 The nominator swings. Public ids; SHOWRUNNER is the taken-nominator sentinel.
    { kind: 'execute', executioner: 'p1', target: 'p2' },
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
  t('W3h · talk is an optional intros key — debrief may sit without a walk-in',
    cueViolations({ kind: 'intros', cast: CAST, talk: true }).length === 0
    && CUE_KEYS.intros.includes('talk')
    && cueViolations({ kind: 'intros', cast: CAST, talk: true, hunter: 1 }).length > 0);
  t('W3i · standing noms are a closed public cue, same pair the wire already fans',
    cueViolations({ kind: 'noms', standing: [{ nominator: 'p1', target: 'p2' }] }).length === 0
    && CUE_KEYS.noms.includes('standing')
    && CUE_NOM_KEYS.every((k) => FANOUT_KEYS.nomRow.includes(k))
    && cueViolations({ kind: 'noms', standing: [{ nominator: 'p1', target: 'p2', role: 'PLANT' }] }).length > 0);
  t('W3j · execute is a closed public cue — nominator swings, no role, no ninth body',
    cueViolations({ kind: 'execute', executioner: 'p1', target: 'p2' }).length === 0
    && cueViolations({ kind: 'execute', executioner: 'SHOWRUNNER', target: 'p2' }).length === 0
    && cueViolations({ kind: 'execute', executioner: '', target: '' }).length === 0
    && CUE_EXECUTE_KEYS.includes('executioner') && CUE_EXECUTE_KEYS.includes('target')
    && FANOUT_KEYS.lynchResult.includes('executioner')
    && FANOUT_KEYS.lynchResult.includes('executed')
    && cueViolations({ kind: 'execute', executioner: 'p1', target: 'p2', role: 'PLANT' }).length > 0);
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
  t('W4c2 · lookX/lookY ride the same move door, clamped like the walk stick',
    MOVE_KEYS.includes('lookX') && MOVE_KEYS.includes('lookY')
    && CUE_KEYS.move.includes('lookX') && CUE_KEYS.move.includes('lookY')
    && moveViolations({ t: 'move', x: 0, y: 0, lookX: 0.4, lookY: -0.2 }).length === 0
    && moveViolations({ t: 'move', x: 0, y: 0, lookX: 9 }).length === 1);

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

  /*
   * ⚠️ **W6d2 AND W14c USED TO PIN THE COUNT 24, AND THAT WAS THE WRONG SURFACE.**
   *
   * Both asked `tries === 1` on all 24 seeds and read a bare `24/24`. The sentence they carry is
   * "accepted on their merits, not by fallback" / "not by retry luck" — and a count cannot say
   * that. A retry is only luck if the candidate it skipped was FINE; a retry that steps over a
   * genuinely broken house is the picker working. When `tablesPass` landed and started refusing
   * ws17 — whose ballroom's only portal opens into a 27.2x1.7 m corridor with no onward portal,
   * so the runner spawns in the ballroom and cannot leave — both went red for the picker doing
   * exactly its job, and the tempting fix was to write 23.
   *
   * That is the `episode-order` lesson again (`CLAUDE.md`): assert that the machines AGREE, never
   * a fixed answer, or the gate has to be edited every time the world legitimately changes and
   * nobody can tell an edit-for-cause from an edit-to-green. So these now assert the INVARIANT —
   * every seed lands an `ok` pick and never the fallback, and every candidate skipped on the way
   * was refused by `planPasses`/`tablesPass` rather than passed over. A picker that started
   * skipping good houses goes red; a world that grows one more broken seed does not.
   */
  const causeAudit = [];
  for (let ws = 0; ws < 24; ws++) causeAudit.push(skippedForCause(ws));
  const causeBad = causeAudit.filter((r) => !r.ok);
  const retried = causeAudit.filter((r) => !/: 0 skipped/.test(r.why));

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
    allOk && causeBad.length === 0,
    `24/24 landed an ok pick, never the fallback; ${retried.length} needed a retry and every `
    + `candidate skipped was refused for cause${causeBad.length ? ` — ${causeBad[0].why}` : ''}`);
  t('W6d3 control · a candidate that PASSES is never skipped — this is what "not by luck" means',
    skippedForCause(17).ok && /refused for cause/.test(skippedForCause(17).why),
    `ws17 is the live case: ${skippedForCause(17).why}`);
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

  /*
   * 🗣️ **TWO STUDIES, TWO NAMES — ON EVERY SEED, NOT ON A LUCKY ONE.** `PLAN_OPTS` takes the whole
   * mandatory list and that list holds `study` twice, so "go to the study" was an instruction with
   * two answers EVERY night. Walked across many seeds rather than one, because the disambiguator
   * picks its axis from the geometry and a single seed would only ever exercise one branch.
   */
  const dupSeeds = [];
  for (let i = 1; i <= 24; i += 1) {
    const seed = pickPlanSeed(i).seed;
    const labels = planRoomLabels(seed);
    const said = [...labels.values()];
    const types = [...labels.keys()].map((id) => String(id).split('.')[1]);
    const dup = types.length !== new Set(types).size;
    if (dup) dupSeeds.push(i);
    if (said.length !== new Set(said).size) { dupSeeds.push(`clash@${i}`); break; }
  }
  t('W7p · every room on the night has a name no other room shares',
    dupSeeds.length > 0 && !dupSeeds.some((s) => String(s).startsWith('clash')),
    `${dupSeeds.length} seeds carry a repeated type; none produced a repeated NAME`);

  const twin = planRoomLabels(pickPlanSeed(1).seed);
  const studies = [...twin.entries()].filter(([id]) => id.endsWith('.study')).map(([, v]) => v);
  t('W7q · and the second of a pair is called by direction, not by number',
    studies.length === 2 && studies.every((s) => /^(North|South|East|West) Study$/.test(s)),
    studies.join(' / '));
  t('W7r · the guide\'s map and the phone\'s feed speak the same word',
    spaceLabel('r2.study', twin) === `the ${twin.get('r2.study')}`
    && spaceLabel('r2.study') === 'the Study',
    spaceLabel('r2.study', twin));
  t('W7s · and a passage is still a passage, labels or not',
    spaceLabel('c0.3', twin) === 'a passage' && spaceLabel(null, twin) === 'somewhere');
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
  /*
   * 🗣️ THE PLAYCRITIQUE SHOT. The map drew STUDY twice and the guide could not call either one.
   * Asserted on the RENDERED SVG rather than on the label map, because the defect was that the
   * drawing never asked for the unique name — a passing helper with a map that ignores it is the
   * same bug with a green test next to it.
   */
  const drawn = [...guideMapSvg({ seed: pickPlanSeed(1).seed })
    .matchAll(/<text class="gm-label"[^>]*>(.*?)<\/text>/g)]
    .map((m) => m[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
  t('W8h · no two rooms on the map carry the same printed name',
    drawn.length >= 4 && drawn.length === new Set(drawn).size, drawn.join(' / '));
  t('W8i · and the pair is told apart by direction, so the guide can say which',
    drawn.filter((d) => /Study/.test(d)).every((d) => /^(NORTH|SOUTH|EAST|WEST) Study$/i.test(d)),
    drawn.filter((d) => /Study/.test(d)).join(' / '));

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
  const cornerCause = Array.from({ length: 24 }, (_, ws) => skippedForCause(ws)).filter((r) => !r.ok);
  t('W14c · and homeCorner does that on the first candidate, not by retry luck',
    corners === 24 && cornerCause.length === 0,
    `${firstTry}/24 first-try; the rest retried past candidates refused for cause, not skipped`);

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
  const assignKeys = Object.keys(CATALOG_ROOM_ASSIGN);
  const assignMiss = LAYOUT_CATALOG_IDS.filter((id) => !CATALOG_ROOM_ASSIGN[id]);
  t('W14g · layout ids are all 24 real furn-catalog rows',
    unknown.length === 0 && LAYOUT_CATALOG_IDS.length === 24
    && assignKeys.length === 24 && assignMiss.length === 0,
    unknown.join(',') || assignMiss.join(',') || LAYOUT_CATALOG_IDS.join(','));

  const fake = catalogPlacements([
    { id: 'r0.ballroom', roomType: 'ballroom', x0: 0, x1: 27.2, z0: 0, z1: 15.3 },
    { id: 'r1.study', roomType: 'study', x0: 28, x1: 39.6, z0: 0, z1: 15.4 },
    { id: 'c0.0', x0: 13, x1: 16, z0: 16, z1: 22 },
  ]);
  const used = [...new Set(fake.map((p) => p.catalogId))];
  t('W14h · placements only emit catalog ids, and a three-room house still gets the lock',
    used.every((id) => LAYOUT_CATALOG_IDS.includes(id))
    && used.includes('armor') && used.includes('grand-piano') && used.includes('chandelier')
    && used.includes('wingback') && used.length >= 20, used.join(','));

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
  t('W14i2 · GeoBin kit is gated (`?kitdress=1`), not the default night',
    /export function kitDressEnabled/.test(dress)
    && /get\('kitdress'\) === '1'/.test(dress)
    && /kitOn && room\.materials/.test(dress));
  const layoutSrc = src('src/game/furn-layout.js');
  const fitSrc = src('src/game/furn-fit.js');
  t('W14i3 · mansion catalog dress uses the smash-lab fit (targetH/maxSpan, not AABB-only)',
    /fitCatalogProp/.test(layoutSrc)
    && /export function fitCatalogProp/.test(fitSrc)
    && /from '\.\/furn-fit\.js'/.test(src('src/game/furn-smash-lab.js')));

  /*
   * The 24 smash GLBs are in git as normal blobs under public/models/furn/. A previous
   * note that this folder was empty was wrong (the agent glob missed binaries). `bed.glb`
   * / `tato.glb` are local-only and are not required.
   */
  const furnDir = join(here, '..', 'public', 'models', 'furn');
  const onDisk = [];
  let pointer = 0, tiny = 0, notGltf = 0;
  for (const spec of FURN_SMASH_ASSETS) {
    const p = join(furnDir, spec.file);
    if (!existsSync(p)) { tiny++; continue; }
    const bytes = statSync(p).size;
    const fd = openSync(p, 'r');
    const head = Buffer.alloc(12);
    readSync(fd, head, 0, 12, 0);
    closeSync(fd);
    const magic = head.subarray(0, 4).toString('ascii');
    if (head.toString('utf8').startsWith('version https://git-lfs')) pointer++;
    if (bytes < 1_000_000) tiny++;
    if (magic !== 'glTF') notGltf++;
    onDisk.push({ id: spec.id, file: spec.file, bytes, magic, url: catalogUrl(spec.id) });
  }
  t('W14k · all 24 catalog GLBs are real glTF blobs on disk, not LFS pointers',
    onDisk.length === 24 && pointer === 0 && tiny === 0 && notGltf === 0,
    `${onDisk.length}/24 · ptr ${pointer} · tiny ${tiny} · magic-fail ${notGltf}`);

  const layoutDisk = LAYOUT_CATALOG_IDS.map((id) => onDisk.find((r) => r.id === id));
  t('W14l · layout URLs are /models/furn/<file> and resolve to those blobs',
    layoutDisk.every((r) => r && r.url === `${CATALOG_URL_PREFIX}${r.file}` && r.bytes > 1_000_000)
    && /catalogUrl\(slot\.catalogId\)/.test(src('src/game/furn-layout.js')),
    layoutDisk.map((r) => r && `${r.id}:${r.bytes}`).join(','));

  const authoredSpaces = [
    { id: 'gallery', order: 'gallery', x0: -13.6, x1: 13.6, z0: -31.0, z1: -24.3 },
    { id: 'study_w', order: 'study', x0: -13.6, x1: -2.0, z0: -24, z1: -8.6 },
    { id: 'study_e', order: 'study', x0: 2.0, x1: 13.6, z0: -24, z1: -8.6 },
    { id: 'service', x0: -1.7, x1: 1.7, z0: -24, z1: -8.6 },
    { id: 'ballroom', order: 'ballroom', x0: -13.6, x1: 13.6, z0: -8.3, z1: 7.0 },
    { id: 'chapel', x0: 4.2, x1: 11.0, z0: -37.8, z1: -31.3 },
  ];
  // Authored OPEN doorways (`spaces.js` PORTALS). D1 is the gallery entry John walked into a table.
  const authoredOpenings = [
    { id: 'D1', a: 'gallery', b: 'study_w', axis: 'x', x: -8.60, z: -24.15, w: 1.90 },
    { id: 'D4', a: 'study_w', b: 'ballroom', axis: 'x', x: -8.60, z: -8.45, w: 1.90 },
    { id: 'D5', a: 'service', b: 'ballroom', axis: 'x', x: 0.00, z: -8.45, w: 1.90 },
    { id: 'D6', a: 'study_e', b: 'ballroom', axis: 'x', x: 8.60, z: -8.45, w: 1.90 },
    { id: 'p.chapel', a: 'gallery', b: 'chapel', axis: 'x', x: 5.60, z: -31.15, w: 2.08 },
  ];
  const authored = catalogPlacements(authoredSpaces, authoredOpenings);
  const byAuth = (id) => authored.filter((p) => p.catalogId === id);
  const authoredIds = new Set(authored.map((p) => p.catalogId));
  t('W14m · authored HOUSE_PLAN shape (order, no roomType) still places the lock',
    spaceKind({ id: 'ballroom', order: 'ballroom' }) === 'ballroom'
    && spaceKind({ id: 'study_w', order: 'study' }) === 'study'
    && spaceKind({ id: 'c0.3' }) === null
    && byAuth('grand-piano').every((p) => p.spaceId === 'ballroom')
    /*
     * 🔄 **THIS LINE USED TO REQUIRE TWO CHANDELIERS IN THE BALLROOM. JOHN REVERSED IT**
     * (2026-08-28): *"there are two placed chandeliers that are lower seen in wide. Delete them
     * from the ballroom spawn. the other two are part of the asset."* The catalog GLB hangs at
     * `liftY 2.85` in a 9.60 m room, at eye level, unlit — while `lighting/ballroom-rig.js` hangs
     * the asset's own LIT fixtures at ~7.3 m in the same room. The prop is rehomed to the gallery
     * rather than deleted, because W14n below still requires all 24 smash ids to be placed.
     * The assertion is kept and inverted rather than dropped: the ballroom is the room it must
     * never be in, and that is now the thing under lock.
     */
    && byAuth('chandelier').length >= 1 && byAuth('chandelier').every((p) => p.spaceId !== 'ballroom')
    && ['wingback', 'settee', 'chaise', 'ottoman'].every((id) => byAuth(id).every((p) => p.spaceId === 'study_w'))
    && byAuth('armor').length >= 1 && byAuth('armor').every((p) => p.spaceId === 'service')
    && byAuth('table-round').every((p) => p.spaceId === 'chapel')
    && byAuth('console').every((p) => p.spaceId === 'gallery'),
    authored.map((p) => `${p.catalogId}@${p.spaceId}`).join(','));
  t('W14n · a full authored house places every one of the 24 smash ids',
    authoredIds.size === 24
    && LAYOUT_CATALOG_IDS.every((id) => authoredIds.has(id)),
    `placed ${authoredIds.size}/24 · ${LAYOUT_CATALOG_IDS.filter((id) => !authoredIds.has(id)).join(',')}`);

  /*
   * Playtest: a table in the gallery doorway. The keep-out is `portal-clearance.js`.
   * A 1.45 m table-round centred on D1 must overlap; every catalog slot must not.
   */
  const d1 = authoredOpenings[0];
  const tableHalf = 1.45 / 2;
  t('W14o · a table on D1 is the playtest overlap (control)',
    overlapsOpening(d1.x, d1.z, tableHalf, tableHalf, d1)
    && !!blockedByOpenings(d1.x, d1.z, tableHalf, tableHalf, authoredOpenings)
    && openingFootprint(d1) != null);
  t('W14p · catalog slots stay out of every authored opening',
    placementsClearOfOpenings(authored, authoredOpenings)
    && !authored.some((p) => {
      const spec = FURN_SMASH_ASSETS.find((a) => a.id === p.catalogId);
      return blockedByOpenings(p.x, p.z, walkHalf(spec), walkHalf(spec), authoredOpenings);
    }),
    authored.filter((p) => {
      const spec = FURN_SMASH_ASSETS.find((a) => a.id === p.catalogId);
      return blockedByOpenings(p.x, p.z, walkHalf(spec), walkHalf(spec), authoredOpenings);
    }).map((p) => `${p.catalogId}@${p.spaceId}`).join(','));

  // Kit dressCameras: gallery west wall + ballroom tripod (cx-5.4, cz+4.2). Catalog, not GeoBin.
  const wallCam = byAuth('cam-wall')[0];
  const tripod = byAuth('cam-tripod')[0];
  const gal = authoredSpaces.find((s) => s.id === 'gallery');
  const ball = authoredSpaces.find((s) => s.id === 'ballroom');
  const galMidZ = (gal.z0 + gal.z1) / 2;
  const ballMid = { x: (ball.x0 + ball.x1) / 2, z: (ball.z0 + ball.z1) / 2 };
  t('W14q · catalog cams sit on the kit camera sites, not a random wall',
    wallCam && wallCam.spaceId === 'gallery'
    && Math.abs(wallCam.x - (gal.x0 + 0.22)) < 0.4
    && Math.abs(wallCam.z - galMidZ) < 0.4
    && tripod && tripod.spaceId === 'ballroom'
    && Math.hypot(tripod.x - (ballMid.x - 5.4), tripod.z - (ballMid.z + 4.2)) < 0.6,
    `wall ${wallCam && `${wallCam.x.toFixed(2)},${wallCam.z.toFixed(2)}`} · tripod ${tripod && `${tripod.x.toFixed(2)},${tripod.z.toFixed(2)}`}`);
}


// ---- W15 · THE MAP FEED — a few seconds, then the evil robot eats it ------------------------
//
// John: "When a good player is guide, the map may show the hunter briefly (few seconds), then the
// map feed is interrupted by static… Evil guide keeps continuous exact runner+hunter without that
// interrupt." The arithmetic lives in `src/party/mapfeed.js`; the ROOM-level consequence — what a
// real socket actually receives on a real night — is `harness/guide-coverage.mjs` C5.
{
  t('W15 · a few seconds of map, then a longer stretch of static',
    PEEK_SECONDS >= 3 && PEEK_SECONDS <= 10 && JAM_SECONDS > PEEK_SECONDS
    && FEED_CYCLE_SECONDS === PEEK_SECONDS + JAM_SECONDS,
    `${PEEK_SECONDS}s clear / ${JAM_SECONDS}s jammed`);

  const good = (s) => mapFeed({ alignment: 'good', seconds: s });
  t('W15a · the window opens at the top of the cycle and closes on the second',
    good(0).phase === 'peek' && good(PEEK_SECONDS - 0.01).phase === 'peek'
    && good(PEEK_SECONDS).phase === 'jam');
  t('W15b · and it comes back — the map is not dead furniture for the rest of the run',
    good(FEED_CYCLE_SECONDS).phase === 'peek'
    && good(FEED_CYCLE_SECONDS * 3 + 1).phase === 'peek');
  const sampled = Array.from({ length: 400 }, (_, i) => good(i * 0.5));
  const jammedFrac = sampled.filter((f) => f.jammed).length / sampled.length;
  t('W15c · the RESTING state is blind — a hidden-role map should fail toward less sight',
    jammedFrac > 0.5, `${(jammedFrac * 100).toFixed(0)}% of ticks jammed`);
  t('W15d · `left` counts down to the turnover rather than being decoration',
    Math.abs(good(0).left - PEEK_SECONDS) < 1e-9
    && Math.abs(good(PEEK_SECONDS).left - JAM_SECONDS) < 1e-9);

  /*
   * 🚨 THE CONTROL, AND IT IS THE WHOLE POINT OF THE FILE. Production's read is already ungated
   * (W7a); a jammed Production map would mean the marks disagreed with the Production Feed line
   * six pixels above them, which is the bug this slice exists to close, arriving from the other
   * direction. Sampled across the cycle rather than at one instant.
   */
  const evilPhases = new Set(sampled.map((_, i) => mapFeed({ alignment: 'evil', seconds: i * 0.5 }).phase));
  t('W15e control · Production is NEVER jammed, at any point in the cycle',
    evilPhases.size === 1 && evilPhases.has('clear')
    && !mapFeed({ alignment: 'evil', seconds: PEEK_SECONDS + 1 }).jammed,
    [...evilPhases].join(','));
  t('W15f · junk or negative time is a phase, not a throw and not a permanent blackout',
    !mapFeed({ alignment: 'good', seconds: -3 }).jammed === !mapFeed({ alignment: 'good', seconds: FEED_CYCLE_SECONDS - 3 }).jammed
    && FEED_PHASES.includes(mapFeed({ alignment: 'good', seconds: NaN }).phase)
    && FEED_PHASES.includes(mapFeed({}).phase));

  /*
   * The flag the phone draws from. Without a row `project()` drops it and reports it unrowed,
   * which `party-isolation` I1 fails on — and the failure is silent from the phone's side: the
   * static simply never appears and the guide reads a jam as an uncovered room.
   */
  const jamRow = MATRIX.find(([g]) => g === 'flyover.jam');
  t('W15g · `flyover.jam` has a `guide` row, like every other flyover field',
    jamRow?.[1] === 'guide', jamRow ? jamRow.join(' -> ') : 'NO ROW');
  t('W15h · and it is not `all` or `phones` — the TV is still not the map',
    MATRIX.filter(([g]) => g.startsWith('flyover.')).every(([, a]) => a === 'guide'));
}

// ---- W16 · THE STICK'S SIGN ------------------------------------------------------------------
//
// 🕹️ John: "Runner stick L/R inverted. Fix so drag left aims/moves left (standard)."
//
// 🚨 THIS IS ASSERTED AGAINST `player.js`'s OWN STRAFE ARITHMETIC RATHER THAN AGAINST ITSELF.
// `stickHeading` is one `Math.atan2`, so "the function returns what the function returns" would
// be a tautology and would have passed on the broken sign too. `Player._stepGround` L906-907
// turns a stick into a WORLD velocity by a completely separate expression —
//
//     vx = sin(aimYaw)·y − cos(aimYaw)·x     vz = cos(aimYaw)·y + sin(aimYaw)·x
//
// — and the body this drives is steered by heading alone (`move:{x:0, y:mag}`). So the test is
// that the two agree: the direction the heading points must be the direction the strafe formula
// would have sent the same thumb. They disagreed by a sign for the whole of PR #8.
{
  const fwd = (yaw) => [Math.sin(yaw), Math.cos(yaw)];
  /** `player.js` L906-907 at `aimYaw`, normalised. The convention, independently expressed. */
  const strafe = (x, y, yaw = 0) => {
    const vx = Math.sin(yaw) * y - Math.cos(yaw) * x;
    const vz = Math.cos(yaw) * y + Math.sin(yaw) * x;
    const m = Math.hypot(vx, vz) || 1;
    return [vx / m, vz / m];
  };
  const near = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;

  const STICKS = [[1, 0], [-1, 0], [0, 1], [0.7, 0.7], [-0.7, 0.7], [0.5, -0.86], [-0.5, -0.86]];
  const agree = STICKS.filter(([x, y]) => near(fwd(stickHeading(x, y)), strafe(x, y)));
  t('W16 · the heading a thumb asks for is the direction player.js would strafe it',
    agree.length === STICKS.length, `${agree.length}/${STICKS.length} sticks agree`);

  /*
   * And in words, because "agrees with the other formula" is only reassuring if the other formula
   * is the right way round. `forward = (sin y, cos y)` puts yaw 0 at +Z, so RIGHT is −X — which is
   * what `follow-bed.js`'s shot solver already means by `rx = -Math.cos(f)`.
   */
  const RIGHT_AT_ZERO = [-1, 0];
  t('W16a · drag right heads right, drag left heads left',
    near(fwd(stickHeading(1, 0)), RIGHT_AT_ZERO)
    && near(fwd(stickHeading(-1, 0)), [1, 0]),
    `right -> ${fwd(stickHeading(1, 0)).map((v) => v.toFixed(2))}`);
  t('W16b · straight ahead is no turn at all',
    stickHeading(0, 1) === 0);
  t('W16c · and pulling back turns the body around instead of walking on',
    Math.abs(Math.abs(stickHeading(0, -1)) - Math.PI) < 1e-9,
    `${(stickHeading(0, -1) * 180 / Math.PI).toFixed(0)}°`);

  /*
   * 🚨 THE REINTRODUCTION ARM. The shipped expression was `atan2(x, max(1e-4, y))`. Both signs
   * produce a runner that walks, which is exactly why no gate and no drive caught it and a person
   * playing the game did — so the broken formula runs here on every run and must disagree.
   */
  const wasShipped = (x, y) => Math.atan2(x, Math.max(0.0001, y));
  // ⚠️ A LOOSER EPSILON HERE, AND IT IS THE BROKEN FORMULA'S OWN FAULT: `max(0.0001, y)` is a
  // clamp, so a straight-across thumb lands 1e-4 rad off the axis rather than on it. Comparing
  // the two arms at 1e-9 would report a MIRROR as merely "not identical", which is a weaker
  // claim than this control is making.
  const mirrored = (a, b) => Math.abs(a[0] + b[0]) < 1e-3 && Math.abs(a[1] - b[1]) < 1e-3;
  t('W16d control · the formula PR #8 shipped really is left-right MIRRORED, not merely different',
    !near(fwd(wasShipped(1, 0)), strafe(1, 0))
    && mirrored(fwd(wasShipped(1, 0)), strafe(1, 0)),
    `it sent a right thumb to ${fwd(wasShipped(1, 0)).map((v) => v.toFixed(2))}`);
  t('W16e control · and it agreed on FORWARD, which is why it looked like it worked',
    near(fwd(wasShipped(0, 1)), strafe(0, 1)));
  t('W16f control · while a pull-back read as a push-forward — the clamp\'s own half of it',
    near(fwd(wasShipped(0, -1)), fwd(wasShipped(0, 1)))
    && !near(fwd(stickHeading(0, -1)), fwd(stickHeading(0, 1))));

  /*
   * 🌀 **THE FRAME, AND THE SPIN IT EXISTS TO STOP — the second half of the same bug, found in
   * Chromium rather than reasoned about.**
   *
   * A bearing is only a direction if it is measured from something that does not move. Added to
   * the LIVE heading every frame, `want - heading` is a constant, so the target runs away from
   * the body at exactly the speed the body chases it: a thumb held left became a turn rate of
   * about 14 rad/s. Measured — nine seconds of full left moved the runner 0.23 m round a tight
   * circle while nine seconds of full forward covered 8.12 m.
   *
   * So the two arms are integrated here rather than argued about, over the SAME smoothing the bed
   * uses, and the claim is convergence: one settles on a heading and the other never does.
   */
  const K = 1 - Math.exp(-STICK_TURN * (1 / 60));
  const spin = (latched) => {
    let heading = 0, ref = null, turned = 0;
    for (let i = 0; i < 600; i++) {                                   // ten seconds at 60 Hz
      ref = stickRef(ref, -1, 0, heading);
      const want = (latched ? ref : heading) + stickHeading(-1, 0);
      const step = Math.atan2(Math.sin(want - heading), Math.cos(want - heading)) * K;
      heading += step;
      turned += Math.abs(step);
    }
    return { heading, turned, settled: Math.abs(heading - (Math.PI / 2)) < 1e-6 };
  };
  const now = spin(true);
  const was = spin(false);
  t('W15g · a held thumb SETTLES on a heading — left is a direction, not a turn rate',
    now.settled && now.turned < Math.PI * 0.51,
    `${(now.turned * 180 / Math.PI).toFixed(0)}° of turning in ten seconds, resting at 90°`);
  t('W15h control · measured from the live heading it never settles — this is the observed spin',
    was.turned > 20 * Math.PI && !was.settled,
    `${(was.turned / (2 * Math.PI) / 10).toFixed(1)} revolutions per second, forever`);

  t('W15i · the latch is per PUSH — it arms on contact, holds while held, clears at centre',
    stickRef(null, -1, 0, 1.25) === 1.25
    && stickRef(1.25, -1, 0, 2.5) === 1.25
    && stickRef(1.25, 0, 0, 2.5) === null
    && stickRef(1.25, 0.05, 0.05, 2.5) === null,
    `deadzone ${STICK_DEADZONE}`);
  t('W15j · and the phone\'s own nub lights on the same deadzone the bed steers on',
    STICK_DEADZONE > 0 && STICK_DEADZONE < 0.3);

  /*
   * 🕹️ **THE FEEL PASS — radial deadzone, hysteresis, a slower chase.** Sign + latch stopped
   * the spin; a held thumb still lurched off the rim and a 9 rad/s chase snapped the heading
   * ahead of the body. These are the three knobs, each with a control that the old number fails.
   */
  t('W15k · leaving the deadzone starts at speed 0, not at the zone itself',
    stickMag(STICK_DEADZONE, 0) === 0
    && stickMag(STICK_DEADZONE + 0.001, 0) < 0.02
    && stickMag(0, 1) === 1,
    `mag@zone+ε=${stickMag(STICK_DEADZONE + 0.001, 0).toFixed(3)}`);
  t('W15l control · the raw hypot at the same sample is the lurch this rescales away',
    Math.hypot(STICK_DEADZONE + 0.02, 0) > 0.14
    && stickMag(STICK_DEADZONE + 0.02, 0) < 0.05);
  t('W15m · the latch has hysteresis — a thumb on the rim does not chatter',
    STICK_RELEASE < STICK_DEADZONE
    && stickRef(null, STICK_RELEASE + 0.01, 0, 1.1) === null
    && stickRef(1.1, STICK_RELEASE + 0.01, 0, 2.2) === 1.1,
    `arm ${STICK_DEADZONE} / release ${STICK_RELEASE}`);
  t('W15n · the heading chase is slower than the snap that read as a slide',
    STICK_TURN > 4 && STICK_TURN < 8.5, `${STICK_TURN} rad/s`);
  t('W15o control · the number the bed used to hardcode really is the snap',
    9.0 > 8.5);

  const phonePad = await readFile(new URL('../src/views/party-phone.js', import.meta.url), 'utf8');
  const bedSrcFeel = await readFile(new URL('../src/game/follow-bed.js', import.meta.url), 'utf8');
  t('W15p · the phone nub and the bed both read the exported zone, not a restated 0.12',
    /STICK_DEADZONE/.test(phonePad) && !/> 0\.12/.test(phonePad)
    && /stickCamMove\(/.test(bedSrcFeel) && /stickMag\(/.test(bedSrcFeel));
}

// ---- W16 · PR B cyan policy (THREE-free) — envelope keeps G, inter-room does not ------------
//
// Live cyan is the DamageField G channel. Map-designer "cyan" is short nodig < 1.20 m.
// This gate cannot import `dig.js` (THREE). The arithmetic and the fill rule live in
// `dig-policy.js`. The grid half is `harness/_cy1-edge.mjs`.
{
  t('W16 · leftoverRuns is how an envelope leftover is cut from a shared side',
    leftoverRuns(0, 10, [[3, 7]]).length === 2
    && leftoverRuns(0, 10, [[0, 10]]).length === 0
    && leftoverRuns(0, 4, [[1, 2]], 1.2).every((r) => r[1] - r[0] >= 1.2));
  t('W16a · barrier fill is 1 only on envelope edges',
    barrierFillForEdge({ envelope: true }) === 1
    && barrierFillForEdge({ envelope: false }) === 0
    && barrierFillForEdge({}) === 0);
  const here = dirname(fileURLToPath(import.meta.url));
  const src = (rel) => readFileSync(join(here, '..', rel), 'utf8');
  const digSrc = src('src/game/dig.js');
  const roomSrc = src('src/game/room.js');
  const dfSrc = src('src/destruction/damagefield.js');
  t('W16b · digEdges appends envDigTable — interior ids are not rewritten',
    /interiorEdges\(\)/.test(digSrc) && /envDigTable\(\)\.edges/.test(digSrc)
    && /envelope:\s*true/.test(digSrc));
  t('W16c · setDigPlan sets G from spec.envelope and does not call setInterconnect on free faces',
    /p\.setBarrier\(!!p\.spec\.envelope\)/.test(roomSrc)
    && !/p\.setInterconnect\(null\)/.test(roomSrc));
  t('W16d · DamageField default remains G=1 so furniture smash does not silently open',
    /o\.barrier !== 0 && o\.barrier !== false/.test(dfSrc));
}

// ---- W17 · THE PICTURE TAKES THE TELEVISION --------------------------------------------------
//
// 📺 John: "TV follow ~90%. Runner camera / follow frame should take about 90% of the TV screen."
// The number is a constant rather than a literal in the stylesheet for `palette.js`'s reason one
// dimension over: `injectNightSkin` builds its rules inside a function, so nothing in bare node
// can read them, and a number no gate can see is a number that drifts back.
{
  t('W17 · the broadcast picture is about 90% of the short side',
    TV_FRAME_PCT >= 85 && TV_FRAME_PCT <= 95, `${TV_FRAME_PCT}%`);

  const skin = await readFile(new URL('../src/party/night-skin.js', import.meta.url), 'utf8');
  // ⚠️ `\}\r?\n`, NOT `\}`. The rule's own text contains `${TV_FRAME_PCT}`, so a lazy match to the
  // first brace stops four characters in and the check quietly passes on nothing. The declaration
  // block's real close is the only `}` on this rule followed by a line end.
  //
  // ⚠️ AND THE `\r?` IS LOAD-BEARING. It was `\}\n`, which is every line ending CI has and NOT the
  // one on a Windows checkout: `core.autocrlf=true` writes `}\r\n`, the anchor never matched, and
  // `?? ''` handed the assertion an empty string. W17a then failed on John's PC and passed on
  // Linux — the CSS was correct the whole time. A gate that reads a file this way must tolerate
  // both line endings or it is only a gate on one operating system.
  //
  // ⚠️ AND THE FOUR-SPACE INDENT IS LOAD-BEARING TOO, for a third time on the same line. The run
  // beat gained a `.night.on-run .run-frame { flex:0 1 auto; min-height:0; }` override (see W44),
  // and `.run-frame \{` matches INSIDE that longer selector — which appears earlier in the file.
  // The lazy match then returned that 45-character override instead of the base rule, and W17a
  // failed reporting CSS that was perfectly correct. Anchoring on the indent picks the rule whose
  // selector STARTS there. `position:relative` in W17a-pre is the second belt on the same trousers.
  const rule = skin.match(/\n {4}\.run-frame \{[\s\S]*?\}\r?\n/)?.[0] ?? '';
  // W17a-pre exists because the failure above was UNREADABLE: an empty `rule` fails W17a with a
  // blank detail, which reads as "the CSS lost its height rule" when the truth is "the regex found
  // nothing". Extraction now fails under its own name, so the two causes can never be confused.
  t('W17a-pre · the .run-frame rule was actually extracted — an empty match fails HERE, not as CSS',
    rule.length > 0 && rule.includes('position:relative'), `${rule.length} chars`);
  t('W17a · and the run frame\'s height INTERPOLATES it rather than restating a number',
    rule.includes('${TV_FRAME_PCT}vh') && rule.includes('aspect-ratio:16/9'),
    rule.replace(/\s+/g, ' ').slice(0, 96));
  /*
   * The cap is the half that actually bit. `min(58vh, 620px)` reads as "58% of the height" and is
   * 57% on a 1080p set and 38% on a 1440p one — so the picture got SMALLER on exactly the screens
   * this view exists for. A pixel cap on this rule can never be right.
   */
  const px = rule.match(/\b\d{3,}px\b/g) || [];
  t('W17b · with no pixel cap — a cap in px shrinks the picture on the biggest television',
    px.length === 0, px.join(',') || 'no px cap');
  t('W17c · the chrome around it gets out of the way on the run beat, or 90% does not fit',
    /\.night\.on-run \.night-main \{[^}]*overflow:hidden/.test(skin)
    && /\.night\.on-run \.night-top \{/.test(skin));
}

// ---- W18 · A DOORWAY IS NOT A PLACE TO PUT A TABLE ------------------------------------------
//
// John, playtesting `7838abb`: *"I couldn't walk into the gallery, a table was blocking the
// doorway."* The gallery is the MISSION room, so a blocked door is not a scruffy room — it is a
// night nobody can finish.
//
// 🚨 EVERY CLAIM HERE CARRIES ITS CONTROL, and the controls are the point: a clearance rule that
// rejected nothing would satisfy "no placement blocks a door" completely and perfectly. So the
// pre-fix table is run on the same 24 world seeds and has to come back DIRTY.
{
  const specOf = new Map(FURN_SMASH_ASSETS.map((a) => [a.id, a]));
  const walkOf = (p) => walkHalf(specOf.get(p.catalogId));
  const canBlock = (p) => walkOf(p) > 0;

  /*
   * ⚠️ THE AXIS. `genplan.js` writes `axis: widthAxisOf(run.axis)` and `room.js` reads it back as
   * `axis === 'x' ? normal +Z : normal +X`, so `axis: 'x'` means the opening SPANS x. Read the
   * other way round the keepout is a correct rectangle rotated ninety degrees — it still rejects
   * placements, just never the ones in the doorway, and every test below would still pass.
   */
  const kx = portalKeepout({ id: 'k', x: 0, z: 0, w: 1.9, axis: 'x' });
  const kz = portalKeepout({ id: 'k', x: 0, z: 0, w: 1.9, axis: 'z' });
  const span = (k) => [+(k.x1 - k.x0).toFixed(3), +(k.z1 - k.z0).toFixed(3)];
  const [kxW, kxD] = span(kx);
  const [kzW, kzD] = span(kz);
  t('W18 · the DOOR\'S OWN WIDTH lands on the axis it spans, and the stride depth across it',
    kxW === +(1.9 + 2 * PORTAL_SIDE_PAD).toFixed(3) && kzD === kxW && kxD === kzW && kxW !== kxD,
    `axis x -> ${kxW} x ${kxD} m · axis z -> ${kzW} x ${kzD} m`);
  t('W18a · and it is wider than the opening, because a body does not arrive square-on',
    kxW > 1.9, `${kxW} m of clear for a 1.90 m door`);

  let placedTotal = 0, blockedBefore = 0, blockedAfter = 0, droppedTotal = 0;
  let centreOut = 0;
  for (let ws = 0; ws < 24; ws++) {
    const tables = generatedTables(pickPlanSeed(ws).seed, PLAN_OPTS);
    const bySpace = new Map(tables.spaces.map((s) => [s.id, s]));
    const before = catalogPlacements(tables.spaces);
    const after = catalogPlacements(tables.spaces, { portals: tables.portals });

    placedTotal += before.length;
    droppedTotal += before.length - after.length;
    blockedBefore += before.filter((p) => canBlock(p)
      && blockedByOpenings(p.x, p.z, walkOf(p), walkOf(p), tables.portals)).length;
    blockedAfter += after.filter((p) => canBlock(p)
      && blockedByOpenings(p.x, p.z, walkOf(p), walkOf(p), tables.portals)).length;

    // Catalog dress REFUSES a blocked slot and tries the next candidate — it does not
    // slide. The centre must still sit in the space the id names. (A wall console's
    // smash AABB is allowed to overlap masonry; that is not a doorway miss.)
    for (const p of after) {
      const sp = bySpace.get(p.spaceId);
      if (sp && (p.x < sp.x0 || p.x > sp.x1 || p.z < sp.z0 || p.z > sp.z1)) centreOut++;
    }
  }
  t('W18b · NO catalog placement stands in a doorway, on any of 24 world seeds',
    blockedAfter === 0, `${blockedAfter} of ${placedTotal} placements`);
  t('W18c control · the table that shipped really did block doorways — the rule rejects something',
    blockedBefore > 0,
    `${blockedBefore} of ${placedTotal} blocked before the fix, ${droppedTotal} dropped rather than retried`);

  /*
   * Nudge (authored kit / registerGroup) is the other half of the same AABB. Sliding a
   * console off a door must leave it in its room — ROOM_MARGIN is what stops a clear
   * from posting it through the wall. Catalog refuse is W18b; this is the slide.
   */
  const nudgeRoom = { x0: -6, x1: 6, z0: -4, z1: 4 };
  const nudgeDoor = portalKeepouts([{ id: 'd', x: 0, z: 4, w: 1.9, axis: 'x' }]);
  const nudged = clearOfPortals(
    { x: 0, z: 3.48, w: 1.35, d: 0.44, rotY: Math.PI, baseY: 0 },
    nudgeDoor,
    nudgeRoom,
  );
  const nudgedRect = nudged && footprintRect(nudged.x, nudged.z, 1.35, 0.44, Math.PI);
  t('W18d · a nudged prop is still inside its own room',
    centreOut === 0
    && nudged && nudged.moved > 0
    && nudgedRect
    && nudgedRect.x0 >= nudgeRoom.x0 && nudgedRect.x1 <= nudgeRoom.x1
    && nudgedRect.z0 >= nudgeRoom.z0 && nudgedRect.z1 <= nudgeRoom.z1,
    `centres out ${centreOut} · nudge ${nudged ? nudged.moved.toFixed(2) : '—'} m`);

  /*
   * 🖼️ **THE PROP JOHN ACTUALLY WALKED INTO**, asserted by its own formula rather than by a class
   * of props. `furn-dress.js` `dressGallery` puts a 1.35 x 0.44 console at `x: sp.cx, z: sp.z1 -
   * 0.52` — the middle of a long wall — and `genplan.js` `pushPortal` cuts a doorway at the middle
   * of the overlap between two rooms, which on a shared long wall is the same place. Neither file
   * was wrong on its own; what was missing is that neither knew the other existed.
   */
  let galleryBlockedBefore = 0, galleryBlockedAfter = 0, galleryDropped = 0;
  for (let ws = 0; ws < 24; ws++) {
    const tables = generatedTables(pickPlanSeed(ws).seed, PLAN_OPTS);
    const gallery = tables.spaces.find((s) => s.roomType === MISSION_ROOM);
    if (!gallery) continue;
    const keepouts = portalKeepouts(tables.portals);
    const authored = { x: (gallery.x0 + gallery.x1) / 2, z: gallery.z1 - 0.52 };
    const shape = { w: 1.35, d: 0.44, rotY: Math.PI, baseY: 0 };
    if (blockedBy(footprintRect(authored.x, authored.z, shape.w, shape.d, shape.rotY), keepouts)) {
      galleryBlockedBefore++;
    }
    const clear = clearOfPortals({ ...authored, ...shape }, keepouts, gallery);
    if (!clear) { galleryDropped++; continue; }
    if (blockedBy(footprintRect(clear.x, clear.z, shape.w, shape.d, shape.rotY), keepouts)) {
      galleryBlockedAfter++;
    }
  }
  t('W18e · the gallery console clears the gallery\'s own doors on every seed',
    galleryBlockedAfter === 0, `${galleryBlockedAfter} blocked · ${galleryDropped} dropped`);
  t('W18f control · and the un-nudged placement really did shut the mission room',
    galleryBlockedBefore > 0, `${galleryBlockedBefore}/24 world seeds had the gallery console on a door`);

  // A fitting hung above head height cannot be in anyone's way, and must not be slid sideways for
  // a door it floats a clear metre above. Both arms, because "never nudges" and "always nudges"
  // are equally wrong and the constant is what separates them.
  const onDoor = portalKeepouts([{ id: 'd', x: 0, z: 0, w: 1.9, axis: 'x' }]);
  const hung = clearOfPortals({ x: 0, z: 0, w: 1.55, d: 1.55, rotY: 0, baseY: 2.85 }, onDoor);
  const stood = clearOfPortals({ x: 0, z: 0, w: 1.55, d: 1.55, rotY: 0, baseY: 0 },
    onDoor, { x0: -12, x1: 12, z0: -12, z1: 12 });
  t('W18g · a chandelier at 2.85 m is left where it hangs',
    hung && hung.moved === 0, `moved ${hung?.moved ?? '—'} m`);
  t('W18h control · and the same footprint standing on the floor is moved off the door',
    stood && stood.moved > 0.5, `moved ${stood ? stood.moved.toFixed(2) : '—'} m`);

  /*
   * The rule has to be consulted by the PLACERS, not merely exist. `registerGroup` is the one door
   * every authored prop in `furn-dress.js` goes through, which is what makes a prop a later slice
   * adds inherit the clearance instead of having to remember it — the defect here was a placer that
   * had never been told doorways existed, and a rule restated at each call site is that again.
   */
  const dressSrc = await readFile(new URL('../src/game/furn-dress.js', import.meta.url), 'utf8');
  const layoutSrc = await readFile(new URL('../src/game/furn-layout.js', import.meta.url), 'utf8');
  t('W18i · registerGroup asks before it places, so every authored prop inherits the rule',
    /function registerGroup\(room, \{[\s\S]{0,600}?clearOfPortals\(/.test(dressSrc)
    && /placeCrateStack[\s\S]{0,600}?clearOfPortals\(/.test(dressSrc));
  t('W18j · and the catalog loader hands the house\'s real doorways to the table',
    /openingsFromRoom\(room\)/.test(layoutSrc)
    && /catalogPlacements\(room\.spaces \?\? \[\], openings\)/.test(layoutSrc));
}

// ---- W19 · SMASHING A BOX IS NOT THE END OF AN EPISODE ---------------------------------------
//
// John: *"it randomly goes to the recap screen. I didn't go anywhere or do much. I just hit a
// box."* Two mechanisms, and only one of them is the one he named:
//
//   · the 26 s stub clock in `show.js`, which ended every episode whatever anyone was doing
//   · `follow-bed.js` `missionTick`, which counted ANY landed swing within 1.9 m of the mission
//     painting as having broken it — and the gallery is dressed, so there are boxes to smash there
{
  t('W19 · the show clock is a backstop, not the beat — minutes, not seconds',
    recapAfterMs() >= 120000, `${(recapAfterMs() / 1000 / 60).toFixed(1)} min`);
  t('W19a control · and it is not infinite, so a dead TV cannot strand the room on expedition',
    Number.isFinite(RECAP_BACKSTOP_MS) && RECAP_BACKSTOP_MS > 0, `${RECAP_BACKSTOP_MS} ms`);
  t('W19b · only a FINISHED mission ends the run — the painting down AND the runner home',
    missionEndsRun('done')
    && !missionEndsRun('return') && !missionEndsRun('seek') && !missionEndsRun('none'),
    MISSION_PHASES.filter(missionEndsRun).join(',') || 'none');

  const localSrc = await readFile(new URL('../net/party/local.mjs', import.meta.url), 'utf8');
  t('W19c · the server ends the run off the TV\'s world report, not off a timer',
    /endRunOnMission\(room, msg\.mission\)/.test(localSrc)
    && /function endRunOnMission/.test(localSrc));

  /*
   * 🔨 AND THE HIT IS A HIT. The radius test is gone: the mission painting is now struck by a ray
   * down the runner's own aim, the same `eye` / `aimDir` pair `player.js` `_resolveSledgeHit` casts
   * for the wall — so a swing at a crate beside it, facing the other way, does not finish a night.
   */
  const bedSrc = await readFile(new URL('../src/game/follow-bed.js', import.meta.url), 'utf8');
  t('W19d · the smash is broken by a swing AIMED at it, not by one that landed nearby',
    /function swingHitObject/.test(bedSrc)
    && /_paintRay\.set\(runner\.eye, runner\.aimDir\)/.test(bedSrc)
    && !/d <= 1\.9/.test(bedSrc));
  t('W19e · a new run cue re-arms the mission so episode 2 does not start already done',
    /armMission\(c\.episode \?\? 1\)/.test(bedSrc) && /function armMission/.test(bedSrc));
}

// ---- W20 · WORD FROM THE HOUSE IS GONE FROM THE CHAIRS TOO -----------------------------------
//
// John, playing the GOOD guide: the map was drawing its static — which is that guide's blindness,
// working as designed — with *"No word on the hunter"* printed six pixels underneath it. Two
// surfaces answering the same question by two different rules is the defect `mapfeed.js` exists to
// close, arriving from the other side.
//
// #12 took the strip off the RUNNER on the same argument: that seat already has a channel — a human
// being talking to them. The guide's channel is the map. DUSK then took it off the WATCHERS too:
// the house-word block was sitting between the emote pad and "Your card — HOLD TO READ." Watchers
// react; they do not get a house line. Production guides still get their feed.
//
// ⚠️ Asserted from SOURCE, because `views/party-phone.js` is a DOM view and this gate runs in bare
// node with no `npm install`. The rendered claim is `party-playtest-drive.mjs` E6d.
{
  const phone = await readFile(new URL('../src/views/party-phone.js', import.meta.url), 'utf8');
  const guideBranch = phone.match(/\} else if \(iAmGuide\) \{[\s\S]*?\n {6}\} else \{/)?.[0] ?? '';
  /* Anchored on the pad's CLASS, not on a literal `data-r="SHOCK"` button. The four buttons are
     built from `REACTIONS` now that each one carries a face, so the last one is no longer
     spelled out in the source and this slice quietly returned '' — which fails W20 arm rather
     than passing W20c vacuously, which is the correct direction for an anchor to break in. */
  const seatedBranch = phone.match(/\n {6}\} else \{[\s\S]*?react-pad[\s\S]*?\n {6}\}/)?.[0] ?? '';
  const runnerBranch = phone.match(/if \(iAmRunner\) \{[\s\S]*?\} else if \(iAmGuide\)/)?.[0] ?? '';

  t('W20 arm · the three expedition sheets were all found in the source',
    guideBranch.length > 200 && seatedBranch.length > 100 && runnerBranch.length > 200,
    `guide ${guideBranch.length} · seated ${seatedBranch.length} · runner ${runnerBranch.length} chars`);
  t('W20a · the guide\'s sheet asks for PRODUCTION\'S feed only, never the house word',
    /intelBlock\(frame, \{ productionOnly: true \}\)/.test(guideBranch)
    && !/intelBlock\(frame\)/.test(guideBranch));
  t('W20b · the runner\'s pad still has no intel block at all',
    !/intelBlock\(/.test(runnerBranch));
  t('W20c · a SEATED watcher has no house-word block — the strip is gone from the chairs too',
    !/intelBlock\(/.test(seatedBranch));

  /*
   * 🚨 **AND IT IS KEYED TO THE ALIGNMENT, NOT TO THIS TICK'S GRADE.** `intelFor` returns null
   * until the TV's first world report lands, so `grade === 'exact'` is false for the opening half
   * second of every expedition. Keyed on the grade, a Production guide's strip would appear a
   * moment after the sheet did — which is the *"flashing 'word from the house', which moves and
   * resizes everything else"* that the reserved slot was built to stop, reintroduced.
   */
  t('W20d · a Production guide keeps their feed, decided by ALIGNMENT rather than by a grade',
    /alignment === 'evil'/.test(phone)
    && /data-intel-mode="\$\{exact \? 'production' : 'house'\}"/.test(phone));
  t('W20e · and the patcher cannot relabel a Production strip back to the house word',
    /slot\.dataset\.intelMode === 'production'/.test(phone));
}

// ---- W21 · INTROS ARE THE MESHY ROBOT, CENTRED, NOT A DIM LEFT STRIP ------------------------
//
// John, after #12: intros used the old procedural robot, "framed far left / thin strip / looks
// background during CASTING." Two defects, one picture: the body was unit4h, and CASTING kept
// the follow layer as the warm backdrop (blurred, behind the ballot board) so a 62° plate of
// the ballroom leaked around the left edge.
//
// A later playtest over-corrected the other way: 38° at 1.75 m filled the visor and hid every
// other contestant. W21 now pins a medium-wide debrief plate, not a passport photo.
{
  t('W21 · the intro lens is a medium-wide, not a visor portrait and not the run\'s 62° plate',
    INTRO_FOV >= 52 && INTRO_FOV <= 60 && INTRO_FOV < 62, `${INTRO_FOV}°`);
  t('W21a · and the CASTING picture is a centred frame, not a full-bleed strip',
    INTRO_FRAME_PCT >= 70 && INTRO_FRAME_PCT < TV_FRAME_PCT, `${INTRO_FRAME_PCT}%`);

  const introSrc = await readFile(new URL('../src/game/intro-bed.js', import.meta.url), 'utf8');
  const bedSrc = await readFile(new URL('../src/game/follow-bed.js', import.meta.url), 'utf8');
  const hostSrc = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');
  const followSrc = await readFile(new URL('../src/party/follow.js', import.meta.url), 'utf8');
  const skin = await readFile(new URL('../src/party/night-skin.js', import.meta.url), 'utf8');

  t('W21b · intros clone the already-loaded Meshy body rather than baking eight new ones',
    /cloneMeshAvatar/.test(introSrc) && /avatar: twin/.test(introSrc)
    && /avatar,/.test(bedSrc));
  t('W21c control · a failed fetch still builds a unit4h body, so a chair is never empty',
    /tintedMaterials\(base/.test(introSrc) && /avatar: twin/.test(introSrc)
    && /cloneMeshAvatar\(avatar/.test(introSrc));
  t('W21d · the intro camera snaps onto a new robot instead of lerping from the warm dolly',
    /if \(i !== focusI\)/.test(introSrc) && /INTRO_FOV/.test(introSrc));
  t('W21e · CASTING promotes the follow layer to a highlighted intro frame',
    /follow\.mode === 'intros'/.test(hostSrc)
    && /intro-frame/.test(hostSrc)
    && /on-intro/.test(hostSrc));
  t('W21f · the skin interpolates INTRO_FRAME_PCT and drops the warm blur on that beat',
    /\$\{INTRO_FRAME_PCT\}vh/.test(skin)
    && /\.run-cam-layer\.intros/.test(skin)
    && /\.night\.on-intro/.test(skin));
  t('W21g control · the lobby warm layer is still the dim blurred backdrop',
    /filter: blur\(2px\)/.test(skin) && /\.run-cam-layer\.warm \{/.test(skin));
  t('W21h — late bake must not fire cast intros once the expedition owns the TV',
    /ui\.beat === 'expedition' \|\| ui\.beat === 'recap' \|\| ui\.beat === 'debrief'/.test(hostSrc)
    && /maybeIntros/.test(hostSrc));

  t('W22 — live expedition does not paint a Watch the run button', (() => {
    const chunk = hostSrc.match(/if \(onRun\) \{[\s\S]*?\n    \} else if \(show === 'recap'\)/);
    return !!(chunk && !/<button[^>]*>Watch the run<\/button>/.test(chunk[0])
      && !/id="to-run">Watch the run/.test(chunk[0]));
  })());
  t('W22a control — casting with a locked pair still offers Watch the run',
    /if \(hasPair\) body \+= `[\s\S]*?Watch the run/.test(hostSrc));
  t('W22b · Send them in is gone — a locked pair auto-sends after a 3 s count',
    !/<button[^>]*>Send them in<\/button>/.test(hostSrc)
    && !/id="lock">Send them in/.test(hostSrc)
    && /SEND_COUNTDOWN_MS = 3000/.test(hostSrc)
    && /function armSendCountdown/.test(hostSrc)
    && /function sendThemIn/.test(hostSrc)
    && /data-send-count/.test(hostSrc));
  t('W25 — run cue is only marked cued after a successful postMessage',
    /function cueRun\(/.test(hostSrc)
    && /if \(ok\) ui\.cuedRunner = runnerId/.test(hostSrc)
    && !/ui\.cuedRunner = runnerId;\s*\n\s*const look = seatLook/.test(hostSrc));
  t('W25a — follow ready retries the run cue for the locked pair',
    /if \(m\.ready\)/.test(hostSrc)
    && /cueRun\(runnerId/.test(hostSrc));
  t('W25b — follow ready clears cuedRunner so a premature postMessage cannot stick WARM · WALK',
    /if \(m\.ready\)/.test(hostSrc)
    && /ui\.cuedRunner = null/.test(hostSrc)
    && /cueRun\(runnerId/.test(hostSrc));
  t('W25c — warm/intros hide the follow slug (no dim WARM · WALK on air)',
    /#fl\.pre \.slug \{ opacity:0; \}/.test(followSrc)
    && !/#fl\.pre \.slug \{ opacity:\.35; \}/.test(followSrc));
  t('W25d — host clears CAMERA WARMING underlay once follow is live/run',
    /followLive: follow\.live/.test(hostSrc)
    && /warmSlot\.textContent = ''/.test(hostSrc)
    && /followLive \? '' : 'camera warming'/.test(hostSrc));

  t('W22c · hidden-tab intros watchdog is ~12s so 3·2·1 cannot hang forever',
    /INTROS_DONE_MS = 12000/.test(hostSrc)
    && /function armIntrosWatchdog/.test(hostSrc)
    && /function markIntrosDone/.test(hostSrc)
    && /visibilityState === 'hidden'/.test(hostSrc)
    && /visibilityState === 'visible'/.test(hostSrc)
    && /armSendCountdown/.test(hostSrc));
  t('W22d · ballot board prints the existing cast tie-break chain, not a second resolver',
    /previewCastTiebreaks/.test(hostSrc)
    && /describeCastTiebreaks/.test(hostSrc)
    && /ballot-why/.test(hostSrc)
    && /\.ballot-why/.test(skin));
  t('W22e · stock Robot N is a TV name, not The runner / The guide',
    /publicName\(playerName/.test(hostSrc)
    && !/\^Robot \\d\+\$\/i/.test(hostSrc));

  const phoneCast = await readFile(new URL('../src/views/party-phone.js', import.meta.url), 'utf8');
  const paintCast = phoneCast.match(/function paintCasting[\s\S]*?function patchCastSheet/)?.[0] || '';
  t('W22f · casting stamp is phase + ids — names and the card tab do not rebuild #lock-pick',
    /p\.id\)\.join/.test(paintCast)
    && /function patchCastSheet/.test(phoneCast)
    && !/hasCard\(\) \? 'card'/.test(paintCast)
    && !/p\.id\}:\$\{p\.name/.test(paintCast));
  t('W22g · 3·2·1 arms on all-in or the 20s backstop, not the first ballot',
    /shouldArmCastSend/.test(hostSrc)
    && /firstBallotAt/.test(hostSrc)
    && /maybeArmFromBackstop/.test(hostSrc)
    && /CAST_BACKSTOP_MS/.test(await readFile(new URL('../src/party/ballot.js', import.meta.url), 'utf8'))
    && !/\(client\.ballots \|\| \[\]\)\.length >= 1/.test(hostSrc));
  t('W22h · lockout is disabled + dashed, pointer-events none — no phantom tap',
    /pointer-events:none/.test(skin)
    && /button\.locked-out/.test(skin)
    && /castRowBlock/.test(phoneCast)
    && /castRowMark/.test(phoneCast)
    && /ran last/.test(await readFile(new URL('../src/party/cast-ui.js', import.meta.url), 'utf8')));
  t('W22i · self-pick state is named on the phone; applyCastTap still allows it',
    /You named yourself/.test(phoneCast)
    && /cast-note/.test(phoneCast)
    && /self-pick/.test(skin));
}

// ---- W23 · YOU CAN SEE INTO THE NEXT ROOM THROUGH A DOOR ------------------------------------
//
// Rooms light independently: five lamps follow the space you are standing in, so an adjacent
// room that `setViewpoints` has kept resident is unlit. The authored/generated tables already
// park `cool` past ONE door. This picks the door in FRAME and puts the rim past THAT one.
//
// Arithmetic here; `_bleed1-doorlight.mjs` is the pixel control arm (`?bleed=0` vs on).
{
  const here = { id: 'study_w', x0: 0, x1: 8, z0: 0, z1: 6 };
  const next = { id: 'gallery', x0: 0, x1: 8, z0: 8, z1: 20 };
  const spaces = [here, next];
  const door = { a: 'study_w', b: 'gallery', x: 4, z: 6.15, nx: 0, nz: 1 };
  const behind = { a: 'study_w', b: 'service', x: 4, z: -0.2, nx: 0, nz: -1 };

  const facing = facingPortal([door, behind], 'study_w', { x: 4, z: 3 }, { x: 0, z: 1 });
  t('W23 · the portal in front of the camera wins, not the widest door and not the one behind',
    facing === door, facing ? `${facing.a}->${facing.b}` : 'none');
  t('W23a control · looking the other way does not pick the door behind your head',
    facingPortal([door, behind], 'study_w', { x: 4, z: 3 }, { x: 0, z: -1 }) === behind);

  const rim = bleedCoolPos(door, 'study_w', spaces);
  t('W23b · the rim sits PAST the doorway, in the other room',
    isPastSpace(rim, here) && !isPastSpace(rim, next)
    && rim.z > door.z, `z=${rim.z.toFixed(2)} past=${BLEED_PAST}`);
  t('W23c control · a rim left at the current room\'s centre is the defect',
    !isPastSpace({ x: 4, y: 1.9, z: 3 }, here));

  const staticCool = { x: 4, y: 1.9, z: -2.0 }; // past the BACK door, the table's widest
  const through = { x: 4, z: 9.2 };             // two metres into the gallery
  const dBleed = Math.hypot(through.x - rim.x, through.z - rim.z);
  const dStatic = Math.hypot(through.x - staticCool.x, through.z - staticCool.z);
  t('W23d · the facing rim is closer to the room you are looking into than the table\'s cool',
    dBleed < 3 && dStatic > 8, `bleed ${dBleed.toFixed(2)} m vs table ${dStatic.toFixed(2)} m`);

  t('W23e · the cone widen is a few degrees, not a flood',
    Math.abs(bleedKeyAngle(0.30, true) - 0.30 - BLEED_CONE) < 1e-9
    && bleedKeyAngle(0.86, true) <= 0.95
    && bleedKeyAngle(0.30, false) === 0.30, `+${BLEED_CONE} rad`);

  const bedSrc = await readFile(new URL('../src/game/follow-bed.js', import.meta.url), 'utf8');
  t('W23f · the follow rig actually calls the rule, and `?bleed=0` is the control',
    /facingPortal\(/.test(bedSrc) && /bleedCoolPos\(/.test(bedSrc)
    && /get\('bleed'\) === '0'/.test(bedSrc));
  t('W23g · the rig repositions the existing cool — it does not construct a sixth light',
    /want\.cool\.pos\.set\(p\.x/.test(bedSrc)
    && (bedSrc.match(/new THREE\.PointLight/g) || []).length === 4);
}


// ---- W24 — RECAP OUTCOME IS A SERVER FACT (SMASHED / TIME; CAUGHT reserved) ----------------
{
  t('W24 · RUN_END names the three honest words and only those',
    RUN_END.SMASHED === 'SMASHED' && RUN_END.CAUGHT === 'CAUGHT' && RUN_END.TIME === 'TIME'
    && Object.keys(RUN_END).length === 3);
  t('W24a · the show fanout may carry `end` — otherwise a recap reload loses the word',
    FANOUT_KEYS.show.includes('end') && FANOUT_KEYS.show.includes('beat'));
  const localSrc = await readFile(new URL('../net/party/local.mjs', import.meta.url), 'utf8');
  t('W24b · mission done posts SMASHED; the backstop posts TIME',
    /setShow\(room, 'recap', RUN_END\.SMASHED\)/.test(localSrc)
    && /setShow\(room, 'recap', RUN_END\.TIME\)/.test(localSrc));
  t('W24c · nothing posts CAUGHT yet — hunter take is still the next slice',
    !/RUN_END\.CAUGHT/.test(localSrc));
  const phoneSrc = await readFile(new URL('../src/views/party-phone.js', import.meta.url), 'utf8');
  t('W24d · phone paints runEnd when present and never invents TIME when end is missing',
    /if \(c\.runEnd\) body \+=/.test(phoneSrc)
    && !/c\.runEnd \|\| 'TIME'/.test(phoneSrc)
    && /THE OUTCOME WORD IS THE ONE FACT/.test(phoneSrc)
    && /same honesty as TV/.test(phoneSrc));
}

// ---- W27 — NIGHT LOOP: RECAP → DEBRIEF → CASTING, CHAPEL TABLE ON EP2 ----------------------
{
  /*
   * ⚠️ **INVERTED 2026-08-28 — `execution` no longer hands straight back to Casting.**
   * The chain grew a seventh beat between them, so the assertion that used to pin
   * `nextShowBeat('execution') === 'casting'` was pinning the ABSENCE of an ending. It now pins
   * the walk through the Verdict, and `nextShowBeat('verdict')` is Casting only as the DEFAULT —
   * `progressShow` overrules it on a finished season (`party-night` N17h / N17j gate both sides).
   */
  t('W27 · debrief is a show beat, and the run walks all the way to the Verdict',
    SHOW_BEATS.includes('debrief') && SHOW_BEATS.includes('reckoning')
      && AFTER_RUN_BEATS.join(',') === 'recap,debrief,reckoning,vote,execution,verdict,casting'
      && nextShowBeat('recap') === 'debrief' && nextShowBeat('debrief') === 'reckoning'
      && nextShowBeat('execution') === 'verdict' && nextShowBeat('verdict') === 'casting');
  // Debrief 75s -> 300s on 2026-08-25: a CEILING now, ended by a majority tapping READY
  // (`party-night` N21). What the change cost the night budget is argued in `round-loop` R2.
  t('W27a · holds are the shooting-schedule seconds, not a silent second table',
    RECAP_HOLD_MS === 10000 && DEBRIEF_HOLD_MS === 300000);
  const localSrc = await readFile(new URL('../net/party/local.mjs', import.meta.url), 'utf8');
  t('W27b · the server clock walks the chain; gates can call the same function',
    /export function progressShow/.test(localSrc)
    && /function enterNextCasting/.test(localSrc)
    && /scheduleShowProgress\(room\)/.test(localSrc)
    && /function endRunOnMission/.test(localSrc));
  t('W27c · mission done still posts SMASHED and then schedules the walk, not a soft end',
    /setShow\(room, 'recap', RUN_END\.SMASHED\)/.test(localSrc)
    && /scheduleShowProgress\(room\)/.test(localSrc));
  t('W27d · CAUGHT is still reserved — hunter take is still the next slice',
    !/RUN_END\.CAUGHT/.test(localSrc));
  const hostSrc = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');
  /*
   * ⚠️ **REWRITTEN 2026-08-28 — this pinned a HAND-WRITTEN COPY of TALK_BEATS.** It asserted the
   * literal text `const onTalk = show === 'recap' || show === 'debrief'`, which locked in the
   * second table rather than the behaviour: `onRun` reads `onTalk`, and `hasPair` is still true at
   * the Verdict, so the first beat the copy had never heard of would have painted the expedition
   * over the Showrunner. It is derived now, and the assertion follows — plus the control that
   * `show.js` really does class every seated beat as one, so "derived" is not derived from a lie.
   */
  t('W27e · the host derives its seated beats from TALK_BEATS, and canLock looks at this pair',
    /const onTalk = show === 'recap' \|\| onStage;/.test(hostSrc)
    && !/const onTalk = show === 'recap' \|\| show === 'debrief'/.test(hostSrc)
    && ['debrief', 'reckoning', 'vote', 'execution', 'verdict', 'reunion'].every(isTalkBeat)
    && !isTalkBeat('recap') && !isTalkBeat('expedition') && !isTalkBeat('casting')
    && /!pair\.runner/.test(hostSrc)
    && /show === 'debrief'/.test(hostSrc));
  t('W27f · episode 2+ smashes the chapel catalog table-round, not a invented GLB',
    missionFor(1).target === 'painting' && missionFor(2).target === 'table-round'
      && missionFor(2).room === 'chapel'
      && missionFor(undefined).target === 'painting'
      && MISSION_TABLE.catalogId === 'table-round'
      && FURN_SMASH_ASSETS.some((a) => a.id === 'table-round' && a.file === 'rrr_prop_table-round_v1.glb')
      && CATALOG_ROOM_ASSIGN['table-round'].rooms[0] === 'chapel');
  const bedSrc = await readFile(new URL('../src/game/follow-bed.js', import.meta.url), 'utf8');
  t('W27g · the follow bed finds the dressed table-round and keeps the ep1 painting',
    /function findTableRound/.test(bedSrc)
    && /buildPainting\(gallery/.test(bedSrc)
    && /armMission/.test(bedSrc)
    && /missionFor/.test(bedSrc));
  t('W27h · beginCasting clears the last pair so episode 2 can ballot',
    /state\.pair = \{ runner: null, guide: null \}/.test(
      await readFile(new URL('../src/party/room.js', import.meta.url), 'utf8')));
}

// ---- W28 — LIVE LYNCH CLOCK: DEBRIEF → RECKONING → VOTE → EXECUTION → CASTING -------------
{
  const localSrc = await readFile(new URL('../net/party/local.mjs', import.meta.url), 'utf8');
  const hostSrc = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');
  const phoneSrc = await readFile(new URL('../src/views/party-phone.js', import.meta.url), 'utf8');
  const showSrc = await readFile(new URL('../src/party/show.js', import.meta.url), 'utf8');   // W28d3
  t('W28 · show fanout publishes until so clients can tick without inventing a clock',
    FANOUT_KEYS.show.includes('until') && FANOUT_KEYS.show.includes('beat'));
  t('W28a · noms/lynch are closed public side-channels, not state-frame secrets',
    FANOUT_KEYS.noms.includes('standing') && FANOUT_KEYS.lynch.includes('result')
      && FANOUT_KEYS.lynchVote.includes('voter') && FANOUT_KEYS.nomRow.includes('target'));
  t('W28b · the server clock walks Reckoning and Vote; nominations extend the window',
    /function enterReckoningLive/.test(localSrc)
    && /function enterVoteLive/.test(localSrc)
    && /function enterExecutionLive/.test(localSrc)
    && /function extendReckoning/.test(localSrc)
    && /msg\.t === 'nominate'/.test(localSrc)
    && /msg\.t === 'lynchVote'/.test(localSrc));
  t('W28c · TV debrief is a mini recap over the ballroom, not the full recap card',
    /function talkStage/.test(hostSrc)
    && /function recapMini/.test(hostSrc)
    && /function cueSitDown/.test(hostSrc)
    && /data-show-clock/.test(hostSrc)
    && !/No eviction this episode/.test(hostSrc));
  t('W28d · phones nominate and vote, and late debrief still opens the pick-list',
    /paintNominate/.test(phoneSrc)
    && /paintLynchVote/.test(phoneSrc)
    && /data-show-clock/.test(phoneSrc)
    && /t: 'nominate'/.test(phoneSrc)
    && /t: 'lynchVote'/.test(phoneSrc)
    && /Talk's ending — name someone/.test(phoneSrc));
  /*
   * 🚨 **"PHONES DOWN" IS GONE FROM THE TALK BEATS, AND THAT IS A PRODUCT DECISION.** John,
   * 2026-08-25: Debrief is a five-minute ceiling the room ends by tapping READY on the phone, so
   * an instruction to put the phone down sits directly beside the control that shortens the beat.
   * It cost every table four minutes of silence.
   *
   * This assertion is the shape John asked for — it locks the DECISION rather than a string. The
   * old W28d matched the literal `Phones down. Talk`, which is exactly the copy being removed, so
   * updating it in place would have quietly made the gate agree with whatever shipped.
   *
   * `recap` keeps its "Phones down. Debrief is next." — that beat is a ten-second card with
   * nothing to tap, which is the one place the instruction is still true.
   */
  {
    const talkFrom = phoneSrc.search(/beat === 'debrief'/);
    const talkTo = phoneSrc.search(/beat === 'vote'/);
    const talkRaw = talkFrom >= 0 && talkTo > talkFrom ? phoneSrc.slice(talkFrom, talkTo) : '';
    /*
     * ⚠️ COMMENTS STRIPPED BEFORE THE ABSENCE CHECK, AND THAT IS NOT FUSSINESS. The note in
     * `party-phone.js` explaining WHY "Phones down" was removed contains the phrase "Phones
     * down", so the first version of this assertion failed on the comment that documents the
     * fix. Any gate asserting copy is ABSENT has this trap: the removal note is the most likely
     * place the removed words still live.
     */
    const talkCode = talkRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    t('W28d2 · the Debrief sheet points at READY and no longer says phones down',
      talkCode.length > 0
      && /READY/.test(talkCode)
      && !/Phones down/i.test(talkCode)
      && /readyHtml\(c\)/.test(talkCode)
      && !/Phones down — talk/i.test(hostSrc),
      `${talkCode.length} chars of debrief/reckoning sheet scanned, comments stripped`);
    t('W28d3 · READY is a majority of the LIVING, a toggle, and one definition',
      /export function readyNeeded/.test(showSrc)
      && /Math\.floor\(n \/ 2\) \+ 1/.test(showSrc)
      && /export function readyMet/.test(showSrc)
      && /export const READY_BEATS = \['debrief', 'reckoning'\]/.test(showSrc)
      && /applyReady/.test(localSrc)
      && /livingSeatedIds\(room\)/.test(localSrc));
  }
  t('W28e · CAUGHT is still reserved — hunter take is still the next slice',
    !/RUN_END\.CAUGHT/.test(localSrc));
  const talkIdx = phoneSrc.search(/isTalkBeat\(beat\)/);
  const lobbyIdx = phoneSrc.search(/beat === 'lobby' \|\| phase === 'LOBBY'/);
  t('W28f · talk/lynch beats are matched before the lobby sheet',
    talkIdx >= 0 && lobbyIdx >= 0 && talkIdx < lobbyIdx,
    `talk@${talkIdx} lobby@${lobbyIdx}`);
  t('W28g · empty Reckoning hold is the timer path — progressShow still walks for gates',
    /export function expireShowHold/.test(localSrc)
    && /reckoningEmptyExtends/.test(localSrc)
    && /EMPTY_RECKONING_EXTEND_CAP/.test(localSrc)
    && /export function applyNominate/.test(localSrc));
  t('W28h · Reckoning buzzes the pad so a face-down phone wakes',
    /beat === 'reckoning'/.test(phoneSrc)
    && /padFx\('Reckoning\.'/.test(phoneSrc)
    && /\[0, 45, 55, 120\]/.test(phoneSrc));
  /*
   * W28i moved with the round-2 hierarchy pass (W37b). The concern is unchanged — an empty
   * Reckoning must not read as a silent skip — but the instruction no longer lives in the side
   * board's empty state, because that state was reserving a fifth of the television to duplicate
   * a sentence the kicker under the picture was already carrying. The kicker IS the instruction
   * now, and it is the one the room could always read; this asserts it is still on the beat.
   */
  t('W28i · the Reckoning still tells the room to nominate — from the kicker, not an empty board',
    /kicker: 'Nominate\. First tap stands\.', beat: 'reckoning'/.test(hostSrc));
  t('W28j · nominated players do not see themselves on the lynch ballot',
    /function paintLynchVote/.test(phoneSrc)
    && /n\.target !== me\.playerId/.test(phoneSrc));
}

// ---- W31 · BALLROOM DEBRIEF CAM + CHEST NAME TAGS ------------------------------------------
//
// Live playtest: intro/debrief lens sat on the visor; chair cam was locked; names floated off
// the face. Medium-wide + sweeping talk director + a plate under 4Humanity.
{
  const introSrc = await readFile(new URL('../src/game/intro-bed.js', import.meta.url), 'utf8');
  const hostSrc = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');
  const bedSrc = await readFile(new URL('../src/game/follow-bed.js', import.meta.url), 'utf8');
  const tagSrc = await readFile(new URL('../src/characters/chest-nameplate.js', import.meta.url), 'utf8');

  t('W31 · talk beats sit wider than intros, still under the run\'s 62°',
    TALK_FOV >= INTRO_FOV && TALK_FOV < 62 && TALK_FOV <= 60, `${TALK_FOV}°`);
  t('W31a · debrief sit cue is a talk intros, not a second visor walk-in',
    /function cueSitDown/.test(hostSrc)
    && /talk:\s*true/.test(hostSrc)
    && /talk: !!c\.talk/.test(bedSrc));
  t('W31b · intro-bed has a talk director with several named sweeping shots',
    /TALK_SHOTS/.test(introSrc)
    && /name: 'orbit'/.test(introSrc)
    && /name: 'across'/.test(introSrc)
    && /name: 'pair'/.test(introSrc)
    && /name: 'wide'/.test(introSrc)
    && /name: 'push'/.test(introSrc)
    && /function talkFrame/.test(introSrc)
    && /if \(talk\)/.test(introSrc));
  t('W31c · casting intros keep the snap-to-new-robot path; talk does not steal it',
    /if \(i !== focusI\)/.test(introSrc) && /INTRO_FOV/.test(introSrc)
    && /talking \? TALK_FOV : INTRO_FOV/.test(introSrc));
  t('W31d · intro robots wear a head billboard name, not a navy chest badge',
    /attachHeadNameTag/.test(introSrc)
    && /headName/.test(tagSrc)
    && /Sprite/.test(tagSrc)
    && /billboard/.test(tagSrc)
    && /#054E84/.test(tagSrc)
    && /#EDEFF0/.test(tagSrc));
  t('W31e · a live run still locks chase — talk does not widen FOLLOW_BEATS',
    liveRunShot('run') === 'chase'
    && liveRunShot('intros') === null
    && liveRunShot('warm') === null);
}

// ---- W32 · PLAYTEST: CHAIRS SOLID, CAMERA OUTSIDE, CIRCLE PERSISTS, HEAD NAMES -------------
//
// Live playtest after #39: robots walked through chairs; Casting/Recap blanked the 3D feed;
// the lens was still inside the ring; expedition despawned the sit circle; chest badges
// were the wrong name language.
{
  const introSrc = await readFile(new URL('../src/game/intro-bed.js', import.meta.url), 'utf8');
  const hostSrc = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');
  const bedSrc = await readFile(new URL('../src/game/follow-bed.js', import.meta.url), 'utf8');
  const tagSrc = await readFile(new URL('../src/characters/chest-nameplate.js', import.meta.url), 'utf8');
  const roomSrc = await readFile(new URL('../src/game/room.js', import.meta.url), 'utf8');

  t('W32 · the talk/intro eye sits outside the chair radius, not inside the ring',
    RING_OUT >= 2.8 && RING_OUT <= 4.2 && TALK_FOV >= 56, `${RING_OUT} m · ${TALK_FOV}°`);
  t('W32a · walk-in takes a tangent lane around the chair, and the chair is a collider',
    /const LANE = /.test(introSrc)
    && /function chairCollider/.test(introSrc)
    && /_noSight/.test(introSrc)
    && /space\.colliders\.push\(box\)/.test(introSrc)
    && /r\.via/.test(introSrc)
    && /c\._noSight/.test(roomSrc));
  // W32b moved with the casting redress (W36 below). Casting no longer runs through `talkStage`,
  // so `beat: 'casting'` and the `aside: ballotBoard` side column are gone with the rest of that
  // beat's chrome. The invariant this gate was actually protecting — casting and recap both sit
  // on the seated-circle picture rather than a black plate — is unchanged, and is what it still
  // asserts, now against `castStage`'s frame.
  t('W32b · Casting and Recap keep the seated-circle talk picture, not a black plate',
    /const onCircle = /.test(hostSrc)
    && /onRecap \|\| onCastPicture/.test(hostSrc)
    && /show === 'casting' && ui\.introsDone/.test(hostSrc)
    && /beat: 'recap'/.test(hostSrc)
    && /function castStage/.test(hostSrc)
    && /intro-frame talk-frame/.test(hostSrc));
  t('W32c · expedition hides the runner twin and keeps the chairs — it does not dispose the circle',
    /holdForRun/.test(bedSrc)
    && /intro\?\.holdForRun\?/.test(bedSrc)
    && /intro\?\.holdStep\?/.test(bedSrc)
    && /holdForRun\(runnerId\)/.test(introSrc)
    && /releaseRun\(\)/.test(introSrc)
    && /THE CIRCLE STAYS/.test(bedSrc));
  t('W32d · names are bigger head sprites that billboard toward the TV camera',
    /attachHeadNameTag/.test(introSrc)
    && /new THREE\.Sprite/.test(tagSrc)
    && /headName/.test(tagSrc)
    && /sizeAttenuation/.test(tagSrc)
    && /TAG_W = 0\.92/.test(tagSrc));
}

// ---- W26 · DUAL-STICK TV CHASE — no phone embed; look cue + camera-relative move ------------
//
// Playtest pivot: the phone is a pad (two sticks). The TV is the chase. #29's embed
// assertions are inverted on purpose — a later "helpfully put the mansion back on the
// phone" fails here.
{
  t('W26 · a live run locks the operator on chase',
    liveRunShot('run') === 'chase'
    && liveRunShot('run', null) === 'chase');
  t('W26a · warm and intros do not — they keep their own cameras',
    liveRunShot('warm') === null && liveRunShot('intros') === null);
  t('W26b · a typed ?shot= instrument still pins — host slots never emit one',
    liveRunShot('run', 'lead') === 'lead'
    && liveRunShot('run', 'shoulder') === 'shoulder'
    && liveRunShot('run', 'doorway') === 'doorway'
    && liveRunShot('run', 'leed') === 'chase');

  const fwd = (yaw) => [Math.sin(yaw), Math.cos(yaw)];
  const right = (yaw) => [-Math.cos(yaw), Math.sin(yaw)];
  const strafe = (x, y, yaw) => {
    const vx = Math.sin(yaw) * y - Math.cos(yaw) * x;
    const vz = Math.cos(yaw) * y + Math.sin(yaw) * x;
    return [vx, vz];
  };
  const near = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
  const norm = (v) => {
    const m = Math.hypot(v[0], v[1]) || 1;
    return [v[0] / m, v[1] / m];
  };

  t('W26c · stickCamMove keeps the thumb\'s direction and the deadzoned magnitude',
    stickCamMove(0, 0).x === 0 && stickCamMove(0, 0).y === 0
    && stickCamMove(0, 1).x === 0 && stickCamMove(0, 1).y === 1
    && stickCamMove(1, 0).x === 1 && stickCamMove(1, 0).y === 0
    && stickCamMove(STICK_DEADZONE, 0).x === 0
    && stickCamMove(0, STICK_DEADZONE).y === 0);

  const up = stickCamMove(0, 1);
  const left = stickCamMove(-1, 0);
  t('W26d · push up at any chase yaw walks where the lens points (player.js strafe)',
    [[0], [0.4], [Math.PI / 2], [Math.PI], [-1.1]].every(([yaw]) => (
      near(norm(strafe(up.x, up.y, yaw)), fwd(yaw))
    )));
  t('W26e · push left strafes along the lens\' left, not a heading latch',
    [[0], [0.7], [Math.PI / 2]].every(([yaw]) => (
      near(norm(strafe(left.x, left.y, yaw)), [-right(yaw)[0], -right(yaw)[1]])
    )));
  t('W26f · lookYaw is the house yaw of a flattened look direction',
    lookYaw(0, 1) === 0
    && Math.abs(lookYaw(1, 0) - Math.PI / 2) < 1e-9
    && Math.abs(Math.abs(lookYaw(0, -1)) - Math.PI) < 1e-9);

  const bedSrc = await readFile(new URL('../src/game/follow-bed.js', import.meta.url), 'utf8');
  const phoneSrc = await readFile(new URL('../src/views/party-phone.js', import.meta.url), 'utf8');
  const followSrc = await readFile(new URL('../src/party/follow.js', import.meta.url), 'utf8');
  const hostSrc = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');
  const localSrc = await readFile(new URL('../net/party/local.mjs', import.meta.url), 'utf8');
  t('W26g · the bed drives with stickCamMove + the operator basis, not heading+forward-only',
    /stickCamMove\(/.test(bedSrc)
    && /operator\.basisYaw\(/.test(bedSrc)
    && /liveRunShot\(/.test(bedSrc)
    && !/perf\.stickRef/.test(bedSrc)
    && !/move: \{ x: 0, y: mag \}/.test(bedSrc));
  /*
   * ⚠️ **THE RULE IS UNCHANGED; THE FUNCTION THAT ENFORCES IT MOVED.** A live run still refuses a
   * mid-run cut to shoulder / lead / doorway — those invert a camera-relative stick and take the
   * runner's eyes off the frame their thumb is steering. What CAN now arrive mid-run is a
   * PERSPECTIVE (chase / wide / iso / top), which is the player choosing how the game is viewed
   * rather than a director cutting away from them. `runPerspective` is that distinction, and the
   * assertion is on the behaviour rather than on the old call shape — `party-follow` F11e drives
   * the real function with every input, which a grep cannot.
   */
  t('W26h · a live run refuses mid-run production cuts to shoulder / lead / doorway',
    /liveRunShot\(mode, opts\.pinShot\) === 'chase'\) return/.test(bedSrc)
    && /lockShot: want/.test(bedSrc)
    && /const want = runPerspective\(mode, opts\.pinShot, perf\.perspective\)/.test(bedSrc)
    && /if \(PERSPECTIVES\.includes\(c\.shot\)\) \{ perf\.perspective = c\.shot; perf\.pinned = true; return; \}/.test(bedSrc)
    && /until = 1e9/.test(bedSrc));
  /*
   * 🚪 **AND THE EXPEDITION NOW PICKS ITS OWN CAMERA, WITH `P` AS AN OVERRIDE THAT EXPIRES.**
   * John: *"each expedition takes place outside the ball room… it's top down perspective."* So
   * two authorities write `perf.perspective` and they need a rule rather than a race: the
   * ballroom threshold writes it on a crossing and clears any pin, the dev key writes it and
   * raises one. That keeps `P` usable for inspecting ceiling art in play (`ballroom-next.md`)
   * without letting it strand the show in a perspective the expedition never asked for.
   */
  t('W26h3 · the ballroom threshold owns the camera, and a crossing takes it back from `P`',
    /const loopWant = stepBallroomView\(perf\.loopView, runner\.pos, ballroom\);/.test(bedSrc)
    && /perf\.pinned = false;\s+\/\/ a crossing is the loop taking its camera back/.test(bedSrc)
    && /\} else if \(!perf\.pinned\) \{/.test(bedSrc));
  t('W26h2 control · and a director shot can still never be held on a run unless it was TYPED',
    ['shoulder', 'lead', 'doorway'].every((s) => runPerspective('run', null, s) === 'chase')
      && runPerspective('run', 'shoulder', null) === 'shoulder',
    'only ?shot= pins a director shot');
  t('W26i · the runner phone is a pad — no chase embed, eyes on the TV',
    !/warmUrl\(/.test(phoneSrc)
    && !/runner-chase-layer/.test(phoneSrc)
    && !/sendChaseCue/.test(phoneSrc)
    && /id="stick"/.test(phoneSrc)
    && /id="stick-look"/.test(phoneSrc)
    && /Eyes on the TV/.test(phoneSrc));
  /*
   * 🎥 **AND THE PAD HAS TWO SHAPES NOW, so asserting that the source CONTAINS a look stick is
   * no longer the same as asserting the player gets one.** Both branches live in this file, so a
   * grep for `id="stick-look"` passes whatever the top-down sheet actually renders. What has to
   * hold is the CONDITION: the look stick is inside a `topDown ? '' : ...` arm, the copy differs
   * between the two, and the camera is in the repaint key or the pad would keep the wrong shape
   * for the rest of the night.
   */
  t('W26i2 · under a plan-locked top-down the look stick is not rendered at all',
    /const topDown = camView === 'top' \|\| camView === 'iso';/.test(phoneSrc)
    && /\$\{topDown \? '' : `<div class="stick-col">\s*\n\s*<div class="stick stick-look"/.test(phoneSrc)
    && /The stick is the room — push where you want to go/.test(phoneSrc));
  t('W26i3 · and the camera is part of the sheet\'s repaint key, so it re-shapes on the crossing',
    /const camStamp = iAmRunner \? `:\$\{frame\?\.you\?\.view \|\| 'chase'\}` : '';/.test(phoneSrc)
    && /\$\{hasCard\(\) \? 'card' : 'nocard'\}\$\{camStamp\}/.test(phoneSrc));
  t('W26i4 · the phone learns the camera from its own seat only — never from the TV',
    /frame\?\.you\?\.view/.test(phoneSrc));
  t('W26j · the guide path is still the map — chase is not mounted on that sheet',
    /guideMapSvg\(/.test(phoneSrc)
    && /iAmGuide/.test(phoneSrc)
    && /The map is yours/.test(phoneSrc)
    && !/guideMapSvg/.test(followSrc));

  const rest = stepLookOrbit(0, 0, 0, 0, 0.16);
  const lookRight = stepLookOrbit(0, 0, 1, 0, 1);
  const lookUp = stepLookOrbit(0, 0, 0, 1, 1);
  const held = stepLookOrbit(0.4, 0.1, 0, 0, 0.5);
  t('W26k · a centred look stick does not drift the orbit',
    Math.abs(rest.yaw) < 1e-12 && Math.abs(rest.pitch) < 1e-12);
  t('W26l · look right decreases house yaw; look up raises pitch',
    lookRight.yaw < 0 && lookUp.pitch > 0);
  t('W26m · releasing the look stick holds the orbit — no auto-recenter',
    Math.abs(held.yaw - 0.4) < 1e-12 && Math.abs(held.pitch - 0.1) < 1e-12);
  t('W26n · pitch is clamped',
    stepLookOrbit(0, LOOK_PITCH_MAX, 0, 1, 1).pitch === LOOK_PITCH_MAX
    && stepLookOrbit(0, LOOK_PITCH_MIN, 0, -1, 1).pitch === LOOK_PITCH_MIN);

  const behind = chaseOrbitOffset(0, 0);
  t('W26o · pitch 0 is the shipped chase — behind on −Z, 1.62 high, 0.35 right',
    Math.abs(behind.z + 2.90) < 1e-9
    && Math.abs(behind.y - 1.62) < 1e-9
    && Math.abs(behind.x + 0.35) < 1e-9);
  t('W26p · the bed applies look via stepLookOrbit / chaseOrbitOffset, not a heading latch',
    /stepLookOrbit\(/.test(bedSrc)
    && /chaseOrbitOffset\(/.test(bedSrc)
    && /lookX: perf\.look\.x/.test(bedSrc)
    && /lookY: perf\.look\.y/.test(bedSrc)
    && !/stickY > 0\.20/.test(bedSrc));
  t('W26q · lookX/lookY survive the phone → TV → cue path, not a second kind',
    /lookX: Math\.round\(p\.lookX/.test(phoneSrc)
    && /lookX: \+m\.lookX/.test(hostSrc)
    && /lookX: \+msg\.lookX/.test(localSrc)
    && !/kind: 'look'/.test(followSrc));
  t('W26r · a driven look release holds — followFacing is only the undriven fallback',
    /followFacing: !perf\.driven/.test(bedSrc));
}

// ---- W29 · PRIME TIME SHOW CHROME — one language, not host inline soup ----------------------
//
// Hypothesis: host chrome was fragmented across party-host.js inline styles. The chase overlay
// is the look. Tokens and HTML builders live in look.js; night-skin interpolates the CSS.
{
  const hex = SHOW_CHROME_CSS.match(/#[0-9a-f]{3,8}\b/gi) || [];
  t('W29 · show chrome CSS holds no hex of its own', hex.length === 0, hex.join(',') || 'no literals');

  const colours = SHOW_CHROME_CSS.match(/rgba?\([^)]*\)/gi) || [];
  const notNamed = colours.filter((c) =>
    !/^rgba?\(\s*0\s*,\s*0\s*,\s*0\s*[,)]/i.test(c)
    && !/^rgba?\(\s*var\(--night-[a-z-]+-rgb\)/i.test(c));
  t('W29a · literal colours are black or a palette rgb token — plate, matte, shadow',
    notNamed.length === 0, notNamed.join(',') || `${colours.length} fills`);

  const used = [...new Set([...SHOW_CHROME_CSS.matchAll(/var\((--[a-z-]+)/g)].map((m) => m[1]))];
  const orphans = used.filter((n) => !isNightToken(n));
  t('W29b · every variable it reaches for is a palette name',
    used.length >= 4 && orphans.length === 0, orphans.join(',') || `${used.length} tokens`);

  t('W29c · no backticks in the chrome CSS string — that terminates the night-skin template',
    !SHOW_CHROME_CSS.includes('`'));

  const skin = await readFile(new URL('../src/party/night-skin.js', import.meta.url), 'utf8');
  t('W29d · night-skin interpolates SHOW_CHROME_CSS rather than restating the rules',
    /\$\{SHOW_CHROME_CSS\}/.test(skin));

  const hostSrc = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');
  const phoneSrc = await readFile(new URL('../src/views/party-phone.js', import.meta.url), 'utf8');
  t('W29e · the host paints from the shared builders, not a second set of inline plates',
    /titlePlateHtml\(/.test(hostSrc)
    && /codeBugHtml\(/.test(hostSrc)
    && /recBugHtml\(/.test(hostSrc)
    && /nameplateHtml\(/.test(hostSrc)
    && /countdownHtml\(/.test(hostSrc)
    && /verdictPlateHtml\(/.test(hostSrc)
    && /rundownRailHtml\(/.test(hostSrc));
  t('W29f · lobby still exposes .night-code and the QR — the join is the picture',
    /night-code/.test(codeBugHtml({ code: 'RB42' }))
    && /night-qr/.test(hostSrc) && /qrSvg\(/.test(hostSrc));
  t('W29g · the join URL is a class, not a one-off style attribute',
    /night-url/.test(codeBugHtml({ code: 'RB42', url: 'http://x' }))
    && !/style="margin-top:14px;letter-spacing:\.03em/.test(hostSrc)
    && !/style="margin-top:16px"/.test(hostSrc));
  t('W29h · expedition chrome still never mounts a guide map on the TV',
    !/guideMapSvg/.test(hostSrc) && !/GUIDE_MAP/.test(hostSrc));
  t('W29i · phones keep Jackbox-scale nominate / lynch lists and still hide self',
    /pick-list jackbox/.test(phoneSrc)
    && /n\.target !== me\.playerId/.test(phoneSrc)
    && /choice === meId\(\)/.test(phoneSrc));
  t('W29j · a nameplate and a verdict plate actually emit the show words',
    nameplateHtml({ name: 'Ellie', sub: 'live · expedition' }).includes('Ellie')
    && nameplateHtml({ name: 'Ellie', sub: 'live · expedition' }).includes('live · expedition')
    && verdictPlateHtml({ line: 'Ellie is out. Ozz swings.' }).includes('VERDICT READY')
    && recBugHtml({ cam: showCam('lobby') }).includes(SHOW_CAM.lobby)
    && titlePlateHtml().includes(SHOW_TITLE)
    && titlePlateHtml().includes(SHOW_LINE)
    && codeBugHtml({ code: 'RB42', url: 'http://x' }).includes('RB42')
    && showCam('expedition') === 'RRR CAM 01');
}

// ---- W30 · DIRECTION B RUNDOWN RAIL — the shooting schedule on the TV -------------------
//
// Claude Code /design locked B. phases.js / live SHOW beats ARE the schedule. Current beat
// lights; its bar drains with show.until. Expedition is a 22px ribbon; lobby + talk open up.
{
  const hostSrc = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');
  t('W30 · the rail is lobby plus phases.js EPISODE_ORDER — not a second table',
    RUNDOWN_BEATS.join(',') === 'lobby,casting,expedition,recap,debrief,reckoning,vote,execution,verdict'
      && RUNDOWN_BEATS[0] === 'lobby'
      && RUNDOWN_BEATS.includes('verdict')
      && !RUNDOWN_BEATS.includes('reunion')
      /* ⚠️ INVERTED 2026-08-28. This read `!SHOW_BEATS.includes('verdict')` and that was the
         gate FOR the stub — the chip was grey because no beat lit it. Verdict is on the wire
         now, so the rail lights it with no change to `rundownRailHtml` at all: `live` is
         `SHOW_BEATS.includes(id)`. The Reunion stays OFF the rail on purpose — the rundown is
         one EPISODE's schedule, and the Reunion is what happens when there are no more. */
      && SHOW_BEATS.includes('verdict'));

  const lobby = rundownRailHtml({ beat: 'lobby' });
  const debrief = rundownRailHtml({ beat: 'debrief' });
  const chase = rundownRailHtml({ beat: 'expedition', ribbon: true });
  t('W30a · every night beat is drawn, and the live SHOW beat is the one that is on',
    RUNDOWN_BEATS.every((id) => lobby.includes(`data-rail-seg="${id}"`))
      && lobby.includes('aria-current="step"')
      && /data-rail-seg="lobby"[^>]*aria-current="step"/.test(lobby)
      && /data-rail-seg="debrief"[^>]*aria-current="step"/.test(debrief)
      && /data-beat="expedition"/.test(chase));

  t('W30b · expedition / chase is a 22px ribbon; lobby and talk stay open',
    rundownRibbon('expedition') && !rundownRibbon('debrief') && !rundownRibbon('lobby')
      && chase.includes('show-rail ribbon')
      && lobby.includes('show-rail open')
      && debrief.includes('show-rail open')
      && /height:22px/.test(SHOW_CHROME_CSS));

  const now = 1_700_000_000_000;
  const hold = holdMsFor('debrief');
  const mid = rundownRailHtml({ beat: 'debrief', until: now + hold / 2, holdMs: hold, now });
  t('W30c · the current bar drains from show.until when a hold is known',
    hold === DEBRIEF_HOLD_MS
      && railDrainPct(now + hold, hold, now) === 100
      && railDrainPct(now + hold / 2, hold, now) === 50
      && railDrainPct(now, hold, now) === 0
      && /data-rail-drain/.test(mid)
      && /style="width:50%"/.test(mid));

  t('W30d · no until means a full current fill — remainingMs(null) still paints no fake 0s clock',
    remainingMs(null) === null && remainingMs('') === null
      && railDrainPct(null, hold, now) === null
      && /style="width:100%"/.test(lobby)
      && !/data-show-clock/.test(lobby));

  t('W30e · the TV host paints the rail on lobby, the chase, and the talk beats',
    /rundownRailHtml\(/.test(hostSrc)
    && /holdMsFor\(show/.test(hostSrc)
    && /rundownRibbon\(show\)/.test(hostSrc)
    && /data-rail-drain/.test(hostSrc)
    && /ON AIR/.test(hostSrc));

  /*
   * ⚠️ **INVERTED 2026-08-28 — the grey chip lights.** `stub` is the rail's word for "on the
   * schedule, but nothing on the wire ever reaches it", and Verdict wore it from the day the rail
   * shipped. It is now `next` from the lobby like every other beat ahead of the playhead. The
   * control half of this — that NOTHING is a stub any more — is deliberately asserted too: if a
   * future beat is drawn on the rail before it is wired, this fails and says so.
   */
  t('W30f · guide map is still never on the TV, and the verdict chip is no longer a stub',
    !/guideMapSvg/.test(hostSrc) && !/GUIDE_MAP/.test(hostSrc)
      && lobby.includes('class="show-rail-seg next" data-rail-seg="verdict"')
      && !lobby.includes('show-rail-seg stub')
      && debrief.includes('class="show-rail-seg on" data-rail-seg="debrief"'));

  t('W30g · rail CSS stays inside the shared chrome string — tokens, no hex, no backticks',
    /data-show-rail/.test(lobby)
      && SHOW_CHROME_CSS.includes('.show-rail')
      && !SHOW_CHROME_CSS.includes('`')
      && !(SHOW_CHROME_CSS.match(/#[0-9a-f]{3,8}\b/gi) || []).length);
}

// ---- W31 · COMPACT RECAP + TALK SAFE ZONES ----------------------------------------------
//
// Live playtest: recap scrolled on the TV; talk plates sat in the ballroom well and the
// seated chairs (z-index 5 follow layer) covered them. Recap is a lower-third strip.
// Talk chrome is reserved bands around the picture, not an overlay on it.
{
  const hostSrc = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');
  const skin = await readFile(new URL('../src/party/night-skin.js', import.meta.url), 'utf8');

  /*
   * ⚠️ **THIS GATE USED TO PASS ON A FUNCTION NOBODY CALLED.** It asserted `function recapBoard`
   * existed and that its CSS was compact — both true, for four rounds, while `show === 'recap'`
   * rendered `talkStage` and the four facts never reached a television. A play critic photographed
   * the Recap from sofa distance and found the outcome of the expedition in two 13px chips.
   *
   * So the shape assertion now has a CALL SITE assertion beside it, which is the thing that was
   * actually missing. `recapBoard` is gone: its own `countdownHtml` head was the second clock on
   * a screen that already had one (D8), so the facts moved into the talk chrome instead.
   */
  t('W31 · recap is a compact no-scroll lower-third, not stacked 84px cards',
    /function recapFacts/.test(hostSrc)
      && /recap talk-facts/.test(hostSrc)
      && /on-recap/.test(hostSrc)
      && /onRecap \? ' on-recap'/.test(hostSrc)
      && /grid-template-columns:repeat\(auto-fit, minmax\(140px, 1fr\)\)/.test(SHOW_CHROME_CSS)
      && !/clamp\(40px, 8vw, 84px\)/.test(skin)
      && !/clamp\(56px, 12vw, 120px\)/.test(SHOW_CHROME_CSS)
      && !/clamp\(40px, 8vw, 84px\)/.test(SHOW_CHROME_CSS));

  t('W31e · and the recap facts are actually CALLED on the recap beat',
    /facts: recapFacts\(recap, names, ui\.runEnd\)/.test(hostSrc)
      && /aside, facts,/.test(hostSrc)
      && /\$\{facts \|\| ''\}/.test(hostSrc)
      && !/function recapBoard/.test(hostSrc));

  /*
   * The strapline suppression list GROWS — `onCards` joined it when the role-card window stopped
   * printing SHOW_LINE directly above its own kicker, where the two competed. So this asserts
   * the terms the recap needs are in the list rather than pinning the list's exact shape; the
   * `!/onCards/` half of that would just be a spelling test on a growing list.
   */
  t('W31a · recap hides the show line and locks night-main to one viewport',
    /onRun \|\| onStage \|\| onRecap \|\|[^?]*show === 'lobby'/.test(hostSrc)
      && /\.night\.on-talk \.night-main, \.night\.on-recap \.night-main \{ padding:0 16px 10px; overflow:hidden/.test(skin)
      && /\.night\.on-talk \.night-line, \.night\.on-recap \.night-line \{ display:none/.test(skin));

  t('W31b · talk chrome sits in reserved bands outside the ballroom frame',
    /talk-chrome-top/.test(hostSrc)
      && /talk-chrome-bot/.test(hostSrc)
      && /talk-well/.test(hostSrc)
      && /talk-side/.test(hostSrc)
      && /talk-picture/.test(hostSrc)
      && /intro-frame talk-frame/.test(hostSrc)
      && !/talk-overlay/.test(hostSrc)
      && !/\.talk-overlay \{/.test(skin)
      && /\.night\.on-talk \.intro-frame\.talk-frame \{ height:100%/.test(skin));

  t('W31c · noms / tallies / verdict stay on the shared builders, not a second overlay language',
    /verdictPlateHtml\(/.test(hostSrc)
      && /nameplateHtml\(/.test(hostSrc)
      && /countdownHtml\(/.test(hostSrc)
      && /rundownRailHtml\(/.test(hostSrc)
      && SHOW_CHROME_CSS.includes('.talk-chrome-top')
      && SHOW_CHROME_CSS.includes('.talk-side')
      && SHOW_CHROME_CSS.includes('.show-verdict')
      && !SHOW_CHROME_CSS.includes('`'));

  t('W31d · guide map is still never on the TV',
    !/guideMapSvg/.test(hostSrc) && !/GUIDE_MAP/.test(hostSrc));
}

// ---- W33 · PLAYTEST ASKS: SIT, RUG, CAMERAMAN, BANG, CRISP TAGS, NOMINATOR VOTE -------------
{
  const introSrc = await readFile(new URL('../src/game/intro-bed.js', import.meta.url), 'utf8');
  const tagSrc = await readFile(new URL('../src/characters/chest-nameplate.js', import.meta.url), 'utf8');
  const voteSrc = await readFile(new URL('../src/party/vote.js', import.meta.url), 'utf8');
  const roomSrc = await readFile(new URL('../src/party/room.js', import.meta.url), 'utf8');
  const phoneSrc = await readFile(new URL('../src/views/party-phone.js', import.meta.url), 'utf8');
  const hostSrc = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');
  const bedSrc = await readFile(new URL('../src/game/follow-bed.js', import.meta.url), 'utf8');
  // W33k-n · the caption layer. See the block header beside those assertions.
  const pipeSrc = await readFile(new URL('../src/post/pipeline.js', import.meta.url), 'utf8');
  const capSrc = await readFile(new URL('../src/core/caption-layer.js', import.meta.url), 'utf8');
  const playerSrc = await readFile(new URL('../src/game/player.js', import.meta.url), 'utf8');

  t('W33 · sit attach parks the root in the chair and locks collision',
    /function parkSit/.test(introSrc)
    && /sitLock/.test(playerSrc)
    && /playSit/.test(introSrc)
    && /Chair_Sit_Idle/.test(await readFile(new URL('../src/characters/mesh-avatar.js', import.meta.url), 'utf8')));
  t('W33a · seated idles are the Meshy allow-list, phase-offset per seat',
    SIT_IDLE_CLIPS.includes('Chair_Sit_Idle_M')
    && SIT_CLIP_ALLOW.includes('Stand_to_Sit_Transition_M')
    && /sitPhase/.test(introSrc)
    && /holdForRun/.test(introSrc));
  t('W33b · name tags are a no-mip nearest-neighbour atlas, STYLE_CONTRACT colours, black glyph outline',
    /generateMipmaps = false/.test(tagSrc)
    && /NearestFilter/.test(tagSrc)
    && /strokeText/.test(tagSrc)
    && /#054E84/.test(tagSrc) && /#EDEFF0/.test(tagSrc) && /#B9BEC2/.test(tagSrc)
    && /GLYPH_OUTLINE/.test(tagSrc) && /#000000/.test(tagSrc)
    && /TAG_REF_DIST/.test(tagSrc) && /NAME_CAP = 8/.test(tagSrc));
  /*
   * ---------------------------------------------------------------------------------------
   * W33k-n · A NAME TAG IS A CAPTION, NOT SCENERY.
   * ---------------------------------------------------------------------------------------
   * John, playing a live vote: *"the lack of lighting in the other room is occluding the name
   * tag."* Measured by `harness/nametag-legibility.mjs` on six seated robots in ONE frame: the
   * composite's distance haze ate 20-23% of every tag's white glyphs and 38% of the one sitting
   * in front of the open dark archway — while its neighbour at the SAME distance lost 23%.
   * Distance never explained it. The tag is a `depthWrite:false` sprite, so it writes nothing
   * into the depth buffer and the haze block faded each tag by the depth of whatever stood
   * BEHIND it. The locked rule — *"must stay legible at low quality and distance"* — cannot be
   * satisfied while a caption lives inside a depth-driven fog.
   *
   * ⚠️ W33b IS NOT THIS CHECK AND NEVER WAS. It asserts how the tag ATLAS is built: no mips,
   * nearest filter, black glyph outline, the STYLE_CONTRACT colours. Every one of those was
   * green in the frame John photographed. A texture check cannot see the pixels that reach the
   * television, which is why this class of bug survived to a live playtest.
   *
   * These four are the WIRING, cheap enough to live in `gates:party`. The pixels themselves
   * need a browser and a warmed mansion, so they are `npm run gate:nametag` — N3 (fog cannot
   * change a tag), N4 (every tag in one frame reads the same) and N5 (the room is still there).
   */
  t('W33k · head tags and nominee bangs are on the caption layer, out of the graded pass',
    /import \{ CAPTION_LAYER, captionAdded \} from '\.\.\/core\/caption-layer\.js'/.test(tagSrc)
    && /function captionLayer\(sprite\)/.test(tagSrc)
    && /sprite\.layers\.set\(CAPTION_LAYER\)/.test(tagSrc)
    && (tagSrc.match(/captionLayer\(sprite\);/g) || []).length >= 2);
  t('W33l · the pipeline draws that layer AFTER the AA blit, not inside the grade',
    pipeSrc.indexOf('captionCount() > 0') > pipeSrc.indexOf('this.aaPass.render(r, null)')
    && /cam\.layers\.set\(this\.overlayLayer\)/.test(pipeSrc)
    && /r\.clearDepth\(\)/.test(pipeSrc));
  /*
   * W33m is a scar. The first version of the overlay pass kept `scene.background`, and three's
   * WebGLBackground sets `forceClear` for a Color or Texture background and clears the colour
   * buffer REGARDLESS of `autoClear = false`. The result was six perfect captions on a
   * completely black screen — every glyph measurement flawless, the entire graded ballroom
   * gone. Deleting these two lines brings that back.
   */
  t('W33m · and nulls scene.background first — forceClear would wipe the graded frame',
    /this\.scene\.background = null;/.test(pipeSrc)
    && /this\.scene\.background = bg;/.test(pipeSrc));
  t('W33n · the overlay pass is skipped when no captions exist — the survival game pays nothing',
    /captionCount\(\) > 0/.test(pipeSrc)
    && /export function captionCount/.test(capSrc)
    && /export function captionRemoved/.test(capSrc)
    && /captionRemoved\(\)/.test(introSrc));
  t('W33c · nominators are pre-cast and cannot recast',
    /function assumedLynchVotes/.test(voteSrc)
    && /nominator vote locked/.test(roomSrc)
    && /Your nomination of/.test(phoneSrc)
    && /You do not vote again/.test(phoneSrc));
  t('W33d · the ballroom rug radius is 1.40 × the live chair radius',
    rugSpanForSeats(4.96) > 8
    && Math.abs(rugSpanForSeats(4.96) - 2 * 4.96 * 1.40) < 1e-9
    && rugSpanForSeats(2.4) >= 2.4
    && /rugScaleForSeats/.test(introSrc)
    && /scaleBallroomRug/.test(introSrc));
  t('W33e · talk camera walks the outside arc at human speed, looking at robots not empty parquet',
    /function walkCamOnRing/.test(introSrc)
    && /CAM_WALK = 1\.35/.test(introSrc)
    && /WIDE_Y = 2\.28/.test(introSrc)
    && /posOf\(a\)/.test(introSrc)
    && /name: 'push'/.test(introSrc)
    && !/look\.set\(cx, LOOK_Y, cz\)/.test(introSrc)
    && /RING_OUT/.test(introSrc));
  t('W33f · a red billboard bang sits above the name tag for standing nominees',
    /attachNomineeBang/.test(introSrc)
    && /nomBang/.test(tagSrc)
    && /BANG_RED/.test(tagSrc)
    && /kind === 'noms'/.test(bedSrc)
    && /function cueNominees/.test(hostSrc));
  t('W33g · chairs still collide, persist through the run, and grip lock is untouched',
    /function chairCollider/.test(introSrc)
    && /holdForRun/.test(introSrc)
    && /THE CIRCLE STAYS/.test(bedSrc)
    && seatCircleRadius(8) <= 5.0);
  // Casting walk-in died with `ReferenceError: mv is not defined` once sitLock went true:
  // PR #42 declared mv/mlen inside the sitLock else, then `_targetFacing(mv, mlen, caps)`
  // ran anyway. Stick must be in scope for the whole update, including the sit path.
  const updStart = playerSrc.indexOf('update(dt, t, input');
  const facingAt = playerSrc.indexOf('this._targetFacing(mv, mlen, caps)', updStart);
  const upd = facingAt > updStart ? playerSrc.slice(updStart, facingAt) : '';
  const mvAt = upd.indexOf('const mv = input.move');
  const mlenAt = upd.indexOf('let mlen = Math.hypot');
  const sitAt = upd.indexOf('if (this.sitLock)');
  t('W33h · sitLock update declares mv/mlen before the lock, so facing cannot TDZ',
    updStart >= 0 && facingAt > updStart
    && mvAt >= 0 && mlenAt >= 0 && sitAt > mlenAt && mvAt < sitAt);
  t('W33i · bangs only arm on Reckoning/Vote — Casting sends an empty standing list',
    /const live = show === 'reckoning' \|\| show === 'vote'/.test(hostSrc)
    && /intro\?\.setNominees\?\.\(\[\]\)/.test(bedSrc));
  t('W33j · sitLock pins the model so gait offset cannot unseat the clip',
    /if \(this\.sitLock\) \{[\s\S]*?this\.model\.position\.set\(0, 0, 0\)/.test(playerSrc)
    && /sitIdle = sitIdleM \|\| sitIdleF/.test(await readFile(new URL('../src/characters/mesh-avatar.js', import.meta.url), 'utf8')));
  /*
   * John, room DUSK: two accusers clipped then it cut. The nominator already swings in
   * `executioner()`; Execution was sending an empty `noms` cue and sitting everyone down.
   * W33o is the picture: that nominator stands, walks the inner ring, swings the existing
   * sledge. Showrunner is a hold on the accused, not a ninth robot. Grip lock untouched.
   */
  const meshSrc = await readFile(new URL('../src/characters/mesh-avatar.js', import.meta.url), 'utf8');
  const stageSrc = await readFile(new URL('../src/game/accusation-stage.js', import.meta.url), 'utf8');
  t('W33o · Execution stages the nominator — stand, walk, sledge — or a Showrunner hold',
    /function cueExecute/.test(hostSrc)
    && /kind === 'execute'/.test(bedSrc)
    && /setExecute\(/.test(introSrc)
    && /function planExecute/.test(stageSrc)
    && /playLoco/.test(introSrc)
    && /dropChair/.test(introSrc)
    && /fillExecuteEye/.test(introSrc)
    && /SHOWRUNNER/.test(introSrc)
    && /mountProp\(obj/.test(meshSrc)
    && /playAttack\(dur/.test(meshSrc)
    && /GRIP_MOUNT/.test(meshSrc)
    && !/god-view|setLid\(false\)/.test(introSrc.slice(introSrc.indexOf('function fillExecuteEye'))));
  /*
   * John, room DUSK, closed mid-debrief: chairs AND robots gone, then the empty-room
   * lobby dolly. Two holes: a talk intros with a drifted id-list disposed the bed,
   * and idle with intro=null flipped mode to warm. Sit was latched once and never
   * retried on follow `ready`.
   */
  t('W33p · a second talk intros during debrief does not dispose the circle',
    /have === ids \|\| c\.talk/.test(bedSrc)
    && /A TALK SIT NEVER DISPOSES/.test(bedSrc)
    && /if\s*\(\s*!c\.talk\s*\)\s*intro\?\.dispose\(\)/.test(bedSrc)
    && /intro\.releaseRun/.test(bedSrc)
    && /intro\.setTalk/.test(bedSrc));
  t('W33q · talk plates look at robot bodies, never the empty rug centre',
    /WIDE_Y = 2\.28/.test(introSrc)
    && /name: 'wide'/.test(introSrc)
    && /name: 'push'/.test(introSrc)
    && /posOf\(a\)/.test(introSrc)
    && /posOf\(far\)/.test(introSrc)
    && !/look\.set\(cx, LOOK_Y, cz\)/.test(introSrc));
  t('W33r · idle with no intro rebuilds the seated circle, it does not fall into warm',
    /IDLE IS "SIT THE RUNNER BACK DOWN"/.test(bedSrc)
    && /introCast\.length/.test(bedSrc)
    && /talk: true/.test(bedSrc)
    && /mode = intro \? 'intros' : 'warm'/.test(bedSrc));
  t('W33s · the TV retries sit on follow ready, same shape as cueRun',
    /function shouldSit/.test(hostSrc)
    && /cueSitDown\(\{ retry: true \}\)/.test(hostSrc)
    && /if \(show === 'expedition'\) ui\.sitCued = false/.test(hostSrc)
    && /talk:\s*true/.test(hostSrc));
  /*
   * John, 29 Aug, LastLook board. The walk-up already existed. The HIT did not:
   * Attack chopped the floor, Sit_Dodge sat back at t=2s, the chair instance
   * never toppled, and C was not a picture. W33t is that picture: sledge head
   * on the seated torso, limp/damaged victim, loose chair, B (or A) as the
   * main lens, C live then hard-cut gone.
   */
  const hitSrc = await readFile(new URL('../src/game/execute-hit.js', import.meta.url), 'utf8');
  const chromeSrc = await readFile(new URL('../src/party/follow.js', import.meta.url), 'utf8');
  const viewSrc = await readFile(new URL('../src/views/party-follow.js', import.meta.url), 'utf8');
  /*
   * ⚠️ The empty-body ban is scoped to `cloneMeshAvatar`, not the whole file.
   * A historical note that literally wrote `setLimbVisible() {}` in a comment
   * made W33t red on 43e9034 while both real implementations were already
   * `setLimbVisible(socket, visible)`. A comment is not a stub.
   */
  const cloneFn = meshSrc.slice(meshSrc.indexOf('export function cloneMeshAvatar'));
  t('W33t · Execution hit — retarget, wreck, loose chair, last-look C, camera B/A',
    /function retargetSledge/.test(introSrc)
    && /function beginHit/.test(introSrc)
    && /function breakChairOut/.test(introSrc)
    && /function fillExecuteB/.test(introSrc)
    && /lastLook\(\)/.test(introSrc)
    && /HIT_CONTACT = 0\.381/.test(hitSrc)
    && /THEIR EYES/.test(chromeSrc)
    && /setScissorTest\(true\)/.test(viewSrc)
    && /lastLook: \(\) => intro\?\.lastLook/.test(bedSrc)
    && /setLimbVisible\(socket, visible\)/.test(cloneFn)
    && !/^\s*setLimbVisible\(\) \{\s*\}/m.test(cloneFn)
    && !/settleClip/.test(introSrc.slice(introSrc.indexOf('function stepExecute'), introSrc.indexOf('function afterBodies'))));
  /*
   * John, sofa, 29 Aug. Episode-2 CASTING sat Ada back in chair 7 and waited
   * on her empty ballot. W33u is the persist: clearExecute must not parkSit
   * the victim, the chair stays broken out, and the living list that arms
   * 3·2·1 reads public deaths. Alignment still hidden until Reunion.
   */
  const clearFn = introSrc.slice(introSrc.indexOf('function clearExecute'), introSrc.indexOf('function clearExecute') + 900);
  const parkFn = introSrc.slice(introSrc.indexOf('function parkSit'), introSrc.indexOf('function parkSit') + 280);
  const ballotSrc = await readFile(new URL('../src/party/ballot.js', import.meta.url), 'utf8');
  t('W33u · executed stay wreckage; episode-2 casting living excludes them',
    /if \(r\.wrecked\) return;/.test(parkFn)
    && !/parkSit\(exec\.victim\)/.test(clearFn)
    && !/wrecked\s*=\s*false/.test(clearFn)
    && !/restoreLooseChair/.test(clearFn)
    && /looseChairs:\s*\[\]/.test(introSrc)
    && /function livingFromPublic/.test(ballotSrc)
    && /function deadIdsFromPublic/.test(ballotSrc)
    && /livingFromPublic\(\{/.test(hostSrc)
    && /paintDeadWatch/.test(phoneSrc)
    && /dead-watch/.test(phoneSrc)
    && /iAmDead/.test(phoneSrc)
    && /seatedLivingIds\(\)/.test(hostSrc));
}

// ---- W34 · NO DOORWAY INTO VOID, AND NOTHING OCCUPIES THE APERTURE --------------------------
//
// John, playtest 2026-08-24, procedural mansion:
//   1. Doorways on the outside border opened off the playable plan into black.
//   2. A crate sat in a doorway; white pilasters / trim stuck into another.
//
// Cause (1): genplan emitted OPEN portals onto leftover envelope / 5 cm corridor slivers
// because `rowIdAtRun` named a neighbour that did not cover that `u`. Seed 23 `D.g6`.
// Cause (2): `walkHalf` used pre-boost `maxSpan/2` while `fitCatalogProp` draws at ×1.55,
// and gallery pilasters were a bay rhythm with no opening test.
{
  const roomA = { id: 'a', x0: 0, x1: 8, z0: 0, z1: 8 };
  const roomB = { id: 'b', x0: 8.3, x1: 16, z0: 0, z1: 8 };
  const thin = { id: 's', x0: 8.3, x1: 10, z0: 3.9, z1: 4.1 };
  const shared = { id: 'd', a: 'a', b: 'b', x: 8.15, z: 4, w: 1.9, axis: 'z' };
  const border = { id: 'e', a: 'a', b: 'outside', x: 0, z: 4, w: 1.9, axis: 'z' };
  const intoThin = { id: 'f', a: 'a', b: 's', x: 8.15, z: 4, w: 1.9, axis: 'z' };
  t('W34 · a door between two walkable rooms faces playable floor',
    portalFacesPlayable([roomA, roomB], shared));
  t('W34a · a door whose far side is outside is not a playable opening',
    !portalFacesPlayable([roomA], border) && !portalFacesPlayable([roomA], shared));
  t('W34b · a door into a sliver thinner than a body is not a playable opening',
    !portalFacesPlayable([roomA, thin], intoThin)
    && MIN_LANDING_SPAN >= 0.84);

  let voidOpen = 0, outsideOpen = 0, visualHit = 0, placed = 0;
  const specOf = new Map(FURN_SMASH_ASSETS.map((a) => [a.id, a]));
  for (let ws = 0; ws < 24; ws++) {
    const tables = generatedTables(pickPlanSeed(ws).seed, PLAN_OPTS);
    for (const p of tables.portals) {
      if (p.a === 'outside' || p.b === 'outside') outsideOpen++;
      if (!portalFacesPlayable(tables.spaces, p)) voidOpen++;
    }
    const after = catalogPlacements(tables.spaces, { portals: tables.portals });
    placed += after.length;
    for (const slot of after) {
      const spec = specOf.get(slot.catalogId);
      const half = walkHalf(spec);
      if (half > 0 && blockedByOpenings(slot.x, slot.z, half, half, tables.portals)) visualHit++;
    }
  }
  t('W34c · no OPEN portal on 24 world seeds faces void, a sliver, or outside',
    voidOpen === 0 && outsideOpen === 0, `${voidOpen} void / ${outsideOpen} outside`);
  // PR #44 scaled catalog spans ×0.7 (crate 0.90 → 0.63). Keep-out is still boosted:
  // unboosted half is 0.315 m; visual half is 0.63/2 × 1.55 ≈ 0.49 m.
  const crateSpec = specOf.get('crate');
  const crateHalf = walkHalf(crateSpec);
  t('W34d · catalog dress (boosted visual half, crate included) stays out of every opening',
    visualHit === 0 && FURN_FIT_BOOST === 1.55
    && crateSpec.maxSpan === 0.63
    && crateHalf > crateSpec.maxSpan * 0.5
    && Math.abs(crateHalf - crateSpec.maxSpan * 0.5 * FURN_FIT_BOOST) < 1e-9,
    `${visualHit} overlaps · crate half ${crateHalf.toFixed(2)} m · n=${placed}`);

  // Control: a crate just outside the unboosted AABB still occupies the aperture once
  // Meshy ×1.55 is applied. Pathing-only keep-out is what shipped the playtest crate.
  const door = { id: 'd', x: 0, z: 0, w: 1.9, axis: 'x' };
  const crateX = 1.86;
  const rawHalf = 0.90 * 0.5;
  const visHalf = rawHalf * FURN_FIT_BOOST;
  t('W34e control · unboosted crate AABB misses a door the boosted mesh still fills',
    !blockedByOpenings(crateX, 0, rawHalf, rawHalf, [door])
    && !!blockedByOpenings(crateX, 0, visHalf, visHalf, [door]));

  t('W34f · a pilaster in a doorway is a hit, one a metre off is not',
    uHitsAnyOpening(0, 0.25, [{ u: 0, w: 1.9 }], 0.16)
    && !uHitsAnyOpening(3, 0.25, [{ u: 0, w: 1.9 }], 0.16));

  const here = dirname(fileURLToPath(import.meta.url));
  const src = (rel) => readFileSync(join(here, '..', rel), 'utf8');
  t('W34g · genplan refuses a hole that does not land in two walkable rooms',
    /portalFacesPlayable\(rows/.test(src('src/world/genplan.js')));
  t('W34h · cutsOnWall does not cut an OPEN hole without a walkable neighbour at that u',
    /walkableNeighbourAt\(sp, side, u\)/.test(src('src/game/room.js'))
    && /OPEN/.test(src('src/game/room.js')));
  t('W34i · gallery pilasters / arch piers skip door bays; wall-run trim pads floor openings',
    /uHitsAnyOpening/.test(src('src/game/room.js'))
    && /archPiers !== false/.test(src('src/world/gallery-order.js'))
    && /\(p\.y0 \?\? 0\) < 0\.35 \? 0\.14/.test(src('src/world/kit.js')));
  t('W34j · walkHalf uses the smash-lab boost so a crate cannot hide behind maxSpan',
    /FURN_FIT_BOOST/.test(src('src/game/furn-layout.js'))
    && /halfSpan\(spec\) \* FURN_FIT_BOOST/.test(src('src/game/furn-layout.js')));
  t('W34k · the guide map drops the same unplayable doors the house no longer cuts',
    /portalFacesPlayable\(floor/.test(src('src/party/mansion.js')));
}

/* =============================================================================================
 * W35 · THE ROUND-5 UI PASS — six screens the loop critic could not read.
 *
 * Every assertion here has a CONTROL that would make it fail, because the defect class this whole
 * round is about is "the code exists and nothing reaches a screen": `recapBoard` was written,
 * gated and never called for four rounds.
 * ============================================================================================= */
{
  const hostSrc = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');
  const phoneSrc = await readFile(new URL('../src/views/party-phone.js', import.meta.url), 'utf8');
  const skin = await readFile(new URL('../src/party/night-skin.js', import.meta.url), 'utf8');
  const tagSrc = await readFile(new URL('../src/characters/chest-nameplate.js', import.meta.url), 'utf8');
  const roomSrc = await readFile(new URL('../src/party/room.js', import.meta.url), 'utf8');

  /*
   * ⏱️ D8 · ONE CLOCK. The mast printed the countdown at 36px and the stage printed the SAME
   * number at 64px four inches below it, from the same tick loop, sometimes a frame apart.
   * The rule is measured off the built HTML rather than off a hand-kept list of beats, so a beat
   * added later cannot quietly reintroduce the pair.
   */
  t('W35 · the mast clock stands down whenever the stage already prints one',
    /const stageHasClock = body\.includes\('data-show-clock'\)/.test(hostSrc)
      && /clock && !stageHasClock \?/.test(hostSrc));
  t('W35 control · a mast clock that ignored the body would print two on every talk beat',
    !/\$\{clock \? `<span class="show-mast-clock"/.test(hostSrc));
  // Same defect, one screen over: the phone status strip and the 64px sheet clock.
  t('W35l · and the phone strip stands down when the sheet already prints the number',
    /const sheetHasClock = body\.includes\('data-show-clock'\)/.test(phoneSrc)
      && /sheetHasClock \? '' : phoneClockInline\(c\)/.test(phoneSrc));

  /*
   * 📊 D7/S3 · THE BALLOT BOX FILLING UP. Count and threshold only — see `lynchProgress`.
   * The control arm is the important one: this board must never learn a name or a tally.
   */
  t('W35a · the Vote airs how full the ballot box is, and what it takes to carry',
    /function tallyBoard/.test(hostSrc)
      && /aside: client\.lynchResult \? '' : tallyBoard\(client\.tally\)/.test(hostSrc)
      && /lynchProgress\(\)/.test(roomSrc)
      && SHOW_CHROME_CSS.includes('.tally-board'));
  {
    const board = hostSrc.slice(hostSrc.indexOf('function tallyBoard'));
    const body = board.slice(0, board.indexOf('\n}'));
    t('W35b control · and it can reach no name, no vote and no tally to leak one',
      !/names/.test(body) && !/counts/.test(body) && !/votes/.test(body)
        && !/joinedName/.test(body) && !/lynchVotes/.test(body));
  }

  /*
   * 🎬 S11 · THE BLANK CASTING TV. Lamps are lit by BALLOTS, which are already aired — "who has
   * finished reading their card" is not a fact any machine in this room holds, and inventing it
   * would be a fiction on the one screen the whole room is looking at.
   */
  t('W35c · casting draws the room while every player is head-down on a card',
    /function castBoard/.test(hostSrc)
      && /body \+= castBoard\(client\.lobby, votes, castWarm\(\), seatedLivingIds\(\)\)/.test(hostSrc)
      && SHOW_CHROME_CSS.includes('.cast-lamp'));
  /*
   * ⚠️ **THE FOOT OF THAT BOARD MUST BE A NUMBER THAT CAN MOVE.** The first cut printed
   * "0 of 8 have sent a ballot" through a window where no ballot can exist: intros do not fire
   * until the bake is ready, and no ballot lands until after the intros. An eight-phone probe
   * sampled 90 times and never saw a lamp light. The bake is what the room is actually waiting
   * for, so while it is baking that is what the bar shows.
   */
  t('W35c2 control · while the mansion is baking the bar is the bake, not a counter stuck on zero',
    /const baking = !!warm && warm\.stage !== 'ready'/.test(hostSrc)
      && /baking\s*\r?\n?\s*\? `<div class="cast-warm">/.test(hostSrc)
      && /function castWarm/.test(hostSrc)
      && /bar: warmBar\(\)/.test(hostSrc));
  {
    const board = hostSrc.slice(hostSrc.indexOf('function castBoard'));
    const body = board.slice(0, board.indexOf('\n}'));
    // The board SAYS "Read your card" — that is the instruction on the television, and it is the
    // one thing here that is allowed to contain the word. What it must never do is READ one.
    t('W35d control · the lamp is a ballot, never a claim about a role or a card',
      /v\.voter/.test(body)
        && !/\.role\b/.test(body) && !/alignment/.test(body)
        && !/\bdeal\b/.test(body) && !/cardFor|roleCard|\.card\b/.test(body));
  }

  /*
   * 🔢 D6/S1 · WHICH SAM. Duplicate names stay legal — the seat number and the player's own
   * accent are already public, and they are what makes the aired ballot readable again.
   */
  t('W35e · every list that can be tapped or aired carries the seat and the accent',
    /function seatChip/.test(hostSrc) && /function seatChip/.test(phoneSrc)
      && /\$\{seatChip\(lobby, n\.target\)\}/.test(hostSrc)
      && /\$\{seatChip\(c, p\.id\)\}/.test(phoneSrc)
      && /\$\{seatChip\(c, n\.target\)\}/.test(phoneSrc)
      && SHOW_CHROME_CSS.includes('.seat-chip') && skin.includes('.seat-chip'));
  t('W35f control · the chip is drawn from the public lobby seat, not from a role or a deal',
    /\(lobby\?\.seats \|\| \[\]\)\.find/.test(hostSrc)
      && /\(c\?\.lobby\?\.seats \|\| \[\]\)\.find/.test(phoneSrc));
  // Including the loudest thing on the screen: the lower third names ONE person by name alone.
  t('W35f2 · the lower third says which seat it is naming',
    /seat \$\{seatNo \+ 1\}/.test(hostSrc));

  /*
   * 🚨 D12/S8 · READY WAS OFF THE BOTTOM OF AN EIGHT-PLAYER RECKONING. The dock is sticky AND it
   * is the last thing appended — a sticky element with content after it covers that content, so
   * both halves are the fix and both are asserted.
   */
  t('W35g · READY is docked to the viewport, so eight players cannot push it off the sheet',
    /class="ready-dock"/.test(phoneSrc)
      && /\.ready-dock \{ position:sticky; bottom:0;/.test(skin));
  {
    const paintBody = phoneSrc.slice(phoneSrc.indexOf("if (beat === 'debrief')"), phoneSrc.indexOf("} else if (beat === 'vote')"));
    const padThenReady = /padFxHtml\(\);\s*\r?\n\s*body \+= readyHtml\(c\);/g;
    t('W35h control · and the dock is the LAST thing on the sheet, or it sits on top of the pad',
      (paintBody.match(padThenReady) || []).length === 2
        && !/body \+= readyHtml\(c\);\s*\r?\n\s*body \+= padFxHtml\(\);/.test(paintBody));
  }

  /*
   * 🔎 D2 · THE PLATE THAT ATE THE ROOM. The low end of the distance clamp was pinned at 1, so
   * inside four metres a constant world size grew as 1/d with no ceiling — about 6.7× at arm's
   * length. The far half of the curve is deliberately untouched, and W33b still reads it.
   */
  // chest-nameplate imports THREE, so the numbers are read out of the source, not imported.
  const nearK = Number((tagSrc.match(/TAG_NEAR_K = ([\d.]+)/) || [])[1]);
  const refDist = Number((tagSrc.match(/TAG_REF_DIST = ([\d.]+)/) || [])[1]);
  const farK = Number((tagSrc.match(/TAG_FAR_K = ([\d.]+)/) || [])[1]);
  const k = (d, floor) => Math.min(Math.max(d / refDist, floor), farK);
  t('W35i · the name tag may shrink near the camera instead of growing without a ceiling',
    /clamp\(d \/ TAG_REF_DIST, TAG_NEAR_K, TAG_FAR_K\)/.test(tagSrc)
      && nearK > 0 && nearK < 1 && refDist === 4 && farK === 2
      && k(4, nearK) === 1 && k(20, nearK) === farK,
    `near ${nearK} · ref ${refDist} · far ${farK}`);
  /*
   * The control is the arithmetic that made this a defect. Under sizeAttenuation the on-screen
   * size goes as k/d, so the blow-up from 4 m to any nearer d is (k(d)/d) / (k(4)/4).
   *
   * ⚠️ **THE FIX IS NOT "FLAT EVERYWHERE" AND MUST NOT BE READ AS ONE.** The floor only bites
   * closer than `nearK * refDist` = 1.36 m, so the plate is genuinely constant on screen from
   * conversation distance out to four metres, and still grows below that — off a base three times
   * smaller. 6.7× at arm's length becomes 2.3×, which is a plate you can read past, not one that
   * covers the person wearing it. Anyone tempted to call this flat-to-zero should lower the floor
   * deliberately and re-shoot it, not assume.
   */
  const blowUp = (floor, d) => (k(d, floor) / d) / (k(4, floor) / 4);
  t('W35j control · a near floor of 1 is the old defect — 6.7× the four-metre plate at arm\'s length',
    blowUp(1, 0.6) > 6.5 && blowUp(nearK, 0.6) < 2.5
      && Math.abs(blowUp(nearK, 1.4) - 1) < 0.05 && Math.abs(blowUp(nearK, 2) - 1) < 0.05,
    `0.6 m: ${blowUp(1, 0.6).toFixed(1)}x -> ${blowUp(nearK, 0.6).toFixed(2)}x · flat from ${(nearK * refDist).toFixed(2)} m`);

  /* 📱 The ballot receipt quotes what the ROOM recorded, and says WHICH Sam it recorded. */
  t('W35k · the phone receipt names the recorded choice and its seat',
    /class="receipt/.test(phoneSrc)
      && /The room recorded/.test(phoneSrc)
      && /const chip = b\.choice === NO_ONE \? '' : seatChip\(c, b\.choice\)/.test(phoneSrc)
      && skin.includes('.receipt.coerced'));
}

/* =============================================================================================
 * W36 · 🟢 THE LINK STREAM — Matrix glyphs on a faint string between a paired couple's plates.
 *
 * John: *"green matrix esc data particle affects to flow between the name tags of any two
 * connected players"*, and then, on the first build: *"it should have a matrix green glow and a
 * faint string. if that is in the game I can't see it in the screenshot."* Both notes are pinned
 * below, because both were things a source grep would have called done.
 *
 * ⚠️ This file cannot `import` the module — `link-stream.js` imports THREE and the party gates
 * run with no `node_modules` in CI. It is read as text, and the RUNTIME behaviour (streams in
 * flight, glyphs lit, the age advancing) is measured by `harness/jellie-play.mjs` against a real
 * browser instead. Neither instrument alone is enough and that is stated rather than implied.
 * ============================================================================================= */
{
  const streamSrc = await readFile(new URL('../src/characters/link-stream.js', import.meta.url), 'utf8');
  const bedSrc = await readFile(new URL('../src/game/intro-bed.js', import.meta.url), 'utf8');
  const tagSrc = await readFile(new URL('../src/characters/chest-nameplate.js', import.meta.url), 'utf8');

  t('W36 · a pair is drawn as data crossing the room, not only as a colour swap',
    /export function buildLinkStream/.test(streamSrc)
      && /buildLinkStream\(group\)/.test(bedSrc)
      && /stream\.sync\(pairs \|\| \[\], tagOf\)/.test(bedSrc));

  /*
   * The bug this catches is the one that has bitten this project hardest: built, and never
   * ticked. `recapBoard` was defined and uncalled for four rounds. BOTH loops must drive it —
   * `step` is the talk beats and `holdStep` is the run, and a stream frozen mid-expedition would
   * be a line of static glyphs hanging in the ballroom.
   */
  /*
   * ⚠️ The window was 160 characters and that made it a spelling test. The accusation stage
   * added `stage.step(dt)` and a comment at the top of `holdStep`, which pushed `stream.step`
   * past it — the stream was still being stepped on the very next line. The claim is "the
   * stream is stepped inside holdStep", not "it is the first thing in it", so the window is
   * wide enough to survive a neighbour being added and still far too tight to jump a function.
   */
  t('W36a · and it is STEPPED from both bed loops, not merely built',
    (bedSrc.match(/stream\.step\(dt, engine\.camera\);/g) || []).length === 2
      && /holdStep\(dt, t\) \{[\s\S]{0,600}?stream\.step/.test(bedSrc));

  /*
   * 🔒 THE PRIVACY CONTROL, AND IT IS THE MOST IMPORTANT ASSERTION IN THIS BLOCK.
   *
   * The stream draws the CHANNEL. A surge on each whisper was designed and deliberately not
   * built: it would air WHEN a message was sent, and it would need the fact of a send to reach
   * the television, which `fanoutViolations` currently REFUSES outright. If a later change wires
   * a word or a send into this module, this fails before it ships.
   */
  /*
   * ⚠️ **STRIP THE COMMENTS FIRST.** The first cut of this ran against the whole file and failed
   * on the module's own header, which explains at length WHY the whisper surge was not built. A
   * gate that cannot tell documentation from code punishes the documentation, and the thing being
   * asserted is what this module can REACH, not what it talks about.
   */
  const code = streamSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  t('W36b control · the stream can reach no whisper, no message and no role',
    !/whisper/i.test(code) && !/\brole\b/i.test(code)
      && !/alignment/i.test(code) && !/message/i.test(code),
    `${code.split('\n').length} lines of code, comments stripped`);
  t('W36b2 control · and stripping did not eat the file — the code is still all there',
    /buildLinkStream/.test(code) && /THREE\.Sprite/.test(code) && code.length > 2000);

  /*
   * 🪡 John's second note. The string was in the design canvas from the first sketch and the
   * first build shipped without it, so the glyphs read as loose characters near two heads rather
   * than as a line between two people.
   */
  t('W36c · there is a faint string, and the glyphs ride the SAME curve as it',
    /new THREE\.Line\(/.test(streamSrc)
      && /export const STRING_OPACITY/.test(streamSrc)
      && /export function sagAt/.test(streamSrc)
      // Two CALL sites — the string's vertices and the glyphs' positions — plus the definition.
      && (streamSrc.match(/sagAt\(u\)/g) || []).length === 3);
  t('W36c2 control · the sag is ONE function — two copies would drift the glyphs off the string',
    (streamSrc.match(/Math\.sin\(Math\.PI/g) || []).length === 1);

  /*
   * 🔦 The glow. Captions are drawn AFTER the post grade, so no bloom pass ever sees these
   * sprites — a glow on a caption is painted into its texture or it does not exist.
   */
  const blurs = [...streamSrc.matchAll(/blur:\s*(\d+)/g)].map((m) => Number(m[1]));
  const cell = Number((streamSrc.match(/const CELL = (\d+)/) || [])[1]);
  const fontPx = Number((streamSrc.match(/g\.font = '800 (\d+)px/) || [])[1]);
  t('W36d · the glyph is painted with a corona, because the bloom pass cannot reach a caption',
    blurs.length >= 2 && Math.max(...blurs) >= 20 && blurs.includes(0),
    `blurs ${blurs.join('/')}`);
  /*
   * ⚠️ **A CORONA WIDER THAN ITS CELL BLEEDS INTO THE NEIGHBOURING CHARACTER.** The glyphs live
   * side by side on one strip, so every sprite would show a ghost of the two characters next to
   * it — subtle, permanent, and very hard to see in a screenshot. Derived, not eyeballed.
   */
  t('W36d2 control · the cell is wide enough to hold the widest blur without touching its neighbour',
    cell > 0 && fontPx > 0 && (cell - fontPx) / 2 >= Math.max(...blurs),
    `cell ${cell}px, glyph ${fontPx}px, margin ${(cell - fontPx) / 2}px vs blur ${Math.max(...blurs)}px`);

  /*
   * 🚨 The performance decision, pinned. One strip texture, cloned per sprite, and the character
   * is picked with `offset` — a uniform. The obvious build swaps `material.map` and sets
   * `needsUpdate`, which asks three for a program rebuild hundreds of times a second.
   */
  t('W36e control · picking a character is a texture OFFSET, never a material rebuild',
    /strip\.clone\(\)/.test(streamSrc)
      && /p\.map\?\.offset\.set/.test(streamSrc)
      && !/mat\.needsUpdate/.test(streamSrc));

  /*
   * The overlay pass is skipped entirely while `captionCount()` is 0, so an unbalanced count is
   * not a leak — it is the survival game paying for a pass that draws nothing, forever.
   */
  t('W36f · every sprite and the string are captions, and every one is given back',
    (streamSrc.match(/captionAdded\(\)/g) || []).length === 2
      && (streamSrc.match(/captionRemoved\(\)/g) || []).length === 2
      && (streamSrc.match(/layers\.set\(CAPTION_LAYER\)/g) || []).length === 2
      && /stream\.dispose\(\);/.test(bedSrc));

  t('W36g · the glyphs ride the same distance curve as the plates they are strung between',
    /export function tagDistK/.test(tagSrc) && /tagDistK\(p\.sp\.position, camera\)/.test(streamSrc));
}

/* =============================================================================================
 * W40 · 🤖 THE LOBBY FACE IS UNIT-4H'S OWN HEAD.
 *
 * The face the picker paints was a diamond on a blob, authored before the character existed. It
 * is now a 2D drawing of the real head: silhouette measured off `assets/mv/player/
 * baseline_front.png`, features measured off `FACE_SURFACE`, which is the shader that paints the
 * actual faceplate. Three things about that change can regress silently, so all three are here.
 * ============================================================================================= */
{
  const lumOf = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  };
  const TREATS = ['portrait', 'chip', 'screen'];
  const svgs = TREATS.map((tr) => robotFaceSvg('#2a2420', '#f5a14a', { size: 100, treatment: tr }));

  /*
   * 🚨 AN UNSUBSTITUTED TOKEN IS A BLACK FACE, NOT AN ERROR. The drawing is authored against
   * @SHELL@ / @LIT@ / … and the tokens are replaced on the way out. Miss one and the browser
   * gets fill="@LIT@", which is not a colour, so it paints black and the eyes vanish into the
   * glass — on a face that still renders, still passes a "does it draw" check, and is only
   * wrong to look at. Same reason `id` is banned: the TV mounts one of these per chair.
   */
  t('W40a · the face draws with no leftover token and no id · the lobby mounts eight of them',
    svgs.every((s) => !/@[A-Z]+@/.test(s) && !/\bid=/.test(s) && /viewBox="0 0 100 100"/.test(s)
      && s.includes('#2a2420') && s.includes('#f5a14a')),
    `${TREATS.join(' · ')}`);

  /*
   * THE RIM IS LOAD-BEARING. Eight of the twelve shells are darker than 0.25 luminance against a
   * 0.040 background, so a flat fill sinks the whole head into the TV and leaves two floating
   * eyes. Every shell's rim clears 0.55 — a real edge, not a hint — and the alpha steps up with
   * it. The control is the same twelve measured WITHOUT the rim, which is the defect.
   */
  const rims = SHELLS.map((s) => ({ s, shell: lumOf(s), rim: lumOf(shellTones(s).rim), a: shellTones(s).rimA }));
  const sunk = rims.filter((r) => r.shell < 0.25);
  t('W40b · every shell keeps an edge against the night · the rim opens up as the shell darkens',
    rims.every((r) => r.rim > 0.55) && sunk.every((r) => r.a === 0.80)
      && rims.filter((r) => r.shell >= 0.35).every((r) => r.a === 0.55),
    `min rim ${Math.min(...rims.map((r) => r.rim)).toFixed(3)} · ${sunk.length}/12 shells at 0.80 alpha`);
  t('W40b control · without the rim, two thirds of the palette sinks into the background',
    sunk.length === 8 && sunk.every((r) => r.shell - 0.040 < 0.19),
    `${sunk.length}/12 shells under 0.25 luminance · bg 0.040`);

  /*
   * ONE PAINTER, EVERY PART. The old face had exactly two coloured elements, so both call sites
   * recoloured it with two setAttribute calls. This one has nine, four of them DERIVED from the
   * shell — so the same two-call patch would leave the crown, the pods and the rim showing the
   * PREVIOUS player's colour, on the one screen whose entire job is choosing a colour. Every
   * token the drawing emits must be one `paintLook` knows, and neither view may name a part.
   */
  const tokens = new Set();
  for (const s of svgs) for (const m of s.matchAll(/data-(?:paint|stroke)="([a-z]+)"/g)) tokens.add(m[1]);
  const KNOWN = new Set(['shell', 'crown', 'pod', 'rim', 'seam', 'lit']);
  const phoneSrc = await readFile(new URL('../src/views/party-phone.js', import.meta.url), 'utf8');
  const hostSrc = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');
  t('W40c · every coloured part routes through one painter, and no view names a part itself',
    tokens.size >= 5 && [...tokens].every((k) => KNOWN.has(k))
      && /paintLook\(/.test(phoneSrc) && /paintLook\(/.test(hostSrc)
      && !/bot-wedge|bot-shell'\)/.test(phoneSrc + hostSrc),
    `${[...tokens].sort().join(' · ')}`);

  /*
   * The features are the shader's, not a redraw by eye: two eyes, a brow arc over each, one
   * mouth. `doubt` is the one that has to survive — it is asymmetric on purpose, and a mood
   * table that quietly went symmetric would take the accusation out of the face.
   */
  const NAMES = ['idle', 'clap', 'boo', 'sus', 'shock'];
  const moods = NAMES.map((m) => robotFaceSvg('#2a2420', '#f5a14a', { treatment: 'screen', mood: m }));
  const beforeLight = (s) => s.slice(0, s.indexOf('<path data-stroke="lit"'));
  t('W40d · the face carries five expressions and ONLY the light differs between them',
    new Set(moods).size === NAMES.length
      && moods.every((s) => (s.match(/data-(?:paint|stroke)="lit"/g) || []).length >= 4)
      && beforeLight(moods[0]).length > 100
      && new Set(moods.map(beforeLight)).size === 1,
    `${beforeLight(moods[0]).length} chars of plate identical across ${NAMES.join(' · ')}`);
}

/* =============================================================================================
 * W37 · 🕯️ THE BALLROOM'S PRACTICALS REACH THE PARTY NIGHT.
 *
 * John, three times across two sessions: *"put the assets as we worked on it with much more
 * details and furniture into the Prime Time … it seems it still hasn't done it."*
 *
 * The reason it kept not happening is worth recording, because it is a defect class rather than
 * an oversight: **there was nothing to find in the ballroom files.** `ballroomFixtures` was
 * written, shipping and correct — and mounted in exactly one place, `src/views/game.js`, behind
 * an `?estate=port` flag. The party night builds the same house through the same `buildTestRoom`
 * and never called it. Anyone searching `world/ballroom-*` would search forever.
 * ============================================================================================= */
{
  const bedSrc2 = await readFile(new URL('../src/game/follow-bed.js', import.meta.url), 'utf8');

  t('W37 · the party night mounts the ballroom practicals off the room\'s own order plan',
    /ballroomFixtures\(\{/.test(bedSrc2)
      && /plan: sp\.orderPlan/.test(bedSrc2)
      && /s\.order === 'ballroom' && s\.orderPlan/.test(bedSrc2)
      && /for \(const m of fx\.meshes\) sp\.root\.add\(m\)/.test(bedSrc2)
      && /for \(const l of fx\.lights\) scene\.add\(l\)/.test(bedSrc2));

  /*
   * ⚠️ **GEOMETRY IS NOT THE POINT — EMISSION IS.** `BALLROOM_POINTS` is 0 and the rig hands the
   * meshes back regardless, so a build that mounted three chandeliers and forgot `points` would
   * hang three unlit props in a dark room and satisfy any check that counted objects. John chose
   * the NIGHT reading of the asset: the fixtures are the light source.
   *
   * Read out of source: `ballroom-rig.js` imports THREE and CI has no `npm install`.
   */
  const rigSrc = await readFile(new URL('../src/lighting/ballroom-rig.js', import.meta.url), 'utf8');
  const BALLROOM_POINTS = Number((rigSrc.match(/export const BALLROOM_POINTS = (\d+)/) || [])[1]);
  t('W37a control · and it asks for point lights, or the fixtures are unlit props in a brown box',
    /points: 3,/.test(bedSrc2) && BALLROOM_POINTS === 0,
    `the rig defaults to ${BALLROOM_POINTS}; the party night asks for 3`);

  /*
   * The asset drives a 19,400-intensity shadow-casting spot through the windows — the daylight
   * that makes it look the way it does. That was option A and John chose B. Porting it later is
   * a decision, not a tidy-up, so its absence is pinned.
   */
  t('W37b control · the asset\'s DAYLIGHT rig is deliberately not ported — that was option A',
    !/spotKey|ballroomEnv|lightShaft|dustMotes|dustSheetRow|paperScatter/.test(bedSrc2));

  t('W37c · a practical that throws cannot stop the show opening',
    /catch \(e\) \{\s*\r?\n?\s*console\.warn\('\[follow-bed\] ballroom fixtures skipped/.test(bedSrc2));

  t('W37d · it reuses the house\'s baked estate materials rather than inventing surfaces',
    /brass: room\.materials\?\.estate\?\.brass/.test(bedSrc2)
      && /crystal: room\.materials\?\.estate\?\.crystal/.test(bedSrc2));
}

/* =============================================================================================
 * W38 · 🏛️ THE BALLROOM PORT — pilasters that face the room, panels that leave the wall,
 * a marble border, and oak at the brightness the sweep actually landed on.
 *
 * Four findings from a six-agent investigation of John's *"why are there so many things that
 * didn't get ported over from the asset"*. THREE of the six items he listed were not what they
 * looked like, and each of those would have been "fixed" wrongly by a builder working from the
 * description alone. The controls below are what pin the difference.
 * ============================================================================================= */
{
  const kitSrc = await readFile(new URL('../src/world/kit.js', import.meta.url), 'utf8');
  const ordSrc = await readFile(new URL('../src/world/ballroom-order.js', import.meta.url), 'utf8');
  const roomSrc2 = await readFile(new URL('../src/game/room.js', import.meta.url), 'utf8');

  /*
   * 🚨 THE PILASTER WINDING. John: *"pillars … a black rectangle box at the bottom and two side
   * surfaces but no face surface."* Measured on the shipped build: of 1176 triangles in the
   * pilaster's slice of the `wall` bucket, 1104 faced INTO the wall and ZERO faced the room, so a
   * FrontSide material culled the entire shaft. The showcase had it too — this was never a
   * game-versus-showcase divergence.
   */
  t('W38 · the pilaster shaft is wound to face the room, not the wall',
    /rings\.map\(\(r\) => r\.slice\(\)\.reverse\(\)\)/.test(kitSrc)
      && /uvs\.map\(\(u\) => u\.slice\(\)\.reverse\(\)\)/.test(kitSrc));
  /*
   * ⚠️ The tempting "fix" is to flip `stripFromRings`' index order. `column()`, `extrudeProfile()`
   * and `archedOpening()`'s soffit all build their rings the other way and are correct; changing
   * the shared helper would invert every one of them.
   */
  t('W38a control · and the shared strip helper was NOT flipped to do it',
    /idx\.push\(a, c, b, b, c, d\)/.test(kitSrc));
  t('W38a2 control · the uv rows are reversed in lockstep, or the flutes would remap',
    /reverse\(\)\), false, uvs\.map/.test(kitSrc.replace(/\s+/g, ' ')));

  /*
   * 🪵 RAISED PANELS. Measured: the sunk field sits between z −0.12 and −0.048 inside a 0.30 m
   * wall — buried in BOTH rooms, never rendered anywhere. `raised` puts it proud, and is fewer
   * vertices into the same buckets.
   */
  t('W38b · the ballroom asks for raised panels, and the flag exists to be asked for',
    /const raisedPanels = o\.raisedPanels === true;/.test(ordSrc)
      && /raisedPanels: true,/.test(roomSrc2)
      && /const raised = o\.raised === true;/.test(kitSrc));
  t('W38b2 control · every wall run takes it — a half-threaded flag panels three walls of four',
    (ordSrc.match(/raised: raisedPanels,/g) || []).length === 8,
    `${(ordSrc.match(/raised: raisedPanels,/g) || []).length} of 8 wall runs`);
  /*
   * ⚠️ DEFAULT OFF. `views/room-ballroom.js` is pinned by a pixel diff and by a grade gate with
   * 0.3 of headroom; a default-on flag would change it silently.
   */
  t('W38b3 control · but it is OFF by default, so the showcase is untouched',
    !/o\.raisedPanels \?\? true/.test(ordSrc) && !/raisedPanels = true;/.test(ordSrc));

  /*
   * 🏛️ THE MARBLE BORDER. A ring over the existing floor's rim, not the showcase's two-plane
   * sandwich — the game already draws a full-extent floor, so a second plane under it would be
   * paying for a surface nothing can see.
   */
  t('W38c · the marble border is derived from the room and snapped to whole squares',
    /function ballFloorBorder\(sp\)/.test(roomSrc2)
      && /floor: ballFloorBorder\(sp\)/.test(roomSrc2)
      && /if \(o\.floor\) \{/.test(ordSrc)
      && /marbleFloor: 'floormarble'/.test(roomSrc2));
  t('W38c2 control · a room too narrow to carry a border gets none rather than becoming marble',
    /if \(border \* 2 >= short \* 0\.45\) return null;/.test(roomSrc2));
  /*
   * ⚠️ The UVs are authored room-local. `GeoBin.add` applies the matrix and THEN world-projects,
   * so a generated ballroom at an arbitrary world position would get an arbitrary chequer phase
   * and half squares against the skirting.
   */
  t('W38c3 control · the chequer is pinned to the room corner, not the world origin',
    /worldUV\(g, f\.tile\);/.test(ordSrc)
      && ordSrc.indexOf('g.translate(sx - f.x0, 0, sz - f.z0);') < ordSrc.indexOf('worldUV(g, f.tile);'));
  // A 4 mm slab lying on the floor must not cast into the floor it lies on.
  t('W38c4 · the border casts no shadow',
    /'dark', 'floormarble'/.test(roomSrc2));

  /* 🪵 The oak. The showcase swept 1.6/2.0/2.4x and shipped 2.0x; the game took the bare default. */
  t('W38d · the ballroom floor is the swept 2.0x oak, and only the ballroom\'s',
    /oak: \[0\.600, 0\.392, 0\.216\]/.test(roomSrc2)
      && /floor: BR\.floor \?\? m\.floor/.test(roomSrc2));
  t('W38d2 control · the house default is untouched — m.floor is every floor in the mansion',
    /floor: call\(L\?\.parquetMat, \{ size: 1024 \}/.test(roomSrc2));

  /*
   * Found in passing: the ballroom's console tabletops had been rendering in oak FLOORBOARDS,
   * because `marbleTop` was routed to the floor bucket to avoid a fifth material.
   *
   * ⚠️ Scoped to `ORDER_KEYS_BALL` on purpose. The gallery and the study still map `marbleTop` to
   * their floor and are RIGHT to — neither has a marble bucket to route it to. A whole-file
   * negative here fails on those two and says nothing about the ballroom.
   */
  const ballKeys = roomSrc2.slice(
    roomSrc2.indexOf('const ORDER_KEYS_BALL = {'),
    roomSrc2.indexOf('};', roomSrc2.indexOf('const ORDER_KEYS_BALL = {')),
  );
  t('W38e · the ballroom console tops are marble again, not floorboards',
    /marbleTop: 'floormarble'/.test(ballKeys) && !/marbleTop: 'floor'[,\s]/.test(ballKeys),
    ballKeys.length > 40 ? 'ORDER_KEYS_BALL read' : 'FAILED TO SLICE THE KEY MAP');
}

/* =============================================================================================
 * W39 · 🎭🪞🏛️ THE CURTAIN SHADOW, THE FLANKING MIRRORS, AND THE BLIND ARCH.
 * ============================================================================================= */
{
  const roomSrc3 = await readFile(new URL('../src/game/room.js', import.meta.url), 'utf8');
  const ordSrc3 = await readFile(new URL('../src/world/ballroom-order.js', import.meta.url), 'utf8');

  /*
   * 🎭 The drape geometry is bit-identical between the two rooms; the SHADOW is the difference.
   * One bucket casts and the rest of the order does not — the panelling is lit flat and would buy
   * nothing for the shadow pass it would cost.
   */
  t('W39 · the curtains cast a shadow and the rest of the order still does not',
    /m\.castShadow = m\.name === 'kit:drape';/.test(roomSrc3));
  t('W39a control · exactly one bucket was carved out, not the whole sweep',
    !/for \(const m of built\.meshes\) \{\s*\r?\n\s*m\.castShadow = true/.test(roomSrc3)
      && (roomSrc3.match(/m\.castShadow = m\.name === 'kit:drape';/g) || []).length === 1);

  /*
   * 🪞 The two pier glasses on the arch wall. The module could always place these — `room.js`
   * simply never passed `mirrors.plates`, so all four of the room's glasses sat on the east wall.
   */
  t('W39b · the arch wall gets its two flanking mirrors',
    /const endPlates = \[\];/.test(roomSrc3)
      && /mirrors: \{ pier: mirrorPlates, plates: endPlates \}/.test(roomSrc3)
      && /mirrors: mirrorPlates\.length \+ endPlates\.length > 0/.test(roomSrc3));
  /*
   * ⚠️ Derived outward until BOTH sides are clear, never authored. Hand-placed x values are the
   * mistake the mirror grid above this one already records paying for.
   */
  t('W39b2 control · the pair is derived symmetrically, and refuses rather than overlapping a door',
    /if \(!clear\(ef, sp\.cx - dx, EP\.w \/ 2 \+ 0\.30\)\) continue;/.test(roomSrc3)
      && /if \(!clear\(ef, sp\.cx \+ dx, EP\.w \/ 2 \+ 0\.30\)\) continue;/.test(roomSrc3));
  t('W39b3 control · and they are flat — the showcase\'s 9° rake aimed a reflection we do not port',
    /rotY: 0, w: EP\.w, h: EP\.h,/.test(roomSrc3) && !/rake:/.test(roomSrc3));

  /*
   * 🏛️ The blind arch. The showcase's 5.2 m motif drawn AROUND the real 1.9 m doorway, because
   * widening the doorway is a gameplay change (pathfinding, dig instancing groups, chase
   * sightlines) and must not be done for a picture.
   */
  t('W39c · a blind arch frames the doorway at the showcase\'s scale',
    /const blindArch = \(\(\) => \{/.test(roomSrc3)
      && /w: W, h: 4\.70, spring: 2\.60/.test(roomSrc3)
      && /if \(blindArch\) arches\.push\(blindArch\);/.test(roomSrc3));
  t('W39c2 control · it is concentric with a real opening, not placed on clear wall',
    /arches\.reduce\(\(a, b\) => \(Math\.abs\(b\.x - sp\.cx\) < Math\.abs\(a\.x - sp\.cx\) \? b : a\)\)/.test(roomSrc3));
  t('W39c3 control · it refuses when its span would cross another opening',
    /const crosses = ef\.cuts\.some/.test(roomSrc3) && /if \(crosses\) return null;/.test(roomSrc3));
  /*
   * ⚠️ It emits no spandrel — a spandrel fill on a blind arch is masonry extruded into masonry —
   * and it stays OUT of `archesWorld`, which is a route hint. A blind arch is not a route.
   */
  t('W39c4 control · no spandrel, and it is not advertised as a way through',
    !/blindArch[\s\S]{0,200}spandrelSteps/.test(roomSrc3)
      && /\.filter\(\(a\) => a !== blindArch\)/.test(roomSrc3));
  /*
   * A 150 mm moulding is 16% of a 1.9 m doorway and 3% of a 5.2 m arch. The trim key matters too:
   * gilt is a metal with no diffuse term, so on a dim wall a gilt moulding renders dark.
   */
  t('W39c5 · a wide arch gets a heavier moulding, in stone rather than gilt',
    /archivolt: kit\?\.architraveProfile\?\.\(0\.34, 0\.085\)/.test(roomSrc3)
      && /trim: 'stone',/.test(roomSrc3)
      && /trim: a\.trim \?\? 'gilt'/.test(ordSrc3));
  t('W39c6 control · and both forwards default to what every existing caller already got',
    /archivolt: a\.archivolt,/.test(ordSrc3) && /o\.archivolt \?\? architraveProfile\(0\.15, 0\.055\)/
      .test(await readFile(new URL('../src/world/kit.js', import.meta.url), 'utf8')));
}

/* =============================================================================================
 * W41 · 🌙 WHAT IS OUTSIDE THE BALLROOM'S WINDOWS AT NIGHT.
 *
 * John, playing the party game: *"there is depth outside the windows in the asset but nothing
 * going on outside in the primetime.bat."*
 *
 * 🚨 THE TWO FACTS THAT SHAPED THE FIX, BOTH PROBED IN THE RUNNING PAGE RATHER THAN READ OFF
 * THE SOURCE, because the obvious plan — "the game already has a whole walled-yard system in
 * `game/exterior.js`, including an `x.ballroom.terrace_w` spec, just switch it on" — is wrong
 * twice over:
 *
 *   1. **THAT SYSTEM IS NOT ON THIS VIEW'S CHAIN AT ALL.** `buildExterior` has exactly one
 *      importer, `views/game.js`; the party path is `views/party-follow.js` ->
 *      `game/follow-bed.js` -> `game/room.js`. There was no yard here to enable, no `s.damaged`
 *      gate to relax, no resident-count to trip. W41h holds that, so that if anyone ever DOES
 *      wire the exterior into this view, the reasoning gets revisited instead of doubling up.
 *   2. **THE GLAZING WAS OPAQUE** (`transparent: false, opacity: 1, depthWrite: true`,
 *      `emissiveIntensity: 3.4`) and measured a FLAT ~L 220 — a lamp, not a window — so anything
 *      built behind it was depth-rejected and invisible.
 *
 * The fix is therefore two halves in two different functions, and W41d is the gate that stops
 * them drifting apart: transparent glass with no backdrop is a hole onto `#05070b`, and a
 * backdrop behind opaque glass is nothing at all.
 * ============================================================================================= */
{
  const nightSrc = await readFile(new URL('../src/world/ballroom-night.js', import.meta.url), 'utf8');
  const roomSrc4 = await readFile(new URL('../src/game/room.js', import.meta.url), 'utf8');
  const followSrc4 = await readFile(new URL('../src/party/follow.js', import.meta.url), 'utf8');
  /*
   * ⚠️ **THE "IT NEVER DOES X" GATES BELOW MUST READ CODE, NOT PROSE, AND THE FIRST RUN OF THIS
   * BLOCK PROVED IT.** `W41a` and `W41c` are absence assertions — "never routes through GeoBin",
   * "registers no colliders" — and both went red against a correct implementation, because the
   * file's own header EXPLAINS why it avoids `GeoBin` and where the window `solids` actually
   * live. An absence grep over a heavily commented file is a grep over the commentary.
   */
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const nightCode = stripComments(nightSrc);

  /*
   * ONE material for the whole outside — sky, planting, treeline, the lit wing, the lot. Draw
   * calls scale with MATERIAL KEYS, not with geometry, so a thousand extra boxes in the same bin
   * cost nothing and one extra material would cost a call.
   */
  const mats41 = nightSrc.match(/new THREE\.Mesh[A-Za-z]*Material\(/g) || [];
  t('W41 · the whole night exterior is ONE material and one merged mesh',
    mats41.length === 1 && /new THREE\.MeshBasicMaterial\(\{/.test(nightSrc)
      && /mergeGeometries\(this\.parts, false\)/.test(nightSrc),
    `${mats41.length} material(s)`);
  /*
   * ⚠️ It must NOT route through `kit.js`'s GeoBin: `GeoBin.add()` strips every attribute that is
   * not position/normal/uv — exactly the vertex-colour attribute the baked light depends on.
   * That is why this file carries its own `Paint`, as `exterior.js` does for the same reason.
   */
  t('W41a control · it carries its own Paint and never routes through GeoBin, which strips colour',
    !/GeoBin/.test(nightCode) && !/from '\.\/kit\.js'/.test(nightCode)
      && /class Paint \{/.test(nightCode)
      && /g\.setAttribute\('color', new THREE\.BufferAttribute\(col, 3\)\)/.test(nightCode));
  t('W41a2 control · …and the comment stripper those two gates rely on actually stripped something',
    nightCode.length < nightSrc.length * 0.75 && /GeoBin/.test(nightSrc) && /solids/.test(nightSrc),
    `${nightSrc.length} chars of source, ${nightCode.length} of code`);

  /*
   * 🚨 RESIDENCY: parented to the SPACE root, so `room.js`'s own toggle already gates it and
   * there is no new per-frame code to get wrong. Measured: parked in the gallery with the
   * ballroom not resident, both `?ballnight` arms read 106 calls / 249,422 triangles — a delta
   * of exactly zero. At the window station it is 145 against 142.
   */
  t('W41b · the backdrop hangs off the ballroom SPACE, so residency already gates it',
    /sp\.root\.add\(night\.mesh\);/.test(roomSrc4)
      && /s\.root\.visible = s\.visible;/.test(roomSrc4));
  /*
   * ⚠️ …and it is added OUTSIDE the order-mesh loop on purpose, so it cannot pick up that loop's
   * `receiveShadow = true`. Forty-six metres of backdrop in the shadow pass would be the most
   * expensive thing in the room.
   */
  t('W41b2 control · it takes no part in the shadow pass, unlike the order meshes beside it',
    /m\.castShadow = m\.name === 'kit:drape';/.test(roomSrc4)
      && /m\.castShadow = false;\r?\n\s*m\.receiveShadow = false;/.test(nightSrc)
      && !/night\.mesh\.receiveShadow = true/.test(roomSrc4));
  /*
   * ⚠️ NO COLLIDERS. It is scenery on the far side of a wall that already has its own (the
   * per-window glazing boxes in `ballroomOrderFor`'s `solids`). `exterior.js`'s yards DO return
   * colliders; this deliberately returns a mesh and nothing else.
   */
  t('W41c · the backdrop registers no colliders at all',
    /return \{ mesh, tris: P\.tris \};/.test(nightCode) && !/solids/.test(nightCode));

  /*
   * 🚨 THE TWO HALVES CANNOT DRIFT — the backdrop is decided in `emit`, the glazing in
   * `binMaterials`, and both must read ONE flag, stashed on the space by `ballroomOrderFor`.
   * The URL is parsed exactly once.
   */
  t('W41d · both halves read the same single flag on the space, not the URL twice',
    /sp\.nightOutside = !!\(BALLNIGHT && hasNight\);/.test(roomSrc4)
      && /if \(sp\.nightOutside\) \{/.test(roomSrc4)
      && /clere: sp\?\.nightOutside/.test(roomSrc4)
      && (roomSrc4.match(/get\('ballnight'\)/g) || []).length === 1);
  /*
   * ⚠️ A CLONE, NOT A MUTATION. `mats.clearGlass` is a singleton SHARED WITH THE GALLERY; going
   * transparent in place would turn the gallery's windows into holes, since only the ballroom
   * gets a backdrop behind them.
   */
  t('W41d2 control · the shared gallery glazing is cloned, never mutated in place',
    /BR\._nightClere \?\?= \(\(\) => \{/.test(roomSrc4)
      && /const g = BR\.clere\.clone\(\);/.test(roomSrc4)
      && !/mats\.clearGlass\.transparent = true/.test(roomSrc4));
  t('W41d3 · and the night pane is DIMMED as well as opened, or it washes the backdrop out',
    /g\.transparent = true;/.test(roomSrc4) && /g\.depthWrite = false;/.test(roomSrc4)
      && /g\.emissiveIntensity = 0\.55;/.test(roomSrc4));

  /*
   * The ablation. A before/after taken in two browser sessions is not a control pair — this
   * project's own rule — so it has to be photographable from one camera in one boot.
   */
  t('W41e · ?ballnight is accepted at the follow door as an INSTRUMENT',
    /FOLLOW_INSTRUMENTS = \['still', 'shot', 'campose', 'ballnight'\]/.test(followSrc4)
      && followViolations('?view=party.follow&ballnight=0').length === 0);
  t('W41e2 control · and the TV never emits it — it is not a FOLLOW_KEYS name',
    !FOLLOW_KEYS.includes('ballnight') && FOLLOW_INSTRUMENTS.includes('ballnight')
      && !FOLLOW_FORBIDDEN.includes('ballnight')
      && followViolations('?view=party.follow&ballnightt=0').length === 1);

  /*
   * 🚨 THE BLACK-POINT GATE, AND IT IS THE ONE THAT MATTERS MOST.
   *
   * `lighting/ballroom-rig.js`: the composite runs `col = (col - 0.5) * uContrast + 0.5` BEFORE
   * the toe, so a low enough scene-linear value goes negative and clamps to literal zero, and no
   * light, hemisphere or ambient term recovers it. Through this view's grade (exposure 1.85,
   * contrast 1.05, toeCrush 0.005) that floor is about 0.021 linear. A "dark night exterior"
   * authored naively therefore delivers exactly the black rectangle it was meant to replace.
   *
   * So every colour in the palette is checked as ARITHMETIC ON THE SOURCE rather than trusted to
   * review. Measured through the glass, on both stations, 0.00% of the delivered pixels sit at
   * literal black — this gate is what keeps that true when the palette is next touched.
   */
  const BLACK_POINT = 0.021;
  const lin41 = (a) => 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  const palette = [...nightSrc.matchAll(/^const (SKY_[A-Z]+|MOON[A-Z_]*|A_[A-Z_]+) = \[([^\]]+)\];/gm)]
    .map((m) => ({ name: m[1], v: m[2].split(',').map(Number) }));
  const darkest = palette.length ? Math.min(...palette.map((c) => lin41(c.v))) : 0;
  t('W41f · every colour in the night palette clears the grade\'s black point',
    palette.length >= 10 && palette.every((c) => lin41(c.v) > BLACK_POINT),
    `${palette.length} colours, darkest ${darkest.toFixed(4)} vs floor ${BLACK_POINT}`);
  /*
   * ⚠️ THE CONTROL THAT PROVES THE CHECK CAN FAIL. A palette parser that matched nothing, or a
   * comparison that was always true, would pass W41f silently — which is exactly the
   * "result-shaped output instead of an error" class this project keeps catching.
   */
  t('W41f control · that check rejects a colour under the floor, and really did find the palette',
    lin41([0.005, 0.005, 0.005]) <= BLACK_POINT && lin41([0.30, 0.33, 0.43]) > BLACK_POINT
      && palette.some((c) => c.name === 'SKY_ZENITH') && palette.some((c) => c.name === 'A_TREE'),
    `parsed ${palette.length}: ${palette.map((c) => c.name).join(',')}`);

  /*
   * ⚠️ DEPTH IS A GRADIENT — one flat tone can never read as depth. That is
   * `views/room-ballroom.js`'s vestibule post-mortem, which spent two rounds discovering it: a
   * plane forced to PURE WHITE still read as a flat card, and what finally worked was a stepped
   * value ramp. So the sky and the ground are SUBDIVIDED enough to carry a real ramp rather than
   * four corner colours stretched over forty-odd metres.
   */
  t('W41g · the sky and the ground are subdivided enough to carry a real ramp',
    /P\.wallZ\(Z0, Z1, -8, 40, OUT\(SKY_D\), skyShade, 30, 26\);/.test(nightSrc)
      && /lawnShade, 26, 30\);/.test(nightSrc));
  t('W41g2 control · and the sky ramp is a real function of height, not one flat fill',
    /const k = smoothstep\(-4, 34, y\);/.test(nightSrc)
      && /mix3\(SKY_HORIZON\[c\], SKY_ZENITH\[c\], k\)/.test(nightSrc)
      && lin41(palette.find((c) => c.name === 'SKY_HORIZON').v)
        > lin41(palette.find((c) => c.name === 'SKY_ZENITH').v) * 2);

  /*
   * 🚨 W41h — THE PREMISE CHECK, and the reason it is a gate rather than a comment: the whole
   * argument for this file existing is that the party path has no exterior module. If that ever
   * stops being true, `ballroom-night.js`'s header is stale and the two systems would be drawing
   * the same outside twice.
   */
  const gameSrc4 = await readFile(new URL('../src/views/game.js', import.meta.url), 'utf8');
  const bedSrc4 = await readFile(new URL('../src/game/follow-bed.js', import.meta.url), 'utf8');
  const pfSrc4 = await readFile(new URL('../src/views/party-follow.js', import.meta.url), 'utf8');
  t('W41h · the party path still has no exterior module — which is why this file exists',
    !/buildExterior/.test(bedSrc4) && !/buildExterior/.test(pfSrc4)
      && !/from '\.\.\/views\/game\.js'/.test(bedSrc4));
  t('W41h control · and views/game.js really is the one place that does import it',
    /import \{ buildExterior \} from '\.\.\/game\/exterior\.js';/.test(gameSrc4));

  /*
   * 🚨 W41i — THE TIME-OF-DAY BOUNDARY, AND IT IS THE RISKIEST LINE IN THE WHOLE CHANGE.
   *
   * `buildTestRoom` has exactly TWO callers and they are two different times of day: this party
   * NIGHT (`game/follow-bed.js`) and the playable run (`views/game.js`), which mounts
   * `game/exterior.js` and lights the outside with a LATE AFTERNOON SUN. A night backdrop
   * defaulted ON would hang a moonlit sky and lit windows outside a room the other view is busy
   * lighting with daylight — and would open its glazing onto both at once.
   *
   * So it is OPT-IN: the party bed asks, the daylight view says nothing and is bit-identical to
   * before. This gate is what keeps that true, because the failure would be invisible in every
   * party screenshot and only show up in the OTHER view.
   */
  t('W41i · the night exterior is opt-in, and only the party night opts in',
    /nightOutside: true/.test(bedSrc4)
      && /const BALLNIGHT = o\.nightOutside === true &&/.test(roomSrc4)
      && !/nightOutside/.test(gameSrc4));
  t('W41i2 control · the daylight view still builds its room the way it always did',
    /buildTestRoom\(engine, \{ wallField, panels: _panels \}\)/.test(gameSrc4)
      && /buildExterior\(\{/.test(gameSrc4),
    'views/game.js passes no night flag and still mounts the daylight yard');
  /*
   * ⚠️ …and the URL flag can only ever take it AWAY. There is deliberately no `?ballnight=1`
   * that forces a moonlit sky into the daylight view.
   */
  t('W41i3 control · ?ballnight can only ablate, never force it on somewhere it is off',
    /get\('ballnight'\) : null\) !== '0'/.test(roomSrc4)
      && !/get\('ballnight'\)\s*===\s*'1'/.test(roomSrc4));
}

/* =============================================================================================
 * W42 · 🚪 THE BALLROOM NEVER GETS A SMASH-DOOR, AND ITS OWN OPENINGS ARE ARCHES.
 *
 * John, from a generated night: *"when we use the generator to make new procedural room layouts
 * the ballroom should never have this dig door"* and *"I also want the whole arch to be the
 * doorway. the dig wasn't on that wall anyway."*
 * ============================================================================================= */
{
  const gen = await readFile(new URL('../src/world/genplan.js', import.meta.url), 'utf8');
  const roomSrc4 = await readFile(new URL('../src/game/room.js', import.meta.url), 'utf8');

  t('W42 · a wall touching the ballroom is never given a shut door',
    /const ballroomSide = typeOf\(a\) === 'ballroom' \|\| typeOf\(b\) === 'ballroom';/.test(gen)
      && /if \(SHUT_DOORS && !ballroomSide\) pushDoor\(a, b, run\); else pushPortal/.test(gen));
  /*
   * ⚠️ **IT DEGRADES, IT DOES NOT DELETE.** Dropping the row would remove a ROUTE, and this file's
   * own history records a connector that became "the ONLY way ANYONE enters the spur" the day
   * another was removed. An open portal carries every route the shut one did, so no seed can be
   * made unreachable by the rule.
   */
  t('W42a control · the rule degrades the door to an OPEN portal rather than removing the route',
    !/if \(ballroomSide\) continue;/.test(gen)
      && !/if \(ballroomSide\) return;/.test(gen));

  t('W42b · the ballroom\'s own openings are cut at the showcase\'s arch size',
    /const BALL_DOOR_W = 5\.20;/.test(gen) && /const BALL_DOOR_H = 4\.70;/.test(gen)
      && /const w = grand \? BALL_DOOR_W : Math\.min\(DOORWAY_W, run\.clear\)/.test(gen)
      && /h: grand \? BALL_DOOR_H : DOORWAY_H,/.test(gen));
  /*
   * ⚠️ `canDoor` only guarantees `L_DOOR` 2.48 m of clear run. A 5.2 m opening needs its own
   * jambs, so a run that cannot hold one must fall back rather than cut a hole wider than its wall.
   */
  t('W42b2 control · a run too short for a grand opening falls back to a normal doorway',
    /&& run\.clear >= BALL_DOOR_W \+ 2 \* 0\.20;/.test(gen));
  /*
   * ⚠️ 4.70, not 5.20: all four of this room's walls cap at SPLIT 4.80 and the upper wall run
   * starts there. Both are far above `PASS_H.hunter` 2.40, so nothing about passage changes.
   */
  t('W42b3 control · the grand opening stays under the storey cap the walls are built to',
    /const BALL_DOOR_H = 4\.70;/.test(gen) && 4.70 < 4.80);

  /*
   * With a real 5.2 m arch, a decorative one of the same width drawn concentric with it is a
   * second archivolt in the same millimetre — z-fighting, not architecture. The blind arch stays
   * for AUTHORED plans, where the opening is still a 1.90 m door.
   */
  t('W42c · the decorative blind arch stands down when the doorway is already grand',
    /if \(host\.w >= W - 0\.01\) return null;/.test(roomSrc4));
}

/* =============================================================================================
 * W41-W46 · 📺 THE RUN BEAT FITS ON A TELEVISION, AND THE BADGE MOVES WITHOUT THRASHING.
 *
 * The reaction strip was falling off the bottom of the screen. Measured on the real skin: at
 * 1920x1080, 24 px of every 74 px chip sat below the screen edge and the player's NAME was not
 * on the television at all; at 1280x720 it was 39 px and no names. Nothing LOOKED broken —
 * `.night.on-run .night-main` hides its overflow, so the bottom of the feature was simply
 * absent. That is fatal to this feature specifically, whose entire premise (`react.js` decision
 * 1) is that a reaction is ATTRIBUTED.
 *
 * ⚠️ **THESE ARE STRUCTURAL GATES, AND THE MEASURED ONE LIVES ELSEWHERE ON PURPOSE.** CI runs
 * `gates:party` with no `npm install` (see `.github/workflows/gates.yml`), so nothing in this
 * chain may drive a browser. `harness/react-fit.mjs` is the instrument that actually measures
 * the layout at five resolutions; it needs playwright and is deliberately out of the chain, the
 * same arrangement `harness/cam-clip-drive.mjs` documents. What is asserted HERE is the shape
 * that makes the layout self-correcting, so a later edit cannot quietly delete it.
 * ============================================================================================= */
{
  const skin = await readFile(new URL('../src/party/night-skin.js', import.meta.url), 'utf8');
  const rule = (sel) => skin.match(new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{[\\s\\S]*?\\}\\r?\\n`))?.[0] ?? '';
  const stage = rule('.night.on-run .run-stage');
  const frame = rule('.night.on-run .run-frame');
  // Anchored on the four-space indent: ".run-frame {" also matches INSIDE the longer
  // ".night.on-run .run-frame {" rule above it, which is a 45-character false positive.
  const base = skin.match(/\n {4}\.run-frame \{[\s\S]*?\}\r?\n/)?.[0] ?? '';

  t('W44-pre · the run-beat layout rules were actually extracted · an empty match fails HERE',
    stage.length > 20 && frame.length > 20 && base.length > 100,
    `stage ${stage.length} · frame ${frame.length} · base ${base.length} chars`);

  /*
   * The frame keeps TV_FRAME_PCT as a CEILING and is allowed to fall below it. `min-height:0` is
   * the load-bearing half: a flex item defaults to `min-height:auto`, which refuses to shrink
   * below its content — and that refusal is exactly what pushed the strip off the screen.
   */
  t('W44 · the picture takes what is LEFT OVER, so the strip is laid out first',
    /flex:\s*1 1 auto/.test(stage) && /min-height:\s*0/.test(stage)
      && /flex:\s*0 1 auto/.test(frame) && /min-height:\s*0/.test(frame),
    'run-stage 1 1 auto · run-frame 0 1 auto · both min-height:0');
  t('W44b · and TV_FRAME_PCT is still the ceiling, at 16:9 · the picture never GROWS to fill',
    /height:min\(\$\{TV_FRAME_PCT\}vh/.test(base) && /aspect-ratio:16\/9/.test(base)
      && !/flex:\s*0 0/.test(frame),
    'height stays a max, shrink stays enabled');

  /*
   * THE STRIP IS PATCHED PER EVENT. It used to assign `innerHTML` for the whole row, which
   * destroys and recreates every chip whenever any one of them changes — several times a
   * second during a run — restarting every rise. It then keyed on the PLAYER, which swallowed
   * spam: a second clap from the same seat reused the node. Keyed on `{from, at}` now, newest
   * first, with --dx so stacked taps do not ride the same path.
   */
  const host = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');
  // `\r?\n`, for the same reason W17a-pre carries it: a Windows checkout writes `}\r\n`.
  const painter = host.match(/function paintReactStrip\(\)[\s\S]*?\r?\n {2}\}\r?\n/)?.[0] ?? '';
  t('W45-pre · the strip painter was extracted', painter.length > 400, `${painter.length} chars`);
  t('W45 · one arrival is one chip keyed on the EVENT, not the player · spam stacks with --dx',
    !/mount\.innerHTML\s*=/.test(painter)
      && /dataset\.rk = rk/.test(painter)
      && !/dataset\.rk === e\.from/.test(painter)
      && /--dx/.test(painter)
      && /\(\(e\.at % 11\) - 5\) \* 12/.test(painter)
      && /b\.at - a\.at/.test(painter)
      && /el\.remove\(\)/.test(painter));

  /*
   * MOTION. Every loop rests at both ends and none alternate, so a chip replaced mid-flight
   * lands where it already was instead of snapping to the bottom of its cycle. Transform only —
   * the main thread on this beat is also feeding a WebGL mansion.
   */
  const frames = [...skin.matchAll(/@keyframes (badge-[a-z]+)\s*\{([^}]*\}[^}]*)\}/g)];
  t('W46-pre · the badge keyframes were extracted', frames.length === 4,
    frames.map((f) => f[1]).join(' · '));
  t('W46 · every badge loop rests at 0% AND 100%, animates only transform, and never alternates',
    frames.length === 4
      && frames.every((f) => /0%,\s*100%\s*\{\s*transform:\s*none;/.test(f[2]))
      && frames.every((f) => !/[^-]\b(?:opacity|width|height|stroke-width|r|cx|cy|d)\s*:/.test(f[2]))
      && !/animation:[^;]*alternate/.test(skin),
    'transform-only · rest at both ends · no alternate');
  t('W46b · the night screen finally has a reduced-motion block, and it covers the badge',
    /@media \(prefers-reduced-motion: reduce\)/.test(skin)
      && /\.bot-badge[\s\S]{0,160}animation: none !important/.test(skin),
    'badge · run-face · rec dot · react chip');
}

// ---- W36 · CASTING IS THE PICTURE — FULL-BLEED FEED, BALLOTS AS AN OVERLAY -----------------
//
// John, on the casting screen: drop the `n of m` ballot counter, the `live · casting · seat n`
// lower third and the `ballots land here` kicker; drop the `X walks · Y talks` hero because it is
// re-cast every episode; make the feed bigger and let it run into the right-hand column; and
// float the ballot results over the feed instead of beside it.
//
// The four cuts are asserted ABSENT rather than merely removed — this block is what stops any of
// them coming back the next time the beat is dressed. What is NOT cut is asserted too: the lamps
// and the bake bar are the two things on this screen that carry a fact nothing else carries.
{
  const hostSrc = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');
  const skin = await readFile(new URL('../src/party/night-skin.js', import.meta.url), 'utf8');

  t('W36 · post-walk casting is its own full-bleed stage, not a talk beat with a side column',
    /function castStage/.test(hostSrc)
    && /const onCast = show === 'casting' && ui\.introsSent && ui\.introsDone/.test(hostSrc)
    && /onCast \? ' on-cast' : ''/.test(hostSrc)
    && /body \+= castStage\(/.test(hostSrc)
    && !/aside: ballotBoard/.test(hostSrc));

  t('W36a · the frame takes all four edges — no padding, no letterbox, no side column',
    /\.night\.on-cast \.night-main \{ position:relative; padding:0; overflow:hidden/.test(skin)
    && /\.night\.on-cast \.intro-frame\.talk-frame \{ height:100%; width:100%/.test(skin)
    && /aspect-ratio:auto; margin:0; border:0; border-radius:0;\s*\r?\n\s*background:transparent/.test(skin));

  t('W36b · the overlay is bought by lifting night above the camera plate, not by inlining chrome',
    /\.night\.on-cast \{ z-index:6; background:transparent/.test(skin)
    && /body\.rrr-warming \.night\.on-cast \{ background:transparent/.test(skin)
    && /body\.rrr-cast \.run-cam-layer\.intros/.test(skin)
    && /classList\.toggle\('rrr-cast', onCast\)/.test(hostSrc)
    && skin.indexOf('.night.on-cast .night-main') > skin.indexOf('.night.on-talk .night-main'));

  t('W36c · ballots ride on the feed as slips, and the overlay language lives in look.js',
    /function castOverlay/.test(hostSrc)
    && /class="cast-overlay"/.test(hostSrc)
    && /cast-slip/.test(hostSrc)
    && SHOW_CHROME_CSS.includes('.cast-overlay')
    && SHOW_CHROME_CSS.includes('.cast-slip')
    && !/class="cast-overlay"/.test(SHOW_CHROME_CSS));

  t('W36d · the four things John cut are gone from the casting beat and stay gone',
    !/Ballots land here/.test(hostSrc)
    && !/whoSub: 'live · casting'/.test(hostSrc)
    && !/have sent a ballot/.test(hostSrc)
    && !/walks · /.test(hostSrc));

  // Control. The cuts were four NAMED lines, not "everything in the lower band": the lamp row is
  // the only thing on this screen that says who has not sent yet, and the bake bar is the only
  // honest progress during the window where no ballot can exist (W35c2). Both survive the
  // redress — as a lower third over the picture rather than a band under it.
  t('W36e control · the lamps and the bake bar survived the cut, as a strip over the picture',
    /class="cast-strip"/.test(hostSrc)
    && /board \? `<div class="cast-strip">/.test(hostSrc)
    && /const foot = baking \? `<div class="cast-warm">/.test(hostSrc)
    && /cast-lamp/.test(hostSrc)
    && SHOW_CHROME_CSS.includes('.cast-strip .cast-lamp'));

  // The strip and the 3·2·1 both want the bottom-left corner, so they are never on screen at once.
  t('W36f · the lamp strip stands down for the countdown instead of sharing its corner',
    /const counting = sendLeft != null \|\| hasPair/.test(hostSrc)
    && /board: counting \? '' : castBoard\(/.test(hostSrc)
    && /\.night\.on-cast \.actions \{ position:absolute/.test(skin));

  t('W36g · talk beats keep their reserved bands — the overlay is a casting-only exemption',
    /talk-chrome-bot/.test(hostSrc)
    && /talk-side/.test(hostSrc)
    && !/cast-overlay/.test(hostSrc.slice(0, hostSrc.indexOf('function castStage')))
    && !/\.night\.on-talk \.cast-overlay/.test(skin)
    && !/\.night\.on-talk \.cast-strip/.test(skin));
}

// ---- W37 · THE HIERARCHY IS THE RIGHT WAY UP ----------------------------------------------
//
// From the round-2 critic pass (`docs/design/loop-ui-critique.md`), whose thesis was one defect
// repeated on every beat: **the furniture is big and the live state is small.** On four of the
// eight beats the sentence that says what ENDS the beat was 12px grey at the bottom edge of a
// 1080p screen, while a nameplate naming NOBODY sat above it at 36-56px.
//
// Each of these locks one of the four cuts. They are source assertions and they know it: the
// claim "12px is unreadable from a sofa" is not a thing a regex can hold. What a regex CAN hold
// is that the plate is gated on a real person, that the count exists as its own element, and
// that the duplicated sentences are gone — and those are the changes.
{
  const hostSrc = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');
  const phoneSrc = await readFile(new URL('../src/views/party-phone.js', import.meta.url), 'utf8');
  const skin = await readFile(new URL('../src/party/night-skin.js', import.meta.url), 'utf8');

  t('W37 · a nameplate with nobody to name is not drawn',
    /const plate = who && whoId/.test(hostSrc)
    && /nameplateHtml\(\{ name: who/.test(hostSrc));

  // Control. The fallback WORDS may stay as call-site arguments — they are harmless once the
  // plate is gated on `whoId`, and `standingLead() || 'Reckoning'` still feeds other copy. What
  // must not come back is a plate drawn from `who` alone.
  t('W37 control · the gate is the player id, not the word — a beat name can never reach a plate',
    !/const plate = who\s*$/m.test(hostSrc)
    && !/const plate = who\s*\?/.test(hostSrc));

  t('W37a · the beat count is its own element, at its own size, beside the plate',
    /function readyState/.test(hostSrc)
    && /state: readyState\(\)/.test(hostSrc)
    // the count is in the band and NOT also in the kicker — one fact, once
    && !/kicker: readyKicker\(/.test(hostSrc)
    && /class="beat-state/.test(hostSrc)
    && /class="talk-band"/.test(hostSrc)
    && /\.beat-n \{ font-size:clamp\(38px/.test(skin)
    && /\.talk-kicker \{ margin:6px 0 0; text-align:left; color:var\(--night-soft\)/.test(skin)
    && !/\.talk-kicker \{[^}]*font-size:12px/.test(skin));

  // `readyState` reads the same wire field the kicker always did. It must stay a COUNT.
  t('W37a control · the promoted count still names nobody',
    /const r = client\.ready;/.test(hostSrc)
    && !/readyState[\s\S]{0,400}joinedName/.test(hostSrc)
    && !/readyState[\s\S]{0,400}\.name/.test(hostSrc));

  t('W37b · an empty board collapses its column instead of reserving a fifth of the TV',
    /if \(!rows\) return '';/.test(hostSrc)
    && /if \(!body\) return '';/.test(hostSrc)
    && !/Nobody has reached out yet\./.test(hostSrc)
    && !/Waiting on phones — nominate\./.test(hostSrc));

  t('W37c · the Execution says each of its facts exactly once',
    /function executionSwing/.test(hostSrc)
    && /verdict: executionSwing\(/.test(hostSrc)
    && /kicker: client\.lynchResult \? 'Casting is next\.' : 'Counting the ballot\.'/.test(hostSrc)
    // the tell for the old defect: `kicker` and `verdict` fed the SAME builder
    && !/kicker: executionLine\(/.test(hostSrc));

  // Control. `executionLine` is still the whole sentence and still used — the phone and the
  // event log want both facts in one string. Only the TV splits them.
  t('W37c control · executionLine survives for the surfaces that want one sentence',
    /function executionLine/.test(hostSrc));

  /*
   * ⚠️ **W37c2 · THE RESULT-LESS WINDOW.** Splitting one sentence into three elements deleted
   * `executionLine`'s `!result` fallback along with the duplicate it was duplicating — and that
   * fallback was the only thing on the screen when the Execution beat is reached before its
   * result is (a reconnecting TV; the beat landing a tick early). Caught by photographing the
   * beat with no `lynchResult` on the wire, where the screen announced the NEXT beat while this
   * one had said nothing. Every element on this beat is now result-gated in the same direction.
   */
  t('W37c2 · with no result on the wire the beat says so, rather than pointing at the next one',
    /kicker: client\.lynchResult \? 'Casting is next\.' : 'Counting the ballot\.'/.test(hostSrc)
    && /if \(!result\) return '';/.test(hostSrc));

  t('W37d · every tappable list on the phone carries the seat, the link list included',
    /data-link="\$\{esc\(p\.id\)\}"[^]{0,120}\$\{seatChip\(c, p\.id\)\}/.test(phoneSrc)
    && /\.picks button \{[^}]*display:flex/.test(skin)
    && /\.picks button \.seat-chip/.test(skin));

  // Control for W37d, and the reason the old gate missed this: counting CALL SITES is not the
  // same as covering every list. Four tappable/aired lists, four calls.
  t('W37d control · four lists, four seatChip calls — nominate, lynch, receipt, link',
    (phoneSrc.match(/seatChip\(c, /g) || []).length >= 4);
}

// ---- W38 · ROUND 2, GROUP A — the four the critic left on the table ------------------------
//
// F7 the talk frame had no slate · F6 the ribbon rail was unlabelled hairlines · F5 the
// role-card window used the top 45% of the screen · F12 the floating name tag was the last
// public list with no seat number. All from `docs/design/loop-ui-critique.md`, all photographed.
{
  const hostSrc = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');
  const skin = await readFile(new URL('../src/party/night-skin.js', import.meta.url), 'utf8');
  const plateSrc = await readFile(new URL('../src/characters/chest-nameplate.js', import.meta.url), 'utf8');
  const bedSrc = await readFile(new URL('../src/game/intro-bed.js', import.meta.url), 'utf8');

  // F7 · the Recap is reached with the follow still warming, so a talk frame with no slate is a
  // black rectangle over three quarters of the television. Same fade contract as the run slate.
  t('W38 · the talk frame has a slate, on the same .live contract as the run frame',
    /function talkSlateHtml/.test(hostSrc)
    && /talkSlateHtml\(beat\)/.test(hostSrc)
    && /talkSlateHtml\('casting'\)/.test(hostSrc)
    && /\.intro-frame\.live \.talk-slate \{ opacity:0/.test(skin));

  // Control. The talk beats have no single subject — that is why the nameplate stopped being
  // drawn on them — so the slate must not name anybody either.
  t('W38 control · the slate names nobody and claims nothing about the room',
    !/talkSlateHtml[\s\S]{0,400}joinedName/.test(hostSrc)
    && !/talkSlateHtml[\s\S]{0,400}recap\./.test(hostSrc));

  // F6 · Direction B's 22px ribbon is the rule and stays; what changed is that it no longer
  // spends the height by deleting eight of the nine labels.
  t('W38a · the ribbon rail keeps every label, dimmed by state rather than collapsed',
    /\.show-rail\.ribbon \.show-rail-k \{[^}]*height:10px/.test(SHOW_CHROME_CSS)
    && !/\.show-rail\.ribbon \.show-rail-k \{[^}]*height:0/.test(SHOW_CHROME_CSS)
    && /\.show-rail\.ribbon \.show-rail-seg\.past \.show-rail-k \{ opacity/.test(SHOW_CHROME_CSS)
    && /\.show-rail\.ribbon \{ height:22px/.test(SHOW_CHROME_CSS));

  // F5 · the role-card window is its own screen and now uses its own height.
  t('W38b · the role-card window lays out to the whole television',
    /const onCards = show === 'casting' && !ui\.introsSent/.test(hostSrc)
    && /onCards \? ' on-cards' : ''/.test(hostSrc)
    && /\.night\.on-cards \.night-main \{ display:flex; flex-direction:column; justify-content:center/.test(skin)
    && /\.night\.on-cards \.warm \{ max-width:none/.test(skin)
    // the strapline stopped competing with the kicker directly beneath it
    && /onRecap \|\| onCards \|\| show === 'lobby'/.test(hostSrc));

  // F12 · APPROVED AMENDMENT to the locked tag spec (John, 2026-08-28). The NAME's treatment is
  // untouched — black-outlined white, same stroke, same colours; a seat tab is added beside it.
  t('W38c · the floating name tag carries the seat, like every other public list',
    /function paintSeatTab/.test(plateSrc)
    && /paintPlate\(text, skin, tab\?\.seat \?\? null, tab\?\.accent \?\? null\)/.test(plateSrc)
    && /attachHeadNameTag\(body, seat\.name, \{ seat: seat\.seat, accent: seat\.accent \}\)/.test(bedSrc));

  // Control. No new data and no new channel: `seat` and `accent` were already on the intros cue
  // and already validated by `cueViolations`. If this ever needs a key that is not in
  // CUE_CAST_KEYS, that is a wire change and a different review.
  t('W38c control · the tab reads the cue it was already given, and adds no key to it',
    CUE_CAST_KEYS.includes('seat') && CUE_CAST_KEYS.includes('accent')
    && !/GLYPH_OUTLINE[\s\S]{0,80}strokeText/.test(plateSrc.slice(plateSrc.indexOf('function paintSeatTab'),
      plateSrc.indexOf('function paintPlate'))));

  /*
   * ⚠️ **W38c2 · `Number(null)` IS 0.** The first cut guarded the tab with `Number.isFinite`
   * alone, which passes for null and for '' — so every plate meant to have NO tab got a seat-1
   * one, merged pairs included. It was invisible to inspection and obvious to measurement: with
   * the bug, plates with and without a tab produced byte-identical glyph metrics, because both
   * were drawing a tab. The absent cases must be rejected before the numeric coercion.
   */
  t('W38c2 control · an absent seat is rejected before Number() can coerce it to zero',
    /if \(seat == null \|\| seat === ''\) return 0;/.test(plateSrc)
    && plateSrc.indexOf("seat == null") < plateSrc.indexOf('const n = Number(seat)'));

  // Control. A merged pair is ONE name over TWO robots: it has no single seat, so it gets no tab
  // rather than a tab naming the wrong half. And the tab joins the idempotence key, or a robot
  // coming back from a pair would keep the tabless plate for the rest of the night.
  /*
   * ⚠️ **THIS ASSERTED A CALL-SITE SPELLING AND THE CALL SITES LEGITIMATELY MOVED.** The
   * accusation stage collapsed the two `setNameTagLabel` sites into one `repaintTags()`, because
   * `setPairs` and `setNominees` write the SAME sprites and two writers racing one plate is its
   * own bug. The third argument is now a `skin` variable rather than a literal `null`, so the old
   * regex could not match code that behaves identically.
   *
   * What the control actually protects is unchanged and is what it now asserts: a merged pair
   * gets `null` for the tab (a seat number on a shared two-robot plate names the wrong half of it
   * half the time), and an unpaired robot's tab is rebuilt FROM `r.seat` on every repaint rather
   * than remembered — which is what makes unpairing restore it.
   */
  t('W38d control · a merged pair wears no seat tab, and unpairing restores the one it had',
    /if \(merged\) \{ setNameTagLabel\(r\.tag, merged, \{ ink: LINK_INK, chrome: LINK_CHROME \}, null\); continue; \}/.test(bedSrc)
    && /const tab = \{ seat: r\.seat\.seat, accent: r\.seat\.accent \};/.test(bedSrc)
    && /setNameTagLabel\(r\.tag, r\.seat\.name, skin, tab\)/.test(bedSrc)
    && /sprite\.userData\.tagTab === tabKey/.test(plateSrc));
}

// ---- W47 · THE VERDICT AND THE REUNION REACH A SCREEN --------------------------------------
//
// The wire got the Verdict beat on 2026-08-28 (`party-night` N17h0, `episode-order` E2b). A beat
// with no view is a black television for fifteen seconds, and a phone that goes blank because
// `isTalkBeat` now claims a beat its sheet has never heard of. These are the screens.
//
// 🚨 **THE HALF THIS BLOCK EXISTS FOR IS WHAT IS *NOT* ON THEM.** `rrr-social-round.md` §4 holds
// the feed count, every alignment and every role back until the Reunion — and `rule` is the same
// leak in a costume, because W3 is "evil fed the Hunter enough goods" spelled out in words. The
// server keeps them off the wire (`FANOUT_KEYS.verdict`); these keep them off the screen.
{
  const hostSrc = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');
  const phoneSrc = await readFile(new URL('../src/views/party-phone.js', import.meta.url), 'utf8');
  const clientSrc = await readFile(new URL('../src/party/night-client.js', import.meta.url), 'utf8');

  t('W47 · the TV has a Verdict branch and a Reunion branch, and neither is the chase',
    /show === 'verdict'/.test(hostSrc) && /show === 'reunion'/.test(hostSrc)
      && /verdictFacts\(/.test(hostSrc)
      && isTalkBeat('verdict') && isTalkBeat('reunion'));

  t('W47a · the phone draws both too — isTalkBeat now claims them, so a missing sheet is blank',
    /beat === 'verdict'/.test(phoneSrc) && /beat === 'reunion'/.test(phoneSrc)
      && /function paintVerdict/.test(phoneSrc) && /function paintReunion/.test(phoneSrc));

  /*
   * The sentence a status MEANS is one function in `win.js`, beside the machine that produces the
   * statuses — because the TV and the phone both say it, and two copies that must agree and can
   * drift is what `episode-order` exists to punish one layer up.
   */
  t('W47b · both screens read the outcome words from win.js — not a copy each',
    /outcomeLine\(/.test(hostSrc) && /outcomeLine\(/.test(phoneSrc)
      && !/'The season continues\. Casting is next\.'/.test(hostSrc)
      && !/'The season continues\. Casting is next\.'/.test(phoneSrc)
      && outcomeLine(OUTCOME.RENEWED).includes('continues')
      && outcomeLine(OUTCOME.CANCELLED).includes('Production wins')
      && outcomeLine(OUTCOME.FINALE).includes('cast wins')
      && outcomeLine(OUTCOME.ABANDONED).includes('Nobody wins')
      && outcomeLine(undefined).includes('deciding'),
    Object.values(OUTCOME).map(outcomeLine).join(' | '));

  /*
   * ⚠️ These match CODE, not prose. A bare `/\bfed\b/` failed on this block's own explanation of
   * why the feed count is withheld — a gate that forbids naming the thing it protects makes the
   * next person delete the argument to get green. `.fed` / `fed:` is the read or the write.
   */
  t('W47c control · no feed count and no fold rule anywhere near either screen',
    !/\.fed\b|\bfed\s*[:=]/.test(hostSrc) && !/\.fed\b|\bfed\s*[:=]/.test(phoneSrc)
      && !/verdict\.rule|v\.rule/.test(hostSrc) && !/verdict\.rule|v\.rule/.test(phoneSrc)
      && !/\.rule\b/.test(clientSrc)
      && /THERE IS NO `fed` ON THIS/.test(clientSrc));

  /*
   * ⚠️ The camera count on the plate is measured against the target THE FOLD USED, not the one
   * the running state carries. `COMPOSITION[8].cameras` is 3 and `WIN_TARGETS[8].cameraTarget`
   * is 4 — a real divergence, flagged rather than quietly picked — so a plate that read
   * `frame.cameras.needed` would print a target the rule never used.
   */
  t('W47d · the plate counts cameras against the fold\'s own target, carried on the wire',
    FANOUT_KEYS.verdict.includes('need') && FANOUT_KEYS.verdict.includes('camerasLit')
      && !FANOUT_KEYS.verdict.includes('fed') && !FANOUT_KEYS.verdict.includes('rule')
      && /v\.need/.test(hostSrc) && /v\.need/.test(phoneSrc)
      && !/frame\?\.cameras/.test(hostSrc.slice(hostSrc.indexOf("show === 'verdict'"),
        hostSrc.indexOf("show === 'casting'"))),
    FANOUT_KEYS.verdict.join(','));

  /*
   * 🛑 **SKIP TO REUNION.** One control, one call site, and both of its guards are behavioural
   * rather than cosmetic: it is offered only from a chair (`onStage`, which `show.js` owns — never
   * mid-expedition, where ending the session takes the run away from the one person playing), and
   * it takes TWO taps, because a remote gets sat on and there is no undo on the other side of
   * `host.skip`. The isTV half is the server's and is gated by `party-night` N17k.
   */
  t('W47f · SKIP TO REUNION is offered from a chair only, and it arms before it sends',
    /id="to-reunion"/.test(hostSrc)
      && /if \(onStage && show !== 'reunion'\)/.test(hostSrc)
      && /SKIP_ARM_MS = \d+/.test(hostSrc)
      && /ui\.skipArmedUntil = Date\.now\(\) \+ SKIP_ARM_MS/.test(hostSrc)
      && /client\.send\(\{ t: 'skip' \}\)/.test(hostSrc)
      // the send is behind the arm check, not beside it
      && /if \(Date\.now\(\) < ui\.skipArmedUntil\)[\s\S]{0,140}client\.send\(\{ t: 'skip' \}\)/.test(hostSrc));

  /* ===========================================================================================
   * 🎭 **W47e — REPLACED 2026-08-28.** This asserted that the Reunion screens revealed NOTHING,
   * which was true for exactly one commit: the payload was staged and the views were holding
   * frames. Leaving it would have made the gate an argument against finishing the beat. What
   * replaces it is the property that actually has to hold once the reveal exists.
   *
   * 🚨 **`null` IS DRAWN AS `null`.** The one risk the Reunion design has is a screen that renders
   * the reveal a beat before the beat, and the way that happens is a defaulted empty shape that
   * looks like an answer — `{seats: []}` reads as "the Reunion says nobody was anybody". Both
   * views take the payload optionally and neither invents one.
   * =========================================================================================== */
  t('W47e · both Reunion screens draw the reveal, and neither defaults it into existence',
    /client\.reveal/.test(hostSrc) && /c\.reveal/.test(phoneSrc)
      && /this\.reveal = null/.test(clientSrc)
      && !/reveal \|\| \{ seats/.test(clientSrc)
      && /Do not default this to an empty shape/.test(clientSrc));

  /*
   * ⚠️ **THE PHONE'S REUNION CARD MUST NOT COME FROM `role.card`.** The card this view has held
   * all game carries the player's COVER — the Glitched believes they are the Camera Op — so a
   * Reunion sheet built from it would tell them the lie one last time on the one screen whose
   * whole job is the truth. `reunion-truth` U2 caught exactly this substitution once already, in
   * the other direction. `believedTheyWere` is where the cover belongs and it is named as such.
   */
  t('W47g · the phone\'s face-up card is the reveal\'s row for this seat, not the role card',
    /c\.reveal\?\.seats \|\| \[\]\)\.find\(\(s\) => s\.id === me\?\.playerId\)/.test(phoneSrc)
      && /believedTheyWere/.test(phoneSrc)
      && !/state\.card[\s\S]{0,200}reunion/i.test(phoneSrc));

  /*
   * The Reunion is the one beat with no server clock — nothing after it decides what a phone may
   * do — so the television paces itself off one table. The arithmetic is checkable in bare node,
   * which is the whole reason the table is in `show.js` rather than four numbers in a view.
   */
  t('W47h · the Reunion\'s four beats spend exactly the budget phases.js set aside for them',
    REUNION_PLAN.reduce((a, b) => a + b.ms, 0) === SECONDS[PHASE.REUNION] * 1000
      && REUNION_PLAN.map((b) => b.beat).join(',') === 'rollCall,cut,awards,chat'
      && reunionBeatAt(0).beat === 'rollCall'
      && reunionBeatAt(SECONDS[PHASE.REUNION] * 1000 + 60_000).beat === 'chat'
      && rollCallRevealed(0, 8) === 1
      && rollCallRevealed(REUNION_PLAN[0].ms, 8) === 8
      && rollCallRevealed(1e9, 8) === 8
      && rollCallRevealed(1e9, 0) === 0,
    `${REUNION_PLAN.reduce((a, b) => a + b.ms, 0) / 1000}s of ${SECONDS[PHASE.REUNION]}s`);

  /*
   * 🚨 The reveal is the ONLY message allowed to carry a role or an alignment, and the exemption
   * is named rather than achieved by deleting the blocklist. `cover` is deliberately still
   * forbidden even there — `reunion.js` calls it `believedTheyWere`, which is its name in the
   * design and not a synonym invented to get past a list.
   */
  t('W47i · the reveal is a named exemption from FANOUT_FORBIDDEN, not a hole in it',
    FANOUT_FORBIDDEN.includes('role') && FANOUT_FORBIDDEN.includes('alignment')
      && FANOUT_FORBIDDEN.includes('cover') && FANOUT_FORBIDDEN.includes('castSeed')
      && FANOUT_KEYS.revealSeat.includes('role') && FANOUT_KEYS.revealSeat.includes('alignment')
      && !FANOUT_KEYS.revealSeat.includes('cover')
      && FANOUT_KEYS.revealSeat.includes('believedTheyWere')
      && fanoutViolations({
        t: 'reveal', seats: [{ id: 'p1', seat: 0, role: 'fixer', alignment: 'evil',
          believedTheyWere: null, finalClaim: null, death: null }], awards: [], decisive: null, chat: [],
      }).length === 0
      && fanoutViolations({
        t: 'reveal', seats: [{ id: 'p1', cover: 'cameraOp' }], awards: [], decisive: null, chat: [],
      }).length > 0
      && fanoutViolations({ t: 'lobby', seats: [{ id: 'p1', alignment: 'evil' }] }).length > 0,
    FANOUT_KEYS.revealSeat.join(','));
}

console.log(`\nparty-warm: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
