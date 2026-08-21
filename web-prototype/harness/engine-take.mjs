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
const { HUNTER_SENSE, MOVE, WEAPON_RANGE } = await import(s_('game/rules.js'));
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

console.log(`\nengine-take: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
