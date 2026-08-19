/**
 * Visual check for furn.smash lighting / rug-flat / scale / mesh avatar.
 *   node harness/playtest.mjs --view furn.smash --script harness/_furn-smash-look.mjs --port 5334 --q "quality=medium"
 */
import { mkdirSync } from 'fs';
import { join } from 'path';

const OUT = join('harness', 'out', 'furn-smash-look');
mkdirSync(OUT, { recursive: true });

export default async function run({ page, note, pass, fail, waitFor }) {
  await waitFor?.(1200);
  const boot = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    const fps = e?.room?.furnProps ?? [];
    const dim = (id) => {
      const fp = fps.find((f) => f.id === id);
      if (!fp?.box) return null;
      const mesh = fp.mesh?.userData?.meshDim ?? null;
      return {
        w: +(fp.box.max.x - fp.box.min.x).toFixed(3),
        h: +(fp.box.max.y - fp.box.min.y).toFixed(3),
        d: +(fp.box.max.z - fp.box.min.z).toFixed(3),
        y0: +fp.box.min.y.toFixed(3),
        mesh,
      };
    };
    return {
      avatar: !!e?.player?.avatar,
      clip: e?.player?.avatar?.clip ?? null,
      placed: e?.room?.placed,
      rug: dim('smash.rug-circle'),
      chair: dim('smash.chair'),
      fireplace: dim('smash.fireplace'),
      bg: e?.scene?.background?.getHex?.() ?? null,
    };
  });
  note(`boot ${JSON.stringify(boot)}`);
  if (boot.avatar) pass('mesh avatar', String(boot.clip));
  else fail('mesh avatar', 'missing');
  if (boot.rug && boot.rug.mesh && boot.rug.mesh.h <= 0.2 && boot.rug.mesh.w >= 2.2) {
    pass('rug lies flat', JSON.stringify(boot.rug));
  } else fail('rug lies flat', JSON.stringify(boot.rug));
  if (boot.chair && boot.chair.mesh && boot.chair.mesh.h >= 1.4) pass('chair human scale', JSON.stringify(boot.chair));
  else fail('chair human scale', JSON.stringify(boot.chair));
  if (boot.fireplace && boot.fireplace.mesh && boot.fireplace.mesh.h >= 3.0) {
    pass('fireplace taller than robot', JSON.stringify(boot.fireplace));
  } else fail('fireplace taller than robot', JSON.stringify(boot.fireplace));

  async function parkAt(id, pitch) {
    await page.evaluate(({ id, pitch }) => {
      const e = window.__rrr.engine;
      const fp = e.room.furnProps.find((f) => f.id === id);
      const mid = {
        x: (fp.box.min.x + fp.box.max.x) / 2,
        y: (fp.box.min.y + fp.box.max.y) / 2,
        z: (fp.box.min.z + fp.box.max.z) / 2,
      };
      const p = e.player;
      const toward = mid.z >= 0 ? -1 : 1;
      const front = toward < 0 ? fp.box.min.z : fp.box.max.z;
      p.pos.set(mid.x, 0, front + toward * 2.1);
      p.vel.set(0, 0, 0);
      const yaw = mid.z >= 0 ? 0 : Math.PI;
      p.facing = yaw; p.aimYaw = yaw; p.aimPitch = pitch;
      if (e.cam) {
        e.cam.yaw = yaw;
        e.cam.pitch = pitch;
        e.cam._first = true;
      }
    }, { id, pitch });
    await waitFor?.(500);
  }

  await page.screenshot({ path: join(OUT, 'arrive.png'), fullPage: false });
  await parkAt('smash.rug-circle', -0.55);
  await page.screenshot({ path: join(OUT, 'rug.png'), fullPage: false });
  await parkAt('smash.chair', -0.12);
  await page.screenshot({ path: join(OUT, 'chair.png'), fullPage: false });
  await parkAt('smash.cam-wall', 0.35);
  await page.screenshot({ path: join(OUT, 'cam-wall.png'), fullPage: false });
  await parkAt('smash.cam-tripod', 0.12);
  await page.screenshot({ path: join(OUT, 'cam-tripod.png'), fullPage: false });
  note(`shots → ${OUT}`);
}
