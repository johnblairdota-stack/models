#!/usr/bin/env node
/**
 * BEAMS-1 — THE GRADE'S BLACK POINT, COMPUTED FROM `src/post/shaders.js` ITSELF.
 *
 * The composite is a fixed chain of scalar operations, so the smallest scene radiance that can
 * still produce a non-zero 8-bit pixel is not a matter of opinion: it can be solved. This
 * reimplements COMPOSITE_FRAG's neutral-grey path exactly (the ACES fit preserves neutrals — the
 * input and output matrices both sum to (1,1,1) per row) and bisects for that radiance, then
 * prints how much each grade term contributes to it.
 *
 * ⚠️ It reports a BLACK POINT, not a brightness. The number that matters about a black point is
 * that below it every term is erased *identically* — a light you add, a decal you draw and a
 * material you brighten all return exactly the same picture as doing nothing. That is what makes
 * it look like a broken feature rather than a dim one.
 *
 *   node harness/_beams1_toe.mjs                    # the shipped game grade
 *   node harness/_beams1_toe.mjs --contrast 1.0     # any term overridden
 */
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? +argv[i + 1] : d; };

// views/game.js `setGrade`, over post/pipeline.js's `estate` preset for anything it omits.
const G = {
  exposure: opt('exposure', 1.85),
  haze: opt('haze', 0.042), hazeColor: opt('hazecolor', 0.055),   // green channel
  lift: opt('lift', 0.009), gain: opt('gain', 1.0), gamma: opt('gamma', 1.0),
  contrast: opt('contrast', 1.05), toeCrush: opt('toe', 0.005),
  splitBalance: opt('split', 0.60), shadowTint: opt('shadowtint', 0.96),
  dist: opt('dist', 6.5),                                          // metres to the ceiling band
};

const rrt = (v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
const aces = (v) => Math.min(1, Math.max(0, rrt(v)));

/** scene linear radiance -> 8-bit display value, grain and dither excluded (they are noise). */
function chain(s, g = G) {
  const f = 1 - Math.exp(-g.dist * g.haze);
  let c = s * (1 - f) + g.hazeColor * f;      // haze, BEFORE exposure
  c *= g.exposure;
  c = aces(c);                                 // tonemap
  const sw = Math.pow(1 - Math.min(1, c), 2);
  c *= 1 - (1 - g.shadowTint) * sw * g.splitBalance;
  c = Math.pow(Math.max(0, c * g.gain + g.lift * (1 - c)), 1 / g.gamma);
  c = (c - 0.5) * g.contrast + 0.5;
  c = Math.max(c - g.toeCrush, 0) / Math.max(1 - g.toeCrush, 1e-3);
  return c * 255;
}

function blackPoint(g = G) {
  let lo = 0, hi = 1;
  if (chain(0, g) >= 0.5) return 0;
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (chain(m, g) < 0.5) lo = m; else hi = m; }
  return hi;
}

const base = blackPoint();
console.log(`\nSHIPPED GRADE (views/game.js), ceiling band at ${G.dist} m`);
console.log(`  BLACK POINT = scene linear radiance ${base.toFixed(5)}`);
console.log(`  Below it the composite outputs a literal 0, so grain is the only thing in the pixel.`);
console.log(`  (grain 0.024 is +/- 3.1 bytes clamped at 0 -> a true zero photographs at mean ~0.75)\n`);

console.log('  term ablated                black point   x shipped   what it is worth');
const rows = [
  ['(shipped)', {}],
  ['contrast 1.05 -> 1.0', { contrast: 1.0 }],
  ['toeCrush 0.005 -> 0', { toeCrush: 0 }],
  ['both of the above', { contrast: 1.0, toeCrush: 0 }],
  ['lift 0.009 -> 0', { lift: 0 }],
  ['haze 0.042 -> 0', { haze: 0 }],
  ['exposure 1.85 -> 7.40', { exposure: 7.4 }],
];
for (const [name, over] of rows) {
  const bp = blackPoint({ ...G, ...over });
  console.log(`  ${name.padEnd(26)} ${bp.toFixed(5).padStart(9)}  ${(bp / base).toFixed(2).padStart(8)}x`);
}

console.log(`\n  WHAT THE BEAMS BRING TO IT`);
const albedo = 0.01033;   // 0x1a1713 sRGB -> linear
for (const [what, E] of [['hemisphere ground only (0x3a2a1c x 4.60)', 0.121],
  ['...x1.5 (?ceil=1.5)', 0.181], ['a wall-facing normal (half sky)', 0.526]]) {
  console.log(`    ${what.padEnd(42)} radiance ${(albedo * E / Math.PI).toFixed(5)}` +
    `  = ${((albedo * E / Math.PI) / base * 100).toFixed(1)}% of the black point`);
}
console.log(`\n  WHAT AN ADDITIVE glowPatch BRINGS TO IT`);
console.log(`    glowPatch is AdditiveBlending with premultipliedAlpha FALSE, i.e. SRC_ALPHA/ONE,`);
console.log(`    and it writes vec4(uColor * a, a) -- so it delivers uColor * a SQUARED.`);
for (const [what, a, col] of [['ceiling patch, strength 0.85 (works)', 0.85, 0.55],
  ['toe-lift layer 1, strength 0.100', 0.10, 0.55],
  ['toe-lift layer 2, strength 0.075', 0.075, 0.55],
  ['...layer 2 between disc centres (~7% of strength)', 0.00525, 0.55]]) {
  const d = col * a * a;
  console.log(`    ${what.padEnd(50)} ${d.toFixed(5)}  = ${(d / base * 100).toFixed(1)}% of the black point`);
}
console.log('');
