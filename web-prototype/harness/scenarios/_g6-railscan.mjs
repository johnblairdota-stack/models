/**
 * gadget-owner-6 scratch: does the nail gun's hot rail run BREECH-HOT -> MUZZLE-DARK, the way
 * the bar art does, or the other way?
 *
 * `critic-gadget-4` measured the render's peak at mid-barrel with a grey unlit tip and ruled
 * the direction wrong; `gadget-owner-5` then set `dir: 1` in `index.js` and was killed before
 * it could photograph the result. Reading the code is not the check — `hotSteel()`'s own
 * docstring still says "hottest at the muzzle" while its caller passes the opposite, so the
 * two disagree and only the picture settles it.
 *
 * METHOD. Walk the rail mesh's OWN local Y from +half (breech) to -half (muzzle), project each
 * station to a pixel, and keep the station only if a camera->pixel raycast says the first thing
 * the camera meets there IS the rail. That last clause is the whole point: the gold coil loops
 * cross in front of the rail's breech end, and sampling a projected point without checking what
 * owns it measures brass and calls it cold steel.
 */
export default async function railScan({ page, note, pass, fail }) {
  const f0 = await page.evaluate(() => window.__rrr.frames());
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(250);
    if ((await page.evaluate(() => window.__rrr.frames())) - f0 > 30) break;
  }

  const r = await page.evaluate(() => {
    const e = window.__rrr.engine;
    e.opts.dynamicRes = false;
    e.freezeAt = e.elapsed;
    const cam = e.camera; cam.updateMatrixWorld();
    const V3 = cam.position.constructor;
    const W = e.canvas.width, H = e.canvas.height;

    let rail = null;
    e.scene.traverse((o) => { if (o.isMesh && o.name === 'rail') rail = o; });
    if (!rail) return { ok: false, why: 'no mesh named "rail"' };
    rail.geometry.computeBoundingBox();
    const halfY = rail.geometry.boundingBox.max.y;

    const meshes = [];
    e.scene.traverse((o) => {
      if (!o.isMesh) return;
      let vis = true; for (let q = o; q; q = q.parent) if (q.visible === false) vis = false;
      if (!vis) return;
      if (!o.geometry?.boundingSphere) o.geometry?.computeBoundingSphere?.();
      meshes.push(o);
    });
    const hit = (m, o, d) => {
      const g = m.geometry, pa = g.attributes.position, bs = g.boundingSphere;
      if (bs) {
        const cx = bs.center.x - o.x, cy = bs.center.y - o.y, cz = bs.center.z - o.z;
        const t = cx * d.x + cy * d.y + cz * d.z;
        const dx = cx - t * d.x, dy = cy - t * d.y, dz = cz - t * d.z;
        if (dx * dx + dy * dy + dz * dz > bs.radius * bs.radius) return Infinity;
      }
      const a = pa.array, idx = g.index ? g.index.array : null;
      const n = idx ? idx.length : pa.count;
      let best = Infinity;
      for (let t3 = 0; t3 < n; t3 += 3) {
        const i0 = (idx ? idx[t3] : t3) * 3, i1 = (idx ? idx[t3 + 1] : t3 + 1) * 3, i2 = (idx ? idx[t3 + 2] : t3 + 2) * 3;
        const e1x = a[i1] - a[i0], e1y = a[i1 + 1] - a[i0 + 1], e1z = a[i1 + 2] - a[i0 + 2];
        const e2x = a[i2] - a[i0], e2y = a[i2 + 1] - a[i0 + 1], e2z = a[i2 + 2] - a[i0 + 2];
        const hx = d.y * e2z - d.z * e2y, hy = d.z * e2x - d.x * e2z, hz = d.x * e2y - d.y * e2x;
        const det = e1x * hx + e1y * hy + e1z * hz;
        if (Math.abs(det) < 1e-14) continue;
        const inv = 1 / det;
        const sx = o.x - a[i0], sy = o.y - a[i0 + 1], sz = o.z - a[i0 + 2];
        const u = (sx * hx + sy * hy + sz * hz) * inv;
        if (u < 0 || u > 1) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
        const v = (d.x * qx + d.y * qy + d.z * qz) * inv;
        if (v < 0 || u + v > 1) continue;
        const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (tt > 1e-6 && tt < best) best = tt;
      }
      return best;
    };
    const pick = (px, py) => {
      const near = new V3((px / W) * 2 - 1, -(py / H) * 2 + 1, -1).unproject(cam);
      const far = new V3((px / W) * 2 - 1, -(py / H) * 2 + 1, 1).unproject(cam);
      const dirW = far.clone().sub(near).normalize();
      let bestD = Infinity, bestM = null;
      for (const m of meshes) {
        const invM = m.matrixWorld.clone().invert();
        const o = cam.position.clone().applyMatrix4(invM);
        const tip = cam.position.clone().add(dirW).applyMatrix4(invM);
        const d = tip.sub(o); const len = d.length();
        if (len < 1e-12) continue;
        d.multiplyScalar(1 / len);
        const t = hit(m, o, d) / len;
        if (t < bestD) { bestD = t; bestM = m; }
      }
      return bestM;
    };

    for (let i = 0; i < 3; i++) e._step(1 / 60, performance.now());
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c2 = cv.getContext('2d', { willReadFrequently: true });
    c2.drawImage(e.canvas, 0, 0);
    const data = c2.getImageData(0, 0, W, H).data;

    // t = 1 at the BREECH (local +Y, the grip/coil end), t = 0 at the MUZZLE.
    const rows = [];
    for (let k = 0; k <= 20; k++) {
      const t = 1 - k / 20;
      const local = new V3(0, (t * 2 - 1) * halfY * 0.97, 0.02);
      const w = local.clone().applyMatrix4(rail.matrixWorld);
      const q = w.clone().project(cam);
      const px = Math.round((q.x * 0.5 + 0.5) * W), py = Math.round((1 - (q.y * 0.5 + 0.5)) * H);
      if (px < 1 || py < 1 || px >= W || py >= H) continue;
      const owner = pick(px, py);
      const i4 = (py * W + px) * 4;
      rows.push({
        t: +t.toFixed(2), px, py, owner: owner?.name || '(unnamed)',
        rgb: [data[i4], data[i4 + 1], data[i4 + 2]],
      });
    }
    return { ok: true, W, H, halfY: +halfY.toFixed(4), rows, dirDoc: 't=1 is the BREECH/coil end' };
  });

  if (!r.ok) { fail('rail scan', r.why); return; }
  note(`frame ${r.W}x${r.H}, rail half-length ${r.halfY} local units. ${r.dirDoc}`);
  const L = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const own = r.rows.filter((x) => x.owner === 'rail');
  note(`  ${r.rows.length} stations projected, ${own.length} of them actually owned by the rail`);
  note(`  ${'t'.padStart(5)} ${'px'.padStart(9)}  ${'owner'.padEnd(12)} rgb            L     r-b`);
  for (const x of r.rows) {
    note(`  ${String(x.t).padStart(5)} ${String(`${x.px},${x.py}`).padStart(9)}  ${x.owner.padEnd(12)}`
      + ` ${x.rgb.join('/').padEnd(13)} ${L(x.rgb).toFixed(0).padStart(3)}   ${(x.rgb[0] - x.rgb[2]).toString().padStart(4)}`);
  }
  if (own.length < 6) { fail('the rail is visible enough to judge', `${own.length} unoccluded stations`); return; }
  pass('the rail is visible enough to judge', `${own.length} unoccluded stations`);

  // Split the unoccluded stations at the mid-point of the rail and compare the two halves.
  const breechHalf = own.filter((x) => x.t >= 0.5), muzzleHalf = own.filter((x) => x.t < 0.5);
  const mean = (a) => a.reduce((s, x) => s + L(x.rgb), 0) / Math.max(1, a.length);
  const mb = mean(breechHalf), mm = mean(muzzleHalf);
  note(`  mean L: breech half (t>=0.5, n=${breechHalf.length}) ${mb.toFixed(1)}`
    + `  ·  muzzle half (t<0.5, n=${muzzleHalf.length}) ${mm.toFixed(1)}`);
  const hottest = own.reduce((a, b) => (L(b.rgb) > L(a.rgb) ? b : a));
  note(`  hottest unoccluded station: t=${hottest.t} L${L(hottest.rgb).toFixed(0)} rgb ${hottest.rgb.join('/')}`);
  (mb > mm + 10)
    ? pass('the heat gradient runs BREECH-HOT -> MUZZLE-DARK, as the art does',
      `breech half L${mb.toFixed(1)} vs muzzle half L${mm.toFixed(1)}, peak at t=${hottest.t}`)
    : fail('the heat gradient runs BREECH-HOT -> MUZZLE-DARK, as the art does',
      `breech half L${mb.toFixed(1)} vs muzzle half L${mm.toFixed(1)}, peak at t=${hottest.t}`);
}
