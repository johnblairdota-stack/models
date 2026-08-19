// critic-ingame: actually PLAY the game and shoot the player where the player is seen.
// usage: node harness/_ig3_play.mjs <outDir> <tag> [extraQuery]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [outDir, tag, extra = ''] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const shot = (p) => `${outDir}/${tag}_${p}.png`;

const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)));

const url = `http://127.0.0.1:5192/?view=game.play&mesh=1&quality=medium&seed=s4${extra}`;
console.log('url', url);
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
  null, { timeout: 300000 });
console.log('ready. error?', await p.evaluate(() => document.body.dataset.rrrError ?? '0'));

await p.click('#rrr-play-btn').catch((e) => console.log('no play btn', e.message));
await p.waitForTimeout(1500);

const state = () => p.evaluate(() => {
  try {
    const e = window.__rrr?.engine; if (!e) return { err: 'no engine' };
    const pl = e.player, hu = e.hunter;
    const P = pl?.pos ?? pl?.root?.position, HP = hu?.pos ?? hu?.root?.position ?? hu?.body?.position;
    const v3 = (v) => v ? [+v.x.toFixed(1), +v.y.toFixed(1), +v.z.toFixed(1)] : null;
    return {
      keys: Object.keys(e).slice(0, 30),
      plKeys: pl ? Object.keys(pl).slice(0, 40) : null,
      huKeys: hu ? Object.keys(hu).slice(0, 40) : null,
      pos: v3(P), hunter: v3(HP),
      yaw: +(e.cam?.yaw ?? pl?.aimYaw ?? 0).toFixed(2),
      dist: (P && HP) ? +Math.hypot(P.x - HP.x, P.z - HP.z).toFixed(1) : null,
      hunterState: hu?.state ?? hu?.mode ?? null,
      absorbed: hu?.absorbed ?? null,
    };
  } catch (err) { return { err: String(err).slice(0, 160) }; }
});
console.log("spawn", JSON.stringify(await state()));
await p.screenshot({ path: shot('00_spawn') });

// --- walk forward and look around, sampling brightness so we find a DARK spot ---
async function hold(keys, ms) {
  for (const k of keys) await p.keyboard.down(k);
  await p.waitForTimeout(ms);
  for (const k of keys) await p.keyboard.up(k);
}
async function look(dx) { await p.evaluate((d) => { const c = window.__rrr.engine.cam; if (c) c.yaw += d; }, dx); }

// mean luma of the frame's centre, to hunt for dark rooms
const centreLuma = () => p.evaluate(() => {
  const cv = document.querySelector('canvas'); if (!cv) return null;
  const c = document.createElement('canvas'); c.width = 160; c.height = 90;
  const cx = c.getContext('2d'); cx.drawImage(cv, 0, 0, 160, 90);
  const d = cx.getImageData(0, 0, 160, 90).data; let s = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; }
  return +(s / n).toFixed(1);
});

for (let i = 1; i <= 10; i++) {
  await hold(['KeyW', 'ShiftLeft'], 1200);
  const st = await state();
  const lum = await centreLuma();
  console.log(`leg${i}`, JSON.stringify({pos:st?.pos,hunter:st?.hunter,dist:st?.dist,hs:st?.hunterState,err:st?.err}), "luma", lum);
  await p.screenshot({ path: shot(`${String(i).padStart(2, '0')}_leg`) });
  if (st?.dist != null && st.dist < 8) { console.log('HUNTER NEAR'); break; }
  if (i % 3 === 0) await look(0.9);
}
console.log('final', JSON.stringify(await state()));
await p.screenshot({ path: shot('99_final') });
await b.close();
console.log('done');
