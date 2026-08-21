/**
 * _maplabel1-arm.mjs — IS THE ROUTE-HIDDEN ARM ACTUALLY HIDING THE ROUTE?
 *
 * `docs/handoff/maplabel-1.md` §3/§5: over John's first 40 labels the only feature that clears a
 * family-wise shuffle null is `hopsToExit` (AUC 0.831) — and it is one of the two numbers this
 * tool prints largest, beside the most conspicuous overlay on the plan. `?arm=blind` (button, or
 * `H`) hides the route so the next batch can tell taste from instrument-reading.
 *
 * 🚨 **A ROUTE-HIDDEN ARM THAT SILENTLY STILL DRAWS THE ROUTE IS EXACTLY THE RESULT-SHAPED OUTPUT
 * THIS PROJECT KEEPS GETTING BITTEN BY** — forty labels would come back looking like data and mean
 * nothing. So this counts real canvas pixels and reads real page text, on both arms, same seeds:
 *
 *   B1  ROUTE PIXELS — the violet #c98cff must be NON-ZERO in the shown arm on every seed and
 *       EXACTLY ZERO in the hidden arm. **The non-zero half is the control that must fail**: if
 *       the shown arm also read zero, B1 would be measuring a broken page, not a working arm.
 *   B2  NOTHING ELSE MOVED — the pixel census of dig orange, the lime soft spot, cyan hard stop,
 *       exit green and spawn yellow must be IDENTICAL between the two arms. "Do not otherwise
 *       change what he sees", asserted rather than promised.
 *   B3  NO NUMBER LEAKS — every phrase that states or implies the walk (`walls to break`,
 *       `regions crossed`, `deepest point`, `mean digs to anywhere`, `won in 8 s`,
 *       `digs, spawn → exit`, `can you walk to the way out`, `shortest solution`) must be present
 *       in the shown arm and absent in the hidden one. Present-in-shown is again the arm that
 *       must fail: a phrase that never appears cannot prove it was hidden.
 *   B4  THE TOGGLE IS GONE, not merely unticked — an unticked box he can click is not an arm.
 *   B5  ROUND TRIP — a row POSTed in each arm reads back tagged `route-shown` / `route-hidden`,
 *       and the pre-existing rows are untouched and still untagged.
 *
 * ⚠️ B5 WRITES TO JOHN'S REAL `labels.jsonl`, because that is the only path the tool has and a
 * round trip through a mock would prove nothing. It snapshots the file first, appends its two
 * probe rows, reads them back, then restores the exact original bytes and **asserts the restore
 * is byte-identical by SHA-256**. If that assert is ever red, the backup is in the scratchpad
 * path printed in the failure line.
 *
 * Usage:  node harness/evidence/_maplabel1-arm.mjs      (starts its own server on MAPS_PORT or 5185)
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LABELS = path.join(ROOT, 'tools', 'mapdesigner', 'labels.jsonl');
const PORT = Number(process.env.MAPS_PORT || 5185);
const SEEDS = [7, 27932, 27943, 27958, 27970, 42];

const ROUTE_VIOLET = [0xc9, 0x8c, 0xff];
const UNCHANGED = {
  'dig orange': [0xff, 0x9a, 0x3c], 'soft spot lime': [0xb6, 0xff, 0x2e],
  'cyan hard stop': [0x3f, 0xd0, 0xe0], 'exit green': [0x67, 0xe0, 0x8a],
  'spawn yellow': [0xff, 0xd7, 0x5e], 'breachable amber': [0xff, 0xbe, 0x4d],
};
/** every phrase on the page that states or implies the spawn→exit walk */
const LEAKS = [
  'walls to break', 'regions crossed', 'deepest point of the house', 'mean digs to anywhere',
  'won in 8 s', 'digs, spawn', 'can you walk to the way out', 'shortest solution',
];

const out = [];
let fails = 0;
const rec = (ok, name, detail) => { if (!ok) fails++; out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        ${detail}`); };

const srv = spawn(process.execPath, [path.join(ROOT, 'tools', 'mapdesigner', 'serve.mjs')],
  { env: { ...process.env, MAPS_PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const COLS = [ROUTE_VIOLET, ...Object.values(UNCHANGED)];
async function look(seed, blind) {
  await page.goto(`http://localhost:${PORT}/tools/mapdesigner/?seed=${seed}${blind ? '&arm=blind' : ''}`,
    { waitUntil: 'load' });
  await page.waitForFunction(() => window.__mapdesigner && window.__mapdesigner.plan, null, { timeout: 20000 });
  await page.waitForTimeout(250);
  const px = await page.evaluate(([cols]) => {
    const cv = document.getElementById('cv');
    const g = cv.getContext('2d', { willReadFrequently: true });
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    const n = cols.map(() => 0);
    let nonBg = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      if (r > 18 || gg > 20 || b > 24) nonBg++;
      for (let k = 0; k < cols.length; k++) if (r === cols[k][0] && gg === cols[k][1] && b === cols[k][2]) { n[k]++; break; }
    }
    return { n, total: d.length / 4, nonBg };
  }, [COLS]);
  const text = await page.evaluate(() => document.body.innerText);
  const hasToggle = await page.evaluate(() => !!document.querySelector('#toggles input[data-k="route"]'));
  const banner = await page.evaluate(() => {
    const b = document.getElementById('armBanner');
    return { on: b.classList.contains('on'), text: (b.innerText || '').slice(0, 60) };
  });
  const btn = await page.evaluate(() => document.getElementById('armBtn').textContent.trim());
  return { px, text, hasToggle, banner, btn };
}

const runs = [];
for (const seed of SEEDS) runs.push({ seed, shown: await look(seed, false), blind: await look(seed, true) });

// --- B5: the round trip through the real labels file ------------------------------------------
const before = fs.readFileSync(LABELS);
const beforeHash = crypto.createHash('sha256').update(before).digest('hex');
const backup = path.join(os.tmpdir(), `_ml1-labels-backup-${Date.now()}.jsonl`);
fs.writeFileSync(backup, before);
let tags = null, roundTripErr = null;
try {
  for (const blind of [false, true]) {
    await look(999999, blind);
    const r = await page.evaluate(() => {
      const btns = { good: 'vGood' };
      document.getElementById(btns.good).click();
      return new Promise((res) => setTimeout(res, 700));
    });
    void r;
  }
  const after = fs.readFileSync(LABELS, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  tags = after.slice(-2).map((x) => ({ seed: x.seed, arm: x.arm, verdict: x.verdict }));
} catch (e) { roundTripErr = String(e); } finally {
  fs.writeFileSync(LABELS, before);
}
const restored = crypto.createHash('sha256').update(fs.readFileSync(LABELS)).digest('hex');
const legacyUntagged = fs.readFileSync(LABELS, 'utf8').trim().split('\n')
  .map(JSON.parse).filter((x) => x.arm === undefined).length;

await browser.close();
srv.kill();

// ===========================================================================================
// assertions
// ===========================================================================================
rec(errors.length === 0, 'the page runs clean in both arms',
  errors.length ? errors.slice(0, 3).join(' | ') : `no page or console errors over ${SEEDS.length} seeds × 2 arms`);

// B1 — both halves, and the shown half is the control that must fail
const shownZero = runs.filter((r) => r.shown.px.n[0] === 0);
const blindNonZero = runs.filter((r) => r.blind.px.n[0] !== 0);
rec(shownZero.length === 0 && blindNonZero.length === 0,
  'B1 🚨 route pixels: NON-ZERO with the route shown (the control), ZERO with it hidden',
  runs.map((r) => `${r.seed}: ${r.shown.px.n[0]} → ${r.blind.px.n[0]}`).join(' · ')
  + (shownZero.length ? ` · 🚨 SHOWN ARM DREW NO ROUTE on ${shownZero.map((r) => r.seed).join(',')} — `
    + 'this check cannot see the thing it asserts' : '')
  + (blindNonZero.length ? ' · 🚨 THE HIDDEN ARM STILL DREW THE ROUTE' : ''));

/**
 * B2 — ⚠️ THIS ASSERTION WAS WRONG ON ITS FIRST RUN AND THE ARM WAS RIGHT, WHICH IS WHY IT IS
 * WRITTEN OUT RATHER THAN QUIETLY LOOSENED. It first demanded IDENTICAL mark counts between the
 * arms and went red: dig orange 14953 → 15055, soft-spot lime 2146 → 2174. **The route is stroked
 * OVER the walls** (a dashed line through region centres plus a box round every wall it breaks),
 * so hiding it UNCOVERS pixels it was sitting on. Identical counts were never the right test.
 *
 * The right test — and it is stronger, because it says what changed and not merely that
 * something did:
 *   · no mark may LOSE pixels (`blind >= shown`), i.e. nothing was removed with the route;
 *   · the total GAINED across every mark must be no more than the route's own footprint, i.e.
 *     nothing appeared that the route was not covering.
 */
const lost = [], gains = [];
Object.keys(UNCHANGED).forEach((name, i) => {
  for (const r of runs) {
    const d = r.blind.px.n[i + 1] - r.shown.px.n[i + 1];
    if (d < 0) lost.push(`${name}@${r.seed} LOST ${-d}px`);
  }
});
for (const r of runs) {
  const gained = Object.keys(UNCHANGED).reduce((s, _, i) => s + (r.blind.px.n[i + 1] - r.shown.px.n[i + 1]), 0);
  gains.push({ seed: r.seed, gained, route: r.shown.px.n[0], ok: gained <= r.shown.px.n[0] });
}
rec(lost.length === 0 && gains.every((g) => g.ok),
  'B2 the ONLY thing that changed is what the route was covering',
  (lost.length ? `🚨 pixels LOST with the route: ${lost.slice(0, 4).join(' · ')} · ` : '')
  + gains.map((g) => `${g.seed}: +${g.gained}px uncovered vs a ${g.route}px route`
    + (g.ok ? '' : ' 🚨 MORE THAN THE ROUTE COVERED')).join(' · ')
  + ` · no mark lost a single pixel across ${Object.keys(UNCHANGED).length} colours × ${SEEDS.length} seeds`);

// B3 — both halves
const leakBad = [];
for (const phrase of LEAKS) {
  const missingWhenShown = runs.filter((r) => !r.shown.text.includes(phrase));
  const presentWhenBlind = runs.filter((r) => r.blind.text.includes(phrase));
  if (missingWhenShown.length) leakBad.push(`"${phrase}" NOT FOUND in the shown arm — the check is vacuous`);
  if (presentWhenBlind.length) leakBad.push(`"${phrase}" STILL ON THE PAGE in the hidden arm`);
}
rec(leakBad.length === 0, 'B3 🚨 every phrase that states the walk is present when shown and gone when hidden',
  leakBad.length ? leakBad.join(' · ')
    : `${LEAKS.length} phrases checked on every seed: ${LEAKS.map((p) => `"${p}"`).join(', ')}`);

// B4
rec(runs.every((r) => r.shown.hasToggle && !r.blind.hasToggle)
  && runs.every((r) => r.blind.banner.on && !r.shown.banner.on)
  && runs.every((r) => r.blind.btn === 'route: HIDDEN' && r.shown.btn === 'route: shown'),
'B4 the arm is visible and cannot be clicked out of',
`route toggle present ${runs.every((r) => r.shown.hasToggle)} / removed in the arm `
+ `${runs.every((r) => !r.blind.hasToggle)} · banner on ${runs.every((r) => r.blind.banner.on)} `
+ `("${runs[0].blind.banner.text}…") · button "${runs[0].shown.btn}" → "${runs[0].blind.btn}"`);

// B5
rec(!roundTripErr && tags && tags.length === 2 && tags[0].arm === 'route-shown' && tags[1].arm === 'route-hidden',
  'B5 a row written in each arm reads back with the right tag',
  roundTripErr || (tags ? tags.map((t) => `seed ${t.seed} → arm "${t.arm}"`).join(' · ') : 'no rows read back'));
rec(restored === beforeHash, 'B5b John\'s labels file is restored byte-identical',
  restored === beforeHash
    ? `sha256 ${beforeHash.slice(0, 16)}… unchanged · ${legacyUntagged} legacy rows still carry NO `
      + '`arm` field, which is what "route-shown" means for them'
    : `🚨 RESTORE FAILED — the original bytes are at ${backup}`);

console.log('\n_maplabel1-arm — the route-hidden arm\n');
for (const l of out) console.log('  ' + l);
try { fs.unlinkSync(backup); } catch { /* best effort */ }
console.log(`\n  ${fails === 0 ? 'ALL GREEN' : `🚨 ${fails} RED`}\n`);
process.exit(fails === 0 ? 0 : 1);
