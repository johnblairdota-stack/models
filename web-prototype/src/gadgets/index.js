import * as THREE from 'three';
import { roundedBoxGeometry } from '../views/_studio.js';
import {
  brass, gunmetal, chrome, hotSteel, clearGlass, ballMaterial, polymer,
  glowMat, glowSprite, BALL_COLOURS,
} from './gadgetmat.js';

/**
 * GADGET LIMBS.
 *
 * These are not held weapons — each one REPLACES a limb. That is the game's core idea:
 * your limbs are simultaneously your HP, your inventory and your loadout, so equipping the
 * nail gun costs you an arm, literally.
 *
 * Every builder returns the same shape so the equip code never special-cases:
 *
 *   const g = buildGadget('nailgun', { height, materials });
 *   g.root        THREE.Group. Origin is the ATTACHMENT POINT, oriented to match the
 *                 limb it replaces: -Y runs down the limb, +Z is the robot's forward.
 *   g.socket      'forearmL' | 'forearmR' | 'shinL' | 'shinR' — what it replaces
 *   g.update(dt, t)  optional animation (spinning barrels, flame flicker)
 *   g.fire()      trigger the visual effect once
 *   g.lights      any THREE.Light it owns, so a scene can budget them
 *   g.dispose()
 *
 * Proportions are read off the Dev Art gadget shots and expressed as fractions of the
 * robot's total height, so they scale with the rig.
 *
 * ORIENTATION, and why it changed. Every one of these used to be built running along +Z,
 * i.e. sticking straight out of the wrist like a torch. The Dev Art holds all four arm
 * gadgets along the FOREARM LINE — the gadget is the continuation of the limb, angled
 * down and out. So each is now built inside a `barrel` group whose local -Y is the bore
 * axis, tilted a little forward, and the muzzle is at the far -Y end.
 */

const GADGETS = ['nailgun', 'oil', 'grapple', 'ball', 'skates'];
export const GADGET_IDS = GADGETS;

/**
 * ============================================================================
 * `backdrop` — WHICH SURFACE THIS GADGET'S FILTERS ARE GOING TO LAND ON
 * ============================================================================
 *
 * `'studio'` (default) = the near-white cyc of the `gadget.*` views, LINEAR RADIANCE 2.2–3.6,
 * which ACES flattens onto LDR 204–207. `'world'` = the mansion, a lit MID-TONE.
 *
 * ⚠️ THIS IS NOT A STYLE OPTION AND IT IS NOT ONE VALUE WITH A FUDGE FACTOR. The two surfaces
 * sit on opposite parts of the tone curve, and a multiply filter — the only blend with any
 * authority over the cyc — is roughly twice as violent where the curve still has slope.
 * Measured on both surfaces with the SAME instrument
 * (`harness/scenarios/gadget-stage.mjs`, world frozen, dynamic resolution pinned):
 *
 *   strength   studio cyc peak r-b   corridor floor luminance
 *   0.08                       +11                      -4
 *   0.14                       +16                      -6
 *   0.20                       +21                      -9
 *   0.28                       +29                     -12
 *   0.36                       +40                     -16
 *   0.46 (shipped)             +58                     -20
 *   0.60                       +88                     -25
 *
 * The bar art's own row beside the gun runs +6/+17/+27/+45/**+62**, so the cyc needs ~0.46 and
 * NOTHING LESS REACHES IT — at the strength that leaves the corridor alone (~0.12) the cyc gets
 * +15, which is where a NORMAL BLEND already sits (+16, measured) and a quarter of the target.
 * **There is no single value. The two results are only both obtainable if the knob is gated on
 * which surface the gun is standing in**, which is what this option does.
 */
const HEAT_WASH = {
  // tint and filter strength for `glowSprite(hex, strength, { blend: 'multiply' })`
  studio: { hex: 0xff8a3c, strength: 0.46, bloom: 1.00 },
  // 0.12 costs the corridor floor ~5 LDR levels instead of ~21, and the floor is already at
  // r-b ~124 from the gun's own point light, so the warmth was never the filter's job here.
  // The additive pair is grown to compensate: an ADD is what carries a dark room (it is
  // arithmetically inert on the cyc, so growing it cannot leak back into the studio result).
  world: { hex: 0xff8a3c, strength: 0.12, bloom: 1.55 },
};

export function buildGadget(name, opts = {}) {
  const H = opts.height ?? 1.7;
  switch (name) {
    case 'nailgun': return nailGun(H, opts);
    case 'oil': return oilLobber(H, opts);
    case 'grapple': return grapplingHook(H, opts);
    case 'ball': return bouncyBallGun(H, opts);
    case 'skates': return rocketSkates(H, opts);
    default: throw new Error(`unknown gadget "${name}" — known: ${GADGETS.join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------
function mesh(geo, mat, disposables, name) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  if (name) m.name = name;
  disposables.push(geo);
  return m;
}

/**
 * Give every mesh in the map the name of the variable holding it, and return the map so it
 * can be dropped in at the end of a builder.
 *
 * WHY THIS EXISTS. `harness/_tmp_geoprobe.mjs --pick` raycasts camera->pixel and answers
 * "which mesh owns this pixel"; it is the tool that proved the hunter's shoulder ball was
 * rendering inside its own bore, and it is useless on anything unnamed. `unit4h.js` and
 * `hunter.js` name their meshes; this file did not, so `--pick` answered "(unnamed)" for
 * every gadget hit and could only report the MATERIAL — on a group holding four of the
 * board's lowest scores. Naming by variable rather than by hand keeps the label and the
 * code that builds it from drifting apart.
 *
 * Meshes made inside a loop take their name at the `mesh()` call, since there is no
 * variable to read.
 */
function named(map) {
  for (const k of Object.keys(map)) {
    const v = map[k];
    if (!v) continue;
    if (Array.isArray(v)) v.forEach((o, i) => { if (o) o.name = `${k}${i}`; });
    else v.name = k;
  }
  return map;
}

/** A square-section torus — the brass coil loops on the nail gun. */
function squareTorus(radius, section, segments = 48) {
  const shape = new THREE.Shape();
  const h = section / 2;
  shape.moveTo(-h, -h); shape.lineTo(h, -h); shape.lineTo(h, h); shape.lineTo(-h, h);
  shape.closePath();
  const path = new THREE.CatmullRomCurve3(
    Array.from({ length: segments }, (_, i) => {
      const a = (i / segments) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0);
    }), true);
  const g = new THREE.ExtrudeGeometry(shape, {
    steps: segments, bevelEnabled: false, extrudePath: path,
  });
  // ExtrudeGeometry along a path leaves the seam ring with a mismatched normal; recomputing
  // costs nothing here and stops a dark line running around every coil.
  g.computeVertexNormals();
  return g;
}

/** Helical coil — the compression spring on the ball gun. */
function helix(radius, turns, length, wire, seg = 120) {
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, a = t * Math.PI * 2 * turns;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, -t * length, Math.sin(a) * radius));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, wire, 8, false);
}

/**
 * The chrome mount sleeve every arm gadget mates to.
 *
 * The Dev Art shows a machined chrome cuff immediately below the elbow on all four arm
 * gadgets — it is the visual sentence "this bolted on where the forearm used to be". It
 * also has to actually cover the elbow, because the view hides the whole forearm subtree
 * and an uncapped joint reads as a modelling hole.
 */
function mountSleeve(H, matChrome, matAccent, D, len = 0.062) {
  const g = new THREE.Group();
  g.name = 'mountSleeve';
  const sleeve = mesh(new THREE.CylinderGeometry(H * 0.040, H * 0.036, H * len, 26), matChrome, D, 'cuffSleeve');
  sleeve.position.y = -H * len * 0.5 + H * 0.010;
  g.add(sleeve);
  // rolled lip at the top and a collar ring at the bottom
  const lip = mesh(new THREE.TorusGeometry(H * 0.040, H * 0.0055, 8, 26), matChrome, D, 'cuffLip');
  lip.rotation.x = Math.PI / 2;
  lip.position.y = H * 0.010;
  g.add(lip);
  const ring = mesh(new THREE.TorusGeometry(H * 0.037, H * 0.0060, 8, 26), matAccent, D, 'cuffRing');
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -H * len + H * 0.012;
  g.add(ring);
  // six hex bolts around the cuff
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const b = mesh(new THREE.CylinderGeometry(H * 0.0058, H * 0.0058, H * 0.008, 6), matAccent, D, `cuffBolt${i}`);
    b.position.set(Math.cos(a) * H * 0.037, -H * 0.018, Math.sin(a) * H * 0.037);
    b.lookAt(0, -H * 0.018, 0);
    b.rotateX(Math.PI / 2);
    g.add(b);
  }
  return g;
}

/**
 * Orient a group so its local axes line up with the WORLD axes, cancelling every joint
 * rotation above it. Effects that obey gravity — the oil lobber's arc, its floor splash —
 * are authored in this space, so they stay vertical no matter how the arm is posed.
 * Returns the accumulated world scale so lengths can be authored in metres.
 */
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
function worldAlign(group) {
  const parent = group.parent;
  if (!parent) return 1;
  parent.getWorldQuaternion(_q);
  group.quaternion.copy(_q).invert();
  parent.getWorldScale(_v);
  return _v.x || 1;
}

// ---------------------------------------------------------------------------
// 1. NAIL GUN  — Dev Art 1785313925351
//    A long black slab running down the forearm line, a glowing rail let into its face
//    that runs deep red at the breech to white at the muzzle, a bundle of gold
//    square-section rails looping over the top, a blue-white pilot flame at the muzzle
//    root, and enough heat spilling into the air to light the wall behind it.
// ---------------------------------------------------------------------------
function nailGun(H, opts) {
  const D = [];
  const WASH = HEAT_WASH[opts.backdrop] ?? HEAT_WASH.studio;
  const root = new THREE.Group();
  root.name = 'nailgun';
  const mBrass = brass({ tint: [0.92, 0.70, 0.24], polish: 0.95, grime: 0.22 });
  const mChrome = chrome({ tint: [0.88, 0.90, 0.93], wear: 0.45 });
  const mGun = gunmetal({ dark: 0.35, wear: 0.6 });
  const mPoly = polymer();

  root.add(mountSleeve(H, mChrome, mBrass, D));

  // Everything below the cuff lives in `gun`, whose -Y is the bore. Tilted forward so the
  // muzzle leads the elbow, which is the line the reference draws.
  const gun = new THREE.Group();
  gun.name = 'nailgunBody';
  gun.position.y = -H * 0.052;
  gun.rotation.x = -0.30;
  root.add(gun);

  const L = H * 0.300;                // slab length — reaches past the hip, as in the art
  const midY = -H * 0.020 - L * 0.5;

  // receiver at the breech
  const breech = mesh(roundedBoxGeometry(H * 0.060, H * 0.062, H * 0.086, H * 0.012, 3), mGun, D);
  breech.position.set(0, -H * 0.036, H * 0.004);
  gun.add(breech);

  // THE BLACK SLAB. Long, flat, canted — the dominant volume in the reference.
  const slab = mesh(roundedBoxGeometry(H * 0.050, L, H * 0.078, H * 0.010, 3), mPoly, D);
  slab.position.set(0, midY, 0);
  gun.add(slab);
  // cast ribs down the slab's outer face so it is not a plain box
  for (let i = 0; i < 7; i++) {
    const rib = mesh(new THREE.BoxGeometry(H * 0.053, H * 0.0075, H * 0.052), mGun, D, `slabRib${i}`);
    rib.position.set(0, -H * 0.048 - i * L * 0.128, -H * 0.014);
    gun.add(rib);
  }

  // THE HOT RAIL, let into the front face of the slab. Local +Y is the breech and -Y the muzzle.
  //
  // ⚠️ `dir` WAS -1 — WHITE AT THE MUZZLE, DEEP RED AT THE BREECH — AND THE ART RUNS THE OTHER
  // WAY. Opened `Dev Art/1785313925351.png` at 3x rather than re-reading the comment: the gold
  // coil bundle sits at the GRIP end, a blue-white pilot flame jets sideways out of the barrel
  // right at that junction, the rail is white-hot there, and it fades down through yellow,
  // orange and deep red to a SOOTY DARK CAP at the far end, where the cooling slots read as
  // black cut-outs against nothing. `critic-gadget-4` measured the render's peak at mid-barrel
  // with a grey unlit tip and called the direction wrong; it is, and this is the line.
  //
  // The heat is manufactured at the coil and leaves at the muzzle, which is also the only
  // reading that makes physical sense of a gun with a heating coil bolted to its breech.
  const railLen = L * 0.94;
  const rail = mesh(new THREE.BoxGeometry(H * 0.019, railLen, H * 0.026), hotSteel({
    heat: 1.0, half: railLen * 0.5, dir: 1,
  }), D);
  rail.position.set(0, midY, H * 0.040);
  rail.castShadow = false;
  gun.add(rail);
  // dark rail guides either side, so the glow is framed by hard metal rather than floating
  // in black. Deliberately narrow and dark: at chrome width they became the loudest thing
  // on the gadget and the gun read as a ladder.
  for (const [i, x] of [-H * 0.028, H * 0.028].entries()) {
    const guide = mesh(new THREE.BoxGeometry(H * 0.008, railLen * 1.02, H * 0.026), mGun, D, `railGuide${i}`);
    guide.position.set(x, midY, H * 0.036);
    gun.add(guide);
  }

  // GOLD SQUARE-SECTION COIL BUNDLE. Four loops paired outboard of the slab so each one
  // passes clear over the top AND under the belly without ever intersecting the body or
  // masking the glow. That full wrap is what makes the gold read from any angle; loops tucked
  // behind the slab only ever showed a sliver.
  //
  // ⚠️ THIS BUNDLE USED TO BE THE GUN. `critic-gadget-5`'s surviving hate — the only one left
  // on this piece — was that "the gold coil bundle visually dominates ... roughly half the
  // visible gun's length and area in the render versus a compact ~20 percent accent in the
  // art, where the long ribbed barrel is unambiguously the dominant shape." Both halves of
  // that check out, measured along the bore axis on 3-4x crops of each image:
  //
  //                            axial extent        as a share of visible gun length
  //   art (1785313925351)      compact pack at the breech            ~22%
  //   render, before           H*0.205 (scale.y 1.55 on r H*0.066)   ~58%
  //   render, after            H*0.085                               ~23%
  //
  // Two separate faults, and shrinking alone would only have fixed one:
  //  - SIZE. `scale.y` 1.55 on a ring radius of H*0.066 gave a half-extent of H*0.102, so the
  //    bundle alone was 68% as long as the entire slab.
  //  - PLACE. At `midY + L*0.20` it sat centred a third of the way down the barrel, so it cut
  //    the dominant shape in half lengthwise. The art bolts the brass to the BREECH and lets
  //    the ribbed barrel run away clean from it — which is also the reading that makes sense
  //    of a heating coil, and is what the rail's `dir: 1` above has always assumed.
  //
  // The X positions are UNCHANGED and must stay outboard of the slab's H*0.025 half-width:
  // at |x| = H*0.032 with a half-section of H*0.006 the inner face clears the slab by H*0.001.
  // Shrinking the loops does not close that gap — it is set by X, not by the scale — but any
  // future pull-in of the pairs will bury the brass inside the slab.
  const loopY = midY + L * 0.333;
  for (const [i, x] of [-H * 0.048, -H * 0.032, H * 0.032, H * 0.048].entries()) {
    const loop = mesh(squareTorus(H * 0.066, H * 0.0120, 48), mBrass, D, `coilLoop${i}`);
    loop.rotation.y = Math.PI / 2;
    loop.scale.set(1, 0.64, 0.55);          // compact pack at the breech, not a hoop cage
    loop.position.set(x, loopY, -H * 0.004);
    gun.add(loop);
  }
  // brass cross-ties binding the bundle at each end
  for (const [i, y] of [loopY + H * 0.046, loopY - H * 0.046].entries()) {
    const tie = mesh(new THREE.BoxGeometry(H * 0.114, H * 0.011, H * 0.013), mBrass, D, `coilTie${i}`);
    tie.position.set(0, y, -H * 0.040);
    gun.add(tie);
  }

  // muzzle block + shroud
  const muzzle = mesh(roundedBoxGeometry(H * 0.046, H * 0.038, H * 0.070, H * 0.008, 2), mGun, D);
  muzzle.position.set(0, -H * 0.020 - L - H * 0.012, H * 0.008);
  gun.add(muzzle);
  const shroud = mesh(new THREE.CylinderGeometry(H * 0.017, H * 0.021, H * 0.034, 18, 1, true), mChrome, D);
  shroud.position.set(0, -H * 0.020 - L - H * 0.040, H * 0.030);
  gun.add(shroud);

  // black magazine hanging off the breech, nail strip peeking from the lip
  const mag = mesh(roundedBoxGeometry(H * 0.034, H * 0.100, H * 0.064, H * 0.006, 2), mPoly, D);
  mag.position.set(0, -H * 0.076, -H * 0.074);
  mag.rotation.x = 0.42;
  gun.add(mag);
  const strip = mesh(new THREE.BoxGeometry(H * 0.018, H * 0.012, H * 0.056), mChrome, D);
  strip.position.set(0, -H * 0.032, -H * 0.052);
  strip.rotation.x = 0.42;
  gun.add(strip);

  // ---- pilot flame at the muzzle root ----
  // Two additive cones firing forward off the muzzle block, plus a tight core sprite. The
  // reference's flame is a hard blue-white dart, not a haze.
  const pilot = new THREE.Group();
  pilot.name = 'pilotFlameGroup';
  pilot.position.set(0, -H * 0.020 - L - H * 0.030, H * 0.030);
  pilot.rotation.x = -Math.PI / 2;                 // fire along the bore, out the muzzle
  gun.add(pilot);
  const pilotMats = [];
  // Both cones are now ADDITIVE with a real radiance. The envelope used to be a saturated
  // blue on normal blending — a stain — on the theory that additive does nothing on white.
  // It is the intensity, not the blend, that was missing: see gadgetmat.js.
  for (const [i, [len, rad, col, op, gain]] of [
    [H * 0.062, H * 0.0125, 0x3a86ff, 0.42, 1.6],   // cool envelope
    [H * 0.034, H * 0.0058, 0xdcefff, 0.95, 4.0],   // hot core
  ].entries()) {
    const m = glowMat(col, op, { blend: 'add', intensity: gain, name: `pilotCone${i}Mat` });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(rad, len, 16, 1, true), m);
    cone.name = `pilotCone${i}`;
    cone.renderOrder = 18 + i;
    cone.position.y = -len * 0.5;
    cone.rotation.x = Math.PI;                     // point the tip away from the muzzle
    cone.castShadow = false;
    pilot.add(cone);
    pilotMats.push(m);
    D.push(cone.geometry);
  }
  const pilotCore = glowSprite(0x9ecdff, 0.85, { blend: 'add', intensity: 5.0, order: 22, name: 'pilotCore' });
  pilotCore.scale.setScalar(H * 0.042);
  pilot.add(pilotCore);

  // ---- heat spilling into the air ----
  //
  // In the reference the glow is not confined to the metal — it washes half the frame warm
  // orange, and that wash is most of what sells the rail as internally hot rather than
  // painted. Measured off `Dev Art/1785313925351.png` along a row through the gun: the clean
  // cyc left of the robot is 241/240/241 (r-b 0) and the wash beside the gun runs
  // 245/224/207 -> 251/217/189 -> 247/230/220, i.e. r-b +38, +62, +27, out to about 36% of
  // the frame width. Note what that is: RED HOLDS AT OR ABOVE THE CLEAN CYC WHILE BLUE FALLS
  // 30-50. The warmth is blue being REMOVED, not red being added.
  //
  // Which is exactly as well, because adding is not available here. The cyc sits at a linear
  // radiance of 2.2-3.6 and ACES flattens all of it onto LDR 204-207 — see the block comment
  // in gadgetmat.js. The previous version of this halo was normal-blended orange, and it is
  // worth being precise about how thoroughly it did nothing: grown to cover the same area as
  // the reference wash and run at opacity 0.42 it moved the cyc from 207/206/205 to
  // 205/204/202. Two levels DOWN, one level of warmth. As a multiply filter, the same sprite
  // at the same place moved it to 209/188/168 — r-b +41, the bar art's own number.
  //
  // So: WASH is a multiply filter and it is the thing that reads; BLOOM is a small additive
  // core at the rail that keeps red at the backdrop's level and crosses the bloom threshold,
  // which is what supplies the soft halo and what does the whole job in the game's dark
  // rooms, where a multiply has nothing to bite on.
  // Strength and footprint are tuned against the reference's own row profile, not guessed.
  // The first cut ran 0.72 over H*1.55 with a second 0.60 filter inside it and measured
  // +93 and +168 at the two stations nearest the gun against the art's +62 ceiling — a
  // stacked pair of multiplies compounds, and a small hot one is how you get a blob rather
  // than a wash. One broad filter at half the strength lands on the art's curve.
  // ⚠️ "TINT SATURATION IS THE SAFETY KNOB, NOT STRENGTH" WAS WRONG, AND THE FIX IT DESCRIBES
  // NEVER TOOK EFFECT. The claim used to stand here that backing the tint off from a saturated
  // 0xff7a20 to 0xff8a3c raised the filter's blue floor 0.014 -> 0.102 linear and bought the
  // corridor back. Two things are false about that. (a) 0xff8a3c's blue is 0.045 linear, not
  // 0.102 — the number in the comment was never the number in the code. (b) at strength 0.46
  // the tint's own floor is not what reaches the destination anyway: the multiply texel is
  // `1 - (1 - tint)·strength`, so the two tints differ by 9% in green and 20% in blue AFTER the
  // strength is applied, which is nothing. Re-measured on both surfaces, same instrument, same
  // frozen frame (`harness/scenarios/gadget-stage.mjs`, `WASH=ab`):
  //
  //                        studio cyc peak r-b     corridor floor
  //   (2) 0xff7a20 @0.46            +61              L78.3 -> 55.6   (rejected on its own terms)
  //   (4) 0xff8a3c @0.46            +58              L78.3 -> 57.4   (this "fix")
  //
  // Within 1-3 units on the cyc and 1.8 on the corridor. The two settings are the same setting.
  // The knob that actually trades these off is STRENGTH, and it cannot be set once for both —
  // see the measured ladder at `HEAT_WASH` above. So it is GATED on the backdrop instead, and
  // the studio value is unchanged so the round-20 cyc result stands exactly as measured.
  //
  // ⚠️ (1) A NORMAL BLEND — the other candidate — IS NOT AVAILABLE EITHER, and it is worth
  // being exact about why, because it looks like the safe choice. On the corridor it is
  // genuinely better than any multiply (it ADDS 5.6 luminance where the shipped multiply takes
  // 20.8). On the cyc it peaks at r-b +16 against the multiply's +58 and the bar art's +62,
  // because a normal blend is bounded by a colour of 1.0 and the cyc sits at radiance 2.2-3.6
  // where the tone curve has a slope of about one LDR level per unit. Choosing it fixes the
  // corridor by throwing the whole of round 20 away. Check BOTH surfaces after any change here.
  const wash = glowSprite(WASH.hex, WASH.strength, { blend: 'multiply', order: -4, name: 'heatWash' });
  wash.scale.setScalar(H * 2.05);
  // Offset outboard and back so the filter falls on open cyc rather than across the face —
  // the reference's wash sits beside the gun, and the robot's head stays neutral in it.
  wash.position.set(-H * 0.12, midY + L * 0.14, -H * 0.20);
  gun.add(wash);
  // The additive pair. Kept SMALL on the cyc: an additive layer wide enough to matter THERE
  // would have to be bright enough to clip, and "no area clips to pure white" is a composition
  // rule. `WASH.bloom` grows it in the world, where the multiply has been stood down and an add
  // is the layer with authority — and where nothing is near the clip point to begin with.
  const bloom = glowSprite(0xff7a24, 0.85, { blend: 'add', intensity: 2.6, order: 20, name: 'heatBloom' });
  bloom.scale.setScalar(H * 0.34 * WASH.bloom);
  bloom.position.set(0, midY, H * 0.050);
  gun.add(bloom);
  const bloomTip = glowSprite(0xffb060, 0.90, { blend: 'add', intensity: 3.4, order: 21, name: 'heatBloomTip' });
  bloomTip.scale.setScalar(H * 0.20 * WASH.bloom);
  bloomTip.position.set(0, midY - L * 0.40, H * 0.055);
  gun.add(bloomTip);

  const light = new THREE.PointLight(0xff7a2a, 0, H * 1.4, 2);
  light.position.set(0, midY, H * 0.10);
  gun.add(light);
  const pilotLight = new THREE.PointLight(0x7fb8ff, 0.5 * H, H * 0.5, 2);
  pilotLight.position.set(0, -H * 0.020 - L - H * 0.070, H * 0.045);
  gun.add(pilotLight);

  named({ breech, slab, rail, muzzle, shroud, mag, strip });

  let t0 = -99;
  return {
    root, socket: 'forearmL', lights: [light, pilotLight],
    update(dt, t) {
      // The rail always glows; firing spikes it. Flicker is two out-of-phase sines rather
      // than noise so it reads as a resonant coil, not a candle.
      const since = t - t0;
      const spike = Math.max(0, 1 - since * 4.0);
      const idle = 0.55 + Math.sin(t * 9.1) * 0.05 + Math.sin(t * 23.7) * 0.03;
      light.intensity = (idle * 0.9 + spike * 3.4) * H;
      pilotLight.intensity = (0.35 + idle * 0.25 + spike * 0.9) * H;
      const s = 0.86 + idle * 0.20 + spike * 0.5;
      pilot.scale.set(s, 0.85 + s * 0.35, s);
      pilotMats[0].opacity = 0.20 + idle * 0.12 + spike * 0.14;
      pilotMats[1].opacity = 0.70 + idle * 0.25 + spike * 0.25;
      pilotCore.material.opacity = 0.55 + idle * 0.25 + spike * 0.3;
      // Only the ADD layers flicker. A multiply filter is a property of the air between the
      // camera and the cyc, and pulsing its opacity would make the whole backdrop breathe —
      // and, since its strength is baked into its texture, opacity is not even the knob.
      bloom.material.opacity = 0.62 + idle * 0.20 + spike * 0.30;
      // ⚠️ `WASH.bloom` HAS TO BE HERE TOO. This line rewrites the scale every frame, so
      // setting it once at build time is silently undone on frame 1 — the exact shape of bug
      // that made `gadget.oil` photograph nothing for the project's whole history.
      bloom.scale.setScalar(H * (0.30 + idle * 0.06 + spike * 0.10) * WASH.bloom);
      bloomTip.material.opacity = 0.70 + idle * 0.14 + spike * 0.30;
    },
    fire(t = 0) { t0 = t; },
    dispose() {
      D.forEach((g) => g.dispose());
      pilotMats.forEach((m) => m.dispose());
      for (const s of [pilotCore, wash, bloom, bloomTip]) s.material.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// 2. OIL LOBBER — Dev Art 1785315723570
//    A dark cylindrical reservoir carried down the forearm line, TWO big gold hoops
//    standing proud of it on brass struts, a chrome valve-and-pipe cluster and a
//    pressure gauge at the muzzle end, and a brass nozzle throwing a thin arc of burning
//    oil that lands as a fire splash on the floor.
// ---------------------------------------------------------------------------
function oilLobber(H, opts) {
  const D = [];
  const root = new THREE.Group();
  root.name = 'oilLobber';
  const mBrass = brass({ tint: [0.95, 0.72, 0.24], polish: 0.95, grime: 0.20 });
  const mDull = brass({ tint: [0.42, 0.33, 0.15], polish: 0.30, grime: 0.85 });
  const mChrome = chrome({ tint: [0.88, 0.90, 0.93], wear: 0.5 });

  root.add(mountSleeve(H, mChrome, mBrass, D));

  const rig = new THREE.Group();
  rig.position.y = -H * 0.052;
  rig.rotation.x = -0.26;
  root.add(rig);

  const tankLen = H * 0.185;
  const tankY = -H * 0.024 - tankLen * 0.5;
  const tankR = H * 0.050;

  // RESERVOIR — dark, so the gold hoops read against it. In the art the tank is a deep
  // olive-black drum and the brightwork is all fittings; a gold tank under gold hoops
  // collapses into one blob.
  const tank = mesh(new THREE.CylinderGeometry(tankR, tankR * 0.94, tankLen, 30), mDull, D);
  tank.position.set(0, tankY, 0);
  rig.add(tank);
  for (const [i, [y, s]] of [[tankY + tankLen * 0.5, 1], [tankY - tankLen * 0.5, -1]].entries()) {
    const cap = mesh(new THREE.SphereGeometry(tankR, 26, 13, 0, Math.PI * 2, 0, Math.PI / 2), mBrass, D, `tankCap${i}`);
    cap.scale.y = 0.52 * s;
    cap.position.set(0, y, 0);
    rig.add(cap);
    const band = mesh(new THREE.TorusGeometry(tankR * 1.02, H * 0.0055, 8, 26), mBrass, D, `tankBand${i}`);
    band.rotation.x = Math.PI / 2;
    band.position.set(0, y, 0);
    rig.add(band);
  }
  // a sight-glass strip down the tank, so the drum has a 20 cm read
  const sight = mesh(new THREE.BoxGeometry(H * 0.010, tankLen * 0.62, H * 0.006), mChrome, D);
  sight.position.set(0, tankY, tankR * 0.98);
  rig.add(sight);

  // TWO BIG GOLD HOOPS standing proud of the drum on brass struts. Not flat bands on the
  // surface — in the art you can see daylight between hoop and tank, and that gap is what
  // makes them read as hoops at all.
  const hoopR = tankR * 1.52;
  for (const [h, y] of [tankY + tankLen * 0.26, tankY - tankLen * 0.24].entries()) {
    const hoop = mesh(new THREE.TorusGeometry(hoopR, H * 0.0125, 12, 40), mBrass, D, `goldHoop${h}`);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.set(0, y, 0);
    rig.add(hoop);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const strut = mesh(new THREE.BoxGeometry(H * 0.008, H * 0.008, hoopR - tankR * 0.86), mBrass, D, `hoopStrut${h}_${i}`);
      strut.position.set(Math.cos(a) * (tankR + hoopR) * 0.5, y, Math.sin(a) * (tankR + hoopR) * 0.5);
      strut.lookAt(0, y, 0);
      rig.add(strut);
    }
  }

  // CHROME VALVE + PIPE CLUSTER at the muzzle end — a bundle of small chrome cylinders
  // and a manifold plate, the busiest thing on the gadget in the reference.
  const cluster = new THREE.Group();
  cluster.position.set(0, tankY - tankLen * 0.5 - H * 0.030, 0);
  rig.add(cluster);
  const manifold = mesh(new THREE.CylinderGeometry(tankR * 0.86, tankR * 0.66, H * 0.030, 22), mChrome, D);
  cluster.add(manifold);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const r = tankR * 0.56;
    const len = H * (0.034 + (i % 3) * 0.012);
    const pipe = mesh(new THREE.CylinderGeometry(H * 0.0072, H * 0.0072, len, 12), mChrome, D, `valvePipe${i}`);
    pipe.position.set(Math.cos(a) * r, -H * 0.018 - len * 0.5, Math.sin(a) * r);
    pipe.rotation.set(Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22);
    cluster.add(pipe);
    const nut = mesh(new THREE.CylinderGeometry(H * 0.0105, H * 0.0105, H * 0.009, 6), mBrass, D, `valveNut${i}`);
    nut.position.set(Math.cos(a) * r, -H * 0.016, Math.sin(a) * r);
    cluster.add(nut);
  }
  // two chrome hand valves on top of the manifold
  for (const [i, x] of [-tankR * 0.5, tankR * 0.5].entries()) {
    const stem = mesh(new THREE.CylinderGeometry(H * 0.005, H * 0.005, H * 0.024, 10), mChrome, D, `handValveStem${i}`);
    stem.position.set(x, H * 0.024, tankR * 0.30);
    stem.rotation.x = -0.5;
    cluster.add(stem);
    const wheel = mesh(new THREE.TorusGeometry(H * 0.013, H * 0.0035, 8, 18), mBrass, D, `handValveWheel${i}`);
    wheel.position.set(x, H * 0.036, tankR * 0.36);
    wheel.rotation.x = -0.5 + Math.PI / 2;
    cluster.add(wheel);
  }

  // PRESSURE GAUGE at the wrist end, faced outward so the camera reads the dial.
  const gauge = new THREE.Group();
  gauge.position.set(-H * 0.032, tankY + tankLen * 0.40, tankR * 0.80);
  gauge.rotation.set(-0.5, -0.5, 0);
  rig.add(gauge);
  const canG = mesh(new THREE.CylinderGeometry(H * 0.021, H * 0.021, H * 0.014, 24), mBrass, D);
  canG.rotation.x = Math.PI / 2;
  gauge.add(canG);
  const bezel = mesh(new THREE.TorusGeometry(H * 0.021, H * 0.0035, 8, 24), mChrome, D);
  bezel.position.z = H * 0.007;
  gauge.add(bezel);
  const dialMat = new THREE.MeshStandardMaterial({ color: 0xf4efe2, roughness: 0.32, metalness: 0 });
  const dial = mesh(new THREE.CircleGeometry(H * 0.018, 24), dialMat, D);
  dial.position.z = H * 0.0078;
  gauge.add(dial);
  const needleMat = new THREE.MeshStandardMaterial({ color: 0x8e1c14, roughness: 0.5, metalness: 0 });
  const needle = mesh(new THREE.BoxGeometry(H * 0.0028, H * 0.015, H * 0.0012), needleMat, D);
  needle.position.set(0, H * 0.0055, H * 0.0086);
  needle.rotation.z = -0.9;
  gauge.add(needle);
  // tick marks so the dial is not a blank white disc
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI * 0.75 + (i / 7) * Math.PI * 1.5;
    const tick = mesh(new THREE.BoxGeometry(H * 0.0016, H * 0.0035, H * 0.001), needleMat, D, `gaugeTick${i}`);
    tick.position.set(Math.sin(a) * H * 0.0145, Math.cos(a) * H * 0.0145, H * 0.0086);
    tick.rotation.z = -a;
    gauge.add(tick);
  }

  // ANGLED BRASS NOZZLE — kicks forward off the cluster, as in the art.
  const nozzle = new THREE.Group();
  nozzle.position.set(0, tankY - tankLen * 0.5 - H * 0.070, H * 0.014);
  nozzle.rotation.x = 0.62;
  rig.add(nozzle);
  const throat = mesh(new THREE.CylinderGeometry(H * 0.016, H * 0.023, H * 0.062, 18), mBrass, D);
  nozzle.add(throat);
  const tipRing = mesh(new THREE.TorusGeometry(H * 0.017, H * 0.005, 8, 20), mDull, D);
  tipRing.rotation.x = Math.PI / 2;
  tipRing.position.y = -H * 0.032;
  nozzle.add(tipRing);
  const pilot = mesh(new THREE.CylinderGeometry(H * 0.004, H * 0.004, H * 0.030, 8), mChrome, D);
  pilot.position.set(H * 0.022, -H * 0.018, 0);
  pilot.rotation.z = 0.3;
  nozzle.add(pilot);

  // ---- THE BURNING ARC ----
  // Authored in a world-aligned group so gravity stays vertical whatever the arm is doing:
  // +Z is the throw direction, -Y is down. The lob leaves the nozzle, arcs over, and
  // lands as a fire splash on the floor with a light under it. This is the named feature
  // in the manifest — an oil lobber that does not lob is half a gadget.
  named({ tank, sight, manifold, canG, bezel, dial, needle, throat, tipRing, pilot });
  rig.name = 'oilRig'; cluster.name = 'valveCluster'; gauge.name = 'pressureGauge';
  nozzle.name = 'oilNozzle';

  const jet = new THREE.Group();
  jet.name = 'oilJet';
  jet.position.copy(nozzle.position);
  jet.position.y -= H * 0.030;
  rig.add(jet);

  // Thrown ACROSS the front of the robot rather than straight out of the wrist. Lobbed
  // toward the camera the parabola foreshortens into a vertical pour; thrown across the
  // frame you actually see it arc, which is the point of a lobber.
  const THROW_YAW = 1.15;
  const REACH = 0.86;                 // metres forward at a 1.7 m robot
  let drop = 0.70;                    // metres down to the floor; measured on first update

  /*
   * THE THROW IS A SPRAY, NOT A ROPE.
   *
   * The bar art (1785315723570) does not lob a stream of liquid at all: a short blue-white
   * pilot flame stands at the nozzle mouth and everything past it is a fan of fine burning
   * droplets, widening as it falls and landing as a small fire. What was here instead was a
   * `TubeGeometry` of constant 14.5 mm radius at opacity 0.92 — a 29 mm SOLID ROD of flat
   * colour with hard edges, measured at (196,119,94), a desaturated salmon. It read as a
   * rubber garden hose, and no amount of tint would have fixed that, because the defect is
   * that a continuous opaque cylinder is the wrong OBJECT.
   *
   * The tube survives, thinned to 7 mm at a third of the opacity, purely as the thread the
   * droplets are strung along; the atomisation is what does the reading now.
   */
  // ⚠️ CORRECTION, and it matters because the claim that used to stand here was general and
  // wrong. It read: "everything in the spray is normal-blended... an ADDITIVE element over a
  // near-white cyc changes nothing — the first cut of this spray was written additive and
  // rendered completely invisible: correct geometry, correct positions, zero pixels."
  //
  // The observation was real; the diagnosis was not. Additive is not powerless over a bright
  // backdrop, it is powerless at unit BRIGHTNESS — the cyc sits at a linear radiance of
  // 2.2-3.6 and an additive layer capped at 1.0 is a small fraction of it, which the tone
  // curve then flattens. Give the same additive layer an intensity of 2-6 and it reads
  // immediately (measured ladder in gadgetmat.js). The ARC keeps normal blending anyway, for
  // a different and still-good reason: a thin fluid thread against a bright field genuinely
  // is darker than the field, the way a real stream of burning oil photographs. The SPLASH
  // and the pilot, which are fire, do not — those are additive below.
  const arcMat = glowMat(0xff5c05, 0.55);          // the thread, not the stream
  const arcCore = glowMat(0xffc23a, 0.85);         // hot centre
  const arc = new THREE.Mesh(new THREE.BufferGeometry(), arcMat);
  const arcInner = new THREE.Mesh(new THREE.BufferGeometry(), arcCore);
  arc.castShadow = arcInner.castShadow = false;
  jet.add(arc, arcInner);

  // Blue-white pilot at the nozzle mouth. In the reference this is the brightest, coolest
  // thing on the whole gadget and it is what says "ignited" rather than "leaking".
  const pilotMat = glowMat(0x8fd0ff, 0.88, { blend: 'add', intensity: 3.2, name: 'oilPilotMat' });
  // NB: `pilot` upstream is the chrome pilot-light TUBE on the nozzle body — different
  // object, same word. This is the flame.
  const pilotFlame = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.082, 14, 1, true), pilotMat);
  pilotFlame.name = 'oilPilotFlame';
  pilotFlame.renderOrder = 25;
  pilotFlame.rotation.x = Math.PI / 2;             // tip along +Z, the throw direction
  pilotFlame.position.set(0, -0.006, 0.076);
  pilotFlame.castShadow = false;
  jet.add(pilotFlame);
  D.push(pilotFlame.geometry);

  // Atomised droplets. Deterministic scatter — capture is a fixed-timestep seeded render
  // and `Math.random()` in anything that draws makes two runs of the same frame differ.
  const dropGeo = new THREE.SphereGeometry(1, 6, 5);
  D.push(dropGeo);
  const dropMat = glowMat(0xf25c05, 0.90);
  const spray = [];
  for (let i = 0; i < 34; i++) {
    const d = new THREE.Mesh(dropGeo, dropMat);
    d.name = `oilDrop${i}`;
    d.castShadow = false;
    jet.add(d);
    spray.push(d);
  }
  arc.name = 'oilArc'; arcInner.name = 'oilArcCore';

  // fire splash where it lands
  const splash = new THREE.Group();
  splash.name = 'fireSplash';
  jet.add(splash);

  /**
   * Re-cut the ballistic arc so it actually reaches the floor.
   *
   * The nozzle's height above the ground depends on the arm pose and on the gadget scale
   * the view chose, so a hard-coded drop either buries the splash under the floor or
   * leaves the jet hanging in mid-air. This runs once, when the world matrices are first
   * valid, and again only if the arm has moved more than 5 cm.
   */
  function cutArc(dropM) {
    drop = dropM;
    const pts = [];
    for (let i = 0; i <= 28; i++) {
      const u = i / 28;
      pts.push(new THREE.Vector3(0, -drop * u * u, REACH * u));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    arc.geometry.dispose();
    arcInner.geometry.dispose();
    arc.geometry = new THREE.TubeGeometry(curve, 44, 0.0072, 10, false);
    arcInner.geometry = new THREE.TubeGeometry(curve, 44, 0.0030, 8, false);
    splash.position.set(0, -drop, REACH);

    // Re-string the droplets along the new parabola: spread grows with flight, size falls.
    // Evenly spaced droplets of even size on a smooth curve do not read as a spray — they
    // read as a beaded chain, which is what the first cut rendered. Three things break the
    // regularity: the along-arc position is jittered as well as the lateral offset, the
    // spacing is biased toward the nozzle by a power curve, and the cone widens fast.
    for (let i = 0; i < spray.length; i++) {
      const n = spray.length - 1;
      const h1 = Math.sin((i + 1) * 12.9898) * 43758.5453;
      const h2 = Math.sin((i + 1) * 78.2330) * 12345.6789;
      const h3 = Math.sin((i + 1) * 39.4260) * 24634.6345;
      const j1 = h1 - Math.floor(h1) - 0.5;
      const j2 = h2 - Math.floor(h2) - 0.5;
      const j3 = h3 - Math.floor(h3) - 0.5;
      const u = Math.min(1, 0.14 + Math.pow(i / n, 0.82) * 0.86 + j3 * 0.035);
      const spread = 0.235 * u * u;
      spray[i].position.set(j1 * spread, -drop * u * u + j2 * spread * 0.55, REACH * u);
      spray[i].scale.setScalar(0.0102 * (1.0 - u * 0.40) * (0.7 + (j3 + 0.5) * 0.7));
    }
  }
  cutArc(drop);

  // The splash tongues are ADDITIVE now, at a radiance that clears the cyc rather than
  // staining it. A burning pool that photographs darker than the floor it is burning on is
  // the same inversion the skate jets had; see gadgetmat.js for the measurement.
  const splashMats = [];
  for (let i = 0; i < 6; i++) {
    const a = i * 2.399963;
    const m = glowMat(i % 2 ? 0xff9a10 : 0xf46410, 0.85,
      { blend: 'add', intensity: i % 2 ? 2.6 : 1.9, name: `splashFlame${i}Mat` });
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.062 - i * 0.005, 0.24 + (i % 3) * 0.09, 12, 1, true), m);
    flame.name = `splashFlame${i}`;
    flame.renderOrder = 20 + i;
    flame.position.set(Math.cos(a) * 0.060, 0.11 + (i % 3) * 0.035, Math.sin(a) * 0.060);
    flame.castShadow = false;
    splash.add(flame);
    splashMats.push(m);
    D.push(flame.geometry);
  }
  const hotCore = new THREE.Mesh(new THREE.ConeGeometry(0.030, 0.16, 12, 1, true),
    glowMat(0xffe8a0, 0.9, { blend: 'add', intensity: 5.0, name: 'splashCoreMat' }));
  hotCore.name = 'splashCore';
  hotCore.renderOrder = 30;
  hotCore.position.y = 0.07;
  hotCore.castShadow = false;
  splash.add(hotCore);
  D.push(hotCore.geometry);
  // The pool is the fire's effect ON THE ROOM, and that is two layers: a warm MULTIPLY that
  // takes blue out of the floor and the air around the fire (the only move with authority
  // over a bright surface), and a small additive centre that is the light itself and the
  // thing that carries the effect in the game's dark rooms, where a filter has nothing to
  // bite on. As one normal-blended orange sprite it was neither.
  // Tint kept off full saturation for the reason recorded on the nail gun's `heatWash`: a
  // multiply tuned on the bright cyc is roughly twice as violent on a mid-tone floor,
  // because that is where the tone curve still has slope.
  const poolWash = glowSprite(0xff8c3a, 0.58, { blend: 'multiply', order: -4, name: 'firePoolWash' });
  poolWash.scale.setScalar(0.86);
  poolWash.position.y = 0.10;
  splash.add(poolWash);
  const pool = glowSprite(0xff7a20, 0.85, { blend: 'add', intensity: 2.4, order: 19, name: 'firePool' });
  pool.scale.setScalar(0.34);
  pool.position.y = 0.05;
  splash.add(pool);
  // Smoke stays a stain. It genuinely subtracts — this is the one element on the gadget that
  // normal blending is right for, and it is the control that shows the rest are not.
  const smoke = glowSprite(0x3a2418, 0.26, { order: 40, name: 'fireSmoke' });
  smoke.scale.setScalar(0.62);
  smoke.position.y = 0.34;
  splash.add(smoke);

  const light = new THREE.PointLight(0xff8a30, 0, H * 1.4, 2);
  light.position.set(0, -H * 0.030, H * 0.030);
  jet.add(light);
  const fireLight = new THREE.PointLight(0xff7418, 0, 1.5, 2);
  fireLight.position.set(0, 0.16, 0);
  splash.add(fireLight);

  let t0 = -99;
  return {
    root, socket: 'forearmL', lights: [light, fireLight],
    update(dt, t) {
      // Cancel the arm's rotation every frame so the lob obeys gravity, not the elbow,
      // then yaw it out in front of the robot.
      const s = worldAlign(jet);
      if (s !== 1) jet.scale.setScalar(1 / s);
      jet.rotateY(THROW_YAW);
      // fit the parabola to the real height of the nozzle above the floor
      jet.getWorldPosition(_v);
      if (Math.abs(_v.y - drop) > 0.05) cutArc(Math.max(0.15, _v.y));

      // Once lit, the lobber KEEPS lobbing. The reference is a firing shot and the arc is
      // the named feature; a burn that decays to nothing means a screenshot taken at an
      // arbitrary point in the loop catches a gadget doing nothing at all.
      const since = t - t0;
      const burn = since < 0 ? 0 : Math.min(1, since * 6);
      const flick = 0.80 + Math.sin(t * 17.3) * 0.12 + Math.sin(t * 41.1) * 0.08;

      arcMat.opacity = burn * 0.34 * flick;
      arcCore.opacity = burn * 0.85;
      dropMat.opacity = burn * 0.90 * flick;
      pilotMat.opacity = burn * 0.88 * (0.9 + flick * 0.14);
      arc.visible = arcInner.visible = pilotFlame.visible = burn > 0.02;
      for (const d of spray) d.visible = burn > 0.02;
      splash.visible = burn > 0.02;
      for (let i = 0; i < splashMats.length; i++) {
        splashMats[i].opacity = burn * (0.55 + (i % 2) * 0.3) * flick;
        splash.children[i].scale.set(flick, 0.8 + flick * 0.45, flick);
      }
      hotCore.material.opacity = burn * 0.9 * flick;
      pool.material.opacity = burn * 0.80 * flick;
      // The wash is a filter: its strength lives in its texture, so the only honest way to
      // fade it in is to hide it. Writing `opacity` here would look like it was working.
      poolWash.visible = burn > 0.35;
      smoke.material.opacity = burn * 0.26;
      light.intensity = burn * (1.8 + Math.sin(t * 21) * 0.4) * H;
      fireLight.intensity = burn * (2.4 * flick);
    },
    fire(t = 0) { t0 = t; },
    dispose() {
      D.forEach((g) => g.dispose());
      arc.geometry.dispose(); arcInner.geometry.dispose();
      [arcMat, arcCore, dropMat, pilotMat, ...splashMats, hotCore.material, pool.material,
        poolWash.material, smoke.material, dialMat, needleMat].forEach((m) => m.dispose());
    },
  };
}

// ---------------------------------------------------------------------------
// 3. GRAPPLING HOOK — Dev Art 1785320715285
//    Bright chrome open-frame housing with a wound steel cable spool visible through the
//    window, and a BOLD four-prong barbed anchor claw swinging below it. The claw is the
//    blind-ID feature: it has to read as a ship's anchor, not an insect leg.
//
// ⚠️ REBUILT FROM THE ART AT 5x, AND THE OLD COMMENT ON THIS FUNCTION HAD THE SPOOL AXIS
// BACKWARDS. It said: "the first build had the spool axis running across the arm, so from the
// front all the camera ever saw was a dark disc that read as a speaker grille. Turning the
// spool to face the viewer is the whole difference between cable reel and box with a hole."
// The reference shows the OPPOSITE. Its drum axis DOES run across the arm and what you see
// through the cut-away is the coil pack's FLANK — helical turns marching across a barrel,
// with the drum's end flange catching the light. A reel turned to face the viewer is a set of
// concentric rings, and concentric rings behind a small framed window is exactly what
// `critic-gadget-4` reported for two rounds running: "a closed circular window showing a
// concentric-ring pattern". The previous round's stated fix was the defect.
//
// Three structural gaps to the art, all of them silhouette rather than shading:
//   1. the opening is a large C-SHAPED CUT-AWAY through the front and the outboard flank of a
//      thin chrome shell — you see into a real cavity with a lit side wall and a dark back —
//      not a rectangle of rim bars laid on a solid block;
//   2. under the housing sits a stepped FAIRLEAD COLLAR, then a taut thin cable, and the
//      anchor hangs BELOW that on the cable rather than being tucked against the housing;
//   3. the anchor's flukes are FLAT ARROWHEAD BLADES on slender arms off a compact hinge boss,
//      and a LONG CENTRAL SPIKE continues straight down past them. The spike is most of what
//      makes the silhouette read as a grapnel and it did not exist here at all.
// ---------------------------------------------------------------------------

/**
 * A flat arrowhead fluke, in the XY plane, pointing +X. Extruded thin: the reference's flukes
 * are stamped plate with a swept barb, and a cone — what was here before — is a spike, which
 * is why the claw read as an insect leg rather than a ship's anchor.
 */
function flukeBladeGeometry(len, halfW, thick) {
  const s = new THREE.Shape();
  s.moveTo(0, -halfW * 0.34);
  s.lineTo(len * 0.52, -halfW);          // barb, swept back
  s.lineTo(len * 0.40, -halfW * 0.30);
  s.lineTo(len, 0);                      // the point
  s.lineTo(len * 0.40, halfW * 0.30);
  s.lineTo(len * 0.52, halfW);
  s.lineTo(0, halfW * 0.34);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.5, bevelSize: thick * 0.5, bevelSegments: 1 });
  g.translate(0, 0, -thick * 0.5);
  return g;
}

function grapplingHook(H, opts) {
  const D = [];
  const root = new THREE.Group();
  root.name = 'grapple';
  const mChrome = chrome({ tint: [0.95, 0.96, 0.98], wear: 0.22 });
  // The wound cable has to be visibly DARKER than its housing or the turns disappear into the
  // chrome — but not by as much as it was. ⚠️ THE CAVITY IS SELF-SHADOWED, so the old
  // 0.34/0.55-dark steel photographed as a BLACK LOZENGE inside the shell: a hole, which is the
  // read this piece has been marked down for. Measured off the art's own coil pack, the cable
  // sits at roughly 0.72 of the shell's luminance, not 0.25. Mid steel, and the shadow supplies
  // the rest of the separation on its own.
  const mSteel = gunmetal({ tint: [0.56, 0.57, 0.61], wear: 0.85, dark: 0.12 });
  const mClaw = chrome({ tint: [0.82, 0.84, 0.88], wear: 0.6 });

  root.add(mountSleeve(H, mChrome, mChrome, D, 0.050));

  const rig = new THREE.Group();
  rig.position.y = -H * 0.046;
  rig.rotation.x = -0.05;
  root.add(rig);

  // ---- THE SHELL, BUILT AS PLATES SO THE CAVITY IS REAL ----
  //
  // Slimmer than the block it replaces (0.062 wide against 0.076 on a 0.150 body — the art's
  // housing is about 2.4 times as tall as it is wide) and the front and the outboard flank are
  // both open over the lower two thirds. Plates rather than a box with a window laid on it,
  // because the thing that says "you are looking INTO something" is a lit interior side wall
  // and a dark back, and a decal window cannot produce either.
  const frameH = H * 0.150, frameW = H * 0.062, frameD = H * 0.066;
  const wall = H * 0.0075;
  const cy = -frameH * 0.5 - H * 0.006;
  const openTop = cy + frameH * 0.5 - H * 0.034;    // shell closes above this
  const openBot = cy - frameH * 0.5 + H * 0.016;    // ...and below this

  // back wall — the dark thing the coil reads against
  const back = mesh(roundedBoxGeometry(frameW, frameH, wall, H * 0.004, 2), mChrome, D);
  back.position.set(0, cy, -frameD * 0.5 + wall * 0.5);
  rig.add(back);
  // INBOARD flank, full height: the shell keeps its solid side toward the body, as in the art
  const flank = mesh(roundedBoxGeometry(wall, frameH, frameD, H * 0.004, 2), mChrome, D);
  flank.position.set(-frameW * 0.5 + wall * 0.5, cy, 0);
  rig.add(flank);
  // OUTBOARD flank, top third only — this is the cut that makes the opening a C rather than a
  // rectangle, and it is what reads from a three-quarter view where a front window vanishes.
  const flankCut = mesh(roundedBoxGeometry(wall, frameH * 0.34, frameD, H * 0.004, 2), mChrome, D);
  flankCut.position.set(frameW * 0.5 - wall * 0.5, cy + frameH * 0.33, 0);
  rig.add(flankCut);
  // top cap and the chamfered shoulder above the opening
  const cap = mesh(roundedBoxGeometry(frameW, H * 0.030, frameD, H * 0.010, 3), mChrome, D);
  cap.position.set(0, cy + frameH * 0.5 - H * 0.015, 0);
  rig.add(cap);
  // The brow has to reach the cap or the two leave a slot of pure background across the front
  // of the housing, which photographs as a crack in the shell.
  const browH = (cy + frameH * 0.5 - H * 0.030) - openTop;
  const brow = mesh(roundedBoxGeometry(frameW, browH, wall, H * 0.004, 2), mChrome, D);
  brow.position.set(0, openTop + browH * 0.5, frameD * 0.5 - wall * 0.5);
  rig.add(brow);
  // the surviving front strut down the inboard edge — the art's shell is cut away around it
  const strut = mesh(roundedBoxGeometry(H * 0.010, openTop - openBot, wall, H * 0.003, 2), mChrome, D);
  strut.position.set(-frameW * 0.5 + H * 0.005, (openTop + openBot) * 0.5, frameD * 0.5 - wall * 0.5);
  rig.add(strut);
  // base shoe, chamfered, carrying the fairlead
  const shoe = mesh(roundedBoxGeometry(frameW, H * 0.020, frameD, H * 0.008, 3), mChrome, D);
  shoe.position.set(0, cy - frameH * 0.5 + H * 0.010, 0);
  rig.add(shoe);
  // a shallow recessed panel on the closed inboard face — the art has one, and a 0.15 m slab
  // of unbroken chrome is the thing that made this read as a canister
  const panel = mesh(roundedBoxGeometry(H * 0.006, H * 0.052, H * 0.014, H * 0.002, 2), mSteel, D);
  panel.position.set(-frameW * 0.5 - H * 0.001, cy + frameH * 0.22, frameD * 0.20);
  rig.add(panel);

  // ---- THE DRUM, AXIS ACROSS THE ARM, SEEN ON ITS FLANK ----
  //
  // `helix()` gives real diagonal strands marching along the drum. That is the read: a torus
  // stack gives parallel grooves, which is a threaded bar, and a face-on reel gives concentric
  // rings, which is the speaker grille this piece has been marked down for twice.
  const spool = new THREE.Group();
  spool.position.set(0, cy - H * 0.004, -H * 0.002);
  rig.add(spool);
  const drumR = H * 0.0225, drumW = frameW - wall * 2 - H * 0.008;
  const drum = mesh(new THREE.CylinderGeometry(drumR * 0.86, drumR * 0.86, drumW, 20), mSteel, D);
  drum.rotation.z = Math.PI / 2;
  spool.add(drum);
  for (const [i, [r, phase]] of [[drumR, 0], [drumR * 1.10, Math.PI]].entries()) {
    // two layers, out of phase, so the winding reads as CABLE stacked on itself rather than a
    // machined thread. `helix()` runs along -Y, so lay it along +X and centre it.
    const g = helix(r, 7, drumW, H * 0.0030, 108);
    const coil = mesh(g, mSteel, D, `drumCoil${i}`);
    coil.rotation.z = Math.PI / 2;
    coil.rotation.x = phase;
    coil.position.x = -drumW * 0.5;
    spool.add(coil);
  }
  // end flanges: the bright discs either side of the coil pack, and the only chrome inside
  for (const [i, s] of [-1, 1].entries()) {
    const fl = mesh(new THREE.CylinderGeometry(drumR * 1.32, drumR * 1.32, H * 0.005, 22), mChrome, D, `drumFlange${i}`);
    fl.rotation.z = Math.PI / 2;
    fl.position.x = s * (drumW * 0.5 + H * 0.0025);
    spool.add(fl);
  }

  // ---- FAIRLEAD, CABLE, ANCHOR ----
  // A stepped collar under the shoe, then a TAUT thin cable, then the anchor hanging below it.
  // The previous build tucked the claw against the housing on a 0.020 stub because a claw on a
  // visible stalk "reads as a thing being carried". The art disagrees: its anchor hangs a clear
  // housing-height below the fairlead on a cable you can see, and it still reads as a limb
  // because the CABLE is continuous with the machine, not because the parts are touching.
  const fairlead = mesh(new THREE.CylinderGeometry(H * 0.016, H * 0.022, H * 0.020, 18), mChrome, D);
  fairlead.position.set(0, cy - frameH * 0.5 - H * 0.008, H * 0.004);
  rig.add(fairlead);
  const fairRing = mesh(new THREE.TorusGeometry(H * 0.015, H * 0.0035, 8, 20), mChrome, D);
  fairRing.rotation.x = Math.PI / 2;
  fairRing.position.set(0, cy - frameH * 0.5 - H * 0.018, H * 0.004);
  rig.add(fairRing);

  // The cable is CHROME, not the dark drum steel. On the drum a dark wire is what separates the
  // turns from the shell; hanging in open air on a white cyc the same material photographs as a
  // black rod ruled across the frame, which is what the first capture of this rebuild showed.
  // The art's cable is a bright steel line. Reusing `mClaw` also costs no extra bake.
  //
  // ⚠️ THE DROP WAS TOO LONG AND THE THING BRIDGING IT WAS THE WRONG OBJECT. Measured off the
  // first capture this rebuild ever got (`progress/shots/gadget.grapple.png`, silhouette scan
  // via `harness/_g6_span.mjs`): the anchor hung 0.55 housing-heights below the shoe on a
  // 7-pixel hairline, against a 74-pixel housing. The art (1785320715285, same scan) hangs it
  // 0.41 housing-heights down on a 19-pixel-wide member against a 75-pixel housing — i.e. the
  // gap is a quarter of the housing wide, not a tenth, and it is a POLISHED SHANK, with the
  // thin twisted cable running down BESIDE it rather than doing the carrying. The shank is part
  // of the anchor and travels with it (see `shank` below); the cable is what pays out.
  const cableLen = H * 0.034;
  const cableX = H * 0.011;                 // outboard of the shank, so both read as separate
  const cable = mesh(new THREE.CylinderGeometry(H * 0.0038, H * 0.0038, cableLen, 8), mClaw, D);
  cable.position.set(cableX, cy - frameH * 0.5 - H * 0.020 - cableLen * 0.5, H * 0.004);
  rig.add(cable);

  const claw = new THREE.Group();
  claw.position.set(0, cy - frameH * 0.5 - H * 0.024 - cableLen, H * 0.004);
  rig.add(claw);
  // THE SHANK, which is the member the art actually hangs the anchor on: a polished rod running
  // most of the way back up to the fairlead, a quarter of the housing's width thick. It belongs
  // to the CLAW, not to the housing, so it flies with the anchor and the thin cable is left
  // spanning the gap during a launch — which is the behaviour the art's arrangement implies.
  const shankTop = H * 0.034;
  const shank = mesh(new THREE.CylinderGeometry(H * 0.0100, H * 0.0105, H * 0.040, 14), mClaw, D);
  shank.position.y = H * 0.014;
  claw.add(shank);
  // the stepped collar where the shank meets the fairlead — three quick discs, as in the art
  for (const [i, [r, hh, y]] of [
    [H * 0.0150, H * 0.0055, H * 0.0300],
    [H * 0.0125, H * 0.0050, H * 0.0245],
  ].entries()) {
    const step = mesh(new THREE.CylinderGeometry(r, r, hh, 16), mClaw, D, `shankStep${i}`);
    step.position.y = y;
    claw.add(step);
  }
  const crown = mesh(new THREE.CylinderGeometry(H * 0.0150, H * 0.0128, H * 0.015, 16), mClaw, D);
  crown.position.y = -H * 0.008;
  claw.add(crown);

  // THE CENTRAL SPIKE. Long, tapered, straight down, ending well below the flukes. It carries
  // most of the grapnel silhouette and there was nothing here doing that job.
  const spike = mesh(new THREE.CylinderGeometry(H * 0.0076, H * 0.0007, H * 0.078, 12), mClaw, D);
  spike.position.y = -H * 0.053;
  claw.add(spike);
  const spikeCollar = mesh(new THREE.CylinderGeometry(H * 0.0094, H * 0.0094, H * 0.006, 12), mClaw, D);
  spikeCollar.position.y = -H * 0.030;
  claw.add(spikeCollar);

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const prong = new THREE.Group();
    prong.name = `clawProng${i}`;
    prong.position.set(0, -H * 0.012, 0);
    prong.rotation.y = -a;
    claw.add(prong);

    // slender arm out and DOWN from the boss
    const armLen = H * 0.042;
    const arm = mesh(new THREE.CylinderGeometry(H * 0.0058, H * 0.0078, armLen, 10), mClaw, D, `clawArm${i}`);
    arm.position.set(armLen * 0.40, -armLen * 0.30, 0);
    arm.rotation.z = 0.96;
    prong.add(arm);

    // and the flat fluke turning back UP and outward off the end of it. Shorter and BROADER
    // than the first cut: at 0.046 long and 0.011 half-width the four of them photographed as
    // leaves on a twig. The art's flukes are stamped plate roughly a third as long as they are
    // wide at the barb, and the barb is the part that says "anchor".
    //
    // ⚠️ AND THEN IT WAS STILL TOO SMALL, which reading the numbers in this file could not have
    // told anyone — the four prongs sit on the diagonals (`a = i·90° + 45°`), so every one of
    // them is foreshortened in the view the piece is judged in and the authored reach is not the
    // reach that photographs. Measured on the render rather than derived: claw span 61 px
    // against a 74 px housing = 0.82 housing-widths, where the art measures 1.2-1.3. Arm and
    // blade scaled ~1.35x together, then RE-MEASURED — see the report.
    const blade = mesh(flukeBladeGeometry(H * 0.050, H * 0.0185, H * 0.0046), mClaw, D, `clawFluke${i}`);
    blade.position.set(armLen * 0.74, -armLen * 0.58, 0);
    blade.rotation.z = 0.62;                  // sweeping up and out, the anchor read
    prong.add(blade);
  }

  named({ back, flank, flankCut, cap, brow, strut, shoe, panel, drum, fairlead, fairRing, cable, shank, crown, spike, spikeCollar });
  rig.name = 'grappleHousing'; spool.name = 'cableSpool'; claw.name = 'anchorClaw';

  // ---- firing: the spool pays out, the claw dives ----
  const clawRest = claw.position.clone();
  const light = new THREE.PointLight(0xbcd4ff, 0, H * 0.6, 2);
  light.position.set(0, cy, H * 0.05);
  rig.add(light);

  let t0 = -99;
  return {
    root, socket: 'forearmL', lights: [light],
    update(dt, t) {
      const since = t - t0;
      // one launch-and-retract cycle: the claw shoots forward and out, the cable follows,
      // the spool spins, then it winds back
      // ⚠️ THE LAUNCH IS DELIBERATELY NOT UNDER THE CAMERA, AND THIS IS THE OPPOSITE CALL TO
      // THE ONE `gadget.oil` NEEDED — same question, different answer, so it is worth stating.
      // `views/gadget.js` fires at t=0 and `shoot.mjs` captures after `settle(12)`, t ≈ 0.20 s.
      // Oil's art IS the arc and the burning splash, so firing at t=0 is what finally got its
      // named feature into a frame. The grapple's art is a REST pose: the anchor hangs a clear
      // housing-height below the fairlead on a visible cable, and that hanging silhouette is
      // what the piece is judged on. Peaking at `since = 0.5` put the claw a third of the way
      // through a 0.17 H lunge in every capture — off the bottom-left of frame on a long rod.
      // The window opens at 0.35 s instead, so a capture at 0.20 s lands on the art's pose and
      // the launch still exists, still fires, and is still visible to anything that watches
      // longer than a fifth of a second.
      const u = since < 0.35 ? 0 : Math.max(0, 1 - Math.abs(since - 0.85) / 0.5);
      const e = u * u * (3 - 2 * u);
      claw.position.set(clawRest.x, clawRest.y - H * 0.030 * e, clawRest.z + H * 0.110 * e);
      claw.rotation.x = 0.55 * e;
      // The cable is the thing that has to stay welded to BOTH ends through the launch: it
      // pays out from the fairlead and its far end must land on the claw's hinge, or the shot
      // photographs a rod floating in the gap — which is what the last capture of this piece
      // shows. Solve the segment from its two endpoints instead of scaling it and hoping.
      // The far end is the TOP OF THE SHANK, not the claw's origin: the shank is now a real
      // 0.040 H member and terminating the cable at the origin would bury a third of it inside
      // the rod and leave the join looking welded rather than reeved. The claw also ROTATES on
      // the way out, so the shank's top swings — take it through the claw's own rotation rather
      // than assuming it stays straight up.
      //
      // ⚠️ THE SIGN HERE WAS WRONG AND IT WAS INVISIBLE AT REST. A cylinder centred on the
      // midpoint of a segment needs `sin(rot.x) = dz/len`, i.e. `atan2(dz, dy)`; this read
      // `atan2(-dz, dy)`, which is the MIRROR LINE about the Y axis. At rest `dz` is 0, so the
      // two agree exactly and every capture ever taken of this piece — all of them at t ≈ 0.20 s,
      // before the launch window opens — was blind to it. The first frame anyone pinned at the
      // launch peak (`--at 0.85`) shows a stub of cable pointing the wrong way across a gap with
      // the anchor floating free of it, foreshortened to a third of its length because the wrong
      // sign aims it along the camera axis. Any future edit here must be checked at `--at 0.85`.
      const topY = cy - frameH * 0.5 - H * 0.020, topZ = H * 0.004;
      const cr = claw.rotation.x;
      const botY = claw.position.y + shankTop * Math.cos(cr);
      const botZ = claw.position.z + shankTop * Math.sin(cr);
      const dy = topY - botY, dz = topZ - botZ;
      const len = Math.hypot(dy, dz) || 1e-4;
      cable.scale.y = len / cableLen;
      cable.position.set(cableX, (topY + botY) * 0.5, (topZ + botZ) * 0.5);
      cable.rotation.x = Math.atan2(dz, dy);
      // The drum's axis is X now, so it spins about X. It spun about Z for as long as the
      // spool faced the viewer, and about Z a horizontal drum rolls sideways like a wheel.
      spool.rotation.x = since < 0.35 ? 0 : (since - 0.35) * 11;
      light.intensity = e * 0.9 * H;
    },
    fire(t = 0) { t0 = t; },
    dispose() { D.forEach((g) => g.dispose()); },
  };
}

// ---------------------------------------------------------------------------
// 4. BOUNCY BALL GUN — Dev Art 1785320614586
//    Chrome body carried along the forearm line, a REVOLVER CLUSTER of six tubes each
//    loaded with a visible coloured ball at its mouth, a TRANSPARENT DOME HOPPER full of
//    loose balls sitting on top, a compression spring in a cutaway along the side.
// ---------------------------------------------------------------------------
function bouncyBallGun(H, opts) {
  const D = [];
  const root = new THREE.Group();
  const mChrome = chrome({ tint: [0.92, 0.94, 0.96], wear: 0.30 });
  const mDark = gunmetal({ tint: [0.30, 0.31, 0.34], wear: 0.5, dark: 0.4 });
  const mGlass = clearGlass();
  const mSpring = gunmetal({ tint: [0.66, 0.68, 0.72], wear: 0.5 });
  const ballMats = BALL_COLOURS.map((c) => ballMaterial(c));

  root.add(mountSleeve(H, mChrome, mChrome, D));

  const rig = new THREE.Group();
  rig.position.y = -H * 0.052;
  rig.rotation.x = -0.22;
  root.add(rig);

  const bodyLen = H * 0.150;
  const bodyY = -H * 0.026 - bodyLen * 0.5;
  const bodyR = H * 0.046;

  const body = mesh(new THREE.CylinderGeometry(bodyR, bodyR * 1.04, bodyLen, 28), mChrome, D);
  body.position.set(0, bodyY, 0);
  rig.add(body);
  for (const [i, y] of [bodyY + bodyLen * 0.5, bodyY - bodyLen * 0.5].entries()) {
    const band = mesh(new THREE.TorusGeometry(bodyR * 1.04, H * 0.0055, 8, 26), mChrome, D, `bodyBand${i}`);
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    rig.add(band);
  }

  // COMPRESSION SPRING in a cutaway window along the side — the reference shows it
  // through a slot, so it needs a dark recess behind it or the coil vanishes into chrome.
  const recess = mesh(roundedBoxGeometry(H * 0.030, bodyLen * 0.66, H * 0.022, H * 0.004, 2), mDark, D);
  recess.position.set(bodyR * 0.80, bodyY, bodyR * 0.52);
  recess.rotation.y = -0.6;
  rig.add(recess);
  const spring = mesh(helix(H * 0.011, 8, bodyLen * 0.60, H * 0.0034, 100), mSpring, D);
  spring.position.set(bodyR * 0.86, bodyY + bodyLen * 0.30, bodyR * 0.58);
  rig.add(spring);

  // REVOLVER CLUSTER — six tubes fanned around the muzzle end, each with a ball seated in
  // its mouth. Tubes long enough that you read down the bore; that is the difference
  // between a gun and a bunch of berries.
  const cluster = new THREE.Group();
  cluster.position.set(0, bodyY - bodyLen * 0.5 - H * 0.030, 0);
  rig.add(cluster);
  const backPlate = mesh(new THREE.CylinderGeometry(H * 0.048, H * 0.044, H * 0.014, 26), mChrome, D);
  backPlate.position.y = H * 0.026;
  cluster.add(backPlate);
  const loaded = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const r = H * 0.030;
    const tubeLen = H * 0.072;
    const tube = mesh(new THREE.CylinderGeometry(H * 0.0148, H * 0.0148, tubeLen, 18, 1, true), mChrome, D, `chamberTube${i}`);
    tube.position.set(Math.cos(a) * r, -tubeLen * 0.5 + H * 0.014, Math.sin(a) * r);
    tube.rotation.set(Math.sin(a) * 0.20, 0, -Math.cos(a) * 0.20);
    cluster.add(tube);
    // dark bore liner so you can see it is a hole
    const bore = mesh(new THREE.CylinderGeometry(H * 0.0126, H * 0.0126, tubeLen * 0.98, 16, 1, true), mDark, D, `chamberBore${i}`);
    bore.position.copy(tube.position);
    bore.rotation.copy(tube.rotation);
    cluster.add(bore);
    const lip = mesh(new THREE.TorusGeometry(H * 0.0148, H * 0.0026, 8, 20), mChrome, D, `chamberLip${i}`);
    lip.position.set(Math.cos(a) * r * 1.14, -tubeLen + H * 0.014, Math.sin(a) * r * 1.14);
    lip.rotation.x = Math.PI / 2;
    lip.rotation.z = 0;
    cluster.add(lip);
    // the loaded ball, sitting proud in the mouth
    const ball = mesh(new THREE.SphereGeometry(H * 0.0138, 18, 14), ballMats[i], D, `loadedBall${i}`);
    ball.position.set(Math.cos(a) * r * 1.15, -tubeLen + H * 0.012, Math.sin(a) * r * 1.15);
    cluster.add(ball);
    loaded.push(ball);
  }

  // TRANSPARENT DOME HOPPER on top, full of loose balls. The signature silhouette.
  const hopper = new THREE.Group();
  hopper.position.set(0, bodyY + bodyLen * 0.16, bodyR * 0.68);
  hopper.rotation.x = Math.PI / 2 - 0.28;       // stands off the top of the body
  rig.add(hopper);
  const collar = mesh(new THREE.CylinderGeometry(H * 0.040, H * 0.043, H * 0.014, 26), mChrome, D);
  hopper.add(collar);
  const collarLip = mesh(new THREE.TorusGeometry(H * 0.040, H * 0.0040, 8, 26), mChrome, D);
  collarLip.rotation.x = Math.PI / 2;
  collarLip.position.y = H * 0.007;
  hopper.add(collarLip);
  // the QR-ish decal patch on the collar
  const decalMat = new THREE.MeshStandardMaterial({ color: 0x2a2e31, roughness: 0.6, metalness: 0 });
  const decal = mesh(new THREE.PlaneGeometry(H * 0.018, H * 0.018), decalMat, D);
  decal.position.set(0, 0, H * 0.0435);
  hopper.add(decal);
  for (let i = 0; i < 9; i++) {
    const q = mesh(new THREE.PlaneGeometry(H * 0.0038, H * 0.0038),
      new THREE.MeshStandardMaterial({ color: 0xe6e8ea, roughness: 0.55, metalness: 0 }), D, `decalCell${i}`);
    q.position.set((i % 3 - 1) * H * 0.0055, (Math.floor(i / 3) - 1) * H * 0.0055, H * 0.0442);
    if (i !== 4) hopper.add(q);
  }
  // loose balls first, so the dome's alpha shell draws over them
  const looseBalls = [];
  for (let i = 0; i < 15; i++) {
    const a = i * 2.399963, rr = H * 0.026 * Math.sqrt((i + 0.6) / 15);
    const b = mesh(new THREE.SphereGeometry(H * 0.0112, 16, 12), ballMats[i % 6], D, `looseBall${i}`);
    b.position.set(Math.cos(a) * rr, H * 0.016 + (i % 4) * H * 0.0105, Math.sin(a) * rr);
    hopper.add(b);
    looseBalls.push(b);
  }
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(H * 0.041, 30, 20, 0, Math.PI * 2, 0, Math.PI * 0.55), mGlass);
  dome.position.y = H * 0.008;
  dome.scale.y = 1.25;
  dome.castShadow = false;
  D.push(dome.geometry);
  hopper.add(dome);
  // a chrome cap button on the crown, as in the art
  const cap = mesh(new THREE.SphereGeometry(H * 0.011, 16, 12), mChrome, D);
  cap.position.y = H * 0.008 + H * 0.041 * 1.25 * 0.97;
  hopper.add(cap);

  named({ body, recess, spring, backPlate, collar, collarLip, decal, cap });
  root.name = 'ballGun'; rig.name = 'ballGunBody'; cluster.name = 'revolverCluster';
  hopper.name = 'ballHopper'; dome.name = 'hopperDome';

  let spin = 0, t0 = -99;
  return {
    root, socket: 'forearmL', lights: [],
    update(dt, t) {
      // the cylinder indexes round one chamber per shot, easing to a stop
      const since = t - t0;
      if (since >= 0 && since < 0.35) spin += dt * (1 - since / 0.35) * 18;
      cluster.rotation.y = spin;
      // balls jostle in the hopper as it fires
      const j = since >= 0 && since < 0.5 ? (1 - since / 0.5) : 0;
      for (let i = 0; i < looseBalls.length; i++) {
        looseBalls[i].position.y += Math.sin(t * 22 + i * 1.7) * j * H * 0.0007;
      }
    },
    fire(t = 0) { t0 = t; },
    dispose() {
      D.forEach((g) => g.dispose());
      mGlass.dispose(); decalMat.dispose();
      ballMats.forEach((m) => m.dispose());
    },
  };
}

// ---------------------------------------------------------------------------
// 5a. THE DRIFT TRAIL — the ground half of Dev Art 1785314396477
// ---------------------------------------------------------------------------
/**
 * ============================================================================
 * WHAT THE REFERENCE PUTS ON THE FLOOR, MEASURED OFF IT RATHER THAN DESCRIBED
 * ============================================================================
 *
 * `critic-gadget-4`'s surviving hate on this piece was that the render's floor is bare: "the
 * reference has clear curved skid marks plus a trailing dust cloud that do real work selling
 * motion and speed". It is not a tweak — there was no ground object anywhere in this file —
 * so it is built here as its own thing rather than faked with a shadow.
 *
 * Sampled from `Dev Art/1785314396477.png` with `harness/_g7_px.mjs`, which reports
 * PERCENTILES over a box rather than a mean: a skid mark is a few dark pixels among a lot of
 * bright floor, and a mean over any box containing one just reports the floor.
 *
 *   region (art px)              Lmean   p01    p05    med    what it is
 *   clean floor, far right       212.3   186    197    213    the backdrop these sit on
 *   arc bundle behind the skate  224.3   209    212.5  225    THIN LINES, only 10-20 L down
 *   arcs + grit near the wheels  186.1    37     52.9  214.9  lines PLUS hard dark chips
 *   dust, densest at the wheels  173.3    42.9   87.1  184.9  a solid ~45 L hole in the floor
 *   dust, mid trail              211.0   181    191    211    ~20 L down
 *   dust, far end of the trail   224.2   195.5  205    227    gone
 *   grit field above the smoke   223.9    82.5  211.9  227    sparse, very dark, hard-edged
 *
 * Three separable things, and they are NOT one soft smudge:
 *
 *  1. ARCS. Long, thin, SHARP nested curves sweeping across the whole floor — the polish
 *     scored by many passes, not one skid. Individually only 10-25 L below the floor. A blurry
 *     dark smear is the wrong answer; at this subtlety it would read as a dirty render.
 *  2. GRIT. Small HARD chips down to L37-90, thrown up and back, sparse and sharp-edged.
 *  3. DUST. A soft ground-hugging cloud, ~45 L at the wheels, tapering to nothing over about
 *     two body-widths.
 *
 * ⚠️ ALL THREE ARE SUBTRACTIVE, WHICH IS WHY THIS WORKS AT ALL. The block comment in
 * `gadgetmat.js` records that nothing bounded by a colour of 1.0 can BRIGHTEN this cyc,
 * because it sits on the ACES shoulder at ~1 LDR level per unit of radiance. Darkening runs
 * the other way: a normal blend toward black at alpha a is exactly a multiply by (1-a), which
 * DIVIDES the channel and walks it back down off the shoulder into the part of the curve that
 * still has slope. The same round measured a multiply sprite taking 206 -> 188 at x0.8 and
 * 205 -> 168 at x0.55, so alpha 0.2 buys about -18 L and 0.45 about -37 L. Those are the
 * numbers the strengths below are set from, and they are re-measured on the render.
 *
 * ⚠️ AND THE DECAL CANNOT BE A FLAT PLANE. `_studio.js`'s cyc carries a FLAT floor run only
 * over z in [0, 3.8]; behind z = 0 it curves up into the backdrop as y = z^2 / (2R) with
 * R = 3.2, i.e. 4 mm at z = -0.16 and 28 mm at z = -0.43. The trail has to run ~2.5 m BEHIND
 * the skates to reach the frame edge, so a flat quad sitting 4 mm off the floor would be
 * swallowed by the cyc within 160 mm and the marks would simply stop for no visible reason.
 * Every vertex therefore takes its own height from that profile. `curveRadius: 0` gives a flat
 * sheet, which is what a real room floor wants — see `game`'s use of this file.
 */
let _driftTex = null;
function driftTexture() {
  if (_driftTex) return _driftTex;
  const W = 1024, Hp = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = Hp;
  const g = c.getContext('2d');
  // Fully transparent everywhere it is not drawn, so the sheet's rectangular edge can never
  // show — the same guarantee `multiplyTexture()` gets from ramping to white.
  g.clearRect(0, 0, W, Hp);

  // Deterministic: this is a texture, and a texture that changes between two captures makes
  // every before/after comparison in this file meaningless.
  let seed = 0x51CA7E;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const UC = 0.70;                       // the contact patch, in u
  g.lineCap = 'round';

  // ---- 1. the arcs. Nested carve lines, all bowing the same way, gathered into bundles the
  // way the reference does rather than spread evenly — an even comb reads as hatching.
  // ⚠️ vBase MUST STAY INSIDE THE BAND THE EDGE FADE LEAVES ALIVE (see step 4). The first pass
  // spread the bundles over v 0.10-0.85 and then wiped the outer thirds, so most of the arcs
  // were multiplied to nothing and the A/B against `dbg=nodrift` came back at -5 L where the
  // art wants -20. The fade is not optional, so the content moves instead.
  for (let bundle = 0; bundle < 5; bundle++) {
    const vBase = 0.30 + bundle * 0.105 + (rnd() - 0.5) * 0.04;
    const curve = 0.30 + rnd() * 0.16;                 // shared per bundle => concentric
    const lines = 3 + Math.floor(rnd() * 3);
    for (let k = 0; k < lines; k++) {
      const v0 = vBase + (k - lines / 2) * (0.006 + rnd() * 0.012);
      // Behind the skate the marks are fresher and darker; ahead of it there is nothing yet.
      const uStart = 0.02 + rnd() * 0.06;
      const uEnd = UC + 0.02 + rnd() * 0.24;
      g.beginPath();
      for (let i = 0; i <= 40; i++) {
        const u = uStart + (uEnd - uStart) * (i / 40);
        const d = u - UC;
        const v = v0 + curve * d * d - curve * 0.02;
        const x = u * W, y = v * Hp;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      // Alpha 0.08-0.26 lands each line roughly 8-24 LDR levels under the floor, which is the
      // art's 10-20 measured at `marksBundle`. They are meant to be barely there individually
      // and to read as a set.
      g.strokeStyle = `rgba(24,26,30,${(0.08 + rnd() * 0.18).toFixed(3)})`;
      g.lineWidth = 0.7 + rnd() * 1.9;
      g.stroke();
    }
  }

  // ---- 2. the two live skid tracks, directly under the wheels and darker than the rest
  for (const lane of [-0.055, 0.055]) {
    for (let k = 0; k < 4; k++) {
      const v0 = 0.5 + lane + (k - 1.5) * 0.009;
      g.beginPath();
      for (let i = 0; i <= 40; i++) {
        const u = 0.06 + (UC + 0.04 - 0.06) * (i / 40);
        const d = u - UC;
        const v = v0 + 0.34 * d * d;
        if (i === 0) g.moveTo(u * W, v * Hp); else g.lineTo(u * W, v * Hp);
      }
      // fades out with distance behind, so the track has a beginning
      const grad = g.createLinearGradient(0.06 * W, 0, (UC + 0.04) * W, 0);
      grad.addColorStop(0, 'rgba(20,21,25,0.03)');
      grad.addColorStop(0.55, 'rgba(20,21,25,0.26)');
      grad.addColorStop(1, 'rgba(20,21,25,0.52)');
      g.strokeStyle = grad;
      g.lineWidth = 1.4 + rnd() * 2.2;
      g.stroke();
    }
  }

  // ---- 3. grit. Hard short dashes torn off the floor, densest just behind the contact and
  // thinning backward. Drawn as segments rather than dots: the reference's are motion-smeared.
  //
  // Kept SMALL and tight. The first pass ran 300 dashes up to 7 px long over a 7 m sheet, and
  // at 146 texture px per metre that is a 48 mm chip — which photographed as a field of
  // confetti scattered across a third of the frame rather than as grit thrown off a wheel.
  for (let i = 0; i < 170; i++) {
    const back = Math.pow(rnd(), 0.55);                // bias hard toward the contact patch
    const u = UC + 0.02 - back * 0.30;
    const spread = 0.018 + back * 0.075;
    const v = 0.5 + (rnd() - 0.5) * 2 * spread;
    const len = (1.0 + rnd() * 3.0) * (1 - back * 0.45);
    const ang = (rnd() - 0.5) * 0.7;                   // biased along travel
    const a = (0.30 + rnd() * 0.62) * (1 - back * 0.55);
    g.strokeStyle = `rgba(14,15,18,${a.toFixed(3)})`;
    g.lineWidth = 0.6 + rnd() * 1.0;
    g.beginPath();
    g.moveTo(u * W, v * Hp);
    g.lineTo(u * W + Math.cos(ang) * len, v * Hp + Math.sin(ang) * len);
    g.stroke();
  }

  // ---- 4. edge fade, on all four sides.
  //
  // ⚠️ THIS IS NOT COSMETIC — IT IS WHAT KEEPS THE SHEET OFF THE BACK WALL. The trail is laid
  // along the figure's own yaw, and at -1.40 rad the travel axis is only 9.8 deg off world X
  // while the sheet's LATERAL axis is correspondingly within 9.8 deg of world Z — the camera's
  // depth axis. So the sheet's half-width is spent almost entirely in DEPTH, and depth is
  // exactly where `_studio.js`'s cyc stops being a floor and starts being a wall. Fading v to
  // nothing at both edges means the far edge is transparent by the time it has climbed the
  // fillet, so the marks stay on the floor whatever the sheet's bounding box does.
  g.globalCompositeOperation = 'destination-out';
  const wipe = (x0, y0, x1, y1, from) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, `rgba(0,0,0,${from})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, Hp);
  };
  wipe(0, 0, 0, Hp * 0.24, 1);                 // v = 0 edge (the far side, up the cyc)
  wipe(0, Hp, 0, Hp * 0.78, 1);                // v = 1 edge (nearest the camera)
  wipe(0, 0, W * 0.16, 0, 1);                  // u = 0, the far end of the trail
  wipe(W, 0, W * 0.90, 0, 1);                  // u = 1, ahead of the skates
  g.globalCompositeOperation = 'source-over';

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 16;
  // ⚠️ ANISOTROPY IS NOT DECORATION HERE. The sheet is seen at a grazing angle, so ~4 m of
  // floor along the line of sight is compressed into ~200 capture pixels; with isotropic
  // filtering the mip chain picked to survive that compression also destroys the arcs ALONG
  // the trail, and the whole thing resolves to a uniform grey haze — which is the "dirty
  // render" failure mode this texture is specifically shaped to avoid.
  _driftTex = t;
  return t;
}

/**
 * The ground trail: skid arcs, grit and a dust cloud, laid along a direction of travel.
 *
 * Built in WORLD coordinates and added at the scene root — it is not part of the limb and
 * must not be, because `LimbRig.fitSkates()` does `unit.root.add(g.root)` and anything under
 * that root travels with the robot. A skid mark that follows you around is not a skid mark.
 *
 *   origin       world point the wheels are touching
 *   yaw          direction of travel, as the figure's own yaw
 *   curveRadius  the backdrop's floor-to-wall fillet radius; 0 for a flat floor
 *
 * ⚠️ COST, STATED RATHER THAN HIDDEN: one mesh plus 76 sprites, and every sprite is its own
 * draw call. `gadget.skates` measured **233 -> 315 calls / 128k tris** (`_calls_tmp.mjs`,
 * quality=medium) with this in. That is fine for a single-subject studio showcase and is NOT
 * fine for the mansion, where the budget is 625 calls for a whole room and the player wears
 * these while moving. Anything wiring this into `game` needs the puffs and chips instanced or
 * collapsed onto the sheet's own texture first — do not simply call this from `fitSkates()`.
 */
export function skateDriftTrail(opts = {}) {
  const H = opts.height ?? 1.7;
  const ox = opts.origin?.x ?? 0, oz = opts.origin?.z ?? 0;
  const yaw = opts.yaw ?? 0;
  const R = opts.curveRadius ?? 0;
  const strength = opts.strength ?? 1;
  const D = [];
  const root = new THREE.Group();
  root.name = 'skateDriftTrail';

  // travel and lateral, on the floor plane
  const dx = Math.sin(yaw), dz = Math.cos(yaw);
  const nx = Math.cos(yaw), nz = -Math.sin(yaw);

  // The cyc's profile, as derived above. Exact for the circular fillet, and it degrades to a
  // flat floor at R = 0 rather than dividing by zero.
  const floorY = (z) => {
    if (R <= 0 || z >= 0) return 0;
    const s = Math.min(1, -z / R);
    return R * (1 - Math.sqrt(1 - s * s));
  };

  // ⚠️ LW IS SMALL ON PURPOSE AND IS NOT A STYLE CHOICE — see the edge-fade note in
  // `driftTexture()`. The lateral axis lies within 10 deg of the camera's depth axis at this
  // yaw, so every centimetre of half-width is a centimetre further up the cyc fillet: the
  // first pass at LW 4.2 put the sheet's far edge 0.69 m up the BACK WALL, and the arcs
  // photographed as scratches hanging in the air above the robot's feet.
  const LU = 4.2, LW = 1.5, UC = 0.74;
  const NU = 56, NW = 18;
  /*
   * ⚠️ THE LIFT HAS TO GROW WHERE THE CYC IS FACETED, AND 4 mm WAS NOT ENOUGH.
   *
   * `floorY` is the ANALYTIC circle, but `cycGeometry()` samples that quarter arc with 14 flat
   * segments. The profile is convex, so every chord sits ABOVE the true curve between its two
   * endpoints, by a sagitta of R(1 - cos(theta/2)) = 3.2 * (1 - cos 0.0561) = 5.0 mm. A
   * constant 4 mm lift is therefore BELOW the backdrop mesh over most of the curved region —
   * the trail would simply vanish partway back, and would look like a texture bug rather than
   * a depth one. The flat run has no faceting error at all and wants the small number, so the
   * lift ramps: 3 mm on the floor, 11 mm by the time the fillet is 0.5 m back, where it is
   * both grazing and far away and a centimetre is invisible.
   */
  const lift = (z) => 0.003 + (z < 0 ? 0.008 * Math.min(1, -z / 0.5) : 0);
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= NU; i++) {
    const s = i / NU;
    const along = (s - UC) * LU;
    for (let j = 0; j <= NW; j++) {
      const tt = j / NW;
      const lat = (tt - 0.5) * LW;
      const x = ox + along * dx + lat * nx;
      const z = oz + along * dz + lat * nz;
      pos.push(x, floorY(z) + lift(z), z);
      uv.push(s, tt);
    }
  }
  for (let i = 0; i < NU; i++) {
    for (let j = 0; j < NW; j++) {
      const a = i * (NW + 1) + j, b = a + 1, c2 = a + (NW + 1), d2 = c2 + 1;
      idx.push(a, c2, b, b, c2, d2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  D.push(geo);

  const mat = new THREE.MeshBasicMaterial({
    map: driftTexture(),
    transparent: true,
    opacity: strength,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  // Keep it out of `post/pipeline.js`'s depth prepass. The prepass draws with an override
  // material, which ignores `depthWrite: false`, so the sheet would write depth 4 mm in front
  // of the floor across a third of the frame and HBAO would read the marks as geometry.
  mat.allowOverride = false;
  const sheet = new THREE.Mesh(geo, mat);
  sheet.name = 'driftMarks';
  sheet.renderOrder = -1;                 // under the jet plumes, over the floor
  sheet.castShadow = sheet.receiveShadow = false;
  root.add(sheet);

  // ---- the airborne half: a ground-hugging dust cloud plus hard chips above it.
  //
  // Normal blend, dark colour, per the note above: on this backdrop that IS a multiply, and it
  // is the only family with authority here. `glowSprite`'s own docstring calls the normal
  // blend "a stain — correct for smoke, wrong for anything hot", which is exactly this.
  const puffs = [];
  let seed = 0x0D0571;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  // ⚠️ THE CLOUD NEEDS HEIGHT OR IT IS A STAIN, NOT SMOKE. At a shallow camera every sprite
  // sitting ON the floor projects into the same thin horizontal band however wide it is, and
  // the first pass — which topped out 0.16 m up — photographed as a grey smear lying flat on
  // the ground. The reference's dust boils up to roughly wheel-diameter height and reads as
  // volume because of it, so the trail climbs to ~0.36 m and the sprites grow vertically as
  // they go. `drift` also swings the tail sideways: a carve leaves a curved trail, and a
  // dead-straight one reads as a conveyor belt.
  const DRIFT = 0.24;
  for (let i = 0; i < 34; i++) {
    const back = Math.pow(i / 33, 0.85);
    const along = -back * 1.65 - 0.02;
    const lat = (rnd() - 0.5) * (0.06 + back * 0.26) + DRIFT * back * back;
    const x = ox + along * dx + lat * nx;
    const z = oz + along * dz + lat * nz;
    // The cloud lifts as it trails, the way the reference's does, but never leaves the floor.
    const y = floorY(z) + H * (0.012 + back * 0.20) + rnd() * H * 0.05;
    // Densest at the wheels (-45 L in the art) and gone by the end of the trail. The taper is
    // steep because 34 overlapping sprites ACCUMULATE — at a flat 0.1 each, ten deep is an
    // effective 0.65, which is what greyed the whole far half of the floor at -26 L where the
    // art measures a clean backdrop.
    const op = (0.80 - back * 0.76) * (0.7 + rnd() * 0.6);
    const sp = glowSprite(0x2b2f36, Math.max(0.015, op) * strength, {
      blend: 'normal', order: 4, name: `driftPuff${i}`,
    });
    sp.position.set(x, y, z);
    sp.scale.set(H * (0.11 + back * 0.30), H * (0.08 + back * 0.26), 1);
    root.add(sp);
    puffs.push(sp);
  }
  // A ground skirt. The lifted cloud above leaves a bright gap between itself and the floor at
  // the tail, which reads as smoke hanging in the air rather than being dragged off the
  // ground; these are wide, flat and weak, and their only job is to close that gap.
  for (let i = 0; i < 12; i++) {
    const back = Math.pow(i / 11, 0.8);
    const along = -back * 1.75 - 0.02;
    const lat = (rnd() - 0.5) * 0.12 + DRIFT * back * back;
    const x = ox + along * dx + lat * nx;
    const z = oz + along * dz + lat * nz;
    const sp = glowSprite(0x33383f, Math.max(0.02, (0.34 - back * 0.30)) * strength, {
      blend: 'normal', order: 3, name: `driftSkirt${i}`,
    });
    sp.position.set(x, floorY(z) + H * (0.006 + back * 0.02), z);
    sp.scale.set(H * (0.16 + back * 0.34), H * (0.045 + back * 0.07), 1);
    root.add(sp);
    puffs.push(sp);
  }

  // Hard chips thrown up and back — sparse, small and much darker than the smoke (the art's
  // reach L37-90 against a floor at 212-224), so they read as debris rather than more haze.
  for (let i = 0; i < 34; i++) {
    const back = Math.pow(rnd(), 0.6);
    const along = -back * 1.5 - 0.03;
    const lat = (rnd() - 0.5) * (0.10 + back * 0.26) + DRIFT * back * back;
    const x = ox + along * dx + lat * nx;
    const z = oz + along * dz + lat * nz;
    const y = floorY(z) + H * (0.02 + rnd() * rnd() * 0.34);
    const sp = glowSprite(0x15171b, (0.5 + rnd() * 0.45) * strength, {
      blend: 'normal', order: 5, name: `driftChip${i}`,
    });
    sp.position.set(x, y, z);
    const s0 = H * (0.004 + rnd() * 0.009);
    sp.scale.set(s0 * (1.2 + rnd() * 1.6), s0, 1);
    root.add(sp);
    puffs.push(sp);
  }

  return {
    root,
    dispose() {
      D.forEach((g) => g.dispose());
      mat.dispose();
      puffs.forEach((p) => p.material.dispose());
    },
  };
}

// ---------------------------------------------------------------------------
// 5. ROCKET SKATES — Dev Art 1785314396477
//    Replaces BOTH lower legs: TWIN road wheels per foot, one at the heel and one at the
//    toe, clear of the chassis so both read; plus a rearward jet nozzle off each calf
//    firing a shaped blue-white flame.
// ---------------------------------------------------------------------------
function rocketSkates(H, opts) {
  const D = [];
  const root = new THREE.Group();
  root.name = 'rocketSkates';
  const mChrome = chrome({ tint: [0.88, 0.90, 0.93], wear: 0.55 });
  const mShell = gunmetal({ tint: [0.90, 0.91, 0.92], wear: 0.3 });
  const mDark = gunmetal({ tint: [0.26, 0.27, 0.30], wear: 0.7, dark: 0.5 });
  const mTyre = polymer({ tint: [0.052, 0.053, 0.058] });

  const wheels = [];
  const flameGroups = [];
  const flameMats = [];
  const lights = [];

  // one skate; the caller mirrors it for the other leg
  function skate() {
    const g = new THREE.Group();
    g.name = 'skate';

    // calf shell running up from the ankle — this is the part that reads as "the leg
    // itself has been replaced", which is the strongest thing this gadget already had
    const calf = mesh(roundedBoxGeometry(H * 0.052, H * 0.120, H * 0.056, H * 0.018, 3), mShell, D);
    calf.position.set(0, H * 0.062, -H * 0.004);
    g.add(calf);
    const calfBand = mesh(new THREE.TorusGeometry(H * 0.030, H * 0.006, 8, 22), mChrome, D);
    calfBand.rotation.x = Math.PI / 2;
    calfBand.position.set(0, H * 0.112, -H * 0.004);
    g.add(calfBand);

    // BOOT CHASSIS — narrow and lifted, so the wheels below it are fully in the open.
    // The old chassis was deep enough to swallow the top half of both wheels, which is
    // how a twin-wheel skate came to read as one wheel and a blunt toe cap.
    const chassis = mesh(roundedBoxGeometry(H * 0.050, H * 0.032, H * 0.140, H * 0.012, 3), mShell, D);
    chassis.position.set(0, -H * 0.006, H * 0.008);
    g.add(chassis);
    const sole = mesh(roundedBoxGeometry(H * 0.038, H * 0.012, H * 0.150, H * 0.005, 2), mDark, D);
    sole.position.set(0, -H * 0.026, H * 0.008);
    g.add(sole);
    const toeCap = mesh(new THREE.SphereGeometry(H * 0.026, 20, 14), mChrome, D);
    toeCap.scale.set(0.86, 0.62, 1.05);
    toeCap.position.set(0, -H * 0.008, H * 0.080);
    g.add(toeCap);

    // TWIN ROAD WHEELS — toe and heel, hung on visible trucks well below the sole.
    for (const [wi, [z, r]] of [[H * 0.066, H * 0.034], [-H * 0.050, H * 0.034]].entries()) {
      // truck: a chrome fork dropping from the sole to the axle
      const truck = mesh(roundedBoxGeometry(H * 0.044, H * 0.030, H * 0.020, H * 0.005, 2), mChrome, D, `truck${wi}`);
      truck.position.set(0, -H * 0.042, z);
      g.add(truck);

      const axle = new THREE.Group();
      axle.name = `axle${wi}`;
      axle.position.set(0, -H * 0.066, z);
      g.add(axle);
      wheels.push(axle);

      const tyre = mesh(new THREE.TorusGeometry(r, r * 0.36, 14, 26), mTyre, D, `tyre${wi}`);
      tyre.rotation.y = Math.PI / 2;
      axle.add(tyre);
      const tread = mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.02, r * 0.56, 26, 1, true), mTyre, D, `tread${wi}`);
      tread.rotation.z = Math.PI / 2;
      axle.add(tread);
      const hubM = mesh(new THREE.CylinderGeometry(r * 0.52, r * 0.52, r * 0.78, 18), mChrome, D, `wheelHub${wi}`);
      hubM.rotation.z = Math.PI / 2;
      axle.add(hubM);
      const hubRing = mesh(new THREE.TorusGeometry(r * 0.62, r * 0.07, 8, 22), mChrome, D, `wheelHubRing${wi}`);
      hubRing.rotation.y = Math.PI / 2;
      axle.add(hubRing);
      // spokes so the wheel reads as rotating
      for (let i = 0; i < 5; i++) {
        const s = mesh(new THREE.BoxGeometry(H * 0.020, r * 1.22, H * 0.005), mDark, D, `spoke${wi}_${i}`);
        s.rotation.x = (i / 5) * Math.PI;
        axle.add(s);
      }
    }

    // ---- REARWARD JET off the calf ----
    // A real nozzle: throat, bell, and a chrome ring, angled down-and-back so the thrust
    // vector is visibly pushing the skater forward rather than pooling under the feet.
    // Rotating the group by -1.15 pointed the thrust DOWN AND FORWARD, i.e. the skater
    // was braking with two blue lances sticking out over the toes. +1.15 fires it down
    // and BACK, which is the only direction that reads as propulsion.
    const jet = new THREE.Group();
    jet.name = 'jetNozzle';
    jet.position.set(0, H * 0.046, -H * 0.040);
    jet.rotation.x = 1.15;                        // down and back
    g.add(jet);
    const throat = mesh(new THREE.CylinderGeometry(H * 0.020, H * 0.014, H * 0.034, 18), mDark, D);
    throat.position.y = -H * 0.016;
    jet.add(throat);
    const bell = mesh(new THREE.CylinderGeometry(H * 0.014, H * 0.029, H * 0.040, 20, 1, true), mDark, D);
    bell.position.y = -H * 0.052;
    jet.add(bell);
    const bellRing = mesh(new THREE.TorusGeometry(H * 0.029, H * 0.0045, 8, 22), mChrome, D);
    bellRing.rotation.x = Math.PI / 2;
    bellRing.position.y = -H * 0.072;
    jet.add(bellRing);
    // vanes inside the bell so the nozzle is not an empty cone
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const vane = mesh(new THREE.BoxGeometry(H * 0.004, H * 0.030, H * 0.016), mChrome, D, `bellVane${i}`);
      vane.position.set(Math.cos(a) * H * 0.017, -H * 0.052, Math.sin(a) * H * 0.017);
      vane.rotation.y = -a;
      jet.add(vane);
    }

    // FLAME. THE JET IS A LIGHT SOURCE AND IT USED TO BE A STAIN — that inversion is the
    // whole of this gadget's 33.
    //
    // Measured off `Dev Art/1785314396477.png` at the rear jet, against its own backdrop of
    // 231/231/231: the core reads 254/255/255 (L255, i.e. clipping white and +24 over the
    // backdrop) and the cyan shoulder reads 222/250/253 — RED NINE BELOW the backdrop while
    // green and blue are twenty above it. So the reference jet simultaneously ADDS light and
    // REMOVES red, which is two different blend operations and was being attempted with one.
    //
    // Our render before this change, same probe method, at the far skate's jet: L139 against
    // a cyc of L224. The jet was EIGHTY-FIVE LEVELS DARKER than the backdrop it is supposed
    // to be lighting. Two causes, both now fixed:
    //   - the envelope and mid ellipsoids were saturated blue on NORMAL blending, which on a
    //     bright cyc can only subtract; and
    //   - render order. Both skates carry identical geometry but the right one is built with
    //     `scale.x = -1`, which flipped the transparent queue's back-to-front sort between
    //     the two feet: the additive cores deposited +1.70 radiance on the left skate and
    //     +0.06 on the right, where the normal-blended ellipsoids drew last and painted over
    //     them. Everything additive here now carries an explicit renderOrder above the
    //     shapes it is lighting, so the two feet cannot disagree again.
    const flameG = new THREE.Group();
    flameG.name = 'jetFlame';
    flameG.position.y = -H * 0.078;
    jet.add(flameG);
    flameGroups.push(flameG);
    // A CONE HAS A HARD SILHOUETTE FROM EVERY ANGLE, and that is the whole problem here.
    //
    // Shortening the envelope from 11:1 to 3.5:1 fixed its proportions and did nothing for
    // its READ: at H*0.150 long by H*0.042 across on 0.38 opacity it still rasterised as a
    // flat, pale-lavender ARROWHEAD stuck on the back of each heel. Measured against the
    // bar art (`Dev Art/1785314396477.png`, jets cropped at 400,330): the reference jet has
    // no silhouette at all. It is a NARROW white-blue streak — roughly one nozzle diameter
    // across — inside a soft halo that fades out over about four diameters, with a warm
    // heat-stain only on the bell lip itself.
    //
    // So the visible bulk moves off geometry and onto SPRITES, whose radial alpha has no
    // edge to catch, and the cones shrink to a tight hot core buried inside them.
    // THE PLUME IS AN ELLIPSOID, NOT A CONE — and it is geometry, not sprites.
    //
    // Two things were learned the hard way here and are worth not re-learning:
    //
    // 1. SHAPE. An open-ended DoubleSide CONE presents a crisp triangular silhouette at any
    //    size, so it always reads as a flat arrowhead bolted to the heel — which is exactly
    //    what `critic-gadget-2` called "a flat faceted blade/fin, not a nozzle". Shrinking it
    //    did not help; shrinking it to a needle just swapped the arrowhead for a white spike
    //    that read as an antenna wire. A stretched SPHERE has no point and no straight edge,
    //    so it reads as a plume at any size. That is the whole fix.
    //
    // 2. THE CLAIM THAT "SPRITES DO NOT CARRY BRIGHTNESS IN THIS PIPELINE" WAS FALSE, and
    //    the note that used to stand here — two stacked additive sprites at 0.94 landing +1
    //    luminance over the backdrop, "not understood" — has been re-measured and explained.
    //    Sprites carry exactly the radiance the arithmetic predicts: read back out of the
    //    half-float target, the two white cores deposit +1.70 linear at their own centre.
    //    What was actually happening is in gadgetmat.js's block comment — the tone curve is
    //    flat where the cyc sits, and on ONE of the two skates the ellipsoids below were
    //    drawing over the cores. The "scale 0.6 with depthTest off reads R-B +177" test was
    //    reading a smaller sprite whose opaque middle landed on clear cyc instead of on the
    //    skate; it was a clue about COVERAGE, not about sprite magnitude.
    //
    // Long and narrow, and kept light. At 0.030 radius on 0.42 opacity the outer shell read
    // as a solid blue SLAB — worst on the far skate, whose jet points away from the lens and
    // so foreshortens the plume into a disc. Narrowing and lengthening it keeps a streak
    // readable even end-on. Both are now ADDITIVE with a real radiance rather than saturated
    // blue on normal blending: at these sizes they are most of the jet's area, so they were
    // most of the 85-level hole it was punching in the cyc.
    for (const [i, [len, rad, col, op, gain]] of [
      [0.098, 0.022, 0x2f7fd8, 0.34, 1.5],
      [0.070, 0.011, 0xbfe6ff, 0.72, 3.2],
    ].entries()) {
      const m = glowMat(col, op, { blend: 'add', intensity: gain, name: `jetPlume${i}Mat` });
      m.userData.baseOpacity = op;
      const blob = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), m);
      blob.name = `jetPlume${i}`;
      blob.renderOrder = 10 + i;
      blob.scale.set(H * rad, H * len, H * rad);
      blob.position.y = -H * len * 0.85;
      blob.castShadow = false;
      flameG.add(blob);
      flameMats.push(m);
      D.push(blob.geometry);
    }
    // THE STREAK. A chain of radial sprites down the thrust axis, shrinking and cooling from
    // white at the throat to deep blue at the tail. It is only safe as sprites because
    // `glowSprite` opts out of the depth-prepass override (see gadgetmat.js) — before that
    // each one stamped an AO quad on the cyc.
    //
    // TWO FAMILIES, because the reference does two things at once and no single blend can:
    //  - ADD, with `intensity` above 1. This is the lift, and the intensity is what was
    //    missing: calibrated against this very cyc, x1 puts the core at LDR 220, x3 at 243,
    //    x8 at 251, x20 clips at 255. The art's core is 254/255/255, so the throat runs
    //    around x6 and everything downstream tapers off it. Being over the bloom threshold
    //    (1.3 studio / 1.05 estate) these also feed the bloom pass, which is where the soft
    //    outer halo comes from — it is not drawn here.
    //  - MULTIPLY, which is the only operation that can push RED BELOW the backdrop and so
    //    the only way to get the art's cyan shoulder (222/250/253 against 231/231/231). A
    //    normal-blended cyan cannot: it drags all three channels toward its own colour, and
    //    on this cyc that is a hole, which is what the old chain was.
    //
    // renderOrder is explicit and ascending so the cores always land on top of the plume
    // ellipsoids (10-11) whichever way the sort falls — see the note above about the two
    // skates disagreeing.
    //
    // (Method note, because it nearly sent an earlier round the wrong way: a read of a 120x70
    // box around the chain reported "brightest 255", which looked like success and was
    // actually the robot's own chrome calf sitting inside the sample box. Sample boxes near
    // a shiny subject measure the subject. Every number quoted here is a probe at a single
    // projected sprite centre, or a box verified to contain only backdrop.)
    for (const [i, [dist, sc, col, op, blend, gain]] of [
      [0.006, 0.078, 0xffffff, 0.95, 'add', 6.0],
      [0.006, 0.052, 0xffffff, 0.95, 'add', 6.0],
      [0.026, 0.112, 0x35c8ee, 0.62, 'multiply', 1],
      [0.026, 0.070, 0xe8fbff, 0.90, 'add', 4.2],
      [0.052, 0.098, 0x2ab4e6, 0.52, 'multiply', 1],
      [0.052, 0.062, 0xd8f6ff, 0.85, 'add', 2.8],
      [0.082, 0.086, 0x2aa8e0, 0.40, 'multiply', 1],
      [0.082, 0.054, 0xa8e8ff, 0.70, 'add', 1.8],
      [0.116, 0.070, 0x2f9ad4, 0.26, 'multiply', 1],
      [0.116, 0.044, 0x78d4ff, 0.55, 'add', 1.2],
    ].entries()) {
      const sp = glowSprite(col, op, {
        blend, intensity: gain,
        // filters sit UNDER the lights they colour; both sit over the plume ellipsoids
        order: blend === 'multiply' ? 12 + i : 30 + i,
        name: `jet${blend === 'multiply' ? 'Filter' : 'Core'}${i}`,
      });
      sp.scale.setScalar(H * sc);
      sp.position.y = -H * dist;
      sp.material.userData.baseOpacity = op;
      // A multiply filter's strength is baked into its texture, so `opacity` is not its
      // knob — flag it so the flicker loop leaves it alone instead of writing a value that
      // silently does nothing.
      sp.material.userData.filter = sp.userData.filter;
      flameMats.push(sp.material);
      flameG.add(sp);
    }

    named({ calf, calfBand, chassis, sole, toeCap, throat, bell, bellRing });

    // Kept tight and short-range: the previous version's big soft point lights were the
    // "ambient pool under the feet" the flame shape is supposed to replace.
    const l = new THREE.PointLight(0x6fb4ff, 1.0 * H, H * 0.42, 2);
    l.position.set(0, H * 0.020, -H * 0.115);
    g.add(l);
    lights.push(l);

    return g;
  }

  const left = skate(); left.position.set(-H * 0.075, H * 0.058, 0);
  const right = skate(); right.position.set(H * 0.075, H * 0.058, 0);
  right.scale.x = -1;
  root.add(left, right);

  return {
    root, socket: 'shinBoth', lights,
    /**
     * The two skates, exposed so a caller can re-parent them onto the ankle joints.
     *
     * `root` places them at fixed offsets in the UNIT'S ROOT SPACE, which is only correct
     * while the legs are in the rest pose. The moment anything rotates a hip or a knee the
     * feet swing away and the skates stay behind, standing on the floor on their own — and
     * that is not a subtle drift, it is the whole gadget lying detached in the frame. It is
     * what three of `critic-gadget-2`'s complaints were actually looking at: the "loose
     * chrome cylinder oriented upright like a can" is this skate's own calf shell left
     * standing where the leg used to be, the "flat faceted blade" is its jet bell seen
     * edge-on from the floor, and the wheels were reported missing from the feet because
     * they genuinely were not on the feet.
     *
     * Callers that pose the legs must `joints.ankleL.attach(feet.L)` — `attach()`, not
     * `add()`, so the authored rest placement survives the re-parent with no magic numbers.
     * Do it before posing.
     */
    feet: { L: left, R: right },
    /**
     * Axle groups and the tyre radius, so a caller can sit the skates exactly on y = 0.
     *
     * ⚠️ THIS IS THE TYRE'S OUTER RADIUS, NOT THE TORUS'S RING RADIUS, and it used to be the
     * latter. `tyre` is `TorusGeometry(r, r * 0.36)`, whose outermost surface — the part that
     * touches the road — sits at `r + tube = r * 1.36`, but this reported plain `r`. Its only
     * consumer is the "drop the figure until the wheels touch y = 0" solve in
     * `views/gadget.js`, so every skate capture ever taken stood 36% of a tyre radius (H *
     * 0.0122, i.e. 21 mm at H = 1.7, about 11 capture px) BELOW the floor. Measured with
     * `harness/_g7_skate.mjs`, which reads the lowest real tyre VERTEX rather than trusting
     * this number: -0.0177 m before, ~0 after. It was invisible while the floor was a
     * featureless cyc and stops being invisible the moment there is a drift mark drawn on it.
     */
    wheels, wheelRadius: H * 0.034 * 1.36,
    update(dt, t) {
      for (const w of wheels) w.rotation.x -= dt * 26;
      // thrust flicker — fast, so it reads as a jet not a torch
      const f = 0.86 + Math.sin(t * 47) * 0.08 + Math.sin(t * 91) * 0.05;
      for (const g of flameGroups) g.scale.set(f, 0.88 + f * 0.26, f);
      // Each material carries its OWN rest opacity. This used to be a four-entry table
      // indexed by `i % 4`, which silently assumed exactly four flame materials per skate
      // in a fixed order — adding or reordering one would have re-dealt every opacity in
      // the list onto the wrong material with nothing to indicate it had happened.
      for (const m of flameMats) {
        if (m.userData.filter) continue;
        m.opacity = (m.userData.baseOpacity ?? 0.4) * (0.82 + f * 0.20);
      }
      for (const l of lights) l.intensity = 1.0 * H * f;
    },
    fire() {},
    dispose() {
      D.forEach((g) => g.dispose());
      flameMats.forEach((m) => m.dispose());
    },
  };
}
