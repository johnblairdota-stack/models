import * as THREE from 'three';

/**
 * 🏷️ **HEAD BILLBOARD NAME — above the visor, always facing the TV camera.**
 *
 * Live playtest after #39: navy chest badges under 4Humanity were the wrong language.
 * John: bigger, clearer, floating ABOVE the head, and a billboard so every ballroom
 * angle still reads the name.
 *
 * 📺 LOW QUALITY / DISTANCE: a 1024×256 CanvasTexture with thin glyphs mips into a
 * smear on `?quality=low` (pixel ratio 1, far ringside). This plate is a **crisp
 * no-mip atlas**: 512×128, `LinearFilter` + `generateMipmaps = false` so minification
 * is one bilinear sample, not a blurry mip; fat round-joined strokes; high-contrast
 * ink field and shell letters. STYLE_CONTRACT colours only.
 *
 * `THREE.Sprite` faces the rendering camera for free.
 */

export const INK = '#054E84';
export const SHELL = '#EDEFF0';
export const CHROME = '#B9BEC2';
export const NAME_CAP = 12;

/** Saturated reckoning bang — reads on gilt chairs and navy ink tags. */
export const BANG_RED = '#E10600';

/** World metres. Larger than the old 0.21 × 0.048 chest plate so a ringside TV can read it. */
export const TAG_W = 0.56;
export const TAG_H = 0.16;
/** Gap from the crown of a 1.7 m body to the plate centre. */
const ABOVE = 0.22;
/** Bang sits this far above the name plate's top so the two never overlap. */
export const BANG_GAP = 0.10;
export const BANG_SIZE = 0.28;

/** What the sit / name-tag harness asserts — no GPU required. */
export const NAMEPLATE_SPEC = Object.freeze({
  canvasW: 512,
  canvasH: 128,
  mipmaps: false,
  minFilter: 'linear',
  magFilter: 'linear',
  strokePx: 18,
  ink: INK,
  shell: SHELL,
  chrome: CHROME,
  tagW: TAG_W,
  tagH: TAG_H,
});

function paintPlate(label) {
  if (typeof document === 'undefined') return null;
  const W = NAMEPLATE_SPEC.canvasW;
  const H = NAMEPLATE_SPEC.canvasH;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);

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
  round(0, 0, W, H, 18);
  g.fill();
  g.fillStyle = INK;
  round(8, 8, W - 16, H - 16, 14);
  g.fill();

  const text = String(label || '').trim().slice(0, NAME_CAP).toUpperCase();
  if (!text) return null;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.miterLimit = 2;
  let size = 72;
  g.font = `900 ${size}px ui-sans-serif, system-ui, sans-serif`;
  while (size > 28 && g.measureText(text).width > W - 48) {
    size -= 4;
    g.font = `900 ${size}px ui-sans-serif, system-ui, sans-serif`;
  }
  const cx = W * 0.5, cy = H * 0.52;
  g.lineWidth = NAMEPLATE_SPEC.strokePx;
  g.strokeStyle = INK;
  g.strokeText(text, cx, cy);
  g.lineWidth = Math.max(8, NAMEPLATE_SPEC.strokePx * 0.45);
  g.strokeStyle = CHROME;
  g.strokeText(text, cx, cy);
  g.fillStyle = SHELL;
  g.fillText(text, cx, cy);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 1;
  tex.needsUpdate = true;
  return tex;
}

function paintBang() {
  if (typeof document === 'undefined') return null;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '900 210px ui-sans-serif, system-ui, sans-serif';
  g.lineJoin = 'round';
  g.lineWidth = 28;
  g.strokeStyle = '#3B0000';
  g.strokeText('!', S * 0.5, S * 0.56);
  g.fillStyle = BANG_RED;
  g.fillText('!', S * 0.5, S * 0.56);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
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

function headTagY(player) {
  const H = player.height || 1.7;
  let y = H + ABOVE;
  const parent = player.root;
  const search = player.avatar?.root || player.unit?.root || player.model || parent;
  const head = findNamed(search, ['Head', 'mixamorigHead', 'mixamorig:Head', 'head']);
  if (head && parent) {
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
  return y;
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
    toneMapped: false,
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

  const y = headTagY(player);
  sprite.position.set(0, y, 0);
  sprite.userData.tagTop = y + TAG_H;
  parent.add(sprite);
  return sprite;
}

/**
 * Large red "!" above the name tag. Billboard sprite, not a DOM overlay.
 * Hidden until `setNomineeBang(sprite, true)`.
 */
export function attachNomineeBang(player, nameTag) {
  if (!player?.root) return null;
  const tex = paintBang();
  if (!tex) return null;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    sizeAttenuation: true,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.name = 'nomBang';
  sprite.center.set(0.5, 0.0);
  sprite.scale.set(BANG_SIZE, BANG_SIZE, 1);
  sprite.frustumCulled = false;
  sprite.renderOrder = 9;
  sprite.visible = false;
  sprite.userData.ownedTex = tex;
  sprite.userData.billboard = true;
  const top = nameTag?.userData?.tagTop
    ?? ((nameTag?.position?.y ?? (player.height || 1.7)) + TAG_H);
  sprite.position.set(0, top + BANG_GAP, 0);
  player.root.add(sprite);
  return sprite;
}

export function setNomineeBang(sprite, on) {
  if (sprite) sprite.visible = !!on;
}

/** @deprecated chest lockup was the #39 language; the TV tag is a head billboard now. */
export function attachChestNameTag(player, name) {
  return attachHeadNameTag(player, name);
}
