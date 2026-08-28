/**
 * Public lobby cosmetics — a face, two colours. Not a role, not a deal.
 *
 * Closed palettes so a phone cannot smuggle a string through `shell` / `accent`.
 * The face is one SVG — a 2D drawing of UNIT-4H's own head, not a second 3D pipeline.
 */

import { RUNDOWN_BEATS, SHOW_BEATS, railDrainPct, rundownRibbon } from './show.js';

/**
 * 🎨 **TWELVE AND TWELVE, AND THE FIRST SIX ARE FROZEN IN PLACE.**
 *
 * John, after the D13 playtest: *"More colours for the face/shell picker, but keep the phone UI
 * slim (don't eat the screen)."* Both halves of that sentence are constraints and the second one
 * is the harder: `night-skin.js`'s `.swatch-row` answers it by scrolling on one line rather than
 * wrapping onto a second, so twelve colours occupy exactly the height six did. If the picker got
 * taller, this change was done wrong.
 *
 * 🚨 **APPEND ONLY. NEVER REORDER, NEVER REPLACE.** `cleanLook()` below validates by VALUE against
 * these arrays and `party-phone.js` restores a saved look out of `localStorage` — so dropping or
 * moving one of the original six silently resets every returning player in the room to the default
 * on the night it ships. `harness/party-warm.mjs` W9b pins the first six at their original indices
 * for exactly that reason.
 *
 * The second six stay inside the night's own register — no primaries, nothing that would fight the
 * `--night-accent` amber the rest of the show is lit with. They are a wider spread of the same
 * house, not a brighter one.
 */
export const SHELLS = [
  '#2a2420', '#c4b4a0', '#6b3a2a', '#1e3330', '#3d2a38', '#2f3320',
  '#1c2a3a', '#5c2733', '#8a6f45', '#3a3a3d', '#243d2c', '#6a5a7a',
];
export const ACCENTS = [
  '#f5a14a', '#e8d5a3', '#ff7a59', '#f0ebe3', '#c47a4a', '#9ad7c2',
  '#7fb3e8', '#e5c04a', '#d95a8a', '#a8c66c', '#4fb8c9', '#c9a0dc',
];
export const DEFAULT_LOOK = { shell: SHELLS[0], accent: ACCENTS[0] };

export function cleanLook(input) {
  const shell = SHELLS.includes(input?.shell) ? input.shell : null;
  const accent = ACCENTS.includes(input?.accent) ? input.accent : null;
  if (!shell || !accent) return null;
  return { shell, accent };
}

/** Four-letter room alphabet — no i/l/o/0/1. Same set `makeCode` already uses. */
export const CODE_ABC = 'abcdefghjkmnpqrstuvwxyz23456789';
export const CODE_ABC_DISPLAY = CODE_ABC.toUpperCase();

/** What the join field must show: CAPS, no spaces, alphabet only. */
export function normalizeCodeDisplay(raw) {
  const allow = new Set(CODE_ABC_DISPLAY);
  let out = '';
  for (const ch of String(raw ?? '').toUpperCase()) {
    if (ch === ' ' || ch === '\t' || ch === '\n') continue;
    if (allow.has(ch)) out += ch;
  }
  return out.slice(0, 8);
}

/** Wire / URL form stays lowercase, matching `makeCode` and `?room=`. */
export function normalizeCodeWire(raw) {
  return normalizeCodeDisplay(raw).toLowerCase();
}

/**
 * 🤖 **THE FACE IS UNIT-4H'S OWN HEAD, MEASURED — NOT A MASCOT DRAWN BESIDE IT.**
 *
 * What was here until now was a diamond on a rounded blob, authored before the character
 * existed and never revisited. It shared nothing with the robot the player drives: not the
 * silhouette, not the screen, not the eyes. A room full of them told you which colours a
 * player picked and nothing about what they were.
 *
 * This one is taken off the two things that already define the head:
 *
 *  - **The silhouette** off the front render (`assets/mv/player/baseline_front.png`) — a
 *    rounded shell 0.88 as wide as it is tall, side pods proud of it at mid-height, a lighter
 *    crown cap, and a faceplate 83% of the shell's width with a THICKER rim under the chin
 *    than at the sides. That last asymmetry is most of what reads as "helmet" rather than
 *    "circle", and it is the first thing to go wrong if these numbers get tidied.
 *  - **The features** off `FACE_SURFACE` in `src/materials/surfaces/robot.js`, which is the
 *    shader that paints the real plate: two upright rounded-rect eyes, a thin near-straight
 *    brow arc over each, and one wide flat crescent mouth. Placement below is in fractions of
 *    the PLATE box, so the same drawing lands correctly on the helmet and on a bare screen.
 *
 * 🎨 **WHERE THE PLAYER'S TWO COLOURS GO.** Shell → the helmet (and four tones derived from
 * it, see `shellTones`). Accent → **the light**: eyes, brows, mouth. The glass stays blue for
 * everyone, because the glass is the robot and the light is the player. This is also why an
 * emote costs no new art — the face is a screen, so an expression is the light redrawn.
 *
 * 🚨 **NO ELEMENT IDS, STILL.** The TV lobby mounts one of these per chair, so anything id-
 * scoped (a gradient, a filter, a clip path) would collide across eight faces and the last one
 * mounted would win. The glow is faked with a stacked low-alpha rectangle for exactly this
 * reason — it is not a stylistic preference, and a blur filter would break the lobby.
 */

/** sRGB luminance, 0..1. Decides how hard the rim light has to work — see `shellTones`. */
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};

/** Mix `hex` toward white (amt > 0) or black (amt < 0). */
const shade = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16);
  const t = amt > 0 ? 255 : 0, k = Math.abs(amt);
  return '#' + [n >> 16, (n >> 8) & 255, n & 255]
    .map((v) => Math.round(v + (t - v) * k).toString(16).padStart(2, '0')).join('');
};

/**
 * The four tones and one alpha the helmet derives from a single shell colour.
 *
 * ⚠️ **THE RIM IS NOT DECORATION.** Eight of the twelve `SHELLS` are darker than
 * `--night-bg`, so a flat fill puts the whole head below the TV's floor: the silhouette
 * disappears and a player becomes two floating eyes. Every tone here opens up as the shell
 * gets darker — the crown lifts further, the pods stop being crushed to black, and the rim
 * goes from a hint to a real edge light at 0.80 alpha. Gate: `party-warm` W40b.
 */
export function shellTones(shell) {
  const dark = lum(shell) < 0.35;
  return {
    crown: shade(shell, dark ? 0.28 : 0.18),
    pod: shade(shell, dark ? -0.08 : -0.24),
    rim: shade(shell, dark ? 0.66 : 0.36),
    seam: shade(shell, dark ? 0.10 : -0.34),
    rimA: dark ? 0.80 : 0.55,
  };
}

/** The glass. `C.glass` is #2659A0; the shipped plate is greyed by `facegrey`, and this sits
 *  between the two so the light still pops against `--night-bg`. */
const GLASS = '#27476e';
const GLASS_LIT = '#4d78a6';

const SHELL_D = 'M16.95 34C16.95 18.6 31.5 8 50.9 8C70.3 8 84.9 18.6 84.9 34L84.9 64C84.9 81 70.3 92 50.9 92C31.5 92 16.95 81 16.95 64Z';
const CROWN_D = 'M22.4 24C22.4 12 33 8.7 51 8.7C69 8.7 79.8 12 79.8 24C79.8 24 66 26.8 51 26.8C36 26.8 22.4 24 22.4 24Z';
const PLATE = { x: 23.1, y: 24.0, w: 56.7, h: 56.0, r: 16.5 };
const SCREEN_PLATE = { x: 7, y: 13, w: 86, h: 74, r: 24 };

/**
 * 😐 **THE EXPRESSIONS.** Each entry says only how the three lit features differ from idle,
 * so a new one is three numbers rather than a new drawing. `eyeK` scales eye height per side
 * (or `'arc'` for a closed happy eye), `browDY` lifts each brow as a fraction of plate height,
 * `mouth` names the stroke. Asymmetry is the whole trick: `doubt` squints one side and lifts
 * the other brow, and that alone reads as an accusation at 44px.
 */
const MOODS = {
  /** The lobby, the seat grid, the role card — the face at rest. */
  idle: { eyeK: [1, 1], browDY: [0, 0], browRot: [0, 0], mouth: 'smile' },
  /* ---- the four reactions ---------------------------------------------------------------- */
  /** Approval. Eyes shut into happy arcs, brows up, the widest mouth of the four. */
  clap: { eyeK: ['arc', 'arc'], browDY: [-0.048, -0.048], browRot: [0, 0], mouth: 'grin' },
  /**
   * Disapproval, and it has to read as HOSTILE rather than sad — a sad boo is a shrug. The
   * work is done by `browRot`: the INNER end of each brow drops, which is the same cue the
   * hunter's `uEyeCant` uses for menace in the 3D face. Narrowed eyes and a frown alone read
   * as disappointed; the angled brow is what makes it an objection.
   */
  boo: { eyeK: [0.62, 0.62], browDY: [0.030, 0.030], browRot: [18, -18], mouth: 'frown' },
  /**
   * Doubt — the load-bearing one, because this is the accusation. Everything is ASYMMETRIC: a
   * squint on one side, a raised brow on the other. Make it symmetric and it becomes a
   * generic frown that names nobody.
   */
  sus: { eyeK: [0.40, 1.05], browDY: [0.020, -0.062], browRot: [6, -10], mouth: 'flat' },
  /** Surprise. Fires on the moment something happens, so it has to be legible in one frame. */
  shock: { eyeK: [1.28, 1.28], browDY: [-0.050, -0.050], browRot: [0, 0], mouth: 'oh' },
};

/** The lit face, placed as fractions of whatever plate box it is given. */
function litFace(p, { halo = true, spec = true, bold = 0, mood = 'idle' } = {}) {
  const F = MOODS[mood] || MOODS.idle;
  const eyeW = 0.141 * p.w * (1 + bold * 0.16);
  const eyeH = 0.221 * p.h * (1 + bold * 0.16);
  const eyeDX = 0.205 * p.w;
  const cx = p.x + p.w / 2, cy = p.y + 0.468 * p.h;
  const n = (v) => v.toFixed(2);

  const eye = (sx, i) => {
    const k = F.eyeK[i], bx = cx + sx * eyeDX;
    if (k === 'arc') {
      const hw = eyeW * 0.72;
      return `<path data-stroke="lit" fill="none" stroke="@LIT@" stroke-width="${n(eyeW * 0.52)}" stroke-linecap="round" d="M${n(bx - hw)} ${n(cy + eyeH * 0.20)}Q${n(bx)} ${n(cy - eyeH * 0.34)} ${n(bx + hw)} ${n(cy + eyeH * 0.20)}"/>`;
    }
    const w = eyeW * (k > 1 ? 1.12 : 1), h = eyeH * k;
    const x = bx - w / 2, y = cy - h / 2, rr = Math.min(w, h) * 0.48;
    let s = '';
    if (halo) s += `<rect data-paint="lit" x="${n(x - w * 0.30)}" y="${n(y - h * 0.18)}" width="${n(w * 1.60)}" height="${n(h * 1.36)}" rx="${n(rr * 1.7)}" fill="@LIT@" opacity="0.16"/>`;
    s += `<rect data-paint="lit" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(rr)}" fill="@LIT@"/>`;
    if (spec && k >= 1) s += `<rect x="${n(x + w * 0.20)}" y="${n(y + h * 0.13)}" width="${n(w * 0.30)}" height="${n(h * 0.26)}" rx="${n(w * 0.15)}" fill="#ffffff" opacity="0.55"/>`;
    return s;
  };

  const browY = p.y + 0.300 * p.h, browHW = 0.100 * p.w;
  const browT = Math.max(1.1, 0.026 * p.h * (1 + bold * 0.5));
  const brow = (sx, i) => {
    const bx = cx + sx * eyeDX, by = browY + F.browDY[i] * p.h;
    /* Rotated about the brow's own centre, so a tilt drops the inner end without sliding the
       brow off its eye. Left brow's inner end is its RIGHT one, hence the mirrored signs. */
    const rot = (F.browRot?.[i] || 0);
    const tf = rot ? ` transform="rotate(${rot} ${n(bx)} ${n(by)})"` : '';
    return `<path data-stroke="lit" fill="none" stroke="@LIT@" stroke-width="${n(browT)}" stroke-linecap="round" opacity="0.85"${tf} d="M${n(bx - browHW)} ${n(by + browHW * 0.20)}Q${n(bx)} ${n(by - browHW * 0.16)} ${n(bx + browHW)} ${n(by + browHW * 0.20)}"/>`;
  };

  const mY = p.y + 0.808 * p.h, mHW = 0.122 * p.w;
  const mT = Math.max(1.6, 0.052 * p.h * (1 + bold * 0.45));
  /* `dir` +1 is the shader's upward crescent (a smile); -1 flips it into a frown. */
  const arc = (hw, sag, t, dir = 1) => `<path data-stroke="lit" fill="none" stroke="@LIT@" stroke-width="${n(t)}" stroke-linecap="round" d="M${n(cx - hw)} ${n(mY - sag * dir)}Q${n(cx)} ${n(mY + sag * 1.9 * dir)} ${n(cx + hw)} ${n(mY - sag * dir)}"/>`;
  const mouth = {
    smile: arc(mHW, mHW * 0.17, mT),
    grin: arc(mHW * 1.30, mHW * 0.52, mT * 1.25),
    frown: arc(mHW * 1.05, mHW * 0.42, mT * 1.15, -1),
    flat: `<path data-stroke="lit" fill="none" stroke="@LIT@" stroke-width="${n(mT)}" stroke-linecap="round" d="M${n(cx - mHW * 0.82)} ${n(mY)}H${n(cx + mHW * 0.82)}"/>`,
    oh: `<ellipse data-paint="lit" cx="${n(cx)}" cy="${n(mY)}" rx="${n(mHW * 0.46)}" ry="${n(mHW * 0.62)}" fill="@LIT@"/>`,
  }[F.mouth];

  return brow(-1, 0) + brow(1, 1) + eye(-1, 0) + eye(1, 1) + mouth;
}

/**
 * 🏷️ **THE REACTION BADGE — one filled tile, top-right, glyph knocked out of it.**
 *
 * John's note, via his partner: *"floating symbols near them… red question marks around the
 * 'sus' reaction, exclamation marks around the shock, frustration squiggles or a thumbs down for
 * boo and clapping hands for the clap."* Three parts of that were measured and changed, and the
 * reasons are worth keeping because each is a thing someone will try to put back:
 *
 * 1. **One big mark, not several small ones.** The clear margin around the helmet inside this
 *    box is 9 units — 5 px at the 56 px the TV strip uses. Three glyphs scattered there are
 *    coloured dust at sofa distance. Rendered side by side, one 34-unit tile is legible where a
 *    scatter is not, because at distance the SATURATED FILL survives and a thin glyph does not.
 * 2. **Not red, and no exclamation mark.** `--night-bad` already means *taken / dark /
 *    Production*, and a red `!` above a head is this game's locked word for **nominee** — a mark
 *    the room reads ninety seconds later at the Reckoning. Teaching it a second meaning during
 *    the run is how a table ends up arguing about what the television said. The `?` SHAPE is
 *    kept; the red is not, and shock gets a spark instead of a `!`.
 * 3. **No hands.** This character has no hands anywhere in its art — a helmet, two pods and a
 *    lit screen, drawn flat. A clapping hand or a thumbs-down would be the only human body part
 *    on the screen, and it would look borrowed because it would be. Clap and boo are the SAME
 *    chevron mirrored (John's call), which also makes the pair read as one control with two
 *    directions rather than as two unrelated pictures.
 *
 * 🚨 **NO IDS, AND THE BOX CANNOT GROW.** Eight faces mount at once in the lobby, so the badge is
 * a `<rect>` and a `<path>` inside the existing `0 0 100 100` — no filter, no gradient, no
 * `url(#…)`. "Floating AROUND the head" is therefore not available in the literal sense: the
 * tile overlaps the crown, which is what a status pip does anyway.
 *
 * The colours are FIXED per reaction rather than the player's accent. The badge's only job is
 * *which reaction* — identity is already carried twice, by the face and by the name under it —
 * and a fixed colour has to work against all twelve accents rather than disappear into one.
 * Gate: `react-pad` R60+.
 */
const BADGE = {
  clap: ['#9ff2c8', '<path d="M72.4 24.4L79 17.6L85.6 24.4" fill="none" stroke="#080604" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>'],
  boo: ['#ff8a7a', '<path d="M72.4 17.6L79 24.4L85.6 17.6" fill="none" stroke="#080604" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>'],
  sus: ['#f5a14a', '<path d="M74.2 16.4Q74.2 11.4 79 11.4Q83.9 11.4 83.9 16.2Q83.9 19.5 79 21.6L79 24.1" fill="none" stroke="#080604" stroke-width="3.3" stroke-linecap="round"/><circle cx="79" cy="28.6" r="2" fill="#080604"/>'],
  shock: ['#f3ece3', '<path d="M79 10.6L81.3 18.7L89.4 21L81.3 23.3L79 31.4L76.7 23.3L68.6 21L76.7 18.7Z" fill="#080604"/>'],
};

/**
 * The badge for a mood, or '' for `idle`.
 *
 * ⚠️ **IDLE NEVER GETS ONE, AND THAT IS STRUCTURAL RATHER THAN A CALL SITE'S JOB.** Seven of the
 * nine places this face is mounted are hard-coded idle — the colour picker, the run slate, the
 * lobby grid, the lower third, the nominee rows, the pair board, the spectator view. A badge on
 * any of them would be an emotion the player never sent, and on the pair board (two faces
 * overlapping by a third of their width) it would land underneath the other player's head.
 * Deriving it from the mood means no caller can turn it on by accident.
 */
function reactBadge(mood) {
  const b = BADGE[mood];
  if (!b) return '';
  return `<g class="bot-badge" data-react="${mood}">`
    + `<rect x="62" y="4" width="34" height="34" rx="11" fill="${b[0]}" stroke="${NIGHT_BG}" stroke-width="3.4"/>`
    + `${b[1]}</g>`;
}

/** The night's own background, so the badge reads as a chip lifted off the head. */
const NIGHT_BG = '#0c0a08';

/** The helmet, without the lit face. `detail` 2 keeps the seams and the screen sheen. */
function helmet(t, detail) {
  let s = `<rect data-paint="pod" data-stroke="rim" x="9.8" y="36.6" width="12.2" height="34.4" rx="6.1" fill="@POD@" stroke="@RIM@" stroke-width="1" stroke-opacity="0.4"/>`
    + `<rect data-paint="pod" data-stroke="rim" x="79" y="36.6" width="12.2" height="34.4" rx="6.1" fill="@POD@" stroke="@RIM@" stroke-width="1" stroke-opacity="0.4"/>`
    + `<path class="bot-shell" data-paint="shell" data-stroke="rim" fill="@SHELL@" stroke="@RIM@" stroke-width="1.5" stroke-opacity="${t.rimA}" d="${SHELL_D}"/>`
    + `<path data-paint="crown" fill="@CROWN@" d="${CROWN_D}"/>`;
  if (detail > 1) {
    s += `<path data-stroke="seam" d="M51 9.4V13.6" stroke="@SEAM@" stroke-width="1" stroke-linecap="round" opacity="0.5"/>`
      + `<path data-stroke="seam" d="M33 86.4Q51 90.2 69 86.4" fill="none" stroke="@SEAM@" stroke-width="1" stroke-linecap="round" opacity="0.4"/>`;
  }
  s += `<rect x="${PLATE.x}" y="${PLATE.y}" width="${PLATE.w}" height="${PLATE.h}" rx="${PLATE.r}" fill="${GLASS}"/>`;
  if (detail > 1) {
    s += `<rect x="${PLATE.x + 3.4}" y="${PLATE.y + 3.0}" width="${PLATE.w - 6.8}" height="${PLATE.h * 0.52}" rx="${PLATE.r - 3.4}" fill="${GLASS_LIT}" opacity="0.30"/>`;
  }
  return s;
}

/** A bare screen — the faceplate with no helmet around it. */
function bareScreen(t) {
  const p = SCREEN_PLATE;
  return `<rect data-paint="shell" data-stroke="rim" x="${p.x - 3}" y="${p.y - 3}" width="${p.w + 6}" height="${p.h + 6}" rx="${p.r + 3}" fill="@SHELL@" stroke="@RIM@" stroke-width="1.3" stroke-opacity="0.6"/>`
    + `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.r}" fill="${GLASS}"/>`;
}

/**
 * `portrait` is the lobby and the role card. `chip` is the same silhouette with the seams and
 * the sheen dropped and the features fattened, for a row of eight at 40px. `screen` drops the
 * helmet entirely — the plate is the whole graphic, which is what survives furthest away.
 */
const TREATMENTS = {
  portrait: (t, m) => helmet(t, 2) + litFace(PLATE, { halo: true, spec: true, bold: 0, mood: m }) + reactBadge(m),
  chip: (t, m) => helmet(t, 1) + litFace(PLATE, { halo: false, spec: false, bold: 1, mood: m }) + reactBadge(m),
  screen: (t, m) => bareScreen(t) + litFace(SCREEN_PLATE, { halo: true, spec: false, bold: 0.5, mood: m }) + reactBadge(m),
};

/** The tokens the drawing is authored against, so `paintLook` and the initial render agree. */
const paintOf = (look, t) => ({
  SHELL: look.shell, CROWN: t.crown, POD: t.pod, RIM: t.rim, SEAM: t.seam, LIT: look.accent,
});

/**
 * Small robot face. `shell` is the helmet; `accent` is the light on the screen.
 * `treatment` picks how much detail survives; `mood` picks the expression.
 */
export function robotFaceSvg(shell = DEFAULT_LOOK.shell, accent = DEFAULT_LOOK.accent,
  { size = 120, treatment = 'portrait', mood = 'idle' } = {}) {
  const s = cleanLook({ shell, accent }) || DEFAULT_LOOK;
  const t = shellTones(s.shell);
  let body = (TREATMENTS[treatment] || TREATMENTS.portrait)(t, mood);
  for (const [k, v] of Object.entries(paintOf(s, t))) body = body.split(`@${k}@`).join(v);
  return `<svg class="bot-face" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`;
}

/**
 * 🖌️ **RECOLOUR AN ALREADY-MOUNTED FACE IN PLACE**, so the picker keeps its CSS fill
 * transition instead of the swatch tap replacing the whole node under the player's thumb.
 *
 * The old face could be recoloured by two `setAttribute` calls, because it had exactly two
 * coloured parts. This one has nine, four of them DERIVED from the shell — so both call sites
 * (the phone picker and the TV seat grid) patched the two they knew about and would silently
 * leave the crown, the pods and the rim on the previous player's colour. Hence one painter,
 * driven by the same `data-paint` / `data-stroke` tags the drawing is authored with: add a
 * part to the face and it is recoloured here for free. Gate: `party-warm` W40c.
 *
 * Returns false if `faceEl` is missing or the look is not in the palette — the caller should
 * fall back to a full re-render, which is also the path for a face that is not mounted yet.
 */
export function paintLook(faceEl, look) {
  const s = cleanLook(look);
  if (!faceEl || !s) return false;
  const t = shellTones(s.shell);
  const paint = paintOf(s, t);
  for (const el of faceEl.querySelectorAll('[data-paint]')) {
    const v = paint[String(el.dataset.paint).toUpperCase()];
    if (v) el.setAttribute('fill', v);
  }
  for (const el of faceEl.querySelectorAll('[data-stroke]')) {
    const v = paint[String(el.dataset.stroke).toUpperCase()];
    if (v) el.setAttribute('stroke', v);
  }
  const shellEl = faceEl.querySelector('[data-paint="shell"]');
  if (shellEl) shellEl.setAttribute('stroke-opacity', String(t.rimA));
  return true;
}

/**
 * Broadcast chrome — tokens and HTML the TV and the phone share.
 *
 * The chase overlay in party-follow.js is the look the room already trusts (REC, lower-third,
 * letterbox). Host paint used to restyle each beat with inline leftovers. These builders are
 * the one language: title plate, join-code bug, nameplate, countdown, verdict plate.
 *
 * CSS lives here so a bare-node gate can walk it, same as ROLE_CARD_CSS / FOLLOW_CHROME_CSS.
 * night-skin.js interpolates the block. No colour literals except photographic black.
 * No backticks in the comment inside the CSS string.
 */
export const SHOW_TITLE = 'PRIME TIME';
export const SHOW_LINE = 'Two of you go in. One walks, one talks. The rest of us watch. Someone in this room is lying.';

/** Camera bug per show beat. Expedition stays CAM 01 to match follow.js CAM_LABEL. */
export const SHOW_CAM = {
  lobby: 'RRR CAM 00',
  casting: 'RRR CAM 00',
  expedition: 'RRR CAM 01',
  recap: 'RRR CAM 02',
  debrief: 'RRR CAM 02',
  reckoning: 'RRR CAM 03',
  vote: 'RRR CAM 03',
  execution: 'RRR CAM 03',
};

export function showCam(beat) {
  return SHOW_CAM[String(beat || '')] || SHOW_CAM.lobby;
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function recBugHtml({ cam = SHOW_CAM.lobby } = {}) {
  return `<div class="show-rec" aria-hidden="true"><span class="show-dot"></span><span>${escHtml(cam)}</span></div>`;
}

export function nameplateHtml({ name, sub = '', face = '' } = {}) {
  return `<div class="show-third">
    ${face ? `<div class="face">${face}</div>` : ''}
    <div>
      <div class="who">${escHtml(name)}</div>
      ${sub ? `<div class="sub">${escHtml(sub)}</div>` : ''}
    </div>
  </div>`;
}

export function titlePlateHtml({ title = SHOW_TITLE, line = SHOW_LINE } = {}) {
  return `<div class="show-title">
    <div class="show-title-name">${escHtml(title)}</div>
    <div class="show-title-line">${escHtml(line)}</div>
  </div>`;
}

export function codeBugHtml({ code, url = '', sub = 'room code · phones scan the qr' } = {}) {
  return `<div class="show-bug">
    <div class="show-bug-k">live · join</div>
    <div class="night-code">${escHtml(code)}</div>
    <div class="night-sub">${escHtml(sub)}</div>
    ${url ? `<div class="night-url">${escHtml(url)}</div>` : ''}
  </div>`;
}

export function countdownHtml({ clock, label = '' } = {}) {
  if (!clock) return '';
  return `<div class="show-clock">
    ${label ? `<div class="show-clock-k">${escHtml(label)}</div>` : ''}
    <div class="talk-clock" data-show-clock>${escHtml(clock)}</div>
  </div>`;
}

export function verdictPlateHtml({ kicker = 'VERDICT READY', line, sub = '' } = {}) {
  return `<div class="show-verdict">
    <div class="show-verdict-k">${escHtml(kicker)}</div>
    <div class="show-verdict-v">${escHtml(line)}</div>
    ${sub ? `<div class="show-verdict-s">${escHtml(sub)}</div>` : ''}
  </div>`;
}

/**
 * Direction B — the shooting schedule across the top of the TV.
 *
 * `phases.js` / live SHOW beats ARE the schedule. Current beat is lit; its bar drains
 * with `show.until` when the server published one. Expedition / chase is a ~22px ribbon
 * so the picture stays king. Lobby and talk beats open the labels.
 */
export function rundownRailHtml({
  beat = 'lobby',
  until = null,
  holdMs = null,
  ribbon = false,
  now = Date.now(),
  beats = RUNDOWN_BEATS,
} = {}) {
  const current = String(beat || 'lobby').toLowerCase();
  const idx = beats.indexOf(current);
  const drain = railDrainPct(until, holdMs, now);
  const fillPct = drain == null ? 100 : drain;
  const holdAttr = Number.isFinite(holdMs) && holdMs > 0 ? String(holdMs) : '';
  const mode = ribbon || rundownRibbon(current) ? 'ribbon' : 'open';
  const segs = beats.map((id, i) => {
    const live = SHOW_BEATS.includes(id);
    const state = i === idx ? 'on' : (i < idx ? 'past' : (live ? 'next' : 'stub'));
    const fill = i === idx
      ? `<div class="show-rail-fill" data-rail-drain data-rail-hold="${escHtml(holdAttr)}" style="width:${fillPct}%"></div>`
      : '';
    return `<div class="show-rail-seg ${state}" data-rail-seg="${escHtml(id)}"${i === idx ? ' aria-current="step"' : ''}>
      <div class="show-rail-k">${escHtml(id)}</div>
      <div class="show-rail-track">${fill}</div>
    </div>`;
  }).join('');
  return `<nav class="show-rail ${mode}" data-show-rail data-beat="${escHtml(current)}" aria-label="Night rundown">${segs}</nav>`;
}

export const SHOW_CHROME_CSS = `
    /* Shared show dressing. Photographic black only — matte, plate, shadow. */
    .show-rec { display:flex; align-items:center; gap:9px; letter-spacing:.24em;
      text-transform:uppercase; font-size:12px; font-weight:700; color:var(--night-ink); }
    .show-dot { width:11px; height:11px; border-radius:50%; background:var(--night-bad);
      box-shadow:0 0 12px var(--night-bad); animation: fl-rec 2s ease-in-out infinite; }
    .night-brand-row { display:flex; align-items:center; gap:14px; }
    .show-title { margin:0 0 18px; max-width:46rem; }
    .show-title-name { font-size:clamp(28px, 5vw, 56px); font-weight:800; letter-spacing:.2em;
      text-transform:uppercase; color:var(--night-accent); line-height:1; }
    .show-title-name::before { content:''; display:inline-block; width:12px; height:12px;
      margin-right:14px; vertical-align:0.12em; background:var(--night-accent); transform:rotate(45deg); }
    .show-title-line { margin-top:10px; color:var(--night-soft); font-size:16px; letter-spacing:.02em;
      line-height:1.4; }
    .show-bug { padding:14px 18px 12px; border:1px solid rgba(var(--night-accent-rgb), .35);
      background:rgba(0,0,0,.45); border-radius:0 14px 14px 0; min-width:min(100%, 22rem); }
    .show-bug-k { color:var(--night-accent); font-size:11px; letter-spacing:.26em;
      text-transform:uppercase; font-weight:700; margin-bottom:8px; }
    .night-url { margin-top:12px; color:var(--night-dim); font-size:12px; letter-spacing:.03em;
      text-transform:none; max-width:28rem; word-break:break-all; }
    .hint.spaced { margin-top:16px; }
    .hint.live-hint { margin-top:14px; }
    .hint.waiting { margin-top:22px; }
    .show-third { display:flex; align-items:flex-end; gap:14px;
      padding:10px 22px 10px 10px; background:rgba(0,0,0,.62); border-radius:0 12px 12px 0;
      max-width:min(100%, 36rem); }
    .show-third .face { width:64px; height:64px; flex:0 0 auto;
      filter: drop-shadow(0 8px 20px rgba(0,0,0,.8)); }
    .show-third .face .bot-face { width:64px; height:64px; }
    .show-third .who { font-size:clamp(28px, 4.4vw, 56px); font-weight:800; line-height:.98;
      color:var(--night-ink); text-shadow:0 3px 18px rgba(0,0,0,.95); }
    .show-third .sub { margin-top:6px; font-size:12px; letter-spacing:.26em; text-transform:uppercase;
      color:var(--night-accent); text-shadow:0 2px 10px rgba(0,0,0,.9); }
    .show-clock { display:flex; flex-direction:column; align-items:flex-end; text-align:right; }
    .show-clock-k { color:var(--night-accent); font-size:11px; letter-spacing:.22em;
      text-transform:uppercase; font-weight:700; margin-bottom:2px; }
    .show-clock .talk-clock { font-size:clamp(32px, 5vw, 56px); }
    /* Talk chrome lives in reserved bands around the ballroom well — never inset over the
       3D layer. The follow canvas is a body-level z-index 5 plate; night is z-index 1, so
       any overlay that shares the frame rect is under the chairs. No backticks in this comment. */
    .talk-chrome-top { display:flex; justify-content:space-between; align-items:flex-start;
      gap:12px; width:100%; flex:0 0 auto; padding:0 0 8px; }
    .talk-chrome-bot { display:flex; flex-direction:column; align-items:flex-start; gap:6px;
      width:100%; flex:0 0 auto; padding:8px 0 0; }
    .talk-well { flex:1 1 auto; min-height:0; display:flex; flex-direction:row;
      align-items:stretch; gap:12px; width:100%; }
    .talk-picture { flex:1 1 auto; min-width:0; min-height:0;
      display:flex; align-items:center; justify-content:center; }
    .talk-side { flex:0 0 min(26%, 280px); min-width:168px; max-width:300px;
      min-height:0; overflow:hidden; display:flex; flex-direction:column; gap:6px; }
    .show-verdict { margin:0; padding:10px 14px; border:2px solid rgba(var(--night-accent-rgb), .55);
      background:rgba(0,0,0,.72); border-radius:4px 14px 4px 4px; max-width:min(100%, 42rem); }
    .show-verdict-k { color:var(--night-accent); font-size:11px; letter-spacing:.24em;
      text-transform:uppercase; font-weight:800; }
    .show-verdict-v { margin-top:4px; font-size:clamp(18px, 2.6vw, 32px); font-weight:800;
      line-height:1.05; color:var(--night-ink); text-transform:uppercase; }
    .show-verdict-s { margin-top:4px; color:var(--night-dim); font-size:11px; letter-spacing:.14em;
      text-transform:uppercase; }
    .show-tally { display:flex; flex-wrap:wrap; gap:6px 10px; margin-top:0; }
    .show-tally-row { display:flex; align-items:baseline; gap:8px;
      padding:6px 10px; background:rgba(0,0,0,.55); border-radius:6px;
      border:1px solid rgba(var(--night-accent-rgb), .22); }
    .show-tally-row .who { font-size:clamp(14px, 1.6vw, 20px); font-weight:800; }
    .show-tally-row .n { font-size:clamp(16px, 2vw, 24px); font-weight:800; color:var(--night-accent);
      font-variant-numeric:tabular-nums; }
    .nom-board { pointer-events:none; }
    .nom-row.show-nom { display:flex; align-items:center; gap:8px; padding:6px 8px; }
    .nom-row.show-nom .show-third { background:transparent; padding:0; }
    .talk-side .nom-board { margin:0; max-width:none; gap:6px; width:100%; }
    .talk-side .show-third .face, .talk-side .show-third .face .bot-face { width:40px; height:40px; }
    .talk-side .show-third .who { font-size:clamp(16px, 1.8vw, 24px); }
    .talk-chrome-bot .show-third .face, .talk-chrome-bot .show-third .face .bot-face {
      width:44px; height:44px; }
    .talk-chrome-bot .show-third .who { font-size:clamp(20px, 2.8vw, 36px); }
    .talk-chrome-bot .show-third { padding:8px 16px 8px 8px; }
    .talk-side .ballot { gap:6px; }
    .talk-side .ballot .row { padding:8px 10px; gap:10px; }
    .talk-side .ballot .who { font-size:clamp(16px, 1.8vw, 24px); }
    .talk-side .ballot .pick { font-size:clamp(13px, 1.5vw, 18px); }
    .talk-side .ballot.huge .who { font-size:clamp(18px, 2vw, 28px); }
    .talk-side .ballot.huge .pick { font-size:clamp(14px, 1.6vw, 20px); }
    .talk-side .pair-hero { font-size:clamp(16px, 2vw, 28px); margin:0 0 8px; }
    .talk-side .ballot .arrow { font-size:11px; }
    .talk-side .ballot-why { font-size:11px; margin:0 0 8px; }
    /* Recap is a lower-third strip, one 16:9 viewport, no scroll. */
    .recap-stage { width:100%; display:flex; flex-direction:column; gap:8px; }
    .recap-head { display:flex; justify-content:flex-end; align-items:flex-end; }
    .recap { display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));
      gap:8px; width:100%; max-width:none; }
    .recap .fact { padding:10px 14px; border-radius:8px; background:rgba(0,0,0,.62);
      border:1px solid rgba(var(--night-accent-rgb), .28); }
    .recap .k { letter-spacing:.2em; text-transform:uppercase; color:var(--night-accent); font-size:11px;
      font-weight:700; }
    .recap .v { font-size:clamp(22px, 3vw, 36px); font-weight:800; line-height:1.05; margin-top:4px; }
    .recap .v.bad { color:var(--night-bad); }
    .recap .v.ok { color:var(--night-live); }
    .night.on-recap .show-clock .talk-clock { font-size:clamp(28px, 4vw, 44px); }
    /* The recap facts, in the lower chrome instead of the plate. Sofa distance, not desk. */
    .talk-chrome-bot .recap.talk-facts { grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));
      gap:10px; margin-bottom:2px; }
    .talk-chrome-bot .recap.talk-facts .k { font-size:12px; letter-spacing:.26em; }
    .talk-chrome-bot .recap.talk-facts .v { font-size:clamp(28px, 4vw, 56px); }
    /* 🔢 Which SAM. The player's own accent, carrying their seat number. */
    .seat-chip { flex:0 0 auto; display:inline-flex; align-items:center; justify-content:center;
      min-width:30px; height:30px; padding:0 6px; border-radius:15px; color:var(--night-panel);
      font-weight:900; font-size:15px; line-height:1; }
    /* 📊 The ballot box filling up. Count and threshold — never a name, never a tally. */
    .tally-board { margin-bottom:10px; }
    .tally-n { display:flex; align-items:baseline; gap:8px; }
    .tally-in { font-size:clamp(28px, 4vw, 52px); font-weight:800; line-height:1;
      color:var(--night-accent); font-variant-numeric:tabular-nums; }
    .tally-in.ok, .tally-board.full .tally-in { color:var(--night-live); }
    .tally-of { font-size:clamp(14px, 1.4vw, 20px); font-weight:700; color:var(--night-dim); }
    .tally-bar { margin-top:8px; height:10px; border-radius:5px; background:var(--night-well);
      overflow:hidden; }
    .tally-fill { height:100%; background:var(--night-accent); transition:width .3s ease; }
    .tally-board.full .tally-fill { background:var(--night-live); }
    /* 🎬 The casting board — the room's own shape during the role-card window. */
    .cast-board { width:100%; margin:0 0 14px; }
    .cast-k { color:var(--night-accent); font-size:12px; letter-spacing:.26em;
      text-transform:uppercase; font-weight:700; }
    .cast-lead { font-size:clamp(26px, 3.4vw, 48px); font-weight:800; line-height:1.1; margin-top:4px; }
    .cast-lamps { display:grid; grid-template-columns:repeat(auto-fit, minmax(132px, 1fr));
      gap:10px; margin-top:14px; }
    .cast-lamp { padding:14px 10px 12px; border-radius:12px; background:rgba(0,0,0,.55);
      border:1px solid rgba(var(--night-accent-rgb), .16); text-align:center; opacity:.58;
      display:flex; flex-direction:column; align-items:center; gap:8px;
      transition:opacity .3s ease, border-color .3s ease; }
    .cast-lamp.on { opacity:1; border-color:var(--night-live); }
    .cast-lamp .who { font-size:clamp(15px, 1.5vw, 20px); font-weight:800; line-height:1.1; }
    .cast-lamp .meta { font-size:10px; letter-spacing:.2em; text-transform:uppercase;
      font-weight:700; color:var(--night-dim); }
    .cast-lamp.on .meta { color:var(--night-live); }
    .cast-count { display:flex; align-items:baseline; gap:8px; margin-top:14px; }
    /* In the lower chrome band the same board is a strip, not a page. */
    .talk-chrome-bot .cast-board { margin:0 0 4px; }
    .talk-chrome-bot .cast-lead { font-size:clamp(18px, 2vw, 28px); }
    .talk-chrome-bot .cast-lamps { margin-top:8px; gap:8px; }
    .talk-chrome-bot .cast-lamp { padding:8px 8px 7px; gap:5px; border-radius:10px; }
    .talk-chrome-bot .cast-lamp .who { font-size:clamp(13px, 1.1vw, 16px); }
    .talk-chrome-bot .cast-lamp .seat-chip { min-width:24px; height:24px; font-size:13px; }
    .talk-chrome-bot .cast-count { margin-top:8px; }
    .talk-chrome-bot .cast-count .tally-in { font-size:clamp(22px, 2.4vw, 34px); }
    /* 🎬 THE CASTING OVERLAY — the ONE place show chrome is allowed over the 3D layer, and only
       because '.night.on-cast' in night-skin.js lifts the night above the body-level camera
       plate first. Talk beats keep their reserved bands; nothing here applies to them.
       No panel behind the column, just a scrim that fades out toward the middle of the picture,
       so the ballots read from the couch without boxing off a quarter of the frame. */
    .cast-overlay { position:absolute; inset:0 0 0 auto; width:clamp(230px, 26%, 380px);
      display:flex; flex-direction:column; align-content:flex-start; gap:8px;
      padding:14px 18px 16px; min-height:0; overflow:hidden; pointer-events:none; z-index:2;
      background:linear-gradient(270deg, rgba(0,0,0,.82) 0%, rgba(0,0,0,.5) 58%, rgba(0,0,0,0) 100%); }
    .cast-overlay-k { flex:0 0 auto; color:var(--night-accent); font-size:11px;
      letter-spacing:.28em; text-transform:uppercase; font-weight:800;
      text-shadow:0 2px 10px rgba(0,0,0,.9); }
    .cast-slips { display:flex; flex-direction:column; gap:6px; min-height:0; overflow:hidden; }
    /* No entry animation on a slip. paint() rebuilds root.innerHTML on every socket message and
       the lobby fans a snapshot several times a second, so a per-slip fade-in would not read as
       'a ballot just landed' — it would strobe the whole column for the length of the beat. */
    .cast-slip { display:flex; flex-direction:column; gap:3px; padding:7px 10px;
      border-radius:0 5px 5px 0; border-left:3px solid var(--night-accent);
      background:rgba(0,0,0,.86); }
    .cast-voter { font-size:clamp(15px, 1.5vw, 22px); font-weight:800; line-height:1;
      color:var(--night-ink); text-shadow:0 2px 10px rgba(0,0,0,.9); }
    .cast-picks { display:flex; flex-wrap:wrap; gap:4px 14px; font-weight:700;
      font-size:clamp(12px, 1.1vw, 16px); line-height:1.1; color:var(--night-ink);
      text-shadow:0 2px 10px rgba(0,0,0,.9); }
    .cast-picks em { font-style:normal; margin-right:5px; font-size:10px; font-weight:800;
      letter-spacing:.18em; text-transform:uppercase; color:var(--night-accent); }
    .cast-empty { margin:0; color:var(--night-dim); font-size:12px; letter-spacing:.16em;
      text-transform:uppercase; text-shadow:0 2px 10px rgba(0,0,0,.9); }
    /* Directly under the slips, not floated to the bottom of the column — it is the footnote to
       the ballots above it, and a tiebreak line stranded 900px away reads as unrelated chrome. */
    .cast-why { flex:0 0 auto; margin:0; color:var(--night-soft); font-size:11px;
      letter-spacing:.1em; text-transform:uppercase; line-height:1.35;
      text-shadow:0 2px 10px rgba(0,0,0,.9); }
    /* The role-card board, as a lower third over the picture rather than a band under it.
       The BAND runs the full width so its scrim has no vertical seam where it meets the ballot
       column's; it is the CONTENT that stops short, by reserving the column's width as padding.
       Cutting the element short instead drew a hard edge straight down the picture. */
    .cast-strip { position:absolute; inset:auto 0 0 0; pointer-events:none; z-index:2;
      padding:14px 20px 16px; padding-right:calc(clamp(230px, 26%, 380px) + 20px);
      background:linear-gradient(0deg, rgba(0,0,0,.86) 0%, rgba(0,0,0,.6) 55%, rgba(0,0,0,0) 100%); }
    .cast-strip .cast-board { margin:0; }
    .cast-strip .cast-k { font-size:11px; }
    .cast-strip .cast-lead { font-size:clamp(16px, 1.8vw, 26px); margin-top:2px;
      text-shadow:0 2px 12px rgba(0,0,0,.9); }
    .cast-strip .cast-lamps { margin-top:9px; gap:8px; }
    .cast-strip .cast-lamp { padding:7px 8px 6px; gap:4px; border-radius:8px;
      background:rgba(0,0,0,.72); }
    .cast-strip .cast-lamp .who { font-size:clamp(12px, 1.05vw, 15px); }
    .cast-strip .cast-lamp .seat-chip { min-width:22px; height:22px; font-size:12px; }
    .cast-strip .cast-warm { margin-top:9px; }
    .pick-list.jackbox button { min-height:76px; font-size:clamp(22px, 7vw, 36px);
      padding:18px 20px; letter-spacing:.04em; }
    .pick-list.buzz button { animation: night-rise .35s ease; }
    .night.on-run .show-rec, .night.on-talk .show-rec, .night.on-intro .show-rec { font-size:10px; }
    .night.on-run .show-dot, .night.on-talk .show-dot { width:8px; height:8px; }
    /* Direction B rundown rail. Tokens only. No backticks in this comment. */
    .night-phase { display:flex; align-items:baseline; gap:14px; }
    .show-ep { color:var(--night-dim); font-size:12px; letter-spacing:.18em; font-weight:700; }
    .show-mast-clock { color:var(--night-ink); font-size:clamp(22px, 3vw, 36px); font-weight:800;
      letter-spacing:.04em; font-variant-numeric:tabular-nums; line-height:1; }
    .show-rail { display:flex; align-items:stretch; gap:6px; width:100%;
      padding:2px 28px 10px; pointer-events:none; }
    .show-rail-seg { flex:1 1 0; min-width:0; display:flex; flex-direction:column;
      align-items:center; justify-content:flex-end; gap:5px; }
    .show-rail-k { font-size:11px; font-weight:700; letter-spacing:.16em; text-transform:uppercase;
      color:var(--night-dim); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
      width:100%; text-align:center; line-height:1.2; }
    .show-rail-track { width:100%; height:2px; background:rgba(var(--night-accent-rgb), .16);
      overflow:hidden; }
    .show-rail-fill { height:100%; width:100%; background:var(--night-accent); }
    .show-rail-seg.on .show-rail-k { color:var(--night-accent);
      box-shadow: inset 0 1px 0 var(--night-accent), inset 0 -1px 0 var(--night-accent);
      padding:4px 0; }
    .show-rail-seg.on .show-rail-track { height:3px; background:rgba(var(--night-accent-rgb), .28); }
    .show-rail-seg.past .show-rail-track { background:rgba(var(--night-accent-rgb), .28); }
    .show-rail-seg.stub { opacity:.5; }
    .show-rail.ribbon { height:22px; padding:0 28px; box-sizing:border-box; }
    .show-rail.ribbon .show-rail-seg { gap:2px; }
    /* 📺 **THE RIBBON KEEPS ITS LABELS.** Direction B shrinks the rundown to 22px during the run
       so the picture stays king, and that rule is right — but this used to spend the 22px by
       collapsing every label except the current one to 'height:0', which left eight unlabelled
       1px lines. Photographed at 1600x900: it does not read as "the schedule, minimised", it
       reads as a rendering artifact, and it costs the rail the one thing it exists for — where
       the room is in the night. Same height, same rule, labels that survive: 10px of line at 8px
       type, dimmed by state rather than deleted. */
    .show-rail.ribbon .show-rail-k { font-size:8px; letter-spacing:.14em; line-height:10px;
      height:10px; opacity:.55; overflow:hidden; white-space:nowrap;
      box-shadow:none; padding:0; }
    .show-rail.ribbon .show-rail-seg.on .show-rail-k { height:10px; opacity:1; }
    .show-rail.ribbon .show-rail-seg.past .show-rail-k { opacity:.34; }
    .show-rail.ribbon .show-rail-track { height:3px; }
    .show-rail.ribbon .show-rail-seg.on .show-rail-track { height:4px; }
    .night.on-run .show-rail { padding:0 22px 2px; }
    .night.on-run .show-rail.ribbon { padding:0 22px; }
    .night.on-run .show-ep { font-size:10px; }
    .night.on-run .show-mast-clock { font-size:18px; }
    .night.on-talk .show-rail, .night.on-intro .show-rail, .night.on-recap .show-rail {
      padding:2px 22px 8px; }
    .night.on-recap .show-rec { font-size:10px; }
    .night.on-recap .show-dot { width:8px; height:8px; }
    @keyframes fl-rec { 0%,100% { opacity:.25; } 50% { opacity:1; } }
`;
