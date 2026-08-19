// Critic instrument, v3: does the temporal AO buffer visibly lag during a fast camera turn?
//
// v1/v2 ran temporal and prepass as two SEPARATE browser processes and diffed matched frames.
// That failed twice: first the Director's own aimYaw logic fought the injected yaw on some
// frames and not others; then, even with position+yaw pinned identically, the character rig's
// own animation/held-item-glow state still diverged frame-to-frame between the two independent
// processes (visible as a full-body outline diff and a differently-shaped glow blob at t3/t4)
// — not a compile difference, not AO, just two chaotic timelines that were never going to line
// up pixel-for-pixel past a couple of frames.
//
// v3 stays in ONE session and flips `pipeline.aoDepth` live, mid-run, at a HELD (pinned) camera
// pose. `aoDepth` only takes effect inside `setSize()`, gated by an early return when width/
// height are unchanged (see src/post/pipeline.js) — so the switch is forced by zeroing
// `pipeline.width` before calling `setSize` again with the same canvas size. Everything else —
// world state, animation phase, held-item glow — is literally the same JS heap from one frame
// to the next, so any remaining diff between two adjacent frames is (a) true 1-frame animation
// drift, which is small and continuous, not chaotic, and (b) the AO source. That is the
// cleanest ablation this question allows without editing shipped source.
import { chromium } from 'playwright';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

const PORT = 5192;
const OUT = process.argv[2] || 'C:/Users/John/AppData/Local/Temp/claude/C--Users-John-Documents-Run-Robot-Run-web-prototype/5302cea7-8124-49db-b4fe-f14ded483e05/scratchpad/aoblind/motion2';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization', '--enable-zero-copy', '--disable-frame-rate-limit',
    '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio', '--disable-dev-shm-usage'],
});

const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, colorScheme: 'dark' });
const page = await ctx.newPage();
await page.routeWebSocket((url) => url.hostname === '127.0.0.1' && url.port === String(PORT), () => {});
const url = `http://127.0.0.1:${PORT}/?view=game.play&capture=1&quality=medium`;
await page.goto(url, { waitUntil: 'load', timeout: 45000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 180000 });
const err = await page.evaluate(() => window.__rrrError ?? null);
if (err) throw new Error(`view error: ${err}`);

const forceAODepth = (mode) => page.evaluate((mode) => {
  const p = window.__rrr.engine.pipeline;
  p.aoDepth = mode;
  const w = p.canvasWidth, h = p.canvasHeight;
  p.width = 0; p.height = 0;      // defeat setSize's "unchanged, skip" early return
  p.setSize(w, h);
}, mode);

const spawn = await page.evaluate(() => {
  const e = window.__rrr.engine;
  e.resetRound();
  if (e.hunter) { e.hunter.root.position.set(9.0, 0, 4.2); e.hunter.awareness = 0; }
  return { x: e.player.pos.x, z: e.player.pos.z, yaw: e.cam.yaw };
});

await page.evaluate((spawn) => {
  const e = window.__rrr.engine;
  window.__pin = { yaw: spawn.yaw, px: spawn.x, pz: spawn.z };
  e.onUpdate(() => {
    e.cam.yaw = window.__pin.yaw;
    e.player.aimYaw = window.__pin.yaw;
    e.player.pos.x = window.__pin.px; e.player.pos.z = window.__pin.pz;
    e.player.vel.set(0, 0, 0);
    if (e.hunter) { e.hunter.root.position.set(9.0, 0, 4.2); e.hunter.awareness = 0; e.hunter.vel?.set?.(0, 0, 0); }
    e.cam._first = true;
  });
}, spawn);

await page.evaluate((n) => window.__rrr.settle(n), 90);
await page.screenshot({ path: path.join(OUT, 'a-t_pre.png') });

// ARM the whip-turn: instantaneous 1.05 rad (~60 deg) jump, held from here on.
const target = spawn.yaw + 1.05;
await page.evaluate((target) => { window.__pin.yaw = target; }, target);

// Three frames in TEMPORAL mode (the shipped default) right after the jump.
await page.evaluate(() => window.__rrr.settle(1));
await page.screenshot({ path: path.join(OUT, 'b-t_jump1-temporal.png') });
await page.evaluate(() => window.__rrr.settle(1));
await page.screenshot({ path: path.join(OUT, 'c-t_jump2-temporal.png') });
await page.evaluate(() => window.__rrr.settle(1));
await page.screenshot({ path: path.join(OUT, 'd-t_jump3-temporal.png') });

// Pose has been held static since the jump (pin hook). Switch to prepass — zero AO latency by
// construction — for the GROUND TRUTH of what this exact held pose should look like.
await forceAODepth('prepass');
await page.evaluate(() => window.__rrr.settle(1));
await page.screenshot({ path: path.join(OUT, 'e-p_ground1.png') });
await page.evaluate(() => window.__rrr.settle(1));
await page.screenshot({ path: path.join(OUT, 'f-p_ground2.png') });

console.log('spawn', spawn, 'target', target);
console.log('done ->', OUT);
await ctx.close();
await browser.close();
