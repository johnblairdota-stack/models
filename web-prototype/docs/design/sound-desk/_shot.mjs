import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1700, height: 2400 }, deviceScaleFactor: 1 });
await p.goto('file://' + process.cwd() + '/_preview.html');
await p.waitForTimeout(600);
await p.screenshot({ path: '_preview.png', fullPage: true });
await b.close();
console.log('ok');
