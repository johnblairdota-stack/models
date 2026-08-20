import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const PORT = 5184;
const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const wait = (ms) => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${PORT}/`); break; } catch { await wait(500); } }
const browser = await chromium.launch({ executablePath: process.env.RRR_CHROME,
  args: ['--use-angle=vulkan','--ignore-gpu-blocklist','--disable-dev-shm-usage','--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 400, height: 240 } });
page.on('pageerror', e => console.log('PAGEERROR', String(e.message).slice(0,200)));
await page.goto(`http://127.0.0.1:${PORT}/?view=party.premiere&capture=1`, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 300000 });
const s = await page.evaluate(() => window.__rrr.premiere());
console.log('sit bones found:', JSON.stringify(s.bones));
console.log('skeleton bones:', JSON.stringify(s.boneNames));
await browser.close(); vite.kill(); process.exit(0);
