/**
 * 🔎 **RECON — `dressfix-1`, 2026-08-15.** Two of John's playtest defects, both filed against a
 * GENERATED house, both claimed to live in `src/game/exterior.js`. This file measures the facts
 * before anything is changed; the gated instruments are `_dressfix1-dress.mjs` (defect 1) and
 * `_dressfix1-behind.mjs` (defect 2).
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_dressfix1-recon.mjs \
 *        --port 5511 --q "plan=gen&planseed=3&seed=s4"
 *
 * ⚠️ `--q`, NEVER `--extra`. ⚠️ `?plan=gen&planseed=N` is the generated house; `?estate=gen` is a
 * live defect that turns the whole art port off.
 *
 * ⚠️ **THE NUMBERS QUOTED IN `exterior.js`'s `dressfix-1` BLOCKS WERE TAKEN WITH THIS FILE ON THE
 * PRE-FIX TREE.** Both fixes have since landed, so a plain run now reports the FIXED build. Add
 * **`?dressscale=1&yardwide=0`** to reproduce what was measured: chain 6.95 m on `f.g10.0.b`,
 * boards 12.15 m on `f.g16.0.b`, and a ±6.0 m yard.
 *
 * WHAT IT ASKS
 *   R1  every panel in the house, its size, its authored dressing family and what it is wearing.
 *   R2  every `exterior.dress.*` instance, expanded through `instanceMatrix`, as a WORLD extent —
 *       so "how wide is the chain actually drawn" is a measurement and not a division.
 *   R3  the exterior sites, the yard spec each resolved to, and the live yard's colliders.
 *   R4  a body march outward through every envelope-facing wall, `room.collide(pos,0.34,1.70)`.
 */

const PAGE = `
  const E = () => window.__rrr.engine;
  const V3 = () => E().camera.position.constructor;
  const M4 = () => E().camera.matrixWorld.constructor;
`;

export default async function recon({ page, note, pass, fail, skip }) {
  const evalPage = (body) => page.evaluate(`(() => {\n${PAGE}\n${body}\n})()`);
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(400);

  // ------------------------------------------------------------------ R1 the panels
  const head = await evalPage(`
    const e = E();
    const x = e.exterior;
    const cen = x && x.census ? x.census() : null;
    const byId = new Map(cen ? cen.plan.map((r) => [r.id, r]) : []);
    const rows = e.room.panels.map((p) => {
      const d = byId.get(p.id) || {};
      return {
        id: p.id, w: +p.width.toFixed(3), h: +p.height.toFixed(3),
        dig: !!(p.spec && p.spec.dig), free: !!(p.spec && p.spec.free),
        site: !!(x && x.sites && x.sites.has(p.id)),
        chain: !!d.chain, boards: !!d.boards, mortar: !!d.mortar, seam: !!d.seam,
      };
    });
    const sp = e.room.spaces.map((s) => ({
      id: s.id, x0: +s.x0.toFixed(2), x1: +s.x1.toFixed(2), z0: +s.z0.toFixed(2), z1: +s.z1.toFixed(2),
      storey: s.storey,
    }));
    return {
      seed: String(e.run.seed), search: location.search,
      tells: cen && cen.tells, families: cen && cen.dressFamilies,
      dressMeshes: cen && cen.dressMeshes, dressCalls: cen && cen.dressCalls,
      panels: rows, spaces: sp,
      spawn: { x: +e.room.spawn.player[0].x.toFixed(2), z: +e.room.spawn.player[0].z.toFixed(2) },
    };
  `);
  note(`url ${head.search} · seed "${head.seed}" · tells=${head.tells} · families ${JSON.stringify(head.families)}`);
  note(`${head.spaces.length} spaces · ${head.panels.length} panels · dressMeshes ${head.dressMeshes} · dressCalls ${head.dressCalls}`);
  const wide = head.panels.slice().sort((a, b) => b.w - a.w);
  note(`widest panels: ${wide.slice(0, 8).map((p) => `${p.id} ${p.w}x${p.h}${p.chain ? ' CHAIN' : ''}${p.boards ? ' BOARDS' : ''}`).join(' | ')}`);
  const kinds = { free: 0, digbay: 0, site: 0, conn: 0 };
  for (const p of head.panels) kinds[p.free ? 'free' : p.dig ? 'digbay' : p.site ? 'site' : 'conn']++;
  note(`by kind: free ${kinds.free} · dig bay ${kinds.digbay} · exit site ${kinds.site} · interior connector ${kinds.conn}`);
  note(`chained ${head.panels.filter((p) => p.chain).length} · boarded ${head.panels.filter((p) => p.boards).length}`);

  // ------------------------------------------------------------------ R2 the dressing, as drawn
  const drawn = await evalPage(`
    const e = E(), Vec = V3(), Mat = M4();
    const out = [];
    e.scene.traverse((o) => {
      if (!o.isInstancedMesh) return;
      if (!String(o.name || '').startsWith('exterior.dress.')) return;
      const g = o.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox;
      const rows = [];
      const a = o.instanceMatrix.array;
      for (let i = 0; i < o.count; i++) {
        if (Math.hypot(a[i*16], a[i*16+1], a[i*16+2]) < 1e-6) continue;
        const m = new Mat().fromArray(a, i*16).premultiply(o.matrixWorld);
        let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9,z0=1e9,z1=-1e9;
        for (const px of [bb.min.x, bb.max.x]) for (const py of [bb.min.y, bb.max.y]) for (const pz of [bb.min.z, bb.max.z]) {
          const q = new Vec(px,py,pz).applyMatrix4(m);
          if (q.x<x0)x0=q.x; if (q.x>x1)x1=q.x; if (q.y<y0)y0=q.y; if (q.y>y1)y1=q.y; if (q.z<z0)z0=q.z; if (q.z>z1)z1=q.z;
        }
        const p = e.room.panels[i];
        rows.push({ i, panel: p ? p.id : '?', pw: p ? +p.width.toFixed(2) : null,
          span: +Math.max(x1-x0, z1-z0).toFixed(2), tall: +(y1-y0).toFixed(2),
          y0: +y0.toFixed(2), y1: +y1.toFixed(2) });
      }
      out.push({ name: o.name, visible: o.visible, geoW: +(bb.max.x-bb.min.x).toFixed(3),
        geoH: +(bb.max.y-bb.min.y).toFixed(3), live: rows.length, rows });
    });
    return out;
  `);
  for (const m of drawn) {
    note(`${m.name.padEnd(34)} geo ${m.geoW} x ${m.geoH} m · ${m.live} instances placed · visible=${m.visible}`);
    const big = m.rows.slice().sort((a, b) => b.span - a.span).slice(0, 4);
    for (const r of big) note(`    #${r.i} on ${r.panel} (panel ${r.pw} m) — drawn ${r.span} m wide x ${r.tall} m tall, y ${r.y0}..${r.y1}`);
  }

  // ------------------------------------------------------------------ R3 the yards
  const yards = await evalPage(`
    const e = E();
    const x = e.exterior;
    if (!x || !x.sites) return { err: 'no exterior sites' };
    const rows = [];
    for (const [id, s] of x.sites) {
      rows.push({ id, live: s.live, kind: s.spec.kind, x0: s.spec.x0, x1: s.spec.x1,
        depth: s.spec.depth, wallH: s.spec.wallH, solids: s.solids.length,
        panel: s.exit.panel.id, pw: +s.exit.panel.width.toFixed(2), ph: +s.exit.panel.height.toFixed(2),
        px: +s.exit.panel.root.position.x.toFixed(2), pz: +s.exit.panel.root.position.z.toFixed(2),
        outSign: s.exit.outSign });
    }
    const reg = e.room.exteriorSolids.map((b) => ({
      x: [+b.min.x.toFixed(2), +b.max.x.toFixed(2)],
      y: [+b.min.y.toFixed(2), +b.max.y.toFixed(2)],
      z: [+b.min.z.toFixed(2), +b.max.z.toFixed(2)],
    }));
    return { rows, reg, liveId: rows.filter((r) => r.live).map((r) => r.id) };
  `);
  if (yards.err) { note(yards.err); } else {
    note(`exit sites ${yards.rows.length} · live ${JSON.stringify(yards.liveId)}`);
    for (const r of yards.rows) {
      note(`  ${r.id.padEnd(14)} ${r.live ? 'LIVE ' : '     '}${r.kind.padEnd(7)} x ${r.x0}..${r.x1} depth ${r.depth} wallH ${r.wallH}`
        + ` · panel ${r.panel} ${r.pw}x${r.ph} at (${r.px},${r.pz}) outSign ${r.outSign}`);
    }
    note(`registered exterior colliders: ${yards.reg.length}`);
    for (const b of yards.reg) note(`  x ${b.x.join('..')}  y ${b.y.join('..')}  z ${b.z.join('..')}`);
  }

  // ------------------------------------------------------------------ R4 march a body outward
  const march = await evalPage(`
    const e = E(), Vec = V3();
    const R = 0.34, PASSH = 1.70, STEP = 0.03, N = 260;   // 7.8 m of travel
    const sp = e.room.spaces;
    let ex0=1e9, ex1=-1e9, ez0=1e9, ez1=-1e9;
    for (const s of sp) { if (s.x0<ex0)ex0=s.x0; if (s.x1>ex1)ex1=s.x1; if (s.z0<ez0)ez0=s.z0; if (s.z1>ez1)ez1=s.z1; }
    const EPS = 0.35;
    const run = (sx, sz, nx, nz) => {
      const pos = new Vec(sx, e.room.floorY, sz);
      let stuck = 0;
      for (let i = 0; i < N; i++) {
        const bx = pos.x, bz = pos.z;
        pos.x += nx * STEP; pos.z += nz * STEP;
        pos.copy(e.room.collide(pos, R, PASSH));
        const moved = Math.hypot(pos.x - bx, pos.z - bz);
        if (moved < STEP * 0.25) { stuck++; if (stuck > 8) break; } else stuck = 0;
      }
      return { x: +pos.x.toFixed(2), z: +pos.z.toFixed(2),
        d: +((pos.x - sx) * nx + (pos.z - sz) * nz).toFixed(2) };
    };
    const out = [];
    for (const s of sp) {
      const sides = [
        { side: 'x0', on: Math.abs(s.x0 - ex0) < EPS, n: [-1, 0], at: s.x0, lo: s.z0, hi: s.z1, axis: 'z' },
        { side: 'x1', on: Math.abs(s.x1 - ex1) < EPS, n: [ 1, 0], at: s.x1, lo: s.z0, hi: s.z1, axis: 'z' },
        { side: 'z0', on: Math.abs(s.z0 - ez0) < EPS, n: [0, -1], at: s.z0, lo: s.x0, hi: s.x1, axis: 'x' },
        { side: 'z1', on: Math.abs(s.z1 - ez1) < EPS, n: [0,  1], at: s.z1, lo: s.x0, hi: s.x1, axis: 'x' },
      ];
      for (const q of sides) {
        if (!q.on) continue;
        const L = q.hi - q.lo;
        if (L < 1.2) continue;
        for (let k = 1; k <= 7; k++) {
          const u = q.lo + L * (k / 8);
          const sx = q.axis === 'z' ? q.at - q.n[0] * 1.2 : u;
          const sz = q.axis === 'z' ? u : q.at - q.n[1] * 1.2;
          if (!e.room.spaceAt(new Vec(sx, 0, sz), 0)) continue;   // start must be INSIDE a room
          const r = run(sx, sz, q.n[0], q.n[1]);
          const past = +(r.d - 1.2).toFixed(2);
          out.push({ space: s.id, side: q.side, u: +u.toFixed(2), sx: +sx.toFixed(2), sz: +sz.toFixed(2),
            past, end: [r.x, r.z], outside: !e.room.spaceAt(new Vec(r.x, 0, r.z), 0) });
        }
      }
    }
    return { env: [+ex0.toFixed(2), +ex1.toFixed(2), +ez0.toFixed(2), +ez1.toFixed(2)], out };
  `);
  note('');
  note(`ENVELOPE x ${march.env[0]}..${march.env[1]}  z ${march.env[2]}..${march.env[3]}`);
  const leaks = march.out.filter((r) => r.past > 0.2);
  note(`marches at envelope walls: ${march.out.length} · GOT PAST (>0.20 m): ${leaks.length}`);
  for (const r of leaks) {
    note(`  🚨 ${r.space}.${r.side} at u ${r.u} — body ended ${r.past} m past the wall plane, at (${r.end[0]},${r.end[1]})`);
  }
  const worstBlocked = Math.max(...march.out.filter((r) => r.past <= 0.2).map((r) => r.past), -9);
  note(`worst PENETRATION among the blocked marches: ${worstBlocked} m`);

  pass('recon ran', `${head.panels.length} panels · ${march.out.length} marches`);
  void fail; void skip;
}
