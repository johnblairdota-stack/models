#!/usr/bin/env node
/**
 * CAPTURE char.lineup — every player robot we have built, on one ground line.
 *
 *   node harness/_lineup_shot.mjs [--names] [--all]
 *
 * WHY IT BUILDS RATHER THAN USING `npm run dev`: the dev server has been observed handing back
 * garbled modules on this project (a SyntaxError inside a COMMENT, whose text changes between
 * runs). A production build served statically is the configuration the .bat files actually open,
 * so it is the one worth proving.
 *
 * WHAT IT ASSERTS. A screenshot is not proof on its own — an empty Group stands on the ground at
 * 1.7 m and photographs as "that robot is invisible" rather than "that file 404'd". So:
 *
 *   1. every page error and failed request is collected and FAILS the run
 *   2. the view's own per-entry triangle report is read back out of the console
 *   3. the frame is measured for ink: a row of N robots must cover a real share of the canvas
 *
 * CONTROL THAT MUST FAIL: `--control-missing` points one roster entry at a URL that does not
 * exist. The view is supposed to throw on a 0-triangle load, so this run must NOT reach a
 * screenshot. If it ever does, the guard above it is decorative.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5188;
const OUT = path.join(ROOT, 'harness', 'out', 'lineup');
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const log = (...a) => console.log(' ', ...a);

fs.mkdirSync(OUT, { recursive: true });

// ---- build ---------------------------------------------------------------
log('building…');
await new Promise((res, rej) => {
  const p = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'],
    { cwd: ROOT, stdio: 'inherit', shell: true });
  p.on('exit', (c) => (c === 0 ? res() : rej(new Error(`build failed (${c})`))));
});

// ---- serve dist ----------------------------------------------------------
const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: 'ignore', shell: true });
const alive = async () => {
  try { const r = await fetch(`http://localhost:${PORT}/`); return r.ok; } catch { return false; }
};
{
  const t0 = Date.now();
  while (!(await alive())) {
    if (Date.now() - t0 > 60000) { console.error('preview failed to start'); process.exit(3); }
    await new Promise((r) => setTimeout(r, 400));
  }
}
log(`preview up on ${PORT}`);

// ---- shoot ---------------------------------------------------------------
/*
 * ⚠️ THE GPU ARGS ARE NOT OPTIONAL, THEY ARE THE DIFFERENCE BETWEEN 40 SECONDS AND NEVER.
 *
 * A plain `chromium.launch()` falls back to software rendering, and this project's surfaces are
 * GPU-BAKED at load. The first attempt sat past a 180 s ready wait and then past 12 minutes with
 * no frame — it read exactly like a hang, and the temptation was to raise the timeout. The house
 * probes (`_be1_field.mjs`, `_ball1_probe.mjs`) all pass these; matching them made the same
 * scene ready in well under a minute.
 */
const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--force-device-scale-factor=1'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

const errors = [];
const failed = [];
page.on('pageerror', (e) => errors.push(e.message));
let lineupLine = null;
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
  if (m.text().startsWith('[char.lineup]')) { lineupLine = m.text(); log(m.text()); }
});
page.on('requestfailed', (r) => failed.push(`${r.url()} — ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.url()} — HTTP ${r.status()}`); });

/*
 * 🚨 `capture=1` IS LOAD-BEARING, NOT DECORATION.
 *
 * `__rrr.settle(n)` is a CAPTURE-MODE facility: the deterministic `_captureLoop` is what counts
 * settle targets down. Without `capture=1` the engine runs its ordinary loop, `settle()` never
 * resolves, and the probe hangs forever AFTER the page has gone ready — which is exactly what
 * happened here and read like a throttled-rAF hang. It was measured instead of guessed: with the
 * view ready, rAF was ticking at 59.3/sec and `settle(12)` still never returned.
 *
 * Every house probe passes it. So does this one.
 */
const q = new URLSearchParams({ view: 'char.lineup', quality: 'high', capture: '1' });
if (has('--names')) q.set('names', '1');
const animArg = (() => { const i = argv.indexOf('--anim'); return i < 0 ? null : argv[i + 1]; })();
if (animArg) q.set('anim', animArg);
if (has('--noui')) q.set('ui', '0');
if (has('--all')) q.set('all', '1');
if (has('--control-missing')) q.set('missing', '1');
const url = `http://localhost:${PORT}/?${q}`;
log(`opening ${url}`);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });

/*
 * 🚨 A FIXED `waitForTimeout` PHOTOGRAPHED THE LOADING SCREEN AND THIS SCRIPT REPORTED "OK".
 *
 * The first version waited 6 s and shot the frame. `attachIdentity` runs GPU bakes and the app's
 * own splash says the first load takes 25-30 s, so the capture was the splash — and NEITHER
 * guard caught it: there were no page errors, and the ink test read 100% because the splash is
 * dark and the test was comparing against a flat light grey that the studio never actually
 * paints. A timer is not a readiness signal.
 *
 * Now it waits on two things the app itself asserts:
 *   1. `body[data-rrr-ready]`, set by `engine.markReady()`
 *   2. `__rrr.settle(n)`, which resolves only after n frames have actually RENDERED
 * plus the view's own `[char.lineup]` console line, which is printed only once every robot in
 * the roster has loaded and been placed.
 */
/*
 * Waits for ready OR error, the way the house probes do. Waiting only for READY turns a view
 * that threw during load into a timeout, which reads as "slow" and invites raising the limit —
 * the actual failure then never gets looked at.
 */
/*
 * 🚨 `polling: 500`, NOT THE DEFAULT.
 *
 * Playwright's `waitForFunction` polls on requestAnimationFrame by default, and rAF is throttled
 * in a page that is not visible — the documented reason the in-app Browser pane cannot boot this
 * project at all. The predicate therefore almost never runs, and the wait times out on a page
 * that went ready seconds in. Watched happening twice here: the view printed its load report and
 * then the probe sat for twenty minutes with `data-rrr-ready` already set. A wall-clock interval
 * does not depend on the page being allowed to animate.
 */
await page.waitForFunction(
  () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
  null, { timeout: 240000, polling: 500 });
if (await page.evaluate(() => document.body.dataset.rrrError === '1')) {
  // Bail here rather than push an error and carry on. A view that failed to load never calls
  // `engine.start()`, so the `settle()` below would hang forever and the run would look like a
  // timeout instead of the clean, fast failure the control is meant to produce. Watched: the
  // `--control-missing` arm printed this line and then sat past ten minutes.
  console.error('\n!! FAIL: the view reported an error during load — see the page errors above\n');
  errors.forEach((e) => console.error('  ' + e));
  failed.forEach((e) => console.error('  ' + e));
  await browser.close();
  server.kill();
  process.exit(9);
}
await page.evaluate(async () => { await window.__rrr?.settle?.(12); });

const shot = path.join(OUT, animArg
  ? 'lineup_' + animArg + '.png'
  : (has('--all') ? 'lineup_all.png' : 'lineup.png'));
await page.screenshot({ path: shot });

// ---- measure: is there actually a row of robots in the frame? -------------
/*
 * ⚠️ THE INK TEST DOES NOT ASSUME A BACKGROUND COLOUR. The first version hardcoded the studio's
 * light grey and read 100% of the frame as subject on a dark splash screen — the documented
 * trap on this project is that the background is a GRADIENT, so "not this one colour" selects
 * everything. Instead the top-left 3% of the frame is sampled as the local background, and each
 * COLUMN is compared to the background at its own height. That survives a gradient in either
 * axis, and it is what makes the band count mean "figures" rather than "noise".
 */
const ink = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  if (!c) return null;
  const W = 400, Hh = 225;
  const g = document.createElement('canvas');
  g.width = W; g.height = Hh;
  const ctx = g.getContext('2d');
  ctx.drawImage(c, 0, 0, W, Hh);
  const d = ctx.getImageData(0, 0, W, Hh).data;
  const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };

  // background reference PER ROW, taken from the far left and far right edges
  const rowBg = [];
  for (let y = 0; y < Hh; y++) {
    const a = at(2, y), b = at(W - 3, y);
    rowBg.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
  }
  let subj = 0;
  const cols = new Array(W).fill(0);
  for (let y = 0; y < Hh; y++) {
    const bg = rowBg[y];
    for (let x = 0; x < W; x++) {
      const p = at(x, y);
      if (Math.abs(p[0] - bg[0]) > 16 || Math.abs(p[1] - bg[1]) > 16 || Math.abs(p[2] - bg[2]) > 16) {
        subj++; cols[x]++;
      }
    }
  }
  let bands = 0, run = false;
  for (const v of cols) {
    const on = v > 4;
    if (on && !run) bands++;
    run = on;
  }
  return { frac: subj / (W * Hh), bands, w: c.width, h: c.height };
});

const lay = await page.evaluate(() => window.__lineup ?? null);

await browser.close();
server.kill();

// ---- verdict -------------------------------------------------------------
console.log('');
if (errors.length) { console.error('PAGE ERRORS:'); errors.forEach((e) => console.error('  ' + e)); }
if (failed.length) { console.error('FAILED REQUESTS:'); failed.forEach((e) => console.error('  ' + e)); }
if (!ink) { console.error('!! FAIL: no canvas in the page'); process.exit(2); }
log(`canvas ${ink.w}x${ink.h}  subject ${(ink.frac * 100).toFixed(1)}% of frame  ` +
    `${ink.bands} vertical band(s) of ink`);
log(`wrote ${shot}`);

const wantN = has('--all') ? 6 : 3;
if (errors.length || failed.length) { console.error('\n!! FAIL: the page did not load clean\n'); process.exit(1); }
if (!lineupLine) {
  console.error('\n!! FAIL: the view never printed its load report — this frame is not the ' +
    'lineup, and a splash screen has been photographed here before\n');
  process.exit(4);
}
if (/=0tris/.test(lineupLine)) { console.error('\n!! FAIL: a roster entry loaded 0 triangles\n'); process.exit(5); }
if (ink.frac < 0.02) { console.error('\n!! FAIL: frame is essentially empty\n'); process.exit(2); }

/*
 * PLACEMENT IS CHECKED FROM THE SCENE, NOT FROM PIXELS. See the note in char-lineup.js: the
 * pixel band count reported one figure for three, twice, for two different reasons. `ink.frac`
 * is kept because "the frame is not blank" is still worth asserting and does not depend on
 * separating figures; the band count is gone.
 */
if (!lay || lay.length !== wantN) {
  console.error(`\n!! FAIL: the view published ${lay ? lay.length : 'no'} figure position(s), ` +
    `expected ${wantN}\n`);
  process.exit(6);
}
for (const e of lay) {
  if (e.ndcMin < -1 || e.ndcMax > 1) {
    console.error(`\n!! FAIL: ${e.key} runs off the frame ` +
      `[${e.ndcMin.toFixed(2)}, ${e.ndcMax.toFixed(2)}] — the row is cropped\n`);
    process.exit(7);
  }
}
const sorted = [...lay].sort((a, b) => a.ndcMin - b.ndcMin);
for (let i = 1; i < sorted.length; i++) {
  if (sorted[i].ndcMin < sorted[i - 1].ndcMax) {
    console.error(`\n!! FAIL: ${sorted[i - 1].key} and ${sorted[i].key} overlap on screen — ` +
      `two robots are standing in the same place\n`);
    process.exit(8);
  }
}
log('placement: ' + lay.map((e) => `${e.key}[${e.ndcMin.toFixed(2)},${e.ndcMax.toFixed(2)}]`).join(' '));
console.log('\nOK\n');
