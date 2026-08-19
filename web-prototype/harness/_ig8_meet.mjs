// critic-ingame: put the PLAYER next to where the hunter's own AI has walked it, so both
// render normally in one real in-game frame. Moving the player is safe -- the camera follows
// it and nothing culls on it -- whereas moving the hunter is undone by its AI every frame.
// usage: node harness/_ig8_meet.mjs <outDir> <tag> [extraQuery]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [outDir, tag, extra = ''] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)));

await p.goto(`http://127.0.0.1:5192/?view=game.play&mesh=1&quality=medium&seed=s4${extra}`,
  { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
  null, { timeout: 300000 });

// CONTROL: the sim must actually be advancing. A frozen sim renders a plausible frame and
// silently answers a different question -- that is exactly how the last attempt failed.
await p.click('#rrr-play-btn');
await p.waitForTimeout(800);
const f1 = await p.evaluate(() => window.__rrr.engine.frame);
await p.waitForTimeout(700);
const f2 = await p.evaluate(() => window.__rrr.engine.frame);
console.log('frame advance', f1, '->', f2);
if (f2 <= f1) { console.log('FROZEN — aborting, the frame counter did not move'); await b.close(); process.exit(2); }

for (const d of [6, 10]) {
  const info = await p.evaluate((dist) => {
    const e = window.__rrr.engine, pl = e.player, hu = e.hunter;
    const H = hu.root.position;
    // stand the player `dist` south of the hunter and look straight at it
    pl.pos.set(H.x, pl.pos.y, H.z + dist);
    pl.vel?.set?.(0, 0, 0);
    pl.aimYaw = Math.atan2(H.x - pl.pos.x, H.z - pl.pos.z);
    if (e.cam) e.cam.yaw = pl.aimYaw;
    return { px: +pl.pos.x.toFixed(1), pz: +pl.pos.z.toFixed(1),
             hx: +H.x.toFixed(1), hz: +H.z.toFixed(1), hs: hu.state, stage: hu.stage };
  }, d);
  await p.waitForTimeout(1000);
  await p.screenshot({ path: `${outDir}/${tag}_meet_${d}m.png` });
  console.log(`meet ${d}m`, JSON.stringify(info));
}
await b.close();
console.log('done');
