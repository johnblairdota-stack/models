#!/usr/bin/env node
/**
 * 🚪 **show-beat — THE BEAT THE ROOM ADVERTISES IS THE BEAT THE SERVER IS IN.**
 *
 *   node harness/show-beat.mjs
 *
 * ---------------------------------------------------------------------------------------------
 * 🩸 THE BUG THIS FILE IS THE MEMORY OF
 * ---------------------------------------------------------------------------------------------
 * `{t:'show', beat}` is the television's beat verb — the host's "Watch the run" button, the
 * `?dev=1` `]` key, and the gates' pacing seam all send it. It called `setShow` and nothing
 * else, while every OTHER way into a beat (`progressShow`, the shooting-schedule timers, the
 * casting backstop, the late-Debrief nominate) goes through an `enter*Live` function that ALSO
 * moves `room.game.state.phase`. Two doors into one room; one of them only repainted the sign.
 *
 * Driven end to end — TV + phones, `t:'start'`, `t:'casting'`, then the `]` walk
 * (`casting → recap → debrief → reckoning`, `party-host.js` `DEV_SKIP` + `nextShowBeat`):
 *
 *     ] -> recap      room.show=recap      TV fanout beat=recap      state.phase=CASTING
 *     ] -> debrief    room.show=debrief    TV fanout beat=debrief    state.phase=CASTING
 *     ] -> reckoning  room.show=reckoning  TV fanout beat=reckoning  state.phase=CASTING
 *
 *     THE TELEVISION SAYS : RECKONING
 *     EVERY PHONE WAS TOLD: RECKONING
 *     THE SERVER IS IN    : CASTING
 *     applyNominate(p1 -> p2) => {"ok":false,"why":"not reckoning"}
 *     standing nominations after a real wire nominate: 0
 *
 * `applyNominate` gates on `room.show` and lets the tap through; `room.js` `nominatePlayer` gates
 * on `state.phase` and refuses it; the message handler drops the result. **Every nomination in
 * the room is swallowed with nothing on the television to say so** — and both `]` and the host's
 * beat workaround reach it in the shipped product, so this is not only a harness trap.
 *
 * The phone half of the same night (a receipt reading "You have nominated." over an empty ballot
 * box, driven by an optimistic local flag) is `phone-accusation` PA3b's. This file is the server
 * half — the half that actually loses the nominations.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ WHY THE ONE-LINE FIX IS A WORSE BUG, AND WHAT IS ASSERTED INSTEAD
 * ---------------------------------------------------------------------------------------------
 * "Make `t:'show'` call `enterReckoningLive`" is wrong twice over. `t:'show'` sets ALL the beats,
 * and the `enter*Live` functions are TRANSITIONS, not setters: `enterReckoningLive` clears
 * `state.nominations`, `enterVoteLive` overwrites `lynchVotes` with the assumed nominator votes,
 * `enterExecutionLive` closes the ballot, `enterNextCasting` empties the ballot box. The server
 * re-sends `show` more than once per beat, a resuming TV asks for its current beat, and
 * `party-night` N21j sends exactly that — so an unguarded coupling would wipe a live Reckoning's
 * standing nominations every time the television repeated itself. **SB5 is that hazard**, and it
 * is asserted with a real nomination standing.
 *
 * Nor is the fix "the beat and the phase mirror each other". They do not, by design:
 * `playEpisode` runs the whole offline episode ahead of the room, so `state.phase` legitimately
 * reads VERDICT during a live expedition (`PRIME-TIME-STATE.md` §4). The invariant is narrower:
 *
 *   **Every beat that HAS a live transition is only ever entered through it.**
 *
 * `lobby` and `expedition` have none — EXPEDITION is entered by `playEpisode`, which needs a
 * locked pair, and "Watch the run" must not manufacture an episode. SB6 asserts it does not.
 *
 * ---------------------------------------------------------------------------------------------
 * 🧮 DERIVED, NOT TABULATED — the `episode-order` lesson, applied again
 * ---------------------------------------------------------------------------------------------
 * `orderFor` and the live wire disagreed about the premiere for months with both halves gated as
 * correct, so `episode-order` was rewritten to assert the two machines AGREE rather than to
 * assert an order. Same shape here, and nothing in this file is a hand-kept list:
 *
 *   · the expected phase for a beat is DERIVED — `beat.toUpperCase()`, checked against
 *     `phases.js` `PHASE`, so a rename moves both halves or fails (SB2b).
 *   · the set of beats under test is DERIVED from `show.js` `SHOW_BEATS` partitioned by the
 *     server's own `LIVE_BEAT_DOORS` / `SETSHOW_ONLY_BEATS`, and SB2 fails if that partition
 *     stops covering `SHOW_BEATS` exactly. **A ninth beat added to `show.js` reddens this gate
 *     until somebody decides which side of the door it is on.**
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 A GATE WHOSE CONTROLS STOP FAILING HAS GONE BLIND
 * ---------------------------------------------------------------------------------------------
 * `party-isolation` reported 20 passed / 0 failed — including all four of its blindness controls
 * — while leaking the Glitched to every phone. So this file runs TWO ARMS against two real live
 * rooms on the same server, judged by the SAME function `measure()`:
 *
 *   shipped   `{t:'show', beat:'reckoning'}` through the real handler
 *   control   the door as it was: `room.show` moved by hand, then the beat re-broadcast so the
 *             television and every phone are told RECKONING exactly as they were before
 *
 * SB9 requires SB1/SB3/SB4 to go RED in the control arm. **SB8 is the control's own
 * precondition and the thing that stops the control going blind**: it asserts the control really
 * did restore the split (`state.phase` did NOT move, the room WAS told RECKONING). If the
 * same-beat re-broadcast ever starts re-running the transition, SB8 reddens rather than the
 * control quietly turning into a second shipped arm.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ THE VACUOUS PASS
 * ---------------------------------------------------------------------------------------------
 * "Every nomination was accepted" is trivially true of a room where nobody nominated, nobody
 * joined, or the beat was never reached. SB0 is the ground truth and it is asserted as COUNTS —
 * how many phones hold a playerId, how many living seats the server sees, how many nominations
 * were actually put on the wire — so a rig that stops producing them goes RED, not green.
 */

import {
  startServer, applyNominate, enterBeatLive, LIVE_BEAT_DOORS, SETSHOW_ONLY_BEATS,
  livingSeatedIds, seatedPlayerIds,
} from '../net/party/local.mjs';
import { SHOW_BEATS } from '../src/party/show.js';
import { PHASE } from '../src/party/phases.js';

const PORT = 5203;
const PHONES = 5;
let pass = 0, fail = 0;
const t = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); }
  return !!c;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function open(url) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const msgs = [];
    const box = {
      ws, msgs, welcome: null,
      send: (o) => ws.send(JSON.stringify(o)),
      close: () => ws.close(),
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      msgs.push(m);
      if (m.t === 'welcome' || m.t === 'full') { box.welcome = m; resolve(box); }
    };
    ws.onerror = () => resolve(box);
    setTimeout(() => resolve(box), 1500);
  });
}
const last = (box, type) => [...box.msgs].reverse().find((m) => m.t === type);

const srv = startServer({ port: PORT, count: 8, castSeed: 21, worldSeed: 3, code: 'sb' });
await sleep(120);

/** A live room on this server: one television, `PHONES` handsets, cast dealt, sitting on CASTING. */
async function liveRoom(code) {
  const base = `ws://localhost:${PORT}/?room=${code}`;
  const tv = await open(`${base}&host=1`);
  const phones = [];
  for (let i = 0; i < PHONES; i++) phones.push(await open(base));
  await sleep(90);
  tv.send({ t: 'start' });
  await sleep(50);
  tv.send({ t: 'casting' });
  await sleep(70);
  return { room: srv.rooms.get(code), tv, phones, close: () => { for (const c of [tv, ...phones]) c.close(); } };
}

/**
 * The ONE reading both arms are judged by. Returns facts, never verdicts, so the control cannot
 * drift away from the claim it is the control for.
 */
function measure(r) {
  return {
    beat: r.room.show,
    toldTV: last(r.tv, 'show')?.beat ?? null,
    toldPhone: last(r.phones[0], 'show')?.beat ?? null,
    phase: r.room.game.state.phase,
    standing: (r.room.game.state.nominations || []).length,
  };
}

/** Put one nomination on the WIRE the way a handset does, and one through the server verb. */
async function nominate(r) {
  const wire = { from: r.phones[0].welcome.playerId, to: r.phones[1].welcome.playerId };
  const verb = { from: r.phones[2].welcome.playerId, to: r.phones[3].welcome.playerId };
  const sent = [];
  r.phones[0].send({ t: 'nominate', target: wire.to });
  sent.push(wire);
  await sleep(120);
  const wireStanding = (r.room.game.state.nominations || [])
    .some((n) => n.nominator === wire.from && n.target === wire.to);
  const fanned = (last(r.phones[4], 'noms')?.standing || [])
    .some((n) => n.nominator === wire.from && n.target === wire.to);
  const result = applyNominate(r.room, verb.from, verb.to);
  sent.push(verb);
  await sleep(60);
  return { sent, wire, verb, wireStanding, fanned, result };
}

const say = (s) => console.log(s);

// ============================================================================ SB0 · ground truth
const A = await liveRoom('sb-ship');
{
  const joined = A.phones.filter((p) => p.welcome?.playerId).length;
  const seated = seatedPlayerIds(A.room).length;
  const living = livingSeatedIds(A.room).length;
  t(`SB0 · ground truth — ${PHONES} handsets hold a playerId and the server seats them`,
    joined === PHONES && seated >= PHONES && living >= PHONES && A.tv.welcome?.isTV === true,
    `joined ${joined}/${PHONES} · seated ${seated} · living ${living} · tv ${A.tv.welcome?.isTV}`);
  t('SB0b · and the room really is where it says it is before the walk starts',
    A.room.show === 'casting' && A.room.game.state.phase === PHASE.CASTING
      && last(A.tv, 'show')?.beat === 'casting',
    `show=${A.room.show} phase=${A.room.game.state.phase} told=${last(A.tv, 'show')?.beat}`);
}

// ================================================================ SB2 · the partition is derived
{
  const doors = [...LIVE_BEAT_DOORS];
  const only = [...SETSHOW_ONLY_BEATS];
  const union = [...doors, ...only].sort().join(',');
  const overlap = doors.filter((b) => only.includes(b));
  t('SB2 · every beat in `show.js` SHOW_BEATS is on exactly one side of the door — a new beat reddens this',
    union === [...SHOW_BEATS].sort().join(',') && overlap.length === 0,
    `doors [${doors.join(' ')}] · setShow-only [${only.join(' ')}] · unclaimed [${SHOW_BEATS.filter((b) => !doors.includes(b) && !only.includes(b)).join(' ') || 'none'}]`);
  const unnamed = doors.filter((b) => !Object.values(PHASE).includes(b.toUpperCase()));
  t('SB2b · and each live-door beat names a real `phases.js` PHASE, so the expected phase is derived not tabulated',
    unnamed.length === 0,
    unnamed.length ? `no PHASE for: ${unnamed.join(', ')}` : doors.map((b) => `${b}->${b.toUpperCase()}`).join(' '));
}

// ==================================================== SB1 · the `]` walk moves BOTH machines
const WALK = ['recap', 'debrief', 'reckoning'];   // party-host DEV_SKIP.casting + nextShowBeat
const walk = [];
for (const beat of WALK) {
  A.tv.send({ t: 'show', beat });
  await sleep(80);
  const m = measure(A);
  walk.push(m);
  say(`       ] -> ${beat.padEnd(10)} room.show=${m.beat.padEnd(10)} TV told=${String(m.toldTV).padEnd(10)} state.phase=${m.phase}`);
}
{
  const agreed = walk.every((m, i) => m.beat === WALK[i] && m.phase === WALK[i].toUpperCase()
    && m.toldTV === WALK[i] && m.toldPhone === WALK[i]);
  t('SB1 · the dev `]` walk casting→recap→debrief→reckoning moves the beat AND the phase at every step',
    agreed && walk.length === WALK.length,
    walk.map((m, i) => `${WALK[i]}:${m.beat}/${m.phase}`).join(' · '));
}

// ================================================== SB3/SB4 · a nomination actually lands
const shipNom = await nominate(A);
const shipAfter = measure(A);
{
  t(`SB3 · ground truth — ${shipNom.sent.length} nominations were actually sent into a live Reckoning`,
    shipNom.sent.length === 2 && shipAfter.beat === 'reckoning',
    `sent ${shipNom.sent.length} · beat ${shipAfter.beat}`);
  t('SB3b · the one sent over the WIRE stands on the server and is fanned to a third phone',
    shipNom.wireStanding && shipNom.fanned && shipAfter.standing === 2,
    `standing ${shipAfter.standing} · onWire ${shipNom.wireStanding} · fanned ${shipNom.fanned}`);
  t('SB4 · and the server verb accepts it rather than refusing with `not reckoning`',
    shipNom.result?.ok === true,
    JSON.stringify(shipNom.result));
}

// ========================================= SB5 · a repeat must not re-enter and wipe the room
{
  const before = A.room.game.state.nominations.length;
  const showsBefore = A.tv.msgs.filter((m) => m.t === 'show').length;
  A.tv.send({ t: 'show', beat: 'reckoning' });
  await sleep(90);
  const after = A.room.game.state.nominations.length;
  const showsAfter = A.tv.msgs.filter((m) => m.t === 'show').length;
  t('SB5 · re-sending the CURRENT beat does not re-run the transition — two standing nominations survive',
    before === 2 && after === 2 && A.room.game.state.phase === PHASE.RECKONING,
    `standing ${before} -> ${after} · phase ${A.room.game.state.phase}`);
  t('SB5b · and the repeat is still BROADCAST — `party-night` N21j needs that stimulus on the wire',
    showsAfter > showsBefore,
    `show messages ${showsBefore} -> ${showsAfter}`);
}

// ============================== SB6 · the beats with no live door do not fabricate one
{
  const E = await liveRoom('sb-exp');
  const pairBefore = JSON.stringify(E.room.game.state.pair);
  E.tv.send({ t: 'show', beat: 'expedition' });
  await sleep(90);
  t('SB6 · "Watch the run" sets the expedition beat and does NOT manufacture an episode',
    E.room.show === 'expedition' && !E.room.game.state.pair?.runner && !E.room.game.state.pair?.guide
      && SETSHOW_ONLY_BEATS.includes('expedition'),
    `show=${E.room.show} pair ${pairBefore} -> ${JSON.stringify(E.room.game.state.pair)}`);
  E.close();
}

// ============================== SB7 · EVERY live-door beat, entered cold, moves the phase
{
  const moved = [];
  for (const beat of LIVE_BEAT_DOORS) {
    const R = await liveRoom(`sb-${beat}`);
    // Park on `lobby` first. `liveRoom` leaves the room on CASTING, and a same-beat send is a
    // re-broadcast by design (SB5) — so without this step the `casting` door was never opened
    // and its row passed for the wrong reason. `lobby` is setShow-only, so it moves the beat
    // off the target without moving the phase, which is exactly the cold start this asserts.
    R.tv.send({ t: 'show', beat: 'lobby' });
    await sleep(60);
    R.tv.send({ t: 'show', beat });
    await sleep(90);
    moved.push({ beat, show: R.room.show, phase: R.room.game.state.phase, told: last(R.phones[0], 'show')?.beat });
    R.close();
  }
  const bad = moved.filter((m) => m.show !== m.beat || m.phase !== m.beat.toUpperCase() || m.told !== m.beat);
  t(`SB7 · all ${LIVE_BEAT_DOORS.length} live-door beats: a t:'show' jump lands the beat, the phase and the phones together`,
    bad.length === 0 && moved.length === LIVE_BEAT_DOORS.length,
    bad.length ? bad.map((m) => `${m.beat}->show=${m.show}/phase=${m.phase}/told=${m.told}`).join(' · ')
      : moved.map((m) => `${m.beat}=${m.phase}`).join(' '));
}

// ================================================================= THE CONTROL ARM
say('\n  ---- control arm · the door as it was: `room.show` moved, the beat re-broadcast, no transition ----');
const C = await liveRoom('sb-ctrl');
{
  // Restore the OLD door exactly. The hand-set `room.show` is what `setShow`'s assignment did;
  // the send that follows carries the beat to the television and every phone, and — because the
  // shipped handler treats a same-beat send as a re-broadcast — runs no transition. If that ever
  // stops being true, SB8 goes red instead of the control silently becoming a second shipped arm.
  C.room.show = 'reckoning';
  C.tv.send({ t: 'show', beat: 'reckoning' });
  await sleep(90);
  const m = measure(C);
  say(`       THE TELEVISION SAYS : ${String(m.toldTV).toUpperCase()}`);
  say(`       EVERY PHONE WAS TOLD: ${String(m.toldPhone).toUpperCase()}`);
  say(`       THE SERVER IS IN    : ${m.phase}`);
  t('SB8 control precondition · the split really is restored — the room is TOLD reckoning while the server is not in it',
    m.beat === 'reckoning' && m.toldTV === 'reckoning' && m.toldPhone === 'reckoning'
      && m.phase !== PHASE.RECKONING,
    `told ${m.toldTV}/${m.toldPhone} · beat ${m.beat} · phase ${m.phase}`);
}
const ctrlNom = await nominate(C);
const ctrlAfter = measure(C);
say(`       applyNominate(${ctrlNom.verb.from} -> ${ctrlNom.verb.to}) => ${JSON.stringify(ctrlNom.result)}`);
say(`       standing nominations after a real wire nominate: ${ctrlAfter.standing}`);
{
  t('SB8b control precondition · nominations were still SENT — the control is not vacuous',
    ctrlNom.sent.length === 2,
    `sent ${ctrlNom.sent.length}`);

  const RED = [
    ['SB1', walk[2].phase === walk[2].beat.toUpperCase(), ctrlAfter.phase === 'RECKONING'],
    ['SB3b', shipNom.wireStanding && shipAfter.standing === 2, ctrlNom.wireStanding && ctrlAfter.standing === 2],
    ['SB4', shipNom.result?.ok === true, ctrlNom.result?.ok === true],
  ];
  for (const [name, green, red] of RED) {
    t(`SB9 control · ${name} is GREEN on the shipped arm and RED when the old door is put back`,
      green === true && red === false,
      `shipped ${green} · control ${red}`);
  }
  t('SB9d control · and the refusal is the one John\'s room would have hit — `not reckoning`, swallowed in silence',
    ctrlNom.result?.ok === false && ctrlNom.result?.why === 'not reckoning' && ctrlAfter.standing === 0,
    `${JSON.stringify(ctrlNom.result)} · standing ${ctrlAfter.standing}`);
}

A.close();
C.close();
await sleep(60);
srv.close();
console.log(`\nshow-beat: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
