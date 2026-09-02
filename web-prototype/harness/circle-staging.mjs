#!/usr/bin/env node
/**
 * circle-staging — do the eight name tags COLLIDE, and is the camera outside the chair ring?
 *
 *   node harness/circle-staging.mjs            # writes progress/circle/
 *   node harness/circle-staging.mjs --keep     # leave vite up
 *
 * WHY THIS FILE EXISTS. Two findings came out of the round-2 critic pass with photographs behind
 * them and no instrument (`docs/design/loop-ui-critique.md`):
 *
 *   F11  eight tags overlap each other — `JOHN` completely covering `JO`, one `SAM` clipped to
 *        `SA` by the other — and they scale INVERSELY with usefulness: the two robots nearest
 *        the camera get ~30px type and the far side of the circle gets ~11px, so the labels you
 *        can already read shout and the ones you are squinting at whisper.
 *   F13  the ballroom camera sits INSIDE the chair circle. The locked rule is *"outside the
 *        chair circle, sweeping, keeping the group centred"*.
 *
 * ⚠️ **F13 WAS FALSE AND THIS FILE IS WHAT KILLED IT.** First run: the camera is 9.23 m from the
 * ring centre and the ring reaches 4.63 m — outside, by a factor of two, rule obeyed. What the
 * photographs actually showed is a camera that is outside but LOW (y = 1.92 m, seated eye
 * height), cropping the nearest robot and centring the rug. C3 is kept as the standing guard on
 * the rule rather than deleted with the finding: it passes today and it is what notices if the
 * sweep ever wanders inside. F11's scale half was overstated too — see C5.
 *
 * The collision is the one that survived, and badly: five overlapping pairs, the worst burying
 * 73% of the smaller tag.
 *
 * ⚠️ **THIS IS A MEASUREMENT, NOT A CRITIQUE, AND THAT IS DELIBERATE.** `rrr-critique` is the
 * project's art-director protocol and its decisive moves are a blind comparison against a
 * piece's BAR ART and `measure.mjs`/`overlay.mjs` silhouette landmarks. Neither applies here:
 * there is no reference art for "a reality-TV circle of seated robots wearing name tags", and a
 * label collision has no silhouette to overlay. What DOES carry over is that skill's own first
 * rule — *a measured claim outranks an impression, including your own* — so this files numbers
 * instead of adjectives, and a fix has something to beat.
 *
 * ⚠️ **IT DRIVES THE FOLLOW VIEW DIRECTLY**, for the reason `nametag-legibility.mjs` documents
 * at length: booting a room, phones and a whole night to reach a talk beat is a race against a
 * mansion bake whose time swings by minutes under swiftshader, and everything in that stack can
 * fake the result. One page, one `intros` cue, the same message the TV posts and the same
 * `cueViolations` guard at both ends.
 *
 * No screenshots — the geometry is read from the live scene. The sibling bench that DOES
 * screenshot died on a 30s capture timeout under swiftshader; this one has nothing to capture.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const KEEP = argv.includes('--keep');
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const WEB = +arg('--port', 5194);
const SEED = +arg('--seed', 3);
const WAIT = +arg('--wait', 240000);
const SHOTDIR = path.join(ROOT, 'progress', 'circle');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const t = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}${d ? ` · ${d}` : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? ` · ${d}` : ''}`); }
  return c;
};

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 700);
});

/** Eight, because eight is the table size the collision was photographed at. */
const CAST = [
  { id: 'p1', seat: 0, name: 'JOHN', shell: '#d8dade', accent: '#f5a14a' },
  { id: 'p2', seat: 1, name: 'ELLIE', shell: '#d8dade', accent: '#e8d5a3' },
  { id: 'p3', seat: 2, name: 'SAM', shell: '#d8dade', accent: '#ff7a59' },
  { id: 'p4', seat: 3, name: 'SAM', shell: '#d8dade', accent: '#f0ebe3' },
  { id: 'p5', seat: 4, name: 'BO', shell: '#d8dade', accent: '#c47a4a' },
  { id: 'p6', seat: 5, name: 'MARY-KATE 3', shell: '#d8dade', accent: '#9ad7c2' },
  { id: 'p7', seat: 6, name: 'ALEXANDRIA', shell: '#d8dade', accent: '#7fb3e8' },
  { id: 'p8', seat: 7, name: 'JO', shell: '#d8dade', accent: '#e5c04a' },
];

/*
 * ============================ WHAT IS MEASURED ==============================================
 * Every `headName` sprite is projected to screen space as a RECT — centre from the world
 * matrix, half-extents from the sprite's own world scale, which is what `sizeAttenuation` and
 * the distance clamp have already been applied to. Then:
 *
 *   · pairwise intersection-over-smaller for every visible pair — "how much of the smaller tag
 *     is buried", which is the number a reader actually experiences. IoU would flatter a big
 *     tag swallowing a small one, which is exactly the JOHN-over-JO case.
 *   · the on-screen height of each tag, so the near/far spread is a ratio and not an adjective.
 *   · the chair ring from the tag world positions (they sit one per chair): centre, radius, and
 *     the camera's horizontal distance from that centre.
 * ============================================================================================
 */
const MEASURE = () => {
  const eng = window.__rrr?.engine;
  if (!eng) return { error: 'no engine' };
  const cam = eng.camera;
  /*
   * ⚠️ **THERE IS NO `THREE` ON THE PAGE HANDLE** — `engine.js` exposes engine/settle/ready and
   * a few methods, and nothing else. Rather than importing the module (a second copy of THREE
   * in the page is its own class of bug), take a real `Vector3` off an object that already has
   * one and clone it: every Object3D's `.position` is one, with every method this needs.
   */
  const V = () => cam.position.clone();
  const canvas = eng.renderer.domElement;
  const CW = canvas.clientWidth || canvas.width;
  const CH = canvas.clientHeight || canvas.height;

  const tags = [];
  eng.scene.traverse((o) => { if (o.name === 'headName') tags.push(o); });
  if (!tags.length) return { tagCount: 0 };

  cam.updateMatrixWorld(true);
  const v = V();
  const s = V();
  const out = [];
  for (const g of tags) {
    g.updateWorldMatrix(true, false);
    g.getWorldPosition(v);
    const world = { x: v.x, y: v.y, z: v.z };
    g.getWorldScale(s);
    const dist = cam.position.distanceTo(v);
    // Project centre, then a point offset by half the sprite's world width/height in CAMERA
    // space — a sprite always faces the camera, so its screen extent is its world extent
    // measured on the camera's right/up axes.
    const p = v.clone().project(cam);
    const right = V().setFromMatrixColumn(cam.matrixWorld, 0).multiplyScalar(s.x * 0.5);
    const up = V().setFromMatrixColumn(cam.matrixWorld, 1).multiplyScalar(s.y * 0.5);
    const pr = v.clone().add(right).project(cam);
    const pu = v.clone().add(up).project(cam);
    const cx = (p.x * 0.5 + 0.5) * CW;
    const cy = (-p.y * 0.5 + 0.5) * CH;
    const hw = Math.abs((pr.x - p.x) * 0.5 * CW);
    const hh = Math.abs((pu.y - p.y) * 0.5 * CH);
    out.push({
      name: g.userData?.tagLabel || '?',
      dist: +dist.toFixed(2),
      world,
      rect: [+(cx - hw).toFixed(1), +(cy - hh).toFixed(1), +(cx + hw).toFixed(1), +(cy + hh).toFixed(1)],
      w: +(hw * 2).toFixed(1),
      h: +(hh * 2).toFixed(1),
      inFrustum: p.z > -1 && p.z < 1,
      onScreen: p.z > -1 && p.z < 1 && cx + hw > 0 && cx - hw < CW && cy + hh > 0 && cy - hh < CH,
    });
  }

  // The chair ring, from where the tags actually are.
  const xs = out.map((g) => g.world.x); const zs = out.map((g) => g.world.z);
  const ctr = { x: xs.reduce((a, b) => a + b, 0) / xs.length, z: zs.reduce((a, b) => a + b, 0) / zs.length };
  const radii = out.map((g) => Math.hypot(g.world.x - ctr.x, g.world.z - ctr.z));
  const ring = {
    cx: +ctr.x.toFixed(2), cz: +ctr.z.toFixed(2),
    rMin: +Math.min(...radii).toFixed(2),
    rMax: +Math.max(...radii).toFixed(2),
    rMean: +(radii.reduce((a, b) => a + b, 0) / radii.length).toFixed(2),
  };
  const camDist = Math.hypot(cam.position.x - ctr.x, cam.position.z - ctr.z);

  return {
    tagCount: tags.length,
    canvas: [CW, CH],
    cam: { x: +cam.position.x.toFixed(2), y: +cam.position.y.toFixed(2), z: +cam.position.z.toFixed(2) },
    ring,
    camDistFromCentre: +camDist.toFixed(2),
    camOutsideRing: camDist > ring.rMax,
    tags: out,
  };
};

const kids = [];
console.log('\ncircle-staging — do the tags collide, and is the camera outside the ring?\n');

if (await portOpen(WEB)) console.log(`  reusing vite on :${WEB}`);
else {
  console.log(`  starting vite on :${WEB} …`);
  const p = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'),
    '--port', String(WEB), '--strictPort', '--host', '127.0.0.1'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  kids.push(p);
  const t0 = Date.now();
  while (!(await portOpen(WEB))) {
    if (Date.now() - t0 > 30000) throw new Error('vite never opened');
    await sleep(250);
  }
}

const base = `http://127.0.0.1:${WEB}`;
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

let exitCode = 1;
try {
  await mkdir(SHOTDIR, { recursive: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  await page.goto(`${base}/?view=party.follow&warm=1&seed=${SEED}`, { waitUntil: 'domcontentloaded' });
  const t0 = Date.now();
  let ready = false;
  while (Date.now() - t0 < WAIT) {
    ready = await page.evaluate(() => !!window.__rrr?.ready).catch(() => false);
    if (ready) break;
    await sleep(2000);
  }
  console.log(`  mansion ${ready ? 'warm' : 'NOT warm'} after ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  t('C0 · the ballroom warmed', ready);

  await page.evaluate((cast) => {
    window.postMessage({ t: 'cue', cue: { kind: 'intros', cast, talk: true } }, '*');
  }, CAST);

  let m = null;
  const t1 = Date.now();
  while (Date.now() - t1 < 120000) {
    m = await page.evaluate(MEASURE);
    if (m?.tagCount >= CAST.length && m.tags.some((g) => g.onScreen)) break;
    await sleep(2000);
  }
  console.log(`  circle: ${m?.tagCount ?? 0} tags after ${((Date.now() - t1) / 1000).toFixed(0)}s\n`);
  if (errs.length) console.log(`  ⚠️ ${[...new Set(errs)].slice(0, 5).join(' | ')}\n`);

  t('C1 · all eight tags exist', m?.tagCount === CAST.length, `${m?.tagCount} tags`);

  const shown = (m?.tags || []).filter((g) => g.onScreen);
  t('C2 · the circle is in shot — otherwise the geometry proves nothing',
    shown.length > 0, `${shown.length}/${m?.tagCount} on screen`);

  /* ---- F13 · is the camera outside the chair ring? ------------------------------------- */
  console.log(`\n  ring centre ${m.ring.cx}, ${m.ring.cz} · radius ${m.ring.rMin}–${m.ring.rMax} m`);
  console.log(`  camera ${m.cam.x}, ${m.cam.y}, ${m.cam.z} · ${m.camDistFromCentre} m from centre\n`);
  t('C3 · the camera is OUTSIDE the chair circle (locked rule)',
    m.camOutsideRing,
    `${m.camDistFromCentre} m from centre, ring reaches ${m.ring.rMax} m`);

  /* ---- F11 · do the tags collide, and how far apart are their sizes? -------------------- */
  const over = (a, b) => {
    const w = Math.min(a.rect[2], b.rect[2]) - Math.max(a.rect[0], b.rect[0]);
    const h = Math.min(a.rect[3], b.rect[3]) - Math.max(a.rect[1], b.rect[1]);
    if (w <= 0 || h <= 0) return 0;
    const inter = w * h;
    const smaller = Math.min(a.w * a.h, b.w * b.h);
    return smaller > 0 ? inter / smaller : 0;
  };
  const pairs = [];
  for (let i = 0; i < shown.length; i++) {
    for (let j = i + 1; j < shown.length; j++) {
      const f = over(shown[i], shown[j]);
      if (f > 0) pairs.push({ a: shown[i].name, b: shown[j].name, buried: +(f * 100).toFixed(0) });
    }
  }
  pairs.sort((x, y) => y.buried - x.buried);

  console.log('   tag              dist     on-screen w x h');
  for (const g of shown) console.log(`   ${String(g.name).padEnd(16)}${String(g.dist).padStart(6)}m   ${g.w} x ${g.h}`);
  console.log('');
  if (pairs.length) {
    console.log('   overlapping pairs (% of the SMALLER tag buried):');
    for (const p of pairs) console.log(`     ${p.a} / ${p.b} — ${p.buried}%`);
    console.log('');
  }

  /*
   * ⚠️ **C4 IS A READING, NOT A VERDICT — JOHN'S CALL, 2026-08-28:** *"I don't mind the tags
   * occluding each other."* The overlap is real and this still measures it, because a number
   * that stops being collected is a number nobody can notice moving. What it no longer does is
   * FAIL: the critic filed the collision as a defect and the owner of the design says it is not
   * one, and a gate that reports red on a deliberate choice trains everybody to ignore red.
   *
   * What John did flag is size — *"maybe a little too big, but the readability was the issue when
   * it was smaller"* — which is a constraint on any fix, not a request to shrink: the far tags
   * were unreadable at the old size and must not go back. C6 is that constraint as a floor.
   */
  console.log(`   overlap reading: ${pairs.length} pairs`
    + `${pairs.length ? `, worst ${pairs[0].buried}% of the smaller tag` : ''} — not a defect, see header\n`);

  /*
   * ⚠️ **C5 IS THE ONE THAT CORRECTED THE CRITIC.** The finding claimed the near tags were about
   * three times the far ones — read off a screenshot, by eye, from the TEXT rather than the tag.
   * Measured it is 1.98x, which passes on a knife edge. The spread is real and it is milder than
   * it looked, and this threshold is deliberately left where it is: at 1.98 a regression of any
   * size trips it, which is the right sensitivity for something that was nearly a false finding.
   */
  const hs = shown.map((g) => g.h);
  const spread = Math.max(...hs) / Math.max(1e-6, Math.min(...hs));
  t('C5 · nearest and furthest tags are within 2x of each other',
    spread <= 2, `${Math.min(...hs).toFixed(1)}px → ${Math.max(...hs).toFixed(1)}px = ${spread.toFixed(2)}x`);

  /*
   * C6 · THE FLOOR THE LAST SHRINK HIT. The tags were smaller once and the far side of the
   * circle could not be read; that is why the near/far curve exists at all. Any future trim of
   * the big near tags must come off the NEAR end — the far end is already at the size that was
   * found to be the minimum. This guards the direction of the next change.
   */
  t('C6 · the furthest tag is still at least 28px tall — the size the last shrink bottomed out at',
    Math.min(...hs) >= 28, `smallest ${Math.min(...hs).toFixed(1)}px`);

  await writeFile(path.join(SHOTDIR, 'staging.json'), JSON.stringify({ m, pairs }, null, 2));
  console.log(`\n  staging.json in progress/circle/`);
  console.log(`  ${pass} ok · ${fail} fail\n`);
  exitCode = fail ? 1 : 0;
} catch (e) {
  console.log(`\ncircle-staging died: ${e?.message}\n`);
} finally {
  if (!KEEP) {
    await browser.close().catch(() => {});
    for (const k of kids) k.kill();
  }
  process.exit(exitCode);
}
