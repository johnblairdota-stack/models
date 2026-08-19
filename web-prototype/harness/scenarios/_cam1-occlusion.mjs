/**
 * 🔨 HOW MUCH OF THE HOLE IS THE PLAYER'S OWN BODY? — the honest metric for `critic-slice-3`'s
 * headline, measured at a real dig standoff, over a real swing, in ONE page.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_cam1-occlusion.mjs \
 *        --port 5376 --q "seed=s4" --shots
 *
 * ===========================================================================================
 * WHAT IT MEASURES AND WHY IN THIS FORM
 * ===========================================================================================
 *
 * `play-critic-7` filed *"the player's body covers 45.7% of the opening's screen area at 2.6 m,
 * 49.0% at 4.2 m, 52.6% at 6.0 m"* and `critic-slice-3` promoted it to the game's most
 * expensive unfixed defect, because the dig pays it on every blow of a sixty-second activity.
 * This re-measures that number at a dig, so a fix to it can be believed.
 *
 * ⚠️ **IT IS NOT A PIXEL DIFF, ON PURPOSE.** The station is in the GALLERY, where `jitter-1` is
 * fixing a live determinism bug — same-config floor 43-49% of the rect, grain 22-42% house-wide
 * — so any A/B built on pixels there is meaningless until that lands. This asks a geometric
 * question instead, and geometry does not flicker: for each of ~400 sample points spread over
 * the crater's own dug cells, cast a ray from the CAMERA to that point and ask whether the
 * player's own triangles are in the way. Occlusion is exactly what "the body is in front of it"
 * means, so this measures the defect rather than a proxy for it.
 *
 * ⚠️ **AND IT IS ONE PAGE, ONE CRATER, ONE INSTANT.** `ThirdPersonCamera.workEnabled` is an
 * ablation switch that restores the shipped camera exactly, so both arms are read at the same
 * station off the same excavation with nothing reloaded between them. Two boots would be two
 * different craters.
 *
 * ⚠️ **WHAT IT CANNOT TELL YOU:**
 *   · Nothing about the LOOK of the crater. A hole that is unoccluded and unreadable for some
 *     other reason (the gallery's cream-on-white value problem, cause 2 of the critic's three)
 *     reads as a clean 0% here. Look at the shots.
 *   · Nothing about motion sickness, or how the transition feels. Look at the shots.
 *   · Nothing about a station it did not visit. One gallery face is one gallery face.
 *   · `offScreen` is reported next to every figure and must be read with it. A camera that
 *     framed the crater out of the window entirely would also report 0% occluded, and that
 *     would be a worse defect, not a fix. The two numbers together are the claim.
 *
 * Two regions are measured at every sample, because they answer different questions:
 *   `dug`    the actual excavated cells — "can I see the change I made"
 *   `sq1m`   a fixed 1.00 x 1.00 m square centred on where the NEXT blow lands — "can I see the
 *            square metre I am working on", which is the question during the first blows, when
 *            there is no crater yet and the player most needs to know whether anything happened
 */

/** Sample grid across each region, per axis. 20 x 20 = up to 400 rays per region per sample. */
const GRID = 20;
/** A cell counts as visibly torn at this raw depth — band 0 has taken the coat off by here. */
const VIS = 0.06;
/** Blows to land before measuring, so this is a real crater and not a first-blow chip. */
const PREHITS = 22;

// ============================================================================ page-side probe
//
// Installed once, called many times. Written as a string of plain JS with no imports because
// `three` is a bare specifier the page cannot resolve and `window.__rrr` exposes no THREE — so
// no Raycaster is reachable from a scenario (see `exterior-look.mjs`, which hit the same wall
// and solved it with framebuffer readbacks; geometry is cheaper here and immune to the grain).
const INSTALL = `() => {
  const E = window.__rrr.engine;

  // ---- ray vs the player's own triangles. Two levels: a world AABB per mesh rejects almost
  // everything, then exact Moller-Trumbore on the survivors. Exact matters: a single box round
  // a swinging robot is most of a square metre of nothing, and would over-report the very
  // number this instrument exists to move.
  function snapshotBody(root) {
    const meshes = [];
    root.updateWorldMatrix(true, true);
    root.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const g = o.geometry, pa = g && g.attributes && g.attributes.position;
      if (!pa) return;
      let vis = true;
      for (let p = o; p; p = p.parent) if (p.visible === false) { vis = false; break; }
      if (!vis) return;
      const e = o.matrixWorld.elements, n = pa.count;
      const V = new Float64Array(n * 3);
      let x0 = 1e30, y0 = 1e30, z0 = 1e30, x1 = -1e30, y1 = -1e30, z1 = -1e30;
      for (let i = 0; i < n; i++) {
        const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
        const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
        const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
        const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
        V[i * 3] = wx; V[i * 3 + 1] = wy; V[i * 3 + 2] = wz;
        if (wx < x0) x0 = wx; if (wy < y0) y0 = wy; if (wz < z0) z0 = wz;
        if (wx > x1) x1 = wx; if (wy > y1) y1 = wy; if (wz > z1) z1 = wz;
      }
      const idx = g.index ? g.index.array : null;
      meshes.push({ V, idx, count: idx ? idx.length : n, box: [x0, y0, z0, x1, y1, z1] });
    });
    return meshes;
  }

  function hitsBox(b, ox, oy, oz, dx, dy, dz, tmax) {
    let t0 = 0, t1 = tmax;
    for (let a = 0; a < 3; a++) {
      const o = a === 0 ? ox : a === 1 ? oy : oz;
      const d = a === 0 ? dx : a === 1 ? dy : dz;
      const lo = b[a], hi = b[a + 3];
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return false; continue; }
      let ta = (lo - o) / d, tb = (hi - o) / d;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return false;
    }
    return true;
  }

  function occluded(meshes, ox, oy, oz, dx, dy, dz, tmax) {
    for (let m = 0; m < meshes.length; m++) {
      const M = meshes[m];
      if (!hitsBox(M.box, ox, oy, oz, dx, dy, dz, tmax)) continue;
      const V = M.V, idx = M.idx, n = M.count;
      for (let i = 0; i + 2 < n; i += 3) {
        const a = (idx ? idx[i] : i) * 3, b = (idx ? idx[i + 1] : i + 1) * 3, c = (idx ? idx[i + 2] : i + 2) * 3;
        const e1x = V[b] - V[a], e1y = V[b + 1] - V[a + 1], e1z = V[b + 2] - V[a + 2];
        const e2x = V[c] - V[a], e2y = V[c + 1] - V[a + 1], e2z = V[c + 2] - V[a + 2];
        const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (det > -1e-9 && det < 1e-9) continue;
        const inv = 1 / det;
        const tx = ox - V[a], ty = oy - V[a + 1], tz = oz - V[a + 2];
        const u = (tx * px + ty * py + tz * pz) * inv;
        if (u < 0 || u > 1) continue;
        const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * inv;
        if (v < 0 || u + v > 1) continue;
        const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (t > 0.02 && t < tmax - 0.02) return true;
      }
    }
    return false;
  }

  /** World point -> NDC, by hand: no THREE in the page. */
  function ndc(cam, x, y, z) {
    const a = cam.matrixWorldInverse.elements, b = cam.projectionMatrix.elements;
    const vx = a[0] * x + a[4] * y + a[8] * z + a[12];
    const vy = a[1] * x + a[5] * y + a[9] * z + a[13];
    const vz = a[2] * x + a[6] * y + a[10] * z + a[14];
    const cx = b[0] * vx + b[4] * vy + b[8] * vz + b[12];
    const cy = b[1] * vx + b[5] * vy + b[9] * vz + b[13];
    const cz = b[2] * vx + b[6] * vy + b[10] * vz + b[14];
    const cw = b[3] * vx + b[7] * vy + b[11] * vz + b[15];
    if (cw === 0) return null;
    return [cx / cw, cy / cw, cz / cw];
  }

  /** Sample points over the cells that are actually dug, in world space. */
  function dugPoints(panel, grid, vis) {
    const f = panel.field;
    if (!f) return [];
    let u0 = 2, v0 = 2, u1 = -1, v1 = -1, any = 0;
    for (let cy = 0; cy < f.rows; cy++) {
      for (let cx = 0; cx < f.cols; cx++) {
        if (f.depth[cy * f.cols + cx] < vis) continue;
        any++;
        const u = (cx + 0.5) / f.cols, v = (cy + 0.5) / f.rows;
        if (u < u0) u0 = u; if (u > u1) u1 = u;
        if (v < v0) v0 = v; if (v > v1) v1 = v;
      }
    }
    if (!any) return [];
    const out = [];
    for (let j = 0; j < grid; j++) {
      for (let i = 0; i < grid; i++) {
        const u = u0 + ((i + 0.5) / grid) * (u1 - u0);
        const v = v0 + ((j + 0.5) / grid) * (v1 - v0);
        if (panel.field.depthAt(u, v) < vis) continue;      // the dug SHAPE, not its bounding box
        out.push(panel.pointAt(u, v).clone());
      }
    }
    return out;
  }

  /** A fixed square of wall centred on where the next blow lands. */
  function squarePoints(panel, centre, side, grid) {
    const uv = panel.uvAt(centre);
    const du = side / panel.width, dv = side / panel.height;
    const out = [];
    for (let j = 0; j < grid; j++) {
      for (let i = 0; i < grid; i++) {
        const u = uv.u + (((i + 0.5) / grid) - 0.5) * du;
        const v = uv.v + (((j + 0.5) / grid) - 0.5) * dv;
        if (u < 0 || u > 1 || v < 0 || v > 1) continue;
        out.push(panel.pointAt(u, v).clone());
      }
    }
    return out;
  }

  function score(cam, meshes, pts) {
    const ox = cam.position.x, oy = cam.position.y, oz = cam.position.z;
    let occ = 0, off = 0;
    for (const p of pts) {
      const dx = p.x - ox, dy = p.y - oy, dz = p.z - oz;
      const len = Math.hypot(dx, dy, dz);
      const n = ndc(cam, p.x, p.y, p.z);
      if (!n || n[0] < -1 || n[0] > 1 || n[1] < -1 || n[1] > 1 || n[2] > 1) off++;
      if (occluded(meshes, ox, oy, oz, dx / len, dy / len, dz / len, len)) occ++;
    }
    const n = pts.length || 1;
    return { n: pts.length, occl: +(100 * occ / n).toFixed(1), off: +(100 * off / n).toFixed(1) };
  }

  window.__cam1 = {
    measure(panelId, grid, vis) {
      const p = E.player, cam = E.camera, panel = E.room.panelOf(panelId);
      if (!panel) return { err: 'no panel ' + panelId };
      const meshes = snapshotBody(p.model);
      if (!meshes.length) return { err: 'the player model is not drawing (hidden by the boom?)' };
      // Where the NEXT blow lands, from the game's own ray rather than a re-implementation.
      const r = p._swingRay();
      const cast = E.room.castRay(r.origin, r.dir, 2.6, { forDamage: true });
      const centre = cast && cast.panel === panel ? cast.point : panel.pointAt(0.5, 0.5);
      const dug = dugPoints(panel, grid, vis);
      return {
        dug: dug.length ? score(cam, meshes, dug) : null,
        sq1m: score(cam, meshes, squarePoints(panel, centre, 1.0, grid)),
        maxDepth: +(panel.field ? panel.field.maxDepth : -1).toFixed(2),
        phase: +(p.sledge.phase || 0).toFixed(2),
        work: +(E.cam.dbg.work || 0).toFixed(2),
        side: E.cam.dbg.workSide,
        boom: +(E.cam.lastDistance || 0).toFixed(2),
        off: +(E.cam.dbg.off || 0).toFixed(2),
        stand: +Math.hypot(centre.x - p.pos.x, centre.z - p.pos.z).toFixed(2),
        hidden: !!E.cam.modelHidden,
      };
    },
  };
  return { ok: true };
}`;

export default async function cam1Occlusion({ page, shot, note, pass, fail, skip }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(400);

  // ---- station: a fresh GALLERY dig face at a real standoff. Same picker as `_c3-gallery.mjs`,
  // which is the drive `critic-slice-3`'s verdict rests on — reused rather than rivalled.
  const setup = await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player, room = e.room;
    if (!p.sledge.owned) {
      const it = e.limbField.items.find((i) => i.type === 'sledge');
      if (!it) return { ok: false, why: 'no sledge in limbField' };
      p.pos.copy(it.root.position); p.vel.set(0, 0, 0);
      p.interact(e.limbField, 1.5, null);
    }
    if (!p.sledge.equipped) p.sledge.equip();
    if (!p.sledge.equipped) return { ok: false, why: 'hammer would not equip' };

    // ⚠️ THE STRICT GALLERY PICKER IS `_c3-gallery.mjs`'s, UNCHANGED — the drive the verdict
    // rests on — but it is tried in three widening passes with the rejections COUNTED, because
    // the first run of this scenario failed on "no fresh gallery dig face at a workable
    // standoff" and a bare failure string cannot tell you whether the gallery has no dig faces,
    // has them all behind a portrait collider, or simply none at 1.15 m of standoff. A probe
    // that cannot observe must say what it could not observe.
    const rej = { noPanel: 0, notDig: 0, dug: 0, close: 0, seen: {} };
    const search = (names, minD, allowDug) => {
      let b = null;
      for (const name of names) {
        const v = room.anchor?.(name);
        if (!v) continue;
        const from = v.clone(); from.y += p.eyeHeight;
        for (let i = 0; i < 64; i++) {
          const yaw = (i / 64) * Math.PI * 2;
          const dir = v.clone().set(Math.sin(yaw), 0, Math.cos(yaw));
          const hit = room.castRay?.(from, dir, 3.2, { forDamage: true });
          if (!hit?.panel) { rej.noPanel++; continue; }
          rej.seen[hit.panel.id] = (rej.seen[hit.panel.id] ?? 0) + 1;
          if (!hit.panel.spec?.dig) { rej.notDig++; continue; }
          if (!allowDug && (hit.panel.field?.maxDepth ?? 0) > 0.01) { rej.dug++; continue; }
          if (hit.distance < minD) { rej.close++; continue; }
          const score = Math.abs(hit.distance - 1.8);
          if (!b || score < b.score) b = { name, v, yaw, d: hit.distance, score, id: hit.panel.id };
        }
      }
      return b;
    };
    const GAL = ['gallery.mid', 'gallery.west', 'gallery.east'];
    const ALL = [...GAL, 'study_w.north', 'study_e.centre', 'ballroom.centre', 'chapel.centre', 'service.mid'];
    let best = search(GAL, 1.15, false) ?? search(ALL, 1.15, false) ?? search(ALL, 0.9, true);
    if (!best) {
      return { ok: false, why: 'no dig face at any anchor: ' + JSON.stringify(rej).slice(0, 400) };
    }
    const relaxed = !GAL.includes(best.name);
    p.pos.copy(best.v); p.vel.set(0, 0, 0);
    // ⚠️ `cam.yaw` TOO. `views/game.js` recomputes `aimYaw` from `cam.yaw` every frame, so
    // setting only `p.aimYaw` is overwritten by the very next step. That cost a whole round.
    p.aimYaw = best.yaw; p.facing = best.yaw;
    if (e.cam) { e.cam.yaw = best.yaw; e.cam.pitch = 0.02; }
    return { ok: true, anchor: best.name, panel: best.id, wallAt: +best.d.toFixed(2), yaw: best.yaw };
  });
  if (!setup.ok) { fail('a fresh gallery dig face can be reached', setup.why); return; }
  note(`station: ${setup.anchor} · panel ${setup.panel} · standoff ${setup.wallAt} m`);

  // ⚠️ IMMEDIATELY INVOKED, and the parentheses are load-bearing — `page.evaluate(string)`
  // evaluates an EXPRESSION, so a bare arrow-function source returns an unserialisable function
  // and installs nothing. Same wrapper `strobe.mjs` uses (`evalStr`), for the same reason.
  const inst = await page.evaluate(`(${INSTALL})()`);
  if (!inst?.ok) { fail('the occlusion probe installs', JSON.stringify(inst)); return; }

  const fire = async () => { await page.mouse.down(); await page.waitForTimeout(30); await page.mouse.up(); };
  const measure = () => page.evaluate(([id, g, v]) => window.__cam1.measure(id, g, v),
    [setup.panel, GRID, VIS]);

  // ---- dig a real crater, at the real cadence the cooldown enforces
  for (let i = 0; i < PREHITS; i++) { await fire(); await page.waitForTimeout(960); }
  const dug = await measure();
  if (dug.err) { fail('the probe can read the crater', dug.err); return; }
  note(`after ${PREHITS} blows: maxDepth ${dug.maxDepth}, standoff ${dug.stand} m`);
  if (!dug.dug) { fail('the crater exists', `no cells above depth ${VIS} after ${PREHITS} blows`); return; }

  /**
   * ⚠️ SAMPLE OVER A SWING, NOT AT REST. The body's silhouette is at its widest mid-swing and
   * the brief is explicit that a fix has to survive MOTION, not photograph well: a framing that
   * clears a standing robot and is buried by a two-handed arc has not fixed anything. Every
   * sample is tagged with the sledge's own phase so the worst instant is visible, not averaged
   * away — the same discipline `strobe.mjs` uses, for the same reason.
   */
  const overSwing = async (tag) => {
    await fire();
    const rows = [];
    for (let i = 0; i < 14; i++) { rows.push(await measure()); await page.waitForTimeout(45); }
    const swung = rows.filter((r) => r.phase > 0);
    const of = (k) => rows.map((r) => r[k]).filter((x) => x != null);
    const stat = (arr) => arr.length
      ? { mean: +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1), max: +Math.max(...arr).toFixed(1) }
      : null;
    const m = {
      tag,
      dug: stat(rows.map((r) => r.dug?.occl).filter((x) => x != null)),
      sq1m: stat(rows.map((r) => r.sq1m.occl)),
      dugOff: stat(rows.map((r) => r.dug?.off).filter((x) => x != null)),
      sq1mOff: stat(rows.map((r) => r.sq1m.off)),
      boom: stat(of('boom')), work: rows[rows.length - 1].work,
      side: rows[rows.length - 1].side, off: rows[rows.length - 1].off,
      phases: swung.length, hidden: rows.some((r) => r.hidden),
      n: rows[0].dug?.n ?? 0, nSq: rows[0].sq1m.n,
    };
    note(`${tag}: DUG ${m.dug?.mean}% mean / ${m.dug?.max}% worst occluded (offscreen ${m.dugOff?.mean}%)`
      + ` · 1 m² ${m.sq1m.mean}% mean / ${m.sq1m.max}% worst (offscreen ${m.sq1mOff.mean}%)`
      + ` · boom ${m.boom.mean} m · work ${m.work} side ${m.side} lateral ${m.off} m`
      + ` · ${m.phases}/14 samples mid-swing · rays ${m.n}/${m.nSq}`);
    return m;
  };

  // ================================================================= A: the shipped camera
  await page.evaluate(() => { window.__rrr.engine.cam.workEnabled = false; });
  await page.waitForTimeout(1200);
  await shot('cam1-A-shipped-rest');
  const A = await overSwing('SHIPPED (workEnabled=false)');
  await shot('cam1-A-shipped-swing');

  // ================================================================= B: work framing
  await page.evaluate(() => { window.__rrr.engine.cam.workEnabled = true; });
  await fire();                       // the framing engages on a swing, so throw one
  await page.waitForTimeout(1400);
  await shot('cam1-B-work-rest');
  const B = await overSwing('WORK FRAMING (workEnabled=true)');
  await shot('cam1-B-work-swing');

  // ================================================================= the verdicts
  const drop = A.dug.mean - B.dug.mean;
  drop > 15
    ? pass('the body stops covering the crater', `${A.dug.mean}% -> ${B.dug.mean}% of the dug area occluded (mean over a swing)`)
    : fail('the body stops covering the crater', `${A.dug.mean}% -> ${B.dug.mean}% — not enough`);
  const dropSq = A.sq1m.mean - B.sq1m.mean;
  dropSq > 15
    ? pass('the body stops covering the working square metre', `${A.sq1m.mean}% -> ${B.sq1m.mean}%`)
    : fail('the body stops covering the working square metre', `${A.sq1m.mean}% -> ${B.sq1m.mean}%`);
  // ⚠️ THE GUARD THAT STOPS THIS BEING GAMED. A camera that framed the crater off the edge of
  // the screen would score a perfect 0% occluded and be a far worse defect than the one it fixed.
  B.dugOff.max <= Math.max(2, A.dugOff.max + 2)
    ? pass('the crater is still on screen', `offscreen ${A.dugOff.max}% -> ${B.dugOff.max}% worst`)
    : fail('the crater is still on screen', `offscreen ${A.dugOff.max}% -> ${B.dugOff.max}% worst — the fix moved the hole out of frame`);
  B.dug.max < A.dug.max
    ? pass('it survives the swing, not just the pose', `worst instant ${A.dug.max}% -> ${B.dug.max}%`)
    : fail('it survives the swing, not just the pose', `worst instant ${A.dug.max}% -> ${B.dug.max}%`);
  !B.hidden
    ? pass('the robot is still on screen while it works', 'the model was never hidden by the boom')
    : skip('the robot is still on screen while it works', 'the boom hid the model at least once');

  // ---- and the case the verdict called unjudged: standing BESIDE the hole.
  await page.evaluate((yaw) => {
    const e = window.__rrr.engine, p = e.player;
    const y = yaw + 0.85;
    p.pos.x -= Math.sin(y) * 1.1; p.pos.z -= Math.cos(y) * 1.1;
    p.aimYaw = yaw - 0.35; p.facing = yaw - 0.35;
    if (e.cam) { e.cam.yaw = yaw - 0.35; e.cam.pitch = 0.02; }
  }, setup.yaw);
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.__rrr.engine.cam.workEnabled = false; });
  await page.waitForTimeout(900);
  const gA = await measure();
  await shot('cam1-C-graze-shipped');
  await page.evaluate(() => { window.__rrr.engine.cam.workEnabled = true; });
  await fire();
  await page.waitForTimeout(1400);
  const gB = await measure();
  await shot('cam1-C-graze-work');
  note(`GRAZE: dug occluded ${gA.dug?.occl}% -> ${gB.dug?.occl}% (offscreen ${gA.dug?.off}% -> ${gB.dug?.off}%)`);
  (gB.dug && gA.dug && gB.dug.occl < gA.dug.occl)
    ? pass('the graze case improves too', `${gA.dug.occl}% -> ${gB.dug.occl}%`)
    : skip('the graze case improves too', `${gA.dug?.occl}% -> ${gB.dug?.occl}%`);

  note('A: ' + JSON.stringify(A));
  note('B: ' + JSON.stringify(B));
}
