import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1700, height: 1200 } });
await p.goto('file://' + process.cwd() + '/_preview.html');
await p.waitForTimeout(400);
console.table(await p.evaluate(() => [...document.querySelectorAll('figure')].map((f) => {
  const r = f.querySelector('.pane > div');
  const ph = f.querySelector('.pane div[style*="width:390px"]');
  const kids = r.querySelector(':scope > div') || r;
  return { file: f.querySelector('figcaption').textContent, h: r.clientHeight,
    needs: Math.max(r.scrollHeight, kids.scrollHeight + 0), over: Math.max(r.scrollHeight, kids.scrollHeight) - r.clientHeight,
    phoneOver: ph ? ph.scrollHeight - ph.clientHeight : '-' };
})));
await b.close();
