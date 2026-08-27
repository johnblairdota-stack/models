const fs = require('fs');
const p = 'harness/_overnight_chase_shot.mjs';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  /let browser;[\s\S]*?browser\.on\('disconnected', \(\) => console\.error\('BROWSER_DISCONNECTED'\)\);/,
  `let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-dev-shm-usage', '--use-gl=swiftshader', '--disable-gpu'],
    });
    note('browser', 'playwright-chromium');
  } catch (e) {
    browser = await chromium.launch({ headless: true });
    note('browser', 'fallback ' + e.message);
  }
  browser.on('disconnected', () => console.error('BROWSER_DISCONNECTED'));
  process.on('SIGTERM', () => console.error('SIGTERM'));
  process.on('SIGINT', () => console.error('SIGINT'));`
);
fs.writeFileSync(p, s);
console.log('NO_CHROME_CHANNEL', s.includes("channel: 'chrome'"));