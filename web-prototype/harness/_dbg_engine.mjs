import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5221;
const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 800);
});
const vite = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'),
  '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
{
  const t0 = Date.now();
  while (!(await portOpen(PORT))) {
    if (Date.now() - t0 > 30000) { throw new Error('vite did not open'); }
    await new Promise((r) => setTimeout(r, 300));
  }
}
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERR', m.text().slice(0, 200)); });
await page.goto(`http://127.0.0.1:${PORT}/?view=game.play&quality=medium`, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 240000 });
console.log('ready', await page.evaluate(() => document.body.dataset.rrrReady));
const btn = await page.$('#rrr-play-btn');
console.log('btn found:', !!btn);
if (btn) await btn.click().catch((e) => console.log('click failed', String(e).slice(0, 150)));
await page.waitForTimeout(600);
const f1 = await page.evaluate(() => window.__rrr.engine.frame);
await page.waitForTimeout(500);
const f2 = await page.evaluate(() => window.__rrr.engine.frame);
console.log('frame before/after wait:', f1, f2);
const info = await page.evaluate(() => {
  const e = window.__rrr.engine;
  return { hasPlayer: !!e.player, playerPos: e.player ? { x: e.player.pos.x, y: e.player.pos.y, z: e.player.pos.z } : null, spaces: e.room.spaces.map((s) => ({ id: s.id, visible: s.visible })) };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
vite.kill();
