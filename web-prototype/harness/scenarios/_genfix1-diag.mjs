/**
 * 🩺 **WHY JOHN'S PLAYTEST DISAGREED WITH MY GATE — four reports, one page, asked of the BUILT
 * GAME rather than of the tables the build was made from.**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_genfix1-diag.mjs \
 *        --port 5480 --q "plan=gen&planseed=0&quality=medium"
 *
 * John, 2026-08-12, playing the tunnelled build of seed 0:
 *
 *   1. *"The sledge was not in the room in front of me to pick up and use."*
 *   2. *"the doorways like are open and walkable."*
 *   3. *"the interconnect didn't disable the cyan barrier for that room after I passed through it."*
 *   4. *"it seems damage is still peircing through and damage the wall on the other side of the
 *      barrier."*
 *
 * 🚨 **REPORT 2 CONTRADICTS A NUMBER I GAVE HIM AND HE IS THE ONE STANDING IN THE ROOM.**
 * `_plangen1-boot` B7 read **walk 1 of 18** — but it BFSs over `SP.PORTALS`, i.e. **the emitted
 * TABLE**, and `room.js:398` builds `portalDefs` from `state === OPEN` only, so the table and the
 * graph agree with each other by construction and neither one has ever met a collider. **That is
 * this project's own "an instrument that re-derives the thing it measures will agree with it",
 * and I shipped it.** Every check below therefore drives `room.collide()` or reads a built panel;
 * nothing here reads `GEN.portals`.
 *
 * ⚠️ **DIAGNOSTIC, NOT A GATE.** It states what IS, so it has no pass/fail bar to tune. The
 * controls exist to stop it reporting a comfortable zero when it simply failed to look: every
 * count is paired with the population it was drawn from, and the collide probe is run at a spot
 * that MUST block (a solid wall) as well as at the doorway.
 */

export default async function genfix1Diag({ page, note, pass, fail, skip }) {
  const arm = await page.evaluate(() => new URLSearchParams(location.search).get('plan'));
  if (arm !== 'gen') { skip('this file is the generated arm', 'pass --q "plan=gen&planseed=0"'); return; }

  // =========================================================================
  // D1 — THE DOORS: does a body actually stop at a breachable generated door?
  // =========================================================================
  const doors = await page.evaluate(() => {
    const e = window.__rrr.engine, room = e.room;
    const V = room.anchor ? null : null;
    const defs = (room.connectorDefs?.() ?? room.spec?.connectors ?? []).length
      ? (room.connectorDefs?.() ?? room.spec.connectors) : null;
    // states, off the BUILT panels rather than off the plan
    const byState = {};
    const panelled = {};
    for (const p of room.panels) {
      const st = p.spec?.state ?? p.connector?.state ?? 'none';
      if (p.spec?.dig) continue;                       // dig faces are not doors
      byState[st] = (byState[st] ?? 0) + 1;
      if (p.solidBoxes && p.solidBoxes().length) panelled[st] = (panelled[st] ?? 0) + 1;
    }
    // walk a body at every non-open door and see whether it is stopped
    const THREE = room.__three ?? null;
    const out = { byState, panelled, tested: 0, blocked: 0, walkedThrough: [], control: null };
    const doorPanels = room.panels.filter((p) => !p.spec?.dig
      && (p.spec?.state ?? p.connector?.state) && (p.spec?.state ?? p.connector?.state) !== 'open');
    for (const p of doorPanels.slice(0, 12)) {
      const c = p.root.getWorldPosition(new (p.root.position.constructor)());
      const n = p.normal ?? { x: 0, z: 1 };
      const start = { x: c.x + n.x * 1.2, y: 0, z: c.z + n.z * 1.2 };
      const want = { x: c.x - n.x * 1.2, y: 0, z: c.z - n.z * 1.2 };
      const pos = { x: start.x, y: start.y, z: start.z };
      const P = new (p.root.position.constructor)(pos.x, 0, pos.z);
      // march toward the far side in small steps through the real collider
      let got = P.clone();
      for (let i = 0; i < 60; i++) {
        const step = new (p.root.position.constructor)(
          got.x + (want.x - start.x) / 60, got.y, got.z + (want.z - start.z) / 60);
        got = room.collide(step, 0.34, 1.70);
      }
      const crossed = ((got.x - c.x) * -n.x + (got.z - c.z) * -n.z) > 0.25;
      out.tested++;
      if (crossed) out.walkedThrough.push(p.id); else out.blocked++;
    }
    return out;
  }).catch((err) => ({ err: String(err).slice(0, 200) }));

  if (doors.err) { fail('D1 the door probe ran', doors.err); }
  else {
    note(`D1 built non-dig panels by state: ${JSON.stringify(doors.byState)}`);
    note(`D1 …of those, how many have SOLID BOXES: ${JSON.stringify(doors.panelled)}`);
    note(`D1 bodies driven at ${doors.tested} shut doors: ${doors.blocked} blocked, `
      + `${doors.walkedThrough.length} WALKED THROUGH ${doors.walkedThrough.slice(0, 5).join(', ')}`);
    if (doors.tested === 0) fail('D1 there were shut doors to test', 'zero non-open door panels built — the probe saw nothing');
    else if (doors.walkedThrough.length) fail('D1 a shut door stops a body', `${doors.walkedThrough.length} of ${doors.tested} did not`);
    else pass('D1 a shut door stops a body', `${doors.blocked} of ${doors.tested} blocked`);
  }

  // =========================================================================
  // D2 — ownerSpace on generated DIG panels. `unlockBarrier`'s room mode reads this, and with
  //      it missing the unlock silently degrades to the single edge — which is exactly what
  //      "the barrier didn't drop for that room" looks like from inside the game.
  // =========================================================================
  const owner = await page.evaluate(() => {
    const room = window.__rrr.engine.room;
    const seg = room.panels.filter((p) => p.spec?.dig);
    const withOwner = seg.filter((p) => !!p.ownerSpace);
    const rooms = new Set(withOwner.map((p) => p.ownerSpace.id));
    return { seg: seg.length, withOwner: withOwner.length, rooms: rooms.size,
      sample: seg.slice(0, 3).map((p) => ({ id: p.id, owner: p.ownerSpace?.id ?? null, edge: p.spec?.edge })) };
  }).catch((err) => ({ err: String(err).slice(0, 200) }));
  if (owner.err) fail('D2 the ownerSpace probe ran', owner.err);
  else {
    note(`D2 dig panels ${owner.withOwner}/${owner.seg} carry ownerSpace, across ${owner.rooms} rooms · `
      + `${JSON.stringify(owner.sample)}`);
    if (owner.seg && owner.withOwner === owner.seg && owner.rooms > 1) {
      pass('D2 every generated dig panel knows its room', `${owner.rooms} distinct rooms`);
    } else {
      fail('D2 every generated dig panel knows its room',
        `${owner.withOwner} of ${owner.seg}, ${owner.rooms} rooms — room-mode unlock degrades to one edge without this`);
    }
  }

  // =========================================================================
  // D3 — THE UNLOCK, driven for real: open an interconnect and read the barrier afterwards.
  // =========================================================================
  const unl = await page.evaluate(() => {
    const room = window.__rrr.engine.room;
    const before = room.digCensus();
    const linkId = before.link[0];
    const p = linkId ? room.panelOf(linkId) : null;
    if (!p) return { err: 'no interconnect panel in dig.link', link: before.link.length };
    /**
     * 🚨 **DIG AT THE SOFT SPOT, NOT AT THE MIDDLE OF THE FACE — the first run of this probe dug
     * `pointAt(0.5, 0.5)` and reported "the unlock never fired".** The interconnect's `u` is
     * SEEDED, so the centre is ordinary wall with a barrier behind it, and "I dug the wrong place"
     * and "the mechanic is broken" produced the same output. The region's own `u` is read back
     * off the panel here so the probe cannot miss it again.
     */
    const f = p.field;
    /**
     * 🚨 **AN APERTURE CELL ALSO HAS `barrier === 0`, so "no barrier here" is NOT "interconnect
     * here".** `_applyApertures()` sets `depth = 1, barrier = 0` for every doorway cell — that is
     * its whole job. Scanning for a barrier gap on a face that carries a doorway therefore finds
     * the DOORWAY, and digging into a hole that is already open changes no stage, fires no unlock,
     * and reports `unlocked=false` — indistinguishable from the mechanic being broken. It cost a
     * run: `f.g16.0.a` (a face with an aperture) read FAIL while `f.g17.0.a` (one without) read
     * PASS on the same tree, and the difference was which panel `link[0]` happened to be.
     */
    const AP = f.aperture;
    let u = null, v = null, holes = 0;
    for (let i = 0; i < f.barrier.length; i++) {
      if (f.barrier[i] || AP?.[i]) continue;
      holes++;
      if (u === null) { u = ((i % f.cols) + 0.5) / f.cols; v = (Math.floor(i / f.cols) + 0.5) / f.rows; }
    }
    if (u === null) return { err: `panel ${linkId} has no interconnect gap (aperture cells excluded)`, link: before.link.length };
    // dig the soft spot out for real, through the shipped hit path
    for (let i = 0; i < 400; i++) p.applyHit(p.pointAt(u, v), 1);
    const after = room.digCensus();
    const opened = new Set(after.openedEdges);
    return {
      linkId, ownerOfLink: p.ownerSpace?.id ?? null, dugAt: { u: +u.toFixed(3), v: +v.toFixed(3), barrierHoles: holes },
      mode: after.unlockMode, unlocked: after.unlocked, by: after.unlockedBy,
      edges: after.edges.length, opened: after.openedEdges.length,
      barrieredElsewhere: after.free.filter((f) => !opened.has(f.edge) && f.barrierCells > 0).length,
      barrieredHere: after.free.filter((f) => opened.has(f.edge) && f.barrierCells > 0).length,
    };
  }).catch((err) => ({ err: String(err).slice(0, 200) }));
  if (unl.err) fail('D3 the unlock probe ran', `${unl.err} · link=${unl.link}`);
  else {
    note(`D3 dug ${unl.linkId} (room ${unl.ownerOfLink}) · mode=${unl.mode} unlocked=${unl.unlocked} by ${unl.by} · `
      + `${unl.opened}/${unl.edges} edges opened · barriered: ${unl.barrieredHere} here, ${unl.barrieredElsewhere} elsewhere`);
    if (unl.unlocked && unl.opened > 1) pass('D3 the interconnect drops this room\'s walls', `${unl.opened} edges`);
    else fail('D3 the interconnect drops this room\'s walls',
      `unlocked=${unl.unlocked}, opened ${unl.opened} of ${unl.edges} — 1 means it fell back to the single edge`);
  }

  // =========================================================================
  // D4 — THE SLEDGE: is it in the world at all, and how far from where the player stands?
  // =========================================================================
  const sl = await page.evaluate(() => {
    const e = window.__rrr.engine;
    let prop = null;
    e.scene.traverse((o) => { if (o.name === 'pickup.sledgehammer') prop = o; });
    const pl = e.player;
    const pp = pl ? { x: +pl.pos.x.toFixed(2), y: +pl.pos.y.toFixed(2), z: +pl.pos.z.toFixed(2) } : null;
    const wp = prop ? { x: +prop.position.x.toFixed(2), y: +prop.position.y.toFixed(2), z: +prop.position.z.toFixed(2) } : null;
    const d = (prop && pl) ? +Math.hypot(prop.position.x - pl.pos.x, prop.position.z - pl.pos.z).toFixed(2) : null;
    const sameSpace = (prop && e.room.spaceAt) ? (e.room.spaceAt(prop.position)?.id ?? null) : null;
    return { found: !!prop, at: wp, player: pp, dist: d, propSpace: sameSpace,
      playerSpace: pl ? (e.room.spaceAt(pl.pos)?.id ?? null) : null, visible: prop ? prop.visible : null };
  }).catch((err) => ({ err: String(err).slice(0, 200) }));
  if (sl.err) fail('D4 the sledge probe ran', sl.err);
  else {
    note(`D4 sledge found=${sl.found} at ${JSON.stringify(sl.at)} (space ${sl.propSpace}, visible ${sl.visible}) · `
      + `player at ${JSON.stringify(sl.player)} (space ${sl.playerSpace}) · ${sl.dist} m apart`);
    if (sl.found && sl.propSpace && sl.propSpace === sl.playerSpace) {
      pass('D4 the sledge is in the room the player starts in', `${sl.dist} m away`);
    } else {
      fail('D4 the sledge is in the room the player starts in',
        `found=${sl.found}, prop in ${sl.propSpace}, player in ${sl.playerSpace}`);
    }
  }

  // =========================================================================
  // D6 — THE DOORWAY HALO: is there a RAMP in the blurred depth across an aperture edge?
  //
  // John: *"the doorways immediately look damaged everywhere when they damage at any point."*
  // The B channel is the renderer's blurred copy of depth and is what the shader's march samples;
  // a texel that reads PARTLY eaten misses the `_f < 0.999` discard and renders as a cut face —
  // the crumbled arris, the lip, the white and the cyan. `_applyApertures()` never wrote B, so the
  // blur ran over the doorway's hard edge and left a ramp on the wall beside it.
  //
  // 🚨 THE CONTROL IS THE DUG EDGE IN THE SAME BREATH. A ramp is CORRECT around a hole the player
  // smashed — that is what makes a crater look broken. So this reads both: an aperture edge must
  // be hard, and a DUG edge on the same face must still ramp. A probe that reported "no ramp
  // anywhere" would be measuring a dead channel, not a fix.
  // =========================================================================
  const halo = await page.evaluate(() => {
    const room = window.__rrr.engine.room;
    const p = room.panels.find((q) => q.spec?.free && q.field?.aperture);
    if (!p) return { err: 'no generated dig face carries an aperture' };
    const f = p.field, AP = f.aperture, cols = f.cols, rows = f.rows;
    const B = (i) => f.data[i * 4 + 2] / 255;
    // every wall cell that touches an aperture cell — its blurred depth must be 0, not a ramp
    let edgeCells = 0, ramped = 0, worst = 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (AP[i]) continue;
        const nb = [x > 0 ? i - 1 : -1, x < cols - 1 ? i + 1 : -1,
          y > 0 ? i - cols : -1, y < rows - 1 ? i + cols : -1];
        if (!nb.some((j) => j >= 0 && AP[j])) continue;
        edgeCells++;
        const b = B(i);
        if (b > 0.02) { ramped++; worst = Math.max(worst, b); }
      }
    }
    // …and the aperture's own cells must read hard 1, or the opening keeps an inner fringe
    let apCells = 0, apSoft = 0;
    for (let i = 0; i < AP.length; i++) if (AP[i]) { apCells++; if (B(i) < 0.999) apSoft++; }
    /**
     * CONTROL: dig a crater on the SAME face and require a ramp there.
     *
     * 🚨 **THIS ONE CONTROL CAUGHT ME FOUR TIMES AND EVERY FAILURE PRINTED THE SAME "0 ramped".**
     * In order: (1) it called `f.applyHit` on the FIELD with the PANEL's argument list — the field
     * has its own `applyHit` with a different signature, so it neither threw nor dug; (2) it dug
     * without `flush()`, and B is only recomputed on upload, so it read stale bytes; (3) it dug at
     * `pointAt(0.5, 0.5)`, the face CENTRE, on a face that is **638 cells of doorway** — i.e. into
     * the hole, where depth is already 1 and nothing can ramp; (4) it dug destructively before D5
     * and broke D5's premise. **Four causes, one symptom, and a zero that would have read as "the
     * halo is gone" every single time.** The aperture half of this check was stable and correct
     * throughout — only its control was broken, which is exactly the arrangement that stops a
     * lucky pass from looking like a measurement.
     */
    let du = 0.5, dv = 0.5;
    for (let y = 2; y < rows - 2 && du === 0.5; y++) {
      for (let x = 2; x < cols - 2; x++) {
        const i = y * cols + x;
        // a cell with no aperture within two cells in any direction — real wall to break
        let clear = true;
        for (let dy = -2; dy <= 2 && clear; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const j = (y + dy) * cols + (x + dx);
            if (AP[j]) { clear = false; break; }
          }
        }
        if (clear) { du = (x + 0.5) / cols; dv = (y + 0.5) / rows; break; }
      }
    }
    for (let k = 0; k < 31; k++) p.applyHit(p.pointAt(du, dv), 1);
    f.flush();
    let dugEdge = 0, dugRamped = 0;
    for (let i = 0; i < AP.length; i++) {
      if (AP[i]) continue;
      const b = B(i);
      if (b > 0.02 && b < 0.98) { dugRamped++; }
      if (b > 0.02) dugEdge++;
    }
    /**
     * ⚠️ **AND PUT THE FACE BACK.** D5 runs after this and asks whether damage crosses a standing
     * barrier; leaving a 31-blow crater in the world changed which face it picked and turned it
     * red on a healthy tree. A diagnostic that disturbs the checks below it is measuring itself.
     */
    p.resetDamage?.();
    f.flush();
    return { face: p.id, dugAt: { u: +du.toFixed(3), v: +dv.toFixed(3) },
      edgeCells, ramped, worst: +worst.toFixed(3), apCells, apSoft, dugEdge, dugRamped };
  }).catch((err) => ({ err: String(err).slice(0, 200) }));

  if (halo.err) skip('D6 an aperture edge is hard, a dug edge ramps', halo.err);
  else {
    note(`D6 ${halo.face}: ${halo.edgeCells} wall cells touch the doorway · ${halo.ramped} still ramped `
      + `(worst ${halo.worst}) · doorway cells ${halo.apCells}, ${halo.apSoft} under hard 1 · `
      + `CONTROL after 31 blows: ${halo.dugRamped} partly-eaten cells around the crater`);
    if (halo.ramped === 0 && halo.apSoft === 0 && halo.dugRamped > 0) {
      pass('D6 an aperture edge is hard, and a DUG edge still ramps',
        `0 of ${halo.edgeCells} doorway-edge cells ramped; ${halo.dugRamped} around the crater, as they must`);
    } else {
      fail('D6 an aperture edge is hard, and a DUG edge still ramps',
        `${halo.ramped}/${halo.edgeCells} doorway-edge cells ramped (worst ${halo.worst}), `
        + `${halo.apSoft}/${halo.apCells} doorway cells soft, ${halo.dugRamped} dug cells ramped `
        + `(0 here would mean the channel is dead, not that the halo is gone)`);
    }
  }

  // =========================================================================
  // D5 — DAMAGE THROUGH THE BARRIER: hit one face, read the FAR face's grid.
  //      ⚠️ Judged on the far side's own depth, never on a difference of grids — per-side depth
  //      is DELIBERATE (`dig.md` §5) and a probe that reads a delta reports correct behaviour
  //      as a defect. This asks only: did the far face gain material loss while the barrier
  //      between them was still standing?
  // =========================================================================
  const pierce = await page.evaluate(() => {
    const room = window.__rrr.engine.room;
    const seg = room.panels.filter((p) => p.spec?.dig && p.field && p.twin?.field
      && !room.digCensus().openedEdges.includes(p.spec.edge));
    const p = seg.find((q) => q.field.stats().barrierCells > 0);
    if (!p) return { err: 'no barriered dig face with a twin to test' };
    const t = p.twin;
    const b0 = t.field.stats();
    for (let i = 0; i < 120; i++) p.applyHit(p.pointAt(0.35, 0.5), 1);
    const a0 = p.field.stats(), b1 = t.field.stats();
    return {
      face: p.id, twin: t.id,
      near: { open: a0.openCells, max: +a0.maxDepth.toFixed(3), barrier: a0.barrierCells },
      farBefore: { open: b0.openCells, max: +b0.maxDepth.toFixed(3), barrier: b0.barrierCells },
      farAfter: { open: b1.openCells, max: +b1.maxDepth.toFixed(3), barrier: b1.barrierCells },
    };
  }).catch((err) => ({ err: String(err).slice(0, 200) }));
  if (pierce.err) skip('D5 damage does not cross a standing barrier', pierce.err);
  else {
    note(`D5 hit ${pierce.face} 120x · near ${JSON.stringify(pierce.near)} · `
      + `far before ${JSON.stringify(pierce.farBefore)} → after ${JSON.stringify(pierce.farAfter)}`);
    const grew = pierce.farAfter.open > pierce.farBefore.open || pierce.farAfter.max > pierce.farBefore.max + 1e-6;
    if (grew) fail('D5 damage does not cross a standing barrier',
      `far face went open ${pierce.farBefore.open}→${pierce.farAfter.open}, maxDepth ${pierce.farBefore.max}→${pierce.farAfter.max}`);
    else pass('D5 damage does not cross a standing barrier', 'far face unmoved while the barrier stands');
  }
}
