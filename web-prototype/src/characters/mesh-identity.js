import * as THREE from 'three';
import { buildUnit4H } from './unit4h.js';
import { brandAspect } from '../materials/surfaces/robot.js';

/**
 * THE IDENTITY KIT — what makes a generated body read as the RUN ROBOT RUN robot.
 *
 * `docs/STYLE_CONTRACT.md` §6 splits ownership: a generated mesh supplies the BODY, and the rig
 * supplies the face, the accent caps and the mark. The Meshy auto-rig makes that trivial in a way
 * the hand-rolled rigid mount never was — a prop parented to a BONE is standard, needs no skin
 * weights, and cannot fight the deformation, because it simply rides whatever the bone does.
 *
 * It also closes two of `critic-meshplayer-1`'s three hates, and those are worth stating because
 * they are MISSING FEATURES rather than wrong ones — cheaper to add than to argue about:
 *
 *   "NO NECK" — the art has a ribbed column roughly half a head tall with dark gaps at the jaw
 *   and the collar. The generated jaw sits straight on the trapezius. Measured with a width
 *   profile, the art and the procedural build both show a TROUGH at ~0.10 of figure height and
 *   the generated mesh shows none at all; its outline rises monotonically from crown to shoulder.
 *
 *   "NO EAR DISC" — a concentric raised boss about 45% of head width dominates both art side
 *   views. The generated skull side is a blank plane.
 *
 * ⚠️ EVERY DIMENSION HERE IS DERIVED FROM THE ART, NOT PICKED. Measured off the BASELINE row of
 * Dev Art 1785300149293 at 339px figure height: head width 59px = 0.174 H. The ear disc and neck
 * are then fractions of that head, so the kit rescales correctly with the character.
 *
 * ⚠️ AND IT ATTACHES IN BIND POSE. Same rule as the shell mount: `attach()` preserves world
 * transform, so a prop added to a posed or displaced rig lands in the wrong local frame. Build
 * the character, fit the kit, then animate.
 */

const ART = {
  headW: 0.174,      // head width as a fraction of figure height, measured off the baseline row
  earDia: 0.45,      // ear disc diameter, as a fraction of head width
  earDepth: 0.16,    // how far the boss stands proud, as a fraction of head width
  neckH: 0.52,       // neck column height, as a fraction of head width
  neckDia: 0.44,     // neck column diameter, ditto
  capDia: 0.62,      // mint shoulder cap, ditto
};

/**
 * ===================== RATIOS BORROWED FROM THE PROCEDURAL BUILD =====================
 *
 * `unit4h` is a build John has already signed off against the art, so the PROPORTIONS in it are
 * measurements, not opinions. Carrying a ratio across is therefore evidence; carrying a raw
 * distance across is not, because the two characters are not the same shape.
 *
 * Measured by `harness/_kit2_surfaces.mjs` and `harness/_kit3_chest.mjs` on a 1.7 m donor:
 *
 *   visor plate width 0.2222 m / head width 0.2836 m            = 0.7835
 *   chest decal width 0.2992 m / front-facing band 0.310 m      = 0.965
 *   chest decal centre height 1.2427 m / 1.7 m                  = 0.7310 H
 *
 * "Front-facing band" is the run of chest whose surface normal still points within ~37 deg of the
 * camera (nz >= 0.80). It is the right denominator because it is what a printed mark can actually
 * lie on — silhouette width is not, and on THIS character silhouette width is not even torso
 * width, because the A-pose puts an arm in front of it.
 */
const DONOR = {
  decalOfBand: 0.965,
  decalYofH: 0.7310,
  frontNormalMin: 0.80,
};

/**
 * ===================== MEASURED OFF THE ART ITSELF =====================
 *
 * `assets/mv/player/baseline_front.png`, by `harness/_kit7_artratio.mjs`. Swept across three
 * colour cuts; only figures that agreed across cuts are used, and the disagreeing cut is named.
 *
 *   visor width / head width      0.781 (cut 26) · 0.740 (cut 36)   -> 0.78
 *   mint cap top,  below crown    0.2281 / 0.2270 H  (L / R)        -> 0.227 H
 *   mint cap base, below crown    0.3008 / 0.3053 H                 -> 0.303 H
 *
 * ⚠️ THE 0.7835 THIS FILE USED BEFORE WAS THE RIGHT NUMBER MEASURED WRONG. It came off the
 * procedural donor with MISMATCHED DENOMINATORS — the donor's head width taken at the visor's own
 * height, against the generated skull's width taken at its widest point anywhere. The art happens
 * to agree with it to two decimals, which is precisely why it survived: a wrong method that lands
 * on a right answer teaches nothing. The art is the authority and it is one image, so both
 * numerator and denominator now come off the same measurement.
 *
 * ⚠️ CUT 16 IS EXCLUDED AND SAYS SO. At that threshold the visor "measures" 316 px — the whole
 * figure — because the art's brushed body is faintly blue. A single cut prints a complete,
 * plausible, wrong table; this is what that looks like.
 */
/*
 * ⚠️ `visorOfSkull` IS CALIBRATED AGAINST A RENDER, NOT COPIED FROM THE ART, AND THE DIFFERENCE
 * MATTERS. The art's number is a ratio of two things in a PICTURE: visible blue against the head's
 * SILHOUETTE. Ours is a ratio of two things in a MODEL: plate width against skull width. They are
 * not the same ratio, because our silhouette includes the ear discs and the plate is curved.
 *
 * So it is set by measuring the end product. `harness/_kit7_artratio.mjs` masks a chroma capture
 * (`?bg=ff00ff`) exactly as it masks the art, and the two are compared at the same figure scale:
 *
 *                        head silhouette   visible blue   blue / head
 *   art                        146 px          112 px        0.767   (plateau b-r 30..40:
 *                                                                     0.767 and 0.726)
 *   ours at 0.78 of skull      154 px          110 px        0.714
 *
 * Head width already agrees — 154 px against the art's 155 at the same figure scale, once the ear
 * discs stopped breaking the silhouette. Only the blue was short, by a factor of about 1.06, so
 * the plate grows by that and nothing else moves.
 */
/**
 * ===================== THE SHOULDER-CAP BAND: ONLY ONE EDGE IS COMPARABLE =====================
 *
 * ⚠️ ROUND 4 WAS BRIEFED TO MOVE THE WHOLE BAND DOWN 0.03 H AND THAT WAS THE WRONG FIX. It is
 * written up here because the numbers behind it were correct, reproducible, and still pointed the
 * wrong way — the failure was choosing an invariant, not measuring one.
 *
 * THE BRIEF. `harness/_mat4_teal.mjs` reports the teal band as a fraction of figure height below
 * the CROWN. Ours read 0.199..0.283 against the art's 0.236..0.298: "0.03 too high, 39% too tall".
 * Both numbers reproduce exactly, on the production build, at
 * '?solo=1&bg=ff00ff&label=0&clip=merged&anim=Alert&azim=0'. The knobs are linear in that band:
 *
 *     captop   0.227   0.260   0.263   0.290  |  capbot   0.303   0.319   0.320*  0.340
 *     top of   0.199   0.233   0.235   THROWS |  bot of    0.283   0.297   0.299   0.316
 *     figure                                  |  figure
 *     ART                      0.236          |  ART                      0.298
 *
 * 0.290 trips the "band solved backwards" guard below at 73 deg of swing — watched firing.
 *
 * 🚨 AND SETTING captop 0.263 / capbot 0.319 PUT EVERY NUMBER ON THE ART AND MADE THE PART LOOK
 * BROKEN. Delivered band 0.235..0.297 against the art's 0.236..0.298, height 0.063 against 0.061,
 * lateral reach 0.371 against 0.355 — and on screen the mint had slid off the top of the shoulder
 * ball into a BELT around the deltoid, leaving the ball's crown bare champagne with the dark
 * under-gap showing above the teal. A capture is in the round-4 report; it is not a close call.
 *
 * WHY, AND IT IS THE PIPELINE'S OWN WARNING ABOUT FIXED HEIGHT FRACTIONS. The art's shoulder is
 * TWO parts — a champagne trapezius shell and a mint deltoid ball, split by a recessed seam — and
 * its mint spans only the ball, 0.062 H. Our generated body has no such split: one continuous
 * dome runs from the neck to the arm, and the ball it presents is 0.100 H, 1.6x the art's. So the
 * art's band position measures WHERE ITS SEAM IS, and we have no seam to put there. Matching the
 * fraction slides our mint off a ball the art's number knows nothing about. `harness/measure.mjs`
 * confirms the parts are not merely offset: the shoulder width-peak lands at 0.680 in BOTH, i.e.
 * the assemblies are co-located and differently shaped.
 *
 * SO ONLY THE BOTTOM EDGE IS COMPARABLE — both caps end where the shoulder meets the upper arm,
 * which is a real feature on both bodies. That edge is what moves this round, 0.303 -> 0.320, and
 * it lands at 0.299 against the art's 0.298. The top stays at 0.227 because our ball starts there.
 * `?captop=0.227&capbot=0.303` is the exact revert.
 */
const ARTREF = {
  visorOfSkull: 0.83,
  capTopOfH: 0.227,
  capBotOfH: 0.320,
};

/**
 * ===================== THE EAR IS A RING, AND THESE RADII ARE THE ART'S =====================
 *
 * `player-material-spec.md`, from John: *"the ear should be a ring not a plate made of chrome,
 * the inner circle of the ring is white disc."* The kit built it as a solid chrome cylinder with
 * a dark torus laid on top — a PLATE, which is exactly the note.
 *
 * ⚠️ THE PROPORTIONS ARE NOT INVENTED FOR THIS ROUND. `unit4h.js`'s `earLens` records them
 * measured off the art sheet's own ear, as fractions of its radius, and that build is one John
 * has already signed off:
 *
 *     0.00 - 0.48   flat centre disc
 *     0.48 - 0.50   scribe
 *     0.50 - 0.67   annulus land
 *     0.67 - 1.00   chamfer, falling back into the shell
 *
 * So `disc` is where the centre ends and `land` is where the chamfer begins. The chamfer is the
 * whole read — eight rounds of critics called the procedural ear "a large light disc" until it
 * was added — and it is what stops a ring on a curved skull showing a floating rim.
 *
 * `sink` is the only figure derived rather than copied, and it is derived from the art too: the
 * procedural chamfer spends 0.9 of the part's proudness across the outer third of its radius,
 * which is a 43-degree wall. Solving for the same angle on THIS ear's radius gives 0.051 of head
 * width of drop, i.e. 0.32 of `ART.earDepth`. Anything shallower reads as a bevel; anything
 * steeper stops burying the join.
 *
 * ⚠️ `discSet` IS A TASTE CALL AND IS LABELLED AS ONE. The art's centre disc is very nearly FLUSH
 * with its land — a scribe groove separates them, not a step. Flush is what makes the current
 * part read as a plate, which is the note being answered, so the white centre is set BACK by 0.30
 * of the ear's proudness and the chrome lip stands over it. `?eardisc=` and `?earinner=` put both
 * free parameters on the address bar rather than in a question.
 */
const EARRING = { disc: 0.50, land: 0.67, sink: 0.32, discSet: 0.30 };

/**
 * The chrome ring: a surface of revolution about local +Y, with +Y pointing OUT of the head.
 * `y = 0` is the skull surface, so the caller seats it by putting the mesh origin on the skull
 * and nothing about the seating maths has to change.
 *
 * ⚠️ THE PROFILE IS TRAVERSED OUTER-FOOT FIRST AND THAT IS WHAT MAKES IT VISIBLE.
 * `LatheGeometry` derives each point's normal from the profile as `(dy, -dx)` and winds its
 * triangles to match, so the direction of travel IS the choice of which side of the surface is
 * the front. Walked the other way every face here points into the skull and the part renders as
 * nothing at all — the same failure `shoulderCap`'s `assertFacesOut` was written for, and the
 * reason `earFacesOut()` below exists rather than a comment saying this was checked.
 *
 *   (R,        -sink)          chamfer foot, buried in the skull
 *   (R * land, +proud * 0.92)  the land — near flat, so it holds a value rather than a gradient
 *   (R * disc, +proud)         the inner lip, the ring's proudest point
 *   (R * disc, -sink)          the inner wall, running back down inside the skull
 */
function earRingGeometry(R, proud, sink, seg = 48) {
  const pts = [
    new THREE.Vector2(R, -sink),
    new THREE.Vector2(R * EARRING.land, proud * 0.92),
    new THREE.Vector2(R * EARRING.disc, proud),
    new THREE.Vector2(R * EARRING.disc, -sink),
  ];
  const g = new THREE.LatheGeometry(pts, seg);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/**
 * THE CONTROL FOR THE RING'S FACING. Summed over the part, its normals must point OUT of the head
 * — along the local +Y the caller aims outward. The land and the chamfer carry that sum; the
 * inner wall's normal is perpendicular to it and contributes nothing either way, which is correct
 * and is why this is a sum rather than a per-vertex test.
 *
 * Reversing the profile flips every one of them, and an inside-out ring renders as NOTHING on a
 * front-face-only material — indistinguishable in a capture from a ring that was never built.
 */
function earFacesOut(geo, name) {
  const n = geo.attributes.normal;
  let sum = 0;
  for (let i = 0; i < n.count; i++) sum += n.getY(i);
  if (!(sum > 0)) {
    throw new Error(`mesh-identity: "${name}" is inside-out — its normals sum to ${sum.toFixed(3)} ` +
      'along the outward axis, so every face points into the body and it would render as nothing.');
  }
  return sum;
}

/**
 * --- THE JOINT-FIXTURE SHAPES. Both are lathes, for the reason `earRingGeometry` is a lathe.
 *
 * ⚠️ READ THIS BEFORE CHANGING EITHER ONE, BECAUSE THE OBVIOUS SIMPLIFICATION HAS ALREADY BEEN
 * TRIED AND SHIPPED AND FAILED. The exposed actuators were FLAT DISCS in the first build and they
 * photographed as HOLES: chrome is only what it reflects, one normal returns one radiance, and on
 * the back of a leg that radiance is near black. The second build made them TORI, which fixed the
 * lighting exactly as intended — every normal in the plane of the tube, so some part of the part
 * faces the key from any angle — and broke the FORM: a torus has a hole in it, you see straight
 * through the bore, and at 6x they read as "a hollow doughnut poking sideways out of the outline".
 *
 * The reference art (`assets/mv/player/baseline_side-left.png`, `baseline_back.png`) has, at elbow
 * and hip and knee and ankle, a CLOSED MACHINED HUB: a concentric bezel with a solid centre,
 * sitting in the silhouette like a watch case. Not a lump stuck on, and not a ring you can see
 * through.
 *
 * So the profile below is the torus cross-section KEPT VERBATIM as the rim — that is the curvature
 * that fixed the lighting and it is not being given up — and then, instead of the arc wrapping
 * round into a bore, it stops at the groove and a DOMED SOLID HUB closes the middle. Curvature
 * kept; hole closed. The hub is domed rather than flat for the same reason the discs failed, and
 * it is set BELOW the rim's crest so the bezel lip stands over it, which is the `EARRING.discSet`
 * argument applied to the same problem.
 */
const BEZEL = {
  rimMid: 0.70,    // the rim's cross-section centre, as a fraction of the outer radius R
  rimHalf: 0.30,   // ... and its half-width, so the rim occupies 0.40 R .. 1.00 R
  rimEnd: 0.88,    // how far round the half-turn the rim runs, in units of PI
  hubR: 0.34,      // the hub dome's foot radius, leaving a groove between it and the rim
  hubRise: 0.52,   // the dome's height, as a fraction of `proud` — apex ends up under the crest
  sink: 0.45,      // the outer foot's burial, as a fraction of R. See below; this is a SAGITTA.
};

/**
 * A closed machined hub: bezel rim, groove, solid domed centre. Lathed about local +Y with +Y
 * pointing OUT of the body, and `y = 0` on the body surface, so the caller seats it by putting the
 * mesh origin on the raycast hit and nothing about the seating maths changes.
 *
 * ⚠️ THE PROFILE IS TRAVERSED OUTER-FOOT FIRST, for the reason spelled out on `earRingGeometry`:
 * `LatheGeometry` takes each normal as `(dy, -dx)` and winds to match, so direction of travel IS
 * the choice of which side is the front. Walked the other way it renders as nothing.
 *
 * ⚠️ `sink` IS NOT A STYLE NUMBER, IT IS THE SAGITTA, and it is why the part does not gap. These
 * seat on LIMBS, and a limb is round: across a fixture of radius R on a limb of radius r the real
 * surface falls R^2/(2r) below the tangent plane the fixture is built on. At the elbow R is 0.029
 * and the forearm is about 0.035, which is 0.012 of drop — 0.41 R. Burying the outer foot 0.45 R
 * clears that, so the rim meets the limb below its own surface at every angle instead of standing
 * on a chord with daylight under its edges.
 */
function jointBezelGeometry(R, proud, hubRise, seg = 32) {
  const pts = [new THREE.Vector2(R, -R * BEZEL.sink)];
  const RIM = 14;
  for (let i = 0; i <= RIM; i++) {
    const th = (i / RIM) * Math.PI * BEZEL.rimEnd;
    pts.push(new THREE.Vector2(
      R * (BEZEL.rimMid + BEZEL.rimHalf * Math.cos(th)),
      proud * Math.sin(th)));
  }
  const landY = pts[pts.length - 1].y * 0.86;      // the groove floor, just under the rim's inner foot
  pts.push(new THREE.Vector2(R * BEZEL.hubR, landY));
  const DOME = 8;
  for (let i = 1; i < DOME; i++) {
    const a = (i / DOME) * Math.PI * 0.5;
    pts.push(new THREE.Vector2(
      R * BEZEL.hubR * Math.cos(a),
      landY + proud * hubRise * Math.sin(a)));
  }
  // The apex is written as an EXACT zero, not as R*cos(PI/2), which is 1e-18 and misses the
  // `points[j].x === 0` test LatheGeometry uses to close a pole cleanly.
  pts.push(new THREE.Vector2(0, landY + proud * hubRise));
  const g = new THREE.LatheGeometry(pts, seg);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/**
 * A DOMED BOSS — a ball of radius `r` sunk into the surface until only `proud` of it shows.
 *
 * ⚠️ THIS REPLACED A FLAT-TOPPED CYLINDER AND THE CYLINDER'S FAILURE IS THE WHOLE ARGUMENT. The
 * spec asks for "a white round fixture on both the back and front of the shoulder caps", and what
 * shipped photographed as a DARK ROUND HOLE in the mint — the opposite value to the one specified.
 * A flat-topped cylinder seen from anywhere off its axis shows you its top face turning away and
 * its side wall, and that side wall is a vertical unlit ring: the exact signature of a drilled
 * hole with the plug missing. A dome has no wall and no away-facing plane. Some part of it faces
 * the key from every angle, so it carries a highlight from every angle, and it can never read as a
 * bore.
 *
 * The ball's EQUATOR sits BELOW the seat plane (`yc = proud - r` is negative for any dome
 * shallower than a hemisphere), which is the second thing this buys: the part is at its widest
 * underneath the surface, so a curved shoulder cap cannot open a gap at its edge the way it can
 * under a flat foot. `foot` then runs the skirt well below that, past the cap's own standoff plus
 * the cap's sagitta, so nothing of the skirt is ever above the mint.
 */
function domeBossGeometry(r, proud, seg = 28) {
  const yc = proud - r;                             // the ball's centre, below the seat plane
  const yFoot = -r * 0.55;
  const tFoot = Math.acos(Math.max(-1, Math.min(1, (yFoot - yc) / r)));
  const pts = [];
  const N = 16;
  for (let i = 0; i <= N; i++) {
    const t = tFoot * (1 - i / N);                  // tFoot (buried skirt) -> 0 (apex)
    pts.push(new THREE.Vector2(r * Math.sin(t), yc + r * Math.cos(t)));
  }
  pts[pts.length - 1] = new THREE.Vector2(0, proud); // exact pole, see the note in jointBezelGeometry
  const g = new THREE.LatheGeometry(pts, seg);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Find bones by name once — Meshy's humanoid rig uses a stable Mixamo-style naming. */
function findBones(root) {
  const want = ['Head', 'neck', 'LeftArm', 'RightArm', 'Spine02', 'Spine01', 'Spine',
    // The joint-fixture bones. NOT in the required set below — `attachIdentityAtOrigin` throws
    // only on the four the face and caps cannot be built without, and a rig missing a forearm
    // should still get a head rather than no kit at all.
    'LeftForeArm', 'RightForeArm', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg',
    'LeftFoot', 'RightFoot'];
  const out = {};
  root.traverse((o) => { if (want.includes(o.name) && !out[o.name]) out[o.name] = o; });
  return out;
}

/**
 * ===================== MEASURING THE BODY WE ARE DECORATING =====================
 *
 * ⚠️ THE KIT USED TO SIZE EVERYTHING OFF `ART.headW * H`, AND THAT IS THE BUG BEHIND TWO OF THE
 * THREE OPEN HATES. 0.174 H is the head the ART has. The GENERATED skull is 0.2582 m on a 1.7 m
 * figure — 0.152 H, a ratio of 0.873 — so a part placed at a fraction of the art's head lands in
 * the wrong place on this one. The ear disc is the clearest case: it was seated at x +/-0.088 m
 * while the skull surface sits at +/-0.123 to +/-0.129 m, which means it was not reading small,
 * it was BURIED, with only whatever crossed the temple visible at all.
 *
 * So measure the real surface instead of assuming it, by raycast, at build time. Live measurement
 * rather than a constant copied out of a probe, because a re-exported or re-generated mesh must
 * not silently inherit today's skull.
 */

/** First surface hit firing straight in along an axis. Returns `{point, normal}` in world space. */
function castAt(meshes, origin, dir) {
  const ray = new THREE.Raycaster(origin, dir.clone().normalize());
  const hit = ray.intersectObjects(meshes, true)[0];
  if (!hit) return null;
  const n = hit.face
    ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
    : dir.clone().negate();
  return { point: hit.point.clone(), normal: n };
}

/**
 * World x of the body's right-hand surface at height `y`, on the body's own centre plane.
 *
 * ⚠️ `at` IS THE BODY'S CENTRE LINE AND IT IS NOT THE ORIGIN. Every ray in this file used to be
 * fired down x = 0 and z = 0, which silently assumed the character stands at the world origin.
 * `mesh-animated.js` offsets the rig to x = 0.75 whenever it is shown BESIDE the procedural player
 * — i.e. in every view except `?solo=1`, which is the only one this kit was ever tested through.
 * The rays then missed the body completely and the head "measured" 3.2576 m. `MESH.bat` opens the
 * paired view, so all three of its tabs failed while every capture taken during development
 * passed. Anything that moves the character — and the game moves it constantly — breaks the same
 * way, so the fix is to measure relative to the body rather than to the world.
 */
function halfWidthAt(meshes, y, reach, at) {
  const h = castAt(meshes, new THREE.Vector3(at.x + reach, y, at.z), new THREE.Vector3(-1, 0, 0));
  return h ? h.point.x : null;
}

/**
 * The skull's width profile, and the band where it is widest.
 *
 * The disc has to SEAT, not float, so the seating radius is the NARROWEST the skull gets across
 * the disc's own footprint — anywhere wider than that and the disc's top or bottom edge lifts off.
 * Centring it on the widest band first is what keeps that narrowest value high.
 */
function skullProfile(meshes, yBase, yTop, reach, at) {
  const rows = [];
  const N = 48;
  for (let i = 0; i <= N; i++) {
    const y = yBase + (yTop - yBase) * (i / N);
    const x = halfWidthAt(meshes, y, reach, at);
    // Half-width is measured FROM the body's centre line, so it stays a body dimension rather
    // than a world coordinate. Seating converts it back by adding the centre line in again.
    const hw = x === null ? null : x - at.x;
    if (hw !== null && hw > 0) rows.push({ y, hw });
  }
  if (rows.length < 4) return null;
  const maxHW = Math.max(...rows.map((r) => r.hw));
  const wide = rows.filter((r) => r.hw >= maxHW * 0.95);
  const bandY = (wide[0].y + wide[wide.length - 1].y) * 0.5;
  return {
    rows,
    maxHW,
    bandY,
    /** the tightest half-width between two heights — the radius a boss can seat on */
    minOver: (y0, y1) => {
      const inside = rows.filter((r) => r.y >= y0 && r.y <= y1);
      return inside.length ? Math.min(...inside.map((r) => r.hw)) : maxHW;
    },
    /** the widest half-width between two heights — the silhouette a part must not break */
    maxOver: (y0, y1) => {
      const inside = rows.filter((r) => r.y >= y0 && r.y <= y1);
      return inside.length ? Math.max(...inside.map((r) => r.hw)) : maxHW;
    },
  };
}

/**
 * How far out from the centre line the chest still FACES FORWARD at height `y`.
 *
 * Walks outward and stops at the first sample whose surface normal has turned more than the
 * donor's threshold away from the camera. That is the edge a printed mark can reach, and it is
 * measured rather than assumed — this character's chest is markedly rounder than the procedural
 * one, so its band is narrower and a decal sized by the donor's raw width would wrap round it.
 */
function frontBandHalfWidth(meshes, y, limit, at) {
  const step = 0.006;
  let last = 0;
  for (let x = 0; x <= limit; x += step) {
    const l = castAt(meshes, new THREE.Vector3(at.x - x, y, at.z + limit * 3), new THREE.Vector3(0, 0, -1));
    const r = castAt(meshes, new THREE.Vector3(at.x + x, y, at.z + limit * 3), new THREE.Vector3(0, 0, -1));
    if (!l || !r) break;
    if (l.normal.z < DONOR.frontNormalMin || r.normal.z < DONOR.frontNormalMin) break;
    last = x;
  }
  return last;
}

/**
 * Push every vertex of `mesh` onto the body's real surface, along the ray from `centre` out
 * through that vertex, and leave it standing `lift` proud.
 *
 * ⚠️ THIS IS WHY THE BEZEL NEEDED IT. The bezel is a copy of the donor's visor plate, and that
 * plate's dome was built for the DONOR's skull radius. Scaled 13% larger and hung on a different,
 * narrower head, its rim lifts off. Head-on that is invisible; turn the head 50 degrees, as the
 * `alert` clip does, and it reads as a white FIN hanging off the front of the face. A flat plate
 * on a curved skull floats at the edges — the same failure this file's face notes already record,
 * arriving through a different door.
 *
 * The ray is fired from OUTSIDE inward rather than from the centre outward, so it always lands on
 * the outer shell. Fired outward, a vertex that already sits outside the skull finds nothing.
 *
 * ⚠️ `mesh` MUST ALREADY BE PARENTED, because this works in WORLD space and reads `matrixWorld`.
 * The first version used `mesh.matrix` on an unparented plate, and the plate's own frame is
 * relative to the HEAD JOINT — so its vertices sat around y 0.1 instead of y 1.5, every ray from
 * the head centre pointed at the floor, and the "conformed" faceplate came back as a sheet
 * smeared down the legs from y 0 to y 0.775. On screen that is simply a character with no face,
 * which is a much harder symptom to read than a number is. `assertOnHead` below is the control.
 */
function conformToSurface(mesh, meshes, centre, lift, reach, along = null) {
  mesh.updateWorldMatrix(true, false);
  const toWorld = mesh.matrixWorld.clone();
  const p = mesh.geometry.attributes.position;
  const out = p.clone();
  const v = new THREE.Vector3();
  const dir = new THREE.Vector3();
  let missed = 0;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(toWorld);
    if (along) {
      /*
       * ⚠️ PARALLEL RAYS, AND THIS IS WHAT MAKES A SIZED PLATE KEEP ITS SIZE. Projecting outward
       * from the head centre preserves each vertex's ANGLE, so it shrinks a plate that stands
       * proud of the face — the visor was set to 0.78 of head width and shipped at 0.529. Worse,
       * scaling up to compensate does not converge: a wider plate subtends a wider angle, wraps
       * further round the skull, and eventually projects DOWN THE NECK. That run produced a bezel
       * spanning y 1.184..1.618 on a head that spans 1.421..1.700, and `assertOnHead` caught it.
       *
       * Firing every ray along ONE direction — the face's forward — leaves the silhouette
       * perpendicular to that direction untouched. Width in, width out. Only depth changes, which
       * is the entire point of conforming. It is the same scheme the chest wordmark uses.
       */
      dir.copy(along);
    } else {
      dir.copy(v).sub(centre);
      if (dir.lengthSq() < 1e-9) { missed++; continue; }
      dir.normalize();
    }
    /*
     * ⚠️ START THE RAY WHERE IT CAN ONLY HIT THE NEAR SIDE, AND THE TWO MODES DIFFER.
     *
     * Centre-projection: `dir` points OUT. Start far out along it and travel back in.
     * Along-a-direction: `dir` points IN. Start far out AGAINST it and travel along it.
     *
     * Getting this backwards is silent and convincing. Built the wrong way round, the plates
     * conformed to the BACK of the skull — every y extent still looked plausible, the width solve
     * still converged to 0.781, and the character simply had no face. `assertOnHead` cannot catch
     * it because the back of a head is at the same height as the front.
     */
    const travel = along ? dir.clone() : dir.clone().negate();
    const origin = along
      ? v.clone().addScaledVector(dir, -reach)
      : centre.clone().addScaledVector(dir, reach);
    const hit = castAt(meshes, origin, travel);
    if (!hit) { missed++; continue; }
    /*
     * ⚠️ THE LIFT GOES AGAINST THE RAY, AND THE TWO MODES POINT OPPOSITE WAYS. Projected from the
     * centre, `dir` points OUT of the head and `+lift` stands the part proud. Fired along the
     * face's forward, `dir` points INTO the head, so the same `+lift` buries it — which is exactly
     * what happened: both plates sank under the skull and the character lost its face for the
     * second time in this session, from a different cause than the first.
     */
    v.copy(hit.point).addScaledVector(dir, along ? -lift : lift);
    out.setXYZ(i, v.x, v.y, v.z);
  }
  if (missed) {
    throw new Error(`mesh-identity: ${missed} of ${p.count} vertices of "${mesh.name}" found no ` +
      'surface to lie on. The part is larger than the body part it belongs to.');
  }
  mesh.geometry = mesh.geometry.clone();
  mesh.geometry.setAttribute('position', out);
  mesh.geometry.computeVertexNormals();
  /*
   * Bounds are CACHED and `clone()` copies them, so a conformed part keeps the donor's box and
   * sphere unless they are cleared. That is not cosmetic: the stale sphere sits at the head
   * joint's origin, and frustum culling would drop the face whenever the camera framed the head
   * closely. It also made the first diagnosis of this bug harder, by reporting the donor's box
   * for a part that was lying across the character's legs.
   */
  mesh.geometry.boundingBox = null;
  mesh.geometry.boundingSphere = null;
  mesh.geometry.computeBoundingBox();
  mesh.geometry.computeBoundingSphere();

  // The geometry now holds WORLD coordinates, so the part wants a world transform of identity.
  // Detach first: `attach()` on something already parented to the target is a no-op.
  mesh.removeFromParent();
  mesh.position.set(0, 0, 0);
  mesh.quaternion.identity();
  mesh.scale.setScalar(1);
  mesh.updateMatrix();
  mesh.updateMatrixWorld(true);
  return mesh;
}

/**
 * THE CONTROL FOR EVERY CONFORMED HEAD PART. A part that belongs on the skull must END UP on the
 * skull. This is the check that turns "the character has no face" — which took a render, a crop
 * and two wrong theories to diagnose — into one thrown line naming the part and where it landed.
 */
function assertOnHead(mesh, skull, headBaseY, crownY, headCentre) {
  const b = mesh.geometry.boundingBox;
  /*
   * FRONT, NOT BACK. The height checks below cannot see this — the back of a head sits at exactly
   * the same heights as the front — and a plate conformed to the back of the skull is invisible
   * from every angle the character is judged from, while every other number stays plausible.
   * That happened, and it cost a render to notice.
   */
  if (b.min.z < headCentre.z) {
    throw new Error(`mesh-identity: "${mesh.name}" conformed to z ${b.min.z.toFixed(3)}..` +
      `${b.max.z.toFixed(3)}, which crosses the head's centre plane at z ` +
      `${headCentre.z.toFixed(3)}. It is on the BACK of the skull.`);
  }
  const slack = (crownY - headBaseY) * 0.35;
  if (b.min.y < headBaseY - slack || b.max.y > crownY + slack) {
    throw new Error(`mesh-identity: "${mesh.name}" conformed to y ${b.min.y.toFixed(3)}..` +
      `${b.max.y.toFixed(3)} but the head spans ${headBaseY.toFixed(3)}..${crownY.toFixed(3)}. ` +
      'It was projected onto the wrong part of the body.');
  }
  if (b.max.x - b.min.x > skull.maxHW * 2 * 1.6) {
    throw new Error(`mesh-identity: "${mesh.name}" conformed to ` +
      `${(b.max.x - b.min.x).toFixed(3)} m wide against a ${(skull.maxHW * 2).toFixed(3)} m skull.`);
  }
}

/**
 * ===================== MAKE A PART DEFORM WITH THE BODY =====================
 *
 * ⚠️ A BONE-PARENTED PROP IS RIGID, AND ON A JOINT THAT IS A CLIPPING BUG, NOT A STYLE CHOICE.
 *
 * The kit's opening note says a prop parented to a bone "cannot fight the deformation, because it
 * simply rides whatever the bone does". That is true of the HEAD, which is effectively rigid. It
 * is false of a SHOULDER. The deltoid surface is blended across `Spine`, `LeftShoulder` and
 * `LeftArm`, so it bends and swells as the arm swings; a cap rigidly welded to `LeftArm` swings
 * on the single bone's arc instead, and the two surfaces cross. John's report was "clipping and
 * behaving weirdly during movement", and that is exactly what a rigid patch on a blended surface
 * does — it is invisible in the bind pose and appears only once the clip plays.
 *
 * The fix is to stop making it a prop. A part laid on the skin should BE skin: same skeleton, same
 * bind matrix, and skin weights copied from the nearest body vertex. It then deforms by the same
 * arithmetic as the surface it lies on, so it cannot cross it at any pose — no clip-by-clip
 * checking required, because the two are no longer solving different problems.
 *
 * Nearest-vertex is the right assignment rule here and not an approximation of one: these parts
 * are built BY RAYCAST ONTO THE BODY, so every vertex already sits a fraction of a millimetre off
 * a real surface point, and that point's weights are the ones it should share.
 */
function skinToBody(mesh, body, mats) {
  const src = body.geometry;
  const sp = src.attributes.position;
  const si = src.attributes.skinIndex;
  const sw = src.attributes.skinWeight;
  if (!si || !sw) {
    throw new Error('mesh-identity: the body mesh carries no JOINTS_0/WEIGHTS_0, so a kit part ' +
      'cannot borrow its weights. This is not a skinned asset.');
  }

  const dp = mesh.geometry.attributes.position;
  const idx = new Uint16Array(dp.count * 4);
  const wgt = new Float32Array(dp.count * 4);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  let worst = 0;
  for (let i = 0; i < dp.count; i++) {
    a.fromBufferAttribute(dp, i);
    let best = Infinity;
    let bestJ = 0;
    for (let j = 0; j < sp.count; j++) {
      const d = a.distanceToSquared(b.fromBufferAttribute(sp, j));
      if (d < best) { best = d; bestJ = j; }
    }
    worst = Math.max(worst, Math.sqrt(best));
    idx[i * 4 + 0] = si.getX(bestJ); idx[i * 4 + 1] = si.getY(bestJ);
    idx[i * 4 + 2] = si.getZ(bestJ); idx[i * 4 + 3] = si.getW(bestJ);
    wgt[i * 4 + 0] = sw.getX(bestJ); wgt[i * 4 + 1] = sw.getY(bestJ);
    wgt[i * 4 + 2] = sw.getZ(bestJ); wgt[i * 4 + 3] = sw.getW(bestJ);
  }
  /*
   * THE CONTROL. Every one of these vertices was placed ON the body by a raycast, so its nearest
   * body vertex must be close — no further than the mesh's own triangle spacing. A large distance
   * means the part is not lying on the body at all, and the weights it just copied belong to some
   * other limb. Silent otherwise: wrong weights look fine in bind pose and tear on the first frame.
   */
  if (!src.boundingBox) src.computeBoundingBox();
  const scaleRef = src.boundingBox.getSize(new THREE.Vector3()).length();
  if (worst > scaleRef * 0.06) {
    throw new Error(`mesh-identity: "${mesh.name}" has a vertex ${worst.toFixed(4)} m from the ` +
      `nearest body vertex on a ${scaleRef.toFixed(3)} m body. It is not lying on the surface, ` +
      'so the weights it copied are the wrong limb\'s.');
  }

  mesh.geometry.setAttribute('skinIndex', new THREE.BufferAttribute(idx, 4));
  mesh.geometry.setAttribute('skinWeight', new THREE.BufferAttribute(wgt, 4));

  const skinned = new THREE.SkinnedMesh(mesh.geometry, mesh.material ?? mats.mint);
  skinned.name = mesh.name;
  skinned.castShadow = mesh.castShadow;
  skinned.receiveShadow = mesh.receiveShadow;
  skinned.frustumCulled = false;
  // Mirror the body's own placement exactly: same parent, same local transform, same bind matrix.
  // Anything else and the part skins in a different space from the surface it was measured on.
  skinned.position.copy(body.position);
  skinned.quaternion.copy(body.quaternion);
  skinned.scale.copy(body.scale);
  body.parent.add(skinned);
  skinned.bind(body.skeleton, body.bindMatrix);
  return skinned;
}

/**
 * ===================== THE SHOULDER CAP =====================
 *
 * A patch of the shoulder's OWN SURFACE, in mint. Built by firing a grid of rays at the body from
 * around the arm joint and keeping where they land, so the cap is a skin rather than a solid: it
 * cannot float off the deltoid and it cannot bulge past the silhouette, which were the two ways
 * the previous ellipsoid failed at the same time.
 *
 * The vertical extent is SOLVED, not chosen. The art puts the cap between 0.227 H and 0.303 H
 * below the crown; a bisection finds the two polar angles whose surface hits land on exactly those
 * heights. That keeps the cap correct on a body whose shoulder is a different size from the art's.
 *
 * `phi` spans the outer 200 degrees — front, outboard and a little behind — leaving the inboard
 * face white, which is what the art shows next to the collar.
 */
/**
 * URL override for the shoulder-cap swing window, in DEGREES about straight-outward. The window
 * is the only thing in this file that is a taste call rather than a solved measurement, and it
 * is the one the material spec moves — so it is reachable without an edit, and the pre-round cap
 * is one query string away for an A/B.
 */
function capKnob(name, fallback) {
  if (typeof location === 'undefined') return fallback;
  const v = new URLSearchParams(location.search).get(name);
  if (v === null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function shoulderCap(bone, meshes, side, headW, H, crownY, reach, mat) {
  const c = bone.getWorldPosition(new THREE.Vector3());

  /** Direction at polar angle `t` from straight up, swung `f` radians around the vertical. */
  const dirAt = (t, f) => new THREE.Vector3(
    Math.sin(t) * Math.cos(f) * side,
    Math.cos(t),
    Math.sin(t) * Math.sin(f),
  ).normalize();

  const hitAt = (t, f) => castAt(meshes, c.clone().addScaledVector(dirAt(t, f), reach),
    dirAt(t, f).clone().negate());

  /**
   * The polar angle whose surface hit sits at height `y`, at a given swing. Monotone in t.
   *
   * ⚠️ SOLVED PER COLUMN, NOT ONCE. Solving only at the outward direction and reusing that angle
   * all the way round assumes the shoulder is a SPHERE about the arm joint, and it is not — the
   * front and back of a deltoid sit at different radii. That assumption produced a cap spanning
   * y 1.140..1.336 against the art's 1.182..1.314: half again as tall as it should be, and hanging
   * below the band at exactly the place the old ellipsoid did.
   */
  const thetaForY = (targetY, f) => {
    let lo = 0.02, hi = Math.PI * 0.92;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) * 0.5;
      const h = hitAt(mid, f);
      if (!h) { hi = mid; continue; }
      if (h.point.y > targetY) lo = mid; else hi = mid;
    }
    return (lo + hi) * 0.5;
  };

  /*
   * ⚠️ `crownY` AND `H` ARE THE BIND POSE. THE ART IS A FRACTION OF THE POSED FIGURE. THAT IS THE
   * WHOLE DEFECT, AND IT IS WHY THE OLD NUMBER LOOKED CORRECT EVERY TIME IT WAS CHECKED.
   *
   * `attachIdentity` is called from `mesh-animated.js:285`, BEFORE the mixer is built at :314 —
   * deliberately, so the kit is fitted to a pose no animation frame can shift. So `H` is exactly
   * 1.7 (the rig is scaled to it at :260) and `crownY = rigBox.max.y` is the bind-pose crown.
   *
   * The DELIVERED figure is the Alert pose, which is shorter and whose crown sits lower. Measured
   * through `harness/_mat4_teal.mjs` on '?solo=1&bg=ff00ff&clip=merged&anim=Alert', the band the
   * viewer actually sees is not the band this line asks for — see the calibration below. Checking
   * the world-space span (the old note's "y 1.1814..1.3170") could never catch it, because that
   * span is this line read back to itself: it is correct by construction in the bind frame and
   * says nothing about the frame the art is measured in. This is a DELIVERY check, not a
   * derivation check.
   */
  const yTop = crownY - capKnob('captop', ARTREF.capTopOfH) * H;
  const yBot = crownY - capKnob('capbot', ARTREF.capBotOfH) * H;

  /*
   * ⚠️ THE SWING WINDOW IS CENTRED FORWARD OF OUTWARD, AND THAT IS WHAT MAKES THE CAP READ.
   * Centred on straight outward, the cap wrapped the outer edge of the shoulder and the front
   * elevation showed two green SLIVERS — technically in the right band, visually absent. The art
   * is a front elevation and puts the cap's visible span at x 0.179..0.272 m, centred on the arm
   * joint at 0.227, so the mint faces the camera as much as it faces outward.
   *
   * Stopping at +100 deg matters too. Swung further the rays leave the arm entirely and start
   * hitting the CHEST, which would spill mint onto the torso — `assertOnArm` catches that.
   */
  /*
   * 🚨 ROUND 2 NARROWED THIS WINDOW TO 0..105 deg AND ROUND 3 PUTS IT BACK. THE CORRECTION IS
   * RECORDED HERE BECAUSE THE MISTAKE WAS NOT THE NUMBER, IT WAS WHAT THE NUMBER WAS FOR.
   *
   * Round 2 read `player-material-spec.md`'s "the TOP and BACK are NOT teal" as a statement about
   * COVERAGE and deleted the rearward 35 degrees of the cap. John's verdict on that build:
   * *"Both the shoulder cap should be completely teal but they only show as teal from the
   * front."* The spec entry is now corrected in place: the cap was never partly another material.
   * It only READ that way, because the top and back of a domed cap turn away from the key light,
   * and a mint that loses its diffuse term loses its HUE — a near-black pixel has no colour to
   * report however saturated the albedo under it is.
   *
   * The response half of that is real and ships too — see `mintCap()` in
   * `src/materials/surfaces/robot.js`, an emissive floor at the cap's own tint that lifts the
   * unlit face without desaturating it the way more environment would.
   *
   * 🚨 BUT THE BACK WEDGE IS COVERAGE, NOT RESPONSE, AND THE MEASUREMENT SAYS SO PLAINLY. The
   * round-3 brief asked for a straight revert to -35 on the reading that the pre-round cap
   * already reached behind the shoulder and merely went dark there. It does not. Teal as a
   * percentage of FIGURE pixels on the BACK elevation, `harness/_mat4_teal.mjs`, against
   * `assets/mv/player/baseline_back.png`:
   *
   *   capf0     0     -35    -55    -62      -70   |  ART
   *   back    0.000  0.051  0.506  0.741    1.051  |  0.752
   *   graze    off    on     on     on       on
   *   ...and at capf0 -35 with the emissive OFF the back reads 0.029 against its 0.051, i.e. the
   *   response change is worth 39 teal pixels on that view and the window is worth 1800.
   *
   * At -35 the cap wraps 35 degrees behind straight outward, and seen from directly behind that
   * strip is edge-on: its PROJECTED area is near zero no matter how it is lit, which is why no
   * amount of emissive moves it. The art's own back elevation carries a wedge at 0.752% and -62
   * lands on it. So the window ships at -62, not at the -35 it was asked to revert to, and this
   * paragraph is the reason. `?capf0=-35` is the briefed revert and `?capf0=0` the round-2 cap;
   * both are one capture away if this call is wrong.
   *
   * The FRONT elevation is untouched by the change — 2.901% at -35 against 2.909% at -62 — so
   * this buys the back without spending anything at the front.
   *
   * A builder had separately measured that the ART's back elevation plainly carries a teal wedge
   * on each shoulder, so the art and the correction agree; the original spec line was the outlier
   * and round 2 followed it off a cliff.
   *
   * MEASURED, not assumed, which way is forward: `harness/_mat4_axes.mjs` reads the rig and
   * reports LeftToeBase at z +0.065 against LeftFoot at z -0.039, so +z is the character's
   * FRONT. In dirAt() below, +f swings toward +z. That sign is why -35 is BEHIND the shoulder
   * and not in front of it, and it is worth keeping straight: reversed, this revert would delete
   * the front of the cap and keep the back, which renders as a plausible teal shoulder from
   * behind and a white one from the front — i.e. it would ship.
   *
   * ⚠️ THE LINE THAT USED TO SIT HERE WAS THE ONE THAT HID THE BAND DEFECT FOR TWO ROUNDS, and it
   * is left quoted rather than deleted because the shape of the mistake is the useful part:
   *
   *     "THE VERTICAL BAND IS UNTOUCHED: the cap spans y 1.1814..1.3170 against the art's
   *      1.1815..1.3141, solved per column by thetaForY() above."
   *
   * Every digit of that is true and it certifies nothing. Both spans are bind-frame world
   * coordinates derived from `capTopOfH`/`capBotOfH`, so the sentence compares the solver to its
   * own input and agrees to 3 mm by construction. Delivered on the posed figure the same band was
   * 0.199..0.283 against the art's 0.236..0.298. See the ARTREF block at the top of this file; the
   * band is now measured where it is looked at.
   *
   * `?capf0=` / `?capf1=` override the two bounds in degrees; `?capf0=0` is the exact revert to
   * the round-2 cap that John rejected.
   */
  /*
   * ⚠️ ROUND 4 LEAVES capf0 AT -62, AND THE REASON IS WORTH A LINE BECAUSE IT WAS BRIEFED AS A
   * DEFECT. With the band shortened to captop 0.263 the back elevation fell to 0.514% against the
   * art's 0.752%, and capf0 -70 bought it straight back (0.743%) at no cost to the front
   * (1.602 -> 1.618). That pairing was measured and it works. It is not shipped, because the band
   * change it compensated for is not shipped either — see the ARTREF block at the top of this
   * file. Reintroducing -70 on the RESTORED band would over-wrap the back. If the band is ever
   * shortened again, -70 is the matching rearward window and this is where that is recorded.
   *
   * 🚨 THE FRONT'S "2.1x THE ART'S TEAL" IS NOT COVERAGE AND MUST NOT BE CHASED WITH GEOMETRY.
   * It is a SATURATION difference being read by a fixed threshold, and saturation belongs to
   * `mintCap()` in `src/materials/surfaces/robot.js`, not to this file. `_mat4_teal.mjs --chroma N`
   * sweeps the detector's own cut, and THE SIGN OF THE DEFECT FLIPS INSIDE IT — front elevation:
   *
   *     chroma cut      12       22       32       45
   *     render        1.827    1.618    1.088    0.004
   *     ART           3.122    1.197    0.000    0.000
   *     verdict     art +71%  us +35%  art has   both
   *                                     NONE     gone
   *
   * The art's mint is flat and sits in a narrow chroma band (~12..32); ours is saturated and
   * reaches ~45. The default cut of 22 lands INSIDE the art's distribution and slices it
   * arbitrarily, so any ratio it reports is a property of the cut. A builder deleting cap area to
   * chase 2.1x would be removing geometry to compensate for a shader's saturation.
   */
  const NT = 14;
  const NF = 26;
  const F0 = capKnob('capf0', -62) * Math.PI / 180;
  const F1 = capKnob('capf1', 105) * Math.PI / 180;
  const FCENTRE = (F0 + F1) * 0.5;
  const FSPAN = F1 - F0;
  const lift = headW * 0.014;
  const pos = [];
  let missed = 0;
  const cols = [];
  for (let j = 0; j <= NF; j++) {
    const f = FCENTRE - FSPAN / 2 + FSPAN * (j / NF);
    const t0 = thetaForY(yTop, f);
    const t1 = thetaForY(yBot, f);
    if (!(t1 > t0)) {
      throw new Error(`mesh-identity: shoulder cap band solved backwards at swing ` +
        `${(f * 180 / Math.PI).toFixed(0)} deg (t0 ${t0.toFixed(3)} >= t1 ${t1.toFixed(3)}).`);
    }
    cols.push({ f, t0, t1 });
  }

  for (let i = 0; i <= NT; i++) {
    for (let j = 0; j <= NF; j++) {
      const { f, t0, t1 } = cols[j];
      const t = t0 + (t1 - t0) * (i / NT);
      const h = hitAt(t, f);
      if (!h) { missed++; pos.push(0, 0, 0); continue; }
      /*
       * A hit far from the arm joint is not the arm — the swing has run past the shoulder and
       * found the CHEST. Mint spilling onto the torso is a defect the front elevation would show
       * plainly, but only after a render; this catches it at build time.
       */
      if (h.point.distanceTo(c) > headW * 1.1) {
        throw new Error(`mesh-identity: shoulder cap ray at swing ${(f * 180 / Math.PI).toFixed(0)}` +
          `deg hit ${h.point.distanceTo(c).toFixed(3)} m from the arm joint — that is the torso, ` +
          'not the shoulder. Narrow the swing window.');
      }
      const d = dirAt(t, f);
      pos.push(h.point.x + d.x * lift, h.point.y + d.y * lift, h.point.z + d.z * lift);
    }
  }
  if (missed > (NT + 1) * (NF + 1) * 0.02) {
    throw new Error(`mesh-identity: shoulder cap lost ${missed} of ${(NT + 1) * (NF + 1)} samples ` +
      '— the rays are not finding the arm.');
  }

  const idx = [];
  const at = (i, j) => i * (NF + 1) + j;
  for (let i = 0; i < NT; i++) {
    for (let j = 0; j < NF; j++) {
      /*
       * Wound so the patch faces OUTWARD, and the `side` flip is required because mirroring the
       * grid reverses its handedness. Getting it backwards costs the whole part with no other
       * symptom: the caps sat in exactly the right band, measured to within 2 mm of the art, and
       * rendered as nothing at all, because a front-face-only material draws neither side of an
       * inside-out surface. `assertFacesOut` below is the check, not the comment.
       */
      if (side > 0) idx.push(at(i, j), at(i, j + 1), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j));
      else idx.push(at(i, j), at(i + 1, j), at(i, j + 1), at(i, j + 1), at(i + 1, j), at(i + 1, j + 1));
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  /*
   * THE CONTROL. A skin laid on the outside of a limb must have its normals pointing away from
   * that limb's joint. Averaged over the patch this is unambiguous, and it is the one check that
   * distinguishes "invisible because it is inside-out" from "invisible because it is in the wrong
   * place" — two failures that look identical in a render and were both hit in this session.
   */
  const nrm = geo.attributes.normal;
  const vp = geo.attributes.position;
  const meanN = new THREE.Vector3();
  const meanOut = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  for (let i = 0; i < vp.count; i++) {
    meanN.add(tmp.fromBufferAttribute(nrm, i));
    meanOut.add(tmp.fromBufferAttribute(vp, i).sub(c));
  }
  if (meanN.dot(meanOut) <= 0) {
    throw new Error('mesh-identity: the shoulder cap is inside-out — its normals point back at ' +
      `the arm joint (dot ${meanN.dot(meanOut).toFixed(4)}). It would render as nothing.`);
  }
  return new THREE.Mesh(geo, mat);
}

/**
 * ===================== THE CHEST WORDMARK =====================
 *
 * The 4Humanity mark, printed from the LOCKED brand art via `mats.decal` — the same material the
 * procedural chest uses. Nothing here approximates a logo; `robot.js` already argues at length
 * that an approximated mark cannot be verified against the file, and that argument still holds.
 *
 * Three things have to be right, and each is measured rather than chosen:
 *
 *   HEIGHT   the donor puts its mark at 0.7310 H. That is a proportion of the FIGURE, which is
 *            what the art fixes, so it transfers directly.
 *
 *   WIDTH    NOT the donor's 0.2992 m. This chest is rounder, and a mark that wide would curl
 *            round the ribs where the donor's lay on a flat band. Sized instead as the donor's
 *            0.965 of the front-facing band, measured live on this body.
 *
 *   DEPTH    every vertex is raycast onto the actual chest surface. The procedural build solves
 *            the same problem with `chestFaceZ`, arithmetic that reproduces its own shell; a
 *            generated shell has no such formula, so the surface is sampled instead. Same result,
 *            same reason: a flat plane on a curved chest floats at the ends, and the ends of this
 *            mark are the '4' apex and the 'y' tail.
 *
 * ⚠️ `bone.attach()` NOT `bone.add()`. The geometry is built in WORLD coordinates, straight from
 * the raycasts, and the mesh's own transform is identity. `attach` preserves world transform, so
 * it computes exactly the local matrix that leaves every vertex where it was measured. That is
 * only true in BIND POSE — the rule this whole file opens with.
 */
function attachWordmark(rig, bones, mats, meshes, H, measured, at, reach, body) {
  const bone = bones.Spine ?? bones.Spine01 ?? bones.Spine02;
  if (!bone) {
    throw new Error('mesh-identity: no spine bone to hang the wordmark on — looked for ' +
      'Spine, Spine01, Spine02.');
  }

  const y = DONOR.decalYofH * H;
  // A body SIZE, not a world coordinate — see the note on `halfWidthAt`.
  const size = new THREE.Box3().setFromObject(rig).getSize(new THREE.Vector3());
  const limit = Math.max(size.x, size.z) * 0.5;
  const half = frontBandHalfWidth(meshes, y, limit, at);
  if (!(half > 0.02)) {
    throw new Error(`mesh-identity: the chest has no front-facing band at y ${y.toFixed(3)} ` +
      `(measured ${half.toFixed(4)} m). The wordmark cannot be seated.`);
  }

  const w = half * 2 * DONOR.decalOfBand;
  const h = w / brandAspect('wordmark');
  measured.decalW = w;
  measured.decalH = h;
  measured.decalY = y;
  measured.frontBandHalf = half;

  const geo = new THREE.PlaneGeometry(w, h, 40, 8);
  const p = geo.attributes.position;
  const lift = H * 0.0004;
  let missed = 0;
  for (let i = 0; i < p.count; i++) {
    // The plane is authored around its own origin; the chest it is printed on is at `at`.
    const vx = at.x + p.getX(i);
    const vy = y + p.getY(i);
    const hit = castAt(meshes, new THREE.Vector3(vx, vy, at.z + reach), new THREE.Vector3(0, 0, -1));
    if (!hit) { missed++; continue; }
    p.setX(i, vx);
    p.setY(i, vy);
    p.setZ(i, hit.point.z + lift);
  }
  /*
   * A miss means a vertex fired into empty space, so the plane is wider than the body it is being
   * printed on and part of the mark would hang in mid-air. Fail rather than ship a floating logo.
   */
  if (missed) {
    throw new Error(`mesh-identity: ${missed} of ${p.count} wordmark vertices found no chest ` +
      `surface at y ${y.toFixed(3)}, width ${w.toFixed(4)} m. The band measurement is wrong.`);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();

  const mark = new THREE.Mesh(geo, mats.decal);
  mark.name = 'wordmark';
  mark.castShadow = false;
  mark.receiveShadow = false;
  /*
   * SKINNED for the same reason the shoulder caps are. The chest is blended across `Spine`,
   * `Spine01` and `Spine02`, so a mark welded to a single spine bone slides across the shell as
   * the torso twists and sinks into it at the edges. Less violent than the shoulder because the
   * chest bends less, which is precisely why it would have shipped unnoticed and then been blamed
   * on the decal material.
   */
  skinToBody(mark, body, mats);
  return mark;
}

/**
 * @param {THREE.Object3D} rig    the loaded, scaled, grounded skinned GLB scene, in BIND POSE
 * @param {object} mats           unit4hMaterials() — the shared palette
 * @param {number} H              character height in metres
 */
export function attachIdentity(rig, mats, H = 1.7) {
  /*
   * ⚠️ MEASURE WITH THE BODY AT THE ORIGIN, THEN PUT IT BACK. This is not tidiness, it is a
   * three.js SkinnedMesh raycast defect that this asset's transform triggers.
   *
   * The GLB carries a scale pair — the SkinnedMesh node at 0.01 under an Armature at 100 — that
   * nets to identity, which is why the raw geometry is already in world coordinates. Raycasting a
   * SkinnedMesh runs the skinning, and the bone matrices ALREADY carry the rig's translation; the
   * mesh's own `matrixWorld` translation is then applied on top. Measured with the rig moved to
   * x = 0.75: the body's box is x 0.384..1.116, and a side ray reports its hit at x = 1.6265 —
   * 0.75 further out than the body extends, the offset counted twice.
   *
   * At the origin the double count is zero, so everything measured during development was correct
   * and everything measured off-centre was silently wrong. `mesh-animated.js` places the rig at
   * x = 0.75 in every view except `?solo=1`, which is the only one that had ever been captured, so
   * all three `MESH.bat` tabs failed while every development shot passed.
   *
   * Neutralising rotation too, for the same reason and because the game will rotate the player.
   * Y is left alone: the art bands are absolute heights and the character is already grounded.
   */
  const savedPos = rig.position.clone();
  const savedQuat = rig.quaternion.clone();
  rig.position.set(0, savedPos.y, 0);
  rig.quaternion.identity();
  rig.updateWorldMatrix(true, true);
  try {
    return attachIdentityAtOrigin(rig, mats, H);
  } finally {
    rig.position.copy(savedPos);
    rig.quaternion.copy(savedQuat);
    rig.updateWorldMatrix(true, true);
  }
}

function attachIdentityAtOrigin(rig, mats, H) {
  const bones = findBones(rig);
  const missing = ['Head', 'neck', 'LeftArm', 'RightArm'].filter((b) => !bones[b]);
  if (missing.length) {
    throw new Error(`mesh-identity: rig is missing bones ${missing.join(', ')} — this is not a ` +
      `Meshy humanoid rig, or the naming changed. Bones present: ` +
      `${Object.keys(bones).join(', ') || '(none)'}`);
  }

  /*
   * ⚠️ BONES CARRY THE SCALE THE GLB WAS LOADED WITH, so a prop parented to one inherits it. Sizes
   * below are in WORLD metres, so each is divided back out by the bone's own world scale — get
   * this wrong and the kit is out by whatever factor the mesh was normalised by, which for this
   * asset is 0.89 and looks almost right, the worst kind of wrong.
   */
  const worldScaleOf = (o) => {
    const s = new THREE.Vector3();
    o.getWorldScale(s);
    return (s.x + s.y + s.z) / 3 || 1;
  };

  const added = [];
  const add = (bone, mesh, name) => {
    const k = 1 / worldScaleOf(bone);
    mesh.scale.multiplyScalar(k);
    mesh.position.multiplyScalar(k);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    bone.add(mesh);
    added.push(name);
  };

  /**
   * Same, but the caller gives a WORLD point and the bone converts it. `add()` above treats the
   * position as a bone-local offset that only needs the scale divided out, which is fine for a
   * part whose position was chosen in bone space to begin with. Anything positioned from a
   * MEASURED surface arrives in world space and must be converted properly, or it inherits
   * whatever rotation the bind pose left on that bone.
   */
  const addAtWorld = (bone, mesh, name, worldPos) => {
    const k = 1 / worldScaleOf(bone);
    mesh.scale.multiplyScalar(k);
    bone.updateWorldMatrix(true, false);
    mesh.position.copy(bone.worldToLocal(worldPos.clone()));
    // Cancel the bone's own bind-pose rotation, so the part keeps the world orientation it was
    // built with: world = boneQuat * local, so local = inverse(boneQuat) * built.
    mesh.quaternion.premultiply(bone.getWorldQuaternion(new THREE.Quaternion()).invert());
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    bone.add(mesh);
    added.push(name);
  };

  // --- MEASURE THE ACTUAL BODY. Everything that touches a surface is sized off these, not off
  // --- `ART.headW * H`. See the note on `skullProfile` for why that constant was the wrong ruler.
  rig.updateWorldMatrix(true, true);
  const meshes = [];
  let body = null;
  rig.traverse((o) => {
    if (o.isSkinnedMesh || o.isMesh) meshes.push(o);
    if (o.isSkinnedMesh && !body) body = o;
  });
  if (!body) {
    throw new Error('mesh-identity: the rig carries no SkinnedMesh, so kit parts have no skeleton ' +
      'to bind to. This is not a rigged asset.');
  }
  const rigBox = new THREE.Box3().setFromObject(rig);
  /*
   * WHERE THE BODY IS, and every ray below is fired relative to it. Taken from the Head bone
   * rather than from the box centre: a box centre moves with a swinging arm or a stepping foot,
   * and the head is the landmark the skull measurement is about anyway.
   *
   * `reach` is a body SIZE, not a world coordinate — deriving it from `rigBox.max.x` made the ray
   * length depend on where the character happened to be standing.
   */
  const rigSize = rigBox.getSize(new THREE.Vector3());
  const reach = Math.max(rigSize.x, rigSize.y, rigSize.z) * 2 + 1;
  const headPos = bones.Head.getWorldPosition(new THREE.Vector3());
  const at = new THREE.Vector3(headPos.x, 0, headPos.z);

  /*
   * THE CONTROL FOR THE WHOLE MEASUREMENT LAYER. A raycast hit on this body must lie INSIDE this
   * body's bounding box. That is not a style rule — it is the one statement that is true of every
   * correct hit and false of the double-counted ones described above, and it holds no matter where
   * the character stands, which is exactly the axis the old checks could not see.
   *
   * Run before anything is built, so a broken measurement cannot reach geometry.
   */
  {
    const pad = Math.max(rigSize.x, rigSize.z) * 0.02;
    const probeY = (headPos.y + rigBox.max.y) * 0.5;      // mid-skull, always solid
    const probe = castAt(meshes, new THREE.Vector3(at.x + reach, probeY, at.z),
      new THREE.Vector3(-1, 0, 0));
    if (!probe) {
      throw new Error('mesh-identity: a side ray at head height hit nothing at all. The rig is ' +
        'not where its bounding box says it is.');
    }
    if (probe.point.x > rigBox.max.x + pad || probe.point.x < rigBox.min.x - pad) {
      throw new Error(`mesh-identity: a side ray reported its hit at x ${probe.point.x.toFixed(4)} ` +
        `on a body spanning x ${rigBox.min.x.toFixed(4)}..${rigBox.max.x.toFixed(4)}. The hit is ` +
        'outside the body — skinned raycasts are double-counting the rig transform.');
    }
  }

  const headBaseY = headPos.y;
  const skull = skullProfile(meshes, headBaseY, rigBox.max.y - 1e-4, reach, at);
  if (!skull) {
    throw new Error('mesh-identity: could not measure the skull — no side raycast hit the head ' +
      `between y ${headBaseY.toFixed(3)} and the crown ${rigBox.max.y.toFixed(3)}. The rig is ` +
      'not where its Head bone says it is.');
  }
  const headW = skull.maxHW * 2;

  /*
   * THE CONTROL. A measured head must be a plausible head. The art's is 0.174 H; anything outside
   * roughly half to double that means the raycast found an arm, a prop, or nothing, and every
   * dimension below would then be confidently wrong — which is exactly the failure this kit
   * already shipped once by trusting the constant.
   */
  if (!(headW > H * 0.09 && headW < H * 0.34)) {
    throw new Error(`mesh-identity: measured head width ${headW.toFixed(4)} m is not a head on a ` +
      `${H} m figure (art says ~${(ART.headW * H).toFixed(4)} m). The skull raycast hit something else.`);
  }
  const measured = { headW, headOfH: headW / H, artHeadW: ART.headW * H, bandY: skull.bandY };

  /*
   * --- EAR DISCS: a concentric boss either side of the skull, the art's most distinctive head
   * --- feature after the visor. Two rings so it reads as machined, not as a sticker.
   *
   * ⚠️ THE DISC IS SEATED ON THE MEASURED SKULL, NOT AT A FRACTION OF A NOMINAL HEAD. The old
   * code put it at `headW * 0.355` of the ART's head — 0.105 m — when this skull's surface is at
   * 0.123-0.129 m. Its outer face reached 0.112 m and the skull surrounding it reached 0.129 m,
   * so the entire boss sat INSIDE the head and the only thing on screen was the sliver crossing
   * the temple. "Reads smaller than the art's" was the symptom of a part that was mostly not
   * there, which is why making the number bigger would have been the wrong fix.
   *
   * Three derived quantities, in order:
   *   earY  — the middle of the skull's WIDEST band, which is where a disc sits on a head and
   *           also the only place it can seat evenly.
   *   earR  — the art's 45% of head width, against the head this body actually has.
   *   seatX — the NARROWEST half-width across the disc's own footprint. Seating on the widest
   *           point instead would lift the disc's top and bottom edges off the skull.
   */
  /*
   * ⚠️ THE DISC IS FLUSH, NOT A BOSS, AND THAT IS WHY THE FACE LOOKED SMALL.
   *
   * John: "the face still looks a little small compared to the art." Measured on a chroma capture
   * against the art, the visor read 0.618 of head width where the art reads 0.746. But the VISOR
   * was not the problem — measured against the SKULL alone it is 110 px of 142, i.e. 0.775, which
   * matches the art. The denominator was wrong: our head silhouette measured 178 px because the
   * ear discs stood proud of it. The row profile shows it as a step, 156 px to 175 px in four
   * rows, where the art's head is a smooth dome that never steps at all.
   *
   * `baseline_side-left.png` settles what the art actually has: a concentric ring INSET into the
   * flank of the skull, flush with the surface. Not a boss. So the disc now seats against the
   * skull's WIDEST half-width across its own footprint and stands barely proud of it, which keeps
   * the head's outline smooth in front elevation and leaves the ring reading from the side.
   *
   * Nothing about the visor changed. A part measured correctly can still read wrong because a
   * DIFFERENT part broke the silhouette it is judged against.
   */
  const earR = ART.earDia * headW * 0.5;
  const earD = ART.earDepth * headW;
  const earY = skull.bandY;
  const earProud = headW * 0.02;
  const earMax = skull.maxOver(earY - earR, earY + earR);
  const earOuterX = earMax + earProud;
  const seatX = earOuterX - earD * 0.5;
  measured.earY = earY;
  measured.seatX = seatX;
  measured.earOuterX = earOuterX;
  measured.skullMaxAtEar = earMax;

  /*
   * THE CONTROL. The art's head is a smooth egg in front elevation, so no head part may break its
   * silhouette by more than a hair. This is the check that would have caught the old boss without
   * needing a chroma capture and a row profile to find it.
   */
  if (earOuterX > earMax * 1.06) {
    throw new Error(`mesh-identity: the ear disc reaches x ${earOuterX.toFixed(4)} on a skull ` +
      `${earMax.toFixed(4)} wide at that band — it breaks the head's silhouette by ` +
      `${((earOuterX / earMax - 1) * 100).toFixed(1)}%. The art's head is a smooth dome.`);
  }

  /*
   * --- THE RING AND ITS WHITE CENTRE.
   *
   * ⚠️ NOTHING ABOUT THE SEATING CHANGED, DELIBERATELY. `earOuterX` is still the assembly's
   * outermost point and it is still `earMax + earProud`, so the silhouette guard above measures
   * the same quantity it measured before the shape changed. That guard is not decoration: a boss
   * standing proud of the skull made the head measure 178 px against the art's 155 and made the
   * FACE read small — a part measured correctly reading wrong because a DIFFERENT part broke the
   * silhouette it is judged against.
   *
   * The mesh origin now sits on the SKULL SURFACE rather than at the old cylinder's centre,
   * because the ring's profile is written with y = 0 there. `seatX` is kept and reported for one
   * reason: it is what `earOuterX - earD * 0.5` meant, and a reader comparing this to the old
   * build needs to see that the outer face has not moved.
   */
  const earSink = earD * EARRING.sink;
  const earDiscR = earR * EARRING.disc;
  const earDiscSet = capKnob('eardisc', EARRING.discSet);
  const earDiscX = earOuterX - earProud * earDiscSet;
  measured.earRingR = earR;
  measured.earDiscR = earDiscR;
  measured.earDiscX = earDiscX;
  measured.earSink = earSink;

  /*
   * THE CONTROL FOR THE WHITE CENTRE. It has to be a RECESSED disc inside a chrome ring, and there
   * are exactly two ways for that to fail silently: pushed out past the ring it becomes the plate
   * this round is removing, and pushed in behind the skull surface it vanishes and the ear is a
   * chrome ring around a hole. Both render as a plausible ear.
   */
  if (!(earDiscX > earMax && earDiscX < earOuterX)) {
    throw new Error(`mesh-identity: the ear's white disc sits at x ${earDiscX.toFixed(5)}, outside ` +
      `the band between the skull surface ${earMax.toFixed(5)} and the ring's outer face ` +
      `${earOuterX.toFixed(5)}. ${earDiscX <= earMax ? 'It is buried inside the head.'
        : 'It stands proud of the ring, which makes the ear a plate again.'}`);
  }

  for (const side of [-1, 1]) {
    const tag = side < 0 ? 'L' : 'R';
    const ring = new THREE.Mesh(
      earRingGeometry(earR, earProud, earSink, capKnob('earseg', 48)), mats.chrome);
    earFacesOut(ring.geometry, `ear${tag}`);
    // Lie the ring's outward axis (+Y) on the head's X, pointing away from the centre line — the
    // same two lines the old boss used, and the same reason the sign flips per side.
    ring.rotation.z = Math.PI / 2;
    if (side > 0) ring.rotation.z *= -1;

    /*
     * THE WHITE DISC, as a CHILD of the ring so it cannot drift from it. Its radius overlaps the
     * ring's inner wall by 2% so no hairline of daylight can open between two surfaces meeting on
     * the same cylinder, and it is a child rather than a sibling so `addAtWorld`'s scale division
     * — this bone carries the GLB's 0.01, which the kit divides out everywhere — reaches it
     * through the parent instead of being applied twice or not at all.
     */
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(earDiscR * capKnob('earinner', 1.02), 40), mats.shell);
    disc.rotation.x = -Math.PI / 2;                    // CircleGeometry faces +Z; aim it at +Y
    disc.position.y = earProud * (1 - earDiscSet);
    disc.name = `earDisc${tag}`;
    disc.castShadow = true;
    disc.receiveShadow = true;
    ring.add(disc);
    added.push(disc.name);

    addAtWorld(bones.Head, ring, `ear${tag}`, new THREE.Vector3(at.x + side * earMax, earY, at.z));

    /*
     * THE DELIVERED CHECK, and it is here because a correctly-derived number can still ship wrong.
     * Everything above reasons about `earOuterX`; this measures what was actually BUILT and
     * parented, disc included. A profile that reaches further than intended, or a disc that ends
     * up outside the ring, breaks the head's silhouette — and the silhouette guard runs on the
     * DERIVED number, so it would not notice.
     */
    ring.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(ring);
    const reachX = side < 0 ? at.x - box.min.x : box.max.x - at.x;
    if (Math.abs(reachX - earOuterX) > earOuterX * 0.01) {
      throw new Error(`mesh-identity: the built ear "${tag}" reaches ${reachX.toFixed(5)} m from the ` +
        `centre line but was seated to reach ${earOuterX.toFixed(5)} m — a ` +
        `${((reachX / earOuterX - 1) * 100).toFixed(1)}% miss. The silhouette guard above is ` +
        'checking a number the geometry does not honour.');
    }
    measured[`earReach${tag}`] = reachX;
  }

  // --- NECK: the ribbed column. The DARK GAP at each end is what actually reads at distance —
  // --- it is the trough in the width profile that the critic measured as absent.
  const nR = ART.neckDia * headW * 0.5;
  const nH = ART.neckH * headW;
  const col = new THREE.Mesh(new THREE.CylinderGeometry(nR, nR * 1.04, nH * 0.72, 20), mats.chrome);
  add(bones.neck, col, 'neckColumn');
  for (let i = 0; i < 3; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(nR * 1.05, nR * 0.10, 8, 22), mats.gap ?? mats.chrome);
    rib.rotation.x = Math.PI / 2;
    rib.position.y = (i - 1) * nH * 0.24;
    add(bones.neck, rib, `neckRib${i}`);
  }

  /*
   * --- MINT CAPS: the character's signature colour, and the one palette entry a bare generated
   * --- body can never supply.
   *
   * ⚠️ THE OLD VERSION WAS AN ELLIPSOID AT A BONE-LOCAL OFFSET, AND IT WAS WRONG THREE WAYS AT
   * ONCE — John's read was "in the wrong spot", and measured against the art it was:
   *
   *     too low    y 1.142..1.314 against the art's 1.182..1.314
   *     too tall   0.172 m against the art's 0.131 m
   *     too wide   0.208 m against the art's ~0.093 m, i.e. 124% oversize
   *
   * The offset `position.set(0, capR * 0.62, ...)` was meant to lift the cap onto the deltoid.
   * The arm bone's +Y points DOWN THE LIMB — measured, (0.187, -0.970, -0.158) — so it pushed the
   * cap down the bicep instead. A bone-local offset only means what you think it means if you
   * have checked which way that bone's axes point.
   *
   * ⚠️ AND THE ART'S CAP IS NOT A BLOB ON THE ARM, IT IS THE SHOULDER'S OWN OUTER SURFACE IN
   * MINT. That is why sizing a separate solid could never look right: too small and it is a
   * pimple, too large and it bulges past the silhouette, which is exactly the pair of failures on
   * screen. So the cap is built as a SHELL raycast onto the real shoulder — it cannot float and it
   * cannot bulge, because every one of its vertices is a point on the body.
   */
  for (const [boneName, side] of [['LeftArm', 1], ['RightArm', -1]]) {
    const cap = shoulderCap(bones[boneName], meshes, side, headW, H, rigBox.max.y, reach, mats.mint);
    cap.name = `mintCap${side < 0 ? 'R' : 'L'}`;
    cap.castShadow = true;
    cap.receiveShadow = true;
    // SKINNED, not bone-parented. A shoulder is the one place on this character where the two
    // differ visibly — see the note on `skinToBody`.
    skinToBody(cap, body, mats);
    added.push(cap.name);
  }

  /*
   * --- JOINT FIXTURES: the last three lines of `player-fine-detail-plan.md`, and the three the
   * --- shader deliberately does not attempt.
   *
   *   "A white round fixture, front and back, on each shoulder cap."
   *   "Chrome actuators slightly exposed at the outer and inner elbow, and the posterior knee."
   *   "Chrome showing in the foot crease."
   *
   * WHY THESE ARE GEOMETRY WHEN THE OTHER NINE WERE NOT. The plan's own rule: a recessed crease is
   * a HOLE and geometry sitting proud of the surface is the wrong answer for it, while an exposed
   * actuator is a PART and a painted disc is the wrong answer for that. The tell is the
   * silhouette — a painted actuator stays inside the limb's outline from every angle, and the
   * thing that makes an actuator read is that it BREAKS it.
   *
   * ⚠️ EVERY ONE IS SEATED BY RAYCAST, NOT BY A BONE-LOCAL OFFSET. This file already records what
   * a bone-local offset cost once: the mint cap was pushed DOWN THE BICEP because someone read the
   * arm bone's +Y as "up" when it points down the limb. A ray fired from outside the body cannot
   * make that mistake — it lands on the surface that is actually there, and hands back the normal
   * to orient against, so a part cannot float and cannot sink out of sight.
   *
   * ⚠️ WORLD AXES ARE USED FOR THE RAY DIRECTIONS AND THAT IS SAFE ONLY HERE. This function runs
   * at load, on the BIND POSE, before any mixer has touched the rig — which is the same assumption
   * every other ray in this file makes (see `frontBandHalfWidth`, which establishes that +Z is the
   * character's front). The OUT direction at a limb is not assumed: it is taken from the sign of
   * the joint's own offset from the body centre line, so it is right on both sides without a
   * convention.
   */
  {
    const S = H / 1.7;                      // every size below is metres on a 1.7 m character
    /*
     * Seat point and surface normal for a part pressed onto the body next to `near`.
     *
     * ⚠️ THE RAY IS FIRED FROM A SHORT STANDOFF, NOT FROM `reach`, AND THE FIRST BUILD PROVED WHY.
     * `castAt` returns the FIRST surface along the ray. Fired from `reach` away — two body
     * diameters — the inner-elbow ray starts on the far side of the character and hits the
     * OPPOSITE FLANK of the torso before it ever reaches the elbow. That build seated two chrome
     * bosses in mid-air beside the chest, and nothing threw: the raycast succeeded, the count
     * reached 12, and the only thing wrong was the picture.
     *
     * So the standoff starts just outside a limb and grows only if it must, and every hit is
     * checked against `maxDist` from the joint it was supposed to land on. A surface further away
     * than a limb is thick is, by construction, the wrong surface — and rejecting it turns a
     * floating blob into the fixture count failing, which is an error someone reads.
     */
    /*
     * ⚠️ `?fixmax=` EXISTS SO THE COUNT GUARD BELOW CAN BE WATCHED FAILING, which is this
     * project's standing rule and is not satisfied by a guard that has only ever passed.
     * `?fixmax=0.001` shrinks the accept radius under any real surface distance, every ray is
     * rejected, and the fixture count throws — that is the picture of the guard working. It is a
     * CONTROL rather than a knob; nothing that ships passes it.
     */
    const fixMax = capKnob('fixmax', 1.0);
    /*
     * ⚠️ THESE TWO KNOBS CHANGE NOTHING BY DEFAULT AND THAT IS THE POINT — they are the
     * instrument that RULED SHADOWING OUT, kept so nobody has to suspect it twice.
     *
     * Shadow-map self-occlusion was the best hypothesis for "the white fixture reads as a dark
     * hole", and it was a good one: the character's shadow map is sized for a 1.7 m body, one of
     * its texels is far wider than a 40 mm boss, and a part that lands inside its own shadow
     * texel shadows itself entire. It also explained the one fact that had misled two previous
     * rounds — the part is equally dark at azim 0 / 90 / -90 / 180, and since the camera orbits
     * while THE KEY LIGHT DOES NOT, a constant value across all four is evidence for a
     * light-space cause rather than against one.
     *
     * MEASURED, and it is wrong: `?fixcast=0&fixrecv=0` renders PIXEL-IDENTICAL to `1&1` at the
     * fixture, at 10x. Not "close" — identical. So shadowing contributes nothing here and the
     * defaults below leave `addAtWorld`'s behaviour exactly as it was. The real cause was the
     * shell's render-time panel network; see the block below.
     */
    const fixCast = capKnob('fixcast', 1) > 0;
    const fixRecv = capKnob('fixrecv', 1) > 0;
    const fixtureShadows = (m) => { m.castShadow = fixCast; m.receiveShadow = fixRecv; };

    /*
     * ============================================================================================
     * ⚠️ WHY THE WHITE SHOULDER FIXTURE PHOTOGRAPHED AS A DARK HOLE, AND IT WAS NEVER THE SHAPE.
     * FIXED UPSTREAM 2026-08-17; the local mitigation that used to live here is gone and the
     * bosses are back on the shared `mats.shell`. The history is kept because the wrong answer
     * was believed for three rounds and is easy to arrive at again.
     *
     * This defect survived TWO shape rewrites — flat-topped cylinder, then dome — because both
     * times the picture was read as a form failure and the form was redrawn. It is not a form
     * failure, and it is not `addAtWorld` parenting the part as a plain `THREE.Mesh` either.
     *
     * THE WRONG ANSWER, WHICH THIS BLOCK USED TO ASSERT: `shellWhite` injects a body shader whose
     * family varyings come from SKIN WEIGHTS, a kit part is not skinned, so it reads unwritten
     * varyings and lands dark. It is a good story, it fits every symptom, and it is FALSE.
     * `RRW_BONE_VERT` already initialises all four varyings outside its `#ifdef USE_SKINNING`,
     * and zeroing `uRRWDark` — the master for every varying-driven mask — moves the boss's pixel
     * by exactly 0. The evidence that convicted it was `material.clone()` brightening the part,
     * and a clone drops the whole injection, so it could not tell one term inside it from another.
     *
     * THE REAL CAUSE, MEASURED WITH `harness/_hubs2-uni.mjs` (one uniform zeroed at a time, the
     * delivered pixel read back) — capFixtureFR, azim 0, on the shared material:
     *
     *   shipped                 ( 77, 75, 65)     the dark hole
     *   uRRWSeam    = 0         (161,157,145)   +84   the render-time panel network
     *   uRRWOcc     = 0         (101, 98, 86)   +24
     *   uRRWOn      = 0         (192,189,178)  +115   the whole injection
     *   uRRWDark    = 0         ( 77, 75, 65)     0   the skinning varyings, doing nothing
     *
     * The network sizes its plates in METRES and clamps to a minimum of one cell. A 40 mm boss is
     * far smaller than the 26 cm plate, so the clamp pinned one cell over the whole part and the
     * 14.5 mm groove swallowed it. The fix is in `src/materials/surfaces/robot.js` (search
     * `rrwSFit`): the network now fades out where a whole plate does not fit, which is inert on
     * every surface at or above one plate — the body included. `?rseamfit=0` is the picture of
     * the defect, and it is the control that replaces this block's `?fixinject=1`.
     *
     * The ruled-out list, because each of these was the obvious answer and each cost a probe:
     *   shape       — rewritten twice, no change in value
     *   burial      — `?fixboss` 8/14/19 mm: the circle GROWS and stays flat, so it is exposed
     *   shadowing   — `?fixcast=0&fixrecv=0` renders pixel-identical
     *   albedo/ORM  — `_hubs1-shellmap.mjs`: luma 237 across the whole map, ORM identical to the
     *                 white plate two millimetres away
     *   uv window   — the fixture samples uv 0..1 where the body samples only u 0.32..0.68. A real
     *                 asymmetry, and the map read back proves it is harmless. ⚠️ AND IT IS THE
     *                 SAME FACT THE REAL CAUSE TURNS ON — a part carrying its own 0..1 unwrap is
     *                 what makes its metres-per-uv two orders of magnitude off the body's. The
     *                 probe that "cleared" it only proved the MAP was innocent, not the unwrap.
     *   skinning    — the varyings above; zeroing their master changes nothing
     *
     * ⚠️ THE BOSSES ARE WEATHERED NOW, WHICH IS THE POINT AND IS NOT A REGRESSION TO CHASE. On
     * the shared material capFixtureFR delivers (161,157,145) where the un-injected clone gave
     * (192,189,178). The remaining 31 is grime, the cavity term and screen AO — the same system
     * that dresses the plate around it, which the clone had opted the part out of.
     * ============================================================================================
     */
    const seat = (near, dir, maxDist = 0.10) => {
      maxDist *= fixMax;
      const d = dir.clone().normalize();
      for (const standoff of [0.09, 0.15, 0.24, 0.40]) {
        const hit = castAt(meshes, near.clone().addScaledVector(d, standoff * S), d.clone().negate());
        if (hit && hit.point.distanceTo(near) <= maxDist * S) return hit;
      }
      return null;
    };
    /**
     * A round fixture standing `proud` above the surface it seats on. Built +Y-up and then
     * rotated onto the measured normal, so it sits square to the body rather than square to a
     * bone whose axes nobody has checked.
     *
     * ⚠️ THE SHAPE IS A DOME AND `domeBossGeometry`'s header IS THE REASON — the flat-topped
     * cylinder this used to build photographed as a dark round hole in the mint, which is the
     * opposite value to the one the spec names. Note there is no `- h * 0.5` fudge any more: the
     * profile carries its own standoff, so the mesh origin goes on the hit point exactly and
     * `proud` means what it says, the height of the apex above the body.
     */
    const seatBoss = (bone, near, dir, r, proud, mat, name, maxDist) => {
      if (!bone) return false;
      const hit = seat(near, dir, maxDist);
      if (!hit) return false;
      const geo = domeBossGeometry(r * S, proud * S, capKnob('fixseg', 28));
      earFacesOut(geo, name);
      // ...on the SHARED material, weathering and all — see the block above for the three rounds
      // it took to work out why this part used to need its own un-injected copy.
      const m = new THREE.Mesh(geo, mat);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hit.normal);
      addAtWorld(bone, m, name, hit.point.clone());
      fixtureShadows(m);
      return true;
    };

    /**
     * The same, as an exposed ACTUATOR — a closed machined hub rather than a boss.
     *
     * ⚠️ THE HISTORY OF THIS SHAPE, WHICH HAS NOW FAILED TWICE, IS ON `jointBezelGeometry` AND IS
     * WORTH THE THIRTY SECONDS: discs read as holes because chrome is only what it reflects, tori
     * fixed that and read as bores because you can see through them, and the profile now keeps the
     * torus cross-section as the rim and closes the middle with a domed solid hub.
     *
     * `R` is the OUTER radius of the finished part — the old signature's `R + tube` — so the
     * footprint is stated once instead of being the sum of two numbers.
     */
    const seatRing = (bone, near, dir, R, proud, mat, name, maxDist) => {
      if (!bone) return false;
      const hit = seat(near, dir, maxDist);
      if (!hit) return false;
      const geo = jointBezelGeometry(R * S, proud * S,
        capKnob('fixhub', BEZEL.hubRise), capKnob('fixseg', 32));
      earFacesOut(geo, name);
      const m = new THREE.Mesh(geo, mat);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hit.normal);
      addAtWorld(bone, m, name, hit.point.clone());
      fixtureShadows(m);
      return true;
    };

    const world = (b) => b.getWorldPosition(new THREE.Vector3());
    /** Away from the body's centre line, from the joint's own position. No left/right convention. */
    const outward = (p) => new THREE.Vector3(Math.sign(p.x - at.x) || 1, 0, 0);
    const FRONT = new THREE.Vector3(0, 0, 1);
    const BACK = new THREE.Vector3(0, 0, -1);
    let fitted = 0;

    for (const side of ['Left', 'Right']) {
      const arm = bones[`${side}Arm`];
      const fore = bones[`${side}ForeArm`];
      const thigh = bones[`${side}UpLeg`];
      const shin = bones[`${side}Leg`];
      const foot = bones[`${side}Foot`];
      const tag = side[0];

      /*
       * THE SHOULDER FIXTURES. Seated against the SHOULDER JOINT rather than against the mint
       * cap's own geometry, because the cap is a raycast SHELL of the body — its surface IS the
       * body's surface, so a ray fired at the joint lands on the same place either way, and the
       * joint is available whether or not the cap was built.
       *
       * ⚠️ WHITE, NOT CHROME, and the spec is specific about it. The fixture reads BECAUSE it is
       * the same value as the plate and a different form; make it chrome and it competes with the
       * mint for the eye at exactly the point of the figure the silhouette is already busiest.
       */
      /*
       * ⚠️ AND THE PROUDNESS HAS TO CLEAR THE CAP, WHICH IS NOT THE BODY. `shoulderCap` builds its
       * shell standing `headW * 0.014` — about 3.6 mm — off the same surface these rays measure.
       * The first build stood the fixture 6 mm proud of the BODY, i.e. 2.4 mm proud of the cap it
       * is supposed to sit on, and it photographed as a dark ROUND HOLE in the mint rather than a
       * white boss: mostly buried, with only its unlit flank showing. 14 mm clears the cap by a
       * full centimetre and reads as a fitting.
       *
       * The ray still measures the BODY and not the cap, deliberately — the cap is a raycast shell
       * of that same surface, so the body is the stable reference, and this way the fixture is
       * placed identically whether or not the cap was built at all.
       */
      if (arm) {
        const p = world(arm);
        const R = 0.020, PR = capKnob('fixboss', 0.014);
        if (seatBoss(arm, p, FRONT, R, PR, mats.shell, `capFixtureF${tag}`, 0.14)) fitted++;
        if (seatBoss(arm, p, BACK, R, PR, mats.shell, `capFixtureB${tag}`, 0.14)) fitted++;
      }

      /*
       * THE ELBOW ACTUATORS, outer and inner. Parented to the UPPER ARM, not the forearm: an
       * actuator is part of the joint's housing and the housing does not swing with the forearm.
       * Parented the other way they would sweep through the bicep on the attack clip.
       */
      if (fore && arm) {
        const p = world(fore);                       // the forearm's origin IS the elbow
        const out = outward(p);
        /*
         * The radii below are the old torus's OUTER extent, `R + tube`, so the footprint on the
         * limb is unchanged and only the shape inside it is. `proud` came down about a fifth: the
         * torus's height was set by its tube and a solid hub does not need it. Wide and shallow is
         * what makes a watch case read as machined into the limb rather than stuck on it, and
         * "poking sideways out of the outline" was half the note.
         */
        if (seatRing(arm, p, out, 0.029, 0.0090, mats.chrome, `elbowActO${tag}`)) fitted++;
        if (seatRing(arm, p, out.clone().negate(), 0.021, 0.0068, mats.chrome,
          `elbowActI${tag}`)) fitted++;
      }

      // THE POSTERIOR KNEE. Parented to the thigh for the same housing argument as the elbow.
      if (shin && thigh) {
        if (seatRing(thigh, world(shin), BACK, 0.032, 0.0095, mats.chrome,
          `kneeAct${tag}`)) fitted++;
      }

      /*
       * THE FOOT CREASE. Parented to the FOOT and not the shin, which is the opposite of the two
       * above and is not an inconsistency: the spec's phrase is "chrome showing in the crease",
       * i.e. it belongs to the boot's own ankle collar, and it has to stay put on the boot when
       * the ankle pitches through a stride.
       */
      if (foot) {
        if (seatRing(foot, world(foot), BACK, 0.021, 0.0068, mats.chrome,
          `ankleAct${tag}`)) fitted++;
      }
    }

    /*
     * ⚠️ THE CONTROL, AND IT IS THE ONE THIS FILE'S HISTORY DEMANDS. Every part above is placed by
     * a RAYCAST, and a raycast that MISSES returns null — at which point `seatBoss` quietly
     * declines and the character renders exactly as it did before, with no error and no gap. That
     * is the same silent shape as the ray bug this file already records, where every ray was fired
     * down x = 0 and missed a body standing at x = 0.75 while three MESH.bat tabs rendered a
     * plausible robot. Counting the seated parts and failing on a shortfall is what makes "the
     * fixtures are on" a checked statement rather than an assumed one.
     */
    const wanted = 12;   // 2 shoulder + 2 elbow + 1 knee + 1 ankle, both sides
    if (fitted !== wanted) {
      throw new Error(`mesh-identity: only ${fitted} of ${wanted} joint fixtures found a surface to `
        + 'seat on. A raycast that misses returns null and the part is silently skipped, so the '
        + 'character would render as if this feature had never been written. Check that the rig '
        + 'carries ForeArm/UpLeg/Leg/Foot bones and that the body is where the rays are aimed.');
    }
    measured.jointFixtures = fitted;
  }

  /*
   * --- FACE: the single most identifying thing on this character, and the one the generated
   * head cannot supply because a generator returns a smooth skull. `faceplate()` bakes the
   * visor, eyes and mouth into one material, so this is a PLATE, not geometry — a slightly
   * domed disc sat on the front of the skull carrying that material.
   *
   * ⚠️ IT IS DOMED AND IT IS SET PROUD, both deliberately. A flat plate on a curved skull leaves
   * a crescent of daylight at the edges, and a plate flush with the surface z-fights the shell
   * it is lying on. The mesh-shell experiment already paid for both lessons.
   */
  /*
   * --- FACE: THE RIG'S OWN VISOR GEOMETRY, NOT A SPHERE CAP.
   *
   * ⚠️ THE UVs ARE THE WHOLE POINT AND A GENERIC CAP CANNOT HAVE THEM. `faceplate()` bakes the
   * visor, both eyes and the mouth into ONE material, mapped against `visorCap()`'s layout —
   * uv 0..1 spans +/-54 degrees of the head sphere (`unit4h.js`, see the UV note on visorCap).
   * A `SphereGeometry` cap carries sphere UVs instead, so the eyes land off the visible area and
   * the plate renders as a BLANK BLUE SHIELD. That is exactly what the first attempt produced,
   * and no amount of moving or rescaling it would ever have put a face on it.
   *
   * Rather than export `visorCap` and the four internals it needs (`headBox`, `headR`, `VISOR`,
   * `headStretch`), borrow the FINISHED mesh: `buildUnit4H` already builds one correctly. Take
   * its geometry and its transform relative to the rig's own head joint, and hang that off the
   * generated skeleton's Head bone. One donor build, discarded immediately.
   */
  const donor = buildUnit4H({ height: H });
  donor.root.updateWorldMatrix(true, true);
  let donorFace = null;
  donor.root.traverse((o) => {
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (o.isMesh && (o.name === 'faceplate' || m?.name === 'unit4h.faceplate')) donorFace = o;
  });
  if (!donorFace) {
    throw new Error('mesh-identity: buildUnit4H produced no faceplate mesh to borrow — look for ' +
      "a mesh named 'faceplate' or one carrying material 'unit4h.faceplate'.");
  }

  // Its pose RELATIVE TO THE DONOR'S HEAD JOINT transfers to any head bone, because both rigs
  // put that joint at the base of the skull on a 1.7 m character.
  donorFace.updateWorldMatrix(true, false);
  donor.joints.head.updateWorldMatrix(true, false);
  const rel = new THREE.Matrix4()
    .copy(donor.joints.head.matrixWorld).invert()
    .multiply(donorFace.matrixWorld);

  /*
   * ⚠️ THE PLATE'S WIDTH IS NOW DERIVED, AND IT USED TO BE 1.12 BECAUSE NOBODY HAD MEASURED IT.
   *
   * The open hate was "the visor plate runs to the head's edges where the art has a white bezel
   * around it", and that is checkable rather than arguable. The donor's own visor is 0.7835 of
   * its head width — a build already signed off against the art. At scale 1.12 on this narrower
   * skull the plate came to 0.2489 m across a 0.2582 m head: a ratio of 0.964. There was no bezel
   * because there was no room for one, and the plate was 23% too wide for its face.
   *
   * Scaling to the donor's ratio makes the bezel mostly by subtraction — the white shell around
   * the plate IS the bezel on the procedural build. The raised ring below then states it, so it
   * reads as machined rather than as a small visor floating on a blank face.
   */
  const donorFaceW = new THREE.Box3().setFromObject(donorFace).getSize(new THREE.Vector3()).x;
  const visorTargetW = ARTREF.visorOfSkull * headW;
  measured.visorW = visorTargetW;
  measured.visorOfHead = ARTREF.visorOfSkull;

  /*
   * ⚠️ SCALING A PLATE WHOSE ORIGIN IS NOT ITS CENTRE ALSO MOVES IT. The donor faceplate's
   * geometry origin sits at the head's centre, not on the plate, so dropping the factor from 1.12
   * to ~0.91 would drag the plate back toward the middle of the skull and undo the two tuned
   * offsets below. Compensate exactly: hold the plate's centre still and change only its size.
   */
  donorFace.geometry.computeBoundingBox();
  const plateC = donorFace.geometry.boundingBox.getCenter(new THREE.Vector3());
  const holdCentre = (m, from, to) => {
    m.position.add(plateC.clone().multiply(m.scale).multiplyScalar((from - to) / from)
      .applyQuaternion(m.quaternion));
    m.scale.multiplyScalar(to / from);
  };

  /*
   * The skull's centre, for the bezel's projection. Derived, not assumed: the widest band gives
   * the height, and a ray in from the front plus a ray in from the back give the depth. Taking
   * the Head BONE as the centre would push the bezel's projection off, because that joint sits at
   * the base of the skull rather than in the middle of it.
   */
  const zF = castAt(meshes, new THREE.Vector3(at.x, skull.bandY, at.z + reach), new THREE.Vector3(0, 0, -1));
  const zB = castAt(meshes, new THREE.Vector3(at.x, skull.bandY, at.z - reach), new THREE.Vector3(0, 0, 1));
  if (!zF || !zB) {
    throw new Error('mesh-identity: could not find the front and back of the skull at y ' +
      `${skull.bandY.toFixed(3)} — the bezel has no centre to project from.`);
  }
  const headCentre = new THREE.Vector3(at.x, skull.bandY, (zF.point.z + zB.point.z) * 0.5);
  measured.headCentreZ = headCentre.z;
  // The direction the face looks. Straight ahead: the plates' own silhouette is what the art
  // measures, and the art is a front elevation, so this is the axis the width must be preserved
  // across. Backwards, because rays travel INTO the head.
  const faceForward = new THREE.Vector3(0, 0, -1);

  const kFace = 1 / worldScaleOf(bones.Head);
  const plate = (mat, scaleTo, sink, name, conform = false) => {
    const m = new THREE.Mesh(donorFace.geometry, mat);
    m.applyMatrix4(rel);
    /*
     * ⚠️ TWO TUNED OFFSETS, AND THEY ARE THE ONLY EYEballED NUMBERS IN THIS FILE.
     *
     * The relative transform transfers the plate's ORIENTATION perfectly but not its height,
     * because the two rigs do not put their head joint at the same place on the skull: unit4h's
     * sits 0.127 m below the visor centre, and Meshy's Head bone sits lower still, which drops
     * the face onto the jaw. Z is forward because the generated skull is the deeper of the two,
     * so a plate at the rig's own depth sinks into it.
     *
     * Both are read off the capture rather than derived — there is no shared landmark to derive
     * them from — so they are stated as tuned, not disguised as measurements.
     *
     * ⚠️ THEY ARE DELIBERATELY WRITTEN AGAINST `ART.headW * H`, NOT AGAINST THE MEASURED HEAD.
     * They were tuned by eye on a 0.2958 m ruler. The measured skull is 0.2582 m, so re-basing
     * them would silently drop the face 11 mm down the jaw — a change nobody asked for, arriving
     * as a side effect of fixing the ear discs.
     */
    m.translateY(ART.headW * H * 0.30);
    m.translateZ(ART.headW * H * 0.10);
    holdCentre(m, 1, scaleTo);
    // Only the un-conformed path uses `sink` as a setback; a conformed part gets it as the lift
    // that holds it proud of the surface, and setting it back first would only bend the rays.
    if (sink && !conform) m.translateZ(-sink);
    m.name = name;
    m.castShadow = true;
    m.receiveShadow = true;
    /*
     * PARENT FIRST, ALWAYS. The plate's frame is relative to the head JOINT, not to the world, so
     * `kFace` plus `Head.add()` is what puts it on the character at all. A conformed part needs
     * that to have happened before it can be measured against the body — see the warning on
     * `conformToSurface`.
     */
    m.scale.multiplyScalar(kFace);
    m.position.multiplyScalar(kFace);
    bones.Head.add(m);

    if (conform) {
      conformToSurface(m, meshes, headCentre, sink, reach, faceForward);
      assertOnHead(m, skull, headBaseY, rigBox.max.y, headCentre);
      // The geometry is world-space now, so `attach()` — which preserves world transform — solves
      // for exactly the local matrix that leaves every vertex where it was measured.
      bones.Head.attach(m);
      m.frustumCulled = false;
    }
    added.push(name);
    return m;
  };

  /*
   * --- THE BEZEL, and it is built from the VISOR'S OWN GEOMETRY on purpose.
   *
   * The art's bezel is a white frame that follows the visor's outline. A torus cannot follow it —
   * the plate is 0.222 wide by 0.248 tall and its rim is not a circle. A slightly larger copy of
   * the same domed plate follows it by construction, at every point, and stays correct if the
   * visor is ever reshaped. Shell white, sunk a few millimetres so the visor sits proud of it
   * rather than z-fighting the surface it lies on.
   */
  /*
   * BOTH PLATES ARE CONFORMED, and the visor needed it as badly as the bezel did. With only the
   * bezel fixed, the `alert` clip's turned head showed the same fin in BLUE — the visor is the
   * same donor plate with the same donor curvature, so of course it hung off the same skull.
   * Conforming does not soften the face: projecting from the head centre preserves every vertex's
   * ANGLE, so the plate keeps its outline and its UVs, and only its curvature changes.
   *
   * The visor stands proud of the bezel by the difference of these two lifts, which is what makes
   * the bezel read as a frame rather than as a white halo painted round a decal.
   */
  /*
   * ⚠️ THE SCALE IS SOLVED AGAINST THE DELIVERED WIDTH, NOT SET ONCE. This is the fix for
   * "comedically small", and the mechanism is worth stating because it will bite any other part
   * that is both scaled and conformed.
   *
   * Conforming projects each vertex outward from the head centre onto the skull, which preserves
   * its ANGLE, not its distance from the centre line. The plate is built standing PROUD of the
   * face, so it sits FURTHER from the head centre than the skull surface does — and a projection
   * onto a nearer surface lands INSIDE the outline it started from. Set to 0.78 of head width, the
   * visor shipped at 0.529: a 32.5% shortfall that no amount of staring at the constant explains,
   * because the constant was correct. John called it by eye before any of this was measured.
   *
   * Rather than model the projection, measure it: build, conform, measure, correct, repeat. Three
   * passes take it inside a quarter of a percent, and it stays right if the skull ever changes.
   */
  const solvePlate = (mat, target, lift, name, ofVisor = 1) => {
    let scale = (target * ofVisor) / donorFaceW;
    let got = 0;
    for (let pass = 0; pass < 4; pass++) {
      const m = plate(mat, scale, lift, name, true);
      got = m.geometry.boundingBox.max.x - m.geometry.boundingBox.min.x;
      if (Math.abs(got - target * ofVisor) / (target * ofVisor) < 0.0025) return { m, scale, got };
      m.removeFromParent();
      added.pop();
      scale *= (target * ofVisor) / got;
    }
    /*
     * Not converging means the target is not reachable — the projection saturates at the skull's
     * own width, so asking for a visor wider than the head can never be satisfied. Fail loudly
     * rather than ship whatever the last pass happened to produce.
     */
    throw new Error(`mesh-identity: could not size "${name}" to ${(target * ofVisor).toFixed(4)} m ` +
      `on a ${headW.toFixed(4)} m head — closest was ${got.toFixed(4)} m after 4 passes.`);
  };

  const bezelOfVisor = 1.13;
  const bez = solvePlate(mats.shell, visorTargetW, headW * 0.008, 'visorBezel', bezelOfVisor);
  const vis = solvePlate(mats.face, visorTargetW, headW * 0.026, 'faceplate');
  measured.bezelW = bez.got;
  measured.visorDelivered = vis.got;
  measured.visorDeliveredOfHead = vis.got / headW;

  attachWordmark(rig, bones, mats, meshes, H, measured, at, reach, body);
  added.push('wordmark');

  return { added, bones: Object.keys(bones), measured };
}

/**
 * THE CHEST WORDMARK, ON ITS OWN.
 *
 * John asked for the 4Humanity logo on the Friendly Robot, which arrives with its face, ears and
 * shoulder caps already painted into its baked texture. It needs the mark and nothing else.
 *
 * ⚠️ THE OBVIOUS ROUTE — run `attachIdentity` and delete the parts you did not want — WAS BUILT
 * AND IT DOES NOT WORK. The kit throws long before it reaches the wordmark:
 *
 *     mesh-identity: shoulder cap ray at swing 54deg hit 0.611 m from the arm joint
 *                    — that is the torso, not the shoulder.
 *
 * That assertion is correct and worth keeping. It encodes the Lumi Bot's proportions, and this
 * body is a different shape, so a cap sized for one lands on the other's chest. Loosening it to
 * get at the wordmark would trade a loud failure for a wrong shoulder cap on the old body.
 *
 * So this reproduces only the measurement setup `attachWordmark` actually consumes — the bones,
 * the mesh list, the body's own `reach` and the `at` landmark — and calls it. It shares the
 * function itself rather than a copy of it, so the seating rules stay in one place.
 */
export function attachChestWordmark(rig, mats, H = 1.7) {
  const bones = findBones(rig);
  const spine = bones.Spine ?? bones.Spine01 ?? bones.Spine02;
  if (!spine) {
    throw new Error('mesh-identity: no spine bone to hang the wordmark on. Bones present: ' +
      `${Object.keys(bones).join(', ') || '(none)'}`);
  }

  rig.updateWorldMatrix(true, true);
  const meshes = [];
  let body = null;
  rig.traverse((o) => {
    if (o.isSkinnedMesh || o.isMesh) meshes.push(o);
    if (o.isSkinnedMesh && !body) body = o;
  });
  if (!body) {
    throw new Error('mesh-identity: the rig carries no SkinnedMesh, so the wordmark has no ' +
      'skeleton to bind to. This is not a rigged asset.');
  }

  const rigSize = new THREE.Box3().setFromObject(rig).getSize(new THREE.Vector3());
  const reach = Math.max(rigSize.x, rigSize.y, rigSize.z) * 2 + 1;
  const headPos = (bones.Head ?? spine).getWorldPosition(new THREE.Vector3());
  const at = new THREE.Vector3(headPos.x, 0, headPos.z);

  const measured = {};
  attachWordmark(rig, bones, mats, meshes, H, measured, at, reach, body);
  return { added: ['wordmark'], measured };
}
