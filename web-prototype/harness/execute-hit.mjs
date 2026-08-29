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
 *
 * Pure node. `src/game/execute-hit.js` is THREE-free. Picture files are source-read:
 * CI has no `npm install`.
 */

import {
  HIT_CONTACT, HIT_SLACK, SHOW_CONTACT_S, LAST_LOOK, WRECK_HOLD_S,
  contactMix, retargetHead, occupies, execCamMode,
  stepLastLook, lastLookLive, lastLookOnAir,
  wreckPose, chairTopple, chairEyeline, seatedAim,
  wreckLook, wreckCam, talkCycleShots, talkShotAt, WRECK_SHOT, WRECK_LOOK_Y, WRECK_EYE_Y,
} from '../src/game/execute-hit.js';
import { SHOWRUNNER } from '../src/party/vote.js';
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
  && /playLoco/.test(introSrc)
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
  t('H7 · a finished wreck is on the floor, rolled, away from the sit-root',
    limp.y === 0 && limp.roll > 1 && Math.hypot(limp.x - sitAt.x, limp.z - sitAt.z) > 0.4);
  t('H7b · the chair topples as a separate object, the other way',
    chair.rotX > 1 && chair.x !== limp.x
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
t('H7e · smashLook dents the shell and setLimbVisible is no longer a no-op on the clone',
  /function smashLook/.test(introSrc)
  && /setLimbVisible\?\.\('shoulderL', false\)/.test(introSrc)
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
  && WRECK_HOLD_S > 1);

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
    && Math.hypot(held.body.x - held.chair.x, held.body.z - held.chair.z) > 0.3,
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
  t('H12c · a talk cycle with wreckage visits the wreck plate; without, it does not invent one',
    names.includes(WRECK_SHOT.name)
    && talkCycleShots(base, false).every((s) => s.name !== WRECK_SHOT.name)
    && talkShotAt(base.reduce((s, x) => s + x.dur, 0) + 0.2, withWreck).name === WRECK_SHOT.name);
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
}

if (fail) {
  console.log(`\nFAIL ${fail}  pass ${pass}\n`);
  process.exit(1);
}
console.log(`\npass ${pass}\n`);
