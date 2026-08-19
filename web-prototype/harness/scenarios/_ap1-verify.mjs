/**
 * 🕳️ **THE EXIT-SITE APERTURES, ON THE SHIPPED BUILD, ON ALL THREE WALL ARMS.**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_ap1-verify.mjs \
 *        --port 5454 --q "seed=s4" --shots
 *
 * `_ap1-aperture.mjs` attributed the defect (present on `legacy` too, so not the instancing
 * path) and `_ap1-sided.mjs` proved the mechanism in pixels (one-sided layer planes on a
 * two-sided hole). This is the receipt: every site that had a room on its BACK side is walked,
 * framed inside its own room, and measured against the lit wall beside it — plus one site that
 * was never blind, as the control that says the instrument is not simply reporting "wall".
 *
 * ⚠️ The statistic is the FRACTION OF THE RECT UNDER LUMA 20, not the mean. An unfilled
 * aperture is not "a bit darker": it is 99.7% unlit, and a mean over a rect that also catches a
 * lit jamb hides that completely — which is how this got filed as a LIGHTING failure once.
 */
import { decodePng } from '../pxdiff.mjs';

function stats(img, r) {
  const x0 = Math.max(0, Math.round(r.x0)), x1 = Math.min(img.width, Math.round(r.x1));
  const y0 = Math.max(0, Math.round(r.y0)), y1 = Math.min(img.height, Math.round(r.y1));
  let s = 0, n = 0, dark = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * img.channels;
      const L = 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
      s += L; n++;
      if (L < 20) dark++;
    }
  }
  return { mean: n ? s / n : 0, darkPct: n ? (dark / n) * 100 : 0, px: n };
}

export default async function ap1verify({ page, note, pass, fail, skip, snap, shot }) {
  const settle = async (f = 30) => { for (let i = 0; i < f; i++) await page.waitForTimeout(40); };

  const survey = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e?.room?.panels) return null;
    const out = [];
    for (const p of e.room.panels) {
      if (p.field) continue;
      const home = e.room.spaces.find((s) => s.id === p.ownerSpace?.id);
      if (!home) continue;
      out.push({
        id: p.id,
        wasBlind: p.sideOf({ x: home.cx, y: 0, z: home.cz }) === -1,
        side: p.mats.slice(0, 4).map((m) => (m ? m.side : 'null')).join(','),
        exit: String(p.id).startsWith('x.'),
      });
    }
    return { out, instSide: e.room.panelInstances?.faceMaterial?.side ?? null };
  });
  if (!survey) { skip('the room exposes its panels', 'engine.room missing'); return; }

  const allDouble = survey.out.every((r) => r.side === '2,2,2,2');
  note(`scalar layer materials side: ${allDouble ? 'ALL DoubleSide' : survey.out.map((r) => `${r.id}=${r.side}`).join(' ')}`);
  note(`instanced pristine face side: ${survey.instSide} (2 == DoubleSide)`);
  if (allDouble && survey.instSide === 2) pass('every scalar wall face is two-sided', `${survey.out.length} panels + the shared pristine face`);
  else fail('every scalar wall face is two-sided', `allDouble=${allDouble} instSide=${survey.instSide}`);

  const blindExits = survey.out.filter((r) => r.wasBlind && r.exit).map((r) => r.id);
  const okExit = survey.out.find((r) => !r.wasBlind && r.exit)?.id ?? null;
  note(`previously-blind exit sites: ${blindExits.join(', ')}`);
  note(`control (never blind): ${okExit}`);

  // -------------------------------------------------------------- station + measurement
  const park = (id, yawOff) => page.evaluate(([pid, dy]) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(pid);
    const home = e.room.spaces.find((s) => s.id === p.ownerSpace?.id);
    const inSign = home ? p.sideOf({ x: home.cx, y: 0, z: home.cz }) : 1;
    const n = p.normal;
    const c = p.pointAt(0.5, 0.5);
    e.player.pos.set(c.x + n.x * 4.0 * inSign, e.room.floorY, c.z + n.z * 4.0 * inSign);
    e.player.vel.set(0, 0, 0);
    e.player.facing = Math.atan2(-n.x * inSign, -n.z * inSign) + dy;
    if (e.cam) { e.cam.yaw = e.player.facing; e.cam.pitch = 0; e.cam._first = true; }
    return { space: e.room.spaceAt(e.player.pos)?.id ?? null, home: home?.id ?? null };
  }, [id, yawOff]);

  /** Frame the site inside its own room, clear of the third-person robot; measure; shoot. */
  const visit = async (id, tag) => {
    let bestR = null, best = -1, bestYaw = 0;
    for (const dy of [0.6, -0.6, 0.42, -0.42]) {
      const s = await park(id, dy);
      if (s?.space !== s?.home) continue;
      await settle(10);
      const rr = await page.evaluate((pid) => {
        const e = window.__rrr.engine;
        const p = e.room.panelOf(pid);
        const cvs = e.renderer.domElement;
        const sw = cvs.clientWidth, sh = cvs.clientHeight;
        const box = (uv) => {
          let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
          for (const [u, v] of uv) {
            const q = p.pointAt(u, v).project(e.camera);
            const x = (q.x * 0.5 + 0.5) * sw, y = (1 - (q.y * 0.5 + 0.5)) * sh;
            minx = Math.min(minx, x); maxx = Math.max(maxx, x);
            miny = Math.min(miny, y); maxy = Math.max(maxy, y);
          }
          return { x0: minx, x1: maxx, y0: miny, y1: maxy };
        };
        return {
          ap: box([[0.18, 0.22], [0.82, 0.22], [0.18, 0.78], [0.82, 0.78]]),
          wall: box([[1.25, 0.22], [1.85, 0.22], [1.25, 0.78], [1.85, 0.78]]),
          screen: { w: sw, h: sh },
        };
      }, id);
      const on = rr.ap.x0 > 4 && rr.ap.x1 < rr.screen.w - 4 && rr.ap.y0 > 4 && rr.ap.y1 < rr.screen.h - 4;
      const clear = Math.min(Math.abs(rr.ap.x0 - rr.screen.w / 2), Math.abs(rr.ap.x1 - rr.screen.w / 2));
      if (on && clear > best) { best = clear; bestR = rr; bestYaw = dy; }
    }
    if (!bestR) { note(`${id}: no yaw framed it inside its own room — SKIPPED`); return null; }
    await park(id, bestYaw);
    await settle(30);
    const buf = await snap(`${tag}-x`);
    if (tag) await shot(tag);
    if (!buf) return null;
    const img = decodePng(buf);
    const sx = img.width / bestR.screen.w, sy = img.height / bestR.screen.h;
    const sc = (q) => ({ x0: q.x0 * sx, x1: q.x1 * sx, y0: q.y0 * sy, y1: q.y1 * sy });
    return { ap: stats(img, sc(bestR.ap)), wall: stats(img, sc(bestR.wall)), yaw: bestYaw };
  };

  /**
   * ⚠️ **THE ASSERTION IS "A WALL FACE IS DRAWN IN THE APERTURE", NOT A LUMA THRESHOLD.**
   * Two of the fourteen sites wear `exterior.js`'s `mortar` dressing this seed — a deliberate
   * opaque slab across 92% x 88% of the opening, standing 8 mm proud on BOTH faces — so their
   * aperture is legitimately dark whatever the wall behind it does. A luma gate would score
   * that as this defect, which is exactly the mistake that got the whole thing filed as a
   * lighting failure. So the gate reads the DRAW SET: is a wall face submitted AND not culled?
   * Luma is reported beside it as evidence, never as the test.
   */
  const drawnAt = (id) => page.evaluate((pid) => {
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
      const nm = o.name || '';
      // only the things that could be filling THIS aperture
      const mine = nm.startsWith('wall.pristine.face') || nm.startsWith('wall.spent.')
        || nm.startsWith(`${pid}.layer`);
      if (!mine) return;
      const side = o.material?.side ?? 0;
      if (o.isInstancedMesh) {
        const a = o.instanceMatrix.array;
        for (let i = 0; i < o.count; i++) {
          if (Math.hypot(a[i * 16], a[i * 16 + 1], a[i * 16 + 2]) < 1e-6) continue;
          const m = new M4().fromArray(a, i * 16).premultiply(o.matrixWorld);
          items.push({ g, label: `${nm}#${i}`, side, inv: m.clone().invert() });
        }
        return;
      }
      items.push({ g, label: nm, side, inv: o.matrixWorld.clone().invert() });
    });
    const cast = (uu, vv) => {
      const cvs = e.renderer.domElement;
      const sw = cvs.clientWidth, sh = cvs.clientHeight;
      const q = p.pointAt(uu, vv).project(cam);
      const px = (q.x * 0.5 + 0.5) * sw, py = (1 - (q.y * 0.5 + 0.5)) * sh;
      const nearP = new V3((px / sw) * 2 - 1, -(py / sh) * 2 + 1, -1).unproject(cam);
      const farP = new V3((px / sw) * 2 - 1, -(py / sh) * 2 + 1, 1).unproject(cam);
      const dirW = farP.clone().sub(nearP).normalize();
      for (const it of items) {
        const o = cam.position.clone().applyMatrix4(it.inv);
        const tip = cam.position.clone().add(dirW).applyMatrix4(it.inv);
        const d = tip.sub(o);
        const len = d.length();
        if (len < 1e-12) continue;
        d.multiplyScalar(1 / len);
        const gg = it.g, pa = gg.attributes.position, bs = gg.boundingSphere;
        if (bs) {
          const cx = bs.center.x - o.x, cy = bs.center.y - o.y, cz = bs.center.z - o.z;
          const t = cx * d.x + cy * d.y + cz * d.z;
          const dx = cx - t * d.x, dy = cy - t * d.y, dz = cz - t * d.z;
          if (dx * dx + dy * dy + dz * dz > bs.radius * bs.radius) continue;
        }
        const pp = pa.array, idx = gg.index ? gg.index.array : null;
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
          const u2 = (sx * hx + sy * hy + sz * hz) * inv;
          if (u2 < 0 || u2 > 1) continue;
          const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
          const v2 = (d.x * qx + d.y * qy + d.z * qz) * inv;
          if (v2 < 0 || u2 + v2 > 1) continue;
          const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
          if (tt <= 1e-6) continue;
          const front = det > 0;
          if (it.side === 2 || (it.side === 0 ? front : !front)) {
            return { name: it.label, side: it.side, front, dist: +(tt / len).toFixed(3) };
          }
        }
      }
      return null;
    };
    const pts = [[0.5, 0.5], [0.3, 0.7], [0.7, 0.3]];
    const got = pts.map(([u, v]) => cast(u, v));
    return { got, all: got.every(Boolean) };
  }, id);

  // -------------------------------------------------------------- 1. every site that was blind
  const missing = [];
  for (const id of [...blindExits, okExit].filter(Boolean)) {
    const tag = id === okExit ? `ap1-control-${id.replace(/\./g, '_')}` : `ap1-fixed-${id.replace(/\./g, '_')}`;
    const m = await visit(id, tag);
    if (!m) { note(`${id}: could not be framed inside its own room`); continue; }
    const d = await drawnAt(id);
    note(`${id.padEnd(22)}${id === okExit ? ' CONTROL' : '        '} face drawn at 3/3 points: ${d.all} `
      + `${d.got.map((g) => (g ? `${g.name}(${g.front ? 'front' : 'back'})` : 'NONE')).join(' ')}`);
    note(`${' '.repeat(22)}         aperture luma ${m.ap.mean.toFixed(1)} unlit ${m.ap.darkPct.toFixed(1)}% · `
      + `wall beside it luma ${m.wall.mean.toFixed(1)} unlit ${m.wall.darkPct.toFixed(1)}%`);
    if (!d.all) missing.push(id);
  }
  if (!missing.length) {
    pass('🕳️ every exit aperture has a wall face in the draw set',
      `${blindExits.length} formerly-blind sites + the never-blind control, 3 sample points each`);
  } else {
    fail('🕳️ every exit aperture has a wall face in the draw set', `still empty: ${missing.join(', ')}`);
  }

  // -------------------------------------------------------------- 2. all three arms still work
  //
  // ⚠️ ONE STATION FOR ALL THREE. The first build of this compared arms from wherever the last
  // `visit()` left the camera, so residency differed between the rows and `ownMeshes` was a
  // reading of which room the camera was in — `legacy 15` against `occlude 19` with 3 panels
  // resident against 8. Park once, then flip the arm without moving.
  await park(blindExits[0] ?? survey.out[0].id, 0.6);
  await settle(25);
  const arms = {};
  for (const arm of ['legacy', 'occlude', 'instanced']) {
    const got = await page.evaluate((a) => window.__rrr.engine.room.setWallMode(a), arm);
    await settle(12);
    const st = await page.evaluate(() => {
      const e = window.__rrr.engine;
      return { census: e.room.panelCensus(), calls: e.renderer.info.render.calls };
    });
    const d = await drawnAt(blindExits[0] ?? survey.out[0].id);
    arms[arm] = { got, ...st, drawn: d.all };
    note(`arm ${arm} -> ${got} · ownMeshes ${st.census.ownMeshes} · visiblePanels ${st.census.visiblePanels} `
      + `· instanced drawing ${st.census.instanced ? st.census.instanced.drawing : 'none'} · frame calls ${st.calls} `
      + `· aperture filled ${d.all} (${d.got[0] ? d.got[0].name : 'NONE'})`);
  }
  const separates = arms.legacy.census.ownMeshes > arms.occlude.census.ownMeshes
    && arms.occlude.census.ownMeshes > arms.instanced.census.ownMeshes;
  const allFilled = ['legacy', 'occlude', 'instanced'].every((a) => arms[a].drawn);
  if (arms.legacy.got === 'legacy' && arms.occlude.got === 'occlude' && arms.instanced.got === 'instanced'
    && separates && allFilled) {
    pass('all three wall arms still work, still separate, and all three fill the aperture',
      `own layer meshes at one station: legacy ${arms.legacy.census.ownMeshes} > occlude ${arms.occlude.census.ownMeshes} `
      + `> instanced ${arms.instanced.census.ownMeshes}`);
  } else {
    fail('all three wall arms still work, still separate, and all three fill the aperture',
      JSON.stringify(Object.fromEntries(Object.entries(arms).map(([k, v]) => [k, [v.got, v.census.ownMeshes, v.drawn]]))));
  }
  await page.evaluate(() => window.__rrr.engine.room.setWallMode('instanced'));
}
