import * as THREE from 'three';

/**
 * 🏷️ **HEAD BILLBOARD NAME — above the visor, always facing the TV camera.**
 *
 * Live playtest after #39: navy chest badges under 4Humanity were the wrong language.
 * John: bigger, clearer, floating ABOVE the head, and a billboard so every ballroom
 * angle still reads the name.
 *
 * 📺 LOW QUALITY / DISTANCE, take 2: a 512×128 LinearFilter plate still smeared at
 * ringside on `?quality=low`. This plate is a **chunky no-mip atlas**: 256×64,
 * `NearestFilter` so minification stays block pixels instead of bilinear mush; short
 * labels; fat ink-field glyphs; high-contrast STYLE_CONTRACT colours. World scale is
 * larger, and `onBeforeRender` grows the sprite when the camera is far so a ringside
 * LQ cast stays legible without filling the frame up close.
 *
 * `THREE.Sprite` faces the rendering camera for free.
 */

export const INK = '#054E84';
export const SHELL = '#EDEFF0';
export const CHROME = '#B9BEC2';
export const NAME_CAP = 8;

/** Saturated reckoning bang — reads on gilt chairs and navy ink tags. */
export const BANG_RED = '#E10600';

/** World metres at the close-up reference distance. */
export const TAG_W = 0.92;
export const TAG_H = 0.26;
/** Gap from the crown of a 1.7 m body to the plate centre. */
const ABOVE = 0.22;
/** Bang sits this far above the name plate's top so the two never overlap. */
export const BANG_GAP = 0.18;
export const BANG_SIZE = 0.62;
/** Distance (m) at which the plate is 1×. Further than this, scale up to TAG_FAR_K. */
export const TAG_REF_DIST = 4.0;
export const TAG_FAR_K = 2.0;

/** What the sit / name-tag harness asserts — no GPU required. */
export const NAMEPLATE_SPEC = Object.freeze({
  canvasW: 256,
  canvasH: 64,
  mipmaps: false,
  minFilter: 'nearest',
  magFilter: 'nearest',
  strokePx: 10,
  ink: INK,
  shell: SHELL,
  chrome: CHROME,
  tagW: TAG_W,
  tagH: TAG_H,
  nameCap: NAME_CAP,
  refDist: TAG_REF_DIST,
  farK: TAG_FAR_K,
});

const _world = new THREE.Vector3();

function distK(sprite, camera) {
  sprite.getWorldPosition(_world);
  const d = _world.distanceTo(camera.position);
  return THREE.MathUtils.clamp(d / TAG_REF_DIST, 1, TAG_FAR_K);
}

function paintPlate(label) {
  if (typeof document === 'undefined') return null;
  const W = NAMEPLATE_SPEC.canvasW;
  const H = NAMEPLATE_SPEC.canvasH;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.imageSmoothingEnabled = false;

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
  round(0, 0, W, H, 8);
  g.fill();
  g.fillStyle = INK;
  round(4, 4, W - 8, H - 8, 6);
  g.fill();

  const text = String(label || '').trim().slice(0, NAME_CAP).toUpperCase();
  if (!text) return null;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.miterLimit = 2;
  let size = 44;
  g.font = `900 ${size}px ui-sans-serif, system-ui, sans-serif`;
  while (size > 22 && g.measureText(text).width > W - 24) {
    size -= 2;
    g.font = `900 ${size}px ui-sans-serif, system-ui, sans-serif`;
  }
  const cx = W * 0.5, cy = H * 0.54;
  g.lineWidth = NAMEPLATE_SPEC.strokePx;
  g.strokeStyle = INK;
  g.strokeText(text, cx, cy);
  g.lineWidth = Math.max(5, NAMEPLATE_SPEC.strokePx * 0.45);
  g.strokeStyle = CHROME;
  g.strokeText(text, cx, cy);
  g.fillStyle = SHELL;
  g.fillText(text, cx, cy);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.anisotropy = 1;
  tex.needsUpdate = true;
  return tex;
}

function paintBang() {
  if (typeof document === 'undefined') return null;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  g.imageSmoothingEnabled = false;
  // Block glyph, not a thin font stroke: a fat bar + a fat dot, pure saturated red
  // with a dark outline so it survives LQ bilinear-that-is-now-nearest at ringside.
  const stroke = (draw) => {
    g.fillStyle = '#3B0000';
    g.save();
    g.translate(0, 0);
    g.beginPath();
    draw(8);
    g.fill();
    g.restore();
    g.fillStyle = BANG_RED;
    g.beginPath();
    draw(0);
    g.fill();
  };
  stroke((pad) => {
    const x = S * 0.34 - pad, y = S * 0.06 - pad;
    const w = S * 0.32 + pad * 2, h = S * 0.58 + pad * 2;
    g.rect(x, y, w, h);
  });
  stroke((pad) => {
    g.arc(S * 0.5, S * 0.84, S * 0.14 + pad, 0, Math.PI * 2);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
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
  sprite.onBeforeRender = (_r, _s, camera) => {
    const k = distK(sprite, camera);
    sprite.scale.set(TAG_W * k, TAG_H * k, 1);
    sprite.userData.tagTop = sprite.position.y + TAG_H * k;
  };
  parent.add(sprite);
  return sprite;
}

/**
 * Large red "!" above the name tag. Billboard sprite, not a DOM overlay.
 * Hidden until `setNomineeBang(sprite, true)`. Only Reckoning/Vote should turn it on.
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
  sprite.userData.nameTag = nameTag || null;
  sprite.onBeforeRender = (_r, _s, camera) => {
    if (!sprite.visible) return;
    const k = distK(sprite, camera);
    sprite.scale.set(BANG_SIZE * k, BANG_SIZE * k, 1);
    const tag = sprite.userData.nameTag;
    const tagTop = tag?.userData?.tagTop
      ?? ((tag?.position?.y ?? sprite.position.y) + TAG_H * k);
    sprite.position.y = tagTop + BANG_GAP;
  };
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
