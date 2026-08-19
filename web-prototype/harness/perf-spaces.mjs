#!/usr/bin/env node
/**
 * PER-SPACE PERF — measure `game.play` where the cost actually lives.
 *
 * WHY THIS EXISTS, and it is not a refinement of `shoot.mjs --perf`; it replaces it for
 * this view. Five solo runs on an idle machine, same build, same command:
 *
 *     gpu 1.15 / 1.28 / 2.09 / 1.39 / 1.15 ms      calls 287 / 122 / — / 409 / 287
 *
 * Three passed the gate and two failed. That spread was blamed for weeks on concurrent
 * agents rebuilding `dist/` mid-capture; with the machine quiet the spread is unchanged, so
 * that explanation is dead. The real cause is that the mansion has PORTAL RESIDENCY: the
 * capture Director walks a 28 s route, and a sample landing in the chapel spur sees one
 * small space while a sample in the ballroom hub sees four. Draw calls swing 122 -> 409
 * because the SCENE is different, not because the timing is noisy.
 *
 * A single scalar cannot describe a game whose cost is a function of where you stand. The
 * old gate therefore passed or failed on where the camera happened to be when the window
 * closed — a coin toss reported as a measurement, which is instrument-hazard #1 in
 * HANDOFF.md wearing a different hat.
 *
 * So: park the camera in every space, in four directions, and gate on the WORST. That is
 * the number that decides whether the game holds 60 fps on integrated graphics, because a
 * player can stand anywhere.
 *
 *   node harness/perf-spaces.mjs
 *   node harness/perf-spaces.mjs --gate --extra "quality=medium"
 *   node harness/perf-spaces.mjs --yaws 8 --window 3000
 *
 *   --gate            exit 1 if the worst space is over budget
 *   --extra <qs>      extra query string (ALWAYS pass quality=medium for a real verdict —
 *                     `auto` picks `high` on a discrete GPU and that is not the target tier)
 *   --window <ms>     sampling window per direction (default 2200)
 *   --yaws <n>        directions sampled per space (default 4)
 *   --port <n>        vite port to spawn/reuse (default 5178, unchanged from before this flag
 *                     existed — but that default is `shoot.mjs`'s port, which is hardcoded and
 *                     has no flag of its own, so a capture in progress blocked this tool
 *                     entirely for four rounds and the per-space GPU budget went unmeasured
 *                     the whole time. Pass a free port — same `+opt('port', N)` convention
 *                     `playtest.mjs`/`mechanics.mjs`/`perf-ab.mjs`/`perf-stall.mjs`/
 *                     `perf-breach2.mjs` already use — to run this alongside anything else.
 *                     The flag is only honest because the vite spawn below invokes `vite.js`
 *                     directly; routed through `npm run dev` it would parse and do nothing.)
 *   --headed          watch it
 *   --json <path>     write the full table
 *
 * WHY THE WINDOW IS SHORT HERE, when `shoot.mjs` needs 28 000 ms on this same view: that
 * long window exists ONLY because the Director keeps changing the scene. Parked, the scene
 * is static, so a couple of seconds of steady-state frames is a better measurement than
 * twenty-eight seconds of averaging six different rooms together.
 *
 * THE HUNTER IS PARKED IN FRAME ON PURPOSE. It is the most expensive single object in the
 * game (a census put it at 322 meshes and 209k of the scene's triangles), so a "worst case"
 * that leaves it in another room is measuring a level, not a game. Every sample here has it
 * 6 m in front of the camera, frozen, with its senses starved so it cannot wander off
 * mid-window and quietly change what is being timed.
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
const flag = (n) => argv.includes(`--${n}`);

const WINDOW_MS = +opt('window', 2200);
const YAWS = +opt('yaws', 4);
// ⚠️ `--port` OVERRIDABLE, because 5178 is `shoot.mjs`'s port and a captured round blocks this
// tool entirely. That collision went unfixed for FOUR consecutive builder rounds — each one
// reported "GPU time not measured, the perf tool hardcodes 5178" and moved on, so the campaign's
// per-space GPU budget went unmeasured the whole time. Nobody fixed the tool. See `perf-ab.mjs`,
// where `harness-fix-1` fixed the identical defect and verified it with netstat.
const PORT = +opt('port', 5178);

// Same reference budget as shoot.mjs: 60 fps at 1080p on integrated graphics, expressed as
// a share of this machine's frame. Kept in sync by hand; if shoot.mjs's BUDGET moves, move
// this. Duplicated rather than imported because shoot.mjs runs its whole capture pipeline
// as a side effect of being imported.
const REF_RATIO = 12;
const BUDGET = { gpuMs: 16.67 / REF_RATIO, cpuMs: 8 / 4, calls: 625, tris: 900000 };

const log = (...a) => console.log(...a);

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
});

// ---------------------------------------------------------------- vite
let child = null;
if (!(await portOpen(PORT))) {
  log(`starting vite on :${PORT}…`);
  // ⚠️ SPAWN `vite.js` DIRECTLY, NOT `npm run dev`. `package.json`'s `dev` script is itself
  // hardcoded to `--port 5178 --strictPort`, so routing through it would rebind to 5178 no matter
  // what `--port` this tool was given — the flag would parse and do nothing, which is the
  // lying-instrument pattern in its purest form. Spawning without a shell also means
  // `child.kill()` kills vite rather than an intermediate cmd.exe. Pattern verified by
  // `harness-fix-1` in `perf-ab.mjs` (netstat-confirmed, no fallback to 5178).
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

// Silence THIS tab's HMR socket only. A concurrent agent's file save otherwise reloads the
// page mid-window; the same race wrote a pure-white PNG through `shoot.mjs` for a day and
// was reported as a render bug. See shoot.mjs's routeWebSocket comment.
await page.routeWebSocket(
  (url) => url.hostname === '127.0.0.1' && url.port === String(PORT),
  () => {});

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

if (flag('nohunter')) await page.addInitScript(() => { window.__rrrNoHunter = true; });

const extra = opt('extra') ? '&' + opt('extra') : '';
await page.goto(`http://127.0.0.1:${PORT}/?view=game.play&capture=1${extra}`,
  { waitUntil: 'load', timeout: 45000 });

let renavigated = false;
page.on('framenavigated', (fr) => { if (fr === page.mainFrame()) renavigated = true; });

const tReady = Date.now();
await page.waitForFunction(
  () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
  null, { timeout: 180000 });
const readyMs = Date.now() - tReady;
if (readyMs > 20000) log(`  ! took ${(readyMs / 1000).toFixed(1)} s to signal ready — cold shader compile`);

// ---------------------------------------------------------------- park & sample
//
// One anchor per space. `room.anchorNames()` carries scenario roles (`hide.*`, `duel.*`)
// as well as places; only the places are wanted here, and one per space so the table has
// exactly six rows. Ballroom takes its centre because that is the hub with three doorways
// in one wall — the residency worst case by construction.
const PLACES = [
  ['study_w', 'study_w.north'],
  ['gallery', 'gallery.mid'],
  ['study_e', 'study_e.north'],
  ['service', 'service.mid'],
  ['ballroom', 'ballroom.centre'],
  ['chapel', 'chapel.centre'],
];

/**
 * Freeze the simulation somewhere specific.
 *
 * Capture mode's Director drives the player every frame, so a teleport alone lasts exactly
 * one frame before it steers away. `engine.director.step` is replaced with a no-op for the
 * duration instead of fighting it — a parked measurement has to actually stay parked, and a
 * probe that cannot hold its own conditions is measuring something it cannot name.
 */
const park = async (anchor, yaw) => page.evaluate(({ anchor, yaw }) => {
  const e = window.__rrr.engine, p = e.player, h = e.hunter, room = e.room;
  if (e.director && !e.director.__parked) {
    e.director.__parked = true;
    /**
     * 🚨 **`look` MUST BE NULL, NOT `{x: 0, y: 0}`, AND THE OLD SHAPE NaNs THE CAMERA.**
     *
     * `views/game.js`'s loop does `if (cmd.look) cam.look(cmd.look.dx, cmd.look.dy)` and
     * `ThirdPersonCamera.look(dx, dy)` does `yaw -= dx`. This stub named the fields `x`/`y`, so
     * `dx`/`dy` were `undefined` and the first parked frame set `cam.yaw` to **NaN** — after
     * which the player position, the camera position and `spaceAt()` are all NaN, residency
     * freezes on whatever set it last held, and every station reports the same scene.
     *
     * ⚠️ **IT HAS NEVER FIRED, WHICH IS WHY IT SURVIVED.** `engine.director` was never assigned
     * anywhere in `src/`, so the guard above was silently false on every run this tool has ever
     * made and the stub was never installed. `estate-spike-1` assigned it (`views/game.js`),
     * which turned a dormant defect into an immediate NaN — found by printing the parked
     * position instead of trusting that a teleport had landed.
     *
     * `aimYaw` is supplied because the loop eases `cam.yaw` toward it in capture mode; without
     * it the boom keeps whatever heading the Director left behind.
     */
    e.director.step = () => ({ move: { x: 0, y: 0 }, look: null, run: false, fire: false,
      aimYaw: e.cam?.yaw ?? 0, aimPitch: e.cam?.pitch ?? 0 });
  }
  const a = room.anchor(anchor);
  if (!a) return { ok: false, why: `no anchor ${anchor}` };
  p.pos.copy(a); p.vel.set(0, 0, 0); p.aimYaw = yaw;
  /**
   * ⚠️ **`_first` IS WHAT MAKES THE BOOM SNAP, AND WITHOUT IT A PARKED STATION IS A MOVING ONE.**
   * `ThirdPersonCamera.update` eases with `k = this._first ? 1 : 1 - exp(-11 dt)`, so a
   * teleported player is CHASED across the house rather than followed. `setViewpoints` takes
   * both the player and the camera as viewpoints, so a boom still in transit keeps the space it
   * came from resident and the sample describes neither station. Measured by `estate-spike-1`:
   * 22.9 m of camera travel inside a 2 s window, with `ballroom.centre` reporting the camera in
   * the gallery.
   */
  if (e.cam) { e.cam.yaw = yaw; e.cam.pitch = 0; e.cam._first = true; }

  // The hunter is the most expensive object in the game; a worst case without it is a
  // fiction. Park it 6 m ahead, starve its senses so it cannot walk out of frame, and leave
  // it at whatever growth stage it is in.
  if (h) {
    // `--nohunter` banishes it instead, to price it. Not a shipping configuration: it exists
    // because "the game is 2x over budget" and "the hunter is 2x over budget" call for
    // completely different work, and guessing which costs a round.
    const far = window.__rrrNoHunter === true;
    h.root.position.set(
      far ? a.x + 400 : a.x + Math.sin(yaw) * 6, 0,
      far ? a.z + 400 : a.z - Math.cos(yaw) * 6);
    h.vel?.set?.(0, 0, 0);
    h.state = 'PATROL'; h.awareness = 0; h.target = null; h.candidates = [];
  }
  return { ok: true, space: room.spaceAt(p.pos)?.id ?? null };
}, { anchor, yaw });

const sample = async () => {
  await page.evaluate(() => window.__rrr.engine.resetPerf());
  await page.waitForTimeout(WINDOW_MS);
  return page.evaluate(() => window.__rrr.perf());
};

// WARM-UP LAP, and the first version of this tool did not have one and reported nonsense
// because of it: the first space sampled came back at cpu 16.55 ms against 2.35-3.12 ms for
// every other space, because it was paying first-visit residency resolution and material
// draw inside its own timing window. Visiting every space once before timing anything moves
// that cost where it belongs. This is the per-sample form of "discard the cold run".
for (const [, anchor] of PLACES) {
  for (let i = 0; i < YAWS; i++) {
    await park(anchor, (i / YAWS) * Math.PI * 2);
    await page.waitForTimeout(260);
  }
}

// ⚠️ THE PARKING LAP ABOVE IS NOT SUFFICIENT, AND ASSUMING IT WAS CONTAMINATED EVERY RUN THIS
// TOOL HAS EVER PRODUCED — in BOTH configs of the AO ablation, which is how it was caught.
//
// Each invocation launches a FRESH CHROMIUM and pays a ~33-36 s cold shader compile. The
// parking lap above is 6 spaces x 4 yaws x 260 ms plus park time — nowhere near long enough to
// absorb that, so the compile kept landing inside the first one or two TIMED windows. Measured
// on the same build across runs, `study_w` reported cpu 60.6 / 26.4 / 6.8 / 26.3 / 28.8 ms, and
// `--gate` named it the worst space in 4 OF 6 RUNS for no reason but being FIRST IN `PLACES`.
// A positional artefact reported as a measurement is instrument-hazard #1 in HANDOFF.md again,
// and this tool's own header docstring is about exactly that class of error.
//
// The fix is a whole DISCARDED TIMED LAP rather than a cleverer warm-up. It costs ~60 s, and
// unlike a "skip the first two rows" rule it is ORDER-INDEPENDENT — which is the actual defect,
// since the bias attached to a position in `PLACES` and not to a space.
const timedLap = async (quiet) => {
  const out = [];
  for (const [space, anchor] of PLACES) {
    let worst = null;
    for (let i = 0; i < YAWS; i++) {
      const yaw = (i / YAWS) * Math.PI * 2;
      const parked = await park(anchor, yaw);
      if (!parked.ok) { if (!quiet) log(`  ! ${space}: ${parked.why}`); continue; }
      // Let residency resolve and the new set of materials draw a few frames before timing.
      await page.waitForTimeout(450);
      const p = await sample();
      if (!worst || (p.gpuMs ?? 0) > (worst.gpuMs ?? 0)) worst = { ...p, yaw: +(yaw * 57.2958).toFixed(0), resolved: parked.space };
    }
    if (worst) {
      out.push({ space, anchor, ...worst });
      if (!quiet) {
        log(`  ${space.padEnd(9)} gpu ${String(worst.gpuMs).padStart(5)}  cpu ${String(worst.cpuMs).padStart(5)}` +
          `  ${String(worst.calls).padStart(4)} calls  ${String((worst.tris / 1000) | 0).padStart(4)}k tris` +
          `  (worst of ${YAWS} yaws, at ${worst.yaw}°)`);
      }
    }
  }
  return out;
};

log('  (discarding one full timed lap — cold shader compile outlives the parking lap)');
const discarded = await timedLap(true);
const rows = await timedLap(false);

// Report the discard rather than hiding it: if lap 1 and lap 2 disagree wildly the machine is
// not settled and NEITHER number should be trusted, whatever the gate says.
for (const r of rows) {
  const d = discarded.find((x) => x.space === r.space);
  if (!d) continue;
  const drift = Math.abs((d.cpuMs ?? 0) - (r.cpuMs ?? 0));
  if (drift > 8) log(`  ! ${r.space}: discarded lap cpu ${d.cpuMs} vs ${r.cpuMs} — machine may not be settled`);
}

if (renavigated) {
  console.error('\nFAIL: the page navigated mid-run — numbers describe more than one document. Re-run.');
  await browser.close(); if (child) child.kill(); process.exit(3);
}

// ---------------------------------------------------------------- verdict
rows.sort((a, b) => (b.gpuMs ?? 0) - (a.gpuMs ?? 0));
const worst = rows[0];
log('');
log(`  WORST SPACE: ${worst?.space} — gpu ${worst?.gpuMs}/${BUDGET.gpuMs.toFixed(2)}ms` +
  `  cpu ${worst?.cpuMs}/${BUDGET.cpuMs.toFixed(2)}ms  ${worst?.calls}/${BUDGET.calls} calls`);
log(`  best:        ${rows[rows.length - 1]?.space} — gpu ${rows[rows.length - 1]?.gpuMs}ms` +
  `  ${rows[rows.length - 1]?.calls} calls`);
log(`  ${worst?.gpu ?? ''}`);

const fails = [];
if (worst?.gpuMs > BUDGET.gpuMs) fails.push(`gpu ${worst.gpuMs}ms > ${BUDGET.gpuMs.toFixed(2)}ms in ${worst.space}`);
const worstCpu = rows.reduce((m, r) => (r.cpuMs > (m?.cpuMs ?? 0) ? r : m), null);
if (worstCpu?.cpuMs > BUDGET.cpuMs) fails.push(`cpu ${worstCpu.cpuMs}ms > ${BUDGET.cpuMs.toFixed(2)}ms in ${worstCpu.space}`);
const worstCalls = rows.reduce((m, r) => (r.calls > (m?.calls ?? 0) ? r : m), null);
if (worstCalls?.calls > BUDGET.calls) fails.push(`${worstCalls.calls} calls > ${BUDGET.calls} in ${worstCalls.space}`);

if (fails.length) { log('\n  BUDGET FAIL:'); for (const f of fails) log('   -', f); }
else log('\n  BUDGET OK in every space');

if (opt('json')) await writeFile(opt('json'), JSON.stringify({ readyMs, rows, budget: BUDGET }, null, 2));

await browser.close();
if (child) child.kill();
process.exit(flag('gate') && fails.length ? 1 : 0);
