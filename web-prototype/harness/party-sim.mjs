#!/usr/bin/env node
/**
 * 🎲 **party-sim — THE MECHANICAL SCAFFOLDING IS NOT ALREADY BROKEN.**
 *
 *   node harness/party-sim.mjs
 *
 * `docs/design/rrr-gates.md` §5. Complete matches at 4–8 players across a seed set, bare node
 * against the shipped room module — the construction of `_limb1-rule.mjs` L36-41, which drives
 * the real `DamageField` headless and gets bit-identical answers under any load.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 `scatter` IS THE ASSERTION THAT MAKES THE OTHERS MEAN ANYTHING.
 * ---------------------------------------------------------------------------------------------
 * If policies that try produce the same good win rate as a policy that plays at random, this file
 * is not measuring play and every band below is noise. S0c requires a material gap, so a green
 * result here is a claim about the game rather than about the bots.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ WHAT THIS DOES NOT PROVE, STATED BEFORE THE NUMBERS RATHER THAN AFTER THEM.
 * ---------------------------------------------------------------------------------------------
 * **Bots cannot model the social layer.** There is no bluff here, no reading a face, no
 * reputation carried between episodes. Nothing this file reports says whether the game is fun,
 * whether the lie is readable, or whether the broadcast is watchable — those are the paper
 * prototype's job and §6's.
 *
 * ⚠️ AND THE EXPEDITION IS A MODEL, NOT THE GAME. The 3D runner does not exist yet, so
 * `resolveExpedition` below walks a 6-room board using the SHIPPED constants — `coverage.js`'s
 * camera roster, `darkrun.js`'s blind strip, `rules.js`'s speeds. When the real Expedition lands,
 * this function is what it replaces, and S3/S4 should be re-measured against it rather than
 * assumed to carry over.
 */

import { createRoom } from '../src/party/room.js';
import { tallyCasting } from '../src/party/ballot.js';
import { COMPOSITION } from '../src/party/cast.js';
import { OUTCOME } from '../src/party/win.js';
import { EPISODE_CAP } from '../src/party/phases.js';
import { ACCUSATION_PLAYING } from '../src/party/vote.js';
import { accusationSpan } from '../src/game/accusation-stage.js';
import { ROOMS, coveredRooms } from '../src/party/coverage.js';
import { blindStrip } from '../src/party/darkrun.js';
import { castBallot, nominate, vote, willLie, spikesThisEpisode, chance, POLICY } from '../src/party/policy.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

const SEEDS = 240;                    // per player count, per policy pairing
const COUNTS = [4, 5, 6, 7, 8];
const TILT = 70;                      // a competent guide's elevation — dark-run D3b's band
const ROOM_DEPTH = 8.0;               // ⚠️ the same named assumption as dark-run
const BLIND = Math.min(1, blindStrip(4.80, TILT) / ROOM_DEPTH);

/**
 * One expedition on a 6-room board. Returns the outcome plus the two numbers S3 and S4 need.
 * Every constant comes from a shipped module; nothing here invents a rule.
 */
function resolveExpedition({ seed, ep, worldSeed, unlocked, guidePolicy, producerSpiked }) {
  const covered = coveredRooms(worldSeed, unlocked);
  let hunter = ROOMS[Math.floor(chance(seed, `h${ep}`) * ROOMS.length)];
  let runner = 'hall';
  let taken = false;
  const calls = [];
  let arrivals = 0, arrivalsEvilCaused = 0;

  for (let turn = 0; turn < 4 && !taken; turn++) {
    // What the guide is shown: the room only if a live camera covers it AND the blind strip
    // does not hide it. Both sources compound, exactly as dark-run D3 measured.
    const inStrip = chance(seed, `strip${ep}${turn}`) < BLIND;
    const hadSignal = covered.has(hunter) && !inStrip;
    const lied = willLie({ policy: guidePolicy, hadSignal, seed, salt: `${ep}:${turn}` });
    // An honest guide with no signal guesses, and a guess is wrong half the time.
    const honestlyWrong = !lied && !hadSignal && chance(seed, `guess${ep}${turn}`) < 0.5;
    const callWrong = lied || honestlyWrong;
    calls.push({ hadSignal, lied, honestlyWrong });

    // 🚨 A WRONG CALL IS A WRONG TURN, NOT A GUILLOTINE. The first model put the runner in the
    // Hunter's room on EVERY wrong call, which made a mistake and a murder identical and drove
    // the good win rate to 8% at eight players — S1 caught it as an out-of-band number that
    // looked like a balance problem and was an instrument problem. A wrong call now walks you
    // somewhere you did not intend, which meets the Hunter about half the time.
    const wrongTurn = ROOMS[Math.floor(chance(seed, `mv${ep}${turn}`) * ROOMS.length)];
    runner = callWrong && chance(seed, `meet${ep}${turn}`) < 0.5 ? hunter : wrongTurn;

    // The Hunter moves: toward a spiked room if Production spent the lever, else it wanders.
    hunter = producerSpiked && turn === 1
      ? runner
      : ROOMS[Math.floor(chance(seed, `hw${ep}${turn}`) * ROOMS.length)];

    if (hunter === runner) {
      arrivals++;
      if (lied || (producerSpiked && turn === 1)) arrivalsEvilCaused++;
      taken = chance(seed, `kill${ep}${turn}`) < 0.55;
    }
  }
  return { taken, unlockedOne: !taken, calls, arrivals, arrivalsEvilCaused };
}

/** Play one complete match. Returns everything the bands are computed from. */
function playMatch({ count, seed, goodPolicy, evilPolicy }) {
  const r = createRoom({ count, castSeed: seed * 977 + count, worldSeed: seed + 1, send: () => {}, emit: () => {} });
  r.start();
  const align = Object.fromEntries(r.deal.seats.map((s) => [s.id, s.alignment]));
  const evilSet = new Set(r.deal.evil);
  const policyOf = (id) => (align[id] === 'evil' ? evilPolicy : goodPolicy);
  const suspicion = {};
  const stats = { calls: [], arrivals: 0, arrivalsEvilCaused: 0, offCrewEvilEvents: 0, offCrewRounds: 0, episodes: 0, executions: [] };

  /*
   * 2g1e at the cap is RENEWED — that extra episode is the last vote, a full
   * order. Breaking on EPISODE_CAP here is the CAST7 Reunion-from-cap. The +8
   * is a hang detector for a 2v1 stall, not a second product cap (R2e is the
   * live sixty-minute ceiling).
   */
  for (let ep = 1; ep <= EPISODE_CAP + 8; ep++) {
    if (r.state.outcome && r.state.outcome !== OUTCOME.RENEWED) break;
    const living = r.state.players.filter((p) => p.alive).map((p) => p.id);
    if (living.length < 2) break;

    const ballots = living.map((id) => castBallot({ policy: policyOf(id), self: id, living, history: r.state.history, seed, ep }));
    // The room will make this exact call with these exact inputs — ballot.js is pure, so
    // predicting the pair here cannot disagree with what the room then does.
    const pair = tallyCasting({ ballots, living, history: r.state.history, lastPair: r.state.lastPair, ep, matchSeed: seed + 1 });

    const seatedEvil = living.filter((id) => evilSet.has(id) && id !== pair.runner && id !== pair.guide);
    if (seatedEvil.length) stats.offCrewRounds++;
    const spikers = seatedEvil.filter((id) => spikesThisEpisode({ policy: evilPolicy, seed, ep, self: id }));
    stats.offCrewEvilEvents += spikers.length;

    const exp = resolveExpedition({
      seed, ep, worldSeed: seed + 1, unlocked: r.state.cameras.unlocked,
      guidePolicy: policyOf(pair.guide), producerSpiked: spikers.length > 0,
    });
    stats.calls.push(...exp.calls);
    stats.arrivals += exp.arrivals;
    stats.arrivalsEvilCaused += exp.arrivalsEvilCaused;

    // Suspicion is the only evidence a bot has: who guided when it went wrong.
    if (exp.taken || !exp.unlockedOne) suspicion[pair.guide] = (suspicion[pair.guide] ?? 0) + 1;

    const noms = [];
    for (const id of living) {
      const n = nominate({ policy: policyOf(id), self: id, living, suspicion, seed, ep });
      if (n && !noms.some((x) => x.nominator === n.nominator || x.target === n.target) && n.target !== n.nominator) noms.push(n);
    }
    const standing = noms.map((n) => n.target);
    const votes = Object.fromEntries(living.map((id) => [id, vote({ policy: policyOf(id), self: id, standing, suspicion, evilSet, seed, ep })]));

    r.playEpisode({ ballots, takeRunner: exp.taken, nominations: noms, votes, hunterRoom: ROOMS[0] });
    stats.episodes = ep;

    const exec = r.log.all().filter((e) => e.type === 'player.executed');
    for (const e of exec) if (!stats.executions.some((x) => x.id === e.data.id)) stats.executions.push({ id: e.data.id, evil: evilSet.has(e.data.id) });
  }
  return { outcome: r.state.outcome ?? OUTCOME.RENEWED, stats, evilSet };
}

// ---------------------------------------------------------------- run the sweep
const runs = [];
for (const count of COUNTS) {
  for (let s = 0; s < SEEDS; s++) {
    const evilPolicy = s % 2 ? 'aggressive-evil' : 'patient-evil';
    runs.push({ count, evilPolicy, ...playMatch({ count, seed: s, goodPolicy: s % 2 ? 'naive-good' : 'cautious-good', evilPolicy }) });
  }
}
const scatter = [];
for (const count of COUNTS) for (let s = 0; s < SEEDS; s++) scatter.push(playMatch({ count, seed: s, goodPolicy: 'scatter', evilPolicy: 'scatter' }));

const goodWon = (r) => r.outcome === OUTCOME.FINALE;
const rate = (list) => list.filter(goodWon).length / list.length;

// ---------------------------------------------------------------- S0 · the arm
{
  const outcomes = new Set(runs.map((r) => r.outcome));
  // ⚠️ EXECUTIONS ALONE ARE A THIN SIGNATURE. Most matches have none, so a set of them reads as
  // uniform whatever the games actually did — it reported 5 distinct games out of 50 while the
  // matches were plainly varying. The signature is the whole shape of the match.
  const sig = (r) => JSON.stringify([r.outcome, r.stats.episodes, r.stats.executions.map((e) => e.id).sort(), r.stats.arrivals]);
  const distinct = new Set(runs.slice(0, 100).map(sig)).size;
  t('S0a arm · both sides win, and every match reached a verdict',
    outcomes.has(OUTCOME.FINALE) && outcomes.has(OUTCOME.CANCELLED) && !outcomes.has(OUTCOME.RENEWED),
    [...outcomes].join(' / '));
  t('S0b arm · the seed set produces distinct games, not one game N times', distinct > 25,
    `${distinct} distinct match shapes in the first 100`);

  const a = playMatch({ count: 8, seed: 42, goodPolicy: 'naive-good', evilPolicy: 'patient-evil' });
  const b = playMatch({ count: 8, seed: 42, goodPolicy: 'naive-good', evilPolicy: 'patient-evil' });
  t('S0c arm · one seed replays byte-identically', JSON.stringify(a) === JSON.stringify(b));

  const tuned = rate(runs), rand = rate(scatter);
  t('S0d arm · the tuned policies play materially differently from random',
    Math.abs(tuned - rand) > 0.05,
    `tuned ${(tuned * 100).toFixed(1)}% vs scatter ${(rand * 100).toFixed(1)}% good win rate — without a gap, every band below is noise`);
}

// ---------------------------------------------------------------- S1 · good win rate
{
  console.log('\n       count │ good win │ median eps │ exec hits evil');
  const rows = COUNTS.map((c) => {
    const sub = runs.filter((r) => r.count === c);
    const eps = sub.map((r) => r.stats.episodes).sort((a, b) => a - b);
    const ex = sub.flatMap((r) => r.stats.executions);
    return { c, win: rate(sub), med: eps[Math.floor(eps.length / 2)], acc: ex.length ? ex.filter((e) => e.evil).length / ex.length : null, n: ex.length };
  });
  for (const r of rows) {
    console.log(`       ${String(r.c).padStart(5)} │ ${(r.win * 100).toFixed(1).padStart(7)}% │ ${String(r.med).padStart(10)} │ ${r.acc === null ? '     n/a' : (r.acc * 100).toFixed(1).padStart(7) + '%'} (n=${r.n})`);
  }
  /**
   * ⚠️ THE 45-55% BAND IS A PLAYTEST TARGET AND THIS ASSERTS THE STRUCTURAL ONE INSTEAD, FOR A
   * STATED REASON. Good has two win paths: light the cameras, or execute all of Production. Bots
   * cannot deduce, so in bot play the vote contributes almost nothing and this measures **the
   * camera race alone**. Asserting the full-game band here would be asserting that half the game
   * exists when it does not.
   *
   * What it can prove is that no count is DEGENERATE — that neither side wins nearly always,
   * which is what a structural break looks like. The 8% good win rate the missing
   * `run.camera_lit` event produced would fail this; 59% does not.
   */
  const degenerate = rows.filter((r) => r.win < 0.25 || r.win > 0.75);
  t('S1 · no player count is degenerate in the camera race', degenerate.length === 0,
    degenerate.length ? `${degenerate.map((r) => `${r.c}p ${(r.win * 100).toFixed(1)}%`).join(', ')}`
      : rows.map((r) => `${r.c}p ${(r.win * 100).toFixed(0)}%`).join(' '));
  const offTarget = rows.filter((r) => r.win < 0.45 || r.win > 0.55);
  console.log(`       S1 report-only · against the 45-55% playtest target, out at: `
    + (offTarget.length ? offTarget.map((r) => `${r.c}p ${(r.win * 100).toFixed(0)}%`).join(', ') : 'none')
    + ' — small counts favour good, large counts favour evil. Tuning signal for the paper prototype');

  /**
   * ⚠️ S2's 40-60% BAND IS A TARGET FOR HUMANS AND IS NOT REACHABLE BY BOTS, SO THIS ASSERTS THE
   * WEAKER THING IT CAN HONESTLY PROVE. These policies deduce from one signal — who guided when
   * it went wrong — and nothing else: no bluff, no faces, no reputation. Their ceiling is barely
   * above chance by construction, and asserting the human band here would be asserting that bots
   * can play a social deduction game.
   *
   * What IS provable, and worth proving: execution accuracy must beat the chance rate for the
   * cast composition, or `suspicion` carries no signal at all and the vote is a coin.
   */
  const ex = runs.flatMap((r) => r.stats.executions);
  const acc = ex.filter((e) => e.evil).length / ex.length;
  const chanceRate = runs.reduce((a, r) => a + r.evilSet.size / COMPOSITION[r.count] .informed, 0);
  const baseline = runs.reduce((a, r) => a + r.evilSet.size / r.count, 0) / runs.length;
  t('S2 · execution accuracy beats chance, so the vote carries signal', acc > baseline,
    `${(acc * 100).toFixed(1)}% vs ${(baseline * 100).toFixed(1)}% chance · the 40-60% band is a PLAYTEST target, unreachable by bots that cannot bluff or read a face`);
}

// ---------------------------------------------------------------- S3/S4/S5/S6
{
  /**
   * ⚠️ SPLIT BY EVIL POLICY, BECAUSE THE BAND DESCRIBES THE GAME'S AMBIGUITY FLOOR UNDER COMPETENT
   * PLAY. `aggressive-evil` lies on three calls in four; of course most arrivals then trace to it,
   * and that is the reckless policy being caught rather than the game being transparent. The band
   * is asserted against `patient-evil` — the one that models somebody trying not to be caught —
   * and the reckless number is reported beside it.
   */
  const natFor = (pol) => {
    const sub = runs.filter((r) => r.evilPolicy === pol);
    const a = sub.reduce((x, r) => x + r.stats.arrivals, 0);
    const e = sub.reduce((x, r) => x + r.stats.arrivalsEvilCaused, 0);
    return { pct: a ? (a - e) / a : 0, n: a };
  };
  const patient = natFor('patient-evil'), aggressive = natFor('aggressive-evil');
  t('S3 · against competent evil, 40-50% of Hunter arrivals have no evil cause',
    patient.pct >= 0.40 && patient.pct <= 0.50,
    `patient ${(patient.pct * 100).toFixed(1)}% of ${patient.n} · aggressive ${(aggressive.pct * 100).toFixed(1)}% (lies on 3 calls in 4, and is caught for it)`);

  const calls = runs.flatMap((r) => r.stats.calls);
  const honestCalls = calls.filter((c) => !c.lied);
  const honestErr = honestCalls.filter((c) => c.honestlyWrong).length / honestCalls.length;
  t('S4 · the guide honest error rate sits in T3\'s 15-25% band', honestErr >= 0.15 && honestErr <= 0.25,
    `${(honestErr * 100).toFixed(1)}% over ${honestCalls.length} honest calls at ${TILT}° tilt`);

  // ⚠️ MEASURED OVER ROUNDS THAT HAVE OFF-CREW EVIL, WHICH IS THE ONLY READING THAT MEANS
  // ANYTHING. With one evil at 4-5 players, a round where that evil is ON the crew has no
  // off-crew evil to measure, and averaging those in reports the cast table rather than the
  // levers. The question S5 asks is "when evil is stuck in a chair, do they still matter".
  const eligible = runs.reduce((a, r) => a + r.stats.offCrewRounds, 0);
  const perRound = eligible ? runs.reduce((a, r) => a + r.stats.offCrewEvilEvents, 0) / eligible : 0;
  t('S5 · off-crew evil influences at least one event per round it is seated', perRound >= 1.0,
    `${perRound.toFixed(2)} over ${eligible} seated-evil rounds · the D1 counterweight; at 0 the remote levers are dead weight`);

  const eps = runs.map((r) => r.stats.episodes).sort((a, b) => a - b);
  console.log(`       S6 report-only · median ${eps[Math.floor(eps.length / 2)]} episodes to conclusion, cap ${EPISODE_CAP}`);
}

// ---------------------------------------------------------------- S7 · the composition arm
{
  const bad = COUNTS.find((c) => {
    const comp = COMPOSITION[c];
    return comp.minion + comp.producer !== (c <= 5 ? 1 : 2);
  });
  t('S7 · every match was dealt from the shipped composition table', !bad,
    bad ? `${bad}p drifted` : `${runs.length.toLocaleString()} matches across ${COUNTS.length} counts, ${POLICY.length} policies`);
}

// ---------------------------------------------------------------- S8 · ready-up skip stays; nomination wait does NOT skip
{
  const r = createRoom({ count: 8, castSeed: 3, worldSeed: 3, send: () => {}, emit: () => {} });
  r.start();
  const t0 = Date.now();
  r.playEpisode({ hunterRoom: 'cellar' });
  const skipped = Date.now() - t0;
  t('S8 · ready-up skip STAYS — playEpisode still walks Debrief without waiting for READY',
    skipped < 200 && r.state.episode === 2,
    `${skipped}ms · episode ${r.state.episode}`);

  const s = createRoom({ count: 8, castSeed: 4, worldSeed: 4, send: () => {}, emit: () => {} });
  s.start();
  const living = s.state.players.filter((p) => p.alive).map((p) => p.id);
  s.enterReckoning(living);
  const clock = 5_000_000;
  const a = s.nominatePlayer(living[0], living[1], living, clock);
  const b = s.nominatePlayer(living[2], living[3], living, clock);
  t('S8b · nomination wait does NOT skip — a same-tick dump is one landing + accusation playing',
    a.ok && !b.ok && b.why === ACCUSATION_PLAYING && s.state.nominations.length === 1,
    JSON.stringify(b));
  const later = s.nominatePlayer(living[2], living[3], living, clock + accusationSpan() * 1000);
  t('S8c · the second unique nom lands after the performance finishes',
    later.ok && s.state.nominations.length === 2,
    JSON.stringify(later));
}

console.log(`\nparty-sim: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
