#!/usr/bin/env node
/**
 * 🧱 **THE REGRESSION THAT IS THE WHOLE RISK OF THE `buildWall` FIX — every OTHER lintel, window,
 * doorway, sill, clerestory and dig lintel in the house, leaf by leaf, under `Object.is`.**
 *
 *   node harness/_ap3-golden.mjs --write harness/_ap3-golden.json
 *   node harness/_ap3-golden.mjs --check harness/_ap3-golden.json
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------------
 * `docs/slices/task-aperture-3.md` changes the single sorted walk that EVERY opening in the house
 * goes through. The defect it fixes only exists when one cut nests inside another, which happens
 * on no shipped arm — so the fix's entire risk is that it moves something on an arm where the
 * cuts are DISJOINT and nobody notices for a week.
 *
 * `localise-1` proved the same class of no-op by recording its subject's whole surface and
 * comparing it leaf by leaf with `Object.is` (**1170 leaves identical**, `_loc1_golden.mjs`).
 * This is that technique pointed at built geometry instead of an exported table:
 *
 *   · every `THREE.Box3` in `sp.colliders`, per space, in build order — one row per `buildWall`
 *     `box()` call, and the only per-box record that survives the GeoBin merge;
 *   · every merged mesh, by name, material name, vertex count, index count, and a SHA-256 of the
 *     raw bytes of its position buffer — so a box that moved by one float moves the digest.
 *
 * Five arms, chosen because between them they exercise every branch of the walk:
 *
 *   default    the shipped build — dig faces, tracked dig lintels, the gallery's `capY` +
 *              clerestory BAND (a second disjoint walk), the study's window sills, `?estate=port`
 *   doors      the same, with the four `p.svc_*` doorway cuts back in the same wall as the dig
 *              faces — **the disjoint version of the very wall the fix is for**
 *   bays       `?dig=bays`, 36 segment cuts, the widest cut list in the project
 *   nodig      `?dig=0`, connector cuts only
 *   noestate   `?estate=off`, so no order supplies `capY`/`band` at all
 *
 * 🚨 **AND IT SHIPS A CONTROL THAT MUST FAIL, ON EVERY `--check`.** A comparator that has gone
 * blind — a stale file, an empty census, a surface that stopped including geometry — prints
 * exactly the same "identical" as a correct no-op. So every `--check` also rebuilds ONE arm with
 * `room.js`'s skirting height perturbed by 0.1 mm, in memory, and REQUIRES the comparison to go
 * red on it. If the ablation compares equal, this file exits non-zero and says so.
 *
 * ⚠️ **The slab arms are deliberately NOT in the corpus.** `?slab=1` carries four degenerate
 * zero-width boxes that the fix REMOVES on purpose (`_ap3-geom.mjs` A2), so a golden that pinned
 * them would forbid the fix. The slab arms are asserted by `_ap3-geom.mjs`, which knows what is
 * supposed to move.
 *
 * 🚨 **AND DO NOT ADD THEM NOW THAT THE FIX HAS LANDED.** The nesting arms' geometry is asserted by
 * `_ap3-geom.mjs` **A6**, which carries this file's leaf-by-leaf technique but A/Bs the arms against
 * each other instead of against a recorded file — so it needs no baseline, states its invariant in
 * words (*"every cut it adds NESTS, so neither half moves"*) and cannot be silenced by a re-`--write`.
 * Adding `slab`/`wired`/`slabwin` here would move this file's **15740** and buy nothing.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SENTINEL, DISJOINT_ARMS } from './_ap3-build.mjs';
import { planPatch, LANDED_MARK } from './_ap3-geom.mjs';

const BUILD = fileURLToPath(new URL('./_ap3-build.mjs', import.meta.url));

/**
 * The ablation — 0.1 mm off two `buildWall` numbers, applied in memory to `room.js` only.
 *
 * ⚠️ **BOTH HALVES OF THE SURFACE, DELIBERATELY.** The skirting line has no collider, so on its
 * own it would only prove the MESH digests are live; the `solid()` line has no geometry, so on
 * its own it would only prove the COLLIDER rows are live. A comparator that had gone blind to
 * either half would still pass a one-sided ablation.
 */
const ABLATION = [
  {
    old: "if (alongZ) put('skirt', w * k, 0.34, o.t + 0.03, u, 0.17, o.at, 0.6);",
    neu: "if (alongZ) put('skirt', w * k, 0.3401, o.t + 0.03, u, 0.17, o.at, 0.6);",
  },
  {
    old: 'const b = alongZ ? solid(w, h, o.t, u, y, o.at) : solid(o.t, h, w, o.at, y, u);',
    neu: 'const b = alongZ ? solid(w, h, o.t * 1.0001, u, y, o.at) : solid(o.t, h, w, o.at, y, u);',
  },
];

function census(arm, patch = null) {
  const env = { ...process.env };
  if (patch) env.AP3_PATCH = JSON.stringify(patch); else delete env.AP3_PATCH;
  const r = spawnSync(process.execPath, [BUILD, '--arm', arm],
    { env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`_ap3-build --arm ${arm} exited ${r.status}\n${r.stderr}`);
  const i = r.stdout.indexOf(SENTINEL);
  if (i < 0) throw new Error(`_ap3-build --arm ${arm} produced no census\n${r.stderr}`);
  return JSON.parse(r.stdout.slice(i + SENTINEL.length));
}

/** What is pinned. Deliberately NOT the whole census — `warns` and `patched` are run metadata. */
const surfaceOf = (c) => ({
  search: c.search, wire: c.wire, passageDoorsOn: c.passageDoorsOn, slabArm: c.slabArm,
  panelIds: c.panelIds, faces: c.faces, colliders: c.colliders, meshes: c.meshes,
});

function surface(patch = null, arms = DISJOINT_ARMS) {
  const out = {};
  for (const a of arms) out[a] = surfaceOf(census(a, patch));
  return out;
}

/** Leaf-by-leaf, `Object.is` — `-0` and `0` are different doubles and a placement can make one. */
function diff(a, b, path = '', out = []) {
  if (out.length > 400) return out;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) { out.push(`${path}: shape`); return out; }
    if (a.length !== b.length) out.push(`${path}.length: ${a.length} -> ${b.length}`);
    for (let i = 0; i < Math.max(a.length, b.length); i++) diff(a[i], b[i], `${path}[${i}]`, out);
    return out;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    for (const k of keys) diff(a[k], b[k], path ? `${path}.${k}` : k, out);
    return out;
  }
  if (!Object.is(a, b)) out.push(`${path}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
  return out;
}

const leaves = (v) => (Array.isArray(v) ? v.reduce((n, x) => n + leaves(x), 0)
  : (v && typeof v === 'object') ? Object.values(v).reduce((n, x) => n + leaves(x), 0) : 1);

const iW = process.argv.indexOf('--write');
const iC = process.argv.indexOf('--check');
const file = process.argv[(iW >= 0 ? iW : iC) + 1];

if (iW < 0 && iC < 0) {
  console.log('usage: _ap3-golden.mjs --write <file> | --check <file>');
  process.exit(2);
}

if (iW >= 0) {
  const s = surface();
  writeFileSync(file, `${JSON.stringify(s, null, 0)}\n`);
  console.log(`wrote ${file} — ${DISJOINT_ARMS.length} arms, ${leaves(s)} leaves`);
  process.exit(0);
}

/**
 * `--preview` runs the check against the plan document's own edits applied in memory — i.e. it answers
 * *"would the planned edits move anything on a disjoint-cut arm?"* before anyone types them.
 * It retires itself once the fix is in the tree.
 */
const PREVIEW = process.argv.includes('--preview')
  && !readFileSync(fileURLToPath(new URL('../src/game/room.js', import.meta.url)), 'utf8')
    .includes(LANDED_MARK);

const want = JSON.parse(readFileSync(file, 'utf8'));
const got = surface(PREVIEW ? planPatch() : null, Object.keys(want));
if (process.argv.includes('--preview') && !PREVIEW) {
  console.log('  ⏭️  --preview: the fix is already in the tree; checking it directly.');
}
const d = diff(want, got);
const n = leaves(want);

console.log('═══ _ap3-golden — the disjoint-cut corpus, leaf by leaf ═══');
for (const a of Object.keys(want)) {
  console.log(`  ${a.padEnd(9)} ${want[a].colliders.length} colliders · `
    + `${want[a].meshes.length} meshes · ${want[a].faces.length} dig faces`);
}
if (d.length === 0) console.log(`  ✅ ${n} leaves Object.is-identical across ${Object.keys(want).length} arms`);
else {
  console.log(`  ❌ ${d.length} leaves moved (of ${n})`);
  for (const line of d.slice(0, 30)) console.log(`       ${line}`);
}

// ---- CONTROL THAT MUST FAIL — every run, not once -------------------------------------------
const arm0 = Object.keys(want)[0];
const ablated = { [arm0]: surfaceOf(census(arm0, ABLATION)) };
const dA = diff({ [arm0]: want[arm0] }, ablated);
const ctrlOk = dA.length > 0;
console.log(ctrlOk
  ? `  ✅ CONTROL a 0.1 mm skirting ablation on "${arm0}" moves ${dA.length} leaves — `
    + 'the comparator is not blind'
  : `  ❌ CONTROL a 0.1 mm skirting ablation on "${arm0}" changed NOTHING — `
    + 'this file is not measuring the build, and the result above means nothing');

process.exit(d.length === 0 && ctrlOk ? 0 : 1);
