// card-44: THE BOUNCE CARDS ARE SKY-COLOURED AND THEY ARE THE COLD HALF OF THE FRAME.
//
// `_coolmask44` painted every cool-class pixel at or above decile 9 and the answer was not the
// windows and not the marble: it is the HALO OF FLOOR AROUND EACH SUN BAR. The bars themselves
// come out warm; everything they spill onto comes out blue.
//
// `room-ballroom.js` says what puts it there: *"a hot patch on a pale marble tile throws real
// light back into the room"* — two PointLights at `0xc9d9f2`, intensity 5.0, sitting at y 0.5 in
// the middle of each sun patch. The intent is right and the colour is not physical. Light
// bounced off a sunlit floor carries the SUN's colour times the FLOOR's albedo; `0xffe4c0` on
// pale warm marble is a warm cream, and `0xc9d9f2` is skylight, which is the one thing that
// cannot have come off that patch.
//
//   node harness/_card44.mjs --cams overlook,eye.door --out DIR
import { chromium } from 'playwright';
import net from 'node:net';
import { writeFileSync, mkdirSync } from 'node:fs';
const PORT = 5178;
const argv = process.argv.slice(2);
const opt = (n, d = null) => (argv.indexOf('--' + n) >= 0 ? argv[argv.indexOf('--' + n) + 1] : d);
const OUT = opt('out') || 'out';
const CAMS = (opt('cams') || 'overlook').split(',');
// current, neutral, the sun's own colour, and the sun times a warm pale floor
const VARIANTS = [
  { id: 'sky', hex: 0xc9d9f2 },
  { id: 'neutral', hex: 0xe6e4e2 },
  { id: 'sun', hex: 0xffe4c0 },
  { id: 'bounce', hex: 0xffd9a6 },
];
const portOpen = (p) => new Promise((r) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false));
});
if (!(await portOpen(PORT))) { console.error('vite not running on 5178'); process.exit(3); }
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.log('[E]', String(e).slice(0, 200)));
await page.routeWebSocket((u) => u.port === String(PORT), () => {});
for (const cam of CAMS) {
  await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1&cam=${encodeURIComponent(cam)}`,
    { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
    null, { timeout: 900000 });
  await page.evaluate(() => window.__rrr.settle(8));
  for (const v of VARIANTS) {
    const n = await page.evaluate((v) => {
      const e = window.__rrr.engine;
      // ⚠ FIND THE CARDS ONCE. Same trap as the gilt sweep: match them by their ORIGINAL colour
      // and the second variant finds nothing, because the first one repainted them.
      if (!window.__card44) {
        const found = [];
        e.scene.traverse((o) => {
          if (o.isPointLight && Math.abs(o.intensity - 5.0) < 1e-6
            && o.color.getHex() === 0xc9d9f2) found.push(o);
        });
        window.__card44 = found;
      }
      for (const l of window.__card44) l.color.setHex(v.hex);
      window.__rrr.redraw();
      return window.__card44.length;
    }, v);
    const buf = await page.locator('canvas').first().screenshot();
    const f = `${OUT}/_card44-${cam.replace(/\./g, '_')}-${v.id}.png`;
    writeFileSync(f, buf);
    console.log(`  ${cam} ${v.id} (${n} cards) -> ${f}`);
  }
  await page.evaluate(() => {
    for (const l of window.__card44 ?? []) l.color.setHex(0xc9d9f2);
  });
}
await browser.close();
