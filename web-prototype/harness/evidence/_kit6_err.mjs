import { chromium } from 'playwright';
const q = process.argv[2] ?? 'solo=1&clip=walking';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://localhost:5178/?view=mesh.animated&capture=1&${q}`, { waitUntil: 'load' });
await page.waitForTimeout(9000);
console.log('QUERY:', q);
console.log('__rrrError:', await page.evaluate(() => window.__rrrError ?? '(none)'));
await browser.close();
