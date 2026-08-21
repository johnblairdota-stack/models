// critic-estate-9: independent break-test of ?floorreflect=0|1 on room.ballroom.
// Two REAL page loads (not a live scene mutation) with the query param toggled, same
// near-floor rect estate-owner-11 used (x120,y700,400x240 @ 1920x1080), luma stats computed
// in-browser via canvas so there is no PNG-decode step to get wrong.
import { chromium } from 'playwright';
import net from 'node:net';

const PORT = 5178;
const RECT = { x: 120, y: 700, width: 400, height: 240 };

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
});
if (!(await portOpen(PORT))) { console.error('vite not running on 5178'); process.exit(3); }

const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-frame-rate-limit',
    '--force-device-scale-factor=1', '--hide-scrollbars'],
});

async function measure(extra) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
  await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1${extra}`, { waitUntil: 'load', timeout: 45000 });
  await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 240000 });
  await page.evaluate((n) => window.__rrr.settle(n), 16);
  const buf = await page.screenshot({ clip: RECT });
  const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
  const stats = await page.evaluate(async (url) => {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const cx = c.getContext('2d'); cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, c.width, c.height).data;
    const lumas = [];
    for (let i = 0; i < d.length; i += 4) {
      lumas.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
    }
    lumas.sort((a, b) => a - b);
    const mean = lumas.reduce((a, b) => a + b, 0) / lumas.length;
    const median = lumas[lumas.length >> 1];
    // simple acutance proxy: mean abs horizontal gradient / mean luma
    let gradSum = 0, gradN = 0;
    const w = c.width, h = c.height;
    for (let y = 0; y < h; y++) {
      for (let x = 1; x < w; x++) {
        const i0 = (y * w + x - 1) * 4, i1 = (y * w + x) * 4;
        const l0 = 0.2126 * d[i0] + 0.7152 * d[i0 + 1] + 0.0722 * d[i0 + 2];
        const l1 = 0.2126 * d[i1] + 0.7152 * d[i1 + 1] + 0.0722 * d[i1 + 2];
        gradSum += Math.abs(l1 - l0); gradN++;
      }
    }
    const acutance = (gradSum / gradN) / 255;
    return { mean: +mean.toFixed(1), median: +median.toFixed(1), acutance: +acutance.toFixed(4) };
  }, dataUrl);
  await page.close();
  return stats;
}

const off = await measure('&floorreflect=0');
const on = await measure('&floorreflect=1');
console.log('floorreflect=0 (ablated):', JSON.stringify(off));
console.log('floorreflect=1 (shipping):', JSON.stringify(on));
await browser.close();
