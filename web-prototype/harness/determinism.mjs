#!/usr/bin/env node
/**
 * Determinism gate: capture the same view N times with the same flags and assert the
 * frames are pixel-identical.
 *
 *   node harness/determinism.mjs --view mat.lath
 *   node harness/determinism.mjs --group material --runs 3
 *   node harness/determinism.mjs --all --quiet
 *   node harness/determinism.mjs --explain            (why this gate exists — see below)
 *
 * Exits non-zero if any view drifts.
 *
 * WHAT THIS IS PROTECTING
 * Every A/B on this project, and every grade-gate number, assumes that two captures of
 * unchanged source are the same image. That was false until 2026-08-05 and nothing would
 * have told us: the two captures just quietly differed, and any critic comparing a "before"
 * to an "after" was reading noise as signal. Measured then, with identical flags:
 *
 *     mat.lath        10.1% of PNG bytes differed, mean delta 1.5/255, max 69
 *     room.ballroom   83.1% of PNG bytes differed, mean delta 2.7/255, max 165
 *
 * Two independent causes, both since fixed — see docs/capture-determinism.md for the full
 * write-up, `--explain` for the experiment that isolated them:
 *
 *  1. The capture loop free-ran. rAF is uncapped in the harness, and the loop stepped the
 *     simulation through every Playwright round trip — 790 frames, 13.2 s of simulation,
 *     inside one `page.screenshot()` call. The captured moment was a wall-clock lottery.
 *  2. Two post passes are deliberately frame-variant: the AO's sample rotation (frame % 64)
 *     and the film grain's phase. Both are pinned in capture mode now.
 *
 * Neither was the mechanism first suspected (the async-bake gate in `settle()`): every run
 * probed had `_pendingWork === 0` at ready, and the settle countdown was exact every time.
 * The bake gate was still hardened, because it was structurally able to become a cause.
 *
 * A FAILURE HERE IS NOT COSMETIC. It means the harness cannot tell you whether a change you
 * just made did anything, which makes every downstream number unfalsifiable.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { decodePng, diff, summarise } from './pxdiff.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const argv = process.argv.slice(2);
const flag = (n) => argv.includes('--' + n);
const opt = (n, d = null) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const optAll = (n) => { const o = []; for (let i = 0; i < argv.length; i++) if (argv[i] === '--' + n && argv[i + 1]) o.push(argv[i + 1]); return o; };

const RUNS = +opt('runs', 2);
const SETTLE = +opt('settle', 12);
const WIDTH = +opt('width', 1920);
const HEIGHT = +opt('height', 1080);
const AT = opt('at');
const EXTRA = opt('extra');
const QUIET = flag('quiet');
const KEEP = flag('keep');
const EXPLAIN = flag('explain');
const OUTDIR = opt('outdir', path.join(ROOT, 'progress/determinism'));
const PORT = 5178;
const log = (...a) => { if (!QUIET) console.log(...a); };

// ---------------------------------------------------------------- view list
const viewsSrc = await readFile(path.join(ROOT, 'src/views.js'), 'utf8');
const ALL_IDS = [...viewsSrc.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]);
const GROUP_OF = Object.fromEntries(
  [...viewsSrc.matchAll(/id:\s*'([^']+)',\s*group:\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));

let views = optAll('view');
if (flag('all')) views = ALL_IDS;
const grp = opt('group');
if (grp) views = ALL_IDS.filter((id) => GROUP_OF[id] === grp);
if (!views.length) views = ['mat.lath'];
for (const v of views) {
  if (!ALL_IDS.includes(v)) { console.error(`unknown view "${v}"`); process.exit(2); }
}

// ---------------------------------------------------------------- dev server
const portOpen = (port) => new Promise((res) => {
  const s = net.createConnection({ port, host: '127.0.0.1' }, () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  s.setTimeout(400, () => { s.destroy(); res(false); });
});

let child = null;
if (!(await portOpen(PORT))) {
  log('starting vite…');
  child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'dev', '--', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  const t0 = Date.now();
  while (!(await portOpen(PORT))) {
    if (Date.now() - t0 > 60000) { console.error('vite failed to start'); process.exit(3); }
    await new Promise((r) => setTimeout(r, 250));
  }
}

const browser = await chromium.launch({
  headless: !flag('headed'),
  args: ['--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization', '--enable-zero-copy', '--disable-frame-rate-limit',
    '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio', '--disable-dev-shm-usage'],
});

/** One capture, through the same sequence shoot.mjs uses. */
async function capture(id, outPath) {
  const ctx = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message ?? e)));
  // same Vite-HMR mute as shoot.mjs: a stray full-reload mid-capture is its own bug class
  await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
  try {
    const url = `http://127.0.0.1:${PORT}/?view=${encodeURIComponent(id)}&capture=1`
      + (AT ? `&at=${AT}` : '') + (EXTRA ? `&${EXTRA}` : '');
    await page.goto(url, { waitUntil: 'load', timeout: 45000 });
    await page.waitForFunction(
      () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
      null, { timeout: 300000 });
    const viewErr = await page.evaluate(() => window.__rrrError ?? null);
    if (viewErr) throw new Error('view reported an error: ' + viewErr);
    await page.evaluate((n) => window.__rrr.settle(n), SETTLE);
    const sim = await page.evaluate(() => window.__rrr.simState());
    await page.screenshot({ path: outPath, animations: 'disabled' });
    return { sim, errs };
  } finally { await ctx.close(); }
}

if (EXPLAIN) {
  await explain();
  await browser.close(); if (child) child.kill();
  process.exit(0);
}

await mkdir(OUTDIR, { recursive: true });
const results = [];
let bad = 0;

for (const id of views) {
  const shots = [];
  let sims = [];
  let failed = null;
  try {
    for (let i = 0; i < RUNS; i++) {
      const p = path.join(OUTDIR, `${id}.${i}.png`);
      const r = await capture(id, p);
      shots.push(p); sims.push(r.sim);
    }
  } catch (e) { failed = String(e.message ?? e); }

  if (failed) {
    bad++;
    console.error(`  FAIL ${id}: ${failed}`);
    results.push({ id, ok: false, error: failed });
    continue;
  }

  // Sim state must agree too. If it does not, the image difference is an honest picture of
  // a different moment and the loop is the thing to fix, not the renderer.
  const simDrift = sims.some((s) => s.frame !== sims[0].frame || s.elapsed !== sims[0].elapsed);

  const imgs = shots.map((f) => f);
  const base = decodePng(await readFile(imgs[0]));
  let worst = null;
  for (let i = 1; i < imgs.length; i++) {
    const d = diff(base, decodePng(await readFile(imgs[i])));
    if (!worst || d.diffBytes > worst.diffBytes) worst = d;
  }

  const ok = worst.identical && !simDrift;
  if (!ok) bad++;
  results.push({ id, ok, runs: RUNS, sim: sims[0], simDrift, worst });
  const tag = ok ? 'ok  ' : 'DRIFT';
  log(`  ${tag} ${id.padEnd(18)} t=${sims[0].elapsed.toFixed(4)}s frame ${sims[0].frame}`
    + `  ${summarise(worst)}${simDrift ? '  [SIM CLOCK DRIFTED]' : ''}`);
  if (!KEEP) for (const f of shots) await rm(f, { force: true });
}

await browser.close();
if (child) child.kill();

const summary = path.join(ROOT, 'progress/last-determinism.json');
await mkdir(path.dirname(summary), { recursive: true });
await writeFile(summary, JSON.stringify({ at: new Date().toISOString(), runs: RUNS, results }, null, 2));

console.log(`\n${results.length - bad}/${results.length} views deterministic over ${RUNS} runs`
  + (bad ? ` — ${bad} DRIFTED, see ${path.relative(ROOT, summary)}` : ''));
process.exit(bad ? 1 : 0);

/**
 * The experiment that isolated the cause, kept runnable because a future regression will
 * want it again. It freezes the rAF loop and renders exact frame counts inside one page, so
 * the GPU state is identical across samples and the ONLY variable is the frame index.
 * Expected result on a fixed build: every row IDENTICAL, including "pipe 101" — before the
 * fix, "pipe 100 vs 101" differed by ~7% of bytes while "100 vs 164" (same value mod 64)
 * was bit-identical, which is what proved the AO dither was the driver.
 */
async function explain() {
  const id = views[0];
  const dir = path.join(OUTDIR, '_explain');
  await mkdir(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
  await page.goto(`http://127.0.0.1:${PORT}/?view=${encodeURIComponent(id)}&capture=1`, { waitUntil: 'load', timeout: 45000 });
  await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 300000 });
  await page.evaluate((n) => window.__rrr.settle(n), SETTLE);

  // how much simulation does a screenshot cost? (the free-run measurement)
  const f0 = await page.evaluate(() => window.__rrr.engine.frame);
  await page.screenshot({ path: path.join(dir, 'throwaway.png'), animations: 'disabled' });
  const f1 = await page.evaluate(() => window.__rrr.engine.frame);
  console.log(`frames advanced during one page.screenshot(): ${f1 - f0}`
    + `  (${((f1 - f0) / 60).toFixed(2)} s of simulation)`);
  console.log('  a parked capture loop reports 0 here; a free-running one reported 790.\n');

  await page.evaluate(() => {
    const e = window.__rrr.engine;
    cancelAnimationFrame(e._raf);
    window.__exp = {
      atPipeFrame(f) { e.pipeline.frame = f - 1; e._step(1 / 60, e.frame * (1000 / 60)); },
    };
  });

  const shots = [];
  for (const [name, f] of [['pipe100', 100], ['pipe101', 101], ['pipe100_again', 100], ['pipe164', 164]]) {
    await page.evaluate((n) => window.__exp.atPipeFrame(n), f);
    const p = path.join(dir, `${name}.png`);
    await page.screenshot({ path: p, animations: 'disabled' });
    shots.push([name, p]);
  }
  await ctx.close();

  const imgs = new Map();
  for (const [n, p] of shots) imgs.set(n, decodePng(await readFile(p)));
  console.log(`AO dither sensitivity on ${id} (loop frozen, one render per row):`);
  for (let a = 0; a < shots.length; a++) {
    for (let b = a + 1; b < shots.length; b++) {
      const d = diff(imgs.get(shots[a][0]), imgs.get(shots[b][0]));
      console.log(`  ${shots[a][0].padEnd(14)} vs ${shots[b][0].padEnd(14)} ${summarise(d)}`);
    }
  }
  if (!KEEP) await rm(dir, { recursive: true, force: true });
}
