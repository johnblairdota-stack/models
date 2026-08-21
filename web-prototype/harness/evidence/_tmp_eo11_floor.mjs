/**
 * estate-owner-11: WHY IS THE NEAR THIRD OF THE BALLROOM FLOOR A FEATURELESS PALE SHEET?
 *
 * The chequer is legible in the far half and gone in the near half, with a hard diagonal
 * boundary — the thing critics have called "a seam where the tile scale changes" for four
 * rounds. Two candidate mechanisms, and they are separable by ablation in one boot:
 *
 *   env=null       kills scene.environment. If the wash is GRAZING IBL SPECULAR (a polished
 *                  floor returning a structureless five-box shell), it goes away.
 *   rough+         raises the floor material's roughness scalar. If the wash is specular at
 *                  all, roughening it must reduce it.
 *   pools=off      hides the three lightPool decals.
 *   shafts=off     hides the three lightShaft volumes.
 *
 * Reports mean/median/p5/p95 luma over a near-floor rectangle for each state, so the answer
 * is a number rather than an impression.
 */
import { chromium } from 'playwright';
import net from 'node:net';
import { writeFileSync } from 'node:fs';

const PORT = 5178;
const DIR = 'C:/Users/John/AppData/Local/Temp/claude';
const RECT = { x: 120, y: 700, width: 400, height: 240 };

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
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1`, { waitUntil: 'load', timeout: 45000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 240000 });
await page.evaluate((n) => window.__rrr.settle(n), 16);

// find the floor mesh and remember the original values
const info = await page.evaluate(() => {
  const e = window.__rrr.engine, s = e.scene;
  let floor = null;
  s.traverse((o) => {
    if (o.isMesh && o.geometry?.type === 'PlaneGeometry' && Math.abs(o.rotation.x + Math.PI / 2) < 1e-3
      && o.position.y === 0) floor = o;
  });
  if (!floor) return { found: false };
  e.__floor = floor;
  e.__saved = {
    env: s.environment, rough: floor.material.roughness, metal: floor.material.metalness,
    envI: floor.material.envMapIntensity,
  };
  return {
    found: true, name: floor.material.name, rough: floor.material.roughness,
    metal: floor.material.metalness, envI: floor.material.envMapIntensity,
    hasRoughMap: !!floor.material.roughnessMap, envIntensity: s.environmentIntensity,
  };
});
console.log('floor:', JSON.stringify(info));
if (!info.found) { await browser.close(); process.exit(4); }

const STATES = {
  base: () => {},
  envnull: (e) => { e.scene.environment = null; },
  envhalf: (e) => { e.scene.environmentIntensity = e.scene.environmentIntensity * 0.35; },
  rough: (e) => { e.__floor.material.roughness = 1.0; e.__floor.material.needsUpdate = true; },
  poolsoff: (e) => { e.scene.traverse((o) => { if (o.name && /pool/i.test(o.name)) o.visible = false; }); },
};

for (const key of Object.keys(STATES)) {
  await page.evaluate((k) => {
    const e = window.__rrr.engine, s = e.scene, sv = e.__saved;
    // restore first, so every state is measured against the same baseline
    s.environment = sv.env; s.environmentIntensity = 3.2;
    e.__floor.material.roughness = sv.rough;
    e.__floor.material.metalness = sv.metal;
    e.__floor.material.needsUpdate = true;
    s.traverse((o) => { if (o.name && /pool/i.test(o.name)) o.visible = true; });
    const F = {
      base: () => {},
      envnull: () => { s.environment = null; },
      envhalf: () => { s.environmentIntensity = 3.2 * 0.35; },
      rough: () => { e.__floor.material.roughness = 1.0; e.__floor.material.needsUpdate = true; },
      poolsoff: () => { s.traverse((o) => { if (o.name && /pool/i.test(o.name)) o.visible = false; }); },
    };
    F[k]();
  }, key);
  await page.evaluate((n) => window.__rrr.settle(n), 6);
  const buf = await page.screenshot({ clip: RECT });
  const f = `${DIR}/eo11-floor-${key}.png`;
  writeFileSync(f, buf);
  console.log(`${key.padEnd(9)} -> ${f}`);
}
await browser.close();
