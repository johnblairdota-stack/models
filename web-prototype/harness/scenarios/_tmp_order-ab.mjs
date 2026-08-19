/**
 * 🔬 **ONE-PAGE A/B OF THE BREAK-ORDER LOW-PASS** — round 7's START HERE.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_tmp_order-ab.mjs \
 *        --port 5351 --q "seed=s4&dig=1" --shots
 *
 * `wall.js` sets `orderSoft: 0.80`, i.e. 80% of `_rrrOrder`'s fine tap comes from a ~13 cm mip,
 * which is what rounds off the Voronoi cell walls the bake already carries. Round 4 raised it to
 * stop the silhouette combing the SECTION into slivers — but the section is now one 132 mm slab
 * rather than a 69 mm one, so the ceiling may have moved.
 *
 * ⚠️ **THE ARMS ARE ONE UNIFORM, SET LIVE, IN ONE PAGE, ON ONE CRATER.** `applyBreakMask` puts
 * the same uniform objects on the material and on the compiled shader (`Object.assign`), so
 * writing `userData.breakUniforms.uOrderSoft.value` is the whole switch — no rebuild, no second
 * bake, no second dig, and therefore no chance the two arms differ in anything else.
 */

export default async function orderAb({ page, note, pass, fail, skip, shot, snap }) {
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
      return {
        deg: +(Math.asin(Math.min(1, dot)) * 180 / Math.PI).toFixed(1),
        pulled: +(1 - k).toFixed(2), standable: ok,
      };
    }, [pid, cu, mode, along, out, pitch, cv]);

  const frameStats = async (tag, buf) => {
    const b = buf ?? await snap(tag);
    if (!b) return null;
    return page.evaluate(async (b64) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([arr], { type: 'image/png' }));
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const g2 = c.getContext('2d', { willReadFrequently: true });
      g2.drawImage(bmp, 0, 0);
      const d = g2.getImageData(0, 0, bmp.width, bmp.height).data;
      const lum = []; let dark = 0;
      for (let y = 0; y < bmp.height * 0.86; y += 3) {
        for (let x = 0; x < bmp.width; x += 3) {
          const o = (y * bmp.width + x) * 4;
          const L = 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
          lum.push(L); if (L < 24) dark++;
        }
      }
      lum.sort((p, q) => p - q);
      return {
        median: Math.round(lum[lum.length >> 1]),
        dark: +(dark / lum.length * 100).toFixed(1),
      };
    }, b.toString('base64'));
  };

  /**
   * 📐 **THE TWO NUMBERS THE A/B TURNS ON, BOTH TAKEN OFF THE DELIVERED IMAGE.**
   *
   *   · `section`  the neutral mid-value run between white shell and teal — the SLAB EDGE.
   *                Round 4 raised orderSoft because this collapsed to 5 px. If it holds at a
   *                lower soft, the ceiling really has moved.
   *   · `straight` how ANGULAR the outline is: walk the white↔teal boundary and measure how
   *                far it travels in a straight line before turning. Scallops turn every few
   *                pixels; plates run.
   */
  const edgeStats = async (tag, rows = 64) => {
    const buf = await snap(tag);
    if (!buf) return null;
    return page.evaluate(async ([b64, nRows]) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
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

      // --- the section, exactly chunk-thick's classifier so the numbers stay comparable
      const runs = [];
      for (let k = 1; k < nRows; k++) {
        const y = ((bmp.height * 0.86) * k / nRows) | 0;
        let run = 0, armed = false;
        for (let x = 1; x < bmp.width; x++) {
          const p = at(x, y);
          if (isShell(p)) { armed = true; run = 0; }
          else if (armed && isCut(p)) run++;
          else if (armed && isTeal(p)) { if (run > 0) runs.push(run); armed = false; run = 0; }
          else { armed = false; run = 0; }
        }
      }
      runs.sort((a, b) => a - b);

      // --- the outline. For each row, the LEFTMOST x at which teal starts. A scalloped edge
      // makes that column wander every row; a plate edge makes it run straight then jump.
      const xs = [];
      for (let y = ((bmp.height * 0.04) | 0); y < bmp.height * 0.80; y++) {
        let hit = -1;
        for (let x = 2; x < bmp.width - 2; x++) {
          if (isTeal(at(x, y)) && isTeal(at(x + 1, y)) && isTeal(at(x + 2, y))) { hit = x; break; }
        }
        xs.push(hit);
      }
      // second difference of the edge column: 0 on a straight run (any slope), large at a corner
      let flat = 0, n2 = 0, turn = 0;
      for (let i = 1; i < xs.length - 1; i++) {
        if (xs[i - 1] < 0 || xs[i] < 0 || xs[i + 1] < 0) continue;
        const dd = Math.abs(xs[i + 1] - 2 * xs[i] + xs[i - 1]);
        n2++; if (dd <= 1) flat++; turn += dd;
      }
      /**
       * 🌊 **THE HALO — "a fading edge is a wet shore", as a pixel count.**
       *
       * Measured on the round-6 delivered frame: the boiserie approaching the hole runs
       * (94,54,31) -> (148,109,97) over 245 px, i.e. it DESATURATES as it brightens (blue
       * triples where red rises by half). Lighting falloff cannot do that — the pristine wall at
       * the same row goes (99,54,25) -> (128,82,46), a constant hue. So the quantity to measure
       * is not brightness, it is how far out from the white the wall is still desaturated.
       *
       * b/r on untouched boiserie is ~0.25; at the rim it reaches 0.65. 0.42 separates them.
       */
      const halos = [];
      for (let y = ((bmp.height * 0.06) | 0); y < bmp.height * 0.62; y += 2) {
        let wx = -1;
        for (let x = 3; x < bmp.width - 3; x++) {
          const p = at(x, y);
          if (p[0] > 150 && Math.abs(p[0] - p[1]) < 30 && Math.abs(p[1] - p[2]) < 45
              && isShell(at(x + 1, y))) { wx = x; break; }
        }
        if (wx < 24) continue;
        let n = 0;
        for (let x = wx - 1; x > 1 && n < 400; x--, n++) {
          const p = at(x, y);
          if (p[0] < 30) break;               // in shadow: no hue to read
          if (p[2] <= p[0] * 0.42) break;     // saturated warm again = untouched boiserie
        }
        halos.push(n);
      }
      halos.sort((a, b) => a - b);
      return {
        crossings: runs.length,
        section: runs.length ? runs[runs.length >> 1] : 0,
        sectionP90: runs.length ? runs[(runs.length * 0.9) | 0] : 0,
        halo: halos.length ? halos[halos.length >> 1] : -1,
        haloP90: halos.length ? halos[(halos.length * 0.9) | 0] : -1,
        haloRows: halos.length,
        edgeRows: n2,
        // share of the outline that is locally STRAIGHT — plates run, scallops curve
        straight: n2 ? +(flat / n2 * 100).toFixed(1) : -1,
        // mean absolute curvature of the outline, px
        curve: n2 ? +(turn / n2).toFixed(2) : -1,
      };
    }, [buf.toString('base64'), rows]);
  };

  const crater = (id, cu, cv, sites) => page.evaluate(([pid, u0, v0, plan]) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(pid);
    if (!p) return null;
    const W = p.width, H = p.height;
    let blows = 0;
    for (const [du, dv, count, power] of plan) {
      const u = Math.min(0.97, Math.max(0.03, u0 + du / W));
      const v = Math.min(0.94, Math.max(0.06, v0 + dv / H));
      for (let k = 0; k < count; k++) { p.applyHit(p.pointAt(u, v), power); blows++; }
    }
    const st = p.field.stats();
    return { blows, maxDepth: +st.maxDepth.toFixed(3), mean: +st.meanDepth.toFixed(3) };
  }, [id, cu, cv, sites]);

  /**
   * The whole switch: uniforms, on all four layer materials of one face. `applyBreakMask` puts
   * the SAME uniform objects on the material and on the compiled shader, so writing the value
   * here is the arm — no rebuild, no second bake, no second dig.
   *
   * `spec` is `key=value` pairs: `soft`, `hi`, `plate`, `lip`, `glow`, `bandLo` (band 0's own
   * depth-band floor, which is what decides how far out the skin starts responding at all).
   */
  const setArm = (id, spec) => page.evaluate(([pid, s]) => {
    const p = window.__rrr.engine.room.panelOf(pid);
    if (!p) return null;
    const got = [];
    p.mats.forEach((m, i) => {
      const u = m?.userData?.breakUniforms;
      if (!u?.uOrderSoft) return;
      if (s.soft !== undefined) u.uOrderSoft.value = s.soft;
      if (s.hi !== undefined) u.uOrderHi.value = s.hi;
      if (s.plate !== undefined) u.uPlate.value = s.plate;
      if (s.lipEnd !== undefined) u.uLipEnd.value = s.lipEnd;
      if (s.gain !== undefined) u.uOrderGain.value = s.gain;
      if (s.jag !== undefined) {
        if (u.uJag.value0 === undefined) u.uJag.value0 = u.uJag.value;
        u.uJag.value = u.uJag.value0 * s.jag;
      }
      if (s.cutDark !== undefined) u.uCutDark.value = s.cutDark;
      if (s.lip !== undefined) u.uLipWidth.value = u.uLipWidth.value0 === undefined
        ? (u.uLipWidth.value0 = u.uLipWidth.value, u.uLipWidth.value0 * s.lip)
        : u.uLipWidth.value0 * s.lip;
      if (s.glow !== undefined) {
        if (!u.uGlow.value0) u.uGlow.value0 = u.uGlow.value.clone();
        u.uGlow.value.copy(u.uGlow.value0).multiplyScalar(s.glow);
      }
      if (s.bandLo !== undefined && i === 0) u.uDmgBand.value.x = s.bandLo;
      got.push(`${u.uOrderSoft.value.toFixed(2)}/${u.uPlate.value.toFixed(2)}`);
    });
    return got.join(' ');
  }, [id, spec]);

  // ---------------------------------------------------------------------------
  // pick the dud face the way chunk-thick does: room to stand, then width, then light
  // ---------------------------------------------------------------------------
  const scored = [];
  for (const f of head.free.filter((x) => !x.link)) {
    const a = await park(f.id, 0.5, 'face', 0, 2.4);
    if (!a) continue;
    await step(26);
    const st = await frameStats(`scan-${f.id}`);
    if (!st) continue;
    const g1 = await park(f.id, 0.46, 'graze', 2.50, 2.10, null, 0.44);
    const g2 = await park(f.id, 0.46, 'graze', -2.50, 2.10, null, 0.44);
    const room = ((g1?.standable ? 1 - g1.pulled : 0) + (g2?.standable ? 1 - g2.pulled : 0)) / 2;
    scored.push({ ...f, ...st, room: +room.toFixed(2) });
  }
  scored.sort((p, q) => p.dark - q.dark);
  for (const s of scored) note(`   ${s.dark}%  ${s.median}  room ${s.room}  w ${s.w}m  ${s.id}`);
  let dud = scored[0];
  for (const [minRoom, minW] of [[0.85, 4.0], [0.70, 4.0], [0.70, 0], [0, 0]]) {
    const ok = scored.filter((s) => s.room >= minRoom && s.w >= minW);
    if (ok.length) { dud = ok[0]; break; }
  }
  if (!dud) { fail('a dud face was chosen', 'nothing scored'); return; }
  note(`A/B on ${dud.id}`);

  const CU = 0.46, CV = 0.44;
  await page.evaluate((pid) => window.__rrr.engine.room.panelOf(pid)?.resetDamage(), dud.id);
  const cr = await crater(dud.id, CU, CV, [
    [0.00, 0.00, 6, 1.00], [0.19, -0.13, 5, 1.00], [-0.16, 0.21, 5, 1.00], [0.04, 0.41, 4, 0.95],
    [0.53, 0.20, 4, 0.80], [-0.47, -0.29, 3, 0.74], [0.28, -0.54, 3, 0.70], [-0.34, 0.56, 3, 0.64],
    [0.79, -0.11, 2, 0.50], [-0.71, 0.34, 2, 0.44], [0.14, 0.79, 2, 0.40], [-0.09, -0.77, 2, 0.34],
    [1.04, 0.29, 1, 0.25], [-0.94, -0.34, 1, 0.22], [0.54, 0.93, 1, 0.20], [-0.53, -0.88, 1, 0.18],
  ]);
  note(`crater: ${cr.blows} blows · maxDepth ${cr.maxDepth} · mean ${cr.mean}`);
  /**
   * ⚠️ **SETTLE ONCE, HERE, NOT PER ARM.** The first run of this probe stepped 40 frames per
   * station and every one of the ten frames was a photograph of the dust cloud — the 0.80 arm
   * reported ZERO white↔teal crossings because the hole was behind a puff. The dig happens once,
   * so the settle belongs once, before any arm is set.
   */
  await step(300);

  // ---------------------------------------------------------------------------
  // THE ARMS. Head-on (where the outline is judged) and the steep graze (where the section is).
  // ---------------------------------------------------------------------------
  // e.g. RRR_AB="plate=0|plate=0.34|plate=0.34,soft=1|plate=0.5,lip=0.4,glow=0"
  const ARMS = (process.env.RRR_AB || 'plate=0|plate=0.20|plate=0.34|plate=0.50')
    .split('|').map((s) => s.trim()).filter(Boolean);

  for (const a of ARMS) {
    const spec = {};
    for (const kv of a.split(',')) {
      const [k, v] = kv.split('=');
      spec[k.trim()] = +v;
    }
    note(`--- ${a}: ${await setArm(dud.id, spec)}`);
    const tag = `ab-${a.replace(/[^a-z0-9]/gi, '')}`;

    await park(dud.id, CU, 'face', 0, 3.6, null, CV);
    await step(24);
    await shot(`${tag}-headon`);
    const e1 = await edgeStats(`${tag}-headon`);
    note(`   ${tag}-headon: section median ${e1.section}px p90 ${e1.sectionP90}px `
      + `(${e1.crossings} crossings) · outline curve ${e1.curve}px over ${e1.edgeRows} rows `
      + `· 🌊 halo median ${e1.halo}px p90 ${e1.haloP90}px (${e1.haloRows} rows)`);

    await park(dud.id, CU, 'graze', 1.45, 0.62, null, CV + 0.20);
    await step(24);
    await shot(`${tag}-graze`);
    const e2 = await edgeStats(`${tag}-graze`);
    note(`   ${tag}-graze : section median ${e2.section}px p90 ${e2.sectionP90}px `
      + `(${e2.crossings} crossings)`);
  }

  pass('the A/B ran', `${ARMS.length} arms on ${dud.id}, one page, one crater`);
}
