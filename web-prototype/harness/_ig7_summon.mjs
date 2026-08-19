// critic-ingame: summon the hunter the way the GAME does -- make a noise it can hear --
// and shoot the approach, so player and hunter share a real in-game frame.
// usage: node harness/_ig7_summon.mjs <outDir> <tag> [extraQuery]
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
await p.click('#rrr-play-btn').catch(() => {});
await p.waitForTimeout(1200);

// get into the open ballroom
await p.keyboard.down('KeyW'); await p.waitForTimeout(2000); await p.keyboard.up('KeyW');

const st = () => p.evaluate(() => {
  const e = window.__rrr.engine, pl = e.player, hu = e.hunter;
  const rig = hu.rigs?.[hu.stage]?.root;
  return { px: +pl.pos.x.toFixed(1), pz: +pl.pos.z.toFixed(1),
    hx: +hu.root.position.x.toFixed(1), hz: +hu.root.position.z.toFixed(1),
    rigVis: rig ? rig.visible : null, rootVis: hu.root.visible,
    inScene: !!hu.root.parent, stage: hu.stage,
    dist: +Math.hypot(pl.pos.x - hu.root.position.x, pl.pos.z - hu.root.position.z).toFixed(1),
    hs: hu.state };
});
console.log('before', JSON.stringify(await st()));

// shout: tell the hunter exactly where we are, at full strength, every second
for (let i = 1; i <= 30; i++) {
  await p.evaluate(() => {
    const e = window.__rrr.engine, pl = e.player, hu = e.hunter;
    hu.hearNoise?.(pl.pos, 1);
  });
  await p.waitForTimeout(900);
  const s = await st();
  console.log(`t${i}`, JSON.stringify(s));
  if (s.dist < 20) await p.screenshot({ path: `${outDir}/${tag}_d${String(Math.round(s.dist)).padStart(2, '0')}_${i}.png` });
  if (s.dist < 4) break;
}
console.log('after', JSON.stringify(await st()));
await b.close();
console.log('done');
