/**
 * fx-glow experiment rig (scratch).
 *
 * Boots a view in capture mode against the shared dev server, freezes a list of probe
 * pixels (every Sprite's projected centre, plus caller-named references), then renders the
 * scene once per STATE and reports, for each probe pixel:
 *   - the PRE-TONEMAP HDR radiance read back from pipeline.sceneRT
 *   - the FINAL LDR pixel from the canvas
 *
 * That pairing is the whole point: it separates "the sprite never deposited radiance" from
 * "the tone curve ate the radiance it deposited". Measuring the SAME pixel across states is
 * what makes the delta meaningful — the cyc carries a gradient, so two different pixels are
 * never a control for each other.
 *
 *   node harness/evidence/_tmp_fxglow.mjs <viewId> --state <file.js> [--state <file2.js> ...]
 *                                [--at N] [--extra "k=v&k=v"] [--refs "x,y,label;..."]
 *
 * Each state file is a function body with `engine`, `sprites`, `log` (an array) in scope.
 * States are applied CUMULATIVELY in order, so write them as reversible steps or pass one.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const viewId = argv[0];
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const many = (n) => argv.reduce((a, v, i) => (v === '--' + n && argv[i + 1] ? a.concat(argv[i + 1]) : a), []);

const stateFiles = many('state');
const states = [{ name: 'baseline', src: '' }].concat(
  stateFiles.map((f) => ({ name: f.split(/[\\/]/).pop().replace(/\.js$/, ''), src: readFileSync(f, 'utf8') })));

const PORT = 5178;
const extra = (opt('extra') ? '&' + opt('extra') : '') + (opt('at') ? `&at=${opt('at')}` : '');
const url = `http://127.0.0.1:${PORT}/?view=${encodeURIComponent(viewId)}&capture=1${extra}`;
const refs = (opt('refs') ?? '').split(';').filter(Boolean)
  .map((s) => { const [x, y, l] = s.split(','); return [+x, +y, l ?? `${x},${y}`]; });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
    '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.error('  [console] ' + m.text()); });
page.on('pageerror', (e) => console.error('  [pageerror] ' + e.message));
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__rrr && window.__rrr.ready, null, { timeout: 200000 });
await page.evaluate(() => window.__rrr.settle(10));

const report = await page.evaluate(async ({ states, refs }) => {
  const e = window.__rrr.engine;
  const h2f = (h) => {
    const s = (h & 0x8000) >> 15, ex = (h & 0x7c00) >> 10, f = h & 0x03ff;
    if (ex === 0) return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
    if (ex === 31) return f ? NaN : (s ? -Infinity : Infinity);
    return (s ? -1 : 1) * Math.pow(2, ex - 15) * (1 + f / 1024);
  };
  const sprites = [];
  e.scene.traverse((o) => { if (o.isSprite) sprites.push(o); });

  const W = e.pipeline.width, H = e.pipeline.height;
  const buf = new Uint16Array(4);
  const readHDR = (x, y) => {
    e.renderer.readRenderTargetPixels(e.pipeline.sceneRT, Math.round(x), Math.round(H - 1 - y), 1, 1, buf);
    return [h2f(buf[0]), h2f(buf[1]), h2f(buf[2])];
  };
  const project = (obj) => {
    obj.updateWorldMatrix(true, false);
    const m = obj.matrixWorld.elements;
    const p = [m[12], m[13], m[14]];
    const cam = e.camera; cam.updateMatrixWorld();
    const mv = cam.matrixWorldInverse.elements, pr = cam.projectionMatrix.elements;
    const tx = mv[0] * p[0] + mv[4] * p[1] + mv[8] * p[2] + mv[12];
    const ty = mv[1] * p[0] + mv[5] * p[1] + mv[9] * p[2] + mv[13];
    const tz = mv[2] * p[0] + mv[6] * p[1] + mv[10] * p[2] + mv[14];
    const cx = pr[0] * tx + pr[4] * ty + pr[8] * tz + pr[12];
    const cy = pr[1] * tx + pr[5] * ty + pr[9] * tz + pr[13];
    const cw = pr[3] * tx + pr[7] * ty + pr[11] * tz + pr[15];
    return [(cx / cw * 0.5 + 0.5) * W, (1 - (cy / cw * 0.5 + 0.5)) * H];
  };

  // probe list is frozen at baseline so every state measures the SAME pixels
  const probes = sprites.map((s, i) => {
    const [x, y] = project(s);
    return { label: `S${i} ${s.name || '?'} ${'#' + s.material.color.getHexString()} op${s.material.opacity.toFixed(2)} bl${s.material.blending}${s.material.toneMapped ? ' TM' : ''} sc${s.scale.x.toFixed(3)}`, x, y };
  }).concat(refs.map(([x, y, l]) => ({ label: 'REF ' + l, x, y })));

  const log = [];
  const out = [];
  for (const st of states) {
    if (st.src) {
      try { new Function('engine', 'sprites', 'log', st.src)(e, sprites, log); }
      catch (err) { log.push(`state ${st.name} THREW: ${err.message}`); }
    }
    for (let i = 0; i < 4; i++) e._step(1 / 60, performance.now());
    const cv = document.createElement('canvas');
    cv.width = e.canvas.width; cv.height = e.canvas.height;
    const c2 = cv.getContext('2d', { willReadFrequently: true });
    c2.drawImage(e.canvas, 0, 0);
    const px = c2.getImageData(0, 0, cv.width, cv.height).data;
    const readLDR = (x, y) => { const i = (Math.round(y) * cv.width + Math.round(x)) * 4; return [px[i], px[i + 1], px[i + 2]]; };
    out.push({
      name: st.name,
      png: cv.toDataURL('image/png'),
      vals: probes.map((p) => ({
        hdr: readHDR(p.x, p.y).map((n) => +n.toFixed(3)),
        ldr: readLDR(p.x, p.y),
      })),
    });
  }
  return {
    W, H, quality: e.qualityName, toneMapping: e.renderer.toneMapping,
    grade: { exposure: e.pipeline.grade.exposure, bloomStrength: e.pipeline.grade.bloomStrength, bloomThreshold: e.pipeline.grade.bloomThreshold },
    nSprites: sprites.length, probes, states: out, log,
  };
}, { states, refs });

await browser.close();

const shotDir = opt('shots');
if (shotDir) {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync(shotDir, { recursive: true });
  report.states.forEach((s, i) => {
    const f = `${shotDir}/fx_${String(i)}_${s.name}.png`;
    writeFileSync(f, Buffer.from(s.png.split(',')[1], 'base64'));
    console.log('  shot -> ' + f);
  });
}

const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]).toFixed(0);
console.log(`view=${viewId} ${report.W}x${report.H} quality=${report.quality} rendererToneMapping=${report.toneMapping} sprites=${report.nSprites} grade=${JSON.stringify(report.grade)}`);
for (const l of report.log) console.log('  LOG ' + l);
const header = report.states.map((s) => s.name.padEnd(34)).join(' | ');
console.log(`  ${'probe'.padEnd(56)} @x,y      ${header}`);
report.probes.forEach((p, i) => {
  const cells = report.states.map((s) => {
    const v = s.vals[i];
    return `hdr ${v.hdr.join('/')} ldr ${v.ldr.join('/')} L${lum(v.ldr)}`.padEnd(34);
  }).join(' | ');
  console.log(`  ${p.label.padEnd(56)} ${String(Math.round(p.x)).padStart(4)},${String(Math.round(p.y)).padStart(4)}  ${cells}`);
});
