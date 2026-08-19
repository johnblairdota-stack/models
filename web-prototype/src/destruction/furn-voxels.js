/**
 * Mesh-fitted occupancy voxels for smash-lab furniture.
 * docs/slices/task-furn-smash-vox-shell.md
 *
 * Solid props: interior fill, no dilation. Cut cubes only on cells that were
 * fully enclosed at voxelize, inset behind the Meshy. Shell props (crate):
 * skin clip + plank chips, no interior cubes. Thin / camera: no voxel body.
 * Airborne payout is AABB islands (docs/slices/task-furn-smash-vox-islands.md).
 */

import * as THREE from 'three';
import { FURN_STAGE } from './furnprop.js';

const CELL = 0.05;
const MAX_AXIS = 48;
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _col = new THREE.Color();
const _up = { x: 0, y: 1, z: 0 };
const MAX_AIR = 8;
const SPLIT_M = 0.72;

function idx(ix, iy, iz, nx, ny) {
  return ix + nx * (iy + ny * iz);
}

function mapSampler(map) {
  const img = map?.image ?? map?.source?.data;
  if (!img) return null;
  if (img.data && img.width && img.height && !img.getContext) {
    const src = img.data;
    const w = img.width;
    const h = img.height;
    const nch = (src.length / (w * h)) | 0 || 4;
    return (u, v) => {
      const uu = ((u % 1) + 1) % 1;
      const vv = ((v % 1) + 1) % 1;
      const x = Math.max(0, Math.min(w - 1, (uu * w) | 0));
      const y = Math.max(0, Math.min(h - 1, ((1 - vv) * h) | 0));
      const o = (y * w + x) * nch;
      return [src[o] / 255, src[o + 1] / 255, src[o + 2] / 255];
    };
  }
  const w0 = img.width || img.videoWidth || 0;
  const h0 = img.height || img.videoHeight || 0;
  if (!w0 || !h0) return null;
  const w = Math.min(w0, 128);
  const h = Math.min(h0, 128);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  try {
    ctx.drawImage(img, 0, 0, w, h);
  } catch {
    return null;
  }
  const data = ctx.getImageData(0, 0, w, h).data;
  return (u, v) => {
    const uu = ((u % 1) + 1) % 1;
    const vv = ((v % 1) + 1) % 1;
    const x = Math.max(0, Math.min(w - 1, (uu * w) | 0));
    const y = Math.max(0, Math.min(h - 1, ((1 - vv) * h) | 0));
    const o = (y * w + x) * 4;
    return [data[o] / 255, data[o + 1] / 255, data[o + 2] / 255];
  };
}

function decodeCell(i, g) {
  const ix = i % g.nx;
  const iy = Math.floor(i / g.nx) % g.ny;
  const iz = Math.floor(i / (g.nx * g.ny));
  return {
    i, ix, iy, iz,
    x: g.origin.x + (ix + 0.5) * g.cell,
    y: g.origin.y + (iy + 0.5) * g.cell,
    z: g.origin.z + (iz + 0.5) * g.cell,
  };
}

function aabbOf(cells, cell) {
  let minx = Infinity, miny = Infinity, minz = Infinity;
  let maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
  for (const c of cells) {
    minx = Math.min(minx, c.x); maxx = Math.max(maxx, c.x);
    miny = Math.min(miny, c.y); maxy = Math.max(maxy, c.y);
    minz = Math.min(minz, c.z); maxz = Math.max(maxz, c.z);
  }
  const dx = Math.max(cell, maxx - minx + cell);
  const dy = Math.max(cell, maxy - miny + cell);
  const dz = Math.max(cell, maxz - minz + cell);
  const axes = [
    { a: dx, k: 'x', mid: (minx + maxx) * 0.5 },
    { a: dy, k: 'y', mid: (miny + maxy) * 0.5 },
    { a: dz, k: 'z', mid: (minz + maxz) * 0.5 },
  ].sort((u, v) => v.a - u.a);
  return {
    w: axes[0].a,
    h: axes[1].a,
    t: Math.max(0.055, axes[2].a),
    x: (minx + maxx) * 0.5,
    y: (miny + maxy) * 0.5,
    z: (minz + maxz) * 0.5,
    long: axes[0].a,
    longK: axes[0].k,
    longMid: axes[0].mid,
  };
}

function splitHuge(cells, cell) {
  if (cells.length < 12) return [cells];
  const box = aabbOf(cells, cell);
  if (box.long <= SPLIT_M) return [cells];
  const a = [], b = [];
  for (const c of cells) {
    const v = box.longK === 'x' ? c.x : box.longK === 'y' ? c.y : c.z;
    (v < box.longMid ? a : b).push(c);
  }
  if (!a.length || !b.length) return [cells];
  return [a, b];
}

function floodCells(cells, nx, ny) {
  if (cells.length < 2) return [cells];
  const byI = new Map();
  for (const c of cells) byI.set(c.i, c);
  const vis = new Set();
  const groups = [];
  for (const start of cells) {
    if (vis.has(start.i)) continue;
    const q = [start];
    vis.add(start.i);
    const g = [];
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi];
      g.push(c);
      const ix = c.i % nx;
      const iy = Math.floor(c.i / nx) % ny;
      const iz = Math.floor(c.i / (nx * ny));
      const tryN = (nx2, ny2, nz2) => {
        const ni = idx(nx2, ny2, nz2, nx, ny);
        const n = byI.get(ni);
        if (!n || vis.has(ni)) return;
        vis.add(ni);
        q.push(n);
      };
      tryN(ix - 1, iy, iz); tryN(ix + 1, iy, iz);
      tryN(ix, iy - 1, iz); tryN(ix, iy + 1, iz);
      tryN(ix, iy, iz - 1); tryN(ix, iy, iz + 1);
    }
    groups.push(g);
  }
  return groups;
}

function capGroups(groups, maxN) {
  const out = groups.slice();
  while (out.length > maxN) {
    out.sort((a, b) => a.cells.length - b.cells.length);
    const small = out.shift();
    out[out.length - 1].cells.push(...small.cells);
  }
  return out;
}

function liftTint(r, g, b) {
  const s = r + g + b;
  if (s > 2.55) return { r: 0.42, g: 0.30, b: 0.20 };
  if (s < 0.12) {
    const k = 0.55 / Math.max(s, 0.02);
    return { r: Math.min(1, r * k), g: Math.min(1, g * k), b: Math.min(1, b * k) };
  }
  return { r, g, b };
}

function lumaOf(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function bodyTintFrom(rgb, skin, inner, fallback) {
  const pool = [];
  for (let i = 0; i < skin.length; i++) {
    if (!skin[i] || inner[i]) continue;
    const r = rgb[i * 3] / 255;
    const gc = rgb[i * 3 + 1] / 255;
    const b = rgb[i * 3 + 2] / 255;
    if (r + gc + b < 0.04) continue;
    const luma = lumaOf(r, gc, b);
    const chroma = Math.max(r, gc, b) - Math.min(r, gc, b);
    if (luma > 0.58 && chroma < 0.28) continue;
    pool.push({ r, g: gc, b, luma, chroma });
  }
  if (!pool.length) return fallback;
  const chromatic = pool.filter((s) => s.chroma >= 0.04);
  const use = chromatic.length ? chromatic : pool;
  let best = use[0];
  for (let i = 1; i < use.length; i++) {
    if (use[i].luma < best.luma) best = use[i];
  }
  return { r: best.r, g: best.g, b: best.b };
}

function copyRgb(rgb, dst, src) {
  rgb[dst * 3] = rgb[src * 3];
  rgb[dst * 3 + 1] = rgb[src * 3 + 1];
  rgb[dst * 3 + 2] = rgb[src * 3 + 2];
}

function fillYSpan(occ, rgb, nx, ny, nz) {
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      let lo = ny, hi = -1;
      for (let iy = 0; iy < ny; iy++) {
        if (!occ[idx(ix, iy, iz, nx, ny)]) continue;
        if (iy < lo) lo = iy;
        if (iy > hi) hi = iy;
      }
      if (hi - lo < 2) continue;
      const src = idx(ix, lo, iz, nx, ny);
      for (let iy = lo + 1; iy < hi; iy++) {
        const i = idx(ix, iy, iz, nx, ny);
        if (occ[i]) continue;
        occ[i] = 1;
        if (!rgb[i * 3] && !rgb[i * 3 + 1] && !rgb[i * 3 + 2]) copyRgb(rgb, i, src);
      }
    }
  }
}

function fillInterior(occ, rgb, nx, ny, nz) {
  const n = occ.length;
  const outside = new Uint8Array(n);
  const q = [];
  const tryEnq = (ix, iy, iz) => {
    if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) return;
    const i = idx(ix, iy, iz, nx, ny);
    if (occ[i] || outside[i]) return;
    outside[i] = 1;
    q.push(i);
  };
  for (let iz = 0; iz < nz; iz++) {
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        if (ix > 0 && iy > 0 && iz > 0 && ix < nx - 1 && iy < ny - 1 && iz < nz - 1) continue;
        tryEnq(ix, iy, iz);
      }
    }
  }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi];
    const ix = i % nx;
    const iy = Math.floor(i / nx) % ny;
    const iz = Math.floor(i / (nx * ny));
    tryEnq(ix - 1, iy, iz); tryEnq(ix + 1, iy, iz);
    tryEnq(ix, iy - 1, iz); tryEnq(ix, iy + 1, iz);
    tryEnq(ix, iy, iz - 1); tryEnq(ix, iy, iz + 1);
  }
  for (let i = 0; i < n; i++) {
    if (occ[i] || outside[i]) continue;
    occ[i] = 1;
    const ix = i % nx;
    const iy = Math.floor(i / nx) % ny;
    const iz = Math.floor(i / (nx * ny));
    const nbs = [
      idx(ix - 1, iy, iz, nx, ny), idx(ix + 1, iy, iz, nx, ny),
      idx(ix, iy - 1, iz, nx, ny), idx(ix, iy + 1, iz, nx, ny),
      idx(ix, iy, iz - 1, nx, ny), idx(ix, iy, iz + 1, nx, ny),
    ];
    for (const j of nbs) {
      if (j < 0 || j >= n) continue;
      if (rgb[j * 3] || rgb[j * 3 + 1] || rgb[j * 3 + 2]) {
        copyRgb(rgb, i, j);
        break;
      }
    }
  }
}

function rebuildOcc(skin, rgb, nx, ny, nz, { fill = true } = {}) {
  const occ = new Uint8Array(skin);
  if (fill) {
    fillYSpan(occ, rgb, nx, ny, nz);
    fillInterior(occ, rgb, nx, ny, nz);
  }
  let count = 0;
  for (let i = 0; i < occ.length; i++) if (occ[i]) count++;
  return { occ, count };
}

function markInner(occ, nx, ny, nz) {
  const inner = new Uint8Array(occ.length);
  const nbr = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]];
  for (let iz = 0; iz < nz; iz++) {
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const i = idx(ix, iy, iz, nx, ny);
        if (!occ[i]) continue;
        let all = true;
        for (const [dx, dy, dz] of nbr) {
          const jx = ix + dx, jy = iy + dy, jz = iz + dz;
          if (jx < 0 || jy < 0 || jz < 0 || jx >= nx || jy >= ny || jz >= nz) {
            all = false;
            break;
          }
          if (!occ[idx(jx, jy, jz, nx, ny)]) { all = false; break; }
        }
        if (all) inner[i] = 1;
      }
    }
  }
  return inner;
}

function voxelize(root, mode) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  let cell = CELL;
  const nx = Math.max(1, Math.min(MAX_AXIS, Math.ceil(size.x / cell)));
  const ny = Math.max(1, Math.min(MAX_AXIS, Math.ceil(size.y / cell)));
  const nz = Math.max(1, Math.min(MAX_AXIS, Math.ceil(size.z / cell)));
  cell = Math.max(size.x / nx, size.y / ny, size.z / nz, 0.04);
  box.expandByScalar(cell * 0.35);
  box.getSize(size);
  const nx2 = Math.max(1, Math.min(MAX_AXIS, Math.ceil(size.x / cell)));
  const ny2 = Math.max(1, Math.min(MAX_AXIS, Math.ceil(size.y / cell)));
  const nz2 = Math.max(1, Math.min(MAX_AXIS, Math.ceil(size.z / cell)));
  cell = Math.max(size.x / nx2, size.y / ny2, size.z / nz2, 0.04);
  const origin = box.min.clone();
  const skin = new Uint8Array(nx2 * ny2 * nz2);
  const rgb = new Uint8Array(nx2 * ny2 * nz2 * 3);
  const samplers = new Map();
  const span = Math.max(size.x, size.y, size.z);

  const paint = (i, cr, cg, cb) => {
    const o = i * 3;
    const nr = (cr * 255) | 0, ng = (cg * 255) | 0, nb = (cb * 255) | 0;
    const or = rgb[o], og = rgb[o + 1], ob = rgb[o + 2];
    if (!or && !og && !ob) {
      rgb[o] = nr; rgb[o + 1] = ng; rgb[o + 2] = nb;
      return;
    }
    const oc = Math.max(or, og, ob) - Math.min(or, og, ob);
    const nc = Math.max(nr, ng, nb) - Math.min(nr, ng, nb);
    if (nc > oc + 2) {
      rgb[o] = nr; rgb[o + 1] = ng; rgb[o + 2] = nb;
      return;
    }
    if (nc + 2 < oc) return;
    if (nr + ng + nb < or + og + ob) {
      rgb[o] = nr; rgb[o + 1] = ng; rgb[o + 2] = nb;
    }
  };

  const mark = (ix, iy, iz, cr, cg, cb) => {
    if (ix < 0 || iy < 0 || iz < 0 || ix >= nx2 || iy >= ny2 || iz >= nz2) return;
    const i = idx(ix, iy, iz, nx2, ny2);
    skin[i] = 1;
    paint(i, cr, cg, cb);
  };

  const markP = (p, cr, cg, cb) => {
    mark(
      Math.floor((p.x - origin.x) / cell),
      Math.floor((p.y - origin.y) / cell),
      Math.floor((p.z - origin.z) / cell),
      cr, cg, cb,
    );
  };

  root.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const geo = o.geometry;
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const index = geo.index;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const mat = mats[0];
    const base = mat?.color ?? _col.setRGB(0.55, 0.4, 0.28);
    let samp = null;
    if (mat?.map) {
      samp = samplers.get(mat.map);
      if (samp === undefined) {
        samp = mapSampler(mat.map);
        samplers.set(mat.map, samp);
      }
    }
    // Black GLTF color factors zero the map. Treat near-black as white when a map exists.
    let br = base.r, bg = base.g, bb = base.b;
    if (samp && (br + bg + bb) < 0.08) { br = 1; bg = 1; bb = 1; }
    const triCount = index ? index.count : pos.count;
    for (let t = 0; t + 2 < triCount; t += 3) {
      const ia = index ? index.getX(t) : t;
      const ib = index ? index.getX(t + 1) : t + 1;
      const ic = index ? index.getX(t + 2) : t + 2;
      _a.fromBufferAttribute(pos, ia).applyMatrix4(o.matrixWorld);
      _b.fromBufferAttribute(pos, ib).applyMatrix4(o.matrixWorld);
      _c.fromBufferAttribute(pos, ic).applyMatrix4(o.matrixWorld);
      let ua = 0, va = 0, ub = 0, vb = 0, uc = 0, vc = 0;
      if (uv && samp) {
        ua = uv.getX(ia); va = uv.getY(ia);
        ub = uv.getX(ib); vb = uv.getY(ib);
        uc = uv.getX(ic); vc = uv.getY(ic);
      }
      const maxe = Math.max(_a.distanceTo(_b), _b.distanceTo(_c), _c.distanceTo(_a), 1e-6);
      const sampleTri = (s, tt) => {
        const u = 1 - s - tt;
        _v.set(
          _a.x * u + _b.x * s + _c.x * tt,
          _a.y * u + _b.y * s + _c.y * tt,
          _a.z * u + _b.z * s + _c.z * tt,
        );
        let cr = br, cg = bg, cb = bb;
        if (samp && uv) {
          const tex = samp(ua * u + ub * s + uc * tt, va * u + vb * s + vc * tt);
          cr = br * tex[0];
          cg = bg * tex[1];
          cb = bb * tex[2];
        }
        markP(_v, cr, cg, cb);
      };
      if (maxe < cell * 0.85) {
        sampleTri(0, 0);
        sampleTri(1, 0);
        sampleTri(0, 1);
        continue;
      }
      const steps = Math.max(2, Math.min(8, Math.ceil(maxe / (cell * 0.45))));
      for (let i = 0; i <= steps; i++) {
        for (let j = 0; j <= steps - i; j++) sampleTri(i / steps, j / steps);
      }
    }
  });

  let skinCount = 0;
  let tr = 0, tg = 0, tb = 0, tn = 0;
  for (let i = 0; i < skin.length; i++) {
    if (!skin[i]) continue;
    skinCount++;
    const r = rgb[i * 3], gch = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    if (r + gch + b < 8) continue;
    tr += r; tg += gch; tb += b; tn++;
  }
  if (skinCount < 8) {
    skin.fill(1);
    skinCount = skin.length;
    for (let i = 0; i < skinCount; i++) {
      rgb[i * 3] = 140;
      rgb[i * 3 + 1] = 100;
      rgb[i * 3 + 2] = 70;
    }
    tr = 140; tg = 100; tb = 70; tn = 1;
  }
  const rawAvg = tn > 0
    ? { r: tr / (tn * 255), g: tg / (tn * 255), b: tb / (tn * 255) }
    : { r: 0.45, g: 0.32, b: 0.22 };
  const avgTint = tn > 0 ? liftTint(rawAvg.r, rawAvg.g, rawAvg.b) : rawAvg;
  const fill = mode !== 'shell';
  const built = rebuildOcc(skin, rgb, nx2, ny2, nz2, { fill });
  const inner = fill ? markInner(built.occ, nx2, ny2, nz2) : new Uint8Array(built.occ.length);
  const bodyTint = bodyTintFrom(rgb, skin, inner, rawAvg);
  return {
    skin, occ: built.occ, inner, rgb, avgTint, bodyTint,
    nx: nx2, ny: ny2, nz: nz2, origin, cell,
    count: skinCount, initial: skinCount, span,
  };
}

function patchVoxClip(material, uniforms) {
  const mat = material.clone();
  mat.customProgramCacheKey = () => 'furn-vox-clip-r4';
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = function (shader, renderer) {
    if (prev) prev.call(this, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    const vNeedle = '#include <project_vertex>';
    if (!shader.vertexShader.includes(vNeedle)) {
      throw new Error('furn-vox: vertex patch missed project_vertex');
    }
    if (!shader.vertexShader.includes('varying vec3 vVoxWorld;')) {
      shader.vertexShader = 'varying vec3 vVoxWorld;\n' + shader.vertexShader;
    }
    shader.vertexShader = shader.vertexShader.replace(
      vNeedle,
      vNeedle + '\n  vVoxWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    );
    const fNeedle = 'void main() {';
    if (!shader.fragmentShader.includes(fNeedle)) {
      throw new Error('furn-vox: fragment patch missed void main');
    }
    const pars = [
      'uniform sampler3D uVoxOcc;',
      'uniform vec3 uVoxOrigin;',
      'uniform vec3 uVoxInvCell;',
      'uniform vec3 uVoxSize;',
      'varying vec3 vVoxWorld;',
    ].join('\n');
    const body = [
      'vec3 vp = (vVoxWorld - uVoxOrigin) * uVoxInvCell;',
      'if (vp.x >= -0.02 && vp.y >= -0.02 && vp.z >= -0.02',
      ' && vp.x < uVoxSize.x + 0.02 && vp.y < uVoxSize.y + 0.02 && vp.z < uVoxSize.z + 0.02) {',
      '  vec3 clamped = clamp(vp, vec3(0.0), uVoxSize - vec3(0.001));',
      '  vec3 uvw = (floor(clamped) + vec3(0.5)) / uVoxSize;',
      '  if (texture(uVoxOcc, uvw).r < 0.5) discard;',
      '}',
    ].join('\n');
    shader.fragmentShader = shader.fragmentShader.replace(
      fNeedle,
      pars + '\nvoid main() {\n' + body,
    );
  };
  mat.needsUpdate = true;
  return mat;
}

export class FurnVoxelBody {
  /**
   * @param {object} o
   * @param {import('./furnprop.js').FurnProp} o.prop
   * @param {THREE.Object3D} o.root
   * @param {object} o.debris
   * @param {object} o.dust
   * @param {number} [o.floorY=0]
   * @param {boolean} [o.hang=false]
   * @param {'solid'|'shell'} [o.mode='solid']
   */
  constructor(o) {
    this.prop = o.prop;
    this.root = o.root;
    this.debris = o.debris;
    this.dust = o.dust;
    this.kind = o.prop.kind;
    this.floorY = o.floorY ?? 0;
    this.hang = !!o.hang;
    this.mode = o.mode === 'shell' ? 'shell' : 'solid';
    this.grid = voxelize(o.root, this.mode);
    let innerN = 0;
    for (let i = 0; i < this.grid.inner.length; i++) if (this.grid.inner[i]) innerN++;
    if (this.mode === 'solid' && innerN < 8) this.mode = 'shell';
    this.carveR = Math.min(0.58, Math.max(0.28, 0.32 * this.grid.span));
    this.solid = new Uint8Array(this.grid.occ);
    {
      const g = this.grid;
      let x0 = g.nx, y0 = g.ny, z0 = g.nz, x1 = -1, y1 = -1, z1 = -1;
      for (let iz = 0; iz < g.nz; iz++) {
        for (let iy = 0; iy < g.ny; iy++) {
          for (let ix = 0; ix < g.nx; ix++) {
            if (!this.solid[idx(ix, iy, iz, g.nx, g.ny)]) continue;
            if (ix < x0) x0 = ix; if (ix > x1) x1 = ix;
            if (iy < y0) y0 = iy; if (iy > y1) y1 = iy;
            if (iz < z0) z0 = iz; if (iz > z1) z1 = iz;
          }
        }
      }
      this.solidBox = x1 >= 0 ? { x0, y0, z0, x1, y1, z1 } : null;
    }
    this.hitBox = new THREE.Box3().setFromObject(o.root);
    this.hitBox.expandByScalar(0.12);
    this.prop.hitBox = this.hitBox;
    this._dummy = new THREE.Object3D();

    const g = this.grid;
    this.carved = new Uint8Array(g.occ.length);
    const data = new Uint8Array(g.occ.length);
    data.fill(255);
    this.tex = new THREE.Data3DTexture(data, g.nx, g.ny, g.nz);
    this.tex.format = THREE.RedFormat;
    this.tex.type = THREE.UnsignedByteType;
    this.tex.minFilter = THREE.NearestFilter;
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.wrapS = THREE.ClampToEdgeWrapping;
    this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.wrapR = THREE.ClampToEdgeWrapping;
    this.tex.unpackAlignment = 1;
    if ('colorSpace' in this.tex) this.tex.colorSpace = THREE.NoColorSpace;
    this.tex.needsUpdate = true;
    this.clip = this.tex.image.data;

    this.uniforms = {
      uVoxOcc: { value: this.tex },
      uVoxOrigin: { value: g.origin },
      uVoxInvCell: { value: new THREE.Vector3(1 / g.cell, 1 / g.cell, 1 / g.cell) },
      uVoxSize: { value: new THREE.Vector3(g.nx, g.ny, g.nz) },
    };

    this.root.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.material) return;
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => patchVoxClip(m, this.uniforms));
      } else {
        mesh.material = patchVoxClip(mesh.material, this.uniforms);
      }
    });

    this.cut = null;
    if (this.mode === 'solid') {
      const cutS = g.cell * 1.0;
      const cutGeo = new THREE.BoxGeometry(cutS, cutS, cutS);
      const nVert = cutGeo.attributes.position.count;
      const white = new Float32Array(nVert * 3);
      white.fill(1);
      cutGeo.setAttribute('color', new THREE.BufferAttribute(white, 3));
      const cutMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, vertexColors: true,
      });
      this.cut = new THREE.InstancedMesh(cutGeo, cutMat, g.occ.length);
      this.cut.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.cut.castShadow = true;
      this.cut.receiveShadow = true;
      this.cut.count = 0;
      this.cut.visible = false;
      this.root.parent?.add(this.cut);
    }
  }

  _pickSkinColor(_cells) {
    const g = this.grid;
    return g.bodyTint ?? g.avgTint ?? { r: 0.45, g: 0.32, b: 0.22 };
  }

  _cellColor(i) {
    const g = this.grid;
    let tint = g.bodyTint ?? g.avgTint ?? { r: 0.45, g: 0.32, b: 0.22 };
    if (g.rgb) {
      const r = g.rgb[i * 3] / 255;
      const gc = g.rgb[i * 3 + 1] / 255;
      const b = g.rgb[i * 3 + 2] / 255;
      if (r + gc + b > 0.04) tint = { r, g: gc, b };
    }
    const luma = lumaOf(tint.r, tint.g, tint.b);
    const chroma = Math.max(tint.r, tint.g, tint.b) - Math.min(tint.r, tint.g, tint.b);
    if (chroma < 0.20 && luma >= 0.08) {
      return { r: 76 / 255, g: 60 / 255, b: 44 / 255 };
    }
    if (luma >= 0.16) return tint;
    const k = 0.18 / Math.max(luma, 0.01);
    return {
      r: Math.min(1, tint.r * k),
      g: Math.min(1, tint.g * k),
      b: Math.min(1, tint.b * k),
    };
  }

  _rebuildOcc() {
    const g = this.grid;
    let skinN = 0;
    for (let i = 0; i < g.skin.length; i++) if (g.skin[i]) skinN++;
    g.count = skinN;
  }

  _rebuildCut() {
    const g = this.grid;
    if (!this.cut || this.mode !== 'solid') return;
    const d = this._dummy;
    let n = 0;
    for (let iz = 0; iz < g.nz; iz++) {
      for (let iy = 0; iy < g.ny; iy++) {
        for (let ix = 0; ix < g.nx; ix++) {
          const i = idx(ix, iy, iz, g.nx, g.ny);
          if (!this.carved[i]) continue;
          if (n >= g.occ.length) continue;
          d.position.set(
            g.origin.x + (ix + 0.5) * g.cell,
            g.origin.y + (iy + 0.5) * g.cell,
            g.origin.z + (iz + 0.5) * g.cell,
          );
          d.rotation.set(0, 0, 0);
          d.scale.set(0.90, 0.90, 0.90);
          d.updateMatrix();
          this.cut.setMatrixAt(n, d.matrix);
          const c = this._cellColor(i);
          this.cut.setColorAt(n, _col.setRGB(c.r, c.g, c.b));
          n++;
        }
      }
    }
    this.cut.count = n;
    this.cut.instanceMatrix.needsUpdate = true;
    if (this.cut.instanceColor) this.cut.instanceColor.needsUpdate = true;
    this.cut.visible = n > 0;
  }

  _payGroup(cells, nrm, freeFall) {
    if (!cells.length) return;
    const plate = aabbOf(cells, this.grid.cell);
    const plank = this.mode === 'shell';
    let w = Math.min(0.95, Math.max(0.18, plate.w));
    let h = Math.min(0.70, Math.max(0.14, plate.h));
    let t = Math.min(0.22, Math.max(0.06, plate.t));
    if (plank) {
      w = Math.max(0.32, w);
      h = Math.max(0.07, h);
      t = Math.max(0.10, Math.min(0.16, t));
    }
    let wPass = w, hPass = h, tPass = t;
    if (!plank) {
      wPass = w * (0.22 / 0.16);
      hPass = h * (0.19 / 0.12);
      tPass = t * (0.058 / 0.10);
    }
    const floor = this.floorY ?? 0;
    const py = Math.max(floor + h * 0.55 + 0.05, plate.y);
    const col = this._pickSkinColor(cells);
    this.debris?.chunk?.(plank ? 'timber' : 'furnchip', new THREE.Vector3(plate.x, py, plate.z), {
      w: wPass, h: hPass, t: tPass,
      normal: freeFall ? _up : nrm,
      spread: freeFall ? 0.9 : 0.7,
      hold: freeFall ? 0.08 : 0.05,
      spinScale: 1.85,
      sag: 0,
      color: plank ? undefined : col,
    });
  }

  _payAir(groups) {
    for (const g of capGroups(groups, MAX_AIR)) {
      this._payGroup(g.cells, g.nrm, g.freeFall);
    }
  }

  _dropUnsupported() {
    const g = this.grid;
    const vis = new Uint8Array(g.skin.length);
    const q = [];
    const tryEnq = (ix, iy, iz) => {
      if (ix < 0 || iy < 0 || iz < 0 || ix >= g.nx || iy >= g.ny || iz >= g.nz) return;
      const i = idx(ix, iy, iz, g.nx, g.ny);
      if (!g.skin[i] || vis[i]) return;
      vis[i] = 1;
      q.push(i);
    };
    const isAnchor = (ix, iy) => {
      if (this.hang) return iy >= g.ny - 2;
      if (iy === 0) return true;
      const bottom = g.origin.y + iy * g.cell;
      return bottom <= this.floorY + g.cell * 1.25;
    };
    for (let iz = 0; iz < g.nz; iz++) {
      for (let iy = 0; iy < g.ny; iy++) {
        for (let ix = 0; ix < g.nx; ix++) {
          const i = idx(ix, iy, iz, g.nx, g.ny);
          if (!g.skin[i]) continue;
          if (isAnchor(ix, iy)) tryEnq(ix, iy, iz);
        }
      }
    }
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi];
      const ix = i % g.nx;
      const iy = Math.floor(i / g.nx) % g.ny;
      const iz = Math.floor(i / (g.nx * g.ny));
      tryEnq(ix - 1, iy, iz); tryEnq(ix + 1, iy, iz);
      tryEnq(ix, iy - 1, iz); tryEnq(ix, iy + 1, iz);
      tryEnq(ix, iy, iz - 1); tryEnq(ix, iy, iz + 1);
    }

    const islands = [];
    for (let iz = 0; iz < g.nz; iz++) {
      for (let iy = 0; iy < g.ny; iy++) {
        for (let ix = 0; ix < g.nx; ix++) {
          const i = idx(ix, iy, iz, g.nx, g.ny);
          if (!g.skin[i] || vis[i]) continue;
          const q = [i];
          vis[i] = 1;
          const cells = [];
          for (let qi = 0; qi < q.length; qi++) {
            const j = q[qi];
            const c = decodeCell(j, g);
            g.skin[j] = 0;
            g.occ[j] = 0;
            this.clip[j] = 0;
            this.carved[j] = 1;
            cells.push(c);
            const tryN = (nx, ny, nz) => {
              if (nx < 0 || ny < 0 || nz < 0 || nx >= g.nx || ny >= g.ny || nz >= g.nz) return;
              const ni = idx(nx, ny, nz, g.nx, g.ny);
              if (!g.skin[ni] || vis[ni]) return;
              vis[ni] = 1;
              q.push(ni);
            };
            tryN(c.ix - 1, c.iy, c.iz); tryN(c.ix + 1, c.iy, c.iz);
            tryN(c.ix, c.iy - 1, c.iz); tryN(c.ix, c.iy + 1, c.iz);
            tryN(c.ix, c.iy, c.iz - 1); tryN(c.ix, c.iy, c.iz + 1);
          }
          islands.push(cells);
        }
      }
    }
    return islands;
  }

  _takeAllSkin() {
    const g = this.grid;
    const vis = new Uint8Array(g.skin.length);
    const comps = [];
    for (let iz = 0; iz < g.nz; iz++) {
      for (let iy = 0; iy < g.ny; iy++) {
        for (let ix = 0; ix < g.nx; ix++) {
          const i = idx(ix, iy, iz, g.nx, g.ny);
          if (!g.skin[i] || vis[i]) continue;
          const q = [i];
          vis[i] = 1;
          const cells = [];
          for (let qi = 0; qi < q.length; qi++) {
            const j = q[qi];
            const c = decodeCell(j, g);
            g.skin[j] = 0;
            g.occ[j] = 0;
            this.clip[j] = 0;
            this.carved[j] = 1;
            cells.push(c);
            const tryN = (nx, ny, nz) => {
              if (nx < 0 || ny < 0 || nz < 0 || nx >= g.nx || ny >= g.ny || nz >= g.nz) return;
              const ni = idx(nx, ny, nz, g.nx, g.ny);
              if (!g.skin[ni] || vis[ni]) return;
              vis[ni] = 1;
              q.push(ni);
            };
            tryN(c.ix - 1, c.iy, c.iz); tryN(c.ix + 1, c.iy, c.iz);
            tryN(c.ix, c.iy - 1, c.iz); tryN(c.ix, c.iy + 1, c.iz);
            tryN(c.ix, c.iy, c.iz - 1); tryN(c.ix, c.iy, c.iz + 1);
          }
          comps.push(cells);
        }
      }
    }
    return comps;
  }

  _rebuildBox() {
    const g = this.grid;
    const box = this.prop.box;
    if (!box) return;
    let minx = Infinity, miny = Infinity, minz = Infinity;
    let maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
    let n = 0;
    for (let iz = 0; iz < g.nz; iz++) {
      for (let iy = 0; iy < g.ny; iy++) {
        for (let ix = 0; ix < g.nx; ix++) {
          if (!g.occ[idx(ix, iy, iz, g.nx, g.ny)]) continue;
          const x = g.origin.x + (ix + 0.5) * g.cell;
          const y = g.origin.y + (iy + 0.5) * g.cell;
          const z = g.origin.z + (iz + 0.5) * g.cell;
          minx = Math.min(minx, x); maxx = Math.max(maxx, x);
          miny = Math.min(miny, y); maxy = Math.max(maxy, y);
          minz = Math.min(minz, z); maxz = Math.max(maxz, z);
          n++;
        }
      }
    }
    if (n > 0) {
      const h = g.cell * 0.5;
      box.min.set(minx - h, miny - h, minz - h);
      box.max.set(maxx + h, maxy + h, maxz + h);
    }
  }

  applyHit(point, power) {
    const from = this.prop.stage;
    const empty = {
      changed: false, from, to: from, removed: 0, islands: 0,
      brokeThrough: false, depthAt: this.prop.isShattered ? 1 : 0,
      stage: from, barrier: false, blocked: false,
    };
    if (!Number.isFinite(power) || power <= 0) return empty;
    if (this.prop.isShattered) return { ...empty, depthAt: 1, blocked: true };

    const g = this.grid;
    const hit = point ?? g.origin.clone().addScalar(g.cell);
    const rCarve = this.carveR;
    const r2 = rCarve * rCarve;
    const nrm = new THREE.Vector3(
      hit.x - (g.origin.x + g.nx * g.cell * 0.5),
      0.25,
      hit.z - (g.origin.z + g.nz * g.cell * 0.5),
    );
    if (nrm.lengthSq() < 1e-6) nrm.set(0, 0.2, 1);
    nrm.normalize();
    const removed = [];
    for (let iz = 0; iz < g.nz; iz++) {
      for (let iy = 0; iy < g.ny; iy++) {
        for (let ix = 0; ix < g.nx; ix++) {
          const i = idx(ix, iy, iz, g.nx, g.ny);
          const x = g.origin.x + (ix + 0.5) * g.cell;
          const y = g.origin.y + (iy + 0.5) * g.cell;
          const z = g.origin.z + (iz + 0.5) * g.cell;
          const dx = x - hit.x, dy = y - hit.y, dz = z - hit.z;
          if (dx * dx + dy * dy + dz * dz > r2) continue;
          if (!g.skin[i] && !g.occ[i]) continue;
          this.clip[i] = 0;
          this.carved[i] = 1;
          g.occ[i] = 0;
          if (g.skin[i]) {
            g.skin[i] = 0;
            removed.push({ i, x, y, z });
          }
        }
      }
    }
    if (!removed.length) {
      let best = null, bestD = Infinity, bestI = -1;
      for (let iz = 0; iz < g.nz; iz++) {
        for (let iy = 0; iy < g.ny; iy++) {
          for (let ix = 0; ix < g.nx; ix++) {
            const i = idx(ix, iy, iz, g.nx, g.ny);
            if (!g.skin[i]) continue;
            const x = g.origin.x + (ix + 0.5) * g.cell;
            const y = g.origin.y + (iy + 0.5) * g.cell;
            const z = g.origin.z + (iz + 0.5) * g.cell;
            const d = (x - hit.x) ** 2 + (y - hit.y) ** 2 + (z - hit.z) ** 2;
            if (d < bestD) { bestD = d; best = { x, y, z }; bestI = i; }
          }
        }
      }
      if (best && bestD < 1.6 * 1.6) {
        const r2b = Math.min(0.62, rCarve) ** 2;
        for (let iz = 0; iz < g.nz; iz++) {
          for (let iy = 0; iy < g.ny; iy++) {
            for (let ix = 0; ix < g.nx; ix++) {
              const i = idx(ix, iy, iz, g.nx, g.ny);
              const x = g.origin.x + (ix + 0.5) * g.cell;
              const y = g.origin.y + (iy + 0.5) * g.cell;
              const z = g.origin.z + (iz + 0.5) * g.cell;
              const dx = x - best.x, dy = y - best.y, dz = z - best.z;
              if (dx * dx + dy * dy + dz * dz > r2b) continue;
              if (!g.skin[i] && !g.occ[i]) continue;
              this.clip[i] = 0;
              this.carved[i] = 1;
              g.occ[i] = 0;
              if (!g.skin[i]) continue;
              g.skin[i] = 0;
              removed.push({ i, x, y, z });
            }
          }
        }
        if (!removed.length && bestI >= 0) {
          g.skin[bestI] = 0;
          g.occ[bestI] = 0;
          this.clip[bestI] = 0;
          this.carved[bestI] = 1;
          removed.push({ i: bestI, ...best });
        }
      }
    }

    const air = [];
    if (removed.length) {
      for (const slice of floodCells(removed, g.nx, g.ny)) {
        for (const part of splitHuge(slice, g.cell)) {
          air.push({ cells: part, nrm, freeFall: false });
        }
      }
    }
    const islands = this._dropUnsupported();
    for (const comp of islands) {
      for (const part of splitHuge(comp, g.cell)) {
        air.push({ cells: part, nrm, freeFall: true });
      }
    }
    this._payAir(air);
    this._rebuildOcc();

    if (removed.length || islands.length) {
      this.dust?.burst?.(hit, Math.min(22, 8 + Math.floor((removed.length + islands.length) * 0.1)), {
        speed: 2.0, life: 0.8, size: 0.2, rise: 0.65, bright: 0.55, brightVar: 0.18,
      });
    }

    this._rebuildCut();
    this.tex.needsUpdate = true;
    this._rebuildBox();
    const frac = g.initial > 0 ? g.count / g.initial : 0;
    const shattered = g.count < 6 || frac < 0.08;
    if (shattered) {
      if (g.count > 0) {
        const rest = this._takeAllSkin();
        const restAir = [];
        for (const comp of rest) {
          for (const part of splitHuge(comp, g.cell)) {
            restAir.push({ cells: part, nrm, freeFall: true });
          }
        }
        this._payAir(restAir);
        g.count = 0;
        this._rebuildOcc();
        this.tex.needsUpdate = true;
      }
      this.prop.stage = FURN_STAGE.SHATTERED;
      this.prop.stageHealth = 0;
      this.root.visible = false;
      if (this.cut) this.cut.visible = false;
      this.prop.onBreak?.(this.prop, { point: hit.clone?.() ?? hit, normal: nrm, dir: nrm, voxel: true });
    } else {
      this.prop.stage = frac < 0.45 ? FURN_STAGE.BATTERED : FURN_STAGE.SCUFFED;
      this.prop.stageHealth = 1;
    }

    const islandN = islands.reduce((s, c) => s + c.length, 0);
    return {
      changed: removed.length > 0 || islands.length > 0,
      from,
      to: this.prop.stage,
      removed: removed.length + islandN,
      islands: islands.length,
      brokeThrough: shattered,
      depthAt: shattered ? 1 : 1 - frac,
      stage: this.prop.stage,
      barrier: false,
      blocked: false,
    };
  }
}
