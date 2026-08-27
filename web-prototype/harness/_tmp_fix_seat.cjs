const fs = require('fs');
const p = 'harness/_overnight_chase_shot.mjs';
let s = fs.readFileSync(p, 'utf8');
// Remove botched route block if present
s = s.replace(/\n\s*await c\.route\('\*\*\/follow-bed\.js\*'[\s\S]*?catch \(_\) \{ await route\.continue\(\); \}\n\s*\}\);\n/, '\n');
const seatOld = `  async function seat(name, viewport) {
    const c = await browser.newContext({ viewport });
    await c.route('**/@vite/client', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: HMR_STUB }));
    if (name) await c.addInitScript((n) => localStorage.setItem('rrr.party.name', n), name);
    return c;
  }`;
const seatNew = `  async function seat(name, viewport) {
    const c = await browser.newContext({ viewport });
    await c.route('**/@vite/client', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: HMR_STUB }));
    await c.route('**/follow-bed.js*', async (route) => {
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
    if (name) await c.addInitScript((n) => localStorage.setItem('rrr.party.name', n), name);
    return c;
  }`;
if (!s.includes(seatOld)) { console.log('SEAT_OLD_MISSING'); console.log(s.includes('async function seat')); process.exit(1); }
s = s.replace(seatOld, seatNew);
fs.writeFileSync(p, s);
console.log('SEAT_FIXED');