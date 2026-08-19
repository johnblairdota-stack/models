#!/usr/bin/env node
/**
 * 🐞 _flyover1-robot.mjs — "IT DOESN'T SHOW THE ROBOT WHEN I STAND TOO CLOSE TO THE WALLS."
 *
 * John, 2026-08-15, on the fly-over. `flyover-1`. **A DIAGNOSIS FIRST, A FIX SECOND.**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_flyover1-robot.mjs \
 *        --port 5521 --q "plan=gen&planseed=0&planrooms=3"
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_flyover1-robot.mjs \
 *        --port 5521 --q "seed=s4"                                   # the authored house
 *
 * ⚠️ `--q`, never `--extra`. An unknown flag is silently ignored and the run happens on the
 * default arm.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE QUESTION IS "IS HE HIDDEN, OR IS HE NOT THERE", AND THEY ARE DIFFERENT FAULTS
 * ---------------------------------------------------------------------------------------------
 * HANDOFF's dominant defect class is *"IT EXISTS, SOMETHING IS IN FRONT OF IT"* — six times in
 * two days a thing reported missing was already there with something over it. So this file
 * refuses to guess, and every station returns one of **four** verdicts, never a boolean:
 *
 *   DRAWN        his own pixels are on screen at his own projected position
 *   OCCLUDED     he is in frame, and none of his pixels reach it
 *   OFF-FRAME    his projected position is outside the viewport — a framing fault, not occlusion
 *   UNRESOLVED   the probe could not project him or could not read a frame. **Never a verdict.**
 *
 * **The measurement is an ablation of the robot himself, not a look at a picture.** Inside ONE
 * frozen page, at one station, the player's drawn descendants are switched off and back on and
 * the two frames are differenced. Pixels that move ARE his pixels — there is no threshold to
 * argue about, and a dark frame cannot fool it, which matters because `px>16` is exactly the
 * instrument `dressfix-1` measured blind in a generated house.
 *
 * ⚠️ **`--pick` IS NOT USED AND COULD NOT ANSWER THIS.** It cannot see an `InstancedMesh` at all
 * — which is every pristine wall face in the house, i.e. precisely the class of object suspected
 * of doing the occluding — and a raycast does not cull, so it also reports meshes the GPU threw
 * away. **A MISS IS NOT EVIDENCE THAT NOTHING DRAWS THERE.**
 *
 * 🚨 EVERY ASSERTION SHIPS A CONTROL THAT MUST FAIL, ON EVERY RUN.
 *   C0  THE FLOOR IS ZERO. Two frames with NOTHING ablated, inside the same hold. Any non-zero
 *       here and every pixel count below is noise wearing a verdict's clothes.
 *   C1  THE PROBE CAN SEE HIM. The same ablation at his most visible station must move a large
 *       number of pixels. A file that reports "hidden" everywhere because its ablation does
 *       nothing is the exact instrument class this project has been burned by sixteen times.
 *   C2  THE MARKER IS NOT THE ROBOT. The fix — an always-visible ring at his feet drawn with
 *       `depthTest: false` — is ablated SEPARATELY from his body, by NAME (`flyover.you`), so
 *       "the marker is on screen" can never be mistaken for "the robot is on screen".
 *   D1  THE ATTRIBUTION IS A REMOVAL, NOT AN OPINION. Where the verdict is OCCLUDED, the game's
 *       OWN ray (`room.castRay`, the collider set — not a copy of it) reports what stands on the
 *       line, and then the walls are hidden and the identical ablation re-run: his pixels must
 *       come back. Naming a blocker from a ray alone would be a story about a ray.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { decodePng } from '../pxdiff.mjs';
import { hold, release } from '../still.mjs';

/**
 * Pixels whose max channel delta exceeds `t`, and where they are.
 * ⚠️ `t = 6` is not a look threshold and must not be read as one: inside a `hold()` the
 * same-config floor is ZERO (C0 measures it on every run), so this only has to survive PNG
 * quantisation. The verdict is "any of his pixels at all", which is the honest form of the
 * question John asked.
 */
function movedPixels(A, B, t = 6) {
  if (!A || !B || A.width !== B.width || A.height !== B.height) return null;
  const ch = A.channels;
  let n = 0, sx = 0, sy = 0;
  for (let y = 0; y < A.height; y++) {
    for (let x = 0; x < A.width; x++) {
      const i = (y * A.width + x) * ch;
      let m = 0;
      for (let c = 0; c < 3; c++) { const d = Math.abs(A.data[i + c] - B.data[i + c]); if (d > m) m = d; }
      if (m <= t) continue;
      n++; sx += x; sy += y;
    }
  }
  return { px: n, cx: n ? Math.round(sx / n) : null, cy: n ? Math.round(sy / n) : null };
}

export default async function robot({ page, snap, pass, fail, skip, note, SHOTDIR, VIEW }) {
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
  const keepPng = (tag, buf) => {
    if (!buf) return null;
    const p = path.join(SHOTDIR, `${VIEW}.${tag}.png`);
    writeFileSync(p, buf);
    return p;
  };

  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);
  if (!await page.evaluate(() => typeof window.__rrr?.flyover === 'function')) {
    skip('the fly-over is reachable', 'window.__rrr.flyover is not a function');
    return;
  }

  /**
   * ⚠️ **THE STATIONS ARE DERIVED FROM THE FLOOR PLAN, NOT TYPED IN.** A hardcoded pair of XZ
   * coordinates does not throw when the map changes — it places a body inside a wall, produces a
   * plausible number and reports on a measurement of nothing (`spaces.js` ANCHORS' own note).
   * Each space contributes its centre and its four wall-hugging positions, 0.45 m off the clear
   * extent, which is about as close as a 0.34 m-radius body can legally stand.
   */
  const stations = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const out = [];
    for (const s of e.room.spaces) {
      out.push({ id: `${s.id}|centre`, x: s.cx, z: s.cz });
      out.push({ id: `${s.id}|xmin`, x: s.x0 + 0.45, z: s.cz });
      out.push({ id: `${s.id}|xmax`, x: s.x1 - 0.45, z: s.cz });
      out.push({ id: `${s.id}|zmin`, x: s.cx, z: s.z0 + 0.45 });
      out.push({ id: `${s.id}|zmax`, x: s.cx, z: s.z1 - 0.45 });
    }
    return out;
  });
  const spans = await page.evaluate(() => window.__rrr.engine.room.spaces
    .map((s) => ({ id: s.id, min: +Math.min(s.x1 - s.x0, s.z1 - s.z0).toFixed(2), storey: s.storey })));
  const shortest = spans.reduce((a, b) => (b.min < a.min ? b : a));
  const meanSpan = spans.reduce((a, b) => a + b.min, 0) / spans.length;
  note(`${stations.length} stations from ${spans.length} spaces — each centre + four wall-hugging`
    + ` positions 0.45 m off the clear extent`);
  note(`room spans (shortest dimension per space): ${spans.map((s) => `${s.id} ${s.min}`).join(' · ')}`
    + `  → shortest ${shortest.id} ${shortest.min} m · mean ${meanSpan.toFixed(2)} m · storey ${shortest.storey}`);

  await page.evaluate(() => window.__rrr.flyover(true));
  await step(30);

  /** Switch the player's drawn descendants, or the named marker, independently. */
  const ablate = (what, on) => page.evaluate(([w, v]) => {
    const e = window.__rrr.engine;
    const st = (window.__flyAb ??= {});
    if (w === 'body') {
      const root = e.player?.root;
      if (!root) return { ok: false, why: 'engine.player.root missing' };
      if (!st.body) {
        st.body = [];
        root.traverse((o) => { if (o.isMesh || o.isSprite || o.isPoints || o.isLine) st.body.push(o); });
      }
      for (const m of st.body) m.visible = v;
      return { ok: true, n: st.body.length };
    }
    if (!st.mark) {
      st.mark = [];
      e.scene.traverse((o) => { if (o.name === 'flyover.you') st.mark.push(o); });
    }
    if (!st.mark.length) return { ok: false, why: 'no object named flyover.you in the scene' };
    for (const m of st.mark) m.visible = v;
    return { ok: true, n: st.mark.length };
  }, [what, on]);

  /**
   * Where the probe EXPECTS him, in viewport pixels — and, in the same read, the three states
   * that separate the ways he can fail to be there.
   *
   * 🚨 **"OCCLUDED" AND "NOT DRAWN" ARE DIFFERENT FAULTS AND THE FIRST BUILD OF THIS FILE
   * CONFLATED THEM.** It called every 0-pixel station OCCLUDED, then hid every wall in the house
   * and found he still did not appear — because nothing was in front of him at all. A probe that
   * can only say "his pixels are absent" has not finished the sentence. So this reads back
   * `visible` on his own meshes, the whole parent chain to the scene, and `frustumCulled`, which
   * between them name which of the three it is before any removal is attempted.
   */
  const project = () => page.evaluate(() => {
    const e = window.__rrr.engine;
    const V = e.player.pos.constructor;
    const p = new V(e.player.pos.x, e.player.pos.y + 0.9, e.player.pos.z);
    p.project(e.camera);
    const cv = e.renderer.domElement;
    const st = (window.__flyAb ??= {});
    if (!st.body) {
      st.body = [];
      e.player.root.traverse((o) => {
        if (o.isMesh || o.isSprite || o.isPoints || o.isLine) st.body.push(o);
      });
    }
    let vis = 0, culled = 0, chainBroken = 0, skinned = 0;
    for (const m of st.body) {
      if (m.visible) vis++;
      if (m.frustumCulled) culled++;
      if (m.isSkinnedMesh) skinned++;
      let q = m.parent, ok = true;
      while (q) { if (!q.visible) { ok = false; break; } q = q.parent; }
      if (!ok) chainBroken++;
    }
    return {
      x: Math.round((p.x * 0.5 + 0.5) * cv.clientWidth),
      y: Math.round((-p.y * 0.5 + 0.5) * cv.clientHeight),
      inFrame: p.x >= -1 && p.x <= 1 && p.y >= -1 && p.y <= 1 && p.z < 1,
      meshes: st.body.length, vis, culled, chainBroken, skinned,
      rootVis: e.player.root.visible,
      rootY: +e.player.root.position.y.toFixed(3),
      posY: +e.player.pos.y.toFixed(3),
    };
  });

  const rows = [];
  let floorPx = null;
  for (const st of stations) {
    await page.evaluate((s) => {
      const e = window.__rrr.engine;
      e.player.pos.set(s.x, e.room.floorY, s.z);
      e.player.vel.set(0, 0, 0);
    }, st);
    await step(12);
    const proj = await project();
    await wait(10);
    await hold(page);
    await wait(4);
    const on = await snap(`${st.id}-on`);
    // C0, once: two frames with NOTHING ablated. Everything below is read against this.
    let floorBuf = null;
    if (floorPx === null) { await wait(3); floorBuf = await snap(`${st.id}-floor`); }
    const abl = await ablate('body', false);
    await wait(3);
    const off = await snap(`${st.id}-off`);
    await ablate('body', true);
    await wait(3);
    const mAbl = await ablate('mark', false);
    await wait(3);
    const noMark = await snap(`${st.id}-nomark`);
    await ablate('mark', true);
    await release(page);

    if (!abl.ok) { skip('the robot ablation is reachable', abl.why); return; }
    if (!mAbl.ok) { skip('the marker ablation is reachable', mAbl.why); return; }
    const A = on && decodePng(on), B = off && decodePng(off), C = noMark && decodePng(noMark);
    if (!A || !B || !C) { rows.push({ ...st, verdict: 'UNRESOLVED', why: 'a capture came back null' }); continue; }
    if (floorBuf) floorPx = movedPixels(A, decodePng(floorBuf)).px;
    /**
     * 🚨 **TWO THRESHOLDS, AND THE SECOND ONE IS THIS SLICE'S OWN LESSON APPLIED TO ITSELF.**
     * The authored house fits at **47.9 m** against the generated house's 25.1, so the same robot
     * is half the size on screen — about **20 px tall** — and in a dim room his pixels can differ
     * from the floor behind him by fewer than 6 levels. Read at `t = 6` alone he reports ABSENT;
     * read at `t = 2` he is plainly there. That is exactly `dressfix-1`'s finding (`px>16` blind
     * at mean luma 6.65) arriving inside the instrument written to investigate it. FAINT is
     * therefore its own verdict: **he is being rendered and he is nearly invisible**, which is a
     * different sentence from either DRAWN or ABSENT and is the one John's complaint may actually
     * be about at this eye height.
     */
    const body = movedPixels(A, B, 6);
    const bodyFaint = movedPixels(A, B, 2);
    const mark = movedPixels(A, C, 6);
    /**
     * FIVE STATES, and the two new ones are the point. `NOT-DRAWN` is "his own meshes are
     * switched off or their parent chain is"; `ABSENT` is "everything says he should be drawn and
     * none of his pixels reach the frame", which is the only case where an occluder or a cull is
     * even a candidate. Collapsing those two is what sent the first run hunting for a wall.
     */
    const flagged = proj.vis === 0 || proj.chainBroken > 0 || !proj.rootVis;
    const verdict = !proj.inFrame ? 'OFF-FRAME'
      : body.px > 0 ? 'DRAWN'
      : flagged ? 'NOT-DRAWN'
      : bodyFaint.px > 0 ? 'FAINT' : 'ABSENT';
    const boom = await page.evaluate(() => {
      const s = window.__rrr.flyover();
      return { wantsHidden: s.boomWantsHidden, modelVisible: s.modelVisible };
    });
    rows.push({ ...st, verdict, bodyPx: body.px, faintPx: bodyFaint.px, markPx: mark.px,
      proj, meshes: abl.n, boom, png: verdict === 'DRAWN' ? null : { on, off } });
  }

  const nDrawn = rows.filter((r) => r.verdict === 'DRAWN').length;
  const notDrawn = rows.filter((r) => r.verdict === 'NOT-DRAWN');
  const faint = rows.filter((r) => r.verdict === 'FAINT');
  const absent = rows.filter((r) => r.verdict === 'ABSENT');
  const occ = [...notDrawn, ...absent];
  const nOff = rows.filter((r) => r.verdict === 'OFF-FRAME').length;
  const nUn = rows.filter((r) => r.verdict === 'UNRESOLVED').length;
  const eye = await page.evaluate(() => window.__rrr.flyover().y);
  for (const r of rows) {
    note(`${r.id.padEnd(22)} ${String(r.verdict).padEnd(10)} body ${String(r.bodyPx ?? '-').padStart(5)} px`
      + ` (px>2: ${String(r.faintPx ?? '-').padStart(5)})`
      + ` · marker ${String(r.markPx ?? '-').padStart(4)} px · at ${r.proj?.x ?? '-'},${r.proj?.y ?? '-'}`
      + ` · meshes vis ${r.proj?.vis ?? '-'}/${r.proj?.meshes ?? '-'}`
      + ` chainBroken ${r.proj?.chainBroken ?? '-'}`
      + ` · boom wants him hidden: ${r.boom?.wantsHidden ?? '-'}`);
  }
  note(`VERDICTS over ${rows.length} stations at an eye height of ${eye} m: ${nDrawn} DRAWN`
    + ` · ${faint.length} FAINT (rendered, but no pixel differs by more than 6 levels)`
    + ` · ${notDrawn.length} NOT-DRAWN (his own meshes or their chain switched off)`
    + ` · ${absent.length} ABSENT (should be drawn, contributes nothing even at px>2)`
    + ` · ${nOff} OFF-FRAME · ${nUn} UNRESOLVED`);
  if (faint.length) {
    note(`🎯 FAINT IS A REAL STATE AND IT SCALES WITH THE FIT: at ${eye} m the robot is roughly`
      + ` ${(1.7 / (2 * eye * Math.tan(33 * Math.PI / 180)) * 720).toFixed(0)} px tall, so in a dim`
      + ` room his silhouette can sit inside 6 levels of the floor behind him. He is being`
      + ` rendered; he is nearly invisible. That is what the marker is for.`);
  }

  floorPx === 0
    ? pass('C0 CONTROL — the same-config pixel floor inside the hold is zero',
      `two frames, nothing ablated, ${floorPx} px moved — every count below is signal`)
    : fail('C0 CONTROL — the same-config pixel floor inside the hold is zero',
      `${floorPx} px moved with nothing ablated — no verdict in this file can be trusted`);

  /**
   * ⚠️ **THE BAR IS RELATIVE TO THE FLOOR, NOT AN ABSOLUTE PIXEL COUNT — AND THE FIRST VERSION
   * WAS ABSOLUTE AND WENT RED ON A GOOD BUILD.** It demanded 200 px, which the generated house
   * clears easily at a 25.1 m eye (1456 px) and the authored house cannot at 47.9 m (188 px),
   * because the fit is twice as high and the robot is a quarter of the area. A control whose bar
   * does not scale with the thing it is controlling for is a gate that fails on geometry.
   * The floor is measured at 0 px (C0), so "many times the floor, and enough pixels to be a
   * silhouette rather than a speck" is the honest bar.
   */
  const best = rows.reduce((a, b) => ((b.bodyPx ?? 0) > (a.bodyPx ?? 0) ? b : a));
  (best.bodyPx ?? 0) > Math.max(50, floorPx * 20)
    ? pass('C1 CONTROL — the body ablation can see the robot',
      `${best.bodyPx} px at ${best.id} over ${best.meshes} drawn descendants, against a floor of`
      + ` ${floorPx} px at an eye height of ${eye} m; every 0 above is an absence, not a dead probe`)
    : fail('C1 CONTROL — the body ablation can see the robot',
      `the best station moved only ${best.bodyPx ?? 0} px at ${eye} m — nothing above can be trusted`);

  const markSeen = rows.filter((r) => (r.markPx ?? 0) > 0).length;
  const bodySeen = rows.filter((r) => (r.bodyPx ?? 0) > 0).length;
  markSeen > 0
    ? pass('C2 CONTROL — the marker is measured separately from the robot',
      `marker drawn at ${markSeen}/${rows.length} stations, body at ${bodySeen}/${rows.length}`
      + ` — two independent ablations, two different numbers`)
    : fail('C2 CONTROL — the marker is measured separately from the robot',
      `the marker ablation moved nothing anywhere — it is not being drawn, or not being found`);

  const markMissing = rows.filter((r) => (r.markPx ?? 0) === 0 && r.verdict !== 'OFF-FRAME'
    && r.verdict !== 'UNRESOLVED');
  markMissing.length === 0
    ? pass('R1 the "you are here" marker is drawn at EVERY in-frame station',
      `${markSeen}/${rows.length}, including the ${occ.length} where his own body is not —`
      + ` depthTest:false is what makes the position readable through a wall`)
    : fail('R1 the "you are here" marker is drawn at EVERY in-frame station',
      `missing at ${markMissing.length}: ${markMissing.map((r) => r.id).join(', ')}`);

  /**
   * 🚨 **R2 — THE FIX, AND ITS CONTROL IS THAT THE DEFECT CONDITION IS STILL BEING TRIGGERED.**
   *
   * The cause is `ThirdPersonCamera`'s *"below `HIDE_AT` the body stops drawing"* rule: stand
   * 0.45 m off a wall and the boom, 3.1 m behind you, is inside it, so the camera switches
   * `player.model` off — and the fly-over camera 25 m overhead then has nothing to draw. The fix
   * is `views/game.js` overriding `player.model.visible` while the fly-over is up.
   *
   * A gate that only checked "he is drawn" would go green on a build where the boom never wanted
   * to hide him in the first place, which is why `cam.modelHidden` is published and asserted
   * here: **at least one station must have the boom still asking for him to be hidden**, and at
   * every such station he must be drawn anyway. That is the reintroduction arm, running live.
   */
  /**
   * 🚨 **R3 ASSERTS WHAT THE FIX CLAIMS AND NOT ONE WORD MORE, AND THE FIRST VERSION OVERREACHED.**
   * It required his PIXELS at every station where the boom wanted him hidden — which folds in
   * occlusion by the house, a completely separate cause that this fix neither addresses nor
   * should. The fix's claim is exactly: *`views/game.js` stops the boom's `HIDE_AT` rule from
   * switching his meshes off.* That is `NOT-DRAWN`, which is read off `visible` flags and the
   * parent chain, not off the frame. Stations that are occluded are counted and reported
   * separately, immediately below, because they are a different sentence.
   */
  const wanted = rows.filter((r) => r.boom?.wantsHidden === true);
  const wantedButDark = wanted.filter((r) => r.verdict === 'NOT-DRAWN');
  const wantedButHidden = wanted.filter((r) => r.verdict === 'ABSENT');
  wanted.length > 0
    ? pass('R2 CONTROL — the boom still asks for the body to be hidden at wall-hugging stations',
      `${wanted.length}/${rows.length} stations have cam.modelHidden true; the override is`
      + ` therefore being exercised rather than being green by accident`)
    : fail('R2 CONTROL — the boom still asks for the body to be hidden at wall-hugging stations',
      `no station triggered the HIDE_AT rule, so R3 below proves nothing on this house`);
  wantedButDark.length === 0
    ? pass('R3 the boom\'s HIDE_AT rule no longer switches the robot off in the fly-over',
      `0 of the ${wanted.length} stations where cam.modelHidden is true are NOT-DRAWN`
      + ` (was 13 of 35 on the generated house before the override);`
      + ` ${wantedButHidden.length} of them are occluded by the house, which is a separate cause`
      + ` and is D1's subject`)
    : fail('R3 the boom\'s HIDE_AT rule no longer switches the robot off in the fly-over',
      `${wantedButDark.length} still have their meshes switched off:`
      + ` ${wantedButDark.map((r) => r.id).join(', ')}`);

  // ---- D1: name it with the GAME'S OWN ray, then REMOVE it -----------------------------------
  if (notDrawn.length) {
    const r = notDrawn[0];
    note(`🚨 D0 ${notDrawn.length} station(s) are NOT-DRAWN — his own meshes are switched off, so`
      + ` no occluder is involved at all. First: ${r.id} has ${r.proj.vis}/${r.proj.meshes} meshes`
      + ` visible, ${r.proj.chainBroken} with a broken parent chain, root.visible ${r.proj.rootVis}.`);
  }
  if (!occ.length) {
    note('every station drew the robot on this house — the attribution arm has nothing to run on,'
      + ' and SKIPs rather than inventing a cause');
    skip('D1 the cause is attributed by removal, not by opinion',
      'no NOT-DRAWN or ABSENT station on this house/seed');
  } else {
    const worst = occ[0];
    keepPng('flyover1-occluded-on', worst.png.on);
    keepPng('flyover1-occluded-off', worst.png.off);
    await page.evaluate((s) => {
      const e = window.__rrr.engine;
      e.player.pos.set(s.x, e.room.floorY, s.z);
      e.player.vel.set(0, 0, 0);
    }, worst);
    await step(12);
    /**
     * ⚠️ **THE GAME'S OWN RAY, NOT A COPY OF IT.** `room.castRay` walks the live collider set and
     * the live panels; a probe that built its own `THREE.Raycaster` would be testing its own idea
     * of the world and, per HANDOFF, would also report meshes the GPU has culled.
     */
    const line = await page.evaluate(() => {
      const e = window.__rrr.engine;
      const V = e.player.pos.constructor;
      const from = e.camera.position.clone();
      const to = new V(e.player.pos.x, e.player.pos.y + 0.9, e.player.pos.z);
      const dir = to.clone().sub(from);
      const dist = dir.length();
      dir.multiplyScalar(1 / dist);
      const hit = e.room.castRay(from, dir, dist - 0.30);
      return { dist: +dist.toFixed(2),
        blocked: !!hit, at: hit ? +hit.distance.toFixed(2) : null,
        panel: hit?.panel?.id ?? null,
        // how far ABOVE the floor the ray was stopped — a wall top reads near the storey
        y: hit ? +(from.y + dir.y * hit.distance).toFixed(2) : null };
    });
    note(`D1 at ${worst.id}: the camera is ${line.dist} m from his chest and the game's own ray is`
      + ` ${line.blocked ? `STOPPED at ${line.at} m, ${line.y} m above the floor`
        + `${line.panel ? ` (panel ${line.panel})` : ' by a wall collider'}` : 'NOT stopped'}`);

    /**
     * ---- THE REMOVAL LADDER. Each rung is a real ablation inside the SAME frozen frame, run in
     * the order of what it would mean, and the FIRST one that brings his pixels back is the
     * cause. Nothing here is a hunch: a rung that does not move the number is written down as
     * having not moved it.
     *
     *   1. the walls          — "something is in front of him", HANDOFF's dominant class
     *   2. `frustumCulled`    — "the renderer threw him away before anything could be in front"
     *   3. the whole overlay  — "the fix is standing on the patient"
     */
    await hold(page);
    await wait(4);
    const rung = async (label, arm, disarm, arg) => {
      const info = arg === undefined ? await page.evaluate(arm) : await page.evaluate(arm, arg);
      await wait(3);
      const on = await snap(`rung-${label}-on`);
      await ablate('body', false); await wait(3);
      const off = await snap(`rung-${label}-off`);
      await ablate('body', true); await wait(3);
      // px>2, matching the FAINT threshold: at a 47.9 m eye the robot's whole silhouette can sit
      // inside 6 levels, so a rung read at 6 would report "did not help" on a rung that did.
      const px = movedPixels(decodePng(on), decodePng(off), 2).px;
      if (disarm) { await page.evaluate(disarm); await wait(2); }
      return { label, px, info, frame: on };
    };
    const base = await rung('base', () => ({ n: 0 }), null);
    const walls = await rung('walls', () => {
      const e = window.__rrr.engine;
      const hit = [];
      e.scene.traverse((o) => {
        if (!o.isMesh || !o.visible) return;
        if (/(^|:)wall$/.test(String(o.name).replace(/^kit:/, ''))) hit.push(o);
      });
      (window.__flyAb ??= {}).walls = hit;
      for (const o of hit) o.visible = false;
      return { n: hit.length };
    }, () => { for (const o of window.__flyAb?.walls ?? []) o.visible = true; });
    const frus = await rung('frustum', () => {
      const st = (window.__flyAb ??= {});
      st.frus = [];
      for (const m of st.body ?? []) { st.frus.push([m, m.frustumCulled]); m.frustumCulled = false; }
      return { n: st.frus.length };
    }, () => { for (const [m, v] of window.__flyAb?.frus ?? []) m.frustumCulled = v; });
    const overlay = await rung('overlay', () => {
      const e = window.__rrr.engine;
      const g = e.scene.children.find((o) => o.name === 'flyover.overlay');
      (window.__flyAb ??= {}).ov = g;
      if (g) g.visible = false;
      return { n: g ? 1 : 0 };
    }, () => { const g = window.__flyAb?.ov; if (g) g.visible = true; });
    /**
     * ---- RUNG 4: NAME THE BUCKET. -----------------------------------------------------------
     * The three fixed rungs cover the causes worth naming in advance. When none of them fires —
     * which is what the authored house did, where `kit:wall` is one of TEN merged buckets — the
     * only honest next step is to stop guessing which one and ablate them all, one at a time,
     * inside the same frozen frame. The first bucket whose removal puts his pixels back IS the
     * occluder. ⚠️ This runs ONLY when the fixed rungs have all come back zero, because it costs
     * two captures per bucket.
     */
    let named = null;
    if (walls.px === 0 && frus.px === 0 && overlay.px === 0) {
      /**
       * ⚠️ **BISECTION, NOT A SWEEP — AND THE SWEEP WAS TRIED AND KILLED THE BROWSER.** The
       * authored house has **342 distinct visible mesh names** (every gadget sub-mesh carries
       * one), so hiding them one at a time is 684 captures and ran past `playtest.mjs`'s own
       * lifetime. Halving instead is ~2·log2(342) ≈ 18 rungs and finds the same object.
       * ⚠️ The candidate list excludes the player's own meshes and the fly-over overlay: hiding
       * the thing being measured would "restore" him by deleting the question.
       */
      const n = await page.evaluate(() => {
        const e = window.__rrr.engine;
        const st = (window.__flyAb ??= {});
        const skip = new Set(st.body ?? []);
        const ov = e.scene.children.find((o) => o.name === 'flyover.overlay');
        ov?.traverse((o) => skip.add(o));
        st.cand = [];
        e.scene.traverse((o) => { if (o.isMesh && o.visible && !skip.has(o)) st.cand.push(o); });
        return st.cand.length;
      });
      const testRange = async (lo, hi) => (await rung('bisect', ([a, b]) => {
        const st = window.__flyAb;
        st.hidden = st.cand.slice(a, b);
        for (const o of st.hidden) o.visible = false;
        return { n: st.hidden.length };
      }, () => { for (const o of window.__flyAb?.hidden ?? []) o.visible = true; }, [lo, hi])).px;
      note(`D1 rung 4 — no named cause fired, so bisecting ${n} visible meshes at ${worst.id}`);
      let lo = 0, hi = n, ok = await testRange(0, n) > 0;
      if (!ok) note('D1 rung 4: hiding EVERY other visible mesh in the scene does not restore him,'
        + ' so nothing drawn is in front of him and this is not occlusion at all');
      while (ok && hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (await testRange(lo, mid) > 0) { hi = mid; continue; }
        if (await testRange(mid, hi) > 0) { lo = mid; continue; }
        const suspects = await page.evaluate(([a, b]) => {
          const out = [];
          for (const o of window.__flyAb.cand.slice(a, b)) {
            if (!o.geometry?.boundingBox) o.geometry?.computeBoundingBox?.();
            const bb = o.geometry?.boundingBox;
            out.push(`${o.name || '(unnamed)'}${bb ? `@${bb.min.y.toFixed(1)}..${bb.max.y.toFixed(1)}` : ''}`);
          }
          return [...new Set(out)];
        }, [lo, hi]);
        note(`D1 rung 4: neither half of [${lo},${hi}) restores him alone — MORE THAN ONE object`
          + ` is covering him, so the bisection stops rather than naming an arbitrary one.`
          + ` The ${suspects.length} candidates still in the bracket: ${suspects.join(' · ')}`);
        named = { name: `${suspects.length} STACKED objects (see the list above)`, px: -1, n: hi - lo,
          multi: true };
        ok = false;
      }
      if (ok && hi - lo === 1) {
        const who = await page.evaluate((i) => {
          const o = window.__flyAb.cand[i];
          o.geometry?.computeBoundingBox?.();
          const bb = o.geometry?.boundingBox;
          return { name: o.name || '(unnamed)', type: o.type,
            y: bb ? [+bb.min.y.toFixed(2), +bb.max.y.toFixed(2)] : null };
        }, lo);
        const last = await testRange(lo, hi);
        named = { name: `${who.name} [${who.type}, y ${who.y?.join('..')}]`, px: last, n: 1 };
        note(`D1 rung 4 FOUND IT: hiding a single mesh — ${named.name} — brings back ${last} body px`);
      }
    }
    keepPng('flyover1-notdrawn-base', base.frame);
    await release(page);

    note(`D1 REMOVAL LADDER at ${worst.id} — body pixels after each removal:`
      + `  baseline ${base.px}`
      + `  ·  ${walls.info.n} wall buckets hidden → ${walls.px}`
      + `  ·  frustumCulled=false on ${frus.info.n} of his meshes → ${frus.px}`
      + `  ·  the fly-over overlay hidden → ${overlay.px}`);
    const cause = walls.px > 0 ? `a WALL (${walls.info.n} buckets)`
      : frus.px > 0 ? 'FRUSTUM CULLING of his own meshes'
      : overlay.px > 0 ? 'the fly-over OVERLAY drawing over him'
      : named ? `${named.multi ? named.name : `"${named.name}"`}`
        + ` (${named.n} mesh(es)), found by bisecting every visible mesh in the scene`
      : null;
    cause
      ? pass('D1 the cause is attributed by removal, not by opinion',
        `${cause} — baseline ${base.px} px, and his pixels come back the moment it is removed,`
        + ` inside one frozen frame with the identical ablation`)
      : fail('D1 the cause is attributed by removal, not by opinion',
        `baseline ${base.px} px and NOTHING drawn in this scene restores him`
        + ` (walls ${walls.px}, frustum ${frus.px}, overlay ${overlay.px}, and every visible mesh`
        + ` name swept). The cause is not occlusion and must not be reported as occlusion.`);
  }

  // ---- THE ARITHMETIC, so the residual is a number rather than a shrug ----------------------
  const geo = await page.evaluate(() => window.__rrr.flyover());
  const fovHalf = await page.evaluate(() => (window.__rrr.engine.camera.fov * Math.PI) / 360);
  const storey = shortest.storey ?? 4.8;
  const edge = storey * Math.tan(fovHalf);
  note(`📐 WHY IT HAPPENS AT ALL, AS ARITHMETIC: at fov ${(fovHalf * 360 / Math.PI).toFixed(0)}° the`
    + ` ray to the frame EDGE leaves the vertical by ${(fovHalf * 180 / Math.PI).toFixed(1)}°, so a`
    + ` ${storey} m wall hides a strip of floor behind it up to ${edge.toFixed(2)} m deep at the edge`
    + ` and 0.00 m dead centre. Shortest room span here is ${shortest.min} m, mean ${meanSpan.toFixed(2)} m.`);
  const tmin = (geo.tiltMinDeg * Math.PI) / 180;
  note(`📐 THE TILT FLOOR: ${geo.tiltMinDeg}° — a ${storey} m wall hides`
    + ` ${(storey / Math.tan(tmin)).toFixed(2)} m there, i.e.`
    + ` ${((storey / Math.tan(tmin)) / shortest.min * 100).toFixed(0)}% of the shortest span and`
    + ` ${((storey / Math.tan(tmin)) / meanSpan * 100).toFixed(0)}% of the mean.`);

  await page.evaluate(() => window.__rrr.flyover(false));
}
