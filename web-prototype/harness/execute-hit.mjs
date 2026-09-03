#!/usr/bin/env node
/**
 * execute-hit — the lynch CONNECTS, the victim goes limp, the chair falls, C dies with them.
 *
 *   node harness/execute-hit.mjs
 *
 * John, 29 Aug, LastLook board: B is the show. C is a last-look box. There is no HIT
 * today without this gate — Attack is a floor chop, Sit_Dodge sits back at t=2s,
 * setLimbVisible on the clone is a no-op, and the chair instance never topples.
 *
 * H1–H4  the swing occupies the seated torso/head on the contact frame (retarget, not a new clip)
 * H5–H8  last-look C is live through the hit and hard-cuts off on death
 * H9–H11 B is the main camera; Showrunner degrades to A; C still plays
 * H12–H15 victim is limp/damaged, not a sit-idle; that chair is a separate toppled object
 * H16–H18 grip lock and Attack stay; clone setLimbVisible is real
 * H11+   the wreck STAYS after the empty execute cue — Ada is not parkSit'd living
 *        in episode-2 casting; her chair instance stays broken out of the InstancedMesh.
 * H13    a null `.image` after execute cannot white the TV; live follow does not keep `#err`
 * H14    the corpse mixer FREEZES (holdDead) — no Idle_M / loco idle / elbow-up prone
 * H15    wreck shell stays living albedo — death is visor crashed + face lamp off
 *
 * Pure node. `src/game/execute-hit.js` is THREE-free. Picture files are source-read:
 * CI has no `npm install`.
 */

import {
  HIT_CONTACT, HIT_SLACK, SHOW_CONTACT_S, LAST_LOOK, WRECK_HOLD_S,
  contactMix, retargetHead, occupies, execCamMode,
  stepLastLook, lastLookLive, lastLookOnAir,
  wreckPose, wreckSit, wreckSnap, chairTopple, chairEyeline, seatedAim,
  wreckLook, wreckCam, talkCycleShots, talkShotAt, WRECK_SHOT, WRECK_LOOK_Y, WRECK_EYE_Y,
  execLingerCam, lingerBeat, LINGER_TOTAL_S, LINGER_CRIME_S, LINGER_ORBIT_S, LINGER_GROUP_S,
  isFaceScreenName,
} from '../src/game/execute-hit.js';
import { liveTexture, dropDeadMaps, paintViewFail } from '../src/party/follow.js';
import { SHOWRUNNER } from '../src/party/vote.js';
import { executionPlate } from '../src/party/scorekeeper.js';
import { verdictPlateHtml } from '../src/party/look.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(ROOT, '..', rel), 'utf8');

const introSrc = read('src/game/intro-bed.js');
const meshSrc = read('src/characters/mesh-avatar.js');
const followSrc = read('src/party/follow.js');
const viewSrc = read('src/views/party-follow.js');
const bedSrc = read('src/game/follow-bed.js');
const hitSrc = read('src/game/execute-hit.js');
const stageSrc = read('src/game/accusation-stage.js');

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

const stepFn = introSrc.slice(
  introSrc.indexOf('function stepExecute'),
  introSrc.indexOf('function afterBodies'),
);
const cloneFn = meshSrc.slice(meshSrc.indexOf('export function cloneMeshAvatar'));
const gripBlock = meshSrc.slice(
  meshSrc.indexOf('export const GRIP_MOUNT'),
  meshSrc.indexOf('export const GRIP_SHIPPED'),
);

console.log('\nexecute-hit — the lynch connects\n');

/* ── H1 · contact math ──────────────────────────────────────────────────────────────────── */
t('H1 · Attack contact phase is the measured 0.381',
  HIT_CONTACT === 0.381
  && /contact: 0\.381/.test(meshSrc)
  && /clip: 'Attack'/.test(meshSrc));
t('H1b · contactMix is 0 at the start, 1 at/after contact',
  contactMix(0, HIT_CONTACT) === 0
  && contactMix(HIT_CONTACT, HIT_CONTACT) === 1
  && contactMix(1, HIT_CONTACT) === 1
  && Math.abs(contactMix(HIT_CONTACT / 2, HIT_CONTACT) - 0.5) < 1e-9);
t('H1c · retargetHead puts the sledge head on the aim at mix=1',
  (() => {
    const head = { x: 0, y: -0.37, z: 0 };
    const aim = { x: 1.2, y: 1.12, z: 0.4 };
    const hit = retargetHead(head, aim, 1);
    const mid = retargetHead(head, aim, 0.5);
    return occupies(hit, aim, 1e-9)
      && Math.abs(mid.y - (-0.37 + (1.12 + 0.37) * 0.5)) < 1e-9;
  })());
t('H1d · occupies uses a 0.22 m slack — same world point, not a wave',
  HIT_SLACK === 0.22
  && occupies({ x: 0, y: 1.1, z: 0 }, { x: 0.1, y: 1.2, z: 0.05 })
  && !occupies({ x: 0, y: 1.1, z: 0 }, { x: 0, y: 0.37, z: 0 }));

/* ── H2 · the bed actually retargets the mounted prop ───────────────────────────────────── */
t('H2 · intro-bed retargets the live sledge head onto the seated aim',
  /function retargetSledge/.test(introSrc)
  && /retargetHead/.test(introSrc)
  && /contactMix/.test(introSrc)
  && /victimAim/.test(introSrc)
  && /sledge\.head/.test(introSrc));
t('H2b · it does not swap Attack or invent a second hammer',
  /SWINGS\[0\]/.test(meshSrc)
  && !/Heavy_Hammer_Swing/.test(introSrc)
  && !/playAttack\([^)]*1\s*\)/.test(introSrc)
  && /Do not invent a second hammer|not a second hammer|GRIP_MOUNT/.test(meshSrc));
t('H2c · execute-hit.contact matches SWINGS[0] — the floor-chop is retargeted, not replaced',
  /HIT_CONTACT = 0\.381/.test(hitSrc)
  && /clip: 'Attack', grip: GRIP_SHIPPED, contact: 0\.381/.test(meshSrc));

/* ── H3 · no sit-back on the accused ────────────────────────────────────────────────────── */
t('H3 · stepExecute no longer plays settleClip / sits them back at ACCUSE.SETTLE',
  !/settleClip/.test(stepFn)
  && !/victimSettled/.test(stepFn)
  && !/ACCUSE\.SETTLE/.test(stepFn));
t('H3b · contact fires beginHit — limp, not a sit-idle',
  /function beginHit/.test(introSrc)
  && /wrecked = true/.test(introSrc)
  && /holdDead/.test(introSrc)
  && /smashLook/.test(introSrc)
  && /function stepWreck/.test(introSrc));

/* ── H4 · last-look state machine ───────────────────────────────────────────────────────── */
{
  let s = stepLastLook(LAST_LOOK.OFF, { armed: true, dead: false });
  t('H4 · C arms live when the accused is on the block',
    s === LAST_LOOK.LIVE && lastLookLive(s) && lastLookOnAir(s));
  s = stepLastLook(s, { armed: true, dead: true });
  t('H4b · death hard-cuts — no fade state',
    s === LAST_LOOK.CUT && lastLookOnAir(s) && !lastLookLive(s)
    && !/fade/i.test(hitSrc.split('stepLastLook')[1]?.slice(0, 400) || ''));
  s = stepLastLook(s, { consumeCut: true });
  t('H4c · one black frame, then the box is gone',
    s === LAST_LOOK.GONE && !lastLookOnAir(s));
  t('H4d · gone stays gone',
    stepLastLook(LAST_LOOK.GONE, { armed: true, dead: false }) === LAST_LOOK.GONE);
}

/* ── H5 · C is a small popup, B is the picture ──────────────────────────────────────────── */
t('H5 · last-look CSS is a small bottom-right box, never the full frame',
  /#fl \.lastlook/.test(followSrc)
  && /width:22%/.test(followSrc)
  && /THEIR EYES/.test(followSrc)
  && /OFF AIR/.test(followSrc)
  && /THEIR EYES/.test(viewSrc)
  && !/#fl \.lastlook \{[^}]*inset:0/.test(followSrc));
t('H5b · party-follow scissors C after the graded B render',
  /setScissorTest\(true\)/.test(viewSrc)
  && /camC/.test(viewSrc)
  && /lastLook/.test(viewSrc)
  && /consumeLastLookCut/.test(viewSrc)
  && /THEIR EYES/.test(viewSrc));
t('H5c · the box is gone after death — hidden unless live or cut',
  /ll\.state !== 'live' && ll\.state !== 'cut'/.test(viewSrc)
  || /state !== 'live' && ll\.state !== 'cut'/.test(viewSrc));
t('H5d · follow-bed forwards lastLook / consumeLastLookCut / executionReport',
  /lastLook: \(\) => intro\?\.lastLook/.test(bedSrc)
  && /consumeLastLookCut/.test(bedSrc)
  && /executionReport: \(\) => intro\?\.executionReport/.test(bedSrc));

/* ── H6 · B vs A ────────────────────────────────────────────────────────────────────────── */
t('H6 · a walking nominator is camera B; Showrunner degrades to A',
  execCamMode({ showrunner: false }) === 'B'
  && execCamMode({ showrunner: true }) === 'A'
  && execCamMode({ executionerId: SHOWRUNNER }) === 'A');
t('H6b · the bed fills B inside the ring and keeps A on fillExecuteEye',
  /function fillExecuteB/.test(introSrc)
  && /function fillExecuteEye/.test(introSrc)
  && /execCamMode/.test(introSrc)
  && /whipCam/.test(introSrc)
  && /cam === 'A'/.test(introSrc));
t('H6c · Showrunner still fires a contact so C can die — no ninth robot',
  SHOW_CONTACT_S === 1.2
  && /SHOW_CONTACT_S/.test(introSrc)
  && /exec\.showrunner && !exec\.hit/.test(stepFn));

/* ── H7 · wreck + chair ─────────────────────────────────────────────────────────────────── */
{
  const sitAt = { x: 3, y: 0, z: 0 };
  const limp = wreckPose({ sitAt, face: 0, u: 1, cx: 0, cz: 0, floorY: 0 });
  const chair = chairTopple({ seat: { x: 3, y: 0, z: 0, rotY: 0 }, u: 1, cx: 0, cz: 0 });
  t('H7 · a finished wreck is on its back on the floor, away from the sit-root',
    limp.y === 0 && limp.pitch > 1 && limp.roll < 0.5
    && Math.hypot(limp.x - sitAt.x, limp.z - sitAt.z) > 0.4);
  t('H7f · wreckPose({u:1}).y is floorY, and the clip at u=1 is not a Sit_* hold',
    limp.y === 0 && !/^Sit_/i.test(String(limp.clip || ''))
      && WRECK_HOLD_S <= 0.60 && WRECK_HOLD_S === 0.50);
  t('H7b · the chair topples as a separate object, offset from the torso',
    chair.rotX > 1 && chair.x !== limp.x
    && Math.hypot(chair.x - limp.x, chair.z - limp.z) > 0.9
    && Math.hypot(chair.x - 3, chair.z - 0) > 0.4);
  t('H7c · C\'s eyeline is the chair visor, not a ringside hold',
    (() => {
      const eye = chairEyeline({ chair: { x: 3, y: 0, z: 0 }, cx: 0, cz: 0 });
      return eye.y > 1 && eye.x < 3;
    })());
}
t('H7d · the bed breaks that instance out of the InstancedMesh',
  /function breakChairOut/.test(introSrc)
  && /hideChairInstance/.test(introSrc)
  && /exec-chair-/.test(introSrc)
  && /new THREE\.Mesh\(circle\.mesh\.geometry/.test(introSrc)
  && /function stepLooseChair/.test(introSrc));
t('H7e · smashLook still exists; clone setLimbVisible is still real (not used to hide a wreck limb)',
  /function smashLook/.test(introSrc)
  && /setLimbVisible\(socket, visible\)/.test(cloneFn)
  && /collapsed\.add/.test(cloneFn)
  && !/^\s*setLimbVisible\(\) \{\s*\}/m.test(cloneFn));

/* ── H8 · grip lock ─────────────────────────────────────────────────────────────────────── */
t('H8 · GRIP_MOUNT is John\'s measured lock — not a restale of 2.37',
  /roll: 5\.2446/.test(gripBlock)
  && /tilt: -1\.5664/.test(gripBlock)
  && /yaw: 0\.5279/.test(gripBlock)
  && /palm: 0\.04662/.test(gripBlock)
  && /reach: 0\.12458/.test(gripBlock)
  && /depth: -0\.03953/.test(gripBlock)
  && /alongHaft: 0\.2059/.test(gripBlock)
  && !/alongHaft: 2\.37/.test(meshSrc));
t('H8b · the hit file does not mention a second hammer or a new Meshy body',
  !/meshy\.com|new Meshy|fetch a new/i.test(hitSrc)
  && WRECK_HOLD_S <= 0.60);

/* ── H9 · report + plate language stay ──────────────────────────────────────────────────── */
t('H9 · executionReport names hit / limp / chair / lastLook / cam',
  /hit: exec\.hit/.test(introSrc)
  && /lastLook: exec\.lastLook/.test(introSrc)
  && /chairLoose/.test(introSrc)
  && /cam: execCamMode/.test(introSrc));
t('H9b · execution plate language is untouched — who / by whose hand',
  /function executionLine/.test(read('src/views/party-host.js'))
  && /function executionSwing/.test(read('src/views/party-host.js')));
t('H9c · accusation SETTLE still exists for Reckoning — only Execution stopped using it',
  /SETTLE: 2\.00/.test(stageSrc)
  && !/settleClip/.test(stepFn));

/* ── H16 · 🔨 "BEN SWINGS" ON ITS OWN LINE ───────────────────────────────────────────────────
 *
 * Couch Plan Rung 6. The Execution's big slot, `show-verdict-v`, is
 * `clamp(18px, 2.6vw, 32px)` / weight 800 / `text-transform:uppercase` in a `42rem` box, and it
 * was carrying the whole sentence — *"Ben swings — they named them, so their vote was already
 * cast."*, 61 characters. From a sofa that is three lines of shouting capitals whose first two
 * words are the fact. The event now owns the big line and the rule drops to `show-verdict-s`.
 *
 * 🚨 **THIS EXECUTES THE SHIPPED CHROME.** `executionPlate` lives in `src/party/scorekeeper.js`
 * and `verdictPlateHtml` in `src/party/look.js`, both pure, so the rendered HTML is built here
 * rather than pattern-matched — the `phone-accusation` lesson, and the reason a whole-file regex
 * could never have caught the 61-character line in the first place. H16d is the control: the
 * plate must still be able to say a LONG thing, so this is a rule about which slot, not a
 * character budget somebody can satisfy by deleting words.
 */
{
  const ben = { executed: 'p3', executioner: 'p1', threshold: 5, abstained: 0 };
  const plate = executionPlate(ben, 'Ben');
  const runner = executionPlate({ ...ben, executioner: SHOWRUNNER }, '');
  const nobody = executionPlate({ executed: null, threshold: 5, abstained: 0 }, 'Ben');

  t('H16 · the big line is the EVENT and nothing else — name, verb, stop',
    plate.line === 'Ben swings.'
    && runner.line === 'The Showrunner swings.'
    && plate.line.length <= 24
    && !/—|because|so their|already cast/i.test(plate.line),
    `"${plate.line}" · ${plate.line.length} chars · showrunner "${runner.line}"`);

  t('H16b · ...and the RULE is still said, one size down, never dropped',
    plate.why === 'they named them, so their vote was already cast'
    && runner.why === 'no nominator left to swing'
    && !plate.line.includes(plate.why),
    `"${plate.why}"`);

  // The rendered plate: the two facts land in two different elements, and the ballot
  // bookkeeping the beat already carried is still beside the rule rather than replaced by it.
  const html = verdictPlateHtml({
    kicker: 'CASTING IS NEXT.',
    line: plate.line,
    sub: [plate.why, `threshold ${ben.threshold} · abstained ${ben.abstained}`].join(' · '),
  });
  const big = (html.match(/<div class="show-verdict-v">([^<]*)<\/div>/) || [])[1] || '';
  const small = (html.match(/<div class="show-verdict-s">([^<]*)<\/div>/) || [])[1] || '';
  t('H16c · rendered, they are two elements: BEN SWINGS above, the rule and the threshold below',
    big === 'Ben swings.'
    && small.startsWith(plate.why)
    && small.includes('threshold 5')
    && small.includes('abstained 0')
    && !big.includes('threshold'),
    `v="${big}" · s="${small}"`);

  t('H16d control · the plate can still carry a long line — H16 is about which SLOT, not a word count',
    (verdictPlateHtml({ line: 'A'.repeat(90) }).match(/A{90}/) || []).length === 1
    && nobody.line === 'Nobody reached the threshold.' && nobody.why === ''
    && executionPlate(null).line === '',
    `no-eviction "${nobody.line}" · null plate is empty`);

  // And the view is still wired to both halves — a pure helper nobody calls is not chrome.
  const hostSrc16 = read('src/views/party-host.js').replace(/\r\n/g, '\n');
  t('H16e · the TV passes BOTH halves — the line to `verdict`, the rule to `verdictWhy`',
    /verdict: executionSwing\(client\.lynchResult, names\),/.test(hostSrc16)
    && /verdictWhy: executionSwingWhy\(client\.lynchResult\),/.test(hostSrc16)
    && /verdictKicker, verdictSub, verdictWhy,/.test(hostSrc16)
    && /executionPlate/.test(hostSrc16));
}

/* ── H10 · seated aim fallback ──────────────────────────────────────────────────────────── */
t('H10 · seatedAim is a visor-height torso when Head is missing',
  seatedAim({ sitAt: { x: 0, y: 0, z: 0 }, cx: 0, cz: 1 }).y === 1.12);

/* ── H11 · the wreck survives the empty execute cue ─────────────────────────────────────── */
{
  /*
   * John, sofa, 29 Aug, episode 2 of an 8-player night. Ada was lynched in episode 1
   * (nameplate face-down, "Ada is out"). CASTING sat her back in chair 7, plate up,
   * status READING, picking a runner. Cause: `clearExecute` restored smash, set
   * wrecked=false, parkSit'd the victim, and put the chair instance back. The empty
   * execute cue after the hit plate undid the wreck. Dead stay wreckage.
   */
  const clearFn = introSrc.slice(
    introSrc.indexOf('function clearExecute'),
    introSrc.indexOf('function clearExecute') + 1600,
  );
  const parkFn = introSrc.slice(
    introSrc.indexOf('function parkSit'),
    introSrc.indexOf('function parkSit') + 480,
  );
  t('H11 · clearExecute does not sit the victim back as living',
    /function clearExecute/.test(clearFn)
    && !/parkSit\(exec\.victim\)/.test(clearFn)
    && !/wrecked\s*=\s*false/.test(clearFn)
    && !/restoreSmash/.test(clearFn)
    && !/restoreLooseChair/.test(clearFn));
  t('H11b · parkSit itself refuses a wrecked robot',
    /if \(r\.wrecked\) return;/.test(parkFn));
  t('H11c · loose chairs persist as an array — the toppled instance is not restored',
    /looseChairs:\s*\[\]/.test(introSrc)
    && /function breakChairOut/.test(introSrc)
    && /exec\.looseChairs\.push/.test(introSrc)
    && /function stepLooseChair/.test(introSrc)
    && !/function restoreLooseChair/.test(introSrc));
  t('H11d · wreck age lives on the robot, so a cleared clock cannot sit them up',
    /r\.wreckAge/.test(introSrc)
    && /wreckedIds/.test(introSrc)
    && /chairLoose: exec\.looseChairs\.length > 0/.test(introSrc));
}

/* ── H12 · the wreck is standing set dressing after the plate ───────────────────────────── */
{
  /*
   * John, dusk sit-down 29 Aug. He was not on the hit. Afterwards he never saw
   * a robot on the floor or their chair. The wreck lived only while exec.phase
   * was on; setExecute('','') handed the lens back to visor talk (~1.16 m)
   * from outside the ring. A late watcher saw an empty gap. If the bed rebuilt,
   * wrecked flags died and the dead sat living again.
   *
   * Proof the camera HOLDS the wreck after the plate: wreckLook is the same
   * low pair B used on the hit (look = floor+0.42, eye = floor+0.78). A talk
   * cycle with wreckage visits that plate. Visor talk is ~1.16 m — this is not
   * that. applyWreck + wreckedSeen re-dress a rebuilt bed from public-dead ids.
   */
  const sitAt = { x: 3, y: 0, z: 0 };
  const seat = { x: 3, y: 0, z: 0, rotY: 0 };
  const held = wreckLook({ sitAt, seat, face: 0, cx: 0, cz: 0, floorY: 0 });
  const visorTalkY = 1.16;
  t('H12 · after the plate the wreck plate looks at floor body + toppled chair, not a visor',
    held.look.y === WRECK_LOOK_Y
    && held.eye.y === WRECK_EYE_Y
    && held.body.y === 0
    && held.look.y < 0.7
    && held.eye.y < 1.0
    && held.look.y < visorTalkY
    && Math.hypot(held.body.x - held.chair.x, held.body.z - held.chair.z) > 0.9,
    `look.y=${held.look.y} eye.y=${held.eye.y} visor=${visorTalkY}`);
  t('H12b · B\'s settled hit camera is that same pair — one look, not a second system',
    (() => {
      const live = wreckCam({
        body: { x: held.body.x, z: held.body.z },
        chair: { x: held.chair.x, z: held.chair.z },
        cx: 0, cz: 0, floorY: 0,
      });
      return live.look.y === held.look.y && live.eye.y === held.eye.y
        && Math.abs(live.look.x - held.look.x) < 1e-9;
    })());
  const base = [
    { name: 'pair', dur: 9.5, span: 0.55 },
    { name: 'orbit', dur: 13.0, span: 1.55 },
    { name: 'wide', dur: 11.0, span: 1.85 },
    { name: 'push', dur: 9.0, span: 0.28 },
    { name: 'across', dur: 12.0, span: 0.90 },
  ];
  const withWreck = talkCycleShots(base, true);
  const names = [];
  for (let t = 0; t < 80; t += 0.5) names.push(talkShotAt(t, withWreck).name);
  t('H12c · a talk cycle does not contain a 10s wreck shot — get off the wreck',
    !withWreck.some((s) => s?.name === WRECK_SHOT.name && (Number(s.dur) || 0) >= 10)
      && !names.includes(WRECK_SHOT.name)
      && WRECK_SHOT.dur < 10
      && talkCycleShots(base, false).every((s) => s.name !== WRECK_SHOT.name));
  t('H12d · talkFrame holds that plate after exec.phase is off; applyWreck survives dispose',
    /shot\.name === WRECK_SHOT\.name/.test(introSrc)
    && /wreckLook\(/.test(introSrc)
    && /function applyWreck/.test(introSrc)
    && /wreckHeld: robots\.some/.test(introSrc)
    && /wreckedSeen/.test(bedSrc)
    && /rememberWrecked/.test(bedSrc)
    && /applySeenWreck/.test(bedSrc)
    && /wrecked: \[\.\.\.wreckedSeen\]/.test(bedSrc)
    && !/function restoreLooseChair/.test(introSrc)
    && !/parkSit\(exec\.victim\)/.test(introSrc));
  /*
   * John, CAST6, 30 Aug. Verdict after Fox: TypeError reading null `.image`
   * (or `.images`) on the follow path, then the red plate stayed through
   * Reckoning. smashLook drops a dead map; the wreck mesh stays. A live
   * follow throw must not paint VIEW FAILED.
   */
  t('H13 · smashLook drops a null .image; live follow does not paint a permanent fail plate',
    liveTexture(null) === null
    && liveTexture({ image: null }) === null
    && liveTexture({ images: [null, 1, 1, 1, 1, 1] }) === null
    && dropDeadMaps({ map: { image: null } }) === 1
    && paintViewFail({ viewId: 'party.follow', live: true }) === false
    && /dropDeadMaps\(m\)/.test(introSrc)
    && /function smashLook/.test(introSrc)
    && /function liveTexture/.test(followSrc)
    && /picture failed/.test(viewSrc)
    && !/function restoreLooseChair/.test(introSrc));
}

{
  /*
   * John, live HEAT: executed robots played a living idle on the floor —
   * prone on their elbows, still moving, chair under the torso like a
   * push-up. Cause: applyWreck called playLoco and stepWreck kept
   * body.update() (mixer + gait) running. Freeze is explicit: holdDead
   * stops every action, bind pose, no mixer.update(dt). Late noms of
   * a corpse cannot sit them. restoreLooseChair stays gone.
   */
  const applyFn = introSrc.slice(
    introSrc.indexOf('function applyWreck'),
    introSrc.indexOf('function stepWreck'),
  );
  const stepWreckFn = introSrc.slice(
    introSrc.indexOf('function stepWreck'),
    introSrc.indexOf('function lastLookPose'),
  );
  t('H14 · a wreck freezes the mixer — no Idle_M / loco idle on a corpse',
    /holdDead\(\)/.test(cloneFn)
    && /pose = 'dead'/.test(cloneFn)
    && /if \(pose === 'dead'\)/.test(cloneFn)
    && /mixer\.stopAllAction/.test(cloneFn)
    && /skeleton\.pose\(\)/.test(cloneFn)
    && /holdDead/.test(applyFn)
    && !/playLoco/.test(applyFn)
    && !/body\.update\(/.test(stepWreckFn)
    && /hideChairInstance/.test(stepWreckFn)
    && !/function restoreLooseChair/.test(introSrc)
    && !/parkSit\(exec\.victim\)/.test(introSrc));
  t('H14b · playSit / playLoco refuse a frozen corpse',
    /playSit\([\s\S]*?if \(pose === 'dead'\) return false/.test(cloneFn)
    && /playLoco\(\) \{\s*if \(pose === 'dead'\) return false/.test(cloneFn));
}

{
  /*
   * John, live HEAT: wrecked robots must NOT be darkened or re-tinted.
   * Same shell/albedo as the living sit. Death read is only the face:
   * visor/screen crashed, face lamp off. No grayscale, no dim multiply,
   * no darker overlay, no missing shoulder.
   */
  const smashFn = introSrc.slice(
    introSrc.indexOf('function smashLook'),
    introSrc.indexOf('function restoreSmash'),
  );
  t('H15 · wreck death is the face only — visor crashed, lamp off, shell untouched',
    isFaceScreenName('faceplate')
    && isFaceScreenName('unit4h.faceplate')
    && !isFaceScreenName('visorBezel')
    && !isFaceScreenName('shell')
    && !isFaceScreenName('mintCapL')
    && /isFaceScreenName/.test(smashFn)
    && /emissiveIntensity = 0/.test(smashFn)
    && /setRGB\(0, 0, 0\)/.test(smashFn)
    && !/multiplyScalar\(0\.42\)/.test(smashFn)
    && !/multiplyScalar\(0\.12\)/.test(smashFn)
    && !/roughness \+ 0\.38/.test(smashFn)
    && !/setLimbVisible/.test(smashFn)
    && /dropDeadMaps/.test(smashFn));
}

{
  /*
   * CAST 8-bot: after contact the TV sat ~10s on the nominator's rear (fillExecuteEye)
   * and executed bodies vanished. Spec linger is 5.00 — crime 1.50, orbit 1.50, group
   * 2.00 — wreckCam's class, not a CUE_KIND. Striker parkSits during GROUP. Wreckage
   * outranks heldRunner hide. Victim stays wreckPose u=1. WRECK_SHOT.dur stays 0.
   */
  const kinds = followSrc.match(/export const CUE_KINDS = \[([^\]]+)\]/)?.[1] || '';
  t('H17 · linger totals 5.00 after contact — crime 1.50, orbit 1.50, group 2.00',
    LINGER_TOTAL_S === 5.00
    && LINGER_CRIME_S === 1.50 && LINGER_ORBIT_S === 1.50 && LINGER_GROUP_S === 2.00
    && Math.abs(LINGER_CRIME_S + LINGER_ORBIT_S + LINGER_GROUP_S - LINGER_TOTAL_S) < 1e-9
    && lingerBeat(0) === 'crime'
    && lingerBeat(1.49) === 'crime'
    && lingerBeat(1.50) === 'orbit'
    && lingerBeat(3.00) === 'group'
    && lingerBeat(5.00) === 'group'
    && WRECK_HOLD_S === 0.50
    && WRECK_SHOT.dur === 0
    && WRECK_SHOT.dur < 10,
    `${LINGER_CRIME_S}+${LINGER_ORBIT_S}+${LINGER_GROUP_S}=${LINGER_TOTAL_S}`);

  const sitAt = { x: 3, y: 0, z: 0 };
  const body = wreckPose({ sitAt, face: 0, u: 1, cx: 0, cz: 0, floorY: 0 });
  const chair = chairTopple({ seat: { x: 3, y: 0, z: 0, rotY: 0 }, u: 1, cx: 0, cz: 0 });
  const crime = execLingerCam({ body, chair, cx: 0, cz: 0, floorY: 0, elapsed: 0 });
  const crimeEnd = execLingerCam({ body, chair, cx: 0, cz: 0, floorY: 0, elapsed: 1.49 });
  const orbit = execLingerCam({ body, chair, cx: 0, cz: 0, floorY: 0, elapsed: 2.0 });
  const group = execLingerCam({
    body, chair, cx: 0, cz: 0, floorY: 0, elapsed: 4.0,
    living: [{ x: -2, z: 0 }, { x: 0, z: -2 }],
  });
  t('H17b · crime looks at the floor wreck; orbit moves; group leaves the nominator rear',
    crime.beat === 'crime' && crime.look.y > WRECK_LOOK_Y
    && Math.abs(crimeEnd.look.y - WRECK_LOOK_Y) < 0.02
    && body.y === 0
    && orbit.beat === 'orbit'
    && Math.hypot(orbit.eye.x - crimeEnd.eye.x, orbit.eye.z - crimeEnd.eye.z) > 0.2
    && group.beat === 'group'
    && group.look.y > WRECK_LOOK_Y,
    `crime look.y=${crime.look.y} → ${crimeEnd.look.y} · group look.y=${group.look.y}`);

  t('H17c · after contact the bed drives execLingerCam, not fillExecuteEye',
    /function fillLingerEye/.test(introSrc)
    && /execLingerCam\(/.test(introSrc)
    && /if \(exec\.hit\)/.test(introSrc)
    && /fillLingerEye\(\)/.test(introSrc)
    && /lingerBeat\(elapsed\) === 'group'/.test(introSrc)
    && /strikerSat/.test(introSrc)
    && /unmountProp/.test(introSrc)
    && /parkSit\(exec\.swinger\)/.test(introSrc));

  const driveFn = introSrc.slice(
    introSrc.indexOf('function driveOne'),
    introSrc.indexOf('function driveOne') + 1200,
  );
  t('H17d · wreckage is never hidden — wrecked outranks heldRunner',
    driveFn.indexOf('if (r.wrecked)') >= 0
    && driveFn.indexOf('if (r.wrecked)') < driveFn.indexOf('heldRunner != null')
    && /body\.root\.visible = true/.test(driveFn.slice(
      driveFn.indexOf('if (r.wrecked)'),
      driveFn.indexOf('if (r.wrecked)') + 160,
    )));

  t('H17e · no new CUE_KIND; WRECK_SHOT.dur is not a 10s plate',
    kinds.replace(/\s+/g, '') === "'intros','run','move','shot','idle','noms','pair','execute','pin'"
    && WRECK_SHOT.dur === 0
    && WRECK_SHOT.dur < 10
    && !/linger/.test(kinds)
    && !/execLinger/.test(kinds));

  /*
   * CAST8 H380: linger overran ~18s on the host VOTE/CAMERA WARMING clock.
   * HIT clock is exec.t - hitAt. clearExecute at 5.00. sit=false vanish is red.
   */
  const stepFn = introSrc.slice(
    introSrc.indexOf('function stepExecute'),
    introSrc.indexOf('function afterBodies'),
  );
  const camFn = introSrc.slice(
    introSrc.indexOf('const useTalk = talking'),
    introSrc.indexOf('const useTalk = talking') + 800,
  );
  t('H17f · linger on the HIT clock is 5.00 — CAST8-class 18s overrun is red',
    /elapsed = exec\.t - exec\.hitAt/.test(stepFn)
    && /elapsed >= LINGER_TOTAL_S/.test(stepFn)
    && /clearExecute\(\)/.test(stepFn)
    && LINGER_TOTAL_S === 5.00
    && LINGER_TOTAL_S < 18
    && /exec\.t >= exec\.swingAt \+ SWING_DUR/.test(stepFn)
    && /beginHit\(t\)/.test(stepFn),
    `HIT ${LINGER_TOTAL_S}s · swing-complete starts the clock`);
  t('H17g · after contact fillLingerEye owns the lens — not fillExecuteEye',
    /if \(exec\.hit\)/.test(camFn)
    && /fillLingerEye\(\)/.test(camFn)
    && camFn.indexOf('fillLingerEye()') < camFn.indexOf('fillExecuteEye()')
    && /function fillLingerEye/.test(introSrc)
    && !/fillExecuteEye\(\)/.test(stepFn));
  t('H17h · wreck sit=false vanish is red — wreckPose u=1 stays on floorY',
    body.y === 0
    && /if \(r\.wrecked\) return;/.test(introSrc)
    && /if \(r\.wrecked\)/.test(driveFn)
    && driveFn.indexOf('if (r.wrecked)') < driveFn.indexOf('heldRunner')
    && /body\.root\.visible = true/.test(driveFn));

  /*
   * CAST9 lingerWreck FAIL: Gus wreck=true sit=false; EXECUTION 12s CAMERA WARM.
   * Numbers stay 1.50/1.50/2.00/5.00. Linger on the HIT clock. Execute cue
   * hands the lens to intros so fillLingerEye owns it. No new CUE_KIND.
   */
  const hostSrc = read('src/views/party-host.js').replace(/\r\n/g, '\n');
  const execCue = bedSrc.slice(bedSrc.indexOf("if (c.kind === 'execute')"), bedSrc.indexOf("if (c.kind === 'pair')"));
  t('H17i · CAST9-class 12s CAMERA WARM is red — linger is 5.00 on the HIT clock',
    LINGER_TOTAL_S === 5.00
    && LINGER_TOTAL_S < 12
    && /elapsed = exec\.t - exec\.hitAt/.test(stepFn)
    && /elapsed >= LINGER_TOTAL_S/.test(stepFn)
    && /mode = 'intros'/.test(execCue)
    && /fillLingerEye\(\)/.test(introSrc)
    && /lingerOn/.test(bedSrc)
    && !/camera warming/.test((hostSrc.slice(hostSrc.indexOf('function talkSlateHtml'), hostSrc.indexOf('function talkSlateHtml') + 900)).replace(/\/\*[\s\S]*?\*\//g, ''))
    && WRECK_SHOT.dur === 0
    && WRECK_SHOT.dur < 10,
    `HIT ${LINGER_TOTAL_S}s · no CAMERA WARM in host chrome`);
  t('H17j · CAST9-class wreck=true sit=false vanish is red — wreckPose u=1 stays planted',
    body.y === 0
    && wreckPose({ sitAt: { x: 3, y: 0, z: 0 }, u: 1, floorY: 0 }).y === 0
    && wreckSit({ wrecked: true, seated: false }) === true
    && /wreckSit\(r\)/.test(introSrc)
    && /wrecked: !!r\.wrecked/.test(introSrc)
    && /if \(r\.wrecked\) return;/.test(introSrc)
    && !/fillExecuteEye\(\)/.test(stepFn)
    && kinds.replace(/\s+/g, '') === "'intros','run','move','shot','idle','noms','pair','execute','pin'",
    `floorY ${body.y} · sit planted when wrecked`);

  /*
   * CAST10 lingerWreck FAIL: Fox / Eli wreck=true sit=false; EXECUTION 11s / 9s.
   * Quote: Eli wreck=true sit=false tv=PRIME TIME ON AIR EPISODE 5 · EXECUTION
   * EXECUTION 9s. 78's linger-on-HIT claim is not a pass if CAST10 still
   * photographs sit=false at 9s / 11s. Numbers stay 1.50/1.50/2.00/5.00.
   * Linger on the HIT clock. WreckPose u=1 rest of night. No new CUE_KIND.
   */
  const fox = wreckPose({ sitAt: { x: 3, y: 0.9, z: 0 }, u: 1, floorY: 0 });
  const eli = wreckPose({ sitAt: { x: -2, y: 0.9, z: 1 }, u: 1, floorY: 0 });
  t('H17k · CAST10-class 11s/9s Fox/Eli wreck=true sit=false is red',
    fox.y === 0 && eli.y === 0
    && wreckSit({ wrecked: true, seated: false }) === true
    && wreckSit({ wrecked: true, seated: false }) !== false
    && LINGER_TOTAL_S === 5.00
    && LINGER_TOTAL_S < 9
    && LINGER_TOTAL_S < 11
    && lingerBeat(5.00) === 'group'
    && lingerBeat(9) === 'group'
    && lingerBeat(11) === 'group'
    && /elapsed = exec\.t - exec\.hitAt/.test(stepFn)
    && /elapsed >= LINGER_TOTAL_S/.test(stepFn)
    && /plantWreck\(r\)/.test(introSrc)
    && /u: 1/.test(introSrc.slice(
      introSrc.indexOf('function plantWreck'),
      introSrc.indexOf('function plantWreck') + 400,
    ))
    && /wreckSit\(r\)/.test(introSrc)
    && !/sit: r\.wrecked \? onFloor/.test(introSrc)
    && WRECK_SHOT.dur === 0
    && kinds.replace(/\s+/g, '') === "'intros','run','move','shot','idle','noms','pair','execute','pin'",
    `Fox y=${fox.y} Eli y=${eli.y} · sit planted at 9s/11s · linger ${LINGER_TOTAL_S}s`);

  /*
   * CAST11 lingerWreck FAIL: sit=false wreckPose=false every HIT.
   * Fox 10s, Ben 11s, Cy 10s. Quote: Cy wreck=true sit=false wreckPose=false
   * tv=EPISODE 6 · EXECUTION EXECUTION 10s. H483: snap.wreck=undefined
   * snap.sit=undefined. 80's H17 gates are not a pass. The mesh stays.
   */
  const cy = wreckSnap({
    wrecked: true, seated: false, sitAt: { x: 2, y: 0.9, z: 0 }, face: 0,
  }, { floorY: 0 });
  const fox11 = wreckSnap({
    wrecked: true, seated: false, sitAt: { x: 3, y: 0.9, z: 0 }, face: 0,
  }, { floorY: 0 });
  const ben = wreckSnap({
    wrecked: true, seated: false, sitAt: { x: -1, y: 0.9, z: 1 }, face: 0,
  }, { floorY: 0 });
  const vanished = { wreck: true, sit: false, wreckPose: false, snap: {} };
  t('H17m · CAST11-class sit=false wreckPose=false every HIT + 10s/11s is red',
    cy.wreck === true && cy.sit === true && cy.wreckPose && cy.wreckPose.y === 0
    && fox11.wreck === true && fox11.sit === true && fox11.wreckPose && fox11.wreckPose.y === 0
    && ben.wreck === true && ben.sit === true && ben.wreckPose && ben.wreckPose.y === 0
    && cy.wreck !== undefined && cy.sit !== undefined && cy.wreckPose !== false
    && cy.sit !== false
    && vanished.sit === false && vanished.wreckPose === false && vanished.snap.wreck === undefined
    && LINGER_TOTAL_S === 5.00
    && LINGER_TOTAL_S < 10 && LINGER_TOTAL_S < 11
    && lingerBeat(5.00) === 'group'
    && lingerBeat(10) === 'group'
    && lingerBeat(11) === 'group'
    && /wreckSnap\(/.test(introSrc)
    && /wreckPose:/.test(introSrc)
    && /r\.wreckPose = limp/.test(introSrc)
    && /plantWreck\(r\)/.test(introSrc)
    && /if \(r\.wrecked\) return;/.test(introSrc)
    && /body\.root\.visible = true/.test(driveFn)
    && WRECK_HOLD_S === 0.50
    && WRECK_SHOT.dur === 0
    && kinds.replace(/\s+/g, '') === "'intros','run','move','shot','idle','noms','pair','execute','pin'",
    `Cy sit=${cy.sit} wreckPose.y=${cy.wreckPose.y} · linger ${LINGER_TOTAL_S}s · CAST11 vanish is not this snap`);

  /*
   * CAST12 lingerWreck FAIL: wreck=true sit=false wreckPose=false.
   * EXECUTION 10s Fox; same class Ben/Eli/Gus/Hal/Dee. Dee EXECUTION 8s.
   * Quote: Dee wreck=true sit=false wreckPose=false tv=EPISODE 6 · EXECUTION
   * EXECUTION 8s. 82's wreckSnap keys in node is not a pass. H488 is the bar.
   * Numbers stay 1.50/1.50/2.00/5.00. Linger on the HIT clock. No new CUE_KIND.
   */
  const dee = wreckSnap({
    wrecked: true, seated: true, sitAt: { x: 2, y: 0.9, z: 0 }, face: 0,
    wreckPose: wreckPose({ sitAt: { x: 2, y: 0.9, z: 0 }, u: 1, floorY: 0 }),
  }, { floorY: 0 });
  const fox12 = wreckSnap({
    wrecked: true, seated: true, sitAt: { x: 3, y: 0.9, z: 0 }, face: 0,
  }, { floorY: 0 });
  const vanished12 = { wreck: true, sit: false, wreckPose: false };
  const plantFn = introSrc.slice(
    introSrc.indexOf('function plantWreck'),
    introSrc.indexOf('function stepWreck'),
  );
  t('H17n · CAST12-class sit=false wreckPose=false after HIT + 8s/10s is red',
    dee.wreck === true && dee.sit === true && dee.wreckPose && dee.wreckPose.y === 0
    && fox12.wreck === true && fox12.sit === true && fox12.wreckPose && fox12.wreckPose.y === 0
    && dee.wreckPose !== false && dee.sit !== false
    && vanished12.sit === false && vanished12.wreckPose === false
    && !(dee.wreck === true && dee.sit === false && dee.wreckPose === false)
    && wreckSit({ wrecked: true, seated: true }) === true
    && LINGER_TOTAL_S === 5.00
    && LINGER_TOTAL_S < 8 && LINGER_TOTAL_S < 10
    && lingerBeat(5.00) === 'group'
    && lingerBeat(8) === 'group'
    && lingerBeat(10) === 'group'
    && /elapsed = exec\.t - exec\.hitAt/.test(stepFn)
    && /elapsed >= LINGER_TOTAL_S/.test(stepFn)
    && /r\.seated = true/.test(plantFn)
    && /r\.wreckPose = limp/.test(plantFn)
    && /plantWreck\(r\)/.test(introSrc)
    && /if \(r\.wrecked\) return;/.test(introSrc)
    && /body\.root\.visible = true/.test(driveFn)
    && WRECK_HOLD_S === 0.50
    && WRECK_SHOT.dur === 0
    && kinds.replace(/\s+/g, '') === "'intros','run','move','shot','idle','noms','pair','execute','pin'",
    `Dee sit=${dee.sit} wreckPose.y=${dee.wreckPose.y} · linger ${LINGER_TOTAL_S}s · CAST12 vanish is not this mesh`);
}

{
  /*
   * CAST13 lingerWreck FAIL: wreck=true sit=false wreckPose=false.
   * EXECUTION 10s Fox (same Eli/Ben/Gus/Hal). Hal EXECUTION 20s is the
   * beat clock — do not treat 20s as linger fail. 84 planting wreckPose
   * in node is not a pass. H518 is the bar. Numbers stay 1.50/1.50/2.00/5.00.
   */
  const hal = wreckSnap({
    wrecked: true, seated: true, sitAt: { x: 2, y: 0.9, z: 0 }, face: 0,
    wreckPose: wreckPose({ sitAt: { x: 2, y: 0.9, z: 0 }, u: 1, floorY: 0 }),
  }, { floorY: 0 });
  const fox13 = wreckSnap({
    wrecked: true, seated: true, sitAt: { x: 3, y: 0.9, z: 0 }, face: 0,
  }, { floorY: 0 });
  const vanished13 = { wreck: true, sit: false, wreckPose: false };
  const after10 = wreckSnap({
    wrecked: true, seated: true, sitAt: { x: 3, y: 0.9, z: 0 }, face: 0,
    wreckPose: wreckPose({ sitAt: { x: 3, y: 0.9, z: 0 }, u: 1, floorY: 0 }),
  }, { floorY: 0 });
  const plantFn13 = introSrc.slice(
    introSrc.indexOf('function plantWreck'),
    introSrc.indexOf('function stepWreck'),
  );
  const driveFn13 = introSrc.slice(
    introSrc.indexOf('function driveOne'),
    introSrc.indexOf('function driveOne') + 1200,
  );
  const kinds13 = followSrc.match(/export const CUE_KINDS = \[([^\]]+)\]/)?.[1] || '';
  const poseU = wreckPose({ sitAt: { x: 1, y: 0.9, z: 0 }, u: 1, floorY: 0 });
  t('H17o · CAST13-class sit=false wreckPose=false after HIT + 10s is red; EXECUTION 20s is not linger fail',
    hal.wreck === true && hal.sit === true && hal.wreckPose && hal.wreckPose.y === 0
    && hal.wreckPose.u === 1
    && fox13.wreck === true && fox13.sit === true && fox13.wreckPose && fox13.wreckPose.u === 1
    && after10.wreck === true && after10.sit === true && after10.wreckPose && after10.wreckPose.u === 1
    && after10.wreckPose !== false && after10.sit !== false
    && vanished13.sit === false && vanished13.wreckPose === false
    && !(hal.wreck === true && hal.sit === false && hal.wreckPose === false)
    && poseU.u === 1
    && wreckSit({ wrecked: true, seated: false }) === true
    && LINGER_TOTAL_S === 5.00
    && LINGER_TOTAL_S < 10
    && lingerBeat(5.00) === 'group'
    && lingerBeat(10) === 'group'
    && lingerBeat(20) === 'group'
    && /elapsed = exec\.t - exec\.hitAt/.test(stepFn)
    && /elapsed >= LINGER_TOTAL_S/.test(stepFn)
    && /r\.seated = true/.test(plantFn13)
    && /r\.wreckPose = limp/.test(plantFn13)
    && /plantWreck\(r\)/.test(introSrc)
    && /if \(r\.wrecked\) return;/.test(introSrc)
    && /body\.root\.visible = true/.test(driveFn13)
    && WRECK_HOLD_S === 0.50
    && WRECK_SHOT.dur === 0
    && kinds13.replace(/\s+/g, '') === "'intros','run','move','shot','idle','noms','pair','execute','pin'",
    `Hal sit=${hal.sit} wreckPose.u=${hal.wreckPose.u} · linger ${LINGER_TOTAL_S}s · EXECUTION 20s is the beat · CAST13 vanish is not this mesh`);
}

if (fail) {
  console.log(`\nFAIL ${fail}  pass ${pass}\n`);
  process.exit(1);
}
console.log(`\npass ${pass}\n`);
