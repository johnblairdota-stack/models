#!/usr/bin/env node
/**
 * THE DELIVERY CHECK for `aBoneLocal` / `aBoneId` and for the rebuilt ear.
 *
 *   node harness/_fd2_delivered.mjs
 *
 * `harness/_fd1_frames.mjs` proves the arithmetic in node. This proves the arithmetic ARRIVED —
 * it reads the attribute buffers off the real scene in a real browser and recomputes the forearm
 * control from the DELIVERED floats, not from the source that was supposed to write them. A
 * correctly-derived number can still ship wrong.
 *
 * Runs against the PRODUCTION build on :5179 (`npm run build && npm run preview`), which is the
 * URL MESH.bat opens — not the dev server, whose module rewriting has garbled this project's
 * source before.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5183';
// NOT `capture=1`. The mesh avatar hangs off `engine.player`, which only exists once the live
// loop is running and the play gate has been dismissed — a capture-mode page reports an empty
// scene and would have passed this probe by finding nothing to disagree with.
const GAME = `${BASE}/?view=game.play&mesh=1&quality=medium`;
const MESH = `${BASE}/?view=mesh.animated&capture=1&solo=1&clip=merged&anim=Alert&label=0`;

const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });

// ---------------------------------------------------------------- the attributes, in the game
await page.goto(GAME, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__rrr?.engine, null, { timeout: 180000 });
await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
await page.waitForTimeout(9000);

const att = await page.evaluate(() => {
  const e = window.__rrr?.engine;
  if (!e) return { err: 'no engine' };
  if (!e.player?.avatar) return { err: `no mesh avatar on the player (player: ${!!e.player})` };
  const skins = [];
  e.player.avatar.root.traverse((o) => { if (o.isSkinnedMesh) skins.push(o); });
  if (!skins.length) return { err: 'no skinned mesh in the scene — did ?mesh=1 reach the player?' };

  const out = { meshes: [], err: null };
  let sk = null;
  for (const m of skins) {
    const g = m.geometry;
    const has = ['aBoneLocal', 'aBoneId', 'aBoneLocal2', 'aBoneId2', 'aBoneBlend']
      .filter((n) => !!g.getAttribute(n));
    out.meshes.push({ name: m.name, verts: g.attributes.position.count, has });
    if (!sk && m.skeleton) sk = m.skeleton;
  }
  if (!sk) return { err: 'no skeleton' };
  out.summary = e.player.avatar.boneLocal ?? null;

  // ---- recompute the control off the DELIVERED buffers
  const nameOf = (i) => sk.bones[i]?.name ?? `#${i}`;
  const per = new Map();
  for (const m of skins) {
    const g = m.geometry;
    const L = g.getAttribute('aBoneLocal');
    const I = g.getAttribute('aBoneId');
    if (!L || !I) continue;
    for (let i = 0; i < I.count; i++) {
      const id = Math.round(I.getX(i));
      const r = Math.hypot(L.getX(i), L.getY(i), L.getZ(i));
      const k = nameOf(id);
      const p = per.get(k) ?? { n: 0, max: 0 };
      p.n++; p.max = Math.max(p.max, r);
      per.set(k, p);
    }
  }
  // bone lengths straight off the live skeleton, parent-to-child, in world metres
  const len = {};
  for (const b of sk.bones) {
    const kid = b.children.find((c) => c.isBone);
    if (!kid) continue;
    const a = b.matrixWorld.elements; const c = kid.matrixWorld.elements;
    len[b.name] = Math.hypot(c[12] - a[12], c[13] - a[13], c[14] - a[14]);
  }
  out.control = [...per.entries()].map(([k, v]) => ({
    bone: k, verts: v.n, max: +v.max.toFixed(4), len: len[k] ? +len[k].toFixed(4) : null,
    ratio: len[k] ? +(v.max / len[k]).toFixed(3) : null,
  })).sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0));
  return out;
});

console.log('\n=== DELIVERED ATTRIBUTES (game.play?mesh=1, production build) ===');
if (att.err) console.log('  ERR', att.err);
else {
  for (const m of att.meshes) console.log(` ${m.name.padEnd(14)} ${String(m.verts).padStart(6)} verts  [${m.has.join(', ')}]`);
  const s = att.summary;
  if (s) {
    console.log(`\n  summary: ${s.vertices} verts, ${s.bones.length} bones, units "${s.units}"`);
    console.log(`  ambiguous ${s.ambiguous} (${s.ambiguousPct}%) at tol ${s.ambiguousTol}`);
    console.log('  sweep   ' + s.ambiguousSweep.map(([t, n, p]) => `${t * 100}%:${n}(${p}%)`).join('  '));
    for (const [k, v] of s.ambiguousPairs) console.log(`    ${String(v).padStart(5)}  ${k}`);
    console.log('  forearm control:');
    for (const f of s.forearms) {
      console.log(`    ${f.name}  ${f.verts} verts  len ${f.len.toFixed(4)}  max|L| ${f.maxLocal.toFixed(4)} ` +
        ` ratio ${f.ratio.toFixed(3)}  axial ${f.axialLo.toFixed(4)}..${f.axialHi.toFixed(4)}`);
    }
    console.log('  bone axes (local frame, derived parent-to-child):');
    for (const b of s.bones) {
      console.log(`    ${b.name.padEnd(15)} len ${String(b.len).padStart(7)} axis (${b.axis.join(', ')})` +
        `${b.forked ? ' FORK' : ''}  verts ${b.verts}  axial ${b.axial ? b.axial.join('..') : '-'}  <- ${b.from}`);
    }
  } else console.log('\n  NO SUMMARY on avatar.boneLocal');
  console.log('\n  |aBoneLocal| against each bone\'s own length, recomputed from the shipped floats:');
  console.log('  bone              verts    len(m)   max(m)  ratio');
  for (const r of att.control) {
    console.log(`  ${r.bone.padEnd(16)} ${String(r.verts).padStart(6)} ` +
      `${String(r.len ?? '-').padStart(9)} ${String(r.max).padStart(8)} ${String(r.ratio ?? '-').padStart(6)}`);
  }
}

// ---------------------------------------------------------------- the ear, on mesh.animated
await page.goto(MESH, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__rrr?.engine, null, { timeout: 180000 });
await page.waitForTimeout(7000);

const ear = await page.evaluate(() => {
  const e = window.__rrr?.engine;
  const out = { parts: [], err: null };
  const want = /^(ear|earDisc)[LR]$/;
  e.scene.traverse((o) => {
    if (!o.isMesh || !want.test(o.name)) return;
    o.updateWorldMatrix(true, false);
    const g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const b = g.boundingBox.clone().applyMatrix4(o.matrixWorld);
    out.parts.push({
      name: o.name,
      mat: o.material?.name ?? '(unnamed)',
      verts: g.attributes.position.count,
      x: [+b.min.x.toFixed(4), +b.max.x.toFixed(4)],
      y: [+b.min.y.toFixed(4), +b.max.y.toFixed(4)],
      z: [+b.min.z.toFixed(4), +b.max.z.toFixed(4)],
    });
  });
  return out;
});
console.log('\n=== THE EAR AS BUILT (mesh.animated) ===');
for (const p of ear.parts) {
  console.log(` ${p.name.padEnd(9)} ${String(p.verts).padStart(5)}v  mat ${String(p.mat).padEnd(20)}` +
    ` x ${p.x[0]}..${p.x[1]}  y ${p.y[0]}..${p.y[1]}  z ${p.z[0]}..${p.z[1]}`);
}
if (!ear.parts.length) console.log('  NOTHING FOUND — the ear parts are not in the scene under those names.');

if (errs.length) { console.log('\nCONSOLE/PAGE ERRORS:'); for (const e of errs.slice(0, 8)) console.log('  ', e); }
await browser.close();
