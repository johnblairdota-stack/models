import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const clips = ['walking', 'running', 'attack'];
for (const clip of clips) {
  const errs = [];
  page.removeAllListeners('pageerror');
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://localhost:5179/?view=mesh.animated&clip=${clip}&orbit=1&quality=medium`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);
  const err = await page.evaluate(() => window.__rrrError ?? null);
  const body = await page.evaluate(() => document.body.innerText.slice(0, 120));
  console.log(`${clip.padEnd(9)} __rrrError: ${err ? String(err).split('\n')[0] : 'none'}` +
    `${errs.length ? '  pageerrors: ' + errs.join('|') : ''}`);
  console.log(`          page text: ${JSON.stringify(body.trim().slice(0, 80))}`);
  if (clip === 'walking') await page.screenshot({ path: process.argv[2] });
}
await browser.close();
