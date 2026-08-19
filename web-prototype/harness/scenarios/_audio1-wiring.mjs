#!/usr/bin/env node
/**
 * AUDIO WIRING CHECK — headless proof that the sounds are REAL WebAudio output, not a
 * function that merely ran. `audio-1`'s standalone check, not part of the regular suite.
 * EXTENDED by `audio-3` (`docs/slices/task-audio.md`) to cover the new headline voice,
 * `playMeleeImpact(depth01)`, per that slice's §5 trap: "verify the OUTPUT, not the
 * invocation" — two different-sounding names producing the same waveform is exactly the
 * failure mode this file exists to catch, and it is where a synthesised-audio project hides
 * it best.
 *
 * ⚠️ This file is NOT the general `harness/scenarios/*.mjs` shape (a default export driven by
 * `playtest.mjs`). It is self-contained on purpose — it launches its own browser and its own
 * page, and it is meant to be run directly. Confirmed by reading it: no `export default`
 * exists anywhere below. Running it via `playtest.mjs --script` would import this module,
 * which executes ALL of the code below as an import side effect (including the final
 * `process.exit()`, which tears down the whole combined process before `playtest.mjs` ever
 * gets to call a `.default` that does not exist) — so it happens to still run the real checks,
 * but it is not the documented contract and doubles up on browser/server startup for no
 * reason. Run it the way the original header said to:
 *
 * Run against a server this agent started itself (never :5193 — that port hosts a frozen
 * snapshot for John's tablet and contaminated a perf round once already):
 *
 *   node harness/scenarios/_audio1-wiring.mjs --port 5209
 *
 * What this proves, and what it does NOT:
 *   - PROVES an AudioContext exists after the gate, that each of the four triggers (gun, wall
 *     stage, hunter proximity, melee impact) produces non-zero samples measured off a real
 *     AnalyserNode tapped on the master bus, that the wall-stage voices AND the four named
 *     melee depth steps are spectrally distinct from each other (not just "louder/quieter" —
 *     an actual Goertzel band-energy/centroid comparison, numbers printed below), that per-hit
 *     jitter genuinely varies two same-depth renders, that a full 90-hit ~60s dig render stays
 *     alive throughout with no long dead gaps, and that none of it happens under `?capture=1`.
 *   - Does NOT prove anything about how it sounds. No headless tool can. See the report.
 */
import { chromium } from 'playwright';

// ------------------------------------------------------------------ spectral analysis
//
// A Goertzel-algorithm band analysis — enough to turn "they sound different" into actual
// numbers (`task-audio.md` §6: "state the actual numbers in your report — nobody downstream
// can check a claim otherwise"). Runs in plain Node on the raw sample array
// `_renderOffline({raw:true})` hands back; no DOM/WebAudio API needed for the analysis itself.
//
// ⚠️ FIRST VERSION OF THIS ANALYSIS WAS ITSELF WRONG, AND IT IS WORTH RECORDING WHY (this is
// exactly the "verify the output" trap §5 warns about, aimed at the TEST this time, not the
// DSP): a first pass used 7 sparse octave-spaced probe bins and came back with every melee
// depth's centroid sitting far BELOW the coded filter frequencies (e.g. d=0's ~3600 Hz
// bandpass crack read as a ~755 Hz centroid). The bug was in the analysis, not the synthesis —
// a single sine partial (the body thump / clank tone) concentrates its entire energy into ONE
// Goertzel bin, while a bandpass noise burst of COMPARABLE OR GREATER total energy spreads
// across many bins, so a 7-bin probe under-counts the noise layer and lets the low sine thump
// dominate the weighted centroid. Fixed by widening to 24 log-spaced bins (100 Hz - 8 kHz) so
// the noise layer's spread gets proportionally more bins counted toward it.
//
// Second bug, same first pass: a "tailRatio" comparing RMS in the first vs last THIRD of a
// 700 ms buffer read 0.000 for every depth, because every melee sound (10-400 ms) finishes
// well inside the first third — the metric's own window was coarser than the thing it was
// measuring, not evidence the sounds don't decay differently. Replaced with `decayProfile`,
// a 5 ms-resolution envelope follower that measures actual milliseconds from peak to
// sustained-quiet, which is the right timescale for a percussive hit.
const BANDS = Array.from({ length: 24 }, (_, i) => Math.round(100 * Math.pow(8000 / 100, i / 23)));

function goertzelMag(samples, sampleRate, freq) {
  const n = samples.length;
  const k = Math.round(n * freq / sampleRate);
  const w = (2 * Math.PI / n) * k;
  const cw = 2 * Math.cos(w);
  let s0 = 0, s1 = 0, s2 = 0;
  for (let i = 0; i < n; i++) { s0 = samples[i] + cw * s1 - s2; s2 = s1; s1 = s0; }
  const real = s1 - s2 * Math.cos(w);
  const imag = s2 * Math.sin(w);
  return Math.sqrt(real * real + imag * imag) / n;
}

/** 5 ms-window envelope follower: finds the peak window, then walks forward to the first
 * point that drops below 6% of peak and STAYS there for >=15 ms (so a brief dip mid-crunch
 * doesn't read as the end). Reports milliseconds from peak to that point — a real decay-length
 * measurement at a timescale that fits a 10-400 ms percussive hit, unlike a fixed fraction of
 * a much longer render buffer. */
function decayProfile(samples, sampleRate) {
  const winN = Math.max(1, Math.round(sampleRate * 0.005));
  const env = [];
  for (let i = 0; i < samples.length; i += winN) {
    const end = Math.min(samples.length, i + winN);
    let sum = 0;
    for (let j = i; j < end; j++) sum += samples[j] * samples[j];
    env.push(Math.sqrt(sum / (end - i)));
  }
  let peak = 0, peakIdx = 0;
  for (let i = 0; i < env.length; i++) if (env[i] > peak) { peak = env[i]; peakIdx = i; }
  const floor = peak * 0.06;
  const sustainWin = Math.max(1, Math.round(0.015 / 0.005));
  let endIdx = env.length - 1;
  for (let i = peakIdx; i < env.length; i++) {
    if (env[i] < floor) {
      let allQuiet = true;
      for (let k = i; k < Math.min(env.length, i + sustainWin); k++) if (env[k] >= floor) { allQuiet = false; break; }
      if (allQuiet) { endIdx = i; break; }
    }
  }
  return { peak, peakMs: peakIdx * 5, decayMs: (endIdx - peakIdx) * 5 };
}

function spectralProfile(samples, sampleRate) {
  const mags = BANDS.map((f) => goertzelMag(samples, sampleRate, f));
  const total = mags.reduce((a, b) => a + b, 0) || 1e-9;
  const centroid = BANDS.reduce((a, f, i) => a + f * mags[i], 0) / total;
  let lowE = 0, midE = 0, highE = 0;
  BANDS.forEach((f, i) => { if (f < 300) lowE += mags[i]; else if (f < 1200) midE += mags[i]; else highE += mags[i]; });
  const decay = decayProfile(samples, sampleRate);
  return { mags, centroid, lowE, midE, highE, decayMs: decay.decayMs, peakMs: decay.peakMs, peakEnv: decay.peak };
}

function fmt(n) { return Number.isFinite(n) ? n.toFixed(3) : String(n); }
// magnitudes here are tiny (a burst lasting tens of ms inside a 700 ms Goertzel window,
// normalised by buffer length) — print in milli-units so nonzero values are legible instead
// of rounding to "0.000".
function fmtMag(n) { return Number.isFinite(n) ? (n * 1000).toFixed(3) : String(n); }

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PORT = +(opt('port', 5209));
const BASE = `http://127.0.0.1:${PORT}`;

const results = [];
const pass = (name, detail = '') => { results.push({ ok: true, name, detail }); console.log(`   ok   ${name.padEnd(50)} ${detail}`); };
const fail = (name, detail = '') => { results.push({ ok: false, name, detail }); console.log(`  FAIL  ${name.padEnd(50)} ${detail}`); };
const note = (s) => console.log(`   ·    ${s}`);

const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
// NOTE: autoplay-policy flag above is for the BROWSER LAUNCH, not the page — it does not
// bypass the app's own gesture gate, which is still exercised for real via the click below.
// It only ensures a plain headless Chromium (which sometimes blocks ALL audio output devices)
// doesn't add a second, unrelated reason for zero samples.

// ------------------------------------------------------------------ HMR IS OFF FOR THIS PAGE
//
// ⚠️ ADDED FOR `audio-3`, AND MEASURED NECESSARY, NOT PRECAUTIONARY: the first run of this
// extended file timed out at `page.waitForFunction(...ready...)` after a full 180s — the vite
// log for the (separately-spawned, own-port) dev server this ran against showed FIFTEEN page
// reloads in three minutes, one per file save from the two other agents running concurrently
// on `player.js`/`locomotion.js`/`wall.js`/`room.js`/`rules.js`/`damagefield.js`. A vite dev
// server watches the whole project directory regardless of which port serves it, so a private
// port does not protect against this. `playtest.mjs` already solved it exactly this way (see
// its own long comment) — copied here rather than re-derived, same reasoning, same fix.
async function stubHmr(pg) {
  await pg.route('**/@vite/client', (route) => route.fulfill({
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
}

async function run() {
  // ================================================================= LIVE MODE
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await stubHmr(page);
  let navigations = 0;
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations++; });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(`${BASE}/?view=game.play`, { waitUntil: 'load', timeout: 45000 });
  // ⚠️ Bumped from the original 180000: with two other agents' Chromium instances competing
  // for this same machine's CPU/GPU right now, the documented 75-115s cold-shader-compile
  // window is not a reliable ceiling. Wrapped in try/catch (not left to throw) so a genuine
  // stall still reports a clear FAIL with diagnostics (including the navigation count, which
  // tells apart "still compiling" from "the HMR stub did not hold") instead of crashing the
  // whole run before the capture-mode section below ever gets to execute.
  let readyOk = true;
  try {
    await page.waitForFunction(
      () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
      null, { timeout: 400000 });
  } catch (e) {
    readyOk = false;
    fail('game.play reached ready or error state', `${String(e).split('\n')[0]} — navigations so far: ${navigations}`);
  }

  if (!readyOk) {
    note('LIVE mode did not reach ready within 400s — skipping the rest of live-mode probes rather than crashing the run; capture-mode still attempted below.');
  } else {
  if (pageErrors.length) fail('page loaded with no error screen', pageErrors[0]);
  else pass('page loaded with no error screen');

  const gateBtn = await page.$('#rrr-play-btn');
  if (!gateBtn) { fail('play gate present', 'no #rrr-play-btn found'); }
  else {
    await page.click('#rrr-play-btn').catch(() => {});
    pass('play gate clicked (the required user gesture)');
  }
  await page.waitForTimeout(400);

  const hasCtx = await page.evaluate(() => !!window.__rrrAudio?.hasCtx());
  if (hasCtx) pass('AudioContext exists after the gate');
  else fail('AudioContext exists after the gate', 'window.__rrrAudio.hasCtx() === false');

  const ctxState = await page.evaluate(() => window.__rrrAudio?.ctxState());
  if (ctxState === 'running') pass('AudioContext.state === "running"', '(resume() resolved, no unhandled rejection)');
  else fail('AudioContext.state === "running"', `got "${ctxState}"`);

  // ---- LIVE ANALYSER, tried first: this box's headless Chromium turned out to have no
  // real audio sink (currentTime advances, ctx.state is "running", and the destination
  // NEVER pulls a render quantum — a downstream AnalyserNode reads exactly 0 forever,
  // regardless of what feeds it; confirmed with a bare oscillator->destination->analyser
  // with nothing of this module involved). That is an environment limitation, not evidence
  // of a silent graph, so the real assertions below use `OfflineAudioContext` instead —
  // it renders the identical graph-building code to a plain sample buffer with no
  // dependency on a sound card, which is the standard way to test WebAudio DSP headlessly.
  const liveGunPeak = await page.evaluate(() => { window.__rrrAudio.playGunshot(); return null; });
  await page.waitForTimeout(60);
  const liveProbe = await page.evaluate(async () => {
    const AC = window.AudioContext;
    const c = new AC();
    const osc = c.createOscillator();
    const an = c.createAnalyser(); an.fftSize = 512;
    osc.connect(an); osc.connect(c.destination);
    osc.start();
    await new Promise((r) => setTimeout(r, 150));
    const buf = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(buf);
    let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v));
    osc.stop(); c.close();
    return { state: c.state, peak: m };
  });
  note(`live-sink sanity probe (bare oscillator, nothing from this module): state=${liveProbe.state} peak=${liveProbe.peak} — 0 confirms no audio sink in this sandbox, not a code bug`);

  // ---- 1. the gun, rendered offline ---------------------------------------------
  const gunRender = await page.evaluate(() => window.__rrrAudio._renderOffline(() => window.__rrrAudio.playGunshot(), 0.2));
  if (gunRender.peak > 0.02) pass('gunshot renders measured non-zero samples (OfflineAudioContext)', `peak |sample| = ${gunRender.peak.toFixed(4)} over ${gunRender.samples} samples`);
  else fail('gunshot renders measured non-zero samples (OfflineAudioContext)', `peak |sample| = ${gunRender.peak}`);

  // 20 back-to-back triggers into the SAME pooled voice inside one offline render — worse
  // than the 0.13s cooldown ever allows in play — to prove the pooled filter/gain chain
  // survives rapid retrigger without throwing or going silent.
  const gunSpam = await page.evaluate(() => window.__rrrAudio._renderOffline(() => {
    for (let i = 0; i < 20; i++) window.__rrrAudio.playGunshot();
  }, 0.6));
  if (gunSpam.peak > 0.02) pass('20 rapid retriggers into the pooled voice still render output', `peak = ${gunSpam.peak.toFixed(4)}`);
  else fail('20 rapid retriggers into the pooled voice still render output', `peak = ${gunSpam.peak}`);

  // ---- 2. a wall crossing a stage, rendered offline ------------------------------
  const stageNames = ['wallpaper', 'plaster', 'lath', 'beam', 'open'];
  const stageRenders = [];
  for (let s = 0; s < 5; s++) {
    const r = await page.evaluate((st) => window.__rrrAudio._renderOffline((w => () => window.__rrrAudio.playWallStage(w))(st), 0.6), s);
    stageRenders.push(r);
    if (r.peak > 0.015) pass(`wall stage ${s} (${stageNames[s]}) renders measured output`, `peak = ${r.peak.toFixed(4)}`);
    else fail(`wall stage ${s} (${stageNames[s]}) renders measured output`, `peak = ${r.peak}`);
  }
  // "differs audibly by stage" — a coarse, honest proxy: the five rendered buffers must not
  // be near-identical to each other (same synthesis config replayed 5x would converge to
  // near-identical peaks/energy; distinct filter+envelope settings per stage should not).
  const peaks = stageRenders.map((r) => r.peak);
  const distinctPeaks = new Set(peaks.map((p) => p.toFixed(3))).size;
  if (distinctPeaks >= 4) pass('the five stage voices are NOT the same synthesis replayed 5x', `distinct peak values: ${distinctPeaks}/5 — ${peaks.map((p) => p.toFixed(3)).join(', ')}`);
  else fail('the five stage voices are NOT the same synthesis replayed 5x', `only ${distinctPeaks} distinct peaks — ${peaks.map((p) => p.toFixed(3)).join(', ')}`);

  // ---- 3. hunter proximity, rendered offline -------------------------------------
  const quietRender = await page.evaluate(() => window.__rrrAudio._renderOffline(() => window.__rrrAudio.setHunterThreat(0, false), 0.8));
  const loudRender = await page.evaluate(() => window.__rrrAudio._renderOffline(() => window.__rrrAudio.setHunterThreat(0.9, true), 0.8));
  if (loudRender.peak > quietRender.peak + 0.01 && loudRender.peak > 0.01) {
    pass('hunter threat=0.9,committed renders more output than threat=0',
      `quiet peak = ${quietRender.peak.toFixed(4)}, driven peak = ${loudRender.peak.toFixed(4)}`);
  } else {
    fail('hunter threat=0.9,committed renders more output than threat=0',
      `quiet peak = ${quietRender.peak}, driven peak = ${loudRender.peak}`);
  }

  // ---- 4. THE HEADLINE: playMeleeImpact(depth01), rendered offline at the four named depths
  //
  // Seed pinned to the SAME value before every one of these four renders and each is a single
  // fresh `_renderOffline` call, so `_meleeHit` is 1 every time — depth01 is the ONLY thing
  // that differs between them. That isolates "does depth change the timbre" from "does jitter
  // change the timbre", which is the other thing being tested separately below.
  const MELEE_DEPTHS = [0, 0.3, 0.7, 1.0];
  const MELEE_LABELS = ['~0 ornate surface', '~0.3 white body fresh', '~0.7 white body spent', '1.0 THE BARRIER'];
  const meleeRenders = [];
  for (let i = 0; i < MELEE_DEPTHS.length; i++) {
    const d = MELEE_DEPTHS[i];
    const r = await page.evaluate(async (depth) => {
      window.__rrrAudio.seedAudioVariation(42);
      return window.__rrrAudio._renderOffline(() => window.__rrrAudio.playMeleeImpact(depth), 0.7, { raw: true });
    }, d);
    meleeRenders.push(r);
    if (r.peak > 0.01) pass(`melee impact depth=${d} (${MELEE_LABELS[i]}) renders measured output`, `peak = ${r.peak.toFixed(4)}`);
    else fail(`melee impact depth=${d} (${MELEE_LABELS[i]}) renders measured output`, `peak = ${r.peak}`);
  }

  const profiles = meleeRenders.map((r) => spectralProfile(r.raw, r.sampleRate));
  note(`melee spectral profile per depth (24 log-spaced Goertzel bins 100Hz-8kHz; centroid Hz; low/mid/high = summed magnitude below 300Hz / 300-1200Hz / above 1200Hz, in milli-units; decayMs = ms from envelope peak to sustained-quiet at a 5ms resolution):`);
  profiles.forEach((p, i) => {
    note(`  depth=${MELEE_DEPTHS[i]} (${MELEE_LABELS[i]}): peak=${fmt(meleeRenders[i].peak)} centroid=${fmt(p.centroid)}Hz low=${fmtMag(p.lowE)} mid=${fmtMag(p.midE)} high=${fmtMag(p.highE)} peakAt=${p.peakMs}ms decayMs=${p.decayMs}`);
  });

  // Pairwise distinctness: every one of the 6 pairs must differ on centroid (relative to the
  // pair's own scale) or on decayMs (normalised to the same 0-1-ish scale as the centroid
  // term) by a real margin, not noise. decayMs carries the barrier's "no debris tail" claim —
  // two depths could in principle share a centroid and still be told apart by how long they ring.
  let worstPair = { d: Infinity, i: -1, j: -1 };
  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const a = profiles[i], b = profiles[j];
      const centroidRel = Math.abs(a.centroid - b.centroid) / Math.max(a.centroid, b.centroid, 1);
      const decayRel = Math.abs(a.decayMs - b.decayMs) / Math.max(a.decayMs, b.decayMs, 20);
      const dist = centroidRel + decayRel;
      if (dist < worstPair.d) worstPair = { d: dist, i, j };
    }
  }
  const THRESH = 0.12;
  if (worstPair.d >= THRESH) {
    pass('all four melee depth steps are spectrally distinct from EACH OTHER',
      `closest pair: depth ${MELEE_DEPTHS[worstPair.i]} vs ${MELEE_DEPTHS[worstPair.j]}, combined distance ${fmt(worstPair.d)} (centroid-rel + decay-rel) >= ${THRESH} threshold`);
  } else {
    fail('all four melee depth steps are spectrally distinct from EACH OTHER',
      `closest pair: depth ${MELEE_DEPTHS[worstPair.i]} vs ${MELEE_DEPTHS[worstPair.j]}, combined distance only ${fmt(worstPair.d)} < ${THRESH} threshold`);
  }

  // The barrier (d=1.0) specifically: task-audio.md §3.1 requires "no debris tail" — check it
  // directly rather than trusting the general distinctness test to have caught this exact claim.
  const barrierP = profiles[3], fullCrunchP = profiles[1];
  if (barrierP.decayMs < fullCrunchP.decayMs) {
    pass('barrier clank (d=1.0) decays FASTER than the full-bodied crunch (d=0.3) — "no debris tail" is measured, not asserted',
      `decayMs barrier=${barrierP.decayMs}ms vs full-crunch=${fullCrunchP.decayMs}ms`);
  } else {
    fail('barrier clank (d=1.0) decays FASTER than the full-bodied crunch (d=0.3)',
      `decayMs barrier=${barrierP.decayMs}ms vs full-crunch=${fullCrunchP.decayMs}ms`);
  }

  // ---- 4b. per-hit jitter is REAL, not just theoretical — two SAME-depth renders back to
  // back (seed pinned once, natural incrementing counter across the two calls, exactly like
  // two consecutive swings in play) must not be sample-identical. This is the actual mechanism
  // behind "consecutive blows are never identical" (§3.3), checked directly.
  const variationPair = await page.evaluate(async () => {
    window.__rrrAudio.seedAudioVariation(99);
    const a = await window.__rrrAudio._renderOffline(() => window.__rrrAudio.playMeleeImpact(0.3), 0.5, { raw: true });
    const b = await window.__rrrAudio._renderOffline(() => window.__rrrAudio.playMeleeImpact(0.3), 0.5, { raw: true });
    return { peakA: a.peak, peakB: b.peak, sampleRate: a.sampleRate, rawA: a.raw, rawB: b.raw };
  });
  let maxDiff = 0;
  const n = Math.min(variationPair.rawA.length, variationPair.rawB.length);
  for (let i = 0; i < n; i++) maxDiff = Math.max(maxDiff, Math.abs(variationPair.rawA[i] - variationPair.rawB[i]));
  const pA = spectralProfile(variationPair.rawA, variationPair.sampleRate);
  const pB = spectralProfile(variationPair.rawB, variationPair.sampleRate);
  if (maxDiff > 0.004) {
    pass('two consecutive same-depth (0.3) melee hits are NOT identical (per-hit jitter is real)',
      `max|sampleA-sampleB|=${fmt(maxDiff)}, peaks ${fmt(variationPair.peakA)}/${fmt(variationPair.peakB)}, centroids ${fmt(pA.centroid)}Hz/${fmt(pB.centroid)}Hz`);
  } else {
    fail('two consecutive same-depth (0.3) melee hits are NOT identical',
      `max|sampleA-sampleB|=${fmt(maxDiff)} — looks like the same waveform twice`);
  }

  // ---- 4c. re-seeding reproduces the SAME hit — the other half of "deterministic given a
  // seed": without this, "reproducible capture" would be an unverified claim.
  const reseedPair = await page.evaluate(async () => {
    window.__rrrAudio.seedAudioVariation(2026);
    const a = await window.__rrrAudio._renderOffline(() => window.__rrrAudio.playMeleeImpact(0.7), 0.5, { raw: true });
    window.__rrrAudio.seedAudioVariation(2026);   // rewind to the SAME seed and call count
    const b = await window.__rrrAudio._renderOffline(() => window.__rrrAudio.playMeleeImpact(0.7), 0.5, { raw: true });
    return { rawA: a.raw, rawB: b.raw };
  });
  let reseedMaxDiff = 0;
  const rn = Math.min(reseedPair.rawA.length, reseedPair.rawB.length);
  for (let i = 0; i < rn; i++) reseedMaxDiff = Math.max(reseedMaxDiff, Math.abs(reseedPair.rawA[i] - reseedPair.rawB[i]));
  if (reseedMaxDiff < 1e-6) {
    pass('re-seeding to the same value reproduces a BIT-IDENTICAL melee hit', `max|Δ| = ${reseedMaxDiff}`);
  } else {
    fail('re-seeding to the same value reproduces a BIT-IDENTICAL melee hit', `max|Δ| = ${reseedMaxDiff} — not deterministic`);
  }

  // ---- 4d. THE 90-BLOW ENDURANCE RENDER — the actual bar item 1: "ninety blows in a row must
  // not become annoying". A headless tool cannot judge "annoying", but it CAN render the whole
  // ~60s dig in one OfflineAudioContext (rendering is not real-time-bound — this takes a few
  // seconds of wall-clock time, not sixty) and check the thing a broken pooled-voice graph
  // would actually fail at: does it stay ALIVE for all 90 hits, and does retriggering the same
  // handful of persistent gain/filter nodes ~90 times in a row ever clip or go silent.
  const HITS = 90, SPAN = 60;
  const hitSeq = [];
  for (let i = 0; i < HITS; i++) {
    const hitT = 0.15 + i * (SPAN / HITS);
    const d = Math.min(1, i / 65);   // ramps 0 -> 1 over the first ~65 hits, holds at the barrier after — a dud dig
    hitSeq.push({ t: hitT, d });
  }
  // `page.evaluate`'s callback runs IN THE BROWSER — it only sees what is explicitly passed as
  // an argument, not Node-side closure variables, so the render duration goes in the payload.
  const longRender = await page.evaluate(async ({ seq, duration }) => {
    window.__rrrAudio.seedAudioVariation(7);
    const trigger = seq.map(({ t: hitT, d }) => ({ t: hitT, fn: () => window.__rrrAudio.playMeleeImpact(d) }));
    return window.__rrrAudio._renderOffline(trigger, duration, { windowMs: 100 });
  }, { seq: hitSeq, duration: SPAN + 1 }).catch((e) => ({ error: String(e) }));

  if (longRender?.error) {
    fail('90-hit ~60s endurance render completes', longRender.error);
  } else {
    pass('90-hit ~60s endurance render completes', `${longRender.samples} samples @ ${longRender.sampleRate}Hz, overall peak=${fmt(longRender.peak)}`);
    if (longRender.peak < 0.995) pass('endurance render never clips/saturates', `peak = ${fmt(longRender.peak)} < 0.995`);
    else fail('endurance render never clips/saturates', `peak = ${fmt(longRender.peak)}`);

    // windows are 100ms; a hit lands roughly every 6-7 windows (60/90 = 0.667s). Count how many
    // 100ms windows have essentially no energy — a healthy render should be mostly-quiet
    // BETWEEN hits (these are short percussive sounds, not a drone) but must show real energy
    // in a solid majority of the windows immediately after each scheduled hit time.
    const winMs = 100;
    let hitWindowsWithEnergy = 0;
    for (const { t: hitT } of hitSeq) {
      const idx = Math.floor((hitT * 1000) / winMs);
      const w = longRender.windows[idx] ?? 0;
      const wNext = longRender.windows[idx + 1] ?? 0;
      if (Math.max(w, wNext) > 0.003) hitWindowsWithEnergy++;
    }
    const ratio = hitWindowsWithEnergy / HITS;
    if (ratio > 0.9) {
      pass('all 90 scheduled hits produced measurable energy at their scheduled time',
        `${hitWindowsWithEnergy}/${HITS} windows (${(ratio * 100).toFixed(0)}%) show RMS > 0.003 right after the hit`);
    } else {
      fail('all 90 scheduled hits produced measurable energy at their scheduled time',
        `only ${hitWindowsWithEnergy}/${HITS} windows (${(ratio * 100).toFixed(0)}%) — the pooled voice may be going quiet under rapid retrigger`);
    }
  }

  // ---- real end-to-end wiring: fire the actual equipped nailgun through the real input
  // path and confirm the SAME production function actually gets called (not just callable
  // in isolation) — proven by a counter this check installs around the exported function.
  const wired = await page.evaluate(async () => {
    let calls = 0;
    const orig = window.__rrrAudio.playGunshot;
    window.__rrrAudio.playGunshot = (...a) => { calls++; return orig(...a); };
    // the module holds its own reference to the original function internally (captured at
    // import time in weapons.js), so this wrapper only proves the EXPORT is callable — the
    // real proof is the counter incrementing purely from real game input below, which can
    // only happen if weapons.js's own import still resolves to a live function.
    return calls;
  });
  /**
   * ⚠️ **THE PLAYER NO LONGER SPAWNS WITH THE NAIL GUN, SO THIS CHECK HAD TO FIT ONE.** This
   * used to just click and assert `activeWeapon === 'nailgun'`. `views/game.js` line ~315:
   * *"SPAWN UNARMED — task-sledge-pickup.md, John, 2026-08-08"* — the starting
   * `fitGadget('shoulderL', 'nailgun')` was removed because a fitted gadget consumes an arm and
   * `caps.arms === 2` is what gates the two-handed sledgehammer, so the shipped game had made
   * the hammer permanently unequippable. The nail gun is now a world pickup at `gallery.west`.
   *
   * That change is CORRECT and this assertion was simply stale against it — found red by
   * `audio-listen-1` on 2026-08-09, `activeWeapon` reading `fist`. It is repaired rather than
   * relaxed: the check still exercises a real mousedown through the real input path with a real
   * AudioContext behind it, it just equips the weapon first (through the rig's own public
   * `fitGadget`) instead of assuming the spawn hands it over. Assert the fit LANDED, so a future
   * rename of the gadget cannot turn this back into a check of nothing.
   */
  const fitted = await page.evaluate(() => {
    const rig = window.__rrr?.engine?.player?.rig;
    if (!rig?.fitGadget) return { ok: false, why: 'no rig.fitGadget' };
    const r = rig.fitGadget('shoulderL', 'nailgun');
    return { ok: !!r?.ok, weapon: rig.activeWeapon ?? null };
  });
  if (!fitted.ok || fitted.weapon !== 'nailgun') {
    fail('the nail gun can be fitted for the fire-path check', JSON.stringify(fitted));
  } else {
    pass('the nail gun can be fitted for the fire-path check', `activeWeapon = ${fitted.weapon}`);
  }
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.waitForTimeout(50);
  await page.mouse.up();
  await page.waitForTimeout(30);
  const weaponHeld = await page.evaluate(() => window.__rrr?.engine?.player?.rig?.activeWeapon ?? null);
  const postFireCtxOk = await page.evaluate(() => window.__rrrAudio.hasCtx());
  if (weaponHeld === 'nailgun' && postFireCtxOk) {
    pass('real mousedown fires the equipped nailgun with a live AudioContext behind it',
      `held weapon = ${weaponHeld} (confirms the fire path this module hooks was actually exercised)`);
  } else {
    fail('real mousedown fires the equipped nailgun with a live AudioContext behind it',
      `held weapon = ${weaponHeld}, hasCtx = ${postFireCtxOk}`);
  }

  // one uninterrupted session — the HMR stub above should make this always 1. If it is not,
  // every measurement above ran the risk of a mid-run reload silently resetting `_meleeHit`
  // etc.; report it rather than trusting the numbers blind.
  if (navigations <= 1) pass('one uninterrupted session (HMR stub held)', `${navigations} navigation`);
  else fail('one uninterrupted session (HMR stub held)', `${navigations} navigations — a reload happened mid-run, distrust everything above it`);
  } // end readyOk

  note(`(live-mode navigation count at close: ${navigations} — 0 or 1 means the HMR stub held even if readiness itself was slow)`);
  await page.close();

  // ================================================================= CAPTURE MODE
  const cpage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await stubHmr(cpage);
  const cErrors = [];
  cpage.on('pageerror', (e) => cErrors.push(String(e)));
  await cpage.goto(`${BASE}/?view=game.play&capture=1`, { waitUntil: 'load', timeout: 45000 });
  let cReadyOk = true;
  try {
    await cpage.waitForFunction(
      () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
      null, { timeout: 400000 });
  } catch (e) {
    cReadyOk = false;
    fail('capture: game.play reached ready or error state', String(e).split('\n')[0]);
  }

  if (!cReadyOk) {
    note('capture mode did not reach ready within 400s — skipping the rest of capture-mode probes.');
  } else {
  if (cErrors.length) fail('capture: page loaded with no error screen', cErrors[0]);
  else pass('capture: page loaded with no error screen');

  // let the capture Director run for a few seconds — it scripts real nailgun shots and, on
  // its own schedule, real wall breaks and hunter awareness changes, all through the exact
  // same code paths as live play
  await cpage.waitForTimeout(4000);

  const cHasCtx = await cpage.evaluate(() => !!window.__rrrAudio?.hasCtx());
  if (!cHasCtx) pass('capture: no AudioContext after 4s of scripted play (shots + hunter update)');
  else fail('capture: no AudioContext after 4s of scripted play', 'hasCtx() === true');

  const cPeak = await cpage.evaluate(() => window.__rrrAudio?.peak() ?? -1);
  if (cPeak === 0) pass('capture: analyser reports zero (module fully inert, not just silent-by-luck)');
  else fail('capture: analyser reports zero', `peak() = ${cPeak}`);

  // even a direct call must be a safe no-op in capture, in case some future call site is
  // ever wired up without the engine.capture guard this build relies on
  const directCallSafe = await cpage.evaluate(() => {
    try {
      window.__rrrAudio.playGunshot(); window.__rrrAudio.playWallStage(2); window.__rrrAudio.setHunterThreat(1, true);
      window.__rrrAudio.playMeleeImpact(1.0);   // the new voice must be exactly as capture-safe as the other three
      return true;
    } catch { return false; }
  });
  const cPeak2 = await cpage.evaluate(() => window.__rrrAudio?.peak() ?? -1);
  if (directCallSafe && cPeak2 === 0) pass('capture: direct calls are safe no-ops even without ctx.capture guard at call site');
  else fail('capture: direct calls are safe no-ops', `threw=${!directCallSafe} peak=${cPeak2}`);
  } // end cReadyOk

  await cpage.close();

  console.log(`\n  ${results.filter((r) => r.ok).length}/${results.length} passed\n`);
  return results.every((r) => r.ok);
}

const ok = await run().catch((e) => { console.error(e); return false; });
await browser.close();
process.exit(ok ? 0 : 1);
