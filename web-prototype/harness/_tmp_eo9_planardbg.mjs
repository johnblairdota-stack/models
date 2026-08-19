/**
 * estate-owner-9 scratch — two decisive checks on the ballroom planar reflection, both of
 * which the first version of this probe got wrong and reported as nothing:
 *
 *   1. IS THE TARGET DARK? Blit the planar render target to the canvas. ⚠ The engine's own
 *      rAF loop repaints every frame, so a blit followed by a screenshot photographs the
 *      NEXT beauty frame, not the blit. Cancel `engine._raf` first.
 *   2. IS THE PATCH IN THE PROGRAM? Re-patch the plate material to return flat magenta and
 *      force one render. If the plate is not magenta the replace anchor never matched.
 *      ⚠ `pipeline.render` takes ELAPSED MILLISECONDS, not (scene, camera).
 *
 *   node harness/_tmp_eo9_planardbg.mjs --outdir C:/tmp/dbg
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const OUTDIR = opt('outdir', '.');
const PORT = Number(opt('port', '5195'));

const srv = spawn(process.execPath, ['harness/serve.mjs', '--port', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1800));
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e.message ?? e)));
await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1&quality=medium`,
  { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(
  () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
  null, { timeout: 240000 });
await page.evaluate(() => window.__rrr.settle(6));
await mkdir(OUTDIR, { recursive: true });

// ---- freeze the loop -------------------------------------------------------
await page.evaluate(() => {
  const eng = window.__rrr.engine;
  if (eng._raf) cancelAnimationFrame(eng._raf);
  eng._raf = null;
});

// ---- 1. blit the planar target --------------------------------------------
const blit = await page.evaluate(() => {
  const eng = window.__rrr.engine;
  let plate = null;
  eng.scene.traverse((o) => { if (o.name === 'end-mirror.r') plate = o; });
  const tex = plate.material.userData?.planarUniforms?.uEoMap?.value;
  if (!tex) return 'no planar texture';
  let basicSrc = null;
  eng.scene.traverse((o) => {
    if (!basicSrc && o.isMesh && o.material && o.material.isMeshBasicMaterial) basicSrc = o.material;
  });
  if (!basicSrc) return 'no MeshBasicMaterial to clone';
  const mat = basicSrc.clone();
  mat.map = tex; mat.color.setRGB(1, 1, 1);
  mat.transparent = false; mat.fog = false; mat.vertexColors = false;
  mat.depthTest = false; mat.depthWrite = false; mat.needsUpdate = true;
  const Scene = eng.scene.constructor;
  const Mesh = plate.constructor;
  const Geo = plate.geometry.constructor;
  const Cam = eng.camera.constructor;
  const sc = new Scene();
  const ar = tex.image.width / tex.image.height;
  sc.add(new Mesh(new Geo(2 * ar, 2), mat));
  const cam = new Cam(90, eng.camera.aspect, 0.1, 10);
  cam.position.set(0, 0, 1); cam.lookAt(0, 0, 0); cam.updateProjectionMatrix();
  eng.renderer.setRenderTarget(null);
  eng.renderer.autoClear = true;
  eng.renderer.render(sc, cam);
  return `ok ${tex.image.width}x${tex.image.height}`;
});
console.log('BLIT', blit);
await writeFile(`${OUTDIR}/planar_rt_blit.png`, await page.locator('#rrr-canvas').screenshot());

// ---- 2. does the anchor match? force magenta ------------------------------
const report = await page.evaluate(() => {
  const eng = window.__rrr.engine;
  const out = { plates: [] };
  eng.scene.traverse((o) => {
    if (!/^end-mirror/.test(o.name || '')) return;
    const m = o.material;
    const prev = m.onBeforeCompile;
    const r = { name: o.name };
    m.onBeforeCompile = function (shader, renderer) {
      if (prev) prev.call(this, shader, renderer);
      r.fragHasUEoMap = shader.fragmentShader.indexOf('uEoMap') >= 0;
      r.vertHasVEoWorld = shader.vertexShader.indexOf('vEoWorld') >= 0;
      r.anchorStillPresent = shader.fragmentShader.indexOf(
        'vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );') >= 0;
      r.hasCubeUVDefine = shader.fragmentShader.indexOf('ENVMAP_TYPE_CUBE_UV') >= 0;
      r.uEoUniforms = Object.keys(shader.uniforms).filter((k) => k.indexOf('uEo') === 0);
      // force the planar term to flat magenta so the plate answers by eye as well
      shader.fragmentShader = shader.fragmentShader
        .replace('vec3 eoPlanar = texture2D( uEoMap, clamp( eoUv, 0.002, 0.998 ) ).rgb;',
          'vec3 eoPlanar = vec3( 4.0, 0.0, 4.0 );');
      r.magentaInjected = shader.fragmentShader.indexOf('vec3 eoPlanar = vec3( 4.0, 0.0, 4.0 );') >= 0;
    };
    m.needsUpdate = true;
    out.plates.push(r);
  });
  eng.pipeline.render(0);
  return out;
});
console.log('ANCHOR / MAGENTA');
console.log(JSON.stringify(report, null, 2));
await writeFile(`${OUTDIR}/plate_magenta.png`, await page.locator('#rrr-canvas').screenshot());
console.log(`wrote ${OUTDIR}/planar_rt_blit.png and ${OUTDIR}/plate_magenta.png`);

await browser.close();
srv.kill();
