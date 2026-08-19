/**
 * PC8 — PLAY A WHOLE RUN, AND JUDGE THE BEATS.
 *
 *   MODE=run    spawn -> walk the house -> siege the live exit -> watch the BEAM reveal -> out.
 *               Logs hunter state every burst, so "the house comes to you" is observed, not
 *               assumed. Photographs the payoff frame at the stage BEFORE and AFTER the reveal.
 *   MODE=beams  the leak in question 2.1: boot a `beams` seed, walk into the exit's room and
 *               look. Does the yard exist before the player has spent anything?
 *   MODE=look   establishing shots of every room, for the DRESS_P "is it visual mush" ruling.
 *
 *   MODE=run node harness/playtest.mjs --view game.play --script harness/scenarios/pc8-play.mjs \
 *     --port 5217 --shots --q "seed=s43"
 */
import { rig, readHouse } from './pc8-lib.mjs';

const MODE = process.env.MODE ?? 'run';

const STATIONS = [
  ['gallery', -6.0, -27.5], ['gallery', 6.0, -27.5], ['gallery', 0.0, -21.0],
  ['ballroom', 0.0, -3.0], ['ballroom', -7.0, 0.5], ['ballroom', 7.0, 0.5],
  ['study_w', -8.6, -16.0], ['study_e', 8.6, -16.0],
  ['service', 0.0, -16.0], ['chapel', 7.6, -35.0],
];

export default async function pc8play(ctx) {
  const { page, note, pass, fail, shot } = ctx;
  const r = rig(ctx);
  const { step, readState, calibrate, faceAt, selfTest, allOff, travel, walkTo, turnTo, yawTo, wrap, hold } = r;

  await calibrate();
  if (await selfTest() < 0.995) { fail('driver can aim', 'self-test failed'); return; }

  const house = await readHouse(page);
  note(`seed "${house.seed}" · tells=${house.tells} · LIVE ${house.exitId} · lock ${house.lock} (start stage ${house.start})`);
  const dressed = house.rows.filter((q) => q.dress && Object.values(q.dress).some(Boolean)).length;
  note(`dressing: ${dressed}/${house.rows.length} connectors wear something · `
    + ['chain', 'seam', 'boards', 'mortar'].map((k) => `${k} ${house.rows.filter((q) => q.dress?.[k]).length}`).join(' · '));
  const live = house.rows.find((q) => q.live);
  note(`the live exit wears: ${JSON.stringify(live?.dress)} · starts at stage ${live?.stage} · blocksSight ${live?.blocksSight}`);

  // ================================================================== BEAMS LEAK
  if (MODE === 'beams') {
    const c0 = await page.evaluate(() => window.__rrr.engine.exterior.census());
    note(`exterior census at t=0: ${JSON.stringify(c0).slice(0, 400)}`);
    const spawn = await readState();
    note(`player spawns in ${spawn.place} at ${spawn.x},${spawn.z}; live exit is in room "${live.id.split('.')[1]}"`);
    // walk into the exit's room and look at the wall from a normal walking distance
    const inS = -1;
    for (const d of [10.0, 5.0]) {
      const tx = live.x + live.nx * inS * d, tz = live.z + live.nz * inS * d;
      const sp = await page.evaluate(([x, z]) => window.__rrr.engine.room.spaceAt({ x, y: 0, z })?.id ?? null, [tx, tz]);
      const alt = sp ? null : { tx: live.x - live.nx * inS * d, tz: live.z - live.nz * inS * d };
      const g = alt ?? { tx, tz };
      const gs = await page.evaluate(([x, z]) => window.__rrr.engine.room.spaceAt({ x, y: 0, z })?.id ?? null, [g.tx, g.tz]);
      const a = await travel(g.tx, g.tz, gs, `${d}m`);
      await faceAt(live.x, live.z);
      await step(14);
      await shot(`pc8-${house.seed}-beams-${d}m`);
      const c = await page.evaluate(() => window.__rrr.engine.exterior.census());
      const st = await readState();
      note(`at ${a?.d?.toFixed(1)} m off the live exit (asked ${d} m), in ${st.place}: census ${JSON.stringify(c).slice(0, 300)}`);
    }
    // ...and now a chained bay in the same room, for the comparison a player actually makes
    const chained = house.rows.find((q) => !q.live && q.state === 'chained' && q.id.split('.')[1] === live.id.split('.')[1]);
    if (chained) {
      const tx = chained.x + chained.nx * inS * 5.0, tz = chained.z + chained.nz * inS * 5.0;
      const sp = await page.evaluate(([x, z]) => window.__rrr.engine.room.spaceAt({ x, y: 0, z })?.id ?? null, [tx, tz]);
      await travel(tx, tz, sp, chained.id);
      await faceAt(chained.x, chained.z);
      await step(14);
      await shot(`pc8-${house.seed}-beams-chained-5m`);
      note(`chained comparison shot at ${chained.id}`);
    }
    await allOff();
    pass('beams leak photographed');
    return;
  }

  // ================================================================== SIGHT
  // Same station, same camera, two seeds: can you point at the live exit from across the room?
  if (MODE === 'sight') {
    for (const st of (process.env.STATIONS ?? '11.5,-26.0|4.0,-27.5|-4.8,-27.5').split('|')) {
      const [x, z] = st.split(',').map(Number);
      const sp = await page.evaluate(([x, z]) => window.__rrr.engine.room.spaceAt({ x, y: 0, z })?.id ?? null, [x, z]);
      const a = await travel(x, z, sp, st);
      await faceAt(live.x, live.z);
      await step(16);
      const q = await readState();
      const d = Math.hypot(live.x - q.x, live.z - q.z);
      await shot(`pc8-${house.seed}-sight-${st.replace(/[,.]/g, '_')}`);
      const c = await page.evaluate(() => window.__rrr.engine.exterior.census().yards.filter((y) => y.live));
      note(`station ${st}: stood ${q.x},${q.z} in ${q.place}, ${d.toFixed(1)} m from the live exit · live yard ${JSON.stringify(c)}`);
    }
    await allOff();
    pass('sight lines photographed');
    return;
  }

  // ================================================================== LOOK
  if (MODE === 'look') {
    for (const [sp, x, z] of STATIONS) {
      const a = await travel(x, z, sp, sp);
      if (!a || a.d > 3.0) { note(`could not reach ${sp} (${a?.d?.toFixed(1) ?? '?'} m short)`); continue; }
      // sweep four looks so the whole room is photographed, not one wall
      for (let k = 0; k < 4; k++) {
        const st = await readState();
        await faceAt(st.x + Math.sin(k * Math.PI / 2) * 8, st.z + Math.cos(k * Math.PI / 2) * 8, 26);
        await step(10);
        await shot(`pc8-${house.seed}-look-${sp}-${k}`);
      }
      note(`photographed ${sp} (4 looks)`);
    }
    await allOff();
    pass('look tour done');
    return;
  }

  // ================================================================== RUN
  // ⚠️ `outSign` IS READ OFF THE BUILD (`engine.exits`), NEVER GUESSED FROM THE NORMAL.
  // My first version assumed the inside was the -normal side, walked the wrong way out of an
  // opened exit and reported "nobody out" — a driver bug that reads exactly like a design
  // failure. `game.js` derives outSign as the side the owning room is NOT on.
  const inS = -(live.outSign ?? 1);
  note(`outSign ${live.outSign} -> the room side is ${inS > 0 ? '+' : '-'}normal`);
  const standX = live.x + live.nx * inS * 2.6, standZ = live.z + live.nz * inS * 2.6;
  let stationSpace = await page.evaluate(([x, z]) => window.__rrr.engine.room.spaceAt({ x, y: 0, z })?.id ?? null, [standX, standZ]);
  let sx = standX, sz = standZ;
  if (!stationSpace) {
    sx = live.x - live.nx * inS * 2.6; sz = live.z - live.nz * inS * 2.6;
    stationSpace = await page.evaluate(([x, z]) => window.__rrr.engine.room.spaceAt({ x, y: 0, z })?.id ?? null, [sx, sz]);
  }

  const t0 = (await readState()).t;
  const arrive = await travel(sx, sz, stationSpace, 'the live exit');
  const tArrive = (await readState()).t;
  note(`walked to the exit in ${(tArrive - t0).toFixed(1)} s, ${arrive?.d?.toFixed(1)} m off station, room ${(await readState()).place}`);
  await faceAt(live.x, live.z);
  await step(8);
  await shot(`pc8-${house.seed}-run-before-siege`);

  // ---- THE SIEGE -------------------------------------------------------------------------
  const trace = [];
  let firstReact = null, sawStage = new Set(), revealShot = false, preRevealShot = false;
  for (let i = 0; i < 1100; i++) {
    const s = await page.evaluate((id) => {
      const e = window.__rrr.engine, p = e.room.panels.find((q) => q.id === id);
      const pl = e.player;
      return { t: +e.run.t.toFixed(2), stage: p.state.stage, hp: +p.state.stageHealth.toFixed(0),
        blocks: p.blocksMovement(), sight: p.blocksSight(),
        hState: e.hunter.state, hAware: +(e.hunter.awareness ?? 0).toFixed(2),
        hDist: +Math.hypot(e.hunter.root.position.x - pl.pos.x, e.hunter.root.position.z - pl.pos.z).toFixed(1),
        limbs: ['shoulderR', 'shoulderL', 'hipR', 'hipL'].filter((q) => pl.rig.occupant(q) !== 'empty').length,
        hud: e.gameHud?._msgState?.()?.text ?? null };
    }, live.id);
    if (!sawStage.has(s.stage)) { sawStage.add(s.stage); trace.push(`t${s.t} stage${s.stage} hunter ${s.hState}@${s.hDist}m`); }
    if (!firstReact && s.hState !== 'PATROL') {
      firstReact = { ...s };
      note(`⚠ the hunter reacted at t=${s.t} s — ${s.hState} at ${s.hDist} m (stage ${s.stage}, blocksSight ${s.sight})`);
    }
    // the frame BEFORE the reveal, and the frame after
    if (!preRevealShot && s.stage === 2) {
      preRevealShot = true; await page.mouse.up(); await step(8);
      await shot(`pc8-${house.seed}-run-stage2-lath`); await page.mouse.down();
    }
    if (!revealShot && !s.sight) {
      revealShot = true;
      await page.mouse.up(); await step(10);
      await shot(`pc8-${house.seed}-run-THE-REVEAL`);
      note(`★ THE REVEAL: blocksSight went false at t=${s.t} s, stage ${s.stage}, hp ${s.hp}`);
      await page.mouse.down();
    }
    if (!s.blocks) break;
    const st = await readState();
    if (Math.abs(wrap(yawTo(st.x, st.z, live.x, live.z) - st.yaw)) > 0.05) {
      await page.mouse.up(); await turnTo(yawTo(st.x, st.z, live.x, live.z), st.yaw); await page.mouse.down();
    }
    if (i === 0) await page.mouse.down();
    await step(3);
    if (i % 30 === 0) note(`  t=${s.t}s stage ${s.stage} hp ${s.hp} · hunter ${s.hState} ${s.hDist} m aware ${s.hAware} · limbs ${s.limbs}`);
  }
  await page.mouse.up();
  const stOpen = await readState();
  note(`stage trace: ${trace.join(' | ')}`);
  const openInfo = await page.evaluate((id) => {
    const p = window.__rrr.engine.room.panels.find((q) => q.id === id);
    return { stage: p.state.stage, blocks: p.blocksMovement() };
  }, live.id);
  if (openInfo.blocks) { fail('the exit opened', `still blocking at stage ${openInfo.stage}`); await allOff(); return; }
  pass('the exit opened by playing', `siege ${(stOpen.t - tArrive).toFixed(1)} s`);
  await step(10);
  await shot(`pc8-${house.seed}-run-open`);

  // ---- WALK OUT --------------------------------------------------------------------------
  const outX = live.x + live.nx * live.outSign * 4.5, outZ = live.z + live.nz * live.outSign * 4.5;
  for (const goal of [[live.x + live.nx * live.outSign * 0.25, live.z + live.nz * live.outSign * 0.25], [outX, outZ]]) {
    for (let i = 0; i < 140; i++) {
      const st = await readState();
      if (st.phase !== 'EXPLORE') break;
      if (Math.hypot(goal[0] - st.x, goal[1] - st.z) < 0.6) break;
      await turnTo(yawTo(st.x, st.z, goal[0], goal[1]), st.yaw);
      await hold('KeyW', true);
      await step(2);
    }
    await hold('KeyW', false);
  }
  await allOff();
  await step(6);
  const stOut = await readState();
  const res = await page.evaluate(() => ({
    r: window.__rrr.engine.run.results(), phase: window.__rrr.engine.run.phase,
    overlay: document.getElementById('rrr-escape')?.innerText?.replace(/\s+/g, ' ').slice(0, 220) ?? null,
  }));
  await shot(`pc8-${house.seed}-run-outside`);
  note(`ended phase ${res.phase} · clock ${stOut.t.toFixed(2)} s · results ${JSON.stringify(res.r)}`);
  if (res.overlay) note(`win screen: "${res.overlay}"`);
  if (res.r.escaped.length) {
    pass('ESCAPED by playing', `t=${res.r.escaped[0].seconds.toFixed(2)} s`
      + ` (walk ${(tArrive - t0).toFixed(1)} · siege ${(stOpen.t - tArrive).toFixed(1)} · out ${(stOut.t - stOpen.t).toFixed(1)})`);
  } else fail('ESCAPED by playing', `phase ${res.phase}, nobody out`);
  note(`hunter over the whole run: ${firstReact ? `first left PATROL at t=${firstReact.t} s, ${firstReact.hState} at ${firstReact.hDist} m` : 'NEVER LEFT PATROL'}`);
}
