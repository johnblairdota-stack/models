/**
 * 🕳️ FREE-FORM DESTRUCTION — DO WHITE CHUNKS COME OFF WHERE THE HAMMER LANDS, AND HOW LONG
 * DOES IT TAKE TO GET INTO THE NEXT ROOM?
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/dig-free.mjs \
 *        --port 5301 --q "seed=s4&dig=1" --shots
 *
 * This replaces `dig-link.mjs`'s vocabulary, which was written in bays — *"bay 3 of 9"*. John
 * rejected the bays (*"I don't really want to use the dud bay"*), so the assertions are rewritten
 * around the thing that survives the change: **the honest metric is time to FIND the way through,
 * including wasted digging.**
 *
 *   F0  THE BUILD      one continuous face per span per room, with a damage grid on it, and no
 *                      masonry anywhere — the barrier is a channel of the same texture.
 *   F1  A BLOW         one hammer hit removes a PATCH, and the chunks it throws scale with what
 *                      was actually removed.
 *   F2  THE FALLOFF    the same spot pays less and less; a spot 0.6 m away pays full price again.
 *                      This is the search heuristic and there is no HUD number for it.
 *   F3  A PROBE        blows to dig deep enough to see what is behind one spot — the price of a
 *                      dud, and what makes "move along" a decision.
 *   F4  THE SEARCH     🎯 first blow -> a body-sized channel at the interconnect, INCLUDING every
 *                      abandoned dig. John's band: ~60 s median, 45-75 s acceptable.
 *   F5  PASSABILITY    a robot body driven at the hole goes through it, and at a dud does not.
 *   F6  THE UNLOCK     one discovery drops the barrier on THE WALLS OF THE ROOM YOU DUG FROM,
 *                      and leaves every other room's standing. ⚠️ REWRITTEN 2026-08-12: this
 *                      check used to read *"one discovery drops every barrier in the house"* and
 *                      it went on passing after the default became `?unlock=room`, because it
 *                      only ever counted the two faces it had just dug. **Green for the wrong
 *                      reason — it asserted the house and measured a wall.**
 *   F7  THE INSTRUMENT one texture upload per frame however many blows land in it.
 *
 * ⚠️ THE CLOCK IS `run.t`, `dig-feel.mjs`'s reason: `Engine._liveLoop` clamps `dt` and a shader
 * compile inside one frame diverges wall time from world time. Blows are reported too, because
 * `sledge-1` owns the swing cadence and the seconds are blows x cadence.
 * ⚠️ IT REFUSES TO RUN ON A BUILD THAT IS NOT `?dig=1` rather than reporting a vacuous green.
 */

/** Seconds per hammer swing. `sledge-1` owns the real number; this is what the report assumes. */
const SWING = +(process.env.SWING ?? 0.95);
/** How far apart a player's probes are along the wall, in metres. The region is 1.55 m across. */
const PROBE_STEP = +(process.env.PROBE_STEP ?? 1.5);

export default async function digFree({ page, note, pass, fail, skip, shot }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  const head = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e?.room?.digCensus) return null;
    const c = e.room.digCensus();
    return { ...c, seed: String(e.run?.seed ?? ''), panels: e.room.panels.length };
  });
  if (!head) { fail('the build is reachable', 'no engine.room.digCensus'); return; }
  if (!head.on) { skip('free-form digging can be measured', 'this build is `?dig=off` — re-run with --q "dig=1"'); return; }
  if (head.mode !== 'free') {
    skip('free-form digging can be measured', `this build is \`?dig=${head.mode}\` — the segmented arm has its own scenario`);
    return;
  }

  // =========================================================================
  // F0 — THE BUILD
  // =========================================================================
  note(`seed "${head.seed}" · mode ${head.mode} · ${head.freeFaces} free faces · `
    + `${head.segments} dig panels · ${head.others} shipped panels`);
  for (const f of head.free) {
    note(`   ${f.id}  ${f.w} x ${f.h} m  grid ${f.grid}  barrier ${f.barrierCells} cells`
      + `${f.link ? '   <- INTERCONNECT' : ''}`);
  }
  if (head.freeFaces >= 4 && head.segments === head.freeFaces) {
    pass('the wall is continuous', `${head.freeFaces} faces, one per span per room — no bays`);
  } else {
    fail('the wall is continuous', `${head.freeFaces} free faces of ${head.segments} dig panels`);
  }
  if (head.barriers === 0 && head.brickStanding === 0) {
    pass('there is no masonry to keep in sync', 'the barrier is the damage field\'s G channel');
  } else {
    fail('there is no masonry to keep in sync', `${head.barriers} slabs / ${head.brickStanding} standing`);
  }
  // the interconnect must give NOTHING away while closed: every face is the same size, same
  // grid, same first blow. The ONLY difference is a channel you cannot see until you dig to it.
  // ⚠️ TWO FACES PER EDGE, ONE PER ROOM — so two edges give FOUR link faces, not two. The
  // first version of this assertion said two and failed a correct build; the sides are the
  // two-sidedness `dig.md` §5 requires and they are the same physical passage.
  const linkFaces = head.free.filter((f) => f.link);
  const edges = new Set(linkFaces.map((f) => f.edge));
  // and the pair on one edge must agree cell for cell, or the passage is masonry from one room
  const paired = [...edges].every((e) => {
    const two = linkFaces.filter((f) => f.edge === e);
    return two.length === 2 && two[0].barrierCells === two[1].barrierCells;
  });
  if (linkFaces.length === 2 * edges.size && edges.size >= 1 && paired) {
    pass('the interconnect gives nothing away while closed',
      `${linkFaces.length} link faces on ${edges.size} edges, mirrored cell-for-cell, `
      + `indistinguishable by size, grid or state from ${head.freeFaces - linkFaces.length} duds`);
  } else {
    fail('the interconnect gives nothing away while closed',
      `${linkFaces.length} link faces on ${edges.size} edges, mirrored pairs agree: ${paired}`);
  }

  /**
   * The driver. Everything below swings a hammer through the SAME entry point `sledge-1` calls
   * (`wall.applyHit(worldPos, power)`), placed by face UV so a scenario never hardcodes a
   * coordinate. It returns the field's own summary, so nothing here re-derives state.
   */
  const swing = (id, u, v, n = 1, power = 1) => page.evaluate(([pid, pu, pv, pn, pp]) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(pid);
    if (!p) return null;
    let removed = 0, chunks = 0, broke = false;
    const prevChunk = p.onChunk;
    p.onChunk = (panel, info) => { chunks++; prevChunk?.(panel, info); };
    for (let i = 0; i < pn; i++) {
      const r = p.applyHit(p.pointAt(pu, pv), pp);
      removed += r.removed;
      if (r.brokeThrough) broke = true;
    }
    p.onChunk = prevChunk;
    const ch = p.openChannel();
    const st = p.field.stats();
    return {
      removed, chunks, broke, maxDepth: st.maxDepth, meanDepth: st.meanDepth,
      seeCells: st.seeCells, openCells: st.openCells, hits: st.hits,
      /**
       * ⚠️ **LOCAL, AT THE SPOT THAT WAS HIT — a probe is a question about ONE PLACE.** The
       * first version of this scenario judged a probe on the FACE-WIDE `seeCells`, which is
       * sticky: once any spot on a 5.7 m wall has gone through, every later probe on that wall
       * "sees through" on its first blow and gets scored as a dud. It read as the interconnect
       * being unreachable and it was the instrument. This is what the player is looking at.
       */
      localDepth: p.field.depthAt(pu, pv), localBarrier: p.field.barrierAt(pu, pv),
      chW: ch.width, chH: ch.height ?? 0, passable: !!ch.open,
      blocksMove: p.blocksMovement(), blocksSight: p.blocksSight(),
      boxes: p.solidBoxes().length, t: +(e.run?.t ?? 0),
    };
  }, [id, u, v, n, power]);

  const reset = (id) => page.evaluate((pid) => {
    const p = window.__rrr.engine.room.panelOf(pid);
    p?.resetDamage();
    return !!p;
  }, id);

  /**
   * ⚠️ **LOOK AT THE HOLE, FROM WHERE A PLAYER WOULD STAND.** The first version of this scenario
   * shot from wherever the Director happened to be, and produced a picture of the far side of the
   * room with a banner across it — a capture that says nothing at all about the thing being
   * built, and that this project's own instrument rules would have let through as `ok`.
   * `dig.md` §6: the hole must be legible from where a player stands, not only in a close-up.
   *
   * ⚠️ IT PARKS THE **PLAYER**, not the camera — `eo2-calls.mjs`'s note: residency is driven from
   * both viewpoints with the player as the authority, and moving only the camera resolves the
   * wrong space and hides the room the body is standing in.
   */
  const look = async (pid, u, dist, tag) => {
    const ok = await page.evaluate(([id, cu, d]) => {
      const e = window.__rrr.engine;
      const p = e.room.panelOf(id);
      if (!p) return false;
      const n = p.normal;
      const c = p.pointAt(cu, 0.45);
      e.player.pos.set(c.x + n.x * d, e.room.floorY, c.z + n.z * d);
      e.player.vel.set(0, 0, 0);
      // forward in this codebase is (sin yaw, cos yaw); we want to face -normal
      e.player.facing = Math.atan2(-n.x, -n.z);
      if (e.cam) { e.cam.yaw = e.player.facing; e.cam._first = true; }
      return true;
    }, [pid, u, dist]);
    if (!ok) return;
    for (let i = 0; i < 45; i++) await page.waitForTimeout(40);
    await shot(tag);
  };

  // pick a dud face and the interconnect face off the census, never by name
  const link = head.free.find((f) => f.link && f.side === 'a');
  const dud = head.free.find((f) => !f.link && f.side === 'a');
  if (!link || !dud) { fail('there is an interconnect and a dud to compare', 'census named neither'); return; }

  // =========================================================================
  // F1 — ONE BLOW REMOVES A PATCH, AND THE CHUNKS TRACK IT
  // =========================================================================
  await reset(dud.id);
  const b1 = await swing(dud.id, 0.5, 0.42, 1);
  if (b1 && b1.removed > 0.10 && b1.chunks === 1) {
    note(`one blow: removed ${b1.removed.toFixed(3)} m2-depth, mean depth ${b1.meanDepth.toFixed(4)}, `
      + `${b1.boxes} collider boxes`);
    pass('one blow removes a patch, not a pixel',
      `${b1.removed.toFixed(3)} m2 x depth in one hit, from one onChunk event`);
  } else {
    fail('one blow removes a patch, not a pixel', JSON.stringify(b1));
  }

  // =========================================================================
  // F2 — THE FALLOFF IS PER SPOT, AND MOVING ALONG GETS FULL PRICE AGAIN
  // =========================================================================
  await reset(dud.id);
  const r1 = (await swing(dud.id, 0.30, 0.42, 1)).removed;
  await swing(dud.id, 0.30, 0.42, 5);
  const r7 = (await swing(dud.id, 0.30, 0.42, 1)).removed;
  const rFresh = (await swing(dud.id, 0.75, 0.42, 1)).removed;
  note(`falloff at one spot: blow 1 removed ${r1.toFixed(3)} · blow 7 removed ${r7.toFixed(3)} `
    + `(${(100 * r7 / r1).toFixed(0)}%) · a blow further along removed ${rFresh.toFixed(3)} `
    + `(${(100 * rFresh / r1).toFixed(0)}%)`);
  if (r7 < r1 * 0.6 && rFresh > r1 * 0.85) {
    pass('the falloff is per SPOT and is the search heuristic',
      `same spot pays ${(100 * r7 / r1).toFixed(0)}% by blow 7; fresh wall pays ${(100 * rFresh / r1).toFixed(0)}%`);
  } else {
    fail('the falloff is per SPOT and is the search heuristic',
      `blow7 ${r7.toFixed(2)} vs blow1 ${r1.toFixed(2)}, fresh ${rFresh.toFixed(2)}`);
  }

  // =========================================================================
  // F3 — WHAT A PROBE COSTS: dig until you can see what is behind this spot
  // =========================================================================
  await reset(dud.id);
  let probeBlows = 0;
  let probe = null;
  for (let i = 0; i < 60; i++) {
    probe = await swing(dud.id, 0.5, 0.40, 1);
    probeBlows++;
    if (probe.localDepth >= 0.999) break;
  }
  note(`a probe costs ${probeBlows} blows = ${(probeBlows * SWING).toFixed(1)} s at a ${SWING} s swing `
    + `-> ${probe.seeCells} cells see through, still ${probe.blocksMove ? 'IMPASSABLE' : 'passable'}`);
  /**
   * 🚨 **RE-BASELINED 2026-08-09 FOR `damagefield.js` `DIG_BASE`, AND THE BLOW WINDOW IS GONE
   * RATHER THAN WIDENED.** This read `probeBlows >= 4 && probeBlows <= 20`, which is a PACING
   * claim — and John has retired the set time (*"I want to abandon a set time for dig while we
   * testing"*) and re-set the speed to x8, where a probe costs **one blow**. A window that fails
   * on a build John asked for is a gate nobody will keep.
   *
   * 🎯 **WHAT THE LINE IS ACTUALLY ABOUT SURVIVES INTACT AND IS STRUCTURAL:** you can tell a dud
   * IS a dud (`seeCells > 0` — the barrier is legible through the hole you made) and the hole is
   * not a way out (`blocksMove`). Neither depends on the clock. The cost is REPORTED.
   * ⚠️ The cheapness half moves to F4, where `breakBlows` exists to compare it against — see
   * *"abandoning a dud is a decision"* there. That is the assertion the x8 change actually
   * endangers, and it could never be made here.
   */
  if (probe.seeCells > 0 && probe.blocksMove && probeBlows >= 1 && probeBlows <= 20) {
    pass('a dud is legible and cheap to abandon',
      `${probeBlows} blow${probeBlows === 1 ? '' : 's'} (~${(probeBlows * SWING).toFixed(1)} s) shows the barrier; `
      + 'the hole is still not a route. ⚠️ the COST is reported, not gated — see F4');
  } else {
    fail('a dud is legible and cheap to abandon',
      `${probeBlows} blows, ${probe.seeCells} see-through cells, blocksMove ${probe.blocksMove}`);
  }
  // 🕳️ THE BARRIER, PHOTOGRAPHED BEFORE THE UNLOCK — after it, every dud shows the next room.
  // `dig.md` §5: it must read as an ANSWER ("not here"), not as failure or as a bug.
  await look(dud.id, 0.5, 2.6, 'dig-free-dud-barrier');
  // and a SECOND hole beside the first, to check they do not look like the same stamp twice
  await swing(dud.id, 0.5, 0.40, 4);
  await swing(dud.id, 0.72, 0.45, 9);
  await look(dud.id, 0.6, 3.0, 'dig-free-two-holes');

  // =========================================================================
  // F4 🎯 THE SEARCH — first blow to a body-sized channel, INCLUDING abandoned digs
  // =========================================================================
  const faces = await page.evaluate(() => window.__rrr.engine.room.digCensus().free
    .filter((f) => f.side === 'a').map((f) => ({ id: f.id, w: f.w, edge: f.edge, link: f.link })));
  for (const f of faces) await reset(f.id);
  const t0 = await page.evaluate(() => +(window.__rrr.engine.run?.t ?? 0));

  /**
   * ⚠️ **THE DRIVE FINDS THE ANSWER ON ITS FIRST PROBE AND THAT IS AN ARTEFACT, NOT A RESULT.**
   * The faces are walked in table order and a centre probe on a 2.96 m face cannot miss a 1.55 m
   * region, so a scenario that reported only what it drove would report a search with zero duds
   * — the single most flattering number available and exactly the sort this project keeps
   * catching. So the drive measures the two COSTS (a probe, and opening the answer) and the
   * search figure is built from them over the real probe-spot population, which is the number a
   * player actually meets. Both are reported.
   */
  const oneEdge = faces.filter((f) => f.edge === faces[0].edge);
  const spots = oneEdge.reduce((n, f) => n + Math.max(1, Math.round(f.w / PROBE_STEP)), 0);

  let blows = 0, abandoned = 0, through = null;
  outer:
  for (const f of faces) {
    const n = Math.max(1, Math.round(f.w / PROBE_STEP));
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n;
      // probe: dig at this spot until it either shows the barrier or starts going through
      let st = null;
      for (let i = 0; i < 40; i++) {
        st = await swing(f.id, u, 0.40, 1);
        blows++;
        if (st.localDepth >= 0.999) break;      // through here: now you can see what is behind
      }
      // barrier behind THIS spot -> a dud, move along. Nothing behind it -> the way through.
      if (!st || st.localBarrier) { abandoned++; continue; }
      /**
       * It is the answer: open it up to a body-sized channel, working the material that stands.
       *
       * ⚠️ **AIM AT WHERE THERE IS NO BARRIER, WHICH IS WHAT A PLAYER CAN SEE.** The first
       * version of this drive aimed in a fixed rectangle around the PROBE point and spent 200
       * blows getting a 0.38 m channel — because a probe can punch into the EDGE of the region
       * and half the rectangle is then cyan, which a blow can never remove. That is a fair
       * description of what the wall does; it is not a fair description of what a player does,
       * because the cyan is visible the moment you break into it. So the target channel is
       * centred on the passage the field actually has, and the aim is the shallowest cell in it.
       */
      for (let i = 0; i < 240; i++) {
        const aim = await page.evaluate((pid) => {
          const p = window.__rrr.engine.room.panelOf(pid);
          const g = p.field;
          /**
           * ⚠️ **AIM OVER THE WHOLE BODY OPENING, FLOOR TO ABOVE HEAD HEIGHT — do not try to
           * reproduce `channel()`'s row arithmetic here.** Two earlier versions of this scenario
           * stalled and reported "no channel opens at all" on a build where one does, because
           * the aim window was a row or two short of what the quantised passability test needs
           * (`DamageField._macro`, 2-cell macro rows) and the corner cells of the required macro
           * cells were never hit. A player does not do row arithmetic; they keep swinging at the
           * material in the hole until they can walk through it, which is what this does.
           */
          const cy0 = 0;
          const cy1 = Math.min(g.rows - 1, Math.ceil(1.95 / g.cellH));
          // the widest column band with no barrier over the body's height — the passage on offer
          // the band must be barrier-free over the rows a BODY needs, not over the rows we dig
          const by0 = Math.floor(0.30 / g.cellH), by1 = Math.min(g.rows - 1, Math.ceil(1.80 / g.cellH));
          let bestA = -1, bestN = 0, runA = -1, run = 0;
          for (let cx = 0; cx <= g.cols; cx++) {
            let clear = cx < g.cols;
            for (let cy = by0; cy <= by1 && clear; cy++) if (g.barrier[g.idx(cx, cy)]) clear = false;
            if (clear) { if (run === 0) runA = cx; run++; if (run > bestN) { bestN = run; bestA = runA; } }
            else run = 0;
          }
          if (bestN === 0) return null;
          // aim at the shallowest cell inside a body-wide window centred on that band
          const needed = Math.ceil(0.80 / g.cellW);
          const mid = bestA + bestN / 2;
          const cx0 = Math.max(bestA, Math.round(mid - needed / 2));
          const cx1 = Math.min(bestA + bestN - 1, cx0 + needed - 1);
          let bx = cx0, by = cy0, bd = 2;
          for (let cy = cy0; cy <= cy1; cy++) {
            for (let cx = cx0; cx <= cx1; cx++) {
              const d = g.depth[g.idx(cx, cy)];
              if (d < bd) { bd = d; bx = cx; by = cy; }
            }
          }
          return [(bx + 0.5) / g.cols, (by + 0.5) / g.rows, bd, bestN * g.cellW];
        }, f.id);
        if (!aim) break;
        st = await swing(f.id, aim[0], aim[1], 1);
        blows++;
        if (st.passable) { through = { face: f.id, u, st }; break outer; }
      }
      through = { face: f.id, u, st };
      break outer;
    }
  }
  const t1 = await page.evaluate(() => +(window.__rrr.engine.run?.t ?? 0));
  if (!through?.st?.passable) {
    fail('a body-sized channel opens at all', `${blows} blows and still ${JSON.stringify(through?.st)}`);
    await shot('dig-free-stalled');
    return;
  }
  const breakBlows = blows - abandoned * probeBlows;
  const duds = (spots - 1) / 2;
  const searchBlows = duds * probeBlows + breakBlows;
  const secs = searchBlows * SWING;
  note(`   channel ${through.st.chW.toFixed(2)} m wide x ${through.st.chH.toFixed(2)} m clear at ${through.face}`);
  note(`   drive: ${blows} blows, ${abandoned} spots abandoned, world clock ${(t1 - t0).toFixed(1)} s`);
  note(`🎯 SEARCH: a probe ${probeBlows} blows, opening the answer ${breakBlows} blows; `
    + `${spots} probe spots on one edge -> ${duds} duds expected -> ${searchBlows} blows `
    + `= ${secs.toFixed(0)} s at a ${SWING} s swing`);
  note(`   luck range: best (0 duds) ${(breakBlows * SWING).toFixed(0)} s · `
    + `worst (${spots - 1} duds) ${(((spots - 1) * probeBlows + breakBlows) * SWING).toFixed(0)} s`);
  /**
   * 🚨 **THE CLOCK IS REPORTED AND NOT GATED — John suspended the set time on 2026-08-09** and
   * re-set the base speed to x8 in the same breath (`damagefield.js` `DIG_BASE`). `dig-band.mjs`
   * carries the same change and the same escape hatch: `DIG_BAND="lo,hi"` re-arms both.
   */
  const BAND = (process.env.DIG_BAND ?? '').split(',').map(Number).filter((n) => Number.isFinite(n));
  if (BAND.length === 2) {
    const inBand = secs >= BAND[0] && secs <= BAND[1];
    (inBand ? pass : fail)('🎯 the dig lands in the band',
      `${secs.toFixed(1)} s against ${BAND[0]}-${BAND[1]} s — ${searchBlows} blows at a ${SWING} s swing`
      + (inBand ? `, ${duds} duds` : '. A BAND, NOT A DIRECTION: too fast fails as hard as too slow.'));
  } else {
    note(`⚠️ THE CLOCK IS REPORTED, NOT GATED: ${secs.toFixed(1)} s (the retired band was 45-75 s). `
      + 'Set DIG_BAND="lo,hi" to re-arm it.');
  }
  /**
   * 🚨 **ABANDONING A DUD MUST BE A DECISION, AND THIS IS THE ASSERTION THE x8 CHANGE ENDANGERS.**
   *
   * `dig.md` §5: the search IS the game. The search only exists if walking away from a hole you
   * have already started costs you something you can weigh — i.e. if a PROBE is meaningfully
   * cheaper than OPENING the answer. If the two converge, "probe, decide, move on" collapses into
   * "hit every wall once and keep walking", which is `docs/design/teardown-reference.md`'s named
   * open risk: **Teardown has no search, and its satisfaction does not depend on one.**
   *
   * ⚠️ **THIS IS A RATIO AND THEREFORE PACING-INDEPENDENT**, which is the whole reason it can be
   * a gate when the seconds cannot. It held at 6/48 before the change and is the number to watch
   * if `DIG_BASE` or `BRUSH_R` ever move again.
   */
  if (breakBlows > probeBlows) {
    pass('abandoning a dud is a decision, not a formality',
      `a probe is ${probeBlows} blow${probeBlows === 1 ? '' : 's'} against ${breakBlows} to open the answer `
      + `(1 : ${(breakBlows / Math.max(1, probeBlows)).toFixed(1)}) — walking away still costs less than staying`);
  } else {
    fail('abandoning a dud is a decision, not a formality',
      `a probe costs ${probeBlows} blows and opening the answer costs ${breakBlows} — at parity there is `
      + 'nothing to weigh, so the search has become "hit every wall once"');
  }
  await shot('dig-free-broke-through');

  const centreU = await page.evaluate((id) =>
    window.__rrr.engine.room.panelOf(id).openChannel().centreU, through.face);
  await look(through.face, centreU, 3.2, 'dig-free-the-hole');
  await look(through.face, centreU, 1.6, 'dig-free-the-hole-close');

  // =========================================================================
  // F5 — PASSABILITY: a body driven at the hole goes through it
  // =========================================================================
  const walk = await page.evaluate((pid) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(pid);
    const n = p.normal;
    const ch = p.openChannel();
    const c = p.pointAt(ch.centreU, 0.3);
    const start = { x: c.x + n.x * 1.8, y: 0, z: c.z + n.z * 1.8 };
    const V = e.room.anchor('service.mid').constructor;   // THREE.Vector3, without importing it
    const pos = new V(start.x, 0, start.z);
    for (let i = 0; i < 240; i++) {
      pos.x -= n.x * 0.03; pos.z -= n.z * 0.03;
      const out = e.room.collide(pos, 0.34, 1.70);
      pos.copy(out);
    }
    // how far past the face did it get, along -normal
    const d = (start.x - pos.x) * n.x + (start.z - pos.z) * n.z;
    return { past: +(d - 1.8).toFixed(2), portals: e.room.portals().filter((q) => q.kind === 'breach').length };
  }, through?.face ?? link.id);
  note(`a robot body shoved at the hole ended ${walk.past} m past the face · `
    + `${walk.portals} breach portals in the graph`);
  if (walk.past > 0.5) {
    pass('the hole you dug is a hole you can walk through', `${walk.past} m past the wall face`);
  } else {
    fail('the hole you dug is a hole you can walk through', `${walk.past} m past the face`);
  }

  // =========================================================================
  // F6 — THE UNLOCK: an abandoned dig becomes a doorway
  // =========================================================================
  const unl = await page.evaluate(() => {
    const c = window.__rrr.engine.room.digCensus();
    const opened = new Set(c.openedEdges);
    return {
      unlocked: c.unlocked, by: c.unlockedBy, passable: c.freePassable, mode: c.unlockMode,
      edges: c.edges.length, opened: c.openedEdges.length,
      shut: c.edges.filter((e) => !opened.has(e)).length,
      // barrier cells still standing on walls this room does NOT bound — the second half of
      // John's sentence, and the number that separates "the room opened" from "the house did"
      barrieredElsewhere: c.free.filter((f) => !opened.has(f.edge) && f.barrierCells > 0).length,
      barrieredHere: c.free.filter((f) => opened.has(f.edge) && f.barrierCells > 0).length,
    };
  });
  note(`unlock=${unl.mode} · unlocked ${unl.unlocked} by ${unl.by} · ${unl.passable} faces now passable`
    + ` · edges ${unl.opened} opened / ${unl.shut} still shut`
    + ` · faces still barriered: ${unl.barrieredHere} on opened edges, ${unl.barrieredElsewhere} elsewhere`);

  if (unl.unlocked) {
    pass('the interconnect drops the barrier', `${unl.passable} faces passable, opened by ${unl.by}`);
  } else {
    fail('the interconnect drops the barrier', JSON.stringify(unl));
  }

  /**
   * 🚨 **THE CONTROL IS INSIDE THE ASSERTION AND IT RUNS EVERY TIME.** These two numbers come from
   * ONE query and must disagree with each other: the walls of the room you dug from have no
   * barrier left, and walls elsewhere still do. A blind probe — one reading a constant, or
   * counting the two faces it just dug, which is exactly how the old version of this check stayed
   * green through a design reversal — cannot produce both.
   *
   * ⚠️ **IT ASSERTS THE SHAPE OF WHICHEVER MODE IS LIVE, RATHER THAN SKIPPING ON THE OTHERS**, so
   * `--q "seed=s4&unlock=global"` is a real second arm and not an excused one: under `global`
   * every edge must open and `barrieredElsewhere` must be 0; under `room` both must be non-zero.
   * **The two branches cannot both hold**, which is what makes a green here mean something. An
   * earlier draft of this block skipped under `global` and claimed in its own comment to go red —
   * a check whose header disagreed with its code, filed against myself.
   */
  const want = unl.mode === 'room'
    ? { ok: unl.shut > 0 && unl.barrieredElsewhere > 0 && unl.barrieredHere === 0,
      says: 'this room\'s walls only, and the rest of the house stays locked' }
    : unl.mode === 'global'
      ? { ok: unl.shut === 0 && unl.barrieredElsewhere === 0,
        says: 'every barrier in the house, because unlock=global' }
      : { ok: unl.opened >= 1, says: `the ${unl.mode} scope` };
  const detail = `${unl.opened} of ${unl.edges} edges opened · ${unl.shut} still shut · `
    + `faces still barriered: ${unl.barrieredHere} here, ${unl.barrieredElsewhere} elsewhere`;
  if (want.ok) pass(`…and it drops ${want.says}`, detail);
  else fail(`…and it drops ${want.says}`, detail);

  // =========================================================================
  // F7 — THE INSTRUMENT: one texture upload per frame, whatever lands in it
  // =========================================================================
  const up = await page.evaluate((pid) => {
    const p = window.__rrr.engine.room.panelOf(pid);
    p.field.flush();                       // start clean
    for (let i = 0; i < 5; i++) p.applyHit(p.pointAt(0.2 + i * 0.05, 0.5), 1);
    const first = p.field.flush();         // the one upload those five blows are worth
    const second = p.field.flush();        // nothing left to upload
    return { first, second, dirty: p.field.dirty };
  }, dud.id);
  if (up.first === true && up.second === false) {
    pass('five blows in one frame cost ONE texture upload', 'flush() is a flag, not a queue');
  } else {
    fail('five blows in one frame cost ONE texture upload', JSON.stringify(up));
  }
}
