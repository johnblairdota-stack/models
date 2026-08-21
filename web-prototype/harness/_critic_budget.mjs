/**
 * PROBE: round-loop R2/R2b/R2c assert the shooting-schedule BUDGET as arithmetic over
 * phases.js. Nothing compares that arithmetic to the wall clock the shipped session.js
 * actually burns. Measure the real elapsed time of a shipped show and compare.
 */
import { createSession, CALL, MOVE_CHOICE } from '../src/party/session.js';
import { PHASE, SECONDS, sessionSeconds, episodeSeconds, EPISODE_CAP } from '../src/party/phases.js';

function play({ seed = 1, noms = 0 } = {}) {
  const s = createSession({ count: 8, castSeed: seed, worldSeed: seed * 3, send: () => {} });
  let now = 0; s.start(now);
  const seen = [];           // [phase, episode, secondsBudgetedByTheClock]
  let lastTick = -1;
  for (let i = 0; i < 200000 && s.state.phase !== PHASE.REUNION; i++) {
    const alive = s.state.players.filter((p) => p.alive).map((p) => p.id);
    switch (s.state.phase) {
      case PHASE.CASTING:
        for (let k = 0; k < alive.length; k++) s.input(alive[k], { t:'cast', runner: alive[(k+1)%alive.length], guide: alive[(k+2)%alive.length] });
        break;
      case PHASE.EXPEDITION:
        s.input(s.state.pair.guide, { t:'call', call: CALL.CLEAR });
        s.input(s.state.pair.runner, { t:'move', move: MOVE_CHOICE.GO });
        break;
      case PHASE.RECKONING:
        for (let k = 0; k < noms && k < alive.length; k++) s.input(alive[k], { t:'nominate', target: alive[(k+3)%alive.length] });
        break;
      case PHASE.VOTE: for (const id of alive) s.input(id, { t:'vote', choice: alive[1] }); break;
      default: break;
    }
    if (s.state.tick !== lastTick) { lastTick = s.state.tick; seen.push([s.state.phase, s.state.episode, s.state.clock.seconds]); }
    now += 1000; s.tick(now);
  }
  return { s, now, seen };
}

for (const noms of [0, 3]) {
  console.log(`\n=== ${noms} nominations per reckoning ===`);
  let worstReal = 0, worstBudget = 0, worstEps = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const { s, now, seen } = play({ seed, noms });
    const eps = s.state.episode - 1;
    // What the harness's formula says a show of this length costs, plus the REUNION it excludes.
    const budget = sessionSeconds(eps, noms);
    const real = now / 1000 + SECONDS[PHASE.REUNION];   // the Reunion is entered but never ticked out
    if (real > worstReal) { worstReal = real; worstBudget = budget; worstEps = eps; }
  }
  console.log(`worst measured show: ${ (worstReal/60).toFixed(1) } min over ${worstEps} episodes`);
  console.log(`round-loop R2's formula for the same length: ${ (worstBudget/60).toFixed(1) } min`);
  console.log(`R2c asserts sessionSeconds(${EPISODE_CAP}, 3)/60 = ${(sessionSeconds(EPISODE_CAP,3)/60).toFixed(1)} min < 40`);
  console.log(`difference: ${((worstReal - worstBudget)/60).toFixed(2)} min`);
}

// which phases does the real loop actually run, and for how long?
{
  const { seen } = play({ seed: 7, noms: 3 });
  const byEp = new Map();
  for (const [ph, ep, sec] of seen) {
    if (!byEp.has(ep)) byEp.set(ep, []);
    const list = byEp.get(ep);
    const last = list[list.length - 1];
    if (last && last[0] === ph) { last[1] = Math.max(last[1], sec); continue; }
    list.push([ph, sec]);
  }
  console.log('\nphases the shipped loop actually ran, with the clock it put on each:');
  for (const [ep, list] of byEp) console.log(`  ep${ep}: ${list.map(([p, s]) => `${p}(${s}s)`).join(' → ')}`);
  console.log('\nepisodeSeconds(2, 3) says:', episodeSeconds(2, 3), 's');
}
