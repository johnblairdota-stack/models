/**
 * 🕳️ **WHY DOES AN EXIT SITE NOT REACH THE SCREEN?** — diagnosis, one boot, both arms.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_ap1-aperture.mjs \
 *        --port 5451 --q "seed=s4" --shots
 *
 * ⚠️ **THE `--pick` THAT FILED THIS AS "NOTHING DRAWS IT" CANNOT SEE AN `InstancedMesh`.**
 * `harness/_tmp_geoprobe.mjs` intersects `geometry.attributes.position` through `m.matrixWorld`
 * — and an `InstancedMesh`'s `matrixWorld` is its PARENT's (the room root, identity here) while
 * every copy it draws lives in `instanceMatrix`. So the pristine wall faces, which are exactly
 * what `wallinstances.js` draws at a pristine panel, are invisible to that probe BY
 * CONSTRUCTION. A MISS from it is not evidence that nothing draws there. The pick below expands
 * instances, so it can tell "nothing is submitted" from "the probe cannot see what is".
 *
 * The arms are flipped inside ONE frozen page with `room.setWallMode()`, for the reason
 * `wallinstances.js` documents: two page loads are two random states.
 */
import { decodePng } from '../pxdiff.mjs';

function meanLuma(img, r) {
  const x0 = Math.max(0, Math.round(r.x0)), x1 = Math.min(img.width, Math.round(r.x1));
  const y0 = Math.max(0, Math.round(r.y0)), y1 = Math.min(img.height, Math.round(r.y1));
  let s = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * img.channels;
      s += 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
      n++;
    }
  }
  return { mean: n ? s / n : 0, px: n };
}

export default async function ap1({ page, note, pass, fail, skip, snap, shot }) {
  const settle = async (frames = 40) => { for (let i = 0; i < frames; i++) await page.waitForTimeout(40); };

  // ------------------------------------------------------------------ 1. the state of every site
  const sites = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e?.room?.panels) return null;
    const inst = e.room.panelInstances ?? null;
    const groupOf = (p) => {
      if (!inst) return null;
      for (const g of inst.groups) {
        const i = g.members.indexOf(p);
        if (i < 0) continue;
        const a = g.face.instanceMatrix.array;
        const o = i * 16;
        const sx = Math.hypot(a[o], a[o + 1], a[o + 2]);
        return {
          key: g.key, slot: i, of: g.members.length,
          faceVisible: !!g.face.visible, revealVisible: !!g.reveal.visible,
          live: g.live ?? null,
          instScale: +sx.toFixed(4),
          instPos: [+a[o + 12].toFixed(2), +a[o + 13].toFixed(2), +a[o + 14].toFixed(2)],
        };
      }
      return { key: null, note: 'NOT A MEMBER OF ANY GROUP' };
    };
    const rows = [];
    for (const p of e.room.panels) {
      if (!String(p.id).startsWith('x.')) continue;
      const st = p.state;
      rows.push({
        id: p.id,
        space: p.ownerSpace?.id ?? null,
        spaceVisible: !!(p.ownerSpace?.visible),
        rootVisible: !!p.root.visible,
        wantVisible: !!p.wantVisible,
        instanced: !!p.instanced,
        pristine: !!p.pristine,
        spent: !!p.spent,
        stage: st.stage,
        stageHealth: st.stageHealth,
        def0Health: st.defs?.[0]?.health ?? null,
        defsLen: st.defs?.length ?? null,
        layers: p.layers.map((l) => (l.visible ? 1 : 0)).join(''),
        layerParent: p.layers[0]?.parent?.name ?? null,
        reveal: !!p.reveal.visible,
        w: +p.width.toFixed(2), h: +p.height.toFixed(2), t: +p.thickness.toFixed(2),
        pos: [+p.root.position.x.toFixed(2), +p.root.position.y.toFixed(2), +p.root.position.z.toFixed(2)],
        group: groupOf(p),
      });
    }
    return {
      rows,
      census: e.room.panelCensus?.() ?? null,
      exitId: e.room.runExitId ?? null,
      wallMode: e.room.wallMode ?? null,
    };
  });

  if (!sites) { skip('the room exposes its panels', 'window.__rrr.engine.room missing'); return; }
  note(`wallMode ${sites.wallMode} · census ${JSON.stringify(sites.census)}`);
  for (const r of sites.rows) {
    note(`${r.id.padEnd(22)} st${r.stage} pri:${r.pristine ? 1 : 0} inst:${r.instanced ? 1 : 0} `
      + `want:${r.wantVisible ? 1 : 0} root:${r.rootVisible ? 1 : 0} spc:${r.space}/${r.spaceVisible ? 1 : 0} `
      + `layers:${r.layers} rev:${r.reveal ? 1 : 0} grp:${JSON.stringify(r.group)}`);
  }

  // ------------------------------------------------------------------ 2. park in front of one
  const park = (pid) => page.evaluate((id) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(id);
    if (!p) return null;
    const home = e.room.spaces.find((s) => s.id === p.ownerSpace?.id);
    // face the panel from INSIDE its own room
    const inSign = home ? p.sideOf({ x: home.cx, y: 0, z: home.cz }) : 1;
    const n = p.normal;
    const d = 4.0 * inSign;
    const c = p.pointAt(0.5, 0.5);
    e.player.pos.set(c.x + n.x * d, e.room.floorY, c.z + n.z * d);
    e.player.vel.set(0, 0, 0);
    e.player.facing = Math.atan2(-n.x * inSign, -n.z * inSign);
    if (e.cam) { e.cam.yaw = e.player.facing; e.cam.pitch = 0; e.cam._first = true; }
    return { space: e.room.spaceAt(e.player.pos)?.id ?? null, inSign };
  }, pid);

  /** Aperture rect + a same-size rect on the wall beside it, in canvas px. */
  const rects = (pid) => page.evaluate((id) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(id);
    const cvs = e.renderer.domElement;
    const sw = cvs.clientWidth, sh = cvs.clientHeight;
    const box = (uv) => {
      let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, behind = false;
      for (const [u, v] of uv) {
        const q = p.pointAt(u, v).project(e.camera);
        if (q.z > 1) behind = true;
        const x = (q.x * 0.5 + 0.5) * sw, y = (1 - (q.y * 0.5 + 0.5)) * sh;
        minx = Math.min(minx, x); maxx = Math.max(maxx, x);
        miny = Math.min(miny, y); maxy = Math.max(maxy, y);
      }
      return { x0: minx, x1: maxx, y0: miny, y1: maxy, behind };
    };
    // inside the aperture, well clear of the jamb
    const ap = box([[0.2, 0.25], [0.8, 0.25], [0.2, 0.75], [0.8, 0.75]]);
    // the wall next to it: same v band, u from 1.25 to 1.85 (one panel width to the side)
    const wallR = box([[1.3, 0.25], [1.9, 0.25], [1.3, 0.75], [1.9, 0.75]]);
    const wallL = box([[-0.9, 0.25], [-0.3, 0.25], [-0.9, 0.75], [-0.3, 0.75]]);
    return { ap, wallR, wallL, screen: { w: sw, h: sh } };
  }, pid);

  /**
   * INSTANCING-AWARE camera->pixel ownership. Same Möller–Trumbore as `_tmp_geoprobe.mjs`,
   * except every `InstancedMesh` is expanded into its live instances first — see the header.
   */
  const pick = (pid, nx, ny) => page.evaluate(([id, gx, gy]) => {
    const e = window.__rrr.engine;
    const cam = e.camera;
    const p = e.room.panelOf(id);
    const V3 = cam.position.constructor;
    const M4 = cam.matrixWorld.constructor;

    const items = [];
    e.scene.traverse((o) => {
      if (!o.isMesh) return;
      let vis = true;
      for (let q = o; q; q = q.parent) if (q.visible === false) vis = false;
      if (!vis) return;
      if (!o.geometry?.attributes?.position) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      if (o.isInstancedMesh) {
        const a = o.instanceMatrix.array;
        for (let i = 0; i < o.count; i++) {
          const sx = Math.hypot(a[i * 16], a[i * 16 + 1], a[i * 16 + 2]);
          if (sx < 1e-6) continue;                       // zero-scaled slot: not drawn
          const m = new M4().fromArray(a, i * 16).premultiply(o.matrixWorld);
          items.push({ mesh: o, label: `${o.name || '(unnamed)'}#${i}`, inv: m.clone().invert() });
        }
        return;
      }
      items.push({ mesh: o, label: o.name || '(unnamed)', inv: o.matrixWorld.clone().invert() });
    });

    const hit = (g, o, d) => {
      const pa = g.attributes.position, bs = g.boundingSphere;
      if (bs) {
        const cx = bs.center.x - o.x, cy = bs.center.y - o.y, cz = bs.center.z - o.z;
        const t = cx * d.x + cy * d.y + cz * d.z;
        const dx = cx - t * d.x, dy = cy - t * d.y, dz = cz - t * d.z;
        if (dx * dx + dy * dy + dz * dz > bs.radius * bs.radius) return Infinity;
      }
      const pp = pa.array, idx = g.index ? g.index.array : null;
      const n = idx ? idx.length : pa.count;
      let best = Infinity;
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

    const cvs = e.renderer.domElement;
    const sw = cvs.clientWidth, sh = cvs.clientHeight;
    const pickPx = (px, py) => {
      const nearP = new V3((px / sw) * 2 - 1, -(py / sh) * 2 + 1, -1).unproject(cam);
      const farP = new V3((px / sw) * 2 - 1, -(py / sh) * 2 + 1, 1).unproject(cam);
      const dirW = farP.clone().sub(nearP).normalize();
      let bestD = Infinity, bestL = null, bestMat = '';
      for (const it of items) {
        const o = cam.position.clone().applyMatrix4(it.inv);
        const tip = cam.position.clone().add(dirW).applyMatrix4(it.inv);
        const d = tip.sub(o);
        const len = d.length();
        if (len < 1e-12) continue;
        d.multiplyScalar(1 / len);
        const t = hit(it.mesh.geometry, o, d) / len;
        if (t < bestD) { bestD = t; bestL = it.label; bestMat = it.mesh.material?.name || ''; }
      }
      return bestL ? { name: bestL, mat: bestMat, dist: +bestD.toFixed(3) } : null;
    };

    // the aperture centre and four points inside it
    const pts = [];
    for (const [u, v] of [[0.5, 0.5], [0.3, 0.35], [0.7, 0.35], [0.3, 0.7], [0.7, 0.7],
      [1.5, 0.5], [-0.5, 0.5]]) {
      const q = p.pointAt(u, v).project(cam);
      const x = (q.x * 0.5 + 0.5) * sw, y = (1 - (q.y * 0.5 + 0.5)) * sh;
      pts.push({ uv: [u, v], px: [Math.round(x), Math.round(y)], hit: pickPx(x, y) });
    }

    // a small ownership raster across the aperture and a wall's width either side
    const raster = { legend: [], rows: [] };
    const key = new Map();
    const glyphs = '.123456789abcdefghijklmnopqrstuvwxyz';
    for (let r = 0; r < gy; r++) {
      let line = '';
      for (let c = 0; c < gx; c++) {
        const u = -0.6 + (c + 0.5) * (2.2 / gx);
        const v = 0.05 + (gy - 1 - r + 0.5) * (0.9 / gy);
        const q = p.pointAt(u, v).project(cam);
        const x = (q.x * 0.5 + 0.5) * sw, y = (1 - (q.y * 0.5 + 0.5)) * sh;
        const h = pickPx(x, y);
        const idk = h ? `${h.name.replace(/#\d+$/, '#*')}|${h.mat}` : '(MISS)';
        if (!key.has(idk)) key.set(idk, glyphs[Math.min(glyphs.length - 1, key.size)]);
        line += key.get(idk);
      }
      raster.rows.push(line);
    }
    raster.legend = [...key].map(([k, v]) => `${v} = ${k}`);
    return { pts, raster, meshes: items.length };
  }, [pid, nx, ny]);

  const measure = async (pid, tag) => {
    await settle(35);
    const r = await rects(pid);
    const buf = await snap(`${tag}-x`);
    await shot(tag);
    const pk = await pick(pid, 22, 9);
    let lum = null;
    if (buf) {
      try {
        const img = decodePng(buf);
        const sx = img.width / r.screen.w, sy = img.height / r.screen.h;
        const sc = (q) => ({ x0: q.x0 * sx, x1: q.x1 * sx, y0: q.y0 * sy, y1: q.y1 * sy });
        lum = {
          aperture: meanLuma(img, sc(r.ap)),
          wallR: meanLuma(img, sc(r.wallR)),
          wallL: meanLuma(img, sc(r.wallL)),
        };
      } catch (err) { note(`decode failed: ${String(err).slice(0, 90)}`); }
    }
    return { rects: r, pick: pk, lum };
  };

  const report = (tag, m) => {
    if (m.lum) {
      note(`${tag}  aperture luma ${m.lum.aperture.mean.toFixed(1)} (${m.lum.aperture.px} px) · `
        + `wall L ${m.lum.wallL.mean.toFixed(1)} · wall R ${m.lum.wallR.mean.toFixed(1)}`);
    }
    note(`${tag}  scene meshes+instances picked over: ${m.pick.meshes}`);
    for (const p of m.pick.pts) {
      note(`${tag}  uv ${p.uv.join(',')} px ${p.px.join(',')} -> ${p.hit ? `${p.hit.name} [${p.hit.mat}] d=${p.hit.dist}` : 'MISS'}`);
    }
    for (const l of m.pick.raster.legend) note(`${tag}  ${l}`);
    for (const row of m.pick.raster.rows) note(`${tag}  |${row}|`);
  };

  // ------------------------------------------------------------------ 3. pick a target
  // Prefer the two the defect was filed against; otherwise the first `x.` site in a big room.
  const wanted = ['x.ballroom.terrace_e', 'x.ballroom.orangery', 'x.gallery.boards'];
  const target = wanted.find((id) => sites.rows.some((r) => r.id === id)) ?? sites.rows[0]?.id;
  if (!target) { skip('an exit site exists', 'no x.* panels in this build'); return; }
  const st = await park(target);
  note(`parked for ${target} in space ${st?.space} (inSign ${st?.inSign})`);

  // ------------------------------------------------------------------ 4. arm A: as shipped
  const A = await measure(target, `ap1-${target.replace(/\./g, '_')}-instanced`);
  report('INSTANCED', A);

  // ------------------------------------------------------------------ 5. arm B: legacy
  const got = await page.evaluate(() => window.__rrr.engine.room.setWallMode('legacy'));
  note(`setWallMode -> ${got}`);
  const stateB = await page.evaluate((id) => {
    const p = window.__rrr.engine.room.panelOf(id);
    return {
      instanced: !!p.instanced, pristine: !!p.pristine, want: !!p.wantVisible,
      layers: p.layers.map((l) => (l.visible ? 1 : 0)).join(''), reveal: !!p.reveal.visible,
      rootVisible: !!p.root.visible,
    };
  }, target);
  note(`legacy state ${JSON.stringify(stateB)}`);
  const B = await measure(target, `ap1-${target.replace(/\./g, '_')}-legacy`);
  report('LEGACY', B);

  // ------------------------------------------------------------------ 6. the attribution
  if (A.lum && B.lum) {
    const dA = A.lum.aperture.mean, dB = B.lum.aperture.mean;
    const wA = (A.lum.wallL.mean + A.lum.wallR.mean) / 2;
    const wB = (B.lum.wallL.mean + B.lum.wallR.mean) / 2;
    note(`ATTRIBUTION  aperture ${dA.toFixed(1)} (inst) vs ${dB.toFixed(1)} (legacy); `
      + `wall ${wA.toFixed(1)} vs ${wB.toFixed(1)}`);
    if (dB > dA * 2 + 5) {
      pass('the legacy arm FILLS the aperture', `${dA.toFixed(1)} -> ${dB.toFixed(1)} — the instancing path owns it`);
    } else {
      pass('the hole is present on BOTH arms', `${dA.toFixed(1)} vs ${dB.toFixed(1)} — instancing does NOT own it`);
    }
  } else {
    skip('attribution', 'no luma readings');
  }

  await page.evaluate(() => window.__rrr.engine.room.setWallMode('instanced'));
}
