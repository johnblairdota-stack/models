// shade-18: WHY IS THE SHADE AMBER, AND WHICH TERM OWNS IT.
//
// The eighteen-angle sweep found the round's real defect and it is one the single gate number
// could not see: the top-decile chroma gate PASSES at `overlook` and FAILS at every eye-level
// angle, and the reason is that `overlook` fills its top decile with blown-white window glare
// while an eye-level frame has no near-white source at all. Underneath that, BOTH framings run
// (r-b)/L 0.6-1.6 through deciles 1-8, against the reference's flat ~0.36. The room's SHADE is
// amber where the bar's is neutral grey-olive, and no single number was reading it.
//
// So this reports the WHOLE LADDER per variant rather than the gate scalar, and moves the
// candidate terms one at a time on ONE settled boot:
//
//   env      scene.environmentIntensity
//   sun      the daylight SpotLight
//   warm/cold/up   the three bounceFill directionals, by NAME and by COLOUR
//
//   node harness/_shade18_ab.mjs --cam eye.door base:'{}' nowarm:'{"warm":0}'
import { chromium } from 'playwright';
import net from 'node:net';
import { writeFileSync, mkdirSync } from 'node:fs';

const PORT = 5178;
const argv = process.argv.slice(2);
const opt = (n, d = null) => (argv.indexOf('--' + n) >= 0 ? argv[argv.indexOf('--' + n) + 1] : d);
const CAM = opt('cam', 'eye.door');
const OUT = opt('out');
const SPECS = argv.filter((a) => a.includes(':') && !a.startsWith('-'));

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
});
if (!(await portOpen(PORT))) { console.error('vite not running on 5178'); process.exit(3); }
if (OUT) mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-frame-rate-limit',
    '--force-device-scale-factor=1', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
const DUST = opt('dust');
// `--extra "a=1&b=2"` — BAKE-TIME params, which cannot be swept live because they are baked
// into textures or into scene construction. Combined with the live specs below, this lets one
// boot answer "with the pattern already flattened and the grime already off, how much of what
// is left is the grade's grain?" — a question that otherwise costs three boots to bracket.
const EXTRA = opt('extra');
await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1&cam=${encodeURIComponent(CAM)}`
  + (DUST != null ? `&dust=${DUST}` : '') + (EXTRA ? `&${EXTRA}` : ''),
  { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
  null, { timeout: 600000 });
await page.evaluate((n) => window.__rrr.settle(n), 16);

// snapshot every knob this tool moves, so each variant is measured against the SAME baseline
// rather than against whatever the previous variant left behind
await page.evaluate(() => {
  const sc = window.__rrr.engine.scene;
  const fill = sc.getObjectByName('bounce-fill');
  window.__f = fill ? fill.userData.lights : {};
  let sun = null;
  sc.traverse((o) => { if (o.isSpotLight && o.intensity > 100) sun = o; });
  window.__sun = sun;
  window.__base = {
    env: sc.environmentIntensity,
    sun: sun ? sun.intensity : 0,
    lights: Object.fromEntries(Object.entries(window.__f).map(([k, l]) =>
      [k, { i: l.intensity, c: l.color.getHex() }])),
  };
});
const base = await page.evaluate(() => window.__base);
console.log('baseline', JSON.stringify(base));

for (const spec of SPECS) {
  const i = spec.indexOf(':');
  const label = spec.slice(0, i);
  const q = JSON.parse(spec.slice(i + 1));
  await page.evaluate((v) => {
    const sc = window.__rrr.engine.scene;
    const B = window.__base;
    sc.environmentIntensity = v.env ?? B.env;
    if (window.__sun) {
      window.__sun.intensity = v.sun ?? B.sun;
      // `sunC` — the daylight's own colour. The sun patch on this floor measures r-b 96.2 at
      // L 184 against the bar's 45.3 at L 217: two and a half times the chroma. The bar's
      // patch is near-white because it is nearly blown, and re-blowing this one is exactly
      // what round 17 spent itself undoing, so the colour is the term that is left.
      if (window.__sunC === undefined) window.__sunC = window.__sun.color.getHex();
      window.__sun.color.setHex(v.sunC ?? window.__sunC);
    }
    for (const k of ['warm', 'cold', 'up']) {
      const l = window.__f[k];
      if (!l) continue;
      l.intensity = v[k] ?? B.lights[k].i;
      l.color.setHex(v[k + 'C'] ?? B.lights[k].c);
    }
    // `neutral: N` — THE ALBEDO/LIGHT SPLIT. Every chromatic light term off and one white
    // ambient in their place, so what the ladder then reports is the room's OWN colour through
    // the tone curve rather than the colour of what is shining on it. This is the question the
    // colour sweeps above cannot answer: `we2` matched the reference in deciles 7-9 and left
    // deciles 2-5 at 2.5x the bar, and no fill colour can fix a shade that is warm because the
    // oak and the plaster are warm.
    if (v.neutral != null) {
      const S = window.__rrr.engine.scene;
      window.__savedEnv = window.__savedEnv === undefined ? S.environment : window.__savedEnv;
      S.environment = null;
      // ⚠ EVERY LIGHT, NOT THE FOUR THIS TOOL KNOWS ABOUT. The first version of this probe
      // zeroed the sun and the three bounce fills and called the result "white light" — and
      // the ballroom also carries cool 0xc9d9f2 PointLight bounce cards at two windows and
      // ADDITIVE light-shaft geometry at three more, neither of which is a light this tool had
      // a handle on. A probe that claims to isolate albedo and silently leaves two chromatic
      // terms running is worse than no probe, because its number gets built on.
      S.traverse((o) => {
        if (o.isLight && !(window.__ambSet && window.__ambSet.has(o))) {
          if (o.userData.__savedI === undefined) o.userData.__savedI = o.intensity;
          o.intensity = 0;
        }
        // additive shaft/glow geometry is not a light and does not answer to intensity
        if (o.isMesh && o.material && o.material.blending === 2 /* AdditiveBlending */) {
          if (o.userData.__savedVis === undefined) o.userData.__savedVis = o.visible;
          o.visible = false;
        }
      });
      if (!window.__ambLight) {
        // FOUR WHITE DIRECTIONALS RATHER THAN ONE AmbientLight, because THREE is not on the
        // page and this can borrow the fills' own constructor. Four axes so the room is lit
        // from all round and the ladder is not measuring one wall.
        const proto = Object.getPrototypeOf(window.__f.warm).constructor;
        window.__ambLight = new proto(0xffffff, 0);
        window.__ambLight.position.set(0, 1, 0);
        S.add(window.__ambLight);
        window.__ambLight2 = new proto(0xffffff, 0);
        window.__ambLight2.position.set(0, -1, 0.3);
        S.add(window.__ambLight2);
        window.__ambLight3 = new proto(0xffffff, 0);
        window.__ambLight3.position.set(1, 0.4, 0.6);
        S.add(window.__ambLight3);
        window.__ambLight4 = new proto(0xffffff, 0);
        window.__ambLight4.position.set(-1, 0.4, -0.6);
        S.add(window.__ambLight4);
        window.__ambSet = new Set([window.__ambLight, window.__ambLight2,
          window.__ambLight3, window.__ambLight4]);
      }
      for (const l of [window.__ambLight, window.__ambLight2, window.__ambLight3, window.__ambLight4]) {
        l.intensity = v.neutral;
      }
    } else if (window.__savedEnv !== undefined) {
      const S = window.__rrr.engine.scene;
      S.environment = window.__savedEnv;
      S.traverse((o) => {
        if (o.isLight && o.userData.__savedI !== undefined) o.intensity = o.userData.__savedI;
        if (o.isMesh && o.userData.__savedVis !== undefined) o.visible = o.userData.__savedVis;
      });
      for (const l of window.__ambSet ?? []) l.intensity = 0;
    }
    // `sat` — the GRADE's global saturation, which is the one term that reaches every albedo
    // in the room at once. The shade being 2x the bar's chroma was measured under WHITE light,
    // so it is the materials and not the fills; per-material desaturation is a dozen edits and
    // this is one number applied after tonemapping. What it costs is the drapes and the
    // gilding, which is exactly what the rect measurements either side of this are for.
    // `shadow` / `split` — THE SHAPE, where `sat` is only the SCALE. The reference's ladder is
    // FLAT (0.40 down to 0.33 across deciles 2-9); this room's is a steep RAMP (1.14 down to
    // 0.49). Global saturation multiplies the whole ladder and so cannot flatten a ramp; the
    // split-tone shadow term is weighted by pow(1-L, 2) and therefore acts almost entirely on
    // the low deciles, which is precisely where the gap is.
    const gp = {};
    if (v.sat != null) gp.saturation = v.sat;
    if (v.shadow) gp.shadowTint = v.shadow;
    if (v.split != null) gp.splitBalance = v.split;
    // `grain` — the grade's film grain, which is PER-PIXEL and therefore sits underneath every
    // fine-scale measurement in the frame. Round 18 spent two sweeps trying to pull the floor's
    // 4px local contrast down to the bar's 3.5 and found a floor it could not get under; grain
    // at 0.026 is a candidate for most of that, and if it is, the floor's own pattern is
    // already at the bar and the remaining complaint is about the grade instead.
    if (v.grain != null) gp.grain = v.grain;
    // `aoR` / `aoI` — the ambient-occlusion radius and strength, which is the one lever this
    // round has repeatedly called "a lighting answer" for the floor's missing room-scale
    // variation and never actually pulled. The bar's floor carries broad soft darkening around
    // and under its crates and mounds: 48px local contrast 19.0 against this room's 11.5. At
    // aoRadius 0.85 this AO is a CONTACT term — it darkens where things touch the floor and
    // says nothing at three to five metres, which is exactly the band that is missing.
    if (v.aoR != null) gp.aoRadius = v.aoR;
    if (v.aoI != null) gp.aoIntensity = v.aoI;
    if (Object.keys(gp).length) window.__rrr.setGrade(gp);
  }, q);
  await page.evaluate((n) => window.__rrr.settle(n), 6);
  const buf = await page.screenshot({ type: 'png' });
  if (OUT) writeFileSync(`${OUT}/${label}.png`, buf);
  const lad = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const cv = document.createElement('canvas');
    cv.width = c.width; cv.height = c.height;
    const cx = cv.getContext('2d');
    cx.drawImage(c, 0, 0);
    const d = cx.getImageData(0, 0, cv.width, cv.height).data;
    const px = [];
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      px.push([0.2126 * r + 0.7152 * g + 0.0722 * b, r, g, b]);
    }
    px.sort((a, b) => a[0] - b[0]);
    const n = px.length, out = [];
    for (let k = 0; k < 10; k++) {
      const s = px.slice(Math.floor(n * k / 10), Math.floor(n * (k + 1) / 10));
      const m = (j) => s.reduce((t, p) => t + p[j], 0) / s.length;
      const L = m(0), R = m(1), Bl = m(3);
      out.push(+((R - Bl) / L).toFixed(3));
    }
    return { d: out, med: +px[Math.floor(n / 2)][0].toFixed(1) };
  });
  console.log(`${label.padEnd(10)} med ${String(lad.med).padStart(5)}  ${lad.d.map((v) => String(v.toFixed(2)).padStart(5)).join(' ')}`);
}
await browser.close();
