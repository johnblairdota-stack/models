import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Engine } from '../core/engine.js';

/**
 * Shared harness for every "judge one thing" view.
 *
 * `studio()`  — the near-white cyc, soft key + fill + rim, neutral grade. This reproduces
 *               the lighting of the Dev Art sheets so a model can be compared against
 *               them honestly, without the game's grade doing the flattering.
 * `estate()`  — the game's real lighting: near-black, one or two motivated sources.
 *
 * Both build a PMREM environment from a procedural scene, because with this few real
 * lights the IBL is doing most of the work and a flat ambient reads as plastic.
 *
 * ---------------------------------------------------------------------------------------
 * ORBIT / READOUT / --cam (camtool-1). DEV-ONLY, three independent, individually-gated
 * pieces — read this before touching any of them:
 *
 *   1. `?orbit=1` — mouse-orbit the camera live, plus a paste-ready readout of the current
 *      cameraPos/target/fov (with a copy button) and, where the view supplies a `roomBox`,
 *      a live floor/ceiling/wall composition fraction ported from `harness/_eo13_cam.mjs`.
 *      HARD-GATED on `!engine.capture` — see `orbitEnabled()` below — so this can never
 *      exist on anything `shoot.mjs` (or any other capture-mode page load) touches, and it
 *      is further gated behind the query flag so the default LIVE path is unchanged too:
 *      opening a view with no `?orbit=1` never even constructs `OrbitControls`.
 *   2. `?campose=x,y,z,tx,ty,tz,fov` — override the initial camera regardless of capture
 *      mode, so a shot found by orbiting can be handed to an agent and re-shot verbatim.
 *      Deliberately NOT named `?cam=` — `room-ballroom.js` already owns that name for its
 *      own named-preset selector (`?cam=r10|overlook`) and that selection also drives a
 *      grade choice (`CAM_GRADE`) coupled to which preset is live; a same-named generic
 *      override would silently fight it, which is exactly the "toggle that doesn't revert
 *      every piece of state it implies" class of bug this project has been burned by
 *      (HANDOFF, `critic-estate-11`, the `?cam=r10` incomplete-revert finding). `--cam` on
 *      `harness/shoot.mjs` writes this parameter.
 *   3. A view that drives its own camera every frame (only `game.js`'s `ThirdPersonCamera`
 *      does, of the views that import this module) must pass `orbit: false` to `estate()`/
 *      `studio()` to hard-disable orbit even under `?orbit=1` — `game.js` already does.
 *
 * Absent BOTH query flags, on a capture page load OR a live one, every line below this
 * comment is a no-op and the render is exactly what it was before any of this existed.
 * ---------------------------------------------------------------------------------------
 */

/** `?campose=` wins over everything the view itself asked for — see the header above. */
function applyCamOverride(camera, target) {
  const raw = new URLSearchParams(location.search).get('campose');
  if (!raw) return false;
  const parts = raw.split(',').map(Number);
  if (parts.length !== 7 || parts.some((n) => !Number.isFinite(n))) {
    console.warn(`?campose= needs 7 comma-separated numbers "x,y,z,tx,ty,tz,fov", got "${raw}"`);
    return false;
  }
  const [x, y, z, tx, ty, tz, fov] = parts;
  camera.position.set(x, y, z);
  target.set(tx, ty, tz);
  camera.lookAt(target);
  camera.fov = fov;
  camera.updateProjectionMatrix();
  return true;
}

/**
 * Orbit is opt-in on TOP of the capture guard, not instead of it: `opts.orbit === false`
 * (a view driving its own camera) always wins, `engine.capture` always wins next — nothing
 * can override either — and only then does `opts.orbit === true` or a live `?orbit=1`
 * switch it on. No view currently passes `orbit: true`; every existing caller's default
 * behaviour is therefore "off", matching what it was before orbit existed at all.
 */
function orbitEnabled(engine, opts) {
  if (opts.orbit === false) return false;
  if (engine.capture) return false;
  if (opts.orbit === true) return true;
  return new URLSearchParams(location.search).get('orbit') === '1';
}

/**
 * ITEM 2 — live composition readout, ported from `harness/_eo13_cam.mjs`'s own ray-cast:
 * for a subsampled NDC grid, cast the pixel's ray out of the camera and report which face
 * of `box` (a world-space room AABB) it exits through first. Floor/ceiling/wall fractions
 * of the frame this way are pure geometry — immune to lighting, grade and clutter, which is
 * why the harness script could measure the ballroom reframe (floor 30.5% -> 40.3%, ceiling
 * 20.7% -> 3.7%) as a fact about the CAMERA rather than about pixels. This collapses the
 * harness script's four directional wall buckets (win/mir/end/near, named for the ballroom's
 * own geometry) into one "wall" bucket, because a generic multi-room overlay has no business
 * naming a wall after a room-specific feature.
 *
 * 64x36 = 2304 rays of pure arithmetic, no GPU readback — cheap enough to run every frame,
 * but throttled anyway (see `installOrbitTools`) since 10 Hz is plenty for a human eye.
 *
 * ⚠️ RETURNS `{ invalid: <reason string> }` INSTEAD OF FRACTIONS WHEN THE MEASUREMENT CANNOT
 * BE TRUSTED — caught by a critic reproducing a production build: a canvas/viewport that has
 * never been sized (`camera.aspect` non-finite or <= 0, e.g. a resize that ran before the
 * container had real dimensions, or never ran at all) collapses every ray's horizontal
 * component through `ndcx * th * aspect`, and the failure printed a PLAUSIBLE-LOOKING WRONG
 * NUMBER — `floor 0.0% ceil 0.0% wall 0.0% out 100.0%` — instead of erroring, which is exactly
 * the "captures lie" class of instrument fault HANDOFF is full of scars from. Two independent
 * checks, because either one alone can be fooled: (1) the inputs themselves — a non-finite or
 * non-positive aspect/fov is never a real camera state; (2) the OUTPUT against a geometric
 * invariant a plausible-but-wrong number can't satisfy — a ray cast from a point INSIDE a
 * closed box always exits through some face, so "every ray reported out" while `camera.position`
 * is inside `box` is proof the ray math failed, not a measurement of an empty room.
 */
function compositionReadout(camera, box) {
  const GX = 64, GY = 36;
  const aspect = camera.aspect;
  const th = Math.tan((camera.fov * Math.PI) / 360);
  if (!Number.isFinite(aspect) || aspect <= 0 || !Number.isFinite(th) || th <= 0) {
    return { invalid: `camera.aspect=${aspect}, fov=${camera.fov} — no valid viewport yet ` +
      `(0-sized canvas / a resize that never reached this camera), not a real measurement` };
  }
  // Never trust a matrix that might be a stale prior frame's: `installOrbitTools` runs inside
  // `engine.onUpdate`, which fires BEFORE `pipeline.render()` for this frame, and OrbitControls'
  // own `ctrl.update()` (registered just before this) only moves `camera.position`/`quaternion`
  // — `matrixWorld` is normally refreshed by the renderer, one step later. Camera has no
  // parent, so this is a cheap, pure, always-safe recompute.
  camera.updateMatrixWorld();
  const m = camera.matrixWorld.elements;
  const bx = [m[0], m[1], m[2]], by = [m[4], m[5], m[6]], bz = [m[8], m[9], m[10]];
  const p = camera.position;
  const counts = { floor: 0, ceil: 0, wall: 0, out: 0 };
  let n = 0;
  for (let iy = 0; iy < GY; iy++) {
    const ndcy = 1 - ((iy + 0.5) / GY) * 2;
    for (let ix = 0; ix < GX; ix++) {
      const ndcx = ((ix + 0.5) / GX) * 2 - 1;
      const cx = ndcx * th * aspect, cy = ndcy * th, cz = -1;
      const dx = bx[0] * cx + by[0] * cy + bz[0] * cz;
      const dy = bx[1] * cx + by[1] * cy + bz[1] * cz;
      const dz = bx[2] * cx + by[2] * cy + bz[2] * cz;
      let best = Infinity, face = 'out';
      const hit = (t, f) => { if (t > 1e-6 && t < best) { best = t; face = f; } };
      if (dy < 0) hit((box.y0 - p.y) / dy, 'floor'); else if (dy > 0) hit((box.y1 - p.y) / dy, 'ceil');
      if (dx < 0) hit((box.x0 - p.x) / dx, 'wall'); else if (dx > 0) hit((box.x1 - p.x) / dx, 'wall');
      if (dz < 0) hit((box.z0 - p.z) / dz, 'wall'); else if (dz > 0) hit((box.z1 - p.z) / dz, 'wall');
      counts[face] = (counts[face] || 0) + 1;
      n++;
    }
  }
  const insideBox = p.x > box.x0 && p.x < box.x1 && p.y > box.y0 && p.y < box.y1
    && p.z > box.z0 && p.z < box.z1;
  if (counts.out === n && insideBox) {
    return { invalid: `all ${n} sampled rays exited "out" while the camera sits INSIDE the ` +
      `room box (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}) — geometrically ` +
      `impossible from inside a closed box, so the ray math failed, not the room` };
  }
  return {
    floor: 100 * counts.floor / n,
    ceil: 100 * counts.ceil / n,
    wall: 100 * counts.wall / n,
    out: 100 * counts.out / n,
  };
}

/**
 * ITEM 1's readout: a paste-ready `{ cameraPos, target, fov }` block — the exact shape
 * `studio()`/`estate()` themselves take, and the shape most views' own `CAM_DEF`-style
 * constants use — plus a copy button, plus (when `roomBox` is supplied) the composition
 * fractions above. Only ever constructed when `orbitEnabled()` already returned true, so
 * this never exists on a page that didn't ask for it.
 */
function installOrbitTools(engine, camera, target, ctrl, roomBox) {
  const panel = document.createElement('div');
  panel.style.cssText = `position:fixed;right:8px;bottom:8px;z-index:60;
    font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;color:#c8e6ff;
    background:rgba(6,10,16,.82);padding:10px 12px;border:1px solid rgba(120,180,255,.28);
    border-radius:6px;white-space:pre;letter-spacing:.02em;backdrop-filter:blur(6px);
    max-width:380px;pointer-events:auto`;
  const pre = document.createElement('div');
  panel.appendChild(pre);

  const btn = document.createElement('button');
  btn.textContent = 'copy';
  btn.style.cssText = `margin-top:7px;font:11px ui-monospace,SFMono-Regular,Menlo,monospace;
    padding:3px 11px;cursor:pointer;background:rgba(120,180,255,.16);color:#c8e6ff;
    border:1px solid rgba(120,180,255,.35);border-radius:4px`;
  let lastText = '';
  btn.addEventListener('click', () => {
    (navigator.clipboard?.writeText(lastText) ?? Promise.reject())
      .then(() => { btn.textContent = 'copied'; setTimeout(() => { btn.textContent = 'copy'; }, 900); })
      .catch(() => { btn.textContent = 'copy failed'; setTimeout(() => { btn.textContent = 'copy'; }, 900); });
  });
  panel.appendChild(btn);
  document.body.appendChild(panel);

  let acc = 0;
  engine.onUpdate(() => {
    if (acc++ % 6) return;   // ~10 Hz at 60 fps — plenty for a live readout, cheap either way
    const p = camera.position, t = ctrl ? ctrl.target : target;
    const f = (v) => v.toFixed(2);
    lastText =
      `cameraPos: [${f(p.x)}, ${f(p.y)}, ${f(p.z)}],\n` +
      `target: [${f(t.x)}, ${f(t.y)}, ${f(t.z)}],\n` +
      `fov: ${Math.round(camera.fov)},`;
    let extra = '';
    if (roomBox) {
      const c = compositionReadout(camera, roomBox);
      if (c.invalid) {
        // LOUD, not a number that merely looks different — a critic must never be able to
        // mistake this for a measurement of an empty room. Distinct colour AND distinct
        // wording AND it never renders alongside a percentage on the same line.
        pre.style.color = '#ff6a5a';
        extra = `\n\n⚠ COMPOSITION READOUT INVALID — NOT A MEASUREMENT\n${c.invalid}`;
      } else {
        pre.style.color = '';
        extra = `\n\nfloor ${c.floor.toFixed(1)}%  ceil ${c.ceil.toFixed(1)}%  wall ${c.wall.toFixed(1)}%`
          + (c.out > 0.05 ? `  out ${c.out.toFixed(1)}%` : '');
      }
    }
    pre.textContent = lastText + extra;
  });
}

export async function studio(opts = {}) {
  const engine = new Engine({
    grade: opts.grade ?? 'studio',
    fov: opts.fov ?? 34,
    near: 0.02,
    far: 60,
    seed: opts.seed ?? 0x5eed,
    ao: opts.ao !== false,
    ...opts.engine,
  });

  const { scene, camera, renderer } = engine;
  scene.background = new THREE.Color(opts.bg ?? 0xf2f2f2).convertSRGBToLinear();

  // ---- cyc: a large curved backdrop so there is no horizon line, like the art sheets
  if (opts.cyc !== false) {
    const cycMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(opts.bg ?? 0xf2f2f2).convertSRGBToLinear(),
      roughness: 0.94, metalness: 0.0, side: THREE.DoubleSide,

      // THE BACKDROP ALWAYS LOSES A TIE.
      //
      // cycGeometry() starts with a flat run at y = 0 before the curve lifts off (see the
      // profile below), and almost every studio view lays its own floor as a plane at
      // y = 0 too — specimenRig() does, and mat-marble / mat-brass / mat-wallpaper each
      // add a 9x9 one. Those two surfaces are then EXACTLY COPLANAR over the whole near
      // field, and the depth test decides between them per fragment on rounding error.
      //
      // The result is the reason this comment exists. It does not look like z-fighting: at
      // a grazing camera the winner alternates in clean horizontal bands that get finer
      // toward the horizon, because depth precision degrades with distance. That reads
      // exactly like texture aliasing on a receding floor, and it was diagnosed as such
      // twice — first as shadow acne, then as a missing mip chain on the baker's
      // multiple-render-target output. Both were wrong. Measured on mat.wallpaper, whose
      // camera is near-horizontal so the coplanar region fills the bottom of frame:
      //
      //   ablation                          mean |row-to-row luminance delta|
      //   baseline                            108.1
      //   minFilter = NearestFilter           108.4   <- no mip/filter involvement at all
      //   normalMap / roughnessMap / map null 108.4   <- survives removing every texture
      //   renderer.shadowMap.enabled = false  108.4   <- not shadow acne
      //   depth prepass off                   108.4
      //   cyc.visible = false                   0.5   <- it was the cyc the whole time
      //
      // and painting the cyc red turned the dark bands red. The baker's mip chain is in
      // fact present and correct on all three MRT attachments — verified by attaching
      // levels 1, 2 and 6 to an FBO and reading them back — so do not go looking there.
      //
      // polygonOffset rather than sinking the cyc a few millimetres: nothing moves, so no
      // view's composition changes and objects resting on the cyc still sit at y = 0.
      // Factor 1 is slope-scaled, which is precisely the grazing-angle case that fights;
      // units barely register here (1/1 and 1/4 measure identically). Stronger values do
      // not clean it up any further, they just push the cyc back far enough to shift the
      // visible horizon, so 1/1 is the minimum that works and the right choice.
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const cyc = new THREE.Mesh(cycGeometry(14, 9, 3.2), cycMat);
    cyc.receiveShadow = true;
    cyc.position.z = -3.2;
    scene.add(cyc);
    engine.cyc = cyc;
  }

  // ---- lights: big soft key upper-left, broad fill, back rim
  //
  // CHANGE 2 — additive, opt-in, same contract as `contrast` above: at lightContrast 0
  // every existing caller gets exactly the rig it had, and only a view that asks for it
  // sees anything different.
  //
  // WHY THE RIG, NOT THE ENVIRONMENT. `robot.js`'s white shells are metalness 0, so their
  // read is the Lambertian sum of these three lights plus the IBL's diffuse term; round 22
  // raised envMapIntensity 1.0 -> 1.8 and measured NO visible change, which is the usual
  // sign that the thing you are turning up is not the thing in charge.
  //
  // What the numbers said, probed off `char.turnaround` before this landed:
  //
  //             sheet          render        what it means
  //   thigh     p05-p95 57     p05-p95 25    the shells carry a gradient; ours did not
  //   knee ring p05 20         p05 78        the sheet's recess is near-black; ours grey
  //
  // and the diagnostic number: a fully lit shell was receiving 0.55 of a white surface's
  // irradiance while a RECESS was receiving 0.46 — a recess only 16% darker than a lit
  // face. That is not a shading bug, it is a rig with no dominant direction: a 0.85 fill
  // aimed from (3.6, 1.4, 3.0), i.e. almost straight down the camera axis, fills in every
  // form shadow it is physically able to reach. Killing the fill is what creates range;
  // raising the key restores the level the fill was propping up. The environment is left
  // ALONE on purpose — `mats.chrome` is metal, it has no diffuse term at all, and it is
  // lit by nothing else (see the CHANGE 1 note above), so touching envIntensity to fix the
  // shells would have paid for them with the chrome.
  const lc = Math.min(1, Math.max(0, opts.lightContrast ?? 0));
  const L = (a, b) => THREE.MathUtils.lerp(a, b, lc);

  /*
   * CHANGE 6 (lighting round, `mesh.animated`) — PER-LAMP GAINS, and they are a THIRD knob
   * rather than a wider `lightContrast` because the two want opposite things.
   *
   * `lightContrast` is a single lerp along ONE line: key up AND fill down AND rim up, together.
   * That line is `char.turnaround`'s answer, where the goal was to CREATE range in the white
   * shells. This view's whites are already signed off at their current range and only need their
   * LEVEL paid back after the environment goes dark, so it needs to move the key without
   * dragging the fill down with it — a point that is not on that line at any `lightContrast`.
   *
   * Absent, every multiplier is 1 and this is arithmetic that cannot change a value: every
   * existing caller gets exactly `L(...)`, byte for byte, at any `lightContrast`.
   */
  const lg = opts.lightGain ?? {};
  const gK = lg.key ?? 1, gF = lg.fill ?? 1, gR = lg.rim ?? 1;

  const key = new THREE.DirectionalLight(0xfff6ec, L(2.5, 4.40) * gK);
  key.position.set(-3.1, 4.6, 4.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 20;
  const s = opts.shadowExtent ?? 2.4;
  Object.assign(key.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 3;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xdfeaff, L(0.85, 0.20) * gF);
  fill.position.set(3.6, 1.4, 3.0);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffffff, L(1.5, 1.85) * gR);
  rim.position.set(1.2, 2.4, -4.4);
  scene.add(rim);

  engine.lights = { key, fill, rim };

  // ---- IBL
  engine.scene.environment = buildStudioEnv(renderer, {
    contrast: opts.contrast ?? 0,
    // `envRoom` / `envPanels` default to undefined, so every existing caller asks for the same
    // environment it always did and gets the same cached texture back. See buildStudioEnv.
    room: opts.envRoom,
    panels: opts.envPanels,
  });
  engine.scene.environmentIntensity = opts.envIntensity ?? 1.0;

  // ---- camera + orbit
  camera.position.set(...(opts.cameraPos ?? [0, 1.1, 4.2]));
  const target = new THREE.Vector3(...(opts.target ?? [0, 1.0, 0]));
  camera.lookAt(target);
  applyCamOverride(camera, target);   // ?campose= — see the header comment above

  if (orbitEnabled(engine, opts)) {
    const ctrl = new OrbitControls(camera, renderer.domElement);
    ctrl.target.copy(target);
    ctrl.enableDamping = true;
    ctrl.dampingFactor = 0.08;
    ctrl.minDistance = 0.3;
    ctrl.maxDistance = 24;
    engine.controls = ctrl;
    engine.onUpdate(() => ctrl.update());
    installOrbitTools(engine, camera, target, ctrl, opts.roomBox);
  }

  engine.target = target;
  return engine;
}

export async function estate(opts = {}) {
  const engine = new Engine({
    grade: opts.grade ?? 'estate',
    fov: opts.fov ?? 68,
    near: 0.05,
    far: opts.far ?? 140,
    seed: opts.seed ?? 0x5eed,
    ...opts.engine,
  });
  engine.scene.background = new THREE.Color(0x05070b);
  engine.scene.environment = buildEstateEnv(engine.renderer);
  engine.scene.environmentIntensity = opts.envIntensity ?? 0.16;

  engine.camera.position.set(...(opts.cameraPos ?? [0, 1.55, 5]));
  const target = new THREE.Vector3(...(opts.target ?? [0, 1.3, 0]));
  engine.camera.lookAt(target);
  applyCamOverride(engine.camera, target);   // ?campose= — see the header comment above

  if (orbitEnabled(engine, opts)) {
    const ctrl = new OrbitControls(engine.camera, engine.renderer.domElement);
    ctrl.target.copy(target);
    ctrl.enableDamping = true;
    ctrl.dampingFactor = 0.08;
    engine.controls = ctrl;
    engine.onUpdate(() => ctrl.update());
    installOrbitTools(engine, engine.camera, target, ctrl, opts.roomBox);
  }
  engine.target = target;
  return engine;
}

// ---------------------------------------------------------------------------

/**
 * PER-MATERIAL ENVIRONMENT RESPONSE — and the reason nobody has been able to get one.
 *
 * `material.envMapIntensity` DOES NOTHING in any view in this project. Not "not much";
 * nothing. three's WebGLRenderer, `three.module.js`:
 *
 *     if ( material.envMap ) {                                    // WebGLMaterials
 *         uniforms.envMapIntensity.value = material.envMapIntensity;
 *     }
 *     if ( material.isMeshStandardMaterial &&                     // WebGLRenderer
 *          material.envMap === null && scene.environment !== null ) {
 *         m_uniforms.envMapIntensity.value = scene.environmentIntensity;
 *     }
 *
 * Every material in this project lights from `scene.environment` and none of them sets its
 * own `envMap`, so the second branch fires for all of them and the value each material
 * authored is overwritten before it reaches the shader. `chromeSatin`'s carefully argued
 * 2.4, `mintCap`'s deliberately quiet 0.55, `shellWhite`'s 1.0 — all of them have been
 * running at whatever `scene.environmentIntensity` happened to be. This is the mechanism
 * behind round 22's "raised envMapIntensity 1.0 -> 1.8 and measured no visible change",
 * which was recorded as a fact about the shells being diffuse-bound. It was not; it was
 * this. It also means the whole model has had exactly ONE environment knob, scene-wide,
 * which is why lowering it to fix the shells took the chrome to a median luminance of 6.
 *
 * Assigning the material the very same texture as its own `envMap` flips it to the first
 * branch: identical sampling, identical cost, but its own intensity is finally honoured.
 *
 * Opt-in and per material, so nothing that does not call this changes.
 */
export function setEnvResponse(engine, material, intensity) {
  for (const m of Array.isArray(material) ? material : [material]) {
    m.envMap = engine.scene.environment;
    m.envMapIntensity = intensity;
    m.needsUpdate = true;
  }
  return material;
}

/** A cyclorama: floor plane curving up into a back wall. No visible seam. */
function cycGeometry(width, height, radius) {
  const shape = new THREE.Shape();
  // profile in the y-z plane, extruded along x
  const pts = [];
  const depth = 7;
  pts.push(new THREE.Vector2(0, depth));
  pts.push(new THREE.Vector2(0, radius));
  const segs = 14;
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 0.5;
    pts.push(new THREE.Vector2(radius - Math.cos(a) * radius, radius - Math.sin(a) * radius));
  }
  pts.push(new THREE.Vector2(height, 0));

  const geo = new THREE.BufferGeometry();
  const verts = [], norms = [], uvs = [], idx = [];
  const half = width / 2;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    for (let j = 0; j < 2; j++) {
      verts.push(j === 0 ? -half : half, p.x, p.y);
      uvs.push(j, i / (pts.length - 1));
    }
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
    idx.push(a, c, b, b, c, d);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/*
 * ONE CACHE SLOT PER DISTINCT ENVIRONMENT, KEYED BY THE PARAMETERS THAT BUILD IT.
 *
 * This was two named slots (`_studioEnv`, `_studioEnvContrast`) while there were exactly two
 * environments. There are now three — see CHANGE 6 below — and a third named variable is the
 * shape of bug the two-slot version was written to avoid in the first place: a caller getting
 * another caller's cached texture back. A Map keyed by the arguments cannot do that.
 *
 * ⚠️ THE KEY COLLAPSES TO THE STRING '0' FOR EVERY LOW-CONTRAST CALLER, deliberately. At
 * `contrast <= 0` not one line below reads `room`, so two callers that differ only in a
 * parameter neither of them uses must not build two identical textures — `buildStudioEnv` is
 * shared by nearly every view in the project and a second 8 MB PMREM for nothing is a real cost.
 */
const _studioEnvCache = new Map();

export function buildStudioEnv(renderer, opts = {}) {
  const contrast = opts.contrast ?? 0;
  /*
   * CHANGE 6 (lighting round) — THE ROOM AND THE FLAGS COME APART, and the reason is a
   * measurement rather than tidiness.
   *
   * `contrast` used to drive two independent things through one number: the near-black FLAG
   * panels (which is what a metal reflects to get a dark core) and the darkening of the room
   * shell 0.72 -> 0.20 and floor bounce 0.62 -> 0.24 (which is the DC term of the whole dome,
   * i.e. what every metalness-0 white plate in the frame is lit by). `mesh.animated` needs the
   * first and cannot afford the second: raw `?meshcontrast=1` delivers the chrome's dark end —
   * upper-arm spread 151.5 -> 168.4 against the art's 163.9 — and takes the white forearm from
   * 188.8 down to 152.9 doing it, because a diffuse plate has no way to tell a dark flag from a
   * dark room.
   *
   * `room` defaults to `contrast`, so `char.turnaround` (contrast 1.0) and `mat.robot` ask for
   * exactly the environment they always asked for and hit the same cache key.
   */
  // NOT named `room` — that identifier is the room BOX MESH thirty lines below, and shadowing it
  // is a ReferenceError rather than a subtle bug, which is how this was caught. `roomC` is the
  // room's CONTRAST amount; `room` stays the thing it has always been.
  const roomC = opts.room ?? contrast;
  /*
   * CHANGE 7 (lighting round) — THE BRIGHT PANELS COME APART FROM THE FLAGS TOO, and this is the
   * second thing `contrast` was driving that only one caller wanted.
   *
   * CHANGE 3 replaced the broad 7x7 ceiling softbox and the broad left fill with a dimmed base
   * plus a NARROW STRIP each, to put a long vertical specular streak down `char.turnaround`'s
   * procedural legs. It is bound to `contrast > 0`, so a view that wants the dark flags gets the
   * strips whether or not they suit it.
   *
   * They do not suit this one. MEASURED on `mesh.animated`, upper arm, flags on and dome
   * unchanged: the strips cost the chrome's BRIGHT tail 26 levels (p95 217.3 -> 191.0) and the
   * white forearm with it, because a broad source is what a wide reflection lobe integrates into
   * a high value and a narrow one is mostly missed. The art's arm is skewed BRIGHT — p95 sits
   * 101 levels above its median while its p05 is only 63 below — so the bright tail is the half
   * this character cannot afford to spend.
   *
   * 'streak' is the CHANGE 3 pair and stays the default at any contrast > 0, so `char.turnaround`
   * and `mat.robot` are untouched. 'broad' is the original softbox pair, which is what every
   * contrast-0 caller has always had.
   */
  const panels = opts.panels ?? (contrast > 0 ? 'streak' : 'broad');
  const cacheKey = contrast <= 0 ? '0' : `${contrast}|${roomC}|${panels}`;
  const cached = _studioEnvCache.get(cacheKey);
  if (cached) return cached;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const s = new THREE.Scene();

  // a bright room: white box, one big soft ceiling panel, two side panels. At contrast > 0
  // the shell and floor bounce darken toward a near-black so the chrome and clearcoat have
  // something dark to reflect — see the change-1 note below the panel() helper. At
  // contrast === 0 this reproduces the original single-env code exactly.
  const t = Math.min(1, Math.max(0, contrast));
  // `tr` is the DOME axis (room shell + floor bounce); `t` is the FLAG axis. Identical whenever
  // `room` was not passed, which is every caller that existed before CHANGE 6.
  const tr = Math.min(1, Math.max(0, roomC));
  const roomV = THREE.MathUtils.lerp(0.72, 0.20, tr);
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(12, 8, 12),
    new THREE.MeshBasicMaterial({
      color: contrast > 0
        ? new THREE.Color(roomV, roomV * 1.0417, roomV * 1.0972)   // keep the original 0.72/0.75/0.79 ratio
        : new THREE.Color(0.72, 0.75, 0.79),
      side: THREE.BackSide,
    }));
  s.add(room);

  const panel = (w, h, d, x, y, z, c, i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(c[0] * i, c[1] * i, c[2] * i) }));
    m.position.set(x, y, z);
    s.add(m);
  };
  // bright panels unchanged at any contrast, so exposure does not move
  //
  // CHANGE 3 (round 26), inside the contrast > 0 branch only. A 7x7 ceiling panel is a
  // source about 30 degrees wide as the subject sees it, and a source that wide reflected
  // in a glossy shell is a WASH, not a highlight — which is the whole of "reads as flat
  // diffuse-only eggshell". The art's shells carry a long narrow specular streak running
  // down each panel, and that is a softbox with an aspect ratio: narrow across, long down
  // the axis of the form. A DirectionalLight cannot supply it (a delta source's specular
  // on clearcoatRoughness 0.032 is one pixel wide), so this has to live in the IBL.
  //
  // The broad panel is dimmed and a narrow strip added at an intensity that puts roughly
  // the same total energy back, so the exposure the mint tint and the grade were calibrated
  // against does not move: 49 sq units at 7.5 -> 49 at 4.5 plus 13.5 at 11.0.
  // A CEILING SOURCE CANNOT STREAK A LEG. The mirror direction of a near-vertical surface
  // seen from eye level points at the HORIZON, not at the roof, so the ceiling panel only
  // ever reaches the tops of the shoulders and the crown — which is exactly where the old
  // rig's only highlight was. The sheet's streaks run vertically down the thigh and the
  // forearm, and the source that makes those is a tall narrow strip standing beside the
  // subject. So the ceiling gets a strip for the horizontal surfaces and the left fill —
  // the side the key is on, so highlight and form shading agree — gets a vertical one.
  if (panels === 'streak') {
    panel(7, 0.1, 7, -1.2, 3.9, 1.0, [1.0, 0.97, 0.93], 4.5);     // ceiling, dimmed base
    panel(1.5, 0.1, 9, -1.6, 3.75, 0.6, [1.0, 0.98, 0.95], 11.0); // ceiling streak
    panel(0.1, 5, 6, -5.9, 1.4, 1.5, [0.95, 0.97, 1.0], 1.5);     // left fill, dimmed base
    panel(0.1, 7.0, 1.3, -5.85, 1.7, 1.7, [0.97, 0.98, 1.0], 7.0); // the vertical streak
  } else {
    panel(7, 0.1, 7, -1.2, 3.9, 1.0, [1.0, 0.97, 0.93], 7.5);   // ceiling softbox
    panel(0.1, 5, 6, -5.9, 1.4, 1.5, [0.95, 0.97, 1.0], 3.2);   // left fill
  }
  panel(0.1, 4, 5, 5.9, 1.0, 1.0, [1.0, 0.98, 0.95], 1.5);      // right kick
  panel(5, 3, 0.1, 0.5, 1.6, -5.9, [1.0, 1.0, 1.0], 2.4);       // back rim

  const floorV = contrast > 0 ? THREE.MathUtils.lerp(0.62, 0.24, tr) : 0.62;
  panel(12, 0.1, 12, 0, -3.9, 0, [floorV, floorV * 1.016, floorV * 1.065], 1.0);  // floor bounce

  // CHANGE 1 (round 22) — additive, opt-in only. `robot.js` says it about metals: "it is
  // ONLY what it reflects." This room had nothing dark in it at any envMapIntensity, which
  // is why chrome and clearcoat both read as a flat bright wash regardless of roughness —
  // there was no dark-to-bright gradient available to reflect. Two narrow dark flag panels
  // flanking the subject give the chrome something near-black to catch as it turns, without
  // touching the bright panels above (so exposure/key does not move).
  if (contrast > 0) {
    /*
     * CHANGE 5 (round 34) — THE DARK FLAGS GET BIGGER AS WELL AS DARKER: flanks 0.045 -> 0.028
     * and 6x4 -> 6.6x5.0, camera flag 0.020 -> 0.010 and 2.2 -> 3.4 wide. SIZE IS THE HALF THAT
     * WORKS, and change 4's own conclusion says why in the opposite direction.
     *
     * `critic-robot-34` reports the chrome as "roughly half the resolving contrast" of the
     * sheet, on an arm-tube patch measuring p05-p95 range 82 against the sheet's 165. That
     * specific pair does not reproduce, and it is not internally consistent either — the same
     * finding quotes the render's own band as (72-215), which is a range of 143, not 82.
     * Sampled honestly on the round-34 capture with `harness/_tmp_scan.mjs patch`, matching the
     * sheet's figure 1 arm-tube boxes to the render's:
     *
     *                        p05    p50    p95   p95-p05    min
     *   sheet  fig1 L        38.9  137.7  180.5    141.6     6.9
     *   sheet  fig1 R        49.1  148.0  213.1    164.0    17.2
     *   sheet  fig3/fig4     37-60 132-199 239-254  194-205   11-19
     *   render fig1 L        73.9  139.7  211.0    137.1    32.1
     *
     * So the RANGE is already within 3% of the sheet's own left-arm box and round 33's claimed
     * 135 reproduces almost exactly at 137. What does replicate, at every box on both images, is
     * that the sheet's chrome REACHES BLACK and ours does not: p05 39-60 against our 74, minimum
     * 7-19 against our 32. The tube's dark core is a floor problem, and a floor is set by the
     * darkest thing in the room the metal can find.
     *
     * That is a direct consequence of the numbers above it: the room shell at 0.20 through a 3.05
     * env response lands near 205, the flanks at 0.045 land near 103 and the camera flag at 0.020
     * near 69 — which is our p05 to within a value. Nothing in this room could ever have put 39
     * on a metal.
     *
     * DARKENING THEM ALONE DID ALMOST NOTHING, MEASURED. Taking the flags to 0.018/0.006 at their
     * old SIZE moved the p05 from 73.9 to 70.1 and the range from 137 to 141 — a rounding error,
     * and for the same reason change 4 gives for the bright pair: `chromeSatin` runs at roughness
     * 0.290 and the PMREM lobe it samples is far wider than a 0.1 x 6 x 4 panel, so the flag is
     * averaged away against the 0.20 room before the material ever sees it. What a small source
     * cannot do at either end of the scale, a LARGE one can. Three configurations, same box:
     *
     *                                    p05    p50    p95   p95-p05   shell p05
     *   round 33 (0.045 / 0.020, small)  73.9  139.7  211.0    137.1      104.9
     *   0.018 / 0.006, 7.2x6.4 + 4.2     45.6  113.9  211.0    165.4       85.1
     *   0.028 / 0.010, 6.6x5.0 + 3.4     58.9  127.6  211.0    152.1       95.7   <- shipped
     *   the sheet, fig 1 L / R           39/49 138/148 181/213  142/164        —
     *
     * The middle row hits the sheet's range dead on and overshoots downward on level: the chrome
     * median lands 24 under the sheet's and the SHELL's floor comes with it, because shells run
     * at env 2.05 and see the same room. The shipped row is where both stay honest — range 152
     * inside the sheet's own 142-164 spread, floor 59 against 39-49, level 128 against 138-148.
     *
     * The bright panels are untouched, so exposure does not move: the shell median is 147.1
     * against 148.4 before. Opt-in only — `contrast > 0` is `char.turnaround` and `mat.robot`
     * and nothing else in the project sees any of it.
     */
    const flagV = THREE.MathUtils.lerp(0.72, 0.028, t);
    panel(0.1, 6.6, 5.0, -4.5, 1.6, -0.5, [flagV, flagV, flagV * 1.04], 1.0);
    panel(0.1, 6.6, 5.0, 4.5, 1.6, -0.5, [flagV, flagV, flagV * 1.04], 1.0);

    /*
     * CHANGE 4 (round 33) — A CAMERA-SIDE BLACK FLAG, and it is the missing half of change 1.
     *
     * `critic-robot-33` measured the chrome's local range at 129 against the sheet's 194 and
     * asked for dynamic range. Change 1 had given the chrome dark FLANKS to reflect; nothing
     * had ever given it a dark FRONT. A vertical tube seen head-on mirrors the horizon ring
     * around it, and everything on the camera side of that ring was the room shell's 0.20 grey,
     * which through a 3.05 env response is a mid tone. So the tube swept bright-mid-bright and
     * had no dark core. The sheet's upper arm measures median 134 with p05 69: a DARK body with
     * a blown streak in it.
     *
     * A BRIGHT frontal source was tried first and was measurably the wrong shape of change,
     * twice. Measured on the front figure's upper arm (26x55 px, `harness/_px33.mjs`):
     *
     *                                     chrome median   range     shell median
     *   dark flag only                        144          136          173
     *   + bright pair 1.1 wide at 6.0         190          117          189
     *   + bright pair 0.55 wide at 13.0       194          116          189
     *   the sheet                             134          181          188
     *
     * The bright pair raises the FLOOR rather than extending the top, and narrowing it to half
     * the width at double the intensity changed essentially nothing — because `chromeSatin`'s
     * base roughness is 0.290 and the PMREM lobe this material samples has already spent the
     * difference. A hotter, narrower bright source cannot widen this material's range. The
     * black flag can, from the other end, and it lands the level on the sheet as well.
     *
     * The shell's 173 is paid for separately and in the right place — `UNIT4H_ENV.shell`, which
     * lifts the diffuse family without touching the metal. Doing it here would have cost the
     * chrome everything this flag just bought.
     *
     * Round 32's roughness decision is deliberately NOT reopened. It went 0.225 -> 0.290 to
     * close a 120/216 spread between the arm tubes and the abdomen — two readings from ONE
     * material — and that spread is a worse defect than a narrow local range. The two are in
     * genuine tension; this is the part of it the environment can serve.
     *
     * Opt-in only, and both callers of `contrast > 0` are the robot's own views
     * (`char.turnaround`, `mat.robot`), so nothing else in the project sees it.
     */
    // ROUND 34 — see CHANGE 5 above: 2.2 -> 3.4 wide and 0.020 -> 0.010, because the render's
    // chrome floor (p05 74) is this panel's own reflected value and the sheet's is 39.
    panel(3.4, 6.6, 0.1, 0.0, 1.5, 5.9, [0.010, 0.010, 0.011], 1.0);
  }

  const tex = pmrem.fromScene(s, 0.02).texture;
  pmrem.dispose();
  s.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });

  _studioEnvCache.set(cacheKey, tex);
  return tex;
}

let _estateEnv = null;
export function buildEstateEnv(renderer) {
  if (_estateEnv) return _estateEnv;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  // near-black interior with a cool window slab and a warm sodium bounce from below
  const room = new THREE.Mesh(new THREE.BoxGeometry(20, 12, 20),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.020, 0.026, 0.038), side: THREE.BackSide }));
  s.add(room);
  const add = (w, h, d, x, y, z, c) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: new THREE.Color(...c) }));
    m.position.set(x, y, z); s.add(m);
  };
  add(0.2, 6, 3.2, -9.8, 2.4, 0, [0.42, 0.52, 0.72]);   // tall cold window
  add(3.0, 0.2, 3.0, 3.0, -5.7, 1.0, [0.10, 0.072, 0.045]); // warm floor bounce
  add(6, 0.2, 6, 0, 5.8, 0, [0.028, 0.030, 0.038]);     // faint ceiling
  const tex = pmrem.fromScene(s, 0.06).texture;
  pmrem.dispose();
  s.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  _estateEnv = tex;
  return tex;
}

// ---------------------------------------------------------------------------

/**
 * The standard material-judging rig: a sphere, a bevelled slab, and a floor plane, all
 * in the same material. A sphere shows the BRDF, a slab shows the tiling and the normal
 * map at a grazing angle, a floor shows it at the angle you actually see it in-game.
 */
export function specimenRig(engine, material, opts = {}) {
  const g = new THREE.Group();
  const uvScale = opts.uvScale ?? 1;

  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.42, 96, 64), material);
  sphere.position.set(-0.95, 0.62, 0.15);
  sphere.castShadow = sphere.receiveShadow = true;
  g.add(sphere);

  const slab = new THREE.Mesh(roundedBox(1.15, 1.15, 0.13, 0.022, 3), material);
  slab.position.set(0.42, 0.66, 0.1);
  slab.rotation.y = -0.32;
  slab.castShadow = slab.receiveShadow = true;
  g.add(slab);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6, 1, 1), material);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  g.add(floor);

  // a chrome ball to prove the environment is doing real work
  if (opts.chromeBall !== false) {
    const cb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 48, 32),
      new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.045 }));
    cb.position.set(1.42, 0.2, 0.9);
    cb.castShadow = true;
    g.add(cb);
  }

  engine.scene.add(g);
  return { group: g, sphere, slab, floor };
}

/** Rounded box via subdivided cube projection — cheap, smooth, correct normals. */
export const roundedBox = (w, h, d, r, seg = 3) => roundedBoxGeometry(w, h, d, r, seg);

export function roundedBoxGeometry(width, height, depth, radius, segments = 3) {
  radius = Math.min(radius, Math.min(width, height, depth) * 0.5 - 1e-4);
  const geo = new THREE.BoxGeometry(width, height, depth,
    segments * 2 + 1, segments * 2 + 1, segments * 2 + 1);
  const pos = geo.attributes.position;
  const half = new THREE.Vector3(width / 2 - radius, height / 2 - radius, depth / 2 - radius);
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    c.set(
      Math.min(Math.max(v.x, -half.x), half.x),
      Math.min(Math.max(v.y, -half.y), half.y),
      Math.min(Math.max(v.z, -half.z), half.z));
    const d = v.clone().sub(c);
    const len = d.length();
    if (len > 1e-6) d.multiplyScalar(radius / len);
    pos.setXYZ(i, c.x + d.x, c.y + d.y, c.z + d.z);
  }
  geo.computeVertexNormals();
  geo.deleteAttribute('uv');
  geo.computeBoundingBox();
  // simple box-projected uvs so materials tile predictably
  const bb = geo.boundingBox, size = new THREE.Vector3(); bb.getSize(size);
  const uv = new Float32Array(pos.count * 2);
  const n = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    let u, vv;
    if (nx >= ny && nx >= nz) { u = pz / size.z + 0.5; vv = py / size.y + 0.5; }
    else if (ny >= nz) { u = px / size.x + 0.5; vv = pz / size.z + 0.5; }
    else { u = px / size.x + 0.5; vv = py / size.y + 0.5; }
    uv[i * 2] = u; uv[i * 2 + 1] = vv;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** Slow turntable so a live viewer sees every side; frozen in capture mode. */
export function turntable(engine, group, speed = 0.22) {
  if (engine.capture) return;
  engine.onUpdate((dt) => { group.rotation.y += dt * speed; });
}

/** Label overlay for sheet views. Rendered in DOM so it costs nothing and stays sharp. */
export function labels(items) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:20';
  for (const it of items) {
    const el = document.createElement('div');
    el.textContent = it.text;
    el.style.cssText = `position:absolute;left:${it.x}%;top:${it.y}%;transform:translate(-50%,-50%);
      color:${it.color ?? '#1a1d20'};font:${it.font ?? '600 15px/1.2 ui-sans-serif,system-ui,sans-serif'};
      letter-spacing:.12em;text-transform:uppercase;white-space:nowrap;
      text-shadow:0 1px 0 rgba(255,255,255,.4)`;
    wrap.appendChild(el);
  }
  document.body.appendChild(wrap);
  return wrap;
}
