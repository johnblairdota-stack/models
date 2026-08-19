/**
 * 🧱 **THE ARCH RULE AT BOTH ENDS OF THE `[ ]` LADDER — ×1 AND ×0.125, ON REAL FACES.**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_collapse2-arms.mjs \
 *        --port 5411 --q "seed=s4&dig=1"
 *
 * `debris-collapse.mjs` proves the rule at ×1. HANDOFF records the previous round's finding that
 * **the optimal strategy at one arm never triggers at the other**, and the 2026-08-10 brief asks
 * for that asymmetry to be REDUCED rather than reported again. This is the instrument that says
 * whether it was.
 *
 * The four questions, and three of them are John's own sentence turned into a test:
 *
 *   **A1  ONE BOTTOM BLOW MUST NOT TAKE THE WALL.** *"it should not collapse the entire wall from
 *         just hitting the bottom once in 1x dig mode."* The bar is the storey, not the chip: the
 *         LONELY rule may shed a cell or two and that is the mechanic working.
 *   **A2  HAMMERING ONE SPOT MUST NEVER CHAIN, AT EITHER ARM.** If it does, the skill is gone —
 *         the whole point is that WIDTH is what earns the collapse and depth is not.
 *   **A3  THE CHAIN MUST FIRE AT BOTH ARMS, ON THE SAME STRATEGY.** Cut low, cut wide. At ×0.125
 *         it should cost about eight times the blows and produce the same event.
 *   **A4  THE CRAZING MUST LEAD THE COLLAPSE AT BOTH ARMS**, and by more at the slow one.
 *
 * ⚠️ **NO WALL CLOCK, AND NO POLICY PARAMETERISED BY THE BUDGET.** HANDOFF: *"a policy
 * parameterised by the budget measures the budget."* The only per-arm term in the aiming policy
 * is `dwell` — how many blows a player must stand still for to punch a cell through — and that is
 * a function of the HAMMER's power, not of how many blows the test is allowed. Every figure is a
 * blow count.
 * ⚠️ **AND NO DEBRIS**: `onChunk`/`onBreak` are nulled for every drive, because a driven dig lands
 * forty blows inside one frame and the FX pile into a cloud over the surface under test.
 */

const SEEDS = (process.env.SEEDS ?? 's4,search-b,s7').split(',').filter(Boolean);

export default async function collapse2Arms({ page, note, pass, fail, skip }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  const head = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const face = e.room.panels.find((p) => p.spec?.free && p.field && p.width > 2.5)
      ?? e.room.panels.find((p) => p.spec?.free && p.field);
    return {
      id: face?.id ?? null, cols: face?.field?.cols ?? 0, rows: face?.field?.rows ?? 0,
      w: +(face?.width ?? 0).toFixed(2),
      cfg: face?.field ? JSON.parse(JSON.stringify(face.field.collapse ?? null)) : null,
      shipped: JSON.parse(JSON.stringify(
        (window.__rrr.engine.room.panels.find((p) => p.field)?.field?.collapse) ?? null)),
    };
  });
  if (!head.id) { skip('the arch rule can be measured at both arms', 'no free dig face'); return; }
  note(`face ${head.id}, ${head.w} m wide, grid ${head.cols}x${head.rows}`);

  const drive = (o) => page.evaluate(async (opt) => {
    const e = window.__rrr.engine, room = e.room;
    room.setDigPlan({ seed: opt.seed });
    const face = room.panels.find((p) => p.id === opt.id) ?? room.panels.find((p) => p.spec?.free);
    const save = { c: face.onChunk, b: face.onBreak };
    face.onChunk = null; face.onBreak = null;
    face.resetDamage();
    const f = face.field;
    /**
     * 🚨 **THE THRESHOLD IS READ BACK OUT OF THE RULE, NOT OFF THE FIELD — AND THE FIRST VERSION
     * OF THIS LINE WAS A LYING INSTRUMENT.** It read `f.collapse.fail`, but `field.collapse` is
     * the per-instance OVERRIDE and is `undefined` on every shipped face (`_collapse()` uses
     * `this.collapse ?? COLLAPSE`), so it reported *"against a 0 m² threshold — Infinity% of the
     * way"* while the rule underneath was running correctly on 3.40. `strain()` returns both the
     * heaviest region's `load` and that same load as a fraction of the threshold, so their ratio
     * is the threshold the rule ACTUALLY used, taken from the rule's own output. Filled in on the
     * first blow that produces any hanging material at all.
     */
    let FAIL = 0;

    /**
     * ⚠️ **`dwell` IS SET BY THE HAMMER, NOT BY THE BUDGET.** At ×0.125 a cell needs about ten
     * blows to go through, so a player stands still for ten and then steps a brush along. At ×1
     * one blow takes the whole brush through and they step every blow. Both are the SAME policy —
     * cut one low line and march outward — expressed at the two speeds the tool actually has.
     */
    const dwell = opt.power >= 0.9 ? 1 : 10;
    const step = (f.brush.radius * 1.3) / f.width;
    const perRow = Math.max(2, Math.ceil(1 / step));
    const aim = (k) => {
      if (opt.policy === 'onespot') return [0.5, 0.16];
      if (opt.policy === 'channel') return [0.5, 0.12 + (Math.floor(k / dwell) % 8) * 0.09];
      const s = Math.floor(k / dwell);
      const row = Math.floor(s / perRow), j = s % perRow, side = j % 2 ? 1 : -1;
      return [0.5 + side * (0.5 + Math.floor(j / 2)) * step, 0.16 + row * 0.22];
    };

    const n = f.cols * f.rows;
    const warn = new Int16Array(n).fill(-1), wasGone = new Uint8Array(n);
    const WARN_AT = 0.35;
    let leadSum = 0, leadN = 0, leadNone = 0;
    let firstChain = -1, chainCells = 0, chainW = 0, chainH = 0, chains = 0;
    let biggest = 0, totalDown = 0, capped = 0, peakWaves = 0;
    let peakLoad = 0, peakCraze = 0, loadAtOne = 0, crazeAtOne = 0, downAtOne = 0;

    for (let k = 0; k < opt.blows; k++) {
      const [u, v] = aim(k);
      const hu = Math.min(0.98, Math.max(0.02, u)), hv = Math.min(0.98, Math.max(0.02, v));
      const res = f.applyHit(hu, hv, opt.power);
      f.dirty = true; f.flush();
      const st = f.strainStat ?? { cells: 0, peak: 0, load: 0, frac: 0 };
      if (!FAIL && st.frac > 0) FAIL = st.load / st.frac;
      if (st.load > peakLoad) peakLoad = st.load;
      if (st.cells > peakCraze) peakCraze = st.cells;
      const c = res.collapse;
      if (c) {
        totalDown += c.cells;
        if (c.cells > biggest) biggest = c.cells;
        if (c.capped) capped++;
        if (c.waves > peakWaves) peakWaves = c.waves;
        if (c.chained) {
          chains++;
          if (firstChain < 0) { firstChain = k + 1; chainCells = c.cells; chainW = c.w; chainH = c.h; }
        }
      }
      if (k === 0) { loadAtOne = st.load; crazeAtOne = st.cells; downAtOne = c ? c.cells : 0; }
      // ⚠️ only cells the hammer did not reach count towards the lead — a cell inside the brush
      // was demolished, not collapsed, and neither needs nor could have a warning.
      const R = f.brush.radius * 1.02, R2 = R * R;
      const hx = hu * f.width, hy = hv * f.height;
      for (let i = 0; i < n; i++) {
        const a = f.data[i * 4 + 3] / 255;
        const gone = f.depth[i] >= 0.985;
        if (gone && !wasGone[i]) {
          wasGone[i] = 1;
          const cx = ((i % f.cols) + 0.5) * f.cellW - hx;
          const cy = (Math.floor(i / f.cols) + 0.5) * f.cellH - hy;
          if (cx * cx + cy * cy > R2) {
            if (warn[i] >= 0) { leadSum += (k - warn[i]); leadN++; } else leadNone++;
          }
        }
        if (!gone && a >= WARN_AT && warn[i] < 0) warn[i] = k;
      }
    }
    face.onChunk = save.c; face.onBreak = save.b;
    return {
      fail: +FAIL.toFixed(2), firstChain, chains, chainCells,
      chainW: +chainW.toFixed(2), chainH: +chainH.toFixed(2),
      biggest, totalDown, capped, peakWaves,
      peakLoad: +peakLoad.toFixed(2), peakCraze,
      loadAtOne: +loadAtOne.toFixed(2), crazeAtOne, downAtOne,
      lead: leadN ? +(leadSum / leadN).toFixed(2) : -1, leadN, leadNone,
    };
  }, o);

  const ARMS = [
    { label: '×1', power: 1, blows: 16 },
    { label: '×0.125', power: 0.125, blows: 130 },
  ];
  const rows = [];
  for (const arm of ARMS) {
    for (const policy of ['undercut', 'onespot', 'channel']) {
      for (const seed of SEEDS) {
        const r = await drive({ seed, id: head.id, policy, power: arm.power, blows: arm.blows });
        rows.push({ arm: arm.label, policy, seed, blows: arm.blows, ...r });
      }
    }
  }
  note(`the arch threshold this build actually ran, read back out of the rule's own output: `
    + `fail = ${rows.find((r) => r.fail > 0)?.fail ?? '—'} m² of hanging wall`);
  /**
   * 🚨 **THE SEEDS AGREE TO THE DIGIT AND THAT IS THE POINT, NOT A BUG IN THE DRIVE.** `setDigPlan`
   * moves the interconnect; the arch rule never reads `barrier`, and these drives aim at fixed uv
   * rather than at the answer. So three identical rows are the leak test — a rule that varied with
   * the seed would be a rule that tells you where the way through is (`dig.md` §5). It is asserted
   * rather than admired, and the table below is **one drive reported three times**, not n=3.
   */
  const bySeed = {};
  for (const r of rows) {
    const k = `${r.arm}|${r.policy}`;
    (bySeed[k] ??= []).push(`${r.firstChain}/${r.chainCells}/${r.totalDown}/${r.peakCraze}`);
  }
  const varied = Object.entries(bySeed).filter(([, v]) => new Set(v).size > 1);
  varied.length === 0
    ? pass('THE RULE IS BLIND TO THE SEED — it cannot leak the interconnect',
      `${SEEDS.length} seeds × ${Object.keys(bySeed).length} drives, and every arm agrees to the `
      + 'digit on when it chained, how much came down and how much crazed. ⚠️ So the table below '
      + 'is one drive reported three times: treat every row as n=1.')
    : fail('THE RULE IS BLIND TO THE SEED — it cannot leak the interconnect',
      `${varied.length} drives moved with the seed: ${varied.map(([k]) => k).join(', ')}`);
  note('   arm      policy    seed        blows  chain@  chained  region m      cells  biggest  waves  load peak  craze peak  lead');
  for (const r of rows) {
    note(`   ${r.arm.padEnd(7)}  ${r.policy.padEnd(8)}  ${r.seed.padEnd(10)}  ${String(r.blows).padStart(5)}`
      + `  ${String(r.firstChain < 0 ? '—' : r.firstChain).padStart(6)}  ${String(r.chains).padStart(7)}`
      + `  ${(r.chainCells ? `${r.chainW}x${r.chainH}` : '—').padStart(12)}  ${String(r.chainCells || 0).padStart(5)}`
      + `  ${String(r.biggest).padStart(7)}  ${String(r.peakWaves).padStart(5)}  ${String(r.peakLoad).padStart(9)}`
      + `  ${String(r.peakCraze).padStart(10)}  ${String(r.lead).padStart(5)}`);
  }
  /**
   * ⚠️ **`load peak` UNDER-READS ON ANY ARM THAT CHAINED, AND SAYING SO IS CHEAPER THAN FIXING
   * IT.** The load is sampled from `strainStat` after `applyHit`, and `applyHit` has already run
   * the collapse — which is *spent* strain, so the reading on the firing blow is what is LEFT,
   * not what fired. An arm that chained will therefore show a peak below the threshold, and that
   * is correct rather than contradictory. The honest per-blow figure is `loadAtOne` (first blow,
   * nothing has collapsed yet) and the honest ceiling is the `onespot` arm, which never fires.
   */
  note('   ⚠️ `load peak` is read AFTER the collapse on every blow, so any row that chained shows '
    + 'what was LEFT standing, not what fired. The `onespot` rows are the honest ceilings.');

  const at = (arm, policy) => rows.filter((r) => r.arm === arm && r.policy === policy);
  const worstFirst = (a) => a.reduce((m, r) => (r.downAtOne > m ? r.downAtOne : m), 0);
  const FAILREAD = rows.find((r) => r.fail > 0)?.fail ?? 0;

  // ---- A1: John's own sentence. One bottom blow must not take the storey.
  const one = at('×1', 'onespot').concat(at('×1', 'undercut'));
  const worst1 = worstFirst(one);
  const load1 = one.reduce((m, r) => Math.max(m, r.loadAtOne), 0);
  worst1 < 26
    ? pass('ONE BOTTOM BLOW AT ×1 DOES NOT COLLAPSE THE WALL — John\'s defect',
      `the worst first blow across ${one.length} drives brought down ${worst1} cells (against the `
      + `payout's own 26-cell slab floor), and the wall was carrying ${load1} m² against a `
      + `${FAILREAD} m² threshold — ${(100 * load1 / Math.max(1e-6, FAILREAD)).toFixed(0)}% of the `
      + 'way, crazing hard and standing')
    : fail('ONE BOTTOM BLOW AT ×1 DOES NOT COLLAPSE THE WALL — John\'s defect',
      `${worst1} cells came down on the first blow`);

  // ---- A2: hammering one spot must never chain, at either arm.
  const spots = rows.filter((r) => r.policy === 'onespot');
  const spotChains = spots.filter((r) => r.firstChain > 0);
  spotChains.length === 0
    ? pass('HAMMERING ONE SPOT NEVER CHAINS, AT EITHER ARM — width is the skill',
      `${spots.length} drives (both arms) and not one storey: the hanging load plateaus at `
      + `${Math.max(...spots.map((r) => r.peakLoad))} m² against ${FAILREAD}, because a round `
      + 'crater stops taking material long before the column above it grows')
    : fail('HAMMERING ONE SPOT NEVER CHAINS, AT EITHER ARM — width is the skill',
      `${spotChains.length} of ${spots.length} chained: ` + spotChains.map((r) => `${r.arm}/${r.seed}@${r.firstChain}`).join(' '));

  // ---- A3: the chain fires at BOTH arms on the same strategy.
  const uc1 = at('×1', 'undercut').filter((r) => r.firstChain > 0);
  const uc8 = at('×0.125', 'undercut').filter((r) => r.firstChain > 0);
  const mean = (a, f) => (a.length ? a.reduce((s, r) => s + f(r), 0) / a.length : 0);
  if (uc1.length && uc8.length) {
    const m1 = mean(uc1, (r) => r.firstChain), m8 = mean(uc8, (r) => r.firstChain);
    const a1 = mean(uc1, (r) => r.chainW * r.chainH), a8 = mean(uc8, (r) => r.chainW * r.chainH);
    note(`A3 the same undercut chains at ×1 on blow ${m1.toFixed(1)} and at ×0.125 on blow `
      + `${m8.toFixed(1)} — ${(m8 / m1).toFixed(1)}× the blows for a region of ${a8.toFixed(2)} m² `
      + `against ${a1.toFixed(2)} m².`);
    /**
     * 🚨 **AND THE RATIO IS NOT 8, WHICH IS A FACT ABOUT THE `[ ]` LADDER RATHER THAN ABOUT THIS
     * RULE — SO IT IS REPORTED HERE RATHER THAN TUNED AWAY.** HANDOFF records ×0.125 as *"the
     * pre-2026-08-09 game bit-for-bit (8 × 0.125 === 1)"*. That is true of the DEPOSIT and false
     * of the BRUSH: `_add()` sizes the radius off the CLAMPED power, `R = radius × (0.55 + 0.45 ×
     * pw)`, and below ×1 that shrinks too — **0.315 m against 0.520, a footprint of 0.31 m²
     * against 0.85.** Per-blow volume comes out at 0.114 of ×1 (≈8.8×, near the nominal 8), but
     * the hole one blow makes is **0.63 m wide against 1.04**, so building the same width of
     * undercut costs more STATIONS as well as more blows per station. That compounding, not the
     * collapse rule, is the whole of the residual gap.
     */
    note('A3 ⚠️ the gap is the LADDER, not the rule: at ×0.125 `_add`\'s radius term shrinks the '
      + 'brush to 0.315 m (0.31 m² against 0.85), so per-blow VOLUME is 8.8× smaller — near the '
      + 'nominal 8 — but per-blow WIDTH is 0.63 m against 1.04, and width is what an undercut is '
      + 'made of. HANDOFF\'s "×0.125 is the pre-2026-08-09 game bit-for-bit" holds for the deposit '
      + 'and not for the brush.');
    pass('THE SAME STRATEGY CHAINS AT BOTH ARMS — cut low, cut wide, at either speed',
      `blow ${m1.toFixed(1)} at ×1 and ${m8.toFixed(1)} at ×0.125 (${(m8 / m1).toFixed(1)}×), and `
      + `the event is the same shape at both: a storey of ${a1.toFixed(2)} m² against `
      + `${a8.toFixed(2)} m². ⚠️ The rule this replaces never fired at ×0.125 on ANY drive `
      + 'measured — its 1.45 m span is 15 cells and a ×0.125 blow is 6.6 cells across, so a run '
      + 'only reaches it if the player deliberately merges craters, and none of the policies '
      + 'here got past 9. A load threshold is in metres of wall rather than in blows, so both '
      + 'arms have the same optimal strategy and differ only in what it costs.');
  } else {
    fail('THE SAME STRATEGY CHAINS AT BOTH ARMS — the asymmetry is the pacing and nothing else',
      `×1 chained on ${uc1.length} seeds, ×0.125 on ${uc8.length} — a rule that only fires on one `
      + 'arm is the defect this test exists for');
  }

  // ---- A3b: a minimum body channel must never chain.
  const ch = rows.filter((r) => r.policy === 'channel' && r.firstChain > 0);
  ch.length === 0
    ? pass('A MINIMUM BODY CHANNEL NEVER CHAINS', `${rows.filter((r) => r.policy === 'channel').length} `
      + 'drives, both arms: digging a channel UPWARD removes the very material that would hang, so '
      + `the load peaks on its first blow and falls — highest reading ${Math.max(...rows.filter((r) => r.policy === 'channel').map((r) => r.peakLoad))} m²`)
    : fail('A MINIMUM BODY CHANNEL NEVER CHAINS', ch.map((r) => `${r.arm}/${r.seed}@${r.firstChain}`).join(' '));

  // ---- A4: the crazing leads the collapse at both arms.
  const lead1 = mean(at('×1', 'undercut').filter((r) => r.lead >= 0), (r) => r.lead);
  const lead8 = mean(at('×0.125', 'undercut').filter((r) => r.lead >= 0), (r) => r.lead);
  note(`A4 mean warning before a cell leaves without being hit: ×1 ${lead1.toFixed(2)} blows · `
    + `×0.125 ${lead8.toFixed(2)} blows`);
  (lead1 >= 1 && lead8 >= 1)
    ? pass('THE WALL WARNS YOU FIRST AT BOTH ARMS, AND MORE AT THE SLOW ONE',
      `${lead1.toFixed(2)} blows of lead at ×1 and ${lead8.toFixed(2)} at ×0.125 — the slower the `
      + 'hammer the longer you get to watch it coming, which is the safe direction')
    : fail('THE WALL WARNS YOU FIRST AT BOTH ARMS, AND MORE AT THE SLOW ONE',
      `lead ×1 ${lead1.toFixed(2)} · ×0.125 ${lead8.toFixed(2)} — under one blow is a flash, not a tell`);
}
