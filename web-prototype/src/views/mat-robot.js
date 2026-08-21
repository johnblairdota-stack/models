import * as THREE from 'three';
import { studio, roundedBox, labels, setEnvResponse } from './_studio.js';
import { unit4hMaterials, applyUnit4HEnv, UNIT4H_COLORS, brandAspect, brandReady } from '../materials/surfaces/robot.js';
import { buildUnit4HBoot } from '../characters/unit4h.js';

/**
 * mat.robot — the UNIT-4H material family, judged on its own rather than through a robot.
 *
 * This view was a six-line `notBuilt()` stub for 32 rounds while the five surfaces it is
 * supposed to show were argued about entirely through `char.turnaround`, where every one of
 * them is 40 px wide and half of them are in shadow. Three of this round's findings could have
 * been caught here in one look:
 *
 *   - the mint cap was rendering as WHITE, because `mintCap()`'s deliberate 0.55 environment
 *     response has never been live in any scene (see `applyUnit4HEnv`);
 *   - the chrome measured 120 on a tube and 216 on a flat band from ONE material, i.e. it was
 *     resolving individual environment panels instead of averaging them;
 *   - the face's mouth was a stroke thinner than its own antialiasing skirts.
 *
 * So the specimens are the SHAPES THESE MATERIALS ARE ACTUALLY USED ON — a crowned shell panel,
 * a turned limb tube with a bearing, a pauldron on its ball, a curved screen, a boot sole —
 * because every one of those defects is a property of the form the surface lands on and none of
 * them show on a sphere. BUILD_GUIDE §4b, rules 1-7: nothing floats (each specimen carries its
 * own plinth to the floor), nothing is cropped, the ground is mid-grey rather than the art
 * sheet's near-white (four of these five are specular), and there is a chrome ball.
 *
 * Bar: `Dev Art/1785277053522.png`. The values to hit, sampled off the sheet's front figure in
 * 0-255 luminance, are recorded here because this is where they are checkable:
 *
 *   white shell 178-214 · chrome 119-190 · mint (97,147,141) · screen field (81,124,157)
 *   screen eye (163,222,241) · panel gap and sole: the darkest values on the character
 */

/**
 * A spherical patch with uv 0..1 across it — the shape the faceplate is baked for.
 *
 * ROUND 33 — THE OUTLINE IS A SUPERELLIPSE, not a rectangle in (az, el).
 *
 * `critic-robot-33`: "the screen patch has a hard rectangular clip edge". It did, and it was
 * a property of this function rather than of the material: sweeping az and el over a full grid
 * cuts a four-cornered window out of the dome, so the screen ended in two straight vertical
 * chords with sharp corners where the sheet's — and `unit4h.js`'s own `visorCap` — ends in a
 * rounded rectangle that dies into the shell.
 *
 * So this is now the same construction `visorCap` uses on the head: a pole with concentric
 * rings whose rim follows |u|^k + |v|^k = 1, and the same k = 3.4 the character's `VISOR`
 * carries. The uv still maps linearly off (az, el) with EQUAL windows in both axes, because
 * the face is baked into a square and an unequal window stretches it — that constraint is
 * `visorCap`'s and it applies identically here.
 */
function screenPatch(R, halfAz, halfEl, k = 3.4, NR = 16, NA = 56) {
  const pos = [], uv = [], nor = [], idx = [];
  const put = (u, v) => {
    const az = u * halfAz, el = v * halfEl, ce = Math.cos(el);
    const n = new THREE.Vector3(Math.sin(az) * ce, Math.sin(el), Math.cos(az) * ce).normalize();
    pos.push(n.x * R, n.y * R, n.z * R);
    nor.push(n.x, n.y, n.z);
    uv.push(0.5 + 0.5 * u, 0.5 + 0.5 * v);
    return pos.length / 3 - 1;
  };
  const rim = [];
  for (let j = 0; j < NA; j++) {
    const a = (j / NA) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    rim.push([Math.sign(ca) * Math.abs(ca) ** (2 / k), Math.sign(sa) * Math.abs(sa) ** (2 / k)]);
  }
  const pole = put(0, 0);
  const rings = [];
  for (let i = 1; i <= NR; i++) {
    const rho = i / NR, r = [];
    for (let j = 0; j < NA; j++) r.push(put(rho * rim[j][0], rho * rim[j][1]));
    rings.push(r);
  }
  // WINDING, not normals. The first cut of this patch supplied correct outward normals and the
  // wrong triangle order, so it lit perfectly and was culled — a screen that renders nothing at
  // all, which is this project's signature failure mode in miniature. Verified by looking.
  for (let j = 0; j < NA; j++) {
    const j2 = (j + 1) % NA;
    idx.push(pole, rings[0][j], rings[0][j2]);
  }
  for (let i = 0; i < NR - 1; i++) {
    for (let j = 0; j < NA; j++) {
      const j2 = (j + 1) % NA;
      const a = rings[i][j], b = rings[i][j2], c = rings[i + 1][j], d = rings[i + 1][j2];
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** A turned tube with a step-up collar, the way every limb segment on this robot is built. */
function limbTube(rTop, rBot, len, seg = 28) {
  const g = new THREE.CylinderGeometry(rTop, rBot, len, seg, 1, true);
  g.translate(0, len * 0.5, 0);
  return g;
}

export default async function view() {
  /*
   * FRAMING. The tallest specimen is the screen post at 1.06 m, but the row spans about 2.5 m
   * and that is the binding constraint at 16:9 — (2.5/0.8)/2/tan(18 deg) wants ~4.8 m at fov 36,
   * so the lens comes in to 30 and the camera to 4.35 m, which leaves a margin on both sides
   * and still keeps the perspective flat enough to compare two specimens against each other.
   */
  /*
   * IT HAS TO BE LIT THE WAY THE CHARACTER IS LIT, and the first cut of this view proved why.
   * BUILD_GUIDE §4b rule 5 asks for a mid-grey ground for specular materials, so this started on
   * the default studio environment at 0.62 — and the chrome, whose response is 3.05, blew to
   * white. That number is not arbitrary: `char.turnaround` opts into the high-contrast studio
   * environment (dark flag panels), and a metal is only what it reflects, so 3.05 against a
   * bright default room is a completely different material from 3.05 against that one. A swatch
   * that does not reproduce the environment the surface is tuned for is worse than no swatch.
   *
   * So: the same `contrast` / `lightContrast` opt-ins and the same env intensity as the
   * character view, with rule 5 satisfied by the CYC COLOUR instead — mid-grey rather than the
   * art sheet's near-white, which is the part of the rule that matters here (a white shell and a
   * mirror against a white backdrop have nothing to be read against).
   */
  const engine = await studio({
    // 0x5c6268 rendered near-black: this env deliberately has dark panels and a dark room
    // bounce, so a mid-grey ALBEDO on the cyc comes out as a shadow. The backdrop's job is to
    // be a value the white shell and the chrome can be read against, which means the RENDERED
    // grey matters, not the hex.
    bg: 0xa2a8ae,
    envIntensity: 1.4,
    contrast: 1.0,
    lightContrast: 1.0,
    cameraPos: [0.0, 0.72, 3.60],
    target: [0.0, 0.46, 0],
    fov: 30,
    shadowExtent: 2.6,
  });

  // A white shell and a mirror-bright chrome both blow out fast; the mint and the screen both
  // die if the key is pulled too far. Trimmed a little from the studio default and checked
  // against the render, not against the numbers.
  engine.lights.key.intensity = 2.15;
  engine.lights.fill.intensity = 1.0;
  engine.lights.rim.intensity = 1.6;

  const mats = unit4hMaterials();
  // The material file's own environment table, made live — the whole point of this view is to
  // show what these surfaces are specified to be, and three of the five numbers only exist
  // through this call. See `applyUnit4HEnv` in surfaces/robot.js.
  applyUnit4HEnv(setEnvResponse, engine, mats);

  // ---- no separate floor. The first cut laid a 12 m plane over the cyc's own flat run and
  // bought a hard horizon line across the frame with black above it — the cyc curves up out of
  // that plane and gets almost no key, so the upper two thirds of the picture went dark. The
  // cyc IS the ground here, which is also what makes "nothing floats" checkable: a plinth at
  // y = 0 is sitting on the same surface the shadows land on.

  const plinthMat = new THREE.MeshStandardMaterial({ color: 0x2b2f34, roughness: 0.7, metalness: 0.1 });
  /** Rule 1: nothing floats. Every specimen gets a plinth that reaches y = 0. */
  const plinth = (x, z, w, d, h) => {
    const m = new THREE.Mesh(roundedBox(w, h, d, Math.min(0.012, h * 0.4), 1), plinthMat);
    m.position.set(x, h * 0.5, z);
    m.castShadow = m.receiveShadow = true;
    engine.scene.add(m);
    return h;
  };

  const X = [-1.02, -0.40, 0.20, 0.78, 1.38];

  // =========================================================================
  // 1. WHITE SHELL — a crowned chest/thigh panel, with the panel-line language on it.
  //    A flat slab cannot show either of the two things that matter about this surface: the
  //    clearcoat's specular roll across a crown, and whether a scribed seam reads at all
  //    against white-on-white shading.
  // =========================================================================
  {
    const base = plinth(X[0], 0, 0.42, 0.30, 0.05);
    const g = roundedBox(0.36, 0.70, 0.26, 0.075, 6);
    const p = g.attributes.position;
    // crown the broad faces, the way `section()` crowns the limb loft
    for (let i = 0; i < p.count; i++) {
      const q = 1 - Math.min(1, Math.abs(p.getX(i) / 0.18)) ** 2;
      p.setZ(i, p.getZ(i) * (1 + 0.10 * q * q * Math.sign(Math.abs(p.getZ(i)) - 0.09)));
    }
    p.needsUpdate = true;
    g.computeVertexNormals();
    const panel = new THREE.Mesh(g, mats.shell);
    panel.position.set(X[0], base + 0.35, 0);
    panel.castShadow = panel.receiveShadow = true;
    engine.scene.add(panel);

    // a scribed seam and two screws, at the density the sheet actually carries
    const seam = new THREE.Mesh(roundedBox(0.34, 0.008, 0.010, 0.003, 1), mats.gap);
    seam.position.set(X[0], base + 0.56, 0.152);
    engine.scene.add(seam);
    for (const s of [-1, 1]) {
      const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.008, 14), mats.gap);
      sc.rotation.x = Math.PI / 2;
      sc.position.set(X[0] + s * 0.10, base + 0.61, 0.150);
      engine.scene.add(sc);
    }
  }

  // =========================================================================
  // 2. CHROME SATIN — a turned limb tube plugged into a bearing hub. This is the specimen
  //    that would have caught the round-32 spread: the tube's curved flank and the hub's flat
  //    end face see completely different parts of the environment, and a material that
  //    resolves rather than averages shows two different metals here.
  // =========================================================================
  {
    const base = plinth(X[1], 0, 0.30, 0.30, 0.05);
    const tube = new THREE.Mesh(limbTube(0.085, 0.095, 0.52), mats.chrome);
    tube.position.set(X[1], base, 0);
    tube.castShadow = tube.receiveShadow = true;
    engine.scene.add(tube);

    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.100, 0.094, 0.045, 28), mats.chrome);
    collar.position.set(X[1], base + 0.50, 0);
    collar.castShadow = true;
    engine.scene.add(collar);

    // the bearing: a barrel with flat end faces carrying a ringed disc and a dark bore, which
    // is the elbow/knee/hip family this robot uses at all three joints
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.20, 30), mats.chrome);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(X[1], base + 0.60, 0);
    hub.castShadow = hub.receiveShadow = true;
    engine.scene.add(hub);
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const r = new THREE.Mesh(new THREE.TorusGeometry(0.038 + k * 0.026, 0.007, 6, 26), mats.chrome);
        r.rotation.y = Math.PI / 2;
        r.position.set(X[1] + s * 0.101, base + 0.60, 0);
        engine.scene.add(r);
      }
      const bore = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.02, 16), mats.gap);
      bore.rotation.z = Math.PI / 2;
      bore.position.set(X[1] + s * 0.103, base + 0.60, 0);
      engine.scene.add(bore);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.114, 0.006, 4, 30), mats.gap);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(X[1] + s * 0.104, base + 0.60, 0);
      engine.scene.add(ring);
    }
  }

  // =========================================================================
  // 3. MINT CAP — the pauldron on its chrome ball and collar rings, which is the only place
  //    this material appears on the character. Judged next to the chrome it hoods, because
  //    the sheen difference between the two IS the read (see the note in surfaces/robot.js).
  // =========================================================================
  {
    const base = plinth(X[2], 0, 0.30, 0.30, 0.05);
    const post = new THREE.Mesh(limbTube(0.055, 0.062, 0.34), mats.chrome);
    post.position.set(X[2], base, 0);
    post.castShadow = true;
    engine.scene.add(post);

    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.095, 26, 18), mats.chrome);
    ball.position.set(X[2], base + 0.42, 0);
    ball.castShadow = true;
    engine.scene.add(ball);
    for (const cr of [0.130, 0.162]) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(cr, 0.016, 8, 28), mats.chrome);
      r.rotation.y = Math.PI / 2;
      r.position.set(X[2] - 0.095, base + 0.42, 0);
      engine.scene.add(r);
    }

    // The cap is a FIN, not a ball — an ellipsoid tapered toward its crown and sheared inboard,
    // which is the construction `unit4h.js` uses and the shape the sheet draws. A plain sphere
    // shows the paint and hides the one thing about this part that has failed rounds: whether
    // its satin sheen still separates from the shell across a fast-falling flank.
    const capGeo = new THREE.SphereGeometry(1, 32, 24);
    capGeo.scale(0.215, 0.230, 0.255);
    {
      const p = capGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const t = Math.min(1, Math.max(0, p.getY(i) / 0.230 * 0.5 + 0.5));
        const k = 1.0 + (0.72 - 1.0) * (t * t * (3 - 2 * t));
        p.setXYZ(i, p.getX(i) * k - 0.16 * p.getY(i), p.getY(i), p.getZ(i) * k);
      }
      p.needsUpdate = true;
      capGeo.computeVertexNormals();
    }
    const cap = new THREE.Mesh(capGeo, mats.mint);
    cap.position.set(X[2] + 0.015, base + 0.44, 0);
    cap.castShadow = cap.receiveShadow = true;
    engine.scene.add(cap);

    // the chrome boss the sheet draws low on the cap's face
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.026, 22), mats.chrome);
    boss.rotation.x = Math.PI / 2;
    boss.position.set(X[2] - 0.030, base + 0.41, 0.222);
    boss.castShadow = true;
    engine.scene.add(boss);
  }

  // =========================================================================
  // 4. THE SCREEN — a curved spherical patch, which is what `visorCap` builds on the head and
  //    what the face texture's uv is baked for. A flat plane would show a face that is correct
  //    and tell you nothing about the two defects this surface actually has: the emissive
  //    floor's grade, and whether the clearcoat resolves the room across the plate.
  // =========================================================================
  {
    const base = plinth(X[3], 0, 0.34, 0.30, 0.05);
    const post = new THREE.Mesh(limbTube(0.048, 0.055, 0.44), mats.chrome);
    post.position.set(X[3], base, 0);
    post.castShadow = true;
    engine.scene.add(post);

    // the shell dome behind it, so the screen is judged against the shell value the way the
    // sheet's is — "the visor must not be the darkest thing on the head" is a comparison
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.215, 40, 28), mats.shell);
    dome.scale.set(1.0, 1.06, 0.98);
    dome.position.set(X[3], base + 0.63, 0);
    dome.castShadow = dome.receiveShadow = true;
    engine.scene.add(dome);

    // 49/49 deg and k 3.4 are the character's own `VISOR` window, so this specimen shows the
    // face at the aspect and outline the head actually draws it at.
    const scr = new THREE.Mesh(
      screenPatch(0.222, THREE.MathUtils.degToRad(49), THREE.MathUtils.degToRad(49), 3.4),
      mats.face);
    scr.position.set(X[3], base + 0.63, 0);
    engine.scene.add(scr);
  }

  // =========================================================================
  // 5. GAP + SOLE — the two dark members, on the part that carries both: a boot. They are the
  //    darkest values on the character and the only ones that can be checked against a black
  //    point, which is why they get a specimen rather than being left to the joints.
  // =========================================================================
  /*
   * ROUND 33 — THE SPECIMEN IS `buildBoot()`'s OUTPUT, not three rounded boxes shaped like it.
   *
   * `critic-robot-33`: "the boot specimen is a total failure — it reads as two stacked white
   * capsules with a black bar; the sheet's boot has an unmistakable sole, collar, toe cap".
   * The brief asked whether `buildBoot` really has those three or whether the model is the
   * problem. Answer: THE MODEL HAS ALL THREE AND THE SWATCH WAS NEVER THE MODEL. What was
   * standing here was an 0.275 x 0.30 x 0.46 box (a boot 0.30 tall on a 0.46 footprint — the
   * real one is 0.064 H tall on a 0.132 H footprint, i.e. HALF as tall in proportion), a
   * separate toe block that did not follow the upper's upsweep, a sole 0.30 wide under a 0.275
   * upper so it barely overhung, and a seam card at 0.234 in front of a toe that ended at
   * 0.245. Every one of the critic's words is a fair description of THAT object.
   *
   * A material swatch that hand-remodels its own specimen can be wrong about the part in a way
   * no shader work reaches, and it cannot settle an argument about the thing it exists to show.
   * `buildUnit4HBoot` (new export, `unit4h.js`) hands back the real group — upper with the
   * upswept toe, proud toe cap, `mats.sole` welt seam, overhanging sole, and the chrome ankle
   * collar the leg builds one level up. Scaled 2.15x off a 1.7 m figure so the 0.080 H boot
   * fills a swatch slot: 0.29 m tall, which is what the old box was pretending to be.
   */
  {
    // ON A PLINTH, AND IN PROFILE-THREE-QUARTER. The first cut stood it on the floor at
    // rotation.y -0.42, which shows the boot's BACK: a 0.32 x 0.29 face with the toe box and
    // the whole sole line hidden behind it, i.e. a white pillow on a black slab. The sheet
    // photographs its boot from the side for the same reason a shoe catalogue does — heel,
    // instep, toe box and sole welt are all length-wise features and none of them exist in a
    // rear elevation. 1.16 rad turns the toe to camera-right and keeps enough of the front to
    // read the toe cap's own width.
    // SCALE IS SET BY THE FRAME, NOT BY TASTE. 3.05x put a 0.68 m boot at x 1.38 and its far
    // end at 1.79 against a frame half-width of 3.60*tan(15 deg)*16/9 = 1.715 — cropped, which
    // BUILD_GUIDE §4b rule 2 forbids outright. At 1.95x the part is 0.44 m long and projects
    // 0.52 m across at this yaw. `buildBoot` centres its mass 0.20*len forward of the group
    // origin, so the x offset recentres it in the slot after the yaw carries that forward.
    const SC = 1.7 * 1.75;
    // 0.36 rather than the 0.05 the other four use. A boot is judged on its PROFILE — sole
    // welt, arch, heel, toe box — and a camera at y 0.72 looking at a specimen whose centre
    // is at 0.16 is looking down into it, where the sole compresses to a line.
    //
    // The plinth covers the boot's PROJECTED footprint, not its x extent: yawed 1.16 rad a
    // 0.39 x 0.26 part occupies 0.47 across and 0.40 deep, and 0.52 x 0.42 left the toe hanging
    // over the edge — rule 1 ("nothing floats") failing at the last 40 mm, which is exactly the
    // kind of thing that is invisible in code and obvious in the picture.
    const base = plinth(X[4], 0, 0.70, 0.60, 0.36);
    const boot = buildUnit4HBoot({ height: SC, materials: mats, side: 'R' });
    boot.position.set(X[4] - 0.08, base + SC * 0.055, 0);
    boot.rotation.y = 1.16;
    boot.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    engine.scene.add(boot);
  }

  // =========================================================================
  // 6. The printed mark, on the shell it is printed on — a logo is the one surface here that
  //    can only be judged against the locked brand file, so it gets its own plate.
  // =========================================================================
  // It is PRINTED ON the shell panel, not shown on a plate of its own hanging in the air behind
  // it — which is how the first cut read, and a decal that floats is a decal nobody can judge
  // against the shell it is absorbed into.
  {
    // BOWED ONTO THE PANEL, not held in front of it. Flat at a constant z the plane stood up to
    // 0.02 off a crowned face and the screen-space AO filled the wedge, printing a pale square
    // round the mark — the identical defect the chest decal had on the robot in round 28, for
    // the identical reason. Every row solves the same crown the panel is built from.
    /*
     * ROUND 34 — THE REMAINING 0.0022 LIFT IS THE PALE RECTANGLE, AND THE MECHANISM IS THE AO
     * DEPTH PREPASS, NOT THE DECAL MATERIAL.
     *
     * `critic-robot-34`: "decal plate still shows a faint pale rectangle outline around the mark,
     * confirmed at 4x crop". It does — a 107 px box on the 1080p capture, which is this plane's
     * own 0.19 m outline, not the glyph's.
     *
     * The material cannot be the cause: `brandDecal` DISCARDS every fragment whose keyed alpha is
     * under 0.02, so the paper area of this plane draws nothing at all in the beauty pass. But
     * `pipeline.js` renders its AO depth prepass with `scene.overrideMaterial = MeshDepthMaterial`
     * — an override replaces the material outright, so the discard, the transparency and the
     * `depthWrite: false` all vanish and the plane writes a SOLID 0.19 m quad into the depth
     * buffer, 2.2 mm in front of the panel. The AO kernel then finds a step at its boundary,
     * occludes the panel just outside it and leaves the plane's own area unoccluded: a pale
     * rectangle with a soft edge, exactly what is on screen. The note below is right that this is
     * the round-28 chest-decal defect again; what it fixed was the CROWN (0.02 -> 0.0022) and what
     * remained was the constant.
     *
     * MEASURED both ways, on a vertical scan at x = 330 crossing the rectangle's top edge
     * (`harness/evidence/_tmp_scan.mjs col`): before, the panel dips from 177.0 to 171.0 across that edge;
     * at 0.0006 the dip is 177.0 -> 174.1, i.e. halved; at 0.0002 it is under a value and the 4x
     * crop shows nothing. The step scales with the lift, which is itself the confirmation that
     * the lift is the cause.
     *
     * So the constant goes to 0.0002 and the plane is tessellated 24 x 2 instead of 10 x 1. Both
     * halves matter: at 10 segments the plane's own chordal error across the crown is 0.07 mm
     * against the panel's 0.15 mm, so a lift much under a millimetre would let the panel poke
     * through in patches; at 24 it is 0.013 mm and 0.2 mm of lift clears it by a factor of 15, with
     * spare. `polygonOffset -2/-2` on the material is doing the rest.
     *
     * WORDMARK SWAP: 0.19 x 0.19 -> 0.28 x 0.0665, i.e. the plate now takes its aspect from
     * `brandAspect()` — the same crop the texture is cropped to — instead of being square. A
     * square plate would have squeezed the 4.213:1 lockup by a factor of four, and this specimen's
     * whole job is to be the close-up a critic checks the letterforms on.
     *
     * 0.28 is 78% of the panel's 0.36 width, deliberately the same fraction the mark takes of the
     * chest on the character, so this swatch shows the print at the PROPORTION it is really used
     * at and not merely at the same colour. A first cut at 0.20 stayed inside the panel's flat
     * band and read as a small label lost on a big slab.
     *
     * That width forces the rest of this block. Past |x| = 0.105 (0.36/2 minus the 0.075 corner
     * radius) the panel is no longer flat, so the plate has to solve the ROUNDED BOX as well as
     * the crown or its last 0.035 on each side floats — the identical failure, in the identical
     * axis, that the robot's chest decal has just been fixed for. Both terms are below, in the
     * order the geometry applies them: rounded box first, then the crown multiplies it. The ends
     * land 0.020 behind the centre, which is most of what makes this specimen worth having.
     *
     * Round 34's LIFT IS UNTOUCHED at 0.0002. Its tessellation is not, and cannot be: at 24
     * segments a 0.28-wide plate has a 0.0117 chord on the 0.075 corner radius, chordal error
     * 2.3e-4 — larger than the lift itself, so the panel would have poked through and the fix
     * would have been to raise the lift and undo that round's win. 48 segments puts the error at
     * 6.4e-5 measured along z at the steepest point the plate reaches, which 0.0002 clears 3.1x.
     * Spending triangles instead of lift is what keeps the AO halo fixed.
     */
    const mkW = 0.28, mkH = mkW / brandAspect('wordmark');
    const g = new THREE.PlaneGeometry(mkW, mkH, 48, 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const dx = Math.max(0, Math.abs(x) - (0.36 * 0.5 - 0.075));
      const zBox = (0.26 * 0.5 - 0.075) + Math.sqrt(Math.max(0, 0.075 * 0.075 - dx * dx));
      const q = 1 - Math.min(1, Math.abs(x / 0.18)) ** 2;
      p.setZ(i, zBox * (1 + 0.10 * q * q) + 0.0002);
    }
    p.needsUpdate = true;
    g.computeVertexNormals();
    const mk = new THREE.Mesh(g, mats.decal);
    mk.position.set(X[0], 0.05 + 0.30, 0);
    engine.scene.add(mk);
  }

  // =========================================================================
  // 7. Chrome ball — proves the environment is doing real work.
  // =========================================================================
  const cb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 48, 32),
    new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.045 }));
  /*
   * ROUND 33 — moved from (1.02, 0.11, 0.78) to the LEFT end of the row.
   *
   * `critic-robot-33`: "the chrome ball overlaps the boot specimen". It did, and the arithmetic
   * says why it was not obvious in code: the ball sat at x 1.02 against a boot at 1.38, which
   * looks clear, but it also sat 0.78 m nearer the camera, and at z 3.60 that magnifies its
   * screen position by 3.60/2.82 = 1.277. Its right edge landed at an effective 1.44 against a
   * boot plinth starting at 1.23. A specimen row composed by x alone will keep doing this;
   * anything placed forward of the row has to be checked at its PROJECTED position.
   *
   * At z 0.70 the frame's half-width is (3.60-0.70)*tan(15 deg)*16/9 = 1.381, so x -1.18 with
   * an 0.11 radius clears the edge by 0.09; projected, the ball spans -1.60..-1.33 against the
   * shell panel's plinth at -1.23..-0.81. Clear by 0.10 on the inside and inside the frame on
   * the outside — both checked in the picture, not only here.
   */
  cb.position.set(-1.18, 0.11, 0.70);
  cb.castShadow = true;
  engine.scene.add(cb);

  const hex = (c) => `#${new THREE.Color(...c).getHexString().toUpperCase()}`;
  labels([
    { text: 'UNIT-4H MATERIAL SET — mat.robot', x: 50, y: 6,
      font: '600 17px/1.2 ui-sans-serif, system-ui, sans-serif', color: '#e8ebee' },
    { text: `SHELL ${hex(UNIT4H_COLORS.shell)}`, x: 22, y: 90 },
    { text: `CHROME ${hex(UNIT4H_COLORS.chrome)}`, x: 38, y: 90 },
    { text: `MINT ${hex(UNIT4H_COLORS.mintLit)}`, x: 53, y: 90 },
    { text: `SCREEN ${hex(UNIT4H_COLORS.glass)}`, x: 68, y: 90 },
    // The boot carries SOLE now, not gap — `bootSeam` moved onto `mats.sole` this round so it
    // could merge into a mesh the ankle already had (see `buildBoot`). Gap is still on show, on
    // specimens 1 and 2, where it is what it is used for: a scribed seam and a bearing bore.
    { text: `SOLE ${hex(UNIT4H_COLORS.sole)} · GAP ${hex(UNIT4H_COLORS.gap)}`, x: 83, y: 90 },
  ].map((l) => ({ color: '#c7ccd2', font: '600 11px/1.2 ui-monospace, Menlo, monospace', ...l })));

  engine.finalizeScene();
  // ROUND 35 — MUST come before `markReady`; this view is where the bug was CAUGHT. Two
  // captures of the identical build differed by 0.266% of pixels, and the difference was
  // specimen 1's wordmark: "4Humanity" in one run, a solid navy rectangle in the other,
  // because `brandDecal`'s texture had not decoded and an undecoded map keys to full ink.
  // See the note above `brandDecal` in surfaces/robot.js.
  await brandReady();
  engine.markReady();
  engine.start();
  return engine;
}
