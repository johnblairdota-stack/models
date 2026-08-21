#!/usr/bin/env node
/**
 * 📡 **party-surface — THE WHOLE OBSERVABLE SURFACE OF A RUNNING SHOW, AND NOTHING IN IT DEALS
 * THE CAST.**
 *
 *   node harness/party-surface.mjs
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 WHY THIS IS A SECOND GATE AND NOT THREE MORE ASSERTIONS IN `party-isolation`
 * ---------------------------------------------------------------------------------------------
 * `party-isolation` I11 walks the frames `createSession` produces and diffs them against the
 * entitlement matrix. That is the right way to test a projection and it is **structurally unable**
 * to see the three fatal holes this file was written for, because none of them is a frame:
 *
 *   · `GET /report` served `castSeed` and `worldSeed` **unconditionally**, four lines above a
 *     notice reading *"the game log is served after the Reunion"*. An HTTP route, not a frame.
 *   · The same two integers were written into `lobby.events` by `note(lobby, 'show.started', …)`,
 *     and `report()` returns `lobby.events` raw. A second copy in the same response.
 *   · The seeds were `seedFrom(code, 'cast'|'world', stamp, count)` — four values that are printed
 *     on the television, listed in every roster, or pinned by `/report`'s own `durationMs`. So
 *     even a perfectly gated field is recoverable by **search over publicly-bounded inputs**.
 *
 * The cheat needs no devtools and no socket: read the address off the television, type it into a
 * phone browser, add `/report`. `dealCast({count, castSeed})` is then every role, both alignments,
 * the Production roster and the Glitched's cover; `pick(6, worldSeed, 'hunter', ep)` is every
 * episode's Hunter room before episode one is cast.
 *
 * So this gate takes the surface a person on the wifi can actually reach — **every HTTP body and
 * every socket a query string can open** — and asserts that nothing in it reconstructs the deal,
 * *including by search*. Two properties, and neither alone is a fix: gating the field without
 * randomising the value leaves the search at 80.4%; randomising without gating leaves the seed on
 * a URL at 100%.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 EVERY CONTROL HERE IS A RUNNING SERVER BUILT OUT OF THE SHIPPED FILE
 * ---------------------------------------------------------------------------------------------
 * `controlOf()` reads `net/party/show.mjs`, applies a named list of text edits that put the defect
 * back, rewrites the relative specifiers so the copy resolves from `harness/`, and **imports and
 * runs it**. The controls below therefore attack a real server over real sockets with the real
 * arithmetic — not a string this file wrote about a server. Each edit throws if it does not apply,
 * and each control ships an *arm* asserting the edit landed, because a control that silently
 * fails to apply proves nothing and reads green.
 *
 * ⚠️ AND EVERY SCAN ARMS ITSELF AGAINST AN EMPTY SET FIRST. A leak scan over a transcript nobody
 * filled is the most comfortable green in this repo. W0 counts the bytes, the frames and the
 * report keys before a single property is asserted about them.
 */

import { readFileSync, writeFileSync, unlinkSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startShow, seedFrom, TICK_MS } from '../net/party/show.mjs';
import { MAX_PHONES } from '../net/party/lobby.mjs';
import { PHASE } from '../src/party/phases.js';
import { dealCast, EVIL } from '../src/party/cast.js';
import { pick } from '../src/party/session.js';
import { WINGS } from '../src/party/houseplan.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PARTY = join(ROOT, 'net', 'party');
const SHOW_SRC = readFileSync(join(PARTY, 'show.mjs'), 'utf8');

const PORT = 5251;          // live show, the shipped code
const CTL_PORT = 5252;      // the control, the defect put back
const PORT2 = 5253;         // a second shipped show, played out to the Reunion

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- the control factory
/**
 * Build a runnable copy of `show.mjs` with the defect edited back in.
 *
 * The three rewrites at the bottom are mechanical: the copy lives in `harness/`, so `'./lobby.mjs'`
 * and `'../../src/…'` have to be re-pointed, and `HERE` — which is how the server finds the two
 * HTML pages it serves — has to keep meaning `net/party`. Nothing else about the file changes.
 */
function controlOf(name, edits) {
  let src = SHOW_SRC;
  const missed = [];
  for (const [from, to] of edits) {
    if (!src.includes(from)) missed.push(from.split('\n')[0].trim().slice(0, 60));
    else src = src.split(from).join(to);
  }
  src = src.replace(/from '\.\//g, `from '${pathToFileURL(PARTY).href}/`)
    .replace(/from '\.\.\/\.\.\/src\//g, `from '${pathToFileURL(join(ROOT, 'src')).href}/`)
    .replace('const HERE = dirname(fileURLToPath(import.meta.url));', `const HERE = ${JSON.stringify(PARTY)};`);
  const path = join(HERE, `.control-${name}.mjs`);
  writeFileSync(path, src);
  return {
    name, path, missed, applied: missed.length === 0 && src !== SHOW_SRC,
    load: () => import(pathToFileURL(path).href),
    rm: () => { try { unlinkSync(path); } catch { /* already gone */ } },
  };
}

// ---------------------------------------------------------------- sockets
function open(port, query = '') {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/${query}`);
    const msgs = [];
    const box = {
      ws, msgs, query,
      send: (o) => { try { ws.send(JSON.stringify(o)); } catch { /* closed */ } },
      of: (type) => msgs.filter((m) => m.t === type),
      text: () => JSON.stringify(msgs),
      close: () => { try { ws.close(); } catch { /* gone */ } },
    };
    box.answers = true;   // a phone that has stopped answering sends nothing at all — no FIN either
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      msgs.push(m);
      if (m.t === 'ping' && box.answers) box.send({ t: 'pong', at: m.at });
    };
    ws.onopen = () => resolve(box);
    ws.onerror = () => resolve(box);
  });
}

const body = async (port, path) => {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  return { path, status: res.status, text: await res.text() };
};

/**
 * Seat a full house on a running server and roll the show. Returns the handle, the transcripts and
 * the HTTP bodies — i.e. everything a person on this wifi could have collected.
 */
async function house(handle, port, { seats = MAX_PHONES, skips = 0 } = {}) {
  await sleep(120);
  const tv = await open(port, '?role=tv');
  const phones = [];
  for (let i = 0; i < seats; i++) {
    const p = await open(port);
    p.send({ t: 'join', name: `R${i + 1}`, token: null, boot: 500 + i });
    phones.push(p);
  }
  await sleep(220);
  tv.send({ t: 'start' });
  await sleep(220);
  for (let i = 0; i < skips; i++) { handle.sessionNow()?.skip(Date.now()); await sleep(30); }
  await sleep(150);
  return { handle, tv, phones };
}

// ================================================================== the live show
const show = startShow({ port: PORT, code: 'surf' });
const live = await house(show, PORT, { skips: 12 });
const sess = show.sessionNow();
const truth = sess.truth();
const CAST_SEED = truth.castSeed;
const WORLD_SEED = sess.state.worldSeed;

/** Everything a phone browser on this wifi can pull out of the running server. */
const bodies = [];
for (const p of ['/', '/p', '/report', '/report?pretty=1', '/x']) bodies.push(await body(PORT, p));
const reportAt = Date.now();
const midReport = JSON.parse(bodies.find((b) => b.path === '/report').text);

/**
 * 🚨 THE WINGS ARE PUBLIC AND THAT IS CORRECT — the room is TOLD which wing the expedition is
 * going to. They are `WINGS[pick(WINGS.length, worldSeed, 'target', episode)]`, so a sequence of
 * them is a sequence of equations in `worldSeed`, and under the old derivation `worldSeed` and
 * `castSeed` came out of the SAME stamp. Three announced wings therefore filter the candidate
 * stamps by about 216× — which is what turned a wide window into a lookup.
 */
const wingsFrom = (phone) => [...new Map(phone.of('event').map((m) => m.ev)
  .filter((ev) => ev.type === 'expedition.announced' || ev.type === 'expedition.begun')
  .map((ev) => [ev.data.episode, { episode: ev.data.episode, room: ev.data.room }])).values()];
const wingsSeen = wingsFrom(live.phones[0]);

/**
 * 🚨 **EVERY SOCKET A QUERY STRING CAN OPEN, NOT JUST THE ONES THE CLIENT CODE OPENS.** This is the
 * other half of "the observable surface": a person on this wifi types the address off the
 * television and can append anything they like to it. `role=sim` was the mansion and `role=tv`
 * was the clock; both were granted on the string alone. These are opened AFTER the real
 * television has claimed the lease, which is the only ordering a party has.
 */
const CLAIMS = ['?role=sim', '?role=tv', '?role=sim&key=deadbeef', '?role=tv&key=deadbeef',
  '?role=SIM', '?role=sim&role=tv'];
const claims = [];
for (const c of CLAIMS) claims.push(await open(PORT, c));
await sleep(200);
for (const c of claims) { c.send({ t: 'join', name: 'CHEAT', boot: 400 }); c.send({ t: 'start' }); }
await sleep(200);

const surface = [
  ...bodies.map((b) => ({ name: `GET ${b.path}`, text: b.text })),
  { name: 'socket ?role=tv', text: live.tv.text() },
  ...live.phones.map((p, i) => ({ name: `socket phone ${i + 1}`, text: p.text() })),
  ...claims.map((c) => ({ name: `socket ${c.query}`, text: c.text() })),
];
const surfaceText = surface.map((s) => s.text).join('\n');

// ---------------------------------------------------------------- W0 · the arm
{
  const frames = live.tv.msgs.length + live.phones.reduce((a, p) => a + p.msgs.length, 0);
  t('W0 arm · every privileged query string an attacker can type was actually opened',
    claims.length === CLAIMS.length && claims.every((c) => c.msgs.length > 0),
    claims.map((c) => `${c.query}→${c.msgs.length}`).join(' '));
  t('W0 arm · the show is on the air, mid-flight, with a full house',
    !!sess && sess.state.phase !== PHASE.REUNION && sess.state.phase !== 'LOBBY'
    && show.lobby.seats.size === MAX_PHONES,
    `${sess?.state.phase} · ${show.lobby.seats.size} seats`);
  t('W0b arm · the surface is not empty — bytes, frames and report keys were all collected',
    surfaceText.length > 20000 && frames > 40 && Object.keys(midReport).length >= 6
    && midReport.seats.length === MAX_PHONES,
    `${surfaceText.length} bytes · ${frames} frames · ${Object.keys(midReport).length} report keys`);
  t('W0c arm · and the two integers it is about are real, distinct and in play',
    Number.isInteger(CAST_SEED) && Number.isInteger(WORLD_SEED) && CAST_SEED !== WORLD_SEED
    && truth.evil.length >= 1 && truth.seats.length === MAX_PHONES,
    `${truth.evil.length} evil of ${truth.seats.length}`);
}

// ---------------------------------------------------------------- the scan
/**
 * 🚨 EVERY NUMBER-SHAPED TOKEN, NOT `includes(String(seed))`. A seed that arrived as a JSON number,
 * as a hex string, inside a longer string, or split across a key and a value is the same seed. The
 * scan pulls every decimal run and every hex run of six or more out of the raw text and compares
 * the SET against the two values — so a leak does not have to be spelled the way this file
 * guessed it would be.
 */
function seedsIn(text) {
  const hits = [];
  const want = new Map([[String(CAST_SEED), 'castSeed'], [String(WORLD_SEED), 'worldSeed'],
    [CAST_SEED.toString(16), 'castSeed(hex)'], [WORLD_SEED.toString(16), 'worldSeed(hex)']]);
  for (const tok of text.match(/[0-9a-fA-F]{4,}/g) || []) {
    const k = want.get(tok) || want.get(tok.toLowerCase());
    if (k) hits.push(`${k} as ${tok}`);
  }
  return hits;
}

// ---------------------------------------------------------------- W1 · nothing carries a seed
{
  const leaks = surface.map((s) => ({ s, hits: seedsIn(s.text) })).filter((x) => x.hits.length);
  t('W1 · no HTTP body and no socket transcript carries either seed, in any spelling',
    leaks.length === 0,
    leaks.length ? leaks.map((x) => `${x.s.name}: ${x.hits[0]}`).join(' / ') : `${surface.length} surfaces clean`);

  t('W1b · and the mid-show `/report` carries no seed field at all, under any name',
    midReport.show && !('castSeed' in midReport.show) && !('worldSeed' in midReport.show)
    && typeof midReport.withheld === 'string',
    `show keys: ${Object.keys(midReport.show).join(',')} · ${midReport.withheld}`);

  /**
   * 🚨 THE SECOND COPY, WHICH IS WHY W1c IS NOT W1b RESTATED. `report()` returns `lobby.events`
   * raw, and `begin()` wrote both seeds into that log. Gating the `show.castSeed` field alone left
   * the same two integers in the same response, four lines further down.
   */
  const started = midReport.events.find((e) => e.type === 'show.started');
  t('W1c · the event log records that the show started and not what it was seeded with',
    !!started && !('castSeed' in started) && !('worldSeed' in started)
    && seedsIn(JSON.stringify(midReport.events)).length === 0,
    `show.started keys: ${started ? Object.keys(started).join(',') : 'MISSING'}`);
}

// ---------------------------------------------------------------- W2 · the search
/**
 * 🚨 **THE ATTACK, RUN FOR REAL.** `stamp` was `Date.now()` inside `startShow`, and `/report` hands
 * out `durationMs = Date.now() - lobby.startedAt` — evaluated a statement later, on the same
 * millisecond the lobby was created. So a fetch at time `T` returning `D` pins the stamp to
 * `T - D`, and a window of a few hundred milliseconds around it is generous. `code` is read off
 * the television transcript and `count` off the roster, because the point of this gate is that
 * both are public: neither is taken from the in-process handle.
 *
 * The attacker's own card filters the survivors — a phone knows the role it was dealt.
 */
function recover({ code, count, centre, window: w, ownRole, ownSeat, wings }) {
  const tried = [];
  const consistent = [];
  for (let stamp = centre - w; stamp <= centre + w; stamp++) {
    const cs = seedFrom(code, 'cast', stamp, count);
    const ws = seedFrom(code, 'world', stamp, count);
    tried.push({ stamp, cs, ws });
    if (dealCast({ count, castSeed: cs }).seats[ownSeat].role !== ownRole) continue;
    if (wings.some((g) => WINGS[pick(WINGS.length, ws, 'target', g.episode)] !== g.room)) continue;
    consistent.push({ stamp, cs, ws });
  }
  return { tried, consistent };
}

/** The traitor pairs a set of surviving candidates admits. There are 28 of them at eight players. */
const pairsOf = (cands, count) => [...new Set(cands.map(({ cs }) =>
  dealCast({ count, castSeed: cs }).seats.filter((x) => x.alignment === EVIL).map((x) => x.seat).join(',')))];

/** What the attacker actually has, read out of the surface rather than out of the process. */
const publicCode = live.tv.of('hello')[0]?.code;
const publicCount = live.phones[0].of('roster').slice(-1)[0]?.players.length;
const attackerSeat = 0;
const attackerRole = truth.seats[attackerSeat].role;

{
  t('W2 arm · the attacker\'s inputs all came off the wire, not out of the server',
    publicCode === 'surf' && publicCount === MAX_PHONES && Number.isFinite(midReport.durationMs)
    && wingsSeen.length >= 3,
    `code=${publicCode} · count=${publicCount} · durationMs=${midReport.durationMs} · wings ${wingsSeen.map((g) => g.room).join('>')}`);

  const centre = reportAt - midReport.durationMs;

  /**
   * The wide sweep first: forget the evidence, and just ask whether either seed is *derivable at
   * all* from the printed values, over a window several thousand times wider than `durationMs`
   * actually leaves open.
   */
  const wide = [];
  for (let stamp = centre - 5000; stamp <= centre + 5000; stamp++) {
    wide.push(seedFrom(publicCode, 'cast', stamp, publicCount), seedFrom(publicCode, 'world', stamp, publicCount));
  }
  t('W2 arm · the wide sweep really enumerated the whole window',
    wide.length === 20002 && new Set(wide).size > 19000,
    `${wide.length} derived integers over ±5000 ms of stamp`);
  t('W2 · neither seed is derivable from the printed values, at any stamp in that window',
    !wide.includes(CAST_SEED) && !wide.includes(WORLD_SEED),
    `castSeed ${CAST_SEED} · worldSeed ${WORLD_SEED} · absent from ${wide.length} derivations`);

  /**
   * Then the search the critic actually ran: candidates that survive the attacker's own card AND
   * every wing the room has been told about. Under the old derivation both seeds came out of one
   * stamp, so a public wing sequence is an equation in the private one.
   */
  const got = recover({ code: publicCode, count: publicCount, centre, window: 100,
    ownRole: attackerRole, ownSeat: attackerSeat, wings: wingsSeen });
  t('W2b arm · the filtered search ran over the whole window with real evidence in hand',
    got.tried.length === 201 && !!attackerRole && wingsSeen.every((g) => typeof g.room === 'string'),
    `${got.tried.length} candidate stamps · ${wingsSeen.length} announced wings · own card ${attackerRole}`);
  /**
   * ⚠️ THE ASSERTION IS "THE SURVIVOR IS NOT THE SEED", NOT "THERE IS NO SURVIVOR". A derived
   * candidate coincidentally matching one card and three wings has probability ~6e-4, so over 201
   * stamps a stray survivor turns up about one run in eight — and a gate that failed on that would
   * be measuring luck. What cannot happen by luck is the true seed appearing in a set of 201
   * derivations of a value that was never derived: that is 201 in 2^32.
   */
  t('W2b · the search recovers nothing — any candidate that survives is a coincidence, not the seed',
    !got.consistent.some((c) => c.cs === CAST_SEED) && !got.tried.some((c) => c.cs === CAST_SEED),
    `${got.consistent.length} of ${got.tried.length} survive the evidence and none of them is castSeed ${CAST_SEED}`);

}

// ---------------------------------------------------------------- W3 · the derivation is dead
/**
 * The D8 property, from `session.js`'s `hash`: the arithmetic is kept for this gate's controls and
 * for nothing else, so no caller may reach it from the shipped path. A source scan, because the
 * failure it prevents is somebody innocently seeding a show with it again next month.
 */
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const callers = (text) => (stripComments(text).match(/seedFrom\s*\(/g) || []).length;
{
  const files = [];
  for (const dir of [PARTY, join(ROOT, 'src', 'party')]) {
    for (const f of readdirSync(dir)) {
      if (!/\.(mjs|js)$/.test(f)) continue;
      files.push({ f, text: readFileSync(join(dir, f), 'utf8') });
    }
  }
  const decl = files.filter((x) => /export function seedFrom/.test(x.text));
  t('W3 arm · the scan is reading the real tree and found the declaration once',
    files.length >= 8 && decl.length === 1 && decl[0].f === 'show.mjs',
    `${files.length} files in net/party + src/party`);
  const calls = files.flatMap((x) => {
    const n = callers(x.text) - (/export function seedFrom/.test(x.text) ? 1 : 0);
    return n > 0 ? [`${x.f}×${n}`] : [];
  });
  t('W3 · nothing in net/party or src/party calls the derivation any more',
    calls.length === 0, calls.join(' ') || 'declared once, called nowhere');
}

// ================================================================== the controls
/**
 * 🚨 **TODAY'S CODE, RUNNING, GOING RED.** One control server carries the whole S1+S2 defect: the
 * seeds derived from the printed values, written into the event log, and served unconditionally.
 * The predicates re-run are the SAME functions — `seedsIn`, `recover`, `callers` — because a
 * control that re-words the check is measuring the wording.
 */
const ctl = controlOf('seeds', [
  ['const castSeed = randomSeed();\n    const worldSeed = randomSeed();',
    "const castSeed = seedFrom(code, 'cast', stamp, count);\n    const worldSeed = seedFrom(code, 'world', stamp, count);"],
  ["note(lobby, 'show.started', { count });", "note(lobby, 'show.started', { count, castSeed, worldSeed });"],
  ['          ...(over ? { castSeed: show.castSeed, worldSeed: show.worldSeed } : {}),',
    '          castSeed: show.castSeed, worldSeed: show.worldSeed,'],
]);

{
  t('W1/W2 control arm · the three edits that put the defect back all applied',
    ctl.applied, ctl.missed.length ? `did not apply: ${ctl.missed.join(' | ')}` : 'derivation, log entry and report field restored');

  const mod = await ctl.load();
  const bad = mod.startShow({ port: CTL_PORT, code: 'surf' });
  const badHouse = await house(bad, CTL_PORT, { skips: 12 });
  const badSess = bad.sessionNow();
  const badTruth = badSess.truth();
  const badRep = await body(CTL_PORT, '/report');
  const badAt = Date.now();
  const rep = JSON.parse(badRep.text);

  t('W1/W2 control arm · the control really is a whole live show, not a stub',
    badSess.state.phase !== 'LOBBY' && bad.lobby.seats.size === MAX_PHONES && rep.seats.length === MAX_PHONES,
    `${badSess.state.phase} · ${rep.seats.length} seats · report ${badRep.text.length} bytes`);

  // The same scan, pointed at the same two values for THAT show.
  const seedsInCtl = (text) => {
    const want = new Map([[String(badTruth.castSeed), 'castSeed'], [String(badSess.state.worldSeed), 'worldSeed']]);
    return (text.match(/[0-9a-fA-F]{4,}/g) || []).filter((tok) => want.has(tok)).map((tok) => want.get(tok));
  };
  t('W1 control · the same scan, on the pre-fix server, finds both seeds in the HTTP body',
    seedsInCtl(badRep.text).length >= 2, `${[...new Set(seedsInCtl(badRep.text))].join(' + ')} served on GET /report`);
  const badStarted = rep.events.find((e) => e.type === 'show.started');
  t('W1c control · and the second copy is in the event log of the same response',
    !!badStarted && 'castSeed' in badStarted && 'worldSeed' in badStarted,
    `show.started keys: ${Object.keys(badStarted || {}).join(',')}`);
  // The same search, over the same public inputs, through the same two functions.
  const badCode = badHouse.tv.of('hello')[0]?.code;
  const badCount = badHouse.phones[0].of('roster').slice(-1)[0]?.players.length;
  const badWings = wingsFrom(badHouse.phones[0]);
  const badCentre = badAt - rep.durationMs;
  const badWide = [];
  for (let stamp = badCentre - 5000; stamp <= badCentre + 5000; stamp++) {
    badWide.push(seedFrom(badCode, 'cast', stamp, badCount), seedFrom(badCode, 'world', stamp, badCount));
  }
  t('W2 control · the same wide sweep derives BOTH of the pre-fix show\'s seeds from its printed values',
    badWide.includes(badTruth.castSeed) && badWide.includes(badSess.state.worldSeed),
    `castSeed ${badTruth.castSeed} and worldSeed ${badSess.state.worldSeed} both fall out of code+stamp+count`);

  const got = recover({ code: badCode, count: badCount, centre: badCentre, window: 100,
    ownRole: badTruth.seats[0].role, ownSeat: 0, wings: badWings });
  const truePair = badTruth.seats.filter((x) => x.alignment === EVIL).map((x) => x.seat).join(',');
  const pairs = pairsOf(got.consistent, badCount);
  t('W2b control arm · the control show announced wings too, so the two searches are one search',
    badWings.length >= 3 && got.tried.length === 201,
    `${badWings.length} announced wings · ${got.tried.length} candidate stamps`);
  t('W2b control · the same filtered search cuts 28 possible traitor pairs to a handful, truth included',
    got.consistent.length >= 1 && pairs.length <= 3 && pairs.includes(truePair),
    `${got.consistent.length} surviving candidates · pairs [${pairs.join('] [')}] · truth [${truePair}]`);
  t('W2b control · and one of the survivors is the exact seed the pre-fix show was dealt from',
    got.consistent.some((c) => c.cs === badTruth.castSeed),
    got.consistent.map((c) => c.cs).join(',') || 'nothing survived');

  t('W3 control · the same caller scan, on a source that seeds a show with it, is not silent',
    callers(ctl.src ?? readFileSync(ctl.path, 'utf8')) > 1,
    `${callers(readFileSync(ctl.path, 'utf8'))} occurrences in the restored file`);

  for (const p of badHouse.phones) p.close();
  badHouse.tv.close();
  await bad.close();
  ctl.rm();
}

// ---------------------------------------------------------------- W5 · the lease
/**
 * 🚨 **`?role=sim` AND `?role=tv` WERE QUERY STRINGS, NOT CREDENTIALS, AND THERE WAS NO KEY
 * ANYWHERE IN THE PROCESS.** `rrr-netplay.md` §2 condemns `net/server.mjs` L298-306's
 * unauthenticated `debug` command — *"that must not survive contact with a phone"* — and this was
 * that command with a different name. §3 says what it should be: *"`hostKey` is generated on the
 * TV and burned into the QR; a phone cannot claim the lease."*
 *
 * Everything below is opened AFTER the real television is already up, which is the only ordering
 * a party has: the address a phone would type is printed by the television.
 */
async function leaseProbe(mod, port, code) {
  const h = mod.startShow({ port, code });
  await sleep(120);
  const tv = await open(port, '?role=tv');
  const phones = [];
  for (let i = 0; i < 5; i++) {
    const p = await open(port);
    p.send({ t: 'join', name: `R${i + 1}`, token: null, boot: 500 + i });
    phones.push(p);
  }
  await sleep(240);
  const tvRosterBefore = tv.of('roster').length;

  /**
   * The cheat arrives in the LOBBY, because that is when a chair can still be had: the version
   * that needs no devtools is one connection that takes a seat before the bell and is the mansion
   * after it. Both claims are opened AFTER the real television, which is the only ordering a
   * party has — the address is printed by the television.
   */
  const cheatSim = await open(port, '?role=sim');
  const cheatTV = await open(port, '?role=tv');
  await sleep(120);
  cheatSim.send({ t: 'join', name: 'CHEAT', token: null, boot: 400 });
  await sleep(150);
  const seatsAtBell = h.lobby.seats.size;

  tv.send({ t: 'start' });
  await sleep(240);
  const sess = h.sessionNow();
  for (let i = 0; i < 12 && sess.state.phase !== PHASE.EXPEDITION; i++) { sess.skip(Date.now()); await sleep(30); }
  await sleep(80);

  // The three things the critic did from an unauthenticated socket, in one go.
  cheatSim.send({ t: 'sim', runner: { x: 1, z: 1, room: 'chapel', noise: 0 },
    hunter: { x: 2, z: 2, room: 'chapel', wallDist: 1 } });
  cheatSim.send({ t: 'expedition', outcome: 'taken' });
  cheatTV.send({ t: 'skip' });
  await sleep(220);
  return { h, tv, phones, sess, cheatSim, cheatTV, tvRosterBefore, seatsAtBell,
    phase: sess.state.phase, wired: sess.wired() };
}

const LEASE_PORT = 5254;
const LEASE_CTL_PORT = 5255;
const lease = await leaseProbe({ startShow }, LEASE_PORT, 'lese');
{
  t('W5 arm · the probe reached a running EXPEDITION with a house and a live television',
    lease.phase === PHASE.EXPEDITION && lease.h.lobby.seats.size >= 5 && lease.tvRosterBefore > 0,
    `${lease.phase} · ${lease.h.lobby.seats.size} seats · ${lease.tvRosterBefore} roster frames on the real TV`);

  t('W5a · the unauthenticated `?role=sim` claim is refused with a reason, and told nothing else',
    lease.cheatSim.of('denied').length === 1 && lease.cheatSim.of('brief').length === 0
    && lease.cheatSim.msgs.length === 1,
    JSON.stringify(lease.cheatSim.msgs));
  t('W5b · so `worldSeed` — every episode\'s Hunter room through `pick` — never reaches it',
    seedsIn(lease.cheatSim.text()).length === 0 && !lease.cheatSim.text().includes('worldSeed'),
    `worldSeed ${lease.sess.state.worldSeed} absent from the whole transcript`);
  t('W5c · and that socket is not the mansion: its positions and its outcome are not the house\'s',
    lease.wired === false,
    'session.wired() — a house reporting positions would have set it');
  t('W5d · the unauthenticated `?role=tv` claim takes neither the rail nor the clock',
    lease.cheatTV.of('roster').length === 0 && lease.cheatTV.of('hello').length === 0
    && lease.phase === PHASE.EXPEDITION,
    `${lease.cheatTV.of('roster').length} roster frames to the cheat · phase still ${lease.phase}`);
  t('W5e · the real television keeps the lease, is never displaced, and its rail keeps arriving',
    lease.tv.of('moved').length === 0 && lease.tv.of('roster').length > lease.tvRosterBefore
    && lease.h.lobby.tv !== null,
    `${lease.tv.of('roster').length} roster frames, up from ${lease.tvRosterBefore} · no "moved" frame`);
  t('W5f · and neither claim is also a chair — one connection cannot be a player and the house',
    lease.seatsAtBell === 5 && lease.cheatSim.of('seated').length === 0
    && lease.cheatTV.of('seated').length === 0,
    `${lease.seatsAtBell} seats at the bell, from five phones and one cheat asking for a sixth`);
}

// ---------------------------------------------------------------- W6 · the key still works
/**
 * The other half, and it is not optional: a lease nobody can claim is a party that never starts.
 * §8 — *"Exactly one lease holder. A second `hello{hostKey}` supersedes … the old TV goes to a
 * 'this game moved' screen."* Told, not silently frozen: §6.5 forbids this page an error card, so
 * a television that simply stops is eight people arguing about the wifi.
 */
{
  const realSim = await open(LEASE_PORT, `?role=sim&key=${lease.h.hostKey}`);
  await sleep(120);
  realSim.send({ t: 'sim', runner: { x: 1, z: 1, room: 'chapel', noise: 0 },
    hunter: { x: 2, z: 2, room: 'chapel', wallDist: 1 } });
  await sleep(150);
  t('W6 · a claim carrying the key is granted, is briefed, and IS the mansion',
    realSim.of('denied').length === 0 && realSim.of('brief').length === 1
    && realSim.of('brief')[0].worldSeed === lease.sess.state.worldSeed && lease.sess.wired() === true,
    `not refused · brief wing ${realSim.of('brief')[0]?.wing} · session.wired() ${lease.sess.wired()}`);

  const secondTV = await open(LEASE_PORT, `?role=tv&key=${lease.h.hostKey}`);
  await sleep(180);
  t('W6b · a second keyed television supersedes the first, and the first is TOLD it moved',
    secondTV.of('hello').length === 1 && lease.tv.of('moved').length === 1
    && lease.tv.of('moved')[0].why.includes('moved'),
    JSON.stringify(lease.tv.of('moved')[0] || 'the displaced screen was told nothing'));
  /**
   * ⚠️ THE ARM MATTERS MORE THAN THE ASSERTION HERE. `/` serves the television page to anyone who
   * asks for it, so a key baked into that page would be no key at all — but a scan that found the
   * key nowhere because it was looking for the wrong string would read exactly the same. So: the
   * key IS found on the socket that was granted it, and is found on nothing else.
   */
  const unprivileged = surface.filter((x) => x.name !== 'socket ?role=tv');
  t('W6c arm · the scan can see the key — it is on the granted television socket, in `hello`',
    live.tv.of('hello')[0]?.hostKey === show.hostKey && show.hostKey.length >= 32,
    `${show.hostKey.length} hex characters, delivered in the granted socket's first frame`);
  t('W6c · and on nothing else — no HTTP body, no phone, no refused claim carries it',
    unprivileged.every((x) => !x.text.includes(show.hostKey)),
    `absent from ${unprivileged.length} unprivileged surfaces including GET / and GET /p`);
  realSim.close(); secondTV.close();
}

// ---------------------------------------------------------------- W5/W6 control
{
  const ctl3 = controlOf('lease', [
    [[
      "    const role = wants ? grant(wants, q.get('key')) : null;",
      '    if (wants && !role) {',
      '      // A refusal a phone can read, and a line in the report so the host can see it happened.',
      "      note(lobby, 'lease.refused', { role: wants });",
      "      send(sock, { t: 'denied', why: 'this show already has a television' });",
      '      return sock.end();',
      '    }',
    ].join('\n'), '    const role = wants;'],
    ['      displace(simSock, sock, \'sim\');\n', ''],
    ['      displace(lobby.tv, sock, \'tv\');\n', ''],
    ["if ((m.t === 'sim' || m.t === 'expedition') && sock === simSock && show) {",
      "if ((m.t === 'sim' || m.t === 'expedition') && (isSim || isTV) && show) {"],
    ["if (m.t === 'join' && !privileged) {", "if (m.t === 'join' && !isTV) {"],
  ]);
  t('W5/W6 control arm · the five edits that put the query-string grant back all applied',
    ctl3.applied, ctl3.missed.length ? `did not apply: ${ctl3.missed.join(' | ')}` : 'lease, supersede, sim guard and join guard all reverted');

  const mod = await ctl3.load();
  const bad = await leaseProbe(mod, LEASE_CTL_PORT, 'lctl');
  t('W5 control arm · the control ran the same probe, and the cheat socket was answered',
    bad.sess && bad.cheatSim.msgs.length > 1,
    `${bad.h.lobby.seats.size} seats · ${bad.cheatSim.msgs.length} frames to the cheat socket`);

  const brief = bad.cheatSim.of('brief')[0];
  t('W5a control · the same unauthenticated claim is briefed, and the brief carries `worldSeed`',
    !!brief && brief.worldSeed === bad.sess.state.worldSeed,
    brief ? JSON.stringify(brief) : 'no brief');
  t('W5c control · and that socket IS the mansion — its positions became the house\'s',
    bad.wired === true, 'session.wired() after one frame from an unauthenticated socket');
  t('W5d control · the same `?role=tv` claim takes the rail and drives the clock',
    bad.cheatTV.of('roster').length > 0 && bad.phase !== PHASE.EXPEDITION,
    `${bad.cheatTV.of('roster').length} roster frames to the cheat · one {t:'skip'} moved the show to ${bad.phase}`);
  t('W5e control · and the real television is replaced in silence, with nothing on screen to say so',
    bad.tv.of('moved').length === 0 && bad.tv.of('roster').length === bad.tvRosterBefore,
    `the real TV's rail stopped at ${bad.tvRosterBefore} frames and it was told nothing — §6.5 leaves the screen frozen on its last one`);
  t('W5f control · the same connection is a seated player AND the house',
    bad.seatsAtBell === 6 && bad.cheatSim.of('seated').length >= 1,
    `${bad.seatsAtBell} seats at the bell · the mansion holds seat ${bad.cheatSim.of('seated')[0]?.seat}`);

  bad.cheatSim.close(); bad.cheatTV.close();
  for (const p of bad.phones) p.close();
  bad.tv.close();
  await bad.h.close();
  ctl3.rm();
}

lease.cheatSim.close(); lease.cheatTV.close();
for (const p of lease.phones) p.close();
lease.tv.close();
await lease.h.close();

// ---------------------------------------------------------------- W7 · one socket, one chair
/**
 * 🚨 **`{t:'join'}` HAD NO "YOU ALREADY HOLD A SEAT" CHECK.** Four joins down one connection seated
 * four players and delivered four `you` panels to one screen, one of them a Production panel
 * naming a real human as a teammate. And the closure's `seat` is one binding, so closing that tab
 * dropped only the LAST chair and left the rest `live: true` behind a dead socket — phantom
 * players, dealt cards, counted in a threshold that then needed every real voter in the room.
 *
 * The two halves are measured separately below because they fail separately: the first is a leak,
 * the second is a vote that cannot resolve.
 */
async function chairProbe(mod, port, code) {
  const h = mod.startShow({ port, code });
  await sleep(120);
  const tv = await open(port, '?role=tv');
  const honest = [];
  for (let i = 0; i < 4; i++) {
    const p = await open(port);
    p.send({ t: 'join', name: `R${i + 1}`, token: null, boot: 500 });
    honest.push(p);
  }
  await sleep(200);
  const before = h.lobby.seats.size;

  const greedy = await open(port);
  for (let i = 0; i < 4; i++) greedy.send({ t: 'join', name: `G${i + 1}`, token: null, boot: 400 });
  await sleep(250);
  const afterJoins = h.lobby.seats.size;

  tv.send({ t: 'start' });
  await sleep(250);
  const cards = greedy.of('event').map((m) => m.ev).filter((ev) => ev.type === 'role.card').length;

  greedy.close();
  await sleep(250);
  const liveAfterClose = [...h.lobby.seats.values()].filter((x) => x.live).length;
  const honestLive = honest.filter((p) => p.ws.readyState === 1).length;
  return { h, tv, honest, greedy, before, afterJoins, cards, liveAfterClose, honestLive,
    refusals: greedy.of('refused').length, seated: greedy.of('seated').length };
}

const CHAIR_PORT = 5256;
const CHAIR_CTL_PORT = 5257;
const chairs = await chairProbe({ startShow }, CHAIR_PORT, 'chr');
{
  t('W7 arm · four honest phones were seated first, so the probe is not measuring an empty lobby',
    chairs.before === 4 && chairs.honestLive === 4,
    `${chairs.before} seats before the greedy socket asked for four more`);
  t('W7 · four joins down one socket buy one chair, and the other three are refused with a reason',
    chairs.afterJoins === 5 && chairs.refusals === 3
    && chairs.greedy.of('refused').every((r) => r.was === 'join'),
    `${chairs.afterJoins} seats · ${chairs.refusals} refusals · ${JSON.stringify(chairs.greedy.of('refused')[0] || null)}`);
  t('W7b · so one screen is dealt one card, and no second `you` panel reaches it',
    chairs.cards === 1,
    `${chairs.cards} role card(s) on a socket that asked to be four players`);
  t('W7c · and closing that tab takes exactly its own chair — no phantom is left behind it',
    chairs.liveAfterClose === 4,
    `${chairs.liveAfterClose} live seats after the close, from ${chairs.afterJoins} at the bell`);
}

// ---------------------------------------------------------------- W7 control
{
  const ctl4 = controlOf('chairs', [
    [[
      '        if (seat) {',
      "          send(sock, { t: 'refused', why: 'this phone already has a chair', was: 'join' });",
      '          return;',
      '        }',
      '',
    ].join('\n'), ''],
  ]);
  t('W7 control arm · the edit that removes the one-chair check applied',
    ctl4.applied, ctl4.missed.length ? `did not apply: ${ctl4.missed.join(' | ')}` : 'the join branch has no seat check again');

  const mod = await ctl4.load();
  const bad = await chairProbe(mod, CHAIR_CTL_PORT, 'cctl');
  t('W7 control · the same four joins seat four players down one connection',
    bad.afterJoins === 8 && bad.refusals === 0 && bad.seated >= 4,
    `${bad.before} seats before, ${bad.afterJoins} after · ${bad.seated} "seated" frames to one socket`);
  t('W7b control · and one screen is dealt four cards, which is four players\' worth of the game',
    bad.cards === 4, `${bad.cards} role cards on one socket`);
  t('W7c control · closing that one tab leaves three live players nobody can see or vote',
    bad.liveAfterClose === 7,
    `${bad.liveAfterClose} live seats after one close — the threshold counts them and the room cannot`);

  bad.greedy.close();
  for (const p of bad.honest) p.close();
  bad.tv.close();
  await bad.h.close();
  ctl4.rm();
}

for (const p of chairs.honest) p.close();
chairs.tv.close();
await chairs.h.close();

// ---------------------------------------------------------------- W8 · the displaced socket
/**
 * 🚨 **`act` READ `playerIdOf(seat.seat)` OUT OF ITS CLOSURE AND NEVER ASKED WHETHER THE CHAIR WAS
 * STILL THIS SOCKET'S.** `seatJoin` gives a chair back by token by rebinding `existing.sock`, so
 * the connection that lost it is still connected and still holding the seat record — and it kept
 * casting ballots, publishing claims and driving the robot, all recorded under the seat's player.
 *
 * The probe steals the chair of the phone that is currently the RUNNER, so both authorised paths —
 * `act` into the session and `drive` relayed to the mansion — are exercised by the same theft.
 */
async function displacedProbe(mod, port, code) {
  const h = mod.startShow({ port, code });
  await sleep(120);
  const tv = await open(port, '?role=tv');
  const sim = await open(port, `?role=sim&key=${h.hostKey}`);
  const phones = [];
  for (let i = 0; i < 5; i++) {
    const p = await open(port);
    p.send({ t: 'join', name: `R${i + 1}`, token: null, boot: 500 });
    phones.push(p);
  }
  await sleep(240);
  tv.send({ t: 'start' });
  await sleep(240);
  const sess = h.sessionNow();
  for (let i = 0; i < 12 && sess.state.phase !== PHASE.EXPEDITION; i++) { sess.skip(Date.now()); await sleep(30); }
  await sleep(80);

  const seatNo = Number(sess.state.pair.runner.slice(1)) - 1;
  const victim = phones.find((p) => p.of('seated').slice(-1)[0]?.seat === seatNo);
  const token = victim.of('seated').slice(-1)[0].token;

  const thief = await open(port);
  thief.send({ t: 'join', name: 'THIEF', token, boot: 400 });
  await sleep(220);
  const drivesBefore = sim.of('drive').length;
  const stolen = h.lobby.seats.get(`phone-${seatNo}`);

  // The displaced socket, still connected, still holding the seat record it started with.
  victim.send({ t: 'drive', heading: 1.2, detent: 2 });
  victim.send({ t: 'act', msg: { t: 'claim', claim: 'GHOST' } });
  await sleep(220);

  return { h, tv, sim, phones, thief, victim, seatNo, sess,
    rebound: stolen && stolen.sock !== null,
    drives: sim.of('drive').length - drivesBefore,
    claim: sess.state.players[seatNo].claim,
    refused: victim.of('refused').map((r) => r.was) };
}

const DISP_PORT = 5258;
const DISP_CTL_PORT = 5259;
const disp = await displacedProbe({ startShow }, DISP_PORT, 'disp');
{
  t('W8 arm · the chair really was taken by token, off the phone that was the runner',
    disp.thief.of('seated').length === 1 && disp.thief.of('seated')[0].seat === disp.seatNo
    && disp.sess.state.pair.runner === `p${disp.seatNo + 1}` && disp.rebound,
    `seat ${disp.seatNo} is the runner and now answers on the thief's socket`);
  t('W8 · the displaced socket\'s ballot is not recorded — the claim never reaches the table',
    disp.claim === null,
    `players[${disp.seatNo}].claim is ${JSON.stringify(disp.claim)} after a displaced socket published one`);
  t('W8b · and its stick does not reach the mansion either',
    disp.drives === 0, `${disp.drives} drive frames relayed from a socket that no longer holds the chair`);
  t('W8c · it is told so, once, rather than tapping into a void',
    disp.refused.includes('act') && disp.refused.includes('drive'),
    `refusals for: ${disp.refused.join(', ') || 'nothing — the phone was ignored in silence'}`);
}

// ---------------------------------------------------------------- W8 control
{
  const ctl5 = controlOf('displaced', [
    ["      if (m.t === 'drive' && holds() && show) {", "      if (m.t === 'drive' && seat && show) {"],
    ["      if (m.t === 'act' && holds() && show) {", "      if (m.t === 'act' && seat && show) {"],
    [[
      "      if ((m.t === 'act' || m.t === 'drive') && seat && !holds()) {",
      "        send(sock, { t: 'refused', why: 'this chair is on another phone', was: m.t });",
      '        return;',
      '      }',
      '',
    ].join('\n'), ''],
  ]);
  t('W8 control arm · the edits that take the chair check back off `act` and `drive` applied',
    ctl5.applied, ctl5.missed.length ? `did not apply: ${ctl5.missed.join(' | ')}` : 'both handlers read `seat` out of the closure again');

  const mod = await ctl5.load();
  const bad = await displacedProbe(mod, DISP_CTL_PORT, 'dctl');
  t('W8 control arm · the control staged the same theft against the same runner',
    bad.thief.of('seated').length === 1 && bad.sess.state.pair.runner === `p${bad.seatNo + 1}`,
    `seat ${bad.seatNo}`);
  t('W8 control · the displaced socket publishes a claim under the seat it no longer holds',
    bad.claim === 'GHOST', `players[${bad.seatNo}].claim is ${JSON.stringify(bad.claim)}`);
  t('W8b control · and drives the robot with it',
    bad.drives === 1, `${bad.drives} drive frame relayed to the mansion from a phone with no chair`);

  bad.thief.close(); bad.victim.close(); bad.sim.close();
  for (const p of bad.phones) p.close();
  bad.tv.close();
  await bad.h.close();
  ctl5.rm();
}

disp.thief.close(); disp.sim.close();
for (const p of disp.phones) p.close();
disp.tv.close();
await disp.h.close();

// ---------------------------------------------------------------- W9 · the phone that went quiet
/**
 * 🚨 **A PHONE THAT DIES SILENTLY IS NOT A PHONE THAT CLOSED A SOCKET.** `s.live` was cleared by
 * `seatDrop` alone and `seatDrop` fires on close; a battery death, a bag or a walk out of range
 * sends no FIN, and node's default TCP keepalive is two hours against a 33-minute show. There was
 * no keepalive, no `lastPong` and no timeout in the process — `rtt` was pushed and read only by
 * `report()` — so a phone that answered nothing was still `live: true`, `drops: 0`, dealt a role
 * by `begin()` and counted in a threshold the room then could not reach.
 *
 * ⚠️ THE SOCKET IS LEFT OPEN ON PURPOSE. Closing it would be `seatDrop`'s case, which already
 * worked; the case that did not is the one where the wire is fine and nobody is holding the phone.
 */
async function quietProbe(mod, port, code, { awayMs = 400 } = {}) {
  const h = mod.startShow({ port, code, awayMs });
  await sleep(120);
  const tv = await open(port, '?role=tv');
  const phones = [];
  for (let i = 0; i < 5; i++) {
    const p = await open(port);
    p.send({ t: 'join', name: `R${i + 1}`, token: null, boot: 500 });
    phones.push(p);
  }
  await sleep(240);
  const seatedAll = h.lobby.seats.size;
  const live = () => [...h.lobby.seats.values()].filter((x) => x.live).length;
  const rosterRow = (seat) => (tv.of('roster').slice(-1)[0]?.players || []).find((r) => r.seat === seat);

  // One phone stops answering. Its socket stays open — that is the whole point.
  const ghost = phones[2];
  const ghostSeat = ghost.of('seated')[0].seat;
  ghost.answers = false;
  await sleep(awayMs * 4);
  const awayRow = rosterRow(ghostSeat);
  const liveWhileAway = live();

  // It answers again, from the same socket, without reconnecting.
  ghost.answers = true;
  ghost.send({ t: 'pong', at: Date.now() });
  await sleep(TICK_MS * 3);
  const liveAfterReturn = live();
  const backRow = rosterRow(ghostSeat);

  // And then it goes for good, before the host presses START.
  ghost.answers = false;
  await sleep(awayMs * 4);
  const liveBeforeBell = live();
  tv.send({ t: 'start' });
  await sleep(240);
  const sess = h.sessionNow();

  return { h, tv, phones, ghost, ghostSeat, seatedAll, sess,
    awayRow, backRow, liveWhileAway, liveAfterReturn, liveBeforeBell,
    dealt: sess ? sess.state.players.length : 0,
    silentNotes: h.lobby.events.filter((e) => e.type === 'seat.silent').length,
    returnedNotes: h.lobby.events.filter((e) => e.type === 'seat.returned').length,
    socketStillOpen: ghost.ws.readyState === 1 };
}

const QUIET_PORT = 5260;
const QUIET_CTL_PORT = 5261;
const quiet = await quietProbe({ startShow }, QUIET_PORT, 'quit');
{
  t('W9 arm · five phones were seated and one of them stopped answering with its socket open',
    quiet.seatedAll === 5 && quiet.socketStillOpen && quiet.ghostSeat >= 0,
    `seat ${quiet.ghostSeat} went quiet · its socket is still open (readyState 1), so this is not a close`);
  t('W9 · the server notices the silence it was already measuring four times a second',
    quiet.silentNotes >= 1 && quiet.liveWhileAway === 4,
    `${quiet.silentNotes} seat.silent event(s) · ${quiet.liveWhileAway} of ${quiet.seatedAll} chairs still counted`);
  t('W9b · the television is told, so the rail and the room agree about who is here',
    quiet.awayRow && quiet.awayRow.live === false,
    `roster row for seat ${quiet.ghostSeat}: live ${quiet.awayRow?.live}`);
  t('W9c · one frame brings it back on the same socket — away is not a one-way door',
    quiet.liveAfterReturn === 5 && quiet.backRow?.live === true && quiet.returnedNotes >= 1,
    `${quiet.liveAfterReturn} live after a single pong · roster row live ${quiet.backRow?.live}`);
  t('W9d · and a chair still quiet at the bell is cast around, not dealt to',
    quiet.liveBeforeBell === 4 && quiet.dealt === 4,
    `${quiet.dealt} roles dealt · threshold floor(${quiet.dealt}/2)+1 = ${Math.floor(quiet.dealt / 2) + 1} of ${quiet.dealt} people actually in the room`);
}

// ---------------------------------------------------------------- W9 control
{
  const ctl6 = controlOf('quiet', [
    [[
      '    let wentQuiet = false;',
      '    for (const s of lobby.seats.values()) {',
      '      if (s.live && now - s.lastSeen > awayMs) {',
      '        s.live = false;',
      "        note(lobby, 'seat.silent', { seat: s.seat, name: s.name, quietMs: now - s.lastSeen });",
      '        wentQuiet = true;',
      '      }',
      '    }',
      '    if (wentQuiet) pushRoster();',
      '',
    ].join('\n'), ''],
  ]);
  t('W9 control arm · the edit that removes the silence sweep applied',
    ctl6.applied, ctl6.missed.length ? `did not apply: ${ctl6.missed.join(' | ')}` : 'nothing clears `live` but a socket close again');

  const mod = await ctl6.load();
  const bad = await quietProbe(mod, QUIET_CTL_PORT, 'qctl');
  const row = bad.awayRow;
  t('W9 control · the phone that answered nothing is still live, with no drops recorded against it',
    bad.liveWhileAway === 5 && bad.liveBeforeBell === 5 && row && row.live === true && row.drops === 0,
    `roster row for seat ${bad.ghostSeat}: live ${row?.live}, drops ${row?.drops}`);
  t('W9d control · so it is dealt a role, and the threshold counts a phone nobody is holding',
    bad.dealt === 5,
    `${bad.dealt} roles for 4 people in the room · floor(5/2)+1 = 3 of 4 real voters, and one card in a bag`);

  for (const p of bad.phones) p.close();
  bad.tv.close();
  await bad.h.close();
  ctl6.rm();
}

for (const p of quiet.phones) p.close();
quiet.tv.close();
await quiet.h.close();

// ---------------------------------------------------------------- W4 · and it still comes home
/**
 * 🚨 REPLAYABILITY IS THE REASON THE SEEDS ARE REPORTED AT ALL, AND IT SURVIVES. They come home in
 * `/report` after the Reunion, in the same breath as the log, behind the gate that already existed
 * for exactly this question. A "fix" that deleted them would have deleted the deliverable.
 */
{
  const s2 = startShow({ port: PORT2, code: 'done' });
  const h2 = await house(s2, PORT2, { seats: 5 });
  const sess2 = s2.sessionNow();
  for (let i = 0; i < 400 && sess2.state.phase !== PHASE.REUNION; i++) sess2.skip(Date.now());
  await sleep(200);
  const after = JSON.parse((await body(PORT2, '/report')).text);
  t('W4 arm · the second show reached the Reunion, which is the only moment this is about',
    sess2.state.phase === PHASE.REUNION && Array.isArray(after.log) && after.log.length > 40,
    `${sess2.state.phase} · ${after.log?.length} log entries`);
  t('W4 · after the Reunion the report carries both seeds, so a game is still replayable exactly',
    after.show.castSeed === sess2.truth().castSeed && after.show.worldSeed === sess2.state.worldSeed
    && after.withheld === undefined,
    `castSeed ${after.show.castSeed} · worldSeed ${after.show.worldSeed}`);
  t('W4 control · the same fetch against the show still on the air withholds both',
    !('castSeed' in midReport.show) && midReport.log === undefined,
    'one gate, one moment — the difference is the phase and nothing else');
  for (const p of h2.phones) p.close();
  h2.tv.close();
  await s2.close();
}

// ================================================================== done
for (const p of live.phones) p.close();
live.tv.close();
await show.close();

console.log(`\nparty-surface: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
