/**
 * 🔎 **HOW MUCH OF A REAL DIG IS INVISIBLE AT THE POINT OF IMPACT?** (`visible-1`, exploratory)
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_visible1-gap.mjs \
 *        --port 5361 --q "seed=s4&dig=1"
 *
 * `digparity-1` filed a FORMAL gap: `DAMAGE_BANDS`' deepest layer saturates at a smoothed depth
 * of 0.420 while `passable()` needs raw 0.999, so raw 0.42 -> 1.0 renders identically. That is a
 * WORST-CASE AIMING MODEL (a player who only ever swings where the wall still visibly changes),
 * not a prediction. This file measures the REAL figure on a real drive.
 *
 * ⚠️ **THE PICTURE IS MEASURED, NOT THE DEPTH.** Every layer's threshold is `_rrrBand`, i.e.
 *     clamp((B - lo) / (hi - lo))      B = the smoothed depth channel, `data[i*4+2] / 255`
 * so the whole visible state of a face is those band values. Reading B after `flush()` (which is
 * what the game does once a frame) and evaluating the same clamp is exactly what the shader sees.
 *
 * 🎯 **AND IT DUMPS THE WHOLE B HISTORY, SO CANDIDATE BANDS ARE PRICED OFFLINE ON ONE DRIVE.**
 * The bands are a purely VISUAL mapping — `_add()` never reads them — so the same recorded drive
 * answers "what would band X have looked like" for every X, in Node, with no second browser.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { WEAPON_COOLDOWN } from '../../src/game/rules.js';
import { DAMAGE_BANDS } from '../../src/game/wall.js';

const SWING = +(process.env.SWING ?? WEAPON_COOLDOWN.sledge);
const SEEDS = (process.env.SEEDS ?? 's4,search-b,s7').split(',').filter(Boolean);
const OUT = process.env.VIS1_OUT ?? 'progress/playtest/_visible1-drives.json';

export default async function visibleGap({ page, note, pass, fail, skip }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  const head = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e?.room?.digCensus) return null;
    const c = e.room.digCensus();
    return { on: c.on, mode: c.mode, freeFaces: c.freeFaces };
  });
  if (!head) { fail('the build is reachable', 'no engine.room.digCensus'); return; }
  if (!head.on || head.mode !== 'free') {
    skip('the invisibility gap can be measured', `arm is dig=${head.mode} — re-run with --q "seed=s4&dig=1"`);
    return;
  }
  note(`arm: dig=${head.mode} · ${head.freeFaces} free faces · swing ${SWING} s`);
  note(`bands on the build: skin ${JSON.stringify(DAMAGE_BANDS[0])} · shell ${JSON.stringify(DAMAGE_BANDS[3])}`);

  /**
   * ONE DRIVE, TWO AIMING MODELS.
   *   `through` — probe in, then every blow at the LEAST-DUG cell in the window a body needs.
   *               `dig-band.mjs`'s own phase-2 aim, and the most flattering plausible player.
   *   `probe`   — every blow at ONE spot until it is through. What the FIND clock is made of.
   */
  const drive = (seed, mode) => page.evaluate(([sd, md]) => {
    const room = window.__rrr.engine.room;
    room.setDigPlan({ seed: sd });
    const census = room.digCensus();
    const p = room.panels.find((q) => q.spec?.free && census.link.includes(q.id) && q.field);
    if (!p) return null;
    p.resetDamage();
    const g = p.field;
    const N = g.cols * g.rows;
    const hits = [];
    const frames = [];
    const snap = () => { const a = new Array(N); for (let i = 0; i < N; i++) a[i] = g.data[i * 4 + 2]; return a; };
    g.flush(); frames.push(snap());

    const clearRun = () => {
      const by0 = Math.floor(0.30 / g.cellH), by1 = Math.min(g.rows - 1, Math.ceil(1.80 / g.cellH));
      let bestA = -1, bestN = 0, runA = -1, run = 0;
      for (let cx = 0; cx <= g.cols; cx++) {
        let clear = cx < g.cols;
        for (let cy = by0; cy <= by1 && clear; cy++) if (g.barrier[cy * g.cols + cx]) clear = false;
        if (clear) { if (run === 0) runA = cx; run++; if (run > bestN) { bestN = run; bestA = runA; } }
        else run = 0;
      }
      return { bestA, bestN };
    };

    const hit = (u, v) => { p.applyHit(p.pointAt(u, v), 1); g.flush(); hits.push([u, v]); frames.push(snap()); };

    let opened = false, probeBlows = 0;
    const OPEN_CAP = 420, PROBE_CAP = 60;
    if (md === 'probe') {
      const u = 0.5, v = 0.40;
      while (hits.length < PROBE_CAP) { hit(u, v); if (g.depthAt(u, v) >= 0.999) { opened = true; break; } }
      probeBlows = hits.length;
    } else {
      const r0 = clearRun();
      const pu = r0.bestN > 0 ? (r0.bestA + r0.bestN / 2) / g.cols : 0.5;
      while (hits.length < PROBE_CAP) { hit(pu, 0.40); if (g.depthAt(pu, 0.40) >= 0.999) break; }
      probeBlows = hits.length;
      for (let k = 0; k < OPEN_CAP; k++) {
        const { bestA, bestN } = clearRun();
        if (bestN === 0) break;
        const cy0 = 0, cy1 = Math.min(g.rows - 1, Math.ceil(1.95 / g.cellH));
        const needed = Math.ceil(0.80 / g.cellW);
        const mid = bestA + bestN / 2;
        const cx0 = Math.max(bestA, Math.round(mid - needed / 2));
        const cx1 = Math.min(bestA + bestN - 1, cx0 + needed - 1);
        let bx = cx0, by = cy0, bd = 2;
        for (let cy = cy0; cy <= cy1; cy++) {
          for (let cx = cx0; cx <= cx1; cx++) {
            const d = g.depth[cy * g.cols + cx];
            if (d < bd) { bd = d; bx = cx; by = cy; }
          }
        }
        hit((bx + 0.5) / g.cols, (by + 0.5) / g.rows);
        if (p.openChannel().open) { opened = true; break; }
      }
    }
    const barrier = Array.from(g.barrier);
    const depth = Array.from(g.depth, (d) => Math.round(d * 1000) / 1000);
    p.resetDamage();
    return {
      face: p.id, space: p.spec.a, cols: g.cols, rows: g.rows,
      cellW: g.cellW, cellH: g.cellH, width: g.width, height: g.height,
      blows: hits.length, opened, probeBlows, hits, frames, barrier, depthAtEnd: depth,
    };
  }, [seed, mode]);

  const drives = [];
  for (const seed of SEEDS) {
    for (const mode of ['through', 'probe']) {
      const d = await drive(seed, mode);
      if (!d) { fail(`drive ${seed}/${mode}`, 'no interconnect face found'); return; }
      note(`${seed}/${mode}: ${d.face} (${d.space}) ${d.blows} blows`
        + `${d.opened ? '' : ' NEVER OPENED'} · probe ${d.probeBlows} · grid ${d.cols}x${d.rows}`);
      drives.push({ seed, mode, ...d });
    }
  }

  const out = path.resolve(OUT);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify({ bands: DAMAGE_BANDS, swing: SWING, drives }));
  note(`wrote ${drives.length} drives to ${OUT} — analyse with node harness/_visible1-analyse.mjs`);
  pass('the drives are recorded', `${drives.length} drives, ${drives.reduce((a, d) => a + d.blows, 0)} blows`);
}
