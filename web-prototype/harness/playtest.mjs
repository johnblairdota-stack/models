#!/usr/bin/env node
/**
 * PLAYTEST — boot a view for real, drive real input, and assert the game RESPONDS.
 *
 * WHY THIS EXISTS, and it is not a hypothetical. `game.play` was screenshotted every round for
 * thirty rounds, audited by `audit.mjs --render`, and given critic verdicts up to WEAK 58 — while
 * being **completely unplayable**. Opening it in a browser threw
 * `TypeError: this.hud is not a function` on every single frame.
 *
 * The reason nothing caught it is structural. `Engine` runs two different loops:
 *   `_captureLoop()`  fixed 1/60 steps, deterministic, `this.hud === null`   <- every screenshot
 *   `_liveLoop()`     real rAF, real input, calls `this.hud(this)`           <- every player
 * Every tool in `harness/` took the capture path. **No tool had ever executed the code a player
 * executes.** A whole category of defect — anything in the live loop, anything input-driven,
 * anything that only happens after a few seconds of real play — was invisible by construction.
 *
 * `shoot.mjs` answers "does it look right". This answers "does it RUN and RESPOND".
 *
 *   node harness/playtest.mjs --view game.play
 *   node harness/playtest.mjs --view game.play --seconds 12 --shots
 *   node harness/playtest.mjs --script my-scenario.mjs --shots
 *
 *   --view <id>      view to play (default game.play)
 *   --port <n>       vite port to spawn on (default 5191 — NOT 5178, which shoot.mjs owns
 *                    with --strictPort, so using that would break any concurrent capture)
 *   --seconds <n>    how long to let it run before probing (default 6)
 *   --shots          write screenshots for each probe to progress/playtest/
 *   --keep           leave the browser open at the end (for a human to look)
 *   --q <string>     extra query string appended to the view URL, e.g. --q "debug=1"
 *   --script <path>  run a SCENARIO instead of the fixed probe list. The module's default
 *                    export is called with { page, shot, snap, pass, fail, skip, note, SHOTDIR,
 *                    pageErrors, consoleErrors, waitFor } and drives whatever play it likes.
 *                    Written because the fixed probes above answer "does it respond" once, and
 *                    a feel question — "is losing an arm perceptible", "how far out does the
 *                    hunter notice me" — needs a scripted play session and a picture per beat.
 *                    Scenarios live in harness/scenarios/ and are throwaway; the ASSERTIONS
 *                    they make go through the same pass/fail/skip so the report format and the
 *                    "a SKIP is not a PASS" rule are shared.
 *
 * WHAT IT ASSERTS. Each probe drives input and checks that OBSERVABLE STATE CHANGED — not that
 * no error was thrown. "No error" is exactly what thirty rounds of screenshots reported.
 *
 * PASS / FAIL / SKIP. A probe that cannot observe what it needs reports SKIP with a reason, and
 * never PASS. This project has twice been damaged by an instrument that returned a confident
 * wrong number rather than admitting it could not measure — a diff tool that silently served
 * cached results, and an `envMapIntensity` experiment that was reading a disconnected uniform.
 * An honest SKIP is worth more than a green tick you cannot trust.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const flag = (n) => argv.includes(`--${n}`);

const VIEW = opt('view', 'game.play');
const PORT = +(opt('port', 5191));
const SECONDS = +(opt('seconds', 6));
const SHOTS = flag('shots');
const KEEP = flag('keep');
const SCRIPT = opt('script', null);
const QS = opt('q', '');
const SHOTDIR = path.join(ROOT, 'progress/playtest');

/**
 * 🚨 REJECT UNKNOWN FLAGS. A SILENTLY-IGNORED FLAG IS A LIE THAT LOOKS LIKE A PASS.
 *
 * This tool used to ignore anything it did not recognise, and that has now cost two rounds:
 *
 *   --scenario harness/scenarios/escape.mjs   ran the BASE playtest and printed "9 passed · 0
 *                                             failed". The flag is `--script`. An agent read a
 *                                             green result for a scenario that never ran.
 *   --extra "seed=s4"                         the flag is `--q`. `escape` reported 19/1-skip and
 *                                             `dig-free` 5/1-skip — and a SKIP in a long tail
 *                                             reads like a near-pass, so it was nearly believed.
 *
 * Both were found by builders who noticed the numbers were wrong for other reasons. **The whole
 * point of a gate is that you can trust it without checking**, so an unrecognised flag now stops
 * the run instead of quietly changing what was measured.
 */
{
  const KNOWN = new Set(['view', 'port', 'seconds', 'script', 'q', 'shots', 'keep']);
  const unknown = argv.filter((a) => a.startsWith('--') && !KNOWN.has(a.slice(2)));
  if (unknown.length) {
    console.error(`\n  UNKNOWN FLAG${unknown.length > 1 ? 'S' : ''}: ${unknown.join(' ')}`);
    console.error(`  known: ${[...KNOWN].map((k) => '--' + k).join(' ')}`);
    console.error(`  ⚠️ scenarios are --script <path>, query string is --q "seed=s4&dig=1"\n`);
    process.exit(2);
  }
}

const results = [];
const pass = (name, detail = '') => { results.push({ s: 'PASS', name, detail }); };
const fail = (name, detail = '') => { results.push({ s: 'FAIL', name, detail }); };
const skip = (name, why) => { results.push({ s: 'SKIP', name, detail: why }); };
const notes = [];
const note = (line) => { notes.push(String(line)); console.log('   · ' + line); };

// ---------------------------------------------------------------- dev server
//
// REUSE-OR-SPAWN, and spawn WITHOUT a shell. Two Windows-specific traps here, both hit while
// writing this:
//   1. `spawn(..., { shell: true })` returns the *shell's* pid, so `child.kill()` kills cmd.exe
//      and leaves vite holding the port. The next run then dies with "port already in use".
//      `shoot.mjs` uses that pattern too, which is why orphaned vite processes turn up.
//      Spawning `node node_modules/vite/bin/vite.js` needs no shell, so kill works.
//   2. Detecting readiness by scanning stdout is brittle. Poll the port instead — that is what
//      actually matters, and it also lets us notice a server that is already up.
//   3. Vite binds to `localhost`, which on Windows resolves to IPv6 `::1` — so a probe that
//      connects to `127.0.0.1` sees nothing and concludes the server never started, even while
//      curl and a browser reach it fine. `shoot.mjs` already sidesteps this by passing
//      `--host 127.0.0.1`; do the same, and let the probe resolve `localhost` so it can also
//      detect a server someone else started on the default binding.
const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, 'localhost');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 700);
});

let vite = null;
if (await portOpen(PORT)) {
  console.log(`  reusing the server already on :${PORT}`);
} else {
  console.log(`  starting vite on :${PORT} …`);
  vite = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'),
    '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let viteErr = '';
  vite.stderr.on('data', (d) => { viteErr += d.toString(); });
  const t0 = Date.now();
  while (!(await portOpen(PORT))) {
    if (Date.now() - t0 > 25000) { vite.kill(); throw new Error(`vite did not open :${PORT}\n${viteErr}`); }
    await new Promise((r) => setTimeout(r, 300));
  }
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

// ---------------------------------------------------------------- HMR IS OFF FOR THIS PAGE
//
// ⚠️ AND IT HAS TO BE, OR A CONCURRENT AGENT'S FILE SAVE SILENTLY DELETES THE REST OF THE RUN.
// `shoot.mjs` already learned this (see HANDOFF's white-frame note): the dev server is SHARED,
// so any other agent saving any source file pushes a full reload down vite's HMR websocket. A
// scenario is one long stateful session — `window.__auto`, `window.__w`, every `engine.onUpdate`
// probe — and a reload throws all of it away mid-run. It does not throw and it does not say so:
// the recorders simply stop filling, so the assertions after the reload report "0 frames
// sampled" and SKIP, or "the hunter never moved" and FAIL, which reads as a game defect.
//
// Measured, twice, in one session: a mansion run where `locomotion.js` was saved by another
// agent at t≈4 min reported `A5: 0s walked, 0 frames`, `A6 lap DID NOT complete`, `A2 states {}`,
// `A1 never broke contact` and `A10 no death overlay` — five failures, all of them the reload.
// The only surviving trace was one console line, `ReferenceError: makeReact is not defined`,
// from a module caught half-way through re-execution.
//
// Vite injects `/@vite/client` into the document and every transformed module imports
// `createHotContext` from it. Serving a stub with the same exports removes the websocket
// entirely: the page keeps the modules it booted with for the whole session, which is exactly
// what a measurement wants. Nothing else about the page changes.
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
// Second shape of evidence, because "HMR is off" is exactly the kind of claim that silently
// stops being true: count the navigations. A scenario is ONE page load, so any number above 1
// means the session was interrupted and every assertion after it is suspect.
let navigations = 0;
page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations++; });

// Page errors are the headline signal — this is the exact class that hid for thirty rounds.
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e).split('\n')[0].slice(0, 200)));
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().split('\n')[0].slice(0, 200)); });

// Screenshots are EVIDENCE, not assertions, so a slow or failed capture must never take the
// run down with it. Playwright's default 30 s can genuinely be exceeded here: this drives a
// continuous rAF loop, and when a shoot or a critic is running concurrently the GPU is
// contended. Losing a screenshot costs a picture; losing the run costs the whole test.
const snap = async (tag, opts = {}) => {
  try {
    return await page.screenshot({ timeout: 60000, animations: 'disabled', ...opts });
  } catch (e) {
    console.log(`  (screenshot "${tag}" failed: ${String(e).split('\n')[0].slice(0, 80)})`);
    return null;
  }
};
const shot = async (tag) => {
  if (!SHOTS) return null;
  await mkdir(SHOTDIR, { recursive: true });
  const p = path.join(SHOTDIR, `${VIEW}.${tag}.png`);
  await snap(tag, { path: p });
  return p;
};

/** Poll a page-evaluated predicate. Returns the value, or null on timeout — never throws. */
const waitFor = async (fn, { timeout = 8000, every = 120 } = {}) => {
  const t0 = Date.now();
  for (;;) {
    const v = await page.evaluate(fn).catch(() => null);
    if (v) return v;
    if (Date.now() - t0 > timeout) return null;
    await page.waitForTimeout(every);
  }
};

try {
  const url = `http://localhost:${PORT}/?view=${encodeURIComponent(VIEW)}${QS ? '&' + QS : ''}`;
  await page.goto(url, { waitUntil: 'networkidle' });

  // ⚠️ WAIT FOR `ready`, NOT FOR A STOPWATCH — AND THE OLD STOPWATCH WAS HIDING A REAL DEFECT.
  //
  // This used to be `waitForTimeout(SECONDS * 1000)` and nothing else, with SECONDS defaulting
  // to 6. That looked fine for months for a reason that is worth writing down: `game.play`'s
  // load warm-up ran ~83 s of shader compilation in ONE synchronous block, so the main thread
  // was pinned the whole time — and **Playwright's `click()` auto-waits for the main thread**,
  // so the click simply queued behind the freeze and landed after it, on a button that by then
  // existed. The suite passed. The page was hung.
  //
  // John found it the only way it could be found — by opening it in Chrome, which said **"page
  // unresponsive"**. The moment `game.js` started yielding during the warm-up, the click began
  // firing on time against a gate that was not armed yet, and this fixed wait failed loudly.
  // **That is the instrument catching up with reality, not a regression.**
  //
  // So: wait for the view's own ready signal, generously, and keep `--seconds` as an ADDITIONAL
  // settle on top of it for views that want one.
  const readyAt = Date.now();
  const gotReady = await waitFor(() => window.__rrr?.ready === true, { timeout: 180000, every: 250 });
  if (!gotReady) note(`⚠️ view never signalled ready in 180 s — probing anyway`);
  else note(`ready in ${((Date.now() - readyAt) / 1000).toFixed(1)} s`);
  await page.waitForTimeout(SECONDS * 1000);
  await shot('boot');

  // Dismiss the PLAY gate if this view has one. `game.play` shows a full-screen overlay in live
  // mode (pointer lock needs a real user gesture), and it sits above the canvas — so without
  // this the attack probe would click the overlay instead of the game and every input probe
  // below would be measuring the wrong thing. Capture mode has no gate, so this is a no-op for
  // views that do not use one.
  const gate = await page.$('#rrr-play-gate');
  if (gate) {
    await page.click('#rrr-play-btn').catch(() => page.click('#rrr-play-gate'));
    await page.waitForTimeout(600);
    const stillThere = await page.$('#rrr-play-gate');
    if (stillThere) fail('play gate dismisses', 'clicked PLAY but the overlay is still up');
    else pass('play gate dismisses');
    await shot('after-play');
  }

  // ---- 1. did it boot without throwing -------------------------------------------------
  const failedBanner = await page.evaluate(() => document.body.innerText.includes('FAILED'));
  const uniqueErrs = [...new Set(pageErrors)];
  if (failedBanner || uniqueErrs.length) {
    fail('boots clean', failedBanner
      ? `view reports FAILED — ${uniqueErrs[0] ?? 'see console'}`
      : `${uniqueErrs.length} distinct page error(s): ${uniqueErrs[0]}`);
  } else pass('boots clean');

  // ---- 2. is the LIVE loop actually running --------------------------------------------
  // Capture mode would advance too, so this alone is not proof of liveness — but a frame
  // counter that does not move means nothing below can be trusted.
  const f0 = await page.evaluate(() => window.__rrr?.frames?.() ?? null);
  await page.waitForTimeout(1000);
  const f1 = await page.evaluate(() => window.__rrr?.frames?.() ?? null);
  if (f0 == null || f1 == null) skip('live loop advances', 'window.__rrr.frames() not exposed by this view');
  else if (f1 > f0) pass('live loop advances', `${f1 - f0} frames in 1s`);
  else fail('live loop advances', `frame counter stuck at ${f0}`);

  // ---- state reader --------------------------------------------------------------------
  // Reads whatever the view chose to hang off the engine. Views that expose nothing get SKIPs
  // rather than failures — not every view is a game.
  const readState = () => page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e) return null;
    const p = e.player, c = e.cam;
    const pos = p?.root?.position ?? p?.position ?? null;
    return {
      hasPlayer: !!p,
      pos: pos ? { x: +pos.x.toFixed(4), y: +pos.y.toFixed(4), z: +pos.z.toFixed(4) } : null,
      yaw: typeof c?.yaw === 'number' ? +c.yaw.toFixed(4) : null,
      pitch: typeof c?.pitch === 'number' ? +c.pitch.toFixed(4) : null,
    };
  });

  // ---- scenario mode ---------------------------------------------------------------------
  // A scenario replaces the fixed input probes below (it drives its own play) but NOT probes 1,
  // 2 and 7 — "did it boot", "is the live loop running" and "did anything throw" are the checks
  // that caught the thirty-round crash and must run for every session regardless.
  const scenarioMod = SCRIPT ? await import(pathToFileURL(path.resolve(ROOT, SCRIPT)).href) : null;

  const before = scenarioMod ? null : await readState();
  if (scenarioMod) {
    await scenarioMod.default({
      page, shot, snap, pass, fail, skip, note, waitFor,
      SHOTDIR, VIEW, pageErrors, consoleErrors,
    });
  } else if (!before) {
    skip('player responds to W', 'window.__rrr.engine not reachable');
    skip('player responds to A/D', 'window.__rrr.engine not reachable');
    skip('camera responds to mouse', 'window.__rrr.engine not reachable');
    skip('attack is accepted', 'window.__rrr.engine not reachable');
  } else if (!before.hasPlayer || !before.pos) {
    const why = !before.hasPlayer ? 'view exposes no engine.player' : 'player has no readable position';
    skip('player responds to W', why);
    skip('player responds to A/D', why);
    skip('camera responds to mouse', why);
    skip('attack is accepted', why);
  } else {
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

    // ---- 3. forward movement -----------------------------------------------------------
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(900);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(200);
    const afterW = await readState();
    const dW = dist(before.pos, afterW.pos);
    if (dW > 0.05) pass('player responds to W', `moved ${dW.toFixed(2)} units`);
    else fail('player responds to W', `moved only ${dW.toFixed(3)} units — input not reaching the player`);
    await shot('after-W');

    // ---- 4. lateral movement -----------------------------------------------------------
    const beforeD = await readState();
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(700);
    await page.keyboard.up('KeyD');
    await page.waitForTimeout(200);
    const afterD = await readState();
    const dD = dist(beforeD.pos, afterD.pos);
    if (dD > 0.05) pass('player responds to A/D', `strafed ${dD.toFixed(2)} units`);
    else fail('player responds to A/D', `moved only ${dD.toFixed(3)} units`);

    // ---- 5. mouse look -----------------------------------------------------------------
    // Look is driven by pointer-lock movementX/Y. Headless Chromium does not always grant
    // pointer lock, and without it the deltas are zero — that is a limitation of the test
    // rig, NOT a defect in the game, so it reports SKIP rather than FAIL.
    const yaw0 = (await readState()).yaw;
    if (yaw0 == null) skip('camera responds to mouse', 'view exposes no cam.yaw');
    else {
      await page.mouse.move(640, 360);
      await page.mouse.down(); await page.mouse.up();          // request pointer lock
      await page.waitForTimeout(300);
      for (let i = 0; i < 12; i++) await page.mouse.move(640 + i * 18, 360);
      await page.waitForTimeout(300);
      const yaw1 = (await readState()).yaw;
      const locked = await page.evaluate(() => document.pointerLockElement != null);
      if (Math.abs(yaw1 - yaw0) > 0.01) pass('camera responds to mouse', `yaw ${yaw0} -> ${yaw1}`);
      else if (!locked) skip('camera responds to mouse', 'pointer lock not granted headless — cannot drive look');
      else fail('camera responds to mouse', `pointer locked but yaw did not move from ${yaw0}`);
    }

    // ---- 6. attack ---------------------------------------------------------------------
    // Asserted as "the frame after an attack is not identical to the frame before" plus no new
    // errors — deliberately weak, because what an attack changes depends on what is in range.
    const errsBefore = pageErrors.length;
    const beforePng = await snap('pre-attack');
    await page.mouse.down(); await page.waitForTimeout(500); await page.mouse.up();
    await page.waitForTimeout(600);
    const afterPng = await snap('post-attack');
    const newErrs = pageErrors.length - errsBefore;
    if (newErrs > 0) fail('attack is accepted', `${newErrs} error(s) thrown on attack: ${pageErrors.at(-1)}`);
    else if (!beforePng || !afterPng) skip('attack is accepted', 'no errors thrown, but could not capture frames to compare');
    else if (Buffer.compare(beforePng, afterPng) !== 0) pass('attack is accepted', 'frame changed, no errors');
    else skip('attack is accepted', 'no error, but nothing visibly changed — may simply be out of range');
    await shot('after-attack');
  }

  // ---- 7. no errors accumulated over the whole session ---------------------------------
  const distinct = [...new Set(pageErrors)];
  if (distinct.length === 0) pass('no runtime errors during play');
  else fail('no runtime errors during play', `${pageErrors.length} total, ${distinct.length} distinct: ${distinct[0]}`);

  // ---- 8. the session was one continuous page ------------------------------------------
  // See the HMR note at the top. This is the check that turns "the run was silently truncated
  // by another agent's file save" from five mystery failures into one honest FAIL.
  if (navigations <= 1) pass('one uninterrupted session', `${navigations} navigation`);
  else fail('one uninterrupted session', `${navigations} navigations — the page reloaded mid-run, so every probe after the reload measured a fresh world`);

  // ---- report ---------------------------------------------------------------------------
  console.log(`\n  PLAYTEST  ${VIEW}\n`);
  for (const r of results) {
    const mark = r.s === 'PASS' ? ' ok ' : r.s === 'FAIL' ? 'FAIL' : 'skip';
    console.log(`  ${mark}  ${r.name.padEnd(34)} ${r.detail}`);
  }
  const nf = results.filter((r) => r.s === 'FAIL').length;
  const ns = results.filter((r) => r.s === 'SKIP').length;
  console.log(`\n  ${results.filter((r) => r.s === 'PASS').length} passed · ${nf} failed · ${ns} skipped`);
  if (ns) console.log('  A SKIP is not a pass. It means the probe could not observe what it needed.');
  if (SHOTS) console.log(`  shots -> progress/playtest/`);
  if (consoleErrors.length) {
    console.log(`\n  console errors (${consoleErrors.length}):`);
    [...new Set(consoleErrors)].slice(0, 5).forEach((e) => console.log('   ', e));
  }
  await writeFile(path.join(ROOT, 'progress/playtest.json'),
    JSON.stringify({ view: VIEW, at: new Date().toISOString(), script: SCRIPT, results, notes, pageErrors: distinct }, null, 2));

  if (KEEP) { console.log('\n  --keep: browser left open, ctrl-c to exit'); await new Promise(() => {}); }
  process.exitCode = nf ? 1 : 0;
} finally {
  if (!KEEP) { await browser.close(); if (vite) vite.kill(); }
}
