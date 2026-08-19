/**
 * estate-owner-8 scratch probe — the ballroom end mirrors.
 *
 * Two jobs, and the second is the one that matters:
 *
 * 1. IDENTIFY THE PLATES BY MEASUREMENT. The round brief and the critic's hate line disagree
 *    about which of the two plates is "far". Reports each plate's world position, its distance
 *    from the capture camera, its screen-space centre and its angular size, so the argument
 *    ends.
 *
 * 2. RENDER WHAT A PERFECT PLANAR REFLECTION WOULD SHOW. Reflect the capture camera about the
 *    plate's own (raked) plane, point it back at the plate centre, set the vertical fov to the
 *    plate's exact angular height and the aspect to the plate's shape — so the frame IS the
 *    plate, at whatever resolution we ask for, with zero probe approximation. That separates
 *    "the cube map is too coarse / parallax-wrong" from "the plate is aimed at something with
 *    nothing in it", which no amount of turning knobs on the probe can do.
 *
 *   node harness/_tmp_eo8_mirror.mjs --plate r --out C:/tmp/planar_r.png
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const has = (n) => argv.includes(`--${n}`);
const VIEW = opt('view', 'room.ballroom');
const PLATE = opt('plate', 'r');
const OUT = opt('out', null);
const RESW = Number(opt('resw', '340'));
const PORT = Number(opt('port', '5197'));

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

// ---- 1. identify ---------------------------------------------------------
const facts = await page.evaluate(() => {
  const eng = window.__rrr.engine;
  const cam = eng.camera;
  const V3 = cam.position.constructor;
  const rows = [];
  eng.scene.traverse((o) => {
    if (!o.isMesh || !/^end-mirror|^pier-mirrors/.test(o.name || '')) return;
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    const c = new V3((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2);
    o.localToWorld(c);
    const dist = c.distanceTo(cam.position);
    const ndc = c.clone().project(cam);
    const w = bb.max.x - bb.min.x, h = bb.max.y - bb.min.y;
    rows.push({
      name: o.name,
      world: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)],
      camDist: +dist.toFixed(2),
      screenPx: [Math.round((ndc.x * 0.5 + 0.5) * 1920), Math.round((-ndc.y * 0.5 + 0.5) * 1080)],
      plateWH: [+w.toFixed(2), +h.toFixed(2)],
      angularDeg: [+(2 * Math.atan(w / 2 / dist) * 180 / Math.PI).toFixed(2),
        +(2 * Math.atan(h / 2 / dist) * 180 / Math.PI).toFixed(2)],
      // how many screen pixels the plate covers at 1920x1080, fov 66 vertical
      screenWH: [
        Math.round(w / dist / (2 * Math.tan(cam.fov * Math.PI / 360) * cam.aspect) * 1920),
        Math.round(h / dist / (2 * Math.tan(cam.fov * Math.PI / 360)) * 1080),
      ],
      envMap: o.material?.envMap ? (o.material.envMap.image?.[0]?.width ?? o.material.envMap.image?.width ?? '?') : null,
      envMapIntensity: o.material?.envMapIntensity ?? null,
      roughness: o.material?.roughness ?? null,
    });
  });
  return rows;
});
console.log('PLATES');
console.log(JSON.stringify(facts, null, 2));

// ---- 2. the perfect planar reflection ------------------------------------
if (OUT) {
  const setup = await page.evaluate(({ PLATE }) => {
    const eng = window.__rrr.engine;
    const cam = eng.camera;
    const V3 = cam.position.constructor;
    let plate = null;
    eng.scene.traverse((o) => { if (o.name === `end-mirror.${PLATE}`) plate = o; });
    if (!plate) return { err: 'plate not found' };
    plate.geometry.computeBoundingBox();
    const bb = plate.geometry.boundingBox;
    const P = new V3((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2);
    plate.localToWorld(P);
    // ⚠ THE RAKE IS BAKED INTO THE GEOMETRY, NOT INTO THE TRANSFORM. room-ballroom.js builds
    // the plate with geometry.applyMatrix4(translate * rotateX(rake) * ...), so matrixWorld is
    // IDENTITY and taking the normal from it returns a flat (0,0,1) — an unraked mirror plane,
    // i.e. exactly the reflection the last three rounds were trying to get away from. Read the
    // normal off the geometry's own normal attribute instead.
    const na = plate.geometry.attributes.normal;
    const n = new V3(na.getX(0), na.getY(0), na.getZ(0))
      .transformDirection(plate.matrixWorld).normalize();

    const refPt = (p) => p.clone().sub(n.clone().multiplyScalar(2 * p.clone().sub(P).dot(n)));
    const refDir = (d) => d.clone().sub(n.clone().multiplyScalar(2 * d.dot(n)));

    const camPos0 = cam.position.clone();
    const up0 = cam.up.clone();
    const fov0 = cam.fov, aspect0 = cam.aspect;

    const mPos = refPt(camPos0);
    const dist = mPos.distanceTo(P);
    const h = bb.max.y - bb.min.y, w = bb.max.x - bb.min.x;

    // the mirrored camera sees the plate at exactly the plate's angular size
    cam.position.copy(mPos);
    cam.up.copy(refDir(up0));
    cam.lookAt(P);
    cam.fov = 2 * Math.atan((h / 2) / dist) * 180 / Math.PI;
    cam.aspect = (w / h);
    // ⚠ A MIRRORED CAMERA IS BEHIND THE WALL THE MIRROR IS HUNG ON, so without clipping it
    // photographs the BACK of that wall and returns a flat brown field — which looks exactly
    // like "the reflection has nothing in it" and is nothing of the kind. A real planar
    // reflection uses an oblique near plane on the mirror plane; at this fov the plate spans
    // only ~0.3 m of depth, so a flat near plane 0.30 m short of it clips the wall (0.49 m
    // nearer) and keeps the whole plate. Stated because it is the trap in this technique.
    cam.near = dist - 0.30;
    cam.far = 90;
    cam.updateProjectionMatrix();
    // hide both plates so the mirrored camera does not photograph the glass itself
    eng.scene.traverse((o) => { if (/^end-mirror|^pier-mirrors/.test(o.name || '')) o.userData._wasVis = o.visible, o.visible = false; });
    return {
      plate: `end-mirror.${PLATE}`,
      normal: [+n.x.toFixed(4), +n.y.toFixed(4), +n.z.toFixed(4)],
      plateCentre: [+P.x.toFixed(2), +P.y.toFixed(2), +P.z.toFixed(2)],
      mirroredCam: [+mPos.x.toFixed(2), +mPos.y.toFixed(2), +mPos.z.toFixed(2)],
      distToPlate: +dist.toFixed(2),
      fovDeg: +cam.fov.toFixed(2), aspect: +cam.aspect.toFixed(3),
      origCam: [+camPos0.x.toFixed(2), +camPos0.y.toFixed(2), +camPos0.z.toFixed(2)],
      origFov: fov0, origAspect: +aspect0.toFixed(3),
    };
  }, { PLATE });
  console.log('PLANAR SETUP');
  console.log(JSON.stringify(setup, null, 2));

  // Render at the plate's own aspect. The engine forces 1920x1080 in capture mode, so resize
  // the canvas element only and let the renderer/pipeline follow.
  const resH = Math.round(RESW / setup.aspect);
  await page.evaluate(({ w, h }) => {
    const eng = window.__rrr.engine;
    eng.renderer.setSize(w, h, false);
    eng.pipeline.setSize(w, h);
    eng.canvas.style.width = w + 'px';
    eng.canvas.style.height = h + 'px';
    // aspect/fov were set above; do NOT let _resize stomp them
    eng.camera.updateProjectionMatrix();
  }, { w: RESW, h: resH });
  await page.evaluate(() => window.__rrr.settle(6));
  const buf = await page.locator('#rrr-canvas').screenshot();
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, buf);
  console.log(`wrote ${OUT}  ${RESW}x${resH}  ${(buf.length / 1024).toFixed(0)} kB`);
}

await browser.close();
srv.kill();
