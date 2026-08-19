/**
 * 🧱 **UNSUPPORTED WALL COMES DOWN — DOES IT FIRE, IS IT A SKILL, AND WHAT DOES IT COST?**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/debris-collapse.mjs \
 *        --port 5383 --q "seed=s4&dig=1"
 *
 * John, 2026-08-09: *"extra chunks flying off because it's no longer supported by the rest of the
 * structure… **how effectively they can break down large segments with the least hits**."*
 *
 * Three questions, and the first one kills a whole design if it comes back wrong:
 *
 *   **C1  DOES CONNECTIVITY FIRE ON ANYTHING?** `docs/design/disconnection.md` specifies a flood
 *         fill that drops components not touching the face's border. HANDOFF records it as
 *         *"measured to fire on nothing"* and says not to build it without re-measuring. So this
 *         re-measures it, on the shipped grid, over a whole dig — and it does it on the SAME
 *         drive that the support rule runs on, so the two are directly comparable rather than
 *         argued about.
 *   **C2  DOES SUPPORT FIRE, AND IS IT LEGIBLE?** How often, how much, and — the part that
 *         decides whether it is a mechanic or a decoration — whether the SAME budget of blows
 *         spent differently produces a different wall.
 *   **C3  WHAT DOES IT COST THE CLOCK?** Blows to a body-passable hole with the rule on and with
 *         it ablated, on five seeds. ⚠️ **Reported, not defended** — John, same message: *"I want
 *         to abandon a set time for dig while we testing."*
 *
 * ⚠️ **NO WALL CLOCK ANYWHERE IN THIS FILE.** Every number is a blow count, converted with
 * `WEAPON_COOLDOWN.sledge` imported from `rules.js`. `DamageField._add()` has no time term, so
 * two runs must agree to the digit under any load — `dig-band`'s rule, and this file is its
 * sibling rather than its rival.
 * ⚠️ **AND NO DEBRIS.** `onChunk`/`onBreak` are nulled for the whole drive: a driven dig lands
 * forty blows inside one frame and the FX pile into a cloud over the surface under test.
 * `debris-floor.mjs` is the instrument that looks at the floor, at a real cadence.
 */

import { WEAPON_COOLDOWN } from '../../src/game/rules.js';

const SWING = +(process.env.SWING ?? WEAPON_COOLDOWN.sledge);
const SEEDS = (process.env.SEEDS ?? 's4,search-b,search-c,s1,s7').split(',').filter(Boolean);
const MAXBLOWS = Number(process.env.MAXBLOWS ?? 220);

const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);

export default async function debrisCollapse({ page, note, pass, fail, skip }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  const head = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const c = e.room.panelCensus?.() ?? {};
    const face = e.room.panels.find((p) => p.spec?.free && p.field);
    return {
      mode: c.mode ?? null,
      free: e.room.panels.filter((p) => p.spec?.free).length,
      id: face?.id ?? null,
      cols: face?.field?.cols ?? 0, rows: face?.field?.rows ?? 0,
      cellW: +(face?.field?.cellW ?? 0).toFixed(4),
      hasCollapse: typeof face?.field?._collapse === 'function',
      cfg: face?.field ? JSON.parse(JSON.stringify(face.field.collapse ?? null)) : null,
    };
  });
  if (!head.id) { skip('the collapse rule can be measured', 'no free dig face on this build'); return; }
  note(`${head.free} free faces · grid ${head.cols}x${head.rows} @ ${head.cellW} m/cell`
    + ` · _collapse ${head.hasCollapse ? 'present' : 'MISSING'}`);

  // ---------------------------------------------------------------------------------------
  // The drive. Everything below runs inside ONE page.evaluate per arm so a 200-blow dig is one
  // round trip rather than two hundred.
  // ---------------------------------------------------------------------------------------
  const drive = (opts) => page.evaluate((o) => {
    const e = window.__rrr.engine, room = e.room;
    room.setDigPlan({ seed: o.seed });
    const face = room.panels.find((p) => p.id === o.id) ?? room.panels.find((p) => p.spec?.free);
    if (!face) return { ok: false };
    const saveChunk = face.onChunk, saveBreak = face.onBreak;
    face.onChunk = null; face.onBreak = null;
    face.resetDamage();
    const f = face.field;
    // the arm: null leaves the shipped table alone, an object overrides it on this field only
    const shipped = f.collapse;
    if (o.rule) f.collapse = o.rule;

    /**
     * ⚠️ **THE CONNECTIVITY TEST `disconnection.md` SPECIFIES, RUN ON THE SHIPPED GRID.**
     * Solid = a cell not dug through. A component that never touches the face's border is an
     * island: nothing joins it to the house, so it should fall. Counted at every blow.
     */
    const islands = () => {
      const { cols, rows, depth } = f;
      const GONE = 0.985;
      const seen = new Uint8Array(cols * rows);
      const stack = [];
      let comps = 0, free = 0, freeCells = 0, biggest = 0;
      for (let y0 = 0; y0 < rows; y0++) {
        for (let x0 = 0; x0 < cols; x0++) {
          const i0 = y0 * cols + x0;
          if (seen[i0] || depth[i0] >= GONE) continue;
          comps++;
          let touches = false, n = 0;
          seen[i0] = 1; stack.length = 0; stack.push(x0, y0);
          while (stack.length) {
            const y = stack.pop(), x = stack.pop();
            n++;
            if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) touches = true;
            for (let k = 0; k < 4; k++) {
              const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
              const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
              if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
              const j = ny * cols + nx;
              if (seen[j] || depth[j] >= GONE) continue;
              seen[j] = 1; stack.push(nx, ny);
            }
          }
          if (!touches) { free++; freeCells += n; if (n > biggest) biggest = n; }
        }
      }
      return { comps, free, freeCells, biggest };
    };

    /**
     * 🕸️ **THE STRAIN TELL, READ OFF THE TEXTURE THE SHADER ACTUALLY SAMPLES.** `flush()` writes
     * the A channel and nothing in play reads it, so this is the only honest place to ask "was
     * the player warned" — reading `_strainV` would be reading the probe's own working array.
     */
    const strainRead = () => {
      f.dirty = true; f.flush();
      const { cols, rows, data, depth, barrier } = f;
      let cells = 0, peak = 0, overIC = 0, overCyan = 0, icCells = 0, cyanCells = 0;
      for (let i = 0; i < cols * rows; i++) {
        const a = data[i * 4 + 3] / 255;
        if (depth[i] < 0.985) { if (barrier[i]) cyanCells++; else icCells++; }
        if (a <= 0) continue;
        cells++;
        if (a > peak) peak = a;
        if (barrier[i]) overCyan++; else overIC++;
      }
      return { cells, peak, overIC, overCyan, icCells, cyanCells };
    };

    /**
     * 🎯 **WHERE THE INTERCONNECT IS, SO BOTH ARMS OF THE SKILL TEST DIG IN THE SAME PLACE.**
     * FINDING the answer is a different mechanic with its own gate (`dig-band`); this file asks
     * whether, once you are standing at the right spot, HOW you spend your blows matters. Aiming
     * the two policies at different targets would measure the search and call it skill.
     */
    const icCentre = () => {
      let sx = 0, sy = 0, n = 0;
      for (let y = 0; y < f.rows; y++) {
        for (let x = 0; x < f.cols; x++) {
          if (f.barrier[y * f.cols + x]) continue;
          sx += (x + 0.5) / f.cols; sy += (y + 0.5) / f.rows; n++;
        }
      }
      return n ? [sx / n, sy / n] : [0.5, 0.5];
    };
    const [icu, icv] = o.atIC ? icCentre() : [0.5, 0.5];

    /**
     * Where the next blow lands, 0..1 uv. See C2 and C5.
     *
     * 🚨 **THE `undercut` POLICY USED TO BE PARAMETERISED BY `k / o.blows`, WHICH MADE THE
     * INSTRUMENT READ THE BUDGET INSTEAD OF THE PLAYER.** At a 60-blow budget it widened by a
     * brush every three blows and looked like skill; at 220 it widened by 8 thousandths of the
     * face over the first ten blows, i.e. it hammered ONE SPOT — and C5 duly reported that
     * scattering blows at random cleared wall **12x faster than aiming**, which is not a finding
     * about the game. A competent player's stride is set by the HAMMER, so it is now a fixed step
     * of 1.3 brush radii, alternating sides: the same policy at any budget.
     */
    const stepU = (f.brush.radius * 1.3) / f.width;
    const aim = (k) => {
      if (o.policy === 'centre') return [icu, icv];
      if (o.policy === 'random') {
        // a deterministic scatter over the target; no rng, so two runs agree to the digit
        return [icu + Math.sin(k * 2.399) * 0.18, icv + Math.sin(k * 1.61 + 1.1) * 0.30];
      }
      // 'undercut': one low horizontal line, marched outward from the target a brush at a time.
      // When the line runs off the face it steps up and starts the next course — which is what a
      // player who has learnt the rule does, because the row that just fell is now the support.
      const perRow = Math.max(2, Math.ceil(1 / stepU));
      const row = Math.floor(k / perRow), j = k % perRow;
      const side = j % 2 ? 1 : -1;
      const off = side * (0.5 + Math.floor(j / 2)) * stepU;
      return [icu + off, icv - 0.20 + row * 0.22 + Math.sin(k * 0.9) * 0.03];
    };

    /**
     * 🕸️ **THE LEAD TIME — how many blows of warning the crazing gives before the wall goes.**
     * A tell that arrives on the same blow as the collapse is a flash, not a warning, and this is
     * the number that decides which it is. Tracked per cell against the texture the shader reads.
     */
    const n = f.cols * f.rows;
    const warn = o.strain ? new Int16Array(n).fill(-1) : null;
    const wasGone = o.strain ? new Uint8Array(n) : null;
    const WARN_AT = 0.35;
    let leadSum = 0, leadN = 0, leadNone = 0, peakStrain = 0, peakCraze = 0;
    let strainOverCyan = 0, strainOverIC = 0, icStanding = 0, cyanStanding = 0;

    const log = [];
    let firstIsland = -1, collapses = 0, collapsedCells = 0, biggestCollapse = 0, capped = 0;
    let spanCells = 0, lonelyCells = 0, firstCollapse = -1, passableAt = -1;
    let peakIslands = 0, peakIslandCells = 0, biggestIsland = 0;
    const clearAt = (o.clearAt ?? []).map(() => -1);
    for (let k = 0; k < o.blows; k++) {
      const [u, v] = aim(k);
      const res = f.applyHit(Math.min(0.98, Math.max(0.02, u)), Math.min(0.98, Math.max(0.02, v)), 1);
      if (res.collapse) {
        collapses++;
        collapsedCells += res.collapse.cells;
        spanCells += res.collapse.spanCells;
        lonelyCells += res.collapse.lonelyCells;
        if (res.collapse.cells > biggestCollapse) biggestCollapse = res.collapse.cells;
        if (res.collapse.capped) capped++;
        if (firstCollapse < 0) firstCollapse = k + 1;
      }
      if (o.strain) {
        const s = strainRead();
        if (s.peak > peakStrain) peakStrain = s.peak;
        if (s.cells > peakCraze) peakCraze = s.cells;
        strainOverCyan += s.overCyan; strainOverIC += s.overIC;
        cyanStanding += s.cyanCells; icStanding += s.icCells;
        /**
         * ⚠️ **ONLY CELLS THE HAMMER DID NOT REACH COUNT TOWARDS THE LEAD TIME.** A cell inside
         * the brush was demolished, not collapsed, and it neither needs nor could have a warning
         * — including it would drown the number in the crater the player is standing in front
         * of. The test is the blow's own reach in metres, off the field's own brush.
         */
        const R = f.brush.radius * 1.02, R2 = R * R;
        const hx = Math.min(0.98, Math.max(0.02, u)) * f.width;
        const hy = Math.min(0.98, Math.max(0.02, v)) * f.height;
        for (let i = 0; i < n; i++) {
          const a = f.data[i * 4 + 3] / 255;
          const gone = f.depth[i] >= 0.985;
          if (gone && !wasGone[i]) {
            wasGone[i] = 1;
            const cx = ((i % f.cols) + 0.5) * f.cellW - hx;
            const cy = (Math.floor(i / f.cols) + 0.5) * f.cellH - hy;
            if (cx * cx + cy * cy > R2) {
              // it left without being hit, i.e. it COLLAPSED. Was it crazing first, and how long?
              if (warn[i] >= 0) { leadSum += (k - warn[i]); leadN++; } else leadNone++;
            }
          }
          if (!gone && a >= WARN_AT && warn[i] < 0) warn[i] = k;
        }
      }
      if (o.islands) {
        const is = islands();
        if (is.free > 0 && firstIsland < 0) firstIsland = k + 1;
        if (is.free > peakIslands) peakIslands = is.free;
        if (is.freeCells > peakIslandCells) peakIslandCells = is.freeCells;
        if (is.biggest > biggestIsland) biggestIsland = is.biggest;
      }
      /**
       * 🚨 **`WallPanel` HAS NO `passable()` AND `?.()` RETURNED `undefined` SILENTLY** — so this
       * line read false on every blow of every arm and C3 skipped with *"no seed reached a
       * passable hole"* while `channel()` was reporting **0.833 m** through the same face. An
       * optional call on a method that does not exist is the quietest possible instrument lie.
       * The field's own `channel()` is what `room.js` `pathPortals` filters on, so it is also the
       * right question.
       */
      if (passableAt < 0 && f.channel(0.34, 1.70, 0.30, 0).open) passableAt = k + 1;
      /**
       * 🎯 **"CLEARED" IS SHELL GONE, NOT PASSAGE OPENED, AND THE DIFFERENCE MATTERS HERE.** John
       * asked about *"breaking down large segments"*, and passability is gated on the barrier —
       * so measuring blows-to-PASSABLE would score the two aiming policies partly on where the
       * seed happened to put the interconnect. Cells at full depth are the destructible wall the
       * player actually removed, cyan behind them or not.
       */
      if (o.clearAt) {
        let gone = 0;
        for (let i = 0; i < n; i++) if (f.depth[i] >= 0.985) gone++;
        const m2 = gone * f.cellW * f.cellH;
        for (let t = 0; t < o.clearAt.length; t++) {
          if (clearAt[t] < 0 && m2 >= o.clearAt[t]) clearAt[t] = k + 1;
        }
      }
      if (o.ladder && o.ladder.includes(k + 1)) {
        const st = f.stats();
        log.push({ blow: k + 1, mean: +st.meanDepth.toFixed(3), open: st.openCells });
      }
      if (passableAt > 0 && !o.full) break;
    }
    const st = f.stats();
    const out = {
      ok: true, id: face.id, passableAt, clearAt, target: [+icu.toFixed(3), +icv.toFixed(3)],
      collapses, collapsedCells, biggestCollapse, capped, spanCells, lonelyCells, firstCollapse,
      meanDepth: +st.meanDepth.toFixed(4), openCells: st.openCells, cells: st.cells,
      barrierCells: st.barrierCells,
      firstIsland, peakIslands, peakIslandCells, biggestIsland, log,
      peakStrain: +peakStrain.toFixed(3), peakCraze,
      leadMean: leadN ? +(leadSum / leadN).toFixed(2) : -1, leadN, leadNone,
      // ⚠️ per STANDING cell, or the answer is just "there is more cyan than interconnect"
      crazePerCyan: cyanStanding ? +(strainOverCyan / cyanStanding).toFixed(4) : -1,
      crazePerIC: icStanding ? +(strainOverIC / icStanding).toFixed(4) : -1,
      // the picture and the graph must agree — `openChannel` is what a body walks through
      channel: +(f.channel?.(0.34, 1.70, 0.30, 0)?.width ?? -1).toFixed(3),
    };
    f.collapse = shipped;
    face.onChunk = saveChunk; face.onBreak = saveBreak;
    return out;
  }, opts);

  // =======================================================================================
  // C1 — does the CONNECTIVITY rule fire on anything? (`disconnection.md`, re-measured)
  // =======================================================================================
  const ABLATE = { span: 0, gone: 0.985, lonely: 9, cap: 0 };
  const conn = [];
  for (const seed of SEEDS.slice(0, 3)) {
    const r = await drive({ seed, id: head.id, blows: MAXBLOWS, policy: 'random', islands: true, rule: ABLATE, full: true });
    if (r.ok) conn.push({ seed, ...r });
  }
  for (const c of conn) {
    note(`C1 ${c.seed}: ${MAXBLOWS} blows, collapse ABLATED · severed islands ever: ${c.peakIslands}`
      + ` (${c.peakIslandCells} cells) · first at blow ${c.firstIsland < 0 ? 'never' : c.firstIsland}`
      + ` · mean depth ${c.meanDepth}, ${c.openCells} cells open`);
  }
  /**
   * 🚨 **THE ASSERTION IS ON THE SIZE, NOT ON THE COUNT, AND THE FIRST VERSION OF IT WAS WRONG.**
   *
   * It read *"0 severed components ever"* and it FAILED a good build: connectivity does sever
   * something — **four components totalling 7 cells over 220 blows**, i.e. a largest island of a
   * couple of cells, ~9-18 cm, 0.06 m² across a whole dig. That is a chip at the rim, not
   * `disconnection.md`'s *"the unconnected parts fall to the ground"*, and a binary count cannot
   * tell the two apart. **A rule that has to pay out one big chunk needs an island big enough to
   * BE one**; `views/game.js` will not even spawn a slab under 0.022 m².
   *
   * So the bar is the payout's own floor, in cells, and the number that decides the design is
   * printed next to it: what SUPPORT brings down on the same grid, in a quarter of the blows.
   */
  const CHUNKCELLS = 26;   // ~0.022 m² at 9.25 cm cells — `views/game.js`'s own slab floor
  const worst = conn.reduce((a, c) => Math.max(a, c.peakIslandCells), 0);
  const biggestIsland = conn.reduce((a, c) => Math.max(a, c.biggestIsland ?? 0), 0);
  worst >= CHUNKCELLS
    ? fail('CONNECTIVITY never severs a piece big enough to be a chunk — support is the rule',
      `it severed ${worst} cells (largest component ${biggestIsland}) against a ${CHUNKCELLS}-cell `
      + 'floor — disconnection.md may be buildable after all, re-read it')
    : pass('CONNECTIVITY never severs a piece big enough to be a chunk — support is the rule',
      `${worst} cells EVER severed in ${MAXBLOWS} blows x ${conn.length} seeds, largest component `
      + `${biggestIsland} cells, against a ${CHUNKCELLS}-cell payout floor. A radial dig excavates `
      + 'a bowl: the border ring stays intact, so everything is still joined through the rim.');

  // =======================================================================================
  // C2 — does SUPPORT fire, and is it a SKILL? Same blow budget, three aiming policies.
  // =======================================================================================
  const BUDGET = 60;
  const rows = [];
  for (const policy of ['centre', 'random', 'undercut']) {
    for (const rule of [null, ABLATE]) {
      const r = await drive({ seed: 's4', id: head.id, blows: BUDGET, policy, rule, full: true, atIC: true });
      if (r.ok) rows.push({ policy, arm: rule ? 'ablated' : 'shipped', ...r });
    }
  }
  note('C2 — SIXTY BLOWS, THREE WAYS OF SPENDING THEM (seed s4, one face):');
  note('   policy      arm       collapses  cells down  biggest   mean depth  open cells  channel  passable at');
  for (const r of rows) {
    note(`   ${r.policy.padEnd(10)}  ${r.arm.padEnd(8)}  ${String(r.collapses).padStart(9)}`
      + `  ${String(r.collapsedCells).padStart(10)}  ${String(r.biggestCollapse).padStart(7)}`
      + `  ${String(r.meanDepth).padStart(10)}  ${String(r.openCells).padStart(10)}`
      + `  ${String(r.channel).padStart(7)}  ${String(r.passableAt < 0 ? '—' : r.passableAt).padStart(11)}`);
  }
  const shipped = rows.filter((r) => r.arm === 'shipped');
  const fired = shipped.reduce((a, r) => a + r.collapses, 0);
  fired > 0
    ? pass('SUPPORT fires on a real dig', `${fired} collapses over ${shipped.length} policies · `
      + shipped.map((r) => `${r.policy} ${r.collapses}`).join(' · '))
    : fail('SUPPORT fires on a real dig', 'zero collapses in 180 blows — the rule is inert');

  const cut = shipped.find((r) => r.policy === 'undercut');
  const mid = shipped.find((r) => r.policy === 'centre');
  if (cut && mid) {
    const gain = cut.openCells - mid.openCells;
    gain > 0
      ? pass('WHERE you hit changes how much wall you clear — the skill exists',
        `same 60 blows: undercut opens ${cut.openCells} cells, hammering the middle opens `
        + `${mid.openCells} — ${(cut.openCells / Math.max(1, mid.openCells)).toFixed(2)}x`)
      : fail('WHERE you hit changes how much wall you clear — the skill exists',
        `undercut ${cut.openCells} vs centre ${mid.openCells} cells open — no advantage to aim`);
    const abl = rows.find((r) => r.policy === 'undercut' && r.arm === 'ablated');
    if (abl) {
      note(`C2 the skill is the RULE and not the aim: with the collapse ablated the same undercut `
        + `opens ${abl.openCells} cells against ${cut.openCells} with it on `
        + `(${(cut.openCells / Math.max(1, abl.openCells)).toFixed(2)}x), and the centre policy is `
        + `${mid.openCells} vs ${rows.find((r) => r.policy === 'centre' && r.arm === 'ablated')?.openCells}.`);
    }
  }

  // =======================================================================================
  // C3 — the clock. Blows to a body-passable hole, shipped against ablated, five seeds.
  // ⚠️ REPORTED, NOT DEFENDED. John has asked for the fixed band to be abandoned while testing.
  // =======================================================================================
  const band = [];
  for (const seed of SEEDS) {
    const on = await drive({ seed, id: head.id, blows: MAXBLOWS, policy: 'random', atIC: true });
    const off = await drive({ seed, id: head.id, blows: MAXBLOWS, policy: 'random', rule: ABLATE, atIC: true });
    band.push({ seed, on: on.passableAt, off: off.passableAt, collapses: on.collapses });
  }
  note('C3 — THROUGH, in blows, on the same aiming policy (this is not FIND; see dig-band):');
  note('   seed        shipped   ablated   delta   collapses');
  for (const b of band) {
    const d = b.on > 0 && b.off > 0 ? b.on - b.off : null;
    note(`   ${b.seed.padEnd(10)}  ${String(b.on < 0 ? '—' : b.on).padStart(7)}`
      + `  ${String(b.off < 0 ? '—' : b.off).padStart(7)}`
      + `  ${String(d === null ? '—' : (d > 0 ? '+' : '') + d).padStart(5)}   ${b.collapses}`);
  }
  const ok = band.filter((b) => b.on > 0 && b.off > 0);
  if (ok.length) {
    const mOn = ok.reduce((a, b) => a + b.on, 0) / ok.length;
    const mOff = ok.reduce((a, b) => a + b.off, 0) / ok.length;
    note(`C3 mean THROUGH ${f1(mOn)} blows shipped vs ${f1(mOff)} ablated = `
      + `${f1(mOn * SWING)} s vs ${f1(mOff * SWING)} s at a ${SWING} s swing `
      + `(${((mOn / mOff - 1) * 100).toFixed(0)}%). Reported for John, not defended.`);
    pass('the collapse rule\'s effect on the clock is measured', `${f1(mOn)} vs ${f1(mOff)} blows`);
  } else {
    skip('the collapse rule\'s effect on the clock is measured', 'no seed reached a passable hole');
  }

  // =======================================================================================
  // C5 — 🎯 **THE HEADLINE: BLOWS TO CLEAR, COMPETENT AIM AGAINST RANDOM.**
  //
  // John: *"how effectively they can break down large segments with the least hits."* C2 fixes
  // the blows and measures the wall; this fixes the WALL and measures the blows, which is the
  // form his sentence is in and the only one a player experiences.
  //
  // ⚠️ **BOTH ARMS DIG AT THE SAME SPOT** (`atIC`), so this is not the search. The only variable
  // is the PATTERN: `undercut` works one low line and widens it, `random` scatters the same
  // blows over the same target. If the two numbers are equal, this is an effect and not a
  // mechanic, and the report has to say so.
  // =======================================================================================
  /**
   * ⚠️ **THREE TARGETS, BECAUSE ONE OF THEM IS TOO SMALL TO MEASURE ANYTHING AT ×8.** A single
   * blow's brush is 0.85 m², so "blows to clear a body-sized 1.16 m²" comes out as 1 against 2 —
   * a real 2x, and also two integers a rounding error apart. The larger targets are where a
   * ratio can be trusted, and the small one is kept because it is the hole John actually digs.
   */
  const CLEAR = [1.16, 3.0, 6.0];
  const skill = [];
  for (const seed of SEEDS) {
    for (const policy of ['undercut', 'random']) {
      const r = await drive({
        seed, id: head.id, blows: MAXBLOWS, policy, atIC: true, full: true, clearAt: CLEAR,
      });
      if (r.ok) skill.push({ seed, policy, ...r });
    }
  }
  const ratios = CLEAR.map(() => []);
  for (let t = 0; t < CLEAR.length; t++) {
    note(`C5 — BLOWS TO CLEAR ${CLEAR[t]} m² OF WALL AT THE SAME SPOT:`);
    note('   seed        undercut   random   ratio   through(u)  through(r)');
    for (const seed of SEEDS) {
      const u = skill.find((r) => r.seed === seed && r.policy === 'undercut');
      const r = skill.find((r2) => r2.seed === seed && r2.policy === 'random');
      if (!u || !r) continue;
      const ru = u.clearAt[t], rr = r.clearAt[t];
      if (ru > 0 && rr > 0) ratios[t].push(rr / ru);
      note(`   ${seed.padEnd(10)}  ${String(ru < 0 ? '—' : ru).padStart(8)}  ${String(rr < 0 ? '—' : rr).padStart(7)}`
        + `  ${(ru > 0 && rr > 0 ? (rr / ru).toFixed(2) + 'x' : '—').padStart(6)}`
        + `  ${String(u.passableAt < 0 ? '—' : u.passableAt).padStart(10)}`
        + `  ${String(r.passableAt < 0 ? '—' : r.passableAt).padStart(10)}`);
    }
  }
  const means = ratios.map((a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0));
  const headline = means[means.length - 1] || means[1] || means[0];
  if (headline > 0) {
    headline >= 1.15
      ? pass('AIMING WELL BEATS HAMMERING RANDOMLY, IN BLOWS',
        'random costs ' + CLEAR.map((c, i) => `${means[i] ? means[i].toFixed(2) : '—'}x at ${c} m²`).join(' · ')
        + ' — the undercut is the cheaper way to the same wall')
      : fail('AIMING WELL BEATS HAMMERING RANDOMLY, IN BLOWS',
        `${headline.toFixed(2)}x — the same number of blows either way, so this is an EFFECT and not `
        + 'a mechanic. Say so in the report rather than tuning until it passes.');
  } else {
    skip('AIMING WELL BEATS HAMMERING RANDOMLY, IN BLOWS', 'no arm reached the clearance target');
  }

  // =======================================================================================
  // C6 — 🕸️ **THE STRAIN TELL: does the wall warn you, how early, and does it leak the answer?**
  //
  // Three separate questions and the third one can kill the feature:
  //   · it must FIRE — crazing on material that is about to go;
  //   · it must be EARLY — a tell that lands on the same blow as the collapse is a flash;
  //   · it must NOT correlate with the barrier, or it hands the player the interconnect.
  // =======================================================================================
  const tell = await drive({
    seed: 's4', id: head.id, blows: 40, policy: 'undercut', atIC: true, full: true, strain: true,
  });
  const tellOff = await drive({
    seed: 's4', id: head.id, blows: 40, policy: 'undercut', atIC: true, full: true, strain: true,
    rule: ABLATE,
  });
  note(`C6 crazing: peak ${tell.peakStrain} on up to ${tell.peakCraze} cells at once · `
    + `${tell.leadN} cells fell after a warning, mean lead ${tell.leadMean} blows · `
    + `${tell.leadNone} fell with no warning`);
  note(`C6 per STANDING cell, share crazing: over cyan ${tell.crazePerCyan} · over the `
    + `interconnect ${tell.crazePerIC} — these must be alike or the tell IS the answer`);
  tell.peakCraze > 0
    ? pass('the wall shows STRAIN before it comes down',
      `up to ${tell.peakCraze} cells crazing at once, peak ${tell.peakStrain}`)
    : fail('the wall shows STRAIN before it comes down', 'the A channel never left zero');
  /**
   * 🚨 **VALIDATED BY REINTRODUCTION, IN THE SAME PAGE, ON EVERY RUN.** Three probes on this
   * project have passed against broken builds. Ablating the span rule must take the crazing with
   * it — if it does not, the tell is a second heuristic that merely RESEMBLES the rule, which is
   * the one failure mode that would teach the player a model that is wrong at the margin.
   */
  tellOff.peakCraze < tell.peakCraze * 0.25
    ? pass('the tell IS the rule — ablate the collapse and the crazing goes with it',
      `span on ${tell.peakCraze} cells crazing, span ablated ${tellOff.peakCraze}`)
    : fail('the tell IS the rule — ablate the collapse and the crazing goes with it',
      `${tellOff.peakCraze} cells still craze with the rule ablated — the tell is a separate `
      + 'heuristic and the player would be learning a lie');
  const lead = tell.leadMean;
  lead >= 1
    ? pass('the warning arrives BEFORE the collapse, not with it',
      `${lead} blows of lead on ${tell.leadN} of ${tell.leadN + tell.leadNone} cells that fell`)
    : fail('the warning arrives BEFORE the collapse, not with it',
      `mean lead ${lead} blows — the crack and the collapse land together, so it is a flash`);
  /**
   * 🚨 **THE LEAK TEST IS AN INVARIANCE, NOT A RATE RATIO — AND THE FIRST VERSION OF IT FAILED A
   * CORRECT BUILD FOR A REASON WORTH WRITING DOWN.**
   *
   * It compared "share of standing cyan-backed cells crazing" against the same over the
   * interconnect and read **25x**. That is not a leak, it is the probe measuring its own drive:
   * `atIC` aims every blow at the interconnect, so nearly all of the interconnect's cells are
   * already gone and the handful still standing are exactly the crater rim — where the crazing
   * is — while the cyan denominator is the whole rest of the face. **A rate over a denominator
   * the experiment itself shaped cannot answer a correlation question.**
   *
   * The question the design actually needs answered is *"does the A channel depend on `barrier`
   * at all"*, and that has an exact test: compute the crazing, MOVE the interconnect somewhere
   * else entirely, recompute, and require the bytes to be identical. It cannot be confounded by
   * geometry, it fails loudly the moment anybody adds a `barrier` read to `strain()`, and it is
   * the property `dig.md` §5's search depends on.
   */
  note(`C6 (descriptive, and confounded by the drive — see the source) crazing share per standing `
    + `cell: cyan ${tell.crazePerCyan} · interconnect ${tell.crazePerIC}`);
  const inv = await page.evaluate((id) => {
    const e = window.__rrr.engine;
    const face = e.room.panels.find((p) => p.id === id);
    const f = face.field;
    const save = { c: face.onChunk, b: face.onBreak };
    face.onChunk = null; face.onBreak = null;
    face.resetDamage();
    /**
     * ⚠️ **ONE BLOW, AND THE FIRST VERSION'S TWENTY-FOUR MEASURED NOTHING — WHICH IS A REAL
     * PROPERTY OF THE MECHANIC, NOT A BUG IN THE DRIVE.** Strain is SPENT when it fires: once the
     * run reaches `span` the whole cascade above it drops, so the strained material is gone and
     * the FINAL A channel of a long dig is legitimately empty. A snapshot has to be taken while
     * the wall is still standing and nervous, which is exactly one through-blow.
     */
    f.applyHit(0.5, 0.30, 1);
    f.dirty = true; f.flush();
    const a0 = new Uint8Array(f.cols * f.rows);
    for (let i = 0; i < a0.length; i++) a0[i] = f.data[i * 4 + 3];
    const bar0 = f.barrier.reduce((s, v) => s + v, 0);
    // ⚠️ the barrier is the ROUND's state and two later checks read it, so it is put back below
    const keep = f.barrier.slice();
    // move the answer to the far corner of the face and recompute the crazing on the same dig
    f.setInterconnect(0.14, 0.78, 0.16, 0.24, 3);
    f.dirty = true; f.flush();
    let diff = 0, crazing = 0;
    for (let i = 0; i < a0.length; i++) {
      if (f.data[i * 4 + 3] !== a0[i]) diff++;
      if (a0[i] > 0) crazing++;
    }
    const bar1 = f.barrier.reduce((s, v) => s + v, 0);
    for (let i = 0; i < keep.length; i++) {
      f.barrier[i] = keep[i];
      f.data[i * 4 + 1] = keep[i] ? 255 : 0;
    }
    f.dirty = true; f._touch();
    face.onChunk = save.c; face.onBreak = save.b;
    return { diff, crazing, bar0, bar1, cells: a0.length };
  }, head.id);
  note(`C6 invariance: moved the interconnect (${inv.bar0} → ${inv.bar1} barrier cells of `
    + `${inv.cells}) under an unchanged dig · ${inv.diff} of ${inv.crazing} crazing bytes moved`);
  (inv.crazing > 0 && inv.diff === 0)
    ? pass('the crazing cannot give away the interconnect',
      `the answer moved (${inv.bar0} → ${inv.bar1} barrier cells) and all ${inv.crazing} crazing `
      + 'bytes are byte-identical — the A channel is a pure function of depth')
    : (inv.crazing === 0
      ? skip('the crazing cannot give away the interconnect', 'the control dig produced no crazing')
      : fail('the crazing cannot give away the interconnect',
        `${inv.diff} bytes changed when only the barrier moved — the tell reads the answer`));

  // =======================================================================================
  // C7 — 🚨 **THE CYAN IS INDESTRUCTIBLE AND A COLLAPSE MUST NOT TOUCH IT.** Settled twice by
  // John. A collapse writes `depth`, which is how far through the DESTRUCTIBLE shell the dig has
  // got — so the test is that no barrier cell becomes passable and that the barrier count is
  // untouched by however much wall came down in front of it.
  // =======================================================================================
  const cyan = await page.evaluate((id) => {
    const e = window.__rrr.engine;
    const face = e.room.panels.find((p) => p.id === id);
    const f = face.field;
    let barrierBefore = 0;
    for (let i = 0; i < f.barrier.length; i++) barrierBefore += f.barrier[i];
    // drive hard along one low line — the pattern that unzips the most wall
    f.resetDamage?.(); face.resetDamage?.();
    let collapsed = 0;
    for (let k = 0; k < 90; k++) {
      const r = f.applyHit(0.10 + (k % 24) * 0.034, 0.20 + (k % 3) * 0.04, 1);
      if (r.collapse) collapsed += r.collapse.cells;
    }
    let barrierAfter = 0, passableOverBarrier = 0, deepOverBarrier = 0;
    for (let i = 0; i < f.barrier.length; i++) {
      barrierAfter += f.barrier[i];
      if (!f.barrier[i]) continue;
      if (f.depth[i] >= 0.999) deepOverBarrier++;
      if (f.passable(i)) passableOverBarrier++;
    }
    return { barrierBefore, barrierAfter, passableOverBarrier, deepOverBarrier, collapsed };
  }, head.id);
  note(`C7 90 blows along one low line: ${cyan.collapsed} cells brought down · barrier cells `
    + `${cyan.barrierBefore} → ${cyan.barrierAfter} · ${cyan.deepOverBarrier} cells dug clean `
    + `through TO the cyan · ${cyan.passableOverBarrier} passable THROUGH it`);
  (cyan.passableOverBarrier === 0 && cyan.barrierAfter === cyan.barrierBefore)
    ? pass('a collapse never breaks the cyan',
      `${cyan.collapsed} cells collapsed, ${cyan.deepOverBarrier} of them down to the barrier, and `
      + `0 became passable; the barrier count is unchanged at ${cyan.barrierAfter}`)
    : fail('a collapse never breaks the cyan',
      `${cyan.passableOverBarrier} passable cells over barrier, count ${cyan.barrierBefore} → `
      + `${cyan.barrierAfter}`);

  // =======================================================================================
  // C4 — the graph agrees with the picture, and rubble blocks nothing.
  //
  // ⚠️ **THE OLD FORM OF THIS CHECK COULD NOT FAIL** — it passed either when the route existed
  // OR when the face was closed, and the drive above it left the face closed on every run, so it
  // had never once tested the thing it is named after. It now OPENS the face first.
  // =======================================================================================
  const opened = await page.evaluate((id) => {
    const e = window.__rrr.engine;
    const face = e.room.panels.find((p) => p.id === id);
    const f = face.field;
    const save = { c: face.onChunk, b: face.onBreak };
    face.onChunk = null; face.onBreak = null;
    face.resetDamage();
    // aim at the interconnect and widen: this is the drive that actually gets a body through
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < f.rows; y++) {
      for (let x = 0; x < f.cols; x++) {
        if (f.barrier[y * f.cols + x]) continue;
        sx += (x + 0.5) / f.cols; sy += (y + 0.5) / f.rows; n++;
      }
    }
    const cu = n ? sx / n : 0.5, cv = n ? sy / n : 0.5;
    let collapsed = 0, blows = 0, at = -1;
    for (let k = 0; k < 120 && at < 0; k++) {
      const side = k % 2 ? 1 : -1;
      const reach = Math.min(1, (k / 40) * 1.35);
      const r = f.applyHit(
        Math.min(0.98, Math.max(0.02, cu + side * reach * 0.13)),
        Math.min(0.98, Math.max(0.02, cv - 0.20 + Math.sin(k * 0.9) * 0.045)), 1);
      if (r.collapse) collapsed += r.collapse.cells;
      blows = k + 1;
      if (f.channel(0.34, 1.70, 0.30, 0).open) at = k + 1;
    }
    face.onChunk = save.c; face.onBreak = save.b;
    return { collapsed, blows, at, passable: f.channel(0.34, 1.70, 0.30, 0).open };
  }, head.id);
  note(`C4 drove the face open: ${opened.blows} blows, ${opened.collapsed} cells collapsed, `
    + `passable at ${opened.at < 0 ? 'never' : opened.at}`);

  const agree = await page.evaluate((id) => {
    const e = window.__rrr.engine, room = e.room;
    const face = room.panels.find((p) => p.id === id);
    const f = face.field;
    const ch = f.channel?.(0.34, 1.70, 0.30, 0) ?? null;
    const out = { id, passable: !!ch?.open, channel: +(ch?.width ?? -1).toFixed(3), channelOpen: !!ch?.open };
    const a = face.spec?.a, b = face.spec?.b;
    out.pair = [a, b];
    if (a && b && room.pathPortals) {
      const r = room.pathPortals(a, b, 0.68, 1.70);
      out.route = Array.isArray(r) ? r.map((x) => x?.id ?? String(x)) : r;
    }
    // debris must never be in the collision set: count colliders whose owner is a debris mesh
    let debrisColliders = 0;
    const boxes = room.solidBoxes?.() ?? [];
    for (const bx of boxes) if (/debris|chunk|rubble/i.test(bx?.id ?? bx?.name ?? '')) debrisColliders++;
    out.debrisColliders = debrisColliders;
    out.pileDepth = +(e.debris?.pileDepth ?? -1).toFixed(3);
    return out;
  }, head.id);
  note(`C4 ${agree.id}: passable ${agree.passable} · channel ${agree.channel} m · pair `
    + `${JSON.stringify(agree.pair)} · route ${JSON.stringify(agree.route ?? null)}`
    + ` · debris colliders ${agree.debrisColliders} · pile depth ${agree.pileDepth} m`);
  agree.debrisColliders === 0
    ? pass('the rubble is a look system and blocks nothing', '0 debris colliders in the solid set')
    : fail('the rubble is a look system and blocks nothing', `${agree.debrisColliders} debris colliders`);

  /**
   * 🚨 **BOTH DIRECTIONS, AND NEITHER IS OPTIONAL.** A collapse can open a route nobody dug —
   * that is intended and it is the point of one grid — but this project has already shipped one
   * softlock where the picture and the rule disagreed, so the check has to be an IFF: open ⇒
   * routed, and closed ⇒ refused. The old version accepted "closed" unconditionally and the
   * drive above it always left the face closed, so it had never tested anything.
   */
  if (!opened.passable) {
    skip('the graph agrees with the picture after a collapse',
      `the drive could not open ${head.id} in ${opened.blows} blows — nothing to check`);
  } else if (Array.isArray(agree.route) && agree.route.length > 0) {
    pass('the graph agrees with the picture after a collapse',
      `${opened.collapsed} cells came down, ${agree.channel} m of channel, and pathPortals routes `
      + `it: ${JSON.stringify(agree.route)}`);
  } else {
    fail('the graph agrees with the picture after a collapse',
      `the face is passable with a ${agree.channel} m channel and pathPortals will not route it — `
      + 'that is the softlock shape, not a cosmetic disagreement');
  }
}
