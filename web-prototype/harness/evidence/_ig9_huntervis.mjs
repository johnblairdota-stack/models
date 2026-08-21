// critic-ingame: the hunter never appeared in any captured frame. Decide WHY: is it
// off-screen, culled, or genuinely not rendering? Projects its world position to screen
// space and counts visible meshes under its root.
// usage: node harness/evidence/_ig9_huntervis.mjs
import { chromium } from 'playwright';

const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)));

await p.goto('http://127.0.0.1:5192/?view=game.play&mesh=1&quality=medium&seed=s4',
  { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
  null, { timeout: 300000 });
await p.click('#rrr-play-btn');
await p.waitForTimeout(900);
const f1 = await p.evaluate(() => window.__rrr.engine.frame);
await p.waitForTimeout(600);
const f2 = await p.evaluate(() => window.__rrr.engine.frame);
console.log('frame advance', f1, '->', f2);

const rep = await p.evaluate(() => {
  const e = window.__rrr.engine, pl = e.player, hu = e.hunter, cam = e.camera;
  // walk the hunter subtree
  let meshes = 0, visMeshes = 0, inScene = 0;
  const names = [];
  hu.root.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) {
      meshes++;
      let v = o.visible, q = o.parent;
      while (v && q) { v = q.visible; q = q.parent; }
      if (v) visMeshes++;
      if (names.length < 8) names.push(`${o.name || o.type}:vis=${o.visible}`);
    }
  });
  // is the root actually attached up to the scene?
  { let q = hu.root; while (q.parent) q = q.parent; inScene = (q === e.scene) ? 1 : 0; }
  // project to screen
  const v = hu.root.position.clone(); v.y += 1.0;
  v.project(cam);
  return {
    meshes, visMeshes, inScene,
    rootVisible: hu.root.visible, stage: hu.stage,
    stageRigVisible: [1, 2, 3].map((s) => hu.rigs?.[s]?.root?.visible ?? null),
    hunterPos: [+hu.root.position.x.toFixed(1), +hu.root.position.z.toFixed(1)],
    playerPos: [+pl.pos.x.toFixed(1), +pl.pos.z.toFixed(1)],
    ndc: [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)],
    onScreen: Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z > -1 && v.z < 1,
    sample: names,
  };
});
console.log(JSON.stringify(rep, null, 1));
await b.close();
