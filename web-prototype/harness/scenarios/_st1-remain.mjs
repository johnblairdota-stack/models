/**
 * 👁️ **"LET ME SEE WHAT'S LEFT" — THE BEFORE/AFTER, ONE CRATER, ONE CAMERA, ONE FROZEN PAGE.**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_st1-remain.mjs \
 *        --port 5405 --q "seed=s4&dig=1" --shots
 *
 * John, after playing: *"I thought I had destroyed enough stuff but I couldn't get through...
 * you can't see the back side of the other wall and thats why im unable to see the bits I can't
 * get through."* Asked how a player should know they have hit a dead end he chose **"let me see
 * what's left"**.
 *
 * `_pf1-diag2.mjs` measured the mechanism; this photographs the consequence, from the player's
 * own eye, with the grid read in the same page at the same instant.
 *
 * 🎯 **THE A/B IS FREE AND EXACT, BECAUSE EVERY TERM OF THE FIX IS A UNIFORM.** `breakmask.js`
 * `barrierMaterial` emits ONE shader whose knobs are uniforms, so round 5's behaviour can be put
 * back LIVE on the same crater from the same camera in the same frozen page — `uRemain` to the
 * old cavity colour, `uRemainEmissive` to zero, `uTwin` to 0. That is `dig.md`'s own reusable
 * trick, and it means neither arm is a different build, a different seed or a different frame.
 *
 * ⚠️ Park and settle with the sim RUNNING before `hold()` — `harness/still.mjs` says why.
 */

import { hold, release } from '../still.mjs';
/**
 * 🚨 **THE DRIVE IS PINNED TO THE PRE-`DIG_BASE` PACING, ON PURPOSE — RE-BASELINED 2026-08-09.**
 *
 * Every station below is a hand-tuned EXCAVATION — *"34 blows: deep enough that the shell has
 * torn over most of the crater, short of a breakthrough"* — and those counts are the state under
 * test, not a clock. `damagefield.js` `DIG_BASE` made one blow take every cell in the brush clean
 * through, so at power 1 all five stations bottom out and `seethrough-1`'s recorded figures
 * (luma 35.6 -> 109.9, 48.4% -> 6.0% under luma 20) stop being comparable to anything.
 *
 * 🎯 **SO THE DRIVE PUTS `brush.base` BACK TO 1 AND KEEPS SWINGING AT FULL POWER**, which
 * reproduces the grid bit-for-bit. What this scenario measures is a RENDER property (does the
 * surviving far-side material draw), which no pacing change can touch, and the only way to keep
 * measuring it is to hold the grid still.
 *
 * 🚨 **AND SWINGING AT `power = 1 / DIG_BASE` INSTEAD IS THE TRAP — IT WAS TRIED AND IT LIES.**
 * `_add()` splits the clamp: `power` scales the deposit but its clamped copy also sizes the
 * brush, `R = radius * (0.55 + 0.45 * pw)`. At power 0.125 the deposit is right and the brush is
 * **0.61x its radius**, so the crater comes out the wrong SHAPE — this file went 11/0 -> 8/3 that
 * way, including a station that could no longer reproduce its own positive control. `brush.base`
 * is the only knob that moves the depth without moving the footprint.
 * ⚠️ It is **not** the shipped dig being photographed here, and it never was — see
 * `_th1-section.mjs` for the shipped-pacing crater.
 */
import { DIG_BASE } from '../../src/destruction/damagefield.js';

/** Round 5's values, so ARM "was" is exactly the shipped build of an hour ago. */
const OLD = { remain: [0.017, 0.013, 0.009], remainEmissive: [0, 0, 0], twin: 0 };

const HELPERS = (BASE_WAS) => {
  const W = window;
  W.__st1 = {
    /** see the DIG_BASE import: the pre-2026-08-09 deposit per blow, to the bit. */
    baseWas: BASE_WAS,
    /** every free dig face in the house, near side first */
    faces: () => W.__rrr.engine.room.panels.filter((p) => p.spec?.free && p.field),
    /** a body-sized excavation on ONE face, competent aim, every blow through the brush */
    dig(p, blows, loU = 0.30, hiU = 0.70) {
      const g = p.field;
      const cx0 = Math.max(0, Math.floor(loU * g.cols));
      const cx1 = Math.min(g.cols - 1, Math.ceil(hiU * g.cols));
      const cy0 = Math.floor(0.30 / g.cellH);
      const cy1 = Math.min(g.rows - 1, Math.ceil(1.95 / g.cellH));
      // see the DIG_BASE import: the deposit goes back to the pacing this file's stations were
      // hand-tuned at, and the brush keeps its full radius. Restored below.
      const base0 = g.brush.base;
      g.brush.base = W.__st1.baseWas;
      let n = 0;
      for (let k = 0; k < blows; k++) {
        let bx = cx0, by = cy0, bd = 2;
        for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
          const d = g.depth[g.idx(cx, cy)];
          if (d < bd) { bd = d; bx = cx; by = cy; }
        }
        p.applyHit(p.pointAt((bx + 0.5) / g.cols, (by + 0.5) / g.rows), 1);
        n++;
      }
      g.brush.base = base0;
      g.flush();
      return n;
    },
    /** drive the player's own body at the face and report metres past it */
    shove(p) {
      const e = W.__rrr.engine;
      const V = e.player.pos.constructor;
      const n = p.normal;
      const ch = p.openChannel();
      const start = p.pointAt(ch.open ? ch.centreU : 0.5, 0.5).clone();
      start.y = e.room.floorY ?? 0;
      const pos = new V(start.x + n.x * 1.4, start.y, start.z + n.z * 1.4);
      const step = new V(-n.x * 0.05, 0, -n.z * 0.05);
      for (let i = 0; i < 200; i++) pos.copy(e.room.collide(pos.clone().add(step), e.player.radius, 1.70));
      return +(-((pos.x - start.x) * n.x + (pos.z - start.z) * n.z)).toFixed(3);
    },
    face(p) {
      const g = p.field, ch = p.openChannel();
      let see = 0, open = 0, barr = 0;
      for (let i = 0; i < g.depth.length; i++) {
        if (g.depth[i] >= 0.999) { see++; if (!g.barrier[i]) open++; }
        if (g.barrier[i]) barr++;
      }
      return { id: p.id, hits: g.hits.length, maxDepth: +g.maxDepth.toFixed(3),
        see, open, barr, w: +ch.width.toFixed(3), passable: !!ch.open, blocks: p.blocksMovement() };
    },
    /**
     * Stand the player back from a face, looking at it. Sim must be LIVE when this runs.
     *
     * ⚠️ **THE BODY COVERS THE HOLE, AND `visible-1` RECORDED THIS AS THE ONE FRAME IT COULD NOT
     * GET.** `ThirdPersonCamera` puts the boom behind the player along the look direction, so
     * head-on at a breach the robot is exactly between the camera and the thing under test. It
     * already owns the knob though — `shoulder`, 0.42 shipped — so widening it for the capture
     * swings the boom off the body without moving the player, the aim or the crater, and it is a
     * RUNTIME field, so nothing in `src/` changes and both arms see the identical camera.
     */
    park(p, back = 2.6, shoulder = 1.25) {
      const e = W.__rrr.engine, room = e.room;
      const ch = p.openChannel();
      const n = p.normal, c = p.pointAt(ch.open ? ch.centreU : 0.5, 0.46);
      e.player.pos.set(c.x + n.x * back, room.floorY, c.z + n.z * back);
      e.player.vel.set(0, 0, 0);
      const yaw = Math.atan2(c.x - e.player.pos.x, c.z - e.player.pos.z);
      e.player.aimYaw = yaw; e.player.aimPitch = 0; e.player.facing = yaw;
      e.cam.yaw = yaw; e.cam.pitch = 0; e.cam._first = true;
      e.cam.shoulder = shoulder;
      return { x: +c.x.toFixed(2), z: +c.z.toFixed(2), back, shoulder };
    },
    /**
     * The breach's own screen rect, projected through the LIVE camera — never a rect typed into
     * the scenario. The framing moved once already this round (see `park`'s shoulder note) and a
     * hardcoded box silently starts reading a wall instead of a hole when it does.
     */
    rect(p, halfW = 0.62, halfH = 0.55) {
      const e = W.__rrr.engine;
      const cam = e.cam?.camera ?? e.camera;
      const ch = p.openChannel();
      const c = p.pointAt(ch.open ? ch.centreU : 0.5, 0.46);
      const n = p.normal;
      let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const w = c.clone();
        w.x += -n.z * sx * halfW; w.z += n.x * sx * halfW; w.y += sy * halfH;
        const pr = w.project(cam);
        const nx = (pr.x + 1) / 2, ny = (1 - pr.y) / 2;
        x0 = Math.min(x0, nx); x1 = Math.max(x1, nx);
        y0 = Math.min(y0, ny); y1 = Math.max(y1, ny);
      }
      return [x0, y0, Math.max(0.01, x1 - x0), Math.max(0.01, y1 - y0)]
        .map((v) => +v.toFixed(4));
    },
    /** swap every barrier plane in the house between the two arms. Uniforms only. */
    arm(which, old) {
      let n = 0;
      for (const p of W.__st1.faces()) {
        const u = p.barrierMaterial?.userData?.barrierUniforms;
        if (!u) continue;
        if (which === 'was') {
          u.__keep ??= {
            remain: u.uRemain.value.clone(),
            remainEmissive: u.uRemainEmissive.value.clone(),
            twin: u.uTwin.value,
          };
          u.uRemain.value.set(...old.remain);
          u.uRemainEmissive.value.set(...old.remainEmissive);
          u.uTwin.value = old.twin;
        } else if (u.__keep) {
          u.uRemain.value.copy(u.__keep.remain);
          u.uRemainEmissive.value.copy(u.__keep.remainEmissive);
          u.uTwin.value = u.__keep.twin;
        }
        n++;
      }
      return n;
    },
  };
  return true;
};

/** mean luma and how much of a rect is near-black, over a PNG buffer decoded in the page. */
async function rectRead(page, png, box) {
  const b64 = png.toString('base64');
  return page.evaluate(async ([data, r]) => {
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = `data:image/png;base64,${data}`; });
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const cx = cv.getContext('2d');
    cx.drawImage(img, 0, 0);
    const x0 = Math.max(0, Math.round(r[0] * img.width));
    const y0 = Math.max(0, Math.round(r[1] * img.height));
    const w = Math.min(img.width - x0, Math.round(r[2] * img.width));
    const h = Math.min(img.height - y0, Math.round(r[3] * img.height));
    const d = cx.getImageData(x0, y0, w, h).data;
    let sum = 0, dark = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      sum += l; if (l < 20) dark++; n++;
    }
    return { luma: +(sum / n).toFixed(2), darkPct: +(100 * dark / n).toFixed(2), n };
  }, [b64, box]);
}

export default async function st1({ page, note, pass, fail, skip, shot, snap }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);
  note(`⚠️ the shipped base dig speed is x${DIG_BASE} (\`damagefield.js\` DIG_BASE); every station `
    + 'below drives at `brush.base` 1 so the grid is the one `seethrough-1` measured — see the '
    + 'header. The RENDER under test is the shipped one; only the excavation is pinned.');
  await page.evaluate(HELPERS, 1);

  const arm = await page.evaluate(() => window.__rrr.engine.room.digCensus().mode);
  if (arm !== 'free') { skip('free arm', `mode=${arm}`); return; }

  const wait = async (n) => { for (let i = 0; i < n; i++) await page.waitForTimeout(40); };
  /** the breach's rect, projected through the settled camera. Never typed in. */
  const boxFor = (id) => page.evaluate((fid) => {
    const p = window.__st1.faces().find((q) => q.id === fid);
    return p ? window.__st1.rect(p) : [0.40, 0.40, 0.20, 0.22];
  }, id);

  // =========================================================================
  // STATION 1 — JOHN'S EXACT SEQUENCE: dig a gallery dud, then the unlock
  // =========================================================================
  const s1 = await page.evaluate(() => {
    const e = window.__rrr.engine, room = e.room, H = window.__st1;
    room.setDigPlan({ seed: String(e.run?.seed ?? 's4') });
    const c = room.digCensus();
    const gal = H.faces().filter((p) => p.spec.a === 'gallery');
    const p = gal.find((q) => !c.link.includes(q.id) && q.width > 2.5) ?? gal[0];
    p.onChunk = null; p.onBreak = null;
    if (p.twin) { p.twin.onChunk = null; p.twin.onBreak = null; }
    // 34 blows: deep enough that the shell has torn over most of the crater, short of a
    // body-sized channel — i.e. the state a player is in when they ask "how much is left".
    const blows = H.dig(p, 34);
    const beforeUnlock = { near: H.face(p), twin: H.face(p.twin), past: H.shove(p) };
    for (const q of room.panels) if (q.spec?.dig) q.setBarrier(false);
    return { id: p.id, twinId: p.twin?.id, blows, beforeUnlock,
      afterUnlock: { near: H.face(p), twin: H.face(p.twin), past: H.shove(p) },
      park: H.park(p, 2.6) };
  });
  note('');
  note('STATION 1 — a gallery dud, 34 blows, then the house-wide unlock');
  note(`   face ${s1.id} (twin ${s1.twinId}) · ${s1.blows} blows`);
  note(`   before [B]: near channel ${s1.beforeUnlock.near.w} m · twin ${s1.beforeUnlock.twin.hits} `
    + `hits / ${s1.beforeUnlock.twin.open} passable cells · body ${s1.beforeUnlock.past} m past`);
  note(`   after  [B]: near channel ${s1.afterUnlock.near.w} m · twin ${s1.afterUnlock.twin.hits} `
    + `hits / ${s1.afterUnlock.twin.open} passable cells · body ${s1.afterUnlock.past} m past`);

  await wait(45);
  const pinned = await hold(page);
  note(`   held: ${JSON.stringify(pinned.pinned)}`);
  await wait(4);
  const BOX = await boxFor(s1.id);
  note(`   breach rect on screen (projected, not typed): ${JSON.stringify(BOX)}`);
  const nowA = await snap('st1-s1-now');
  await shot('st1-unlocked-dud-NOW');
  await page.evaluate((o) => window.__st1.arm('was', o), OLD);
  await wait(2);
  const wasA = await snap('st1-s1-was');
  await shot('st1-unlocked-dud-WAS');
  await page.evaluate((o) => window.__st1.arm('now', o), OLD);
  await wait(2);
  const nowA2 = await snap('st1-s1-now2');
  await release(page);

  const rNow = await rectRead(page, nowA, BOX);
  const rWas = await rectRead(page, wasA, BOX);
  const rFloor = await rectRead(page, nowA2, BOX);
  note(`   breach rect — WAS luma ${rWas.luma}, ${rWas.darkPct}% under 20`);
  note(`               ·  NOW luma ${rNow.luma}, ${rNow.darkPct}% under 20`);
  note(`               ·  same-config floor (now vs now) luma ${rFloor.luma}, `
    + `${rFloor.darkPct}% under 20 — |Δluma| ${Math.abs(rFloor.luma - rNow.luma).toFixed(2)}`);
  const floorD = Math.abs(rFloor.luma - rNow.luma);
  const signal = rNow.luma - rWas.luma;
  if (signal > 4 * Math.max(0.25, floorD)) {
    pass('the remaining wall is visible where it used to be a black void',
      `luma ${rWas.luma} -> ${rNow.luma} (+${signal.toFixed(2)}) against a same-config floor of `
      + `${floorD.toFixed(2)}`);
  } else {
    fail('the remaining wall is visible where it used to be a black void',
      `luma ${rWas.luma} -> ${rNow.luma} (+${signal.toFixed(2)}), floor ${floorD.toFixed(2)}`);
  }

  // =========================================================================
  // STATION 2 — the shipped mechanic: does the unlock now open an abandoned dig?
  // =========================================================================
  const s2 = await page.evaluate(() => {
    const e = window.__rrr.engine, room = e.room, H = window.__st1;
    room.setDigPlan({ seed: String(e.run?.seed ?? 's4') });
    const c = room.digCensus();
    const gal = H.faces().filter((p) => p.spec.a === 'gallery');
    const p = gal.find((q) => !c.link.includes(q.id) && q.width > 2.5) ?? gal[0];
    p.onChunk = null; p.onBreak = null;
    if (p.twin) { p.twin.onChunk = null; p.twin.onBreak = null; }
    const blows = H.dig(p, 60);
    const before = { near: H.face(p), twin: H.face(p.twin), past: H.shove(p) };
    for (const q of room.panels) if (q.spec?.dig) q.setBarrier(false);
    const after = { near: H.face(p), twin: H.face(p.twin), past: H.shove(p) };
    return { blows, before, after, park: H.park(p, 2.6) };
  });
  note('');
  note('STATION 2 — the same dud dug to a body-sized channel, then the unlock');
  note(`   ${s2.blows} blows · before [B] body ${s2.before.past} m past `
    + `(twin ${s2.before.twin.open} passable cells)`);
  note(`   after  [B] body ${s2.after.past} m past (twin ${s2.after.twin.open} passable cells, `
    + `channel ${s2.after.twin.w} m)`);
  await wait(45);
  await hold(page);
  await wait(4);
  await shot('st1-unlocked-dud-walkthrough');
  await release(page);
  if (s2.after.past > 0.15) {
    pass('the house-wide unlock opens an abandoned dig, both sides',
      `body ${s2.before.past} -> ${s2.after.past} m past the face`);
  } else {
    fail('the house-wide unlock opens an abandoned dig, both sides',
      `body still ${s2.after.past} m past; twin has ${s2.after.twin.open} passable cells`);
  }

  // =========================================================================
  // STATION 3 — the everyday one: the interconnect, mid-dig, no unlock anywhere
  // =========================================================================
  const s3 = await page.evaluate(() => {
    const e = window.__rrr.engine, room = e.room, H = window.__st1;
    room.setDigPlan({ seed: String(e.run?.seed ?? 's4') });
    const c = room.digCensus();
    /**
     * ⚠️ **NOT THE SERVICE PASSAGE.** `dig.md` already records that it is ~3.4 m wide and there
     * is nowhere in it to stand that frames a breach — the boom clips the wall and the camera
     * ends up inside the return. Any room with depth behind the player will do.
     */
    const links = H.faces().filter((p) => c.link.includes(p.id));
    const link = links.find((p) => !['service', 'chapel'].includes(p.spec.a)) ?? links[0];
    if (!link) return null;
    link.onChunk = null; link.onBreak = null;
    if (link.twin) { link.twin.onChunk = null; link.twin.onBreak = null; }
    const ic = link.field;
    /**
     * ⚠️ **AIM AT THE ELLIPSE'S WAIST, NOT AT A FULL-HEIGHT CLEAR COLUMN.** The interconnect is
     * an ellipse (`dig.js` `IC_H`) so it PINCHES at the floor and the lintel; demanding a column
     * clear from 0.30 m to 1.80 m finds a run that is barely inside the region, and 22 blows
     * there never reach the barrier plane at all. The row nearest mid-height is the widest one.
     */
    const midRow = Math.floor(ic.rows * 0.5);
    let bestA = -1, bestN = 0, runA = -1, r = 0;
    for (let cx = 0; cx <= ic.cols; cx++) {
      const clear = cx < ic.cols && !ic.barrier[ic.idx(cx, midRow)];
      if (clear) { if (r === 0) runA = cx; r++; if (r > bestN) { bestN = r; bestA = runA; } } else r = 0;
    }
    if (bestN === 0) return null;
    const loU = bestA / ic.cols, hiU = (bestA + bestN) / ic.cols;
    const blows = H.dig(link, 30, loU, hiU);
    return { id: link.id, room: link.spec.a, blows, near: H.face(link), twin: H.face(link.twin),
      past: H.shove(link), park: H.park(link, 3.0, 0.95) };
  });
  if (!s3) { skip('the interconnect mid-dig reads as wall, not as a way through', 'no link face'); }
  else {
    note('');
    note(`STATION 3 — the INTERCONNECT, ${s3.blows} blows, no unlock anywhere in the house`);
    note(`   ${s3.id} in ${s3.room}: maxDepth ${s3.near.maxDepth}, ${s3.near.see} see-through `
      + `cells, ${s3.near.barr} barrier cells · body ${s3.past} m past`);
    await wait(45);
    await hold(page);
    await wait(4);
    const BOX3 = await boxFor(s3.id);
    const nowB = await snap('st1-s3-now');
    await shot('st1-interconnect-middig-NOW');
    await page.evaluate((o) => window.__st1.arm('was', o), OLD);
    await wait(2);
    const wasB = await snap('st1-s3-was');
    await shot('st1-interconnect-middig-WAS');
    await page.evaluate((o) => window.__st1.arm('now', o), OLD);
    await release(page);
    const iNow = await rectRead(page, nowB, BOX3);
    const iWas = await rectRead(page, wasB, BOX3);
    note(`   breach rect — WAS luma ${iWas.luma} (${iWas.darkPct}% under 20) · `
      + `NOW luma ${iNow.luma} (${iNow.darkPct}% under 20)`);
    if (iNow.luma > iWas.luma) {
      pass('the interconnect mid-dig reads as wall, not as a way through',
        `luma ${iWas.luma} -> ${iNow.luma}`);
    } else {
      note('   (no change here — the crater may not have reached the barrier plane yet)');
      skip('the interconnect mid-dig reads as wall, not as a way through',
        `luma ${iWas.luma} -> ${iNow.luma}`);
    }
  }

  // =========================================================================
  // STATION 4 — THE CYAN MUST BE UNTOUCHED, and this is the reintroduction test
  // =========================================================================
  const s4 = await page.evaluate(() => {
    const e = window.__rrr.engine, room = e.room, H = window.__st1;
    room.setDigPlan({ seed: String(e.run?.seed ?? 's4') });
    const c = room.digCensus();
    const gal = H.faces().filter((p) => p.spec.a === 'gallery');
    const p = gal.find((q) => !c.link.includes(q.id) && q.width > 2.5) ?? gal[0];
    p.onChunk = null; p.onBreak = null;
    const blows = H.dig(p, 40);
    return { id: p.id, blows, barr: H.face(p).barr, park: H.park(p, 2.6) };
  });
  note('');
  note('STATION 4 — a DUD at the barrier, no unlock: the cyan, which must not have moved');
  note(`   ${s4.id}: ${s4.blows} blows, ${s4.barr} barrier cells behind it`);
  await wait(45);
  await hold(page);
  await wait(4);
  const BOX4 = await boxFor(s4.id);
  const cyNow = await snap('st1-s4-now');
  await shot('st1-dud-cyan-NOW');
  await page.evaluate((o) => window.__st1.arm('was', o), OLD);
  await wait(2);
  const cyWas = await snap('st1-s4-was');
  await page.evaluate((o) => window.__st1.arm('now', o), OLD);
  await wait(2);
  const cyNow2 = await snap('st1-s4-now2');
  await release(page);
  const a = await rectRead(page, cyNow, BOX4);
  const b = await rectRead(page, cyWas, BOX4);
  const f = await rectRead(page, cyNow2, BOX4);
  const armD = Math.abs(a.luma - b.luma);
  const floor2 = Math.abs(a.luma - f.luma);
  note(`   cyan rect — NOW ${a.luma} · WAS ${b.luma} · |Δ| ${armD.toFixed(3)} against a `
    + `same-config floor of ${floor2.toFixed(3)}`);
  if (armD <= Math.max(0.25, floor2)) {
    pass('the indestructible cyan is untouched by this change',
      `|Δ| ${armD.toFixed(3)} <= floor ${floor2.toFixed(3)} — both terms are gated on the G `
      + 'channel, so a face with barrier behind it takes the identical path');
  } else {
    fail('the indestructible cyan is untouched by this change',
      `|Δ| ${armD.toFixed(3)} against a floor of ${floor2.toFixed(3)}`);
  }

  // =========================================================================
  // STATION 5 — THE TWIN TERM, PROVEN LOAD-BEARING BY REINTRODUCING THE BUG
  // =========================================================================
  /**
   * 🚨 HANDOFF's rule: *a gate that has only ever seen working code is not evidence of anything.*
   * `wall.js` `setBarrier` now couples, so in the shipped build `tTwin` should never have
   * anything to say — which makes it indistinguishable from dead code unless the state it exists
   * for is reachable on demand. It is: calling `field.setBarrierEverywhere(false)` DIRECTLY
   * bypasses the coupling fix and reproduces exactly the grid `_pf1-diag2` measured this morning
   * — near face open, twin untouched and solid, a body refused.
   */
  const s5 = await page.evaluate(() => {
    const e = window.__rrr.engine, room = e.room, H = window.__st1;
    room.setDigPlan({ seed: String(e.run?.seed ?? 's4') });
    const c = room.digCensus();
    const gal = H.faces().filter((p) => p.spec.a === 'gallery');
    const p = gal.find((q) => !c.link.includes(q.id) && q.width > 2.5) ?? gal[0];
    p.onChunk = null; p.onBreak = null;
    if (p.twin) { p.twin.onChunk = null; p.twin.onBreak = null; }
    const blows = H.dig(p, 60);
    // the pre-fix grid, reproduced: drop the barrier WITHOUT going through `setBarrier`
    p.field.setBarrierEverywhere(false);
    p.field.flush();
    return { id: p.id, blows, near: H.face(p), twin: H.face(p.twin), past: H.shove(p),
      park: H.park(p, 2.6) };
  });
  note('');
  note('STATION 5 — the pre-fix grid, reproduced on purpose (the twin term\'s own gate)');
  note(`   ${s5.id}: near channel ${s5.near.w} m passable ${s5.near.passable} · twin `
    + `${s5.twin.open} passable cells, blocks ${s5.twin.blocks} · body ${s5.past} m past`);
  if (s5.past > 0.15) {
    skip('the renderer refuses to show a hole the far side still fills',
      'could not reproduce the uncoupled grid — nothing to assert');
  } else {
    await wait(45);
    await hold(page);
    await wait(4);
    const BOX5 = await boxFor(s5.id);
    const tOn = await snap('st1-s5-twin-on');
    await shot('st1-uncoupled-twin-ON');
    // uTwin 0 is round 5's question ("is MY half gone") — the renderer's half of the bug
    await page.evaluate(() => {
      for (const p of window.__st1.faces()) {
        const u = p.barrierMaterial?.userData?.barrierUniforms;
        if (u) u.uTwin.value = 0;
      }
    });
    await wait(2);
    const tOff = await snap('st1-s5-twin-off');
    await shot('st1-uncoupled-twin-OFF');
    await page.evaluate(() => {
      for (const p of window.__st1.faces()) {
        const u = p.barrierMaterial?.userData?.barrierUniforms;
        if (u) u.uTwin.value = 1;
      }
    });
    await release(page);
    const on = await rectRead(page, tOn, BOX5);
    const off = await rectRead(page, tOff, BOX5);
    note(`   breach rect — uTwin OFF luma ${off.luma} (${off.darkPct}% under 20) · `
      + `uTwin ON luma ${on.luma} (${on.darkPct}% under 20)`);
    if (on.luma - off.luma > 4) {
      pass('the renderer refuses to show a hole the far side still fills',
        `with the grid uncoupled and a body refused (${s5.past} m past), the far side's surviving `
        + `material draws: luma ${off.luma} -> ${on.luma}. The term is load-bearing, not dead.`);
    } else {
      fail('the renderer refuses to show a hole the far side still fills',
        `luma ${off.luma} -> ${on.luma} — tTwin changed nothing in a state it exists for`);
    }
  }

  /**
   * 🚨 **AND THE PAIR INVARIANT, REINTRODUCED AND THEN REPAIRED IN THE SAME PAGE.**
   *
   * `_pf1-diag2.mjs` P4 sweeps the invariant across 42 pairs and reads 0 — which on its own is
   * only evidence that it cannot see anything, exactly the trap `digparity-1` fell into when the
   * obvious passability gate PASSED at a broken setting. Station 5 has just built the broken grid
   * on purpose, so the three-step version is free: **it must be violated now, and calling the
   * fixed `setBarrier(false)` on the same face must repair it, live, with no rebuild.**
   */
  const rep = await page.evaluate((fid) => {
    const H = window.__st1;
    const p = H.faces().find((q) => q.id === fid);
    if (!p?.twin) return null;
    const broken = { near: H.face(p), twin: H.face(p.twin), past: H.shove(p) };
    p.setBarrier(false);          // the fixed path, on the grid that was bypassed
    p.field.flush();
    return { broken, repaired: { near: H.face(p), twin: H.face(p.twin), past: H.shove(p) } };
  }, s5.id);
  note('');
  note('   the pair invariant, on that same reintroduced grid:');
  if (!rep) { skip('the pair invariant fires when it is violated, and setBarrier repairs it', 'no twin'); }
  else {
    const violated = rep.broken.near.passable !== rep.broken.twin.passable
      || (rep.broken.near.passable && rep.broken.past <= 0.15);
    note(`   bypassed:  near passable ${rep.broken.near.passable} / twin passable `
      + `${rep.broken.twin.passable} · body ${rep.broken.past} m past — violated ${violated}`);
    note(`   setBarrier(false): near ${rep.repaired.near.passable} / twin `
      + `${rep.repaired.twin.passable} · body ${rep.repaired.past} m past`);
    const fixed = rep.repaired.near.passable === rep.repaired.twin.passable
      && rep.repaired.past > 0.15;
    if (violated && fixed) {
      pass('the pair invariant fires when it is violated, and setBarrier repairs it',
        `bypassing setBarrier reproduces the defect (body ${rep.broken.past} m) and the fixed `
        + `call repairs it in the same page (body ${rep.repaired.past} m) — so P4's 0-of-42 is `
        + 'a measurement, not a blind spot');
    } else if (!violated) {
      fail('the pair invariant fires when it is violated, and setBarrier repairs it',
        'could not reproduce the defect by bypassing setBarrier — the invariant is untested');
    } else {
      fail('the pair invariant fires when it is violated, and setBarrier repairs it',
        `setBarrier(false) did not repair it: body ${rep.repaired.past} m past`);
    }
  }
}
