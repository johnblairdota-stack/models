#!/usr/bin/env node
/**
 * 📺 **react-fit — THE RUN BEAT ACTUALLY FITS ON A TELEVISION.**
 *
 *   node harness/react-fit.mjs
 *
 * ⚠️ **NOT IN `gates:party`, and that is deliberate.** CI runs the chain with no `npm install`
 * (`.github/workflows/gates.yml` explains why), so nothing in it may drive a browser. This is the
 * arrangement `harness/cam-clip-drive.mjs` already documents. `party-warm` W44 asserts the SHAPE
 * that makes the layout self-correcting; this file is the instrument that measures whether it
 * actually did. Run it when you touch the run beat's layout.
 *
 * THE DEFECT IT EXISTS FOR. The run beat stacks a `TV_FRAME_PCT`vh picture, the hero line, the
 * facts line and the reaction strip inside a `night-main` that hides its overflow. Those four did
 * not fit in what the chrome left, and hidden overflow does not look like anything — so the
 * bottom of the strip was simply cut off and nobody could see that it had been. Measured before
 * the fix:
 *
 *     1920x1080   24 px of every 74 px chip below the screen edge · NAME NOT ON THE TELEVISION
 *     1280x720    39 px cut · name not on the television
 *     2560x1440    6 px cut · name survived
 *
 * The name is the whole feature. `src/party/react.js` decision 1: *"a reaction is PUBLIC and it
 * is ATTRIBUTED… a boo is evidence — who booed when she found the safe? — and evidence has to
 * have a name on it."* Evidence with the name cropped off is not evidence.
 *
 * It renders the REAL `injectNightSkin()` in a real browser rather than a copy of the CSS: the
 * first version of this measurement hand-copied the stylesheet, silently dropped the rule that
 * carries `${TV_FRAME_PCT}` because the interpolation was left as a literal, and reported that
 * everything fitted. A layout harness that mocks the layout measures its own mock.
 */

import { chromium } from 'playwright';
import { writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { robotFaceSvg, SHELLS, ACCENTS } from '../src/party/look.js';
import { REACT_MOOD, REACT_MAX_ON_AIR } from '../src/party/react.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

/* A full table reacting at once — the worst case the strip has to survive. */
const CAST = [['MARY-KATE 3', 1, 1, 'CLAP'], ['JELLIE', 11, 11, 'SUS'], ['OZZARA', 3, 5, 'BOO'],
  ['SAM 2', 7, 2, 'SHOCK'], ['ELLOHN', 6, 6, 'SUS'], ['IVALEX', 9, 9, 'CLAP']];

const TMP = new URL('../_react_fit_tmp', import.meta.url).pathname.replace(/^\//, '');
execFileSync('npx', ['esbuild', 'src/party/night-skin.js', '--bundle', '--format=iife',
  '--global-name=SKIN', `--outfile=${TMP}/skin.js`, '--log-level=warning'], { shell: true, stdio: 'inherit' });

const strip = `<div class="react-strip">${CAST.map(([n, s, a, r]) =>
  `<div class="react-chip" data-rk="${n}">${robotFaceSvg(SHELLS[s], ACCENTS[a], { size: 56, mood: REACT_MOOD[r] })}<span class="react-who">${n}</span></div>`).join('')}</div>`;

writeFileSync(`${TMP}/page.html`, `<body><script src="skin.js"></script><script>SKIN.injectNightSkin()</script>
<div class="night on-run">
  <div class="night-top"><span class="night-brand">PRIME TIME</span><span class="night-phase">EXPEDITION</span></div>
  <div class="show-rail">rundown</div>
  <div class="night-main"><div class="run-stage">
    <div class="run-frame"><div class="run-slate"><div class="run-follow">
      <div class="run-face">${robotFaceSvg(SHELLS[1], ACCENTS[1], { size: 220 })}</div>
      <div class="run-tag">MARY-KATE 3 is running</div></div></div></div>
    <div class="pair-hero">MARY-KATE 3 walks. JELLIE talks.</div>
    <div class="run-facts">Cameras 2 / 4 · alarms 1</div>
    ${strip}
  </div></div>
</div></body>`);

const SETS = [[1920, 1080, '1080p — the most common television in the world'],
  [1280, 720, '720p'], [1366, 768, 'the commonest laptop panel'],
  [2560, 1440, '1440p'], [3840, 2160, '4K']];

const browser = await chromium.launch();

/*
 * ♿ The reduced-motion block is new, and it is the one part of the motion work whose failure is
 * invisible — a page that ignores the preference looks exactly like one that honours it unless
 * you are the person the preference is for. Checked in a real browser with the media feature on.
 */
{
  const p = await browser.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
  await p.goto(`file:///${TMP}/page.html`);
  await p.waitForTimeout(200);
  const still = await p.evaluate(() => [...document.querySelectorAll('.bot-badge, .react-chip, .run-face')]
    .map((e) => getComputedStyle(e).animationName));
  t('F0 · with reduced motion asked for, nothing on the run beat animates',
    still.length > 0 && still.every((n) => n === 'none'),
    `${still.length} elements · ${[...new Set(still)].join(', ')}`);
  await p.close();
}

const rows = [];
for (const [w, h, label] of SETS) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.goto(`file:///${TMP}/page.html`);
  /*
   * ⚠️ LONG ENOUGH FOR `night-rise` TO FINISH. At 250 ms the chips were still a few pixels into
   * their 220 ms entrance, and the measurement reported that as a clipped strip — but only at 4K,
   * because every smaller screen had slack from the shrinking frame that swallowed the offset.
   * A transient read as a layout defect at exactly one resolution is the most confusing possible
   * false positive, so this waits for rest rather than racing it.
   */
  await p.waitForTimeout(800);
  rows.push({ w, h, label, ...await p.evaluate(() => {
    const q = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
    const chips = [...document.querySelectorAll('.react-chip')].map((c) => c.getBoundingClientRect());
    const names = [...document.querySelectorAll('.react-who')].map((c) => c.getBoundingClientRect());
    return { frame: q('.run-frame'), chips, names, chipCount: chips.length };
  }) });
  await p.close();
}
await browser.close();
rmSync(TMP, { recursive: true, force: true });

for (const r of rows) {
  const cut = Math.max(0, ...r.chips.map((c) => c.bottom - r.h));
  const nameCut = Math.max(0, ...r.names.map((c) => c.bottom - r.h));
  const pct = (r.frame.height / r.h) * 100;
  t(`F1 · the whole reaction strip is on the screen at ${r.w}x${r.h} · ${r.label}`,
    cut === 0, `frame ${pct.toFixed(0)}vh · ${r.chipCount} chips · ${cut.toFixed(0)}px cut`);
  /*
   * The name is the feature, not a caption. This is the assertion that was failing before the
   * layout change, at four of these five resolutions.
   */
  t(`F2 · and every player's NAME is on the screen at ${r.w}x${r.h}`,
    nameCut === 0 && r.names.length === REACT_MAX_ON_AIR,
    `${r.names.length} names · ${nameCut.toFixed(0)}px cut`);
}

/*
 * The picture must still be as big as it can be. The frame gives up height only where it has to,
 * so a wide screen with room to spare keeps the full TV_FRAME_PCT — this is what separates
 * "let the picture take what is left" from "just make the picture smaller everywhere".
 */
const big = rows[rows.length - 1], small = rows[1];
t('F3 · the picture only gives up height where it must · full size at 4K, trimmed at 720p',
  (big.frame.height / big.h) > 0.88 && (small.frame.height / small.h) < 0.88,
  `4K ${((big.frame.height / big.h) * 100).toFixed(0)}vh · 720p ${((small.frame.height / small.h) * 100).toFixed(0)}vh`);
t('F4 · and it never shrinks past the point of being the main event',
  rows.every((r) => (r.frame.height / r.h) > 0.60),
  `smallest ${Math.min(...rows.map((r) => (r.frame.height / r.h) * 100)).toFixed(0)}vh`);

console.log(`\nreact-fit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
