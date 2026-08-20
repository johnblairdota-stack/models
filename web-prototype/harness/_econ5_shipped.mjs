#!/usr/bin/env node
/**
 * _econ5_shipped — throwaway. (A) independent verification of the target/hunter parity collision.
 * (B) the episode economy under session.js's ACTUAL expedition resolution (takes unreachable),
 * side by side with the same economy once the collision is repaired.
 */
import { ROOMS } from '../src/party/coverage.js';
import { WIN_TARGETS, OUTCOME } from '../src/party/win.js';
import { EPISODE_CAP } from '../src/party/phases.js';
import { COMPOSITION } from '../src/party/cast.js';
import { dealCast } from '../src/party/cast.js';

// session.js:63 verbatim
function hash(...parts) {
  let h = 0x811c9dc5 >>> 0;
  const s = parts.join(':');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
console.log('PROBE _econ5_shipped\n=== A. session.js:299 vs :306 — can the expedition room ever be the Hunter\'s room? ===');
let n = 0, coll = 0, parityAlwaysOpposite = true;
for (let ws = 1; ws <= 6000; ws++) for (let ep = 1; ep <= 5; ep++) {
  const ti = hash(ws, 'target', ep) % ROOMS.length;
  const hi = hash(ws, 'hunter', ep) % ROOMS.length;
  n++; if (ti === hi) coll++;
  if ((ti & 1) === (hi & 1)) parityAlwaysOpposite = false;
}
console.log(`  ${n.toLocaleString()} (worldSeed, episode) draws · collisions: ${coll} (${(coll/n*100).toFixed(3)}%) · ideal for 6 rooms: 16.7%`);
console.log(`  the two indices ALWAYS have opposite parity: ${parityAlwaysOpposite}`);
// bit-above-low fix, measured
let c2 = 0;
for (let ws = 1; ws <= 6000; ws++) for (let ep = 1; ep <= 5; ep++)
  if (((hash(ws,'target',ep) >>> 8) % 6) === ((hash(ws,'hunter',ep) >>> 8) % 6)) c2++;
console.log(`  with (h >>> 8) % 6 on both: ${(c2/n*100).toFixed(2)}% collisions\n`);

/**
 * The shipped session.js expedition, transcribed from session.js:412-425.
 *   hunterHere = (hunterRoom === expedition.room)   <- provably false, see A
 *   move !== GO      -> 'held'   (no camera)
 *   hunterHere       -> 'taken'
 *   else             -> 'lit'    (camera)
 */
function shippedExpedition({ collisionsPossible, worldSeed, ep, runnerGoes }) {
  const ti = collisionsPossible ? (hash(worldSeed,'target',ep) >>> 8) % 6 : hash(worldSeed,'target',ep) % 6;
  const hi = collisionsPossible ? (hash(worldSeed,'hunter',ep) >>> 8) % 6 : hash(worldSeed,'hunter',ep) % 6;
  const hunterHere = ti === hi;
  if (!runnerGoes) return 'held';
  return hunterHere ? 'taken' : 'lit';
}

/**
 * A whole match on session.js's resolution. Executions are modelled at the measured rate from the
 * room.js probes (0.70 executions per match, 25% of them hitting Production) so the two columns
 * differ ONLY in whether the Hunter can occupy the expedition room.
 */
function match({ count, seed, collisionsPossible, goRate }) {
  const deal = dealCast({ count, castSeed: seed * 977 + count });
  const evil = new Set(deal.evil);
  const alive = new Set(deal.seats.map((s) => s.id));
  let lit = 0, fed = 0, ep = 1, execs = 0, execEvil = 0;
  const rnd = (salt) => (hash(seed, salt) >>> 0) / 4294967296;
  const livingOf = (a) => deal.seats.filter((s) => alive.has(s.id) && (a === 'evil') === evil.has(s.id)).length;
  for (; ep <= EPISODE_CAP; ep++) {
    const goes = rnd(`go${ep}`) < goRate;
    const out = shippedExpedition({ collisionsPossible, worldSeed: seed + 1, ep, runnerGoes: goes });
    if (out === 'lit') { lit++; if (lit >= WIN_TARGETS[count].cameraTarget) return { win: 'good', rule: 'W2', ep, lit, execs, execEvil }; }
    if (out === 'taken') {
      // the runner is fed to the Hunter; alignment is whoever holds the chair, modelled by cast ratio
      const victim = deal.seats.filter((s) => alive.has(s.id))[Math.floor(rnd(`v${ep}`) * alive.size)];
      alive.delete(victim.id);
      if (!evil.has(victim.id)) fed++;
      if (livingOf('evil') === 0) return { win: 'good', rule: 'W1', ep, lit, execs, execEvil };
      if (fed >= WIN_TARGETS[count].feedTarget) return { win: 'evil', rule: 'W3', ep, lit, execs, execEvil };
      if (livingOf('evil') >= livingOf('good')) return { win: 'evil', rule: 'W4', ep, lit, execs, execEvil };
    }
    if (ep > 1 && rnd(`ex${ep}`) < 0.30) {          // measured execution rate per voting episode
      const pool = deal.seats.filter((s) => alive.has(s.id));
      const victim = pool[Math.floor(rnd(`ev${ep}`) * pool.length)];
      alive.delete(victim.id); execs++; if (evil.has(victim.id)) execEvil++;
      if (livingOf('evil') === 0) return { win: 'good', rule: 'W1', ep, lit, execs, execEvil };
      if (livingOf('evil') >= livingOf('good')) return { win: 'evil', rule: 'W4', ep, lit, execs, execEvil };
    }
  }
  return { win: 'evil', rule: 'W5/CAP', ep: EPISODE_CAP, lit, execs, execEvil };
}

const SEEDS = 4000;
for (const goRate of [1.0, 0.85]) {
  console.log(`=== B. session.js economy · runner presses GO ${(goRate*100).toFixed(0)}% of the time · ${SEEDS} seeds/count ===`);
  console.log('  count │ SHIPPED (hunter can never be in the room)      │ REPAIRED (h>>>8, ~16.5% collisions)');
  console.log('        │ good win │ median ep │ ending mix             │ good win │ median ep │ ending mix');
  for (const c of [4,5,6,7,8]) {
    const cols = [false, true].map((cp) => {
      const rs = Array.from({length: SEEDS}, (_, s) => match({ count: c, seed: s, collisionsPossible: cp, goRate }));
      const g = rs.filter((r) => r.win === 'good').length / rs.length;
      const eps = rs.map((r) => r.ep).sort((a,b)=>a-b);
      const mix = {}; for (const r of rs) mix[r.rule] = (mix[r.rule]||0)+1;
      return { g, med: eps[Math.floor(eps.length/2)], mix: Object.entries(mix).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ${(v/rs.length*100).toFixed(0)}%`).join(' ') };
    });
    console.log(`  ${String(c).padStart(5)} │ ${(cols[0].g*100).toFixed(1).padStart(7)}% │ ${String(cols[0].med).padStart(9)} │ ${cols[0].mix.padEnd(22)} │ ${(cols[1].g*100).toFixed(1).padStart(7)}% │ ${String(cols[1].med).padStart(9)} │ ${cols[1].mix}`);
  }
  console.log('');
}
console.log('=== C. under the shipped resolution, which win rules are REACHABLE AT ALL? ===');
console.log('  W1 executed to zero  : reachable (executions only)');
console.log('  W2 cameras           : reachable, and deterministic — every GO lights a camera');
console.log('  W3 fed to the Hunter : UNREACHABLE — player.taken never fires from the expedition path');
console.log('  W4 parity            : reachable, but only by the table executing its OWN players');
console.log('  W5 cap               : reachable only if the runner declines to GO');
