#!/usr/bin/env node
/**
 * 🌙 **_night-table — ONE TABLE NIGHT, PLAYED FOR REAL, WRITTEN DOWN.**
 *
 *   node harness/_night-table.mjs --out <dir>
 *
 * A probe, not a gate — the underscore says so. `gates:party` already proves each rule in
 * isolation; this plays ONE season end to end on a real socket server and photographs every
 * screen, so the quotes in a night report can be traced to frames that actually arrived.
 *
 * Two halves, and the split is deliberate:
 *   • THE WIRE (port 5186, one television + eight handsets): the whisper's three screens, the
 *     Reunion's reach on living pads, and the join URL a guest is handed.
 *   • THE PURE FUNCTIONS: Guide E's one door, Runner D's bezel bearing, TV E's stinger — each
 *     executed, never eyeballed, the way `intel-pads` and `tv-stinger` do it.
 *
 * The book is `nightBook`, so the seal (`bookLeaks`) applies to whatever lands on disk.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer, livingSeatedIds, roomLinks, fanoutViolations } from '../net/party/local.mjs';
import { whisperLines, pairShape, shapeLeaks, pairOf, whisperAudience } from '../src/party/link.js';
import { reunion } from '../src/party/reunion.js';
import { OUTCOME, WIN_TARGETS } from '../src/party/win.js';
import { bookLeaks, bookLines, episodesFromLog, nightBook, quoteCheck } from '../src/party/night-book.js';
import {
  bezelOf, bezelWords, guidePad, runnerPad, padLeaks, neighbourScope, pinDoor, sayThis,
  roomGraph, PAD_FORBIDDEN,
} from '../src/party/intel-pad.js';
import { pickPlanSeed, planRegions } from '../src/party/mansion.js';
import {
  isStinging, stepSting, stingHtml, stingLeaks, STING_KEYS, STING_FORBIDDEN,
} from '../src/party/stinger.js';

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, '..', rel), 'utf8').replace(/\r\n/g, '\n');

const argv = process.argv.slice(2);
const OUT = argv.indexOf('--out') >= 0 ? argv[argv.indexOf('--out') + 1] : null;
const PORT = 5186;
const PHONES = 8;
const NAMES = ['John', 'Ellie', 'Ada', 'Ben', 'Cy', 'Dee', 'Eli', 'Fox'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const findings = [];
const t = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}${d ? ` · ${d}` : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? ` · ${d}` : ''}`); findings.push({ id: n, detail: d }); }
  return !!c;
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

console.log('\n_night-table — one season, nine screens, and every quote traced\n');

/* =============================================================================================
 * THE HANDSET. Keeps the millisecond and the raw bytes — the chrome is rendered from the parsed
 * frames and the leak scan is run over the bytes, so a parse that dropped a field cannot hide a
 * leak from the second question.
 * ============================================================================================= */
function open(url) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const frames = [];
    const box = {
      ws, frames, welcome: null, url,
      send: (o) => { try { ws.send(JSON.stringify(o)); } catch { /* closed */ } },
      close: () => ws.close(),
      upTo: (until) => frames.filter((f) => f.at <= until),
      of: (kind) => frames.filter((f) => f.msg && f.msg.t === kind).map((f) => f.msg),
      raw: () => frames.map((f) => f.raw).join('\n'),
    };
    ws.onmessage = (e) => {
      const raw = String(e.data);
      let msg = null;
      try { msg = JSON.parse(raw); } catch { /* keep the bytes */ }
      frames.push({ at: Date.now(), raw, msg });
      if (msg && (msg.t === 'welcome' || msg.t === 'full')) { box.welcome = msg; resolve(box); }
    };
    ws.onerror = () => resolve(box);
    setTimeout(() => resolve(box), 1500);
  });
}

/** The pad's whisper log, exactly as `party-phone.js` builds and renders it. */
function padWhisperScreen(box, until) {
  const me = box.welcome && box.welcome.playerId;
  const whispers = box.upTo(until)
    .filter((f) => f.msg && f.msg.t === 'whisper')
    .map((f) => ({ from: f.msg.from, text: f.msg.text, at: f.msg.at }));
  return whisperLines(whispers, me)
    .map((w) => `<p class="whisper${w.mine ? ' me' : ''}">${esc(w.text)}</p>`).join('');
}

/* =============================================================================================
 * 🌙 THE NIGHT.
 * ============================================================================================= */
const srv = startServer({ port: PORT, count: PHONES, castSeed: 41, worldSeed: 9, code: 'tbl' });
await sleep(160);

const base = `ws://localhost:${PORT}/?room=tbl`;
const tv = await open(`${base}&host=1`);
const phones = [];
for (let i = 0; i < PHONES; i += 1) phones.push(await open(base));
await sleep(140);

phones.forEach((p, i) => p.send({ t: 'name', name: NAMES[i] }));
await sleep(120);

tv.send({ t: 'start' });
await sleep(90);
tv.send({ t: 'casting' });
await sleep(160);

const room = srv.rooms.get('tbl');
const names = {};
for (const p of room.game.state.players) names[p.id] = p.name;
const padOf = (id) => phones.find((p) => p.welcome && p.welcome.playerId === id) || null;

console.log('  the arm');
{
  const live = livingSeatedIds(room);
  t('NT0 arm · nine live sockets, eight of them seated handsets',
    tv.welcome != null && phones.every((p) => p.welcome && p.welcome.playerId) && live.length === PHONES,
    `${live.length} seated + 1 television on :${PORT}`);
  t('NT0b arm · the room is really in CASTING with a deal behind it',
    room.show === 'casting' && room.game.truth().seats.length === PHONES,
    `beat=${room.show} · ${room.game.truth().seats.length} dealt`);
}

/* =============================================================================================
 * THE WHISPER, shot inside a real Debrief, one frozen second wide.
 * ============================================================================================= */
async function shootWhisper(ep) {
  const alive = livingSeatedIds(room);
  const A = alive[0], B = alive[1], C = alive[4] || alive[2];
  const padA = padOf(A), padB = padOf(B), padC = padOf(C);
  if (!padA || !padB || !padC) return null;

  padA.send({ t: 'link', to: B });
  await sleep(140);
  padB.send({ t: 'link', accept: A });
  await sleep(180);

  const SECRET = 'ADA CALLED THE LEFT WALL AND THE NAIL WAS EMPTY';
  const DECOY = 'I AM NOT IN A PAIR AND THIS SHOULD REACH NOBODY';
  const pair = pairOf(roomLinks(room), A);
  const T0 = Date.now();
  const audience = whisperAudience(roomLinks(room), A);
  const noAudience = whisperAudience(roomLinks(room), C);
  padA.send({ t: 'whisper', text: SECRET });
  padC.send({ t: 'whisper', text: DECOY });
  await sleep(1000);
  const T1 = T0 + 1000;

  const shape = pair ? pairShape(pair, T1) : null;
  const tvBoard = shape
    ? `${esc(shape.name)} · ${esc(names[shape.a] || shape.a)} + ${esc(names[shape.b] || shape.b)} · held ${shape.heldSec}s`
    : '';
  return {
    episode: ep,
    beat: room.show,
    secret: SECRET,
    decoy: DECOY,
    pairName: shape ? shape.name : null,
    audience: audience.length,
    noAudience: noAudience.length,
    partnerScreen: padWhisperScreen(padB, T1),
    senderScreen: padWhisperScreen(padA, T1),
    thirdScreen: padWhisperScreen(padC, T1),
    tvBoard,
    tvCarriedWords: tv.upTo(T1).some((f) => f.raw.includes(SECRET) || f.raw.includes(DECOY)),
    thirdCarriedWords: padC.upTo(T1).some((f) => f.raw.includes(SECRET) || f.raw.includes(DECOY)),
    shapeLeaks: shape ? shapeLeaks(shape) : ['no shape'],
    shapeKeys: shape ? Object.keys(shape) : [],
  };
}

/* =============================================================================================
 * THE SEASON. Cast a pair, play the episode, then walk the show through the whole order with the
 * TV's own beat door. Nominate and vote over the wire so the boards are the room's, not a wish.
 * ============================================================================================= */
const wireTally = {};
const wireNomOk = [];
const wireBallotOk = [];
const beatWalk = [];

const WALK = ['recap', 'debrief', 'reckoning', 'vote', 'execution', 'verdict'];
/** The three folds that END a night. `RENEWED` is the fourth and it means the opposite. */
const TERMINAL = [OUTCOME.FINALE, OUTCOME.CANCELLED, OUTCOME.ABANDONED];
let played = 0;
let whisperShot = null;

for (let ep = 1; ep <= 5; ep += 1) {
  const living = livingSeatedIds(room);
  if (living.length < 3) break;
  const runner = living[0], guide = living[1];

  for (const id of living) { const p = padOf(id); if (p) p.send({ t: 'ballot', runner, guide }); }
  await sleep(220);

  tv.send({ t: 'episode', opts: {} });
  await sleep(340);
  played = room.game.state.airingEpisode || ep;

  for (const beat of WALK) {
    tv.send({ t: 'show', beat });
    await sleep(150);
    beatWalk.push({ ep, asked: beat, got: room.show });

    if (beat === 'debrief' && !whisperShot) whisperShot = await shootWhisper(ep);

    if (beat === 'reckoning') {
      const alive = livingSeatedIds(room);
      const nominator = alive[2], target = alive[3];
      const p = padOf(nominator);
      if (p) p.send({ t: 'nominate', target });
      await sleep(200);
    }
    if (beat === 'vote') {
      const alive = livingSeatedIds(room);
      const noms = (room.game.state.nominations || []).map((n) => n.target || n.whom || n);
      const choice = noms[0] || alive[3];
      const before = tv.of('tally').length;
      for (const id of alive) { const p = padOf(id); if (p) p.send({ t: 'lynchVote', choice }); }
      await sleep(260);
      /*
       * ⚠️ THE BOARD THIS EPISODE ENDED ON, not the one the socket ended on. The server re-arms
       * the ballots board at the next beat (`{in:0, living:7}`), so keeping only the LAST frame
       * of the night puts a zeroed board in the book beside a vote that carried — which is the
       * DUSK6 shape the honest-scorekeeper rung exists to stop. The window is this beat's frames.
       */
      const during = tv.of('tally').slice(before);
      const last = during.length ? during[during.length - 1] : null;
      if (last) wireTally[room.game.state.episode || ep] = { in: last.in, living: last.living, need: last.need };
    }
  }
  tv.send({ t: 'casting' });
  await sleep(240);
  console.log(`  reading · after ep${ep} · beat=${room.show}`
    + ` · outcome=${room.game.state.outcome || 'none'}`
    + ` · episode=${room.game.state.episode} airing=${room.game.state.airingEpisode}`
    + ` · living=${livingSeatedIds(room).length}`);
  /*
   * ⚠️ **RENEWED IS NOT AN ENDING.** `OUTCOME.RENEWED` is the fold saying *play on*, and it is
   * written onto `state.outcome` at every Verdict that is not the last one — so `if
   * (state.outcome) break` stops a five-episode season after episode one with nothing red
   * anywhere. Only the three terminal folds end a night; the Reunion beat is the other door.
   */
  if (room.show === 'reunion' || TERMINAL.includes(room.game.state.outcome)) break;
}

/* The Reunion, through the TV's own two-tap door. */
tv.send({ t: 'skip' });
await sleep(140);
tv.send({ t: 'skip' });
await sleep(500);

console.log('\n  the wire');
t('NT1 · the season really walked the order live · every asked beat is the beat the server named',
  beatWalk.length > 0 && beatWalk.every((b) => b.got === b.asked),
  `${beatWalk.length} beats over ${played} aired`
  + ` · misses ${beatWalk.filter((b) => b.got !== b.asked).map((b) => `${b.asked}→${b.got}`).join(',') || 'none'}`);

for (const p of phones) {
  for (const m of p.of('nomOk')) wireNomOk.push(m);
  for (const m of p.of('ballotOk')) wireBallotOk.push(m);
}

t('NT1b · receipts came back on the wire — a nomination and a ballot each answered',
  wireNomOk.length > 0 && wireBallotOk.length > 0,
  `${wireNomOk.length} nomOk · ${wireBallotOk.length} ballotOk`);

/* =============================================================================================
 * THE WHISPER — three screens, one second.
 * ============================================================================================= */
console.log('\n  the whisper, on three screens');
if (!whisperShot) {
  t('NT2 · the Debrief pair was shot', false, 'no Debrief reached');
} else {
  const w = whisperShot;
  t('NT2 · the PARTNER pad shows the words · one line, and it is the sentence that was sent',
    w.partnerScreen.includes(w.secret)
    && (w.partnerScreen.match(/<p class="whisper/g) || []).length === 1,
    w.partnerScreen);
  t('NT2b · a THIRD pad shows NOTHING — an empty screen, and no bytes either',
    w.thirdScreen === '' && !w.thirdCarriedWords,
    `screen ${w.thirdScreen === '' ? 'empty' : `"${w.thirdScreen}"`} · bytes ${w.thirdCarriedWords ? 'LEAKED' : 'clean'}`);
  t('NT2c · the TELEVISION shows the SHAPE and never the words',
    !w.tvCarriedWords && !w.tvBoard.includes(w.secret) && w.shapeLeaks.length === 0 && w.tvBoard !== '',
    `"${w.tvBoard}" · ${w.shapeKeys.length} keys, 0 leaks`);
  t('NT2d · the unpaired decoy reached ZERO screens — its own included',
    w.noAudience === 0 && !phones.some((p) => p.raw().includes(w.decoy)),
    `audience ${w.audience} for the pair · ${w.noAudience} for the unpaired shout`);
}

/* =============================================================================================
 * THE REUNION — on living pads.
 * ============================================================================================= */
console.log('\n  the Reunion, on living pads');
const reveals = phones.map((p, i) => ({
  i, name: NAMES[i], id: p.welcome && p.welcome.playerId, got: p.of('reveal'),
}));
const livingIds = new Set(livingSeatedIds(room));
const livingReveals = reveals.filter((r) => livingIds.has(r.id));
{
  const reached = livingReveals.filter((r) => r.got.length > 0);
  t('NT3 · every LIVING pad was sent the reveal — the Reunion reaches everybody, not one phone',
    livingReveals.length > 0 && reached.length === livingReveals.length,
    `${reached.length} of ${livingReveals.length} living pads`
    + ` · ${reveals.filter((r) => r.got.length).length} of ${PHONES} in all`);

  const anyReveal = (reveals.find((r) => r.got.length) || { got: [] }).got[0] || null;
  t('NT3b · the reveal carries the roll call, and the FEED COUNT the Verdict was not allowed to',
    !!anyReveal && Array.isArray(anyReveal.seats || anyReveal.rollCall) && anyReveal.feed !== undefined,
    anyReveal ? `keys ${Object.keys(anyReveal).join(',')}` : 'no reveal frame');

  const badFan = reveals.flatMap((r) => r.got.flatMap((m) => fanoutViolations(m)));
  t('NT3c · and nothing on the reveal broke the fanout seal',
    badFan.length === 0, badFan.length ? badFan.join(', ') : '0 violations over the reveal frames');
}

/* =============================================================================================
 * THE JOIN URL — the one string a guest ever types.
 * ============================================================================================= */
console.log('\n  the join URL');
{
  const hostSrc = src('src/views/party-host.js');
  const line = ((hostSrc.match(/^\s*const joinPath = .*$/m) || [])[0] || '').trim();
  const origin = 'http://192.168.1.50:5192';
  const code = 'TBL';
  let url = '';
  try {
    url = String(Function('location', 'code', `${line}\n return joinPath;`)({ origin }, code));
  } catch (err) { url = ''; }
  t('NT4 · the join URL a guest is handed carries NO dev flag, from a TV that itself has one',
    url !== '' && !/[?&]dev=/.test(url) && url.startsWith(origin),
    url || `<could not build> saw: ${line || '<no joinPath line>'}`);
}

/* =============================================================================================
 * GUIDE E · one door ahead, not a route.  RUNNER D · a bezel bearing, no map.
 * ============================================================================================= */
console.log('\n  Guide E and Runner D');
/*
 * ⚠️ STAND INSIDE A RECT, NEVER AT A REGION'S AVERAGED CENTRE — `intel-pads.mjs` argues this at
 * length: a region is a UNION of rectangles, so an L-shaped corridor's mean point can land in the
 * notch, off the floor, and `regionAt` correctly answers null there. A probe that used the mean
 * would report "0 doors" for an ordinary corridor and read as a graph bug.
 */
const planSeed = pickPlanSeed(9).seed;
const plan = planRegions(planSeed);
const graph = roomGraph(plan);
const spot = (() => {
  for (const r of graph.rects) {
    const p = { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 };
    const sc = neighbourScope(plan, p);
    if (sc && (sc.gates || []).length >= 1) return { at: p, scope: sc };
  }
  const r = graph.rects[0];
  const p = { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 };
  return { at: p, scope: neighbourScope(plan, p) };
})();
const at = spot.at;
const scope = spot.scope;
const dirs = (scope.gates || []).map((g) => g.dir);
const pin = pinDoor(scope, dirs[0]);
const gpad = guidePad(planSeed, at, pin);
const rpad = runnerPad(at, pin, false);
const bez = bezelOf({ pin, at });
{
  const gLeaks = padLeaks('guide', gpad);
  const rLeaks = padLeaks('runner', rpad);
  const gJson = JSON.stringify(gpad);
  const rJson = JSON.stringify(rpad);
  t('NT5 · GUIDE E is neighbours only — the rooms next door and their doors, never a polyline',
    gLeaks.length === 0
    && !/route|polyline|waypoint/i.test(gJson)
    && !PAD_FORBIDDEN.some((k) => gJson.includes(`"${k}"`)),
    `${dirs.length} doors on the scope · keys ${Object.keys(gpad).join(',')} · 0 leaks`);
  const two = pinDoor(scope, dirs[1] || dirs[0]);
  t('NT5b · the pin is ONE door — a second tap replaces it, it never grows a second live pin',
    !!pin && Object.keys(pin).length === 4 && !!two && Object.keys(two).length === 4,
    `pin ${JSON.stringify(pin)} · say "${sayThis(scope, pin)}"`);
  /*
   * The bearing is the UNARMED bezel. `ready:true` deliberately takes the whole rail and erases
   * the segment (`bezelOf`'s own note: smash-ready is a state of the hammer, never a hint about
   * where to walk), so asking the armed shape for a bearing would be asking the wrong screen.
   */
  const runs = (bez.runs || []).map((r) => `${r.edge} ${r.from}→${r.to}px`);
  t('NT6 · RUNNER D is a BEZEL BEARING — a rail run and a word, and no map anywhere on it',
    rLeaks.length === 0 && bez.pinned === true && runs.length > 0
    && bez.word !== '' && bez.range !== ''
    && !/svg|polyline|route|<path/i.test(rJson),
    `rail ${runs.join(' + ')} · words "${bezelWords(bez)}"`
    + ` · armed bezel is "${bezelWords(bezelOf({ pin, at, ready: true }))}" · 0 leaks`);
}

/* =============================================================================================
 * TV E · the stinger is not a map.
 * ============================================================================================= */
console.log('\n  TV E');
{
  /*
   * The mount, then the runner one room away — the sting only ever fires on a camera she has
   * ALREADY left, so a shape taken while she is still in the room is deliberately null. The two
   * calls are the arm and the frame, and only the second is a screen.
   */
  const MOUNT = [{ type: 'run.camera_lit', seq: 41, data: { camera: 2, episode: 1, job: 'drill' } }];
  const CAMS = { unlocked: 2, needed: 4 };
  const inRoom = { runnerRoom: 'r1.gallery', missionRoom: 'r1.gallery' };
  const out = { runnerRoom: 'r2.hall', missionRoom: 'r1.gallery' };
  const dark = stepSting(null, { events: MOUNT, cameras: CAMS, world: inRoom, now: 1000, episode: 1 });
  const shape = stepSting(dark, { events: MOUNT, cameras: CAMS, world: out, now: 1100, episode: 1 });
  const html = shape ? stingHtml(shape) : '';
  const leaks = shape ? stingLeaks(shape) : ['no sting'];
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  t('NT7 · the sting is a COUNT and a LABEL — no room, no mark, no plan, no house',
    isStinging(shape) && leaks.length === 0
    && !/svg|polyline|<path|plan|route|hunter|flyover|lid/i.test(html)
    && Object.keys(shape || {}).every((k) => STING_KEYS.includes(k)),
    `"${text}" · keys ${Object.keys(shape || {}).join(',')}`
    + ` · in the room it is ${isStinging(dark) ? 'LIT — wrong' : 'dark, which is the rule'}`);
  t('NT7b · and the spatial words are refused at the schema, not by taste',
    STING_FORBIDDEN.includes('hunter') && STING_FORBIDDEN.includes('plan'),
    `${STING_FORBIDDEN.length} forbidden · ${STING_FORBIDDEN.slice(0, 6).join(', ')}…`);
}

/* =============================================================================================
 * THE BOOK — the scorekeeper bar, the nominated rows, and Recap.
 * ============================================================================================= */
console.log('\n  the book');
const log = room.game.log.all();
const align = Object.fromEntries(room.game.deal.seats.map((s) => [s.id, s.alignment]));
const players = room.game.state.players.map((p) => ({ id: p.id, name: p.name, seat: p.seat }));
const eps = episodesFromLog(log, players.map((p) => p.id));
for (const e of eps) if (wireTally[e.episode]) e.tally = wireTally[e.episode];

const reu = reunion(log, { alignmentOf: (id) => align[id], targets: WIN_TARGETS[PHONES] });
const book = nightBook({
  at: new Date().toISOString(),
  room: 'tbl',
  season: {
    outcome: room.game.state.outcome || null,
    aired: room.game.state.airingEpisode || null,
    cap: 5,
  },
  players,
  episodes: eps,
  reunion: reu,
});
const lines = bookLines(book);
{
  const castings = log.filter((e) => e && e.type === 'phase.CASTING');
  const pairs = log.filter((e) => e && e.type === 'cast.pair').length;
  console.log(`  reading · log · ${castings.length} phase.CASTING (episodes `
    + `${castings.map((e) => (e.data || {}).episode).join(',')}) · ${pairs} cast.pair`
    + ` · ${eps.length} book records · aired ${room.game.state.airingEpisode}`
    + ` · state.episode ${room.game.state.episode}`);
  const leaks = bookLeaks(book);
  t('NT8 · the book is sealed — deny-by-default, and nothing forbidden walked in',
    leaks.length === 0, leaks.length ? leaks.join('; ') : `${lines.length} quotable lines`);

  const bar = lines.filter((l) => l.kind === 'clears');
  t('NT9 · the SCOREKEEPER BAR is in the book, from `clearsLine` / `tallyBoardCopy`',
    bar.length > 0 && bar.every((l) => /clear/i.test(l.line)),
    bar.length ? `"${bar[0].line}"` : 'no clears line');

  const ballots = lines.filter((l) => ['ballots', 'count', 'note'].includes(l.kind));
  console.log(`  reading · ${tv.of("tally").length} t:tally frames · last of each vote is the board the book keeps`);
  t('NT9b · ...and the ballots board beside it, in HEAD copy',
    ballots.length >= 3, ballots.map((l) => `"${l.line}"`).join(' · ') || 'no t:tally captured');

  const named = lines.filter((l) => l.kind === 'named-by');
  const rows = lines.filter((l) => l.kind === 'row');
  const lockRow = rows.find((r) => /nominated/.test(r.line));
  t('NT10 · the NOMINATED ROWS are in the book — "named by X" and the lynch row lock',
    named.length > 0 && rows.length > 0,
    `${named.length} nameplates · ${rows.length} rows · "${(named[0] || {}).line}"`
    + ` · "${(lockRow || rows[0] || {}).line}"`);

  /*
   * 🚨 **RECAP IS TWO QUESTIONS AND THEY HAVE DIFFERENT ANSWERS ON A NODE NIGHT.**
   *
   * The BEAT must air every episode `orderFor` names it — that is `episode-order` E7, and it is
   * answered from the walk, above. The CLAIM is the other half: the mansion lives in the browser,
   * so a pure-node room's expedition leaves a run record whose card is honest zeros
   * (`party-night` N9 — *"honest zeros until the mansion reports"*). With no camera lit, no
   * failure line and no quiet, the correct number of run claims is ZERO, and the ban on
   * *"Run is in the book"* without a run is what makes that right rather than a gap.
   *
   * The earlier reading of this check — *a run record exists, therefore a recap line must* —
   * conflated the two and would have gone green only if the book INVENTED a claim.
   */
  const recap = lines.filter((l) => l.beat === 'recap');
  const runCards = eps.filter((e) => e.run).map((e) => e.run);
  const aired = runCards.filter((c) => c.cameraLit || c.failLine || c.quiet || c.outcome);
  const recapBeats = beatWalk.filter((b) => b.asked === 'recap' && b.got === 'recap');
  console.log(`  reading · run cards · ${JSON.stringify(runCards)}`);
  t('NT11 · the RECAP BEAT aired every episode the order names it',
    recapBeats.length > 0 && recapBeats.length === beatWalk.filter((b) => b.asked === 'recap').length,
    `${recapBeats.length} Recaps entered live, ${recapBeats.length} of ${beatWalk.filter((b) => b.asked === 'recap').length} asked`);
  t('NT11b · ...and its chrome claims NOTHING a node night could not report — no ghost run line',
    recap.length === aired.length,
    aired.length
      ? `${recap.length} recap lines for ${aired.length} reporting runs · "${(recap[0] || {}).line || ''}"`
      : `${runCards.length} run records, all honest zeros (no mansion in node) · ${recap.length} run claims — the ban holds`);

  const swing = lines.filter((l) => l.kind === 'swing');
  t('NT11c · the execution plate is quoted with the hand that swung',
    swing.length > 0 || eps.every((e) => !(e.lynch && e.lynch.result)),
    swing.length ? `"${swing[0].line}"` : 'no execution this season');

  const probe = (bar[0] || {}).line || '';
  const good = quoteCheck(book, probe);
  const bad = quoteCheck(book, 'the board said five of eight clears, so Ben is out');
  t('NT12 · a quote from the night verifies, and one that was never said does NOT',
    good.ok && !bad.ok,
    `"${probe}" → ${good.ok ? 'from this night' : good.why} · invented → ${bad.why}`);

  t('NT12b · the Reunion prints the feed count the Verdict was sealed from',
    book.reunion != null && book.reunion.feed !== undefined,
    `feed ${JSON.stringify(book.reunion && book.reunion.feed)}`
    + ` · ${(book.reunion && book.reunion.lines || []).length} reunion lines`);
}

/* =============================================================================================
 * ON DISK.
 * ============================================================================================= */
if (OUT) {
  mkdirSync(OUT, { recursive: true });
  const shots = {
    version: 1,
    playedAt: new Date().toISOString(),
    port: PORT,
    room: 'tbl',
    outcome: room.game.state.outcome || null,
    aired: room.game.state.airingEpisode || null,
    beatWalk,
    whisper: whisperShot,
    reunionReach: {
      livingPads: livingReveals.length,
      reached: livingReveals.filter((r) => r.got.length).length,
      perPad: reveals.map((r) => ({
        name: r.name, living: livingIds.has(r.id), reveals: r.got.length,
      })),
    },
    guideE: { pad: gpad, pin, say: sayThis(scope, pin), doors: dirs },
    runnerD: { pad: rpad, bezel: bez, words: bezelWords(bez) },
    receipts: { nomOk: wireNomOk.length, ballotOk: wireBallotOk.length },
    checks: { pass, fail, findings },
  };
  writeFileSync(join(OUT, 'night-book.json'), `${JSON.stringify(book, null, 1)}\n`, 'utf8');
  writeFileSync(join(OUT, 'night-screens.json'), `${JSON.stringify(shots, null, 1)}\n`, 'utf8');
  writeFileSync(join(OUT, 'night-quotes.json'), `${JSON.stringify(lines, null, 1)}\n`, 'utf8');
  console.log(`\n  wrote ${join(OUT, 'night-book.json')}`);
  console.log(`  wrote ${join(OUT, 'night-screens.json')}`);
  console.log(`  wrote ${join(OUT, 'night-quotes.json')}`);
}

console.log(`\n  reading · ${lines.length} quotable lines over ${book.episodes.length} episodes`
  + ` · outcome ${(book.season && book.season.outcome) || 'none'}`
  + ` · aired ${(book.season && book.season.aired) || '?'}`);
console.log(`\n  ${pass} ok · ${fail} fail\n`);

try { if (srv.close) srv.close(); } catch { /* best effort */ }
process.exit(fail ? 1 : 0);
