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

import { missionFor, stampSelectedJob, missionForSelected, lightsArmedFor, portraitArmedFor, MISSION_PAINTING, MISSION_DRILL, MISSION_TABLE, MISSION_PORTRAIT, MISSION_LIGHTS, MISSION_MISSING } from '../src/party/mission.js';
import {
  FACES, SHOTS, GUIDE_VOICE, RUNNER_VOICE, JOB, FAIL_CHROME, SMASH_CHROME,
  realFaceFor, drillShotFor, footstepsCue, smashDebrief, voiceDebrief, blindDebrief,
  unnamedFail, isVoiceWord, voiceSendsNothing, twinHang, camHang, TWIN, WALL_CAM,
  ROUTE_CATALOG, ROUTE_STATUS, TIE_ROUTE, HELD_BRIEF,
  availableRoutes, choosableRoutes, canOfferRoute, projectRoute, freshRoute,
  routeMenuHtml, routePadHtml, stationPadHtml, heldBrief,
} from '../src/party/jobs.js';
import { TASKS, byId, failurePayload, canClaimStation, applyStationClaim, confirmStationClaim, crewReady, ROUTE_CAPS } from '../src/party/tasks.js';
import {
  HEAT_TRIP_MS, HEAT_RISE, generatePadHtml, lightsBoardHtml, lightsLeaks, neededOutput,
  projectLights, setGenerating, tickSeat, tripLeft,
} from '../src/party/heat.js';
import {
  PORTRAIT_JOB, RHYTHM_MS, STROKE_LIFT, CRAWL_NEED, CRAWL_RATE,
  catchPortrait, freshPortraitBoard, freshPortraitSeat, galleryBoardHtml, portraitLeaks,
  portraitPadHtml, portraitSuccess, projectPortrait, pulsePull, setCrawling, tickPortrait,
} from '../src/party/portrait.js';
import { tallyRouteVotes, canRouteVote } from '../src/party/vote.js';
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
  /*
   * 🗣️ **THE BUTTONS ARE GONE, WHICH IS THE STRONGEST FORM OF THE RULE THIS CHECK GUARDS.**
   *
   * It used to assert that six tappable words — CLOSE / LATE / GOING and GO / HOLD — were LOCAL:
   * `data-voice` present, *"buttons send nothing"* printed beside them, no `t:'voice'` verb. John
   * removed them on 2026-09-01: *"Drop fake tappable CLOSE/LATE/GOING and GO/HOLD cue BUTTONS.
   * Voice stays in the room. One SAY line of text is fine. FOOTSTEPS can stay as a small line,
   * not a 3-button row."*
   *
   * A control that reaches nobody teaches the one seat that is supposed to be watching a
   * television that the game is in their hand — and one of these had grown teeth, gating the real
   * DRILL button until a decorative one had been tapped. So the assertion inverts: `data-voice` is
   * now a RED LINE, the words survive as copy in a `say-line`, and the verbs are still absent.
   * `voiceSendsNothing()` is unchanged and is now a statement about a pad with nothing to press.
   */
  t('J7 · the fake voice buttons are gone, and the words are copy — nothing to press, nothing to send',
    !/data-voice/.test(phone)
      && !/voice-btn/.test(phone)
      && /say-line/.test(phone)
      && /Say <strong>CLOSE<\/strong>/.test(phone)
      && /Say <strong>GO<\/strong>/.test(phone)
      && !/t: 'voice'/.test(phone)
      && !/t: 'call'/.test(phone)
      && voiceSendsNothing()
      && /id="drill-btn"/.test(phone)
      && /twin-face/.test(phone)
      && /FOOTSTEPS/.test(phone));
  t('J7b control · the DRILL hold is no longer gated on a decorative tap',
    !/if \(!state\.voice\.runner\)/.test(phone)
      && !/Say it first/.test(phone)
      && /state\.pad\.act = 1;/.test(phone));
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

/* =================================================================================================
 * J14+ · ROUTE / TASK MENU — catalog, vote lock, tie → Lights, stations. Portrait/Lights implemented.
 * ============================================================================================== */

{
  const ids = ROUTE_CATALOG.map((r) => r.id);
  t('J14 · catalog is data-driven — portrait, lights, and three stubs',
    ids.join(',') === 'portrait,lights,switchboard,salvage-bench,carry-the-heart'
      && ROUTE_CATALOG.every((r) => r.name && r.minimum >= 1 && Array.isArray(r.stations)
        && Object.values(ROUTE_STATUS).includes(r.status))
      && routeByStatus('portrait') === ROUTE_STATUS.IMPLEMENTED
      && routeByStatus('lights') === ROUTE_STATUS.IMPLEMENTED
      && ROUTE_CATALOG.filter((r) => r.status === ROUTE_STATUS.STUB).length === 3);

  function routeByStatus(id) {
    return ROUTE_CATALOG.find((r) => r.id === id)?.status;
  }
}

{
  const two = availableRoutes(2).map((r) => r.id);
  const three = availableRoutes(3).map((r) => r.id);
  const eight = availableRoutes(8).map((r) => r.id);
  t('J15 · Portrait is not offered below 3 living; Lights is; stubs never offered',
    !two.includes('portrait') && two.includes('lights')
      && three.includes('portrait') && three.includes('lights')
      && eight.includes('portrait') && eight.includes('lights')
      && !availableRoutes(8).some((r) => r.status === ROUTE_STATUS.STUB)
      && !canOfferRoute('portrait', 2) && canOfferRoute('portrait', 3)
      && !canOfferRoute('switchboard', 8)
      && choosableRoutes(2).find((r) => r.id === 'portrait')?.offered === false);
}

{
  const living = ['p1', 'p2', 'p3', 'p4'];
  const available = availableRoutes(4);
  const refused = canRouteVote('p1', 'portrait', ['p9'], available);
  const stub = canRouteVote('p1', 'switchboard', living, available);
  const ok = canRouteVote('p1', 'portrait', living, available);
  t('J16 · invalid route for crew / stub is rejected; a living pick is accepted',
    refused.ok === false && stub.ok === false && ok.ok === true);
}

{
  const living = ['a', 'b', 'c', 'd'];
  const available = availableRoutes(4);
  const tie = tallyRouteVotes({
    living,
    votes: { a: 'portrait', b: 'lights', c: 'portrait', d: 'lights' },
    available,
  });
  const win = tallyRouteVotes({
    living,
    votes: { a: 'portrait', b: 'portrait', c: 'portrait', d: 'lights' },
    available,
  });
  const empty = tallyRouteVotes({ living, votes: {}, available });
  t('J17 · more votes wins; tie and empty box lock Lights / hall',
    win.selected === 'portrait' && !win.tied
      && tie.selected === TIE_ROUTE && tie.tied
      && empty.selected === 'lights'
      && TIE_ROUTE === 'lights');
}

{
  const living = ['a', 'b', 'c'];
  let claims = {};
  const first = canClaimStation('portrait', 'pull-a', claims, 'a');
  claims = applyStationClaim(claims, 'a', 'pull-a');
  const dup = canClaimStation('portrait', 'pull-a', claims, 'b');
  const cross = canClaimStation('portrait', 'cross', claims, 'b');
  claims = applyStationClaim(claims, 'b', 'cross');
  claims = applyStationClaim(claims, 'c', 'cross');
  const c1 = confirmStationClaim(claims, 'a');
  const c2 = confirmStationClaim(c1.claims, 'b');
  const c3 = confirmStationClaim(c2.claims, 'c');
  t('J18 · Portrait capacities: one pull-a, one pull-b, remaining cross; confirm before lock',
    first.ok && !dup.ok && cross.ok
      && ROUTE_CAPS.portrait['pull-a'] === 1 && ROUTE_CAPS.portrait['pull-b'] === 1
      && !crewReady(living, c2.claims) && crewReady(living, c3.claims)
      && !('heat' in (ROUTE_CAPS.lights || {})));
}

{
  const living = ['p1', 'p2', 'p3'];
  const room = createRoom({ count: 3, castSeed: 1, worldSeed: 1, send: () => {} });
  room.start();
  const opened = room.openRouteVote(living);
  const v1 = room.castRouteVote('p1', 'portrait', living);
  const v2 = room.castRouteVote('p2', 'portrait', living);
  const v3 = room.castRouteVote('p3', 'lights', living);
  const pubOpen = projectRoute({ ...freshRoute(), step: 'vote', votes: { p1: 'portrait' } }, living);
  const locked = room.state.route.selected;
  const claimed = room.claimStation('p1', 'pull-a', living);
  room.claimStation('p2', 'pull-b', living);
  room.claimStation('p3', 'cross', living);
  room.confirmStation('p1', living);
  room.confirmStation('p2', living);
  const early = room.lockCrew(living);
  room.confirmStation('p3', living);
  const crew = room.lockCrew(living);
  const spec = missionForSelected(room.state.selectedJob, 1, { menuUsed: true });
  t('J19 · room vote stays private until close; lock stamps the job; crew needs every confirm',
    opened.ok && v1.ok && v2.ok && v3.auto
      && locked === 'portrait'
      && pubOpen.selected == null && Object.keys(pubOpen.tally).length === 0
      && !('votes' in pubOpen)
      && claimed.ok && !early.ok && crew.ok
      && spec.selectedJob === 'portrait' && spec.catalogId === 'portrait'
      && spec.job === 'portrait' && spec.job !== JOB.SMASH
      && missionFor(1) === MISSION_PAINTING
      && heldBrief('portrait') == null
      && crew.play?.kind === 'portrait' && crew.play?.smash === false);
}

{
  const room = createRoom({ count: 8, castSeed: 1, worldSeed: 1, send: () => {} });
  room.start();
  room.openRouteVote();
  const living = room.state.players.filter((p) => p.alive).map((p) => p.id);
  for (const id of living) room.castRouteVote(id, 'lights', living);
  const before = room.state.cameras.unlocked;
  room.playEpisode({ scaffold: false });
  t('J20 · a locked Lights job launches heat, not smash/drill',
    room.state.selectedJob === 'lights'
      && room.state.mission?.selectedJob === 'lights'
      && room.state.mission?.job === 'lights'
      && room.state.mission?.job !== JOB.SMASH
      && missionFor(1) === MISSION_PAINTING
      && room.state.cameras.unlocked === before
      && room.state.heatArmed
      && !!room.state.lights
      && !room.state.portraitArmed);
}

{
  const living = ['a', 'b'];
  const r = projectRoute({
    step: 'vote',
    votes: { a: 'portrait', b: 'lights' },
    claims: {},
  }, living);
  const menu = routeMenuHtml(r);
  const pad = routePadHtml(r, 'lights');
  const stations = stationPadHtml({ selected: 'portrait' }, { station: 'pull-a' });
  const chrome = menu + pad + stations;
  t('J21 · chrome has no KEEP/EXPEL, no heat, no private ballots; pad omits shut Portrait at 2',
    !/KEEP\/EXPEL|\bEXPEL\b|private-heat|privateHeat/.test(chrome)
      && !/portrait/.test(pad)
      && /Lights/.test(pad)
      && /data-route-menu/.test(menu)
      && !/Held/.test(stations)
      && heldBrief('portrait') == null
      && heldBrief('lights') == null
      && !menu.includes('a:portrait') && !menu.includes('votes'));
}

{
  const win = src('../src/party/win.js');
  const follow = src('../src/party/follow.js');
  const guidemap = src('../src/party/guidemap.js');
  const jobs = src('../src/party/jobs.js');
  const host = src('../src/views/party-host.js');
  t('J22 · win.js / follow.js / guidemap.js untouched; route menu has no KEEP/EXPEL',
    !/selectedJob|ROUTE_CATALOG|routeVote|private-heat/.test(win)
      && !/ROUTE_CATALOG|routeVote|selectedJob/.test(follow)
      && !/ROUTE_CATALOG|routeVote/.test(guidemap)
      && !/KEEP\/EXPEL|\bEXPEL\b/.test(jobs)
      && /route-open/.test(host)
      && /Open route vote/.test(host));
}

/* =================================================================================================
 * J23+ · PRIVATE-HEAT — hold / trip / reserve / privacy. Guide/runner still launches.
 * ============================================================================================== */

{
  const held = tickSeat({ heat: 0, generating: true, tripUntil: 0 }, { dt: 1, nowMs: 1000 });
  const cool = tickSeat({ heat: 0.4, generating: false, tripUntil: 0 }, { dt: 1, nowMs: 2000 });
  t('J23 · HOLD raises heat and contributes; RELEASE cools and drops output',
    held.heat > 0 && held.heat === HEAT_RISE && held.output === 1
      && cool.heat < 0.4 && cool.output === 0);
}

{
  const frames = {};
  const room = createRoom({ count: 4, castSeed: 1, worldSeed: 1, send: (id, f) => { frames[id] = f; } });
  room.start();
  const living = room.state.players.filter((p) => p.alive).map((p) => p.id);
  const armed = room.armLightsHeat({ living, nowMs: 0 });
  room.setGenerate(living[0], true, 0);
  room.tickHeat(1000, 1);
  const own = frames['phone-0'];
  const peer = frames['phone-1'];
  const tv = frames.tv;
  const tvBlob = JSON.stringify(tv);
  t('J23b · phone has own heat; host/peer snapshots never carry another seat\'s heat',
    armed.ok && lightsArmedFor('lights')
      && own?.you?.id === living[0] && own.you.heat > 0 && own.you.tripLeft === 0
      && peer?.you?.id === living[1] && peer.you.heat === 0
      && peer.you.heat !== own.you.heat
      && !tvBlob.includes('"heat"') && !tvBlob.includes('tripLeft')
      && !('heat' in (tv || {})) && !('you' in (tv || {}))
      && tv?.lights?.power === 1
      && lightsLeaks(tv.lights).length === 0
      && !room.unrowed().some((p) => p.startsWith('you.heat') || p.startsWith('you.tripLeft') || p.startsWith('lights')),
    JSON.stringify({
      own: own?.you && { id: own.you.id, heat: own.you.heat },
      peer: peer?.you && { id: peer.you.id, heat: peer.you.heat },
      tvPower: tv?.lights?.power,
    }));
}

{
  let seat = { heat: 0, generating: true, tripUntil: 0 };
  let now = 0;
  let snapped = null;
  for (let i = 0; i < 12; i++) {
    now += 1000;
    seat = tickSeat(seat, { dt: 1, nowMs: now });
    if (!snapped && tripLeft(seat, now) > 0) snapped = { left: tripLeft(seat, now), output: seat.output, now };
  }
  const forced = setGenerating(seat, true, snapped.now);
  const still = tickSeat(seat, { dt: 1, nowMs: snapped.now + 1000 });
  const done = tickSeat(seat, { dt: 4.5, nowMs: snapped.now + HEAT_TRIP_MS });
  t('J24 · heat >= 1 forces a ~4.5s trip; no output until it ends',
    snapped && snapped.left === HEAT_TRIP_MS && snapped.output === 0
      && HEAT_TRIP_MS === 4500
      && forced.generating === false && forced.output === 0
      && still.output === 0 && tripLeft(still, snapped.now + 1000) > 0
      && tripLeft(done, snapped.now + HEAT_TRIP_MS) === 0);
}

{
  const frames = {};
  const room = createRoom({ count: 4, castSeed: 2, worldSeed: 2, send: (id, f) => { frames[id] = f; } });
  room.start();
  const living = room.state.players.filter((p) => p.alive).map((p) => p.id);
  room.armLightsHeat({ living, nowMs: 0 });
  for (const id of living) room.setGenerate(id, true, 0);
  room.tickHeat(500, 0.5);
  const before = frames.tv.lights;
  room.setGenerate(living[0], false, 500);
  room.setGenerate(living[1], false, 500);
  room.tickHeat(1500, 1);
  const after = frames.tv.lights;
  t('J25 · simultaneous multi-release drops power below sufficiency; hunter may advance',
    before.power === 4 && before.needed === neededOutput(4) && before.floodlit
      && after.power === 2 && after.power < after.needed
      && after.floodlit === false
      && after.hunterPressure > before.hunterPressure
      && after.reserve < before.reserve);
}

{
  const frames = {};
  const room = createRoom({ count: 4, castSeed: 3, worldSeed: 3, send: (id, f) => { frames[id] = f; } });
  room.start();
  const living = room.state.players.filter((p) => p.alive).map((p) => p.id);
  room.armLightsHeat({ living, nowMs: 0 });
  room.startLightsPlay();
  const early = room.crossGate(living[0]);
  let now = 0;
  for (let i = 0; i < 16; i++) {
    const cooler = living[i % 4];
    for (const id of living) room.setGenerate(id, id !== cooler, now);
    now += 1000;
    room.tickHeat(now, 1);
  }
  const board = frames.tv.lights;
  const crossed = room.crossGate(living[0]);
  const stay = room.setGenerate(living[1], true, now);
  t('J26 · reserve fills, gate opens, a seat may cross; no mandatory sacrifice',
    early.ok === false && early.why === 'gate shut'
      && board.gateOpen && board.reserve >= 1 && board.floodlit
      && crossed.ok && crossed.crossed
      && stay.ok && stay.generating
      && frames.tv.lights.gateOpen);
}

{
  const pad = generatePadHtml({ heat: 0.4, tripLeft: 0 }, { gateOpen: false });
  const trip = generatePadHtml({ heat: 1, tripLeft: 4500 }, { gateOpen: false });
  const board = lightsBoardHtml({
    stations: [{ id: 'p1', output: 1 }, { id: 'p2', output: 0 }],
    power: 1, needed: 1, reserve: 0.5, gateOpen: false, floodlit: true, hunterPressure: 0.2,
  });
  const phone = src('../src/views/party-phone.js');
  const host = src('../src/views/party-host.js');
  t('J27 · phone has private dial + HOLD; TV has output/reserve/gate/floodlit only',
    /HOLD TO GENERATE/.test(pad) && /data-heat-dial/.test(pad) && !/sabotage/i.test(pad)
      && /Generator tripped — cooling…/.test(trip)
      && /data-lights-board/.test(board) && /Reserve/.test(board) && /Floodlights/.test(board)
      && !/heat/i.test(board)
      && /generatePadHtml/.test(phone) && /t: 'generate'/.test(phone)
      && /lightsBoardHtml/.test(host)
      && lightsLeaks({ heat: 0.9, tripLeft: 12 }).length === 2
      && lightsLeaks(projectLights({
        stations: [{ id: 'p1', output: 1, heat: 0.9 }],
        power: 1, needed: 1, reserve: 0, gateOpen: false, floodlit: true, hunterPressure: 0,
      })).length === 0);
}

{
  const win = src('../src/party/win.js');
  const follow = src('../src/party/follow.js');
  const guidemap = src('../src/party/guidemap.js');
  const heat = src('../src/party/heat.js');
  const entitle = src('../net/party/entitle.js');
  t('J28 · negatives: no win.js writes; follow/guidemap unchanged; heat never public',
    !/armLightsHeat|tickHeat|you\.heat|private-heat/.test(win)
      && !/armLightsHeat|tickHeat|HEAT_TRIP/.test(follow)
      && !/armLightsHeat|tickHeat|HEAT_TRIP/.test(guidemap)
      && /you\.heat/.test(entitle) && /'self'/.test(entitle)
      && /HOLD TO GENERATE/.test(heat)
      && !/KEEP\/EXPEL|\bEXPEL\b/.test(heat));
}

/* =================================================================================================
 * J29+ · JOB-DISPATCHED PLAY — Portrait stations, Lights heat, no smash fallthrough.
 * ============================================================================================== */

{
  let board = freshPortraitBoard();
  const a = freshPortraitSeat('pull-a');
  const b = freshPortraitSeat('pull-b');
  const p1 = pulsePull(board, a, { nowMs: 100, playerId: 'a' });
  const same = pulsePull(p1.board, a, { nowMs: 200, playerId: 'a' });
  const p2 = pulsePull(freshPortraitBoard(), a, { nowMs: 100, playerId: 'a' });
  const stroke = pulsePull(p2.board, b, { nowMs: 400, playerId: 'b' });
  t('J29 · alternating pulls raise the drum; same-side twice slips',
    p1.ok && !p1.stroke && same.ok && same.board.lift < p1.board.lift + STROKE_LIFT
      && same.board.hunterPressure > 0
      && stroke.ok && stroke.stroke && stroke.board.lift === STROKE_LIFT
      && RHYTHM_MS === 900);
}

{
  const frames = {};
  const room = createRoom({ count: 3, castSeed: 4, worldSeed: 4, send: (id, f) => { frames[id] = f; } });
  room.start();
  const living = room.state.players.filter((p) => p.alive).map((p) => p.id);
  room.openRouteVote(living);
  for (const id of living) room.castRouteVote(id, 'portrait', living);
  room.claimStation(living[0], 'pull-a', living);
  room.claimStation(living[1], 'pull-b', living);
  room.claimStation(living[2], 'cross', living);
  for (const id of living) room.confirmStation(id, living);
  const crew = room.lockCrew(living);
  room.pulsePortraitPull(living[0], 100);
  room.pulsePortraitPull(living[1], 400);
  let now = 400;
  for (let i = 0; i < 8; i++) {
    now += 1000;
    room.pulsePortraitPull(living[i % 2], now);
    room.pulsePortraitPull(living[(i + 1) % 2], now + 300);
    if (i === 2) room.setPortraitCrawl(living[2], true);
    room.tickPortraitPlay(now + 300, 1);
  }
  room.setPortraitCrawl(living[2], true);
  room.tickPortraitPlay(now + 2000, 3);
  const earlyCatch = room.catchPortraitLock(living[2]);
  const pub = frames.tv.portrait;
  const own = frames['phone-2'];
  const peer = frames['phone-0'];
  const tvBlob = JSON.stringify(frames.tv);
  t('J29b · lockCrew launches Portrait stations, not smash; catch+cross is the escape',
    crew.play?.kind === 'portrait' && crew.play?.smash === false
      && room.state.portraitArmed && room.state.mission?.job === PORTRAIT_JOB
      && room.state.mission?.job !== JOB.SMASH
      && !room.state.heatArmed
      && pub && portraitLeaks(pub).length === 0
      && !tvBlob.includes('"lastPull"') && !tvBlob.includes('"crawl"')
      && own?.you?.crossed === true
      && peer?.you?.crossed !== true
      && (earlyCatch.ok === true || room.state.portrait.crosses >= 1)
      && CRAWL_NEED === 0.55 && CRAWL_RATE === 0.4,
    JSON.stringify({
      lift: pub?.lift, crosses: pub?.crosses, catch: pub?.catchLocked,
      crossed: own?.you?.crossed, early: earlyCatch,
    }));
}

{
  const room = createRoom({ count: 8, castSeed: 5, worldSeed: 5, send: () => {} });
  room.start();
  room.openRouteVote();
  const living = room.state.players.filter((p) => p.alive).map((p) => p.id);
  for (const id of living) room.castRouteVote(id, 'portrait', living);
  const before = room.state.cameras.unlocked;
  room.playEpisode({ scaffold: true });
  room.setWorld({ mission: { phase: 'return', room: 'gallery', job: JOB.SMASH } });
  t('J29c · playEpisode with Portrait does not smash-scaffold a camera_lit',
    room.state.mission?.job === 'portrait'
      && room.state.portraitArmed
      && room.state.cameras.unlocked === before
      && !room.log.all().some((e) => e.type === 'run.camera_lit'));
}

{
  const room = createRoom({ count: 3, castSeed: 6, worldSeed: 6, send: () => {} });
  room.start();
  const living = room.state.players.filter((p) => p.alive).map((p) => p.id);
  room.openRouteVote(living);
  room.closeRouteVote(living);
  room.state.selectedJob = null;
  room.state.route.selected = null;
  const spec = missionForSelected(null, 1, { menuUsed: true });
  const launched = room.launchSelectedPlay({ living });
  t('J30 · missing selectedJob after the menu is a fault, never silent smash',
    spec.missing === true && spec.why === 'no selectedJob' && spec.job !== JOB.SMASH
      && launched.ok === false && launched.why === 'no selectedJob' && launched.smash === false
      && MISSION_MISSING.missing === true);
}

{
  let board = freshPortraitBoard();
  board.lift = 0.8;
  board.crosses = 1;
  const seat = { ...freshPortraitSeat('cross'), crossed: true };
  const locked = catchPortrait(seat, board);
  t('J30b · catch locked + ≥1 cross is Portrait success (LHL shape)',
    locked.ok && portraitSuccess(locked.board)
      && !portraitSuccess({ catchLocked: true, crosses: 0 })
      && !portraitSuccess({ catchLocked: false, crosses: 2 }));
}

{
  const pad = portraitPadHtml({ station: 'pull-a' }, { lift: 0.2 });
  const crawl = portraitPadHtml({ station: 'cross' }, { lift: 0.6 });
  const catchPad = portraitPadHtml({ station: 'cross', crossed: true }, { lift: 0.7, catchLocked: false });
  const board = galleryBoardHtml({
    lift: 0.5, noise: 0.2, hunterPressure: 0.1, catchLocked: false, crosses: 0,
    stations: [{ id: 'p1', busy: true }],
  });
  const phone = src('../src/views/party-phone.js');
  const host = src('../src/views/party-host.js');
  t('J31 · phones are station controllers; TV is gallery spectacle; no Guide E / Runner D / HELD',
    /data-portrait-pull/.test(pad) && /HOLD TO CRAWL/.test(crawl) && /CATCH AND LOCK/.test(catchPad)
      && /data-gallery-board/.test(board) && /Hunter/.test(board) && !/god-map|floorplan|pin/i.test(board)
      && /paintPortraitStation/.test(phone) && /t: 'portraitPull'/.test(phone)
      && /galleryBoardHtml/.test(host)
      && !/HELD_BRIEF/.test(host)
      && !/route-held/.test(pad)
      && portraitLeaks({ lastPull: { station: 'pull-a', at: 1 }, crawl: 0.2 }).length >= 1
      && portraitLeaks(projectPortrait({ lift: 0.5, lastPull: { station: 'pull-a', at: 1 } })).length === 0);
}

{
  const win = src('../src/party/win.js');
  const follow = src('../src/party/follow.js');
  const guidemap = src('../src/party/guidemap.js');
  const phone = src('../src/views/party-phone.js');
  const host = src('../src/views/party-host.js');
  const roomSrc = src('../src/party/room.js');
  t('J32 · negatives: no win.js / sticky / smash dispatch for implemented jobs',
    !/armPortraitPlay|pulsePortraitPull|galleryBoardHtml|selectedJob/.test(win)
      && !/armPortraitPlay|pulsePortraitPull/.test(follow)
      && !/armPortraitPlay|pulsePortraitPull/.test(guidemap)
      && !/notesPresented/.test(roomSrc)
      && /launchSelectedPlay/.test(roomSrc)
      && /skipSmashPlay/.test(roomSrc)
      && /paintPortraitStation/.test(phone)
      && /catalogPlay/.test(phone)
      && !/Held — guide\/runner until replacement/.test(host)
      && missionForSelected('portrait', 1).job !== JOB.SMASH
      && missionForSelected('lights', 1).job !== JOB.DRILL
      && missionForSelected('switchboard', 1, { menuUsed: true }).missing === true);
}

console.log(`\nexpedition-jobs: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
