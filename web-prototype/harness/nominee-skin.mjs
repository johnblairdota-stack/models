#!/usr/bin/env node
/**
 * nominee-skin — does the ACCUSED player's floating name tag say so, and can the room still read it?
 *
 *   node harness/nominee-skin.mjs
 *
 * WHY THIS FILE EXISTS. A nominee's tag was answered by a red `!` sprite floating above it. On
 * air that says *something is up* and never *what* — it reads closer to "evil" than "accused",
 * and it is a second object in the sky rather than a change to the ONE surface a table actually
 * looks at while it argues. `NOM_INK` / `NOM_CHROME` repaint the plate itself, exactly as the
 * pair merge already does with `LINK_INK` / `LINK_CHROME`.
 *
 * ⚠️ **A COLOUR DECISION IS ONLY AS GOOD AS ITS WORST CASE, AND ITS WORST CASE IS A NUMBER.**
 * The plate now carries a seat tab painted in the PLAYER'S OWN accent — one of twelve — so a
 * field colour chosen by eye against one accent can swallow the tab of another. The pair green
 * is the proof that this is real rather than theoretical: `#d95a8a` sits on it at 1.48:1, which
 * is a tab you can see only because you know it is there. Every bar below is set at a SHIPPED
 * skin's number, so "as good as what is already on the television" is the pass mark and nothing
 * here is graded against taste.
 *
 * ⚠️ **NO IMPORTS FROM `src/characters/`.** `chest-nameplate.js` imports THREE and CI runs the
 * party gates with no `npm install` (`.github/workflows/gates.yml`). Its constants are read out
 * of the source as text — the same move `party-warm` makes on the same file. `link.js` owns
 * `NAME_CAP` as a number; the plate restates the same 8 so a tag and a merge never drift.
 *
 * WHAT IT ALSO RECORDS: the verdict on *"could the tag also say NAMED BY <accuser>"*. It cannot,
 * and S6 is that answer as arithmetic rather than as an opinion in a transcript — the plate is
 * 215 × 61 television pixels at every talk distance, and a second line lands under the ten-foot
 * legibility floor while dragging the name under it too. The long form is in the block comment
 * beside `NOM_INK`. If someone proposes it again, run this and read S6.
 */

import { readFile } from 'node:fs/promises';
import { ACCENTS } from '../src/party/look.js';
import { NIGHT_PALETTE } from '../src/party/palette.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

console.log('\nnominee-skin — the accused plate: does it read, and does the seat tab survive it?\n');

const plateSrc = await readFile(new URL('../src/characters/chest-nameplate.js', import.meta.url), 'utf8');
const linkSrc = await readFile(new URL('../src/party/link.js', import.meta.url), 'utf8');
const bedSrc = await readFile(new URL('../src/game/intro-bed.js', import.meta.url), 'utf8');

// The lookbehind is not decoration: without it `INK` matches `NOM_INK` and `CHROME` matches
// `NOM_CHROME` the moment somebody reorders this file, and the gate would then be comparing
// the new skin against ITSELF and passing every separation test by definition.
const hexOf = (src, name) => (src.match(new RegExp(`(?<![A-Z_])${name}\\s*=\\s*'(#[0-9A-Fa-f]{6})'`)) || [])[1] || null;

const NOM_INK = hexOf(plateSrc, 'NOM_INK');
const NOM_CHROME = hexOf(plateSrc, 'NOM_CHROME');
const INK = hexOf(plateSrc, 'INK');
const CHROME = hexOf(plateSrc, 'CHROME');
const SHELL_C = hexOf(plateSrc, 'SHELL');
const BANG_RED = hexOf(plateSrc, 'BANG_RED');
const LINK_INK = hexOf(linkSrc, 'LINK_INK');
const LINK_CHROME = hexOf(linkSrc, 'LINK_CHROME');
const NIGHT_BAD = (NIGHT_PALETTE.find(([k]) => k === '--night-bad') || [])[1];

/* --- colour maths. sRGB -> relative luminance (WCAG) and -> CIE Lab (D65), no dependencies. --- */
const chan = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (h) => { const [r, g, b] = chan(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
function lab(h) {
  const [r, g, b] = chan(h).map(lin);
  let X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  let Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const dE = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
const hueOf = (h) => { const [, a, b] = lab(h); return (Math.atan2(b, a) * 180 / Math.PI + 360) % 360; };
const dHue = (a, b) => { const d = Math.abs(hueOf(a) - hueOf(b)) % 360; return d > 180 ? 360 - d : d; };
const worstAccent = (field) => ACCENTS.reduce((w, a) => (cr(field, a) < w.k ? { k: cr(field, a), a } : w), { k: Infinity, a: null });

// ---- S1 · THE CONTRACT ---------------------------------------------------------------------
// Two constants, the same shape as the pair skin, and passed through the EXISTING call. A skin
// that needs a new signature is a skin every other caller has to be taught about.
{
  t('S1 · the accused skin exports an ink and a chrome, like the pair skin does',
    /export const NOM_INK = '#[0-9A-Fa-f]{6}';/.test(plateSrc)
    && /export const NOM_CHROME = '#[0-9A-Fa-f]{6}';/.test(plateSrc)
    && !!NOM_INK && !!NOM_CHROME, `${NOM_INK} / ${NOM_CHROME}`);
  t('S1a · setNameTagLabel still takes (sprite, label, skin, tab) — no signature change',
    /export function setNameTagLabel\(sprite, label, skin = null, tab = null\)/.test(plateSrc)
    && /const ink = skin\?\.ink \|\| INK;/.test(plateSrc)
    && /const chrome = skin\?\.chrome \|\| CHROME;/.test(plateSrc));
  // The tab is the argument that arrived today and it has to keep working under the new skin:
  // it is painted from the caller's `{seat, accent}` and it joins the idempotence key, or a
  // player coming back from a nomination would lose their seat number for the rest of the night.
  t('S1b · the seat tab still rides the 4th argument, and still joins the idempotence key',
    /paintPlate\(text, skin, tab\?\.seat \?\? null, tab\?\.accent \?\? null\)/.test(plateSrc)
    && /sprite\.userData\.tagTab === tabKey/.test(plateSrc)
    && /if \(seat == null \|\| seat === ''\) return 0;/.test(plateSrc));
}

// ---- S2 · IT MUST NOT BE MISTAKEN FOR THE OTHER TWO PLATES ---------------------------------
//
// Three skins are on air in one night: the show blue, the pair green, the accusation. Hue alone
// is not enough to tell them apart — an LQ cast desaturates, and roughly one man in twelve sees
// the red/green pair the least well of anybody in the room. So they are also separated by
// LIGHTNESS, which survives both.
{
  const dInk = dE(NOM_INK, INK), dLink = dE(NOM_INK, LINK_INK);
  t('S2 · the accused field is nowhere near the show blue or the pair green',
    dInk >= 40 && dLink >= 40, `ΔE ink ${dInk.toFixed(0)} · pair ${dLink.toFixed(0)}`);
  const L = lab(NOM_INK)[0], Lb = lab(INK)[0], Lg = lab(LINK_INK)[0];
  t('S2a · …and separates on lightness too, so a desaturated cast still tells them apart',
    Math.abs(L - Lb) >= 5 && Math.abs(L - Lg) >= 5,
    `L* ${L.toFixed(1)} vs blue ${Lb.toFixed(1)} vs green ${Lg.toFixed(1)}`);
  /*
   * ⚠️ The CONTROL is the whole point of S2a. The two shipped skins pass the ΔE test against
   * each other and are 13 L* apart, so ΔE alone would have accepted a bright accusation red that
   * sat at the pair green's lightness — the exact plate a colour-blind viewer could not sort
   * from a merge on a hazy 720p stream.
   */
  t('S2 control · ΔE alone would accept a field at the pair green\'s own lightness',
    dE('#B03A2E', LINK_INK) >= 40 && Math.abs(lab('#B03A2E')[0] - Lg) < 5,
    `#B03A2E: ΔE ${dE('#B03A2E', LINK_INK).toFixed(0)} but L* ${lab('#B03A2E')[0].toFixed(1)}`);
  // It should still be the SAME accusation language as the bang above it — one red, not a third
  // faction colour. Hue proximity to BANG_RED is what says so.
  t('S2b · it is the bang\'s own red family, not a third colour the room has to learn',
    dHue(NOM_INK, BANG_RED) <= 25, `Δhue ${dHue(NOM_INK, BANG_RED).toFixed(0)}°`);
}

// ---- S3 · THE NAME IS THE PRODUCT. A SKIN THAT COSTS IT IS NOT WORTH SHIPPING ---------------
//
// Locked rule: "black-outlined white text… legible at low quality and distance". The glyph
// treatment is untouched; the bar is that the white on the new FIELD is at least as good as the
// white on the two fields already on air.
{
  const white = cr(NOM_INK, SHELL_C);
  const floor = Math.min(cr(INK, SHELL_C), cr(LINK_INK, SHELL_C));
  t('S3 · white glyphs on the accused field beat both shipped fields',
    white >= floor && white >= 7,
    `${white.toFixed(1)}:1 · blue ${cr(INK, SHELL_C).toFixed(1)} · pair ${cr(LINK_INK, SHELL_C).toFixed(1)}`);
  t('S3a · the NAME\'s treatment is untouched — same stroke, same glyph colours',
    /g\.lineWidth = NAMEPLATE_SPEC\.strokePx;/.test(plateSrc)
    && /g\.strokeStyle = GLYPH_OUTLINE;/.test(plateSrc)
    && /g\.fillStyle = SHELL;/.test(plateSrc)
    && /strokePx: 10/.test(plateSrc) && /GLYPH_OUTLINE = '#000000'/.test(plateSrc));
  // The border does the shouting at three metres, so it is allowed to be the loudest of the
  // three — and it is measured against its own field, not against the room.
  const rim = cr(NOM_INK, NOM_CHROME);
  t('S3b · the border reads against its own field at least as loudly as the pair skin\'s',
    rim >= cr(LINK_INK, LINK_CHROME) && rim >= 3,
    `${rim.toFixed(2)}:1 · pair ${cr(LINK_INK, LINK_CHROME).toFixed(2)} · blue ${cr(INK, CHROME).toFixed(2)}`);
  // One palette, two screens. The pair sheet's green matches LINK_INK for exactly this reason.
  t('S3c · the border is the show\'s own --night-bad token, so phone and TV agree',
    !!NIGHT_BAD && NOM_CHROME.toLowerCase() === NIGHT_BAD.toLowerCase(), `${NOM_CHROME} = --night-bad`);
}

// ---- S4 · THE SEAT TAB HAS TO SURVIVE THE NEW FIELD -----------------------------------------
//
// D6/S1 put the seat number on the tag because two identical `SAM` plates were photographed in
// one frame at N=8. The tab is a block of the player's own accent, so the field it sits on
// decides whether it is still a tab or just a smudge. Bar: the worst of the twelve accents on
// the accused field must beat the worst on the best shipped skin.
{
  const mine = worstAccent(NOM_INK), blue = worstAccent(INK), green = worstAccent(LINK_INK);
  t('S4 · every seat accent still reads as a tab on the accused field',
    mine.k >= blue.k && mine.k >= 2.4,
    `worst ${mine.a} ${mine.k.toFixed(2)}:1 · blue ${blue.k.toFixed(2)} · pair ${green.k.toFixed(2)}`);
  t('S4a · …all twelve of them, not the average',
    ACCENTS.every((a) => cr(NOM_INK, a) >= 2.4), `${ACCENTS.length} accents`);
  /*
   * The control is the shipped pair green, and it is why this block exists at all: it fails the
   * bar its own successor has to clear. Nobody is being asked to fix it here — a merged pair
   * carries NO tab, which is why it has never been seen — but any FUTURE skin that does carry
   * one is measured, and this is the number that says the measurement is not free.
   */
  t('S4 control · the pair green would fail this bar, which is what makes it a bar',
    green.k < 2.0, `pair worst ${green.a} ${green.k.toFixed(2)}:1`);
}

// ---- S5 · THE TAG IS THE SURFACE, AND THE BANG STAYS WHERE IT IS -----------------------------
//
// This does not delete the `!`. The bang is the thing you notice from the kitchen; the plate is
// the thing you read when you look. Deleting one to add the other would trade a distance signal
// for a close one.
{
  t('S5 · the bang is untouched — the skin is added to the tag, not swapped for the sprite',
    /export function attachNomineeBang/.test(plateSrc)
    && /export function setNomineeBang/.test(plateSrc)
    && /BANG_RED/.test(plateSrc)
    && /setNomineeBang\(r\.bang/.test(bedSrc));
}

// ---- S6 · "NAMED BY <ACCUSER>" — THE VERDICT, AS ARITHMETIC ----------------------------------
/*
 * The review asked whether the plate could also name the accuser. The answer is no, and this is
 * the measurement rather than the opinion.
 *
 * ⚠️ **ONE CANVAS PIXEL IS ABOUT ONE TELEVISION PIXEL, AT EVERY DISTANCE THE TALK BEATS USE.**
 * Under `sizeAttenuation` on-screen size goes as k/d, and the plate's clamp `clamp(d/4, .34, 2)`
 * is flat from 1.36 m to 8 m — so the tag holds a CONSTANT 215 × 61 px of a 1080-line frame at
 * `TALK_FOV` 60°, three metres included. That is what makes a canvas-pixel budget a real
 * legibility budget, and it is why this can be checked in bare node with no browser.
 *
 * Ten-foot practice puts the minimum type height for a 1080p television at ~28 px. The name at
 * 44 px clears it. A second line cannot: `NAMED BY ` is 5.6 em of 900-weight caps, an 8-char
 * name takes the worst case to ~10.8 em, and 190 px of usable field forces ≈17 px type — while
 * making vertical room for it drags the NAME down to ~35 px. Both lines end up under the floor.
 */
{
  const num = (re) => Number((plateSrc.match(re) || [])[1]);
  const TAG_W = num(/TAG_W = ([\d.]+)/), TAG_H = num(/TAG_H = ([\d.]+)/);
  const W = num(/canvasW: (\d+)/), H = num(/canvasH: (\d+)/);
  const nearK = num(/TAG_NEAR_K = ([\d.]+)/), farK = num(/TAG_FAR_K = ([\d.]+)/), ref = num(/TAG_REF_DIST = ([\d.]+)/);
  const TALK_FOV = 60, LINES = 1080, halfT = Math.tan(TALK_FOV * Math.PI / 360);
  const k = (d) => Math.min(Math.max(d / ref, nearK), farK);
  const px = (m, d) => m * k(d) / (2 * d * halfT) * LINES;
  const dists = [1.4, 2, 3, 4, 6, 8];
  const heights = dists.map((d) => px(TAG_H, d));
  const widths = dists.map((d) => px(TAG_W, d));
  t('S6 · the plate is the same size on the television at every talk distance',
    Math.max(...heights) - Math.min(...heights) < 1 && Math.max(...widths) - Math.min(...widths) < 1,
    `${widths[0].toFixed(0)} × ${heights[0].toFixed(0)} px from ${dists[0]} m to ${dists.at(-1)} m`);
  t('S6a · …so a canvas pixel is about a TV pixel, and the canvas budget IS the legibility budget',
    Math.abs(heights[0] / H - 1) < 0.12 && Math.abs(widths[0] / W - 1) < 0.2,
    `x ${(widths[0] / W).toFixed(2)} · y ${(heights[0] / H).toFixed(2)} screen px per canvas px`);

  // Helvetica-Bold advance widths per 1000 em — the caps this plate actually paints.
  const ADV = { A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556, K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, ' ': 278 };
  const em = (s) => [...s].reduce((a, c) => a + (ADV[c] ?? 600), 0) / 1000;
  const TAB_W = num(/TAB_W = (\d+)/);
  const nameCap = num(/NAME_CAP = (\d+)/);
  const fieldW = W - (4 + TAB_W) - 4 - 20;              // the same inset paintPlate uses
  const worstName = 'M'.repeat(nameCap);
  const line2 = em('NAMED BY ') + em(worstName);
  const size2 = fieldW / line2;
  const CAP = 0.717;                                     // cap height as a fraction of the em
  const FLOOR = 28;                                      // ten-foot minimum type height at 1080p
  t('S6b · "NAMED BY <name>" would have to be set at half the ten-foot floor to fit the width',
    size2 < FLOOR * 0.7, `${line2.toFixed(1)} em in ${fieldW} px -> ${size2.toFixed(1)} px type · floor ${FLOOR}`);
  /*
   * ⚠️ **AND IT IS WIDTH-BOUND, WHICH IS WHY NO REARRANGEMENT RESCUES IT.** The obvious rebuttal
   * is "shrink the name and give the second line the height" — the height was never the binding
   * constraint. Hand the second line the WHOLE plate, tab and insets and all, and it is still
   * far under the floor. There is no layout of a 256 px canvas in which this line is readable.
   */
  const widest = W / line2;
  t('S6b2 · …and the whole 256 px plate, tab and insets included, does not save it',
    widest < FLOOR, `full width -> ${widest.toFixed(1)} px type`);
  // Vertical: name occupied height is cap + the black outline, which scales with the type.
  const occ = (f) => CAP * f + 10 * (f / 44);
  const inner = H - 8;
  let nameSize = 44;
  while (nameSize > 22 && occ(nameSize) + occ(size2) + 4 > inner) nameSize -= 1;
  t('S6c · …and the NAME pays for it too — a tenth of its height, to gain an unreadable line',
    nameSize < 44 && occ(44) + occ(size2) + 4 > inner,
    `name 44 px -> ${nameSize} px to seat a ${size2.toFixed(0)} px second line in ${inner} px`);
  t('S6 control · one line at 44 px clears the same floor with room to spare',
    44 >= FLOOR && occ(44) <= inner, `44 px name occupies ${occ(44).toFixed(0)} of ${inner} px`);
  // And the accuser is already ON the television, in DOM type, at a size built to be read.
  t('S6d · the accuser is aired already — the nomination board says who named whom',
    /named by \$\{joinedName\(names, n\.nominator/.test(await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8')));
  /*
   * ⚠️ **THE CANVAS IS NOT ALLOWED TO GROW TO SETTLE THIS ARGUMENT.** A taller plate (canvasH 96,
   * TAG_H ≈ 0.39) is the honest way to carry a second line, and it moves NAMEPLATE_SPEC, the
   * bang's gap and the link stream's anchor — a gated spec change, John's call, not a skin's.
   */
  t('S6e control · the plate spec was NOT quietly grown to make the second line fit',
    W === 256 && H === 64 && TAG_H === 0.26 && TAG_W === 0.92, `${W}×${H} · ${TAG_W}×${TAG_H} m`);
}

console.log(`\nnominee-skin: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
