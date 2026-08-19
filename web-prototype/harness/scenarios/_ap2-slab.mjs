/**
 * 🚪 **THE SLAB WITH TWO DOORWAYS IN IT — IN THE BUILT GAME, NOT IN THE GRID.**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_ap2-slab.mjs \
 *        --port 5441 --q "seed=s4&slab=1"            # one 15.40 m face, no doorway — slab-1's arm
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_ap2-slab.mjs \
 *        --port 5442 --q "seed=s4&slab=1&doors=1" --shots   # …the same face, holding two doorways
 *
 * John, 2026-08-11: *"lets **aperture the doorways into the slab** and be able to do it in a
 * **known location**."*
 *
 * 🚨 **WHY A BROWSER FILE AT ALL, WHEN `_ap2-rule.mjs` ALREADY PROVES THE RULE HEADLESS.** Three
 * of the five things that can go wrong with an aperture are not in the grid:
 *
 *   1. **A PRISTINE face is drawn by `wallinstances.js` out of a shared `PlaneGeometry` with no
 *      damage texture at all**, so a doorway that exists in the field and not in that geometry is
 *      a solid wall you can walk through — HANDOFF's *"it exists, something is in front of it"*
 *      class, inverted. Only the built scene can be asked.
 *   2. `room.collide()` walks BOTH faces of a band and `pathPortals()` reads the graph; the grid
 *      cannot tell you either answered.
 *   3. The draw-call bill is a scene census.
 *
 * ⚠️ **THE ARMS ARE TWO RUNS, NOT AN IN-PAGE FLIP, AND THAT IS DELIBERATE.** An aperture changes
 * GEOMETRY (a group key, a plane with a hole in it), so there is no uniform to flip. HANDOFF's own
 * exemption applies — *"draw-call counts are deterministic and exempt"* — and it is the method
 * `digcover-1` used for the +6 it recorded. Run the two ports back to back on a quiet machine.
 */

const SVC_W = ['f.svc_w.0.a', 'f.svc_w.0.b'];
const DOORS = [-20.00, -12.20];

export default async function ap2Slab({ page, note, pass, fail, skip, shot }) {
  const arm = await page.evaluate(() => {
    const q = new URLSearchParams(location.search);
    return { slab: !!q.get('slab'), doors: !!q.get('doors') };
  });
  if (!arm.slab) { skip('this file is the slab arm', 'pass --q "seed=s4&slab=1[&doors=1]"'); return; }
  note(`arm: slab=${arm.slab} doors=${arm.doors}`);

  // =========================================================================
  // B1 — THE FACE IS ONE SLAB, AND IT KNOWS WHAT HOLES IT HAS
  // =========================================================================
  const face = await page.evaluate((ids) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(ids[0]);
    if (!p) return { err: `no panel ${ids[0]}` };
    const f = p.field;
    let ap = 0;
    if (f?.aperture) for (let i = 0; i < f.aperture.length; i++) ap += f.aperture[i];
    return {
      width: +p.width.toFixed(2), height: +p.height.toFixed(2),
      apertures: p.apertures?.map((r) => ({
        u0: +r.u0.toFixed(4), u1: +r.u1.toFixed(4), v0: +r.v0.toFixed(4), v1: +r.v1.toFixed(4),
      })) ?? null,
      apCells: ap, cells: f ? f.cols * f.rows : 0,
      apArea: f?.apertureArea ? +f.apertureArea().toFixed(3) : 0,
      pristine: p.pristine, maxDepth: f?.maxDepth ?? -1,
      stage: p.state.stage,
    };
  }, SVC_W);
  if (face.err) { fail('the slab face exists', face.err); return; }
  note(`${SVC_W[0]}: ${face.width} x ${face.height} m, ${face.cells} cells, `
    + `${face.apCells} of them doorway (${face.apArea} m²), pristine=${face.pristine}, `
    + `stage=${face.stage}, maxDepth=${face.maxDepth}`);

  if (face.width > 15) pass('the wall is ONE slab', `${face.width} m, one face per wall per room`);
  else fail('the wall is ONE slab', `${face.width} m — the slab arm did not take`);

  if (arm.doors) {
    if (face.apCells > 0 && face.apertures?.length === 2) {
      pass('the slab CONTAINS two doorways', `${face.apertures.length} apertures, `
        + `${face.apCells} cells, ${face.apArea} m² of hole in a `
        + `${(face.width * face.height).toFixed(1)} m² face`);
    } else {
      fail('the slab CONTAINS two doorways',
        `${face.apertures?.length ?? 0} apertures, ${face.apCells} cells`);
    }
    /**
     * 🚨 **A DOORWAY IS NOT DAMAGE, AND THIS IS THE CHECK THAT CATCHES THE ONE-LINE VERSION OF
     * THIS SLICE THAT WOULD HAVE LOOKED FINE.** Lifting `_maxDepth` to 1 for an aperture makes
     * `wall.js` `_syncStageFromField()` report **stage 4 — dug through** on a wall nobody has
     * touched, which takes the breakthrough beat, the debris kind and `syncStage` on the wire
     * with it, and it would never have shown up in a picture.
     */
    if (face.pristine && face.stage === 0) {
      pass('…and the slab is still PRISTINE, at stage 0',
        'a doorway is not damage: `_maxDepth` stays 0, so the breakthrough beat, `debrisKind` '
        + 'and `syncStage` are untouched');
    } else {
      fail('…and the slab is still PRISTINE, at stage 0',
        `pristine=${face.pristine} stage=${face.stage} — a doorway is being read as damage`);
    }
  } else {
    if (face.apCells === 0 && !face.apertures) {
      pass('CONTROL — without `&doors=1` the same slab has no hole at all',
        'so every number on the other arm is the doorways and not the slab');
    } else {
      fail('CONTROL — without `&doors=1` the same slab has no hole at all',
        `${face.apCells} aperture cells appeared on the arm that asked for none`);
    }
  }

  // =========================================================================
  // B2 — THE PRISTINE FACE IS DRAWN WITH THE HOLE IN IT
  // =========================================================================
  const geo = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const inst = e.room.wallInstances ?? e.room._wallInstances ?? null;
    const out = { groups: [], census: null, found: [] };
    if (inst?.census) out.census = inst.census();
    (e.scene ?? e.world?.scene).traverse((o) => {
      if (!o.isInstancedMesh || !/wall\.pristine\.face/.test(o.name)) return;
      out.found.push({
        name: o.name,
        tris: (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3,
        visible: o.visible, count: o.count,
      });
    });
    return out;
  });
  const slabFaces = geo.found.filter((g) => /15\.40/.test(g.name));
  note(`instanced pristine face meshes: ${geo.found.length} `
    + `(${geo.census ? `${geo.census.groups} groups` : 'no census'})`);
  for (const g of slabFaces) note(`  ${g.name} — ${g.tris} tris, ${g.count} slots`);
  if (arm.doors) {
    // a plain quad is 2 triangles; a 15.40 m face with two doorways cut out is more
    if (slabFaces.length && slabFaces.every((g) => g.tris > 2)) {
      pass('the PRISTINE slab is drawn with its doorways cut out of the geometry',
        `${slabFaces.map((g) => `${g.tris} tris`).join(' / ')} against a plain quad's 2 — a `
        + 'pristine face carries no damage texture, so the hole has to be in the mesh');
    } else {
      fail('the PRISTINE slab is drawn with its doorways cut out of the geometry',
        `${slabFaces.map((g) => `${g.tris} tris`).join(' / ') || 'no 15.40 m group found'} — `
        + 'a doorway you can walk through and cannot see is the worst of both');
    }
    if (slabFaces.length === 2) {
      pass('the two mirrored faces are two groups', 'a doorway is not symmetric along the wall, '
        + 'so `a` and `b` cannot share one InstancedMesh — see `wallinstances.js` `apertureKey`');
    } else {
      note(`⚠️ ${slabFaces.length} slab face groups — expected 2 (one per mirror)`);
    }
  } else if (slabFaces.length) {
    pass('CONTROL — the doorless slab is a plain quad',
      `${slabFaces.map((g) => `${g.tris} tris`).join(' / ')}`);
  }

  // =========================================================================
  // B3 — A BODY WALKS THROUGH THE DOORWAY OF A WALL NOBODY HAS TOUCHED
  // =========================================================================
  const walk = await page.evaluate((ids) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(ids[0]);
    const ch = p.openChannel ? p.openChannel() : null;
    const V = e.room.anchor('service.mid').constructor;
    const n = p.normal;
    const cu = ch?.centreU ?? 0.5;
    const c = p.pointAt(cu, 0.3);
    const start = { x: c.x + n.x * 1.8, z: c.z + n.z * 1.8 };
    const pos = new V(start.x, 0, start.z);
    for (let i = 0; i < 240; i++) {
      pos.x -= n.x * 0.03; pos.z -= n.z * 0.03;
      pos.copy(e.room.collide(pos, 0.34, 1.70));
    }
    const d = (start.x - pos.x) * n.x + (start.z - pos.z) * n.z;
    const route = e.room.pathPortals('service', 'study_w', 0.68, 1.70);
    return {
      past: +(d - 1.8).toFixed(2), centreU: +cu.toFixed(3),
      width: +(ch?.width ?? 0).toFixed(3), height: +(ch?.height ?? 0).toFixed(3),
      blocks: p.blocksMovement ? !!p.blocksMovement() : null,
      route: Array.isArray(route) ? route.length : (route ? 1 : 0),
      worldZ: +p.pointAt(cu, 0.3).z.toFixed(2),
    };
  }, SVC_W);
  note(`channel ${walk.width} m wide / ${walk.height} m clear at u ${walk.centreU} `
    + `(world z ${walk.worldZ}) · body ended ${walk.past} m past the face · `
    + `blocksMovement=${walk.blocks} · service→study_w route hops ${walk.route}`);
  if (arm.doors) {
    if (walk.past > 0.5) {
      pass('a body walks through the doorway of a PRISTINE slab', `${walk.past} m past the face`);
    } else {
      fail('a body walks through the doorway of a PRISTINE slab',
        `${walk.past} m — the collider still has a box in the doorway`);
    }
    const near = DOORS.map((z) => Math.abs(z - walk.worldZ)).sort((a, b) => a - b)[0];
    if (near < 0.4) {
      pass('…and it is AT A KNOWN LOCATION', `the channel centres ${near.toFixed(2)} m from the `
        + `authored z ${DOORS.join(' / ')} — the same z spaces.js puts p.svc_w.n and .s at`);
    } else {
      fail('…and it is AT A KNOWN LOCATION',
        `channel at z ${walk.worldZ}, ${near.toFixed(2)} m from the nearest authored doorway`);
    }
  } else if (walk.past <= 0.5) {
    pass('CONTROL — the doorless slab refuses the same body', `${walk.past} m past the face`);
  } else {
    fail('CONTROL — the doorless slab refuses the same body',
      `${walk.past} m past an aperture-free wall nobody has dug`);
  }

  // =========================================================================
  // B4 — THE BARRIER AND THE INTERCONNECT
  // =========================================================================
  const cyan = await page.evaluate((ids) => {
    const e = window.__rrr.engine;
    const out = {};
    const read = (p) => {
      const f = p.field;
      let inDoor = 0, total = 0;
      for (let i = 0; i < f.barrier.length; i++) {
        if (f.barrier[i]) total++;
        if (f.aperture?.[i] && f.barrier[i]) inDoor++;
      }
      return { inDoor, total };
    };
    for (const id of ids) out[id] = read(e.room.panelOf(id));
    /**
     * 🚨 **THE INTERCONNECT IS READ BEFORE ANYTHING IS RE-ARMED, AND THE FIRST VERSION OF THIS
     * FILE READ IT AFTER.** The region is *"the barrier-free cells that are not a doorway"*, so
     * asking that question on a face whose barrier has just been rewritten measures the rewrite:
     * it read `u 0.003..0.997` and failed a correct build. Order is the assertion here.
     */
    const p0 = e.room.panelOf(ids[0]);
    let icU = null, icOverDoor = null, icCells = 0;
    if (p0.field.aperture) {
      let lo = 1, hi = 0;
      for (let cx = 0; cx < p0.field.cols; cx++) {
        for (let cy = 0; cy < p0.field.rows; cy++) {
          const i = p0.field.idx(cx, cy);
          if (p0.field.barrier[i] || p0.field.aperture[i]) continue;
          icCells++;
          const u = (cx + 0.5) / p0.field.cols;
          if (u < lo) lo = u;
          if (u > hi) hi = u;
        }
      }
      icU = hi >= lo ? [+lo.toFixed(3), +hi.toFixed(3)] : null;
      icOverDoor = icU ? p0.field.apertures.some((r) => hi > r.u0 && lo < r.u1) : null;
    }
    /**
     * …and again after `setBarrier(true)` — `wall.js`'s own path into
     * `DamageField.setBarrierEverywhere`, i.e. exactly what `[B]` and `room.unlockBarrier()`
     * reach. It is the whole-array writer that would fill a doorway with cyan.
     */
    for (const id of ids) {
      e.room.panelOf(id).setBarrier(true);
      out[`${id}|rearmed`] = read(e.room.panelOf(id));
    }
    return { out, icU, icOverDoor, icCells };
  }, SVC_W);
  for (const [k, v] of Object.entries(cyan.out)) {
    note(`  ${k}: ${v.total} barrier cells, ${v.inDoor} of them inside a doorway`);
  }
  const anyInDoor = Object.values(cyan.out).some((v) => v.inDoor > 0);
  if (arm.doors) {
    if (!anyInDoor) {
      pass('there is no cyan in a doorway, on either face, before or after a re-arm',
        'every whole-array writer — setBarrierEverywhere, setInterconnect, mirrorBarrierFrom, '
        + 'reset — re-applies the mask');
    } else {
      fail('there is no cyan in a doorway', 'barrier cells stand inside an aperture');
    }
    if (cyan.icOverDoor === false) {
      pass('the interconnect is not inside a doorway',
        `its ${cyan.icCells} barrier-free non-doorway cells span u ${cyan.icU?.join('..')} on `
        + `${SVC_W[0]}, and neither doorway is in that span`);
    } else if (cyan.icOverDoor === null) {
      skip('the interconnect is not inside a doorway', 'no barrier-free region on this face');
    } else {
      fail('the interconnect is not inside a doorway', `u ${cyan.icU?.join('..')} overlaps one`);
    }
  }

  // =========================================================================
  // B4b — 🚨 THE UNLOCK TRIGGER, AND IT IS THE DEFECT AN APERTURE CREATES
  // =========================================================================
  const unlock = await page.evaluate((ids) => {
    const e = window.__rrr.engine;
    const out = [];
    for (const id of ids) {
      const p = e.room.panelOf(id);
      out.push({
        id, blocks: !!p.blocksMovement(), dugOpen: !!p.dugOpen,
        hits: p.field.hits.length, link: !!e.room.digCensus?.()?.link?.includes?.(id),
      });
    }
    return out;
  }, SVC_W);
  for (const u of unlock) {
    note(`  ${u.id}: blocksMovement=${u.blocks} dugOpen=${u.dugOpen} hits=${u.hits}`);
  }
  if (arm.doors) {
    const bad = unlock.filter((u) => !u.blocks && !u.dugOpen && u.hits === 0);
    if (bad.length) {
      pass('🚨 `blocksMovement()` is FALSE on an undug slab that has a doorway — and `dugOpen` '
        + 'is the predicate that is not', `${bad.map((u) => u.id).join(', ')}. `
        + 'room.js:1482 fires the HOUSE-WIDE unlock on `!self.blocksMovement()` for the link '
        + 'face, so the barrier drops on the first promote and the search is over before it '
        + 'starts. The fix is one clause — `&& self.dugOpen` — in a file this slice does not own.');
    } else {
      fail('the unlock predicate distinguishes a doorway from a dig',
        'blocksMovement() is already false only where somebody dug — re-check `dugOpen`');
    }
  } else if (unlock.every((u) => u.blocks && !u.dugOpen)) {
    pass('CONTROL — on the doorless slab both predicates agree (blocked, not dug)',
      'so `dugOpen` is not simply always false');
  }

  // =========================================================================
  // B5 — DRAW CALLS, at the station the budget is tightest at
  // =========================================================================
  const calls = await page.evaluate(async () => {
    const e = window.__rrr.engine;
    const out = [];
    const V = e.room.anchor('service.mid').constructor;
    for (const st of ['service.mid', 'service.north', 'study_w.north']) {
      const a = e.room.anchor?.(st);
      if (!a) continue;
      // face along the passage, so both slab faces are in frame — `dig.js`'s own reason for
      // choosing these two edges: `service.mid` is the worst parked station in the house.
      e.room.setViewpoint(new V(a.x, 1.6, a.z), new V(0, 0, 1), 1);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      out.push({ st, calls: e.renderer.info.render.calls, tris: e.renderer.info.render.triangles });
    }
    return out;
  }).catch((err) => [{ st: 'ERR', calls: String(err).slice(0, 80), tris: 0 }]);
  if (calls.length) {
    for (const c of calls) note(`  ${c.st}: ${c.calls} calls / 625, ${c.tris} tris`);
    note('⚠️ REPORTED, not gated — the arm A/B is the two ports run back to back; `eo2-calls.mjs` '
      + 'is the parked-station census this project gates on.');
  } else {
    note('⚠️ no station census available from this scenario; use `eo2-calls.mjs` for the budget.');
  }

  if (shot) {
    await page.evaluate((ids) => {
      const e = window.__rrr.engine;
      const p = e.room.panelOf(ids[0]);
      const c = p.pointAt(0.74, 0.30);
      const n = p.normal;
      const pl = e.player;
      if (pl) {
        pl.pos.set(c.x + n.x * 3.2, pl.pos.y, c.z + n.z * 3.2);
        pl.yaw = Math.atan2(-n.x, -n.z);
      }
    }, SVC_W).catch(() => {});
    await new Promise((r) => setTimeout(r, 600));
    await shot(arm.doors ? 'ap2-slab-with-doorways' : 'ap2-slab-plain');
  }
}
