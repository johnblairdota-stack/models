/**
 * Public lobby cosmetics — a face, two colours. Not a role, not a deal.
 *
 * Closed palettes so a phone cannot smuggle a string through `shell` / `accent`.
 * The face is one SVG (Grok-Bot wedge energy, not a second 3D pipeline).
 */

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
 * Small robot face. `shell` is the helmet; `accent` is the wedge visor.
 * No element ids — the TV lobby mounts one per chair.
 */
export function robotFaceSvg(shell = DEFAULT_LOOK.shell, accent = DEFAULT_LOOK.accent, { size = 120 } = {}) {
  const s = cleanLook({ shell, accent }) || DEFAULT_LOOK;
  return `<svg class="bot-face" viewBox="0 0 80 80" width="${size}" height="${size}" aria-hidden="true">
    <path class="bot-shell" fill="${s.shell}" d="M40 7C55 7 67 18 67 34v15c0 17-14 25-27 25S13 66 13 49V34C13 18 25 7 40 7z"/>
    <path class="bot-wedge" fill="${s.accent}" d="M40 18l20 17-20 24L20 35z"/>
    <rect class="bot-eye" x="29.5" y="33" width="6.5" height="4.2" rx="2.1" fill="#1a120c"/>
    <rect class="bot-eye" x="44" y="33" width="6.5" height="4.2" rx="2.1" fill="#1a120c"/>
  </svg>`;
}
