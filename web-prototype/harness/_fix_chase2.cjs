const fs = require('fs');
const p = 'harness/_overnight_chase_shot.mjs';
let c = fs.readFileSync(p, 'utf8');

// ensure sync fs import
if (!c.includes("writeFileSync")) {
  c = c.replace(
    "import { mkdir, writeFile } from 'node:fs/promises';",
    "import { mkdir, writeFile } from 'node:fs/promises';\nimport { appendFileSync, writeFileSync } from 'node:fs';"
  );
}

// fix note() to not use require
c = c.replace(
  /const note = \(k, v\) => \{[\s\S]*?\n  \};/,
  `const note = (k, v) => {
    log.push({ k, v, at: Date.now() });
    const line = k + ' ' + (typeof v === 'string' ? v.slice(0, 1400) : JSON.stringify(v).slice(0, 1400));
    console.log(line);
    try { appendFileSync(path.join(ROOT, 'harness', '_warm_out_chase_shot_run.txt'), line + '\\n'); } catch (_) {}
  };`
);

// launch with chrome channel (worked further once) + crash dumps
c = c.replace(
  /browser = await chromium\.launch\(\{[\s\S]*?\}\);\s*note\('browser', 'playwright-chromium'\);/,
  `try {
      browser = await chromium.launch({
        channel: 'chrome',
        headless: true,
        args: ['--disable-dev-shm-usage', '--use-gl=desktop', '--disable-gpu-driver-bug-workarounds'],
      });
      note('browser', 'chrome headless');
    } catch (eChrome) {
      browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
      note('browser', 'playwright-chromium fallback ' + eChrome.message);
    }
    /* keep note below as no-op marker */ note('browser_ready', !!browser);`
);

// remove duplicate outer try that may now be broken — rebuild launch block carefully later if needed

// harden catch
c = c.replace(
  /main\(\)\.catch\(async \(e\) => \{[\s\S]*?\}\);?\s*$/,
  `process.on('uncaughtException', (e) => {
  console.error('UNCAUGHT', e && (e.stack || e));
  try { appendFileSync(path.join(ROOT, 'harness', '_warm_out_chase_shot.err.txt'), 'UNCAUGHT ' + String(e && e.stack || e) + '\\n'); } catch (_) {}
  process.exit(1);
});
process.on('unhandledRejection', (e) => {
  console.error('UNHANDLED', e && (e.stack || e));
  try { appendFileSync(path.join(ROOT, 'harness', '_warm_out_chase_shot.err.txt'), 'UNHANDLED ' + String(e && e.stack || e) + '\\n'); } catch (_) {}
  process.exit(1);
});
main().catch(async (e) => {
  console.error('FAIL', e && (e.stack || e));
  try { appendFileSync(path.join(ROOT, 'harness', '_warm_out_chase_shot.err.txt'), 'FAIL ' + String(e && e.stack || e) + '\\n'); } catch (_) {}
  process.exitCode = 1;
  process.exit(1);
});
`
);

fs.writeFileSync(p, c);
console.log('patched');
