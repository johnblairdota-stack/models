#!/usr/bin/env node
/**
 * 🤐 **party-anon — THE GAME NEVER NAMES THE CULPRIT.**
 *
 *   node harness/party-anon.mjs
 *
 * Tier 0 (`docs/design/rrr-gates.md` §4). Task Contract **T5**: *"never name the culprit — no
 * timings, no accuracy readouts, no per-player stats, until the Reunion"*, which the bible calls
 * the single easiest way to accidentally destroy the game.
 *
 * It is easy to destroy by accident precisely because attribution is HELPFUL. "Someone was 0.4s
 * late" is a debug line a reasonable person adds while tuning the Fuse Run, and it ships in a
 * caption. The whole deduction game is that the lie and the honest mistake are the same
 * observable event; one timing readout and they are not.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS IS FIVE LINES INSTEAD OF AN ARMS RACE
 * ---------------------------------------------------------------------------------------------
 * Prohibiting attribution field by field is unwinnable — the next helpful field is always one PR
 * away. So `src/party/events.js` makes the failure schema **CLOSED**: four fields, `{kind, room,
 * phaseTick, loudness}`, and `makeEvent` throws on anything else at construction. A1 asserts the
 * allow-list holds on the wire as well as at the constructor.
 *
 * 🚨 **A3 IS THE ONE THAT EARNS ITS KEEP.** `timings: [0.4, 0.0]` contains no name, no id and no
 * seat — and names the culprit by POSITION. Any array whose length is the crew size is an
 * accusation with the serial number filed off.
 *
 * 🚨 **A8 IS THE ONE ASSERTION HERE THAT IS ABOUT INFORMATION RATHER THAN ABOUT SHAPE, AND IT
 * LIVES IN THIS FILE BECAUSE IT IS THE SAME CONTRACT.** A1-A4 ask *"does this payload name
 * anybody?"* — and a payload can pass all four while being a perfect index of one player's
 * honesty. `incident.alarms` was exactly that: rowed `all`, printed permanently in the corner of
 * the television, and incremented in one place only, if and only if the guide's call had been
 * wrong. Anonymous by shape, an accusation by arithmetic. So A8 asks the question the shape
 * checks cannot: **given the number the table can see, is more than one history still possible?**
 *
 * 🚨 **A6 IS THE SCANNER'S OWN ARM.** A scanner that never finds attribution anywhere is
 * indistinguishable from a scanner that cannot find attribution. So A6 points it at the Reunion,
 * where attribution is the entire point, and REQUIRES it to go red.
 */

import { createRoom } from '../src/party/room.js';
import { createSession, CALL, MOVE_CHOICE, INCIDENT_LOUD } from '../src/party/session.js';
import { PHASE } from '../src/party/phases.js';
import { FAILURE_FIELDS, FAILURE_KINDS, isFailure, makeEvent, VIS } from '../src/party/events.js';
import { allCaptions, LOWER_THIRD } from '../src/party/captions.js';
import { KIND } from '../src/party/director.js';

let pass = 0, fail = 0, skip = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };
const skipped = (n, why) => { skip++; console.log(`  SKIP ${n} · ${why}`); };

// ---- drive real rooms and collect what actually went into the log
const GAMES = 40;
const failures = [];
const frames = [];
let truth = null;
for (let s = 0; s < GAMES; s++) {
  const r = createRoom({ count: 8, castSeed: 1000 + s, worldSeed: s, send: (id, f) => frames.push({ id, f }) });
  r.start(); r.playEpisode(); r.playEpisode();
  truth = r.truth();
  for (const e of r.log.all()) if (isFailure(e.type)) failures.push(e);
}
const roster = truth.seats.map((s) => ({ id: s.id, seat: s.seat, name: `Robot ${s.seat + 1}` }));
const CREW = 2;

// ---------------------------------------------------------------- A0 · the arm
{
  const kinds = [...new Set(failures.map((f) => f.type))];
  if (!failures.length) skipped('A0 arm', 'no failure events in any game — T5 unprovable');
  else t('A0 arm · failure events exist to inspect', true, `${failures.length} events, kinds: ${kinds.join(', ')}`);
}

// ---------------------------------------------------------------- A0b · the declared kinds
/**
 * 🚨 **THIS WAS A SKIP AND ITS WORDING WAS UNTRUE.** It read *"not exercised by the stub room"*,
 * which says the kinds are exercised somewhere else. `task.timeout`, `rig.collapse` and
 * `noise.spike` are emitted by nothing, anywhere in the tree — not by `room.js`, not by
 * `session.js`, not by the mansion. The line was a SKIP standing in for a PASS, which is the one
 * thing a SKIP may never do.
 *
 * ⚠️ **THE KINDS STAY, AND DELETING THEM WOULD HAVE BEEN THE WORSE ANSWER.** `FAILURE_KINDS` is
 * not a claim that a type is emitted. It is the list `makeEvent` consults to decide whose payload
 * is closed, and pre-registering a type is what stops the author who eventually writes the
 * emitter from inventing `culprit`, `by` or `timings` beside it — T5's whole failure mode, since
 * the next helpful debug line is always one PR away. A kind removed for being unemitted is a kind
 * that arrives later with an open schema and no gate watching.
 *
 * So the coverage claim is made about the thing that CAN be true of an unemitted kind: the closed
 * schema refuses attribution on every declared kind, emitted or not, through the shipped
 * constructor. The split is reported rather than hidden, and A0b control proves the refusal comes
 * from the list rather than from `makeEvent` refusing everything.
 */
{
  const kinds = [...new Set(failures.map((f) => f.type))];
  const unemitted = FAILURE_KINDS.filter((k) => !kinds.includes(k));
  const clean = { kind: 'call', room: 'gallery', phaseTick: 7, loudness: 0.62 };
  const attributed = { ...clean, culprit: 'p3' };
  const throws = (fn) => { try { fn(); return false; } catch { return true; } };

  const leaky = FAILURE_KINDS.filter((k) => !throws(() => makeEvent(k, VIS.PUBLIC, attributed)));
  t('A0b · every declared failure kind refuses an attributed payload, emitted or not — T5 at construction',
    leaky.length === 0,
    leaky.length ? `accepted a culprit: ${leaky.join(', ')}`
      : `${FAILURE_KINDS.length} kinds · observed in play: ${kinds.join(', ')} · declared ahead of any emitter: ${unemitted.join(', ')}`);

  const rejected = FAILURE_KINDS.filter((k) => throws(() => makeEvent(k, VIS.PUBLIC, clean)));
  t('A0b arm · and accepts the schema\'s own four fields, so A0b is not passing on a constructor that throws at everything',
    rejected.length === 0,
    rejected.length ? `refused a legal payload: ${rejected.join(', ')}` : `[${FAILURE_FIELDS.join(', ')}] accepted on all ${FAILURE_KINDS.length}`);

  t('A0b control · a type that is NOT on the list takes the culprit without complaint — the list is the guard',
    !throws(() => makeEvent('task.almost', VIS.PUBLIC, attributed)) && !isFailure('task.almost'),
    'so a kind deleted for being unemitted is a kind that comes back later with an open schema');
}

// ---------------------------------------------------------------- the scanners
/** Every value in a payload, recursively, with its JSON pointer. */
function* values(node, path = '') {
  if (node === null || typeof node !== 'object') { yield [path, node]; return; }
  if (Array.isArray(node)) { for (let i = 0; i < node.length; i++) yield* values(node[i], `${path}[${i}]`); return; }
  for (const k of Object.keys(node)) yield* values(node[k], path ? `${path}.${k}` : k);
}

/** A2's sweep. Returns the first hit, or null. Case-folded, substring, recursive. */
function findIdentity(payload, people) {
  for (const [path, v] of values(payload)) {
    if (typeof v === 'string') {
      const lo = v.toLowerCase();
      for (const p of people) {
        if (lo.includes(p.name.toLowerCase())) return `${path} contains display name "${p.name}"`;
        if (lo === p.id.toLowerCase()) return `${path} is player id "${p.id}"`;
      }
    }
    if (typeof v === 'number' && people.some((p) => p.seat === v) && /seat|who|by|culprit|player/i.test(path)) {
      return `${path} = ${v} is a seat index`;
    }
  }
  for (const k of Object.keys(payload || {})) {
    if (people.some((p) => p.id === k)) return `payload is keyed by player id "${k}"`;
  }
  return null;
}

/** A3's sweep: attribution by position rather than by name. */
function findPositional(payload, crewSize) {
  for (const [path, v] of values(payload)) void v;
  const walk = (node, path = '') => {
    if (node === null || typeof node !== 'object') return null;
    if (Array.isArray(node)) {
      if (node.length === crewSize) return `${path} is an array of length ${crewSize} (= crew size)`;
      for (let i = 0; i < node.length; i++) { const h = walk(node[i], `${path}[${i}]`); if (h) return h; }
      return null;
    }
    for (const k of Object.keys(node)) { const h = walk(node[k], path ? `${path}.${k}` : k); if (h) return h; }
    return null;
  };
  return walk(payload);
}

// ---------------------------------------------------------------- A1 · closed schema
{
  let bad = null;
  for (const f of failures) {
    const extra = Object.keys(f.data).filter((k) => !FAILURE_FIELDS.includes(k));
    if (extra.length) { bad = `${f.type} carries ${extra.join(', ')}`; break; }
  }
  t('A1 · no field outside the allow-list on any failure payload', bad === null,
    bad || `${failures.length} payloads, allow-list {${FAILURE_FIELDS.join(', ')}}`);
}

// ---------------------------------------------------------------- A2 · no identity, any depth
{
  let bad = null;
  for (const f of failures) { const h = findIdentity(f.data, roster); if (h) { bad = `${f.type}: ${h}`; break; } }
  t('A2 · no id, name or seat in any failure payload', bad === null, bad || `${failures.length} payloads swept`);
}

// ---------------------------------------------------------------- A3 · no positional attribution
{
  let bad = null;
  for (const f of failures) { const h = findPositional(f.data, CREW); if (h) { bad = `${f.type}: ${h}`; break; } }
  t('A3 · no array of crew length, no map keyed by player', bad === null, bad || `crew size ${CREW}`);
}

// ---------------------------------------------------------------- A4 · the count is a count
{
  const incidents = frames.map(({ f }) => f.incident).filter(Boolean);
  const bad = incidents.find((i) => Array.isArray(i.alarms) || typeof i.alarms !== 'number');
  t('A4 · incident.alarms is a scalar count, never a list', !bad,
    bad ? JSON.stringify(bad) : `${incidents.length} frames, all numeric`);
}

// ---------------------------------------------------------------- A5 · the TV caption sweep
/**
 * 🚨 THIS WAS A SKIP UNTIL THE RENDERER ADAPTER EXISTED, AND IT IS NOW A SWEEP OF THE WHOLE
 * OUTPUT SPACE RATHER THAN OF WHATEVER A PLAYTHROUGH HAPPENED TO SHOW.
 *
 * The old note read *"there are no DOM captions to sweep. Browser arm lands with the shot
 * solvers."* They have landed — and the shape they landed in is better than a DOM sweep: the
 * lower third and the shot bug are CLOSED GENERATORS (`src/party/captions.js`,
 * `src/party/shots.js`), so `allCaptions()` is every caption the television can ever show. A
 * screenshot proves something about one evening; this proves it about all of them.
 *
 * It is pointed at THIS game's real roster and real deal, not a synthetic one, so a caption that
 * happened to contain a dealt role name would be caught here even if `shot-solver` H8's fixture
 * missed it. The DOM half is `shot-solver` H12, which renders the same strings in real Chromium.
 */
{
  const caps = allCaptions();
  const roles = [...new Set(truth.seats.map((x) => x.role))];
  // Whole words: "ba(llroo)m" contains the player "Roo", and a sweep that cries wolf on the room
  // list is a sweep somebody switches off. A7d below proves it still catches the real thing.
  const word = (text, n) => new RegExp(`(^|[^\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'iu').test(text);
  const needles = [...roster.map((p) => p.name), ...roster.map((p) => p.id), ...roles, 'evil', 'good'];
  const hit = caps.filter((c) => needles.some((n) => word(c, n)));
  t('A5 · the entire caption bank, swept against this game\'s roster and deal, names nobody',
    hit.length === 0, hit.join(' / ') || `${caps.length} captions × ${needles.length} needles — §6.6`);
  t('A5b · and the bank speaks for every event kind the Director emits, so none falls through',
    KIND.every((k) => k in LOWER_THIRD),
    `${KIND.length} kinds, ${caps.length} captions`);
  t('A5c · the one kind with no caption at all is `progress` — §6.8\'s progress-bar ban',
    LOWER_THIRD.progress === null && LOWER_THIRD.blow !== null,
    'blows land; a wall never reads STAGE 2 OF 4');
}

// ---------------------------------------------------------------- A6 · the scanner's own arm
{
  // The Reunion is where attribution is the entire point. Build the reveal the same way
  // `rrr-social-round.md` §5's roll call does, and require the scanner to FIND it.
  const reunion = { roll: truth.seats.map((s) => ({ name: `Robot ${s.seat + 1}`, role: s.role, alignment: s.alignment })) };
  const hit = findIdentity(reunion, roster);
  t('A6 · the scanner CAN find attribution — it goes red on a Reunion reveal', hit !== null, hit || 'scanner is blind');
}

// ---------------------------------------------------------------- A8 · the counter's entropy
/**
 * Drive whole shows on a fake clock and read, per episode, the two numbers that matter: what the
 * public counter moved by, and whether the guide's call was in fact wrong.
 *
 * ⚠️ `misled` IS RECOVERED FROM THE SEALED STREAM, WHICH IS THE ONLY HONEST WAY TO GET IT. The
 * Hunter's room is `hunter.placed`, SEALED; the wing is public; the call is public. The gate is
 * allowed to know all three because the gate is the Reunion. The table is not, and A8 is the
 * assertion that the public number does not hand it over anyway.
 */
function sweepEpisodes({ seeds = 12, stepMs = 5000, maxSteps = 4000 } = {}) {
  const POLICY = [
    ['always CLEAR', () => CALL.CLEAR],
    ['always HOLD', () => CALL.HOLD],
    ['alternating', (s) => (s.state.episode % 2 ? CALL.CLEAR : CALL.HOLD)],
  ];
  const out = [];
  for (let seed = 1; seed <= seeds; seed++) {
    for (const [, call] of POLICY) {
      const s = createSession({ count: 8, castSeed: seed, worldSeed: seed * 3, send: () => {} });
      let now = 0;
      s.start(now);
      for (let i = 0; i < maxSteps && s.state.phase !== PHASE.REUNION; i++) {
        const alive = s.state.players.filter((p) => p.alive).map((p) => p.id);
        switch (s.state.phase) {
          case PHASE.CASTING:
            for (let k = 0; k < alive.length; k++) {
              s.input(alive[k], { t: 'cast', runner: alive[(k + 1) % alive.length], guide: alive[(k + 2) % alive.length] });
            }
            break;
          case PHASE.EXPEDITION:
            s.input(s.state.pair.guide, { t: 'call', call: call(s) });
            s.input(s.state.pair.runner, { t: 'move', move: MOVE_CHOICE.GO });
            break;
          case PHASE.RECKONING:
            if (!s.state.nominations.length) s.input(alive[0], { t: 'nominate', target: alive[1] });
            break;
          case PHASE.VOTE:
            for (const id of alive) s.input(id, { t: 'vote', choice: alive[1] });
            break;
          default: break;
        }
        now += stepMs;
        s.tick(now);
      }
      const log = s.log.all();
      const at = (type, f = (e) => e.data.episode) => new Map(log.filter((e) => e.type === type).map((e) => [f(e), e.data]));
      const hunter = at('hunter.placed');
      const wing = at('expedition.begun');
      // The word lives on the SEALED `call.said` now — the gate is the Reunion and may read it.
      const called = at('call.said');
      let prev = 0, ep = 0;
      for (const v of log.filter((e) => e.type === 'verdict.aired')) {
        ep += 1;
        const delta = v.data.alarms - prev;
        prev = v.data.alarms;
        const said = called.get(ep)?.said;
        if (!said) continue;                       // a silent guide made no call to be wrong about
        const here = hunter.get(ep)?.room === wing.get(ep)?.room;
        out.push({ delta, misled: (said === CALL.CLEAR && here) || (said === CALL.HOLD && !here) });
      }
    }
  }
  return out;
}

/**
 * The property, as a function, so the control can run the SAME predicate over the shipped bug.
 *
 *   collide — two episodes with the SAME delta and OPPOSITE `misled`. Without this the number is
 *             a lie detector: read the delta, know whether the guide was straight.
 *   spread  — two episodes with DIFFERENT deltas and the SAME `misled`. Without this the number
 *             is a lie detector in the other direction: it moves for nothing else, so any change
 *             at all is the guide.
 */
function entropy(eps) {
  const collide = eps.some((a) => eps.some((b) => a.delta === b.delta && a.misled !== b.misled));
  const spread = eps.some((a) => eps.some((b) => a.delta !== b.delta && a.misled === b.misled));
  return { collide, spread, ok: collide && spread };
}
const histogram = (eps) => {
  const k = {};
  for (const e of eps) k[`Δ${e.delta}/${e.misled ? 'wrong' : 'straight'}`] = (k[`Δ${e.delta}/${e.misled ? 'wrong' : 'straight'}`] || 0) + 1;
  return Object.keys(k).sort().map((x) => `${x}×${k[x]}`).join(' ');
};

{
  const eps = sweepEpisodes();
  const deltas = new Set(eps.map((e) => e.delta));
  t('A8 arm · a seeded sweep of whole shows produced episodes of both kinds to compare',
    eps.length > 40 && eps.some((e) => e.misled) && eps.some((e) => !e.misled) && deltas.size > 1,
    `${eps.length} episodes · deltas {${[...deltas].sort().join(',')}} · threshold ${INCIDENT_LOUD}`);

  const E = entropy(eps);
  t('A8 · the same alarm delta occurs with the guide straight AND with the guide wrong', E.collide,
    E.collide ? histogram(eps) : 'the delta names the guide — bible §5.6, R14 Fatal');
  t('A8b · and the delta moves for reasons that are not the guide at all', E.spread,
    E.spread ? 'the runner\'s throttle and the house\'s own prowling move it too'
      : 'nothing but the call can move the counter');

  // 🚨 THE CONTROL IS THE SHIPPED BUG, RUN THROUGH THE SAME PREDICATE. `incident.alarms += 1`
  // inside `if (misled)` and nowhere else is a delta of exactly one when the call was wrong and
  // exactly zero when it was not. A8 must be red on that series or it is asserting nothing.
  const singleSource = eps.map((e) => ({ delta: e.misled ? 1 : 0, misled: e.misled }));
  const C = entropy(singleSource);
  t('A8 control · restore the single-source increment and A8 goes red', !C.collide,
    `single-source series: ${histogram(singleSource)}`);
  t('A8b control · and A8b goes red on it too — a one-source counter has no other reason to move',
    !C.spread, `collide ${C.collide} · spread ${C.spread}`);
}

// ---------------------------------------------------------------- A7 · the controls
{
  const base = { kind: 'call', room: 'east', phaseTick: 4, loudness: 0.62 };

  const named = { ...base, room: 'east — Robot 3' };
  t('A7a control · a named caption turns A2 red', findIdentity(named, roster) !== null);

  const timed = { ...base, loudness: [0.4, 0.0] };
  t('A7b control · a timings[] array of crew length turns A3 red', findPositional(timed, CREW) !== null);

  const perPlayer = { ...base, accuracy: 0.83, who: 'p3' };
  const extra = Object.keys(perPlayer).filter((k) => !FAILURE_FIELDS.includes(k));
  t('A7c control · a per-player accuracy stat turns A1 red', extra.length > 0, extra.join(', '));

  const word = (text, n) => new RegExp(`(^|[^\\p{L}])${n}([^\\p{L}]|$)`, 'iu').test(text);
  t('A7e control · A5\'s word-boundary sweep still catches a name spliced into a caption',
    word('LOUD CRASH — EAST GALLERY (VIC)', 'Vic') && !word('LOUD CRASH — THE BALLROOM', 'Roo'),
    'finds "VIC", ignores the "Roo" inside "ballroom"');

  let threw = false;
  try { makeEvent('task.miss', VIS.PUBLIC, { ...base, who: 'p3' }); } catch { threw = true; }
  t('A7d control · makeEvent refuses a non-schema field at construction', threw);
}

console.log(`\nparty-anon: ${pass} passed, ${fail} failed, ${skip} skipped`);
process.exit(fail ? 1 : 0);
