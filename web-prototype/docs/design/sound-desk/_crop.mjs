import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1300, height: 1000 }, deviceScaleFactor: 2 });
await p.goto('file://' + process.cwd() + '/_preview.html');
await p.waitForTimeout(400);
for (const want of ['Main.dc.html', 'Legend.dc.html']) {
  const el = await p.locator(`figure:has(figcaption:text-is("${want}")) .pane`).first();
  await el.screenshot({ path: '_crop-' + want.replace('.dc.html', '') + '.png' });
}
await b.close(); console.log('ok');
