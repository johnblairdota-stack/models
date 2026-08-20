import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 2100, height: 2400 } });
await p.goto('file://' + process.cwd() + '/_preview.html');
await p.waitForTimeout(600);
await p.screenshot({ path: '_preview.png', fullPage: true });
for (const w of ['Main.dc.html', 'Ledger.dc.html']) {
  await p.locator(`figure:has(figcaption:text-is("${w}")) .pane`).first()
    .screenshot({ path: '_crop-' + w.replace('.dc.html', '') + '.png' });
}
await b.close(); console.log('ok');
