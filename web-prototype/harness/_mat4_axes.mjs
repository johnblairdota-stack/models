#!/usr/bin/env node
/**
 * AXIS PROBE for the material-family round.
 *
 * Three questions this round cannot be built without, and all three have a plausible-looking
 * wrong answer:
 *
 *  1. Which model axis is the character's FRONT? The shoulder-cap swing window in
 *     `mesh-identity.js` is parameterised in a swing angle `f` whose sign means "forward" only
 *     if +z is forward. Restricting teal to the front/outer face is a change to the SIGN of that
 *     window's lower bound, so getting this backwards puts the teal on the BACK — which still
 *     renders as a plausible two-tone shoulder from the front (a white cap) and is exactly the
 *     class of error that ships.
 *  2. Which model axis is the character's LEFT? The inner-thigh chrome is a facing test, and it
 *     needs the body's own left-right axis, not a guess.
 *  3. Where does the shoulder cap ACTUALLY sit in z right now? Reading the built vertices is the
 *     only statement about the window that is not a re-reading of the same comment.
 *
 * Runs against the PRODUCTION build on :5179 (`npm run build && npm run preview`), which is the
 * URL MESH.bat opens — not the dev server, whose module rewriting has garbled this project's
 * shader strings before.
 *
 *   node harness/_mat4_axes.mjs
 */
import { chromium } from 'playwright';

const URL = 'http://localhost:5179/?view=mesh.animated&capture=1&solo=1&clip=merged&anim=Alert&label=0';

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=gl'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error('PAGEERROR', String(e).split('\n')[0]));
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__rrr?.engine, null, { timeout: 120000 });
await page.waitForTimeout(6000);

const r = await page.evaluate(() => {
  const e = window.__rrr?.engine;
  if (!e) return { err: 'no engine' };
  const THREE = window.__rrr.THREE ?? null;
  const out = { bones: [], parts: [], err: null };

  let body = null;
  const named = {};
  e.scene.traverse((o) => {
    if (o.isSkinnedMesh) {
      named[o.name] = o;
      if (!body && o.skeleton && o.skeleton.bones.length > 4) body = o;
    }
  });
  if (!body) return { err: 'no skinned body' };

  const wp = (o) => { const v = { x: 0, y: 0, z: 0 }; o.updateWorldMatrix(true, false); const m = o.matrixWorld.elements; return { x: m[12], y: m[13], z: m[14] }; };

  for (const b of body.skeleton.bones) {
    const p = wp(b);
    out.bones.push({
      n: b.name,
      d: (() => { let d = 0; for (let q = b; q; q = q.parent) d++; return d; })(),
      p: [+p.x.toFixed(4), +p.y.toFixed(4), +p.z.toFixed(4)],
      parent: b.parent && b.parent.isBone ? b.parent.name : null,
    });
  }

  // Every skinned part in the scene, with its world-space bbox — this is where the mint caps are.
  for (const [name, o] of Object.entries(named)) {
    const g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox;
    out.parts.push({
      n: name, verts: g.attributes.position.count,
      min: [+bb.min.x.toFixed(4), +bb.min.y.toFixed(4), +bb.min.z.toFixed(4)],
      max: [+bb.max.x.toFixed(4), +bb.max.y.toFixed(4), +bb.max.z.toFixed(4)],
      mat: o.material && o.material.name ? o.material.name : '',
    });
  }

  // THE FACE PLATE is the unambiguous statement of which way is FRONT: it is a separate part,
  // it is on the face, and no comment is involved. Same for the wordmark on the chest.
  // Report the cap's z extent RELATIVE to the arm joint so the swing window can be read off it.
  const capZ = {};
  for (const [name, o] of Object.entries(named)) {
    if (!/cap/i.test(name)) continue;
    const pos = o.geometry.attributes.position;
    let zmin = 1e9, zmax = -1e9, xmin = 1e9, xmax = -1e9;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i), x = pos.getX(i);
      if (z < zmin) zmin = z; if (z > zmax) zmax = z;
      if (x < xmin) xmin = x; if (x > xmax) xmax = x;
    }
    capZ[name] = { zmin: +zmin.toFixed(4), zmax: +zmax.toFixed(4), xmin: +xmin.toFixed(4), xmax: +xmax.toFixed(4) };
  }
  out.capZ = capZ;
  out.camera = { pos: e.camera.position.toArray().map((v) => +v.toFixed(3)) };
  return out;
});

await browser.close();
console.log(JSON.stringify(r, null, 1));
