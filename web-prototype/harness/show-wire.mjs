#!/usr/bin/env node
/**
 * 📡 **show-wire — A WHOLE GAME OVER NINE REAL SOCKETS, AND THE TELEVISION IS TOLD NOTHING.**
 *
 *   node harness/show-wire.mjs
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT ONLY THIS FILE CAN CATCH
 * ---------------------------------------------------------------------------------------------
 * `live-session` drives `session.js` with an injected transport, which is the right way to test a
 * loop. `party-isolation` proves the projection against the matrix. Neither of them can catch a
 * server that does the projection correctly and then **sends it down the wrong socket** — and
 * that is the mistake this repo has actually made before:
 *
 *   · `net/server.mjs` L114-120 — the entire wire is `broadcast()`
 *   · `net/server.mjs` L335-336 — `welcome` hands every joiner every peer's state
 *   · `cuddle-wars-3d/server/relay.js` — forwards every frame to every peer in the room
 *
 * 🚨 THE TELEVISION IS THE ADVERSARY HERE. Eight people are looking at it and at least one of them
 * is holding a phone camera. Every assertion about the TV below is scoped to the WHOLE transcript
 * it received — not a sampled frame — because a single leaked frame in a forty-minute show is
 * still the game.
 *
 * ⚠️ THE PHASE CLOCK IS SKIPPED, NOT WAITED OUT. A premiere is 150 real seconds; the host's skip
 * runs the same `advance()` a deadline does, so the resolutions asserted here are the shipped
 * ones and the gate takes four seconds instead of half an hour.
 */

import { startShow, playerIdOf, seedFrom } from '../net/party/show.mjs';
import { MAX_PHONES } from '../net/party/lobby.mjs';
import { PHASE } from '../src/party/phases.js';
import { CALL, MOVE_CHOICE } from '../src/party/session.js';
import { ROOMS } from '../src/party/coverage.js';

const PORT = 5195;
let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 🚨 A PAGE WITH A SYNTAX ERROR SERVES A CHEERFUL 200 AND RENDERS A BLANK SCREEN. There is no
 * bundler in front of these files and no test runner behind them, so the only thing between a
 * stray bracket and a silent television is this: parse the inline script the way a browser
 * would. It does not RUN — `new Function` compiles and throws on bad syntax without touching a
 * DOM that does not exist here.
 */
function parses(html) {
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) return { ok: false, why: 'no inline script found' };
  try { new Function(m[1]); return { ok: true, bytes: m[1].length }; }
  catch (e) { return { ok: false, why: e.message }; }
}


function open(query = '') {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/${query}`);
    const msgs = [];
    const box = {
      ws, msgs,
      send: (o) => ws.send(JSON.stringify(o)),
      act: (msg) => ws.send(JSON.stringify({ t: 'act', msg })),
      of: (type) => msgs.filter((m) => m.t === type),
      last: (type) => [...msgs].reverse().find((m) => m.t === type),
      frames: () => msgs.filter((m) => m.t === 'state').map((m) => m.frame),
      events: () => msgs.filter((m) => m.t === 'event').map((m) => m.ev),
      close: () => { try { ws.close(); } catch { /* gone */ } },
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      msgs.push(m);
      if (m.t === 'ping') box.send({ t: 'pong', at: m.at });
    };
    ws.onopen = () => resolve(box);
    ws.onerror = () => resolve(box);
  });
}

const show = startShow({ port: PORT, code: 'wire', stamp: 1700000000000 });
await sleep(120);

// ---------------------------------------------------------------- X0 · the pages
{
  const [tvPage, phonePage, nope] = await Promise.all([
    fetch(`http://127.0.0.1:${PORT}/`), fetch(`http://127.0.0.1:${PORT}/p`), fetch(`http://127.0.0.1:${PORT}/x`),
  ]);
  const tvHtml = await tvPage.text(), phoneHtml = await phonePage.text();
  t('X0 arm · both pages are on disk and served, not 500s from a missing file',
    tvPage.status === 200 && phonePage.status === 200 && tvHtml.length > 2000 && phoneHtml.length > 2000,
    `tv ${tvHtml.length}B · phone ${phoneHtml.length}B`);
  t('X0b control · an unknown path is refused, so X0 reads routes rather than a catch-all', nope.status === 404);
  const tvJs = parses(tvHtml), phJs = parses(phoneHtml);
  t('X0d · both inline scripts parse — a blank television is a 200, not a 500',
    tvJs.ok && phJs.ok, tvJs.ok && phJs.ok ? `tv ${tvJs.bytes}B · phone ${phJs.bytes}B of script`
      : `tv: ${tvJs.why || 'ok'} · phone: ${phJs.why || 'ok'}`);
  t('X0d control · the same check rejects a script that does not parse',
    parses('<script>function (</script>').ok === false, parses('<script>function (</script>').why);

  t('X0c · the television page has no token and no alignment anywhere in it',
    !/token/i.test(tvHtml) && !/\bevil\b/i.test(tvHtml.replace(/--evil:[^;]*;/g, '')),
    'nothing to render a secret into, even by mistake');
}

// ---------------------------------------------------------------- seat everybody
const tv = await open('?role=tv');
await sleep(60);
const phones = [];
for (let i = 0; i < MAX_PHONES; i++) {
  const p = await open();
  p.send({ t: 'join', name: `Robot ${i + 1}`, token: null, boot: 900 + i * 100, ua: 'gate/1.0' });
  phones.push(p);
}
await sleep(200);
t('X1 arm · eight phones seated and the television is watching',
  phones.every((p) => p.last('seated')) && show.lobby.seats.size === MAX_PHONES,
  `${show.lobby.seats.size} seats`);

// ---------------------------------------------------------------- X2 · roll
tv.send({ t: 'start' });
await sleep(200);
const sess = show.sessionNow();
t('X2 arm · the show rolled and every socket got a projected frame',
  !!sess && sess.state.phase === PHASE.PREMIERE
  && tv.frames().length > 0 && phones.every((p) => p.frames().length > 0),
  `${sess?.state.phase} · tv ${tv.frames().length} frames`);

t('X2b · the seeds were derived, never sent, and are reproducible from the room code',
  show.lobby.events.some((e) => e.type === 'show.started' && e.castSeed === seedFrom('wire', 'cast', 1700000000000, 8))
  && !JSON.stringify([...tv.msgs, ...phones.flatMap((p) => p.msgs)]).includes('castSeed'),
  'derived from code+stamp+count, printed in the report, on no wire');

// ---------------------------------------------------------------- play the whole show
/** Everyone taps sensibly, then the host skips the clock forward. */
async function step() {
  const s = show.sessionNow();
  const st = s.state;
  const aliveSeats = st.players.filter((p) => p.alive).map((p) => p.seat);
  if (st.phase === PHASE.CASTING) {
    for (const seat of aliveSeats) {
      const r = aliveSeats[(aliveSeats.indexOf(seat) + 1) % aliveSeats.length];
      const g = aliveSeats[(aliveSeats.indexOf(seat) + 2) % aliveSeats.length];
      phones[seat].act({ t: 'cast', runner: playerIdOf(r), guide: playerIdOf(g) });
    }
  }
  if (st.phase === PHASE.EXPEDITION) {
    const gSeat = Number(st.pair.guide.slice(1)) - 1, rSeat = Number(st.pair.runner.slice(1)) - 1;
    phones[gSeat].act({ t: 'call', call: CALL.CLEAR });
    await sleep(60);
    phones[rSeat].act({ t: 'move', move: MOVE_CHOICE.GO });
  }
  if (st.phase === PHASE.RECKONING) phones[aliveSeats[0]].act({ t: 'nominate', target: playerIdOf(aliveSeats[1]) });
  if (st.phase === PHASE.VOTE) for (const seat of aliveSeats) phones[seat].act({ t: 'vote', choice: playerIdOf(aliveSeats[1]) });
  if (st.phase === PHASE.PREMIERE) phones[0].act({ t: 'claim', claim: 'camera op' });
  await sleep(70);
  tv.send({ t: 'skip' });
  await sleep(70);
}

let dropped = null;
for (let i = 0; i < 60 && show.sessionNow().state.phase !== PHASE.REUNION; i++) {
  // 🚨 SOMEBODY'S SCREEN LOCKS MID-EPISODE. This is the moment `net/server.mjs` L335-336 would
  // hand them everybody's state, so it happens inside the run rather than as a tidy epilogue.
  if (i === 6 && !dropped) {
    dropped = { seat: 5, token: phones[5].last('seated').token, before: phones[5].events().length };
    phones[5].close();
    await sleep(120);
  }
  if (i === 9 && dropped && !dropped.back) {
    const back = await open();
    back.send({ t: 'join', name: 'Impostor', token: dropped.token, boot: 30 });
    await sleep(200);
    dropped.back = back;
    phones[5] = back;
  }
  await step();
}
await sleep(200);
const finalState = show.sessionNow().state;
t('X3 arm · the show played to the Reunion over real sockets',
  finalState.phase === PHASE.REUNION && finalState.outcome != null,
  `${finalState.episode - 1} episodes · ${finalState.outcome}`);

// ---------------------------------------------------------------- X4 · the television knows nothing
{
  const wire = JSON.stringify(tv.msgs.filter((m) => m.t !== 'reunion'));
  const truth = sess.truth();
  const roles = [...new Set(truth.seats.map((s) => s.role))];
  const leakedRole = roles.filter((r) => wire.includes(`"${r}"`));
  t('X4 · not one role name reached the television before the Reunion',
    leakedRole.length === 0, leakedRole.join(', ') || `${roles.length} role names, ${tv.msgs.length} frames scanned`);
  t('X4b · nor an alignment, nor a token, nor a `you` block',
    !/"(evil|good)"/.test(wire) && !/token/i.test(wire) && !tv.frames().some((f) => f && f.you),
    'the TV is not a player and is given nothing a player has');
  t('X4c · nor the Hunter\'s room, which is what the guide is paid to know',
    !tv.frames().some((f) => f && f.flyover), 'no flyover on any TV frame — party-loop.md\'s "Do not"');
  const flyovers = phones.reduce((a, p) => a + p.frames().filter((f) => f && f.flyover).length, 0);
  t('X4c arm · a PHONE did get one, so X4c is a difference rather than a map nobody ever draws',
    flyovers > 0, `${flyovers} guide frames carried a flyover`);
  const roomLeak = ROOMS.filter((r) => tv.frames().some((f) => f && f.flyover && f.flyover.room === r));
  t('X4d · and no room name reached the TV through any other door', roomLeak.length === 0);
  t('X4 control · the same scan finds all of it in the Reunion message, so X4 can see a role',
    roles.some((r) => JSON.stringify(tv.of('reunion')).includes(`"${r}"`)),
    'the filter comes off exactly once, at the end');
}

// ---------------------------------------------------------------- X5 · one card each
{
  const truth = sess.truth();
  const seatOf = new Map(truth.seats.map((s) => [s.id, s]));
  let bad = null, evilGotPanel = 0, goodGotPanel = 0;
  for (let i = 0; i < phones.length; i++) {
    const mineId = playerIdOf(i);
    const evs = phones[i].events();
    const cards = evs.filter((e) => e.type === 'role.card');
    if (cards.some((e) => e.for !== mineId)) bad = `phone ${i} got somebody else's card`;
    if (!cards.length) bad = `phone ${i} never got a card`;
    const panels = evs.filter((e) => e.type === 'production.panel');
    if (panels.some((e) => e.for !== mineId)) bad = `phone ${i} got somebody else's Production Panel`;
    if (panels.length) (seatOf.get(mineId).alignment === 'evil' ? evilGotPanel++ : goodGotPanel++);
    if (evs.some((e) => e.vis === 'SEALED')) bad = `phone ${i} got a SEALED entry over the wire`;
  }
  t('X5 · every phone got its own card and nobody else\'s', bad === null, bad || '8 cards, 8 owners');
  t('X5b · the Production Panel reached the evil phones and only those',
    goodGotPanel === 0 && evilGotPanel === truth.evil.length,
    `${evilGotPanel} evil got one · ${goodGotPanel} good did`);
  t('X5 control · there WERE evil players, so X5b is not passing on an empty set',
    truth.evil.length >= 2, `${truth.evil.length} in Production`);
}

// ---------------------------------------------------------------- X6 · coming back
{
  const back = dropped.back;
  const seated = back.last('seated');
  t('X6 · a phone that dropped mid-episode reclaimed its own seat, not the payload it claimed',
    seated && seated.seat === 5 && seated.name === 'Robot 6',
    seated ? `seat ${seated.seat} "${seated.name}"` : 'never seated');

  const replay = back.msgs.filter((m) => m.t === 'event' && m.replay);
  const mineId = playerIdOf(5);
  const mineAlign = sess.truth().seats.find((s) => s.id === mineId).alignment;
  const clean = replay.every((m) => {
    const e = m.ev;
    if (e.vis === 'SEALED') return false;
    if (e.for && e.for !== mineId) return false;
    if (e.vis === 'EVIL' && mineAlign !== 'evil') return false;
    return true;
  });
  t('X6b · the catch-up is the same filter applied to history, not a snapshot',
    replay.length > 0 && clean,
    `${replay.length} replayed entries · net/server.mjs L335-336 is the leak this refuses`);
  t('X6c · and it was handed a live frame rather than left on a blank screen',
    back.frames().some((f) => f && f.phase), `${back.frames().length} frames after resuming`);
}

// ---------------------------------------------------------------- X7 · refusals come home
{
  const victim = phones[0];
  const before = victim.of('refused').length;
  victim.act({ t: 'vote', choice: 'p1' });          // the vote is long closed
  victim.act({ t: 'nonsense' });
  await sleep(150);
  const got = victim.of('refused').slice(before);
  t('X7 · a refused tap comes back to the phone that sent it, with a reason',
    got.length === 2 && got.every((r) => typeof r.why === 'string' && r.why.length > 3),
    got.map((r) => `"${r.why}"`).join(' · '));
  t('X7 control · nobody else was told about it',
    phones.slice(1).every((p) => p.of('refused').length === 0) && tv.of('refused').length === 0,
    'a refusal is between one phone and the server');
}

// ---------------------------------------------------------------- X10 · the mansion's socket
/**
 * 🚨 THE SIMULATOR IS A CONNECTION WITH NO IDENTITY, AND THAT IS THE ENTIRE SAFETY ARGUMENT FOR
 * LETTING IT MOVE A ROBOT. `role=sim` gets a wing, a camera count, a seed and an episode number.
 * It has no seat, no token, no `you` block and no roster — so a 3D client that is one day
 * rewritten, or run on somebody's laptop across the room, has nothing to leak however careless it
 * is. Everything it may send is checked by `session.simReport`, which takes numbers and an
 * outcome and refuses the rest.
 */
{
  const s3 = startShow({ port: PORT + 2, code: 'house', stamp: 1700000000002 });
  await sleep(100);
  const tv3 = await open2(PORT + 2, '?role=tv');
  const ph3 = [];
  for (let i = 0; i < 5; i++) {
    const p = await open2(PORT + 2);
    p.send({ t: 'join', name: `R${i}`, token: null, boot: 500 });
    ph3.push(p);
  }
  await sleep(200);
  const sim = await open2(PORT + 2, '?role=sim');
  await sleep(100);
  tv3.send({ t: 'start' });
  await sleep(200);
  const sess3 = s3.sessionNow();
  sess3.skip(Date.now());                       // PREMIERE → CASTING
  await sleep(150);
  sess3.skip(Date.now());                       // CASTING → EXPEDITION
  await sleep(250);

  const brief = [...sim.msgs].reverse().find((m) => m.t === 'brief');
  t('X10 arm · the simulator was briefed when the expedition opened',
    !!brief && typeof brief.wing === 'string', JSON.stringify(brief));
  t('X10 · the brief is a wing, a camera count, a seed and an episode — and nothing else',
    brief && Object.keys(brief).sort().join(',') === 'cameras,episode,t,wing,worldSeed',
    Object.keys(brief || {}).join(','));
  t('X10b · the simulator has no seat, no token and no `you` block on its whole wire',
    !/token/i.test(JSON.stringify(sim.msgs)) && !sim.msgs.some((m) => m.t === 'seated' || m.frame?.you),
    `${sim.msgs.length} frames scanned`);

  // ---- the report goes in
  sim.send({ t: 'sim', runner: { x: 3, z: -12, room: 'study_w', noise: 0.4 },
    hunter: { x: 8, z: -20, room: 'study_e', wallDist: 5.5, state: 'PATROL' } });
  await sleep(150);
  t('X10c · a position report reached the session', s3.sessionNow().wired() === true);

  // ---- the stick
  const st = sess3.state;
  const runnerSeat = Number(st.pair.runner.slice(1)) - 1;
  const otherSeat = ph3.findIndex((_, i) => i !== runnerSeat);
  ph3[otherSeat].send({ t: 'drive', heading: 1.2, detent: 3 });
  await sleep(150);
  const refused = ph3[otherSeat].msgs.filter((m) => m.t === 'refused');
  t('X10d · a phone that is not the runner cannot drive the robot',
    refused.some((r) => /not the runner/.test(r.why)), refused.map((r) => r.why).join(' / ') || 'NOT REFUSED');
  const before = sim.msgs.filter((m) => m.t === 'drive').length;
  ph3[runnerSeat].send({ t: 'drive', heading: 1.2, detent: 2 });
  await sleep(150);
  t('X10e · and the runner\'s stick reaches the mansion, relayed rather than applied',
    sim.msgs.filter((m) => m.t === 'drive').length === before + 1,
    'the server has no physics and does not pretend to');

  sim.close(); tv3.close(); for (const p of ph3) p.close();
  await s3.close();
}

// ---------------------------------------------------------------- X8 · the report
{
  const rep = await (await fetch(`http://127.0.0.1:${PORT}/report`)).json();
  t('X8 · after the Reunion the report carries the seeds and the whole log',
    rep.show && rep.show.castSeed && Array.isArray(rep.log) && rep.log.length > 40,
    `${rep.log?.length} entries · outcome ${rep.show?.outcome}`);
  t('X8b · and the connection health the spike taught it to keep',
    rep.seats.length === MAX_PHONES && rep.seats.some((s) => s.drops > 0),
    `${rep.seats.length} seats · ${rep.seats.reduce((a, s) => a + s.drops, 0)} reconnects`);
}

// ---------------------------------------------------------------- X9 · and it withheld it before
{
  // A second, separate show, stopped mid-run — the withholding is only observable while playing.
  const s2 = startShow({ port: PORT + 1, code: 'held', stamp: 1700000000001 });
  await sleep(100);
  const tv2 = await open2(PORT + 1, '?role=tv');
  const ph = [];
  for (let i = 0; i < 4; i++) {
    const p = await open2(PORT + 1);
    p.send({ t: 'join', name: `R${i}`, token: null, boot: 500 });
    ph.push(p);
  }
  await sleep(200);
  tv2.send({ t: 'start' });
  await sleep(200);
  const mid = await (await fetch(`http://127.0.0.1:${PORT + 1}/report`)).json();
  t('X9 · while the show is on the air the report withholds the log — anyone on the wifi can GET it',
    mid.log === undefined && typeof mid.withheld === 'string' && mid.show.phase === PHASE.PREMIERE,
    mid.withheld);
  t('X9b · and it still serves the connection health, which is the half nobody has to hide',
    Array.isArray(mid.seats) && mid.seats.length === 4, `${mid.seats.length} seats`);
  t('X9 control · the finished show above DID serve its log, so X9 is a difference',
    (await (await fetch(`http://127.0.0.1:${PORT}/report`)).json()).log !== undefined);
  for (const p of ph) p.close();
  tv2.close();
  await s2.close();
}

function open2(port, query = '') {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/${query}`);
    const msgs = [];
    const box = { ws, msgs, send: (o) => ws.send(JSON.stringify(o)),
      of: (type) => msgs.filter((m) => m.t === type),
      close: () => { try { ws.close(); } catch { /* gone */ } } };
    ws.onmessage = (e) => { const m = JSON.parse(e.data); msgs.push(m); if (m.t === 'ping') box.send({ t: 'pong', at: m.at }); };
    ws.onopen = () => resolve(box);
    ws.onerror = () => resolve(box);
  });
}

for (const p of phones) p.close();
tv.close();
show.close();
console.log(`\nshow-wire: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
