/**
 * gadget-owner-7 scratch probe: SCREEN-SPACE geometry facts for the skate and grapple shots.
 *
 * WHY. Two of this round's questions cannot be answered from the source:
 *
 *  1. "The lean is tamer than the art." `views/gadget.js` puts the carve on `unit.root` as
 *     `rotation.set(0, yaw, roll)`. With three's default XYZ order that is Ry(yaw)*Rz(roll),
 *     i.e. a ROLL ABOUT THE BODY'S OWN FORWARD AXIS applied first and then yawed by -80
 *     degrees — which points that axis nearly along the image plane's horizontal, so the
 *     bank moves the head into DEPTH rather than across the frame. This is the identical
 *     trap HANDOFF records for the hunter's stage-1 stoop. The claim needs measuring in
 *     SCREEN space, not asserting from trigonometry, so this reports the projected tilt of
 *     the hip->crown axis in degrees off vertical.
 *
 *  2. "Where is the floor in frame?" `_studio.js`'s cyc carries a FLAT run only over
 *     z in [0, 3.8] before it curves up; a ground decal outside that band is floating in
 *     front of a wall. This projects a lattice of y=0 world points to capture pixels so the
 *     decal can be sized off the frame instead of guessed.
 *
 * Also `--clear`: the minimum world distance between a named gadget subtree and the wearer's
 * thigh meshes, which is the grapple's thigh-clearance gate.
 *
 *   node harness/_g7_skate.mjs --view gadget.skates
 *   node harness/_g7_skate.mjs --view gadget.grapple --clear
 *
 * RUN `npm run build` FIRST — this serves dist/, not the working tree.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const has = (n) => argv.includes(`--${n}`);
const VIEW = opt('view', 'gadget.skates');
const AT = opt('at', null);
const PORT = Number(opt('port', '5199'));
const SHOTW = 1920, SHOTH = 1080;

const srv = spawn(process.execPath, ['harness/serve.mjs', '--port', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1800));
const browser = await chromium.launch({ args: ['--use-angle=default', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message ?? e)));
let url = `http://127.0.0.1:${PORT}/?view=${encodeURIComponent(VIEW)}&capture=1&quality=medium`;
if (AT) url += `&at=${AT}`;
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(
  () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
  null, { timeout: 180000 });
await page.evaluate(() => window.__rrr.settle(12));

const res = await page.evaluate(({ SHOTW, SHOTH, CLEAR }) => {
  const eng = window.__rrr.engine;
  const cam = eng.camera;
  const V3 = cam.position.constructor;
  eng.scene.updateMatrixWorld(true);

  const toPx = (v) => {
    const p = v.clone().project(cam);
    return [ (p.x * 0.5 + 0.5) * SHOTW, (-p.y * 0.5 + 0.5) * SHOTH, p.z ];
  };

  // ---- 1. named joints, in world and in capture pixels
  const unit = [];
  eng.scene.traverse((o) => { if (o.userData?.isUnitRoot) unit.push(o); });
  const joints = {};
  const wanted = ['head', 'neck', 'chest', 'spine', 'hips', 'pelvis', 'root',
                  'hipL', 'hipR', 'kneeL', 'kneeR', 'ankleL', 'ankleR',
                  'shoulderL', 'shoulderR', 'elbowL', 'elbowR'];
  eng.scene.traverse((o) => {
    if (!o.name) return;
    const n = o.name.replace(/^j\./, '');
    if (wanted.includes(n) && !joints[n]) {
      const w = o.getWorldPosition(new V3());
      joints[n] = { world: [w.x, w.y, w.z].map((v) => +v.toFixed(4)), px: toPx(w).slice(0, 2).map((v) => +v.toFixed(1)) };
    }
  });

  // ---- 2. crown and sole from the actual rendered vertices of the wearer
  //  (a joint named 'head' is a pivot, not the top of the skull)
  let crown = null, lowest = null, minY = Infinity, maxY = -Infinity;
  const tmp = new V3();
  eng.scene.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    let vis = true; for (let p = o; p; p = p.parent) if (p.visible === false) vis = false;
    if (!vis) return;
    if (o.material?.transparent) return;         // flames and filters are not the body
    const pa = o.geometry?.attributes?.position; if (!pa) return;
    for (let i = 0; i < pa.count; i++) {
      tmp.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld);
      if (tmp.y > maxY) { maxY = tmp.y; crown = tmp.clone(); }
      if (tmp.y < minY) { minY = tmp.y; lowest = tmp.clone(); }
    }
  });

  // ---- 2b. per-skate ground contact. "The figure is dropped so the wheels touch y=0" is
  // only true of the LOWEST wheel; a pitched figure can stand on one skate with the other in
  // the air, which photographs as falling over. Report each skate separately.
  const skates = [];
  eng.scene.traverse((o) => {
    if (o.name !== 'skate') return;
    let lo = Infinity;
    o.traverse((m) => {
      if (!m.isMesh || !m.visible || m.material?.transparent) return;
      if (!/tyre|tread|wheelHub/.test(m.name || '')) return;
      const pa = m.geometry?.attributes?.position; if (!pa) return;
      for (let i = 0; i < pa.count; i++) {
        tmp.fromBufferAttribute(pa, i).applyMatrix4(m.matrixWorld);
        if (tmp.y < lo) lo = tmp.y;
      }
    });
    skates.push(+lo.toFixed(4));
  });

  // ---- 3. floor lattice: where does the y=0 plane land in capture pixels?
  const floor = [];
  for (const z of [3.8, 3.0, 2.0, 1.0, 0.0, -0.6]) {
    const row = [];
    for (const x of [-2.5, -1.2, 0, 1.2, 2.5]) row.push(toPx(new V3(x, 0, z)).map((v) => +v.toFixed(0)));
    floor.push({ z, px: row });
  }

  // ---- 4. thigh clearance (grapple)
  let clearance = null, hang = null;
  if (CLEAR) {
    const gadgetMeshes = [], thighMeshes = [];
    const under = (o, pred) => { for (let p = o; p; p = p.parent) if (pred(p)) return true; return false; };
    eng.scene.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      let vis = true; for (let p = o; p; p = p.parent) if (p.visible === false) vis = false;
      if (!vis) return;
      if (o.material?.transparent) return;
      // These are the `root.name` values the builders in src/gadgets/index.js actually set —
      // read off the file, not guessed. An earlier guess ('grapplingHook') matched nothing and
      // the probe cheerfully reported a clearance of Infinity over 0 vertex pairs, which is
      // the "a probe that cannot observe must report SKIP, never PASS" failure in miniature.
      const inGadget = under(o, (p) => /^(grapple|nailgun|oilLobber|ballGun|rocketSkates)$/.test(p.name || ''));
      const inThigh = under(o, (p) => /^j\.(hip|knee)[LR]$/.test(p.name || ''));
      if (inGadget) gadgetMeshes.push(o);
      else if (inThigh) thighMeshes.push(o);
    });
    const pts = (list, stride) => {
      const out = [];
      for (const o of list) {
        const pa = o.geometry?.attributes?.position; if (!pa) continue;
        for (let i = 0; i < pa.count; i += stride) {
          out.push(tmp.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld).clone());
        }
      }
      return out;
    };
    const A = pts(gadgetMeshes, 3), B = pts(thighMeshes, 3);

    // The gadget's own HANG AXIS on screen. The rig numbers say what was asked for; this says
    // what the camera sees, which also carries the gadget's built-in forward tilt and the rest
    // of the arm's rotations. Top and bottom vertex of the gadget subtree, in capture pixels.
    if (A.length) {
      let top = A[0], bot = A[0];
      for (const p of A) { if (p.y > top.y) top = p; if (p.y < bot.y) bot = p; }
      const tp = toPx(top), bp = toPx(bot);
      const ddx = bp[0] - tp[0], ddy = bp[1] - tp[1];
      hang = {
        deg: +(Math.atan2(ddx, ddy) * 180 / Math.PI).toFixed(2),
        topPx: tp.slice(0, 2).map((v) => +v.toFixed(0)),
        botPx: bp.slice(0, 2).map((v) => +v.toFixed(0)),
      };
    }
    let best = Infinity, bestPair = null;
    for (const a of A) for (const b of B) {
      const d = a.distanceTo(b);
      if (d < best) { best = d; bestPair = [a.clone(), b.clone()]; }
    }
    if (!A.length || !B.length) {
      clearance = { skip: `SKIP — gadget pts ${A.length}, thigh pts ${B.length}` };
    } else clearance = {
      minDist: +best.toFixed(4),
      gadgetPts: A.length, thighPts: B.length,
      at: bestPair ? {
        gadget: bestPair[0].toArray().map((v) => +v.toFixed(3)),
        thigh: bestPair[1].toArray().map((v) => +v.toFixed(3)),
        px: toPx(bestPair[0]).slice(0, 2).map((v) => +v.toFixed(0)),
      } : null,
    };
  }

  return {
    camera: { pos: cam.position.toArray().map((v) => +v.toFixed(3)), fov: cam.fov },
    joints,
    crown: crown ? { world: crown.toArray().map((v) => +v.toFixed(4)), px: toPx(crown).slice(0, 2).map((v) => +v.toFixed(1)) } : null,
    lowest: lowest ? { world: lowest.toArray().map((v) => +v.toFixed(4)), px: toPx(lowest).slice(0, 2).map((v) => +v.toFixed(1)) } : null,
    floor,
    clearance,
    hang,
    skates,
  };
}, { SHOTW, SHOTH, CLEAR: has('clear') });

const J = res.joints;
const hipMid = J.hipL && J.hipR
  ? { px: [(J.hipL.px[0] + J.hipR.px[0]) / 2, (J.hipL.px[1] + J.hipR.px[1]) / 2],
      world: [0, 1, 2].map((i) => (J.hipL.world[i] + J.hipR.world[i]) / 2) }
  : null;

console.log(`view ${VIEW}${AT ? ` --at ${AT}` : ''}  camera ${res.camera.pos.join(', ')} fov ${res.camera.fov}`);
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 3));

console.log('\njoints (world xyz | capture px):');
for (const k of Object.keys(J)) console.log(`  ${k.padEnd(11)} ${J[k].world.join(', ').padEnd(28)} ${J[k].px.join(', ')}`);
if (res.crown) console.log(`  ${'CROWN'.padEnd(11)} ${res.crown.world.join(', ').padEnd(28)} ${res.crown.px.join(', ')}`);
if (res.lowest) console.log(`  ${'LOWEST'.padEnd(11)} ${res.lowest.world.join(', ').padEnd(28)} ${res.lowest.px.join(', ')}`);

// The CROWN scan picks up the cyc, which is a scene mesh like any other; the head JOINT is
// the honest landmark and is what the art was measured against.
const headRef = J.head ?? res.crown;
if (hipMid && headRef) {
  const dx = headRef.px[0] - hipMid.px[0];
  const dy = hipMid.px[1] - headRef.px[1];              // screen y grows downward
  const screenTilt = Math.atan2(dx, dy) * 180 / Math.PI;
  const wdx = headRef.world[0] - hipMid.world[0];
  const wdz = headRef.world[2] - hipMid.world[2];
  const wdy = headRef.world[1] - hipMid.world[1];
  console.log('\nTRUNK AXIS hip-midpoint -> head joint   (bar art measures ~35 deg on screen)');
  console.log(`  SCREEN tilt off vertical : ${screenTilt.toFixed(2)} deg   (dx ${dx.toFixed(1)} px, dy ${dy.toFixed(1)} px)`);
  console.log(`  world lateral X ${wdx.toFixed(4)}   depth Z ${wdz.toFixed(4)}   up Y ${wdy.toFixed(4)}`);
  console.log(`  world tilt off vertical  : ${(Math.atan2(Math.hypot(wdx, wdz), wdy) * 180 / Math.PI).toFixed(2)} deg`);
}

if (res.skates?.length) {
  console.log('\nSKATE GROUND CONTACT (lowest wheel vertex, world y; 0 = on the floor):');
  res.skates.forEach((y, i) => console.log(`  skate ${i}: ${y.toFixed(4)} m`));
}

console.log('\nfloor y=0 lattice, capture px [x,y] at x = -2.5 / -1.2 / 0 / 1.2 / 2.5:');
for (const r of res.floor) {
  console.log(`  z=${String(r.z).padStart(5)}  ` + r.px.map((p) => `[${p[0]},${p[1]}]`).join(' '));
}

if (res.clearance?.skip) {
  console.log(`\nCLEARANCE ${res.clearance.skip}`);
} else if (res.clearance) {
  console.log('\nCLEARANCE gadget subtree -> thigh/shin meshes');
  console.log(`  min distance ${res.clearance.minDist} m   (${res.clearance.gadgetPts} x ${res.clearance.thighPts} vertex pairs)`);
  if (res.clearance.at) {
    console.log(`  closest gadget pt ${res.clearance.at.gadget.join(', ')}`);
    console.log(`  closest thigh  pt ${res.clearance.at.thigh.join(', ')}`);
    console.log(`  at capture px    ${res.clearance.at.px.join(', ')}`);
  }
}
if (res.hang) {
  console.log('\nGADGET HANG AXIS (top vertex -> bottom vertex, in capture px)');
  console.log(`  screen tilt off vertical : ${res.hang.deg} deg   top ${res.hang.topPx.join(',')}  bottom ${res.hang.botPx.join(',')}`);
}

await browser.close();
srv.kill();
