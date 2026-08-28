#!/usr/bin/env node
/**
 * party-follow — the D13 follow slot's closed schema, and the four ways it could leak.
 *
 *   node harness/party-follow.mjs
 *
 * `docs/slices/task-d13-tv-follow.md` §4.1. The follow view has no socket: everything it knows
 * arrives in a URL. That makes the URL a CHANNEL, and this gate is to that channel what
 * `party-isolation` is to the state frame and `fanoutViolations` is to the public side-channel.
 *
 * ⚠️ NO BROWSER, NO THREE, NO DEPENDENCY. `.github/workflows/gates.yml` runs the party gates with
 * no `npm install` step, deliberately, so a gate is never skipped for want of a module. What the
 * PIXELS do is `harness/party-follow-drive.mjs`'s job and it is not in this chain.
 *
 * 🚨 F4 IS THE CONTROL ARM AND IT IS THE POINT. `party-isolation`'s four injected leaks exist
 * because a gate whose controls stop failing has gone blind. Four deliberately leaky param sets
 * are built here and each one must be caught; if any of them stops being a violation, this file
 * is decorative.
 */

import {
  CAM_LABEL, FOLLOW_BEATS, FOLLOW_CHROME_CSS, FOLLOW_INSTRUMENTS, FOLLOW_KEYS, FOLLOW_FORBIDDEN,
  FOLLOW_VIEW, SHOT_NAMES, THROTTLES,
  CAM_MIN_DIST, CAM_LIFT, CAM_SWING, CHASE_DIST, CHASE_HEIGHT, CHASE_LOOK_Y,
  CUT_SHOTS, OVERHEAD, PERSPECTIVES, PERSPECTIVE_RIG, cueViolations, isOverhead,
  nextPerspective, perspectiveEye, rigMapness, runPerspective, cleanCampose,
  cleanThrottle, followParams, followUrl, followViolations, isFollowBeat,
  CHASE_LATERAL, PLAN_YAW, isPlanLocked, lerpRig, lookYaw, smootherstep,
  chaseOrbitOffset as chaseOrbitOffsetLike,
} from '../src/party/follow.js';
import { readFile } from 'node:fs/promises';
import { ACCENTS, SHELLS } from '../src/party/look.js';
import { isNightToken } from '../src/party/palette.js';
import { STUB_SHOW_PLAN, recapAfterMs } from '../src/party/show.js';
import { FANOUT_FORBIDDEN } from '../net/party/local.mjs';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

const LOOK = { shell: SHELLS[2], accent: ACCENTS[3] };
const SLOT = {
  beat: 'expedition', room: 'q7kd', runnerId: 'p3', name: 'Hai',
  look: LOOK, worldSeed: 3, origin: 'http://localhost:5178',
};

console.log('\nparty-follow — the TV follow slot');

// ---- F0 · the slot only exists on the run, and only with a runner ---------------------------
{
  t('F0 · lobby / casting / recap mount no camera',
    ['lobby', 'casting', 'recap', 'debrief', ''].every((beat) => followUrl({ ...SLOT, beat }) === null));
  t('F0b · expedition with no cast pair mounts no camera',
    followUrl({ ...SLOT, runnerId: null }) === null && followUrl({ ...SLOT, runnerId: '' }) === null);
  t('F0c · expedition is the only follow beat',
    FOLLOW_BEATS.length === 1 && isFollowBeat('expedition') && !isFollowBeat('recap'));
}

// ---- F1 · the run mounts the follow view, carrying what it needs and nothing else -----------
{
  const url = followUrl(SLOT);
  const q = new URL(url).searchParams;
  t('F1 · expedition + a runner mounts party.follow',
    !!url && q.get('view') === FOLLOW_VIEW, url);
  t('F1b · it carries the runner, the published name, the room and the public world seed',
    q.get('runner') === 'p3' && q.get('name') === 'Hai' && q.get('room') === 'q7kd' && q.get('seed') === '3');
  t('F1c · it carries the lobby cosmetics, so the cam light is the runner\'s own colour',
    q.get('shell') === LOOK.shell && q.get('accent') === LOOK.accent);
  t('F1d · throttle defaults to WALK and only the four pad values survive',
    q.get('throttle') === 'WALK'
      && THROTTLES.every((x) => cleanThrottle(x) === x)
      && cleanThrottle('SPRINT') === 'WALK' && cleanThrottle(null) === 'WALK');
  t('F1e · the origin is the page\'s own — a follow can never be pointed off-site',
    url.startsWith('http://localhost:5178/?'));
}

// ---- F2 · a real slot satisfies the closed schema -------------------------------------------
{
  t('F2 · a real slot has no schema violations',
    followViolations(followParams(SLOT)).length === 0);
  t('F2b · the url form and the object form agree',
    followViolations(followUrl(SLOT)).length === 0);
  t('F2c · every key a slot emits is on the allow-list',
    Object.keys({ ...followParams(SLOT), room: 'x' }).every((k) => FOLLOW_KEYS.includes(k)),
    FOLLOW_KEYS.join(','));
}

// ---- F3 · the TV cannot be handed more than the wire allows ---------------------------------
{
  const long = followParams({ ...SLOT, name: 'Bartholomew Cubbins' });
  t('F3 · the name is capped at 12 and lands with no ragged trailing space',
    long.name === 'Bartholomew' && long.name.length <= 12, `"${long.name}"`);
  const off = followParams({ ...SLOT, look: { shell: '#ff0000', accent: '#00ff00' } });
  t('F3b · an off-palette look is DROPPED, not passed through',
    off.shell === undefined && off.accent === undefined);
  const halfLook = followParams({ ...SLOT, look: { shell: SHELLS[0], accent: '#123456' } });
  t('F3c · half a look is no look — cleanLook is all-or-nothing',
    halfLook.shell === undefined && halfLook.accent === undefined);
  t('F3d · a non-numeric seed is dropped rather than smuggled as a string',
    followParams({ ...SLOT, worldSeed: 'castSeed' }).seed === undefined);
}

// ---- F4 · THE CONTROL ARMS. Four leaks, each must go red ------------------------------------
//
// These are `party-loop.md`'s own "Do not" list expressed as URL params. Each is a picture that
// would be on the shared screen if it were allowed:
//   flyover / marks  the guide's map — the thing the guide is paid to be the only source of
//   hunter          the hunter's position, which is the whole tension of "will they get taken?"
//   lid             `room.setLid(false)`. The house with its ceilings off IS a god-view.
{
  const LEAKS = [
    ['L1 flyover', { ...followParams(SLOT), flyover: '1' }],
    ['L2 marks', { ...followParams(SLOT), marks: '1.5,-2.0' }],
    ['L3 hunter', { ...followParams(SLOT), hunter: 'east' }],
    ['L4 lid', { ...followParams(SLOT), lid: '0' }],
  ];
  let caught = 0;
  for (const [label, params] of LEAKS) {
    const bad = followViolations(params);
    if (t(`F4 control ${label} · must be a violation`, bad.length > 0, bad.join(','))) caught++;
  }
  t('F4e · all four controls red — the gate can still see a leak', caught === 4, `${caught}/4`);
  t('F4f · an unknown key is a violation too — deny by default, not a deny-list',
    followViolations({ ...followParams(SLOT), debug: '1' }).length === 1);
  t('F4g · a slot pointed at another view is a violation',
    followViolations({ ...followParams(SLOT), view: 'game.play' }).length > 0);
  let threw = false;
  try { followUrl({ ...SLOT, tag: 'x'.repeat(64) }); } catch { threw = true; }
  t('F4h · a long tag is truncated rather than throwing — the cap is the schema', !threw);
}

// ---- F5 · the URL cannot be a way around the socket's own refusals ---------------------------
{
  const missing = FANOUT_FORBIDDEN.filter((k) => !FOLLOW_FORBIDDEN.includes(k));
  t('F5 · FOLLOW_FORBIDDEN is a superset of the side-channel\'s FANOUT_FORBIDDEN',
    missing.length === 0, missing.length ? `missing ${missing.join(',')}` : `${FOLLOW_FORBIDDEN.length} keys`);
  t('F5b · and it adds the three this channel introduces',
    ['marks', 'lid', 'plan'].every((k) => FOLLOW_FORBIDDEN.includes(k)));
  const overlap = FOLLOW_KEYS.filter((k) => FOLLOW_FORBIDDEN.includes(k));
  t('F5c · no key is both allowed and forbidden', overlap.length === 0, overlap.join(','));
}

// ---- F6 · the slot is a PURE function, or the TV reloads the mansion on every snapshot -------
//
// `party-host.js` recomputes this on every repaint and only assigns `iframe.src` when the string
// changed. If `followUrl` were not pure — a timestamp, a nonce, an object key order that drifted
// — that comparison would always fail, every lobby snapshot would reload the iframe, and the
// mansion would never finish baking. Slice §5.1.
{
  const a = followUrl(SLOT);
  const b = followUrl({ ...SLOT });
  t('F6 · the same inputs give the same url, byte for byte', a === b, a);
  const c = followUrl({ ...SLOT, name: 'Ellie' });
  t('F6b · and a real change does change it — the comparison is not vacuous', c !== a);
}

// ---- F7 · the run has to be long enough to be a show ----------------------------------------
//
// The stub clock was 4800 ms, which was right for a caption and is shorter than the mansion takes
// to bake on a cold tab — so the beat would flip to recap before the camera it exists to hold had
// a first frame, and the whole slice would present as "the follow does not work". Measured on a
// software rasteriser: 22.6-23.7 s to the follow's first rendered frame. Asserted here rather
// than in `party-night`, because it is this slice's number and this slice's reason.
{
  t('F7 · expedition is still immediate — the TV never waits on a host click',
    (STUB_SHOW_PLAN.find((s) => s.beat === 'expedition')?.ms ?? 1) === 0);
  t('F7b · and the run is long enough to hold a produced beat, not a caption',
    recapAfterMs() >= 20000, `${(recapAfterMs() / 1000).toFixed(0)} s`);
}

// ---- F8 · the overlay cannot drift off the night's palette --------------------------------
//
// `role-peek` P11's assertion, applied to the surface that needs it most. The card at least lives
// in the same document as `injectNightSkin()`; this overlay is inside an IFRAME and inherits
// nothing, so a reskin that missed it would leave one stale surface on the biggest screen in the
// room and no gate would say so. Same reasoning, one frame further out.
//
// The blacks that survive are photographic rather than brand — the letterbox matte is the absence
// of picture, and the shadows are what keep white type legible over a lit room. They are permitted
// BY NAME here rather than by a regex that happens not to catch them, so the exception is a
// decision a reader can see rather than a hole.
{
  const hex = FOLLOW_CHROME_CSS.match(/#[0-9a-f]{3,8}\b/gi) || [];
  t('F8 · the overlay CSS holds no hex of its own', hex.length === 0, hex.join(',') || 'no literals');

  const colours = FOLLOW_CHROME_CSS.match(/rgba?\([^)]*\)/gi) || [];
  const notBlack = colours.filter((c) => !/^rgba?\(\s*0\s*,\s*0\s*,\s*0\s*[,)]/i.test(c));
  t('F8b · and the only literal colours left are black — matte, shadow, vignette',
    notBlack.length === 0, notBlack.join(',') || `${colours.length} blacks`);

  const used = [...new Set([...FOLLOW_CHROME_CSS.matchAll(/var\((--[a-z-]+)/g)].map((m) => m[1]))];
  const orphans = used.filter((n) => !isNightToken(n));
  t('F8c · every variable it reaches for is a palette name',
    used.length >= 4 && orphans.length === 0, orphans.join(',') || `${used.length} tokens`);

  t('F8d · the camera names itself, and the overlay never names a room',
    /^RRR CAM \d\d$/.test(CAM_LABEL)
      && !/gallery|ballroom|study|chapel|service|corridor/i.test(FOLLOW_CHROME_CSS),
    CAM_LABEL);
}

// ---- F9 · the instruments the docs advertise have to actually open ---------------------------
//
// 🚨 THE BUG THIS GATE EXISTS FOR SHIPPED IN THE FIRST DRAFT AND A HOSTILE REVIEW CAUGHT IT, NOT
// A GATE. `party-follow.js` reads `?still=` and `?shot=` and the PR's how-to advertises both, and
// neither was on the allow-list — so every camera-alone URL in the documentation threw
// "forbidden or unknown params" at the door. A closed schema is only as closed as its list is
// COMPLETE; a list that omits something the code already reads is not strict, it is broken.
//
// The two halves are asserted separately on purpose. Accepting an instrument at the door and
// never EMITTING one are different properties, and folding `still` into `FOLLOW_KEYS` would have
// satisfied the first while quietly voiding F2c — a TV that started shipping `still=1` to the
// whole room would then have passed its own gate.
{
  const url = `?view=${FOLLOW_VIEW}&runner=p1&name=Hai&seed=1&still=1&shot=lead`;
  t('F9 · the camera-alone URL the docs advertise opens — ?still=1 and ?shot=lead are accepted',
    followViolations(url).length === 0, followViolations(url).join(',') || 'clean');
  for (const shot of SHOT_NAMES) {
    if (!t(`F9b · ?shot=${shot} is a shot the operator actually has`,
      followViolations({ view: FOLLOW_VIEW, runner: 'p1', shot }).length === 0)) break;
  }
  t('F9c control · a shot the bed does not have is a violation, not a silent no-op',
    followViolations({ view: FOLLOW_VIEW, runner: 'p1', shot: 'leed' }).length === 1,
    'a mistyped pin would otherwise read as the cut logic being broken');

  const slot = followParams(SLOT);
  t('F9d · and a host-built slot emits neither instrument — they are typed, never sent',
    FOLLOW_INSTRUMENTS.every((k) => slot[k] === undefined)
      && !followUrl(SLOT).includes('still=') && !followUrl(SLOT).includes('shot='));
  const overlap = FOLLOW_INSTRUMENTS.filter((k) => FOLLOW_KEYS.includes(k));
  t('F9e · the two lists are disjoint, so F2c still means what it says',
    overlap.length === 0, overlap.join(',') || `${FOLLOW_KEYS.length} sent, ${FOLLOW_INSTRUMENTS.length} typed`);
  t('F9f · an instrument cannot smuggle a forbidden name',
    FOLLOW_INSTRUMENTS.every((k) => !FOLLOW_FORBIDDEN.includes(k)));
}

/* =============================================================================================
 * F10 · 🎥 THE LENS STOPPED CLIMBING INSIDE THE PLAYER, AND THE STICK STOPPED ROTATING WITH IT.
 *
 * John, playing the expedition: *"navigating the mansion is clunky with the camera and controls
 * (if the camera clips the wall it pushes into the players robot and the direction of the
 * movement is affected)."* One sentence, one root cause, two symptoms — and the second one is
 * the serious half, because controls that rotate under a thumb read as the game being broken.
 *
 * `follow-bed.js` imports THREE, so the operator is read as text here and the geometry is
 * re-derived from the exported constants. The FELT behaviour is measured in a real browser by
 * `harness/cam-clip-drive.mjs`, which walks a runner into walls and records the closest the lens
 * ever gets and how far the stick's frame moves while it does.
 * ============================================================================================= */
{
  const bed = await readFile(new URL('../src/game/follow-bed.js', import.meta.url), 'utf8');

  /*
   * ⚠️ THE CONTROL IS THE ARITHMETIC. The old ladder pulled in to 0.20 of the chase distance —
   * 0.58 m from the chest of a robot about half a metre across. The floor has to EXCLUDE that
   * case by number, not by taste, or a later tune could quietly walk back into it.
   */
  t('F10 · the lens has a minimum distance, and it excludes the old worst case',
    CAM_MIN_DIST >= 1.0 && CAM_MIN_DIST < CHASE_DIST
      && 0.20 * CHASE_DIST < CAM_MIN_DIST,
    `floor ${CAM_MIN_DIST}m · the old ladder reached ${(0.2 * CHASE_DIST).toFixed(2)}m`);

  t('F10a · and the reel clamps to it on every candidate, not just the last',
    /Math\.max\(CAM_MIN_DIST, dist \* c\.k\)/.test(bed));

  /*
   * ⚠️ **BOTH REELS, NOT JUST THE ONE JOHN HIT.** This control was written for the run camera and
   * immediately failed on a SECOND copy of the same ladder in `reelToSight` — the warm and intro
   * cameras — whose own last resort put the eye ON the target and lifted it 30 cm, i.e. inside
   * the head of the robot walking in. That is the camera the room stares at for half a minute
   * while the mansion bakes, and nothing had ever flagged it.
   */
  t('F10b control · neither reel walks the eye down a ladder into the target any more',
    !/lerp\(eye, k\)/.test(bed)
      && !/for \(let k = 0\.75; k >= 0\.2/.test(bed)
      && !/eye\.copy\(at\);/.test(bed)
      && (bed.match(/Math\.max\(CAM_MIN_DIST/g) || []).length === 2,
    `${(bed.match(/Math\.max\(CAM_MIN_DIST/g) || []).length} of 2 reels floored`);

  /*
   * Pulling in is the most destructive correction — it changes how big the player is on screen,
   * which is the framing cue the runner steers by. Swinging and lifting must be tried first.
   */
  const tries = bed.slice(bed.indexOf('const REEL_TRIES'), bed.indexOf('class FollowOperator'));
  const first = tries.slice(0, tries.indexOf('{ k: 0.75'));
  t('F10c · swing and lift are tried at full distance BEFORE the lens pulls in',
    /CAM_SWING/.test(bed) && /CAM_LIFT/.test(bed)
      && (first.match(/k: 1,/g) || []).length >= 5
      && /swing: 0\.5/.test(first) && /swing: -0\.5/.test(first) && /lift: 1/.test(first),
    `${(first.match(/k: 1,/g) || []).length} full-distance tries first`);
  // Every swing magnitude, not a hand-listed few — the ladder has been retuned once already.
  const swings = [...tries.matchAll(/swing: (-?[\d.]+)/g)].map((m) => Number(m[1])).filter((v) => v !== 0);
  const bag = swings.slice().sort((a, b) => a - b);
  t('F10c2 control · every swing is paired with its mirror — no favourite shoulder',
    swings.length >= 8 && bag.every((v, i) => v === -bag[bag.length - 1 - i]),
    `${swings.length} swings: ${[...new Set(bag.map(Math.abs))].join('/')}`);

  /* =========================================================================================
   * 🚨 **THE FLOOR IS ENFORCED ON THE DELIVERED EYE, NOT ONLY ON THE TARGET.**
   *
   * This project has paid for that distinction before: a correctly-derived constant can still
   * ship wrong. Every `_reel` candidate was a legal 1.15 m or more and the drive still measured
   * the lens at **0.42 m** — worse than the 0.58 m defect it replaced — because the eye is LERPED
   * toward its target in a straight line, and the chord of a wide swing passes through the
   * runner. A gate that only reads the candidate ladder would have called that fixed.
   * ========================================================================================= */
  t('F10f · and the floor is re-applied AFTER the smoothing, to the eye the player looks through',
    /this\.eye\.lerp\(this\._want, k\);/.test(bed)
      && bed.indexOf('eDist < CAM_MIN_DIST') > bed.indexOf('this.eye.lerp(this._want, k);')
      && /this\.eye\.x = runner\.pos\.x \+ ex \* s;/.test(bed));

  /*
   * 🕹️ THE HALF THAT MATTERS. `_lockYaw` is the yaw the player is steering; nothing but the look
   * stick writes it. Reading it FIRST is what makes the frame immune to any camera correction.
   */
  const basis = bed.slice(bed.indexOf('basisYaw() {'), bed.indexOf('basisYaw() {') + 320);
  t('F10d · the stick frame is the STEERED yaw, read before anything measures the lens',
    /if \(this\._lockYaw != null\) return this\._lockYaw;/.test(basis)
      && basis.indexOf('this._lockYaw') < basis.indexOf('this.look.x'));
  t('F10d2 control · and the last resort no longer snaps the frame onto the body',
    !/runner\.facing\), -1\.2\)/.test(bed)
      && /const f = this\.basisYaw\(\);/.test(bed));

  /*
   * The old fallback dropped the eye behind `runner.facing`. On a live run the player may be
   * steering a lens up to 180° from the way the body happens to point, so that single line could
   * reverse the controls in one frame at the worst possible moment.
   */
  /*
   * ⚠️ **THIS USED TO COUNT `_lockYaw =` ASSIGNMENTS AND CAP THEM AT SIX.** That was a proxy for
   * the real claim — *geometry never writes the steered frame* — and the proxy broke the moment
   * the frame legitimately grew arms it did not have (plan lock, and the slerp into it), while
   * the claim itself was never in danger. A count cannot tell a new steering rule from a leak.
   *
   * So assert the claim directly: the two functions that CORRECT a shot around geometry —
   * `_valid` and `_reel` — must not contain a single write to `_lockYaw`. That is stronger than
   * the count ever was (a seventh assignment inside `_reel` would have passed at five), and it
   * cannot go stale when the steering grows.
   */
  const methodBody = (name) => {
    const i = bed.indexOf(`\n  ${name}(`);
    if (i < 0) return '';
    const j = bed.indexOf('\n  }', i);
    return j < 0 ? bed.slice(i) : bed.slice(i, j);
  };
  const reelBody = methodBody('_reel');
  const validBody = methodBody('_valid');
  t('F10e · a chase-locked run therefore cannot have its controls rotated by geometry at all',
    /liveRunShot/.test(bed) && /this\._lockYaw = orbit\.yaw;/.test(bed)
      && reelBody.length > 0 && validBody.length > 0
      && !/this\._lockYaw\s*=/.test(reelBody) && !/this\._lockYaw\s*=/.test(validBody),
    `_reel ${reelBody.length}b · _valid ${validBody.length}b · neither writes the frame`);
}

/* =============================================================================================
 * F11 · 🎥 THE FOUR PERSPECTIVES — chase · wide · iso · top, on one live key.
 *
 * John: *"ship the perspective toggles. The roof will probably need to be see through so they
 * work. The control and camera may also need to adapt the method for the different perspective
 * positions."* All three sentences are asserted below; the pictures are taken by
 * `harness/perspective-shots.mjs`, which also proves the roof actually came off.
 * ============================================================================================= */
{
  const bed = await readFile(new URL('../src/game/follow-bed.js', import.meta.url), 'utf8');
  const host = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');

  t('F11 · four perspectives, and the key cycles them in a closed loop',
    PERSPECTIVES.length === 4
      && PERSPECTIVES.every((p) => !!PERSPECTIVE_RIG[p])
      && nextPerspective(PERSPECTIVES[PERSPECTIVES.length - 1]) === PERSPECTIVES[0]
      && nextPerspective('nonsense') === PERSPECTIVES[0],
    PERSPECTIVES.join(' → '));

  /*
   * ⚠️ **THE DIRECTOR MUST NEVER CUT TO A PERSPECTIVE.** It cuts between its shots on a timer.
   * A director that decided to try `top` for five seconds mid-corridor would be taking the
   * controls off the player — the same class of defect as the auto-cuts a live run already
   * forbids, which is why `liveRunShot` exists at all.
   */
  t('F11a · a perspective is HELD, never cut to — the director cannot reach one',
    PERSPECTIVES.filter((p) => p !== 'chase').every((p) => !CUT_SHOTS.includes(p))
      && bed.includes('const DIRECTOR_SHOTS = CUT_SHOTS;')
      && /_pick\(\) \{\s*\r?\n\s*const pool = DIRECTOR_SHOTS/.test(bed),
    `director pool: ${CUT_SHOTS.join(' ')}`);
  t('F11a2 control · but they are still valid names, or the cue and ?shot= could not carry one',
    PERSPECTIVES.every((p) => SHOT_NAMES.includes(p))
      && PERSPECTIVES.every((p) => cueViolations({ kind: 'shot', shot: p }).length === 0)
      && cueViolations({ kind: 'shot', shot: 'godview' }).length > 0);

  /*
   * 🎥 The rigs, as geometry. An overhead view that could be pitched is a chase camera with extra
   * steps, and tilting it is how a player loses the map they came to the view for.
   */
  const pitchMoves = (p) => {
    const a = perspectiveEye(p, 0, 0);
    const b = perspectiveEye(p, 0, 0.5);
    return Math.abs(a.y - b.y) > 0.01;
  };
  t('F11b · the ground rigs pitch with the look stick and the overhead rigs refuse to',
    pitchMoves('chase') && pitchMoves('wide')
      && !pitchMoves('iso') && !pitchMoves('top')
      && PERSPECTIVE_RIG.iso.orbit === false && PERSPECTIVE_RIG.top.orbit === false);

  /*
   * 🏠 **THE ROOF.** John called this before a line was written. The overhead eyes are ABOVE a
   * storey by construction, so the lid HAS to come off — and `_valid` has to stop refusing them,
   * or the reel fights the rig on every frame.
   */
  const STOREY = 4.8;
  t('F11c · the overhead eyes really are above the roof — so the lid must come off',
    OVERHEAD.every((p) => PERSPECTIVE_RIG[p].height > STOREY)
      && !OVERHEAD.includes('chase') && !OVERHEAD.includes('wide')
      && PERSPECTIVE_RIG.wide.height < STOREY,
    OVERHEAD.map((p) => `${p} ${PERSPECTIVE_RIG[p].height}m vs storey ${STOREY}m`).join(' · '));
  /*
   * ⚠️ **THE LID RULE IS NOW A HEIGHT, NOT A PERSPECTIVE NAME**, and that is a strengthening
   * rather than a rewording. `isOverhead(want)` fired the instant the name changed, so on a
   * crane the ceiling vanished while the camera was still on the floor. `LID_LIFT_H` fires when
   * the eye is about to rise THROUGH the roof, which makes the rule symmetric on the way back
   * down for free and reproduces the name test exactly on the four table rigs.
   */
  const lidLift = Number((bed.match(/const LID_LIFT_H = ([\d.]+);/) || [])[1]);
  t('F11c2 · and the bed takes it off, plus what HANGS from it, on change only',
    /room\.setLid\?\.\(!lidOff, lidOff \? \(room\.residentIds\?\.\(\) \?\? null\) : null\)/.test(bed)
      && /setHangers\(lidOff\)/.test(bed)
      && /chandelier\|pendant/.test(bed)
      && /if \(lidOff !== perf\.lidOff\)/.test(bed));
  /*
   * 🚨 **AND IT COMES OFF ONLY OVER THE RUNNER'S OWN ROOMS.** `party-loop.md`'s "Do not" #1 is
   * NARROWED here, not repealed: a roof off over the whole house lets the shared screen read
   * over walls into rooms the runner has never entered, which is the guide's private map
   * arriving by another route. `CRITIC-LEDGER` round 8 raised exactly this and John answered it.
   * The scope is residency's own set, so it cannot drift from what the camera can actually see.
   */
  t('F11c2d · and only over the rooms residency admits — never the whole house',
    /room\.setLid\?\.\(false, ids\)/.test(bed)
      && /const ids = room\.residentIds\?\.\(\) \?\? null;/.test(bed)
      && /if \(key !== perf\.lidScope\)/.test(bed));
  t('F11c2b · the roof lifts BEFORE the eye reaches it — the threshold is under a storey',
    Number.isFinite(lidLift) && lidLift > PERSPECTIVE_RIG.chase.height && lidLift < STOREY - 1.0,
    `LID_LIFT_H ${lidLift}m under a ${STOREY}m storey`);
  t('F11c2c · and that one height still sorts the four rigs exactly as the name test did',
    PERSPECTIVES.every((p) => (PERSPECTIVE_RIG[p].height >= lidLift) === OVERHEAD.includes(p)),
    PERSPECTIVES.map((p) => `${p} ${PERSPECTIVE_RIG[p].height}m`).join(' · '));
  t('F11c3 control · and it restores only what it took, never what something else hid',
    /if \(e\.o\.visible\) \{ e\.o\.visible = false; e\.took = true; \}/.test(bed)
      && /else if \(e\.took\) \{ e\.o\.visible = true; e\.took = false; \}/.test(bed));

  /*
   * The two adaptations John predicted the camera would need. The CONTROLS needed none, and that
   * is a result rather than an omission — F10d made the stick's frame `_lockYaw`, which is a real
   * yaw even looking straight down, where a camera-derived frame is degenerate.
   */
  t('F11d · the shot-correction logic stands down for an overhead rig',
    /if \(isOverhead\(this\.shot\)\) return true;/.test(bed)
      && /!isOverhead\(this\.shot\) && eDist > 1e-4/.test(bed));
  /*
   * The lamp still climbs off the lens and over the runner — it just CROSSFADES there now
   * instead of swapping in one frame, which on a `P` press was a ×10 intensity jump in the
   * middle of what is now a camera move. `mapness` is the mixer, and it is 0 at the chase rig,
   * so the ground recipe is still the shipped 3.5 / 1.4 exactly.
   */
  t('F11d2 · and the key light moves over the runner, because a point light 9 m up never arrives',
    /const lampMap = rigMapness\(perf\.liveRig\);/.test(bed)
      && /camLight\.distance = mix\(3\.5, up \* 1\.5\);/.test(bed)
      && /camLight\.intensity = mix\(1\.4, 6\.0 \+ up \* 0\.9\);/.test(bed));
  t('F11d3 · the handheld and the lag fade out as the view becomes a map, and are UNTOUCHED on the ground',
    rigMapness(PERSPECTIVE_RIG.chase) === 0
      && rigMapness(PERSPECTIVE_RIG.top) === 1
      && rigMapness(PERSPECTIVE_RIG.iso) > rigMapness(PERSPECTIVE_RIG.wide)
      && /\(1 - mapness\)/.test(bed)
      && /6\.5 \+ 26 \* mapness/.test(bed),
    PERSPECTIVES.map((p) => `${p} ${rigMapness(PERSPECTIVE_RIG[p]).toFixed(2)}`).join(' · '));

  /*
   * 🚨 **TWO SOURCES OF ONE TRUTH, AND NOTHING ASSERTED THEY AGREED.** `chaseOrbitOffset` reads
   * `CHASE_DIST` / `CHASE_HEIGHT` / `CHASE_LATERAL`; `PERSPECTIVE_RIG.chase` carries the same
   * three numbers again. That was harmless while only `chaseOrbitOffset` drew the chase — but
   * the crane has to solve the DROP through `perspectiveEye` (the lock is already `chase` on the
   * first frame of coming home, so the old path would put the eye at 1.62 m instantly and the
   * 9 m move would never be seen). Both paths now draw the chase, so the day the two tables
   * disagree the camera would jump at the end of every drop, and this is the line that says so.
   */
  t('F11g · the chase rig and the chase constants are the same camera, to the millimetre',
    PERSPECTIVE_RIG.chase.dist === CHASE_DIST
      && PERSPECTIVE_RIG.chase.height === CHASE_HEIGHT
      && PERSPECTIVE_RIG.chase.lateral === CHASE_LATERAL,
    `rig ${PERSPECTIVE_RIG.chase.dist}/${PERSPECTIVE_RIG.chase.height}/${PERSPECTIVE_RIG.chase.lateral}`
      + ` vs const ${CHASE_DIST}/${CHASE_HEIGHT}/${CHASE_LATERAL}`);
  {
    // ...and they solve to the same eye, which is the thing that actually has to hold.
    const a = perspectiveEye(PERSPECTIVE_RIG.chase, 0.7, 0.12);
    const b = chaseOrbitOffsetLike(0.7, 0.12);
    t('F11g2 · and they solve to the same eye offset at a live yaw and pitch',
      Math.abs(a.x - b.x) < 1e-12 && Math.abs(a.y - b.y) < 1e-12 && Math.abs(a.z - b.z) < 1e-12,
      `(${a.x.toFixed(4)}, ${a.y.toFixed(4)}, ${a.z.toFixed(4)})`);
  }

  t('F11e · a live run holds the chosen perspective, and a typed ?shot= still wins',
    runPerspective('run', null, 'top') === 'top'
      && runPerspective('run', null, null) === 'chase'
      && runPerspective('run', null, 'garbage') === 'chase'
      && runPerspective('run', 'lead', 'top') === 'lead'
      && runPerspective('warm', null, 'top') === null);

  t('F11f · P cycles it on the dev TV, over the cue channel that already exists',
    /e\.key !== 'p' && e\.key !== 'P'/.test(host)
      && /ui\.perspective = nextPerspective\(ui\.perspective \|\| 'chase'\)/.test(host)
      && /sendCue\(\{ kind: 'shot', shot: ui\.perspective \}\)/.test(host)
      && /P CAMERA/.test(host));
  t('F11f2 control · and it is behind ?dev=1, like every other key that changes the show',
    host.indexOf("params.get('dev') === '1'") < host.indexOf("e.key !== 'p'"));

  /* ===========================================================================================
   * 📐 F12 · `?campose=` — STAND THE SHOW CAMERA WHERE THE ASSET'S CAMERA STANDS.
   *
   * John: *"how can we verify that we actually have everything? We need to compare the exact
   * files visibly open and compare each until it is perfect."* `shoot.mjs --cam` could already
   * pose the asset; the show camera could not be posed at all, so the two rooms could never be
   * photographed from the same spot and "is it ported yet" was answered from memory — wrongly,
   * three times.
   * =========================================================================================== */
  t('F12 · a pose is six or seven finite numbers, and nothing else',
    !!cleanCampose('1,2,3,4,5,6')
      && cleanCampose('1,2,3,4,5,6,50')?.fov === 50
      && cleanCampose('1,2,3,4,5,6')?.fov === null);
  t('F12a control · anything else is refused rather than half-applied',
    cleanCampose(null) === null
      && cleanCampose('1,2,3') === null
      && cleanCampose('1,2,3,4,5,6,7,8') === null
      && cleanCampose('1,2,3,4,5,six') === null
      && cleanCampose('1,2,3,1,2,3') === null            // a camera cannot look at itself
      && cleanCampose('1,2,3,4,5,6,900') !== null
      && cleanCampose('1,2,3,4,5,6,900')?.fov === null); // an absurd fov is dropped, not obeyed

  t('F12b · it is an INSTRUMENT — typed at the door, never emitted by a host-built slot',
    FOLLOW_INSTRUMENTS.includes('campose')
      && !FOLLOW_KEYS.includes('campose')
      && followViolations({ ...followParams(SLOT), campose: '1,2,3,4,5,6' }).length === 0);

  /*
   * ⚠️ **A PINNED POSE MUST OWN THE CAMERA OUTRIGHT.** An operator that still lagged, swayed and
   * handheld-jittered a "fixed" pose would put every pair on the contact sheet a few centimetres
   * and a few degrees apart, and bury every real difference in that noise — which is exactly the
   * failure this instrument exists to end.
   */
  t('F12c control · and the operator never gets to touch a pinned frame',
    /if \(opts\.campose\) \{/.test(bed)
      && bed.indexOf('if (opts.campose) {') < bed.indexOf('const want = runPerspective(')
      && /engine\.camera\.lookAt\(c\.at\[0\], c\.at\[1\], c\.at\[2\]\);/.test(bed));
}

console.log(`\nparty-follow: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
