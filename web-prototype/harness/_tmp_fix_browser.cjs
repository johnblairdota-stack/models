const fs = require('fs');
const p = 'harness/_overnight_chase_shot.mjs';
let s = fs.readFileSync(p, 'utf8');
const old = `  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-dev-shm-usage'],
    });
    note('browser', 'playwright-chromium');
  } catch (e) {
    browser = await chromium.launch({ headless: true });
    note('browser', 'fallback ' + e.message);
  }`;
const neu = `  let browser;
  try {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: true,
      args: ['--disable-dev-shm-usage', '--use-gl=desktop', '--disable-gpu-driver-bug-workarounds'],
    });
    note('browser', 'chrome headless');
  } catch (e) {
    browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
    note('browser', 'playwright-chromium fallback ' + e.message);
  }
  browser.on('disconnected', () => console.error('BROWSER_DISCONNECTED'));`;
if (!s.includes(old)) { console.log('OLD_BLOCK_MISSING'); process.exit(1); }
s = s.replace(old, neu);
fs.writeFileSync(p, s);
console.log('BROWSER_LAUNCH_UPDATED');