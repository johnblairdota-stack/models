#!/usr/bin/env node
/**
 * THE CONTROLS FOR delit.mjs'S FOUR GUARDS.
 *
 *   node harness/evidence/_delit5_control.mjs
 *
 * A guard nobody has watched fail is not a guard, it is a bypass — five agents on this project
 * shipped one this week. Each case below breaks exactly one precondition and asserts the tool
 * EXITS NON-ZERO with the matching guard named in its output. A case that passes when it was
 * supposed to fail is reported as BYPASS and this script exits non-zero.
 *
 * G1 is controlled by corrupting the EXPECTED digest in memory (--controlBadMd5) rather than by
 * modifying a source file, because the four sources are the project's measurement reference and
 * the guard exists precisely to stop anything writing to them.
 *
 * G3's control needs an image whose matte is NOT hard. It is generated here: the same figure
 * geometry, but with a soft antialiased edge that populates luma 231..254. That is the one
 * property delit.mjs's exact segmentation depends on, so a soft-edged input must be refused
 * rather than silently mis-segmented.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { toDataURL, openCanvasPage, ROOT } from '../imglib.mjs';

const TMP = path.join(ROOT, 'harness', 'out', '_delit_control');
await mkdir(TMP, { recursive: true });

// ---- build the soft-edged image for the G3 control
const softPath = path.join(TMP, 'soft_edge.png');
{
  const { browser, page } = await openCanvasPage();
  const url = await toDataURL('assets/mv/player/baseline_front.png');
  const dataUrl = await page.evaluate(async ({ url }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const W = img.width, H = img.height;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const im = g.getImageData(0, 0, W, H), d = im.data;
    const N = W * H;
    const lum = new Float32Array(N);
    for (let p = 0; p < N; p++) {
      const i = p * 4;
      lum[p] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    }
    // Soften every white/non-white boundary by mixing a 1px ring halfway to white. That puts real
    // pixels into the 231..254 band the hard matte does not have.
    const out = new Uint8ClampedArray(d);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      if (lum[p] >= 254) continue;
      const nbWhite = lum[p - 1] >= 254 || lum[p + 1] >= 254 || lum[p - W] >= 254 || lum[p + W] >= 254;
      if (!nbWhite) continue;
      const i = p * 4;
      for (let k = 0; k < 3; k++) out[i + k] = Math.round(d[i + k] * 0.15 + 255 * 0.85);
    }
    im.data.set(out);
    g.putImageData(im, 0, 0);
    return c.toDataURL('image/png');
  }, { url });
  await writeFile(softPath, Buffer.from(dataUrl.split(',')[1], 'base64'));
  await browser.close();
}

const CASES = [
  {
    guard: 'G1', what: 'expected source md5 corrupted in memory',
    args: ['--view', 'front', '--controlBadMd5'],
    expect: 'G1 FAILED',
  },
  /*
   * ⚠️ THESE TWO NO LONGER TRIP G2 SPECIFICALLY, and that is a real change rather than a
   * regression. G2 detects a shadow flood that has climbed into the boots; the floor rule added
   * with G5 now PREVENTS that flood at labelling time, so at cut 120 the mask can no longer reach
   * the boot uppers and G2's ground-band figure median never collapses. The tool still refuses
   * both inputs — cut 120 eats the bottom row of the soles, where nothing is below to stop it, and
   * G4 and G5 catch that — so what is asserted here is REFUSAL, not which guard does it.
   * G2's own controls are therefore weaker than they were. It is kept because it is cheap and it
   * still covers shadow that spreads sideways rather than upward.
   */
  {
    guard: 'G2/4/5', what: 'shadow cut dropped to 120 — must still be REFUSED (G4/G5 now, not G2)',
    args: ['--view', 'front', '--shadowCut', '120'],
    expect: 'GUARD FAILURE',
  },
  {
    guard: 'G3', what: 'input with a SOFT antialiased matte, breaking the exact-segmentation premise',
    args: ['--view', 'front', '--controlSrc', path.relative(ROOT, softPath).split(path.sep).join('/')],
    expect: 'G3 page-plateau',
  },
  {
    guard: 'G4', what: 'figure deliberately eroded by one pixel after processing',
    args: ['--view', 'front', '--sabotage', 'erode'],
    expect: 'G4 silhouette',
  },
  /*
   * G5 — THE EROSION GUARD, and the reason it exists. John's first Meshy generation came back with
   * "a gap in the head and structure between the feet" because the shadow flood had eaten ~2000 px
   * out of the middle of each boot. EVERY GUARD ABOVE PASSED ON THAT OUTPUT: G4 only compares
   * bounding boxes and the bbox extremes were still held by surviving pixels.
   *
   * The first case below is not a hypothetical — it restores exactly the behaviour that shipped.
   * Each of G5's three sub-tests has its own case, because when they were first written
   * --pageClose 0 slipped past both of the others.
   */
  {
    guard: 'G5a', what: 'the floor rule disabled — restores the shadow flood that ATE THE BOOTS and shipped',
    args: ['--view', 'front', '--shadowFigBelowMax', '9999'],
    expect: 'G5 figure eroded',
  },
  {
    guard: 'G5a', what: 'same, side view, where the bite was worst (97.9% of the labelled shadow was boot)',
    args: ['--view', 'side-left', '--shadowFigBelowMax', '9999'],
    expect: 'G5 figure eroded',
  },
  {
    guard: 'G5b', what: '3 px shaved off the head outline, away from the bbox extremes so only G5b can see it',
    args: ['--view', 'side-left', '--sabotage', 'shave'],
    expect: 'G5 figure eroded',
  },
  {
    guard: 'G5c', what: 'page-notch repair disabled — the flood chews through blown speculars at the crown',
    args: ['--view', 'side-left', '--pageClose', '0'],
    expect: 'G5 figure eroded',
  },
  {
    guard: 'G5a', what: 'a hole bitten below the crown, leaving the bbox intact so G4 cannot see it',
    args: ['--view', 'side-left', '--sabotage', 'nibble'],
    expect: 'G5 figure eroded',
  },
];

// A POSITIVE case too: the shipped settings must still pass, or "everything fails" would look
// like "every guard works".
CASES.push({ guard: '--', what: 'the shipped settings, which must PASS', args: ['--view', 'front'], expectPass: true });
/*
 * And one positive case that used to be a NEGATIVE one. --shadowCut 150 is only 35 below the
 * shipped cut and it used to flood the boots, so it was a G2 control. The floor rule makes that
 * flood impossible, so this input is now simply correct — and asserting it PASSES with G5 clean is
 * a far stronger statement than asserting it fails: it says the tool tolerates a materially more
 * aggressive shadow cut without eroding the figure. If a future change reintroduces the climb,
 * this case goes red.
 */
CASES.push({ guard: 'G5', what: 'shadow cut 150 — used to flood the boots; must now PASS with the figure intact', args: ['--view', 'front', '--shadowCut', '150'], expectPass: true });

let bad = 0;
console.log('\n  guard  outcome   case');
for (const c of CASES) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'harness', 'delit.mjs'), ...c.args], {
    cwd: ROOT, encoding: 'utf8', timeout: 300000,
  });
  const all = `${r.stdout || ''}${r.stderr || ''}`;
  if (c.expectPass) {
    const ok = r.status === 0;
    if (!ok) bad++;
    console.log(`  ${c.guard.padEnd(6)} ${(ok ? 'PASS' : 'BROKEN').padEnd(9)} ${c.what}`);
    continue;
  }
  const threw = r.status !== 0;
  const named = all.includes(c.expect);
  const ok = threw && named;
  if (!ok) bad++;
  console.log(`  ${c.guard.padEnd(6)} ${(ok ? 'FAILED AS REQUIRED' : 'BYPASS').padEnd(9)} ${c.what}`);
  if (!ok) {
    console.log(`         exit=${r.status}  expected text ${JSON.stringify(c.expect)} present=${named}`);
    console.log(`         ---- output ----\n${all.split('\n').slice(-14).join('\n')}`);
  } else {
    const line = all.split('\n').find((l) => l.includes(c.expect));
    console.log(`         -> ${line.trim().slice(0, 150)}`);
  }
}

await rm(TMP, { recursive: true, force: true });
console.log(bad === 0
  ? '\n  ALL FOUR GUARDS WATCHED FAILING, and the shipped settings still pass.\n'
  : `\n  ${bad} case(s) did not behave as required — a guard that cannot fail is a bypass.\n`);
process.exit(bad === 0 ? 0 : 1);
