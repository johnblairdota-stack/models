// Critic instrument: does the temporal AO buffer visibly lag during a fast camera turn?
// Pins engine.cam.yaw to a fixed target from an onUpdate hook (same pattern as
// harness/scenarios/camera-wedge.mjs's pose freeze) so the Director's own aimYaw logic cannot
// fight the injected turn — without this, the two independent browser runs (temporal vs
// prepass) land on different actual yaws by t1 and the A/B is meaningless. Captures
// frame-by-frame right after the jump so a one-frame AO lag would show as a specific frame.
import { chromium } from 'playwright';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

const PORT = 5192;
const OUT = process.argv[2] || 'C:/Users/John/AppData/Local/Temp/claude/C--Users-John-Documents-Run-Robot-Run-web-prototype/5302cea7-8124-49db-b4fe-f14ded483e05/scratchpad/aoblind/motion';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization', '--enable-zero-copy', '--disable-frame-rate-limit',
    '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio', '--disable-dev-shm-usage'],
});

async function runConfig(tag, extraQS) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.routeWebSocket((url) => url.hostname === '127.0.0.1' && url.port === String(PORT), () => {});
  const url = `http://127.0.0.1:${PORT}/?view=game.play&capture=1&quality=medium${extraQS}`;
  await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 180000 });
  const err = await page.evaluate(() => window.__rrrError ?? null);
  if (err) throw new Error(`${tag}: view error: ${err}`);

  // ⚠️ MUST BE A LITERAL, IDENTICAL NUMBER IN BOTH RUNS, NOT "whatever position this run's
  // Director walk happens to be at". First two attempts read player.pos live after a 90-frame
  // settle and pinned each run to ITS OWN reading — internally consistent per run, but the two
  // independent browser processes' Director walks land at slightly different spots by frame 90,
  // and once that gap crossed a portal-residency boundary the two captures showed DIFFERENT
  // ROOMS (one had a "THE LONG GALLERY" label and a lit wall the other didn't) — a diff of
  // 100+ luma that had nothing to do with AO. Fixed by reading the spawn position ONCE, before
  // any updater has had a chance to move it, and pinning to that same literal value from frame 1.
  const spawn = await page.evaluate(() => {
    const e = window.__rrr.engine;
    e.resetRound();
    if (e.hunter) { e.hunter.root.position.set(9.0, 0, 4.2); e.hunter.awareness = 0; }
    return { x: e.player.pos.x, z: e.player.pos.z, yaw: e.cam.yaw };
  });

  // ---- PIN EVERYTHING BUT THE CAMERA TURN, from frame 1, to the SAME literal spawn in both
  // runs. Only the camera whips; the world is otherwise held still throughout.
  await page.evaluate((spawn) => {
    const e = window.__rrr.engine;
    window.__pin = { yaw: spawn.yaw, px: spawn.x, pz: spawn.z };
    e.onUpdate(() => {
      e.cam.yaw = window.__pin.yaw;
      e.player.aimYaw = window.__pin.yaw;
      e.player.pos.x = window.__pin.px; e.player.pos.z = window.__pin.pz;
      e.player.vel.set(0, 0, 0);
      if (e.hunter) { e.hunter.root.position.set(9.0, 0, 4.2); e.hunter.awareness = 0; e.hunter.vel?.set?.(0, 0, 0); }
      // ⚠️ WITHOUT THIS the boom's spring/tight smoothing carries whatever state it happened
      // to be in, which can differ by a hair between two INDEPENDENT browser runs even given
      // identical yaw/position — camera-wedge.mjs's own comment names this exact trap
      // ("`cam._first` ... snaps the boom spring ... so one frame per sample is the settled
      // answer rather than a frame of a spring still arriving"). Forcing an instant snap every
      // frame removes that spring memory entirely.
      e.cam._first = true;
    });
  }, spawn);

  await page.evaluate((n) => window.__rrr.settle(n), 90);
  await page.screenshot({ path: path.join(OUT, `${tag}-t0-preturn.png`) });

  // ARM: pin to spawn.yaw + 1.05 rad (~60 deg) starting on the very next update tick — the
  // worst case of "a fast mouse turn", applied as an instantaneous jump so no intermediate
  // frame renders at any in-between angle, then HELD there (a real whip-turn that stops, not a
  // continuous spin) so any AO lag shows as a single transient frame, not a chase that never
  // resolves.
  const target = spawn.yaw + 1.05;
  await page.evaluate((target) => { window.__pin.yaw = target; }, target);

  for (let i = 1; i <= 4; i++) {
    await page.evaluate(() => window.__rrr.settle(1));
    await page.screenshot({ path: path.join(OUT, `${tag}-t${i}-post.png`) });
  }
  const yaw1 = await page.evaluate(() => window.__rrr.engine.cam.yaw);
  console.log(`${tag}: spawn (${spawn.x.toFixed(2)}, ${spawn.z.toFixed(2)}) yaw ${spawn.yaw.toFixed(4)} -> target ${target.toFixed(4)} -> actual ${yaw1.toFixed(4)}`);
  await ctx.close();
}

await runConfig('temporal', '');
await runConfig('prepass', '&aodepth=prepass');
await browser.close();
console.log('done ->', OUT);
