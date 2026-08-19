#!/usr/bin/env node
/**
 * PERF A/B — time two or more configurations of the SAME view, interleaved, in ONE browser.
 *
 * WHY THIS EXISTS. Absolute GPU numbers on this machine drift ~30% with heat, so a number
 * measured this morning cannot be compared with one measured this afternoon — and every
 * perf argument this project has had was an argument about exactly that comparison. The
 * only sound form is both sides back to back, alternating, in one session. `perf-ao` did
 * that by hand and it is the reason the AO change could be judged; `critic-estate-7` could
 * NOT do it for `room.ballroom` because the round it was judging left no toggle behind, and
 * a 2.24 ms reading sat unattributed for a round because of it. This tool is the general
 * form, so the next ablation does not have to re-derive it.
 *
 *   node harness/perf-ab.mjs --view room.ballroom --extra "quality=medium" \
 *        --config "planar:mirror=planar" --config "cube:mirror=cube" --config "off:mirror=off"
 *
 *   --view <id>          the view (one; this tool compares CONFIGS, not views)
 *   --config "name:qs"   a configuration — a label and the query string that selects it.
 *                        Repeatable. Bare "name" means "the default, no extra params".
 *   --extra <qs>         appended to every config. ALWAYS pass quality=medium: `auto` picks
 *                        `high` on a discrete GPU and that is not the target tier.
 *   --rounds <n>         timed rounds per config after the discarded one (default 3)
 *   --window <ms>        sampling window per timed sample (default 2500)
 *   --settle <ms>        idle time after ready, before timing (default 1200)
 *   --probe <js>         evaluated in the page after each settle; the value is recorded with
 *                        the sample. Use it to ASSERT the config actually took effect rather
 *                        than trusting the query string you passed.
 *   --port <n>           vite port to spawn/reuse (default 5178, unchanged from before this
 *                        flag existed — that default is hardcoded on :5178 for four rounds,
 *                        which meant this tool could never run while `shoot.mjs` (also
 *                        hardcoded :5178, no flag of its own) was capturing. Pass a free port
 *                        — same `+opt('port', N)` convention `playtest.mjs`/`mechanics.mjs`/
 *                        `perf-stall.mjs`/`perf-breach2.mjs` already use — to run this
 *                        alongside anything else.
 *   --json <path>        write every sample
 *   --headed
 *
 * ⚠️ THE DISCARDED ROUND IS NOT OPTIONAL AND IT IS ROUND-SHAPED, NOT SAMPLE-SHAPED. A fresh
 * Chromium pays a ~33-36 s cold shader compile, far longer than any settle, so without a
 * whole discarded round the compile lands inside the first config's timed window and the
 * first config in the list is reported as the slow one — which is precisely the bias
 * `perf-spaces.mjs` shipped for its whole life (`--gate` named `study_w` worst in 4 of 6
 * runs purely for being first in `PLACES`). Discarding a whole round is order-independent;
 * skipping N samples is not.
 *
 * ⚠️ ROUNDS ARE INTERLEAVED (A B C, A B C, ...), never blocked (A A A, B B B). Blocked runs
 * put a thermal ramp on the config axis, which is the same failure wearing a hat.
 *
 * ⚠️ Every config RELOADS the page, so each one pays its own view build. That is deliberate:
 * a toggle that only takes effect at build time (a reflection rendered once, a cube
 * allocated once) cannot be flipped live, and a live toggle that stalls settle() for 800
 * frames is its own instrument fault (see the AO motion note in HANDOFF.md).
 *
 * ⚠️ ONE GPU PERF MEASURER AT A TIME. Draw calls are deterministic and exempt; GPU time is not.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const optAll = (n) => { const o = []; for (let i = 0; i < argv.length; i++) if (argv[i] === `--${n}` && argv[i + 1]) o.push(argv[i + 1]); return o; };
const flag = (n) => argv.includes(`--${n}`);

const VIEW = opt('view');
const ROUNDS = +opt('rounds', 3);
const WINDOW_MS = +opt('window', 2500);
const SETTLE_MS = +opt('settle', 1200);
const PROBE = opt('probe');
const PORT = +opt('port', 5178);

if (!VIEW) { console.error('--view is required'); process.exit(2); }

const CONFIGS = optAll('config').map((s) => {
  const i = s.indexOf(':');
  return i < 0 ? { name: s, qs: '' } : { name: s.slice(0, i), qs: s.slice(i + 1) };
});
if (CONFIGS.length < 1) { console.error('at least one --config "name:querystring" is required'); process.exit(2); }

const REF_RATIO = +(process.env.RRR_REF_RATIO ?? 12);
const BUDGET = { gpuMs: 16.67 / REF_RATIO, cpuMs: 8 / 4, calls: 625, tris: 900000 };

const log = (...a) => console.log(...a);
const median = (xs) => {
  const s = xs.filter((x) => x != null).slice().sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
});

// ---------------------------------------------------------------- vite
//
// Spawn `node_modules/vite/bin/vite.js` DIRECTLY with an explicit `--port PORT --strictPort`,
// not `npm run dev`. `package.json`'s `dev` script is itself hardcoded to `--port 5178
// --strictPort` (see package.json), so routing through it would silently rebind to 5178 no
// matter what `--port` this tool was given — the flag would parse and do nothing, exactly the
// lying-instrument pattern this file exists to avoid elsewhere. Same fix `playtest.mjs` and
// `perf-stall.mjs`/`perf-breach2.mjs` already apply for the same reason. Spawning without a
// shell also means `child.kill()` actually kills vite instead of an intermediate cmd.exe,
// which is the other half of why `npm run dev` was the wrong call here.
let child = null;
if (!(await portOpen(PORT))) {
  log(`starting vite on :${PORT}…`);
  child = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'),
    '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', () => {});
  child.stderr.on('data', (d) => process.stderr.write(String(d)));
  const t0 = Date.now();
  while (!(await portOpen(PORT))) {
    if (Date.now() - t0 > 60000) { console.error('vite failed to start'); process.exit(3); }
    await new Promise((r) => setTimeout(r, 250));
  }
}

const browser = await chromium.launch({
  headless: !flag('headed'),
  args: [
    '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization', '--enable-zero-copy', '--disable-frame-rate-limit',
    '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio',
    '--disable-dev-shm-usage',
  ],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

// Silence THIS tab's HMR socket only — a concurrent agent's save otherwise reloads the page
// mid-window. See shoot.mjs's routeWebSocket comment for the full diagnosis.
await page.routeWebSocket(
  (url) => url.hostname === '127.0.0.1' && url.port === String(PORT),
  () => {});

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

const extra = opt('extra') ? '&' + opt('extra') : '';

async function sampleConfig(cfg) {
  const qs = cfg.qs ? '&' + cfg.qs : '';
  const url = `http://127.0.0.1:${PORT}/?view=${encodeURIComponent(VIEW)}&capture=1${extra}${qs}`;
  await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  const tReady = Date.now();
  await page.waitForFunction(
    () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
    null, { timeout: 180000 });
  const readyMs = Date.now() - tReady;
  const err = await page.evaluate(() => window.__rrrError ?? null);
  if (err) throw new Error(`${VIEW} [${cfg.name}] reported an error:\n${err}`);

  await page.evaluate((n) => window.__rrr.settle(n), 12);
  await page.waitForTimeout(SETTLE_MS);

  let probe = null;
  if (PROBE) probe = await page.evaluate(`(() => { try { return (${PROBE}); } catch (e) { return 'PROBE ERROR: ' + e.message; } })()`);

  await page.evaluate(() => window.__rrr.engine.resetPerf());
  await page.waitForTimeout(WINDOW_MS);
  const p = await page.evaluate(() => window.__rrr.perf());
  return { ...p, readyMs, probe };
}

// ---------------------------------------------------------------- run
const samples = [];
log(`  ${VIEW} — ${CONFIGS.length} configs x ${ROUNDS} timed rounds, ${WINDOW_MS} ms windows`);
log('  (discarding one full interleaved round — a fresh Chromium\'s cold shader compile'
  + ' outlives any settle, and it must not land on whichever config happens to be first)');

for (let r = 0; r <= ROUNDS; r++) {
  const discard = r === 0;
  for (const cfg of CONFIGS) {
    const s = await sampleConfig(cfg);
    if (discard) {
      log(`  [discard] ${cfg.name.padEnd(8)} gpu ${String(s.gpuMs).padStart(5)}  cpu ${String(s.cpuMs).padStart(5)}`
        + `  ${String(s.calls).padStart(4)} calls  ready ${(s.readyMs / 1000).toFixed(1)}s`);
      continue;
    }
    samples.push({ round: r, config: cfg.name, ...s });
    log(`  round ${r}   ${cfg.name.padEnd(8)} gpu ${String(s.gpuMs).padStart(5)}  cpu ${String(s.cpuMs).padStart(5)}`
      + `  ${String(s.calls).padStart(4)} calls  ${String((s.tris / 1000) | 0).padStart(4)}k tris`
      + (s.probe != null ? `  probe ${JSON.stringify(s.probe)}` : ''));
  }
}

// ---------------------------------------------------------------- report
log('');
log(`  config     gpuMs (median of ${ROUNDS})   cpuMs      calls     tris     spread(gpu)`);
const table = [];
for (const cfg of CONFIGS) {
  const mine = samples.filter((s) => s.config === cfg.name);
  const g = mine.map((s) => s.gpuMs), c = mine.map((s) => s.cpuMs);
  const gm = median(g), spread = g.length ? Math.max(...g) - Math.min(...g) : 0;
  table.push({ name: cfg.name, gpuMs: gm, cpuMs: median(c), calls: mine[0]?.calls, tris: mine[0]?.tris, spread, all: g });
  log(`  ${cfg.name.padEnd(10)} ${String(gm).padStart(6)}            ${String(median(c)).padStart(5)}`
    + `      ${String(mine[0]?.calls).padStart(4)}   ${String(((mine[0]?.tris ?? 0) / 1000) | 0).padStart(5)}k`
    + `     ${spread.toFixed(2)}   [${g.join(' ')}]`);
}

// ⚠️ A DELTA SMALLER THAN THE WITHIN-CONFIG SPREAD IS NOT A MEASUREMENT. Stated in the output
// rather than left for the reader, because the whole point of this tool is to stop people
// attributing a difference that the instrument cannot resolve.
const base = table[0];
log('');
for (const t of table.slice(1)) {
  const d = (t.gpuMs ?? 0) - (base.gpuMs ?? 0);
  const noise = Math.max(base.spread, t.spread);
  log(`  ${t.name} vs ${base.name}: gpu ${d >= 0 ? '+' : ''}${d.toFixed(2)} ms`
    + `  (within-config spread up to ${noise.toFixed(2)} ms — ${Math.abs(d) > noise ? 'RESOLVED' : 'NOT RESOLVED, treat as zero'})`);
}
log('');
log(`  budget gpu ${BUDGET.gpuMs.toFixed(2)} ms · cpu ${BUDGET.cpuMs.toFixed(2)} ms · ${BUDGET.calls} calls · ${BUDGET.tris / 1000}k tris`);
log(`  ${samples[0]?.gpu ?? ''}  quality=${samples[0]?.quality ?? '?'}  passes=${JSON.stringify(samples[0]?.passes ?? {})}`);
if (pageErrors.length) log(`  ! page errors: ${pageErrors.slice(0, 3).join(' | ')}`);

if (opt('json')) await writeFile(opt('json'), JSON.stringify({ view: VIEW, extra, configs: CONFIGS, budget: BUDGET, samples, table }, null, 2));

await browser.close();
if (child) child.kill();
