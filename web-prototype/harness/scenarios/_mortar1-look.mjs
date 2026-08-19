/**
 * 🧱 **THE MORTAR SLAB ON A DIG FACE, PHOTOGRAPHED — the gallery and the ballroom, before and
 * after.**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_mortar1-look.mjs \
 *        --port 5462 --q "seed=s4" --shots
 *
 *   env  FACES=f.gal_svc.0.b,f.bal_west.0.a    the two faces `_pris1-look.mjs` had to SKIP
 *
 * ⚠️ **`--q`, NEVER `--extra`.** Use `playtest.mjs`, not `shoot.mjs` (no `@vite/client` stub).
 *
 * ---------------------------------------------------------------------------------------------
 * WHY A PICTURE
 * ---------------------------------------------------------------------------------------------
 * `_mortar1-count.mjs` proves the geometry: an `exterior.mortar` slab covering **81.0% of the
 * face rectangle**, 10-26 mm proud, on **10 of 28 dig faces** at seed s4. That is a number.
 * `walls-perf.md` records `_pris1-look.mjs` SKIPPING on exactly these two faces because it could
 * not rule on a picture it could not see — *"the coat is correct and invisible in the gallery and
 * the ballroom"*. **This is that picture.** HANDOFF: *"if you assert something is on screen, look
 * at a picture of it."*
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE ORDER, AND EVERY LINE OF IT IS A RULE SOMEBODY PAID FOR
 * ---------------------------------------------------------------------------------------------
 *   · **PARK AND SETTLE WITH THE SIM RUNNING, THEN `hold()`.** `hold()` empties
 *     `engine._updaters`, and the camera is driven BY an updater.
 *   · **FLIP THE ARM WITH THE SIM RUNNING.** `setSegmentMortar()` re-derives the plan;
 *     `exterior.update()` is what writes it into the instance matrices, and `update` is an
 *     updater. A flip inside `hold()` would report Δ0 and measure nothing — HANDOFF's rule 5,
 *     which already cost one round four stations of zeroes.
 *   · **400 FRAMES OF SETTLE**, per `_skin1-look.mjs`: the room-title HUD is a TIMED element and
 *     the exposure is still adapting off the boot transient, together worth 44 705 px>16.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE CONTROLS — every one runs on EVERY run
 * ---------------------------------------------------------------------------------------------
 *   L1  **SAME-CONFIG FLOOR** — two frames inside one `hold()`, no flip. Everything below is
 *       measured against it.
 *   L2  **THE REVERT** — the arm is flipped BACK to pre-fix and re-shot. A' must return to A
 *       within the floor. A change that does not revert is not the change being claimed.
 *   L3  **THE FIX IS EXACTLY "THE SEGMENT MORTAR STOPS DRAWING", AND NOTHING ELSE.** Inside the
 *       PRE-FIX hold, `exterior.dress.mortar.segment.visible = false` is set BY HAND (legal under
 *       `hold()` — the updaters are parked, so `exterior.update()` cannot write it back) and the
 *       frame is compared with the shipped arm's. They must agree inside the floor. That is a
 *       stronger statement than any locality mask: it says the two routes to "no slab" are the
 *       same picture, so the plan change has no second effect.
 *       ⚠️ **TWO WEAKER FORMS WERE TRIED AND REJECTED WITH NUMBERS, NOT TASTE.** A displaced
 *       control RECTANGLE fails honestly — the ballroom has **seven** slabs on screen, so
 *       "off the face" lands on another one. A projected-footprint MASK reads 88.4% (gallery) and
 *       69.4% (ballroom) rather than ~100%, because removing an opaque `receiveShadow` box moves
 *       the contact shading beyond its own silhouette — and at the gallery its own displaced-mask
 *       control read **89.1%**, i.e. the mask covered so much of the frame that it said nothing.
 *   L3b **HIDING THE `boards` MESH INSTEAD MUST NOT REPRODUCE THE SHIPPED ARM.** Without it, L3
 *       would pass for any two frames that happened to be close.
 *   L4  **THE FACE MUST RESOLVE.** The panel's four corners are projected and the rect is
 *       required to be on screen and non-degenerate. `_progkey1-independence`'s first build
 *       passed a leak check whose rectangles had landed on unrelated geometry.
 *   L5  **A LONG FLOOR** — the same idle sim time an arm flip costs, with no flip in it. A pair
 *       taken 4 frames apart inside one `hold()` is a floor for no time passing.
 */
import { decodePng, diff, summarise } from '../pxdiff.mjs';
import { hold, release } from '../still.mjs';

const FACES = (process.env.FACES ?? 'f.gal_svc.0.b,f.bal_west.0.a').split(',').filter(Boolean);

/** A sub-image, in the shape `diff()` wants. */
function crop(img, x0, y0, w, h) {
  const ch = img.channels;
  const X0 = Math.max(0, Math.min(img.width - 1, Math.round(x0)));
  const Y0 = Math.max(0, Math.min(img.height - 1, Math.round(y0)));
  const W = Math.max(1, Math.min(img.width - X0, Math.round(w)));
  const H = Math.max(1, Math.min(img.height - Y0, Math.round(h)));
  const out = Buffer.alloc(W * H * ch);
  for (let y = 0; y < H; y++) {
    img.data.copy(out, y * W * ch, ((Y0 + y) * img.width + X0) * ch, ((Y0 + y) * img.width + X0 + W) * ch);
  }
  return { width: W, height: H, channels: ch, data: out };
}

/**
 * Walk every pixel whose worst RGB channel moved by more than `t` and hand it to `fn(x, y)`.
 * ⚠️ A BOUNDING BOX IS THE WRONG INSTRUMENT and cost this project a round (`walls-perf.md`).
 */
function walkDiff(a, b, t, fn) {
  const ch = a.channels;
  let n = 0;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const i = (y * a.width + x) * ch;
      let m = 0;
      for (let k = 0; k < Math.min(ch, 3); k++) {
        const d = Math.abs(a.data[i + k] - b.data[i + k]);
        if (d > m) m = d;
      }
      if (m > t) { n++; fn(x, y); }
    }
  }
  return n;
}

export default async function mortar1look({ page, note, pass, fail, skip, snap, SHOTDIR, VIEW }) {
  const png = (tag) => snap(tag, { path: `${SHOTDIR}/${VIEW}.${tag}.png` });
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 600; i++) {
      await page.waitForTimeout(40);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(400);

  const has = await page.evaluate(() => typeof window.__rrr?.engine?.exterior?.setSegmentMortar === 'function');
  if (!has) { fail('the build carries the fix', 'exterior.setSegmentMortar is missing'); return; }

  /** ⚠️ SIM RUNNING. `exterior.update()` is the updater that writes the instance matrices. */
  const arm = async (on) => {
    const r = await page.evaluate((v) => window.__rrr.engine.exterior.setSegmentMortar(v), on);
    await step(8);
    return r;
  };

  for (const FACE of FACES) {
    note('');
    note(`──────── ${FACE}`);
    const parked = await page.evaluate((id) => {
      const e = window.__rrr.engine;
      const p = e.room.panels.find((q) => q.id === id);
      if (!p) return { ok: false, why: `no panel ${id}` };
      const home = p.ownerSpace;
      const inSign = home ? p.sideOf({ x: home.cx, y: 0, z: home.cz }) : 1;
      const n = p.normal, c = p.pointAt(0.5, 0.5);
      e.player.pos.set(c.x + n.x * 3.4 * inSign, e.room.floorY, c.z + n.z * 3.4 * inSign);
      e.player.vel.set(0, 0, 0);
      const f = Math.atan2(-n.x * inSign, -n.z * inSign);
      e.player.facing = f; e.player.aimYaw = f;
      if (e.cam) { e.cam.yaw = f; e.cam.pitch = 0; e.cam._first = true; }
      e.room.setViewpoints?.([{ pos: e.player.pos, dir: { x: Math.sin(f), z: Math.cos(f) } }]);
      window.__mortar1 = { id, p };
      return { ok: true, space: e.room.spaceAt(e.player.pos)?.id ?? null,
        room: ((home?.root?.name) || '').slice(6), w: +p.width.toFixed(2), h: +p.height.toFixed(2) };
    }, FACE);
    if (!parked.ok) { fail(`${FACE} — the face exists`, parked.why); continue; }
    note(`parked in ${parked.space} (${parked.room}), 3.4 m off a ${parked.w} x ${parked.h} m face`);
    await step(400);

    // ---- L4: where is the face on screen? --------------------------------
    const rect = await page.evaluate(() => {
      const e = window.__rrr.engine, p = window.__mortar1.p, cam = e.camera;
      const cvs = e.renderer.domElement, sw = cvs.clientWidth, sh = cvs.clientHeight;
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, behind = 0;
      for (const [u, v] of [[0.02, 0.02], [0.98, 0.02], [0.02, 0.98], [0.98, 0.98],
        [0.5, 0.5], [0.02, 0.5], [0.98, 0.5]]) {
        const q = p.pointAt(u, v).project(cam);
        if (q.z > 1) behind++;
        const px = (q.x * 0.5 + 0.5) * sw, py = (1 - (q.y * 0.5 + 0.5)) * sh;
        x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      }
      return { x0, x1, y0, y1, sw, sh, behind };
    });
    const rw = rect.x1 - rect.x0, rh = rect.y1 - rect.y0;
    const onScreen = rect.behind === 0 && rw > 40 && rh > 40
      && rect.x1 > 0 && rect.y1 > 0 && rect.x0 < rect.sw && rect.y0 < rect.sh;
    onScreen
      ? pass(`L4 ${FACE} — the face resolves on screen`,
        `rect ${Math.round(rect.x0)},${Math.round(rect.y0)} ${Math.round(rw)}x${Math.round(rh)} px`
        + ` in a ${rect.sw}x${rect.sh} canvas`)
      : fail(`L4 ${FACE} — the face resolves on screen`,
        `rect ${JSON.stringify(rect)} — every number below would be about unrelated geometry`);
    if (!onScreen) continue;

    const shootHeld = async (tag) => {
      await hold(page); await step(4);
      const img = decodePng(await png(tag));
      await release(page); await step(4);
      return img;
    };

    // ================================================================ A — the DEFECT (pre-fix)
    await arm(true);
    await hold(page); await step(4);
    const A = decodePng(await png(`mortar1-${FACE}-A-slab-ON-the-defect`));
    await step(4);
    const A2 = decodePng(await png(`mortar1-${FACE}-A-floor`));
    const st = await page.evaluate(() => {
      const e = window.__rrr.engine, p = window.__mortar1.p;
      const cen = e.exterior.census();
      return { segMortar: cen.segMortar, mortarShown: cen.dressedNow.mortar,
        dressCalls: cen.dressCalls, calls: e.renderer.info.render.calls,
        pristine: p.pristine, instanced: p.instanced, stage: p.state.stage };
    });
    await release(page); await step(4);
    const floor = diff(crop(A, rect.x0, rect.y0, rw, rh), crop(A2, rect.x0, rect.y0, rw, rh));
    note(`A (slab ON): ${JSON.stringify(st)}`);
    note(`L1 same-config FLOOR inside the face rect: ${summarise(floor)}`);

    /**
     * L5 — the LONG floor. An arm flip costs ~16 live frames here (`arm()` steps 8, each held
     * shot steps 4 either side), so the honest floor is that much of the world simply continuing
     * with no flip in it. `_skin1-look.mjs` learned this the expensive way.
     */
    await step(40);
    const AL = await shootHeld(`mortar1-${FACE}-A-long-floor`);
    const longFloor = diff(crop(A, rect.x0, rect.y0, rw, rh), crop(AL, rect.x0, rect.y0, rw, rh));
    note(`L5 LONG FLOOR (40 idle frames, no flip):   ${summarise(longFloor)}`);

    /**
     * L3 / L3b — the two by-hand ablations, taken INSIDE one hold so no sim time passes between
     * them. `hold()` parked `exterior.update()`, which is the only thing that writes these
     * `visible` flags, so setting them here sticks for exactly as long as the hold lasts.
     */
    const hideKind = (kind) => page.evaluate((k) => {
      const e = window.__rrr.engine;
      let n = 0;
      e.scene.traverse((o) => {
        if (!o.isInstancedMesh) return;
        if (!String(o.name || '').startsWith(`exterior.dress.${k}`)) return;
        if (o.visible) { o.visible = false; (window.__mHidden ??= []).push(o); n++; }
      });
      return n;
    }, kind);
    const unhideAll = () => page.evaluate(() => {
      const list = window.__mHidden || [];
      for (const o of list) o.visible = true;
      window.__mHidden = [];
      return list.length;
    });

    await hold(page); await step(4);
    const nMortar = await hideKind('mortar');
    await step(4);
    const H = decodePng(await png(`mortar1-${FACE}-H-mortar-meshes-hidden`));
    await unhideAll(); await step(2);
    const nBoards = await hideKind('boards');
    await step(4);
    const HB = decodePng(await png(`mortar1-${FACE}-HB-boards-hidden-control`));
    await unhideAll();
    await release(page); await step(4);
    note(`L3 ablation inside one hold: hid ${nMortar} mortar mesh(es), ${nBoards} boards mesh(es)`);

    // ================================================================ B — the FIX (shipped)
    await arm(false);
    const B = await shootHeld(`mortar1-${FACE}-B-slab-OFF-shipped`);
    const stB = await page.evaluate(() => {
      const e = window.__rrr.engine;
      const cen = e.exterior.census();
      return { segMortar: cen.segMortar, mortarShown: cen.dressedNow.mortar,
        dressCalls: cen.dressCalls, calls: e.renderer.info.render.calls };
    });
    note(`B (slab OFF, shipped): ${JSON.stringify(stB)}`);

    // ================================================================ A' — the revert control
    await arm(true);
    const A3 = await shootHeld(`mortar1-${FACE}-Aprime-revert-control`);

    const F = Math.max(60, floor.pxOver16, longFloor.pxOver16);
    const dAB = diff(crop(A, rect.x0, rect.y0, rw, rh), crop(B, rect.x0, rect.y0, rw, rh));
    const dAA = diff(crop(A, rect.x0, rect.y0, rw, rh), crop(A3, rect.x0, rect.y0, rw, rh));
    note(`A vs B  — THE FACE RECT, what this fix changed: ${summarise(dAB)}`);
    note(`L2 A vs A' — the revert control:               ${summarise(dAA)}`);

    dAB.pxOver16 > F * 3
      ? pass(`${FACE} — the slab is GONE and it is visible on the face`,
        `${dAB.pxOver16} px>16 inside the face rect against a ${floor.pxOver16}/${longFloor.pxOver16}`
        + ` short/long floor, ${(100 * dAB.pxOver16 / (dAB.width * dAB.height)).toFixed(1)}% of the rect`)
      : fail(`${FACE} — the slab is GONE and it is visible on the face`,
        `${dAB.pxOver16} px>16 against a ${F} floor — the fix does not read`);

    dAA.pxOver16 <= F * 3
      ? pass(`L2 ${FACE} CONTROL — flipping the arm BACK restores the frame`,
        `A vs A' ${dAA.pxOver16} px>16 inside the ${F} floor's band`)
      : fail(`L2 ${FACE} CONTROL — flipping the arm BACK restores the frame`,
        `A vs A' ${dAA.pxOver16} px>16 against a ${F} floor — the arm is not a`
        + ' complete revert, so A vs B is measuring more than the slab');

    /**
     * L3 — the two routes to "no slab" must be the SAME PICTURE. Whole frame, not a crop: a
     * side effect anywhere is what this is looking for. The moved pixels are WALKED rather than
     * bounding-boxed (`walls-perf.md`: two strays at opposite corners turn 44x21 into 415x366).
     */
    /**
     * ⚠️ **THE FLOOR HERE IS THE WHOLE-FRAME LONG ONE, NOT THE IN-HOLD PAIR.** `H` and `B` are
     * taken in DIFFERENT holds with live sim time between them, so the honest floor is `A` vs
     * `AL` — the same amount of nothing happening, whole frame. Against the in-hold floor (0)
     * this check read 557/462 px>16 and failed, which measured the gap between two holds and not
     * the change.
     */
    const wholeFloor = walkDiff(A, A2, 16, () => {});
    const wholeLong = walkDiff(A, AL, 16, () => {});
    const dHB_ = walkDiff(H, B, 16, () => {});
    const dHBB = walkDiff(HB, B, 16, () => {});
    const dAB_ = walkDiff(A, B, 16, () => {});
    note(`L3 whole frame px>16 — A vs B ${dAB_} · mortar-hidden vs B ${dHB_}`
      + ` · boards-hidden vs B ${dHBB} · floors: in-hold ${wholeFloor}, long ${wholeLong}`);

    /**
     * The band is `3 x floor`, the same one every other check in this file uses. `H` and `B` sit
     * in different holds, so the whole-frame LONG floor is the right term: measured 442 px>16 at
     * the ballroom against a 0 in-hold floor, and the by-hand ablation lands at 561 — i.e. at the
     * floor, while the boards control lands at 45 462.
     */
    const WF = Math.max(60, wholeFloor, wholeLong);
    dHB_ <= WF * 3
      ? pass(`L3 ${FACE} — the fix is exactly "the segment mortar stops drawing"`,
        `hiding the mortar mesh by hand on the PRE-FIX arm gives the shipped frame to`
        + ` ${dHB_} px>16 whole-frame, inside the ${WF} same-elapsed-time floor's band, against`
        + ` ${dAB_} for the arm flip itself`)
      : fail(`L3 ${FACE} — the fix is exactly "the segment mortar stops drawing"`,
        `${dHB_} px>16 between the by-hand ablation and the shipped arm against a ${WF} floor —`
        + ' the plan change is doing something the mesh flag does not');

    /**
     * ⚠️ **L3b IS MEASURED INSIDE ONE HOLD AND THAT IS WHY IT NEEDS NO CALIBRATION.** `H` and
     * `HB` are the two ablations taken four frames apart in the SAME hold, so their floor is the
     * in-hold one (0, measured above) rather than the cross-hold long floor. Comparing each of
     * them to `B` instead put the gallery's boards ablation (2 389 px>16) under that station's
     * 805 px whole-frame long floor x3 and the control failed on the floor, not on the finding.
     */
    const dHHB = walkDiff(H, HB, 16, () => {});
    note(`L3b in-hold: mortar-hidden vs boards-hidden ${dHHB} px>16 (in-hold floor ${wholeFloor})`);
    dHHB > Math.max(60, wholeFloor * 3)
      ? pass(`L3b ${FACE} CONTROL — hiding the BOARDS instead is a DIFFERENT picture`,
        `${dHHB} px>16 between the two ablations, taken in one hold against a ${wholeFloor} floor`
        + ` — so L3's ${dHB_} is agreement and not "any two frames"`)
      : fail(`L3b ${FACE} CONTROL — hiding the BOARDS instead is a DIFFERENT picture`,
        `${dHHB} px>16 against a ${wholeFloor} in-hold floor — the ablation is not separating the`
        + ' two dressings, so nothing above is attributable to the mortar');

    await arm(false);   // leave the page on the shipped arm
  }
  void skip;
}
