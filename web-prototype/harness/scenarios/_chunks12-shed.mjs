/**
 * 🐞 **THE ISLAND IS A PIT IN `depth` AFTER ALL, AND ROUND 9's CENSUS ASKED THE WRONG QUESTION.**
 *
 * `_chunks12-island.mjs` picked the blob with a camera->pixel raycast and read the damage field at
 * the winning uv: **raw depth 0** at the island's own cell, against neighbours at 0.17 / 0.40 /
 * 0.57 / 0.84. It is undug wall. Round 9's pit census required the whole ring at radius r to be
 * past **0.55** and found none — true, and the wrong bar: the white shell's silhouette has gone
 * long before 0.55, so a plate can look completely detached (teal all round it) while the field
 * still calls it supported. `SHED_AT` is calibrated against "nearly through the wall"; the eye is
 * calibrated against "the white has gone".
 *
 * So this sweeps the rule that was built for exactly this and shipped inert: `SHED_R` (the
 * closing's radius in cells) and `SHED_AT` (how dug a neighbour must be to count as gone), both
 * instance fields now. Each arm RE-DIGS the same crater from pristine, because `_shed()` writes
 * `depth` and the pass has to run during the dig, not after it.
 *
 * ⚠️ **THE THING THIS MUST NOT MOVE is the outline's raggedness** — `critic-dig-5` logged it as
 * done and every previous island fix died on it. Reported per arm as the outline's mean second
 * difference, alongside the island.
 */

const PLAN = [
  [0.00, 0.00, 6, 1.00], [0.19, -0.13, 5, 1.00], [-0.16, 0.21, 5, 1.00], [0.04, 0.41, 4, 0.95],
  [0.53, 0.20, 4, 0.80], [-0.47, -0.29, 3, 0.74], [0.28, -0.54, 3, 0.70], [-0.34, 0.56, 3, 0.64],
  [0.79, -0.11, 2, 0.50], [-0.71, 0.34, 2, 0.44], [0.14, 0.79, 2, 0.40], [-0.09, -0.77, 2, 0.34],
  [1.04, 0.29, 1, 0.25], [-0.94, -0.34, 1, 0.22], [0.54, 0.93, 1, 0.20], [-0.53, -0.88, 1, 0.18],
];

export default async function chunks12Shed({ page, note, pass, fail, skip, shot, snap }) {
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
      const isTeal = (p) => p[2] >= 34 && p[2] > p[0] * 1.55 && p[1] > p[0] * 1.20;
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
      return { tealPx: tn, islands, islandPx, biggest, bbox, curve: n2 ? +(turn / n2).toFixed(2) : -1 };
    }, [buf.toString('base64')]);
  };

  const dud = head.free.filter((x) => !x.link).find((f) => f.w >= 4.0) || head.free[0];
  const CU = 0.46, CV = 0.44;
  note(`shed sweep on ${dud.id} (w ${dud.w}m)`);

  const dig = (shedR, shedAt) => page.evaluate(([pid, u0, v0, plan, sr, sa]) => {
    const p = window.__rrr.engine.room.panelOf(pid);
    p.resetDamage();
    p.field.shedR = sr; p.field.shedAt = sa;
    for (const [du, dv, count, power] of plan) {
      const u = Math.min(0.97, Math.max(0.03, u0 + du / p.width));
      const v = Math.min(0.94, Math.max(0.06, v0 + dv / p.height));
      for (let k = 0; k < count; k++) p.applyHit(p.pointAt(u, v), power);
    }
    const f = p.field;
    // how many cells are STRANDED: undug, with a ring of clearly-torn material round them
    let stranded = 0;
    for (let y = 2; y < f.rows - 2; y++) for (let x = 2; x < f.cols - 2; x++) {
      if (f.depth[y * f.cols + x] > 0.30) continue;
      let ring = 0, tot = 0;
      for (let k = -2; k <= 2; k++) {
        for (const [ax, ay] of [[x + k, y - 2], [x + k, y + 2], [x - 2, y + k], [x + 2, y + k]]) {
          tot++; if (f.depth[ay * f.cols + ax] >= 0.30) ring++;
        }
      }
      if (ring === tot) stranded++;
    }
    return { shedPits: f.shedPits, shedRaised: f.shedRaised, stranded, maxDepth: +f.stats().maxDepth.toFixed(3) };
  }, [dud.id, CU, CV, PLAN, shedR, shedAt]);

  /**
   * 🔎 THE CELL ITSELF: what the grain map says at the island, and whether a blow aimed straight
   * at it can take it. A cell only takes material from a blow centred inside `BRUSH_R - grain`,
   * so a hard plate at the cap (0.115 * 1.75 = 0.201 m against a 0.52 m brush) needs the blow
   * within 32 cm — which a sparse plan can miss and a player usually would not.
   */
  const cellReport = (u, v) => page.evaluate(([pid, uu, vv]) => {
    const p = window.__rrr.engine.room.panelOf(pid);
    const f = p.field;
    const cx = Math.floor(uu * f.cols), cy = Math.floor(vv * f.rows);
    const grid = [];
    for (let y = cy - 2; y <= cy + 2; y++) {
      const row = [];
      for (let x = cx - 2; x <= cx + 2; x++) {
        const i = y * f.cols + x;
        row.push(`${f.depth[i].toFixed(2)}/${(f.grain?.[i] ?? 0).toFixed(3)}`);
      }
      grid.push(row.join(' '));
    }
    const before = f.depth[cy * f.cols + cx];
    // aim straight at it
    const after = [];
    for (let k = 0; k < 4; k++) {
      p.applyHit(p.pointAt(uu, vv), 1.0);
      after.push(+f.depth[cy * f.cols + cx].toFixed(3));
    }
    return { cell: [cx, cy], brushR: f.brush?.radius, grid, before: +before.toFixed(3), after };
  }, [dud.id, u, v]);

  const ARMS = (process.env.RRR_SHED || '0,0.55|2,0.55|2,0.30|2,0.22|3,0.30')
    .split('|').map((s) => s.trim()).filter(Boolean);
  for (const a of ARMS) {
    const [sr, sa] = a.split(',').map(Number);
    const info = await dig(sr, sa);
    await step(180);
    note(`--- shedR ${sr} shedAt ${sa}: pits ${info.shedPits} raised ${info.shedRaised} · `
      + `stranded cells ${info.stranded} · maxDepth ${info.maxDepth}`);
    for (const [sname, mode, along, out] of [['headon', 'face', 0, 3.6], ['graze', 'graze', 1.45, 0.62]]) {
      await park(dud.id, CU, mode, along, out, CV + (sname === 'graze' ? 0.20 : 0));
      await step(22);
      const tag = `c12-shed-${sr}-${String(sa).replace('.', '')}-${sname}`;
      await shot(tag);
      const s = await stats(tag);
      note(`   ${sname}: 🐞 islands ${s.islands} / ${s.islandPx}px (max ${s.biggest} @ ${JSON.stringify(s.bbox)})`
        + ` · teal ${s.tealPx} · curve ${s.curve}`);
    }
  }

  // back to the shipped arm, then interrogate the cell the pick found
  await dig(0, 0.55);
  await step(120);
  const cr = await cellReport(0.3315, 0.456);
  note(`island cell ${JSON.stringify(cr.cell)} · brush R ${cr.brushR} · depth ${cr.before} -> aimed blows ${JSON.stringify(cr.after)}`);
  for (const row of cr.grid) note(`   depth/grain  ${row}`);
  pass('the shed sweep ran', `${ARMS.length} arms on ${dud.id}`);
}
