import * as THREE from 'three';
import { estate, setEnvResponse } from './_studio.js';
import { estateMaterials, estateMarbleFloor, stoneMat, ceilingMat } from '../world/materials-local.js';
import { GeoBin, wallRun, gothicLancet, ceilingSlab, extrudeProfile, corniceProfile, FIELD_HI } from '../world/kit.js';
import { tapestryHang, consoleTable, chairRow, urnOnPedestal } from '../world/props.js';
import { lightShaft, dustMotes, lightPool, glowPatch, driveVolumetrics } from '../lighting/volumetric.js';
import { studyEnv, spotKey, bounceFill, hemiFill, GRADES } from '../lighting/rig.js';
import { buildUnit4H } from '../characters/unit4h.js';

/**
 * LIGHT.SHAFT — the piece whose subject is a VOLUME OF AIR.
 *
 * `room.study` contains a shaft; this view is *about* one, and that changes exactly one
 * rule. In the study the shaft is a soft haze and the hard-edged thing is the pool on the
 * floor, which is what both locked images show and what the study is graded to. Here the
 * beam itself has to be legible as a solid of light with width, depth and an edge — so it
 * must be seen BROADSIDE.
 *
 * That is not a preference. `lightShaft` gets its thickness from |N.V| on the back faces of
 * a prism: through the middle of the beam the face you see is perpendicular to the view and
 * reads thick, at the silhouette it is edge-on and reads thin. Point the prism at the camera
 * and every visible face is perpendicular, the gradient vanishes, and what is left is a
 * uniform smudge. room-study.js records two rounds lost to exactly this.
 *
 * So the window is on the LEFT wall, not the back one. The camera looks down -Z; the beam
 * runs mostly +X. Measured off the built basis, the beam axis sits 69 degrees off the view
 * axis, which is as broadside as a beam that also has to reach a pool inside the frame can
 * get.
 *
 * THREE THINGS MUST BE IN THE SAME FRAME or the piece has not proved anything:
 *   1  the beam, with width and an edge
 *   2  its pool on the floor, carrying the WINDOW'S OWN TRACERY — the pattern is what says
 *      the light came through something rather than out of a texture
 *   3  the motes, drifting inside the volume and nowhere else
 * plus a UNIT-4H standing half in and half out of it, which is the only cheap proof that
 * the volume is real: a figure whose left side is keyed and whose right side is ambient,
 * with the boundary running down it, cannot be faked by a glow decal.
 */

const ROOM = { x0: -5.0, x1: 5.4, z0: -6.2, z1: 4.6, h: 6.4 };
const WALL_TOP = FIELD_HI + 0.30;                    // 4.32
// ROUND 4 — THE WINDOW IS NOW A POINTED, CUSPED GOTHIC LANCET, not a rose arch.
// `critic-estate-2`: "a rounded/rose arch with a plain diamond grid, not the locked art's
// pointed Gothic arch with cusped tracery in the head". Correct on both counts: `windowBay`
// builds a Roman semicircle and fills it with straight mullions and transoms. `gothicLancet`
// (new, additive — see the note on it in kit.js, no existing caller changes) builds a
// two-centred pointed arch with real bar tracery: two sub-lancets in the head under a
// trefoiled circle. The `pointed` ratio is the standard family — 0 is the semicircle this
// used to be, 1 is the equilateral arch — and 0.75 gives a ~50 degree point, unmistakably
// pointed without becoming a needle.
//
// The springing drops 1.20 -> 0.95 above the sill to pay for it. A pointed arch rises
// a*sqrt(1+2p) above the springing where the semicircle rose only a, so at the old springing
// of 4.60 the apex would have landed at 6.18 against a 6.4 ceiling. Lower springing also
// means a TALLER head, which is where the tracery lives and therefore where the art is.
const WIN = { cz: -2.0, sill: 3.40, w: 2.00, h: 0.95 };
const WIN_POINTED = 0.75;
const WIN_SPRING = WIN.sill + WIN.h;                                  // 4.35
const WIN_RISE = (WIN.w / 2) * Math.sqrt(1 + 2 * WIN_POINTED);        // 1.581
const WIN_HEAD = WIN_SPRING + WIN_RISE;                               // 5.93

export default async function view(args = {}) {
  // The camera stands off along +Z and slightly right, so the beam crosses the frame from
  // upper-left to lower-centre. Eye at 1.15 m — a shaft photographed from above reads as a
  // spotlight on a floor, and from below as a sky. It reads as air from inside it.
  const engine = await estate({
    // Backed off and lifted (was [2.95,1.55,5.30] -> [-1.05,1.85,-2.05] at fov 52). Once the
    // pool was placed on the sun's REAL footprint it moved about two metres down-beam, which
    // put its rosette half outside the bottom-right corner — and "nothing cropped" is a hard
    // rule (§7.3). Aiming right and standing further back holds the window, the beam and the
    // whole pool in one frame; the eye is still at 1.72 m, i.e. inside the shaft rather than
    // above it.
    cameraPos: args.cameraPos ?? [2.55, 1.72, 6.75],
    target: args.target ?? [-0.90, 1.80, -1.95],
    fov: args.fov ?? 56,
    far: 50,
    envIntensity: 1.0,
  });
  engine.pipeline.setGrade(GRADES.shaft);
  const { scene, renderer } = engine;
  const rng = engine.rng;

  const probe = args.params?.get?.('probe') ?? '';
  const want = (k) => !probe.split(',').includes('no' + k);

  scene.environment = studyEnv(renderer);
  // ⚠ THIS NUMBER MOVES ALMOST NOTHING IN THIS VIEW, and that is worth knowing before you
  // reach for it. Every large surface here — both walnuts, both stones, the floor, the
  // ceiling, the tapestry — has been handed its own envMap by `setEnvResponse` below, and a
  // material with its own envMap stops reading `scene.environmentIntensity` altogether.
  // Raising this from 4.8 to 5.9 to lift the mid-tones moved the frame's median luminance by
  // 0.3 of a level. The lever for ambient in this view is the setEnvResponse block, not here.
  scene.environmentIntensity = 4.8;
  scene.background = new THREE.Color(0x0a0908);

  const mats = await estateMaterials();
  const dark = new THREE.MeshStandardMaterial({ color: 0x211d18, roughness: 0.94, metalness: 0 });
  const stoneUpper = stoneMat({ stone: [0.235, 0.216, 0.186], seed: 17.0, size: 512 });
  const stoneWarm = stoneMat({ stone: [0.318, 0.284, 0.232], seed: 5.0, size: 1024 });
  // ABSOLUTE, NOT RELATIVE. A material given its own envMap by `setEnvResponse` stops
  // reading `scene.environmentIntensity` entirely, so the walls have to be lifted here —
  // raising the scene value moves only the surfaces that were left alone.
  // Raised as a block (6.10/5.20/3.20/1.60 -> 8.70/7.40/4.55/2.25) to bring the frame's median
  // luminance up off 21.6 toward the locked art's 37.5. §4: lift the MID-TONES, not the
  // blacks and not the exposure — the toe still measures 3.0 against the art's 2.7, so there
  // is nothing wrong with this room's darkness, only with the absence of anything between it
  // and the beam.
  setEnvResponse(engine, mats.walnutField, 8.70);
  setEnvResponse(engine, mats.walnutTrim, 7.40);
  // 3.55, not 4.55: at 4.55 the right-hand wall's ashlar came out BRIGHTER than the beam and
  // the piece stopped being about a beam. §7.4 — nothing large clips, and the light has to be
  // the brightest thing in a view whose subject is light.
  setEnvResponse(engine, [stoneWarm, stoneUpper], 3.55);
  setEnvResponse(engine, mats.tapestry, 2.25);

  const M = {
    wood: mats.walnutField, trim: mats.walnutTrim,
    stone: stoneWarm, stoneUp: stoneUpper, dark,
    glass: mats.glass, wintrim: stoneWarm,
    // NOT `mats.ceiling` — its default tint is sRGB 0.700, a fresh lime-plaster white, and
    // in a room whose whole subject is one beam of light it became the brightest large area
    // in frame and put two blown bands across the top of the capture. A beam only reads as
    // bright if something is darker than it.
    ceil: ceilingMat({ tint: [0.300, 0.278, 0.244], stain: 0.85 }),
    marbleTop: mats.marbleSlab, gilt: mats.gilt,
  };
  // A DOWN-FACING surface sees the environment's FLOOR BOUNCE box, which `studyEnv` sets to
  // 1.05 because a marble floor under a window really is that bright. Multiplied by a scene
  // intensity tuned for the walls, the ceiling came out as the brightest large area in the
  // frame — two blown bands across the top of a view whose entire subject is one beam of
  // light. Darkening the tint alone did not fix it, because the tint was never the problem.
  setEnvResponse(engine, M.ceil, 0.50);
  const K = { wall: 'wood', mould: 'trim', cornice: 'trim', skirt: 'trim', leaf: 'trim', trim: 'trim' };

  const bin = new GeoBin();

  // ---- floor: the pool has to land on something that can hold a pattern ----
  const floorMat = estateMarbleFloor({
    pattern: 1, slabsX: 4, slabsY: 4, jointW: 0.0021, cabSize: 0.0,
    rough: 0.060, wear: 0.30, dust: 0.32, veinW: 0.082, scale: 2.2, aniso: 1.85,
    clearcoat: 0.86, clearcoatRoughness: 0.032, size: 1024,
    // ...AND THE SECOND HALF OF THE TWO-POOLS DIAGNOSIS. Enlarging the decal covered more
    // floor but the right-hand patch stayed white, which rules out the decal's extent and
    // leaves only one explanation: it is ONE pool whose brighter half is CLIPPED. The decal is
    // additive over floor the sun is already lighting, so wherever sun + decal exceed 1.0 the
    // pattern the decal is carrying is quantised away and what is left is flat white — a
    // second, patternless pool made of the same photons as the first. A near-white ground
    // albedo is what put it over the line, so the ground comes down and the key comes down
    // with it; the pattern then survives everywhere the light reaches.
    groundA: [0.430, 0.425, 0.415], veinA: [0.150, 0.147, 0.142],
  });
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.x1 - ROOM.x0 + 1.0, ROOM.z1 - ROOM.z0 + 1.0), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((ROOM.x0 + ROOM.x1) / 2, 0, (ROOM.z0 + ROOM.z1) / 2);
  floor.receiveShadow = true;
  {
    const uv = floor.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2.2, uv.getY(i) * 2.2);
  }
  // Same reason as room.study: a floor faces the whole environment at once and collects
  // more IBL than any other surface, so at the scene's intensity it washes to a blank sheet
  // and takes the pool's pattern with it.
  setEnvResponse(engine, floorMat, 0.90);
  scene.add(floor);

  // ---- the wall the light comes through --------------------------------
  // rotY +PI/2 runs toward -Z, so a left wall at x0 starts at z1. The window is a REAL HOLE
  // in it: the spot outside throws the tracery through it out of the shadow map that was
  // going to be rendered anyway. No cookie texture, and the pattern in the pool is then
  // guaranteed to agree with the pattern in the glass because it IS the glass.
  const sideL = ROOM.z1 - ROOM.z0;
  const winLocal = ROOM.z1 - WIN.cz;
  // ⚠ THE OPENING IS NOW CUT IN THE LOWER RUN TOO, and this is the fix for a defect that has
  // been in this view since it was built and that everything downstream was working AROUND.
  // `WIN.sill` is 3.40 and `WALL_TOP` is 4.32, but only the UPPER run had an opening — so the
  // lowest 0.92 m of the lancet was behind solid panelling and passed no light. What reached
  // the camera was the arched HEAD alone, sitting on the cornice: a pointed lancet seen as a
  // detached oval, which is very reasonably what `critic-estate-2` called "a rounded/rose
  // arch". Making the arch pointed does not fix that on its own — the body of the window has
  // to be visible for the eye to read the head as the top of a lancet rather than as a
  // roundel in its own right. The pool projection below picks this up automatically: its
  // aperture is measured, not assumed.
  wallRun(bin, {
    x: ROOM.x0, z: ROOM.z1, length: sideL, height: WALL_TOP, bays: 5, rotY: Math.PI / 2,
    keys: K, uvWall: 2.9, raised: true,
    // `cornice: false` because this run's own cornice is a full-length extrusion that ignores
    // `openings` — it was drawing a moulding band straight across the glass, and it was always
    // a duplicate of the one added by hand below (which now dies into the architrave properly).
    cornice: false,
    openings: [{ x0: winLocal - WIN.w / 2, x1: winLocal + WIN.w / 2, y0: WIN.sill, y1: WALL_TOP }],
  });
  wallRun(bin, {
    x: ROOM.x0, z: ROOM.z1, length: sideL, height: ROOM.h - WALL_TOP, y0: WALL_TOP,
    rotY: Math.PI / 2, keys: { wall: 'stoneUp' }, uvWall: 2.2,
    dado: false, cornice: false, skirt: false, fielded: false,
    openings: [{
      x0: winLocal - WIN.w / 2, x1: winLocal + WIN.w / 2,
      y0: WIN.sill - WALL_TOP, y1: WIN_HEAD - WALL_TOP,
    }],
  });
  gothicLancet(bin, {
    x: ROOM.x0 + 0.005, y: 0, z: WIN.cz, rotY: Math.PI / 2,
    w: WIN.w, sill: WIN.sill, spring: WIN_SPRING, pointed: WIN_POINTED,
    keys: { reveal: 'wintrim', trim: 'wintrim', stone: 'wintrim', glass: 'glass', lead: 'trim' },
    transoms: 2, foils: 3,
  });
  {
    // IN TWO RUNS, dying into the window architrave on either side. A cornice extruded the
    // full 10.8 m used to cross the lancet at its springing — a heavy moulding band straight
    // through the glass — which is both wrong and the other half of why the window read as a
    // detached roundel above a shelf. A real cornice stops at an opening.
    const m0 = new THREE.Matrix4().makeTranslation(ROOM.x0, WALL_TOP - 0.02, ROOM.z1)
      .multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2))
      .multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.02));
    const gapLo = winLocal - WIN.w / 2 - 0.13, gapHi = winLocal + WIN.w / 2 + 0.13;
    for (const [x0, len] of [[0, gapLo], [gapHi, sideL - gapHi]]) {
      if (len <= 0.02) continue;
      bin.add('trim', extrudeProfile(corniceProfile(0.44, 0.26), len, { x0: 0 }),
        m0.clone().multiply(new THREE.Matrix4().makeTranslation(x0, 0, 0)));
    }
  }

  // ---- the wall the beam lands on / the far wall -------------------------
  const backW = ROOM.x1 - ROOM.x0;
  wallRun(bin, {
    x: ROOM.x0, z: ROOM.z0, length: backW, height: WALL_TOP, bays: 6, keys: K, uvWall: 2.9, raised: true,
  });
  bin.box('stoneUp', backW, ROOM.h - WALL_TOP, 0.30,
    (ROOM.x0 + ROOM.x1) / 2, (WALL_TOP + ROOM.h) / 2, ROOM.z0 - 0.15, 2.2);
  bin.add('trim', extrudeProfile(corniceProfile(0.44, 0.26), backW, { x0: ROOM.x0 }),
    new THREE.Matrix4().makeTranslation(0, WALL_TOP - 0.02, ROOM.z0 + 0.02));
  wallRun(bin, {
    x: ROOM.x1, z: ROOM.z0, length: sideL, height: WALL_TOP, bays: 6, rotY: -Math.PI / 2,
    keys: K, uvWall: 2.9, raised: true,
  });

  ceilingSlab(bin, 'ceil', backW + 0.6, sideL + 0.6, ROOM.h,
    (ROOM.x0 + ROOM.x1) / 2, (ROOM.z0 + ROOM.z1) / 2, 2.6);
  for (let i = 0; i < 5; i++) {
    const bz = ROOM.z0 + 1.0 + i * ((sideL - 2.0) / 4);
    bin.box('dark', backW, 0.32, 0.28, (ROOM.x0 + ROOM.x1) / 2, ROOM.h - 0.16, bz, 0.9);
  }

  if (want('props')) {
    consoleTable(bin, { x: ROOM.x1 - 0.55, y: 0, z: -1.1, rotY: -Math.PI / 2,
      keys: { wood: 'trim', gilt: 'gilt', marble: 'marbleTop' } });
    // ROUND 5 DRESSING. `critic-estate-3`: "room otherwise very sparse -- a single bench is the
    // only furniture in frame". Everything added here is placed against the beam, not around
    // it: a pedestal and urn where the shaft grazes the far corner (so the volume is seen to
    // fall ON something), a second console on the back wall, and a coffer under the window that
    // gives the pool an object to run up against. All of it goes in the shared bin, so it
    // merges into buckets that already exist and costs no draw call.
    urnOnPedestal(bin, { x: ROOM.x1 - 0.95, y: 0, z: ROOM.z0 + 0.85, h: 1.15,
      keys: { stone: 'stone', gilt: 'gilt' } });
    consoleTable(bin, { x: -2.55, y: 0, z: ROOM.z0 + 0.42, w: 1.35,
      keys: { wood: 'trim', gilt: 'gilt', marble: 'marbleTop' } });
    // an oak coffer under the lancet
    bin.box('trim', 1.35, 0.62, 0.60, ROOM.x0 + 0.60, 0.31, WIN.cz + 0.35, 0.8);
    bin.box('trim', 1.44, 0.095, 0.68, ROOM.x0 + 0.60, 0.665, WIN.cz + 0.35, 0.6);
    for (const s of [-1, 1]) {
      bin.box('gilt', 0.055, 0.66, 0.055, ROOM.x0 + 0.60 + s * 0.62, 0.33, WIN.cz + 0.35 + 0.30, 0.2);
    }
  }

  for (const mesh of bin.build(M, { noCast: ['glass', 'ceil', 'wintrim'] })) scene.add(mesh);

  // A tapestry on the far wall, out of the beam. It is here as a CONTROL: the only
  // saturated colour in frame, unlit by the shaft, so a reader can see what the room looks
  // like where the light is not.
  const tap = tapestryHang({ w: 1.95, h: 3.05, material: mats.tapestry, folds: 4, amp: 0.055 });
  tap.position.set(2.55, 1.05, ROOM.z0 + 0.20);
  scene.add(tap);
  // a second hanging on the right wall, INSIDE the beam's grazing path, so one tapestry is
  // seen unlit and the other is seen lit — the same control read, doubled
  const tap2 = tapestryHang({ w: 1.75, h: 2.85, material: mats.tapestry, folds: 4, amp: 0.05, sag: 0.05 });
  tap2.position.set(ROOM.x1 - 0.20, 1.15, -3.25);
  tap2.rotation.y = -Math.PI / 2;
  scene.add(tap2);
  scene.add(chairRow({
    count: 3, material: mats.walnutTrim, rng,
    from: [1.35, 0, ROOM.z0 + 0.55], to: [3.85, 0, ROOM.z0 + 0.55], face: 0.06,
  }));

  // ---- the beam ---------------------------------------------------------
  const glassTex = mats.glass.map;
  // BROADSIDE. Mostly +X out of a wall at x0, down at 40 degrees, with just enough +Z to
  // bring the pool forward into frame. Against a view axis of about (-0.08, 0.06, -0.99)
  // this sits 69 degrees off end-on.
  const dir = new THREE.Vector3(0.7401, -0.6201, 0.2601).normalize();
  const winCentre = new THREE.Vector3(ROOM.x0 + 0.02, (WIN.sill + WIN_HEAD) / 2, WIN.cz);
  const hitT = (0.02 - winCentre.y) / dir.y;
  const hit = winCentre.clone().addScaledVector(dir, hitT);

  const lz = dir.clone().negate();
  const lx = new THREE.Vector3(0, 1, 0).cross(lz).normalize();
  const ly = new THREE.Vector3().crossVectors(lz, lx).normalize();
  const shaftGroup = new THREE.Group();
  shaftGroup.matrixAutoUpdate = false;
  shaftGroup.matrix.makeBasis(lx, ly, lz).setPosition(winCentre);
  shaftGroup.updateMatrixWorld(true);
  if (want('vol')) scene.add(shaftGroup);

  const shaftH = (WIN_HEAD - WIN.sill) * 1.05;
  const shaftInner = new THREE.Group();
  shaftInner.position.y = -shaftH / 2;
  shaftGroup.add(shaftInner);

  // Stronger than room.study's 0.72, and that difference is the whole point of the piece
  // existing separately: there the volume is atmosphere behind a figure, here it is the
  // subject. 14 slices for the same reason as in the study — at the default 5 the |N.V|
  // term steps once per ring and the steps read as horizontal bands across the beam.
  shaftInner.add(lightShaft({
    width: WIN.w + 0.10, height: shaftH, length: 8.4, spread: 0.10, slices: 14,
    glass: glassTex, tint: 0xfff2e4, mean: 0xfff8f0, strength: 2.30, smear: 1.9,
    // 0.72, not 1.25. `floorFade` dissolves the prism over `fadeY` metres above the floor so
    // it never cuts a hard polygon line into the marble — but at 1.25 m it was erasing the
    // lowest third of the beam, which is the third nearest the camera and the only part
    // wide enough to read. The pool covers the intersection anyway.
    floorY: 0.0, fadeY: 0.72, arch: 0.34,
  }));
  // The motes live INSIDE the beam and nowhere else. `dustMotes` fills a box with no
  // reference to the shaft volume, so any part of the box outside the beam is a bright
  // speck in an unlit room — which is what "it looks like snow" means when a critic says it.
  shaftInner.add(dustMotes({
    count: Math.round(420 * (engine.quality.dust ?? 1)),
    extent: new THREE.Vector3(0.82, 0.72, 3.3),
    centre: new THREE.Vector3(0, shaftH * 0.48, -3.7),
    rng, size: 42, intensity: 1.25, drift: 0.5, color: 0xfff4e2,
  }));

  // ---- THE SECOND POOL, AND WHY THERE WERE TWO (round 5, and this is the real cause) -----
  //
  // Round 4's verdict: "the correct tracery-patterned pool sits beside a second, larger patch
  // clipped to flat white with no colour or pattern". Round 4 read that as a COVERAGE problem
  // — the decal not reaching as far down-beam as the sun — enlarged the decal to 3.5 x 3.4
  // window-widths, and the white patch did not move. That rules coverage out, and the
  // arithmetic says why:
  //
  //   the scene renders to a HalfFloat target and is tone-mapped in POST, so sunlit marble
  //   here sits at a LINEAR radiance of about 6, not at 1.0. An ADDITIVE decal at strength
  //   0.62 is a 10% modulation on top of that, and the tone curve compressing 6 -> ~0.95
  //   deletes what is left. On floor the sun does not reach, the base is ~0.05 and the same
  //   0.62 IS the picture.
  //
  // One decal, two completely different results, split exactly along the sun's shadow edge:
  // pattern on the shadowed half, blank white on the lit half. The lit half is the half a
  // viewer calls "the pool", so the piece was showing its tracery in the one place light was
  // not. Coverage was never the problem; BLEND MODE was.
  //
  // So the pool now MULTIPLIES. Stained glass removes light, it does not add it — a filter
  // cannot clip, cannot exceed the brightness of what it filters, and puts the pattern
  // exactly and only where the light lands. Pattern and pool stop being two objects.
  //
  // And it is placed by PROJECTING THE APERTURE rather than by eye. The sun is a point 5.5 m
  // behind the window, so the window's shadow on the floor is a trapezoid whose far edge is
  // far further down-beam than the centre ray's landing point: measured off these numbers it
  // runs from -2.5 m to +4.7 m along the beam about `hit`, i.e. its centroid is a metre
  // past where the old decal was centred. Fitting the rectangle to the four projected corners
  // removes the guess.
  //
  // ⚠ AND THE APERTURE IS NOT THE WINDOW. The opening is only cut in the UPPER wall run,
  // whose base is WALL_TOP (4.32); `WIN.sill` is 3.40, so the lowest 0.92 m of the lancet is
  // behind solid panelling and passes no light at all. Projecting from `WIN.sill` put the
  // rectangle a metre up-beam of the light and made it two metres too long — which is a
  // second, quieter version of the same mistake: measuring the model instead of the render.
  // The window reading small and high in frame is the same fact seen from the camera, and it
  // is `room.study`'s §6.3 item 5 as well.
  // ROUND 4: the opening is now cut in BOTH wall runs (see the note on the lower run above),
  // so the aperture finally is the window. This used to clamp to WALL_TOP because the lowest
  // 0.92 m of the lancet was bricked up; that was a correct workaround for a real defect, and
  // with the defect gone the clamp would now put the pool a metre down-beam of the light.
  // ---- ROUND 6: THE POOL IS OVER-SCALED BECAUSE THE SUN IS 5.5 m AWAY --------
  //
  // `critic-estate-4` confirmed round 5's self-flagged risk: the floor projection "covers
  // roughly half the visible foreground floor in thick branching dark lines that read as
  // cracked ice or roots". Both halves of that — the SIZE and the LINE WEIGHT — are one bug
  // with one number behind it, and it is not in the decal.
  //
  // The projection is a pinhole cast from `sunPos` through the aperture onto the floor, so it
  // is magnified by (sun-to-floor / sun-to-window). Measured off this view's own constants:
  //   winCentre.y  (3.40 + 5.93) / 2                     = 4.665
  //   hitT         (0.02 - 4.665) / dir.y (-0.6201)      = 7.49 m window to floor
  //   M            (5.5 + 7.49) / 5.5                    = 2.36x
  // A 2.00 m window therefore lands as 2.00 * 2.36 * 1.12 = 5.3 m across a room that is 10.4 m
  // wide — 51% of the floor, which is the critic's "roughly half" arrived at from the source
  // rather than from the picture. And every lead came is magnified by the same 2.36, which is
  // the "thick branching lines": the cames are not drawn heavy, they are drawn far away and
  // blown up. Nothing about the decal, the glass or the blend is wrong.
  //
  // The cause is that a sun 5.5 m from a window is a LAMP. Real sunlight is parallel and casts
  // a window at its own size; the only honest stretch is 1/|dir.y| = 1.61 along the beam, from
  // the floor's obliquity, and that one is already correct and stays. Pulling the source back
  // to 25 m gives M = (25 + 7.49) / 25 = 1.30 — a 2.9 m pool (28% of the floor, down from 51%)
  // with cames 1.82x thinner — while leaving a little divergence so the shadow edge is not
  // laser-cut. `dir` and `hit` are untouched, so the visible beam and the pool's LANDING POINT
  // do not move; only the magnification does. The decal and the spot read the same constant,
  // which is what keeps the painted pattern and the cast shadow in agreement.
  const SUN_DIST = 25.0;
  const APERTURE_LO = WIN.sill;
  const sunPos = winCentre.clone().addScaledVector(dir, -SUN_DIST);
  const bDir = new THREE.Vector3(dir.x, 0, dir.z).normalize();          // along-beam, on floor
  const bPerp = new THREE.Vector3(-bDir.z, 0, bDir.x);                  // across-beam
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (const cz of [WIN.cz - WIN.w / 2, WIN.cz + WIN.w / 2]) {
    for (const cy of [APERTURE_LO, WIN_HEAD]) {
      const corner = new THREE.Vector3(ROOM.x0, cy, cz);
      const ray = corner.clone().sub(sunPos);
      const p = sunPos.clone().addScaledVector(ray, (0.016 - sunPos.y) / ray.y);
      const rel = p.clone().sub(hit);
      const u = rel.dot(bDir), v = rel.dot(bPerp);
      uMin = Math.min(uMin, u); uMax = Math.max(uMax, u);
      vMin = Math.min(vMin, v); vMax = Math.max(vMax, v);
    }
  }
  // 12% margin so the multiply's soft edge finishes OUTSIDE the sun's hard shadow edge. The
  // hard boundary in the locked art is made by the shadow, which is where a hard light
  // boundary physically comes from; the filter must not draw a second, softer one inside it.
  const uc = (uMin + uMax) / 2, vc = (vMin + vMax) / 2;
  const uh = (uMax - uMin) * 1.12, vh = (vMax - vMin) * 1.12;
  const pool = lightPool({
    blend: 'multiply', w: vh, h: uh, glass: glassTex,
    // NEVER ABOVE 1.0, and that ceiling is the whole safety property. A filter can only take
    // light away, so on floor the sun does not reach it is invisible BY CONSTRUCTION — the
    // patterned-shadow half cannot come back. The first attempt at this used 1.55 and the
    // glass promptly multiplied the ambient-lit floor UP: the entire room read as a painted
    // Mondrian carpet, which is the round-4 defect inside out. The pale quarries bake at
    // ~0.88 so they lose about a tenth and the pool stays the brightest thing in frame; the
    // lead cames bake at 0.02 and go properly black.
    tint: 0xf8fbff, strength: 1.0, soft: 0.13, blur: 0.0022, sat: 0.45,
  });
  pool.rotation.x = -Math.PI / 2;
  pool.rotation.z = Math.atan2(dir.x, dir.z);
  pool.position.set(hit.x + bDir.x * uc + bPerp.x * vc, 0.016, hit.z + bDir.z * uc + bPerp.z * vc);
  if (want('vol')) scene.add(pool);

  // ---- lights -----------------------------------------------------------
  // ONE shadow caster, outside the building, aimed along the beam axis so the volume and
  // the pool agree with each other. That agreement is the illusion; nothing else is.
  // 560, not 900. The tone curve is in post over a HalfFloat target, so the number that
  // matters is LINEAR radiance at the floor: at 900, decay 1 and ~12.7 m the sunlit marble
  // sat near 6, i.e. six stops into the shoulder, and everything painted on it — tracery,
  // veining, the slab joints — was compressed into the same white. A filter can only divide,
  // so the pool cannot show its pattern until the thing it is filtering has somewhere to go.
  const sun = spotKey({
    // ...and then BACK UP to 840 once the filter was in, which is the point of the filter: a
    // division works at any base brightness, so the pattern no longer has to be bought with
    // exposure. At 560 the pool's top decile fell to L 152 against the locked art's 192, and
    // because the chroma gate is (r-b)/L a DIMMER highlight of the same colour measures as a
    // more saturated one — 0.222 against 0.125. Brightening the near-neutral sun is the
    // cheapest way to bring that ratio down and it is also what the art shows.
    // 0xfffaf2, not 0xfff4e8: daylight through glass takes its colour from the glass (§4).
    // ROUND 6 RE-BALANCES THIS FOR THE 25 m THROW, and every number here is forced by that
    // move rather than chosen. Left alone, pulling the source back would have paid for a
    // compact pool by wrecking the one confirmed win this piece has (the crisp leadwork
    // shadow), which is the trade the notes above keep warning about.
    //   intensity  decay 1 means illuminance goes as 1/d, and the throw to `hit` goes
    //              13.0 -> 32.5 m, so holding the floor at the same value costs 2.5x. 840 ->
    //              2100. The pool's own brightness is the grade gate this view passes on.
    //   distance   55 windowed a 32.5 m throw down by a further 22% ((1-(d/D)^4)^2 = 0.771);
    //              at 90 the same factor is 0.966, i.e. the falloff is back to being decay.
    //   angle      0.32 rad was a 8.3 m cone radius at a 2.0 m window, so the shadow map was
    //              spending 1024 texels on 16.6 m of mostly empty wall. THIS IS THE ONE THAT
    //              MATTERS: unchanged, it is a 4.6x loss of shadow resolution and the lancet's
    //              tracery goes to mush. atan(2.6 / 25) = 0.104 rad still clears the window's
    //              corner (1.61 m) and covers the 2.9 m pool at the floor.
    //   mapSize    2048 with the narrowed cone puts 2.5 mm on a shadow texel against the old
    //              3.6 mm, so the leadwork comes back CRISPER than the frame the critic
    //              confirmed, not merely as crisp. `radius` is in texels, so it rises with the
    //              resolution to hold the same world-space softness.
    color: 0xfffaf2, intensity: 2100,
    position: sunPos.toArray(),
    target: [hit.x, 0, hit.z],
    angle: 0.104, penumbra: 0.26, decay: 1.0, distance: 90,
    mapSize: 2048, near: 18.0, far: 45, radius: 2.2, normalBias: 0.02, bias: -0.0008,
  });
  scene.add(sun, sun.target);
  engine.sun = sun;

  // Where the beam lands on polished marble that patch becomes a source. Entirely
  // motivated, no shadow map, and it is what puts light on the figure's shadow side from
  // BELOW — which is the read that says "standing in a shaft" rather than "lit by a lamp".
  // 0.95 m, not 0.42, and this is the "hard circular specular hotspot with a lens-flare star
  // inside the tracery pool" from the round-4 verdict. That is not a bug in the pool: it is a
  // point light sitting 420 mm above a clearcoated marble floor, which is exactly the geometry
  // that puts a mirror image of a point source into the one part of the frame the piece is
  // asking you to read. Lifting it to hip height moves the specular out of the pool and off
  // the camera's reflection angle entirely, and does the bounce's actual job better.
  const bounce = new THREE.PointLight(new THREE.Color(0xffeada), 3.4, 8.0, 2);
  bounce.position.set(hit.x, 0.95, hit.z);
  bounce.castShadow = false;
  scene.add(bounce);

  scene.add(hemiFill({ sky: 0xa8adb0, ground: 0x3d2a17, intensity: 0.90 }));
  scene.add(bounceFill({ warm: 0.50, warmColor: 0xffc79a, warmDir: [-4.5, 1.6, 3.0], cold: 0.0, up: 0.0 }));

  // A wash where the beam grazes the far wall, so the beam is seen to ARRIVE somewhere.
  const wash = glowPatch({ size: 4.6, color: 0xffe4c2, strength: 0.16, pow: 2.0 });
  wash.position.set(hit.x + 1.4, 1.5, ROOM.z0 + 0.12);
  scene.add(wash);

  // ---- the figure, half in and half out ---------------------------------
  // The beam's horizontal direction is (0.943, 0.331); stepping 0.55 m along its horizontal
  // NORMAL puts the figure's centre line on the beam's edge, so the boundary runs down the
  // body rather than past it. That single boundary is the proof the volume is real.
  const u = buildUnit4H({ height: 1.7 });
  u.root.position.set(-1.12, 0, -0.10);
  u.root.rotation.y = -0.65;
  u.setPose({
    shoulderL: [-0.30, 0, 0.34], shoulderR: [0.14, 0, -0.30],
    elbowL: [-0.55, 0, 0], elbowR: [-0.30, 0, 0],
    hipL: [0.10, 0, 0.04], hipR: [-0.08, 0, -0.04],
    kneeL: [-0.12, 0, 0], kneeR: [-0.16, 0, 0],
    chest: [0, -0.18, 0], head: [0.10, -0.42, 0],
  });
  if (want('unit')) scene.add(u.root);
  engine.unit = u;

  driveVolumetrics(engine, scene);

  engine.finalizeScene();
  engine.markReady();
  engine.start();
  return engine;
}
