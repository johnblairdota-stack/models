import * as THREE from 'three';
import { sconce, hearthFire, driveFlicker } from './practicals.js';
import { glowPatch } from './volumetric.js';
import { FixtureBin } from './fixture-merge.js';
import { ceilScale } from './gallery-rig.js';

/**
 * THE PLAYABLE STUDY'S PRACTICAL RIG — MERGED MESHES, CONSTANT LIGHT COUNT.
 *
 * Second use of `fixture-merge.js`, which is the point of it existing. `estate-spike-1` priced
 * the showcase's unmerged practicals at **+184 draw calls on one room** against a 625 ceiling;
 * `estate-1` merged the gallery's 200 objects into 5 meshes. This file is the study's own
 * arrangement of fixtures on top of the same bucket machinery, and it is called TWICE — once
 * for `study_w` and once for `study_e` — which is exactly why the light count matters more
 * here than it did in the gallery.
 *
 * ---------------------------------------------------------------------------
 * 🔦 THE LIGHT COUNT, WHICH IS THE REAL CONSTRAINT, AND WHY IT IS **1 PER STUDY**
 *
 * `harness/scenarios/_price-pointlight.mjs` — the project's own ABBA instrument, not a naive
 * A/B — prices ONE point light at **+0.112 ms GPU (sd 0.076, SE 0.031, n=6 blocks)** at
 * `quality=medium`. A light is paid by every fragment in every room, not by the room that owns
 * the fixture: `distance` culls a point light's CONTRIBUTION and never its cost
 * (`estate-owner-10`). So anything this file adds is charged to the chapel too, and charged
 * TWICE, because there are two studies.
 *
 * The showcase study runs one shadow-casting spot, four unshadowed points, a hemisphere, a
 * directional and a rake spot. Ported literally that is **10 more lights** in a house that
 * already carries 12 points, i.e. ~1.1 ms of GPU for two rooms out of six.
 *
 * So the deliberate choice is **1 constant point light per study — 2 in the house** — and every
 * part of that is load-bearing:
 *
 *   · **THE ONE IS THE HEARTH, AND IT IS THE ONLY ONE A DECAL CANNOT REPLACE.** `room-study.js`
 *     learned this the expensive way: `critic-estate-5` filed the coat-of-arms as *"very shallow
 *     and low-contrast ... grey-on-grey with almost no shadow separation"*, and the diagnosis
 *     was that the carving is real geometry lit almost entirely by a HEMISPHERE — and a
 *     hemisphere has no direction, so a 30 mm step and a flat field return the same value.
 *     *"Deepening the carving would not have helped; it would have been the fifth round of this
 *     project answering a LIGHTING problem with GEOMETRY."* A glow decal is a hemisphere with
 *     extra steps. A point light in the firebox rakes the bolection, the consoles, the jamb
 *     panels and the overmantel from below, which is the second read in the reference frame.
 *   · **EVERYTHING ELSE IS EMISSIVE GEOMETRY AND MERGED GLOW DECALS**: the sconce candles, the
 *     wash they throw on the panelling, the stained glazing (a `clere` bucket that IS a light
 *     source), and the cool pool each window lays on the floor. One draw call for the lot and no
 *     light budget at all — the showcase's own argument, in its own file.
 *   · **CONSTANT** — created once, never added, never removed, never made invisible.
 *   · **ON THE SCENE ROOT, while the fixture MESHES go under the space root.** three's
 *     `projectObject` skips a hidden subtree entirely, so a light parented under a space root is
 *     culled with the room, `numPointLights` moves on every doorway, and `numPointLights` is
 *     part of three's program cache key. That is the mechanism behind John's five-second freeze.
 *     Splitting them takes both halves of the deal: the meshes are culled (the spike measured
 *     281 draw calls saved), the count never moves.
 *   · **NO SHADOW CASTER.** The game has exactly one and it is the key. A second shadow map is
 *     a whole extra pass over every casting mesh in the house.
 *
 * ⚠️ `?estate=port,sp0` / `sp4` overrides the count so the choice can be re-priced rather than
 * argued, and `sp0` is the honest ablation: it leaves the merged fixtures and takes only the
 * lights away.
 */

/** The default, and it is a decision — see the header. Per study, so the house pays two. */
export const STUDY_POINTS = 1;

/**
 * Build one study's practicals.
 *
 * @param o.plan   a `studyPlan()` result as resolved by `room.js` `studyOrderFor` — every
 *                 anchor comes off it, so a fixture cannot drift away from the architecture it
 *                 hangs on when the next round moves a chimney bay
 * @param o.mats   { brass, wax } — the showcase's own baked surfaces when they are available
 * @param o.points how many constant point lights (default `STUDY_POINTS`)
 * @param o.ceil   override for `?ceil=` (`gallery-rig.js` `ceilScale`); 0 emits no ceiling decal
 * @returns { meshes, lights, flicker, stats }
 */
export function studyFixtures(o = {}) {
  const P = o.plan;
  /** `?ceil=` — see `ceilScale`. 0 is the pre-`ceiling-1` build: this room had NO ceiling term. */
  const CEIL = o.ceil ?? ceilScale();
  const brass = o.mats?.brass ?? new THREE.MeshStandardMaterial({
    color: 0x8e6a26, roughness: 0.34, metalness: 1.0,
  });
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

  // ---- the hearth ---------------------------------------------------------
  // Set BACK inside the opening, not on its lip. At the lip the emissive core is 70 mm off the
  // soot reveals and turns a near-black firebox into a glowing orange cave that reads brighter
  // than the floor — the locked art's hearth is a dark hole with an ember in it.
  const hearth = P.hearth ?? P.hearthWorld ?? null;
  if (hearth) {
    add(hearthFire({ w: 1.05, d: 0.38, intensity: 2.4, distance: 3.9, color: 0xff9155, phase: 0.7 }),
      hearth.x, 0.05, hearth.z + 0.22);
    // the warm wash the fire throws UP the chimney breast. The overmantel is the second read in
    // the reference frame and it is 2 m above the only light in the room that is motivated.
    glow({ size: 3.1, color: 0xffb877, strength: 0.20, pow: 2.0 },
      hearth.x, 2.20, hearth.z + 0.50);
  }

  // ---- the sconces --------------------------------------------------------
  // `light: false` on every one. Two sconces per wall with real point lights is four more
  // fragment-loop iterations over walls and a floor that fill the screen; a brass plate with a
  // hot emissive candle and a merged glow decal behind it reads as a sconce at play distance,
  // and this room already spends its one light where a decal cannot go.
  for (const s of P.sconces ?? []) {
    add(sconce({
      brass, merge: true, light: false, phase: s.x + s.z,
      glowStrength: 0.30, glowSize: 2.8, glowColor: 0xffefdc,
    }), s.x, s.y, s.z, s.rotY);
  }

  // ---- the windows --------------------------------------------------------
  /**
   * ⚠️ **THE POOL IS A `glowPatch`, NOT `lightPool`, AND THE REASON IS THE MERGE.**
   * `volumetric.js` `lightPool` builds its own `ShaderMaterial` per call and carries the glass
   * texture, so two of them are two programs and two draws that `FixtureBin` cannot bucket —
   * `isGlow()` matches `glowPatch`'s uniform set and nothing else. The showcase can afford a
   * textured pool because it draws one room with an orbit camera; here the tracery arrives in
   * the frame through the emissive `clere` glazing itself, and the floor gets the light without
   * the pattern.
   */
  for (const w of P.windowsWorld ?? []) {
    const nx = w.face === 'x' ? w.into : 0;
    const nz = w.face === 'z' ? w.into : 0;
    // the pool, laid flat on the floor a little INTO the room from the reveal
    glow({ size: 4.2, color: 0xc2d4ee, strength: 0.42, pow: 1.7 },
      w.x + nx * 1.35, 0.02, w.z + nz * 1.35, null, -Math.PI / 2);
    // ...and the reveal's own splay, which is what says the light is coming THROUGH something
    glow({ size: 2.6, color: 0xcfdcf2, strength: 0.26, pow: 2.0 },
      w.x + nx * 0.10, (w.sill + w.head) / 2, w.z + nz * 0.10,
      w.rotY, null);
  }

  // ---- the ceiling --------------------------------------------------------
  /**
   * 🆕 **THE BEAMED CEILING, WHICH UNTIL NOW THIS FILE DID NOT MENTION AT ALL** (`ceiling-1`,
   * 2026-08-09). `critic-slice-1`: *"the ceiling is the one surface nobody lit, and it caps
   * every room in the slice like a lid"*, and it was the first cue that gave the render away in
   * a blind comparison against John's art. Measured on the shipped frame with
   * `_ceil1_band.mjs`: the top fifth of `study_w.south` is median L **6.8** with **39.7%** of it
   * crushed to pure black, and `study_e.south` is **4.4 / 41.8%**. The geometry was never the
   * problem — `estate-2` built the beams, the ridge and the pans out of the estate kit — the
   * problem is that nothing in the room points up.
   *
   * ⚠️ **THE BEAMS ARE NOT SUPPOSED TO COME UP, AND THAT IS THE WHOLE COMPOSITION.** They are
   * the `dark` bucket (`0x1a1713`, `room.js`) — *"the art's reliable black"* — so no lighting
   * change will make them anything but black, and it should not: what the reference halls show
   * is dark timber against a LIT soffit. The pans are `ceil` at tint 0.260/0.242/0.214 and they
   * are what these decals are for. Every patch sits at `h - 0.06`, INSIDE the beams' 4.46–4.80
   * depth band, so each beam in front of it clips it and the wash arrives already cut into the
   * ceiling's own rhythm instead of veiling it.
   *
   * ⚠️ **AND EVERY PATCH IS ON A SOURCE THE ROOM ALREADY HAS.** A ceiling lit from nowhere is
   * the same defect one surface along:
   *   · a WINDOW head is 3.28 in a 4.80 storey, so the brightest thing on this ceiling is the
   *     splash 1.7 m in from each reveal — and at the spawn station the near window (z −14.75)
   *     lands at 5.2–8.6 m ahead, which is exactly the band the measurement above is taken over
   *   · the HEARTH throws up the chimney breast and licks the pans in front of it, warm
   *   · each SCONCE puts a small halo overhead, which is what a candle 2.7 m under a soffit does
   * Cool at the windows, warm at the fire, and the gradient between them is the thing a flat
   * ambient lift cannot buy — `critic-slice-1` filed the band as the FLATTEST as well as the
   * darkest, and two colours at opposite ends of a room is the cheapest answer to the second
   * half of that.
   *
   * ⚠️ Zero draw calls: `FixtureBin` merges every one of these into the room's single
   * `fixture:glow` mesh, which this rig already draws. Six patches is 12 triangles.
   */
  if (CEIL > 0) {
    const cy = (P.h ?? 4.80) - 0.06;
    for (const w of P.windowsWorld ?? []) {
      const nx = w.face === 'x' ? w.into : 0;
      const nz = w.face === 'z' ? w.into : 0;
      glow({ size: 3.6, color: 0xbccfee, strength: 0.85 * CEIL, pow: 1.5 },
        w.x + nx * 1.70, cy, w.z + nz * 1.70, null, -Math.PI / 2);
    }
    if (hearth) {
      glow({ size: 3.2, color: 0xffb877, strength: 0.50 * CEIL, pow: 1.8 },
        hearth.x, cy, hearth.z + 0.90, null, -Math.PI / 2);
    }
    for (const s of P.sconces ?? []) {
      glow({ size: 2.2, color: 0xffe0b8, strength: 0.30 * CEIL, pow: 2.0 },
        s.x, cy, s.z + 0.55, null, -Math.PI / 2);
    }
    /**
     * 🚨 **WHAT IS DELIBERATELY *NOT* HERE, BECAUSE IT WAS BUILT TWICE AND MEASURED TWICE AND
     * DOES NOT WORK: A LAYER BELOW THE BEAMS TO TAKE THEM OFF PURE BLACK.**
     *
     * A beam cell in the top fifth of `study_w.south` reads mean L **1** — not dark timber, a
     * VOID, and under the grade's own `toeCrush 0.005`. The project's standard says it should
     * not be: *"the art's darkest decile still holds L 2.7"* (`room-study.js` round 5), which is
     * why the `dark` bucket is `0x1a1713` and not black. The obvious fix is an additive patch
     * BELOW the soffit, where it is in front of the beams instead of clipped by them.
     *
     * Two were built. Eight 6.6 m discs at 0.10, then two 15 m discs at 0.075 (the second
     * because `glowPatch`'s falloff is a disc INSCRIBED in the quad, so the first delivered ~7%
     * of its own strength between centres). **Both changed the beam cells by less than one 8-bit
     * unit**, and the band's black share is 35.9% / 37.6% either way. So is `?ceil=1.5`: at 1.5x
     * every term in this file and in `spaces.js`, the beam cells are still mean L 1.
     *
     * ⚠️ **THAT IS A REAL RESULT AND IT NARROWS THE OWNER.** The beams do not respond to the
     * hemisphere, to the environment, or to an additive decal drawn in front of them, while the
     * pans 0.34 m away respond to all three. Whatever is zeroing them is not a lighting term, so
     * it is not in any of this round's four files — the candidates are the screen-space AO
     * multiply (`src/post/**`, `patchForScreenAO`), the grade's `toeCrush` in `views/game.js`,
     * and the `dark` albedo in `room.js` `binMaterials`. **Do not spend another round adding
     * light to this ceiling before that is settled** — this is HANDOFF's own dominant defect
     * class ("it exists, something is in front of it") with a lighting term in the role of the
     * missing feature. The pans are what these decals are for and the pans move.
     */
  }

  const built = bin.harvest(holder, brass).build({ brass, wax: o.mats?.wax });

  /**
   * ⚠️ **DRAIN `practicals.js`'s FLICKER REGISTRY, DO NOT WIRE IT.** Every `candle()` and every
   * `hearthFire()` above pushed a closure into that module's private array, and every one of
   * those closures scales a mesh that no longer exists — the geometry was harvested and the
   * group discarded. `driveFlicker` with a stub engine empties the array and registers nothing,
   * which is the only way to leave the module clean for the next caller in the same page.
   * ⚠️ It is called ONCE PER RIG and the array is module-global, so a second study draining it
   * after the first is harmless: it is already empty.
   */
  driveFlicker({ onUpdate: () => {} });

  // ---- THE LIGHTS. Constant count, scene root, no shadow map. --------------
  const n = o.points ?? STUDY_POINTS;
  /**
   * ⚠️ **IN FRONT OF THE FIREBOX AND AT HIP HEIGHT, NOT IN IT AND NOT ON THE FLOOR.** The
   * showcase measured this one: at 0.45 m a decay-2 light *"delivers 6/0.45^2 = 30 to the marble
   * directly beneath it and about 1 to the wall it is supposed to be bouncing onto — i.e. the
   * bounce card was mostly scorching the floor it was meant to be bounced FROM."* Lifting it
   * roughly triples what reaches the carving, which is the whole reason the light exists.
   */
  const SPEC = P.hearth || P.hearthWorld ? [
    { at: [0, 0.92, 0.95], color: 0xffa863, intensity: 20, dist: 9.0 },
    { at: [0, 2.30, 1.30], color: 0xffc48c, intensity: 12, dist: 7.0 },
    { at: [0, 1.30, 3.10], color: 0xff9a55, intensity: 9, dist: 6.0 },
    { at: [0, 0.70, 0.40], color: 0xffb070, intensity: 8, dist: 5.0 },
  ] : [];
  const h = P.hearth ?? P.hearthWorld;
  const lights = [];
  for (let i = 0; i < n && SPEC.length; i++) {
    const s = SPEC[i % SPEC.length];
    const l = new THREE.PointLight(new THREE.Color(s.color), s.intensity, s.dist, 2);
    l.position.set(h.x + s.at[0], s.at[1], h.z + s.at[2]);
    l.castShadow = false;
    l.name = `study.practical.${i}`;
    lights.push(l);
  }

  return {
    meshes: built.meshes,
    lights,
    flicker: built.flicker,
    /**
     * `harvestedLights` is EXPECTED to be non-zero here and that is the difference from the
     * gallery's rig, which asserts zero strays. `hearthFire()` always builds its own PointLight;
     * `FixtureBin.harvest` collects it instead of baking it, and it is then simply never
     * parented — the deliberate constant above replaces it. A number that is not 1 means a
     * fixture is building a light this file did not account for.
     */
    stats: { ...built.stats, harvestedLights: built.stats.lights, pointLights: lights.length },
  };
}
