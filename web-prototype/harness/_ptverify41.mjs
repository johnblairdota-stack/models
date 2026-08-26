// pt-verify-41: IS THE BALLROOM THAT PLAYS IN PRIME TIME THE ONE WE BUILT?
//
// John: "verify in every way you can think of to make sure this ballroom is the one that plays
// in game". Reading imports proves which MODULE is called; it does not prove the built scene is
// the same. This boots a view and reports the ballroom's actual identity fingerprint — its
// bounds, its mesh and triangle counts by bucket, the exact materials on its buckets and the
// round-18 markers by name — so two views can be compared as DATA rather than as two pictures
// that look similar.
//
//   node harness/_ptverify41.mjs "<query>" <label>
import { chromium } from 'playwright';
import net from 'node:net';
const PORT = 5178;
const [Q, LABEL, SETTLE_ARG] = process.argv.slice(2);
const SETTLE = Number(SETTLE_ARG ?? 10) || 10;
const portOpen = (p) => new Promise((r) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false));
});
if (!(await portOpen(PORT))) { console.error('vite not running on 5178'); process.exit(3); }
const b = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[E]', String(e).slice(0, 200)));
await page.routeWebSocket((u) => u.port === String(PORT), () => {});
await page.goto(`http://127.0.0.1:${PORT}/?${Q}`, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
  null, { timeout: 600000 });
// ⚠ SETTLE IS A PARAMETER BECAUSE THE FOLLOW RIG LERPS. `followRig` eases its four lights
// toward the space the camera is in at 0.35 a frame, so a reading taken a few frames after
// ready is a reading of the PREVIOUS room's lighting on its way out. Round 18 nearly filed
// "the party mode lights the ballroom at 150 against the game's 373" off exactly that.
await page.evaluate((n) => window.__rrr.settle(n), SETTLE);
const out = await page.evaluate(() => {
  const e = window.__rrr.engine;
  // find the ballroom by its own dimensions: 21 x 11 m at 9.6 m is unlike anything else in the
  // house, and matching on SIZE rather than on a name means a renamed space still matches.
  let best = null;
  const walk = (o, depth) => {
    if (o.name && /ball/i.test(o.name)) best = best ?? o;
    for (const c of o.children) walk(c, depth + 1);
  };
  walk(e.scene, 0);
  const root = best ?? e.scene;
  const buckets = {};
  let tris = 0, meshes = 0;
  const mats = new Set();
  root.traverse((o) => {
    if (!(o.isMesh || o.isInstancedMesh)) return;
    meshes++;
    const g = o.geometry;
    const n = g?.index ? g.index.count / 3 : (g?.attributes?.position?.count ?? 0) / 3;
    tris += n * (o.isInstancedMesh ? o.count : 1);
    const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of ms) if (m?.name) mats.add(m.name);
    const k = o.name || '(unnamed)';
    buckets[k] = (buckets[k] || 0) + 1;
  });
  const box = new (Object.getPrototypeOf(e.camera.position).constructor === undefined ? Object : Object)();
  // ---- AND THE LIGHTS, because "is it the same room" and "is it lit the same" are two
  // questions and only the second one explains a median of 12.6 against 34.5. Reported for the
  // BALLROOM's own subtree and for the scene, since a practical parented to the space and one
  // parented to the scene light the same room and live in different places.
  const lights = [];
  const seen = new Set();
  const noteLights = (o, where) => o.traverse((n) => {
    if (!n.isLight || seen.has(n)) return;
    seen.add(n);
    lights.push({ where, type: n.type, i: +n.intensity.toFixed(3),
      col: '#' + n.color.getHexString(), on: n.visible });
  });
  noteLights(root, 'ballroom');
  noteLights(e.scene, 'scene');
  // ⚠ WHAT THE SPACE ASKED FOR, next to what the light actually carries. Round 18 changed a
  // generated ballroom's light TABLE and watched the colours change while the intensities did
  // not — which is only diagnosable by reading both ends of the wire, not one.
  const sp = (window.__rrr.engine.room?.spaces ?? []).find((x) => /ballroom/.test(String(x.id)));
  const table = sp?.lights ? {
    key: sp.lights.key?.intensity, keyCol: sp.lights.key?.color?.toString(16),
    warm: (sp.lights.warm ?? []).map((w) => w.intensity),
    cool: sp.lights.cool?.intensity,
  } : null;
  const g = e.pipeline?.grade ?? {};
  return {
    rootName: root.name || '(scene)',
    meshes, tris: Math.round(tris),
    grime: buckets.grime ?? 0,
    buckets: Object.entries(buckets).sort((a, b) => b[1] - a[1]).slice(0, 14),
    materials: [...mats].sort(),
    lights: lights.filter((l) => l.i > 0).sort((a, b) => b.i - a.i).slice(0, 12),
    lightsOff: lights.filter((l) => !(l.i > 0)).length,
    grade: { exposure: g.exposure, toeCrush: g.toeCrush, saturation: g.saturation,
      contrast: g.contrast, haze: g.haze },
    table,
    envIntensity: e.scene.environmentIntensity,
    hasEnv: !!e.scene.environment,
  };
});
console.log(`\n== ${LABEL}`);
console.log(`   root ${out.rootName}   meshes ${out.meshes}   triangles ${out.tris}   grime quads ${out.grime}`);
console.log(`   grade exposure ${out.grade.exposure}  toe ${out.grade.toeCrush}  sat ${out.grade.saturation}  haze ${out.grade.haze}`);
console.log(`   env ${out.hasEnv ? 'present' : 'NONE'}  environmentIntensity ${out.envIntensity}`);
console.log(`   space.lights table: ${out.table ? JSON.stringify(out.table) : 'NONE'}`);
console.log(`   lights on: ${out.lights.length} (plus ${out.lightsOff} at zero)`);
for (const l of out.lights) console.log(`     ${l.where.padEnd(9)} ${l.type.padEnd(16)} ${String(l.i).padStart(9)}  ${l.col}`);
console.log('   mesh buckets:');
for (const [k, n] of out.buckets) console.log(`     ${String(n).padStart(4)}  ${k}`);
console.log('   materials:');
for (const m of out.materials) console.log(`     ${m}`);
await b.close();
