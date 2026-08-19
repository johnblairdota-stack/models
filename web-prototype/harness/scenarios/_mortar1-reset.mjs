/**
 * 🧱 **`wall.js` `resetDamage()` — DOES IT PUT THE PANEL'S OWN LOOK BACK?** intact → damaged →
 * reset, photographed, with the PRE-FIX reset reproduced on purpose in the same page.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_mortar1-reset.mjs \
 *        --port 5462 --q "seed=s4" --shots
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_mortar1-reset.mjs \
 *        --port 5462 --q "seed=s4&coat=1" --shots      # `pristine-1`'s armed arm
 *
 *   env  FACE=f.gal_east.0.b   which free face to stand in front of
 *        BLOWS=14  POWER=1
 *
 * ⚠️ **`--q`, NEVER `--extra`.** Use `playtest.mjs`, not `shoot.mjs` (no `@vite/client` stub).
 *
 * ---------------------------------------------------------------------------------------------
 * THE DEFECT, CONFIRMED TWICE BEFORE THIS FILE EXISTED
 * ---------------------------------------------------------------------------------------------
 * `skin-1` measured **54 329 px>16 from the intact frame against a 552 floor**, the face
 * rectangle a flat dark plane, *on the arm where the skin eroded nothing* — so it is not the
 * dressing. `critic-skin-1` reproduced it three times (55 620 / 53 184 / 50 103 against floors of
 * 558 / 557 / 422). Neither pinned the line.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE MECHANISM, AND IT IS ONE SENTENCE
 * ---------------------------------------------------------------------------------------------
 * On a free face the stage is a MONOTONE SUMMARY OF THE FIELD — `_syncStageFromField()` is
 * `if (want > this.state.stage) setStage(want)`. `resetDamage()` zeroed the field and **never
 * touched the state machine**, so after a reset the panel sits at `stage 4, depth 0`:
 *   · `_apply()` runs `applyStageBreaks(mats, stage 4, 0)` — the terminal break amounts of the
 *     LAST stage are written into a face with no damage in its grid, and
 *   · `get pristine()` returns `state.stage === 0 && …` → **false**, so `wallinstances.js` never
 *     takes the face back into the shared pristine instance and it goes on drawing its own,
 *     fully-broken, layer 0 for the rest of the round.
 * That is the flat dark plane. It is the SAME LATCH `applyHit`'s own comment documents for the
 * barrier ("dig to the barrier → resetDamage() → stage STILL 4"), arriving through the other half
 * of the same object.
 *
 * ⚠️ **IT IS NOT `pristine-1`'S AND IT WAS NOT WIDENED BY IT.** `pristine-1` changed
 * `wallinstances.js`'s GROUP KEY; `pristine` itself is `src/game/wall.js`'s and is unchanged. Run
 * this file on `?coat=0` and `?coat=1` — the arm where `pristine-1`'s key contributes the empty
 * string and the arm where it does not — and the defect and the fix read the same on both.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE FIVE FRAMES, AND ARM `Rold` IS THE CONTROL THAT MUST FAIL
 * ---------------------------------------------------------------------------------------------
 *   A     INTACT
 *   D     DAMAGED — `BLOWS` real blows through the shipped brush. If D does not differ from A the
 *         dig did not happen and nothing below means anything.
 *   Rold  the PRE-FIX reset, reproduced in the page: exactly `resetDamage()`'s old body
 *         (`field.reset()`, drop the box caches, `_apply()`, `onPromote`) and **not** the state
 *         restore. This must come back DIFFERENT from A — it is the defect, on purpose.
 *   Rnew  the shipped `panel.resetDamage()`. This must come back the SAME as A.
 *   A'    a second intact frame after everything, so "the same as A" has a floor with the same
 *         elapsed sim time in it.
 *
 * ⚠️ **THE DIG IS NEVER RUN INSIDE `hold()`** — it empties `engine._updaters` and the damage
 * texture is uploaded from one. ⚠️ **AND THE DEBRIS HAS TO BE CLEARED AND SETTLED**: `plaster`
 * lives up to 3.2 s and `dust.burst` up to 2.4 s, and `_skin1-look.mjs` recorded a 53 820 px>16
 * "revert failure" that was a room full of falling grit.
 */
import { decodePng, diff, summarise } from '../pxdiff.mjs';
import { hold, release } from '../still.mjs';

const FACE = process.env.FACE ?? 'f.gal_east.0.b';
const BLOWS = +(process.env.BLOWS ?? 14);
const POWER = +(process.env.POWER ?? 1);

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

export default async function mortar1reset({ page, note, pass, fail, skip, snap, SHOTDIR, VIEW }) {
  const png = (tag) => snap(tag, { path: `${SHOTDIR}/${VIEW}.${tag}.png` });
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 900; i++) {
      await page.waitForTimeout(40);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(400);

  // ------------------------------------------------------------------ the subject
  const head = await page.evaluate((id) => {
    const e = window.__rrr.engine;
    const p = e.room.panels.find((q) => q.id === id);
    if (!p) return { ok: false, why: `no panel ${id}` };
    if (!p.field) return { ok: false, why: `${id} has no damage field — this build is ?dig=0` };
    window.__m1 = { p, skin: e.room.skin ?? null };
    return { ok: true, id, coat: new URLSearchParams(location.search).get('coat') ?? '0',
      room: ((p.ownerSpace?.root?.name) || '').slice(6),
      w: +p.width.toFixed(2), h: +p.height.toFixed(2),
      skin: !!e.room.skin, skinOn: !!e.room.skin?.on };
  }, FACE);
  if (!head.ok) { fail(`the subject face ${FACE} exists and is diggable`, head.why); return; }
  note(`${FACE} in ${head.room}, ${head.w} x ${head.h} m · ?coat=${head.coat}`
    + ` · skin ${head.skin ? (head.skinOn ? 'ON' : 'off') : 'absent'}`);

  // ------------------------------------------------------------------ park + settle
  const parked = await page.evaluate(() => {
    const e = window.__rrr.engine, p = window.__m1.p;
    const home = p.ownerSpace;
    const inSign = home ? p.sideOf({ x: home.cx, y: 0, z: home.cz }) : 1;
    const n = p.normal, c = p.pointAt(0.5, 0.5);
    e.player.pos.set(c.x + n.x * 3.4 * inSign, e.room.floorY, c.z + n.z * 3.4 * inSign);
    e.player.vel.set(0, 0, 0);
    const f = Math.atan2(-n.x * inSign, -n.z * inSign);
    e.player.facing = f; e.player.aimYaw = f;
    if (e.cam) { e.cam.yaw = f; e.cam.pitch = 0; e.cam._first = true; }
    e.room.setViewpoints?.([{ pos: e.player.pos, dir: { x: Math.sin(f), z: Math.cos(f) } }]);
    return { space: e.room.spaceAt(e.player.pos)?.id ?? null };
  });
  note(`parked in ${parked.space}, 3.4 m off the face`);
  /** 400 frames: the room-title HUD is a TIMED element and the exposure is still adapting. */
  await step(400);

  const rect = await page.evaluate(() => {
    const e = window.__rrr.engine, p = window.__m1.p, cam = e.camera;
    const cvs = e.renderer.domElement, sw = cvs.clientWidth, sh = cvs.clientHeight;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, behind = 0;
    for (const [u, v] of [[0.02, 0.02], [0.98, 0.02], [0.02, 0.98], [0.98, 0.98], [0.5, 0.5]]) {
      const q = p.pointAt(u, v).project(cam);
      if (q.z > 1) behind++;
      const px = (q.x * 0.5 + 0.5) * sw, py = (1 - (q.y * 0.5 + 0.5)) * sh;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    return { x0, x1, y0, y1, sw, sh, behind };
  });
  const rw = rect.x1 - rect.x0, rh = rect.y1 - rect.y0;
  const onScreen = rect.behind === 0 && rw > 40 && rh > 40;
  onScreen
    ? pass('C0 — the face resolves on screen',
      `rect ${Math.round(rect.x0)},${Math.round(rect.y0)} ${Math.round(rw)}x${Math.round(rh)} px`)
    : fail('C0 — the face resolves on screen', JSON.stringify(rect));
  if (!onScreen) return;

  const state = () => page.evaluate(() => {
    const e = window.__rrr.engine, p = window.__m1.p;
    const brk = (m) => {
      const u = m?.userData?.breakUniforms ?? m?.userData?.uniforms;
      const v = u?.uBreak?.value;
      return typeof v === 'number' ? +v.toFixed(3) : null;
    };
    return {
      stage: p.state.stage, health: +p.state.stageHealth.toFixed(1),
      def0: +p.state.defs[0].health.toFixed(1),
      pristine: p.pristine, instanced: p.instanced,
      hits: p.field.hits.length, maxDepth: +p.field.maxDepth.toFixed(3),
      open: p.field.openCells,
      breaks: (p.mats || []).slice(0, 4).map(brk),
      layersVisible: (p.layers || []).map((l) => l.visible),
      barrier: p.barrier ? p.barrier.visible : null,
      calls: e.renderer.info.render.calls,
    };
  });

  const shootHeld = async (tag) => {
    await hold(page); await step(4);
    const img = decodePng(await png(tag));
    await release(page); await step(4);
    return img;
  };

  const dig = async () => {
    await page.evaluate(([n, power]) => {
      const p = window.__m1.p;
      const N = Math.max(2, Math.round(Math.sqrt(n)));
      let k = 0;
      for (let i = 0; i < N && k < n; i++) {
        for (let j = 0; j < N && k < n; j++, k++) {
          const u = 0.30 + 0.40 * (i + 0.5) / N;
          const v = 0.25 + 0.45 * (j + 0.5) / N;
          p.applyHit(p.pointAt(u, v), power);
        }
      }
    }, [BLOWS, POWER]);
    await step(20);
  };

  /** The debris and dust have their own lifetimes; 240 frames is `_skin1-look.mjs`'s measurement. */
  const quiesce = async () => {
    await page.evaluate(() => { window.__rrr.engine.debris?.clear?.(); });
    await step(240);
    await page.evaluate(() => { window.__rrr.engine.debris?.clear?.(); });
    await step(30);
  };

  // ================================================================== A — intact
  await hold(page); await step(4);
  const A = decodePng(await png('mortar1reset-A-intact'));
  await step(4);
  const A2 = decodePng(await png('mortar1reset-A-floor'));
  const sA = await state();
  await release(page);
  const floor = diff(crop(A, rect.x0, rect.y0, rw, rh), crop(A2, rect.x0, rect.y0, rw, rh));
  note(`A intact: ${JSON.stringify(sA)}`);
  note(`same-config FLOOR inside the face rect: ${summarise(floor)}`);

  // the LONG floor — the same elapsed sim time an arm costs, with nothing happening in it
  await step(330);
  const AL = await shootHeld('mortar1reset-A-long-floor');
  const longFloor = diff(crop(A, rect.x0, rect.y0, rw, rh), crop(AL, rect.x0, rect.y0, rw, rh));
  note(`LONG FLOOR (330 idle frames, no dig): ${summarise(longFloor)}`);

  // ================================================================== D — damaged
  await dig();
  const D = await shootHeld('mortar1reset-D-damaged');
  const sD = await state();
  note(`D damaged: ${JSON.stringify(sD)}`);

  // ================================================================== Rold — the PRE-FIX reset
  /**
   * 🚨 **`resetDamage()`'s OLD BODY, VERBATIM, REPRODUCED IN THE PAGE.** Field, box caches,
   * `_apply()`, `onPromote` — and deliberately NOT the state restore this slice added. It is the
   * control that must fail: if this comes back identical to A there was never a defect and the
   * fix below is measuring nothing.
   */
  await page.evaluate(() => {
    const p = window.__m1.p;
    p.field.reset();
    p._solidBoxes = null; p._sightBoxes = null;
    p._apply();
    p.onPromote?.(p);
    window.__m1.skin?.reset?.();
  });
  await quiesce();
  const Rold = await shootHeld('mortar1reset-Rold-PREFIX-reset');
  const sRold = await state();
  note(`Rold (pre-fix reset): ${JSON.stringify(sRold)}`);

  // ================================================================== Rnew — the shipped reset
  await dig();
  await page.evaluate(() => {
    const p = window.__m1.p;
    p.resetDamage();
    window.__m1.skin?.reset?.();
  });
  await quiesce();
  const Rnew = await shootHeld('mortar1reset-Rnew-SHIPPED-resetDamage');
  const sRnew = await state();
  note(`Rnew (shipped resetDamage): ${JSON.stringify(sRnew)}`);

  // ---- the numbers -------------------------------------------------------
  const R = (img) => crop(img, rect.x0, rect.y0, rw, rh);
  const dAD = diff(R(A), R(D));
  const dAold = diff(R(A), R(Rold));
  const dAnew = diff(R(A), R(Rnew));
  const F = Math.max(60, floor.pxOver16, longFloor.pxOver16);
  note('');
  note(`A vs D    — the dig itself:                 ${summarise(dAD)}`);
  note(`A vs Rold — THE DEFECT, reproduced:         ${summarise(dAold)}`);
  note(`A vs Rnew — THE FIX, shipped resetDamage:   ${summarise(dAnew)}`);
  note(`floors: same-config ${floor.pxOver16} · long ${longFloor.pxOver16} px>16`
    + ` (comparison floor ${F})`);

  dAD.pxOver16 > F * 3
    ? pass('C1 CONTROL — the dig is visible; D is not a copy of A',
      `${dAD.pxOver16} px>16 against a ${F} floor, ${sD.open} cells open, maxDepth ${sD.maxDepth}`)
    : fail('C1 CONTROL — the dig is visible; D is not a copy of A',
      `${dAD.pxOver16} px>16 — the dig did not happen`);

  /**
   * 🚨 **C2 ASSERTS THE STATE, NOT THE PIXELS, AND THAT IS THE FINDING — the state half is live
   * on EVERY arm and the pixel half is not.** The first build of this file asserted the pixels
   * and went red on `?coat=1` for a real reason: the pre-fix reset leaves BYTE-IDENTICAL state on
   * both arms (`stage 4 · pristine false · instanced false · breaks [0.95,0.95,0.94,0.90]`) while
   * the frame moves **44 222 px>16 on `?coat=0` and 128 on `?coat=1`**. Losing the shared
   * instance swaps the SURFACE on arm 0 (damask → `estateSkinMat()`); on arm 1 `coat-1` +
   * `pristine-1` made the two the same material, so `pristine-1` MASKS this defect on its own
   * arms without fixing it. C2b keeps the pixel claim, keyed to the arm it is true on.
   */
  (sRold.stage !== 0 && sRold.pristine === false && sRold.instanced === false)
    ? pass('C2 CONTROL — the PRE-FIX reset leaves the panel non-pristine and de-instanced',
      `field emptied (hits ${sRold.hits}, maxDepth ${sRold.maxDepth}) but stage ${sRold.stage},`
      + ` pristine ${sRold.pristine}, instanced ${sRold.instanced}, breaks`
      + ` ${JSON.stringify(sRold.breaks)} — the defect, reproduced`)
    : fail('C2 CONTROL — the PRE-FIX reset leaves the panel non-pristine and de-instanced',
      `${JSON.stringify(sRold)} — the defect did not reproduce, so the fix below proves nothing`);

  const ARM = Number(head.coat) | 0;
  if (ARM === 0) {
    dAold.pxOver16 > F * 3
      ? pass('C2b — and on the SHIPPED arm 0 it is visible: the face rect is a different surface',
        `A vs Rold ${dAold.pxOver16} px>16 against a ${F} floor`)
      : fail('C2b — and on the SHIPPED arm 0 it is visible: the face rect is a different surface',
        `${dAold.pxOver16} px>16 — the pixel half did not reproduce on the arm it is true on`);
  } else {
    note(`C2b — on ?coat=${ARM} the pre-fix reset moves only ${dAold.pxOver16} px>16 (arm 0 reads`
      + ' 44 222). `pristine-1`\'s coat makes the fallback material the same one, so the DEFECT IS'
      + ' MASKED, not fixed — the state above is identical on both arms.');
  }

  dAnew.pxOver16 <= F * 3
    ? pass('THE FIX — `resetDamage()` restores the panel\'s own look',
      `A vs Rnew ${dAnew.pxOver16} px>16 inside the ${F} floor's band, against ${dAold.pxOver16}`
      + ` for the pre-fix reset — a ${(dAold.pxOver16 / Math.max(1, dAnew.pxOver16)).toFixed(0)}x`
      + ' reduction')
    : fail('THE FIX — `resetDamage()` restores the panel\'s own look',
      `A vs Rnew ${dAnew.pxOver16} px>16 against a ${F} floor — look at the frames`);

  (sRnew.stage === 0 && sRnew.pristine === true && sRnew.hits === 0 && sRnew.maxDepth === 0)
    ? pass('and the STATE agrees with the picture — stage 0, pristine, field empty',
      `stage ${sRold.stage}→${sRnew.stage} · pristine ${sRold.pristine}→${sRnew.pristine}`
      + ` · instanced ${sRold.instanced}→${sRnew.instanced} · breaks`
      + ` ${JSON.stringify(sRold.breaks)}→${JSON.stringify(sRnew.breaks)}`)
    : fail('and the STATE agrees with the picture — stage 0, pristine, field empty',
      JSON.stringify(sRnew));

  (sRnew.stage === sA.stage && sRnew.pristine === sA.pristine
    && sRnew.instanced === sA.instanced && sRnew.barrier === sA.barrier)
    ? pass('C3 — every state field the panel started with is back',
      `stage/pristine/instanced/barrier all equal to the intact frame's`)
    : fail('C3 — every state field the panel started with is back',
      `intact ${JSON.stringify(sA)} vs reset ${JSON.stringify(sRnew)}`);
  void skip;
}
