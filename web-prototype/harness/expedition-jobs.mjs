#!/usr/bin/env node
/**
 * expedition-jobs — John's two locked jobs, asserted rather than hoped.
 *
 *   node harness/expedition-jobs.mjs
 *
 * Night one is the twin-painting smash (WALL_CALL) with a delayed empty-nail still.
 * Later nights are one noisy DRILL until a camera mounts. Blind still lights.
 * Voice is in the room; pad buttons do not send the call. Fail chrome names no one.
 * TV gets no map and no hunter path.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { missionFor, MISSION_PAINTING, MISSION_DRILL, MISSION_TABLE } from '../src/party/mission.js';
import {
  FACES, SHOTS, GUIDE_VOICE, RUNNER_VOICE, JOB, FAIL_CHROME, SMASH_CHROME,
  realFaceFor, drillShotFor, footstepsCue, smashDebrief, voiceDebrief, blindDebrief,
  unnamedFail, isVoiceWord, voiceSendsNothing, twinHang, camHang, TWIN, WALL_CAM,
} from '../src/party/jobs.js';
import { TASKS, byId, failurePayload } from '../src/party/tasks.js';
import { recapFromEvents } from '../src/party/recap.js';
import { createRoom } from '../src/party/room.js';
import { FAILURE_FIELDS } from '../src/party/events.js';
import { WORLD_MISSION_KEYS } from '../src/party/follow.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

let pass = 0, fail = 0;
const t = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); }
  return c;
};

console.log('\nexpedition-jobs — twin smash, then one noisy mount');

t('J0 · episode 1 is the twin smash; 2+ is DRILL until a camera mounts',
  missionFor(1) === MISSION_PAINTING && missionFor(undefined) === MISSION_PAINTING
    && missionFor(2) === MISSION_DRILL && missionFor(3) === MISSION_DRILL
    && MISSION_PAINTING.job === JOB.SMASH && MISSION_PAINTING.task === 'WALL_CALL'
    && MISSION_DRILL.job === JOB.DRILL && MISSION_DRILL.task === 'TALLY'
    && MISSION_PAINTING.room === 'gallery' && MISSION_DRILL.room === 'gallery'
    && MISSION_PAINTING.target === 'twin-painting' && MISSION_DRILL.target === 'wall-cam',
  `${MISSION_PAINTING.id} → ${MISSION_DRILL.id}`);

t('J0b · chapel table-round is not a job anymore',
  missionFor(2) !== MISSION_TABLE && MISSION_DRILL.target !== 'table-round');

t('J1 · WALL_CALL lie is which identical face; TALLY lie is seated hall vs floor',
  byId('WALL_CALL').lie.includes('identical')
    && /hall|floor|seated/i.test(byId('TALLY').lie)
    && new Set(TASKS.map((x) => x.lie)).size === TASKS.length);

t('J1b · two faces, same loudness, no TILT task',
  FACES.join(',') === 'left,right'
    && byId('WALL_CALL').noise.successPeak === byId('WALL_CALL').noise.failurePeak
    && !TASKS.some((x) => x.id === 'TILT'));

t('J2 · REAL face and drill shot are seeded, not invented at recap',
  FACES.includes(realFaceFor(1, 1)) && FACES.includes(realFaceFor(2, 1))
    && SHOTS.includes(drillShotFor(1, 2)) && SHOTS.includes(drillShotFor(99, 4))
    && realFaceFor(1, 1) === realFaceFor(1, 1)
    && drillShotFor(7, 3) === drillShotFor(7, 3));

t('J3 · runner CLOSE/LATE/GOING and guide GO/HOLD are the voice words',
  RUNNER_VOICE.join(',') === 'CLOSE,LATE,GOING'
    && GUIDE_VOICE.join(',') === 'GO,HOLD'
    && isVoiceWord('CLOSE') && isVoiceWord('hold') && !isVoiceWord('LEFT')
    && voiceSendsNothing()
    && RUNNER_VOICE.includes(footstepsCue(0, 0)));

t('J4 · debrief sentences name no person',
  !/Ellie|Ozz/.test(smashDebrief('left', 'right'))
    && smashDebrief('left', 'right') === 'You said left. The nail is the other wall.'
    && voiceDebrief('CLOSE') === 'She said close and you kept her on it.'
    && /boards/.test(blindDebrief('seated'))
    && !/p\d|runner id|guide id/i.test(voiceDebrief('LATE')));

t('J5 · fail chrome is unnamed and shared',
  FAIL_CHROME.take === 'He found them'
    && FAIL_CHROME.quiet === 'The house went quiet'
    && !/Ellie|Ozz|named/i.test(FAIL_CHROME.take)
    && SMASH_CHROME.hit === 'She hits one.');

{
  const p = unnamedFail('heard', 'gallery', 4, 1.4);
  const extra = Object.keys(p).filter((k) => !FAILURE_FIELDS.includes(k));
  let threw = false;
  try { failurePayload('TALLY', { ...p, who: 'p3' }); } catch { threw = true; }
  t('J5b · a heard/timeout payload cannot carry a culprit',
    extra.length === 0 && threw);
}

t('J6 · hang helpers place twins on one wall and the cam on the other — not a floorplan',
  (() => {
    const gal = { x0: 0, x1: 10, z0: 0, z1: 6 };
    const L = twinHang(gal, 'left');
    const R = twinHang(gal, 'right');
    const C = camHang(gal);
    return L && R && C
      && L.z === R.z && L.x !== R.x
      && Math.abs(R.x - L.x - TWIN.frameW - TWIN.gap) < 1e-9
      && C.z !== L.z
      && L.y === TWIN.hangY && C.y === WALL_CAM.hangY;
  })());

{
  const phone = src('../src/views/party-phone.js');
  t('J7 · phone voice buttons are local — they never send the call',
    /data-voice/.test(phone)
      && /Local only\. Do not send/.test(phone)
      && /buttons send nothing/i.test(phone)
      && !/t: 'voice'/.test(phone)
      && !/t: 'call'/.test(phone)
      && /id="drill-btn"/.test(phone)
      && /twin-face/.test(phone)
      && /FOOTSTEPS/.test(phone));
}

{
  const host = src('../src/views/party-host.js');
  t('J8 · TV follow does not say which face, and fail chrome names no one',
    /SMASH_CHROME\.hit/.test(host)
      && /FAIL_CHROME\.take/.test(host)
      && /data-prod-still/.test(host)
      && /Scenery, not a map/.test(host)
      && !/hunter path/.test(host)
      && !/Ellie hit/.test(host)
      && !/Ozz lied/.test(host));
}

{
  const bed = src('../src/game/follow-bed.js');
  t('J8b · follow bed has twins + wall cam, no RunnerRoute rewrite, NoiseBus on smash/drill',
    /function buildTwinPaintings/.test(bed)
      && /function buildWallCam/.test(bed)
      && /mission-painting-\$\{face\}/.test(bed)
      && /NO MARK ON EITHER/.test(bed)
      && /new NoiseBus/.test(bed)
      && /PARTY_NOISE\.prop/.test(bed)
      && /DRILL\.loudness/.test(bed)
      && /class RunnerRoute/.test(bed)
      && !/waypoint tour/.test(bed)
      && !/baked path/.test(bed));
}

t('J9 · world report may carry job / emptyNail / heard, never a person',
  WORLD_MISSION_KEYS.includes('job')
    && WORLD_MISSION_KEYS.includes('emptyNail')
    && WORLD_MISSION_KEYS.includes('heard')
    && !WORLD_MISSION_KEYS.some((k) => /who|player|name|role/i.test(k)));

{
  const smash = createRoom({ count: 8, castSeed: 1, worldSeed: 1, send: () => {} });
  smash.start();
  smash.playEpisode({ scaffold: false });
  const before = smash.state.cameras.unlocked;
  smash.setWorld({
    runner: { room: 'gallery', x: 1, z: 1 }, hunter: null,
    mission: { phase: 'return', room: 'ballroom', job: 'smash' },
  });
  smash.setWorld({
    runner: { room: 'ballroom', x: 2, z: 2 }, hunter: null,
    mission: { phase: 'done', room: 'ballroom', job: 'smash', emptyNail: 'right' },
  });
  const card = recapFromEvents(smash.log.all());
  const still = smash.log.all().filter((e) => e.type === 'run.wall_still');
  t('J10 · smash return lights a camera; done emits an empty-nail still with no name',
    smash.state.cameras.unlocked === before + 1
      && card.cameraLit === true
      && card.emptyNail === 'right'
      && still.length === 1
      && still[0].data.emptyNail === 'right'
      && !('who' in (still[0].data || {}))
      && !('player' in (still[0].data || {})),
    JSON.stringify({ unlocked: smash.state.cameras.unlocked, card, still: still[0]?.data }));
}

{
  const dark = createRoom({ count: 8, castSeed: 1, worldSeed: 1, send: () => {} });
  dark.start();
  dark.playEpisode({ scaffold: false });
  const before = dark.state.cameras.unlocked;
  dark.setWorld({
    runner: { room: 'gallery', x: 1, z: 1 }, hunter: null,
    mission: { phase: 'seek', room: 'gallery', job: 'drill' },
  });
  t('J11 · a drill that never mounts stays CAM DARK',
    recapFromEvents(dark.log.all()).cameraLit === false
      && dark.state.cameras.unlocked === before);

  const lit = createRoom({ count: 8, castSeed: 2, worldSeed: 9, send: () => {} });
  lit.start();
  lit.playEpisode({ scaffold: false });
  // Skip to episode 2's job without a real smash so the next return is the drill.
  lit.state.airingEpisode = 2;
  lit.state.episode = 2;
  const before2 = lit.state.cameras.unlocked;
  lit.setWorld({
    runner: { room: 'gallery', x: 1, z: 1 }, hunter: null,
    mission: { phase: 'return', room: 'ballroom', job: 'drill' },
  });
  const card = recapFromEvents(lit.log.all());
  t('J11b · a finished drill (sharp or blind) still lights toward the target of 4',
    lit.state.cameras.unlocked === before2 + 1
      && card.cameraLit === true
      && card.seated === true
      && card.job === 'drill'
      && lit.state.pendingTool != null
      && SHOTS.includes(lit.state.pendingTool),
    JSON.stringify({ unlocked: lit.state.cameras.unlocked, card, pending: lit.state.pendingTool }));

  lit.beginCasting();
  t('J11c · next night reveals HALL or FLOOR — not tonight, and not a map',
    SHOTS.includes(lit.state.cameras.tool)
      && lit.state.pendingTool == null
      && lit.log.all().some((e) => e.type === 'run.cam_tool' && SHOTS.includes(e.data?.shot))
      && recapFromEvents(lit.log.all()).tool === lit.state.cameras.tool);
}

{
  const heard = createRoom({ count: 8, castSeed: 1, worldSeed: 1, send: () => {} });
  heard.start();
  heard.playEpisode({ scaffold: false });
  heard.setWorld({
    runner: { room: 'gallery', x: 1, z: 1 }, hunter: null,
    mission: { phase: 'seek', room: 'gallery', job: 'drill', heard: true },
  });
  const fail = heard.log.all().filter((e) => e.type === 'run.fail_chrome');
  t('J12 · heard-the-drill shares unnamed chrome and does not light',
    fail.length === 1
      && fail[0].data.line === FAIL_CHROME.take
      && !('who' in (fail[0].data || {}))
      && recapFromEvents(heard.log.all()).failLine === FAIL_CHROME.take
      && recapFromEvents(heard.log.all()).cameraLit === false);
}

{
  const recap = src('../src/party/recap.js');
  const host = src('../src/views/party-host.js');
  t('J13 · recap/host never print a hunter path or a floorplan',
    !/floorplan|floor plan|hunter path|patrol/i.test(recap)
      && /Scenery, not a map/.test(host)
      && !/pathPortals/.test(host));
}

console.log(`\nexpedition-jobs: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
