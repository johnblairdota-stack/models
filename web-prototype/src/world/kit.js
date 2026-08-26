import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * ============================================================================
 * THE ARCHITECTURAL KIT — modular estate interiors
 * ============================================================================
 *
 * WALL MODULE DIMENSIONS — THIS IS THE CONTRACT. `wall-agent`'s destructible walls
 * slot into these numbers; nothing here changes without telling that agent.
 * All units are metres and UNIT-4H is 1.70 tall, so a storey is nearly three robots.
 *
 *   BAY          2.40   horizontal pitch of one wall module / one panel bay.
 *                       Every wall length in the estate is a whole number of BAYs.
 *   WALL_T       0.30   finished wall thickness. Structural core 0.20, 0.05 of finish
 *                       (lath + plaster + panelling) on each face.
 *   STOREY       4.80   finished floor to finished ceiling in a normal room.
 *   STOREY2      9.60   double height (the ballroom) — exactly 2 x STOREY, so a bay
 *                       module can be stacked without a new part.
 *   SKIRT_H      0.34   top of the skirting above finished floor.
 *   DADO_H       1.08   top of the chair rail.
 *   CORNICE_H    0.78   depth of the cornice band hanging below the ceiling.
 *   FIELD_LO     1.08   bottom of the upper panel field   (== DADO_H)
 *   FIELD_HI     4.02   top of the upper panel field      (== STOREY - CORNICE_H)
 *   REVEAL       0.055  how far a sunk panel field sits behind the finished face.
 *   STILE        0.16   width of the vertical stile between panel fields.
 *   RAIL         0.13   height of the horizontal rail above/below a panel field.
 *
 *   DESTRUCTIBLE PANEL — the aperture a wall module may be broken out of:
 *     width  2.08   (BAY - 2 x STILE)
 *     height 2.68   (FIELD_HI - FIELD_LO - 2 x RAIL)
 *     centre (bayCentreX, 2.55, wallFaceZ)
 *     front face at (finished face - REVEAL); cavity behind is 0.22 deep before the
 *     structural core. Lath runs horizontally across the cavity, studs at BAY/4 = 0.60.
 *   A whole-bay module (for a wall that comes down entirely) is
 *     2.40 w x 4.80 h x 0.30 d, origin at the bay centre on the finished floor.
 *
 *   DOOR    opening 1.28 x 2.72, architrave adds 0.17 all round, head at 2.72.
 *   WINDOW  opening 1.40 x 3.10, sill at 0.92, arch springs at 2.40, head at 3.10 + rise.
 *
 * ============================================================================
 * HOW TO USE IT
 * ============================================================================
 * Everything is authored into a `GeoBin`, which sorts geometry by material key and merges
 * each bucket into ONE BufferGeometry. A whole panelled wall — skirting, dado, forty
 * mouldings, cornice, dentils — comes out as three or four draw calls instead of two
 * hundred. Repeated free-standing objects (balusters, chairs, crystal drops) use
 * InstancedMesh instead, because those want their own transforms at runtime.
 *
 *   const bin = new GeoBin();
 *   wallRun(bin, { length: 12, height: STOREY, ... });
 *   const meshes = bin.build({ wood: mats.walnut, gilt: mats.gilt, ... });
 *   meshes.forEach(m => scene.add(m));
 *
 * ORIENTATION — READ THIS BEFORE PLACING A WALL.
 * A wall run starts at (x, y0, z), runs along its own +X, and its finished face looks
 * along its own +Z. A rotation about Y moves both together, so the run direction and the
 * face direction are NOT independent:
 *
 *   rotY   0      runs +X   faces +Z    -> the wall at the -Z side of a room, origin at -X
 *   rotY   PI     runs -X   faces -Z    -> the wall at the +Z side, origin at +X
 *   rotY   PI/2   runs -Z   faces +X    -> the wall at the -X side, origin at +Z (z1!)
 *   rotY  -PI/2   runs +Z   faces -X    -> the wall at the +X side, origin at -Z (z0!)
 *
 * The two side cases are the ones that catch you: for the LEFT wall of a room you pass
 * z = z1 and for the RIGHT wall you pass z = z0, because the run travels back toward the
 * other end. Getting this backwards puts the whole wall outside the room, where it is
 * invisible and — much worse — silently stops occluding, so the room reads as a black
 * void with no wall in it at all. That cost a full round on both room views.
 */

// ---------------------------------------------------------------------------
// Module dimensions
// ---------------------------------------------------------------------------
export const BAY = 2.40;
export const WALL_T = 0.30;
export const STOREY = 4.80;
export const STOREY2 = 9.60;
export const SKIRT_H = 0.34;
export const DADO_H = 1.08;
export const CORNICE_H = 0.78;
export const FIELD_LO = DADO_H;
export const FIELD_HI = STOREY - CORNICE_H;
export const REVEAL = 0.055;
export const STILE = 0.16;
export const RAIL = 0.13;

export const DOOR = { w: 1.28, h: 2.72, arch: 0.17 };
export const WINDOW = { w: 1.40, h: 3.10, sill: 0.92, spring: 2.40 };

export const DESTRUCTIBLE_PANEL = {
  w: BAY - 2 * STILE,          // 2.08
  h: FIELD_HI - FIELD_LO - 2 * RAIL,  // 2.68
  cy: (FIELD_LO + FIELD_HI) / 2,      // 2.55
  reveal: REVEAL,
  cavity: 0.22,
  studPitch: BAY / 4,
};

// ---------------------------------------------------------------------------
// Geometry plumbing
// ---------------------------------------------------------------------------

/** Assign uvs by dominant world axis so merged parts tile continuously. */
export function worldUV(geo, scale = 1, swap = false) {
  const pos = geo.attributes.position, nrm = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  const inv = 1 / scale;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i)), nz = Math.abs(nrm.getZ(i));
    let u, v;
    if (ny >= nx && ny >= nz) { u = x; v = z; }
    else if (nx >= nz) { u = z; v = y; }
    else { u = x; v = y; }
    if (swap) { const t = u; u = v; v = t; }
    uv[i * 2] = u * inv; uv[i * 2 + 1] = v * inv;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** Scale existing uvs in place (for parts that already carry authored uvs). */
export function scaleUV(geo, su, sv = su, ou = 0, ov = 0) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su + ou, uv.getY(i) * sv + ov);
  uv.needsUpdate = true;
  return geo;
}

const _m4 = new THREE.Matrix4();

/**
 * Material-keyed geometry accumulator. `add` takes a geometry plus a transform; `build`
 * merges each bucket into a single mesh.
 */
export class GeoBin {
  constructor() { this.bins = new Map(); this.tris = 0; }

  /**
   * @param key      material key
   * @param geo      BufferGeometry (consumed by reference — it is cloned internally)
   * @param m        THREE.Matrix4 | {pos,rot,scale} | null
   * @param uv       null = keep authored uvs · number = world-project at this world scale
   */
  add(key, geo, m = null, uv = null) {
    const g = geo.clone();
    if (m) g.applyMatrix4(m instanceof THREE.Matrix4 ? m : composeM(m));
    if (uv != null) worldUV(g, uv);
    if (!g.attributes.uv) worldUV(g, 1);
    // merge needs a consistent attribute set
    for (const a of Object.keys(g.attributes)) {
      if (a !== 'position' && a !== 'normal' && a !== 'uv') g.deleteAttribute(a);
    }
    if (!g.index) {
      const n = g.attributes.position.count;
      g.setIndex(Array.from({ length: n }, (_, i) => i));
    }
    let arr = this.bins.get(key);
    if (!arr) { arr = []; this.bins.set(key, arr); }
    arr.push(g);
    this.tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    return this;
  }

  /** Convenience: axis-aligned box. */
  box(key, w, h, d, x, y, z, uv = 1, rot = null) {
    const g = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Matrix4();
    if (rot) m.makeRotationFromEuler(new THREE.Euler(rot[0] || 0, rot[1] || 0, rot[2] || 0));
    m.setPosition(x, y, z);
    this.add(key, g, m, uv);
    g.dispose();
    return this;
  }

  /**
   * @returns THREE.Mesh[] — one per material key present.
   * @param opts.noCast     [key,...] buckets that must NOT cast shadows. Emissive glass
   *                        belongs here always: a window pane that casts a shadow seals
   *                        the aperture and the room goes black, which is exactly the bug
   *                        that took the first study render down to nothing.
   * @param opts.noReceive  [key,...] buckets that skip shadow receive (ceilings, backs)
   */
  build(materials, opts = {}) {
    const noCast = new Set(opts.noCast ?? []);
    const noRecv = new Set(opts.noReceive ?? []);
    const out = [];
    for (const [key, arr] of this.bins) {
      const mat = materials[key];
      if (!mat) { console.warn('[kit] no material for key', key); continue; }
      const merged = arr.length === 1 ? arr[0] : mergeGeometries(arr, false);
      if (!merged) { console.warn('[kit] merge failed for', key); continue; }
      if (arr.length > 1) for (const g of arr) g.dispose();
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = 'kit:' + key;
      mesh.castShadow = (opts.castShadow ?? true) && !noCast.has(key);
      mesh.receiveShadow = (opts.receiveShadow ?? true) && !noRecv.has(key);
      out.push(mesh);
    }
    return out;
  }
}

function composeM(o) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  if (o.rot) q.setFromEuler(new THREE.Euler(...o.rot));
  m.compose(new THREE.Vector3(...(o.pos ?? [0, 0, 0])), q, new THREE.Vector3(...(o.scale ?? [1, 1, 1])));
  return m;
}

// ---------------------------------------------------------------------------
// Profiles — classical mouldings as 2D polylines
// ---------------------------------------------------------------------------

/**
 * A tiny path builder. Points are [a, b]; what a and b mean depends on the sweep:
 *   extrudeProfile  a = projection out from the wall, b = height
 *   mitredFrame     a = offset outward in the frame plane, b = depth out of the wall
 */
export class Prof {
  constructor(a = 0, b = 0) { this.p = [[a, b]]; }
  get last() { return this.p[this.p.length - 1]; }
  to(a, b) { this.p.push([a, b]); return this; }
  by(da, db) { const l = this.last; return this.to(l[0] + da, l[1] + db); }
  /** quadratic arc: end offset (da,db), control offset (ca,cb) */
  curve(da, db, ca, cb, seg = 6) {
    const [x0, y0] = this.last;
    const x1 = x0 + ca, y1 = y0 + cb, x2 = x0 + da, y2 = y0 + db;
    for (let i = 1; i <= seg; i++) {
      const t = i / seg, u = 1 - t;
      this.p.push([u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2]);
    }
    return this;
  }
  /** convex quarter round (ovolo) */
  ovolo(da, db, seg = 6) { return this.curve(da, db, da, 0, seg); }
  /** concave quarter round (cavetto / scotia) */
  cavetto(da, db, seg = 6) { return this.curve(da, db, 0, db, seg); }
  /** S-curve: concave then convex (cyma recta) */
  cyma(da, db, seg = 5) { return this.curve(da * 0.5, db * 0.5, 0, db * 0.5, seg).curve(da * 0.5, db * 0.5, da * 0.5, 0, seg); }
  /** S-curve the other way (cyma reversa / ogee) */
  ogee(da, db, seg = 5) { return this.curve(da * 0.5, db * 0.5, da * 0.5, 0, seg).curve(da * 0.5, db * 0.5, 0, db * 0.5, seg); }
  get points() { return this.p; }
}

/** A full classical cornice: bed mould, corona, cyma crown. Returns [a,b] with b=height. */
export function corniceProfile(h = CORNICE_H, proj = 0.42) {
  const s = h / 0.78, d = proj / 0.42;
  return new Prof(0, 0)
    .to(0.030 * d, 0)                    // wall fillet
    .ogee(0.075 * d, 0.135 * s)          // bed mould
    .to(0.100 * d, 0.175 * s)
    .to(0.100 * d, 0.215 * s)            // dentil band face (dentils added separately)
    .to(0.145 * d, 0.230 * s)
    .ovolo(0.055 * d, 0.075 * s)         // ovolo under the corona
    .to(0.230 * d, 0.330 * s)
    .to(0.330 * d, 0.352 * s)            // corona soffit
    .to(0.335 * d, 0.430 * s)            // corona face
    .cavetto(0.030 * d, 0.055 * s)
    .cyma(0.085 * d, 0.235 * s, 7)       // crown
    .to(0.420 * d, 0.760 * s)
    .to(0.420 * d, 0.780 * s)
    .to(0.0, 0.780 * s)
    .points;
}

/** Skirting / plinth: a tall flat with an ogee cap. */
export function skirtProfile(h = SKIRT_H, proj = 0.055) {
  const s = h / 0.34, d = proj / 0.055;
  return new Prof(0, 0)
    .to(0.055 * d, 0)
    .to(0.055 * d, 0.660 * s)
    .to(0.048 * d, 0.700 * s)
    .ogee(-0.020 * d, 0.075 * s)
    .to(0.020 * d, 0.860 * s)
    .cavetto(-0.020 * d, 0.140 * s)
    .to(0.0, 1.0 * s)
    .points;
}

/** Chair rail / dado cap. */
export function dadoProfile(h = 0.16, proj = 0.070) {
  const s = h / 0.16, d = proj / 0.070;
  return new Prof(0, 0)
    .to(0.028 * d, 0.020 * s)
    .ovolo(0.030 * d, 0.045 * s)
    .to(0.070 * d, 0.090 * s)
    .to(0.062 * d, 0.115 * s)
    .cyma(-0.045 * d, 0.055 * s)
    .to(0.0, 0.190 * s)
    .points;
}

/** Panel bolection: the moulding that frames a sunk panel field. */
export function panelMouldProfile(w = 0.075, d = 0.045) {
  return new Prof(0, 0)
    .to(0, d * 0.85)
    .to(-w * 0.22, d)
    .ogee(-w * 0.52, -d * 0.55, 5)
    .to(-w * 0.92, -d * 0.30)
    .cavetto(-w * 0.08, -d * 0.15)
    .to(-w, 0)
    .points;
}

/** Picture frame: a deep ogee with an inner sight edge. */
export function frameProfile(w = 0.085, d = 0.075) {
  return new Prof(0, 0)
    .to(w * 0.10, 0)
    .to(w * 0.14, d * 0.30)
    .cyma(w * 0.52, d * 0.62, 6)
    .to(w * 0.80, d * 1.0)
    .to(w * 0.90, d * 0.86)
    .ovolo(w * 0.10, -d * 0.50, 4)
    .to(w, 0)
    .points;
}

/** Door / window architrave. */
export function architraveProfile(w = 0.17, d = 0.055) {
  return new Prof(0, 0)
    .to(0, d)
    .to(w * 0.16, d)
    .cavetto(w * 0.14, -d * 0.30, 4)
    .to(w * 0.48, d * 0.62)
    .ovolo(w * 0.20, d * 0.28, 5)
    .to(w * 0.86, d * 0.55)
    .to(w * 0.90, 0)
    .to(w, 0)
    .points;
}

// ---------------------------------------------------------------------------
// Sweeps
// ---------------------------------------------------------------------------

/** Connect an ordered list of equal-length vertex rings into a strip. */
function stripFromRings(rings, closeRing, uvs) {
  const n = rings[0].length, m = rings.length;
  const pos = new Float32Array(n * m * 3);
  const uv = new Float32Array(n * m * 2);
  const idx = [];
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const p = rings[j][i];
      pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
      uv[k * 2] = uvs[j][i][0]; uv[k * 2 + 1] = uvs[j][i][1];
    }
  }
  const lim = closeRing ? n : n - 1;
  for (let j = 0; j < m - 1; j++) {
    for (let i = 0; i < lim; i++) {
      const a = j * n + i, b = j * n + ((i + 1) % n);
      const c = (j + 1) * n + i, d = (j + 1) * n + ((i + 1) % n);
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function profArcLen(profile) {
  const s = [0];
  for (let i = 1; i < profile.length; i++) {
    const dx = profile[i][0] - profile[i - 1][0], dy = profile[i][1] - profile[i - 1][1];
    s.push(s[i - 1] + Math.hypot(dx, dy));
  }
  return s;
}

/**
 * Extrude a moulding profile along +X.
 * Profile [a,b]: a = +Z projection into the room, b = +Y height.
 * Origin is the back-bottom of the profile at x = 0.
 * uv: u runs along the extrusion in metres, v runs across the profile in metres.
 */
export function extrudeProfile(profile, length, opts = {}) {
  const arc = profArcLen(profile);
  const rings = [], uvs = [];
  const x0 = opts.x0 ?? 0;
  for (const t of [0, 1]) {
    const x = x0 + t * length;
    rings.push(profile.map(([a, b]) => new THREE.Vector3(x, b, a)));
    uvs.push(profile.map((_, i) => [x, arc[i]]));
  }
  return stripFromRings(rings, false, uvs);
}

/**
 * Sweep a profile around a rectangle with true mitres. Because the path is an
 * axis-aligned rectangle, offsetting every path vertex by the profile's `a` gives a
 * larger rectangle — so a mitred corner falls out of the construction for free.
 * Profile [a,b]: a = outward offset in the frame plane, b = +Z depth.
 * The frame's SIGHT opening is w x h; the moulding grows outward from it.
 */
export function mitredFrame(profile, w, h, opts = {}) {
  const arc = profArcLen(profile);
  const hw = w / 2, hh = h / 2;
  const rings = [], uvs = [];
  const per = 2 * (w + h);
  for (let i = 0; i < profile.length; i++) {
    const [a, b] = profile[i];
    const x = hw + a, y = hh + a;
    // path order: BL -> BR -> TR -> TL, closed
    const corners = [[-x, -y], [x, -y], [x, y], [-x, y]];
    const ring = [], uvr = [];
    // subdivide each edge once so uvs run linearly along the run
    let run = 0;
    for (let c = 0; c < 4; c++) {
      const p0 = corners[c], p1 = corners[(c + 1) % 4];
      ring.push(new THREE.Vector3(p0[0], p0[1], b));
      uvr.push([run, arc[i]]);
      run += Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    }
    rings.push(ring); uvs.push(uvr);
  }
  const g = stripFromRings(rings, true, uvs);
  if (opts.flat) g.computeVertexNormals();
  return g;
}

/**
 * Sweep a profile along a circular arc in the XY plane (for arched architraves and
 * archivolts). Profile a = radial outward offset, b = +Z depth.
 */
export function archSweep(profile, radius, a0, a1, segs = 20, opts = {}) {
  const arc = profArcLen(profile);
  const rings = [], uvs = [];
  const cy = opts.cy ?? 0, cx = opts.cx ?? 0;
  for (let j = 0; j <= segs; j++) {
    const t = j / segs, ang = a0 + (a1 - a0) * t;
    const ring = [], uvr = [];
    for (let i = 0; i < profile.length; i++) {
      const r = radius + profile[i][0];
      ring.push(new THREE.Vector3(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, profile[i][1]));
      uvr.push([ang * radius, arc[i]]);
    }
    rings.push(ring); uvs.push(uvr);
  }
  return stripFromRings(rings, false, uvs);
}

/** A lathe profile of [r, y] pairs → a turned object (baluster, urn, candle cup). */
export function lathe(pts, segs = 14, opts = {}) {
  const v = pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y));
  const g = new THREE.LatheGeometry(v, segs, opts.phiStart ?? 0, opts.phiLength ?? Math.PI * 2);
  return g;
}

// ---------------------------------------------------------------------------
// Kit parts
// ---------------------------------------------------------------------------

/**
 * A run of panelled wall along +X, face pointing +Z.
 *
 * opts: { length, height=STOREY, y0=0, z=0, bays, dado=true, fielded=true,
 *         keys:{wall,mould,skirt,cornice,gilt}, skip:[bayIndex...], reveal }
 * `skip` leaves a bay empty (a door or window case is placed there instead).
 */
export function wallRun(bin, o = {}) {
  const length = o.length ?? BAY * 4;
  const height = o.height ?? STOREY;
  const bays = o.bays ?? Math.max(1, Math.round(length / BAY));
  const bw = length / bays;
  const y0 = o.y0 ?? 0;
  const z = o.z ?? 0;
  const K = { wall: 'wall', mould: 'mould', skirt: 'mould', cornice: 'mould', ...(o.keys ?? {}) };
  const skip = new Set(o.skip ?? []);
  const reveal = o.reveal ?? REVEAL;
  const fieldLo = o.fieldLo ?? DADO_H;
  const fieldHi = o.fieldHi ?? (height - (o.corniceH ?? CORNICE_H));
  const rot = o.rotY ?? 0;
  const R = new THREE.Matrix4().makeRotationY(rot);
  const T = new THREE.Matrix4().makeTranslation(o.x ?? 0, y0, z);
  const base = T.multiply(R);
  const put = (key, geo, local = null, uv = null) => {
    const m = local ? base.clone().multiply(local) : base.clone();
    bin.add(key, geo, m, uv);
    geo.dispose?.();
  };
  const tr = (x, y, zz) => new THREE.Matrix4().makeTranslation(x, y, zz);

  // ---- the wall plane itself (front face at z = 0, thickness behind) ----
  //
  // OPENINGS ARE REAL HOLES, and they have to be. The first version of this kit drew the
  // wall as one box and only skipped the PANELLING at a door or window bay — which sealed
  // the stained-glass lancet behind 300 mm of solid walnut and made the study render
  // completely black. Worse, it meant the light through a window had to be faked, because
  // there was nothing for it to pass through.
  //
  // With a genuine hole, a spot light outside the building throws the window's own shape —
  // arch, mullions, transoms and all — across the floor for free, out of the shadow map
  // that was going to be rendered anyway. That is the single highest-value thing in the
  // whole lighting rig, and it costs one extra pass over a list of rectangles.
  //
  // No CSG: the wall is emitted as a set of boxes tiled around the openings. Split the run
  // into vertical strips at every opening edge, then within a strip that contains an
  // opening, emit the piece below it and the piece above it.
  if (o.solid !== false) {
    const t = o.thickness ?? WALL_T;
    const uvw = o.uvWall ?? 1.2;
    const ops = (o.openings ?? []).filter((p) => p.x1 > 0 && p.x0 < length);
    const slab = (a, b, c, d) => {
      if (b - a < 1e-4 || d - c < 1e-4) return;
      const g = new THREE.BoxGeometry(b - a, d - c, t);
      put(K.wall, g, tr((a + b) / 2, (c + d) / 2, -t / 2), uvw);
    };
    if (!ops.length) {
      slab(0, length, 0, height);
    } else {
      // x boundaries: 0, every opening edge, length
      const xs = [0, length];
      for (const p of ops) { xs.push(Math.max(0, p.x0), Math.min(length, p.x1)); }
      xs.sort((a, b) => a - b);
      for (let i = 0; i < xs.length - 1; i++) {
        const a = xs[i], b = xs[i + 1];
        if (b - a < 1e-4) continue;
        const mid = (a + b) / 2;
        // openings covering this strip, sorted by height
        const inStrip = ops.filter((p) => p.x0 <= mid && p.x1 >= mid).sort((p, q) => p.y0 - q.y0);
        if (!inStrip.length) { slab(a, b, 0, height); continue; }
        let y = 0;
        for (const p of inStrip) {
          slab(a, b, y, Math.max(y, Math.min(height, p.y0)));
          y = Math.max(y, Math.min(height, p.y1));
        }
        slab(a, b, y, height);
      }
    }
  }

  // ---- skirting ----
  if (o.skirt !== false) {
    const g = extrudeProfile(skirtProfile(SKIRT_H, 0.055), length);
    put(K.skirt, g, tr(0, 0, 0.001));
  }

  // ---- dado rail ----
  if (o.dado !== false) {
    const g = extrudeProfile(dadoProfile(0.16, 0.070), length);
    put(K.cornice, g, tr(0, DADO_H - 0.16, 0.001));
  }

  // ---- cornice + dentils ----
  if (o.cornice !== false) {
    const ch = o.corniceH ?? CORNICE_H;
    const g = extrudeProfile(corniceProfile(ch, o.corniceProj ?? 0.42), length);
    put(K.cornice, g, tr(0, height - ch, 0.001));
    // dentils: a run of small blocks in the cornice's dentil band. Instanced by merging —
    // they are 8 tris each and there are a few dozen, so one merged strip is right.
    const dn = Math.max(2, Math.round(length / 0.135));
    const dp = length / dn;
    const db = new THREE.BoxGeometry(dp * 0.55, ch * 0.055 / 0.78 * 0.78, 0.052);
    for (let i = 0; i < dn; i++) {
      put(K.cornice, db.clone(), tr((i + 0.5) * dp, height - ch + ch * 0.238, 0.126), 0.35);
    }
    db.dispose();
  }

  // ---- panel fields ----
  //
  // ⚠ TWO KINDS OF PANEL, AND THE LOCKED ART USES THE OTHER ONE.
  //
  // The default here is a SUNK field: a plate set back behind the wall face with a bolection
  // moulding round it. That is a real English form and it is what four of the six estate
  // pieces want. It is not what `Dev Art/1785319916301` shows. Cropping the art's left wall at
  // native resolution and putting it beside the same crop of the render is unambiguous: the
  // art's panels stand PROUD of their stiles and rails, and each one carries a wide chamfered
  // margin running from the raised centre back down to the framing. `critic-estate-3` has
  // called this the single largest gap in the blind test for three rounds running — "flat
  // repeating woodgrain ... only a woodgrain texture and thin inset division lines" — and the
  // reason no texture change could ever close it is that the missing thing is GEOMETRY. A
  // sunk field presents ONE step at its edge, seen edge-on from most of the room; a raised
  // and fielded panel presents two long inclined planes per side, so under a raking beam every
  // panel carries a bright bevel and a dark bevel and the wall reads as carved from across
  // the room.
  //
  // `raised: true` is additive and opt-in — nothing that exists today changes behaviour.
  const pm = panelMouldProfile(0.075, 0.042);
  const dpm = panelMouldProfile(0.055, 0.030);
  const raised = o.raised === true;
  // 0.048 / 0.125, measured off the first capture rather than guessed: at 0.034 the panels
  // read but only just — the bevel subtends about two pixels at the study's camera and the
  // wall still photographs closer to flat than to carved. A raised panel in real joinery is
  // typically 12-16 mm proud on a 20 mm board; this is a stage set at 8 m, and the read is what
  // is being built, not the millimetres.
  const rise = o.panelRise ?? 0.048;
  const marg = o.panelBevel ?? 0.125;
  // the bead worked on the inner edge of the stiles, where the field meets the framing
  const beadProf = new Prof(0, 0).to(0, 0.026).ovolo(-0.028, -0.026, 4).points;
  /** one raised-and-fielded panel: proud centre plate, chamfered margin, framing bead. */
  const fielded = (cx, cy, pw, ph, rs, mg) => {
    const fw = Math.max(0.08, pw - 2 * mg), fh = Math.max(0.08, ph - 2 * mg);
    put(K.wall, new THREE.BoxGeometry(fw, fh, 0.024), tr(cx, cy, rs - 0.012), o.uvWall ?? 1.2);
    // the FIELDING. `mitredFrame` grows outward from its sight opening, so a profile running
    // from (0, rs) at the field's edge out to (mg, 0) at the framing is exactly the chamfer,
    // mitred at all four corners for free by the rectangle construction.
    put(K.wall, mitredFrame(new Prof(0, rs).to(mg * 0.88, 0.005).to(mg, 0.0).points, fw, fh),
      tr(cx, cy, 0), o.uvWall ?? 1.2);
    put(K.mould, mitredFrame(beadProf, pw + 0.044, ph + 0.044), tr(cx, cy, 0.002));
  };
  // ⚠ A PANEL DRAWN ACROSS AN OPENING — THE BUG THIS BLOCK EXISTS TO END.
  //
  // `openings` has always cut the wall SLAB and nothing else, so the panel fields were emitted
  // for every un-skipped bay whether or not a door or a window was in it. Each caller was
  // expected to work out the overlapping bay indices by hand and pass them in `skip`, and the
  // arithmetic changes whenever the bay count or an opening moves. Five of the six estate
  // pieces got it wrong, silently, and one of them cost a whole critique round:
  //
  //   light.dark's cold doorway is the piece's ONLY second hue and the thing three rounds of
  //   chroma work were aimed at. Its back wall has five bays over 12.4 m and no `skip`, so bay
  //   2's field — a 2.16 x 2.20 m plate at z = -reveal, i.e. IN FRONT of the glazing line —
  //   was drawn straight across a 1.62 x 3.05 m doorway. Found with
  //     node harness/_tmp_geoprobe.mjs --pick --view light.dark --grid 860,340,220,320,8
  //   which returns `kit:wood` over the whole opening. Every round that answered "the doorway
  //   is not bright enough" by raising the light was raising a light behind a panel.
  //
  // A panel intersecting a hole is never correct, so this is a fix rather than a policy, and
  // it is per-PANEL rather than per-bay: a door leaves the upper field alone and takes the
  // dado, a high window does the reverse. `autoSkip: false` opts out.
  const ops = (o.openings ?? []).filter((p) => p.x1 > 0 && p.x0 < length);
  const clashes = (a0, a1, b0, b1) => {
    if (o.autoSkip === false) return false;
    for (const p of ops) {
      // Floor-reaching openings (doorways) get a reveal pad so a stile / bolection
      // cannot sit inside the aperture. High windows keep the exact overlap they had.
      const pad = (p.y0 ?? 0) < 0.35 ? 0.14 : 0;
      if (p.x1 + pad > a0 && p.x0 - pad < a1 && (p.y1 ?? 0) > b0 && (p.y0 ?? 0) < b1) return true;
    }
    return false;
  };
  for (let b = 0; b < bays; b++) {
    if (skip.has(b)) continue;
    const cx = (b + 0.5) * bw;
    // upper field
    if (o.fielded !== false) {
      const pw = bw - 2 * STILE, ph = fieldHi - fieldLo - 2 * RAIL;
      const cy = (fieldLo + fieldHi) / 2;
      if (pw > 0.2 && ph > 0.2 && !clashes(cx - pw / 2, cx + pw / 2, cy - ph / 2, cy + ph / 2)) {
        if (raised) {
          fielded(cx, cy, pw, ph, rise, marg);
        } else {
          const sunk = new THREE.BoxGeometry(pw, ph, 0.02);
          put(K.wall, sunk, tr(cx, cy, -reveal), o.uvWall ?? 1.2);
          const mf = mitredFrame(pm, pw, ph);
          put(K.mould, mf, tr(cx, cy, -reveal + 0.02));
        }
        if (o.giltPanel) {
          const gf = mitredFrame(panelMouldProfile(0.036, 0.020), pw - 0.20, ph - 0.20);
          put('gilt', gf, tr(cx, cy, raised ? rise + 0.004 : -reveal + 0.024));
        }
      }
    }
    // dado panel
    if (o.dado !== false) {
      const pw = bw - 2 * STILE, ph = DADO_H - 0.16 - SKIRT_H - 0.09;
      const cy = (SKIRT_H + (DADO_H - 0.16)) / 2;
      if (pw > 0.2 && ph > 0.15 && !clashes(cx - pw / 2, cx + pw / 2, cy - ph / 2, cy + ph / 2)) {
        if (raised) {
          fielded(cx, cy, pw, ph, rise * 0.72, marg * 0.70);
        } else {
          const sunk = new THREE.BoxGeometry(pw, ph, 0.02);
          put(K.wall, sunk, tr(cx, cy, -reveal * 0.7), o.uvWall ?? 1.2);
          const mf = mitredFrame(dpm, pw, ph);
          put(K.mould, mf, tr(cx, cy, -reveal * 0.7 + 0.02));
        }
      }
    }
  }
  return { length, bays, bayWidth: bw };
}

/**
 * A pilaster: a flattened column engaged in the wall. Entasis is real — the shaft swells
 * to its maximum at about a third of its height, which is the single thing that separates
 * a classical order from a rectangle.
 */
export function pilaster(bin, o = {}) {
  const h = o.h ?? (FIELD_HI - SKIRT_H);
  const w = o.w ?? 0.42;
  const proj = o.proj ?? 0.12;
  const K = { shaft: 'wall', cap: 'mould', ...(o.keys ?? {}) };
  const x = o.x ?? 0, y = o.y ?? SKIRT_H, z = o.z ?? 0;
  const rot = o.rotY ?? 0;
  const base = new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(rot));
  const put = (k, g, lx, ly, lz, uv) => {
    const m = base.clone().multiply(new THREE.Matrix4().makeTranslation(lx, ly, lz));
    bin.add(k, g, m, uv); g.dispose?.();
  };

  const plinthH = 0.30, capH = h * 0.11;
  const shaftH = h - plinthH - capH;
  put(K.cap, new THREE.BoxGeometry(w * 1.14, plinthH, proj * 1.20), 0, plinthH / 2, proj * 0.6, 0.5);

  // shaft with entasis and flutes, built as a thin lofted slab
  const segs = 12, flutes = o.flutes ?? 5;
  const rings = [], uvs = [];
  for (let j = 0; j <= segs; j++) {
    const t = j / segs;
    const taper = 1 - 0.115 * t + 0.026 * Math.sin(Math.PI * Math.pow(t, 0.85));
    const hw = (w / 2) * taper, d = proj * taper;
    const ring = [], uvr = [];
    const n = flutes * 4 + 2;
    for (let i = 0; i <= n; i++) {
      const u = i / n;                       // 0..1 across the face
      const fx = (u - 0.5) * 2 * hw;
      // flute: cosine grooves between two flat margins
      const inMargin = u < 0.09 || u > 0.91;
      const fu = (u - 0.09) / 0.82;
      // ⚠ THE FLUTE DEPTH SCALES WITH THE PROJECTION (round 17). It was a hardcoded 0.028, which
      // is right for the 0.12 default and vanishes on a giant order: the ballroom's pilasters
      // went to proj 0.30 to stop reading as hairlines (see that call), and 2.8 cm of groove on
      // a 0.72 x 0.30 m member is a member with no fluting on it — which is how `eye.walk` came
      // back with flat cream slabs where the hairlines used to be. `proj * 0.22` reproduces the
      // old number at the old default to within a millimetre, so every existing caller is
      // unchanged; the cap stops a very deep pilaster from being carved into a comb.
      const fluteD = o.fluteDepth ?? Math.min(0.055, proj * 0.22);
      const groove = inMargin ? 0 : Math.pow(Math.max(0, Math.sin(fu * Math.PI * flutes)), 0.6) * fluteD;
      ring.push(new THREE.Vector3(fx, plinthH + t * shaftH, d - groove));
      uvr.push([u * w, plinthH + t * shaftH]);
    }
    // wrap the sides back to the wall
    ring.push(new THREE.Vector3(hw, plinthH + t * shaftH, 0));
    ring.unshift(new THREE.Vector3(-hw, plinthH + t * shaftH, 0));
    uvr.push([w * 1.1, plinthH + t * shaftH]);
    uvr.unshift([-w * 0.1, plinthH + t * shaftH]);
    rings.push(ring); uvs.push(uvr);
  }
  put(K.shaft, stripFromRings(rings, false, uvs), 0, 0, 0);

  // capital: abacus + echinus + necking
  const cy = plinthH + shaftH;
  put(K.cap, new THREE.BoxGeometry(w * 0.96, capH * 0.14, proj * 1.02), 0, cy + capH * 0.07, proj * 0.5, 0.4);
  const ech = extrudeProfile(new Prof(0, 0).ovolo(proj * 0.55, capH * 0.50, 6).to(proj * 0.55, capH * 0.58).to(0, capH * 0.58).points,
    w * 1.06, { x0: -w * 0.53 });
  put(K.cap, ech, 0, cy + capH * 0.14, 0);
  put(K.cap, new THREE.BoxGeometry(w * 1.22, capH * 0.28, proj * 1.55), 0, cy + capH * 0.86, proj * 0.72, 0.4);
  return { w, h, proj };
}

/** A free-standing column with entasis, flutes, base and capital. */
export function column(bin, o = {}) {
  const h = o.h ?? 5.2;
  const r = o.r ?? 0.28;
  const K = { shaft: 'stone', cap: 'stone', ...(o.keys ?? {}) };
  const x = o.x ?? 0, y = o.y ?? 0, z = o.z ?? 0;
  const put = (k, g, ly, uv) => {
    bin.add(k, g, new THREE.Matrix4().makeTranslation(x, y + ly, z), uv); g.dispose?.();
  };
  const baseH = r * 0.62, capH = r * 0.80;
  const shaftH = h - baseH - capH;

  put(K.cap, lathe([[0, 0], [r * 1.42, 0], [r * 1.42, baseH * 0.30], [r * 1.28, baseH * 0.36],
    [r * 1.30, baseH * 0.55], [r * 1.10, baseH * 0.72], [r * 1.14, baseH * 0.86], [r * 1.02, baseH]], 20), 0, 0.5);

  const segs = 14, flutes = o.flutes ?? 20, rad = flutes * 2;
  const rings = [], uvs = [];
  for (let j = 0; j <= segs; j++) {
    const t = j / segs;
    const taper = 1 - 0.165 * t + 0.030 * Math.sin(Math.PI * Math.pow(t, 0.82));
    const rr = r * taper;
    const ring = [], uvr = [];
    for (let i = 0; i <= rad; i++) {
      const a = (i / rad) * Math.PI * 2;
      const groove = Math.pow(Math.max(0, Math.sin((i / rad) * Math.PI * flutes)), 0.55) * r * 0.075;
      const q = rr - groove;
      ring.push(new THREE.Vector3(Math.cos(a) * q, baseH + t * shaftH, Math.sin(a) * q));
      uvr.push([(i / rad) * Math.PI * 2 * r, baseH + t * shaftH]);
    }
    rings.push(ring); uvs.push(uvr);
  }
  put(K.shaft, stripFromRings(rings, true, uvs), 0);

  const cy = baseH + shaftH;
  put(K.cap, lathe([[r * 0.86, 0], [r * 0.92, capH * 0.10], [r * 0.88, capH * 0.18],
    [r * 1.18, capH * 0.52], [r * 1.24, capH * 0.66], [r * 1.20, capH * 0.74], [r * 1.42, capH * 0.86],
    [r * 1.42, capH], [0, capH]], 20), cy, 0.5);
  return { h, r };
}

/**
 * A round-arched opening in a wall: jambs, archivolt, keystone, and the wall spandrels
 * above. Cut geometrically rather than by CSG — the pieces around the hole are just
 * boxes and a swept arch, which merges and instances far better than a boolean would.
 */
export function archedOpening(bin, o = {}) {
  const w = o.w ?? 2.0, h = o.h ?? 4.2;          // h = to the crown
  const spring = o.spring ?? (h - w / 2);
  const t = o.t ?? WALL_T;
  const K = { wall: 'wall', trim: 'mould', ...(o.keys ?? {}) };
  const x = o.x ?? 0, y = o.y ?? 0, z = o.z ?? 0;
  const base = new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(o.rotY ?? 0));
  const put = (k, g, m, uv) => { bin.add(k, g, base.clone().multiply(m), uv); g.dispose?.(); };
  const tr = (a, b, c) => new THREE.Matrix4().makeTranslation(a, b, c);

  // reveal: the thickness of the wall seen through the opening
  const rev = new THREE.BoxGeometry(0.02, spring, t);
  put(K.wall, rev.clone(), tr(-w / 2, spring / 2, -t / 2), 0.8);
  put(K.wall, rev, tr(w / 2, spring / 2, -t / 2), 0.8);

  // archivolt: swept moulding both faces + a soffit band
  const ar = w / 2;
  const prof = o.archivolt ?? architraveProfile(0.15, 0.055);
  const av = archSweep(prof, ar, 0, Math.PI, 22, { cy: spring });
  put(K.trim, av, tr(0, 0, 0.002));
  const av2 = archSweep(prof, ar, 0, Math.PI, 22, { cy: spring });
  put(K.trim, av2, new THREE.Matrix4().makeScale(1, 1, -1).premultiply(tr(0, 0, -t - 0.002)));

  // soffit
  const soff = [];
  const segs = 22;
  const uvs = [];
  for (let j = 0; j <= segs; j++) {
    const a = (j / segs) * Math.PI;
    const px = Math.cos(a) * ar, py = spring + Math.sin(a) * ar;
    soff.push([new THREE.Vector3(px, py, 0), new THREE.Vector3(px, py, -t)]);
    uvs.push([[a * ar, 0], [a * ar, t]]);
  }
  put(K.wall, stripFromRings(soff, false, uvs), tr(0, 0, 0), null);

  // jamb architraves
  const ja = extrudeProfile(prof.map(([a, b]) => [b, a]), spring);
  put(K.trim, ja.clone(), new THREE.Matrix4().makeRotationZ(Math.PI / 2).premultiply(tr(-w / 2, 0, 0.002)));
  const jb = extrudeProfile(prof.map(([a, b]) => [b, a]), spring);
  put(K.trim, jb, new THREE.Matrix4().makeRotationZ(-Math.PI / 2).premultiply(tr(w / 2, 0, 0.002)));

  // keystone
  const ks = new THREE.BoxGeometry(0.20, 0.34, 0.09);
  put(K.trim, ks, tr(0, spring + ar + 0.09, 0.055), 0.4);
  return { w, h, spring };
}

/** A panelled door in a case: architrave, two leaves, a cornice hood. */
export function doorCase(bin, o = {}) {
  const w = o.w ?? DOOR.w, h = o.h ?? DOOR.h;
  const K = { leaf: 'wood', trim: 'mould', gilt: 'gilt', ...(o.keys ?? {}) };
  const x = o.x ?? 0, y = o.y ?? 0, z = o.z ?? 0;
  const base = new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(o.rotY ?? 0));
  const put = (k, g, m, uv) => { bin.add(k, g, base.clone().multiply(m), uv); g.dispose?.(); };
  const tr = (a, b, c) => new THREE.Matrix4().makeTranslation(a, b, c);

  // opening + leaves
  const nLeaf = o.leaves ?? 2;
  const lw = w / nLeaf;
  for (let i = 0; i < nLeaf; i++) {
    const cx = -w / 2 + lw * (i + 0.5);
    put(K.leaf, new THREE.BoxGeometry(lw - 0.012, h - 0.012, 0.055), tr(cx, h / 2, -0.035), 0.9);
    // three sunk panels per leaf
    const panes = [[0.62, 0.30], [0.28, 0.62], [0.10, 0.88]];
    for (const [ph, pc] of panes) {
      const pw = lw - 0.20, hh = (h - 0.30) * ph * 0.62;
      const cy = h * pc;
      put(K.leaf, new THREE.BoxGeometry(pw, hh, 0.02), tr(cx, cy, -0.055), 0.9);
      put(K.trim, mitredFrame(panelMouldProfile(0.048, 0.026), pw, hh), tr(cx, cy, -0.045));
    }
  }
  // architrave
  const ap = architraveProfile(DOOR.arch, 0.058);
  put(K.trim, mitredFrameOpen(ap, w, h), tr(0, 0, 0.002));
  // entablature hood
  put(K.trim, new THREE.BoxGeometry(w + 0.62, 0.075, 0.16), tr(0, h + 0.20, 0.08), 0.4);
  put(K.trim, extrudeProfile(corniceProfile(0.30, 0.20), w + 0.72, { x0: -(w + 0.72) / 2 }), tr(0, h + 0.26, 0.0));
  if (o.gilt !== false) {
    put(K.gilt, mitredFrame(panelMouldProfile(0.028, 0.016), w + 0.10, h + 0.10), tr(0, h / 2, 0.052));
  }
  return { w, h };
}

/** A three-sided mitred frame (jambs + head, open at the floor) for door architraves. */
export function mitredFrameOpen(profile, w, h) {
  const arc = profArcLen(profile);
  const rings = [], uvs = [];
  for (let i = 0; i < profile.length; i++) {
    const [a, b] = profile[i];
    const x = w / 2 + a, top = h + a;
    const pts = [[-x, 0], [-x, top], [x, top], [x, 0]];
    const ring = [], uvr = [];
    let run = 0;
    for (let c = 0; c < 4; c++) {
      ring.push(new THREE.Vector3(pts[c][0], pts[c][1], b));
      uvr.push([run, arc[i]]);
      if (c < 3) run += Math.hypot(pts[c + 1][0] - pts[c][0], pts[c + 1][1] - pts[c][1]);
    }
    rings.push(ring); uvs.push(uvr);
  }
  return stripFromRings(rings, false, uvs);
}

/**
 * A tall window bay: splayed reveal, stone sill, arched head, leaded tracery and a glass
 * plane. `glassKey` is drawn with the emissive stained-glass material, so the window is a
 * light source, not a lit surface.
 */
export function windowBay(bin, o = {}) {
  const w = o.w ?? WINDOW.w, h = o.h ?? WINDOW.h;
  const sill = o.sill ?? WINDOW.sill;
  const spring = o.spring ?? (sill + h * 0.72);
  const t = o.t ?? WALL_T;
  const K = { reveal: 'wall', trim: 'mould', stone: 'stone', glass: 'glass', lead: 'mould', ...(o.keys ?? {}) };
  const x = o.x ?? 0, y = o.y ?? 0, z = o.z ?? 0;
  const base = new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(o.rotY ?? 0));
  const put = (k, g, m, uv) => { bin.add(k, g, base.clone().multiply(m), uv); g.dispose?.(); };
  const tr = (a, b, c) => new THREE.Matrix4().makeTranslation(a, b, c);

  const ar = w / 2;
  const head = spring + ar;

  // splayed reveals
  const revW = 0.02;
  for (const s of [-1, 1]) {
    put(K.reveal, new THREE.BoxGeometry(revW, spring - sill, t), tr(s * w / 2, (sill + spring) / 2, -t / 2), 0.7);
  }
  // arched soffit
  const soff = [], uvs = [];
  for (let j = 0; j <= 18; j++) {
    const a = (j / 18) * Math.PI;
    const px = Math.cos(a) * ar, py = spring + Math.sin(a) * ar;
    soff.push([new THREE.Vector3(px, py, 0), new THREE.Vector3(px, py, -t)]);
    uvs.push([[a * ar, 0], [a * ar, t]]);
  }
  put(K.reveal, stripFromRings(soff, false, uvs), tr(0, 0, 0), null);

  // SPANDRELS. The hole punched in the wall is rectangular (sill to head); the window is
  // arched. Without these two stepped fillets the corners above the springing are open sky
  // and daylight pours through them, which is both wrong and instantly readable as a bug.
  // Stepped boxes rather than a swept solid because they sit behind the archivolt and are
  // never seen — they only have to occlude.
  {
    const steps = o.spandrelSteps ?? 9;
    const dy = ar / steps;
    for (let j = 0; j < steps; j++) {
      const y0 = spring + j * dy, y1 = y0 + dy;
      const half = Math.sqrt(Math.max(0, ar * ar - Math.pow(y0 - spring, 2)));
      const fill = w / 2 - half;
      if (fill <= 0.004) continue;
      for (const s of [-1, 1]) {
        put(K.reveal, new THREE.BoxGeometry(fill + 0.01, dy + 0.004, t),
          tr(s * (half + fill / 2), (y0 + y1) / 2, -t / 2), 0.7);
      }
    }
  }

  // sill + apron
  put(K.stone, new THREE.BoxGeometry(w + 0.42, 0.11, t + 0.14), tr(0, sill - 0.055, -t / 2 + 0.07), 0.5);
  put(K.stone, new THREE.BoxGeometry(w + 0.20, 0.16, 0.09), tr(0, sill - 0.19, 0.045), 0.4);

  // archivolt + jamb trim in stone
  put(K.stone, archSweep(architraveProfile(0.16, 0.06), ar, 0, Math.PI, 20, { cy: spring }), tr(0, 0, 0.002));
  for (const s of [-1, 1]) {
    const j = extrudeProfile(architraveProfile(0.16, 0.06).map(([a, b]) => [b, a]), spring - sill + 0.1);
    put(K.stone, j, new THREE.Matrix4().makeRotationZ(s * Math.PI / 2).premultiply(tr(s * w / 2, sill - 0.05, 0.002)));
  }

  // GLASS: ONE lancet-shaped sheet with uv spanning the whole opening, not a rectangle
  // plus a half-disc. Two pieces meant the stained-glass texture was mapped twice at
  // different scales and the medallion landed in both of them; one sheet means the design
  // sits in the window exactly as it was authored.
  const gz = -t * 0.55;
  const gh = spring - sill;
  {
    const nx = 16, ny = 26;
    const total = gh + ar;
    const pos = [], uvA = [], idx = [];
    for (let j = 0; j <= ny; j++) {
      const fy = j / ny;
      const y = fy * total;                       // 0 at the sill, total at the crown
      const half = y <= gh ? (w / 2 - 0.015)
        : Math.sqrt(Math.max(0, ar * ar - (y - gh) * (y - gh))) - 0.012;
      for (let i = 0; i <= nx; i++) {
        const fx = i / nx;
        pos.push((fx - 0.5) * 2 * Math.max(half, 1e-3), sill + y, gz);
        uvA.push(fx, fy);
      }
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    gg.setAttribute('uv', new THREE.Float32BufferAttribute(uvA, 2));
    gg.setIndex(idx);
    gg.computeVertexNormals();
    put(K.glass, gg, new THREE.Matrix4(), null);
  }

  // leaded tracery: mullions and transoms in front of the glass
  const nMull = o.mullions ?? 2, nTrans = o.transoms ?? 3;
  for (let i = 1; i <= nMull; i++) {
    const px = -w / 2 + (w * i) / (nMull + 1);
    put(K.lead, new THREE.BoxGeometry(0.045, gh + ar * 0.9, 0.045), tr(px, sill + (gh + ar * 0.9) / 2, gz + 0.03), 0.3);
  }
  for (let i = 1; i <= nTrans; i++) {
    const py = sill + (gh * i) / (nTrans + 1);
    put(K.lead, new THREE.BoxGeometry(w - 0.03, 0.038, 0.042), tr(0, py, gz + 0.03), 0.3);
  }
  // arch ring
  put(K.lead, new THREE.TorusGeometry(ar - 0.02, 0.022, 5, 22, Math.PI), tr(0, spring, gz + 0.03), 0.3);
  return { w, h, sill, spring, head, glassZ: gz };
}

/**
 * A POINTED, CUSPED GOTHIC LANCET. Same job as `windowBay` — a real hole with reveals, a
 * sill, an archivolt, glass and leadwork — but the head is a two-centred pointed arch
 * carrying real bar tracery instead of a Roman semicircle with a grid of straight mullions.
 *
 * WHY THIS IS A SEPARATE FUNCTION AND NOT A FLAG ON `windowBay`
 * `windowBay` is called by the ballroom, the chandelier room, the gallery and by
 * `src/game/room.js`, which belongs to another owner and whose draw-call budget is locked.
 * Every one of those wants the round arch it already has — no critic has ever complained
 * about them. Adding a branch to a function four other pieces depend on to fix one piece is
 * how a shared file acquires a regression. This is additive: nothing that exists today
 * changes behaviour, and `light.shaft` opts in.
 *
 * THE ARCH. Two-centred: the head is two circular arcs whose centres sit ON the springing
 * line, displaced horizontally, so the two curves meet at a point instead of a tangent.
 *   `pointed` = 0 puts both centres at the middle and gives back a semicircle exactly;
 *   `pointed` = 1 puts each centre under the opposite jamb — the equilateral arch, the
 *   sharpest of the standard forms. Anything between is a drop arch.
 * With half-width a and p = pointed:  R = a(1+p), centres at (±ap, spring), and the apex
 * rises a·sqrt(1+2p) above the springing. Half-width at height y above the springing is
 * sqrt(R² − y²) − ap, and that one expression drives the soffit, the spandrel fill and the
 * glass outline, so all three agree by construction.
 *
 * THE TRACERY is the part that actually reads as Gothic at 8 m, and it is the thing the
 * locked art has that a diamond grid does not: the head is subdivided into two sub-lancets
 * of the same two-centred form, with a foiled circle in the spandrel above them. The foils
 * are the cusps — three lobes struck inside the circle. All of it goes in under the `lead`
 * key, so it merges into the room's existing leadwork mesh and costs no draw call.
 *
 * It is also what patterns the floor: the spot outside is a shadow caster and this bar
 * tracery is opaque, so the pool on the floor is this design projected, with no cookie
 * texture and no second pass.
 */
export function gothicLancet(bin, o = {}) {
  const w = o.w ?? 2.0;
  const sill = o.sill ?? 3.0;
  const spring = o.spring ?? (sill + 1.2);
  const t = o.t ?? WALL_T;
  const p = o.pointed ?? 0.75;
  const K = { reveal: 'wall', trim: 'mould', stone: 'stone', glass: 'glass', lead: 'mould', ...(o.keys ?? {}) };
  const base = new THREE.Matrix4()
    .makeTranslation(o.x ?? 0, o.y ?? 0, o.z ?? 0)
    .multiply(new THREE.Matrix4().makeRotationY(o.rotY ?? 0));
  const put = (k, g, m, uv) => { bin.add(k, g, base.clone().multiply(m ?? new THREE.Matrix4()), uv); g.dispose?.(); };
  const tr = (a, b, c) => new THREE.Matrix4().makeTranslation(a, b, c);

  const a = w / 2;
  const R = a * (1 + p);
  const cOff = a * p;
  const rise = Math.sqrt(Math.max(0, R * R - cOff * cOff));
  const head = spring + rise;
  // half-width of the opening at height y ABOVE the springing line
  const halfAt = (y) => Math.sqrt(Math.max(0, R * R - y * y)) - cOff;
  // the right-hand arc runs from angle 0 (where it meets the jamb) to the apex
  const aTop = Math.acos(Math.min(1, cOff / R));

  const lead = o.leadT ?? 0.042;
  const gz = -t * 0.55;
  const gh = spring - sill;

  // ---- splayed reveals down each jamb ------------------------------------
  for (const s of [-1, 1]) {
    put(K.reveal, new THREE.BoxGeometry(0.02, gh, t), tr(s * a, (sill + spring) / 2, -t / 2), 0.7);
  }

  // ---- arched soffit ------------------------------------------------------
  // ONE continuous strip right jamb -> apex -> left jamb, exactly as the semicircular case
  // sweeps 0..PI in one go. Building it as two mirrored halves would need a negative scale,
  // and a negative determinant flips the winding, so half the soffit would render inside-out.
  // Walking real angles on the two real centres avoids the question entirely.
  {
    const segs = 14;
    const rings = [], uvs = [];
    const pushPt = (px, py, arcLen) => {
      rings.push([new THREE.Vector3(px, py, 0), new THREE.Vector3(px, py, -t)]);
      uvs.push([[arcLen, 0], [arcLen, t]]);
    };
    for (let j = 0; j <= segs; j++) {
      const ang = (j / segs) * aTop;
      pushPt(-cOff + Math.cos(ang) * R, spring + Math.sin(ang) * R, ang * R);
    }
    for (let j = 1; j <= segs; j++) {
      const ang = (Math.PI - aTop) + (j / segs) * aTop;
      pushPt(cOff + Math.cos(ang) * R, spring + Math.sin(ang) * R, (2 * aTop - (Math.PI - ang)) * R);
    }
    put(K.reveal, stripFromRings(rings, false, uvs), null, null);
  }

  // ---- spandrels: the wall hole is rectangular, the window is not ---------
  {
    const steps = o.spandrelSteps ?? 12;
    const dy = rise / steps;
    for (let j = 0; j < steps; j++) {
      const y0 = j * dy;
      const halfW = halfAt(y0);
      const fill = a - halfW;
      if (fill <= 0.004) continue;
      for (const s of [-1, 1]) {
        put(K.reveal, new THREE.BoxGeometry(fill + 0.012, dy + 0.005, t),
          tr(s * (halfW + fill / 2), spring + y0 + dy / 2, -t / 2), 0.7);
      }
    }
  }

  // ---- sill, apron, archivolt, jamb trim ---------------------------------
  put(K.stone, new THREE.BoxGeometry(w + 0.42, 0.11, t + 0.14), tr(0, sill - 0.055, -t / 2 + 0.07), 0.5);
  put(K.stone, new THREE.BoxGeometry(w + 0.20, 0.16, 0.09), tr(0, sill - 0.19, 0.045), 0.4);
  // archivolt: the right arc runs 0..aTop about the LEFT centre, the left arc runs
  // (PI-aTop)..PI about the RIGHT centre. Both meet exactly at the apex, by construction.
  put(K.stone, archSweep(architraveProfile(0.16, 0.06), R, 0, aTop, 14, { cy: spring, cx: -cOff }), tr(0, 0, 0.002));
  put(K.stone, archSweep(architraveProfile(0.16, 0.06), R, Math.PI - aTop, Math.PI, 14, { cy: spring, cx: cOff }), tr(0, 0, 0.002));
  for (const s of [-1, 1]) {
    const j = extrudeProfile(architraveProfile(0.16, 0.06).map(([u, v]) => [v, u]), gh + 0.1);
    put(K.stone, j, new THREE.Matrix4().makeRotationZ(s * Math.PI / 2).premultiply(tr(s * a, sill - 0.05, 0.002)));
  }

  // ---- ONE lancet-shaped glass sheet, uv spanning the whole opening -------
  {
    const nx = 16, ny = 30;
    const total = gh + rise;
    const pos = [], uvA = [], idx = [];
    for (let j = 0; j <= ny; j++) {
      const y = (j / ny) * total;
      const half = y <= gh ? (a - 0.015) : Math.max(halfAt(y - gh) - 0.012, 1e-3);
      for (let i = 0; i <= nx; i++) {
        const fx = i / nx;
        pos.push((fx - 0.5) * 2 * half, sill + y, gz);
        uvA.push(fx, j / ny);
      }
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const q = j * (nx + 1) + i;
      idx.push(q, q + nx + 1, q + 1, q + 1, q + nx + 1, q + nx + 2);
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    gg.setAttribute('uv', new THREE.Float32BufferAttribute(uvA, 2));
    gg.setIndex(idx);
    gg.computeVertexNormals();
    put(K.glass, gg, null, null);
  }

  // ---- BAR TRACERY --------------------------------------------------------
  const lz = gz + 0.03;
  // the two main lights below the springing, divided by one mullion
  put(K.lead, new THREE.BoxGeometry(lead * 1.25, gh, lead), tr(0, sill + gh / 2, lz), 0.3);
  const nTrans = o.transoms ?? 2;
  for (let i = 1; i <= nTrans; i++) {
    put(K.lead, new THREE.BoxGeometry(w - 0.03, lead * 0.9, lead), tr(0, sill + (gh * i) / (nTrans + 1), lz), 0.3);
  }
  // saddle bars: the horizontal wires a real leaded light is tied to, at a finer pitch
  for (let i = 1; i <= nTrans * 2 + 1; i++) {
    const py = sill + (gh * i) / (nTrans * 2 + 2);
    put(K.lead, new THREE.BoxGeometry(w - 0.05, lead * 0.34, lead * 0.34), tr(0, py, lz + 0.006), 0.25);
  }
  // the containing arch, in two arcs. A TorusGeometry arc always starts at angle 0, so the
  // left-hand one is the same arc rotated into place rather than mirrored — same reason as
  // the soffit: a negative scale would turn it inside out.
  const arcAt = (rad, tube, seg, cx, cy, startAng) => {
    const g = new THREE.TorusGeometry(rad, tube, 5, seg, aTop);
    g.applyMatrix4(new THREE.Matrix4().makeRotationZ(startAng));
    return g;
  };
  put(K.lead, arcAt(R - 0.02, lead * 0.55, 20, 0, 0, 0), tr(-cOff, spring, lz), 0.3);
  put(K.lead, arcAt(R - 0.02, lead * 0.55, 20, 0, 0, Math.PI - aTop), tr(cOff, spring, lz), 0.3);

  // ---- two sub-lancets in the head, same two-centred form -----------------
  const sa = a / 2;
  const sR = sa * (1 + p), sOff = sa * p;
  const sRise = Math.sqrt(Math.max(0, sR * sR - sOff * sOff));
  for (const side of [-1, 1]) {
    const cx = side * sa;
    put(K.lead, new THREE.BoxGeometry(lead, sRise * 0.12, lead), tr(cx, spring, lz), 0.3);
    put(K.lead, arcAt(sR - 0.01, lead * 0.45, 14, 0, 0, 0), tr(cx - sOff, spring, lz), 0.3);
    put(K.lead, arcAt(sR - 0.01, lead * 0.45, 14, 0, 0, Math.PI - aTop), tr(cx + sOff, spring, lz), 0.3);
  }
  // ---- the foiled circle in the spandrel above them: the CUSPS ------------
  {
    const gap = rise - sRise;
    const rC = Math.min(a * 0.38, gap * 0.40);
    if (rC > 0.02) {
      const cy = spring + sRise + gap * 0.46;
      put(K.lead, new THREE.TorusGeometry(rC, lead * 0.48, 5, 22), tr(0, cy, lz), 0.3);
      // three foils struck inside the ring — a trefoil. The lobes are what a cusp IS: the
      // point where two foil arcs meet, jutting into the opening.
      const nF = o.foils ?? 3;
      for (let i = 0; i < nF; i++) {
        const ang = Math.PI / 2 + (i / nF) * Math.PI * 2;
        put(K.lead, new THREE.TorusGeometry(rC * 0.42, lead * 0.40, 5, 14),
          tr(Math.cos(ang) * rC * 0.55, cy + Math.sin(ang) * rC * 0.55, lz + 0.004), 0.25);
      }
    }
  }
  return { w, sill, spring, head, rise, glassZ: gz, pointed: p };
}

/**
 * A coffered ceiling. Beams both ways with a moulded edge, a sunk pan in each coffer and
 * an instanced rosette in the middle of it. This is the single cheapest way to make a
 * ceiling stop reading as a flat grey lid.
 */
export function cofferedCeiling(bin, o = {}) {
  const w = o.w ?? 12, d = o.d ?? 12;
  const cx = o.cellsX ?? 5, cz = o.cellsZ ?? 5;
  const y = o.y ?? STOREY;
  const beam = o.beam ?? 0.26, drop = o.drop ?? 0.30;
  const K = { pan: 'ceil', beam: 'mould', boss: 'gilt', ...(o.keys ?? {}) };
  const ox = o.x ?? 0, oz = o.z ?? 0;
  const put = (k, g, m, uv) => { bin.add(k, g, m, uv); g.dispose?.(); };
  const tr = (a, b, c) => new THREE.Matrix4().makeTranslation(a + ox, b, c + oz);

  const px = w / cx, pz = d / cz;
  // flat soffit at the top of the coffers
  put(K.pan, new THREE.BoxGeometry(w, 0.05, d), tr(0, y + 0.02, 0), 1.6);
  // beams
  for (let i = 0; i <= cx; i++) {
    const x = -w / 2 + i * px;
    put(K.beam, new THREE.BoxGeometry(beam, drop, d), tr(x, y - drop / 2, 0), 0.7);
  }
  for (let j = 0; j <= cz; j++) {
    const z = -d / 2 + j * pz;
    put(K.beam, new THREE.BoxGeometry(w, drop, beam), tr(0, y - drop / 2, z), 0.7);
  }
  // coffer pans, moulded rim and boss
  const rimP = panelMouldProfile(0.06, 0.05);
  for (let i = 0; i < cx; i++) {
    for (let j = 0; j < cz; j++) {
      const x = -w / 2 + (i + 0.5) * px, z = -d / 2 + (j + 0.5) * pz;
      const iw = px - beam - 0.06, id = pz - beam - 0.06;
      const rim = mitredFrame(rimP, iw, id);
      const m = new THREE.Matrix4().makeRotationX(Math.PI / 2).premultiply(tr(x, y - 0.02, z));
      put(K.beam, rim, m);
      // ---- ROUND 17: `vary` — THE CEILING IS ALLOWED TO HAVE AGED --------------------------
      //
      // `critic-eye-sweep`, looking straight up from the middle of the ballroom: "the coffer
      // field is a perfect untouched grid — every panel identical … no variation, no tarnish,
      // no dirt, no cobweb, in a house whose floor is covered in dust sheets. Reads as a tiled
      // texture."
      //
      // ⚠ AND THE FIRST INSTINCT — "break up the panel texture" — IS WRONG. A coffered ceiling
      // IS uniform; that is what the order means, and jittering the pans would read as a
      // building error rather than as age. What a shut-up house actually has is BOSSES THAT
      // HAVE COME DOWN. They are the small, heavy, purely decorative part, they are fixed to
      // plaster with nothing but glue and a peg, and they are the first thing to fall. A grid
      // with two or three empty sockets in it stops being a texture immediately, because the
      // eye reads the gaps as history rather than as noise.
      //
      // Opt-in and rng-seeded: without `vary` this emits exactly what it always did.
      const vr = o.vary ? o.vary : null;
      const rnd = vr ? vr.rng ?? (() => 0.5) : null;
      const keep = !vr || rnd() > (vr.missing ?? 0.10);
      if (o.boss !== false && keep) {
        // Size and spin vary a little even where the boss survived — these were cast in a
        // mould and fitted by hand, and an identical rotation on 28 of them is its own tell.
        const sc = vr ? 0.86 + rnd() * 0.30 : 1;
        const spin = vr ? rnd() * Math.PI * 2 : 0;
        const bm = new THREE.Matrix4().makeRotationX(Math.PI)
          .premultiply(new THREE.Matrix4().makeRotationY(spin))
          .premultiply(new THREE.Matrix4().makeScale(sc, 1, sc))
          .premultiply(tr(x, y - 0.03, z));
        put(K.boss, lathe([[0, 0], [0.085, 0.0], [0.10, 0.03], [0.075, 0.055], [0.085, 0.075], [0.03, 0.10], [0, 0.10]], 12),
          bm, 0.25);
      } else if (vr) {
        // The socket the boss came out of: a shallow disc of bare plaster, keyed to the PAN
        // rather than to the gilt so it reads as a scar in the ceiling and not as a fitting.
        put(K.pan, new THREE.CylinderGeometry(0.072, 0.078, 0.018, 14),
          tr(x, y - 0.028, z), 0.25);
      }
    }
  }
  return { px, pz };
}

/** A coved ceiling edge — the quarter-round transition from wall to ceiling. */
export function cove(bin, o = {}) {
  const w = o.w ?? 12, d = o.d ?? 12, y = o.y ?? STOREY, r = o.r ?? 0.9;
  const K = o.key ?? 'ceil';
  const prof = new Prof(0, 0).cavetto(r, r, 10).points;
  const put = (g, m) => { bin.add(K, g, m, 1.1); g.dispose?.(); };
  const seg = (len, rotY, px, pz) => {
    const g = extrudeProfile(prof, len, { x0: -len / 2 });
    const m = new THREE.Matrix4().makeRotationY(rotY).premultiply(new THREE.Matrix4().makeTranslation(px, y - r, pz));
    put(g, m);
  };
  seg(w, 0, 0, -d / 2);
  seg(w, Math.PI, 0, d / 2);
  seg(d, Math.PI / 2, w / 2, 0);
  seg(d, -Math.PI / 2, -w / 2, 0);
}

/** A ceiling rose: concentric mouldings and a ring of acanthus lobes. */
export function ceilingRose(bin, o = {}) {
  const r = o.r ?? 1.1, y = o.y ?? STOREY;
  const K = o.key ?? 'mould';
  const x = o.x ?? 0, z = o.z ?? 0;
  const put = (g, m, uv) => { bin.add(K, g, m, uv); g.dispose?.(); };
  const down = new THREE.Matrix4().makeRotationX(Math.PI);
  const at = (dy) => down.clone().premultiply(new THREE.Matrix4().makeTranslation(x, y - dy, z));

  put(lathe([[0, 0], [r, 0], [r * 0.97, 0.035], [r * 0.86, 0.055], [r * 0.88, 0.085],
    [r * 0.70, 0.115], [r * 0.72, 0.150], [r * 0.40, 0.180], [r * 0.42, 0.205],
    [r * 0.16, 0.225], [r * 0.10, 0.250], [0, 0.250]], 28), at(0), 0.4);
  // lobes
  const n = o.lobes ?? 16;
  const lobe = lathe([[0, 0], [r * 0.10, 0], [r * 0.085, 0.05], [0, 0.07]], 8);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const m = new THREE.Matrix4().makeRotationX(Math.PI)
      .premultiply(new THREE.Matrix4().makeTranslation(x + Math.cos(a) * r * 0.80, y - 0.070, z + Math.sin(a) * r * 0.80));
    put(lobe.clone(), m, 0.2);
  }
  lobe.dispose();
}

/**
 * A grand stair: a straight flight with moulded treads, a closed string, newels, and an
 * INSTANCED balustrade. Returns the instanced meshes so the caller can add them.
 */
export function staircase(bin, o = {}) {
  const steps = o.steps ?? 12;
  const rise = o.rise ?? 0.185, run = o.run ?? 0.31;
  const w = o.w ?? 3.2;
  const K = { tread: 'tread', riser: 'stone', string: 'wood', newel: 'wood', ...(o.keys ?? {}) };
  const x = o.x ?? 0, y = o.y ?? 0, z = o.z ?? 0;
  const put = (k, g, m, uv) => { bin.add(k, g, m, uv); g.dispose?.(); };
  const tr = (a, b, c) => new THREE.Matrix4().makeTranslation(x + a, y + b, z + c);

  for (let i = 0; i < steps; i++) {
    const ty = (i + 1) * rise, tz = -i * run;
    // tread with a bullnose nosing
    put(K.tread, new THREE.BoxGeometry(w, 0.055, run + 0.04), tr(0, ty - 0.027, tz - run / 2 + 0.02), 0.9);
    put(K.tread, new THREE.CylinderGeometry(0.027, 0.027, w, 8, 1, false, 0, Math.PI)
      .rotateZ(Math.PI / 2).rotateY(Math.PI / 2), tr(0, ty - 0.027, tz + 0.02), 0.3);
    put(K.riser, new THREE.BoxGeometry(w - 0.02, rise, 0.04), tr(0, ty - rise / 2 - 0.02, tz - run + 0.02), 0.6);
  }
  // closed strings each side
  const L = Math.hypot(steps * run, steps * rise);
  const ang = Math.atan2(steps * rise, steps * run);
  for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(0.075, 0.36, L + 0.3);
    const m = new THREE.Matrix4().makeRotationX(-ang)
      .premultiply(tr(s * (w / 2 + 0.03), steps * rise / 2 - 0.06, -steps * run / 2));
    put(K.string, g, m, 0.6);
  }
  return { steps, rise, run, w, totalRise: steps * rise, totalRun: steps * run };
}

/**
 * A run of balusters as ONE InstancedMesh, plus a swept handrail added to the bin.
 * pts: [[x,y,z], ...] the path of the rail top (2 points = a straight run).
 */
export function balustrade(bin, o = {}) {
  const a = new THREE.Vector3(...(o.from ?? [0, 0, 0]));
  const b = new THREE.Vector3(...(o.to ?? [4, 0, 0]));
  const railH = o.railH ?? 0.95;
  const pitch = o.pitch ?? 0.19;
  const K = { rail: 'wood', base: 'stone', ...(o.keys ?? {}) };
  const dir = b.clone().sub(a);
  const len = dir.length();
  const n = Math.max(2, Math.floor(len / pitch));
  const step = len / n;
  const yaw = Math.atan2(dir.x, dir.z);
  const pitchAng = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));

  // plinth + handrail follow the path
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const seg = (h, yOff, wdt, key, prof) => {
    const g = prof ? extrudeProfile(prof, len, { x0: -len / 2 }) : new THREE.BoxGeometry(len, h, wdt);
    const m = new THREE.Matrix4().makeRotationZ(pitchAng)
      .premultiply(new THREE.Matrix4().makeRotationY(Math.PI / 2 - yaw))
      .premultiply(new THREE.Matrix4().makeTranslation(mid.x, mid.y + yOff, mid.z));
    bin.add(key, g, m, prof ? null : 0.5); g.dispose?.();
  };
  seg(0.10, 0.05, 0.30, K.base);
  /**
   * ⚠ THE HANDRAIL IS A MOULDED CAP AND IT USED TO BE A FLAT-TOPPED SLAB, WHICH READS AS PIPE.
   *
   * Round 18's `eye.gallery` is the angle that settles this: standing on the musicians' deck,
   * the rail crosses the bottom third of the frame at about a metre from the eye and is the
   * CLOSEST OBJECT IN THE SHOT. The old section was 150 mm wide, 85 mm tall, flat on top with a
   * 20 mm ovolo at each corner — which at that range is one unbroken gold cylinder with a
   * single highlight running its whole length and nothing anywhere to break it. `critic-eye-
   * sweep` filed it as "a plain tube" and it was right.
   *
   * A real cap has three things this did not:
   *   · a CROWNED top rather than a flat one, so the highlight is a moving line and not a band
   *   · a fillet and a bead down each face, so there are two more highlights under the first
   *   · an UNDERCUT — the cap oversails the fascia, so it throws a hard shadow line along its
   *     whole length onto the balusters, which is what actually reads as a rail from below
   *
   * ⚠ AND THE UNDERCUT IS THE ONE THAT DOES THE WORK, because this rail is seen from ABOVE by
   * the player standing at it and from BELOW by the player on the floor, and from below a flat
   * soffit at a grazing angle catches the same light as the face and merges with it. It is also
   * the cheapest: it is a swept section, so all of this is one extra polyline and no extra draw
   * call — the rail merges into the gilt bucket either way.
   *
   * Both callers are this same house (`views/room-gallery.js` and `world/ballroom-order.js`),
   * so this is not defaulted-off behind an option: a flat-topped rail was not right in either.
   */
  seg(0.11, railH, 0.145, K.rail, new Prof(-0.075, -0.030)
    .to(-0.075, 0.010)                       // fascia, and the undercut it oversails
    .ovolo(0.012, 0.012, 3)                  // lower bead
    .to(-0.063, 0.030)
    .cavetto(0.010, 0.014, 3)                // cove up to the fillet
    .to(-0.053, 0.052)                       // fillet
    .ovolo(0.020, 0.020, 4)                  // ovolo into the crown
    .curve(0.066, 0.014, 0.033, 0.030, 6)    // the crown itself, a shallow segmental top
    .ovolo(0.020, -0.020, 4)
    .to(0.063, 0.030)
    .cavetto(0.012, -0.020, 3)
    .to(0.075, 0.010)
    .to(0.075, -0.030).points);

  // balusters as one InstancedMesh
  const bal = lathe([
    [0.045, 0], [0.055, 0.02], [0.050, 0.05], [0.032, 0.09], [0.038, 0.12],
    [0.062, 0.20], [0.070, 0.28], [0.058, 0.40], [0.030, 0.55], [0.036, 0.62],
    [0.052, 0.70], [0.046, 0.78], [0.028, 0.82], [0.040, 0.86], [0.040, 0.90],
  ], o.segs ?? 10);
  bal.scale(1, (railH - 0.05) / 0.90, 1);
  const inst = new THREE.InstancedMesh(bal, o.material ?? null, n);
  inst.castShadow = true; inst.receiveShadow = true;
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const p = a.clone().lerp(b, t);
    m4.makeRotationY((i * 1.13) % (Math.PI * 2));
    m4.setPosition(p.x, p.y + 0.10, p.z);
    inst.setMatrixAt(i, m4);
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.name = 'balusters';
  return { instanced: inst, count: n };
}

/** A plain floor plate with world-scale uvs. */
export function floorSlab(bin, key, w, d, y = 0, x = 0, z = 0, uv = 2.4) {
  const g = new THREE.BoxGeometry(w, 0.10, d);
  bin.add(key, g, new THREE.Matrix4().makeTranslation(x, y - 0.05, z), uv);
  g.dispose();
}

/** Flat ceiling plate. */
export function ceilingSlab(bin, key, w, d, y, x = 0, z = 0, uv = 2.4) {
  const g = new THREE.BoxGeometry(w, 0.10, d);
  bin.add(key, g, new THREE.Matrix4().makeTranslation(x, y + 0.05, z), uv);
  g.dispose();
}

export { stripFromRings };
