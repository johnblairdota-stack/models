#!/usr/bin/env node
/**
 * tag-census — CAN A VIEWER READ ALL EIGHT NAMES, AT EVERY POSITION THE CAMERA SWEEPS THROUGH?
 *
 *   node harness/tag-census.mjs                  # the shipped arm
 *   node harness/tag-census.mjs --control cull   # a forced cull — must go RED
 *   node harness/tag-census.mjs --control zero   # the scale pinned to nothing — must go RED
 *   node harness/tag-census.mjs --control inside # the lens dropped into the ring — must go RED
 *   node harness/tag-census.mjs --keep           # leave vite up
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS — a claim from a photograph, 2026-08-28.
 * ---------------------------------------------------------------------------------------------
 * Two frames of the SAME eight-player circle out of `harness/loop-ui-play.mjs` (`progress/r5/`):
 *
 *   `08-tv-reckoning-named.png`  — eight floating name tags, all eight names readable.
 *   `09-tv-vote-open.png`        — the camera has walked a few metres around the ring and only
 *                                  SIX names can be read. Seats 4 and 8 are gone.
 *
 * The locked rule is that name tags *"must stay legible at low quality and distance"*. A tag
 * that silently leaves on some camera positions breaks it, and nothing in the suite would have
 * noticed: `nametag-legibility` reads one camera position, `circle-staging` reads one camera
 * position, and `party-warm` W33b reads the TEXTURE. **The sweep was never measured.**
 *
 * Counting labels in a PNG is not evidence, so this counts them in the live scene instead, and
 * it separates the four explanations that all look identical in a photograph:
 *
 *   (a) the tag is BEHIND THE CAMERA or outside the frustum — innocent, it is a shot choice;
 *   (b) the tag is OCCLUDED BY SCENERY — would be a bug, captions are drawn over the grade;
 *   (c) the tag is BURIED UNDER A NEARER TAG — known, and John's call 2026-08-28 is that tags
 *       occluding each other is *not* a defect (`circle-staging` C4). Burial to the point where
 *       the name is entirely gone is a different animal and this file is what tells them apart;
 *   (d) the tag is CULLED or SHRUNK — the non-innocent one, and the thing with no net.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ WHAT IT FOUND, 2026-08-28 — 82 camera positions, eight seats, N=8.
 * ---------------------------------------------------------------------------------------------
 * **THE PHOTOGRAPH WAS RIGHT ABOUT THE COUNT AND WRONG ABOUT THE CAUSE, AND THE CAUSE MATTERS.**
 * Across the whole ring, at every position measured, all eight plates are drawn, all eight are
 * in front of the lens, all eight are fully inside the frame, none is ever below 29.4 px, and
 * the applied `k` never differs from the shipped clamp by more than 0.001. Explanations (a),
 * (b) and (d) are ruled out by measurement: **nothing culls, clips, shrinks or occludes a tag.**
 *
 * What actually happens is (c), and at a magnitude nobody had a number for: **the worst position
 * on the sweep buries seat 8's name 97% under seat 1's plate.** Eight of the twenty-four coarse
 * azimuths — one per gap between chairs — hide a name by more than 90%. Every burial past 75%
 * is between ADJACENT seats: 1 over 8, 2 over 1, 3 over 4, 4 over 5.
 *
 * 📐 **AND IT IS STRUCTURAL, NOT A BAD ANGLE.** The eight plates laid end to end are WIDER THAN
 * THE CIRCLE THEY LABEL. At 1600×900, worst position: 1238 px of plate against 861 px between
 * the outermost two anchors — 139–147% at every position measured, and still 114–119% against
 * the most generous denominator there is (the outer edges of the plates themselves). Eight
 * plates do not FIT side by side across that arc at this size; some pair is always on top of
 * another, and wherever two chairs line up with the lens the near plate — bigger, because past
 * `TAG_REF_DIST · TAG_FAR_K` = 8 m both plates are clamped at `TAG_FAR_K` and apparent size then
 * goes as 1/d — swallows the far one whole. The count a viewer gets is 4–6 clean names of 8.
 * **Never seven, never eight, at any camera position on the ring.**
 *
 * ⚠️ **T7 IS RED ON THE SHIPPED CODE AND THAT IS THE FINDING, NOT A BROKEN GATE.** It is left
 * red deliberately: the alternative is to move the line above what was measured, which is how a
 * suite goes quiet. Every other arm is green, so the day the burial is dealt with this file is a
 * gate and nothing about it has to change. The fix is a DESIGN decision — the plate spec is a
 * locked product rule and the cheapest candidate (a per-seat row offset, so two collinear plates
 * never share a screen row) moves where the tag floats — so it is John's call, not a refactor,
 * and this file deliberately proposes nothing.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ IT DRIVES THE FOLLOW VIEW DIRECTLY, for the reason `circle-staging.mjs` and
 * `nametag-legibility.mjs` both set out at length: booting a room, phones and a whole night to
 * reach a talk beat is a race against a mansion bake whose time swings by minutes under
 * swiftshader, and every layer of that stack can fake the result. One page, one `intros` cue,
 * the same `cueViolations`-validated channel the TV posts on. No screenshots — the geometry is
 * read out of the live scene, which is also why serving `dist` buys nothing here: there are no
 * pixels to be faithful to. Same vite spawn as both siblings.
 *
 * ---------------------------------------------------------------------------------------------
 * HOW THE SWEEP IS SAMPLED — two arms, and the second is not a re-implementation of the director.
 * ---------------------------------------------------------------------------------------------
 * LIVE arm: the shipped talk camera (`intro-bed.js` `talkFrame` / `walkCamOnRing`) is left to
 * walk on its own and the scene is measured every few seconds. That is the real shot, including
 * `clampInSpace` pushing the eye off its arc near a wall — but wall-clock sampling under
 * swiftshader covers whatever arc it happens to cover, so on its own it can miss the azimuth
 * that hides a tag.
 *
 * SWEPT arm: the camera's own live pose is snapshotted and then ROTATED ABOUT THE RING CENTRE,
 * n times, all the way round. Nothing about the shot is re-derived here — same radius, same eye
 * height, same pitch, same FOV, rotated. That is deliberate: a harness that recomputed the arc
 * from `RING_OUT` and `EYE_Y` would be measuring a camera the game does not have, and would keep
 * passing if the director moved. This one follows the director because it *is* the director's
 * pose. Full 360° coverage, deterministic, no wall-clock lottery.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IS MEASURED, per tag, per camera position
 * ---------------------------------------------------------------------------------------------
 *   · world position, distance to the camera, and whether it is in FRONT of the lens at all;
 *   · `k`, the scale factor ACTUALLY APPLIED by `onBeforeRender`, read off the sprite after a
 *     forced `redraw()` — against the `k` the shipped clamp says it should be, recomputed from
 *     `TAG_REF_DIST` / `TAG_NEAR_K` / `TAG_FAR_K` parsed out of the source so this follows those
 *     three numbers if they ever move (the same trick `party-warm` W35i uses; importing the
 *     module would drag THREE into a bare-node gate);
 *   · the projected screen rect in CSS pixels at 1600×900, and its height in pixels;
 *   · how much of it is buried under NEARER tags. Nearer, not "other": every tag is
 *     `depthTest:false` on `CAPTION_LAYER` with the same `renderOrder`, so three sorts them
 *     back-to-front and the closer plate is the one on top. Intersection-over-SELF, not IoU —
 *     the question is how much of THIS name is gone, which is what a reader experiences.
 *
 * ⚠️ **THE RECT IS BOTTOM-ANCHORED.** `attachHeadNameTag` sets `sprite.center = (0.5, 0.0)`, so
 * the plate hangs UPWARDS from its anchor point. `circle-staging`'s rect is centred on the
 * anchor and is therefore half a plate too low; it does not change that file's verdicts (they
 * are about widths, heights and ratios) but it would change every overlap number here, so this
 * file projects the anchor and then extends one full plate height upward.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ THE CONTROLS. `party-isolation` reported 20 passed / 0 failed — including all four of its
 * blindness controls — while leaking a secret role to every phone, and this project's rule since
 * is that a gate with no arm that goes red has gone blind. Three are wired here, one per way a
 * tag can leave:
 *
 *   `--control cull`    two sprites forced `visible = false`     → T1, T3 red
 *   `--control zero`    `onBeforeRender` pinned to k = 0.02      → T4, T5 red
 *   `--control inside`  the swept lens dropped to the ring       → T2, T6 red
 *
 * Two things the controls taught that are worth keeping:
 *
 *   · `cull` also turns T4 and T5 red, and that is not noise. three does not call
 *     `onBeforeRender` on an invisible object, so a switched-off plate's scale goes STALE — it
 *     keeps whatever `k` it had when it was last drawn. That the census notices is the proof
 *     that it is reading a live render and not re-deriving the numbers it expects.
 *   · `zero` leaves **T7 green at 0% buried**, because nothing overlaps when every plate is a
 *     dot. That is the vacuous pass this file was warned about, sitting in plain view: T7 alone
 *     is blind, and it is T1 and T5 standing beside it that make it mean anything.
 *
 * And the vacuous-pass trap is closed FIRST: T1 asserts eight seated robots and eight drawn
 * plates with eight real labels before anything is asserted ABOUT them. "Every visible tag is
 * legible" is trivially true of zero visible tags, which is precisely the failure being hunted.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const KEEP = argv.includes('--keep');
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const WEB = +arg('--port', 5196);
const SEED = +arg('--seed', 3);
const WAIT = +arg('--wait', 240000);
const CONTROL = arg('--control', '');
const SWEEPS = +arg('--sweeps', 24);
/**
 * The refinement pass costs ~50 renders and a render is ~10s under swiftshader. It exists to
 * find the exact azimuth of a burial peak, which only the SHIPPED arm needs: a control run is
 * asking "does this assertion notice", and it is asked and answered at any azimuth at all.
 */
const REFINE = arg('--refine', '1') !== '0';
const LIVES = +arg('--live', 10);
const LIVE_GAP = +arg('--gap', 3000);
const SHOTDIR = path.join(ROOT, 'progress', 'tagcensus');

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

/* ---------------------------------------------------------------------------------------------
 * The shipped numbers, read out of the source rather than imported: `chest-nameplate.js` imports
 * THREE and this half of the file runs in bare node. Every expectation below is derived from
 * these, so a tune of the clamp moves the gate's expectations with it instead of failing it.
 * ------------------------------------------------------------------------------------------- */
const tagSrc = await readFile(new URL('../src/characters/chest-nameplate.js', import.meta.url), 'utf8');
const num = (re) => Number((tagSrc.match(re) || [])[1]);
const SPEC = {
  TAG_W: num(/TAG_W = ([\d.]+)/),
  TAG_H: num(/TAG_H = ([\d.]+)/),
  REF: num(/TAG_REF_DIST = ([\d.]+)/),
  NEAR_K: num(/TAG_NEAR_K = ([\d.]+)/),
  FAR_K: num(/TAG_FAR_K = ([\d.]+)/),
};
if (!Number.isFinite(SPEC.TAG_W) || !Number.isFinite(SPEC.REF) || !Number.isFinite(SPEC.NEAR_K)
  || !Number.isFinite(SPEC.FAR_K) || !Number.isFinite(SPEC.TAG_H)) {
  console.log('\ntag-census: could not parse the plate constants out of chest-nameplate.js\n');
  process.exit(1);
}
/** The band in which apparent size is constant BY CONSTRUCTION: k rises exactly as 1/d cancels. */
const BAND = [SPEC.NEAR_K * SPEC.REF, SPEC.FAR_K * SPEC.REF];

/**
 * The legibility floor. `circle-staging` C6 records 28 px at 1600×900 as the size the last
 * shrink bottomed out at — smaller than that and the far side of the circle could not be read.
 * Kept as one named number so the two files can be compared.
 */
const FLOOR_PX = 28;
/**
 * The burial line. ⚠️ **NOT ZERO, AND THAT IS JOHN'S CALL, NOT A SOFTENING.** He was shown
 * `circle-staging`'s worst pair — 73% of the smaller plate under a nearer one — and said he does
 * not mind tags occluding each other. So a gate at "no overlap" would be red on a shipped
 * decision, which trains a team to ignore red. What he was not shown, and what this line
 * defends, is a name that is *entirely* gone: at 90% buried there is no reading of any plate in
 * which the name survives, and the room is looking at seven robots and a stranger.
 */
const BURIED_MAX = 0.90;
/** Reported, not asserted: a plate this buried is one a viewer can still comfortably read. */
const BURIED_CLEAN = 0.25;

/** Eight, because eight is the table size the finding was photographed at. Same cast as
 *  `circle-staging`, so the two files' numbers can be laid side by side. */
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

/* =============================================================================================
 * IN-PAGE MEASUREMENT. Runs entirely inside one synchronous evaluate: move the lens, force one
 * render, read the sprites. No await in the middle, because the engine's rAF loop re-drives the
 * camera the moment this yields, and `onBeforeRender` is the only thing that knows the applied
 * scale.
 *
 * ⚠️ **THERE IS NO `THREE` ON THE PAGE HANDLE** (`engine.js` exposes engine/settle/ready and a
 * few methods). Same move as `circle-staging`: take a real `Vector3` off an object that already
 * has one and clone it. `Object3D.rotateOnWorldAxis` supplies the rotation, so no matrix maths
 * is re-implemented either.
 * ============================================================================================= */
const MEASURE = ({ spec, rotate, control }) => {
  const eng = window.__rrr?.engine;
  if (!eng) return { error: 'no engine' };
  const cam = eng.camera;
  const V = () => cam.position.clone();
  const canvas = eng.renderer.domElement;
  const CW = canvas.clientWidth || canvas.width;
  const CH = canvas.clientHeight || canvas.height;

  const names = [];
  const bangs = [];
  let chairs = 0;
  eng.scene.traverse((o) => {
    if (o.name === 'headName') names.push(o);
    else if (o.name === 'nomBang') bangs.push(o);
    else if (o.name === 'intro-chairs' && o.isInstancedMesh) chairs = o.count;
  });
  if (!names.length) return { tagCount: 0, chairs };

  // ---- the ring, from where the plates actually are (one per chair) -------------------------
  const v = V();
  const pos = [];
  for (const g of names) { g.updateWorldMatrix(true, false); g.getWorldPosition(v); pos.push({ x: v.x, y: v.y, z: v.z }); }
  const cx = pos.reduce((a, p) => a + p.x, 0) / pos.length;
  const cz = pos.reduce((a, p) => a + p.z, 0) / pos.length;
  const radii = pos.map((p) => Math.hypot(p.x - cx, p.z - cz));
  const rMax = Math.max(...radii);
  /*
   * THE GROUND TRUTH, MEASURED OFF THE SCENE ITSELF. `sitReport()` — the bed's own "are they
   * sitting" snapshot — is NOT forwarded onto `window.__rrrFollow` (`harness/accusation-beat.mjs`
   * AB2c/AB3c is the finding that says so, and that forward is that file's to add, not this
   * one's). So the circle is proved from geometry instead, which is a stronger claim anyway:
   * eight plates, one per chair, on a ring of equal radius, evenly spaced, all at one seated
   * head height. A standing 1.7 m body wears its plate at ~1.92 m and a seated one at ~1.61,
   * so the spread of `y` is also what says these robots are IN the chairs.
   */
  const ringAz = pos.map((p) => Math.atan2(p.x - cx, p.z - cz)).sort((a, b) => a - b);
  const gaps = ringAz.map((a, i) => {
    const b = i + 1 < ringAz.length ? ringAz[i + 1] : ringAz[0] + Math.PI * 2;
    return (b - a) * 180 / Math.PI;
  });
  const ys = pos.map((p) => p.y);
  const circle = {
    chairs,
    // One plate per BODY: eight sprites all parented to one robot would satisfy every geometric
    // test above and would still be a broken circle.
    bodies: new Set(names.map((g) => g.parent)).size,
    rSpread: +(Math.max(...radii) - Math.min(...radii)).toFixed(3),
    gapMin: +Math.min(...gaps).toFixed(1),
    gapMax: +Math.max(...gaps).toFixed(1),
    ySpread: +(Math.max(...ys) - Math.min(...ys)).toFixed(3),
    y: +(ys.reduce((a, b) => a + b, 0) / ys.length).toFixed(2),
  };

  // ---- the SWEPT arm: the live pose, rotated about the ring centre --------------------------
  if (rotate != null) {
    const home = window.__census?.home;
    if (!home) return { error: 'no camera home snapshot' };
    cam.position.copy(home.pos);
    cam.quaternion.copy(home.quat);
    const a = rotate;
    const dx = cam.position.x - cx;
    const dz = cam.position.z - cz;
    // R_y(a) on the offset, and the same +a about world Y on the orientation: the identical
    // shot, walked round the circle. Nothing here decides where the camera "should" be.
    cam.position.x = cx + dx * Math.cos(a) + dz * Math.sin(a);
    cam.position.z = cz - dx * Math.sin(a) + dz * Math.cos(a);
    cam.rotateOnWorldAxis(V().set(0, 1, 0), a);
    if (control === 'inside') {
      // ⚠️ CONTROL ARM. Drop the lens onto the ring centre — the pathological camera. Every
      // plate but the one it happens to face leaves the frame.
      cam.position.x = cx + (cam.position.x - cx) * 0.04;
      cam.position.z = cz + (cam.position.z - cz) * 0.04;
    }
    cam.updateMatrixWorld(true);
  }

  // One render with THIS lens, so every `onBeforeRender` has run for this exact pose.
  window.__rrr.redraw();
  cam.updateMatrixWorld(true);

  const fwd = V().setFromMatrixColumn(cam.matrixWorld, 2).multiplyScalar(-1).normalize();
  const s = V();
  const drawnOf = (o) => { let n = o; while (n) { if (!n.visible) return false; n = n.parent; } return true; };

  const project = (g, kind) => {
    g.updateWorldMatrix(true, false);
    g.getWorldPosition(v);
    const world = { x: +v.x.toFixed(3), y: +v.y.toFixed(3), z: +v.z.toFixed(3) };
    g.getWorldScale(s);
    const dist = cam.position.distanceTo(v);
    const ahead = v.clone().sub(cam.position).dot(fwd);
    const p = v.clone().project(cam);
    const right = V().setFromMatrixColumn(cam.matrixWorld, 0).normalize().multiplyScalar(s.x * 0.5);
    const up = V().setFromMatrixColumn(cam.matrixWorld, 1).normalize().multiplyScalar(s.y);
    const pr = v.clone().add(right).project(cam);
    const pu = v.clone().add(up).project(cam);
    const ax = (p.x * 0.5 + 0.5) * CW;          // anchor, in CSS px
    const ay = (-p.y * 0.5 + 0.5) * CH;
    const hw = Math.abs((pr.x - p.x) * 0.5 * CW);
    const hpx = Math.abs((pu.y - p.y) * 0.5 * CH);
    // `sprite.center = (0.5, 0)` — the plate hangs upward off the anchor.
    const rect = [ax - hw, ay - hpx, ax + hw, ay];
    const kLocal = g.scale.x / spec.TAG_W;
    const rootK = g.scale.x > 0 ? s.x / g.scale.x : 1;
    return {
      kind,
      name: g.userData?.tagLabel || '?',
      seat: g.userData?.tagTab ? Number(String(g.userData.tagTab).split(':')[0]) + 1 : null,
      drawn: drawnOf(g),
      world,
      dist: +dist.toFixed(2),
      ahead: ahead > 0,
      k: +kLocal.toFixed(4),
      rootK: +rootK.toFixed(3),
      rect: rect.map((n) => +n.toFixed(1)),
      w: +(hw * 2).toFixed(1),
      h: +hpx.toFixed(1),
      ndc: { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3) },
      inFrustum: ahead > 0 && p.z > -1 && p.z < 1 && p.x > -1 && p.x < 1 && p.y > -1 && p.y < 1,
    };
  };

  const tags = names.map((g) => project(g, 'name'));
  const bangRects = bangs.map((g) => project(g, 'bang'));

  // ---- on-screen area, and how much of it is under a NEARER caption -------------------------
  const clip = (r) => [Math.max(0, r[0]), Math.max(0, r[1]), Math.min(CW, r[2]), Math.min(CH, r[3])];
  const area = (r) => Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]);
  const inter = (a, b) => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  /** Exact union area by coordinate compression — with <= 16 rects this is cheap and honest. */
  const unionArea = (rs) => {
    const ok = rs.filter((r) => area(r) > 0);
    if (!ok.length) return 0;
    const xs = [...new Set(ok.flatMap((r) => [r[0], r[2]]))].sort((a, b) => a - b);
    const ys = [...new Set(ok.flatMap((r) => [r[1], r[3]]))].sort((a, b) => a - b);
    let acc = 0;
    for (let i = 0; i < xs.length - 1; i++) {
      for (let j = 0; j < ys.length - 1; j++) {
        const cell = [xs[i], ys[j], xs[i + 1], ys[j + 1]];
        if (ok.some((r) => r[0] <= cell[0] && r[2] >= cell[2] && r[1] <= cell[1] && r[3] >= cell[3])) {
          acc += area(cell);
        }
      }
    }
    return acc;
  };

  const all = [...tags, ...bangRects];
  for (const g of tags) {
    const full = area(g.rect);
    const onRect = clip(g.rect);
    const on = area(onRect);
    g.onScreenFrac = full > 0 ? +(on / full).toFixed(3) : 0;
    g.onScreen = g.ahead && on > 0;
    g.fullyOnScreen = g.ahead && Math.abs(on - full) < 0.5;
    // Nearer captions draw last and therefore on top: same renderOrder, depthTest:false, so
    // three's transparent sort is back-to-front by distance.
    const nearer = all.filter((o) => o !== g && o.drawn && o.ahead && o.dist < g.dist);
    const over = nearer.map((o) => inter(onRect, clip(o.rect))).filter((r) => area(r) > 0);
    const covered = unionArea(over);
    g.buried = on > 0 ? +(covered / on).toFixed(3) : 1;
    // WHO is standing on it — the pair is what a fix has to separate.
    let worst = null;
    for (const o of nearer) {
      const a = area(inter(onRect, clip(o.rect)));
      if (a > 0 && (!worst || a > worst.a)) worst = { a, by: `${o.kind === 'bang' ? '!' : ''}${o.name}${o.seat ? `(${o.seat})` : ''}` };
    }
    g.buriedBy = worst ? worst.by : null;
    // What a viewer actually gets: on screen, big enough, and not under something else.
    g.visibleFrac = full > 0 ? +((on - covered) / full).toFixed(3) : 0;
  }

  return {
    canvas: [CW, CH],
    tagCount: tags.length,
    bangCount: bangRects.length,
    cam: {
      x: +cam.position.x.toFixed(2), y: +cam.position.y.toFixed(2), z: +cam.position.z.toFixed(2),
      fov: +cam.fov.toFixed(1),
      azimuth: +(Math.atan2(cam.position.x - cx, cam.position.z - cz) * 180 / Math.PI).toFixed(1),
      distFromCentre: +Math.hypot(cam.position.x - cx, cam.position.z - cz).toFixed(2),
    },
    ring: { cx: +cx.toFixed(2), cz: +cz.toFixed(2), rMax: +rMax.toFixed(2) },
    circle,
    sim: window.__rrr.engine.elapsed,
    tags,
  };
};

/** Snapshot the live pose once, so the swept arm rotates the DIRECTOR's shot and not its own. */
const SNAP_HOME = () => {
  const cam = window.__rrr.engine.camera;
  window.__census = { home: { pos: cam.position.clone(), quat: cam.quaternion.clone() } };
  return { x: +cam.position.x.toFixed(2), y: +cam.position.y.toFixed(2), z: +cam.position.z.toFixed(2) };
};

const kids = [];
console.log('\ntag-census — can a viewer read all eight names at every position the camera sweeps through?');
console.log(`  plate constants from source: TAG_W ${SPEC.TAG_W} · TAG_H ${SPEC.TAG_H} · ref ${SPEC.REF} m`
  + ` · k in [${SPEC.NEAR_K}, ${SPEC.FAR_K}] → constant-size band ${BAND[0].toFixed(2)}–${BAND[1].toFixed(2)} m`);
if (CONTROL) console.log(`  ⚠️  CONTROL ARM "${CONTROL}" — this run is SUPPOSED to fail.`);
console.log('');

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
  console.log(`  ballroom ${ready ? 'warm' : 'NOT warm'} after ${((Date.now() - t0) / 1000).toFixed(0)}s`);

  await page.evaluate((cast) => {
    window.postMessage({ t: 'cue', cue: { kind: 'intros', cast, talk: true } }, '*');
  }, CAST);

  /*
   * Wait for the circle to be SEATED — the walk-in is a different shot and a different question.
   * The seated test is geometric (see `circle` in MEASURE): eight plates on one ring at one
   * height. `window.__rrrFollow` does not forward the bed's own `sitReport()`.
   */
  let probe = null;
  const t1 = Date.now();
  while (Date.now() - t1 < 150000) {
    probe = await page.evaluate(() => {
      const eng = window.__rrr?.engine; if (!eng) return null;
      const tags = []; let chairs = 0;
      eng.scene.traverse((o) => {
        if (o.name === 'headName') tags.push(o);
        else if (o.name === 'intro-chairs' && o.isInstancedMesh) chairs = o.count;
      });
      const v = eng.camera.position.clone();
      const ys = tags.map((g) => { g.getWorldPosition(v); return v.y; });
      return { n: tags.length, chairs, ySpread: ys.length ? Math.max(...ys) - Math.min(...ys) : 9 };
    }).catch(() => null);
    if (probe && probe.n >= CAST.length && probe.ySpread < 0.05) break;
    await sleep(2500);
  }
  console.log(`  circle: ${probe?.n ?? 0} plates · ${probe?.chairs ?? 0} chairs`
    + ` · head height spread ${(probe?.ySpread ?? 9).toFixed(3)} m after ${((Date.now() - t1) / 1000).toFixed(0)}s`);
  if (errs.length) console.log(`  ⚠️ ${[...new Set(errs)].slice(0, 5).join(' | ')}`);
  console.log('');

  /* ---- the control arms are applied to the SCENE, before anything is measured -------------- */
  if (CONTROL === 'cull' || CONTROL === 'zero') {
    const hit = await page.evaluate(({ mode, TAG_W, TAG_H }) => {
      const tags = [];
      window.__rrr.engine.scene.traverse((o) => { if (o.name === 'headName') tags.push(o); });
      tags.sort((a, b) => String(a.userData?.tagTab).localeCompare(String(b.userData?.tagTab)));
      if (mode === 'cull') {
        // Two plates forced off — exactly the shape of the accusation ("seats 4 and 8 are gone").
        for (const i of [3, 7]) if (tags[i]) tags[i].visible = false;
        return tags.filter((g) => !g.visible).length;
      }
      // The scale pinned to nothing: `onBeforeRender` is where the distance clamp lives, so
      // this is what a broken clamp would look like from the outside.
      for (const g of tags) g.onBeforeRender = () => g.scale.set(TAG_W * 0.02, TAG_H * 0.02, 1);
      return tags.length;
    }, { mode: CONTROL, TAG_W: SPEC.TAG_W, TAG_H: SPEC.TAG_H });
    console.log(`  control "${CONTROL}" applied to ${hit} plates\n`);
  }

  /* ---- LIVE arm: the shipped talk camera, walking on its own ------------------------------- */
  const live = [];
  for (let i = 0; i < LIVES; i++) {
    const m = await page.evaluate(MEASURE, { spec: SPEC, rotate: null, control: CONTROL });
    if (m?.tags) live.push(m);
    if (i < LIVES - 1) await sleep(LIVE_GAP);
  }

  /* ---- SWEPT arm: that same pose, rotated all the way round the ring ----------------------- */
  const home = await page.evaluate(SNAP_HOME);
  const swept = [];
  const at = async (rot) => {
    const m = await page.evaluate(MEASURE, { spec: SPEC, rotate: rot, control: CONTROL });
    if (m?.tags) m.rot = +(rot * 180 / Math.PI).toFixed(2);
    return m?.tags ? m : null;
  };
  for (let i = 0; i < SWEEPS; i++) {
    const m = await at((i / SWEEPS) * Math.PI * 2);
    if (m) swept.push(m);
  }

  /*
   * ⚠️ **THE REFINEMENT PASS, AND WHY A COARSE SWEEP UNDERSTATES THIS BADLY.** Two plates bury
   * each other when the camera is on the LINE THROUGH THEIR TWO CHAIRS, and with eight chairs
   * that is a set of isolated azimuths, not a broad band. A sweep on a fixed step lands next to
   * those azimuths and reports the shoulder of the peak as if it were the peak. So the coarse
   * pass is used only to find the neighbourhood, and each of the worst few is then walked at a
   * fifth of a degree. Every number this file reports about burial comes from the refined pass.
   */
  const peakOf = (m) => Math.max(...m.tags.map((g) => g.buried));
  const refined = [];
  const walk = async (from, to, step) => {
    let best = null;
    for (let d = from; d <= to + 1e-6; d += step) {
      const m = await at(d * Math.PI / 180);
      if (m) { refined.push(m); if (!best || peakOf(m) > peakOf(best)) best = m; }
    }
    return best;
  };
  const half = 360 / SWEEPS / 2;
  for (const seed of (REFINE ? swept.slice().sort((a, b) => peakOf(b) - peakOf(a)).slice(0, 2).map((m) => m.rot) : [])) {
    const b1 = await walk(seed - half, seed + half, 1);
    if (b1) await walk(b1.rot - 1, b1.rot + 1, 0.2);
  }

  const shown = [...live.map((m) => ({ ...m, arm: 'live' })), ...swept.map((m) => ({ ...m, arm: 'swept' }))];
  const frames = [...shown, ...refined.map((m) => ({ ...m, arm: 'refine' }))];
  if (!frames.length) throw new Error('no frames measured');

  /* ---- the census ------------------------------------------------------------------------- */
  const kWant = (d) => Math.min(Math.max(d / SPEC.REF, SPEC.NEAR_K), SPEC.FAR_K);
  const readable = (g) => g.drawn && g.onScreen && g.fullyOnScreen && g.h >= FLOOR_PX && g.buried <= BURIED_MAX;
  const clean = (g) => g.drawn && g.onScreen && g.fullyOnScreen && g.h >= FLOOR_PX && g.buried <= BURIED_CLEAN;

  const line = (m) => {
    const rs = m.tags.filter(readable).length;
    const cl = m.tags.filter(clean).length;
    const front = m.tags.filter((g) => g.ahead).length;
    const fr = m.tags.filter((g) => g.inFrustum).length;
    const on = m.tags.filter((g) => g.fullyOnScreen).length;
    const hs = m.tags.filter((g) => g.onScreen).map((g) => g.h);
    const worst = m.tags.reduce((a, g) => Math.max(a, g.buried), 0);
    return { rs, cl, front, fr, on, hs, worst };
  };

  console.log('  arm    az°   camR   drawn  inFront  inFrustum  fullyOnScreen  h px lo–hi   worstBuried  READABLE  CLEAN');
  for (const m of shown) {
    const L = line(m);
    const hs = L.hs.length ? `${Math.min(...L.hs).toFixed(0)}–${Math.max(...L.hs).toFixed(0)}` : '—';
    console.log(`  ${m.arm.padEnd(6)}${String(m.cam.azimuth).padStart(6)}`
      + `${String(m.cam.distFromCentre).padStart(7)}`
      + `${String(m.tags.filter((g) => g.drawn).length).padStart(7)}`
      + `${String(L.front).padStart(9)}`
      + `${String(L.fr).padStart(11)}`
      + `${String(L.on).padStart(15)}`
      + `${hs.padStart(11)}`
      + `${(L.worst * 100).toFixed(0).padStart(13)}%`
      + `${String(L.rs).padStart(10)}`
      + `${String(L.cl).padStart(7)}`);
  }
  console.log('');

  console.log(`  (+ ${refined.length} refined positions around the two worst azimuths, 0.2° apart)\n`);

  /* ---- one worked frame: the worst position anywhere in the sweep -------------------------- */
  const peakOfF = (m) => Math.max(...m.tags.map((g) => g.buried));
  const worstFrame = frames.reduce((a, m) => (peakOfF(m) > peakOfF(a) ? m : a), frames[0]);
  console.log(`  worst camera position — ${worstFrame.arm} arm, azimuth ${worstFrame.cam.azimuth}°,`
    + ` ${worstFrame.cam.distFromCentre} m from the ring centre (ring reaches ${worstFrame.ring.rMax} m)`);
  console.log('   seat  name        dist   k applied / want   h px   on-screen   buried  under        readable');
  for (const g of [...worstFrame.tags].sort((a, b) => (a.seat || 0) - (b.seat || 0))) {
    console.log(`   ${String(g.seat ?? '—').padStart(4)}  ${String(g.name).padEnd(11)}`
      + `${String(g.dist).padStart(6)}m`
      + `${String(g.k.toFixed(2)).padStart(7)} / ${kWant(g.dist).toFixed(2)}`
      + `${String(g.h.toFixed(0)).padStart(9)}`
      + `${(g.onScreenFrac * 100).toFixed(0).padStart(10)}%`
      + `${(g.buried * 100).toFixed(0).padStart(9)}%`
      + `   ${String(g.buriedBy || '—').padEnd(12)}`
      + ` ${readable(g) ? 'yes' : 'NO'}`);
  }
  console.log('');

  /* ============================== THE ASSERTIONS ============================================ */

  /*
   * T1 · THE GROUND TRUTH, FIRST, BECAUSE EVERYTHING BELOW IS VACUOUS WITHOUT IT. "Every visible
   * tag is legible" is trivially true of zero visible tags — which is exactly the failure being
   * hunted. Eight seated robots, eight drawn plates, eight real labels.
   */
  const labels = new Set(frames[0].tags.map((g) => g.name));
  const C = frames[0].circle;
  t('T1 · eight robots are seated in eight chairs, each wearing one labelled plate',
    C.chairs === CAST.length && C.bodies === CAST.length
    && frames.every((m) => m.tagCount === CAST.length)
    && frames.every((m) => m.tags.every((g) => g.drawn))
    && C.rSpread < 0.25 && C.gapMin > 360 / CAST.length - 8 && C.gapMax < 360 / CAST.length + 8
    && C.ySpread < 0.05 && C.y > 1.3 && C.y < 1.8
    && !labels.has('?') && labels.size >= CAST.length - 1,
    `${C.chairs} chairs · ${C.bodies} bodies · ${frames[0].tagCount} plates · ${labels.size} labels`
    + ` · ring r±${C.rSpread}m, gaps ${C.gapMin}–${C.gapMax}°, heads at ${C.y}m ±${C.ySpread}`
    + ` · ${frames.length} camera positions`);

  /*
   * T2 · the census covers the whole circle, and the shot the swept arm rotates is the shot the
   * director actually holds.
   *
   * ⚠️ **THE LIVE ARM BARELY MOVES UNDER SWIFTSHADER AND THAT IS NOT A BUG IN THE DIRECTOR.**
   * `walkCamOnRing` advances on the frame clock; at ~2 fps with a clamped dt the sim advances at
   * a few percent of wall time, so ten seconds of watching buys about a degree of arc. That is
   * exactly why the swept arm exists, and why it rotates the live pose instead of recomputing
   * one: the live samples are the proof that the pose being rotated is the real one.
   */
  const bins = new Set(frames.map((m) => Math.floor(((m.cam.azimuth + 360) % 360) / 30)));
  const liveAz = live.map((m) => m.cam.azimuth);
  const liveR = live.map((m) => m.cam.distFromCentre);
  const sweptR = swept.map((m) => m.cam.distFromCentre);
  // The sector count is capped by the sweep resolution, not asserted at 12 flat: a control run
  // is deliberately coarse (`--sweeps 6`) and must go red on the arm it is testing, not on this.
  const wantBins = Math.min(12, SWEEPS);
  t('T2 · the census covers the whole ring, from the shot the director is actually holding',
    bins.size >= wantBins
    && Math.abs(Math.max(...sweptR) - Math.min(...sweptR)) < 0.05
    && Math.abs(sweptR[0] - liveR[0]) < 0.05,
    `${bins.size}/${wantBins} 30° sectors · live radius ${Math.min(...liveR)}–${Math.max(...liveR)} m`
    + ` (${(Math.max(...liveAz) - Math.min(...liveAz)).toFixed(1)}° of live walk in`
    + ` ${((LIVES - 1) * LIVE_GAP / 1000).toFixed(0)}s wall clock) · swept radius ${sweptR[0]} m`);

  /*
   * T3 · nothing culls a plate. `attachHeadNameTag` sets `frustumCulled = false` and the overlay
   * pass draws `CAPTION_LAYER` after the grade with `depthTest:false`, so a plate that is not
   * drawn can only be one somebody switched off.
   */
  t('T3 · no plate is ever culled or switched off, at any camera position',
    frames.every((m) => m.tags.filter((g) => g.drawn).length === CAST.length),
    `min drawn ${Math.min(...frames.map((m) => m.tags.filter((g) => g.drawn).length))}/${CAST.length}`);

  /*
   * T4 · the applied scale is the scale the shipped clamp asks for — recomputed here from the
   * three constants, so this follows a tune instead of fighting it. This is the arm that would
   * catch a plate silently shrunk on some camera positions.
   */
  const kErr = Math.max(...frames.flatMap((m) => m.tags.map((g) => Math.abs(g.k - kWant(g.dist)))));
  t('T4 · every plate is scaled by exactly the shipped distance clamp',
    kErr <= 0.02, `worst |k applied − k wanted| = ${kErr.toFixed(3)}`);

  /*
   * T5 · the locked rule, as a number: legible at distance. `circle-staging` C6 measured the
   * floor the last shrink bottomed out at; the far seats across a swept circle are the hardest
   * case there is for it.
   */
  const minH = Math.min(...frames.flatMap((m) => m.tags.filter((g) => g.onScreen).map((g) => g.h)));
  t(`T5 · every on-screen plate is at least ${FLOOR_PX}px tall`,
    minH >= FLOOR_PX, `smallest ${minH.toFixed(1)}px over ${frames.length} camera positions`);

  /*
   * T6 · the shot holds the circle. If a plate leaves the frame the shot has cropped a
   * contestant out of the show, which is a director question and not a tag question — but it is
   * the first of the four explanations and it has to be ruled in or out by measurement.
   */
  const offFrames = frames.filter((m) => m.tags.some((g) => !g.fullyOnScreen));
  t('T6 · every plate is inside the frame at every camera position',
    offFrames.length === 0,
    offFrames.length
      ? `${offFrames.length}/${frames.length} positions crop a plate`
        + ` (worst az ${offFrames[0].cam.azimuth}°)`
      : `all ${frames.length} positions hold all ${CAST.length}`);

  /*
   * T7 · THE ONE THE PHOTOGRAPH WAS ABOUT. Tags overlapping is not a defect (John, 2026-08-28).
   * A name completely swallowed by a nearer plate is not overlap, it is a missing contestant.
   */
  let worstPair = null;
  for (const m of frames) {
    for (const g of m.tags) {
      if (!worstPair || g.buried > worstPair.buried) {
        worstPair = { buried: g.buried, name: g.name, seat: g.seat, az: m.cam.azimuth, arm: m.arm };
      }
    }
  }
  t(`T7 · no name is more than ${(BURIED_MAX * 100).toFixed(0)}% buried under a nearer plate`,
    frames.every((m) => m.tags.every((g) => g.buried <= BURIED_MAX)),
    `worst ${(worstPair.buried * 100).toFixed(0)}% — seat ${worstPair.seat} ${worstPair.name}`
    + ` at azimuth ${worstPair.az}° (${worstPair.arm})`);

  /* ---- the reading, in one line ------------------------------------------------------------ */
  const readCounts = frames.map((m) => line(m).rs);
  const cleanCounts = frames.map((m) => line(m).cl);
  console.log(`\n  reading · names a viewer can read: ${Math.min(...readCounts)}–${Math.max(...readCounts)}`
    + ` of ${CAST.length} (median ${readCounts.slice().sort((a, b) => a - b)[readCounts.length >> 1]})`);
  console.log(`  reading · names readable with room to spare (<${BURIED_CLEAN * 100}% buried):`
    + ` ${Math.min(...cleanCounts)}–${Math.max(...cleanCounts)} of ${CAST.length}`);
  const bandOut = frames[0].tags.filter((g) => g.dist < BAND[0] || g.dist > BAND[1]).length;
  console.log(`  reading · seats outside the constant-size band ${BAND[0].toFixed(2)}–${BAND[1].toFixed(2)} m:`
    + ` ${bandOut}/${CAST.length} at the first position`);

  await writeFile(path.join(SHOTDIR, `census${CONTROL ? `-${CONTROL}` : ''}.json`),
    JSON.stringify({ spec: SPEC, floorPx: FLOOR_PX, buriedMax: BURIED_MAX, control: CONTROL, home, probe, frames }, null, 2));
  console.log(`\n  census${CONTROL ? `-${CONTROL}` : ''}.json in progress/tagcensus/`);
  console.log(`  ${pass} ok · ${fail} fail\n`);
  exitCode = fail ? 1 : 0;
} catch (e) {
  console.log(`\ntag-census died: ${e?.message}\n${e?.stack || ''}\n`);
} finally {
  if (!KEEP) {
    await browser.close().catch(() => {});
    for (const k of kids) k.kill();
  }
  process.exit(exitCode);
}
