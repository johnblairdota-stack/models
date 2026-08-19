/**
 * 🔎 **WHAT IS IN FRONT OF A PRISTINE DIG FACE, PER ROOM?** — every hit along the ray through the
 * face centre, in depth order. A fork of `_ap1-who.mjs` (same ray, same rules) aimed at the free
 * faces instead of the exit sites.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_pris1-who.mjs \
 *        --port 5459 --q "seed=s4&coat=1"
 *
 * WHY: `_pris1-look.mjs` measured the gallery's pristine dig face moving **0.011%** between the two
 * coat arms while both studies moved **73-76%**, and *"the coat did not reach it"* and *"something
 * is standing in front of it"* are different findings. **"IT EXISTS, SOMETHING IS IN FRONT OF IT"
 * is this project's dominant defect class** (six times in two days), so this asks rather than
 * argues. It found `portraits` and `exterior.dress.mortar.segment#31` standing in front of the
 * GALLERY face, and `exterior.dress.mortar.segment#38` in front of the BALLROOM one — a wider blast
 * radius for HANDOFF's unowned `exterior.dress.mortar` defect than the two apertures it records.
 * Both studies and the service passage are clean: the pristine face is the first thing drawn.
 *
 * Two differences from `harness/_tmp_geoprobe.mjs --pick`, and both are load-bearing here:
 *   1. **Instances are expanded.** An `InstancedMesh`'s `matrixWorld` is its parent's, so every
 *      copy it draws is invisible to a probe that only reads that — and `wallinstances.js` draws
 *      every pristine wall face in the house out of them. `--pick` cannot see one at all.
 *   2. **Facing is respected.** A raycast does not cull, so it happily reports a mesh the GPU threw
 *      away. Each hit is tagged FRONT/BACK and marked `dropped` when the material's own `side`
 *      would have discarded it.
 * A single nearest-hit answer cannot distinguish "nothing draws here" from "something opaque draws
 * here", so this prints the whole list.
 */
export default async function ap1who({ page, note, skip, shot }) {
  const settle = async (f = 30) => { for (let i = 0; i < f; i++) await page.waitForTimeout(40); };

  const park = (id, dy) => page.evaluate(([pid, yawOff]) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(pid);
    const home = e.room.spaces.find((s) => s.id === p.ownerSpace?.id);
    const inSign = home ? p.sideOf({ x: home.cx, y: 0, z: home.cz }) : 1;
    const n = p.normal;
    const c = p.pointAt(0.5, 0.5);
    e.player.pos.set(c.x + n.x * 4.0 * inSign, e.room.floorY, c.z + n.z * 4.0 * inSign);
    e.player.vel.set(0, 0, 0);
    e.player.facing = Math.atan2(-n.x * inSign, -n.z * inSign) + yawOff;
    if (e.cam) { e.cam.yaw = e.player.facing; e.cam.pitch = 0; e.cam._first = true; }
    return { space: e.room.spaceAt(e.player.pos)?.id ?? null, home: home?.id ?? null };
  }, [id, dy]);

  const rayAt = (id, u, v) => page.evaluate(([pid, uu, vv]) => {
    const e = window.__rrr.engine;
    const cam = e.camera;
    const p = e.room.panelOf(pid);
    const V3 = cam.position.constructor;
    const M4 = cam.matrixWorld.constructor;

    const items = [];
    e.scene.traverse((o) => {
      if (!o.isMesh) return;
      let vis = true;
      for (let q = o; q; q = q.parent) if (q.visible === false) vis = false;
      if (!vis) return;
      const g = o.geometry;
      if (!g?.attributes?.position) return;
      if (!g.boundingSphere) g.computeBoundingSphere();
      const side = o.material?.side ?? 0;          // 0 front, 1 back, 2 double
      const nm = o.material?.name || '';
      if (o.isInstancedMesh) {
        const a = o.instanceMatrix.array;
        for (let i = 0; i < o.count; i++) {
          if (Math.hypot(a[i * 16], a[i * 16 + 1], a[i * 16 + 2]) < 1e-6) continue;
          const m = new M4().fromArray(a, i * 16).premultiply(o.matrixWorld);
          items.push({ g, label: `${o.name || '(unnamed)'}#${i}`, mat: nm, side, inv: m.clone().invert() });
        }
        return;
      }
      items.push({ g, label: o.name || '(unnamed)', mat: nm, side, inv: o.matrixWorld.clone().invert() });
    });

    // Möller–Trumbore, keeping the winding so the hit can be tagged front- or back-facing.
    const hits = (it, o, d) => {
      const g = it.g, pa = g.attributes.position, bs = g.boundingSphere, out = [];
      if (bs) {
        const cx = bs.center.x - o.x, cy = bs.center.y - o.y, cz = bs.center.z - o.z;
        const t = cx * d.x + cy * d.y + cz * d.z;
        const dx = cx - t * d.x, dy2 = cy - t * d.y, dz = cz - t * d.z;
        if (dx * dx + dy2 * dy2 + dz * dz > bs.radius * bs.radius) return out;
      }
      const pp = pa.array, idx = g.index ? g.index.array : null;
      const n = idx ? idx.length : pa.count;
      for (let t3 = 0; t3 < n; t3 += 3) {
        const a = (idx ? idx[t3] : t3) * 3;
        const b = (idx ? idx[t3 + 1] : t3 + 1) * 3;
        const c = (idx ? idx[t3 + 2] : t3 + 2) * 3;
        const e1x = pp[b] - pp[a], e1y = pp[b + 1] - pp[a + 1], e1z = pp[b + 2] - pp[a + 2];
        const e2x = pp[c] - pp[a], e2y = pp[c + 1] - pp[a + 1], e2z = pp[c + 2] - pp[a + 2];
        const hx = d.y * e2z - d.z * e2y, hy = d.z * e2x - d.x * e2z, hz = d.x * e2y - d.y * e2x;
        const det = e1x * hx + e1y * hy + e1z * hz;
        if (Math.abs(det) < 1e-14) continue;
        const inv = 1 / det;
        const sx = o.x - pp[a], sy = o.y - pp[a + 1], sz = o.z - pp[a + 2];
        const uu2 = (sx * hx + sy * hy + sz * hz) * inv;
        if (uu2 < 0 || uu2 > 1) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
        const vv2 = (d.x * qx + d.y * qy + d.z * qz) * inv;
        if (vv2 < 0 || uu2 + vv2 > 1) continue;
        const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
        // det > 0 means the triangle's own winding faces the ray, i.e. a FRONT face
        if (tt > 1e-6) out.push({ t: tt, front: det > 0 });
      }
      return out;
    };

    const cvs = e.renderer.domElement;
    const sw = cvs.clientWidth, sh = cvs.clientHeight;
    const w = p.pointAt(uu, vv);
    const q = w.clone().project(cam);
    const px = (q.x * 0.5 + 0.5) * sw, py = (1 - (q.y * 0.5 + 0.5)) * sh;
    const nearP = new V3((px / sw) * 2 - 1, -(py / sh) * 2 + 1, -1).unproject(cam);
    const farP = new V3((px / sw) * 2 - 1, -(py / sh) * 2 + 1, 1).unproject(cam);
    const dirW = farP.clone().sub(nearP).normalize();

    const all = [];
    for (const it of items) {
      const o = cam.position.clone().applyMatrix4(it.inv);
      const tip = cam.position.clone().add(dirW).applyMatrix4(it.inv);
      const d = tip.sub(o);
      const len = d.length();
      if (len < 1e-12) continue;
      d.multiplyScalar(1 / len);
      for (const h of hits(it, o, d)) {
        const drawn = it.side === 2 || (it.side === 0 ? h.front : !h.front);
        all.push({ name: it.label, mat: it.mat, side: it.side, dist: +(h.t / len).toFixed(3), front: h.front, drawn });
      }
    }
    all.sort((a, b) => a.dist - b.dist);
    return { px: [Math.round(px), Math.round(py)], list: all.slice(0, 12), total: all.length };
  }, [id, u, v]);


  // 🔎 pristine-1: WHAT IS IN FRONT OF A PRISTINE DIG FACE, per room. The gallery's coat did not
  // move a pixel in  while both studies moved 73-76%, and 'IT EXISTS, SOMETHING
  // IS IN FRONT OF IT' is this project's dominant defect class — so this asks rather than argues.
  const ids = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const out = [];
    for (const rm of ['gallery', 'study_w', 'study_e', 'ballroom', 'service']) {
      const p = e.room.panels.find((q) => q.spec?.free && q.pristine
        && ((q.ownerSpace?.root?.name ?? '').slice(6) === rm));
      if (p) out.push(p.id);
    }
    return out;
  });
  note('faces: ' + ids.join(' · '));
  for (const id of ids) {
    const s = await park(id, 0);
    await settle(25);
    for (const [u, v] of [[0.5, 0.5], [0.3, 0.35]]) {
      const r = await rayAt(id, u, v);
      note(id + ' (' + s?.space + ') uv ' + u + ',' + v + ' px ' + r.px.join(',') + ' — ' + r.total + ' intersections');
      for (const h of r.list.slice(0, 7)) {
        note('    ' + (h.drawn ? 'DRAWN  ' : 'dropped') + ' d=' + String(h.dist).padStart(7) + ' ' + (h.front ? 'front' : 'back ') + ' side=' + h.side + ' ' + h.name.slice(0, 52) + ' [' + h.mat.slice(0, 40) + ']');
      }
    }
  }
  if (!true) skip('unreachable', '');
}
