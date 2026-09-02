#!/usr/bin/env node
/**
 * 🔨 **nom-receipt — A NOMINATION THE SERVER REFUSES SAYS SO, TO THE ONE PHONE THAT TAPPED.**
 *
 *   node harness/nom-receipt.mjs
 *
 * ---------------------------------------------------------------------------------------------
 * 🩸 THE BUG THIS FILE IS THE MEMORY OF
 * ---------------------------------------------------------------------------------------------
 * `net/party/local.mjs`'s handler read, in full:
 *
 *     if (msg.t === 'nominate' && self && !isTV && self.playerId) {
 *       applyNominate(room, self.playerId, msg.target);
 *       return;
 *     }
 *
 * The answer was computed and dropped on the floor. Eight lines further down, `lynchVote` pushes
 * a `ballotOk` receipt to the voter and has done since the day its own header was written; the
 * nominate path pushed nothing. So a refused tap evaporated — and not into silence, which would
 * at least look like nothing had happened. The phone had already set its local debounce from the
 * thumb, `c.noms` never named it, and `party-phone.js` therefore printed **`Sending your
 * nomination…` for the rest of the beat** at a server that had finished with the message. From
 * the sofa a refusal and a dead handset are the same screen.
 *
 * The SYSTEMIC case — `t:'show'` leaving a room on a RECKONING screen the server was not in, so
 * every nomination in the room died with `not reckoning` — is closed and belongs to `show-beat`.
 * What is left is what this file is about: the LEGITIMATE refusals, each individually correct,
 * all of them silent.
 *
 * ---------------------------------------------------------------------------------------------
 * 🧮 EVERY REFUSAL THE RULE CAN PRODUCE, DERIVED RATHER THAN TABULATED
 * ---------------------------------------------------------------------------------------------
 * `episode-order`'s lesson is that a hand-kept list in a gate drifts away from the machine it is
 * meant to be watching, and both halves then pass. So NR1 does not list the reasons: it EXERCISES
 * `src/party/vote.js`'s own `canNominate` / `canBeNominated` on crafted states and collects
 * whatever `why` strings they hand back. A reason added to that file appears in this printout
 * on the next run.
 *
 * NR8 / NR1c used to assert a standing-count cap. That cap is gone. They are now executed
 * negatives: `STANDING_CAP` and `standing-nomination cap reached` must not exist, three
 * unique names must not close Reckoning, and a same-tick second nom is `accusation playing`.
 *
 * The two reasons `applyNominate` owns itself (`not reckoning`, `debrief is still talk`) are not
 * derived — they are OBSERVED, by driving a room into the wrong beat and tapping, which is
 * better evidence than a list either way.
 *
 * ---------------------------------------------------------------------------------------------
 * 🔒 THE PRIVACY LINE — WHY THIS IS A PUSH AND NOT A FANOUT
 * ---------------------------------------------------------------------------------------------
 * A nomination that LANDS is public: it goes out on `noms`, whose `nomRow` is exactly
 * `nominator` + `target`, and the television prints it. A nomination that is REFUSED is not a
 * fact about the room at all — it is an intention that never became one. Fanning "p3 tried to
 * name p5 and was turned down" would put an attempted accusation on eight screens that the
 * nomination board deliberately does not carry, in the one beat where reading the room IS the
 * game. **NR5 asserts that no socket but the tapper's — the television included — ever receives
 * a `nomOk`**, and it asserts it as a count over the whole run rather than at one moment.
 *
 * The `why` itself carries nothing hidden. Every reason is a statement about the current beat
 * (fanned), who is alive (`players[].alive`, an `all` row in `net/party/entitle.js`), which
 * nominations stand (fanned), or a module constant. NR7 keeps the shape closed the way
 * `ballotOk`'s is, and `party-isolation` (Tier 0) is the gate that outranks this one.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ THE VACUOUS PASS — the likeliest way a file like this lies
 * ---------------------------------------------------------------------------------------------
 * "Every refusal produced a receipt" is trivially TRUE of a run where nothing was refused. So no
 * row here believes a receipt before the SERVER's own refusal has been established as ground
 * truth, independently: `applyNominate` is called directly for the same nominator and target, its
 * `{ok:false, why}` is kept, and the standing count is asserted UNCHANGED across the whole
 * attempt. Only then is the handset's receipt compared against it. A rig that stops provoking
 * refusals goes red on NR2, not green on NR4.
 *
 * (A refusal is idempotent and writes nothing, which is why the oracle call and the wire tap can
 * both run against the same room state and must agree. NR2 asserts the no-write half.)
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 A GATE WHOSE CONTROLS STOP FAILING HAS GONE BLIND
 * ---------------------------------------------------------------------------------------------
 * `party-isolation` reported 20 passed / 0 failed — including all four of its blindness controls
 * — while leaking the Glitched to every phone. So this file runs TWO ARMS against two real live
 * rooms on the same server, with the same provocation, judged by the SAME function `attempt()`:
 *
 *   shipped   the real handler, the real push, the real wire
 *   control   the same real handler and the same real push, with the tapping phone's server-side
 *             socket muffled so that any frame carrying `"t":"nomOk"` is dropped before it
 *             leaves. The handset taps over the wire exactly as before and is told exactly what
 *             it used to be told: nothing. The result is dropped again, one layer lower down.
 *
 * The control's own preconditions are what stop IT going blind, and there are three, because
 * each is a way this control could quietly turn into a second shipped arm:
 *
 *   NR9a  the phone really did tap        — otherwise "no receipt" is just "no message"
 *   NR9b  the server really did refuse, with the same `why` as the shipped arm's identical
 *         provocation, and wrote nothing — otherwise there was nothing to report
 *   NR9c  the muffle really engaged (frames dropped > 0) — **if the receipt is ever renamed,
 *         this reddens rather than the control silently passing traffic through**
 *
 * ---------------------------------------------------------------------------------------------
 * 🗓️ RUN LOG (2026-08-28)
 * ---------------------------------------------------------------------------------------------
 * Six provocations over the wire in four live rooms, every one of them refused by the server
 * before anything about a phone was asserted:
 *
 *   already nominated this episode  · nominator has spent it   p1 -> p3   receipt on p1 only
 *   already nominated this episode  · target already standing  p3 -> p2   receipt on p3 only
 *   no self-nomination                                         p5 -> p5   receipt on p5 only
 *   not living                      · target is not a player   p4 -> zzz  receipt on p4 only
 *   not reckoning                   · the room is in the Vote  p1 -> p2   receipt on p1 only
 *   debrief is still talk           · 300s left on the clock   p1 -> p2   receipt on p1 only
 *
 *   shipped arm   7 taps, 7 receipts, 0 on the 15 silent handsets and 0 on all 3 televisions
 *   control arm   2 taps, 1 receipt, 1 `nomOk` frame manufactured and muffled
 *
 * Three ways round, and the middle one is the point:
 *
 *   AGAINST THE SHIPPED BUILD                             22 passed, 0 failed, exit 0
 *   AGAINST THE BUILD THE FINDING WAS FILED AGAINST       14 passed, 8 failed, exit 1
 *     — the handler put back to `applyNominate(room, self.playerId, msg.target); return;`
 *     NR6  FAIL  a nomination that LANDED got no receipt either
 *     NR4  FAIL  0:— · 0:— · 0:— · 0:— · 0:— · 0:—      six refusals, six silences
 *     NR3  FAIL  p0 2 taps / 0 receipts · p2 1/0 · p3 1/0 · p4 1/0 · p0 1/0 · p0 1/0
 *     NR8b FAIL  null
 *     NR9c FAIL  frames dropped 0 — **the blindness guard doing its job**: with nothing to
 *                muffle the control is no longer a control, and it says so instead of passing
 *     and the transcript in one line, which is the bug:
 *       server: {"ok":false,"why":"already nominated this episode"}   phone: NOTHING   ×6
 *   NR2/NR2b/NR5/NR8/NR1c stayed GREEN in that arm — the ground truth is real either way, which
 *   is what stops NR4 from ever passing for the wrong reason.
 *
 * Run alongside: `party-isolation` 24 passed / 0 failed (Tier 0, outranks this file),
 * `phone-accusation` 19 passed / 0 failed, `show-beat` 20 passed / 0 failed.
 */

import {
  startServer, applyNominate, livingSeatedIds, seatedPlayerIds,
  FANOUT_KEYS, FANOUT_FORBIDDEN, fanoutViolations,
} from '../net/party/local.mjs';
import { canNominate, canBeNominated, nominate, ACCUSATION_PLAYING } from '../src/party/vote.js';
import { PHASE } from '../src/party/phases.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const VOTE_SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src/party/vote.js'), 'utf8');

const PORT = 5211;                      // 5209 belongs to `_audio1-mechcheck.mjs`
const PHONES = 7;
/** The receipt's own type, in one place. The muffle keys off it; NR9c reddens if it moves. */
const RECEIPT = 'nomOk';
const NEEDLE = `"t":"${RECEIPT}"`;

let pass = 0, fail = 0;
const t = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); }
  return !!c;
};
const say = (s) => console.log(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function open(url) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const msgs = [];
    const box = {
      ws, msgs, welcome: null,
      /** Taps this handset put on the wire. NR3 is `taps in === receipts out`, per socket. */
      taps: 0,
      send: (o) => { if (o && o.t === 'nominate') box.taps++; ws.send(JSON.stringify(o)); },
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

const receipts = (box) => box.msgs.filter((m) => m.t === RECEIPT);

const srv = startServer({ port: PORT, count: 8, castSeed: 31, worldSeed: 7, code: 'nr' });
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
  return {
    room: srv.rooms.get(code), tv, phones,
    close: () => { for (const c of [tv, ...phones]) c.close(); },
  };
}

/** …and walked into a real Reckoning through the beat door `show-beat` proves is a transition. */
async function reckoningRoom(code) {
  const r = await liveRoom(code);
  r.tv.send({ t: 'show', beat: 'reckoning' });
  await sleep(110);
  return r;
}

/**
 * 🔇 **THE CONTROL'S ABLATION — the result dropped again, one layer lower down.**
 *
 * Wraps ONE handset's server-side socket so any frame carrying the receipt's type never leaves
 * the process. The handler still runs, `applyNominate` still answers, `push` is still called;
 * the phone is simply told nothing, which is the world this change was made to end. Frames are
 * counted so NR9c can assert the ablation engaged — if the receipt is renamed and the needle
 * stops matching, that row goes red instead of the control quietly becoming a second shipped arm.
 */
function muffle(room, socketId, needle) {
  const conn = room.conns.get(socketId);
  if (!conn) return { dropped: () => -1, restore: () => {} };
  const sock = conn.sock;
  const real = sock.write.bind(sock);
  let dropped = 0;
  sock.write = (chunk, ...rest) => {
    if (Buffer.isBuffer(chunk) && chunk.includes(needle)) { dropped++; return true; }
    return real(chunk, ...rest);
  };
  return { dropped: () => dropped, restore: () => { sock.write = real; } };
}

/**
 * ONE provocation, and the ONE reading both arms are judged by. Facts, never verdicts.
 *
 * The oracle runs FIRST and is the ground truth: it is the server's own verb, answering for this
 * nominator and this target against this room state, and it is exactly what the old handler
 * computed and threw away. A refusal writes nothing, so the wire tap that follows meets the same
 * state and must produce the same answer — `wrote` is the assertion that this held.
 */
async function attempt(r, i, target, label) {
  const phone = r.phones[i];
  const from = phone.welcome.playerId;
  const before = r.room.game.state.nominations.length;
  const seen = receipts(phone).length;
  const oracle = applyNominate(r.room, from, target);
  phone.send({ t: 'nominate', target });
  await sleep(120);
  const after = r.room.game.state.nominations.length;
  return {
    label, from, target, oracle,
    wrote: after - before,
    got: receipts(phone).slice(seen),
    beat: r.room.show,
  };
}

/** A nomination meant to LAND, over the wire, believed only once the server's board has it. */
async function land(r, i, target) {
  const phone = r.phones[i];
  const from = phone.welcome.playerId;
  const before = r.room.game.state.nominations.length;
  const seen = receipts(phone).length;
  phone.send({ t: 'nominate', target });
  await sleep(120);
  const noms = r.room.game.state.nominations;
  return {
    from, target,
    stood: noms.some((n) => n.nominator === from && n.target === target),
    wrote: noms.length - before,
    got: receipts(phone).slice(seen),
  };
}

// ================================================================= NR1 · the rule's own reasons
/**
 * Every `why` `src/party/vote.js` can hand back, obtained by exercising its predicates rather
 * than by writing them down. The old standing-count cap is gone; sequential wait is a new why.
 */
function ruleRefusals() {
  const S = (living, nominations) => ({ living, nominations });
  /*
   * ⚠️ Keyed by the `why`, and the VALUE is every predicate that produces it — because two of
   * these strings are produced by BOTH, meaning two different things. `already nominated this
   * episode` from `canNominate` is *you have spent yours*; from `canBeNominated` it is *they are
   * already on the block*. That collision is why the phone disambiguates from the public standing
   * board instead of printing the wire string, and it is visible in this printout rather than
   * buried. Sequential wait is a NEW string on `nominate(..., { playing })`.
   */
  const out = new Map();
  const add = (res, where) => {
    if (!res || res.ok !== false) return;
    out.set(res.why, [...new Set([...(out.get(res.why) || []), where])]);
  };
  add(canNominate(S(['b'], []), 'a'), 'canNominate');
  add(canNominate(S(['a', 'b'], [{ nominator: 'a', target: 'b' }]), 'a'), 'canNominate');
  add(canBeNominated(S(['a'], []), 'a', 'zzz'), 'canBeNominated');
  add(canBeNominated(S(['a'], []), 'a', 'a'), 'canBeNominated');
  add(canBeNominated(S(['a', 'b'], [{ nominator: 'c', target: 'b' }]), 'a', 'b'), 'canBeNominated');
  add(nominate(S(['a', 'b', 'c'], []), 'a', 'b', { playing: true }), 'nominate');
  return out;
}
const RULE = ruleRefusals();
{
  say('  ---- the nomination rule\'s refusal reasons, derived from vote.js\'s own predicates ----');
  for (const [why, where] of RULE) say(`       ${where.join(' + ').padEnd(30)} why: "${why}"`);
  t(`NR1 · vote.js's predicates hand back ${RULE.size} distinct refusal reasons, every one a non-empty string`,
    RULE.size >= 4 && [...RULE.keys()].every((w) => typeof w === 'string' && w.length > 0)
      && !RULE.has('standing-nomination cap reached'),
    `${RULE.size} reasons`);
}

// ================================================================= NR7 · the shape stays closed
{
  const good = { t: RECEIPT, ok: false, target: 'p3', why: 'not reckoning' };
  const widened = { ...good, role: 'glitched' };
  const strayed = { ...good, nominator: 'p1' };
  t('NR7 · the receipt has a row in FANOUT_KEYS, so it is a closed shape and not an unknown type',
    Array.isArray(FANOUT_KEYS[RECEIPT]) && fanoutViolations(good).length === 0,
    `keys [${(FANOUT_KEYS[RECEIPT] || []).join(' ')}]`);
  t('NR7b · and it fails closed — a role field and a stray key are both refused',
    fanoutViolations(widened).some((v) => v.includes('role'))
      && fanoutViolations(strayed).some((v) => v.includes('nominator')),
    `${JSON.stringify(fanoutViolations(widened))} · ${JSON.stringify(fanoutViolations(strayed))}`);
  t('NR7c · no key on the receipt is on FANOUT_FORBIDDEN',
    (FANOUT_KEYS[RECEIPT] || []).every((k) => !FANOUT_FORBIDDEN.includes(k)),
    (FANOUT_KEYS[RECEIPT] || []).join(' '));
}

// ============================================================== the shipped arm · ground truth
const A = await reckoningRoom('nr-ship');
{
  const joined = A.phones.filter((p) => p.welcome?.playerId).length;
  const seated = seatedPlayerIds(A.room).length;
  const living = livingSeatedIds(A.room).length;
  t(`NR0 · ground truth — ${PHONES} handsets hold a playerId and the server seats them`,
    joined === PHONES && seated >= PHONES && living >= PHONES && A.tv.welcome?.isTV === true,
    `joined ${joined}/${PHONES} · seated ${seated} · living ${living} · tv ${A.tv.welcome?.isTV}`);
  t('NR0b · and the room is in a REAL Reckoning — the beat AND the phase, not just the sign',
    A.room.show === 'reckoning' && A.room.game.state.phase === PHASE.RECKONING,
    `show=${A.room.show} phase=${A.room.game.state.phase}`);
}

// ================================================== NR2/NR3/NR4 · six provoked refusals
const shipped = [];
{
  // One nomination that LANDS first — it is what makes the next two refusals real.
  const ok = await land(A, 0, A.phones[1].welcome.playerId);
  t('NR6 · a nomination that lands still gets a receipt, and it says ok',
    ok.stood && ok.wrote === 1 && ok.got.length === 1 && ok.got[0].ok === true
      && ok.got[0].target === ok.target,
    `stood ${ok.stood} · receipts ${ok.got.length} · ${JSON.stringify(ok.got[0] ?? null)}`);

  shipped.push(await attempt(A, 0, A.phones[2].welcome.playerId, 'nominator has spent it'));
  shipped.push(await attempt(A, 2, A.phones[1].welcome.playerId, 'target already standing'));
  shipped.push(await attempt(A, 4, A.phones[4].welcome.playerId, 'named themselves'));
  shipped.push(await attempt(A, 3, 'zzz-not-a-player', 'target is not a player'));
  shipped.push(await attempt(A, 5, A.phones[6].welcome.playerId, 'accusation in flight'));
}
// The two `applyNominate` owns: the wrong beat entirely, and the Debrief before its late window.
{
  const V = await reckoningRoom('nr-vote');
  V.tv.send({ t: 'show', beat: 'vote' });
  await sleep(110);
  shipped.push({ ...(await attempt(V, 0, V.phones[1].welcome.playerId, 'the room is in the Vote')), room: V });

  const D = await liveRoom('nr-debrief');
  D.tv.send({ t: 'show', beat: 'debrief' });
  await sleep(110);
  shipped.push({ ...(await attempt(D, 0, D.phones[1].welcome.playerId, 'Debrief is still talk')), room: D });
}
{
  say('\n  ---- shipped arm · six provocations, the server\'s answer, and what the handset was told ----');
  for (const a of shipped) {
    say(`       ${a.label.padEnd(26)} ${String(a.from).padEnd(4)} -> ${String(a.target).padEnd(16)}`
      + ` server: ${JSON.stringify(a.oracle)}  phone: ${a.got.length ? JSON.stringify(a.got[0]) : 'NOTHING'}`);
  }
  t(`NR2 · ground truth — all ${shipped.length} provocations were REFUSED by the server, and none of them wrote`,
    shipped.length === 7 && shipped.every((a) => a.oracle?.ok === false && typeof a.oracle.why === 'string'
      && a.oracle.why.length > 0 && a.wrote === 0),
    shipped.map((a) => `${a.oracle?.why ?? '?'}/${a.wrote}`).join(' · '));
  t('NR2b · and they are DISTINCT reasons, so no row passes because one refusal was tested six times',
    new Set(shipped.map((a) => a.oracle.why)).size >= 5
      && shipped.some((a) => a.oracle.why === ACCUSATION_PLAYING),
    `${new Set(shipped.map((a) => a.oracle.why)).size} distinct: ${[...new Set(shipped.map((a) => a.oracle.why))].join(' | ')}`);

  t('NR4 · every refusal reached the phone that tapped — one receipt, ok:false, the SERVER\'s own why',
    shipped.every((a) => a.got.length === 1 && a.got[0].ok === false && a.got[0].why === a.oracle.why),
    shipped.map((a) => `${a.got.length}:${a.got[0]?.why ?? '—'}`).join(' · '));
  t('NR4b · and it names the target the thumb actually asked for, so the sheet can say WHO',
    shipped.every((a) => a.got[0]?.target === a.target),
    shipped.map((a) => `${a.got[0]?.target ?? '—'}`).join(' · '));
}

// ============================================ NR3 · taps in === receipts out, on every handset
function ledger(r) {
  return r.phones.map((p, i) => ({ i, taps: p.taps, got: receipts(p).length }));
}
{
  const rooms = [A, shipped[5].room, shipped[6].room];
  const rows = rooms.flatMap(ledger);
  const busy = rows.filter((x) => x.taps > 0);
  const mismatched = rows.filter((x) => x.taps !== x.got);
  t(`NR3 · taps in === receipts out — ${busy.reduce((n, x) => n + x.taps, 0)} nominations sent, none unanswered`,
    busy.length >= 5 && mismatched.length === 0,
    mismatched.length ? mismatched.map((x) => `p${x.i} ${x.taps} taps / ${x.got} receipts`).join(' · ')
      : busy.map((x) => `p${x.i} ${x.taps}/${x.got}`).join(' '));

  // -------------------------------------------------------- NR5 · pushed to one socket, never fanned
  const idle = rows.filter((x) => x.taps === 0 && x.got > 0);
  const tvGot = rooms.reduce((n, r) => n + receipts(r.tv).length, 0);
  t(`NR5 · privacy — no handset that did not tap, and no television, ever saw a receipt`,
    idle.length === 0 && tvGot === 0,
    `silent phones with a receipt ${idle.length} · TV receipts ${tvGot} · watchers ${rows.filter((x) => x.taps === 0).length} phones + ${rooms.length} TVs`);
}

// ================================== NR8 · executed negative — the old standing-count cap is gone
{
  const voteSrc = VOTE_SRC.replace(/\r\n/g, '\n');
  t('NR8 · STANDING_CAP and the cap reason are gone from vote.js',
    !/\bSTANDING_CAP\b/.test(voteSrc)
      && !/standing-nomination cap reached/.test(voteSrc)
      && !/nominations\.length\s*>=\s*STANDING_CAP/.test(voteSrc),
    'old cap must not exist');

  const K = await reckoningRoom('nr-seq');
  const pid = (i) => K.phones[i].welcome.playerId;
  const first = await land(K, 0, pid(1));
  const sameTick = await attempt(K, 2, pid(3), 'second nom same tick');
  t('NR8b · two unique noms in one tick are one landing + accusation playing',
    first.stood && first.wrote === 1
      && sameTick.oracle?.ok === false && sameTick.oracle.why === ACCUSATION_PLAYING
      && sameTick.wrote === 0
      && K.room.game.state.nominations.length === 1
      && K.room.show === 'reckoning',
    `standing ${K.room.game.state.nominations.length} · ${JSON.stringify(sameTick.oracle)}`);
  t('NR8c · the waiting handset is still answered — not left guessing',
    sameTick.got.length === 1 && sameTick.got[0].ok === false
      && sameTick.got[0].why === ACCUSATION_PLAYING,
    JSON.stringify(sameTick.got[0] ?? null));
  K.close();
}

// =========================== NR1c · derived minus observed — the old cap must not be a remainder
{
  const observed = new Set(shipped.map((a) => a.oracle.why));
  const uncovered = [...RULE.keys()].filter((w) => !observed.has(w));
  t('NR1c · every rule reason was provoked; the old cap is not among them',
    uncovered.length === 0
      && !RULE.has('standing-nomination cap reached')
      && ![...observed].includes('standing-nomination cap reached'),
    `observed [${[...observed].join(' | ')}] · unprovoked [${uncovered.join(' | ') || 'none'}]`);
}

// ================================================================= THE CONTROL ARM
say('\n  ---- control arm · the result dropped again: the same handler, the same push, the receipt muffled off the wire ----');
const C = await reckoningRoom('nr-ctrl');
let ctrl = null, mute = null;
{
  const pid = (i) => C.phones[i].welcome.playerId;
  // Same provocation as the shipped arm's first: a nominator who has already spent their name.
  const ok = await land(C, 0, pid(1));
  mute = muffle(C.room, C.phones[0].welcome.id, NEEDLE);
  ctrl = await attempt(C, 0, pid(2), 'nominator has spent it');
  say(`       THE HANDSET TAPPED  : ${ctrl.from} -> ${ctrl.target}`);
  say(`       THE SERVER ANSWERED : ${JSON.stringify(ctrl.oracle)}`);
  say(`       THE HANDSET WAS TOLD: ${ctrl.got.length ? JSON.stringify(ctrl.got[0]) : 'NOTHING'}`);

  t('NR9a control precondition · the phone really did tap — "no receipt" is not merely "no message"',
    ok.stood && C.phones[0].taps === 2,
    `landed ${ok.stood} · taps by p0 ${C.phones[0].taps}`);
  t('NR9b control precondition · the server really did refuse, identically to the shipped arm, and wrote nothing',
    ctrl.oracle?.ok === false && ctrl.oracle.why === shipped[0].oracle.why && ctrl.wrote === 0,
    `${JSON.stringify(ctrl.oracle)} vs shipped ${JSON.stringify(shipped[0].oracle)} · wrote ${ctrl.wrote}`);
  t(`NR9c control precondition · the muffle engaged — a "${RECEIPT}" frame WAS manufactured and dropped`,
    mute.dropped() > 0,
    `frames dropped ${mute.dropped()} · needle ${NEEDLE}`);
}
{
  const RED = [
    ['NR3', receipts(A.phones[0]).length === A.phones[0].taps, receipts(C.phones[0]).length === C.phones[0].taps],
    ['NR4', shipped[0].got.length === 1 && shipped[0].got[0].why === shipped[0].oracle.why,
      ctrl.got.length === 1 && ctrl.got[0]?.why === ctrl.oracle.why],
  ];
  for (const [name, green, red] of RED) {
    t(`NR9 control · ${name} is GREEN on the shipped arm and RED when the result is dropped again`,
      green === true && red === false,
      `shipped ${green} · control ${red}`);
  }
  t('NR9d control · and this is the bug exactly — a refused nomination, and a handset told nothing at all',
    ctrl.got.length === 0 && receipts(C.phones[0]).length < C.phones[0].taps,
    `taps ${C.phones[0].taps} · receipts ${receipts(C.phones[0]).length}`);
}

mute?.restore();
A.close();
C.close();
for (const a of shipped) a.room?.close();
await sleep(80);
srv.close();
console.log(`\nnom-receipt: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
