import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * MOUNT A CONDITIONED SHELL ONTO THE PROCEDURAL RIG — John's hybrid, 2026-08-15.
 *
 * `buildUnit4H` keeps everything it is good at: the skeleton, `setPose`, the stage scaling, the
 * draw-call collapsing. What it stops owning is the SHELL GEOMETRY, which now comes from a
 * generated mesh that `tools/condition_asset.py` has already split into one part per joint.
 *
 * THE MOUNT IS TRIVIAL BECAUSE THE CONDITIONING DID THE WORK. Each part is named for its joint
 * and its ORIGIN SITS ON THAT JOINT in bind pose (contract §6.1), so attaching it is a reparent
 * that preserves world transform — `Object3D.attach()`, not `add()`. Using `add()` would drop
 * the part's world offset into the joint's local space and scatter the character across the
 * scene, which is the single most likely way to get this wrong.
 *
 * ⚠️ THE RIG MUST BE IN BIND POSE WHEN THIS RUNS. The parts were cut against the bind-pose joint
 * positions dumped by `harness/rig-joints.mjs`; attaching them to a POSED skeleton bakes that
 * pose into every local transform and the shell is permanently bent. Pose AFTER mounting, never
 * before — that is the whole point of doing it this way.
 *
 * ⚠️ AND THE RIG MUST BE AT THE ORIGIN, TOO. `attach()` preserves WORLD transform, which is what
 * makes it right for a bind-pose mount — but it means a rig that has already been moved leaves
 * the parts standing where the GLB authored them, at world zero, with a compensating local
 * offset. They still pose correctly, because they really are children of the joints, so the
 * failure is invisible until something else in the scene reveals the rig's true position: the
 * first mount here produced a shell at x=0 and its own chrome hardware at x=0.6, read as three
 * figures in a two-figure scene. MOUNT FIRST, PLACE THE CHARACTER AFTERWARDS.
 */

/**
 * PER-ASSET JOINT CALIBRATION — move the rig's pivots onto the mesh's actual limb axes.
 *
 * John spotted this by eye: in the generated GLB the thigh meets the pelvis at an angle.
 * `tools/probe_parts.py` measured it — the rig's hip bone is dead vertical (0,0,-1) while the
 * mesh's thighs splay out and forward by 3.5 and 4.0 degrees, with the hip pivot sitting 9mm
 * inboard of the thigh's own axis. A limb rotated about a pivot that is off its axis does not
 * bend, it SCYTHES, and the error grows with the angle.
 *
 * The rig is the thing that moves, not the mesh — John's call, and the right one: the splay is
 * anatomy the generator got right and the perfectly-vertical bone is the artificial part.
 *
 * ⚠️ NO EDIT TO unit4h.js IS NEEDED, and that matters because it is 3,700 lines that every other
 * view depends on. A joint is a plain Object3D, so its pivot can be nudged from outside. The
 * only rule is ORDER: calibrate BEFORE mounting. `attach()` preserves world transform, so a
 * pivot moved first leaves the geometry exactly where the GLB authored it while the rotation
 * centre lands on the limb's true axis. Moved afterwards, it drags the shell with it.
 *
 * Offsets are LOCAL and the chain is nested (hip -> knee -> ankle), so each value is the delta
 * on top of its parent, not an absolute position.
 */
export const UNIT4H_MESH_CALIBRATION = {
  hipL: [-0.0094, 0, 0], hipR: [0.0094, 0, 0],
  kneeL: [-0.0150, 0, 0], kneeR: [0.0150, 0, 0],
  ankleL: [-0.0030, 0, 0], ankleR: [0.0030, 0, 0],
};

export function calibrateJoints(unit, offsets = UNIT4H_MESH_CALIBRATION) {
  const applied = [];
  for (const [name, [dx, dy, dz]] of Object.entries(offsets)) {
    const j = unit.joints?.[name];
    if (!j) continue;
    j.position.x += dx;
    j.position.y += dy;
    j.position.z += dz;
    applied.push(name);
  }
  unit.root.updateWorldMatrix(true, true);
  return applied;
}

/** Parts are named `<class>__<joint>` by the conditioning script. */
function jointOf(name) {
  const i = name.indexOf('__');
  return i < 0 ? null : name.slice(i + 2).replace(/\.\d+$/, '');
}

export async function loadMeshShell(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  return gltf.scene;
}

/**
 * @param {object} unit   the object returned by buildUnit4H, in BIND POSE
 * @param {THREE.Object3D} shell  the loaded, conditioned, split GLB scene
 * @param {object} [opts]
 * @param {THREE.Material} [opts.material]  palette material applied to every part (plan Step 6)
 * @param {boolean} [opts.hideOriginal=true]  hide the rig's own procedural shell meshes
 */
export function mountMeshShell(unit, shell, opts = {}) {
  const { material = null, hideOriginal = true } = opts;
  const joints = unit.joints ?? {};

  /*
   * Hide the procedural shell FIRST and record what we hid. Doing it after the mount would also
   * hide the parts we just attached, since they become children of the same joints — a bug that
   * presents as "the mesh loaded but the character is invisible".
   */
  /*
   * ⚠️ KEEP THE RIG'S JOINT HARDWARE. Rigid parts SEPARATE when a joint rotates — there are no
   * skin weights, so an elbow bend opens a visible gap between upper arm and forearm. The first
   * mount showed exactly that at the elbow and the knee.
   *
   * The fix is not skinning. `unit4h` already builds chrome ball joints and drive discs at every
   * elbow, knee and shoulder, and those are precisely the parts that cover a rotating seam on a
   * real machine — which is why a robot can be rigid-parted at all where a person could not.
   * Contract §6 already assigns them to the rig rather than to a generated part. So hide only
   * the SHELL PANELS the mesh replaces, and let the rig keep its mechanism.
   */
  const keep = new Set(opts.keepMaterials ?? []);
  const hidden = [];
  if (hideOriginal) {
    unit.root.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      if (keep.size && keep.has(mat)) return;
      o.visible = false;
      hidden.push(o);
    });
  }

  // Collect first: attaching mutates the child list we would otherwise be iterating.
  const parts = [];
  shell.traverse((o) => { if (o.isMesh) parts.push(o); });

  const mounted = [];
  const orphans = [];
  for (const part of parts) {
    const key = jointOf(part.name);
    const joint = key && joints[key];
    if (!joint) { orphans.push(part.name); continue; }
    if (material) part.material = material;
    part.castShadow = true;
    part.receiveShadow = true;
    joint.updateWorldMatrix(true, false);
    joint.attach(part);          // preserves world transform — see the note above
    mounted.push({ part: part.name, joint: key, obj: part });
  }

  /*
   * An orphan is a part whose joint the rig does not have, and it is a REAL failure, not a
   * cosmetic one: that geometry silently vanishes from the character. It happens when the bone
   * table in the conditioning script and the rig's joint names drift apart, which is exactly
   * what re-running `harness/rig-joints.mjs` after a skeleton change is supposed to prevent.
   */
  return { mounted, orphans, hidden, jointCount: Object.keys(joints).length };
}

/**
 * PUSH A RIG MESH PROUD OF THE GENERATED SHELL — the wordmark fix.
 *
 * ⚠️ THIS IS NOT THE FACE PROBLEM AND MUST NOT BE SOLVED THE SAME WAY. The face aperture works
 * because the faceplate FILLS the hole it cuts. The brand decal is a thin projected plane lying
 * ON the chest surface: cut a hole for it and you are looking through the chest into an empty
 * body cavity with a logo floating in it. The shell must stay closed and the decal must come
 * forward instead.
 *
 * How far forward is measured, not guessed — the generated chest is thicker than the procedural
 * one by an amount nobody knows in advance. Cast a ray from in front of the character back
 * toward the decal's centre, take the first shell hit as the true front surface, and place the
 * decal just proud of it. If the ray misses, the decal is not behind anything and nothing moves.
 */
export function pushProud(unit, shellParts, mesh, margin = 0.005) {
  if (!mesh || !shellParts.length) return 0;
  const box = new THREE.Box3().setFromObject(mesh);
  const centre = box.getCenter(new THREE.Vector3());
  const fwd = new THREE.Vector3(0, 0, 1)
    .applyQuaternion(unit.root.getWorldQuaternion(new THREE.Quaternion())).normalize();

  const from = centre.clone().addScaledVector(fwd, 1.0);
  const hits = new THREE.Raycaster(from, fwd.clone().negate(), 0, 2.0)
    .intersectObjects(shellParts, true);
  if (!hits.length) return 0;

  // Signed distance from the decal's centre to the shell surface, along forward.
  const need = hits[0].point.clone().sub(centre).dot(fwd) + margin;
  if (need <= 0) return 0;                    // already proud
  mesh.translateZ(need);
  mesh.updateWorldMatrix(true, false);
  return need;
}

/** Convenience: load, mount, and throw loudly if anything did not find a home. */
export async function attachMeshShell(unit, url, opts = {}) {
  const shell = await loadMeshShell(url);
  const res = mountMeshShell(unit, shell, opts);
  if (!res.mounted.length) {
    throw new Error(`mesh-shell: ${url} mounted 0 parts — joint names do not match the rig ` +
      `(rig has ${res.jointCount} joints). Re-run harness/rig-joints.mjs and re-condition.`);
  }
  if (res.orphans.length) {
    console.warn(`[mesh-shell] ${res.orphans.length} part(s) had no matching joint and are NOT ` +
      `attached: ${res.orphans.join(', ')}`);
  }
  console.log(`[mesh-shell] mounted ${res.mounted.length}/${res.mounted.length + res.orphans.length} parts onto ${res.jointCount} joints`);
  return res;
}
