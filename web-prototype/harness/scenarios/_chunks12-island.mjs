/**
 * 🐞 **WHAT IS THE WHITE ISLAND, ASKED OF THE SCENE RATHER THAN OF THE SHADER.**
 *
 * Three rounds have guessed at a mechanism and every guess has been refuted by measurement
 * (the order clamp's ceiling, a soft knee on it, a closing of the depth field, the debris pools,
 * and now the march's own `_par` clamp — 8 -> 0.2 moves the blob by 10 px of 1119). HANDOFF's
 * own rule for this class is *"a camera->pixel raycast returning which mesh owns a pixel"*, and
 * nobody has run it on this blob. So: dig the crater, find the blob, and ASK THE SCENE.
 *
 * It then converts the winning hit back into the panel's own uv and reads the damage field there
 * — raw depth, smoothed depth, barrier flag — against a control point a few pixels away that
 * photographs as teal. If the island's uv is fully dug, it is not a surviving texel and every
 * shader-side hypothesis in this file's history is looking in the wrong place.
 */

export default async function chunks12Island({ page, note, pass, fail, skip, shot, snap }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 30) => {
    const f0 = await frames();
    for (let i = 0; i < 200; i++) {
      await page.waitForTimeout(40);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };

  const head = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e?.room?.digCensus) return null;
    return { ...e.room.digCensus(), seed: String(e.run?.seed ?? '') };
  });
  if (!head) { fail('the build is reachable', 'no digCensus'); return; }
  if (head.mode !== 'free') { skip('probe can run', `?dig=${head.mode}`); return; }

  await page.evaluate(() => {
    const e = window.__rrr.engine;
    if (!e.hunter) return;
    e.hunter.update = () => {};
    if (e.room?.spawn?.hunter) e.hunter.root.position.copy(e.room.spawn.hunter);
    e.hunter.state = 'PATROL'; e.hunter.target = null; e.hunter.awareness = 0;
  });

  const park = (pid, cu, mode, along, out, cv) => page.evaluate(([id, u, m, a, o, v]) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(id);
    const c = p.pointAt(u, v);
    const n = { x: Math.sin(p.rotY), z: Math.cos(p.rotY) };
    const t = { x: Math.cos(p.rotY), z: -Math.sin(p.rotY) };
    const legal = (x, z) => !e.room.spaceAt || !!e.room.spaceAt({ x, y: e.room.floorY + 1, z }, -0.35);
    let k = 1, px = 0, pz = 0;
    for (; k > 0.08; k -= 0.07) {
      px = c.x + n.x * o * k + t.x * a * k; pz = c.z + n.z * o * k + t.z * a * k;
      if (legal(px, pz)) break;
    }
    let fx = -n.x, fz = -n.z;
    if (m === 'graze') {
      const dx = c.x + n.x * 0.06 - px, dz = c.z + n.z * 0.06 - pz;
      const L = Math.hypot(dx, dz) || 1; fx = dx / L; fz = dz / L;
    }
    e.player.pos.set(px, e.room.floorY, pz); e.player.vel.set(0, 0, 0);
    e.player.facing = Math.atan2(fx, fz);
    const dist = Math.hypot(c.x - px, c.z - pz) || 1;
    if (e.cam) {
      e.cam.yaw = e.player.facing;
      e.cam.pitch = Math.atan2(c.y - (e.room.floorY + (e.cam.height ?? 1.42)), dist);
      e.cam.distance = 0.05; e.cam.hardMin = 0.02; e.cam.pinchMin = 0.02; e.cam._first = true;
    }
    return true;
  }, [pid, cu, mode, along, out, cv]);

  const dud = head.free.filter((x) => !x.link).find((f) => f.w >= 4.0) || head.free[0];
  note(`probe on ${dud.id} (w ${dud.w}m)`);
  const CU = 0.46, CV = 0.44;
  await page.evaluate((pid) => window.__rrr.engine.room.panelOf(pid)?.resetDamage(), dud.id);
  await page.evaluate(([pid, u0, v0, plan]) => {
    const p = window.__rrr.engine.room.panelOf(pid);
    for (const [du, dv, count, power] of plan) {
      const u = Math.min(0.97, Math.max(0.03, u0 + du / p.width));
      const v = Math.min(0.94, Math.max(0.06, v0 + dv / p.height));
      for (let k = 0; k < count; k++) p.applyHit(p.pointAt(u, v), power);
    }
  }, [dud.id, CU, CV, [
    [0.00, 0.00, 6, 1.00], [0.19, -0.13, 5, 1.00], [-0.16, 0.21, 5, 1.00], [0.04, 0.41, 4, 0.95],
    [0.53, 0.20, 4, 0.80], [-0.47, -0.29, 3, 0.74], [0.28, -0.54, 3, 0.70], [-0.34, 0.56, 3, 0.64],
    [0.79, -0.11, 2, 0.50], [-0.71, 0.34, 2, 0.44], [0.14, 0.79, 2, 0.40], [-0.09, -0.77, 2, 0.34],
    [1.04, 0.29, 1, 0.25], [-0.94, -0.34, 1, 0.22], [0.54, 0.93, 1, 0.20], [-0.53, -0.88, 1, 0.18],
  ]]);
  await step(300);

  for (const [sname, mode, along, out] of [['headon', 'face', 0, 3.6], ['graze', 'graze', 1.45, 0.62]]) {
    await park(dud.id, CU, mode, along, out, CV);
    await step(24);
    const tag = `c12-isl-${sname}`;
    const buf = await shot(tag) ?? await snap(tag);
    const b = await snap(tag);
    if (!b) { note(`${sname}: no frame`); continue; }
    const found = await page.evaluate(async ([b64]) => {
      const bin = atob(b64); const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([arr], { type: 'image/png' }));
      const W = bmp.width, H = (bmp.height * 0.86) | 0;
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(bmp, 0, 0);
      const d = g.getImageData(0, 0, bmp.width, bmp.height).data;
      const at = (x, y) => { const o = (y * bmp.width + x) * 4; return [d[o], d[o + 1], d[o + 2]]; };
      const isTeal = (p) => p[2] >= 34 && p[2] > p[0] * 1.55 && p[1] > p[0] * 1.20;
      const teal = new Uint8Array(W * H);
      let x0 = W, x1 = -1, y0 = H, y1 = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (isTeal(at(x, y))) { teal[y * W + x] = 1; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      const seen = new Uint8Array(W * H); const stack = new Int32Array(W * H);
      let best = null;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i0 = y * W + x;
        if (teal[i0] || seen[i0]) continue;
        let sp = 0, size = 0, edge = false, sx = 0, sy = 0, bx0 = x, bx1 = x, by0 = y, by1 = y;
        stack[sp++] = i0; seen[i0] = 1;
        while (sp > 0 && size < 400000) {
          const i = stack[--sp];
          const cy = (i / W) | 0, cx = i - cy * W;
          size++; sx += cx; sy += cy;
          if (cx < bx0) bx0 = cx; if (cx > bx1) bx1 = cx;
          if (cy < by0) by0 = cy; if (cy > by1) by1 = cy;
          if (cx <= x0 || cx >= x1 || cy <= y0 || cy >= y1) edge = true;
          const nb = [i - 1, i + 1, i - W, i + W];
          for (let k = 0; k < 4; k++) {
            const j = nb[k];
            if (j < 0 || j >= W * H || seen[j] || teal[j]) continue;
            const jy = (j / W) | 0, jx = j - jy * W;
            if (jx < x0 || jx > x1 || jy < y0 || jy > y1) { edge = true; continue; }
            seen[j] = 1; stack[sp++] = j;
          }
        }
        if (!edge && size >= 60 && (!best || size > best.size)) {
          best = { size, cx: Math.round(sx / size), cy: Math.round(sy / size), bbox: [bx0, by0, bx1, by1], rgb: at(Math.round(sx / size), Math.round(sy / size)) };
        }
      }
      return { W: bmp.width, H: bmp.height, best, tealBox: [x0, y0, x1, y1] };
    }, [b.toString('base64')]);
    if (!found.best) { note(`${sname}: no island`); continue; }
    note(`${sname}: island ${found.best.size}px at (${found.best.cx},${found.best.cy}) rgb ${found.best.rgb} bbox ${JSON.stringify(found.best.bbox)}`);

    /**
     * 🔎 THE PICK. Camera -> pixel raycast over every visible mesh in the scene, Möller-Trumbore,
     * lifted from `_tmp_geoprobe.mjs --pick`. Reported for the island's centre AND for a control
     * pixel just outside it that photographs as teal, because a pick that returns the same mesh
     * at the same distance for both is telling you the blob is not a separate object.
     */
    const picks = await page.evaluate(([W, H, pts, pid]) => {
      const eng = window.__rrr.engine;
      const cam = eng.camera;
      const V3 = cam.position.constructor;
      const meshes = [];
      eng.scene.traverse((o) => {
        if (!o.isMesh) return;
        let vis = true;
        for (let p = o; p; p = p.parent) if (p.visible === false) vis = false;
        if (!vis) return;
        if (!o.geometry?.boundingSphere) o.geometry?.computeBoundingSphere?.();
        meshes.push(o);
      });
      const hit = (mesh, o, d) => {
        const g = mesh.geometry, pa = g.attributes.position;
        const bs = g.boundingSphere;
        if (bs) {
          const cx = bs.center.x - o.x, cy = bs.center.y - o.y, cz = bs.center.z - o.z;
          const t = cx * d.x + cy * d.y + cz * d.z;
          const dx = cx - t * d.x, dy = cy - t * d.y, dz = cz - t * d.z;
          if (dx * dx + dy * dy + dz * dz > bs.radius * bs.radius) return Infinity;
        }
        const p = pa.array;
        const idx = g.index ? g.index.array : null;
        const n = idx ? idx.length : pa.count;
        let best = Infinity, bu = 0, bv = 0, ba = 0;
        for (let t3 = 0; t3 + 2 < n; t3 += 3) {
          const a = (idx ? idx[t3] : t3) * 3;
          const b2 = (idx ? idx[t3 + 1] : t3 + 1) * 3;
          const c2 = (idx ? idx[t3 + 2] : t3 + 2) * 3;
          const e1x = p[b2] - p[a], e1y = p[b2 + 1] - p[a + 1], e1z = p[b2 + 2] - p[a + 2];
          const e2x = p[c2] - p[a], e2y = p[c2 + 1] - p[a + 1], e2z = p[c2 + 2] - p[a + 2];
          const hx = d.y * e2z - d.z * e2y, hy = d.z * e2x - d.x * e2z, hz = d.x * e2y - d.y * e2x;
          const det = e1x * hx + e1y * hy + e1z * hz;
          if (Math.abs(det) < 1e-14) continue;
          const inv = 1 / det;
          const sx = o.x - p[a], sy = o.y - p[a + 1], sz = o.z - p[a + 2];
          const u = (sx * hx + sy * hy + sz * hz) * inv;
          if (u < 0 || u > 1) continue;
          const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
          const v = (d.x * qx + d.y * qy + d.z * qz) * inv;
          if (v < 0 || u + v > 1) continue;
          const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
          if (tt > 1e-6 && tt < best) { best = tt; bu = u; bv = v; ba = t3; }
        }
        return { t: best, u: bu, v: bv, tri: ba };
      };
      const pick = (px, py) => {
        const near = new V3((px / W) * 2 - 1, -(py / H) * 2 + 1, -1).unproject(cam);
        const far = new V3((px / W) * 2 - 1, -(py / H) * 2 + 1, 1).unproject(cam);
        const dirW = far.clone().sub(near).normalize();
        let bestD = Infinity, bestM = null, bestUV = null;
        for (const m of meshes) {
          const inv = m.matrixWorld.clone().invert();
          const o = cam.position.clone().applyMatrix4(inv);
          const tip = cam.position.clone().add(dirW).applyMatrix4(inv);
          const dl = tip.sub(o); const len = dl.length();
          if (len < 1e-12) continue;
          dl.multiplyScalar(1 / len);
          const r = hit(m, o, dl);
          const t = r.t / len;
          if (t < bestD) {
            bestD = t; bestM = m;
            // local-space hit point -> the panel's own uv, valid for a PlaneGeometry face
            const hp = o.clone().add(dl.clone().multiplyScalar(r.t));
            bestUV = hp;
          }
        }
        if (!bestM) return null;
        const g = bestM.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        const bb = g.boundingBox;
        const uu = (bestUV.x - bb.min.x) / Math.max(1e-6, bb.max.x - bb.min.x);
        const vv = (bestUV.y - bb.min.y) / Math.max(1e-6, bb.max.y - bb.min.y);
        return { name: bestM.name || '(unnamed)', mat: bestM.material?.name || '', dist: +bestD.toFixed(4), u: +uu.toFixed(4), v: +vv.toFixed(4) };
      };
      const p = eng.room.panelOf(pid);
      const f = p.field;
      const read = (u, v) => {
        if (u < 0 || u > 1 || v < 0 || v > 1) return null;
        const cx = Math.min(f.cols - 1, Math.max(0, Math.floor(u * f.cols)));
        const cy = Math.min(f.rows - 1, Math.max(0, Math.floor(v * f.rows)));
        const i = cy * f.cols + cx;
        return { cell: [cx, cy], depth: +f.depth[i].toFixed(3), R: f.data[i * 4], G: f.data[i * 4 + 1], B: f.data[i * 4 + 2] };
      };
      return pts.map(([px, py, label]) => {
        const h = pick(px, py);
        return { label, px: [px, py], hit: h, field: h ? read(h.u, h.v) : null };
      });
    }, [found.W, found.H, [
      [found.best.cx, found.best.cy, 'island centre'],
      [found.best.bbox[0] - 12, found.best.cy, 'teal 12px left'],
      [found.best.bbox[2] + 12, found.best.cy, 'teal 12px right'],
      [found.best.cx, found.best.bbox[1] - 12, 'teal 12px above'],
    ], dud.id]);
    for (const p of picks) {
      note(`   ${String(p.label).padEnd(16)} px ${JSON.stringify(p.px)} -> `
        + (p.hit ? `${p.hit.name} [${p.hit.mat}] d=${p.hit.dist} uv=(${p.hit.u},${p.hit.v})` : 'nothing')
        + (p.field ? ` field ${JSON.stringify(p.field)}` : ''));
    }
  }
  pass('the island was picked', 'camera->pixel raycast + damage-field read');
}
