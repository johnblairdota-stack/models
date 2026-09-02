import * as THREE from 'three';
import { CAPTION_LAYER, captionAdded } from '../core/caption-layer.js';

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
 * ink-field glyphs with a black outline under the white letters (same language
 * as the bang). High-contrast STYLE_CONTRACT plate colours. World scale is
 * larger, and `onBeforeRender` grows the sprite when the camera is far so a ringside
 * LQ cast stays legible without filling the frame up close.
 *
 * `THREE.Sprite` faces the rendering camera for free.
 */

export const INK = '#054E84';
export const SHELL = '#EDEFF0';
export const CHROME = '#B9BEC2';
/** Same number as `src/party/link.js` — the merge owns it so CI never imports THREE for a cap. */
export const NAME_CAP = 8;
/** Black outline under white glyphs — same language as the bang's dark stroke. */
export const GLYPH_OUTLINE = '#000000';

/** Saturated reckoning bang — reads on gilt chairs and navy ink tags. */
export const BANG_RED = '#E10600';

/* =============================================================================================
 * 🔴 **THE ACCUSED PLATE — the tag SAYS it, instead of a symbol hovering over it.**
 *
 * A nominee wears the red `!` above. Reviewed on air, it says *something is up* and never *what*
 * — it reads closer to "evil" than to "accused", and it is a second sprite in the sky rather
 * than a change to the ONE surface the room is already staring at while it argues. The pair
 * merge proved the language works the other way round: repaint the plate and a sofa reads it
 * without being told. So a nomination gets a skin, exactly as a pair does.
 *
 * Same shape as `LINK_INK` / `LINK_CHROME` and passed the same way —
 * `setNameTagLabel(sprite, label, { ink: NOM_INK, chrome: NOM_CHROME }, tab)`. No signature
 * change, so the seat tab and the idempotence key ride along untouched. The merge pop fires on
 * it too, because `tagSkin` changes: the moment someone is named is precisely the kind of moment
 * that beat was built for, and it costs nothing to give this one the same second of stage time.
 *
 * ⚠️ **THE NAME'S TREATMENT IS UNTOUCHED.** Locked rule: black-outlined white text, same stroke,
 * same glyph colours. This changes the plate's FIELD and BORDER only, as the pair skin does.
 *
 * WHY THESE TWO HEXES — every number below is re-derived by `harness/nominee-skin.mjs`:
 *
 *   · **Darker than either shipped skin**, deliberately: L* 25.0 against the show blue's 32.1
 *     and the pair green's 45.0. On a desaturating LQ cast — or for the colour-blind third of a
 *     living room — the three plates still separate on LIGHTNESS, not only on hue.
 *     ΔE(NOM_INK, INK) = 78 and ΔE(NOM_INK, LINK_INK) = 88; nothing here is confusable.
 *   · **White glyphs on it are the most legible of the three**: 9.7:1, against the blue's 7.5
 *     and the pair green's 4.7. Changing the field must not cost the name, and it does not.
 *   · **The border is `--night-bad` (#ff8a7a) verbatim** — the token the phone and the sheets
 *     already spend on nominated / taken / Production. Same trick as the pair sheet's green
 *     matching `LINK_INK`: the sheet in your hand and the tag on the television are obviously
 *     the same accusation. It is also the loudest border of the three (4.9:1 on its own field,
 *     against 4.6 and 3.2), so at three metres the bright ring carries the alarm while the dark
 *     field carries the name.
 *   · 🔢 **THE SEAT TAB SURVIVES IT.** The tab is a block of the player's own accent, so a field
 *     can eat it. Worst of the twelve `ACCENTS` on this field is 3.07:1 (#d95a8a) — better than
 *     the worst on the show blue (2.38) and far better than on the pair green (1.48, the same
 *     magenta). The skin's hardest tab is still the most legible tab of the three skins.
 * ============================================================================================= */
export const NOM_INK = '#7A0B12';
export const NOM_CHROME = '#FF8A7A';

/* ---------------------------------------------------------------------------------------------
 * ❌ **"NAMED BY JOHN" DOES NOT FIT ON THIS CANVAS.** The review asked whether the plate could
 * also say WHO accused them. It cannot, and the arithmetic is written down here so the next
 * person does not have to re-derive it — or, worse, ship it and find out on a television.
 *
 * ⚠️ **ONE CANVAS PIXEL IS ABOUT ONE TV PIXEL**, which is what makes this measurable in bare
 * node. Under `sizeAttenuation` the on-screen size goes as k/d, and `clamp(d/4, 0.34, 2)` is
 * flat across the whole talk range — so at `TALK_FOV` 60° on a 1080-line frame the plate is
 * **215 × 61 screen pixels from 1.4 m out to 8 m**, three metres included. Vertically that is
 * 0.95 canvas px per screen px; horizontally 0.84, and under `NearestFilter` minification that
 * is not a soft blend — roughly one texel column in six is simply DROPPED.
 *
 * The budget: the seat tab takes 38 px, leaving a 210 px field, 190 px of it usable, and 56 px
 * of inner height. `NAMED BY ` is 5.6 em of 900-weight caps; an 8-char name takes the line to
 * 10.8-12.3 em, so it has to be set at **15-18 px** — a 12 px cap on the television, against a
 * ten-foot floor of ~28 px for 1080p. It is **WIDTH-bound, not height-bound**, which is what
 * kills the obvious rebuttal: hand the second line the whole 256 px plate, tab and insets
 * included, and it still only reaches 21 px. There is no arrangement of this canvas in which
 * that line is readable — and seating it still costs the NAME a tenth of its height (44 → 39 px).
 *
 * And the small line is exactly where this plate's known failure mode lands. The haze bug in
 * `harness/nametag-legibility.mjs` ate 20-38% of a tag's white glyph pixels; a 900-weight stem
 * at 44 px is ~6.6 px with 2.5 px of black outline each side, at 17 px it is ~2.6 px with 1 px —
 * about two surviving columns before the minifier drops one of them.
 *
 * It is also a duplicate. `nomBoard` already airs `named by <X>` beneath the nominee's name in
 * the Reckoning side rail, in DOM type, at a size built to be read.
 *
 * 📐 **IF JOHN WANTS THE ACCUSER OVER THE ROBOT'S OWN HEAD, IT IS A TALLER PLATE** — `canvasH`
 * 96 with `TAG_H` ≈ 0.39 — which moves `NAMEPLATE_SPEC`, the bang's gap and the link stream's
 * anchor. That is a change to a gated spec, not a colour, so it is proposed here and not taken.
 * ------------------------------------------------------------------------------------------- */

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
/* =============================================================================================
 * 🔎 THE NEAR FLOOR — why the plate is allowed to get SMALLER than 1×.
 *
 * The clamp used to be `clamp(d / 4, 1, 2)`. The low end pinned at 1, so anywhere inside four
 * metres the sprite kept its full 0.92 m world size — and under `sizeAttenuation` a constant
 * world size grows as 1/d with no ceiling at all. At arm's length (~0.6 m) the plate is about
 * 6.7× its four-metre size: walking up to somebody in the Debrief covers the person you walked
 * up to, and most of the room behind them. A play critic hit it inside one Debrief.
 *
 * 0.34 ≈ 1.35 / 4: from about 1.35 m outwards the shrink cancels the 1/d growth, so the plate
 * holds a roughly constant SCREEN size instead of a constant world size, and closer than that it
 * still grows, but off a much smaller base. Nothing about the far half of the curve moves —
 * `TAG_FAR_K` and `TAG_REF_DIST` are untouched — so the legibility gate reads exactly what it
 * read before.
 * ============================================================================================= */
export const TAG_NEAR_K = 0.34;

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
  outline: GLYPH_OUTLINE,
  tagW: TAG_W,
  tagH: TAG_H,
  nameCap: NAME_CAP,
  refDist: TAG_REF_DIST,
  farK: TAG_FAR_K,
  nearK: TAG_NEAR_K,
});

const _world = new THREE.Vector3();

/**
 * The distance curve, as one function, because TWO things ride it now: the name plates and the
 * 🟢 link stream that runs between a paired couple's plates. Two copies of this clamp would drift
 * the first time one of the three numbers is tuned, and the stream would slowly stop matching the
 * tags it is strung between.
 */
export function tagDistK(worldPos, camera) {
  const d = worldPos.distanceTo(camera.position);
  return THREE.MathUtils.clamp(d / TAG_REF_DIST, TAG_NEAR_K, TAG_FAR_K);
}

function distK(sprite, camera) {
  sprite.getWorldPosition(_world);
  return tagDistK(_world, camera);
}

/* =============================================================================================
 * 🔢 **THE SEAT TAB — which Sam, on the one surface the room looks at while arguing.**
 *
 * Duplicate names are a LOCKED product rule ("there is deliberately no anti-dupe system"), and
 * D6/S1 answers it everywhere else with `seatChip`: the nominee board, the vote list, the vote
 * receipt, the casting lamps, and the phone's link list. The floating tag — the label over the
 * actual robot, which is what a table reads while accusing each other — was the last list
 * without it. Photographed at N=8: two identical `SAM` plates in one frame.
 *
 * ⚠️ **THIS AMENDS A LOCKED RULE AND WAS APPROVED BEFORE IT WAS WRITTEN.** The tag spec is
 * "black-outlined white text"; that is untouched — the NAME keeps its exact treatment, stroke and
 * colours. What is added is a tab beside it. John's call, 2026-08-28.
 *
 * ⚠️ **NO NEW DATA AND NO NEW CHANNEL.** `seat` and `accent` are already on the intros cue
 * (`CUE_CAST_KEYS = ['id','seat','name','shell','accent']`) and already validated at the
 * iframe's door by `cueViolations`. This reads what the circle was already given.
 *
 * The tab costs the name width — 256px of canvas is all there is — so `harness/nametag-
 * legibility.mjs` is the instrument that says whether that mattered: it measures the glyph
 * pixels that reach the television, not the texture they were baked from.
 * ============================================================================================= */
const TAB_W = 38;

function paintSeatTab(g, seat, accent, H) {
  /*
   * ⚠️ **`Number(null)` IS 0, NOT NaN** — and `Number('')` is 0 too. A `Number.isFinite` guard
   * alone therefore passes for "no seat at all" and paints a seat-1 tab on every plate meant to
   * have none: a merged pair's shared plate, and any caller passing no tab. Caught by measuring
   * rather than by reading — with the bug, plates with and without a tab produced byte-identical
   * glyph metrics, because both were drawing one. Reject the absent cases FIRST.
   */
  if (seat == null || seat === '') return 0;
  const n = Number(seat);
  if (!Number.isFinite(n) || n < 0) return 0;
  g.fillStyle = accent || CHROME;
  g.fillRect(4, 4, TAB_W, H - 8);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 34px ui-sans-serif, system-ui, sans-serif`;
  // The number sits on the player's own accent, so it is read as colour first and digit second
  // — the same "seat 4 is pink" the lamps and the pick lists teach.
  g.fillStyle = GLYPH_OUTLINE;
  g.fillText(String(n + 1), 4 + TAB_W / 2, H * 0.54);
  return TAB_W;
}

function paintPlate(label, skin = null, seat = null, accent = null) {
  if (typeof document === 'undefined') return null;
  const ink = skin?.ink || INK;
  const chrome = skin?.chrome || CHROME;
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

  g.fillStyle = chrome;
  round(0, 0, W, H, 8);
  g.fill();
  g.fillStyle = ink;
  round(4, 4, W - 8, H - 8, 6);
  g.fill();

  const text = String(label || '').trim().slice(0, NAME_CAP).toUpperCase();
  if (!text) return null;
  // A merged pair wears ONE name over two robots and has no single seat — `setPairs` passes no
  // seat for exactly that reason, and the tab is absent rather than wrong.
  const tab = paintSeatTab(g, seat, accent, H);
  const fieldX = 4 + tab;
  const fieldW = W - fieldX - 4;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.miterLimit = 2;
  let size = 44;
  g.font = `900 ${size}px ui-sans-serif, system-ui, sans-serif`;
  while (size > 22 && g.measureText(text).width > fieldW - 20) {
    size -= 2;
    g.font = `900 ${size}px ui-sans-serif, system-ui, sans-serif`;
  }
  const cx = fieldX + fieldW * 0.5, cy = H * 0.54;
  g.lineWidth = NAMEPLATE_SPEC.strokePx;
  g.strokeStyle = GLYPH_OUTLINE;
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
/**
 * 🏷️ MOVE A CAPTION OUT OF THE GRADED PICTURE.
 *
 * `layers.set` REPLACES the mask, so the sprite leaves layer 0 and the main pass stops drawing
 * it. `Pipeline` draws `CAPTION_LAYER` again after the grade, at full strength.
 *
 * This is the fix for the thing John caught in a live vote: *"the lack of lighting in the other
 * room is occluding the name tag."* The tag is `depthWrite:false`, so the composite's distance
 * haze sampled `tDepth` and faded each tag by the depth of whatever stood BEHIND it — measured
 * at 20-23% of the white glyphs for five seated robots and 38% for the one in front of an open
 * dark archway, with a neighbour at the same distance losing 23%. Distance never explained it.
 *
 * A name tag is a caption. It has to read the same wherever its robot is standing — that is the
 * locked rule, and it cannot be satisfied while the tag is inside a depth-driven fog.
 * Instrument + A/B: `harness/nametag-legibility.mjs`.
 */
function captionLayer(sprite) {
  sprite.layers.set(CAPTION_LAYER);
  captionAdded();
}

/**
 * 🍮 REPAINT A LIVE TAG — the moment two robots become one name.
 *
 * John's design: *"their names are merged together... the tag changes colour."* Both halves of a
 * pair get the SAME plate — JELLIE over both heads, in the pair green rather than the show blue.
 * Two robots wearing one name reads instantly from a sofa, and it needs no repositioning, which
 * matters because the seated circle is fixed until walking ships.
 *
 * ⚠️ **THE OLD TEXTURE IS DISPOSED HERE.** A tag can flip several times in one Debrief — pair,
 * unpair, pair with someone else — and a `CanvasTexture` per flip with nothing freeing them is a
 * GPU leak that only shows up in the fifth episode of a long night. `userData.ownedTex` is what
 * `intro-bed`'s teardown frees, so it has to keep pointing at the CURRENT one.
 *
 * Returns false and changes nothing if the label is empty — a robot must never end up wearing a
 * blank plate because a name arrived late.
 */
export function setNameTagLabel(sprite, label, skin = null, tab = null) {
  if (!sprite?.material) return false;
  const text = String(label || '').trim().slice(0, NAME_CAP);
  if (!text) return false;
  /*
   * 🔢 The seat tab joins the idempotence key. Without it, a robot coming BACK from a merged
   * pair — `setPairs` calls this with the seat again — would match on label+skin alone and keep
   * the pair's tabless plate, so its seat number would vanish for the rest of the night after
   * its first conversation.
   */
  const tabKey = Number.isFinite(Number(tab?.seat)) ? `${tab.seat}:${tab.accent || ''}` : '';
  if (sprite.userData.tagLabel === text
    && sprite.userData.tagSkin === (skin?.ink || '')
    && sprite.userData.tagTab === tabKey) return true;
  /*
   * The pop fires on a REAL change only — the early return above means the per-tap `links`
   * fanout, which re-sends the same pairs, cannot make the plate throb continuously. And it
   * fires on the way BACK to your own name too: an unpairing is a moment the room should also
   * get to see, and it costs nothing to give it one.
   */
  if (sprite.userData.tagLabel) sprite.userData.popAt = Date.now();
  const tex = paintPlate(text, skin, tab?.seat ?? null, tab?.accent ?? null);
  if (!tex) return false;
  const old = sprite.userData.ownedTex;
  sprite.material.map = tex;
  sprite.material.needsUpdate = true;
  sprite.userData.ownedTex = tex;
  sprite.userData.tagLabel = text;
  sprite.userData.tagSkin = skin?.ink || '';
  sprite.userData.tagTab = tabKey;
  if (old && old !== tex) old.dispose?.();
  return true;
}

export function attachHeadNameTag(player, name, tab = null) {
  const label = String(name || '').trim().slice(0, NAME_CAP);
  if (!label || !player) return null;

  const tex = paintPlate(label, null, tab?.seat ?? null, tab?.accent ?? null);
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
  captionLayer(sprite);
  sprite.center.set(0.5, 0.0);
  sprite.scale.set(TAG_W, TAG_H, 1);
  sprite.frustumCulled = false;
  sprite.renderOrder = 8;
  sprite.userData.ownedTex = tex;
  sprite.userData.billboard = true;
  /*
   * ⚠️ **THE ATTACH HAS TO RECORD WHAT IT PAINTED, OR THE IDEMPOTENCE CHECK IS BLIND.**
   * `setNameTagLabel` returns early when label + skin + tab already match — that early return is
   * what stops the per-tap `links` fanout repainting eight canvases several times a second. It
   * reads `userData.tagLabel`, which the attach never set, so the FIRST `setPairs` of every
   * night repainted every tag in the circle for no change at all. It also left the tags
   * anonymous to any instrument reading the scene: `harness/circle-staging.mjs` printed eight
   * rows of `?`.
   */
  sprite.userData.tagLabel = label;
  sprite.userData.tagSkin = '';
  sprite.userData.tagTab = Number.isFinite(Number(tab?.seat)) && tab?.seat != null
    ? `${tab.seat}:${tab.accent || ''}` : '';

  const y = headTagY(player);
  sprite.position.set(0, y, 0);
  sprite.userData.tagTop = y + TAG_H;
  sprite.onBeforeRender = (_r, _s, camera) => {
    const k = distK(sprite, camera) * mergePop(sprite);
    sprite.scale.set(TAG_W * k, TAG_H * k, 1);
    sprite.userData.tagTop = sprite.position.y + TAG_H * k;
  };
  parent.add(sprite);
  return sprite;
}

/* =============================================================================================
 * 🍮 THE MERGE POP — one second of stage time for the moment the mechanic is built around.
 *
 * A play critic photographed the television 93ms after the accept: both plates were ALREADY
 * green, already settled. Nothing tweened, scaled, flashed or sounded. Their verdict was the
 * sharpest note anyone gave this feature:
 *
 *   *"Nothing happens. The act of connecting — which the designer describes as the entire point
 *   — is a silent, instantaneous text substitution that neither participant nor the room can
 *   perceive. Strip that away and what remains is a DM, and everyone in that room already has a
 *   phone that does DMs better."*
 *
 * John asked for *"an animation of them becoming connected and sharing data while their names
 * are merged together."* Zero of it shipped.
 *
 * ⚠️ **IT RIDES `onBeforeRender`, WHICH ALREADY RUNS PER FRAME FOR THE DISTANCE SCALE.** No new
 * clock, no rAF, no timer to leak, and nothing to tick when the tag is off screen. `MERGE_POP_MS`
 * is deliberately long enough to be caught by someone looking at each other rather than at the
 * screen — the room is the audience, and it is not staring at the TV waiting for this.
 * ============================================================================================= */

export const MERGE_POP_MS = 900;
/** Peak scale at the top of the pop. Big enough to catch the eye across a room, short enough
 *  that two adjacent plates do not collide while it happens. */
export const MERGE_POP_K = 1.28;

function mergePop(sprite) {
  const t0 = sprite.userData.popAt || 0;
  if (!t0) return 1;
  const u = (Date.now() - t0) / MERGE_POP_MS;
  if (u >= 1) { sprite.userData.popAt = 0; return 1; }
  if (u < 0) return 1;
  // Up fast, down slow — an arrival, not a wobble.
  const shape = u < 0.35 ? (u / 0.35) : (1 - (u - 0.35) / 0.65);
  return 1 + (MERGE_POP_K - 1) * Math.sin(shape * Math.PI * 0.5);
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
  captionLayer(sprite);
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
