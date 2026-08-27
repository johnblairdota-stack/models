/**
 * _ballroom-diff — what the ASSET ballroom has that PRIME TIME's ballroom does not.
 *
 *   node harness/_ballroom-diff.mjs
 *
 * John: *"I have asked it a few times to put the assets as we worked on it with much more details
 * and furniture into the Prime Time … it seems it still hasn't done it. The ballroom asset has
 * many more objects."*
 *
 * "Many more objects" is a countable claim, so this counts them instead of arguing about it. It
 * boots `?view=room.ballroom` (the hero asset) and the Prime Time follow camera, walks each
 * scene, and buckets every mesh by name. The output is the port list.
 *
 * A diagnostic, not a gate.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = 5193;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
});
async function waitPort(p, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await portOpen(p)) return; await sleep(200); }
  throw new Error(`never opened :${p}`);
}

const kids = [];
if (!(await portOpen(WEB))) {
  kids.push(spawn(process.execPath, [path.join(ROOT, 'harness/serve.mjs'), '--port', String(WEB), '--dir', 'dist'], { cwd: ROOT, stdio: 'ignore' }));
  await waitPort(WEB, 20000);
}
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

/** Bucket every mesh in a scene by a cleaned name, with triangle counts. */
const CENSUS = `(() => {
  // Walk UP to the true scene root. The first cut grabbed a space root's parent, which is a
  // CONTAINER, so Prime Time censused a subtree and reported 0 lights in a visibly lit room.
  let scene = window.__rrrScene
    || window.__rrrFollow?.room?.spaces?.[0]?.root
    || (window.__rrr && window.__rrr.engine && window.__rrr.engine.scene)
    || null;
  while (scene && scene.parent) scene = scene.parent;
  if (!scene) return { error: 'no scene handle' };
  const bag = {};
  let meshes = 0, tris = 0, lights = 0;
  scene.traverse((o) => {
    if (o.isLight) lights++;
    if (!o.isMesh && !o.isInstancedMesh) return;
    meshes++;
    const g = o.geometry;
    const n = g?.index ? g.index.count / 3 : (g?.attributes?.position?.count ?? 0) / 3;
    const inst = o.isInstancedMesh ? (o.count || 1) : 1;
    tris += n * inst;
    let key = String(o.name || o.parent?.name || 'unnamed').replace(/^kit:/, '').replace(/[._-]?\\d+$/, '');
    bag[key] = (bag[key] || 0) + inst;
  });
  return { meshes, tris: Math.round(tris), lights, bag, rootType: scene.type, rootName: scene.name || "(unnamed)" };
})()`;

async function census(url, waitFor) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(waitFor, null, { timeout: 300000, polling: 1000 }).catch(() => {});
  await sleep(3000);
  const out = await page.evaluate(CENSUS).catch((e) => ({ error: String(e).slice(0, 120) }));
  await page.close();
  return { ...out, errs: errs.slice(0, 3) };
}

const base = `http://127.0.0.1:${WEB}`;
console.log('\n  booting the ASSET ballroom…');
const asset = await census(`${base}/?view=room.ballroom`,
  () => !!(window.__rrrScene || (window.__rrr && window.__rrr.engine)));
console.log('  booting PRIME TIME…');
const prime = await census(`${base}/?view=party.follow&runner=p1&name=Hai&seed=1&throttle=WALK&still=1`,
  () => document.body.dataset.rrrFollow === 'live');

const line = (n, o) => console.log(`  ${n.padEnd(12)} ${o.error ? 'ERROR ' + o.error : `${o.meshes} meshes · ${o.tris} tris · ${o.lights} lights`}`);
console.log('');
line('asset', asset);
line('prime time', prime);

if (!asset.error && !prime.error) {
  const keys = [...new Set([...Object.keys(asset.bag), ...Object.keys(prime.bag)])].sort();
  const missing = keys.filter((k) => (asset.bag[k] || 0) > 0 && (prime.bag[k] || 0) === 0);
  const fewer = keys.filter((k) => (prime.bag[k] || 0) > 0 && (asset.bag[k] || 0) > (prime.bag[k] || 0));
  console.log('\n  IN THE ASSET, ABSENT FROM PRIME TIME:');
  for (const k of missing) console.log(`    ${k.padEnd(24)} ${asset.bag[k]}`);
  console.log('\n  PRESENT BUT THINNER IN PRIME TIME:');
  for (const k of fewer) console.log(`    ${k.padEnd(24)} asset ${asset.bag[k]} → prime ${prime.bag[k]}`);
  await mkdir(path.join(ROOT, 'progress', 'ballroom'), { recursive: true });
  await writeFile(path.join(ROOT, 'progress', 'ballroom', 'diff.json'),
    JSON.stringify({ asset, prime, missing, fewer }, null, 2));
  console.log('\n  written to progress/ballroom/diff.json');
}

await browser.close();
for (const k of kids) k.kill();
process.exit(0);
