import * as THREE from 'three';

/**
 * 🏷️ **THE CHEST NAME TAG — under the 4Humanity wordmark, not a floating face card.**
 *
 * Live playtest: names sat wrong (face-only / hovering off the body). The brand mark is already
 * printed on the chest (`mesh-identity` wordmark on Meshy, `unit4h` `decal` on the procedural
 * fallback). The published lobby name belongs in the same place: a small shell plate with navy
 * ink, seated on the sternum just below the lockup.
 *
 * STYLE_CONTRACT colours only: shell `#EDEFF0`, chrome `#B9BEC2`, ink `#054E84`.
 *
 * Parent is the chest joint / spine bone so a walk or a flair carries the plate with the torso
 * instead of leaving it in bind-pose air in front of the ribs.
 */

const INK = '#054E84';
const SHELL = '#EDEFF0';
const CHROME = '#B9BEC2';
const NAME_CAP = 12;

const TAG_W = 0.168;
const TAG_H = 0.038;
/** Gap from the wordmark's bottom edge to the plate's top edge, metres. */
const UNDER_GAP = 0.010;
const LIFT = 0.0016;

function paintPlate(label) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 128);

  const round = (x, y, w, h, r) => {
    const rr = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + rr, y);
    g.arcTo(x + w, y, x + w, y + h, rr);
    g.arcTo(x + w, y + h, x, y + h, rr);
    g.arcTo(x, y + h, x, y, rr);
    g.arcTo(x, y, x + w, y, rr);
    g.closePath();
  };

  g.fillStyle = CHROME;
  round(0, 0, 512, 128, 22);
  g.fill();
  g.fillStyle = SHELL;
  round(10, 10, 492, 108, 16);
  g.fill();

  const text = String(label || '').trim().slice(0, NAME_CAP).toUpperCase();
  if (!text) return null;
  g.fillStyle = INK;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 72;
  g.font = `700 ${size}px ui-sans-serif, system-ui, sans-serif`;
  while (size > 28 && g.measureText(text).width > 460) {
    size -= 4;
    g.font = `700 ${size}px ui-sans-serif, system-ui, sans-serif`;
  }
  g.fillText(text, 256, 66);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function findNamed(root, names) {
  let found = null;
  const want = new Set(names);
  root?.traverse?.((o) => {
    if (found) return;
    if (want.has(o.name)) found = o;
  });
  return found;
}

function findBone(root, names) {
  let found = null;
  const want = new Set(names);
  root?.traverse?.((o) => {
    if (found) return;
    if (o.isBone && want.has(o.name)) found = o;
  });
  return found;
}

/**
 * World-space box of a mark, or null. Wordmark geometry is authored in bind-pose world
 * metres; the unit4h decal lives in chest-local space. `matrixWorld` puts both in the
 * same frame so "just under the logo" is a measurement, not a guess.
 */
function markWorldBox(mark) {
  if (!mark?.geometry) return null;
  if (!mark.geometry.boundingBox) mark.geometry.computeBoundingBox();
  const box = mark.geometry.boundingBox?.clone();
  if (!box) return null;
  mark.updateWorldMatrix(true, false);
  box.applyMatrix4(mark.matrixWorld);
  return box;
}

/**
 * @param {object} player  a `Player` — avatar Meshy clone and/or hidden unit4h rig
 * @param {string} name    published lobby name
 * @returns {THREE.Mesh|null}
 */
export function attachChestNameTag(player, name) {
  const label = String(name || '').trim().slice(0, NAME_CAP);
  if (!label || !player) return null;

  const tex = paintPlate(label);
  if (!tex) return null;

  const avatarRoot = player.avatar?.root;
  const unitRoot = player.unit?.root;
  const search = avatarRoot || unitRoot || player.model || player.root;
  const mark = findNamed(search, ['wordmark', 'decal']);

  /*
   * ⚠️ PARENT THE PLATE TO THE TORSO THAT IS ON SCREEN. With a Meshy body the procedural
   * unit is hidden (`Player._hideProceduralBody`); hanging the tag on `j.chest` would put
   * a correctly seated plate on a mesh nobody can see, and the clone's chest would stay
   * blank. Spine is the same bone the wordmark skins to.
   */
  const parent = avatarRoot
    ? (findBone(avatarRoot, ['Spine', 'Spine01', 'Spine02']) || avatarRoot)
    : (player.unit?.joints?.chest || player.model || player.root);
  if (!parent) {
    tex.dispose();
    return null;
  }

  const geo = new THREE.PlaneGeometry(TAG_W, TAG_H, 1, 1);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    toneMapped: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'chestName';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.ownedTex = tex;

  parent.updateWorldMatrix(true, true);

  const world = new THREE.Vector3();
  const box = markWorldBox(mark);
  if (box && Number.isFinite(box.min.y)) {
    world.set(
      (box.min.x + box.max.x) * 0.5,
      box.min.y - UNDER_GAP - TAG_H * 0.5,
      box.max.z + LIFT,
    );
  } else {
    /*
     * No mark (identity kit skipped). Sternum of a 1.7 m figure, just below where the
     * wordmark sits (0.731 H) — still on the chest, never the face.
     */
    const H = player.height || 1.7;
    world.set(0, H * 0.695, H * 0.072);
    (player.model || player.root).localToWorld(world);
  }

  /*
   * World quaternion identity at bind = PlaneGeometry +Z down the figure's front. Local is
   * the inverse of the torso's bind rotation so a pitched `j.chest` or a Mixamo Spine (whose
   * +Y is up the bone) does not print the name along the neck. After attach, a walk yaw or
   * a flair carries the plate with the torso.
   */
  const local = world.clone();
  parent.worldToLocal(local);
  mesh.position.copy(local);
  const parentQ = new THREE.Quaternion();
  parent.getWorldQuaternion(parentQ);
  mesh.quaternion.copy(parentQ.invert());
  parent.add(mesh);
  return mesh;
}
