// cold-who-44: WHICH TERM IS PAINTING THE FLOOR BLUE? Ablate the candidates one at a time.
//
// `_coolmask44` located the cold: a halo of floor around every sun bar. `_card44` swept the two
// bounce cards through sky / neutral / sun / warm-bounce and moved decile 9's chroma from 0.10
// to 0.11 — at intensity 5 against a sun at 5705 they were never going to be it, and now that is
// measured rather than assumed. This turns each remaining candidate OFF and reads the same
// ladder, which answers "what is it" before anything gets tuned at it.
//
//   node harness/_coldwho44.mjs --cams overlook --out DIR
import { chromium } from 'playwright';
import net from 'node:net';
import { writeFileSync, mkdirSync } from 'node:fs';
const PORT = 5178;
const argv = process.argv.slice(2);
const opt = (n, d = null) => (argv.indexOf('--' + n) >= 0 ? argv[argv.indexOf('--' + n) + 1] : d);
const OUT = opt('out') || 'out';
const CAMS = (opt('cams') || 'overlook').split(',');
const ARMS = ['base', 'env-off', 'bounce-cold-off', 'bounce-all-off', 'pools-off', 'shafts-off', 'sun-off'];
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
  for (const arm of ARMS) {
    const note = await page.evaluate((arm) => {
      const e = window.__rrr.engine;
      // ⚠ SNAPSHOT EVERYTHING ONCE AND RESTORE BEFORE EACH ARM. An ablation harness that leaves
      // the previous arm's term off measures the two together and reports it as one — the same
      // failure `setGrade`'s merge caused in round 18's shade sweep.
      if (!window.__cold44) {
        const s = { env: e.scene.environment, lights: [], hidden: [] };
        e.scene.traverse((o) => {
          if (o.isLight) s.lights.push({ l: o, i: o.intensity });
          if (o.isMesh && o.material && o.material.blending === 2) s.hidden.push(o); // Additive
          if (o.isMesh && o.material && o.material.blending === 4) s.hidden.push(o); // Multiply
        });
        window.__cold44 = s;
      }
      const s = window.__cold44;
      e.scene.environment = s.env;
      for (const { l, i } of s.lights) l.intensity = i;
      for (const m of s.hidden) m.visible = true;
      const isBounceCold = (l) => l.isDirectionalLight && l.color.getHex() === 0x6f8fc4;
      const isBounce = (l) => l.parent && l.parent.name === 'bounce-fill';
      let n = 0;
      if (arm === 'env-off') { e.scene.environment = null; n = 1; }
      if (arm === 'bounce-cold-off') for (const { l } of s.lights) if (isBounceCold(l)) { l.intensity = 0; n++; }
      if (arm === 'bounce-all-off') for (const { l } of s.lights) if (isBounce(l)) { l.intensity = 0; n++; }
      if (arm === 'pools-off') for (const m of s.hidden) if (m.material.blending === 4) { m.visible = false; n++; }
      if (arm === 'shafts-off') for (const m of s.hidden) if (m.material.blending === 2) { m.visible = false; n++; }
      if (arm === 'sun-off') for (const { l } of s.lights) if (l.isSpotLight) { l.intensity = 0; n++; }
      window.__rrr.redraw();
      return n;
    }, arm);
    const buf = await page.locator('canvas').first().screenshot();
    const f = `${OUT}/_cold44-${cam.replace(/\./g, '_')}-${arm}.png`;
    writeFileSync(f, buf);
    console.log(`  ${cam} ${arm} (${note} affected) -> ${f}`);
  }
  await page.evaluate(() => {
    const s = window.__cold44; if (!s) return;
    const e = window.__rrr.engine;
    e.scene.environment = s.env;
    for (const { l, i } of s.lights) l.intensity = i;
    for (const m of s.hidden) m.visible = true;
  });
}
await browser.close();
