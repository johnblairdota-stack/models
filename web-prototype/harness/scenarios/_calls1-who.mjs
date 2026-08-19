/**
 * WHO OWNS EVERY DRAW CALL AT EVERY PARKED STATION — exact, per object, per material, per pass.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_calls1-who.mjs \
 *        --port 5241 --q "seed=s4"
 *   ...  --q "seed=s4&walls=legacy"   ...  --q "seed=s4&walls=occlude"
 *
 * ⚠️ THIS IS NOT A MESH CENSUS AND IT IS NOT AN ABLATION. `eo2-calls.mjs` counts visible meshes
 * and `inst-census.mjs` hides a subsystem and subtracts — both are approximations of the thing
 * three.js already knows exactly. `WebGLRenderer.renderBufferDirect` IS the draw call: every
 * `info.render.calls++` goes through it, including the shadow map's, and the object, material
 * and camera are all in the argument list. Wrapping it gives per-object attribution that sums
 * to `renderer.info.render.calls` by construction, with no subtraction and no assumption that
 * one visible mesh equals one call.
 *
 * ⚠️ AND IT IS SNAPSHOTTED ON THE ENGINE'S OWN `info.reset()`, which is HANDOFF's un-reset
 * counter hazard answered rather than dodged. `engine.js` sets `info.autoReset = false` and
 * calls `info.reset()` at the top of `_step`, so hooking that call gives exactly ONE frame of
 * tally, aligned to exactly the `calls` figure `eo2-calls.mjs` reads. The two numbers are
 * asserted equal at every station; a mismatch means the hook missed a path and the row is void.
 *
 * Shadow draws are told apart by `scene === null` — `WebGLShadowMap` passes null there
 * (three r180 `three.module.js` ~8761), and nothing else does.
 */

const STATIONS = (process.env.STATIONS ?? [
  'gallery.west', 'gallery.mid', 'gallery.east',
  'study_w.north', 'study_w.south', 'service.mid',
  'study_e.north', 'study_e.south',
  'ballroom.north', 'ballroom.centre', 'ballroom.south',
  'chapel.centre',
].join(',')).split(',').filter(Boolean);

const TOP = +(process.env.TOP ?? 14);

export default async function who({ page, note, pass, fail }) {
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 150; i++) {
      await page.waitForTimeout(40);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  // ---------------------------------------------------------------- install the hook
  const head = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const r = e.renderer;
    if (window.__who) return window.__who.head;

    const spaceOf = (o) => {
      let p = o, last = null;
      while (p) {
        if (typeof p.name === 'string' && p.name.startsWith('space.')) return p.name.slice(6);
        if (p.parent === e.scene) last = p.name || '(anon-root)';
        p = p.parent;
      }
      return last ? `<${last}>` : '<none>';
    };
    // The nearest NAMED ancestor chain, so an unnamed mesh is still attributable.
    const pathOf = (o) => {
      const parts = [];
      let p = o;
      for (let i = 0; i < 8 && p && p !== e.scene; i++) {
        if (p.name) parts.unshift(p.name);
        p = p.parent;
      }
      return parts.slice(-2).join('/') || '(unnamed)';
    };

    const cache = new WeakMap();
    const W = {
      cur: new Map(), last: null, lastCalls: 0, lastTris: 0, on: false,
      head: { quality: e.qualityName, mode: e.room?.panelCensus?.().mode ?? '?' },
    };
    window.__who = W;

    const origRBD = r.renderBufferDirect;
    r.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
      /**
       * ⚠️ NOT EVERY CALL TO THIS FUNCTION IS A DRAW, SO THE HOOK ASKS THE COUNTER RATHER THAN
       * PREDICTING IT. `renderBufferDirect` has early returns of its own, and
       * `WebGLBufferRenderer.renderInstances` returns on `primcount === 0` BEFORE
       * `info.update()` — so an `InstancedMesh` at count 0 arrives here and issues nothing.
       * Predicting those cases read the hook exactly ONE high at nine of twelve stations.
       * Reading `info.render.calls` either side of the REAL call is exact by construction and
       * cannot drift when three.js changes: if the counter did not move, neither did the GPU.
       */
      if (!W.on) return origRBD.call(this, camera, scene, geometry, material, object, group);
      const _before = r.info.render.calls;
      const _ret = origRBD.call(this, camera, scene, geometry, material, object, group);
      if (r.info.render.calls !== _before) {
        let base = cache.get(object);
        if (base === undefined) {
          base = `${spaceOf(object)}\u0001${pathOf(object)}\u0001${object.type}`;
          cache.set(object, base);
        }
        const key = `${scene === null ? 'S' : 'M'}\u0001${base}\u0001${material?.name || '(unnamed-mat)'}`;
        const row = W.cur.get(key);
        const tri = geometry
          ? (geometry.index ? geometry.index.count : (geometry.attributes.position?.count ?? 0)) / 3
          : 0;
        const n = object.isInstancedMesh ? object.count : 1;
        if (row) { row[0]++; row[1] += tri * n; } else W.cur.set(key, [1, tri * n]);
      }
      return _ret;
    };

    const info = r.info;
    const origReset = info.reset.bind(info);
    info.reset = function () {
      if (W.on) {
        W.last = W.cur; W.lastCalls = info.render.calls; W.lastTris = info.render.triangles;
        W.cur = new Map();
      }
      return origReset();
    };
    return W.head;
  });
  note(`quality "${head.quality}" · wall mode "${head.mode}"`);

  const rows = [];
  for (const name of STATIONS) {
    const ok = await page.evaluate((n) => {
      const e = window.__rrr.engine;
      const a = e.room.anchor(n);
      if (!a) return false;
      e.player.pos.set(a.x, e.room.floorY, a.z);
      e.player.vel.set(0, 0, 0);
      e.cam._first = true;
      return true;
    }, name);
    if (!ok) { note(`no anchor named ${name}`); continue; }
    // 0.25 s of residency HOLD hysteresis — settle well past it, as eo2-calls does.
    await step(40);
    await page.evaluate(() => { window.__who.on = true; });
    await step(4);
    const r = await page.evaluate(() => {
      const W = window.__who;
      W.on = false;
      const e = window.__rrr.engine;
      const out = [];
      let sum = 0;
      for (const [k, v] of W.last ?? []) {
        const [pass, space, path, type, mat] = k.split('\u0001');
        out.push({ pass, space, path, type, mat, calls: v[0], tris: Math.round(v[1]) });
        sum += v[0];
      }
      out.sort((a, b) => b.calls - a.calls);
      return {
        rows: out, sum, calls: W.lastCalls, tris: W.lastTris,
        spaces: e.room.visibleSpaces(),
        resident: e.room.spaces.filter((s) => s.visible).map((s) => s.id).join('+'),
      };
    });
    rows.push({ name, ...r });
    note('');
    note(`=== ${name} — ${r.calls} calls (hook saw ${r.sum}) · ${r.tris} tris`
      + ` · resident ${r.spaces} [${r.resident}]`);
    if (r.sum !== r.calls) note(`  ⚠️ HOOK MISMATCH ${r.sum} vs ${r.calls} — row is void`);
    /**
     * THE ROLLUP IS BY OWNER, MAIN AND SHADOW TOGETHER, BECAUSE THAT IS WHAT A FIX BUYS.
     * Hiding an object removes both its main draw and its shadow draw, so splitting them in
     * the headline table would understate every candidate by ~40%.
     */
    const byOwner = new Map();
    for (const x of r.rows) {
      const o = byOwner.get(x.space) ?? { main: 0, shadow: 0, mats: new Set() };
      o[x.pass === 'S' ? 'shadow' : 'main'] += x.calls;
      o.mats.add(x.mat);
      byOwner.set(x.space, o);
    }
    const own = [...byOwner].map(([k, v]) => [k, v, v.main + v.shadow]).sort((a, b) => b[2] - a[2]);
    for (const [k, v, tot] of own.slice(0, TOP)) {
      note(`  ${String(tot).padStart(4)} = ${String(v.main).padStart(3)} main + `
        + `${String(v.shadow).padStart(3)} shadow · ${String(v.mats.size).padStart(3)} distinct`
        + ` material names · ${k}`);
    }
    const rest = own.slice(TOP).reduce((n, x) => n + x[2], 0);
    if (own.length > TOP) note(`  ${String(rest).padStart(4)} = ${own.length - TOP} more owners`);
  }

  if (!rows.length) { fail('a census was taken', 'no station could be parked'); return; }
  const worst = rows.reduce((a, b) => (b.calls > a.calls ? b : a));
  note('');
  note(`WORST STATION ${worst.name}: ${worst.calls} calls / ${worst.tris} tris against 625 / 900k`);

  // ---- the object -> material key table the report needs, for the worst station's top owners
  {
    const byOwner = new Map();
    for (const x of worst.rows) {
      const o = byOwner.get(x.space) ?? [];
      o.push(x); byOwner.set(x.space, o);
    }
    const ranked = [...byOwner].map(([k, v]) => [k, v, v.reduce((n, x) => n + x.calls, 0)])
      .sort((a, b) => b[2] - a[2]);
    for (const [ownerName, list, tot] of ranked.slice(0, +(process.env.DETAIL ?? 4))) {
      note('');
      note(`--- ${worst.name} / ${ownerName}: ${tot} calls over ${list.length} (object, material) pairs`);
      // by MATERIAL NAME, which is the unit a draw call is actually charged in
      const byMat = new Map();
      for (const x of list) byMat.set(x.mat, (byMat.get(x.mat) ?? 0) + x.calls);
      const mats = [...byMat].sort((a, b) => b[1] - a[1]);
      note(`    ${mats.length} distinct material names; top: `
        + mats.slice(0, 6).map(([m, c]) => `${m}=${c}`).join(' · '));
      for (const x of list.slice(0, 10)) {
        note(`    ${x.pass} ${String(x.calls).padStart(3)} ${x.path.padEnd(40)} ${x.mat}`);
      }
      if (list.length > 10) note(`    ... ${list.length - 10} more pairs`);
    }
  }

  const bad = rows.filter((r) => r.sum !== r.calls);
  bad.length
    ? fail('the hook accounts for every call', `${bad.length} stations mismatched`)
    : pass('the hook accounts for every call', `${rows.length} stations, sums exact`);
}
