/**
 * 🔬 **ROUND 10's TWO ARMS, ONE PAGE, ONE CRATER.**
 *
 *   🐞 `grainFloor` — the island's real cause (`damagefield.js` GRAIN_FLOOR). Each arm RE-DIGS
 *      the same crater from pristine, because the floor acts inside the brush.
 *   🧱 `core`       — the cyan structure seen in the shell's own section (`breakmask.js` uCore),
 *      swept live on the winning grain arm.
 *
 * ⚠️ **SETTLE 300 FRAMES AFTER EVERY RE-DIG.** The first version of this probe stepped 180 and
 * every head-on frame was a photograph of the dust cloud — the island counter read 30 300 px on
 * the SHIPPED arm, against 489 px on a settled frame of the identical state. That is the
 * instrument, and `_chunks11-secab.mjs` records being bitten by the same thing.
 */

const PLAN = [
  [0.00, 0.00, 6, 1.00], [0.19, -0.13, 5, 1.00], [-0.16, 0.21, 5, 1.00], [0.04, 0.41, 4, 0.95],
  [0.53, 0.20, 4, 0.80], [-0.47, -0.29, 3, 0.74], [0.28, -0.54, 3, 0.70], [-0.34, 0.56, 3, 0.64],
  [0.79, -0.11, 2, 0.50], [-0.71, 0.34, 2, 0.44], [0.14, 0.79, 2, 0.40], [-0.09, -0.77, 2, 0.34],
  [1.04, 0.29, 1, 0.25], [-0.94, -0.34, 1, 0.22], [0.54, 0.93, 1, 0.20], [-0.53, -0.88, 1, 0.18],
];

export default async function chunks12Final({ page, note, pass, fail, skip, shot, snap }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);
  const MODE = process.env.RRR_MODE || 'both';
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 30) => {
    const f0 = await frames();
    for (let i = 0; i < 400; i++) {
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

  const stats = async (tag) => {
    const buf = await snap(tag);
    if (!buf) return null;
    return page.evaluate(async ([b64]) => {
      const bin = atob(b64); const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([arr], { type: 'image/png' }));
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const g2 = c.getContext('2d', { willReadFrequently: true });
      g2.drawImage(bmp, 0, 0);
      const d = g2.getImageData(0, 0, bmp.width, bmp.height).data;
      const at = (x, y) => { const o = (y * bmp.width + x) * 4; return [d[o], d[o + 1], d[o + 2]]; };
      const lum = (p) => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
      const isTeal = (p) => p[2] >= 34 && p[2] > p[0] * 1.55 && p[1] > p[0] * 1.20;
      const isShell = (p) => p[0] > 118 && Math.abs(p[0] - p[1]) < 30 && Math.abs(p[1] - p[2]) < 38;
      const isCut = (p) => { const L = lum(p); return L > 18 && L < 116 && p[2] <= p[0] * 1.45; };
      const isFam = (p) => p[2] >= 40 && p[2] > p[0] * 1.30 && p[1] > p[0] * 1.05;
      const W = bmp.width, H = ((bmp.height * 0.86) | 0);
      const teal = new Uint8Array(W * H);
      let tn = 0, x0 = W, x1 = -1, y0 = H, y1 = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (isTeal(at(x, y))) { teal[y * W + x] = 1; tn++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      let islands = 0, islandPx = 0, biggest = 0, bbox = null;
      if (x1 > x0 + 8 && y1 > y0 + 8) {
        const seen = new Uint8Array(W * H); const stack = new Int32Array(W * H);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const i0 = y * W + x;
          if (teal[i0] || seen[i0]) continue;
          let sp = 0, size = 0, edge = false, bx0 = x, bx1 = x, by0 = y, by1 = y;
          stack[sp++] = i0; seen[i0] = 1;
          while (sp > 0 && size < 400000) {
            const i = stack[--sp];
            const cy = (i / W) | 0, cx = i - cy * W; size++;
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
          if (!edge && size >= 60) { islands++; islandPx += size; if (size > biggest) { biggest = size; bbox = [bx0, by0, bx1, by1]; } }
        }
      }
      const xs = [];
      for (let y = ((bmp.height * 0.04) | 0); y < bmp.height * 0.80; y++) {
        let hit = -1;
        for (let x = 2; x < W - 2; x++) if (isTeal(at(x, y)) && isTeal(at(x + 1, y)) && isTeal(at(x + 2, y))) { hit = x; break; }
        xs.push(hit);
      }
      let n2 = 0, turn = 0;
      for (let i = 1; i < xs.length - 1; i++) {
        if (xs[i - 1] < 0 || xs[i] < 0 || xs[i + 1] < 0) continue;
        n2++; turn += Math.abs(xs[i + 1] - 2 * xs[i] + xs[i - 1]);
      }
      const runs = [];
      for (let k = 1; k < 64; k++) {
        const y = ((bmp.height * 0.86) * k / 64) | 0;
        let run = 0, armed = false;
        for (let x = 1; x < W; x++) {
          const p = at(x, y);
          if (isShell(p)) { armed = true; run = 0; }
          else if (armed && isCut(p)) run++;
          else if (armed && isTeal(p)) { if (run > 0) runs.push(run); armed = false; run = 0; }
          else { armed = false; run = 0; }
        }
      }
      runs.sort((a, b) => a - b);
      /**
       * 🧱 **THE DELIVERABLE, AS A NUMBER: THE RIM'S TEAL AGAINST THE FILL'S TEAL.** A histogram
       * over the WHOLE teal family cannot see this — the fill is a hundred times the area of the
       * rim and buries it. So the family is split by DISTANCE FROM THE BOUNDARY: everything
       * within `RIM_PX` of a non-teal pixel is the section, everything more than `FILL_PX` away
       * is the slab's front face, and each is reported separately. Two flat values meeting at an
       * edge shows up as a rim mean that is plainly not the fill mean, with a real pixel count.
       *
       * The rim is binned by ORIENTATION too — which way the boundary faces at that pixel —
       * because "a lit top face and a darker shaded side face" is a claim about orientation and
       * one value all the way round is a painted band whatever its value is.
       */
      const RIM_PX = 6, FILL_PX = 26;
      const near = (x, y, r) => {
        for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) return true;
          if (!isFam(at(xx, yy))) return true;
        }
        return false;
      };
      const acc = () => ({ n: 0, r: 0, g: 0, b: 0 });
      const add = (a, p) => { a.n++; a.r += p[0]; a.g += p[1]; a.b += p[2]; };
      const out = (a) => (a.n ? { n: a.n, rgb: [Math.round(a.r / a.n), Math.round(a.g / a.n), Math.round(a.b / a.n)] } : { n: 0, rgb: null });
      const fill = acc(), rimUp = acc(), rimSide = acc(), rimDown = acc();
      let fam = 0;
      for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
        const p = at(x, y);
        if (!isFam(p)) continue;
        fam++;
        if (!near(x, y, RIM_PX)) { if (!near(x, y, FILL_PX)) add(fill, p); continue; }
        // outward direction: away from the teal, from a small mask gradient
        let gx = 0, gy = 0;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          if (isFam(at(xx, yy))) { gx -= dx; gy -= dy; }
        }
        const L = Math.hypot(gx, gy) || 1;
        const up = -gy / L;
        add(up > 0.45 ? rimDown : (up < -0.45 ? rimUp : rimSide), p);
      }
      return {
        tealPx: tn, islands, islandPx, biggest, bbox, fam,
        fill: out(fill), rimUp: out(rimUp), rimSide: out(rimSide), rimDown: out(rimDown),
        curve: n2 ? +(turn / n2).toFixed(2) : -1,
        section: runs.length ? runs[runs.length >> 1] : 0, crossings: runs.length,
      };
    }, [buf.toString('base64')]);
  };

  const dud = head.free.filter((x) => !x.link).find((f) => f.w >= 4.0) || head.free[0];
  const CU = 0.46, CV = 0.44;
  note(`round-10 sweep on ${dud.id} (w ${dud.w}m)`);

  const dig = (gf) => page.evaluate(([pid, u0, v0, plan, g]) => {
    const p = window.__rrr.engine.room.panelOf(pid);
    p.resetDamage();
    p.field.grainFloor = g;
    let blows = 0;
    for (const [du, dv, count, power] of plan) {
      const u = Math.min(0.97, Math.max(0.03, u0 + du / p.width));
      const v = Math.min(0.94, Math.max(0.06, v0 + dv / p.height));
      for (let k = 0; k < count; k++) { p.applyHit(p.pointAt(u, v), power); blows++; }
    }
    const f = p.field;
    let zeros = 0, pristineInside = 0;
    for (let y = 2; y < f.rows - 2; y++) for (let x = 2; x < f.cols - 2; x++) {
      const i = y * f.cols + x;
      if (f.depth[i] > 0.0001) continue;
      zeros++;
      let torn = 0;
      for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) if (f.depth[(y + dy) * f.cols + x + dx] >= 0.30) torn++;
      if (torn === 4) pristineInside++;
    }
    const st = f.stats();
    return { blows, zeros, pristineInside, maxDepth: +st.maxDepth.toFixed(3), mean: +st.meanDepth.toFixed(3) };
  }, [dud.id, CU, CV, PLAN, gf]);

  const setCore = (spec) => page.evaluate(([pid, s]) => {
    const p = window.__rrr.engine.room.panelOf(pid);
    p.mats.forEach((m, i) => {
      const u = m?.userData?.breakUniforms;
      if (!u?.uCore) return;
      if (s.core !== undefined) u.uCore.value = (i === 3) ? s.core : 0;
      if (s.coreTopK !== undefined) u.uCoreTopK.value = s.coreTopK;
      if (s.coreUp !== undefined) u.uCoreUp.value = s.coreUp;
      if (s.coreK !== undefined) {
        if (!u.uCoreEmis.value0) u.uCoreEmis.value0 = u.uCoreEmis.value.clone();
        u.uCoreEmis.value.copy(u.uCoreEmis.value0).multiplyScalar(s.coreK);
      }
    });
    const u3 = p.mats[3].userData.breakUniforms;
    return `core ${u3.uCore.value.toFixed(2)} topK ${u3.uCoreTopK.value.toFixed(2)} emis ${u3.uCoreEmis.value.toArray().map((v) => v.toFixed(2))}`;
  }, [dud.id, spec]);

  const STATIONS = [
    ['headon', 'face', 0, 3.6, 0],
    ['graze', 'graze', 1.45, 0.62, 0.20],
    ['3q', 'graze', 2.50, 2.10, 0],
  ];
  const shootAll = async (prefix, which = STATIONS) => {
    for (const [sname, mode, along, out, dv] of which) {
      await park(dud.id, CU, mode, along, out, CV + dv);
      await step(24);
      const tag = `${prefix}-${sname}`;
      await shot(tag);
      const s = await stats(tag);
      if (!s) { note(`   ${sname}: no frame`); continue; }
      note(`   ${sname}: 🐞 islands ${s.islands}/${s.islandPx}px (max ${s.biggest} @ ${JSON.stringify(s.bbox)})`
        + ` · teal ${s.tealPx} · curve ${s.curve} · section ${s.section}px`);
      note(`      🧱 fill (${s.fill.rgb})x${s.fill.n} · rim UP-facing/sill (${s.rimUp.rgb})x${s.rimUp.n}`
        + ` · rim SIDE (${s.rimSide.rgb})x${s.rimSide.n} · rim DOWN-facing/soffit (${s.rimDown.rgb})x${s.rimDown.n}`);
    }
  };

  if (MODE === 'grain' || MODE === 'both') {
    for (const gf of (process.env.RRR_GRAIN || '0|0.18|0.28|0.45').split('|').map(Number)) {
      const info = await dig(gf);
      await step(300);
      note(`--- grainFloor ${gf}: ${info.blows} blows · maxDepth ${info.maxDepth} · mean ${info.mean}`
        + ` · pristine cells ${info.zeros} · pristine-but-ringed ${info.pristineInside}`);
      await shootAll(`c12-gf${String(gf).replace('.', '')}`, STATIONS.slice(0, 2));
    }
  }

  if (MODE === 'core' || MODE === 'both') {
    const info = await dig(+(process.env.RRR_GF ?? 0.28));
    await step(300);
    note(`=== core arms on grainFloor ${process.env.RRR_GF ?? 0.28}: ${info.blows} blows, maxDepth ${info.maxDepth}`);
    for (const a of (process.env.RRR_CORE
      || 'core=0|core=0.45,coreTopK=1,coreK=1|core=0.45,coreTopK=1.9,coreK=1|core=0.70,coreTopK=1.9,coreK=1.35')
      .split('|').map((s) => s.trim()).filter(Boolean)) {
      const spec = {};
      for (const kv of a.split(',')) { const [k, v] = kv.split('='); spec[k.trim()] = +v; }
      note(`--- ${a}   [${await setCore(spec)}]`);
      await shootAll(`c12-${a.replace(/[^a-z0-9.]/gi, '')}`);
    }
    await setCore({ core: 0, coreTopK: 1, coreK: 1 });
  }
  pass('the round-10 sweep ran', `${MODE} on ${dud.id}`);
}
