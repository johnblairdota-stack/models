/**
 * boot-1: DOES THE DRIVER'S ON-DISK PROGRAM CACHE MAKE THE SECOND LOAD FAST?
 *
 * Every harness run to date has launched a FRESH Chromium profile, so the GPU driver's
 * compiled-program cache is empty on every single run — which means the harness has only ever
 * measured a cold load and nobody has ever measured John's second one. This uses ONE persistent
 * profile directory and loads the page N times through it, reporting time-to-ready and the
 * warm-up's own `warmMs` for each.
 *
 *   node harness/_boot1-cache.mjs [--loads 3] [--port 5402] [--q "quality=high"] [--fresh]
 *
 * Measured 2026-08-08 (boot-1), ANGLE / NVIDIA RTX 3060 Ti D3D11, `quality=high`, 1280x720:
 * **82.4 s -> 15.3 s -> 14.8 s to ready**, with the program count identical to the digit on all
 * three (231 -> 693). So the cache is real, the second load is 82% cheaper, and every boot figure
 * anywhere else in this project is a COLD figure that most players never pay twice.
 *
 * ⚠️ `--fresh` wipes the profile, which is what makes a run a cold one. WITHOUT it the first
 * reported load is already warm and the headline result silently disappears.
 * ⚠️ The profile lives under the OS temp dir on purpose — the repo root is already carrying 55
 * stray PNGs and this tool would otherwise add a multi-megabyte directory to it every run.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { rm } from 'node:fs/promises';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PORT = +opt('port', 5402);
const LOADS = +opt('loads', 3);
const QS = opt('q', 'quality=high');
const PROFILE = opt('profile', path.join(os.tmpdir(), 'rrr-boot1-profile'));
const FRESH = argv.includes('--fresh');

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, 'localhost');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 700);
});

let vite = null;
if (!(await portOpen(PORT))) {
  vite = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'),
    '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  const t0 = Date.now();
  while (!(await portOpen(PORT))) {
    if (Date.now() - t0 > 25000) { vite.kill(); throw new Error('vite did not start'); }
    await new Promise((r) => setTimeout(r, 300));
  }
}
console.log(`  server on :${PORT}`);

if (FRESH) { await rm(PROFILE, { recursive: true, force: true }); console.log('  profile wiped — this run is COLD'); }

const STUB = `const noop = () => {};
export const createHotContext = () => ({ accept: noop, acceptExports: noop, dispose: noop,
  prune: noop, decline: noop, invalidate: noop, on: noop, off: noop, send: noop, data: {} });
export const updateStyle = () => {};
export const removeStyle = () => {};
export const injectQuery = (url) => url;
export const ErrorOverlay = class {};
`;

const rows = [];
for (let i = 1; i <= LOADS; i++) {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    viewport: { width: 1280, height: 720 },
  });
  const page = await ctx.newPage();
  await page.route('**/@vite/client', (route) => route.fulfill({
    status: 200, contentType: 'application/javascript', body: STUB,
  }));
  let navs = 0;
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs++; });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).split('\n')[0].slice(0, 120)));

  const url = `http://localhost:${PORT}/?view=game.play${QS ? '&' + QS : ''}`;
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'networkidle' });
  let ready = false;
  for (;;) {
    ready = await page.evaluate(() => window.__rrr?.ready === true).catch(() => false);
    if (ready) break;
    if (Date.now() - t0 > 300000) break;
    await page.waitForTimeout(250);
  }
  const ms = Date.now() - t0;
  const s = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    return e ? { warmMs: e.warmupStats?.warmMs ?? null, before: e.warmupStats?.programs?.before ?? null,
      after: e.warmupStats?.programs?.after ?? null, gpu: (() => {
        try {
          const gl = e.renderer.getContext();
          const d = gl.getExtension('WEBGL_debug_renderer_info');
          return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/a';
        } catch (x) { return 'n/a'; }
      })(), tier: e.qualityName } : null;
  }).catch(() => null);
  rows.push({ i, ready, ms, navs, errs: errs.length, ...(s ?? {}) });
  console.log(`  load ${i}: ready=${ready} ${(ms / 1000).toFixed(1)} s · warmMs ${s?.warmMs} · programs ${s?.before}->${s?.after} · tier ${s?.tier} · navs ${navs} · pageErrors ${errs.length}`);
  if (i === 1) console.log(`  GPU: ${s?.gpu}`);
  await ctx.close();
  // give the GPU process time to flush its on-disk program cache before the next launch
  await new Promise((r) => setTimeout(r, 2500));
}

console.log('\n  --- summary (same persistent profile every load) ---');
for (const r of rows) console.log(`  load ${r.i}: ${(r.ms / 1000).toFixed(1)} s to ready, lap ${((r.warmMs ?? 0) / 1000).toFixed(1)} s, +${(r.after ?? 0) - (r.before ?? 0)} programs`);
if (rows.length > 1) {
  const d = rows[0].ms - rows[rows.length - 1].ms;
  console.log(`  first -> last: ${(d / 1000).toFixed(1)} s faster (${((d / rows[0].ms) * 100).toFixed(0)}%)`);
}
vite?.kill();
process.exit(0);
