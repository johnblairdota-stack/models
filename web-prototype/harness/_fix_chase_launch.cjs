const fs = require('fs');
const p = 'harness/_overnight_chase_shot.mjs';
let c = fs.readFileSync(p, 'utf8');
c = c.replace(
  /browser = await chromium\.launch\(\{\s*channel: 'chrome',\s*headless: true,\s*args: \[[^\]]+\],\s*\}\);/,
  "browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });"
);
c = c.replace("note('browser', 'chrome headless');", "note('browser', 'playwright-chromium');");
c = c.replace(
  "console.log(k, typeof v === 'string' ? v.slice(0, 1400) : JSON.stringify(v).slice(0, 1400));",
  "const line = k + ' ' + (typeof v === 'string' ? v.slice(0, 1400) : JSON.stringify(v).slice(0, 1400)); console.log(line); try { require('fs').appendFileSync(require('path').join(ROOT,'harness','_warm_out_chase_shot_run.txt'), line+'\\n'); } catch(_){}"
);
c = c.replace(
  "main().catch(async (e) => {\n  console.error('FAIL', e);\n  process.exitCode = 1;\n});",
  "main().catch(async (e) => {\n  console.error('FAIL', e && (e.stack || e));\n  try { require('fs').appendFileSync(require('path').join(ROOT, 'harness', '_warm_out_chase_shot.err.txt'), String(e && e.stack || e)+'\\n'); } catch(_){}\n  process.exitCode = 1;\n  process.exit(1);\n});"
);
fs.writeFileSync(p, c);
console.log('ok chromeGone', !c.includes("channel: 'chrome'"), 'pw', c.includes('playwright-chromium'), 'exit1', c.includes('process.exit(1)'));
