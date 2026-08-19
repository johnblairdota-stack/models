/**
 * ITEM 2 VERIFICATION — does the daylight seam correlate with liveness, over 512 seeds?
 *
 * Pure node, no browser: `connectorDressing`/`resolveAll`/`chooseExit` are all plain JS with no
 * three.js scene dependency, so this reuses the exact functions `conn-1.mjs` C6 exercises in the
 * browser, just swept over many seeds without paying for 512 page loads. Throwaway — delete
 * after the round.
 *
 * Usage: node harness/_tmp_seam_correlation.mjs
 */
import { CONNECTORS, EXIT_SITES } from '../src/game/spaces.js';
import { connectorDressing, resolveAll } from '../src/game/connectors.js';
import { chooseExit } from '../src/game/run.js';

const N = 512;
const siteIds = EXIT_SITES.map((s) => s.id);

let liveSeam = 0;
let exteriorSeamHits = 0, exteriorTotal = 0;
let interiorSeamHits = 0, interiorTotal = 0;
const perSite = new Map(siteIds.map((id) => [id, { seam: 0, n: 0 }]));

for (let i = 0; i < N; i++) {
  const seed = `seam-sweep-${i}`;
  const plan = chooseExit(seed, siteIds);
  const conn = resolveAll(CONNECTORS, plan);
  for (const c of CONNECTORS) {
    const r = conn.get(c.id);
    if (!r || r.state === 'open') continue;         // only closed connectors are dressed
    const outside = c.b === 'outside';
    const d = connectorDressing(c.id, seed, 'blind', r.state, outside);
    if (outside) {
      exteriorTotal++;
      if (d.seam) exteriorSeamHits++;
      const row = perSite.get(c.id);
      row.n++; if (d.seam) row.seam++;
      if (c.id === plan.exitId) liveSeam += d.seam ? 1 : 0;
    } else {
      interiorTotal++;
      if (d.seam) interiorSeamHits++;
    }
  }
}

console.log(`seeds: ${N}`);
console.log(`interior (8 breachable) panels: seam true on ${interiorSeamHits}/${interiorTotal} -- must be 0`);
console.log(`exterior (14 candidate) panels: seam true on ${exteriorSeamHits}/${exteriorTotal}` +
  ` = ${(100 * exteriorSeamHits / exteriorTotal).toFixed(1)}%`);
console.log(`live exit specifically: seam true on ${liveSeam}/${N} = ${(100 * liveSeam / N).toFixed(1)}%`);
console.log('per-site seam rate (all 14, live-or-chained pooled):');
for (const [id, row] of perSite) {
  console.log(`  ${id.padEnd(24)} ${row.seam}/${row.n} = ${(100 * row.seam / row.n).toFixed(1)}%`);
}
