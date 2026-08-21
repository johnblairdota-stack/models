#!/usr/bin/env node
/**
 * _econ1_shape — throwaway probe. Instruments party-sim's own match loop and reports the
 * episode economy: win rate by count, ENDING CAUSE by win rule, episode length, the camera
 * economy, and vote accuracy by episode. Nothing here invents a rule; every module is shipped.
 */
import { createRoom } from '../../src/party/room.js';
import { tallyCasting } from '../../src/party/ballot.js';
import { COMPOSITION } from '../../src/party/cast.js';
import { OUTCOME, WIN_TARGETS } from '../../src/party/win.js';
import { EPISODE_CAP } from '../../src/party/phases.js';
import { ROOMS, coveredRooms, coverageFraction, expectedHonestError } from '../../src/party/coverage.js';
import { blindStrip } from '../../src/party/darkrun.js';
import { castBallot, nominate, vote, willLie, spikesThisEpisode, chance } from '../../src/party/policy.js';

const SEEDS = Number(process.env.SEEDS || 1000);
const COUNTS = [4, 5, 6, 7, 8];
const TILT = 70, ROOM_DEPTH = 8.0;
const BLIND = Math.min(1, blindStrip(4.80, TILT) / ROOM_DEPTH);

function resolveExpedition({ seed, ep, worldSeed, unlocked, guidePolicy, producerSpiked }) {
  const covered = coveredRooms(worldSeed, unlocked);
  let hunter = ROOMS[Math.floor(chance(seed, `h${ep}`) * ROOMS.length)];
  let runner = 'hall';
  let taken = false;
  const calls = [];
  let arrivals = 0, arrivalsEvilCaused = 0;
  for (let turn = 0; turn < 4 && !taken; turn++) {
    const inStrip = chance(seed, `strip${ep}${turn}`) < BLIND;
    const hadSignal = covered.has(hunter) && !inStrip;
    const lied = willLie({ policy: guidePolicy, hadSignal, seed, salt: `${ep}:${turn}` });
    const honestlyWrong = !lied && !hadSignal && chance(seed, `guess${ep}${turn}`) < 0.5;
    const callWrong = lied || honestlyWrong;
    calls.push({ hadSignal, lied, honestlyWrong });
    const wrongTurn = ROOMS[Math.floor(chance(seed, `mv${ep}${turn}`) * ROOMS.length)];
    runner = callWrong && chance(seed, `meet${ep}${turn}`) < 0.5 ? hunter : wrongTurn;
    hunter = producerSpiked && turn === 1 ? runner : ROOMS[Math.floor(chance(seed, `hw${ep}${turn}`) * ROOMS.length)];
    if (hunter === runner) {
      arrivals++;
      if (lied || (producerSpiked && turn === 1)) arrivalsEvilCaused++;
      taken = chance(seed, `kill${ep}${turn}`) < 0.55;
    }
  }
  return { taken, calls, arrivals, arrivalsEvilCaused };
}

function playMatch({ count, seed, goodPolicy, evilPolicy }) {
  const r = createRoom({ count, castSeed: seed * 977 + count, worldSeed: seed + 1, send: () => {}, emit: () => {} });
  r.start();
  const align = Object.fromEntries(r.deal.seats.map((s) => [s.id, s.alignment]));
  const evilSet = new Set(r.deal.evil);
  const policyOf = (id) => (align[id] === 'evil' ? evilPolicy : goodPolicy);
  const suspicion = {};
  const m = {
    count, seed, episodes: 0, execsByEp: [], takes: 0, litByEp: [], unlockedByEp: [],
    calls: [], votesHeld: 0, votesExecuted: 0, coverageByEp: [], firstFullCoverEp: null,
  };

  for (let ep = 1; ep <= EPISODE_CAP; ep++) {
    if (r.state.outcome && r.state.outcome !== OUTCOME.RENEWED) break;
    const living = r.state.players.filter((p) => p.alive).map((p) => p.id);
    if (living.length < 2) break;
    const unlockedBefore = r.state.cameras.unlocked;
    m.unlockedByEp.push(unlockedBefore);
    const cov = coverageFraction(seed + 1, unlockedBefore);
    m.coverageByEp.push(cov);
    if (m.firstFullCoverEp === null && cov >= 1) m.firstFullCoverEp = ep;

    const ballots = living.map((id) => castBallot({ policy: policyOf(id), self: id, living, history: r.state.history, seed, ep }));
    const pair = tallyCasting({ ballots, living, history: r.state.history, lastPair: r.state.lastPair, ep, matchSeed: seed + 1 });
    const seatedEvil = living.filter((id) => evilSet.has(id) && id !== pair.runner && id !== pair.guide);
    const spikers = seatedEvil.filter((id) => spikesThisEpisode({ policy: evilPolicy, seed, ep, self: id }));
    const exp = resolveExpedition({ seed, ep, worldSeed: seed + 1, unlocked: unlockedBefore, guidePolicy: policyOf(pair.guide), producerSpiked: spikers.length > 0 });
    for (const c of exp.calls) m.calls.push({ ep, ...c, cov });
    if (exp.taken) suspicion[pair.guide] = (suspicion[pair.guide] ?? 0) + 1;

    const noms = [];
    for (const id of living) {
      if (noms.length >= 3) break;
      const n = nominate({ policy: policyOf(id), self: id, living, suspicion, seed, ep });
      if (n && !noms.some((x) => x.nominator === n.nominator || x.target === n.target) && n.target !== n.nominator) noms.push(n);
    }
    const standing = noms.map((n) => n.target);
    const votes = Object.fromEntries(living.map((id) => [id, vote({ policy: policyOf(id), self: id, standing, suspicion, evilSet, seed, ep })]));

    const before = r.log.all().length;
    r.playEpisode({ ballots, takeRunner: exp.taken, nominations: noms, votes, hunterRoom: ROOMS[0] });
    m.episodes = ep;
    const fresh = r.log.all().slice(before);
    if (fresh.some((e) => e.type === 'phase.VOTE')) {
      m.votesHeld++;
      // eligible pool for a random-execution baseline: the living who could be executed
      const ex = fresh.find((e) => e.type === 'player.executed');
      if (ex) {
        m.votesExecuted++;
        m.execsByEp.push({ ep, id: ex.data.id, evil: evilSet.has(ex.data.id),
          livingEvil: living.filter((id) => evilSet.has(id)).length, living: living.length,
          standingEvil: standing.filter((id) => evilSet.has(id)).length, standing: standing.length });
      }
    }
    m.takes += fresh.filter((e) => e.type === 'player.taken').length;
    m.litByEp.push(fresh.filter((e) => e.type === 'run.camera_lit').length);
  }
  const win = r.log.all().filter((e) => e.type === 'win.checked').pop();
  return {
    ...m,
    outcome: r.state.outcome ?? OUTCOME.RENEWED,
    rule: win ? (win.data.rule ?? 'CAP-FALLBACK') : 'NONE',
    camerasLit: win ? win.data.camerasLit : 0,
    fed: win ? win.data.fed : 0,
    finalUnlocked: r.state.cameras.unlocked,
    evilN: evilSet.size,
  };
}

const PAIRINGS = [
  ['naive-good', 'patient-evil'], ['naive-good', 'aggressive-evil'],
  ['cautious-good', 'patient-evil'], ['cautious-good', 'aggressive-evil'],
  ['scatter', 'scatter'],
];
const all = [];
for (const count of COUNTS) for (const [gp, evp] of PAIRINGS) for (let s = 0; s < SEEDS; s++) {
  all.push({ gp, evp, ...playMatch({ count, seed: s, goodPolicy: gp, evilPolicy: evp }) });
}
const tuned = all.filter((r) => r.gp !== 'scatter');
const pct = (x) => (x * 100).toFixed(1).padStart(5) + '%';
const goodWon = (r) => r.outcome === OUTCOME.FINALE;

console.log(`PROBE _econ1_shape · ${SEEDS} seeds x ${PAIRINGS.length} policy pairings x ${COUNTS.length} counts = ${all.length} matches`);
console.log(`  room.js engine (same one party-sim drives). EPISODE_CAP=${EPISODE_CAP}`);

console.log('\n=== 1. WIN RATE, per count, TUNED policies only (n = ' + SEEDS * 4 + ' per count) ===');
console.log('  count │ good win │ evil win │ target cam │ target fed │ evil in cast');
for (const c of COUNTS) {
  const sub = tuned.filter((r) => r.count === c);
  const g = sub.filter(goodWon).length / sub.length;
  console.log(`  ${String(c).padStart(5)} │ ${pct(g)}   │ ${pct(1 - g)}   │ ${String(WIN_TARGETS[c].cameraTarget).padStart(10)} │ ${String(WIN_TARGETS[c].feedTarget).padStart(10)} │ ${COMPOSITION[c].minion + COMPOSITION[c].producer}/${c}`);
}
console.log('\n  by pairing:');
for (const [gp, evp] of PAIRINGS) {
  const row = COUNTS.map((c) => {
    const sub = all.filter((r) => r.count === c && r.gp === gp && r.evp === evp);
    return `${c}p ${(sub.filter(goodWon).length / sub.length * 100).toFixed(0)}%`;
  }).join('  ');
  console.log(`   ${(gp + ' vs ' + evp).padEnd(32)} ${row}`);
}

console.log('\n=== 2. HOW GAMES END (tuned, by win rule) ===');
const RULE_NAME = { W1: 'W1 Production executed to zero (good)', W2: 'W2 cameras lit to target (good)',
  W3: 'W3 enough goods fed to Hunter (evil)', W4: 'W4 parity: evil >= good (evil)',
  W5: 'W5 episode cap reached, cameras short (evil)', 'CAP-FALLBACK': 'room.js cap fallback, NO win rule fired (evil)', NONE: 'no verdict' };
console.log('  count │ ' + ['W1', 'W2', 'W3', 'W4', 'W5', 'CAP-FALLBACK'].map((k) => k.padStart(12)).join(' │ '));
for (const c of COUNTS) {
  const sub = tuned.filter((r) => r.count === c);
  const cells = ['W1', 'W2', 'W3', 'W4', 'W5', 'CAP-FALLBACK'].map((k) => {
    const n = sub.filter((r) => r.rule === k).length;
    return (n ? (n / sub.length * 100).toFixed(1) + '%' : '·').padStart(12);
  });
  console.log(`  ${String(c).padStart(5)} │ ` + cells.join(' │ '));
}
console.log('  legend:'); for (const [k, v] of Object.entries(RULE_NAME)) console.log(`    ${k.padEnd(13)} ${v}`);

console.log('\n=== 3. EPISODE LENGTH (tuned) ===');
console.log('  count │ mean eps │ median │  p90 │ % hitting cap ' + EPISODE_CAP);
for (const c of COUNTS) {
  const sub = tuned.filter((r) => r.count === c).map((r) => r.episodes).sort((a, b) => a - b);
  const mean = sub.reduce((a, b) => a + b, 0) / sub.length;
  console.log(`  ${String(c).padStart(5)} │ ${mean.toFixed(2).padStart(8)} │ ${String(sub[Math.floor(sub.length / 2)]).padStart(6)} │ ${String(sub[Math.floor(sub.length * 0.9)]).padStart(4)} │ ${pct(sub.filter((e) => e >= EPISODE_CAP).length / sub.length)}`);
}

console.log('\n=== 4. THE CAMERA ECONOMY ===');
console.log('  cameraRoster has ' + (ROOMS.length / 2) + ' cameras covering ' + ROOMS.length + ' rooms, 2 rooms each.');
console.log('  state.cameras.unlocked starts at 1. Each SURVIVED expedition = +1 unlocked = 1 run.camera_lit event.');
console.log('  unlocked │ coverage │ expected honest guide error │ camera_lit events so far');
for (let u = 1; u <= 6; u++) {
  const cf = coverageFraction(7, u);
  console.log(`  ${String(u).padStart(8)} │ ${(cf * 100).toFixed(0).padStart(7)}% │ ${(expectedHonestError(cf) * 100).toFixed(1).padStart(27)}% │ ${u - 1}`);
}
console.log('\n  count │ cam target │ unlocked at win │ full coverage at │ eps to full cov │ eps to win │ gap');
for (const c of COUNTS) {
  const sub = tuned.filter((r) => r.count === c);
  const fc = sub.map((r) => r.firstFullCoverEp).filter((x) => x != null).sort((a, b) => a - b);
  const wins = sub.filter(goodWon).map((r) => r.episodes).sort((a, b) => a - b);
  const tgt = WIN_TARGETS[c].cameraTarget;
  console.log(`  ${String(c).padStart(5)} │ ${String(tgt).padStart(10)} │ ${String(tgt + 1).padStart(15)} │ ${'unlocked>=3'.padStart(16)} │ ${String(fc.length ? fc[Math.floor(fc.length / 2)] : 'never').padStart(15)} │ ${String(wins.length ? wins[Math.floor(wins.length / 2)] : 'n/a').padStart(10)} │ ${fc.length && wins.length ? (wins[Math.floor(wins.length / 2)] - fc[Math.floor(fc.length / 2)]) + ' eps as oracle' : '-'}`);
}
console.log('\n  % of TUNED matches that reached full (6/6) coverage before ending: '
  + pct(tuned.filter((r) => r.firstFullCoverEp != null).length / tuned.length));
console.log('  honest guide error by episode (tuned, measured over the sim expedition model):');
for (let ep = 1; ep <= EPISODE_CAP; ep++) {
  const cs = tuned.flatMap((r) => r.calls).filter((c) => c.ep === ep && !c.lied);
  if (!cs.length) continue;
  const err = cs.filter((c) => c.honestlyWrong).length / cs.length;
  const meanCov = cs.reduce((a, c) => a + c.cov, 0) / cs.length;
  console.log(`    ep ${ep}: coverage ${(meanCov * 100).toFixed(0)}%  honest error ${(err * 100).toFixed(1)}%  (n=${cs.length})`);
}

console.log('\n=== 5. DOES THE VOTE DO ANYTHING? (tuned) ===');
const execs = tuned.flatMap((r) => r.execsByEp);
const hit = execs.filter((e) => e.evil).length;
console.log(`  executions: ${execs.length} across ${tuned.length} matches (${(execs.length / tuned.length).toFixed(2)} per match)`);
console.log(`  votes held (non-premiere episodes reaching VOTE): ${tuned.reduce((a, r) => a + r.votesHeld, 0)}, of which executed: ${tuned.reduce((a, r) => a + r.votesExecuted, 0)}`);
console.log(`  EXECUTED PLAYER WAS PRODUCTION: ${pct(hit / execs.length)}  (n=${execs.length})`);
const blindBase = execs.reduce((a, e) => a + e.livingEvil / e.living, 0) / execs.length;
const standBase = execs.filter((e) => e.standing > 0).reduce((a, e) => a + e.standingEvil / e.standing, 0) / execs.filter((e) => e.standing > 0).length;
console.log(`  baseline, random living player:   ${pct(blindBase)}`);
console.log(`  baseline, random STANDING nominee:${pct(standBase)}   <- the honest baseline: the vote only chooses among nominees`);
console.log('\n  by episode:');
console.log('  ep │ execs │ hit Production │ random-nominee baseline');
for (let ep = 1; ep <= EPISODE_CAP; ep++) {
  const sub = execs.filter((e) => e.ep === ep);
  if (!sub.length) continue;
  const b = sub.filter((e) => e.standing > 0).reduce((a, e) => a + e.standingEvil / e.standing, 0) / sub.filter((e) => e.standing > 0).length;
  console.log(`  ${String(ep).padStart(2)} │ ${String(sub.length).padStart(5)} │ ${pct(sub.filter((e) => e.evil).length / sub.length).padStart(14)} │ ${pct(b).padStart(23)}`);
}
console.log('\n  by count:');
console.log('  count │ execs │ hit Production │ random-nominee baseline │ delta');
for (const c of COUNTS) {
  const sub = execs.filter((e) => tuned.find((r) => r.execsByEp.includes(e))?.count === c);
}
for (const c of COUNTS) {
  const sub = tuned.filter((r) => r.count === c).flatMap((r) => r.execsByEp);
  if (!sub.length) continue;
  const h = sub.filter((e) => e.evil).length / sub.length;
  const b = sub.filter((e) => e.standing > 0).reduce((a, e) => a + e.standingEvil / e.standing, 0) / sub.filter((e) => e.standing > 0).length;
  console.log(`  ${String(c).padStart(5)} │ ${String(sub.length).padStart(5)} │ ${pct(h).padStart(14)} │ ${pct(b).padStart(23)} │ ${((h - b) * 100).toFixed(1).padStart(6)}pp`);
}

console.log('\n=== 6. RUNAWAY / COMEBACK ===');
console.log('  matches where an execution ever happened: ' + pct(tuned.filter((r) => r.execsByEp.length > 0).length / tuned.length));
console.log('  matches where good won WITHOUT any execution (pure camera race): '
  + pct(tuned.filter((r) => goodWon(r) && r.execsByEp.length === 0).length / tuned.filter(goodWon).length) + ' of good wins');
console.log('  matches where any player was TAKEN by the Hunter: ' + pct(tuned.filter((r) => r.takes > 0).length / tuned.length));
console.log('  mean takes per match: ' + (tuned.reduce((a, r) => a + r.takes, 0) / tuned.length).toFixed(2));
