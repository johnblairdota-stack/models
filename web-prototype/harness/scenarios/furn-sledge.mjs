/**
 * Phase A+B+C gate — chairs, desks, and smashable dress (urns / paintings / fireplace).
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/furn-sledge.mjs \
 *        --port 5288 --q "seed=s4" --shots
 *
 * Default party/gen/estate dress is the 24 `rrr_prop_*` catalog GLBs (kit OFF).
 * This census still counts GeoBin kit kinds — pass `?kitdress=1` when you want
 * the urn / candelabra / kit-camera numbers. F1 (seating lock) does not need it.
 *
 * Phase A: F1–F5, W1 · Phase B: B1–B3 · Phase C: C1–C5 census
 */
export default async function furnSledge({ page, note, pass, fail, skip, shot }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(500);

  const census = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e?.room) return null;
    const furn = e.room.furnProps ?? [];
    const circle = furn.filter((f) => String(f.id).includes('ballroom.chair'));
    const desks = furn.filter((f) => f.kind === 'desk');
    const consoles = furn.filter((f) => f.kind === 'console');
    const crates = furn.filter((f) => f.kind === 'crate');
    const byKind = (k) => furn.filter((f) => f.kind === k).length;
    return {
      furn: furn.length,
      circle: circle.length,
      desks: desks.length,
      deskIds: desks.map((d) => d.id),
      consoles: consoles.length,
      crates: crates.length,
      urns: byKind('urn'),
      candelabra: byKind('candelabra'),
      paintings: byKind('painting'),
      fireplaces: byKind('fireplace'),
      boarded: byKind('boarded'),
      giltbox: byKind('giltbox'),
      cameras: byKind('camera'),
      camMeta: e.__rrrCams?.length ?? 0,
      trestles: byKind('trestle'),
      benches: byKind('bench'),
      pews: byKind('pew'),
      mounds: byKind('mound'),
      serviceFill: furn.filter((f) => f.spaceId === 'service').length,
      chapelFill: furn.filter((f) => f.spaceId === 'chapel').length,
      dress: e.__furnDress
        ? {
          studies: e.__furnDress.studies,
          ballroom: e.__furnDress.ballroom,
          gallery: e.__furnDress.gallery,
          service: e.__furnDress.service,
          chapel: e.__furnDress.chapel,
          cameras: e.__furnDress.cameras,
          counts: e.__furnDress.counts,
        }
        : null,
      circleMeta: e.__chairCircle ?? null,
      estate: !!e.room.estate?.ballroom,
      study: !!e.room.estate?.study,
      gallery: !!e.room.estate?.order,
      furnDemo: !!e.__furnDemo,
      demoPos: e.__furnDemo ? { x: +e.player.pos.x.toFixed(2), z: +e.player.pos.z.toFixed(2) } : null,
      demoInChair0: (() => {
        if (!e.__furnDemo) return null;
        const fp = furn.find((f) => String(f.id).endsWith('.chair.0'));
        if (!fp?.box) return null;
        const p = e.player.pos;
        return p.x > fp.box.min.x && p.x < fp.box.max.x
          && p.z > fp.box.min.z && p.z < fp.box.max.z;
      })(),
    };
  });
  note(`census: ${JSON.stringify(census)}`);
  if (!census) return fail('boot', 'no engine.room');
  if (!census.estate) return skip('estate ballroom', 'room.estate.ballroom is off — need ?estate=port');
  const lockCount = census.circleMeta?.count;
  (census.circle >= 1 && census.circle === lockCount && census.circleMeta?.deferred && !census.circleMeta?.baked)
    ? pass('F1 ballroom chairs from seating lock', `${census.circle} · ${JSON.stringify(census.circleMeta)}`)
    : fail('F1 ballroom chairs from seating lock', JSON.stringify(census));

  if (census.study) {
    census.desks >= 2
      ? pass('B1 each study has a desk', `${census.desks} · ${census.deskIds.join(',')}`)
      : fail('B1 each study has a desk', JSON.stringify(census));
  } else {
    skip('B1 each study has a desk', 'study arm off');
  }
  (census.consoles >= 2 && census.crates >= 1)
    ? pass('B2 ballroom consoles + crate', `consoles=${census.consoles} crates=${census.crates}`)
    : fail('B2 ballroom consoles + crate', JSON.stringify(census));

  census.urns >= 4
    ? pass('C1 urns registered', `urns=${census.urns}`)
    : fail('C1 urns registered', JSON.stringify(census));
  census.candelabra >= 2
    ? pass('C2 candelabra registered', `candelabra=${census.candelabra}`)
    : fail('C2 candelabra registered', JSON.stringify(census));
  if (census.gallery) {
    census.paintings >= 8
      ? pass('C3 gallery paintings registered', `paintings=${census.paintings}`)
      : fail('C3 gallery paintings registered', JSON.stringify(census));
    census.boarded >= 1
      ? pass('C5 boarded panel registered', `boarded=${census.boarded}`)
      : fail('C5 boarded panel registered', JSON.stringify(census));
  } else {
    skip('C3 gallery paintings', 'gallery arm off');
    skip('C5 boarded panel', 'gallery arm off');
  }
  if (census.study) {
    census.fireplaces >= 1
      ? pass('C4 study fireplace registered', `fireplaces=${census.fireplaces}`)
      : fail('C4 study fireplace registered', JSON.stringify(census));
  } else {
    skip('C4 study fireplace', 'study arm off');
  }

  // ---- Fill catalog: cameras + empty rooms + density ----
  (census.cameras >= 12 && census.cameras <= 18 && census.camMeta === census.cameras)
    ? pass('D1 RRR cameras 12–18', `cameras=${census.cameras} meta=${census.camMeta}`)
    : fail('D1 RRR cameras 12–18', JSON.stringify({
      cameras: census.cameras, camMeta: census.camMeta, dress: census.dress,
    }));
  census.serviceFill >= 1
    ? pass('D2 service has loose fill', `n=${census.serviceFill}`)
    : fail('D2 service has loose fill', JSON.stringify(census));
  census.chapelFill >= 1
    ? pass('D3 chapel has loose fill', `n=${census.chapelFill}`)
    : fail('D3 chapel has loose fill', JSON.stringify(census));
  (census.trestles >= 1 && census.crates >= 2)
    ? pass('D4 ballroom/depot trestles+crates', `trestles=${census.trestles} crates=${census.crates}`)
    : fail('D4 ballroom/depot trestles+crates', JSON.stringify(census));
  (census.benches >= 1 && census.pews >= 1)
    ? pass('D5 gallery bench + chapel pew', `bench=${census.benches} pew=${census.pews}`)
    : fail('D5 gallery bench + chapel pew', JSON.stringify(census));

  // Smash one camera — prefer tripod (reachable), fall back to applyHit
  {
    const camSmash = await page.evaluate(() => {
      const e = window.__rrr.engine;
      const fp = e.room.furnProps.find((f) => f.id === 'cam.ballroom.tripod' && !f.isShattered)
        ?? e.room.furnProps.find((f) => f.kind === 'camera' && !f.isShattered);
      if (!fp) return { ok: false, why: 'no camera' };
      const mid = {
        x: (fp.box.min.x + fp.box.max.x) / 2,
        y: (fp.box.min.y + fp.box.max.y) / 2,
        z: (fp.box.min.z + fp.box.max.z) / 2,
      };
      const p = e.player;
      p.pos.set(mid.x, e.room.floorY, mid.z + 1.4);
      p.vel.set(0, 0, 0);
      p.facing = Math.PI; p.aimYaw = Math.PI;
      p.aimPitch = -0.2;
      if (e.cam) e.cam.yaw = Math.PI;
      p.sledge.owned = true; p.sledge.equip();
      const hits = [];
      for (let i = 0; i < 6; i++) {
        p._lastSledgeHit = null;
        p._resolveSledgeHit({ at: p.eye, dir: p.aimDir });
        hits.push({
          hadFurn: !!p._lastSledgeHit?.hadFurn,
          kind: p._lastSledgeHit?.furn?.kind,
          shattered: !!fp.isShattered,
        });
        if (fp.isShattered) break;
      }
      // Wall-mount aim is finicky; guarantee shatter via applyHit if ray missed.
      if (!fp.isShattered) {
        const pt = { x: mid.x, y: mid.y, z: mid.z };
        for (let i = 0; i < 4 && !fp.isShattered; i++) {
          fp.applyHit?.(pt, 1.0, { normal: { x: 0, y: 0, z: 1 } });
        }
        hits.push({ forced: true, shattered: !!fp.isShattered });
      }
      const sp = e.room.spaces.find((s) => s.id === fp.spaceId);
      const onList = sp?.colliders?.includes(fp.box) === true;
      const entry = (e.__rrrCams ?? []).find((c) => c.id === fp.id);
      return {
        ok: true, id: fp.id, shattered: !!fp.isShattered, onList,
        smashedFlag: !!entry?.smashed, hits,
      };
    });
    note(`camera smash: ${JSON.stringify(camSmash)}`);
    if (!camSmash?.ok) fail('D6 smash camera', JSON.stringify(camSmash));
    else {
      (camSmash.shattered && !camSmash.onList)
        ? pass('D6 smash camera drops collider', `${camSmash.id} smashedFlag=${camSmash.smashedFlag}`)
        : fail('D6 smash camera drops collider', JSON.stringify(camSmash));
    }
  }

  // D7 — wall camera hittable at play height (feel fix)
  {
    const wallCam = await page.evaluate(() => {
      const e = window.__rrr.engine;
      const fp = e.room.furnProps.find((f) => f.id === 'cam.gallery.w' && !f.isShattered);
      if (!fp) return { ok: false, why: 'no wall cam' };
      const mid = {
        x: (fp.box.min.x + fp.box.max.x) / 2,
        y: (fp.box.min.y + fp.box.max.y) / 2,
        z: (fp.box.min.z + fp.box.max.z) / 2,
      };
      const p = e.player;
      p.pos.set(mid.x + 1.3, e.room.floorY, mid.z);
      p.vel.set(0, 0, 0);
      p.facing = -Math.PI / 2; p.aimYaw = -Math.PI / 2;
      p.aimPitch = -0.35;
      if (e.cam) e.cam.yaw = -Math.PI / 2;
      p.sledge.owned = true; p.sledge.equip();
      const hits = [];
      for (let i = 0; i < 4; i++) {
        p._lastSledgeHit = null;
        p._resolveSledgeHit({ at: p.eye, dir: p.aimDir });
        hits.push({
          hadFurn: !!p._lastSledgeHit?.hadFurn,
          furnId: p._lastSledgeHit?.furnId,
        });
        if (hits[hits.length - 1].hadFurn) break;
      }
      return {
        ok: true,
        boxH: +(fp.box.max.y - fp.box.min.y).toFixed(2),
        boxMinY: +fp.box.min.y.toFixed(2),
        hits,
        connected: hits.some((h) => h.hadFurn),
      };
    });
    note(`wallcam: ${JSON.stringify(wallCam)}`);
    if (!wallCam?.ok) fail('D7 wall camera hittable', JSON.stringify(wallCam));
    else {
      (wallCam.connected && wallCam.boxMinY < 1.2)
        ? pass('D7 wall camera hittable', `minY=${wallCam.boxMinY} h=${wallCam.boxH}`)
        : fail('D7 wall camera hittable', JSON.stringify(wallCam));
    }
  }

  // D8 — furndemo spawn not inside chair.0 (snapshotted at boot, before later parks)
  {
    if (!census.furnDemo) skip('D8 furndemo spawn clear of chair', 'furndemo off');
    else {
      census.demoInChair0 === false
        ? pass('D8 furndemo spawn clear of chair', JSON.stringify(census.demoPos))
        : fail('D8 furndemo spawn clear of chair', JSON.stringify({
          pos: census.demoPos, inside: census.demoInChair0,
        }));
    }
  }

  // ---- F2: collider blocks — place body at chair centre; collide must push out
  const block = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const fp = e.room.furnProps.find((f) => String(f.id).includes('ballroom.chair') && !f.isShattered);
    if (!fp) return { ok: false, why: 'no chair' };
    const c = fp.box.getCenter(e.player.pos.clone());
    const at = e.player.pos.clone().set(c.x, e.room.floorY, c.z);
    const before = { x: at.x, z: at.z };
    const out = e.room.collide(at, 0.35);
    const moved = Math.hypot(out.x - before.x, out.z - before.z);
    const sp = e.room.spaces.find((s) => s.id === fp.spaceId);
    // Parted chairs register part AABBs, not the union box.
    const onList = fp.parts?.length
      ? fp.parts.some((p) => p.alive && sp?.colliders?.includes(p.box))
      : sp?.colliders?.includes(fp.box) === true;
    return { ok: true, moved: +moved.toFixed(3), onList, id: fp.id, stage: fp.stage };
  });
  note(`block: ${JSON.stringify(block)}`);
  if (!block?.ok) fail('F2 chair collider blocks the body', JSON.stringify(block));
  else if (block.onList && block.moved > 0.05) {
    pass('F2 chair collider blocks the body', `pushed ${block.moved} m`);
  } else {
    fail('F2 chair collider blocks the body', JSON.stringify(block));
  }

  // ---- F3 / F5: stand WITHIN sledge reach; retarget each blow at an alive part
  const smash = await page.evaluate(async () => {
    const e = window.__rrr.engine;
    const p = e.player;
    const fp = e.room.furnProps.find((f) => String(f.id).endsWith('.chair.0'))
      ?? e.room.furnProps.find((f) => f.kind === 'chair');
    if (!fp) return { ok: false, why: 'no chair.0' };
    const sp = e.room.spaces.find((s) => s.id === fp.spaceId);
    const stand = 1.15;
    const aimAtPart = () => {
      const alive = (fp.parts ?? []).filter((pt) => pt.alive && pt.box);
      const target = alive.find((pt) => pt.role === 'seat')
        ?? alive.find((pt) => pt.role === 'leg')
        ?? alive[0];
      const c = (target?.box ?? fp.box).getCenter(p.pos.clone());
      const dx = c.x - sp.cx, dz = c.z - sp.cz;
      const len = Math.hypot(dx, dz) || 1;
      const ux = dx / len, uz = dz / len;
      p.pos.set(c.x - ux * stand, e.room.floorY, c.z - uz * stand);
      p.vel.set(0, 0, 0);
      const yaw2 = Math.atan2(ux, uz);
      p.aimYaw = yaw2; p.facing = yaw2;
      // Seat/legs sit lower than the back crest.
      p.aimPitch = target?.role === 'back' ? 0.05 : -0.72;
      if (e.cam) e.cam.yaw = yaw2;
      return target?.id ?? null;
    };

    p.sledge.owned = true; p.sledge.equip();
    p.aimDecoupled = false;
    aimAtPart();
    const probe = p._swingCast();
    const hits = [];
    for (let i = 0; i < 20; i++) {
      const aimed = aimAtPart();
      p._lastSledgeHit = null;
      p._resolveSledgeHit({ at: p.eye, dir: p.aimDir });
      hits.push({
        hadFurn: !!p._lastSledgeHit?.hadFurn,
        hadPanel: !!p._lastSledgeHit?.hadPanel,
        furnId: p._lastSledgeHit?.furnId ?? null,
        partId: p._lastSledgeHit?.partId ?? aimed,
        stage: fp.stage,
        shattered: fp.isShattered,
        removed: p._lastSledgeHit?.res?.removed ?? 0,
        broke: !!p._lastSledgeHit?.res?.brokeThrough,
        partBroke: !!p._lastSledgeHit?.res?.partBroke,
      });
      if (fp.isShattered) break;
      if (fp._shatterScheduled) break;
    }
    // Wound-hold delay before cascade completes (~450 ms).
    if (fp._shatterScheduled && !fp.isShattered) {
      await new Promise((r) => setTimeout(r, 520));
    }
    return {
      ok: true, id: fp.id, stage: fp.stage, shattered: fp.isShattered,
      dropped: !!fp._colDropped, hits,
      probeFurn: !!probe.furn, probeDist: +(probe.distance ?? 0).toFixed(3),
      stand: { x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2) },
      wallUntouched: hits.every((h) => !h.hadPanel || h.hadFurn),
    };
  });
  note(`smash: ${JSON.stringify(smash)}`);
  if (!smash?.ok) fail('F3 smash chair', JSON.stringify(smash));
  else {
    smash.shattered
      ? pass('F3 sledge blows shatter a chair', `stage=${smash.stage} hits=${smash.hits.length} probe=${smash.probeFurn}@${smash.probeDist}`)
      : fail('F3 sledge blows shatter a chair', JSON.stringify(smash));
    smash.hits.some((h) => h.hadFurn)
      ? pass('F3 blows reported hadFurn', smash.hits.map((h) => h.furnId).filter(Boolean).join(','))
      : fail('F3 blows reported hadFurn', JSON.stringify(smash.hits));
    // Local smash: a part should break before the whole chair cascades (unless seat is hit first).
    const partBeforeFull = smash.hits.findIndex((h) => h.partBroke);
    const fullAt = smash.hits.findIndex((h) => h.shattered);
    (partBeforeFull >= 0 && (fullAt < 0 || partBeforeFull < fullAt || smash.hits.some((h) => h.partId)))
      ? pass('L1 chair reports part-local hits', `partId=${smash.hits.map((h) => h.partId).filter(Boolean).join(',')}`)
      : fail('L1 chair reports part-local hits', JSON.stringify(smash.hits));
    smash.wallUntouched
      ? pass('F5 smashing the chair did not applyHit a wall alone', 'ok')
      : fail('F5 smashing the chair did not applyHit a wall alone', JSON.stringify(smash.hits));
  }
  await shot?.('furn-shattered');

  // ---- F4: collider gone
  const open = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const fp = e.room.furnProps.find((f) => f.isShattered)
      ?? e.room.furnProps.find((f) => String(f.id).endsWith('.chair.0'));
    if (!fp) return { ok: false };
    const sp = e.room.spaces.find((s) => s.id === fp.spaceId);
    const onList = fp.parts?.length
      ? fp.parts.some((p) => sp?.colliders?.includes(p.box))
      : sp?.colliders?.includes(fp.box) === true;
    const c = fp.box.getCenter(e.player.pos.clone());
    const at = e.player.pos.clone().set(c.x, e.room.floorY, c.z);
    const before = { x: at.x, z: at.z };
    const out = e.room.collide(at, 0.35);
    const moved = Math.hypot(out.x - before.x, out.z - before.z);
    return {
      ok: true, onList, dropped: !!fp._colDropped, shattered: fp.isShattered,
      moved: +moved.toFixed(3),
    };
  });
  note(`open: ${JSON.stringify(open)}`);
  if (open?.ok && open.shattered && !open.onList && open.dropped && open.moved < 0.05) {
    pass('F4 shattered chair drops its collider', JSON.stringify(open));
  } else {
    fail('F4 shattered chair drops its collider', JSON.stringify(open));
  }

  // ---- W1 control: clear _furn tags so castRay cannot name furniture
  const ctrl = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const p = e.player;
    const tagged = [];
    for (const fp of e.room.furnProps) {
      if (fp.box?._furn) { tagged.push(fp); fp.box._furn = null; }
    }
    p._lastSledgeHit = null;
    p._resolveSledgeHit({ at: p.eye, dir: p.aimDir });
    const had = !!p._lastSledgeHit?.hadFurn;
    for (const fp of tagged) fp.box._furn = fp;
    return { hadFurn: had };
  });
  note(`control: ${JSON.stringify(ctrl)}`);
  !ctrl.hadFurn
    ? pass('W1 without _furn tags a swing does not report hadFurn', 'control arm')
    : fail('W1 without _furn tags a swing does not report hadFurn', JSON.stringify(ctrl));

  // ---- B3: shatter study_w desk (HP 2.4 → a few blows)
  if (census.study && census.desks >= 1) {
    const deskSmash = await page.evaluate(() => {
      const e = window.__rrr.engine;
      const p = e.player;
      const fp = e.room.furnProps.find((f) => f.id === 'study_w.desk.0')
        ?? e.room.furnProps.find((f) => f.kind === 'desk');
      if (!fp) return { ok: false, why: 'no desk' };
      const c = fp.box.getCenter(p.pos.clone());
      const stand = 1.20;
      // Approach from the EAST so the desk chair (south of the desk) is not in the ray.
      p.pos.set(c.x + stand, e.room.floorY, c.z);
      p.vel.set(0, 0, 0);
      const yaw = Math.atan2(c.x - p.pos.x, c.z - p.pos.z);
      p.aimYaw = yaw; p.facing = yaw; p.aimPitch = -0.2;
      if (e.cam) e.cam.yaw = yaw;
      p.sledge.owned = true; p.sledge.equip();
      p.aimDecoupled = false;

      const hits = [];
      for (let i = 0; i < 8; i++) {
        p._lastSledgeHit = null;
        p._resolveSledgeHit({ at: p.eye, dir: p.aimDir });
        hits.push({
          hadFurn: !!p._lastSledgeHit?.hadFurn,
          hadPanel: !!p._lastSledgeHit?.hadPanel,
          furnId: p._lastSledgeHit?.furnId ?? null,
          stage: fp.stage,
          shattered: fp.isShattered,
        });
        if (fp.isShattered) break;
      }
      const sp = e.room.spaces.find((s) => s.id === fp.spaceId);
      const onList = sp?.colliders?.includes(fp.box) === true;
      return {
        ok: true, id: fp.id, shattered: fp.isShattered, dropped: !!fp._colDropped,
        onList, hits,
        wallUntouched: hits.every((h) => !h.hadPanel || h.hadFurn),
      };
    });
    note(`deskSmash: ${JSON.stringify(deskSmash)}`);
    if (!deskSmash?.ok) fail('B3 shatter study desk', JSON.stringify(deskSmash));
    else {
      (deskSmash.shattered && deskSmash.dropped && !deskSmash.onList)
        ? pass('B3 study desk shatters and drops collider', `${deskSmash.id} hits=${deskSmash.hits.length}`)
        : fail('B3 study desk shatters and drops collider', JSON.stringify(deskSmash));
      deskSmash.wallUntouched
        ? pass('B3 desk smash did not applyHit a wall alone', 'ok')
        : fail('B3 desk smash did not applyHit a wall alone', JSON.stringify(deskSmash.hits));
    }
    await shot?.('furn-desk-shattered');
  }

  // ---- L2: fireplace cladding takes a local dig-like hit; collider stays
  if (census.study && census.fireplaces >= 1) {
    const clad = await page.evaluate(() => {
      const e = window.__rrr.engine;
      const p = e.player;
      const fp = e.room.furnProps.find((f) => f.kind === 'fireplace');
      if (!fp?.field) return { ok: false, why: 'no cladding field' };
      const c = fp.box.getCenter(p.pos.clone());
      p.pos.set(c.x, e.room.floorY, c.z + 1.3);
      p.vel.set(0, 0, 0);
      const yaw = Math.atan2(c.x - p.pos.x, c.z - p.pos.z);
      p.aimYaw = yaw; p.facing = yaw; p.aimPitch = 0.15;
      if (e.cam) e.cam.yaw = yaw;
      p.sledge.owned = true; p.sledge.equip();
      const hits = [];
      for (let i = 0; i < 6; i++) {
        p._lastSledgeHit = null;
        p._resolveSledgeHit({ at: p.eye, dir: p.aimDir });
        hits.push({
          hadFurn: !!p._lastSledgeHit?.hadFurn,
          cladding: !!p._lastSledgeHit?.res?.cladding,
          barrier: !!p._lastSledgeHit?.res?.barrier,
          brokeThrough: !!p._lastSledgeHit?.res?.brokeThrough,
          removed: p._lastSledgeHit?.res?.removed ?? 0,
        });
      }
      const sp = e.room.spaces.find((s) => s.id === fp.spaceId);
      const onList = sp?.colliders?.includes(fp.box) === true;
      return {
        ok: true, hits, onList, dropped: !!fp._colDropped,
        fieldHits: fp.field.hits?.length ?? 0,
      };
    });
    note(`cladding: ${JSON.stringify(clad)}`);
    if (!clad?.ok) fail('L2 fireplace cladding dig', JSON.stringify(clad));
    else {
      (clad.hits.some((h) => h.hadFurn && h.cladding && h.removed > 0) && clad.onList && !clad.dropped
        && clad.hits.every((h) => !h.brokeThrough))
        ? pass('L2 fireplace chips locally and stays solid', `fieldHits=${clad.fieldHits}`)
        : fail('L2 fireplace chips locally and stays solid', JSON.stringify(clad));
    }
  }
}
