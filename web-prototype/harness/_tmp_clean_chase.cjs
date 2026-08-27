const fs = require('fs');
const p = 'harness/_overnight_chase_shot.mjs';
let s = fs.readFileSync(p, 'utf8');
const start = s.indexOf('    // Instrument-only:');
const end = s.indexOf('    if (name) await c.addInitScript');
if (start < 0 || end < 0) {
  console.log('markers', start, end);
  process.exit(1);
}
s = s.slice(0, start) + s.slice(end);
s = s.replace(
  "args: ['--disable-dev-shm-usage', '--use-gl=swiftshader'],",
  "args: ['--disable-dev-shm-usage'],"
);
fs.writeFileSync(p, s);
console.log('HARNESS_CLEANED route=', s.includes('follow-bed.js*'), 'swift=', s.includes('swiftshader'));