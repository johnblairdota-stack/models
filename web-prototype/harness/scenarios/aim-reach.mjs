/**
 * 🎯 **DOES THE STANDOFF STILL WRITE TO THE IMPACT HEIGHT?** — the instrument for John's
 * *"the need to stand closer or further away sometimes to hit lower or higher"*.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/aim-reach.mjs \
 *        --port 5381 --q "seed=s4" --shots
 *
 * ===========================================================================================
 * WHAT IT MEASURES, AND WHY IN THIS FORM
 * ===========================================================================================
 *
 * `Player._swingRay` is the ONE definition of "what am I about to hit" — `_stepWorkAim` frames
 * it, `AimMark` draws it and `_resolveSledgeHit` damages with it. So the question "where does
 * the blow land" has exactly one honest answer: build that ray and cast it. Every figure below
 * is `castRay(...)` on the ray the game itself would swing, never a re-implementation of the
 * arithmetic — a reproduction would go stale the moment the model changed, which is the whole
 * reason `critic-dig-8`'s sheet measurement carries the same warning.
 *
 * **Sections R1–R3 run entirely inside one `page.evaluate` and no frame advances between the
 * samples.** That is not a speed trick: `views/game.js` recomputes `player.aimPitch` from
 * `cam.pitch` on EVERY frame, so a scripted pitch that survives a `waitForTimeout` is a
 * different quantity from the one that was set. Set it, cast it, read it, in one turn.
 *
 * ===========================================================================================
 * 🚨 THE CONTROL, AND IT IS THE POINT OF THE FILE
 * ===========================================================================================
 *
 * `Player.aimDecoupled = false` restores the shipped fixed-tilt ray byte-for-byte. **Every
 * assertion below is run on BOTH arms, every run, and the coupled arm is asserted to FAIL the
 * decoupling bar.** A probe that reported "decoupled" for a build that is not is worth less than
 * no probe — of the ~16 instruments in `instruments.md` that lied, twelve would have gone red on
 * their first run against an arm that must fail. R2c is that arm.
 *
 * ⚠️ **WHAT IT CANNOT TELL YOU:**
 *   · Nothing about feel. It measures a height in metres. Whether sliding the mark down a wall
 *     with the mouse is SATISFYING is John's call and no number here speaks to it.
 *   · Nothing about the LOOK of the mark, and nothing about the shots except that they exist.
 *   · R4's occlusion is geometry, not pixels — a crater that is unoccluded and unreadable for
 *     some other reason scores a clean 0%. `offScreen` is printed beside every figure and must
 *     be read with it: a camera that framed the hole off the edge would also score 0%.
 *   · One face is one face. R1–R3 sweep one gallery face; a different plan geometry is a
 *     different measurement.
 */

/** Standoffs swept, in metres. All four are inside the reach sphere's floor-reaching band. */
const STANDS = [0.70, 1.00, 1.30, 1.60];
/** Pitches sampled, in radians. NEGATIVE IS DOWN in this codebase — see `Player`'s aim block. */
const PITCHES = [0.20, 0.00, -0.20, -0.40, -0.60, -0.95];
/** A decoupled arm may not vary by more than this across the standoff sweep, in metres. */
const TOL = 0.05;
/** ...and the coupled arm must vary by AT LEAST this, or this probe is not measuring aim. */
const CONTROL_MIN = 0.20;
/** A blow centred at or below this leaves a remainder a robot steps over (`rules.js` STEP_H). */
const LOW_BAND = 0.55;
/** Sample grid per axis for the occlusion rays. 20 x 20 = up to 400 per region. */
const GRID = 20;
/** A cell counts as visibly torn at this raw depth — band 0 has taken the coat off by here. */
const VIS = 0.06;
/**
 * Blows landed before the occlusion arms are measured.
 *
 * 🚨 **FOUR, NOT TWENTY, AND THE FIRST RUN OF THIS FILE IS WHY.** HANDOFF's own figure is that a
 * channel goes clean through one face in **7 blows** at the shipped ×8 base. At 20 the face was
 * open, so `_swingRay`'s cast went STRAIGHT THROUGH THE HOLE, `workAim` went null, the work
 * framing never engaged (boom sat at its full 3.1 m) and the occlusion probe silently fell back
 * to the panel's own centre — it reported an honest-looking `aimY 1.4` for both arms, which is
 * `pointAt(0.5, 0.5)` and not an aim at all. **The fallback is now reported (`onPanel`) instead
 * of being invisible, and the centre is solved against the panel's PLANE so it is a real aim
 * point whether or not there is material left at it.**
 */
const PREHITS = 4;

// ============================================================================ page-side probes
//
// Plain JS, no imports: `three` is a bare specifier the page cannot resolve and `window.__rrr`
// exposes no THREE, so no Raycaster is reachable from a scenario. Same constraint (and the same
// hand-rolled Moller-Trumbore) as `_cam1-occlusion.mjs`, whose occlusion core this reuses so the
// two files report the SAME quantity and their numbers can be put side by side.
const INSTALL = `() => {
  const E = window.__rrr.engine;

  function snapshotBody(root) {
    const meshes = [];
    root.updateWorldMatrix(true, true);
    root.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const g = o.geometry, pa = g && g.attributes && g.attributes.position;
      if (!pa) return;
      for (let p = o; p; p = p.parent) if (p.visible === false) return;
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
      if (Math.abs(d) < 1e-9) { if (o < b[a] || o > b[a + 3]) return false; continue; }
      let ta = (b[a] - o) / d, tb = (b[a + 3] - o) / d;
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
  function ndc(cam, x, y, z) {
    const a = cam.matrixWorldInverse.elements, b = cam.projectionMatrix.elements;
    const vx = a[0] * x + a[4] * y + a[8] * z + a[12];
    const vy = a[1] * x + a[5] * y + a[9] * z + a[13];
    const vz = a[2] * x + a[6] * y + a[10] * z + a[14];
    const cx = b[0] * vx + b[4] * vy + b[8] * vz + b[12];
    const cy = b[1] * vx + b[5] * vy + b[9] * vz + b[13];
    const cw = b[3] * vx + b[7] * vy + b[11] * vz + b[15];
    if (cw === 0) return null;
    return [cx / cw, cy / cw];
  }
  function score(cam, meshes, pts) {
    const ox = cam.position.x, oy = cam.position.y, oz = cam.position.z;
    let occ = 0, off = 0;
    for (const p of pts) {
      const dx = p.x - ox, dy = p.y - oy, dz = p.z - oz;
      const len = Math.hypot(dx, dy, dz);
      const n = ndc(cam, p.x, p.y, p.z);
      if (!n || n[0] < -1 || n[0] > 1 || n[1] < -1 || n[1] > 1) off++;
      if (occluded(meshes, ox, oy, oz, dx / len, dy / len, dz / len, len)) occ++;
    }
    const n = pts.length || 1;
    return { n: pts.length, occl: +(100 * occ / n).toFixed(1), off: +(100 * off / n).toFixed(1) };
  }
  function dugPoints(panel, grid, vis) {
    const f = panel.field;
    if (!f) return [];
    let u0 = 2, v0 = 2, u1 = -1, v1 = -1, any = 0;
    for (let cy = 0; cy < f.rows; cy++) for (let cx = 0; cx < f.cols; cx++) {
      if (f.depth[cy * f.cols + cx] < vis) continue;
      any++;
      const u = (cx + 0.5) / f.cols, v = (cy + 0.5) / f.rows;
      if (u < u0) u0 = u; if (u > u1) u1 = u;
      if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    if (!any) return [];
    const out = [];
    for (let j = 0; j < grid; j++) for (let i = 0; i < grid; i++) {
      const u = u0 + ((i + 0.5) / grid) * (u1 - u0);
      const v = v0 + ((j + 0.5) / grid) * (v1 - v0);
      if (f.depthAt(u, v) < vis) continue;
      out.push(panel.pointAt(u, v).clone());
    }
    return out;
  }
  function squarePoints(panel, centre, side, grid) {
    const uv = panel.uvAt(centre);
    const du = side / panel.width, dv = side / panel.height;
    const out = [];
    for (let j = 0; j < grid; j++) for (let i = 0; i < grid; i++) {
      const u = uv.u + (((i + 0.5) / grid) - 0.5) * du;
      const v = uv.v + (((j + 0.5) / grid) - 0.5) * dv;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      out.push(panel.pointAt(u, v).clone());
    }
    return out;
  }

  /** THE ONE ANSWER: build the game's own swing ray and cast it. Never re-derived. */
  function impact(p) {
    const r = p._swingRay();
    const hit = E.room.castRay(r.origin, r.dir, 2.45, { forDamage: true });
    if (!hit) return { y: null, why: 'no hit' };
    return {
      y: +hit.point.y.toFixed(4),
      panel: hit.panel ? hit.panel.id : null,
      dist: +hit.distance.toFixed(3),
    };
  }

  window.__reach = {
    /** A face to sweep, plus the (x, z) line normal to it that the standoffs run along. */
    station(anchors) {
      const p = E.player, room = E.room;
      let best = null;
      for (const name of anchors) {
        const v = room.anchor && room.anchor(name);
        if (!v) continue;
        const from = v.clone(); from.y += p.eyeHeight;
        for (let i = 0; i < 64; i++) {
          const yaw = (i / 64) * Math.PI * 2;
          const dir = v.clone().set(Math.sin(yaw), 0, Math.cos(yaw));
          const hit = room.castRay(from, dir, 3.4, { forDamage: true });
          if (!hit || !hit.panel || !hit.panel.spec || !hit.panel.spec.dig) continue;
          if (hit.distance < 1.7) continue;         // room to step BACK to 1.60 m
          const s = Math.abs(hit.distance - 2.2);
          if (!best || s < best.s) best = { name, yaw, s, d: hit.distance, id: hit.panel.id,
            wx: hit.point.x, wz: hit.point.z };
        }
      }
      return best;
    },

    /**
     * THE SWEEP. One turn, no frame in between — see the header on why that is required and not
     * an optimisation. Restores every field it touched before returning.
     */
    sweep(st, stands, pitches, decoupled) {
      const p = E.player;
      const keep = { x: p.pos.x, z: p.pos.z, yaw: p.aimYaw, pitch: p.aimPitch, dec: p.aimDecoupled };
      p.aimDecoupled = decoupled;
      p.aimYaw = st.yaw;
      const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
      const rows = [];
      for (const d of stands) {
        p.pos.x = st.wx - fx * d; p.pos.z = st.wz - fz * d;
        const cells = [];
        for (const q of pitches) { p.aimPitch = q; cells.push(impact(p)); }
        // ⚠️ THE MEASURED STANDOFF, NOT THE ONE ASKED FOR. The station's own reference point sits
        // on whatever trace box the scan hit, and the face probe answers from the eye against the
        // boxes that are there now — the two can differ by a wall skin. Report what was measured.
        rows.push({ d, cells, eye: +p.eyeHeight.toFixed(4),
          faceD: p.aimFace ? +p.aimFace.d.toFixed(3) : null });
      }
      p.pos.x = keep.x; p.pos.z = keep.z;
      p.aimYaw = keep.yaw; p.aimPitch = keep.pitch; p.aimDecoupled = keep.dec;
      return rows;
    },

    /**
     * THE LOW-BLOW WINDOW: what fraction of the down half of the look clamp puts the blow's
     * centre in the bottom "band" metres of the wall, at each standoff. This is the number
     * John's sentence is about — how much of the control range is spent reaching the skirting,
     * and whether that answer moves when you shuffle.
     */
    window(st, stands, band, decoupled) {
      const p = E.player;
      const keep = { x: p.pos.x, z: p.pos.z, yaw: p.aimYaw, pitch: p.aimPitch, dec: p.aimDecoupled };
      p.aimDecoupled = decoupled;
      p.aimYaw = st.yaw;
      const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
      const N = 96, out = [];
      for (const d of stands) {
        p.pos.x = st.wx - fx * d; p.pos.z = st.wz - fz * d;
        let inBand = 0, onFace = 0, lowest = 99, lowPitch = null;
        for (let i = 0; i <= N; i++) {
          const q = -0.95 * (i / N);               // the DOWN half of the clamp, 0 -> -0.95
          p.aimPitch = q;
          const r = impact(p);
          if (r.y == null || r.panel == null) continue;
          onFace++;
          if (r.y < lowest) { lowest = r.y; lowPitch = +q.toFixed(3); }
          if (r.y <= band) inBand++;
        }
        out.push({
          d, pctOfDownClamp: +(100 * inBand / (N + 1)).toFixed(1),
          pctOnFace: +(100 * onFace / (N + 1)).toFixed(1),
          lowest: lowest === 99 ? null : +lowest.toFixed(3), lowPitch,
        });
      }
      p.pos.x = keep.x; p.pos.z = keep.z;
      p.aimYaw = keep.yaw; p.aimPitch = keep.pitch; p.aimDecoupled = keep.dec;
      return out;
    },

    /** The lowest pitch that still lands ON the face, for the arm currently selected. */
    bestLowPitch() {
      const p = E.player;
      const keep = p.aimPitch;
      let lowest = 99, at = 0;
      for (let i = 0; i <= 96; i++) {
        const q = -0.95 * (i / 96);
        p.aimPitch = q;
        const r = impact(p);
        if (r.y == null || r.panel == null) continue;
        if (r.y < lowest) { lowest = r.y; at = +q.toFixed(3); }
      }
      p.aimPitch = keep;
      return { pitch: at, y: lowest === 99 ? null : +lowest.toFixed(3) };
    },

    occl(panelId, grid, vis) {
      const p = E.player, cam = E.camera, panel = E.room.panelOf(panelId);
      if (!panel) return { err: 'no panel ' + panelId };
      const meshes = snapshotBody(p.model);
      if (!meshes.length) return { err: 'the player model is not drawing (hidden by the boom?)' };
      const r = p._swingRay();
      const cast = E.room.castRay(r.origin, r.dir, 2.45, { forDamage: true });
      // ⚠️ THE AIM POINT IS SOLVED AGAINST THE FACE'S PLANE, NOT TAKEN FROM THE CAST. Once the
      // dig opens a hole the cast goes through it and lands somewhere else entirely, and the old
      // fallback (the panel's own centre) turned that into a plausible-looking height. The plane
      // is where the player is aiming whether or not material is left there.
      const n = panel.normal, o = r.origin, d = r.dir, c = panel.root.position;
      const den = d.x * n.x + d.y * n.y + d.z * n.z;
      let centre = null;
      if (Math.abs(den) > 1e-6) {
        const t = ((c.x - o.x) * n.x + (c.y - o.y) * n.y + (c.z - o.z) * n.z) / den;
        if (t > 0 && t < 3.2) centre = o.clone().addScaledVector(d, t);
      }
      const onPlane = !!centre;
      if (!centre) centre = panel.pointAt(0.5, 0.5);
      const dug = dugPoints(panel, grid, vis);
      return {
        dug: dug.length ? score(cam, meshes, dug) : null,
        sq1m: score(cam, meshes, squarePoints(panel, centre, 1.0, grid)),
        aimY: +centre.y.toFixed(3),
        onPlane,
        onPanel: !!(cast && cast.panel === panel),
        workAim: !!p.workAim,
        phase: +(p.sledge.phase || 0).toFixed(2),
        boom: +(E.cam.lastDistance || 0).toFixed(2),
        work: +((E.cam.dbg && E.cam.dbg.work) || 0).toFixed(2),
        stand: +Math.hypot(centre.x - p.pos.x, centre.z - p.pos.z).toFixed(2),
        hidden: !!E.cam.modelHidden,
      };
    },
  };
  return { ok: true };
}`;

const ANCHORS = ['gallery.mid', 'gallery.west', 'gallery.east', 'study_w.north',
  'study_e.centre', 'ballroom.centre', 'chapel.centre', 'service.mid'];

const spread = (ys) => {
  const v = ys.filter((y) => y != null);
  return v.length < 2 ? null : +(Math.max(...v) - Math.min(...v)).toFixed(3);
};

export default async function aimReach({ page, note, pass, fail, skip, shot }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(400);

  const inst = await page.evaluate(`(${INSTALL})()`);
  if (!inst?.ok) { fail('the reach probe installs', JSON.stringify(inst)); return; }

  // ---- the hammer, and a face with room behind it to step back from
  const setup = await page.evaluate((anchors) => {
    const e = window.__rrr.engine, p = e.player;
    if (!p.sledge.owned) {
      const it = e.limbField.items.find((i) => i.type === 'sledge');
      if (!it) return { ok: false, why: 'no sledge prop in limbField' };
      p.pos.copy(it.root.position); p.vel.set(0, 0, 0);
      p.interact(e.limbField, 1.5, null);
    }
    if (!p.sledge.equipped) p.sledge.equip();
    if (!p.sledge.equipped) return { ok: false, why: 'the hammer would not equip' };
    const st = window.__reach.station(anchors);
    if (!st) return { ok: false, why: 'no dig face at >= 1.7 m from any of 8 anchors' };
    return { ok: true, st, eye: +p.eyeHeight.toFixed(4), floorY: e.room.floorY };
  }, ANCHORS);
  if (!setup.ok) { fail('a dig face with room to step back from is reachable', setup.why); return; }
  const ST = setup.st;
  note(`station: ${ST.name} · face ${ST.id} · eye ${setup.eye} m · floorY ${setup.floorY}`);

  // ================================================== R1/R2: height vs pitch, height vs standoff
  const [B, A] = await page.evaluate(([st, stands, pitches]) => [
    window.__reach.sweep(st, stands, pitches, false),   // BEFORE — the shipped fixed-tilt ray
    window.__reach.sweep(st, stands, pitches, true),    // AFTER  — pitch alone
  ], [ST, STANDS, PITCHES]);

  const table = (rows, tag) => {
    note(`--- ${tag}: impact height (m) by pitch (rad, NEGATIVE = DOWN) x standoff (m) ---`);
    note(`   pitch: ${PITCHES.map((q) => String(q.toFixed(2)).padStart(7)).join('')}`);
    for (const r of rows) {
      note(`  d=${r.d.toFixed(2)}${r.faceD != null ? ` (probe read ${r.faceD.toFixed(2)})` : ''}: `
        + `${r.cells.map((c) => String(c.y == null ? 'MISS' : c.y.toFixed(3)).padStart(7)).join('')}`);
    }
    note(`   spread: ${PITCHES.map((_, i) => {
      const s = spread(rows.map((r) => r.cells[i].y));
      return String(s == null ? '--' : s.toFixed(3)).padStart(7);
    }).join('')}   <- standoff coupling, metres`);
  };
  table(B, 'BEFORE (aimDecoupled = false, the shipped ray)');
  table(A, 'AFTER  (aimDecoupled = true)');

  // R1 — the deliverable, at ONE fixed standoff: is height a clean function of pitch alone?
  const fixed = A.find((r) => r.d === 1.30) ?? A[0];
  const fixedB = B.find((r) => r.d === 1.30) ?? B[0];
  note(`R1 at a FIXED ${fixed.d} m standoff — pitch -> impact y`);
  note(`  before: ${PITCHES.map((q, i) => `${q.toFixed(2)}->${fixedB.cells[i].y == null ? 'MISS' : fixedB.cells[i].y.toFixed(2)}`).join('  ')}`);
  note(`  after:  ${PITCHES.map((q, i) => `${q.toFixed(2)}->${fixed.cells[i].y == null ? 'MISS' : fixed.cells[i].y.toFixed(2)}`).join('  ')}`);
  const monotone = fixed.cells.every((c, i) => i === 0 || c.y == null || fixed.cells[i - 1].y == null
    || c.y <= fixed.cells[i - 1].y + 1e-6);
  const onFaceAfter = fixed.cells.filter((c) => c.panel != null).length;
  (monotone && onFaceAfter === PITCHES.length)
    ? pass('R1 at a fixed standoff, looking down never stops lowering the blow and never leaves the face',
      `${onFaceAfter}/${PITCHES.length} pitches land on a panel, heights are monotone down`)
    : fail('R1 at a fixed standoff, looking down never stops lowering the blow and never leaves the face',
      `${onFaceAfter}/${PITCHES.length} on a panel, monotone=${monotone}`);

  /**
   * R2 — THE CLAIM, IN TWO HALVES, BECAUSE THE MECHANIC HAS TWO REGIMES AND ONLY ONE OF THEM IS
   * THE DEFECT.
   *
   *   R2a  INSIDE THE ARM'S REACH the height must not move at all when only the standoff does.
   *        Measured over the three nearest standoffs, where a 1.7 m arm can put the blow anywhere
   *        from the floor upward.
   *   R2b  AT THE EDGE OF REACH the height may move — but ONLY UPWARD. Standing further back is
   *        allowed to cost you the bottom of the wall (it is a shorter arm, honestly modelled);
   *        it is not allowed to move the aim somewhere ELSE. That asymmetry is the whole
   *        difference between a reach limit and the coupling John filed.
   *
   * ⚠️ Written so it needs no knowledge of `AIM_MARGIN` or the reach formula — a probe that
   * re-derives the implementation's own arithmetic goes green on a build that has silently
   * changed underneath it.
   */
  const near = A.slice(0, 3), nearB = B.slice(0, 3);
  const worstA = Math.max(...PITCHES.map((_, i) => spread(near.map((r) => r.cells[i].y)) ?? 0));
  const worstB = Math.max(...PITCHES.map((_, i) => spread(nearB.map((r) => r.cells[i].y)) ?? 0));
  const allA = Math.max(...PITCHES.map((_, i) => spread(A.map((r) => r.cells[i].y)) ?? 0));
  const allB = Math.max(...PITCHES.map((_, i) => spread(B.map((r) => r.cells[i].y)) ?? 0));
  note(`R2 worst standoff coupling: over ${STANDS[0]}–${STANDS[2]} m before ${worstB.toFixed(3)} m, `
    + `after ${worstA.toFixed(3)} m · over all four standoffs before ${allB.toFixed(3)} m, after ${allA.toFixed(3)} m`);
  worstA <= TOL
    ? pass('R2a inside the arm\'s reach the impact height does not depend on where the player is standing',
      `worst spread ${worstA.toFixed(3)} m across ${near.length} standoffs (bar ${TOL} m); was ${worstB.toFixed(3)} m`)
    : fail('R2a inside the arm\'s reach the impact height does not depend on where the player is standing',
      `worst spread ${worstA.toFixed(3)} m across ${near.length} standoffs, bar is ${TOL} m`);
  const farRow = A[A.length - 1];
  const downward = PITCHES.map((_, i) => {
    const f = farRow.cells[i].y, ns = near.map((r) => r.cells[i].y).filter((y) => y != null);
    return f == null || !ns.length ? 0 : +(Math.min(...ns) - f).toFixed(3);
  });
  const worstDown = Math.max(...downward);
  note(`R2b at the far standoff the aim moves DOWN by at most ${worstDown.toFixed(3)} m `
    + `(per pitch: ${downward.map((x) => x.toFixed(2)).join(' ')})`);
  worstDown <= TOL
    ? pass('R2b at the edge of reach, standing back can only cost you the bottom of the wall, never move the aim',
      `no pitch lands lower from further away (worst ${worstDown.toFixed(3)} m, bar ${TOL} m)`)
    : fail('R2b at the edge of reach, standing back can only cost you the bottom of the wall, never move the aim',
      `a pitch landed ${worstDown.toFixed(3)} m LOWER from the far standoff`);

  /**
   * 🚨 **R2c — THE CONTROL, AND IT MUST FAIL THE BAR ABOVE.** Same station, same pitches, same
   * cast, one field different. If the shipped ray ever reports a flat height across the standoff
   * sweep then this probe is not measuring aim at all and R2's green is meaningless.
   */
  worstB >= CONTROL_MIN
    ? pass('R2c CONTROL: the shipped ray really is standoff-coupled, so R2 is measuring something',
      `worst spread ${worstB.toFixed(3)} m >= ${CONTROL_MIN} m on aimDecoupled=false (all four standoffs: ${allB.toFixed(3)} m)`)
    : fail('R2c CONTROL: the shipped ray really is standoff-coupled, so R2 is measuring something',
      `the CONTROL ARM PASSED the decoupling bar (${worstB.toFixed(3)} m) — this probe is lying, ignore R2`);

  // ================================================== R3: what the down half of the clamp buys
  const [wB, wA] = await page.evaluate(([st, stands, band]) => [
    window.__reach.window(st, stands, band, false),
    window.__reach.window(st, stands, band, true),
  ], [ST, STANDS, LOW_BAND]);
  note(`--- R3: reaching the bottom ${LOW_BAND} m of the wall (the rewarded undercut) ---`);
  for (let i = 0; i < STANDS.length; i++) {
    note(`  d=${STANDS[i].toFixed(2)}  before: ${String(wB[i].pctOfDownClamp).padStart(5)}% of the down clamp lands low`
      + ` · lowest reachable ${wB[i].lowest == null ? 'n/a' : wB[i].lowest.toFixed(2)} m at pitch ${wB[i].lowPitch}`
      + ` · ${wB[i].pctOnFace}% of the down clamp lands on the face at all`);
    note(`            after:  ${String(wA[i].pctOfDownClamp).padStart(5)}% `
      + `· lowest reachable ${wA[i].lowest == null ? 'n/a' : wA[i].lowest.toFixed(2)} m at pitch ${wA[i].lowPitch}`
      + ` · ${wA[i].pctOnFace}% lands on the face at all`);
  }
  const reachedA = wA.filter((r) => r.lowest != null && r.lowest <= LOW_BAND).length;
  const reachedB = wB.filter((r) => r.lowest != null && r.lowest <= LOW_BAND).length;
  reachedA === STANDS.length
    ? pass('R3 the skirting is reachable from EVERY standoff in the envelope',
      `${reachedA}/${STANDS.length} standoffs (was ${reachedB}/${STANDS.length})`)
    : fail('R3 the skirting is reachable from EVERY standoff in the envelope',
      `${reachedA}/${STANDS.length} standoffs can put the blow at or below ${LOW_BAND} m`);
  const winA = wA.map((r) => r.pctOfDownClamp), winB = wB.map((r) => r.pctOfDownClamp);
  const varA = +(Math.max(...winA) - Math.min(...winA)).toFixed(1);
  const varB = +(Math.max(...winB) - Math.min(...winB)).toFixed(1);
  note(`R3 how much the low-aim window CHANGES as you shuffle: before ${varB} points, after ${varA} points`);
  varA < varB
    ? pass('R3 shuffling forward and back stops rewriting the control you aim with',
      `the low-aim window varies ${varA} points across the sweep, was ${varB}`)
    : fail('R3 shuffling forward and back stops rewriting the control you aim with',
      `${varA} points vs ${varB} before — no improvement`);

  // ================================================== R4: what the body covers, at a LOW aim
  //
  // ⚠️ BOTH ARMS AIM AS LOW AS THEY CAN, which is the honest comparison: the player is trying to
  // undercut. `bestLowPitch` sweeps the arm's own reachable range rather than assuming a pitch
  // that means different things on the two arms.
  const park = await page.evaluate((st) => {
    const e = window.__rrr.engine, p = e.player;
    const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
    p.pos.x = st.wx - fx * 1.4; p.pos.z = st.wz - fz * 1.4; p.vel.set(0, 0, 0);
    p.aimYaw = st.yaw; p.facing = st.yaw;
    // ⚠️ `cam.yaw`/`cam.pitch` TOO — `views/game.js` rebuilds `player.aimYaw`/`aimPitch` from the
    // camera every frame, so setting only the player is overwritten by the next one. That trap
    // has cost this project a whole round before; see `_cam1-occlusion.mjs`'s own note.
    if (e.cam) { e.cam.yaw = st.yaw; e.cam._first = true; }
    return { pos: [+p.pos.x.toFixed(2), +p.pos.z.toFixed(2)] };
  }, ST);
  note(`R4 parked 1.40 m off ${ST.id} at ${JSON.stringify(park.pos)}`);
  await page.waitForTimeout(500);

  const fire = async () => { await page.mouse.down(); await page.waitForTimeout(30); await page.mouse.up(); };
  const armTo = (decoupled) => page.evaluate((dec) => {
    const e = window.__rrr.engine, p = e.player;
    p.aimDecoupled = dec;
    const b = window.__reach.bestLowPitch();
    if (e.cam) e.cam.pitch = b.pitch;
    p.aimPitch = b.pitch;
    return b;
  }, decoupled);

  const overSwing = async (tag) => {
    await fire();
    const rows = [];
    for (let i = 0; i < 14; i++) { rows.push(await page.evaluate(([id, g, v]) =>
      window.__reach.occl(id, g, v), [ST.id, GRID, VIS])); await page.waitForTimeout(45); }
    if (rows[0].err) return { tag, err: rows[0].err };
    const stat = (arr) => (arr.length
      ? { mean: +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1), max: +Math.max(...arr).toFixed(1) }
      : null);
    const m = {
      tag,
      dug: stat(rows.map((r) => r.dug?.occl).filter((x) => x != null)),
      sq1m: stat(rows.map((r) => r.sq1m.occl)),
      dugOff: stat(rows.map((r) => r.dug?.off).filter((x) => x != null)),
      sq1mOff: stat(rows.map((r) => r.sq1m.off)),
      aimY: stat(rows.map((r) => r.aimY)),
      boom: stat(rows.map((r) => r.boom)),
      work: stat(rows.map((r) => r.work)),
      swung: rows.filter((r) => r.phase > 0).length,
      onPlane: rows.filter((r) => r.onPlane).length,
      onPanel: rows.filter((r) => r.onPanel).length,
      workAim: rows.filter((r) => r.workAim).length,
      hidden: rows.some((r) => r.hidden),
      n: rows[0].dug?.n ?? 0, nSq: rows[0].sq1m.n,
    };
    note(`${tag}: aim y ${m.aimY.mean} m · DUG ${m.dug?.mean}% mean / ${m.dug?.max}% worst occluded`
      + ` (offscreen ${m.dugOff?.mean}%) · 1 m² ${m.sq1m.mean}% mean / ${m.sq1m.max}% worst`
      + ` (offscreen ${m.sq1mOff.mean}%) · boom ${m.boom.mean} m · work ${m.work.mean}`
      + ` · ${m.swung}/14 mid-swing · ${m.onPlane}/14 aim solved on the face plane`
      + ` · ${m.onPanel}/14 the swing still lands on this panel · ${m.workAim}/14 workAim live`
      + ` · rays ${m.n}/${m.nSq}`);
    // 🚨 A PROBE THAT CANNOT OBSERVE MUST SAY SO. If the aim never resolved onto the face plane
    // the occlusion figures are about some other square metre and are worthless.
    if (m.onPlane < 14) note(`  ⚠️ ${14 - m.onPlane}/14 samples could not solve the aim onto the face plane`);
    return m;
  };

  // dig a real crater first, on the arm that ships, at the real cadence
  const lowA0 = await armTo(true);
  note(`R4 AFTER arm aims lowest at pitch ${lowA0.pitch} -> y ${lowA0.y} m (fresh face)`);
  for (let i = 0; i < PREHITS; i++) { await fire(); await page.waitForTimeout(960); }
  await shot('reach-crater');

  /**
   * ⚠️ **B, A, B' — AND THE TWO B's ARE THE DRIFT BRACKET.** Every `overSwing` throws a blow, so
   * the crater the second arm is measured against is not the one the first arm saw. Measuring
   * the SHIPPED arm on both sides of the new one is the cheapest honest control for that: if A
   * sits inside the B..B' bracket the difference is drift, and if it sits outside it is the
   * change. A single A/B here would be a claim the instrument cannot support.
   */
  const lowB = await armTo(false);
  note(`R4 BEFORE arm aims lowest at pitch ${lowB.pitch} -> y ${lowB.y} m`);
  await page.waitForTimeout(900);
  const R4B = await overSwing('R4 BEFORE  (aimDecoupled=false)');
  await shot('reach-before-lowswing');

  const lowA = await armTo(true);
  note(`R4 AFTER arm aims lowest at pitch ${lowA.pitch} -> y ${lowA.y} m`);
  await page.waitForTimeout(1200);
  const R4A = await overSwing('R4 AFTER   (aimDecoupled=true)');
  await shot('reach-after-lowswing');

  const lowB2 = await armTo(false);
  note(`R4 BEFORE' arm aims lowest at pitch ${lowB2.pitch} -> y ${lowB2.y} m`);
  await page.waitForTimeout(1200);
  const R4B2 = await overSwing("R4 BEFORE' (aimDecoupled=false, repeat)");
  if (!R4B.err && !R4B2.err) {
    note(`R4 drift bracket on the SHIPPED arm alone: 1 m² ${R4B.sq1m.mean}% -> ${R4B2.sq1m.mean}% mean`
      + ` · crater ${R4B.dug?.mean}% -> ${R4B2.dug?.mean}%`);
  }

  if (R4A.err || R4B.err) {
    skip('R4 the body-occlusion figure could be measured', R4A.err || R4B.err);
  } else {
    note(`R4 body over the working square metre: ${R4B.sq1m.mean}% -> ${R4A.sq1m.mean}% mean, `
      + `${R4B.sq1m.max}% -> ${R4A.sq1m.max}% worst`);
    note(`R4 body over the crater:              ${R4B.dug?.mean}% -> ${R4A.dug?.mean}% mean, `
      + `${R4B.dug?.max}% -> ${R4A.dug?.max}% worst`);
    // ⚠️ REPORTED, THEN GATED ONLY ON THE GUARD. The aim change moves the target DOWN the wall,
    // and lower is nearer the body's own silhouette — so occlusion getting worse is a real
    // possible outcome and it must be visible rather than assumed away. The assertion here is
    // the one that cannot be gamed: the hole must still be ON SCREEN.
    R4A.sq1mOff.max <= Math.max(2, R4B.sq1mOff.max + 2)
      ? pass('R4 the square metre being worked is still on screen',
        `offscreen ${R4B.sq1mOff.max}% -> ${R4A.sq1mOff.max}% worst`)
      : fail('R4 the square metre being worked is still on screen',
        `offscreen ${R4B.sq1mOff.max}% -> ${R4A.sq1mOff.max}% worst — the aim went out of frame`);
    R4A.sq1m.mean <= R4B.sq1m.mean + 6
      ? pass('R4 the body does not cover MORE of the work than it did',
        `${R4B.sq1m.mean}% -> ${R4A.sq1m.mean}% mean over a swing`)
      : fail('R4 the body does not cover MORE of the work than it did',
        `${R4B.sq1m.mean}% -> ${R4A.sq1m.mean}% mean over a swing — the lower aim moved the target behind the robot`);
  }
  note('R4 BEFORE: ' + JSON.stringify(R4B));
  note('R4 AFTER:  ' + JSON.stringify(R4A));
}
