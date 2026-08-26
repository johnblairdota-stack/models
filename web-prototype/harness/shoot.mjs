#!/usr/bin/env node
/**
 * Screenshot + perf harness. This is the ONLY way a critic looks at the game — it runs
 * the real thing in a real browser with a real GPU and captures a real frame.
 *
 *   node harness/shoot.mjs --view mat.marble
 *   node harness/shoot.mjs --view wall.2.lath --out /tmp/lath.png --crop 620,300,680,480
 *   node harness/shoot.mjs --all
 *   node harness/shoot.mjs --view game.play --perf --seconds 8
 *
 * Flags
 *   --view <id>        piece to capture (repeatable)
 *   --all              every view in the registry
 *   --group <name>     every view in a group (material|wall|char|hunter|limb|gadget|room|light|game)
 *   --out <path>       output png (single view only; default progress/shots/<id>.png)
 *   --dir <path>       output directory for multi-view runs
 *
 * PATHS — READ THIS BEFORE PASSING A WINDOWS PATH
 * Relative paths resolve against the project root, not the working directory. Absolute
 * paths are honoured verbatim. QUOTE any Windows path, or use forward slashes:
 *
 *     --out "C:\Users\John\AppData\Local\Temp\x.png"     correct
 *     --out C:/Users/John/AppData/Local/Temp/x.png       correct
 *     --out C:\Users\John\AppData\Local\Temp\x.png       WRONG through Git Bash
 *
 * Unquoted, a POSIX shell eats the backslashes as escapes and node receives
 * `C:UsersJohnAppDataLocalTempx.png` — a legal DRIVE-RELATIVE path that silently resolved
 * into the repo root. See harness/paths.mjs; the harness now refuses it instead.
 *   --width/--height   default 1920x1080
 *   --settle <n>       frames to render before capturing (default 12)
 *   --seconds <n>      advance the simulation this many seconds before capturing (for
 *                      animations). SIMULATED seconds, not wall-clock ones: n x 60 fixed
 *                      1/60 steps. It used to be a `waitForTimeout`, which on an uncapped
 *                      rAF meant "however much simulation this machine managed", i.e. a
 *                      different moment on every run and on every machine.
 *   --crop x,y,w,h     crop the capture — used for blind stage-identification tests
 *   --cam x,y,z,tx,ty,tz,fov
 *                      shoot from an arbitrary camera — the exact numbers `?orbit=1`'s
 *                      live readout hands you (see `src/views/_studio.js`), so a shot found
 *                      by hand can be re-captured verbatim without editing source. Writes
 *                      `?campose=` on the URL; absent, behaviour is unchanged. Deliberately
 *                      not `?cam=` — that name is already `room-ballroom.js`'s own named-
 *                      preset selector (`?cam=r10|overlook`), coupled to a grade choice, and
 *                      colliding with it would silently fight that view's own state.
 *                      Views that compute their own camera fit after `estate()`/`studio()`
 *                      returns (currently only `hunter-stage.js`) overwrite this — it only
 *                      reaches views that take the camera `estate()`/`studio()` set up.
 *   --review <px>      also write <id>.review.png downscaled to this width. Reading a
 *                      1920x1080 PNG costs ~2800 tokens; 1280 wide costs ~1250 and is
 *                      ample to judge a surface. Capture stays 1080p so the perf gate is
 *                      still measured at the real target resolution.
 *
 *                      ⚠️ AMPLE FOR A SURFACE, NOT FOR A SMALL SATURATED FEATURE. At 1280
 *                      the hunter ramp's stage-1 AMBER eyes resample to READ AS RED, which
 *                      turns the deliberate blue -> amber -> red heat story into a blue/red
 *                      binary switch. `critic-hsheet-fresh` nearly filed that as the piece's
 *                      top defect off the review image; it is only correct at full res.
 *                      A few bright pixels against a dark plate is exactly the case a
 *                      downscale destroys. RULE: judge SURFACES on the review PNG, but crop
 *                      the 1080p (`--crop`) for eyes, decals, indicator lights and anything
 *                      whose meaning is carried by hue over a handful of pixels.
 *   --perf             also measure sustained frame time and write <id>.perf.json
 *   --gate             enforce the integrated-graphics budget; exit non-zero if over
 *   --at4k             additionally measure at 3840x2160 to catch fill-rate cliffs
 *   --headed           show the browser window (default: headless with real GPU)
 *   --quiet
 *
 * Exits non-zero if any view throws, so a loop can't mistake a broken view for a pass. That
 * includes a capture whose page RELOADED under it — another agent saving a source file used to
 * hand you a plausible frame of a different moment (2026-08-09, 99.1% of pixels different). HMR
 * is now stubbed out for this harness's own tabs, the run asserts it stayed on ONE document, and
 * a frame taken across a reload is DELETED rather than left on disk. See the HMR block below.
 *
 * THE BUDGET
 * The target is 60 fps at 1080p on integrated graphics. This harness does not run on
 * integrated graphics, so a raw fps number here is meaningless — an RTX 3060 Ti will
 * report 800 fps on a scene that stutters on an Iris Xe. Instead we hold a GPU-time
 * budget scaled by the ratio between this machine and the target:
 *
 *     16.67 ms / REF_RATIO
 *
 * REF_RATIO is deliberately conservative. Override with RRR_REF_RATIO if you are
 * running on different hardware, and set RRR_REF_RATIO=1 if you are genuinely testing
 * on the target integrated GPU.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { resolveOutFile, resolveOutDir, displayPath, PathArgError } from './paths.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------- args
const argv = process.argv.slice(2);
function flag(name) { return argv.includes('--' + name); }
function opt(name, def = null) {
  const i = argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = argv[i + 1];
  // A value-taking flag given no value is a mistake, not a request for the default.
  // Falling back quietly is how `--out --perf` ended up capturing to progress/shots/
  // while the caller believed it had redirected the file somewhere else.
  if (v === undefined || v.startsWith('--')) {
    console.error(`--${name} needs a value (got ${v === undefined ? 'end of arguments' : `the next flag, "${v}"`})`);
    process.exit(2);
  }
  return v;
}
function optAll(name) {
  const out = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--' + name && argv[i + 1]) out.push(argv[i + 1]);
  return out;
}

const WIDTH = +(opt('width', 1920));
const HEIGHT = +(opt('height', 1080));
const SETTLE = +(opt('settle', 12));
const SECONDS = +(opt('seconds', 0));
const QUIET = flag('quiet');
const DO_PERF = flag('perf') || flag('gate') || flag('at4k');
const DO_GATE = flag('gate');
const AT_4K = flag('at4k');
const CROP = opt('crop');
// Sampling window for --perf. Default 4 s is fine for a static view; a view running a
// gameplay loop needs at least one whole loop or the number is a lottery.
const PERF_MS = +(opt('perfms', 4000));
// Frames rendered before the sample window opens, to get the GPU off its idle clocks. See
// the warm-up note in the perf block.
const PERF_WARM_MS = +(opt('perfwarmms', 700));

// --cam x,y,z,tx,ty,tz,fov -> ?campose= on the URL (see the flag comment at the top of this
// file for why it is not called --cam-as-in-?cam=). Validated here, not just in the page,
// so a typo fails before a browser is even launched rather than silently capturing the
// view's own default camera.
const CAM = opt('cam');
if (CAM != null) {
  const parts = CAM.split(',').map(Number);
  if (parts.length !== 7 || parts.some((n) => !Number.isFinite(n))) {
    console.error(`--cam needs 7 comma-separated numbers "x,y,z,tx,ty,tz,fov", got "${CAM}"`);
    process.exit(2);
  }
}
const log = (...a) => { if (!QUIET) console.log(...a); };

// How much faster this machine is than the integrated GPU we target (Intel Iris Xe class).
const REF_RATIO = +(process.env.RRR_REF_RATIO ?? 12);
// Integrated parts usually sit in thin laptops whose CPU is also slower, but nowhere near
// as much as the GPU — draw-call submission is JS plus driver, not shading.
const CPU_RATIO = +(process.env.RRR_CPU_RATIO ?? 4);

const BUDGET = {
  gpuMs: 16.67 / REF_RATIO,
  gpuMs4k: (16.67 / REF_RATIO) * 4,
  // CPU: leave over half the frame for game logic, physics and networking.
  cpuMs: 8 / CPU_RATIO,
  // Draw calls are only a PROXY for CPU cost, so the limit is derived from a measurement
  // rather than picked: ~0.0026 ms per call measured on this machine, x CPU_RATIO for the
  // target, against a 6.5 ms submission allowance. Note that three's counter is a
  // per-FRAME total across every pass — depth prepass + shadow map + main — so a scene
  // with a prepass and one shadow-casting light submits its geometry three times.
  calls: Math.round(6.5 / (0.0026 * CPU_RATIO)),
  tris: 900_000,
};

// ---------------------------------------------------------------- view list
const viewsSrc = await readFile(path.join(ROOT, 'src/views.js'), 'utf8');
const ALL_IDS = [...viewsSrc.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]);
const GROUP_OF = Object.fromEntries(
  [...viewsSrc.matchAll(/id:\s*'([^']+)',\s*group:\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));

let views = optAll('view');
if (flag('all')) views = ALL_IDS;
const grp = opt('group');
if (grp) views = ALL_IDS.filter((id) => GROUP_OF[id] === grp);
if (!views.length) views = [opt('view', 'mat.marble')];

for (const v of views) {
  if (!ALL_IDS.includes(v)) {
    console.error(`unknown view "${v}". known:\n  ${ALL_IDS.join('\n  ')}`);
    process.exit(2);
  }
}

// ---------------------------------------------------------------- output paths
// Resolved and validated up front, before vite or the browser start. A bad path used to
// surface only after a full scene render — and then not as an error but as a file in the
// wrong place. Now it costs milliseconds and never reaches page.screenshot().
const OUT_ARG = opt('out');

// --out names one file, so it cannot serve a multi-view run. This used to be a silent
// `views.length === 1 &&` guard: pass --out with --all and every capture went to the
// default directory while the caller believed it had chosen the destination.
if (OUT_ARG && views.length > 1) {
  console.error(
    `--out names a single file but ${views.length} views were requested:\n  ${views.join('\n  ')}\n` +
    `Use --dir <directory> for a multi-view run.`);
  process.exit(2);
}

let OUT_PATHS;
try {
  const outDir = resolveOutDir('dir', opt('dir') ?? path.join(ROOT, 'progress/shots'), ROOT);
  OUT_PATHS = new Map(OUT_ARG
    ? [[views[0], resolveOutFile('out', OUT_ARG, ROOT)]]
    : views.map((id) => [id, path.join(outDir, `${id}.png`)]));
} catch (e) {
  if (!(e instanceof PathArgError)) throw e;
  console.error(e.message);
  process.exit(2);
}

// ---------------------------------------------------------------- dev server
async function portOpen(port) {
  return new Promise((res) => {
    const s = net.createConnection({ port, host: '127.0.0.1' }, () => { s.destroy(); res(true); });
    s.on('error', () => res(false));
    s.setTimeout(400, () => { s.destroy(); res(false); });
  });
}

/*
 * ⚠️ `RRR_SHOOT_PORT` SHOOTS THE BUILT `dist/` INSTEAD OF THE SHARED DEV SERVER, and it exists
 * because the dev server is not private. With a second agent saving a source file every few
 * seconds, vite re-transforms modules under the capture and hands back partially-rewritten
 * JavaScript: four of six captures in one sweep died with `SyntaxError: Unexpected identifier
 * '_head4'` — an identifier that appears NOWHERE in this repo, and that changed between runs.
 * That is not a bug in the view; it is the transform racing the save. The captures that make a
 * claim must therefore run against a build:
 *
 *     npm run build && node harness/serve.mjs &        # :5192, static, no HMR
 *     RRR_SHOOT_PORT=5192 node harness/shoot.mjs --view ...
 *
 * Absent the variable nothing changes: :5178, spawning vite if it is not already up. The spawn
 * is skipped when an explicit port is given — that server is somebody else's to start.
 */
const PORT = Number(process.env.RRR_SHOOT_PORT) || 5178;
let child = null;
if (process.env.RRR_SHOOT_PORT && !(await portOpen(PORT))) {
  console.error(`RRR_SHOOT_PORT=${PORT} but nothing is listening there. ` +
    'Run `npm run build && node harness/serve.mjs` first.');
  process.exit(3);
}
if (!process.env.RRR_SHOOT_PORT && !(await portOpen(PORT))) {
  log('starting vite…');
  child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'dev', '--', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  child.stdout.on('data', () => {});
  child.stderr.on('data', (d) => { if (!QUIET) process.stderr.write(String(d)); });
  const t0 = Date.now();
  while (!(await portOpen(PORT))) {
    if (Date.now() - t0 > 60000) { console.error('vite failed to start'); process.exit(3); }
    await new Promise((r) => setTimeout(r, 250));
  }
  log('vite up on', PORT);
}

// ---------------------------------------------------------------- browser
// Headless Chromium normally falls back to SwiftShader, which is far too slow to judge
// either the look or the frame rate. These flags force real ANGLE/D3D11 in headless.
const browser = await chromium.launch({
  headless: !flag('headed'),
  args: [
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization',
    '--enable-zero-copy',
    '--disable-frame-rate-limit',
    '--force-device-scale-factor=1',
    '--hide-scrollbars',
    '--mute-audio',
    '--disable-dev-shm-usage',
  ],
});

const results = [];
let failures = 0;

for (const id of views) {
  const outPath = OUT_PATHS.get(id);
  await mkdir(path.dirname(outPath), { recursive: true });

  const ctx = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e.message ?? e)));

  // ROOT CAUSE OF THE game.play WHITE-FRAME BUG (diagnosed 2026-08-03). This harness captures
  // against the SAME live `npm run dev` vite server that every concurrent agent's builder tab
  // and edits land on (:5178, shared on purpose — see the port-reuse code above, and the
  // marble-shader comment below about ANGLE paying its program-cache cost once per process,
  // not once per view). Nothing in this codebase ever calls `import.meta.hot.accept()`, so
  // Vite's documented no-boundary fallback fires on every save from ANY agent: it pushes a
  // `full-reload` over the HMR websocket and every connected tab runs `location.reload()` —
  // including a tab mid-capture. `harness/serve.mjs`'s own header already names this exact
  // mechanism biting a live builder tab ("vite pushes a full page reload each save... that is
  // not a hypothetical — it happened"), but that fix (a static, non-HMR server) only covers
  // interactive browsing; this harness kept driving captures through the HMR-enabled dev
  // server with no defence of its own. `game.play` is the slowest capture on the roster
  // (30-180 s of cold shader compile plus a director-driven settle), so it sits exposed to a
  // stray reload the longest of any view — which is exactly why THIS view surfaced the bug.
  // A reload mid-capture lands `page.screenshot()` on a freshly-started, unpainted document:
  // the browser's own default background before any of this project's CSS has applied is
  // WHITE (this project's `#05070a` never paints that color, which is why a *finished* load
  // is never white), and the fresh document has no `#rrr-canvas` yet — precisely the two
  // symptoms measured (a pure-white PNG, and `--review`'s `getElementById('rrr-canvas')`
  // returning null).
  //
  // Fix: mock the HMR websocket itself rather than the client module. A first attempt replaced
  // `/@vite/client` with an empty stub, which DID stop the reloads but broke `room.study`
  // (`SyntaxError: ... does not provide an export named 'injectQuery'`) — some views' compiled
  // asset-URL code imports named helpers from that module at runtime, so removing its exports
  // is its own instrument fault. `page.routeWebSocket` mocks only the socket: per Playwright's
  // docs, a routed socket "opens... automatically" in the page without contacting the real
  // server unless the handler calls `connectToServer()`, so the client's `new WebSocket(...)`
  // resolves as if connected, the module and all its exports load completely untouched, and —
  // since the handler below never calls `ws.send()` — no message ever reaches the page, so the
  // server-driven `case "full-reload"` in `node_modules/vite/dist/client/client.mjs` never runs.
  // ⚠️ THAT REASONING IS TRUE BUT INCOMPLETE, which is why the stub below was added after this:
  // the client ALSO reloads on `vite:ws:disconnect`, which the transport raises LOCALLY when the
  // socket closes (client.mjs ~L968: `await waitForSuccessfulPing(...); location.reload()`), so
  // "no message ever arrives" is not by itself protection. Matched
  // on host/port rather than `**/@vite/client*` so it only silences THIS harness's own tabs;
  // every other tab on the shared server — a builder actively editing — keeps live-reloading
  // exactly as before, because `routeWebSocket` only intercepts sockets opened through this one
  // browser context.
  await page.routeWebSocket(
    (url) => url.hostname === '127.0.0.1' && url.port === String(PORT),
    () => { /* never call ws.send() — an intentionally silent mock, see the comment above */ });

  // ---- AND THE CLIENT MODULE ITSELF, BECAUSE THE SOCKET MOCK ABOVE WAS NOT ENOUGH ----------
  //
  // Caught in the act 2026-08-09 by `localise-1`: a `game.play --seconds 7` capture running
  // 20:55:01→20:55:56 came back **99.1% of pixels different** from its baseline — mean luma 44.5
  // against 67.2, i.e. a different point in the Director's loop, not a corrupt frame — and
  // `seethrough-1` had saved `src/game/wall.js` at 20:55:01.9, 0.9 s in. Two re-shoots that
  // included that same wall.js change reproduced the baseline byte-identically, so the difference
  // was the interruption, not the content. Every critic screenshot and every scored verdict in
  // this project goes through this file, and the failure is silent: you get a plausible frame of
  // a different moment.
  //
  // Measured while fixing it (harness-shaped probe, vite 6.4.3, save of an imported `src/` file
  // mid-page):
  //   no defence           `{"type":"full-reload"}` received, document replaced, 2 navigations
  //   routeWebSocket only  no message, document SURVIVED, 1 navigation
  //   this stub only       no socket opened at all, document SURVIVED, 1 navigation
  // So the socket mock does hold against the plain save — but it leaves Vite's client ALIVE, and
  // that client reloads the page from more than one place: `location.reload()` on a `full-reload`
  // message, and again after any socket CLOSE, via `waitForSuccessfulPing()` → reload. A mocked
  // socket that stays open forever never trips the second path; a mocked socket that closes at
  // some point in a 55-second capture does, and nothing here would have noticed. Serving a stub
  // module deletes every one of those paths at once — no socket, no ping loop, no reload code.
  //
  // The stub must carry the REAL export list or it becomes its own instrument fault: an earlier
  // empty stub stopped the reloads and broke `room.study` with `does not provide an export named
  // 'injectQuery'`, because compiled asset-URL code imports named helpers from this module at
  // runtime. These five are exactly what `node_modules/vite/dist/client/client.mjs` exports
  // (ErrorOverlay, createHotContext, injectQuery, removeStyle, updateStyle) — re-check that line
  // on a vite upgrade. Identical to the block in `playtest.mjs`, which has run this way for
  // scenarios since the mansion-run incident.
  await page.route('**/@vite/client', (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `const noop = () => {};
export const createHotContext = () => ({ accept: noop, acceptExports: noop, dispose: noop,
  prune: noop, decline: noop, invalidate: noop, on: noop, off: noop, send: noop, data: {} });
export const updateStyle = (id, content) => {
  let e = document.querySelector('style[data-vite-dev-id="' + id + '"]');
  if (!e) { e = document.createElement('style'); e.setAttribute('data-vite-dev-id', id);
    document.head.appendChild(e); }
  e.textContent = content;
};
export const removeStyle = (id) => {
  document.querySelector('style[data-vite-dev-id="' + id + '"]')?.remove();
};
export const injectQuery = (url) => url;
export const ErrorOverlay = class {};
`,
  }));

  // ---- SECOND SHAPE OF EVIDENCE: COUNT THE NAVIGATIONS ------------------------------------
  // "HMR is off" is exactly the kind of claim that silently stops being true, so don't rely on
  // it — count. A capture is ONE page load, so anything above 1 means the document under the
  // screenshot is not the one that signalled ready. Registered BEFORE `goto` (the boolean this
  // replaces was registered after it, and so was blind to a reload that raced the initial load —
  // which is precisely the 0.9-s-in window the incident above landed in).
  let navigations = 0;
  page.on('framenavigated', (fr) => { if (fr === page.mainFrame()) navigations++; });

  // --extra lets you pin quality tiers or toggle individual passes for profiling,
  // e.g. --extra "quality=high&ao=0"
  // --at N freezes the simulation N seconds in. Prefer it over --seconds for animated
  // views: --seconds waits on the wall clock, but capture mode runs an uncapped rAF with a
  // fixed 1/60 step, so a second of wall time can be a dozen seconds of simulation.
  const atArg = opt('at') ? `&at=${opt('at')}` : '';
  const camArg = CAM != null ? `&campose=${encodeURIComponent(CAM)}` : '';
  const extra = (opt('extra') ? '&' + opt('extra') : '') + atArg + camArg;
  const url = `http://127.0.0.1:${PORT}/?view=${encodeURIComponent(id)}&capture=1${extra}`;
  let record = { id, ok: false, out: outPath, errors: consoleErrors };

  try {
    await page.goto(url, { waitUntil: 'load', timeout: 45000 });

    // Belt-and-suspenders for the same white-frame bug class, in case something other than
    // Vite's HMR (the cases handled above) ever reloads this tab mid-capture: whatever
    // `page.screenshot()` sees later must be the same document that signalled ready, or it must
    // not be reported as a successful capture. "Captures lie" is instrument-hazard #1 in
    // HANDOFF.md for exactly this reason — a probe that cannot observe must report failure,
    // never a quiet false ok.
    //
    // TWO instruments, covering two different windows:
    //   load → ready      the navigation counter above. Minutes long, so its event has all the
    //                     time in the world to arrive before anything reads it.
    //   ready → shot      a token planted in the page (below, once the view is ready). The
    //                     counter alone is not enough here because it is read IMMEDIATELY after
    //                     the settle: `framenavigated` travels over CDP while `page.evaluate()`
    //                     takes its own channel, and a probe run that read the counter the
    //                     instant a reload committed saw `1` while its evaluate had already
    //                     landed in the replacement document. Reading a property back rides the
    //                     same channel as the evaluate, so it cannot race it — if the document
    //                     was replaced, the token is simply gone.
    // The token is planted AFTER the ready wait on purpose: `game.play` can hold the main thread
    // through 30-180 s of cold shader compilation, and an `evaluate` queued behind that would
    // time out and fail an honest capture. A false positive in a gate is worse than the bug it
    // was written for.

    // wait for the view to declare itself ready, or to have failed loudly.
    //
    // WHY THIS IS 180 s AND NOT 60 s — measured 2026-08-03, do not lower it back without
    // re-measuring. What this guard protects against is a view that NEVER signals: an
    // infinite loop, or a failure that neither throws nor sets `rrrError`. It was never
    // meant to be a performance budget — that is `--gate`, on GPU time, later in this file.
    //
    // At 60 s it was failing honest views. `mat.brass` timed out three times out of three
    // in isolation while rendering a complete, correct frame (the .FAIL.png showed the whole
    // scene). Instrumented, the view reached `markReady()` in 54-70 s, and 51-59 s of that
    // was ONE call: `marbleFloor()`. Isolating compile from rasterisation, a 32x32 marble
    // bake — 1024 texels — took 58.9 s, and a 2048x2048 bake of the same program took 209 ms
    // once compiled. So it is ANGLE/D3D11 compiling `MARBLE_SURFACE`, which the baker inlines
    // five times per fragment (centre + four height taps). Measured cold, one view per
    // browser process: mat.marble 68.2 s · mat.wallpaper 65.6 s · mat.brass 57-70 s ·
    // mat.walnut (no marble) 16.4 s.
    //
    // ANGLE caches compiled programs per GPU PROCESS, so the cost is paid once per browser,
    // not once per view. That is exactly why `audit.mjs --render` passes: it puts all 37
    // views in a single `shoot.mjs` invocation, the first marble view pays, and every later
    // one gets it for ~200 ms. An isolated single-view capture pays it in full. Both of the
    // contradictory reports about `mat.brass` were therefore true at the same time.
    //
    // The real fix is to make that shader cheaper to compile (or to stop inlining `surface()`
    // five times) — that is materials work, in `materials/surfaces/marble.js` / `baker.js`,
    // and it would cut ~50 s off every cold capture and off the game's own load. Until then
    // this ceiling stops the harness reporting a working view as broken.
    const tReady = Date.now();
    await page.waitForFunction(
      () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
      null, { timeout: 180000 });
    record.readyMs = Date.now() - tReady;
    // Keep the cost VISIBLE. A raised ceiling that silently absorbs a minute of shader
    // compilation is how this stops being anyone's problem.
    if (record.readyMs > 20000) {
      log(`  ! ${id}: took ${(record.readyMs / 1000).toFixed(1)} s to signal ready` +
        ` — cold shader compilation, see the comment at this line in shoot.mjs`);
    }

    const viewErr = await page.evaluate(() => window.__rrrError ?? null);
    if (viewErr) throw new Error('view reported an error:\n' + viewErr);

    // Plant the document token (see the two-instruments note above the ready wait).
    const token = `${id}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    await page.evaluate((t) => { window.__rrrCaptureToken = t; }, token);
    const tokenIntact = async () =>
      (await page.evaluate(() => window.__rrrCaptureToken ?? null).catch(() => null)) === token;

    // GPU sanity: SwiftShader means the numbers and the look are both lies
    const gpu = await page.evaluate(() => {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2');
      if (!gl) return { renderer: 'none' };
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return { renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown' };
    });
    record.gpu = gpu.renderer;
    if (/swiftshader|software/i.test(gpu.renderer)) {
      log(`  ! ${id}: software rasteriser (${gpu.renderer}) — perf numbers are meaningless`);
    }

    // Advance the simulation deterministically. `--seconds` is n x 60 fixed steps, NOT a
    // wall-clock wait: capture mode parks between settles now (see the class header in
    // src/core/engine.js), so a `waitForTimeout` here would advance nothing at all, and
    // before that change it advanced a machine-dependent amount. Both are wrong; frames are
    // the only unit this loop actually has.
    if (SECONDS > 0) await page.evaluate((n) => window.__rrr.settle(n), Math.round(SECONDS * 60));
    await page.evaluate((n) => window.__rrr.settle(n), SETTLE);

    // ---- IS THIS STILL THE PAGE WE MEASURED? -------------------------------------------
    const interrupted = async (when) => {
      if (navigations > 1) return `${navigations} navigations (expected 1)`;
      if (!(await tokenIntact())) return `the token planted at ready is gone ${when}`;
      return null;
    };
    const before = await interrupted('before the screenshot');
    if (before) {
      throw new Error(`page reloaded mid-capture — ${before}. The document at screenshot time is ` +
        'not the one that signalled ready, so the frame is a plausible picture of a DIFFERENT ' +
        "moment (see the 2026-08-09 incident in this file's HMR notes). Both Vite paths are " +
        'blocked above, so this is something else. Retry rather than trust the frame.');
    }

    // ---- THE SCREENSHOT COMES BEFORE THE PERF WINDOW -----------------------------------
    // A measurement window runs frames free (that is what makes it a measurement), so the
    // sim time on the other side of it is wall-clock dependent. Capturing first makes the
    // PNG a function of --view/--at/--seconds/--settle and nothing else: `--view X` and
    // `--view X --perf` now produce byte-identical images, which they did not before.
    const clip = CROP
      ? (() => { const [x, y, w, h] = CROP.split(',').map(Number); return { x, y, width: w, height: h }; })()
      : undefined;

    await page.screenshot({ path: outPath, clip, animations: 'disabled' });

    // ...and check again AFTER, because the exposed window includes the screenshot itself, which
    // on `game.play` is the better part of a second. A frame captured across a reload must not
    // survive on disk: hazard #1 is that captures lie and get believed because the file exists.
    const after = await interrupted('immediately after the screenshot');
    if (after) {
      await rm(outPath, { force: true });
      throw new Error(`page reloaded across the screenshot — ${after}. ` +
        `${displayPath(outPath, ROOT)} has been DELETED rather than left as a plausible frame of ` +
        'the wrong moment. Retry.');
    }

    // Downscaled review copy. Composited from the live WebGL canvas (capture mode sets
    // preserveDrawingBuffer) so it costs one evaluate rather than a second render.
    if (opt('review')) {
      const rw = +opt('review');
      const durl = await page.evaluate((w) => {
        const src = document.getElementById('rrr-canvas');
        if (!src) return null;
        const c = document.createElement('canvas');
        c.width = w; c.height = Math.round(w * src.height / src.width);
        const g = c.getContext('2d');
        g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
        g.drawImage(src, 0, 0, c.width, c.height);
        return c.toDataURL('image/png');
      }, rw);
      if (durl) {
        const rp = outPath.replace(/\.png$/i, '.review.png');
        await writeFile(rp, Buffer.from(durl.split(',')[1], 'base64'));
        record.review = rp;
      }
    }

    // The sim state the PNG is a picture of. Recorded so a critic comparing two captures can
    // tell "the same frame" from "a different moment" without guessing.
    record.sim = await page.evaluate(() => window.__rrr.simState());
    // Written into progress/last-shoot.json so "was this frame taken on one uninterrupted page?"
    // is answerable after the fact, by someone who did not run the shoot.
    record.navigations = navigations;

    if (DO_PERF) {
      // Discard warm-up and shader-compilation frames, then sample a real window.
      //
      // WINDOW LENGTH MATTERS. A view that runs a gameplay loop shows a different scene
      // every second, so a short window samples whatever moment it lands on — measuring
      // three quality tiers with a 4 s window produced 2.3 / 16.8 / 21.2 ms, i.e. the
      // *lowest* tier looked 10x slower than the highest while drawing half the geometry.
      // That was three different scenes, not three tiers. For a looping view the window
      // must cover at least one full loop so every run sees the same content.
      //
      // WARM UP FIRST — the capture loop is PARKED at this point. It parks whenever nothing
      // is waiting on a frame (src/core/engine.js class header), and the screenshot above
      // takes on the order of a second, so the GPU has just been idle long enough for its
      // clocks to drop. Sampling straight out of that measures the ramp, not the scene.
      // `freeRun(true)` restarts the loop; the sample window opens once it is warm.
      await page.evaluate(() => window.__rrr.freeRun(true));
      await page.waitForTimeout(PERF_WARM_MS);
      await page.evaluate(() => window.__rrr.engine.resetPerf());
      await page.waitForTimeout(PERF_MS);
      record.perf = await page.evaluate(() => window.__rrr.perf());
      record.perf.windowMs = PERF_MS;
      record.perf.budget = { ...BUDGET, refRatio: REF_RATIO };

      if (AT_4K) {
        await page.setViewportSize({ width: 3840, height: 2160 });
        await page.evaluate(() => {
          const e = window.__rrr.engine;
          e.opts.captureWidth = 3840; e.opts.captureHeight = 2160;
          e._resize(); e.resetPerf();
        });
        await page.waitForTimeout(3500);
        record.perf4k = await page.evaluate(() => window.__rrr.perf());
        await page.setViewportSize({ width: WIDTH, height: HEIGHT });
        await page.evaluate(({ w, h }) => {
          const e = window.__rrr.engine;
          e.opts.captureWidth = w; e.opts.captureHeight = h; e._resize();
        }, { w: WIDTH, h: HEIGHT });
        await page.evaluate((n) => window.__rrr.settle(n), 6);
      }

      // gate
      const p = record.perf, fails = [];
      if (p.gpuMs != null && p.gpuMs > BUDGET.gpuMs) {
        fails.push(`gpu ${p.gpuMs}ms > ${BUDGET.gpuMs.toFixed(2)}ms budget (=60fps on a GPU ${REF_RATIO}x slower than ${p.gpu})`);
      }
      if (p.gpuMs == null && p.worstFps < 60 * REF_RATIO * 0.5) {
        fails.push(`no GPU timer available and p95 is only ${p.worstFps} fps here — cannot clear the integrated budget`);
      }
      if (p.cpuMs > BUDGET.cpuMs) {
        fails.push(`cpu ${p.cpuMs}ms > ${BUDGET.cpuMs.toFixed(2)}ms budget (=${(p.cpuMs * CPU_RATIO).toFixed(1)}ms on a CPU ${CPU_RATIO}x slower)`);
      }
      if (p.calls > BUDGET.calls) {
        fails.push(`${p.calls} draw calls (all passes) > ${BUDGET.calls} — ~${(p.calls * 0.0026 * CPU_RATIO).toFixed(1)}ms of submission on the target CPU`);
      }
      if (p.tris > BUDGET.tris) fails.push(`${(p.tris / 1000) | 0}k triangles > ${(BUDGET.tris / 1000) | 0}k`);
      if (record.perf4k?.gpuMs != null && record.perf4k.gpuMs > BUDGET.gpuMs4k) {
        fails.push(`gpu at 4k ${record.perf4k.gpuMs}ms > ${BUDGET.gpuMs4k.toFixed(2)}ms — fill-rate bound`);
      }
      if (p.renderScale < 0.999) fails.push(`dynamic resolution dropped to ${(p.renderScale * 100) | 0}% — not native 1080p`);
      record.budgetFails = fails;
      record.budgetOk = fails.length === 0;
    }

    record.ok = true;
    log(`  ok  ${id.padEnd(18)} -> ${displayPath(outPath, ROOT)}` +
      // ⚠ GUARD ON THE FIELD, NOT ON THE OBJECT. A DOM-only view — `party.host`, `party.phone` —
      // has a `__rrr` and therefore a `simState()`, but no simulation, so this comes back as an
      // object with no `elapsed` in it. Testing the object passed, the `.toFixed` threw, and the
      // throw was caught upstream and reported as "FAIL party.host: Cannot read properties of
      // undefined" — a harness bug wearing the costume of a broken view. That is the same class
      // of misleading tool this round has spent itself finding: a boot probe confirmed the view
      // renders perfectly.
      (record.sim?.elapsed != null ? `\n        sim t=${record.sim.elapsed.toFixed(4)}s frame ${record.sim.frame}` : '') +
      (record.perf ? `\n        ${record.perf.fps} fps (p95 ${record.perf.worstFps})  frame ${record.perf.frameMs}ms` +
        `  cpu ${record.perf.cpuMs}${record.perf.gpuMs != null ? `  gpu ${record.perf.gpuMs}/${BUDGET.gpuMs.toFixed(2)}ms` : ''}` +
        `  ${record.perf.calls} calls  ${(record.perf.tris / 1000) | 0}k tris  scale ${record.perf.renderScale}` +
        (record.perf4k?.gpuMs != null ? `\n        4k: gpu ${record.perf4k.gpuMs}/${BUDGET.gpuMs4k.toFixed(2)}ms` : '') +
        `\n        ${record.perf.gpu}` +
        (record.budgetFails ? (record.budgetOk
          ? `\n        BUDGET OK (60fps on a GPU ${REF_RATIO}x slower)`
          : `\n        BUDGET FAIL:\n          - ` + record.budgetFails.join('\n          - ')) : '') : ''));
  } catch (e) {
    failures++;
    record.error = String(e.message ?? e);
    console.error(`  FAIL ${id}: ${record.error}`);
    if (consoleErrors.length) console.error('   console:', consoleErrors.slice(0, 6).join('\n            '));
    try { await page.screenshot({ path: outPath.replace(/\.png$/, '.FAIL.png') }); } catch {}
  }

  results.push(record);
  await ctx.close();
}

await browser.close();
if (child) child.kill();

const summary = path.join(ROOT, 'progress/last-shoot.json');
await mkdir(path.dirname(summary), { recursive: true });
await writeFile(summary, JSON.stringify({ at: new Date().toISOString(), width: WIDTH, height: HEIGHT, results }, null, 2));

// Only write a perf file when perf was ASKED FOR explicitly, never as a side effect.
//
// `DO_PERF` is true whenever --gate or --at4k is passed too, so a capture taken for any
// of those reasons was leaving a perf.json on disk that later `status.mjs set --perf`
// calls would pick up as if it were a controlled measurement. A critic caught exactly
// that: an unpinned, high-tier, wrong-window number attached itself to game.play's board
// entry. Perf on this project is only meaningful at a pinned tier over a controlled
// window, so an unlabelled file is worse than no file.
if (flag('perf')) {
  for (const r of results) {
    if (!r.perf) continue;
    r.perf.measuredAt = new Date().toISOString();
    r.perf.window = { ms: PERF_MS, tier: r.perf.quality ?? 'auto', extra: opt('extra') ?? null };
    await writeFile(r.out.replace(/\.png$/, '.perf.json'), JSON.stringify(r.perf, null, 2));
  }
}

const overBudget = results.filter((r) => r.budgetOk === false);
log(`\n${results.length - failures}/${results.length} captured` + (failures ? `, ${failures} FAILED` : '') +
  (DO_GATE ? `, ${overBudget.length} over budget` : ''));
process.exit(failures || (DO_GATE && overBudget.length) ? 1 : 0);
