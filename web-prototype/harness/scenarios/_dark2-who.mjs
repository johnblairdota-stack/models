/**
 * 🕳️ **`dark-2` — WHO DRAWS THE BLACK, AND WHAT DOES A x4 HEMISPHERE DO TO ITS OWN PIXELS?**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_dark2-who.mjs \
 *        --port 5471 --q "seed=s4" --shots
 *
 * `_dark2-recon.mjs` established the invariance readings and killed one hypothesis outright:
 * at `service.mid`, `shadow.intensity = 0` on the house's ONE shadow caster moves the frame by
 * **+0.01 luma**, and `castShadow = false` on EVERY mesh in the scene moves it by the same
 * +0.01. **`critic-slice-3`'s "hard black joist shadow" attribution is therefore wrong** — there
 * is no shadow term in those pixels to remove.
 *
 * This run answers the two questions that leaves:
 *
 *   1. **WHO owns the black pixels.** Not `--pick`'s nearest hit — an ownership mask built by
 *      HIDING one named object at a time and diffing the frame, which cannot be fooled by an
 *      `InstancedMesh` (`--pick` cannot see one) or by a raycast that does not cull.
 *   2. **What the x4 hemisphere does to THOSE pixels specifically**, rather than to a rect that
 *      mixes the black thing with the wall behind it. The hide-diff gives an exact mask.
 *
 * Every arm is a `visible` flag or a light uniform. Nothing here can move `numPointLights`;
 * the program count is printed on every arm so that is checked rather than asserted.
 */
import { decodePng } from '../pxdiff.mjs';
import { hold, release } from '../still.mjs';

const lumaOf = (img, i) => 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];

/** Pixels whose luma moved by more than `tol` between two same-size captures. */
function maskOf(a, b, tol = 3) {
  const n = Math.min(a.data.length, b.data.length), ch = a.channels;
  const m = new Uint8Array(Math.floor(n / ch));
  let count = 0;
  for (let i = 0, k = 0; i + ch <= n; i += ch, k++) {
    if (Math.abs(lumaOf(a, i) - lumaOf(b, i)) > tol) { m[k] = 1; count++; }
  }
  return { m, count, total: Math.floor(n / ch) };
}

/** Mean luma of an image over a mask (and over its complement). */
function underMask(img, m) {
  const ch = img.channels;
  let s = 0, n = 0, s2 = 0, n2 = 0, dark = 0;
  for (let i = 0, k = 0; i + ch <= img.data.length; i += ch, k++) {
    const L = lumaOf(img, i);
    if (m[k]) { s += L; n++; if (L < 18) dark++; } else { s2 += L; n2++; }
  }
  return { mean: n ? s / n : 0, px: n, darkFrac: n ? dark / n : 0, restMean: n2 ? s2 / n2 : 0 };
}

export default async function dark2who({ page, note, pass, fail, skip, snap, shot }) {
  const wait = async (f) => { for (let i = 0; i < f; i++) await page.waitForTimeout(40); };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(400);

  // ---------------------------------------------------------------- is the shadow map even on?
  const shadowState = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const sm = e.renderer.shadowMap;
    const casters = [];
    e.scene.traverse((o) => { if (o.isLight && o.castShadow) casters.push({ type: o.type, i: +o.intensity.toFixed(1), map: o.shadow.mapSize.x, intensity: o.shadow.intensity, pos: [+o.position.x.toFixed(2), +o.position.y.toFixed(2), +o.position.z.toFixed(2)], tgt: o.target ? [+o.target.position.x.toFixed(2), +o.target.position.y.toFixed(2), +o.target.position.z.toFixed(2)] : null }); });
    return { enabled: sm.enabled, autoUpdate: sm.autoUpdate, needsUpdate: sm.needsUpdate, type: sm.type,
      qualityShadowMap: e.quality?.shadowMap ?? null, casters };
  });
  note(`shadowMap ${JSON.stringify(shadowState)}`);

  const place = (anchor, yaw, pitch = 0.02) => page.evaluate(([a, y, pi]) => {
    const e = window.__rrr.engine, p = e.player;
    const v = e.room.anchor?.(a);
    if (!v) return { ok: false, why: 'no anchor ' + a };
    p.pos.copy(v); p.vel.set(0, 0, 0);
    p.aimYaw = y; p.facing = y;
    if (e.cam) { e.cam.yaw = y; e.cam.pitch = pi; e.cam._first = true; }
    e.room.setViewpoints?.([{ pos: p.pos, dir: { x: Math.sin(y), z: Math.cos(y) } }]);
    return { ok: true, space: e.room.spaceAt(p.pos)?.id ?? null };
  }, [anchor, yaw, pitch]);

  /** Every DRAWN mesh, by name, with its screen-space footprint guessed from its bounds. */
  const drawnCensus = () => page.evaluate(() => {
    const e = window.__rrr.engine;
    const by = new Map();
    e.scene.traverse((o) => {
      if (!o.isMesh) return;
      let vis = true;
      for (let q = o; q; q = q.parent) if (q.visible === false) vis = false;
      if (!vis) return;
      const nm = o.name || '(unnamed)';
      const r = by.get(nm) ?? { name: nm, n: 0 };
      r.n++; by.set(nm, r);
    });
    return [...by.values()];
  });

  /** Hide/show every mesh whose name matches, by exact name. Returns how many it touched. */
  const setHidden = (names, on) => page.evaluate(([ns, v]) => {
    const e = window.__rrr.engine;
    const S = (window.__dw ??= { hidden: new Set() });
    let n = 0;
    const want = new Set(ns);
    e.scene.traverse((o) => {
      if (!o.isMesh) return;
      if (!want.has(o.name || '(unnamed)')) return;
      if (v) { S.hidden.add(o); o.visible = false; } else { S.hidden.delete(o); o.visible = true; }
      n++;
    });
    return n;
  }, [names, on]);

  const showAll = () => page.evaluate(() => {
    const S = (window.__dw ??= { hidden: new Set() });
    for (const o of S.hidden) o.visible = true;
    S.hidden.clear();
    return true;
  });

  const hemi = (mul) => page.evaluate((m) => {
    const e = window.__rrr.engine;
    const S = (window.__dw2 ??= {});
    let h = null;
    e.scene.traverse((o) => { if (o.isHemisphereLight) h = o; });
    if (!h) return null;
    if (S.base == null) S.base = h.intensity;
    h.intensity = S.base * m;
    return { i: +h.intensity.toFixed(3), programs: e.renderer.info.programs?.length ?? -1, calls: e.renderer.info.render.calls };
  }, mul);

  /** Every hit along the camera ray through a SCREEN pixel, depth-ordered, FRONT/BACK tagged. */
  const whoPx = (px, py) => page.evaluate(([sx, sy]) => {
    const e = window.__rrr.engine;
    const cam = e.camera;
    const V3 = cam.position.constructor, M4 = cam.matrixWorld.constructor;
    const items = [];
    e.scene.traverse((o) => {
      if (!o.isMesh) return;
      let vis = true;
      for (let q = o; q; q = q.parent) if (q.visible === false) vis = false;
      if (!vis) return;
      const g = o.geometry;
      if (!g?.attributes?.position) return;
      if (!g.boundingSphere) g.computeBoundingSphere();
      const side = o.material?.side ?? 0;
      const nm = o.material?.name || o.material?.type || '';
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
        const iv = 1 / det;
        const sxx = o.x - pp[a], syy = o.y - pp[a + 1], szz = o.z - pp[a + 2];
        const u2 = (sxx * hx + syy * hy + szz * hz) * iv;
        if (u2 < 0 || u2 > 1) continue;
        const qx = syy * e1z - szz * e1y, qy = szz * e1x - sxx * e1z, qz = sxx * e1y - syy * e1x;
        const v2 = (d.x * qx + d.y * qy + d.z * qz) * iv;
        if (v2 < 0 || u2 + v2 > 1) continue;
        const tt = (e2x * qx + e2y * qy + e2z * qz) * iv;
        if (tt > 1e-6) out.push({ t: tt, front: det > 0 });
      }
      return out;
    };
    const cvs = e.renderer.domElement;
    const sw = cvs.clientWidth, sh = cvs.clientHeight;
    const nearP = new V3((sx / sw) * 2 - 1, -(sy / sh) * 2 + 1, -1).unproject(cam);
    const farP = new V3((sx / sw) * 2 - 1, -(sy / sh) * 2 + 1, 1).unproject(cam);
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
    return { screen: [sw, sh], list: all.filter((h) => h.drawn).slice(0, 6), total: all.length };
  }, [px, py]);

  // ================================================================== the service passage
  const ok = await place('service.mid', 0);
  note(`service.mid ${JSON.stringify(ok)}`);
  if (!ok.ok) { fail('service.mid reachable', ok.why); return; }
  await wait(45);

  const pinned = await hold(page);
  note(`hold ${JSON.stringify(pinned.pinned ?? pinned)}`);
  await wait(4);

  const base = decodePng(await snap('svc-base'));
  await shot('dark2w-svc-base');
  note(`base ${base.width}x${base.height}`);

  // ---- who owns the black: hide one named object at a time, diff, and rank by black pixels won
  const names = (await drawnCensus()).map((c) => c.name);
  note(`drawn meshes resident: ${names.length}`);
  const ranked = [];
  for (const nm of names) {
    const n = await setHidden([nm], true);
    await wait(4);
    const img = decodePng(await snap('h-' + nm));
    await showAll();
    await wait(2);
    if (!img) continue;
    const { m, count } = maskOf(base, img, 3);
    if (count < 200) continue;
    const was = underMask(base, m);
    const now = underMask(img, m);
    ranked.push({ name: nm, n, px: count, wasL: was.mean, nowL: now.mean, wasDark: was.darkFrac });
  }
  ranked.sort((a, b) => b.px - a.px);
  for (const r of ranked.slice(0, 14)) {
    note(`OWNS ${r.name.padEnd(34)} ${String(r.px).padStart(7)} px (${(r.px / (base.width * base.height) * 100).toFixed(1)}% of frame) `
      + `L ${r.wasL.toFixed(1)} -> ${r.nowL.toFixed(1)} when hidden · ${(r.wasDark * 100).toFixed(0)}% of its own pixels are under L18`);
  }

  // ---- the winner's own pixels under a x4 hemisphere
  const top = ranked.filter((r) => r.wasDark > 0.25).sort((a, b) => b.px - a.px)[0] ?? ranked[0];
  if (top) {
    const hid = decodePng(await snap('h2-' + top.name));
    await setHidden([top.name], true); await wait(4);
    const hidImg = decodePng(await snap('hid-' + top.name));
    await showAll(); await wait(3);
    const { m, count } = maskOf(base, hidImg, 3);
    note(`mask for ${top.name}: ${count} px`);
    const h1 = await hemi(4); await wait(6);
    const lift = decodePng(await snap('hemi4'));
    await shot('dark2w-svc-hemi4');
    await hemi(1); await wait(4);
    note(`hemi arm ${JSON.stringify(h1)}`);
    if (lift) {
      const b0 = underMask(base, m), b4 = underMask(lift, m);
      note(`INVARIANCE ${top.name}: ITS OWN PIXELS ${b0.mean.toFixed(2)} -> ${b4.mean.toFixed(2)} `
        + `(${(b4.mean - b0.mean >= 0 ? '+' : '')}${(b4.mean - b0.mean).toFixed(2)}) · everything else `
        + `${b0.restMean.toFixed(2)} -> ${b4.restMean.toFixed(2)} (+${(b4.restMean - b0.restMean).toFixed(2)}) `
        + `· ratio ${((b4.mean - b0.mean) / (b4.restMean - b0.restMean)).toFixed(2)}`);
      if ((b4.mean - b0.mean) < (b4.restMean - b0.restMean) * 0.25) {
        pass(`${top.name} is NOT BEING LIT`, `its own pixels +${(b4.mean - b0.mean).toFixed(2)} against the rest of the frame's +${(b4.restMean - b0.restMean).toFixed(2)}`);
      } else {
        pass(`${top.name} is LIT AND MERELY DARK`, `its own pixels +${(b4.mean - b0.mean).toFixed(2)} against the rest of the frame's +${(b4.restMean - b0.restMean).toFixed(2)}`);
      }
    }
    void hid;
  }

  // ---- five black pixels, named
  const ch = base.channels;
  const dark = [];
  for (let y = 60; y < base.height - 60 && dark.length < 6; y += 37) {
    for (let x = 40; x < base.width - 40; x += 53) {
      const L = lumaOf(base, (y * base.width + x) * ch);
      if (L < 8) { dark.push([x, y, L]); break; }
    }
  }
  const sx = base.width / (pinned.screen?.w ?? 1280);
  for (const [x, y, L] of dark) {
    const h = await whoPx(Math.round(x / (sx || 1)), Math.round(y / (sx || 1)));
    note(`PIXEL ${x},${y} (capture) L=${L.toFixed(1)} — drawn hits: ${h.list.map((q) => `${q.name}@${q.dist}`).join(' | ') || 'NONE'}`);
  }

  await release(page);
  pass('who complete', 'see the notes');
}
