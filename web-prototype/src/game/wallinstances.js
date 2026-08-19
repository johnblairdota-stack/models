import * as THREE from 'three';
import { wallStageMaterials } from '../materials/surfaces/wallstages.js';
import { applyBreakMask, setBreak, applyStageBreaks } from '../materials/breakmask.js';
import { patchForScreenAO } from '../post/pipeline.js';
import {
  BREAK_CFG, DEPTHS, revealGeometry, facePlaneGeometry, pinProgramKey,
  coatArm, panelCoatMaterial,
} from './wall.js';

/**
 * 🚪 **A PANEL'S GROUP KEY, AND SINCE 2026-08-11 IT CARRIES THE HOLES IN THE FACE AS WELL AS THE
 * HOLE THE FACE IS.**
 *
 * The header's rule is that the key must be a pure function of AUTHORED geometry and never of the
 * run state, and that is unchanged: a doorway is a floor-plan fact (`dig.js` `SLAB_DOORWAYS` —
 * *"a stated offset along the wall"*), fixed before a seed exists, so which panel the run makes
 * live still cannot move the group count.
 *
 * ⚠️ **AND IT CANNOT BE FOLDED INTO THE `w x h x t` KEY, BECAUSE THE TWO FACES OF ONE BAND ARE
 * MIRRORS.** `f.svc_w.0.a` and `.b` are the same 15.40 x 2.80 x 0.15 wall with the same two
 * doorways in it, and their rects are `u -> 1-u` of each other — different geometry, so a shared
 * `InstancedMesh` would put both doorways at the wrong end of one of them. Two groups where the
 * aperture-free slab had one; **measured as a draw-call delta rather than argued.**
 *
 * ⚠️ Returns the empty string for every face with no doorway, so the key is character-for-
 * character what it has always been on every arm but this one.
 */
function apertureKey(p) {
  const a = p.apertures;
  if (!a?.length) return '';
  return `|ap:${a.map((r) => `${r.u0.toFixed(5)},${r.u1.toFixed(5)},`
    + `${r.v0.toFixed(5)},${r.v1.toFixed(5)}`).join(';')}`;
}

/**
 * 🎨 **AND SINCE 2026-08-11 A FACE'S KEY ALSO CARRIES THE COAT IT WEARS — because until now it
 * did not, and that is why John's sentence was not true of an untouched wall.**
 *
 * John: *"from the inside of the room the destructive wall IS the room asset — only when they
 * damage it can they see its white underneath."* `coatbake-1` measured the opposite, off the
 * built scene: **28 of 28 free faces pristine · 28 of 28 instanced · 0 of 28 drawing their own
 * layer 0.** Every pristine face in the house was drawn from ONE shared `wall.pristine.face`, the
 * damask wallpaper stage — so `wall.js`'s own stated defect, *"a band of damask in a boiserie room
 * gave away the dig band before a blow landed"*, was still happening, on every arm, on the shipped
 * build. The coat only appeared on the first blow, when `pristine` goes false and the panel
 * de-instances.
 *
 * ⚠️ **ARM 0 CONTRIBUTES THE EMPTY STRING, SO THE KEY IS CHARACTER-FOR-CHARACTER WHAT IT HAS
 * ALWAYS BEEN ON THE SHIPPED ARM.** That is not tidiness: `coat-1` shipped `[C]`/`?coat=0|1|2`
 * with arm 0 defined as the shipped build unchanged, and a pristine face on arm 0 must stay
 * damask. It is also what makes the draw-call delta on arm 0 exactly zero *by construction* rather
 * than by a lucky coincidence of which rooms share a geometry group.
 *
 * ⚠️ **A SCALAR PANEL NEVER CARRIES A COAT EITHER** (`!p.field`), which is the same guard
 * `wall.js` puts on the whole coat feature — so `wall.sheet` (PASS 78), `wall.transition` and the
 * four studio stage views cannot be reached by any of this.
 *
 * 🚨 **THE IDENTITY IS THE THREE FIELDS THAT DECIDE WHETHER ONE MATERIAL CAN STAND IN FOR
 * ANOTHER**, in `WebGLPrograms.getProgramCacheKey`'s own order: the material CLASS, clearcoat
 * PRESENCE (`getParameters` sets `clearcoat: material.clearcoat > 0`), and the baker key
 * (`material.name`, which IS `family:{...opts}` — `baker.js` sets it). Two faces may share one
 * `InstancedMesh` exactly when all three agree. Read off the panel's live `mats[0]`, never
 * re-derived from `room.js`'s tables.
 */
function coatKey(p) {
  if (!p.field || coatArm() === 0) return '';
  const m = p.mats?.[0];
  if (!m) return '';
  const cc = ('clearcoat' in m) ? (m.clearcoat > 0 ? 'cc' : 'nocc') : 'nocc';
  return `|coat:${m.type}|${cc}|${m.name}`;
}

/**
 * EVERY UNDAMAGED PANEL IN THE HOUSE, IN A CONSTANT NUMBER OF DRAW CALLS.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS — the number, first
 * ---------------------------------------------------------------------------
 * `harness/scenarios/eo2-calls.mjs`, twelve parked stations, seed `s4`: the worst station
 * (`service.mid`) measured **625-627 of a 625 budget**. Not "8 spare" — spent, and over the
 * line on one of two runs. Attributed by ablation (`harness/scenarios/inst-census.mjs`, which
 * hides subsystems INSIDE `setViewpoints` because residency rewrites `panel.root.visible` every
 * frame and a hide that does not survive that measures nothing): **51 of those calls are wall
 * panels**, over 55 visible panel meshes — essentially one call per mesh.
 *
 * Eleven panels are visible from that one station and there are twenty-two in the house.
 * `docs/design/dig.md` wants five shared walls segmented into forty. At five meshes a panel
 * that is arithmetic the budget cannot survive, which is why `docs/PLAN.md` makes this the
 * gate for everything else.
 *
 * ---------------------------------------------------------------------------
 * THE DESIGN — `gameplay-plan.md` §4, implemented rather than re-invented
 * ---------------------------------------------------------------------------
 * *"An undamaged segment is cheap single-stage geometry, instanced across the house; it
 * PROMOTES to the full layered multi-mesh stack the first time it takes damage."*
 *
 * Two halves, and they are separable on purpose so each can be priced on its own:
 *
 *   1. **OCCLUSION** (`wall.js` `occludeLayers`). A pristine panel draws four coplanar layer
 *      planes and shows exactly one — the other three are behind an opaque, depth-writing
 *      occluder of identical extent. 5 meshes -> 2. This helps PROMOTED panels too.
 *   2. **INSTANCING** (this file). The two survivors — the stage-0 face and the reveal box —
 *      are drawn for every pristine panel out of one shared `InstancedMesh` pair. 2 meshes per
 *      panel -> a CONSTANT, independent of how many panels exist.
 *
 * `?walls=legacy | occlude | instanced` selects between them, permanently, because this
 * project's own rule is that a change shipping without an ablation toggle cannot be judged
 * later — and because HANDOFF's `?cam=r10` audit found a toggle that did not revert everything
 * it implied. `legacy` reverts BOTH halves and is the exact pre-change build.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ THE INSTANCE COUNT MUST NOT DEPEND ON THE RUN SEED
 * ---------------------------------------------------------------------------
 * `exterior.js`'s connector dressing is the precedent and its author's note is the lesson:
 * *"a per-panel version would have blown 625 on some seeds and not others, which no single
 * capture would ever find."*
 *
 * So the grouping key here is the panel's AUTHORED APERTURE — `width x height x thickness`,
 * read out of `spaces.js` by `aperture()`, which `connectors.js` states in as many words is
 * NOT a function of the run state. The number of `InstancedMesh`es is therefore
 * `2 x (distinct authored apertures)`: **2 today for the twenty-one 2.08 x 2.68 panels plus 2
 * for the orangery's 3.20 x 3.40 doors = 4, on every seed.** Which panel the seed makes live,
 * which lock it wears and which sites are chained cannot move that number, because none of
 * them changes an aperture.
 *
 * ---------------------------------------------------------------------------
 * 🎨 THE COAT SPLIT — WHAT IT COSTS, MEASURED BEFORE IT WAS BUILT
 * ---------------------------------------------------------------------------
 * See `coatKey()` for why a face's key now carries the room coat. The risk the campaign carried
 * for this change was *"~+38 instanced meshes"*, and **it is wrong by a factor of five**:
 * `harness/scenarios/_pris1-groups.mjs` counted the real house before a line of this was written.
 *
 *   · **Constructed meshes 10 → 18** (5 geometry groups → 13 face sub-groups + the same 5
 *     reveals), on arm 1. Arm 0 stays at 10.
 *   · **Worst station +5 draw calls** (`ballroom.north`/`.centre`, 5 → 10 live face groups),
 *     against a worst parked reading of 423 of 625.
 *   · Seven of the twelve parked stations pay **+0**.
 *
 * 🚨 **AND THE REVEAL IS DELIBERATELY NOT SPLIT — THAT IS HALF THE SAVING.** The reveal box is
 * `room.js`'s one shared `mats.reveal` with no coat anywhere in it, so it has nothing to split
 * on; splitting the whole group would have cost **+10** at the worst station instead of +5. So a
 * group is one geometry, one reveal, and N faces.
 *
 * ⚠️ AND GROUPING BY APERTURE IS WHAT MAKES THIS PIXEL-IDENTICAL RATHER THAN MERELY CHEAP.
 * The obvious version authors one geometry at the default aperture and scales per instance —
 * that is what the dressing does, and it stretches the orangery's hardware by 1.54x. Here each
 * group's face plane and reveal box are built at that group's own exact dimensions with
 * `revealGeometry()`, the same function `wall.js` builds its own with, so an instance is the
 * same geometry with the same material at the same transform. There is no visual trade to
 * state, and the A/B below is expected to come back at the noise floor.
 */

/** The three arms. `instanced` is the default; `legacy` is the exact pre-change build. */
export const WALL_MODE = { LEGACY: 'legacy', OCCLUDE: 'occlude', INSTANCED: 'instanced' };

export function wallMode(raw) {
  const v = String(raw ?? '').toLowerCase();
  return v === WALL_MODE.LEGACY || v === WALL_MODE.OCCLUDE ? v : WALL_MODE.INSTANCED;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);

export class PanelInstances {
  /**
   * @param {import('./wall.js').DestructibleWall[]} panels  every panel in the house
   * @param {THREE.Object3D} parent   the ROOM root, not a space root — see `sync()`
   * @param {object} o
   * @param {THREE.Material} o.revealMaterial  the same shared material the panels were given
   */
  constructor(panels, parent, o = {}) {
    this.panels = panels;
    this.parent = parent;
    this.groups = [];
    this._sig = '';
    /** 🎨 set by a panel's `onRecoat`; consumed by the next `sync()`. See `_buildFaces`. */
    this._regroup = false;
    /**
     * ⚠️ A RUNTIME OFF SWITCH, AND IT IS NOT A CONVENIENCE — IT IS THE ONLY WAY THE LOOK A/B IS
     * HONEST. Comparing two page loads is the failure this project already recorded: *"two
     * separate browser runs diverge in held-item glow and pose even with position and yaw
     * pinned"*, and `game.play` carries a per-frame grain that makes two adjacent SAME-mode
     * frames differ as much as any A/B. `room.setWallMode()` flips the draw set inside ONE
     * frozen page, so the two arms share a page, a frame and a random state, and anything left
     * in the difference is the change.
     */
    this.enabled = true;

    /**
     * ONE material for every pristine face in the house, so this is ONE program.
     *
     * ⚠️ It must NOT be one of the per-panel materials. `applyBreakMask` writes the break
     * amount into a uniform that lives ON the material, which is why `wall.js` gives every
     * panel its own set and pins a unique program cache key — share one and a hole in one
     * panel is a hole in all of them. This material's break is pinned at 0 forever, which is
     * exactly what "pristine" means, and a panel stops using it the instant that stops being
     * true.
     *
     * ⚠️ And it needs its own pinned key for the reason `wall.js` documents: `applyBreakMask`
     * assigns ONE constant key to every material it touches, and `patchForScreenAO` overwrites
     * whatever is there during `finalizeScene()`. `pinProgramKey` composes rather than
     * replaces, so both survive.
     *
     * ⚠️ **THE KEY IS THE SCALAR ARM'S SHARED ONE, NOT `pristine|0` — see `wall.js`'s layer pin
     * for the measurement.** A break-patched material's emitted GLSL varies with exactly one
     * thing, the presence of a damage texture, and that lives in `defines.RRR_BREAK_DAMAGE`
     * which three hashes ahead of the custom key. Uniform VALUES are per material whatever the
     * program sharing does (`WebGLRenderer.getProgram` keys its program map per material), so
     * this face's `uBreak` of 0 cannot leak into a panel's and vice versa. These materials are
     * only ever worn by an `InstancedMesh` besides, and `parameters.instancing` is a three-owned
     * key field, so they can never be handed a non-instanced panel's program either.
     */
    const faceMat = applyBreakMask(wallStageMaterials()[0], BREAK_CFG[0]);
    setBreak(faceMat, 0);
    pinProgramKey(faceMat, 'rrr-wall|stage');
    /**
     * 🕳️ **AND IT IS `DoubleSide`, BECAUSE THIS ONE MATERIAL IS WHAT ACTUALLY DRAWS AN EXIT
     * SITE — see `wall.js`'s constructor note for the measurement and the mechanism.**
     *
     * Every exit site in the house is CHAINED or untouched, i.e. `pristine`, so its own five
     * meshes are off and this instanced face is the only thing standing in the aperture. Fixing
     * `wall.js`'s per-panel layers alone would have fixed nothing on the shipped build: the hole
     * would have filled on `?walls=legacy` and stayed empty on the default arm, which is exactly
     * the shape of bug that gets filed twice under two wrong names.
     *
     * ⚠️ **ONE MATERIAL STILL, NOT ONE PER ARM, AND THE ARGUMENT IS THE PRISTINE STATE ITSELF.**
     * This face is also worn by pristine DIG faces, and `wall.js` deliberately leaves damage-armed
     * materials `FrontSide` so the crater is untouched. Sharing is safe here because `pristine`
     * means *no hit has ever landed on this face* — the plane has no holes in it from either
     * direction — so drawing its back can only ever put an intact wall where the alternative is
     * seeing through a wall nobody has opened. The moment a blow lands the panel promotes off
     * this material entirely.
     *
     * ⚠️ Costs no draw call and no group: culling is per primitive, and `DOUBLE_SIDED` is a
     * three-owned define that replaces the front-side variant rather than adding to it.
     */
    faceMat.side = THREE.DoubleSide;
    faceMat.name = 'wall.pristine.face';
    faceMat.needsUpdate = true;
    this.faceMaterial = faceMat;
    this.revealMaterial = o.revealMaterial
      ?? new THREE.MeshStandardMaterial({ color: 0x241f19, roughness: 0.94 });

    /**
     * ---------------------------------------------------------------------------
     * DEMOTION — the other end of the same idea, and `docs/design/dig.md` is what forced it.
     * ---------------------------------------------------------------------------
     * This file's original note said there is NO demotion, deliberately, because *"a run can
     * only damage a handful of panels"*. Segmentation ends that. **Measured**
     * (`harness/scenarios/dig-promoted.mjs`, seed s4, twelve parked stations): with 36 segments
     * in two walls driven to the barrier, **37 of 58 panels promoted and `ballroom.centre` went
     * 545 -> 796 against a 625 budget** — from four rooms away, because a panel is drawn while
     * EITHER space it joins is resident and 188 of its own layer planes were on screen at once.
     * The pristine half of this file held perfectly; the promoted half is what broke.
     *
     * A **SPENT** panel — `wall.js` `spent`: last stage of its own table, undamageable, and can
     * never open — has an appearance that is a CONSTANT. `applyStageBreaks` at the terminal
     * stage with a per-stage progress of exactly 0 gives the same four break amounts for every
     * such panel, the break field is a cached texture shared by key, and the layer planes are
     * unit-UV quads, so two spent panels of one aperture are the *same picture*. That is exactly
     * the condition instancing needs, and it is the same argument the pristine face already
     * rests on — read from the other end of the state machine.
     *
     * ⚠️ **AND IT IS INERT ON THE SHIPPED BUILD BY CONSTRUCTION, NOT BY A SECOND FLAG.** `spent`
     * requires `!canOpen()`, and every stage table that shipped ends at `open`. `?dig=0` never
     * produces a spent panel, so these groups are never even constructed — `demote` is false —
     * and the arm-off build does not pay so much as a shader compile for this paragraph.
     */
    this.demote = !!o.demote;
    this.spentMaterials = null;
    if (this.demote) {
      const spent = wallStageMaterials().slice(0, 4);
      for (let i = 0; i < 4; i++) {
        applyBreakMask(spent[i], BREAK_CFG[i]);
        // ⚠️ The same one key as the pristine face — see there. Four spent layers emitting one
        // shader four times is the per-panel-per-layer waste in miniature, and it is only
        // constructed on the `demote` arm (`?dig=bays`), which is why it was never the headline.
        pinProgramKey(spent[i], 'rrr-wall|stage');
        // 🕳️ Same reason as the pristine face and as `wall.js`'s scalar layers: a spent panel is
        // still filling a hole with a room on each side of it. `spent` is false for every free
        // face (`wall.js`), so this set is scalar-arm by construction and the dig is untouched.
        spent[i].side = THREE.DoubleSide;
        spent[i].name = `wall.spent.layer${i}`;
      }
      // ⚠️ DERIVED BY CALLING THE SAME FUNCTION `wall.js._apply()` CALLS, at the terminal stage
      // with progress 0 — never by copying four numbers out of it. If `applyStageBreaks` is
      // retuned, the shared spent look follows it instead of quietly diverging from the panel it
      // is standing in for. `dig-demote.mjs` asserts the two agree to the uniform.
      applyStageBreaks(spent, spent.length, 0);
      for (const m of spent) m.needsUpdate = true;
      this.spentMaterials = spent;
    }

    // ---- group by AUTHORED aperture. Seed-independent by construction; see the header.
    const byKey = new Map();
    for (const p of panels) {
      const key = `${p.width.toFixed(4)}x${p.height.toFixed(4)}x${p.thickness.toFixed(4)}`
        + apertureKey(p);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(p);
    }

    for (const [key, members] of byKey) {
      const ref = members[0];
      const g = {
        key, members,
        // 🚪 the same two functions `wall.js` builds its OWN meshes with, called with the same
        // arguments — the header's rule, and it is what keeps an instanced pristine face a
        // pixel-for-pixel substitute for the per-panel one now that a face can have a hole in it.
        // 🎨 ONE geometry for every coat sub-group in this group — the coat changes the material,
        // never the shape, so a split must not duplicate a vertex buffer. `dispose()` frees it
        // once, through a Set, for exactly this reason.
        faceGeometry: facePlaneGeometry(ref.width, ref.height, ref.apertures),
        faces: [],
        reveal: this._mesh(revealGeometry(ref.width, ref.height, ref.thickness, ref.apertures),
          this.revealMaterial, `wall.pristine.reveal.${key}`, members.length),
      };
      // The layer plane sits at local z = 0 and the reveal runs back from it — same as
      // `wall.js`. Both meshes take the panel's own world transform, so nothing else moves.
      parent.add(g.reveal);
      this._buildFaces(g);
      /**
       * The SPENT set: all four layer planes plus the reveal, one `InstancedMesh` each.
       *
       * ⚠️ THE DEPTH OFFSET IS BAKED INTO THE GEOMETRY, NOT INTO THE MATRIX. `wall.js` puts each
       * layer at `mesh.position.z = DEPTHS[i]` in the PANEL's local frame; translating the plane
       * by the same amount here means one instance matrix — the panel's own world transform —
       * drives all five meshes, exactly as it drives the two pristine ones. A per-mesh matrix
       * product would be five decompositions per panel per sync for no benefit and one more
       * place for the two paths to drift apart.
       */
      if (this.demote) {
        g.spent = this.spentMaterials.map((mat, i) => {
          const geo = new THREE.PlaneGeometry(ref.width, ref.height, 1, 1);
          geo.translate(0, 0, DEPTHS[i]);
          return this._mesh(geo, mat, `wall.spent.${i}.${key}`, members.length);
        });
        g.spentReveal = this._mesh(revealGeometry(ref.width, ref.height, ref.thickness),
          this.revealMaterial, `wall.spent.reveal.${key}`, members.length);
        parent.add(...g.spent, g.spentReveal);
      }
      this.groups.push(g);
      for (const p of members) {
        p.onPromote = () => this.sync();
        /**
         * 🎨 **THE HOOK THAT MAKES `[C]` REACH AN UNTOUCHED FACE.** `wall.js` `setCoatArm` calls
         * `recoat()` on every panel and `recoat()` fires this; a face's coat decides which shared
         * mesh draws it, so the grouping is now stale and has to be rebuilt. Deferred to the next
         * `sync()` — which `room.setViewpoints` runs every frame — so 28 re-coats cost ONE regroup
         * and not 28. `room.js` wraps `onPromote`; nothing wraps this, so `=` is safe here in a
         * way it is not there.
         */
        p.onRecoat = () => { this._regroup = true; };
      }
    }

    this.sync(true);
  }

  /**
   * 🎨 **SPLIT ONE GEOMETRY GROUP'S FACE BY COAT — one `InstancedMesh` per distinct coat.**
   *
   * On arm 0 every panel's `coatKey()` is the empty string, so this produces exactly ONE face
   * mesh per group wearing exactly the shared damask material: the pre-change build, by
   * construction rather than by inspection.
   *
   * ⚠️ **THE SLOT MAP IS TWO PARALLEL ARRAYS AND NOT A `Map`,** because `sync()` walks it once
   * per member per frame for every group in the house.
   */
  _buildFaces(g) {
    const byCoat = new Map();
    for (let i = 0; i < g.members.length; i++) {
      const ck = coatKey(g.members[i]);
      if (!byCoat.has(ck)) byCoat.set(ck, []);
      byCoat.get(ck).push(i);
    }
    g.faceSub = new Int32Array(g.members.length);
    g.faceIdx = new Int32Array(g.members.length);
    g.faces = [];
    for (const [ck, idxs] of byCoat) {
      const sub = g.faces.length;
      const { mat, owned } = this._faceMaterialFor(ck, g.members[idxs[0]]);
      const mesh = this._mesh(g.faceGeometry, mat, `wall.pristine.face.${g.key}${ck}`, idxs.length);
      for (let k = 0; k < idxs.length; k++) { g.faceSub[idxs[k]] = sub; g.faceIdx[idxs[k]] = k; }
      g.faces.push({ coatKey: ck, members: idxs, mesh, material: mat, owned });
      this.parent.add(mesh);
    }
    g._fLive = new Int32Array(g.faces.length);
  }

  /**
   * 🎨 **THE MATERIAL A COAT GROUP DRAWS WITH — the room's own skin, at break 0, forever.**
   *
   * 🚨 **IT IS A NEW INSTANCE AND IT MUST BE.** `wall.js`'s founding constraint is that the break
   * amount lives ON the material, so a face's own `mats[0]` can never be handed to a shared
   * `InstancedMesh` — one blow would open a hole in every face wearing that coat. `wall.js`
   * `panelCoatMaterial()` returns a fresh material over the baker's CACHED textures, which
   * `_coat1-programs.mjs` B1 measured at +0 bakes and 0.00 MB.
   *
   * ⚠️ **`coatbake-1` RULED AN INSTANCED ATTRIBUTE OUT FOR THE DAMAGED POPULATION, AND THE RULING
   * DOES NOT TRANSFER — but it does not help here either.** Its argument is that every damaged
   * face needs its own material because the break uniform lives there; a PRISTINE face has no
   * per-face state, which is exactly why it is instanced at all. So an attribute selecting the
   * room's coat is available in principle — and it would still need every room's albedo, normal
   * and ORM in one sampler, i.e. a texture array or an atlas, which is `coatbake-1`'s shape (iii):
   * a NEW bake, +16 MB, and the coat decoupled from the room's wall bake. **Measured cost of the
   * material split instead: +5 draw calls at the worst station.** An attribute cannot beat that.
   *
   * ⚠️ **`patchForScreenAO` IS CALLED EXPLICITLY, AND IT IS NOT OPTIONAL FOR A LIVE `[C]` FLIP.**
   * `finalizeScene()` walks the graph once and patches every standard material it finds, so a
   * material built during construction gets it for free — and one built on a key press does not.
   * Without this line a live-flipped coat would draw with no screen-space AO and a different
   * program key, so the A/B John looks at would be measuring my bookkeeping. The function is
   * idempotent (`_patched` WeakSet), so calling it on the construction-time path costs nothing.
   *
   * ⚠️ **THE BREAK FIELD IS THE SHARED DAMASK FACE'S, NOT THE ROOM BAKE'S.** At `uBreak` 0 it is
   * inert either way — nothing is discarded — so this is chosen for the SAME reason `estateSkinMat`
   * chooses it: the only difference between a coated pristine face and the damask one it replaces
   * should be the bake. `baker.js` defaults `Surf.breakOrder` to 1.0 ("never breaks"), so letting
   * it fall through to the room ORM's alpha would be a silent second difference.
   */
  _faceMaterialFor(ck, rep) {
    if (!ck) return { mat: this.faceMaterial, owned: false };
    const m = panelCoatMaterial(rep);
    // No room, no bake → the shared damask, which is what this face draws today. A face that
    // could not be resolved must be TELLABLE from one that was, so it keeps the shared material's
    // name (`wall.pristine.face`) and a probe comparing names sees the mismatch.
    if (!m) return { mat: this.faceMaterial, owned: false };
    applyBreakMask(m, { ...BREAK_CFG[0], breakField: this.faceMaterial.roughnessMap ?? null });
    setBreak(m, 0);
    pinProgramKey(m, 'rrr-wall|stage');
    patchForScreenAO(m);
    // 🕳️ Same reason as the shared damask face — see there. A pristine face has no hole in it from
    // either direction, and this material is only ever worn by an `InstancedMesh`.
    m.side = THREE.DoubleSide;
    m.needsUpdate = true;
    return { mat: m, owned: true };
  }

  /** Tear the face sub-meshes down and rebuild them for the current coat arm. Geometry survives. */
  _rebuildFaces() {
    for (const g of this.groups) {
      for (const f of g.faces) {
        f.mesh.removeFromParent();
        f.mesh.dispose();
        if (f.owned) f.material.dispose();
      }
      this._buildFaces(g);
    }
  }

  _mesh(geo, mat, name, n) {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    m.name = name;
    m.castShadow = false;
    m.receiveShadow = true;
    // The instances are scattered over the whole house, so a bounding sphere around them IS
    // the house: culling could never fire and would cost a recompute. `exterior.js`'s dressing
    // made the same call for the same reason. Whole-group visibility is handled in `sync()`.
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.count = Math.max(1, n);
    return m;
  }

  /**
   * Hand every panel back its own meshes (off), or take them away again (on).
   *
   * ⚠️ `_sig` MUST BE CLEARED. `sync()` early-outs on an unchanged signature, so without this a
   * re-enable is a no-op and the groups stay hidden. The first version of `inst-census.mjs` hit
   * exactly that from the other end and spent eleven stations measuring a build it had broken
   * itself, reporting "instanced draws 0" as if the feature were absent.
   */
  enable(on) {
    this.enabled = !!on;
    if (!this.enabled) {
      for (const g of this.groups) {
        for (const f of g.faces) f.mesh.visible = false;
        g.reveal.visible = false; g.live = 0; g.liveSpent = 0;
        for (const m of g.spent ?? []) m.visible = false;
        if (g.spentReveal) g.spentReveal.visible = false;
      }
      for (const p of this.panels) p.setInstanced(false);
      this._sig = '';
      return;
    }
    this._sig = '';
    this.sync(true);
  }

  /**
   * DEMOTION ON ITS OWN SWITCH, so the +/- of it is measurable inside ONE frozen frame.
   *
   * `room.setWallMode()`'s reason, and this file's own: this project's rule is that a change
   * shipping without an ablation cannot be judged later, and an A/B across two page loads
   * compares two random states — `game.play`'s grain alone makes two ADJACENT same-mode frames
   * differ as much as any A/B. Only reachable on a build that HAS the spent groups (`?dig=1`);
   * it reports what it actually did.
   */
  enableDemote(on) {
    if (!this.spentMaterials) return false;
    this.demote = !!on;
    this._sig = '';
    this.sync(true);
    return this.demote;
  }

  /**
   * Write the instance matrices from the panels' CURRENT state.
   *
   * Called from `room.setViewpoints` (residency has just decided what is on screen) and again
   * from any panel's promote hook, so a wall that is hit after residency ran this frame does
   * not spend one frame being drawn as intact.
   *
   * ⚠️ **`wantVisible` IS RESIDENCY'S ANSWER INCLUDING THE PARENT GATE, AND IT HAS TO BE.**
   * A panel is parented to ONE of the two spaces it joins, so today its effective visibility is
   * `ownerSpace.visible && (a.visible || b.visible)` — the `p.root.visible` line in `room.js`
   * cannot override a hidden parent. These meshes hang off the ROOM root and have no such
   * parent, so if the instance used the raw either-space test it would draw panels the current
   * build does not, and the A/B would report a difference that is my bookkeeping rather than
   * the picture. `room.js` computes the effective value and caches it on the panel.
   */
  sync(force = false) {
    if (!this.enabled) return;
    /**
     * 🎨 **A RE-COAT CHANGES WHICH SHARED MESH DRAWS A FACE, SO IT HAS TO REGROUP BEFORE THE
     * SIGNATURE IS EVEN CONSULTED.** `coatKey()` is part of the grouping and not of the sig — the
     * sig is (visible, pristine, spent), none of which a coat moves — so an arm flip would
     * otherwise early-out and leave every face in its old group. That is `inst-census.mjs`'s
     * recorded `_sig` failure with a new cause, so the force is set here rather than hoped for.
     */
    if (this._regroup) { this._regroup = false; this._rebuildFaces(); this._sig = ''; force = true; }
    // ⚠️ THREE INSTANCED STATES NOW, NOT TWO, AND THE SIGNATURE HAS TO CARRY ALL OF THEM. It is
    // the early-out for the whole sync; a signature that cannot tell "promoted" from "spent"
    // would leave a panel that just bottomed out drawing its own five meshes forever.
    let sig = '';
    for (const p of this.panels) {
      sig += p.wantVisible ? (p.pristine ? '2' : (this.demote && p.spent ? '3' : '1')) : '0';
    }
    if (!force && sig === this._sig) return;
    this._sig = sig;

    for (const g of this.groups) {
      let live = 0, liveSpent = 0;
      g._fLive.fill(0);
      for (let i = 0; i < g.members.length; i++) {
        const p = g.members[i];
        // ⚠️ `setInstanced` is keyed on the PANEL'S STATE ALONE, not on whether residency shows
        // it. A pristine (or spent) panel that residency has hidden must still have its own
        // meshes off, or hiding it by matrix and showing it by mesh cancel out and nothing is
        // saved. That was true for `pristine` and it is true for `spent` in exactly the same way.
        const spent = this.demote && !!g.spent && p.spent;
        p.setInstanced(p.pristine || spent);
        const show = (p.pristine || spent) && p.wantVisible;
        if (show) {
          // The panel's own WORLD transform, decomposed — not its local position and `rotY`.
          // A space root that ever gets a transform would silently leave the instances behind
          // in a way that only shows up in one room.
          p.root.updateWorldMatrix(true, false);
          p.root.matrixWorld.decompose(_p, _q, _s);
          _m.compose(_p, _q, _s);
        }
        const asPristine = show && !spent;
        const asSpent = show && spent;
        // 🎨 the face's slot is in its COAT sub-group; the reveal's is the group's own index.
        const sub = g.faceSub[i];
        g.faces[sub].mesh.setMatrixAt(g.faceIdx[i], asPristine ? _m : _zero);
        g.reveal.setMatrixAt(i, asPristine ? _m : _zero);
        if (g.spent) {
          for (const q of g.spent) q.setMatrixAt(i, asSpent ? _m : _zero);
          g.spentReveal.setMatrixAt(i, asSpent ? _m : _zero);
        }
        if (asPristine) { live++; g._fLive[sub]++; }
        if (asSpent) liveSpent++;
      }
      // A group with nothing live costs nothing, and that is now asked PER COAT: on arm 0 there
      // is one sub-group and this is the pre-change line, character for character.
      for (let j = 0; j < g.faces.length; j++) {
        g.faces[j].mesh.instanceMatrix.needsUpdate = true;
        g.faces[j].mesh.visible = g._fLive[j] > 0;
      }
      g.reveal.instanceMatrix.needsUpdate = true;
      g.reveal.visible = live > 0;
      if (g.spent) {
        for (const q of g.spent) { q.instanceMatrix.needsUpdate = true; q.visible = liveSpent > 0; }
        g.spentReveal.instanceMatrix.needsUpdate = true;
        g.spentReveal.visible = liveSpent > 0;
      }
      g.live = live;
      g.liveSpent = liveSpent;
    }
  }

  /**
   * What a probe needs to assert seed-independence without reaching into three.js.
   *
   * ⚠️ **`groups` IS STILL THE GEOMETRY GROUP COUNT AND `meshes` IS STILL THE REAL MESH COUNT** —
   * `dig-toggle.mjs` divides one by the other to price demotion, so a coat split must not read as
   * a demotion cost. On arm 0 `faceGroups === groups` and both fields are what they always were.
   */
  census() {
    const faceGroups = this.groups.reduce((n, g) => n + g.faces.length, 0);
    return {
      groups: this.groups.length,
      faceGroups,
      coatArm: coatArm(),
      meshes: faceGroups + this.groups.length * (this.spentMaterials ? 6 : 1),
      slots: this.groups.reduce((n, g) => n + g.members.length, 0),
      live: this.groups.reduce((n, g) => n + (g.live ?? 0), 0),
      liveSpent: this.groups.reduce((n, g) => n + (g.liveSpent ?? 0), 0),
      drawing: this.groups.reduce((n, g) => n
        + g.faces.reduce((k, f) => k + (f.mesh.visible ? 1 : 0), 0)
        + (g.reveal.visible ? 1 : 0)
        + (g.spent && g.spent[0].visible ? 5 : 0), 0),
      demote: this.demote && !!this.spentMaterials,
      keys: this.groups.map((g) => g.key),
      /** 🎨 one row per drawn coat: the mesh, the material NAME (the baker key), how many faces. */
      coats: this.groups.flatMap((g) => g.faces.map((f) => ({
        key: g.key, coatKey: f.coatKey, mesh: f.mesh.name,
        material: f.material.name, type: f.material.type,
        members: f.members.length, visible: f.mesh.visible, owned: f.owned,
      }))),
    };
  }

  dispose() {
    // ⚠️ ONE GEOMETRY IS SHARED BY EVERY COAT SUB-MESH IN A GROUP — free it once, or the second
    // `dispose()` is a use-after-free on a buffer three has already released.
    const geos = new Set();
    for (const g of this.groups) {
      for (const f of g.faces) {
        f.mesh.removeFromParent(); f.mesh.dispose();
        if (f.owned) f.material.dispose();
      }
      geos.add(g.faceGeometry);
      for (const m of [g.reveal, ...(g.spent ?? []), g.spentReveal].filter(Boolean)) {
        m.removeFromParent(); geos.add(m.geometry); m.dispose();
      }
    }
    for (const geo of geos) geo.dispose();
    this.faceMaterial.dispose();
    for (const m of this.spentMaterials ?? []) m.dispose();
    this.groups.length = 0;
  }
}
