#!/usr/bin/env node
/**
 * party-night — the sit-down path: TV + two phones, lobby, casting, stub expedition, recap.
 *
 *   node harness/party-night.mjs
 *
 * Does not replace party-sockets. That gate still proves the filter over nine connections.
 * This one proves a reviewer can open a host, two phones, see the lobby, and advance.
 */

import { startServer, fanoutViolations, lobbySnapshot, progressShow, expireShowHold, applyNominate, castingBackstop, applyReady, readyCountdownNow, MAX_PHONES, bindConnection, tvHostLive } from '../net/party/local.mjs';
import { recapFromEvents } from '../src/party/recap.js';
import { qrMatrix } from '../src/party/qr.js';
import {
  PartyNightClient,
  tokenKey, STUB_SHOW_PLAN, AFTER_RUN_BEATS, nextShowBeat, holdMsFor,
  RECAP_HOLD_MS, DEBRIEF_HOLD_MS, RECKONING_HOLD_MS, VOTE_HOLD_MS, EXECUTION_HOLD_MS, VERDICT_HOLD_MS,
  LATE_DEBRIEF_MS, EMPTY_RECKONING_EXTEND_CAP,
  remainingMs, formatRemain, normalizeCodeDisplay, normalizeCodeWire,
} from '../src/party/night-client.js';
import { PHASE, SECONDS, EPISODE_CAP } from '../src/party/phases.js';
import { missionFor, MISSION_PAINTING, MISSION_DRILL } from '../src/party/mission.js';
import { RUN_END, CASTING_BACKSTOP_MS, readyNeeded } from '../src/party/show.js';
import { CAST_BACKSTOP_MS, livingFromPublic, shouldArmCastSend } from '../src/party/ballot.js';
import { ACCENTS, SHELLS, cleanLook } from '../src/party/look.js';
import { applyCastLock, applyCastTap, ballotFromCast, CAST_BLOCK_WHY, castPrompt, castRowBlock, castRowMark, freshCast, mergePublicNames, nominationPlayers, publicName } from '../src/party/cast-ui.js';
import { createRoom } from '../src/party/room.js';
import { NO_ONE } from '../src/party/vote.js';
import { OUTCOME, outcomeLine } from '../src/party/win.js';

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
  t('N0c · recap surfaces recorded cast.ballot tiebreaks and stays empty when none',
    recap.tiebreaks.length === 0
      && recapFromEvents([{ type: 'cast.ballot', data: { runner: 'p1', guide: 'p2', tiebreaks: ['runner:seeded'] } }]).tiebreaks[0] === 'runner:seeded');
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
  t('N1a5b · rotation lockout is one-way and looks blocked, not a phantom tap',
    castRowBlock('p1', { phase: 'runner' }, { lastPair: { runner: 'p1', guide: 'p2' }, livingCount: 6 }) === 'ran'
      && castRowBlock('p2', { phase: 'guide', runner: 'p3' }, { lastPair: { runner: 'p1', guide: 'p2' }, livingCount: 6 }) === 'guided'
      && castRowBlock('p1', { phase: 'guide', runner: 'p3' }, { lastPair: { runner: 'p1', guide: 'p2' }, livingCount: 6 }) == null
      && castRowBlock('p2', { phase: 'runner' }, { lastPair: { runner: 'p1', guide: 'p2' }, livingCount: 6 }) == null
      && castRowBlock('p1', { phase: 'runner' }, { lastPair: { runner: 'p1', guide: 'p2' }, livingCount: 3 }) == null
      && CAST_BLOCK_WHY.ran.includes('cannot run'));
  t('N1a5c · self-pick stays legal on the padlock; the phone only names the state',
    applyCastTap(freshCast(), 'me').draft === 'me'
      && castRowBlock('me', freshCast(), { lastPair: null, livingCount: 6 }) == null
      && castRowMark({ id: 'me', name: 'Ada' }, freshCast(), { selfId: 'me' }) === ' (you)');
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
  t('N1a9 · stock Robot N is a name on the TV, not The runner / The guide',
    publicName('Robot 1', 'p1', 'The runner') === 'Robot 1'
      && publicName('Ellie', 'p1', 'The runner') === 'Ellie'
      && publicName('—', 'p1', 'The runner') === 'The runner'
      && publicName('p1', 'p1', 'The guide') === 'The guide'
      && publicName('', 'p1', 'The guide') === 'The guide');
}

t('N1b · host and phone tokens are namespaced apart',
  tokenKey('test', 'tv') !== tokenKey('test', 'phone')
    && tokenKey('test', 'tv').endsWith('.tv.token')
    && tokenKey('test', 'phone').endsWith('.phone.token'));
t('N1c · stub show plan walks recap → debrief → reckoning → vote → execution → casting after the run',
  STUB_SHOW_PLAN.map((s) => s.beat).join(',') === 'expedition,recap,debrief,reckoning,vote,execution,casting');
t('N1c2 · expedition is immediate — the TV does not wait on Watch the run',
  (STUB_SHOW_PLAN.find((s) => s.beat === 'expedition')?.ms ?? 1) === 0);
/*
 * ⚠️ TWO CHECKS IN ONE, AND BOTH HALVES EARN THEIR PLACE.
 *   `=== SECONDS[PHASE.X] * 1000` is the one that matters: the wire reads the design table rather
 *   than carrying a second copy. That is the two-machines-disagreeing bug this repo has already
 *   paid for once, in the premiere.
 *   The LITERALS are what make a duration change visible. Agreement alone would stay green while
 *   someone quietly doubled a beat.
 *
 * Debrief moved 75000 -> 300000 on 2026-08-25 (John: Blood on the Clocktower's long day). It is a
 * ceiling now, ended by a majority tapping READY — N21. What it cost is in `round-loop` R2.
 */
t('N1c3 · recap hold is 10s and debrief hold is 300s — the shooting schedule, not a new table',
  RECAP_HOLD_MS === SECONDS[PHASE.RECAP] * 1000 && RECAP_HOLD_MS === 10000
    && DEBRIEF_HOLD_MS === SECONDS[PHASE.DEBRIEF] * 1000 && DEBRIEF_HOLD_MS === 300000
    && holdMsFor('recap') === RECAP_HOLD_MS && holdMsFor('debrief') === DEBRIEF_HOLD_MS);
/*
 * ⚖️ **VERDICT JOINED THE CHAIN**, so this literal grew one beat — deliberately, and the literal
 * is the point: agreement alone would stay green while somebody quietly reordered the night.
 *
 * `nextShowBeat('verdict')` is 'casting' because that is the DEFAULT edge. Whether the night
 * actually walks there is `progressShow`'s call — it overrules the chain when the win fold says
 * the season is over. A pure function cannot know that, and should not pretend to.
 *
 * 🫀 Couch Plan Rung 2: `nextShowBeat('expedition')` is `'recap'`. It used to be null, and
 * `progressShow` on the run was a no-op that skipped Recap. Recap is in `orderFor`; it airs.
 */
t('N1c4 · after a finished run the clock is Recap → Debrief → Reckoning → Vote → Execution → Verdict → Casting',
  AFTER_RUN_BEATS.join(',') === 'recap,debrief,reckoning,vote,execution,verdict,casting'
    && nextShowBeat('recap') === 'debrief' && nextShowBeat('debrief') === 'reckoning'
    && nextShowBeat('reckoning') === 'vote' && nextShowBeat('vote') === 'execution'
    && nextShowBeat('execution') === 'verdict' && nextShowBeat('verdict') === 'casting'
    && nextShowBeat('expedition') === 'recap'
    && holdMsFor('reckoning', 0) === RECKONING_HOLD_MS && holdMsFor('vote') === VOTE_HOLD_MS
    && holdMsFor('execution') === EXECUTION_HOLD_MS
    && holdMsFor('verdict') === VERDICT_HOLD_MS && VERDICT_HOLD_MS === SECONDS[PHASE.VERDICT] * 1000
    && formatRemain(0) === '0s' && formatRemain(65000) === '1:05'
    && remainingMs(1000, 1000) === 0
    && remainingMs(null) === null && remainingMs('') === null);
t('N1c5 · episode 1 is the twin-painting smash; episode 2+ is the wall-cam drill',
  missionFor(1) === MISSION_PAINTING && missionFor(2) === MISSION_DRILL
    && missionFor(3).target === 'wall-cam' && MISSION_DRILL.job === 'drill'
    && missionFor(undefined) === MISSION_PAINTING);

{
  const r = createRoom({ count: 4, castSeed: 1, worldSeed: 1, send: () => {}, emit: () => {} });
  r.start();
  r.playEpisode();
  const playPhases = r.log.all().filter((e) => e.type.startsWith('phase.')).map((e) => e.type.slice(6));
  // Inverted 2026-08-25 with `orderFor`: there is no premiere skip on either machine now.
  t('N18 · playEpisode runs the full order on the premiere, same as the live clock',
    playPhases.includes('RECKONING') && playPhases.includes('VOTE') && playPhases.includes('VERDICT'));
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

{
  /*
   * John, sofa, 29 Aug, episode 2 / N=8. Ada lynched in episode 1 still sat in
   * the living ballot. After execute, episodeLiving and the public living list
   * must drop them, and 3·2·1 must arm on the living ballots alone.
   */
  const r = createRoom({ count: 8, castSeed: 1, worldSeed: 1, send: () => {}, emit: () => {} });
  r.start();
  r.playEpisode();
  const seated = r.state.players.map((p) => p.id);
  t('N24 · episode 1 opens with eight living', seated.length === 8 && r.episodeLiving().length === 8);
  r.enterReckoning(seated);
  const victim = seated[7];
  r.nominatePlayer(seated[0], victim, seated);
  r.nominatePlayer(seated[1], victim, seated);
  r.enterVote(seated);
  for (const id of seated) r.castLynchVote(id, victim, seated);
  const result = r.closeVote();
  const after = r.episodeLiving();
  t('N24a · execute drops the victim from episodeLiving',
    result.executed === victim && after.length === 7 && !after.includes(victim)
      && r.state.players.find((p) => p.id === victim)?.alive === false,
    JSON.stringify({ executed: result.executed, living: after }));
  r.beginCasting();
  const publicLiving = livingFromPublic({
    ids: seated,
    players: r.state.players,
    events: r.log.all(),
  });
  t('N24b · episode-2 casting living excludes executed from public facts',
    r.state.phase === 'CASTING'
      && publicLiving.length === 7 && !publicLiving.includes(victim)
      && r.episodeLiving().join(',') === publicLiving.join(','));
  const votes = publicLiving.map((v, i) => ({
    voter: v,
    runner: publicLiving[(i + 1) % 7],
    guide: publicLiving[(i + 2) % 7],
  }));
  t('N24c · 3·2·1 arms on all-living-sent — a dead phone is not the backstop',
    shouldArmCastSend({ livingIds: publicLiving, votes, firstBallotAt: 1000, now: 1000 }) === true
      && shouldArmCastSend({ livingIds: seated, votes, firstBallotAt: 1000, now: 1000 }) === false);
}

const host = await open(`${base}&host=1`);
t('N2 · host=1 is the TV spectator, not a robot',
  host.welcome?.t === 'welcome' && host.welcome.id === 'tv' && host.welcome.isTV === true,
  JSON.stringify({ id: host.welcome?.id, isTV: host.welcome?.isTV }));

/*
 * 📺 HEAT5 / H229. `tvTaken` used to stick after the host sock died, so F5 / a ghost
 * websocket / a second Chrome painted "The TV seat is taken" with one host left.
 * A living second host is still refused. Same room `tvseat`, not `night`.
 */
{
  const tvBase = `ws://localhost:${PORT}/?room=tvseat`;
  const h1 = await open(`${tvBase}&host=1`);
  t('N2b · the first host sits',
    h1.welcome?.t === 'welcome' && h1.welcome?.isTV === true);
  const living = await open(`${tvBase}&host=1`);
  t('N2c · a second simultaneous host is refused · two living TVs are still illegal',
    living.welcome?.t === 'full' && (living.welcome?.reason === 'full' || !living.welcome?.isTV),
    JSON.stringify(living.welcome));
  living.close();
  h1.close();
  await sleep(80);
  const h2 = await open(`${tvBase}&host=1`);
  t('N2d · after the host sock drops, one new host of the same room sits again',
    h2.welcome?.t === 'welcome' && h2.welcome?.isTV === true && h2.welcome?.id === 'tv',
    JSON.stringify({ t: h2.welcome?.t, id: h2.welcome?.id, isTV: h2.welcome?.isTV }));
  const again = await open(`${tvBase}&host=1`);
  t('N2e · and a second host is still refused once that one is in',
    again.welcome?.t === 'full', JSON.stringify(again.welcome));
  again.close();
  const tok = h2.welcome.token;
  h2.close();
  await sleep(80);
  const reclaimed = await open(`${tvBase}&host=1&token=${tok}`);
  t('N2f · host token reclaim sits as the TV',
    reclaimed.welcome?.t === 'welcome' && reclaimed.welcome?.isTV === true
      && reclaimed.welcome?.resumed === true);
  const steal = await open(`${tvBase}&host=1`);
  t('N2g · reclaim still holds the seat against a second host',
    steal.welcome?.t === 'full', JSON.stringify(steal.welcome));
  reclaimed.close();
  steal.close();
}

{
  const game = createRoom({ count: 4, castSeed: 1, worldSeed: 1, send() {}, emit() {} });
  const room = { game, conns: new Map(), seatsTaken: new Set(), tvTaken: false };
  const first = bindConnection(room, { wantTV: true });
  t('N2h · first TV bind claims the seat',
    first?.isTV === true && first?.id === 'tv' && room.tvTaken === true);
  room.conns.set(first.id, { sock: { destroyed: false, writable: true }, token: first.token });
  t('N2h1 · a second TV bind is refused while the host sock is live',
    bindConnection(room, { wantTV: true }) == null && tvHostLive(room) === true);
  room.conns.delete(first.id);
  room.tvTaken = true;
  const afterLeak = bindConnection(room, { wantTV: true });
  t('N2h2 · a leaked tvTaken with no live sock does not block the next host',
    afterLeak?.isTV === true && afterLeak?.resumed === false, JSON.stringify(afterLeak));
  room.conns.set(afterLeak.id, { sock: { destroyed: true, writable: false }, token: afterLeak.token });
  room.tvTaken = true;
  t('N2h3 · a destroyed ghost sock does not count as a living host',
    tvHostLive(room) === false);
  const afterGhost = bindConnection(room, { wantTV: true });
  t('N2h4 · and the next host sits over that ghost',
    afterGhost?.isTV === true && afterGhost?.resumed === false);
}

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

{
  const PORT8 = PORT + 1;
  const srv8 = startServer({ port: PORT8, count: 8, castSeed: 8, worldSeed: 8, code: 'n8' });
  await sleep(80);
  const base8 = `ws://localhost:${PORT8}/?room=n8`;
  const tv8 = await open(`${base8}&host=1`);
  const phones8 = [];
  for (let i = 0; i < MAX_PHONES; i++) phones8.push(await open(base8));
  await sleep(80);
  tv8.send({ t: 'start' });
  tv8.send({ t: 'casting' });
  await sleep(80);
  tv8.send({ t: 'episode', opts: {} });
  await sleep(80);
  const pair8 = last(tv8, 'state')?.frame?.pair;
  t('N6d · N=8 empty-noop waits — unused===0 must not invent a rotation pair',
    !pair8?.runner && !pair8?.guide,
    JSON.stringify(pair8));
  for (const c of [tv8, ...phones8]) c.close();
  srv8.close();
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
  {
    const r8 = createRoom({ count: 8, castSeed: 1, worldSeed: 1, send: () => {} });
    r8.start();
    const living8 = r8.state.players.filter((p) => p.alive).map((p) => p.id);
    r8.playEpisode({ ballots: [], living: living8 });
    t('N7f2 · playEpisode empty ballots at N=8 (unused===0) still wait',
      living8.length === 8 && r8.state.pair.runner == null && r8.state.pair.guide == null);
  }
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

{
  /*
   * John, 8-player grind 30 Aug: Recap printed CAM DARK after almost every
   * execute. recap.cameraLit is true only if the vis log has run.camera_lit.
   * Live Send-them-in never emits it (N9 / N9c). Smash landing is mission.return.
   */
  const smash = createRoom({ count: 8, castSeed: 1, worldSeed: 1, send: () => {} });
  smash.start();
  smash.playEpisode({ scaffold: false });
  const before = smash.state.cameras.unlocked;
  smash.setWorld({
    runner: { room: 'gallery', x: 1, z: 1 }, hunter: null,
    mission: { phase: 'seek', room: 'gallery' },
  });
  t('N25 · seek does not light a camera',
    recapFromEvents(smash.log.all()).cameraLit === false
    && smash.state.cameras.unlocked === before);
  smash.setWorld({
    runner: { room: 'gallery', x: 1, z: 1 }, hunter: null,
    mission: { phase: 'return', room: 'ballroom' },
  });
  const lit = recapFromEvents(smash.log.all());
  t('N25b · smash (mission.return) emits run.camera_lit — Recap reads CAM LIT',
    lit.cameraLit === true
    && smash.state.cameras.unlocked === before + 1
    && smash.log.all().some((e) => e.type === 'run.camera_lit'),
    JSON.stringify({ lit, unlocked: smash.state.cameras.unlocked }));
  smash.setWorld({
    runner: { room: 'ballroom', x: 2, z: 2 }, hunter: null,
    mission: { phase: 'done', room: 'ballroom' },
  });
  t('N25c · done does not light a second camera',
    smash.state.cameras.unlocked === before + 1
    && smash.log.all().filter((e) => e.type === 'run.camera_lit').length === 1);
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
  // 🚨 INVERTED 2026-08-25 with `orderFor`. This asserted the premiere skip; the live clock
  // below (N17d) never had one, and the skip was the half that went. Both halves now agree.
  const playEpRanReckoning = host.msgs.filter((m) => m.t === 'event')
    .map((m) => m.ev).some((e) => e.type === 'phase.RECKONING');
  t('N17c · playEpisode runs Reckoning on episode 1 too — no premiere skip either side',
    playEpRanReckoning);

  const toReckoning = progressShow(night);
  await sleep(40);
  t('N17d · live clock walks Debrief → Reckoning on every episode, premiere included',
    toReckoning === 'reckoning' && night.show === 'reckoning'
      && last(host, 'show')?.beat === 'reckoning'
      && night.game.state.phase === 'RECKONING'
      && Number.isFinite(last(host, 'show')?.until)
      && last(host, 'show').until > Date.now()
      && (last(host, 'noms')?.standing || []).length === 0,
    JSON.stringify(last(host, 'show')));
  phases.push(night.show);

  t('N17d2 · the live Reckoning is still open — one clock, a name can still stand before zero',
    night.show === 'reckoning' && (night.game.state.nominations || []).length === 0
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

  /* =============================================================================================
   * ⚖️ **N17h0 · THE VERDICT BEAT — the one that used to be a grey chip on the rail.**
   *
   * `episode-order` carried `WIRE_MISSING = [PHASE.VERDICT]` and the note "the day Verdict grows
   * a wire beat, delete it from that list". This is that day, so this is the assertion that has
   * to exist first: the beat is entered, it airs a status, and the phones are told.
   *
   * 🚨 **AND THE FEED COUNT IS NOT ON IT.** `foldWin` returns `fed` right beside `camerasLit`,
   * and `rrr-social-round.md` §4 keeps it back until the Reunion — the gauge is a deliberately
   * lossy proxy, and evil losing a partner looks exactly like evil winning. This is the control
   * arm for that: a later "we already have the fold, just spread it" fails HERE.
   * ============================================================================================= */
  const toVerdict = progressShow(night);
  await sleep(40);
  const airedVerdict = last(host, 'verdict');
  t('N17h0 · Execution → Verdict, and the room is told the season\'s status',
    toVerdict === 'verdict' && night.show === 'verdict'
      && last(host, 'show')?.beat === 'verdict'
      && night.game.state.phase === 'VERDICT'
      && typeof airedVerdict?.status === 'string' && airedVerdict.status.length > 0
      && Number.isFinite(airedVerdict?.camerasLit),
    JSON.stringify(airedVerdict));
  t('N17h0b control · the aired verdict carries no feed count — that is Reunion-only',
    airedVerdict != null && !('fed' in airedVerdict) && !('rule' in airedVerdict)
      && fanoutViolations(airedVerdict).length === 0,
    Object.keys(airedVerdict || {}).join(','));
  phases.push(night.show);

  /* =============================================================================================
   * 🏁 **N17h · THE NIGHT ENDS. This is the first conditional edge in the whole wire.**
   *
   * ⚠️ **THIS ASSERTION USED TO READ "Verdict → Casting" AND IT WAS WRITTEN BEFORE THE EDGE
   * EXISTED.** Every step of the chain before it is unconditional — a beat finishes, the next one
   * starts — so the gate walked to Casting because that is all `AFTER_RUN_NEXT` could ever do.
   * `PRIME-TIME-STATE.md` §2: *"Nothing ever ends a session."* It does now, and this night is the
   * proof: three phones ever sat down, `dealRoles` re-dealt for the two who were seated at start
   * (p1 evil, p2 good), the Vote executed p2, and `foldWin` fires **W4** — the last good player is
   * gone. So this table's Verdict has nowhere to go but the Reunion, and the assertion follows the
   * machine rather than the other way round.
   *
   * The DEFAULT edge, RENEWED → Casting, is not lost with it: N17j below drives a clean four-hand
   * table through the same walk and asserts it. Both sides of the branch are gated or neither is.
   * ============================================================================================= */
  const toReunion = progressShow(night);
  await sleep(40);
  const season = last(host, 'season');
  t('N17h · a non-RENEWED Verdict ends the session — Reunion, not another Casting',
    toReunion === 'reunion' && night.show === 'reunion'
      && last(host, 'show')?.beat === 'reunion'
      && season?.status === OUTCOME.CANCELLED
      && night.game.outcome() === OUTCOME.CANCELLED,
    JSON.stringify({ show: night.show, season, outcome: night.game.outcome() }));
  t('N17h2 · the Reunion is the end of the clock, not another hold',
    night.showUntil == null && night.showClock == null
      && nextShowBeat('reunion') == null,
    JSON.stringify({ until: night.showUntil, clock: night.showClock != null, next: nextShowBeat('reunion') }));
  phases.push(night.show);
  t('N17i · the live beat order after a completed run is recap, debrief, reckoning, vote, execution, verdict, reunion',
    phases.join(',') === 'recap,debrief,reckoning,vote,execution,verdict,reunion',
    phases.join(','));
}

/* ===============================================================================================
 * 🛑 **N17k · THE HOST CALLS THE NIGHT — the first emitter `host.skip` has ever had.**
 *
 * `win.js` W6 fires ABANDONED on a `host.skip` event and has done since the fold was written; the
 * gate suite exercised the rule with a hand-built log, and no product code ever appended one. So
 * this is not "does W6 work" — `win-machine` answers that — it is whether a real television can
 * reach it, and whether anything else can.
 *
 * 🚨 **THE isTV ARM IS THE POINT.** A seated phone that could send `{t:'skip'}` could end the
 * night for seven other people from the sofa. The `show` handler shipped without that guard and
 * an adversarial playtester drove a whole room with it; this control is strictly worse to hand
 * out, so the denial is gated before the happy path is.
 * =============================================================================================== */
{
  const PORTX = PORT + 2;
  const srvx = startServer({ port: PORTX, count: 8, castSeed: 11, worldSeed: 11, code: 'nx' });
  await sleep(80);
  const basex = `ws://localhost:${PORTX}/?room=nx`;
  const tvx = await open(`${basex}&host=1`);
  const p1x = await open(basex);
  const p2x = await open(basex);
  await sleep(80);
  tvx.send({ t: 'start' });
  await sleep(60);
  const roomx = srvx.rooms.get('nx');

  p1x.send({ t: 'skip' });
  await sleep(60);
  t('N17k · a seated phone cannot end the room\'s night',
    roomx.show !== 'reunion' && roomx.game.outcome() !== OUTCOME.ABANDONED
      && !roomx.game.log.all().some((e) => e.type === 'host.skip'),
    JSON.stringify({ show: roomx.show, outcome: roomx.game.outcome() }));

  tvx.send({ t: 'skip' });
  await sleep(80);
  const seasonx = last(tvx, 'season');
  t('N17k2 · the television can — host.skip is recorded and W6 abandons the season',
    roomx.show === 'reunion' && roomx.game.outcome() === OUTCOME.ABANDONED
      && seasonx?.status === OUTCOME.ABANDONED
      && last(p1x, 'season')?.status === OUTCOME.ABANDONED
      && roomx.game.log.all().some((e) => e.type === 'host.skip'),
    JSON.stringify({ show: roomx.show, outcome: roomx.game.outcome(), season: seasonx }));

  /*
   * ⚠️ **ORDER, NOT PRESENCE.** `foldWin` resolves by LOG ORDER and breaks on the first rule that
   * fires, so recording `phase.VERDICT` before `host.skip` would let W5 beat the host's own call
   * by one sequence number and file an abandoned night as a win for Production. The events are
   * both there either way; only their order says which rule ran.
   */
  const logx = roomx.game.log.all();
  const skipSeq = logx.find((e) => e.type === 'host.skip')?.seq;
  const verdictSeq = logx.filter((e) => e.type === 'phase.VERDICT').at(-1)?.seq;
  t('N17k3 · the skip is written BEFORE the phase it triggers, so W6 outruns W5',
    Number.isFinite(skipSeq) && Number.isFinite(verdictSeq) && skipSeq < verdictSeq
      && logx.find((e) => e.type === 'win.checked' && e.data.rule === 'W6') != null,
    JSON.stringify({ skipSeq, verdictSeq }));

  t('N17k4 · and an abandoned night is over — no clock, nothing scheduled after it',
    roomx.showUntil == null && roomx.showClock == null && nextShowBeat('reunion') == null,
    JSON.stringify({ until: roomx.showUntil, clock: roomx.showClock != null }));

  /* =============================================================================================
   * 🎭 **N17m · THE REVEAL — the one message in the whole wire that names an alignment.**
   *
   * 🚨 **THE ORDERING ARM IS THE WHOLE GATE, AND IT IS DELIBERATELY WRITTEN AGAINST THE
   * TRANSCRIPT RATHER THAN THE SERVER'S INTENT.** `party-isolation` drives `createRoom` directly,
   * so it sweeps frames and events and never sees a fanout at all — which means nothing else in
   * the suite is looking at this channel. It walks what a socket ACTUALLY GOT, in order, and
   * asserts every alignment word arrived at or after the reveal. A `t:'reveal'` sent one beat
   * early would pass a schema check and fail here, which is the right way round.
   *
   * ⚠️ It sweeps the PHONE, not the TV. Both get the reveal, but the phone is the socket with a
   * player behind it and the one the leak would matter to.
   * ============================================================================================= */
  const revealMsg = last(p1x, 'reveal');
  t('N17m · the reveal reaches the phones with a plate for every dealt seat',
    revealMsg != null && Array.isArray(revealMsg.seats) && revealMsg.seats.length > 0
      && revealMsg.seats.every((s) => typeof s.role === 'string' && typeof s.alignment === 'string')
      && revealMsg.seats.length === roomx.game.truth().seats.length
      && fanoutViolations(revealMsg).length === 0,
    JSON.stringify({ seats: revealMsg?.seats?.length, awards: revealMsg?.awards?.length,
      bad: fanoutViolations(revealMsg || {}) }));

  t('N17m2 · and it reconciles with the sealed deal — no second reveal pipeline',
    (revealMsg?.seats || []).every((s) => {
      const truth = roomx.game.truth().seats.find((x) => x.id === s.id);
      return truth && truth.role === s.role && truth.alignment === s.alignment
        && (s.believedTheyWere ?? null) === (truth.cover ?? null);
    }),
    JSON.stringify((revealMsg?.seats || []).slice(0, 2)));

  {
    /*
     * ⚠️ **THE SELF-CHANNEL IS STRIPPED FIRST, AND THE FIRST VERSION OF THIS DID NOT STRIP IT.**
     * It swept raw messages for the word "evil" and failed on the Producer's OWN state frame —
     * `you.alignment` is `self` in `entitle.js` and telling a player what they are is the whole
     * point of dealing them a card. The claim worth gating is narrower and is the one that
     * matters: **nothing told this phone about anybody ELSE.** So `you` goes, and so does any
     * event addressed to this socket's own player (`ev.for`), both of which `party-isolation`
     * I2/I3 already govern with a stronger walker than a text sweep.
     */
    const mine = p1x.welcome?.playerId;
    const strip = (m) => {
      if (m.t === 'state') { const { you, ...rest } = m.frame || {}; return { t: m.t, frame: rest }; }
      if (m.t === 'event' && m.ev?.for === mine) return { t: 'event', ev: { type: m.ev.type } };
      return m;
    };
    const words = new Set(roomx.game.truth().seats.map((s) => s.alignment));
    const stream = p1x.msgs;
    const revealIdx = stream.findIndex((m) => m.t === 'reveal');
    let early = null;
    for (let i = 0; i < revealIdx && !early; i++) {
      const text = JSON.stringify(strip(stream[i]));
      for (const w of words) {
        if (new RegExp(`"${w}"`).test(text)) { early = `${stream[i].t} carried "${w}"`; break; }
      }
    }
    t('N17m3 · nothing on this phone named ANYONE ELSE\'s side before the reveal did',
      revealIdx >= 0 && words.size > 0 && early === null,
      early || `${revealIdx} messages first, all clean · watched for ${[...words].join('/')}`);
  }

  for (const c of [tvx, p1x, p2x]) c.close();
  srvx.close();
}

/* ===============================================================================================
 * 🏁 **N17n · A REAL ROOM RUNS OUT OF EPISODES AND STOPS.**
 *
 * `win-machine` W10 drives the same property offline; this is the live wire, because the two are
 * different machines and `episode-order` exists because they once disagreed. Nobody nominates and
 * nobody dies, so no rule fires all night — the season ends the only other way it can, on
 * `EPISODE_CAP`, which `foldVerdict` enforces and nothing else does.
 *
 * ⚠️ **THE LOOP IS BOUNDED AND THE BOUND IS PART OF THE ASSERTION.** A gate for "it terminates"
 * that loops until it terminates is a gate that hangs CI instead of failing it. It gets
 * `EPISODE_CAP + 3` episodes and then reports where it actually got to.
 * =============================================================================================== */
{
  const PORTC = PORT + 3;
  const srvc = startServer({ port: PORTC, count: 8, castSeed: 31, worldSeed: 31, code: 'nc' });
  await sleep(80);
  const basec = `ws://localhost:${PORTC}/?room=nc`;
  const tvc = await open(`${basec}&host=1`);
  const phonesc = [];
  for (let i = 0; i < 4; i++) phonesc.push(await open(basec));
  await sleep(80);
  tvc.send({ t: 'start' });
  tvc.send({ t: 'casting' });
  await sleep(80);
  const roomc = srvc.rooms.get('nc');

  const ids = phonesc.map((p) => p.welcome.playerId);
  let episodes = 0;
  for (let i = 0; i < EPISODE_CAP + 3 && roomc.show !== 'reunion'; i++) {
    // A legal ballot from every phone: runner and guide rotate so the lockout never blocks one.
    phonesc.forEach((p, k) => p.send({
      t: 'ballot', runner: ids[(k + i) % ids.length], guide: ids[(k + i + 1) % ids.length],
    }));
    await sleep(60);
    tvc.send({ t: 'episode', opts: {} });
    await sleep(160);
    /*
     * ⚠️ **THE RUN HAS TO BE ENDED, AND FORGETTING THAT COST THIS GATE ITS FIRST DRAFT.**
     * `progressShow` walks the AFTER-run chain. Expedition used to be a hole in `nextShowBeat`
     * (null), so calling it on the expedition was a no-op that returned the same beat — Recap
     * never aired. Couch Plan Rung 2: `nextShowBeat('expedition') === 'recap'`. The first
     * version looped twelve times on 'expedition' doing nothing and reported eight episodes
     * past a cap of five. In a real room the mission ending (or the backstop clock) does this
     * — here the TV says so, the same way N17 does. Recap still airs either way.
     */
    tvc.send({
      t: 'world',
      runner: { room: 'r0.ballroom', x: 0, z: 0 },
      hunter: { room: 'r1.gallery', x: 1, z: 1 },
      mission: { phase: 'done', room: 'r0.ballroom' },
    });
    await sleep(60);
    episodes++;
    // Skip the holds. Nobody nominates, so empty Reckoning skips Vote + Execution
    // (HEAT6 / N19) and the night still decides nothing; nobody dies.
    for (let g = 0; g < 12 && roomc.show !== 'casting' && roomc.show !== 'reunion'; g++) {
      progressShow(roomc);
      await sleep(20);
    }
  }

  t('N17n · a live night that decides nothing still ends — at the cap, as CANCELLED',
    roomc.show === 'reunion' && roomc.game.outcome() === OUTCOME.CANCELLED
      && last(tvc, 'season')?.status === OUTCOME.CANCELLED
      // ⚠️ EXACTLY the cap, not "at most". `episodes <= CAP + 1` was the first draft and it
      // passed while a live season was ending after FOUR of five — see foldVerdict's header.
      && episodes === EPISODE_CAP,
    JSON.stringify({ show: roomc.show, outcome: roomc.game.outcome(), episodes,
      cap: EPISODE_CAP, episode: roomc.game.state.episode }));

  t('N17n2 · and nobody died on the way there — W5 (the cap) is what ended it',
    roomc.game.state.players.every((p) => p.alive !== false)
      && roomc.game.log.all().filter((e) => e.type === 'win.checked').at(-1)?.data?.rule === 'W5',
    JSON.stringify({
      dead: roomc.game.state.players.filter((p) => p.alive === false).map((p) => p.id),
      rule: roomc.game.log.all().filter((e) => e.type === 'win.checked').at(-1)?.data?.rule,
    }));

  /*
   * H277 / DUSK6. Overnight chrome printed CANCELLED then offered another Casting
   * because `t:'casting'` and the `]` walk opened `enterNextCasting` without
   * asking the fold. The door now refuses. Gate: this send.
   */
  tvc.send({ t: 'casting' });
  await sleep(40);
  t('N17p · a casting verb after the cap does not open another Casting',
    roomc.show === 'reunion' && roomc.game.outcome() === OUTCOME.CANCELLED,
    JSON.stringify({ show: roomc.show, outcome: roomc.game.outcome() }));

  const lastVerdict = last(tvc, 'verdict');
  t('N17q · H278 the aired verdict at the cap is CANCELLED — chrome never says the season continues',
    lastVerdict?.status === OUTCOME.CANCELLED
      && roomc.game.log.all().filter((e) => e.type === 'verdict.aired').at(-1)?.data?.status === OUTCOME.CANCELLED
      && outcomeLine(lastVerdict?.status).includes('Production wins')
      && !outcomeLine(lastVerdict?.status).includes('continues'),
    JSON.stringify({ verdict: lastVerdict, line: outcomeLine(lastVerdict?.status) }));

  for (const c of [tvc, ...phonesc]) c.close();
  srvc.close();
}

/* ===============================================================================================
 * 🔁 **N17j · THE OTHER SIDE OF THE BRANCH — a night that is NOT over goes back to Casting.**
 *
 * N17h above only ever sees the terminal edge, because the socket night it rides on has two dealt
 * seats and loses one of them. A branch gated on one side is a branch that can be deleted by
 * accident, so this drives a full four-hand table nobody dies in: `foldWin` returns RENEWED, and
 * the Verdict must hand straight back to Casting with the ballot box cleared for the next pair.
 * =============================================================================================== */
{
  const renewed = showRoom();
  const walked = [renewed.show];
  for (let i = 0; i < 6 && walked.length < 8; i++) {
    /*
     * 📺 HEAT6. Empty Reckoning now skips Vote + Execution (N19). This gate is the
     * other side of the fold — RENEWED → Casting — so stand a name before leaving
     * Reckoning. The accused walk is still the seven beats; the empty skip is N19.
     */
    if (renewed.show === 'reckoning' && (renewed.game.state.nominations || []).length === 0) {
      const living = renewed.game.episodeLiving();
      renewed.game.nominatePlayer(living[0], living[1], living);
    }
    const to = progressShow(renewed);
    if (!to || to === walked[walked.length - 1]) break;
    walked.push(to);
  }
  t('N17j · a RENEWED Verdict hands back to Casting, and the walk is the same seven beats',
    walked.join(',') === 'recap,debrief,reckoning,vote,execution,verdict,casting'
      && renewed.game.outcome() === OUTCOME.RENEWED
      && renewed.show === 'casting'
      && renewed.game.state.phase === 'CASTING'
      && renewed.game.state.pair.runner == null && renewed.game.state.pair.guide == null
      && renewed.ballots.size === 0,
    JSON.stringify({ walked: walked.join(','), outcome: renewed.game.outcome(), show: renewed.show }));
  t('N17j2 · and the Verdict it passed through aired a status on the way',
    renewed.game.log.all().some((e) => e.type === 'verdict.aired' && e.data?.status === OUTCOME.RENEWED),
    JSON.stringify(renewed.game.log.all().filter((e) => e.type === 'verdict.aired').map((e) => e.data)));
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
    LATE_DEBRIEF_MS === 20000 && EMPTY_RECKONING_EXTEND_CAP === 0);
  const early = showRoom();
  t('N19a · progressShow still walks recap → debrief → reckoning',
    progressShow(early) === 'debrief' && progressShow(early) === 'reckoning'
      && early.show === 'reckoning' && early.game.state.phase === 'RECKONING');
  /*
   * ⚠️ INVERTED HEAT6. Empty expiry used to re-arm 3× (N19b/c) then walk to Vote (N19d).
   * One clock: nobody standing skips Vote and Execution. A late name after zero
   * does not stand. Two names that lock before zero still go to Vote (N19e).
   */
  t('N19b · empty Reckoning at zero skips the vote — no execution this episode',
    expireShowHold(early) === 'verdict' && early.show === 'verdict'
      && (early.game.state.nominations || []).length === 0
      && early.game.state.phase !== 'VOTE' && early.game.state.phase !== 'EXECUTION',
    JSON.stringify({ show: early.show, phase: early.game.state.phase, n: early.game.state.nominations.length }));
  t('N19c · a second expire does not re-enter Reckoning or Vote',
    expireShowHold(early) !== 'reckoning' && early.show !== 'reckoning'
      && early.show !== 'vote');
  early.showUntil = Date.now() - 1;
  early.show = 'reckoning';
  const afterZero = applyNominate(early, early.game.episodeLiving()[0], early.game.episodeLiving()[1]);
  t('N19d · a name after zero does not stand',
    afterZero.ok === false && afterZero.why === 'clock'
      && (early.game.state.nominations || []).length === 0,
    JSON.stringify(afterZero));

  const named = showRoom();
  progressShow(named);
  progressShow(named);
  const living = named.game.episodeLiving();
  const nom = named.game.nominatePlayer(living[0], living[1], living);
  t('N19e · after one nominate before zero, the clock proceeds to Vote',
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


// ------------------------------------------------------------------ N20 · casting's safety net
/*
 * 🚨 **A DEAD TV TAB USED TO HANG THE ROOM ON CASTING FOREVER.** Every other beat had a server
 * clock; casting had none — `setShow` clears `showUntil` for it and the only thing that ended the
 * beat was the television sending `t:'episode'`. Close that tab mid-casting and eight phones wait
 * on a room that will never move.
 *
 * N20b is the half that must NOT change: an empty ballot box still waits. A net that "rescued" an
 * unvoted table by inventing a pair would be N7f2's bug wearing a helmet.
 */
{
  const netBase = `ws://localhost:${PORT}/?room=net`;
  const tv = await open(`${netBase}&host=1`);
  const p1 = await open(netBase);
  const p2 = await open(netBase);
  await sleep(60);
  tv.send({ t: 'start' });
  await sleep(40);
  tv.send({ t: 'casting' });
  await sleep(40);
  const net = srv.rooms.get('net');

  t('N20 · entering casting arms a server clock, so the beat has a deadline the TV cannot lose',
    net.show === 'casting' && net.showClock != null);
  t('N20a · and that net fires later than the television\'s own 3·2·1, so it never races it',
    CASTING_BACKSTOP_MS > CAST_BACKSTOP_MS, `net ${CASTING_BACKSTOP_MS}ms vs TV ${CAST_BACKSTOP_MS}ms`);

  const empty = castingBackstop(net);
  t('N20b · EMPTY BALLOTS STILL WAIT — the net re-arms, it never invents a pair',
    empty === 'casting' && net.show === 'casting'
      && net.game.state.pair.runner == null && net.game.state.pair.guide == null
      && net.showClock != null,
    JSON.stringify({ show: net.show, pair: net.game.state.pair }));

  p1.send({ t: 'ballot', runner: p2.welcome.playerId, guide: p1.welcome.playerId });
  p2.send({ t: 'ballot', runner: p2.welcome.playerId, guide: p1.welcome.playerId });
  await sleep(60);
  tv.close();                       // the tab dies with ballots already in
  await sleep(60);

  castingBackstop(net);
  await sleep(40);
  t('N20c · with the TV gone but ballots in, the net resolves casting into the expedition',
    net.show === 'expedition' && net.game.state.pair.runner != null && net.game.state.pair.guide != null,
    JSON.stringify({ show: net.show, pair: net.game.state.pair }));
  t('N20d · the phones were told, so they are not left on a casting sheet',
    last(p1, 'show')?.beat === 'expedition' && last(p2, 'show')?.beat === 'expedition');
  t('N20e · and the net is a no-op once the beat has moved on',
    castingBackstop(net) === null);

  for (const c of [p1, p2]) c.close();
}

// ------------------------------------------------------------------ N21 · READY ends the talk
/*
 * ✋ **DEBRIEF IS A FIVE-MINUTE CEILING, AND THE ROOM IS THE CLOCK.** John wanted Blood on the
 * Clocktower's long day; five minutes of dead air once everyone has finished talking is the
 * version of that nobody wants. A MAJORITY of the living ends the beat (his call — unanimity
 * hands one distracted player a veto over everyone's evening).
 *
 * ⚠️ **THIS IS NOT THE CASTING RULE.** `cast-ballot` B12b-e locks *"all living ballots in, or a
 * ~20s backstop, never on the first ballot"*, because an early cast lock robs a big table of its
 * vote. Ending a conversation early costs nothing that not-tapping cannot get back. Same shape,
 * opposite answer, deliberately — N21b is the assertion that keeps them from being merged.
 *
 * The properties that matter, each with the failure it is standing in front of:
 *   N21a  a minority does NOT end the beat        — two players must not silence six
 *   N21b  majority cannot fire on a first tap     — the B12b bug, arriving through a new door
 *   N21c  a majority DOES end it                  — the feature actually works
 *   N21d  un-tapping disarms                      — a mis-tap must be takeable back
 *   N21e  the beat change clears the set          — a thumb must not survive into the next beat
 *   N21f  the TV cannot vote                      — it holds no seat in the room
 *   N21g  the fanout carries counts, never names  — who wants it over is a live read on the room
 */
{
  const rBase = `ws://localhost:${PORT}/?room=rdy`;
  const rtv = await open(`${rBase}&host=1`);
  const ph = [];
  for (let i = 0; i < 5; i++) ph.push(await open(rBase));
  await sleep(80);
  rtv.send({ t: 'start' });
  await sleep(60);
  const rm = srv.rooms.get('rdy');
  const ids = ph.map((p) => p.welcome.playerId);

  // Straight to the beat under test. `t:'show'` is the same door the host workaround uses.
  rtv.send({ t: 'show', beat: 'debrief' });
  await sleep(60);

  t('N21 · five living players need a majority of three',
    readyNeeded(5) === 3 && readyNeeded(8) === 5 && readyNeeded(2) === 2,
    `5->${readyNeeded(5)} 8->${readyNeeded(8)} 2->${readyNeeded(2)}`);

  /*
   * 🚨 **N21h IS THE DEADLOCK.** The phone cannot draw a READY button until it knows the
   * threshold, and the threshold only ever rode on a `ready` fanout — which only fires when
   * somebody taps. The button therefore did not exist until it had been pressed, and the beat
   * could only ever run its full five minutes.
   *
   * Every other N21 assertion passed while that was true, because they call `applyReady` on the
   * server directly and never ask whether a phone could reach it. This one asserts the phones
   * were TOLD, on arrival, with nobody having tapped anything.
   */
  const firstReady = last(ph[0], 'ready');
  t('N21h · entering a talk beat tells every phone the threshold, before any tap',
    firstReady?.need === readyNeeded(5) && firstReady?.count === 0,
    JSON.stringify(firstReady));


  applyReady(rm, ids[0], true);
  applyReady(rm, ids[1], true);
  await sleep(40);
  t('N21a · a MINORITY does not end the beat — two thumbs of five leaves it on debrief',
    rm.show === 'debrief' && rm.readyClock == null,
    `${rm.ready.size}/${readyNeeded(5)} ready, beat=${rm.show}`);

  t('N21b · and a majority can never fire on a FIRST tap at any table of two or more',
    [2, 3, 4, 5, 6, 7, 8].every((n) => readyNeeded(n) >= 2),
    [2, 3, 4, 5, 6, 7, 8].map((n) => `${n}->${readyNeeded(n)}`).join(' '));

  applyReady(rm, ids[2], true);
  await sleep(40);
  t('N21c · the third thumb is the majority, and it ARMS rather than cutting mid-sentence',
    rm.show === 'debrief' && rm.readyClock != null, `beat=${rm.show}, armed=${rm.readyClock != null}`);

  applyReady(rm, ids[2], false);
  await sleep(40);
  t('N21d · un-tapping drops it back below the majority and disarms — READY is a toggle',
    rm.readyClock == null && rm.show === 'debrief', `armed=${rm.readyClock != null}`);

  applyReady(rm, ids[2], true);
  await sleep(40);
  const walked = readyCountdownNow(rm);
  t('N21c2 · and when the countdown lands, the beat actually moves on',
    walked === 'reckoning' && rm.show === 'reckoning', `beat=${rm.show}`);

  t('N21e · the new beat starts with an EMPTY set — a thumb belongs to one beat only',
    rm.ready.size === 0, `${rm.ready.size} carried over`);

  applyReady(rm, ids[0], true);
  applyReady(rm, ids[1], true);
  applyReady(rm, ids[2], true);
  await sleep(40);
  const before = rm.show;
  applyReady(rm, rtv.welcome?.playerId ?? 'tv', true);
  t('N21f · the television holds no seat, so it cannot vote a beat closed',
    rm.show === before && !rm.ready.has(rtv.welcome?.playerId),
    `beat=${rm.show}`);

  const fan = { t: 'ready', count: 3, need: 3 };
  t('N21g · the ready fanout is a COUNT and a THRESHOLD — never a list of who',
    fanoutViolations(fan).length === 0
      && fanoutViolations({ ...fan, who: ['p1'] }).length > 0
      && fanoutViolations({ ...fan, players: ['p1'] }).length > 0,
    'a `who` or `players` key on it is a violation, not a pass');

  /*
   * N21i IS THE OTHER HALF OF THE SAME DEADLOCK, and it is the half that would have survived.
   * N21h covers the phones that were in the room when the beat began. Every reconnect, refresh
   * and latecomer arrives AFTER that fanout, hears nothing, and shows the READY copy above a
   * missing READY button. Found by driving a real phone into a running Debrief — no gate saw it,
   * because every other N21 assertion calls `applyReady` on the server and never asks whether a
   * phone could reach it.
   *
   * ⚠️ LAST IN THE BLOCK ON PURPOSE. Joining raises the living count, which moves the majority
   * under everything above it — putting this earlier turned N21c/N21c2/N21e red for a reason
   * that had nothing to do with them.
   */
  {
    rtv.send({ t: 'show', beat: 'debrief' });
    await sleep(60);
    const latecomer = await open(rBase);
    await sleep(120);
    const lateReady = last(latecomer, 'ready');
    t('N21i · and a phone that joins mid-talk is told it on arrival',
      lateReady?.need > 0 && Number.isFinite(lateReady?.count),
      JSON.stringify(lateReady));
    latecomer.close();
  }

  /*
   * N21j · THE THIRD DOOR ON THE SAME DEADLOCK, and the one that actually shipped broken.
   *
   * The server sends `show` MORE THAN ONCE per beat: `setShow` fans the beat, then
   * `scheduleShowProgress` fans it again carrying `until`. The client cleared its ready tally on
   * every `show`, so the threshold the server had just sent was wiped milliseconds later by the
   * deadline broadcast — and a Debrief with no READY button on it can only run its full five
   * minutes. Three separate mechanisms had to be right for one button to exist; N21h, N21i and
   * this one are one each.
   */
  {
    const c = new PartyNightClient({ url: rBase, onMessage: () => {} });
    await c.connect();
    await sleep(150);
    const beforeShow = c.ready;
    // The same beat, re-broadcast — exactly what scheduleShowProgress does.
    rtv.send({ t: 'show', beat: rm.show });
    await sleep(150);
    t('N21j · a re-broadcast of the SAME beat does not wipe the ready threshold',
      beforeShow?.need > 0 && c.ready?.need === beforeShow.need,
      `before ${JSON.stringify(beforeShow)} after ${JSON.stringify(c.ready)}`);
    c.close?.();
    await sleep(60);
  }

  for (const p of ph) p.close();
  rtv.close();
}

for (const c of [host, a, b, back]) c.close();
srv.close();
console.log(`\nparty-night: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
