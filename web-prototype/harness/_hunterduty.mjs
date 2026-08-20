#!/usr/bin/env node
/**
 * 🕰️ **_hunterduty — THE HUNTER'S STATIONARY DUTY CYCLE `s`, MEASURED.**
 *
 *   node harness/_hunterduty.mjs                 the table
 *   node harness/_hunterduty.mjs --trace 3       plus a per-second state trace for seed 3
 *
 * THROWAWAY PROBE. Nothing tracked is modified.
 *
 * WHAT IS BEING ASKED: over a 90 s expedition, what fraction of the seconds is the real
 * `HunterAI` making NO MOVEMENT NOISE?
 *
 * ⚠️ "EFFECTIVELY STATIONARY" IS THE GAME'S OWN LINE, NOT ONE INVENTED HERE.
 * `darkrun.js` SILENT_SPEED = `HUNTER_SENSE.hearFloor * MOVE.run` = 0.156 m/s is the speed below
 * which a body in this game makes no audible movement noise (`player.js:638`, `noiseFor`). That is
 * the primary threshold. Two others are reported as a sensitivity band:
 *   · 0.06 m/s — `hunter-ai.js:1358`'s own "is it moving" test, the strictest reading
 *   · 0.30 m/s — a generous reading, ~1/17 of the runner's run speed
 *
 * ⚠️ WHAT IS REAL HERE AND WHAT IS NOT, STATED FIRST.
 *   REAL: the shipped `buildTestRoom()` mansion (six spaces, 46 panels, the real patrol route,
 *   the real portal BFS and collide), the shipped `HunterAI` verbatim, the shipped `NoiseBus`, the
 *   shipped `HUNTER_SENSE`/`HUNTER_SPEED` numbers, and the shipped noise law `min(1, speed/RUN)`.
 *   NOT REAL: the RUNNER. `Player` needs an avatar, a weapon system and a render loop, so the
 *   runner here is a kinematic body driven by `expedition.js`'s OWN solo director logic — route
 *   with `room.pathPortals`, aim 1.5 m past the doorway, and the same distance-to-terminal detent
 *   ladder (`expedition.js:229-279`) — integrated through the real `room.collide`. It is the
 *   shipped scripted runner's behaviour without the shipped body.
 *
 * ⚠️ ARM A vs ARM B. `expedition.js` ends the segment on contact < 1.35 m, on reaching the
 * terminal, or at the clock. A duty cycle over "a 90 second expedition" needs 90 seconds, so
 * ARM A gives the runner a NEW wing each time it lights a terminal and makes it intangible, and
 * measures the full 90 s. ARM B is the shipped truncation, reported so the reader can see how
 * long a shipped segment actually lasts.
 */

const HERE = new URL('.', import.meta.url);
const SRC = new URL('../src/', HERE);
const s_ = (p) => new URL(p, SRC).href;

globalThis.location = { search: '' };
// The only DOM the hunter rig touches: `robot.js brandDecal` -> TextureLoader -> ImageLoader.
globalThis.document = globalThis.document ?? {
  createElementNS: () => ({ set src(_v) {}, get src() { return ''; }, addEventListener() {}, removeEventListener() {}, style: {} }),
  createElement: () => ({ style: {}, getContext: () => null }),
};

const stubRenderer = () => ({
  getRenderTarget: () => null, setRenderTarget: () => {}, render: () => {},
  readRenderTargetPixels: (rt, x, y, w, h, buf) => { buf[0] = 200; buf[1] = 200; buf[2] = 200; if (buf.length > 3) buf[3] = 255; },
});

const realWarn = console.warn; console.warn = () => {};
const { initBaker } = await import(s_('materials/baker.js'));
initBaker(stubRenderer());
const THREE = await import('three');
const RM = await import(s_('game/room.js'));
const { HunterAI } = await import(s_('game/hunter-ai.js'));
const { NoiseBus } = await import(s_('game/noise.js'));
const { MOVE, PASS_H, STEP_H, HUNTER_SPEED, HUNTER_SENSE } = await import(s_('game/rules.js'));
const { DETENT, SILENT_SPEED } = await import(s_('party/darkrun.js'));
const { TERMINAL_AT, TERMINAL_REACH, EXPEDITION_SECONDS } = { // expedition.js imports THREE views; mirror its three constants
  TERMINAL_AT: { ballroom: 'ballroom.centre', gallery: 'gallery.east', study_w: 'study_w.north',
    study_e: 'study_e.north', service: 'service.mid', chapel: 'chapel.centre' },
  TERMINAL_REACH: 2.2, EXPEDITION_SECONDS: 90,
};
const room = await RM.buildTestRoom({ work: (p) => p }, {});
console.warn = realWarn;

const DT = 1 / 60;
const WINGS = ['gallery', 'ballroom', 'study_e', 'chapel', 'service', 'study_w'];
const THRESH = { strict: 0.06, silent: SILENT_SPEED, loose: 0.30 };

const lcg = (seed) => { let x = (seed * 2654435761) >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };

/** A body the Hunter's `_sense` and `_attack` accept. No limbs come off in ARM A. */
function makeRunner(pos) {
  const root = new THREE.Object3D();
  root.position.copy(pos);
  const rig = { caps: { downed: false }, occupant: () => 'empty', detach: () => null };
  return { root, rig, height: 1.7, radius: 0.34, noise: 0, speed: 0 };
}

/**
 * One expedition.
 *
 * ⚠️ THE RUNNER FLEES, AND THAT IS THE CORRECTION THIS PROBE NEEDED. The first version used
 * `expedition.js`'s solo director verbatim — which does not look at the Hunter at all — and an
 * intangible runner therefore stood in its arms while the Hunter sat in ATTACK for sixty seconds.
 * That reported s = 0.76 and every second of it was an artefact of the fixture, not of the game.
 * `harness/scenarios/flee-survival.mjs` establishes that sprinting away is the answer the game is
 * built around, so a competent runner takes it: when the Hunter is inside `PANIC` metres and past
 * `alertAt`, the runner re-targets the terminal furthest from the Hunter and holds RUN for
 * `PANIC_HOLD` seconds. Everything else is `expedition.js:229-279` unchanged.
 */
const PANIC = 12, PANIC_HOLD = 6;

function expedition({ seed, stage, flee = true, capDetent = 3 }) {
  const rng = lcg(seed);
  const noise = new NoiseBus();
  const hunter = new HunterAI({
    room, scene: null, rng, position: room.spawn.hunter.clone(), noise, bangPolicy: 'auto', stage,
  });
  // `_growStep` is what normally sets the radius for a stage; a hunter CONSTRUCTED at a stage
  // keeps the stage-1 0.42. Set it here or a stage-3 body routes through gaps it cannot fit.
  hunter.radius = 0.30 + stage * 0.12;

  // Seeded wing order, so eight seeds are eight different routes through the house and not
  // eight replays of one.
  const order = WINGS.slice();
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  let wingIdx = 0;
  const runner = makeRunner(room.spawn.player[0]);
  let terminal = room.anchor(TERMINAL_AT[order[0]]).clone();
  hunter.setTargets([runner]);

  const _p = new THREE.Vector3();
  const acc = { time: 0, byThresh: { strict: 0, silent: 0, loose: 0 }, byState: {}, statTime: {},
    end: null, lit: 0, panicSecs: 0, longestQuiet: 0, quietRuns: [] };
  const perSec = [];
  let secBucket = { still: 0, n: 0, states: new Set() };
  let panicUntil = -1, quiet = 0, t = 0;

  for (let i = 0; i * DT < EXPEDITION_SECONDS; i++) {
    t = i * DT;

    const dHunt = Math.hypot(runner.root.position.x - hunter.root.position.x, runner.root.position.z - hunter.root.position.z);
    const scared = flee && dHunt < PANIC && hunter.awareness >= HUNTER_SENSE.alertAt;
    if (scared && t > panicUntil) {
      panicUntil = t + PANIC_HOLD;
      // Go somewhere else, fast: the terminal furthest from the thing that has noticed you.
      let best = null, bestD = -1;
      for (const w of WINGS) {
        const a = room.anchor(TERMINAL_AT[w]);
        const d = Math.hypot(a.x - hunter.root.position.x, a.z - hunter.root.position.z);
        if (d > bestD) { bestD = d; best = w; }
      }
      wingIdx = WINGS.indexOf(best);
      terminal = room.anchor(TERMINAL_AT[best]).clone();
      order[wingIdx % order.length] = best;
    }
    const panicking = t <= panicUntil;
    if (panicking) acc.panicSecs += DT;

    // ---- the runner, otherwise `expedition.js`'s solo director verbatim
    const hops = room.pathPortals(runner.root.position, terminal, 0.6, 1.9);
    const h0 = hops[0];
    let leg;
    const c = h0 && h0.centre;
    if (c && Number.isFinite(c.x) && Number.isFinite(c.z)) {
      const n = h0.normal || { x: 0, z: 1 };
      const side = Math.sign((runner.root.position.x - c.x) * n.x + (runner.root.position.z - c.z) * n.z) || 1;
      leg = { x: c.x - n.x * side * 1.5, z: c.z - n.z * side * 1.5 };
    } else leg = { x: terminal.x, z: terminal.z };

    const dTerm = Math.hypot(terminal.x - runner.root.position.x, terminal.z - runner.root.position.z);
    const detent = Math.min(capDetent, panicking ? 3 : dTerm > 9 ? 3 : dTerm > 3.5 ? 2 : dTerm > TERMINAL_REACH ? 1 : 0);
    const want = DETENT[detent].speed;
    const dx = leg.x - runner.root.position.x, dz = leg.z - runner.root.position.z;
    const dl = Math.hypot(dx, dz) || 1;
    const before = runner.root.position.clone();
    _p.set(runner.root.position.x + (dx / dl) * want * DT, 0, runner.root.position.z + (dz / dl) * want * DT);
    runner.root.position.copy(room.collide(_p, runner.radius, PASS_H.robot, STEP_H.robot));
    runner.root.position.y = room.floorY;
    runner.speed = before.distanceTo(runner.root.position) / DT;
    runner.noise = Math.min(1, runner.speed / MOVE.run);

    if (runner.noise > 0) noise.emit(runner.root.position, runner.noise, 'move');
    noise.update(DT);
    hunter.update(DT, t);

    // ---- the measurement (BEFORE the end tests, so the last frame counts)
    const sp = hunter.speed;
    for (const k of Object.keys(THRESH)) if (sp < THRESH[k]) acc.byThresh[k] += DT;
    acc.statTime[hunter.state] = (acc.statTime[hunter.state] ?? 0) + DT;
    if (sp < THRESH.silent) { acc.byState[hunter.state] = (acc.byState[hunter.state] ?? 0) + DT; quiet += DT; }
    else { if (quiet > 0.4) acc.quietRuns.push(quiet); acc.longestQuiet = Math.max(acc.longestQuiet, quiet); quiet = 0; }
    acc.time += DT;

    secBucket.n++; if (sp < THRESH.silent) secBucket.still++; secBucket.states.add(hunter.state);
    if (secBucket.n >= 60) { perSec.push({ t: Math.round(t), f: secBucket.still / secBucket.n, st: [...secBucket.states].join('/') }); secBucket = { still: 0, n: 0, states: new Set() }; }

    // ---- the three ways `expedition.js` ends ninety seconds
    const contact = Math.hypot(runner.root.position.x - hunter.root.position.x, runner.root.position.z - hunter.root.position.z);
    if (contact < 1.35) { acc.end = { at: t, why: 'taken' }; break; }
    if (dTerm < TERMINAL_REACH) {
      acc.lit++;
      // The segment would end here in the shipped game; ARM A hands the runner the next wing so
      // that a NINETY SECOND window is ninety seconds. `firstLit` records the shipped truncation.
      if (acc.firstLit == null) acc.firstLit = t;
      wingIdx = (wingIdx + 1) % order.length;
      terminal = room.anchor(TERMINAL_AT[order[wingIdx]]).clone();
    }
  }
  acc.longestQuiet = Math.max(acc.longestQuiet, quiet);
  if (!acc.end) acc.end = { at: acc.time, why: 'clock' };

  hunter.dispose();
  return { seed, stage, order, acc, perSec };
}

// ------------------------------------------------------------------ run it
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const rows = [];
for (const stage of [1, 2, 3]) for (const seed of SEEDS) rows.push(expedition({ seed, stage }));

const q = (a, p) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

console.log('\n=== ARM A · the full 90 s window · s = fraction of seconds with hunter speed < SILENT_SPEED (%.3f m/s) ==='.replace('%.3f', SILENT_SPEED.toFixed(3)));
console.log('\n stage  seed  wing        s(silent)  s(strict .06)  s(loose .30)   ended            longest-still  states while still');
for (const r of rows) {
  const s = r.acc.byThresh.silent / r.acc.time;
  const st = Object.entries(r.acc.byState).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / r.acc.time * 100).toFixed(0)}%`).join(' ');
  const seg = `${r.acc.end.why}@${r.acc.end.at.toFixed(1)}s`;
  console.log(`   ${r.stage}     ${String(r.seed).padStart(2)}  ${r.order[0].padEnd(9)}  ${s.toFixed(3)}      ${(r.acc.byThresh.strict / r.acc.time).toFixed(3)}         ${(r.acc.byThresh.loose / r.acc.time).toFixed(3)}      ${seg.padEnd(16)} ${(r.acc.longestQuiet).toFixed(1)}s  ${st}`);
}

console.log('\n=== the distribution of s (silent threshold) ===');
for (const stage of [1, 2, 3]) {
  const v = rows.filter((r) => r.stage === stage).map((r) => r.acc.byThresh.silent / r.acc.time);
  console.log(`  stage ${stage}:  min ${Math.min(...v).toFixed(3)}  p25 ${q(v, 0.25).toFixed(3)}  median ${q(v, 0.5).toFixed(3)}  p75 ${q(v, 0.75).toFixed(3)}  max ${Math.max(...v).toFixed(3)}  mean ${mean(v).toFixed(3)}`);
}
{
  const v = rows.map((r) => r.acc.byThresh.silent / r.acc.time);
  console.log(`  ALL:      min ${Math.min(...v).toFixed(3)}  p25 ${q(v, 0.25).toFixed(3)}  median ${q(v, 0.5).toFixed(3)}  p75 ${q(v, 0.75).toFixed(3)}  max ${Math.max(...v).toFixed(3)}  mean ${mean(v).toFixed(3)}  n=${v.length}`);
  for (const k of ['strict', 'loose']) {
    const w = rows.map((r) => r.acc.byThresh[k] / r.acc.time);
    console.log(`  ALL (${k}): min ${Math.min(...w).toFixed(3)}  median ${q(w, 0.5).toFixed(3)}  max ${Math.max(...w).toFixed(3)}  mean ${mean(w).toFixed(3)}`);
  }
}

console.log('\n=== where the stationary seconds come from (all runs pooled, silent threshold) ===');
{
  const still = {}, tot = {};
  let T = 0;
  for (const r of rows) { T += r.acc.time; for (const k of Object.keys(r.acc.statTime)) { tot[k] = (tot[k] ?? 0) + r.acc.statTime[k]; still[k] = (still[k] ?? 0) + (r.acc.byState[k] ?? 0); } }
  console.log('  state      time in state   of which still   still-seconds as % of ALL expedition time');
  for (const [k, v] of Object.entries(tot).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(9)}  ${(v / T * 100).toFixed(1).padStart(6)}%         ${((still[k] ?? 0) / v * 100).toFixed(1).padStart(6)}%          ${((still[k] ?? 0) / T * 100).toFixed(2).padStart(6)}%`);
  }
}

// ------------------------------------------------------------------ the control arms
console.log('\n=== CONTROL ARMS · same measurement, different runner ===');
const arms = {
  'A  competent (flees, RUN)   ': { flee: true,  capDetent: 3 },
  'B  shipped solo director    ': { flee: false, capDetent: 3 },
  'C  cautious (never above WALK)': { flee: true, capDetent: 2 },
};
for (const [name, o] of Object.entries(arms)) {
  const rr = [];
  for (const stage of [1, 2, 3]) for (const seed of SEEDS) rr.push(expedition({ seed, stage, ...o }));
  const v = rr.map((r) => r.acc.byThresh.silent / r.acc.time);
  const ends = rr.filter((r) => r.acc.end.why === 'taken').length;
  const lens = rr.map((r) => r.acc.end.at);
  console.log(`  ${name}  s: min ${Math.min(...v).toFixed(3)}  median ${q(v, 0.5).toFixed(3)}  mean ${mean(v).toFixed(3)}  max ${Math.max(...v).toFixed(3)}   taken ${ends}/${rr.length}  median segment ${q(lens, 0.5).toFixed(1)}s`);
}

const trace = process.argv.indexOf('--trace');
if (trace > 0) {
  const want = +process.argv[trace + 1];
  const r = rows.find((x) => x.seed === want && x.stage === 1);
  console.log(`\n=== per-second trace · stage 1 seed ${want} (f = fraction of that second stationary) ===`);
  console.log(r.perSec.map((p) => `${String(p.t).padStart(2)}s ${p.f.toFixed(2)} ${p.st}`).join('\n'));
}
