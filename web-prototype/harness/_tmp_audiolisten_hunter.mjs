// scratch: what does a 0.8 s setHunterThreat(0.9,true) render actually look like?
import fs from 'node:fs';
import { chromium } from 'playwright';
const src = fs.readFileSync('C:\\Users\\John\\Documents\\Run Robot Run\\web-prototype\\src\\audio\\audio.js', 'utf8');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.route('http://rrr.audio/**', (route) => {
  const u = new URL(route.request().url());
  if (u.pathname === '/audio.js') return route.fulfill({ status: 200, contentType: 'application/javascript', body: src });
  return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><script type="module" src="/audio.js"></script>' });
});
await page.goto('http://rrr.audio/h.html', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__rrrAudio);

for (const secs of [0.8, 3, 8]) {
  const r = await page.evaluate(async (s) => {
    const A = window.__rrrAudio;
    const out = await A._renderOffline(() => A.setHunterThreat(0.9, true), s, { windowMs: 100 });
    return { peak: out.peak, windows: out.windows };
  }, secs);
  console.log(`secs=${secs}  peak=${r.peak.toFixed(5)}  per-100ms RMS: ${r.windows.slice(0, 30).map((v) => v.toFixed(4)).join(' ')}`);
}
await browser.close();
