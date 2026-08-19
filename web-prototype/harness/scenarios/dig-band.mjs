/**
 * ⏱️ **THE DIG BAND, RE-MEASURED IN THE ROOMS THAT SHIP — TWO CLOCKS, PER SPACE, PER SEED.**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/dig-band.mjs \
 *        --port 5321 --q "seed=s4&dig=1"
 *
 * John, 2026-08-08: *"lets go about a minute to dig into another room."* `dig-free.mjs` reads
 * 15/15 against a 45–75 s band — but **every figure behind that band was taken before the estate
 * rooms were ported into the playable slice**, and nobody had re-measured it since. This is that
 * re-measurement.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ **TWO CLOCKS, AND CONFLATING THEM IS HOW A BAND GETS MIS-TUNED**
 * ---------------------------------------------------------------------------
 *   **FIND**    the search: blows spent on duds before you are standing at the answer.
 *               🚨 **THIS ONE HAS A BAND, NOT A DIRECTION** (`dig.md` §5: the search IS the
 *               game). Driving it down is deleting the mechanic. It is never "improved".
 *   **THROUGH** first blow at the right spot to a passable hole. A cost, not a puzzle.
 *
 * `dig-free.mjs` F4 reports one number built from both. This file reports them apart and then
 * adds them, so a retune can move the one that is actually out of band.
 *
 * ---------------------------------------------------------------------------
 * 🚨 **WHAT x8 DID TO THE SEARCH — MEASURED 2026-08-09 (`pace-2`), AND IT IS A FINDING FOR JOHN,
 * NOT A NUMBER TO TUNE AWAY**
 * ---------------------------------------------------------------------------
 * `docs/design/teardown-reference.md` names this as the open risk of `DIG_BASE` = 8: *"Teardown
 * has no search… ours has to keep 'they are trying to find the doorway hidden behind the wall'
 * alive at 1-3 hits per probe, and this should be measured, not assumed."* It is now measured,
 * five seeds x six spaces, and this is the whole answer:
 *
 *   · **A PROBE COSTS EXACTLY 1 BLOW, IN EVERY ROOM, ON EVERY SEED** — the `probe blows` column
 *     reads `1-1 (1)` on all 30 rows. It was a remarkably stable **6.14-6.29** before. One blow
 *     takes every cell in the brush clean through, so *seeing what is behind a spot* is now the
 *     cheapest action in the game.
 *   · **THE SEARCH IS STRUCTURALLY INTACT AND IT DID NOT MOVE, BECAUSE IT IS GEOMETRY.** The
 *     interconnect still covers **32%** of probe spots (68% duds), the five seeds still produce
 *     **30 distinct winning-spot sets in 30 rows**, and `IC_W` never moved. Nothing about
 *     *where* the answer hides changed.
 *   · **WHAT COLLAPSED IS THE PRICE OF BEING WRONG.** FIND is **0.0-3.6 s** house-wide
 *     (chapel 0.0-0.5 · gallery 0.8-1.7 · ballroom 1.2-1.9 · service 2.1-3.6 · study_e 2.7-3.6
 *     · study_w 3.2), against 11.7-27.9 s before. TOTAL medians are **2.4 / 3.6 / 3.8 / 5.5 /
 *     6.0 / 6.4 s**, i.e. 9.4x-25.3x under the retired 60 s target. `dig-free.mjs` puts the
 *     dud:answer ratio at **1 : 3.0**, where it used to be 6 : 49.
 *   · 🎯 **AND THE PROBE_STEP TRADE HAS INVERTED, WHICH IS THE PART A DESIGNER SHOULD SEE.**
 *     Under the old pacing, probing FINER cost you: 1.0 m read 62.4 / 70.7 / 66.8 s against
 *     1.5 m's 61.8 / 64.6 / 60.8 — thoroughness was paid for. At x8 the B4 table reads 1.0 m
 *     **equal or FASTER than 1.5 m in four of six rooms**, because more spots raise K and the
 *     `(N-K)/(K+1)` denominator eats the extra probes. **Over-probing is no longer punished.**
 *
 * 🚨 **SO, PLAINLY: THE SEARCH EXISTS AND IT IS NO LONGER A COST. It is ~3 swings of tapping
 * along a wall, and in the chapel it is under half a second.** That is a design call for John —
 * the knob is `dig.js` `IC_W` (how much wall the answer covers) and PROBE spacing, NOT the base
 * speed, which he set himself. **Do not "fix" it here.** `dig.md` §5's rule still stands: FIND
 * has a band, not a direction, and the two lines this file still GATES on the search
 * (house-wide hit rate < 50%, and every space having at least one dud) are what stop it
 * becoming *hit every wall once* by accident.
 *
 * ---------------------------------------------------------------------------
 * ⏱️ **THE CLOCK IS BLOWS × THE WEAPON'S OWN COOLDOWN, AND THAT IS DELIBERATE**
 * ---------------------------------------------------------------------------
 * `WEAPON_COOLDOWN.sledge` is imported from `rules.js` rather than typed here, so the cadence is
 * the game's number and cannot drift from it. The hammer's cooldown IS the throttle — a player
 * physically cannot swing faster — so seconds = blows × cooldown is the honest conversion.
 *
 * ⚠️ **AND A STOPWATCH WOULD BE THE WRONG INSTRUMENT ON THIS BOARD.** Wall-clock time here is a
 * measurement of how many other agents are compiling shaders, not of how long a dig takes:
 * `exterior-1` had `escape` and `mechanics` each time out once under concurrent load and pass
 * unchanged serially. `DamageField._add()` is a pure function of (field, u, v, power) with no
 * time term anywhere in it, so a blow count is **bit-identical under any load** and two runs of
 * this file must agree to the digit. Wall time and the world clock are reported alongside, and
 * if they disagree with the blow count the blow count is the measurement.
 *
 * ---------------------------------------------------------------------------
 * 🚨 **EVERY BLOW GOES THROUGH A REAL CONTACT POINT**
 * ---------------------------------------------------------------------------
 * `p.applyHit(p.pointAt(u, v), 1)` — the exact entry point `sledge.js` calls, at full
 * `SLEDGE_POWER`. B2 asserts the positional arm actually took the blow (`field.hits` grows, and
 * two different positions give two different answers), because a previous agent measured the dig
 * through a call with no impact point, got the non-positional machine, and filed a false defect
 * off it. If a table below is suspiciously uniform across positions, read B2 first.
 *
 * ⚠️ `damage(n, {weapon})` with no point NO LONGER falls to the scalar arm — `wall.js` `damage()`
 * was fixed 2026-08-09 to route a pointless hit into the brush at the face centre. The trap is
 * closed; a centre-of-face hit is still not a positional measurement, which is why nothing here
 * uses it.
 */

import { WEAPON_COOLDOWN } from '../../src/game/rules.js';
/** 🚨 the shipped base dig speed — printed in the header line, and see B2c's `BASE_WAS`. */
import { DIG_BASE } from '../../src/destruction/damagefield.js';

/** The swing cadence, from the game's own table. `sledge.js` `SLEDGE_POWER` is 1.0 — no half-swing. */
const SWING = +(process.env.SWING ?? WEAPON_COOLDOWN.sledge);
/** How far apart a player's probes are along a wall, in metres. The region is `IC_W` = 1.55 across. */
const PROBE_STEP = +(process.env.PROBE_STEP ?? 1.5);
/** ≥3 required by the brief. Five, because the region's position is the whole variance. */
const SEEDS = (process.env.SEEDS ?? 's4,search-b,search-c,s1,s7').split(',').filter(Boolean);
/**
 * 🚨 **JOHN SUSPENDED THE BAND ON 2026-08-09, SO THIS FILE REPORTS THE CLOCK AND DOES NOT GATE
 * ON IT.** *"I want to abandon a set time for dig while we testing."* And in the same breath he
 * re-set the pacing itself: *"I was playing on 8x and that actually should be the base speed"* —
 * shipped as `damagefield.js` `DIG_BASE`, which moved the whole house from ~54 s to ~6 s.
 *
 * 🎯 **A GATE THAT ASSERTS A NUMBER HE HAS RETIRED IS WORSE THAN NO GATE**, because it goes red
 * on a correct build and the next agent either "fixes" the build or learns to ignore the suite.
 * Every second below is still measured, printed and compared across spaces — what is gone is the
 * pass/fail on it. `BAND` is kept as the RECORDED number so the report can say how far the new
 * pacing sits from the one that was tuned, and `DIG_BAND=45,75 node …` re-arms the assertion in
 * one environment variable the day John sets a new one.
 *
 * ⚠️ **THE STRUCTURAL ASSERTIONS ARE UNTOUCHED AND THEY ARE THE ONES THAT CATCH BUGS:** B1 (every
 * space can be dug out of), B2 (the positional arm really takes the blow), B2c (the deep band
 * reintroduces its own defect live), the graph-carries-the-hole check, and the per-space
 * "this room still has duds in it" line — which at the new speed is the only thing standing
 * between a search and a corridor of one-shot walls, and is therefore MORE load-bearing, not less.
 */
const BAND = (process.env.DIG_BAND ?? '').split(',').map(Number).filter((n) => Number.isFinite(n));
const BAND_GATED = BAND.length === 2;
/** The band that WAS tuned, kept for the report's distance-from-it line only. */
const BAND_WAS = [45, 75];

const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);

export default async function digBand({ page, note, pass, fail, skip }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  // =========================================================================
  // B0 — THE ARM. Refuse to report a vacuous green on a build that cannot dig.
  // =========================================================================
  const head = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e?.room?.digCensus) return null;
    const c = e.room.digCensus();
    return {
      on: c.on, mode: c.mode, freeFaces: c.freeFaces, seed: String(e.run?.seed ?? ''),
      estate: e.room.estate ? { on: true, study: e.room.estate.study, ballroom: e.room.estate.ballroom }
        : { on: false },
    };
  });
  if (!head) { fail('the build is reachable', 'no engine.room.digCensus'); return; }
  if (!head.on || head.mode !== 'free') {
    skip('the dig band can be measured', `this build is \`?dig=${head.mode ?? 'off'}\` — `
      + 'the band is a free-form figure; re-run with --q "seed=s4&dig=1"');
    return;
  }
  note(`arm: dig=${head.mode} · estate=${head.estate.on ? 'port' : 'off'}`
    + `${head.estate.on ? ` (study ${head.estate.study}, ballroom ${head.estate.ballroom})` : ''}`
    + ` · boot seed "${head.seed}" · swing ${SWING} s · base dig speed x${DIG_BASE}`);

  // =========================================================================
  // B1 🚨 COVERAGE — WHICH OF THE ROOMS JOHN WILL ACTUALLY PLAY IN CAN BE DUG AT ALL?
  //
  // This runs FIRST because it decides whether the rest of the file has anything to say about a
  // given room. A per-space band table that quietly omits the rooms with no dig faces would read
  // as "measured everywhere and fine".
  // =========================================================================
  const cover = await page.evaluate(() => {
    const room = window.__rrr.engine.room;
    const faces = room.panels.filter((p) => p.spec?.free);
    const bySpace = new Map();
    for (const p of faces) {
      const s = p.spec.a;
      if (!bySpace.has(s)) bySpace.set(s, { n: 0, w: 0, h: p.height, edges: new Set() });
      const r = bySpace.get(s);
      r.n++; r.w += p.width; r.edges.add(p.spec.edge);
    }
    return {
      spaces: room.spaces.map((s) => ({
        id: s.id, name: s.name, storey: s.storey,
        faces: bySpace.get(s.id)?.n ?? 0,
        digWidth: +(bySpace.get(s.id)?.w ?? 0).toFixed(2),
        digHeight: +(bySpace.get(s.id)?.h ?? 0).toFixed(2),
        edges: [...(bySpace.get(s.id)?.edges ?? [])],
        estateOrder: !!s.orderPlan,
      })),
    };
  });

  note('COVERAGE — destructible dig faces per space, read off the built world:');
  note('   space      storey   dig faces   dig width   band h   estate order');
  for (const s of cover.spaces) {
    note(`   ${s.id.padEnd(9)}  ${String(s.storey).padStart(5)} m  `
      + `${String(s.faces).padStart(9)}   ${String(s.digWidth).padStart(8)} m  `
      + `${String(s.digHeight || '—').padStart(6)}   ${s.estateOrder ? 'yes' : 'no'}`);
  }
  const diggable = cover.spaces.filter((s) => s.faces > 0);
  const barren = cover.spaces.filter((s) => s.faces === 0);
  const portedBarren = barren.filter((s) => s.estateOrder);
  if (barren.length === 0) {
    pass('every space in the house can be dug out of', `${diggable.length} spaces carry dig faces`);
  } else {
    fail('every space in the house can be dug out of',
      `${barren.length} of ${cover.spaces.length} spaces carry NO destructible face `
      + `(${barren.map((s) => s.id).join(', ')}) — `
      + `${portedBarren.length} of them are ported estate rooms. `
      + 'John\'s minute is undefined there: there is no wall to swing at, not a slow one.');
  }
  // and say the DIG_H-against-a-tall-room question out loud, because it only bites where a dig
  // face and a tall storey meet — and today they never do.
  const tall = diggable.filter((s) => s.storey > 5);
  if (tall.length === 0) {
    note(`DIG_H 2.80 m against a tall storey is MOOT today: every diggable space is `
      + `${[...new Set(diggable.map((s) => s.storey))].join('/')} m. The 9.60 m ballroom has no dig face.`);
  } else {
    note(`DIG_H 2.80 m sits in a ${tall.map((s) => `${s.id} ${s.storey} m`).join(', ')} storey `
      + `— ${tall.map((s) => `${(100 * 2.80 / s.storey).toFixed(0)}%`).join('/')} of the wall height.`);
  }
  if (diggable.length === 0) {
    fail('there is a dig to measure', 'no space in the house carries a destructible face');
    return;
  }

  // =========================================================================
  // B2 🚨 THE INSTRUMENT — prove the POSITIONAL arm took the blow.
  //
  // `applyHit(worldPos, power)` has two arms and the no-field one is a stage machine. A face with
  // no `field` would answer every position identically, which is the signature that made a
  // previous agent file a false defect. So: the field must RECORD the hits, and two positions a
  // metre apart must produce two different local depths.
  // =========================================================================
  const inst = await page.evaluate(() => {
    const room = window.__rrr.engine.room;
    const p = room.panels.find((q) => q.spec?.free && q.width > 4);
    if (!p) return null;
    p.resetDamage();
    const h0 = p.field.hits.length;
    for (let i = 0; i < 3; i++) p.applyHit(p.pointAt(0.25, 0.40), 1);
    const h1 = p.field.hits.length;
    const dLeft = p.field.depthAt(0.25, 0.40);
    const dRight = p.field.depthAt(0.75, 0.40);
    for (let i = 0; i < 3; i++) p.applyHit(p.pointAt(0.75, 0.40), 1);
    const dRight2 = p.field.depthAt(0.75, 0.40);
    // the round trip a real contact point makes: world point -> uvAt -> the cell it lands in
    const pt = p.pointAt(0.25, 0.40);
    const uv = p.uvAt(pt);
    p.resetDamage();
    return {
      id: p.id, recorded: h1 - h0, dLeft: +dLeft.toFixed(4), dRight: +dRight.toFixed(4),
      dRight2: +dRight2.toFixed(4), uvErr: +Math.hypot(uv.u - 0.25, uv.v - 0.40).toFixed(5),
    };
  });
  if (!inst) { fail('the positional arm is the one under test', 'no free face wide enough to probe'); return; }
  note(`instrument: 3 blows recorded ${inst.recorded} field hits · depth at the struck spot `
    + `${inst.dLeft} vs ${inst.dRight} a metre away · world-point round trip err ${inst.uvErr}`);
  if (inst.recorded === 3 && inst.dLeft > 0.01 && inst.dRight === 0 && inst.dRight2 > 0.01 && inst.uvErr < 0.01) {
    pass('the positional arm is the one under test',
      `3 blows -> 3 field hits; the wall a metre away is untouched (${inst.dRight})`);
  } else {
    fail('the positional arm is the one under test',
      `${JSON.stringify(inst)} — if dRight is not 0 this is the SCALAR arm and every number below is void`);
    return;
  }

  // =========================================================================
  // B2b 🚨 **THE CEILING — A FULLY-EXCAVATED SPAN MUST BE PASSABLE, ON EVERY FACE, EVERY SEED.**
  //
  // This is the general form of the `service`/`s7` softlock (`digparity-1`, 2026-08-09) and it
  // is the assertion the whole class reduces to. That bug was a room a player could swing at
  // 406 times, with every cell in the aim window at depth 1.0, and never get out of — because
  // `DamageField._macro` quantised passability to 2-cell (0.185 m) columns while the passage's
  // own margin over a body was **0.051 m**. The quantum was three times the margin, so losing
  // one macro cell anywhere in the 4x9 grid the passage is made of took it 0.740 -> 0.555 m,
  // under a body, permanently. Measured over 1750 interconnect faces: **16 unopenable at
  // MACRO 2, 0 at MACRO 1.**
  //
  // ⚠️ **IT COSTS NO BLOWS AND THAT IS WHY IT CAN RUN OVER EVERYTHING.** `depth.fill(1)` is the
  // ceiling — the best any amount of digging could ever do on this seed — so the question is
  // purely geometric and a whole-house sweep is a few milliseconds. A drive-based test can only
  // ever sample the faces it had time to dig; at MACRO 2 the failure rate was 16 in 1750 faces.
  //
  // 🚨 **THE GATE IS THE MARGIN AGAINST THE QUANTUM, NOT "IS IT OPEN" — AND THAT DISTINCTION IS
  // MEASURED, NOT REASONED.** "A fully-excavated span must be passable" is the obvious assertion
  // and **it does not catch this bug**: re-run with `_macro`'s `MACRO` put back to 2 and the
  // ceiling still reads 0.731 m on all 70 face x seed pairs and passes, while three of those
  // same rows are unopenable in practice. The geometry was never the problem. What was:
  //
  //     the passage's margin over a body (0.731 - 0.680 = 0.051 m)
  //       was SMALLER THAN the quantum passability is measured in (2 cells = 0.185 m)
  //
  // so one lost macro cell anywhere in the passage was fatal and no digging could recover it.
  // That comparison is the invariant, it is one line, and it fails at MACRO 2 and passes at
  // MACRO 1 (margin 0.143 m against a 0.093 m quantum). A future move to `IC_W`, `IC_H`, `CELL`
  // or `MACRO` that re-opens the gap trips it before anybody has to play the seed.
  //
  // ⚠️ **AND IT ASKS THE CYAN QUESTION FROM THE OTHER SIDE.** Every existing probe asks "is the
  // barrier still there"; none asks "is the barrier INSIDE the hole the collider just allowed".
  // `OPEN_FRAC` 0.7 over a 2x2 block was 3 of 4 cells, so a macro cell holding one barrier cell
  // counted as gone — structurally, a body could be let through a 9.4 cm strip of cyan.
  // ⚠️ **Measured, and it never actually fired: 0 of 140 channels at MACRO 2.** Reported as a
  // guard that is currently green rather than as a defect that was found, because the ellipse's
  // edge columns fail the bottom rows long before the fudge can matter. At MACRO 1 it is
  // unreachable by construction — `gone` is exactly `passable`, which is false under barrier.
  //
  // 🚨 The state is restored by `setDigPlan()`, which is the game's own round reset — B3's first
  // act re-runs it and FAILS if the house is not pristine, so a leak here cannot pass silently.
  // =========================================================================
  const ceil = await page.evaluate((seeds) => {
    const room = window.__rrr.engine.room;
    const rows = [];
    for (const s of seeds) {
      room.setDigPlan({ seed: s });
      for (const p of room.panels) {
        if (!p.spec?.free || !p.field) continue;
        const g = p.field;
        const keep = g.depth.slice();
        g.depth.fill(1); g._touch();
        const ch = p.openChannel();
        // Does the channel the collider just allowed run through any barrier cell? Walk the
        // fine cells under it over the rows a body occupies — never the macro grid, or the
        // question would be answered by the same quantisation it is meant to audit.
        let cyanInChannel = 0;
        if (ch.open && ch.width > 0) {
          /**
           * ⚠️ **ROUND, NOT FLOOR/CEIL — the first version of this check reported 8 false
           * positives on a build where the property holds by construction.** The channel's
           * edges land on exact cell boundaries, so `floor` on the low edge and `ceil` on the
           * high edge each pick up one extra column whenever the float lands a whisker outside
           * (`(0.375 - 0.125) * 32` is not always exactly 8), and the extra column at the mouth
           * of a hole is barrier by definition. `round` is exact against an integer boundary
           * and cannot widen the span. The reconstruction is then checked against the width
           * `channel()` reported, and a mismatch SKIPS rather than accusing.
           */
          const half = ch.width / (2 * g.width);
          const c0 = Math.max(0, Math.round((ch.centreU - half) * g.cols));
          const c1 = Math.min(g.cols - 1, Math.round((ch.centreU + half) * g.cols) - 1);
          const r0 = Math.floor(0.30 / g.cellH), r1 = Math.min(g.rows - 1, Math.floor(1.70 / g.cellH));
          if (Math.abs((c1 - c0 + 1) * g.cellW - ch.width) > 0.6 * g.cellW) cyanInChannel = -1;
          else for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
            if (g.barrier[g.idx(cx, cy)]) cyanInChannel++;
          }
        }
        // the quantum passability is actually measured in — read off the grid both the collider
        // and channel() share, never typed here, or this check could not see a change to it
        const q = g._macro(false).MACRO * g.cellW;
        g.depth.set(keep); g._touch();
        rows.push({
          seed: s, id: p.id, space: p.spec.a, link: !!room.digCensus().link.includes(p.id),
          w: +ch.width.toFixed(3), h: +(ch.height ?? 0).toFixed(2), open: !!ch.open,
          cyanInChannel, quantum: +q.toFixed(4),
        });
      }
    }
    return rows;
  }, SEEDS);
  {
    const link = ceil.filter((r) => r.link);
    const shut = link.filter((r) => !r.open);
    const cyan = ceil.filter((r) => r.cyanInChannel > 0);
    const ws = link.map((r) => r.w).sort((a, b) => a - b);
    note('');
    note(`CEILING — every interconnect face fully excavated (${link.length} face x seed pairs over `
      + `${SEEDS.length} seeds): channel ${ws[0]}–${ws[ws.length - 1]} m, median `
      + `${ws[Math.floor(ws.length / 2)]} m, against the 0.680 m a body needs.`);
    const margin = ws[0] - 0.68;
    const quantum = Math.max(...link.map((r) => r.quantum));
    note(`   worst margin ${margin.toFixed(3)} m, against a passability quantum of `
      + `${quantum.toFixed(3)} m (_macro's MACRO x cellW). The margin must EXCEED the quantum: `
      + 'one lost macro cell is unrecoverable, so a quantum bigger than the margin is a softlock '
      + 'waiting for the seed that lands on it.');
    if (shut.length === 0 && margin >= quantum) {
      pass('a fully-excavated span is always passable, with room to lose a cell',
        `${link.length} interconnect faces, every one open at the ceiling; worst ${ws[0]} m `
        + `= ${margin.toFixed(3)} m of margin against a ${quantum.toFixed(3)} m quantum`);
    } else if (shut.length === 0) {
      fail('a fully-excavated span is always passable, with room to lose a cell',
        `every face opens at the ceiling, but the worst margin (${margin.toFixed(3)} m) is UNDER `
        + `the ${quantum.toFixed(3)} m quantum passability is measured in. One macro cell left `
        + 'short anywhere in the passage takes it under a body permanently, and no amount of '
        + 'digging recovers it — that is the `service`/`s7` softlock, and it is back.');
    } else {
      fail('a fully-excavated span is always passable, with room to lose a cell',
        `${shut.length} of ${link.length} refuse a body with EVERY cell dug to depth 1.0 — `
        + `${shut.slice(0, 6).map((r) => `${r.seed}/${r.id}@${r.w}m`).join(' ')}. `
        + 'No amount of digging can open these: the room is a softlock.');
    }
    const unread = ceil.filter((r) => r.cyanInChannel < 0);
    if (unread.length > ceil.length / 4) {
      skip('no body walks through the cyan barrier',
        `${unread.length} of ${ceil.length} channels could not be reconstructed from `
        + '(centreU, width) — a probe that cannot observe must not report a pass');
    } else if (cyan.length === 0) {
      pass('no body walks through the cyan barrier',
        `${ceil.length - unread.length} channels read at the ceiling, not one contains a barrier cell`);
    } else {
      fail('no body walks through the cyan barrier',
        `${cyan.length} channels run through indestructible barrier cells `
        + `(worst ${Math.max(...cyan.map((r) => r.cyanInChannel))} cells) — passability is `
        + 'quantised coarser than the barrier it is supposed to respect');
    }
  }

  // =========================================================================
  // B2c 🎯 **THE WALL HAS TO KEEP ANSWERING — HOW MANY BLOWS OF A REAL DIG CHANGE NOTHING WHERE
  // THE HAMMER LANDED?**
  //
  // John refused a numeric destruction meter, so **the wall itself is the only progress indicator
  // the game has.** `digparity-1` found it stops indicating: every `DAMAGE_BANDS` row saturated at
  // a smoothed depth of 0.420 while `passable()` needs raw 0.999, so raw 0.42 -> 1.0 rendered
  // identically — and it filed that as a WORST-CASE AIMING MODEL rather than a prediction.
  // **Measured on a real drive it is not a worst case; it is optimistic.** With the most
  // flattering plausible aim there is (phase 2's own rule below — every blow at the LEAST-DUG
  // cell, so the player never swings at a hole they already made), 62.5% of a 47-blow THROUGH
  // drive moved nothing within 25 cm of the impact.
  //
  // ⚠️ **THE PICTURE IS MEASURED, NOT THE DEPTH.** Every layer's threshold is
  // `clamp((B - lo) / (hi - lo))` with B the smoothed depth channel (`data[i*4+2]`), so reading B
  // after `flush()` — which is exactly what the game does once a frame — and evaluating the same
  // clamp against the LIVE `uDmgBand` uniforms IS what the shader sees. No camera, no lighting,
  // no screenshot, and therefore nothing for a grade or a light to hide.
  //
  // 🚨 **AND IT IS VALIDATED BY REINTRODUCTION, IN THE SAME PAGE, ON EVERY RUN.** HANDOFF's rule
  // is that a gate which has only ever seen working code is not evidence — `digparity-1` proved
  // the obvious gate for its own bug passed at the broken setting. The bands are UNIFORMS, so the
  // defect can be put back live: the second arm sets band 3 to `[0.05, 0.42]`, the table shipped
  // before round 11, and this check FAILS ITSELF if that arm does not go blind. A green here
  // therefore means both "the wall answers" and "this line can tell when it does not".
  //
  // ⚠️ It runs before B3 and leaves the face dug; B3's first act is `setDigPlan()` and it FAILS
  // if the house is not pristine, so a leak cannot pass silently.
  // =========================================================================
  {
    const DEAD_BAR = 0.25;          // fraction of blows allowed to move nothing at the impact
    const NEAR_M = 0.25;            // "at the point of impact", in metres
    const MOVE = 0.02;              // 2% of a layer's tear — under this nothing is on screen
    /**
     * 🚨 **B2c DRIVES AT THE OLD BASE, AND IT HAD TO — RE-BASELINED 2026-08-09, NOT DEFEATED.**
     *
     * At `damagefield.js` `DIG_BASE` = 8 one blow takes **every cell inside the brush from
     * pristine to depth 1.0**, so a whole breach is 2–3 blows and the depth history this check
     * samples has three entries in it. Both arms then read `0/3 = 0.0%` dead and the assertion
     * fails ITSELF on its own honest bar — *"the reintroduced defect reads 0.0%, so this line
     * cannot detect the bug it was written for"*. That is the check working exactly as designed
     * (it is the one gate in the project that validates itself by reintroduction on every run),
     * and the fix is to give it something to look at.
     *
     * 🎯 **AND IT IS SOUND, NOT A LOOPHOLE: `DAMAGE_BANDS` IS A PURELY VISUAL MAPPING AND
     * `_add()` HAS NO REFERENCE TO IT** (`dig.md`'s own reusable trick). What B2c asserts is
     * *"as a texel's depth crosses 0…1, is there always a layer whose threshold is moving"* —
     * a property of the TABLE, at every depth, independent of how many blows it takes to get
     * there. Sampling that needs depth resolution, so the drive puts **`brush.base` back to 1**
     * and keeps swinging at full power, which restores exactly the granularity every recorded
     * figure in `visible-1`'s round was measured at.
     *
     * 🚨 **AND SWINGING AT `power = 1 / DIG_BASE` INSTEAD IS THE TRAP — IT WAS TRIED HERE FIRST
     * AND IT LIES.** `_add()` splits the clamp: `power` scales the deposit but its clamped copy
     * also sizes the brush (`R = radius * (0.55 + 0.45 * pw)`), so at power 0.125 the crater is
     * the right depth and **0.61x the radius** — a different shape, on a check whose whole
     * subject is what a texel's own neighbourhood does. `brush.base` moves the depth without
     * moving the footprint, and it is the knob `damagefield.js` exposes for exactly this.
     *
     * ⚠️ It is NOT the pacing being asserted anywhere — the clock is reported above and gated
     * nowhere (see `BAND`). Nothing about the shipped speed is hidden by this drive.
     */
    const BASE_WAS = 1;
    const seeing = await page.evaluate(([seed, nearM, move, fine]) => {
      const room = window.__rrr.engine.room;
      room.setDigPlan({ seed });
      const census = room.digCensus();
      const p = room.panels.find((q) => q.spec?.free && census.link.includes(q.id) && q.field);
      if (!p) return null;
      const g = p.field;
      const N = g.cols * g.rows;
      const bandsOf = () => [0, 1, 2, 3].map((i) => {
        const v = p.mats[i]?.userData?.breakUniforms?.uDmgBand?.value;
        return v ? [v.x, v.y] : null;
      });
      const shipped = bandsOf();
      if (shipped.some((b) => !b)) return { noBands: true };

      /** one arm: drive THROUGH with phase-2 aim, counting blows that move nothing at impact. */
      const run = (bands) => {
        p.resetDamage();
        // see BASE_WAS above: the deposit goes back to the pre-DIG_BASE pacing so the depth
        // history has resolution to sample, and the brush keeps its full radius. Restored below.
        const base0 = g.brush.base;
        g.brush.base = fine;
        const cl = () => {
          const by0 = Math.floor(0.30 / g.cellH), by1 = Math.min(g.rows - 1, Math.ceil(1.80 / g.cellH));
          let bestA = -1, bestN = 0, runA = -1, r = 0;
          for (let cx = 0; cx <= g.cols; cx++) {
            let clear = cx < g.cols;
            for (let cy = by0; cy <= by1 && clear; cy++) if (g.barrier[g.idx(cx, cy)]) clear = false;
            if (clear) { if (r === 0) runA = cx; r++; if (r > bestN) { bestN = r; bestA = runA; } }
            else r = 0;
          }
          return { bestA, bestN };
        };
        const at = (B, b) => {
          const v = (B - b[0]) / Math.max(1e-4, b[1] - b[0]);
          return v <= 0 ? 0 : (v >= 1 ? 1 : v);
        };
        // the three surfaces a player can see: the ornate skin, the shell's front (bands 1-2 are
        // bit-identical by construction) and the shell's back. The back only counts where the
        // front has gone — every band is a level set of ONE order field, so at the field's median
        // order that is exactly `front >= 0.5`.
        const snap = () => {
          const a = new Float32Array(N * 3);
          for (let i = 0; i < N; i++) {
            const B = g.data[i * 4 + 2] / 255;
            a[i * 3] = at(B, bands[0]);
            a[i * 3 + 1] = at(B, bands[1]);
            a[i * 3 + 2] = a[i * 3 + 1] >= 0.5 ? at(B, bands[3]) : 0;
          }
          return a;
        };
        g.flush();
        let prev = snap();
        let blows = 0, dead = 0, opened = false;
        const nx = nearM / g.cellW, ny = nearM / g.cellH;
        for (let k = 0; k < 420; k++) {
          const { bestA, bestN } = cl();
          if (bestN === 0) break;
          const cy1 = Math.min(g.rows - 1, Math.ceil(1.95 / g.cellH));
          const needed = Math.ceil(0.80 / g.cellW);
          const mid = bestA + bestN / 2;
          const cx0 = Math.max(bestA, Math.round(mid - needed / 2));
          const cx1 = Math.min(bestA + bestN - 1, cx0 + needed - 1);
          let bx = cx0, by = 0, bd = 2;
          for (let cy = 0; cy <= cy1; cy++) {
            for (let cx = cx0; cx <= cx1; cx++) {
              const d = g.depth[g.idx(cx, cy)];
              if (d < bd) { bd = d; bx = cx; by = cy; }
            }
          }
          p.applyHit(p.pointAt((bx + 0.5) / g.cols, (by + 0.5) / g.rows), 1);
          blows++;
          g.flush();
          const now = snap();
          let mx = 0;
          for (let cy = 0; cy < g.rows; cy++) {
            for (let cx = 0; cx < g.cols; cx++) {
              const ex = (cx - bx) / nx, ey = (cy - by) / ny;
              if (ex * ex + ey * ey > 1) continue;
              const i = (cy * g.cols + cx) * 3;
              for (let c = 0; c < 3; c++) {
                const d = Math.abs(now[i + c] - prev[i + c]);
                if (d > mx) mx = d;
              }
            }
          }
          if (mx < move) dead++;
          prev = now;
          if (p.openChannel().open) { opened = true; break; }
        }
        p.resetDamage();
        g.brush.base = base0;
        return { blows, dead, opened };
      };

      const live = run(shipped);
      // 🚨 reintroduce the defect: band 3 back to the front's own slice, which is the table
      // shipped before round 11 and the exact state `digparity-1` measured.
      const broken = run([shipped[0], shipped[1], shipped[2], [0.050, 0.420]]);
      return { face: p.id, space: p.spec.a, shipped, live, broken };
    }, [SEEDS[0], NEAR_M, MOVE, BASE_WAS]);

    note('');
    if (!seeing || seeing.noBands) {
      skip('the wall keeps answering all the way through a dig',
        'no damage-armed interconnect face with readable bands — a probe that cannot observe must not pass');
    } else {
      const f = (r) => `${r.dead}/${r.blows} = ${(100 * r.dead / Math.max(1, r.blows)).toFixed(1)}%`;
      note(`SEEING THE DIG — ${seeing.face} (${seeing.space}), seed "${SEEDS[0]}", competent aim, `
        + `bands ${seeing.shipped.map((b) => `[${b[0]}, ${b[1]}]`).join(' ')}`);
      note(`   blows that move NOTHING within ${NEAR_M} m of the impact (< ${MOVE} of a tear):`);
      note(`     this build                      ${f(seeing.live)}`);
      note(`     band 3 put back to [0.05, 0.42] ${f(seeing.broken)}   <- the defect, reintroduced live`);
      const liveDead = seeing.live.dead / Math.max(1, seeing.live.blows);
      const brokeDead = seeing.broken.dead / Math.max(1, seeing.broken.blows);
      if (brokeDead <= DEAD_BAR) {
        fail('the wall keeps answering all the way through a dig',
          `the REINTRODUCED defect reads ${(100 * brokeDead).toFixed(1)}%, under this line's own `
          + `${(100 * DEAD_BAR).toFixed(0)}% bar — so this assertion cannot detect the bug it was `
          + 'written for and a green from it would mean nothing. Fix the check, not the build.');
      } else if (liveDead <= DEAD_BAR) {
        pass('the wall keeps answering all the way through a dig',
          `${f(seeing.live)} of blows blind at the point of impact, against ${f(seeing.broken)} with `
          + `the defect put back — the check is validated by reintroduction in this same page`);
      } else {
        fail('the wall keeps answering all the way through a dig',
          `${f(seeing.live)} of blows move nothing within ${NEAR_M} m of where the hammer landed, `
          + `against a ${(100 * DEAD_BAR).toFixed(0)}% bar. John refused a numeric destruction `
          + 'meter, so the wall is the only progress indicator there is and it has stopped '
          + 'indicating. See `wall.js` DAMAGE_BANDS.');
      }
    }
  }

  // =========================================================================
  // THE DRIVE. One measurement = one `setDigPlan({seed})` (the game's own round reset: it zeroes
  // every field, clears the unlock, and re-derives this seed's regions) followed by a blow loop
  // inside ONE page.evaluate.
  //
  // ⚠️ **THE LOOP IS IN-PAGE ON PURPOSE AND IT IS NOT A SHORTCUT.** `DamageField._add()` has no
  // time term, so a blow's effect is identical whether it lands this frame or next — the clock is
  // the cooldown, which this file applies as arithmetic. What the loop must NOT do is call
  // `damage()` in a loop (that is the scalar arm) or skip the contact point. It does neither:
  // every blow is `applyHit(pointAt(u,v), 1)`.
  // =========================================================================

  /** in-page: reset the house to this seed's plan and report what moved. */
  const reseed = (seed) => page.evaluate((s) => {
    const room = window.__rrr.engine.room;
    const r = room.setDigPlan({ seed: s });
    const c = room.digCensus();
    const regions = room.panels.filter((p) => p.spec?.free && c.link.includes(p.id))
      .map((p) => ({ id: p.id, space: p.spec.a }));
    return {
      link: r.link ?? [], regions, unlocked: c.unlocked, passable: c.freePassable,
      maxDepth: Math.max(0, ...c.free.map((f) => f.maxDepth)),
    };
  }, seed);

  /**
   * in-page: measure ONE space on the CURRENT plan.
   *
   * Phase 1 — THE SEARCH. Probe every spot this space can reach, in table order, paying the
   *   real cost of each: blows until you can see what is behind that spot, then read whether it
   *   is barrier. That gives the per-spot probe cost distribution AND `K`, how many of the
   *   spots are actually on the answer. Expected duds before the first winner, over a random
   *   order, is `(N - K) / (K + 1)`.
   *
   *   ⚠️ **THE EXPECTATION IS NOT THE DRIVE'S OWN LUCK.** Walking the faces in table order and
   *   reporting where that happened to land is the single most flattering number available and
   *   this project keeps catching it. The best and worst cases are reported too.
   *
   * Phase 2 — THROUGH. Reset, go straight to a winning spot, probe in, then work the channel
   *   open until a BODY fits. Passability is `openChannel()` — the same query `blocksMovement`
   *   and the collider are made of — never how the wall looks.
   */
  const measure = (spaceId, probeStep) => page.evaluate(([sid, step]) => {
    const room = window.__rrr.engine.room;
    const faces = room.panels.filter((p) => p.spec?.free && p.spec.a === sid);
    if (!faces.length) return null;
    const reset = () => { for (const p of room.panels) if (p.spec?.dig) p.resetDamage(); };

    const PROBE_V = 0.40;          // 1.12 m up a 2.80 m band — chest height on a 1.70 m robot
    const PROBE_CAP = 60;
    const OPEN_CAP = 400;

    /** blows until this spot is dug through far enough to see what is behind it. */
    const probe = (p, u) => {
      let n = 0;
      while (n < PROBE_CAP) {
        p.applyHit(p.pointAt(u, PROBE_V), 1);
        n++;
        if (p.field.depthAt(u, PROBE_V) >= 0.999) break;
      }
      return { blows: n, barrier: !!p.field.barrierAt(u, PROBE_V), through: p.field.depthAt(u, PROBE_V) >= 0.999 };
    };

    // ---- phase 1: the search --------------------------------------------------------------
    reset();
    const spots = [];
    for (const p of faces) {
      const n = Math.max(1, Math.round(p.width / step));
      for (let k = 0; k < n; k++) spots.push({ p, u: (k + 0.5) / n });
    }
    const probed = spots.map(({ p, u }) => {
      reset();                                  // each spot priced on FRESH wall, like the first
      const r = probe(p, u);
      return { face: p.id, u: +u.toFixed(3), ...r };
    });
    const N = probed.length;
    const winners = probed.filter((r) => !r.barrier);
    const K = winners.length;
    const costs = probed.map((r) => r.blows);
    const dudCosts = probed.filter((r) => r.barrier).map((r) => r.blows);
    const meanDud = dudCosts.length ? dudCosts.reduce((a, b) => a + b, 0) / dudCosts.length : 0;

    // ---- phase 2: through -----------------------------------------------------------------
    reset();
    let through = null;
    if (K > 0) {
      const w = winners[0];
      const p = faces.find((q) => q.id === w.face);
      const pr = probe(p, w.u);
      let blows = pr.blows;
      let opened = false;
      /**
       * ⚠️ **THE PASSAGE THE FIELD PHYSICALLY OFFERS, MEASURED BEFORE A SINGLE OPENING BLOW.**
       * A region whose barrier-free band is already narrower than a body over the rows a body
       * occupies can never be opened however long you swing — `IC_H`'s own note records exactly
       * that failure at 1.95 m (247 blows, 0.573 m, then no further improvement). Recording it
       * up front separates "this took too many blows" from "this was never openable", which are
       * two completely different defects and only one of them is a tuning question.
       */
      let bandW0 = null;
      let stall = null;
      for (let i = 0; i < OPEN_CAP; i++) {
        const g = p.field;
        // the widest column band with no barrier over the rows a BODY occupies — the passage on
        // offer. Aiming anywhere else is aiming at cyan, which no blow can ever remove.
        const by0 = Math.floor(0.30 / g.cellH), by1 = Math.min(g.rows - 1, Math.ceil(1.80 / g.cellH));
        let bestA = -1, bestN = 0, runA = -1, run = 0;
        for (let cx = 0; cx <= g.cols; cx++) {
          let clear = cx < g.cols;
          for (let cy = by0; cy <= by1 && clear; cy++) if (g.barrier[g.idx(cx, cy)]) clear = false;
          if (clear) { if (run === 0) runA = cx; run++; if (run > bestN) { bestN = run; bestA = runA; } }
          else run = 0;
        }
        if (bandW0 === null) bandW0 = +(bestN * g.cellW).toFixed(3);
        if (bestN === 0) break;
        const cy0 = 0, cy1 = Math.min(g.rows - 1, Math.ceil(1.95 / g.cellH));
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
        p.applyHit(p.pointAt((bx + 0.5) / g.cols, (by + 0.5) / g.rows), 1);
        blows++;
        if (p.openChannel().open) { opened = true; break; }
        /**
         * 🔎 **STALL DIAGNOSTIC — is the material STANDING, or is it gone and the passability
         * test disagreeing?** The two look identical from the blow count and they are completely
         * different defects: standing material is a tuning question, an empty window that still
         * reports impassable is `channel()`'s quantisation. Sampled once, late, so it costs
         * nothing on the runs that open normally.
         */
        if (i === OPEN_CAP - 1) {
          let mn = 2, mx = 0, sum = 0, n = 0, atOne = 0;
          for (let cy = cy0; cy <= cy1; cy++) {
            for (let cx = cx0; cx <= cx1; cx++) {
              if (g.barrier[g.idx(cx, cy)]) continue;
              const d = g.depth[g.idx(cx, cy)];
              mn = Math.min(mn, d); mx = Math.max(mx, d); sum += d; n++;
              if (d >= 0.999) atOne++;
            }
          }
          stall = {
            windowCells: n, atOpenDepth: atOne, minDepth: +mn.toFixed(3),
            maxDepth: +mx.toFixed(3), meanDepth: +(sum / Math.max(1, n)).toFixed(3),
            bandCells: bestN, cellW: +g.cellW.toFixed(4), cellH: +g.cellH.toFixed(4),
          };
        }
      }
      const ch = p.openChannel();
      /**
       * 🚨 PASSABILITY FROM THE GRAPH, NOT FROM THE PICTURE — and the memo nearly lied about it.
       *
       * `portals()` recomputes `breachPortals()` on every call, so it is always live.
       * `pathPortals` is MEMOISED on `` `${a}>${b}|${minW.toFixed(2)}|${minH.toFixed(2)}` `` and
       * is only invalidated by a `WallState` stage change — which on a free face is a monotone
       * summary that stops firing once the face has ever reached stage 4. So the second seed's
       * query for the same room pair returns the FIRST seed's route.
       *
       * ⚠️ **Measured, not assumed:** with a 1e-4 jitter (which `toFixed(2)` rounds away, so the
       * key never changed) this read 10 routed of 15. The jitter has to move the key, so it steps
       * in whole centimetres — 1.70 → 1.77, still far under the 1.87 m minimum clear height any
       * channel below actually opened, so it is a stricter question, never a looser one.
       */
      const q = (room.__digBandQ = ((room.__digBandQ ?? 0) + 1));
      const jitter = +(1.70 + (q % 8) * 0.01).toFixed(2);
      /**
       * ⚠️ **THE TWIN COUNTS, AND THE FIRST VERSION OF THIS ASSERTION SAID IT DID NOT.**
       * `wall.js` `_couple()` opens both faces of one span at the breakthrough — they are the two
       * sides of ONE physical passage (`dig.md` §5). Both then appear in `breachPortals()` as an
       * edge between the same two rooms, and the BFS names whichever it reaches first, which is
       * panel-table order and not the side I happened to swing at. Demanding my own id read
       * **9 routed of 15** on a build where the graph routes through the hole every time. This
       * is the same mistake `dig-free.mjs` records fixing in its own link-face count.
       */
      const twinId = p.id.replace(/\.(a|b)$/, (m, s) => (s === 'a' ? '.b' : '.a'));
      const breach = room.portals().filter((q) => q.kind === 'breach' && (q.id === p.id || q.id === twinId));
      const route = room.pathPortals(p.spec.a, p.spec.b, 0.68, jitter);
      const via = route.find((q) => q.id === p.id || q.id === twinId);
      through = {
        face: p.id, u: w.u, probeBlows: pr.blows, openBlows: blows - pr.blows, blows, opened,
        bandW0, stall,
        chW: +ch.width.toFixed(2), chH: +(ch.height ?? 0).toFixed(2),
        blocksMove: p.blocksMovement(),
        breachW: breach.length ? +breach[0].w.toFixed(2) : null,
        routed: !!via, via: via?.id ?? null, routeLen: route.length,
        /**
         * ⚠️ **WHAT THE BFS PICKED INSTEAD, BECAUSE "NOT VIA MY HOLE" IS NOT THE SAME CLAIM AS
         * "NOT ROUTED".** `pathPortals` returns the SHORTEST path, and from 2026-08-09 three of
         * the six diggable spaces share an OPEN DOORWAY with the room their new dig face leads
         * to (`bal_west`/`bal_east` sit either side of D4 and D6). A one-hop door beats a one-hop
         * hole on tie-break and the graph is right to prefer it. Recording the route it took is
         * what separates that from a hole the graph refuses.
         */
        routeIds: route.map((q) => q.id),
        routeKinds: [...new Set(route.map((q) => q.kind))],
      };
    }
    reset();
    return {
      space: sid, faces: faces.length,
      width: +faces.reduce((a, p) => a + p.width, 0).toFixed(2),
      N, K, winners: winners.map((w) => `${w.face}@${w.u}`),
      probeMin: Math.min(...costs), probeMax: Math.max(...costs),
      meanDud: +meanDud.toFixed(2), through,
    };
  }, [spaceId, probeStep]);

  // =========================================================================
  // B3 — THE TABLE. Two clocks × every diggable space × every seed.
  // =========================================================================
  const rows = [];
  const regionsBySeed = new Map();
  const wall0 = Date.now();
  for (const seed of SEEDS) {
    for (const s of diggable) {
      /**
       * 🚨 **RESEED BEFORE EVERY SPACE, NOT ONCE PER SEED — THE HOUSE-WIDE UNLOCK IS WHY.**
       *
       * `?unlock=global` is the default: the moment phase 2 opens the interconnect for the FIRST
       * space, `dig.opened` fires and every barrier in the house drops. The next space is then
       * measured on a wall with no answer to find, so it reports **every probe spot a winner**
       * (16/16, 8/8), zero duds, a FIND clock of 0 s and a THROUGH clock that is the same
       * constant on every seed. Measured with the reset outside this loop: `service` and
       * `study_e` both read a flat 46.6 s at 0% spread across five seeds — a spread of exactly
       * zero is the signature, because there was nothing seeded left to vary.
       *
       * `setDigPlan({seed})` is the game's own round reset and clears all three: every field's
       * depth, `dig.opened`, and the regions, which it then re-derives from the seed.
       */
      const rs = await reseed(seed);
      regionsBySeed.set(seed, rs);
      if (rs.unlocked || rs.passable > 0 || rs.maxDepth > 0) {
        fail(`seed "${seed}" starts from a pristine house`,
          `before ${s.id}: unlocked ${rs.unlocked}, ${rs.passable} passable faces, maxDepth ${rs.maxDepth} — `
          + 'the reset leaked state from the previous measurement and every figure after it is void');
        return;
      }
      const m = await measure(s.id, PROBE_STEP);
      if (!m) { skip(`${s.id} @ ${seed}`, 'no dig faces on this space'); continue; }
      rows.push({ seed, link: rs.regions.filter((r) => r.space === s.id).map((r) => r.id), ...m });
    }
  }
  const wallSecs = (Date.now() - wall0) / 1000;

  // the seeds must actually move the answer, or every row below is the same measurement five times
  const sig = [...regionsBySeed.entries()].map(([s, r]) => `${s}:${r.link.slice().sort().join(',')}`);
  const distinctLink = new Set(sig.map((x) => x.split(':')[1])).size;
  const distinctWinners = new Set(rows.map((r) => `${r.seed}|${r.space}|${r.winners.join(',')}`)).size;
  note(`seed sweep: ${SEEDS.length} seeds -> ${distinctLink} distinct interconnect face sets, `
    + `${distinctWinners} distinct winning-spot sets over ${rows.length} rows`);
  if (distinctWinners > rows.length / 2) {
    pass('the seeds move the answer', `${distinctWinners} distinct winning-spot sets in ${rows.length} rows`);
  } else {
    fail('the seeds move the answer',
      `only ${distinctWinners} distinct sets in ${rows.length} rows — the region is barely moving, `
      + 'so a per-seed median means nothing');
  }

  note('');
  note('⏱️ THE TWO CLOCKS — blows, and seconds at the hammer\'s own cooldown:');
  note('  seed        space     spots  wins  probe blows   FIND (duds)      THROUGH        TOTAL');
  const totals = [];
  for (const r of rows) {
    if (!r.through) {
      note(`  ${r.seed.padEnd(10)}  ${r.space.padEnd(8)}  ${String(r.N).padStart(5)}  ${String(r.K).padStart(4)}  `
        + '   —            no reachable interconnect on this space this seed');
      fail(`${r.space} @ ${r.seed}`, 'no probe spot on this space reaches the interconnect');
      continue;
    }
    const dudsExp = (r.N - r.K) / (r.K + 1);
    const findBlows = dudsExp * r.meanDud;
    const thruBlows = r.through.blows;
    const total = findBlows + thruBlows;
    /**
     * ⚠️ **A ROW THAT NEVER OPENED IS NOT A SLOW MEASUREMENT, IT IS A DIFFERENT DEFECT**, and
     * averaging it in would turn "this interconnect cannot be walked through at all" into "the
     * band is a bit slow" and invite a retune that fixes nothing. It is excluded from the median
     * and failed on its own terms.
     */
    if (!r.through.opened) {
      note(`  ${r.seed.padEnd(10)}  ${r.space.padEnd(8)}  ${String(r.N).padStart(5)}  ${String(r.K).padStart(4)}  `
        + `${String(r.probeMin).padStart(3)}-${String(r.probeMax).padEnd(3)} (${r.meanDud})  `
        + `${f1(findBlows).padStart(5)}b ${f1(findBlows * SWING).padStart(5)}s  `
        + `NEVER OPENED after ${thruBlows} blows — channel stalled at ${r.through.chW} m, `
        + `barrier-free band on ${r.through.face} was ${r.through.bandW0} m wide at body height`);
      if (r.through.stall) {
        const s = r.through.stall;
        note(`      stall: ${s.atOpenDepth}/${s.windowCells} cells in the aim window are dug through `
          + `(depth ${s.minDepth}–${s.maxDepth}, mean ${s.meanDepth}); band ${s.bandCells} cells `
          + `@ ${s.cellW} m. ${s.atOpenDepth === s.windowCells
            ? 'THE WINDOW IS EMPTY AND channel() STILL REFUSES IT — a passability-quantisation defect, not a tuning one.'
            : 'MATERIAL IS STILL STANDING in the window — the wall is refusing the blows, which is a tuning question.'}`);
      }
      /**
       * ⚠️ The reason has to come from the STALL SAMPLE, not from the band width. An earlier
       * version guessed it off `bandW0` and printed "the material is standing where a body needs
       * to be" over a window whose every cell was dug clean through — the exact opposite of the
       * truth, on the one line a reader would quote.
       */
      const st = r.through.stall;
      const why = !st ? 'no stall sample taken'
        : st.atOpenDepth === st.windowCells
          ? `all ${st.windowCells} cells in the aim window are at depth ${st.maxDepth} — the material `
            + `is GONE and channel() still refuses it, so this is passability quantisation, not health`
          : `${st.windowCells - st.atOpenDepth} of ${st.windowCells} cells still hold material `
            + `(min depth ${st.minDepth}) — the wall is refusing the blows`;
      fail(`the interconnect opens at ${r.space} @ ${r.seed}`,
        `${thruBlows} blows, channel ${r.through.chW} x ${r.through.chH} m against a `
        + `${r.through.bandW0} m barrier-free band over 0.30–1.80 m. ${why}`);
      continue;
    }
    totals.push({ ...r, dudsExp, findBlows, thruBlows, total });
    note(`  ${r.seed.padEnd(10)}  ${r.space.padEnd(8)}  ${String(r.N).padStart(5)}  ${String(r.K).padStart(4)}  `
      + `${String(r.probeMin).padStart(3)}-${String(r.probeMax).padEnd(3)} (${r.meanDud})  `
      + `${f1(findBlows).padStart(5)}b ${f1(findBlows * SWING).padStart(5)}s  `
      + `${String(thruBlows).padStart(3)}b ${f1(thruBlows * SWING).padStart(5)}s  `
      + `${f1(total * SWING).padStart(5)}s   band ${r.through.bandW0} m`);
  }
  note('');
  note(`  FIND = expected duds ((N-K)/(K+1)) x mean dud probe cost. THROUGH = probe + open, at the answer.`);
  note(`  drive wall time ${f1(wallSecs)} s for ${rows.length} measurements — NOT the clock, `
    + 'and not comparable across machines. The blow counts are the measurement.');

  if (!totals.length) { fail('the dig band can be measured', 'no space produced a through-clock'); return; }

  // ---- per-space verdict against John's minute -------------------------------------------
  note('');
  note(BAND_GATED
    ? `🎯 AGAINST THE BAND ${BAND[0]}–${BAND[1]} s, per space (median over seeds, and the raw spread):`
    : '🎯 THE CLOCK, per space (median over seeds, and the raw spread). ⚠️ REPORTED, NOT GATED — '
      + `John suspended the set time on 2026-08-09; the retired band was ${BAND_WAS[0]}–${BAND_WAS[1]} s:`);
  let outOfBand = 0;
  const perSpace = new Map();
  for (const t of totals) {
    if (!perSpace.has(t.space)) perSpace.set(t.space, []);
    perSpace.get(t.space).push(t);
  }
  for (const [space, ts] of perSpace) {
    const secs = ts.map((t) => t.total * SWING).sort((a, b) => a - b);
    const med = secs[Math.floor(secs.length / 2)];
    const lo = secs[0], hi = secs[secs.length - 1];
    const spread = 100 * (hi - lo) / Math.max(1e-6, med);
    const thru = ts.map((t) => t.thruBlows * SWING);
    const find = ts.map((t) => t.findBlows * SWING);
    note(`   ${space.padEnd(9)} median ${f1(med)} s  (spread ${f1(lo)}–${f1(hi)} s, ${spread.toFixed(0)}% of median)`
      + `   FIND ${f1(Math.min(...find))}–${f1(Math.max(...find))} s · `
      + `THROUGH ${f1(Math.min(...thru))}–${f1(Math.max(...thru))} s`);
    if (!BAND_GATED) {
      // ⚠️ REPORTED, NOT GATED — see BAND. Still printed against the retired figure so the
      // distance from the pacing that WAS tuned stays visible in every run.
      const x = med / ((BAND_WAS[0] + BAND_WAS[1]) / 2);
      note(`      ↳ ${f1(med)} s is ${(1 / x).toFixed(1)}x FASTER than the retired 60 s target`);
      continue;
    }
    const inBand = med >= BAND[0] && med <= BAND[1];
    if (inBand) {
      pass(`${space} lands in the band`, `median ${f1(med)} s over ${ts.length} seeds (${BAND[0]}–${BAND[1]} s)`);
    } else {
      outOfBand++;
      fail(`${space} lands in the band`,
        `median ${f1(med)} s against ${BAND[0]}–${BAND[1]} s. A BAND, NOT A DIRECTION: too fast fails as hard as too slow.`);
    }
  }

  // =========================================================================
  // B4 ⚠️ **SENSITIVITY — `PROBE_STEP` IS THE ONE UNSOURCED NUMBER LEFT IN THE FIND CLOCK.**
  //
  // FIND is `expected duds x probe cost`, and the dud count is a direct function of how far
  // apart a player's probes are. 1.5 m is inherited from `dig-free.mjs` and nobody has ever
  // measured a player doing it. Reporting a band that is really an artefact of an unexamined
  // constant is this project's most-repeated failure, so the constant gets swept: a player who
  // probes tightly pays more duds, one who strides pays fewer but can step over a 1.55 m region.
  // =========================================================================
  note('');
  note(`PROBE_STEP sensitivity on "${SEEDS[0]}" (the FIND clock's load-bearing assumption):`);
  note('   step    space      spots  wins   FIND        THROUGH     TOTAL');
  for (const step of [1.0, 1.5, 2.0]) {
    for (const s of diggable) {
      await reseed(SEEDS[0]);
      const m = await measure(s.id, step);
      if (!m?.through) { note(`   ${step.toFixed(1)} m   ${s.id.padEnd(9)}  — no through-clock`); continue; }
      const duds = (m.N - m.K) / (m.K + 1);
      const find = duds * m.meanDud * SWING;
      const thru = m.through.blows * SWING;
      note(`   ${step.toFixed(1)} m   ${s.id.padEnd(9)}  ${String(m.N).padStart(5)}  ${String(m.K).padStart(4)}   `
        + `${f1(find).padStart(5)} s     ${f1(thru).padStart(5)} s   ${f1(find + thru).padStart(5)} s`
        + `${m.through.opened ? '' : '   (never opened)'}`);
    }
  }

  // ---- the search must stay a search -----------------------------------------------------
  // `dig.md` §5: the search IS the game. A build where the first probe always wins has deleted
  // the mechanic even if the seconds happen to land in band.
  /**
   * ⚠️ **THESE WERE ONE ASSERTION AND IT FAILED FOR A REASON OTHER THAN THE ONE PRINTED ON IT**
   * (`digcover-1`, 2026-08-09) — this file's own standing rule, borrowed from `dig-toggle.mjs`.
   * `hitRate < 0.5` is a HOUSE-WIDE claim about whether the search is collapsing; `anyDuds` is a
   * PER-SPACE claim that one room's wall is long enough to hide the answer in. Fused, a single
   * two-probe-spot room made the house-wide line read "the search is collapsing" at a 29% hit
   * rate, which is the opposite of what the number says. They are the same total strictness
   * apart — nothing is weakened, the failure just now names the room it is about.
   */
  const hitRate = totals.reduce((a, t) => a + t.K / t.N, 0) / totals.length;
  const dudless = totals.filter((t) => t.N - t.K < 1);
  note('');
  note(`the interconnect covers ${(100 * hitRate).toFixed(0)}% of probe spots on average `
    + `(${totals.map((t) => `${t.K}/${t.N}`).join(' ')})`);
  hitRate < 0.5
    ? pass('the interconnect stays unfindable by accident house-wide',
      `${(100 * hitRate).toFixed(0)}% of probe spots are on it across ${totals.length} rows`)
    : fail('the interconnect stays unfindable by accident house-wide',
      `${(100 * hitRate).toFixed(0)}% of probe spots hit it — the search is collapsing and the mechanic goes with it`);
  if (!dudless.length) {
    pass('every space has a wall long enough to hide the answer in',
      `every space on every seed pays at least one dud probe`);
  } else {
    const bad = [...new Set(dudless.map((t) => `${t.space} (${t.N} probe spots)`))];
    fail('every space has a wall long enough to hide the answer in',
      `${dudless.length} of ${totals.length} rows have NO dud at all — ${bad.join(', ')}. `
      + 'A 1.55 m `IC_W` region on a wall with two probe spots covers both of them often enough '
      + 'that the search is a coin flip there, and that is a FLOOR-PLAN limit (how much shared '
      + 'wall the room has), not a tuning one.');
  }

  // ---- the cyan must still be indestructible ---------------------------------------------
  // John has settled this twice. Nothing measured above may have eroded it, so it is asserted
  // after 2000-odd blows have landed rather than on a pristine wall.
  // ⚠️ reseeded first: the last measurement left the house UNLOCKED, and on an unlocked house
  // there is no barrier cell anywhere to swing at — the probe would SKIP for the wrong reason.
  await reseed(SEEDS[0]);
  const cyan = await page.evaluate(() => {
    const room = window.__rrr.engine.room;
    const p = room.panels.find((q) => q.spec?.free && !room.digCensus().link.includes(q.id));
    if (!p) return null;
    p.resetDamage();
    const g = p.field;
    let bi = -1;
    for (let i = 0; i < g.barrier.length && bi < 0; i++) if (g.barrier[i]) bi = i;
    if (bi < 0) return { noBarrier: true };
    const cx = bi % g.cols, cy = Math.floor(bi / g.cols);
    const u = (cx + 0.5) / g.cols, v = (cy + 0.5) / g.rows;
    for (let i = 0; i < 120; i++) p.applyHit(p.pointAt(u, v), 1);
    const r = { barrierStill: !!g.barrier[bi], passable: p.openChannel().open, blocksMove: p.blocksMovement() };
    p.resetDamage();
    return r;
  });
  if (cyan?.barrierStill && !cyan.passable && cyan.blocksMove) {
    pass('the cyan barrier is still indestructible', '120 blows straight at a barrier cell moved nothing');
  } else if (cyan?.noBarrier) {
    skip('the cyan barrier is still indestructible', 'no barrier cell found on a dud face to swing at');
  } else {
    fail('the cyan barrier is still indestructible', JSON.stringify(cyan));
  }

  // ---- what a body actually does with the hole -------------------------------------------
  /**
   * 🚨 **"THE GRAPH KNOWS ABOUT THE HOLE" AND "THE SHORTEST PATH PREFERS IT" ARE TWO CLAIMS, AND
   * FUSING THEM MADE THIS LINE GO RED ON A CORRECT BUILD** (`digcover-1`, 2026-08-09).
   *
   * `pathPortals` returns the SHORTEST route. Before this round every diggable pair
   * (`service`/`study_w`, `service`/`study_e`) was joined ONLY by the dig wall, so the two claims
   * were indistinguishable and 14/14 held. The appended `bal_west` / `bal_east` edges sit either
   * side of D4 and D6 — **OPEN DOORWAYS between the same two rooms** — so the BFS reaches the far
   * room through the door in one hop and never names the hole. That is the graph being right, and
   * the old assertion called it "an AI that presses into a wall". Measured: exactly the 5 ballroom
   * rows, and nothing else, on the first run with those edges in.
   *
   * The defect it was written to catch is a channel the COLLIDER allows and the GRAPH refuses.
   * That is `breachPortals()` not carrying the hole at all — `breachW` — plus there being a route
   * between the two rooms. Both are asserted; which of two equal-length hops the BFS picks is not
   * a property of the dig.
   */
  const routed = totals.filter((t) => t.through.routed).length;
  const inGraph = totals.filter((t) => t.through.breachW != null).length;
  const reachable = totals.filter((t) => t.through.routeLen > 0).length;
  const bodySized = totals.filter((t) => t.through.chW >= 0.68 && !t.through.blocksMove).length;
  note(`channels opened: ${totals.map((t) => `${t.through.chW}x${t.through.chH}`).join(' ')}`);
  for (const t of totals.filter((q) => !q.through.routed)) {
    note(`   ${t.space} @ ${t.seed}: the hole ${t.through.face} is a breach portal `
      + `(${t.through.breachW} m) but the shortest ${t.space} -> ${t.through.face.includes('.a') ? 'twin' : 'twin'} `
      + `route is [${t.through.routeIds.join(' -> ') || '—'}] (${t.through.routeKinds.join('/') || 'none'}) `
      + '— an existing doorway is the same length or shorter');
  }
  if (bodySized === totals.length && inGraph === totals.length && reachable === totals.length) {
    pass('every hole measured is a hole the graph agrees you can walk through',
      `${inGraph}/${totals.length} carried by breachPortals() at ≥ 0.68 m clear, all ${reachable} pairs `
      + `routable by pathPortals(0.68 x 1.70); ${routed} of them are the route the BFS actually picks `
      + `(the rest lose the tie to an OPEN doorway between the same two rooms)`);
  } else {
    fail('every hole measured is a hole the graph agrees you can walk through',
      `${bodySized}/${totals.length} body-sized, ${inGraph}/${totals.length} carried by breachPortals(), `
      + `${reachable}/${totals.length} routable — a channel the collider allows and the graph refuses `
      + 'is an AI that presses into a wall');
  }

  if (!BAND_GATED) {
    note('');
    note('⚠️ NO CLOCK ASSERTION RAN — see BAND. Set DIG_BAND="lo,hi" to re-arm it the day John '
      + 'names a new number.');
  } else if (outOfBand === 0) {
    pass('🎯 the clock holds in every diggable space', `${perSpace.size} spaces x ${SEEDS.length} seeds`);
  }
}
