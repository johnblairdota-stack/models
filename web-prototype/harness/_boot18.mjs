import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-angle=d3d11','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 640, height: 360 } });
p.on('console', (m) => console.log('[c]', m.type(), m.text().slice(0, 300)));
p.on('pageerror', (e) => console.log('[E]', String(e).slice(0, 500)));
// `node harness/_boot18.mjs "<query>"` — boot any view and report its console errors. Round 18
// needed this for a DOM-only view (`party.host`) that `shoot.mjs` cannot profile: shoot reads
// renderer stats after the capture and throws on a view that has no renderer, which looks
// exactly like the view failing and is not.
const Q = process.argv[2] || 'view=room.ballroom&capture=1&cam=eye.door';
await p.goto(`http://127.0.0.1:5178/?${Q}`, { waitUntil: 'load', timeout: 60000 });
try {
  await p.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 300000 });
  console.log('READY', await p.evaluate(() => document.body.dataset.rrrReady + '/' + document.body.dataset.rrrError));
} catch (e) { console.log('TIMEOUT waiting for ready'); }
await b.close();
