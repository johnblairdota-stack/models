#!/usr/bin/env node
/**
 * `premiere-1` — the cold open, sampled at several moments.
 *
 * Seeks the sequence with `window.__rrr.premiereSeek` (arithmetic, no rendering) and renders one
 * frame at each stop, so a twenty-two second scene costs four frames instead of thirteen hundred.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 5182, OUT = '/home/user/models/web-prototype/progress/premiere';
mkdirSync(OUT, { recursive: true });
const STOPS = (process.argv.includes('--at')
  ? process.argv[process.argv.indexOf('--at') + 1].split(',').map(Number)
  : [4, 9, 15, 24]);

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${PORT}/`); break; } catch { await wait(500); } }

const W = +(process.env.RRR_W || 1100), H = +(process.env.RRR_H || 620);
const browser = await chromium.launch({ executablePath: process.env.RRR_CHROME || undefined,
  args: ['--use-angle=vulkan', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.log('  PAGEERROR:', String(e.message).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') console.log('  console.error:', m.text().slice(0, 200)); });
await page.goto(`http://127.0.0.1:${PORT}/?view=party.premiere&capture=1`, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
  null, { timeout: 300000 });
const err = await page.evaluate(() => window.__rrrError || null);
if (err) { console.log('VIEW FAILED:\n' + err); await browser.close(); vite.kill(); process.exit(1); }
console.log('ready ·', W + 'x' + H);

let at = 0;
for (const stop of STOPS) {
  await page.evaluate((d) => window.__rrr.premiereSeek(d), stop - at);
  at = stop;
  await page.evaluate(() => window.__rrr.settle(3));
  const s = await page.evaluate(() => window.__rrr.premiere());
  console.log(`  t+${String(stop).padStart(2)}s  entered ${s.entered}/8 · seated ${s.seated}/8 · `
    + s.cast.map((c) => `${c.name}${c.seated ? '•' : ':' + c.leg}`).join(' '));
  await page.screenshot({ path: `${OUT}/t${String(stop).padStart(2, '0')}.png` });
}
console.log('\n→', OUT);
await browser.close(); vite.kill(); process.exit(0);
