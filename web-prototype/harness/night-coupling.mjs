#!/usr/bin/env node
/**
 * 🔗 **NIGHT COUPLING — the four surfaces of one expedition, driven as ONE story over real
 * sockets: guide pins → TV is told → world walks → camera lights → Recap says CAM LIT.**
 *
 * The hole this closes (Game slice, 2026-09-02): *"the driver still cannot walk the pair."*
 * Every link of the expedition loop was individually gated — the pin on the wire (`runner-intel`
 * RI10–RI13), the auto-walk maths (RI20), the camera lighting on `mission.return` (`party-night`
 * N25), the follow picture's pixels (`party-follow-drive`) — but NO driver ever ran the chain
 * end to end: guide taps → `t:'pin'` → TV cue → world reports → `run.camera_lit` → the beat
 * leaves expedition on the mission → the recap card reads CAM LIT. The coupled walk had only
 * ever been seen in a browser, which is exactly where five agents' findings went to die in
 * August. This gate is that walk, in bare node, against a real server and real sockets.
 *
 * What still lives only in a browser, honestly: the BED — `follow-bed.js`'s `autoWalkInput`
 * driving a real `Player` needs THREE, and `.github/workflows/gates.yml` never `npm install`s.
 * The world reports below are shaped exactly as `follow-bed.js` sends them (`seek` in the
 * mission room, `return` with `mission.room` moved to the ballroom, `done` with the runner home)
 * so the server-side story is the live one; the browser-side body is `runner-intel`'s maths plus
 * `party-follow-drive`'s pixels until a bed drive exists.
 *
 * 🚨 **NC7 PINS A COINCIDENCE THAT MUST STAY AGREED.** When the mission leaves `seek`, TWO
 * independent guards make a stale objective pin harmless: the server clears it
 * (`room.js` `setWorld`, "an objective pin dies with the job it named") and the resolver refuses
 * it (`objectives.js` `objectiveGoal`, here !== missionRoom). The TV's `perf.pin` is NOT told
 * about the clear — the behaviour is right only because both guards agree. NC7 asserts both in
 * one breath so neither can be "tidied" alone.
 *
 * ⚠️ The driver's record, never the server's own log, is what NC assertions read where
 * provenance matters — `PRIME-TIME-STATE.md` §5's circular-gate lesson. Socket-received
 * messages ARE the driver's record. Server state (`srv.rooms`) is read only for counters the
 * wire deliberately does not carry.
 *
 * Port 5232: 5199 is The Desk's, 5205 is the night board's, 5222–5226 are `party-night` /
 * `role-peek`. A gate that binds a live product's port dies EADDRINUSE locally while CI greens.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../net/party/local.mjs';
import { recapFromEvents } from '../src/party/recap.js';
import { missionFor } from '../src/party/mission.js';
import { kindsForJob, objectiveGoal, isObjectivePin } from '../src/party/objectives.js';
import { PIN_WIRE_KEYS } from '../src/party/follow.js';
import { PAIR_LOCK_MS } from '../src/game/pair-lock-stage.js';

const PORT = 5232;
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
const last = (box, type) => [...box.msgs].reverse().find((m) => m.t === type);
const evs = (box) => box.msgs.filter((m) => m.t === 'event').map((m) => m.ev);
const camEvents = (box) => evs(box).filter((e) => e.type === 'run.camera_lit');

const srv = startServer({ port: PORT, count: 8, castSeed: 1, worldSeed: 1, code: 'couple' });
await sleep(120);
const base = `ws://localhost:${PORT}/?room=couple`;

const host = await open(`${base}&host=1`);
const a = await open(base);
const b = await open(base);
const c = await open(base); // seated bystander — the pin must never reach this phone
await sleep(80);

host.send({ t: 'start' });
host.send({ t: 'casting' });
await sleep(80);
a.send({ t: 'ballot', runner: b.welcome.playerId, guide: a.welcome.playerId });
b.send({ t: 'ballot', runner: a.welcome.playerId, guide: b.welcome.playerId });
await sleep(80);
host.send({ t: 'episode', opts: {} });
await sleep(PAIR_LOCK_MS + 80);
/*
 * The TV's first 2 Hz world report. Not decoration: `playEpisode` clears every seatRole and
 * `setWorld` re-asserts them from `state.pair`, and `you.pin` only rides a frame whose socket
 * carries a crew seatRole — so until the TV has reported once, the crew phones cannot read a
 * pin back. This gate found that ordering by failing without this line.
 */
host.send({ t: 'world', runner: { room: 'ballroom', x: 0, z: 0 }, hunter: null, mission: { phase: 'seek', room: missionFor(1).room } });
await sleep(120);

const pair = last(host, 'state')?.frame?.pair ?? {};
const byId = (id) => [a, b].find((x) => x.welcome.playerId === id);
const guide = byId(pair.guide);
const runner = byId(pair.runner);
t('NC1 · casting elected the two seated humans and fanned expedition to every surface',
  !!guide && !!runner && guide !== runner
    && last(host, 'show')?.beat === 'expedition'
    && last(guide, 'show')?.beat === 'expedition'
    && last(c, 'show')?.beat === 'expedition',
  JSON.stringify({ pair, beat: last(host, 'show')?.beat }));

const spec = missionFor(1);
const youPin = (box) => last(box, 'state')?.frame?.you?.pin ?? null;

// ---- NC2 · only the guide's thumb is a pin. Runner, bystander and the TV are all refused.
const cuesBefore = host.msgs.filter((m) => m.t === 'pin').length;
runner.send({ t: 'pin', x: 1, z: 1, roomId: spec.room, kind: 'room' });
c.send({ t: 'pin', x: 1, z: 1, roomId: spec.room, kind: 'room' });
host.send({ t: 'pin', x: 1, z: 1, roomId: spec.room, kind: 'room' });
await sleep(80);
t('NC2 · a pin from the runner, a bystander or the TV lands nowhere',
  host.msgs.filter((m) => m.t === 'pin').length === cuesBefore
    && youPin(guide) == null && youPin(runner) == null,
  JSON.stringify({ cues: host.msgs.filter((m) => m.t === 'pin').length, guidePin: youPin(guide) }));

// ---- NC3 · the guide pins a door: the TV is told as a cue, the crew read it back as frame state.
guide.send({ t: 'pin', x: 1.5, z: -2.5, roomId: spec.room, kind: 'room' });
await sleep(80);
{
  const cue = last(host, 'pin');
  t('NC3 · the guide\'s door pin reaches the TV as a control cue, exactly the closed schema',
    !!cue && Object.keys(cue).sort().join(',') === [...PIN_WIRE_KEYS].sort().join(',')
      && cue.x === 1.5 && cue.z === -2.5 && cue.roomId === spec.room && cue.kind === 'room',
    JSON.stringify(cue));
  t('NC3b · both crew phones read the pin back off their frames; the bystander and the TV have no row',
    youPin(guide)?.kind === 'room' && youPin(runner)?.kind === 'room'
      && youPin(runner)?.x === 1.5
      && youPin(c) == null && last(host, 'state')?.frame?.you?.pin == null,
    JSON.stringify({ runner: youPin(runner), bystander: youPin(c) }));
}

// ---- NC4 · inside the mission room the same wire carries the job's own target.
const objKind = kindsForJob(spec.job)[0];
guide.send({ t: 'pin', x: 3, z: 4, roomId: spec.room, kind: objKind });
await sleep(80);
t(`NC4 · an objective pin (${objKind}) replaces the door pin on the same four-field wire`,
  last(host, 'pin')?.kind === objKind && youPin(runner)?.kind === objKind
    && isObjectivePin(youPin(guide)?.kind),
  JSON.stringify({ cue: last(host, 'pin'), runner: youPin(runner) }));

// ---- NC5/NC6 · the world walks, shaped exactly as follow-bed reports it.
host.send({ t: 'world', runner: { room: spec.room, x: 1, z: 1 }, hunter: null, mission: { phase: 'seek', room: spec.room } });
await sleep(80);
t('NC5 · seek lights nothing and the beat holds',
  camEvents(host).length === 0 && last(host, 'show')?.beat === 'expedition');

host.send({ t: 'world', runner: { room: spec.room, x: 1, z: 1 }, hunter: null, mission: { phase: 'return', room: 'ballroom' } });
await sleep(80);
const night = srv.rooms.get('couple');
t('NC6 · the job landing (mission.return) lights exactly one camera, publicly, on every seat',
  camEvents(host).length === 1 && camEvents(guide).length === 1 && camEvents(c).length === 1
    && night.game.state.cameras.unlocked === 2
    && last(host, 'show')?.beat === 'expedition',
  JSON.stringify({ tv: camEvents(host).length, unlocked: night.game.state.cameras.unlocked }));

// ---- NC7 · the stale objective pin is dead twice over, and both deaths are asserted together.
t('NC7 · off seek, the server clears the objective pin AND objectiveGoal refuses its ghost',
  youPin(guide) == null && youPin(runner) == null
    && objectiveGoal({ kind: objKind }, { here: 'ballroom', missionRoom: spec.room, targets: { left: { x: 3, z: 4 }, right: { x: 5, z: 4 }, hall: { x: 3, z: 4 }, floor: { x: 5, z: 4 } } }) === null,
  JSON.stringify({ guidePin: youPin(guide) }));

// ---- NC8 · home ends the run on the mission, and the recap card the TV prints from says CAM LIT.
host.send({ t: 'world', runner: { room: 'ballroom', x: 0, z: 0 }, hunter: null, mission: { phase: 'done', room: 'ballroom' } });
await sleep(120);
{
  const card = recapFromEvents(evs(host));
  t('NC8 · mission.done walks the beat to recap on every socket — no clock needed',
    last(host, 'show')?.beat === 'recap' && last(guide, 'show')?.beat === 'recap'
      && last(c, 'show')?.beat === 'recap',
    JSON.stringify({ tv: last(host, 'show')?.beat }));
  t('NC8b · the recap card reads CAM LIT off the vis log — the coupled loop closed',
    card.cameraLit === true && card.camera === 2 && camEvents(host).length === 1,
    JSON.stringify({ cameraLit: card.cameraLit, camera: card.camera }));
}

/*
 * ---- NC9 · THE DARK CONTROL — a run where the job never lands must still read CAM DARK.
 * A gate that cannot see darkness is the circular `party-isolation` I3b again. Second room on
 * the same server; a PHONE tries to be the world authority first and must be ignored.
 */
{
  const dbase = `ws://localhost:${PORT}/?room=dark`;
  const dtv = await open(`${dbase}&host=1`);
  const da = await open(dbase);
  const db = await open(dbase);
  await sleep(80);
  dtv.send({ t: 'start' });
  dtv.send({ t: 'casting' });
  await sleep(80);
  da.send({ t: 'ballot', runner: db.welcome.playerId, guide: da.welcome.playerId });
  await sleep(80);
  dtv.send({ t: 'episode', opts: {} });
  await sleep(PAIR_LOCK_MS + 80);
  da.send({ t: 'world', runner: { room: 'gallery', x: 1, z: 1 }, hunter: null, mission: { phase: 'return', room: 'ballroom' } });
  db.send({ t: 'world', runner: { room: 'gallery', x: 1, z: 1 }, hunter: null, mission: { phase: 'return', room: 'ballroom' } });
  await sleep(80);
  t('NC9 · a phone claiming to be the world lights nothing — the TV socket is the only authority',
    camEvents(dtv).length === 0 && srv.rooms.get('dark').game.state.cameras.unlocked === 1,
    JSON.stringify({ unlocked: srv.rooms.get('dark').game.state.cameras.unlocked }));
  dtv.send({ t: 'world', runner: { room: 'ballroom', x: 0, z: 0 }, hunter: null, mission: { phase: 'done', room: 'ballroom' } });
  await sleep(120);
  const card = recapFromEvents(evs(dtv));
  t('NC9b · a run that comes home without landing the job reads CAM DARK, honestly',
    last(dtv, 'show')?.beat === 'recap' && card.cameraLit === false
      && camEvents(dtv).length === 0,
    JSON.stringify({ beat: last(dtv, 'show')?.beat, cameraLit: card.cameraLit }));
  for (const x of [dtv, da, db]) x.close();
}

for (const x of [host, a, b, c]) x.close();
srv.close();

/* =============================================================================================
 * ---- NC10 · THE BOARD MAY NOT SKIP VERIFY. `web-prototype/night/index.html` is the sell
 * surface, and its rule is printed on it: every card names the gate that proves it, and a DONE
 * card must name a gate that runs in `gates:party`. These checks read the shipped board, so the
 * day somebody marks a card DONE without an in-chain gate — or adds a `data-verify="skip"` —
 * this gate goes red. NC10c is the control: the checker is fed three bad cards and must refuse
 * each, because six "0 hits" rows are worth what the needle is worth (`whisper-split`'s lesson).
 * Reads are CRLF-normalised — `host-desync` H8's one-machine-only red, not repeated.
 * ============================================================================================= */
const here = dirname(fileURLToPath(import.meta.url));
const lf = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

function boardCards(html) {
  return (html.match(/<article\b[^>]*>/g) ?? []).map((tag) => ({
    status: (tag.match(/data-status="([^"]*)"/) ?? [])[1] ?? null,
    gate: (tag.match(/data-gate="([^"]*)"/) ?? [])[1] ?? null,
    lock: (tag.match(/data-lock="([^"]*)"/) ?? [])[1] ?? null,
    skip: /data-verify="skip"/.test(tag),
  }));
}

/**
 * The rule, asked of data. `WANTED` is the one honest non-file value — an OPEN card naming the
 * instrument that does not exist yet — and a DONE card may never use it.
 */
function boardViolations(cards, gateExists, chain) {
  const bad = [];
  for (const c of cards) {
    if (!c.status) bad.push('a card carries no data-status');
    if (c.skip) bad.push(`a ${c.status ?? '?'} card carries data-verify="skip"`);
    if (!c.gate) { bad.push(`a ${c.status ?? '?'} card names no data-gate`); continue; }
    if (c.gate !== 'WANTED' && !gateExists(c.gate)) bad.push(`gate file missing: ${c.gate}`);
    if (c.status === 'done') {
      if (c.gate === 'WANTED') bad.push('a DONE card has no real gate');
      else if (!chain.includes(c.gate)) bad.push(`a DONE card names a gate outside gates:party: ${c.gate}`);
    }
  }
  return bad;
}

{
  let html = null;
  try { html = lf(join(here, '../night/index.html')); } catch { /* NC10 says so below */ }
  const pkg = lf(join(here, '../package.json'));
  const chain = (JSON.parse(pkg).scripts ?? {})['gates:party'] ?? '';
  const gateExists = (f) => existsSync(join(here, f));
  const cards = html ? boardCards(html) : [];
  const locks = cards.filter((c) => c.lock).map((c) => c.lock).sort().join(',');

  t('NC10 · the board exists, with all eight locks as cards and a real card count',
    !!html && cards.length >= 20 && locks === '1,2,3,4,5,6,7,8',
    `${cards.length} cards · locks ${locks || 'none'}`);

  const shipped = boardViolations(cards, gateExists, chain);
  t('NC10b · every card names its gate, and every DONE card\'s gate runs in gates:party',
    !!html && shipped.length === 0, shipped.join(' · ') || `${cards.length} cards clean`);

  const refuse = (card) => boardViolations([card], gateExists, chain).length > 0;
  t('NC10c control · the checker refuses each of the three ways to skip verify',
    refuse({ status: 'done', gate: 'WANTED', lock: null, skip: false })
      && refuse({ status: 'done', gate: 'tag-census.mjs', lock: null, skip: false })
      && refuse({ status: 'done', gate: 'night-coupling.mjs', lock: null, skip: true }),
    'DONE-without-gate, DONE-out-of-chain, skip marker — all red');

  const script = (JSON.parse(pkg).scripts ?? {})['night:board'] ?? '';
  t('NC10d · the board serves on 5205 and nowhere near a live product\'s port',
    script.includes('--port 5205') && !script.includes('5199') && !script.includes('5201')
      && !!html && html.includes('5205'),
    script || 'night:board script missing');
}

console.log(`\nnight-coupling: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
