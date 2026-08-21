// breakedge-owner-1 — measure the tile means of crumbleOrder()'s three biased terms.
//
// They exist so the crumble layer changes WHERE material survives without changing HOW MUCH
// (see the note in wallstages.js's crumbleOrder). Estimating them by hand is exactly the
// "assume any unsourced number is wrong" trap, so they are measured: bake a throwaway 1024
// tile whose albedo channels ARE fis, fis2 and keyline, read it back, average it.
//
// The GLSL below is copied verbatim from crumbleOrder's body, so if that changes this must
// be re-run. It prints the three numbers to paste into CRUMBLE_MEANS.
//
// Usage: node harness/evidence/_be1_means.mjs [port]
import { chromium } from 'playwright';

const PORT = +(process.argv[2] || 5178);
const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--force-device-scale-factor=1'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
// mat.lath is the cheapest view that already has a live renderer and the baker wired up.
await page.goto(`http://127.0.0.1:${PORT}/?view=mat.lath&capture=1`, { waitUntil: 'load', timeout: 45000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 240000 });

const out = await page.evaluate(async () => {
  const { baker } = await import('/src/materials/baker.js');
  const b = baker();
  const SURF = `
uniform float uCourseRows;
void surface(in vec2 uv, inout Surf s){
  vec3 c1 = voronoiT(uv * 14.0, 14.0);
  vec3 c2 = voronoiT(uv * 14.0 * 3.0, 14.0 * 3.0);
  float fis  = 1.0 - smoothstep(0.0, 0.075, c1.y - c1.x);
  float fis2 = 1.0 - smoothstep(0.0, 0.038, c2.y - c2.x);
  float ly = fract(uv.y * uCourseRows);
  float keyline = 1.0 - smoothstep(0.0, 0.26, min(ly, 1.0 - ly));
  s.albedo = vec3(fis, fis2, keyline);
  s.height = 0.5;
}`;
  const bake = b.bake({
    key: 'be1.means:' + Math.random(), size: 1024, surface: SURF,
    uniforms: { uCourseRows: 30.0 },
  });
  const size = 1024;
  const buf = new Uint8Array(size * size * 4);
  // 7th arg is activeCubeFaceIndex, 8th is textureIndex — 0 is the albedo attachment.
  window.__rrr.engine.renderer.readRenderTargetPixels(bake._rt, 0, 0, size, size, buf, undefined, 0);
  let r = 0, g = 0, bl = 0;
  for (let i = 0; i < buf.length; i += 4) { r += buf[i]; g += buf[i + 1]; bl += buf[i + 2]; }
  const n = size * size;
  return { fis1: r / n / 255, fis2: g / n / 255, keyline: bl / n / 255 };
});
console.log(JSON.stringify(out, null, 2));
console.log(`\nCRUMBLE_MEANS = { fis1: ${out.fis1.toFixed(5)}, fis2: ${out.fis2.toFixed(5)}, keyline: ${out.keyline.toFixed(5)} }`);
await browser.close();
