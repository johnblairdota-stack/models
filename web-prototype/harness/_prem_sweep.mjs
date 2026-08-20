import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const PORT = 5185, OUT = '/home/user/models/web-prototype/progress/premiere';
mkdirSync(OUT, { recursive: true });
const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const wait = (ms) => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${PORT}/`); break; } catch { await wait(500); } }
const browser = await chromium.launch({ executablePath: process.env.RRR_CHROME,
  args: ['--use-angle=vulkan','--ignore-gpu-blocklist','--disable-dev-shm-usage','--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 620 } });
page.on('pageerror', e => console.log('PAGEERROR', String(e.message).slice(0,240)));
const q = process.argv.slice(2).join('&');
await page.goto(`http://127.0.0.1:${PORT}/?view=party.premiere&capture=1&${q}`, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 300000 });
const err = await page.evaluate(() => window.__rrrError || null);
if (err) { console.log('FAILED\n' + err); await browser.close(); vite.kill(); process.exit(1); }
await page.evaluate(() => window.__rrr.premiereSeek(3));
await page.evaluate(() => window.__rrr.settle(3));
const name = (process.env.RRR_OUT || 'sweep') + '.png';
await page.screenshot({ path: `${OUT}/${name}` });
console.log('→', `${OUT}/${name}`, JSON.stringify(await page.evaluate(() => window.__rrr.premiere().seated)));
await browser.close(); vite.kill(); process.exit(0);
