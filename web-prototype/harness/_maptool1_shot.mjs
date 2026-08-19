import { chromium } from 'playwright';
const seeds = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewportSize: { width: 1720, height: 1080 }, deviceScaleFactor: 1 });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
for (const s of seeds) {
  await p.goto(`http://localhost:5181/tools/mapdesigner/?x=${s}`, { waitUntil: 'networkidle' });
  await p.fill('#seed', s);
  await p.dispatchEvent('#seed', 'change');
  await p.waitForTimeout(500);
  const out = `C:/Users/John/Documents/Run Robot Run/web-prototype/tmp_critic/mapdesigner-seed-${s}.png`;
  await p.screenshot({ path: out });
  // pull the numbers the page is showing, to compare against the CLI
  const got = await p.evaluate(() => ({
    metrics: document.getElementById('metrics').innerText,
    verify: document.getElementById('verify').innerText,
    flat: document.getElementById('flatGrid').innerText,
    pocket: document.getElementById('pocketBox').innerText,
  }));
  console.log(`\n=========== seed ${s} -> ${out}`);
  console.log(got.metrics);
  console.log('--- flat ---'); console.log(got.flat);
  console.log('--- pocket ---'); console.log(got.pocket);
  console.log('--- verify ---'); console.log(got.verify);
}
console.log(errs.length ? '\nCONSOLE ERRORS:\n' + errs.join('\n') : '\nno console errors');
await b.close();
