import * as THREE from 'three';
import { sconce, candelabra, driveFlicker } from './practicals.js';
import { glowPatch } from './volumetric.js';
import { FixtureBin } from './fixture-merge.js';
import { ceilScale } from './gallery-rig.js';
import { buildChandelier } from '../world/chandelier.js';

/**
 * THE PLAYABLE BALLROOM'S PRACTICAL RIG — MERGED MESHES, **ZERO** ADDED LIGHTS.
 *
 * Third use of `fixture-merge.js`, which is the point of it existing. `estate-spike-1` priced the
 * showcase's unmerged practicals at **+184 draw calls on one room** against a 625 ceiling;
 * `estate-1` merged the gallery's 200 objects into 5 meshes and `estate-2` the study's 19 and 26
 * into 5 each. This is the arrangement for the biggest room in the house, and the one with the
 * most fixture in it: three crystal chandeliers, sconces on every pier, two candelabra.
 *
 * ---------------------------------------------------------------------------
 * 🔦 THE LIGHT COUNT IS **0**, AND THAT IS A DECISION WITH THREE SEPARATE ARGUMENTS
 *
 * The gallery bought 2 and each study bought 1, so the house runs **14 point + 1 spot + 1
 * hemisphere** today. This room adds none, and it is the room with the strongest case for
 * adding some — which is exactly why the reasoning is written down rather than assumed.
 *
 *   1. **THE ONE THING A DECAL CANNOT BUY IS ALREADY BOUGHT HERE, AND IT IS THE KEY.** The
 *      gallery's two points exist for *"a real falloff on the brass so a sconce reads as an
 *      object"* and a warm/cool split; the study's one exists because *"a hemisphere has no
 *      direction, so a 30 mm step and a flat field return the same value"* on the chimneypiece
 *      carving. The ballroom's equivalent — directional light with a real shadow, raking a
 *      carved thing — is the SHADOW-CASTING KEY, which this room already has and which
 *      `spaces.js` aims across the colonnade. Nothing here is a second instance of that need.
 *   2. **A LIGHT IS PAID BY EVERY FRAGMENT IN EVERY ROOM, AND THIS ROOM IS THE FILL PROBLEM.**
 *      `_price-pointlight.mjs` prices one point at **+0.112 ms** and `distance` culls a point
 *      light's CONTRIBUTION, never its cost. The ballroom is now 27.2 x 15.3 x **9.6** — a third
 *      taller than it was — so it already puts more fragments on screen than any other station.
 *      Adding fragment-loop iterations to the room whose problem is fragments is the wrong knob.
 *   3. 🚨 **AND IT IS WHAT MAKES THE A/B HONEST.** With zero added lights, `?estate=port` and
 *      `?estate=port,noballroom` have an IDENTICAL program set — `numPointLights` never moves —
 *      so every millisecond of the delta is geometry and fill and none of it is a recompile or a
 *      different shader. That is a measurement-quality argument, not a budget one, and it is the
 *      reason this number was chosen before the round was measured rather than after.
 *
 * Everything the showcase's 19 point lights buy, this rig buys with EMISSIVE GEOMETRY and MERGED
 * GLOW DECALS: the chandeliers' candle cores, the sconce candles, the `clere` daylight glazing
 * (which IS a light source), the pools each window lays on the floor, the wash under the
 * musicians' gallery. One draw call each and no light budget at all.
 *
 * ⚠️ `?estate=port,bp1` / `bp2` / `bp3` re-prices the choice rather than arguing it, and `bp0` is
 * the default. The spec below is ordered so `bp1` is the single most defensible one to add.
 *
 * ---------------------------------------------------------------------------
 * 🚨 WHAT `beams-1` FOUND ON 2026-08-09, AND IT IS WHY THE NUMBERS IN THIS FILE LOOK LARGE
 *
 * Two measured facts that change how a 9.6 m ceiling can be lit at all:
 *
 *   · **There is a HARD BLACK POINT at scene-linear radiance 0.030 and the GRADE creates it.**
 *     `src/post/shaders.js` applies `col = (col - 0.5) * uContrast + 0.5` before the toe, so at
 *     `contrast 1.05` everything under display 0.0238 goes NEGATIVE and clamps to zero. Ablated:
 *     `contrast 1.0` returns **100%** of the dead pixels; the hemisphere at x1.5 returns 0.8% and
 *     *"buys +0.19 of one byte"*. **So no amount of `up`, environment or hemisphere lifts a
 *     surface that is under the black point** — and this ceiling is further from every light in
 *     the room than any other in the house. The per-space `up` in `spaces.js` is still right and
 *     still set; it is simply not the thing that can carry this ceiling on its own.
 *   · 🐞 **`glowPatch` DELIVERS `strength²`, NOT `strength`.** It writes `vec4(uColor * a, a)`
 *     under additive blending with `premultipliedAlpha: false`, so the blend multiplies by alpha
 *     a second time. `ceiling-1`'s two deleted toe-lift layers were *"correct and merely
 *     under-driven by ~3x"* — they delivered 10-18% of what one 8-bit unit needs. **A ceiling
 *     patch needs `strength >= 0.24` to clear the black point at all and the one that visibly
 *     works ships at 0.85.** Nothing in this file is placed below that, and where it is further
 *     away than the study's 4.8 m soffit it is placed higher still.
 *
 * ⚠️ **AND THE COFFER BEAMS WILL STILL BE BLACK, WHICH IS THE COMPOSITION RATHER THAN A BUG.**
 * They are `gilt` — a metal with no diffuse term — 9.6 m up with no light pointing at them. What
 * the reference halls show is dark timber against a LIT SOFFIT, and the soffit here is the `ceil`
 * bucket at a 0.400 tint, forty times the reflectance of the study's `dark` beams (`0x1a1713` is
 * linear 0.0103, i.e. 1.3% of the black point once the hemisphere has finished with it). The
 * decals below are aimed at the PANS. Do not spend a round adding light to the beams.
 */

/** The default, and it is a decision — see the header. */
export const BALLROOM_POINTS = 0;

/**
 * Build the ballroom's practicals.
 *
 * @param o.plan   a `ballroomPlan()` result as resolved by `room.js` `ballroomOrderFor` — every
 *                 anchor comes off it, so a fixture cannot drift away from the architecture it
 *                 hangs on when the next round moves a window bay
 * @param o.mats   { brass, wax, crystal } — the showcase's own baked surfaces when available
 * @param o.points how many constant point lights (default `BALLROOM_POINTS`, i.e. none)
 * @param o.ceil   override for `?ceil=` (`gallery-rig.js` `ceilScale`); 0 emits no ceiling decal
 * @param o.rng    the engine's seeded rng, so two clients build the same chandelier
 * @returns { meshes, lights, flicker, stats }
 */
export function ballroomFixtures(o = {}) {
  const P = o.plan;
  const CEIL = o.ceil ?? ceilScale();
  const brass = o.mats?.brass ?? new THREE.MeshStandardMaterial({
    color: 0x8e6a26, roughness: 0.34, metalness: 1.0,
  });
  const crystal = o.mats?.crystal ?? new THREE.MeshPhysicalMaterial({
    color: 0xdce7f2, metalness: 0, roughness: 0.045, ior: 1.72,
    clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 3.2,
  });
  const rng = o.rng ?? (() => 0.5);
  const { x0, x1, z0, z1, h, galleryY, win, winZ, winHead } = P;

  const holder = new THREE.Group();
  const bin = new FixtureBin();
  const add = (obj, x, y, z, ry) => {
    obj.position.set(x, y, z);
    if (ry != null) obj.rotation.y = ry;
    holder.add(obj);
    return obj;
  };
  const glow = (opts, x, y, z, ry = null, rx = null) => {
    const g = glowPatch(opts);
    g.position.set(x, y, z);
    if (ry != null) g.rotation.y = ry;
    if (rx != null) g.rotation.x = rx;
    holder.add(g);
    return g;
  };

  // ---- the chandeliers -----------------------------------------------------
  /**
   * ⚠️ **`merge: true`, `light: 0`, AND HARVESTED — three separate reductions of the same
   * fixture.** The default build keeps every arm addressable for `detach()` at 74 meshes each;
   * `room-ballroom.js` already found that *"three fixtures cost 222 meshes of a 463-mesh scene
   * that was submitting 1150 draw calls against a 625 budget"* and turned merging on. Merged it
   * is ~12 meshes each, which is still 36 draw calls in a room with a 625 ceiling — so all three
   * then go through `FixtureBin`, where their brass folds into the sconces' brass, their crystal
   * into one bucket, their candle cores into the shared emissive and their flames into the
   * shared additive mesh. **Three chandeliers cost 0 draw calls of their own.**
   *
   * ⚠️ **AND THEIR POINT LIGHTS ARE HARVESTED RATHER THAN BAKED.** `buildChandelier` builds two
   * (core + upper) whatever you pass, so `harvestedLights` here is EXPECTED to be 6 — the same
   * pattern `study-rig.js` records for `hearthFire`. They are collected and never parented; the
   * candle cores are emissive geometry and the bloom does the rest. A number that is not 6 means
   * a fixture built a light this file did not account for, which is what the stat is for.
   *
   * ⚠️ `update()` IS NOT WIRED. Its closures scale meshes that no longer exist after the harvest
   * — the same trap `driveFlicker` is drained for below. `built.flicker` replaces it.
   */
  const chY = h - 0.55;
  for (const cz of P.chandelierZ) {
    const ch = buildChandelier({
      merge: true, arms: 8, tiers: 2, radius: 1.10, chain: 1.5,
      brass, crystal, intensity: 0, distance: 17, caustic: 0, rng,
    });
    ch.root.position.set((x0 + x1) / 2, chY, cz);
    holder.add(ch.root);
  }

  // ---- the sconces ---------------------------------------------------------
  // `light: false` on every one, for the header's reason. A brass plate with a hot emissive
  // candle and a merged glow decal behind it reads as a sconce at play distance, and this room
  // is 27 m long — the nearest sconce to any station is several metres away.
  const sconceY = 3.20;
  const sconceAt = [];
  for (const z of P.pierZ) sconceAt.push([x1 - 0.34, sconceY, z, -Math.PI / 2]);
  for (let i = 0; i < winZ.length - 1; i++) {
    sconceAt.push([x0 + 0.34, sconceY, (winZ[i] + winZ[i + 1]) / 2, Math.PI / 2]);
  }
  for (const [sx, sy, sz, sry] of sconceAt) {
    add(sconce({
      brass, merge: true, light: false, phase: sx + sz,
      glowStrength: 0.42, glowSize: 3.2, glowColor: 0xfff0e2,
    }), sx, sy, sz, sry);
  }

  // ---- two candelabra on the floor -----------------------------------------
  // The only fixture in the room at eye height, which is what gives the 9.6 m order something to
  // be measured against from the floor as well as from the gallery.
  // 🪑 When furniture dress is on, FurnProp owns smashable candelabra — skip the merged ones.
  if (o.candelabra !== false) {
    for (const [cx, cz] of [[x0 + 2.6, z1 - 2.4], [x1 - 3.4, z0 + 2.6]]) {
      add(candelabra({ brass, merge: true, light: false, h: 1.55, arms: 6, phase: cx + cz }), cx, 0, cz);
    }
  }

  // ---- the windows ---------------------------------------------------------
  /**
   * ⚠️ **THE POOL IS A `glowPatch`, NOT `lightPool`** — same reason `study-rig.js` gives:
   * `volumetric.js` `lightPool` builds its own `ShaderMaterial` per call, so `isGlow()` cannot
   * bucket it and two of them would be two programs and two draws. The tracery arrives in the
   * frame through the emissive `clere` glazing itself.
   * ⚠️ Strengths are the post-`beams-1` scale: `glowPatch` delivers `strength²`, so 0.55 here is
   * what 0.30 used to be assumed to be.
   */
  for (const wz of winZ) {
    // the pool the window lays on the floor, a little into the room from the reveal
    glow({ size: 5.0, color: 0xc2d4ee, strength: 0.62, pow: 1.7 },
      x0 + 1.60, 0.02, wz, null, -Math.PI / 2);
    // the reveal's own splay — what says the light is coming THROUGH something
    glow({ size: 3.0, color: 0xcfdcf2, strength: 0.46, pow: 2.0 },
      x0 + 0.12, (win.sill + winHead) / 2, wz, Math.PI / 2, null);
    // ...and the SECOND storey of it, which is the thing this port exists for. A window that is
    // 5.40 m tall and only glows for its bottom 3 m is a tall window pretending to be a short one.
    glow({ size: 2.6, color: 0xd2def4, strength: 0.40, pow: 2.0 },
      x0 + 0.12, winHead - 0.70, wz, Math.PI / 2, null);
  }

  // ---- the musicians' gallery ----------------------------------------------
  // The deck's underside is a 2.3 m soffit at 4.8 m with nothing above it and nothing under it;
  // unlit it is a black band across the whole east wall, which would take the one horizontal the
  // room's height is measured against out of the picture.
  glow({ size: 9.0, color: 0xffcf9a, strength: 0.46, pow: 1.5 },
    x1 - 1.15, galleryY - 0.70, P.deckZ, null, Math.PI / 2);
  for (const dz of [P.deckZ - P.deckLen * 0.3, P.deckZ + P.deckLen * 0.3]) {
    glow({ size: 5.0, color: 0xffdcb4, strength: 0.40, pow: 1.8 }, x1 - 2.55, galleryY + 0.9, dz, -Math.PI / 2);
  }

  // ---- the ceiling ---------------------------------------------------------
  /**
   * 🆕 **THE COFFER PANS, AND EVERY PATCH SITS INSIDE THE COFFER DEPTH** (`ceiling-1`'s rule,
   * applied to a soffit twice as far away). `room.js` passes `ceilingY = storey - 0.02` and
   * `cofferedCeiling` drops its beams 0.34, so the timber occupies **9.24 to 9.58** and a patch
   * at `h - 0.08` (9.52) is INSIDE it: every beam in front of it clips it, and the wash arrives
   * already cut into the ceiling's own rhythm instead of veiling it. `ceiling-1` found the
   * gallery's old wash hanging 0.32 m BELOW the lowest timber, in open air, where it could never
   * be occluded and could only ever add a flat haze.
   *
   * ⚠️ **AND IT IS ON A SOURCE THE ROOM HAS.** A ceiling lit from nowhere is the same defect one
   * surface along. Three chandeliers hang at 9.05 with their coronas 0.5 m under the soffit —
   * the only things in this house that are actually near a ceiling — so the bright patches are
   * over them, warm. The window wall gets a cold band, because a 5.40 m window's head is 4.2 m
   * below the soffit and 1.7 m from the wall, which is where the splash lands.
   *
   * ⚠️ Zero draw calls: `FixtureBin` merges every one of these into the room's single
   * `fixture:glow` mesh, which this rig already draws.
   */
  if (CEIL > 0) {
    const cy = h - 0.08;
    for (const cz of P.chandelierZ) {
      glow({ size: 4.6, color: 0xffd7a8, strength: 1.15 * CEIL, pow: 1.9 },
        (x0 + x1) / 2, cy, cz, null, Math.PI / 2);
    }
    for (const wz of winZ) {
      glow({ size: 3.2, color: 0xbccfee, strength: 0.95 * CEIL, pow: 2.1 },
        x0 + 1.90, cy, wz, null, Math.PI / 2);
    }
    // the cove, which is the transition the eye actually reads the height off — a lit cove and a
    // dark ceiling still says "there is more room up there"; two dark bands says nothing.
    for (const cz of [z0 + (z1 - z0) * 0.28, z1 - (z1 - z0) * 0.28]) {
      glow({ size: 4.0, color: 0xffcf9a, strength: 0.85 * CEIL, pow: 2.0 },
        x1 - 1.30, h - 0.70, cz, -Math.PI / 2);
    }
  }

  const built = bin.harvest(holder, brass, crystal)
    .build({ brass, wax: o.mats?.wax, crystal });

  /**
   * ⚠️ **DRAIN `practicals.js`'s FLICKER REGISTRY, DO NOT WIRE IT.** Every `candle()` above
   * pushed a closure into that module's private array, and every one of those closures scales a
   * mesh that no longer exists — the geometry was harvested and the group discarded.
   * `driveFlicker` with a stub engine empties the array and registers nothing, which is the only
   * way to leave the module clean for the next caller in the same page.
   */
  driveFlicker({ onUpdate: () => {} });

  // ---- THE LIGHTS. Zero by default. Scene root, no shadow map. --------------
  /**
   * The spec is ORDERED by how defensible each addition is, so `?estate=port,bp1` adds the best
   * one rather than an arbitrary one:
   *   0  the centre chandelier's own core, at the height its candles are. The one fixture in the
   *      room a decal cannot fully stand in for, because it is 8 m up and lights DOWNWARD onto a
   *      floor 27 m long — the geometry a decal would need is a floor-sized quad.
   *   1  the musicians' gallery, warm, under the deck: the soffit is the room's one horizontal.
   *   2  the window wall's cold half, at the middle bay's reveal.
   */
  const n = o.points ?? BALLROOM_POINTS;
  const mid = P.chandelierZ[Math.floor(P.chandelierZ.length / 2)] ?? (z0 + z1) / 2;
  const SPEC = [
    { pos: [(x0 + x1) / 2, h - 1.30, mid], color: 0xffd9a8, intensity: 46, dist: 20, decay: 1.35 },
    { pos: [x1 - 2.10, galleryY - 0.80, P.deckZ], color: 0xffc07a, intensity: 26, dist: 14, decay: 1.5 },
    { pos: [x0 + 0.70, win.sill + 1.40, winZ[Math.floor(winZ.length / 2)] ?? 0],
      color: 0xb6c8e4, intensity: 30, dist: 15, decay: 1.5 },
  ];
  const lights = [];
  for (let i = 0; i < n && SPEC.length; i++) {
    const s = SPEC[i % SPEC.length];
    const l = new THREE.PointLight(new THREE.Color(s.color), s.intensity, s.dist, s.decay ?? 2);
    l.position.set(...s.pos);
    l.castShadow = false;
    l.name = `ballroom.practical.${i}`;
    lights.push(l);
  }

  return {
    meshes: built.meshes,
    lights,
    flicker: built.flicker,
    /**
     * `harvestedLights` is EXPECTED to be 6 — two per chandelier, which `buildChandelier` builds
     * whatever `intensity` it is passed. They are collected and never parented. A number that is
     * not 6 means a fixture is building a light this file did not account for.
     */
    stats: { ...built.stats, harvestedLights: built.stats.lights, pointLights: lights.length },
  };
}
