#!/usr/bin/env node
/**
 * 🚨 **WHICH OF `_ap3-golden.mjs`'s MOVED LEAVES ARE THE SKIN'S, AND WHICH ARE SOMEBODY ELSE'S.**
 *
 *   node harness/evidence/_skin1-golden-split.mjs            the split, per arm, per mesh
 *   node harness/evidence/_skin1-golden-split.mjs --rows     + every moved mesh row
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS EXISTS, AND IT IS THE REASON THE GOLDEN WAS NOT RE-WRITTEN ON 2026-08-11
 * ---------------------------------------------------------------------------------------------
 * `_ap3-golden.mjs` pins 15740 built-geometry leaves and `--write` re-records ALL of them. Its own
 * rule — *"a golden re-baselined without reading the diff is not a net, it is a rubber stamp"* —
 * is unenforceable the moment two agents are editing the tree at once, because `--write` cannot
 * tell whose change it is absorbing.
 *
 * `skin-1` hit exactly that. Adding the eroding dressing moved leaves, as expected. Between two
 * runs twenty minutes apart the count went **72 -> 272**, and the extra 200 were on `nodig` and
 * `bays` — arms with no free faces, where `buildSkin` returns `null` and this slice builds nothing
 * at all. `src/game/wallinstances.js` had been written three minutes earlier by another agent.
 *
 * **So it ablates instead of arguing.** `AP3_PATCH` (the in-memory `room.js` substitution
 * `_ap3-geom --preview` already uses) replaces `const skin = buildSkin(...)` with `const skin =
 * null`, in a child process, on disk untouched. Whatever still moves under that ablation is not
 * this slice's, by construction rather than by reasoning about mtimes.
 *
 * 📐 **WHAT IT MEASURED, 2026-08-11:**
 *
 *   this slice   **72 leaves · 24 mesh rows** (10 `default`, 10 `doors`, 4 `noestate`; `bays` and
 *                `nodig` have no free faces, so zero). **Only fields [2][3][4]** — vertex count,
 *                index count and the position digest. Name, material, mesh count, every collider,
 *                every panel id and every dig-face rect: **unmoved.**
 *   not this     **200 leaves · 40 mesh rows**, on all five arms, every one a
 *   slice        `wall.pristine.face` / `wall.pristine.reveal` PAIR at swapped indices — and the
 *                **multiset of mesh rows is identical on all five arms**, so it is a pure sibling
 *                REORDER with no geometry moved. `src/game/wallinstances.js`, live at the time.
 *
 * 🎯 **HOW TO USE IT WHEN YOU DO RE-BASELINE.** Run this first. If the "not this slice" column is
 * zero, the golden's diff is yours alone and `--write` is honest. If it is not, find that owner
 * before you record their work under your name.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SENTINEL, DISJOINT_ARMS } from './_ap3-build.mjs';

const BUILD = fileURLToPath(new URL('./_ap3-build.mjs', import.meta.url));
const GOLD = fileURLToPath(new URL('../fixtures/_ap3-golden.json', import.meta.url));
const ROWS = process.argv.includes('--rows');

/**
 * ⚠️ **THE ANCHOR MUST EXIST OR `_ap3-build` THROWS** — its own guard, and the reason this is a
 * text substitution rather than a flag: a preview that silently applied nothing would report the
 * unablated tree as the ablated one.
 */
const ABLATE = [{
  old: 'const skin = buildSkin({ panels, warn: (...a) => console.warn(...a) });',
  neu: 'const skin = null; void buildSkin;',
}];

const census = (arm, patch) => {
  const env = { ...process.env };
  if (patch) env.AP3_PATCH = JSON.stringify(patch); else delete env.AP3_PATCH;
  const r = spawnSync(process.execPath, [BUILD, '--arm', arm], { encoding: 'utf8', maxBuffer: 1 << 28, env });
  if (r.status !== 0) throw new Error(`_ap3-build --arm ${arm} exited ${r.status}\n${r.stderr}`);
  return JSON.parse(r.stdout.slice(r.stdout.indexOf(SENTINEL) + SENTINEL.length));
};

const base = JSON.parse(readFileSync(GOLD, 'utf8'));
const key = (m) => JSON.stringify(m);

/** @returns {{leaves:number, rows:string[], multiset:boolean, other:object}} */
function compare(g, c) {
  const rows = [];
  let leaves = 0;
  for (let i = 0; i < Math.max(g.meshes.length, c.meshes.length); i++) {
    const a = g.meshes[i], b = c.meshes[i];
    if (!a || !b) { leaves += 5; rows.push(`  mesh[${i}] present in only one build`); continue; }
    const d = [0, 1, 2, 3, 4].filter((k) => !Object.is(a[k], b[k]));
    if (!d.length) continue;
    leaves += d.length;
    rows.push(`  mesh[${i}] "${a[0]}" -> "${b[0]}"  verts ${a[2]}->${b[2]}`
      + `  index ${a[3]}->${b[3]} (${((b[3] - a[3]) / 3 >= 0 ? '+' : '')}${(b[3] - a[3]) / 3} tris)`
      + `  fields ${d.join(',')}`);
  }
  const ma = g.meshes.map(key).sort(), mb = c.meshes.map(key).sort();
  const multiset = ma.length === mb.length && ma.every((v, i) => v === mb[i]);
  let col = 0;
  for (let i = 0; i < Math.max(g.colliders.length, c.colliders.length); i++) {
    const a = g.colliders[i], b = c.colliders[i];
    if (!a || !b || a.some((v, k) => !Object.is(v, b[k]))) col++;
  }
  let pid = 0;
  for (let i = 0; i < Math.max(g.panelIds.length, c.panelIds.length); i++) {
    if (g.panelIds[i] !== c.panelIds[i]) pid++;
  }
  const faces = JSON.stringify(g.faces) === JSON.stringify(c.faces) ? 0 : 1;
  return { leaves, rows, multiset, other: { col, pid, faces } };
}

console.log('═══ _skin1-golden-split — whose leaves moved ═══');
let mineTot = 0, otherTot = 0;
for (const arm of DISJOINT_ARMS) {
  const g = base[arm];
  const live = compare(g, census(arm, null));
  const abl = compare(g, census(arm, ABLATE));
  const mine = live.leaves - abl.leaves;
  mineTot += mine; otherTot += abl.leaves;
  console.log(`\n${arm.padEnd(9)} total moved ${String(live.leaves).padStart(4)}`
    + `  ·  THIS SLICE ${String(mine).padStart(4)}`
    + `  ·  NOT THIS SLICE ${String(abl.leaves).padStart(4)}`
    + `  (colliders ${live.other.col} · panelIds ${live.other.pid} · dig faces ${live.other.faces})`);
  if (abl.leaves) {
    console.log(`          the not-mine part is a pure REORDER: mesh-row multiset identical = ${abl.multiset}`);
  }
  if (ROWS) for (const r of live.rows) console.log(r);
}
console.log(`\n  THIS SLICE ${mineTot} leaves · NOT THIS SLICE ${otherTot} leaves`);
/**
 * 🚨 **THE CONTROL THAT MUST FAIL.** If the ablation is not reaching `room.js` the two censuses are
 * the same build and this file reports "0 not mine" no matter what anyone else changed — a
 * result-shaped output instead of a measurement. So it also asserts that the ablation MOVES
 * something on an arm this slice is known to touch.
 */
{
  const g = base.default;
  const live = compare(g, census('default', null));
  const abl = compare(g, census('default', ABLATE));
  const bites = live.leaves !== abl.leaves;
  console.log(bites
    ? `  ✅ CONTROL the ablation reaches room.js — "default" moves ${live.leaves} leaves live and ${abl.leaves} ablated`
    : '  ❌ CONTROL the ablation changed nothing on "default" — this whole split is void');
  if (!bites) process.exitCode = 1;
}
if (otherTot > 0) {
  console.log('\n  ⚠️  DO NOT `_ap3-golden.mjs --write` while the NOT-THIS-SLICE column is non-zero:'
    + '\n      it would record another owner\'s live edit under your name. Find them first.');
}
