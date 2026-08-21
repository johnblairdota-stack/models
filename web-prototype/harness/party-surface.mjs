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
import { startShow, seedFrom } from '../net/party/show.mjs';
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
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      msgs.push(m);
      if (m.t === 'ping') box.send({ t: 'pong', at: m.at });
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

const surface = [
  ...bodies.map((b) => ({ name: `GET ${b.path}`, text: b.text })),
  { name: 'socket ?role=tv', text: live.tv.text() },
  ...live.phones.map((p, i) => ({ name: `socket phone ${i + 1}`, text: p.text() })),
];
const surfaceText = surface.map((s) => s.text).join('\n');

// ---------------------------------------------------------------- W0 · the arm
{
  const frames = live.tv.msgs.length + live.phones.reduce((a, p) => a + p.msgs.length, 0);
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
