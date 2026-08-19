/**
 * 🚨 **DO TWO NEIGHBOURING PANELS STILL BREAK INDEPENDENTLY?** — the one re-verification
 * `boot-1` demanded before `wall.js`'s per-panel `customProgramCacheKey` could be collapsed.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_progkey1-independence.mjs \
 *        --port 5411 --q "seed=s4&dig=1" --shots      # the DAMAGE arm (free faces)
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_progkey1-independence.mjs \
 *        --port 5412 --q "seed=s4&dig=0" --shots      # the SCALAR arm (stage panels)
 *
 * ⚠️ **THE SCALAR ARM NEEDS `dig=0` AND THE HEADER USED TO SAY PLAIN `seed=s4`, WHICH IS THE SAME
 * RUN AS THE DAMAGE ARM.** The dig is on by default, so free faces exist, and the picker below
 * scores them first (`a.dig ? 0 : 1000`) — `seed=s4` and `seed=s4&dig=1` both choose the same
 * damage pair and the scalar path never runs. Found 2026-08-09 by `aperture-1`.
 *
 * WHY IT EXISTS. `wall.js` used to pin a cache key per panel per layer, on the stated grounds
 * that a shared program means "only the first material's break uniform is ever bound". That was
 * 4.08x of the whole load's shader compiles. The claim is false in three.js r180 —
 * `WebGLRenderer.getProgram()` keys its program map on `properties.get(material)`, so every
 * material runs its own `onBeforeCompile` and keeps its own `materialProperties.uniforms` even
 * when `acquireProgram` hands back a program another material compiled — but **"false in the
 * source" is not the standard this project accepts for a gameplay property.** The dig is the
 * campaign; a shared break state would destroy it. So this proves it from the outside.
 *
 * ⚠️ **THE STATE ASSERTION IS NOT ENOUGH ON ITS OWN AND THAT IS THE WHOLE POINT.** Reading
 * `maxDepth` off the neighbour proves the CPU-side field did not leak. The risk of program
 * sharing is on the GPU: the wrong material's uniforms bound at draw time. Only pixels can see
 * that, so the deliverable is a PICTURE of the dug panel beside its intact neighbour, plus a
 * per-panel pixel diff.
 *
 * ⚠️ **AND IT CARRIES ITS OWN SAME-CONFIG CONTROL.** Three frames are taken: A, A' (nothing done
 * between them — the floor), then B (after digging ONE panel). The test is `diff(A', B)` against
 * the control `diff(A, A')`, per panel, in that panel's own projected rectangle. The dug panel
 * must be far above its floor; the neighbour must be at it.
 *
 * 🚨 **AND UNTIL 2026-08-09 THAT CONTROL WAS A LOTTERY, WHICH MADE THE WHOLE TEST ONE.** The
 * floor read **43-49% of the rect moved, mean |Δ| 12-14** on `visible-1`'s run and **4.18%** on
 * the next run of the identical build — so `test > 3 × floor` was unreachable in the first case
 * (*"the dug panel's pixels changed"* fails at 90% moved) and meaningless in the second. The
 * cause is not in this file and not in the game: **`playtest.mjs` boots the LIVE loop**, and
 * `docs/capture-determinism.md`'s 2026-08-05 fix is explicitly a CAPTURE-mode property. Nothing
 * regressed; live mode was never covered.
 *
 * The floor's terms, each armed alone on a pixel-identical base (`_jitter1-who.mjs`): a
 * dynamic-resolution step **7.54%**, the grain phase **0.74%**, the AO sample rotation **0.47%**,
 * the whole game update **0.07%**, the four practical flickers **0.00%**. The big one is dynamic
 * resolution, it is driven by frame time, and frame time is driven by whatever else is on the
 * GPU — which is exactly why the same test floors at 0.7% alone and 49% under load.
 *
 * **So both captures of every pair are now taken under `harness/still.mjs`'s `hold()`**, which
 * pins those four terms from the page and reverts them immediately afterwards. **No source in
 * `src/` changed and nothing a player sees is different** — the grain still ships at 0.024 and
 * still animates in the game. `hold()`'s header carries the full table.
 *
 * ✅ **AND THE FLOOR IS NOW ASSERTED RATHER THAN PRINTED, WITH THE FIX REINTRODUCED IN THE SAME
 * PAGE ON EVERY RUN.** Two new checks: the same-config floor must BE a floor, and unpinning the
 * dithers must put the jitter back — a floor gate that has only ever run against a still page is
 * not evidence of anything.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { decodePng } from '../pxdiff.mjs';
import { hold, release, unpinDithers } from '../still.mjs';

/** Mean absolute RGB difference inside a rect, and the fraction of pixels that moved at all. */
function rectDiff(a, b, r) {
  const w = a.width;
  let sum = 0, n = 0, moved = 0, signed = 0, lumaA = 0, big = 0;
  const x0 = Math.max(0, r.x0 | 0), x1 = Math.min(a.width, r.x1 | 0);
  const y0 = Math.max(0, r.y0 | 0), y1 = Math.min(a.height, r.y1 | 0);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * a.channels;
      const d = Math.max(
        Math.abs(a.data[i] - b.data[i]),
        Math.abs(a.data[i + 1] - b.data[i + 1]),
        Math.abs(a.data[i + 2] - b.data[i + 2]));
      sum += d; n++;
      signed += (b.data[i] - a.data[i] + b.data[i + 1] - a.data[i + 1] + b.data[i + 2] - a.data[i + 2]) / 3;
      lumaA += 0.2126 * a.data[i] + 0.7152 * a.data[i + 1] + 0.0722 * a.data[i + 2];
      if (d > 8) moved++;
      // 🎯 THE DISCRIMINATOR. A break-state leak paints this panel's own layer discards, i.e.
      // a HOLE — high-contrast structure against unchanged neighbours. A second-order lighting
      // change from a breach 4 m away is a smooth shift of the whole surface. `d > 40` is
      // "this pixel changed by more than any relight of a mid-grey wall can account for".
      if (d > 40) big++;
    }
  }
  return { mean: n ? sum / n : 0, movedPct: n ? (moved / n) * 100 : 0, px: n,
    signed: n ? signed / n : 0, luma: n ? lumaA / n : 0, bigPct: n ? (big / n) * 100 : 0 };
}

export default async function progkeyIndependence({ page, note, pass, fail, skip, snap, shot, SHOTDIR, VIEW }) {
  const settle = async (frames = 45) => { for (let i = 0; i < frames; i++) await page.waitForTimeout(40); };

  // ---------------------------------------------------------------- pick the pair
  //
  // COPLANAR NEIGHBOURS, CHOSEN OFF THE SCENE AND NEVER BY NAME. Two panels count as
  // neighbours when they share a rotation and lie on the same line, so one camera on the shared
  // normal sees both faces flat-on and a hole in one is directly comparable to the other.
  const picked = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e?.room?.panels) return null;
    const ps = e.room.panels;
    const rows = ps.map((p) => ({
      p,
      id: p.id,
      rotY: p.rotY,
      w: p.width,
      dig: !!p.field,
      cx: p.root.position.x, cy: p.root.position.y, cz: p.root.position.z,
      /**
       * Damageable at all? A CHAINED site never moves however hard you hit it.
       * 🚨 **THIS READ `canOpen()` AND `canOpen()` IS THE WRONG QUESTION — MEASURED 2026-08-10.**
       * It is `defs.some((d) => !d.blocksMove)`, i.e. *"is there a stage in this panel's TABLE
       * that would not block"*, which is TRUE for a chained exit site: its table ends open, it is
       * just `damageable: false` at every reachable stage. So `x.*` sites scored as movable, the
       * two skips below could never fire, and the moment the picker's real pair went away this
       * file reported two hard FAILs — *"did not move"* and *"the positive control did NOT
       * fire"* — for a house that was working perfectly. `isDamageable()` is the question: can I
       * hurt it RIGHT NOW.
       */
      canMove: !!p.field || (p.state?.isDamageable?.() ?? true),
    }));
    let best = null;
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i], b = rows[j];
        if (a.dig !== b.dig) continue;
        if (Math.abs(Math.cos(a.rotY - b.rotY) - 1) > 1e-3) continue;   // same facing
        if (Math.abs(a.cy - b.cy) > 0.05) continue;
        // same plane: the along-normal offset must agree
        const n = { x: Math.sin(a.rotY), z: Math.cos(a.rotY) };
        const off = (b.cx - a.cx) * n.x + (b.cz - a.cz) * n.z;
        if (Math.abs(off) > 0.05) continue;
        const sep = Math.hypot(b.cx - a.cx, b.cz - a.cz);
        if (sep < (a.w + b.w) * 0.45) continue;                          // overlapping
        if (sep > 9) continue;                                           // too far to frame
        // Prefer, in order: a DAMAGE-armed pair (the dig is the campaign and its faces are the
        // 36 materials the collapse merges most), then a pair whose target can be damaged at
        // all, then the closest pair. `x.*` exit sites are deprioritised — another slice has an
        // open aperture defect on them and a known-bad panel makes a bad control.
        const score = sep
          + (a.dig ? 0 : 1000)
          + (a.canMove ? 0 : 100) + (b.canMove ? 0 : 100)
          + (a.id.startsWith('x.') ? 20 : 0) + (b.id.startsWith('x.') ? 20 : 0);
        if (!best || score < best.score) best = { a, b, sep, score };
      }
    }
    if (!best) return null;
    // dig the one that can move; if both can, dig the first
    const target = best.a.canMove ? best.a : best.b;
    const other = target === best.a ? best.b : best.a;
    return {
      arm: target.dig ? 'damage' : 'scalar',
      target: target.id, other: other.id, sep: +best.sep.toFixed(2),
      w: target.w, canMove: { [target.id]: target.canMove, [other.id]: other.canMove },
    };
  });

  if (!picked) { skip('two coplanar neighbouring panels exist', 'no pair found in this build'); return; }
  note(`arm: ${picked.arm} · digging ${picked.target} · watching ${picked.other} · ${picked.sep} m apart`);
  if (!picked.canMove[picked.target]) {
    skip('the target panel is damageable', `${picked.target} is a CHAINED site — nothing to prove`);
    return;
  }
  /**
   * 🚨 **THE WATCHED PANEL MUST BE BREAKABLE TOO, OR THE POSITIVE CONTROL CANNOT FIRE AND THE
   * "NEIGHBOUR IS INTACT" PASS IS WORTH NOTHING.** The last check in this file breaks the OTHER
   * panel for real and demands the leak predicate see it. A CHAINED exit site cannot be broken, so
   * that control reports 0.00% and goes red — and the two reds together read as a leak regression
   * when what actually happened is that the probe has no subject.
   *
   * ⚠️ **THIS BECAME REACHABLE ON 2026-08-10, AND THE CAUSE IS NAMED HERE SO IT IS NOT
   * RE-DIAGNOSED.** The scalar arm's pair had always been `p.svc_w.n` + `p.svc_w.s`, the two
   * `BREACHABLE` connectors in the service passage's west wall, 7.8 m apart and coplanar. John had
   * the hallway doors removed (`spaces.js` `PASSAGE_DOORS`) and **no pair of two DAMAGEABLE
   * non-exit panels within 9 m survives anywhere in the house** — `p.gal_w`/`p.gal_e` are the only
   * remaining coplanar pair and they are 24 m apart. So on the shipped default this arm SKIPs, per
   * HANDOFF's rule that a probe which cannot observe must never report PASS.
   *
   * ✅ **RE-ARM IT WITH `--q "seed=s4&dig=0&doors=1"`** — measured 2026-08-10, **12/12, the pair
   * back at `p.svc_w.n`/`p.svc_w.s`, positive control 67.89% px>40 against the 1% bar.** The
   * scalar path itself is unchanged; only the floor plan's supply of subjects is.
   */
  if (!picked.canMove[picked.other]) {
    skip('the watched panel can be broken, so the positive control can fire',
      `${picked.other} is a CHAINED site: the leak check's own control could not break it, and a `
      + 'control that cannot fire makes the leak PASS meaningless. No damageable non-exit pair '
      + 'within 9 m exists on this arm since the hallway doors were removed — re-run with '
      + '`&doors=1` (12/12 there on 2026-08-10).');
    return;
  }

  // ---------------------------------------------------------------- park the camera
  //
  // 🚨 **HEAD-ON, ONE PANEL AT A TIME, AND THE FIRST BUILD OF THIS SCENARIO PROVES WHY.** It
  // framed both faces at once by backing the camera off the midpoint — which for two 5.7 m
  // service faces 6.2 m apart is 8.8 m, and the service passage is not 8.8 m wide. The camera
  // ended up in a different (non-resident) space, the panels' projected rectangles landed on
  // whatever geometry happened to be there, and the DUG panel's own rect moved 2.33% against a
  // 2.55% floor — i.e. the instrument could not see a body-sized breach, so it could not have
  // seen a leak either. It reported the neighbour intact, and that PASS was worth nothing.
  // A probe that cannot observe must not pass: the target's own rect having to move is now an
  // assertion, and the station is `dig-free.mjs`'s — on the face normal, close enough to stay
  // inside the room the face belongs to.
  const station = (pid, dist) => page.evaluate(([id, d]) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(id);
    if (!p) return null;
    const n = p.normal;
    const c = p.pointAt(0.5, 0.45);
    e.player.pos.set(c.x + n.x * d, e.room.floorY, c.z + n.z * d);
    e.player.vel.set(0, 0, 0);
    // forward in this codebase is (sin yaw, cos yaw); we want to face -normal
    e.player.facing = Math.atan2(-n.x, -n.z);
    if (e.cam) { e.cam.yaw = e.player.facing; e.cam.pitch = 0; e.cam._first = true; }
    return { space: e.room.spaceAt(e.player.pos)?.id ?? null };
  }, [pid, dist]);

  /** Both panels' screen rectangles, in SCREENSHOT pixels, plus their current break state. */
  const readRects = () => page.evaluate(([tid, oid]) => {
    const e = window.__rrr.engine;
    const THREE = e.THREE ?? null;
    const out = {};
    const cvs = e.renderer.domElement;
    const sw = cvs.clientWidth, sh = cvs.clientHeight;
    for (const id of [tid, oid]) {
      const p = e.room.panelOf(id);
      let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, anyBehind = false;
      for (const [u, v] of [[0.03, 0.03], [0.97, 0.03], [0.03, 0.97], [0.97, 0.97]]) {
        const w = p.pointAt(u, v).clone ? p.pointAt(u, v).clone() : p.pointAt(u, v);
        const q = w.project(e.camera);
        if (q.z > 1) anyBehind = true;
        const x = (q.x * 0.5 + 0.5) * sw, y = (1 - (q.y * 0.5 + 0.5)) * sh;
        minx = Math.min(minx, x); maxx = Math.max(maxx, x);
        miny = Math.min(miny, y); maxy = Math.max(maxy, y);
      }
      out[id] = {
        rect: { x0: minx, x1: maxx, y0: miny, y1: maxy }, anyBehind,
        onScreen: maxx > 0 && minx < sw && maxy > 0 && miny < sh,
        maxDepth: p.field ? +p.field.maxDepth.toFixed(4) : null,
        hits: p.field ? p.field.hits : null,
        stage: p.state?.stage ?? null,
        breaks: p.mats.map((m) => +(m?.userData?.breakUniforms?.uBreak?.value ?? 0).toFixed(4)),
        visibleLayers: p.layers.map((l) => (l.visible ? 1 : 0)).join(''),
        barrierVisible: p.barrier ? !!p.barrier.visible : null,
      };
    }
    out._screen = { w: sw, h: sh };
    return out;
  }, [picked.target, picked.other]);

  const T = picked.target, O = picked.other;
  const DIST = 3.0;

  /**
   * Visit one panel's own head-on station and bring back two consecutive frames — the picture
   * and its own same-config noise floor — plus the panel's state and screen rect there.
   *
   * ⚠️ **THE ORDER IS LOAD-BEARING: PARK, SETTLE WITH THE SIM RUNNING, *THEN* FREEZE.** The
   * camera is driven by an updater, and `hold()` parks the updaters — so freezing before the
   * teleport leaves the camera behind and the panel projects off screen while every diff under
   * it reads a confident 0.00%. That exact mistake produced a whole table of zeroes in
   * `_jitter1-who.mjs`'s first build.
   */
  const visit = async (pid, tag) => {
    const st = await station(pid, DIST);
    if (!st) return null;
    await settle(45);
    const geom = await readRects();
    const pinned = await hold(page);
    await settle(4);    // a parked frame reaches the compositor, and a re-scale re-primes depth
    note(`  ${tag}: held ${JSON.stringify(pinned.pinned)}`);
    const one = await snap(`${tag}-1`);
    await settle(8);
    const two = await snap(`${tag}-2`);
    /**
     * 🚨 REINTRODUCE THE DEFECT IN THE SAME PAGE. With the two post dithers unpinned — and
     * nothing else about the hold changed — the identical pair must stop being identical. If it
     * does not, the freeze above is not doing what the floor gate below credits it with.
     */
    await unpinDithers(page, true);
    await settle(8);
    const jittered = await snap(`${tag}-3`);
    await unpinDithers(page, false);
    await release(page);
    /**
     * 📸 **THE FRAMES THE ASSERTIONS ACTUALLY USE GO TO DISK, NOT JUST A LIVE ONE TAKEN
     * AFTERWARDS.** `shot(tag)` fires after `release()`, so it is a DIFFERENT moment from the
     * held pair every number below is computed from — and when the two disagreed (the live
     * pair said the neighbour moved 1.59%, the held pair 11.60%) there was no picture of the
     * evidence to look at. If you assert something is on screen, look at a picture of IT.
     */
    if (two) {
      await mkdir(SHOTDIR, { recursive: true });
      await writeFile(path.join(SHOTDIR, `${VIEW}.${tag}.held.png`), two);
    }
    await shot(tag);
    return { space: st.space, geom, one, two, jittered, pinned };
  };

  /**
   * The two faces obliquely, from ONE fixed camera, so the before/after pair is a straight
   * comparison. Two 5.7 m faces 6 m apart cannot be framed head-on from inside their own room,
   * which is what the first build of this scenario got wrong.
   */
  const oblique = () => page.evaluate(([tid, oid]) => {
    const e = window.__rrr.engine;
    const t = e.room.panelOf(tid), o = e.room.panelOf(oid);
    const n = t.normal;
    const away = { x: t.root.position.x - o.root.position.x, z: t.root.position.z - o.root.position.z };
    const L = Math.hypot(away.x, away.z) || 1;
    const c = t.pointAt(0.5, 0.45);
    e.player.pos.set(c.x + n.x * 2.2 + (away.x / L) * 4.2, e.room.floorY,
      c.z + n.z * 2.2 + (away.z / L) * 4.2);
    e.player.vel.set(0, 0, 0);
    const mid = { x: (t.root.position.x + o.root.position.x) / 2 + n.x * 0.2,
      z: (t.root.position.z + o.root.position.z) / 2 + n.z * 0.2 };
    e.player.facing = Math.atan2(mid.x - e.player.pos.x, mid.z - e.player.pos.z);
    if (e.cam) { e.cam.yaw = e.player.facing; e.cam.pitch = 0; e.cam._first = true; }
  }, [T, O]);

  await oblique();
  await settle(45);
  await shot('progkey-both-intact');

  const beforeT = await visit(T, 'progkey-target-before');
  const beforeO = await visit(O, 'progkey-neighbour-before');
  if (!beforeT || !beforeO) { skip('both panels have a station', 'panelOf() did not resolve'); return; }
  note(`${T} station in space ${beforeT.space}; ${O} station in space ${beforeO.space}`);
  note(`grain still shipping at ${beforeT.pinned?.grain} — the hold pins its PHASE, never its amplitude`);
  const before = beforeT.geom;
  if (!beforeT.geom[T].onScreen || !beforeO.geom[O].onScreen) {
    skip('both panels are on screen at their own station',
      `${T} ${beforeT.geom[T].onScreen}, ${O} ${beforeO.geom[O].onScreen}`);
    return;
  }
  note(`before — ${T}: ${JSON.stringify(before[T].breaks)} depth ${before[T].maxDepth} stage ${before[T].stage}`);
  note(`before — ${O}: ${JSON.stringify(beforeO.geom[O].breaks)} depth ${beforeO.geom[O].maxDepth} stage ${beforeO.geom[O].stage}`);

  // ---------------------------------------------------------------- dig exactly ONE panel
  const dug = await page.evaluate(([tid, arm]) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(tid);
    if (arm === 'damage') {
      // a body-sized breach, driven through the real brush at real hit points
      for (let k = 0; k < 90; k++) {
        const u = 0.5 + ((k % 5) - 2) * 0.045;
        const v = 0.46 + (Math.floor(k / 5) % 5 - 2) * 0.05;
        p.applyHit(p.pointAt(u, v), 1);
      }
      p.field.flush();
      return { hits: p.field.hits, maxDepth: +p.field.maxDepth.toFixed(4) };
    }
    for (let k = 0; k < 40; k++) p.damage(1e4, { point: p.pointAt(0.5, 0.5), weapon: 'sledge' });
    return { stage: p.state.stage };
  }, [T, picked.arm]);
  note(`dug ${T}: hits ${dug.hits?.length ?? dug.hits} maxDepth ${dug.maxDepth ?? '-'} stage ${dug.stage ?? '-'}`);
  await settle(45);

  const afterT = await visit(T, 'progkey-target-after');
  const afterO = await visit(O, 'progkey-neighbour-after');
  const after = afterT.geom;
  note(`after  — ${T}: ${JSON.stringify(after[T].breaks)} depth ${after[T].maxDepth} stage ${after[T].stage} layers ${after[T].visibleLayers} barrier ${after[T].barrierVisible}`);
  note(`after  — ${O}: ${JSON.stringify(afterO.geom[O].breaks)} depth ${afterO.geom[O].maxDepth} stage ${afterO.geom[O].stage} layers ${afterO.geom[O].visibleLayers} barrier ${afterO.geom[O].barrierVisible}`);

  await oblique();
  await settle(45);
  await shot('progkey-one-dug-neighbour-intact');

  // ---------------------------------------------------------------- 1. the state did not leak
  const oB = beforeO.geom[O], oA = afterO.geom[O];
  const sameState = JSON.stringify(oB.breaks) === JSON.stringify(oA.breaks)
    && oB.maxDepth === oA.maxDepth
    && oB.stage === oA.stage
    && oB.visibleLayers === oA.visibleLayers;
  if (sameState) {
    pass('the neighbour\'s break STATE is untouched',
      `${O}: breaks ${JSON.stringify(oA.breaks)}, depth ${oA.maxDepth}, stage ${oA.stage}, layers ${oA.visibleLayers}`);
  } else {
    fail('the neighbour\'s break STATE is untouched',
      `${O} moved: ${JSON.stringify(oB)} -> ${JSON.stringify(oA)}`);
  }

  const targetMoved = JSON.stringify(before[T].breaks) !== JSON.stringify(after[T].breaks)
    || before[T].maxDepth !== after[T].maxDepth
    || before[T].stage !== after[T].stage;
  if (targetMoved) pass('the dug panel actually broke', `${T} moved — the test is not vacuous`);
  else fail('the dug panel actually broke', `${T} did not move; nothing was proved either way`);

  // ---------------------------------------------------------------- 2. the PIXELS did not leak
  const bufs = [beforeT.one, beforeT.two, afterT.two, beforeO.one, beforeO.two, afterO.two];
  if (bufs.some((b) => !b)) { skip('per-panel pixel diff', 'a screenshot did not come back'); return; }
  let dec;
  try { dec = bufs.map(decodePng); } catch (err) {
    skip('per-panel pixel diff', `decode failed: ${String(err).slice(0, 80)}`); return;
  }
  const [T1, T2, T3, O1, O2, O3] = dec;
  const sx = T1.width / before._screen.w, sy = T1.height / before._screen.h;
  const scale = (r) => ({ x0: r.x0 * sx, x1: r.x1 * sx, y0: r.y0 * sy, y1: r.y1 * sy });
  note(`screenshot ${T1.width}x${T1.height}, canvas ${before._screen.w}x${before._screen.h}`);

  const rows = {
    [T]: { rect: scale(before[T].rect), floor: null, test: null },
    [O]: { rect: scale(oB.rect), floor: null, test: null },
  };
  rows[T].floor = rectDiff(T1, T2, rows[T].rect);
  rows[T].test = rectDiff(T2, T3, rows[T].rect);
  rows[O].floor = rectDiff(O1, O2, rows[O].rect);
  rows[O].test = rectDiff(O2, O3, rows[O].rect);
  for (const id of [T, O]) {
    const r = rows[id].rect;
    note(`${id}  head-on rect ${Math.round(r.x0)},${Math.round(r.y0)}..${Math.round(r.x1)},${Math.round(r.y1)} (${rows[id].floor.px} px)`);
    note(`      same-config FLOOR  mean ${rows[id].floor.mean.toFixed(3)}  moved ${rows[id].floor.movedPct.toFixed(2)}%`);
    note(`      after digging ${T}  mean ${rows[id].test.mean.toFixed(3)}  moved ${rows[id].test.movedPct.toFixed(2)}%`
      + `  signed ${rows[id].test.signed.toFixed(2)}  px>40 ${rows[id].test.bigPct.toFixed(2)}%  (rect luma ${rows[id].test.luma.toFixed(1)})`);
  }

  /**
   * ---------------------------------------------------------------- 1b. IS THE FLOOR A FLOOR?
   *
   * 🚨 **THE GATE THAT WOULD HAVE CAUGHT THIS ON THE DAY, AND IT IS THE ONE THAT WAS MISSING.**
   * Both of the assertions below are RATIOS against the floor, so a floor that is really an
   * uncontrolled variable makes them unfalsifiable in both directions at once: at 48% the dug
   * panel's own 90% is a FAIL, and at 23% the neighbour is granted a 70% allowance to move
   * inside. Neither reads as an instrument fault in a tail — one reads as a broken game and the
   * other as a pass.
   *
   * ⚠️ **THE STANDARD BEING HELD HERE IS "PIXEL-IDENTICAL", DELIBERATELY, AND IT IS NOT THE
   * PROJECT'S GENERAL STANDARD.** HANDOFF is right that byte-identity is an impossible test in
   * general and must never be demanded as proof of a CHANGE. This is the other case: two
   * captures with the sim held still and both post dithers pinned are supposed to be the same
   * picture, so the tolerance below is a smidgen of slack against a compositor, not a noise
   * budget. It reads exactly 0.000 on this box.
   */
  const FLOOR_MAX_MOVED = 0.05;      // % of the rect
  const FLOOR_MAX_MEAN = 0.5;        // /255
  const badFloors = [T, O].filter((id) =>
    rows[id].floor.movedPct > FLOOR_MAX_MOVED || rows[id].floor.mean > FLOOR_MAX_MEAN);
  if (!badFloors.length) {
    pass('the same-config floor IS a floor',
      `${T} ${rows[T].floor.movedPct.toFixed(3)}% / |Δ| ${rows[T].floor.mean.toFixed(3)} · `
      + `${O} ${rows[O].floor.movedPct.toFixed(3)}% / |Δ| ${rows[O].floor.mean.toFixed(3)} — held still, so both bars below are ratios against a real zero`);
  } else {
    fail('the same-config floor IS a floor',
      badFloors.map((id) => `${id} ${rows[id].floor.movedPct.toFixed(2)}% / |Δ| ${rows[id].floor.mean.toFixed(2)}`).join(' · ')
      + ' — two captures with NOTHING done between them are different pictures, so every ratio below is unfalsifiable. Do not read the rest of this run.');
  }

  /**
   * ---------------------------------------------------------------- 1c. VALIDATE BY REINTRODUCING
   *
   * `visit()` took a third frame with the two post dithers unpinned and nothing else changed.
   * If THAT pair is also identical, the hold is not what is making the floor zero and the check
   * above is congratulating itself. Asserted on mean |Δ| rather than on `moved%`: the grain is
   * ±3 of 255 and mostly sits under the `d > 8` threshold, which is the whole reason "kill the
   * grain" was never the fix.
   */
  const reintro = [];
  for (const [id, v] of [[T, beforeT], [O, beforeO]]) {
    if (!v.jittered) continue;
    let j;
    try { j = decodePng(v.jittered); } catch { continue; }
    reintro.push({ id, d: rectDiff(id === T ? T2 : O2, j, rows[id].rect) });
  }
  if (!reintro.length) {
    skip('unpinning the dithers puts the jitter back', 'the third frame did not come back');
  } else if (reintro.every((r) => r.d.mean > 0.5)) {
    pass('unpinning the dithers puts the jitter back',
      reintro.map((r) => `${r.id} |Δ| ${r.d.mean.toFixed(2)} (${r.d.movedPct.toFixed(2)}% moved)`).join(' · ')
      + ' — the zero floor above is the hold working, not the probe failing to look');
  } else {
    fail('unpinning the dithers puts the jitter back',
      reintro.map((r) => `${r.id} |Δ| ${r.d.mean.toFixed(3)}`).join(' · ')
      + ' — the defect could not be reintroduced, so the floor gate above proves nothing');
  }

  const tgt = rows[T], oth = rows[O];
  if (tgt.test.movedPct > Math.max(3, tgt.floor.movedPct * 3)) {
    pass('the dug panel\'s PIXELS changed',
      `${T}: ${tgt.test.movedPct.toFixed(2)}% of its rect moved against a ${tgt.floor.movedPct.toFixed(2)}% floor`);
  } else {
    fail('the dug panel\'s PIXELS changed',
      `${T}: only ${tgt.test.movedPct.toFixed(2)}% moved against a ${tgt.floor.movedPct.toFixed(2)}% floor — the capture cannot see the dig, so it cannot see a leak either`);
  }

  /**
   * THE ASSERTION THE WHOLE SLICE TURNS ON. The neighbour shares a compiled program with the
   * panel that was just dug; if uniforms were shared, a hole would have appeared here.
   *
   * 🚨 **AND THE ZERO FLOOR IMMEDIATELY BROKE ITS OLD FORM, WHICH IS THE POINT OF A ZERO
   * FLOOR.** The old bar was `moved% > max(1.0, floor × 3 + 0.5)`. Against the 23% floor the
   * live page used to produce, that allowed the neighbour SEVENTY PER CENT of its rect to move
   * before anyone was told. Against a real zero it fails on 38% — and 38% is not a leak:
   *
   *     dug panel   89.29% moved · |Δ| 72.8 · signed +48.4 · **71.96% of pixels moved by >40**
   *     neighbour   38.67% moved · |Δ|  7.2 · signed  +5.7 · ** 0.03% of pixels moved by >40**
   *
   * ⚠️ **OPENING A BODY-SIZED HOLE 4.4 m ALONG THE SAME WALL RELIGHTS THE ROOM, AND THAT IS THE
   * GAME WORKING.** Measured on the held pair, whole frame: ceiling band +3.3, floor band +3.9,
   * neighbour +5.7, 87% of the neighbour's pixels brighter and 0.1% darker, no structure
   * anywhere in its rect. A smooth 4% lift on a lit wall is light arriving through the breach.
   *
   * 🎯 **SO THE TEST IS STRUCTURE, NOT MAGNITUDE.** A bound-uniform leak paints the DUG panel's
   * layer discards onto this one — a hole, against a lit wall, which is what `px > 40` counts.
   * The real leak scores in the tens of percent there (the dug panel scores 71.96%); a relight
   * scores 0.03%. The bar is set at 1.0%, a ~70x margin under a genuine leak and ~30x over the
   * relight, and it is VALIDATED BY REINTRODUCTION at the end of this file rather than trusted.
   */
  const LEAK_BIG_PCT = 1.0;
  const leakSig = (d) => d.bigPct > LEAK_BIG_PCT || d.mean > 20;
  const leaked = leakSig(oth.test);
  if (!leaked) {
    pass('🚨 the NEIGHBOUR is still intact, in pixels',
      `${O}: ${oth.test.bigPct.toFixed(2)}% of its rect moved by >40 (bar ${LEAK_BIG_PCT}%, the dug panel scores ${tgt.test.bigPct.toFixed(2)}%) `
      + `— its ${oth.test.movedPct.toFixed(1)}% / |Δ| ${oth.test.mean.toFixed(1)} is a smooth signed ${oth.test.signed >= 0 ? '+' : ''}${oth.test.signed.toFixed(1)} relight through the new breach, with a 0.00% same-config floor under it`);
  } else {
    fail('🚨 the NEIGHBOUR is still intact, in pixels',
      `${O}: ${oth.test.bigPct.toFixed(2)}% of its rect moved by >40, |Δ| ${oth.test.mean.toFixed(1)} — `
      + 'that is STRUCTURE, not a relight. BREAK STATE IS LEAKING BETWEEN PANELS. Revert the program-key collapse.');
  }

  /**
   * ---------------------------------------------------------------- 3. THE POSITIVE CONTROL
   *
   * 🚨 **A LEAK DETECTOR THAT HAS ONLY EVER RUN AGAINST NON-LEAKING CODE IS NOT EVIDENCE OF
   * ANYTHING** — HANDOFF's rule, and the reason `mechanics.mjs`'s slow-frame check and
   * `dig-band`'s B2c exist in the form they do. The bar above was chosen from ONE observation of
   * a relight and ONE of a real break, so it has to be shown firing.
   *
   * The faithful positive is not a simulated uniform write, it is the real thing: break the
   * NEIGHBOUR too, at its own station, and require the same predicate to catch it. It runs last
   * and destroys the neighbour's pristine state, which is why it runs last.
   */
  const dug2 = await page.evaluate(([oid, a]) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(oid);
    if (a === 'damage') {
      for (let k = 0; k < 90; k++) {
        const u = 0.5 + ((k % 5) - 2) * 0.045;
        const v = 0.46 + (Math.floor(k / 5) % 5 - 2) * 0.05;
        p.applyHit(p.pointAt(u, v), 1);
      }
      p.field.flush();
      return { maxDepth: +p.field.maxDepth.toFixed(4) };
    }
    for (let k = 0; k < 40; k++) p.damage(1e4, { point: p.pointAt(0.5, 0.5), weapon: 'sledge' });
    return { stage: p.state.stage };
  }, [O, picked.arm]);
  await settle(45);
  const brokenO = await visit(O, 'progkey-neighbour-broken');
  if (!brokenO?.two) {
    skip('the leak check CATCHES a real break (positive control)', 'the control capture did not come back');
  } else {
    let O4;
    try { O4 = decodePng(brokenO.two); } catch { O4 = null; }
    if (!O4) {
      skip('the leak check CATCHES a real break (positive control)', 'decode failed');
    } else {
      const ctrl = rectDiff(O3, O4, rows[O].rect);
      note(`positive control — ${O} broken for real (${JSON.stringify(dug2)}): `
        + `${ctrl.movedPct.toFixed(2)}% moved, |Δ| ${ctrl.mean.toFixed(2)}, px>40 ${ctrl.bigPct.toFixed(2)}%`);
      if (leakSig(ctrl)) {
        pass('the leak check CATCHES a real break (positive control)',
          `breaking ${O} scores ${ctrl.bigPct.toFixed(2)}% px>40 / |Δ| ${ctrl.mean.toFixed(1)} against the ${LEAK_BIG_PCT}% bar, `
          + `where the relight scored ${oth.test.bigPct.toFixed(2)}% — the check above can tell the two apart`);
      } else {
        fail('the leak check CATCHES a real break (positive control)',
          `${O} was actually broken and the predicate did NOT fire (${ctrl.bigPct.toFixed(2)}% px>40, |Δ| ${ctrl.mean.toFixed(1)}) — `
          + 'the "neighbour is intact" PASS above is worth nothing');
      }
    }
  }
}
