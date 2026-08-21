/**
 * Playcritic instrument for ?view=furn.smash
 * Parks at each Meshy prop, programmatic sledge until shatter.
 * Motion beats vs refs/teardown/yt-*.png: leave (section leaving), wound (tumble), after (heap).
 *
 *   node harness/playtest.mjs --view furn.smash --script harness/evidence/_furn-smash-critic.mjs \
 *        --port 5365 --q "quality=medium"
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { FURN_SMASH_ASSETS } from '../../src/game/furn-catalog.js';

const OUT = join('harness', 'out', 'furn-smash-critic');
mkdirSync(OUT, { recursive: true });

async function shot(page, name) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  return path;
}

function debrisCensus(page) {
  return page.evaluate(() => {
    const d = window.__rrr?.engine?.debris;
    if (!d?.pools) return { live: 0, rest: 0 };
    let live = 0, rest = 0;
    for (const name of Object.keys(d.pools)) {
      const p = d.pools[name];
      for (let i = 0; i < (p.high ?? 0); i++) {
        if (!p.alive?.[i]) continue;
        live++;
        if (p.rest?.[i]) rest++;
      }
    }
    return { live, rest };
  });
}

async function parkSmash(page, id) {
  return page.evaluate((id) => {
    const e = window.__rrr.engine;
    const fp = e.room.furnProps.find((f) => f.id === `smash.${id}` && !f.isShattered)
      ?? e.room.furnProps.find((f) => f.id === `smash.${id}`);
    if (!fp?.box) return { ok: false, id };
    const box = fp.hitBox ?? fp.box;
    const mid = {
      x: (box.min.x + box.max.x) / 2,
      y: (box.min.y + box.max.y) / 2,
      z: (box.min.z + box.max.z) / 2,
    };
    const p = e.player;
    const towardAisle = mid.z >= 0 ? -1 : 1;
    const frontZ = towardAisle < 0 ? box.min.z : box.max.z;
    const hang = mid.y > 2.15;
    const thin = (box.max.y - box.min.y) < 0.4;
    const standoff = hang ? 0.9 : thin ? 0.45 : 1.55;
    // Camera pitch only goes +0.62 rad up. Hang the eye next to the lamp so the ray is level.
    const py = hang ? Math.max(0, mid.y - p.eyeHeight) : e.room.floorY;
    p.pos.set(mid.x, py, frontZ + towardAisle * standoff);
    if (!hang) e.room.collide?.(p.pos, 0.42);
    p.vel.set(0, 0, 0);
    const yaw = mid.z >= 0 ? 0 : Math.PI;
    const eyeY = p.pos.y + p.eyeHeight;
    const horiz = Math.hypot(mid.x - p.pos.x, mid.z - p.pos.z);
    const pitch = Math.max(-0.9, Math.min(0.6, Math.atan2(mid.y - eyeY, Math.max(horiz, 1e-4))));
    p.facing = yaw;
    p.aimYaw = yaw;
    p.aimPitch = pitch;
    if (e.cam) { e.cam.yaw = yaw; e.cam.pitch = pitch; }
    p.sledge.owned = true;
    p.sledge.equip?.();
    return { ok: true, id: fp.id, kind: fp.kind, stage: fp.stage, mid, hang, thin, py };
  }, id);
}

async function oneBlow(page) {
  return page.evaluate(() => {
    const p = window.__rrr.engine.player;
    p._lastSledgeHit = null;
    p.sledge.owned = true;
    p.sledge.equip?.();
    p._resolveSledgeHit({ at: p.eye, dir: p.aimDir });
    const h = p._lastSledgeHit;
    return h ? {
      hadFurn: !!h.hadFurn,
      furnId: h.furnId,
      stage: h.res?.stage,
      shattered: !!h.res?.brokeThrough,
      removed: h.res?.removed ?? 0,
      islands: h.res?.islands ?? 0,
    } : null;
  });
}

export default async function run({ page, note, pass, fail, waitFor }) {
  await waitFor?.(800);
  const boot = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    const fps = e?.room?.furnProps ?? [];
    return {
      placed: e?.room?.placed ?? fps.length,
      missing: e?.room?.missing ?? [],
      ids: fps.map((f) => f.id),
      sledge: !!e?.player?.sledge?.owned,
      avatar: !!e?.player?.avatar,
      clip: e?.player?.avatar?.clip ?? null,
    };
  });
  note(`boot: ${JSON.stringify(boot)}`);
  if (!boot?.ids) return fail('boot', 'no engine.room');
  pass('evidence: smash lab boots', `${boot.placed} placed`);
  if (boot.sledge) pass('evidence: sledge equipped', 'true');
  else fail('evidence: sledge equipped', 'false');
  if (boot.avatar) pass('evidence: mesh avatar', String(boot.clip ?? 'on'));
  else fail('evidence: mesh avatar', 'procedural fallback');
  if (boot.missing?.length) note(`missing GLBs: ${boot.missing.join(',')}`);

  const present = FURN_SMASH_ASSETS.map((a) => a.id).filter(
    (id) => boot.ids.includes(`smash.${id}`),
  );
  if (present.length >= 16) pass('evidence: lineup has most props', String(present.length));
  else fail('evidence: lineup has most props', `${present.length} of 24`);

  await shot(page, 's00-arrive');
  const per = [];

  for (const id of present) {
    const park = await parkSmash(page, id);
    note(`park ${id}: ${JSON.stringify(park)}`);
    await shot(page, `s-${id}-aim`);
    const before = await debrisCensus(page);
    const hits = [];
    let wound = false;
    for (let i = 0; i < 8; i++) {
      await parkSmash(page, id);
      const rec = await oneBlow(page);
      hits.push(rec);
      await page.waitForTimeout(220);
      if (rec?.hadFurn && !wound) {
        wound = true;
        await page.waitForTimeout(160);
        await shot(page, `s-${id}-leave`);
        await page.waitForTimeout(380);
        await shot(page, `s-${id}-wound`);
      }
      if (rec?.shattered) break;
    }
    await page.waitForTimeout(1100);
    const after = await debrisCensus(page);
    await page.evaluate((id) => {
      const e = window.__rrr.engine;
      const fp = e.room.furnProps.find((f) => f.id === `smash.${id}`);
      if (!fp?.box) return;
      const mid = {
        x: (fp.box.min.x + fp.box.max.x) / 2,
        y: (fp.box.min.y + fp.box.max.y) / 2,
        z: (fp.box.min.z + fp.box.max.z) / 2,
      };
      const p = e.player;
      const towardAisle = mid.z >= 0 ? -1 : 1;
      const frontZ = towardAisle < 0 ? fp.box.min.z : fp.box.max.z;
      p.pos.set(mid.x, e.room.floorY, frontZ + towardAisle * 2.4);
      e.room.collide?.(p.pos, 0.42);
      const yaw = mid.z >= 0 ? 0 : Math.PI;
      const eyeY = p.pos.y + p.eyeHeight;
      const horiz = Math.hypot(mid.x - p.pos.x, mid.z - p.pos.z);
      const pitch = Math.atan2(mid.y - eyeY - 0.15, Math.max(horiz, 1e-4));
      p.facing = yaw; p.aimYaw = yaw; p.aimPitch = pitch;
      if (e.cam) { e.cam.yaw = yaw; e.cam.pitch = pitch; e.cam._first = true; }
    }, id);
    await page.waitForTimeout(250);
    await shot(page, `s-${id}-after`);
    const shattered = hits.some((h) => h?.shattered);
    const connects = hits.filter((h) => h?.hadFurn).length;
    per.push({
      id, parkOk: !!park?.ok, connects, blows: hits.length, shattered,
      debrisBefore: before, debrisAfter: after, hits,
    });
    note(`${id}: blows=${hits.length} connects=${connects} shatter=${shattered} islands=${hits.reduce((s, h) => s + (h?.islands ?? 0), 0)} debrisRest ${before.rest}→${after.rest}`);
  }

  const shatteredN = per.filter((r) => r.shattered).length;
  const connectN = per.filter((r) => r.connects > 0).length;
  const sectionN = per.filter((r) => r.hits.some((h) => (h?.removed ?? 0) > 0 || h?.shattered)).length;
  if (connectN === present.length) pass('evidence: every present prop connects', String(connectN));
  else fail('evidence: every present prop connects', `${connectN}/${present.length}`);
  if (sectionN === present.length) pass('evidence: every present prop loses a section', String(sectionN));
  else fail('evidence: every present prop loses a section', `${sectionN}/${present.length}`);
  note(`full shatter ${shatteredN}/${present.length} (Teardown bar is section, not vanish)`);

  writeFileSync(join(OUT, 'report.json'), JSON.stringify({
    bar: 'Teardown YouTube clips (refs/teardown/yt-*.png), not wiki stills',
    piece: 'furn.smash standalone lineup',
    boot, per,
  }, null, 2));
  note(`report → ${OUT}`);
}
