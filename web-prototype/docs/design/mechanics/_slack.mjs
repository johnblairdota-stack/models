import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1700, height: 1200 } });
await p.goto('file://' + process.cwd() + '/_preview.html');
await p.waitForTimeout(400);
console.table(await p.evaluate(() => [...document.querySelectorAll('figure')].map((f) => {
  const ph = f.querySelector('.pane div[style*="width:390px"]');
  if (!ph) return { file: f.querySelector('figcaption').textContent, slack: '-' };
  const last = [...ph.children].pop().getBoundingClientRect();
  return { file: f.querySelector('figcaption').textContent,
    slack: Math.round(ph.getBoundingClientRect().bottom - last.bottom - 14) };
})));
await b.close();
