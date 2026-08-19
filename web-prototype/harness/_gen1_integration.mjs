#!/usr/bin/env node
/**
 * IS THE WHOLE THING ACTUALLY IN ONE HOUSE? — the generated plan, the furniture, the hunter's
 * route, the hammer on the floor and the shipped robot, checked in ONE boot of the real game.
 *
 *   node harness/_gen1_integration.mjs [--seed 5] [--seeds 4,5,6]
 *
 * WHY THIS EXISTS. Every piece here already had its own view and its own probe, and each one
 * passed alone. What nothing checked is the combination the player actually loads — and the
 * combination is where the faults were: the hunter walked the AUTHORED house's patrol route
 * through a GENERATED building (`views/game.js` says so in capitals beside the sense overlay),
 * which no single-piece probe could see because the route resolved fine and the hunter moved.
 *
 * WHAT IT ASSERTS, all against the live scene rather than against a table:
 *   1. the page boots with no console error and no page error
 *   2. the plan is the GENERATED one and has more than one space
 *   3. EVERY patrol stop lands inside this house's envelope — the number that was wrong
 *   4. furniture props exist and are destructible
 *   5. the sledgehammer is on the floor as a world pickup, not in the player's hands
 *   6. the player is the shipped body, and its clips came with it
 *
 * CONTROL THAT MUST FAIL: `--control-authored` forces the AUTHORED patrol route into a generated
 * house, which is the exact bug this probe was written for. Assertion 3 must then fail; if it
 * still passes, it is not reading the route.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5187;
const OUT = path.join(ROOT, 'harness', 'out', 'gen1');
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i < 0 ? d : argv[i + 1]; };
const has = (f) => argv.includes(f);
const log = (...a) => console.log(' ', ...a);
const SEEDS = flag('--seeds', flag('--seed', '5')).split(',');

fs.mkdirSync(OUT, { recursive: true });

log('building…');
await new Promise((res, rej) => {
  const p = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'],
    { cwd: ROOT, stdio: 'ignore', shell: true });
  p.on('exit', (c) => (c === 0 ? res() : rej(new Error(`build failed (${c})`))));
});
const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: 'ignore', shell: true });
const alive = async () => {
  try { const r = await fetch(`http://localhost:${PORT}/`); return r.ok; } catch { return false; }
};
{
  const t0 = Date.now();
  while (!(await alive())) {
    if (Date.now() - t0 > 60000) { console.error('preview failed to start'); process.exit(3); }
    await new Promise((r) => setTimeout(r, 400));
  }
}
log(`preview up on ${PORT}`);

// ⚠️ GPU args are not optional — without them Chromium software-renders and the bakes never
// finish, so `settle()` waits for ever. `harness/_lineup_shot.mjs` documents the same trap.
const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--force-device-scale-factor=1'],
});

let failed = 0;
for (const seed of SEEDS) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const q = new URLSearchParams({
    view: 'game.play', plan: 'gen', planseed: seed, quality: 'medium', capture: '1',
  });
  if (has('--control-authored')) q.set('patrol', 'authored');
  await page.goto(`http://localhost:${PORT}/?${q}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(
    () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
    null, { timeout: 300000, polling: 500 });

  const res = await page.evaluate(async () => {
    await window.__rrr?.settle?.(8);
    const g = window.__rrr?.integration?.();
    return g ?? { error: '__rrr.integration is absent — game.js did not publish it' };
  });

  await page.screenshot({ path: path.join(OUT, `seed${seed}.png`) });
  await page.close();

  console.log('');
  log(`seed ${seed}`);
  if (res.error) { console.error('   !! ' + res.error); failed++; continue; }
  log(`  spaces ${res.spaces}  patrol ${res.patrolInside}/${res.patrolStops} inside the house`);
  log(`  furniture ${res.furnProps} prop(s), ${res.furnDestructible} destructible`);
  log(`  sledge on the floor: ${res.sledgeOnFloor}   player arms: ${res.arms}`);
  log(`  body ${res.playerBody}  clips ${res.playerClips}`);

  const bad = [];
  if (errors.length) bad.push(`${errors.length} console/page error(s): ${errors[0]}`);
  if (!(res.spaces > 1)) bad.push(`only ${res.spaces} space(s) — that is not a generated house`);
  if (res.patrolStops < 2) bad.push(`patrol route has ${res.patrolStops} stop(s)`);
  if (res.patrolInside !== res.patrolStops) {
    bad.push(`${res.patrolStops - res.patrolInside} patrol stop(s) land OUTSIDE this house — ` +
      `the hunter is walking a route written for a different building`);
  }
  if (!res.furnProps) bad.push('no furniture in the house');
  if (!res.furnDestructible) bad.push('furniture is present but none of it is destructible');
  if (!res.sledgeOnFloor) bad.push('no sledgehammer on the floor to pick up');
  if (!/friendly_all38/.test(res.playerBody)) bad.push(`player body is ${res.playerBody}`);
  if (!(res.playerClips >= 15)) bad.push(`player carries ${res.playerClips} clip(s)`);

  if (bad.length) { failed++; for (const b of bad) console.error('   !! ' + b); }
  else log('  OK');
}

await browser.close();
server.kill();

console.log('');
if (failed) { console.error(`!! FAIL: ${failed} of ${SEEDS.length} seed(s)\n`); process.exit(1); }
console.log('OK\n');
