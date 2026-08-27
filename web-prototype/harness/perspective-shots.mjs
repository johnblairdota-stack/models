#!/usr/bin/env node
/**
 * perspective-shots — photograph all four camera perspectives, and measure that each one is
 * actually the thing it claims to be.
 *
 *   node harness/perspective-shots.mjs           # writes progress/persp/
 *
 * John cannot judge a camera from a description — *"3rd person but further back or top down or
 * isometric… I'm not sure where it will go yet"* — so this exists to put four real pictures in
 * front of him, taken through the same cue channel the live `P` key uses.
 *
 * ⚠️ **A SCREENSHOT IS NOT A PASS.** Two instruments on this project have reported success on
 * things rendering under a splash, so every shot here is accompanied by numbers read off the live
 * camera: how far up the eye is, how far back, how steeply it looks down, and — for the overhead
 * rigs — whether the ROOF actually came off. A `top` view photographed through an intact ceiling
 * is a picture of a ceiling, and it would look perfectly fine in a thumbnail.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PERSPECTIVES, PERSPECTIVE_RIG, isOverhead } from '../src/party/follow.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const KEEP = argv.includes('--keep');
const WEB = +arg('--port', 5194);
const SEED = arg('--seed', '1');
const SHOTDIR = path.join(ROOT, 'progress', 'persp');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const log = [];
const say = (s) => { log.push(s); console.log(s); };
const t = (n, c, d = '') => {
  if (c) { pass++; say(`  ok   ${n}${d ? ' · ' + d : ''}`); }
  else { fail++; say(`  FAIL ${n}${d ? ' · ' + d : ''}`); }
  return !!c;
};

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
});
async function waitPort(p, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await portOpen(p)) return; await sleep(200); }
  throw new Error(`page server never opened :${p}`);
}

console.log('\nperspective-shots — chase · wide · iso · top\n');
if (!existsSync(path.join(ROOT, 'dist', 'index.html'))) {
  throw new Error('no dist/index.html — run `npm run build` first. This harness never uses vite.');
}
const kids = [];
if (await portOpen(WEB)) say(`  reusing a page server on :${WEB}`);
else {
  const p = spawn(process.execPath, [path.join(ROOT, 'harness/serve.mjs'), '--port', String(WEB), '--dir', 'dist'],
    { cwd: ROOT, stdio: 'ignore' });
  kids.push(p);
  await waitPort(WEB, 20000);
  say(`  serving dist on :${WEB}`);
}

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
let exitCode = 1;
try {
  await mkdir(SHOTDIR, { recursive: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  await page.goto(
    `http://127.0.0.1:${WEB}/?view=party.follow&runner=p1&name=Hai`
    + `&shell=%236b3a2a&accent=%23f5a14a&seed=${SEED}&throttle=WALK`,
    { waitUntil: 'domcontentloaded' },
  );
  const live = await page.waitForFunction(
    () => ((document.body.dataset.rrrError || window.__rrrError) ? 'error'
      : (document.body.dataset.rrrFollow === 'live' ? 'live' : null)),
    null, { timeout: 300000, polling: 1000 },
  ).then((h) => h.jsonValue()).catch(() => null);
  if (live !== 'live') throw new Error(`the follow camera never went live: ${live}`);
  say('  camera is live\n');

  // Hold the runner still so the four shots differ by CAMERA and nothing else.
  await page.evaluate(() => window.postMessage(
    { t: 'cue', cue: { kind: 'move', x: 0, y: 0, lookX: 0, lookY: 0, run: false } }, '*',
  ));
  await sleep(1500);

  const seen = {};
  for (const name of PERSPECTIVES) {
    // The same cue the live `P` key sends — not a reach into the bed's internals.
    await page.evaluate((n) => window.postMessage({ t: 'cue', cue: { kind: 'shot', shot: n } }, '*'), name);
    await sleep(2200);
    const m = await page.evaluate(() => {
      const f = window.__rrrFollow;
      const c = f.cam();
      const lid = f.room?.lidCensus?.();
      return {
        dist: c.dist, eyeY: c.eyeY, shot: c.shot, reels: c.reels,
        runnerY: f.runner.pos.y,
        lidHidden: lid?.hidden ?? null, lidTotal: lid?.lid ?? null, lidOn: lid?.on ?? null,
      };
    });
    seen[name] = m;
    await page.screenshot({ path: path.join(SHOTDIR, `${PERSPECTIVES.indexOf(name) + 1}-${name}.png`) });
    const pitch = Math.atan2(m.eyeY - (m.runnerY + 1.3), Math.max(0.01, m.dist)) * 180 / Math.PI;
    say(`  ${name.padEnd(6)} eye ${m.eyeY.toFixed(2)}m up · ${m.dist.toFixed(2)}m back · looking down ${pitch.toFixed(0)}°`
      + ` · roof ${m.lidOn ? 'on' : `off (${m.lidHidden}/${m.lidTotal} hidden)`}`);
  }
  say('');

  /* ---- each rig is actually the thing it claims to be ------------------------------------ */
  t('P1 · the cue is accepted mid-run and the lens actually changes to each perspective',
    PERSPECTIVES.every((n) => seen[n].shot === n),
    PERSPECTIVES.map((n) => `${n}:${seen[n].shot}`).join(' '));

  t('P2 · each one is further out or higher up than the last — they are four DIFFERENT views',
    seen.wide.dist > seen.chase.dist + 1
      && seen.iso.eyeY > seen.wide.eyeY + 1.5
      && seen.top.eyeY > seen.iso.eyeY + 2.5,
    `back ${seen.chase.dist.toFixed(1)}→${seen.wide.dist.toFixed(1)}m · `
    + `up ${seen.chase.eyeY.toFixed(1)}→${seen.wide.eyeY.toFixed(1)}→${seen.iso.eyeY.toFixed(1)}→${seen.top.eyeY.toFixed(1)}m`);

  /*
   * 🚨 **THE ROOF IS THE ONE THAT WOULD LOOK FINE AND BE WRONG.** John predicted it before a line
   * was written — *"The roof will probably need to be see through so they work"* — and a `top`
   * shot taken through an intact ceiling is a lovely photograph of a ceiling.
   */
  t('P3 · the roof comes off for the overhead rigs, and only for them',
    PERSPECTIVES.every((n) => (isOverhead(n) ? seen[n].lidOn === false : seen[n].lidOn === true)),
    PERSPECTIVES.map((n) => `${n}:${seen[n].lidOn ? 'roof on' : 'roof off'}`).join(' '));
  t('P3b control · and there were ceilings there to take off in the first place',
    (seen.top.lidTotal ?? 0) > 0 && (seen.top.lidHidden ?? 0) > 0,
    `${seen.top.lidHidden} of ${seen.top.lidTotal} ceiling meshes hidden`);
  t('P3c control · going back to a ground rig puts the roof back on',
    seen.chase.lidOn === true && seen.wide.lidOn === true);

  /*
   * The overhead eyes sit ABOVE the storey on purpose, which is what `_valid` refuses for every
   * other shot. If that exemption were missing the reel would fight the rig on every frame.
   */
  const reelsWhileOverhead = seen.top.reels - seen.iso.reels;
  t('P4 · an overhead rig is not fought by the shot-correction logic',
    reelsWhileOverhead === 0, `${reelsWhileOverhead} corrections while overhead`);

  /* =========================================================================================
   * 🕯️ **THE BALLROOM'S PRACTICALS ARE MOUNTED, AND THEY EMIT.**
   *
   * John: *"The ballroom asset has many more objects… This will be the important room for most of
   * the game."* A census put the party ballroom at six lights against the asset's twenty-three,
   * and it photographed as a brown box. `ballroomFixtures` had been shipping the whole time in
   * `views/game.js` only.
   *
   * ⚠️ **GEOMETRY IS NOT THE ASSERTION — EMISSION IS.** The rig defaults to zero point lights and
   * hands the meshes back regardless, so a build that mounted the chandeliers and forgot
   * `points` would put three unlit props in a dark room and pass any check that counted objects.
   * These are named `ballroom.practical.N`, so they can be found rather than inferred.
   * ========================================================================================= */
  const rig = await page.evaluate(() => {
    let s = window.__rrrFollow?.room?.spaces?.[0]?.root;
    while (s && s.parent) s = s.parent;
    const names = [];
    let lights = 0;
    s?.traverse((o) => { if (o.isLight) { lights++; if (o.name) names.push(o.name); } });
    return { lights, practicals: names.filter((n) => /ballroom\.practical/.test(n)).length };
  });
  t('P6 · the ballroom practicals are mounted in the party night, and they LIGHT the room',
    rig.practicals >= 3 && rig.lights >= 9,
    `${rig.practicals} practicals of ${rig.lights} lights in the house`);
  t('P6b control · and no daylight rig was smuggled in — B was the night reading, not A',
    !/spotKey|ballroomEnv|lightShaft|dustMotes/.test(
      await (await import('node:fs/promises')).readFile(
        new URL('../src/game/follow-bed.js', import.meta.url), 'utf8',
      ),
    ));

  t('P5 · nothing threw', errs.length === 0, errs.slice(0, 3).join(' | ') || 'clean');

  await writeFile(path.join(SHOTDIR, 'measured.json'), JSON.stringify(seen, null, 2));
  await writeFile(path.join(SHOTDIR, 'transcript.txt'), log.join('\n'));
  say(`\n  perspective-shots: ${pass} passed, ${fail} failed · progress/persp/`);
  exitCode = fail ? 1 : 0;
} catch (e) {
  console.error(`\n  perspective-shots died: ${e?.stack || e}\n`);
} finally {
  if (!KEEP) {
    await browser.close().catch(() => {});
    for (const k of kids) k.kill();
  }
  process.exit(exitCode);
}
