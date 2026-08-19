/**
 * 🔎 TEMP DIAGNOSTIC (dig-side-1) — WHY DOES THE STUDY SIDE OF A DUG FACE NOT READ AS A HOLE?
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_digside1-diag.mjs \
 *        --port 5361 --q "seed=s4&dig=1" --shots
 *
 * Candidates, none confirmed at the time of writing:
 *   1. the far face is culled / hidden
 *   2. the far face has no damage arm (no field, no barrier plane)
 *   3. the study's light rig does not reach it
 *   4. the far face is simply NEVER DUG — `_couple()` only mirrors cells that went all the way
 *      through AND are not barrier, so a dud dug from the passage leaves the study face pristine
 * This prints the terms so exactly one of them can be named.
 */

export default async function diag({ page, note, pass, fail, skip, shot, snap }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 30) => {
    const f0 = await frames();
    for (let i = 0; i < 240; i++) {
      await page.waitForTimeout(40);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };

  const freezeHunter = () => page.evaluate(() => {
    const e = window.__rrr.engine;
    if (!e.hunter) return 'no hunter';
    e.hunter.update = () => {};
    e.hunter.vel?.set?.(0, 0, 0);
    if (e.room?.spawn?.hunter) {
      e.hunter.root.position.copy(e.room.spawn.hunter);
      e.hunter.lastKnown?.copy?.(e.room.spawn.hunter);
    }
    e.hunter.state = 'PATROL'; e.hunter.target = null; e.hunter.awareness = 0;
    e.hunter.breachTarget = null; e.hunter.resetCombat?.();
    for (const s of ['shoulderR', 'shoulderL', 'hipR', 'hipL']) {
      if (e.player.rig?.occupant?.(s) === 'empty') e.player.rig.refit?.(s);
    }
    return 'frozen';
  });
  note(`hunter: ${await freezeHunter()}`);

  const head = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e?.room?.digCensus) return null;
    return { ...e.room.digCensus(), seed: String(e.run?.seed ?? '') };
  });
  if (!head || head.mode !== 'free') { fail('free dig build', JSON.stringify(head?.mode)); return; }
  note(`seed "${head.seed}" · ${head.freeFaces} free faces · link ${head.link.join(',')}`);

  // ---------------------------------------------------------------- 1. the build, per face
  const census = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const out = [];
    for (const p of e.room.panels.filter((q) => q.spec?.free)) {
      const mats = p.layers.map((m) => ({
        vis: m.visible, side: m.material?.side,
        hasDmg: !!(m.material?.userData?.breakUniforms?.uDamage
          || m.material?.userData?.damageUniforms),
        keys: Object.keys(m.material?.userData ?? {}).join('|'),
      }));
      out.push({
        id: p.id, room: p.spec.a, other: p.spec.b, side: p.spec.side, span: p.spec.seg,
        w: +p.width.toFixed(2), h: +p.height.toFixed(2), t: +p.thickness.toFixed(3),
        pos: [+p.root.position.x.toFixed(2), +p.root.position.y.toFixed(2),
          +p.root.position.z.toFixed(2)],
        nrm: [+p.normal.x.toFixed(2), +p.normal.z.toFixed(2)],
        rootVis: p.root.visible, instanced: !!p.instanced,
        hasField: !!p.field, grid: p.field ? `${p.field.cols}x${p.field.rows}` : null,
        hasBarrier: !!p.barrier, barrierVis: !!p.barrier?.visible,
        layerVis: p.layers.map((m) => (m.visible ? 1 : 0)).join(''),
        sides: mats.map((m) => m.side).join(','),
        udKeys: mats[0]?.keys ?? '',
      });
    }
    return out;
  });
  note('free faces as built:');
  for (const c of census) {
    note(`   ${c.id}  room=${c.room} w=${c.w} pos=${c.pos.join(',')} n=${c.nrm.join(',')} `
      + `field=${c.grid} barrier=${c.hasBarrier}/${c.barrierVis} layers=${c.layerVis} `
      + `side=${c.sides} rootVis=${c.rootVis} inst=${c.instanced}`);
  }
  note(`   layer material userData keys: ${census[0]?.udKeys}`);

  const A = 'f.svc_w.1.a', B = 'f.svc_w.1.b';
  const pairOk = census.find((c) => c.id === A) && census.find((c) => c.id === B);
  if (!pairOk) { fail('the critic\'s pair exists', `${A} / ${B} not in the census`); return; }

  // ---------------------------------------------------------------- 2. lighting, per room
  const lightScan = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const out = [];
    e.scene.traverse((o) => {
      if (!o.isLight) return;
      out.push({
        type: o.type, name: o.name || '(unnamed)', vis: o.visible,
        i: +(o.intensity ?? 0).toFixed(2),
        p: [+o.position.x.toFixed(1), +o.position.y.toFixed(1), +o.position.z.toFixed(1)],
        d: +(o.distance ?? 0).toFixed(1),
      });
    });
    return out;
  });
  note(`lights in the scene graph: ${lightScan.length}`);
  for (const l of lightScan) {
    note(`   ${l.type} ${l.name} i=${l.i} at ${l.p.join(',')} dist ${l.d} vis=${l.vis}`);
  }

  // ---------------------------------------------------------------- park / look
  const park = (pid, cu, mode, along, out, cv = 0.45) => page.evaluate(
    ([id, u, m, a, o, v]) => {
      const e = window.__rrr.engine;
      const p = e.room.panelOf(id);
      if (!p) return null;
      const n = p.normal;
      const t = { x: n.z, z: -n.x };
      const c = p.pointAt(u, v);
      const probe = c.clone();
      const front = c.clone();
      front.set(c.x + n.x * 0.5, e.room.floorY + 0.9, c.z + n.z * 0.5);
      const home = e.room.spaceAt(front, 0);
      const standable = (x, z) => {
        probe.set(x, e.room.floorY + 0.9, z);
        const s = e.room.spaceAt(probe, -0.30);
        if (!s || (home && s !== home)) return false;
        const q = e.room.collide(probe.clone(), 0.30);
        return Math.hypot(q.x - x, q.z - z) < 0.02;
      };
      let px = c.x, pz = c.z, fx = -n.x, fz = -n.z, k = 1, ok = false;
      for (let i = 0; i < 12; i++) {
        const oo = o * k, aa = a * k;
        if (m === 'face') { px = c.x + n.x * oo; pz = c.z + n.z * oo; }
        else { px = c.x + n.x * oo + t.x * aa; pz = c.z + n.z * oo + t.z * aa; }
        if (standable(px, pz)) { ok = true; break; }
        k -= 0.07;
        if (k < 0.24) break;
      }
      if (m !== 'face') {
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
      if (e.cam) {
        e.cam.yaw = e.player.facing;
        e.cam.pitch = Math.atan2(c.y - eye, dist);
        e.cam.distance = 0.05; e.cam.hardMin = 0.02; e.cam.pinchMin = 0.02;
        e.cam._first = true;
      }
      const dot = Math.abs(fx * n.x + fz * n.z);
      return {
        deg: +(Math.asin(Math.min(1, dot)) * 180 / Math.PI).toFixed(1),
        pulled: +(1 - k).toFixed(2), out: +(o * k).toFixed(2), along: +(a * k).toFixed(2),
        standable: ok,
      };
    }, [pid, cu, mode, along, out, cv]);

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
      const lum = []; let dark = 0, teal = 0, white = 0, n = 0;
      for (let y = 0; y < bmp.height * 0.86; y += 3) {
        for (let x = 0; x < bmp.width; x += 3) {
          const o = (y * bmp.width + x) * 4;
          const r = d[o], g3 = d[o + 1], b3 = d[o + 2];
          const L = 0.299 * r + 0.587 * g3 + 0.114 * b3;
          lum.push(L); n++;
          if (L < 24) dark++;
          if (b3 >= 34 && b3 > r * 1.55 && g3 > r * 1.20) teal++;
          else if (r > 110 && Math.abs(r - g3) < 26 && Math.abs(g3 - b3) < 34 && b3 > 92) white++;
        }
      }
      lum.sort((p, q) => p - q);
      return {
        median: Math.round(lum[lum.length >> 1]), p90: Math.round(lum[(lum.length * 0.9) | 0]),
        dark: +(dark / n * 100).toFixed(1),
        teal: +(teal / n * 100).toFixed(2), white: +(white / n * 100).toFixed(2),
      };
    }, b.toString('base64'));
  };

  const look = async (pid, cu, mode, along, out, tag, settle = 240, cv = 0.45) => {
    const a = await park(pid, cu, mode, along, out, cv);
    if (!a) return null;
    await step(settle);
    const buf = await snap(tag);
    const st = await frameStats(tag, buf);
    await shot(tag);
    note(`   ${tag}: ${a.deg}° off plane · ${mode} along ${a.along} out ${a.out}`
      + `${a.standable ? '' : ' ⚠️ NO LEGAL STATION'} · luma ${st?.median} p90 ${st?.p90} `
      + `dark ${st?.dark}% · teal ${st?.teal}% white ${st?.white}%`);
    return { ...a, ...(st ?? {}) };
  };

  const fieldOf = (id) => page.evaluate((pid) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(pid);
    if (!p?.field) return null;
    const st = p.field.stats();
    return {
      id: pid, hits: st.hits, maxDepth: +st.maxDepth.toFixed(3),
      mean: +st.meanDepth.toFixed(4), openCells: st.openCells, barrierCells: st.barrierCells,
      stage: p.state.stage, barrierVis: !!p.barrier?.visible,
      layerVis: p.layers.map((m) => (m.visible ? 1 : 0)).join(''),
      passable: !!p.openChannel().open,
    };
  }, id);

  const say = async (tag, id) => { const f = await fieldOf(id); note(`   ${tag} ${JSON.stringify(f)}`); return f; };

  const crater = (id, cu, cv) => page.evaluate(([pid, u0, v0]) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(pid);
    if (!p) return null;
    const W = p.width, H = p.height;
    const plan = [
      [0.00, 0.00, 6, 1.00], [0.19, -0.13, 5, 1.00], [-0.16, 0.21, 5, 1.00], [0.04, 0.41, 4, 0.95],
      [0.53, 0.20, 4, 0.80], [-0.47, -0.29, 3, 0.74], [0.28, -0.54, 3, 0.70], [-0.34, 0.56, 3, 0.64],
      [0.79, -0.11, 2, 0.50], [-0.71, 0.34, 2, 0.44], [0.14, 0.79, 2, 0.40], [-0.09, -0.77, 2, 0.34],
      [1.04, 0.29, 1, 0.25], [-0.94, -0.34, 1, 0.22], [0.54, 0.93, 1, 0.20], [-0.53, -0.88, 1, 0.18],
    ];
    let blows = 0;
    for (const [du, dv, count, power] of plan) {
      const u = Math.min(0.97, Math.max(0.03, u0 + du / W));
      const v = Math.min(0.94, Math.max(0.06, v0 + dv / H));
      for (let k = 0; k < count; k++) { p.applyHit(p.pointAt(u, v), power); blows++; }
    }
    return { blows, maxDepth: +p.field.stats().maxDepth.toFixed(3) };
  }, [id, cu, cv]);

  // ---------------------------------------------------------------- 3. pristine, both rooms
  await look(A, 0.5, 'graze', 2.2, 1.9, 'sd-01-passage-pristine');
  await look(B, 0.5, 'graze', 2.2, 1.9, 'sd-02-study-pristine');

  // ---------------------------------------------------------------- 4. dig from the PASSAGE
  const CU = 0.46, CV = 0.44;
  const cr = await crater(A, CU, CV);
  note(`crater on ${A}: ${cr.blows} blows, maxDepth ${cr.maxDepth}`);
  await step(10);
  await say('after digging A:  A', A);
  await say('after digging A:  B', B);
  await look(A, CU, 'graze', 2.2, 1.9, 'sd-03-passage-dug', 240, CV);
  await look(B, 1 - CU, 'graze', 2.2, 1.9, 'sd-04-study-after-A-dug', 240, CV);

  // ---------------------------------------------------------------- 5. dig the STUDY face too
  const cr2 = await crater(B, 1 - CU, CV);
  note(`crater on ${B}: ${cr2.blows} blows, maxDepth ${cr2.maxDepth}`);
  await step(10);
  await say('after digging B:  B', B);
  await look(B, 1 - CU, 'graze', 2.2, 1.9, 'sd-05-study-dug-from-the-study', 240, CV);
  await look(B, 1 - CU, 'face', 0, 3.0, 'sd-06-study-dug-headon', 240, CV);

  // ---------------------------------------------------------------- 6. the barrier terms on B
  const bp = await page.evaluate(([pid, pu, pv]) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(pid);
    const g = p.field;
    const cx = Math.min(g.cols - 1, Math.max(0, Math.floor(pu * g.cols)));
    const cy = Math.min(g.rows - 1, Math.max(0, Math.floor(pv * g.rows)));
    const i = g.idx(cx, cy);
    const m = p.barrierMaterial?.userData?.barrierUniforms;
    return {
      hasMesh: !!p.barrier, visible: !!p.barrier?.visible, barrier: g.barrier[i],
      depth: +g.depth[i].toFixed(3), smooth: +(g.data[i * 4 + 2] / 255).toFixed(3),
      showAt: m?.uShowAt?.value ?? -1, openAt: m?.uOpenAt?.value ?? -1,
      matVis: !!p.barrier?.material?.visible, side: p.barrier?.material?.side,
      emissive: m?.uEmissive?.value ?? null,
    };
  }, [B, 1 - CU, CV]);
  note(`   B barrier terms: ${JSON.stringify(bp)}`);

  // ---------------------------------------------------------------- 7. is it LIGHT?
  // ablate: raise the study's ambient/hemisphere and re-shoot the same station
  const lift = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const before = [];
    e.scene.traverse((o) => {
      if (o.isLight) { before.push([o.uuid, o.intensity]); o.intensity *= 3.0; }
    });
    window.__sd_before = before;
    return before.length;
  });
  note(`   lifted ${lift} lights x3 for the ablation`);
  await look(B, 1 - CU, 'graze', 2.2, 1.9, 'sd-07-study-dug-LIGHTS-x3', 90, CV);
  await page.evaluate(() => {
    const e = window.__rrr.engine;
    const m = new Map(window.__sd_before);
    e.scene.traverse((o) => { if (o.isLight && m.has(o.uuid)) o.intensity = m.get(o.uuid); });
  });

  pass('the diagnostic ran', 'see the notes');
}
