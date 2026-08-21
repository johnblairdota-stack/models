/**
 * estate-owner-9 scratch probe — settle WHY the ballroom end mirrors are illegible.
 *
 * THE HYPOTHESIS, read out of three r180's own source rather than from memory (which is the
 * check estate-owner-8 was killed in the middle of):
 *
 *  1. PMREMGenerator._setSize does  _lodMax = floor(log2(cubeSize)) ;  _cubeSize = 2^_lodMax.
 *     So a 640 cube is FLOORED TO 512 and a 384 cube is FLOORED TO 256. The number in
 *     room-ballroom.js is not the number the shader gets.
 *  2. cube_uv_reflection_fragment: faceSize = exp2(mipInt), i.e. mip IS log2 of the face size,
 *     and below roughness 0.21 the curve is  mip = -2*log2(1.16*roughness).
 *     At the plate's authored roughness of ~0.055 that is mip 7.94 -> a 128/256 face blend.
 *     CUBEUV_MAX_MIP is 9 for a 512 cube and 8 for a 256 cube, so NEITHER clamps 7.94.
 *
 *  => PREDICTION A: the 384 -> 640 cube change bought nothing at the shipped roughness.
 *  => PREDICTION B: scaling material.roughness down past 0.038 saturates the mip at
 *     CUBEUV_MAX_MIP and the plate visibly sharpens, WITHOUT touching the probe.
 *
 * Both are falsifiable from one browser session: material.roughness multiplies the roughnessMap,
 * so the sweep needs no rebuild and no re-render of the cube.
 *
 *   node harness/evidence/_tmp_eo9_mip.mjs --outdir C:/tmp/mip
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const VIEW = opt('view', 'room.ballroom');
const OUTDIR = opt('outdir', null);
const PORT = Number(opt('port', '5196'));
const TAG = opt('tag', 'cube');

const srv = spawn(process.execPath, ['harness/serve.mjs', '--port', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1800));
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e.message ?? e)));
await page.goto(`http://127.0.0.1:${PORT}/?view=${encodeURIComponent(VIEW)}&capture=1&quality=medium`,
  { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(
  () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
  null, { timeout: 240000 });
await page.evaluate(() => window.__rrr.settle(8));

// ---- 1. plate identity + the ACTUAL baked roughness -----------------------
// The material's scalar roughness is 1.0 and the real value lives in the ORM map's green
// channel, so read the texture back rather than quoting the shader source at it.
const facts = await page.evaluate(() => {
  const eng = window.__rrr.engine;
  const cam = eng.camera;
  const rows = [];
  eng.scene.traverse((o) => {
    if (!o.isMesh || !/^end-mirror|^pier-mirrors/.test(o.name || '')) return;
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    const c = bb.min.clone().add(bb.max).multiplyScalar(0.5);
    o.localToWorld(c);
    const dist = c.distanceTo(cam.position);
    const ndc = c.clone().project(cam);
    const w = bb.max.x - bb.min.x, h = bb.max.y - bb.min.y;
    const m = o.material;
    rows.push({
      name: o.name,
      camDist: +dist.toFixed(2),
      screenPx: [Math.round((ndc.x * 0.5 + 0.5) * 1920), Math.round((-ndc.y * 0.5 + 0.5) * 1080)],
      screenWH: [
        Math.round(w / dist / (2 * Math.tan(cam.fov * Math.PI / 360) * cam.aspect) * 1920),
        Math.round(h / dist / (2 * Math.tan(cam.fov * Math.PI / 360)) * 1080),
      ],
      coneDeg: [+(2 * Math.atan(w / 2 / dist) * 180 / Math.PI).toFixed(2),
        +(2 * Math.atan(h / 2 / dist) * 180 / Math.PI).toFixed(2)],
      cubeSide: m?.envMap ? (m.envMap.image?.[0]?.width ?? m.envMap.image?.width ?? '?') : null,
      envMapIntensity: m?.envMapIntensity ?? null,
      roughnessScalar: m?.roughness ?? null,
    });
  });
  return rows;
});
console.log('PLATES');
console.log(JSON.stringify(facts, null, 2));

// read the ORM green channel back off the GPU
const rough = await page.evaluate(() => {
  const eng = window.__rrr.engine;
  let plate = null;
  eng.scene.traverse((o) => { if (o.name === 'end-mirror.r') plate = o; });
  const tex = plate.material.roughnessMap;
  if (!tex) return { err: 'no roughnessMap' };
  const THREE_Scene = eng.scene.constructor;
  const THREE_Mesh = plate.constructor;
  const THREE_Geo = plate.geometry.constructor;              // PlaneGeometry
  const THREE_Cam = eng.camera.constructor;                  // PerspectiveCamera - need ortho
  void THREE_Cam;
  // Build a tiny readback: a unit quad textured with the ORM, drawn by an orthographic camera.
  // Reach the constructors we do not already hold off the renderer's own module graph is not
  // possible, so use the renderer's copyTextureToTexture-free path: draw with a basic material
  // cloned off an existing one in the scene.
  let basicSrc = null;
  eng.scene.traverse((o) => { if (!basicSrc && o.isMesh && o.material && o.material.isMeshBasicMaterial) basicSrc = o.material; });
  if (!basicSrc) return { err: 'no MeshBasicMaterial in scene to clone' };
  const mat = basicSrc.clone();
  mat.map = tex; mat.color.setRGB(1, 1, 1); mat.transparent = false; mat.fog = false;
  mat.toneMapped = false; mat.vertexColors = false; mat.needsUpdate = true;
  const geo = new THREE_Geo(2, 2);
  const quad = new THREE_Mesh(geo, mat);
  const sc = new THREE_Scene();
  sc.add(quad);
  // an orthographic camera without the constructor: abuse the perspective camera at a
  // distance where a 2x2 quad exactly fills a 90-degree frustum
  const cam = new THREE_Cam(90, 1, 0.1, 10);
  cam.position.set(0, 0, 1);
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
  const rtC = plate.material.envMap.constructor;             // WebGLCubeRenderTarget - not usable
  void rtC;
  // render straight to the canvas is destructive; use the renderer's existing target API via
  // a render target cloned from the pipeline's own scene RT.
  const rt = eng.pipeline.sceneRT.clone();
  rt.setSize(64, 64);
  const renderer = eng.renderer;
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(sc, cam);
  // ⚠ THE FIRST VERSION OF THIS PROBE RETURNED ALL ZEROS AND LOOKED LIKE A MEASUREMENT.
  // readRenderTargetPixels requires the typed array to MATCH the target's texture type, and
  // sceneRT is HalfFloat — a Float32Array silently comes back empty. It now uses Uint16Array
  // and REFUSES to report a number when every sample is zero, because "the plate has zero
  // roughness" and "the readback did not happen" are indistinguishable in the output and only
  // one of them is true. A probe that cannot observe must report SKIP, never a value.
  const buf = new Uint16Array(64 * 64 * 4);
  try {
    renderer.readRenderTargetPixels(rt, 0, 0, 64, 64, buf);
  } catch (e) {
    renderer.setRenderTarget(prev);
    return { skip: 'readRenderTargetPixels threw', err: String(e && e.message ? e.message : e) };
  }
  renderer.setRenderTarget(prev);
  if (!buf.some((v) => v !== 0)) return { skip: 'readback returned all zeros — NOT a measurement' };
  // half-float bits -> number, enough for the 0..1 range this map lives in
  const h2f = (h) => {
    const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
    if (e === 0) return s * Math.pow(2, -14) * (f / 1024);
    if (e === 31) return f ? NaN : s * Infinity;
    return s * Math.pow(2, e - 15) * (1 + f / 1024);
  };
  // ORM convention in this project: r = ao, g = roughness, b = metalness
  const g = [], b = [];
  for (let i = 0; i < 64 * 64; i++) { g.push(h2f(buf[i * 4 + 1])); b.push(h2f(buf[i * 4 + 2])); }
  g.sort((x, y) => x - y); b.sort((x, y) => x - y);
  const q = (a, f) => +a[Math.floor((a.length - 1) * f)].toFixed(4);
  // three's roughnessToMip, transcribed from cube_uv_reflection_fragment
  const r2m = (r) => {
    if (r >= 0.8) return (1.0 - r) * (-1.0 - -2.0) / (1.0 - 0.8) + -2.0;
    if (r >= 0.4) return (0.8 - r) * (2.0 - -1.0) / (0.8 - 0.4) + -1.0;
    if (r >= 0.305) return (0.4 - r) * (3.0 - 2.0) / (0.4 - 0.305) + 2.0;
    if (r >= 0.21) return (0.305 - r) * (4.0 - 3.0) / (0.305 - 0.21) + 3.0;
    return -2.0 * Math.log2(1.16 * r);
  };
  const pick = [q(g, 0.05), q(g, 0.25), q(g, 0.5), q(g, 0.75), q(g, 0.95)];
  return {
    roughnessQuantiles: pick,
    metalnessQuantiles: [q(b, 0.05), q(b, 0.5), q(b, 0.95)],
    mipRequested: pick.map((r) => +r2m(r).toFixed(2)),
    faceSizeAtMip: pick.map((r) => Math.pow(2, Math.floor(r2m(r)))),
  };
});
console.log('BAKED ROUGHNESS AT THE PLATE (ORM readback) + three roughnessToMip');
console.log(JSON.stringify(rough, null, 2));

// ---- 2. the roughness sweep ----------------------------------------------
if (OUTDIR) {
  await mkdir(OUTDIR, { recursive: true });
  const CROP = { x: 1496, y: 452, w: 176, h: 232 };
  for (const scale of [1.0, 0.55, 0.30, 0.18]) {
    await page.evaluate((s) => {
      const eng = window.__rrr.engine;
      eng.scene.traverse((o) => {
        if (/^end-mirror/.test(o.name || '')) { o.material.roughness = s; o.material.needsUpdate = false; }
      });
    }, scale);
    await page.evaluate(() => window.__rrr.settle(4));
    const buf = await page.locator('#rrr-canvas').screenshot({ clip: CROP });
    const f = `${OUTDIR}/${TAG}_rough${String(scale).replace('.', 'p')}.png`;
    await writeFile(f, buf);
    console.log(`wrote ${f}  ${(buf.length / 1024).toFixed(0)} kB`);
  }
}

await browser.close();
srv.kill();
