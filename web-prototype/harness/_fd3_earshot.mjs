#!/usr/bin/env node
/**
 * SHOOT THE EAR'S SHAPE, UNDER A LIGHT THIS ROUND CONTROLS.
 *
 *   node harness/_fd3_earshot.mjs            report the view's lighting state only
 *   node harness/_fd3_earshot.mjs --shoot    write the four matched-angle head crops
 *
 * ⚠️ WHY THIS EXISTS RATHER THAN A PLAIN `shoot.mjs` RUN. `mesh.animated` and `_studio.js` are
 * being RE-LIT by another agent in the same session, and a straight capture of `?azim=90` came
 * back with the subject essentially black — only the emissive faceplate visible. That is their
 * work in flight, not this round's geometry: `char.turnaround` on the same build renders
 * correctly, and this round changed no material, no light and no value.
 *
 * The claim being made is about SHAPE — is the ear a chrome RING with a WHITE DISC centre, or is
 * it still a plate. A shape claim must not be judged on a black frame, and it must not be judged
 * on a tuned one either. So this instrument adds a NEUTRAL light of its own, frames the head, and
 * says so in the filename. TONE, HUE and BRIGHTNESS on this character belong to the relight agent
 * and nothing here is evidence about any of them.
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOOT = process.argv.includes('--shoot');
const OUTDIR = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : path.join(ROOT, 'progress', 'shots');
const BASE = 'http://localhost:5183';
const AZIMS = SHOOT ? [0, 90, -90, 180] : [90];

const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });

for (const azim of AZIMS) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).split('\n')[0]));
  await page.goto(`${BASE}/?view=mesh.animated&capture=1&solo=1&clip=merged&anim=Alert&label=0&azim=${azim}`,
    { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
    null, { timeout: 180000 });
  await page.waitForTimeout(4000);

  const state = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e) return { err: 'no engine' };
    const lights = [];
    e.scene.traverse((o) => {
      if (!o.isLight) return;
      lights.push({ type: o.type, name: o.name, intensity: o.intensity,
        colour: o.color ? `#${o.color.getHexString()}` : null,
        pos: [+o.position.x.toFixed(2), +o.position.y.toFixed(2), +o.position.z.toFixed(2)] });
    });
    return {
      lights,
      env: !!e.scene.environment,
      envIntensity: e.scene.environmentIntensity ?? null,
      background: e.scene.background ? (e.scene.background.isColor ? `#${e.scene.background.getHexString()}` : 'texture') : null,
      exposure: e.renderer?.toneMappingExposure ?? null,
      toneMapping: e.renderer?.toneMapping ?? null,
    };
  });
  console.log(`\nazim ${azim} — lighting as the view currently ships it:`);
  console.log('  exposure', state.exposure, ' toneMapping', state.toneMapping,
    ' env', state.env, ' envIntensity', state.envIntensity, ' bg', state.background);
  for (const l of state.lights ?? []) {
    console.log(`  ${String(l.type).padEnd(18)} i=${String(l.intensity).padEnd(8)} ${l.colour} at ${l.pos.join(',')}`);
  }

  if (!SHOOT) { await page.close(); continue; }

  /*
   * THE HARNESS LIGHT. Built by cloning a light already in the scene — the page exposes the
   * engine, not three.js, so `new THREE.DirectionalLight` is not available here and
   * `light.constructor` is. Two keys and a fill, deliberately flat and white: this is a SHAPE
   * reading, and a rig with any opinion in it would be making the tonal argument that belongs to
   * the relight agent.
   */
  const lit = await page.evaluate(() => {
    const e = window.__rrr.engine;
    let donor = null;
    e.scene.traverse((o) => { if (!donor && o.isDirectionalLight) donor = o; });
    if (!donor) return { ok: false, why: 'no DirectionalLight in the scene to clone' };
    const made = [];
    for (const [x, y, z, i] of [[3, 3, 4, 2.4], [-3, 2, -3, 1.4], [0, 4, 0, 0.9]]) {
      const l = new donor.constructor(0xffffff, i);
      l.position.set(x, y, z);
      l.castShadow = false;
      l.name = 'fd3_probe_light';
      e.scene.add(l);
      made.push(i);
    }
    e.renderer.toneMappingExposure = Math.max(e.renderer.toneMappingExposure ?? 1, 1.0);
    return { ok: true, made };
  });
  if (!lit.ok) console.log('  LIGHT:', lit.why);

  /*
   * FRAME THE HEAD. The ear is a side-view feature about 12 cm across on a 1.7 m figure, so a
   * full-body 1080p frame gives it ~40 px and `--review` would destroy it outright. The camera is
   * set from the EAR PART'S OWN world position rather than from a guess at head height, so this
   * cannot quietly photograph the shoulder.
   */
  const framed = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const ears = [];
    e.scene.traverse((o) => { if (/^ear[LR]$/.test(o.name)) ears.push(o); });
    if (ears.length < 2) return { ok: false, why: `found ${ears.length} ear parts, expected 2` };
    /*
     * Target the MIDPOINT of the two ears. `?azim=` turns the SUBJECT, so a single ear's world
     * position swings with it and the crop would drift off the head at 90 and 180; the midpoint
     * is on the rotation axis and does not move.
     */
    const t = { x: 0, y: 0, z: 0 };
    for (const o of ears) {
      o.updateWorldMatrix(true, false);
      const m = o.matrixWorld.elements;
      t.x += m[12] / 2; t.y += m[13] / 2; t.z += m[14] / 2;
    }
    /*
     * DOLLY ALONG THE VIEW'S OWN CAMERA AXIS, do not orbit. `?azim=` exists precisely so the
     * SUBJECT turns under FIXED lights, which is the convention the four baselines were shot in.
     * Orbiting the camera instead would keep one side of the character lit at every angle and
     * quietly turn four matched views into four pictures of the same lighting.
     */
    const cam = e.camera;
    const d = { x: cam.position.x - t.x, y: cam.position.y - t.y, z: cam.position.z - t.z };
    const L = Math.hypot(d.x, d.y, d.z) || 1;
    const r = 0.62;
    cam.position.set(t.x + (d.x / L) * r, t.y + (d.y / L) * r, t.z + (d.z / L) * r);
    cam.lookAt(t.x, t.y, t.z);
    cam.fov = 30;
    cam.updateProjectionMatrix();
    return { ok: true, target: [+t.x.toFixed(4), +t.y.toFixed(4), +t.z.toFixed(4)] };
  });
  if (!framed.ok) { console.log('  FRAME:', framed.why); await page.close(); continue; }
  console.log('  framed on', framed.target.join(', '));

  await page.waitForTimeout(2500);
  const out = path.join(OUTDIR, `fd3_ear_azim${azim}_HARNESSLIT.png`);
  await page.screenshot({ path: out, animations: 'disabled' });
  console.log('  wrote', out);
  if (errs.length) console.log('  page errors:', errs.slice(0, 3));
  await page.close();
}
await browser.close();
