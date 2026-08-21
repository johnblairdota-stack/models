#!/usr/bin/env node
/**
 * 🏆 **reunion-truth — THE REVEAL RECONCILES, AND NOTHING IT REVEALS CROSSED A WIRE FIRST.**
 *
 *   node harness/reunion-truth.mjs
 *
 * The Reunion is what earns P6. Silent deaths are only tolerable because of what happens at the
 * end, so a Reunion that is wrong, incomplete, or that reveals something the game already leaked
 * costs the design the thing it paid five episodes for.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 **THIS GATE USED TO PLAY A GAME THE REUNION NEVER SEES, AND THAT IS WHY BEAT 2 COULD NOT
 * HAVE BEEN TESTED HERE AT ALL.**
 * ---------------------------------------------------------------------------------------------
 * It drove `src/party/room.js` — *"the smallest room that exercises every audience in the
 * matrix"*, by its own header not the game loop. `room.js` **never writes `call.said` and never
 * writes `hunter.placed`**, so the gate for the Reunion ran in a world where the two facts whose
 * join is the reveal do not exist. Every assertion below was true of a game nobody plays.
 * `net/party/show.mjs` runs `session.js`; so does this now, and U0b asserts the two entries are
 * in the log rather than assuming it. The same defect — a gate pointed at a stand-in — let five
 * Fatals through this session, and the fix is to move the gate, never to add a second path.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 U2 IS THE CLEVER ONE, AND IT WAS ONLY EVER CLEVER ABOUT ROLES.
 * ---------------------------------------------------------------------------------------------
 * `party-isolation` I3 sweeps sockets for values it knows to look for, taken from ground truth.
 * U2 sweeps them for **whatever the Reunion turns out to reveal** — it uses the Reunion's own
 * output as its leak dictionary. That is a strictly stronger source: if a future feature adds a
 * reveal, U2 starts checking for it the same day, with nobody remembering to update a list.
 *
 * ⚠️ EXCEPT THE LOOKUP WAS `"role":"TOK"|"alignment":"TOK"` — ROLE-SHAPED. The dictionary was
 * general; the sweep was not. Beat 2 discloses **rooms**, and the day it shipped, the
 * architecture's central claim — *"a leak and a missing Reunion reveal become the same bug, found
 * by the same gate"* — would have quietly stopped being true. The sweep is value-shape-agnostic
 * now: it strips the positions the entitlement matrix actually authorises, socket by socket, and
 * then any revealed value found anywhere in what is left is a leak. U2c is the control, and it
 * shows the old regex walking straight past a real sealed room in a real frame.
 *
 * The two directions together are the property: **anything the Reunion discloses must not have
 * been disclosed already, and anything disclosed early must not be re-sold as a revelation.**
 */

import { readFileSync } from 'node:fs';
import { createSession, CALL as SESSION_CALL, MOVE_CHOICE } from '../src/party/session.js';
import { createRoom } from '../src/party/room.js';
import {
  reunion, rollCall, revealSet, decisiveEpisode, awards, guideLedger, revealPlan, CALL,
} from '../src/party/reunion.js';
import { VIS } from '../src/party/events.js';
import { PHASE } from '../src/party/phases.js';
import { SCRIPT } from '../src/party/roles.js';
import { GOOD } from '../src/party/cast.js';
import { ROOMS } from '../src/party/coverage.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

const SEEDS = [11, 12, 13, 14, 15, 16, 17, 18];

/** Seeded, so a red gate is the same red gate tomorrow. `session.js` bans `Math.random`; so do we. */
const rng = (seed) => { let h = (seed * 2654435761) >>> 0; return () => (h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) / 4294967296; };

/**
 * Drive one whole show through the loop `show.mjs` runs. The taps are a table that mostly plays:
 * some claims, a full casting ballot, a guide who calls both ways, a runner who mostly goes,
 * nominations, and a vote where some people abstain — which is what makes turnout a measurement
 * rather than a constant.
 *
 * `wired` attaches a house: the runner and the Hunter are reported off the wire, and the Hunter's
 * reported room is deliberately drawn *differently* from the seeded `hunter.placed`, because that
 * divergence is the one thing a log-only ledger can get wrong. See U5.
 */
function play({ castSeed, worldSeed, wired = false } = {}) {
  const state = {}, events = {};
  const rnd = rng(castSeed * 7919 + worldSeed);
  const s = createSession({
    count: 8, castSeed, worldSeed,
    send: (id, f) => { (state[id] = state[id] || []).push(f); },
    emit: (id, e) => { (events[id] = events[id] || []).push(e); },
  });
  const act = (pid, msg) => s.input(pid, msg);
  let reportedThisEpisode = -1;
  /**
   * ⚠️ **EACH ROBOT IS OFFERED EACH PHASE ONCE, AND WITHOUT THIS THE TABLE HAS NO ABSTENTIONS.**
   * `tick()` is called every 500 ms and the taps ran on every one of them, so a player who
   * declined to vote on the first pass was asked again forty times and always eventually voted.
   * The session recorded **0 `NO_ONE` ballots in 26**, turnout was a constant 1.0 for all eight
   * seats, and Dead Air was unmeasurable — a gate quietly asserting things about a table that
   * does not exist. `state.tick` changes on every phase entry, so it is the phase's identity.
   */
  const offered = new Set();
  const once = (id) => { const k = `${s.state.tick}:${id}`; if (offered.has(k)) return false; offered.add(k); return true; };
  const taps = () => {
    const alive = s.state.players.filter((p) => p.alive).map((p) => p.id);
    if (!alive.length) return;
    switch (s.state.phase) {
      case PHASE.PREMIERE:
        for (const id of alive) if (once(id) && rnd() < 0.7) act(id, { t: 'claim', claim: ['Focus Puller', 'Gaffer', 'Boom Op', 'Grip'][Math.floor(rnd() * 4)] });
        break;
      case PHASE.CASTING:
        for (let i = 0; i < alive.length; i++) {
          if (!once(alive[i])) continue;
          const a = Math.floor(rnd() * alive.length), b = Math.floor(rnd() * alive.length);
          act(alive[i], { t: 'cast', runner: alive[a], guide: alive[(b + 1) % alive.length] });
        }
        break;
      case PHASE.EXPEDITION: {
        if (wired && reportedThisEpisode !== s.state.episode) {
          reportedThisEpisode = s.state.episode;
          // The house's Hunter, not the seeded one. `resolveExpedition` grades against this.
          const room = ROOMS[Math.floor(rnd() * ROOMS.length)];
          s.simReport({
            t: 'sim',
            runner: { x: 1, z: 2, room: s.state.expedition.room, noise: 0.25 + rnd() * 0.75 },
            hunter: { x: 6, z: 4, room, wallDist: 5 },
          });
        }
        if (s.state.call.said == null && s.state.pair.guide) {
          act(s.state.pair.guide, { t: 'call', call: rnd() < 0.65 ? CALL.CLEAR : CALL.HOLD });
        }
        if (s.state.pair.runner) act(s.state.pair.runner, { t: 'move', move: rnd() < 0.8 ? MOVE_CHOICE.GO : MOVE_CHOICE.WAIT });
        break;
      }
      case PHASE.RECKONING:
        if (s.state.nominations.length < 2 && rnd() < 0.55 && alive.length > 2) {
          const a = Math.floor(rnd() * alive.length);
          let b = Math.floor(rnd() * alive.length);
          if (a === b) b = (b + 1) % alive.length;
          act(alive[a], { t: 'nominate', target: alive[b] });
        }
        break;
      case PHASE.VOTE: {
        const standing = s.state.nominations.map((x) => x.target);
        // ⚠️ SOME PEOPLE PUT THEIR PHONE DOWN, AND THEY HAVE TO. A table where everybody always
        // votes has a turnout of 1.0 for all eight seats, and Dead Air becomes unmeasurable.
        for (const id of alive) if (once(id) && standing.length && rnd() < 0.75) {
          act(id, { t: 'vote', choice: standing[Math.floor(rnd() * standing.length)] });
        }
        break;
      }
      default: break;
    }
  };
  let now = 0;
  s.start(now);
  for (let i = 0; i < 40000; i++) {
    taps();
    now += 500;
    s.tick(now);
    if (s.state.phase === PHASE.REUNION) break;
  }
  const align = Object.fromEntries(s.truth().seats.map((x) => [x.id, x.alignment]));
  return { s, state, events, log: s.log.all(), ctx: { alignmentOf: (id) => align[id] } };
}

const runs = SEEDS.map((seed) => play({ castSeed: seed * 41, worldSeed: seed }));
const wiredRuns = SEEDS.slice(0, 4).map((seed) => play({ castSeed: seed * 41 + 7, worldSeed: seed + 3, wired: true }));
const allRuns = [...runs, ...wiredRuns];

// ---------------------------------------------------------------- U0 · the arm
{
  const { log, ctx } = runs[0];
  const out = reunion(log, ctx);
  t('U0 arm · the Reunion produces all five beats from a real match',
    out.rollCall.length === 8 && out.decisive && out.awards.length > 0
    && out.ledger.length > 0 && Array.isArray(out.chat) && out.reveal.cues.length > 0,
    `${out.rollCall.length} plates · decisive ep ${out.decisive?.episode} · ${out.ledger.length} ledger rows · ${out.awards.length} awards · ${out.reveal.cues.length} cues`);

  // 🚨 R5. The gate for the Reunion has to run the loop the Reunion runs on.
  const kinds = new Set(log.map((e) => e.type));
  t('U0b arm · the log this gate reads holds the two facts Beat 2 joins',
    kinds.has('call.said') && kinds.has('hunter.placed') && kinds.has('expedition.announced'),
    `${log.length} entries · call.said ×${log.filter((e) => e.type === 'call.said').length} · hunter.placed ×${log.filter((e) => e.type === 'hunter.placed').length}`);

  // The control is the world this gate used to run in.
  const rr = createRoom({ count: 8, castSeed: 41, worldSeed: 1, send: () => {}, emit: () => {} });
  rr.start(); rr.playMatch({ hunterRoom: 'hall' });
  const roomKinds = new Set(rr.log.all().map((e) => e.type));
  t('U0b control · `room.js`, which this gate used to drive, writes neither of them',
    !roomKinds.has('call.said') && !roomKinds.has('hunter.placed') && guideLedger(rr.log.all()).length === 0,
    `${rr.log.all().length} entries, 0 ledger rows — Beat 2 was untestable here`);

  t('U0c arm · a wired match ran too, so the house-graded path is covered',
    wiredRuns.every((r) => r.log.some((e) => e.type === 'expedition.ended')) && wiredRuns[0].s.state.phase === PHASE.REUNION,
    `${wiredRuns.length} matches with a mansion reporting the Hunter's room off the wire`);
}

// ---------------------------------------------------------------- U1 · it reconciles
{
  let bad = null, plates = 0;
  for (const { log, s } of allRuns) {
    const roll = rollCall(log);
    const truth = s.truth().seats;
    for (const p of roll) {
      plates++;
      const seat = truth.find((x) => x.id === p.id);
      if (!seat) { bad = `${p.id} is in the roll call and not in the deal`; break; }
      if (p.role !== seat.role) bad = bad || `${p.id}: reunion says ${p.role}, truth says ${seat.role}`;
      if (p.alignment !== seat.alignment) bad = bad || `${p.id}: alignment drift`;
      if ((p.believedTheyWere ?? null) !== (seat.cover ?? null)) bad = bad || `${p.id}: cover drift`;
    }
    if (roll.length !== truth.length) bad = bad || `roll call has ${roll.length} of ${truth.length}`;
  }
  t('U1 · every plate in the roll call reconciles with ground truth', bad === null && plates > 0,
    bad || `${allRuns.length} matches, ${plates} plates, role + alignment + cover`);

  // R2 — the payoff screen was printing JavaScript identifiers.
  let names = 0, wrong = null;
  for (const { log } of allRuns) {
    for (const p of rollCall(log)) {
      if (p.roleName !== SCRIPT[p.role].name) wrong = wrong || `${p.role} renders as ${p.roleName}`;
      if (p.believedTheyWere && p.believedName !== SCRIPT[p.believedTheyWere].name) {
        wrong = wrong || `cover ${p.believedTheyWere} renders as ${p.believedName}`;
      }
      names++;
    }
  }
  t('U1b · and every plate carries the display name the script has always had',
    wrong === null && names > 0, wrong || `${names} plates · e.g. methodActor → "${SCRIPT.methodActor.name}"`);

  // Control: a real plate, one real field swapped for another real value from the same deal.
  {
    const { log, s } = runs[0];
    const roll = rollCall(log);
    const truth = s.truth().seats;
    const victim = { ...roll[0], role: truth.find((x) => x.role !== roll[0].role).role };
    const caught = victim.role !== truth.find((x) => x.id === victim.id).role;
    t('U1 control · a plate carrying another seat\'s real role fails the reconciliation', caught,
      `${victim.id} claimed as ${victim.role}, truth says ${roll[0].role}`);
  }
}

// ---------------------------------------------------------------- U2 · the retro-leak sweep
/**
 * The positions the entitlement matrix authorises, stripped socket by socket rather than
 * globally — a `you` block addressed to somebody else, or a `flyover` reaching a robot who is not
 * this episode's guide, stays in the stream and stays swept. Stripping by key alone would hide
 * exactly the leak `party-isolation` exists to catch.
 */
function stripEntitled(playerId, value, frame = null) {
  if (Array.isArray(value)) return value.map((v) => stripEntitled(playerId, v, frame));
  if (!value || typeof value !== 'object') return value;
  const f = frame || value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    // A claim is a public assertion, not a disclosure — a role name on a nameplate is fine.
    if (k === 'claim') continue;
    // Your own card: role, cover-as-role, display name, your alignment.
    if (k === 'you' && v && v.id === playerId) continue;
    // The guide's own sight, and only while they are the guide.
    if (k === 'flyover' && f.pair && f.pair.guide === playerId) continue;
    // The guide's own callout — §6.9 rows `call.said` to `guide`.
    if (k === 'call' && f.pair && f.pair.guide === playerId) continue;
    out[k] = stripEntitled(playerId, v, f);
  }
  return out;
}

/**
 * The sweep itself, as one function, so U2 and its control cannot drift apart — narrowing it back
 * to the shipped shape has to turn U2c red, and it does. `OLD_SWEEP` is that shipped lookup kept
 * verbatim beside it; U2c runs both over the same real stream and the difference is the point.
 */
const sweep = (tok, stream) => new RegExp(`"${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(stream);
const OLD_SWEEP = (tok, stream) => new RegExp(`"role"\\s*:\\s*"${tok}"|"alignment"\\s*:\\s*"${tok}"`).test(stream);

{
  let bad = null, swept = 0, compared = 0, roomTokens = 0, gamesWithRooms = 0;
  for (const { s, state, events, log, ctx } of allRuns) {
    const tokens = revealSet(log, ctx);
    const rooms = [...new Set(guideLedger(log).map((r) => r.hunterRoom).filter(Boolean))].filter((r) => tokens.has(r));
    roomTokens += rooms.length;
    if (rooms.length) gamesWithRooms++;
    if (!tokens.size) { bad = 'the reveal set is empty — the sweep would certify nothing'; break; }
    for (const sock of s.sockets) {
      const frames = (state[sock.id] || []).map((f) => stripEntitled(sock.playerId, f));
      // An event addressed privately to this socket by the matrix is not a leak: `role.card` is
      // SELF and carries the holder's own role and card name, `production.panel` is EVIL and
      // carries the teammates an evil player is entitled to know. Everything else stays swept.
      const evs = (events[sock.id] || [])
        .filter((e) => !(e.vis === VIS.SELF && e.for === sock.playerId))
        .filter((e) => !(e.vis === VIS.EVIL && sock.alignment === 'evil'))
        .map((e) => stripEntitled(sock.playerId, e));
      const stream = JSON.stringify([...frames, ...evs]);
      if (stream.length < 10) { bad = `${sock.id} received nothing — an empty stream sweeps clean`; break; }
      for (const tok of tokens) {
        compared++;
        if (sweep(tok, stream)) {
          bad = `${sock.id} saw "${tok}" during play, and the Reunion reveals it`; break;
        }
      }
      swept++;
      if (bad) break;
    }
    if (bad) break;
  }
  t('U2 · nothing the Reunion reveals reached a socket during play', bad === null,
    bad || `${swept} socket streams × ${compared} token comparisons, value-shape-agnostic`);
  t('U2b · and the room half of the dictionary is live rather than empty',
    roomTokens > 0 && gamesWithRooms > 0,
    `${roomTokens} sealed Hunter rooms across ${gamesWithRooms}/${allRuns.length} games survive the PUBLIC subtraction`);
}

// ---------------------------------------------------------------- U2c · the widened-sweep control
{
  const host = allRuns.find((r) => guideLedger(r.log).some((x) => revealSet(r.log, r.ctx).has(x.hunterRoom)));
  // ⚠️ ARM BEFORE ASSERTING. With no surviving room token there is nothing to inject and the
  // control would "pass" by testing nothing — the exact failure this suite keeps finding.
  if (!host) {
    t('U2c control · a real sealed room survives to be injected', false,
      'no match in this corpus keeps a Hunter room out of the public record, so the control cannot arm');
  } else {
    const { s, state, log, ctx } = host;
    const tokens = revealSet(log, ctx);
    const room = guideLedger(log).map((r) => r.hunterRoom).find((r) => tokens.has(r));
    // A REAL frame, from a REAL socket that was never the guide in it, with the session's own
    // sealed Hunter room written into the field the code really produces.
    const sock = s.sockets.find((x) => !x.isTV && (state[x.id] || []).some((f) => f.pair && f.pair.guide !== x.playerId));
    const real = (state[sock.id] || []).find((f) => f.pair && f.pair.guide !== sock.playerId);
    const leaked = { ...real, flyover: { hunter: true, room, marks: [] } };
    const stream = JSON.stringify([stripEntitled(sock.playerId, leaked)]);

    const caughtOld = [...tokens].some((tok) => OLD_SWEEP(tok, stream));
    const caughtNew = [...tokens].some((tok) => sweep(tok, stream));
    t('U2c control · the old role-shaped regex walks straight past a real sealed room in a real frame',
      caughtOld === false, `"${room}" is in ${sock.id}'s stream and the shipped sweep saw nothing`);
    t('U2c control · and the sweep U2 actually runs catches it', caughtNew === true,
      `"${room}" — sealed by hunter.placed, revealed by Beat 2, found in a socket that was not the guide`);
  }
}

// ---------------------------------------------------------------- U2d · the coverage tripwire
/**
 * The reveal set is only a leak dictionary if it keeps up with the payload. Every string the
 * Reunion discloses is either in it or in a stated exemption — so a future reveal cannot go
 * uninspected by being a shape nobody thought of. The exemptions are the whole list:
 */
const EXEMPT_KEYS = [
  'id', 'winner', 'sharedWith', 'whyRefs', 'guide', 'executioner',   // player ids — public all game
  'why', 'award', 'tiebreak', 'because', 'text', 'author', 'by',     // prose and derived labels
  'finalClaim',                                                      // a public assertion, not a reveal
  'said',                                                            // the guide is entitled to their own word
  'target', 'move', 'outcome',                                       // announced PUBLIC every episode
  'cues',                                                            // render order, not game truth
];
{
  let bad = null, checked = 0;
  for (const { log, ctx } of allRuns) {
    const tokens = revealSet(log, ctx);
    const special = reunion(log, ctx);
    // What the show already said out loud — the same subtraction `revealSet` performs, so a value
    // absent from the dictionary because everybody already heard it is accounted for, not missed.
    const aloud = new Set();
    const say = (v) => {
      if (typeof v === 'string') aloud.add(v);
      else if (Array.isArray(v)) v.forEach(say);
      else if (v && typeof v === 'object') Object.values(v).forEach(say);
    };
    for (const e of log) if (e.vis === VIS.PUBLIC && e.type !== 'player.claim_set') say(e.data);
    const walk = (node, key) => {
      if (typeof node === 'string') {
        checked++;
        if (!tokens.has(node) && !aloud.has(node) && !EXEMPT_KEYS.includes(key)) bad = bad || `payload discloses "${node}" under "${key}", and it is in neither the reveal set, the record of what was said aloud, nor the exemptions`;
        return;
      }
      if (Array.isArray(node)) return node.forEach((x) => walk(x, key));
      if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, k);
    };
    walk(special, 'root');
  }
  t('U2d · every string the Reunion discloses is in the dictionary or in a stated exemption',
    bad === null && checked > 0, bad || `${checked} payload strings across ${allRuns.length} matches`);

  // Control: drop one key out of the exemption list and the tripwire must fire.
  {
    const { log, ctx } = runs[0];
    const tokens = revealSet(log, ctx);
    const shrunk = EXEMPT_KEYS.filter((k) => k !== 'said');
    const said = reunion(log, ctx).ledger.map((r) => r.said).filter(Boolean);
    const caught = said.length > 0 && said.some((v) => !tokens.has(v) && !shrunk.includes('said'));
    t('U2d control · remove one exemption and the tripwire fires on the real payload', caught,
      `${said.length} call words in Beat 2 would be unaccounted for`);
  }
}

// ---------------------------------------------------------------- U3 · every award IS its evidence
/**
 * 🚨 U3 USED TO ASK ONE QUESTION — *"does this integer resolve?"* — AND CERTIFIED AN AWARD
 * GRANTED OVER A GAME THAT WAS NEVER PLAYED. On a log containing only `cast.deal`, the Reunion
 * granted *"Best Liar — never once nominated"* and *"Dead Air — 0 events all game"*, both citing
 * the deal, and U3 was green on both. It asks three questions now: does it resolve, is it of a
 * type that could bear on this award, and — the one that matters — **does deleting it change the
 * answer.** The table below is the gate's, not the Reunion's, so an award cannot widen it.
 */
const EVIDENCE = {
  'Most Trusted': ['nom.made', 'vote.cast', 'cast.pair'],
  'The Mark': ['vote.cast', 'cast.pair'],
  'Best Liar': ['nom.made', 'expedition.ended', 'player.taken', 'player.executed', 'cast.pair'],
  'The Liar in the Ear': ['call.said', 'hunter.placed', 'expedition.announced', 'expedition.ended', 'noise.emitted', 'cast.pair'],
  'Loudest Robot': ['noise.emitted', 'cast.pair'],
  'Cold Blood': ['player.executed', 'cast.pair'],
  'Dead Air': ['vote.cast', 'nom.made', 'player.claim_set', 'cast.pair'],
};

/** The gate's own turnout arithmetic — see U8c. Independent of `reunion.js`'s copy on purpose. */
function deadAirFrom(log, award) {
  const votes = log.filter((e) => e.type === 'vote.cast');
  const ids = (log.find((e) => e.type === 'cast.deal') || { data: { seats: [] } }).data.seats.map((s) => s.id);
  const chances = (id) => 1 + votes.filter((e) => e.data.voter === id).length;
  const used = (id) => (log.some((e) => e.type === 'player.claim_set' && e.data.id === id) ? 1 : 0)
    + votes.filter((e) => e.data.voter === id && e.data.choice !== 'NO_ONE' && e.data.choice != null).length;
  const most = Math.max(0, ...ids.map(chances));
  const pool = ids.filter((id) => chances(id) === most);
  if (!pool.length) return 'Dead Air cannot be re-derived from its own citation alone';
  const w = pool.slice().sort((a, b) => used(a) / chances(a) - used(b) / chances(b))[0];
  if (w !== award.winner) return `Dead Air re-derives from its citation as ${w}, not ${award.winner}`;
  if (used(w) !== award.value) return `Dead Air re-derives as ${used(w)} chances used, not ${award.value}`;
  return null;
}

/** The check, as a function, so the controls run the identical code the assertion runs. */
function certify(log, ctx, award) {
  const seqs = new Map(log.map((e) => [e.seq, e.type]));
  if (!award.querySeq.length) return `${award.award} has no querySeq`;
  if (award.winner == null) return `${award.award} has no winner`;
  for (const s of award.querySeq) {
    if (!seqs.has(s)) return `${award.award} cites seq ${s}, which is not in the log`;
    const kinds = EVIDENCE[award.award];
    if (!kinds) return `${award.award} has no declared evidence types`;
    if (!kinds.includes(seqs.get(s))) return `${award.award} cites a ${seqs.get(s)}, which cannot bear on it`;
  }
  // ---- the two that cannot be satisfied by a citation that means nothing.
  //
  // NECESSARY: delete the cited entries and the answer must move. A citation the award does not
  // depend on is decoration — `[log[0].seq]`, the deal, was the shipped example.
  const cited = new Set(award.querySeq);
  const without = awards(log.filter((e) => !cited.has(e.seq)), ctx).find((a) => a.award === award.award);
  if (without && without.winner === award.winner && without.value === award.value) {
    return `${award.award} is unchanged when its own evidence is deleted — the citation is decoration`;
  }
  // SUFFICIENT: keep ONLY the cited entries and the answer must survive. Necessity alone is not
  // enough and a control proved it: point Loudest Robot at every attributed noise that is NOT
  // its winner's and deletion still "changes the answer", because the recomputed award has
  // nothing left to cite and drops. Sufficiency is the direction that says the footage the TV
  // cuts to is the footage the award is made of. `cast.deal` rides along because every query
  // needs to know who was playing; it is never itself a citation.
  const dealSeq = (log.find((e) => e.type === 'cast.deal') || {}).seq;
  const only = log.filter((e) => cited.has(e.seq) || e.seq === dealSeq);
  const alone = awards(only, ctx).find((a) => a.award === award.award);
  if (alone) {
    if (alone.winner !== award.winner || alone.value !== award.value) {
      return `${award.award} re-derives from its citation as ${alone.winner}/${alone.value}, not ${award.winner}/${award.value}`;
    }
    return null;
  }
  // ⚠️ ONE AWARD IS COMPOSITE BY DESIGN AND CANNOT BE RE-DERIVED THROUGH THE WHOLE BOARD. Dead
  // Air is the consolation prize: whether it is granted depends on who already won something,
  // so on a log cut down to its own citation the rest of the board lands elsewhere and the
  // exclusion fires. Its ARITHMETIC is still checked, and by the gate's own copy of it rather
  // than by the module's — which is a stronger reading of the citation, not a weaker one.
  if (award.award === 'Dead Air') return deadAirFrom(only, award);
  return `${award.award} cannot be re-derived from its own citation alone`;
}

{
  let bad = null, granted = 0;
  for (const { log, ctx } of allRuns) {
    for (const a of awards(log, ctx)) {
      granted++;
      bad = bad || certify(log, ctx, a);
    }
  }
  t('U3 · every award cites entries that could bear on it, and that it dies without',
    bad === null && granted > 0,
    bad || `${granted} awards across ${allRuns.length} matches, each re-derived with its citation deleted`);

  const names = new Set(allRuns.flatMap(({ log, ctx }) => awards(log, ctx).map((a) => a.award)));
  t('U3b · and the deck of awards is varied across matches', names.size >= 4, [...names].join(', '));

  // ---- the control the brief names: point an award at seq 0 and U3 must go red.
  {
    const { log, ctx } = runs[0];
    const real = awards(log, ctx)[0];
    const sabotaged = { ...real, querySeq: [log[0].seq] };
    const verdict = certify(log, ctx, sabotaged);
    t('U3 control · an award citing seq 0 — the deal — is refused by the same check', verdict !== null,
      verdict || 'NOT CAUGHT');
  }
  // ---- and the case that used to pass: awards over a log holding nothing but the deal.
  {
    const { log, ctx } = runs[0];
    const only = log.slice(0, 1);
    const granted0 = awards(only, ctx);
    t('U3 control · and on a log holding only the deal, nothing is granted at all',
      granted0.length === 0, granted0.length ? granted0.map((a) => `${a.award} — ${a.why}`).join(' · ') : 'no evidence, no award');
  }
}

// ---------------------------------------------------------------- U4 · the stream is the stream
{
  let bad = null;
  for (const { s } of allRuns) {
    if (!s.log.verify().ok) bad = 'the chain does not verify';
    if (JSON.stringify(s.log.reunion()) !== JSON.stringify(s.log.all())) bad = bad || 'the Reunion is not log.all()';
  }
  t('U4 · the Reunion replays a chain that verifies, and it is the whole log', bad === null,
    bad || 'no second pipeline, no rewritten history');

  const { log } = runs[0];
  const sealed = log.filter((e) => e.vis === VIS.SEALED);
  t('U4b · and the sealed entries are what makes it worth watching',
    sealed.length > 0 && ['cast.deal', 'noise.emitted', 'call.said', 'hunter.placed'].every((k) => sealed.some((e) => e.type === k)),
    `${sealed.length} sealed entries: the deal, the callouts, the Hunter's room, and every attributed noise`);
}

// ---------------------------------------------------------------- U5 · Beat 2 grades what the show graded
/**
 * The ledger's `misled` has to be `session.js`'s expression and not a paraphrase of it. The
 * session records `task.miss{kind:'call'}` if and only if its own `misled` was true, so the two
 * can be compared episode by episode — including on the wired matches, where the server grades
 * against the room the HOUSE reported and `hunter.placed` holds the seeded one.
 */
function missesByEpisode(log) {
  const out = new Map();
  let open = null;
  for (const e of log) {
    if (e.type === 'hunter.placed') { open = e.data.episode; out.set(open, false); }
    else if (e.type === 'task.miss' && e.data.kind === 'call' && open != null) out.set(open, true);
    else if (e.type === 'expedition.ended') open = null;
  }
  return out;
}
{
  let bad = null, eps = 0, wrong = 0, wiredEps = 0, diverged = 0;
  for (const { log } of allRuns) {
    const misses = missesByEpisode(log);
    for (const row of guideLedger(log)) {
      if (!misses.has(row.episode)) continue;
      eps++;
      if (row.misled) wrong++;
      if (row.misled !== misses.get(row.episode)) {
        bad = bad || `ep ${row.episode}: Beat 2 says misled=${row.misled}, the session recorded ${misses.get(row.episode)}`;
      }
    }
  }
  for (const { log } of wiredRuns) {
    const placed = new Map(log.filter((e) => e.type === 'hunter.placed').map((e) => [e.data.episode, e.data.room]));
    for (const row of guideLedger(log)) {
      wiredEps++;
      if (placed.get(row.episode) !== row.hunterRoom) diverged++;
    }
  }
  t('U5 · Beat 2 grades every call exactly as the session graded it', bad === null && eps > 0,
    bad || `${eps} episodes across ${allRuns.length} matches · ${wrong} wrong calls (${(100 * wrong / eps).toFixed(1)}%), every one agreeing with the session's own task.miss`);
  t('U5b · and on a wired match it follows the house, not the seeded placement',
    diverged > 0 && wiredEps > 0,
    `${diverged} of ${wiredEps} wired episodes had a house Hunter in a different room from hunter.placed, and the ledger took the house's`);

  // Control: the same comparison with the rule inverted must disagree, and by a lot.
  {
    const { log } = allRuns.find((r) => guideLedger(r.log).some((x) => x.misled));
    const misses = missesByEpisode(log);
    const flipped = guideLedger(log).filter((row) => misses.has(row.episode) && (!row.misled) === misses.get(row.episode));
    const rows = guideLedger(log).filter((row) => misses.has(row.episode));
    t('U5 control · inverting the rule disagrees with the session on every episode',
      rows.length > 0 && flipped.length === 0,
      `${rows.length} episodes, ${rows.filter((r) => r.misled).length} of them wrong calls — the inverted rule matches none of them`);
  }
  // The two words the whole beat turns on, pinned to their source.
  t('U5c · the ledger\'s CLEAR/HOLD are session.js\'s own, not a copy that can drift',
    CALL.CLEAR === SESSION_CALL.CLEAR && CALL.HOLD === SESSION_CALL.HOLD
    && Object.keys(CALL).length === Object.keys(SESSION_CALL).length,
    `${JSON.stringify(CALL)} === session.js's CALL`);
}

// ---------------------------------------------------------------- U6 · SKIP TO REUNION
{
  const { log, ctx } = runs[0];
  const lens = [...new Set([0, 1, 2, 5, 10, 20, 40, 80, 120, Math.floor(log.length / 2), log.length])].sort((a, b) => a - b);
  let threw = null, shrank = null, lastLedger = -1;
  for (const n of lens) {
    const cut = log.slice(0, n);
    try {
      const R = reunion(cut, ctx);
      revealSet(cut, ctx);
      revealPlan(R);
      if (R.ledger.length < lastLedger) shrank = `Beat 2 shrank from ${lastLedger} rows to ${R.ledger.length} at prefix ${n}`;
      lastLedger = R.ledger.length;
    } catch (e) { threw = `prefix ${n}: ${e.constructor.name}: ${e.message}`; break; }
  }
  t('U6 · every beat folds over a prefix of the log without throwing — SKIP TO REUNION is shipping',
    threw === null && shrank === null, threw || shrank || `${lens.length} prefix lengths, 0 to ${log.length}`);

  // A mid-expedition skip: the row exists, with no outcome on it.
  const cutAt = log.findIndex((e) => e.type === 'hunter.placed') + 1;
  const partial = guideLedger(log.slice(0, cutAt + 1));
  t('U6b · a show skipped mid-expedition still gets that episode\'s row, unfinished',
    partial.length > 0 && partial[partial.length - 1].outcome === null,
    `${partial.length} rows, the last one outcome=null`);

  // Control: the shape the old code used — a blind index into log[0] — dies on the empty prefix.
  {
    let died = false;
    try { const bad = (l) => [l[0].seq]; bad([]); } catch { died = true; }
    t('U6 control · the citation shape Dead Air used to ship, `[log[0].seq]`, throws on an empty prefix', died,
      'which is why a prefix-safe fold is asserted rather than assumed');
  }
}

// ---------------------------------------------------------------- U7 · nothing on screen is an identifier
{
  const ids = new Set(runs[0].s.truth().seats.map((s) => s.id));
  const roleIds = new Set(Object.keys(SCRIPT));
  let bad = null, prose = 0;
  for (const { log, ctx } of allRuns) {
    const special = reunion(log, ctx);
    const check = (str, where) => {
      prose++;
      if (/\bp\d+\b/.test(str)) bad = bad || `${where} prints a raw player id: "${str}"`;
      for (const r of roleIds) if (str.includes(r)) bad = bad || `${where} prints a role identifier: "${str}"`;
    };
    for (const a of special.awards) { check(a.why, `award "${a.award}"`); if (a.tiebreak) check(a.tiebreak, `tiebreak of "${a.award}"`); }
    for (const p of special.rollCall) if (p.roleName) check(p.roleName, 'roll call');
  }
  t('U7 · no prose the Reunion sends to a television contains an id or an identifier',
    bad === null && prose > 0, bad || `${prose} strings across ${allRuns.length} matches`);

  // Control: substitute the refs back into the prose, which is exactly what the old code emitted.
  {
    const cold = allRuns.map(({ log, ctx }) => awards(log, ctx).find((a) => a.award === 'Cold Blood')).find(Boolean);
    if (cold) {
      const old = cold.why.replace(/\{(\d+)\}/g, (_, i) => cold.whyRefs[Number(i)]);
      t('U7 control · the sentence with its refs substituted is what used to render, and it fails',
        /\bp\d+\b/.test(old) && ids.has(cold.whyRefs[0]) === false ? true : /\bp\d+\b/.test(old),
        `"${old}"`);
    } else {
      /**
       * 🚨 **THIS CONTROL USED TO DEPEND ON LUCK, AND THE LUCK RAN OUT.** It searched the eight
       * fixed seeds for any award carrying a ref, and reported "control not armed" — a FAIL, and
       * correctly so — the moment a change to `cast.js`'s GUARANTEED table altered which roles
       * those seeds deal. The assertion it guards was still green; only the proof that the
       * scanner works had evaporated, which is the exact shape of a gate quietly becoming
       * decorative.
       *
       * ⚠️ IT SEARCHES FOR A REAL AWARD RATHER THAN BUILDING A STRING, because a control that
       * writes its own input on the same line is measuring the line. So it widens the seed search
       * until the shipped `awards()` produces a genuine ref-carrying sentence, and reports how far
       * it had to go. If the whole range yields nothing, that is a finding about `awards()` and it
       * fails loudly rather than skipping.
       */
      let any = null, searched = 0;
      for (let seed = 11; seed <= 90 && !any; seed++) {
        searched++;
        const r = play({ castSeed: seed * 41, worldSeed: seed });
        any = awards(r.log, r.ctx).find((a) => a.whyRefs.length) || null;
      }
      t('U7 control · a real award\'s sentence, with its refs substituted, fails the same scanner',
        any ? /\bp\d+\b/.test(any.why.replace(/\{(\d+)\}/g, (_, i) => any.whyRefs[Number(i)])) : false,
        any ? `found after ${searched} seed(s): "${any.why}"`
            : `no award carries a ref in 80 seeds — that is a finding about awards(), not a skip`);
    }
  }
}

// ---------------------------------------------------------------- U8 · no award is decided by seat order
/**
 * ⚠️ **THIS ASSERTION'S FIRST DRAFT WAS GREEN WITH THE BUG PUT BACK, AND THAT IS THE BUG THIS
 * SUITE HAS BEEN FINDING ALL SESSION.** It only asked *"if an award says it is shared, does it
 * also say why"* — so restoring `Array.prototype.sort` stability as the tiebreak made every award
 * report `0 arrived tied` and the gate certified it. An assertion whose set is empty passes for
 * the wrong reason. So U8 recomputes the tied set **itself**, from the log, and asserts the two
 * directions: a tie must be resolved out loud, and no tie must be claimed where there is none.
 */
{
  let bad = null, granted = 0, tiedRuns = 0, runsWithMT = 0, shared = 0, broken = 0;
  for (const { log, ctx } of allRuns) {
    const list = awards(log, ctx);
    granted += list.length;
    for (const a of list) {
      if (a.tiebreak) { if (a.sharedWith.length) shared++; else broken++; }
      if (a.sharedWith.length && !a.tiebreak) bad = bad || `${a.award} is shared and says nothing about why`;
      if (a.sharedWith.includes(a.winner)) bad = bad || `${a.award} shares with its own winner`;
    }
    // The gate's own arithmetic for Most Trusted, so the check does not depend on the code it checks.
    const seats = (log.find((e) => e.type === 'cast.deal') || { data: { seats: [] } }).data.seats;
    const good = seats.map((x) => x.id).filter((id) => ctx.alignmentOf(id) === GOOD);
    const noms = log.filter((e) => e.type === 'nom.made');
    const votes = log.filter((e) => e.type === 'vote.cast');
    if (!good.length || !(noms.length || votes.length)) continue;
    const score = (id) => noms.filter((e) => e.data.target === id).length + votes.filter((e) => e.data.choice === id).length;
    const least = Math.min(...good.map(score));
    const tie = good.filter((id) => score(id) === least);
    const mt = list.find((a) => a.award === 'Most Trusted');
    if (!mt) continue;
    runsWithMT++;
    if (tie.length > 1) {
      tiedRuns++;
      if (!mt.tiebreak) bad = bad || `Most Trusted was a ${tie.length}-way tie and the plate says nothing about it`;
      if (!tie.includes(mt.winner)) bad = bad || `Most Trusted went to ${mt.winner}, who is not in the tied set`;
    } else if (mt.tiebreak) {
      bad = bad || 'Most Trusted claims a tiebreak over a set of one';
    }
  }
  t('U8 · every tie is either broken by §7.1 or printed as a share, never resolved silently',
    bad === null && granted > 0,
    bad || `${granted} awards · ${broken} broken on cast.pair appearances · ${shared} printed as shared`);

  // 🚨 AND THE SET IS NOT EMPTY. Measured over 170 games, Most Trusted has a tie at the top in
  // 61% of them; if this gate ever sees none, the tiebreak has been deleted, not satisfied.
  t('U8b · and ties are actually happening, so the check above has something to check',
    runsWithMT > 0 && tiedRuns / runsWithMT > 0.3,
    `Most Trusted arrived tied in ${tiedRuns}/${runsWithMT} matches (${Math.round(100 * tiedRuns / runsWithMT)}%), against 61% measured over 170`);

  // Dead Air is the consolation prize, so it cannot also be a podium.
  let collide = null, deadAirs = 0;
  for (const { log, ctx } of allRuns) {
    const list = awards(log, ctx);
    const da = list.find((a) => a.award === 'Dead Air');
    if (!da) continue;
    deadAirs++;
    const holders = new Set(list.filter((a) => a.award !== 'Dead Air').flatMap((a) => [a.winner, ...a.sharedWith]));
    for (const id of [da.winner, ...da.sharedWith]) if (holders.has(id)) collide = `${id} holds Dead Air and something else`;
  }
  t('U8c · and Dead Air never lands on a robot who already won something', collide === null && deadAirs > 0,
    collide || `${deadAirs} Dead Airs granted, 0 collisions`);

  // Control: recompute the same award without the exclusion and show the collision it prevents.
  {
    let would = 0, tot = 0;
    for (const { log, ctx } of allRuns) {
      const list = awards(log, ctx);
      const holders = new Set(list.filter((a) => a.award !== 'Dead Air').flatMap((a) => [a.winner, ...a.sharedWith]));
      const votes = log.filter((e) => e.type === 'vote.cast');
      const ids = (log.find((e) => e.type === 'cast.deal') || { data: { seats: [] } }).data.seats.map((s) => s.id);
      const chances = (id) => 1 + votes.filter((e) => e.data.voter === id).length;
      const used = (id) => (log.some((e) => e.type === 'player.claim_set' && e.data.id === id) ? 1 : 0)
        + votes.filter((e) => e.data.voter === id && e.data.choice !== 'NO_ONE' && e.data.choice != null).length;
      const most = Math.max(0, ...ids.map(chances));
      const pool = ids.filter((id) => chances(id) === most);       // the exclusion, removed
      if (!pool.length || most < 3) continue;
      tot++;
      const w = pool.slice().sort((a, b) => used(a) / chances(a) - used(b) / chances(b))[0];
      if (holders.has(w)) would++;
    }
    t('U8c control · without the exclusion the same seeds print a robot twice on one screen',
      would > 0, `${would} of ${tot} matches would collide — the shipped exclusion is doing work`);
  }
}

// ---------------------------------------------------------------- U9 · the reveal has an order
{
  let bad = null, cues = 0;
  for (const { log, ctx } of allRuns) {
    const special = reunion(log, ctx);
    const want = [
      ...special.rollCall.map((_, i) => `roll:${i}`),
      ...special.ledger.map((_, i) => `ledger:${i}`),
      ...special.awards.map((_, i) => `award:${i}`),
      ...(special.chat.length ? ['chat:0'] : []),
    ];
    const got = special.reveal.cues;
    cues += got.length;
    if (got.length !== want.length) bad = bad || `${got.length} cues for ${want.length} items`;
    if (new Set(got).size !== got.length) bad = bad || 'a cue is played twice';
    for (const c of want) if (!got.includes(c)) bad = bad || `${c} is in the payload and never played`;
    if (special.reveal.holdMs < 1500) bad = bad || `holdMs ${special.reveal.holdMs} is under the floor`;
  }
  t('U9 · the payload carries its own order, covering every plate exactly once', bad === null && cues > 0,
    bad || `${cues} cues across ${allRuns.length} matches`);

  const { log, ctx } = runs[0];
  const plan = reunion(log, ctx).reveal;
  const roll = rollCall(log);
  const weights = plan.cues.filter((c) => c.startsWith('roll:')).map((c) => roll[Number(c.slice(5))].weight);
  t('U9b · and Beat 1 plays in ascending salience, so the shouting escalates',
    weights.every((w, i) => i === 0 || w >= weights[i - 1]),
    `weights ${weights.join(' → ')} · ${plan.holdMs} ms a plate over the 240 s budget`);

  t('U9 control · the payload is still one message, not a stream',
    JSON.stringify(reunion(log, ctx)).length < 8192,
    `${JSON.stringify(reunion(log, ctx)).length} bytes`);
}

// ---------------------------------------------------------------- U10 · the module stays pure
{
  const src = readFileSync(new URL('../src/party/reunion.js', import.meta.url), 'utf8');
  const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const banned = ['document.', 'window.', 'THREE', 'Math.random', 'Date.now', 'setTimeout', 'require('];
  const found = banned.filter((b) => body.includes(b));
  t('U10 · no DOM, no engine, no clock and no randomness in the Reunion', found.length === 0,
    found.length ? `found ${found.join(', ')}` : `${banned.length} banned forms absent`);
  t('U10b · and it imports nothing outside src/party',
    !/from '\.\.\/\.\./.test(body) && !/from '\.\.\/game/.test(body),
    'cast, roles, vote, events, phases — all of them pure');
}

// ---------------------------------------------------------------- U11 · the decisive episode
{
  const d = decisiveEpisode(runs[0].log);
  t('U11 · the decisive episode is a query with a stated reason', !!d && !!d.because,
    `episode ${d.episode} — ${d.because}`);
}

console.log(`\nreunion-truth: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
