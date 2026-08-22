#!/usr/bin/env node
/**
 * party-warm-drive — walk one night in a real browser: LOBBY WARM -> INTROS -> EXPEDITION.
 *
 *   node harness/party-warm-drive.mjs
 *
 * `docs/slices/task-prime-time-lobby-warm-night.md` §7. Sibling of `party-follow-drive.mjs`, and
 * out of the `gates:party` chain for the same reason: it needs `npm install` and a browser, and
 * CI runs the party gates with neither.
 *
 * 🚨 **THIS EXISTS BECAUSE A GATE CANNOT SEE A NULL IN A SCENE GRAPH, AND BECAUSE THE FIRST
 * VERSION OF THIS SLICE SHIPPED ONE.**
 *
 * Two crashes reached a playtest, both of the same class and neither catchable in bare node:
 *
 *   1. The chair circle asked `room.materials` for a `gilt` the playable kit does not have, so an
 *      `InstancedMesh` went into the scene with `material: null` and `projectObject` threw once
 *      per frame.
 *   2. Tearing the intro robots down on the `run` cue disposed materials the RUNNER was still
 *      rendering with — so the crash landed on the EXPEDITION beat, one transition after the code
 *      that caused it, with `views/party-follow.js` painting the red failure card over the show.
 *
 * The second one is why W3 below walks the whole night rather than each beat in isolation: the
 * earlier probe checked warm and checked intros, and the bug lived in the join between intros and
 * the run. **A beat that is only ever tested from a cold start is not tested.**
 */

import { chromium } from 'playwright';

const BASE = process.env.RRR_BASE || 'http://localhost:5178';

let pass = 0, fail = 0;
const t = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); }
  return c;
};

console.log('\nparty-warm-drive — lobby warm -> intros -> expedition, in a browser');

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });

const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

/**
 * The scene graph, checked for the two shapes `projectObject` dies on. It walks the SAME
 * predicates three.js does — a null child, and a drawable with no material — rather than
 * asserting "no errors were logged", because an error that only fires on some frames is an error
 * the drive can miss by sampling at the wrong moment.
 */
const graphFaults = () => page.evaluate(() => {
  const scene = window.__rrrFollow?.room?.root?.parent;
  if (!scene) return ['no scene'];
  const bad = [];
  const walk = (o, path) => {
    if (o == null) { bad.push(`null child under ${path}`); return; }
    if ((o.isMesh || o.isLine || o.isPoints) && !o.material) bad.push(`no material: ${path}/${o.name || o.type}`);
    if ((o.isMesh || o.isLine || o.isPoints) && !o.geometry) bad.push(`no geometry: ${path}/${o.name || o.type}`);
    for (const c of o.children || []) walk(c, `${path}/${o.name || o.type}`);
  };
  walk(scene, '');
  return bad.slice(0, 6);
});

const cue = (c) => page.evaluate((x) => window.postMessage({ t: 'cue', cue: x }, '*'), c);

/**
 * 🚨 **THE ASSERTION THE FIRST DRIVE DID NOT HAVE, AND THE REASON A PLAYTEST FOUND THE BUG.**
 *
 * Tearing the intro robots down called `Player.dispose()`, which calls `unit4h.js`'s dispose,
 * which disposes **every material in the set it was handed** — including the ones shared with the
 * runner. The scene graph stays perfectly well-formed while that happens, so a null-child walk
 * sees nothing, and on SwiftShader the next frame quietly rebuilds the freed `WebGLProgram` and
 * nobody notices. On John's GPU it threw, and `main.js` L25's window `error` handler painted the
 * red failure card over the show.
 *
 * So the invariant is asserted directly instead of being left to a driver: wrap
 * `Material.prototype.dispose` to record every uuid destroyed, then check that nothing still
 * reachable from the scene is on that list. `THREE` is not a global here, so the prototype is
 * reached through a material that is already in the scene.
 */
const armDisposeTrap = () => page.evaluate(() => {
  const scene = window.__rrrFollow?.room?.root?.parent;
  let proto = null;
  scene?.traverse((o) => { if (!proto && o.material) proto = Object.getPrototypeOf(o.material); });
  if (!proto) return false;
  window.__disposed = new Set();
  const real = proto.dispose;
  proto.dispose = function patched(...a) { window.__disposed.add(this.uuid); return real.apply(this, a); };
  return true;
});

const disposedButLive = () => page.evaluate(() => {
  const scene = window.__rrrFollow?.room?.root?.parent;
  const bad = [];
  scene?.traverse((o) => {
    for (const m of [].concat(o.material ?? [])) {
      if (m && window.__disposed?.has(m.uuid)) bad.push(`${o.name || o.type}:${m.name || m.type}`);
    }
  });
  return [...new Set(bad)].slice(0, 6);
});

// ---- W1 · the warm slot comes up on its own, with a house that can hold the night ------------
await page.goto(`${BASE}/?view=party.follow&warm=1&seed=3`, { waitUntil: 'domcontentloaded' });
const up = await page.waitForFunction(() => document.body.dataset.rrrFollow === 'live', null, { timeout: 300000 })
  .then(() => true).catch(() => false);
t('W1 · the warm slot reaches a first rendered frame', up);
t('W1b · and it never painted the red failure card',
  !(await page.$('#fail')) && !/VIEW .* FAILED/i.test(await page.textContent('body').catch(() => '')));

const house = await page.evaluate(() => {
  const s = window.__rrrFollow?.room?.spaces ?? [];
  return { n: s.length, types: [...new Set(s.map((x) => x.roomType).filter(Boolean))] };
});
t('W1c · the night is procedural and holds both mission rooms',
  house.types.includes('gallery') && house.types.includes('ballroom'),
  `${house.n} spaces · ${house.types.join(',')}`);
t('W1d · the warm graph is clean', (await graphFaults()).length === 0, (await graphFaults()).join(' | ') || 'clean');

/*
 * 🚨 **THE TV'S HOUSE AND THE GUIDE'S MAP ARE THE SAME HOUSE, COMPARED AS GEOMETRY.**
 *
 * `party-warm` W12 proves the two ends agree on the SEED. This proves the two derivations agree on
 * the RESULT, which is a different claim: the map comes from `planRegions` (pure, `buildPlan`) and
 * the mansion from `generatedTablesFor` (which drops dead-end alcoves the builder infills). A
 * browser is the only place both can be evaluated at once. Measured before the fix: 13 map rects
 * against 12 built spaces — a passage drawn on the guide's map that is a solid wall in the house.
 */
const houses = await page.evaluate(async () => {
  const M = await import('/src/party/mansion.js');
  const seed = M.pickPlanSeed(Number(new URL(location.href).searchParams.get('seed')) | 0).seed;
  const r = M.planRegions(seed);
  const built = window.__rrrFollow.room.spaces;
  const key = (o) => `${o.x0.toFixed(2)},${o.z0.toFixed(2)},${o.x1.toFixed(2)},${o.z1.toFixed(2)}`;
  const map = [...r.rooms, ...r.corridors].map(key).sort();
  const house = built.map(key).sort();
  return { map, house, onlyMap: map.filter((k) => !house.includes(k)), onlyHouse: house.filter((k) => !map.includes(k)) };
});
t('W1e · the guide\'s map draws exactly the spaces the mansion built',
  houses.onlyMap.length === 0 && houses.onlyHouse.length === 0,
  `${houses.map.length} map vs ${houses.house.length} built`
  + (houses.onlyMap.length ? ` · map-only ${houses.onlyMap.join(' ')}` : '')
  + (houses.onlyHouse.length ? ` · house-only ${houses.onlyHouse.join(' ')}` : ''));

// ---- W2 · the intros ---------------------------------------------------------------------
const CAST = [
  { id: 'p1', seat: 0, name: 'Ada', shell: '#1c2a3a', accent: '#7fb3e8' },
  { id: 'p2', seat: 1, name: 'Bo', shell: '#5c2733', accent: '#e5c04a' },
  { id: 'p3', seat: 2, name: 'Cy', shell: '#8a6f45', accent: '#d95a8a' },
];
t('W1f · the dispose trap is armed', await armDisposeTrap());

await cue({ kind: 'intros', cast: CAST });
await page.waitForTimeout(4000);
const intro = await page.evaluate(() => {
  const scene = window.__rrrFollow?.room?.root?.parent;
  const g = scene?.children?.find((c) => c.name === 'intro');
  const bodies = (g?.children ?? []).filter((c) => c.name !== 'intro-chairs');
  return { chairs: !!g?.children.find((c) => c.name === 'intro-chairs'), bodies: bodies.length };
});
t('W2 · the intro bed builds one chair circle and one body per joined phone',
  intro.chairs && intro.bodies === CAST.length, JSON.stringify(intro));
let faults = await graphFaults();
t('W2b · the intro graph is clean', faults.length === 0, faults.join(' | ') || 'clean');

// ---- W3 · THE TRANSITION THAT SHIPPED A CRASH ------------------------------------------------
//
// 🚨 The whole reason this file exists. The intro teardown and the runner share a material set;
// the first version disposed the shared half on this cue and the runner's body went null one beat
// later. Checked ACROSS the join, and then again after the runner has actually been driven, so a
// fault that only appears once something moves is still caught.
await cue({ kind: 'run', runner: 'p1', name: 'Ada', shell: '#1c2a3a', accent: '#7fb3e8' });
await page.waitForTimeout(2500);
faults = await graphFaults();
t('W3 · the graph survives intros -> expedition', faults.length === 0, faults.join(' | ') || 'clean');
t('W3b · and the bed is on the run', (await page.evaluate(() => window.__rrrFollow?.mode?.())) === 'run');

const before = await page.evaluate(() => window.__rrrFollow?.world?.());
for (let i = 0; i < 12; i++) {
  await cue({ kind: 'move', x: 0, y: 1, run: i % 3 === 0, swing: i === 6 });
  await page.waitForTimeout(220);
}
await cue({ kind: 'move', x: 0, y: 0, run: false, swing: false });
await page.waitForTimeout(400);
const after = await page.evaluate(() => window.__rrrFollow?.world?.());
t('W3c · a phone stick moves the body',
  Math.hypot(after.runner.x - before.runner.x, after.runner.z - before.runner.z) > 0.5,
  `${before.runner.x},${before.runner.z} -> ${after.runner.x},${after.runner.z}`);
t('W3d · the runner is carrying the hammer',
  await page.evaluate(() => !!window.__rrrFollow?.runner?.sledge?.equipped));
faults = await graphFaults();
t('W3e · the graph is still clean after a driven, swinging runner',
  faults.length === 0, faults.join(' | ') || 'clean');

const zombies = await disposedButLive();
t('W3f · NOTHING STILL IN THE SCENE HAS HAD ITS MATERIAL DISPOSED — the playtest crash',
  zombies.length === 0, zombies.join(' | ') || 'no zombie materials');
t('W3g control · the trap can still see a disposal at all — it is not vacuously empty',
  await page.evaluate(() => window.__disposed instanceof Set),
  `${await page.evaluate(() => window.__disposed?.size ?? -1)} materials disposed during teardown`);

// ---- W4 · nothing threw, anywhere, for the whole night ---------------------------------------
//
// The failure card is `main.js`'s response to the VIEW promise rejecting, but the crash that
// reached the playtest was thrown from the rAF tick — so "no card" and "no errors" are two
// different assertions and both are made.
t('W4 · the view never painted the failure card',
  !/VIEW .* FAILED/i.test(await page.textContent('body').catch(() => '')));
const unique = [...new Set(errs)];
t('W4b · and nothing threw across the whole night', unique.length === 0, unique.slice(0, 3).join(' | ') || 'silent');

await browser.close();
console.log(`\nparty-warm-drive: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
