import * as THREE from 'three';

/**
 * 🏷️ **HEAD BILLBOARD NAME — above the visor, always facing the TV camera.**
 *
 * Live playtest after #39: navy chest badges under 4Humanity were the wrong language.
 * John: bigger, clearer, floating ABOVE the head, and a billboard so every ballroom
 * angle still reads the name. `THREE.Sprite` faces the rendering camera for free.
 *
 * STYLE_CONTRACT colours only: shell `#EDEFF0`, chrome `#B9BEC2`, ink `#054E84`.
 */

const INK = '#054E84';
const SHELL = '#EDEFF0';
const CHROME = '#B9BEC2';
const NAME_CAP = 12;

/** World metres. Larger than the old 0.21 × 0.048 chest plate so a ringside TV can read it. */
const TAG_W = 0.56;
const TAG_H = 0.16;
/** Gap from the crown of a 1.7 m body to the plate centre. */
const ABOVE = 0.22;

function paintPlate(label) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 1024, 256);

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
  round(0, 0, 1024, 256, 36);
  g.fill();
  g.fillStyle = INK;
  round(16, 16, 992, 224, 28);
  g.fill();

  const text = String(label || '').trim().slice(0, NAME_CAP).toUpperCase();
  if (!text) return null;
  g.fillStyle = SHELL;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 148;
  g.font = `800 ${size}px ui-sans-serif, system-ui, sans-serif`;
  while (size > 48 && g.measureText(text).width > 920) {
    size -= 6;
    g.font = `800 ${size}px ui-sans-serif, system-ui, sans-serif`;
  }
  g.fillText(text, 512, 132);

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
 * @param {object} player  a `Player`
 * @param {string} name    published lobby name
 * @returns {THREE.Sprite|null}
 */
export function attachHeadNameTag(player, name) {
  const label = String(name || '').trim().slice(0, NAME_CAP);
  if (!label || !player) return null;

  const tex = paintPlate(label);
  if (!tex) return null;

  const parent = player.root;
  if (!parent) {
    tex.dispose();
    return null;
  }

  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: true,
    sizeAttenuation: true,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.name = 'headName';
  sprite.center.set(0.5, 0.0);
  sprite.scale.set(TAG_W, TAG_H, 1);
  sprite.frustumCulled = false;
  sprite.renderOrder = 8;
  sprite.userData.ownedTex = tex;
  sprite.userData.billboard = true;

  const H = player.height || 1.7;
  let y = H + ABOVE;
  const search = player.avatar?.root || player.unit?.root || player.model || parent;
  const head = findNamed(search, ['Head', 'mixamorigHead', 'mixamorig:Head', 'head']);
  if (head) {
    parent.updateWorldMatrix(true, true);
    head.updateWorldMatrix(true, false);
    const world = new THREE.Vector3();
    head.getWorldPosition(world);
    const local = world.clone();
    parent.worldToLocal(local);
    if (Number.isFinite(local.y) && local.y > H * 0.55 && local.y < H * 1.35) {
      y = local.y + ABOVE;
    }
  }
  sprite.position.set(0, y, 0);
  parent.add(sprite);
  return sprite;
}

/** @deprecated chest lockup was the #39 language; the TV tag is a head billboard now. */
export function attachChestNameTag(player, name) {
  return attachHeadNameTag(player, name);
}
