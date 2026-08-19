/**
 * 🔬 **ROUND 10's ONE PAGE, ONE CRATER A/B.** Two questions, both of them the round's whole scope:
 *
 *   🐞 **the white island** — `critic-dig-6` confirmed it in 8 of 21 evidence frames. Round 9
 *      named the march's `_par` clamp as the one untested candidate; it is a uniform now
 *      (`uParMax`), so it is an arm. The refuted candidates are NOT re-derived here — this run
 *      adds the clamp, the surface jag term (which is added AFTER `_rrrOrder`'s clamp and can
 *      therefore push a texel's order past 1), a per-layer hide, and a census of the DEPTH FIELD
 *      itself inside the crater, because round 9's pit test only looked for holes deeper than
 *      0.55 around a centre under 0.30 and a texel at depth 0.95 in a field of 1.0 is neither.
 *
 *   🧱 **the cyan core** — `uCore`, the back slice of the innermost layer's section painted in
 *      the structure's own colour, with a hard step between a lit top face and a shaded side
 *      face. Arms sweep the width and the two-tone multiplier, and the measurement is the one the
 *      deliverable turns on: how many DISTINCT FLAT TEAL VALUES with real area the frame carries.
 *
 * ⚠️ **THE ARMS ARE UNIFORMS, SET LIVE, IN ONE PAGE, ON ONE CRATER**, exactly as
 * `_chunks11-secab.mjs` does it — `applyBreakMask` puts the same uniform objects on the material
 * and on the compiled shader, so writing the value IS the arm. No rebuild, no second dig.
 *
 *   RRR_MODE=island|core|both   (default both)
 *   RRR_ISLAND=...|...          override the island arms
 *   RRR_CORE=...|...            override the core arms
 */

export default async function chunks12Ab({ page, note, pass, fail, skip, shot, snap }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  const MODE = process.env.RRR_MODE || 'both';
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
    const c = e.room.digCensus();
    return { ...c, seed: String(e.run?.seed ?? '') };
  });
  if (!head) { fail('the build is reachable', 'no engine.room.digCensus'); return; }
  if (head.mode !== 'free') { skip('A/B can run', `?dig=${head.mode}`); return; }
  note(`seed "${head.seed}" · ${head.freeFaces} free faces`);

  await page.evaluate(() => {
    const e = window.__rrr.engine;
    if (!e.hunter) return;
    e.hunter.update = () => {};
    e.hunter.vel?.set?.(0, 0, 0);
    if (e.room?.spawn?.hunter) e.hunter.root.position.copy(e.room.spawn.hunter);
    e.hunter.state = 'PATROL'; e.hunter.target = null; e.hunter.awareness = 0;
    e.hunter.breachTarget = null; e.hunter.resetCombat?.();
    for (const s of ['shoulderR', 'shoulderL', 'hipR', 'hipL']) {
      if (e.player.rig?.occupant?.(s) === 'empty') e.player.rig.refit?.(s);
    }
  });

  const park = (pid, cu, mode, along, out, pitch = null, cv = 0.45) => page.evaluate(
    ([id, u, m, a, o, pi, v]) => {
      const e = window.__rrr.engine;
      const p = e.room.panelOf(id);
      if (!p) return null;
      const c = p.pointAt(u, v);
      const n = { x: Math.sin(p.rotY), z: Math.cos(p.rotY) };
      const t = { x: Math.cos(p.rotY), z: -Math.sin(p.rotY) };
      const legal = (x, z) => {
        if (!e.room.spaceAt) return true;
        const s = e.room.spaceAt({ x, y: e.room.floorY + 1, z }, -0.35);
        return !!s;
      };
      let k = 1, ok = false, px = 0, pz = 0;
      for (; k > 0.08; k -= 0.07) {
        px = c.x + n.x * o * k + t.x * a * k;
        pz = c.z + n.z * o * k + t.z * a * k;
        if (legal(px, pz)) { ok = true; break; }
      }
      let fx = -n.x, fz = -n.z;
      if (m === 'graze') {
        const tx = c.x + n.x * 0.06, tz = c.z + n.z * 0.06;
        const dx = tx - px, dz = tz - pz;
        const L = Math.hypot(dx, dz) || 1;
        fx = dx / L; fz = dz / L;
      }
      e.player.pos.set(px, e.room.floorY, pz);
      e.player.vel.set(0, 0, 0);
      e.player.facing = Math.atan2(fx, fz);
      const dist = Math.hypot(c.x - px, c.z - pz) || 1;
      const eye = e.room.floorY + (e.cam?.height ?? 1.42);
      const autoPitch = Math.atan2(c.y - eye, dist);
      if (e.cam) {
        e.cam.yaw = e.player.facing;
        e.cam.pitch = pi === null ? autoPitch : pi;
        e.cam.distance = 0.05; e.cam.hardMin = 0.02; e.cam.pinchMin = 0.02;
        e.cam._first = true;
      }
      const dot = Math.abs(fx * n.x + fz * n.z);
      return { deg: +(Math.asin(Math.min(1, dot)) * 180 / Math.PI).toFixed(1), standable: ok };
    }, [pid, cu, mode, along, out, pitch, cv]);

  /**
   * Every number this run turns on, off one png: the island (blobs of non-teal fully inside the
   * teal field's bounding box), the outline's curvature (the raggedness `critic-dig-5` closed and
   * which nothing here may move), the section's width, and the teal's own value modes.
   */
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
      // --- islands
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
          if (!edge && size >= 60) {
            islands++; islandPx += size;
            if (size > biggest) { biggest = size; bbox = [bx0, by0, bx1, by1]; }
          }
        }
      }
      // --- outline curvature (must not move) and the section's width
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
      // --- the teal's own value modes: is the cyan one flat value or two?
      const buckets = new Map();
      let fam = 0, fy0 = H, fy1 = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const p = at(x, y);
        if (!isFam(p)) continue;
        fam++; if (y < fy0) fy0 = y; if (y > fy1) fy1 = y;
        const k = `${(p[0] / 6) | 0}|${(p[1] / 6) | 0}|${(p[2] / 6) | 0}`;
        const e = buckets.get(k) || { n: 0, r: 0, g: 0, b: 0, ys: 0 };
        e.n++; e.r += p[0]; e.g += p[1]; e.b += p[2]; e.ys += y; buckets.set(k, e);
      }
      const modes = [...buckets.values()].sort((p, q) => q.n - p.n).slice(0, 4).map((e) => ({
        rgb: [Math.round(e.r / e.n), Math.round(e.g / e.n), Math.round(e.b / e.n)],
        n: e.n, pct: +(e.n / Math.max(1, fam) * 100).toFixed(1),
        relY: fy1 > fy0 ? +((e.ys / e.n - fy0) / (fy1 - fy0)).toFixed(2) : -1,
      }));
      return {
        tealPx: tn, islands, islandPx, biggest, bbox,
        curve: n2 ? +(turn / n2).toFixed(2) : -1,
        section: runs.length ? runs[runs.length >> 1] : 0,
        crossings: runs.length,
        fam, modes,
      };
    }, [buf.toString('base64')]);
  };

  const setArm = (id, spec) => page.evaluate(([pid, s]) => {
    const p = window.__rrr.engine.room.panelOf(pid);
    if (!p) return null;
    const got = [];
    p.mats.forEach((m, i) => {
      const u = m?.userData?.breakUniforms;
      if (!u?.uOrderSoft) return;
      if (u.uJag.value0 === undefined) u.uJag.value0 = u.uJag.value;
      if (s.jag !== undefined) u.uJag.value = u.uJag.value0 * s.jag;
      if (s.parMax !== undefined && u.uParMax) u.uParMax.value = s.parMax;
      if (s.spentLo !== undefined && u.uSpent) u.uSpent.value.x = s.spentLo;
      if (s.orderTop !== undefined && u.uOrderTop) u.uOrderTop.value = s.orderTop;
      // 🧱 the core lives on the INNERMOST layer only: it is the back of the wall band, and
      // painting it on layers 0-2 would put the structure inside the plaster.
      if (u.uCore) {
        if (s.core !== undefined) u.uCore.value = (i === 3) ? s.core : 0;
        if (s.coreTopK !== undefined) u.uCoreTopK.value = s.coreTopK;
        if (s.coreUp !== undefined) u.uCoreUp.value = s.coreUp;
        if (s.coreK !== undefined) {
          if (!u.uCoreEmis.value0) u.uCoreEmis.value0 = u.uCoreEmis.value.clone();
          u.uCoreEmis.value.copy(u.uCoreEmis.value0).multiplyScalar(s.coreK);
        }
      }
      if (i === 3) {
        got.push(`par ${u.uParMax?.value.toFixed(2)} jag ${u.uJag.value.toFixed(3)} `
          + `core ${u.uCore?.value.toFixed(2)}/${u.uCoreTopK?.value.toFixed(2)}`);
      }
    });
    return got.join(' ');
  }, [id, spec]);

  // --------------------------------------------------------------- the crater
  const scored = [];
  for (const f of head.free.filter((x) => !x.link)) {
    const a = await park(f.id, 0.5, 'face', 0, 2.4);
    if (!a) continue;
    const g1 = await park(f.id, 0.46, 'graze', 2.50, 2.10, null, 0.44);
    const g2 = await park(f.id, 0.46, 'graze', -2.50, 2.10, null, 0.44);
    scored.push({ ...f, room: ((g1?.standable ? 1 : 0) + (g2?.standable ? 1 : 0)) / 2 });
  }
  let dud = scored.find((s) => s.room >= 0.9 && s.w >= 4.0) || scored.find((s) => s.w >= 4.0) || scored[0];
  if (!dud) { fail('a dud face was chosen', 'nothing scored'); return; }
  note(`A/B on ${dud.id} (w ${dud.w}m)`);

  const CU = 0.46, CV = 0.44;
  await page.evaluate((pid) => window.__rrr.engine.room.panelOf(pid)?.resetDamage(), dud.id);
  const cr = await page.evaluate(([pid, u0, v0, plan]) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(pid);
    let blows = 0;
    for (const [du, dv, count, power] of plan) {
      const u = Math.min(0.97, Math.max(0.03, u0 + du / p.width));
      const v = Math.min(0.94, Math.max(0.06, v0 + dv / p.height));
      for (let k = 0; k < count; k++) { p.applyHit(p.pointAt(u, v), power); blows++; }
    }
    const st = p.field.stats();
    return { blows, maxDepth: +st.maxDepth.toFixed(3), mean: +st.meanDepth.toFixed(3) };
  }, [dud.id, CU, CV, [
    [0.00, 0.00, 6, 1.00], [0.19, -0.13, 5, 1.00], [-0.16, 0.21, 5, 1.00], [0.04, 0.41, 4, 0.95],
    [0.53, 0.20, 4, 0.80], [-0.47, -0.29, 3, 0.74], [0.28, -0.54, 3, 0.70], [-0.34, 0.56, 3, 0.64],
    [0.79, -0.11, 2, 0.50], [-0.71, 0.34, 2, 0.44], [0.14, 0.79, 2, 0.40], [-0.09, -0.77, 2, 0.34],
    [1.04, 0.29, 1, 0.25], [-0.94, -0.34, 1, 0.22], [0.54, 0.93, 1, 0.20], [-0.53, -0.88, 1, 0.18],
  ]]);
  note(`crater: ${cr.blows} blows · maxDepth ${cr.maxDepth} · mean ${cr.mean}`);

  /**
   * 🐞 **THE DEPTH FIELD, CENSUSED THE WAY THE SHADER READS IT.** Round 9's pit test asked for a
   * cell under 0.30 ringed by cells over 0.55 and found none — but an island only needs a texel
   * whose band value is under `_rrrSpent`'s foot while its neighbours are at 1. So this counts
   * cells in the SHALLOW-BUT-NOT-EMPTY window, and how many of them are surrounded by fully dug
   * material, which is the actual precondition.
   */
  note(`   depth census: ${JSON.stringify(await page.evaluate((pid) => {
    const f = window.__rrr.engine.room.panelOf(pid).field;
    const { cols, rows, depth } = f;
    const at = (x, y) => depth[y * cols + x];
    let hi = 0, mid = 0, midRinged = 0, worstRun = 0;
    for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) {
      const v = at(x, y);
      if (v >= 0.999) { hi++; continue; }
      if (v < 0.60) continue;
      mid++;
      let ring = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        if (at(x + dx, y + dy) >= 0.999) ring++;
      }
      if (ring >= 6) { midRinged++; if (v > worstRun) worstRun = v; }
    }
    return { cols, rows, dugOut: hi, shallowInside: mid, ringedBySpent: midRinged, deepestRinged: +worstRun.toFixed(3) };
  }, dud.id))}`);

  await step(300);

  const runArms = async (label, arms, stations) => {
    for (const a of arms) {
      const spec = {};
      for (const kv of a.split(',')) { const [k, v] = kv.split('='); spec[k.trim()] = +v; }
      const got = await setArm(dud.id, spec);
      note(`--- ${label} ${a}   [${got}]`);
      for (const [sname, args] of stations) {
        await park(dud.id, CU, args[0], args[1], args[2], null, CV + (args[3] ?? 0));
        await step(22);
        const tag = `c12-${label}-${a.replace(/[^a-z0-9.]/gi, '')}-${sname}`;
        await shot(tag);
        const s = await stats(tag);
        if (!s) { note(`   ${sname}: no frame`); continue; }
        note(`   ${sname}: 🐞 islands ${s.islands} / ${s.islandPx}px (max ${s.biggest} @ ${JSON.stringify(s.bbox)})`
          + ` · teal ${s.tealPx} · curve ${s.curve} · section ${s.section}px (${s.crossings})`);
        note(`      🧱 teal modes: ${s.modes.map((m) => `(${m.rgb})${m.pct}%@y${m.relY}`).join(' ')}`);
      }
    }
  };

  const STATIONS = [
    ['graze', ['graze', 1.45, 0.62, 0.20]],
    ['headon', ['face', 0, 3.6, 0]],
    ['3q', ['graze', 2.50, 2.10, 0]],
  ];

  if (MODE === 'island' || MODE === 'both') {
    // 🐞 per-layer attribution first, on the shipped arm, at the station the island is worst at
    await park(dud.id, CU, 'graze', 1.45, 0.62, null, CV + 0.20);
    await step(22);
    const b0 = await stats('c12-attrib-base');
    note(`ATTRIB base: islands ${b0.islands} / ${b0.islandPx}px (max ${b0.biggest} @ ${JSON.stringify(b0.bbox)})`);
    for (const which of ['layer0', 'layer1', 'layer2', 'layer3', 'reveal', 'debris']) {
      await page.evaluate(([pid, w]) => {
        const q = window.__rrr.engine.room.panelOf(pid);
        if (w.startsWith('layer')) q.layers[+w.slice(5)].visible = false;
        else if (w === 'debris') {
          const d = window.__rrr.engine.debris;
          for (const k in (d?.pools || {})) { const m = d.pools[k].mesh; if (m) m.visible = false; }
        } else if (q[w]) q[w].visible = false;
      }, [dud.id, which]);
      await step(3);
      const ei = await stats(`c12-attrib-no-${which}`);
      await page.evaluate(([pid, w]) => {
        const q = window.__rrr.engine.room.panelOf(pid);
        if (w.startsWith('layer')) q.layers[+w.slice(5)].visible = true;
        else if (w === 'debris') {
          const d = window.__rrr.engine.debris;
          for (const k in (d?.pools || {})) { const m = d.pools[k].mesh; if (m) m.visible = true; }
        } else if (q[w]) q[w].visible = true;
      }, [dud.id, which]);
      note(`   hide ${which}: islands ${ei.islands} / ${ei.islandPx}px (max ${ei.biggest} @ ${JSON.stringify(ei.bbox)}) · teal ${ei.tealPx}`);
    }
    await step(3);
    const ISLAND = (process.env.RRR_ISLAND
      || 'parMax=8|parMax=2|parMax=0.7|parMax=0.2|jag=0|parMax=8,jag=1').split('|').map((s) => s.trim()).filter(Boolean);
    await runArms('isl', ISLAND, STATIONS.slice(0, 2));
    await setArm(dud.id, { parMax: 8, jag: 1 });
  }

  if (MODE === 'core' || MODE === 'both') {
    const CORE = (process.env.RRR_CORE
      || 'core=0|core=0.45,coreTopK=1|core=0.45,coreTopK=1.9|core=0.70,coreTopK=1.9,coreK=1.3')
      .split('|').map((s) => s.trim()).filter(Boolean);
    await runArms('core', CORE, STATIONS);
    await setArm(dud.id, { core: 0, coreTopK: 1 });
  }

  pass('the A/B ran', `${MODE} on ${dud.id}, one page, one crater`);
}
