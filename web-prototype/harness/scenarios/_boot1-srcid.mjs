/**
 * boot-1 SOURCE-IDENTITY CENSUS — how many of the load's shader compiles are the SAME SHADER?
 *
 * The cache-key census (`_boot1-census.mjs`) says how many PROGRAMS three.js built. It cannot
 * say whether those programs are genuinely different shaders or the same GLSL compiled many
 * times under different cache keys — and that distinction is the whole question, because
 * `wall.js` deliberately makes the key unique per panel per layer and its own comment claims
 * the result is "all from identical source, which the driver dedupes anyway".
 *
 * This tests that claim directly and at the only level that cannot lie: it pulls the ACTUAL
 * compiled GLSL back out of the GL context with `gl.getShaderSource(program.vertexShader)` and
 * hashes it. Two programs with the same source pair are the same compile done twice.
 *
 * Reports, in order of what a load-time decision needs:
 *   - programs built, distinct cache keys, DISTINCT SOURCE PAIRS
 *   - the redundancy factor (programs / distinct sources)
 *   - the worst offenders: one source pair compiled N times, with the names and the cache-key
 *     fields that differ between the copies
 */
export default async function boot1SrcId({ page, note, pass, fail, skip }) {
  const data = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e) return null;
    const gl = e.renderer.getContext();
    const progs = e.renderer.info.programs ?? [];
    // FNV-1a, two independent seeds, joined — 64 bits of key across ~700 items makes an
    // accidental collision (which would UNDER-report redundancy, the dangerous direction)
    // vanishingly unlikely.
    const h = (s, seed) => {
      let x = seed >>> 0;
      for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; }
      return x.toString(36);
    };
    const rows = [];
    let unreadable = 0;
    for (const p of progs) {
      let vs = null, fs = null;
      try { vs = gl.getShaderSource(p.vertexShader); fs = gl.getShaderSource(p.fragmentShader); } catch (err) { /* below */ }
      if (vs == null || fs == null) { unreadable++; continue; }
      rows.push({
        name: p.name, key: p.cacheKey, used: p.usedTimes,
        src: h(vs, 2166136261) + ':' + h(fs, 2166136261) + ':' + h(fs, 987654321) + ':' + fs.length + ':' + vs.length,
      });
    }
    return {
      quality: e.qualityName, stats: e.warmupStats ?? null,
      total: progs.length, unreadable, rows,
    };
  });
  if (!data) { skip('source-identity census', 'engine not reachable'); return; }

  note(`quality tier: ${data.quality}`);
  if (data.stats) {
    const w = data.stats;
    note(`warmupStats: ${w.programs.before} -> ${w.programs.after} (+${w.programs.after - w.programs.before}) programs, warmMs ${w.warmMs}`);
  }
  if (data.unreadable) note(`⚠️ ${data.unreadable} program(s) would not give up their source — excluded`);

  const rows = data.rows;
  const bySrc = new Map();
  for (const r of rows) {
    if (!bySrc.has(r.src)) bySrc.set(r.src, []);
    bySrc.get(r.src).push(r);
  }
  const distinctKeys = new Set(rows.map((r) => r.key)).size;
  note(`programs read: ${rows.length} · distinct cache keys: ${distinctKeys} · DISTINCT SOURCE PAIRS: ${bySrc.size}`);
  note(`redundancy factor: ${(rows.length / bySrc.size).toFixed(2)}x — that many compiles per genuinely distinct shader`);

  const groups = [...bySrc.values()].sort((a, b) => b.length - a.length);
  let redundant = 0;
  for (const g of groups) redundant += g.length - 1;
  note(`REDUNDANT COMPILES (same GLSL, compiled again under a different key): ${redundant} of ${rows.length}`);

  note('--- the ten source pairs compiled most often ---');
  for (const g of groups.slice(0, 10)) {
    const names = [...new Set(g.map((r) => r.name))];
    const nameStr = names.length === 1
      ? JSON.stringify(String(names[0]).slice(0, 60))
      : `${names.length} names: ${names.slice(0, 3).map((n) => JSON.stringify(String(n).slice(0, 40))).join(' ')}`;
    // which cache-key fields differ inside this group
    const toks = g.map((r) => String(r.key).split(','));
    const width = Math.max(...toks.map((t) => t.length));
    const diff = [];
    for (let i = 0; i < width; i++) {
      const v = new Set(toks.map((t) => t[i]));
      if (v.size > 1) diff.push(`field[${i}]=${v.size}`);
    }
    note(`   x${g.length}  ${nameStr}  differing key fields: ${diff.join(' ') || 'NONE (identical keys?!)'}`);
    if (g.length > 1) note(`        e.g. last field: ${JSON.stringify(String(toks[0][width - 1]).slice(0, 70))} vs ${JSON.stringify(String(toks[1][width - 1]).slice(0, 70))}`);
  }

  if (bySrc.size > 0) pass('source-identity census ran', `${bySrc.size} distinct shaders behind ${rows.length} programs`);
  else fail('source-identity census ran', 'no program sources could be read');
}
