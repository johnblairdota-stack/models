// critic-ingame: walk the player to the HUNTER and shoot a frame with both in it, so the
// "can you tell them apart at a glance" question is answered from a real play frame.
// usage: node harness/_ig5_hunter.mjs <outDir> <tag> [extraQuery]
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

const state = () => p.evaluate(() => {
  const e = window.__rrr.engine, pl = e.player, hu = e.hunter;
  const P = pl.pos, HP = hu.root.position;
  return { px: +P.x.toFixed(1), pz: +P.z.toFixed(1), hx: +HP.x.toFixed(1), hz: +HP.z.toFixed(1),
    dist: +Math.hypot(P.x - HP.x, P.z - HP.z).toFixed(1), hs: hu.state, aim: +pl.aimYaw.toFixed(2),
    stage: hu.stage, absorbed: hu.absorbed };
});

// steer: face the hunter by writing aimYaw, then hold W. This is the same input path the
// player's own turn uses; we are substituting for mouse-look, which headless denies us.
async function faceHunter() {
  await p.evaluate(() => {
    const e = window.__rrr.engine, pl = e.player, hu = e.hunter;
    const dx = hu.root.position.x - pl.pos.x, dz = hu.root.position.z - pl.pos.z;
    pl.aimYaw = Math.atan2(dx, dz);
    if (e.cam) e.cam.yaw = pl.aimYaw;
  });
}

for (let i = 1; i <= 24; i++) {
  await faceHunter();
  await p.keyboard.down('KeyW'); await p.keyboard.down('ShiftLeft');
  await p.waitForTimeout(700);
  await p.keyboard.up('KeyW'); await p.keyboard.up('ShiftLeft');
  const st = await state();
  console.log(`step${i}`, JSON.stringify(st));
  if (st.dist < 14) await p.screenshot({ path: shot(`near_${String(i).padStart(2, '0')}_d${Math.round(st.dist)}`) });
  if (st.dist < 5) { console.log('CONTACT'); break; }
}
await faceHunter();
await p.waitForTimeout(400);
await p.screenshot({ path: shot('99_contact') });
console.log('final', JSON.stringify(await state()));
await b.close();
console.log('done');
