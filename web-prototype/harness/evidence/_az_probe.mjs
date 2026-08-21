import { chromium } from 'playwright';
const q = process.argv[2] ?? 'solo=1&clip=merged&anim=Alert&azim=180';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://localhost:5178/?view=mesh.animated&capture=1&${q}`, { waitUntil: 'load' });
await page.waitForTimeout(9000);
const r = await page.evaluate(() => {
  const e = window.__rrr?.engine;
  if (!e) return { err: window.__rrrError ? String(window.__rrrError).split('\n')[0] : 'no engine' };
  const c = e.camera;
  let rigBox = null;
  e.scene.traverse((o) => { if (o.isSkinnedMesh && !rigBox) rigBox = o.name; });
  return {
    cam: c.position.toArray().map(v => +v.toFixed(3)),
    fov: c.fov,
    quat: c.quaternion.toArray().map(v => +v.toFixed(3)),
    skinned: rigBox,
    err: window.__rrrError ? String(window.__rrrError).split('\n')[0] : null,
  };
});
await browser.close();
console.log(JSON.stringify(r));
