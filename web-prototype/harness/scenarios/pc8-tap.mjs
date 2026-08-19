/**
 * PC8 — THE TAP TEST. "Can you find the exit by some cheaper route than opening doors?"
 *
 * The design's gamble is that a closed connector gives nothing away, so the only way to learn
 * what is behind one is to pay 15-25 s for it. This asks the obvious player question instead:
 * what does ONE SECOND of trigger tell me?
 *
 *   breachable  STAGE_DEFS   stage 0 =   40 hp   -> 2 nail rounds
 *   chained     CHAINED_DEFS stage 0 = 999999 hp, damageable:false -> nothing, ever
 *   exit        EXIT_DEFS    stage 0 =  560 hp   -> 22 nail rounds
 *
 * Walks the gallery — the one room holding all three states — stands 2.6 m off each connector,
 * fires for a fixed window and records what a PLAYER can observe: the stage index (the wall
 * visibly changes material), the break-mask fraction (the crack pattern), and a screenshot.
 *
 *   ROOM=gallery FIRE=3.0 node harness/playtest.mjs --view game.play \
 *     --script harness/scenarios/pc8-tap.mjs --port 5217 --shots --q "seed=s4"
 */
import { rig, readHouse } from './pc8-lib.mjs';

const FIRE = +(process.env.FIRE ?? 3.0);      // seconds of held trigger per connector
const ROOM = process.env.ROOM ?? 'gallery';

export default async function pc8tap(ctx) {
  const { page, note, pass, fail, shot } = ctx;
  const r = rig(ctx);
  const { step, readState, calibrate, faceAt, selfTest, allOff, travel } = r;

  await calibrate();
  if (await selfTest() < 0.995) { fail('driver can aim', 'self-test failed'); return; }
  pass('driver can aim');

  const house = await readHouse(page);
  note(`seed "${house.seed}" · tells=${house.tells} · LIVE ${house.exitId} · lock ${house.lock} (start stage ${house.start})`);

  const inRoom = house.rows.filter((q) => q.id.includes(ROOM) || q.id.startsWith('p.gal') || q.id === 'p.chapel');
  note(`${inRoom.length} connectors in reach: ${inRoom.map((q) => `${q.id}[${q.state}]`).join(' ')}`);

  const table = [];
  for (const c of inRoom) {
    // stand 2.6 m off the face, on the room side (the gallery side is -normal for exit sites
    // and either side for interior panels; pick whichever lands in a space).
    let station = null;
    for (const s of [1, -1]) {
      const tx = c.x + c.nx * s * 2.6, tz = c.z + c.nz * s * 2.6;
      const sp = await page.evaluate(([x, z]) => window.__rrr.engine.room.spaceAt({ x, y: 0, z })?.id ?? null, [tx, tz]);
      if (sp === 'gallery' || (!station && sp)) station = { tx, tz, sp };
      if (sp === 'gallery') break;
    }
    if (!station) { note(`${c.id}: no station`); continue; }

    const arrived = await travel(station.tx, station.tz, station.sp, c.id);
    if (!arrived || arrived.d > 2.2) { note(`${c.id}: could not reach station (${arrived?.d?.toFixed(1) ?? '?'} m short) — SKIPPED`); continue; }
    await faceAt(c.x, c.z);
    await step(6);

    const before = await page.evaluate((id) => {
      const p = window.__rrr.engine.room.panels.find((q) => q.id === id);
      return { stage: p.state.stage, hp: +p.state.stageHealth.toFixed(1), max: p.state.def?.health ?? null };
    }, c.id);

    await shot(`pc8-${house.seed}-${c.id.replace(/\./g, '_')}-before`);

    // hold the trigger for FIRE seconds of GAME time, sampling
    const samples = [];
    const t0 = (await readState()).t;
    await page.mouse.down();
    for (let i = 0; i < 200; i++) {
      const s = await page.evaluate((id) => {
        const e = window.__rrr.engine, p = e.room.panels.find((q) => q.id === id);
        return { t: +e.run.t.toFixed(2), stage: p.state.stage,
          hp: +p.state.stageHealth.toFixed(1), max: p.state.def?.health ?? 0,
          frac: p.state.def?.health ? +(1 - p.state.stageHealth / p.state.def.health).toFixed(3) : 0,
          blocks: p.blocksMovement(), sight: p.blocksSight() };
      }, c.id);
      samples.push(s);
      if (s.t - t0 >= FIRE || !s.blocks) break;
      await step(2);
    }
    await page.mouse.up();
    await step(2);
    const last = samples[samples.length - 1];
    const firstChange = samples.find((s) => s.stage !== before.stage || s.frac > 0.02);
    const dt = (s) => (s.t - t0).toFixed(2);

    await shot(`pc8-${house.seed}-${c.id.replace(/\./g, '_')}-after${FIRE}s`);

    const row = {
      id: c.id, state: c.state, live: c.live,
      stage0: before.stage, hp0: before.hp,
      firstVisibleAt: firstChange ? +dt(firstChange) : null,
      stageAt: last.stage, fracAt: last.frac, opened: !last.blocks, held: +dt(last),
    };
    table.push(row);
    note(`${c.id.padEnd(18)} ${String(c.state).padEnd(11)}${c.live ? 'LIVE ' : '     '}`
      + `stage ${before.stage}->${last.stage} · frac ${last.frac.toFixed(3)} after ${dt(last)}s`
      + ` · first visible change at ${row.firstVisibleAt == null ? 'NEVER' : row.firstVisibleAt + 's'}`);
  }

  note('--- THE TAP TEST TABLE ---');
  note('id / authored state / stage change in ' + FIRE + ' s / damage fraction / first visible change');
  for (const t of table) {
    note(`  ${t.id.padEnd(18)} ${t.state.padEnd(11)} ${t.live ? 'LIVE' : '    '} `
      + `${t.stage0}->${t.stageAt}  frac ${String(t.fracAt).padEnd(6)} first@${t.firstVisibleAt ?? 'never'}`);
  }

  // the ruling: are the three states separable inside FIRE seconds?
  const byState = {};
  for (const t of table) (byState[t.state] ??= []).push(t);
  const sep = [];
  for (const [k, v] of Object.entries(byState)) {
    const fr = v.map((q) => q.fracAt);
    sep.push(`${k}: frac ${Math.min(...fr).toFixed(3)}..${Math.max(...fr).toFixed(3)} (n=${v.length})`);
  }
  note(`separation after ${FIRE}s of trigger — ${sep.join(' · ')}`);
  await allOff();
  pass('tap test completed', `${table.length} connectors`);
}
