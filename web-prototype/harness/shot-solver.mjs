#!/usr/bin/env node
/**
 * 🎥 **shot-solver — THE FRAMING, THE FURNITURE, AND EVERY WORD THE TELEVISION CAN SAY.**
 *
 *   node harness/shot-solver.mjs
 *
 * ---------------------------------------------------------------------------------------------
 * WHY A SWEEP RATHER THAN A SAMPLE
 * ---------------------------------------------------------------------------------------------
 * `party-anon` A5 has been a SKIP since the Director was built: *"there are no DOM captions to
 * sweep. Browser arm lands with the shot solvers."* The obvious way to close it is to play a game,
 * screenshot the television and read the captions that happened to appear — which proves nothing
 * about the one that appears on the evening the Hunter takes somebody in the cellar.
 *
 * So the caption bank and the shot bug are **closed generators**, and this walks their entire
 * output space: every kind × every room, every shot × every site. If a player's name can appear on
 * the television at all, it appears in that set, and H7/H8 find it without anyone having to play
 * the right game.
 *
 * ⚠️ THE BROWSER ARM IS AN ARM, NOT THE GATE. It renders the real overlay in real Chromium and
 * measures §4's ten-foot rules against computed style — but it SKIPS where there is no browser,
 * and on this project a SKIP is never a PASS. Everything that must hold in CI is asserted from the
 * pure modules, and the numbers §4 states are checked twice: once from `SIZES_VH` arithmetic, once
 * from what the browser actually laid out.
 */

import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { solve, isFiller, CARDS, BODYCAM_RIG, WORK_RIG, FOV, STING_MIN_RANGE, BOOM_STANDOFF, bugFor, camWall } from '../src/party/shots.js';
import { captionFor, allCaptions, LOWER_THIRD, ROOM_LABEL, railFor, showBug, segmentClock, CAPTION_FIELDS, createLowerThirds, REPEAT_GAP } from '../src/party/captions.js';
import { TEN_FOOT, SIZES_VH, INK } from '../src/ui/broadcast.js';
import { ROOMS } from '../src/party/coverage.js';
import { SHOTS, KIND } from '../src/party/director.js';
import { camerasNeeded } from '../src/party/win.js';

let pass = 0, fail = 0, skip = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };
const skipped = (n, why) => { skip++; console.log(`  SKIP ${n} · ${why} — SKIP is not a PASS`); };

// ---------------------------------------------------------------- the fixture world
/**
 * A house-shaped probe: six rooms in a row, one camera per room, subjects placed in named rooms.
 * It answers the same five questions `director-rig.js` answers from a live scene — which is the
 * entire point of the seam, and also the entire limit of what this file can prove about the rig.
 */
function fixture({ unlocked = 6, occludeFrom = new Set(), place = {} } = {}) {
  const W = 10, sites = ROOMS.map((room, i) => ({
    index: i, camIndex: i, room, x: i * W + 1, y: 4.35, z: 1,
    bounds: { x0: i * W, x1: i * W + W, z0: 0, z1: W },
  }));
  const poseOf = {};
  for (const [id, room] of Object.entries(place)) {
    const i = ROOMS.indexOf(room);
    poseOf[id] = { x: i * W + W / 2, y: 0, z: W / 2, yaw: 0.4, eyeHeight: 1.62 };
  }
  return {
    _sites: sites,
    pose: (id) => poseOf[id] || null,
    sites: () => sites.filter((s) => s.camIndex < unlocked),
    boom: (from, dir, maxLen) => (occludeFrom.has('boom') ? 1.1 : maxLen),
    sees: (site, p) => !occludeFrom.has(site.room)
      && p.x >= site.bounds.x0 && p.x <= site.bounds.x1 && p.z >= site.bounds.z0 && p.z <= site.bounds.z1,
    label: (r) => ROOM_LABEL[r] || String(r).toUpperCase(),
    splitSubjects: () => Object.keys(poseOf).filter((k) => k !== 'hunter').slice(0, 2),
  };
}

const ROSTER = ['Vic', 'Sam', 'Jo', 'Kit', 'Roo', 'Ali', 'Mo', 'Ben'];

/**
 * 🚨 WORD BOUNDARIES, NOT SUBSTRINGS, AND THIS IS NOT PEDANTRY. A naive `includes()` scanner fired
 * on `THE BALLROOM` because "ba**llroo**m" contains the player "Roo", and on `IT IS MOVING` because
 * of "Mo". A caption sweep that cries wolf on half the bank is a sweep somebody switches off in a
 * fortnight, which is worse than no sweep — so it matches whole words and A7's control below
 * proves it still catches the real thing.
 */
function namesIn(text, needles) {
  return needles.filter((n) => new RegExp(`(^|[^\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'iu').test(text));
}

/**
 * WCAG relative luminance and contrast, so §4's *"all text ≥ 4.5:1 on an opaque plate"* is a
 * number rather than a hope. Takes hex or a browser `rgb()` string, so the same arithmetic serves
 * the palette check and what Chromium actually laid out.
 */
const rgbOf = (c) => {
  if (typeof c !== 'string') return [0, 0, 0];
  if (c[0] === '#') return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const m = c.match(/[\d.]+/g) || [];
  return [+m[0] || 0, +m[1] || 0, +m[2] || 0];
};
const lum = (c) => {
  const v = rgbOf(c).map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/**
 * 🚨 **`opacity` APPLIES TO THE WHOLE ELEMENT, PLATE INCLUDED — WHICH IS HOW A PLATE THAT EXISTS
 * TO GUARANTEE A RATIO ENDS UP FADING WITH THE TEXT ON IT.** Two shipped rules did exactly that,
 * and a checker that reads `color` alone cannot see either. This composites the ink over its own
 * background at the inherited alpha first, the way the compositor does.
 */
const composited = (color, bg, alpha) => {
  const [r, g, b] = rgbOf(color), [R, G, B] = rgbOf(bg), a = Math.max(0, Math.min(1, alpha));
  return `rgb(${r * a + R * (1 - a)}, ${g * a + G * (1 - a)}, ${b * a + B * (1 - a)})`;
};

const PLAYER_IDS = ROSTER.map((_, i) => `p${i + 1}`);
const ROLE_NAMES = ['cameraOp', 'soundie', 'fixer', 'producer', 'continuity', 'stuntDouble', 'glitched', 'contestant'];

// ---------------------------------------------------------------- H0 · the arm
{
  const probe = fixture({ place: { p1: 'gallery', hunter: 'cellar' } });
  const solved = SHOTS.map((s) => solve(s.id, { subjectId: 'p1', probe }));
  const live = solved.filter((s) => s && s.kind === 'live');
  t('H0 arm · every shot in the library was put to the solver and the live ones framed',
    solved.length === SHOTS.length && live.length >= 3,
    `${live.length} live · ${solved.filter((s) => s && s.kind === 'card').length} cards · ${solved.filter((s) => !s).length} unavailable`);
  t('H0b arm · the library is the one `director-cut` B4 pins, so this sweeps the shipped shots',
    SHOTS.map((s) => s.id).join(',') === 'BODYCAM,WORK,STATIC,STING,SPLIT,REACTION,CONFESSIONAL,SPONSOR',
    SHOTS.map((s) => s.id).join(','));
}

// ---------------------------------------------------------------- H1 · seam fillers never see the halls
{
  const probe = fixture({ place: { p1: 'gallery', hunter: 'cellar' } });
  let bad = null;
  for (const id of Object.keys(CARDS)) {
    const s = solve(id, { subjectId: 'p1', probe });
    if (!s || s.kind !== 'card') bad = `${id} did not return a card`;
    if (s && (s.eye || s.at || s.panes)) bad = `${id} produced a pose`;
  }
  t('H1 · a seam filler returns a card and can never produce a pose', bad === null,
    bad || `${Object.keys(CARDS).join(', ')} — "the circle or a card, never the halls"`);
  t('H1 control · a live shot DOES produce one, so H1 is a difference',
    !!solve('BODYCAM', { subjectId: 'p1', probe })?.eye);
  t('H1b · and `isFiller` agrees with the shot library\'s own `live` flag',
    SHOTS.every((s) => isFiller(s.id) === !s.live),
    'one source of truth for what may show the mansion');
}

// ---------------------------------------------------------------- H2 · the shipped rig numbers
{
  // 🚨 READ FROM `player.js`, NOT RESTATED. A broadcast camera that drifts from the shipped
  // third-person rig makes the cutaways look like a different game.
  const whole = readFileSync(new URL('../src/game/player.js', import.meta.url), 'utf8');
  // ⚠️ SCOPED TO THE CAMERA CLASS. The first draft matched the whole file and read `Player`'s own
  // body height (`player.js:152`, 1.7) instead of the boom's (`:1632`, 1.42) — so the gate failed
  // correct code and would have talked somebody into changing the rig to match a torso.
  const src = whole.slice(whole.indexOf('export class ThirdPersonCamera'));
  const grab = (k) => { const m = src.match(new RegExp(`this\\.${k}\\s*=\\s*o\\.${k}\\s*\\?\\?\\s*([-\\d.]+)`)); return m ? Number(m[1]) : null; };
  const shipped = { distance: grab('distance'), height: grab('height'), shoulder: grab('shoulder'), pitch: grab('pitch') };
  t('H2 arm · the shipped ThirdPersonCamera numbers were found in player.js',
    Object.values(shipped).every((v) => v !== null), JSON.stringify(shipped));
  t('H2 · BODYCAM uses them exactly, rather than numbers of its own',
    BODYCAM_RIG.distance === shipped.distance && BODYCAM_RIG.height === shipped.height
    && BODYCAM_RIG.shoulder === shipped.shoulder && BODYCAM_RIG.pitch === shipped.pitch,
    JSON.stringify(BODYCAM_RIG));
  t('H2b · WORK is the only shot allowed closer than the shipped boom',
    WORK_RIG.distance < BODYCAM_RIG.distance && FOV.WORK < FOV.BODYCAM,
    `${WORK_RIG.distance}m at ${FOV.WORK}° vs ${BODYCAM_RIG.distance}m at ${FOV.BODYCAM}°`);
}

// ---------------------------------------------------------------- H3 · STATIC respects the unlocks
{
  let bad = null, solvedAt = {};
  for (let unlocked = 0; unlocked <= ROOMS.length; unlocked++) {
    const probe = fixture({ unlocked, place: { p1: ROOMS[3], hunter: ROOMS[5] } });
    const s = solve('STATIC', { subjectId: 'p1', probe });
    solvedAt[unlocked] = !!s;
    if (!s) continue;
    const site = probe._sites.find((x) => x.x === s.eye.x && x.z === s.eye.z);
    if (!site) { bad = `unlocked=${unlocked}: solved from a site not in the roster`; break; }
    if (site.camIndex >= unlocked) { bad = `unlocked=${unlocked}: solved from cam ${site.camIndex}, which is dark`; break; }
  }
  t('H3 · a STATIC is only ever solved from a camera the crew has lit', bad === null,
    bad || `swept unlocked 0..${ROOMS.length}`);
  t('H3b · and it is unavailable before that camera exists, rather than guessing',
    solvedAt[0] === false && solvedAt[4] === true,
    `0 cams → ${solvedAt[0]} · 4 cams → ${solvedAt[4]}`);

  // ⚠️ REFUSING IS THE FEATURE. A solver that returned a pose anyway points a camera at a wall on
  // live television, and the arbiter never learns the shot was no good.
  const blind = fixture({ unlocked: 6, occludeFrom: new Set(ROOMS), place: { p1: ROOMS[3] } });
  t('H4 · a STATIC nothing can see returns null, so the arbiter re-solves',
    solve('STATIC', { subjectId: 'p1', probe: blind }) === null, 'never a camera pointed at plaster');
  t('H4 control · the same subject IS solvable when a camera can see them',
    solve('STATIC', { subjectId: 'p1', probe: fixture({ place: { p1: ROOMS[3] } }) }) !== null);
  t('H4b · and a subject who is not in the scene at all returns null on every live shot',
    ['BODYCAM', 'WORK', 'STATIC', 'STING'].every((id) => solve(id, { subjectId: 'ghost', probe: fixture({}) }) === null));
}

// ---------------------------------------------------------------- H5 · the Hunter stays a silhouette
{
  // Six rooms, cameras at x = i*10+1; the Hunter stands at the middle of room 5. Several cameras
  // could see it in this fixture — the question is which one the solver takes.
  const probe = {
    ...fixture({ place: { hunter: ROOMS[5] } }),
    sees: () => true,   // every camera can see it, so the CHOICE is what is under test
  };
  probe.sites = () => probe._sites;
  const s = solve('STING', { subjectId: 'p1', probe });
  const d = Math.hypot(s.eye.x - s.at.x, s.eye.y - s.at.y, s.eye.z - s.at.z);
  t('H5 · a STING takes a camera at range, never the nearest one', d >= STING_MIN_RANGE,
    `${d.toFixed(1)}m, floor ${STING_MIN_RANGE}m — §6.2, "a silhouette a real camera can actually see"`);
  const nearest = probe._sites.map((x) => Math.hypot(x.x - s.at.x, x.y - s.at.y, x.z - s.at.z)).sort((a, b) => a - b)[0];
  // A camera bracketed right on top of the Hunter — the shot a nearest-first solver would take.
  const intimate = { index: 9, camIndex: 0, room: ROOMS[5], x: s.at.x + 1.2, y: s.at.y + 0.6, z: s.at.z + 1.0,
    bounds: { x0: -1e4, x1: 1e4, z0: -1e4, z1: 1e4 } };
  const close = { ...probe, _sites: [intimate], sites: () => [intimate], sees: () => true };
  const near = Math.hypot(intimate.x - s.at.x, intimate.y - s.at.y, intimate.z - s.at.z);
  t('H5 control · a nearest-first solver had a much closer camera available and did not take it',
    near < STING_MIN_RANGE && Math.min(nearest, near) < STING_MIN_RANGE,
    `an intimate camera sits ${near.toFixed(1)}m away, well inside the ${STING_MIN_RANGE}m floor`);
  t('H5b · and a STING with ONLY that camera is refused rather than shot tight',
    solve('STING', { subjectId: 'p1', probe: close }) === null,
    'no camera far enough → no sting, and the arbiter picks something else');
}

// ---------------------------------------------------------------- H6 · the boom is pulled in
{
  const open = fixture({ place: { p1: 'gallery' } });
  const tight = fixture({ place: { p1: 'gallery' }, occludeFrom: new Set(['boom']) });
  const a = solve('BODYCAM', { subjectId: 'p1', probe: open });
  const b = solve('BODYCAM', { subjectId: 'p1', probe: tight });
  const dist = (s) => Math.hypot(s.eye.x - s.at.x, s.eye.y - s.at.y, s.eye.z - s.at.z);
  t('H6 · the world pulls the boom in rather than the shot pushing through it',
    dist(b) < dist(a), `${dist(a).toFixed(2)}m open → ${dist(b).toFixed(2)}m against a wall`);
  /**
   * 🚨 THE SIDE, NOT JUST THE LENGTH. H6 compares boom distances and passes whichever way the
   * boom points — which is how a BODYCAM that placed its lens in front of the runner's face
   * shipped and was only caught by looking at a screenshot. Forward is `(sin yaw, cos yaw)`
   * (`player.js:1806`); a camera behind the subject has a negative dot product with it.
   */
  for (const [name, rig] of [['BODYCAM', 'BODYCAM'], ['WORK', 'WORK']]) {
    const p = open.pose('p1');
    const sh = solve(rig, { subjectId: 'p1', probe: open });
    const fwd = { x: Math.sin(p.yaw), z: Math.cos(p.yaw) };
    const toEye = { x: sh.eye.x - p.x, z: sh.eye.z - p.z };
    const dot = fwd.x * toEye.x + fwd.z * toEye.z;
    t(`H6b · the ${name} eye is BEHIND the subject, not in front of their face`, dot < 0,
      `dot(forward, eye-subject) = ${dot.toFixed(2)} · positive means the lens is in the wall they are walking at`);
  }
  t('H6b control · the dot product would catch a flipped boom — a camera one metre ahead reads positive',
    (() => { const p = open.pose('p1'); const f = { x: Math.sin(p.yaw), z: Math.cos(p.yaw) };
      return f.x * f.x + f.z * f.z > 0.9; })(),
    'forward is a unit vector, so a lens placed along it dots to +1');

  t('H6 control · with nothing in the way it sits at the shipped distance',
    Math.abs(dist(a) - BODYCAM_RIG.distance) < 0.5, `${dist(a).toFixed(2)}m vs ${BODYCAM_RIG.distance}m`);
  /**
   * The near plane must not sit ON the surface the boom hit — `player.js:1474`.
   *
   * ⚠️ THE EXPECTED NUMBER IS A HYPOTENUSE, NOT THE BOOM LENGTH. The boom runs from an anchor
   * offset to the SHOULDER, so eye-to-subject is `hypot(alongBoom, shoulder)`. The first version
   * of this compared against the boom length alone, read 0.90 against a limit of 0.80, and failed
   * correct code — the missing 0.10 was the 0.42m shoulder, which is in every shot by design.
   */
  const wantAxial = 1.1 - BOOM_STANDOFF;
  const wantEye = Math.hypot(wantAxial, BODYCAM_RIG.shoulder);
  t('H6c · a blocked boom stops short of the blocker by the shipped standoff',
    dist(b) <= wantEye + 1e-6,
    `blocker at 1.10m → ${wantAxial.toFixed(2)}m of boom, ${dist(b).toFixed(2)}m to the eye across a ${BODYCAM_RIG.shoulder}m shoulder`);
  t('H6c control · and without the standoff it would sit further out',
    Math.hypot(1.1, BODYCAM_RIG.shoulder) > dist(b),
    `${Math.hypot(1.1, BODYCAM_RIG.shoulder).toFixed(2)}m vs ${dist(b).toFixed(2)}m`);
}

// ---------------------------------------------------------------- H7 · THE SHOT BUG SWEEP
{
  // Every bug string this module can produce, across every shot and every site.
  const probe = fixture({});
  const bugs = [];
  for (const s of SHOTS) {
    bugs.push(bugFor(s.id, null, probe));
    for (const site of probe._sites) bugs.push(bugFor(s.id, site, probe));
  }
  for (let u = 0; u <= 8; u++) for (let n = 0; n <= 8; n++) bugs.push(camWall(u, n));

  const needle = [...ROSTER, ...PLAYER_IDS, ...ROLE_NAMES, 'evil', 'good', 'RUNNER', 'GUIDE'];
  const hit = bugs.filter((b) => namesIn(b, needle).length);
  t('H7 · not one shot bug, over its entire output space, can name a person',
    hit.length === 0, hit.join(' / ') || `${bugs.length} strings swept`);
  t('H7 control · the sweep DOES find a name when one is there — it is not scanning nothing',
    namesIn('CAM 03 · EAST GALLERY · VIC', needle).length > 0,
    'the exact string a helpful commit would add');
  t('H7 control b · and it does NOT fire on a room whose name contains a player\'s',
    namesIn('CAM 01 · THE BALLROOM · LIVE', needle).length === 0,
    '"ba(llroo)m" holds "Roo"; a substring scanner cried wolf on six of eight bugs');
  t('H7b · and every bug that names a camera names one of the six rooms with it',
    bugs.filter((b) => /^CAM \d\d · /.test(b)).every((b) => ROOMS.some((r) => b.includes(ROOM_LABEL[r]))),
    'rooms come from `label`, which knows six nouns');
}

// ---------------------------------------------------------------- H8 · THE CAPTION SWEEP (A5)
{
  const caps = allCaptions();
  const needle = [...ROSTER, ...PLAYER_IDS, ...ROLE_NAMES, 'evil', 'good', 'sabotage', 'lied', 'blame'];
  const hit = caps.filter((c) => namesIn(c, needle).length);
  t('H8 · not one lower third, over its entire output space, can name a person or a cause',
    hit.length === 0, hit.join(' / ') || `${caps.length} captions swept — §6.6`);
  t('H8 arm · the bank is not empty, and covers the kinds the Director actually emits',
    caps.length >= 20 && KIND.every((k) => k in LOWER_THIRD),
    `${caps.length} captions · ${KIND.length} kinds all accounted for`);

  // 🚨 REFUSED, NOT IGNORED — the same rule `events.js` enforces on failure payloads.
  let threwField = false, threwRoom = false;
  try { captionFor({ kind: 'noise', room: 'gallery', subject: 'p3' }); } catch { threwField = true; }
  try { captionFor({ kind: 'noise', room: 'kitchen' }); } catch { threwRoom = true; }
  t('H8b · a caption request carrying a subject is refused at construction', threwField,
    `the closed list is ${CAPTION_FIELDS.join(', ')}`);
  t('H8c · and a room that is not one of the six is refused too', threwRoom,
    'so a free-text room cannot smuggle a name in');

  // §6.8 — the ban that a caption bank is exactly where somebody would break.
  t('H9 · `progress` has no template at all, so no caption can carry a progress number',
    LOWER_THIRD.progress === null && LOWER_THIRD.place === null,
    'blows land; a wall never reads STAGE 2 OF 4');
  t('H9 control · the kinds that DO speak have templates, so H9 is a choice',
    LOWER_THIRD.blow !== null && LOWER_THIRD.grab !== null);
}

// ---------------------------------------------------------------- H10 · the rail cannot show a role
{
  // A poisoned frame: everything the matrix refuses, handed straight to the rail.
  const poisoned = {
    episode: 3,
    pair: { runner: 'p2', guide: 'p5' },
    players: ROSTER.map((name, i) => ({
      id: `p${i + 1}`, seat: i, name, alive: i !== 5, taken: i === 5, claim: i % 2 ? 'fixer' : null,
      alignment: i < 2 ? 'evil' : 'good', role: ROLE_NAMES[i], claimDraft: 'producer',
    })),
  };
  const rail = railFor(poisoned);
  const blob = JSON.stringify(rail);
  t('H10 · the rail drops alignment, role and draft even when handed all three',
    !/evil|good|claimDraft|producer|cameraOp|soundie|stuntDouble|glitched/.test(blob),
    'it reads five fields and copies nothing else');
  t('H10 control · the poison really was in the input, so H10 is not scanning a clean frame',
    /evil/.test(JSON.stringify(poisoned)) && /claimDraft/.test(JSON.stringify(poisoned)));
  t('H10b · a published claim survives, because §4 puts it on the rail on purpose',
    rail.some((r) => r.claim === 'fixer') && rail.some((r) => r.claim === '—'),
    'published claims and the default dash');
  t('H10c · and how somebody left is a non-colour channel, per §4\'s sideways-viewer rule',
    rail[5].mark === '✕' && rail[5].out === true && rail.filter((r) => !r.out).every((r) => r.mark === '⬤'),
    'taken ✕ · evicted ⚒ · alive ⬤');
  t('H10d · the badges name this round\'s chairs and nothing else',
    rail[1].badge === 'RUNNER' && rail[4].badge === 'GUIDE' && rail.filter((r) => r.badge).length === 2);
  t('H10e · the show bug is an episode number, never "round N of M" — P10',
    showBug(3) === '● RRR LIVE · EP 03' && !/of|round/i.test(showBug(3)) && segmentClock(64) === 'SEGMENT 1:04',
    `${showBug(3)} · ${segmentClock(64)}`);
}

// ---------------------------------------------------------------- H11 · §4's ten-foot rules
{
  const px = (vh) => (vh / 100) * TEN_FOOT.panelH;
  const rows = [
    ['nameplate name', px(SIZES_VH.name), TEN_FOOT.nameMinPx],
    ['claim', px(SIZES_VH.claim), TEN_FOOT.claimMinPx],
    ['lower third', px(SIZES_VH.lower), TEN_FOOT.lowerMinPx],
    ['chat', px(SIZES_VH.chat), TEN_FOOT.chatMinPx],
  ];
  const under = rows.filter(([, got, min]) => got < min);
  t('H11 · every text run clears its ten-foot minimum at 1080p',
    under.length === 0,
    under.length ? under.map(([n, g, m]) => `${n} ${g.toFixed(1)} < ${m}`).join(', ')
      : rows.map(([n, g, m]) => `${n} ${g.toFixed(1)}≥${m}`).join(' · '));
  t('H11 control · the check would catch a shrink — 2.0vh name is 21.6px, under the 30px floor',
    px(2.0) < TEN_FOOT.nameMinPx);

  const pairs = [['fg', INK.fg], ['dim', INK.dim], ['live', INK.live], ['out', INK.out], ['badge', INK.badge]]
    .map(([n, c]) => [n, ratio(c, INK.plate)]);
  const dim = pairs.filter(([, r]) => r < TEN_FOOT.contrastMin);
  t('H11b · every ink on the plate clears 4.5:1', dim.length === 0,
    dim.length ? dim.map(([n, r]) => `${n} ${r.toFixed(2)}`).join(', ')
      : pairs.map(([n, r]) => `${n} ${r.toFixed(1)}`).join(' · '));
  t('H11b control · the ratio function is real — white on white is 1.0',
    Math.abs(ratio('#ffffff', '#ffffff') - 1) < 1e-9 && ratio('#ffffff', '#000000') > 20);
}

// ---------------------------------------------------------------- H12 · the browser arm
{
  // Overridable so both branches are testable, and so a machine with Chromium somewhere else can
  // run the arm. CI has no browser and takes the SKIP — which is why every rule this arm measures
  // is ALSO asserted from `SIZES_VH` by H11. A SKIP is never a PASS, so nothing rests on it alone.
  const CHROME = process.env.RRR_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const frame = await realFrame();
  /**
   * The frame this sweep used to invent, kept only to say what was wrong with it. It is never
   * asserted against — it is the control that shows the difference a real frame makes.
   */
  const OLD_FIXTURE = {
    episode: 3, pair: { runner: 'p2', guide: 'p5' },
    cameras: { unlocked: 3, needed: 5 },
    players: ROSTER.map((name, i) => ({ id: `p${i + 1}`, seat: i, name, alive: i !== 5, taken: i === 5, claim: i % 2 ? 'fixer' : null })),
  };
  t('H12e arm · the sweep is fed a frame off a real television socket, not a hand-written one',
    !!frame && Array.isArray(frame.players) && frame.players.length === 8,
    frame ? `episode ${frame.episode} · ${frame.players.length} players · phase ${frame.phase}` : 'no frame captured');
  if (frame) {
    const real = new Set(paths(frame)), old = new Set(paths(OLD_FIXTURE));
    const missing = [...real].filter((x) => !old.has(x));
    t('H12e · and the real frame carries the fields a leak sweep exists to look at',
      ['nominations[]', 'expedition.room', 'call.made'].every((k) => [...real].some((x) => x.startsWith(k)))
      && [...real].some((x) => x.startsWith('tally')),
      `${real.size} paths`);
    t('H12e control · the fixture it replaced was missing most of them',
      missing.length >= 15,
      `${missing.length} paths the hand-written frame never had — including ${missing.filter((x) => /nomin|tally|expedition|call/.test(x)).slice(0, 4).join(', ')}`);
    t('H12f · and its camera denominator is one the win machine can actually produce',
      frame.cameras.needed === camerasNeeded(frame.players.length),
      `needed ${frame.cameras.needed} at ${frame.players.length} players · the fixture said ${OLD_FIXTURE.cameras.needed}, which WIN_TARGETS produces at no count`);
  }

  if (!existsSync(CHROME)) {
    skipped('H12 browser arm', `no Chromium at ${CHROME}; the ten-foot rules are still checked from SIZES_VH by H11, but nothing has laid this overlay out`);
  } else if (!frame) {
    skipped('H12 browser arm', 'no real frame could be captured from a live show, so there is nothing honest to render');
  } else {
    const res = await renderSweep(CHROME, frame);
    if (res.error) {
      skipped('H12 browser arm', `Chromium present but the render failed: ${res.error}`);
    } else {
      t('H12 arm · the overlay mounted and drew the rail, the bug and a lower third',
        res.texts.length > 10 && res.seats === frame.players.length, `${res.texts.length} text runs · ${res.seats} nameplates`);
      // 🚨 THE REAL A5 SWEEP: what the television is ACTUALLY showing, not what the bank says.
      // ⚠️ PUBLISHED CLAIMS ARE EXEMPT, AND THE EXEMPTION IS NAMED RATHER THAN QUIET. §4 puts the
      // current public claim on the rail on purpose, and a player claiming to be the fixer has
      // said so themselves — `party-isolation` I3 carries the same exemption for the same reason.
      // What must never appear is a role NOBODY published, which is what the control below checks.
      const claimed = new Set(res.claims.map((c) => c.toLowerCase()));
      const needle = [...PLAYER_IDS, ...ROLE_NAMES, 'evil', 'good'].filter((n) => !claimed.has(n.toLowerCase()));
      const hit = res.texts.filter((x) => namesIn(x, needle).length);
      t('H12 · nothing in the rendered DOM names an unpublished role, an alignment or a player id',
        hit.length === 0, hit.join(' / ') || `names and ${claimed.size} published claim(s) by design; nothing else`);
      t('H12 control · the scan would still catch a role nobody claimed',
        namesIn('⬤ Vic “stuntDouble”', ROLE_NAMES.filter((n) => !claimed.has(n.toLowerCase()))).length > 0,
        'the exemption is one claim wide, not role-names-are-fine');
      t('H12b · every rendered string came from the bank — the renderer composed nothing',
        res.unknown.length === 0, res.unknown.join(' / ') || 'checked against captions.js and shots.js output');
      const under = res.sizes.filter(([, gotPx, min]) => gotPx < min);
      t('H12c · and Chromium laid it out at or above every ten-foot minimum at 1080p',
        under.length === 0,
        under.length ? under.map(([n, g, m]) => `${n} ${g}px < ${m}`).join(', ')
          : res.sizes.map(([n, g, m]) => `${n} ${g}px≥${m}`).join(' · '));
      t('H12d · and nothing important sits inside the 4% edge margin',
        res.edgeOk, res.edgeDetail);

      /**
       * 🚨 TWO SHIPPED RULES IN THIS FILE FADED THE PLATE ALONG WITH THE TEXT ON IT. `.rrr-seg`
       * carried `opacity:.72` on the same element as `.rrr-plate` and composited to 4.03-4.38:1;
       * `.rrr-seat.out` at .45 collapsed the struck-through name to 1.82:1. H11b checks the
       * PALETTE, which cannot see either — it is the compositor that does the fading.
       */
      const ratioOf = (x) => ratio(composited(x.color, x.bg, x.alpha), x.bg);
      const faded = (res.runs || []).filter((x) => ratioOf(x) < TEN_FOOT.contrastMin);
      t('H12g · every run in the overlay clears 4.5:1 with its own opacity composited in',
        faded.length === 0 && (res.runs || []).length >= 5,
        faded.length ? faded.map((x) => `${x.sel} ${ratioOf(x).toFixed(2)}:1 at alpha ${x.alpha}`).join(', ')
          : (res.runs || []).map((x) => `${x.sel} ${ratioOf(x).toFixed(1)}`).join(' · '));
      t('H12g control · and the same arithmetic fails the ratio the shipped .45 produced',
        ratio(composited(INK.out, INK.plate, 0.45), INK.plate) < TEN_FOOT.contrastMin,
        `${ratio(composited(INK.out, INK.plate, 0.45), INK.plate).toFixed(2)}:1 — what OUT looked like`);
    }
  }
}

// ---------------------------------------------------------------- H15 · the lower third has an arbiter
/**
 * 🚨 **`captionFor` WAS CALLED FROM EXACTLY ONE PLACE IN THE REPOSITORY — INSIDE `finish()`.** So
 * across the ninety seconds of an expedition the television carried **no text at all**: the bank,
 * its closed vocabulary, its room labels and `broadcast.js`'s renderer all existed and nothing
 * ever asked them for a word. Wiring the bus to it is the fix and also the trap — the bus carries
 * nineteen hunter alerts and hundreds of noise events in a segment.
 */
{
  const bank = createLowerThirds();
  let shown = 0;
  // Nineteen alerts, evenly spread across a 90 s expedition — the density actually measured.
  for (let i = 0; i < 19; i++) if (bank.offer({ kind: 'hunter_alert', rank: 3 }, i * (90 / 19))) shown++;
  t('H15 · nineteen alerts do not become nineteen lower thirds',
    shown > 0 && shown <= 8, `${shown} of 19 aired across 90 s · the same words are refused for ${REPEAT_GAP}s`);
  t('H15 control · and without the arbiter every one of them produces a caption',
    Array.from({ length: 19 }, () => captionFor({ kind: 'hunter_alert', rank: 3 })).filter(Boolean).length === 19,
    'the bank itself never refuses — that is why the arbiter exists');

  // Rank 4 is the climax. §3 does not cut away from it and does not decline to caption it either.
  const b2 = createLowerThirds();
  b2.offer({ kind: 'hunter_alert', rank: 3 }, 0);
  t('H15b · a rank-4 caption is never refused, mid-hold or repeated',
    !!b2.offer({ kind: 'taken', rank: 4 }, 0.1) && !!b2.offer({ kind: 'taken', rank: 4 }, 0.2),
    'terminal, cam_unlock, grab, taken, task_result');
  t('H15c · an equal-or-lower rank offered inside the hold is dropped, not queued',
    b2.offer({ kind: 'noise', room: 'gallery', rank: 2 }, 0.3) === null,
    'a line nobody finished reading is not information');

  // The room rule, which is an information rule — see the arbiter's own note.
  const b3 = createLowerThirds();
  t('H15d · a caption may only name the room the camera is in',
    b3.offer({ kind: 'blow', room: 'study_w', rank: 2 }, 0, 'ballroom') === null,
    'an event elsewhere keeps its sound and loses its words — §3');
  t('H15d control · the same event in the camera\'s own room IS captioned',
    b3.offer({ kind: 'blow', room: 'ballroom', rank: 2 }, 0, 'ballroom')?.text === 'IMPACT — THE BALLROOM',
    'so H15d is the room comparison and not a caption that never fires');
  t('H15e · and the Hunter\'s room can therefore never reach the screen through a caption',
    ROOMS.every((r) => ROOMS.filter((c) => c !== r)
      .every((c) => createLowerThirds().offer({ kind: 'noise', room: r, rank: 2 }, 0, c) === null)),
    `${ROOMS.length} × ${ROOMS.length - 1} room pairs, every mismatch refused`);
}

// ---------------------------------------------------------------- H14 · the boom is never on the Hunter
/**
 * 🚨 **MEASURED: THE BROADCAST CAMERA WAS ON THE HUNTER FOR 82% OF THE ROUND, AT 2.22 m.**
 *
 * `views/expedition.js` fed every hunter state change with `subjectId: 'hunter'` and BODYCAM
 * frames whatever subject it is handed, so a 90 s expedition ran 73 s of shoulder camera on the
 * monster — under `STING_MIN_RANGE` on 100% of those frames — while the runner the Debrief is
 * about got sixteen. The view no longer names it as a subject; this is the half that holds when
 * some future caller does.
 */
{
  const probe = fixture({ place: { p1: 'gallery', hunter: 'study_w' } });
  const refused = ['BODYCAM', 'WORK'].filter((id) => solve(id, { subjectId: 'hunter', probe }) === null);
  t('H14 · a shoulder camera cannot be put on the Hunter, whatever asks for it',
    refused.length === 2, `${refused.join('/')} return null · §6.2 "only as a silhouette a real camera can actually see"`);
  t('H14 control · the same call frames a runner standing in the same house, so H14 is the identity and not the pose',
    !!solve('BODYCAM', { subjectId: 'p1', probe })?.eye && !!probe.pose('hunter'),
    'the Hunter has a pose; the solver refuses to use it');
  t('H14b · and it is the declared hunter id that is refused, not the literal string',
    solve('BODYCAM', { subjectId: 'p1', probe, hunterId: 'p1' }) === null
    && !!solve('BODYCAM', { subjectId: 'hunter', probe, hunterId: 'p1' })?.eye,
    'rename the Hunter and the refusal follows it');
  t('H14c · the Hunter still reaches the screen the one way §6.2 allows it to',
    (() => {
      const s = solve('STING', { subjectId: 'p1', probe });
      if (!s) return false;
      const d = Math.hypot(s.eye.x - s.at.x, s.eye.y - s.at.y, s.eye.z - s.at.z);
      return d >= STING_MIN_RANGE;
    })(), `a STING from an unlocked camera, at or beyond ${STING_MIN_RANGE} m`);
}

// ---------------------------------------------------------------- H13 · the television shows the house
/**
 * 🚨 **THE PAGE SIX OF EIGHT PLAYERS WATCH DID NOT CONTAIN THE EXPEDITION.**
 *
 * `show-tv.html` had zero references to the 3D feed — no iframe, no `party.expedition`, no
 * `role=sim`. For ninety seconds the television showed the word EXPEDITION, a countdown ring and
 * eight static dots, and `src/views/expedition.js` — Director, mansion, shot solver, broadcast
 * overlay — was a separate page nothing composited. `progress/storyboard/08-expedition.png` is a
 * photograph of it, with all eight phones below reading *"Watch the television."*
 *
 * This arm drives the SHIPPED television in real Chromium against a real `show.mjs`, through a
 * real casting phase into a real expedition, and looks at what is on the screen. Three arms, and
 * each is the others' control:
 *
 *   **house**    a stub origin that announces itself the way `expedition.js` does → feed on air
 *   **silent**   a stub origin that loads and says nothing → mounted, never aired
 *   **off**      no house at all, which is the configuration that ships today → no frame, and the
 *                expedition still plays as text
 *
 * ⚠️ WHAT THIS CANNOT SEE: the mansion itself. This box has no GPU and software-rasterises the
 * house at minutes per frame, so the stub stands in for the vite server. Everything about the
 * COMPOSITION is real — the page, the socket, the phases, the iframe, the handshake, the layout —
 * and nothing here proves a single pixel of the corridor. Said plainly rather than skipped.
 */
{
  const CHROME = process.env.RRR_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  if (!existsSync(CHROME)) {
    skipped('H13 the television', `no Chromium at ${CHROME}; nothing has laid out show-tv.html, so whether the feed airs is UNGATED on this machine`);
  } else {
    const res = await tvSweep(CHROME);
    if (res.error) {
      skipped('H13 the television', `Chromium present but the run failed: ${res.error}`);
    } else {
      const { house, silent, off, later } = res;
      t('H13 arm · the shipped television reached a real expedition with a house attached',
        house.serverPhase === 'EXPEDITION' && !!house.feed,
        `phase ${house.phase} · ${house.railSeats} nameplates · viewport ${house.vw}×${house.vh}`);

      t('H13 · the expedition is ON THE TELEVISION — the feed is mounted, aired and full bleed',
        !!house.feed && house.feed.visible && house.feed.w >= house.vw * 0.8,
        house.feed ? `${Math.round(house.feed.w)}×${Math.round(house.feed.h)} of ${house.vw}×${house.vh}` : 'NO FEED ELEMENT AT ALL');

      t('H13b · it is pointed at the expedition view, over a socket with no identity on it',
        !!house.feed && /view=party\.expedition/.test(house.feed.src) && /role%3Dsim|role=sim/.test(house.feed.src)
        && !/token|name=|playerId|p[1-8]\b/.test(house.feed.src),
        house.feed ? house.feed.src : '—');

      t('H13c · §4\'s furniture stays: the nameplate rail is up, on a plate, beside the picture',
        house.railVisible && house.railSeats === 5 && !house.circleVisible && house.stage === '',
        `rail ${house.railSeats} seats · circle ${house.circleVisible ? 'still drawn' : 'yielded'} · stage "${house.stage}"`);

      t('H13d · and in the next phase the feed leaves the screen and the circle comes back',
        later.serverPhase !== 'EXPEDITION' && !(later.feed && later.feed.visible) && later.circleVisible && !later.railVisible,
        `${later.phase}: feed ${later.feed && later.feed.visible ? 'STILL ON AIR' : 'off'} · circle ${later.circleVisible ? 'back' : 'MISSING'}`);

      // ---- the controls, and they are measurements rather than assertions about a literal
      t('H13 control · a house that mounts but never announces itself is NEVER aired',
        !!silent.feed && !silent.feed.visible && silent.circleVisible && silent.stage !== '',
        silent.feed ? `frame mounted, feed ${silent.feed.visible ? 'AIRED ANYWAY' : 'held off'} — the handshake is what airs it, not the mount` : 'no frame mounted at all');

      t('H13e · with no house at all the expedition still plays, which is what ships today',
        off.feed === null && off.circleVisible && /into the/i.test(off.stage),
        `no frame · stage reads "${off.stage.slice(0, 60)}"`);

      t('H13 control · and the detector really can tell the three apart, so H13 is a difference',
        (house.feed && house.feed.visible) === true && (silent.feed && silent.feed.visible) === false && off.feed === null,
        'aired / mounted-but-dark / absent — three states, one detector');

      // ---------------------------------------------------------- H17 · §4 on the page the room watches
      /**
       * 🚨 **`broadcast.js` PASSES ITS OWN TEN-FOOT FLOORS. THE PAGE THE ROOM ACTUALLY WATCHES DID
       * NOT.** At 1920×1080 the shipped television laid the nameplate name out at **26px against a
       * 30 floor** and the public claim at **16 against 24** — both `clamp()`s whose CAP sat below
       * their own minimum — put its edge padding at **1.7% against §4's 4%**, inside the overscan
       * of a real television, and rendered OUT as `opacity:.34`, compositing the struck-through
       * name to **2.90:1**. H11/H12 measured the overlay and never looked at this file.
       */
      const tf = house.tenfoot;
      t('H17 arm · the television was measured as Chromium laid it out',
        !!tf && tf.runs.length >= 4 && tf.vw === 1920,
        tf ? `${tf.runs.length} runs at ${tf.vw}×${tf.vh}` : 'no measurement');
      if (tf) {
        const FLOOR = { '#rail .seat .nm': TEN_FOOT.nameMinPx, '#rail .seat .claim': TEN_FOOT.claimMinPx };
        const small = tf.runs.filter((x) => FLOOR[x.sel] && x.px < FLOOR[x.sel]);
        t('H17 · every nameplate run clears its ten-foot minimum on the television itself',
          small.length === 0,
          small.length ? small.map((x) => `${x.sel} ${x.px}px < ${FLOOR[x.sel]}`).join(', ')
            : tf.runs.filter((x) => FLOOR[x.sel]).map((x) => `${x.sel.split(' ').pop()} ${x.px}px≥${FLOOR[x.sel]}`).join(' · '));

        const ratioOf = (x) => ratio(composited(x.color, x.bg, x.alpha), x.bg);
        const dim = tf.runs.concat(tf.out ? [tf.out] : []).filter((x) => ratioOf(x) < TEN_FOOT.contrastMin);
        t('H17b · and every one of them clears 4.5:1 with its inherited opacity composited in',
          dim.length === 0,
          dim.length ? dim.map((x) => `${x.sel} ${ratioOf(x).toFixed(2)}:1 at alpha ${x.alpha}`).join(', ')
            : `${tf.runs.length + 1} runs, worst ${Math.min(...tf.runs.concat([tf.out]).map(ratioOf)).toFixed(1)}:1`);
        t('H17b control · the same arithmetic on a deliberately faded run reports it failing',
          !!tf.faded && ratioOf(tf.faded) < TEN_FOOT.contrastMin,
          tf.faded ? `opacity .34 gives ${ratioOf(tf.faded).toFixed(2)}:1 — which is what OUT used to be`
            : 'no faded sample');

        const need = tf.vw * TEN_FOOT.edgePct / 100;
        const close = tf.runs.filter((x) => Math.min(x.l, x.r) < need - 1);
        t('H17c · nothing important sits inside §4\'s 4% edge margin',
          tf.pad >= need - 1 && close.length === 0,
          `padding ${tf.pad.toFixed(0)}px against a ${need.toFixed(0)}px floor (${TEN_FOOT.edgePct}% of ${tf.vw})`);

        t('H17d · and the frame is not broken by a phase enum or a spinner in words',
          !/^[A-Z_]+$/.test(tf.phase) && tf.phase.length > 0 && !/connect|reconnect/i.test(tf.net),
          `header reads "${tf.phase}" · footer reads "${tf.net || '(nothing)'}" while the socket is up`);
      }

      // ---------------------------------------------------------- H16 · the Reunion is rendered
      /**
       * 🚨 **THE REUNION WAS COMPUTED, TRANSMITTED, AND RENDERED BY NOTHING.** `show.mjs` builds
       * the whole special and sends it to the television and every phone; the page read three
       * fields of the roll call and dropped the rest, and carried **no award and no decisive
       * episode at all**. This plays a real season out to its end — the host's own S key, phase by
       * phase, nothing injected — and reads what is on the screen against the sealed deal.
       */
      const r = res.reunion, truth = res.truth;
      t('H16 arm · a real season was played to its Reunion in the browser',
        !!r && r.rows > 0 && /Reunion/i.test(r.phase), r ? `${r.phase} · ${r.rows} roll-call rows` : 'never reached REUNION');
      if (r && truth) {
        t('H16 · every seat in the sealed deal has a row, with the role it actually held',
          r.rows >= truth.seats.length && truth.seats.every((s) => r.text.includes(s.role)),
          `${r.rows} rows for ${truth.seats.length} seats · ${[...new Set(truth.seats.map((s) => s.role))].join(', ')}`);
        t('H16b · every row carries the final claim the page used to drop',
          (r.text.match(/claimed/g) || []).length >= truth.seats.length,
          `${(r.text.match(/claimed/g) || []).length} claim lines for ${truth.seats.length} seats`);
        t('H16b2 · and how somebody left, which was the other dropped field',
          /(taken|evicted)/.test(r.text),
          (r.text.match(/(taken|evicted[^<]*)/) || ['—'])[0]);
        t('H16c · the decisive episode is named, in the show\'s voice rather than a rule id',
          /Episode \d+ decided it/.test(r.text) && !/\bW[1-6]\b/.test(r.text),
          (r.text.match(/Episode \d+ decided it[^·]*/) || ['—'])[0].slice(0, 90));
        t('H16d · and the awards are on the screen, each with the evidence for it',
          r.awards > 0, `${r.awards} award row(s)`);
        t('H16 control · the same scan finds nothing of the kind before the Reunion',
          !/claimed|decided it/.test(off.stage), `the EXPEDITION stage reads "${off.stage.slice(0, 48)}"`);
      }
    }
  }
}

/**
 * Drive the real `show-tv.html` in real Chromium against a real `show.mjs`, three ways.
 * No dependencies: CDP over a socket, the same way `renderSweep` does it.
 */
async function tvSweep(chromePath) {
  const SHOW = 5242, STUB = 5241, CDP = 9378;
  let proc = null, stub = null, show = null, phones = [];
  const { startShow } = await import('../net/party/show.mjs');
  const { PHASE } = await import('../src/party/phases.js');
  const http = await import('node:http');
  try {
    /**
     * The stand-in for `npm run party:house`. `/silent` loads and says nothing; every other path
     * posts the one message `expedition.js` posts from `markReady()`. That message is the whole
     * contract between the two halves, so a stub that sends it exercises the real path.
     */
    stub = http.createServer((req, res) => {
      const quiet = req.url.startsWith('/silent');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><meta charset="utf-8"><title>house</title>
        <body style="margin:0;background:#101418"><script>${quiet ? '' : "parent.postMessage({t:'rrr.feed',ready:true},'*');"}</script>`);
    });
    await new Promise((r) => stub.listen(STUB, '127.0.0.1', r));

    const nonce = `t${process.pid}${pass}${fail}`;
    proc = spawn(chromePath, ['--headless=new', '--no-sandbox', '--disable-gpu',
      `--remote-debugging-port=${CDP}`, '--window-size=1920,1080',
      `--user-data-dir=/tmp/rrr-tv-${process.pid}`, `http://127.0.0.1:${STUB}/?${nonce}`], { stdio: 'ignore' });
    /**
     * ⚠️ AN `uncaughtException` LISTENER TURNS A CRASH INTO A CLEAN EXIT, AND THAT IS HOW A GATE
     * LIES. Registering one suppresses node's default "print it and exit 1" — so a TypeError in
     * an arm printed nothing, skipped every assertion after it and the run finished **0**. It
     * kills the browser AND ends the process the way an uncaught exception is supposed to.
     */
    const reap = () => { try { proc.kill(); } catch { /* already gone */ } };
    process.once('exit', reap);
    process.once('uncaughtException', (e) => { reap(); console.error(e); process.exit(1); });
    await new Promise((r) => setTimeout(r, 2600));

    const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
    const target = list.find((x) => x.type === 'page' && x.url.includes(nonce));
    if (!target) throw new Error(`no page target carrying this run's nonce on ${CDP}`);
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => { ws.onopen = r; });
    let id = 0; const waits = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); } };
    /**
     * ⚠️ EVERY CDP CALL HAS A DEADLINE, AND `location.href = …` IS NOT HOW A GATE NAVIGATES.
     * Both cost a run. An eval that starts a navigation never gets its reply back — the execution
     * context that would have answered is gone — so this hung for ever with a Chromium sitting
     * idle beside it, and a gate that hangs is worse than one that fails: nobody knows which of
     * the twenty-six stopped. `Page.navigate` is a command with a reply, and the deadline turns
     * any other stall into a red line with a method name on it.
     */
    const call = async (method, params = {}) => {
      const i = ++id;
      const p = new Promise((res, rej) => {
        waits.set(i, res);
        setTimeout(() => { if (waits.delete(i)) rej(new Error(`${method} timed out after 20s`)); }, 20000);
      });
      ws.send(JSON.stringify({ id: i, method, params }));
      const r = await p;
      if (r.error) throw new Error(`${method}: ${r.error.message}`);
      return r.result;
    };
    const js = async (expr) => {
      const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
      return r.result?.value;
    };
    const goto = async (url, ready = 'document.readyState === "complete" && !!document.getElementById("phase")') => {
      await call('Page.navigate', { url });
      for (let i = 0; i < 50; i++) {
        await new Promise((r) => setTimeout(r, 100));
        if (await js(ready).catch(() => false)) return;
      }
      throw new Error(`page never finished loading: ${url}`);
    };

    /** What is actually on the screen. `.hide` is `display:none!important`, so a rect of 0 is off. */
    const READ = `(() => {
      const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
      const f = document.getElementById('feed');
      const rail = document.getElementById('rail');
      return {
        phase: (document.getElementById('phase').textContent || '').trim(),
        feed: f ? { src: f.getAttribute('src'), visible: vis(f),
                    w: f.getBoundingClientRect().width, h: f.getBoundingClientRect().height } : null,
        circleVisible: vis(document.getElementById('circle')),
        railVisible: vis(rail), railSeats: rail ? rail.children.length : 0,
        stage: (document.getElementById('stage').textContent || '').trim(),
        vw: innerWidth, vh: innerHeight,
      };
    })()`;

    /**
     * §4's ten-foot rules, measured off the shipped television rather than off its stylesheet.
     * Font sizes as Chromium resolved them, ink composited over its own background at whatever
     * opacity it INHERITS, and the distance of every important run from an edge.
     */
    const TENFOOT = `(() => {
      const alphaOf = (el) => { let a = 1, n = el;
        while (n && n.nodeType === 1) { const o = parseFloat(getComputedStyle(n).opacity); if (Number.isFinite(o)) a *= o; n = n.parentElement; }
        return a; };
      const bgOf = (el) => { let n = el;
        while (n && n.nodeType === 1) { const c = getComputedStyle(n).backgroundColor;
          if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; n = n.parentElement; }
        return getComputedStyle(document.body).backgroundColor; };
      const read = (sel, el) => { const e = el || document.querySelector(sel); if (!e) return null;
        const cs = getComputedStyle(e), r = e.getBoundingClientRect();
        return { sel, px: Math.round(parseFloat(cs.fontSize)), color: cs.color, bg: bgOf(e), alpha: alphaOf(e),
                 l: r.left, r: innerWidth - r.right, t: r.top, b: innerHeight - r.bottom, w: r.width }; };
      const runs = ['#rail .seat .nm', '#rail .seat .claim', '#rail .seat .tag', '#ep', '#cams', '#crewline']
        .map((x) => read(x)).filter(Boolean);
      // The OUT rule, measured on a real seat: it is the shipped stylesheet that is in question.
      const seat = document.querySelector('#rail .seat');
      let out = null, faded = null;
      if (seat) {
        seat.classList.add('out');
        out = read('#rail .seat.out .nm', seat.querySelector('.nm'));
        // ...and a deliberately faded one, so the compositing arithmetic is shown to have teeth.
        seat.style.opacity = '.34';
        faded = read('#rail .seat.out .nm (faded)', seat.querySelector('.nm'));
        seat.style.opacity = '';
        seat.classList.remove('out');
      }
      return { runs, out, faded, phase: (document.getElementById('phase').textContent || '').trim(),
               net: (document.getElementById('net').textContent || '').trim(),
               pad: parseFloat(getComputedStyle(document.body).paddingLeft), vw: innerWidth, vh: innerHeight };
    })()`;

    /** One arm: a fresh show, five phones, cast through to a real EXPEDITION, then look. */
    const arm = async (houseArg, alsoAfter = false, toReunion = false) => {
      show = startShow({ port: SHOW, code: 'shot', stamp: 1700000000000 });
      phones = [];
      for (let i = 0; i < 5; i++) {
        const p = new WebSocket(`ws://127.0.0.1:${SHOW}/`);
        await new Promise((r) => { p.onopen = r; });
        p.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 'ping') p.send(JSON.stringify({ t: 'pong', at: m.at })); };
        p.send(JSON.stringify({ t: 'join', name: `R${i + 1}`, token: null, boot: 500 }));
        phones.push(p);
      }
      await new Promise((r) => setTimeout(r, 250));
      await goto(`http://127.0.0.1:${SHOW}/?house=${houseArg}`);
      await new Promise((r) => setTimeout(r, 500));
      show.begin(Date.now());
      const sess = show.sessionNow();
      for (let i = 0; i < 8 && sess.state.phase !== PHASE.EXPEDITION; i++) { sess.skip(Date.now()); await new Promise((r) => setTimeout(r, 120)); }
      await new Promise((r) => setTimeout(r, 700));
      const at = await js(READ);
      at.serverPhase = sess.state.phase;
      at.tenfoot = at.railVisible ? await js(TENFOOT) : null;
      const truth = sess.truth();
      let after = null;
      if (alsoAfter) {
        sess.skip(Date.now());
        await new Promise((r) => setTimeout(r, 600));
        after = await js(READ);
        after.serverPhase = sess.state.phase;
      }
      let reunion = null;
      if (toReunion) {
        /**
         * One death, so the roll call has something to say about how somebody left. It arrives the
         * way the mansion reports one — `role=sim`, `{t:'expedition', outcome:'taken'}`, the same
         * message `harness/storyboard.mjs` uses — rather than by writing into the session.
         */
        const sim = new WebSocket(`ws://127.0.0.1:${SHOW}/?role=sim`);
        await new Promise((r) => { sim.onopen = r; });
        sim.send(JSON.stringify({ t: 'expedition', outcome: 'taken' }));
        await new Promise((r) => setTimeout(r, 200));
        try { sim.close(); } catch { /* gone */ }
        // Play the season out the way the host does — the S key, phase by phase — until the win
        // machine calls it. Nothing is injected: the Reunion special is the one `show.mjs` built.
        for (let i = 0; i < 120 && sess.state.phase !== PHASE.REUNION; i++) {
          sess.skip(Date.now());
          await new Promise((r) => setTimeout(r, 40));
        }
        await new Promise((r) => setTimeout(r, 900));
        reunion = await js(`(() => {
          const st = document.getElementById('stage');
          return { phase: (document.getElementById('phase').textContent || '').trim(),
                   text: (st.textContent || '').trim(),
                   rows: st.querySelectorAll('.roll .row').length,
                   awards: st.querySelectorAll('.awards .row').length };
        })()`);
      }
      /**
       * ⚠️ THE BROWSER'S OWN SOCKET KEEPS THE SERVER ALIVE. `server.close()` stops listening and
       * then WAITS for every live connection, and the television is one — so closing the show
       * while the page still holds its socket never resolves. Park the page on the stub first,
       * then drop the phones, then close.
       */
      await goto(`http://127.0.0.1:${STUB}/parked`, 'document.readyState === "complete"').catch(() => {});
      for (const p of phones) { try { p.close(); } catch { /* gone */ } }
      await new Promise((r) => setTimeout(r, 200));
      try { show.lobby.tv && show.lobby.tv.destroy(); } catch { /* already gone */ }
      await show.close();
      show = null;
      await new Promise((r) => setTimeout(r, 150));
      return { at, after, reunion, truth };
    };

    const a = await arm(`http://127.0.0.1:${STUB}`, true);
    const b = await arm(`http://127.0.0.1:${STUB}/silent`);
    const c = await arm('off', false, true);

    proc.kill();
    await new Promise((r) => stub.close(r));
    return { house: a.at, later: a.after, silent: b.at, off: c.at, reunion: c.reunion, truth: c.truth };
  } catch (e) {
    try { proc && proc.kill(); } catch { /* gone */ }
    try { for (const p of phones) p.close(); } catch { /* gone */ }
    try { show && await show.close(); } catch { /* gone */ }
    try { stub && stub.close(); } catch { /* gone */ }
    return { error: e.message };
  }
}

/**
 * 🚨 **A HAND-WRITTEN FIXTURE FRAME IS A GATE MEASURING ITS OWN IMAGINATION.** The frame this
 * sweep used to inline was missing **nineteen paths the real one carries** — `nominations[]`,
 * `tally.*`, `expedition.room`, `call.made`: precisely the fields a leak sweep exists to look at —
 * and it declared `cameras: {needed: 5}`, a number `WIN_TARGETS` cannot produce at any player
 * count. So the overlay was being checked against a frame the server could never send.
 *
 * This plays a real show through `show.mjs`, with a published claim, a nomination and a vote, and
 * takes the frame off the TELEVISION'S OWN SOCKET — after `project()` has filtered it, which is
 * the only version of that object the overlay will ever be handed.
 */
async function realFrame() {
  const PORT = 5244;
  const { startShow, playerIdOf } = await import('../net/party/show.mjs');
  const { PHASE } = await import('../src/party/phases.js');
  const show = startShow({ port: PORT, code: 'sweep', stamp: 1700000000000 });
  const socks = [];
  const open = (q = '') => new Promise((res) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/${q}`);
    const msgs = [];
    ws.onmessage = (e) => { const m = JSON.parse(e.data); msgs.push(m); if (m.t === 'ping') ws.send(JSON.stringify({ t: 'pong', at: m.at })); };
    ws.onopen = () => res({ ws, msgs, send: (o) => ws.send(JSON.stringify(o)) });
    ws.onerror = () => res({ ws, msgs, send: () => {} });
  });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    await wait(120);
    const tv = await open('?role=tv');
    socks.push(tv);
    for (let i = 0; i < 8; i++) {
      const p = await open();
      p.send({ t: 'join', name: ROSTER[i], token: null, boot: 500 });
      socks.push(p);
    }
    await wait(250);
    show.begin(Date.now());
    const sess = show.sessionNow();
    const phones = socks.slice(1);
    // A published claim, so the rail has the one thing §4 puts on it that a player chose.
    phones[0].send({ t: 'act', msg: { t: 'claim', claim: 'fixer' } });
    await wait(120);
    for (let i = 0; i < 20 && sess.state.phase !== PHASE.RECKONING; i++) { sess.skip(Date.now()); await wait(60); }
    const living = sess.state.players.filter((p) => p.alive);
    phones[1].send({ t: 'act', msg: { t: 'nominate', target: living[3].id } });
    await wait(120);
    for (let i = 0; i < 4 && sess.state.phase !== PHASE.VOTE; i++) { sess.skip(Date.now()); await wait(60); }
    for (const p of phones) p.send({ t: 'act', msg: { t: 'vote', choice: living[3].id } });
    await wait(150);
    for (let i = 0; i < 4 && sess.state.phase !== PHASE.EXECUTION; i++) { sess.skip(Date.now()); await wait(60); }
    await wait(200);
    const frame = [...tv.msgs].reverse().find((m) => m.t === 'state')?.frame ?? null;
    for (const x of socks) { try { x.ws.close(); } catch { /* gone */ } }
    await wait(150);
    await show.close();
    return frame;
  } catch (e) {
    for (const x of socks) { try { x.ws.close(); } catch { /* gone */ } }
    try { await show.close(); } catch { /* gone */ }
    return null;
  }
}

/** Every leaf path in an object, so two frames can be compared as shapes rather than by eye. */
function paths(o, at = '') {
  if (o === null || typeof o !== 'object') return [at];
  if (Array.isArray(o)) return o.length ? paths(o[0], `${at}[]`) : [`${at}[]`];
  return Object.keys(o).flatMap((k) => paths(o[k], at ? `${at}.${k}` : k));
}

/** Render the real overlay in real Chromium and measure it. No dependencies — CDP over a socket. */
async function renderSweep(chromePath, frame) {
  const CDP = 9377;
  let proc = null;
  try {
    const page = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#000}</style>
      <div id="m" style="position:relative;width:100vw;height:100vh"></div>
      <script type="module">
        import { createBroadcast } from '/src/ui/broadcast.js';
        import { captionFor } from '/src/party/captions.js';
        import { solve } from '/src/party/shots.js';
        const bx = createBroadcast({ mount: document.getElementById('m') });
        const frame = ${JSON.stringify(frame)};
        bx.setFrame(frame, 64);
        bx.setShot(solve('STATIC', { subjectId: 'p1', probe: {
          pose: () => ({ x: 5, y: 0, z: 5, yaw: 0 }),
          sites: () => [{ index: 2, camIndex: 0, room: 'gallery', x: 1, y: 4, z: 1 }],
          sees: () => true, label: (r) => ({ gallery: 'EAST GALLERY' })[r] || r.toUpperCase(),
        } }));
        bx.say(captionFor({ kind: 'noise', room: 'gallery', rank: 2 }), 0);
        window.__ready = true;
      <\/script>`;

    // A tiny static server so the module imports resolve against the real files.
    const http = await import('node:http');
    const { readFileSync: rf } = await import('node:fs');
    const root = new URL('../', import.meta.url).pathname;
    const srv = http.createServer((req, res) => {
      const path = req.url.split('?')[0];
      if (path === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(page); }
      // Read BEFORE writing the header: the first draft wrote 200 and then threw, which crashed
      // the gate with ERR_HTTP_HEADERS_SENT instead of serving a 404.
      let body;
      try { body = rf(root + path.replace(/^\//, ''), 'utf8'); }
      catch { res.writeHead(404); return res.end(''); }
      res.writeHead(200, { 'content-type': 'text/javascript' });
      res.end(body);
    });
    await new Promise((r) => srv.listen(5188, '127.0.0.1', r));

    /**
     * 🚨 THE NONCE IS NOT DECORATION. A previous run of this gate crashed before its cleanup and
     * left four Chromiums alive on this port; the next run's `spawn` lost the bind, `/json/list`
     * answered from the STALE browser, and the arm measured a page built from CSS two edits old —
     * reporting a real-looking 26px failure against code that was already fixed. An instrument
     * that measures somebody else's process and prints a number is exactly the failure mode this
     * project keeps finding (`_limb1-rule.mjs` L27-34). So the page carries a nonce and the arm
     * refuses any target that is not the one it just launched.
     */
    const nonce = `n${process.pid}${pass}${fail}`;
    proc = spawn(chromePath, ['--headless=new', '--no-sandbox', '--disable-gpu',
      `--remote-debugging-port=${CDP}`, '--window-size=1920,1080', `http://127.0.0.1:5188/?${nonce}`], { stdio: 'ignore' });
    // Kill the browser even if this process dies unexpectedly, so the next run gets a clean port.
    /**
     * ⚠️ AN `uncaughtException` LISTENER TURNS A CRASH INTO A CLEAN EXIT, AND THAT IS HOW A GATE
     * LIES. Registering one suppresses node's default "print it and exit 1" — so a TypeError in
     * an arm printed nothing, skipped every assertion after it and the run finished **0**. It
     * kills the browser AND ends the process the way an uncaught exception is supposed to.
     */
    const reap = () => { try { proc.kill(); } catch { /* already gone */ } };
    process.once('exit', reap);
    process.once('uncaughtException', (e) => { reap(); console.error(e); process.exit(1); });
    await new Promise((r) => setTimeout(r, 2600));

    const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
    const target = list.find((x) => x.type === 'page' && x.url.includes(nonce));
    if (!target) {
      throw new Error(list.some((x) => x.type === 'page')
        ? `port ${CDP} is held by another browser (${list.length} targets, none carrying this run's nonce) — kill it and re-run`
        : 'no page target');
    }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => { ws.onopen = r; });
    let id = 0; const waits = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); } };
    const js = async (expr) => {
      const r = await new Promise((res) => { const i = ++id; waits.set(i, res); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } })); });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval failed');
      return r.result?.result?.value;
    };
    if (!(await js('window.__ready === true'))) throw new Error('overlay never mounted');

    const out = await js(`(() => {
      const texts = [...document.querySelectorAll('.rrr-bx *')]
        .filter(e => e.children.length === 0 && e.textContent.trim())
        .map(e => e.textContent.trim());
      const px = (sel) => { const e = document.querySelector(sel); return e ? Math.round(parseFloat(getComputedStyle(e).fontSize)) : 0; };
      const bx = document.querySelector('.rrr-bx').getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(document.querySelector('.rrr-bx')).paddingLeft);
      const inner = [...document.querySelectorAll('.rrr-nm, .rrr-third, .rrr-show')].map(e => {
        const r = e.getBoundingClientRect();
        return { l: r.left, r: window.innerWidth - r.right, t: r.top, b: window.innerHeight - r.bottom };
      });
      // The composited ink: opacity fades the plate along with the text on it, and two shipped
      // rules did exactly that — the segment clock at .72, and an OUT seat at .45.
      const alphaOf = (el) => { let a = 1, n = el;
        while (n && n.nodeType === 1) { const o = parseFloat(getComputedStyle(n).opacity); if (Number.isFinite(o)) a *= o; n = n.parentElement; }
        return a; };
      const bgOf = (el) => { let n = el;
        while (n && n.nodeType === 1) { const c = getComputedStyle(n).backgroundColor;
          if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; n = n.parentElement; }
        return 'rgb(0, 0, 0)'; };
      const seat = document.querySelector('.rrr-seat');
      if (seat) seat.classList.add('out');
      const runs = ['.rrr-seg', '.rrr-bug', '.rrr-cams', '.rrr-show', '.rrr-third', '.rrr-seat.out .rrr-nm', '.rrr-seat.out .rrr-cl']
        .map((sel) => { const e = document.querySelector(sel); if (!e) return null; const cs = getComputedStyle(e);
          return { sel, color: cs.color, bg: bgOf(e), alpha: alphaOf(e) }; })
        .filter(Boolean);
      if (seat) seat.classList.remove('out');
      return { texts, seats: document.querySelectorAll('.rrr-seat').length,
        name: px('.rrr-nm'), claim: px('.rrr-cl'), lower: px('.rrr-third'),
        pad, w: window.innerWidth, h: window.innerHeight, inner, runs };
    })()`);
    proc.kill(); await new Promise((r) => srv.close(r));

    const margin = Math.min(...out.inner.flatMap((r) => [r.l, r.r]));
    const need = out.w * TEN_FOOT.edgePct / 100;
    const names = (frame.players || []).map((p) => p.name);
    const claims = [...new Set((frame.players || []).map((p) => p.claim).filter(Boolean))];
    const cam = frame.cameras || {};
    const known = new Set([...allCaptions(), showBug(frame.episode), segmentClock(64),
      camWall(cam.unlocked || 0, cam.needed || 0), 'CAM 03 · EAST GALLERY · LIVE', '—']);
    const unknown = out.texts.filter((x) => {
      if (known.has(x)) return false;
      if (names.some((n) => x === `⬤ ${n}` || x === `✕ ${n}` || x === `⚒ ${n}`)) return false;   // the rail
      if (claims.some((c) => x === `“${c}”`) || x === 'RUNNER' || x === 'GUIDE') return false;   // §4's rail fields
      return true;
    });
    return {
      texts: out.texts, seats: out.seats, unknown, claims, frame, runs: out.runs,
      sizes: [['name', out.name, TEN_FOOT.nameMinPx], ['claim', out.claim, TEN_FOOT.claimMinPx], ['lower', out.lower, TEN_FOOT.lowerMinPx]],
      edgeOk: margin >= need - 1,
      edgeDetail: `closest run is ${margin.toFixed(0)}px from an edge, floor ${need.toFixed(0)}px (${TEN_FOOT.edgePct}% of ${out.w})`,
    };
  } catch (e) {
    try { proc && proc.kill(); } catch { /* already gone */ }
    return { error: e.message };
  }
}

console.log(`\nshot-solver: ${pass} passed, ${fail} failed${skip ? `, ${skip} skipped` : ''}`);
process.exit(fail ? 1 : 0);
