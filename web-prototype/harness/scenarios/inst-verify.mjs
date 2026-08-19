/**
 * DOES THE INSTANCED HOUSE LOOK LIKE THE LEGACY HOUSE, AND WHAT DOES PROMOTION COST?
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/inst-verify.mjs \
 *        --port 5230 --shots --q "seed=s4"
 *
 * Three questions, one page:
 *
 * 1 · **THE LOOK.** `?walls=instanced` claims to be pixel-identical to `?walls=legacy` by
 *     construction — same geometry, same material, same transform, and three layer planes that
 *     were provably behind an opaque occluder. That claim has to be broken, not asserted.
 *     ⚠️ IT CANNOT BE TESTED ACROSS TWO PAGE LOADS. HANDOFF: *"two separate browser runs diverge
 *     in held-item glow and pose even with position and yaw pinned"*, and `game.play` carries a
 *     per-frame grain that makes two ADJACENT SAME-MODE frames differ as much as any A/B. So the
 *     simulation is FROZEN (`engine.freezeAt = engine.elapsed`, which `_step` honours in the LIVE
 *     loop as well as the capture one — updaters stop, `uTime` stops, the breathing lights stop,
 *     the grain stops) and `room.setWallMode()` flips the draw set inside that one frozen frame.
 *     A SAME-MODE control pair is taken first and every number is reported against it.
 *
 * 2 · **PROMOTION.** Promotion is meant to be five `visible` flags and one instance matrix, not
 *     an allocation — HANDOFF measured 33 ms with `dtex 1` for a space that becomes resident for
 *     the first time, and a wall that stalled on the frame it is first hit would be the worst
 *     possible place to pay it. Measured as the frame time and the renderer's texture / geometry
 *     / program counters ACROSS the promotion frame, against the frames either side of it.
 *
 * 3 · **SEED INDEPENDENCE.** `exterior.js`'s dressing note is the standard: *"a per-panel version
 *     would have blown 625 on some seeds and not others, which no single capture would ever
 *     find."* The instanced mesh count must be a function of the authored table alone. Asserted
 *     over many seeds by rebuilding the run plan in the page, not by re-launching the browser.
 */

const STATIONS = (process.env.STATIONS ?? 'service.mid,ballroom.centre,gallery.east,study_w.south')
  .split(',').filter(Boolean);

export default async function verify({ page, note, pass, fail, skip, shot }) {
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 200; i++) {
      await page.waitForTimeout(35);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  const head = await page.evaluate(() => {
    const e = window.__rrr.engine;
    return { mode: e.room.wallMode, panels: e.room.panels.length, seed: String(e.run.seed),
      live: e.run.exitId, lock: e.run.lock.id, census: e.room.panelCensus() };
  });
  note(`mode "${head.mode}" · seed "${head.seed}" · ${head.panels} panels · live ${head.live} (${head.lock})`);
  if (head.mode !== 'instanced') { fail('the build is the instanced arm', `mode is ${head.mode}`); return; }
  note(`instanced groups: ${head.census.instanced.groups} — ${head.census.instanced.keys.join(' | ')}`);

  // ------------------------------------------------------------------ 1 · the look
  const pin = async () => page.evaluate(() => {
    const e = window.__rrr.engine;
    e.opts.dynamicRes = false;               // HANDOFF trap: dynres resamples the whole image
    e.pipeline.renderScale = 1.0;
    e.pipeline.setSize(e.pipeline.canvasWidth, e.pipeline.canvasHeight);
    e.freezeAt = e.elapsed;                  // updaters stop; uTime, grain and lights freeze
  });

  const setMode = (m) => page.evaluate((mm) => window.__rrr.engine.room.setWallMode(mm), m);
  const shots = [];
  for (const name of STATIONS) {
    const ok = await page.evaluate((n) => {
      const e = window.__rrr.engine;
      const a = e.room.anchor(n);
      if (!a) return false;
      e.freezeAt = null;                     // let the world move while we walk to the station
      e.player.pos.set(a.x, e.room.floorY, a.z);
      e.player.vel.set(0, 0, 0);
      e.cam._first = true;
      return true;
    }, name);
    if (!ok) { note(`no anchor named ${name}`); continue; }
    await step(40);
    await pin();
    await step(4);
    const a1 = await shot(`inst.${name}.A-instanced-1`);
    await step(2);
    const a2 = await shot(`inst.${name}.A-instanced-2`);   // the SAME-MODE control
    await setMode('legacy');
    await step(4);
    const b1 = await shot(`inst.${name}.B-legacy`);
    await setMode('occlude');
    await step(4);
    const c1 = await shot(`inst.${name}.C-occlude`);
    const back = await setMode('instanced');
    await step(2);
    const state = await page.evaluate(() => window.__rrr.engine.room.panelCensus());
    shots.push({ name, a1, a2, b1, c1 });
    note(`${name.padEnd(16)} shot 4 frames (control pair + legacy + occlude); back to "${back}"`
      + ` · panels on screen ${state.visiblePanels}, own meshes ${state.ownMeshes},`
      + ` instanced live ${state.instanced.live}`);
  }
  shots.length
    ? pass('a frozen same-page A/B was captured', `${shots.length} stations x 4 frames`)
    : fail('a frozen same-page A/B was captured', 'no station could be parked');

  // ------------------------------------------------------------------ 2 · the promotion frame
  //
  // Park where a pristine panel is on screen, unfreeze, then damage it by ONE point — enough to
  // stop it being pristine and NOT enough to cross a stage, so the only thing measured is the
  // promotion itself and not a stage transition's debris, dust and audio.
  const promo = await page.evaluate(async () => {
    const e = window.__rrr.engine;
    const room = e.room;
    e.freezeAt = null;
    const a = room.anchor('service.mid');
    e.player.pos.set(a.x, room.floorY, a.z);
    e.player.vel.set(0, 0, 0);
    e.cam._first = true;
    const wait = (n) => new Promise((res) => {
      const f0 = e.frame;
      const t = () => (e.frame - f0 >= n ? res() : requestAnimationFrame(t));
      requestAnimationFrame(t);
    });
    await wait(45);
    const target = room.panels.find((p) => p.wantVisible && p.pristine && p.state.isDamageable());
    if (!target) return { skip: 'no pristine damageable panel is on screen at service.mid' };

    const snap = () => ({
      frame: e.frame,
      tex: e.renderer.info.memory.textures,
      geo: e.renderer.info.memory.geometries,
      prog: e.renderer.info.programs?.length ?? 0,
    });
    // Per-frame wall clock, sampled by hand: `Engine.perf()` averages a 120-frame ring and a
    // one-frame stall is invisible in a mean — HANDOFF's "a max that remembers two seconds".
    const times = [];
    let mark = -1;
    const before = snap();
    await new Promise((res) => {
      let last = performance.now();
      let n = 0;
      const t = () => {
        const now = performance.now();
        times.push(now - last); last = now;
        n++;
        if (n === 12) { mark = times.length; target.damage(1, null); }
        if (n >= 26) res(); else requestAnimationFrame(t);
      };
      requestAnimationFrame(t);
    });
    const after = snap();
    const pre = times.slice(2, mark);
    const post = times.slice(mark + 1);
    const med = (v) => { const s = [...v].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    return {
      id: target.id,
      promotionFrameMs: times[mark],
      preMedianMs: med(pre), preMaxMs: Math.max(...pre),
      postMedianMs: med(post), postMaxMs: Math.max(...post),
      dtex: after.tex - before.tex, dgeo: after.geo - before.geo, dprog: after.prog - before.prog,
      pristineAfter: target.pristine, instancedAfter: target.instanced,
      ownVisible: target.layers.filter((l) => l.visible).length + (target.reveal.visible ? 1 : 0),
    };
  });

  if (promo.skip) { skip('promotion costs nothing on the frame it happens', promo.skip); }
  else {
    note(`promoted ${promo.id} with 1 damage (no stage crossed):`
      + ` frame ${promo.promotionFrameMs.toFixed(2)} ms`
      + ` vs pre median ${promo.preMedianMs.toFixed(2)} / max ${promo.preMaxMs.toFixed(2)}`
      + ` and post median ${promo.postMedianMs.toFixed(2)} / max ${promo.postMaxMs.toFixed(2)}`);
    note(`counters across the promotion: dtex ${promo.dtex} · dgeo ${promo.dgeo} · dprog ${promo.dprog}`
      + ` · now pristine=${promo.pristineAfter} instanced=${promo.instancedAfter}`
      + ` own meshes drawing ${promo.ownVisible}`);
    const clean = promo.dtex === 0 && promo.dgeo === 0 && promo.dprog === 0
      && !promo.pristineAfter && !promo.instancedAfter && promo.ownVisible > 0;
    const quick = promo.promotionFrameMs <= Math.max(promo.preMaxMs, promo.postMaxMs) + 2;
    clean && quick
      ? pass('promotion costs nothing on the frame it happens',
        `${promo.promotionFrameMs.toFixed(2)} ms inside the surrounding max, and dtex/dgeo/dprog all 0`)
      : fail('promotion costs nothing on the frame it happens',
        `${promo.promotionFrameMs.toFixed(2)} ms, dtex ${promo.dtex} dgeo ${promo.dgeo} dprog ${promo.dprog},`
        + ` pristine ${promo.pristineAfter} instanced ${promo.instancedAfter} own ${promo.ownVisible}`);
  }

  // ------------------------------------------------------------------ 3 · seed independence
  //
  // ⚠️ RUN LAST — it re-plans the house 128 times and leaves the round reset.
  //
  // The instanced geometry is keyed on the AUTHORED aperture, and the seed picks the live site
  // and its lock, neither of which is an aperture. The thing that CAN move with the seed is how
  // many panels start out non-pristine, because a `plaster` or `beams` lock starts its site
  // above stage 0 — those panels keep their own five meshes and are the only seed-dependent
  // draw calls in the system. Both are measured over real re-plans rather than argued.
  const seedRes = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const room = e.room;
    const was = String(e.run.seed);
    const sig = () => {
      const c = room.panelInstances.census();
      return `${c.groups} groups | ${c.slots} slots | ${c.keys.join(',')}`;
    };
    const seen = new Map();
    const outcomes = new Set();
    const promoted = new Map();
    for (let i = 0; i < 128; i++) {
      e.run.reset(`si-${i}`);
      e.resetRound();
      outcomes.add(`${e.run.exitId}|${e.run.lock?.id}`);
      const s = sig();
      seen.set(s, (seen.get(s) ?? 0) + 1);
      const n = room.panels.filter((p) => !p.pristine).length;
      promoted.set(n, (promoted.get(n) ?? 0) + 1);
    }
    e.run.reset(was);
    e.resetRound();
    return {
      signatures: [...seen.keys()], outcomes: outcomes.size,
      promoted: [...promoted.entries()].sort((a, b) => a[0] - b[0]),
      final: sig(),
    };
  });
  note(`128 re-plans produced ${seedRes.outcomes} distinct (site, lock) outcomes`);
  note(`non-pristine panels at round start, by seed: `
    + seedRes.promoted.map(([n, c]) => `${n} panels x${c} seeds`).join(' · '));
  const worstPromoted = seedRes.promoted[seedRes.promoted.length - 1][0];
  seedRes.signatures.length === 1
    ? pass('the instanced geometry does not depend on the run seed',
      `128 seeds, ${seedRes.outcomes} outcomes -> ONE signature: ${seedRes.signatures[0]};`
      + ` worst seed leaves ${worstPromoted} panel(s) non-pristine, i.e. <= ${worstPromoted * 5} seed-dependent calls`)
    : fail('the instanced geometry does not depend on the run seed',
      `${seedRes.signatures.length} distinct signatures: ${seedRes.signatures.join(' / ')}`);
}
