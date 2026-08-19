/**
 * 🚨 ITEM 2 VERIFICATION — does a dig segment's DRESSING correlate with it being this run's
 * interconnect, over many seeds?
 *
 * `docs/design/procedural-map.md` §2: *"a closed connector must give NOTHING away."* Once one
 * segment per edge is the only way through, "which bay is wearing boards" must not be an answer.
 *
 * Pure node, no browser — the same trick `_tmp_seam_correlation.mjs` uses and for the same
 * reason: `connectorDressing` and `chooseInterconnect` are plain JS with no three.js in them, so
 * this exercises the exact functions the browser runs, swept over many seeds without paying for
 * 512 page loads. `conn-1.mjs` C6 is the in-browser half (it asserts the dressing never READS the
 * state); this is the population half (it asserts the seeded draw does not correlate anyway).
 *
 * Throwaway. Usage: node harness/_tmp_dig_dress_correlation.mjs [seeds]
 */
import { digPanels, chooseInterconnect, DIG_EDGES } from '../src/game/dig.js';
import { connectorDressing } from '../src/game/connectors.js';

const N = +(process.argv[2] ?? 512);
const SEGS = digPanels();
const KINDS = ['chain', 'boards', 'mortar'];   // `seam` is gated to `outside`; a segment is not

const pop = Object.fromEntries(KINDS.map((k) => [k, 0]));
const link = Object.fromEntries(KINDS.map((k) => [k, 0]));
let popN = 0, linkN = 0;
/** how often the interconnect is the ONLY bay on its edge wearing a given combination */
let linkUnique = 0, anyUnique = 0, anyUniqueN = 0;

for (let i = 0; i < N; i++) {
  const seed = `dig-dress-${i}`;
  const chosen = chooseInterconnect(seed, DIG_EDGES);
  const key = (d) => `${d.chain ? 'C' : '-'}${d.boards ? 'B' : '-'}${d.mortar ? 'M' : '-'}`;
  const byEdge = new Map();
  for (const s of SEGS) {
    // ⚠️ THE SAME CALL THE GAME MAKES, INCLUDING `outside = false` — a segment's far side is
    // another room, so the daylight seam can never appear on one. That gate is physical, not a
    // concealment choice, and it is the same argument `connectorDressing` already carries.
    const d = connectorDressing(s.id, seed, 'blind', 'breachable', false);
    const isLink = chosen.get(s.edge) === s.seg;
    popN++;
    for (const k of KINDS) if (d[k]) pop[k]++;
    if (isLink) { linkN++; for (const k of KINDS) if (d[k]) link[k]++; }
    if (!byEdge.has(s.edge)) byEdge.set(s.edge, []);
    byEdge.get(s.edge).push({ ...s, k: key(d), isLink });
  }
  // uniqueness, per edge per side — the population a player actually scans is one wall face
  for (const rows of byEdge.values()) {
    for (const side of ['a', 'b']) {
      const face = rows.filter((r) => r.side === side);
      for (const r of face) {
        const uniq = face.filter((q) => q.k === r.k).length === 1;
        anyUniqueN++; if (uniq) anyUnique++;
        if (r.isLink && uniq) linkUnique++;
      }
    }
  }
}

const pct = (a, b) => `${(100 * a / b).toFixed(1)}%`;
const se = (p, n) => `${(100 * Math.sqrt(p * (1 - p) / n)).toFixed(1)} pp`;
console.log(`seeds ${N} · ${SEGS.length} segments · ${linkN} interconnect draws · ${popN} segment draws`);
console.log('cue      population        the live interconnect     stderr on the link');
for (const k of KINDS) {
  const p = pop[k] / popN;
  console.log(`  ${k.padEnd(7)} ${String(pop[k]).padStart(6)}/${popN} = ${pct(pop[k], popN).padStart(6)}`
    + `   ${String(link[k]).padStart(4)}/${linkN} = ${pct(link[k], linkN).padStart(6)}`
    + `      +/- ${se(p, linkN)}`);
}
console.log(`unique combination on its own wall face: any segment ${pct(anyUnique, anyUniqueN)}`
  + ` · the interconnect ${pct(linkUnique, linkN)} (n=${linkN})`);
