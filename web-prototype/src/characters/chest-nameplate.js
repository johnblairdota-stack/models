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

const TAG_W = 0.210;
const TAG_H = 0.048;
/** Gap from the wordmark's bottom edge to the plate's top edge, metres. */
const UNDER_GAP = 0.012;
const LIFT = 0.004;

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
  g.fillStyle = INK;
  round(10, 10, 492, 108, 16);
  g.fill();

  const text = String(label || '').trim().slice(0, NAME_CAP).toUpperCase();
  if (!text) return null;
  g.fillStyle = SHELL;
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
   * ⚠️ PARENT TO `player.model`, NOT THE SPINE. A Mixamo Spine has +Y up the bone; hanging a
   * +Z plane there with an inverted bind quat put the plate inside the shell or edge-on, which
   * is why a live graph could report `chestName` while the TV still showed a blank sternum.
   * `model` yaws with the body (`Player.root.rotation.y`) and +Z is the figure's front, so
   * identity in this frame is "printed on the chest". Walk bounce on the skinned wordmark is a
   * couple of centimetres; the plate staying put is the point, not a defect.
   */
  const parent = player.model || player.root;
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
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'chestName';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.ownedTex = tex;

  parent.updateWorldMatrix(true, true);

  const H = player.height || 1.7;
  const expected = new THREE.Vector3(0, H * 0.698, H * 0.078);
  const world = new THREE.Vector3();
  const box = markWorldBox(mark);
  if (box && Number.isFinite(box.min.y)) {
    world.set(
      (box.min.x + box.max.x) * 0.5,
      box.min.y - UNDER_GAP - TAG_H * 0.5,
      box.max.z + LIFT,
    );
  } else {
    world.copy(expected);
    parent.localToWorld(world);
  }

  const local = world.clone();
  parent.worldToLocal(local);
  if (local.distanceTo(expected) > 0.40) local.copy(expected);
  local.x = 0;
  mesh.position.copy(local);
  mesh.quaternion.identity();
  parent.add(mesh);
  return mesh;
}
