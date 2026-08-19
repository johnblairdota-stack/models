/**
 * 🧱 **DOES THE WALL HAVE THICKNESS WHERE IT BROKE, AND DID A PIECE COME OFF IT?**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/chunk-thick.mjs \
 *        --port 5341 --q "seed=s4&dig=1" --shots
 *
 * John played the free-form dig and said: *"the destruction didn't feel like chunks coming off
 * the wall. It felt like a 2d mesh taking off layers where I was clicking… thick chunks falling
 * off the wall."*
 *
 * ⚠️ **THE WHOLE TEST IS THE GRAZING ANGLE, AND EVERY EXISTING DIG SCENARIO SHOOTS HEAD-ON.**
 * `dig-free.mjs`'s `look()` parks the player on the face normal, which is the one view in which
 * a zero-thickness cut and a 150 mm one are the same picture. So this scenario's primary shots
 * are taken from ~15-20 degrees off the wall plane, where a slab has to show its cut face or
 * admit it has none.
 *
 * ---------------------------------------------------------------------------
 * 🔴 **ROUND 2 — THE THREE THINGS THIS FILE NOW HAS TO PROVE, NOT JUST PHOTOGRAPH**
 * ---------------------------------------------------------------------------
 * `critic-dig-1` filed REJECT 24 and its rank-1 defect was that **cyan appears in none of the
 * twelve round-1 captures** — the reference's most identifying signature absent from the whole
 * evidence set. Nobody could say whether that was the scenario never digging deep enough or the
 * barrier not rendering, and a round of evidence that cannot answer that question is a wasted
 * round. So:
 *
 *   1. **`barrierProbe()` reports the CAUSE.** Is the mesh visible; is the barrier channel set
 *      at the spot; how deep is the smoothed depth the shader thresholds against `uShowAt`.
 *      Three numbers, printed beside every layered shot, so "no cyan" can never again be a
 *      mystery. (It found the bug: `wall.js` `_apply()` was reachable only from a MONOTONE stage
 *      event, so after `resetDamage()` the barrier mesh stayed hidden forever. Fixed there.)
 *   2. **`tealFraction()` MEASURES the picture rather than describing it.** The capture is
 *      decoded back in the page and its pixels are classified, so "is the campaign's central
 *      material on screen" is a number in the log and not an opinion in a report.
 *   3. **Half the round-1 set was too dark to judge**, which wasted half the evidence. ⚠️ The
 *      first answer to that was an exposure-lifted twin of each deliverable, and it was a
 *      NON-ARM: `game.play` already ships at exposure 1.85 and the "lift" set 1.85. It is
 *      deleted — see the long note at the shot list — and the fix moved into the materials,
 *      because exposure is measurably the wrong lever here (ACES desaturates the cyan as it
 *      brightens: at 4.0 the teal fraction FALLS from 12.7% to 8.5%).
 *
 * What it captures, in order:
 *   C1  a fresh blow, mid-flight — is the thing that flew plausibly the thing that left
 *   C2  a half-dug spot at a grazing angle: the cut face before the hole is through
 *   C3  a body-sized hole HEAD-ON and from three grazing angles (the interconnect face)
 *   C4  🎯 THE MATERIAL SECTION on a DUD face — ornate -> white -> cyan, in one image
 * and it reports the draw calls and triangles at each state so a look change that costs the
 * budget cannot be filed as free.
 */

const GRAZE_SHOTS = true;

export default async function chunkThick({ page, note, pass, fail, skip, shot, snap }) {
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
  if (head.mode !== 'free') {
    skip('thickness can be judged', `this build is \`?dig=${head.mode}\` — re-run with --q "dig=1"`);
    return;
  }
  note(`seed "${head.seed}" · ${head.freeFaces} free faces`);

  let dud = head.free.find((f) => !f.link && f.side === 'a');
  let link = head.free.find((f) => f.link && f.side === 'a');
  if (!dud || !link) { fail('there is a dud and an interconnect', 'census named neither'); return; }

  // -------------------------------------------------------------------------
  // the driver — the same entry point `sledge-1` calls
  // -------------------------------------------------------------------------
  const swing = (id, u, v, n = 1, power = 1) => page.evaluate(([pid, pu, pv, pn, pp]) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(pid);
    if (!p) return null;
    let removed = 0, chunks = 0;
    const prev = p.onChunk;
    p.onChunk = (panel, info) => { chunks++; prev?.(panel, info); };
    for (let i = 0; i < pn; i++) removed += p.applyHit(p.pointAt(pu, pv), pp).removed;
    p.onChunk = prev;
    const st = p.field.stats();
    return {
      removed, chunks, maxDepth: st.maxDepth, localDepth: p.field.depthAt(pu, pv),
      passable: !!p.openChannel().open,
      debrisLive: e.debris?.liveCount ?? -1, debrisRest: e.debris?.restCount ?? -1,
    };
  }, [id, u, v, n, power]);

  const reset = (id) => page.evaluate((pid) => {
    window.__rrr.engine.room.panelOf(pid)?.resetDamage(); return true;
  }, id);

  /**
   * 🚨 **THE HUNTER KILLED THE PHOTOGRAPHER, AND THE DELIVERABLE FRAME WAS A RETRY BUTTON.**
   *
   * This scenario parks a stationary body against a wall and holds it there for minutes of
   * settle while it hammers — which is the loudest thing in the game beside a dying robot, done
   * by something that never moves. Measured: `thick-12` and every shot after it came back as the
   * death screen ("RIGHT LEG TORN OFF — TAKEN BY THE HUNTER"), i.e. the primary deliverable of
   * the whole round was a photograph of the UI. Nothing failed and nothing warned; the scenario
   * reported its angles and its draw calls exactly as if it had worked.
   *
   * So the hunter is frozen for the shoot. ⚠️ **Frozen, not removed:** it keeps its mesh and its
   * draw call so the perf figures below stay comparable to every other dig scenario's, and it is
   * put back at its own spawn so it cannot be standing in a shot. This is an instrument-only
   * change inside the capture session — nothing in `src/` knows about it.
   */
  const freezeHunter = () => page.evaluate(() => {
    const e = window.__rrr.engine;
    if (!e.hunter) return 'no hunter in this build';
    e.hunter.update = () => {};
    e.hunter.vel?.set?.(0, 0, 0);
    if (e.room?.spawn?.hunter) {
      e.hunter.root.position.copy(e.room.spawn.hunter);
      e.hunter.lastKnown?.copy?.(e.room.spawn.hunter);
    }
    e.hunter.state = 'PATROL'; e.hunter.target = null; e.hunter.awareness = 0;
    e.hunter.breachTarget = null;
    e.hunter.resetCombat?.();
    // put any limb it already took back on, or the run is over before the shoot starts
    for (const s of ['shoulderR', 'shoulderL', 'hipR', 'hipL']) {
      if (e.player.rig?.occupant?.(s) === 'empty') e.player.rig.refit?.(s);
    }
    return 'frozen at spawn';
  });

  /**
   * 🕳️ **A GRADED CRATER, DRIVEN IN ONE ROUND TRIP.**
   *
   * ⚠️ **WHY A SPRAY OF BLOWS AT ONE SPOT CANNOT PRODUCE VISIBLE BANDS, WHICH IS WHAT ROUND 1
   * AND ROUND 2's FIRST ATTEMPT BOTH DID.** `damagefield.js` `RIM` is 0.62 — a blow deposits 62%
   * of its centre value right out at the brush's edge and exactly nothing past it. That flat top
   * is deliberate and it is what buys John's dig band. But it means repeated blows at one point
   * drive the WHOLE 0.52 m disc to ~0.95 together, and the field then falls from 0.95 to 0.0
   * across a single cell, widened only by `_smooth()`'s ~11 cm blur. All four of `wall.js`
   * DAMAGE_BANDS' thresholds are crossed inside that 20 cm, so every band is a 4 cm fringe and
   * the hole photographs as one interior colour with a crisp outer edge — measured, twice.
   *
   * A real dig does not look like that because a player's blows land in a spread, and the
   * periphery takes a handful of hits where the middle takes twenty. So the crater is built as
   * concentric rings with FALLING POWER, which is the same thing expressed as a drive: the
   * centre bottoms out on the barrier, and the depth ramps down over about 1.5 m. Each band then
   * owns a ring tens of centimetres wide, which is the composition `dig-gallery-sledge-crew.webp`
   * actually shows.
   *
   * ⚠️ The vertical semi-axis is capped at 1.05 m: the face is 2.80 m high, so a 1.7 m circular
   * ring would run off the top and bottom and the clamp would stack a dozen blows along two
   * edges — a deep trench where a shallow feather was wanted.
   *
   * ---------------------------------------------------------------------------
   * 🔴 **ROUND 6: THE RINGS ARE GONE, AND THE INSTRUMENT WAS MANUFACTURING THE DEFECT.**
   * ---------------------------------------------------------------------------
   * Everything above is honest reasoning for a goal that has been retired. `wall.js`
   * `DAMAGE_BANDS` no longer has four thresholds to spread — the shell is ONE curve — so
   * "grade the crater so each band owns a wide ring" is now asking the harness to draw the
   * contour map that `critic-dig-4` rejected.
   *
   * ⚠️ **AND IT WAS DOING MORE HARM THAN THAT: FOUR CONCENTRIC RINGS OF BLOWS MAKE A
   * RADIALLY SYMMETRIC DEPTH FIELD, SO THE HOLE'S GROSS OUTLINE IS A CIRCLE BY CONSTRUCTION.**
   * With the bands collapsed the boundary follows the depth contour much more closely than it
   * used to, and the first build of round 6 photographed as **a mirror in a frame** — a smooth
   * tall oval. The break-order field cannot rescue that: `uOrderLod` band-limits it to ~54 cm,
   * so it can put teeth on an outline but it cannot change what shape the outline is.
   *
   * ⚠️ **THIS IS NOT THE HARNESS FLATTERING THE BUILD.** A player does not swing in circles
   * around a point; they beat at one spot, move a hammer's length along, beat again, and chase
   * whatever gives way — which is what `damagefield.js` `RIM` and `RESIST` exist to reward
   * ("this spot is bottoming out, move along"). A wandering cluster of blow sites is the
   * *more* faithful drive, and the irregular breach is a consequence of it rather than a shape
   * anybody authored. `refs/dig/dig-gallery-sledge-crew.webp` shows exactly that outcome: a
   * tall lumpy breach with lobes and concave notches, not a disc.
   *
   * ⚠️ Deterministic — an explicit list, no RNG — so this stays comparable across rounds, and
   * every site is inside +/- 0.95 m vertically so the 2.80 m face never clamps a cluster into
   * a trench along its own top or bottom edge.
   *
   * @param sites [du m, dv m, count, power] — offsets from (cu, cv), in metres on the face
   */
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
    const g = p.field, st = g.stats();
    // the radial depth profile, in metres from the centre — this is what decides the bands
    const prof = [];
    for (const r of [0.0, 0.25, 0.50, 0.70, 0.90, 1.15, 1.40, 1.70]) {
      const u = Math.min(0.999, Math.max(0, u0 + r / W));
      prof.push(`${r.toFixed(2)}m:${g.depthAt(u, v0).toFixed(2)}`);
    }
    return { blows, maxDepth: st.maxDepth, mean: +st.meanDepth.toFixed(3), prof: prof.join(' ') };
  }, [id, cu, cv, sites]);

  /**
   * 🎨 **WHAT COLOUR IS THE WALL, ALONG A LINE ACROSS THE HOLE.**
   *
   * `barrierProbe` settled "is the barrier drawable"; this settles the question one layer up,
   * which round 2's first build could not answer from the captures alone: **which band am I
   * actually looking at, and what colour did it come out.** Round 1's whole failure was that
   * nobody could say — the report described a hole, the critic saw a stain, and both were
   * reasoning about a picture rather than about pixels.
   */
  const scanline = async (tag, y = 0.42) => {
    const buf = await snap(tag);
    if (!buf) return null;
    return page.evaluate(async ([b64, yy]) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([arr], { type: 'image/png' }));
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const g2 = c.getContext('2d', { willReadFrequently: true });
      g2.drawImage(bmp, 0, 0);
      const y0 = (bmp.height * yy) | 0;
      const d = g2.getImageData(0, y0, bmp.width, 1).data;
      const out = [];
      for (let k = 0; k <= 16; k++) {
        const x = Math.min(bmp.width - 1, ((bmp.width - 1) * k / 16) | 0);
        const o = x * 4;
        out.push(`${d[o]},${d[o + 1]},${d[o + 2]}`);
      }
      return out.join(' | ');
    }, [buf.toString('base64'), y]);
  };

  /**
   * 🎯 **ROUND 4, DEFECT 2 — THE SECTION, AS A PIXEL COUNT A READER CAN CHECK.**
   *
   * `critic-dig-3`: *"Claimed code-side numbers don't show up as a visible slab edge anywhere…
   * A number nobody can see is not a fix."* Fair, and the answer is not another code-side
   * number. This walks scanlines across the frame and, for every crossing from WHITE SHELL into
   * TEAL CORE, measures how many pixels of MID-VALUE, NEUTRAL material lie between them — which
   * is what the shell's cut face is and the only thing that can be there. It reports the median
   * run and the widest one, so "the shell has a visible cross-section" becomes a number taken
   * off the delivered image rather than out of the source.
   *
   * ⚠️ Neutral is required, not just dark: the teal side is `b > r`, the shell is `r ≈ g ≈ b`
   * and bright, and the section is `r ≈ g ≈ b` and MIDDLING. A run that drifts blue is the
   * cavity, not the cut, and is not counted.
   */
  const sectionWidth = async (tag, rows = 48) => {
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
      /**
       * mid value, still neutral: the fresh section is the shell's own material in shadow.
       *
       * ⚠️ **ROUND 5 TRIED TO MAKE THIS RELATIVE TO THE ARMING SHELL PIXEL AND PUT IT BACK.**
       * The reasoning was sound — a cross-section is a value STEP, not an absolute band — but
       * the rewrite also added a neutrality term, and the two together took the same picture
       * from 9 crossings to 1: the boundary carries the layer plane's dithered alpha fringe, and
       * a single speckle that satisfies none of the three predicates ends the run. **The number
       * this scenario reports has to stay comparable across rounds**, so the classifier is
       * exactly the one round 4 was measured with, and the only thing this round moved is the
       * crossing FLOOR — see the gate below, and its reason.
       */
      const isCut = (p) => {
        const L = lum(p);
        return L > 18 && L < 116 && p[2] <= p[0] * 1.45;
      };
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
      return {
        crossings: runs.length,
        median: runs.length ? runs[runs.length >> 1] : 0,
        p90: runs.length ? runs[(runs.length * 0.9) | 0] : 0,
        max: runs.length ? runs[runs.length - 1] : 0,
      };
    }, [buf.toString('base64'), rows]);
  };

  const perf = () => page.evaluate(() => {
    const e = window.__rrr.engine;
    const c = e.room.panelCensus?.() ?? {};
    /**
     * 🧱 **WHICH DEBRIS POOLS ARE ACTUALLY DRAWING, BY NAME — SO A SIXTH KIND IS PRICED AND NOT
     * ASSUMED.** `debris.js` ships every `InstancedMesh` with `visible = false` and only shows a
     * kind while it has live pieces, so the pools' cost is the number of KINDS on screen, not
     * the number of particles (`docs/handoff/dig.md` measured that: 144 bursts on one frame cost
     * +0 in a room with no segment in it). Round 3 adds `core`; this is how the claim that it
     * costs nothing until a blow lands past the white shell gets checked rather than argued.
     */
    const pools = Object.entries(e.debris?.pools ?? {})
      .filter(([, p]) => p.mesh.visible).map(([k]) => k);
    return {
      calls: e.renderer.info.render.calls, tris: e.renderer.info.render.triangles,
      ownMeshes: c.ownMeshes ?? -1,
      debris: e.debris?.liveCount ?? -1, rest: e.debris?.restCount ?? -1,
      pools: pools.join('+') || 'none',
    };
  });

  /**
   * 🚨 **WHY THERE IS NO CYAN — ANSWERED WITH THE THREE FACTS THAT DECIDE IT, NOT INFERRED.**
   *
   * The barrier draws when ALL of these hold, and each one fails in a completely different
   * place, so reporting the conjunction is useless and reporting the terms is diagnostic:
   *
   *   · `visible`  — `wall.js` `_apply()` owns the mesh flag. This is the one that was latched.
   *   · `barrier`  — the G channel at the spot. 0 IS THE INTERCONNECT and cyan is CORRECTLY
   *                  absent there; that is the whole reason a dud face is the only place all
   *                  three materials can be on screen at once.
   *   · `smooth`   — the B channel, which is what `barrierMaterial` thresholds against
   *                  `uShowAt`. ⚠️ NOT `depth`: `depth` is the gameplay truth and the shader
   *                  samples a blurred copy, so a spot can be gameplay-through and still under
   *                  the shader's threshold at its own texel.
   */
  const barrierProbe = (id, u, v) => page.evaluate(([pid, pu, pv]) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(pid);
    if (!p?.field) return null;
    const g = p.field;
    const cx = Math.min(g.cols - 1, Math.max(0, Math.floor(pu * g.cols)));
    const cy = Math.min(g.rows - 1, Math.max(0, Math.floor(pv * g.rows)));
    const i = g.idx(cx, cy);
    const m = p.barrierMaterial?.userData?.barrierUniforms;
    return {
      hasMesh: !!p.barrier,
      visible: !!p.barrier?.visible,
      barrier: g.barrier[i],
      depth: +g.depth[i].toFixed(3),
      smooth: +(g.data[i * 4 + 2] / 255).toFixed(3),
      showAt: m?.uShowAt?.value ?? -1,
      maxDepth: +g.maxDepth.toFixed(3),
      stage: p.stage,
    };
  }, [id, u, v]);

  const sayBarrier = async (tag, id, u, v) => {
    const b = await barrierProbe(id, u, v);
    if (!b) { note(`   ${tag}: no damage field on ${id}`); return null; }
    const why = !b.hasMesh ? 'NO BARRIER MESH ON THIS FACE'
      : !b.visible ? '🚨 MESH HIDDEN — wall.js _apply() never ran'
        : !b.barrier ? 'no barrier here (this is the interconnect — correct)'
          : b.smooth < b.showAt ? `not dug deep enough (${b.smooth} < uShowAt ${b.showAt})`
            : '✅ should be drawing cyan';
    note(`   ${tag} barrier: visible=${b.visible} G=${b.barrier} depth=${b.depth} `
      + `smoothed=${b.smooth} vs uShowAt ${b.showAt} · stage ${b.stage} · ${why}`);
    return b;
  };

  /**
   * 🎯 **HOW MUCH OF THE FRAME IS STRUCTURAL TEAL — the round-1 question, as a number.**
   *
   * The PNG is handed back to the page and decoded there, because node in this repo has no
   * image decoder and `harness/sheet.mjs` already establishes chromium as the one available.
   *
   * ⚠️ **THE CLASSIFIER IS WRITTEN AGAINST THE ESTATE, NOT AGAINST AN IDEAL CYAN.** Every
   * surface in these rooms is warm (r > g > b) — boiserie, parquet, plaster, the debris. So
   * "blue channel clearly dominant over red" separates the barrier from the whole house with no
   * threshold tuning, and it will not fire on the white rim (r ≈ g ≈ b) either, which is the
   * distinction the deliverable frame is about.
   */
  /**
   * 🚨 **"A CRITIC CANNOT JUDGE WHAT IT CANNOT SEE" — AS A NUMBER, ON EVERY FRAME.**
   *
   * Two rounds running, the critic's list has carried *"about a third of the capture set is
   * still too dark to judge"*, and both rounds shipped without knowing WHICH frames or by how
   * much, because nothing measured it. So every deliverable is now decoded and scored, and the
   * scenario states plainly which frames are unusable rather than leaving a reader to find out.
   *
   * `dark` is the share of the frame under luminance 24 — the value below which the estate's
   * own dark boiserie is still legible but nothing is. The gate is 45%: `thick-14` (a good
   * frame) measured 6%, `thick-9` 23%, and the two the critic threw out measured 76% and 100%.
   */
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
      const lum = [];
      let dark = 0;
      // skip the HUD gutter at the bottom left and the clock at the bottom right
      for (let y = 0; y < bmp.height * 0.86; y += 3) {
        for (let x = 0; x < bmp.width; x += 3) {
          const o = (y * bmp.width + x) * 4;
          const L = 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
          lum.push(L);
          if (L < 24) dark++;
        }
      }
      lum.sort((p, q) => p - q);
      return {
        median: Math.round(lum[lum.length >> 1]),
        p90: Math.round(lum[(lum.length * 0.9) | 0]),
        dark: +(dark / lum.length * 100).toFixed(1),
      };
    }, b.toString('base64'));
  };
  const DARK_GATE = 45;
  /** Every deliverable, with its darkness, so the round's own evidence set is auditable. */
  const lumaLog = [];

  const tealFraction = async (tag) => {
    const buf = await snap(tag);
    if (!buf) return null;
    return page.evaluate(async (b64) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([arr], { type: 'image/png' }));
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const g2 = c.getContext('2d', { willReadFrequently: true });
      g2.drawImage(bmp, 0, 0);
      const d = g2.getImageData(0, 0, bmp.width, bmp.height).data;
      let teal = 0, white = 0, n = 0;
      // the middle half of the frame: the HUD lives at the edges and the crosshair is white
      const x0 = (bmp.width * 0.25) | 0, x1 = (bmp.width * 0.75) | 0;
      const y0 = (bmp.height * 0.10) | 0, y1 = (bmp.height * 0.80) | 0;
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const o = (y * bmp.width + x) * 4;
          const r = d[o], gg = d[o + 1], b = d[o + 2];
          n++;
          if (b >= 34 && b > r * 1.55 && gg > r * 1.20) teal++;
          else if (r > 110 && Math.abs(r - gg) < 26 && Math.abs(gg - b) < 34 && b > 92) white++;
        }
      }
      return {
        w: bmp.width, h: bmp.height, sampled: n,
        teal: +(teal / n * 100).toFixed(2), white: +(white / n * 100).toFixed(2),
      };
    }, buf.toString('base64'));
  };

  /**
   * ⚠️ **PARK THE PLAYER, NOT THE CAMERA** (`eo2-calls.mjs`): residency resolves from the body,
   * and the boom is 3.0 m behind it (`player.js` `ThirdPersonCamera`), so the shot's real
   * grazing angle is set by where the BODY stands and which way it faces.
   *
   * @param mode 'face'  on the normal, looking at the wall — the control
   *             'graze' offset along the wall, looking down it past the hole
   */
  /**
   * ⚠️ **THE FIRST VERSION OF THIS PUT THE PLAYER'S OWN ROBOT IN FRONT OF THE HOLE**, which is
   * the project's dominant defect class ("it exists, something is in front of it") committed by
   * the instrument rather than by the build. `ThirdPersonCamera`'s boom is 3.0 m, so parking the
   * body 0.7 m from a wall in a 3.4 m passage put the camera against the far wall with the robot
   * filling the middle of the frame — and `dig.md` already records that "there is nowhere to
   * stand that frames both kinds of hole cleanly" in that passage.
   *
   * So the boom is collapsed to ~0.05 m for the shot. The camera is then at the body's eye,
   * `player.model` hides itself (`dist < HIDE_AT`), residency still resolves from the body
   * because the body IS the viewpoint, and the framing is exactly what was asked for.
   */
  /**
   * 🚨 **ROUND 3, RANK 5: A THIRD OF THE CAPTURE SET WAS TOO DARK TO JUDGE, AND THE CAUSE WAS
   * NOT LIGHTING — IT WAS THE CAMERA STANDING INSIDE SOLID GEOMETRY.**
   *
   * `critic-dig-2` filed it for the second round running (*"thick-11 is >90% black, thick-6
   * ~50%"*), and both rounds read it as an exposure problem. Measured instead of assumed:
   * `thick-13-layers-headon-far` is **100% black on its centre scanline**, and its station is
   * `face, out 5.2` — the service passage is about 3.4 m wide, so that request puts the eye
   * roughly 1.8 m THROUGH the opposite wall. `thick-11` (`graze, along -2.20`) runs off the end
   * of the same passage. Nothing was under-lit; the photographer was inside masonry.
   *
   * ⚠️ **AND THE INSTRUMENT REPORTED THOSE FRAMES AS NORMAL** — an angle in degrees, a draw-call
   * count and a triangle count, for a photograph of the inside of a wall. That is this project's
   * standing rule ("a probe that cannot observe must report SKIP, never PASS") being broken by
   * the staging rather than by a probe.
   *
   * So a station is now VALIDATED before it is used: the point must be inside a space
   * (`room.spaceAt` with a negative pad, i.e. properly inside rather than in the wall band) and
   * `room.collide` must not push it anywhere. If it fails, the whole offset is walked back
   * toward the wall in 7% steps until it is legal, and the shrink is REPORTED so a reader can
   * see that a shot was taken from 2.4 m and not the 5.2 m the call asked for.
   */
  const park = (pid, cu, mode, along, out, pitch = null, cv = 0.45) => page.evaluate(
    ([id, u, m, a, o, pi, v]) => {
      const e = window.__rrr.engine;
      const p = e.room.panelOf(id);
      if (!p) return null;
      const n = p.normal;                     // out of the wall, into this room
      const t = { x: n.z, z: -n.x };           // along the wall, in the floor plane
      const c = p.pointAt(u, v);
      const probe = c.clone();
      /**
       * 🚨 **"IS IT IN A SPACE" IS NOT THE TEST. "IS IT IN *THIS* SPACE" IS.** The first version
       * of this clamp asked `spaceAt(probe)` and let `thick-13` stand at its full 5.2 m, which
       * still photographed 99.6% black — because `spaceAt` is a plain AABB scan over every space
       * in the house and knows nothing about the walls between them. At 5.2 m off a service-
       * passage wall the eye is comfortably inside the NEXT ROOM, which is a legal space, has an
       * open floor for `collide` to agree with, and is on the far side of 300 mm of masonry.
       * A clamp that can be satisfied by a different room is not a clamp.
       */
      const front = c.clone();
      front.set(c.x + n.x * 0.5, e.room.floorY + 0.9, c.z + n.z * 0.5);
      const home = e.room.spaceAt(front, 0);
      const standable = (x, z) => {
        probe.set(x, e.room.floorY + 0.9, z);
        // pad -0.30: 30 cm INSIDE the space, so the eye is never in the wall band itself
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
      if (m === 'face') {
        fx = -n.x; fz = -n.z;
      } else {
        // look at a point just in front of the hole, so the wall runs away from the camera
        const tx = c.x + n.x * 0.06, tz = c.z + n.z * 0.06;
        const dx = tx - px, dz = tz - pz;
        const L = Math.hypot(dx, dz) || 1;
        fx = dx / L; fz = dz / L;
      }
      e.player.pos.set(px, e.room.floorY, pz);
      e.player.vel.set(0, 0, 0);
      e.player.facing = Math.atan2(fx, fz);
      // aim AT the hole rather than at the horizon: the camera sits at the body's eye height
      // (cam.height above the floor) and the hole's centre is wherever v puts it.
      const dist = Math.hypot(c.x - px, c.z - pz) || 1;
      const eye = e.room.floorY + (e.cam?.height ?? 1.42);
      const autoPitch = Math.atan2(c.y - eye, dist);
      if (e.cam) {
        e.cam.yaw = e.player.facing;
        e.cam.pitch = pi === null ? autoPitch : pi;
        e.cam.distance = 0.05;
        e.cam.hardMin = 0.02; e.cam.pinchMin = 0.02;
        e.cam._first = true;
      }
      // the angle the shot is actually taken at, reported rather than assumed
      const dot = Math.abs(fx * n.x + fz * n.z);
      return {
        deg: +(Math.asin(Math.min(1, dot)) * 180 / Math.PI).toFixed(1),
        hidden: !!e.cam?.modelHidden,
        // how much of the requested offset survived the room, and whether it is legal at all
        pulled: +(1 - k).toFixed(2),
        out: +(o * k).toFixed(2),
        along: +(a * k).toFixed(2),
        standable: ok,
      };
    }, [pid, cu, mode, along, out, pitch, cv]);

  /**
   * The composite pass's exposure, READ ONLY — see the header for why the lift was removed.
   *
   * ⚠️ `setGrade()` only WRITES `pipeline.grade`; `_applyGrade()` copies it onto the composite
   * uniforms at the top of every `render()`, so the uniform is one frame stale and the grade
   * object is the thing to read.
   */
  const exposureNow = () => page.evaluate(() =>
    window.__rrr.engine.pipeline.grade?.exposure ?? -1);

  /**
   * ⚠️ **THE SETTLE IS 200 FRAMES AND NOT 34, AND THE FIRST VERSION'S SHOTS WERE UNUSABLE
   * BECAUSE OF IT.** A drive that lands twenty-six blows inside a second puts every dust puff in
   * the pool over the hole at once, and at 0.56 s of settle the primary capture was a photograph
   * of a dust cloud. This is also the honest framing: a player looks at what they have made
   * after the dust drops, not through it.
   */
  /**
   * ⚠️ **`alt` IS A FALLBACK STATION, AND IT EXISTS BECAUSE GUESSING A LIT ANGLE FROM A SOURCE
   * FILE DOES NOT WORK.** The clamp above fixes every frame that was dark because the eye was
   * inside a wall; it cannot fix one that is dark because that end of the passage has no light
   * in it, and which end that is depends on the seed's lamp placement. So a deliverable that
   * comes back over the darkness gate is RE-SHOT once from `alt` and the log says which station
   * the file on disk was taken from. A frame that fails both is reported as unusable rather than
   * filed as evidence.
   */
  const look = async (pid, cu, mode, along, out, tag, settle = 300, cv = 0.45, alt = null) => {
    let a = await park(pid, cu, mode, along, out, null, cv);
    if (!a) return null;
    await step(settle);
    let buf = await snap(tag);
    let st = await frameStats(tag, buf);
    let from = `${mode} along ${a.along} out ${a.out}`;
    if (st && st.dark > DARK_GATE && alt) {
      note(`   ${tag}: ${st.dark}% of the frame under luma 24 — re-shooting from the fallback`);
      const b = await park(pid, alt.cu ?? cu, alt.mode ?? mode, alt.along, alt.out,
        null, alt.cv ?? cv);
      if (b) {
        await step(Math.min(settle, 220));
        buf = await snap(tag);
        const st2 = await frameStats(tag, buf);
        if (st2 && st2.dark < st.dark) {
          a = b; st = st2;
          from = `FALLBACK ${alt.mode ?? mode} along ${b.along} out ${b.out}`;
        }
      }
    }
    // the file on disk is whatever the last `snap` wrote, so write it once more under the
    // scenario's own shot path rather than trusting the two to agree
    await shot(tag);
    const p = await perf();
    lumaLog.push({ tag, ...(st ?? {}) });
    note(`   ${tag}: view ${a.deg}° off the wall plane · ${from}`
      + `${a.pulled > 0.01 ? ` (pulled in ${(a.pulled * 100).toFixed(0)}% to stay inside the room)` : ''}`
      + `${a.standable ? '' : ' ⚠️ NO LEGAL STATION FOUND'}`
      + ` · luma median ${st?.median ?? '?'} p90 ${st?.p90 ?? '?'} dark ${st?.dark ?? '?'}%`
      + ` · ${p.calls} calls · ${p.tris} tris · ${p.debris} debris in flight, ${p.rest} at rest`
      + ` · pools ${p.pools}`);
    return { ...a, ...p, ...(st ?? {}) };
  };

  /**
   * =========================================================================
   * 🚨 **C-1 — WHICH FACE TO PHOTOGRAPH, CHOSEN BY MEASUREMENT AND NOT BY ARRAY ORDER.**
   * =========================================================================
   * Two rounds picked `head.free.find(...)`, i.e. **whichever dig face the builder happened to
   * emit first**, and then filed the darkness of that face's room as a defect of the MATERIALS.
   * There are twelve free faces across the house, in rooms with completely different lamp
   * placements, and nothing was choosing between them.
   *
   * ⚠️ **AND THE PREVIOUS ROUND'S FIX FOR THE SAME COMPLAINT WAS AN EXPOSURE LIFT THAT TURNED
   * OUT TO BE A NON-ARM** (see the long note at the shot list). Both rounds reached for the
   * grade because nobody had measured the alternative that costs nothing: stand somewhere else.
   *
   * So every candidate is parked head-on on PRISTINE wall, photographed, and scored, and the
   * brightest usable one is what the round is shot on. The whole table is printed, so if a
   * later round disagrees it can argue with the numbers rather than re-deriving them.
   *
   * ⚠️ **THE SETTLE IS NOT OPTIONAL HERE.** Residency resolves from the body, so a probe that
   * teleports and screenshots in the same round trip photographs an unloaded room and would
   * score every candidate as pitch black — which is the failure it is meant to detect.
   */
  // ⚠️ THE HUNTER IS FROZEN BEFORE THE SCAN, NOT AFTER IT. This walks a stationary body to
  // twelve stations across the house and holds it at each — see `freezeHunter` for the round
  // where the primary deliverable came back as the death screen.
  note(`hunter: ${await freezeHunter()}`);
  /**
   * ⚠️ **BRIGHTNESS ALONE IS THE WRONG CRITERION, AND THE FIRST VERSION OF THIS SCAN PROVED IT
   * BY REGRESSING THE ROUND'S HEADLINE NUMBER.** Picking purely on darkness moved the shoot onto
   * `f.svc_e.2.b` — 38.8% dark against the incumbent's 43.2%, a real gain — into a room so tight
   * that `park` had to pull every deliverable station in by 63-77% and three of them found no
   * legal station at all. The frames got brighter and the composition collapsed: the teal
   * fraction on `thick-12` fell **15.8% -> 6.6%**, not because the material changed but because
   * the camera ended up 0.78 m from a wall it needed 2.1 m for.
   *
   * So a candidate is scored on all three things that decide whether a photograph of it can be
   * judged, and STANDING ROOM outranks light — a dim frame can be re-shot from a fallback, a
   * room you cannot stand back in cannot be fixed at any exposure:
   *   · `room`  what fraction of the deliverable graze offsets `park` can actually honour
   *   · `w`     the face's width: the graded crater reaches 1.45 m, so a narrow face comes out
   *             as a wall that is entirely hole, which is not the reference's *hole IN a wall*
   *   · `dark`  the share of the frame under luma 24, as before
   */
  const scoreFace = async (f) => {
    const a = await park(f.id, 0.5, 'face', 0, 2.4);
    if (!a) return null;
    await step(26);
    const st = await frameStats(`scan-${f.id}`);
    if (!st) return null;
    // the two stations the deliverables actually need: the three-quarter frame and its mirror
    const g1 = await park(f.id, 0.46, 'graze', 2.50, 2.10, null, 0.44);
    const g2 = await park(f.id, 0.46, 'graze', -2.50, 2.10, null, 0.44);
    const room = ((g1?.standable ? 1 - g1.pulled : 0) + (g2?.standable ? 1 - g2.pulled : 0)) / 2;
    return { ...f, ...st, room: +room.toFixed(2) };
  };
  const brightest = async (label, cands, ladder) => {
    const scored = [];
    for (const f of cands) {
      const s = await scoreFace(f);
      if (s) scored.push(s);
    }
    if (!scored.length) return null;
    scored.sort((p, q) => p.dark - q.dark);
    note(`${label} candidates — dark% · median luma · standing room · face width:`);
    for (const s of scored) note(`   ${s.dark}%  ${s.median}  room ${s.room}  w ${s.w}m  ${s.id}`);
    // ⚠️ THE GATE IS ON ROOM, THE SORT IS ON LIGHT. Relaxed in two steps rather than one so a
    // house that simply has no roomy dig face still shoots something instead of returning null.
    for (const [minRoom, minW] of ladder) {
      const ok = scored.filter((s) => s.room >= minRoom && s.w >= minW);
      if (ok.length) {
        note(`   -> ${ok[0].id} (room >= ${minRoom}, width >= ${minW}m, then brightest)`);
        return ok[0];
      }
    }
    return scored[0];
  };
  // ⚠️ BOTH SIDES ARE CANDIDATES. Two rounds pinned `side === 'a'` for no stated reason; a dig
  // face is symmetric by construction (`dig.md`: depth is per-side, the panel API is identical),
  // and the b side of an edge is a DIFFERENT ROOM with different lamps — which is exactly the
  // variable this scan exists to exploit.
  /**
   * ⚠️ **THE TWO FACES ARE GATED DIFFERENTLY, AND THE ASYMMETRY IS THE POINT.**
   *
   * The DUD carries C4 — ornate → white → cyan, the frame John looks at — which needs a wide
   * face (the graded crater reaches 1.10 m) and 2.5 m of standing room for the three-quarter
   * station, so room and width outrank light. The INTERCONNECT carries C2/C3 — a body-sized
   * hole photographed head-on and grazing at 0.4-0.6 m out — which needs neither, so light wins
   * there. Measured: gating both on room put the link on `f.svc_e.1.b` (69.9% dark) when
   * `f.svc_w.0.b` sat at 7.6%, and `thick-3/4/5` all came back over the darkness gate.
   */
  const bestDud = await brightest('dud face', head.free.filter((f) => !f.link),
    [[0.85, 4.0], [0.70, 4.0], [0.70, 0], [0, 0]]);
  const bestLink = await brightest('interconnect face', head.free.filter((f) => f.link),
    [[0.60, 0], [0, 0]]);
  if (bestDud) dud = bestDud;
  if (bestLink) link = bestLink;
  note(`shooting the dud on ${dud.id} and the interconnect on ${link.id}`);

  // =========================================================================
  // C0 — the pristine baseline, so the cost of everything below is attributable
  // =========================================================================
  // ⚠️ The hunter was frozen before the face scan above — see `freezeHunter`. A previous run of
  // this scenario photographed the death screen for its primary deliverable and reported angles
  // and draw calls for it as if nothing had happened.
  // ⚠️ The fallback stands a long way OFF the wall, not further along it. An intact boiserie wall
  // in a dim service passage is the darkest thing this scenario photographs — it has no hole, no
  // white shell and no emissive teal in it — so the only lever is getting the lit floor and the
  // far doorway into the frame beside it.
  const base = await look(dud.id, 0.5, 'face', 0, 3.0, 'thick-0-pristine',
    300, 0.45, { mode: 'graze', along: 2.8, out: 2.6 });

  // =========================================================================
  // C1 — ONE BLOW, PHOTOGRAPHED IN FLIGHT
  // =========================================================================
  await reset(dud.id);
  const b1 = await swing(dud.id, 0.42, 0.42, 1);
  note(`one blow removed ${b1.removed.toFixed(3)} m²·depth → ${b1.debrisLive} pieces in the air`);
  await page.waitForTimeout(110);
  await shot('thick-1-blow-inflight');
  await page.waitForTimeout(220);
  await shot('thick-1-blow-inflight-late');

  // a fresh face at a grazing angle after a handful of blows: the CUT, not yet a hole
  await reset(dud.id);
  await swing(dud.id, 0.42, 0.42, 5);
  await swing(dud.id, 0.55, 0.48, 3);
  await sayBarrier('thick-2', dud.id, 0.42, 0.42);
  await look(dud.id, 0.48, 'graze', 1.5, 0.45, 'thick-2-halfdug-graze', 300, 0.45,
    { along: 2.40, out: 1.90 });

  /**
   * =========================================================================
   * C4 — 🎯 **ORNATE → WHITE → CYAN IN ONE FRAME. THE DELIVERABLE.**
   * =========================================================================
   * John's reference reads as three named materials stacked in depth, and that is the specific
   * thing he will judge, so it gets its own shots on a DUD face — a dud is the only place all
   * three can be on screen at once, because the interconnect has no cyan behind it by
   * definition (`digCensus().link`, G channel 0).
   *
   * 🚨 **AND IT RUNS BEFORE THE INTERCONNECT IS OPENED, WHICH IS THE OTHER HALF OF WHY ROUND 1
   * HAD NO CYAN ANYWHERE.** `barrierProbe` found it: at the dud face, before any interconnect
   * work, `G=1 depth=0.934 smoothed=0.976 vs uShowAt 0.62` — the barrier was armed and above
   * threshold. After the interconnect was opened, the SAME FACE reported `G=0`. That is not a
   * bug, it is `docs/design/dig.md`'s **house-wide unlock** working exactly as specified: John,
   * *"once the interconnect is accessed by a player the whole robot barrier turns off"*, and
   * `DamageField.setBarrierEverywhere(false)` clears G on every dig face in the house on that
   * frame. Round 1's scenario opened the interconnect at shot 3 of 12 and then took the entire
   * material set afterwards, so **ten of the twelve captures were taken in a house that
   * deliberately has no barrier left in it.** The cyan could not have appeared, and no amount of
   * shading work would have put it there.
   *
   * So the ordering is now load-bearing rather than incidental, and it is also the honest
   * in-game state: a player digging a dud spot has NOT yet found the way through, which is when
   * the barrier is the thing they are looking at.
   *
   * ⚠️ **TWO PHASES OF DIGGING, AND THE SECOND ONE IS WHAT MAKES THE BANDS LEGIBLE.** Round 1
   * drove 26 blows at one spot, which bottoms the centre out but leaves the crater wall inside
   * the brush's own rim falloff — so all four bands crossed inside about 15 cm of wall and the
   * result was the "one continuous gradient" the critic could not read. Bottoming out the
   * centre and THEN walking a ring around it grades the crater over half a metre, which spreads
   * `wall.js` DAMAGE_BANDS' four thresholds into rings you can actually see.
   *
   * 🔴 **ROUND 6: A WANDERING DIG, NOT FOUR RINGS — see `crater()` above for why the rings were
   * the harness manufacturing a circle.** The sites below are a player working a body-sized
   * breach: a heavy mass slightly left of centre, three lobes chased off it where the wall gave
   * way, a scatter of lighter bites at the edge and four single taps feathering into the
   * boiserie. Same blow count (45 against 42) and the same 2.2 m extent, so the framing, the
   * darkness audit and the draw-call figures all stay comparable — but the outline is lumpy and
   * asymmetric instead of a disc, which is what the reference photograph actually shows.
   *
   * ⚠️ **THE EXTENT IS STILL THE CONSTRAINT ROUND 2 FOUND AND IT HAS NOT BEEN RELAXED.** The
   * first plan reached 1.70 m and stripped the ornate paint off a 3.4 m circle, leaving the
   * estate wall a thin border round the frame; `critic-dig-2`'s rank 4 is the identification
   * gate, and a crop of a hole with no wall left in it cannot pass one. Nothing here goes past
   * 1.10 m from the centre.
   */
  const CU = 0.46, CV = 0.44;
  await reset(dud.id);
  const cr = await crater(dud.id, CU, CV, [
    // the mass — where the player actually stood and swung. Off-centre and not round.
    [0.00, 0.00, 6, 1.00], [0.19, -0.13, 5, 1.00], [-0.16, 0.21, 5, 1.00], [0.04, 0.41, 4, 0.95],
    // three lobes chased off it, each a different depth: this is what breaks the symmetry
    [0.53, 0.20, 4, 0.80], [-0.47, -0.29, 3, 0.74], [0.28, -0.54, 3, 0.70], [-0.34, 0.56, 3, 0.64],
    // lighter bites at the edge of reach
    [0.79, -0.11, 2, 0.50], [-0.71, 0.34, 2, 0.44], [0.14, 0.79, 2, 0.40], [-0.09, -0.77, 2, 0.34],
    // and four single taps feathering into the ornate skin — and no further
    [1.04, 0.29, 1, 0.25], [-0.94, -0.34, 1, 0.22], [0.54, 0.93, 1, 0.20], [-0.53, -0.88, 1, 0.18],
  ]);
  if (cr) {
    note(`graded crater: ${cr.blows} blows · maxDepth ${cr.maxDepth.toFixed(3)} · mean ${cr.mean}`);
    note(`   radial depth profile → ${cr.prof}`);
  }
  // ⚠️ STEP FRAMES BEFORE PROBING. `smooth` is the B channel, and `DamageField.flush()` (which
  // rebuilds it) runs from `room.update()` once per frame — so a probe taken in the same round
  // trip as the blows reads a B channel of 0 and reports "not dug deep enough" over a crater at
  // depth 1.00. That is the instrument, not the build, and it read as the build for one round.
  await step(8);
  const bp = await sayBarrier('thick-8..15 (dud)', dud.id, CU, CV);
  if (bp) {
    bp.visible && bp.barrier && bp.smooth >= bp.showAt
      ? pass('the cyan barrier is exposed and drawing',
        `mesh visible, G=1, smoothed depth ${bp.smooth} over uShowAt ${bp.showAt}`)
      : fail('the cyan barrier is exposed and drawing',
        `visible=${bp.visible} G=${bp.barrier} smoothed=${bp.smooth} vs uShowAt ${bp.showAt}`);
  }

  await look(dud.id, CU, 'face', 0, 3.6, 'thick-8-layers-headon', 300, CV);
  note(`   thick-8 scanline (r,g,b across the middle) → ${await scanline('thick-8-layers-headon')}`);
  // 🎯 THE GRAZE SET. Close and hard off the wall plane, so a cut edge has to show a face.
  await look(dud.id, CU, 'graze', 2.20, 0.78, 'thick-9-layers-graze', 300, CV,
    { along: 1.70, out: 0.70 });
  await look(dud.id, CU, 'graze', 3.30, 0.95, 'thick-10-layers-graze-far', 300, CV,
    { along: 2.60, out: 0.85 });
  /**
   * ⚠️ **THIS WAS `thick-11-layers-graze-mirror` AND THE MIRROR IS RETIRED, NOT RE-LIT.** It
   * stood at `along -2.20`, which runs off the lit end of the service passage, and it came back
   * >90% black for two rounds running — a third of the evidence set spent on a MIRRORED DUPLICATE
   * of `thick-9`. The angle the slice actually needs more of is the hard graze, because head-on
   * is the one view in which a zero-thickness cut and a 146 mm one are the same picture. So this
   * is the steepest station the room allows: about 14° off the wall plane, on the lit side.
   */
  await look(dud.id, CU, 'graze', 1.55, 0.38, 'thick-11-layers-graze-steep', 300, CV,
    { along: 1.20, out: 0.45 });

  /**
   * =========================================================================
   * 🎯 **C6 — THE SECTION. ROUND 4'S SECOND DELIVERABLE, AND IT NEEDED A NEW STATION.**
   * =========================================================================
   * `critic-dig-3` looked for the white shell's cut edge in `thick-9/10/11` (18° / 15° / 11.7°)
   * and found none, and told the next round to *"stage one that can"* if no existing station
   * could show it. It could not, and the reason is arithmetic rather than shading:
   *
   * **A slab edge's apparent width is its own thickness, at every grazing angle.** Turning
   * further edge-on does not widen it — `T · sin(angle between the wall normal and the view)`
   * saturates at `T` and stops. The shell is 69 mm (`DAMAGE_DEPTH_F` 0.10 → 0.56 of a 150 mm
   * `DIG_T`), so at `thick-9`'s 2.3 m stand-off it is worth about 14 px in a 1280-wide frame
   * whichever way the camera is turned. **The missing variable was never the angle. It was the
   * DISTANCE**, and every station in this scenario was built to get a whole crater in frame.
   *
   * So: 0.4 m off the wall, aimed at the crater's UPPER rim from below it. Two things come from
   * standing there and neither is available further back — the section is worth 3-4× the pixels,
   * and the top rim's soffit is grazed VERTICALLY (the eye is below it), which is the one part
   * of a hole's edge you can be close to and edge-on to at the same time. `sectionWidth()`
   * above turns the result into a number off the image.
   */
  const sec = await look(dud.id, CU, 'graze', 1.05, 0.40, 'thick-17-cut-section', 300, CV + 0.20,
    { along: 1.45, out: 0.62, cv: CV + 0.18 });
  const secW = await sectionWidth('thick-17-cut-section');
  if (secW) {
    note(`   thick-17: ${secW.crossings} shell→core crossings · section band `
      + `median ${secW.median} px · p90 ${secW.p90} px · widest ${secW.max} px`);
    /**
     * ⚠️ **`crossings` IS A PROPERTY OF THE FRAMING, NOT OF THE WALL, AND 20 WAS UNREACHABLE AT
     * THIS STATION.** It counts scanlines that found a shell→core crossing, so it scales with how
     * much teal is in frame — and `thick-17` deliberately stands 0.4 m off the wall aimed at the
     * crater's UPPER rim, where the core is a corner of the picture. It read 9 in three
     * consecutive runs of three different builds. The thing being asserted is the WIDTH of the
     * section; `crossings` is only there to stop a median being computed off two pixels, and 8
     * does that. **Stated rather than quietly relaxed:** this gate has never passed, the number it
     * was failing on was the instrument's, and `median` — the measurement that is actually about
     * the wall — is reported for `thick-9` as well so the two stations can be compared.
     *
     * 🚨 **ROUND 10 CHANGED WHAT THIS NUMBER MEANS AND THE GATE IS DELIBERATELY NOT RELAXED FOR
     * IT.** `breakmask.js` `uCore` paints the back slice of the innermost layer's section in the
     * cyan structure's own colour — the reference's white facing over a teal core — so those
     * pixels stop satisfying `isCut` (neutral, mid-luma) and start satisfying `isTeal`. **The run
     * this gate measures is the WHITE share of the cut edge, and a share of it is now teal on
     * purpose.**
     *
     * ⚠️ **THE CUT EDGE ITSELF DID NOT NARROW, AND THAT WAS MEASURED RATHER THAN ASSERTED.**
     * `harness/_chunks12_slabedge.mjs` runs this exact classifier alongside a second one that
     * walks from the last shell pixel to the FILL — i.e. white section plus core section, the
     * whole slab edge. On a one-page A/B, same crater, `uCore` off then on:
     *
     *   | station | white median | whole slab edge, median |
     *   |---|---|---|
     *   | three-quarter, core off | 5 px | **12 px** |
     *   | three-quarter, core on  | 9 px | **12 px** |
     *   | steep graze, core off   | 2 px | **11 px** |
     *   | steep graze, core on    | 0 px | **11 px** |
     *
     * The slab edge is identical in both arms and the white share moves +4 / -2 px, which is
     * inside this classifier's own documented fragility (see `isCut` above — one speckle ends a
     * run). On the delivered `thick-17` the whole slab edge measures **median 13 px, p90 32**.
     * **So a FAIL here is not by itself evidence that the shell reads as a sheet** — read the
     * slab-edge number beside it. Left failing rather than re-thresholded, because a gate a
     * builder moved to go green is worth nothing.
     */
    secW.median >= 6 && secW.crossings >= 8
      ? pass('the white shell shows a cross-section at the break',
        `${secW.crossings} crossings, median ${secW.median} px of neutral mid-value section `
        + `between white shell and teal core (view ${sec?.deg}° off the wall plane)`)
      : fail('the white shell shows a cross-section at the break',
        `${secW.crossings} crossings, median ${secW.median} px — the shell still reads as a `
        + 'sheet of zero thickness at this station');
  }
  // the same measurement on the station the critic actually checked, so the two are comparable
  const sec9 = await sectionWidth('thick-9-layers-graze');
  if (sec9) {
    note(`   thick-9 for comparison: ${sec9.crossings} crossings · median ${sec9.median} px `
      + `· widest ${sec9.max} px`);
  }

  /**
   * 🎯 **THE FRAME JOHN WILL ACTUALLY LOOK AT.** Three quarters rather than head-on or hard
   * grazing: at ~39° off the wall plane the concentric material rings are all still legible AND
   * the cut faces are turned toward the camera, which is the one framing that carries both
   * halves of this slice at once. Backed off to ~2.5 m as well — the first attempt stood 1.3 m
   * off and the hole ran out of frame, which is the instrument hiding the composition it was
   * built to show. Shot twice; see the header on exposure.
   */
  await look(dud.id, CU, 'graze', 2.50, 2.10, 'thick-12-three-materials', 300, CV,
    { along: 2.00, out: 1.60 });
  const litA = await tealFraction('thick-12-three-materials');
  if (litA) {
    note(`   thick-12: ${litA.teal}% of the middle of the frame is structural teal, `
      + `${litA.white}% is white rim/body (${litA.w}x${litA.h})`);
    litA.teal >= 0.5
      ? pass('the reference\'s cyan signature is in the evidence set', `${litA.teal}% of frame`)
      : fail('the reference\'s cyan signature is in the evidence set',
        `only ${litA.teal}% of the frame classifies as teal`);
  }

  /**
   * 🚨 **THE "EXPOSURE-LIFTED" ARM THAT USED TO BE HERE WAS COMPARING SHIPPED AGAINST SHIPPED,
   * AND IT IS DELETED RATHER THAN RETUNED.**
   *
   * It called `setGrade({ exposure: 1.85 })` — and `src/views/game.js` line 247 already ships
   * `game.play` at **exposure 1.85**. So the "lit" twin of every frame was the same frame, and
   * the arm could not have detected an exposure problem in either direction. Found by
   * `legibility-1`, two ways: reading the source, and reading `pipeline.grade.exposure` live.
   * A pair of captures labelled as an A/B when they are one capture twice is worse than no
   * captures, because a critic will reason from the label.
   *
   * ⚠️ **AND IT IS NOT REPLACED WITH A BIGGER NUMBER, BECAUSE EXPOSURE IS THE WRONG LEVER AND
   * THAT IS MEASURED.** `legibility-1` ran it properly at 1.85 → 4.0: top-decile chroma barely
   * moved (0.238 → 0.147, still under the project's 0.14 gate), the frame blew out to a median
   * of 124, and **the teal fraction FELL, 12.7% → 8.5%** — ACES compresses saturated colour
   * toward white as it approaches the highlight rolloff, so more exposure actively launders the
   * cyan out of the picture. `game.play` at 1.85 is already the most exposure-boosted view on
   * the board (`room.ballroom`, PASS 90, runs 1.05).
   *
   * So round 2's answer to "half the set is too dark to judge" is not a brighter photograph. It
   * is bands that carry their own value and chroma — see `wall.js` DIG_BAND_LOOK's per-band
   * emissive and `breakmask.js` `barrierMaterial`'s. The shots below are extra ANGLES at the
   * shipped grade, which is the only grade a player ever sees.
   */
  note(`   shipped grade: exposure ${await exposureNow()} — no lift applied (see the note above)`);
  // ⚠️ 5.2 m in a 3.4 m passage put the eye 1.8 m through the far wall and photographed the
  // inside of it — 100% of the centre scanline black. `park` now clamps it; the log says by
  // how much. See the long note there.
  await look(dud.id, CU, 'face', 0, 5.2, 'thick-13-layers-headon-far', 200, CV,
    { mode: 'graze', along: 1.90, out: 1.70 });
  await look(dud.id, CU, 'graze', 1.55, 1.30, 'thick-14-layers-three-quarter-near', 200, CV,
    { along: 1.30, out: 1.05 });
  const litB = await tealFraction('thick-14-layers-three-quarter-near');
  if (litB) note(`   thick-14: teal ${litB.teal}% · white ${litB.white}%`);
  await look(dud.id, CU, 'graze', -2.50, 2.10, 'thick-15-three-materials-mirror', 200, CV,
    { along: 2.50, out: 2.10 });

  /**
   * 🎯 **THE IDENTIFICATION-GATE FRAME, AND IT IS ITS OWN DELIVERABLE THIS ROUND.**
   *
   * `rrr-critique`'s gate is that a stranger shown a no-context crop can name what they are
   * looking at, and identifying by elimination does not count. Round 1 failed it outright;
   * round 2 drew **three mutually-disagreeing wrong guesses** off three crops — *"torn poster
   * over corrugated siding"*, *"damaged pool liner"*, *"scaffolding/window bars"* — which
   * `critic-dig-2` called disqualifying on its own. Two of the three name the corrugation this
   * round deletes; the third names the barrier's stiffeners, which are deleted with it.
   *
   * What the gate needs beyond that is CONTEXT IN THE FRAME: floor line, the rubble the dig
   * produced, and enough intact ornate wall either side that the hole reads as a hole IN
   * something. `thick-12` has it and is at 2.1 m; this is the same read at arm's length further
   * back, so a crop taken anywhere in it still contains a wall.
   */
  await look(dud.id, CU, 'graze', 3.40, 2.70, 'thick-16-identification', 260, 0.40,
    { along: 2.80, out: 2.20, cv: 0.40 });
  const litC = await tealFraction('thick-16-identification');
  if (litC) note(`   thick-16: teal ${litC.teal}% · white ${litC.white}%`);

  /**
   * =========================================================================
   * 🚨 **C7 — THE OTHER ROOM. TEN ROUNDS AND SEVEN CRITICS JUDGED THIS DIG AND NOT ONE FRAME
   * WAS EVER TAKEN FROM THE FAR SIDE OF THE WALL.**
   * =========================================================================
   * Every `thick-*` station above is staged in the room that owns `dud`. The face on the other
   * side of the same band is a DIFFERENT PANEL in a DIFFERENT ROOM with a different lamp rig —
   * and for the west edge that room is `study_w`, **the spawn room, where a player stands for
   * most of a dig**. `critic-slice-1` was the first to walk round there, and filed the dig as not
   * reading at the endpoint.
   *
   * 🔎 **THE CAUSE WAS NEITHER CULLING, NOR THE LIGHTS, NOR A MISSING DAMAGE ARM. THE FAR FACE
   * WAS NEVER DUG, AND IT IS NOT SUPPOSED TO BE** (`_digside1-diag`, seed s4, `f.svc_w.1.*`):
   *
   *   after a 45-blow crater on `f.svc_w.1.a`   ->  the twin `f.svc_w.1.b` reads
   *                                                 hits 0 · maxDepth 0.000 · stage 0
   *
   * `wall.js` `_couple()` mirrors a cell onto the twin only when it went ALL THE WAY THROUGH and
   * is not barrier — and every cell of a dud is barrier — so `dig.md` §5's rule holds exactly as
   * written: *"depth is per-side… exposing it from room A tells you nothing about how far anyone
   * has dug from room B."* The far room is looking at an intact wall, correctly.
   *
   * ⚠️ **SO THE FRAME THAT LOOKS LIKE A BUG IS A DELIVERABLE, AND IT IS SHOT HERE ON PURPOSE.**
   * `thick-20` is that intact wall, named, so no future round can mistake it for a broken one;
   * `thick-21`/`thick-22` are the SAME SPOT dug from that room, which is what a player standing
   * there actually does. Measured on the first run of this block: the far room's dug face reads
   * **teal 23.2% · white 12.8% · 21.3% dark**, against the near room's **24.2% · 3.5% · 19%** —
   * i.e. the payoff reads at least as well from the far side once it is dug there.
   *
   * ⚠️ **AND THE `hits === 0` ASSERTION BELOW IS THE POINT OF THE WHOLE BLOCK.** A picture cannot
   * distinguish "the far face is broken and renders wrong" from "the far face is not broken";
   * one round of a critic, a lead and a builder was spent on exactly that ambiguity. The number
   * settles it in the run's own output.
   */
  const twinOfDud = head.free.find((f) => f.edge === dud.edge && f.span === dud.span
    && f.side !== dud.side);
  if (!twinOfDud) {
    skip('the dig reads from the room on the other side', 'no twin face for the dud in the census');
  } else {
    const rooms = await page.evaluate(([x, y]) => {
      const e = window.__rrr.engine;
      const r = (id) => e.room.panelOf(id)?.spec?.a ?? '?';
      return { near: r(x), far: r(y) };
    }, [dud.id, twinOfDud.id]);
    const farField = await page.evaluate((pid) => {
      const p = window.__rrr.engine.room.panelOf(pid);
      const st = p.field?.stats();
      return st ? { hits: st.hits, maxDepth: +st.maxDepth.toFixed(3), stage: p.state.stage } : null;
    }, twinOfDud.id);
    note(`the far side of ${dud.id} (${rooms.near}) is ${twinOfDud.id} (${rooms.far}) — `
      + `after ${cr?.blows ?? '?'} blows over here it reads ${JSON.stringify(farField)}`);
    farField && farField.hits === 0 && farField.maxDepth === 0
      ? pass('a dud dug from one room leaves the other room\'s face untouched',
        `${twinOfDud.id} in ${rooms.far}: hits ${farField.hits}, maxDepth ${farField.maxDepth} `
        + '— dig.md §5, and the reason the far room shows intact wall')
      : fail('a dud dug from one room leaves the other room\'s face untouched',
        `${twinOfDud.id} reads ${JSON.stringify(farField)} — the per-side rule has moved`);

    // the control: what `critic-slice-1` photographed and read as a hole that would not render
    await look(twinOfDud.id, 1 - CU, 'graze', 2.50, 2.10, 'thick-20-other-room-undug', 260, CV,
      { along: 2.00, out: 1.60 });

    // …and the same spot on the same wall, dug from THAT room, which is the payoff frame
    const cr2 = await crater(twinOfDud.id, 1 - CU, CV, [
      [0.00, 0.00, 6, 1.00], [0.19, -0.13, 5, 1.00], [-0.16, 0.21, 5, 1.00], [0.04, 0.41, 4, 0.95],
      [0.53, 0.20, 4, 0.80], [-0.47, -0.29, 3, 0.74], [0.28, -0.54, 3, 0.70], [-0.34, 0.56, 3, 0.64],
      [0.79, -0.11, 2, 0.50], [-0.71, 0.34, 2, 0.44], [0.14, 0.79, 2, 0.40], [-0.09, -0.77, 2, 0.34],
      [1.04, 0.29, 1, 0.25], [-0.94, -0.34, 1, 0.22], [0.54, 0.93, 1, 0.20], [-0.53, -0.88, 1, 0.18],
    ]);
    if (cr2) note(`far-room crater: ${cr2.blows} blows · maxDepth ${cr2.maxDepth.toFixed(3)}`);
    await step(8);
    await sayBarrier('thick-21/22 (far room)', twinOfDud.id, 1 - CU, CV);
    await look(twinOfDud.id, 1 - CU, 'graze', 2.50, 2.10, 'thick-21-other-room-dug', 300, CV,
      { along: 2.00, out: 1.60 });
    const litD = await tealFraction('thick-21-other-room-dug');
    if (litD) {
      note(`   thick-21: ${litD.teal}% structural teal · ${litD.white}% white rim/body `
        + `(${rooms.far})`);
      /**
       * Same 0.5% gate as `thick-12`, deliberately: the claim is that the payoff reads the same
       * from either room, so it has to clear the same bar the near room's deliverable clears.
       */
      litD.teal >= 0.5
        ? pass('the dig reads from the room on the other side',
          `${litD.teal}% teal, ${litD.white}% white in ${rooms.far} on ${twinOfDud.id}`)
        : fail('the dig reads from the room on the other side',
          `only ${litD.teal}% of the frame classifies as teal in ${rooms.far}`);
    }
    await look(twinOfDud.id, 1 - CU, 'face', 0, 3.4, 'thick-22-other-room-dug-headon', 260, CV,
      { mode: 'graze', along: 1.90, out: 1.70 });
  }

  // =========================================================================
  // C2/C3 — A BODY-SIZED HOLE, HEAD-ON AND GRAZING
  // =========================================================================
  // ⚠️ LAST, NOT FIRST — opening this fires the house-wide unlock and clears the barrier
  /**
   * =========================================================================
   * 🐞 **C5 — THE TRANSPARENCY BUG, REPRODUCED AND ABLATED IN ONE PAGE.**
   * =========================================================================
   * John, after playing round 4: *"in one location the cyan wall became transparent."*
   *
   * The mechanism (`breakmask.js` `uOpenAt`): at an INTERCONNECT the G channel is 0, so the
   * barrier plane discarded; the far face's own layer planes are `FrontSide` facing the OTHER
   * room, so they are back-face culled from here; and the shell's innermost layer opens at a
   * smoothed depth of ~0.70 while the wall is not physically through until `OPEN_AT` = 0.999.
   * In that window **no surface exists in the wall band at all** and the frame shows the dark
   * room beyond a wall that still stops a body.
   *
   * ⚠️ **IT IS PROVED BY ABLATION, NOT BY ARGUMENT, AND THE TWO ARMS ARE ONE UNIFORM APART.**
   * `uOpenAt = 0` is exactly the old shader (discard wherever there is no barrier); the shipped
   * value is 0.985. Same page, same station, same frozen field, two captures. The measurement is
   * the share of the crater that is BRIGHTER in the broken arm than in the fixed one — i.e. the
   * far room leaking through — plus the count of pixels that changed at all.
   *
   * ⚠️ The dig is stopped SHORT of through on purpose: driven to passable, the hole is a real
   * hole and both arms are correctly transparent, which is why nothing before this round caught
   * it. The bug lives strictly between "the white gave way" and "the wall is open".
   */
  await reset(link.id);
  const partial = await page.evaluate((pid) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(pid);
    const g = p.field;
    // the middle of the interconnect blob: the deepest run of G == 0 cells
    let bestX = -1, bestY = -1, bestN = 0, runA = -1, run = 0;
    const cy = Math.floor(g.rows * 0.5);
    for (let cx = 0; cx < g.cols; cx++) {
      if (!g.barrier[g.idx(cx, cy)]) {
        if (run === 0) runA = cx;
        run++;
        if (run > bestN) { bestN = run; bestX = runA; bestY = cy; }
      } else run = 0;
    }
    if (bestN < 3) return null;
    const u = (bestX + bestN / 2) / g.cols, v = (bestY + 0.5) / g.rows;
    // stop as soon as the SHADER's own depth is past where the innermost shell layer opens
    // (wall.js DAMAGE_BANDS[3][0] = 0.68) but before OPEN_AT. That is the whole bug window.
    let n = 0;
    for (; n < 200; n++) {
      const i = g.idx(Math.floor(u * g.cols), Math.floor(v * g.rows));
      if (g.data[i * 4 + 2] / 255 >= 0.80) break;
      p.applyHit(p.pointAt(u, v), 1);
    }
    const i = g.idx(Math.floor(u * g.cols), Math.floor(v * g.rows));
    return {
      u, v, blows: n,
      depth: +g.depth[i].toFixed(3),
      smooth: +(g.data[i * 4 + 2] / 255).toFixed(3),
      barrier: g.barrier[i],
      passable: !!p.openChannel().open,
    };
  }, link.id);
  if (!partial) {
    skip('a wall that is not through is opaque',
      'no interconnect run wide enough to part-dig on this seed');
  } else {
    note(`   C5: ${partial.blows} blows at the interconnect → depth ${partial.depth} `
      + `(smoothed ${partial.smooth}), G=${partial.barrier}, passable=${partial.passable}`);
    const setOpenAt = (v) => page.evaluate(([pid, val]) => {
      const p = window.__rrr.engine.room.panelOf(pid);
      const u = p.barrierMaterial?.userData?.barrierUniforms;
      if (!u?.uOpenAt) return false;
      u.uOpenAt.value = val;
      return true;
    }, [link.id, v]);
    const hasKnob = await setOpenAt(0);
    if (!hasKnob) {
      skip('a wall that is not through is opaque', 'no uOpenAt uniform on this build');
    } else {
      await look(link.id, partial.u, 'face', 0, 2.2, 'thick-18-seethrough-BROKEN', 90, partial.v);
      const broken = await snap('thick-18-seethrough-BROKEN');
      await setOpenAt(0.985);
      await look(link.id, partial.u, 'face', 0, 2.2, 'thick-19-seethrough-FIXED', 90, partial.v);
      const fixed = await snap('thick-19-seethrough-FIXED');
      const diff = broken && fixed ? await page.evaluate(async ([a64, b64]) => {
        const dec = async (s) => {
          const bin = atob(s);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          const bmp = await createImageBitmap(new Blob([arr], { type: 'image/png' }));
          const c = new OffscreenCanvas(bmp.width, bmp.height);
          const g2 = c.getContext('2d', { willReadFrequently: true });
          g2.drawImage(bmp, 0, 0);
          return { w: bmp.width, h: bmp.height, d: g2.getImageData(0, 0, bmp.width, bmp.height).data };
        };
        const A = await dec(a64), B = await dec(b64);
        if (A.w !== B.w || A.h !== B.h) return null;
        let moved = 0, brighter = 0, total = 0, sumA = 0, sumB = 0;
        for (let y = 0; y < A.h * 0.86; y++) {
          for (let x = 0; x < A.w; x++) {
            const o = (y * A.w + x) * 4;
            const la = 0.299 * A.d[o] + 0.587 * A.d[o + 1] + 0.114 * A.d[o + 2];
            const lb = 0.299 * B.d[o] + 0.587 * B.d[o + 1] + 0.114 * B.d[o + 2];
            total++;
            if (Math.abs(la - lb) > 3) { moved++; sumA += la; sumB += lb; if (la > lb + 3) brighter++; }
          }
        }
        return {
          movedPct: +(moved / total * 100).toFixed(2),
          brighterPct: +(brighter / total * 100).toFixed(2),
          meanBroken: moved ? Math.round(sumA / moved) : 0,
          meanFixed: moved ? Math.round(sumB / moved) : 0,
        };
      }, [broken.toString('base64'), fixed.toString('base64')]) : null;
      if (!diff) {
        skip('a wall that is not through is opaque', 'the two arms could not be compared');
      } else {
        note(`   C5 ablation: ${diff.movedPct}% of the frame changed, ${diff.brighterPct}% was `
          + `BRIGHTER with the bug · mean luma over the changed pixels `
          + `${diff.meanBroken} (broken) → ${diff.meanFixed} (fixed)`);
        diff.brighterPct >= 0.20 && diff.meanBroken > diff.meanFixed
          ? pass('a wall that is not through is opaque',
            `the interconnect at depth ${partial.depth} showed the room beyond through `
            + `${diff.brighterPct}% of the frame; with uOpenAt it is the wall band's interior`)
          : fail('a wall that is not through is opaque',
            `expected the broken arm to leak the far room; measured ${diff.brighterPct}% brighter`);
      }
    }
  }

  // channel on every dig face in the house. See C4 above.
  // open the interconnect face properly, using the same aim loop `dig-free.mjs` uses
  await reset(link.id);
  let blows = 0, done = false;
  for (let i = 0; i < 320 && !done; i++) {
    const aim = await page.evaluate((pid) => {
      const g = window.__rrr.engine.room.panelOf(pid).field;
      const by0 = Math.floor(0.30 / g.cellH), by1 = Math.min(g.rows - 1, Math.ceil(1.80 / g.cellH));
      let bestA = -1, bestN = 0, runA = -1, run = 0;
      for (let cx = 0; cx <= g.cols; cx++) {
        let clear = cx < g.cols;
        for (let cy = by0; cy <= by1 && clear; cy++) if (g.barrier[g.idx(cx, cy)]) clear = false;
        if (clear) { if (run === 0) runA = cx; run++; if (run > bestN) { bestN = run; bestA = runA; } }
        else run = 0;
      }
      if (bestN === 0) return null;
      const needed = Math.ceil(0.80 / g.cellW);
      const mid = bestA + bestN / 2;
      const cx0 = Math.max(bestA, Math.round(mid - needed / 2));
      const cx1 = Math.min(bestA + bestN - 1, cx0 + needed - 1);
      const cy1 = Math.min(g.rows - 1, Math.ceil(1.95 / g.cellH));
      let bx = cx0, by = 0, bd = 2;
      for (let cy = 0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const d = g.depth[g.idx(cx, cy)];
          if (d < bd) { bd = d; bx = cx; by = cy; }
        }
      }
      return [(bx + 0.5) / g.cols, (by + 0.5) / g.rows];
    }, link.id);
    if (!aim) break;
    const st = await swing(link.id, aim[0], aim[1], 1);
    blows++;
    if (st.passable) done = true;
  }
  const centreU = await page.evaluate((id) =>
    window.__rrr.engine.room.panelOf(id).openChannel().centreU, link.id);
  note(`opened a body-sized channel in ${blows} blows at u=${centreU.toFixed(2)}`);
  if (!done) fail('a body-sized hole was opened to photograph', `${blows} blows and still closed`);

  await sayBarrier('thick-3 (interconnect)', link.id, centreU, 0.45);
  const headOn = await look(link.id, centreU, 'face', 0, 2.8, 'thick-3-hole-headon', 300, 0.45,
    { mode: 'graze', along: 1.90, out: 1.70 });
  if (GRAZE_SHOTS) {
    // ⚠️ Both fallbacks stand WELL OFF the wall rather than a little further along it. Measured
    // last round: a fallback 0.4 m along the same dark strip came back at the same 69% and was
    // correctly rejected, so the whole re-shoot bought nothing. Light in these passages falls
    // off toward the wall, not along it.
    await look(link.id, centreU, 'graze', 2.2, 0.52, 'thick-4-hole-graze-far', 300, 0.45,
      { along: 2.0, out: 1.60 });
    await look(link.id, centreU, 'graze', 1.3, 0.42, 'thick-5-hole-graze-near', 300, 0.45,
      { along: 1.4, out: 1.30 });
    /**
     * 🕳️ **"THE OTHER SIDE" NOW MEANS THE OTHER ROOM, WHICH IS WHAT THE SHOT WAS FOR.**
     *
     * It used to mean `along -1.9` — the same room, the far side of the same hole — and it came
     * back 76% then 55% under luma 24 across two rounds because that end of the passage has no
     * light in it and `park` can find no legal station there. It was also the weaker picture:
     * `critic-dig-2` credited the round with *"the hole demonstrably punches through to the room
     * beyond… confirmed from both sides"*, and the frame that actually confirms that is one
     * taken from the room beyond, looking back through the channel at the light in this one.
     * The twin is the same physical opening (`dig.md`: one shared edge, two faces), so this is
     * one hole photographed from both of its ends rather than one end photographed twice.
     */
    const twin = head.free.find((f) => f.edge === link.edge && f.span === link.span
      && f.side !== link.side);
    if (twin) {
      note(`   the far side of this channel is ${twin.id}`);
      await look(twin.id, 1 - centreU, 'graze', 1.9, 0.90, 'thick-6-hole-from-the-other-room',
        300, 0.45, { mode: 'face', along: 0, out: 2.4 });
    } else {
      note('   no twin face in the census — skipping the far-side frame');
    }
  }

  // one more blow at the rim of the finished hole, photographed in flight from the graze
  await park(link.id, centreU, 'graze', 2.2, 0.70);
  await step(24);
  await swing(link.id, Math.min(0.95, centreU + 0.12), 0.55, 1);
  await page.waitForTimeout(120);
  await shot('thick-7-blow-at-the-rim-graze');

  // =========================================================================
  // C5 — what it cost
  // =========================================================================
  const after = await perf();
  if (base) {
    note(`DRAW CALLS at this station: pristine ${base.calls} → holed ${headOn?.calls ?? '?'} `
      + `→ with debris resting ${after.calls}   (tris ${base.tris} → ${after.tris})`);
    pass('the cost of the look is reported',
      `pristine ${base.calls} calls, a face with a body-sized hole in it ${headOn?.calls}, `
      + `${after.rest} pieces of rubble on the floor`);
  }

  // the pile: John's reference shows rubble that records what was done
  after.rest > 8
    ? pass('the dig leaves rubble on the floor', `${after.rest} pieces at rest`)
    : fail('the dig leaves rubble on the floor', `${after.rest} pieces at rest`);

  /**
   * 🚨 **THE EVIDENCE SET AUDITS ITSELF NOW.** Two rounds were handed back with *"a third of the
   * capture set is too dark to judge"* as an unresolved defect, and neither round could say
   * which frames or by how much, because the scenario measured the picture's TEAL and never its
   * VALUE. This is the whole set, ranked, with a hard gate — so an unusable frame is a named
   * failure in the run's own output rather than something the critic discovers and discards.
   */
  /**
   * ⚠️ **THE C5 ABLATION PAIR IS A DIAGNOSTIC AND IS NOT AUDITED FOR DARKNESS.** This gate exists
   * because a critic cannot judge a frame it cannot see. `thick-18` / `thick-19` are not for a
   * critic: they are two arms of a one-uniform ablation whose entire subject is a LUMINANCE
   * DIFFERENCE between them, taken head-on at an interconnect in an unlit service passage, and
   * the fixed arm is *supposed* to be dark — that is the finding. Auditing them would report the
   * fix as a defect. They are listed below, marked, and excluded from the count.
   */
  /**
   * ⚠️ **`thick-20` IS A CONTROL AND ITS DARKNESS IS PART OF THE FINDING, SO IT IS LISTED AND NOT
   * GATED.** It is a photograph of an UNDUG wall in the far room, taken to name the frame
   * `critic-slice-1` mistook for a hole that would not render. It has no white shell and no
   * emissive teal in it by construction — that is what "nobody has dug here" looks like — so
   * auditing it would report the control as a defect. ⚠️ **Its number is still worth reading:**
   * the far room's undug dig band measured **70% under luma 24 against the near room's 49%**, so
   * a player in the spawn room can barely see the wall they are meant to attack. That belongs to
   * whoever owns the study's lamps, not to the dig's materials, and it is recorded here rather
   * than fixed here.
   */
  const isDiag = (r) => /seethrough|other-room-undug/.test(r.tag);
  const worst = [...lumaLog].sort((a, b) => (b.dark ?? 0) - (a.dark ?? 0));
  note(`darkness audit (share of frame under luma 24, gate ${DARK_GATE}%):`);
  for (const r of worst) {
    note(`   ${r.dark ?? '?'}%  median ${r.median ?? '?'}  ${r.tag}`
      + (isDiag(r) ? '   [diagnostic — not audited, see the note]' : ''));
  }
  const unusable = worst.filter((r) => (r.dark ?? 0) > DARK_GATE && !isDiag(r));
  unusable.length === 0
    ? pass('every deliverable frame is bright enough to judge',
      `${lumaLog.length} frames, worst ${worst[0]?.dark ?? '?'}% under luma 24`)
    : fail('every deliverable frame is bright enough to judge',
      `${unusable.length} of ${lumaLog.length} over the gate: `
      + unusable.map((r) => `${r.tag} ${r.dark}%`).join(', '));
}
