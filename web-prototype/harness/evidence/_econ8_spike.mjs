import { ROOMS, coveredRooms } from '../../src/party/coverage.js';
import { blindStrip } from '../../src/party/darkrun.js';
import { willLie, spikesThisEpisode, chance } from '../../src/party/policy.js';
const BLIND = Math.min(1, blindStrip(4.80, 70) / 8.0);
// isolate: same guide policy (honest good guide), vary ONLY whether the Producer spikes
for (const [label, spikeOn] of [['Producer spike ON (policy.js:114, 85% of episodes)', true], ['Producer spike OFF', false]]) {
  for (const unlocked of [1, 2, 3]) {
    let taken = 0, n = 0;
    for (let seed = 0; seed < 4000; seed++) for (let ep = 1; ep <= 3; ep++) {
      const covered = coveredRooms(seed + 1, unlocked);
      const spiked = spikeOn && spikesThisEpisode({ policy: 'patient-evil', seed, ep, self: 'p1' });
      let hunter = ROOMS[Math.floor(chance(seed, `h${ep}`) * ROOMS.length)], runner = 'hall', t2 = false;
      for (let t = 0; t < 4 && !t2; t++) {
        const hs = covered.has(hunter) && !(chance(seed, `strip${ep}${t}`) < BLIND);
        const lied = willLie({ policy: 'naive-good', hadSignal: hs, seed, salt: `${ep}:${t}` });
        const hw = !lied && !hs && chance(seed, `guess${ep}${t}`) < 0.5;
        const wt = ROOMS[Math.floor(chance(seed, `mv${ep}${t}`) * ROOMS.length)];
        runner = (lied || hw) && chance(seed, `meet${ep}${t}`) < 0.5 ? hunter : wt;
        hunter = (spiked && t === 1) ? runner : ROOMS[Math.floor(chance(seed, `hw${ep}${t}`) * ROOMS.length)];
        if (hunter === runner) t2 = chance(seed, `kill${ep}${t}`) < 0.55;
      }
      n++; if (t2) taken++;
    }
    console.log(`  ${label.padEnd(52)} unlocked=${unlocked}: runner taken ${(taken / n * 100).toFixed(1)}% of expeditions (n=${n})`);
  }
}
