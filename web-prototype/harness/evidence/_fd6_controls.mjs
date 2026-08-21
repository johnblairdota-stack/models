#!/usr/bin/env node
/**
 * EVERY GUARD THIS ROUND ADDED, WATCHED FAILING.
 *   node harness/evidence/_fd6_controls.mjs
 * A guard nobody has seen fail is a comment. These two are reachable from the address bar;
 * the other two need a source edit and are recorded in the round's notes.
 */
import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
for (const q of ['', '&eardisc=0', '&eardisc=1.4', '&earinner=1.02']) {
  const p = await b.newPage({ viewport: { width: 800, height: 600 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).split('\n')[0]));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 400)); });
  await p.goto(`http://localhost:5183/?view=mesh.animated&capture=1&solo=1&clip=merged&anim=Alert&label=0&azim=90${q}`, { waitUntil: 'load' });
  await p.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 180000 }).catch(() => {});
  const st = await p.evaluate(() => ({ ready: document.body.dataset.rrrReady, err: document.body.dataset.rrrError, msg: window.__rrrError ?? null }));
  console.log(`\n${q || '(default)'}  ready=${st.ready} err=${st.err}`);
  const m = (st.msg || errs.find((e) => /mesh-identity|mesh-avatar/.test(e)) || errs[0] || '').split('\n')[0];
  if (m) console.log('   ', m.slice(0, 330));
  await p.close();
}
await b.close();
