#!/usr/bin/env node
/**
 * 🔪 **engine-take — WHEN THE MANSION IS ATTACHED, THE HUNTER CAN ACTUALLY TAKE THE RUNNER.**
 *
 *   node harness/engine-take.mjs
 *
 * ---------------------------------------------------------------------------------------------
 * THERE ARE TWO PATHS BY WHICH A RUNNER IS TAKEN AND THEY FAILED SEPARATELY
 * ---------------------------------------------------------------------------------------------
 * `hunter-draw` covers the stubbed path: no `role=sim` socket, and `session.js` grades the
 * expedition by comparing the wing to the Hunter's seeded room. That is what every phone in the
 * lounge plays today, and its blocker was a hash-parity collision.
 *
 * This file covers the other one. With a mansion attached, `views/expedition.js` runs the real
 * Hunter and reports an outcome; `session.js` takes that report and applies it through the same
 * `resolveExpedition`. So the seeded room lottery is irrelevant and the question is entirely
 * whether the engine ever says `'taken'`.
 *
 * 🚨 **IT COULD NOT.** The only death test in the mode was `if (contact < 1.35) finish('taken')`
 * — the XZ distance between the runner and the Hunter. `hunter-ai.js:692` enters ATTACK at
 * `seenD < reach * (stage * 0.35 + 0.8)` and `_attack` then damps `vel` hard: the Hunter stops
 * where it is and swings, because `WEAPON_RANGE.hunterSlam` is **2.4 m** and it is built to kill
 * from arm's length. K3 below measures the consequence — the Hunter's weapon outreaches the death
 * test, so a runner who stood still while all four of its limbs came off finished the segment
 * `'held'`.
 *
 * ⚠️ **AND THE OBVIOUS FIX — RAISE 1.35 — IS THE WRONG ONE, WHICH IS WHY K1 IS HERE.**
 * `hunter-ai.js:76-89`: a kill must be *"something the player watched coming and failed to
 * answer"*. Entering reach starts an `ATTACK_WINDUP` of 0.85 s and stepping back out inside it
 * means the swing lands on nothing. A distance test races that windup and wins — measured, it
 * fired 0.32-0.83 s after the first ATTACK in the one staging where it fired at all. So the fix
 * is `hunter.onKill`, which `taken.js:27` has claimed the party room subscribes to since it was
 * written and which nothing had ever subscribed to.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ WHAT THIS GATE CAN AND CANNOT REACH, STATED RATHER THAN SKIPPED
 * ---------------------------------------------------------------------------------------------
 * This box has no GPU, so the BEHAVIOUR is measured against the real `HunterAI` in the real house
 * (`buildTestRoom`), headless, the way `_hunterkill` stages it — that is the part that decides
 * whether a take is producible at all. The WIRING — that `views/expedition.js` is what subscribes
 * — is asserted on the source, because booting that view needs THREE, a renderer and a rAF loop.
 * Two instruments, both real, and neither of them a SKIP.
 */

import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

// ---------------------------------------------------------------- the headless house
const SRC = new URL('../src/', new URL('.', import.meta.url));
const s_ = (p) => new URL(p, SRC).href;
globalThis.location = { search: '' };
globalThis.document = {
  createElementNS: () => ({ set src(_v) {}, addEventListener() {}, removeEventListener() {}, style: {} }),
  createElement: () => ({ style: {}, getContext: () => null }),
};
const realWarn = console.warn, realErr = console.error;
console.warn = () => {}; console.error = () => {};
const { initBaker } = await import(s_('materials/baker.js'));
initBaker({
  getRenderTarget: () => null, setRenderTarget: () => {}, render: () => {},
  readRenderTargetPixels: (a, b, c, d, e, buf) => { buf[0] = 200; buf[1] = 200; buf[2] = 200; if (buf.length > 3) buf[3] = 255; },
});
const THREE = await import('three');
const RM = await import(s_('game/room.js'));
const { HunterAI } = await import(s_('game/hunter-ai.js'));
const { HUNTER_SENSE, MOVE, WEAPON_RANGE, HUNTER_SPEED, HUNTER_GROWTH } = await import(s_('game/rules.js'));
const { Player } = await import(s_('game/player.js'));
const { LimbField } = await import(s_('game/limbs.js'));
const { NoiseBus } = await import(s_('game/noise.js'));
/**
 * K5 drives the SHIPPED refit rather than a copy of it — `views/expedition.js` exports the two
 * functions its own `arm()` calls, for exactly this reason. A gate that reimplemented the fix
 * would prove only that the fix can be written twice.
 */
const EXP = await import(s_('views/expedition.js'));
const room = await RM.buildTestRoom({ work: (p) => p }, {});

/**
 * ⚠️ READ FROM THE SOURCE RATHER THAN EXPORTED FOR THE GATE'S CONVENIENCE. `hunter-ai.js` is a
 * tuned, owned file and `ATTACK_WINDUP` is module-private on purpose; adding an export so an
 * instrument can see it is the instrument changing the thing it measures. Parsing the declaration
 * is pinned to the same line either way, and fails loudly if the constant is renamed.
 */
const AI_SRC = readFileSync(new URL('../src/game/hunter-ai.js', import.meta.url), 'utf8');
const ATTACK_WINDUP = Number((AI_SRC.match(/const ATTACK_WINDUP = ([\d.]+);/) || [])[1]);
if (!Number.isFinite(ATTACK_WINDUP)) { console.log('  FAIL K-arm · could not read ATTACK_WINDUP from hunter-ai.js'); process.exit(1); }

const DT = 1 / 60;
/** The threshold that shipped, kept here so K3 can run the SAME traces through it. */
const SHIPPED_CONTACT = 1.35;

/**
 * One staging: a Hunter that has already committed, a runner behaving one of three ways, and
 * thirty seconds. Returns everything both death rules need, from a single trace — the two rules
 * are never given different runs to argue over.
 */
function stage({ stageNo, mode, site }) {
  let seed = 99;
  const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const centre = room.anchor(site);
  const sockets = { shoulderL: 'armL', shoulderR: 'armR', hipL: 'legL', hipR: 'legR' };
  const root = new THREE.Object3D();
  root.position.set(centre.x, 0, centre.z);
  const runner = {
    root, height: 1.7, radius: 0.34, noise: 0,
    rig: { caps: { downed: false }, occupant: (s) => sockets[s] ?? 'empty', detach: (s) => { delete sockets[s]; return null; } },
  };
  const h = new HunterAI({ room, scene: null, rng, position: new THREE.Vector3(centre.x + 6, 0, centre.z), bangPolicy: 'off', stage: stageNo });
  h.radius = 0.30 + stageNo * 0.12;
  h.setTargets([runner]);
  h.awareness = 1; h.state = 'PURSUE'; h.target = runner; h.lastKnown.copy(root.position);

  let kills = 0, firstKillT = null;
  h.onKill = () => { kills++; if (firstKillT == null) firstKillT = simT; };

  let simT = 0, minContact = Infinity, firstAttackT = null, shippedFiredT = null;
  for (let i = 0; i < 60 * 30; i++) {
    simT = i * DT;
    if (mode === 'walk-away') {
      const d = new THREE.Vector3().subVectors(root.position, h.root.position).setY(0).normalize();
      root.position.addScaledVector(d, MOVE.run * DT); runner.noise = 1;
    }
    if (mode === 'walk-into') {
      const d = new THREE.Vector3().subVectors(h.root.position, root.position).setY(0).normalize();
      root.position.addScaledVector(d, MOVE.walk * DT); runner.noise = 0.49;
    }
    root.position.copy(room.collide(root.position, runner.radius, 1.70, 0.55));
    h.update(DT, simT);
    const c = Math.hypot(root.position.x - h.root.position.x, root.position.z - h.root.position.z);
    if (c < minContact) minContact = c;
    if (firstAttackT == null && h.state === 'ATTACK') firstAttackT = simT;
    if (shippedFiredT == null && c < SHIPPED_CONTACT) shippedFiredT = simT;
  }
  return {
    stageNo, mode, kills, firstKillT, firstAttackT, minContact, shippedFiredT,
    gate: HUNTER_SENSE.reach * (stageNo * 0.35 + 0.8),
  };
}

const SITE = 'gallery.mid';
const MODES = ['still', 'walk-away', 'walk-into'];
const runs = [];
for (const stageNo of [1, 2, 3]) for (const mode of MODES) runs.push(stage({ stageNo, mode, site: SITE }));
console.warn = realWarn; console.error = realErr;
const fx = (n) => (n == null ? 'never' : n.toFixed(2));

// ---------------------------------------------------------------- K0 · the arm
{
  t('K0 arm · the real Hunter, in the real house, reached ATTACK in every staging',
    runs.every((r) => r.firstAttackT != null),
    `${runs.length} stagings at ${SITE} · gates ${[...new Set(runs.map((r) => r.gate.toFixed(2)))].join('/')} m`);
  t('K0b arm · and it is a committed Hunter, not one that wandered off',
    runs.every((r) => r.kills > 0), `${runs.map((r) => r.kills).join(',')} limbs taken`);
}

// ---------------------------------------------------------------- K1 · the kill is the AI's
{
  const late = runs.filter((r) => r.firstKillT - r.firstAttackT >= ATTACK_WINDUP - DT * 2);
  t('K1 · the take lands only after a full ATTACK_WINDUP — a kill you watched coming',
    late.length === runs.length,
    `ATTACK→take ${runs.map((r) => fx(r.firstKillT - r.firstAttackT)).join(', ')}s vs windup ${ATTACK_WINDUP}s`);
}

// ---------------------------------------------------------------- K2 · the take is producible
{
  t('K2 · a Hunter that has the runner in reach produces a take, in every staging',
    runs.every((r) => r.firstKillT != null),
    runs.map((r) => `s${r.stageNo}/${r.mode} ${fx(r.firstKillT)}s`).join(' · '));
  t('K2b · including the two behaviours where the runner never closes the distance itself',
    runs.filter((r) => r.mode !== 'walk-into').every((r) => r.firstKillT != null),
    `${runs.filter((r) => r.mode !== 'walk-into').length} stagings of standing still and running away`);
}

// ---------------------------------------------------------------- K3 · the control is the bug
/**
 * The shipped rule, run over the SAME traces. Nothing is re-simulated, so this cannot be accused
 * of having been given an easier house.
 */
{
  const fired = runs.filter((r) => r.shippedFiredT != null);
  t('K3 control · restore `contact < 1.35` and two thirds of the stagings never take anybody',
    fired.length < runs.length && runs.filter((r) => r.mode !== 'walk-into').every((r) => r.shippedFiredT == null),
    `fired in ${fired.length} of ${runs.length} · min contact standing still ${runs.filter((r) => r.mode === 'still').map((r) => r.minContact.toFixed(2)).join('/')} m`);
  t('K3b control · because the Hunter\'s own weapon outreaches the death test',
    runs.every((r) => r.minContact > SHIPPED_CONTACT || r.mode === 'walk-into')
      && WEAPON_RANGE.hunterSlam > SHIPPED_CONTACT,
    `hunterSlam ${WEAPON_RANGE.hunterSlam} m vs a test at ${SHIPPED_CONTACT} m`);
  t('K3c control · and where it did fire it beat the windup — the anticipation never completed',
    fired.every((r) => r.shippedFiredT - r.firstAttackT < ATTACK_WINDUP),
    fired.map((r) => `s${r.stageNo}/${r.mode} ATTACK→1.35m ${fx(r.shippedFiredT - r.firstAttackT)}s`).join(' · '));
  t('K3d control · so the shipped rule and the AI disagree about whether anyone died',
    runs.some((r) => r.firstKillT != null && r.shippedFiredT == null),
    `${runs.filter((r) => r.firstKillT != null && r.shippedFiredT == null).length} stagings where limbs came off and the segment ended "held"`);
}

// ---------------------------------------------------------------- K4 · the wiring
/**
 * The behaviour above is `hunter-ai.js`'s and would hold whether or not anything listened. K4 is
 * the half that says the party expedition is what listens — `taken.js:27` asserted this in prose
 * for as long as it has existed and `grep -rn onKill src/views/ src/party/` returned that comment
 * and nothing else.
 */
{
  const src = readFileSync(new URL('../src/views/expedition.js', import.meta.url), 'utf8');
  const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  t('K4 · `views/expedition.js` subscribes to the Hunter\'s own kill',
    /hunter\.onKill\s*=/.test(body) && /onKill\s*=\s*\(\)\s*=>\s*finish\('taken'/.test(body),
    'onKill → finish(\'taken\')');
  t('K4b · and nothing in the file decides a take by distance any more',
    !/finish\('taken'[^)]*\)/.test(body.replace(/hunter\.onKill[^\n]*\n/, '')),
    'the only `finish(\'taken\')` in the file is the subscription');
  t('K4c · the other three endings are untouched — terminal, clock, and the report',
    /finish\('lit', t\)/.test(body) && /finish\('held', t\)/.test(body));
  t('K4 control · the scan would notice the distance test coming back',
    /finish\('taken'[^)]*\)/.test("if (contact < 1.35) finish('taken', t);"));
  t('K4b control · and would notice the subscription going away',
    !/hunter\.onKill\s*=/.test('hunter.setTargets([playerBody]);'));
}


// ---------------------------------------------------------------- K5 · the show, five deep
/**
 * 🚨 **A TAKE IS PRODUCIBLE ON EPISODE ONE. THE QUESTION NOBODY ASKED WAS EPISODE FIVE.**
 *
 * `party-taken` T3 could not see this and is not at fault for it: it asks
 * `resolveContact({occupiedSockets: 0})`, a pure function, which correctly answers `'taken'`.
 * The defect is one layer down and only exists across a segment boundary — `views/expedition.js`
 * builds ONE `Player` at page load and its `arm()` never touched `player.rig`, so the four
 * sockets `_attack` takes in the fixed order `armL, armR, legL, legR` came off one per episode
 * and nothing put them back. By take 3 the runner is `limp`, `canRun: false`, top speed 1.12 m/s
 * against a stage-1 Hunter at 2.05 — the trade `darkrun.js` calls *the entire decision* is
 * inverted. By take 4 it is `down` and `Player.update` zeroes its velocity.
 *
 * And then it is IMMORTAL, which is the half that reaches the scoreboard: `_attack`'s
 * `if (!socket) return;` fires BEFORE `this.onKill?.()`, and `onKill` is the mode's only death
 * test. So every later expedition ends `'held'` — *the guide held correctly* — over a robot lying
 * on the floor with the Hunter standing on it.
 *
 * So this runs the ENGINE five episodes deep: a real `Player`, a real `LimbField`, a real
 * `HunterAI` in the real house, re-armed between segments exactly as `arm()` re-arms them, and
 * asks whether the fifth still ends `'taken'`. The control is the same five episodes with the
 * refit call removed and nothing else changed.
 */
{
  /** One show. `refit` false reproduces exactly what shipped. */
  function show({ refit, episodes = 5 }) {
    let seed = 11;
    const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const scene = new THREE.Scene();
    const field = new LimbField(scene, { rng, floorY: room.floorY, bounds: room.bounds });
    const player = new Player({ scene, world: room, field, rng, id: 'runner', avatar: null });
    const LOADOUT = EXP.recordLoadout(player);
    const body = {
      root: player.root, rig: player.rig, height: player.height, radius: player.radius,
      get noise() { return player.noise; },
    };
    const hunter = new HunterAI({
      room, scene, rng, position: room.spawn.hunter.clone(), noise: new NoiseBus(), bangPolicy: 'off',
    });
    hunter.setTargets([body]);
    const centre = room.anchor('ballroom.centre');
    const out = [];
    for (let ep = 1; ep <= episodes; ep++) {
      // ---- `arm()`, the parts of it that touch a body. The refit is the line under test.
      if (refit) EXP.refitLoadout(player, LOADOUT);
      for (const it of [...field.items]) { it.root.removeFromParent(); field.take(it); }
      hunter._pull = null;
      player.pos.set(centre.x, 0, centre.z); player.facing = Math.PI; player.vel.set(0, 0, 0);
      hunter.root.position.set(centre.x + 4, 0, centre.z); hunter.vel.set(0, 0, 0);
      hunter.awareness = 1; hunter.state = 'PURSUE'; hunter.target = body;
      hunter.contact = 0; hunter.searchTimer = 0; hunter.lastKnown.copy(player.root.position);
      hunter.resetCombat();

      const limbsAtTop = EXP.LOADOUT_SOCKETS.filter((k) => player.rig.occupant(k) !== 'empty').length;
      const from = player.pos.clone();
      let outcome = null, simT = 0, clock = EXP.EXPEDITION_SECONDS, attackFrames = 0;
      hunter.onKill = () => { if (!outcome) outcome = 'taken'; };
      for (let i = 0; i < Math.round(EXP.EXPEDITION_SECONDS / DT) && !outcome; i++) {
        simT = i * DT; clock -= DT;
        player.aimYaw = 0;
        player.update(DT, simT, { move: { x: 0, y: 1 }, run: true, aimYaw: 0, aimPitch: 0 });
        room.update(DT);
        hunter.update(DT, simT);
        if (hunter.state === 'ATTACK') attackFrames++;
        if (!outcome && clock <= 0) outcome = 'held';
      }
      out.push({
        ep, outcome: outcome ?? 'held', t: simT, limbsAtTop,
        gait: player.caps.gait, canRun: !!player.caps.canRun, topSpeed: MOVE.run * player.caps.speedScale,
        attack: attackFrames * DT, moved: player.pos.distanceTo(from), fieldLeft: field.items.length,
      });
    }
    return out;
  }

  const fixed = show({ refit: true });
  const shipped = show({ refit: false });
  const row = (r) => `ep${r.ep} ${r.outcome} @${r.t.toFixed(1)}s (${r.limbsAtTop} limbs, ${r.gait})`;

  t('K5 arm · five real episodes were driven, and episode one takes the runner either way',
    fixed[0].outcome === 'taken' && shipped[0].outcome === 'taken',
    `fixed ${row(fixed[0])} · shipped ${row(shipped[0])}`);

  t('K5 · the refit puts the body back, so the FIFTH expedition still ends `taken`',
    fixed.every((r) => r.outcome === 'taken'),
    fixed.map(row).join(' · '));

  t('K5b · and every episode opens on a whole runner — same limbs, same gait, same top speed',
    fixed.every((r) => r.limbsAtTop === 4 && r.gait === 'walk' && r.canRun
      && Math.abs(r.topSpeed - MOVE.run) < 1e-9),
    `${fixed.map((r) => r.limbsAtTop).join('/')} limbs · top speed ${fixed.map((r) => r.topSpeed.toFixed(2)).join('/')} m/s`);

  t('K5c · and the floor is swept, so last episode\'s severed limbs are not on camera in this one',
    fixed.every((r) => r.fieldLeft <= 1),
    `${fixed.map((r) => r.fieldLeft).join('/')} parts left in the field at each segment end`);

  t('K5 control · remove the refit and the fifth expedition comes back `held`',
    shipped[4].outcome === 'held' && shipped.some((r) => r.outcome === 'taken'),
    shipped.map(row).join(' · '));

  t('K5b control · because the runner degraded to `down` and stopped moving',
    shipped[4].gait === 'down' && shipped[4].moved < 0.05 && !shipped[4].canRun,
    `gait ${shipped.map((r) => r.gait).join(' → ')} · ep5 travelled ${shipped[4].moved.toFixed(2)} m holding RUN`);

  t('K5c control · and the Hunter never entered ATTACK on it — an empty socket returns before `onKill`',
    shipped[4].attack === 0 && fixed[4].attack > 0,
    `shipped ep5 ${shipped[4].attack.toFixed(1)}s of ATTACK vs ${fixed[4].attack.toFixed(1)}s with the refit`);

  t('K5d control · so the segment reported the guide having held correctly, five episodes running',
    shipped.filter((r) => r.outcome === 'held').length >= 1
    && fixed.filter((r) => r.outcome === 'held').length === 0,
    `shipped ${shipped.map((r) => r.outcome).join(',')} · fixed ${fixed.map((r) => r.outcome).join(',')}`);
}


// ---------------------------------------------------------------- K6 · the Hunter grows
/**
 * 🚨 **THE HUNTER NEVER GREW IN PARTY MODE, AND A TELL FIXED LAST SESSION WAS STILL DEAD BECAUSE
 * OF IT.**
 *
 * `finish('taken')` is called from inside `hunter.onKill`, from inside `_attack`, from inside
 * `hunter.update`. The next frame the view's loop returns `aftermath()` and never calls
 * `hunter.update` again. `absorb()` has by then entered `_grow` → `state = 'GROW'`, but
 * `this.stage = this.growTo` only lands at `p >= 1` inside `_growStep`, 1.4 seconds of updates it
 * was never going to get — and then `arm()` set `state = 'PATROL'` and the growth was gone.
 *
 * So `HUNTER_GROWTH`, `HUNTER_SPEED[2..3]`, the 1.4 s convulsion and the entire growth-of-menace
 * curve were unreachable in the mode whose whole audience is watching it happen — including
 * `hunter.onStage`, which was wired to `playFurnBreak('stone')` and a `progress` feed and could
 * never fire. A tell fixed, and still dead for a downstream reason nobody had checked.
 *
 * The control is the discard: the identical eight takes with `settleGrowth()` not called and the
 * aftermath not ticking, which is exactly what shipped.
 */
{
  /**
   * Eight episodes of absorbs through the real AI. `aftermathTicks` is how many frames the view's
   * `aftermath()` gets before the segment is re-armed; `settle` is `arm()`'s `settleGrowth()`.
   */
  function show({ settle, aftermathSeconds }) {
    let seed = 9;
    const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const h = new HunterAI({
      room, scene: new THREE.Scene(), rng, position: room.spawn.hunter.clone(), bangPolicy: 'off',
    });
    let stageEvents = 0;
    const announced = [];
    h.onStage = (from, to) => { stageEvents++; announced.push(`${from}→${to}`); };
    const rows = [];
    for (let ep = 1; ep <= 8; ep++) {
      // ---- the take: `_attack` absorbs the limb it just took, then the loop stops simulating.
      h.absorb(null);
      // ---- `aftermath()`: the ONLY thing still ticked is a Hunter that is mid-convulsion.
      for (let i = 0; i < Math.round(aftermathSeconds / DT); i++) if (h.state === 'GROW') h.update(DT, i * DT);
      // ---- `arm()`, in its own order: settle first, then the state reset.
      if (settle) h.settleGrowth();
      h.root.position.copy(room.spawn.hunter);
      h.awareness = 0; h.state = 'PATROL'; h.target = null; h.contact = 0; h.searchTimer = 0;
      h.resetCombat();
      rows.push({ ep, absorbed: h.absorbed, stage: h.stage, speed: HUNTER_SPEED[h.stage], radius: h.radius, stageEvents });
    }
    return { rows, stageEvents, announced, flareOn: !!h._flareOn };
  }

  const fixed = show({ settle: true, aftermathSeconds: 4 });
  const shipped = show({ settle: false, aftermathSeconds: 0 });
  const want = (n) => (n >= HUNTER_GROWTH.toStage3 ? 3 : n >= HUNTER_GROWTH.toStage2 ? 2 : 1);

  t('K6 arm · eight takes were absorbed by the real AI and the growth table wants two steps',
    fixed.rows.length === 8 && want(8) === 3 && want(1) === 1,
    `HUNTER_GROWTH ${JSON.stringify(HUNTER_GROWTH)} · wanted stages ${fixed.rows.map((r) => want(r.absorbed)).join('')}`);

  t('K6 · the Hunter\'s stage survives the segment boundary and rises across a show',
    fixed.rows.every((r) => r.stage === want(r.absorbed)) && fixed.rows[7].stage === 3,
    fixed.rows.map((r) => `ep${r.ep}:s${r.stage}/${r.speed}`).join(' '));

  t('K6b · and `onStage` — the tell — fires once per step, with the steps it took',
    fixed.stageEvents === 2 && fixed.announced.join(',') === '1→2,2→3',
    `${fixed.stageEvents} events: ${fixed.announced.join(', ')}`);

  t('K6c · and the radius follows the stage, so a grown body is not driving a stage-1 collider',
    fixed.rows.every((r) => Math.abs(r.radius - (0.30 + r.stage * 0.12)) < 1e-9),
    fixed.rows.map((r) => r.radius.toFixed(2)).join('/'));

  t('K6d · and the next segment does not open with the eye flare still lit',
    fixed.flareOn === false, '`resetCombat` takes the flare off rather than releasing it over 2.5 s');

  /**
   * The belt and the brace are different code paths and both have to hold. The aftermath tick is
   * what AIRS the convulsion; `settleGrowth()` is what saves the arithmetic when the aftermath is
   * cut short — a phase change, a disconnect, a segment that ends on the clock a frame later.
   */
  const cutShort = show({ settle: true, aftermathSeconds: 0 });
  t('K6e · an aftermath cut short still lands the stage — `settleGrowth()` is the brace',
    cutShort.rows.every((r) => r.stage === want(r.absorbed)) && cutShort.rows[7].stage === 3,
    cutShort.rows.map((r) => `ep${r.ep}:s${r.stage}`).join(' '));
  t('K6e2 · and it lands it SILENTLY — a growth nobody watched does not get a sound',
    cutShort.stageEvents === 0 && fixed.stageEvents === 2,
    `cut short ${cutShort.stageEvents} onStage events at the same 8 takes vs ${fixed.stageEvents} when the aftermath airs it`);

  /**
   * The behaviour above is `hunter-ai.js`'s and would hold whether or not the view used it. This
   * is the half that says the view does — and the control is `views/game.js`, a real file that
   * genuinely does not contain either call because its loop never stops running.
   */
  {
    const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const exp = strip(readFileSync(new URL('../src/views/expedition.js', import.meta.url), 'utf8'));
    const game = strip(readFileSync(new URL('../src/views/game.js', import.meta.url), 'utf8'));
    const calls = /hunter\.settleGrowth\(/;
    const ticks = /hunter\.state === 'GROW'\)\s*hunter\.update\(/;
    t('K6f · `views/expedition.js` settles the growth when it re-arms, and airs it in the aftermath',
      calls.test(exp) && ticks.test(exp), 'settleGrowth() in arm() · a GROWing Hunter is ticked in aftermath()');
    t('K6f control · and the same scan finds neither in `views/game.js`, whose loop never stops',
      !calls.test(game) && !ticks.test(game),
      'the survival mode gets its 1.4 s for free, which is why the party mode never did');
  }

  t('K6 control · discard the growth at the boundary and the Hunter is stage 1 after eight takes',
    shipped.rows.every((r) => r.stage === 1) && shipped.rows[7].speed === HUNTER_SPEED[1],
    shipped.rows.map((r) => `ep${r.ep}:s${r.stage}/${r.speed}`).join(' '));

  t('K6b control · so `onStage` never fires at all, and the tell wired for it is unreachable',
    shipped.stageEvents === 0 && fixed.stageEvents > 0,
    `party ${shipped.stageEvents}× vs ${fixed.stageEvents}× · speed ${shipped.rows[7].speed} vs ${fixed.rows[7].speed} m/s at the eighth take`);

  t('K6c control · and HUNTER_SPEED[2..3] is dead weight — the whole growth curve is unreachable',
    new Set(shipped.rows.map((r) => r.speed)).size === 1 && new Set(fixed.rows.map((r) => r.speed)).size === 3,
    `shipped speeds {${[...new Set(shipped.rows.map((r) => r.speed))].join(',')}} vs {${[...new Set(fixed.rows.map((r) => r.speed))].join(',')}} of ${HUNTER_SPEED.slice(1).join('/')}`);
}

console.log(`\nengine-take: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
