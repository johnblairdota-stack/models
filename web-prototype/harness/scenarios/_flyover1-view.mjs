/**
 * 🛩️ _flyover1-view.mjs — THE FLY-OVER: IS IT LEGIBLE, WHAT DOES IT COST, AND WHAT DID IT MOVE?
 *
 * `flyover-1`, 2026-08-15. The gate for `[F]` in `src/views/game.js` and `room.setLid()` in
 * `src/game/room.js`.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_flyover1-view.mjs \
 *        --port 5520 --q "plan=gen&planseed=0&planrooms=3"     # the shipped generated house
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_flyover1-view.mjs \
 *        --port 5520 --q "plan=gen&planseed=0&planrooms=6"     # the old, bigger generated house
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_flyover1-view.mjs \
 *        --port 5520 --q "seed=s4"                             # the AUTHORED house, for reference
 *
 * ⚠️ **`--q`, NEVER `--extra`** (HANDOFF's hazard list): `playtest.mjs` and every scenario take
 * `--q`; the wrong flag is silently ignored and the run happens on the default arm.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT ASKS, IN THE ORDER THE ANSWERS MATTER
 * ---------------------------------------------------------------------------------------------
 * **L — the roof came off and NOTHING ELSE DID.** `setLid` writes `visible` on merged ceiling
 * meshes. HANDOFF: *"`collide`, `castRay`, `blocksSight`, `portals()` and `update()` ignore
 * visibility entirely; every collider in the house is always live"* — and a hidden room whose
 * colliders went with it would sail the camera boom into an invisible wall and black the frame.
 * L2 floods the real `room.collide()` over the whole envelope on both arms and requires the two
 * result sets to be identical to the millimetre. L3 does the same for `portals()`, `castRay()`
 * and `blocksSight()`.
 *
 * **A — the draw calls.** A fly-over shows every space at once, which is a number nothing in play
 * ever asks for, and it is ACCEPTABLE for it to exceed the 625 budget — it is a tool, not
 * gameplay. What is NOT acceptable is moving the count during normal play. So the arm is flipped
 * **IN PLACE AT ONE PARKED STATION**, never across a walk (HANDOFF, `dressbin-1`: `ballroom.centre`
 * read **423 / 461 / 479** on one build, seed and station), and the two OFF reads either side of
 * the flip must be identical.
 *
 * **F — can a pixel test work in this frame?** The reason this slice exists. `dressfix-1` measured
 * `px>16` BLIND in a generated house: mean frame luma **6.65 of 255**, a 26 m chain reading **8
 * pixels**. F1 reports the luma histogram of the in-house frame and of the fly-over frame at the
 * same station, and F3 then runs a real A/B — the roof back ON against the roof OFF, from the
 * fly-over camera, inside ONE frozen page — at **px>16**. If that A/B is legible at 16 in a
 * generated house, the fly-over is a view the project's own standard threshold works in, which is
 * the whole of problem 1. If it is not, this file says so in those words.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 EVERY ASSERTION SHIPS A CONTROL THAT MUST FAIL, AND EVERY CONTROL RUNS ON EVERY RUN
 * ---------------------------------------------------------------------------------------------
 *   C1  THE OFF ARM IS NOT ALREADY THE ON ARM. With `[F]` off, residency must resolve FEWER
 *       spaces than the house has and the lid must be hidden on NONE of them. Without this,
 *       "every space is resident and every ceiling is hidden" is a sentence about a house that
 *       was always like that, and A1 would pass on a build where `[F]` did nothing at all.
 *   C2  THE COLLIDER COMPARISON CAN SEE A DIFFERENCE. The same comparator is run a third time
 *       against a probe set with ONE point displaced by 1.0 m, and it must report a DIFFERENCE.
 *       L2's zero is worth nothing unless the thing producing it is capable of a non-zero.
 *   C3  THE FLIP REALLY CHANGED THE SCENE. If the fly-over's draw-call count equals the parked
 *       count, the flip did nothing and A2's "the two OFF reads agree" is the trivial truth that
 *       nothing ever happened.
 *   C4  THE PIXEL FLOOR IS A FLOOR, NOT A DEAD CAMERA. `still.mjs`'s own reintroduction handle:
 *       the two frame dithers are UNPINNED and the same-config pair re-measured at `px>2`. It
 *       must go non-zero. A frozen page that returns 0.00% because the renderer stopped is
 *       indistinguishable from one that returns 0.00% because the hold works — except by this.
 *       ⚠️ Measured at **px>2**, not 16: grain is 0.024, i.e. ±3 of 255, and `still.mjs` records
 *       it moving under 1% of pixels past `d>8`. A `px>16` control here would fail to fail.
 *
 * ⚠️ **THE THRESHOLD USED FOR EACH CLAIM IS STATED WITH IT AND THEY ARE NOT THE SAME NUMBER.**
 * That is deliberate and it is this slice's own subject: 16 is the project's look threshold and
 * is what F3 must survive; 2 is what a *floor* has to be measured at to be a floor at all.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { decodePng } from '../pxdiff.mjs';
import { hold, release, unpinDithers } from '../still.mjs';

/** Luminance histogram of a decoded frame — the answer to "can a pixel test work in here". */
function luma(img) {
  const ch = img.channels, d = img.data, n = img.width * img.height;
  const hist = new Uint32Array(256);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const j = i * ch;
    const L = Math.min(255, Math.round(0.2126 * d[j] + 0.7152 * d[j + 1] + 0.0722 * d[j + 2]));
    hist[L]++; sum += L;
  }
  const pct = (p) => {
    let seen = 0, want = n * p;
    for (let v = 0; v < 256; v++) { seen += hist[v]; if (seen >= want) return v; }
    return 255;
  };
  const above = (t) => { let k = 0; for (let v = t + 1; v < 256; v++) k += hist[v]; return k / n; };
  /**
   * 🎯 **AND THE SAME STATISTIC OVER THE LIT PIXELS ONLY, BECAUSE A FLY-OVER FRAME IS BIMODAL.**
   * A top-down of a house is the house plus the void around it, and the void is exact black. A
   * whole-frame median therefore reports how much empty ground is in shot, not how legible the
   * building is — which is the same "the statistic describes the room instead of the change"
   * failure `_calls1-look.mjs` records for bounding boxes. `litMedian` is the median over pixels
   * above 2, i.e. over the thing being looked at.
   */
  let lit = 0; for (let v = 3; v < 256; v++) lit += hist[v];
  const litPct = (p) => { let seen = 0; const want = lit * p;
    for (let v = 3; v < 256; v++) { seen += hist[v]; if (seen >= want) return v; } return 255; };
  return { n, mean: +(sum / n).toFixed(2), p10: pct(0.10), median: pct(0.50), p90: pct(0.90),
    over2: +(above(2) * 100).toFixed(2), over16: +(above(16) * 100).toFixed(2),
    over32: +(above(32) * 100).toFixed(2),
    litFrac: +((lit / n) * 100).toFixed(2), litMedian: lit ? litPct(0.50) : 0,
    litOver16: lit ? +(((above(16) * n) / lit) * 100).toFixed(2) : 0 };
}

/** Fraction of pixels whose max channel delta exceeds `t`. The project's own look statistic. */
function moved(A, B, t) {
  if (!A || !B || A.width !== B.width || A.height !== B.height) return null;
  const ch = A.channels, n = A.width * A.height;
  let k = 0;
  for (let i = 0; i < n; i++) {
    const j = i * ch;
    let m = 0;
    for (let c = 0; c < 3; c++) { const d = Math.abs(A.data[j + c] - B.data[j + c]); if (d > m) m = d; }
    if (m > t) k++;
  }
  return { px: k, pct: +((k / n) * 100).toFixed(4) };
}

export default async function flyover({ page, snap, pass, fail, skip, note, SHOTDIR, VIEW }) {
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 200; i++) {
      await page.waitForTimeout(40);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };
  const wait = async (n) => { for (let i = 0; i < n; i++) await page.waitForTimeout(40); };
  mkdirSync(SHOTDIR, { recursive: true });
  const keep = (tag, buf) => {
    if (!buf) return null;
    const p = path.join(SHOTDIR, `${VIEW}.${tag}.png`);
    writeFileSync(p, buf);
    return p;
  };

  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  const reach = await page.evaluate(() => typeof window.__rrr?.flyover === 'function');
  if (!reach) {
    skip('the fly-over is reachable', 'window.__rrr.flyover is not a function on this build');
    return;
  }

  // ---- park. A generated house has no authored anchors, so the spawn is the only named point
  // every arm shares. ONE station, and the arm is flipped in place on it.
  const head = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const s = e.room.spawn.player[0];
    e.player.pos.set(s.x, e.room.floorY, s.z);
    e.player.vel.set(0, 0, 0);
    e.cam._first = true;
    const b = e.room.bounds;
    return {
      spaces: e.room.spaces.length,
      ids: e.room.spaces.map((x) => x.id),
      span: [+(b.maxX - b.minX).toFixed(2), +(b.maxZ - b.minZ).toFixed(2)],
      panels: e.room.panels.length,
      station: [+s.x.toFixed(2), +s.z.toFixed(2)],
    };
  });
  await step(40);
  note(`house: ${head.spaces} spaces (${head.ids.join(', ')}) · envelope ${head.span[0]} x ${head.span[1]} m`
    + ` · ${head.panels} panels · parked at ${head.station[0]}, ${head.station[1]}`);

  // =============================================================================== A1 / C1
  const off0 = await page.evaluate(() => {
    const e = window.__rrr.engine;
    return { ...window.__rrr.flyover(), calls: e.renderer.info.render.calls,
      tris: e.renderer.info.render.triangles, resident: e.room.visibleSpaces() };
  });
  const c1ok = off0.resident < head.spaces && (off0.lid?.on === true);
  c1ok
    ? pass('C1 CONTROL — with [F] off the house is NOT already a fly-over',
      `resident ${off0.resident} of ${head.spaces} spaces · lid on`)
    : fail('C1 CONTROL — with [F] off the house is NOT already a fly-over',
      `resident ${off0.resident} of ${head.spaces} · lid.on ${off0.lid?.on}`
      + ' — every number below is describing a house that was always like this');
  note(`[F] OFF — calls ${off0.calls} · tris ${off0.tris} · resident ${off0.resident}/${head.spaces}`);

  const on1 = await page.evaluate(() => window.__rrr.flyover(true));
  await step(30);
  const onRead = await page.evaluate(() => {
    const e = window.__rrr.engine;
    return { ...window.__rrr.flyover(), calls: e.renderer.info.render.calls,
      tris: e.renderer.info.render.triangles,
      eye: [+e.camera.position.x.toFixed(2), +e.camera.position.y.toFixed(2), +e.camera.position.z.toFixed(2)],
      up: [e.camera.up.x, e.camera.up.y, e.camera.up.z] };
  });
  note(`[F] ON  — eye ${onRead.eye.join(', ')} · up ${onRead.up.join(',')} · fitted ${onRead.y} m`
    + ` (clamped ${onRead.clamped}) · resident ${onRead.resident}/${head.spaces}`);
  const lidHidden = on1.lid?.hidden ?? 0;
  const lidTotal = on1.lid?.lid ?? 0;
  const refusals = (on1.lid?.spaces ?? []).flatMap((s) => s.refused.map((r) => `${s.space}:${r.key}@${r.minY}-${r.maxY}`));
  note(`lid: ${lidHidden} of ${lidTotal} ceiling buckets hidden`
    + ` (${(on1.lid?.spaces ?? []).map((s) => `${s.space}/storey ${s.storey}[${s.took.join('|') || '—'}]`).join(' ')})`);
  if (refusals.length) note(`lid REFUSED (reaches the ceiling band but starts below it): ${refusals.join(' · ')}`);

  onRead.resident === head.spaces && lidHidden === lidTotal && lidTotal > 0 && onRead.y > 5
    ? pass('A1 [F] lifts the eye above the whole envelope with every room resident and the roof off',
      `${onRead.y} m up · ${onRead.resident}/${head.spaces} resident · ${lidHidden}/${lidTotal} ceilings hidden`)
    : fail('A1 [F] lifts the eye above the whole envelope with every room resident and the roof off',
      `${onRead.y} m · resident ${onRead.resident}/${head.spaces} · ceilings ${lidHidden}/${lidTotal}`);
  if (onRead.clamped) {
    note(`⚠️ the fit was CLAMPED by the camera's far plane — the envelope does not fit at fov`
      + ` ${onRead.spanX} x ${onRead.spanZ} m. The frame is cropped and says so rather than lying.`);
  }

  // =============================================================================== L2 / C2
  // The collider flood, on BOTH arms, driving the real `room.collide()` — never a copy of it.
  const flood = (mode) => page.evaluate((m) => {
    const e = window.__rrr.engine, THREE_ = e.player.pos.constructor;
    const b = e.room.bounds, STEP = 0.5, R = 0.34, H = 1.70;
    const p = new THREE_();
    const out = [];
    for (let x = b.minX; x <= b.maxX; x += STEP) {
      for (let z = b.minZ; z <= b.maxZ; z += STEP) {
        // C2's arm: displace exactly one probe, so the comparator has to notice one row in
        // thousands. A control that moves everything proves only that a difference is loud.
        const dx = (m === 'c2' && out.length === 17) ? 1.0 : 0;
        p.set(x + dx, e.room.floorY, z);
        const r = e.room.collide(p, R, H);
        out.push(Math.round(r.x * 1000) + ',' + Math.round(r.z * 1000));
      }
    }
    return out.join(';');
  }, mode);

  const floodOn = await flood('plain');
  const floodC2 = await flood('c2');
  await page.evaluate(() => window.__rrr.flyover(false));
  await step(20);
  const floodOff = await flood('plain');
  const nProbe = floodOff.split(';').length;
  floodOn === floodOff
    ? pass('L2 room.collide() is IDENTICAL with the roof off and on',
      `${nProbe} body probes over the whole envelope, 0.5 m grid, r 0.34 / h 1.70 — every result equal`)
    : fail('L2 room.collide() is IDENTICAL with the roof off and on',
      `${nProbe} probes; the two arms disagree — the lid is reaching a collider`);
  floodC2 !== floodOff
    ? pass('C2 CONTROL — the collider comparator can see a difference',
      'one probe of ' + nProbe + ' displaced by 1.00 m and the comparison went red')
    : fail('C2 CONTROL — the collider comparator can see a difference',
      'a 1.00 m displacement produced an identical string — L2\'s zero means nothing');

  // =============================================================================== L3
  const world = (want) => page.evaluate((w) => {
    const e = window.__rrr.engine, V = e.player.pos.constructor;
    if (w) window.__rrr.flyover(true); else window.__rrr.flyover(false);
    const sp = e.room.spaces;
    const rows = [];
    rows.push('portals=' + e.room.portals().length);
    // ⚠️ `pathPortals(from, to)` takes two ends — calling it bare throws inside `spaceAt`.
    // Every ordered pair of spaces, so the whole route graph is in the comparison.
    for (const a of e.room.spaces) {
      for (const b2 of e.room.spaces) {
        if (a === b2) continue;
        rows.push(`path:${a.id}>${b2.id}=` + e.room.pathPortals(a.id, b2.id).map((p) => p.id ?? `${p.a}|${p.b}`).join('+'));
      }
    }
    const o = new V(), d = new V();
    for (let i = 0; i < sp.length; i++) {
      const a = sp[i], bsp = sp[(i + 1) % sp.length];
      o.set(a.cx, 1.2, a.cz); d.set(bsp.cx - a.cx, 0, bsp.cz - a.cz);
      const len = Math.hypot(d.x, d.z) || 1; d.multiplyScalar(1 / len);
      const hit = e.room.castRay(o, d, 60);
      rows.push(`ray:${a.id}->${bsp.id}=${hit ? Math.round(hit.distance * 1000) : 'miss'}`);
      rows.push(`sight:${a.id}->${bsp.id}=${e.room.blocksSight ? String(e.room.blocksSight(o, new V(bsp.cx, 1.2, bsp.cz))) : 'n/a'}`);
    }
    return rows.join(';');
  }, want);
  const worldOn = await world(true);
  const worldOff = await world(false);
  worldOn === worldOff
    ? pass('L3 portals, rays and sight are IDENTICAL with the roof off and on',
      worldOff.split(';').length + ' queries — portals(), pathPortals(), castRay() and blocksSight()')
    : fail('L3 portals, rays and sight are IDENTICAL with the roof off and on',
      `on:  ${worldOn}\n     off: ${worldOff}`);

  // =============================================================================== A2 / C3
  // The draw-call flip, IN PLACE at one station. Never two walks.
  /**
   * 🚨 **THE DRAW SET IS READ BY NAME, NOT ONLY AS A NUMBER, AND THAT IS WHAT MAKES A2 USEFUL.**
   * `renderer.info.render.calls` is a scalar: two builds that differ by one call and two builds
   * that differ by a hundred both read as "not equal", and neither says WHAT. The census below is
   * the same walk `eo2-calls.mjs` does — every mesh whose whole parent chain is visible — keyed
   * by mesh name, so a failure names the object. It also removes the ambiguity that cost this
   * project a round: a scalar that drifts because the HUNTER walked is not the same fact as a
   * scalar that drifts because the fly-over left something behind, and only a per-name diff can
   * tell them apart.
   */
  const read = () => page.evaluate(() => {
    const e = window.__rrr.engine, r = e.renderer.info.render;
    /**
     * ⚠️ **EVERY DRAWABLE, NOT JUST `isMesh`, AND THE INSTANCE COUNT IS PART OF THE KEY.**
     * A first version walked meshes by name only and reported the draw set IDENTICAL while the
     * scalar moved by one call — because an `InstancedMesh` keeps its name and its visibility
     * and changes how much it draws through `count`, and because sprites, points and lines are
     * not `isMesh` at all. A census that cannot see the thing that moved will always agree with
     * itself. Triangles are summed per key so the residual can be attributed in triangles too.
     */
    const by = {}, tri = {};
    e.scene.traverse((o) => {
      if (!(o.isMesh || o.isSprite || o.isPoints || o.isLine) || !o.visible) return;
      let p = o.parent; while (p) { if (!p.visible) return; p = p.parent; }
      const g = o.geometry;
      const total = g?.index ? g.index.count : (g?.attributes?.position?.count ?? 0);
      // ⚠️ **AND `drawRange` IS PART OF IT TOO.** A merged bucket can draw less of itself without
      // changing `visible` or `count` — which is how a family of exterior dressing is switched on
      // and off for one draw call — so a census blind to it reports "identical" while the
      // renderer draws 24 fewer triangles.
      const dr = g?.drawRange;
      const ranged = dr && dr.count !== Infinity && dr.count < total - (dr.start ?? 0);
      const drawn = ranged ? Math.max(0, Math.min(dr.count, total - (dr.start ?? 0))) : total;
      const n = (o.name || `(unnamed ${o.type})`) + (o.isInstancedMesh ? `[x${o.count}]` : '')
        + (ranged ? `[range ${dr.start}+${dr.count}]` : '');
      by[n] = (by[n] ?? 0) + 1;
      tri[n] = (tri[n] ?? 0) + (drawn / 3) * (o.isInstancedMesh ? o.count : 1);
    });
    // ⚠️ The two SMOOTHED states that can move a frustum without moving the draw set: the boom's
    // own `_pos` and the shared key light. A scalar that drifts while the mesh census does not is
    // one of these two, and printing them is what turned a widened gate into a one-line fix.
    const c = e.cam, k = e.scene.children.find((o) => o.isSpotLight);
    let sceneTris = 0;
    for (const k2 of Object.keys(tri)) sceneTris += tri[k2];
    return { calls: r.calls, tris: r.triangles, resident: e.room.visibleSpaces(),
      programs: e.renderer.info.programs.length, by, tri, sceneTris: Math.round(sceneTris),
      boom: c?._pos ? [+c._pos.x.toFixed(4), +c._pos.y.toFixed(4), +c._pos.z.toFixed(4)] : null,
      key: k ? [+k.position.x.toFixed(4), +k.position.y.toFixed(4), +k.position.z.toFixed(4)] : null };
  });
  const nameDiff = (a, b) => {
    const keys = new Set([...Object.keys(a.by), ...Object.keys(b.by), ...Object.keys(a.tri), ...Object.keys(b.tri)]);
    const out = [];
    for (const k of keys) {
      const n0 = a.by[k] ?? 0, n1 = b.by[k] ?? 0;
      const t0 = Math.round(a.tri[k] ?? 0), t1 = Math.round(b.tri[k] ?? 0);
      if (n0 !== n1 || t0 !== t1) out.push(`${k} ${n0}→${n1} objs / ${t0}→${t1} tris`);
    }
    return out;
  };
  await page.evaluate(() => window.__rrr.flyover(false));
  await step(30);
  const A = await read();
  /**
   * ⚠️ **THE SAME-CONFIG CONTROL PAIR, AND IT HAS TO BE THE SAME LENGTH AS THE TEST.**
   *
   * HANDOFF demands the control by name — *"byte-identical is an impossible test and must never
   * be demanded as proof; the correct proof is inside the same-config noise floor"* — and the
   * first version of this block got it wrong in a way worth recording: it waited **30** frames
   * for the control and **90** for the flip (OFF → ON → OFF is three settles), so the control was
   * measuring a third of the window it was defending. The sim is RUNNING at this station and the
   * **HUNTER IS WALKING ITS PATROL**; its own meshes are in the census either way, but the shadow
   * pass culls against a frustum it moves through, so `renderer.info` drifts with wall time even
   * though the submitted scene graph does not. This control is now the same 90 frames with no
   * flip in it, which is the only version of it that can answer the question.
   */
  await step(30); await step(30); await step(30);
  const A2 = await read();
  await page.evaluate(() => window.__rrr.flyover(true));
  await step(30);
  const B = await read();
  await page.evaluate(() => window.__rrr.flyover(false));
  await step(30);
  const C = await read();
  const noise = Math.abs(A2.calls - A.calls);
  const drift = Math.abs(C.calls - A.calls);
  note(`same-config control pair (NO flip, same station, same 90-frame window as the test):`
    + ` ${A.calls} → ${A2.calls} calls / ${A.tris} → ${A2.tris} tris`
    + `${nameDiff(A, A2).length ? '  ·  submitted set moved: ' + nameDiff(A, A2).join(', ') : '  ·  submitted set identical'}`);
  note(`in-place flip at ONE station — OFF ${A.calls} calls / ${A.tris} tris / ${A.programs} programs`
    + `  →  FLY-OVER ${B.calls} / ${B.tris} / ${B.programs}`
    + `  →  OFF ${C.calls} / ${C.tris} / ${C.programs}`);
  const back = nameDiff(A, C);
  note(`draw set after the round trip vs before: ${back.length ? back.join(', ') : 'IDENTICAL, name for name'}`);
  note(`the two smoothed states, before → after: boom ${JSON.stringify(A.boom)} → ${JSON.stringify(C.boom)}`
    + ` · key light ${JSON.stringify(A.key)} → ${JSON.stringify(C.key)}`);
  /**
   * ⚠️ **THE SCENE-GRAPH TOTAL AGAINST `renderer.info`, WHICH SEPARATES TWO DIFFERENT FACTS.**
   * `info.render` counts what SURVIVED the frustum and the shadow pass; the census counts what
   * was submitted. If the census totals agree and `info` does not, the residual is culling — a
   * camera or a bounding volume — and not something the fly-over left switched on.
   */
  note(`submitted vs drawn — before: census ${A.sceneTris} tris / info ${A.tris}, resident ${A.resident}`
    + `  ·  after: census ${C.sceneTris} / info ${C.tris}, resident ${C.resident}`);
  note(`THE FLY-OVER'S OWN NUMBER: ${B.calls} draw calls against the 625 PLAY budget`
    + ` (${B.calls > 625 ? '+' + (B.calls - 625) + ' over — accepted, it is a tool' : 'inside it'}),`
    + ` ${B.tris} tris against 900k, ${B.resident} of ${head.spaces} spaces resident.`);
  /**
   * The claim is about the FLY-OVER, so it is asserted on the draw set the fly-over is
   * responsible for — every mesh, by name — and not on a scalar that the hunter's patrol also
   * writes to. `noise` is printed beside it so a reader can see what the scalar was doing.
   */
  back.length === 0
    ? pass('A2 the fly-over leaves the PLAY draw set exactly as it found it',
      `every visible mesh identical by name after OFF → ON → OFF at one station`
      + ` (calls ${A.calls} → ${B.calls} → ${C.calls}; same-config scalar noise at this station ±${noise})`)
    : fail('A2 the fly-over leaves the PLAY draw set exactly as it found it',
      `after the round trip these differ: ${back.join(', ')}`);
  drift <= Math.max(noise, 0)
    ? pass('A2b …and the scalar count comes back inside its own same-config noise',
      `|OFF→OFF| ${drift} calls against a no-flip control drift of ${noise}`)
    : fail('A2b …and the scalar count comes back inside its own same-config noise',
      `|OFF→OFF| ${drift} calls against a no-flip control drift of ${noise} — see the name diff above`);
  B.programs === A.programs && B.programs === C.programs
    ? pass('A3 arming the fly-over compiles no shader program',
      `programs ${A.programs} → ${B.programs} → ${C.programs}; the fill is a per-light uniform`
      + ' and cannot move numPointLights')
    : fail('A3 arming the fly-over compiles no shader program',
      `programs ${A.programs} → ${B.programs} → ${C.programs}`);
  B.calls !== A.calls
    ? pass('C3 CONTROL — the flip really changed the scene',
      `${A.calls} → ${B.calls} draw calls; A2's agreement is therefore about a real round trip`)
    : fail('C3 CONTROL — the flip really changed the scene',
      `the fly-over drew the same ${A.calls} calls as the parked view — nothing was flipped`);

  // =============================================================================== A1b / A4 / A5
  /**
   * 🎥 **THE ANGLE CONTROL.** John: *"but I want to control the angle."* Three things have to be
   * true and none of them is "it moved": the straight-down default must be UNCHANGED by the
   * generalisation, the boom must not be dragged around while he swings, and the tilt must stop
   * where the occlusion budget says it stops.
   */
  await page.evaluate(() => window.__rrr.flyover(true));
  await step(20);
  const a1b = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const s = window.__rrr.flyAngle(0, 90);
    // The landed closed form, recomputed here from the SAME inputs the view used — this is the
    // one place a re-derivation is correct, because the claim IS "the two forms agree".
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, top = 0;
    for (const sp of e.room.spaces) {
      if (sp.x0 < x0) x0 = sp.x0; if (sp.x1 > x1) x1 = sp.x1;
      if (sp.z0 < z0) z0 = sp.z0; if (sp.z1 > z1) z1 = sp.z1;
      if (sp.storey > top) top = sp.storey;
    }
    const M = 2.5;
    const c = e.camera;
    const tanV = Math.tan((c.fov * Math.PI) / 360), tanH = tanV * c.aspect;
    const closed = Math.max(((z1 - z0) / 2 + M) / tanV, ((x1 - x0) / 2 + M) / tanH) + top;
    return { solved: s.y, closed: +closed.toFixed(4),
      up: [c.up.x, c.up.y, c.up.z], eye: [+c.position.x.toFixed(3), +c.position.y.toFixed(3), +c.position.z.toFixed(3)] };
  });
  note(`A1b straight-down fit: corner solve ${a1b.solved} m vs the landed closed form`
    + ` ${a1b.closed} m · up ${a1b.up.join(',')}`);
  Math.abs(a1b.solved - a1b.closed) < 0.01 && a1b.up[2] === -1
    ? pass('A1b the angle control does not move the accepted straight-down frame',
      `corner solve ${a1b.solved} m = closed form ${a1b.closed} m, up (0,0,-1) — the landed view`)
    : fail('A1b the angle control does not move the accepted straight-down frame',
      `solve ${a1b.solved} vs closed ${a1b.closed}, up ${a1b.up.join(',')}`);

  /**
   * 🚨 **A4 — THE BOOM MUST NOT MOVE WHILE HE SWINGS THE FLY-OVER.** This is the constraint the
   * angle control could most plausibly have broken: the shipped build fed `cmd.look` straight
   * into `cam.look()` every frame, so dragging the mouse in the fly-over would have spun the
   * boom's yaw at the same time and he would have landed facing somewhere he never chose.
   * ⚠️ **DRIVEN THROUGH THE ARROW KEYS, NOT A SYNTHETIC MOUSE DELTA** — `Input.takeMouse()`
   * integrates the arrow-look into the same `dx`/`dy` units the mouse produces, and mouse
   * accumulation is gated on pointer lock, which headless Chromium is routinely refused. This is
   * a real player path, not a poke at a field.
   */
  const boom0 = await page.evaluate(() => {
    const s = window.__rrr.flyover();
    return { yaw: s.boomYaw, pitch: s.boomPitch, fyaw: s.yawDeg, ftilt: s.tiltDeg };
  });
  await page.keyboard.down('ArrowLeft'); await page.keyboard.down('ArrowUp');
  await step(30);
  await page.keyboard.up('ArrowLeft'); await page.keyboard.up('ArrowUp');
  await step(6);
  const boom1 = await page.evaluate(() => {
    const s = window.__rrr.flyover();
    return { yaw: s.boomYaw, pitch: s.boomPitch, fyaw: s.yawDeg, ftilt: s.tiltDeg,
      tiltMin: s.tiltMinDeg, blind: s.blindStrip };
  });
  note(`A4 arrow-look for 30 frames inside the fly-over: fly yaw ${boom0.fyaw}° → ${boom1.fyaw}°,`
    + ` tilt ${boom0.ftilt}° → ${boom1.ftilt}° (floor ${boom1.tiltMin}°, blind strip ${boom1.blind} m)`
    + `  ·  BOOM yaw ${boom0.yaw} → ${boom1.yaw}, pitch ${boom0.pitch} → ${boom1.pitch}`);
  boom0.yaw === boom1.yaw && boom0.pitch === boom1.pitch
    ? pass('A4 swinging the fly-over does not touch the boom',
      `cam.yaw ${boom1.yaw} and cam.pitch ${boom1.pitch} byte-identical across 30 frames of look`
      + ` input that moved the fly-over by ${(boom1.fyaw - boom0.fyaw).toFixed(2)}°`)
    : fail('A4 swinging the fly-over does not touch the boom',
      `boom yaw ${boom0.yaw} → ${boom1.yaw}, pitch ${boom0.pitch} → ${boom1.pitch}`);
  boom1.fyaw !== boom0.fyaw || boom1.ftilt !== boom0.ftilt
    ? pass('C5 CONTROL — the look input reached the fly-over at all',
      `yaw ${boom0.fyaw}° → ${boom1.fyaw}°, tilt ${boom0.ftilt}° → ${boom1.ftilt}°;`
      + ` A4's "the boom did not move" is therefore about a real input, not a dead key`)
    : fail('C5 CONTROL — the look input reached the fly-over at all',
      `neither angle moved — A4 proves nothing`);

  /**
   * 🔒 **A6 / C6 / A7 — THE LOCK.** John, after playing the angle control: *"it needs to be able
   * to lock and unlock."* Three separate claims, and the middle one is the only one that makes
   * the other two mean anything.
   *
   *   A6  a locked view does not move under look input — asserted on the CAMERA MATRIX, not on
   *       the yaw/tilt numbers, so a build whose lock held the angle while something else moved
   *       the eye would still go red.
   *   C6  **THE CONTROL THAT MUST FAIL.** The identical drag with the lock OFF has to move it.
   *       Without this, a lock implemented by unbinding the key, or a drag that never reached the
   *       page at all, both read as a perfect pass.
   *   A7  releasing does not jump. This is the failure the brief names as the easy one to get
   *       wrong: if the look accumulator kept integrating while locked, the frame after [L] would
   *       spend all of it at once. Measured BEFORE any new input is delivered.
   */
  const drag = async (frames = 30) => {
    await page.keyboard.down('ArrowLeft'); await page.keyboard.down('ArrowUp');
    await step(frames);
    await page.keyboard.up('ArrowLeft'); await page.keyboard.up('ArrowUp');
    await step(6);
  };
  const camState = () => page.evaluate(() => {
    const s = window.__rrr.flyover();
    return { locked: s.locked, yaw: s.yawDeg, tilt: s.tiltDeg, eye: s.eye, quat: s.quat,
      boomYaw: s.boomYaw, boomPitch: s.boomPitch };
  });
  const same = (a, b) => JSON.stringify([a.eye, a.quat, a.yaw, a.tilt])
    === JSON.stringify([b.eye, b.quat, b.yaw, b.tilt]);

  // put it somewhere that is NOT the default, so a lock that silently reset to straight down
  // could not pass by coincidence
  await page.evaluate(() => window.__rrr.flyAngle(25, 71));
  await step(8);
  await page.evaluate(() => window.__rrr.flyLock(true));
  await step(4);
  const lock0 = await camState();
  await drag(30);
  const lock1 = await camState();
  note(`A6 LOCKED drag: yaw ${lock0.yaw}° → ${lock1.yaw}°, tilt ${lock0.tilt}° → ${lock1.tilt}°`
    + ` · eye ${JSON.stringify(lock0.eye)} → ${JSON.stringify(lock1.eye)}`);
  lock0.locked === true && same(lock0, lock1)
    ? pass('A6 a locked fly-over does not move under look input',
      `30 frames of arrow-look: camera position, orientation, yaw and tilt all byte-identical`
      + ` at ${lock1.yaw}° / ${lock1.tilt}°`)
    : fail('A6 a locked fly-over does not move under look input',
      `locked ${lock0.locked}; ${JSON.stringify(lock0)} → ${JSON.stringify(lock1)}`);

  /**
   * A7 — release, and read the state BEFORE delivering any new input. A banked accumulator would
   * spend itself on the first frame after the unlock, which is exactly this measurement.
   */
  await page.evaluate(() => window.__rrr.flyLock(false));
  await step(8);
  const rel = await camState();
  note(`A7 after RELEASE, before any new input: yaw ${rel.yaw}° tilt ${rel.tilt}°`
    + ` · eye ${JSON.stringify(rel.eye)}`);
  rel.locked === false && same(lock1, rel)
    ? pass('A7 releasing the lock does not jump the view',
      `the frame after [L] is byte-identical to the frozen one — the look accumulator was drained`
      + ` every frame while locked, never banked`)
    : fail('A7 releasing the lock does not jump the view',
      `${JSON.stringify(lock1)} → ${JSON.stringify(rel)}`);

  // C6 — the identical drag, unlocked. It MUST move.
  await drag(30);
  const free1 = await camState();
  note(`C6 UNLOCKED drag (identical input): yaw ${rel.yaw}° → ${free1.yaw}°,`
    + ` tilt ${rel.tilt}° → ${free1.tilt}°`);
  !same(rel, free1)
    ? pass('C6 CONTROL — the same input moves the view when it is NOT locked',
      `yaw ${rel.yaw}° → ${free1.yaw}°, tilt ${rel.tilt}° → ${free1.tilt}°;`
      + ` A6's stillness is therefore the lock blocking live input, not a dead key`)
    : fail('C6 CONTROL — the same input moves the view when it is NOT locked',
      `nothing moved with the lock off either — A6 and A7 prove nothing`);

  /**
   * A4b — [F] still exits to the boom from EITHER state, byte-identical. The brief requires the
   * round trip to survive the lock, and "from locked" is the arm that could plausibly break it.
   */
  await page.evaluate(() => window.__rrr.flyLock(true));
  await step(4);
  const boomLocked0 = await camState();
  await drag(20);
  const boomLocked1 = await camState();
  boomLocked0.boomYaw === boomLocked1.boomYaw && boomLocked0.boomPitch === boomLocked1.boomPitch
    ? pass('A4b the boom is untouched from the LOCKED state too',
      `cam.yaw ${boomLocked1.boomYaw} / cam.pitch ${boomLocked1.boomPitch} byte-identical through`
      + ` 20 frames of look input while the fly-over was locked`)
    : fail('A4b the boom is untouched from the LOCKED state too',
      `${boomLocked0.boomYaw}/${boomLocked0.boomPitch} → ${boomLocked1.boomYaw}/${boomLocked1.boomPitch}`);
  /**
   * 🔒 **A8 — THE STATE IS ON SCREEN, READ OFF THE LIVE DOM.** The brief's rule is that it has to
   * be discoverable from the on-screen line alone, because he does not use a terminal. Reading
   * `flyStatus().locked` would only prove the view knows; this reads `#rrr-prompt`'s actual text,
   * which is the thing he looks at. Both wordings are required to differ, so a line that said
   * "LOCK" in both states could not pass.
   */
  const promptText = () => page.evaluate(() =>
    document.getElementById('rrr-prompt')?.textContent ?? '');
  await page.evaluate(() => window.__rrr.flyLock(true));
  await step(4);
  const pLocked = await promptText();
  await page.evaluate(() => window.__rrr.flyLock(false));
  await step(4);
  const pFree = await promptText();
  note(`A8 HUD locked : "${pLocked}"`);
  note(`A8 HUD free   : "${pFree}"`);
  /**
   * ⚠️ **AND THE LINE HAS TO FIT ON ONE ROW.** `#rrr-prompt` wraps rather than truncating, so an
   * over-long line lays a second row across the middle of the house — the one part of the frame
   * this view exists to show. The first lock wording did exactly that and the frame is on disk.
   * 155 characters is what the prompt fits at the shipped size; the bar is set under it with room
   * for the longest hunter clause.
   */
  const fits = Math.max(pLocked.length, pFree.length) <= 145;
  /^\[F\] FLY-OVER · LOCKED/.test(pLocked) && /^\[F\] FLY-OVER · FREE/.test(pFree)
    && pLocked !== pFree && fits
    ? pass('A8 the lock state is named on the on-screen line, in both states, on ONE row',
      `"${pLocked.slice(14, 32)}" against "${pFree.slice(14, 42)}", read off #rrr-prompt in the`
      + ` live DOM · longest line ${Math.max(pLocked.length, pFree.length)} chars against a 150 bar`)
    : fail('A8 the lock state is named on the on-screen line, in both states, on ONE row',
      `locked (${pLocked.length}) "${pLocked}" · free (${pFree.length}) "${pFree}"`);

  // and leave it as the rest of the file expects: free, straight down
  await page.evaluate(() => { window.__rrr.flyLock(false); window.__rrr.flyAngle(0, 90); });
  await step(6);

  const a5 = await page.evaluate(() => {
    const lo = window.__rrr.flyAngle(0, 5);      // ask for far below the floor
    const hi = window.__rrr.flyAngle(0, 140);    // ask for past vertical
    const back = window.__rrr.flyAngle(0, 90);
    return { lo: lo.tiltDeg, hi: hi.tiltDeg, floor: lo.tiltMinDeg, back: back.tiltDeg,
      blindAtFloor: lo.blindStrip, blindAt90: back.blindStrip };
  });
  note(`A5 tilt clamp: asked 5° → ${a5.lo}° · asked 140° → ${a5.hi}° · floor ${a5.floor}°`
    + ` · a wall hides ${a5.blindAtFloor} m at the floor and ${a5.blindAt90} m straight down`);
  a5.lo === a5.floor && a5.hi === 90 && a5.back === 90
    ? pass('A5 the tilt is clamped to its occlusion budget at both ends',
      `[${a5.floor}°, 90°]; at the floor a wall hides ${a5.blindAtFloor} m of the floor behind it,`
      + ` at 90° it hides ${a5.blindAt90} m`)
    : fail('A5 the tilt is clamped to its occlusion budget at both ends',
      `low ${a5.lo} (floor ${a5.floor}), high ${a5.hi}`);

  // =============================================================================== S — the senses
  /**
   * 🔊 **THE OVERLAY MUST BE A READ-OUT OF THE AI, NOT A PICTURE THAT RESEMBLES ONE.** HANDOFF:
   * *"an instrument that re-derives the thing it measures will agree with it."* Every assertion
   * below compares what is DRAWN — the mesh's own world scale and rotation, read back off the
   * scene — against the live value the AI range-checks, and S2 moves the live value and requires
   * the drawing to follow.
   */
  const senses = await page.evaluate(() => {
    window.__rrr.flySenses(true);
    return window.__rrr.flyover();
  });
  note(`S: hearRange ${senses.sense.hearRange} m · hearFloor ${senses.sense.hearFloor}`
    + ` · sightRange ${senses.sense.sightRange} m · fov half ${senses.sense.fovHalfDeg}°`
    + ` · peripheral ${senses.sense.peripheral} m`);
  note(`S: hunter — in scene ${senses.hunter.inScene} · at ${JSON.stringify(senses.hunter.pos)}`
    + ` in ${senses.hunter.space ?? 'NO SPACE'} · targets ${senses.hunter.targets}`
    + ` · patrol stops INSIDE this house ${senses.hunter.inside}/${senses.hunter.route}`
    + ` (stops whose space id exists here: ${senses.hunter.named})`);
  /**
   * 🚨 **H0 — THE HUNTER IS IN THE HOUSE, INCLUDING A GENERATED ONE.** John caught a brief that
   * said otherwise (*"I can tell you the hunter is in the house lol"*) and he was right; the
   * first build of the overlay gated the cone on the patrol route and drew nothing over a hunter
   * who was standing in the room. This asserts the thing that was got wrong, so it cannot be got
   * wrong again quietly.
   */
  senses.hunter.present && senses.hunter.space
    ? pass('H0 the hunter is present in THIS house and the overlay has a live subject',
      `at ${JSON.stringify(senses.hunter.pos)} inside ${senses.hunter.space},`
      + ` ${senses.hunter.targets} target(s)`)
    : fail('H0 the hunter is present in THIS house and the overlay has a live subject',
      `present ${senses.hunter.present}, pos ${JSON.stringify(senses.hunter.pos)},`
      + ` space ${senses.hunter.space}`);

  /**
   * S1 — YOUR OWN NOISE RING IS `hearRange × player.noise`, WHICH IS `_sense`'S OWN TEST.
   * Driven by actually WALKING (W held), because `player.noise` is written by the locomotion
   * step and a probe that poked the field would be testing its own poke.
   */
  await page.keyboard.down('KeyW');
  await step(12);
  const walking = await page.evaluate(() => window.__rrr.flyover());
  await page.keyboard.up('KeyW');
  await step(25);
  const still = await page.evaluate(() => window.__rrr.flyover());
  note(`S1 walking: player.noise ${walking.sense.playerNoise} → reach`
    + ` ${walking.sense.playerReach} m · ring drawn at ${walking.sense.youRimRadius ?? 'HIDDEN'}`
    + `   ·   standing: noise ${still.sense.playerNoise} · ring ${still.sense.youRimRadius ?? 'HIDDEN'}`);
  const s1ok = walking.sense.youRimRadius != null
    && Math.abs(walking.sense.youRimRadius - walking.sense.playerReach) < 0.02;
  s1ok
    ? pass('S1 the noise ring IS hearRange x player.noise, not a number of its own',
      `drawn ${walking.sense.youRimRadius} m against the live product`
      + ` ${walking.sense.hearRange} x ${walking.sense.playerNoise} = ${walking.sense.playerReach} m`)
    : fail('S1 the noise ring IS hearRange x player.noise, not a number of its own',
      `drawn ${walking.sense.youRimRadius}, live product ${walking.sense.playerReach}`);
  /**
   * S2 — THE CONTROL THAT MUST FAIL. Standing still is silence (`hearFloor` 0.03), so the ring
   * has to GO. An overlay that drew a fixed circle would pass S1 and fail this, which is exactly
   * what it is for.
   */
  still.sense.youRimRadius == null && walking.sense.youRimRadius > 1
    ? pass('S2 CONTROL — the ring follows the live value and vanishes at silence',
      `walking ${walking.sense.youRimRadius} m → standing HIDDEN (noise ${still.sense.playerNoise}`
      + ` is under the hearFloor of ${still.sense.hearFloor})`)
    : fail('S2 CONTROL — the ring follows the live value and vanishes at silence',
      `walking ${walking.sense.youRimRadius}, standing ${still.sense.youRimRadius}`);

  /**
   * S3 — THE HUNTER'S CONE IS SWUNG TO `facing + scan`, THE LIVE HEAD SWEEP. `_scanStep` moves
   * `scan` every frame while he is not busy, so this compares the drawn rotation against the
   * field in the SAME frame — and then samples again to show the sweep is alive rather than a
   * constant that happened to match once.
   */
  const c1 = await page.evaluate(() => window.__rrr.flyover().sense);
  await step(20);
  const c2 = await page.evaluate(() => window.__rrr.flyover().sense);
  const near = (a, b) => Math.abs(((a - b + Math.PI) % (Math.PI * 2)) - Math.PI) < 1e-3;
  note(`S3 cone yaw ${c1.hunterConeYaw} vs live facing+scan ${c1.hunterFacing}`
    + `  ·  20 frames later ${c2.hunterConeYaw} vs ${c2.hunterFacing}`);
  c1.hunterConeYaw != null && near(c1.hunterConeYaw, c1.hunterFacing)
    && c2.hunterConeYaw != null && near(c2.hunterConeYaw, c2.hunterFacing)
    ? pass('S3 the vision cone is swung to the hunter\'s live facing + scan',
      `drawn ${c1.hunterConeYaw} = facing+scan ${c1.hunterFacing}, and again after 20 frames`)
    : fail('S3 the vision cone is swung to the hunter\'s live facing + scan',
      `${c1.hunterConeYaw} vs ${c1.hunterFacing}; ${c2.hunterConeYaw} vs ${c2.hunterFacing}`);
  c1.hunterConeYaw !== c2.hunterConeYaw
    ? pass('S4 CONTROL — the head sweep is alive, not a constant that matched once',
      `cone yaw moved ${c1.hunterConeYaw} → ${c2.hunterConeYaw} over 20 frames — `
      + `_scanStep is running and the cone is reading it, not a frozen copy`)
    : fail('S4 CONTROL — the head sweep is alive, not a constant that matched once',
      `cone yaw did not move over 20 frames (${c1.hunterConeYaw}) — S3 may be comparing two`
      + ` frozen numbers`);

  /**
   * 🚨 **H1 — WHAT THE PATROL ACTUALLY DOES IN THIS HOUSE, AS A NUMBER. REPORTED, NOT GATED.**
   *
   * Not this slice's to fix, and it is not asserted — but the cone overlay is the first thing
   * that has ever LOOKED at hunter behaviour in a generated house, and the brief asks for a
   * number if it shows something broken rather than merely still. Two facts, both measured:
   *
   *   · how many of the 12 patrol stops lie inside this envelope. `_patrol` reads `wp.x`/`wp.z`
   *     and **never `wp.space`** (checked in `hunter-ai.js`), so a generated house does not lose
   *     the route — it inherits the AUTHORED house's coordinates and walks to them.
   *   · how far he actually travels over 4 s, and whether he ends up inside a space at all.
   *     Standing still is a legitimate patrol dwell; standing still OUTSIDE the house, pressed
   *     into the envelope by a waypoint that is 30 m away in another building, is not.
   */
  const h0 = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const p = e.hunter.root.position;
    return { x: +p.x.toFixed(2), z: +p.z.toFixed(2), state: e.hunter.state ?? null };
  });
  /**
   * ⚠️ **240 FRAMES, NOT 60, AND THE FIRST VERSION OF THIS LINE WAS DISHONEST.** It sampled one
   * second, read 0.01 m of travel and was about to report a stalled hunter — but `PATROL_ROUTE`
   * dwells 2.0–3.0 s at every stop, so a one-second window cannot tell a dwell from a stall. Four
   * seconds is longer than the longest dwell in the table, which is the shortest window in which
   * "he is not moving" means anything.
   */
  await step(240);
  const h1 = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const p = e.hunter.root.position;
    const route = e.room.patrolRoute?.() ?? [];
    const b = e.room.bounds;
    return { x: +p.x.toFixed(2), z: +p.z.toFixed(2), state: e.hunter.state ?? null,
      space: e.room.spaceAt(p)?.id ?? null,
      stops: route.map((w) => ({ s: w.space, x: w.x, z: w.z,
        inside: !!e.room.spaceAt({ x: w.x, y: 0, z: w.z }, 0.6) })),
      env: [+b.minX.toFixed(1), +b.maxX.toFixed(1), +b.minZ.toFixed(1), +b.maxZ.toFixed(1)] };
  });
  const travelled = Math.hypot(h1.x - h0.x, h1.z - h0.z);
  const inside = h1.stops.filter((s) => s.inside).length;
  note(`H1 PATROL GEOGRAPHY (reported, not gated): ${inside}/${h1.stops.length} stops lie inside`
    + ` this envelope x[${h1.env[0]},${h1.env[1]}] z[${h1.env[2]},${h1.env[3]}].`
    + ` Stops: ${h1.stops.map((s) => `${s.s}@${s.x},${s.z}${s.inside ? '' : '✗'}`).join(' ')}`);
  note(`H1 HUNTER MOTION over 240 frames (~4 s, longer than the 3.0 s longest patrol dwell):`
    + ` (${h0.x},${h0.z}) → (${h1.x},${h1.z}), travelled ${travelled.toFixed(2)} m,`
    + ` state ${h0.state} → ${h1.state}, now in ${h1.space ?? 'NO SPACE — he is outside the house'}`);
  if (inside === 0) {
    note(`🚨 H1 FINDING: NOT ONE patrol stop is inside this house. \`_patrol\` never reads`
      + ` \`wp.space\`, so he is steering at the AUTHORED house's coordinates from inside a`
      + ` generated one. NOT MINE TO FIX — handing the number over.`);
  }

  /**
   * S5 — THE BUS. A real hammer blow is emitted through the game's own `NoiseBus` (`engine.noise`
   * is the bus the AI polls, exposed for exactly this), and the ring that appears must be
   * `hearRange × heard`, the DECAYED loudness `noise.js`'s header names as the number a listener
   * range-checks against.
   */
  const bus = await page.evaluate(() => {
    const e = window.__rrr.engine;
    e.noise.emit({ x: e.player.pos.x + 2, y: 0, z: e.player.pos.z }, 1.0, 'dig');
    return true;
  });
  await step(4);
  const busRead = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const live = e.noise.recent();
    return { s: window.__rrr.flyover().sense, top: live[0] ? +live[0].heard.toFixed(4) : null,
      n: live.length, hearRange: e.noise ? null : null };
  });
  const wantR = busRead.top == null ? null : +(busRead.s.hearRange * busRead.top).toFixed(2);
  note(`S5 one emitted dig blow at loudness 1.0: bus has ${busRead.n} live event(s), loudest heard`
    + ` ${busRead.top} → ring should be ${wantR} m; drawn ${JSON.stringify(busRead.s.busRadii)}`);
  bus && busRead.n > 0 && busRead.s.busVisible > 0
    && busRead.s.busRadii.some((r) => Math.abs(r - wantR) < 0.15)
    ? pass('S5 a noise on the bus draws a ring at hearRange x its DECAYED loudness',
      `${busRead.s.busVisible} ring(s) drawn, one at ${wantR} m for heard ${busRead.top}`)
    : fail('S5 a noise on the bus draws a ring at hearRange x its DECAYED loudness',
      `bus ${busRead.n} live, ${busRead.s.busVisible} drawn, radii`
      + ` ${JSON.stringify(busRead.s.busRadii)}, wanted ${wantR}`);

  // ---- what the overlay costs, reported not gated -------------------------------------------
  const ovOn = await read();
  await page.evaluate(() => window.__rrr.flySenses(false));
  await step(10);
  const ovOff = await read();
  await page.evaluate(() => window.__rrr.flySenses(true));
  await step(10);
  note(`OVERLAY COST: fly-over with senses ${ovOn.calls} calls / ${ovOn.programs} programs`
    + `  ·  senses off ${ovOff.calls} / ${ovOff.programs}  ·  the overlay is`
    + ` ${ovOn.calls - ovOff.calls} draw calls, all of them inside the fly-over only`);
  ovOn.programs === ovOff.programs && ovOn.programs === A.programs
    ? pass('S6 the overlay compiles no shader program either',
      `programs ${A.programs} parked → ${ovOff.programs} fly-over → ${ovOn.programs} with senses;`
      + ` the materials are warmed by finalizeScene before the loop hides them`)
    : fail('S6 the overlay compiles no shader program either',
      `parked ${A.programs}, fly-over ${ovOff.programs}, senses ${ovOn.programs}`);

  // =============================================================================== F — the frames
  // ⚠️ PARK AND SETTLE WITH THE SIM RUNNING BEFORE HOLDING. `hold()` empties `engine._updaters`,
  // so anything driven by an updater — the camera included — is left wherever it already was.
  const inHouse = await (async () => {
    await page.evaluate(() => window.__rrr.flyover(false));
    await wait(45);
    const pinned = await hold(page);
    await wait(4);
    const buf = await snap('flyover1-inhouse');
    await release(page);
    return { buf, pinned };
  })();
  keep('flyover1-inhouse', inHouse.buf);

  await page.evaluate(() => window.__rrr.flyover(true));
  await wait(45);
  const pinned = await hold(page);
  await wait(4);
  const f1 = await snap('flyover1-a');
  await wait(8);
  const f2 = await snap('flyover1-b');
  // The A/B, inside the SAME frozen page: put the roof back on, take the same frame.
  await page.evaluate(() => window.__rrr.engine.room.setLid(true));
  await wait(4);
  const fRoof = await snap('flyover1-roof-on');
  await page.evaluate(() => window.__rrr.engine.room.setLid(false));
  await wait(4);
  // C4: unpin the two dithers and re-take the pair. The floor must stop being zero.
  await unpinDithers(page, true);
  await wait(4);
  const fDither = await snap('flyover1-dither');
  await unpinDithers(page, false);
  await release(page);
  keep('flyover1-roofoff', f1);
  keep('flyover1-roofon', fRoof);
  note(`still.mjs pinned: ${JSON.stringify(pinned.pinned ?? pinned)}`);

  const iA = f1 && decodePng(f1), iB = f2 && decodePng(f2);
  const iRoof = fRoof && decodePng(fRoof), iDit = fDither && decodePng(fDither);
  const iHouse = inHouse.buf && decodePng(inHouse.buf);

  if (!iA || !iB || !iRoof) {
    skip('F1 the fly-over frame is measurable', 'a capture came back null');
    return;
  }
  const lFly = luma(iA);
  const lHouse = iHouse ? luma(iHouse) : null;
  if (lHouse) {
    note(`IN-HOUSE frame at this station: mean luma ${lHouse.mean} · median ${lHouse.median}`
      + ` · p10 ${lHouse.p10} · p90 ${lHouse.p90} · ${lHouse.over16}% of pixels over 16`);
  }
  note(`FLY-OVER frame: mean luma ${lFly.mean} · median ${lFly.median} · p10 ${lFly.p10}`
    + ` · p90 ${lFly.p90} · ${lFly.over2}% over 2 · ${lFly.over16}% over 16 · ${lFly.over32}% over 32`);
  note(`FLY-OVER, LIT PIXELS ONLY (the building, not the void around it): ${lFly.litFrac}% of the`
    + ` frame is lit · median luma there ${lFly.litMedian} · ${lFly.litOver16}% of it over 16`);

  const floor2 = moved(iA, iB, 2);
  const floor16 = moved(iA, iB, 16);
  note(`same-config floor, two frames one hold: px>2 ${floor2.pct}% (${floor2.px} px)`
    + ` · px>16 ${floor16.pct}%`);
  floor2.pct === 0
    ? pass('F1 the same-config pixel floor is zero', `px>2 ${floor2.pct}% over ${iA.width}x${iA.height}`)
    : fail('F1 the same-config pixel floor is zero', `px>2 ${floor2.pct}% — the hold is not holding`);

  const ditherFloor = iDit ? moved(iA, iDit, 2) : null;
  ditherFloor && ditherFloor.pct > 0
    ? pass('C4 CONTROL — unpinning the frame dithers moves the floor',
      `px>2 ${floor2.pct}% pinned → ${ditherFloor.pct}% unpinned; F1's zero is a hold, not a dead renderer`)
    : fail('C4 CONTROL — unpinning the frame dithers moves the floor',
      `px>2 unpinned ${ditherFloor ? ditherFloor.pct + '%' : 'no frame'} — F1's zero cannot be trusted`);

  const lid16 = moved(iA, iRoof, 16);
  const lid2 = moved(iA, iRoof, 2);
  const lid32 = moved(iA, iRoof, 32);
  note(`ROOF OFF vs ROOF ON, same frozen page, same camera:`
    + ` px>2 ${lid2.pct}% · px>16 ${lid16.pct}% · px>32 ${lid32.pct}%`);
  /**
   * 🚨 **THE THRESHOLD IS 16 AND THAT IS THE POINT, NOT A DEFAULT.** `dressfix-1` measured
   * `px>16` blind in a generated house at mean luma 6.65. If the SAME threshold reads a real
   * change here, the fly-over is a frame the project's standard look test works in — which is
   * half of what this slice was built for. It is gated at 1% of frame rather than at some
   * hand-fitted number because six ceilings are not a subtle change; anything less than that
   * would mean the roof is not what the camera is looking at.
   */
  lid16.pct >= 1
    ? pass('F3 the roof coming off is legible at the project\'s own px>16 threshold',
      `${lid16.pct}% of the frame moved past 16 levels (floor ${floor16.pct}%),`
      + ` at a frame median luma of ${lFly.median}`)
    : fail('F3 the roof coming off is legible at the project\'s own px>16 threshold',
      `only ${lid16.pct}% moved past 16 (px>2 says ${lid2.pct}%) at median luma ${lFly.median}`
      + ' — px>16 is blind in this frame too, and the fly-over has not solved the measurement half');

  if (lHouse) {
    note(`🎯 THE ANSWER TO "CAN A PIXEL TEST WORK HERE": in-house median luma ${lHouse.median}`
      + ` / ${lHouse.over16}% of pixels over 16  →  fly-over median ${lFly.median}`
      + ` (lit median ${lFly.litMedian}) / ${lFly.over16}% over 16.`);
  }
  /**
   * ---- THE DELIVERABLE FRAMES FOR THE OVERLAY AND THE ANGLE ---------------------------------
   * ⚠️ **THE ROBOT HAS TO BE WALKING WHEN THE SHUTTER OPENS.** `player.noise` is 0 standing
   * still, so a frame taken from a parked probe shows an overlay with its most important ring
   * missing — a picture that would read as "the noise overlay does not work". W is held THROUGH
   * the settle so the walk noise is real, and `hold()` then freezes it at that value.
   */
  await page.evaluate(() => { window.__rrr.flyover(true); window.__rrr.flySenses(true); });
  await page.evaluate(() => window.__rrr.flyAngle(0, 90));
  await page.keyboard.down('KeyW');
  await wait(45);
  await page.evaluate(() => {
    const e = window.__rrr.engine;
    // a hammer blow's worth of noise, at the player, through the game's own bus
    e.noise.emit({ x: e.player.pos.x, y: 0, z: e.player.pos.z }, 1.0, 'dig');
  });
  await wait(6);
  await hold(page);
  await wait(4);
  const senseFrame = await snap('flyover1-senses');
  await release(page);
  await page.keyboard.up('KeyW');
  keep('flyover1-senses', senseFrame);

  // ...and the angle, at the tilt floor, so the frame shows what the clamp buys.
  await page.evaluate(() => window.__rrr.flyAngle(38, 62));
  await page.keyboard.down('KeyW');
  await wait(40);
  await hold(page);
  await wait(4);
  const tiltFrame = await snap('flyover1-tilted');
  await release(page);
  await page.keyboard.up('KeyW');
  keep('flyover1-tilted', tiltFrame);
  const tiltInfo = await page.evaluate(() => window.__rrr.flyAngle(0, 90));
  note(`tilted frame taken at swing 38° / tilt 62° (the floor), eye ${tiltInfo.y} m;`
    + ` reset to straight down for the record`);

  note(`frames on disk: ${VIEW}.flyover1-{inhouse,roofoff,roofon,senses,tilted}.png in ${SHOTDIR}`);
}
