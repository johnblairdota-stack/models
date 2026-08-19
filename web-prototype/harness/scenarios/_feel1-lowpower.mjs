/**
 * 🔬 **DOES THE RESCALED DIG LADDER MAKE `twoside-1`'s LATENT COUPLING DEFECT LIVE?**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_feel1-lowpower.mjs \
 *        --port 5411 --q "seed=s4&dig=1"
 *
 * 🚨 **THIS FILE REPORTS ONE FAILURE ON A CORRECT TREE, AND THE FAILURE IS THE RESULT.** Same
 * shape as `_pf1-diag.mjs`, which reports two for the same reason: its assertion is written to
 * CONFIRM a defect and will invert once the defect is gone. **Do not "repair" what it points at
 * from this file** — the fix is `_couple()`'s "mirror only past `OPEN_AT`" rule and lives in
 * `wall.js` / `breakmask.js`, which belong to `twoside-1`. Measured 2026-08-10:
 *
 *   | rung | `power` | ΔGRID | near face PARTIAL | twin PARTIAL |
 *   |---|---|---|---|---|
 *   | ×2 (the old ×1, and what every gate drives) | 1.0 | **0.119%** | 0.12% | 0% |
 *   | ×1.5 | 0.75 | **0.119%** | 0.12% | 0% |
 *   | **×1 — the NEW DEFAULT** | 0.5 | **4.405%** | 4.4% | 0% |
 *   | ×0.5 | 0.25 | **33.452%** | 33.33% | 0% |
 *   | ×0.25 | 0.125 | **44.643%** | 47.14% | 0% |
 *
 * 🎯 **THE TWIN'S `PARTIAL` IS 0% ON EVERY ROW, WHICH IS THE MECHANISM STATED AS A NUMBER.** The
 * twin only ever receives cells that were already past `OPEN_AT`, so it can only ever be binary;
 * what changes down the ladder is how much of the near face is NOT binary. Above ×1.5 that is
 * 0.12% and the two grids agree to one cell; at the new base it is 4.4% and they disagree over
 * 4.4% of the wall; at the bottom rung the near face carries a 47% graded crater and **the twin
 * is untouched — GONE 0% on both sides, i.e. a metre of visibly dug wall that the next room does
 * not know about at all.**
 *
 * ⚠️ **A DIAGNOSTIC, NOT A GATE, AND IT DOES NOT OWN THE ANSWER.** `harness/scenarios/two-sided.mjs`
 * is `twoside-1`'s instrument and the authority on ΔGRID; this file exists only because that one
 * drives `panel.applyHit(point, 1)` with no power knob, and the question asked of `feel-1` is
 * specifically **what happens at a LOWER power**. Nothing here may be read as replacing its
 * numbers — the ×2 row below is here to be checked against them.
 *
 * ---------------------------------------------------------------------------------------------
 * **THE FINDING BEING TESTED** (`twoside-1`, 2026-08-10): *"`PARTIAL` is empty on every face
 * measured. At `DIG_BASE` 8 one blow goes clean through, so both grids are binary and
 * `_couple()`'s 'mirror only past `OPEN_AT`' costs nothing. At lower power it would not be —
 * near face a graded crater, twin a stamped binary hole."*
 *
 * `feel-1` rescaled the `[ ]` ladder to John's numbers on the same day (*"the current .5 should
 * be the 1x"*), which halves the power the DEFAULT rung sends and takes the bottom rung to an
 * eighth of it. So the question is not academic: it is whether the shipped default now sits
 * below the line where a blow stops being binary.
 *
 * ---------------------------------------------------------------------------------------------
 * **HOW A RUNG IS REPRODUCED WITHOUT A POWER ARGUMENT, AND THIS IS THE PART TO CHECK.**
 * `_add()` splits `power` two ways and BOTH have to be reproduced or this measures a fiction:
 *
 *   · the deposit scales by `brush.base × power` — so `base = DIG_BASE × power` at `power = 1`.
 *   · the radius is `brush.radius × (0.55 + 0.45 × min(1, power))` — so `radius` is pre-set to
 *     the value that formula gives at the rung's own power, and left alone at `power = 1`.
 *
 * Set both on BOTH faces of the pair (the twin has its own field and its own brush) and drive
 * at `power = 1`, and the field sees exactly what the rung sends. The ×2 row is `base` 8 /
 * `radius` 0.520, i.e. the shipped drive unchanged, and is the control: if it does not land on
 * `two-sided.mjs`'s recorded 0.119–0.208% floor, this file's reproduction is wrong and no other
 * row in it means anything.
 *
 * ⚠️ **AND THE CONTROL THAT MUST FAIL IS THE ONE `two-sided.mjs` LEARNED THE HARD WAY.** Its own
 * first control was *"dig one side further and ΔGRID must rise"* — which **failed on a good
 * tree**, because with `_couple()` working ΔGRID is already at the one-cell floor and cannot
 * rise. So the arm asserted here is not "the number moves"; it is that the u-flip matters
 * (`gridDelta(..., flip=false)` must disagree wildly on an off-centre crater), which is a
 * property of the comparison rather than of the coupling and can therefore be false.
 */

const GRID_EPS = 0.10;        // two-sided.mjs's own epsilon, so the numbers are comparable
const BLOWS = 26;
const DIG_BASE = 8;           // damagefield.js, restated so the page needs no import
const BRUSH_R = 0.520;        // the nominal brush radius at power >= 1
/** `views/game.js`'s ladder after the 2026-08-10 rescale: label -> `_add()`'s `power`. */
const RUNGS = [
  { label: 0.25, power: 0.125 },
  { label: 0.5, power: 0.25 },
  { label: 1, power: 0.5 },
  { label: 1.5, power: 0.75 },
  { label: 2, power: 1.0 },
];

export default async function feel1LowPower({ page, note, pass, fail, skip }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  /**
   * 🚨 **THE PAIR IS THE ONE WITH THE MOST BARRIER-FREE CELLS, AND THE CRATER GOES AT THEIR
   * CENTROID — BOTH COPIED FROM `two-sided.mjs`, AND THE FIRST DRAFT OF THIS FILE GOT IT WRONG.**
   * Digging at an arbitrary `u` puts the crater in CYAN, which is indestructible and does not
   * couple, so the near face fills up and the twin never hears about it: the ×2 control read
   * **46.8%** against the 0.119–0.208% floor it had to reproduce, and the guard below correctly
   * refused to report any of the low rungs off the back of it. A tool that cannot reproduce the
   * known number is not measuring the thing the known number is about.
   */
  const pair = await page.evaluate(() => {
    const e = window.__rrr.engine, room = e.room;
    let best = null;
    for (const p of room.panels) {
      if (!p.spec?.free || !p.field || !p.twin?.field) continue;
      if (p.twin.field.cols !== p.field.cols || p.twin.field.rows !== p.field.rows) continue;
      const g = p.field;
      let n = 0;
      for (let i = 0; i < g.barrier.length; i++) if (!g.barrier[i]) n++;
      if (!best || n > best.freeCells) {
        best = { a: p.id, b: p.twin.id, cols: g.cols, rows: g.rows, width: +p.width.toFixed(2), freeCells: n };
      }
    }
    return best;
  });
  if (!pair) { skip('the ladder does not un-couple the two sides of a wall', 'no free dig face with a same-sized twin on this build'); return; }
  note(`pair ${pair.a} / ${pair.b} · ${pair.cols}×${pair.rows} cells over ${pair.width} m · ${pair.freeCells} barrier-free cells`);

  /**
   * One rung: reset the house, set both fields' brushes to the rung, dig an OFF-CENTRE crater on
   * face `a` only, then read the two grids cell for cell with `b` u-mirrored.
   * ⚠️ Off-centre on purpose — a crater at u 0.5 is its own mirror image and the flip control
   * below would be unable to see a mirroring bug at all.
   */
  const run = ({ base, radius }) => page.evaluate(({ a, b, base, radius, blows, eps }) => {
    const e = window.__rrr.engine, room = e.room;
    e.resetRound();
    const pa = room.panelOf(a), pb = room.panelOf(b);
    for (const p of [pa, pb]) { p.field.brush.base = base; p.field.brush.radius = radius; }
    const keep = { c: pa.onChunk, k: pa.onBreak };
    pa.onChunk = null; pa.onBreak = null;                 // this file photographs the WALL
    const g = pa.field;
    // `two-sided.mjs`'s `target()`: the centroid of the barrier-FREE cells, i.e. the interconnect
    // — the only part of the face a dig can go THROUGH, and therefore the only part `_couple()`
    // has anything to mirror. It is off centre by construction, which is what the flip control
    // below needs. See the note on `pair` above for what digging anywhere else measures instead.
    let nf = 0, su = 0;
    for (let cy = 0; cy < g.rows; cy++) {
      for (let cx = 0; cx < g.cols; cx++) {
        if (g.barrier[g.idx(cx, cy)]) continue;
        su += (cx + 0.5) / g.cols; nf++;
      }
    }
    const cu = nf ? su / nf : 0.34;
    const cx0 = Math.max(0, Math.floor((cu - 0.52 / pa.width) * g.cols));
    const cx1 = Math.min(g.cols - 1, Math.ceil((cu + 0.52 / pa.width) * g.cols));
    const cy0 = Math.max(0, Math.floor(0.30 / g.cellH));
    const cy1 = Math.min(g.rows - 1, Math.ceil(1.60 / g.cellH));
    for (let k = 0; k < blows; k++) {
      let bx = cx0, by = cy0, bd = 2;
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const d = g.depth[g.idx(cx, cy)];
          if (d < bd) { bd = d; bx = cx; by = cy; }
        }
      }
      pa.applyHit(pa.pointAt((bx + 0.5) / g.cols, (by + 0.5) / g.rows), 1);
    }
    pa.onChunk = keep.c; pa.onBreak = keep.k;
    g.flush(); pb.field.flush();

    const delta = (flip) => {
      const f = pa.field, h = pb.field;
      let n = 0, bad = 0, sum = 0;
      for (let cy = 0; cy < f.rows; cy++) {
        for (let cx = 0; cx < f.cols; cx++) {
          const d = Math.abs(f.depth[f.idx(cx, cy)] - h.depth[h.idx(flip ? h.cols - 1 - cx : cx, cy)]);
          sum += d; n++; if (d > eps) bad++;
        }
      }
      return { cells: n, disagree: +(100 * bad / n).toFixed(3), meanAbs: +(sum / n).toFixed(4) };
    };
    /** GONE / PARTIAL / INTACT on one face, as fractions of its own grid. */
    const zones = (p) => {
      const f = p.field;
      let gone = 0, part = 0;
      for (let i = 0; i < f.depth.length; i++) {
        if (f.depth[i] >= 0.999) gone++;
        else if (f.depth[i] > 0.05) part++;
      }
      return { gone: +(100 * gone / f.depth.length).toFixed(2), partial: +(100 * part / f.depth.length).toFixed(2) };
    };
    return { flip: delta(true), noflip: delta(false), a: zones(pa), b: zones(pb) };
  }, { a: pair.a, b: pair.b, base, radius, blows: BLOWS, eps: GRID_EPS });

  const rows = [];
  for (const r of RUNGS) {
    const base = DIG_BASE * r.power;
    const radius = BRUSH_R * (0.55 + 0.45 * Math.min(1, r.power));
    const out = await run({ base, radius });
    rows.push({ ...r, base, radius, ...out });
    note(`x${String(r.label).padEnd(4)} (power ${r.power}, base ${base}, brush ${(radius * 2).toFixed(2)} m across)`
      + ` → 🎯 ΔGRID ${out.flip.disagree}% of ${out.flip.cells} cells, mean |Δ| ${out.flip.meanAbs}`
      + ` · near face GONE ${out.a.gone}% PARTIAL ${out.a.partial}% · twin GONE ${out.b.gone}% PARTIAL ${out.b.partial}%`);
  }

  const top = rows[rows.length - 1];         // x2 — the shipped drive, unchanged
  const bottom = rows[0];                    // x0.25 — the ladder's floor
  const base1 = rows.find((r) => r.label === 1);

  // ---- the control that must be able to fail: the u-flip has to matter on this crater.
  note(`control (ΔGRID computed WITHOUT the u-flip, x2 arm): ${top.noflip.disagree}% against ${top.flip.disagree}% with it`);
  if (!(top.noflip.disagree > top.flip.disagree + 1)) {
    fail('the ladder does not un-couple the two sides of a wall',
      `the crater is symmetric enough that mirroring changes nothing (${top.flip.disagree}% vs ${top.noflip.disagree}%) — this comparison cannot see a mirroring difference, so no row above means anything`);
    return;
  }
  if (top.flip.disagree > 1.0) {
    fail('the ladder does not un-couple the two sides of a wall',
      `the x2 CONTROL row already reads ${top.flip.disagree}% — that is the shipped drive and two-sided.mjs records 0.119–0.208% for it, so this file is not reproducing the rung correctly and nothing below it is evidence`);
    return;
  }

  const worst = Math.max(...rows.map((r) => r.flip.disagree));
  note(`🎯 PARTIAL first becomes non-empty at x${(rows.find((r) => r.a.partial > 1) ?? {}).label ?? '—'}`
    + ` — the near face's crater stops being binary there, which is the condition twoside-1 named`);
  if (worst > 1.0) {
    fail('the ladder does not un-couple the two sides of a wall',
      `ΔGRID rises to ${worst}% at the low rungs against ${top.flip.disagree}% at x2 — the two sides of a wall stop agreeing below the power at which one blow goes clean through. `
      + `x0.25 ${bottom.flip.disagree}% · x1 (the new BASE) ${base1.flip.disagree}% · x2 ${top.flip.disagree}%. ⚠️ REPORTED FOR twoside-1, NOT FIXED HERE — the fix is in \`_couple()\`'s mirror rule and \`wall.js\`/\`breakmask.js\` are not this slice's files`);
  } else {
    pass('the ladder does not un-couple the two sides of a wall',
      `ΔGRID stays at the one-cell floor across the whole rescaled ladder: x0.25 ${bottom.flip.disagree}% · x1 (the new BASE) ${base1.flip.disagree}% · x2 ${top.flip.disagree}%, `
      + `even though the near face's PARTIAL band goes ${top.a.partial}% → ${bottom.a.partial}%. The mirror is not depending on the crater being binary`);
  }
}
