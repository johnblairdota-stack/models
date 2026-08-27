/**
 * nametag-legibility — is a seated robot's name tag READABLE, wherever it is standing?
 *
 *   node harness/nametag-legibility.mjs            # writes progress/nametag/
 *   node harness/nametag-legibility.mjs --keep     # leave vite up
 *
 * WHY THIS FILE EXISTS. John, playing a live VOTE: *"the lack of lighting in the other room is
 * occluding the name tag."* One tag on the near side of the circle was crisp; the one sitting in
 * front of the open dark archway was not.
 *
 * The locked rule is that tags *"must stay legible at low quality and distance"*, and NOTHING
 * asserted it. `party-warm` W33b checks how the tag ATLAS is built — no mips, nearest filter,
 * black glyph outline, the STYLE_CONTRACT colours. Every one of those can be right in a frame
 * where the tag is unreadable, because they all describe the TEXTURE and none of them describe
 * the pixels that reach the television.
 *
 * WHAT IT FOUND, 2026-08-25, six seated robots in one frame: the distance haze ate 20-23% of
 * every tag's white glyphs and 38% of the one in front of the archway — while its neighbour at
 * the SAME distance lost 23%. Distance never explained it. The tag is a `depthWrite:false`
 * sprite, so the composite's haze block sampled `tDepth` and faded each tag by the depth of
 * whatever stood BEHIND it. Fix: captions moved to `CAPTION_LAYER` and drawn after the grade.
 *
 * ---------------------------------------------------------------------------------------
 * ⚠️ IT DRIVES THE FOLLOW VIEW DIRECTLY, AND THAT IS THE WHOLE DESIGN OF THIS FILE.
 * ---------------------------------------------------------------------------------------
 * The first four attempts booted a real room server, five phones and a whole night, then cued a
 * talk beat — the way `talk-frames.mjs` does. It worked twice and then reported "0 tags" four
 * runs in a row, with no error thrown anywhere. Everything in that stack is a race against a
 * mansion bake whose time swings by minutes under swiftshader: `#go` is disabled while it bakes
 * and `.click()` on a disabled button is a silent no-op; a cue that lands early is dropped and
 * never retried. None of that is what is being measured, and all of it can fake the result.
 *
 * `party-follow` takes its cast on the cue channel — `postMessage({t:'cue', cue})`, validated by
 * `cueViolations` at both ends. So this file loads that view alone and posts one `intros` cue.
 * No server, no phones, no beats, no night. The circle is built by the same code path the TV
 * uses, and the only thing that can make it absent is the thing under test.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const KEEP = argv.includes('--keep');
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };

const WEB = +arg('--port', 5197);
const SEED = +arg('--seed', 3);
const WAIT = +arg('--wait', 240000);
const SHOTDIR = path.join(ROOT, 'progress', 'nametag');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0; let fail = 0;
const t = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}${d ? ` · ${d}` : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? ` · ${d}` : ''}`); }
};

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
});
async function waitPort(p, ms, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await portOpen(p)) return; await sleep(250); }
  throw new Error(`${label} never opened :${p}`);
}

const kids = [];
console.log('\nnametag-legibility — can you read the tag when the room behind it is dark?\n');

if (await portOpen(WEB)) console.log(`  reusing vite on :${WEB}`);
else {
  console.log(`  starting vite on :${WEB} …`);
  const p = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'),
    '--port', String(WEB), '--strictPort', '--host', '127.0.0.1'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => { err += d.toString(); });
  kids.push(p);
  try { await waitPort(WEB, 30000, 'vite'); } catch (e) { throw new Error(`${e.message}\n${err}`); }
}

const base = `http://127.0.0.1:${WEB}`;
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

/** Six seats. `CUE_CAST_KEYS` is a closed allow-list — id/seat/name/shell/accent, nothing else. */
const CAST = [
  { id: 'p1', seat: 0, name: 'ROBOT 6', shell: '#d8dade', accent: '#5ec6c0' },
  { id: 'p2', seat: 1, name: 'BEX', shell: '#d8dade', accent: '#f5a14a' },
  { id: 'p3', seat: 2, name: 'JOHN', shell: '#d8dade', accent: '#7fb3e8' },
  { id: 'p4', seat: 3, name: 'MARA', shell: '#d8dade', accent: '#d95a8a' },
  { id: 'p5', seat: 4, name: 'OZZ', shell: '#d8dade', accent: '#e5c04a' },
  { id: 'p6', seat: 5, name: 'ELLIE', shell: '#d8dade', accent: '#a8c66c' },
];

/*
 * ================================ WHAT IS MEASURED =========================================
 * For every sprite named `headName`: where it is, how far, whether it is on screen, and the
 * luminance of its pixels read straight out of the GL drawing buffer.
 *
 *   glyph  p95 of the tag's pixels  ≈ the white lettering
 *   plate  p05                      ≈ the black glyph outline
 *   contrast = glyph - plate        ≈ how readable it is
 *
 * `redraw()` and `readPixels()` happen in ONE evaluate with no await between them: the drawing
 * buffer is only guaranteed intact inside the same task as the render.
 *
 * The whole frame is sampled too (`room`). Drawing captions over the graded picture means a
 * second pass on the same canvas, and the first attempt at that WIPED the colour buffer —
 * `scene.background` forces a clear that `autoClear = false` does not stop. Every tag measured
 * perfectly on a completely black screen. Perfect captions on a dead frame is a passing gate
 * and a broken product, so N5 asserts the room is still there.
 * ===========================================================================================
 */
const MEASURE = (haze) => {
  const eng = window.__rrr?.engine;
  if (!eng) return { error: 'no engine', hasRrr: !!window.__rrr };

  const scene = eng.scene; const cam = eng.camera;
  const tags = [];
  scene.traverse((o) => { if (o.name === 'headName') tags.push(o); });

  if (haze != null) eng.pipeline.setGrade({ haze });
  window.__rrr.redraw?.();

  const canvas = eng.renderer.domElement;
  const gl = eng.renderer.getContext();
  const CW = canvas.width; const CH = canvas.height;
  const buf = new Uint8Array(CW * CH * 4);
  gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  const luma = (i) => 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];

  function sampleRect(x0, y0, x1, y1) {
    const ax = Math.max(0, Math.floor(Math.min(x0, x1)));
    const bx = Math.min(CW - 1, Math.ceil(Math.max(x0, x1)));
    const ay = Math.max(0, Math.floor(Math.min(y0, y1)));
    const by = Math.min(CH - 1, Math.ceil(Math.max(y0, y1)));
    const vals = [];
    let rs = 0, gs = 0, bs = 0;
    for (let y = ay; y <= by; y++) {
      const gy = CH - 1 - y;                       // readPixels is bottom-left, screen is top-left
      for (let x = ax; x <= bx; x++) {
        const i = (gy * CW + x) * 4;
        vals.push(luma(i));
        rs += buf[i]; gs += buf[i + 1]; bs += buf[i + 2];
      }
    }
    if (!vals.length) return null;
    vals.sort((a, b) => a - b);
    const at = (p) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
    return { n: vals.length, p05: at(0.05), p50: at(0.50), p95: at(0.95), rgb: [rs / vals.length, gs / vals.length, bs / vals.length] };
  }

  const room = (() => {
    const vals = [];
    for (let y = 0; y < CH; y += 7) for (let x = 0; x < CW; x += 7) vals.push(luma((y * CW + x) * 4));
    vals.sort((a, b) => a - b);
    const at = (p) => vals[Math.floor(p * (vals.length - 1))];
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { mean: +mean.toFixed(2), p50: at(0.5), p95: +at(0.95).toFixed(1), lit: +(vals.filter((v) => v > 12).length / vals.length).toFixed(3) };
  })();

  const out = tags.map((s) => {
    const p = s.position.clone(); s.getWorldPosition(p);
    const dist = cam.position.distanceTo(p);
    const top = p.clone(); top.y += s.scale.y;      // sprite anchor is bottom-centre
    const a = p.clone().project(cam);
    const b = top.clone().project(cam);
    const toPx = (v) => [(v.x * 0.5 + 0.5) * CW, (-v.y * 0.5 + 0.5) * CH];
    const [ax, ay] = toPx(a);
    const [, by] = toPx(b);
    const hPx = Math.abs(ay - by);
    const wPx = hPx * (s.scale.x / Math.max(1e-6, s.scale.y));
    const onScreen = a.z > -1 && a.z < 1 && ax >= 0 && ax <= CW && ay >= 0 && ay <= CH && hPx >= 3;
    const ins = 0.15;
    const stat = onScreen
      ? sampleRect(ax - wPx * (0.5 - ins), by + hPx * ins, ax + wPx * (0.5 - ins), ay - hPx * ins)
      : null;
    return {
      name: s.parent?.name || s.uuid.slice(0, 6),
      dist: +dist.toFixed(2),
      screen: [Math.round(ax), Math.round(ay)],
      tagPx: [Math.round(wPx), Math.round(hPx)],
      onScreen,
      visible: s.visible,
      /** What the plate actually says right now — set by setNameTagLabel. */
      label: s.userData?.tagLabel ?? null,
      skin: s.userData?.tagSkin ?? null,
      layerMask: s.layers.mask,
      depthWrite: s.material?.depthWrite,
      glyph: stat ? +stat.p95.toFixed(1) : null,
      plate: stat ? +stat.p05.toFixed(1) : null,
      contrast: stat ? +(stat.p95 - stat.p05).toFixed(1) : null,
      /** Mean plate colour. The PAIR plate is green (#1F7A3D) where the show plate is blue
       *  (#054E84), so green-minus-blue is the number that moves when a pair forms. */
      greenness: stat ? +(stat.rgb[1] - stat.rgb[2]).toFixed(1) : null,
    };
  });

  const grade = eng.pipeline?.grade || {};
  return {
    haze: grade.haze,
    exposure: grade.exposure,
    camPos: [+cam.position.x.toFixed(2), +cam.position.y.toFixed(2), +cam.position.z.toFixed(2)],
    canvas: [CW, CH],
    tagCount: tags.length,
    tags: out,
    room,
  };
};

let exitCode = 1;
try {
  await mkdir(SHOTDIR, { recursive: true });

  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`console: ${m.text()}`); });

  // `warm=1` bakes the mansion and parks the camera in the ballroom. No runner, no name — a
  // warm slot carrying either is a `warmViolations` failure, and the cast arrives by cue.
  const url = `${base}/?view=party.follow&warm=1&seed=${SEED}`;
  console.log(`  loading ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // The bake is the slow part and its time swings under swiftshader. Wait on the engine's own
  // ready flag rather than a stopwatch.
  const t0 = Date.now();
  let ready = false;
  while (Date.now() - t0 < WAIT) {
    ready = await page.evaluate(() => !!window.__rrr?.ready).catch(() => false);
    if (ready) break;
    await sleep(2000);
  }
  console.log(`  mansion ${ready ? 'warm' : 'NOT warm'} after ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  t('N0 · the ballroom warmed', ready);

  // One cue. This is the same message the TV posts, and `cueViolations` guards both ends.
  const posted = await page.evaluate((cast) => {
    window.postMessage({ t: 'cue', cue: { kind: 'intros', cast, talk: true } }, '*');
    return true;
  }, CAST);
  t('N0b · the intros cue was accepted', posted === true);

  // The cast walks in and sits. Poll for the tags rather than guessing how long that takes.
  const t1 = Date.now();
  let on = null;
  while (Date.now() - t1 < 90000) {
    on = await page.evaluate(MEASURE, null);
    if (on.tagCount > 0 && on.tags.some((g) => g.onScreen)) break;
    await sleep(2000);
  }
  console.log(`  circle: ${on?.tagCount ?? 0} tags after ${((Date.now() - t1) / 1000).toFixed(0)}s\n`);

  if (errs.length) {
    console.log('  ⚠️ errors thrown:');
    for (const e of [...new Set(errs)].slice(0, 10)) console.log(`     ${e}`);
    console.log('');
  }

  if (on?.error) {
    t('N1 · the seated circle actually built name tags', false, on.error);
  } else {
    console.log(`  haze=${on.haze}  exposure=${on.exposure}  canvas=${on.canvas.join('x')}  camera ${on.camPos.join(', ')}\n`);
    t('N1 · the seated circle actually built name tags', on.tagCount > 0, `${on.tagCount} tags`);
    const shown = on.tags.filter((g) => g.onScreen && g.visible);
    t('N2 · at least one tag is on screen — otherwise the pixels prove nothing',
      shown.length > 0, `${shown.length}/${on.tagCount} on screen`);

    await page.screenshot({ path: path.join(SHOTDIR, 'tags-haze-on.png') });
    const off = await page.evaluate(MEASURE, 0);
    await page.screenshot({ path: path.join(SHOTDIR, 'tags-haze-off.png') });
    await page.evaluate(MEASURE, on.haze ?? 0.042);
    await writeFile(path.join(SHOTDIR, 'measured.json'), JSON.stringify({ on, off }, null, 2));

    const byName = new Map(off.tags.map((g) => [g.name, g]));
    console.log('   tag             dist    size    glyph(fog on)  glyph(fog off)   lost');
    for (const g of on.tags) {
      if (!g.onScreen) { console.log(`   ${String(g.name).padEnd(16)} OFF SCREEN`); continue; }
      const o = byName.get(g.name);
      const lost = (o?.glyph ?? 0) - (g.glyph ?? 0);
      console.log(`   ${String(g.name).padEnd(16)}${String(g.dist).padStart(6)}m${String(g.tagPx.join('x')).padStart(9)}`
        + `${String(g.glyph).padStart(14)}${String(o?.glyph).padStart(16)}${(lost > 0.5 ? `   -${lost.toFixed(1)}` : '      0')}`);
    }
    console.log('');

    /*
     * N3 IS THE BUG JOHN FOUND. A caption must not change because of what is standing behind
     * it. With the fix the fog cannot reach the tag at all, so turning it off must change
     * nothing. Before the fix the worst tag gained 76.6 and the best still gained 37.8 — this
     * assertion was verified to fail at every one of those six values.
     */
    const worst = shown
      .map((g) => ({ g, gained: (byName.get(g.name)?.glyph ?? 0) - (g.glyph ?? 0) }))
      .sort((a, b) => b.gained - a.gained)[0];
    t('N3 · a tag\'s legibility does not depend on the fog', !worst || worst.gained < 8,
      worst ? `worst: ${worst.g.name} gains ${worst.gained.toFixed(1)} with the fog off` : 'no tags shown');

    /*
     * N4 IS THE EVENNESS RULE, and it is the one that matches what John actually saw: not
     * "this tag is dim" in the abstract, but "that one is dimmer than the others in the same
     * picture." Six robots in one frame at 3.5-10.2 m must read the same.
     */
    const gl2 = shown.map((g) => g.glyph ?? 0);
    const spread = Math.max(...gl2) - Math.min(...gl2);
    t('N4 · every tag in one frame reads the same brightness (spread <= 8)',
      spread <= 8, `spread ${spread.toFixed(1)} over ${shown.length} tags, ${Math.min(...shown.map((g) => g.dist))}-${Math.max(...shown.map((g) => g.dist))}m`);

    const dim = shown.filter((g) => (g.contrast ?? 0) < 40);
    t('N4b · every visible tag clears the legibility floor (contrast >= 40)',
      dim.length === 0,
      dim.length ? dim.map((g) => `${g.name} c=${g.contrast}`).join(' · ') : `min c=${Math.min(...shown.map((g) => g.contrast ?? 0)).toFixed(1)}`);

    const r5 = on.room;
    t('N5 control · the ballroom is still on screen behind the tags',
      !!r5 && r5.lit > 0.25 && r5.p95 > 40,
      r5 ? `${(r5.lit * 100).toFixed(0)}% of the frame is lit · mean ${r5.mean} · p95 ${r5.p95}` : 'no room sample');

    /* ======================================================================================
     * 🍮 N6 · JELLIE ON THE PLATE.
     *
     * The pairing is proved on real sockets by `link-merge` and by the end-to-end run; what
     * NEITHER of those can see is whether the plate over the robot's head actually changed. The
     * merged name crosses the cue channel into the mansion and gets painted onto a canvas
     * texture, and every step of that is invisible to a socket test.
     *
     * The check is pixels, not state: N6 measures the two paired tags' PLATE colour and requires
     * it to have moved toward the pair green, while the four uninvolved tags must not move at
     * all. That second half is the control — a bug that repainted every tag would otherwise look
     * exactly like a bug that repainted none.
     * ====================================================================================== */
    const shownIds = shown.map((g) => g.name);
    const pairCue = await page.evaluate((cast) => {
      window.postMessage({ t: 'cue', cue: { kind: 'pair', pairs: [{ a: cast[0].id, b: cast[1].id, name: 'JELLIE' }] } }, '*');
      return true;
    }, CAST);
    await sleep(2500);
    const paired = await page.evaluate(MEASURE, null);
    await page.screenshot({ path: path.join(SHOTDIR, 'tags-jellie.png') });

    /*
     * ⚠️ COMPARE PAIRED AGAINST UNPAIRED **INSIDE ONE FRAME**, never against an earlier frame.
     *
     * Two false failures came from getting this wrong. The first compared the tag's p05, which is
     * the BLACK GLYPH OUTLINE — black on the show plate and black on the pair plate, so it never
     * moved while the mechanic worked perfectly. The second compared greenness against a baseline
     * captured seconds earlier, but the talk camera walks the ring continuously, so every tag's
     * measured colour drifts with angle and distance and FOUR tags "changed" when two had.
     *
     * Within a single frame the camera is one camera, so the only thing separating the two groups
     * is the paint. That is also the assertion John's design actually makes: the pair reads
     * differently *from the others on screen right now*.
     */
    const jellie = paired.tags.filter((g) => g.label === 'JELLIE');
    const plain = paired.tags.filter((g) => g.label !== 'JELLIE');
    const avg = (xs) => (xs.length ? xs.reduce((a, g) => a + (g.greenness ?? 0), 0) / xs.length : 0);
    const gJ = avg(jellie); const gP = avg(plain);
    t('N6 · a pair cue puts JELLIE on exactly the two robots in it',
      pairCue === true && jellie.length === 2,
      `${jellie.length} merged: ${jellie.map((g) => g.name).join(', ') || 'none'}`);
    t('N6b · and their plate is visibly the PAIR colour, next to four that are not',
      jellie.length === 2 && plain.length >= 2 && (gJ - gP) > 12,
      `green-minus-blue: pair ${gJ.toFixed(1)} vs room ${gP.toFixed(1)} (gap ${(gJ - gP).toFixed(1)})`);

    // Back to unpaired, so the probe leaves the bed as it found it and a rerun is comparable.
    await page.evaluate(() => window.postMessage({ t: 'cue', cue: { kind: 'pair', pairs: [] } }, '*'));
    await sleep(1500);
    const restored = await page.evaluate(MEASURE, null);
    const stuck = restored.tags.filter((g) => g.label === 'JELLIE');
    const ownNames = restored.tags.filter((g) => CAST.some((c) => c.name === g.label));
    t('N6c · an empty pair cue puts every robot back into its own name',
      stuck.length === 0 && ownNames.length === restored.tags.length,
      `${stuck.length} still merged · ${ownNames.length}/${restored.tags.length} wearing their own name`);
  }

  console.log('\n  shots + measured.json in progress/nametag/');
  console.log(`\n  ${pass} ok · ${fail} fail\n`);
  exitCode = fail ? 1 : 0;
} catch (e) {
  console.error(`\n  nametag-legibility died: ${e?.stack || e}\n`);
} finally {
  if (!KEEP) {
    await browser.close().catch(() => {});
    for (const k of kids) k.kill();
  }
  process.exit(exitCode);
}
