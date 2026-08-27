const fs = require('fs');
const p = 'harness/_overnight_chase_shot.mjs';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('follow-bed.js*')) { console.log('ROUTE_ALREADY'); process.exit(0); }
const marker = '    await c.route(\'**/@vite/client\'';
const idx = s.indexOf(marker);
if (idx < 0) { console.log('NO_HMR_ROUTE'); process.exit(1); }
const insertAt = s.indexOf('\n', idx) + 1;
// find end of that route line's statement - next line after fulfill
let i = insertAt;
// skip to after the HMR route call ends (line with });)
while (i < s.length) {
  const lineEnd = s.indexOf('\n', i);
  const line = s.slice(i, lineEnd);
  i = lineEnd + 1;
  if (line.includes('});')) break;
}
const routeBlock = `    await c.route('**/follow-bed.js*', async (route) => {
      try {
        const resp = await route.fetch();
        let body = await resp.text();
        if (!body.includes('until: mode ===') && body.includes('operator.shot')) {
          body = body.replace(
            /shot:\\s*mode\\s*===\\s*['"]run['"]\\s*\\?\\s*operator\\.shot\\s*:\\s*mode\\s*,/,
            "shot: mode === 'run' ? operator.shot : mode,\\n      until: mode === 'run' ? +Number(operator.until).toFixed(3) : null,\\n      cutGen: mode === 'run' ? (operator._cutGen || 0) : null,"
          );
          body = body.replace(
            /cut\\(runner,\\s*lastPortal\\)\\s*\\{/,
            'cut(runner, lastPortal) { this._cutGen = (this._cutGen || 0) + 1;'
          );
        }
        await route.fulfill({ status: 200, contentType: 'application/javascript', body });
      } catch (_) { await route.continue(); }
    });
`;
s = s.slice(0, i) + routeBlock + s.slice(i);
fs.writeFileSync(p, s);
console.log('ROUTE_INSERTED');