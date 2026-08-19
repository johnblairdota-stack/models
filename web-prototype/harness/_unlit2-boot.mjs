#!/usr/bin/env node
/**
 * BOOT ONE VIEW AND SAY WHAT IT ACTUALLY DID.
 *
 * `shoot.mjs` reports `ok  1/1 captured` for a run whose view threw AFTER signalling ready: it
 * only reads `window.__rrrError` once, immediately after the ready wait, so anything that
 * throws later — from an `onUpdate` guard, say — lands in the page's error overlay and gets
 * PHOTOGRAPHED. The tell is a 25 kB 1920x1080 PNG that is uniformly #160A0C, which is
 * `index.html`'s error-panel background and not any colour a view renders.
 *
 * This prints the console, the page errors, `window.__rrrError` and the overlay text, so a
 * late throw is a message instead of a flat rectangle.
 *
 *   node harness/_unlit2-boot.mjs "view=mesh.animated&unlit=1&solo=1&clip=n30&bind=1"
 */
import { chromium } from 'playwright';

/*
 * `--control no-bypass` / `--control no-aooff` DELIBERATELY BREAK ONE HALF OF THE UNLIT MODE.
 *
 * A guard nobody has watched fail is indistinguishable from a guard that cannot fire, and four
 * agents shipped exactly that this week. These two flags set a global that `bypassPostChain`
 * reads, so each half of `assertPostBypassed` can be made to throw ON DEMAND — the assertion is
 * then a measurement rather than a decoration. They are read before any module loads.
 */
const controlAt = process.argv.indexOf('--control');
const control = controlAt === -1 ? null : process.argv[controlAt + 1];
const query = process.argv[2] ?? 'view=mesh.animated';
const PORT = process.env.RRR_PORT ?? 5192;
const url = `http://127.0.0.1:${PORT}/?${query}&capture=1`;

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader',
    '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

if (control) {
  const g = control === 'no-bypass' ? '__UNLIT_CONTROL_NO_BYPASS'
    : control === 'no-aooff' ? '__UNLIT_CONTROL_NO_AOOFF' : null;
  if (!g) { console.error(`unknown --control ${control}; use no-bypass or no-aooff`); process.exit(2); }
  await page.addInitScript((name) => { globalThis[name] = true; }, g);
  console.log(`CONTROL ACTIVE: ${g} — assertPostBypassed is EXPECTED to throw`);
}

const lines = [];
page.on('console', (m) => lines.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => lines.push(`[pageerror] ${e.message}\n${e.stack ?? ''}`));

console.log(`booting ${url}`);
await page.goto(url, { waitUntil: 'load', timeout: 120000 });

// Wait for ready, but do not fail the probe if it never comes — that is itself a finding.
let ready = false;
try {
  await page.waitForFunction(() => window.__rrr?.ready === true, null, { timeout: 120000 });
  ready = true;
} catch { /* reported below */ }

// Then run frames, which is where a late guard fires.
try { await page.evaluate(() => window.__rrr.settle(20)); } catch (e) { lines.push(`[settle] ${e.message}`); }

const state = await page.evaluate(() => ({
  err: window.__rrrError ?? null,
  overlay: document.getElementById('err')?.textContent
    ?? [...document.querySelectorAll('div')].map((d) => d.textContent)
      .find((t) => t && /Error|error:/.test(t))?.slice(0, 900) ?? null,
  frame: window.__rrr?.frames?.() ?? null,
  sim: window.__rrr?.simState?.() ?? null,
})).catch((e) => ({ err: `evaluate failed: ${e.message}` }));

console.log(`\nready: ${ready}   frame: ${state.frame}   sim: ${JSON.stringify(state.sim)}`);
console.log('\n--- console ---');
for (const l of lines) console.log(l);
console.log('\n--- __rrrError ---');
console.log(state.err ?? '(none)');
console.log('\n--- overlay text ---');
console.log(state.overlay ?? '(none)');

await browser.close();
