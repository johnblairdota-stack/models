// Verifies the fix: forcing the exact degenerate condition (camera.aspect not finite/positive,
// matching a 0x0 canvas that never got a real resize) must produce the LOUD invalid warning,
// not a plausible-looking "floor 0.0% ceil 0.0% wall 0.0% out 100.0%".
import { chromium } from 'playwright';

const PORT = 5266;
const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-frame-rate-limit',
    '--force-device-scale-factor=1', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 1512, height: 918 } });
page.on('pageerror', (e) => console.error('PAGEERROR', String(e)));

await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&orbit=1`, { waitUntil: 'load', timeout: 45000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 120000 });
await page.waitForTimeout(600);

console.log('--- BEFORE (normal, sized viewport) ---');
console.log((await page.evaluate(() => document.body.innerText.match(/cameraPos:[\s\S]{0,260}/)?.[0])));

// Reproduce the exact degenerate condition the coordinator hit: aspect not finite/positive,
// as if the canvas were sized 0x0 and never received a real resize.
await page.evaluate(() => {
  const eng = window.__rrr.engine;
  eng.camera.aspect = NaN;
});
await page.waitForTimeout(600);
console.log('--- AFTER forcing camera.aspect = NaN (simulated 0x0-canvas condition) ---');
console.log((await page.evaluate(() => document.body.innerText.match(/⚠[\s\S]{0,260}|cameraPos:[\s\S]{0,260}/)?.[0])));
console.log('panel color:', await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'copy');
  const panel = btn?.parentElement;
  const pre = panel?.querySelector('div');
  return pre ? getComputedStyle(pre).color : null;
}));

await browser.close();
