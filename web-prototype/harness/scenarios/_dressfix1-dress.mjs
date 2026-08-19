/**
 * 🚪 **IS THE DOOR A STANDARD SIZE? — `dressfix-1`, 2026-08-15.**
 *
 * John, on a generated house: *"one of the screenshots had a big slab with a chain X across it. it
 * looks weird. **actual doors should be a standard size**."*
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_dressfix1-dress.mjs \
 *        --port 5511 --q "plan=gen&planseed=3&seed=s4"
 *
 *   env  FACES=n     how many of the widest chained free faces to park at (default 2)
 *
 * ⚠️ `--q`, NEVER `--extra`. ⚠️ `?plan=gen&planseed=N` is the generated house; `?estate=gen` is a
 * live defect that turns the whole art port off.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IS MEASURED, AND IT IS NOT A DIVISION
 * ---------------------------------------------------------------------------------------------
 * Every `exterior.dress.*` mesh is an `InstancedMesh` — **`--pick` cannot see one at all** — so
 * each instance is expanded through `instanceMatrix`, its geometry's bounding box pushed to eight
 * world corners, and the answer read as a WORLD EXTENT in metres. Nothing here divides `p.width`
 * by an aperture; that arithmetic is the thing under test.
 *
 * Each placed instance is also ATTRIBUTED: its world centre must land within 1.5 m of
 * `room.panels[i]`'s own origin, or it is reported UNRESOLVED rather than counted. Index-to-panel
 * is an assumption about how `buildDressing` fills its slots, and an assumption that is never
 * checked is how a probe ends up describing the wrong wall.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE CONTROLS — every one runs on EVERY run
 * ---------------------------------------------------------------------------------------------
 *   **X1  THE DEFECT ARM.** `setDressFixed(false)` must put a chain across the whole wall again,
 *         in place, in one page, and `setDressFixed(true)` must take it straight back off. A
 *         census that reads "2.15 m everywhere" because it went blind fails this.
 *   **X2  THE SEARCH IS NOT A CONSTANT.** The same expansion is run for `chain` and for `boards`
 *         and they are DIFFERENT populations with DIFFERENT authored widths. A search that can
 *         only ever return one number would return it twice.
 *   **X3  A BOGUS MESH PREFIX RETURNS NOTHING**, with the same traversal and the same instance
 *         count logic. "No oversized instance" and "no instance found" must not look the same.
 *   **X4  CONNECTORS DO NOT MOVE.** The connector family's drawn widths must be BYTE-EQUAL on
 *         both arms — the fix is on dig faces only, and the orangery's judged 1.54x stretch is
 *         deliberately left alone.
 *   **X5  `mortar-1`'s FIX SURVIVES.** No free face may wear mortar, and `setSegmentMortar(true)`
 *         must put it back — the aperture the mortar slab is authored at is exactly what this
 *         slice changed, so a silent regression there is the obvious collateral.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT ASSERTS
 * ---------------------------------------------------------------------------------------------
 *   D1  no dressing instance on a free dig face is drawn wider than **2.40 m** — the standard
 *       door plus the chain's own overhang (authored geo: chain 2.154, boards 2.174, seam 2.34).
 *   D2  …and it is drawn at its geometry's own authored width, within 1 mm — scale exactly 1.
 *   D3  the faces it is drawn on really are walls: at least one is over 6 m wide, so D1 is a
 *       statement about a stretch that had somewhere to go.
 *   D4  draw calls, flipped in place at ONE station, three paired flips, medians.
 *   D5  the whole frame stays inside the 625 budget.
 */

import { hold, release } from '../still.mjs';

const NFACES = +(process.env.FACES ?? 2);

const PAGE = `
  const E = () => window.__rrr.engine;
  const V3 = () => E().camera.position.constructor;
  const M4 = () => E().camera.matrixWorld.constructor;

  /**
   * Every placed instance of every mesh whose name starts with \`prefix\`, as a WORLD extent,
   * attributed to \`room.panels[i]\`. \`prefix\` is a parameter so X3 can point the identical
   * traversal at a name that does not exist.
   */
  const dressed = (prefix) => {
    const e = E(), Vec = V3(), Mat = M4();
    const rows = [];
    let meshes = 0, placed = 0, unresolved = 0;
    e.scene.traverse((o) => {
      if (!o.isInstancedMesh) return;
      if (!String(o.name || '').startsWith(prefix)) return;
      meshes++;
      const g = o.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox;
      const geoW = bb.max.x - bb.min.x, geoH = bb.max.y - bb.min.y;
      const a = o.instanceMatrix.array;
      for (let i = 0; i < o.count; i++) {
        if (Math.hypot(a[i*16], a[i*16+1], a[i*16+2]) < 1e-6) continue;   // the HIDE matrix
        placed++;
        const m = new Mat().fromArray(a, i*16).premultiply(o.matrixWorld);
        let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9,z0=1e9,z1=-1e9;
        for (const px of [bb.min.x, bb.max.x]) for (const py of [bb.min.y, bb.max.y]) for (const pz of [bb.min.z, bb.max.z]) {
          const q = new Vec(px,py,pz).applyMatrix4(m);
          if (q.x<x0)x0=q.x; if (q.x>x1)x1=q.x; if (q.y<y0)y0=q.y; if (q.y>y1)y1=q.y; if (q.z<z0)z0=q.z; if (q.z>z1)z1=q.z;
        }
        const p = e.room.panels[i];
        const cxw = (x0+x1)/2, czw = (z0+z1)/2;
        const ok = p && Math.hypot(cxw - p.root.position.x, czw - p.root.position.z) < 1.5;
        if (!ok) { unresolved++; continue; }
        rows.push({
          mesh: o.name, i, panel: p.id,
          free: !!(p.spec && p.spec.free), dig: !!(p.spec && p.spec.dig),
          site: !!(e.exterior.sites && e.exterior.sites.has(p.id)),
          pw: +p.width.toFixed(3), ph: +p.height.toFixed(3),
          geoW: +geoW.toFixed(4), geoH: +geoH.toFixed(4),
          span: +Math.max(x1-x0, z1-z0).toFixed(4), tall: +(y1-y0).toFixed(4),
          visible: o.visible,
        });
      }
    });
    return { meshes, placed, unresolved, rows };
  };

  const planOf = () => {
    const e = E(), cen = e.exterior.census();
    const byId = new Map(cen.plan.map((r) => [r.id, r]));
    let freeMortar = 0, freeChain = 0, freeBoards = 0;
    for (const p of e.room.panels) {
      if (!(p.spec && p.spec.free)) continue;
      const d = byId.get(p.id) || {};
      if (d.mortar) freeMortar++;
      if (d.chain) freeChain++;
      if (d.boards) freeBoards++;
    }
    return { freeMortar, freeChain, freeBoards, fixed: cen.dressFixed,
      aperture: cen.dressAperture, families: cen.dressFamilies, dressCalls: cen.dressCalls,
      dressMeshes: cen.dressMeshes, segMortar: cen.segMortar };
  };
`;

export default async function dressfix1({ page, note, pass, fail, skip, snap, SHOTDIR, VIEW }) {
  const evalPage = (body) => page.evaluate(`(() => {\n${PAGE}\n${body}\n})()`);
  const png = (tag) => snap(tag, { path: `${SHOTDIR}/${VIEW}.${tag}.png` });
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 600; i++) {
      await page.waitForTimeout(40);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(400);

  const has = await page.evaluate(() => typeof window.__rrr?.engine?.exterior?.setDressFixed === 'function');
  if (!has) { fail('the build carries the fix', 'exterior.setDressFixed is missing — stale build'); return; }

  /** ⚠️ SIM RUNNING between the flip and the read — `exterior.update()` writes the matrices. */
  const arm = async (on) => { const r = await evalPage(`return E().exterior.setDressFixed(${on});`); await step(8); return r; };

  const head = await evalPage(`
    const e = E();
    const plan = planOf();
    const free = e.room.panels.filter((p) => p.spec && p.spec.free)
      .map((p) => ({ id: p.id, w: +p.width.toFixed(2), h: +p.height.toFixed(2) }))
      .sort((a, b) => b.w - a.w);
    return { search: location.search, seed: String(e.run.seed), plan,
      panels: e.room.panels.length, free: free.length, widest: free.slice(0, 6) };
  `);
  note(`url ${head.search} · seed "${head.seed}" · ${head.panels} panels, ${head.free} free dig faces`);
  note(`families ${JSON.stringify(head.plan.families)} · dressMeshes ${head.plan.dressMeshes}`
    + ` · authored aperture ${JSON.stringify(head.plan.aperture)} · dressFixed=${head.plan.fixed}`);
  note(`widest free faces: ${head.widest.map((f) => `${f.id} ${f.w}x${f.h}`).join(' · ')}`);
  note(`plan on free faces — chain ${head.plan.freeChain} · boards ${head.plan.freeBoards}`
    + ` · mortar ${head.plan.freeMortar} (segMortar=${head.plan.segMortar})`);

  // ------------------------------------------------------------------ pick the stations
  /**
   * ⚠️ **ONE PER OWNING ROOM.** The first build of this file took the two widest faces and both
   * were in the ballroom, so the whole gate ran twice on ONE resident set and read a single placed
   * chain instance each time. Residency is what decides how many instances carry a matrix at all.
   */
  const picks = await evalPage(`
    const e = E();
    const cen = e.exterior.census();
    const byId = new Map(cen.plan.map((r) => [r.id, r]));
    const seen = new Set();
    const rows = e.room.panels
      .filter((p) => p.spec && p.spec.free && (byId.get(p.id) || {}).chain && p.ownerSpace)
      .map((p) => ({ id: p.id, w: p.width, room: p.ownerSpace.id }))
      .sort((a, b) => b.w - a.w)
      .filter((r) => (seen.has(r.room) ? false : (seen.add(r.room), true)));
    return rows.slice(0, ${NFACES}).map((r) => r.id);
  `);
  if (!picks.length) { fail('a chained free dig face exists to park at', 'none in the plan'); return; }
  note(`parking at: ${picks.join(' · ')}`);

  const parked = [];
  for (const FACE of picks) {
    note('');
    note(`──────── ${FACE}`);
    const ok = await page.evaluate((id) => {
      const e = window.__rrr.engine;
      const p = e.room.panels.find((q) => q.id === id);
      if (!p) return { ok: false, why: `no panel ${id}` };
      const home = p.ownerSpace;
      const inSign = home ? p.sideOf({ x: home.cx, y: 0, z: home.cz }) : 1;
      const n = p.normal, c = p.pointAt(0.5, 0.5);
      e.player.pos.set(c.x + n.x * 5.5 * inSign, e.room.floorY, c.z + n.z * 5.5 * inSign);
      e.player.vel.set(0, 0, 0);
      const f = Math.atan2(-n.x * inSign, -n.z * inSign);
      e.player.facing = f; e.player.aimYaw = f;
      if (e.cam) { e.cam.yaw = f; e.cam.pitch = 0; e.cam._first = true; }
      e.room.setViewpoints?.([{ pos: e.player.pos, dir: { x: Math.sin(f), z: Math.cos(f) } }]);
      return { ok: true, space: e.room.spaceAt(e.player.pos)?.id ?? null,
        w: +p.width.toFixed(2), h: +p.height.toFixed(2) };
    }, FACE);
    if (!ok.ok) { fail(`${FACE} — the face exists`, ok.why); continue; }
    /**
     * 🚨 **THE HUNTER IS SENT AWAY AND HIDDEN, AND THE FIRST RUN OF THIS FILE IS WHY.** Parked
     * 5.5 m off the wall and settled for 400 frames, it walked up and tore an arm off — every
     * frame came back as a close-up of its torso through a red damage overlay, with the wall this
     * gate is about entirely off screen. It is moved to a far corner and `root.visible` dropped,
     * before the settle and again immediately before the hold.
     */
    const quiet = () => page.evaluate(() => {
      const e = window.__rrr.engine, h = e.hunter;
      if (!h?.root) return false;
      const sp = e.room.spaces;
      let x = 0, z = 0;
      for (const s of sp) { if (s.x1 > x) x = s.x1; if (s.z1 > z) z = s.z1; }
      h.root.position.set(x + 40, 0, z + 40);
      h.root.visible = false;
      return true;
    });
    const hidden = await quiet();
    note(`parked in ${ok.space}, 5.5 m off a ${ok.w} x ${ok.h} m face`
      + ` · hunter ${hidden ? 'sent away and hidden' : 'NOT FOUND — frames may show it'}`);
    await step(400);   // settle with the sim RUNNING before anything is held
    await quiet(); await step(4);

    // ---- the two arms, flipped IN PLACE at this one station -------------
    await arm(true);
    const fixChain = await evalPage(`return dressed('exterior.dress.chain');`);
    const fixBoards = await evalPage(`return dressed('exterior.dress.boards');`);
    const bogus = await evalPage(`return dressed('exterior.dress.NOTHING');`);
    await quiet(); await step(3);
    await hold(page); await step(4);
    await png(`dressfix1-${FACE}-B-FIXED-door-size`);
    await release(page); await step(4);

    await arm(false);
    const badChain = await evalPage(`return dressed('exterior.dress.chain');`);
    const badBoards = await evalPage(`return dressed('exterior.dress.boards');`);
    await quiet(); await step(3);
    await hold(page); await step(4);
    await png(`dressfix1-${FACE}-A-SCALED-the-defect`);
    await release(page); await step(4);

    /** 🚨 three paired flips, medians — a single reading of `info.render.calls` moves ±1 here. */
    const rep = [];
    for (let k = 0; k < 3; k++) {
      await arm(true);
      const a = await page.evaluate(() => ({ calls: window.__rrr.engine.renderer.info.render.calls,
        dress: window.__rrr.engine.exterior.census().dressCalls }));
      await arm(false);
      const b = await page.evaluate(() => ({ calls: window.__rrr.engine.renderer.info.render.calls,
        dress: window.__rrr.engine.exterior.census().dressCalls }));
      rep.push({ fix: a, bad: b });
    }
    await arm(true);

    const med = (xs) => xs.slice().sort((x, y) => x - y)[Math.floor(xs.length / 2)];
    const fixCalls = rep.map((r) => r.fix.calls), badCalls = rep.map((r) => r.bad.calls);
    parked.push({ FACE, ok, fixChain, fixBoards, badChain, badBoards, bogus,
      callsFix: med(fixCalls), callsBad: med(badCalls),
      spread: Math.max(Math.max(...fixCalls) - Math.min(...fixCalls),
        Math.max(...badCalls) - Math.min(...badCalls)),
      dressFix: med(rep.map((r) => r.fix.dress)), dressBad: med(rep.map((r) => r.bad.dress)),
      fixCalls, badCalls });

    const freeOf = (c) => c.rows.filter((r) => r.free);
    const wid = (rows) => (rows.length ? Math.max(...rows.map((r) => r.span)) : 0);
    note(`FIXED  chain: ${freeOf(fixChain).length} placed on free faces, widest drawn `
      + `${wid(freeOf(fixChain)).toFixed(3)} m · boards widest ${wid(freeOf(fixBoards)).toFixed(3)} m`);
    note(`SCALED chain: ${freeOf(badChain).length} placed on free faces, widest drawn `
      + `${wid(freeOf(badChain)).toFixed(3)} m · boards widest ${wid(freeOf(badBoards)).toFixed(3)} m`);
    for (const r of freeOf(badChain).sort((a, b) => b.span - a.span).slice(0, 3)) {
      const f = freeOf(fixChain).find((q) => q.i === r.i);
      note(`    ${r.panel} (a ${r.pw} m wall) — chain drawn ${r.span.toFixed(2)} m SCALED`
        + ` → ${f ? f.span.toFixed(2) : '??'} m FIXED (geometry is ${r.geoW} m)`);
    }
    note(`draw calls FIXED ${fixCalls.join('/')} → ${med(fixCalls)} · SCALED ${badCalls.join('/')}`
      + ` → ${med(badCalls)} · exterior dressCalls ${med(rep.map((r) => r.fix.dress))}`
      + ` vs ${med(rep.map((r) => r.bad.dress))}`);
  }

  if (!parked.length) { fail('a station was parked', 'none'); return; }

  // ------------------------------------------------------------------ X5 the mortar arm
  const m5 = await evalPage(`
    const e = E();
    e.exterior.setSegmentMortar(true);
    const on = planOf();
    e.exterior.setSegmentMortar(false);
    const off = planOf();
    return { on: on.freeMortar, off: off.freeMortar };
  `);
  await step(6);
  note('');
  note(`X5 — free faces wearing mortar: shipped ${m5.off} · with ?segmortar reverted ${m5.on}`);

  // ------------------------------------------------------------------ the assertions
  const allFixFree = parked.flatMap((p) => [...p.fixChain.rows, ...p.fixBoards.rows].filter((r) => r.free));
  const allBadFree = parked.flatMap((p) => [...p.badChain.rows, ...p.badBoards.rows].filter((r) => r.free));
  const worstFix = allFixFree.length ? Math.max(...allFixFree.map((r) => r.span)) : -1;
  const worstBad = allBadFree.length ? Math.max(...allBadFree.map((r) => r.span)) : -1;
  const unres = parked.reduce((a, p) => a + p.fixChain.unresolved + p.fixBoards.unresolved, 0);

  (allFixFree.length > 0 && worstFix <= 2.40)
    ? pass('D1 — no dressing on a free dig face is drawn wider than a standard door',
      `worst ${worstFix.toFixed(3)} m over ${allFixFree.length} placed instances, against 2.40 m`
      + ` (the door is ${2.08} m and the chain overhangs its jambs)`)
    : fail('D1 — no dressing on a free dig face is drawn wider than a standard door',
      `${allFixFree.length} instances, worst ${worstFix.toFixed(3)} m`);

  const scaleOne = allFixFree.filter((r) => Math.abs(r.span - r.geoW) > 0.001);
  (allFixFree.length > 0 && scaleOne.length === 0)
    ? pass('D2 — it is drawn at its geometry\'s own authored width, within 1 mm',
      `${allFixFree.length} instances at scale exactly 1 — the door does not stretch to its wall`)
    : fail('D2 — it is drawn at its geometry\'s own authored width, within 1 mm',
      `${scaleOne.length} of ${allFixFree.length} differ, worst `
      + `${scaleOne.length ? Math.max(...scaleOne.map((r) => Math.abs(r.span - r.geoW))).toFixed(4) : 0} m`);

  /**
   * ⚠️ **D3 AND X1 ARE RELATIVE TO THE DOOR AND TO THE PANEL, NOT ABSOLUTE METRES.** The first
   * build required "> 6 m" for both, which is a constant tuned on `?plan=gen&planseed=3` where the
   * widest resident chained face is 27.20 m. Run on the AUTHORED house the same fix, working
   * correctly, went red: the widest chained free face resident at those four stations is
   * **5.72 m** (`f.svc_w.1.a`), the defect arm drew **5.50 m** across it, and a gate that calls
   * that "nothing could have stretched" is measuring the floor plan.
   */
  const DOOR = 2.08;
  const widest = allFixFree.length ? Math.max(...allFixFree.map((r) => r.pw)) : 0;
  widest > DOOR * 2
    ? pass('D3 — the faces it is drawn on really are WALLS',
      `the widest carrying dressing here is ${widest.toFixed(2)} m, against a ${DOOR} m door — so`
      + ' D1 is a statement about a stretch that had somewhere to go')
    : fail('D3 — the faces it is drawn on really are WALLS',
      `widest ${widest.toFixed(2)} m, under ${(DOOR * 2).toFixed(2)} m — nothing here could have`
      + ' stretched, so D1 proves nothing');

  /** the worst SPAN-AS-A-FRACTION-OF-ITS-OWN-PANEL, which is what "across the whole wall" means */
  const fracBad = allBadFree.length ? Math.max(...allBadFree.map((r) => r.span / r.pw)) : 0;
  const fracFix = allFixFree.length ? Math.max(...allFixFree.map((r) => r.span / r.pw)) : 0;
  (fracBad > 0.85 && worstBad > worstFix * 2)
    ? pass('X1 CONTROL — the defect arm puts the chain back across the whole wall, in place',
      `setDressFixed(false) draws ${(fracBad * 100).toFixed(0)}% of its own panel's width`
      + ` (${worstBad.toFixed(2)} m on a ${widest.toFixed(2)} m wall) against the fixed arm's`
      + ` ${worstFix.toFixed(2)} m, flipped in one page at ${parked.length} station(s)`)
    : fail('X1 CONTROL — the defect arm puts the chain back across the whole wall, in place',
      `defect arm spans ${(fracBad * 100).toFixed(0)}% of its panel (${worstBad.toFixed(2)} m),`
      + ` fixed arm ${(fracFix * 100).toFixed(0)}% (${worstFix.toFixed(2)} m) — the census cannot`
      + ' tell the two builds apart, so D1/D2 are unfalsifiable');

  const gw = new Set(parked.flatMap((p) => [...p.fixChain.rows, ...p.fixBoards.rows]).map((r) => r.geoW));
  gw.size >= 2
    ? pass('X2 CONTROL — the same search reads DIFFERENT authored widths for chain and boards',
      `${[...gw].sort().join(' / ')} m — it is reading geometry, not returning a constant`)
    : fail('X2 CONTROL — the same search reads DIFFERENT authored widths for chain and boards',
      `${[...gw].join(' / ')} — one number for two meshes`);

  const bogusTotal = parked.reduce((a, p) => a + p.bogus.meshes + p.bogus.placed, 0);
  bogusTotal === 0
    ? pass('X3 CONTROL — the identical traversal finds nothing under a name that does not exist',
      '0 meshes, 0 instances — so "no oversized instance" is a measurement, not a miss')
    : fail('X3 CONTROL — the identical traversal finds nothing under a name that does not exist',
      `${bogusTotal} — the search matches things it should not`);

  const connMoved = parked.filter((p) => {
    const f = new Map([...p.fixChain.rows, ...p.fixBoards.rows].filter((r) => !r.dig).map((r) => [`${r.mesh}#${r.i}`, r.span]));
    const b = [...p.badChain.rows, ...p.badBoards.rows].filter((r) => !r.dig);
    return b.some((r) => f.has(`${r.mesh}#${r.i}`) && Math.abs(f.get(`${r.mesh}#${r.i}`) - r.span) > 1e-9);
  });
  const connN = parked.reduce((a, p) => a + [...p.fixChain.rows, ...p.fixBoards.rows].filter((r) => !r.dig).length, 0);
  connMoved.length === 0
    ? pass('X4 CONTROL — connectors are byte-equal on both arms',
      `${connN} connector instances unmoved — the orangery's judged 1.54x stretch is untouched`)
    : fail('X4 CONTROL — connectors are byte-equal on both arms',
      `${connMoved.length} station(s) moved a connector — the fix leaked off the dig band`);

  (m5.off === 0 && m5.on > 0)
    ? pass('X5 — `mortar-1`\'s fix survives the new aperture, and the arm proves it is live',
      `0 free faces wear mortar on the shipped arm, ${m5.on} with ?segmortar reverted`)
    : fail('X5 — `mortar-1`\'s fix survives the new aperture, and the arm proves it is live',
      `shipped ${m5.off}, reverted ${m5.on}`);

  /**
   * 🚨 **THE RENDERER'S COUNTER IS COMPARED TO THE SAME-ARM NOISE FLOOR, NOT TO ZERO, AND THE
   * MODULE'S OWN DETERMINISTIC COUNT IS WHAT CARRIES THE CLAIM.** The first run of this file
   * asserted `≤ 0` and went red on **+1** at a station whose own three same-arm repeats read
   * **155 / 155 / 154** on one arm and **155 / 154 / 151** on the other — a spread of 4 around a
   * delta of 1. `dressCalls` is `exterior.census()`'s per-frame submission count and IS
   * deterministic, and it reads the same on both arms, which is the number this fix can move: the
   * two arms have the SAME meshes with the SAME visibility and differ only in matrix VALUES, so a
   * real cost here would have to be a mechanism nobody has named.
   */
  const dCalls = parked.map((p) => p.callsFix - p.callsBad);
  const dDress = parked.map((p) => p.dressFix - p.dressBad);
  const worstD = Math.max(...dCalls);
  const spread = Math.max(...parked.map((p) => p.spread));
  note('');
  note(`D4 draw calls, FIXED minus SCALED per station: ${dCalls.join(' · ')}`
    + ` · exterior dressCalls delta ${dDress.join(' · ')}`
    + ` · worst same-arm repeat spread ${spread}`);
  (Math.max(...dDress) <= 0 && worstD <= Math.max(0, spread))
    ? pass('D4 — the fix costs NO draw calls, flipped in place at ONE station',
      `the module's deterministic dressCalls delta is ${dDress.join('/')} at ${parked.length}`
      + ` station(s); the renderer's own counter moves ${dCalls.join('/')} inside a same-arm`
      + ` repeat spread of ${spread}`)
    : fail('D4 — the fix costs NO draw calls, flipped in place at ONE station',
      `dressCalls delta ${dDress.join('/')}, renderer delta ${dCalls.join('/')},`
      + ` same-arm spread ${spread}`);

  const budget = Math.max(...parked.map((p) => Math.max(p.callsFix, p.callsBad)));
  budget <= 625
    ? pass('D5 — every arm fits the 625 draw-call budget at these stations', `worst ${budget}`)
    : fail('D5 — every arm fits the 625 draw-call budget at these stations', `worst ${budget}`);

  if (unres) note(`⚠️ ${unres} placed instances could not be attributed to a panel within 1.5 m`);
  void skip;
}
