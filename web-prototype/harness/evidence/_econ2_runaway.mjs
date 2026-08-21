#!/usr/bin/env node
/** _econ2_runaway — throwaway. Comeback, runaway, and the cost of voting. Same engine. */
import { createRoom } from '../../src/party/room.js';
import { tallyCasting } from '../../src/party/ballot.js';
import { OUTCOME, WIN_TARGETS, foldWin } from '../../src/party/win.js';
import { EPISODE_CAP } from '../../src/party/phases.js';
import { ROOMS, coveredRooms, coverageFraction } from '../../src/party/coverage.js';
import { blindStrip } from '../../src/party/darkrun.js';
import { castBallot, nominate, vote, willLie, spikesThisEpisode, chance } from '../../src/party/policy.js';

const SEEDS = Number(process.env.SEEDS || 300);
const COUNTS = [4, 5, 6, 7, 8];
const BLIND = Math.min(1, blindStrip(4.80, 70) / 8.0);

function resolveExpedition({ seed, ep, worldSeed, unlocked, guidePolicy, producerSpiked }) {
  const covered = coveredRooms(worldSeed, unlocked);
  let hunter = ROOMS[Math.floor(chance(seed, `h${ep}`) * ROOMS.length)];
  let runner = 'hall', taken = false;
  for (let turn = 0; turn < 4 && !taken; turn++) {
    const inStrip = chance(seed, `strip${ep}${turn}`) < BLIND;
    const hadSignal = covered.has(hunter) && !inStrip;
    const lied = willLie({ policy: guidePolicy, hadSignal, seed, salt: `${ep}:${turn}` });
    const honestlyWrong = !lied && !hadSignal && chance(seed, `guess${ep}${turn}`) < 0.5;
    const callWrong = lied || honestlyWrong;
    const wrongTurn = ROOMS[Math.floor(chance(seed, `mv${ep}${turn}`) * ROOMS.length)];
    runner = callWrong && chance(seed, `meet${ep}${turn}`) < 0.5 ? hunter : wrongTurn;
    hunter = producerSpiked && turn === 1 ? runner : ROOMS[Math.floor(chance(seed, `hw${ep}${turn}`) * ROOMS.length)];
    if (hunter === runner) taken = chance(seed, `kill${ep}${turn}`) < 0.55;
  }
  return { taken };
}

/** voteOn=false: nobody nominates and nobody votes — the deduction layer switched OFF. */
function playMatch({ count, seed, goodPolicy, evilPolicy, voteOn = true }) {
  const r = createRoom({ count, castSeed: seed * 977 + count, worldSeed: seed + 1, send: () => {}, emit: () => {} });
  r.start();
  const align = Object.fromEntries(r.deal.seats.map((s) => [s.id, s.alignment]));
  const evilSet = new Set(r.deal.evil);
  const policyOf = (id) => (align[id] === 'evil' ? evilPolicy : goodPolicy);
  const suspicion = {};
  const snaps = [];           // state at the START of each episode
  let expeditions = 0, survived = 0, execGood = 0, execEvil = 0, atFull = 0;

  for (let ep = 1; ep <= EPISODE_CAP; ep++) {
    if (r.state.outcome && r.state.outcome !== OUTCOME.RENEWED) break;
    const living = r.state.players.filter((p) => p.alive).map((p) => p.id);
    if (living.length < 2) break;
    const lit = r.log.all().filter((e) => e.type === 'run.camera_lit').length;
    const cov = coverageFraction(seed + 1, r.state.cameras.unlocked);
    if (cov >= 1) atFull++;
    snaps.push({ ep, lit, need: WIN_TARGETS[count].cameraTarget,
      livingGood: living.filter((id) => !evilSet.has(id)).length,
      livingEvil: living.filter((id) => evilSet.has(id)).length, cov });

    const ballots = living.map((id) => castBallot({ policy: policyOf(id), self: id, living, history: r.state.history, seed, ep }));
    const pair = tallyCasting({ ballots, living, history: r.state.history, lastPair: r.state.lastPair, ep, matchSeed: seed + 1 });
    const seatedEvil = living.filter((id) => evilSet.has(id) && id !== pair.runner && id !== pair.guide);
    const spikers = seatedEvil.filter((id) => spikesThisEpisode({ policy: evilPolicy, seed, ep, self: id }));
    const exp = resolveExpedition({ seed, ep, worldSeed: seed + 1, unlocked: r.state.cameras.unlocked, guidePolicy: policyOf(pair.guide), producerSpiked: spikers.length > 0 });
    expeditions++; if (!exp.taken) survived++;
    if (exp.taken) suspicion[pair.guide] = (suspicion[pair.guide] ?? 0) + 1;

    let noms = [], votes = {};
    if (voteOn) {
      for (const id of living) {
        if (noms.length >= 3) break;
        const n = nominate({ policy: policyOf(id), self: id, living, suspicion, seed, ep });
        if (n && !noms.some((x) => x.nominator === n.nominator || x.target === n.target) && n.target !== n.nominator) noms.push(n);
      }
      const standing = noms.map((n) => n.target);
      votes = Object.fromEntries(living.map((id) => [id, vote({ policy: policyOf(id), self: id, standing, suspicion, evilSet, seed, ep })]));
    } else {
      votes = Object.fromEntries(living.map((id) => [id, 'NO_ONE']));
    }
    const before = r.log.all().length;
    r.playEpisode({ ballots, takeRunner: exp.taken, nominations: noms, votes, hunterRoom: ROOMS[0] });
    for (const e of r.log.all().slice(before)) if (e.type === 'player.executed') (evilSet.has(e.data.id) ? execEvil++ : execGood++);
  }
  const win = r.log.all().filter((e) => e.type === 'win.checked').pop();
  // fold the SAME log and report what the win machine believes the episode number is
  const fold = foldWin(r.log.all(), { count, alignmentOf: (id) => align[id] });
  return { count, seed, outcome: r.state.outcome ?? OUTCOME.RENEWED, rule: win ? (win.data.rule ?? 'CAP-FALLBACK') : 'NONE',
    snaps, expeditions, survived, execGood, execEvil, atFull, episodes: snaps.length, foldEpisode: fold.episode };
}

const PAIR = [['naive-good','patient-evil'],['naive-good','aggressive-evil'],['cautious-good','patient-evil'],['cautious-good','aggressive-evil']];
const on = [], off = [];
for (const count of COUNTS) for (const [gp, evp] of PAIR) for (let s = 0; s < SEEDS; s++) {
  on.push(playMatch({ count, seed: s, goodPolicy: gp, evilPolicy: evp, voteOn: true }));
  off.push(playMatch({ count, seed: s, goodPolicy: gp, evilPolicy: evp, voteOn: false }));
}
const pct = (x) => (x * 100).toFixed(1).padStart(5) + '%';
const gw = (l) => l.filter((r) => r.outcome === OUTCOME.FINALE).length / l.length;

console.log(`PROBE _econ2_runaway · ${SEEDS} seeds x ${PAIR.length} pairings x ${COUNTS.length} counts, run twice (vote on / vote off) = ${on.length + off.length} matches`);

console.log('\n=== A. WHAT THE VOTE COSTS GOOD ===');
console.log('  count │ good win, vote ON │ good win, vote OFF (nobody nominates) │ delta');
for (const c of COUNTS) {
  const a = gw(on.filter((r) => r.count === c)), b = gw(off.filter((r) => r.count === c));
  console.log(`  ${String(c).padStart(5)} │ ${pct(a).padStart(17)} │ ${pct(b).padStart(37)} │ ${((a - b) * 100).toFixed(1).padStart(6)}pp`);
}
console.log('  executions that hit good vs Production, vote ON: '
  + `${on.reduce((a,r)=>a+r.execGood,0)} good / ${on.reduce((a,r)=>a+r.execEvil,0)} Production`);

console.log('\n=== B. EXPEDITION SURVIVAL (each survival = one camera) ===');
console.log('  count │ expeditions │ survived │ P(survive) │ needed successes │ episodes available');
for (const c of COUNTS) {
  const sub = on.filter((r) => r.count === c);
  const e = sub.reduce((a, r) => a + r.expeditions, 0), s = sub.reduce((a, r) => a + r.survived, 0);
  console.log(`  ${String(c).padStart(5)} │ ${String(e).padStart(11)} │ ${String(s).padStart(8)} │ ${pct(s / e).padStart(10)} │ ${String(WIN_TARGETS[c].cameraTarget).padStart(16)} │ ${String(EPISODE_CAP).padStart(18)}`);
}

console.log('\n=== C. RUNAWAY: good win rate conditioned on the state at the START of each episode ===');
for (const c of COUNTS) {
  console.log(`  ${c} players (camera target ${WIN_TARGETS[c].cameraTarget}, ${EPISODE_CAP - 1} episodes left after ep1):`);
  for (let ep = 2; ep <= EPISODE_CAP; ep++) {
    const buckets = {};
    for (const r of on.filter((x) => x.count === c)) {
      const s = r.snaps.find((y) => y.ep === ep); if (!s) continue;
      const k = `${s.lit} lit`;
      (buckets[k] ||= []).push(r.outcome === OUTCOME.FINALE ? 1 : 0);
    }
    const parts = Object.entries(buckets).sort().map(([k, v]) => `${k}: ${(v.reduce((a,b)=>a+b,0)/v.length*100).toFixed(0)}% (n=${v.length})`);
    if (parts.length) console.log(`    entering ep${ep} — ` + parts.join('  '));
  }
}

console.log('\n=== D. HOW MANY EPISODES ARE PLAYED WITH A PERFECT-ORACLE GUIDE (coverage 6/6) ===');
console.log('  count │ mean episodes at full coverage │ % of match spent at full coverage');
for (const c of COUNTS) {
  const sub = on.filter((r) => r.count === c);
  const m = sub.reduce((a, r) => a + r.atFull, 0) / sub.length;
  const frac = sub.reduce((a, r) => a + (r.episodes ? r.atFull / r.episodes : 0), 0) / sub.length;
  console.log(`  ${String(c).padStart(5)} │ ${m.toFixed(2).padStart(30)} │ ${pct(frac).padStart(33)}`);
}

console.log('\n=== E. THE WIN MACHINE\'S OWN EPISODE COUNTER, FOLDED OVER A REAL room.js LOG ===');
const long = on.filter((r) => r.episodes === EPISODE_CAP);
console.log(`  matches that actually played ${EPISODE_CAP} episodes: ${long.length}`);
console.log(`  of those, foldWin() reported episode = 1 in ${long.filter((r) => r.foldEpisode === 1).length} of ${long.length}`);
console.log(`  distinct foldWin episode values seen: ${[...new Set(on.map((r) => r.foldEpisode))].join(', ')}`);
console.log(`  W5 firings across all ${on.length} matches: ${on.filter((r) => r.rule === 'W5').length}`);
console.log(`  CAP-FALLBACK (room.js:295, outside the win machine): ${on.filter((r) => r.rule === 'CAP-FALLBACK').length}`);
