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

import { startShow, playerIdOf, seatNoOf, seedFrom } from '../net/party/show.mjs';
import { MAX_PHONES } from '../net/party/lobby.mjs';
import { PHASE } from '../src/party/phases.js';
import { CALL, MOVE_CHOICE } from '../src/party/session.js';
import { ROOMS } from '../src/party/coverage.js';
import { ROOM_LABEL } from '../src/party/captions.js';
import { SCRIPT, cardFor } from '../src/party/roles.js';

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

  /**
   * 🚨 **THE MIDDLE OF THE TELEVISION READ "Into the study_w." AT 44 PIXELS.** Both pages name
   * rooms out loud and neither can import `captions.js` — they are served as text by a server with
   * no bundler — so each carries a copy of ROOM_LABEL, and a copy nobody checks is how a
   * television ends up calling a room something nobody else does. This holds both copies against
   * the bank character for character, and `expedition-wire` E1b holds the bank against the names
   * the level designer gave the spaces. Three files, one set of room names.
   */
  const inlined = (html) => {
    const m = html.match(/const ROOM_LABEL = \{([\s\S]*?)\};/);
    if (!m) return null;
    const out = {};
    for (const [, k, v] of m[1].matchAll(/(\w+)\s*:\s*'([^']*)'/g)) out[k] = v;
    return out;
  };
  const tvLabels = inlined(tvHtml), phLabels = inlined(phoneHtml);
  const same = (a) => a && JSON.stringify(Object.keys(ROOM_LABEL).sort().map((k) => [k, a[k]]))
    === JSON.stringify(Object.keys(ROOM_LABEL).sort().map((k) => [k, ROOM_LABEL[k]]));
  t('X17 · the television and the phone name rooms exactly as the caption bank does',
    same(tvLabels) && same(phLabels),
    tvLabels ? `${Object.values(tvLabels).join(' · ')}` : 'no ROOM_LABEL found in the television page');
  t('X17 control · the comparison would catch a drifted copy',
    !same({ ...ROOM_LABEL, study_w: 'THE STUDY' }) && !same({}),
    'one changed value fails it, and so does an empty table');
  t('X17b · and neither page prints a raw room id where a name belongs',
    !/wing\(\)[^;]*room \|\|/.test(tvHtml) && !/'Into the ' \+ wing/.test(tvHtml)
    && [tvHtml, phoneHtml].every((h) => /ROOM_LABEL\[/.test(h)),
    'wing() resolves through the table on both surfaces');

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

// ---------------------------------------------------------------- X16 · the card says the role
/**
 * 🚨 **THE CARD PRINTED AN OBJECT KEY.** `you.role` is `focusPuller` / `theStatic` /
 * `methodActor` and the phone rendered it raw, while `roles.js`'s `SCRIPT` — a display name and
 * a one-line ability per card — was imported exactly once in the whole product tree, in
 * `reunion.js`, where the import was unused. No matrix row carried the line, so after reading
 * their card a first-time player knew their team and nothing else and all seven good cards said
 * the identical sentence.
 *
 * ⚠️ THE LINE IS `self` AND THAT IS THE HALF WITH TEETH. *"Each episode, learn whether the Hunter
 * noticed the runner by sight or by sound"* names a role as surely as the key does, so X16b
 * sweeps every OTHER socket's whole transcript — the television included — for it.
 */
{
  const truth = sess.truth();
  // What each seat BELIEVES it is. The Glitched is dealt a cover and is never told; their card
  // must be the cover's, in full, or the phone is the second channel `reunion-truth` U2 forbids.
  const believes = new Map(truth.seats.map((x) => [x.id, x.cover ?? x.role]));
  let bad = null;
  for (let i = 0; i < phones.length; i++) {
    const f = phones[i].frames().slice(-1)[0];
    // `cardFor`, not `SCRIPT[...].line` — a card whose holder is not self-aware carries no line,
    // and a gate that read the raw spec would demand the Static be told the one thing their card
    // exists to withhold.
    const want = cardFor(believes.get(playerIdOf(i)));
    if (!f || !f.you) { bad = `phone ${i} has no frame`; break; }
    if (f.you.roleName !== want.name) { bad = `phone ${i}: roleName "${f.you.roleName}" != "${want.name}"`; break; }
    if ((f.you.roleLine ?? null) !== want.line) { bad = `phone ${i}: roleLine is "${f.you.roleLine}"`; break; }
  }
  t('X16 · every phone is told its card\'s display name and the card\'s own line', bad === null,
    bad || phones.map((p, i) => (p.frames().slice(-1)[0] || {}).you?.roleName).join(' · '));

  t('X16 arm · and they are not all the same line, which is what the card said before',
    new Set(phones.map((p) => (p.frames().slice(-1)[0] || {}).you?.roleLine)).size > 1,
    `${new Set(phones.map((p) => (p.frames().slice(-1)[0] || {}).you?.roleLine)).size} distinct lines across eight cards`);

  // 🚨 THE CONTROL. Pick a card only ONE seat believes it holds — a cover can duplicate a real
  // role, so the line has to be unique before "it appears nowhere else" means anything — and
  // sweep every other transcript for its exact words.
  const counts = {};
  for (const id of believes.values()) counts[id] = (counts[id] || 0) + 1;
  const soleSeat = [...believes.entries()].find(([, r]) => counts[r] === 1);
  if (!soleSeat) {
    t('X16b · a line reaches its owner and no other socket', false, 'no uniquely-held card to sweep for');
  } else {
    const owner = seatNoOf(soleSeat[0]);
    const line = SCRIPT[soleSeat[1]].line;   // the SPEC's line — the leak sweep reads ground truth
    const elsewhere = [
      ...phones.map((p, i) => (i === owner ? null : { who: `phone ${i}`, txt: JSON.stringify(p.msgs) })),
      { who: 'the television', txt: JSON.stringify(tv.msgs) },
    ].filter(Boolean).filter((x) => x.txt.includes(line));
    t('X16b · that card\'s line reached its owner and no other socket, television included',
      elsewhere.length === 0 && JSON.stringify(phones[owner].msgs).includes(line),
      elsewhere.length ? `${elsewhere[0].who} also has it` : `"${SCRIPT[soleSeat[1]].name}" is held by one seat and swept for on ${phones.length} others + the TV`);
    t('X16b control · the sweep does find it on the owner, so it is looking for the right string',
      JSON.stringify(phones[owner].msgs).includes(line), `${line.slice(0, 40)}…`);
  }

  t('X16c · the raw key is still on the frame, so X16 is not passing by the field being absent',
    phones.every((p) => typeof (p.frames().slice(-1)[0] || {}).you?.role === 'string'),
    'you.role survives alongside you.roleName — the Reunion and the gates read it');

  const phoneHtml = await (await fetch(`http://127.0.0.1:${PORT}/p`)).text();
  t('X16d · and the page renders the name and the line rather than the key',
    /you\.roleName \|\| you\.role/.test(phoneHtml) && /you\.roleLine/.test(phoneHtml),
    'cardRole reads roleName first; cardSay carries the line');
  t('X16d control · the scan would notice the raw key coming back',
    !/you\.roleName \|\| you\.role/.test("$('cardRole').textContent = you.role || '\u2014';"));
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

// ---------------------------------------------------------------- X11 · the solo traitor
/**
 * 🚨 AT FOUR AND FIVE PLAYERS THERE IS EXACTLY ONE TRAITOR, AND THEIR OWN PHONE TOLD THEM THEY
 * WERE GOOD. `show-phone.html` inferred alignment from `Array.isArray(you.teammates)`. At 6-8 the
 * Production Panel has somebody on it, the array is non-empty and the guess holds. At 4-5 the
 * array is EMPTY, `project()`'s prune legitimately drops it — an empty array carries nothing and
 * shipping one would be a shape that varies with the deal — and the inference collapses to GOOD.
 *
 * `you.alignment` was in the frame the whole time, rowed `self`, unread. This is not a display
 * bug: a player who reads that card plays the entire evening for the other side, and the Reunion
 * is the first they hear of it.
 *
 * ⚠️ IT NEEDS ITS OWN SHOW BECAUSE THE ONE ABOVE HAS EIGHT PHONES IN IT. Every other assertion in
 * this file is about a full table, and a full table is exactly the size at which this bug is
 * invisible.
 */
{
  const s3 = startShow({ port: PORT + 2, code: 'solo', stamp: 1700000000002 });
  await sleep(100);
  const tv3 = await open2(PORT + 2, '?role=tv');
  const five = [];
  for (let i = 0; i < 5; i++) {
    const p = await open2(PORT + 2);
    p.send({ t: 'join', name: `R${i}`, token: null, boot: 500 });
    five.push(p);
  }
  await sleep(250);
  tv3.send({ t: 'start' });
  await sleep(300);

  const truth3 = s3.sessionNow().truth();
  const armed = truth3.evil.length === 1;
  t('X11 arm · five players, and the deck dealt exactly one traitor',
    armed, `${truth3.evil.length} in Production — this bug cannot exist at 6-8`);

  const frames = five[seatNoOf(truth3.evil[0])].frames();
  const f = frames[frames.length - 1] || {};
  const you = f.you || {};
  t('X11 · the sole traitor\'s own frame carries the answer — `you.alignment`',
    you.alignment === 'evil', `you = ${JSON.stringify(you)}`);
  t('X11b · and it carries no `teammates`, because an empty Production Panel is pruned',
    !('teammates' in you), 'the field the page used to read is simply not there');

  const html = await (await fetch(`http://127.0.0.1:${PORT + 2}/p`)).text();
  // Comments name the old expression on purpose, so they come off before the scan — the same
  // trick `live-session` L1 uses on `session.js`.
  const body = html.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  t('X11c · and the card reads that field, inferring alignment from nothing else',
    /you\.alignment\s*===\s*'evil'/.test(body) && !/Array\.isArray\(you\.teammates\)/.test(body),
    'the served page, not a copy of it');

  // 🚨 THE CONTROL IS THE SHIPPED BUG EVALUATED AGAINST THIS EXACT FRAME. If this returned true
  // the frame would not be the trap and X11 would be asserting nothing.
  t('X11 control · the old rule, run on that very frame, hands them the GOOD card',
    Array.isArray(you.teammates) === false && you.alignment === 'evil',
    'Array.isArray(you.teammates) === false while alignment === "evil"');
  t('X11 control · and at eight it did NOT, which is why this survived — the same rule, the full table',
    Array.isArray((phones[seatNoOf(sess.truth().evil[0])].frames().slice(-1)[0] || {}).you?.teammates),
    'two in Production, non-empty array, the guess holds');

  /**
   * 🚨 THE DEBRIEF IS THE PHASE THAT NEEDS THE EVIDENCE AND IT WAS THE ONE PHASE THAT THREW IT
   * AWAY. The whole stage was `big('Talk.', …)`: the outcome, the wing and the pair are on the
   * frame the entire time and rowed `all`, and the television showed them for the twenty seconds
   * of RECAP and then cleared the screen for the seventy-five during which eight people argue.
   * The picture is `progress/storyboard/12-debrief.png`; this is the half that cannot drift.
   */
  const tvHtmlPage = await (await fetch(`http://127.0.0.1:${PORT + 2}/`)).text();
  const tvBody = tvHtmlPage.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const debrief = (tvBody.match(/DEBRIEF:\s*\(\)\s*=>\s*\{[\s\S]*?\n    \},/) || [''])[0];
  t('X14 · the DEBRIEF stage puts the episode\'s public facts back on the screen',
    /expedition/.test(debrief) && /outcome/.test(debrief) && /pair/.test(debrief) && /wing\(\)/.test(debrief),
    `${debrief.length}B of stage reading expedition.outcome, the wing and the pair`);
  t('X14b · and the guide\'s call is still not on it — broadcast §6.9, in either direction',
    !/\.said\b/.test(tvBody) && !/CLEAR|HOLD/.test(debrief),
    'the frame does not carry it and no page reads a `.said` anywhere');
  t('X14 control · the stage really is more than the line it used to be',
    debrief.length > 400 && !/^DEBRIEF: \(\) => big\('Talk\.'/.test(debrief),
    'a one-line `big()` would be under 100B');

  /**
   * 🚨 A KEYBOARD ON EIGHT PHONES FOR THE WHOLE ARGUMENT. `DARK` covers RECAP, EXECUTION and
   * VERDICT — 20 s, 20 s and 15 s — and DEBRIEF fell through the bottom of `controls()` to the
   * claim plate, which was a text input and a Publish button, for seventy-five seconds. The
   * comment directly above `DARK` condemns exactly that: it hands a guide idle seconds holding a
   * PRODUCIBLE alibi, composed rather than said. Round §1's phase table gives DEBRIEF
   * *"claims/nameplates only"* and §2.5's cheap v1 is *"presets only, publish on tap, no drafts"*.
   */
  const phoneSrc = await (await fetch(`http://127.0.0.1:${PORT + 2}/p`)).text();
  const phoneBody = phoneSrc.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const inputs = (phoneSrc.match(/<input\b/g) || []).length;
  t('X15 · the claim plate is taps, not typing — one text field on the page and it is the name box',
    inputs === 1 && /id="name"/.test(phoneSrc) && !/id="claim"/.test(phoneSrc),
    `${inputs} <input> in the whole page`);

  const presets = (phoneBody.match(/const CLAIMS = \[([^\]]*)\]/) || [, ''])[1]
    .split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
  const goodNames = Object.values(SCRIPT).filter((r) => r.alignment === 'good').map((r) => r.name);
  t('X15b · and every preset is a card the script actually deals, by its shipped display name',
    presets.length > 0 && presets.every((c) => goodNames.includes(c)),
    `${presets.length} presets · ${presets.filter((c) => !goodNames.includes(c)).join(', ') || 'all in SCRIPT'}`);
  t('X15b control · the drift check would notice a preset the script has no card for',
    !['Sound Guy'].every((c) => goodNames.includes(c)), 'a claim the room cannot check is not a claim');

  /**
   * 🚨 THIS ASSERTION USED TO PIN A LINE OF SOURCE AND IT FAILED ITS OWN AUTHOR. It was
   * `/if \(p === 'PREMIERE'\) \{ box\.innerHTML = premiereCard\(\)/` — the exact shape of one
   * statement — and it went red the moment `mount()` landed, the build-once/update-after helper
   * that stopped the guide's CLEAR/HOLD buttons being destroyed and rebuilt 450 times an
   * expedition. The property it names was preserved and improved; only the wording moved.
   *
   * A gate that pins a shape blocks the fix and calls it a regression. Pin the ROUTING: the
   * PREMIERE branch reaches the card and never the plate, however it is spelled.
   */
  const premiereRoutes = (src) => {
    const branch = src.match(/if \(p === 'PREMIERE'\)[^\n]*/);
    return !!branch && /premiereCard/.test(branch[0]) && !/claimCard/.test(branch[0]);
  };
  t('X15c · PREMIERE routes to the role card, and never to the claim plate',
    premiereRoutes(phoneBody),
    (phoneBody.match(/if \(p === 'PREMIERE'\)[^\n]*/) || ['no PREMIERE branch in controls()'])[0].trim());

  // The control edits the SHIPPED text — the regression as it actually read — and runs the same
  // predicate over it. The arm proves the edit landed, because a splice that silently misses
  // makes a control pass for the one reason it must never pass.
  const fellThrough = phoneBody.replace(/if \(p === 'PREMIERE'\)[^\n]*/,
    "if (p === 'PREMIERE') return mount('claim', claimCard, wireClaim);");
  t('X15c control arm · the fallthrough really was spliced into the shipped text',
    fellThrough !== phoneBody && /PREMIERE'\) return mount\('claim'/.test(fellThrough),
    'a control that fails to apply proves nothing');
  t('X15c control · the same predicate, on a PREMIERE that reaches the plate again',
    !premiereRoutes(fellThrough),
    'the predicate is what catches it, not the wording');

  const noNameBox = phoneSrc.replace('id="name"', 'id="claim"');
  t('X15 control arm · the claim field really was spliced back in', /id="claim"/.test(noNameBox));
  t('X15 control · the scan notices a claim text field coming back',
    !(((noNameBox.match(/<input\b/g) || []).length === 1)
      && /id="name"/.test(noNameBox) && !/id="claim"/.test(noNameBox)),
    'X15 re-run over a page carrying a claim box');

  t('X11d · the word is spelled out on the card, never colour alone — §2.3 and §6',
    /You are PRODUCTION/.test(body) && /You are GOOD/.test(body),
    'a red glyph on a black card in a dark lounge is a hint, not a message');

  for (const p of five) p.close();
  tv3.close();
  await s3.close();
}

// ---------------------------------------------------------------- X12 · phantom seats
/**
 * 🚨 **THE COUNT THAT STARTS THE SHOW WAS THE COUNT OF SEATS EVER OPENED, NOT OF PEOPLE PRESENT.**
 *
 * `seatDrop` marks a seat dead and keeps it, which is right — the token still buys it back. But
 * `begin()` read `lobby.seats.size`, so eight joins and three closed browsers dealt EIGHT roles,
 * some of them to phones that were not in the room, and set the execution threshold at
 * `floor(8/2)+1 = 5` of the five people actually voting. Unanimity, for ever, in a game whose
 * third act is a vote. The television printed the LIVE count the whole time, so the screen and
 * the session disagreed about how many people were playing and neither of them said so.
 *
 * This is the only gate that can see it: `live-session` is handed a `count` and `party-isolation`
 * never opens a lobby. It takes nine real sockets and a host pressing START.
 */
{
  const s4 = startShow({ port: PORT + 3, code: 'ghst', stamp: 1700000003000 });
  await sleep(140);
  const tv4 = await open2(PORT + 3, '?role=tv');
  await sleep(60);
  const eight = [];
  for (let i = 0; i < 8; i++) {
    const p = await open2(PORT + 3);
    p.send({ t: 'join', name: `Ghost ${i + 1}`, token: null, boot: 700 });
    eight.push(p);
  }
  await sleep(220);
  const tokens = eight.map((p) => (p.of('seated')[0] || {}).token);
  t('X12 arm · eight phones seated, and three of them then close the browser',
    s4.lobby.seats.size === 8 && tokens.every(Boolean), `${s4.lobby.seats.size} seats`);

  // Seats 1, 4 and 6 go home. Not the last three — a hole in the middle is what breaks the
  // seat→playerId bridge, and taking the tail would let a renumbering bug pass by luck.
  for (const i of [1, 4, 6]) eight[i].close();
  await sleep(220);
  const liveBefore = [...s4.lobby.seats.values()].filter((x) => x.live).length;
  t('X12b arm · the server saw all three drops and the roster is down to five live',
    liveBefore === 5 && s4.lobby.seats.size === 8,
    `${liveBefore} live of ${s4.lobby.seats.size} seats — the phantoms are still on the books`);

  tv4.send({ t: 'start' });
  await sleep(300);
  const sess4 = s4.sessionNow();
  const st4 = sess4.state;

  t('X12 · the show is cast for the people in the room, not for everyone who ever joined',
    st4.players.length === 5, `${st4.players.length} players dealt · ${liveBefore} phones present`);
  t('X12b · so the execution threshold is a real majority rather than unanimity',
    Math.floor(st4.players.length / 2) + 1 === 3,
    `${Math.floor(st4.players.length / 2) + 1} of ${st4.players.length} — it was 5 of 5`);
  t('X12c · the seats closed up, so every chair maps to a role the deal actually made',
    [...s4.lobby.seats.values()].map((x) => x.seat).sort((a, b) => a - b).join(',') === '0,1,2,3,4'
      && [...s4.lobby.seats.values()].every((x) => st4.players.some((pl) => pl.id === playerIdOf(x.seat))),
    'no hole at seat 1, 4 or 6 pointing at a p6/p7/p8 nobody dealt');
  t('X12d · and the screen agrees with the session — the TV\'s roster is the same five',
    (tv4.of('roster').slice(-1)[0]?.players || []).length === 5,
    `${(tv4.of('roster').slice(-1)[0]?.players || []).length} on the rail`);

  // 🚨 THE RENUMBERED PHONES ARE TOLD. A phone still holding its old index reads somebody else's
  // name and colour off every later roster.
  const survivors = [0, 2, 3, 5, 7].map((i) => eight[i]);
  t('X12e · every surviving phone was re-seated with its new index and its own token',
    survivors.every((p, k) => {
      const last = p.of('seated').slice(-1)[0];
      return last && last.seat === k && last.token === tokens[[0, 2, 3, 5, 7][k]];
    }),
    survivors.map((p) => p.of('seated').slice(-1)[0]?.seat).join(','));
  t('X12f · and each of them is receiving frames for the chair it is actually in',
    survivors.every((p, k) => {
      const f = p.frames().slice(-1)[0];
      return f && f.you && f.you.id === playerIdOf(k);
    }), survivors.map((p) => p.frames().slice(-1)[0]?.you?.id).join(','));

  // 🚨 THE CONTROL IS THE SHIPPED COUNT, TAKEN FROM THIS EXACT LOBBY. `lobby.seats.size` after the
  // freeze is 5; what the bug read was the number of seats ever opened, which the log still has.
  const everJoined = s4.lobby.events.filter((e) => e.type === 'seat.joined').length;
  t('X12 control · the old count, read off this very lobby, would have dealt eight',
    everJoined === 8 && everJoined !== st4.players.length,
    `${everJoined} seats ever opened vs ${st4.players.length} people in the room`);
  t('X12 control · and its threshold would have needed every living voter, every time',
    Math.floor(everJoined / 2) + 1 >= liveBefore && Math.floor(st4.players.length / 2) + 1 < liveBefore,
    `${Math.floor(everJoined / 2) + 1} votes from ${liveBefore} phones is unanimity; `
    + `${Math.floor(st4.players.length / 2) + 1} of ${liveBefore} is a majority`);

  // ---------------------------------------------------------------- X13 · the latecomer
  /**
   * The same area, and the cheaper half: a phone that arrives after the bell used to be SEATED —
   * `catchUp` then found no session socket for it, returned silently, and it sat on a black screen
   * refusing every tap with "not in this show". A closed door with a reason on it is the honest
   * answer; the alternative is re-dealing the cast mid-episode, which changes everybody's role.
   */
  const late = await open2(PORT + 3);
  late.send({ t: 'join', name: 'Latecomer', token: null, boot: 500 });
  await sleep(220);
  t('X13 · a phone that arrives after the bell is refused, with a reason it can display',
    !late.of('seated').length && late.of('late').length === 1
      && typeof late.of('late')[0].why === 'string' && late.of('late')[0].why.length > 8,
    JSON.stringify(late.of('late')[0] || null));
  t('X13b · and it took no seat, so the show it could not join is not disturbed by it',
    s4.lobby.seats.size === 5 && s4.sessionNow().state.players.length === 5,
    `${s4.lobby.seats.size} seats after the knock`);
  t('X13 control · the refusal is a black screen otherwise — a seated latecomer gets no frame',
    !late.frames().length, 'zero frames, which is exactly what being seated would have given it');

  // 🚨 AND THE RECLAIM STILL WORKS, WHICH IS THE HALF THAT MUST NOT REGRESS. A phone that locks
  // AFTER the bell owns a chair with a role on it. `join-spike` J3 covers the lobby; this covers
  // the show, where the token buys an alignment.
  const relockSeat = 3;
  const relockToken = survivors[relockSeat].of('seated').slice(-1)[0].token;
  const wasRole = survivors[relockSeat].frames().slice(-1)[0].you.role;
  survivors[relockSeat].close();
  await sleep(180);
  const back = await open2(PORT + 3);
  back.send({ t: 'join', name: 'Impostor', token: relockToken, boot: 40 });
  await sleep(260);
  t('X13c · a phone that locks after the bell still comes back to its own chair and its own card',
    back.of('seated').length === 1 && back.of('seated')[0].seat === relockSeat
      && back.frames().slice(-1)[0]?.you?.role === wasRole,
    `seat ${back.of('seated')[0]?.seat} · role unchanged`);
  t('X13c control · and it was refused nothing — the token is what separates it from a latecomer',
    !back.of('late').length && !back.of('full').length);

  for (const p of eight) p.close();
  late.close(); back.close(); tv4.close();
  await s4.close();
}

function open2(port, query = '') {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/${query}`);
    const msgs = [];
    const box = { ws, msgs, send: (o) => ws.send(JSON.stringify(o)),
      of: (type) => msgs.filter((m) => m.t === type),
      frames: () => msgs.filter((m) => m.t === 'state').map((m) => m.frame),
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
