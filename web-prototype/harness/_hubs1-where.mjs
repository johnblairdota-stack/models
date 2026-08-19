/*
 * builder-hubs: WHERE IS THE SHOULDER FIXTURE ON SCREEN, AND IS THE DARK CIRCLE EVEN IT?
 *
 * Three explanations for "the white fixture reads as a dark hole" have now been measured and
 * killed: the shape (rewritten twice, no change), the material (`_hubs1-shellmap.mjs` — albedo
 * luma 237 and ORM identical to the plate beside it) and shadowing (`?fixcast=0&?fixrecv=0`
 * renders pixel-identical). Each of those assumed the dark circle IS the fixture. Nothing has
 * ever checked that, so this projects the part's own world position through the capture camera
 * and prints the pixel it lands on, with its radius, so the assumption can be tested instead of
 * inherited.
 *
 * usage: node harness/_hubs1-where.mjs [port] [azim]
 */
import { chromium } from 'playwright';

const PORT = process.argv[2] ?? '5192';
const AZ = process.argv[3] ?? '0';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`http://localhost:${PORT}/?view=mesh.animated&capture=1&solo=1&clip=merged&anim=Alert&label=0&azim=${AZ}`,
  { waitUntil: 'load' });
await page.waitForFunction(() => window.__rrr?.engine || window.__rrrError, null, { timeout: 180000 });
await page.evaluate(() => window.__rrr.settle(30));

const r = await page.evaluate(() => {
  const e = window.__rrr.engine;
  const cam = e.camera;
  const W = e.canvas.width, H = e.canvas.height;
  const V = cam.position.constructor;                 // THREE.Vector3, off an existing instance

  const names = ['capFixtureFL', 'capFixtureBL', 'capFixtureFR', 'elbowActOL', 'kneeActL'];
  const out = { canvas: [W, H], cam: cam.position.toArray().map(v => +v.toFixed(3)), parts: {} };
  const caps = [];
  e.scene.traverse((o) => {
    if (/^shoulderCap/i.test(o.name) || /cap/i.test(o.name)) caps.push(o.name);
    if (!names.includes(o.name)) return;
    o.updateWorldMatrix(true, false);
    const p = new V();
    o.getWorldPosition(p);
    const s = p.clone().project(cam);
    // world-space radius -> approximate pixel radius
    const g = o.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    const scale = new V(); o.getWorldScale(scale);
    const rad = g.boundingSphere.radius * scale.x;
    const edge = p.clone(); edge.x += rad;
    const es = edge.project(cam);
    out.parts[o.name] = {
      world: p.toArray().map(v => +v.toFixed(4)),
      px: [Math.round((s.x * 0.5 + 0.5) * W), Math.round((-s.y * 0.5 + 0.5) * H)],
      inFrontOfCam: s.z < 1,
      radiusWorld: +rad.toFixed(4),
      radiusPx: Math.round(Math.abs(es.x - s.x) * 0.5 * W),
      visible: o.visible,
      material: o.material.uuid.slice(0, 8),
    };
  });
  out.capNames = [...new Set(caps)];
  return out;
});

await browser.close();
console.log(JSON.stringify(r, null, 1));
