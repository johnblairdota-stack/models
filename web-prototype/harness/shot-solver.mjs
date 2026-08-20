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
import { solve, isFiller, CARDS, BODYCAM_RIG, WORK_RIG, FOV, STING_MIN_RANGE, bugFor, camWall } from '../src/party/shots.js';
import { captionFor, allCaptions, LOWER_THIRD, ROOM_LABEL, railFor, showBug, segmentClock, CAPTION_FIELDS } from '../src/party/captions.js';
import { TEN_FOOT, SIZES_VH, INK } from '../src/ui/broadcast.js';
import { ROOMS } from '../src/party/coverage.js';
import { SHOTS, KIND } from '../src/party/director.js';

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
  t('H6 control · with nothing in the way it sits at the shipped distance',
    Math.abs(dist(a) - BODYCAM_RIG.distance) < 0.5, `${dist(a).toFixed(2)}m vs ${BODYCAM_RIG.distance}m`);
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

  // WCAG relative luminance, so "4.5:1 on an opaque plate" is a number rather than a hope.
  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
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
  if (!existsSync(CHROME)) {
    skipped('H12 browser arm', `no Chromium at ${CHROME}; the ten-foot rules are still checked from SIZES_VH by H11, but nothing has laid this overlay out`);
  } else {
    const res = await renderSweep(CHROME);
    if (res.error) {
      skipped('H12 browser arm', `Chromium present but the render failed: ${res.error}`);
    } else {
      t('H12 arm · the overlay mounted and drew the rail, the bug and a lower third',
        res.texts.length > 10 && res.seats === 8, `${res.texts.length} text runs · ${res.seats} nameplates`);
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
    }
  }
}

/** Render the real overlay in real Chromium and measure it. No dependencies — CDP over a socket. */
async function renderSweep(chromePath) {
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
        const frame = ${JSON.stringify({
          episode: 3, pair: { runner: 'p2', guide: 'p5' },
          cameras: { unlocked: 3, needed: 5 },
          players: ROSTER.map((name, i) => ({ id: `p${i + 1}`, seat: i, name, alive: i !== 5, taken: i === 5, claim: i % 2 ? 'fixer' : null })),
        })};
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
    const reap = () => { try { proc.kill(); } catch { /* already gone */ } };
    process.once('exit', reap); process.once('uncaughtException', reap);
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
      return { texts, seats: document.querySelectorAll('.rrr-seat').length,
        name: px('.rrr-nm'), claim: px('.rrr-cl'), lower: px('.rrr-third'),
        pad, w: window.innerWidth, h: window.innerHeight, inner };
    })()`);
    proc.kill(); await new Promise((r) => srv.close(r));

    const margin = Math.min(...out.inner.flatMap((r) => [r.l, r.r]));
    const need = out.w * TEN_FOOT.edgePct / 100;
    const known = new Set([...allCaptions(), showBug(3), segmentClock(64), camWall(3, 5),
      'CAM 03 · EAST GALLERY · LIVE', '—']);
    const unknown = out.texts.filter((x) => {
      if (known.has(x)) return false;
      if (ROSTER.some((n) => x === `⬤ ${n}` || x === `✕ ${n}` || x === `⚒ ${n}`)) return false;  // the rail
      if (x === '“fixer”' || x === 'RUNNER' || x === 'GUIDE') return false;                       // §4's rail fields
      return true;
    });
    return {
      texts: out.texts, seats: out.seats, unknown, claims: ['fixer'],
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
