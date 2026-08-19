/**
 * Feel critic — furniture / prop destruction vs Teardown bar.
 * Docs: docs/design/teardown-reference.md, docs/slices/task-furn-feel.md
 *
 * Verdict bands (play, not board art score):
 *   WOWED — Teardown-class: every connect readable, debris has structure, wound before vanish
 *   PASS  — shippable feel, no NEW hates this round
 *   WEAK / REJECT — still wrong to play
 *
 *   node harness/playtest.mjs --view game.play --script harness/_furn-feel-critic.mjs \
 *        --port 5301 --q "seed=s4&furndemo=1&quality=medium"
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const OUT = join('harness', 'out', 'furn-feel-critic');
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
    const furn = e.room?.furnProps ?? [];
    return {
      pos: { x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2) },
      lastHit: p._lastSledgeHit ? {
        hadFurn: !!p._lastSledgeHit.hadFurn,
        furnId: p._lastSledgeHit.furnId,
        partId: p._lastSledgeHit.partId,
        partBroke: !!p._lastSledgeHit.res?.partBroke,
        stage: p._lastSledgeHit.res?.stage,
        shattered: !!p._lastSledgeHit.res?.brokeThrough,
      } : null,
      alive: furn.filter((f) => !f.isShattered).length,
      dead: furn.filter((f) => f.isShattered).length,
      demo: !!e.__furnDemo,
      demoInChair: (() => {
        const fp = furn.find((f) => String(f.id).endsWith('.chair.0'));
        if (!fp?.box) return null;
        const q = p.pos;
        return q.x > fp.box.min.x && q.x < fp.box.max.x
          && q.z > fp.box.min.z && q.z < fp.box.max.z;
      })(),
    };
  });
}

async function parkNear(page, key, o = {}) {
  return page.evaluate(({ key, behind, pitch }) => {
    const e = window.__rrr.engine;
    const fp = e.room.furnProps.find((f) => f.id === key)
      ?? e.room.furnProps.find((f) => f.kind === key && !f.isShattered);
    if (!fp) return { ok: false, why: key };
    const mid = {
      x: (fp.box.min.x + fp.box.max.x) / 2,
      y: (fp.box.min.y + fp.box.max.y) / 2,
      z: (fp.box.min.z + fp.box.max.z) / 2,
    };
    const p = e.player;
    p.pos.set(mid.x, e.room.floorY, mid.z + behind);
    e.room.collide?.(p.pos, 0.42);
    e.room.collide?.(p.pos, 0.42);
    p.vel.set(0, 0, 0);
    p.facing = Math.PI; p.aimYaw = Math.PI; p.aimPitch = pitch;
    if (e.cam) e.cam.yaw = Math.PI;
    p.sledge.owned = true; p.sledge.equip();
    return { ok: true, id: fp.id, kind: fp.kind, mid, stage: fp.stage };
  }, { key, behind: o.behind ?? 1.5, pitch: o.pitch ?? -0.12 });
}

async function swingBurst(page, n = 5, settleMs = 0, reAimFn = null) {
  const hits = [];
  for (let i = 0; i < n; i++) {
    if (typeof reAimFn === 'function') await reAimFn();
    // Programmatic resolve only — mouse swings also fire contact later and overwrite
    // `_lastSledgeHit` mid-burst (SWING_DUR 0.70), which falsely reads as wall-cam flakiness.
    await page.evaluate(() => {
      const p = window.__rrr.engine.player;
      p._lastSledgeHit = null;
      p.sledge.owned = true;
      p.sledge.equip?.();
      p._resolveSledgeHit({ at: p.eye, dir: p.aimDir });
    });
    await page.waitForTimeout(120);
    const s = await snap(page);
    hits.push(s?.lastHit ?? null);
  }
  if (settleMs) await page.waitForTimeout(settleMs);
  return hits;
}

export default async function furnFeelCritic({ page, note, pass, fail, skip }) {
  await page.mouse.move(640, 360);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(600);

  const boot = await snap(page);
  note(`boot: ${JSON.stringify(boot)}`);
  if (!boot) return fail('boot', 'no engine');

  await shot(page, 'r1-01-arrive');
  note('TEARDOWN BAR (project docs): connect every swing; wound before vanish; debris has structure; heap stays');

  // --- Chair: expect wound hold + flash + structured debris ---
  let park = await parkNear(page, 'ballroom.chair.1', { behind: 1.55, pitch: -0.1 });
  note(`park chair: ${JSON.stringify(park)}`);
  await shot(page, 'r1-02-aim-chair');
  const chairHits = await swingBurst(page, 5, 1200);
  note(`chair hits: ${JSON.stringify(chairHits)}`);
  // Step back so the heap is not under the robot toes.
  await page.evaluate(() => {
    const e = window.__rrr.engine;
    const p = e.player;
    const yaw = p.facing ?? 0;
    p.pos.x -= Math.sin(yaw) * 1.1;
    p.pos.z -= Math.cos(yaw) * 1.1;
    e.room.collide?.(p.pos, 0.42);
    p.aimPitch = -0.42;
  });
  await page.waitForTimeout(200);
  await shot(page, 'r1-03-after-chair');
  const afterChair = await snap(page);

  // --- Crate ---
  park = await parkNear(page, 'ballroom.crate.0', { behind: 1.7, pitch: -0.18 });
  note(`park crate: ${JSON.stringify(park)}`);
  await shot(page, 'r1-04-aim-crate');
  const crateHits = await swingBurst(page, 6, 500);
  note(`crate hits: ${JSON.stringify(crateHits)}`);
  await shot(page, 'r1-05-after-crate');

  // --- Wall camera (feel fix claim) ---
  const aimWallCam = async () => {
    await page.evaluate(() => {
      const e = window.__rrr.engine;
      const fp = e.room.furnProps.find((f) => f.id === 'cam.gallery.w' && !f.isShattered);
      if (!fp) return;
      const mid = {
        x: (fp.box.min.x + fp.box.max.x) / 2,
        y: (fp.box.min.y + fp.box.max.y) / 2,
        z: (fp.box.min.z + fp.box.max.z) / 2,
      };
      const p = e.player;
      p.pos.set(mid.x + 1.45, e.room.floorY, mid.z);
      e.room.collide?.(p.pos, 0.4);
      p.facing = -Math.PI / 2; p.aimYaw = -Math.PI / 2; p.aimPitch = -0.18;
      if (e.cam) e.cam.yaw = -Math.PI / 2;
      p.sledge.owned = true; p.sledge.equip();
    });
  };
  await aimWallCam();
  await shot(page, 'r1-06-aim-wallcam');
  const wallHits = await swingBurst(page, 4, 250, aimWallCam);
  note(`wallcam hits: ${JSON.stringify(wallHits)}`);
  const wallConnects = wallHits.filter((h) => h?.hadFurn).length;
  wallConnects >= 2
    ? pass('evidence: wall cam ≥2 connects', String(wallConnects))
    : fail('evidence: wall cam ≥2 connects', `connects=${wallConnects} · ${JSON.stringify(wallHits)}`);
  await shot(page, 'r1-07-after-wallcam');

  // --- Tripod tip — park on mesh, assert ballroom, mid-tip while held fallen ---
  const tripPark = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const fp = e.room.furnProps.find((f) => f.id === 'cam.ballroom.tripod' && !f.isShattered);
    if (!fp?.mesh || !fp.box) return { ok: false, why: 'no tripod' };
    const mid = {
      x: (fp.box.min.x + fp.box.max.x) / 2,
      y: (fp.box.min.y + fp.box.max.y) / 2,
      z: (fp.box.min.z + fp.box.max.z) / 2,
    };
    // Prefer mesh world matrix translation when present (AABB can be fatter than the prop).
    const m = fp.mesh.matrixWorld?.elements;
    if (m) { mid.x = m[12]; mid.y = m[13]; mid.z = m[14]; }
    const p = e.player;
    // ¾ view: offset in X so the tip isn't hidden behind the robot torso.
    p.pos.set(mid.x + 0.85, e.room.floorY, mid.z + 1.55);
    e.room.collide?.(p.pos, 0.35);
    e.room.collide?.(p.pos, 0.35);
    const yaw = Math.atan2(mid.x - p.pos.x, mid.z - p.pos.z);
    p.facing = yaw; p.aimYaw = yaw; p.aimPitch = -0.18;
    if (e.cam) e.cam.yaw = yaw;
    p.sledge.owned = true; p.sledge.equip();
    return {
      ok: true,
      spaceId: fp.spaceId,
      tipMount: fp.mount ?? fp.mesh?.userData?.mount,
      mid,
      pos: { x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2) },
    };
  });
  note(`tripod park: ${JSON.stringify(tripPark)}`);
  tripPark?.ok && tripPark.spaceId === 'ballroom'
    ? pass('evidence: tripod park in ballroom', tripPark.spaceId)
    : fail('evidence: tripod park in ballroom', JSON.stringify(tripPark));
  await page.waitForTimeout(200);
  await shot(page, 'r2-08-aim-tripod');
  const tripHits = [];
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => {
      const p = window.__rrr.engine.player;
      p._lastSledgeHit = null;
      p.sledge.owned = true;
      p.sledge.equip?.();
      p._resolveSledgeHit({ at: p.eye, dir: p.aimDir });
    });
    await page.waitForTimeout(120);
    const s = await snap(page);
    tripHits.push(s?.lastHit ?? null);
    if (s?.lastHit?.shattered) {
      await page.waitForTimeout(450);
      // Frame the tip: drop boom and look at the floor marker / prop.
      await page.evaluate(() => {
        const e = window.__rrr.engine;
        const fp = e.room.furnProps.find((f) => f.id === 'cam.ballroom.tripod');
        const floor = fp?.mesh?.userData?._tipFloor;
        const p = e.player;
        const tx = floor?.position?.x ?? ((fp.box.min.x + fp.box.max.x) / 2);
        const tz = floor?.position?.z ?? ((fp.box.min.z + fp.box.max.z) / 2);
        p.aimPitch = -0.55;
        if (e.cam) {
          e.cam.yaw = Math.atan2(tx - p.pos.x, tz - p.pos.z);
          if (e.cam.boomLen != null) e.cam.boomLen = 2.1;
          if (e.cam.pitch != null) e.cam.pitch = -0.45;
        }
      });
      await page.waitForTimeout(80);
      const tipRead = await page.evaluate(() => {
        const fp = window.__rrr.engine.room.furnProps.find((f) => f.id === 'cam.ballroom.tripod');
        const m = fp?.mesh;
        const floor = m?.userData?._tipFloor;
        if (!m) return null;
        return {
          visible: m.visible,
          tipping: !!fp._tipping,
          bar: !!m.userData._tipBar?.visible,
          floor: floor ? {
            vis: floor.visible,
            x: +floor.position.x.toFixed(2),
            y: +floor.position.y.toFixed(2),
            z: +floor.position.z.toFixed(2),
          } : null,
          rx: +m.rotation.x.toFixed(2),
        };
      });
      note(`tip mid state: ${JSON.stringify(tipRead)}`);
      await shot(page, 'r6-09-mid-tip');
      break;
    }
  }
  note(`tripod hits: ${JSON.stringify(tripHits)}`);
  await page.waitForTimeout(700);
  await shot(page, 'r2-09-after-tripod');

  // --- Desk: first hits should be desk, not chair ---
  park = await parkNear(page, 'study_w.desk.0', { behind: 1.7, pitch: -0.12 });
  await shot(page, 'r4-10-aim-desk');
  const deskHits = await swingBurst(page, 5, 200);
  note(`desk hits: ${JSON.stringify(deskHits)}`);
  await shot(page, 'r4-11-after-desk');
  const deskFirst = deskHits.find((h) => h?.hadFurn)?.furnId;
  deskFirst === 'study_w.desk.0'
    ? pass('evidence: desk wins first hit', deskFirst)
    : fail('evidence: desk wins first hit', `first=${deskFirst} · ${JSON.stringify(deskHits)}`);

  const end = await snap(page);
  note(`end: ${JSON.stringify(end)}`);

  // Observational gates (evidence for the written verdict, not the verdict itself)
  const chairOk = chairHits.some((h) => h?.hadFurn);
  const wallOk = wallHits.some((h) => h?.hadFurn);
  const tripOk = tripHits.some((h) => h?.hadFurn);
  const deskOk = deskHits.some((h) => h?.hadFurn);
  const spawnClear = boot.demoInChair === false || boot.demoInChair === null;

  chairOk ? pass('evidence: chair connects', '') : fail('evidence: chair connects', JSON.stringify(chairHits));
  wallOk ? pass('evidence: wall cam connects', '') : fail('evidence: wall cam connects', JSON.stringify(wallHits));
  tripOk ? pass('evidence: tripod connects', tripHits.find((h) => h?.furnId?.includes('cam.'))?.furnId ?? 'ok')
    : fail('evidence: tripod connects', JSON.stringify(tripHits));
  // Prefer actual camera id — mound steals were a false pass in r2
  const tripCam = tripHits.some((h) => h?.furnId === 'cam.ballroom.tripod');
  tripCam
    ? pass('evidence: tripod id is camera', 'cam.ballroom.tripod')
    : fail('evidence: tripod id is camera', JSON.stringify(tripHits.map((h) => h?.furnId)));
  deskOk ? pass('evidence: desk connects', '') : fail('evidence: desk connects', JSON.stringify(deskHits));
  spawnClear ? pass('evidence: furndemo not in chair', JSON.stringify(boot.demoInChair))
    : fail('evidence: furndemo not in chair', 'inside chair.0');

  const report = {
    bar: 'Teardown (docs/design/teardown-reference.md + disconnection.md)',
    piece: 'game.play furniture destruction feel',
    round: 2,
    claims_to_verify: [
      'part break pays debris.chunk (large timber plates)',
      'tripod fat AABB connects',
      'desk chair offset reduces steal',
    ],
    shots: OUT,
    evidence: { chairHits, crateHits, wallHits, tripHits, deskHits, boot, end },
  };
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  note(`report → ${join(OUT, 'report.json')}`);
  pass('session complete — critic files verdict in chat', OUT);
}
