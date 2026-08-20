#!/usr/bin/env node
/**
 * 🩸 **_huntertake — HOW OFTEN DOES A REAL `HunterAI` IN A REAL HOUSE GET ITS HANDS ON A
 * COMPETENT RUNNER IN NINETY SECONDS?**
 *
 * The number `session.js`'s room lottery (`:299` / `:306`) is a crude stand-in for. Measured on
 * the ENGINE path only: the shipped `buildTestRoom()` mansion, the shipped `HunterAI`, the
 * shipped `NoiseBus`, and a runner with four real sockets whose gait degrades as they come off
 * (`rules.js` `gaitFor`/`speedScaleFor`), so losing legs actually costs speed.
 *
 * THREE THINGS ARE COUNTED, and they are three different events that the codebase currently
 * conflates:
 *   · **STRIKE**  — `_attack` landed and `onKill` fired. This is the engine's kill verb.
 *   · **DOWN**    — all four sockets gone. `hunter-ai.js:1109` then early-outs and the body is
 *                   invulnerable, which is what `party/taken.js` was written to fix.
 *   · **1.35 m**  — `views/expedition.js:362`'s proximity test, the ONLY thing that can set
 *                   `outcome='taken'` and therefore the only thing `session.js` can act on.
 *
 * ARMS: `apart` starts the Hunter at `room.spawn.hunter` (the shipped placement) and `together`
 * starts it in the runner's own room — the case `session.js`'s parity bug currently forbids.
 */
const SRC = new URL('../src/', new URL('.', import.meta.url));
const s_ = (p) => new URL(p, SRC).href;
globalThis.location = { search: '' };
globalThis.document = { createElementNS: () => ({ set src(_v) {}, addEventListener() {}, removeEventListener() {}, style: {} }), createElement: () => ({ style: {}, getContext: () => null }) };
const realWarn = console.warn; console.warn = () => {};
const { initBaker } = await import(s_('materials/baker.js'));
initBaker({ getRenderTarget: () => null, setRenderTarget: () => {}, render: () => {}, readRenderTargetPixels: (a,b,c,d,e,buf) => { buf[0]=200;buf[1]=200;buf[2]=200; if(buf.length>3) buf[3]=255; } });
const THREE = await import('three');
const RM = await import(s_('game/room.js'));
const { HunterAI } = await import(s_('game/hunter-ai.js'));
const { NoiseBus } = await import(s_('game/noise.js'));
const { MOVE, PASS_H, STEP_H, HUNTER_SENSE, gaitFor, speedScaleFor } = await import(s_('game/rules.js'));
const { DETENT } = await import(s_('party/darkrun.js'));
const room = await RM.buildTestRoom({ work: (p) => p }, {});
console.warn = realWarn;

const DT = 1 / 60;
const WINGS = ['gallery', 'ballroom', 'study_e', 'chapel', 'service', 'study_w'];
const TERMINAL_AT = { ballroom: 'ballroom.centre', gallery: 'gallery.east', study_w: 'study_w.north', study_e: 'study_e.north', service: 'service.mid', chapel: 'chapel.centre' };
const lcg = (seed) => { let x = (seed * 2654435761) >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };

function run({ seed, stage, flee, together }) {
  const rng = lcg(seed);
  const noise = new NoiseBus();
  const root = new THREE.Object3D(); root.position.copy(room.spawn.player[0]);
  // four real sockets, and the gait degrades as they go — `rules.js` gaitFor/speedScaleFor
  const sockets = new Set(['shoulderL', 'shoulderR', 'hipL', 'hipR']);
  const runner = { root, height: 1.7, radius: 0.34, noise: 0,
    rig: { caps: { get downed() { return sockets.size === 0; } },
      occupant: (s) => (sockets.has(s) ? 'limb' : 'empty'),
      detach: (s) => { sockets.delete(s); return null; } } };
  const scale = () => speedScaleFor(gaitFor({
    legs: (sockets.has('hipL') ? 1 : 0) + (sockets.has('hipR') ? 1 : 0),
    arms: (sockets.has('shoulderL') ? 1 : 0) + (sockets.has('shoulderR') ? 1 : 0), skates: false }));

  const start = together
    ? (() => { const a = room.anchor(TERMINAL_AT[WINGS[seed % 6]]) ?? room.spawn.hunter; return new THREE.Vector3(a.x, 0, a.z); })()
    : room.spawn.hunter.clone();
  const hunter = new HunterAI({ room, scene: null, rng, position: start, noise, bangPolicy: 'auto', stage });
  hunter.radius = 0.30 + stage * 0.12;
  hunter.setTargets([runner]);
  let strikes = 0, firstStrike = null;
  hunter.onKill = () => { strikes++; };

  const order = WINGS.slice();
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  let wingIdx = 0, terminal = room.anchor(TERMINAL_AT[order[0]]).clone();
  let panicUntil = -1, downAt = null, closeAt = null, minC = Infinity, attackSecs = 0, seenSecs = 0;
  const _p = new THREE.Vector3();

  for (let i = 0; i * DT < 90; i++) {
    const t = i * DT;
    const dHunt = Math.hypot(root.position.x - hunter.root.position.x, root.position.z - hunter.root.position.z);
    if (flee && dHunt < 12 && hunter.awareness >= HUNTER_SENSE.alertAt && t > panicUntil) {
      panicUntil = t + 6;
      let best = null, bestD = -1;
      for (const w of WINGS) { const a = room.anchor(TERMINAL_AT[w]); const d = Math.hypot(a.x - hunter.root.position.x, a.z - hunter.root.position.z); if (d > bestD) { bestD = d; best = w; } }
      terminal = room.anchor(TERMINAL_AT[best]).clone();
    }
    const panicking = t <= panicUntil;
    const hops = room.pathPortals(root.position, terminal, 0.6, 1.9);
    const h0 = hops[0]; const c = h0 && h0.centre;
    let leg;
    if (c && Number.isFinite(c.x)) { const n = h0.normal || { x: 0, z: 1 }; const side = Math.sign((root.position.x - c.x) * n.x + (root.position.z - c.z) * n.z) || 1; leg = { x: c.x - n.x * side * 1.5, z: c.z - n.z * side * 1.5 }; }
    else leg = { x: terminal.x, z: terminal.z };
    const dTerm = Math.hypot(terminal.x - root.position.x, terminal.z - root.position.z);
    const want = DETENT[panicking ? 3 : dTerm > 9 ? 3 : dTerm > 3.5 ? 2 : dTerm > 2.2 ? 1 : 0].speed * scale();
    const dx = leg.x - root.position.x, dz = leg.z - root.position.z, dl = Math.hypot(dx, dz) || 1;
    const before = root.position.clone();
    _p.set(root.position.x + (dx / dl) * want * DT, 0, root.position.z + (dz / dl) * want * DT);
    root.position.copy(room.collide(_p, runner.radius, PASS_H.robot, STEP_H.robot));
    root.position.y = room.floorY;
    runner.noise = Math.min(1, (before.distanceTo(root.position) / DT) / MOVE.run);

    if (runner.noise > 0) noise.emit(root.position, runner.noise, 'move');
    noise.update(DT);
    const was = strikes;
    hunter.update(DT, t);
    if (strikes > was && firstStrike == null) firstStrike = t;
    if (downAt == null && sockets.size === 0) downAt = t;
    if (hunter.state === 'ATTACK') attackSecs += DT;
    if (hunter.sawThisFrame) seenSecs += DT;
    const cc = Math.hypot(root.position.x - hunter.root.position.x, root.position.z - hunter.root.position.z);
    if (cc < minC) minC = cc;
    if (closeAt == null && cc < 1.35) closeAt = t;
    if (dTerm < 2.2) { wingIdx = (wingIdx + 1) % order.length; terminal = room.anchor(TERMINAL_AT[order[wingIdx]]).clone(); }
  }
  hunter.dispose();
  return { seed, stage, strikes, firstStrike, downAt, closeAt, minC, attackSecs, seenSecs, endStage: hunter.stage };
}

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const pct = (n, d) => `${(n / d * 100).toFixed(0)}%`;
const q = (a, p) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

console.log('=== take rate over a 90 s expedition · real HunterAI, real mansion, 20 seeds x 3 stages ===\n');
console.log(' arm                       runs  ≥1 STRIKE  all-4 DOWN  reached 1.35 m  median min-dist  median t(first strike)  median ATTACK s  median seen s');
for (const [name, o] of Object.entries({
  'apart + competent runner ': { flee: true,  together: false },
  'apart + shipped director ': { flee: false, together: false },
  'together + competent     ': { flee: true,  together: true },
  'together + shipped       ': { flee: false, together: true },
})) {
  const rr = [];
  for (const stage of [1, 2, 3]) for (const seed of SEEDS) rr.push(run({ seed, stage, ...o }));
  const hit = rr.filter((r) => r.strikes > 0);
  const dn = rr.filter((r) => r.downAt != null);
  const cl = rr.filter((r) => r.closeAt != null);
  console.log(`  ${name}  ${String(rr.length).padStart(4)}   ${pct(hit.length, rr.length).padStart(7)}    ${pct(dn.length, rr.length).padStart(7)}      ${pct(cl.length, rr.length).padStart(8)}       ${q(rr.map((r) => r.minC), 0.5).toFixed(2)} m         ${(hit.length ? q(hit.map((r) => r.firstStrike), 0.5).toFixed(1) + ' s' : '—').padStart(8)}          ${q(rr.map((r) => r.attackSecs), 0.5).toFixed(1)} s          ${q(rr.map((r) => r.seenSecs), 0.5).toFixed(1)} s`);
}

console.log('\n=== the competent-runner arm, broken out by stage (the number the lottery should be tuned to) ===');
for (const stage of [1, 2, 3]) {
  const rr = SEEDS.map((seed) => run({ seed, stage, flee: true, together: true }));
  const hit = rr.filter((r) => r.strikes > 0);
  console.log(`  together, stage ${stage}: ≥1 strike ${pct(hit.length, rr.length)}  ·  mean limbs taken ${mean(rr.map((r) => r.strikes)).toFixed(2)}  ·  all-4 down ${pct(rr.filter((r) => r.downAt != null).length, rr.length)}  ·  reached 1.35 m ${pct(rr.filter((r) => r.closeAt != null).length, rr.length)}`);
}
for (const stage of [1, 2, 3]) {
  const rr = SEEDS.map((seed) => run({ seed, stage, flee: true, together: false }));
  const hit = rr.filter((r) => r.strikes > 0);
  console.log(`  apart,    stage ${stage}: ≥1 strike ${pct(hit.length, rr.length)}  ·  mean limbs taken ${mean(rr.map((r) => r.strikes)).toFixed(2)}  ·  all-4 down ${pct(rr.filter((r) => r.downAt != null).length, rr.length)}  ·  reached 1.35 m ${pct(rr.filter((r) => r.closeAt != null).length, rr.length)}`);
}
