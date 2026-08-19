import * as THREE from 'three';
import { studio, roundedBox } from './_studio.js';
import { fixStudioBackdrop } from './_studio-bg.js';
import { marbleFloor } from '../materials/surfaces/marble.js';
import { giltBronze, leadCrystal, foxedMirror, patinatedBronze } from '../materials/surfaces/brass.js';
import { walnutPanel } from '../materials/surfaces/walnut.js';

/**
 * mat.brass — gilt bronze, lead crystal, foxed mirror, patinated bronze.
 *
 * Judged together because the estate never shows one without the others: chandeliers,
 * sconces, mirror frames and door furniture are all this palette. Bar:
 * `refs/_sheets/hitman.png` (Paris chandeliers and gilt mirror frames).
 *
 * Composition follows BUILD_GUIDE.md §4b — the seven rules a previous slice missed even
 * though every shader change it made was correct:
 *   1. Nothing floats — every specimen's own base sits at y=0, or is mounted to something
 *      that does (the mirror pivots on its own bottom edge; the hardware is set into a
 *      door stile that reaches the floor).
 *   2/3. Framed with margin — see the camera comment below for the distance math.
 *   4. Exposure — polished gold and a mirror are the two easiest things in this file to
 *      blow to white, so the key light is pulled down from the studio default and the
 *      render is checked by eye, not by the grade numbers.
 *   5. Judged on the mid-grey ground (bg 0x4e535a, envIntensity 0.62 — the exact values
 *      the slice specifies), not the near-white cyc.
 *   6. Specimens are the shapes the material is actually used on: a standing candle-arm
 *      torchère (not a sphere), a hanging crystal cluster, a gilt-framed mirror standing on
 *      its own bottom rail, patinated door furniture set into a stile.
 *   7. A chrome ball, to prove the environment is doing real work — metal is almost
 *      entirely environment reflection.
 */

// ---------------------------------------------------------------------------
// small geometry helpers, local to this view — not shared, not imported from elsewhere
// ---------------------------------------------------------------------------

/**
 * A smooth lathe from (radius, y) profile points, with v RE-PARAMETERISED BY ARC LENGTH.
 *
 * 🚨 THIS IS THE ROOT CAUSE OF "THE GILT READS AS SMOOTH YELLOW WAX", AND NO AMOUNT OF
 * SHADER WORK COULD HAVE REACHED IT.
 *
 * three's LatheGeometry writes `uv.y = j / (points.length - 1)` — the profile point's INDEX,
 * not its distance along the profile. This baluster's profile is 23 points distributed the
 * way a turner distributes them: eight of them inside the bottom 3 cm of mouldings, and ONE
 * SEGMENT spanning the 19 cm plain shaft from y=0.23 to y=0.42. So v advances about twenty
 * times faster per metre through the base rings than through the shaft, and one material
 * baked at one frequency renders as a dense knot of beading at every collar and as long
 * vertical smears everywhere the profile is plain. Both readings are visible in the r1 and
 * r4 captures of the same tile, which is the tell: a material cannot be simultaneously too
 * fine and too coarse unless the SURFACE PARAMETERISATION is what varies.
 *
 * Rewriting uv.y as cumulative arc length divided by a reference circumference makes texel
 * density uniform along the profile AND matches it to the u axis, so the ornament comes out
 * the same size everywhere and square — which is what lets the caller drop the ornAspect
 * correction entirely instead of tuning one compromise value for a mesh that has no single
 * aspect ratio.
 *
 * u is left alone. Its density still varies with the local radius (a 3x spread here, base to
 * shaft) and fixing that needs a per-ring u range, which shears the texture between rings —
 * a worse artefact than the one it removes. v was the 20x error; u is the 3x one.
 */
function lathe(pts, segs = 24) {
  const v = pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y));
  const g = new THREE.LatheGeometry(v, segs);

  let len = 0, rSum = 0;
  const arc = [0];
  for (let j = 1; j < v.length; j++) {
    len += Math.hypot(v[j].x - v[j - 1].x, v[j].y - v[j - 1].y);
    arc.push(len);
  }
  for (const p of v) rSum += p.x;
  // reference circumference: one v unit covers the same world distance as one u unit does
  // at the mean radius, so a square in uv is a square on the object
  const circ = Math.max(2 * Math.PI * (rSum / v.length), 1e-4);
  const uv = g.attributes.uv;
  // LatheGeometry emits vertices as i (around) major, j (profile) minor, so j = k % count
  for (let k = 0; k < uv.count; k++) uv.setY(k, arc[k % v.length] / circ);
  uv.needsUpdate = true;

  g.computeVertexNormals();
  return g;
}

/** Flat-shaded (facetted) version of a geometry — cut crystal is faceted, not smooth. */
function facet(geo) {
  const g = geo.toNonIndexed();
  g.computeVertexNormals();
  geo.dispose();
  return g;
}

/** A small faceted pear-shaped crystal drop. */
function dropGeo(len = 0.075, wid = 0.017) {
  const pts = [
    [0.0000, 0.000], [wid * 0.30, 0.010], [wid * 0.55, 0.026], [wid * 1.00, 0.062],
    [wid * 0.98, 0.115], [wid * 0.72, 0.170], [wid * 0.40, 0.205], [wid * 0.16, 0.222], [0, 0.228],
  ].map(([r, y]) => [r, y * (len / 0.228)]);
  return facet(lathe(pts, 8));
}

export default async function view() {
  // A mid-grey cyc, not the art-sheet near-white — see mat-marble.js/BUILD_GUIDE §4b rule
  // 5. Metal against a white cyc reads as white; there is nothing left to judge it against.
  //
  // FRAMING: the tallest specimen (the torchère, pedestal + candle arm) tops out just over
  // 1.0 m. (height / 0.8) / 2 / tan(fov/2) at fov 36 wants the camera about 2.5 m back for
  // that alone, but the four specimens spread across roughly 2.3 m of width, which is the
  // binding constraint at this aspect ratio — hence 3.35 m, with margin confirmed by eye
  // against the actual render, not just the formula.
  const engine = await studio({
    bg: 0x4e535a,
    envIntensity: 0.62,
    cameraPos: [0.05, 1.12, 3.35],
    target: [0.0, 0.55, 0],
    fov: 36,
  });
  fixStudioBackdrop(engine, 0x4e535a);

  // ---- ABLATION HANDLES, both complete by construction ----------------------------
  // `?detail=0`  every authored surface detail in all four materials goes to zero (plain
  //              gold, plain bronze, clean silvering) — the "does any of this read?" test.
  // `?mirror=env` the mirror glass keeps the shared studio PMREM as its only specular
  //              source, i.e. exactly what it had before the cube probe below existed.
  // `?bg=raw`    see `_studio-bg.js` — restores the double-converted backdrop.
  const Q = new URLSearchParams(location.search);
  const DETAIL = Q.get('detail') === '0' ? 0.0 : 1.0;
  const MIRROR_PROBE = Q.get('mirror') !== 'env';

  // Polished gold and a mirror both blow to white fast under the studio's default 2.5, but
  // cutting the key too hard turns the un-lit side of everything into a silhouette cutout
  // and kills the crystal (transmission reads dark against a dark backdrop with nothing to
  // transmit). So: a mild trim on the key, fill/rim left close to the studio default to
  // keep the shadow side readable, checked against the actual render below.
  engine.lights.key.intensity = 2.1;
  engine.lights.fill.intensity = 0.95;
  engine.lights.rim.intensity = 1.5;

  // ---- floor: the props need something to stand on. Not part of this slice's four
  // materials (metal isn't a floor), so a proven quality floor from the marble slice —
  // matches the Hitman reference, where gilt fixtures stand on marble.
  //
  // COST NOTE, measured 2026-08-03. This one call is the most expensive thing in the view
  // by two orders of magnitude, and none of it is this view's own material. `MARBLE_SURFACE`
  // is the largest surface shader in the project, and the baker inlines `surface()` five
  // times per fragment (centre + four height taps), so ANGLE/D3D11 spends ~50-60 s compiling
  // it the first time it is seen in a browser process. A 32x32 marble bake — 1024 texels —
  // measured 58.9 s; a 2048x2048 bake of the same program, once compiled, measured 209 ms.
  // It is compilation, not rasterisation, and it is paid once per GPU process, so a
  // multi-view run pays it once and an isolated `shoot.mjs --view mat.brass` pays it in full.
  // Do not "optimise" this by dropping the bake size — size is not what costs.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), marbleFloor({ repeat: [2, 2] }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  engine.scene.add(floor);

  // =========================================================================
  // 1 + 2. Gilt bronze torchère (turned baluster + candle arm), standing on the floor,
  // with a cluster of lead crystal drops hanging from the arm.
  // =========================================================================
  // ornAspect was left at 1.0 here and should never have been: a LatheGeometry's v runs the
  // whole 1.01 m profile while its u runs one ~0.36 m circumference, so at aspect 1 every
  // boss was stretched about 2.8x vertically and the ornament rendered as vertical smears
  // down the shaft — the same defect brass.js's own comment describes for the frame bars,
  // fixed there and missed here. 2.8 = profile length / mean circumference.
  // ornAspect is 1.0 and MEANS it now: lathe() above makes u and v the same world scale, so
  // the ornament is square without a per-mesh correction. ornScale 18 over a ~0.44 m
  // reference circumference puts a boss at about 2.4 cm — chased-ornament scale for a
  // torchere. (The earlier 5 gave 7 cm domes that read as dents in wax; 14 with a guessed
  // 2.8 aspect corrected the average and left the shaft-vs-collar discrepancy untouched,
  // because that discrepancy was never an aspect problem.)
  const giltMat = giltBronze({
    ornScale: 18, ornAspect: 1.0, leafScale: 11, wear: 0.75, dust: 0.5, grime: 0.55,
    detail: DETAIL,
  });

  const torchere = new THREE.Group();
  torchere.position.set(0.0, 0, -0.25);

  const PEDESTAL = [
    [0.0010, 0.000], [0.1550, 0.000], [0.1600, 0.016], [0.1180, 0.030], [0.1320, 0.044],
    [0.0860, 0.062], [0.0600, 0.078], [0.0660, 0.098], [0.0480, 0.130], [0.0520, 0.230],
    [0.0500, 0.420], [0.0580, 0.470], [0.0480, 0.520], [0.0760, 0.575], [0.0500, 0.630],
    [0.0540, 0.760], [0.0860, 0.815], [0.1120, 0.848], [0.0620, 0.868], [0.0400, 0.900],
    [0.0560, 0.945], [0.0200, 0.985], [0.0005, 1.010],
  ];
  const pedestal = new THREE.Mesh(lathe(PEDESTAL, 28), giltMat);
  pedestal.castShadow = pedestal.receiveShadow = true;
  torchere.add(pedestal);

  // one S-scroll candle arm, reaching out from the capital, angled toward the camera so
  // both the arm's relief and the hanging crystal catch the key light.
  const armY = 0.855, armR = 0.225;
  const arm = new THREE.Group();
  arm.rotation.y = THREE.MathUtils.degToRad(-38);

  const s1 = new THREE.Mesh(new THREE.TorusGeometry(armR * 0.62, 0.017, 8, 20, Math.PI * 0.62), giltMat);
  s1.rotation.set(Math.PI / 2, 0, -0.4);
  s1.position.set(armR * 0.32, armY - 0.09, 0);
  s1.castShadow = true;
  arm.add(s1);

  const s2 = new THREE.Mesh(new THREE.TorusGeometry(armR * 0.32, 0.014, 6, 16, Math.PI * 0.8), giltMat);
  s2.rotation.set(Math.PI / 2, 0, 2.1);
  s2.position.set(armR * 0.90, armY + 0.03, 0);
  s2.castShadow = true;
  arm.add(s2);

  const leaf = new THREE.Mesh(lathe([[0, 0], [0.040, 0.012], [0.032, 0.048], [0.017, 0.074], [0, 0.080]], 8), giltMat);
  leaf.position.set(armR * 0.10, armY - 0.04, 0);
  leaf.rotation.z = -0.9;
  arm.add(leaf);

  const panX = armR * 1.05, panY = armY + 0.14;
  const pan = new THREE.Mesh(lathe([
    [0, 0], [0.058, 0.006], [0.060, 0.015], [0.028, 0.019], [0.020, 0.024], [0.020, 0.058], [0.024, 0.062], [0, 0.062],
  ], 12), giltMat);
  pan.position.set(panX, panY, 0);
  pan.castShadow = true;
  arm.add(pan);

  // a small candle-glow point light at the pan — without it the crystal cluster hangs
  // against the dark upper backdrop with nothing behind it to transmit, and transmission
  // through black reads as invisible, the same failure mode gadgetmat.js documents for
  // transmissive glass shot against a *white* cyc (there it swallows the shape; here, with
  // a near-black backdrop, the same optics swallow it the other way). A real chandelier
  // lights its own crystal for exactly this reason — see world/chandelier.js.
  const candleGlow = new THREE.PointLight(0xffcf9e, 3.2, 1.4, 2);
  candleGlow.position.set(panX, panY + 0.02, 0.06);
  arm.add(candleGlow);

  torchere.add(arm);
  engine.scene.add(torchere);

  // crystal cluster hanging beneath the drip pan — bigger and tighter than the first pass,
  // which read as a scatter of dark specks rather than a cluster that catches light.
  const crystalMat = leadCrystal({ facetScale: 6.5 });
  const dG = dropGeo(0.095, 0.021);
  const nDrops = 9;
  for (let i = 0; i < nDrops; i++) {
    const a = (i / nDrops) * Math.PI * 2;
    const rr = 0.028 + (i % 2) * 0.010;
    const yy = panY - 0.040 - (i % 3) * 0.014;
    const drop = new THREE.Mesh(dG, crystalMat);
    drop.position.set(panX + Math.cos(a) * rr, yy, Math.sin(a) * rr);
    drop.rotation.y = a;
    drop.castShadow = false;
    arm.add(drop);
  }

  // =========================================================================
  // 3. Foxed mirror in a gilt bronze frame — a free-standing mirror whose frame's bottom
  // rail rests flush on the floor (y=0 at the group origin), tilted back slightly from
  // that same bottom edge so it reads as leaning rather than floating or falling forward.
  // =========================================================================
  // Two material instances, not one: a box-projected UV maps 0..1 across a bar's face
  // regardless of its real proportions, so one ornScale would either smear the ornament
  // into streaks along the tall bars or the wide ones. ornAspect corrects the v-axis
  // frequency for each bar orientation's real width:height so the boss-and-scroll pattern
  // stays boss-and-scroll-shaped instead of reading as wood grain (see brass.js).
  const glassW = 0.46, glassH = 0.74, fw = 0.055, fd = 0.032;
  const giltFrameMatH = giltBronze({   // top/bottom: wide (~0.57) and short (fw)
    ornScale: 9, ornAspect: fw / (glassW + fw * 2), leafScale: 12, wear: 0.55, dust: 0.35,
    detail: DETAIL,
  });
  const giltFrameMatV = giltBronze({   // left/right: narrow (fw) and tall (glassH)
    ornScale: 2.4, ornAspect: glassH / fw, leafScale: 12, wear: 0.55, dust: 0.35,
    detail: DETAIL,
  });
  const mirrorMat = foxedMirror({ foxAmt: 0.6, detail: DETAIL });
  // 🚨 SEE THE HEADER OF FOXED_MIRROR_SURFACE. Without its own envMap this material's only
  // specular source is the shared studio PMREM, and one flat plane sampling one smooth probe
  // in one direction returns one value — the r1 glass spanned twenty luminance values across
  // the whole pane, which is why it read as paint. `defines` rather than
  // `customProgramCacheKey` because `post/pipeline.js`'s `patchForScreenAO()` ASSIGNS the
  // cache key rather than composing it, so a key this material set for itself would be
  // discarded at `finalizeScene()` — HANDOFF's live `brandDecal` hazard, same mechanism.
  // `defines` is hashed by `WebGLPrograms.getProgramCacheKey` and nothing rewrites it.
  if (MIRROR_PROBE) mirrorMat.defines = { ...(mirrorMat.defines ?? {}), RRR_MIRROR_PROBE: '1' };

  const mirrorGroup = new THREE.Group();
  mirrorGroup.position.set(-0.88, 0, -0.30);
  // Leans back off its own bottom rail — pivot is at y=0. The ANGLES ARE NOW LOAD-BEARING,
  // because once the pane has a probe what it points at decides whether it reads as a mirror.
  //
  // ⚠️ AND THE OBVIOUS INTUITION IS BACKWARDS HERE, MEASURED THE HARD WAY. "Lean it back more
  // and it shows more floor" is true for a viewer standing in front of a full-length glass and
  // false for this camera. Taking the lean to 9 degrees turned the pane BLACK: reflecting the
  // camera ray about the tilted normal gives r = (0.19, +0.15, 0.96) — up and behind — which
  // is the unlit top of the backdrop, and the only thing left visible was the matte foxing,
  // brighter than the mirror around it. Polarity inverted, and the plate read dirtier than
  // before. At 2 degrees of lean r comes out (0.19, -0.11, 0.97) — down and behind — which is
  // the white marble floor, so the pane carries a bright lower field under a dark upper one:
  // a horizon, which is the single cue that says "reflection" rather than "grey card".
  // The yaw brings the lit half of the room across into it without foreshortening the pane.
  mirrorGroup.rotation.x = -0.035;
  mirrorGroup.rotation.y = 0.22;

  const fBottom = new THREE.Mesh(roundedBox(glassW + fw * 2, fw, fd, 0.010, 2), giltFrameMatH);
  fBottom.position.set(0, fw / 2, 0);
  const fTop = new THREE.Mesh(roundedBox(glassW + fw * 2, fw, fd, 0.010, 2), giltFrameMatH);
  fTop.position.set(0, fw + glassH + fw / 2, 0);
  const fLeft = new THREE.Mesh(roundedBox(fw, glassH, fd, 0.010, 2), giltFrameMatV);
  fLeft.position.set(-(glassW / 2 + fw / 2), fw + glassH / 2, 0);
  const fRight = fLeft.clone();
  fRight.position.x = glassW / 2 + fw / 2;
  for (const b of [fBottom, fTop, fLeft, fRight]) { b.castShadow = b.receiveShadow = true; mirrorGroup.add(b); }

  const glass = new THREE.Mesh(new THREE.PlaneGeometry(glassW - 0.01, glassH - 0.01), mirrorMat);
  glass.position.set(0, fw + glassH / 2, fd / 2 - 0.004);
  glass.receiveShadow = true;
  mirrorGroup.add(glass);

  engine.scene.add(mirrorGroup);

  // =========================================================================
  // 4. Patinated bronze door handle + hinge, set into a plain door stile that reaches the
  // floor — the hardware itself is the specimen, the stile is just what it is mounted to.
  // =========================================================================
  const patina = patinatedBronze({ patina: 0.6, wear: 0.65, detail: DETAIL });

  /*
   * 🚨 THE OPEN COMPLAINT "THE PATINATED BRONZE HARDWARE IS A FEATURELESS BLACK SLAB — READS
   * AS A MISSING TEXTURE" NAMES THE WRONG OBJECT, AND THAT MATTERS BECAUSE THE RIGHT OBJECT
   * IS THE ONE THAT NEEDED FIXING.
   *
   * Cropped and enlarged off the r1 capture, the black slab is THE DOOR STILE, and the
   * patinated bronze is the small pale-olive plate, rose, lever and hinge sitting ON it —
   * present, legible as bronze, and demonstrably not black: the stile measures RGB mean
   * (17.8, 13.8, 7.8) while the hardware plate measures (20.3, 17.4, 12.8) with a max
   * luminance of 152. "Reads as a missing texture" was literally true of the stile: it was
   * the one object in this view with no texture at all, a bare MeshStandardMaterial at
   * 0x39301f, and at 0.11 x 1.0 m it occupies more of the frame than any single specimen.
   *
   * Given a real walnut it stops being a void, and — the actual point — the bronze finally
   * has a lit surround to be seen against instead of disappearing into a black rectangle.
   * The material is this agent's other piece, so the two are judged against each other.
   */
  const stileMat = walnutPanel({
    panelsX: 1, panelsY: 1, stile: 0.001, bevel: 0.02,   // no frame-and-panel: one solid board
    gilt: 0.0, grime: 0.45, seed: 11.0, size: 512,
  });

  const stileW = 0.11, stileD = 0.055, stileH = 1.0;
  const stileGroup = new THREE.Group();
  stileGroup.position.set(0.72, 0, 0.10);
  stileGroup.rotation.y = -0.30;   // angles the face toward the key light and the camera

  const stile = new THREE.Mesh(roundedBox(stileW, stileH, stileD, 0.007, 2), stileMat);
  stile.position.set(0, stileH / 2, 0);
  stile.castShadow = stile.receiveShadow = true;
  stileGroup.add(stile);

  // escutcheon backplate, then the rose and lever mounted on it — a bare rose with no
  // backplate read as a couple of gold specks with nothing to anchor them.
  const plateY = 0.62;
  const plate = new THREE.Mesh(roundedBox(0.075, 0.235, 0.012, 0.012, 2), patina);
  plate.position.set(stileW / 2 + 0.006, plateY, 0);
  plate.rotation.y = Math.PI / 2;
  plate.castShadow = plate.receiveShadow = true;
  stileGroup.add(plate);

  const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.016, 24), patina);
  rose.rotation.z = Math.PI / 2;
  rose.position.set(stileW / 2 + 0.014, plateY, 0);
  rose.castShadow = true;
  stileGroup.add(rose);

  const lever = new THREE.Mesh(lathe([
    [0, 0], [0.016, 0], [0.016, 0.024], [0.011, 0.12], [0.011, 0.165], [0.006, 0.19],
  ], 12), patina);
  lever.rotation.z = Math.PI / 2;
  lever.rotation.y = 0.24;
  lever.position.set(stileW / 2 + 0.022, plateY, 0);
  lever.castShadow = true;
  stileGroup.add(lever);

  // a three-knuckle butt hinge lower on the same stile's edge
  const hingeY = 0.30;
  const hingeLeafA = new THREE.Mesh(roundedBox(0.022, 0.19, 0.055, 0.005, 1), patina);
  hingeLeafA.position.set(-(stileW / 2 + 0.010), hingeY, 0);
  hingeLeafA.castShadow = true;
  stileGroup.add(hingeLeafA);
  const knuckle = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.20, 14), patina);
  knuckle.position.set(-(stileW / 2 + 0.023), hingeY, 0);
  knuckle.castShadow = true;
  stileGroup.add(knuckle);

  engine.scene.add(stileGroup);

  // =========================================================================
  // 7. Chrome ball — proves the environment is doing real work.
  // =========================================================================
  const cb = new THREE.Mesh(new THREE.SphereGeometry(0.10, 48, 32),
    new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.045 }));
  cb.position.set(1.15, 0.10, 0.55);
  cb.castShadow = true;
  engine.scene.add(cb);

  engine.finalizeScene();

  // =========================================================================
  // The mirror's reflection probe. A ONE-SHOT cube render from the plane's own position,
  // handed to the glass as its own `envMap`.
  //
  // WHY IT HAS TO BE A PROBE AND NOT A KNOB. `_studio.js` documents that
  // `material.envMapIntensity` is dead in this project because no material sets its own
  // `envMap`, so every surface samples one scene-wide probe. For most materials that only
  // costs them a per-material intensity; for a MIRROR it costs the reflection itself,
  // because a flat pane sampling a smooth grey box returns a single value over its whole
  // area. Assigning an envMap flips three's `WebGLMaterials` to the `material.envMap`
  // branch, so this pane finally reflects the room it is standing in — the torchere, the
  // marble floor, the backdrop — and the foxing has something to eat holes in.
  //
  // ONE SHOT, at scene-build time, is deliberate: the view is static, and a per-frame cube
  // update would be six extra scene renders every frame for a specimen that never moves. It
  // also keeps the capture deterministic, which a per-frame probe on an uncapped rAF would
  // not (see `docs/capture-determinism.md`).
  //
  // The glass is hidden for the probe render. Left visible it samples its own previous
  // (black) cube and bakes that into the next one, which is the classic mirror-in-mirror
  // feedback and reads as a dead grey rectangle inside the reflection.
  if (MIRROR_PROBE) {
    const cubeRT = new THREE.WebGLCubeRenderTarget(256, {
      generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter,
    });
    const probe = new THREE.CubeCamera(0.05, 40, cubeRT);
    glass.getWorldPosition(probe.position);
    engine.scene.add(probe);
    glass.visible = false;
    probe.update(engine.renderer, engine.scene);
    glass.visible = true;
    mirrorMat.envMap = cubeRT.texture;
    mirrorMat.envMapIntensity = 1.15;
    mirrorMat.needsUpdate = true;
  }

  engine.markReady();
  engine.start();
  return engine;
}
