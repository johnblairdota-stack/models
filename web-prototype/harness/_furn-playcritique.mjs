/**
 * rrr-playcritique session — destructive furniture feel.
 * Drive furndemo, smash chairs / crates / desk / camera, screenshot, dump notes.
 *
 *   node harness/playtest.mjs --view game.play --script harness/_furn-playcritique.mjs \
 *        --port 5295 --q "seed=s4&furndemo=1&quality=medium"
 */
import { mkdirSync } from 'fs';
import { join } from 'path';

const OUT = join('harness', 'out', 'furn-playcritique');
mkdirSync(OUT, { recursive: true });

async function shot(page, name) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  return path;
}

async function snap(page) {
  return page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e?.player) return null;
    const p = e.player;
    const furn = (e.room?.furnProps ?? []).map((f) => ({
      id: f.id, kind: f.kind, stage: f.stage, shattered: !!f.isShattered,
      parts: f.parts?.map((pt) => ({ id: pt.id, role: pt.role, alive: pt.alive })),
    }));
    return {
      pos: { x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2) },
      aimPitch: +p.aimPitch.toFixed(3),
      facing: +p.facing.toFixed(3),
      sledge: { owned: !!p.sledge?.owned, equipped: !!p.sledge?.equipped },
      lastHit: p._lastSledgeHit ? {
        hadFurn: !!p._lastSledgeHit.hadFurn,
        furnId: p._lastSledgeHit.furn?.id ?? p._lastSledgeHit.furnId,
        partId: p._lastSledgeHit.partId ?? p._lastSledgeHit.res?.partId,
        stage: p._lastSledgeHit.furn?.stage,
        cladding: !!p._lastSledgeHit.res?.cladding,
      } : null,
      furnAlive: furn.filter((f) => !f.shattered).length,
      furnDead: furn.filter((f) => f.shattered).length,
      near: furn.filter((f) => !f.shattered).slice(0, 12),
      cams: (e.__rrrCams ?? []).length,
      demo: !!e.__furnDemo,
    };
  });
}

async function parkNear(page, furnIdOrKind, { behind = 1.5, pitch = -0.12 } = {}) {
  return page.evaluate(({ key, behind, pitch }) => {
    const e = window.__rrr.engine;
    const fp = e.room.furnProps.find((f) => f.id === key)
      ?? e.room.furnProps.find((f) => f.kind === key && !f.isShattered);
    if (!fp) return { ok: false, why: 'missing ' + key };
    const mid = {
      x: (fp.box.min.x + fp.box.max.x) / 2,
      y: (fp.box.min.y + fp.box.max.y) / 2,
      z: (fp.box.min.z + fp.box.max.z) / 2,
    };
    const p = e.player;
    p.pos.set(mid.x, e.room.floorY, mid.z + behind);
    p.vel.set(0, 0, 0);
    p.facing = Math.PI; p.aimYaw = Math.PI; p.aimPitch = pitch;
    if (e.cam) e.cam.yaw = Math.PI;
    p.sledge.owned = true; p.sledge.equip();
    return { ok: true, id: fp.id, kind: fp.kind, mid };
  }, { key: furnIdOrKind, behind, pitch });
}

async function swing(page, n = 4) {
  const hits = [];
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => {
      const p = window.__rrr.engine.player;
      p._lastSledgeHit = null;
      p._resolveSledgeHit({ at: p.eye, dir: p.aimDir });
    });
    // Also fire a real mouse click for anim/audio path if any
    await page.mouse.down(); await page.waitForTimeout(40); await page.mouse.up();
    await page.waitForTimeout(180);
    const s = await snap(page);
    hits.push(s?.lastHit ?? null);
    if (s?.near?.every((f) => f.shattered)) break;
  }
  return hits;
}

export default async function furnPlaycritique({ page, note, pass, fail, skip, shot: harnessShot }) {
  await page.mouse.move(640, 360);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(800);

  const boot = await snap(page);
  note(`boot: ${JSON.stringify(boot)}`);
  if (!boot) return fail('boot', 'no engine');
  if (!boot.demo) note('WARN: furndemo not armed — will park manually');

  await shot(page, '01-arrive-circle');
  note('LOOK 01 — parked at chair circle with sledge?');

  // --- Chair: swing until shatter, watch stages ---
  let park = await parkNear(page, 'ballroom.chair.0', { behind: 1.55, pitch: -0.08 });
  note(`park chair: ${JSON.stringify(park)}`);
  await shot(page, '02-aim-chair');
  const chairHits = await swing(page, 6);
  note(`chair hits: ${JSON.stringify(chairHits)}`);
  await shot(page, '03-after-chair');
  const afterChair = await snap(page);
  note(`after chair: alive=${afterChair?.furnAlive} dead=${afterChair?.furnDead}`);

  // Walk feeling — WASD strafe around debris
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(350);
  await page.keyboard.up('KeyA');
  await shot(page, '04-walk-debris');

  // --- Crate stack ---
  park = await parkNear(page, 'ballroom.crate.0', { behind: 1.8, pitch: -0.15 });
  note(`park crate: ${JSON.stringify(park)}`);
  await shot(page, '05-aim-crate');
  const crateHits = await swing(page, 8);
  note(`crate hits: ${JSON.stringify(crateHits)}`);
  await shot(page, '06-after-crate');

  // --- Desk in study ---
  park = await parkNear(page, 'study_w.desk.0', { behind: 1.6, pitch: -0.1 });
  note(`park desk: ${JSON.stringify(park)}`);
  await shot(page, '07-aim-desk');
  const deskHits = await swing(page, 6);
  note(`desk hits: ${JSON.stringify(deskHits)}`);
  await shot(page, '08-after-desk');

  // --- Fireplace cladding ---
  park = await parkNear(page, 'fireplace', { behind: 2.0, pitch: -0.05 });
  note(`park fireplace: ${JSON.stringify(park)}`);
  await shot(page, '09-aim-fireplace');
  const fpHits = await swing(page, 5);
  note(`fireplace hits: ${JSON.stringify(fpHits)}`);
  await shot(page, '10-after-fireplace');

  // --- Tripod camera ---
  park = await parkNear(page, 'cam.ballroom.tripod', { behind: 1.5, pitch: -0.25 });
  note(`park camera: ${JSON.stringify(park)}`);
  await shot(page, '11-aim-camera');
  const camHits = await swing(page, 5);
  note(`camera hits: ${JSON.stringify(camHits)}`);
  await shot(page, '12-after-camera');

  // --- Wall camera (high) — expect miss / awkward ---
  park = await parkNear(page, 'cam.gallery.w', { behind: 1.2, pitch: -0.55 });
  note(`park wallcam: ${JSON.stringify(park)}`);
  await shot(page, '13-aim-wallcam');
  const wallCamHits = await swing(page, 4);
  note(`wallcam hits: ${JSON.stringify(wallCamHits)}`);
  await shot(page, '14-after-wallcam');

  // --- Painting ---
  park = await parkNear(page, 'painting', { behind: 1.3, pitch: -0.2 });
  note(`park painting: ${JSON.stringify(park)}`);
  await shot(page, '15-aim-painting');
  const paintHits = await swing(page, 4);
  note(`painting hits: ${JSON.stringify(paintHits)}`);
  await shot(page, '16-after-painting');

  const end = await snap(page);
  note(`end state: ${JSON.stringify({
    alive: end?.furnAlive, dead: end?.furnDead, cams: end?.cams,
  })}`);

  // Feel gates are observational — pass = session completed with evidence
  const chairConnected = chairHits.some((h) => h?.hadFurn);
  const crateConnected = crateHits.some((h) => h?.hadFurn);
  const deskConnected = deskHits.some((h) => h?.hadFurn);
  const camConnected = camHits.some((h) => h?.hadFurn);
  const wallMiss = wallCamHits.every((h) => !h?.hadFurn);

  chairConnected ? pass('played: chair connects', JSON.stringify(chairHits.filter(Boolean).slice(0, 3)))
    : fail('played: chair connects', JSON.stringify(chairHits));
  crateConnected ? pass('played: crate connects', 'hadFurn')
    : fail('played: crate connects', JSON.stringify(crateHits));
  deskConnected ? pass('played: desk connects', 'hadFurn')
    : fail('played: desk connects', JSON.stringify(deskHits));
  camConnected ? pass('played: tripod camera connects', 'hadFurn')
    : fail('played: tripod camera connects', JSON.stringify(camHits));
  wallMiss
    ? pass('played: wall camera hard to hit from floor aim', 'all misses — feel friction noted')
    : pass('played: wall camera reachable', JSON.stringify(wallCamHits.filter((h) => h?.hadFurn)));

  note(`shots in ${OUT}`);
  pass('playcritique session complete', `shots → ${OUT}`);
}
