#!/usr/bin/env node
/**
 * AUDIO RENDER — turn the game's real audio graph into WAV files a human can double-click.
 *
 * WHY THIS EXISTS. `src/audio/audio.js` has four synthesised voices and **no human has ever
 * heard the headline one**. `harness/scenarios/_audio1-wiring.mjs` proves the samples are
 * non-zero and spectrally distinct per depth; that is a wiring proof, not a taste one. John's
 * only listen predates the sledgehammer entirely and his verdict was "there are a few sounds.
 * they are pretty meh." Every playtest since has been muted. This file closes that loop: it
 * renders the SHIPPED functions offline and writes `refs/audio/*.wav` plus a `LISTEN.html`
 * page and a `LISTEN.bat` launcher, so the question stops being "did it render" and starts
 * being "is it good".
 *
 *   node harness/audio-render.mjs              # render everything into refs/audio/
 *   node harness/audio-render.mjs --only 08    # re-render one clip by its number prefix
 *   node harness/audio-render.mjs --json       # machine-readable metrics on stdout
 *
 * HOW IT STAYS HONEST — three separate anti-lying-instrument measures, because "it rendered
 * non-silent" is exactly the class of proof this project keeps getting burned by:
 *
 *   1. IT RUNS THE SHIPPED FILE, NOT A COPY OF ITS IDEAS. The bytes of `src/audio/audio.js`
 *      are read off disk and served to a Chromium page as an ES module; the page then calls
 *      the real exported `playMeleeImpact` / `playGunshot` / `playWallStage` /
 *      `setHunterThreat` through `window.__rrrAudio`, against an `OfflineAudioContext` swapped
 *      in by the module's own `_renderOffline`. No Node-side re-synthesis exists anywhere in
 *      this file — a rival instrument would drift from the game within a week.
 *      ⚠️ `audio.js` currently imports NOTHING, which is what makes serving one file enough.
 *      `assertStandalone()` below FAILS LOUDLY the day that stops being true, rather than
 *      quietly rendering something stale.
 *      ⚠️ It deliberately does NOT boot `game.play`. Cold boot is ~168 s of shader compiles
 *      that have nothing to do with audio, and a vite dev server watches the whole project, so
 *      any other agent saving a file mid-render reloads the page (HANDOFF's HMR hazard). One
 *      blank page + one file = no server, no boot, no cross-agent contamination.
 *
 *   2. EVERY CLIP IS MEASURED OFF THE WAV IT ACTUALLY WROTE, not off the render call. Peak,
 *      RMS, crest, spectral centroid, attack and decay are computed by decoding the finished
 *      file back from disk. A clip that came out silent, clipped or DC-offset says so in the
 *      table and on the page.
 *
 *   ⚠️ **THE WAVs ARE NOT BYTE-STABLE ACROSS RUNS AND THAT IS NOT A DETERMINISM BUG — MEASURED.**
 *      `seedAudioVariation(0x5eed)` is pinned before every clip, so two runs of this harness
 *      produce the same synthesis. Re-rendering and comparing sample-by-sample: the 0.5 s
 *      gunshot differed in **1 sample out of 22,050** and the 61 s dig montage in **11 out of
 *      2,718,765**, in both cases by exactly **one 16-bit LSB (3.05e-5)**. That is float values
 *      landing on a quantisation boundary — Chrome's audio graph is deterministic to well below
 *      −90 dBFS but not to the last bit of a float. So compare CLIPS BY MEASUREMENT, never by
 *      hash; an md5 diff between two runs of this file means nothing.
 *
 *   3. THE DIG MONTAGE USES THE REAL DEPTH TRACE, NOT A RAMP. `digTrace()` drives the actual
 *      `DamageField` from `src/destruction/damagefield.js` with `_tmp_lobesim.mjs`'s own
 *      competent-aim heuristic and records the `depthAt` each blow returns — which is the
 *      exact value `player.js` feeds `playMeleeImpact`. A linear 0->1 ramp over 90 hits is
 *      NOT what the game does (see the report / the `06` and `08` clips): a virgin spot goes
 *      0.31, 0.55, 0.71, 0.84, 0.94, 1.00 in six blows and then the player moves, so depth
 *      sawtooths. Both are rendered — `07` is the briefed ramp, `08` is the game — precisely so
 *      the difference is audible rather than argued about.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { DamageField, CELL } from '../src/destruction/damagefield.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const AUDIO_JS = path.join(ROOT, 'src', 'audio', 'audio.js');
const OUT_DIR = path.join(ROOT, 'refs', 'audio');
const SR = 44100;

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const ONLY = opt('only', null);
const AS_JSON = argv.includes('--json');

// ------------------------------------------------------------------ 1. the shipped module
/**
 * `audio.js` is self-contained today (zero `import` statements, everything synthesised). That
 * is the ONLY reason serving one file to a blank page is equivalent to running the game's
 * audio. If it ever grows a dependency this stops being true silently, so fail here instead.
 */
function assertStandalone(src) {
  const bad = src.split('\n')
    .map((l, i) => ({ l: l.trim(), n: i + 1 }))
    .filter(({ l }) => /^import\s|^export\s+\*\s+from|^\s*import\(/.test(l));
  if (bad.length) {
    console.error(`\n  ✗ src/audio/audio.js now has imports (line ${bad[0].n}: ${bad[0].l}).`);
    console.error('    This harness serves it as a single standalone module and can no longer do so.');
    console.error('    Fix: serve the whole src/ tree here, or point this at the vite dev server.\n');
    process.exit(2);
  }
}

// ------------------------------------------------------------------ 2. WAV out
function writeWav(file, samples, sampleRate = SR) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
  return buf.length;
}

/** Read a WAV this file wrote back off disk — measurements are taken on the finished artifact,
 * never on the in-memory render, so "the file John clicks" is literally the thing measured. */
function readWav(file) {
  const buf = fs.readFileSync(file);
  const sampleRate = buf.readUInt32LE(24);
  const dataLen = buf.readUInt32LE(40);
  const n = dataLen / 2;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(44 + i * 2) / 32768;
  return { samples: out, sampleRate };
}

// ------------------------------------------------------------------ 3. measurement
//
// Goertzel bank rather than an FFT: 40 log-spaced probes 80 Hz - 12 kHz is plenty to place a
// centroid and it needs no dependency. ⚠️ `_audio1-wiring.mjs` recorded that a SPARSE bank
// under-counts a broadband noise burst relative to a single sine partial (all of a sine's
// energy lands in one bin), which dragged its first centroids far below the coded filter
// frequencies. 40 bins is dense enough that the noise layer gets proportional weight; the
// numbers below still sit low relative to a filter's centre frequency for exactly that reason
// and should be read as a RELATIVE ordering between clips, not as an absolute brightness.
const BANDS = Array.from({ length: 40 }, (_, i) => Math.round(80 * Math.pow(12000 / 80, i / 39)));

function goertzel(x, sampleRate, freq, from = 0, to = x.length) {
  const n = to - from;
  if (n < 8) return 0;
  const k = Math.round(n * freq / sampleRate);
  const w = (2 * Math.PI / n) * k;
  const cw = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = from; i < to; i++) { const s0 = x[i] + cw * s1 - s2; s2 = s1; s1 = s0; }
  const re = s1 - s2 * Math.cos(w), im = s2 * Math.sin(w);
  return Math.sqrt(re * re + im * im) / n;
}

function centroidOf(x, sampleRate, from = 0, to = x.length) {
  const mags = BANDS.map((f) => goertzel(x, sampleRate, f, from, to));
  const tot = mags.reduce((a, b) => a + b, 0) || 1e-12;
  return { centroid: BANDS.reduce((a, f, i) => a + f * mags[i], 0) / tot, mags, tot };
}

/** 2 ms-window envelope. Fine enough to resolve a 5 ms attack, which a 5 ms window cannot. */
function envelope(x, sampleRate, winMs = 2) {
  const w = Math.max(1, Math.round(sampleRate * winMs / 1000));
  const env = [];
  for (let i = 0; i < x.length; i += w) {
    const e = Math.min(x.length, i + w);
    let s = 0; for (let j = i; j < e; j++) s += x[j] * x[j];
    env.push(Math.sqrt(s / (e - i)));
  }
  return { env, winMs };
}

function transientShape(x, sampleRate, from = 0, to = x.length) {
  const seg = x.subarray(from, to);
  const { env, winMs } = envelope(seg, sampleRate);
  let peak = 0, pi = 0;
  for (let i = 0; i < env.length; i++) if (env[i] > peak) { peak = env[i]; pi = i; }
  // attack: from the last window under 10% of peak before the peak, to the peak
  let a = pi; while (a > 0 && env[a - 1] > peak * 0.1) a--;
  // decay: peak to the first window under 6% of peak that STAYS under for 20 ms
  const hold = Math.max(1, Math.round(20 / winMs));
  let d = env.length - 1;
  for (let i = pi; i < env.length; i++) {
    if (env[i] < peak * 0.06) {
      let quiet = true;
      for (let k = i; k < Math.min(env.length, i + hold); k++) if (env[k] >= peak * 0.06) { quiet = false; break; }
      if (quiet) { d = i; break; }
    }
  }
  return { attackMs: (pi - a) * winMs, decayMs: (d - pi) * winMs, envPeak: peak };
}

const dbfs = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
const fx = (n, p = 3) => (Number.isFinite(n) ? n.toFixed(p) : String(n));

function measure(file) {
  const { samples: x, sampleRate } = readWav(file);
  let peak = 0, sum = 0, dc = 0, clipped = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a > peak) peak = a;
    if (a >= 0.999) clipped++;
    sum += x[i] * x[i]; dc += x[i];
  }
  const rms = Math.sqrt(sum / x.length);
  const { centroid } = centroidOf(x, sampleRate);
  const t = transientShape(x, sampleRate);
  return {
    seconds: +(x.length / sampleRate).toFixed(2),
    peak: +peak.toFixed(4), peakDb: +dbfs(peak).toFixed(1),
    rms: +rms.toFixed(5), rmsDb: +dbfs(rms).toFixed(1),
    crestDb: +(dbfs(peak) - dbfs(rms)).toFixed(1),
    dcOffset: +(dc / x.length).toFixed(5),
    clippedSamples: clipped,
    centroidHz: Math.round(centroid),
    attackMs: t.attackMs, decayMs: t.decayMs,
  };
}

/**
 * Per-hit analysis of a montage — the part a single peak/RMS number cannot answer. For each
 * scheduled blow, measure the local peak, the local spectral centroid and the local decay, then
 * report the SPREAD between consecutive hits. That spread is the anti-fatigue mechanism made
 * numeric: if consecutive hits differ by a fraction of a dB and a few Hz, ninety of them is a
 * machine gun no matter what the per-hit jitter code claims to do.
 */
function perHit(file, hitTimes) {
  const { samples: x, sampleRate } = readWav(file);
  const hits = [];
  for (let i = 0; i < hitTimes.length; i++) {
    const from = Math.floor(hitTimes[i] * sampleRate);
    const to = Math.min(x.length, Math.floor((hitTimes[i + 1] ?? (hitTimes[i] + 0.9)) * sampleRate));
    if (to - from < 64) continue;
    let pk = 0, s = 0;
    for (let j = from; j < to; j++) { const a = Math.abs(x[j]); if (a > pk) pk = a; s += x[j] * x[j]; }
    const { centroid } = centroidOf(x, sampleRate, from, to);
    const sh = transientShape(x, sampleRate, from, to);
    // TAIL energy — everything from 90 ms after the strike onward. ⚠️ This exists because peak
    // and whole-window centroid are both dominated by the transient and are therefore BLIND to
    // the layers that actually distinguish two blows from each other (grit falling, a lath
    // splitting, the cavity ringing). A build can change what happens after the hit completely
    // and move `meanConsecutivePeakDeltaDb` by 0.0 dB. Measure the tail separately or do not
    // claim anything about fatigue.
    // ⚠️ REPORT null, NOT 0, WHEN THERE IS NO TAIL WINDOW TO MEASURE. The gun fires every 130 ms,
    // so its per-hit window barely reaches 90 ms and the tail spread came back as a confident
    // "0.00 dB" — which reads as "every shot's tail is identical" when the truth is "this clip
    // has no tail to measure". A probe that cannot observe must say so.
    const tf = from + Math.floor(0.09 * sampleRate);
    let tailRms = null;
    if (to - tf > 0.04 * sampleRate) {
      let ts = 0;
      for (let j = tf; j < to; j++) ts += x[j] * x[j];
      tailRms = Math.sqrt(ts / (to - tf));
    }
    hits.push({ t: +hitTimes[i].toFixed(3), peak: pk, rms: Math.sqrt(s / (to - from)), centroid, decayMs: sh.decayMs, tailRms });
  }
  const stat = (get) => {
    const v = hits.map(get);
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
    return { mean: m, sd, min: Math.min(...v), max: Math.max(...v) };
  };
  // consecutive-hit deltas — the thing an ear actually notices across a long sequence
  let dPeakDb = 0, dCent = 0, dTailDb = 0, nTail = 0;
  for (let i = 1; i < hits.length; i++) {
    dPeakDb += Math.abs(dbfs(hits[i].peak) - dbfs(hits[i - 1].peak));
    dCent += Math.abs(hits[i].centroid - hits[i - 1].centroid) / Math.max(1, hits[i - 1].centroid);
    if (hits[i].tailRms !== null && hits[i - 1].tailRms !== null) {
      dTailDb += Math.min(24, Math.abs(dbfs(Math.max(1e-5, hits[i].tailRms)) - dbfs(Math.max(1e-5, hits[i - 1].tailRms))));
      nTail++;
    }
  }
  const nD = Math.max(1, hits.length - 1);
  const silent = hits.filter((h) => h.peak < 0.005).length;
  return {
    n: hits.length,
    silentHits: silent,
    peak: stat((h) => h.peak),
    peakDbSd: +Math.sqrt(hits.map((h) => dbfs(h.peak)).reduce((a, b, _, arr) => a + (b - arr.reduce((p, q) => p + q, 0) / arr.length) ** 2, 0) / hits.length).toFixed(2),
    centroid: stat((h) => h.centroid),
    decayMs: stat((h) => h.decayMs),
    meanConsecutivePeakDeltaDb: +(dPeakDb / nD).toFixed(2),
    meanConsecutiveCentroidDeltaPct: +((dCent / nD) * 100).toFixed(2),
    meanConsecutiveTailDeltaDb: nTail ? +(dTailDb / nTail).toFixed(2) : null,
    hits,
  };
}

// ------------------------------------------------------------------ 4. the real dig trace
/**
 * Drive the actual `DamageField` and record the `depthAt` each blow returns — the same number
 * `player.js` hands `playMeleeImpact`. Two phases, matching `damagefield.js`'s own measured
 * dig band (probe = 6 blows, opening the answer = 48, whole search ~66 s at a 0.95 s swing):
 *   · two DUD probes: six blows each to bottom out on the barrier, plus one extra swing at the
 *     bottomed-out spot, because a player who has just heard the field hits it once more to be
 *     sure. Those extra swings are the barrier force field doing its job in situ.
 *   · then the real dig: competent aim (the shallowest cell in a body-wide window), which is
 *     `_tmp_lobesim.mjs`'s own `aim()`, copied rather than imported so this file does not take
 *     a dependency on a scratch probe someone may delete.
 */
function aimShallowest(g, maxV = 1.95) {
  const cy1 = Math.min(g.rows - 1, Math.ceil(maxV / g.cellH));
  const needed = Math.ceil(0.80 / g.cellW);
  const cx0 = Math.max(0, Math.round(g.cols / 2 - needed / 2));
  const cx1 = Math.min(g.cols - 1, cx0 + needed - 1);
  let bx = cx0, by = 0, bd = 2;
  for (let cy = 0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const d = g.depth[g.idx(cx, cy)];
      if (d < bd) { bd = d; bx = cx; by = cy; }
    }
  }
  return [(bx + 0.5) / g.cols, (by + 0.5) / g.rows];
}

function digTrace() {
  const blows = [];   // { d, barrier, blocked, brokeThrough }
  /**
   * ⚠️ **`barrierAt(u, v)` IS THE SIGNAL, `blocked` IS NOT — MEASURED, AFTER I GOT IT WRONG.**
   * `blocked` is `removed <= 1e-6`. Across this whole 63-blow drive on an all-barrier field
   * (`new DamageField(...)` fills `barrier` with 1) it is true **zero** times: the brush is
   * 0.52 m across with a 0.62 rim, so some neighbouring cell is always still giving way even
   * when the aim point bottomed out six blows ago. A refusal gated on `blocked` would essentially
   * never fire. `barrierAt` answers the actual question — is there cyan behind this spot — and
   * combined with a bottomed-out depth it is exactly the condition the sound is for.
   * `wall.js`'s `applyHit` does not currently return it; that is the one-line change named in
   * `playMeleeImpact`'s header.
   */
  const hit = (g, u, v) => {
    const r = g.applyHit(u, v, 1);
    blows.push({
      d: r.depthAt, barrier: !!g.barrierAt(u, v),
      blocked: r.removed <= 1e-6, brokeThrough: !!r.brokeThrough,
    });
    return r;
  };
  // --- two dud probes: bottom out on the barrier, then one more swing to be sure
  for (let p = 0; p < 2; p++) {
    const g = new DamageField({ width: 2.96, height: 2.80, cell: CELL });
    const u = 0.35 + p * 0.30;
    for (let i = 0; i < 12; i++) {
      const r = hit(g, u, 0.40);
      if (r.depthAt >= 0.999) { hit(g, u, 0.40); break; }
    }
  }
  // --- the dig that works. `clearBarrier` opens a band so this reads as breakable material,
  // which is what the second half of a real dig is; without it every blow here is over cyan.
  const g = new DamageField({ width: 2.96, height: 2.80, cell: CELL });
  g.setBarrierEverywhere(false);
  for (let i = 0; i < 48; i++) {
    const a = aimShallowest(g);
    hit(g, a[0], a[1]);
  }
  const nBlocked = blows.filter((b) => b.blocked).length;
  const nClank = blows.filter((b) => b.barrier && b.d >= 0.999).length;
  const nDeepNotBarrier = blows.filter((b) => b.d >= 0.999 && !b.barrier).length;
  return { blows, nBlocked, nClank, nDeepNotBarrier };
}

// ------------------------------------------------------------------ 5. the clip list
const SWING = 0.95;     // src/game/rules.js sledge cooldown-adjacent cadence; damagefield.js §band

const dig = digTrace();

const CLIPS = [
  {
    id: '01', file: '01-impact-fresh.wav', title: 'Impact — depth 0.00 (a fresh, undamaged surface)',
    blurb: 'THIS IS WHAT EVERY ORDINARY WALL IN THE HOUSE SOUNDS LIKE, ON EVERY BLOW FOREVER — wall.js\'s no-damage-field arm returns a hard-coded depth of 0. A dig wall, by contrast, never reports a depth this low (see 06).',
    seconds: 0.8,
    plan: [{ t: 0.05, kind: 'melee', d: 0.0 }],
  },
  {
    id: '02', file: '02-impact-mid.wav', title: 'Impact — depth 0.35 (into the body of the wall)',
    blurb: 'Meant to be the biggest, lowest, most full-bodied blow in the set.',
    seconds: 0.8,
    plan: [{ t: 0.05, kind: 'melee', d: 0.35 }],
  },
  {
    id: '03', file: '03-impact-deep.wav', title: 'Impact — depth 0.70 (spent material, digging into cavity)',
    blurb: 'Should read as drier and deader than 02 without simply being quieter.',
    seconds: 0.8,
    plan: [{ t: 0.05, kind: 'melee', d: 0.70 }],
  },
  {
    id: '04', file: '04-impact-barrier.wav', title: 'Impact — THE CYAN BARRIER (depth 1.00, blocked)',
    blurb: 'THE ONE THAT HAS TO SAY "NOT HERE" WITH NO TEXT. Judge this hardest.',
    seconds: 0.8,
    plan: [{ t: 0.05, kind: 'melee', d: 1.0, opts: { barrier: true } }],
  },
  {
    id: '05', file: '05-barrier-x4.wav', title: 'The barrier, four swings in a row (what a dud spot really sounds like)',
    blurb: 'A single hit is not the test — the player hears it 2-4 times before believing it. Listen for the rebound (a second, outward event ~40 ms after each contact) and whether four in a row start to grate.',
    seconds: 4.2,
    plan: [0, 1, 2, 3].map((i) => ({ t: 0.15 + i * SWING, kind: 'melee', d: 1.0, opts: { barrier: true } })),
  },

  // ── THE CHOICE. Three readings of "force field", same clip format, so John picks by ear.
  // Each is one hit, a gap, then four in a row — the single sound and the fatigue test in one
  // file. `voice` is passed to `audio.js`'s `setBarrierVoice()`; everything else about the
  // render is identical, so any difference you hear is the design and not the harness.
  ...[
    ['04a', 'swallow', 'SWALLOWED — the blow vanishes into it',
      'No impact sound at all. The hammer makes no crack, no tap, nothing: the sound rises INTO the contact instead of starting at it, hums for 50 ms in a register no wall in this house occupies, and stops dead. Then something is pushed back out at you. Ask: does "nothing hit anything" read as a wall refusing you, or as a swing that did not register?'],
    ['04b', 'shove', 'SHOVED — it pushes the hammer back at you',
      'You DO feel a contact — a dull, dead tap with no brightness and no ring, like hitting something that gives nothing — and then the field answers, hard. The push-back is the loudest part of the sound and it flies upward and away. The safest of the three: there is an unmistakable moment of impact.'],
    ['04c', 'disperse', 'DISPERSED — the hit spreads out and travels away',
      'The blow instantly stops being a point and becomes a widening wash that climbs away from you and is gone. Longest of the three at about a tenth of a second, but it is fading for nearly all of it. Ask: does "the energy went somewhere else" say NOT HERE, or just say pretty?'],
  ].map(([id, voice, title, blurb]) => ({
    id, voice, file: `${id}-barrier-${voice}.wav`,
    title: `ALTERNATE — ${title}`,
    blurb: `${blurb} One hit, a pause, then four in a row.`,
    seconds: 6.3,
    plan: [0.15, 2.0, 2.95, 3.90, 4.85].map((t) => ({ t, kind: 'melee', d: 1.0, opts: { barrier: true } })),
  })),
  {
    id: '06', file: '06-one-spot-real.wav', title: 'ONE SPOT, SEVEN BLOWS — the real ladder the game plays',
    blurb: 'Real DamageField depths 0.31 / 0.55 / 0.71 / 0.84 / 0.94 / 1.00, then one more swing that takes nothing off (the force field). This is the whole arc a player hears at one spot — and the reason clip 01 is theoretical: a dig wall never reports a depth below 0.31.',
    seconds: 0.15 + 7 * SWING + 1.2,
    plan: [
      { d: 0.31 }, { d: 0.551 }, { d: 0.713 }, { d: 0.836 }, { d: 0.935 },
      { d: 1.0 }, { d: 1.0, opts: { barrier: true } },
    ].map((h, i) => ({ t: 0.15 + i * SWING, kind: 'melee', ...h })),
  },
  {
    id: '07', file: '07-montage-90-ramp.wav', title: 'FATIGUE MONTAGE A — 90 blows, depth ramped 0 -> 1 (the briefed model)',
    blurb: '60 s at a blow every 0.667 s with depth rising smoothly. Useful as a sweep of the whole ladder, but it is NOT what the game does — see B.',
    seconds: 62,
    plan: Array.from({ length: 90 }, (_, i) => ({ t: 0.3 + i * (60 / 90), kind: 'melee', d: Math.min(1, i / 65) })),
  },
  {
    id: '08', file: '08-montage-real-dig.wav', title: 'FATIGUE MONTAGE B — the ACTUAL dig, real DamageField depths and real blocked flags',
    blurb: `${dig.blows.length} blows at a 0.95 s swing: two dud probes over cyan (each ending in the force field) then the dig that works. Exactly ${dig.nClank} blows here are a real barrier contact; ${dig.nDeepNotBarrier} more report depth 1.00 on BREAKABLE material and under the old depth-only rule every one of those played the "not here" sound too. This is the montage that matters — it is what sixty seconds of the game sounds like.`,
    seconds: 0.3 + dig.blows.length * SWING + 1.5,
    plan: dig.blows.map((b, i) => ({
      t: 0.3 + i * SWING, kind: 'melee', d: b.d,
      opts: { barrier: b.barrier, brokeThrough: b.brokeThrough },
    })),
  },
  {
    id: '09', file: '09-gun-single.wav', title: 'Nailgun — one shot',
    blurb: 'One of the three voices John already called "pretty meh".',
    seconds: 0.5, plan: [{ t: 0.05, kind: 'gun' }],
  },
  {
    id: '10', file: '10-gun-burst.wav', title: 'Nailgun — held trigger, 12 shots at the real 0.13 s cooldown',
    blurb: 'The most-repeated sound in the game. Does a held trigger read as a mechanism or as a buzz?',
    seconds: 2.2,
    plan: Array.from({ length: 12 }, (_, i) => ({ t: 0.08 + i * 0.13, kind: 'gun' })),
  },
  {
    id: '11', file: '11-wall-stages.wav', title: 'Wall stage crossings — wallpaper, plaster, lath, beam, BREACH',
    blurb: 'Fires once per stage boundary. Should read as five materials, not one crack five times.',
    seconds: 5.0,
    plan: [0, 1, 2, 3, 4].map((s, i) => ({ t: 0.2 + i * 0.95, kind: 'wall', stage: s })),
  },

  // ── 🚪 THE DOOR. John, 2026-08-10: *"the hunter is much stronger and bangs away at the doors
  // to scare the players and eventually break its way in. If the players don't move out of the
  // room this can be the timer."* `DOOR_PROGRESS` below is not a ramp and not a guess — it is
  // the six values `HunterAI.doorProgress()` actually returns as `WEAPON_DAMAGE.hunterSlam` (46)
  // eats a breachable door's `STAGE_DEFS` health (40/70/55/90, with carry-over between stages),
  // which is the number `views/game.js` passes to `playDoorBang`. Same discipline as clip 08.
  ...(() => {
    const D = [0.2714, 0.4357, 0.6273, 0.8028, 0.9306, 1.0];
    const CAD = 2.4;   // `hunter-ai.js` BANG_CADENCE — the pacing knob, imported by hand
    return [
      {
        id: '13', file: '13-door-first.wav', title: 'Door bang — the FIRST blow on an untouched chained door',
        blurb: 'One blow, close, no wall between. Listen for the chain: a tight little cluster of metal right on the impact. That layer is the only thing saying this is a CHAINED door and not a heavy knock — if it does not read, the mechanic has no identity.',
        seconds: 1.2, plan: [{ t: 0.08, kind: 'door', e: D[0], opts: { distance: 3 } }],
      },
      {
        id: '14', file: '14-door-last.wav', title: 'Door bang — the LAST blow before it comes off its hinges',
        blurb: 'The same event at escalation 1.0. Against 13 it should differ by MATERIAL, not by volume: an octave lower, the chain loose and long instead of tight, a timber split that simply does not exist in 13, and a hinge groan bending underneath. If this only sounds LOUDER than 13, the escalation has failed.',
        seconds: 1.6, plan: [{ t: 0.08, kind: 'door', e: D[5], opts: { distance: 3 } }],
      },
      {
        id: '15', file: '15-door-timer.wav', title: 'THE TIMER — all six blows, real progress, real 2.4 s cadence',
        blurb: 'This is John\'s timer end to end: six blows at the shipped cadence, escalating through the door\'s own remaining health. The question to judge is whether you can tell, by ear alone and without counting, that blow five is nearly through and blow two is not.',
        seconds: 0.3 + 6 * CAD + 1.4,
        plan: D.map((e, i) => ({ t: 0.3 + i * CAD, kind: 'door', e, opts: { distance: 3 } })),
      },
      {
        id: '16', file: '16-door-from-inside.wav', title: 'The same six blows AS THE PLAYER IN THE SEALED ROOM HEARS THEM',
        blurb: 'Distance 6 m with the door between you and it, which is the case the mechanic exists for — the top is rolled off by 72% so the chain and the split are muffled and the mass carries. Judge this one for DREAD and for locatability; 15 is the one to judge the escalation on.',
        seconds: 0.3 + 6 * CAD + 1.4,
        plan: D.map((e, i) => ({ t: 0.3 + i * CAD, kind: 'door', e, opts: { distance: 6, throughWall: 1 } })),
      },
    ];
  })(),
  {
    id: '12', file: '12-hunter-ramp.wav', title: 'Hunter proximity — threat 0 -> 1, then committed',
    blurb: 'A continuous cue, not a one-shot. Should stay alive across 18 s without becoming wallpaper.',
    seconds: 18,
    plan: Array.from({ length: 36 }, (_, i) => ({
      t: 0.1 + i * 0.5, kind: 'hunter',
      threat: Math.min(1, i / 26), committed: i >= 26,
    })),
  },
];

// ------------------------------------------------------------------ 6. render
async function renderAll() {
  const src = fs.readFileSync(AUDIO_JS, 'utf8');
  assertStandalone(src);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('  page error:', String(e).split('\n')[0]));

  // A synthetic origin serving exactly two things: a blank host page and the real module.
  await page.route('http://rrr.audio/**', (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/audio.js') {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: src });
    }
    return route.fulfill({
      status: 200, contentType: 'text/html',
      body: '<!doctype html><meta charset="utf-8"><title>rrr audio render host</title>'
        + '<script type="module" src="/audio.js"></script>',
    });
  });
  await page.goto('http://rrr.audio/host.html', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__rrrAudio, null, { timeout: 15000 });

  const exposed = await page.evaluate(() => Object.keys(window.__rrrAudio).sort());
  for (const need of ['playMeleeImpact', 'playGunshot', 'playWallStage', 'setHunterThreat', 'playDoorBang', '_renderOffline', 'seedAudioVariation']) {
    if (!exposed.includes(need)) throw new Error(`audio.js no longer exposes ${need} — got ${exposed.join(', ')}`);
  }
  // ASK the module which force-field voice it ships rather than hard-coding a name here — a
  // page that labels the wrong clip "this is what the game plays" is worse than no label.
  const shippedVoice = await page.evaluate(() => window.__rrrAudio.setBarrierVoice?.(null) ?? null);
  if (!shippedVoice) throw new Error('audio.js no longer exposes setBarrierVoice — the page cannot say which voice ships');
  console.log(`  barrier force-field voice shipped by audio.js: ${shippedVoice}\n`);

  const report = [];
  for (const clip of CLIPS) {
    if (ONLY && clip.id !== ONLY) continue;
    process.stdout.write(`  rendering ${clip.file} ... `);
    const b64 = await renderPCM(page, clip.plan, clip.seconds, clip.voice ?? null);

    const pcm = Buffer.from(b64.b64, 'base64');
    const n = pcm.length / 2;
    const f32 = new Float32Array(n);
    for (let i = 0; i < n; i++) f32[i] = pcm.readInt16LE(i * 2) / 32768;
    const out = path.join(OUT_DIR, clip.file);
    const bytes = writeWav(out, f32, b64.sampleRate);

    const m = measure(out);
    const entry = { ...clip, bytes, metrics: m, plan: undefined };
    if (['05', '04a', '04b', '04c', '06', '07', '08', '10', '11'].includes(clip.id)) {
      entry.perHit = perHit(out, clip.plan.map((p) => p.t));
      // keep the console summary readable, but never withhold the per-hit rows from --json:
      // the arc of a 60 s montage is the whole point of rendering it and a caller asking for
      // machine-readable output is asking for exactly that
      if ((clip.id === '07' || clip.id === '08') && !AS_JSON) delete entry.perHit.hits;
    }
    report.push(entry);
    console.log(`${(bytes / 1024).toFixed(0)} KB  peak ${m.peak} (${m.peakDb} dBFS)  rms ${m.rmsDb} dB  centroid ${m.centroidHz} Hz`);
    if (m.peak < 0.005) console.log('     ⚠️ ESSENTIALLY SILENT — this clip is a failure, not a render.');
    if (m.clippedSamples > 0) console.log(`     ⚠️ ${m.clippedSamples} clipped samples.`);
  }

  const probe = ONLY ? null : await barrierSpreadProbe(page);
  await browser.close();
  return { report, probe, shippedVoice };
}

/** One offline render, int16-encoded in the page. Shared by the shipped clips and by the
 * barrier spread probe so they cannot drift apart. */
async function renderPCM(page, plan, seconds, voice) {
  return page.evaluate(async ({ plan, seconds, voice }) => {
      const A = window.__rrrAudio;
      A.seedAudioVariation(0x5eed);   // pinned: two runs of this harness produce identical WAVs
      // Which force-field reading the barrier plays. `null` = whatever the game ships
      // (`DEFAULT_BARRIER_VOICE` in audio.js), which is what clips 04/05/06/08 must render.
      A.setBarrierVoice?.(voice ?? null);   // null -> the shipped default, never the last clip's
      const trigger = plan.map((p) => ({
        t: p.t,
        fn: () => {
          if (p.kind === 'melee') A.playMeleeImpact(p.d, p.opts ?? null);
          else if (p.kind === 'gun') A.playGunshot();
          else if (p.kind === 'wall') A.playWallStage(p.stage);
          else if (p.kind === 'hunter') A.setHunterThreat(p.threat, p.committed);
          else if (p.kind === 'door') A.playDoorBang(p.e, p.opts ?? null);
        },
      }));
      const r = await A._renderOffline(trigger, seconds, { raw: true });
      // int16-encode IN THE PAGE — a 60 s clip is 2.6M floats and shipping those across CDP as
      // JSON takes tens of seconds; as base64 PCM it is one 7 MB string.
      const n = r.raw.length;
      const bytes = new Uint8Array(n * 2);
      const dv = new DataView(bytes.buffer);
      for (let i = 0; i < n; i++) {
        const s = Math.max(-1, Math.min(1, r.raw[i]));
        dv.setInt16(i * 2, Math.round(s * 32767), true);
      }
      let bin = '';
      const CH = 0x8000;
      for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
      return { b64: btoa(bin), sampleRate: r.sampleRate, peakInPage: r.peak };
  }, { plan, seconds, voice });
}

/**
 * 🚨 **THE FOUR-BLOW SPREAD ON `05` IS A THREE-SAMPLE STATISTIC AND IT LIED TO ME TWICE.**
 *
 * `meanConsecutivePeakDeltaDb` over four hits is the mean of THREE numbers, so its value depends
 * mostly on the order the seeded draws happened to come out in. Measured, on one build, in one
 * session: widening the per-hit loudness jitter by 18% moved `05` from 1.43 dB to **1.30 dB** —
 * the wrong direction, from a change that provably widened the underlying distribution. Tuning
 * anti-fatigue against that number is tuning against a coin toss.
 *
 * So this probe renders **16 consecutive barrier blows per voice**, measures the same statistic
 * over fifteen deltas instead of three, and prints it next to the clip figure. It is not written
 * into `refs/audio/` — nobody wants to listen to sixteen identical swings — but it goes through
 * the same `renderPCM` -> `writeWav` -> `readWav` -> `perHit` path as everything else, off a real
 * file in the temp directory, so it is measuring an artifact and not a promise.
 */
async function barrierSpreadProbe(page) {
  const N = 16, GAP = 0.95;
  const plan = Array.from({ length: N }, (_, i) => ({
    t: 0.15 + i * GAP, kind: 'melee', d: 1.0, opts: { barrier: true },
  }));
  const seconds = 0.15 + N * GAP + 0.6;
  const out = {};
  for (const voice of ['swallow', 'shove', 'disperse']) {
    const b64 = await renderPCM(page, plan, seconds, voice);
    const pcm = Buffer.from(b64.b64, 'base64');
    const n = pcm.length / 2;
    const f32 = new Float32Array(n);
    for (let i = 0; i < n; i++) f32[i] = pcm.readInt16LE(i * 2) / 32768;
    const tmp = path.join(os.tmpdir(), `rrr-barrier-probe-${voice}.wav`);
    writeWav(tmp, f32, b64.sampleRate);
    const ph = perHit(tmp, plan.map((p) => p.t));
    delete ph.hits;
    out[voice] = { n: N, ...ph, overall: measure(tmp) };
    try { fs.unlinkSync(tmp); } catch { /* a leftover probe file is harmless */ }
  }
  return out;
}

// ------------------------------------------------------------------ 7. the page John clicks
function writeListenPage(report, probe, SHIPPED) {
  const probeLine = (voice) => {
    const p = voice && probe ? probe[voice] : null;
    if (!p) return '';
    return `<div class="ph">over <b>16</b> consecutive blows (the honest sample — four blows is a three-delta
      coin toss): <b>${p.meanConsecutivePeakDeltaDb} dB</b> loudness, <b>${p.meanConsecutiveCentroidDeltaPct}%</b>
      centroid, peak ${fx(p.peak.min, 3)}..${fx(p.peak.max, 3)}, centroid ${Math.round(p.centroid.min)}..${Math.round(p.centroid.max)} Hz</div>`;
  };
  const rows = report.map((c) => {
    const m = c.metrics;
    const ph = c.perHit ? `<div class="ph">${c.perHit.n} hits · consecutive-blow spread: <b>${c.perHit.meanConsecutivePeakDeltaDb} dB</b> loudness, <b>${c.perHit.meanConsecutiveCentroidDeltaPct}%</b> centroid, <b>${c.perHit.meanConsecutiveTailDeltaDb ?? "n/a"}${c.perHit.meanConsecutiveTailDeltaDb == null ? "" : " dB"}</b> tail · silent hits: ${c.perHit.silentHits}</div>` : '';
    // the barrier clips carry the 16-blow probe as well, because "does a dud spot grate" is the
    // question those clips exist to answer and four swings cannot answer it
    const pl = probeLine(c.voice ?? (c.id === '04' || c.id === '05' ? SHIPPED : null));
    return `<section${c.voice ? ' class="alt"' : ''}>
  <h2><span class="id">${c.id}</span> ${esc(c.title)}</h2>
  <p class="blurb">${esc(c.blurb)}</p>
  <audio controls preload="none" src="${c.file}" onerror="document.getElementById('warn').hidden=false"></audio>
  <div class="m">${m.seconds}s · peak ${m.peakDb} dBFS · RMS ${m.rmsDb} dB · crest ${m.crestDb} dB · centroid ${m.centroidHz} Hz · attack ${m.attackMs} ms · decay ${m.decayMs} ms${m.clippedSamples ? ` · <b class="bad">${m.clippedSamples} CLIPPED</b>` : ''}</div>
  ${ph}
  ${pl}
</section>`;
  }).join('\n');

  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Run Robot Run — listen to the audio</title>
<style>
 body{background:#14171b;color:#dfe4ea;font:15px/1.5 "Segoe UI",system-ui,sans-serif;margin:0;padding:28px 32px 80px;}
 h1{font-size:24px;margin:0 0 6px;color:#fff;}
 .lede{color:#9aa4b0;max-width:70ch;margin:0 0 26px;}
 section{border-top:1px solid #262c34;padding:18px 0 6px;}
 h2{font-size:16px;margin:0 0 4px;font-weight:600;color:#eef2f6;}
 .id{display:inline-block;min-width:26px;color:#5bd6c8;font-variant-numeric:tabular-nums;}
 .blurb{margin:0 0 10px;color:#93a0ad;max-width:80ch;font-size:14px;}
 audio{width:min(640px,100%);height:38px;filter:invert(.92) hue-rotate(180deg);}
 .m{margin-top:7px;color:#6d7885;font-size:12px;font-variant-numeric:tabular-nums;}
 .ph{margin-top:3px;color:#8a94a0;font-size:12px;}
 .bad{color:#ff7a7a;}
 section.alt{border-left:3px solid #5bd6c8;padding-left:14px;margin-left:-17px;}
 #warn{background:#3a2a12;border:1px solid #7a5a20;color:#f0d9a8;padding:12px 14px;border-radius:6px;margin:0 0 20px;}
 #ask{background:#152a2f;border:1px solid #2c5b63;color:#cfeef2;padding:14px 16px;border-radius:6px;margin:0 0 22px;max-width:80ch;}
 #ask b{color:#8ff0e2;}
 code{background:#1e242b;padding:1px 5px;border-radius:3px;color:#b8e6dd;}
</style></head><body>
<h1>Run Robot Run — the sounds, rendered</h1>
<p class="lede">Every clip below is the game's real audio code rendered offline
(<code>harness/audio-render.mjs</code> -&gt; <code>src/audio/audio.js</code>). Play them in order.
<b>Clip 08 is the one that matters</b> — it is what sixty seconds of digging actually sounds like.</p>
<div id="ask"><b>The one question this round.</b> You said the barrier should sound like a force
field — "non natural shock absorption" — rather than a clank. It now does, and there are
<b>three readings of that</b> to choose between: <b>04a swallowed</b>, <b>04b shoved</b> and
<b>04c dispersed</b> (the three clips with the cyan bar). <b>04</b> and <b>05</b> are the one
currently wired into the game, which is <b>${esc(SHIPPED || '?')}</b> — so one of the three
alternates is the same sound in a longer clip. Everything else on this page is unchanged from
last time; the breakable-material voices were not touched.</div>
<div id="warn" hidden>The players could not load the .wav files. Close this tab and double-click
<code>LISTEN.bat</code> in this folder instead — it serves the files over localhost, which the
browser is happy with.</div>
${rows}
<section>
<h2><span class="id">!</span> What changed, and what is still open</h2>
<p class="blurb"><b>Only the barrier changed.</b> Clips 01, 02, 03, 09, 10, 11 and 12 are byte-for-byte
the same design as the last render — you said 08 was on track, so the breakable-material voices were
left alone. 04, 05, 06 and 08 move only because the barrier blows inside them are now the field.</p>
<p class="blurb"><b>The barrier is deliberately the quietest thing you swing at</b>, on peak
<i>and</i> on RMS. It used to be the loudest hit in the game, 18 dB over a fresh wall, which taught
players that a dud spot was the best spot. If 04 sounds small next to 02, that is the point — but if
it sounds so small you would miss it mid-fight, say so, because that is the one number that is easy
to move back.</p>
<p class="blurb"><b>The rebound survives in all three.</b> A hard thing throws a hammer back and
nobody needs that explained; each voice keeps a second, separate event 36-62 ms after the contact.
What differs is what that second event sounds like — in every case it travels <i>outward</i>, away
from you, rather than ringing.</p>
<p class="blurb"><b>Still open, and not in the audio file:</b> ordinary house walls have one sound
and it never develops. <code>wall.js</code>'s no-damage-field arm returns <code>depthAt: 0</code> on
every blow, so clip 01 is the entire hammer experience outside a dig wall.</p>
</section>
</body></html>`;
  fs.writeFileSync(path.join(OUT_DIR, 'LISTEN.html'), html, 'utf8');
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/** John does not use a terminal. `LISTEN.bat` is the entry point: it starts a throwaway static
 * server on 5231 (never 5193 — that port hosts the frozen tablet snapshot) and opens the page,
 * because a browser opened on a `file://` page will not always fetch sibling `.wav` files. */
function writeLauncher() {
  fs.writeFileSync(path.join(OUT_DIR, '_listen-server.mjs'), `// Tiny static server for LISTEN.html — started by LISTEN.bat, nothing else uses it.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const TYPES = { '.html': 'text/html', '.wav': 'audio/wav', '.mjs': 'text/javascript' };
http.createServer((req, res) => {
  const name = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(DIR, name === '/' ? 'LISTEN.html' : name.replace(/^\\//, ''));
  if (!file.startsWith(DIR) || !fs.existsSync(file)) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(5231, () => console.log('Listening page: http://127.0.0.1:5231/  (close this window when done)'));
`, 'utf8');

  fs.writeFileSync(path.join(OUT_DIR, 'LISTEN.bat'), [
    '@echo off',
    'title Run Robot Run - audio',
    'cd /d "%~dp0"',
    'start "" http://127.0.0.1:5231/',
    'node _listen-server.mjs',
    'pause',
    '',
  ].join('\r\n'), 'utf8');
}

// ------------------------------------------------------------------ main
const { report, probe, shippedVoice } = await renderAll();
// ⚠️ `--only` renders ONE clip, so `report` holds one clip — writing the page from it would
// silently replace a 15-clip listening page with a 1-clip one and the next person to open
// LISTEN.bat would think fourteen sounds had been deleted. A partial render leaves the page
// alone; only a full run may rewrite it.
if (!ONLY) writeListenPage(report, probe, shippedVoice);
writeLauncher();

if (AS_JSON) {
  console.log(JSON.stringify({ shippedVoice, clips: report, barrierSpreadProbe: probe }, null, 1));
} else {
  if (probe) {
    console.log('\n  --- barrier force field: 16 consecutive blows per voice (15 deltas, not 3) ---');
    for (const [v, p] of Object.entries(probe)) {
      console.log(`  ${v.padEnd(9)} peakΔ ${String(p.meanConsecutivePeakDeltaDb).padStart(5)} dB  `
        + `centroidΔ ${String(p.meanConsecutiveCentroidDeltaPct).padStart(5)}%  tailΔ ${String(p.meanConsecutiveTailDeltaDb ?? 'n/a').padStart(5)} dB  `
        + `peak ${fx(p.peak.min)}..${fx(p.peak.max)}  centroid ${Math.round(p.centroid.min)}..${Math.round(p.centroid.max)} Hz  `
        + `decay ${Math.round(p.decayMs.min)}..${Math.round(p.decayMs.max)} ms  silent=${p.silentHits}`);
    }
  }
  console.log('\n  --- per-hit spread (the anti-fatigue mechanism, measured) ---');
  for (const c of report) {
    if (!c.perHit) continue;
    const p = c.perHit;
    console.log(`  ${c.id}  n=${String(p.n).padStart(3)}  peakΔ ${String(p.meanConsecutivePeakDeltaDb).padStart(5)} dB  centroidΔ ${String(p.meanConsecutiveCentroidDeltaPct).padStart(5)}%  tailΔ ${String(p.meanConsecutiveTailDeltaDb ?? "n/a").padStart(5)} dB  `
      + `peak ${fx(p.peak.min)}..${fx(p.peak.max)}  centroid ${Math.round(p.centroid.min)}..${Math.round(p.centroid.max)} Hz  decay ${Math.round(p.decayMs.min)}..${Math.round(p.decayMs.max)} ms  silent=${p.silentHits}`);
  }
  console.log(`\n  wrote ${report.length} clips + LISTEN.html + LISTEN.bat to refs\\audio\\`);
  console.log('  John: double-click  refs\\audio\\LISTEN.bat\n');
}
