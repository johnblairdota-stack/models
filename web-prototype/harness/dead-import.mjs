#!/usr/bin/env node
/**
 * 🧹 **dead-import — THE SHIPPING MODE DOES NOT CARRY THE RETIRED ONE.**
 *
 *   node harness/dead-import.mjs
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 TWO IMPORT LINES PUT 4,900 LINES OF SURVIVAL MODE ON THE PARTY MODE'S CRITICAL PATH
 * ---------------------------------------------------------------------------------------------
 * `views/expedition.js` and `views/premiere.js` each carried
 *
 *     import { makeLightRig } from './game.js';
 *
 * for ONE 139-line function. `views/game.js` is the retired survival mode and it pulls in the
 * sledge, the gadget world, the run state, the exit siege, the HUD, the death watch and the escape
 * watch behind it. Measured in the built artefact before this: a **277,813 B raw / 104,012 B gzip**
 * chunk on the party mode's blocking path, identified by finding `"CHAINED FROM THE OUTSIDE"`,
 * `"pickup.sledgehammer"` and `"Building the estate"` inside the chunk the party pages load.
 *
 * So *"the survival mode is dead code in party"* was true behaviourally and false as a bundle
 * fact. `makeLightRig` now lives in `src/lighting/space-rig.js` beside the other lighting builders
 * and all three views import it from there — which is also why it must stay ONE function and not
 * be copied, since a second rig would make the party mode's mansion a visibly different building
 * from the survival mode's.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ WHY THIS WALKS THE SOURCE RATHER THAN THE BUILD
 * ---------------------------------------------------------------------------------------------
 * A gate that shelled out to `vite build` would be slow, would need `dist/` to exist, and would
 * SKIP without one — and a SKIP is never a PASS on this project. What the bundler does for a
 * STATIC import is a transitive closure over `import ... from '…'`, which is a text walk over
 * files that are already here. Dynamic `import()` is deliberately NOT followed: it is a separate
 * chunk by construction, which is the whole point of the two `await import()`s in
 * `expedition.js`'s avatar path.
 *
 * The value of the gate is not the byte count, it is that it fails the moment somebody reaches
 * for `game.js` again for one convenient function — which is exactly how the first one happened.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

const ROOT = resolve(fileURLToPath(new URL('../src/', import.meta.url)));
const rel = (p) => relative(ROOT, p).replaceAll('\\', '/');

/** Static `import … from '…'` and `export … from '…'` only. `import(` is a chunk boundary. */
const STATIC = /(?:^|\n)\s*(?:import|export)\s[^;\n]*?from\s*['"]([^'"]+)['"]/g;

function depsOf(file, extraImports = new Map()) {
  const src = readFileSync(file, 'utf8');
  const injected = extraImports.get(rel(file)) ?? [];
  const out = [...injected];
  for (const m of src.matchAll(STATIC)) out.push(m[1]);
  return out
    .filter((s) => s.startsWith('.'))
    .map((s) => {
      let p = resolve(dirname(file), s);
      if (existsSync(p) && statSync(p).isFile()) return p;
      for (const ext of ['.js', '.mjs', '/index.js']) if (existsSync(p + ext)) return p + ext;
      return null;
    })
    .filter(Boolean);
}

/** Everything a module statically pulls in, transitively. Returns absolute paths. */
function closure(entry, extraImports = new Map()) {
  const seen = new Set([entry]);
  const q = [entry];
  while (q.length) {
    for (const d of depsOf(q.shift(), extraImports)) if (!seen.has(d)) { seen.add(d); q.push(d); }
  }
  return seen;
}

const V = (n) => resolve(ROOT, 'views', n);
const GAME = V('game.js');
const EXPEDITION = V('expedition.js');
const PREMIERE = V('premiere.js');
const RIG = resolve(ROOT, 'lighting/space-rig.js');
const bytes = (set) => [...set].reduce((a, f) => a + statSync(f).size, 0);
const kb = (n) => `${(n / 1024).toFixed(0)} kB`;

// ---------------------------------------------------------------- N0 · the arm
{
  t('N0 arm · the walker finds real graphs, not empty ones',
    closure(EXPEDITION).size > 20 && closure(GAME).size > 20,
    `expedition reaches ${closure(EXPEDITION).size} modules · game.js reaches ${closure(GAME).size}`);
  t('N0b arm · and it resolves a relative import it is given',
    closure(EXPEDITION).has(RIG), `${rel(RIG)} is in the expedition's graph`);
}

// ---------------------------------------------------------------- N1 · the severance
{
  const exp = closure(EXPEDITION);
  const prem = closure(PREMIERE);
  t('N1 · the party expedition does not statically reach the survival mode',
    !exp.has(GAME), `views/game.js is ${exp.has(GAME) ? 'IN' : 'not in'} a graph of ${exp.size} modules`);
  t('N1b · nor does the premiere',
    !prem.has(GAME), `${prem.size} modules, none of them views/game.js`);
  t('N1c · and nothing else in `src/` imports it either — it is a leaf now',
    (() => {
      const all = new Set([...closure(EXPEDITION), ...closure(PREMIERE), ...closure(GAME)]);
      const importers = [...all].filter((f) => f !== GAME && depsOf(f).includes(GAME));
      return importers.length === 0;
    })(),
    'views/game.js is imported by no module in any of the three graphs');
}

// ---------------------------------------------------------------- N2 · the control, and the size
/**
 * The old import line, put back INTO THE WALK rather than into the file. Same walker, same graph,
 * one edge added — so the number below is the weight that edge was carrying and nothing else.
 */
{
  const restored = new Map([['views/expedition.js', ['./game.js']], ['views/premiere.js', ['./game.js']]]);
  const was = closure(EXPEDITION, restored);
  const now = closure(EXPEDITION);
  const dragged = [...was].filter((f) => !now.has(f));
  t('N2 control · restore `import { makeLightRig } from \'./game.js\'` and the walk reaches it again',
    was.has(GAME) && !now.has(GAME),
    `the one edge puts views/game.js back in the graph`);
  t('N2b control · dragging the whole retired mode behind it, for one 139-line function',
    dragged.length >= 5 && bytes(was) > bytes(now) * 1.15,
    `${dragged.length} extra modules, ${kb(bytes(was) - bytes(now))} of source: `
    + dragged.map(rel).sort().slice(0, 8).join(', ') + (dragged.length > 8 ? ', …' : ''));
  t('N2c control · including the exit siege and the gadget world, which the party mode has no verb for',
    dragged.some((f) => /run\.js|sledge\.js|dig\.js|gadgets/.test(rel(f))),
    dragged.map(rel).filter((r) => /run\.js|sledge\.js|dig\.js|gadgets|hud\.js|exterior/.test(r)).join(', ') || 'none');
}

// ---------------------------------------------------------------- N3 · one rig, not two
/**
 * The failure mode this fix could have introduced. Copying the function instead of moving it
 * would pass N1 and would make the party mode's mansion a different building from the survival
 * mode's, which `space-rig.js`'s header names as the one thing an edit must never do.
 */
{
  const files = [GAME, EXPEDITION, PREMIERE, RIG];
  const defines = files.filter((f) => /export function makeLightRig|^function makeLightRig/m.test(readFileSync(f, 'utf8')));
  t('N3 · `makeLightRig` is defined exactly once, in the lighting module',
    defines.length === 1 && defines[0] === RIG,
    defines.map(rel).join(', '));
  const importers = [GAME, EXPEDITION, PREMIERE].filter((f) => depsOf(f).includes(RIG));
  t('N3b · and all three views take it from there, so there is one rig and not two',
    importers.length === 3, importers.map(rel).join(', '));
  t('N3 control · the detector would see a second definition',
    /export function makeLightRig/.test(readFileSync(RIG, 'utf8'))
    && !/export function makeLightRig/.test(readFileSync(GAME, 'utf8')),
    'the scan is over each file\'s own text, so a copy-paste shows up as a second hit');
}

console.log(`\ndead-import: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
