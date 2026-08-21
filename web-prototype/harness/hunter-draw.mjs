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
import { createSession, CALL, MOVE_CHOICE, hash, pick } from '../src/party/session.js';
import { PHASE } from '../src/party/phases.js';
import { ROOMS } from '../src/party/coverage.js';
/**
 * ⚠️ THE WING IS DRAWN FROM `WINGS`, NOT FROM `ROOMS`, AND THIS FILE HAS TO KNOW. The chapel has
 * no open connector, so `session.js` stopped offering it — see `wing-draw`. The Hunter's room is
 * still every room in the house: it can breach `p.chapel` and the runner cannot.
 */
import { WINGS } from '../src/party/houseplan.js';

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
      // The callout is SEALED and off `expedition.ended` — see `session.js`'s `call` input. The
      // gate is the Reunion, so it reads the sealed stream and joins by episode.
      const spoke = by('call.said');
      // Every `player.taken` in the log came from the expedition — `resolveVote` filters the
      // event out for an execution, which is `player.executed` and nothing else.
      const takenIds = new Set(log.filter((e) => e.type === 'player.taken').map((e) => e.data.id));
      for (const e of log.filter((x) => x.type === 'expedition.ended')) {
        const ep = e.data.episode;
        const b = begun.get(ep);
        if (!b) continue;
        const here = placed.get(ep)?.room === b.room;
        const said = spoke.get(ep)?.said ?? null;
        rows.push({
          seed, ep, wing: b.room, hunterRoom: placed.get(ep)?.room, here,
          said: spoke.get(ep)?.said ?? null, move: e.data.move, outcome: e.data.outcome,
          runner: b.runner, runnerTaken: takenIds.has(b.runner) && e.data.outcome === 'taken',
          misled: (said === CALL.CLEAR && here) || (said === CALL.HOLD && !here),
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
  t('D0b arm · and both draws reach every room they are allowed to — five wings, six dens',
    wings.size === WINGS.length && dens.size === ROOMS.length,
    `wings ${wings.size}/${WINGS.length} (${[...wings].sort().join(',')}) · hunter rooms ${dens.size}/${ROOMS.length}`);
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
  // ⚠️ `hash` IS IMPORTED, NOT REBUILT. The part of the old draw that no longer exists — the bare
  // `% n` — is the only part reconstructed here; the mixer it sat on top of is the shipped one, so
  // this control cannot quietly stop matching the code it is standing in for.
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
 *
 * ⚠️ **THE CONTROLS MUTATE THE REAL SOURCE AND THEY USED TO MUTATE A STRING LITERAL.** Both of
 * them read like controls and proved nothing: they ran the detector over a one-line sample this
 * file had written itself, so they asserted that a regex matches a string next to it. The detector
 * is a function now, and each control feeds it the SHIPPED text with one edit applied — the edit
 * a future author would actually make. If `session.js` is refactored so the edit no longer
 * applies, the mutation arm below goes red and says so, rather than the control quietly passing
 * over a file it stopped describing.
 */
{
  const src = readFileSync(new URL('../src/party/session.js', import.meta.url), 'utf8');
  const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  /** The two structural claims, as one function over source text, so a control cannot use another. */
  const scan = (text) => {
    const body = strip(text);
    // Both shapes: the shipped block-bodied arrow, and the one-liner the control reverts it to.
    const def = body.match(/export const pick =[\s\S]*?(?=\nexport |$)/);
    return {
      callSites: (body.match(/(?<!function )\bhash\(/g) || []).length,
      finalized: !!def && /0x85ebca6b/.test(def[0]) && /0xc2b2ae35/.test(def[0]),
      bareShift: !!def && /hash\(\.\.\.parts\)\s*>>>\s*8/.test(def[0]),
    };
  };
  const shipped = scan(src);
  t('D8 · `pick()` is the only caller of `hash` — no draw can re-introduce the salt coupling',
    shipped.callSites === 1, `${shipped.callSites} call site${shipped.callSites === 1 ? '' : 's'} outside the definition`);
  t('D8b · and the index comes off an avalanche, not off a shift — see D9 for what the shift left open',
    shipped.finalized && !shipped.bareShift, 'pick() finalizes before it divides');

  // The mutations. Each is applied to the shipped text, and the arm asserts the edit actually bit.
  const withSecondCaller = src.replace(
    "      : pick(800, worldSeed, 'wall', state.episode) / 100;",
    "      : hash(worldSeed, 'wall', state.episode) % 800 / 100;");
  const withoutFinalizer = src.replace(
    /export const pick = \(n, \.\.\.parts\) => \{[\s\S]*?\n\};/,
    'export const pick = (n, ...parts) => (hash(...parts) >>> 8) % n;');
  t('D8 mutation arm · both edits landed on the shipped file — the controls below are not no-ops',
    withSecondCaller !== src && withoutFinalizer !== src,
    'wall drawn through hash directly · finalizer reverted to `>>> 8`');
  t('D8 control · give the wall its own `hash` call and the scan counts two — D8 goes red',
    scan(withSecondCaller).callSites === 2, `${scan(withSecondCaller).callSites} call sites`);
  t('D8b control · revert `pick` to the shipped `>>> 8` and the scan sees the shift — D8b goes red',
    !scan(withoutFinalizer).finalized && scan(withoutFinalizer).bareShift, 'no finalizer, bare shift');
}

// ---------------------------------------------------------------- D9-D11 · the SERIAL axis
/**
 * 🚨 **D1 IS A MARGINAL BAND AND IT IS GREEN ON BOTH SIDES OF A FATAL BUG. THIS IS THE OTHER AXIS.**
 *
 * `(hash(...) >>> 8) % n` closed the cross-salt collision — two draws in the SAME episode — and
 * measured 16.1%, comfortably inside D1's 10-25%. It could not close the cross-EPISODE structure,
 * and D1 cannot see that at all, because D1 collapses the whole series to one marginal rate.
 *
 * `episode` is the LAST component of the key, so exactly one FNV round follows it:
 * `h = (h_prefix ^ digit) * PRIME`. The draws for episodes 1..6 therefore differ by `k · PRIME` for
 * `k` in a span of about 8, and shifting eight low bits away does not remove an additive offset
 * from the high ones. Measured over the shipped `>>> 8`, the wing's episode-to-episode delta:
 *
 * ```
 *   ep2 -> ep3   57.01%  21.41%   0.12%   0.00%   0.10%  21.35%
 * ```
 *
 * The wing repeated 57% of the time and could **never** move by exactly three rooms.
 *
 * ⚠️ WHAT THAT COSTS, IN THE GAME'S OWN TERMS. The SEALED Hunter room becomes recoverable from
 * the PUBLIC wing sequence — the wing is announced out loud in CASTING, every episode, to
 * everybody — at well above the 1-in-6 a guess is worth. And `wall`, which decides how much an
 * honest guide could see, stops being a per-episode coin and becomes a sticky two-state process,
 * which attacks bible D13's premise that nobody but the guide knows how much they could see.
 *
 * ⚠️ **THE CONTROL FOR EVERY ASSERTION BELOW IS THE SHIPPED `>>> 8`, BUILT ON THE IMPORTED
 * `hash`.** Only the part that no longer exists is rebuilt. Each control runs the identical
 * predicate and must go red.
 *
 * ⚠️ AND THE PREDICATES RUN OVER THE EXPORTED `pick`, NOT OVER A COPY OF IT. A distribution needs
 * millions of draws and a show cannot be played a million times, so the draw is imported and D9
 * arm reconciles it against wings and Hunter rooms read out of REAL `createSession` logs — the
 * rows D0-D4 are built from. A model may stand in for something that does not exist; it may never
 * stand in for something that does.
 */
{
  const SEEDS = 80000;
  const EPS = [1, 2, 3, 4, 5, 6];
  /** The draw this file shipped between the two fixes: salt axis closed, episode axis wide open. */
  const shifted = (n, ...parts) => (hash(...parts) >>> 8) % n;

  /**
   * Every seeded draw `session.js` makes, with the bucket the game actually reads off it.
   * `wall` is a centimetre in [0,800) that the guide's sight rounds into metres, so its delta is
   * measured in metres — the unit a player could notice.
   */
  const DRAWS = [
    ['wing        pick(5,   …,target,ep)', 5, 'target', 5, (v) => v],
    ['hunter room pick(6,   …,hunter,ep)', 6, 'hunter', 6, (v) => v],
    ['prowl       pick(4,   …,prowl, ep)', 4, 'prowl', 4, (v) => v],
    ['throttle GO pick(3,   …,throttle,ep)', 3, 'throttle', 3, (v) => v],
    ['throttle    pick(2,   …,throttle,ep)', 2, 'throttle', 2, (v) => v],
    ['wall        pick(800, …,wall,  ep)', 800, 'wall', 8, (v) => Math.floor(v / 100)],
  ];

  /** One column of raw draws: `[worldSeed][episode] -> bucket`. */
  const column = (pk, n, salt) => {
    const col = new Array(SEEDS + 2);
    for (let w = 1; w <= SEEDS + 1; w++) {
      const row = new Array(EPS.length + 1);
      for (const e of EPS) row[e] = pk(n, w, salt, e);
      col[w] = row;
    }
    return col;
  };

  /** One table of raw draws per pick implementation — built once, read by every predicate. */
  const tableFor = (pk) => DRAWS.map(([, n, salt]) => column(pk, n, salt));

  const tvFromUniform = (h) => {
    const tot = h.reduce((a, b) => a + b, 0) || 1, e = 1 / h.length;
    return h.reduce((a, c) => a + Math.abs(c / tot - e), 0) / 2;
  };

  /**
   * For every draw, every consecutive step along EVERY axis of the key, how far is the delta from
   * uniform? One number, worst case, plus the whole table for the reader.
   *
   * ⚠️ BOTH AXES, BECAUSE THE BUG IS POSITIONAL RATHER THAN GENERAL. `worldSeed` is the FIRST key
   * component and has the whole hash after it, so the shipped `>>> 8` is fine along the seed axis
   * — 0.7% off uniform — and catastrophic along the episode axis at 50%. Asserting only the axis
   * that broke would let the next draw put its varying component last and pass.
   */
  function deltaTable(tab) {
    const out = [];
    for (let d = 0; d < DRAWS.length; d++) {
      const [label, , , m, bucket] = DRAWS[d];
      for (let i = 0; i < EPS.length - 1; i++) {
        const [a, b] = [EPS[i], EPS[i + 1]];
        for (const axis of ['episode', 'worldSeed']) {
          const h = new Array(m).fill(0);
          for (let w = 1; w <= SEEDS; w++) {
            const from = bucket(tab[d][w][a]);
            const to = axis === 'episode' ? bucket(tab[d][w][b]) : bucket(tab[d][w + 1][a]);
            h[(to - from + m) % m]++;
          }
          out.push({ label, step: `${axis === 'episode' ? `ep${a}→${b}` : `seed+1 @ep${a}`}`, axis, tv: tvFromUniform(h), min: Math.min(...h) / SEEDS, m });
        }
      }
    }
    return out;
  }

  /**
   * Can the room the Hunter is SEALED into be read off the wings the table was told out loud?
   * A lookup table over the last three announced wings, trained on one set of seeds and scored on
   * seeds it has never seen — so a table that merely memorised the training half scores 1/6.
   */
  function sealedFromPublic(tab) {
    const [W, H] = [tab[0], tab[1]];
    const TRAIN = Math.floor(SEEDS * 0.6);
    const key = (w, e) => `${e}|${W[w][e - 2]}|${W[w][e - 1]}|${W[w][e]}`;
    const learnt = new Map();
    for (let w = 1; w <= TRAIN; w++) {
      for (let e = 3; e <= EPS.length; e++) {
        const k = key(w, e);
        let c = learnt.get(k); if (!c) learnt.set(k, c = new Array(6).fill(0));
        c[H[w][e]]++;
      }
    }
    let hit = 0, tot = 0;
    for (let w = TRAIN + 1; w <= SEEDS; w++) {
      for (let e = 3; e <= EPS.length; e++) {
        const c = learnt.get(key(w, e));
        let best = 0; if (c) for (let i = 1; i < 6; i++) if (c[i] > c[best]) best = i;
        if (best === H[w][e]) hit++;
        tot++;
      }
    }
    return { rate: hit / tot, tot };
  }

  /**
   * `darkrun.js` hides `storeyH / tan(tilt)` of floor behind every wall — 2.55 m at the shipped
   * 62° and 4.80 m storey. So "was the Hunter inside the blind strip" is a per-episode coin with
   * p = 255/800. Two draws that are independent land in the same state `p² + (1-p)²` of the time;
   * anything above that is a guide whose blindness this episode predicts their blindness next.
   */
  function wallStickiness(tab) {
    const W = tab[5];
    const NEAR = 255;
    let same = 0, tot = 0, near = 0, seen = 0;
    for (let w = 1; w <= SEEDS; w++) {
      for (const e of EPS) { if (W[w][e] < NEAR) near++; seen++; }
      for (let i = 0; i < EPS.length - 1; i++) {
        if ((W[w][EPS[i]] < NEAR) === (W[w][EPS[i + 1]] < NEAR)) same++;
        tot++;
      }
    }
    const p = near / seen;
    return { same: same / tot, indep: p * p + (1 - p) * (1 - p), p };
  }

  const live = tableFor(pick);
  const bug = tableFor(shifted);

  // ---- D9 arm. The imported draw IS the draw the shows played.
  {
    const mismatch = rows.filter((r) =>
      WINGS[pick(WINGS.length, r.seed * 7, 'target', r.ep)] !== r.wing
      || ROOMS[pick(ROOMS.length, r.seed * 7, 'hunter', r.ep)] !== r.hunterRoom);
    t('D9 arm · the imported `pick` reproduces every wing and Hunter room the real sessions logged',
      rows.length > 200 && mismatch.length === 0,
      `${rows.length} expeditions from createSession reconciled · ${mismatch.length} disagreements`);
  }

  // ---- D9. Serial uniformity, both axes, every draw.
  /**
   * The band. Sampling noise at 80,000 seeds is ~0.005 total variation for the six-room draws;
   * the shipped `>>> 8`'s WEAKEST failure is 0.071 (the two-detent throttle) and its worst is
   * 0.62. 0.02 sits four times above the noise floor and three and a half times below the
   * smallest thing it has to catch, which is a band that neither flickers nor flatters.
   */
  const TV_MAX = 0.02;
  {
    const tab = deltaTable(live);
    const worst = tab.reduce((a, b) => (b.tv > a.tv ? b : a));
    const byAxis = ['episode', 'worldSeed'].map((ax) => {
      const w = tab.filter((r) => r.axis === ax).reduce((a, b) => (b.tv > a.tv ? b : a));
      return `${ax} ${w.tv.toFixed(4)}`;
    }).join(' · ');
    t('D9 · knowing one episode\'s draw tells you nothing about the next — on every draw in the file',
      worst.tv <= TV_MAX,
      `worst ${worst.tv.toFixed(4)} ≤ ${TV_MAX} at ${worst.label.trim()} ${worst.step} · by axis: ${byAxis}`);
    const sixes = tab.filter((r) => r.m === 6 && r.axis === 'episode');
    const leanest = sixes.reduce((a, b) => (b.min < a.min ? b : a));
    t('D9b · and the wing can move by any of the six offsets — including exactly three rooms',
      leanest.min > 0.10,
      `rarest offset ${(leanest.min * 100).toFixed(2)}% at ${leanest.label.trim()} ${leanest.step} · ideal 16.67%`);
  }

  // ---- D10. The sealed draw is not a function of the public one.
  const PREDICT_MAX = 1 / 6 + 0.02;
  {
    const r = sealedFromPublic(live);
    t('D10 · the SEALED Hunter room is not recoverable from the PUBLIC wing sequence',
      r.rate <= PREDICT_MAX,
      `${(r.rate * 100).toFixed(2)}% on ${r.tot} held-out episodes · chance ${pct(1, 6)} · band ${(PREDICT_MAX * 100).toFixed(2)}%`);
  }

  // ---- D11. The guide's blindness is redealt every episode.
  const STICK_MAX = 0.02;
  {
    const w = wallStickiness(live);
    t('D11 · the guide\'s wall distance is a fresh coin each episode, not a sticky two-state process',
      Math.abs(w.same - w.indep) <= STICK_MAX,
      `same side of the blind strip ${(w.same * 100).toFixed(2)}% vs independent ${(w.indep * 100).toFixed(2)}% (p=${w.p.toFixed(4)})`);
  }

  // ---- the controls. Every one of D9, D9b, D10 and D11 must go red on the shipped `>>> 8`.
  {
    const tab = deltaTable(bug);
    const worst = tab.reduce((a, b) => (b.tv > a.tv ? b : a));
    const episodeAxis = tab.filter((r) => r.axis === 'episode');
    const seedAxis = tab.filter((r) => r.axis === 'worldSeed');
    const worstSeed = seedAxis.reduce((a, b) => (b.tv > a.tv ? b : a));
    t('D9 control · restore `(hash(...) >>> 8) % n` and EVERY draw in the file goes serial — D9 goes red',
      episodeAxis.every((r) => r.tv > TV_MAX),
      `${episodeAxis.length}/${episodeAxis.length} episode steps above the band · worst ${worst.tv.toFixed(4)} at ${worst.label.trim()} ${worst.step}`);
    const worstEp = episodeAxis.reduce((a, b) => (b.tv > a.tv ? b : a));
    t('D9 control · and adjacent SEEDS leak too, an order of magnitude more quietly — the second axis earns its place',
      worstSeed.tv > TV_MAX,
      `worst episode step ${worstEp.tv.toFixed(4)} vs worst seed step ${worstSeed.tv.toFixed(4)}`
      + ` · ${seedAxis.filter((r) => r.tv <= TV_MAX).length}/${seedAxis.length} seed steps stay inside the band`
      + ' — worldSeed is FIRST in the key and has the whole hash after it, which is why the episode axis is the loud one');
    const sixes = episodeAxis.filter((r) => r.m === 6);
    const zeroed = sixes.filter((r) => r.min === 0);
    t('D9b control · and the wing can never move by exactly three rooms — D9b goes red',
      zeroed.length > 0,
      `${zeroed.length} of ${sixes.length} six-room steps have an offset that occurs 0 times in ${SEEDS}`);
    /**
     * 🚨 **D10's CONTROL IS THE BUG AS IT SHIPPED, WHICH MEANS THE POOL IT SHIPPED WITH TOO — AND
     * THE DIFFERENCE BETWEEN THE TWO POOLS IS ITSELF A FINDING.**
     *
     * The wing used to be drawn from all six `ROOMS`; it is drawn from the five reachable `WINGS`
     * now (see `wing-draw`), and that narrowing turns out to close this leak on its own. Measured
     * over the same 80,000 seeds, with the shipped `(hash >>> 8) % n` in place: with BOTH draws at
     * modulus 6 the sealed Hunter room falls out of a three-wing public key at **25.0%**, rising to
     * **31.6%** on a six-wing key; with the wing at modulus 5 and the Hunter still at 6 the same
     * predictor sees **16.6%**, which is chance. The serial correlation is still there — D9 and D9b
     * are red on it and do not depend on the pool at all — but it only becomes a leak between two
     * sequences when the two moduli agree.
     *
     * So the control is built at the historical arity rather than at today's. Weakening it to
     * whatever is still red under the new pool would be adjusting the instrument to the result,
     * and the six-room pair is what the bug actually shipped as.
     */
    const asShipped = [column(shifted, ROOMS.length, 'target'), column(shifted, ROOMS.length, 'hunter')];
    const p = sealedFromPublic(asShipped);
    const nowPooled = sealedFromPublic(bug);
    t('D10 control · and the sealed Hunter room falls out of the public wings — D10 goes red',
      p.rate > PREDICT_MAX,
      `${(p.rate * 100).toFixed(2)}% on ${p.tot} held-out episodes against a ${pct(1, 6)} guess`);
    t('D10b control · and narrowing the wing pool to five closes that leak on its own',
      nowPooled.rate <= PREDICT_MAX && p.rate > nowPooled.rate + 0.05,
      `same bug, wing over 6 rooms ${(p.rate * 100).toFixed(2)}% vs wing over ${WINGS.length} wings `
      + `${(nowPooled.rate * 100).toFixed(2)}% — a leak between two sequences needs the moduli to agree`);
    const w = wallStickiness(bug);
    t('D11 control · and the guide\'s blindness this episode predicts it next — D11 goes red',
      Math.abs(w.same - w.indep) > STICK_MAX,
      `same side ${(w.same * 100).toFixed(2)}% vs independent ${(w.indep * 100).toFixed(2)}%`);
  }
}

console.log(`\nhunter-draw: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
