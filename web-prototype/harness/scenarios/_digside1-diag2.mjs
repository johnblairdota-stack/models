/**
 * 🔎 TEMP DIAGNOSTIC 2 (dig-side-1)
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_digside1-diag2.mjs \
 *        --port 5362 --q "seed=s4&dig=1" --shots
 *
 * Two questions left after diag 1:
 *   Q1 — does the SCALAR drive `dig-shots.mjs` uses (`p.damage(1e5)` x8, the `?dig=bays`
 *        vocabulary) move a FREE face's picture at all? If not, `critic-slice-1`'s pair is two
 *        photographs of an undug wall.
 *   Q2 — what are the black bands on the PRISTINE passage face? Dressing, shadow, or the
 *        pristine instanced mesh itself? Raycast the pixels and name the mesh.
 */

export default async function diag2({ page, note, pass, fail, shot, snap }) {
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
  await page.evaluate(() => {
    const e = window.__rrr.engine;
    if (!e.hunter) return;
    e.hunter.update = () => {};
    if (e.room?.spawn?.hunter) e.hunter.root.position.copy(e.room.spawn.hunter);
    e.hunter.state = 'PATROL'; e.hunter.target = null; e.hunter.awareness = 0;
    for (const s of ['shoulderR', 'shoulderL', 'hipR', 'hipL']) {
      if (e.player.rig?.occupant?.(s) === 'empty') e.player.rig.refit?.(s);
    }
  });

  const A = 'f.svc_w.1.a', B = 'f.svc_w.1.b';

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
      return { standable: ok, pulled: +(1 - k).toFixed(2) };
    }, [pid, cu, mode, along, out, cv]);

  const stats = async (tag) => {
    const b = await snap(tag);
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
      const lum = []; let dark = 0, teal = 0, n = 0;
      for (let y = 0; y < bmp.height * 0.86; y += 3) {
        for (let x = 0; x < bmp.width; x += 3) {
          const o = (y * bmp.width + x) * 4;
          const r = d[o], g3 = d[o + 1], b3 = d[o + 2];
          lum.push(0.299 * r + 0.587 * g3 + 0.114 * b3); n++;
          if (0.299 * r + 0.587 * g3 + 0.114 * b3 < 24) dark++;
          if (b3 >= 34 && b3 > r * 1.55 && g3 > r * 1.20) teal++;
        }
      }
      lum.sort((p, q) => p - q);
      return { median: Math.round(lum[lum.length >> 1]), dark: +(dark / n * 100).toFixed(1),
        teal: +(teal / n * 100).toFixed(2) };
    }, b.toString('base64'));
  };

  // ================================================================= Q1
  const before = await page.evaluate((pid) => {
    const p = window.__rrr.engine.room.panelOf(pid);
    const st = p.field.stats();
    return { stage: p.state.stage, name: p.state.def.name, pristine: p.pristine,
      instanced: !!p.instanced, hits: st.hits, maxDepth: st.maxDepth,
      barrierVis: !!p.barrier?.visible, layerVis: p.layers.map((m) => +m.visible).join('') };
  }, A);
  note(`Q1 before: ${JSON.stringify(before)}`);
  await park(A, 0.5, 'graze', 2.2, 1.9);
  await step(240);
  await shot('sd2-01-pristine-passage');
  note(`   sd2-01 ${JSON.stringify(await stats('sd2-01-pristine-passage'))}`);

  // the EXACT drive `dig-shots.mjs` uses for its "terminal" stage
  const after = await page.evaluate((pid) => {
    const p = window.__rrr.engine.room.panelOf(pid);
    const saved = p.onBreak; p.onBreak = null;
    for (let i = 0; i < 8; i++) p.damage(1e5, { weapon: 'nailgun' });
    p.onBreak = saved;
    const st = p.field.stats();
    return { stage: p.state.stage, name: p.state.def.name, pristine: p.pristine,
      instanced: !!p.instanced, hits: st.hits, maxDepth: st.maxDepth,
      barrierVis: !!p.barrier?.visible, layerVis: p.layers.map((m) => +m.visible).join('') };
  }, A);
  note(`Q1 after  p.damage(1e5) x8: ${JSON.stringify(after)}`);
  await step(60);
  await shot('sd2-02-after-scalar-terminal');
  note(`   sd2-02 ${JSON.stringify(await stats('sd2-02-after-scalar-terminal'))}`);
  const same = await page.evaluate(async ([a64, b64]) => {
    const dec = async (s) => {
      const bin = atob(s);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([arr], { type: 'image/png' }));
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(bmp, 0, 0);
      return { w: bmp.width, h: bmp.height, d: g.getImageData(0, 0, bmp.width, bmp.height).data };
    };
    const X = await dec(a64), Y = await dec(b64);
    if (X.w !== Y.w) return null;
    let moved = 0, total = 0;
    for (let y = 0; y < X.h * 0.86; y++) {
      for (let x = 0; x < X.w; x++) {
        const o = (y * X.w + x) * 4;
        const la = 0.299 * X.d[o] + 0.587 * X.d[o + 1] + 0.114 * X.d[o + 2];
        const lb = 0.299 * Y.d[o] + 0.587 * Y.d[o + 1] + 0.114 * Y.d[o + 2];
        total++; if (Math.abs(la - lb) > 3) moved++;
      }
    }
    return +(moved / total * 100).toFixed(2);
  }, [(await snap('sd2-01-pristine-passage')).toString('base64'),
    (await snap('sd2-02-after-scalar-terminal')).toString('base64')]);
  note(`Q1 pixels that moved between pristine and "terminal": ${same}%`);
  same != null && same < 1.0
    ? pass('the scalar drive cannot dig a free face',
      `p.damage(1e5) x8 moved ${same}% of the frame; field hits ${after.hits}, maxDepth ${after.maxDepth}`)
    : fail('the scalar drive cannot dig a free face', `${same}% of the frame moved`);

  // ================================================================= Q2
  await page.evaluate((pid) => window.__rrr.engine.room.panelOf(pid).resetDamage(), A);
  await park(A, 0.5, 'graze', 2.2, 1.9);
  await step(90);
  const picks = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const THREE = window.__rrr.THREE ?? e.THREE;
    const cam = e.camera ?? e.cam?.camera ?? e.pipeline?.camera;
    if (!cam || !THREE) return { err: `cam ${!!cam} THREE ${!!THREE}` };
    const rc = new THREE.Raycaster();
    const out = [];
    const pts = [[0.62, 0.10], [0.70, 0.22], [0.78, 0.10], [0.86, 0.30], [0.62, 0.40],
      [0.72, 0.32], [0.90, 0.18], [0.66, 0.26], [0.80, 0.42], [0.95, 0.35]];
    for (const [nx, ny] of pts) {
      rc.setFromCamera(new THREE.Vector2(nx * 2 - 1, -(ny * 2 - 1)), cam);
      const hit = rc.intersectObjects(e.scene.children, true)
        .filter((h) => h.object.visible && h.object.type !== 'Points')[0];
      out.push(hit
        ? { at: [nx, ny], name: hit.object.name || '(unnamed)', type: hit.object.type,
          mat: hit.object.material?.name || '(mat?)', d: +hit.distance.toFixed(2) }
        : { at: [nx, ny], name: 'MISS' });
    }
    return { out };
  });
  note(`Q2 raycast picks on the pristine passage face:`);
  for (const p of picks.out ?? []) note(`   ${JSON.stringify(p)}`);
  if (picks.err) note(`   ⚠️ ${picks.err}`);

  // ablate the shadow map
  await page.evaluate(() => { window.__rrr.engine.renderer.shadowMap.enabled = false; });
  await step(60);
  await shot('sd2-03-no-shadowmap');
  note(`   sd2-03 no shadow map ${JSON.stringify(await stats('sd2-03-no-shadowmap'))}`);
  await page.evaluate(() => { window.__rrr.engine.renderer.shadowMap.enabled = true; });

  // ablate the dressing
  const hid = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const names = [];
    e.scene.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      if (/dress|board|plank|chain|padlock|hasp|batten|seam/i.test(o.name || '')) {
        if (o.visible) { o.visible = false; names.push(o.name); }
      }
    });
    window.__sd_hid = names;
    return names;
  });
  note(`Q2 hid ${hid.length} dressing meshes: ${hid.slice(0, 12).join(', ')}`);
  await step(60);
  await shot('sd2-04-no-dressing');
  note(`   sd2-04 ${JSON.stringify(await stats('sd2-04-no-dressing'))}`);

  // and the full inventory of what is drawing in the wall band, by name
  const inv = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const out = [];
    e.scene.traverse((o) => {
      if (!(o.isMesh || o.isInstancedMesh)) return;
      const p = new (o.position.constructor)();
      o.getWorldPosition(p);
      if (Math.abs(p.x + 1.85) < 0.9 && p.z > -19.5 && p.z < -13.0) {
        out.push(`${o.name || '(unnamed)'} [${o.type}] vis=${o.visible} `
          + `at ${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)} mat=${o.material?.name || '?'}`);
      }
    });
    return out;
  });
  note(`Q2 meshes standing in the svc_w span-1 wall band (${inv.length}):`);
  for (const s of inv.slice(0, 30)) note(`   ${s}`);

  pass('diagnostic 2 ran', '');
}
