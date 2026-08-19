/**
 * 🧱 **HOW MANY FACES AND APERTURES DOES `exterior.dress.mortar` COVER — and does taking it off
 * the dig band cost a draw call?**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_mortar1-count.mjs \
 *        --port 5462 --q "seed=s4"
 *
 *   env  SEEDS=s4,s1,s2,s7,s9   run the plan census on each (via `engine.resetRound(seed)`)
 *        STATIONS=a,b,c         where the GEOMETRIC census and the draw-call flip are taken
 *
 * ⚠️ **`--q`, NEVER `--extra`.**
 * ⚠️ **BOTH ARMS ARE PART OF THE RESULT.** Every count here INVERTS between
 * `setSegmentMortar(false)` (shipped) and `setSegmentMortar(true)` (the pre-fix build), so a probe
 * that had stopped reading the scene goes red on one of the two.
 *
 * ---------------------------------------------------------------------------------------------
 * THE QUESTION, AND WHY IT NEEDED AN INSTRUMENT
 * ---------------------------------------------------------------------------------------------
 * `HANDOFF.md` files the mortar patch as covering **two apertures** (`x.ballroom.orangery`,
 * `x.gallery.east`). `walls-perf.md` then found it in front of **dig faces** as well
 * (`exterior.dress.mortar.segment#31` at d 5.292 in front of `f.gal_svc.0.b`, `#38` in front of
 * `f.bal_west.0.a`). `dressbin-1` reported *"8 of 28 free faces"*. Three numbers, none of them
 * taken by the same tool, and the count is what sizes the slice.
 *
 * **MEASURED HERE:** dig faces **10 of 28** on s4 and s1, **6 of 28** on s2/s7/s9 — a per-seed
 * `Binomial(28, DRESS_P.mortar = 0.28)` draw with mean 7.84, so *"8"* is the EXPECTATION and no
 * house has ever had exactly it. Exit apertures **0 of 14 on all five seeds**: HANDOFF's line is
 * STALE, because `dressingRule` (the chained-and-boarded rule) already turned mortar off on every
 * connector. M4 below is what makes that zero a fact about the build rather than about this probe.
 *
 * ---------------------------------------------------------------------------------------------
 * TWO INDEPENDENT METHODS, AND THEY HAVE TO AGREE
 * ---------------------------------------------------------------------------------------------
 *   **PLAN** — `exterior.census().plan`, the module's own per-panel `{chain, seam, boards,
 *   mortar}`. Residency-independent, so it is the HOUSE-WIDE count. Book-keeping, so on its own it
 *   proves nothing about the screen.
 *
 *   **GEOMETRY** — every mesh in the scene whose MATERIAL is `exterior.mortar`, instances expanded
 *   through `instanceMatrix` (⚠️ `--pick` cannot see an `InstancedMesh` at all and every one of
 *   these is one), each slab's eight corners pushed into the PANEL's own frame (`pointAt`,
 *   `normal`, `width`, `height` — the game's numbers, not re-derived ones) and overlapped with the
 *   face rectangle. This is what reaches the GPU.
 *
 * A panel is reported COVERED / CLEAR / UNRESOLVED, never COVERED / not-COVERED: *"nothing is in
 * front of the face"* and *"I could not find the face"* must be distinguishable.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE CONTROLS — every one runs on EVERY run
 * ---------------------------------------------------------------------------------------------
 *   M1  **DISPLACE THE MORTAR 4.000 m IN Y** and re-run the identical search: every COVERED must
 *       become CLEAR, with the SAME number of (panel x slab) lookups. Without it "0 covered" and
 *       "the search stopped running" are the same output.
 *       ⚠️ **1.234 m — `_pris1-groups.mjs` W2's displacement — DOES NOT WORK HERE AND THAT IS
 *       REPORTED, NOT HIDDEN.** W2 compares MATRICES, where any displacement fails the match; this
 *       is an AREA OVERLAP against a face **2.80 m tall**, so a 1.234 m slide still overlaps and
 *       the first build of this file read 9 of 9 still covered. The 1.234 m arm is kept and
 *       asserted as a SENSITIVITY control: the coverage fraction must fall on every covered face.
 *   M2  **DISPLACE THE FACE 1.234 m IN Y** in the face matcher: 0 of N faces may resolve. This is
 *       an exact matrix match, so W2's displacement is the right one, and it is what makes
 *       RESOLVED falsifiable.
 *   M3  **THE `boards` POPULATION IS FOUND BY THE SAME SEARCH** and is a DIFFERENT set. A search
 *       that can only ever find ten things would report ten either way.
 *   M4  **`setDressRule(false)` PUTS MORTAR BACK ON CONNECTORS.** Without it, "0 apertures wear
 *       mortar" is indistinguishable from "this probe cannot see a connector's mortar at all".
 *       Restored to the shipped arm afterwards and re-asserted.
 *   M5  **PLAN AND GEOMETRY AGREE** at every station: nothing is covered whose plan says no mortar.
 *   M6  **THE FIX'S OWN ARM.** `setSegmentMortar(true)` must put every one of them back, in place,
 *       in one page — and `setSegmentMortar(false)` must take them off again. A fix that reads 0
 *       because the probe went blind fails this.
 *   M7  **DRAW CALLS, FLIPPED IN PLACE AT ONE STATION, NEVER ACROSS TWO WALKS** (`dressbin-1`:
 *       `ballroom.centre` read 423/461/479 on one build across a walk). Removing geometry must not
 *       cost calls — an arm that could only REMOVE geometry once read +49 on this project.
 */

const STATIONS = (process.env.STATIONS ?? [
  'gallery.mid', 'study_w.south', 'service.mid',
  'study_e.south', 'ballroom.centre', 'chapel.centre',
].join(',')).split(',').filter(Boolean);

const SEEDS = (process.env.SEEDS ?? 's4,s1,s2,s7,s9').split(',').filter(Boolean);

/** Inlined into every `page.evaluate` — the page has no closure over this module. */
const PAGE = `
  const E = () => window.__rrr.engine;
  const V3 = () => E().camera.position.constructor;
  const M4 = () => E().camera.matrixWorld.constructor;

  /** Every slab of a given MATERIAL name in the draw set, instances expanded, 8 world corners. */
  const slabsOf = (matName, dy) => {
    const e = E(), Vec = V3(), Mat = M4();
    const out = [];
    let meshes = 0;
    e.scene.traverse((o) => {
      if (!o.isMesh) return;
      if ((o.material && o.material.name) !== matName) return;
      meshes++;
      let vis = true;
      for (let q = o; q; q = q.parent) if (q.visible === false) vis = false;
      const g = o.geometry;
      if (!g || !g.attributes || !g.attributes.position) return;
      if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox;
      const push = (m, label) => {
        const pts = [];
        for (const x of [bb.min.x, bb.max.x]) {
          for (const y of [bb.min.y, bb.max.y]) {
            for (const z of [bb.min.z, bb.max.z]) {
              const p = new Vec(x, y, z).applyMatrix4(m);
              if (dy) p.y += dy;
              pts.push(p);
            }
          }
        }
        out.push({ label, drawn: vis, pts });
      };
      if (o.isInstancedMesh) {
        const a = o.instanceMatrix.array;
        for (let i = 0; i < o.count; i++) {
          // the HIDE matrix is makeScale(0,0,0): column 0 is exactly zero
          if (Math.hypot(a[i * 16], a[i * 16 + 1], a[i * 16 + 2]) < 1e-6) continue;
          push(new Mat().fromArray(a, i * 16).premultiply(o.matrixWorld), (o.name || '?') + '#' + i);
        }
        return;
      }
      push(o.matrixWorld, o.name || '?');
    });
    return { out, meshes };
  };

  /**
   * Is this panel's own FACE in the draw set? Either it draws its own layer planes, or a shared
   * \`wall.pristine.face*\` instance carries its world matrix. \`dyFace\` displaces the QUERY, which
   * is what makes "resolved" falsifiable (M2).
   */
  const faceSlots = () => {
    const e = E(), slots = [];
    e.scene.traverse((o) => {
      if (!o.isInstancedMesh) return;
      if (!String(o.name || '').startsWith('wall.pristine.face')) return;
      let vis = true;
      for (let q = o; q; q = q.parent) if (q.visible === false) vis = false;
      if (!vis) return;
      const a = o.instanceMatrix.array;
      for (let i = 0; i < o.count; i++) {
        if (Math.hypot(a[i * 16], a[i * 16 + 1], a[i * 16 + 2]) < 1e-6) continue;
        slots.push({ a, off: i * 16, name: (o.name || '?') + '#' + i });
      }
    });
    return slots;
  };

  const resolve = (p, slots, dyFace) => {
    let own = 0;
    if (p.root && p.root.visible && p.layers) for (const l of p.layers) if (l.visible) own++;
    const q = p.root.matrixWorld.elements.slice();
    q[13] += (dyFace || 0);
    let inst = 0, lookups = 0;
    for (const s of slots) {
      lookups++;
      let ok = true;
      for (let k = 0; k < 16; k++) { if (Math.abs(s.a[s.off + k] - q[k]) > 1e-4) { ok = false; break; } }
      if (ok) inst++;
    }
    return { own: dyFace ? 0 : own, inst, lookups };
  };

  /** Overlap of one slab with one panel's face rectangle, in the PANEL's own frame. */
  const cover = (p, slab) => {
    const Vec = V3();
    const c = p.pointAt(0.5, 0.5);
    const cu = p.pointAt(1, 0.5), cv = p.pointAt(0.5, 1);
    const right = new Vec(cu.x - c.x, cu.y - c.y, cu.z - c.z).normalize();
    const up = new Vec(cv.x - c.x, cv.y - c.y, cv.z - c.z).normalize();
    const n = p.normal;
    const N = new Vec(n.x, n.y, n.z).normalize();
    const hw = p.width / 2, hh = p.height / 2;
    let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9, d0 = 1e9, d1 = -1e9;
    for (const q of slab.pts) {
      const dx = q.x - c.x, dy = q.y - c.y, dz = q.z - c.z;
      const A = dx * right.x + dy * right.y + dz * right.z;
      const B = dx * up.x + dy * up.y + dz * up.z;
      const D = dx * N.x + dy * N.y + dz * N.z;
      if (A < a0) a0 = A; if (A > a1) a1 = A;
      if (B < b0) b0 = B; if (B > b1) b1 = B;
      if (D < d0) d0 = D; if (D > d1) d1 = D;
    }
    // within 0.30 m of the face plane — the wall band's own thickness; further is another wall
    if (d0 > 0.30 || d1 < -0.30) return null;
    const ov = Math.max(0, Math.min(a1, hw) - Math.max(a0, -hw))
             * Math.max(0, Math.min(b1, hh) - Math.max(b0, -hh));
    const frac = ov / Math.max(1e-9, p.width * p.height);
    if (frac <= 0.01) return null;
    return { frac, d0, d1 };
  };

  const planCount = () => {
    const e = E();
    const cen = e.exterior.census();
    const byId = new Map(cen.plan.map((q) => [q.id, q]));
    const out = { dig: 0, aperture: 0, interior: 0, ids: [] };
    for (const p of e.room.panels) {
      if (!(byId.get(p.id) || {}).mortar) continue;
      out[(p.spec && p.spec.dig) ? 'dig' : e.exterior.sites.has(p.id) ? 'aperture' : 'interior']++;
      out.ids.push(p.id);
    }
    return out;
  };
`;

export default async function mortar1count({ page, note, pass, fail, skip }) {
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 150; i++) {
      await page.waitForTimeout(40);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  const evalPage = (body) => page.evaluate(`(() => {\n${PAGE}\n${body}\n})()`);

  /** The whole geometric census, at whatever state the page is in. */
  const censusAt = (dyMortar, dyFace, matName) => evalPage(`
    const dyM = ${JSON.stringify(dyMortar)}, dyF = ${JSON.stringify(dyFace)};
    const mat = ${JSON.stringify(matName)};
    const e = E();
    const S = slabsOf(mat, dyM);
    const slabs = S.out;
    const slots = faceSlots();
    const rows = [];
    let lookups = 0, resolvedN = 0, coveredN = 0, unresolvedN = 0;
    for (const p of e.room.panels) {
      const res = resolve(p, slots, dyF);
      const isResolved = (res.own > 0 || res.inst > 0);
      let best = null;
      for (const s of slabs) {
        lookups++;
        const c = cover(p, s);
        if (!c) continue;
        if (!best || c.frac > best.frac) best = { label: s.label, drawn: s.drawn, frac: c.frac, d0: c.d0, d1: c.d1 };
      }
      const verdict = !isResolved ? 'UNRESOLVED' : (best ? 'COVERED' : 'CLEAR');
      if (verdict === 'UNRESOLVED') unresolvedN++; else resolvedN++;
      if (verdict === 'COVERED') coveredN++;
      if (best) {
        rows.push({ id: p.id, dig: !!(p.spec && p.spec.dig), site: e.exterior.sites.has(p.id),
          verdict, own: res.own, inst: res.inst,
          frac: +best.frac.toFixed(3), d0: +best.d0.toFixed(4), d1: +best.d1.toFixed(4),
          label: best.label, drawn: best.drawn });
      }
    }
    return { slabs: slabs.length, meshes: S.meshes, slots: slots.length, lookups,
      resolvedN, unresolvedN, coveredN, rows };
  `);

  const setArm = (on) => evalPage(`
    const e = E();
    const now = e.exterior.setSegmentMortar(${on ? 'true' : 'false'});
    return { arm: now, plan: planCount() };
  `);

  // ------------------------------------------------------------------ 0. the population
  const head = await evalPage(`
    const e = E();
    const x = e.exterior;
    if (!x || !x.census) return { err: 'no exterior' };
    if (typeof x.setSegmentMortar !== 'function') return { err: 'no setSegmentMortar — stale build' };
    const cen = x.census();
    const byId = new Map(cen.plan.map((r) => [r.id, r]));
    const rows = e.room.panels.map((p) => ({
      id: p.id,
      dig: !!(p.spec && p.spec.dig),
      site: x.sites.has(p.id),
      room: ((p.ownerSpace && p.ownerSpace.root && p.ownerSpace.root.name) || '').slice(6)
        || ((p.spec && p.spec.a) || '?'),
      w: +p.width.toFixed(3), h: +p.height.toFixed(3),
      mortar: !!(byId.get(p.id) || {}).mortar,
    }));
    return { seed: String(e.run.seed), tells: x.tells, rule: cen.dressRule,
      segMortar: cen.segMortar, panels: rows, families: cen.dressFamilies };
  `);
  if (head.err) { fail('the exterior module is present and carries the fix', head.err); return; }

  const classify = (r) => (r.dig ? 'dig' : r.site ? 'aperture' : 'interior');
  const totals = { dig: 0, aperture: 0, interior: 0 };
  for (const r of head.panels) totals[classify(r)]++;
  note(`seed "${head.seed}" · tells=${head.tells} · dressRule=${head.rule}`
    + ` · segMortar=${head.segMortar} · families ${JSON.stringify(head.families)}`);
  note(`the house: ${head.panels.length} panels — dig faces ${totals.dig}`
    + ` · exit apertures ${totals.aperture} · interior connectors ${totals.interior}`);

  // ------------------------------------------------------------------ 1. the seed sweep, BOTH arms
  const sweep = [];
  for (const s of SEEDS) {
    const r = await evalPage(`
      const e = E();
      e.resetRound(${JSON.stringify(s)});
      e.exterior.setSegmentMortar(false);
      const off = planCount();
      e.exterior.setSegmentMortar(true);
      const on = planCount();
      e.exterior.setSegmentMortar(false);
      return { seed: String(e.run.seed), off, on };
    `);
    await step(4);
    sweep.push(r);
    note(`  seed ${String(r.seed).padEnd(6)} — PLAN mortar, SHIPPED: dig ${r.off.dig}`
      + ` · aperture ${r.off.aperture} · interior ${r.off.interior}`
      + `   |  PRE-FIX (segmortar=1): dig ${r.on.dig} · aperture ${r.on.aperture}`
      + ` · interior ${r.on.interior}`);
  }
  await evalPage(`E().resetRound(${JSON.stringify(head.seed)}); E().exterior.setSegmentMortar(false); return 1;`);
  await step(10);

  // ------------------------------------------------------------------ 2. the geometric census
  const parked = [];
  for (const name of STATIONS) {
    const ok = await page.evaluate((n) => {
      const e = window.__rrr.engine;
      const a = e.room.anchor(n);
      if (!a) return false;
      e.player.pos.set(a.x, e.room.floorY, a.z);
      e.player.vel.set(0, 0, 0);
      e.cam._first = true;
      return true;
    }, name);
    if (!ok) { note(`no anchor named ${name}`); continue; }
    await step(40);

    // --- shipped arm ------------------------------------------------------
    await setArm(false); await step(6);
    const off = await censusAt(0, 0, 'exterior.mortar');
    const ctlF = await censusAt(0, 1.234, 'exterior.mortar');
    const board = await censusAt(0, 0, 'exterior.board');

    // --- the pre-fix arm, FLIPPED IN PLACE at this same station -----------
    await setArm(true); await step(6);
    const on = await censusAt(0, 0, 'exterior.mortar');
    const ctlM4 = await censusAt(4.000, 0, 'exterior.mortar');
    const ctlM12 = await censusAt(1.234, 0, 'exterior.mortar');

    /**
     * 🚨 **THREE PAIRED FLIPS, MEDIANS, AND A SAME-ARM REPEAT SPREAD — because a SINGLE reading
     * of `info.render.calls` moved ±1 here and the whole effect is ±1.** The first build of this
     * file read the counter once per arm and would have claimed a −1 that its own flip-back
     * residual (0 · 0 · 0 · −1 · +1 · 0) could not tell from noise. `dressCalls` is the
     * module's own per-frame submission count and IS deterministic, so it is read beside the
     * renderer's and the two have to agree on the direction.
     */
    const rep = [];
    for (let k = 0; k < 3; k++) {
      await setArm(false); await step(5);
      const a = await page.evaluate(() => ({ calls: window.__rrr.engine.renderer.info.render.calls,
        dress: window.__rrr.engine.exterior.census().dressCalls }));
      await setArm(true); await step(5);
      const b = await page.evaluate(() => ({ calls: window.__rrr.engine.renderer.info.render.calls,
        dress: window.__rrr.engine.exterior.census().dressCalls }));
      rep.push({ off: a, on: b });
    }
    await setArm(false); await step(6);
    const med = (xs) => xs.slice().sort((x, y) => x - y)[Math.floor(xs.length / 2)];
    const offCalls = rep.map((r) => r.off.calls), onCalls = rep.map((r) => r.on.calls);
    const callsOff = med(offCalls), callsOn = med(onCalls);
    const spreadOff = Math.max(...offCalls) - Math.min(...offCalls);
    const spreadOn = Math.max(...onCalls) - Math.min(...onCalls);
    const dressOff = med(rep.map((r) => r.off.dress)), dressOn = med(rep.map((r) => r.on.dress));

    parked.push({ name, off, on, ctlF, board, ctlM4, ctlM12,
      callsOff, callsOn, spreadOff, spreadOn, dressOff, dressOn, offCalls, onCalls });

    note(`${name.padEnd(16)} SHIPPED covered ${off.coveredN} (slabs drawn ${off.slabs})`
      + ` · PRE-FIX covered ${on.coveredN} (slabs ${on.slabs})`
      + ` · faces resolved ${off.resolvedN}/${off.resolvedN + off.unresolvedN}`);
    note(`${' '.repeat(16)}   calls SHIPPED ${offCalls.join('/')} → median ${callsOff}`
      + ` · PRE-FIX ${onCalls.join('/')} → median ${callsOn}`
      + ` · exterior dressCalls ${dressOff} vs ${dressOn}`);
    note(`${' '.repeat(16)}   [M1 +4.000m: ${ctlM4.coveredN} covered, ${ctlM4.lookups} lookups]`
      + `   [M1b +1.234m: ${ctlM12.coveredN}]`
      + `   [M2 face+1.234m: ${ctlF.resolvedN} resolved]  [M3 boards: ${board.coveredN}]`);
    for (const r of on.rows.filter((q) => q.verdict === 'COVERED')) {
      note(`    PRE-FIX COVERED ${r.id.padEnd(20)} ${classify(r).padEnd(8)}`
        + ` ${(r.frac * 100).toFixed(1)}% of the face · slab at ${r.d0} .. ${r.d1} m · ${r.label}`);
    }
    for (const r of off.rows.filter((q) => q.verdict === 'COVERED')) {
      note(`    ⚠️ STILL COVERED ON THE SHIPPED ARM ${r.id} ${(r.frac * 100).toFixed(1)}% ${r.label}`);
    }
  }

  if (!parked.length) { fail('a geometric census was taken', 'no station could be parked'); return; }

  const union = (key) => {
    const m = new Map();
    for (const p of parked) for (const r of p[key].rows) if (r.verdict === 'COVERED') m.set(r.id, r);
    return m;
  };
  const uOff = union('off'), uOn = union('on');
  const tallyOf = (m) => {
    const t = { dig: 0, aperture: 0, interior: 0 };
    for (const r of m.values()) t[classify(r)]++;
    return t;
  };
  const tOff = tallyOf(uOff), tOn = tallyOf(uOn);
  note('');
  note(`GEOMETRY, union over ${parked.length} stations — faces with a mortar slab across them:`);
  note(`  SHIPPED  dig ${tOff.dig} · aperture ${tOff.aperture} · interior ${tOff.interior}`);
  note(`  PRE-FIX  dig ${tOn.dig} · aperture ${tOn.aperture} · interior ${tOn.interior}`);

  // ------------------------------------------------------------------ 3. M4 — the connector arm
  const m4 = await evalPage(`
    const e = E();
    e.exterior.setDressRule(false);
    const off = planCount();
    e.exterior.setDressRule(true);
    const on = planCount();
    return { off, on, rule: e.exterior.dressRule };
  `);
  await step(6);
  note('');
  note(`M4 — dressRule OFF: mortar planned on dig ${m4.off.dig} · aperture ${m4.off.aperture}`
    + ` · interior ${m4.off.interior}   |   restored ON: dig ${m4.on.dig}`
    + ` · aperture ${m4.on.aperture} · interior ${m4.on.interior}`);

  // ------------------------------------------------------------------ the assertions
  const worstM1 = Math.max(...parked.map((p) => p.ctlM4.coveredN));
  const lookupsSame = parked.every((p) => p.ctlM4.lookups === p.on.lookups);
  (worstM1 === 0 && lookupsSame)
    ? pass('M1 CONTROL — the identical search finds NOTHING with the mortar displaced 4.000 m in Y',
      `0 covered at every station on the PRE-FIX arm, ${parked[0].ctlM4.lookups} lookups either way`)
    : fail('M1 CONTROL — the identical search finds NOTHING with the mortar displaced 4.000 m in Y',
      `worst ${worstM1} still covered, lookups equal: ${lookupsSame}`);

  const sens = parked.every((p) => {
    const before = new Map(p.on.rows.map((r) => [r.id, r.frac]));
    return p.ctlM12.rows.every((r) => r.frac < (before.get(r.id) ?? 0) - 1e-6)
      && p.ctlM12.coveredN <= p.on.coveredN;
  });
  sens
    ? pass('M1b SENSITIVITY — a 1.234 m slide REDUCES every coverage fraction',
      'the overlap statistic tracks the geometry rather than latching')
    : fail('M1b SENSITIVITY — a 1.234 m slide REDUCES every coverage fraction',
      'a displaced slab reports the same coverage — the overlap is not being recomputed');

  const worstM2 = Math.max(...parked.map((p) => p.ctlF.resolvedN));
  worstM2 === 0
    ? pass('M2 CONTROL — no face resolves when the query matrix is displaced 1.234 m in Y',
      `0 of ${parked[0].off.resolvedN + parked[0].off.unresolvedN} at every station`)
    : fail('M2 CONTROL — no face resolves when the query matrix is displaced 1.234 m in Y',
      `${worstM2} faces still "resolved" — RESOLVED is unfalsifiable and every count above is void`);

  const boards = new Set();
  for (const p of parked) for (const r of p.board.rows) if (r.verdict === 'COVERED') boards.add(r.id);
  const differs = [...boards].some((id) => !uOn.has(id)) || [...uOn.keys()].some((id) => !boards.has(id));
  (boards.size > 0 && differs)
    ? pass('M3 CONTROL — the identical search finds the boards, and they are a DIFFERENT set',
      `${boards.size} faces carry boards against ${uOn.size} carrying mortar on the pre-fix arm`)
    : fail('M3 CONTROL — the identical search finds the boards, and they are a DIFFERENT set',
      `boards ${boards.size}, mortar ${uOn.size} — the search may be finding a constant`);

  (m4.off.aperture + m4.off.interior) > 0 && (m4.on.aperture + m4.on.interior) === 0
    ? pass('M4 CONTROL — with the chained-and-boarded rule OFF, connectors DO wear mortar',
      `${m4.off.aperture} apertures + ${m4.off.interior} interior connectors, back to`
      + ` ${m4.on.aperture}+${m4.on.interior} on the shipped arm — so "0 apertures" is the BUILD`)
    : fail('M4 CONTROL — with the chained-and-boarded rule OFF, connectors DO wear mortar',
      `off ${m4.off.aperture}+${m4.off.interior}, on ${m4.on.aperture}+${m4.on.interior}`);

  const planned = new Map(head.panels.map((r) => [r.id, r]));
  const falsePos = [...uOn.keys()].filter((id) => !planned.has(id)).length;
  falsePos === 0
    ? pass('M5 — every geometrically covered face is a real panel the module knows about',
      `${uOn.size} covered on the pre-fix arm, all of them in room.panels`)
    : fail('M5 — every geometrically covered face is a real panel the module knows about',
      `${falsePos} covered ids are not panels`);

  const armWorks = tOn.dig > 0 && tOff.dig === 0 && tOff.aperture === 0 && tOff.interior === 0;
  armWorks
    ? pass('M6 — THE FIX: the dig band wears no mortar, and the arm puts it straight back',
      `SHIPPED ${tOff.dig} dig faces covered · PRE-FIX ${tOn.dig}, flipped in place in one page`)
    : fail('M6 — THE FIX: the dig band wears no mortar, and the arm puts it straight back',
      `SHIPPED dig ${tOff.dig}/ap ${tOff.aperture}/int ${tOff.interior} · PRE-FIX dig ${tOn.dig}`);

  const dCalls = parked.map((p) => p.callsOff - p.callsOn);
  const dDress = parked.map((p) => p.dressOff - p.dressOn);
  const spread = Math.max(...parked.map((p) => Math.max(p.spreadOff, p.spreadOn)));
  note('');
  note(`M7 draw calls, per station, SHIPPED minus PRE-FIX: ${dCalls.join(' · ')}`
    + `   · exterior dressCalls delta ${dDress.join(' · ')}`
    + `   · worst same-arm repeat spread ${spread}`);
  const worstD = Math.max(...dCalls);
  const dressAgrees = dDress.every((d, i) => (d <= 0) && (d <= 0 ? dCalls[i] <= 0 : true));
  (worstD <= 0 && dressAgrees)
    ? pass('M7 — taking the mortar off the dig band costs NO draw calls, flipped in place at ONE station',
      `worst SHIPPED-minus-PRE-FIX ${worstD} calls over ${parked.length} stations (three paired`
      + ` flips each, medians); the module's own deterministic dressCalls agrees: ${dDress.join('/')}`)
    : fail('M7 — taking the mortar off the dig band costs NO draw calls, flipped in place at ONE station',
      `worst SHIPPED-minus-PRE-FIX ${worstD}, dressCalls delta ${dDress.join('/')}`);

  const budget = Math.max(...parked.map((p) => Math.max(p.callsOff, p.callsOn)));
  budget <= 625
    ? pass('and every arm fits the 625 draw-call budget at these stations', `worst ${budget}`)
    : fail('and every arm fits the 625 draw-call budget at these stations', `worst ${budget}`);

  note('');
  note(`THE COUNT, before the fix: mortar covered ${sweep[0].on.dig} of ${totals.dig} dig faces on`
    + ` seed "${sweep[0].seed}", ${sweep[0].on.aperture} of ${totals.aperture} exit apertures and`
    + ` ${sweep[0].on.interior} of ${totals.interior} interior connectors.`);
  note(`Across ${sweep.length} seeds the pre-fix dig-face count runs`
    + ` ${sweep.map((r) => r.on.dig).join('/')} and the aperture count`
    + ` ${sweep.map((r) => r.on.aperture).join('/')} — Binomial(${totals.dig}, 0.28), mean`
    + ` ${(totals.dig * 0.28).toFixed(2)}. HANDOFF's "two apertures" is stale (see M4).`);
  void skip;
}
