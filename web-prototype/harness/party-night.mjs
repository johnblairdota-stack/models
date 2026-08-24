#!/usr/bin/env node
/**
 * party-night — the sit-down path: TV + two phones, lobby, casting, stub expedition, recap.
 *
 *   node harness/party-night.mjs
 *
 * Does not replace party-sockets. That gate still proves the filter over nine connections.
 * This one proves a reviewer can open a host, two phones, see the lobby, and advance.
 */

import { startServer, fanoutViolations, lobbySnapshot, progressShow, expireShowHold, applyNominate } from '../net/party/local.mjs';
import { recapFromEvents } from '../src/party/recap.js';
import { qrMatrix } from '../src/party/qr.js';
import {
  tokenKey, STUB_SHOW_PLAN, AFTER_RUN_BEATS, nextShowBeat, holdMsFor,
  RECAP_HOLD_MS, DEBRIEF_HOLD_MS, RECKONING_HOLD_MS, VOTE_HOLD_MS, EXECUTION_HOLD_MS,
  LATE_DEBRIEF_MS, EMPTY_RECKONING_EXTEND_CAP,
  remainingMs, formatRemain, normalizeCodeDisplay, normalizeCodeWire,
} from '../src/party/night-client.js';
import { PHASE, SECONDS } from '../src/party/phases.js';
import { missionFor, MISSION_PAINTING, MISSION_TABLE } from '../src/party/mission.js';
import { RUN_END } from '../src/party/show.js';
import { ACCENTS, SHELLS, cleanLook } from '../src/party/look.js';
import { applyCastLock, applyCastTap, ballotFromCast, castPrompt, freshCast, mergePublicNames, nominationPlayers } from '../src/party/cast-ui.js';
import { createRoom } from '../src/party/room.js';
import { NO_ONE } from '../src/party/vote.js';

const PORT = 5198;
let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function open(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const msgs = [];
    const box = { ws, msgs, welcome: null, send: (o) => ws.send(JSON.stringify(o)), close: () => ws.close() };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      msgs.push(m);
      if (m.t === 'welcome' || m.t === 'full') { box.welcome = m; resolve(box); }
    };
    ws.onerror = () => reject(new Error('socket error'));
    setTimeout(() => resolve(box), 1500);
  });
}

function last(box, type) {
  return [...box.msgs].reverse().find((m) => m.t === type);
}

{
  const recap = recapFromEvents([
    { type: 'cast.pair', data: { runner: 'p1', guide: 'p2' } },
    { type: 'run.camera_lit', data: { camera: 2, episode: 1 } },
    { type: 'panel.alarm', data: { kind: 'panel' } },
    { type: 'panel.alarm', data: { kind: 'panel' } },
  ]);
  t('N0 · recap card reads camera / taken / alarms from the vis log',
    recap.cameraLit === true && recap.taken.length === 0 && recap.alarmCount === 2 && recap.runner === 'p1',
    JSON.stringify(recap));
  const dark = recapFromEvents([{ type: 'player.taken', data: { id: 'p1', seat: 0 } }]);
  t('N0b · a take without a lit camera is STAYED DARK + TAKEN',
    dark.cameraLit === false && dark.taken[0].id === 'p1');
}

{
  const { modules, size } = qrMatrix('http://localhost:5178/?view=party.phone&room=test');
  const finder = (ox, oy) => modules[oy][ox] === 1 && modules[oy + 6][ox + 6] === 1 && modules[oy + 3][ox + 3] === 1;
  t('N1 · QR encodes a join URL with three finder patterns',
    size >= 21 && finder(0, 0) && finder(size - 7, 0) && finder(0, size - 7),
    `v size ${size}`);
}

const srv = startServer({ port: PORT, count: 8, castSeed: 21, worldSeed: 3, code: 'night' });
await sleep(120);
const base = `ws://localhost:${PORT}/?room=night`;

t('N1a · join code field uppercases, strips spaces, keeps the no-ilo01 alphabet',
  normalizeCodeDisplay(' ab 1ilo xy') === 'ABXY'
    && normalizeCodeDisplay('test') === 'TEST'
    && normalizeCodeWire(' t e s t ') === 'test'
    && !/[ILO01]/i.test(normalizeCodeDisplay('hello 10')));

{
  t('N1a2 · runner prompt uses first / real episode number',
    castPrompt('runner', 1) === 'You are picking a runner for the first expedition.'
      && castPrompt('runner', 3) === 'You are picking a runner for expedition 3.'
      && castPrompt('guide', 1) === 'Now pick a guide for this expedition.');
  let cast = freshCast();
  const tapped = applyCastTap(cast, 'p1');
  t('N1a3 · tapping a name highlights and does not complete a ballot',
    tapped.draft === 'p1' && tapped.phase === 'runner' && ballotFromCast(tapped, 'me') === null);
  cast = applyCastLock(tapped);
  t('N1a4 · padlock lock-in moves to the guide step; still no wire ballot',
    cast.phase === 'guide' && cast.runner === 'p1' && cast.draft == null && ballotFromCast(cast, 'me') === null);
  t('N1a5 · the locked runner cannot be picked as guide',
    applyCastTap(cast, 'p1').draft == null && applyCastTap(cast, 'p1').phase === 'guide');
  cast = applyCastLock(applyCastTap(cast, 'p2'));
  t('N1a6 · locking the guide produces today\'s {voter, runner, guide}',
    JSON.stringify(ballotFromCast(cast, 'me')) === JSON.stringify({ voter: 'me', runner: 'p1', guide: 'p2' }));
  const lobby = {
    seats: [
      { id: 'tv', playerId: null, isTV: true, name: 'TV', joined: true, connected: true },
      { id: 'phone-0', playerId: 'p1', isTV: false, name: 'Ellie', joined: true, connected: true },
      { id: 'phone-1', playerId: 'p2', isTV: false, name: 'Ada', joined: true, connected: false },
      { id: 'phone-6', playerId: 'p7', isTV: false, name: 'Robot 7', joined: false, connected: false },
    ],
  };
  const framePlayers = [
    { id: 'p1', name: 'Robot 1', alive: true },
    { id: 'p2', name: 'Ada', alive: true },
    { id: 'p7', name: 'Robot 7', alive: true },
  ];
  const noms = nominationPlayers(framePlayers, lobby);
  t('N1a7 · nomination list is joined humans, never an empty Robot N chair',
    noms.map((p) => p.id).join(',') === 'p1,p2' && !noms.some((p) => p.id === 'p7'));
  t('N1a8 · a lobby name wins over a leftover Robot N on the state frame',
    mergePublicNames(framePlayers, lobby).find((p) => p.id === 'p1')?.name === 'Ellie');
}

t('N1b · host and phone tokens are namespaced apart',
  tokenKey('test', 'tv') !== tokenKey('test', 'phone')
    && tokenKey('test', 'tv').endsWith('.tv.token')
    && tokenKey('test', 'phone').endsWith('.phone.token'));
t('N1c · stub show plan walks recap → debrief → reckoning → vote → execution → casting after the run',
  STUB_SHOW_PLAN.map((s) => s.beat).join(',') === 'expedition,recap,debrief,reckoning,vote,execution,casting');
t('N1c2 · expedition is immediate — the TV does not wait on Watch the run',
  (STUB_SHOW_PLAN.find((s) => s.beat === 'expedition')?.ms ?? 1) === 0);
t('N1c3 · recap hold is 20s and debrief hold is 75s — the shooting schedule, not a new table',
  RECAP_HOLD_MS === SECONDS[PHASE.RECAP] * 1000 && RECAP_HOLD_MS === 20000
    && DEBRIEF_HOLD_MS === SECONDS[PHASE.DEBRIEF] * 1000 && DEBRIEF_HOLD_MS === 75000
    && holdMsFor('recap') === RECAP_HOLD_MS && holdMsFor('debrief') === DEBRIEF_HOLD_MS);
t('N1c4 · after a finished run the clock is Recap → Debrief → Reckoning → Vote → Execution → Casting',
  AFTER_RUN_BEATS.join(',') === 'recap,debrief,reckoning,vote,execution,casting'
    && nextShowBeat('recap') === 'debrief' && nextShowBeat('debrief') === 'reckoning'
    && nextShowBeat('reckoning') === 'vote' && nextShowBeat('vote') === 'execution'
    && nextShowBeat('execution') === 'casting' && nextShowBeat('expedition') == null
    && holdMsFor('reckoning', 0) === RECKONING_HOLD_MS && holdMsFor('vote') === VOTE_HOLD_MS
    && holdMsFor('execution') === EXECUTION_HOLD_MS
    && formatRemain(0) === '0s' && formatRemain(65000) === '1:05'
    && remainingMs(1000, 1000) === 0
    && remainingMs(null) === null && remainingMs('') === null);
t('N1c5 · episode 1 is the gallery painting; episode 2+ is the chapel table',
  missionFor(1) === MISSION_PAINTING && missionFor(2) === MISSION_TABLE
    && missionFor(3).target === 'table-round' && MISSION_TABLE.catalogId === 'table-round'
    && missionFor(undefined) === MISSION_PAINTING);

{
  const r = createRoom({ count: 4, castSeed: 1, worldSeed: 1, send: () => {}, emit: () => {} });
  r.start();
  r.playEpisode();
  const playPhases = r.log.all().filter((e) => e.type.startsWith('phase.')).map((e) => e.type.slice(6));
  t('N18 · playEpisode premiere skip is intact — gates that only call it stay green',
    !playPhases.includes('RECKONING') && playPhases.includes('VERDICT'));
  r.enterReckoning();
  const living = r.episodeLiving();
  const nom = r.nominatePlayer(living[0], living[1], living);
  t('N18b · live nominate API is vote.js (once, living, no self)',
    nom.ok && r.state.nominations.length === 1
      && !r.nominatePlayer(living[0], living[2], living).ok
      && !r.nominatePlayer(living[1], living[1], living).ok);
  r.enterVote(living);
  t('N18c0 · the nominator of standing X is already locked to X',
    r.state.lynchVotes[living[0]] === living[1]
    && r.castLynchVote(living[0], NO_ONE, living).ok === false
    && r.castLynchVote(living[0], NO_ONE, living).why === 'nominator vote locked'
    && r.state.lynchVotes[living[0]] === living[1],
    JSON.stringify(r.state.lynchVotes));
  const selfVote = r.castLynchVote(living[1], living[1], living);
  t('N18c · a nominated player cannot vote for themselves — coerce to NO_ONE',
    selfVote.choice === NO_ONE && selfVote.why === 'no self-vote'
      && r.state.lynchVotes[living[1]] === NO_ONE,
    JSON.stringify(selfVote));
  const otherVote = r.castLynchVote(living[0], living[1], living);
  t('N18d · another living player can still vote the nominee',
    otherVote.ok && otherVote.choice === living[1]
      && r.state.lynchVotes[living[0]] === living[1],
    JSON.stringify(otherVote));
}

const host = await open(`${base}&host=1`);
t('N2 · host=1 is the TV spectator, not a robot',
  host.welcome?.t === 'welcome' && host.welcome.id === 'tv' && host.welcome.isTV === true,
  JSON.stringify({ id: host.welcome?.id, isTV: host.welcome?.isTV }));

const a = await open(base);
const b = await open(base);
await sleep(80);

t('N3 · two phones claim robot seats',
  a.welcome?.t === 'welcome' && b.welcome?.t === 'welcome'
    && a.welcome.id !== 'tv' && b.welcome.id !== 'tv' && a.welcome.id !== b.welcome.id,
  `${a.welcome?.id} + ${b.welcome?.id}`);

const lobby = last(host, 'lobby');
const live = (lobby?.seats || []).filter((s) => !s.isTV && s.connected);
t('N4 · TV lobby lists both phones as live',
  live.length >= 2 && live.some((s) => s.id === a.welcome.id) && live.some((s) => s.id === b.welcome.id),
  live.map((s) => s.id).join(','));

t('N4b · lobby rows do not carry a role or alignment',
  (lobby?.seats || []).every((s) => s.role == null && s.alignment == null));

{
  const side = host.msgs.filter((m) => m.t === 'lobby' || m.t === 'ballots' || m.t === 'show');
  const dirty = side.flatMap((m) => fanoutViolations(m));
  t('N4c · every lobby/ballots/show payload stays inside the closed fanout schema',
    dirty.length === 0, dirty.join(',') || `${side.length} side-channel messages`);
  const snap = lobbySnapshot(srv.rooms.get('night'));
  const leaked = { ...snap, seats: snap.seats.map((s) => ({ ...s, role: 'producer' })) };
  t('N4d control · a role field on a lobby seat is a fanout violation',
    fanoutViolations(leaked).some((v) => v.includes('role')));
  const withLook = { ...snap, seats: snap.seats.map((s) => ({ ...s, shell: SHELLS[0], accent: ACCENTS[0] })) };
  t('N4e · shell/accent on a lobby seat stays inside the closed schema',
    fanoutViolations(withLook).length === 0);
  const hunter = { ...snap, seats: snap.seats.map((s) => ({ ...s, hunter: true })) };
  const deal = { ...snap, seats: snap.seats.map((s) => ({ ...s, deal: { role: 'producer' } })) };
  t('N4f control · hunter/deal on a lobby seat is a fanout violation',
    fanoutViolations(hunter).some((v) => v.includes('hunter'))
      && fanoutViolations(deal).some((v) => v.includes('deal')));
}

a.send({ t: 'name', name: 'Ada' });
b.send({ t: 'name', name: 'Bea' });
await sleep(60);
const named = last(host, 'lobby');
t('N5 · phones can set a published name',
  (named?.seats || []).some((s) => s.name === 'Ada') && (named?.seats || []).some((s) => s.name === 'Bea'));
t('N5e · setName updates players[].name on the state frame too',
  (last(host, 'state')?.frame?.players || []).some((p) => p.name === 'Ada')
    && (last(host, 'state')?.frame?.players || []).some((p) => p.name === 'Bea'));

a.send({ t: 'look', shell: SHELLS[2], accent: ACCENTS[0] });
await sleep(60);
const looked = last(host, 'lobby');
const adaSeat = (looked?.seats || []).find((s) => s.name === 'Ada');
t('N5b · locking a colour updates that seat on the TV lobby snapshot',
  adaSeat?.shell === SHELLS[2] && adaSeat?.accent === ACCENTS[0] && !!cleanLook(adaSeat),
  JSON.stringify({ shell: adaSeat?.shell, accent: adaSeat?.accent }));
t('N5c · the other phone seat is unchanged (no face required on phones)',
  (looked?.seats || []).some((s) => s.name === 'Bea' && s.shell == null && s.accent == null));
a.send({ t: 'look', shell: '#ff00ff', accent: 'producer' });
await sleep(40);
const rejected = last(host, 'lobby');
const adaAfter = (rejected?.seats || []).find((s) => s.name === 'Ada');
t('N5d · a look outside the closed palette is ignored',
  adaAfter?.shell === SHELLS[2] && adaAfter?.accent === ACCENTS[0]);

host.send({ t: 'start' });
host.send({ t: 'casting' });
await sleep(80);
t('N6 · host opens CASTING',
  last(host, 'state')?.frame?.phase === 'CASTING' || last(a, 'state')?.frame?.phase === 'CASTING',
  last(host, 'state')?.frame?.phase);

{
  const emptyId = (last(host, 'lobby')?.seats || []).find((s) => !s.isTV && !s.joined)?.playerId;
  a.send({ t: 'ballot', runner: emptyId, guide: b.welcome.playerId });
  await sleep(50);
  t('N6b · a ballot that names an empty chair is ignored',
    (last(host, 'ballots')?.votes || []).length === 0, emptyId);
  host.send({ t: 'episode', opts: {} });
  await sleep(80);
  const premature = last(host, 'state')?.frame?.pair;
  t('N6c · no human ballot means wait — do not elect Robot 7 from empty chairs',
    !premature?.runner && !premature?.guide,
    JSON.stringify(premature));
}

a.send({ t: 'ballot', runner: b.welcome.playerId, guide: a.welcome.playerId });
b.send({ t: 'ballot', runner: a.welcome.playerId, guide: b.welcome.playerId });
await sleep(80);
const ballots = last(host, 'ballots');
t('N7 · casting ballots are public and attributed',
  (ballots?.votes || []).length === 2
    && ballots.votes.every((v) => v.voter && v.runner && v.guide && v.runner !== v.guide),
  JSON.stringify(ballots?.votes));

host.send({ t: 'episode', opts: {} });
await sleep(220);

{
  const frame = last(host, 'state')?.frame;
  const nameOf = (id) => (frame?.players || []).find((p) => p.id === id)?.name;
  const runnerName = nameOf(frame?.pair?.runner);
  const guideName = nameOf(frame?.pair?.guide);
  t('N7e · locked pair is the seated humans by their public names, not Robot 7',
    ['Ada', 'Bea'].includes(runnerName) && ['Ada', 'Bea'].includes(guideName)
      && runnerName !== guideName
      && !/^Robot /.test(runnerName || '') && !/^Robot /.test(guideName || ''),
    JSON.stringify({ runner: runnerName, guide: guideName, pair: frame?.pair }));
  t('N7e2 · TV frame carries airingEpisode 1 after the first playEpisode',
    frame?.airingEpisode === 1,
    JSON.stringify({ airingEpisode: frame?.airingEpisode, episode: frame?.episode, phase: frame?.phase }));
  {
    const r = createRoom({ count: 8, castSeed: 9, worldSeed: 9, send: () => {}, emit: () => {} });
    r.start();
    const living = r.state.players.map((p) => p.id);
    r.dealRoles(living);
    r.playEpisode({
      living,
      ballots: living.map((v, i) => ({
        voter: v, runner: living[(i + 1) % living.length], guide: living[(i + 2) % living.length],
      })),
    });
    t('N7e3 · playEpisode leaves airingEpisode on the aired cast and bumps episode for the next',
      r.state.airingEpisode === 1 && r.state.episode === 2,
      JSON.stringify({ airingEpisode: r.state.airingEpisode, episode: r.state.episode }));
  }
}

{
  const r = createRoom({ count: 8, castSeed: 1, worldSeed: 1, send: () => {} });
  r.setName('p1', 'Ellie');
  r.playEpisode({ ballots: [], living: ['p1', 'p2'] });
  t('N7f · playEpisode with an empty ballot list does not invent a pair',
    r.state.pair.runner == null && r.state.pair.guide == null);
  r.playEpisode({ ballots: [{ voter: 'p1', runner: 'p1', guide: 'p2' }], living: ['p1', 'p2'] });
  t('N7g · a seated-human living pool cannot elect an unused deal slot',
    [r.state.pair.runner, r.state.pair.guide].sort().join(',') === 'p1,p2'
      && r.state.players.find((p) => p.id === 'p1')?.name === 'Ellie');
}

const hostEvs = host.msgs.filter((m) => m.t === 'event').map((m) => m.ev);
const aEvs = a.msgs.filter((m) => m.t === 'event').map((m) => m.ev);
const bEvs = b.msgs.filter((m) => m.t === 'event').map((m) => m.ev);

t('N8 · episode ran: casting pair + expedition + recap phase',
  hostEvs.some((e) => e.type === 'cast.pair')
    && hostEvs.some((e) => e.type === 'phase.EXPEDITION')
    && hostEvs.some((e) => e.type === 'phase.RECAP'),
  [...new Set(hostEvs.map((e) => e.type))].join(','));

const card = recapFromEvents(hostEvs);
const tvFrame = last(host, 'state')?.frame;
// Live night Send-them-in forces scaffold:false. The TV still builds a recap
// card (pair + episode from the vis log) — it must not invent CAMERAS/ALARMS
// before the mansion reports. N0 is the invent-stub recap parser; N9b/N9c are
// the playEpisode arms.
t('N9 · live Send-them-in vis log is honest zeros until the mansion reports',
  card.runner && card.guide && card.episode === 1
    && card.alarmCount === 0 && card.missCount === 0
    && card.cameraLit === false && card.camera === null && card.taken.length === 0
    && !hostEvs.some((e) => e.type === 'panel.alarm' || e.type === 'run.camera_lit' || e.type === 'task.miss')
    && tvFrame?.incident?.alarms === 0
    && tvFrame?.cameras?.unlocked === 1,
  JSON.stringify({ card, alarms: tvFrame?.incident?.alarms, unlocked: tvFrame?.cameras?.unlocked }));

{
  const stub = createRoom({ count: 8, castSeed: 1, worldSeed: 1, send: () => {} });
  stub.start();
  const unlocked = stub.state.cameras.unlocked;
  stub.playEpisode();
  const stubCard = recapFromEvents(stub.log.all());
  t('N9b · playEpisode default still scaffolds miss/alarm/camera_lit for gates',
    stub.state.incident.alarms === 2
      && stub.state.cameras.unlocked === unlocked + 1
      && stubCard.alarmCount >= 1 && stubCard.cameraLit === true && stubCard.missCount >= 1,
    JSON.stringify({ alarms: stub.state.incident.alarms, unlocked: stub.state.cameras.unlocked, stubCard }));

  const raw = createRoom({ count: 8, castSeed: 1, worldSeed: 1, send: () => {} });
  raw.start();
  const rawUnlocked = raw.state.cameras.unlocked;
  raw.playEpisode({ scaffold: false });
  const rawCard = recapFromEvents(raw.log.all());
  t('N9c · playEpisode({ scaffold: false }) does not invent alarms or cameras',
    raw.state.incident.alarms === 0
      && raw.state.cameras.unlocked === rawUnlocked
      && rawCard.alarmCount === 0 && rawCard.cameraLit === false && rawCard.missCount === 0,
    JSON.stringify({ alarms: raw.state.incident.alarms, unlocked: raw.state.cameras.unlocked, rawCard }));
}

t('N10 · TV never received a role card or a flyover',
  !hostEvs.some((e) => e.type === 'role.card')
    && host.msgs.filter((m) => m.t === 'state').every((m) => m.frame?.flyover == null));

{
  const tvStates = host.msgs.filter((m) => m.t === 'state').map((m) => m.frame);
  const claimOnTv = tvStates.some((f) => (f.players || []).some((p) => p.claim != null));
  const claimEv = hostEvs.some((e) => e.type === 'player.claim_set');
  t('N10b · TV never received covers as claims (frame or claim_set)',
    !claimOnTv && !claimEv,
    `frames-with-claim=${claimOnTv} claim_set=${claimEv}`);
}

t('N10c · episode does not pin the show beat back to casting',
  host.msgs.filter((m) => m.t === 'show' && m.beat === 'casting').length <= 1);
t('N10d · playEpisode fans expedition to every socket, including the TV',
  last(host, 'show')?.beat === 'expedition'
    && last(a, 'show')?.beat === 'expedition'
    && last(b, 'show')?.beat === 'expedition'
    && srv.rooms.get('night')?.show === 'expedition',
  `host=${last(host, 'show')?.beat} a=${last(a, 'show')?.beat} room=${srv.rooms.get('night')?.show}`);

const aCards = aEvs.filter((e) => e.type === 'role.card');
const bCards = bEvs.filter((e) => e.type === 'role.card');
t('N11 · each phone got only its own role card',
  aCards.every((e) => e.for === a.welcome.playerId)
    && bCards.every((e) => e.for === b.welcome.playerId)
    && !aEvs.some((e) => e.type === 'role.card' && e.for === b.welcome.playerId)
    && !bEvs.some((e) => e.type === 'role.card' && e.for === a.welcome.playerId),
  `a=${aCards.length} b=${bCards.length}`);

t('N12 · no SEALED event on any of the three sockets',
  ![...hostEvs, ...aEvs, ...bEvs].some((e) => e.vis === 'SEALED'));

const tok = a.welcome.token;
a.close();
await sleep(100);
const back = await open(`${base}&token=${tok}`);
await sleep(80);
t('N13 · a dropped phone reconnects to the same seat by token',
  back.welcome?.resumed === true && back.welcome?.id === a.welcome.id,
  JSON.stringify({ id: back.welcome?.id, resumed: back.welcome?.resumed }));

const replay = back.msgs.filter((m) => m.t === 'event' && m.replay);
t('N13b · catch-up is entitled replay, not a dump',
  replay.length > 0 && replay.every((m) => m.ev.vis !== 'SEALED' && (!m.ev.for || m.ev.for === a.welcome.playerId)),
  `${replay.length} replayed`);
t('N13c · a refresh resumes the server show beat, not casting',
  last(back, 'show')?.beat === 'expedition' || last(back, 'show')?.beat === 'recap',
  last(back, 'show')?.beat);

{
  const night = srv.rooms.get('night');
  const before = night.game.state.episode;
  host.send({
    t: 'world',
    runner: { room: 'r0.ballroom', x: 0, z: 0 },
    hunter: { room: 'r1.gallery', x: 1, z: 1 },
    mission: { phase: 'done', room: 'r0.ballroom' },
  });
  await sleep(50);
  t('N17 · a finished smash run pins recap with SMASHED — it does not soft-end the night there',
    last(host, 'show')?.beat === 'recap' && last(host, 'show')?.end === RUN_END.SMASHED
      && last(b, 'show')?.beat === 'recap' && night.show === 'recap',
    JSON.stringify(last(host, 'show')));
  const phases = [];
  phases.push(night.show);
  const toDebrief = progressShow(night);
  await sleep(40);
  t('N17b · progressShow walks Recap → Debrief',
    toDebrief === 'debrief' && night.show === 'debrief'
      && last(host, 'show')?.beat === 'debrief',
    JSON.stringify({ show: night.show, host: last(host, 'show')?.beat }));
  phases.push(night.show);
  const playEpSkippedReckoning = !host.msgs.filter((m) => m.t === 'event')
    .map((m) => m.ev).some((e) => e.type === 'phase.RECKONING');
  t('N17c · playEpisode still skipped Reckoning on episode 1 (gate/sim premiere skip)',
    playEpSkippedReckoning);

  const toReckoning = progressShow(night);
  await sleep(40);
  t('N17d · live clock walks Debrief → Reckoning on every episode, including ep1',
    toReckoning === 'reckoning' && night.show === 'reckoning'
      && last(host, 'show')?.beat === 'reckoning'
      && night.game.state.phase === 'RECKONING'
      && Number.isFinite(last(host, 'show')?.until)
      && last(host, 'show').until > Date.now()
      && (last(host, 'noms')?.standing || []).length === 0,
    JSON.stringify(last(host, 'show')));
  phases.push(night.show);

  const emptyHold = expireShowHold(night);
  t('N17d2 · empty Reckoning timer does not jump to Vote on first expiry',
    emptyHold === 'reckoning' && night.show === 'reckoning'
      && (night.game.state.nominations || []).length === 0
      && night.game.state.phase === 'RECKONING',
    JSON.stringify({ show: night.show, n: night.game.state.nominations.length }));

  const nomA = a.welcome.playerId;
  const nomB = b.welcome.playerId;
  // N13 closed `a` and reclaimed the seat as `back`.
  back.send({ t: 'nominate', target: nomB });
  await sleep(40);
  t('N17e · a living phone can nominate once; TV sees the standing list',
    last(host, 'noms')?.standing?.some((n) => n.nominator === nomA && n.target === nomB)
      && night.game.state.nominations.length === 1
      && last(host, 'show')?.until > Date.now(),
    JSON.stringify(last(host, 'noms')));
  back.send({ t: 'nominate', target: nomB });
  await sleep(20);
  t('N17e2 · second tap from the same nominator is ignored',
    night.game.state.nominations.length === 1);

  b.send({ t: 'nominate', target: nomA });
  await sleep(40);
  t('N17f · two living players spending both noms closes Reckoning early → Vote',
    night.show === 'vote' && last(host, 'show')?.beat === 'vote'
      && night.game.state.phase === 'VOTE'
      && night.game.state.nominations.length === 2,
    JSON.stringify({ show: night.show, n: night.game.state.nominations.length }));
  phases.push(night.show);

  // Two seated living cannot clear a strict majority without a third ballot.
  // Seat an extra phone during Vote so the live execute path still has a
  // legal majority. Nominators are already locked to their nominee — a
  // nominee who also nominated cannot overwrite that with a self-vote
  // (self-coercion to NO_ONE is for non-nominators, N18c).
  const extra = await open(base);
  await sleep(40);
  back.send({ t: 'lynchVote', choice: nomB });
  b.send({ t: 'lynchVote', choice: nomB });
  extra.send({ t: 'lynchVote', choice: nomB });
  await sleep(20);
  const toExec = progressShow(night);
  await sleep(40);
  const aired = last(host, 'lynch');
  t('N17g · living-majority vote executes; nominator-nominees stay locked (self-vote refused)',
    toExec === 'execution' && night.show === 'execution'
      && extra.welcome?.playerId
      && night.game.state.voteResult?.executed === nomB
      && aired?.result?.executed === nomB
      && (aired?.votes || []).some((v) => v.voter === nomA && v.choice === nomB)
      && (aired?.votes || []).some((v) => v.voter === nomB && v.choice === nomA)
      && !(aired?.votes || []).some((v) => v.voter === nomB && v.choice === NO_ONE)
      && (aired?.votes || []).filter((v) => v.choice === nomB).length >= 2
      && night.game.state.players.find((p) => p.id === nomB)?.alive === false,
    JSON.stringify(aired));
  extra.close();
  phases.push(night.show);

  const toCasting = progressShow(night);
  await sleep(40);
  t('N17h · Execution → Casting for the next pair (episode already bumped by playEpisode)',
    toCasting === 'casting' && night.show === 'casting'
      && last(host, 'show')?.beat === 'casting'
      && night.game.state.phase === 'CASTING'
      && night.game.state.airingEpisode === before
      && night.game.state.pair.runner == null && night.game.state.pair.guide == null,
    JSON.stringify({
      show: night.show, phase: night.game.state.phase,
      airing: night.game.state.airingEpisode, episode: night.game.state.episode,
      pair: night.game.state.pair,
    }));
  phases.push(night.show);
  t('N17i · the live beat order after a completed run is recap, debrief, reckoning, vote, execution, casting',
    phases.join(',') === 'recap,debrief,reckoning,vote,execution,casting',
    phases.join(','));
}

function showRoom() {
  const game = createRoom({ count: 4, castSeed: 1, worldSeed: 1, send: () => {}, emit: () => {} });
  game.start();
  game.playEpisode();
  return {
    game, conns: new Map(), seatsTaken: new Set(), tvTaken: false,
    show: 'recap', showClock: null, showUntil: null,
    reckoningStartedAt: null, reckoningEmptyExtends: 0, runEnd: RUN_END.SMASHED,
    ballots: new Map(),
  };
}

{
  t('N19 · late-debrief window is the last 20s of the 75s talk hold',
    LATE_DEBRIEF_MS === 20000 && EMPTY_RECKONING_EXTEND_CAP === 3);
  const early = showRoom();
  t('N19a · progressShow still walks recap → debrief → reckoning',
    progressShow(early) === 'debrief' && progressShow(early) === 'reckoning'
      && early.show === 'reckoning' && early.game.state.phase === 'RECKONING');
  t('N19b · empty Reckoning timer stays (extends) on first expiry',
    expireShowHold(early) === 'reckoning' && early.show === 'reckoning'
      && early.reckoningEmptyExtends === 1
      && (early.game.state.nominations || []).length === 0);
  expireShowHold(early);
  expireShowHold(early);
  t('N19c · three empty extensions still hold Reckoning',
    early.show === 'reckoning' && early.reckoningEmptyExtends === 3);
  t('N19d · after the cap, empty Reckoning progresses so a table cannot softlock',
    expireShowHold(early) === 'vote' && early.show === 'vote'
      && (early.game.state.nominations || []).length === 0);

  const named = showRoom();
  progressShow(named);
  progressShow(named);
  expireShowHold(named);
  const living = named.game.episodeLiving();
  const nom = named.game.nominatePlayer(living[0], living[1], living);
  t('N19e · after one nominate, the clock can proceed to Vote',
    nom.ok && named.game.state.nominations.length === 1
      && expireShowHold(named) === 'vote' && named.show === 'vote');

  const talk = showRoom();
  progressShow(talk);
  talk.showUntil = Date.now() + 60000;
  const livingTalk = talk.game.episodeLiving();
  const tooSoon = applyNominate(talk, livingTalk[0], livingTalk[1]);
  t('N19f · early Debrief still refuses nominate — talk time is phones-down',
    !tooSoon.ok && talk.show === 'debrief' && (talk.game.state.nominations || []).length === 0,
    JSON.stringify(tooSoon));
  talk.showUntil = Date.now() + 15000;
  const late = applyNominate(talk, livingTalk[0], livingTalk[1]);
  t('N19g · late Debrief first tap enters Reckoning and stands the nom',
    late.ok && talk.show === 'reckoning' && talk.game.state.phase === 'RECKONING'
      && talk.game.state.nominations.some((n) => n.nominator === livingTalk[0] && n.target === livingTalk[1]),
    JSON.stringify({ show: talk.show, n: talk.game.state.nominations.length, late }));
}

host.send({ t: 'show', beat: 'recap' });
await sleep(40);
t('N14 · host can pace the room onto the recap beat',
  last(b, 'show')?.beat === 'recap' && last(back, 'show')?.beat === 'recap');

{
  const tok = host.welcome.token;
  host.close();
  await sleep(80);
  const tvBack = await open(`${base}&host=1&token=${tok}`);
  await sleep(40);
  t('N14b · a refreshed TV resumes the server show beat, not casting',
    last(tvBack, 'show')?.beat === 'recap' || last(tvBack, 'show')?.beat === 'expedition',
    last(tvBack, 'show')?.beat);
  tvBack.close();
}

{
  const steal = await open(`${base}&host=1&token=${tok}`);
  t('N15 · a phone token cannot become the TV',
    steal.welcome?.t === 'full' && steal.welcome?.reason === 'phone-token-as-tv',
    JSON.stringify(steal.welcome));
  steal.close();
}

{
  const alias = await open(`${base}&role=tv`);
  t('N16 · ?role=tv is not a spectator flag and sits as a phone',
    alias.welcome?.t === 'welcome' && alias.welcome?.isTV === false,
    JSON.stringify({ t: alias.welcome?.t, id: alias.welcome?.id, isTV: alias.welcome?.isTV }));
  alias.close();
}

for (const c of [host, a, b, back]) c.close();
srv.close();
console.log(`\nparty-night: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
