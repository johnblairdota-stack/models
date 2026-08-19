/**
 * 🖼️ **`_dress1-skin.mjs` — WHICH DRAWN GEOMETRY IS *SKIN ON A DESTRUCTIBLE WALL FACE*, AND WHAT
 * WOULD IT COST TO MAKE IT PART OF THE WALL.**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_dress1-skin.mjs \
 *        --port 5451 --q "seed=s4" --shots
 *
 *   env  STATIONS=a,b,c   override the twelve parked stations
 *        ARMS=0           census + controls only, skip the price sweep (fast)
 *        LOOK=f.a.b,…     park in front of each named face and PHOTOGRAPH what its skin owns
 *        PROUD=0.05       metres: where FLAT stops and PROUD begins
 *        REACH=0.60       metres: how far into the room the probe looks
 *
 * ---------------------------------------------------------------------------------------------
 * 🎯 **WHAT IT MEASURED, 2026-08-11, seed s4, `?estate=port` `?dig=free` `?walls=instanced`.**
 * 46 destructible faces, 28 damage-armed. **39 carry skin and NOT ONE PIECE OF IT IS ITS OWN
 * MESH** — every row is a room `GeoBin` bucket (`kit:wall/gilt/skirt/mould`, `portraits`,
 * `fixture:brass/glow`), one of ≤8 `exterior.dress.*` `InstancedMesh`es, or an `exterior.yard`.
 * So the dressing on a diggable face costs **ZERO marginal draw calls today**, and taking it off
 * the face costs zero as well:
 *
 *     collapse-all (mechanism a / b-in-bin)   +0 … +0    worst station 461/625   control 0 at 12/12
 *     split-proud  (mechanism c, naive fall)  +2 … +36   worst station 493/625
 *     split-all    (mechanism b, naive)       +4 … +49   worst station 510/625
 *
 * **Draw calls therefore do not decide between the three mechanisms — all fit 625.** The full
 * argument, the per-room census and the three defects are in `docs/handoff/dressbin-1.md`.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY IT EXISTS — nothing on disk answers this question
 * ---------------------------------------------------------------------------------------------
 * `_calls1-who.mjs` attributes every draw call to an OWNER, exactly, by wrapping
 * `renderBufferDirect`. It cannot say which of those owners is *panelling standing in front of a
 * wall the player is about to dig through*. `eo2-calls.mjs` counts visible meshes. `_ap1-who.mjs`
 * answers occlusion along ONE ray. The question here is a VOLUME question — "what draws in the
 * 0.60 m of room directly in front of this destructible face" — and it had no instrument.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE CONTROLS, AND THEY RUN ON EVERY RUN. This project's dominant instrument failure is a
 * RESULT-SHAPED OUTPUT INSTEAD OF AN ERROR, so "this face carries no dressing" and "I could not
 * resolve this face" must never print the same. Three arms, all live every run:
 *
 *   C1  A PLANTED BOGUS FACE. A synthetic panel with a real face's dimensions is placed 500 m
 *       from the house, where nothing is built. Its SELF probe (the volume the wall's own layer
 *       planes occupy) must come back EMPTY, and the census must therefore mark it UNRESOLVED.
 *       If a bogus face comes back "resolved, 0 dressing", every empty face in the table is void
 *       and this scenario FAILS.
 *
 *   C2  EVERY REAL FACE MUST RESOLVE. Same probe, opposite direction: a real face whose SELF
 *       volume is empty is a face the probe could not find, not a face with nothing on it. Those
 *       faces are named and the run goes red.
 *
 *   C3  A PLANTED DRESSING BOX. A 0.40 x 0.40 x 0.02 quad is added to a named face's own space
 *       root, 0.10 m proud of it, and the census must find it ON THAT FACE AND NO OTHER. This is
 *       the reintroduction arm: without it, "0 dressing on this face" is indistinguishable from
 *       "the containment test is broken". It is removed before the census proper.
 *
 *   C4  The draw-call hook is asserted against `renderer.info.render.calls` at every station, the
 *       same construction `_calls1-who.mjs` uses — if the hook missed a path the row is void.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ IT ASKS THE BUILT SCENE, NEVER THE AUTHORING TABLES. Faces come from `room.panels` (the
 * `DestructibleWall`s that actually exist), their frames from `root.matrixWorld` (not from
 * `dig.js`'s `at`/`rotY`), and the geometry from `geometry.attributes.position` walked through
 * that same matrix — `InstancedMesh` copies expanded through `instanceMatrix`, which is the blind
 * spot `--pick` has and which is every pristine wall face in the house.
 *
 * ⚠️ CONTAINMENT IS NOT DRAWING. A triangle inside the volume may be culled, hidden by residency,
 * or occluded. So the census carries a `drawn` column taken from the SAME `renderBufferDirect`
 * hook that produces the call table: a mesh that never reaches the hook at any of the twelve
 * stations is reported as NOT SEEN DRAWN rather than as costing calls.
 *
 * ---------------------------------------------------------------------------------------------
 * THE PRICED ARMS — each flipped IN PLACE at a settled station, against its own shipped reading
 * taken seconds earlier, and the station read a THIRD time after the revert (C5). Never as
 * separate walks: see the note above the sweep for the 423 -> 479 drift that killed the first
 * build of this section.
 * ---------------------------------------------------------------------------------------------
 *   shipped        the build as it is
 *   collapse-all   every skin triangle on a destructible face is written to a degenerate point
 *                  IN PLACE, inside its merged bin — `room.js`'s own `tracked()` mechanism. This
 *                  is the draw-call shape of mechanism (a), "the dressing becomes the coat
 *                  texture": the geometry stops rasterising and the merged mesh stays one mesh.
 *   split-all      every skin piece LEAVES its bin and becomes its own `Mesh` (same material,
 *                  same parent, index sub-set; the source's index is rebuilt without it). This
 *                  is the draw-call shape of mechanism (b) done the naive way.
 *   split-proud    only pieces standing >= PROUD metres off the face leave the bin. Mechanism
 *                  (c): flat dressing goes to texture, proud dressing stays an object that can
 *                  fall.
 *
 * The split is a REAL split — new meshes, real draw calls — not an estimate of one.
 *
 * ⚠️ **`stand` (0.20–REACH m off the face) IS NEVER PRICED.** It is a gadget on the floor, a
 * console table, or the yard behind an exit site: in front of the wall, not on it. Pricing "the
 * dressing becomes the wall" against it would price the furniture.
 */

import { decodePng, diff, summarise } from '../pxdiff.mjs';
import { hold, release } from '../still.mjs';

const STATIONS = (process.env.STATIONS ?? [
  'gallery.west', 'gallery.mid', 'gallery.east',
  'study_w.north', 'study_w.south', 'service.mid',
  'study_e.north', 'study_e.south',
  'ballroom.north', 'ballroom.centre', 'ballroom.south',
  'chapel.centre',
].join(',')).split(',').filter(Boolean);

const DO_ARMS = (process.env.ARMS ?? '1') !== '0';
/**
 * `LOOK=f.gal_east.0.b,f.gal_chapel.0.a` — instead of the price sweep, park in front of each
 * named face and photograph what its skin owns on screen, by COLLAPSING that skin in one held
 * page. HANDOFF: *"if you assert something is on screen, look at a picture of it."* Two arms per
 * face — the portrait canvases alone, and every skin mesh on the face — each against a
 * same-config control pair taken seconds earlier through `still.mjs`.
 */
const LOOK = (process.env.LOOK ?? '').split(',').filter(Boolean);
const PROUD = +(process.env.PROUD ?? 0.05);
const REACH = +(process.env.REACH ?? 0.60);

export default async function dress1({ page, note, pass, fail, skip, shot, snap, SHOTDIR, VIEW }) {
  const png = (tag) => snap(tag, { path: `${SHOTDIR}/${VIEW}.${tag}.png` });
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 200; i++) {
      await page.waitForTimeout(40);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(400);

  // ============================================================ install the probe
  const head = await page.evaluate(([PROUD, REACH]) => {
    const e = window.__rrr.engine;
    e.scene.updateMatrixWorld(true);
    const D = { PROUD, REACH };
    window.__dress = D;

    // ---- geometry helpers, in plain numbers: THREE is not on `window` -------
    const xf = (m, x, y, z, o) => {
      o[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
      o[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      o[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    };
    const mul = (a, b, out) => {              // out = a * b, column-major 16-arrays
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1]
          + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
      return out;
    };
    D.xf = xf; D.mul = mul;

    /** Every mesh in the scene that owns real geometry, plus its world matrices. */
    D.collectMeshes = () => {
      const out = [];
      e.scene.updateMatrixWorld(true);
      e.scene.traverse((o) => {
        if (!o.isMesh || !o.geometry?.attributes?.position) return;
        const path = (() => {
          const parts = []; let p = o;
          for (let i = 0; i < 8 && p && p !== e.scene; i++) { if (p.name) parts.unshift(p.name); p = p.parent; }
          return parts.slice(-2).join('/') || '(unnamed)';
        })();
        out.push({ o, path, name: o.name || '(unnamed)', mat: o.material?.name || '(unnamed-mat)' });
      });
      return out;
    };

    /**
     * A face's own frame, taken from the BUILT panel's world matrix. `u` runs along the panel's
     * local +X, `v` is world up from the panel's centre, `n` is the panel's local +Z — which
     * `wall.js` states is the direction the face looks into its own room.
     */
    D.frameOf = (p) => {
      const m = p.root.matrixWorld.elements;
      const ax = [m[0], m[1], m[2]], ay = [m[4], m[5], m[6]], az = [m[8], m[9], m[10]];
      const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
      return { o: [m[12], m[13], m[14]], u: norm(ax), v: norm(ay), n: norm(az),
        hw: p.width / 2, hh: p.height / 2 };
    };

    D.faces = () => {
      const out = [];
      for (const p of e.room.panels) {
        const s = p.spec ?? {};
        out.push({
          id: p.id, free: !!s.free, dig: !!s.dig, a: s.a ?? null, b: s.b ?? null,
          state: s.state ?? null, w: p.width, h: p.height, t: p.thickness,
          space: p.ownerSpace?.id ?? null, f: D.frameOf(p), panel: p,
        });
      }
      return out;
    };

    /**
     * Walk every triangle of every mesh once and drop its CENTROID into whichever face volume
     * contains it. Centroid rather than "any vertex" so a floor slab clipping a face's bottom
     * edge does not read as panelling.
     *
     * Bands on the face normal:
     *   SELF  [-0.35, +0.001]  the wall's OWN stack. The positive control — must be non-empty.
     *   FLAT  [+0.001, PROUD)  wallpaper, boiserie field, panel mouldings lying on the wall
     *   PROUD [PROUD, 0.20)    pilasters, portraits, boards, sconces standing off it
     *   STAND [0.20, REACH]    objects standing in front of the wall rather than on it
     */
    D.census = (faces) => {
      const meshes = D.collectMeshes();
      const res = new Map();                         // faceId -> Map(meshKey -> row)
      for (const f of faces) res.set(f.id, new Map());
      const p0 = [0, 0, 0];
      const REACHV = D.REACH, PRV = D.PROUD;
      const SEP = '';
      // a face's own bounding radius, for the coarse prune below
      for (const f of faces) f._r = Math.hypot(f.f.hw, f.f.hh, REACHV);

      for (const M of meshes) {
        const o = M.o;
        if (o.name && o.name.startsWith('dress1.')) continue;   // never census our own arms
        const g = o.geometry, pos = g.attributes.position;
        const idx = g.index ? g.index.array : null;
        const triN = idx ? idx.length / 3 : pos.count / 3;
        if (!triN) continue;
        const copies = [];
        if (o.isInstancedMesh) {
          const im = o.instanceMatrix.array;
          for (let i = 0; i < o.count; i++) {
            const b = new Float64Array(16);
            for (let k = 0; k < 16; k++) b[k] = im[i * 16 + k];
            const w = new Float64Array(16);
            mul(o.matrixWorld.elements, b, w);
            // a hidden instance is scaled to zero — skip it, it draws nothing
            if (Math.hypot(w[0], w[1], w[2]) < 1e-6) continue;
            copies.push({ m: w, i });
          }
        } else copies.push({ m: o.matrixWorld.elements, i: -1 });
        if (!copies.length) continue;

        if (!g.boundingSphere) g.computeBoundingSphere();
        const bs = g.boundingSphere;
        for (const cp of copies) {
          const m = cp.m;
          /**
           * COARSE PRUNE, and it is a speed fix only — never a filter on the answer. The mesh's
           * own bounding sphere in world space against each face's. It can only ever ADD faces
           * that then fail the exact test below; it cannot drop one, because a triangle inside a
           * face volume is inside the mesh's own sphere by construction.
           */
          const sc = Math.max(Math.hypot(m[0], m[1], m[2]), Math.hypot(m[4], m[5], m[6]),
            Math.hypot(m[8], m[9], m[10]));
          xf(m, bs.center.x, bs.center.y, bs.center.z, p0);
          const rad = bs.radius * sc;
          const near = faces.filter((f) => {
            const dx = p0[0] - f.f.o[0], dy = p0[1] - f.f.o[1], dz = p0[2] - f.f.o[2];
            return Math.hypot(dx, dy, dz) <= rad + f._r;
          });
          if (!near.length) continue;
          for (let t = 0; t < triN; t++) {
            const ia = idx ? idx[t * 3] : t * 3, ib = idx ? idx[t * 3 + 1] : t * 3 + 1,
              ic = idx ? idx[t * 3 + 2] : t * 3 + 2;
            const cx = (pos.getX(ia) + pos.getX(ib) + pos.getX(ic)) / 3;
            const cy = (pos.getY(ia) + pos.getY(ib) + pos.getY(ic)) / 3;
            const cz = (pos.getZ(ia) + pos.getZ(ib) + pos.getZ(ic)) / 3;
            xf(m, cx, cy, cz, p0);
            for (const f of near) {
              const F = f.f;
              const dx = p0[0] - F.o[0], dy = p0[1] - F.o[1], dz = p0[2] - F.o[2];
              const dn = dx * F.n[0] + dy * F.n[1] + dz * F.n[2];
              if (dn < -0.35 || dn > REACHV) continue;
              const du = dx * F.u[0] + dy * F.u[1] + dz * F.u[2];
              if (du < -F.hw || du > F.hw) continue;
              const dv = dx * F.v[0] + dy * F.v[1] + dz * F.v[2];
              if (dv < -F.hh || dv > F.hh) continue;
              const band = dn <= 0.001 ? 'self' : dn < PRV ? 'flat' : dn < 0.20 ? 'proud' : 'stand';
              const key = M.path + '' + M.name + '' + M.mat + '' + cp.i;
              const bucket = res.get(f.id);
              let row = bucket.get(key);
              if (!row) {
                row = { path: M.path, name: M.name, mat: M.mat, inst: cp.i,
                  uuid: o.uuid, instanced: !!o.isInstancedMesh,
                  self: 0, flat: 0, proud: 0, stand: 0, tf: [], tp: [], ts: [] };
                bucket.set(key, row);
              }
              row[band]++;
              if (band === 'flat') row.tf.push(t);
              else if (band === 'proud') row.tp.push(t);
              else if (band === 'stand') row.ts.push(t);
            }
          }
        }
      }
      return res;
    };

    // ---- the mesh totals, for "does this bin empty if its skin goes" -------
    D.triCount = (o) => {
      const g = o.geometry;
      return (g.index ? g.index.count : g.attributes.position.count) / 3;
    };
    D.byUuid = () => {
      const m = new Map();
      for (const M of D.collectMeshes()) m.set(M.o.uuid, M.o);
      return m;
    };

    return {
      panels: e.room.panels.length,
      free: e.room.panels.filter((p) => p.spec?.free).length,
      estate: e.room.estate ? Object.keys(e.room.estate.orders ?? {}).join('+') : 'off',
      dig: String(e.room.dig), mode: e.room.wallMode, seed: String(e.run.seed),
    };
  }, [PROUD, REACH]);

  note(`seed "${head.seed}" · ${head.panels} panels (${head.free} free/damage-armed)`
    + ` · dig "${head.dig}" · walls "${head.mode}" · estate orders ${head.estate}`);

  // ==================================================================== C1 + C3
  // Plant the bogus face and the known dressing box BEFORE the census, so the same code path
  // that produces the table is the one that has to get the controls right.
  const ctl = await page.evaluate(() => {
    const e = window.__rrr.engine, D = window.__dress;
    const faces = D.faces();
    const real = faces.find((f) => f.free) ?? faces[0];
    if (!real) return { ok: false };

    // ---- C1: a face with a real face's dimensions, 500 m away, where nothing is built ----
    const bogus = {
      id: 'CONTROL.bogus-face', free: true, dig: true, a: null, b: null, state: null,
      w: real.w, h: real.h, t: real.t, space: null, panel: null,
      f: { o: [real.f.o[0] + 500, real.f.o[1], real.f.o[2] + 500],
        u: real.f.u, v: real.f.v, n: real.f.n, hw: real.f.hw, hh: real.f.hh },
    };

    // ---- C3: a 0.40 x 0.40 plate, 0.10 m proud of `real`, in `real`'s own space root ----
    const F = real.f, off = 0.10, s = 0.20;
    const P = (a, b) => [
      F.o[0] + F.u[0] * a + F.v[0] * b + F.n[0] * off,
      F.o[1] + F.u[1] * a + F.v[1] * b + F.n[1] * off,
      F.o[2] + F.u[2] * a + F.v[2] * b + F.n[2] * off,
    ];
    const q = [P(-s, -s), P(s, -s), P(s, s), P(-s, -s), P(s, s), P(-s, s)];
    const src = e.room.panels[0].layers[0];
    const geo = new src.geometry.constructor();
    const arr = new Float32Array(18);
    q.forEach((p, i) => { arr[i * 3] = p[0]; arr[i * 3 + 1] = p[1]; arr[i * 3 + 2] = p[2]; });
    geo.setAttribute('position', new src.geometry.attributes.position.constructor(arr, 3));
    const plate = new src.constructor(geo, src.material);
    plate.name = 'CONTROL.planted-plate';
    plate.frustumCulled = false;
    e.scene.add(plate);
    e.scene.updateMatrixWorld(true);

    const res = D.census([...faces, bogus]);
    const selfOf = (id) => [...(res.get(id) ?? new Map()).values()].reduce((n, r) => n + r.self, 0);
    const hitPlate = [];
    for (const [fid, bucket] of res) {
      for (const r of bucket.values()) if (r.name === 'CONTROL.planted-plate') hitPlate.push(fid);
    }
    e.scene.remove(plate);
    geo.dispose();

    return {
      ok: true,
      realId: real.id,
      bogusSelf: selfOf('CONTROL.bogus-face'),
      bogusRows: (res.get('CONTROL.bogus-face') ?? new Map()).size,
      plateOn: hitPlate,
      unresolved: faces.filter((f) => selfOf(f.id) === 0).map((f) => f.id),
      resolved: faces.filter((f) => selfOf(f.id) > 0).length,
      total: faces.length,
    };
  });

  if (!ctl.ok) { fail('the probe found any destructible face at all', 'room.panels was empty'); return; }

  ctl.bogusSelf === 0 && ctl.bogusRows === 0
    ? pass('C1 CONTROL — a bogus face is UNRESOLVED, not "clean"',
      `planted 500 m out: 0 self-geometry, 0 rows — an empty face and a missing face read differently`)
    : fail('C1 CONTROL — a bogus face is UNRESOLVED, not "clean"',
      `the planted face resolved: self ${ctl.bogusSelf} tris, ${ctl.bogusRows} rows — every empty row in this table is void`);

  ctl.unresolved.length === 0
    ? pass('C2 every real face resolves (its own wall stack is in its SELF volume)',
      `${ctl.resolved}/${ctl.total} faces`)
    : fail('C2 every real face resolves (its own wall stack is in its SELF volume)',
      `${ctl.unresolved.length} unresolved: ${ctl.unresolved.slice(0, 8).join(' ')}`);

  ctl.plateOn.length === 1 && ctl.plateOn[0] === ctl.realId
    ? pass('C3 CONTROL — a planted 0.4 m plate 0.10 m proud IS found, on exactly its own face',
      `found on ${ctl.plateOn[0]}`)
    : fail('C3 CONTROL — a planted 0.4 m plate 0.10 m proud IS found, on exactly its own face',
      `expected [${ctl.realId}], got [${ctl.plateOn.join(' ')}] — the containment test cannot see skin`);

  // ==================================================================== THE CENSUS
  const cen = await page.evaluate(() => {
    const D = window.__dress;
    const faces = D.faces();
    const res = D.census(faces);
    const byUuid = D.byUuid();
    const runsOf = (tris) => {
      const s = [...new Set(tris)].sort((a, b) => a - b);
      let runs = 1;
      for (let i = 1; i < s.length; i++) if (s[i] !== s[i - 1] + 1) runs++;
      return s.length ? runs : 0;
    };
    const out = [];
    for (const f of faces) {
      const rows = [...(res.get(f.id) ?? new Map()).values()]
        .filter((r) => r.flat + r.proud + r.stand > 0)
        .map((r) => {
          const o = byUuid.get(r.uuid);
          return {
            path: r.path, name: r.name, mat: r.mat, inst: r.inst, uuid: r.uuid,
            instanced: r.instanced,
            flat: r.flat, proud: r.proud, stand: r.stand,
            runs: runsOf([...r.tf, ...r.tp]), meshTris: o ? Math.round(D.triCount(o)) : -1,
          };
        })
        .sort((a, b) => (b.flat + b.proud + b.stand) - (a.flat + a.proud + a.stand));
      out.push({
        id: f.id, free: f.free, dig: f.dig, a: f.a, b: f.b, state: f.state, space: f.space,
        w: +f.w.toFixed(2), h: +f.h.toFixed(2),
        centre: f.f.o.map((v) => +v.toFixed(2)), rows,
      });
    }
    return out;
  });

  // -------------------------------------------------------------- print the census
  // SKIN is FLAT + PROUD (<= 0.20 m off the face). A `stand`-only row is a gadget on the floor
  // or a yard behind an exit site: in front of the wall, not on it. Counted, never priced.
  const isSkin = (r) => r.flat + r.proud > 0;
  const skinRows = (f) => f.rows.filter(isSkin);
  const withSkin = cen.filter((f) => skinRows(f).length);
  note('');
  note(`=== CENSUS — dressing standing on a destructible wall face (band on the face normal:`
    + ` FLAT 0..${PROUD} m · PROUD ${PROUD}..0.20 m · STAND 0.20..${REACH} m, not skin) ===`);
  for (const f of cen) {
    const rs = skinRows(f);
    const tot = rs.reduce((n, r) => n + r.flat + r.proud, 0);
    const kind = f.free ? 'FREE/grid' : `scalar/${f.state}`;
    const stand = f.rows.length - rs.length;
    note('');
    note(`${f.id.padEnd(20)} ${kind.padEnd(18)} ${f.w}x${f.h} m · ${f.a}|${f.b}`
      + ` · ${rs.length} SKIN mesh rows · ${tot} skin tris`
      + (stand ? ` · (+${stand} stand-only rows, not skin)` : ''));
    for (const r of rs.slice(0, 8)) {
      note(`    ${String(r.flat).padStart(5)} flat ${String(r.proud).padStart(5)} proud `
        + `${String(r.stand).padStart(5)} stand · ${String(r.runs).padStart(3)} runs`
        + ` · ${r.instanced ? `INST#${r.inst} ` : ''}${r.path.padEnd(28)} ${r.mat.slice(0, 44)}`
        + ` (mesh has ${r.meshTris} tris)`);
    }
    if (rs.length > 8) note(`    ... ${rs.length - 8} more SKIN mesh rows`);
  }

  note('');
  note(`${withSkin.length} of ${cen.length} destructible faces carry SKIN;`
    + ` ${cen.filter((f) => f.free && skinRows(f).length).length} of ${cen.filter((f) => f.free).length} FREE faces do`);

  // ---- the roll-up the report needs: which BIN carries skin, on how many faces ----
  {
    const byBin = new Map();
    for (const f of cen) for (const r of skinRows(f)) {
      const k = `${r.path}${r.instanced ? ' [InstancedMesh]' : ''}`;
      const b = byBin.get(k) ?? { faces: new Set(), free: new Set(), tris: 0, meshTris: r.meshTris, mat: r.mat };
      b.faces.add(f.id); if (f.free) b.free.add(f.id);
      b.tris += r.flat + r.proud;
      byBin.set(k, b);
    }
    note('');
    note('=== BY MESH / BIN — who is the skin, and how much of that mesh it is ===');
    for (const [k, b] of [...byBin].sort((a, b2) => b2[1].tris - a[1].tris === 0 ? 0 : b2[1].tris - a[1].tris)) {
      note(`  ${String(b.tris).padStart(5)} skin tris of ${String(b.meshTris).padStart(6)}`
        + ` (${(100 * b.tris / Math.max(1, b.meshTris)).toFixed(1)}%) on ${b.faces.size} faces`
        + ` (${b.free.size} FREE) · ${k}`);
    }
  }

  if (!DO_ARMS) {
    skip('the four priced arms', 'ARMS=0');
    return;
  }

  // ==================================================================== the arms
  const installArms = await page.evaluate(() => {
    const e = window.__rrr.engine, D = window.__dress;

    /**
     * Every (mesh, face) SKIN group, resolved once and reused by every arm.
     * ⚠️ **SKIN IS `flat` + `proud` ONLY.** The `stand` band (0.20–REACH m off the face) is a
     * gadget on the floor, a console table or a yard behind an exit site — it is in front of the
     * wall, it is not ON it, and pricing "the dressing becomes the wall" against it would price
     * the furniture.
     */
    D.groups = (() => {
      const faces = D.faces();
      const res = D.census(faces);
      const byUuid = D.byUuid();
      const out = [];
      for (const f of faces) {
        for (const r of (res.get(f.id) ?? new Map()).values()) {
          if (r.flat + r.proud === 0) continue;
          const o = byUuid.get(r.uuid);
          if (!o) continue;
          out.push({ face: f.id, o, inst: r.inst, instanced: r.instanced,
            flat: r.flat, proud: r.proud, stand: r.stand,
            tris: [...new Set([...r.tf, ...r.tp])].sort((a, b) => a - b) });
        }
      }
      return out;
    })();

    D.undo = [];

    /**
     * ARM `collapse` — write the skin triangles' vertices onto their own centroid, IN PLACE, in
     * the merged bin. This is `room.js` `tracked().hide()`'s mechanism generalised: the mesh
     * stays one mesh, the triangles stop rasterising. It is the draw-call shape of "the dressing
     * becomes the wall's coat texture".
     */
    D.collapse = (pick) => {
      /**
       * 🚨 **`stat` IS WHAT MAKES THE PARTIAL ARM READABLE, AND IT IS A CONTROL, NOT A LOG.**
       * A collapse that picked nothing reads +0 calls — which is exactly the answer the partial
       * arm is trying to establish, so "it is free" and "it did nothing" would print the same.
       * `tris` and `partialRuns` are asserted non-zero by C6 before its delta is believed.
       */
      D.stat = { groups: 0, tris: 0, runs: 0, partialRuns: 0 };
      for (const g of D.groups) {
        if (g.instanced) continue;
        const use = g.tris.filter((t) => pick(g, t));
        if (!use.length) continue;
        {
          // how many of this group's CONTIGUOUS index runs are left only partly collapsed
          const all = g.tris, gone = new Set(use);
          let i = 0;
          while (i < all.length) {
            let j = i;
            while (j + 1 < all.length && all[j + 1] === all[j] + 1) j++;
            let hit = 0;
            for (let k = i; k <= j; k++) if (gone.has(all[k])) hit++;
            D.stat.runs++;
            if (hit > 0 && hit < j - i + 1) D.stat.partialRuns++;
            i = j + 1;
          }
          D.stat.groups++; D.stat.tris += use.length;
        }
        const geo = g.o.geometry, pos = geo.attributes.position;
        const idx = geo.index ? geo.index.array : null;
        const saved = { o: g.o, pos, verts: new Map() };
        for (const t of use) {
          const ii = [0, 1, 2].map((k) => (idx ? idx[t * 3 + k] : t * 3 + k));
          let cx = 0, cy = 0, cz = 0;
          for (const i of ii) { cx += pos.getX(i); cy += pos.getY(i); cz += pos.getZ(i); }
          cx /= 3; cy /= 3; cz /= 3;
          for (const i of ii) {
            if (!saved.verts.has(i)) saved.verts.set(i, [pos.getX(i), pos.getY(i), pos.getZ(i)]);
            pos.setXYZ(i, cx, cy, cz);
          }
        }
        pos.needsUpdate = true;
        geo.computeBoundingSphere();
        D.undo.push({ kind: 'collapse', saved });
      }
    };

    /**
     * ARM `split` — the skin triangles LEAVE the bin. A new `Mesh` shares the source's attribute
     * buffers and owns an index of just those triangles; the source's index is rebuilt without
     * them and the mesh is hidden if nothing is left. Same material, same parent, so the only
     * thing that changes is the number of MESHES — which is the unit a draw call is charged in.
     */
    /**
     * 🚨 **ONE PASS PER SOURCE MESH, AND THAT IS A BUG FIX, NOT A TIDY-UP.** The first version
     * split each (mesh, face) group independently — which rebuilds the source's INDEX, so every
     * later group's triangle numbers referred to triangles that had moved. A mesh carrying skin
     * on three faces would have split the wrong geometry twice and still produced a plausible
     * call count. Triangles are partitioned ONCE, by first claimer, and every face's subset comes
     * out of the same original index array.
     */
    D.split = (pick) => {
      const byMesh = new Map();
      for (const g of D.groups) {
        if (g.instanced) continue;                 // priced separately, see the report
        const use = g.tris.filter((t) => pick(g, t));
        if (!use.length) continue;
        let arr = byMesh.get(g.o);
        if (!arr) byMesh.set(g.o, arr = []);
        arr.push({ face: g.face, tris: use });
      }
      for (const [o, groups] of byMesh) {
        const geo = o.geometry;
        if (!geo.index) continue;
        const src = geo.index.array, triN = src.length / 3;
        const owner = new Map();
        for (const gr of groups) for (const t of gr.tris) if (!owner.has(t)) owner.set(t, gr.face);
        const keep = [], mine = new Map();
        for (let t = 0; t < triN; t++) {
          const a = src[t * 3], b = src[t * 3 + 1], c = src[t * 3 + 2];
          const f = owner.get(t);
          if (f === undefined) { keep.push(a, b, c); continue; }
          let m = mine.get(f);
          if (!m) mine.set(f, m = []);
          m.push(a, b, c);
        }
        const added = [];
        for (const [face, list] of mine) {
          const sub = new geo.constructor();
          for (const k of Object.keys(geo.attributes)) sub.setAttribute(k, geo.attributes[k]);
          sub.setIndex(new geo.index.constructor(new src.constructor(list), 1));
          sub.computeBoundingSphere();
          const m = new o.constructor(sub, o.material);
          m.name = `dress1.split.${face}`;
          m.castShadow = o.castShadow; m.receiveShadow = o.receiveShadow;
          m.matrixAutoUpdate = false;
          m.matrix.copy(o.matrix);
          m.matrixWorld.copy(o.matrixWorld);
          o.parent.add(m);
          added.push(m);
        }
        const oldIndex = geo.index;
        geo.setIndex(new geo.index.constructor(new src.constructor(keep), 1));
        geo.computeBoundingSphere();
        const wasVisible = o.visible;
        if (!keep.length) o.visible = false;
        D.undo.push({ kind: 'split', o, geo, oldIndex, added, wasVisible });
      }
    };

    D.revert = () => {
      for (const u of D.undo.reverse()) {
        if (u.kind === 'collapse') {
          for (const [i, v] of u.saved.verts) u.saved.pos.setXYZ(i, v[0], v[1], v[2]);
          u.saved.pos.needsUpdate = true;
          u.saved.o.geometry.computeBoundingSphere();
        } else {
          for (const m of u.added) m.parent?.remove(m);
          u.geo.setIndex(u.oldIndex);
          u.geo.computeBoundingSphere();
          u.o.visible = u.wasVisible;
        }
      }
      D.undo = [];
    };

    // ---- the draw-call hook, `_calls1-who.mjs`'s construction ---------------
    if (!window.__who) {
      const r = e.renderer;
      const W = { cur: new Map(), last: null, lastCalls: 0, on: false };
      window.__who = W;
      const orig = r.renderBufferDirect;
      r.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
        if (!W.on) return orig.call(this, camera, scene, geometry, material, object, group);
        const before = r.info.render.calls;
        const ret = orig.call(this, camera, scene, geometry, material, object, group);
        if (r.info.render.calls !== before) {
          const k = (object.name || '(unnamed)') + '' + (scene === null ? 'S' : 'M');
          W.cur.set(k, (W.cur.get(k) ?? 0) + 1);
        }
        return ret;
      };
      const info = r.info, origReset = info.reset.bind(info);
      info.reset = function () {
        if (W.on) { W.last = W.cur; W.lastCalls = info.render.calls; W.cur = new Map(); }
        return origReset();
      };
    }

    const nonInst = D.groups.filter((g) => !g.instanced);
    return {
      groups: D.groups.length,
      splittable: nonInst.length,
      splitMeshes: new Set(nonInst.map((g) => g.o.uuid)).size,
      instancedGroups: D.groups.length - nonInst.length,
      proudGroups: nonInst.filter((g) => g.proud > 0).length,
    };
  });

  note('');
  note(`ARMS: ${installArms.groups} (mesh, face) skin groups · ${installArms.splittable} splittable`
    + ` across ${installArms.splitMeshes} source meshes`
    + ` · ${installArms.instancedGroups} instanced (priced separately)`
    + ` · ${installArms.proudGroups} carry PROUD geometry`);


  /**
   * 🚨 **THE FIRST BUILD OF THIS SECTION WALKED THE TWELVE STATIONS ONCE PER ARM AND EVERY
   * NUMBER IT PRODUCED WAS CONTAMINATED — CAUGHT BY C5 ON ITS FIRST RUN.** Re-reading the
   * SHIPPED build at the end of a five-walk session gave `ballroom.centre` **423 -> 479 calls
   * and 600 596 -> 667 314 triangles**, and `collapse-all` — an arm that can only ever REMOVE
   * geometry — read **+49**. A parked draw-call reading is stable across PROCESSES at the same
   * sim time; it is NOT stable across four minutes of a live session, because the world keeps
   * happening (the hunter moves, loose items enter and leave residency, debris accumulates).
   *
   * So every arm is now flipped IN PLACE at a settled station, against its own shipped reading
   * taken seconds earlier, and the station is read a THIRD time after the revert. That third
   * read is the same-config control pair this project's hazard list demands, and the delta is
   * only reported when it holds.
   *
   * ⚠️ `walls-perf.md`'s warning that "a flip A/B at a settled station is blind to a cost paid
   * on ARRIVAL" is about SHADER PROGRAMS, which residency pays for once when a room first
   * appears. Draw calls are not paid on arrival — they are a property of the draw set in the
   * frame you read — so a flip is the correct instrument here and a walk is not.
   */
  const readAt = () => page.evaluate(() => {
    const W = window.__who; W.on = false;
    const e = window.__rrr.engine;
    let sum = 0, split = 0;
    const top = [];
    for (const [k, v] of W.last ?? []) {
      sum += v;
      if (k.startsWith('dress1.split.')) split += v;
      top.push([k, v]);
    }
    top.sort((a, b) => b[1] - a[1]);
    return { calls: W.lastCalls, sum, split,
      tris: e.renderer.info.render.triangles, spaces: e.room.visibleSpaces(),
      top: top.slice(0, 5).map(([k, v]) => `${k.split('\u0001')[0]}=${v}`).join(' ') };
  });

  const sample = async () => {
    await page.evaluate(() => { window.__who.on = true; });
    await step(4);
    return readAt();
  };

  const ARMS_DEF = [
    ['collapse-all', () => window.__dress.collapse(() => true)],
    /**
     * 🚨 **`collapse-partial` — THE ONE ARM THE BUILD SLICE IS GATED ON, ADDED 2026-08-11 BY
     * `skin-1`.** `dressbin-1` measured the +0 by removing ALL skin at once, which collapses
     * WHOLE contiguous index runs. Per-cell erosion removes a **SUBSET** of a run: the fragments
     * over the cells that died go, the fragments beside them stay, and the run is left with holes
     * in it. Whether a merged bin still costs one draw call in that state — without being split —
     * is the load-bearing assumption of the whole erosion design, and nothing had measured it.
     *
     * The pick is EVERY OTHER TRIANGLE of each (mesh, face) group, which is the pessimal shape:
     * no run is ever fully collapsed, so every run this arm touches is left partial. C6 asserts
     * that it really is partial before the delta is read, and `split-all` — which costs +4…+49 on
     * every run — is the arm that proves a 0 here is a measurement and not a broken hook.
     */
    ['collapse-partial', () => window.__dress.collapse((g, t) => g.tris.indexOf(t) % 2 === 0)],
    ['split-all', () => window.__dress.split(() => true)],
    // a group is PROUD if any of its triangles sits >= PROUD m off the face; the split takes the
    // whole group, because a portrait that half-falls is not the mechanism.
    ['split-proud', () => window.__dress.split((g) => g.proud > 0)],
  ];

  // ==================================================================== LOOK
  if (LOOK.length) {
    for (const fid of LOOK) {
      const parked = await page.evaluate(([id]) => {
        const e = window.__rrr.engine;
        const p = e.room.panels.find((q) => q.id === id);
        if (!p) return { ok: false, why: 'no panel ' + id };
        const home = p.ownerSpace;
        const inSign = home ? p.sideOf({ x: home.cx, y: 0, z: home.cz }) : 1;
        const n = p.normal, c = p.pointAt(0.5, 0.5);
        e.player.pos.set(c.x + n.x * 3.2 * inSign, e.room.floorY, c.z + n.z * 3.2 * inSign);
        e.player.vel.set(0, 0, 0);
        const f = Math.atan2(-n.x * inSign, -n.z * inSign);
        e.player.facing = f; e.player.aimYaw = f;
        if (e.cam) { e.cam.yaw = f; e.cam.pitch = 0; e.cam._first = true; }
        e.room.setViewpoints?.([{ pos: e.player.pos, dir: { x: Math.sin(f), z: Math.cos(f) } }]);
        return { ok: true, space: e.room.spaceAt(e.player.pos)?.id ?? null };
      }, [fid]);
      if (!parked.ok) { skip(`LOOK ${fid}`, parked.why); continue; }
      // park + settle with the sim RUNNING before holding — HANDOFF's own rule, the camera is
      // driven by an updater and `hold()` empties `_updaters`.
      await step(60);
      const held = await hold(page);
      note(`LOOK ${fid} — parked in ${parked.space}, held: ${JSON.stringify(held)}`);
      await step(4);
      const A = decodePng(await png(`dress1-look-${fid}-A`));
      await step(4);
      const A2 = decodePng(await png(`dress1-look-${fid}-A2`));
      const floor = diff(A, A2);
      note(`  same-config FLOOR: ${summarise(floor)}`);

      const shootArm = async (tag, pick) => {
        await page.evaluate(([id, which]) => {
          window.__dress.collapse((g) => g.face === id
            && (which === 'all' || g.o.name === 'portraits'));
        }, [fid, pick]);
        await step(4);
        const B = decodePng(await png(`dress1-look-${fid}-${tag}`));
        await page.evaluate(() => window.__dress.revert());
        await step(4);
        const back = decodePng(await png(`dress1-look-${fid}-${tag}-reverted`));
        const d = diff(A, B), r = diff(A, back);
        note(`  ${tag.padEnd(18)} vs A: ${summarise(d)}`);
        note(`  ${tag.padEnd(18)} REVERT control vs A: ${summarise(r)}`);
        return { d, r };
      };
      const pOnly = await shootArm('B-portraits-only', 'portrait');
      const pAll = await shootArm('B-all-skin', 'all');

      // The claim being tested: this face's skin OWNS PIXELS ON SCREEN from a position a player
      // digs from. The floor is the control; a signal at or under it proves nothing.
      const sig = (d) => d.pxOver16;
      pAll.r.pxOver16 <= Math.max(4, floor.pxOver16)
        ? pass(`LOOK ${fid} — the collapse reverts in pixels`,
          `revert vs A px>16 ${pAll.r.pxOver16} against a floor of ${floor.pxOver16}`)
        : fail(`LOOK ${fid} — the collapse reverts in pixels`,
          `revert vs A px>16 ${pAll.r.pxOver16} against a floor of ${floor.pxOver16}`);
      sig(pAll.d) > Math.max(50, 10 * Math.max(1, floor.pxOver16))
        ? pass(`LOOK ${fid} — its skin owns pixels on screen from a digging stance`,
          `all-skin px>16 ${sig(pAll.d)} · portraits alone ${sig(pOnly.d)} · floor ${floor.pxOver16}`)
        : skip(`LOOK ${fid} — its skin owns pixels on screen from a digging stance`,
          `all-skin px>16 ${sig(pAll.d)} is not clear of the ${floor.pxOver16} floor — look at the frames`);
      await release(page);
      await step(4);
    }
    return;
  }

  const out = [];
  const partial = [];
  let hookBad = 0, ctlBad = [];
  note('');
  note('=== THE PRICE — every arm flipped IN PLACE at a settled station, with its own control ===');
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
    const base = await sample();
    if (base.sum !== base.calls) hookBad++;
    const row = { name, base: base.calls, tris: base.tris, spaces: base.spaces, arms: {} };
    for (const [label, install] of ARMS_DEF) {
      await page.evaluate(install);
      const st = await page.evaluate(() => window.__dress.stat ?? null);
      await step(4);
      const a = await sample();
      await page.evaluate(() => window.__dress.revert());
      await step(4);
      const back = await sample();
      row.arms[label] = { calls: a.calls, split: a.split, tris: a.tris, back: back.calls, st };
      if (label === 'collapse-partial') partial.push({ name, st });
      if (back.calls !== base.calls) ctlBad.push(`${name}/${label} ${base.calls}->${back.calls}`);
      if (a.sum !== a.calls) hookBad++;
    }
    out.push(row);
    note(`  ${name.padEnd(16)} shipped ${String(row.base).padStart(4)}`
      + `  ${ARMS_DEF.map(([l]) => {
        const a = row.arms[l];
        const d = a.calls - row.base;
        return `${l} ${d >= 0 ? '+' : ''}${d}${a.split ? `(${a.split} split)` : ''}`;
      }).join(' · ')}`
      + `  [control ${ARMS_DEF.map(([l]) => row.arms[l].back - row.base).join('/')}]`);
  }

  if (!out.length) { fail('a station could be parked', 'no anchor resolved'); return; }
  await shot('dress1-shipped');

  hookBad === 0
    ? pass('C4 the draw-call hook accounts for every call',
      `${out.length} stations x ${ARMS_DEF.length + 1} arms, sums exact`)
    : fail('C4 the draw-call hook accounts for every call', `${hookBad} readings mismatched`);

  ctlBad.length === 0
    ? pass('C5 CONTROL — every flip reverts; the station reads identically after it',
      `${out.length} stations x ${ARMS_DEF.length} arms, call-for-call`)
    : fail('C5 CONTROL — every flip reverts; the station reads identically after it',
      `${ctlBad.length} drifted: ${ctlBad.slice(0, 6).join(' ')} — those deltas are void`);

  /**
   * 🚨 **C6 — THE PARTIAL ARM REALLY LEFT RUNS PARTIAL.** Without this, `collapse-partial +0`
   * and "the predicate matched nothing" are the same printed row, which is this project's
   * recorded dominant instrument failure. It asserts the arm removed triangles AND that it left
   * contiguous index runs holed, at every station it ran at.
   */
  {
    const bad = partial.filter((p) => !p.st || p.st.tris <= 0 || p.st.partialRuns <= 0);
    const tot = partial.reduce((n, p) => n + (p.st?.tris ?? 0), 0);
    const pr = partial.reduce((n, p) => n + (p.st?.partialRuns ?? 0), 0);
    const rn = partial.reduce((n, p) => n + (p.st?.runs ?? 0), 0);
    bad.length === 0 && partial.length
      ? pass('C6 CONTROL — the partial arm collapsed a SUBSET of contiguous runs, not whole ones',
        `${partial.length} stations · ${tot} triangles collapsed · ${pr} of ${rn} runs left PARTIAL`)
      : fail('C6 CONTROL — the partial arm collapsed a SUBSET of contiguous runs, not whole ones',
        `${bad.length}/${partial.length} stations picked nothing or holed no run`
        + ` — every collapse-partial delta above is void`);
  }

  note('');
  note('=== THE NUMBER, against 625 ===');
  const worstBase = out.reduce((a, b) => (b.base > a.base ? b : a));
  note(`shipped      worst station ${worstBase.name} ${worstBase.base}/625`);
  for (const [label] of ARMS_DEF) {
    const d = out.map((r) => r.arms[label].calls - r.base);
    const w = out.reduce((a, b) => (b.arms[label].calls > a.arms[label].calls ? b : a));
    note(`${label.padEnd(12)} delta min ${Math.min(...d)} max ${Math.max(...d)}`
      + ` · worst station ${w.name} ${w.arms[label].calls}/625 (${w.arms[label].calls - w.base >= 0 ? '+' : ''}${w.arms[label].calls - w.base})`
      + ` · per station ${out.map((r) => `${r.name}${r.arms[label].calls - r.base >= 0 ? '+' : ''}${r.arms[label].calls - r.base}`).join(' ')}`);
    w.arms[label].calls <= 625
      ? pass(`the ${label} arm fits the 625 draw-call budget`,
        `worst ${w.name} ${w.arms[label].calls}/625`)
      : fail(`the ${label} arm fits the 625 draw-call budget`,
        `worst ${w.name} ${w.arms[label].calls}/625`);
  }
}
