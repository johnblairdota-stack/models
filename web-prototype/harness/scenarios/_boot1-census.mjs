/**
 * boot-1 PROGRAM CENSUS — where do the ~1054 warm-up shader compiles actually come from?
 *
 * `_warmup-receipt.mjs` reports the TOTAL. It cannot say whether the total is "many distinct
 * materials" or "few materials multiplied by a cache-key field". This reads three.js's own
 * program cache keys off `renderer.info.programs` and answers that mechanically:
 *
 *   1. how many programs exist, and how many the lap built
 *   2. for every field position in the comma-joined cache key, how many distinct values it
 *      takes, and — the number that matters — how many distinct programs SURVIVE if that one
 *      field is collapsed. A field whose collapse takes 1581 -> 400 is multiplying the whole
 *      set by ~4 on its own.
 *   3. the same collapse for every PAIR of the top-varying fields, so a light-count x
 *      shadow-count interaction cannot hide behind two separate single-field numbers.
 *
 * The field indices are three.js `getProgramCacheKey`'s array order (r180), so index 46-ish is
 * numPointLights etc. — but this deliberately does NOT hardcode that. It reports the indices
 * that actually vary and lets the caller name them from the source.
 */
export default async function boot1Census({ page, note, pass, fail, skip }) {
  const data = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e) return null;
    const progs = e.renderer.info.programs ?? [];
    return {
      quality: e.qualityName,
      stats: e.warmupStats ?? null,
      total: progs.length,
      keys: progs.map((p) => p.cacheKey),
      names: progs.map((p) => p.name),
      used: progs.map((p) => p.usedTimes),
    };
  });
  if (!data) { skip('program census', 'engine not reachable'); return; }

  note(`quality tier: ${data.quality}`);
  if (data.stats) {
    const w = data.stats;
    note(`warmupStats: programs ${w.programs.before} -> ${w.programs.after} (+${w.programs.after - w.programs.before}), warmMs ${w.warmMs}, renders ${w.renders}, spaces ${w.spaces}, gunLights ${w.gunLights}, pointLights ${w.pointLights}, warmRes ${JSON.stringify(w.warmRes)}`);
  } else {
    note('warmupStats ABSENT — the warm-up block did not run (capture mode?)');
  }
  note(`renderer.info.programs total: ${data.total}`);

  // ---- shaderID / material-type histogram --------------------------------------------
  const byName = new Map();
  for (const n of data.names) byName.set(n, (byName.get(n) ?? 0) + 1);
  const nameRows = [...byName.entries()].sort((a, b) => b[1] - a[1]);
  note(`distinct program NAMES: ${nameRows.length}`);
  for (const [n, c] of nameRows.slice(0, 12)) note(`   name ${JSON.stringify(n)} x ${c}`);

  // ---- per-field collapse ------------------------------------------------------------
  const toks = data.keys.map((k) => String(k).split(','));
  const width = Math.max(...toks.map((t) => t.length));
  const distinctAll = new Set(data.keys).size;
  note(`distinct cache keys: ${distinctAll} (of ${data.total} program objects)`);
  note(`cache key field count: ${width}`);

  const collapse = (idxs) => {
    const s = new Set();
    for (const t of toks) {
      const c = t.slice();
      for (const i of idxs) c[i] = '*';
      s.add(c.join(','));
    }
    return s.size;
  };

  const rows = [];
  for (let i = 0; i < width; i++) {
    const vals = new Set(toks.map((t) => t[i]));
    if (vals.size <= 1) continue;
    rows.push({ i, n: vals.size, after: collapse([i]), vals: [...vals].slice(0, 8).join('|') });
  }
  rows.sort((a, b) => a.after - b.after);
  note(`--- fields that VARY (${rows.length} of ${width}); "after" = distinct keys once collapsed ---`);
  for (const r of rows) {
    note(`   field[${r.i}] ${r.n} values -> ${r.after} keys (x${(distinctAll / r.after).toFixed(2)})  values: ${r.vals}`);
  }

  // ---- pairwise collapse of the six strongest single fields --------------------------
  const top = rows.slice(0, 6).map((r) => r.i);
  note('--- pairwise collapse of the six strongest fields ---');
  for (let a = 0; a < top.length; a++) {
    for (let b = a + 1; b < top.length; b++) {
      note(`   collapse[${top[a]},${top[b]}] -> ${collapse([top[a], top[b]])} keys`);
    }
  }
  if (top.length) note(`   collapse ALL six [${top.join(',')}] -> ${collapse(top)} keys`);

  // ---- duplicate detection: same key, more than one program object -------------------
  const dupes = data.total - distinctAll;
  if (dupes === 0) pass('no duplicate programs', 'every program object has a distinct cache key — the lap is not re-compiling the same thing');
  else fail('no duplicate programs', `${dupes} program objects share a cache key with another`);

  if (data.stats) pass('census read the warm-up receipt', `${data.stats.programs.after - data.stats.programs.before} built by the lap`);
  else fail('census read the warm-up receipt', 'no warmupStats');
}
