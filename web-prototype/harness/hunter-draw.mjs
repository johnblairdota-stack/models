#!/usr/bin/env node
/**
 * 🎯 **hunter-draw — THE HUNTER IS SOMETIMES IN THE ROOM THE RUNNER WALKS INTO.**
 *
 *   node harness/hunter-draw.mjs
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS IS A NEW GATE AND NOT THREE MORE LINES IN `live-session`
 * ---------------------------------------------------------------------------------------------
 * `live-session` asserts that the loop RUNS — that a silent table still reaches the Reunion, that
 * phases arrive in order, that a refusal comes back with a reason. Every one of its assertions
 * held perfectly while `session.js` could not put the Hunter in the target room in any game, at
 * any seed, ever: the show played, the clock ran, the phones were refused correctly, and the mode
 * was dead. This file asserts something none of that can see — **a distribution over shipped
 * sessions** — which is a different kind of claim and wants its own controls beside it.
 *
 * 🚨 **AND `party-sim` COULD NOT SEE IT EITHER, WHICH IS THE OTHER HALF OF WHY THIS EXISTS.**
 * `party-sim.mjs:55-94` runs its OWN six-room expedition — its own hunter draw, its own wrong-turn
 * roll, its own kill chance — and grades balance off that. It is a good model and it is not the
 * shipped one. An instrument pointed at a model cannot see a bug in the code, so every gate on
 * this project stayed green over a resolution that had exactly one reachable outcome. Everything
 * below is driven through `createSession` — the resolution that actually ships — and reads the
 * real log rather than a re-implementation of it.
 *
 * ---------------------------------------------------------------------------------------------
 * THE BUG, IN ONE PARAGRAPH
 * ---------------------------------------------------------------------------------------------
 * The wing was `hash(worldSeed,'target',ep) % 6` and the Hunter's room `hash(worldSeed,'hunter',
 * ep) % 6`. FNV-1a's bit 0 is XOR-linear, `'target'` and `'hunter'` differ in character parity and
 * 6 is even — so the two indices differed in bit 0 in **every** draw and could never be equal.
 * `hunterHere` was a constant false, `player.taken` from the expedition was unreachable, and
 * `misled` collapsed to `said === CALL.HOLD`, making a CLEAR call correct 100% of the time in
 * every game. See `session.js`'s `pick()` for the fix and why a different salt is not one.
 *
 * ⚠️ **THE CONTROL IS THE SHIPPED BUG, RUN THROUGH THE SAME PREDICATES** — `party-anon` A8's
 * idiom. D6 rebuilds the old draw here and requires every assertion above it to go red on it.
 */

import { readFileSync } from 'node:fs';
import { createSession, CALL, MOVE_CHOICE } from '../src/party/session.js';
import { PHASE } from '../src/party/phases.js';
import { ROOMS } from '../src/party/coverage.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };
const pct = (a, b) => (b ? (a / b * 100).toFixed(1) : '0.0') + '%';

/**
 * Drive whole shows through the SHIPPED session and read one row per episode out of the real log.
 *
 * ⚠️ `here` COMES OUT OF THE SEALED STREAM, WHICH IS THE ONLY HONEST WAY TO GET IT — the same
 * discipline `party-anon` A8 uses. `hunter.placed` is SEALED, the wing is PUBLIC, the call is
 * PUBLIC. The gate is allowed to know all three because the gate is the Reunion.
 */
function sweep({ seeds = 80, stepMs = 5000, maxSteps = 4000 } = {}) {
  // Three call policies and both moves, so `said` and `move` vary independently of the draw.
  const POLICY = [
    ['always CLEAR', () => CALL.CLEAR, () => MOVE_CHOICE.GO],
    ['always HOLD', () => CALL.HOLD, () => MOVE_CHOICE.GO],
    ['alternating', (s) => (s.state.episode % 2 ? CALL.CLEAR : CALL.HOLD), () => MOVE_CHOICE.GO],
    ['CLEAR, sometimes waits', () => CALL.CLEAR, (s) => (s.state.episode % 3 ? MOVE_CHOICE.GO : MOVE_CHOICE.WAIT)],
  ];
  const rows = [];
  for (let seed = 1; seed <= seeds; seed++) {
    for (const [, call, mv] of POLICY) {
      const s = createSession({ count: 8, castSeed: seed, worldSeed: seed * 7, send: () => {} });
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
            s.input(s.state.pair.runner, { t: 'move', move: mv(s) });
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
      const by = (type) => new Map(log.filter((e) => e.type === type).map((e) => [e.data.episode, e.data]));
      const placed = by('hunter.placed');
      const begun = by('expedition.begun');
      // Every `player.taken` in the log came from the expedition — `resolveVote` filters the
      // event out for an execution, which is `player.executed` and nothing else.
      const takenIds = new Set(log.filter((e) => e.type === 'player.taken').map((e) => e.data.id));
      for (const e of log.filter((x) => x.type === 'expedition.ended')) {
        const ep = e.data.episode;
        const b = begun.get(ep);
        if (!b) continue;
        const here = placed.get(ep)?.room === b.room;
        rows.push({
          seed, ep, wing: b.room, hunterRoom: placed.get(ep)?.room, here,
          said: e.data.said, move: e.data.move, outcome: e.data.outcome,
          runner: b.runner, runnerTaken: takenIds.has(b.runner) && e.data.outcome === 'taken',
          misled: (e.data.said === CALL.CLEAR && here) || (e.data.said === CALL.HOLD && !here),
        });
      }
    }
  }
  return rows;
}

/**
 * The properties, as functions, so D6's control can run the IDENTICAL predicates over a series
 * built from the old draw. A predicate stated twice is a predicate that drifts.
 */
const collisionRate = (rows) => rows.filter((r) => r.here).length / (rows.length || 1);
const outcomes = (rows) => new Set(rows.map((r) => r.outcome));
const tookSomebody = (rows) => rows.some((r) => r.runnerTaken);
/** Is `misled` a pure function of `said`? If it is, the call is not a call. */
function misledIsAFunctionOfSaid(rows) {
  const seen = new Map();
  for (const r of rows) {
    if (r.said == null) continue;
    if (!seen.has(r.said)) seen.set(r.said, new Set());
    seen.get(r.said).add(r.misled);
  }
  return [...seen.values()].every((v) => v.size === 1);
}

const rows = sweep();
const said = rows.filter((r) => r.said != null);

// ---------------------------------------------------------------- D0 · the arm
{
  t('D0 arm · a seeded sweep of SHIPPED sessions produced episodes to measure',
    rows.length > 200 && said.length > 200,
    `${rows.length} expeditions from createSession · ${said.length} with a call`);
  const wings = new Set(rows.map((r) => r.wing));
  const dens = new Set(rows.map((r) => r.hunterRoom));
  t('D0b arm · and both draws reach every one of the six rooms',
    wings.size === ROOMS.length && dens.size === ROOMS.length,
    `wings ${wings.size}/${ROOMS.length} · hunter rooms ${dens.size}/${ROOMS.length}`);
}

// ---------------------------------------------------------------- D1 · the Hunter is there
/**
 * The band is generous on purpose. The claim is *"sometimes, at about the rate six rooms imply"*,
 * not a tuned number — a tight band here would fail on a re-seed and teach somebody to widen it.
 * Ideal is 1/6 = 16.7%; anything inside 10-25% is a live, uncoupled draw.
 */
{
  const rate = collisionRate(rows);
  t('D1 · the Hunter is sometimes in the room the runner walks into',
    rate >= 0.10 && rate <= 0.25,
    `${pct(rows.filter((r) => r.here).length, rows.length)} of ${rows.length} expeditions · ideal ${pct(1, ROOMS.length)}`);
  t('D1b · and sometimes is not — the wing is not simply the Hunter\'s room',
    rows.some((r) => !r.here), `${pct(rows.filter((r) => !r.here).length, rows.length)} clear`);
}

// ---------------------------------------------------------------- D2 · the episode has endings
{
  const o = outcomes(rows);
  t('D2 · `expedition.ended` produces more than one outcome', o.size > 1, [...o].sort().join(' · '));
  t('D2b · including the one that costs a player — a run into an occupied room',
    o.has('taken') && o.has('lit'), `${pct(rows.filter((r) => r.outcome === 'taken').length, rows.length)} taken`);
}

// ---------------------------------------------------------------- D3 · the take is real
{
  t('D3 · `player.taken` fires from the expedition path, on the runner who went',
    tookSomebody(rows), `${rows.filter((r) => r.runnerTaken).length} runners taken by the Hunter`);
}

// ---------------------------------------------------------------- D4 · the call is a call
/**
 * 🚨 THE ASSERTION THE MODE RESTS ON. If `misled` is decided by what the guide SAID rather than by
 * where the Hunter WAS, then CLEAR is always right and HOLD is always wrong, the room can read the
 * guide's honesty off their own word, and there is nothing to argue about in the Debrief.
 */
{
  t('D4 · `misled` is not a pure function of the call — the room, not the word, decides',
    !misledIsAFunctionOfSaid(said),
    ['CLEAR', 'HOLD'].map((c) => {
      const g = said.filter((r) => r.said === c);
      return `${c}: ${pct(g.filter((r) => r.misled).length, g.length)} wrong of ${g.length}`;
    }).join(' · '));
  t('D4b · a CLEAR is sometimes right and sometimes wrong',
    said.some((r) => r.said === CALL.CLEAR && r.misled) && said.some((r) => r.said === CALL.CLEAR && !r.misled));
  t('D4c · and so is a HOLD — waiting out an empty room is the cost of caution',
    said.some((r) => r.said === CALL.HOLD && r.misled) && said.some((r) => r.said === CALL.HOLD && !r.misled));
}

// ---------------------------------------------------------------- D6 · the control is the bug
/**
 * The old draw, rebuilt here, fed through the SAME predicates. `hash` is copied rather than
 * imported because the whole point is that the shipped module no longer contains it.
 */
{
  const hash = (...parts) => {
    let h = 0x811c9dc5 >>> 0;
    const s = parts.join(':');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  };
  const oldDraw = (salt) => rows.map((r) => {
    const worldSeed = r.seed * 7;
    const wing = ROOMS[hash(worldSeed, 'target', r.ep) % ROOMS.length];
    const den = ROOMS[hash(worldSeed, salt, r.ep) % ROOMS.length];
    const here = wing === den;
    return {
      ...r, wing, hunterRoom: den, here,
      outcome: r.move !== MOVE_CHOICE.GO ? 'held' : here ? 'taken' : 'lit',
      runnerTaken: r.move === MOVE_CHOICE.GO && here,
      misled: (r.said === CALL.CLEAR && here) || (r.said === CALL.HOLD && !here),
    };
  });

  const bug = oldDraw('hunter');
  t('D1 control · restore `hash(...) % 6` and the Hunter is never in the wing — D1 goes red',
    collisionRate(bug) === 0, `${pct(bug.filter((x) => x.here).length, bug.length)} of ${bug.length} draws`);
  t('D2 control · so the expedition has one reachable outcome per move — D2b goes red',
    !outcomes(bug).has('taken'), [...outcomes(bug)].sort().join(' · '));
  t('D3 control · and nobody is ever taken on an expedition — D3 goes red', !tookSomebody(bug));
  t('D4 control · and `misled` is exactly `said === HOLD` — D4 goes red',
    misledIsAFunctionOfSaid(bug.filter((x) => x.said != null))
      && bug.every((x) => x.said == null || x.misled === (x.said === CALL.HOLD)),
    'a CLEAR call right 100% of the time, in every game, for ever');

  // 🚨 AND THE OTHER FIX IS NOT A FIX. A salt with the SAME character parity as 'target' collides
  // at twice the ideal rate, because bit 0 is fully determined either way — the room space is 3.
  const sameParity = ['prowler', 'it', 'lurker'].map((salt) => [salt, collisionRate(oldDraw(salt))]);
  t('D5 control · a different salt does not fix it — same parity collides at DOUBLE the ideal',
    sameParity.every(([, r]) => r > 2 / ROOMS.length * 0.85),
    sameParity.map(([s, r]) => `${s} ${(r * 100).toFixed(1)}%`).join(' · ') + ` vs ideal ${pct(1, ROOMS.length)}`);
}

// ---------------------------------------------------------------- D8 · one draw, for ever
/**
 * The coupling was a property of `hash(...) % even`, not of one salt pair, so the guard is
 * structural: `pick()` is the only caller of `hash` in the file. A future draw that reaches past
 * it — for a room, a wall distance, a throttle detent — fails here rather than in a lounge.
 */
{
  const src = readFileSync(new URL('../src/party/session.js', import.meta.url), 'utf8');
  const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const calls = (body.match(/(?<!function )\bhash\(/g) || []).length;
  t('D8 · `pick()` is the only caller of `hash` — no draw can re-introduce the coupling',
    calls === 1, `${calls} call site${calls === 1 ? '' : 's'} outside the definition`);
  t('D8b · and it takes the index from bits the prime has mixed, never from bit 0',
    /\(hash\(\.\.\.parts\) >>> 8\) % n/.test(body), 'pick() shifts before it divides');
  t('D8 control · the scan would notice a second call site',
    (('const a = hash(1) % 6;').match(/(?<!function )\bhash\(/g) || []).length === 1);
  t('D8b control · and it would notice the shift going away',
    !/\(hash\(\.\.\.parts\) >>> 8\) % n/.test('const pick = (n, ...parts) => hash(...parts) % n;'));
}

console.log(`\nhunter-draw: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
