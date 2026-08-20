import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1700, height: 1200 } });
await p.goto('file://' + process.cwd() + '/_preview.html');
await p.waitForTimeout(400);
console.table(await p.evaluate(() => [...document.querySelectorAll('figure')].map((f) => {
  const r = f.querySelector('.pane > div');
  return { file: f.querySelector('figcaption').textContent, h: r.clientHeight,
           needs: r.scrollHeight, over: r.scrollHeight - r.clientHeight,
           slack: Math.round(r.getBoundingClientRect().bottom - [...r.children].pop().getBoundingClientRect().bottom) };
})));
await b.close();
