#!/usr/bin/env node
/**
 * PHOTOGRAPH THE EAR'S SHAPE, ON THE REAL BUILT GEOMETRY, UNDER A LIGHT THIS ROUND OWNS.
 *
 *   node harness/_fd5_earshape.mjs --out <dir>
 *
 * ⚠️ WHY NOT `shoot.mjs`. Measured on this build, `mesh.animated` currently ships every one of
 * its three DirectionalLights at intensity 0 and `scene.environmentIntensity` at 0 — another
 * agent is re-lighting that view and `_studio.js` in this same session. A straight capture comes
 * back black except for the emissive faceplate, and `char.turnaround` on the same build renders
 * correctly, so the blackness is theirs and not this round's geometry.
 *
 * A SHAPE claim cannot be judged on a black frame. So this renders the SAME scene, with the SAME
 * materials and the SAME built parts, through a camera and a light rig belonging to the harness,
 * and grabs the pixels inside the same evaluate — the engine's own rAF would otherwise repaint
 * the canvas before `page.screenshot()` ever saw it, which is exactly why an earlier attempt to
 * move `engine.camera` produced a correctly-moved camera and an unchanged picture.
 *
 * ⚠️ WHAT THIS IS AND IS NOT EVIDENCE FOR. It is evidence that the ear is a chrome RING with a
 * WHITE DISC centre and that it is seated in the skull. It is NOT evidence about brightness, hue,
 * contrast or how the chrome reads — the key is a camera-mounted headlight so all four angles are
 * legible, which is the opposite of the fixed-light convention the four baselines were shot in.
 * That comparison has to be re-run once the relight lands.
 */
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const OUTDIR = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : 'progress/shots';
const KNOBS = process.argv.includes('--knobs');
await mkdir(OUTDIR, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });

const shootOne = async (query, tag, azims) => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).split('\n')[0]));
  await page.goto(`http://localhost:5183/?view=mesh.animated&capture=1&solo=1&clip=merged` +
    `&anim=Alert&label=0&azim=0${query}`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
    null, { timeout: 180000 });
  await page.waitForTimeout(3500);

  for (const azim of azims) {
    const url = await page.evaluate((az) => {
      const e = window.__rrr.engine;
      const ears = [];
      e.scene.traverse((o) => { if (/^ear[LR]$/.test(o.name)) ears.push(o); });
      if (ears.length < 2) return { err: `found ${ears.length} ear parts` };

      const t = { x: 0, y: 0, z: 0 };
      for (const o of ears) {
        o.updateWorldMatrix(true, false);
        const m = o.matrixWorld.elements;
        t.x += m[12] / 2; t.y += m[13] / 2; t.z += m[14] / 2;
      }

      // Constructors off live objects — the page exposes the engine, not three.js.
      let donor = null;
      e.scene.traverse((o) => { if (!donor && o.isDirectionalLight) donor = o; });
      if (!donor) return { err: 'no DirectionalLight to clone' };

      /*
       * ⚠️ THE FIRST CUT OF THIS RIG BLEW EVERY SURFACE TO PURE WHITE. env 1.0 plus 3.0/1.2/0.7
       * of directional put chrome and shell both at 255, which destroys the one distinction the
       * picture exists to show. Calibrating the INSTRUMENT is not tuning the character: nothing
       * below reaches a material, a value or a light that ships.
       */
      const savedEnv = e.scene.environmentIntensity;
      e.scene.environmentIntensity = 0.55;

      const a = (az * Math.PI) / 180;
      const R = 0.95;
      const cx = t.x + Math.sin(a) * R;
      const cz = t.z + Math.cos(a) * R;
      const cam = new (e.camera.constructor)(20, 1600 / 1000, 0.01, 40);
      cam.position.set(cx, t.y + 0.03, cz);
      cam.lookAt(t.x, t.y, t.z);
      cam.updateProjectionMatrix();

      /*
       * A CAMERA-MOUNTED KEY plus two fixed fills. The headlight is what makes all four angles
       * legible at once; it is also why nothing here is a statement about how the character is
       * lit. Labelled in the filename so no one mistakes this for a look capture.
       */
      const added = [];
      const mk = (i, x, y, z) => {
        const l = new donor.constructor(0xffffff, i);
        l.position.set(x, y, z);
        l.target.position.set(t.x, t.y, t.z);
        l.castShadow = false;
        e.scene.add(l); e.scene.add(l.target);
        added.push(l, l.target);
      };
      mk(0.85, cx + Math.sin(a + 0.6) * 0.9, t.y + 0.55, cz + Math.cos(a + 0.6) * 0.9);
      mk(0.35, cx - Math.sin(a + 1.4) * 0.9, t.y - 0.25, cz - Math.cos(a + 1.4) * 0.9);
      mk(0.20, t.x, t.y + 1.4, t.z);

      e.renderer.render(e.scene, cam);
      const data = e.renderer.domElement.toDataURL('image/png');

      for (const o of added) e.scene.remove(o);
      e.scene.environmentIntensity = savedEnv;
      return { data };
    }, azim);

    if (url.err) { console.log(`  azim ${azim}: ${url.err}`); continue; }
    const out = path.join(OUTDIR, `fd5_ear${tag}_azim${azim}_SHAPEONLY.png`);
    await writeFile(out, Buffer.from(url.data.split(',')[1], 'base64'));
    console.log('  wrote', out);
  }
  if (errs.length) console.log('  page errors:', errs.slice(0, 3));
  await page.close();
};

console.log('\nshipped default (eardisc=0.30, earinner=1.02):');
await shootOne('', '', [0, 90, -90, 180]);

if (KNOBS) {
  /*
   * THE SWEEP. `eardisc` (how far the white centre is set back, as a fraction of the ear's
   * proudness) and `earinner` (the disc's radius against the ring's inner wall) are the two free
   * parameters this round introduced. Quoting the default without showing the neighbours is the
   * thing John's first rule forbids.
   */
  for (const v of ['0', '0.15', '0.55', '0.85']) {
    console.log(`\neardisc=${v}:`);
    await shootOne(`&eardisc=${v}`, `_disc${v}`, [90]);
  }
  for (const v of ['0.70', '1.30']) {
    console.log(`\nearinner=${v}:`);
    await shootOne(`&earinner=${v}`, `_inner${v}`, [90]);
  }
}
await browser.close();
