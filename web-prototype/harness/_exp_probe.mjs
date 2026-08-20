#!/usr/bin/env node
/**
 * `expedition-1` — read the house back after real frames.
 *
 * A screenshot proves the scene renders. It does not prove the robot moved, the Hunter noticed,
 * the Director cut, or that ninety seconds ended in one of the three ways they can. This drives
 * the same view through `window.__rrr.settle()` — `shoot.mjs`'s own deterministic stepper — and
 * reads `window.__rrr.expedition()` at intervals.
 *
 * Playwright launches the browser because it is the only path on this box that gets a WebGL
 * context; a hand-spawned Chromium with the same flags does not.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 5179;
const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${PORT}/`); break; } catch { await wait(500); } }

const browser = await chromium.launch({
  executablePath: process.env.RRR_CHROME || undefined,
  args: ['--use-angle=vulkan', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
    '--disable-frame-rate-limit', '--force-device-scale-factor=1', '--hide-scrollbars',
    '--mute-audio', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const wing = process.argv.includes('--wing') ? process.argv[process.argv.indexOf('--wing') + 1] : 'gallery';
page.on('console', (m) => { if (m.type() === 'error') console.log('  console.error:', m.text().slice(0, 200)); });
// 🚨 AN EXCEPTION INSIDE `onUpdate` KILLS THE rAF LOOP AND `settle()` NEVER RESOLVES — from the
// outside that is indistinguishable from a slow software renderer. It cost three probe runs and
// twenty minutes before `hunter.body.position` turned out to be undefined. Capture it.
page.on('pageerror', (e) => console.log('  PAGEERROR:', String(e.message || e).slice(0, 300)));
await page.goto(`http://127.0.0.1:${PORT}/?view=party.expedition&capture=1&wing=${wing}&cams=2`, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 240000 });
const err = await page.evaluate(() => window.__rrrError || null);
if (err) { console.log('VIEW FAILED:\n' + err); await browser.close(); vite.kill(); process.exit(1); }

console.log(`ready · wing=${wing}`);
const rows = [];
// 640x360 and a third of a second a row: SwiftShader is fill-rate bound, and the full mansion at
// 720p costs minutes per simulated second. The numbers below are about the SIMULATION, not the
// picture, so the cheapest frame that still runs the whole update is the right frame.
const STEP = 20;
for (let i = 0; i < 8; i++) {
  try {
    await Promise.race([
      page.evaluate((n) => window.__rrr.settle(n), STEP),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`settle(${STEP}) did not resolve in 90s`)), 90000)),
    ]);
  } catch (e) { console.log('  STALLED:', e.message); break; }
  const s = await page.evaluate(() => window.__rrr.expedition());
  rows.push(s);
  console.log(`  t+${((i + 1) * STEP / 60).toFixed(1)}s  runner ${s.runner.x.toFixed(1)},${s.runner.z.toFixed(1)} in ${s.runner.room}`
    + ` · noise ${s.runner.noise.toFixed(2)} · det ${s.detent}`
    + ` · hunter ${s.hunter.state} at ${s.hunter.x.toFixed(1)},${s.hunter.z.toFixed(1)}`
    + ` · shot ${s.shot} · cuts ${s.cuts} · via ${s.leg ? s.leg.via : '-'}` + (s.outcome ? ` · OUTCOME ${s.outcome}` : ''));
  if (s.outcome) break;
}
console.log('\nrouting:', JSON.stringify(rows[0]?.at), '· terminal', JSON.stringify(rows[0]?.terminal));
console.log('hops:', JSON.stringify(rows[0]?.hops));
const first = rows[0], last = rows[rows.length - 1];
console.log('\nmoved:', Math.hypot(last.runner.x - first.runner.x, last.runner.z - first.runner.z).toFixed(2), 'm');
console.log('rooms visited:', [...new Set(rows.map((r) => r.runner.room))].join(' → '));
console.log('hunter states:', [...new Set(rows.map((r) => r.hunter.state))].join(', '));
console.log('shots aired:', [...new Set(rows.map((r) => r.shot))].join(', '), '· cuts', last.cuts);
console.log('outcome:', last.outcome ?? '(still running)');
await page.screenshot({ path: process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : '/tmp/exp.png' });
await browser.close(); vite.kill(); process.exit(0);
