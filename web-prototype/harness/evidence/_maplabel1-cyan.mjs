/**
 * _maplabel1-cyan.mjs — DID THE CYAN FIX ACTUALLY REACH THE SCREEN?
 *
 * John's report: *"I don't understand the cyan parts either because they are still on the map
 * when I was made to understand they were inside the orange line."* Diagnosis: the cyan family
 * carried three referents — the hard stop (`C.nodig` #3fd0e0), the interconnect (`C.ic`, then
 * #7ef4ff, which is the OPPOSITE meaning), and in the prose the game's indestructible barrier,
 * which is not drawn on the plan at all. The interconnect is now LIME (#b6ff2e) and is called the
 * SOFT SPOT.
 *
 * ⚠️ HANDOFF: *"A probe that cannot observe must report SKIP, never PASS"* and *"if you assert
 * something is on screen, look at a picture of it."* This counts real canvas pixels through
 * `getImageData`, on a real page, over a spread of seeds — it does not read the source back.
 *
 * 🚨 THE CONTROLS, AND BOTH RUN ON EVERY RUN:
 *
 *   A1  THE OLD CYAN IS GONE — zero pixels of the retired #7ef4ff anywhere on the canvas.
 *   A2  THE NEW LIME IS THERE — a non-trivial count of #b6ff2e, and it must be at most a few
 *       tenths of a percent of the canvas (one 1.55 m lozenge per diggable wall, not a fill).
 *   A3  🚨 **CONTROL THAT MUST FAIL.** A1 and A2 are only worth anything if they can see the
 *       mark disappear. The probe unticks the `ic` layer and redraws: the lime count MUST go to
 *       zero and the cyan hard-stop count MUST NOT MOVE. If unticking the soft spot changes the
 *       cyan bars, the two are still coupled and the fix is incomplete.
 *   A4  THE TWO ARE DISTINGUISHABLE — hue separation between the soft spot and the hard stop is
 *       reported in degrees. Under 40° would be the defect coming back in a new outfit.
 *
 * It also fails loudly if the page throws, if the canvas is blank, or if a seed happens to have
 * no diggable wall at all (SKIP, not PASS).
 *
 * Usage:  node harness/evidence/_maplabel1-cyan.mjs        (starts its own server on MAPS_PORT or 5182)
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.MAPS_PORT || 5182);
const SEEDS = [7, 27932, 27943, 27958, 27970, 42];

const RETIRED_CYAN = [0x7e, 0xf4, 0xff];   // the interconnect's old colour — must be extinct
const HARD_STOP = [0x3f, 0xd0, 0xe0];      // C.nodig — must survive, unchanged
const SOFT_SPOT = [0xb6, 0xff, 0x2e];      // C.ic — the new lime

function hue([r, g, b]) {
  const R = r / 255, G = g / 255, B = b / 255;
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn;
  if (!d) return 0;
  let h;
  if (mx === R) h = ((G - B) / d) % 6; else if (mx === G) h = (B - R) / d + 2; else h = (R - G) / d + 4;
  return ((h * 60) + 360) % 360;
}

const out = [];
let fails = 0, skips = 0;
const rec = (state, name, detail) => {
  if (state === 'FAIL') fails++; if (state === 'SKIP') skips++;
  out.push(`${state.padEnd(4)}  ${name}\n        ${detail}`);
};

const srv = spawn(process.execPath, [path.join(ROOT, 'tools', 'mapdesigner', 'serve.mjs')],
  { env: { ...process.env, MAPS_PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

/** count exact-match pixels of each probe colour on the plan canvas */
async function census() {
  return page.evaluate(([cols]) => {
    const cv = document.getElementById('cv');
    const g = cv.getContext('2d', { willReadFrequently: true });
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    const n = cols.map(() => 0);
    let nonBg = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      if (r > 18 || gg > 20 || b > 24) nonBg++;
      for (let k = 0; k < cols.length; k++) {
        if (r === cols[k][0] && gg === cols[k][1] && b === cols[k][2]) { n[k]++; break; }
      }
    }
    return { n, total: d.length / 4, nonBg };
  }, [[RETIRED_CYAN, HARD_STOP, SOFT_SPOT]]);
}

const per = [];
for (const seed of SEEDS) {
  await page.goto(`http://localhost:${PORT}/tools/mapdesigner/?seed=${seed}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__mapdesigner && window.__mapdesigner.plan, null, { timeout: 20000 });
  await page.waitForTimeout(250);
  const on = await census();
  // A3's arm — untick the soft-spot layer and redraw through the tool's own toggle path
  await page.evaluate(() => {
    const el = document.querySelector('#toggles input[data-k="ic"]');
    el.checked = false; el.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(120);
  const off = await census();
  const nDig = await page.evaluate(() => window.__mapdesigner.segs.filter((s) => s.diggable && s.spans.length).length);
  per.push({ seed, on, off, nDig });
}

const shot = path.join(ROOT, 'harness', 'fixtures', '_maplabel1-cyan.png');
await page.goto(`http://localhost:${PORT}/tools/mapdesigner/?seed=27943`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__mapdesigner && window.__mapdesigner.plan, null, { timeout: 20000 });
await page.waitForTimeout(300);
await page.screenshot({ path: shot });

await browser.close();
srv.kill();

// ===========================================================================================
// the assertions
// ===========================================================================================
rec(errors.length === 0 ? 'PASS' : 'FAIL', 'the page runs clean',
  errors.length ? errors.slice(0, 3).join(' | ') : 'no page errors, no console errors across '
    + `${SEEDS.length} seeds`);

const blank = per.filter((p) => p.on.nonBg < 0.02 * p.on.total);
rec(blank.length === 0 ? 'PASS' : 'FAIL', 'the canvas is not blank (captures lie)',
  blank.length ? `seeds ${blank.map((p) => p.seed).join(',')} drew almost nothing`
    : per.map((p) => `${p.seed}: ${(100 * p.on.nonBg / p.on.total).toFixed(1)}% inked`).join(' · '));

// A1
const oldCyan = per.reduce((s, p) => s + p.on.n[0], 0);
rec(oldCyan === 0 ? 'PASS' : 'FAIL', 'A1 the retired interconnect cyan #7ef4ff is extinct',
  `${oldCyan} pixel(s) of #7ef4ff over ${SEEDS.length} seeds — must be 0`);

// A2
const noDigSeeds = per.filter((p) => p.nDig === 0);
const withDig = per.filter((p) => p.nDig > 0);
if (!withDig.length) {
  rec('SKIP', 'A2 the soft spot is drawn', 'no seed in the set had a diggable wall — cannot observe');
} else {
  const bad = withDig.filter((p) => p.on.n[2] < 20 || p.on.n[2] > 0.01 * p.on.total);
  rec(bad.length === 0 ? 'PASS' : 'FAIL', 'A2 the soft spot #b6ff2e is drawn, and is a MARK not a fill',
    withDig.map((p) => `${p.seed}: ${p.on.n[2]} px on ${p.nDig} diggable walls `
      + `(${(100 * p.on.n[2] / p.on.total).toFixed(3)}% of canvas)`).join(' · ')
    + (noDigSeeds.length ? ` · skipped ${noDigSeeds.length} seed(s) with no diggable wall` : ''));
}

// A3 — THE CONTROL THAT MUST FAIL
const limeGone = withDig.every((p) => p.off.n[2] === 0 && p.on.n[2] > 0);
const cyanUnmoved = per.every((p) => p.off.n[1] === p.on.n[1]);
rec(limeGone && cyanUnmoved ? 'PASS' : 'FAIL',
  'A3 🚨 CONTROL — unticking the soft-spot layer removes the lime and NOTHING ELSE',
  per.map((p) => `${p.seed}: lime ${p.on.n[2]}→${p.off.n[2]}, cyan hard-stop ${p.on.n[1]}→${p.off.n[1]}`).join(' · ')
  + (limeGone ? '' : ' · LIME DID NOT GO — A2 cannot see the mark it asserts')
  + (cyanUnmoved ? '' : ' · CYAN MOVED — the two marks are still coupled'));

/**
 * A4 — the soft spot must be far in hue from EVERY other mark that can sit on a wall beside it,
 * not just from the cyan it used to be. The open-door green is the nearest neighbour and is the
 * reason the lime leans yellow rather than green; a door is also a thin bright line inside a
 * black cut, where the soft spot is a fat solid bar proud of the wall, so they differ in
 * silhouette too. Every separation is printed so the choice of hue is auditable rather than taste.
 */
// ⚠️ SCOPE, AND THE FIRST DRAFT OF THIS GATE GOT IT WRONG IN THE EXACT WAY HANDOFF WARNS ABOUT.
// It was written as "not the same colour as anything else" and immediately went red on SPAWN
// YELLOW (36°) — a 5 px labelled pip at a ROOM CENTRE and a 13%-alpha area wash, which cannot be
// mistaken for a bar on a wall. That was a false positive in a gate, so the fix was to make the
// gate's SCOPE match its claim, not to lower its threshold: wall marks are gated at 40°, area
// marks are reported. Moving the number to make a gate green is how a gate stops meaning anything.
const WALL_MARKS = [
  ['cyan hard stop #3fd0e0', HARD_STOP], ['open-door green #67e08a', [0x67, 0xe0, 0x8a]],
  ['breachable amber #ffbe4d', [0xff, 0xbe, 0x4d]], ['dig orange #ff9a3c', [0xff, 0x9a, 0x3c]],
  ['route violet #c98cff', [0xc9, 0x8c, 0xff]], ['hunter magenta #ff4fd8', [0xff, 0x4f, 0xd8]],
  ['chained red #ff6b6b', [0xff, 0x6b, 0x6b]], ['slab violet #8f7bd6', [0x8f, 0x7b, 0xd6]],
];
const AREA_MARKS = [['spawn yellow #ffd75e', [0xff, 0xd7, 0x5e]]];
const sepOf = (c) => { const d = Math.abs(hue(SOFT_SPOT) - hue(c)); return Math.min(d, 360 - d); };
const worst = WALL_MARKS.reduce((a, b) => (sepOf(b[1]) < sepOf(a[1]) ? b : a));
rec(sepOf(worst[1]) >= 40 ? 'PASS' : 'FAIL', 'A4 the soft spot is not the colour of any other mark ON A WALL',
  `soft spot ${hue(SOFT_SPOT).toFixed(0)}° · nearest wall mark is ${worst[0]} at `
  + `${sepOf(worst[1]).toFixed(0)}° (needs ≥ 40°) · all wall marks: `
  + WALL_MARKS.map(([n, c]) => `${n.split(' ')[0]} ${sepOf(c).toFixed(0)}°`).join(' ')
  + ` · reported not gated (area marks, never a bar on a wall): `
  + AREA_MARKS.map(([n, c]) => `${n.split(' ')[0]} ${sepOf(c).toFixed(0)}°`).join(' ')
  + ` · 🚨 the retired #7ef4ff sat ${Math.abs(hue(RETIRED_CYAN) - hue(HARD_STOP)).toFixed(0)}° `
  + 'from the hard stop, which is the defect as a number');

console.log('\n_maplabel1-cyan — one mark, one meaning\n');
for (const l of out) console.log('  ' + l);
console.log(`\n  screenshot: ${shot}`);
console.log(`  ${fails === 0 && skips === 0 ? 'ALL GREEN' : `${fails} FAIL · ${skips} SKIP`}\n`);
process.exit(fails === 0 ? 0 : 1);
