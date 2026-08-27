#!/usr/bin/env node
/**
 * cam-clip-drive — walk a runner round the mansion and MEASURE the two things John felt.
 *
 *   node harness/cam-clip-drive.mjs
 *   node harness/cam-clip-drive.mjs --seconds 90 --seed 3
 *
 * John, playing the expedition: *"navigating the mansion is clunky with the camera and controls
 * (if the camera clips the wall it pushes into the players robot and the direction of the
 * movement is affected)."*
 *
 * Those are two numbers, and neither of them can be read off source:
 *
 *   1. **How close does the lens ever get?** It used to reel in to 0.20 of the chase distance —
 *      0.58 m from the chest of a robot about half a metre across.
 *   2. **Does the stick's frame move when nobody is steering it?** `basisYaw` used to be measured
 *      from the eye, so every correction rotated FORWARD under the player's thumb, and the last
 *      resort snapped it onto the body's facing — a discontinuity, mid-stride, at a corner.
 *
 * ⚠️ **THE CONTROL IS `reels`.** A run where the camera never had to correct proves nothing at
 * all, and would pass both assertions on the broken build. The operator counts its corrections
 * and this refuses to report a verdict until it has seen enough of them.
 *
 * ⚠️ Not in `gates:party`: it needs playwright and a browser, and the gate chain deliberately
 * runs with no `npm install`. The source-level half is `party-follow` F10–F10e.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CAM_MIN_DIST, CHASE_DIST } from '../src/party/follow.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const KEEP = argv.includes('--keep');
const WEB = +arg('--port', 5195);
const SECONDS = +arg('--seconds', 75);
const SEED = arg('--seed', '1');
const SHOTDIR = path.join(ROOT, 'progress', 'cam');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const log = [];
const say = (s) => { log.push(s); console.log(s); };
const t = (n, c, d = '') => {
  if (c) { pass++; say(`  ok   ${n}${d ? ' · ' + d : ''}`); }
  else { fail++; say(`  FAIL ${n}${d ? ' · ' + d : ''}`); }
  return !!c;
};

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
});
async function waitPort(p, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await portOpen(p)) return; await sleep(200); }
  throw new Error(`page server never opened :${p}`);
}

console.log('\ncam-clip-drive — the lens, the corners, and the stick frame\n');

if (!existsSync(path.join(ROOT, 'dist', 'index.html'))) {
  throw new Error('no dist/index.html — run `npm run build` first. This harness never uses vite.');
}
const kids = [];
if (await portOpen(WEB)) say(`  reusing a page server on :${WEB}`);
else {
  const p = spawn(process.execPath, [path.join(ROOT, 'harness/serve.mjs'), '--port', String(WEB), '--dir', 'dist'],
    { cwd: ROOT, stdio: 'ignore' });
  kids.push(p);
  await waitPort(WEB, 20000);
  say(`  serving dist on :${WEB}`);
}

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
let exitCode = 1;
try {
  await mkdir(SHOTDIR, { recursive: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  // The camera-alone URL, walking itself. No `still=1` — the whole point is that it moves.
  const url = `http://127.0.0.1:${WEB}/?view=party.follow&runner=p1&name=Hai`
    + `&shell=%236b3a2a&accent=%23f5a14a&seed=${SEED}&throttle=WALK`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const live = await page.waitForFunction(
    () => (document.body.dataset.rrrError || window.__rrrError) ? 'error'
      : (document.body.dataset.rrrFollow === 'live' ? 'live' : null),
    null, { timeout: 300000, polling: 1000 },
  ).then((h) => h.jsonValue()).catch(() => null);
  if (live !== 'live') {
    throw new Error(`the follow camera never went live: ${live} · ${await page.evaluate(() => String(window.__rrrError || '')).catch(() => '')}`);
  }
  say(`  camera is live · walking for ${SECONDS}s\n`);

  /* =========================================================================================
   * 🕹️ **IT HAS TO BE DRIVEN, NOT WATCHED.**
   *
   * The first version of this file sampled the SCRIPTED walk and reported a 25° frame jump — and
   * that number was an artefact of its own instrument. Undriven, `followFacing` is true and the
   * camera deliberately eases onto the body at ~4.2/s; under swiftshader at a few frames a
   * second that easing lands most of its travel in a single frame, which sampling at 20 Hz reads
   * as a jump. The driven path — the one a phone uses, and the one John was playing — sets
   * `followFacing: !perf.driven`, so nothing may move the frame except the look stick.
   *
   * So: post real `move` cues, exactly as the host does. `perf.driven` latches on the first one.
   * With NO look input the frame must then be a CONSTANT. That is a sharp, frame-rate-independent
   * assertion, and it is the thing John actually felt go wrong.
   *
   * Sampling stays inside the page: round-tripping each sample through playwright would add its
   * own latency to every reading, which is how the first version fooled itself.
   * ========================================================================================= */
  const run = await page.evaluate(async (secs) => {
    const f = window.__rrrFollow;
    const out = [];
    const drive = (x, y, lookX = 0, lookY = 0) => window.postMessage(
      { t: 'cue', cue: { kind: 'move', x, y, lookX, lookY, run: false } }, '*',
    );
    /*
     * 🚪 **STEER THROUGH DOORWAYS, DO NOT WANDER.**
     *
     * The first driven version cycled eight compass headings and recorded ZERO shot corrections
     * in 75 seconds — its own control said so, which is the only reason it was not reported as a
     * clean pass. A chase lens 2.9 m back in a room wider than 3 m is almost never obstructed;
     * the shot gets blocked in DOORWAYS and corridors, which is exactly where John hit it and
     * exactly what a random walk avoids.
     *
     * So the probe walks the house's own portal list, marching from doorway to doorway.
     */
    const portals = (f.room?.portals?.() || [])
      .map((p) => p.centre || p)
      .filter((c) => c && Number.isFinite(c.x) && Number.isFinite(c.z));
    let target = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < secs * 1000) {
      const el = (performance.now() - t0) / 1000;
      const p = f.runner.pos;
      let x = 0, y = 1;
      if (portals.length) {
        const g = portals[target % portals.length];
        const dx = g.x - p.x, dz = g.z - p.z;
        const d = Math.hypot(dx, dz);
        // Arrived, or stuck on this one for too long — take the next doorway.
        if (d < 0.9 || el > (target + 1) * (secs / Math.max(1, portals.length))) target++;
        if (d > 1e-3) { x = dx / d; y = dz / d; }
      }
      drive(x, y);                                  // NEVER any look input in this phase
      const c = f.cam?.();
      if (c) out.push({ ...c, t: +el.toFixed(3), phase: 'stick', portal: target });
      await new Promise((r) => setTimeout(r, 50));
    }

    /*
     * 🚨 THE CONTROL PHASE. If the probe cannot see the frame move when it IS supposed to move,
     * then "the frame never moved" above means nothing at all.
     */
    const t1 = performance.now();
    while (performance.now() - t1 < 6000) {
      drive(0, 1, 0.8, 0);
      const c = f.cam?.();
      if (c) out.push({ ...c, t: +((performance.now() - t0) / 1000).toFixed(3), phase: 'look' });
      await new Promise((r) => setTimeout(r, 50));
    }
    drive(0, 0);
    return out;
  }, SECONDS);

  await page.screenshot({ path: path.join(SHOTDIR, 'cam-walk.png') });

  const deg = (r) => (r * 180 / Math.PI).toFixed(1);
  // Shortest signed angle between two yaws — a wrap from +π to −π is NOT a jump.
  const dYaw = (a, b) => Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));

  const stick = run.filter((r) => r.phase === 'stick');
  const look = run.filter((r) => r.phase === 'look');
  const minDist = Math.min(...stick.map((r) => r.dist));
  const reels = (stick[stick.length - 1]?.reels ?? 0) - (stick[0]?.reels ?? 0);

  // How far the FRAME wandered across the whole stick phase, and how far the LENS wandered.
  const frameSpread = Math.max(...stick.map((r) => dYaw(stick[0].basisYaw, r.basisYaw)));
  const lensSpread = Math.max(...stick.map((r) => dYaw(stick[0].lensYaw, r.lensYaw)));
  const lookSpread = look.length ? Math.max(...look.map((r) => dYaw(look[0].basisYaw, r.basisYaw))) : 0;
  const driven = stick.filter((r) => r.mode === 'run').length;

  say(`  ${stick.length} stick samples · ${reels} shot corrections · min lens distance ${minDist.toFixed(2)} m`);
  say(`  frame moved ${deg(frameSpread)}° · the lens itself moved ${deg(lensSpread)}°\n`);

  /*
   * 🚨 THE CONTROLS FIRST. Every assertion below is trivially true on a run where the camera was
   * never obstructed and the probe could not see movement anyway — which is exactly the run the
   * BROKEN build would also have sailed through.
   */
  t('C0 control · the shot actually had to be corrected while walking',
    reels >= 3, `${reels} corrections in ${SECONDS}s`);
  t('C0b control · and the probe can see the frame move when it is supposed to',
    lookSpread > 0.25, `look stick moved the frame ${deg(lookSpread)}°`);

  t('C1 · the lens never climbs inside the runner',
    minDist >= CAM_MIN_DIST - 0.05,
    `min ${minDist.toFixed(2)} m vs floor ${CAM_MIN_DIST} m (the old ladder reached ${(0.2 * CHASE_DIST).toFixed(2)} m)`);

  /*
   * ⚠️ **THE ONE THAT MATTERS.** Driven, with no look input, NOTHING is allowed to move the
   * stick's frame — not a corner, not a correction, not the body turning underneath it. On the
   * old build this number WAS the lens's own wander, because they were the same number.
   *
   * The measurement starts at t=1s, and that is a real exclusion rather than a fudge: the very
   * first frame is the handover. Until the first stick cue lands, `perf.driven` is false and the
   * scripted camera is easing onto the body; the frame settles once as control passes over. That
   * settle is correct — you should take the controls with the lens behind you — and C2c asserts
   * it is exactly ONE event in the first second rather than something that keeps happening.
   */
  const settled = stick.filter((r) => r.t >= 1);
  const settledSpread = settled.length
    ? Math.max(...settled.map((r) => dYaw(settled[0].basisYaw, r.basisYaw))) : Infinity;
  const settledLens = settled.length
    ? Math.max(...settled.map((r) => dYaw(settled[0].lensYaw, r.lensYaw))) : 0;
  let moves = 0; let lastMoveAt = 0;
  for (let i = 1; i < stick.length; i++) {
    if (dYaw(stick[i - 1].basisYaw, stick[i].basisYaw) > 0.001) { moves++; lastMoveAt = stick[i].t; }
  }

  t('C2 · once you have the controls the frame NEVER moves, whatever the camera does',
    settledSpread === 0,
    `frame ${deg(settledSpread)}° over ${settled.length} samples while the lens moved ${deg(settledLens)}°`);
  t('C2b control · and the lens DID move — so a still frame is the fix, not a flat run',
    settledLens > 0.05, `lens wandered ${deg(settledLens)}°`);
  // At most one, because on a fast boot the handover happens before the first sample lands.
  t('C2c · the only time the frame ever moves is the handover to stick control',
    moves <= 1 && lastMoveAt < 1,
    `${moves} move(s)${moves ? `, at t=${lastMoveAt}s` : ' — handover landed before the first sample'}`);

  const near = stick.filter((r) => r.dist < CHASE_DIST - 0.4).length;
  say(`  the lens was tightened on ${near} of ${stick.length} samples (${Math.round(near / stick.length * 100)}%)`);
  t('C3 · tightening the shot stays the exception, not the resting state',
    near / stick.length < 0.6, `${Math.round(near / stick.length * 100)}% of samples tightened`);
  t('C3b control · the runner really was under stick control the whole time',
    driven === stick.length && stick.length > 200, `${driven}/${stick.length} samples in run mode`);

  t('C4 · nothing threw', errs.length === 0, errs.slice(0, 3).join(' | ') || 'clean');

  await writeFile(path.join(SHOTDIR, 'samples.json'), JSON.stringify(run));
  await writeFile(path.join(SHOTDIR, 'transcript.txt'), log.join('\n'));
  say(`\n  cam-clip-drive: ${pass} passed, ${fail} failed · progress/cam/`);
  exitCode = fail ? 1 : 0;
} catch (e) {
  console.error(`\n  cam-clip-drive died: ${e?.stack || e}\n`);
} finally {
  if (!KEEP) {
    await browser.close().catch(() => {});
    for (const k of kids) k.kill();
  }
  process.exit(exitCode);
}
