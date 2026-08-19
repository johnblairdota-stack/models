#!/usr/bin/env node
/**
 * VERIFICATION STEP 5 — which GLB does each `?clip=` key actually FETCH?
 *
 * Not "does a frame appear". The failure this is built to catch is the silent one: before the
 * guard added to `mesh-animated.js`, an unknown key fell through to `CLIPS.walking` and rendered
 * a DIFFERENT BODY with no error. A capture of the wrong body looks exactly like a result.
 *
 * So the assertion is on the network request, and the control is bf65 vs n30: if the probe
 * reports the same filename for two different keys it is broken, not passing.
 *
 * Runs against the PRODUCTION build on :5179 (`npm run preview`) — the URL MESH.bat opens.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5179';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });

async function probe(key) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const glbs = [];
  const errs = [];
  page.on('request', (r) => {
    const u = r.url();
    if (/\/models\/anim\/.*\.glb/.test(u)) glbs.push(u.split('/').pop().split('?')[0]);
  });
  page.on('pageerror', (e) => errs.push(String(e).split('\n')[0]));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  const url = `${BASE}/?view=mesh.animated&capture=1&solo=1&clip=${key}&anim=Alert&label=0&azim=0`;
  await page.goto(url, { waitUntil: 'load' });
  let ready = null;
  try {
    await page.waitForFunction(
      () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
      null, { timeout: 180000 });
    ready = await page.evaluate(() => ({
      ok: document.body.dataset.rrrReady === '1',
      err: document.body.dataset.rrrError === '1',
      msg: window.__rrrError ?? null,
    }));
  } catch (e) {
    ready = { ok: false, err: false, msg: 'TIMED OUT / HUNG: ' + String(e).slice(0, 80) };
  }
  await page.close();
  return { key, glbs, errs, ready };
}

const results = {};
for (const k of ['n30', 'bf65', 'bft6']) {
  results[k] = await probe(k);
  const r = results[k];
  console.log(`\n=== ?clip=${k} ===`);
  console.log('  glb fetched : ' + (r.glbs.length ? r.glbs.join(', ') : '(none)'));
  console.log('  ready flag  : ' + (r.ready.ok ? 'READY' : r.ready.err ? 'ERROR (loud)' : 'NEITHER'));
  if (r.ready.msg) console.log('  view error  : ' + String(r.ready.msg).split('\n')[0].slice(0, 190));
  if (r.errs.length) console.log('  console/page: ' + r.errs[0].slice(0, 190));
}
await browser.close();

// ------------------------------------------------------------------ assertions
let fail = 0;
const A = (cond, msg) => { console.log((cond ? '  PASS  ' : '  FAIL  ') + msg); if (!cond) fail++; };
console.log('\n--- assertions ---');
A(results.n30.glbs.includes('player_norm30.glb'), 'n30 fetches player_norm30.glb');
A(results.n30.ready.ok, 'n30 reaches READY');
A(results.bf65.glbs.includes('player_bf65.glb'), 'bf65 fetches player_bf65.glb');
A(results.bf65.ready.ok, 'bf65 reaches READY');
A(!results.bft6.ready.ok, 'bft6 does NOT report READY');
A(results.bft6.ready.err, 'bft6 fails LOUDLY (rrrError set, i.e. not a hang)');
A(/no such \?clip=bft6/.test(String(results.bft6.ready.msg) + results.bft6.errs.join(' ')),
  'bft6 error names the bad key');
A(results.bft6.glbs.length === 0,
  `bft6 fetches NO body (silent-wrong-body guard) — got [${results.bft6.glbs.join(', ')}]`);
A(!results.bft6.glbs.some((g) => /Walking/i.test(g)), 'bft6 did NOT fall back to the Meshy walking GLB');

// the control: two different keys MUST report two different files, or this probe proves nothing
console.log('\n--- control (the probe must be able to tell bodies apart) ---');
const same = JSON.stringify(results.n30.glbs) === JSON.stringify(results.bf65.glbs);
A(!same, `n30 and bf65 report DIFFERENT files (n30=[${results.n30.glbs}] bf65=[${results.bf65.glbs}])`);

console.log(fail === 0 ? '\nALL CLIP-KEY ASSERTIONS PASS' : `\n${fail} ASSERTION(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
