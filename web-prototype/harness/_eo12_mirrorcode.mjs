/**
 * estate-owner-12: DOES THE MIRROR-FILTER CODE DO WHAT THE ROUND-11 NOTE SAYS IT DOES?
 *
 * `critic-estate-9` refuted the round-11 mirror-filter FIX by measurement (point vs sharp,
 * acutance 0.1984 vs 0.1969 — flat and marginally reversed) and was careful to say it had NOT
 * checked the underlying CODE claim: 7.1 : 1 minification, `LinearFilter`, no mip chain. So the
 * diagnosis could still be right while the fix buys nothing, and nobody had separated the two.
 *
 * This reports, per plate, per `?mirrorfilter=` mode, the things that decide it:
 *   minFilter / generateMipmaps / anisotropy / mipmap count on the reflection target
 *   whether the shader patch landed at all, and whether the LOD and unsharp branches are in it
 *
 * ⚠ `mat.userData.planarPatched` IS SET INSIDE `onBeforeCompile`, so it is null until the
 * material's program is first compiled. Read it after settling, never at build time.
 */
import { chromium } from 'playwright';
import net from 'node:net';

const PORT = 5178;
const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
});
if (!(await portOpen(PORT))) { console.error('vite not running on 5178'); process.exit(3); }

const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-frame-rate-limit',
    '--force-device-scale-factor=1', '--hide-scrollbars'],
});

for (const mode of ['point', 'mip', 'sharp']) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
  await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1&mirrorfilter=${mode}`,
    { waitUntil: 'load', timeout: 45000 });
  await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 300000 });
  await page.evaluate((n) => window.__rrr.settle(n), 12);
  const rows = await page.evaluate(() => {
    const e = window.__rrr.engine;
    // three's filter constants, spelled out so this does not need THREE on window.
    // ⚠ GET THESE RIGHT OR THE TOOL LIES. The first version of this table had 1007/1008 as
    // NearestMipmapNearest/LinearMipmapNearest and reported the shipping target as
    // "LinearMipmapNearest" — i.e. it would have filed a false finding that the code's
    // requested LinearMipmapLinear had been silently downgraded. three r180:
    //   1003 Nearest · 1004 NearestMipmapNearest · 1005 NearestMipmapLinear
    //   1006 Linear  · 1007 LinearMipmapNearest  · 1008 LinearMipmapLinear
    const F = { 1003: 'Nearest', 1004: 'NearestMipmapNearest', 1005: 'NearestMipmapLinear',
      1006: 'Linear', 1007: 'LinearMipmapNearest', 1008: 'LinearMipmapLinear' };
    return (e.endPlates ?? []).map((m) => {
      const rt = m.userData.mirrorRT;
      const t = rt?.texture;
      const u = m.material.userData;
      return {
        name: m.name,
        rt: t ? [rt.width, rt.height] : null,
        minFilter: t ? (F[t.minFilter] ?? t.minFilter) : null,
        genMips: t ? t.generateMipmaps : null,
        aniso: t ? t.anisotropy : null,
        patched: u.planarPatched, lod: u.planarLod, sharp: u.planarSharpPatched,
        filter: u.planarFilter, defines: JSON.stringify(m.material.defines),
      };
    });
  });
  for (const r of rows) {
    console.log(`${(`?mirrorfilter=${r.filter}`).padEnd(24)} ${r.name.padEnd(14)} `
      + `RT ${String(r.rt)} minFilter=${r.minFilter} mips=${r.genMips} aniso=${r.aniso}  `
      + `patched=${r.patched} lodBranch=${r.lod} unsharpBranch=${r.sharp} ${r.defines}`);
  }
  await page.close();
}
await browser.close();
