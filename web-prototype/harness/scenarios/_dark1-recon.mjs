/**
 * 🕳️ **`dark-1` RECON — IS THE BLACK THING LIT-BUT-DARK, OR NOT LIT AT ALL?**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_dark1-recon.mjs \
 *        --port 5471 --q "seed=s4" --shots
 *
 * Two items in ONE boot, because a boot costs ~100 s:
 *
 *   A. the service passage's black wedges (`critic-slice-3` #6)
 *   B. the boarding that renders as flat black cut-outs (`critic-slice-3` #5)
 *
 * The instrument is HANDOFF's own invariance test, in the form `aperture-1` used: multiply the
 * hemisphere and look. A thing that BRIGHTENS with its neighbours is lit and merely dark; a thing
 * that does not move while its neighbours do is not being lit at all, and no light will fix it.
 * Every capture pair is taken under `harness/still.mjs`'s `hold()`, park-and-settle FIRST.
 *
 * The third arm is `key.shadow.intensity = 0` — a UNIFORM, not `castShadow`, so it cannot move
 * `numPointLights` or recompile a program. If the wedges are shadow, that arm deletes them.
 */
import { decodePng } from '../pxdiff.mjs';
import { hold, release } from '../still.mjs';

const lumaOf = (img, i) => 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];

/** Mean luma over a canvas-space rect, mapped into the capture's own pixel grid. */
function rectLuma(img, r, sx, sy) {
  const x0 = Math.max(0, Math.round(r.x0 * sx)), x1 = Math.min(img.width, Math.round(r.x1 * sx));
  const y0 = Math.max(0, Math.round(r.y0 * sy)), y1 = Math.min(img.height, Math.round(r.y1 * sy));
  let s = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) { s += lumaOf(img, (y * img.width + x) * img.channels); n++; }
  }
  return { mean: n ? s / n : 0, px: n };
}

/**
 * The invariance reading, split by how dark the BASE pixel was. Two populations from one pair —
 * "the black thing" and "its neighbours" — with no rect to author and nothing to aim.
 */
function split(base, arm) {
  const n = Math.min(base.data.length, arm.data.length);
  const ch = base.channels;
  let dS = 0, dN = 0, dA = 0, lS = 0, lN = 0, lA = 0, mS = 0, mN = 0;
  for (let i = 0; i + ch <= n; i += ch) {
    const b = lumaOf(base, i), a = lumaOf(arm, i);
    if (b < 18) { dN++; dS += b; dA += a; }
    else if (b > 60) { lN++; lS += b; lA += a; }
    else { mN++; mS += a - b; }
  }
  return {
    darkN: dN, darkBase: dN ? dS / dN : 0, darkArm: dN ? dA / dN : 0,
    litN: lN, litBase: lN ? lS / lN : 0, litArm: lN ? lA / lN : 0,
    midN: mN, midDelta: mN ? mS / mN : 0,
  };
}

export default async function dark1({ page, note, pass, fail, skip, snap, shot }) {
  const wait = async (f) => { for (let i = 0; i < f; i++) await page.waitForTimeout(40); };

  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(400);

  // ------------------------------------------------------------------ 0. the census
  const census = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e?.scene) return null;
    const lights = [];
    const dress = [];
    e.scene.traverse((o) => {
      if (o.isLight) {
        lights.push({
          type: o.type, name: o.name || '', vis: !!o.visible,
          i: +o.intensity.toFixed(3),
          col: '#' + o.color.getHexString(),
          ground: o.groundColor ? '#' + o.groundColor.getHexString() : null,
          pos: [+o.position.x.toFixed(2), +o.position.y.toFixed(2), +o.position.z.toFixed(2)],
          dist: o.distance ?? null, decay: o.decay ?? null,
          angle: o.angle != null ? +o.angle.toFixed(3) : null,
          penumbra: o.penumbra ?? null,
          cast: !!o.castShadow,
          map: o.shadow ? `${o.shadow.mapSize.x}` : null,
          bias: o.shadow ? o.shadow.bias : null,
          nbias: o.shadow ? o.shadow.normalBias : null,
          radius: o.shadow ? o.shadow.radius : null,
          near: o.shadow?.camera?.near ?? null, far: o.shadow?.camera?.far ?? null,
        });
      }
      if (o.isMesh && /exterior\.dress/.test(o.name || '')) {
        let live = 0;
        const a = o.instanceMatrix?.array;
        if (a) for (let i = 0; i < o.count; i++) if (Math.hypot(a[i * 16], a[i * 16 + 1], a[i * 16 + 2]) > 1e-6) live++;
        dress.push({
          name: o.name, vis: !!o.visible, count: o.count, live,
          mat: o.material?.name || '', side: o.material?.side,
          col: o.material?.color ? '#' + o.material.color.getHexString() : null,
          rough: o.material?.roughness ?? null, metal: o.material?.metalness ?? null,
          cast: !!o.castShadow, recv: !!o.receiveShadow,
          type: o.material?.type,
        });
      }
    });
    // which panels wear which hardware, and where they are
    const plan = [];
    for (const p of (e.room?.panels ?? [])) {
      const d = e.exterior?.dressingOf?.(p.id);
      if (!d) continue;
      if (!d.chain && !d.boards && !d.mortar && !d.seam) continue;
      plan.push({
        id: p.id, space: p.ownerSpace?.id ?? null,
        chain: !!d.chain, seam: !!d.seam, boards: !!d.boards, mortar: !!d.mortar,
        w: +p.width.toFixed(2), h: +p.height.toFixed(2),
        pos: [+p.root.position.x.toFixed(2), +p.root.position.y.toFixed(2), +p.root.position.z.toFixed(2)],
      });
    }
    return { lights, dress, plan, envInt: e.scene.environmentIntensity ?? null, hasEnv: !!e.scene.environment };
  });

  if (!census) { fail('the scene is reachable', 'window.__rrr.engine.scene missing'); return; }
  note(`scene.environment ${census.hasEnv ? 'present' : 'NONE'} intensity ${census.envInt}`);
  for (const l of census.lights) {
    note(`LIGHT ${l.type.padEnd(17)} ${String(l.name).padEnd(12)} i=${String(l.i).padStart(7)} ${l.col}`
      + `${l.ground ? '/' + l.ground : ''} pos ${l.pos.join(',')} dist=${l.dist} decay=${l.decay}`
      + ` ang=${l.angle} pen=${l.penumbra} CAST=${l.cast ? 'YES map ' + l.map + ' bias ' + l.bias + ' nb ' + l.nbias + ' r ' + l.radius + ' near ' + l.near + ' far ' + l.far : 'no'}`);
  }
  for (const d of census.dress) {
    note(`DRESS ${d.name.padEnd(28)} vis=${d.vis ? 1 : 0} live=${d.live}/${d.count} ${d.type} ${d.col} `
      + `rough=${d.rough} metal=${d.metal} side=${d.side} cast=${d.cast ? 1 : 0} recv=${d.recv ? 1 : 0}`);
  }
  for (const p of census.plan) {
    note(`PLAN  ${p.id.padEnd(22)} ${String(p.space).padEnd(9)} chain=${p.chain ? 1 : 0} seam=${p.seam ? 1 : 0} `
      + `boards=${p.boards ? 1 : 0} mortar=${p.mortar ? 1 : 0} ${p.w}x${p.h} @ ${p.pos.join(',')}`);
  }

  // ------------------------------------------------------------------ helpers
  const place = (anchor, yaw, pitch = 0.02) => page.evaluate(([a, y, pi]) => {
    const e = window.__rrr.engine, p = e.player;
    const v = e.room.anchor?.(a);
    if (!v) return { ok: false, why: 'no anchor ' + a };
    p.pos.copy(v); p.vel.set(0, 0, 0);
    p.aimYaw = y; p.facing = y;
    if (e.cam) { e.cam.yaw = y; e.cam.pitch = pi; e.cam._first = true; }
    e.room.setViewpoints?.([p.pos]);
    return { ok: true, at: [+v.x.toFixed(1), +v.y.toFixed(1), +v.z.toFixed(1)] };
  }, [anchor, yaw, pitch]);

  const parkPanel = (pid, back = 3.4, yawOff = 0) => page.evaluate(([id, d0, dy]) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(id);
    if (!p) return { ok: false, why: 'no panel ' + id };
    const home = e.room.spaces.find((s) => s.id === p.ownerSpace?.id);
    const inSign = home ? p.sideOf({ x: home.cx, y: 0, z: home.cz }) : 1;
    const n = p.normal;
    const c = p.pointAt(0.5, 0.5);
    e.player.pos.set(c.x + n.x * d0 * inSign, e.room.floorY, c.z + n.z * d0 * inSign);
    e.player.vel.set(0, 0, 0);
    const f = Math.atan2(-n.x * inSign, -n.z * inSign) + dy;
    e.player.facing = f; e.player.aimYaw = f;
    if (e.cam) { e.cam.yaw = f; e.cam.pitch = 0; e.cam._first = true; }
    e.room.setViewpoints?.([e.player.pos]);
    return { ok: true, space: e.room.spaceAt(e.player.pos)?.id ?? null, home: home?.id ?? null, inSign };
  }, [pid, back, yawOff]);

  /** The panel's own rect and a same-size rect one panel-width to each side, in canvas px. */
  const panelRects = (pid) => page.evaluate((id) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(id);
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
    const q = (u0, u1, v0, v1) => box([[u0, v0], [u1, v0], [u0, v1], [u1, v1]]);
    return { face: q(0.18, 0.82, 0.22, 0.78), left: q(-0.95, -0.35, 0.22, 0.78),
      right: q(1.35, 1.95, 0.22, 0.78), screen: { w: sw, h: sh } };
  }, pid);

  /** Every hit along the ray at a panel uv, in depth order, FRONT/BACK tagged. */
  const who = (pid, u, v) => page.evaluate(([id, uu, vv]) => {
    const e = window.__rrr.engine;
    const cam = e.camera;
    const p = e.room.panelOf(id);
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
        const sx = o.x - pp[a], sy = o.y - pp[a + 1], sz = o.z - pp[a + 2];
        const u2 = (sx * hx + sy * hy + sz * hz) * iv;
        if (u2 < 0 || u2 > 1) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
        const v2 = (d.x * qx + d.y * qy + d.z * qz) * iv;
        if (v2 < 0 || u2 + v2 > 1) continue;
        const tt = (e2x * qx + e2y * qy + e2z * qz) * iv;
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
    return { px: [Math.round(px), Math.round(py)], list: all.slice(0, 10), total: all.length };
  }, [pid, u, v]);

  /** Live arms. All uniforms — nothing here can move a light COUNT or recompile a program. */
  const arm = (which) => page.evaluate((w) => {
    const e = window.__rrr.engine;
    const S = (window.__dark1 ??= {});
    const lights = [];
    e.scene.traverse((o) => { if (o.isLight) lights.push(o); });
    const hemi = lights.find((l) => l.isHemisphereLight);
    const spot = lights.find((l) => l.isSpotLight && l.castShadow);
    if (!S.saved) {
      S.saved = {
        hemi: hemi ? hemi.intensity : null,
        shadow: spot ? spot.shadow.intensity : null,
        env: e.scene.environmentIntensity,
      };
    }
    if (w === 'base') {
      if (hemi) hemi.intensity = S.saved.hemi;
      if (spot) spot.shadow.intensity = S.saved.shadow;
      e.scene.environmentIntensity = S.saved.env;
    } else if (w === 'hemi4') {
      if (hemi) hemi.intensity = S.saved.hemi * 4;
    } else if (w === 'noshadow') {
      if (spot) spot.shadow.intensity = 0;
    } else if (w === 'env4') {
      e.scene.environmentIntensity = (S.saved.env ?? 1) * 4;
    }
    return { hemi: hemi ? +hemi.intensity.toFixed(3) : null,
      shadowI: spot ? spot.shadow.intensity : null,
      env: e.scene.environmentIntensity, arm: w };
  }, which);

  /**
   * PARK (sim running) -> settle -> hold -> base capture -> arm captures -> release.
   * All captures of one station share one hold, so `renderScale` is identical across the arms
   * and the only thing that moved is the uniform the arm names.
   */
  const station = async (tag, arms) => {
    await wait(45);                        // let the boom ARRIVE with the sim RUNNING
    const pinned = await hold(page);
    note(`${tag} hold ${JSON.stringify(pinned.pinned ?? pinned)}`);
    await wait(4);
    const shots = {};
    for (const a of arms) {
      const st = await arm(a);
      await wait(6);
      shots[a] = await snap(`${tag}-${a}`);
      await shot(`dark1-${tag}-${a}`);
      note(`${tag} arm ${a}: ${JSON.stringify(st)}`);
    }
    await arm('base');
    await release(page);
    const dec = {};
    for (const k of Object.keys(shots)) { try { dec[k] = shots[k] ? decodePng(shots[k]) : null; } catch { dec[k] = null; } }
    return dec;
  };

  const verdict = (tag, base, armImg, armName) => {
    if (!base || !armImg) { note(`${tag}/${armName}: no capture`); return null; }
    const s = split(base, armImg);
    const dLift = s.darkArm - s.darkBase, lLift = s.litArm - s.litBase;
    note(`${tag} ${armName.padEnd(9)} DARK(<18) n=${s.darkN} ${s.darkBase.toFixed(2)} -> ${s.darkArm.toFixed(2)} (${dLift >= 0 ? '+' : ''}${dLift.toFixed(2)})`
      + ` · LIT(>60) n=${s.litN} ${s.litBase.toFixed(1)} -> ${s.litArm.toFixed(1)} (${lLift >= 0 ? '+' : ''}${lLift.toFixed(1)})`
      + ` · mid Δ ${s.midDelta.toFixed(2)}`);
    return { dLift, lLift, s };
  };

  // ================================================================== A. the service passage
  const okA = await place('service.mid', 0);
  note(`service.mid ${JSON.stringify(okA)}`);
  if (!okA.ok) { skip('the service passage is reachable', okA.why); }
  else {
    const A = await station('svc', ['base', 'hemi4', 'noshadow', 'env4']);
    const vH = verdict('svc', A.base, A.hemi4, 'hemi4');
    const vS = verdict('svc', A.base, A.noshadow, 'noshadow');
    const vE = verdict('svc', A.base, A.env4, 'env4');
    if (vS && vS.dLift > 6 && vS.dLift > (vH?.dLift ?? 0)) {
      pass('the service wedges are SHADOW', `killing the shadow term lifts the dark population by ${vS.dLift.toFixed(1)} against the hemisphere's ${(vH?.dLift ?? 0).toFixed(1)}`);
    } else if (vH && vH.dLift > 4) {
      pass('the service wedges are LIT-BUT-DARK', `hemisphere x4 lifts the dark population by ${vH.dLift.toFixed(1)}`);
    } else {
      note('svc: neither arm moved the dark population — look at the pictures');
    }
  }

  // ================================================================== B. the boarding
  const boarded = census.plan.filter((p) => p.boards);
  const chained = census.plan.filter((p) => p.chain);
  note(`boarded panels: ${boarded.map((p) => p.id).join(' ') || '(none)'}`);
  note(`chained panels: ${chained.map((p) => p.id).join(' ') || '(none)'}`);
  const target = boarded.find((p) => p.space) ?? chained.find((p) => p.space) ?? null;
  if (!target) { skip('a dressed panel exists', 'no panel wears boards or a chain'); }
  else {
    const st = await parkPanel(target.id, 3.4, 0);
    note(`parked for ${target.id}: ${JSON.stringify(st)}`);
    const B = await station(`board-${target.id.replace(/\./g, '_')}`, ['base', 'hemi4', 'noshadow']);
    const r = await panelRects(target.id);
    const bh = B.base;
    if (bh) {
      const sx = bh.width / r.screen.w, sy = bh.height / r.screen.h;
      for (const k of ['base', 'hemi4', 'noshadow']) {
        if (!B[k]) continue;
        const f = rectLuma(B[k], r.face, sx, sy);
        const l = rectLuma(B[k], r.left, sx, sy);
        const rr = rectLuma(B[k], r.right, sx, sy);
        note(`board ${k.padEnd(9)} FACE ${f.mean.toFixed(1)} (${f.px} px) · wall L ${l.mean.toFixed(1)} · wall R ${rr.mean.toFixed(1)}`);
      }
      const f0 = rectLuma(B.base, r.face, sx, sy).mean;
      const f4 = B.hemi4 ? rectLuma(B.hemi4, r.face, sx, sy).mean : null;
      const w0 = (rectLuma(B.base, r.left, sx, sy).mean + rectLuma(B.base, r.right, sx, sy).mean) / 2;
      const w4 = B.hemi4 ? (rectLuma(B.hemi4, r.left, sx, sy).mean + rectLuma(B.hemi4, r.right, sx, sy).mean) / 2 : null;
      if (f4 != null && w4 != null) {
        note(`INVARIANCE  face ${f0.toFixed(1)} -> ${f4.toFixed(1)} (${(f4 - f0).toFixed(1)}) · wall ${w0.toFixed(1)} -> ${w4.toFixed(1)} (${(w4 - w0).toFixed(1)})`);
        if ((f4 - f0) < (w4 - w0) * 0.25) {
          pass('the boarding is NOT BEING LIT', `face +${(f4 - f0).toFixed(1)} against the wall's +${(w4 - w0).toFixed(1)} under the same x4 hemisphere`);
        } else {
          pass('the boarding IS lit and merely dark', `face +${(f4 - f0).toFixed(1)} against the wall's +${(w4 - w0).toFixed(1)}`);
        }
      }
    }
    for (const [u, v] of [[0.5, 0.5], [0.5, 0.28], [0.35, 0.62]]) {
      const h = await who(target.id, u, v);
      note(`who ${target.id} uv ${u},${v} px ${h.px.join(',')} — ${h.total} intersections`);
      for (const x of h.list) {
        note(`    ${x.drawn ? 'DRAWN  ' : 'dropped'} d=${String(x.dist).padStart(7)} ${x.front ? 'front' : 'back '} side=${x.side} ${x.name} [${String(x.mat).slice(0, 44)}]`);
      }
    }
  }

  await arm('base');
  pass('recon complete', 'see the notes');
}
