import * as THREE from 'three';

/**
 * 💡 **THE FIXED LIGHT RIG — five lights, repositioned per space, and the one thing both modes
 * agree about the house's appearance.**
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 WHY THIS IS ITS OWN MODULE, AND IT IS A BUNDLE FACT RATHER THAN A TIDINESS ONE
 * ---------------------------------------------------------------------------------------------
 * It lived in `views/game.js` and was exported from there, so `views/expedition.js` and
 * `views/premiere.js` each carried `import { makeLightRig } from './game.js'` for this ONE
 * function. `game.js` is the retired survival mode: 4,900 lines that pull in the sledge, the
 * gadget world, the run state, the exit siege, the HUD, the death watch and the escape watch.
 * In the built artefact that import put a **277,813 B raw / 104,012 B gzip** chunk on the party
 * mode's blocking critical path — verified by finding `"CHAINED FROM THE OUTSIDE"`,
 * `"pickup.sledgehammer"` and `"Building the estate"` inside the chunk the party pages load.
 *
 * So *"the survival mode is dead code in party"* was true behaviourally and false as a bundle
 * fact, and the two lines that made it false were the ONLY source-level dependency the shipping
 * mode had on the retired one. Severing them turns "is the survival mode dead code?" from a
 * question nobody can answer into a decision the project can take — archive it, gate it, or ship
 * it — rather than one quietly answered *"keep it, we cannot remove it"* by a single import.
 *
 * ⚠️ **IT IS STILL NOT A GENERAL-PURPOSE API AND MUST NOT BECOME ONE.** It takes the five-light
 * rig both views build by hand and the per-space `lights` table in `spaces.js`. A second rig built
 * beside it would make the party mode's mansion a visibly different building from the survival
 * mode's, which is the one thing an edit must never do. That is the whole reason it is shared at
 * all, and it is why it belongs here rather than being copied.
 *
 * `dead-import` is what keeps `game.js` off the party path; it fails if either view reaches for
 * it again.
 */

/**
 * THE FIXED LIGHT RIG. Five lights, forever. `follow(space, dt)` lerps every one of them
 * toward that space's table entry over `LERP` seconds; nothing is ever added, removed or
 * driven to zero. `snapTo` is the same move with no easing, for the first frame and for
 * `resetRound`, where a 0.35 s slide would be visible as the room re-lighting itself.
 *
 * Intensity is lerped too, because a room's brightness is part of what tells you which room
 * you are in — but the CONSTRUCTOR values above are only a starting point: before this rig
 * existed the update loop overwrote `key.intensity` with `150 + sin(...)` every frame, which
 * made the 78 it was constructed with dead code that read like a decision. The breathing is
 * now a MULTIPLIER on the table's value, so the table is the single source of truth.
 */
export function makeLightRig(L, o = {}) {
  const LERP = 0.35;
  /**
   * 🆕 **`?aim=box` — THE ABLATION FOR THE 2026-08-09 RE-AIM, AND IT IS PERMANENT ON PURPOSE.**
   *
   * HANDOFF's rule, paid for by `room.ballroom`'s 2.24 ms sitting unattributed for a round: a
   * change that ships without a toggle cannot be measured later. `estate-light-1` re-pointed the
   * gallery's and both studies' entries at architecture that did not exist when they were
   * written; `spaces.js` keeps the previous entry verbatim as `lightsBox`, and this flag selects
   * it. That is what lets both arms run in ONE browser session — which is the only comparison
   * this project accepts, since recorded per-station history has failed to reproduce three
   * rounds running.
   *
   * ⚠️ It selects a TABLE, never a light. The count, the objects and the parenting are
   * identical on both arms, so no arm of this flag can recompile a program.
   */
  const box = !!o.box;
  /**
   * 🆕 **`?ceil=<scale>` — THE ABLATION FOR THE 2026-08-09 CEILING PASS, AND IT IS A NUMBER
   * RATHER THAN A BOOLEAN ON PURPOSE** (`ceiling-1`).
   *
   * `critic-slice-1` measured the ceiling band as the darkest and flattest band at all five
   * aimed stations. The answer is two terms — the per-space hemisphere GROUND colour below, and
   * merged ceiling glow decals in `gallery-rig.js` / `study-rig.js` — and `ceil` scales BOTH,
   * so `?ceil=0` is the pre-`ceiling-1` build exactly (no `up` lerp, and the rigs emit their old
   * geometry rather than a zero-strength copy of the new geometry) and `?ceil=1.5` re-prices the
   * choice upward without an edit. That is what lets the before and the after run in ONE browser
   * session, which is the only comparison this project accepts.
   *
   * ⚠️ **`?aim=box` IMPLIES `ceil=0` UNLESS `ceil` IS GIVEN EXPLICITLY.** `aim=box`'s own header
   * says it exists so the flag is *"a WHOLE ablation rather than half of one"*; an arm that
   * reverted the re-aim and kept the ceiling pass would be neither build, and every number taken
   * on it would be attributable to neither. Same reasoning, one round later.
   *
   * ⚠️ It scales UNIFORMS AND VERTEX DATA, never a light. The count, the objects and the
   * parenting are identical at every value, so no value of this flag can recompile a program.
   * `gallery-rig.js` exports the identical parse — one function, imported by `study-rig.js` —
   * and this copy exists because `makeLightRig` must not drag a lighting module into `game.js`'s
   * static import graph for two lines of query parsing.
   */
  const CEIL = (() => {
    const q = new URLSearchParams(location.search).get('ceil');
    if (q == null) return box ? 0 : 1;
    const v = Number(q);
    return Number.isFinite(v) && v > 0 ? v : 0;
  })();
  /** The points' as-constructed falloff — the value an absent `decay` entry restores. */
  const DECAY0 = { warmA: L.warmA.decay, warmB: L.warmB.decay, cool: L.cool.decay };
  /**
   * 🆕 The hemisphere's as-constructed GROUND colour — the value an absent `up` entry restores,
   * for exactly `decay`'s reason one paragraph down: three of six spaces write `up`, so a space
   * that does not mention it has to be RESTORED rather than skipped, or `service`, `ballroom`
   * and `chapel` would run on whichever study the player last walked out of.
   */
  const GROUND0 = L.fill ? L.fill.groundColor.clone() : null;
  const _tmpCol = new THREE.Color();
  const want = {
    key: { pos: new THREE.Vector3(), at: new THREE.Vector3(), i: L.key.intensity },
    warmA: { pos: new THREE.Vector3(), i: L.warmA.intensity },
    warmB: { pos: new THREE.Vector3(), i: L.warmB.intensity },
    cool: { pos: new THREE.Vector3(), i: L.cool.intensity },
    up: GROUND0 ? GROUND0.clone() : null,
  };
  const read = (space) => {
    const s = (box ? space?.lightsBox : null) ?? space?.lights;
    if (!s) return;
    /**
     * 🆕 **THE CEILING TERM.** `up` is not a light and not a position: it is the shared
     * `fill` HemisphereLight's ground colour, i.e. the term a DOWN-facing normal receives.
     * `mix(ground, sky, 0.5 * dot(n, up) + 0.5)` gives a ceiling the ground and nothing else,
     * a wall the average of the two, and a floor pure sky — so moving this lifts the ceiling
     * by the full ratio, the walls by half of it, and **the floors not at all**. The floors are
     * the brightest thing in every one of these frames, which is the only reason a term this
     * blunt is usable without blowing the 30–60 median gate `estate-light-1` just earned.
     * ⚠️ It is lerped rather than snapped (the colours above are snapped) because it is a
     * large-area term and a hard step across a doorway would read as a fault, not as a room.
     */
    if (want.up) {
      want.up.copy(GROUND0);
      if (CEIL > 0 && s.up != null) want.up.lerp(_tmpCol.setHex(s.up), CEIL);
    }
    if (s.key) {
      want.key.pos.set(...s.key.pos); want.key.at.set(...s.key.at); want.key.i = s.key.intensity;
      if (s.key.color != null) L.key.color.setHex(s.key.color);
      // SHAPE, not just position. One spot cone cannot serve a 3.4 m passage and a 27 m
      // gallery at the same time — a 50-degree cone that fills the corridor lights two metres
      // of the gallery and leaves the vista black, which is exactly what the M2 capture shows.
      // These are snapped rather than lerped: `angle` and `distance` are not interpolated
      // anywhere in three.js's shadow frustum update, and a lerped cone re-fits the shadow
      // camera every frame for 0.35 s. Light COUNT is untouched, which is the rule that matters.
      if (s.key.angle != null) L.key.angle = s.key.angle;
      if (s.key.penumbra != null) L.key.penumbra = s.key.penumbra;
      if (s.key.dist != null) { L.key.distance = s.key.dist; L.key.shadow.camera.far = s.key.dist + 2; }
      if (s.key.decay != null) L.key.decay = s.key.decay;
    }
    /**
     * 🆕 **`decay` IS NOW READABLE ON THE POINTS, AND IT IS THE KNOB THESE ROOMS ACTUALLY
     * NEEDED** (`estate-light-1`). `key` has taken a per-space `decay` since M2; the three
     * points were built with **2** and had no way to say otherwise, so each one lit its own
     * 3–4 m and nothing beyond it. In a 3.4 m service passage that is right. In a 15.4 x 11.6 m
     * study it means the two fill lights cannot reach the middle of their own room, which is why
     * the old rig had to carry the studies on a 0.86 rad key cone — a wash that blew one end
     * (median L 85.6) while the other end sat at 12.8 with a quarter of its pixels crushed.
     * At decay 1.45 the same light delivers ~4x as much at 10 m for the same intensity.
     * 🚨 **AND IT FALLS BACK TO THE CONSTRUCTOR VALUE, NOT TO "WHATEVER THE LAST ROOM SET".**
     * Every other field in this table is written by all six spaces, so a stale value cannot
     * survive a transition; `decay` is written by three, so an absent entry has to RESTORE
     * rather than skip. Skipping it would leave `service`, `ballroom` and `chapel` running at
     * whichever study the player last walked out of — a lighting change in three rooms this
     * round does not touch, arriving through a field they never mention. Decay is a per-light
     * uniform and not part of three's program cache key, so none of this recompiles anything.
     */
    const w = s.warm ?? [];
    for (const [k, d] of [['warmA', w[0]], ['warmB', w[1]]]) {
      if (!d) continue;
      want[k].pos.set(...d.pos); want[k].i = d.intensity;
      if (d.color != null) L[k].color.setHex(d.color);
      if (d.dist != null) L[k].distance = d.dist;
      L[k].decay = d.decay ?? DECAY0[k];
    }
    if (s.cool) {
      want.cool.pos.set(...s.cool.pos); want.cool.i = s.cool.intensity;
      if (s.cool.color != null) L.cool.color.setHex(s.cool.color);
      if (s.cool.dist != null) L.cool.distance = s.cool.dist;
      L.cool.decay = s.cool.decay ?? DECAY0.cool;
    }
  };
  const apply = (a) => {
    L.key.position.lerp(want.key.pos, a);
    L.key.target.position.lerp(want.key.at, a);
    for (const k of ['warmA', 'warmB', 'cool']) L[k].position.lerp(want[k].pos, a);
    if (want.up) L.fill.groundColor.lerp(want.up, a);
  };
  return {
    base: want,
    snapTo(space) { read(space); apply(1); },
    follow(space, dt) { read(space); apply(1 - Math.exp(-dt / (LERP / 3))); },
  };
}
