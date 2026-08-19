/**
 * 🖼️ **PHOTOGRAPH AN UNTOUCHED DIG FACE ON ARM 0 AND ARM 1, IN ONE FROZEN PAGE.**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_pris1-look.mjs \
 *        --port 5459 --q "seed=s4" --shots
 *
 * ⚠️ **`--q`, NEVER `--extra`.** ⚠️ **Start on arm 0** — the scenario flips the arm itself, and
 * flipping IN PLACE is the only honest form: `dressbin-1` measured `ballroom.centre` at
 * 423/461/479 calls on one build across a walk, and this project has recorded twice that two
 * page loads of `game.play` diverge in pose and glow with position and yaw pinned.
 *
 * ---------------------------------------------------------------------------------------------
 * THE QUESTION, AND IT IS A PICTURE
 * ---------------------------------------------------------------------------------------------
 * John: *"from the inside of the room the destructive wall IS the room asset — only when they
 * damage it can they see its white underneath."* Until 2026-08-11 every PRISTINE dig face in the
 * house was drawn from one shared damask `InstancedMesh`, so the room's coat was invisible until
 * a blow landed — `wall.js`'s own stated defect, *"a band of damask in a boiserie room gave away
 * the dig band before a blow landed"*, still happening. `_pris1-groups.mjs` proves the fix in
 * transforms and materials. **This file is the part a builder may not grade: the frames.**
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE CONTROLS — every one runs on every run
 * ---------------------------------------------------------------------------------------------
 *   L1  **The same-config FLOOR.** Two captures of the unchanged arm, taken between the two arms'
 *       captures, in the same frozen page. Every signal below is quoted against THIS, never
 *       against zero. "Byte-identical" is not the test and must never be demanded.
 *   L2  **The REVERT.** Arm 1 → arm 0 must come back inside the floor. If it does not, something
 *       latched and the pair is not an A/B of the coat — it is an A/B of the coat plus whatever
 *       the flip broke. This is `?cam=r10`'s failure, asserted instead of assumed.
 *   L3  **NOTHING OUTSIDE A DIG FACE MAY MOVE.** Every pixel of the frame that lies outside the
 *       projection of EVERY free face, counted between the two arms. The coat may only repaint
 *       dig faces; anything else moving means the flip is reaching geometry it must not.
 *       ⚠️ **The first build of this used "a rectangle 150 px to the left of the face" and that
 *       control was worthless** — it landed on ANOTHER dig face in two of three rooms and read
 *       13-19% moved. A guessed rectangle is not a control; the complement of the real
 *       projections is.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 AND IT ASKS WHAT IS IN FRONT BEFORE IT RULES — the dominant defect class on this project
 * ---------------------------------------------------------------------------------------------
 * If the face rect does not move, the two explanations are "the coat did not reach it" and
 * "something is standing in front of it", and they are not the same finding. So a flat reading
 * triggers a ray at the rect centre with instances EXPANDED and facing respected
 * (`_ap1-who.mjs`'s method — `--pick` cannot see an `InstancedMesh` at all), and the probe SKIPs
 * with the occluder NAMED rather than failing the build for someone else's slab.
 *
 * ⚠️ **THE FORCED RE-SYNC IS SYMMETRIC AND IT HAS TO BE.** `hold()` empties `engine._updaters`,
 * so `room.setViewpoints` — which is what normally calls `PanelInstances.sync()` — stops running.
 * `room.setWallMode(room.wallMode)` is a public no-op that forces one sync without touching
 * residency, and it is called **before every capture on both arms**, so it cannot be the
 * difference between them.
 */
import { hold, release } from '../still.mjs';
import { decodePng } from '../pxdiff.mjs';

/** Differing pixels inside one rectangle, plus that rectangle's mean luma in each frame. */
function rectDiff(a, b, r) {
  const A = decodePng(a), B = decodePng(b);
  if (A.width !== B.width || A.height !== B.height) throw new Error('size mismatch');
  const x0 = Math.max(0, Math.floor(r.x0)), x1 = Math.min(A.width - 1, Math.ceil(r.x1));
  const y0 = Math.max(0, Math.floor(r.y0)), y1 = Math.min(A.height - 1, Math.ceil(r.y1));
  const ch = A.channels;
  let n = 0, moved = 0, sum = 0, lumaA = 0, lumaB = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * A.width + x) * ch;
      let d = 0;
      for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(A.data[i + k] - B.data[i + k]));
      n++;
      if (d > 8) { moved++; sum += d; }
      lumaA += 0.2126 * A.data[i] + 0.7152 * A.data[i + 1] + 0.0722 * A.data[i + 2];
      lumaB += 0.2126 * B.data[i] + 0.7152 * B.data[i + 1] + 0.0722 * B.data[i + 2];
    }
  }
  return {
    px: n, moved, pct: n ? +(100 * moved / n).toFixed(3) : 0,
    meanDelta: moved ? +(sum / moved).toFixed(2) : 0,
    lumaA: n ? +(lumaA / n).toFixed(2) : 0, lumaB: n ? +(lumaB / n).toFixed(2) : 0,
  };
}

/** Moved pixels over the WHOLE frame, excluding every rectangle in `skipRects`. See L3. */
function frameDiffOutside(a, b, skipRects) {
  const A = decodePng(a), B = decodePng(b);
  const ch = A.channels;
  let n = 0, moved = 0;
  for (let y = 0; y < A.height; y++) {
    for (let x = 0; x < A.width; x++) {
      let inside = false;
      for (const r of skipRects) {
        if (x >= r.x0 - 2 && x <= r.x1 + 2 && y >= r.y0 - 2 && y <= r.y1 + 2) { inside = true; break; }
      }
      if (inside) continue;
      const i = (y * A.width + x) * ch;
      let d = 0;
      for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(A.data[i + k] - B.data[i + k]));
      n++;
      if (d > 8) moved++;
    }
  }
  return { px: n, moved, pct: n ? +(100 * moved / n).toFixed(3) : 0 };
}

export default async function pris1Look({ page, note, pass, fail, skip, shot }) {
  const wait = async (n) => { for (let i = 0; i < n; i++) await page.waitForTimeout(40); };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  const arm0 = await page.evaluate(() => Number(new URLSearchParams(location.search).get('coat') ?? 0) | 0);
  if (arm0 !== 0) { skip('the arm flip starts from the shipped arm', `page booted on ?coat=${arm0}`); return; }

  // ------------------------------------------------------------ pick one face per room
  const picks = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const want = ['gallery', 'study_w', 'study_e', 'ballroom'];
    const out = [];
    for (const rm of want) {
      const p = e.room.panels.find((q) => q.spec?.free && q.pristine
        && ((q.ownerSpace?.root?.name ?? '').slice(6) === rm));
      if (p) out.push({ id: p.id, room: rm, w: +p.width.toFixed(2), h: +p.height.toFixed(2) });
    }
    return out;
  });
  note(`free faces available: ${picks.map((p) => `${p.room}:${p.id} (${p.w}x${p.h})`).join(' · ')}`);
  const chosen = picks.filter((p) => ['gallery', 'study_w', 'study_e'].includes(p.room)).slice(0, 3);
  if (!chosen.length) { fail('a pristine dig face could be found in a named room', 'none'); return; }

  const setArm = (n) => page.evaluate(async (arm) => {
    const e = window.__rrr.engine;
    const wall = await import('/src/game/wall.js');
    const r = wall.setCoatArm(arm, e.room.panels, e.renderer);
    // ⚠️ symmetric — see the header. Forces `PanelInstances.sync()` while `hold()` has the
    // updaters parked, without touching residency.
    e.room.setWallMode(e.room.wallMode);
    return { ...r, faceGroups: e.room.panelCensus?.()?.instanced?.faceGroups ?? -1 };
  }, n);

  const rects = (id) => page.evaluate((pid) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(pid);
    const cvs = e.renderer.domElement;
    const sw = cvs.clientWidth, sh = cvs.clientHeight;
    const dpr = e.renderer.domElement.width / Math.max(1, sw);
    const box = (uvs) => {
      let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, behind = false;
      for (const [u, v] of uvs) {
        const q = p.pointAt(u, v).clone().project(e.camera);
        if (q.z > 1) behind = true;
        minx = Math.min(minx, (q.x * 0.5 + 0.5) * sw); maxx = Math.max(maxx, (q.x * 0.5 + 0.5) * sw);
        miny = Math.min(miny, (1 - (q.y * 0.5 + 0.5)) * sh); maxy = Math.max(maxy, (1 - (q.y * 0.5 + 0.5)) * sh);
      }
      return { x0: minx, x1: maxx, y0: miny, y1: maxy, behind };
    };
    /**
     * 🚨 **A POINT BEHIND THE CAMERA PROJECTS TO GARBAGE, AND THAT SILENTLY EMPTIED L3.** The
     * first build unioned every free face's rect without asking where the face was; one face
     * behind the camera produced a box covering the whole frame, so L3 "passed" on **0 px**. A
     * control that can pass on nothing is not a control. So: a face entirely behind the camera
     * contributes NOTHING (it draws nothing), a face entirely in front contributes its clamped
     * rect, and a face STRADDLING the camera plane has an unbounded footprint and disqualifies
     * the whole control, which then SKIPs rather than ruling.
     */
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const V3c = e.camera.position.constructor;
    /**
     * The face quad CLIPPED AGAINST THE NEAR PLANE, then projected — not four `project()` calls.
     *
     * 🚨 **A POINT BEHIND THE CAMERA PROJECTS TO GARBAGE AND THAT SILENTLY EMPTIED L3.** The
     * first build unioned four raw `project()` results per face; one face straddling the camera
     * plane produced a box covering the whole frame, so L3 "passed" on **0 px**. A control that
     * can pass on nothing is not a control. Sutherland–Hodgman against `z < -near` in camera
     * space gives every face a bounded, correct screen footprint, so the exclusion set is exact
     * and the denominator is asserted below.
     */
    const boxOf = (q) => {
      const near = e.camera.near + 1e-3;
      let poly = [[0, 0], [1, 0], [1, 1], [0, 1]]
        .map(([u, v]) => q.pointAt(u, v).clone().applyMatrix4(e.camera.matrixWorldInverse));
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const ain = -a.z >= near, bin = -b.z >= near;
        if (ain) out.push(a);
        if (ain !== bin) {
          const t = (-near - a.z) / (b.z - a.z);
          out.push(new V3c(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t));
        }
      }
      if (!out.length) return { skip: true };
      let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
      for (const v of out) {
        const n = v.clone().applyMatrix4(e.camera.projectionMatrix);
        const x = (n.x * 0.5 + 0.5) * sw, y = (1 - (n.y * 0.5 + 0.5)) * sh;
        minx = Math.min(minx, x); maxx = Math.max(maxx, x);
        miny = Math.min(miny, y); maxy = Math.max(maxy, y);
      }
      return {
        x0: clamp(minx, 0, sw), x1: clamp(maxx, 0, sw),
        y0: clamp(miny, 0, sh), y1: clamp(maxy, 0, sh),
      };
    };
    // 🎯 L3's exclusion set: EVERY free face's projection, not a guessed rectangle beside one.
    const boxes = e.room.panels.filter((q) => q.spec?.free).map(boxOf);
    const all = boxes.filter((b) => !b.skip);
    const straddle = 0;
    return {
      face: box([[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]]),
      all, straddle, faces: boxes.length, sw, sh, dpr,
    };
  }, id);

  /**
   * 🚨 The NEAREST DRAWN mesh along the ray through a face's centre — instances expanded, facing
   * respected, exactly as `_ap1-who.mjs` argues. A raycast does not cull, so a hit whose material
   * `side` would have discarded it is marked and skipped rather than reported as present.
   */
  const nearestDrawn = (id) => page.evaluate((pid) => {
    const e = window.__rrr.engine;
    const cam = e.camera, p = e.room.panelOf(pid);
    const V3 = cam.position.constructor, M4 = cam.matrixWorld.constructor;
    const items = [];
    e.scene.traverse((o) => {
      if (!o.isMesh) return;
      for (let q = o; q; q = q.parent) if (q.visible === false) return;
      const g = o.geometry;
      if (!g?.attributes?.position) return;
      if (!g.boundingSphere) g.computeBoundingSphere();
      const side = o.material?.side ?? 0;
      const nm = o.material?.name || '';
      if (o.isInstancedMesh) {
        const a = o.instanceMatrix.array;
        for (let i = 0; i < o.count; i++) {
          if (Math.hypot(a[i * 16], a[i * 16 + 1], a[i * 16 + 2]) < 1e-6) continue;
          items.push({ g, label: `${o.name || '?'}#${i}`, mat: nm, side,
            inv: new M4().fromArray(a, i * 16).premultiply(o.matrixWorld).invert() });
        }
        return;
      }
      items.push({ g, label: o.name || '?', mat: nm, side, inv: o.matrixWorld.clone().invert() });
    });
    const tri = (it, o, d) => {
      const g = it.g, pa = g.attributes.position, bs = g.boundingSphere, out = [];
      if (bs) {
        const cx = bs.center.x - o.x, cy = bs.center.y - o.y, cz = bs.center.z - o.z;
        const t = cx * d.x + cy * d.y + cz * d.z;
        const dx = cx - t * d.x, dy = cy - t * d.y, dz = cz - t * d.z;
        if (dx * dx + dy * dy + dz * dz > bs.radius * bs.radius) return out;
      }
      const pp = pa.array, idx = g.index ? g.index.array : null;
      const n = idx ? idx.length : pa.count;
      for (let t3 = 0; t3 < n; t3 += 3) {
        const a = (idx ? idx[t3] : t3) * 3, b = (idx ? idx[t3 + 1] : t3 + 1) * 3, c = (idx ? idx[t3 + 2] : t3 + 2) * 3;
        const e1x = pp[b] - pp[a], e1y = pp[b + 1] - pp[a + 1], e1z = pp[b + 2] - pp[a + 2];
        const e2x = pp[c] - pp[a], e2y = pp[c + 1] - pp[a + 1], e2z = pp[c + 2] - pp[a + 2];
        const hx = d.y * e2z - d.z * e2y, hy = d.z * e2x - d.x * e2z, hz = d.x * e2y - d.y * e2x;
        const det = e1x * hx + e1y * hy + e1z * hz;
        if (Math.abs(det) < 1e-14) continue;
        const iv = 1 / det;
        const sx = o.x - pp[a], sy = o.y - pp[a + 1], sz = o.z - pp[a + 2];
        const uu = (sx * hx + sy * hy + sz * hz) * iv;
        if (uu < 0 || uu > 1) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
        const vv = (d.x * qx + d.y * qy + d.z * qz) * iv;
        if (vv < 0 || uu + vv > 1) continue;
        const tt = (e2x * qx + e2y * qy + e2z * qz) * iv;
        if (tt > 1e-6) out.push({ t: tt, front: det > 0 });
      }
      return out;
    };
    const cvs = e.renderer.domElement, sw = cvs.clientWidth, sh = cvs.clientHeight;
    const q = p.pointAt(0.5, 0.5).clone().project(cam);
    const px = (q.x * 0.5 + 0.5) * sw, py = (1 - (q.y * 0.5 + 0.5)) * sh;
    const nearP = new V3((px / sw) * 2 - 1, -(py / sh) * 2 + 1, -1).unproject(cam);
    const farP = new V3((px / sw) * 2 - 1, -(py / sh) * 2 + 1, 1).unproject(cam);
    const dirW = farP.clone().sub(nearP).normalize();
    const all = [];
    for (const it of items) {
      const o = cam.position.clone().applyMatrix4(it.inv);
      const tip = cam.position.clone().add(dirW).applyMatrix4(it.inv);
      const d = tip.sub(o); const len = d.length();
      if (len < 1e-12) continue;
      d.multiplyScalar(1 / len);
      for (const h of tri(it, o, d)) {
        const drawn = it.side === 2 || (it.side === 0 ? h.front : !h.front);
        if (drawn) all.push({ name: it.label, mat: it.mat, dist: +(h.t / len).toFixed(3) });
      }
    }
    all.sort((a, b) => a.dist - b.dist);
    const mine = all.findIndex((h) => h.name.startsWith('wall.pristine.face'));
    return { list: all.slice(0, 6), faceAt: mine, inFront: mine < 0 ? all.slice(0, 4) : all.slice(0, mine) };
  }, id);

  for (const pick of chosen) {
    // ---- park head-on, sim RUNNING, then settle so the boom arrives (still.mjs's order) ----
    const parked = await page.evaluate((pid) => {
      const e = window.__rrr.engine;
      const p = e.room.panelOf(pid);
      const n = p.normal, c = p.pointAt(0.5, 0.5);
      const d = Math.min(3.4, Math.max(2.2, p.width * 0.55));
      e.player.pos.set(c.x + n.x * d, e.room.floorY, c.z + n.z * d);
      e.player.vel.set(0, 0, 0);
      e.player.facing = Math.atan2(-n.x, -n.z);
      if (e.cam) { e.cam.yaw = e.player.facing; e.cam.pitch = 0; e.cam._first = true; }
      return { space: e.room.spaceAt(e.player.pos)?.id ?? null, d: +d.toFixed(2) };
    }, pick.id);
    await wait(50);

    const rr = await rects(pick.id);
    if (rr.face.behind || rr.face.x1 - rr.face.x0 < 40 || rr.face.y1 - rr.face.y0 < 40) {
      skip(`${pick.room} — the face is framed`, `rect ${JSON.stringify(rr.face)} — too small or behind the camera`);
      continue;
    }
    note(`${pick.room} · ${pick.id} · parked in ${parked.space} at ${parked.d} m · `
      + `face rect ${Math.round(rr.face.x1 - rr.face.x0)}x${Math.round(rr.face.y1 - rr.face.y0)} px`);

    const pinned = await hold(page);
    await wait(4);
    await setArm(0);                       // symmetric forced re-sync — see the header
    await wait(3);
    const a0 = await page.screenshot({ animations: 'disabled' });
    await wait(6);
    await setArm(0);
    await wait(3);
    const a0b = await page.screenshot({ animations: 'disabled' });   // L1 floor
    const on = await setArm(1);
    await wait(6);
    const a1 = await page.screenshot({ animations: 'disabled' });
    await setArm(0);
    await wait(6);
    const a0c = await page.screenshot({ animations: 'disabled' });   // L2 revert
    await release(page);

    const floor = rectDiff(a0, a0b, rr.face);
    const signal = rectDiff(a0, a1, rr.face);
    const revert = rectDiff(a0, a0c, rr.face);
    const outFloor = frameDiffOutside(a0, a0b, rr.all);
    const outSignal = frameDiffOutside(a0, a1, rr.all);
    note(`   renderScale pinned ${pinned?.pinned?.renderScale} · arm 1 moved ${on.changed} faces, `
      + `${on.faceGroups} face groups, programs ${on.programs}`);
    note(`   FACE rect: floor ${floor.pct}% · ARM 0→1 ${signal.pct}% (mean Δ ${signal.meanDelta}) · `
      + `revert ${revert.pct}% · luma ${floor.lumaA} → ${signal.lumaB}`);
    note(`   OUTSIDE every free-face projection (${outSignal.px} px): floor ${outFloor.pct}% · `
      + `ARM 0→1 ${outSignal.pct}%`);

    // the frames, on disk, both arms
    await page.evaluate(async (arm) => {
      const e = window.__rrr.engine;
      const wallm = await import('/src/game/wall.js');
      wallm.setCoatArm(arm, e.room.panels, e.renderer);
      e.room.setWallMode(e.room.wallMode);
    }, 0);
    await wait(3);
    const f0 = await shot(`pris1-${pick.room}-coat0`);
    await page.evaluate(async (arm) => {
      const e = window.__rrr.engine;
      const wallm = await import('/src/game/wall.js');
      wallm.setCoatArm(arm, e.room.panels, e.renderer);
      e.room.setWallMode(e.room.wallMode);
    }, 1);
    await wait(3);
    const f1 = await shot(`pris1-${pick.room}-coat1`);
    await page.evaluate(async () => {
      const e = window.__rrr.engine;
      const wallm = await import('/src/game/wall.js');
      wallm.setCoatArm(0, e.room.panels, e.renderer);
      e.room.setWallMode(e.room.wallMode);
    });
    if (f0 && f1) note(`   frames: ${f0} · ${f1}`);

    if (floor.pct > 0.5) {
      fail(`L1 CONTROL — ${pick.room}: the same-config floor is small`,
        `${floor.pct}% of the face rect moved between two captures of the UNCHANGED arm. Every `
        + 'signal below is against this, and at this size the comparison cannot rule.');
    } else {
      pass(`L1 CONTROL — ${pick.room}: the same-config floor is ${floor.pct}%`,
        `two captures of arm 0 in the same frozen page, ${floor.px} px of face rect. This is what `
        + 'the arm-flip signal is measured against — never against zero.');
    }

    if (signal.pct > Math.max(3, floor.pct * 10)) {
      pass(`${pick.room} — the coat is VISIBLE on an untouched face: ${signal.pct}% of the rect moved`,
        `mean Δ ${signal.meanDelta} on a ${floor.pct}% same-config floor; rect luma `
        + `${signal.lumaA} → ${signal.lumaB}. Nothing was struck: this face is `
        + 'pristine and is drawn by the shared instance, which is the whole point.');
    } else {
      // 🚨 "the coat did not reach it" and "something is in front of it" are different findings.
      const who = await nearestDrawn(pick.id);
      for (const h of who.list) note(`      d=${String(h.dist).padStart(7)} ${h.name.slice(0, 46)} [${h.mat.slice(0, 40)}]`);
      if (who.inFront.length) {
        skip(`${pick.room} — the coat is VISIBLE on an untouched face`,
          `only ${signal.pct}% moved on a ${floor.pct}% floor, AND ${who.inFront.length} drawn `
          + `mesh(es) stand in front of the face at its own centre: `
          + `${who.inFront.map((h) => `${h.name.slice(0, 34)}@${h.dist}`).join(', ')}. `
          + 'A probe that cannot observe must SKIP. `_pris1-groups.mjs` proves by world-matrix '
          + 'match that this face IS drawing its own coat; what a player sees here is somebody '
          + 'else\'s geometry, and that is a separate, pre-existing defect.');
      } else {
        fail(`${pick.room} — the coat is VISIBLE on an untouched face`,
          `only ${signal.pct}% moved against a ${floor.pct}% floor, and NOTHING is drawn in front `
          + 'of the face — the arm flip is genuinely not reaching the pristine face in this room.');
      }
    }

    if (revert.pct <= Math.max(0.5, floor.pct * 3)) {
      pass(`L2 CONTROL — ${pick.room}: arm 1 → arm 0 is a COMPLETE revert (${revert.pct}%)`,
        `back inside the ${floor.pct}% floor, so the ${signal.pct}% above is the coat and not `
        + 'something the flip latched.');
    } else {
      fail(`L2 CONTROL — ${pick.room}: arm 1 → arm 0 is a COMPLETE revert`,
        `${revert.pct}% still differs after flipping back, against a ${floor.pct}% floor.`);
    }

    const frameArea = rr.sw * rr.sh;
    if (outSignal.px < frameArea * 0.2) {
      skip(`L3 CONTROL — ${pick.room}: NOTHING outside a dig face moves`,
        `only ${outSignal.px} px of ${frameArea} are left outside the exclusion set (${rr.all.length} `
        + `of ${rr.faces} free faces have a screen footprint) — a control that can only look at a `
        + 'sliver cannot rule. THE DENOMINATOR IS ASSERTED because the first build of L3 passed '
        + 'on exactly zero pixels and read as green.');
    } else if (outSignal.pct <= Math.max(0.5, outFloor.pct * 3 + 0.2)) {
      pass(`L3 CONTROL — ${pick.room}: NOTHING outside a dig face moves (${outSignal.pct}%)`,
        `${outSignal.px} px of frame outside every free face's projection, on a ${outFloor.pct}% `
        + `floor, while the face rect moved ${signal.pct}%. The coat repaints dig faces and `
        + 'nothing else — the room\'s own wall, its dressing, the floor and the robot are untouched.');
    } else {
      fail(`L3 CONTROL — ${pick.room}: NOTHING outside a dig face moves`,
        `${outSignal.pct}% of the frame outside every free-face projection moved, on a `
        + `${outFloor.pct}% floor — the flip is reaching geometry that is not a dig face.`);
    }
  }
}
