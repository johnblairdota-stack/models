#!/usr/bin/env node
/**
 * 📺 **tv-stinger — TV E "CAMERA STINGER", EXECUTED RATHER THAN EYEBALLED.**
 *
 *   node harness/tv-stinger.mjs
 *
 * John locked the board on 2026-09-01:
 * `docs/design/refs-runner-intel/canvas/TvFollowE.dc.html`. Its axis is that *"the camera count is
 * the run's only scoreboard, and a number is a weak thing to celebrate"* — so a mount becomes a
 * two-second moment instead of a digit ticking.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE ASSERTIONS RUN THE SHIPPED FUNCTIONS, NOT A COPY
 * ---------------------------------------------------------------------------------------------
 * Rung 3's lesson, third screen running. `link-merge` proved the whisper's privacy on the WIRE and
 * every check was about bytes while the chrome was a template literal inside a browser view;
 * `whisperLines`/`pairShape` moved into `link.js` so a node gate could execute them, and
 * `guidePad`/`runnerPad` moved into `intel-pad.js` for the same reason. `stinger.js` exists for
 * that reason and this file imports it directly — a leak has to get past the same function on both
 * machines, and the state machine has to survive the same clock.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT EACH CHECK IS FOR
 * ---------------------------------------------------------------------------------------------
 *   TS1   the beat itself — arm on the mount, fire when she is out, go at STINGER_MS
 *   TS2   **the board's own rule**: never fire on a camera the runner has not already left,
 *         including the three unanswerable shapes, which must all read NO
 *   TS3   the seal — deny-by-default over the board's absent list, with a planted needle
 *   TS3b  nothing hidden may collide with a visible key (the bug `carry` was one line from)
 *   TS3i  and the absent list is really the BOARD's, wherever the untracked canvas is on disk
 *   TS4   the sting is a MOMENT: it does not latch, does not restart, and one mount stings once
 *   TS5   a mount from an earlier episode cannot arm tonight
 *   TS6   🚨 **THE HUNTER CONTROL** — move him anywhere and the sting is byte-identical
 *   TS7   the chrome: what the television paints is a function of the shape and carries no string
 *   TS8   it is wired — the host steps it on the tick, keeps two named world fields, and the skin
 *         ships the CSS
 *   TS9   🚨 **THE FAIL-CLOSED GUARD** — the camera's picture has no wire, stated out loud, RED
 *         the day one lands
 *
 * Pure node. No browser, no port, no `npm install`.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CARRIED, STINGER_MS, STING_CSS, STING_FORBIDDEN, STING_KEYS, STING_READS,
  camLabel, hasLeft, isStinging, lastMount, sameRoom, stepSting, stingHtml, stingLeaks,
} from '../src/party/stinger.js';
import { FOLLOW_FORBIDDEN } from '../src/party/follow.js';

const here = dirname(fileURLToPath(import.meta.url));
/* ⚠️ NORMALISE NEWLINES. `host-desync` H8 was RED on Windows and GREEN in CI against byte-identical
 * content because a multi-line regex met CRLF — CLAUDE.md's standing note for source-reading
 * gates. Every pattern below that crosses a line break depends on this line. */
const src = (rel) => readFileSync(join(here, '..', rel), 'utf8').replace(/\r\n/g, '\n');
/** Same read, but `null` when the file is not in this tree. See the board note below. */
const maybe = (rel) => { try { return src(rel); } catch { return null; } };

let pass = 0, fail = 0;
const t = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); }
  return c;
};
const note = (s) => console.log(`  reading · ${s}`);

const hostSrc = src('src/views/party-host.js');
const skinSrc = src('src/party/night-skin.js');
const roomSrc = src('src/party/room.js');
const stingSrc = src('src/party/stinger.js');
/*
 * ⚠️ **THE BOARD IS IN-FLIGHT AND UNTRACKED, SO CI CHECKS OUT A TREE WITH NO CANVAS IN IT.**
 *
 * `friday-couch` FC3b paid for this exact lesson one gate over and wrote it down: a gate that read
 * an untracked file unconditionally would THROW before its first assertion on the one machine
 * anybody looks at, and would read as a *product* failure. `docs/design/refs-runner-intel/` is
 * John's design canvas and is not in git.
 *
 * So the deny list is checked TWO ways and neither of them is the optional one:
 *   · TS3h  the transcript below is covered by `STING_FORBIDDEN` — runs everywhere, CI included
 *   · TS3i  the transcript IS the board's own strip — runs only where the canvas is on disk, and
 *           reddens if either side drifts
 *
 * A transcript nobody ever compares against its source is a hand-kept list, which is the failure
 * `episode-order` is named after. This one is compared wherever the source exists, and the run
 * PRINTS which of the two arms it saw so a green tick cannot quietly mean "half of it".
 */
const boardSrc = maybe('docs/design/refs-runner-intel/canvas/TvFollowE.dc.html');

/** `TvFollowE.dc.html`'s "Not on the TV, at any second of the run" strip, transcribed. */
const ABSENT_STRIP = Object.freeze([
  'plan', 'minimap', 'room outline', 'whole-house fit', 'room name',
  'bearing pin', 'compass', 'heading', 'arrow', 'wedge',
  'route', 'breadcrumb', 'door count',
  'hunter mark', 'hunter bearing', 'hunter distance',
  'target glow', 'cyan edge', 'object caption',
]);

console.log('\n📺 tv-stinger — TV E, the camera stinger\n');

/* =================================================================================================
 * A NIGHT, IN FIVE FRAMES. One mount, one walk out, one clock.
 * ============================================================================================== */

const MOUNT = [{ type: 'run.camera_lit', seq: 41, data: { camera: 2, episode: 3, job: 'drill' } }];
const CAMS = { unlocked: 2, needed: 4 };
const IN_ROOM = { runnerRoom: 'r1.gallery', missionRoom: 'r1.gallery' };
const OUT = { runnerRoom: 'r2.hall', missionRoom: 'r1.gallery' };
const step = (prev, world, now, over = {}) =>
  stepSting(prev, { events: MOUNT, cameras: CAMS, world, now, episode: 3, ...over });

/* ---- TS1 · the beat ------------------------------------------------------------------------- */

const s0 = step(null, IN_ROOM, 1000);
const s1 = step(s0, OUT, 1100);
const s2 = step(s1, OUT, 1100 + STINGER_MS - 1);
const s3 = step(s2, OUT, 1100 + STINGER_MS);

t('TS1a', !isStinging(s0), 'mount lands while she is still in the room · dark');
t('TS1b', isStinging(s1), `she steps out · ${camLabel(s1.cam)} lights`);
t('TS1c', isStinging(s2), `still on air 1 ms before ${STINGER_MS} ms`);
t('TS1d', !isStinging(s3), `gone at ${STINGER_MS} ms · "then goes"`);
t('TS1e', s1.cam === 2 && s1.n === 2 && s1.need === 4,
  `the number is the EVENT's camera · ${s1.cam} of ${s1.need}`);
t('TS1f', STINGER_MS >= 1500 && STINGER_MS <= 2500,
  `~2 s, as the board captions it · ${STINGER_MS} ms`);

/* ---- TS2 · THE BOARD'S RULE ------------------------------------------------------------------ */
/*
 * *"the stinger must never fire on a camera the runner has not already left."* Three of these four
 * are the UNANSWERABLE shapes, and every one of them must read NO — that is what makes it a rule
 * rather than a hope. `hasLeft` never sees the world object, only two strings.
 */

t('TS2a', !isStinging(step(null, IN_ROOM, 9e6)), 'same room · never, at any clock');
t('TS2b', !isStinging(step(null, { runnerRoom: 'r2.hall', missionRoom: null }, 9e6)),
  'no mount room · unanswerable reads NO');
t('TS2c', !isStinging(step(null, { runnerRoom: null, missionRoom: 'r1.gallery' }, 9e6)),
  'no runner room · unanswerable reads NO');
t('TS2d', !isStinging(step(null, null, 9e6)), 'no world report at all · unanswerable reads NO');
t('TS2e', hasLeft('a', 'b') && !hasLeft('a', 'a') && !hasLeft('', 'b') && !hasLeft('a', '  '),
  'hasLeft: blank and whitespace are not a room');
t('TS2f', sameRoom('r1.gallery', ' r1.gallery ') && !sameRoom(null, null) && !sameRoom(1, 1),
  'sameRoom compares two strings and nothing else');
// The control: the SAME frames with the rule inverted must sting, or TS2 is asserting nothing.
t('TS2g', isStinging(step(null, OUT, 9e6)), 'control · she is out, so it does fire');

/* ---- TS3 · the seal -------------------------------------------------------------------------- */

t('TS3a', stingLeaks(s1).length === 0, `live shape is exactly ${Object.keys(s1).join(', ')}`);
t('TS3b', !STING_KEYS.some((k) => CARRIED.includes(k)),
  'no hidden slot shares a name with a visible one · defineProperty would have eaten it');
t('TS3c', Object.keys(s1).every((k) => STING_KEYS.includes(k)),
  'every enumerable key is on STING_KEYS');
t('TS3d', JSON.parse(JSON.stringify(s1)).mountRoom === undefined,
  'the mount ROOM survives the machine and never the wire · not serialisable');

// The needles. Each is a real thing the board bans, planted into a real shape.
for (const [k, v] of [['room', 'r1.gallery'], ['hunter', { x: 1, z: 2 }], ['route', [[0, 0]]],
  ['bearing', 1.2], ['target', 'painting'], ['marks', [{ x: 0 }]]]) {
  t(`TS3e:${k}`, stingLeaks({ ...s1, [k]: v }).length > 0, 'planted · refused');
}
t('TS3f', stingLeaks({ ...s1, nested: { room: 'x' } }).length > 0, 'planted at depth · refused');
t('TS3g', stingLeaks(null).length > 0 && stingLeaks('cam 2').length > 0, 'a non-shape is refused');

/*
 * The board's footer IS the deny list, so every word on the "Not on the TV, at any second of the
 * run" strip has to be answered by a key in `STING_FORBIDDEN` — a board word with no key is a hole
 * nobody would notice. See the `boardSrc` note for why this is two checks and not one.
 */
const covered = (word) => {
  const w = word.replace(/[^a-z ]/g, '').trim();
  const head = w.split(' ').filter((p) => !['whole', 'house', 'hunter', 'object'].includes(p));
  return STING_FORBIDDEN.some((k) => {
    const lk = k.toLowerCase();
    return head.some((p) => lk === p || lk.startsWith(p) || p.startsWith(lk));
  });
};
const uncovered = ABSENT_STRIP.filter((w) => !covered(w));
t('TS3h', ABSENT_STRIP.length >= 15 && uncovered.length === 0,
  `${ABSENT_STRIP.length} words on the board's absent strip, all answered by a key`);
if (uncovered.length) note(`uncovered: ${uncovered.join(', ')}`);

// TS3i · and the transcript is the board, wherever the board is on disk.
const ONDISK = boardSrc == null ? null : (boardSrc.match(/class="absent">([^<]+)</g) || [])
  .map((m) => m.replace(/^class="absent">/, '').replace(/<$/, '').replace(/&middot;/g, '·'))
  .join(' · ').split('·').map((w) => w.trim().toLowerCase())
  .filter(Boolean);
if (ONDISK == null) {
  t('TS3i', true, 'the canvas is not in this tree · transcript arm only (this is CI\'s arm)');
} else {
  const drift = [...ONDISK.filter((w) => !ABSENT_STRIP.includes(w)),
    ...ABSENT_STRIP.filter((w) => !ONDISK.includes(w))];
  t('TS3i', drift.length === 0,
    `the canvas IS here · ${ONDISK.length} words, transcript matches${drift.length ? ' · drift ' + drift.join(', ') : ''}`);
}

/* ---- TS4 · a moment, not a latch ------------------------------------------------------------- */

let held = step(null, OUT, 1000);
const firedAt = held.at;
for (let n = 1000; n < 1000 + STINGER_MS; n += 250) held = step(held, OUT, n);
t('TS4a', isStinging(held) && held.at === firedAt,
  're-entered 8 times on the 250 ms tick · `at` never restamped');
t('TS4b', !isStinging(step(held, OUT, 1000 + STINGER_MS + 10)), 'and it still expires on time');
// One mount stings ONCE — walking back in and out again does not re-light the same camera.
let back = step(null, OUT, 1000);
back = step(back, IN_ROOM, 1000 + STINGER_MS + 10);
back = step(back, OUT, 1000 + STINGER_MS + 20);
t('TS4c', !isStinging(back), 'she walks back in and out again · the same camera does not re-sting');
// A SECOND camera does, because it is a new mount. One at a time, no queue.
const TWO = [...MOUNT, { type: 'run.camera_lit', seq: 58, data: { camera: 3, episode: 3 } }];
const second = stepSting(back, {
  events: TWO, cameras: { unlocked: 3, needed: 4 }, world: OUT, now: 9000, episode: 3,
});
t('TS4d', isStinging(second) && second.cam === 3, 'a second mount arms and stings · CAM 03');

/* ---- TS5 · last night's camera --------------------------------------------------------------- */

t('TS5a', lastMount(MOUNT, 3)?.cam === 2, 'this episode\'s mount is found');
t('TS5b', lastMount(MOUNT, 4) === null, 'episode 4 does not see episode 3\'s mount');
t('TS5c', !isStinging(step(null, OUT, 9e6, { episode: 4 })),
  'a reconnect mid-episode-4 does not sting episode 3\'s camera');
t('TS5d', lastMount(MOUNT)?.cam === 2, 'control · with no episode asked, the mount is still there');
t('TS5e', lastMount([], 3) === null && lastMount(null, 3) === null, 'an empty log stings nothing');

/* ---- TS6 · 🚨 THE HUNTER CONTROL ------------------------------------------------------------- */
/*
 * The needle R9 asks for, pointed at the television. `stinger.js` must be structurally unable to
 * read a hunter position — so move him to three wildly different places, including into her room
 * and into the mount room, and the sting must be byte-identical every time.
 */
const withHunter = (h) => stepSting(null, {
  events: MOUNT, cameras: CAMS, episode: 3, now: 1000,
  world: { ...OUT, hunter: h, hunterRoom: h?.room ?? null },
});
const base = JSON.stringify(withHunter(null));
const moved = [
  { room: 'r1.gallery', x: 0, z: 0 },
  { room: 'r2.hall', x: 99, z: -99 },
  { room: 'r9.chapel', x: -4.25, z: 12.5 },
].map((h) => JSON.stringify(withHunter(h)));
t('TS6a', moved.every((m) => m === base), `hunter moved 3 ways · sting identical · ${base}`);
t('TS6b', !STING_READS.includes('hunter.room') && STING_READS.length === 2,
  `STING_READS is closed at two · ${STING_READS.join(', ')}`);
t('TS6c', STING_FORBIDDEN.includes('hunter') && STING_FORBIDDEN.includes('marks'),
  'and the seal refuses the word outright · Rung 5 stays shut');
// FOLLOW_FORBIDDEN is the room's existing list of what may not reach a renderer. Every word of it
// that could name a place must also be refused here, or the two doors disagree.
const spatial = FOLLOW_FORBIDDEN.filter((k) => ['hunter', 'marks', 'plan', 'flyover', 'lid'].includes(k));
t('TS6d', spatial.length > 0 && spatial.every((k) => STING_FORBIDDEN.includes(k)),
  `STING_FORBIDDEN ⊇ FOLLOW_FORBIDDEN's spatial words · ${spatial.join(', ')}`);

/* ---- TS7 · the chrome ------------------------------------------------------------------------ */

const html = stingHtml(s1);
t('TS7a', html.includes('CAM 02') && html.includes('now live'),
  'the board\'s two labels · CAM 02 · now live');
t('TS7b', html.includes('>2<') && html.includes('/ 4'), 'the count rides the sting · 2 / 4');
t('TS7c', stingHtml(null) === '' && stingHtml({ cam: 2, left: false }) === '',
  'no shape, no markup');
t('TS7d', camLabel(2) === 'CAM 02' && camLabel(11) === 'CAM 11' && camLabel('x') === 'CAM 00',
  'camLabel pads to two and never throws');
/*
 * 🚨 EVERYTHING INTERPOLATED IS A NUMBER. A stinger that could print a caller's string would be a
 * stinger that could print a room name, which is the first line of the board's absent list — so
 * this is checked at the SOURCE, not by hoping the shape stays numeric.
 */
const stingFn = stingSrc.slice(stingSrc.indexOf('export function stingHtml'));
const body = stingFn.slice(0, stingFn.indexOf('\n}\n'));
const interps = body.match(/\$\{[^}]*\}/g) || [];
t('TS7e', interps.length > 0 && interps.every((s) => /\$\{(cam|n|need)\}/.test(s)),
  `${interps.length} interpolations, all pre-numbered · ${interps.join(' ')}`);
t('TS7f', !/esc\(/.test(body), 'and no esc() — there is no string to escape, which is the point');
// A poisoned shape must still produce inert markup: the numbers are coerced, not trusted.
const poison = stingHtml({ cam: '<script>x</script>', n: '</div><img>', need: {}, left: true });
t('TS7g', !poison.includes('<script') && !poison.includes('<img'),
  'a poisoned shape renders CAM 00 · 0 / 0, not markup');

/* ---- TS8 · it is wired ----------------------------------------------------------------------- */

t('TS8a', /import \{[^}]*stepSting[^}]*\} from '\.\.\/party\/stinger\.js'/.test(hostSrc),
  'party-host.js imports the shipped module');
t('TS8b', /paintReactStrip\(\);[\s\S]{0,600}?patchSting\(\);/.test(hostSrc),
  'stepped on the 250 ms ticker, beside the react strip · a wall-clock expiry is nobody\'s message');
t('TS8c', /ui\.stingWorld = \{\s*\n\s*runnerRoom: m\.world\.runner\?\.room/.test(hostSrc)
  && /missionRoom: m\.world\.mission\?\.room/.test(hostSrc),
  'the host keeps TWO named world fields · never a spread');
t('TS8d', !/ui\.stingWorld[\s\S]{0,200}hunter/.test(hostSrc),
  '🚨 and `hunter` is not one of them, at the source');
t('TS8e', /STING_CSS/.test(skinSrc) && /from '\.\/stinger\.js'/.test(skinSrc),
  'night-skin.js ships the skin');
t('TS8f', !/`/.test(STING_CSS), 'no backtick in STING_CSS · it is inside a template literal');
t('TS8g', ['cam-sting', 'cam-sting-pic', 'cam-sting-bar', 'cam-sting-id', 'cam-sting-live',
  'cam-sting-count'].every((c) => STING_CSS.includes(`.${c}`) && html.includes(`"${c}`)),
  'every class the markup uses has a rule, and the gate reads both');
t('TS8h', /\.run-cam-layer \.cam-sting/.test(STING_CSS),
  'mounted in the camera layer · `.night` is a z-index:1 stacking context under a z-index:5 layer');
/*
 * Every colour is a PUBLISHED token. `palette.js` ships an `-rgb` companion for the accent and the
 * bad colour only, and `party-follow` F8's lesson is that an invented one leaves a reskin with one
 * stale surface — the pad block one file over carries that warning in a comment. This checks it.
 */
const TOKENS = [...new Set((src('src/party/palette.js').match(/--night-[a-z-]+/g) || []))];
const used = [...new Set((STING_CSS.match(/var\((--night-[a-z-]+)/g) || [])
  .map((m) => m.replace('var(', '')))];
const invented = used.filter((v) => !TOKENS.includes(v));
t('TS8j', used.length > 0 && invented.length === 0,
  `${used.length} night tokens used, all published by palette.js${invented.length ? ' · invented ' + invented.join(',') : ''}`);
t('TS8i', /layer\.insertAdjacentHTML\('beforeend', stingHtml/.test(hostSrc)
  && !/paint\(\);[\s\S]{0,80}stingHtml/.test(hostSrc),
  'patched in place, never through paint() · the react-strip rule');

/* ---- TS9 · 🚨 THE FAIL-CLOSED GUARD ---------------------------------------------------------- */
/*
 * `room-ghosts` RG5b's shape and `intel-pad`'s IP11b's shape: state the zero-of-zero OUT LOUD so it
 * reads as a finding rather than as coverage, and go RED the day it stops being zero.
 *
 * The board's own worry is *"this is the only board on the canvas that puts a SECOND view of the
 * house on air."* It does not, yet — `run.camera_lit` carries `{camera, episode, job}` and nothing
 * spatial, and there is no second render target anywhere. So the sting is the camera's NUMBER, and
 * the day somebody lands a pose or a second slot they have to decide deliberately whether the room
 * may see it, instead of inheriting a yes from this file.
 */
const mountFn = roomSrc.slice(roomSrc.indexOf('function lightCameraFromJob'));
const mountBody = mountFn.slice(0, mountFn.indexOf('\n  }\n'));
// ⚠️ `at` is deliberately NOT on this list. In `intel.js` it means a position, but on an event it
// is far more likely to be a timestamp — and a gate that reddens the day somebody stamps a clock on
// the mount would be red for the wrong reason, which is the one thing a chain gate must never be.
const spatialWords = /\b(room|x|z|pose|yaw|pitch|eye|look|shot|view)\s*:/g;
const carried = [...mountBody.matchAll(spatialWords)].map((m) => m[1]);
t('TS9a', carried.length === 0,
  `run.camera_lit carries no place · 0 spatial fields on the mount event${carried.length ? ' · ' + carried.join(',') : ''}`);
t('TS9b', !/cam-sting-pic[\s\S]{0,400}<(canvas|iframe|img|svg)/.test(stingSrc),
  'the picture slot draws no house · 0 second views of the mansion on air');
t('TS9c', /THE CAMERA'S PICTURE HAS NO WIRE/.test(stingSrc),
  'and the file says so, where whoever lands one will read it');

/* =================================================================================================
 * READINGS
 * ============================================================================================== */

note(`beat: dark at mount · lights on the way out · ${STINGER_MS} ms · gone`);
note(`shape: ${JSON.stringify(s1)} · ${STING_KEYS.length} keys, ${STING_FORBIDDEN.length} refused`);
note(`board absent strip: ${ABSENT_STRIP.length} words · uncovered ${uncovered.length} · canvas ${boardSrc ? 'on disk' : 'ABSENT (CI arm)'}`);
note(`hunter control: 3 positions · 1 distinct sting`);

console.log(`\n  ${pass} ok · ${fail} fail\n`);
process.exit(fail ? 1 : 0);
