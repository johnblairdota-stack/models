/**
 * `doorlook-1`'s census — THE DIRECTIONAL TELL, AS NUMBERS, AND WHAT EACH CLOSED DOOR WEARS.
 *
 * WHY IT EXISTS. John: *"the undamageable ones are on the edge of the map and don't open. That
 * way players don't get a sense of direction from the lack of doors on the outside walls."* That
 * is a SEARCH-INTEGRITY requirement, not decoration: if the perimeter carried fewer doors, or
 * doors that looked different, the house would tell a player which way is out before they had
 * looked. This file measures both halves — the population (A/B) and the dressing (C/D) — with no
 * browser, because `spaces.js`, `connectors.js` and `run.js` are plain JS.
 *
 * ⚠️ A WALL SIDE IS NOT ONE KIND. The gallery's 27.2 m zmin run is shared with the chapel for
 * 6.8 m of its length and open to the garden for the other 20.4 m, so classifying whole SIDES
 * (the first version of this file did) reported that run as "interior" and hid two exterior
 * sites inside it. Every side is decomposed into the intervals a neighbouring space actually
 * covers; a connector is assigned to the interval it sits in, which is the same answer
 * `spec.b === 'outside'` gives and is cross-checked against it (assertion B3).
 *
 * 🚨 CONTROL THAT MUST FAIL, EVERY RUN (printed as [CTRL]): the same statistics recomputed with
 * the dressing forced back to a coin flip. If the shipped rule is in force those arms MUST
 * disagree; if they agree, this file is measuring something that is not the dressing.
 *
 *   node harness/_dl1-census.mjs
 */
import { SPACES, PANELS, PORTALS, WALL_T } from '../src/game/spaces.js';
import {
  connectorDressing, CONNECTOR, authoredState, aperture, isExitSite,
} from '../src/game/connectors.js';
import { chooseExit, seedRand } from '../src/game/run.js';
import { dressingRule, DRESS_RULE } from '../src/game/exterior.js';

const near = (a, b) => Math.abs(a - b) < 1e-6;
const fmt = (n, d = 2) => n.toFixed(d);
let pass = 0; let fail = 0;
const check = (ok, name, detail) => {
  if (ok) { pass++; console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};

// ---------------------------------------------------------------------------
// A. every boundary wall run, decomposed into its interior and perimeter stretches
// ---------------------------------------------------------------------------
const SIDES = ['xmin', 'xmax', 'zmin', 'zmax'];
const conn = [...PORTALS, ...PANELS];

function bandOf(sp, side) {
  const lo = side === 'zmin' ? sp.z0 - WALL_T : side === 'zmax' ? sp.z1
    : side === 'xmin' ? sp.x0 - WALL_T : sp.x1;
  return [lo, lo + WALL_T];
}
const axisOf = (side) => ((side === 'xmin' || side === 'xmax') ? 'x' : 'z');
/** the coordinate the run extends along, for a given side */
const runExtent = (sp, side) => (axisOf(side) === 'x' ? [sp.z0, sp.z1] : [sp.x0, sp.x1]);

/** The sub-intervals of `sp`'s `side` that another space sits behind. */
function sharedIntervals(sp, side) {
  const out = [];
  const [lo, hi] = bandOf(sp, side);
  const [u0, u1] = runExtent(sp, side);
  for (const t of SPACES) {
    if (t === sp) continue;
    // the neighbour's own facing band has to be the same 0.30 m band
    const opp = side === 'zmin' ? 'zmax' : side === 'zmax' ? 'zmin' : side === 'xmin' ? 'xmax' : 'xmin';
    const [tlo, thi] = bandOf(t, opp);
    if (!(near(tlo, lo) && near(thi, hi))) continue;
    const [t0, t1] = runExtent(t, opp);
    const a = Math.max(u0, t0); const b = Math.min(u1, t1);
    if (b - a > 1e-6) out.push([a, b]);
  }
  out.sort((p, q) => p[0] - q[0]);
  return out;
}
const inAny = (v, ivs) => ivs.some(([a, b]) => v >= a - 1e-6 && v <= b + 1e-6);
const lenOf = (ivs) => ivs.reduce((a, [p, q]) => a + (q - p), 0);

const runs = [];
for (const sp of SPACES) {
  for (const side of SIDES) {
    const ax = axisOf(side);
    const [lo, hi] = bandOf(sp, side);
    const [u0, u1] = runExtent(sp, side);
    const shared = sharedIntervals(sp, side);
    const on = [];
    for (const d of conn) {
      if (d.a !== sp.id && d.b !== sp.id) continue;
      const v = ax === 'x' ? d.x : d.z;
      if (!(v >= lo - 1e-6 && v <= hi + 1e-6)) continue;
      const u = ax === 'x' ? d.z : d.x;
      on.push({ id: d.id, u, state: authoredState(d), outside: d.b === 'outside', kind: inAny(u, shared) ? 'interior' : 'perimeter' });
    }
    on.sort((a, b) => a.u - b.u);
    runs.push({
      space: sp.id, side, u0, u1, len: u1 - u0,
      sharedLen: lenOf(shared), perimLen: (u1 - u0) - lenOf(shared), on,
    });
  }
}

console.log('=== A. EVERY BOUNDARY WALL RUN, AS THE PLAYER IN THAT ROOM MEETS IT ===');
console.log('space      side   total  interior perimeter | closed  open | spacing(m) | connectors');
for (const r of runs) {
  const closed = r.on.filter((c) => c.state !== CONNECTOR.OPEN).length;
  const open = r.on.length - closed;
  const gaps = [];
  for (let i = 1; i < r.on.length; i++) gaps.push(r.on[i].u - r.on[i - 1].u);
  console.log(
    `${r.space.padEnd(10)} ${r.side.padEnd(5)} ${fmt(r.len).padStart(6)} ${fmt(r.sharedLen).padStart(9)} ${fmt(r.perimLen).padStart(9)} |`
    + ` ${String(closed).padStart(6)} ${String(open).padStart(5)} | ${(gaps.map((g) => fmt(g, 1)).join(',') || '-').padStart(12)} |`
    + ` ${r.on.map((c) => `${c.id}[${c.kind[0]}]`).join(' ')}`,
  );
}

// ---------------------------------------------------------------------------
// B. the tell, as two numbers
// ---------------------------------------------------------------------------
console.log('\n=== B. THE DIRECTIONAL TELL, IN METRES OF WALL ===');
const tot = { perimeter: { len: 0, closed: 0, open: 0 }, interior: { len: 0, closed: 0, open: 0 } };
for (const r of runs) {
  tot.perimeter.len += r.perimLen;
  tot.interior.len += r.sharedLen;
  for (const c of r.on) {
    const t = tot[c.kind];
    if (c.state === CONNECTOR.OPEN) t.open++; else t.closed++;
  }
}
for (const k of ['perimeter', 'interior']) {
  const t = tot[k];
  console.log(`${k.padEnd(10)} wall=${fmt(t.len).padStart(7)} m   closed doors=${String(t.closed).padStart(3)}   open doorways=${String(t.open).padStart(2)}`
    + `   CLOSED PER 10 m = ${fmt(t.closed / t.len * 10)}`);
}
const ratio = (tot.perimeter.closed / tot.perimeter.len) / (tot.interior.closed / tot.interior.len);
console.log(`perimeter density / interior density = ${fmt(ratio)}  (1.00 would be identical; >1 means the OUTSIDE has MORE doors)`);

console.log('\n  assertions');
check(tot.perimeter.closed >= tot.interior.closed,
  'B1 the perimeter carries AT LEAST as many closed doors as the interior',
  `${tot.perimeter.closed} vs ${tot.interior.closed}`);
check(ratio >= 1.0, 'B2 closed doors per metre are not SPARSER on the perimeter', `ratio ${fmt(ratio)}`);
{
  let agree = true; const bad = [];
  for (const r of runs) for (const c of r.on) {
    if (c.state === CONNECTOR.OPEN) continue;
    if ((c.kind === 'perimeter') !== c.outside) { agree = false; bad.push(c.id); }
  }
  check(agree, 'B3 geometric classification agrees with `spec.b === "outside"`', bad.length ? bad.join(',') : 'all 18');
}
{
  // 🚨 the one a player actually feels: is there a ROOM whose outside walls are bare?
  const perRoom = new Map();
  for (const r of runs) {
    if (r.perimLen < 3.0) continue;
    const e = perRoom.get(r.space) ?? { len: 0, closed: 0, runs: 0, bareRuns: 0 };
    e.len += r.perimLen; e.runs++;
    const n = r.on.filter((c) => c.kind === 'perimeter' && c.state !== CONNECTOR.OPEN).length;
    e.closed += n; if (n === 0) e.bareRuns++;
    perRoom.set(r.space, e);
  }
  console.log('\n  per room, perimeter runs longer than 3 m:');
  let worst = null;
  for (const [id, e] of perRoom) {
    console.log(`    ${id.padEnd(10)} runs=${e.runs}  wall=${fmt(e.len).padStart(6)} m  closed=${e.closed}  runs with NO door=${e.bareRuns}`);
    if (!worst || e.closed < worst.e.closed) worst = { id, e };
  }
  check(worst.e.closed >= 1, 'B4 every room with an outside wall has at least one door in it',
    `worst is ${worst.id} at ${worst.e.closed}`);
}

// ---------------------------------------------------------------------------
// C / D. the dressing
// ---------------------------------------------------------------------------
const closedConn = PANELS.filter((d) => authoredState(d) !== CONNECTOR.OPEN);
const siteIds = PANELS.filter(isExitSite).map((d) => d.id);
const SEEDS = 512;

function sweep(applyRule) {
  const t = {
    perim: { n: 0, chain: 0, boards: 0, mortar: 0, none: 0 },
    inter: { n: 0, chain: 0, boards: 0, mortar: 0, none: 0 },
  };
  const byState = {};
  for (const s of CONNECTOR_LIST) byState[s] = { n: 0, chain: 0, boards: 0, none: 0 };
  for (let s = 0; s < SEEDS; s++) {
    const seed = `s${s}`;
    const { exitId } = chooseExit(seed, siteIds);
    for (const d of closedConn) {
      const outside = d.b === 'outside';
      const state = outside ? (d.id === exitId ? CONNECTOR.EXIT : CONNECTOR.CHAINED) : CONNECTOR.BREACHABLE;
      let dr = connectorDressing(d.id, seed, 'blind', state, outside);
      if (applyRule) dr = applyRule(dr, d.id, seed);
      const b = outside ? t.perim : t.inter;
      const st = byState[state];
      for (const acc of [b, st]) {
        acc.n++;
        if (dr.chain) acc.chain++;
        if (dr.boards) acc.boards++;
        if (acc.mortar !== undefined && dr.mortar) acc.mortar++;
        if (!dr.chain && !dr.boards && !dr.mortar) acc.none++;
      }
    }
  }
  return { t, byState };
}
const CONNECTOR_LIST = [CONNECTOR.BREACHABLE, CONNECTOR.CHAINED, CONNECTOR.EXIT];

const shipped = sweep((dr, id, seed) => dressingRule(dr, id, seed));
const ctrl = sweep(null);   // 🚨 the arm that must differ: the raw coin flip

const show = (label, r) => {
  for (const [k, b] of Object.entries(r.t)) {
    console.log(`  ${label} ${k}: n=${b.n}  chain=${fmt(b.chain / b.n * 100, 1)}%  boarded=${fmt(b.boards / b.n * 100, 1)}%`
      + `  mortar=${fmt(b.mortar / b.n * 100, 1)}%  NOTHING AT ALL=${fmt(b.none / b.n * 100, 1)}%`);
  }
  for (const [k, b] of Object.entries(r.byState)) {
    if (!b.n) continue;
    console.log(`  ${label} state ${k.padEnd(11)} n=${String(b.n).padStart(6)}  chain=${fmt(b.chain / b.n * 100, 1)}%`
      + `  boarded=${fmt(b.boards / b.n * 100, 1)}%  nothing=${fmt(b.none / b.n * 100, 1)}%`);
  }
};

console.log(`\n=== C. THE DRESSING OVER ${SEEDS} SEEDS, SHIPPED RULE (${DRESS_RULE}) ===`);
show('    ', shipped);
console.log('\n[CTRL] the same sweep with the rule removed — a raw `connectorDressing` coin flip:');
show('[CTRL]', ctrl);

console.log('\n  assertions');
check(shipped.t.perim.chain === shipped.t.perim.n && shipped.t.inter.chain === shipped.t.inter.n,
  'C1 EVERY closed connector wears a chain, both kinds, all seeds',
  `${shipped.t.perim.chain}/${shipped.t.perim.n} perimeter, ${shipped.t.inter.chain}/${shipped.t.inter.n} interior`);
check(shipped.t.perim.boards === shipped.t.perim.n && shipped.t.inter.boards === shipped.t.inter.n,
  'C2 EVERY closed connector is boarded, both kinds, all seeds',
  `${shipped.t.perim.boards}/${shipped.t.perim.n} perimeter, ${shipped.t.inter.boards}/${shipped.t.inter.n} interior`);
check(shipped.t.perim.none === 0 && shipped.t.inter.none === 0,
  'C3 no closed connector wears NOTHING', `${shipped.t.perim.none + shipped.t.inter.none} bare`);
check(ctrl.t.perim.none > 0 && ctrl.t.inter.none > 0,
  '[CTRL] C4 the control arm DOES leave doors bare — this file can see the defect it asserts is gone',
  `${fmt(ctrl.t.perim.none / ctrl.t.perim.n * 100, 1)}% perimeter, ${fmt(ctrl.t.inter.none / ctrl.t.inter.n * 100, 1)}% interior`);

// C5 — the property that must SURVIVE: dressing never reads the state.
{
  let same = true; const bad = [];
  for (let s = 0; s < SEEDS; s++) {
    const seed = `s${s}`;
    for (const d of closedConn) {
      const outside = d.b === 'outside';
      const a = dressingRule(connectorDressing(d.id, seed, 'blind', CONNECTOR.EXIT, outside), d.id, seed);
      const b = dressingRule(connectorDressing(d.id, seed, 'blind', CONNECTOR.CHAINED, outside), d.id, seed);
      const c = dressingRule(connectorDressing(d.id, seed, 'blind', CONNECTOR.BREACHABLE, outside), d.id, seed);
      for (const k of ['chain', 'boards', 'mortar', 'variant']) {
        if (a[k] !== b[k] || a[k] !== c[k]) { same = false; bad.push(`${d.id}@${seed}.${k}`); }
      }
    }
  }
  check(same, 'C5 the answer does not move when the STATE is lied about (blindness survives)',
    bad.length ? bad.slice(0, 3).join(',') : `${SEEDS} seeds x ${closedConn.length} connectors x 3 states`);
}

// C6 — variety exists, and does not correlate with anything.
{
  const counts = new Map();
  const byKind = { perim: new Map(), inter: new Map() };
  const byState2 = { chained: new Map(), breachable: new Map(), exit: new Map() };
  for (let s = 0; s < SEEDS; s++) {
    const seed = `s${s}`;
    const { exitId } = chooseExit(seed, siteIds);
    for (const d of closedConn) {
      const outside = d.b === 'outside';
      const state = outside ? (d.id === exitId ? CONNECTOR.EXIT : CONNECTOR.CHAINED) : CONNECTOR.BREACHABLE;
      const v = dressingRule(connectorDressing(d.id, seed, 'blind', state, outside), d.id, seed).variant;
      counts.set(v, (counts.get(v) ?? 0) + 1);
      const m = outside ? byKind.perim : byKind.inter;
      m.set(v, (m.get(v) ?? 0) + 1);
      byState2[state].set(v, (byState2[state].get(v) ?? 0) + 1);
    }
  }
  const vs = [...counts.keys()].sort((a, b) => a - b);
  console.log(`\n  variants in play: ${vs.length} — ${vs.map((v) => `${v}:${fmt(counts.get(v) / (SEEDS * closedConn.length) * 100, 1)}%`).join('  ')}`);
  const share = (m, v) => (m.get(v) ?? 0) / [...m.values()].reduce((a, b) => a + b, 0);
  let maxGap = 0;
  for (const v of vs) maxGap = Math.max(maxGap, Math.abs(share(byKind.perim, v) - share(byKind.inter, v)));
  check(vs.length >= 3, 'C6 variety survived — three or more distinct boarding treatments', `${vs.length}`);
  check(maxGap < 0.06, 'C7 variant mix on the perimeter matches the interior', `worst gap ${fmt(maxGap * 100, 1)} pp`);
  let maxGapS = 0;
  for (const v of vs) maxGapS = Math.max(maxGapS, Math.abs(share(byState2.chained, v) - share(byState2.breachable, v)));
  check(maxGapS < 0.06, 'C8 variant mix on CHAINED matches BREACHABLE', `worst gap ${fmt(maxGapS * 100, 1)} pp`);
  let exitGap = 0;
  for (const v of vs) exitGap = Math.max(exitGap, Math.abs(share(byState2.exit, v) - share(byState2.chained, v)));
  check(exitGap < 0.12, 'C9 the LIVE exit\'s variant mix matches the chained pool', `worst gap ${fmt(exitGap * 100, 1)} pp (n=${SEEDS})`);
}

console.log('\n=== D. ONE SEED, EVERY CLOSED DOOR (seed=s4) ===');
{
  const seed = 's4';
  const { exitId } = chooseExit(seed, siteIds);
  for (const d of closedConn) {
    const outside = d.b === 'outside';
    const state = outside ? (d.id === exitId ? CONNECTOR.EXIT : CONNECTOR.CHAINED) : CONNECTOR.BREACHABLE;
    const raw = connectorDressing(d.id, seed, 'blind', state, outside);
    const dr = dressingRule(raw, d.id, seed);
    console.log(`${d.id.padEnd(22)} ${state.padEnd(11)} ${outside ? 'PERIMETER' : 'interior '}`
      + `  chain=${dr.chain ? 'Y' : '.'} boards=${dr.boards ? 'Y' : '.'} mortar=${dr.mortar ? 'Y' : '.'} variant=${dr.variant}`
      + `   [CTRL raw: chain=${raw.chain ? 'Y' : '.'} boards=${raw.boards ? 'Y' : '.'} mortar=${raw.mortar ? 'Y' : '.'}]`);
  }
}

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
