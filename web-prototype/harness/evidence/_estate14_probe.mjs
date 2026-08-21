// estate-owner-14: verify (a) the planar-reflection patch landed on BOTH floor materials under
// `?floor=mixed`, and (b) `?floor=chequer` builds no parquet mesh at all — the two halves of
// "the toggle is a complete revert" that code-reading alone cannot confirm (onBeforeCompile
// fails silently — see HANDOFF's own hazard note).
import { chromium } from 'playwright';

const PORT = 5178;
const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-frame-rate-limit',
    '--force-device-scale-factor=1', '--hide-scrollbars'],
});

async function probe(qs) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
  await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1&${qs}`, { waitUntil: 'load', timeout: 45000 });
  await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 240000 });
  const out = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const fp = e.floorParquet;
    const fr = e.floorReflect;
    return {
      floorMode: e.floorMode,
      floorParquetExists: !!fp,
      floorParquetPatched: fp ? fp.material.userData.planarPatched : null,
      floorParquetRough: fp ? [fp.material.userData.planarUniforms?.uEoRough?.value?.x,
        fp.material.userData.planarUniforms?.uEoRough?.value?.y] : null,
      floorChequerPatched: fr ? fr.material.userData.planarPatched : null,
      floorChequerRough: fr ? [fr.material.userData.planarUniforms?.uEoRough?.value?.x,
        fr.material.userData.planarUniforms?.uEoRough?.value?.y] : null,
    };
  });
  await page.close();
  return out;
}

console.log('?floor=mixed (default):', JSON.stringify(await probe('floor=mixed'), null, 2));
console.log('?floor=chequer (revert):', JSON.stringify(await probe('floor=chequer'), null, 2));
await browser.close();
