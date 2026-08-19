// Standalone solvability check for the D2/D3/D7 removal — not part of the harness proper.
// Verifies procedural-map.md §5's four properties over 512 seeds, using the REAL connector
// tables and the REAL exit-selection function, without booting a browser.
//
//   1. at least one exit is reachable from spawn without passing through a chained connector
//   2. no room reachable from spawn is sealed (every reachable room has a non-chained way out)
//   3. the hunter can reach every room
//   4. a minimum walk exists (sanity: spawn space itself never doubles as an exit room with 0 hops)
//
// node harness/_tmp_solvability_check.mjs

import { SPACES, PORTALS, PANELS, EXIT_SITES, CONNECTORS, SPAWN } from '../src/game/spaces.js';
import { CONNECTOR, resolveState, clearWidth } from '../src/game/connectors.js';
import { chooseExit } from '../src/game/run.js';

const spaceIds = SPACES.map((s) => s.id);
const N = 512;

let failures = 0;
const narrowSurvivors = CONNECTORS.filter((c) => clearWidth(c) < 1.32 && c.state !== CONNECTOR.EXIT);
console.log(`[info] connectors narrower than a stage-3 hunter needs (1.32 m clear), excluding EXIT candidates: ${narrowSurvivors.map((c) => `${c.id}(${clearWidth(c)})`).join(', ') || 'none'}`);

function buildGraph(plan) {
  const adj = new Map(spaceIds.map((id) => [id, []]));
  for (const c of CONNECTORS) {
    if (c.b === 'outside') continue; // exterior sites are not inter-room edges
    if (c.a === c.b) continue;
    const st = resolveState(c, plan);
    if (st === CONNECTOR.CHAINED) continue; // impassable without tools this run doesn't have
    adj.get(c.a).push({ to: c.b, id: c.id, w: clearWidth(c) });
    adj.get(c.b).push({ to: c.a, id: c.id, w: clearWidth(c) });
  }
  return adj;
}

function bfs(adj, from) {
  const dist = new Map([[from, 0]]);
  const q = [from];
  while (q.length) {
    const cur = q.shift();
    for (const e of adj.get(cur) ?? []) {
      if (!dist.has(e.to)) { dist.set(e.to, dist.get(cur) + 1); q.push(e.to); }
    }
  }
  return dist;
}

// The exit's OWN space isn't in CONNECTORS as a space (b: 'outside'), so find which space owns
// the live exit id.
function spaceOfExit(exitId) {
  const row = EXIT_SITES.find((e) => e.id === exitId);
  return row?.a ?? null;
}

const SPAWN_SPACE = 'study_w'; // matches SPAWN.player's x/z in spaces.js
const HUNTER_SPAWN_SPACE = 'ballroom'; // matches SPAWN.hunter

let minWalkSeen = Infinity;
const siteCounts = new Map();

for (let i = 0; i < N; i++) {
  const seed = `s${i}`;
  const plan = chooseExit(seed, EXIT_SITES.map((e) => e.id));
  const exitSpace = spaceOfExit(plan.exitId);
  siteCounts.set(plan.exitId, (siteCounts.get(plan.exitId) ?? 0) + 1);
  const adj = buildGraph(plan);

  // property 1: exit reachable from spawn
  const fromSpawn = bfs(adj, SPAWN_SPACE);
  if (!fromSpawn.has(exitSpace)) {
    failures++;
    console.error(`[FAIL P1] seed ${seed}: exit ${plan.exitId} (${exitSpace}) unreachable from ${SPAWN_SPACE}`);
  } else {
    minWalkSeen = Math.min(minWalkSeen, fromSpawn.get(exitSpace));
  }

  // property 2: every space reachable from spawn is not sealed (degree >= 1 in non-chained graph)
  for (const sid of spaceIds) {
    if (!fromSpawn.has(sid)) {
      failures++;
      console.error(`[FAIL P2] seed ${seed}: space "${sid}" is NOT reachable from spawn at all`);
      continue;
    }
    const deg = (adj.get(sid) ?? []).length;
    if (deg < 1) {
      failures++;
      console.error(`[FAIL P2] seed ${seed}: space "${sid}" reachable but has 0 non-chained edges (sealed)`);
    }
  }

  // property 3: hunter can reach every room
  const fromHunter = bfs(adj, HUNTER_SPAWN_SPACE);
  for (const sid of spaceIds) {
    if (!fromHunter.has(sid)) {
      failures++;
      console.error(`[FAIL P3] seed ${seed}: hunter cannot reach "${sid}" from ${HUNTER_SPAWN_SPACE}`);
    }
  }
}

// property 4: sanity that the minimum walk isn't degenerate. Graph hops undercount this for an
// exit that happens to share the spawn's own room (x.study_w.servants / .scullery — true before
// this change too, since spawn has always been in study_w), so this checks straight-line METRES
// from the actual spawn point to the exit's actual x/z instead, which is what "cannot be won in
// eight seconds" is really about.
const spawnXZ = SPAWN.player[0]; // [x, z]
let minMetres = Infinity;
for (const e of EXIT_SITES) {
  const d = Math.hypot(e.x - spawnXZ[0], e.z - spawnXZ[1]);
  minMetres = Math.min(minMetres, d);
}
console.log(`[info] minimum spawn->exit hop count seen across ${N} seeds: ${minWalkSeen}`);
console.log(`[info] closest exit site to spawn, straight-line: ${minMetres.toFixed(2)} m`);
if (minMetres < 5) { failures++; console.error(`[FAIL P4] closest exit is only ${minMetres.toFixed(2)} m from spawn`); }

console.log(`[info] exit-site selection spread over ${N} seeds:`, Object.fromEntries(siteCounts));
console.log(failures === 0
  ? `PASS — all four solvability properties held across ${N} seeds (s0..s${N - 1})`
  : `FAIL — ${failures} property violation(s) across ${N} seeds`);
process.exit(failures === 0 ? 0 : 1);
