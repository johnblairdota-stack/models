#!/usr/bin/env node
/**
 * ballroom-compare — the ASSET and the GAME, from the SAME camera, side by side.
 *
 *   node harness/ballroom-compare.mjs
 *   node harness/ballroom-compare.mjs --only arch,mirror
 *
 * John, after three sessions of the ballroom asset not arriving: *"Why are there so many things
 * that didn't get ported over from the asset and how can we verify that we actually have
 * everything? We need to compare the exact files visibly open and compare each until it is
 * perfect."*
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS DID NOT EXIST, AND WHAT ITS ABSENCE COST
 * ---------------------------------------------------------------------------------------------
 * `harness/shoot.mjs --cam` could already photograph the asset from any pose. The SHOW camera
 * could not be posed at all — the operator re-aims it every frame — so nobody could stand in the
 * same spot in both rooms. "Is it ported yet" was therefore answered from memory, and answered
 * wrongly at least three times, including once by me: I counted lights and object NAMES, said the
 * ballroom was done, and missed that the marble edging, the arch, the mirrors, the layered
 * curtains and the depth outside the windows were never in the shared builder at all.
 *
 * `?campose=` (see `cleanCampose`) is the missing half. This file is the other.
 *
 * ---------------------------------------------------------------------------------------------
 * THE ROOMS ARE NOT THE SAME SIZE, SO THE POSES ARE FRACTIONS
 * ---------------------------------------------------------------------------------------------
 * The asset is an authored 26 x 16 hall. The game's ballroom is generated per night and is a
 * different size every seed. A pose given in metres would therefore frame two different parts of
 * two different rooms and every pair would differ for a reason that is not a defect.
 *
 * So a station is `{u, v, y}` — a fraction across the room, a fraction along it, and a height in
 * metres — resolved against each room's own bounds. Same place in the room, whatever the room.
 *
 * A diagnostic, not a gate: it needs a browser, and it is meant to be read by eye.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ONLY = (arg('--only', '') || '').split(',').filter(Boolean);
const WEB = +arg('--port', 5192);
const SEED = arg('--seed', '1');
const OUT = path.join(ROOT, 'progress', 'compare');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (s) => console.log(s);

/* =============================================================================================
 * THE STATIONS. `u` is across the room (0 = window wall, 1 = mirror wall), `v` is along it
 * (0 = end wall with the arches, 1 = near wall), `y` is eye height in metres. `at` is the same
 * in fractions. Named for the thing each one is there to judge.
 * ============================================================================================= */
const STATIONS = [
  { id: 'win', why: 'the window wall — curtains, reveals, what is outside',
    eye: { u: 0.72, v: 0.50, y: 1.62 }, at: { u: 0.02, v: 0.50, y: 1.50 } },
  { id: 'arch', why: 'the end wall — the archway and the mirrors either side of it',
    eye: { u: 0.50, v: 0.78, y: 1.62 }, at: { u: 0.50, v: 0.02, y: 1.70 } },
  { id: 'mirror', why: 'the mirror wall and the musicians\' gallery over it',
    eye: { u: 0.22, v: 0.50, y: 1.62 }, at: { u: 0.98, v: 0.50, y: 2.40 } },
  { id: 'floor', why: 'the floor — parquet field, and whether the edges are marble',
    eye: { u: 0.50, v: 0.62, y: 1.35 }, at: { u: 0.34, v: 0.14, y: 0.02 } },
  { id: 'corner', why: 'a corner, for the pilasters, the dado and the skirting',
    eye: { u: 0.30, v: 0.30, y: 1.62 }, at: { u: 0.03, v: 0.03, y: 1.20 } },
  { id: 'up', why: 'the ceiling — coffers, roses, the chandeliers',
    eye: { u: 0.50, v: 0.50, y: 1.40 }, at: { u: 0.50, v: 0.50, y: 9.00 } },
  { id: 'wide', why: 'the whole room from one end, high',
    eye: { u: 0.50, v: 0.92, y: 4.60 }, at: { u: 0.50, v: 0.10, y: 1.20 } },
];

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

console.log('\nballroom-compare — the asset and the game, same camera\n');
if (!existsSync(path.join(ROOT, 'dist', 'index.html'))) {
  throw new Error('no dist/index.html — run `npm run build` first. This harness never uses vite.');
}
const kids = [];
if (await portOpen(WEB)) say(`  reusing a page server on :${WEB}`);
else {
  kids.push(spawn(process.execPath, [path.join(ROOT, 'harness/serve.mjs'), '--port', String(WEB), '--dir', 'dist'], { cwd: ROOT, stdio: 'ignore' }));
  await waitPort(WEB, 20000);
  say(`  serving dist on :${WEB}`);
}

const base = `http://127.0.0.1:${WEB}`;
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const W = 900, H = 600;
let exitCode = 1;

/** Resolve a fractional station against real room bounds. u = across x, v = along z. */
const resolve = (b, p) => [
  b.x0 + (b.x1 - b.x0) * p.u,
  p.y,
  b.z0 + (b.z1 - b.z0) * p.v,
];
const pose = (b, st) => [...resolve(b, st.eye), ...resolve(b, st.at), 55].map((n) => n.toFixed(3)).join(',');

try {
  await mkdir(OUT, { recursive: true });
  const stations = STATIONS.filter((s) => !ONLY.length || ONLY.includes(s.id));

  // ---- the GAME. One boot per station, because campose is read at build. ------------------
  const gameCtx = await browser.newContext({ viewport: { width: W, height: H } });
  let gameBounds = null;
  {
    const probe = await gameCtx.newPage();
    await probe.goto(`${base}/?view=party.follow&runner=p1&name=Hai&seed=${SEED}&still=1`, { waitUntil: 'domcontentloaded' });
    await probe.waitForFunction(() => document.body.dataset.rrrFollow === 'live', null, { timeout: 300000, polling: 1000 });
    gameBounds = await probe.evaluate(() => {
      const s = window.__rrrFollow.room.spaces.find((q) => q.order === 'ballroom')
        || window.__rrrFollow.room.spaces.find((q) => q.roomType === 'ballroom');
      return s ? { x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1, storey: s.storey } : null;
    });
    await probe.close();
  }
  if (!gameBounds) throw new Error('the game has no ballroom space to compare against');
  say(`  game ballroom  ${(gameBounds.x1 - gameBounds.x0).toFixed(1)} x ${(gameBounds.z1 - gameBounds.z0).toFixed(1)} m`);

  /*
   * ⚠️ The ASSET's room is a module constant in `views/room-ballroom.js` (`R`), not something the
   * page publishes. It is stated here rather than read, and it is the ONE number in this file
   * that can go stale — if that view is ever re-planned, this is what to update.
   */
  const assetBounds = { x0: -13, x1: 13, z0: -8, z1: 8, storey: 9.6 };
  say(`  asset ballroom ${(assetBounds.x1 - assetBounds.x0).toFixed(1)} x ${(assetBounds.z1 - assetBounds.z0).toFixed(1)} m`);
  say('');

  const rows = [];
  for (const st of stations) {
    const gp = pose(gameBounds, st);
    const ap = pose(assetBounds, st);

    const g = await gameCtx.newPage();
    await g.goto(`${base}/?view=party.follow&runner=p1&name=Hai&seed=${SEED}&still=1&campose=${encodeURIComponent(gp)}`, { waitUntil: 'domcontentloaded' });
    await g.waitForFunction(() => document.body.dataset.rrrFollow === 'live', null, { timeout: 300000, polling: 1000 });
    await sleep(2500);
    await g.screenshot({ path: path.join(OUT, `${st.id}.game.png`) });
    await g.close();

    const a = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
    await a.goto(`${base}/?view=room.ballroom&campose=${encodeURIComponent(ap)}`, { waitUntil: 'domcontentloaded' });
    await sleep(26000);
    await a.screenshot({ path: path.join(OUT, `${st.id}.asset.png`) });
    await a.close();

    rows.push(st);
    say(`  ${st.id.padEnd(8)} shot both · ${st.why}`);
  }

  /*
   * The sheet is HTML rather than a stitched PNG, deliberately: John reads these on a phone, and
   * a browser lets him pinch into one pair. Every pair is asset-left / game-right, same camera.
   */
  const html = `<!doctype html><meta charset="utf-8"><title>Ballroom — asset vs game</title>
<style>
 body{margin:0;background:#0c0a08;color:#f3ece3;font:14px/1.5 ui-sans-serif,system-ui,sans-serif;padding:24px}
 h1{font-size:26px;margin:0 0 6px} p.lede{color:#a89884;margin:0 0 24px;max-width:60rem}
 section{margin:0 0 30px} h2{font-size:18px;margin:0 0 2px}
 .why{color:#8a7d70;font-size:13px;margin:0 0 8px}
 .pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}
 figure{margin:0} img{width:100%;display:block;border-radius:6px;background:#000}
 figcaption{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#f5a14a;margin-top:6px}
 .game figcaption{color:#9ff2c8}
</style>
<h1>Ballroom — asset vs game</h1>
<p class="lede">Same camera in both rooms, resolved against each room's own bounds so a size
difference cannot fake a defect. Left is the asset (<code>?view=room.ballroom</code>), right is
Prime Time. Work down the list; a pair matches or it does not.</p>
${rows.map((st) => `<section>
  <h2>${st.id}</h2><p class="why">${st.why}</p>
  <div class="pair">
    <figure><img src="${st.id}.asset.png"><figcaption>asset</figcaption></figure>
    <figure class="game"><img src="${st.id}.game.png"><figcaption>prime time</figcaption></figure>
  </div>
</section>`).join('\n')}`;
  await writeFile(path.join(OUT, 'index.html'), html);
  say(`\n  ${rows.length} pairs · progress/compare/index.html`);
  exitCode = 0;
} catch (e) {
  console.error(`\n  ballroom-compare died: ${e?.stack || e}\n`);
} finally {
  await browser.close().catch(() => {});
  for (const k of kids) k.kill();
  process.exit(exitCode);
}
