import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-angle=d3d11','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 640, height: 360 } });
p.on('console', (m) => console.log('[c]', m.type(), m.text().slice(0, 300)));
p.on('pageerror', (e) => console.log('[E]', String(e).slice(0, 500)));
await p.goto('http://127.0.0.1:5178/?view=room.ballroom&capture=1&cam=eye.door', { waitUntil: 'load', timeout: 60000 });
try {
  await p.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 300000 });
  console.log('READY', await p.evaluate(() => document.body.dataset.rrrReady + '/' + document.body.dataset.rrrError));
} catch (e) { console.log('TIMEOUT waiting for ready'); }
await b.close();
