/**
 * 🎨 **THE NIGHT'S PALETTE, NAMED ONCE.**
 *
 * PR #5 reskinned the sit-down night from a cold blue to a broadcast amber, and it found the cost
 * of an unnamed palette immediately: `rolecard.js` had been written against the blue and there was
 * nothing to tell it the room had changed — the role card would have shipped as the one cyan
 * surface in an amber lounge, and no gate could have said so, because a hex is a hex.
 *
 * So the card's colours are not hexes. They are these names, and `harness/role-peek.mjs` P11
 * asserts that the card CSS contains **no raw colour at all** and that every name it reaches for
 * is declared here. A reskin that misses the card now fails a gate instead of a playtest.
 *
 * ⚠️ WHAT THIS IS NOT. `night-skin.js`'s own rules still carry their literals — converting sixty
 * of them on a file that landed an hour ago is a mechanical diff with nothing to gain and a typo
 * to lose. This block is where the palette is NAMED, and it is the whole palette for anything
 * built after it. Widening it to the older rules is a tidy-up, not this change.
 *
 * `_RGB` companions exist because the card needs alpha variants of the accent for its borders,
 * and `rgba(var(--night-accent-rgb), .28)` works everywhere `rgba` does — no `color-mix` floor.
 *
 * No THREE, no DOM. A plain string, so a gate can read it in bare node.
 */

/** `[name, value]`, in the order they are declared. The gate walks this. */
export const NIGHT_PALETTE = [
  ['--night-bg', '#0c0a08'],            // the room
  ['--night-deep', '#080604'],          // one step darker — the deal happens here
  ['--night-panel', '#161310'],         // a card, a field, a list row
  ['--night-well', '#12100c'],          // inside a card back, behind the weave
  ['--night-accent', '#f5a14a'],        // the broadcast amber
  ['--night-accent-rgb', '245,161,74'],
  ['--night-ink', '#f3ece3'],           // body text
  ['--night-soft', '#a89884'],          // secondary text
  ['--night-dim', '#8a7d70'],           // labels, uppercase strips
  ['--night-live', '#9ff2c8'],          // on air / reading / a lit camera
  ['--night-live-well', '#122019'],     // the hold bar while it is being held
  ['--night-bad', '#ff8a7a'],           // taken, dark, Production
];

/** The `:root` block. Prepended to the night skin so every later rule can reach these. */
export const NIGHT_TOKENS = `:root {\n${
  NIGHT_PALETTE.map(([k, v]) => `    ${k}: ${v};`).join('\n')}\n  }`;

/** Is `name` a palette token? The gate's membership test. */
export const isNightToken = (name) => NIGHT_PALETTE.some(([k]) => k === name);
