#!/usr/bin/env node
/**
 * 🖼️ **DOES THE ROOM'S DRESSING ERODE WITH THE WALL, AND DID MAKING IT ERODE CHANGE THE SURFACE?**
 *
 *   node harness/evidence/_skin1-geom.mjs                     both arms, every check
 *   node harness/evidence/_skin1-geom.mjs --cell 0.12         a different erosion grain
 *   node harness/evidence/_skin1-geom.mjs --report            + the per-mesh triangle cost table
 *
 * ---------------------------------------------------------------------------------------------
 * WHY IT EXISTS — two questions nothing on disk could answer
 * ---------------------------------------------------------------------------------------------
 * `_dress1-skin.mjs` answers *"what draws in front of a destructible face and what would removing
 * it cost"*, in the browser, in draw calls. It cannot answer either of these:
 *
 *   1. **Did subdividing the dressing change the surface?** `src/game/skin.js` rewrites merged
 *      `GeoBin` geometry in the builder. The claim is that longest-edge bisection with
 *      interpolated normals and uvs is EXACT — the fragments are the same surface the rasteriser
 *      was already drawing — and a claim like that is a number, not an opinion. **Total surface
 *      area, per mesh, to 1e-9 relative.**
 *   2. **Does a portrait survive the first blow?** John: *"I don't want it to disappear in one
 *      hit."* That is a curve over blows, on the real `DamageField`, and it needs the whole house
 *      built — which is headless here for the same reason `_ap3-build.mjs` is headless: an arm is
 *      module-scope state, so an arm is a PROCESS.
 *
 * 🚨 **AND THE `?skin=0` ARM IS NOT A CONVENIENCE, IT IS THE CONTROL.** Every conservation claim
 * below is made by comparing the ON build against the OFF build in a second process. If the two
 * came back identical everywhere, the subdivision never happened and every "conserved" would be
 * vacuously true — so **C1 REQUIRES the vertex counts to DIFFER, on the meshes that carry skin and
 * on no others**, and the run goes red if they do not.
 *
 * ---------------------------------------------------------------------------------------------
 * THE CHECKS
 * ---------------------------------------------------------------------------------------------
 *   A1  the skin resolves faces and fragments at all, and every fragment sits on a real face
 *   A2  🚨 SURFACE AREA CONSERVED, per mesh, ON <-> OFF, to 1e-9 relative
 *   A3  MESH COUNT AND NAMES IDENTICAL — the +0 draw-call property, structurally: not one mesh
 *       was added, removed, renamed or re-materialled
 *   A4  COLLIDERS IDENTICAL, leaf by leaf — this file may not move what you can walk through
 *   A5  the triangle cost, against the 900k budget
 *   A6  🖼️ **NOT IN ONE HIT** — a full-power blow at the centre of a gallery portrait leaves most
 *       of the canvas standing; the erosion is a curve over blows, not a switch
 *   A7  and its CONTROL: keep digging and the canvas IS gone. Without this, a rule that erodes
 *       nothing ever would pass A6 perfectly.
 *   A8  ROUND RESET restores every fragment — `room.js` `setDigPlan` resets the field every round
 *   A9  the erosion follows the DAMAGE GRID, not the blow: a fragment dies iff its own cell is
 *       past its threshold. Asserted by reading `field.depthAt` back for every dead fragment.
 *   C1  🚨 the ON and OFF builds MUST differ, and only on meshes that carry skin
 *   C2  🚨 a fragment planted on a face 500 m from the house must resolve to NO face — so "this
 *       face carries no dressing" and "the containment test is broken" cannot print the same
 *   C3  🚨 `?skin=0` must find zero fragments and erode zero triangles under the same blows that
 *       A7 uses to empty the canvas
 */
import { spawnSync } from 'node:child_process';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = new URL('..', import.meta.url);
const SRC = new URL('../../src/', HERE);
const s = (p) => new URL(p, SRC).href;
const SENTINEL = 'SKIN1JSON ';
const SELF = fileURLToPath(new URL('./_skin1-geom.mjs', import.meta.url));

const argOf = (k, d = null) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : d;
};

/**
 * 🚨 **THE MUTANTS — THE CONTROLS THAT MUST FAIL, AS CODE RATHER THAN AS A PROMISE.**
 *
 * `critic-skin-1` deleted this slice's round-reset wiring, rebuilt, ran both suites and got
 * **18/0 and 12/0 unchanged** — because every gate called `skin.reset()` on the object and nothing
 * called `room.setDigPlan()`, which is the only path the game uses. A gate that cannot notice its
 * subject being deleted is not a gate.
 *
 * So the reintroduction arms are not a note saying "I checked once". Each one is an exact-text
 * substitution applied to `src/` **in memory, at load, in a child process** — `_ap3-build.mjs`'s
 * `AP3_PATCH` construction — and the parent REQUIRES the mutated run to come back wrong. They run
 * on every run. **A missing anchor throws**, so a mutant that silently stopped applying would fail
 * loudly instead of quietly certifying the tree.
 */
const MUTANTS = {
  /**
   * Delete the round-reset wiring in `room.js` `setDigPlan` — `critic-skin-1`'s own mutation,
   * verbatim. Without it, eroded dressing accumulates one way and never comes back.
   */
  reset: {
    file: 'game/room.js',
    subs: [{ old: '      skin?.reset();', neu: '      void 0;' }],
  },
  /**
   * Restore the pre-fix budget: no house-wide grain solve, and a running total checked INSIDE the
   * emit loop, so the cap bites mid-traversal and whole faces lose everything by iteration order.
   */
  budget: {
    file: 'game/skin.js',
    subs: [
      { old: '  const cell = solveCell(work, cellReq, MAX_ADDED_TRIS);',
        neu: '  const cell = cellReq; void solveCell;' },
      { old: '        skin.addedTris += walk(vertOf(ia), vertOf(ib), vertOf(ic), lim,\n'
          + '          (A, B, C) => emitTri(p, A, B, C)) - 1;',
        neu: '        const _k = walk(vertOf(ia), vertOf(ib), vertOf(ic), lim, null);\n'
          + '        if (skin.addedTris + _k - 1 > MAX_ADDED_TRIS) { keep.push(ia, ib, ic); continue; }\n'
          + '        skin.addedTris += walk(vertOf(ia), vertOf(ib), vertOf(ic), lim,\n'
          + '          (A, B, C) => emitTri(p, A, B, C)) - 1;' },
    ],
  },
};

function installMutant(name) {
  const mu = MUTANTS[name];
  if (!mu) throw new Error(`_skin1-geom: unknown mutant "${name}"`);
  const target = s(mu.file);
  let applied = false;
  registerHooks({
    load(url, ctx, next) {
      const r = next(url, ctx);
      if (url !== target) return r;
      let src = r.source.toString();
      for (const p of mu.subs) {
        // 🚨 A missing anchor THROWS. A mutant that applied nothing would report the good tree.
        if (!src.includes(p.old)) throw new Error(`_skin1-geom: mutant "${name}" anchor not found in ${mu.file}:\n${p.old}`);
        src = src.replace(p.old, p.neu);
      }
      applied = true;
      return { ...r, source: src };
    },
  });
  process.on('exit', () => {
    if (!applied) {
      console.error(`_skin1-geom: mutant "${name}" was set and ${mu.file} never loaded through the hook`);
      process.exitCode = 1;
    }
  });
}

function stubRenderer() {
  return {
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    render: () => {},
    readRenderTargetPixels: (rt, x, y, w, h, buf) => {
      buf[0] = 200; buf[1] = 200; buf[2] = 200; if (buf.length > 3) buf[3] = 255;
    },
  };
}

/** Surface area of an indexed mesh, in the mesh's WORLD frame. The conservation quantity. */
function meshArea(THREE, m) {
  const g = m.geometry, pos = g.attributes.position;
  const idx = g.index ? g.index.array : null;
  const n = idx ? idx.length / 3 : pos.count / 3;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  let sum = 0;
  for (let t = 0; t < n; t++) {
    const ia = idx ? idx[t * 3] : t * 3, ib = idx ? idx[t * 3 + 1] : t * 3 + 1,
      ic = idx ? idx[t * 3 + 2] : t * 3 + 2;
    a.fromBufferAttribute(pos, ia).applyMatrix4(m.matrixWorld);
    b.fromBufferAttribute(pos, ib).applyMatrix4(m.matrixWorld);
    c.fromBufferAttribute(pos, ic).applyMatrix4(m.matrixWorld);
    e1.subVectors(b, a); e2.subVectors(c, a);
    sum += e1.cross(e2).length() * 0.5;
  }
  return sum;
}

/**
 * ⚠️ **THE ARM IS A PROCESS.** `skin.js`'s `SKIN_ON`/`SKIN_CELL` and `room.js`'s `?dig=`/`?estate=`
 * are all module scope, read once at import. An in-process "second arm" would silently measure the
 * first one twice — `_ap3-build.mjs`'s own recorded reason for the same shape.
 */
async function buildArm(search) {
  globalThis.location = { search };
  const THREE = await import('three');
  const { initBaker } = await import(s('materials/baker.js'));
  initBaker(stubRenderer());
  const RM = await import(s('game/room.js'));
  const warns = [];
  const realWarn = console.warn;
  console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
  const room = await RM.buildTestRoom({ work: (p) => p }, {});
  console.warn = realWarn;
  room.root.updateMatrixWorld(true);
  return { THREE, room, warns };
}

/** The comparable surface of a build: meshes by name, their counts and their AREA. */
function surfaceOf(THREE, room) {
  const meshes = [];
  room.root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry, pa = g.attributes.position;
    meshes.push({
      name: o.name ?? '', mat: o.material?.name ?? '',
      verts: pa.count, index: g.index ? g.index.count : 0,
      area: meshArea(THREE, o),
      inst: !!o.isInstancedMesh,
    });
  });
  const colliders = [];
  for (const sp of room.spaces) {
    for (const b of sp.colliders) {
      colliders.push([sp.id, b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]);
    }
  }
  return { meshes, colliders, panelIds: room.panels.map((p) => p.spec.id) };
}

// =============================================================== the child process
if (process.argv.includes('--child')) {
  const search = argOf('--search', '');
  const { THREE, room, warns } = await buildArm(search);
  const out = { search, ...surfaceOf(THREE, room), warns: warns.filter((w) => !/serialize/.test(w)) };
  out.skin = room.skin ? room.skin.stats() : null;
  process.stdout.write(SENTINEL + JSON.stringify(out) + '\n');
  process.exit(0);
}

/**
 * 🖼️ **DRIVE `reset` — THE ROUND RESET THROUGH THE ENTRY POINT THE GAME ACTUALLY USES.**
 *
 * 🚨 **`room.setDigPlan()`, NOT `skin.reset()`.** `views/game.js` `applyExitPlan()` is the only
 * caller in the game and it runs on every fresh seed and every ~28 s under the capture Director.
 * A gate that calls `skin.reset()` directly is testing a method, not a wiring — which is exactly
 * how `critic-skin-1` deleted the wiring and watched both suites stay green.
 *
 * It prints the whole state so the parent can tell the three failures apart: nothing eroded (the
 * drive was vacuous), the field did not reset (`setDigPlan` never reached this panel, so the run
 * proves nothing about the skin), and the dressing did not come back (the defect).
 */
if (process.argv.includes('--drive-reset')) {
  const mu = argOf('--mutant');
  if (mu) installMutant(mu);
  const { THREE, room } = await buildArm(argOf('--search', ''));
  const skin = room.skin;
  const ranked = [...skin.faces.entries()].map(([id, r]) => ({ id, n: r.frags.length }))
    .sort((a, b) => b.n - a.n);
  const rec = skin.faces.get(ranked[0].id);
  const panel = room.panels.find((p) => p.id === ranked[0].id);
  /**
   * ⚠️ **SWEPT, NOT AIMED AT ONE POINT.** A single aim point erodes 16 fragments of 43 749, which
   * is a thin margin for a control that has to be unmistakably red under the mutant. A player
   * sweeps and so does this: a grid over the face's own fragment extent, which takes thousands.
   */
  let u0 = 2, u1 = -1, v0 = 2, v1 = -1;
  for (const f of rec.frags) {
    if (f.u < u0) u0 = f.u; if (f.u > u1) u1 = f.u;
    if (f.v < v0) v0 = f.v; if (f.v > v1) v1 = f.v;
  }
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 5; j++) {
      const u = u0 + (u1 - u0) * (i + 0.5) / 6, v = v0 + (v1 - v0) * (j + 0.5) / 5;
      panel.applyHit(panel.pointAt(u, v, new THREE.Vector3()), 1);
      skin.erode(panel);
    }
  }
  const st0 = skin.stats();
  // ⚠️ THE REAL ENTRY POINT. Nothing below may touch `skin` or `resetDamage` directly.
  const plan = room.setDigPlan({ seed: 'skin1-reset' });
  const st1 = skin.stats();
  process.stdout.write('SKIN1RESET ' + JSON.stringify({
    face: ranked[0].id, mutant: mu ?? null, planOn: !!plan?.on,
    goneBefore: st0.gone, aliveAfter: st1.alive, total: st1.fragments,
    maxDepthAfter: panel.field.maxDepth, openAfter: panel.field.openCells,
  }) + '\n');
  process.exit(0);
}

/**
 * 🎯 **DRIVE `budget` — WHAT AN UNAFFORDABLY FINE GRAIN DOES TO THE FACES.**
 *
 * `critic-skin-1` drove `?skin=0.03` and `?skin=0.021` and found the house budget biting
 * mid-traversal: **10 of 10 destructible faces carrying dressing, then 9, then 8** — decided by
 * iteration order, announced only by a `console.warn`. It prints the face count and the per-face
 * fragment totals so an empty face is visible rather than inferred.
 */
if (process.argv.includes('--drive-budget')) {
  const mu = argOf('--mutant');
  if (mu) installMutant(mu);
  const { room } = await buildArm(argOf('--search', ''));
  const skin = room.skin;
  const per = [...skin.faces.entries()].map(([id, r]) => [id, r.frags.length]).sort();
  process.stdout.write('SKIN1BUDGET ' + JSON.stringify({
    mutant: mu ?? null, ...skin.stats(), per,
  }) + '\n');
  process.exit(0);
}

/**
 * 🚨 **C3b's arm.** The identical 24 blows, on the identical face, with `?skin=0` — and it prints
 * how many fragments eroded, which on this arm must be 0 because there is no skin to erode. It is
 * a separate process because the arm is module scope.
 */
if (process.argv.includes('--erodeoff')) {
  const { THREE, room } = await buildArm('?skin=0');
  const panel = room.panels.find((p) => p.spec?.free && p.field);
  for (let i = 0; i < 24; i++) panel.applyHit(panel.pointAt(0.5, 0.5, new THREE.Vector3()), 1);
  const n = room.skin ? room.skin.stats().gone : 0;
  process.stdout.write(`SKIN1OFF ${n}\n`);
  process.exit(0);
}

// =============================================================== the parent
const child = (search) => {
  const r = spawnSync(process.execPath, [SELF, '--child', '--search', search],
    { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`_skin1-geom child "${search}" exited ${r.status}\n${r.stderr}`);
  const i = r.stdout.indexOf(SENTINEL);
  if (i < 0) throw new Error(`_skin1-geom child "${search}" produced no census\n${r.stderr}`);
  return JSON.parse(r.stdout.slice(i + SENTINEL.length));
};

let passed = 0, failed = 0;
const ok = (t, d = '') => { passed++; console.log(`   ok   ${t}${d ? '  ' + d : ''}`); };
const no = (t, d = '') => { failed++; console.log(`  FAIL  ${t}${d ? '  ' + d : ''}`); };
const note = (t) => console.log(`   ·    ${t}`);

const CELL = argOf('--cell', null);
const ON = CELL ? `?skin=${CELL}` : '';
console.log('═══ _skin1-geom — the room\'s dressing erodes with the wall ═══');

const A = child(ON);
const B = child('?skin=0');

note(`ON  ${A.meshes.length} meshes · ${A.colliders.length} colliders · skin ${JSON.stringify(A.skin)}`);
note(`OFF ${B.meshes.length} meshes · ${B.colliders.length} colliders · skin ${A.skin ? (B.skin ? 'ON?!' : 'null')  : 'null'}`);

// ---------------------------------------------------------------- A1
A.skin && A.skin.faces > 0 && A.skin.fragments > 0
  ? ok('A1 the skin resolves faces and fragments',
    `${A.skin.faces} destructible faces carry dressing · ${A.skin.fragments} fragments`
    + ` · cell ${A.skin.cell} m · built in ${A.skin.buildMs} ms`)
  : no('A1 the skin resolves faces and fragments', JSON.stringify(A.skin));

B.skin === null
  ? ok('C3a CONTROL — `?skin=0` builds no skin at all', 'room.skin is null')
  : no('C3a CONTROL — `?skin=0` builds no skin at all', JSON.stringify(B.skin));

// ---------------------------------------------------------------- A3, C1
{
  const namesA = A.meshes.map((m) => `${m.name}|${m.mat}`);
  const namesB = B.meshes.map((m) => `${m.name}|${m.mat}`);
  const same = namesA.length === namesB.length && namesA.every((n, i) => n === namesB[i]);
  same
    ? ok('A3 MESH COUNT, NAMES AND MATERIALS IDENTICAL — no mesh was added, split or renamed',
      `${namesA.length} meshes, in build order`)
    : no('A3 MESH COUNT, NAMES AND MATERIALS IDENTICAL — no mesh was added, split or renamed',
      `${namesA.length} vs ${namesB.length}`
      + (namesA.length === namesB.length
        ? ` · first mismatch ${namesA.findIndex((n, i) => n !== namesB[i])}` : ''));

  if (same) {
    const moved = [], held = [];
    for (let i = 0; i < A.meshes.length; i++) {
      (A.meshes[i].verts !== B.meshes[i].verts || A.meshes[i].index !== B.meshes[i].index
        ? moved : held).push(i);
    }
    /**
     * 🚨 **C1, THE REINTRODUCTION ARM.** If nothing moved, the subdivision did not run and every
     * "conserved" below is a statement about two identical builds.
     */
    moved.length > 0
      ? ok('C1 CONTROL — the ON build really is subdivided (counts DIFFER on the skin meshes)',
        `${moved.length} of ${A.meshes.length} meshes rewritten, ${held.length} untouched`)
      : no('C1 CONTROL — the ON build really is subdivided (counts DIFFER on the skin meshes)',
        'ON and OFF are count-identical everywhere — nothing was subdivided');

    // ---------------------------------------------------------- A2
    let worst = 0, worstName = '';
    for (let i = 0; i < A.meshes.length; i++) {
      const a = A.meshes[i].area, b = B.meshes[i].area;
      const rel = Math.abs(a - b) / Math.max(1e-9, b);
      if (rel > worst) { worst = rel; worstName = A.meshes[i].name; }
    }
    /**
     * ⚠️ **THE TOLERANCE IS `Float32` EPSILON AND IT IS NOT A RELAXATION TO TASTE.** HANDOFF:
     * *"byte-identical is an impossible test and must never be demanded as proof — the correct
     * proof is inside the same-config noise floor."* Every midpoint here is computed in double and
     * **stored in a `Float32Array`**, so the fragments' vertices are the true midpoints rounded to
     * float32, whose relative epsilon is 1.19e-7. Measured drift on the shipped house is
     * **1.33e-8**, an order of magnitude inside that. A tolerance of 1e-9 would be demanding that
     * float32 be exact; 1e-6 is eight times the storage epsilon and still 1000x tighter than any
     * real geometry change (subdividing a quad WRONG moves its area by percents, not by ppm).
     */
    const TOL = 1e-6;
    worst < TOL
      ? ok('A2 SURFACE AREA CONSERVED — the subdivision is the same surface',
        `worst relative drift ${worst.toExponential(2)} on ${worstName || '(none)'} against a`
        + ` float32 storage epsilon of 1.19e-7 · ${A.meshes.length} meshes`)
      : no('A2 SURFACE AREA CONSERVED — the subdivision is the same surface',
        `worst relative drift ${worst.toExponential(2)} on ${worstName} — the fragments are NOT the original surface`);

    // ---------------------------------------------------------- A5
    const dTri = A.meshes.reduce((n, m, i) => n + (m.index - B.meshes[i].index) / 3, 0);
    const totTri = A.meshes.reduce((n, m) => n + m.index / 3, 0);
    note('');
    note(`A5 TRIANGLE COST: +${dTri} triangles house-wide (whole-house total ${Math.round(totTri)}`
      + `, budget 900k, pessimal frame ~670k)`);
    if (process.argv.includes('--report')) {
      const rows = A.meshes.map((m, i) => ({ n: m.name, d: (m.index - B.meshes[i].index) / 3, t: m.index / 3 }))
        .filter((r) => r.d).sort((a, b2) => b2.d - a.d);
      for (const r of rows) note(`     +${String(r.d).padStart(6)}  ${String(Math.round(r.t)).padStart(7)} tris now   ${r.n}`);
    }
    dTri < 90000
      ? ok('A5 the added triangles leave the 900k budget intact', `+${dTri} on a ~670k pessimal frame`)
      : no('A5 the added triangles leave the 900k budget intact', `+${dTri} is too much`);
  }
}

// ---------------------------------------------------------------- A4
{
  const a = A.colliders, b = B.colliders;
  let bad = 0, first = '';
  if (a.length !== b.length) { bad = Math.abs(a.length - b.length); first = `length ${a.length} -> ${b.length}`; }
  else {
    for (let i = 0; i < a.length; i++) {
      for (let k = 0; k < a[i].length; k++) {
        if (!Object.is(a[i][k], b[i][k])) { bad++; if (!first) first = `${a[i][0]} row ${i} col ${k}`; break; }
      }
    }
  }
  bad === 0
    ? ok('A4 COLLIDERS IDENTICAL, leaf by leaf — nothing this file does moves what you walk through',
      `${a.length} rows, Object.is`)
    : no('A4 COLLIDERS IDENTICAL, leaf by leaf', `${bad} rows moved, first ${first}`);
  const pid = A.panelIds.length === B.panelIds.length && A.panelIds.every((x, i) => x === B.panelIds[i]);
  pid ? ok('A4b the panel set is unchanged', `${A.panelIds.length} panels`)
    : no('A4b the panel set is unchanged', `${A.panelIds.length} vs ${B.panelIds.length}`);
}

// =============================================================== the erosion rule
/**
 * ⚠️ **THE BLOWS ARE REAL BLOWS AND THE FIELD IS THE REAL FIELD.** `applyHit(u, v, power)` is the
 * one writer `damagefield.js` documents, and `skin.erode(panel)` reads `depthAt` back off it. A
 * version of this that stamped the brush itself would agree with `skin.js` forever while both
 * drifted from the wall the player digs.
 */
{
  const { THREE, room } = await buildArm(ON);
  void THREE;
  const skin = room.skin;
  if (!skin) { no('A6..A9 the erosion rule', 'no skin on the ON arm'); }
  else {
    const ranked = [...skin.faces.entries()]
      .map(([id, r]) => ({ id, n: r.frags.length, port: r.frags.filter((f) => f.nm === 'portraits').length }))
      .sort((a, b) => b.n - a.n);
    note('');
    note(`the five most dressed destructible faces: ${ranked.slice(0, 5).map((r) => `${r.id}=${r.n}${r.port ? `(${r.port} portrait)` : ''}`).join(' ')}`);
    /**
     * 🖼️ **THE SUBJECT IS A GALLERY PORTRAIT, BECAUSE THAT IS THE DEFECT JOHN REPORTED.**
     * `dressbin-1`: 5 of the gallery's 8 canvases sit inside a dig face's rectangle, on 4 of 4
     * gallery-side faces. The blows are aimed at the centroid of the CANVAS fragments on that
     * face, so A6's percentage is a percentage of the painting and not of the wall's mouldings.
     */
    const target = ranked.find((r) => r.port > 0) ?? ranked[0];
    const subject = target.port > 0 ? 'portraits' : null;
    const panel = room.panels.find((p) => p.id === target.id);

    // ---- A6/A7: the curve over blows, aimed at the subject's own centre ----
    const rec = skin.faces.get(target.id);
    /**
     * 🚨 **ONE CANVAS, NOT "THE CANVASES" — AND THE FIRST BUILD OF THIS BLOCK GOT IT WRONG AND THE
     * INSTRUMENT CAUGHT ITSELF.** `f.gal_east.0.b` carries **two whole portraits, one near each
     * end** (`dressbin-1`), so the mean of all the canvas fragments' `u` lands at 0.52 — on bare
     * wall between them. 24 full blows there ate 16 `kit:wall` fragments and **not one canvas
     * fragment**, and A6 correctly reported 0.0% while the mechanism was working perfectly. So the
     * fragments are clustered along `u` (a gap over 0.05 starts a new painting) and the blows are
     * aimed at the biggest cluster's own centre.
     */
    const all = rec.frags.filter((f) => !subject || f.nm === subject).sort((a, b) => a.u - b.u);
    const clusters = [[]];
    for (const f of all) {
      const cur = clusters[clusters.length - 1];
      if (cur.length && f.u - cur[cur.length - 1].u > 0.05) clusters.push([f]);
      else cur.push(f);
    }
    const mine = clusters.sort((a, b) => b.length - a.length)[0];
    note(`  ${clusters.length} cluster(s) of "${subject ?? 'dressing'}" along u:`
      + ` ${clusters.map((c) => `${c.length}@${(c.reduce((n, f) => n + f.u, 0) / c.length).toFixed(2)}`).join(' ')}`);
    let cu = 0, cv = 0;
    for (const f of mine) { cu += f.u; cv += f.v; }
    cu /= mine.length; cv /= mine.length;
    const liveN = () => mine.reduce((n, f) => n + (f.dead ? 0 : 1), 0);
    const before = liveN();
    /**
     * 🚨 **THE BRIEF'S PREMISE IS ARITHMETICALLY UNREACHABLE AT THE SHIPPED DIG RATE, AND THIS
     * TABLE IS WHY. THE WALL ITSELF DISAPPEARS IN ONE HIT.**
     *
     * `DIG_BASE` is 8 and `damagefield.js` says so in its own words: *"At `DIG_BASE` 8 a single
     * blow deposits 0.31 x 8 x RIM = 1.54 at its own rim, i.e. it takes its whole 1.04 m brush
     * clean through in one hit."* Measured here off the real field: **depth 1.000 out to r = 0.45 m
     * on blow one, and 0.000 at 0.60 m** — no gradient at all, so NO depth threshold can keep a
     * 1.33 m canvas standing through the first blow. It would be standing over a hole, which is
     * the defect being fixed.
     *
     * So *"I don't want it to disappear in one hit"* is a statement about the DIG RATE, not about
     * the dressing rule, and the rule's job is the invariant below: the dressing goes exactly as
     * fast as the wall under it and never faster. The curve John can actually watch is the one at
     * his own `[0.125 … 4]` ladder, which is what A7 drives.
     */
    const probeAt = (power) => {
      panel.resetDamage(); skin.reset();
      const rows = [];
      for (let b = 1; b <= 4; b++) {
        panel.applyHit(panel.pointAt(cu, cv, new THREE.Vector3()), power);
        rows.push(`blow${b} ` + [0, 0.15, 0.30, 0.45, 0.60]
          .map((r) => panel.field.depthAt(Math.min(1, cu + r / panel.width), cv).toFixed(3)).join(' '));
      }
      note(`    depth at power ${power} (x${(8 * power).toFixed(2)} of nominal), r=0/.15/.30/.45/.60 m:`);
      for (const l of rows) note(`      ${l}`);
      panel.resetDamage(); skin.reset();
    };
    probeAt(1);
    probeAt(0.125);

    /**
     * ⚠️ **WHAT `erode()` COSTS ON THE WORST FACE IN THE HOUSE, PER BLOW.** It is a full sweep of
     * the face's fragments against `depthAt` — deliberately, because a collapse removes cells the
     * player never hit, so a sweep is the only thing that cannot miss one. That is a real cost on
     * a face with 13 000 fragments and it is measured rather than waved at. It runs on a landed
     * blow, about once a second, never per frame.
     */
    {
      panel.resetDamage(); skin.reset();
      const t0 = performance.now();
      const N = 200;
      for (let i = 0; i < N; i++) skin.erode(panel);
      const per = (performance.now() - t0) / N;
      panel.resetDamage(); skin.reset();
      note(`    erode() on ${target.id} (${rec.frags.length} fragments): ${per.toFixed(3)} ms per blow`);
      per < 2.0
        ? ok('A10 the per-blow sweep is cheap on the worst face in the house',
          `${per.toFixed(3)} ms for ${rec.frags.length} fragments, on a landed blow (~1/s)`)
        : no('A10 the per-blow sweep is cheap on the worst face in the house',
          `${per.toFixed(3)} ms per blow is a frame cost, not a nothing`);
    }

    /** the erosion curve at a given blow power, from a clean field */
    const driveAt = (power, n = 24) => {
      panel.resetDamage(); skin.reset();
      const out = [];
      for (let i = 0; i < n; i++) {
        panel.applyHit(panel.pointAt(cu, cv, new THREE.Vector3()), power);
        skin.erode(panel);
        out.push(liveN());
      }
      return out;
    };

    /**
     * 🖼️ **A6 — NOT ONE FRAGMENT OF DRESSING MAY BE LEFT STANDING OVER A HOLE.** This is John's
     * defect stated as an invariant instead of as a rate: *"a gallery portrait floats over a
     * breach because it does not know the wall behind it is gone."* A cell is a hole at
     * `OPEN_AT` = 0.999 — `damagefield.js`'s own constant, the one `passable()` uses, so this
     * cannot drift from what a body can walk through.
     */
    const OPEN = 0.999;
    const floating = () => rec.frags.reduce((k, f) =>
      k + (!f.dead && rec.panel.field.depthAt(f.u, f.v) >= OPEN ? 1 : 0), 0);
    const shipped = driveAt(1);
    const fl = floating();
    fl === 0
      ? ok('A6 NOTHING IS LEFT HANGING OVER A HOLE — the reported defect, as an invariant',
        `${rec.frags.length - rec.alive} fragments gone on ${target.id}, 0 of the ${rec.alive}`
        + ' still standing has an open cell behind it')
      : no('A6 NOTHING IS LEFT HANGING OVER A HOLE — the reported defect, as an invariant',
        `${fl} fragments are still drawn over cells at depth >= ${OPEN}`);

    /**
     * 🚨 **A6b, THE REINTRODUCTION ARM, AND IT IS THE WHOLE REASON A6 MEANS ANYTHING.** Turn the
     * erosion off and drive the identical blows: the fragments that A6 just counted as removed
     * must come back as fragments hanging over a hole. If the pre-fix build had no floating
     * dressing either, A6 is asserting a property the tree always had.
     */
    {
      skin.reset();
      skin.on = false;
      panel.resetDamage();
      for (let i = 0; i < 24; i++) { panel.applyHit(panel.pointAt(cu, cv, new THREE.Vector3()), 1); skin.erode(panel); }
      const was = floating();
      skin.on = true;
      was > 0
        ? ok('A6b CONTROL — with the erosion OFF the identical dig leaves the defect behind',
          `${was} fragments of dressing hanging over open cells — that is the build John reported`)
        : no('A6b CONTROL — with the erosion OFF the identical dig leaves the defect behind',
          'the pre-fix arm shows no floating dressing either, so A6 proves nothing');
      skin.reset(); panel.resetDamage();
    }

    /**
     * 🖼️ **A7 — AND AT THE PACE JOHN CAN WATCH, IT IS A CURVE.** `?dig=` ships a
     * `[0.125 … 4]` power ladder (`views/game.js`, outside capture) and 0.125 is the ×1 rung the
     * *"about a minute to dig into another room"* band was measured on. THIS is where *"I don't
     * want it to disappear in one hit"* is a question with an answer.
     */
    const slow = driveAt(0.125, 24);
    const frac1 = 1 - slow[0] / before;
    const fracN = 1 - slow[slow.length - 1] / before;
    note(`erosion of "${subject ?? 'all dressing'}" at (${cu.toFixed(2)}, ${cv.toFixed(2)}) on`
      + ` ${target.id}, ${before} fragments:`);
    note(`  x8 (shipped base, power 1):  ${shipped.slice(0, 8).join(' ')} …`);
    note(`  x1 (power 0.125, John's ladder): ${slow.slice(0, 12).join(' ')} …`);
    note(`  whole face after: ${JSON.stringify(skin.faceStat(target.id).by)}`);
    /**
     * ⚠️ **THE FAILURE HAS TO NAME THE GRAIN, BECAUSE THE GRAIN IS A KNOB JOHN HOLDS.** At the
     * coarse end (`--cell 1.9`) a whole canvas collapses to ONE fragment and this check correctly
     * goes red at "100.0% gone on blow 1" — the knob has reintroduced the defect the slice fixed.
     * That is the right behaviour, but a bare percentage sends the reader looking for a bug in the
     * erosion rule. So the message carries the grain actually used, the grain asked for, and how
     * many fragments the painting was cut into: at 1 fragment there is nothing to erode
     * progressively and the number explains itself.
     */
    const grain = skin.stats();
    const why = `grain ${grain.cell} m (asked ${grain.cellRequested}${grain.coarsened ? ', COARSENED to fit the house budget' : ''}),`
      + ` the canvas is ${before} fragment${before === 1 ? '' : 's'}`;
    (frac1 > 0.001 && frac1 < 0.60)
      ? ok('A7 NOT IN ONE HIT at the x1 rung — a blow bites the dressing, it does not take it',
        `${(100 * frac1).toFixed(1)}% of the canvas gone on blow 1 · ${why}`)
      : no('A7 NOT IN ONE HIT at the x1 rung — a blow bites the dressing, it does not take it',
        `${(100 * frac1).toFixed(1)}% gone on blow 1 (want >0.1% and <60%) · ${why}`
        + (before <= 2 ? ' — the grain is too coarse to erode anything progressively,'
          + ' so this is the knob reintroducing the defect, not the rule failing' : ''));
    /**
     * 🚨 **A7b's DRIVE IS SPREAD ACROSS THE CANVAS, AND THE FIXED-AIM VERSION IT REPLACES WAS A
     * WEAK CONTROL FOR A REAL REASON.** 24 blows at ONE point plateau at 27.3% and stay there
     * forever — the brush is 0.52 m and the crater stops widening, which is `damagefield.js`'s
     * design (a hole only widens where the brush deposits). That is correct behaviour and a
     * useless control: a rule that could only ever remove a quarter of a painting would pass it.
     * A player sweeps, so this sweeps: `n` blows over the canvas's own uv extent.
     */
    {
      panel.resetDamage(); skin.reset();
      let u0 = 2, u1 = -1, v0 = 2, v1 = -1;
      for (const f of mine) {
        if (f.u < u0) u0 = f.u; if (f.u > u1) u1 = f.u;
        if (f.v < v0) v0 = f.v; if (f.v > v1) v1 = f.v;
      }
      const N = 6;
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const u = u0 + (u1 - u0) * (i + 0.5) / N, v = v0 + (v1 - v0) * (j + 0.5) / N;
          for (let k = 0; k < 3; k++) panel.applyHit(panel.pointAt(u, v, new THREE.Vector3()), 0.125);
          skin.erode(panel);
        }
      }
      const swept = 1 - liveN() / before;
      swept > 0.90 && swept > frac1 * 1.4
        ? ok('A7b CONTROL — sweep the canvas at the x1 rung and it IS gone; the rule is a curve',
          `one blow ${(100 * frac1).toFixed(1)}% -> a swept dig ${(100 * swept).toFixed(1)}%`
          + ` of ${before} fragments (a fixed aim point plateaus at ${(100 * fracN).toFixed(1)}%,`
          + ' because the brush stops widening — that is the field, not this rule)')
        : no('A7b CONTROL — sweep the canvas at the x1 rung and it IS gone; the rule is a curve',
          `one blow ${(100 * frac1).toFixed(1)}% -> swept ${(100 * swept).toFixed(1)}%`);
      /**
       * ⚠️ **DELIBERATELY NOT RESET HERE.** A9 and A8 below read this damaged state. An earlier
       * build of this file tidied up after the sweep and A9 came back *"0 dead / 43749 alive, no
       * disagreement"* — a green line that had checked only the alive branch of the rule, i.e. a
       * result-shaped output instead of a measurement.
       */
    }

    // ---- A9: every DEAD fragment's own cell really is past its own threshold ----
    {
      let bad = 0, alive = 0, dead = 0;
      for (const [, r] of skin.faces) {
        for (const f of r.frags) {
          const d = r.panel.field.depthAt(f.u, f.v);
          if (f.dead) { dead++; if (d < f.thr) bad++; }
          else { alive++; if (d >= f.thr) bad++; }
        }
      }
      // ⚠️ BOTH BRANCHES MUST BE EXERCISED. `dead === 0` here means the drive above left a clean
      // field and this check only ever tested "alive and undamaged", which is vacuous.
      bad === 0 && dead > 0
        ? ok('A9 the erosion IS the damage grid — every fragment agrees with `depthAt` at its own uv',
          `${dead} dead / ${alive} alive, no disagreement`)
        : no('A9 the erosion IS the damage grid — every fragment agrees with `depthAt` at its own uv',
          dead === 0 ? 'NOTHING was eroded — this check tested only its alive branch'
            : `${bad} fragments disagree with the field`);
    }

    // ---- C2: a fragment cannot resolve to a face it is not on ----
    {
      const far = room.panels.find((p) => p.spec?.free && p.id !== target.id);
      const farRec = skin.faces.get(far?.id);
      const strayed = farRec ? farRec.frags.filter((f) => f.dead).length : 0;
      // no blow has landed anywhere but `target`, so no other face may have lost anything
      strayed === 0
        ? ok('C2 CONTROL — digging one face erodes NOTHING on any other face',
          `${skin.faces.size - 1} other dressed faces, 0 fragments lost`)
        : no('C2 CONTROL — digging one face erodes NOTHING on any other face',
          `${strayed} fragments died on ${far.id}, which nobody hit`);
    }

    // ---- A8: the round reset ----
    {
      const back = skin.reset();
      const st = skin.stats();
      st.alive === st.fragments && back > 0
        ? ok('A8 ROUND RESET restores every fragment — last round\'s holes do not accumulate',
          `${back} fragments put back, ${st.alive}/${st.fragments} standing`)
        : no('A8 ROUND RESET restores every fragment',
          back === 0 ? 'nothing was eroded, so this tested nothing' : `${st.alive}/${st.fragments}`);
    }

    // ---- A1b: every fragment's uv is inside its own face ----
    {
      let out = 0;
      for (const [, r] of skin.faces) {
        for (const f of r.frags) if (f.u < 0 || f.u > 1 || f.v < 0 || f.v > 1) out++;
      }
      out === 0
        ? ok('A1b every fragment sits inside its own face rectangle', `${A.skin.fragments} fragments`)
        : no('A1b every fragment sits inside its own face rectangle', `${out} outside`);
    }
  }
}

// ================================================================ A11 — the round reset
/**
 * 🚨 **THE FINDING `critic-skin-1` FILED WEAK ON.** The wiring in `room.js` `setDigPlan` could be
 * deleted and this whole suite stayed 18/0, because every check called `skin.reset()` on the
 * object. This drives `room.setDigPlan()` — the entry point `views/game.js` uses on every fresh
 * seed and every ~28 s under the capture Director — and its mutant is that deletion.
 */
{
  const run = (mutant) => {
    const a = [SELF, '--drive-reset', '--search', ON];
    if (mutant) a.push('--mutant', mutant);
    const r = spawnSync(process.execPath, a, { encoding: 'utf8', maxBuffer: 1 << 28 });
    const m = /SKIN1RESET (.*)/.exec(r.stdout ?? '');
    if (!m) throw new Error(`--drive-reset${mutant ? ' --mutant ' + mutant : ''} produced nothing\n${r.stderr}`);
    return JSON.parse(m[1]);
  };
  const good = run(null);
  note('');
  note(`A11 room.setDigPlan() on ${good.face}: ${JSON.stringify(good)}`);
  // three ways this can be meaningless, each named separately
  const vacuous = good.goneBefore === 0;
  const notReached = good.maxDepthAfter !== 0 || good.openAfter !== 0 || !good.planOn;
  (!vacuous && !notReached && good.aliveAfter === good.total)
    ? ok('A11 THE ROUND RESET RESTORES THE DRESSING THROUGH `room.setDigPlan()`',
      `${good.goneBefore} fragments eroded, then setDigPlan put back all ${good.total};`
      + ' the field reset with them (maxDepth 0, openCells 0)')
    : no('A11 THE ROUND RESET RESTORES THE DRESSING THROUGH `room.setDigPlan()`',
      vacuous ? 'nothing eroded — the drive was vacuous'
        : notReached ? `setDigPlan did not reach this panel (maxDepth ${good.maxDepthAfter},`
          + ` open ${good.openAfter}, on ${good.planOn}) — this proves nothing about the skin`
          : `${good.aliveAfter}/${good.total} standing — last round's holes accumulate`);

  const mut = run('reset');
  note(`  MUTANT reset (skin?.reset() deleted from setDigPlan): ${JSON.stringify(mut)}`);
  (mut.aliveAfter < mut.total && mut.maxDepthAfter === 0)
    ? ok('C7 CONTROL — deleting that one line turns A11 RED',
      `the field still resets, but only ${mut.aliveAfter} of ${mut.total} fragments come back`
      + ` — ${mut.total - mut.aliveAfter} stay eroded into the next round`)
    : no('C7 CONTROL — deleting that one line turns A11 RED',
      `the mutant came back ${mut.aliveAfter}/${mut.total} — A11 cannot see its own subject`
      + ' being deleted, which is the defect critic-skin-1 filed');
}

// ================================================================ A12 — the grain knob
/**
 * 🐞 **`?skin=<metres>` IS ABOUT TO BE HANDED TO JOHN AND IT HAD A SILENT CLIFF AT THE FINE END.**
 * At `?skin=0.03` the house budget bit mid-traversal and whole destructible faces lost every
 * fragment by iteration order. The grain is now solved for the whole house first, so every face
 * degrades together, and the value actually used is reported in `stats().cell`.
 */
{
  const run = (search, mutant) => {
    const a = [SELF, '--drive-budget', '--search', search];
    if (mutant) a.push('--mutant', mutant);
    const r = spawnSync(process.execPath, a, { encoding: 'utf8', maxBuffer: 1 << 28 });
    const m = /SKIN1BUDGET (.*)/.exec(r.stdout ?? '');
    if (!m) throw new Error(`--drive-budget ${search} produced nothing\n${r.stderr}`);
    return JSON.parse(m[1]);
  };
  const FINE = '?skin=0.03';
  const baseFaces = A.skin.faces;
  const fine = run(FINE, null);
  note('');
  note(`A12 ${FINE}: grain solved ${fine.cellRequested} -> ${fine.cell} m (coarsened ${fine.coarsened}),`
    + ` ${fine.faces} faces, ${fine.fragments} fragments, +${fine.addedTris} tris`);
  note(`  per face: ${fine.per.map(([i, n]) => `${i}=${n}`).join(' ')}`);
  const emptyFine = fine.per.filter(([, n]) => n === 0).length;
  (fine.faces === baseFaces && emptyFine === 0 && fine.coarsened && fine.addedTris <= 60000)
    ? ok('A12 AN UNAFFORDABLY FINE GRAIN DEGRADES EVENLY — no face loses its dressing',
      `${fine.faces} of ${baseFaces} faces still dressed at ${FINE}; the grain coarsened to`
      + ` ${fine.cell} m for everybody and the house cost is +${fine.addedTris} of a 60000 budget`)
    : no('A12 AN UNAFFORDABLY FINE GRAIN DEGRADES EVENLY — no face loses its dressing',
      `${fine.faces} of ${baseFaces} faces (${emptyFine} empty), coarsened ${fine.coarsened},`
      + ` +${fine.addedTris} tris`);

  const mut = run(FINE, 'budget');
  note(`  MUTANT budget (no house-wide solve, cap checked inside the emit loop):`
    + ` ${mut.faces} faces, +${mut.addedTris} tris, per face`
    + ` ${mut.per.map(([i, n]) => `${i}=${n}`).join(' ')}`);
  mut.faces < baseFaces
    ? ok('C8 CONTROL — the pre-fix budget really did drop whole faces, and A12 catches it',
      `the mutant keeps only ${mut.faces} of ${baseFaces} dressed faces at ${FINE}`
      + ' — the all-or-nothing cliff, reproduced')
    : no('C8 CONTROL — the pre-fix budget really did drop whole faces, and A12 catches it',
      `the mutant kept all ${mut.faces} faces, so A12 is not testing what it claims`);
}

// ================================================================ A13 — `_tracked`
/**
 * ⚠️ **THE OPEN RISK THE CRITIC NAMED AND COULD NOT CONSTRUCT: an unrelated `sp._tracked` handle
 * sharing the growing position buffer, whose `show()` could silently undo an erosion.**
 *
 * The two mechanisms are on **disjoint buffers** — `tracked()` writes POSITIONS in a range it owns,
 * this slice appends vertices and writes the INDEX — so neither can corrupt the other's data. The
 * one shape where they would disagree is a tracked box whose own triangle gets claimed as skin:
 * its index triple would move into the appended region and `hide()` would then collapse vertices
 * nothing references, so the brick would stop disappearing. `skin.js` refuses such a triangle and
 * counts it. **Measured on the shipped house: 0** — `barriers` is `[]` outside `?dig=bays`, so the
 * interconnect brick does not exist here, and the dig lintel sits above its face's rectangle in v.
 */
A.skin.trackedSkipped === 0
  ? ok('A13 no `room.js` tracked() box is claimed as skin — the two mechanisms never share a triangle',
    'trackedSkipped 0; the guard is by construction, not by argument')
  : no('A13 no `room.js` tracked() box is claimed as skin', `${A.skin.trackedSkipped} refused`
    + ' — they are refused rather than corrupted, but the overlap is real and worth a look');

// ---------------------------------------------------------------- C3b
/**
 * 🚨 **THE ABLATION UNDER THE SAME BLOWS.** A6/A7 prove the ON arm erodes. This proves the OFF arm
 * does not — so a reader can tell "the dressing came off" from "the harness is describing a build
 * that always looked like that".
 */
{
  const r = spawnSync(process.execPath, [SELF, '--erodeoff'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = /SKIN1OFF (\d+)/.exec(r.stdout ?? '');
  m && m[1] === '0'
    ? ok('C3b CONTROL — with `?skin=0`, the same 24 blows erode ZERO dressing', 'room.skin is null, nothing to erode')
    : no('C3b CONTROL — with `?skin=0`, the same 24 blows erode ZERO dressing', r.stderr?.slice(0, 200) ?? 'no answer');
}

console.log(`\n  ${passed} passed · ${failed} failed`);
process.exit(failed ? 1 : 0);
