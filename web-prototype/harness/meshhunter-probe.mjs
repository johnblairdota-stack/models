#!/usr/bin/env node
/**
 * THE GENERATED HUNTER'S GATE — what loaded, what drives it, and whether the ramp darkens.
 *
 *   node harness/meshhunter-probe.mjs
 *   node harness/meshhunter-probe.mjs --json          machine-readable, for a report
 *
 * Exits non-zero when a check fails. Three things are checked, and each one exists because it
 * is a defect you cannot see in a screenshot:
 *
 *  1. **WHAT ACTUALLY LOADED.** `mesh-hunter.js` falls back to the player's body when a stage's
 *     generated body is not on disk. That fallback is correct and it is announced — but a
 *     fallback nobody notices is exactly how `game.js` shipped "the new robot" for a round with
 *     the old one on screen. So the probe prints the file each stage loaded and whether it is a
 *     stand-in, and FAILS if a body listed in `HUNTER_BODY_FILES` exists on disk and was not the
 *     one taken.
 *
 *  2. **THE BORROWED CLIPS ARE REALLY BOUND.** A `THREE.AnimationClip` addresses bones by name
 *     and a mixer silently drops the tracks it cannot bind, so a rig mismatch is a body that
 *     animates from the hips down. The module asserts name coverage at load; this re-checks it
 *     from outside and, more to the point, checks that the bones actually MOVE — it steps the
 *     mixer through the walk and measures how far the hand and the foot travel. A clip that
 *     binds to nothing produces a body that is still bolt upright after a second of walking, and
 *     that number is zero.
 *
 *  3. **THE GRIME RAMP IS MONOTONIC.** The hunter's whole escalation is graded as a luminance
 *     ratio against the clean player standing in the same frame — the measurement in `hunter.js`
 *     that found stage 3 rendering at 0.743 against stage 2's 0.744, i.e. a ramp with nothing
 *     left in it. This renders `hunter.mesh`, segments the four figures out of the cyc, and
 *     prints each one's mean luminance as a ratio of the player's. Stage 1 > stage 2 > stage 3
 *     with real gaps, or it fails.
 *
 * ⚠️ NO PERF NUMBER IS TAKEN HERE, deliberately. The GPU gate lives in `shoot.mjs --gate` and is
 * calibrated against John's card; a number from anywhere else is noise wearing a decimal point.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5178;
const asJson = process.argv.includes('--json');

const log = (...a) => { if (!asJson) console.log(' ', ...a); };

// Reuse a live dev server if one is already up — every concurrent agent shares :5178 on purpose.
let child = null;
const alive = async () => {
  try { const r = await fetch(`http://localhost:${PORT}/`); return r.ok; } catch { return false; }
};
if (!(await alive())) {
  log('starting vite…');
  child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev'],
    { cwd: ROOT, stdio: 'ignore', shell: true });
  const t0 = Date.now();
  while (!(await alive())) {
    if (Date.now() - t0 > 60000) { console.error('vite failed to start'); process.exit(3); }
    await new Promise((r) => setTimeout(r, 400));
  }
}
log(`vite up on ${PORT}`);

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
const notFound = [];
page.on('pageerror', (e) => errors.push(String(e.message ?? e)));
page.on('response', (r) => { if (r.status() === 404) notFound.push(new URL(r.url()).pathname); });
/*
 * ⚠️ ONE 404 IS EXPECTED AND IT IS `/favicon.ico`. Everything else that 404s is a fault worth
 * failing on, so the URLs are recorded rather than the console lines, which do not carry them.
 *
 * ⚠️ AND A MISSING HUNTER BODY DOES NOT 404 AT ALL — measured: vite's dev server answers
 * `/models/hunter/rrr_char_hunter-s1_v1.glb` with **200 text/html** under its SPA fallback. That
 * is exactly why `mesh-hunter.js` checks the content type instead of the status, and it is worth
 * seeing here: a probe that trusted the status would report all three bodies present and hand
 * three HTML files to the GLTF loader.
 */
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (/Failed to load resource.*404/.test(m.text())) return;
  errors.push(m.text());
});

// ---------------------------------------------------------------- 1 + 2: structure
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });

const structure = await page.evaluate(async () => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const mod = await import('/src/characters/mesh-hunter.js');
  const out = { listed: mod.HUNTER_BODY_FILES, stages: [] };

  for (const stage of [1, 2, 3]) {
    const h = await mod.createMeshHunterStage({ stage });

    /*
     * DOES THE CLIP ACTUALLY DRIVE THE BODY? Step the walk for a second at 8 m/s of demanded
     * speed and measure how far the right hand and the left foot move in the character's own
     * frame. A bound walk swings both by tens of centimetres; an unbound one moves neither.
     */
    const track = (name) => {
      const b = h.bones[name];
      if (!b) return null;
      b.updateWorldMatrix(true, false);
      return new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
    };
    h.update(1 / 60, { speed: 2.6, runAt: 2.6 });
    const hand0 = track('RightHand');
    const foot0 = track('LeftFoot');
    let handSwing = 0;
    let footSwing = 0;
    for (let i = 0; i < 60; i++) {
      h.update(1 / 60, { speed: 2.6, runAt: 2.6 });
      const hand = track('RightHand');
      const foot = track('LeftFoot');
      if (hand && hand0) handSwing = Math.max(handSwing, hand.distanceTo(hand0));
      if (foot && foot0) footSwing = Math.max(footSwing, foot.distanceTo(foot0));
    }

    h.root.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(h.root);

    out.stages.push({
      stage,
      sourceFile: h.sourceFile,
      clipSource: h.clipSource,
      standIn: h.standIn,
      tris: h.tris,
      drivenBones: h.drivenBones,
      clipCount: h.clipNames.length,
      hasRider: h.hasRider,
      pending: h.pending,
      eyes: h.eyes ? { skull: h.eyes.skull, face: h.eyes.face, eyeW: h.eyes.eyeW } : null,
      height: box.max.y - box.min.y,
      footY: box.min.y,
      handSwing,
      footSwing,
      clip: h.clip,
    });
    h.dispose();
  }

  // Which of the listed bodies are genuinely on disk right now? A stand-in is only correct while
  // the real body is missing.
  out.onDisk = {};
  for (const [stage, files] of Object.entries(mod.HUNTER_BODY_FILES)) {
    out.onDisk[stage] = [];
    for (const f of files) {
      try {
        const res = await fetch(`/models/${f}`, { method: 'HEAD' });
        const type = res.headers.get('content-type') ?? '';
        if (res.ok && !/text\/html/i.test(type)) out.onDisk[stage].push(f);
      } catch { /* absent */ }
    }
  }
  return out;
});

// ---------------------------------------------------------------- 3: the grime ramp
/*
 * SEGMENTED BY HIDING EACH FIGURE AND DIFFING THE FRAME, not by thresholding the picture.
 *
 * 🚨 THRESHOLDING WAS TRIED FIRST, IN THREE VERSIONS, AND ALL THREE WERE WRONG IN WAYS THAT
 * STILL PRINTED A FULL PLAUSIBLE TABLE. That is worth the paragraph, because the obvious method
 * here is the broken one and `ART_MANIFEST.md` already says why: the shell is #EDEFF0 on a
 * #F2F2F2 cyc, about 2% apart, so no brightness cut separates figure from ground.
 *
 *   · column runs           two adjacent figures merged; it reported three where there are four
 *   · per-row margin means  the stage-3 figure reaches into the right margin and dragged the
 *                           background estimate down with it, which cost stage 1 half its pixels
 *   · a wider moat (0.10)   excluded the white shell itself — the thing being measured — and
 *                           left each figure graded on its dark chrome only
 *
 * The renderer knows the answer exactly. Hide one figure, redraw, and every pixel that CHANGED
 * is a pixel that figure was drawing: exact, occlusion-correct, and with no free parameter to
 * tune except a difference floor that only has to clear the encoder's noise. The frame is read
 * straight off the WebGL canvas in the same task as the redraw, so nothing is re-encoded.
 *
 * ⚠️ `label=0`. The caption sits across the top of the frame, and while a DOM overlay cannot
 * change between two canvas reads, a measurement crop wants no text in frame at all.
 */
await page.goto(`http://localhost:${PORT}/?view=hunter.mesh&capture=1&label=0&quality=medium`,
  { waitUntil: 'domcontentloaded' });
/*
 * ⚠️ THE THIRD ARGUMENT, NOT THE SECOND. `waitForFunction(fn, arg, options)` — passing the
 * options object in slot two makes it the ARGUMENT to the page function and leaves the timeout
 * at Playwright's 30 s default, which is under half of what `game.play` needs to compile its
 * shaders cold. It fails as a flat timeout with nothing to say about the view.
 */
await page.waitForFunction(() => window.__rrr?.ready === true, undefined, { timeout: 300000 });

const ramp = await page.evaluate(async () => {
  const THREE_ = await import('/node_modules/three/build/three.module.js');
  const { engine, meshHunter } = window.__rrr;
  if (!meshHunter) return { error: 'the view did not publish window.__rrr.meshHunter' };
  const gl = engine.renderer.domElement;
  const w = gl.width;
  const h = gl.height;
  const scratch = document.createElement('canvas');
  scratch.width = w; scratch.height = h;
  const ctx = scratch.getContext('2d', { willReadFrequently: true });

  /*
   * ⚠️ READ IN THE SAME TASK AS THE DRAW. A WebGL drawing buffer is cleared when the page
   * composites, and this context is not `preserveDrawingBuffer` — so an `await` between the
   * redraw and the read would hand back a blank canvas that measures as a perfectly uniform
   * frame. Everything in this function is synchronous for that reason.
   */
  /*
   * ⚠️ RAW, AND WITH SHADOWS OFF. Both were switched off after the first run of this method came
   * back with masks 1,000 pixels wide for a 130-pixel-wide robot.
   *
   * Hiding a figure does not only remove the figure. It removes its CAST SHADOW, and the post
   * stack's bloom and screen-space AO then spread that change further still — so the diff mask
   * picked up floor and neighbours, and every figure's mean converged on the same number
   * (x1.000 / x1.058 / x1.090 / x1.055 — the ramp inverted). Neither channel is part of what is
   * being graded: this is a comparison of albedo under one identical light rig.
   */
  engine.renderer.shadowMap.enabled = false;
  const snap = () => {
    window.__rrr.redraw(true);
    ctx.drawImage(gl, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  };

  const base = snap();
  const lum = (d, i) => (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;

  /*
   * Every pixel this object was responsible for drawing.
   *
   * ⚠️ THE FLOOR IS 2/255, NOT 6. Two renders of the same scene through the same program are
   * bit-identical here — the raw path carries no grain and the AO dither is pinned in capture
   * mode — so anything above the encoder's last bit is signal. At 6 the near-WHITE player lost
   * the parts of itself that sit closest to the near-white cyc, and came back with 41,250
   * pixels against stage 3's 88,086 for the same body: its mean was then taken over its darker
   * half, which biases the control DOWN and every ratio UP. A conservative bias is still a bias.
   */
  const maskOf = (obj) => {
    const was = obj.visible;
    obj.visible = false;
    const off = snap();
    obj.visible = was;
    const m = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) {
      const i = p * 4;
      if (Math.abs(base[i] - off[i]) > 1 || Math.abs(base[i + 1] - off[i + 1]) > 1
        || Math.abs(base[i + 2] - off[i + 2]) > 1) m[p] = 1;
    }
    return m;
  };

  /*
   * The figure's own projected box, as a final guard. Removing a body still changes a few
   * pixels around it — a contact shadow the ground receives, an edge the antialiasing shared —
   * and while those are small they are systematically DARK, which is the direction that would
   * flatter a grime measurement. Nothing outside the body's own box counts.
   */
  const project = (box) => {
    const cam = engine.camera;
    cam.updateMatrixWorld();
    let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
    for (const cx of [box.min.x, box.max.x]) {
      for (const cy of [box.min.y, box.max.y]) {
        for (const cz of [box.min.z, box.max.z]) {
          const p = new THREE_.Vector3(cx, cy, cz).project(cam);
          const sx = (p.x * 0.5 + 0.5) * w;
          const sy = (-p.y * 0.5 + 0.5) * h;
          x0 = Math.min(x0, sx); x1 = Math.max(x1, sx);
          y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
        }
      }
    }
    return { x0: Math.max(0, Math.floor(x0)), x1: Math.min(w, Math.ceil(x1)),
      y0: Math.max(0, Math.floor(y0)), y1: Math.min(h, Math.ceil(y1)) };
  };

  return meshHunter.figures.map(({ label, root, box, exclude }) => {
    const b = project(box);
    const m = maskOf(root);
    for (let p = 0; p < m.length; p++) {
      if (!m[p]) continue;
      const x = p % w; const y = (p / w) | 0;
      if (x < b.x0 || x >= b.x1 || y < b.y0 || y >= b.y1) m[p] = 0;
    }
    // The stolen torso is in the PICTURE and out of the NUMBER — see the view's note.
    if (exclude) {
      const r = maskOf(exclude);
      for (let p = 0; p < m.length; p++) if (r[p]) m[p] = 0;
    }
    let s = 0; let n = 0;
    let x0 = w; let x1 = 0;
    for (let p = 0; p < m.length; p++) {
      if (!m[p]) continue;
      const i = p * 4;
      // Skip the saturated eye slits: a few dozen emissive pixels must not move a mean that is
      // grading a whole body's grime.
      const rr = base[i]; const gg = base[i + 1]; const bb = base[i + 2];
      if (rr > 120 && rr > gg * 1.8 && rr > bb * 1.8) continue;
      const x = p % w;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      s += lum(base, i); n++;
    }
    return { label, px: n, mean: n ? s / n : 0, x0, x1 };
  });
});

// ---------------------------------------------------------------- 4: the game actually took it
/*
 * THE ONLY CHECK THAT SPEAKS FOR `game.play`, and the one the project's own history says is
 * needed. `game.js` falls back to the procedural hunter when the generated one throws, and it
 * does it with nothing but a console line — which is exactly how the player's body shipped as
 * "the new robot" for a whole round while the old one rendered. So this boots the real view with
 * `?meshhunter=1` and asks the AI what it is actually driving.
 *
 * ⚠️ SLOW, AND WORTH IT. `game.play` is a full level: a minute of cold shader compilation before
 * it signals ready. `--no-game` skips it for a quick loop on the view alone.
 */
let game = null;
if (!process.argv.includes('--no-game')) {
  log('booting game.play?meshhunter=1 (this is the slow one)…');
  await page.goto(`http://localhost:${PORT}/?view=game.play&capture=1&meshhunter=1&quality=medium`,
    { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__rrr?.ready === true, undefined, { timeout: 300000 });
  game = await page.evaluate(() => {
    const h = window.__rrr.engine.hunter;
    if (!h) return { error: 'the view exposes no engine.hunter' };
    return {
      meshRigs: !!h.meshRigs,
      stage: h.stage,
      sources: [1, 2, 3].map((s) => h.rigs[s]?.sourceFile ?? '(procedural)'),
      standIn: [1, 2, 3].map((s) => !!h.rigs[s]?.standIn),
      gaits: [1, 2, 3].map((s) => !!h.gaits[s]),
    };
  });
  structure.game = game;
}

// ---------------------------------------------------------------- verdict
const fails = [];

for (const s of structure.stages) {
  const listed = structure.onDisk[String(s.stage)] ?? [];
  if (listed.length && s.standIn) {
    fails.push(`stage ${s.stage}: ${listed[0]} is on disk but the loader took the stand-in ` +
      `(${s.sourceFile}) — the resolver is not seeing the generated body`);
  }
  if (!s.standIn && listed.length && !listed.includes(s.sourceFile.replace(/^.*?\//, ''))) {
    fails.push(`stage ${s.stage}: loaded ${s.sourceFile}, which is not what the table lists`);
  }
  if (s.handSwing < 0.05) {
    fails.push(`stage ${s.stage}: the right hand moved ${s.handSwing.toFixed(4)} m over a ` +
      `second of walk — the clips are not driving this body`);
  }
  if (s.footSwing < 0.05) {
    fails.push(`stage ${s.stage}: the left foot moved ${s.footSwing.toFixed(4)} m over a ` +
      `second of walk — the clips are not driving this body`);
  }
  if (Math.abs(s.footY) > 0.02) {
    fails.push(`stage ${s.stage}: the feet sit at y = ${s.footY.toFixed(4)}, not on the floor`);
  }
  const wantH = 1.7;
  if (Math.abs(s.height - wantH) > 0.35) {
    fails.push(`stage ${s.stage}: measured ${s.height.toFixed(3)} m against a ${wantH} m ` +
      `contract height`);
  }
}

if (ramp.error) {
  fails.push(`the ramp could not be measured: ${ramp.error}`);
} else if (ramp.length < 4) {
  fails.push(`the ramp frame reported ${ramp.length} figures, not 4 — the measurement ` +
    `cannot be trusted, so the ratios below are not reported`);
} else if (ramp.some((r) => r.px < 8000)) {
  fails.push(`a figure contributed only ${Math.min(...ramp.map((r) => r.px))} pixels — too few ` +
    `for a 1.7 m body at this framing, so the segmentation lost most of it`);
} else {
  const player = ramp[0].mean;
  const ratios = ramp.map((r) => r.mean / player);
  // Monotonic, with a real gap. 0.03 is comfortably outside the noise on a 1280x720 frame and
  // well inside the 0.08 steps the art sheet asks for.
  for (const i of [1, 2, 3]) {
    if (!(ratios[i] < ratios[i - 1] - 0.03)) {
      fails.push(`the grime ramp is flat between figure ${i - 1} and ${i}: ` +
        `${ratios[i - 1].toFixed(3)} then ${ratios[i].toFixed(3)}`);
    }
  }
  structure.ramp = ramp.map((r, i) => ({ ...r, ratio: ratios[i] }));
}

if (game) {
  if (game.error) fails.push(`game.play: ${game.error}`);
  else if (!game.meshRigs) {
    fails.push('game.play was asked for ?meshhunter=1 and is driving the PROCEDURAL hunter — ' +
      'the fallback fired and only the console said so');
  } else if (game.gaits.some(Boolean)) {
    fails.push('game.play built a procedural Gait for a generated stage — the two posing ' +
      'systems are both live on one body');
  }
}

const unexpected404 = [...new Set(notFound)].filter((u) => u !== '/favicon.ico');
if (unexpected404.length) {
  fails.push(`404 on ${unexpected404.join(', ')}`);
}

structure.consoleErrors = errors;
structure.fails = fails;

if (asJson) {
  console.log(JSON.stringify(structure, null, 2));
} else {
  console.log('');
  for (const s of structure.stages) {
    console.log(`  stage ${s.stage}  ${s.sourceFile}${s.standIn ? '  [STAND-IN]' : ''}`);
    console.log(`           ${s.tris} tris · ${s.clipCount} clips from ${s.clipSource} · ` +
      `${s.drivenBones} bones driven${s.hasRider ? ' · rider' : ''}`);
    console.log(`           height ${s.height.toFixed(3)} m, feet at ${s.footY.toFixed(4)} · ` +
      `hand swing ${s.handSwing.toFixed(3)} m · foot swing ${s.footSwing.toFixed(3)} m`);
    if (s.eyes) {
      console.log(`           skull ${s.eyes.skull.toFixed(4)} m · face reach ` +
        `${s.eyes.face.toFixed(4)} m · slit ${s.eyes.eyeW.toFixed(4)} m`);
    }
    for (const p of s.pending) console.log(`           pending — ${p}`);
  }
  if (structure.game) {
    console.log(`\n  game.play?meshhunter=1 — driving ` +
      `${structure.game.meshRigs ? 'the GENERATED bodies' : 'the PROCEDURAL hunter'} at stage ` +
      `${structure.game.stage}`);
    console.log(`    ${structure.game.sources.join(' · ')}`);
  }
  if (structure.ramp) {
    console.log('\n  grime ramp (mean luminance, ratio of the player beside it)');
    const names = ['player', 'stage 1', 'stage 2', 'stage 3'];
    structure.ramp.forEach((r, i) => {
      console.log(`    ${(names[i] ?? `figure ${i}`).padEnd(8)} ${r.mean.toFixed(4)}  ` +
        `x${r.ratio.toFixed(3)}   (${r.px} px, x ${r.x0}–${r.x1})`);
    });
    console.log('    art sheet, for comparison: 1.000 / 0.739 / 0.649');
  }
  if (errors.length) {
    console.log('\n  console errors:');
    for (const e of errors.slice(0, 8)) console.log(`    ${e}`);
  }
  console.log('');
  if (fails.length) {
    console.log('  FAIL');
    for (const f of fails) console.log(`    · ${f}`);
  } else {
    console.log('  PASS — bodies resolved, clips bound and moving, ramp monotonic');
  }
}

await browser.close();
child?.kill();
process.exit(fails.length ? 1 : 0);
