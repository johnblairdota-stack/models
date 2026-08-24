#!/usr/bin/env node
/**
 * CAPTURE char.grip — five rolls of the sledgehammer, shipped centre locked to product SWINGS.
 *
 *   node harness/_grip_shot.mjs --anim Heavy_Hammer_Swing
 *
 * WHY IT BUILDS RATHER THAN USING `npm run dev`: same reason as `_lineup_shot.mjs` — a production
 * build served statically is what the .bat files open, so it is the one worth proving.
 *
 * WHAT IT ASSERTS, from the SCENE (`window.__grip`), not from pixels:
 *   1. the view booted (ready + no page error)
 *   2. five stations, centre roll === GRIP_SHIPPED === product Heavy_Hammer_Swing.grip
 *   3. Attack shares that same lock (they share SWINGS / mountInHand)
 *   4. every prop is parented to RightHand
 *   5. the frame is not blank
 *
 * Writes harness/out/grip/ (gitignored): the PNG, plus readout.json ready to paste into SWINGS.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5189;
const OUT = path.join(ROOT, 'harness', 'out', 'grip');
const argv = process.argv.slice(2);
const opt = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const has = (f) => argv.includes(f);
const log = (...a) => console.log(' ', ...a);

fs.mkdirSync(OUT, { recursive: true });

if (!has('--skip-build')) {
  log('building…');
  await new Promise((res, rej) => {
    const p = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'],
      { cwd: ROOT, stdio: 'inherit', shell: true });
    p.on('exit', (c) => (c === 0 ? res() : rej(new Error(`build failed (${c})`))));
  });
}

const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
  { cwd: ROOT, stdio: 'ignore', shell: true });
const alive = async () => {
  try { const r = await fetch(`http://127.0.0.1:${PORT}/`); return r.ok; } catch { return false; }
};
{
  const t0 = Date.now();
  while (!(await alive())) {
    if (Date.now() - t0 > 60000) { console.error('preview failed to start'); process.exit(3); }
    await new Promise((r) => setTimeout(r, 400));
  }
}
log(`preview up on ${PORT}`);

/*
 * Linux cloud boxes have no D3D11. `--use-gl=angle` + swiftshader is what playtest.mjs uses
 * here; the Windows house probes pass `--use-angle=d3d11` instead. Either way the NUMBERS
 * come from window.__grip, not from GPU-shaded pixels, so a software path still proves the lock.
 */
const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--force-device-scale-factor=1',
  ],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

const errors = [];
const failed = [];
let gripLine = null;
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
  const t = m.text();
  if (t.startsWith('[char.grip]')) { gripLine = t; log(t); }
});
page.on('requestfailed', (r) => failed.push(`${r.url()} — ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.url()} — HTTP ${r.status()}`); });

const q = new URLSearchParams({ view: 'char.grip', quality: 'high', capture: '1' });
const animArg = opt('anim', 'Heavy_Hammer_Swing');
q.set('anim', animArg);
const phaseArg = opt('phase');
if (phaseArg != null) q.set('phase', phaseArg);
if (has('--nonames')) q.set('names', '0');
const url = `http://127.0.0.1:${PORT}/?${q}`;
log(`opening ${url}`);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });

await page.waitForFunction(
  () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
  null, { timeout: 240000, polling: 500 });
if (await page.evaluate(() => document.body.dataset.rrrError === '1')) {
  console.error('\n!! FAIL: the view reported an error during load\n');
  errors.forEach((e) => console.error('  ' + e));
  failed.forEach((e) => console.error('  ' + e));
  await browser.close();
  server.kill();
  process.exit(9);
}
await page.evaluate(async () => { await window.__rrr?.settle?.(12); });

const shot = path.join(OUT, `grip_${animArg.replace(/\W+/g, '_')}.png`);
await page.screenshot({ path: shot });

const grip = await page.evaluate(() => window.__grip ?? null);
const ink = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  if (!c) return null;
  const W = 400, Hh = 225;
  const g = document.createElement('canvas');
  g.width = W; g.height = Hh;
  const ctx = g.getContext('2d');
  ctx.drawImage(c, 0, 0, W, Hh);
  const d = ctx.getImageData(0, 0, W, Hh).data;
  let dark = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240) dark++;
  }
  return { frac: dark / (W * Hh), w: c.width, h: c.height };
});

await browser.close();
server.kill();

const readoutPath = path.join(OUT, 'readout.json');
if (grip) fs.writeFileSync(readoutPath, JSON.stringify(grip, null, 2));

console.log('');
if (errors.length) { console.error('PAGE ERRORS:'); errors.forEach((e) => console.error('  ' + e)); }
if (failed.length) { console.error('FAILED REQUESTS:'); failed.forEach((e) => console.error('  ' + e)); }

let fails = 0;
const pass = (n, d = '') => console.log(`  PASS  ${n}${d ? ' — ' + d : ''}`);
const fail = (n, d = '') => { console.error(`  FAIL  ${n}${d ? ' — ' + d : ''}`); fails++; };

if (errors.length || failed.length) fail('page loaded clean', `${errors.length} errors, ${failed.length} failed requests`);
else pass('page loaded clean');

if (!gripLine) fail('view printed [char.grip] load report');
else pass('view printed [char.grip] load report');

if (!grip) {
  fail('window.__grip published');
} else {
  pass('window.__grip published');
  const n = grip.stations?.length ?? 0;
  if (n === 5) pass('five roll stations', grip.stations.map((s) => s.roll).join('  '));
  else fail('five roll stations', `got ${n}`);

  const centre = grip.stations?.find((s) => s.shipped);
  const shipped = grip.shipped?.roll;
  if (centre && shipped != null && Math.abs(centre.roll - shipped) < 1e-4) {
    pass('centre station is GRIP_SHIPPED', `${centre.roll} rad  ${centre.rollDeg} deg`);
  } else {
    fail('centre station is GRIP_SHIPPED', `centre=${centre?.roll} shipped=${shipped}`);
  }

  const heavy = grip.product?.Heavy_Hammer_Swing?.grip;
  if (heavy != null && shipped != null && Math.abs(heavy - shipped) < 1e-4) {
    pass('product Heavy_Hammer_Swing.grip matches bench', String(heavy));
  } else {
    fail('product Heavy_Hammer_Swing.grip matches bench', `product=${heavy} bench=${shipped}`);
  }

  const attack = grip.product?.Attack?.grip;
  if (attack != null && shipped != null && Math.abs(attack - shipped) < 1e-4) {
    pass('product Attack.grip shares the same lock', String(attack));
  } else {
    fail('product Attack.grip shares the same lock', `product=${attack} bench=${shipped}`);
  }

  const along = grip.shipped?.alongHaft;
  const liveAlong = grip.live?.alongHaft;
  if (along != null && liveAlong != null && Math.abs(along - liveAlong) < 1e-6) {
    pass('hand-on-haft (griplen) matches product', String(along));
  } else {
    fail('hand-on-haft (griplen) matches product', `shipped=${along} live=${liveAlong}`);
  }

  const parents = (grip.stations ?? []).map((s) => s.parent);
  if (parents.length && parents.every((p) => p === 'RightHand')) pass('every prop parented to RightHand');
  else fail('every prop parented to RightHand', parents.join(','));

  if (centre?.driveHandM != null) {
    log(`drive-hand distance to haft: ${centre.driveHandM} m`);
    log(`off-hand distance to haft:   ${centre.offHandM} m`);
  }
  console.log('\n  paste into SWINGS:\n' + (grip.swingsPaste ?? '(none)').split('\n').map((l) => '    ' + l).join('\n'));
}

if (!ink) fail('canvas present');
else {
  log(`canvas ${ink.w}x${ink.h}  subject ${(ink.frac * 100).toFixed(1)}% of frame`);
  log(`wrote ${shot}`);
  if (ink.frac < 0.02) fail('frame is not blank', `${(ink.frac * 100).toFixed(1)}%`);
  else pass('frame is not blank', `${(ink.frac * 100).toFixed(1)}% subject`);
}
if (grip) log(`wrote ${readoutPath}`);

if (fails) {
  console.error(`\n!! ${fails} failed\n`);
  process.exit(1);
}
console.log('\n  OK — product hammer grip matches the char.grip bench lock\n');
process.exit(0);
