/**
 * 🔎 DIAGNOSTIC (not a gate) — WHAT A STEP-UP MAKES WALKABLE, BUCKETED BY HEIGHT.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_aim1-steppable.mjs \
 *        --port 5281 --q "seed=s4"
 *
 * `room.js` `boxesNear` ignores any box whose TOP is under `y + stepH` — that is the step-up, and
 * raising it turns every collider whose top lands in the new band from a wall into a floor. This
 * dumps that histogram off the LIVE house so the number in `rules.js` `STEP_H` is chosen against
 * the real furniture rather than against a guess: every space collider, every panel box and every
 * exterior solid, bucketed by top height above `floorY`.
 *
 * 🎯 **WHAT IT FOUND, 2026-08-10, `seed=s4`, 223 boxes: the band (0.30, 1.00] m IS EMPTY.** The
 * lowest static collider in the estate is **1.05 m** (study and ballroom plinths) and the lowest
 * exterior solid on that seed is 3.80 m. That is why `STEP_H.robot` could go to 0.55 without
 * making one thing in the house walkable that was not already.
 *
 * ⚠️ The GATE that asserts this on every run is `aim-step.mjs` S3. This file is the wider census
 * you want when you are choosing a number rather than defending one. Reads only; asserts nothing
 * beyond "the census could be taken".
 */

export default async function steppable({ page, note, pass, fail }) {
  await page.waitForTimeout(300);

  const census = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e?.room) return null;
    const fy = e.room.floorY ?? 0;
    const rows = [];
    const push = (owner, kind, b) => rows.push({
      owner, kind,
      top: +(b.max.y - fy).toFixed(3), base: +(b.min.y - fy).toFixed(3),
      w: +(b.max.x - b.min.x).toFixed(2), d: +(b.max.z - b.min.z).toFixed(2),
    });
    for (const sp of e.room.spaces) for (const b of sp.colliders) push(sp.id, 'collider', b);
    for (const p of e.room.panels) {
      for (const b of p.solidBoxes()) push(p.id, p.spec?.free ? 'free-panel' : 'panel', b);
    }
    // the exterior yard's walls are a flat list that belongs to no space — and only the LIVE
    // yard registers any, so this is one site's worth and not the whole set (see STEP_H).
    const ext = e.room.exteriorSolids ?? [];
    for (const b of ext) push('exterior', 'exterior', b);
    return { fy, rows, spaces: e.room.spaces.length, panels: e.room.panels.length, ext: ext.length };
  });
  if (!census) { fail('the house can be censused', 'no engine.room'); return; }

  const BUCKETS = [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.80, 0.90, 1.00, 1.20];
  const lines = [];
  for (let i = 0; i < BUCKETS.length - 1; i++) {
    const lo = BUCKETS[i], hi = BUCKETS[i + 1];
    const hit = census.rows.filter((r) => r.top > lo + 1e-6 && r.top <= hi + 1e-6);
    if (!hit.length) continue;
    const by = {};
    for (const h of hit) by[h.kind] = (by[h.kind] ?? 0) + 1;
    lines.push(`  (${lo.toFixed(2)}, ${hi.toFixed(2)}]  ${String(hit.length).padStart(4)}  `
      + Object.entries(by).map(([k, v]) => `${k}x${v}`).join(' ')
      + `   e.g. ${hit.slice(0, 3).map((h) => `${h.owner}@${h.top}`).join(', ')}`);
  }
  note(`floorY ${census.fy} · ${census.rows.length} boxes total `
    + `(${census.spaces} spaces, ${census.panels} panels, ${census.ext} exterior)`);
  note(`TOPS BY BAND — everything in a band becomes walk-through at that step height:\n`
    + (lines.join('\n') || '  (nothing at all between 0.30 and 1.20 m)'));
  note(`EXTERIOR SOLIDS (the level boundary): `
    + JSON.stringify(census.rows.filter((r) => r.kind === 'exterior')
      .map((r) => ({ top: r.top, w: r.w, d: r.d }))));
  note(`the twenty lowest static colliders: `
    + JSON.stringify(census.rows.filter((r) => r.kind === 'collider')
      .sort((a, b) => a.top - b.top).slice(0, 20)
      .map((r) => `${r.owner} top ${r.top} (${r.w}x${r.d})`)));
  pass('the house can be censused', `${census.rows.length} boxes read off the live room`);
}
