// critic-ingame: get the PLAYER and the HUNTER into one real in-game frame, at game
// distance and game lighting, so "can you tell them apart at a glance" is answerable.
// The hunter is repositioned in front of the player -- the AI is untouched, this only
// moves where it stands so both are on screen at once.
// usage: node harness/evidence/_ig6_pair.mjs <outDir> <tag> [extraQuery]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [outDir, tag, extra = ''] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const shot = (p) => `${outDir}/${tag}_${p}.png`;

const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)));

await p.goto(`http://127.0.0.1:5192/?view=game.play&mesh=1&quality=medium&seed=s4${extra}`,
  { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
  null, { timeout: 300000 });
await p.click('#rrr-play-btn').catch(() => {});
await p.waitForTimeout(1200);

// walk a little so we are in the open gallery rather than the spawn alcove
await p.keyboard.down('KeyW'); await p.waitForTimeout(2200); await p.keyboard.up('KeyW');
await p.waitForTimeout(400);

for (const d of [7, 11]) {
  const info = await p.evaluate((dist) => {
    const e = window.__rrr.engine, pl = e.player, hu = e.hunter;
    // The hunter's own AI rewrites root.position every frame, so setting it once and
    // waiting gives a frame with no hunter in it. PIN it every frame instead.
    if (window.__igPin) cancelAnimationFrame(window.__igPin);
    const place = () => {
      const yaw = pl.aimYaw, off = 1.6;
      hu.root.position.set(
        pl.pos.x + Math.sin(yaw) * dist + Math.cos(yaw) * off,
        pl.pos.y,
        pl.pos.z + Math.cos(yaw) * dist - Math.sin(yaw) * off);
      hu.root.updateMatrixWorld(true);
      window.__igPin = requestAnimationFrame(place);
    };
    place();
    return { px: +pl.pos.x.toFixed(1), pz: +pl.pos.z.toFixed(1),
             hx: +hu.root.position.x.toFixed(1), hz: +hu.root.position.z.toFixed(1),
             yaw: +pl.aimYaw.toFixed(2), stage: hu.stage, absorbed: hu.absorbed };
  }, d);
  await p.waitForTimeout(900);
  await p.screenshot({ path: shot(`pair_${d}m`) });
  console.log(`pair ${d}m`, JSON.stringify(info));
}
await b.close();
console.log('done');
